import { EQUIPMENT, isCameraLike, levelMult } from '../config/equipment';
import type { Device, MapData } from '../types';
import { cellIndexOf, cellX, fenceNorth, fenceWorld, idx, inBounds } from '../world/grid';
import { cameraSees, computeLit, type Env, motionSees, perimeterCovers, ptzSweepFov } from './vision';

// Kapsama haritası: yerleştirilen cihazların GERÇEKTEN görebildiği hücrelerin birleşimi.
// Kapsama yüzdesi cihaz sayısından değil bu birleşimden hesaplanır.

export interface ZoneCoverage {
  name: string;
  pct: number;
  critical: boolean;
  cells: number;
}

export interface CoverageResult {
  cam: Uint8Array; // kaç kamera görüyor
  sensor: Uint8Array; // bit0 hareket, bit1 çevre
  lit: Uint8Array;
  coveragePct: number; // kamera veya sensör
  cameraPct: number;
  criticalPct: number;
  riskWeightedPct: number;
  zones: ZoneCoverage[];
  version: number;
}

let version = 0;

export function makeEnv(night: boolean, weather: Env['weather'], lit: Uint8Array): Env {
  return { night, weather, lit, boosts: [], time: 0 };
}

export function countsAsMonitorCell(map: MapData, c: number) {
  return map.inside[c] === 1 && map.nav[c] === 0;
}

/**
 * Fuar modu: hangi çit/kapı hücreleri kamera kapsamasında? (hücre + hemen dışındaki iki yaklaşma noktası)
 * Hırsız ve hayvanlar kapsanmayan bölümden girmeyi tercih eder.
 */
/** çit kesen hırsızın görünür yüksekliği (çömelmiş) */
export const FENCE_CUT_H = 0.6;
/** kapsama ölçütünde koni kenar payı (derece): koninin tam kenarındaki hücre "kapsanıyor" sayılmaz */
export const FENCE_FOV_MARGIN = 8;
/**
 * Hırsızın çiti keserken durduğu nokta: çit hücresinin dış kenarı (hücreye dışarıdan adım attığı yer).
 * Kapsama bu noktaya göre hesaplanır; böylece "kapsanan" çitte kesen hırsız gerçekten kamerada görünür.
 */
export function fenceCutPoint(map: MapData, x: number, z: number): [number, number] {
  const L = fenceWorld(map), zN = fenceNorth(map);
  const ox = Math.abs(x) >= L - 0.6 ? Math.sign(x) : 0, oz = z >= L - 0.6 ? 1 : z <= zN + 0.6 ? -1 : 0;
  return [x + ox * 0.45, z + oz * 0.45];
}

export function computeFenceCovered(map: MapData, env: Env, devices: Device[]): Uint8Array {
  const cov = new Uint8Array(map.N * map.N);
  const cams = devices.filter((d) => isCameraLike(d.type));
  if (!cams.length) return cov;
  for (let j = 0; j < map.N; j++)
    for (let i = 0; i < map.N; i++) {
      const c = j * map.N + i;
      if (map.nav[c] !== 2 && map.nav[c] !== 3) continue;
      const x = cellX(map, i), z = cellX(map, j);
      // hırsız çiti bu hücrenin dış kenarında çömelerek keser: kapsama = çit hattı ve kesme noktası diz hizasında görülüyor mu
      const [px, pz] = fenceCutPoint(map, x, z);
      for (const d of cams) {
        const spec = EQUIPMENT[d.type];
        if (Math.hypot(d.x - x, d.z - z) > spec.range * levelMult(d.level) + 1) continue;
        const fov = (d.type === 'ptzCam' ? ptzSweepFov(d) : spec.fov) - FENCE_FOV_MARGIN;
        if (cameraSees(map, env, d, d.yaw, fov, x, z, FENCE_CUT_H).seen && cameraSees(map, env, d, d.yaw, fov, px, pz, FENCE_CUT_H).seen) {
          cov[c] = 1;
          break;
        }
      }
    }
  return cov;
}

/** fuar modu: çit üstündeki kameranın hemen dış tarafı — hırsızın sabotaj için durduğu nokta */
export function sabotageSpot(map: MapData, d: { x: number; z: number }): { x: number; z: number } {
  const L = fenceWorld(map), zN = fenceNorth(map);
  const ox = Math.abs(d.x) >= L - 0.6 ? Math.sign(d.x) : 0;
  const oz = d.z >= L - 0.6 ? 1 : d.z <= zN + 0.6 ? -1 : 0;
  return { x: d.x + ox * 1.4, z: d.z + oz * 1.4 };
}
export function isFenceMounted(map: MapData, d: { x: number; z: number }) {
  const i = Math.floor(d.x + map.N / 2), j = Math.floor(d.z + map.N / 2);
  if (i < 0 || j < 0 || i >= map.N || j >= map.N) return false;
  return map.nav[j * map.N + i] === 2;
}
/** bu noktayı (diz hizası) gören kamera var mı? */
export function spotWatched(map: MapData, env: Env, cams: Device[], x: number, z: number): boolean {
  for (const c of cams) {
    const spec = EQUIPMENT[c.type];
    if (Math.hypot(c.x - x, c.z - z) > spec.range * levelMult(c.level) + 1) continue;
    const fov = c.type === 'ptzCam' ? ptzSweepFov(c) : spec.fov;
    if (cameraSees(map, env, c, c.yaw, fov, x, z, 0.9).seen) return true;
  }
  return false;
}
/**
 * fuar modu: kamera başka bir kamera tarafından izleniyor mu?
 * Ölçüt ekrandaki koniyle aynı: kameranın direği (konumu) başka bir kameranın görüş konisinin içinde
 * (menzil + görüş hattı, 1 m yükseklik — koni çizimi de bu yüksekliği kullanır).
 */
export function camWatched(map: MapData, env: Env, cams: Device[], d: Device): boolean {
  for (const c of cams) {
    if (c === d || c.id === d.id || !isCameraLike(c.type)) continue;
    const spec = EQUIPMENT[c.type];
    if (Math.hypot(c.x - d.x, c.z - d.z) > spec.range * levelMult(c.level) + 1) continue;
    const fov = c.type === 'ptzCam' ? ptzSweepFov(c) : spec.fov;
    if (cameraSees(map, env, c, c.yaw, fov, d.x, d.z, 1.0).seen) return true;
  }
  return false;
}
/** çit halkası: çevre boyunca sıralı hücre indeksleri (kuzey → doğu → güney → batı) */
export function fenceRing(map: MapData): number[] {
  const { N, fMin, fMax } = map;
  const jN = cellIndexOf(map, fenceNorth(map)); // kuzey hattı (HES'te baraj eteği)
  const ring: number[] = [];
  for (let k = fMin; k < fMax; k++) ring.push(jN * N + k);
  for (let k = jN; k < fMax; k++) ring.push(k * N + fMax);
  for (let k = fMax; k > fMin; k--) ring.push(fMax * N + k);
  for (let k = fMax; k > jN; k--) ring.push(k * N + fMin);
  return ring;
}
/**
 * fuar modu (gevşek ölçüt): kameranın konisi çit üstünde komşu bir kameranın konisiyle kesişiyorsa
 * (aradaki çit kesintisiz kapsanıyorsa) iki kamera birbirini "görüyor" sayılır.
 * Çit halkasında kameradan iki yöne yürünür; kapsanmayan hücreye rastlamadan başka bir kameraya ulaşılırsa izleniyor.
 */
export function fenceConnected(map: MapData, covered: Uint8Array, cams: Device[], d: Device): boolean {
  const ring = fenceRing(map);
  const N = map.N;
  const cellOf = (c: Device) => Math.floor(c.x + N / 2) + Math.floor(c.z + N / 2) * N;
  const camCells = new Set(cams.filter((c) => c.id !== d.id && isFenceMounted(map, c)).map(cellOf));
  const start = ring.indexOf(cellOf(d));
  if (start < 0) return false;
  for (const dir of [1, -1]) {
    for (let k = 1; k < ring.length; k++) {
      const c = ring[(start + dir * k + ring.length) % ring.length];
      if (camCells.has(c)) return true;
      const fence = map.nav[c] === 2 || map.nav[c] === 3;
      if (!fence || !covered[c]) break;
    }
  }
  return false;
}
/** fuar modu: başka hiçbir kameranın görmediği çit kameraları (sabotaja açık) */
export function unwatchedFenceCams(map: MapData, env: Env, devices: Device[], covered?: Uint8Array): Device[] {
  const cams = devices.filter((d) => isCameraLike(d.type));
  const cov = covered ?? computeFenceCovered(map, env, cams);
  return cams.filter((d) => isFenceMounted(map, d) && !camWatched(map, env, cams, d) && !fenceConnected(map, cov, cams, d));
}

/** fuar modu: herhangi bir kameranın gördüğü hücreler (akıllı hırsız rotası için) */
export function cameraSeenCells(map: MapData, env: Env, devices: Device[]): Uint8Array {
  const seen = new Uint8Array(map.N * map.N);
  for (const d of devices) {
    if (!isCameraLike(d.type)) continue;
    const spec = EQUIPMENT[d.type];
    const fov = d.type === 'ptzCam' ? ptzSweepFov(d) : spec.fov;
    const R = spec.range * levelMult(d.level);
    const i0 = cellIndexOf(map, d.x - R), i1 = cellIndexOf(map, d.x + R);
    const j0 = cellIndexOf(map, d.z - R), j1 = cellIndexOf(map, d.z + R);
    for (let j = j0; j <= j1; j++)
      for (let i = i0; i <= i1; i++) {
        if (!inBounds(map, i, j)) continue;
        const c = idx(map, i, j);
        if (seen[c] || map.nav[c] === 1) continue;
        if (cameraSees(map, env, d, d.yaw, fov, cellX(map, i), cellX(map, j), 1.0).seen) seen[c] = 1;
      }
  }
  return seen;
}

/** çit hattı kapsama yüzdesi (fuar modu HUD) */
export function fenceCoveragePct(map: MapData, covered: Uint8Array): number {
  let n = 0, t = 0;
  for (let c = 0; c < map.N * map.N; c++) {
    if (map.nav[c] !== 2 && map.nav[c] !== 3) continue;
    t++;
    n += covered[c];
  }
  return t ? Math.round((100 * n) / t) : 0;
}

export function computeCoverage(map: MapData, devices: Device[], night: boolean, weather: Env['weather']): CoverageResult {
  const n = map.N * map.N;
  const cam = new Uint8Array(n);
  const sensor = new Uint8Array(n);
  const lit = computeLit(map, devices);
  const env = makeEnv(night, weather, lit);

  for (const d of devices) {
    const spec = EQUIPMENT[d.type];
    if (isCameraLike(d.type)) {
      const fov = d.type === 'ptzCam' ? ptzSweepFov(d) : spec.fov;
      const R = spec.range * levelMult(d.level);
      const i0 = cellIndexOf(map, d.x - R), i1 = cellIndexOf(map, d.x + R);
      const j0 = cellIndexOf(map, d.z - R), j1 = cellIndexOf(map, d.z + R);
      for (let j = j0; j <= j1; j++)
        for (let i = i0; i <= i1; i++) {
          if (!inBounds(map, i, j)) continue;
          const c = idx(map, i, j);
          if (map.nav[c] === 1) continue;
          const x = cellX(map, i), z = cellX(map, j);
          if (cameraSees(map, env, d, d.yaw, fov, x, z, 1.0).seen && cam[c] < 255) cam[c]++;
        }
    } else if (d.type === 'motion') {
      const R = spec.range * levelMult(d.level);
      const i0 = cellIndexOf(map, d.x - R), i1 = cellIndexOf(map, d.x + R);
      const j0 = cellIndexOf(map, d.z - R), j1 = cellIndexOf(map, d.z + R);
      for (let j = j0; j <= j1; j++)
        for (let i = i0; i <= i1; i++) {
          if (!inBounds(map, i, j)) continue;
          const c = idx(map, i, j);
          if (map.nav[c] === 1) continue;
          if (motionSees(map, d, cellX(map, i), cellX(map, j), 0.7)) sensor[c] |= 1;
        }
    } else if (d.type === 'perimeter') {
      for (let j = 0; j < map.N; j++)
        for (let i = 0; i < map.N; i++) {
          const c = idx(map, i, j);
          if (map.nav[c] === 1) continue;
          if (perimeterCovers(map, d, cellX(map, i), cellX(map, j))) sensor[c] |= 2;
        }
    }
  }

  // istatistikler
  let tot = 0, cov = 0, camCov = 0, crit = 0, critCov = 0, rw = 0, rwCov = 0;
  const critMask = new Uint8Array(n);
  for (const z of map.zones) {
    if (!z.critical) continue;
    forZone(map, z, (c) => (critMask[c] = 1));
  }
  for (let c = 0; c < n; c++) {
    if (!countsAsMonitorCell(map, c)) continue;
    tot++;
    const covered = cam[c] > 0 || sensor[c] > 0;
    if (covered) cov++;
    if (cam[c] > 0) camCov++;
    const w = 1 + map.risk[c];
    rw += w;
    if (cam[c] > 0) rwCov += w;
    else if (sensor[c] > 0) rwCov += w * 0.5;
    if (critMask[c]) {
      crit++;
      if (cam[c] > 0) critCov++;
      else if (sensor[c] > 0) critCov += 0.5;
    }
  }
  const zones: ZoneCoverage[] = map.zones.map((z) => {
    let t = 0, cv = 0;
    forZone(map, z, (c) => {
      if (!countsAsMonitorCell(map, c)) return;
      t++;
      if (cam[c] > 0) cv++;
      else if (sensor[c] > 0) cv += 0.5;
    });
    return { name: z.name, pct: t ? (cv / t) * 100 : 0, critical: !!z.critical, cells: t };
  });

  return {
    cam,
    sensor,
    lit,
    coveragePct: tot ? (cov / tot) * 100 : 0,
    cameraPct: tot ? (camCov / tot) * 100 : 0,
    criticalPct: crit ? (critCov / crit) * 100 : 0,
    riskWeightedPct: rw ? (rwCov / rw) * 100 : 0,
    zones,
    version: ++version,
  };
}

export function forZone(map: MapData, z: { x0: number; z0: number; x1: number; z1: number }, fn: (c: number) => void) {
  const i0 = Math.max(0, cellIndexOf(map, z.x0)), i1 = Math.min(map.N - 1, cellIndexOf(map, z.x1 - 0.01));
  const j0 = Math.max(0, cellIndexOf(map, z.z0)), j1 = Math.min(map.N - 1, cellIndexOf(map, z.z1 - 0.01));
  for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) fn(idx(map, i, j));
}

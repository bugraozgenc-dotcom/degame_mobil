import type { BuildingDef, CriticalAsset, Gate, MapData, MapId, SpawnPoint, Zone } from '../types';
import { cellX, distToSegment, gauss, idx, mulberry32, nearestWalkable, smoothstep } from './grid';

// TerrainManager'ın veri katmanı: her harita aynı MapData yapısını üretir.
// Görüş hesabı, navigasyon, risk ve render hepsi bu tek dünyayı paylaşır.

class Builder {
  N: number;
  fMin: number;
  fMax: number;
  obsType: Uint8Array;
  obsH: Float32Array;
  nav: Uint8Array;
  road: Uint8Array;
  risk: Uint8Array;
  inside: Uint8Array;
  heightAt: (x: number, z: number) => number;

  /** zorluk büyütmesi: çit her yönde bu kadar hücre dışa alınır (harita büyür) */
  grow: number;
  constructor(N: number, fMin: number, heightAt: (x: number, z: number) => number, grow = 0) {
    this.grow = grow;
    N += grow * 2;
    this.N = N;
    this.fMin = fMin;
    this.fMax = N - 1 - fMin;
    const n = N * N;
    this.obsType = new Uint8Array(n);
    this.obsH = new Float32Array(n);
    this.nav = new Uint8Array(n);
    this.road = new Uint8Array(n);
    this.risk = new Uint8Array(n);
    this.inside = new Uint8Array(n);
    this.heightAt = heightAt;
    for (let j = 0; j < N; j++)
      for (let i = 0; i < N; i++) {
        if (i > this.fMin && i < this.fMax && j > this.fMin && j < this.fMax) this.inside[j * N + i] = 1;
      }
  }
  cx(i: number) {
    return i - this.N / 2 + 0.5;
  }
  ci(x: number) {
    return Math.floor(x + this.N / 2);
  }
  forRect(x0: number, z0: number, x1: number, z1: number, fn: (i: number, j: number, c: number) => void) {
    const i0 = Math.max(0, this.ci(x0));
    const i1 = Math.min(this.N - 1, this.ci(x1));
    const j0 = Math.max(0, this.ci(z0));
    const j1 = Math.min(this.N - 1, this.ci(z1));
    for (let j = j0; j <= j1; j++)
      for (let i = i0; i <= i1; i++) {
        const x = this.cx(i);
        const z = this.cx(j);
        if (x >= x0 && x < x1 && z >= z0 && z < z1) fn(i, j, j * this.N + i);
      }
  }
  forAll(fn: (i: number, j: number, c: number, x: number, z: number) => void) {
    for (let j = 0; j < this.N; j++) for (let i = 0; i < this.N; i++) fn(i, j, j * this.N + i, this.cx(i), this.cx(j));
  }
  obstacle(x0: number, z0: number, x1: number, z1: number, type: number, h: number, blockNav = true) {
    this.forRect(x0, z0, x1, z1, (_i, _j, c) => {
      this.obsType[c] = type;
      this.obsH[c] = Math.max(this.obsH[c], h);
      if (blockNav) this.nav[c] = 1;
    });
  }
  fence() {
    const { N, fMin, fMax } = this;
    for (let k = fMin; k <= fMax; k++) {
      for (const [i, j] of [
        [k, fMin],
        [k, fMax],
        [fMin, k],
        [fMax, k],
      ]) {
        const c = j * N + i;
        this.nav[c] = 2;
        this.obsType[c] = 5;
        this.obsH[c] = 0; // tel çit görüşü engellemez
      }
    }
  }
  roadPolyline(pts: [number, number][], width: number, kind: number) {
    this.forAll((_i, _j, c, x, z) => {
      for (let k = 0; k < pts.length - 1; k++) {
        if (distToSegment(x, z, pts[k][0], pts[k][1], pts[k + 1][0], pts[k + 1][1]) <= width / 2) {
          if (this.road[c] === 0 || kind === 1) this.road[c] = kind;
          break;
        }
      }
    });
  }
  free(c: number) {
    return this.nav[c] === 0 && this.obsType[c] === 0 && this.road[c] === 0;
  }
}

function makeGate(b: Builder, id: string, name: string, side: 'N' | 'S' | 'E' | 'W', center: number, width: number, main: boolean): Gate {
  const cells: number[] = [];
  const lim = b.cx(b.fMax);
  const half = width / 2;
  let gx = 0,
    gz = 0,
    ox = 0,
    oz = 0;
  let axis: 'x' | 'z' = 'x';
  for (let k = b.fMin; k <= b.fMax; k++) {
    const v = b.cx(k);
    if (v < center - half || v > center + half) continue;
    let i = k,
      j = k;
    if (side === 'S') j = b.fMax;
    if (side === 'N') j = b.fMin;
    if (side === 'E') i = b.fMax;
    if (side === 'W') i = b.fMin;
    const c = j * b.N + i;
    b.nav[c] = 3;
    cells.push(c);
  }
  if (side === 'S') {
    gx = center; gz = lim; ox = center; oz = lim + 6; axis = 'x';
  } else if (side === 'N') {
    gx = center; gz = -lim; ox = center; oz = -lim - 6; axis = 'x';
  } else if (side === 'E') {
    gx = lim; gz = center; ox = lim + 6; oz = center; axis = 'z';
  } else {
    gx = -lim; gz = center; ox = -lim - 6; oz = center; axis = 'z';
  }
  return { id, name, cells, x: gx, z: gz, axis, main, outsideX: ox, outsideZ: oz };
}

export interface MapOpts {
  /** RES: türbin sayısı (6 = dağınık, zor) */
  turbines?: number;
  /** fuar modu: çitin iki yanındaki ağaçları seyrekleştir, sınır görünsün */
  expo?: boolean;
}

/** Fuar modu bandı: çit hattına bu mesafedeki ağaçlar seyrekleşir */
export const EXPO_TREE_BAND = 9;
export const EXPO_TREE_CLEAR = 3; // bu kadar yakın ağaç hiç kalmaz
export const EXPO_TREE_KEEP = 0.18; // bant içinde kalan ağaç oranı

/**
 * Fuar modu: çitin iki yanındaki ağaçları seyrekleştirir (≈%18 kalır, 3 m içinde hiç kalmaz),
 * görüş/geçiş engellerini kalan ağaçlara göre yeniden işler. Çalılar ve binalar değişmez.
 */
function thinFenceTrees(src: MapData): MapData {
  const N = src.N;
  const L = cellX(src, src.fMax);
  const band = (x: number, z: number) => Math.abs(Math.max(Math.abs(x), Math.abs(z)) - L);
  const rnd = mulberry32(4049 + N);
  const trees = src.trees.filter((t) => {
    const d = band(t.x, t.z);
    if (d >= EXPO_TREE_BAND) return true;
    if (d < EXPO_TREE_CLEAR) return false;
    return rnd() < EXPO_TREE_KEEP;
  });
  const obsType = src.obsType.slice();
  const obsH = src.obsH.slice();
  const nav = src.nav.slice();
  const reach = EXPO_TREE_BAND + 1.5;
  // bant içindeki ağaç engellerini temizle
  for (let c = 0; c < N * N; c++) {
    if (obsType[c] !== 3) continue;
    const x = cellX(src, c % N), z = cellX(src, Math.floor(c / N));
    if (band(x, z) >= reach) continue;
    obsType[c] = 0;
    obsH[c] = 0;
    if (nav[c] === 1) nav[c] = 0;
  }
  // kalan ağaçları (bant kenarı dahil) yeniden işle
  const at = (x: number) => Math.floor(x + N / 2);
  for (const t of trees) {
    if (band(t.x, t.z) >= reach + 1.5) continue;
    const i = at(t.x), j = at(t.z);
    if (i < 1 || j < 1 || i >= N - 1 || j >= N - 1) continue;
    const c = j * N + i;
    if (obsType[c] === 0 || obsType[c] === 3) {
      obsType[c] = 3;
      obsH[c] = Math.max(obsH[c], 4.8 * t.s);
      if (nav[c] === 0) nav[c] = 1;
    }
    for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const cc = (j + dj) * N + (i + di);
      if (obsType[cc] === 0) {
        obsType[cc] = 3;
        obsH[cc] = 4.2 * t.s;
      }
    }
  }
  return { ...src, expo: true, trees, obsType, obsH, nav };
}

/** Büyütülmüş haritada çit ile eski sınır arasındaki yeni bant: dış tarafa ağaç/çalı, iç tarafa seyrek çalı (kör nokta adayları) */
function growFill(b: Builder, rnd: () => number, trees: MapData['trees'], bushes: MapData['bushes'], fenceR: number) {
  if (b.grow <= 0) return;
  const half = b.N / 2;
  const tries = Math.round(b.N * b.N * 0.12);
  for (let n = 0; n < tries; n++) {
    const x = (rnd() - 0.5) * (b.N - 2), z = (rnd() - 0.5) * (b.N - 2);
    const m = Math.max(Math.abs(x), Math.abs(z));
    if (m < fenceR - b.grow - 2 || m > half - 1.5) continue; // yalnızca yeni bant
    const i = b.ci(x), j = b.ci(z);
    if (i < 1 || j < 1 || i >= b.N - 1 || j >= b.N - 1) continue;
    const c = idx(b, i, j);
    if (!b.free(c)) continue;
    if (Math.abs(m - fenceR) < 1.6) continue;
    if (b.inside[c]) {
      if (rnd() < 0.08) {
        const sc = 0.9 + rnd() * 0.5;
        bushes.push({ x: b.cx(i), z: b.cx(j), s: sc });
        b.obsType[c] = 4;
        b.obsH[c] = 1.25 * sc;
      }
      continue;
    }
    if (rnd() < 0.55) {
      const sc = 0.8 + rnd() * 0.6;
      trees.push({ x: b.cx(i) + (rnd() - 0.5) * 0.4, z: b.cx(j) + (rnd() - 0.5) * 0.4, s: sc, kind: rnd() < 0.5 ? 0 : 1 });
      b.obstacle(b.cx(i) - 0.5, b.cx(j) - 0.5, b.cx(i) + 0.5, b.cx(j) + 0.5, 3, 4.8 * sc);
    } else if (rnd() < 0.3) {
      const sc = 0.8 + rnd() * 0.5;
      bushes.push({ x: b.cx(i), z: b.cx(j), s: sc });
      b.obsType[c] = 4;
      b.obsH[c] = 1.25 * sc;
    }
  }
}

function finalize(
  b: Builder,
  base: Omit<MapData, 'N' | 'fMin' | 'fMax' | 'heightAt' | 'obsType' | 'obsH' | 'nav' | 'road' | 'risk' | 'inside'>
): MapData {
  const map: MapData = {
    ...base,
    N: b.N,
    fMin: b.fMin,
    fMax: b.fMax,
    heightAt: b.heightAt,
    obsType: b.obsType,
    obsH: b.obsH,
    nav: b.nav,
    road: b.road,
    risk: b.risk,
    inside: b.inside,
  };
  // varlık yaklaşma noktaları
  for (const a of map.assets) {
    const p = nearestWalkable(map, a.ax, a.az, true);
    a.ax = p.x;
    a.az = p.z;
  }
  if (b.grow > 0) {
    const L = b.cx(b.fMax);
    // personel doğum noktaları çitin dışında kalsın
    for (const sp of map.staffSpawns) {
      if (Math.abs(sp.x) > L - b.grow - 1) sp.x = Math.sign(sp.x) * (L + 8.5);
      if (Math.abs(sp.z) > L - b.grow - 1) sp.z = Math.sign(sp.z) * (L + 8.5);
    }
    // çit hattı bölgeleri yeni çite taşınsın
    for (const zn of map.zones) {
      if (!/çit hattı/.test(zn.name)) continue;
      if (zn.x0 < -15 && zn.x1 < 0) { zn.x0 -= b.grow; zn.x1 -= b.grow; }
      if (zn.x1 > 15 && zn.x0 > 0) { zn.x0 += b.grow; zn.x1 += b.grow; }
      if (zn.z0 < -15 && zn.z1 < 0) { zn.z0 -= b.grow; zn.z1 -= b.grow; }
      if (zn.z1 > 15 && zn.z0 > 0) { zn.z0 += b.grow; zn.z1 += b.grow; }
      if (zn.x0 < -15 && zn.x1 > 15) { zn.x0 -= b.grow; zn.x1 += b.grow; }
      if (zn.z0 < -15 && zn.z1 > 15) { zn.z0 -= b.grow; zn.z1 += b.grow; }
    }
  }
  return map;
}

function spawnRing(b: Builder, dist: number, step: number, weightFn: (x: number, z: number, side: SpawnPoint['side']) => number): SpawnPoint[] {
  const out: SpawnPoint[] = [];
  const lim = b.cx(b.fMax) - 2;
  for (let t = -lim; t <= lim; t += step) {
    const pts: [number, number, SpawnPoint['side']][] = [
      [t, -dist, 'N'],
      [t, dist, 'S'],
      [dist, t, 'E'],
      [-dist, t, 'W'],
    ];
    for (const [x, z, side] of pts) {
      const c = idx(b, b.ci(x), b.ci(z));
      if (b.nav[c] !== 0) continue;
      const w = weightFn(x, z, side);
      if (w > 0) out.push({ x, z, weight: w, side });
    }
  }
  return out;
}

function addRisk(b: Builder, fn: (x: number, z: number, c: number) => number) {
  b.forAll((_i, _j, c, x, z) => {
    if (!b.inside[c] && b.nav[c] !== 2 && b.nav[c] !== 3) return;
    const r = fn(x, z, c);
    if (r > b.risk[c]) b.risk[c] = Math.min(3, r);
  });
}

// ───────────────────────────── GES ─────────────────────────────
export function buildGES(grow = 0, opts: MapOpts = {}): MapData {
  const rnd = mulberry32(1337);
  const heightAt = (x: number, z: number) => {
    const d = Math.max(Math.abs(x), Math.abs(z)) - 27.5;
    const ramp = smoothstep(0, 7, d);
    let h =
      1.1 +
      0.9 * Math.sin(x * 0.21 + 1.3) * Math.cos(z * 0.17) +
      3.2 * gauss(x, z, 33, -31, 6) +
      2.4 * gauss(x, z, -33, -24, 6) +
      1.8 * gauss(x, z, 30, 26, 5);
    // ana yol düz kalsın
    if (Math.abs(x) < 4 && z > 0) h *= 0.15;
    if (Math.abs(z) < 4 && x > 0) h *= 0.15;
    return Math.max(0, h * ramp);
  };
  const b = new Builder(72, 10, heightAt, grow);

  // Yollar
  b.forAll((_i, _j, c, x, z) => {
    const m = Math.max(Math.abs(x), Math.abs(z));
    if (b.inside[c] && m >= 22.5 + grow) b.road[c] = 2; // çevre servis yolu
    if (Math.abs(x) <= 1.6 && z > -24.5) b.road[c] = 1; // ana yol (dışarıya uzanır)
    if (Math.abs(z) <= 1.6 && x > -24.5) b.road[c] = 1; // çapraz + doğu yol
  });
  // otopark
  b.forRect(-13.6, 16, -10, 22, (_i, _j, c) => (b.road[c] = 2));

  const buildings: BuildingDef[] = [
    { kind: 'control', name: 'Kontrol Binası', x: -17.5, z: 19, w: 7, d: 4, h: 4.2 },
    { kind: 'depot', name: 'Malzeme Deposu', x: -7.5, z: 19.5, w: 4, d: 3, h: 3 },
    { kind: 'trafo', name: 'Ana Trafo', x: 15.5, z: 19.5, w: 3, d: 3, h: 3.6 },
    { kind: 'trafo', name: 'Yardımcı Trafo', x: 19.5, z: 19.5, w: 2, d: 3, h: 3 },
    { kind: 'inverter', name: 'İnverter İstasyonu 1', x: -12, z: -12, w: 3, d: 2, h: 2.6 },
    { kind: 'inverter', name: 'İnverter İstasyonu 2', x: 12, z: -12, w: 3, d: 2, h: 2.6 },
    { kind: 'inverter', name: 'İnverter İstasyonu 3', x: -12, z: 8, w: 3, d: 2, h: 2.6 },
    { kind: 'inverter', name: 'İnverter İstasyonu 4', x: 12, z: 8, w: 3, d: 2, h: 2.6 },
  ];
  for (const bd of buildings) b.obstacle(bd.x - bd.w / 2, bd.z - bd.d / 2, bd.x + bd.w / 2, bd.z + bd.d / 2, 1, bd.h);

  // Güneş paneli sıraları
  const panels: { x: number; z: number }[] = [];
  const fields = [
    { xa: -20.5, xb: -3.5, za: -20.5, zb: -3.5 },
    { xa: 3.5, xb: 20.5, za: -20.5, zb: -3.5 },
    { xa: -20.5, xb: -3.5, za: 3.5, zb: 13.5 },
    { xa: 3.5, xb: 20.5, za: 3.5, zb: 13.5 },
  ];
  for (const f of fields) {
    for (let z = f.za; z <= f.zb; z += 3) {
      let k = 0;
      for (let x = f.xa; x <= f.xb; x += 1, k++) {
        if (k % 9 === 8) continue; // geçiş boşluğu
        const c = idx(b, b.ci(x), b.ci(z));
        if (b.obsType[c] !== 0) continue;
        // inverter çevresinde boşluk
        if (buildings.some((bd) => bd.kind === 'inverter' && Math.abs(x - bd.x) < bd.w / 2 + 1 && Math.abs(z - bd.z) < bd.d / 2 + 1)) continue;
        panels.push({ x, z });
        b.obsType[c] = 2;
        b.obsH[c] = 1.35;
        b.nav[c] = 1;
      }
    }
  }

  // Bitki örtüsü
  const trees: MapData['trees'] = [];
  const bushes: MapData['bushes'] = [];
  const rocks: MapData['rocks'] = [];
  const tryTree = (x: number, z: number, s: number, kind = 0) => {
    const i = b.ci(x), j = b.ci(z);
    if (i < 1 || j < 1 || i >= b.N - 1 || j >= b.N - 1) return;
    const c = idx(b, i, j);
    if (b.nav[c] !== 0 || b.road[c] !== 0 || b.obsType[c] !== 0) return;
    if (b.inside[c]) return;
    if (Math.abs(x - b.cx(i)) > 0.5) return;
    trees.push({ x: b.cx(i) + (rnd() - 0.5) * 0.4, z: b.cx(j) + (rnd() - 0.5) * 0.4, s, kind });
    b.obstacle(b.cx(i) - 0.5, b.cx(j) - 0.5, b.cx(i) + 0.5, b.cx(j) + 0.5, 3, 4.8 * s, true);
    // gölgelik: komşu hücrelerde görüş engeli
    for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const cc = idx(b, i + di, j + dj);
      if (b.obsType[cc] === 0) {
        b.obsType[cc] = 3;
        b.obsH[cc] = 4.2 * s;
      }
    }
  };
  const tryBush = (x: number, z: number, s: number, allowInside = false) => {
    const i = b.ci(x), j = b.ci(z);
    const c = idx(b, i, j);
    if (b.nav[c] !== 0 || b.obsType[c] !== 0) return;
    if (b.road[c] === 1) return;
    if (b.inside[c] && !allowInside) return;
    bushes.push({ x: b.cx(i) + (rnd() - 0.5) * 0.3, z: b.cx(j) + (rnd() - 0.5) * 0.3, s });
    b.obsType[c] = 4;
    b.obsH[c] = 1.25 * s;
  };
  // Batı ormanı
  for (let n = 0; n < 220; n++) {
    const x = -36 + rnd() * 8.5;
    const z = -36 + rnd() * 72;
    tryTree(x, z, 0.8 + rnd() * 0.6, rnd() < 0.5 ? 0 : 1);
  }
  // Kuzey ağaç hattı
  for (let n = 0; n < 80; n++) tryTree(-28 + rnd() * 64, -36 + rnd() * 7, 0.7 + rnd() * 0.6, rnd() < 0.7 ? 0 : 1);
  // Doğu ve güney seyrek
  for (let n = 0; n < 50; n++) tryTree(29 + rnd() * 7, -36 + rnd() * 72, 0.7 + rnd() * 0.5, 1);
  for (let n = 0; n < 40; n++) tryTree(-28 + rnd() * 56, 30 + rnd() * 6, 0.7 + rnd() * 0.5, rnd() < 0.5 ? 0 : 1);
  // Çit dışı çalılar (kuzey ve batı)
  for (let n = 0; n < 70; n++) tryBush(-25 + rnd() * 50, -27.5 - rnd() * 2.5, 0.8 + rnd() * 0.5);
  for (let n = 0; n < 60; n++) tryBush(-27.5 - rnd() * 2.5, -25 + rnd() * 50, 0.8 + rnd() * 0.5);
  for (let n = 0; n < 25; n++) tryBush(27 + rnd() * 3, -25 + rnd() * 50, 0.7 + rnd() * 0.5);
  for (let n = 0; n < 20; n++) tryBush(-25 + rnd() * 50, 27 + rnd() * 3, 0.7 + rnd() * 0.5);
  // Çit içi bakımsız köşeler (kör nokta adayları)
  for (let n = 0; n < 14; n++) tryBush(-24.5 + rnd() * 2, -17 + rnd() * 7, 0.9 + rnd() * 0.5, true);
  for (let n = 0; n < 12; n++) tryBush(20.5 + rnd() * 4, -24.5 + rnd() * 4, 0.9 + rnd() * 0.5, true);
  for (let n = 0; n < 8; n++) tryBush(20 + rnd() * 4.5, 21 + rnd() * 3.5, 0.9 + rnd() * 0.4, true);
  // Kayalar (KD tepe)
  for (let n = 0; n < 24; n++) {
    const x = 28 + rnd() * 8, z = -36 + rnd() * 12;
    const i = b.ci(x), j = b.ci(z), c = idx(b, i, j);
    if (b.nav[c] !== 0) continue;
    const s = 0.6 + rnd() * 1.1;
    rocks.push({ x, z, s });
    b.obstacle(b.cx(i) - 0.5, b.cx(j) - 0.5, b.cx(i) + 0.5, b.cx(j) + 0.5, 6, 1.4 * s);
  }

  growFill(b, rnd, trees, bushes, b.cx(b.fMax));
  b.fence();
  const gates = [
    makeGate(b, 'g-main', 'Ana Giriş Kapısı', 'S', 0, 4, true),
    makeGate(b, 'g-east', 'Doğu Servis Kapısı', 'E', 0, 4, false),
  ];

  const assets: CriticalAsset[] = [
    { id: 'trafo', name: 'Trafo Merkezi', kind: 'trafo', x: 17, z: 19.5, ax: 17, az: 16.5, weight: 3 },
    { id: 'inv1', name: 'İnverter İstasyonu 1', kind: 'inverter', x: -12, z: -12, ax: -12, az: -10.5, weight: 2 },
    { id: 'inv2', name: 'İnverter İstasyonu 2', kind: 'inverter', x: 12, z: -12, ax: 12, az: -10.5, weight: 2 },
    { id: 'inv3', name: 'İnverter İstasyonu 3', kind: 'inverter', x: -12, z: 8, ax: -10.5, az: 7.5, weight: 1.6 },
    { id: 'inv4', name: 'İnverter İstasyonu 4', kind: 'inverter', x: 12, z: 8, ax: 10.5, az: 7.5, weight: 1.6 },
    { id: 'depot', name: 'Malzeme Deposu', kind: 'depot', x: -7.5, z: 19.5, ax: -7.5, az: 17.5, weight: 1.8 },
    { id: 'control', name: 'Kontrol Binası', kind: 'control', x: -17.5, z: 19, ax: -17.5, az: 22, weight: 1.2 },
    { id: 'pnl-nw', name: 'Kuzeybatı Panel Sahası', kind: 'panels', x: -19, z: -19, ax: -19, az: -19, weight: 1.5 },
    { id: 'pnl-ne', name: 'Kuzeydoğu Panel Sahası', kind: 'panels', x: 19, z: -19, ax: 19, az: -19, weight: 1.2 },
  ];

  const zones: Zone[] = [
    { name: 'Trafo merkezi çevresi', x0: 11, z0: 13.5, x1: 23, z1: 24, critical: true },
    { name: 'Kontrol binası çevresi', x0: -24, z0: 14, x1: -12.5, z1: 24, critical: true },
    { name: 'Malzeme deposu', x0: -11, z0: 15.5, x1: -4, z1: 24, critical: true },
    { name: 'İnverter İstasyonu 1', x0: -17, z0: -16, x1: -7, z1: -8, critical: true },
    { name: 'İnverter İstasyonu 2', x0: 7, z0: -16, x1: 17, z1: -8, critical: true },
    { name: 'İnverter İstasyonu 3', x0: -17, z0: 4, x1: -7, z1: 12, critical: true },
    { name: 'İnverter İstasyonu 4', x0: 7, z0: 4, x1: 17, z1: 12, critical: true },
    { name: 'Kuzey çit hattı', x0: -25, z0: -25, x1: 25, z1: -21 },
    { name: 'Batı çit hattı', x0: -25, z0: -25, x1: -21, z1: 25 },
    { name: 'Doğu çit hattı', x0: 21, z0: -25, x1: 25, z1: 25 },
    { name: 'Güney çit hattı', x0: -25, z0: 21, x1: 25, z1: 25 },
    { name: 'Kuzeybatı panel sahası', x0: -21, z0: -21, x1: -3, z1: -3 },
    { name: 'Kuzeydoğu panel sahası', x0: 3, z0: -21, x1: 21, z1: -3 },
    { name: 'Güneybatı panel sahası', x0: -21, z0: 3, x1: -3, z1: 14 },
    { name: 'Güneydoğu panel sahası', x0: 3, z0: 3, x1: 21, z1: 14 },
    { name: 'Ana giriş kapısı', x0: -6, z0: 19, x1: 6, z1: 25 },
  ];

  // Risk katmanı (ipucu verir, kesin tehdit noktası değildir)
  addRisk(b, (x, z, c) => {
    let r = 0;
    const m = Math.max(Math.abs(x), Math.abs(z));
    if (b.obsType[c] === 2 || (Math.abs(x) > 3 && Math.abs(z) > 2)) r = 1;
    if (m > 21) r = Math.max(r, z < -20 || x < -20 ? 2 : 1);
    if (Math.hypot(x - 17, z - 19.5) < 7) r = 3;
    for (const a of assets) {
      const d = Math.hypot(x - a.x, z - a.z);
      if (a.kind === 'inverter' && d < 4.5) r = Math.max(r, 2);
      if ((a.kind === 'depot' || a.kind === 'control') && d < 5) r = Math.max(r, 2);
    }
    if (x < -18 && z < -18) r = 3;
    if (x > 19 && z < -19) r = Math.max(r, 2);
    if (Math.abs(x) < 5 && z > 21) r = Math.max(r, 2);
    return r;
  });
  // çalı çevresi riski
  for (const bu of bushes) {
    b.forRect(bu.x - 2.5, bu.z - 2.5, bu.x + 2.5, bu.z + 2.5, (_i, _j, c) => {
      if (b.inside[c] || b.nav[c] === 2) b.risk[c] = Math.max(b.risk[c], 2);
    });
  }

  const spawns = spawnRing(b, 31 + grow, 3, (x, z, side) => {
    let w = side === 'N' ? 3 : side === 'W' ? 3 : side === 'E' ? 1.6 : 0.8;
    if (side === 'S' && Math.abs(x) < 8) w = 0.2;
    if (side === 'E' && Math.abs(z) < 6) w = 0.4;
    return w;
  });

  return finalize(b, {
    id: 'ges',
    name: 'Ege GES-1 Güneş Santrali',
    buildings,
    panels,
    trees,
    bushes,
    rocks,
    turbines: [],
    gates,
    assets,
    zones,
    spawns,
    staffSpawns: [
      { x: 0, z: 34, gateId: 'g-main' },
      { x: 34, z: 0, gateId: 'g-east' },
    ],
  });
}

// ───────────────────────────── RES ─────────────────────────────
export function buildRES(grow = 0, opts: MapOpts = {}): MapData {
  const rnd = mulberry32(9001);
  const TURB =
    (opts.turbines ?? 5) >= 6
      ? [
          // zor: 6 türbin, sahaya dağınık
          { x: -26, z: -22, name: 'T1' },
          { x: 20, z: -27, name: 'T2' },
          { x: -30, z: 14, name: 'T3' },
          { x: 28, z: 18, name: 'T4' },
          { x: -4, z: -8, name: 'T5' },
          { x: 17, z: 31, name: 'T6' },
        ]
      : [
          { x: -18, z: -16, name: 'T1' },
          { x: 14, z: -20, name: 'T2' },
          { x: -22, z: 14, name: 'T3' },
          { x: 22, z: 12, name: 'T4' },
          { x: -1, z: -6, name: 'T5' },
        ];
  const heightAt = (x: number, z: number) => {
    let h =
      TURB.reduce((acc, t, k) => acc + [7.5, 8.5, 6.5, 7, 4.5, 6][k % 6] * gauss(x, z, t.x, t.z, k === 4 ? 7 : 8), 0) +
      5 * gauss(x, z, 4, 8, 4.5) + // orta sırt (görüşü keser)
      4 * gauss(x, z, -10, -2, 4) +
      1.3 * Math.sin(x * 0.17 + 1) * Math.cos(z * 0.13) +
      0.9 * Math.sin(x * 0.07) * Math.sin(z * 0.09 + 2) +
      1.4;
    h *= 1 - 0.85 * gauss(x, z, 0, 28, 9); // trafo alanı düzlüğü
    const d = Math.max(Math.abs(x), Math.abs(z)) - 37 - grow;
    h += smoothstep(0, 7, d) * (5 + 2 * Math.sin(x * 0.2) * Math.cos(z * 0.23));
    return h;
  };
  const b = new Builder(88, 8, heightAt, grow);

  // yollar
  b.roadPolyline([[0, 44], [0, 24], [-1, 10], [-1, -3]], 3.2, 2);
  if (TURB.length >= 6) {
    for (const t of TURB) b.roadPolyline([[t.z > 10 ? 0 : -1, t.z > 10 ? 20 : -3], [t.x * 0.6, t.z * 0.6], [t.x - Math.sign(t.x) * 2, t.z - Math.sign(t.z) * 2]], 2.8, 2);
    b.roadPolyline([[-26, -22], [-20, -32], [-20, -44 - grow]], 2.8, 2);
  } else {
    b.roadPolyline([[-1, -3], [-9, -10], [-16, -14]], 2.8, 2);
    b.roadPolyline([[-1, -3], [7, -13], [12, -18]], 2.8, 2);
    b.roadPolyline([[-1, 20], [-12, 17], [-20, 14.5]], 2.8, 2);
    b.roadPolyline([[1, 20], [12, 15], [20, 12.5]], 2.8, 2);
    b.roadPolyline([[-16, -14], [-12, -26], [-12, -44]], 2.8, 2);
  }
  // türbin platformları
  for (const t of TURB) b.forRect(t.x - 4, t.z - 4, t.x + 4, t.z + 4, (_i, _j, c, ) => {
    b.road[c] = 3;
  });
  // trafo sahası
  b.forRect(2.5, 23, 12.5, 31.5, (_i, _j, c) => (b.road[c] = 3));
  b.forRect(-10.5, 24, -3.5, 31, (_i, _j, c) => (b.road[c] = 3));

  const buildings: BuildingDef[] = [
    { kind: 'trafo', name: 'Ana Trafo', x: 6, z: 27.5, w: 3, d: 3, h: 3.6 },
    { kind: 'trafo', name: 'Yardımcı Trafo', x: 10, z: 27.5, w: 2, d: 3, h: 3 },
    { kind: 'control', name: 'Kontrol Binası', x: -7, z: 28, w: 6, d: 4, h: 4.2 },
    { kind: 'container', name: 'Yedek Parça Konteyneri', x: -14, z: 24, w: 4, d: 2.5, h: 2.8 },
  ];
  for (const bd of buildings) b.obstacle(bd.x - bd.w / 2, bd.z - bd.d / 2, bd.x + bd.w / 2, bd.z + bd.d / 2, 1, bd.h);
  for (const t of TURB) b.obstacle(t.x - 1, t.z - 1, t.x + 1, t.z + 1, 7, 70);

  const trees: MapData['trees'] = [];
  const bushes: MapData['bushes'] = [];
  const rocks: MapData['rocks'] = [];
  const tryTree = (x: number, z: number, s: number, kind: number, allowInside: boolean) => {
    const i = b.ci(x), j = b.ci(z);
    if (i < 1 || j < 1 || i >= b.N - 1 || j >= b.N - 1) return;
    const c = idx(b, i, j);
    if (!b.free(c)) return;
    if (b.inside[c] && !allowInside) return;
    if (!b.inside[c] && allowInside && b.nav[c] !== 0) return;
    // çit hattına bitişik değil
    if (Math.abs(Math.max(Math.abs(b.cx(i)), Math.abs(b.cx(j))) - 35.5 - grow) < 1.6) return;
    trees.push({ x: b.cx(i) + (rnd() - 0.5) * 0.4, z: b.cx(j) + (rnd() - 0.5) * 0.4, s, kind });
    b.obstacle(b.cx(i) - 0.5, b.cx(j) - 0.5, b.cx(i) + 0.5, b.cx(j) + 0.5, 3, 5 * s);
    for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const cc = idx(b, i + di, j + dj);
      if (b.obsType[cc] === 0) {
        b.obsType[cc] = 3;
        b.obsH[cc] = 4.3 * s;
      }
    }
  };
  const forests = [
    { x: -8, z: -25, r: 6, n: 26 },
    { x: 9, z: 1, r: 4.5, n: 14 },
    { x: -28, z: -2, r: 6, n: 24 },
    { x: 27, z: -3, r: 5, n: 18 },
    { x: -11, z: 6, r: 4, n: 12 },
    { x: 25, z: 27, r: 5, n: 16 },
    { x: -26, z: 28, r: 5, n: 16 },
    { x: 26, z: -29, r: 4.5, n: 12 },
  ];
  for (const f of forests)
    for (let n = 0; n < f.n; n++) {
      const a = rnd() * Math.PI * 2, r = Math.sqrt(rnd()) * f.r;
      tryTree(f.x + Math.cos(a) * r, f.z + Math.sin(a) * r, 0.75 + rnd() * 0.6, rnd() < 0.75 ? 1 : 0, true);
    }
  for (let n = 0; n < 520; n++) {
    const side = Math.floor(rnd() * 4);
    const t = -44 - grow + rnd() * (88 + grow * 2);
    const d = 37.5 + grow + rnd() * 6.5;
    const [x, z] = side === 0 ? [t, -d] : side === 1 ? [t, d] : side === 2 ? [d, t] : [-d, t];
    tryTree(x, z, 0.8 + rnd() * 0.6, rnd() < 0.7 ? 1 : 0, false);
  }
  for (let n = 0; n < 70; n++) {
    const x = -33 + rnd() * 66, z = -33 + rnd() * 66;
    const i = b.ci(x), j = b.ci(z), c = idx(b, i, j);
    if (!b.free(c)) continue;
    const s = 0.8 + rnd() * 0.6;
    bushes.push({ x: b.cx(i), z: b.cx(j), s });
    b.obsType[c] = 4;
    b.obsH[c] = 1.25 * s;
  }
  for (let n = 0; n < 90; n++) {
    const side = Math.floor(rnd() * 4);
    const t = -36 - grow + rnd() * (72 + grow * 2);
    const d = 36.5 + grow + rnd() * 2;
    const [x, z] = side === 0 ? [t, -d] : side === 1 ? [t, d] : side === 2 ? [d, t] : [-d, t];
    const i = b.ci(x), j = b.ci(z), c = idx(b, i, j);
    if (!b.free(c)) continue;
    const s = 0.8 + rnd() * 0.5;
    bushes.push({ x: b.cx(i), z: b.cx(j), s });
    b.obsType[c] = 4;
    b.obsH[c] = 1.25 * s;
  }
  for (const t of TURB) {
    for (let n = 0; n < 5; n++) {
      const a = rnd() * Math.PI * 2, r = 6 + rnd() * 4;
      const x = t.x + Math.cos(a) * r, z = t.z + Math.sin(a) * r;
      const i = b.ci(x), j = b.ci(z), c = idx(b, i, j);
      if (!b.free(c)) continue;
      const s = 0.7 + rnd() * 1.0;
      rocks.push({ x: b.cx(i), z: b.cx(j), s });
      b.obstacle(b.cx(i) - 0.5, b.cx(j) - 0.5, b.cx(i) + 0.5, b.cx(j) + 0.5, 6, 1.5 * s);
    }
  }

  growFill(b, rnd, trees, bushes, b.cx(b.fMax));
  b.fence();
  const gates = [
    makeGate(b, 'g-main', 'Ana Giriş Kapısı', 'S', 0, 4, true),
    makeGate(b, 'g-north', 'Kuzey Servis Kapısı', 'N', TURB.length >= 6 ? -20 : -12, 4, false),
  ];

  const assets: CriticalAsset[] = [
    { id: 'sub', name: 'Trafo Merkezi', kind: 'trafo', x: 8, z: 27.5, ax: 8, az: 24.5, weight: 3 },
    { id: 'control', name: 'Kontrol Binası', kind: 'control', x: -7, z: 28, ax: -7, az: 25.5, weight: 1.2 },
    { id: 'cont', name: 'Yedek Parça Konteyneri', kind: 'depot', x: -14, z: 24, ax: -14, az: 22, weight: 2 },
    ...TURB.map((t) => ({
      id: t.name,
      name: `${t.name} Rüzgâr Türbini`,
      kind: 'turbine' as const,
      x: t.x,
      z: t.z,
      ax: t.x + 1.5,
      az: t.z + 1.5,
      weight: t.name === 'T1' || t.name === 'T2' || t.name === 'T6' ? 2.6 : 2,
    })),
  ];

  const zones: Zone[] = [
    ...TURB.map((t) => ({ name: `${t.name} türbin sahası`, x0: t.x - 7, z0: t.z - 7, x1: t.x + 7, z1: t.z + 7, critical: true })),
    { name: 'Trafo merkezi çevresi', x0: 1, z0: 21, x1: 14, z1: 33, critical: true },
    { name: 'Kontrol binası çevresi', x0: -12, z0: 22, x1: -2, z1: 33, critical: true },
    { name: 'Yedek parça konteyneri', x0: -18, z0: 20, x1: -10, z1: 28, critical: true },
    { name: 'Kuzey çit hattı', x0: -35, z0: -35, x1: 35, z1: -30 },
    { name: 'Batı çit hattı', x0: -35, z0: -35, x1: -30, z1: 35 },
    { name: 'Doğu çit hattı', x0: 30, z0: -35, x1: 35, z1: 35 },
    { name: 'Güney çit hattı', x0: -35, z0: 30, x1: 35, z1: 35 },
    { name: 'Merkez sırt', x0: -6, z0: -2, x1: 12, z1: 14 },
  ];

  addRisk(b, (x, z, c) => {
    let r = 1;
    const m = Math.max(Math.abs(x), Math.abs(z));
    if (m > 31) r = z < -30 || x < -30 ? 2 : 1;
    for (const t of TURB) {
      const d = Math.hypot(x - t.x, z - t.z);
      if (d < 7) r = Math.max(r, t.name === 'T1' || t.name === 'T2' || t.name === 'T6' ? 3 : 2);
    }
    if (Math.hypot(x - 8, z - 27.5) < 7) r = 3;
    if (Math.hypot(x + 14, z - 24) < 5) r = Math.max(r, 2);
    if (Math.hypot(x + 7, z - 28) < 5) r = Math.max(r, 2);
    for (const f of forests) if (Math.hypot(x - f.x, z - f.z) < f.r + 2 && b.inside[c]) r = Math.max(r, 2);
    return r;
  });

  const spawns = spawnRing(b, 40 + grow, 3, (x, z, side) => {
    let w = side === 'N' ? 3 : side === 'W' ? 2.5 : side === 'E' ? 2.5 : 1;
    if (side === 'S' && Math.abs(x) < 8) w = 0.2;
    return w;
  });

  return finalize(b, {
    id: 'res',
    name: 'Kuzey Ege RES-2 Rüzgâr Santrali',
    buildings,
    panels: [],
    trees,
    bushes,
    rocks,
    turbines: TURB,
    gates,
    assets,
    zones,
    spawns,
    staffSpawns: [
      { x: 0, z: 42, gateId: 'g-main' },
      { x: TURB.length >= 6 ? -20 : -12, z: -42, gateId: 'g-north' },
    ],
  });
}


// ───────────────────────────── TES (Termik Santral) ─────────────────────────────
export function buildTES(grow = 0, opts: MapOpts = {}): MapData {
  const rnd = mulberry32(4242);
  const heightAt = (x: number, z: number) => {
    const d = Math.max(Math.abs(x), Math.abs(z)) - 32;
    const ramp = smoothstep(0, 8, d);
    let h = 1.4 + 1.1 * Math.sin(x * 0.17 + 0.5) * Math.cos(z * 0.19) + 3 * gauss(x, z, -37, -30, 7) + 2.5 * gauss(x, z, 36, 30, 6);
    if (Math.abs(x) < 4 && z > 0) h *= 0.15;
    return Math.max(0, h * ramp);
  };
  const b = new Builder(80, 9, heightAt, grow);

  // yollar
  b.forAll((_i, _j, c, x, z) => {
    const m = Math.max(Math.abs(x), Math.abs(z));
    if (b.inside[c] && m >= 27.5 + grow) b.road[c] = 2; // çevre servis yolu
    if (Math.abs(x) <= 1.6 && z > 1.5) b.road[c] = 1; // ana yol
    if (z >= 7.6 && z <= 10.6 && x > -11 && x < 28) b.road[c] = 1; // kömür sahası yolu
    if (Math.abs(z + 10) <= 1.6 && x > 8) b.road[c] = 1; // doğu servis yolu
    if (x > 12 && x < 26 && z > -27.5 && z < -17.5) b.road[c] = 3; // şalt sahası çakılı
    if (x > 12.5 && x < 27.5 && z > 11.5 && z < 27.5) b.road[c] = 3; // kömür sahası zemini
  });

  const buildings: BuildingDef[] = [
    { kind: 'turbinehall', name: 'Türbin Binası', x: 1, z: -2, w: 14, d: 8, h: 9 },
    { kind: 'boiler', name: 'Kazan Dairesi', x: 1, z: -13, w: 9, d: 8, h: 17 },
    { kind: 'stack', name: 'Baca', x: 12.5, z: -14.5, w: 3, d: 3, h: 34 },
    { kind: 'cooling', name: 'Soğutma Kulesi 1', x: -19, z: -15, w: 12, d: 12, h: 22 },
    { kind: 'cooling', name: 'Soğutma Kulesi 2', x: -19, z: 3, w: 12, d: 12, h: 22 },
    { kind: 'coal', name: 'Kömür Yığını 1', x: 17, z: 16, w: 6, d: 6, h: 4 },
    { kind: 'coal', name: 'Kömür Yığını 2', x: 23.5, z: 16, w: 5, d: 5, h: 3.5 },
    { kind: 'coal', name: 'Kömür Yığını 3', x: 20, z: 23, w: 6, d: 5, h: 3.8 },
    { kind: 'trafo', name: 'Ana Trafo', x: 16.5, z: -22.5, w: 3, d: 3, h: 3.8 },
    { kind: 'trafo', name: 'Yardımcı Trafo', x: 21.5, z: -22.5, w: 3, d: 3, h: 3.4 },
    { kind: 'tank', name: 'Yakıt Tankı 1', x: -21, z: 20, w: 6, d: 6, h: 6 },
    { kind: 'tank', name: 'Yakıt Tankı 2', x: -13, z: 20, w: 5, d: 5, h: 5 },
    { kind: 'control', name: 'Kontrol Binası', x: -6, z: 22, w: 7, d: 4, h: 4.2 },
    { kind: 'depot', name: 'Malzeme Deposu', x: 8, z: 22, w: 5, d: 3, h: 3.2 },
  ];
  for (const bd of buildings) {
    if (bd.kind === 'cooling' || bd.kind === 'tank' || bd.kind === 'coal' || bd.kind === 'stack') {
      const r = Math.min(bd.w, bd.d) / 2;
      b.forRect(bd.x - r, bd.z - r, bd.x + r, bd.z + r, (_i, _j, c) => {
        const cx = b.cx(_i), cz = b.cx(_j);
        if (Math.hypot(cx - bd.x, cz - bd.z) <= r - 0.2) {
          b.obsType[c] = 1;
          b.obsH[c] = Math.max(b.obsH[c], bd.h);
          b.nav[c] = 1;
        }
      });
    } else b.obstacle(bd.x - bd.w / 2, bd.z - bd.d / 2, bd.x + bd.w / 2, bd.z + bd.d / 2, 1, bd.h);
  }

  const trees: MapData['trees'] = [];
  const bushes: MapData['bushes'] = [];
  const rocks: MapData['rocks'] = [];
  const tryTree = (x: number, z: number, s: number, kind: number) => {
    const i = b.ci(x), j = b.ci(z);
    if (i < 1 || j < 1 || i >= b.N - 1 || j >= b.N - 1) return;
    const c = idx(b, i, j);
    if (!b.free(c) || b.inside[c]) return;
    if (Math.abs(Math.max(Math.abs(b.cx(i)), Math.abs(b.cx(j))) - 30.5) < 1.6) return;
    trees.push({ x: b.cx(i) + (rnd() - 0.5) * 0.4, z: b.cx(j) + (rnd() - 0.5) * 0.4, s, kind });
    b.obstacle(b.cx(i) - 0.5, b.cx(j) - 0.5, b.cx(i) + 0.5, b.cx(j) + 0.5, 3, 4.8 * s);
  };
  for (let n = 0; n < 420; n++) {
    const side = Math.floor(rnd() * 4);
    const t = -40 + rnd() * 80;
    const d = 32.5 + rnd() * 7.5;
    const [x, z] = side === 0 ? [t, -d] : side === 1 ? [t, d] : side === 2 ? [d, t] : [-d, t];
    if (side === 1 && Math.abs(x) < 4) continue;
    tryTree(x, z, 0.8 + rnd() * 0.6, rnd() < 0.6 ? 0 : 1);
  }
  const tryBush = (x: number, z: number, s: number) => {
    const i = b.ci(x), j = b.ci(z), c = idx(b, i, j);
    if (!b.free(c) && !(b.road[c] === 2 && b.nav[c] === 0 && b.obsType[c] === 0)) return;
    if (b.nav[c] !== 0 || b.obsType[c] !== 0) return;
    bushes.push({ x: b.cx(i), z: b.cx(j), s });
    b.obsType[c] = 4;
    b.obsH[c] = 1.25 * s;
  };
  for (let n = 0; n < 60; n++) tryBush(-30 + rnd() * 60, -31.5 - rnd() * 2, 0.8 + rnd() * 0.5);
  for (let n = 0; n < 50; n++) tryBush(31.5 + rnd() * 2, -30 + rnd() * 60, 0.8 + rnd() * 0.5);
  for (let n = 0; n < 16; n++) tryBush(-29.5 + rnd() * 3, -29.5 + rnd() * 8, 0.9 + rnd() * 0.4);
  for (let n = 0; n < 14; n++) tryBush(26 + rnd() * 3.5, 26 + rnd() * 3.5, 0.9 + rnd() * 0.4);
  for (let n = 0; n < 12; n++) tryBush(-10 + rnd() * 6, -28.5 + rnd() * 2.5, 0.9 + rnd() * 0.4);

  growFill(b, rnd, trees, bushes, b.cx(b.fMax));
  b.fence();
  const gates = [makeGate(b, 'g-main', 'Ana Giriş Kapısı', 'S', 0, 4, true), makeGate(b, 'g-east', 'Doğu Servis Kapısı', 'E', -10, 4, false)];

  const assets: CriticalAsset[] = [
    { id: 'salt', name: 'Şalt Sahası', kind: 'trafo', x: 19, z: -22.5, ax: 19, az: -19.5, weight: 3 },
    { id: 'tank', name: 'Yakıt Tankları', kind: 'tank', x: -17, z: 20, ax: -17, az: 16, weight: 2.6 },
    { id: 'depot', name: 'Malzeme Deposu', kind: 'depot', x: 8, z: 22, ax: 8, az: 19.5, weight: 2 },
    { id: 'hall', name: 'Türbin Binası', kind: 'hall', x: 1, z: -2, ax: 9, az: -2, weight: 1.6 },
    { id: 'control', name: 'Kontrol Binası', kind: 'control', x: -6, z: 22, ax: -6, az: 19, weight: 1.2 },
    { id: 'coal', name: 'Kömür Sahası', kind: 'depot', x: 20, z: 20, ax: 14, az: 20, weight: 1 },
  ];

  const zones: Zone[] = [
    { name: 'Şalt sahası', x0: 11, z0: -28, x1: 27, z1: -17, critical: true },
    { name: 'Yakıt tankları', x0: -26, z0: 14, x1: -9, z1: 26, critical: true },
    { name: 'Malzeme deposu', x0: 4, z0: 18, x1: 12, z1: 26, critical: true },
    { name: 'Türbin binası çevresi', x0: -8, z0: -8, x1: 10, z1: 4, critical: true },
    { name: 'Kontrol binası çevresi', x0: -11, z0: 18, x1: -1, z1: 27, critical: true },
    { name: 'Kömür sahası', x0: 12, z0: 11, x1: 28, z1: 28 },
    { name: 'Soğutma kuleleri arkası', x0: -30, z0: -24, x1: -24, z1: 12 },
    { name: 'Kuzey çit hattı', x0: -30, z0: -30, x1: 30, z1: -26 },
    { name: 'Doğu çit hattı', x0: 26, z0: -30, x1: 30, z1: 30 },
    { name: 'Güney çit hattı', x0: -30, z0: 26, x1: 30, z1: 30 },
    { name: 'Batı çit hattı', x0: -30, z0: -30, x1: -26, z1: 30 },
  ];

  addRisk(b, (x, z) => {
    let r = 1;
    const m = Math.max(Math.abs(x), Math.abs(z));
    if (m > 26) r = z < -25 || x < -25 ? 2 : 1;
    if (x > 11 && x < 27 && z > -28 && z < -16) r = 3;
    if (x > -26 && x < -8 && z > 14 && z < 26) r = 3;
    if (x > 4 && x < 12 && z > 17 && z < 26) r = 2;
    if (x < -24 && z < 12) r = Math.max(r, 2);
    if (x > 12 && z > 11) r = Math.max(r, 2);
    return r;
  });

  const spawns = spawnRing(b, 34 + grow, 3, (x, _z, side) => {
    let w = side === 'N' ? 3 : side === 'W' ? 2.5 : side === 'E' ? 2.2 : 0.8;
    if (side === 'S' && Math.abs(x) < 8) w = 0.2;
    return w;
  });

  return finalize(b, {
    id: 'tes',
    name: 'Trakya TES-3 Termik Santrali',
    buildings,
    panels: [],
    trees,
    bushes,
    rocks,
    turbines: [],
    gates,
    assets,
    zones,
    spawns,
    staffSpawns: [
      { x: 0, z: 37, gateId: 'g-main' },
      { x: 37, z: -10, gateId: 'g-east' },
    ],
  });
}

const cache: Record<string, MapData> = {};
export function getMap(id: MapId, grow = 0, opts: MapOpts = {}): MapData {
  const key = `${id}:${grow}:${opts.turbines ?? ''}${opts.expo ? ':expo' : ''}`;
  if (!cache[key] && opts.expo) {
    cache[key] = thinFenceTrees(getMap(id, grow, { ...opts, expo: false }));
    return cache[key];
  }
  if (!cache[key]) cache[key] = id === 'ges' ? buildGES(grow, opts) : id === 'res' ? buildRES(grow, opts) : id === 'jes' ? buildJES(grow, opts) : id === 'hes' ? buildHES(grow, opts) : id === 'bess' ? buildBESS(grow, opts) : buildTES(grow, opts);
  return cache[key];
}

export { cellX };

// ───────────────────────────── JES (Jeotermal Santral) ─────────────────────────────
export function buildJES(grow = 0, opts: MapOpts = {}): MapData {
  const rnd = mulberry32(7331);
  const heightAt = (x: number, z: number) => {
    const d = Math.max(Math.abs(x), Math.abs(z)) - 30;
    const ramp = smoothstep(0, 8, d);
    let h = 1.2 + 1.0 * Math.sin(x * 0.19 + 0.8) * Math.cos(z * 0.16 + 0.4) + 3.4 * gauss(x, z, -36, -28, 7) + 2.8 * gauss(x, z, 34, -32, 7) + 2.2 * gauss(x, z, 36, 30, 6);
    if (Math.abs(x) < 4 && z > 0) h *= 0.15;
    return Math.max(0, h * ramp);
  };
  const b = new Builder(76, 9, heightAt, grow);

  // yollar
  b.forAll((_i, _j, c, x, z) => {
    const m = Math.max(Math.abs(x), Math.abs(z));
    if (b.inside[c] && m >= 25.5 + grow) b.road[c] = 2; // çevre servis yolu
    if (Math.abs(x) <= 1.6 && z > 2.5) b.road[c] = 1; // ana yol
    if (Math.abs(z - 10) <= 1.4 && x > -22 && x < 22) b.road[c] = 1; // iç yol
    if (x > 13 && x < 27 && z > 12 && z < 24) b.road[c] = 3; // şalt sahası çakılı
    if (Math.hypot(x, z + 4) < 9.5) b.road[c] = 3; // santral platformu
  });
  // kuyu başı platformları (çakıl)
  const WELLS = [
    { x: -20, z: -20, name: 'K-1' },
    { x: 19, z: -22, name: 'K-2' },
    { x: -21, z: 17, name: 'K-3' },
    { x: 22, z: -4, name: 'K-4' },
  ];
  for (const w of WELLS) b.forRect(w.x - 3, w.z - 3, w.x + 3, w.z + 3, (_i, _j, c) => (b.road[c] = 3));

  const buildings: BuildingDef[] = [
    { kind: 'turbinehall', name: 'Türbin-Jeneratör Binası', x: 0, z: -4, w: 12, d: 7, h: 8 },
    { kind: 'fancooler', name: 'Hava Soğutmalı Kondenser', x: -14, z: -5, w: 9, d: 4.5, h: 4 },
    { kind: 'separator', name: 'Buhar Separatörü', x: 11, z: -5, w: 6, d: 2.5, h: 2.6 },
    ...WELLS.map((w) => ({ kind: 'wellhead' as const, name: `Üretim Kuyusu ${w.name}`, x: w.x, z: w.z, w: 2.4, d: 2.4, h: 2.8 })),
    { kind: 'wellhead', name: 'Reenjeksiyon Kuyusu R-1', x: 0, z: -22, w: 2.4, d: 2.4, h: 2.8 },
    { kind: 'trafo', name: 'Ana Trafo', x: 17.5, z: 18, w: 3, d: 3, h: 3.8 },
    { kind: 'trafo', name: 'Yardımcı Trafo', x: 22.5, z: 18, w: 3, d: 3, h: 3.4 },
    { kind: 'control', name: 'Kontrol Binası', x: -14, z: 19, w: 7, d: 4, h: 4.2 },
    { kind: 'depot', name: 'Malzeme Deposu', x: -5, z: 19.5, w: 4, d: 3, h: 3 },
  ];
  for (const bd of buildings) b.obstacle(bd.x - bd.w / 2, bd.z - bd.d / 2, bd.x + bd.w / 2, bd.z + bd.d / 2, 1, bd.h);

  const trees: MapData['trees'] = [];
  const bushes: MapData['bushes'] = [];
  const rocks: MapData['rocks'] = [];
  const tryTree = (x: number, z: number, s: number, kind: number) => {
    const i = b.ci(x), j = b.ci(z);
    if (i < 1 || j < 1 || i >= b.N - 1 || j >= b.N - 1) return;
    const c = idx(b, i, j);
    if (!b.free(c) || b.inside[c]) return;
    if (Math.abs(Math.max(Math.abs(b.cx(i)), Math.abs(b.cx(j))) - 28.5) < 1.6) return;
    trees.push({ x: b.cx(i) + (rnd() - 0.5) * 0.4, z: b.cx(j) + (rnd() - 0.5) * 0.4, s, kind });
    b.obstacle(b.cx(i) - 0.5, b.cx(j) - 0.5, b.cx(i) + 0.5, b.cx(j) + 0.5, 3, 4.8 * s);
  };
  for (let n = 0; n < 380; n++) {
    const side = Math.floor(rnd() * 4);
    const t = -38 + rnd() * 76;
    const d = 30.5 + rnd() * 7.5;
    const [x, z] = side === 0 ? [t, -d] : side === 1 ? [t, d] : side === 2 ? [d, t] : [-d, t];
    if (side === 1 && Math.abs(x) < 4) continue;
    tryTree(x, z, 0.8 + rnd() * 0.6, rnd() < 0.4 ? 0 : 1);
  }
  const tryBush = (x: number, z: number, s: number, allowInside = false) => {
    const i = b.ci(x), j = b.ci(z), c = idx(b, i, j);
    if (b.nav[c] !== 0 || b.obsType[c] !== 0 || b.road[c] === 1) return;
    if (b.inside[c] && !allowInside) return;
    bushes.push({ x: b.cx(i), z: b.cx(j), s });
    b.obsType[c] = 4;
    b.obsH[c] = 1.25 * s;
  };
  for (let n = 0; n < 60; n++) tryBush(-28 + rnd() * 56, -29.5 - rnd() * 2, 0.8 + rnd() * 0.5);
  for (let n = 0; n < 50; n++) tryBush(-29.5 - rnd() * 2, -28 + rnd() * 56, 0.8 + rnd() * 0.5);
  for (let n = 0; n < 40; n++) tryBush(29.5 + rnd() * 2, -28 + rnd() * 56, 0.8 + rnd() * 0.5);
  for (let n = 0; n < 14; n++) tryBush(-27 + rnd() * 3, -27 + rnd() * 8, 0.9 + rnd() * 0.4, true);
  for (let n = 0; n < 12; n++) tryBush(23 + rnd() * 4, 22 + rnd() * 4, 0.9 + rnd() * 0.4, true);
  for (let n = 0; n < 10; n++) tryBush(-27 + rnd() * 4, 0 + rnd() * 8, 0.9 + rnd() * 0.4, true);
  // kaynar su gözesi çevresi: kayalar
  for (let n = 0; n < 30; n++) {
    const x = -38 + rnd() * 10, z = -36 + rnd() * 14;
    const i = b.ci(x), j = b.ci(z), c = idx(b, i, j);
    if (!b.free(c) || b.inside[c]) continue;
    const s = 0.6 + rnd() * 1.1;
    rocks.push({ x, z, s });
    b.obstacle(b.cx(i) - 0.5, b.cx(j) - 0.5, b.cx(i) + 0.5, b.cx(j) + 0.5, 6, 1.4 * s);
  }

  growFill(b, rnd, trees, bushes, b.cx(b.fMax));
  b.fence();
  const gates = [makeGate(b, 'g-main', 'Ana Giriş Kapısı', 'S', 0, 4, true), makeGate(b, 'g-west', 'Batı Servis Kapısı', 'W', 10, 4, false)];

  const assets: CriticalAsset[] = [
    { id: 'salt', name: 'Şalt Sahası', kind: 'trafo', x: 20, z: 18, ax: 20, az: 14.5, weight: 3 },
    { id: 'sep', name: 'Buhar Separatörü', kind: 'tank', x: 11, z: -5, ax: 11, az: -1.5, weight: 2.2 },
    { id: 'depot', name: 'Malzeme Deposu', kind: 'depot', x: -5, z: 19.5, ax: -5, az: 17, weight: 2 },
    { id: 'hall', name: 'Türbin-Jeneratör Binası', kind: 'hall', x: 0, z: -4, ax: -8, az: -4, weight: 1.6 },
    { id: 'control', name: 'Kontrol Binası', kind: 'control', x: -14, z: 19, ax: -14, az: 16, weight: 1.2 },
    ...WELLS.map((w) => ({ id: w.name, name: `Üretim Kuyusu ${w.name}`, kind: 'well' as const, x: w.x, z: w.z, ax: w.x + 2.2, az: w.z + 2.2, weight: 2.2 })),
  ];

  const zones: Zone[] = [
    { name: 'Şalt sahası', x0: 13, z0: 12, x1: 27, z1: 24, critical: true },
    ...WELLS.map((w) => ({ name: `${w.name} kuyu başı`, x0: w.x - 5, z0: w.z - 5, x1: w.x + 5, z1: w.z + 5, critical: true })),
    { name: 'Türbin binası çevresi', x0: -8, z0: -10, x1: 8, z1: 2, critical: true },
    { name: 'Buhar separatörü', x0: 7, z0: -9, x1: 15, z1: 0, critical: true },
    { name: 'Kontrol binası çevresi', x0: -19, z0: 15, x1: -9, z1: 24, critical: true },
    { name: 'Malzeme deposu', x0: -8, z0: 16, x1: -2, z1: 24, critical: true },
    { name: 'Kuzey çit hattı', x0: -28, z0: -28, x1: 28, z1: -24 },
    { name: 'Batı çit hattı', x0: -28, z0: -28, x1: -24, z1: 28 },
    { name: 'Doğu çit hattı', x0: 24, z0: -28, x1: 28, z1: 28 },
    { name: 'Güney çit hattı', x0: -28, z0: 24, x1: 28, z1: 28 },
  ];

  addRisk(b, (x, z) => {
    let r = 1;
    const m = Math.max(Math.abs(x), Math.abs(z));
    if (m > 24) r = z < -23 || x < -23 ? 2 : 1;
    if (x > 13 && x < 27 && z > 12 && z < 24) r = 3;
    for (const w of WELLS) if (Math.hypot(x - w.x, z - w.z) < 5) r = Math.max(r, w.name === 'K-1' || w.name === 'K-2' ? 3 : 2);
    if (Math.hypot(x - 11, z + 5) < 5) r = Math.max(r, 2);
    if (x > -8 && x < -2 && z > 16 && z < 24) r = 2;
    return r;
  });
  for (const bu of bushes) {
    b.forRect(bu.x - 2.5, bu.z - 2.5, bu.x + 2.5, bu.z + 2.5, (_i, _j, c) => {
      if (b.inside[c] || b.nav[c] === 2) b.risk[c] = Math.max(b.risk[c], 2);
    });
  }

  const spawns = spawnRing(b, 32 + grow, 3, (x, z, side) => {
    let w = side === 'N' ? 3 : side === 'W' ? 2.4 : side === 'E' ? 2.4 : 0.8;
    if (side === 'S' && Math.abs(x) < 8) w = 0.2;
    if (side === 'W' && Math.abs(z - 10) < 5) w = 0.4;
    return w;
  });

  return finalize(b, {
    id: 'jes',
    name: 'Büyük Menderes JES-4 Jeotermal Santrali',
    buildings,
    panels: [],
    trees,
    bushes,
    rocks,
    turbines: [],
    gates,
    assets,
    zones,
    spawns,
    staffSpawns: [
      { x: 0, z: 35, gateId: 'g-main' },
      { x: -35, z: 10, gateId: 'g-west' },
    ],
  });
}

// ───────────────────────────── HES (Hidroelektrik Santral) ─────────────────────────────
/** HES geometrisi: baraj kuzeyde, rezervuar barajın arkasında (su), cebri borular santral binasına iner, kuyruk suyu kanalı güneye akar */
export const HES = {
  damZ: -26, // baraj gövdesi merkez çizgisi
  damD: 4,
  plateauH: 9.5, // rezervuar tabanı (zemin) yüksekliği
  waterY: 10.6, // rezervuar su seviyesi
  crestH: 13.3, // tepe yolu zemin yükseltisi (model H 13 + yol 0,24; çit ve karakterler yolun üstünde)
  shoreGap: 5, // barajın arkasındaki kuru kıyı şeridi (m): çit bu şeritte, su daha kuzeyde
  channel: { x0: 4.5, x1: 8.5, z0: -1, z1: 60 }, // kuyruk suyu kanalı
  bridgeZ: { z0: 25, z1: 29 }, // servis yolu köprüsü
};
export function buildHES(grow = 0, opts: MapOpts = {}): MapData {
  const rnd = mulberry32(2718);
  const heightAt = (x: number, z: number) => {
    const d = Math.max(Math.abs(x), Math.abs(z)) - 34;
    const ramp = smoothstep(0, 8, d);
    let h = 1.0 + 0.8 * Math.sin(x * 0.18 + 0.2) * Math.cos(z * 0.15 + 0.9) + 3.5 * gauss(x, z, -38, 10, 8) + 3 * gauss(x, z, 38, 6, 8);
    h = Math.max(0, h * ramp);
    // rezervuar platosu: barajın arkası yüksek
    const t = Math.min(1, Math.max(0, (HES.damZ - 1 - z) / 5));
    h += HES.plateauH * t * t * (3 - 2 * t);
    // yamaçlar: baraj iki yanda kayaya yaslanır
    const flank = Math.max(0, Math.abs(x) - 30) / 8;
    h += Math.min(1, flank) * 6 * Math.max(0, 1 - Math.max(0, z - HES.damZ) / 14);
    if (Math.abs(x + 16) < 3 && z > 8) h = Math.min(h, 1.2); // ana yol düz
    // baraj tepesi: gövde içinde zemin tepe yoluna çıkar (tepedeki çit, kamera ve hırsız doğru yükseklikte)
    if (Math.abs(x) < 32 - 0.5 && z >= HES.damZ - HES.damD / 2 + 0.4 && z <= HES.damZ + HES.damD / 2 - 0.4) h += HES.crestH;
    return h;
  };
  const b = new Builder(84, 9, heightAt, grow);

  // yollar
  b.forAll((_i, _j, c, x, z) => {
    const m = Math.max(Math.abs(x), Math.abs(z));
    if (b.inside[c] && m >= 29.5 + grow && z > HES.damZ + 4) b.road[c] = 2; // çevre servis yolu (baraj önünden)
    if (Math.abs(x + 16) <= 1.6 && z > 2) b.road[c] = 1; // ana yol
    if (Math.abs(z - 6) <= 1.4 && x > -24 && x < 26) b.road[c] = 1; // iç yol
    if (x > 12 && x < 28 && z > -14 && z < -2) b.road[c] = 3; // şalt sahası çakılı
    if (x > -9 && x < 9 && z > -12 && z < 2) b.road[c] = 3; // santral platformu
  });

  const buildings: BuildingDef[] = [
    { kind: 'dam', name: 'Baraj Gövdesi', x: 0, z: HES.damZ, w: 64, d: HES.damD, h: 13 },
    { kind: 'penstock', name: 'Cebri Borular', x: 0, z: -17, w: 7, d: 12, h: 3 },
    { kind: 'turbinehall', name: 'Santral Binası', x: 0, z: -6, w: 13, d: 7, h: 9 },
    { kind: 'trafo', name: 'Ana Trafo', x: 17, z: -8, w: 3, d: 3, h: 3.8 },
    { kind: 'trafo', name: 'Yardımcı Trafo', x: 22, z: -8, w: 3, d: 3, h: 3.4 },
    { kind: 'tank', name: 'Trafo Yağı Tankı', x: 24, z: 16, w: 4, d: 4, h: 4.5 },
    { kind: 'control', name: 'Kontrol Binası', x: -22, z: 14, w: 7, d: 4, h: 4.2 },
    { kind: 'depot', name: 'Malzeme Deposu', x: -8, z: 20, w: 4.5, d: 3, h: 3.2 },
    { kind: 'container', name: 'Yedek Parça Konteyneri', x: 18, z: 22, w: 4, d: 2.5, h: 2.8 },
  ];
  for (const bd of buildings) {
    if (bd.kind === 'dam') {
      // gövde geçilmez; zemin tepeye çıktığı için görüş engeli yalnızca korkuluk kadar
      b.obstacle(bd.x - bd.w / 2, bd.z - bd.d / 2, bd.x + bd.w / 2, bd.z + bd.d / 2, 1, 1.0);
      continue;
    }
    if (bd.kind === 'tank') {
      const r = bd.w / 2;
      b.forRect(bd.x - r, bd.z - r, bd.x + r, bd.z + r, (_i, _j, c) => {
        if (Math.hypot(b.cx(_i) - bd.x, b.cx(_j) - bd.z) <= r - 0.2) {
          b.obsType[c] = 1;
          b.obsH[c] = Math.max(b.obsH[c], bd.h);
          b.nav[c] = 1;
        }
      });
    } else b.obstacle(bd.x - bd.w / 2, bd.z - bd.d / 2, bd.x + bd.w / 2, bd.z + bd.d / 2, 1, bd.h);
  }
  // rezervuar: barajın arkası yürünmez (su)
  b.forAll((_i, _j, c, _x, z) => {
    if (z < HES.damZ - HES.damD / 2 - HES.shoreGap) b.nav[c] = 1;
  });
  // kuyruk suyu kanalı: yürünmez, köprü hariç
  const ch = HES.channel;
  b.forRect(ch.x0, ch.z0, ch.x1, ch.z1, (_i, _j, c) => {
    const z = b.cx(_j);
    if (z >= HES.bridgeZ.z0 && z <= HES.bridgeZ.z1) return; // köprü
    b.nav[c] = 1;
    b.road[c] = 0;
  });

  const trees: MapData['trees'] = [];
  const bushes: MapData['bushes'] = [];
  const rocks: MapData['rocks'] = [];
  const tryTree = (x: number, z: number, s: number, kind: number) => {
    const i = b.ci(x), j = b.ci(z);
    if (i < 1 || j < 1 || i >= b.N - 1 || j >= b.N - 1) return;
    const c = idx(b, i, j);
    if (!b.free(c) || b.inside[c]) return;
    if (z < HES.damZ + 2) return; // rezervuar / baraj
    if (x > ch.x0 - 1.5 && x < ch.x1 + 1.5 && z > ch.z0) return; // kanal
    if (Math.abs(Math.max(Math.abs(b.cx(i)), Math.abs(b.cx(j))) - 32.5) < 1.6) return;
    trees.push({ x: b.cx(i) + (rnd() - 0.5) * 0.4, z: b.cx(j) + (rnd() - 0.5) * 0.4, s, kind });
    b.obstacle(b.cx(i) - 0.5, b.cx(j) - 0.5, b.cx(i) + 0.5, b.cx(j) + 0.5, 3, 4.8 * s);
  };
  for (let n = 0; n < 420; n++) {
    const side = Math.floor(rnd() * 3) + 1; // kuzey yok (su)
    const t = -42 + rnd() * 84;
    const d = 34.5 + rnd() * 7.5;
    const [x, z] = side === 1 ? [t, d] : side === 2 ? [d, t] : [-d, t];
    if (side === 1 && Math.abs(x + 16) < 4) continue;
    tryTree(x, z, 0.8 + rnd() * 0.6, rnd() < 0.65 ? 0 : 1);
  }
  const tryBush = (x: number, z: number, s: number, allowInside = false) => {
    const i = b.ci(x), j = b.ci(z), c = idx(b, i, j);
    if (b.nav[c] !== 0 || b.obsType[c] !== 0 || b.road[c] === 1) return;
    if (b.inside[c] && !allowInside) return;
    bushes.push({ x: b.cx(i), z: b.cx(j), s });
    b.obsType[c] = 4;
    b.obsH[c] = 1.25 * s;
  };
  for (let n = 0; n < 50; n++) tryBush(-33.5 - rnd() * 2, -20 + rnd() * 52, 0.8 + rnd() * 0.5);
  for (let n = 0; n < 50; n++) tryBush(33.5 + rnd() * 2, -20 + rnd() * 52, 0.8 + rnd() * 0.5);
  for (let n = 0; n < 16; n++) tryBush(-31 + rnd() * 4, -18 + rnd() * 10, 0.9 + rnd() * 0.4, true);
  for (let n = 0; n < 12; n++) tryBush(27 + rnd() * 4, 24 + rnd() * 5, 0.9 + rnd() * 0.4, true);
  for (let n = 0; n < 10; n++) tryBush(-30 + rnd() * 6, 24 + rnd() * 5, 0.9 + rnd() * 0.4, true);
  // yamaç kayaları
  for (let n = 0; n < 40; n++) {
    const x = (rnd() < 0.5 ? -1 : 1) * (31 + rnd() * 9), z = HES.damZ - 2 + rnd() * 20;
    const i = b.ci(x), j = b.ci(z), c = idx(b, i, j);
    if (i < 1 || j < 1 || i >= b.N - 1 || j >= b.N - 1 || !b.free(c) || b.inside[c]) continue;
    const s = 0.7 + rnd() * 1.2;
    rocks.push({ x, z, s });
    b.obstacle(b.cx(i) - 0.5, b.cx(j) - 0.5, b.cx(i) + 0.5, b.cx(j) + 0.5, 6, 1.5 * s);
  }

  growFill(b, rnd, trees, bushes, b.cx(b.fMax));
  b.fence();
  // kuzey çiti barajın ARKASINDAKİ kıyı şeridinde: tesis ve barajın tamamı çit içinde, baraj ile çit arası kuru. Hırsız tekneyle kıyıya çıkar, çiti keser, barajı aşar
  const zN = HES.damZ - HES.damD / 2 - HES.shoreGap + 1.5; // kıyı şeridinin ortası
  const jN = b.ci(zN);
  for (let i = b.fMin; i <= b.fMax; i++) {
    for (let j = b.fMin; j < jN; j++) {
      const c = idx(b, i, j);
      if (b.nav[c] === 2) {
        b.nav[c] = 1; // su / yamaç
        b.obsType[c] = 0;
      }
      b.inside[c] = 0;
    }
    const c = idx(b, i, jN);
    b.inside[c] = 0;
    b.nav[c] = 2;
    b.obsType[c] = 5;
    b.obsH[c] = 0;
    b.road[c] = 0;
  }
  const gates = [makeGate(b, 'g-main', 'Ana Giriş Kapısı', 'S', -16, 4, true), makeGate(b, 'g-east', 'Doğu Servis Kapısı', 'E', 6, 4, false)];

  const assets: CriticalAsset[] = [
    { id: 'salt', name: 'Şalt Sahası', kind: 'trafo', x: 19.5, z: -8, ax: 19.5, az: -4.5, weight: 3 },
    { id: 'pen', name: 'Cebri Borular', kind: 'penstock', x: 0, z: -17, ax: -6, az: -17, weight: 2.4 },
    { id: 'hall', name: 'Santral Binası', kind: 'hall', x: 0, z: -6, ax: 9, az: -6, weight: 1.6 },
    { id: 'oil', name: 'Trafo Yağı Tankı', kind: 'tank', x: 24, z: 16, ax: 24, az: 12.5, weight: 2.2 },
    { id: 'depot', name: 'Malzeme Deposu', kind: 'depot', x: -8, z: 20, ax: -8, az: 17.5, weight: 2 },
    { id: 'cont', name: 'Yedek Parça Konteyneri', kind: 'depot', x: 18, z: 22, ax: 18, az: 19.5, weight: 1.8 },
    { id: 'control', name: 'Kontrol Binası', kind: 'control', x: -22, z: 14, ax: -22, az: 17, weight: 1.2 },
  ];

  const zones: Zone[] = [
    { name: 'Şalt sahası', x0: 12, z0: -14, x1: 28, z1: -2, critical: true },
    { name: 'Cebri borular', x0: -6, z0: -24, x1: 6, z1: -11, critical: true },
    { name: 'Santral binası çevresi', x0: -9, z0: -11, x1: 10, z1: 1, critical: true },
    { name: 'Trafo yağı tankı', x0: 20, z0: 11, x1: 28, z1: 21, critical: true },
    { name: 'Kontrol binası çevresi', x0: -27, z0: 10, x1: -17, z1: 19, critical: true },
    { name: 'Malzeme deposu', x0: -12, z0: 16, x1: -4, z1: 24, critical: true },
    { name: 'Yedek parça konteyneri', x0: 14, z0: 19, x1: 22, z1: 26, critical: true },
    { name: 'Baraj gövdesi', x0: -32, z0: -30, x1: 32, z1: -22 },
    { name: 'Kuyruk suyu kanalı', x0: 2, z0: -2, x1: 11, z1: 32 },
    { name: 'Batı çit hattı', x0: -32, z0: -22, x1: -28, z1: 32 },
    { name: 'Doğu çit hattı', x0: 28, z0: -22, x1: 32, z1: 32 },
    { name: 'Güney çit hattı', x0: -32, z0: 28, x1: 32, z1: 32 },
  ];

  addRisk(b, (x, z) => {
    let r = 1;
    const m = Math.max(Math.abs(x), Math.abs(z));
    if (m > 28 && z > HES.damZ + 4) r = x < -27 ? 2 : 1;
    if (x > 12 && x < 28 && z > -14 && z < -2) r = 3;
    if (x > -6 && x < 6 && z > -24 && z < -11) r = 3;
    if (Math.hypot(x - 24, z - 16) < 5) r = Math.max(r, 2);
    if (x > -12 && x < -4 && z > 16 && z < 24) r = 2;
    if (x > 14 && x < 22 && z > 19 && z < 26) r = Math.max(r, 2);
    if (z < HES.damZ + 6 && Math.abs(x) > 8) r = Math.max(r, 2); // baraj önü, yamaç dibi
    return r;
  });
  for (const bu of bushes) {
    b.forRect(bu.x - 2.5, bu.z - 2.5, bu.x + 2.5, bu.z + 2.5, (_i, _j, c) => {
      if (b.inside[c] || b.nav[c] === 2) b.risk[c] = Math.max(b.risk[c], 2);
    });
  }

  const spawns = spawnRing(b, 36 + grow, 3, (x, z, side) => {
    if (side === 'N') return 0; // rezervuar: su
    if (z < HES.damZ) return 0;
    let w = side === 'W' ? 3 : side === 'E' ? 2.6 : 1;
    if (side === 'S' && Math.abs(x + 16) < 8) w = 0.2;
    if (side === 'S' && x > ch.x0 - 2 && x < ch.x1 + 2) return 0; // kanal
    if (side === 'E' && Math.abs(z - 6) < 5) w = 0.4;
    return w;
  });
  // rezervuar: tekneyle gelen hırsızlar (su üstünde doğum noktaları)
  const waterZ = -(b.cx(b.fMax) + 5);
  for (let x = -27; x <= 27; x += 6) spawns.push({ x, z: waterZ, weight: 2.2, side: 'N', boat: true });
  const crestY = heightAt(0, HES.damZ); // zemin tepeye çıkarıldı

  return finalize(b, {
    id: 'hes',
    fenceNorthZ: b.cx(jN),
    boat: { waterY: HES.waterY, shoreZ: HES.damZ - HES.damD / 2 - HES.shoreGap - 1.2, crestZ: HES.damZ + HES.damD / 2 - 0.8, crestY, footZ: HES.damZ + HES.damD / 2 + 4.5, fenceZ: b.cx(jN) },
    name: 'Çoruh HES-5 Hidroelektrik Santrali',
    buildings,
    panels: [],
    trees,
    bushes,
    rocks,
    turbines: [],
    gates,
    assets,
    zones,
    spawns,
    staffSpawns: [
      { x: -16, z: 39, gateId: 'g-main' },
      { x: 39, z: 6, gateId: 'g-east' },
    ],
  });
}

// ───────────────────────────── BESS (Batarya Enerji Depolama Tesisi) ─────────────────────────────
export function buildBESS(grow = 0, opts: MapOpts = {}): MapData {
  const rnd = mulberry32(6061);
  const heightAt = (x: number, z: number) => {
    const d = Math.max(Math.abs(x), Math.abs(z)) - 27.5;
    const ramp = smoothstep(0, 7, d);
    let h = 1.0 + 0.8 * Math.sin(x * 0.2 + 0.6) * Math.cos(z * 0.18 + 0.3) + 2.6 * gauss(x, z, -34, -30, 6) + 2.2 * gauss(x, z, 33, 28, 6) + 1.8 * gauss(x, z, 32, -28, 5);
    if (Math.abs(x) < 4 && z > 0) h *= 0.15;
    return Math.max(0, h * ramp);
  };
  const b = new Builder(72, 10, heightAt, grow);

  // yollar: çevre yolu + ana yol + sıra aralarında servis yolları
  b.forAll((_i, _j, c, x, z) => {
    const m = Math.max(Math.abs(x), Math.abs(z));
    if (b.inside[c] && m >= 22.5 + grow) b.road[c] = 2;
    if (Math.abs(x) <= 1.6 && z > -24.5) b.road[c] = 1; // ana yol
    if (Math.abs(z - 12) <= 1.4 && x > -22 && x < 22) b.road[c] = 1; // güney iç yol
    if (x > 10 && x < 23 && z > 14 && z < 24) b.road[c] = 3; // şalt sahası çakılı
    // batarya blokları çakıl zemin
    for (const bx of [-13.5, 13.5]) for (const bz of [-15, -3]) if (Math.abs(x - bx) < 9.5 && Math.abs(z - bz) < 4.6) b.road[c] = 3;
  });
  // otopark
  b.forRect(-13.6, 16, -10, 22, (_i, _j, c) => (b.road[c] = 2));

  // batarya konteynerleri: 4 blok × 3 konteyner, aralarında PCS/inverter skidleri
  const BLOCKS = [
    { id: 'A', x: -13.5, z: -15 },
    { id: 'B', x: 13.5, z: -15 },
    { id: 'C', x: -13.5, z: -3 },
    { id: 'D', x: 13.5, z: -3 },
  ];
  const buildings: BuildingDef[] = [];
  for (const bl of BLOCKS) {
    for (let k = -1; k <= 1; k++) buildings.push({ kind: 'battery', name: `Batarya Konteyneri ${bl.id}${k + 2}`, x: bl.x + k * 6.2, z: bl.z - 1.2, w: 5.6, d: 2.6, h: 2.9 });
    buildings.push({ kind: 'pcs', name: `PCS-${bl.id} İnverter Skidi`, x: bl.x, z: bl.z + 2.6, w: 3.2, d: 1.8, h: 2.3 });
  }
  buildings.push(
    { kind: 'trafo', name: 'Ana Trafo', x: 14.5, z: 19, w: 3, d: 3, h: 3.8 },
    { kind: 'trafo', name: 'Yardımcı Trafo', x: 19.5, z: 19, w: 3, d: 3, h: 3.4 },
    { kind: 'control', name: 'Kontrol Binası', x: -17.5, z: 19, w: 7, d: 4, h: 4.2 },
    { kind: 'depot', name: 'Yedek Modül Deposu', x: -6.5, z: 19.5, w: 4.5, d: 3, h: 3.2 },
    { kind: 'container', name: 'Yangın Söndürme Konteyneri', x: 5.5, z: 19.5, w: 4, d: 2.5, h: 2.8 }
  );
  for (const bd of buildings) b.obstacle(bd.x - bd.w / 2, bd.z - bd.d / 2, bd.x + bd.w / 2, bd.z + bd.d / 2, 1, bd.h);

  const trees: MapData['trees'] = [];
  const bushes: MapData['bushes'] = [];
  const rocks: MapData['rocks'] = [];
  const tryTree = (x: number, z: number, s: number, kind: number) => {
    const i = b.ci(x), j = b.ci(z);
    if (i < 1 || j < 1 || i >= b.N - 1 || j >= b.N - 1) return;
    const c = idx(b, i, j);
    if (!b.free(c) || b.inside[c]) return;
    if (Math.abs(Math.max(Math.abs(b.cx(i)), Math.abs(b.cx(j))) - 25.5) < 1.6) return;
    trees.push({ x: b.cx(i) + (rnd() - 0.5) * 0.4, z: b.cx(j) + (rnd() - 0.5) * 0.4, s, kind });
    b.obstacle(b.cx(i) - 0.5, b.cx(j) - 0.5, b.cx(i) + 0.5, b.cx(j) + 0.5, 3, 4.8 * s);
  };
  for (let n = 0; n < 360; n++) {
    const side = Math.floor(rnd() * 4);
    const t = -36 + rnd() * 72;
    const d = 27.5 + rnd() * 8;
    const [x, z] = side === 0 ? [t, -d] : side === 1 ? [t, d] : side === 2 ? [d, t] : [-d, t];
    if (side === 1 && Math.abs(x) < 4) continue;
    tryTree(x, z, 0.8 + rnd() * 0.6, rnd() < 0.5 ? 0 : 1);
  }
  const tryBush = (x: number, z: number, s: number, allowInside = false) => {
    const i = b.ci(x), j = b.ci(z), c = idx(b, i, j);
    if (b.nav[c] !== 0 || b.obsType[c] !== 0 || b.road[c] === 1) return;
    if (b.inside[c] && !allowInside) return;
    bushes.push({ x: b.cx(i), z: b.cx(j), s });
    b.obsType[c] = 4;
    b.obsH[c] = 1.25 * s;
  };
  for (let n = 0; n < 60; n++) tryBush(-25 + rnd() * 50, -26.5 - rnd() * 2, 0.8 + rnd() * 0.5);
  for (let n = 0; n < 50; n++) tryBush(-26.5 - rnd() * 2, -25 + rnd() * 50, 0.8 + rnd() * 0.5);
  for (let n = 0; n < 40; n++) tryBush(26.5 + rnd() * 2, -25 + rnd() * 50, 0.8 + rnd() * 0.5);
  for (let n = 0; n < 12; n++) tryBush(-24.5 + rnd() * 2, -22 + rnd() * 10, 0.9 + rnd() * 0.4, true);
  for (let n = 0; n < 10; n++) tryBush(21 + rnd() * 3.5, -24.5 + rnd() * 5, 0.9 + rnd() * 0.4, true);
  for (let n = 0; n < 8; n++) tryBush(-24.5 + rnd() * 3, 22 + rnd() * 2.5, 0.9 + rnd() * 0.4, true);
  for (let n = 0; n < 20; n++) {
    const x = 28 + rnd() * 8, z = -36 + rnd() * 12;
    const i = b.ci(x), j = b.ci(z), c = idx(b, i, j);
    if (!b.free(c)) continue;
    const s = 0.6 + rnd() * 1.0;
    rocks.push({ x, z, s });
    b.obstacle(b.cx(i) - 0.5, b.cx(j) - 0.5, b.cx(i) + 0.5, b.cx(j) + 0.5, 6, 1.4 * s);
  }

  growFill(b, rnd, trees, bushes, b.cx(b.fMax));
  b.fence();
  const gates = [makeGate(b, 'g-main', 'Ana Giriş Kapısı', 'S', 0, 4, true), makeGate(b, 'g-east', 'Doğu Servis Kapısı', 'E', 0, 4, false)];

  const assets: CriticalAsset[] = [
    { id: 'salt', name: 'Şalt Sahası', kind: 'trafo', x: 17, z: 19, ax: 17, az: 15.5, weight: 3 },
    ...BLOCKS.map((bl) => ({ id: `blk${bl.id}`, name: `Batarya Bloğu ${bl.id}`, kind: 'battery' as const, x: bl.x, z: bl.z - 1.2, ax: bl.x, az: bl.z - 4.2, weight: bl.id === 'A' || bl.id === 'B' ? 2.6 : 2.2 })),
    { id: 'pcsA', name: 'PCS-A İnverter Skidi', kind: 'inverter', x: -13.5, z: -0.4, ax: -13.5, az: 1.6, weight: 1.8 },
    { id: 'pcsB', name: 'PCS-B İnverter Skidi', kind: 'inverter', x: 13.5, z: -0.4, ax: 13.5, az: 1.6, weight: 1.8 },
    { id: 'depot', name: 'Yedek Modül Deposu', kind: 'depot', x: -6.5, z: 19.5, ax: -6.5, az: 17, weight: 2 },
    { id: 'control', name: 'Kontrol Binası', kind: 'control', x: -17.5, z: 19, ax: -17.5, az: 22, weight: 1.2 },
  ];

  const zones: Zone[] = [
    { name: 'Şalt sahası', x0: 10, z0: 14, x1: 23, z1: 24, critical: true },
    ...BLOCKS.map((bl) => ({ name: `Batarya bloğu ${bl.id}`, x0: bl.x - 10, z0: bl.z - 4.5, x1: bl.x + 10, z1: bl.z + 4.5, critical: true })),
    { name: 'Kontrol binası çevresi', x0: -24, z0: 14, x1: -12.5, z1: 24, critical: true },
    { name: 'Yedek modül deposu', x0: -10, z0: 16, x1: -3, z1: 24, critical: true },
    { name: 'Kuzey çit hattı', x0: -25, z0: -25, x1: 25, z1: -21 },
    { name: 'Batı çit hattı', x0: -25, z0: -25, x1: -21, z1: 25 },
    { name: 'Doğu çit hattı', x0: 21, z0: -25, x1: 25, z1: 25 },
    { name: 'Güney çit hattı', x0: -25, z0: 21, x1: 25, z1: 25 },
    { name: 'Ana giriş kapısı', x0: -6, z0: 19, x1: 6, z1: 25 },
  ];

  addRisk(b, (x, z) => {
    let r = 1;
    const m = Math.max(Math.abs(x), Math.abs(z));
    if (m > 21) r = z < -20 || x < -20 ? 2 : 1;
    if (x > 10 && x < 23 && z > 14 && z < 24) r = 3;
    for (const bl of BLOCKS) if (Math.abs(x - bl.x) < 10 && Math.abs(z - bl.z) < 5) r = Math.max(r, bl.id === 'A' || bl.id === 'B' ? 3 : 2);
    if (x > -10 && x < -3 && z > 16 && z < 24) r = Math.max(r, 2);
    if (x < -18 && z < -18) r = 3;
    return r;
  });
  for (const bu of bushes) {
    b.forRect(bu.x - 2.5, bu.z - 2.5, bu.x + 2.5, bu.z + 2.5, (_i, _j, c) => {
      if (b.inside[c] || b.nav[c] === 2) b.risk[c] = Math.max(b.risk[c], 2);
    });
  }

  const spawns = spawnRing(b, 31 + grow, 3, (x, z, side) => {
    let w = side === 'N' ? 3 : side === 'W' ? 2.6 : side === 'E' ? 1.8 : 0.8;
    if (side === 'S' && Math.abs(x) < 8) w = 0.2;
    if (side === 'E' && Math.abs(z) < 6) w = 0.4;
    return w;
  });

  return finalize(b, {
    id: 'bess',
    name: 'Konya BESS-6 Batarya Depolama Tesisi',
    buildings,
    panels: [],
    trees,
    bushes,
    rocks,
    turbines: [],
    gates,
    assets,
    zones,
    spawns,
    staffSpawns: [
      { x: 0, z: 34, gateId: 'g-main' },
      { x: 34, z: 0, gateId: 'g-east' },
    ],
  });
}

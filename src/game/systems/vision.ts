import { EQUIPMENT, levelMult } from '../config/equipment';
import type { Device, EquipmentSpec, MapData, Weather } from '../types';
import { angleDiff, cellAt, cellIndexOf, cellX, idx, inBounds } from '../world/grid';

// CameraCoverageSystem çekirdeği: gerçek görüş konisi + line-of-sight.
// Arazi yükseltisi, bina/panel/ağaç yükseklikleri ve çalılar dikkate alınır.

export interface Env {
  night: boolean;
  weather: Weather;
  lit: Uint8Array; // hücre aydınlık mı
  boosts: { x: number; z: number; r: number; until: number }[];
  time: number;
  /** toz fırtınası: menzil çarpanı (1 = yok) */
  dust?: number;
}

export function losClear(
  map: MapData,
  ex: number,
  ey: number,
  ez: number,
  tx: number,
  ty: number,
  tz: number,
  ignoreFoliage: boolean
): boolean {
  const dx = tx - ex;
  const dz = tz - ez;
  const dist = Math.hypot(dx, dz);
  if (dist < 0.9) return true;
  const steps = Math.ceil(dist / 0.45);
  for (let s = 1; s < steps; s++) {
    const t = s / steps;
    const d = t * dist;
    if (d < 0.75 || dist - d < 0.55) continue;
    const x = ex + dx * t;
    const z = ez + dz * t;
    const y = ey + (ty - ey) * t;
    const ground = map.heightAt(x, z);
    if (y < ground) return false;
    const c = cellAt(map, x, z);
    if (c < 0) continue;
    const type = map.obsType[c];
    if (type === 0 || type === 5) continue;
    if (ignoreFoliage && type === 4) continue;
    if (y < ground + map.obsH[c]) return false;
  }
  return true;
}

export function isLit(env: Env, map: MapData, x: number, z: number): boolean {
  const c = cellAt(map, x, z);
  if (c >= 0 && env.lit[c]) return true;
  for (const b of env.boosts) {
    if (b.until > env.time && Math.hypot(x - b.x, z - b.z) < b.r) return true;
  }
  return false;
}

export function effectiveRange(spec: EquipmentSpec, lvl: 1 | 2, env: Env, map: MapData, x: number, z: number): number {
  let r = spec.range * levelMult(lvl);
  if (env.weather === 'fog') r *= spec.thermal ? 0.9 : 0.68;
  else if (env.weather === 'rain') r *= spec.thermal ? 0.95 : 0.85;
  if (env.night && !spec.thermal) r *= isLit(env, map, x, z) ? 0.95 : spec.nightFactor;
  // toz fırtınası: optik kameralar yarıya iner, termal / drone / Desecure ürünleri daha dayanıklı
  if (env.dust && env.dust < 1) r *= spec.thermal || spec.bonus || spec.type === 'drone' ? 0.5 + env.dust * 0.5 : env.dust;
  return r;
}

export function deviceEye(map: MapData, d: Device) {
  const spec = EQUIPMENT[d.type];
  return { x: d.x, y: map.heightAt(d.x, d.z) + spec.mountHeight, z: d.z };
}

/** Bir kamera benzeri cihaz (x,z) noktasındaki targetH yüksekliğindeki hedefi görebiliyor mu? */
export function cameraSees(
  map: MapData,
  env: Env,
  d: Device,
  yaw: number,
  fovDeg: number,
  px: number,
  pz: number,
  targetH: number
): { seen: boolean; dist: number; range: number } {
  const spec = EQUIPMENT[d.type];
  const dx = px - d.x;
  const dz = pz - d.z;
  const dist = Math.hypot(dx, dz);
  const range = effectiveRange(spec, d.level, env, map, px, pz);
  if (dist > range) return { seen: false, dist, range };
  if (fovDeg < 360 && dist > 0.8) {
    const a = Math.atan2(dz, dx);
    const half = ((fovDeg / 2) * Math.PI) / 180;
    // çift başlı kamera (fuar modu): iki yönden biri görüyorsa yeter
    const inView = Math.abs(angleDiff(a, yaw)) <= half || (d.yaw2 !== undefined && Math.abs(angleDiff(a, d.yaw2)) <= half);
    if (!inView) return { seen: false, dist, range };
  }
  const eye = deviceEye(map, d);
  const ok = losClear(map, eye.x, eye.y, eye.z, px, map.heightAt(px, pz) + targetH, pz, !!spec.thermal);
  return { seen: ok, dist, range };
}

export function motionSees(map: MapData, d: Device, px: number, pz: number, targetH: number): boolean {
  const r = EQUIPMENT.motion.range * levelMult(d.level);
  const dist = Math.hypot(px - d.x, pz - d.z);
  if (dist > r) return false;
  const ey = map.heightAt(d.x, d.z) + 1.1;
  return losClear(map, d.x, ey, d.z, px, map.heightAt(px, pz) + targetH, pz, false);
}

/** Çevre sensörünün koruduğu çit hattı segmenti */
export function perimeterSegment(map: MapData, d: Device) {
  const lim = map.fMax - map.N / 2 + 0.5;
  const len = 8 * levelMult(d.level);
  const dists = [
    { side: 'N', v: Math.abs(d.z + lim) },
    { side: 'S', v: Math.abs(d.z - lim) },
    { side: 'W', v: Math.abs(d.x + lim) },
    { side: 'E', v: Math.abs(d.x - lim) },
  ].sort((a, b) => a.v - b.v);
  const side = dists[0].side as 'N' | 'S' | 'E' | 'W';
  if (side === 'N' || side === 'S') {
    const z = side === 'N' ? -lim : lim;
    return { side, x0: d.x - len, z0: z, x1: d.x + len, z1: z };
  }
  const x = side === 'W' ? -lim : lim;
  return { side, x0: x, z0: d.z - len, x1: x, z1: d.z + len };
}

export function perimeterCovers(map: MapData, d: Device, px: number, pz: number): boolean {
  const s = perimeterSegment(map, d);
  if (s.side === 'N' || s.side === 'S') return px >= s.x0 && px <= s.x1 && Math.abs(pz - s.z0) < 1.6;
  return pz >= s.z0 && pz <= s.z1 && Math.abs(px - s.x0) < 1.6;
}

export function ptzSweepFov(d: Device) {
  return Math.min(360, EQUIPMENT[d.type].fov + 110);
}

/** Görüş konisi (render) için ışın-yürütme fan hesabı */
export function computeFan(
  map: MapData,
  env: Env,
  d: Device,
  yaw: number,
  fovDeg: number,
  targetH = 1.0
): { a: number; r: number }[] {
  const spec = EQUIPMENT[d.type];
  const maxR = spec.range * levelMult(d.level);
  const full = fovDeg >= 360;
  const span = full ? Math.PI * 2 : (fovDeg * Math.PI) / 180;
  const rays = Math.max(12, Math.round((span / (Math.PI * 2)) * 96));
  const eye = deviceEye(map, d);
  const out: { a: number; r: number }[] = [];
  for (let k = 0; k <= rays; k++) {
    const a = yaw - span / 2 + (span * k) / rays;
    const ca = Math.cos(a);
    const sa = Math.sin(a);
    let last = 0;
    for (let r = 0.6; r <= maxR; r += 0.5) {
      const x = d.x + ca * r;
      const z = d.z + sa * r;
      const c = cellAt(map, x, z);
      if (c < 0) break;
      const er = effectiveRange(spec, d.level, env, map, x, z);
      if (r > er) break;
      if (!losClear(map, eye.x, eye.y, eye.z, x, map.heightAt(x, z) + targetH, z, !!spec.thermal)) break;
      last = r;
    }
    out.push({ a, r: last });
  }
  return out;
}

/** Aydınlatma ızgarası (ışık direkleri + tesisin sabit aydınlatması) */
export function computeLit(map: MapData, devices: Device[]): Uint8Array {
  const lit = new Uint8Array(map.N * map.N);
  const sources: { x: number; z: number; r: number }[] = [];
  for (const d of devices) if (d.type === 'light') sources.push({ x: d.x, z: d.z, r: EQUIPMENT.light.range * levelMult(d.level) });
  for (const b of map.buildings) if (b.kind === 'control' || b.kind === 'trafo') sources.push({ x: b.x, z: b.z + b.d / 2 + 1, r: 4.5 });
  for (const g of map.gates) if (g.main) sources.push({ x: g.x, z: g.z, r: 5 });
  for (const s of sources) {
    const i0 = cellIndexOf(map, s.x - s.r), i1 = cellIndexOf(map, s.x + s.r);
    const j0 = cellIndexOf(map, s.z - s.r), j1 = cellIndexOf(map, s.z + s.r);
    for (let j = j0; j <= j1; j++)
      for (let i = i0; i <= i1; i++) {
        if (!inBounds(map, i, j)) continue;
        if (Math.hypot(cellX(map, i) - s.x, cellX(map, j) - s.z) <= s.r) lit[idx(map, i, j)] = 1;
      }
  }
  return lit;
}

export function staticLightSources(map: MapData) {
  const out: { x: number; z: number; r: number }[] = [];
  for (const b of map.buildings) if (b.kind === 'control' || b.kind === 'trafo') out.push({ x: b.x, z: b.z + b.d / 2 + 1, r: 4.5 });
  for (const g of map.gates) if (g.main) out.push({ x: g.x, z: g.z, r: 5 });
  return out;
}

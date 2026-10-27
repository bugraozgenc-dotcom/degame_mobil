import type { MapData } from '../types';

// Izgara yardımcıları — tüm sistemler (görüş, navigasyon, kapsama, render) bunları kullanır.

export const cellX = (map: { N: number }, i: number) => i - map.N / 2 + 0.5;
export const cellIndexOf = (map: { N: number }, x: number) => Math.floor(x + map.N / 2);
export const idx = (map: { N: number }, i: number, j: number) => j * map.N + i;
export const inBounds = (map: { N: number }, i: number, j: number) =>
  i >= 0 && j >= 0 && i < map.N && j < map.N;

export function cellAt(map: MapData, x: number, z: number): number {
  const i = cellIndexOf(map, x);
  const j = cellIndexOf(map, z);
  if (!inBounds(map, i, j)) return -1;
  return idx(map, i, j);
}

export function isInside(map: MapData, x: number, z: number): boolean {
  const c = cellAt(map, x, z);
  return c >= 0 && map.inside[c] === 1;
}

/** Çit dışına ne kadar uzak (negatif = içeride) */
export function outsideDistance(map: MapData, x: number, z: number): number {
  const lim = map.fMax - map.N / 2 + 0.5; // çit hattının dünya koordinatı (simetrik)
  return Math.max(Math.abs(x), Math.abs(z)) - lim;
}

export function fenceWorld(map: MapData) {
  return map.fMax - map.N / 2 + 0.5;
}
/** kuzey çit hattının z'si (HES'te baraj eteği, diğerlerinde −L) */
export function fenceNorth(map: MapData) {
  return map.fenceNorthZ ?? -fenceWorld(map);
}

export function sectorName(x: number, z: number): string {
  // kuzey = -z, doğu = +x
  const a = Math.atan2(-z, x); // 0 = doğu, pi/2 = kuzey
  const deg = ((a * 180) / Math.PI + 360) % 360;
  const names = ['Doğu', 'Kuzeydoğu', 'Kuzey', 'Kuzeybatı', 'Batı', 'Güneybatı', 'Güney', 'Güneydoğu'];
  const k = Math.round(deg / 45) % 8;
  if (Math.hypot(x, z) < 6) return 'Merkez';
  return names[k];
}

// Deterministik rastgele sayı üreteci
export function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const clamp = (v: number, a: number, b: number) => (v < a ? a : v > b ? b : v);
export const smoothstep = (a: number, b: number, v: number) => {
  const t = clamp((v - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};
export const gauss = (x: number, z: number, cx: number, cz: number, r: number) =>
  Math.exp(-((x - cx) ** 2 + (z - cz) ** 2) / (2 * r * r));

export function angleDiff(a: number, b: number) {
  let d = a - b;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return d;
}

export function distToSegment(px: number, pz: number, ax: number, az: number, bx: number, bz: number) {
  const dx = bx - ax;
  const dz = bz - az;
  const l2 = dx * dx + dz * dz;
  let t = l2 > 0 ? ((px - ax) * dx + (pz - az) * dz) / l2 : 0;
  t = clamp(t, 0, 1);
  return Math.hypot(px - (ax + t * dx), pz - (az + t * dz));
}

/** En yakın yürünebilir hücre merkezi (çit içi tercihli) */
export function nearestWalkable(map: MapData, x: number, z: number, insideOnly = true): { x: number; z: number } {
  const si = cellIndexOf(map, x);
  const sj = cellIndexOf(map, z);
  for (let r = 0; r < 20; r++) {
    let best: { x: number; z: number; d: number } | null = null;
    for (let dj = -r; dj <= r; dj++) {
      for (let di = -r; di <= r; di++) {
        if (Math.max(Math.abs(di), Math.abs(dj)) !== r) continue;
        const i = si + di;
        const j = sj + dj;
        if (!inBounds(map, i, j)) continue;
        const c = idx(map, i, j);
        if (map.nav[c] !== 0) continue;
        if (insideOnly && !map.inside[c]) continue;
        const cx = cellX(map, i);
        const cz = cellX(map, j);
        const d = Math.hypot(cx - x, cz - z);
        if (!best || d < best.d) best = { x: cx, z: cz, d };
      }
    }
    if (best) return { x: best.x, z: best.z };
  }
  return { x, z };
}

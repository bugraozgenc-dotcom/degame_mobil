import type { MapData, Vec2 } from '../types';
import { cellIndexOf, cellX, idx, inBounds } from '../world/grid';

// A* navigasyon — NPC'ler engellerin içinden geçmez.
export type NavProfile = 'intruder' | 'staff' | 'guard' | 'vehicle' | 'animal';

export interface NavContext {
  map: MapData;
  dynBlocked: Uint8Array; // büyük cihazların ayak izi
  openGates: Set<string>;
  /** fuar modu: kamera kapsamasındaki çit hücreleri (1) — hırsız/hayvan kapsama dışından girmeyi tercih eder */
  fenceCovered?: Uint8Array;
  /** fuar modu: kameraların gördüğü hücreler — akıllı hırsız bu hücrelerden kaçınır */
  camSeen?: Uint8Array;
}

/** fuar modu: kapsanan çit hücresinin maliyet çarpanı (14 × 3 = 42 ≈ 28 m dolaşma payı) */
const EXPO_COVERED_MULT = 3;

function cellCost(ctx: NavContext, c: number, profile: NavProfile): number {
  const { map } = ctx;
  if (ctx.dynBlocked[c]) return -1;
  const nav = map.nav[c];
  if (nav === 1) return -1;
  const covered = ctx.fenceCovered ? ctx.fenceCovered[c] : 0;
  if (nav === 2) {
    // fuar modu: kamera gören çit bölümü pahalı — yakında boşluk varsa (~30 m) oradan girilir,
    // uzaktaysa hırsız kendi yönündeki çiti keser (hepsi tek noktaya yığılmaz)
    if (profile === 'intruder') return covered ? 14 * EXPO_COVERED_MULT : 14;
    if (profile === 'animal') return covered ? 10 * 60 : 10;
    return -1;
  }
  if (nav === 3) {
    const g = map.gates.find((g) => g.cells.includes(c));
    const open = g ? ctx.openGates.has(g.id) : false;
    // fuar modu: kapalı kapı da çit kadar zor (hırsızlar tek kapıya yığılmasın, her yerden girsinler)
    if (profile === 'intruder') return (open ? 1 : ctx.fenceCovered ? 14 : 8) * (covered ? EXPO_COVERED_MULT : 1);
    if (profile === 'animal') return (open ? 1 : 30) * (covered ? 60 : 1);
    return 1;
  }
  let cost = 1;
  const t = map.obsType[c];
  if (t === 4) cost = profile === 'intruder' ? 0.75 : profile === 'vehicle' ? 3 : 1.4; // hırsızlar çalılığı sever
  if (profile === 'vehicle') cost *= map.road[c] ? 0.6 : 1.3;
  if (profile === 'staff') cost *= map.road[c] ? 0.7 : 1.15;
  if (profile === 'intruder' && map.road[c] === 1) cost *= 1.25; // ana yoldan kaçınır
  // fuar modu: akıllı hırsız kameranın gördüğü alandan geçmemek için dolanır
  if (profile === 'intruder' && ctx.camSeen && ctx.camSeen[c]) cost += 12;
  return cost;
}

// basit ikili yığın
class Heap {
  ids: number[] = [];
  pri: number[] = [];
  push(id: number, p: number) {
    const a = this.ids, b = this.pri;
    a.push(id);
    b.push(p);
    let i = a.length - 1;
    while (i > 0) {
      const pa = (i - 1) >> 1;
      if (b[pa] <= b[i]) break;
      [a[pa], a[i]] = [a[i], a[pa]];
      [b[pa], b[i]] = [b[i], b[pa]];
      i = pa;
    }
  }
  pop(): number {
    const a = this.ids, b = this.pri;
    const top = a[0];
    const lastA = a.pop()!, lastB = b.pop()!;
    if (a.length) {
      a[0] = lastA;
      b[0] = lastB;
      let i = 0;
      for (;;) {
        const l = i * 2 + 1, r = l + 1;
        let m = i;
        if (l < a.length && b[l] < b[m]) m = l;
        if (r < a.length && b[r] < b[m]) m = r;
        if (m === i) break;
        [a[m], a[i]] = [a[i], a[m]];
        [b[m], b[i]] = [b[i], b[m]];
        i = m;
      }
    }
    return top;
  }
  get size() {
    return this.ids.length;
  }
}

const DIRS = [
  [1, 0, 1],
  [-1, 0, 1],
  [0, 1, 1],
  [0, -1, 1],
  [1, 1, Math.SQRT2],
  [1, -1, Math.SQRT2],
  [-1, 1, Math.SQRT2],
  [-1, -1, Math.SQRT2],
];

let buf: { n: number; g: Float32Array; came: Int32Array; closed: Uint8Array } | null = null;

export function findPath(ctx: NavContext, from: Vec2, to: Vec2, profile: NavProfile): Vec2[] | null {
  const { map } = ctx;
  const N = map.N;
  let si = cellIndexOf(map, from.x), sj = cellIndexOf(map, from.z);
  let ti = cellIndexOf(map, to.x), tj = cellIndexOf(map, to.z);
  if (!inBounds(map, si, sj) || !inBounds(map, ti, tj)) return null;
  const start = idx(map, si, sj);
  let goal = idx(map, ti, tj);
  if (cellCost(ctx, goal, profile) < 0) {
    // hedef engelliyse en yakın geçilebilir komşuyu bul
    let best = -1, bd = 1e9;
    for (let r = 1; r < 6 && best < 0; r++)
      for (let dj = -r; dj <= r; dj++)
        for (let di = -r; di <= r; di++) {
          const i = ti + di, j = tj + dj;
          if (!inBounds(map, i, j)) continue;
          const c = idx(map, i, j);
          if (cellCost(ctx, c, profile) < 0) continue;
          const d = di * di + dj * dj;
          if (d < bd) { bd = d; best = c; }
        }
    if (best < 0) return null;
    goal = best;
    ti = goal % N;
    tj = Math.floor(goal / N);
  }
  if (!buf || buf.n !== N * N) buf = { n: N * N, g: new Float32Array(N * N), came: new Int32Array(N * N), closed: new Uint8Array(N * N) };
  const { g, came, closed } = buf;
  g.fill(Infinity);
  came.fill(-1);
  closed.fill(0);
  const heap = new Heap();
  g[start] = 0;
  heap.push(start, 0);
  let iter = 0;
  while (heap.size && iter++ < 40000) {
    const cur = heap.pop();
    if (cur === goal) break;
    if (closed[cur]) continue;
    closed[cur] = 1;
    const ci = cur % N, cj = (cur - ci) / N;
    for (const [di, dj, dc] of DIRS) {
      const ni = ci + di, nj = cj + dj;
      if (ni < 0 || nj < 0 || ni >= N || nj >= N) continue;
      const nc = nj * N + ni;
      if (closed[nc]) continue;
      const cost = cellCost(ctx, nc, profile);
      if (cost < 0) continue;
      if (di !== 0 && dj !== 0) {
        // köşe kesme yok
        if (cellCost(ctx, cj * N + ni, profile) < 0 || cellCost(ctx, nj * N + ci, profile) < 0) continue;
        // çitte çapraz geçiş yok
        if (map.nav[nc] === 2 || map.nav[nc] === 3) continue;
      }
      const ng = g[cur] + dc * cost;
      if (ng < g[nc]) {
        g[nc] = ng;
        came[nc] = cur;
        const h = Math.hypot(ni - ti, nj - tj) * 0.6;
        heap.push(nc, ng + h);
      }
    }
  }
  if (came[goal] < 0 && goal !== start) return null;
  const cells: number[] = [];
  for (let c = goal; c !== -1; c = came[c]) {
    cells.push(c);
    if (c === start) break;
  }
  cells.reverse();
  return cellsToPath(map, cells, goal === idx(map, cellIndexOf(map, to.x), cellIndexOf(map, to.z)) ? to : null);
}

/** hücre dizisini yol noktalarına çevirir (doğrusal noktalar sadeleşir, çit hücreleri korunur) */
function cellsToPath(map: MapData, cells: number[], exact: Vec2 | null): Vec2[] {
  const N = map.N;
  const pts: Vec2[] = [];
  let lastDir = '';
  for (let k = 0; k < cells.length; k++) {
    const c = cells[k];
    const i = c % N, j = Math.floor(c / N);
    const p = { x: cellX(map, i), z: cellX(map, j) };
    if (k > 0 && k < cells.length - 1) {
      const n = cells[k + 1];
      const dir = `${(n % N) - i},${Math.floor(n / N) - j}`;
      const isFence = map.nav[c] === 2 || map.nav[c] === 3;
      if (dir === lastDir && !isFence) {
        lastDir = dir;
        continue;
      }
      lastDir = dir;
    }
    pts.push(p);
  }
  if (pts.length && exact) pts[pts.length - 1] = { x: exact.x, z: exact.z };
  return pts;
}

/**
 * Hedeften geriye maliyet alanı (Dijkstra): her hücreden hedefe en ucuz yolun maliyeti.
 * Fuar modunda akıllı hırsız, hedefine en ucuz yoldan (boşluk / kör nokta) ulaşabileceği
 * doğum noktasını seçmek için kullanır; böylece çit dışında uzun dolaşma olmaz.
 */
export function costField(ctx: NavContext, to: Vec2, profile: NavProfile): Float32Array {
  const { map } = ctx;
  const N = map.N;
  const g = new Float32Array(N * N).fill(Infinity);
  const ti = cellIndexOf(map, to.x), tj = cellIndexOf(map, to.z);
  if (!inBounds(map, ti, tj)) return g;
  let goal = idx(map, ti, tj);
  if (cellCost(ctx, goal, profile) < 0) {
    let best = -1, bd = 1e9;
    for (let r = 1; r < 6 && best < 0; r++)
      for (let dj = -r; dj <= r; dj++)
        for (let di = -r; di <= r; di++) {
          const i = ti + di, j = tj + dj;
          if (!inBounds(map, i, j)) continue;
          const c = idx(map, i, j);
          if (cellCost(ctx, c, profile) < 0) continue;
          const d = di * di + dj * dj;
          if (d < bd) { bd = d; best = c; }
        }
    if (best < 0) return g;
    goal = best;
  }
  const closed = new Uint8Array(N * N);
  const heap = new Heap();
  g[goal] = 0;
  heap.push(goal, 0);
  while (heap.size) {
    const cur = heap.pop();
    if (closed[cur]) continue;
    closed[cur] = 1;
    // ileri yönde nc → cur adımı: cur hücresine girmenin maliyeti
    const enter = cellCost(ctx, cur, profile);
    const ci = cur % N, cj = (cur - ci) / N;
    for (const [di, dj, dc] of DIRS) {
      const ni = ci + di, nj = cj + dj;
      if (ni < 0 || nj < 0 || ni >= N || nj >= N) continue;
      const nc = nj * N + ni;
      if (closed[nc] || cellCost(ctx, nc, profile) < 0) continue;
      if (di !== 0 && dj !== 0) {
        if (cellCost(ctx, cj * N + ni, profile) < 0 || cellCost(ctx, nj * N + ci, profile) < 0) continue;
        if (map.nav[nc] === 2 || map.nav[nc] === 3 || map.nav[cur] === 2 || map.nav[cur] === 3) continue;
      }
      const ng = g[cur] + dc * Math.max(0, enter);
      if (ng < g[nc]) {
        g[nc] = ng;
        heap.push(nc, ng);
      }
    }
  }
  return g;
}

/**
 * costField ile hesaplanmış alandan, başlangıç noktasından hedefe en ucuz yolu çıkarır
 * (ek A* gerekmez — fuar modunda hırsız doğarken kullanılır).
 */
export function pathFromField(ctx: NavContext, field: Float32Array, from: Vec2, to: Vec2, profile: NavProfile): Vec2[] | null {
  const { map } = ctx;
  const N = map.N;
  const si = cellIndexOf(map, from.x), sj = cellIndexOf(map, from.z);
  if (!inBounds(map, si, sj)) return null;
  let cur = idx(map, si, sj);
  if (!Number.isFinite(field[cur])) return null;
  const cells = [cur];
  for (let guard = 0; guard < N * N && field[cur] > 0; guard++) {
    const ci = cur % N, cj = (cur - ci) / N;
    let best = -1, bv = Infinity;
    for (const [di, dj, dc] of DIRS) {
      const ni = ci + di, nj = cj + dj;
      if (ni < 0 || nj < 0 || ni >= N || nj >= N) continue;
      const nc = nj * N + ni;
      const cost = cellCost(ctx, nc, profile);
      if (cost < 0 || !Number.isFinite(field[nc])) continue;
      if (di !== 0 && dj !== 0) {
        if (cellCost(ctx, cj * N + ni, profile) < 0 || cellCost(ctx, nj * N + ci, profile) < 0) continue;
        if (map.nav[nc] === 2 || map.nav[nc] === 3 || map.nav[cur] === 2 || map.nav[cur] === 3) continue;
      }
      const v = dc * cost + field[nc];
      if (v < bv) {
        bv = v;
        best = nc;
      }
    }
    if (best < 0 || field[best] >= field[cur]) break;
    cur = best;
    cells.push(cur);
  }
  if (field[cur] > 0) return null;
  const tc = inBounds(map, cellIndexOf(map, to.x), cellIndexOf(map, to.z)) ? idx(map, cellIndexOf(map, to.x), cellIndexOf(map, to.z)) : -1;
  return cellsToPath(map, cells, cur === tc ? to : null);
}

export function pathLength(p: Vec2[] | null, from?: Vec2) {
  if (!p || !p.length) return Infinity;
  let l = from ? Math.hypot(p[0].x - from.x, p[0].z - from.z) : 0;
  for (let k = 1; k < p.length; k++) l += Math.hypot(p[k].x - p[k - 1].x, p[k].z - p[k - 1].z);
  return l;
}

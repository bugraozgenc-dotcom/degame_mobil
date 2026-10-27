import { EQUIPMENT } from '../config/equipment';
import { fenceYaws } from '../config/expo';
import type { Device, EquipmentType, MapData, Weather } from '../types';
import { cellX, fenceNorth, fenceWorld } from '../world/grid';
import { camWatched, FENCE_CUT_H, FENCE_FOV_MARGIN, fenceCutPoint, makeEnv, unwatchedFenceCams } from './coverage';
import { cameraSees } from './vision';

// Fuar modu kredisi: çit hattının tamamını kameralarla kapatmanın en ucuz yolunu
// (açgözlü küme örtüsü) hesaplar. Bütçe bu maliyete göre verilir; oyuncu stratejiyi kendisi kurar.

export interface PerimeterPlan {
  cost: number;
  /** yalnızca çit kapsaması için gereken maliyet (karşılıklı görüş hariç) */
  coverCost: number;
  /** kimsenin görmediği (sabotaja açık) kamera sayısı */
  unwatched: number;
  /** devices içinde yalnızca çit kapsaması için seçilenlerin sayısı (baştan) */
  coverCount: number;
  pct: number; // planla ulaşılan çit kapsaması
  devices: Device[];
}

const cache = new Map<string, PerimeterPlan>();

export function expoPerimeterPlan(map: MapData, night: boolean, weather: Weather): PerimeterPlan {
  const key = `${map.id}:${map.N}:${night ? 1 : 0}:${weather}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const N = map.N;
  const env = makeEnv(night, weather, new Uint8Array(N * N));
  const L = fenceWorld(map);
  // hedef: tüm çit ve kapı hücreleri — hırsızın çömelip kestiği nokta (diz hizası)
  const cells: { c: number; pts: [number, number][] }[] = [];
  for (let j = 0; j < N; j++)
    for (let i = 0; i < N; i++) {
      const c = j * N + i;
      if (map.nav[c] !== 2 && map.nav[c] !== 3) continue;
      const x = cellX(map, i), z = cellX(map, j);
      cells.push({ c, pts: [[x, z], fenceCutPoint(map, x, z)] });
    }
  // adaylar: çit üstündeki her hücrede tek/çift bullet ve termal
  const cands: { d: Device; cost: number; seen: number[] }[] = [];
  let seq = 0;
  const mk = (type: EquipmentType, x: number, z: number, i: number, j: number, yaw: number, yaw2?: number): Device => ({ id: `P${seq++}`, label: '', type, i, j, x, z, yaw, yaw2, level: 1 });
  for (let j = 0; j < N; j++)
    for (let i = 0; i < N; i++) {
      const c = j * N + i;
      if (map.nav[c] !== 2) continue;
      const x = cellX(map, i), z = cellX(map, j);
      const [a, b] = fenceYaws(L, x, z, fenceNorth(map));
      const list: [Device, number][] = [
        [mk('fixedCam', x, z, i, j, a, b), EQUIPMENT.fixedCam.cost],
        [mk('bulletCam', x, z, i, j, a), EQUIPMENT.bulletCam.cost],
        [mk('bulletCam', x, z, i, j, b), EQUIPMENT.bulletCam.cost],
      ];
      // termal pahalı ama uzun menzilli: her 3 hücrede bir aday yeter
      if ((i + j) % 3 === 0) list.push([mk('thermalCam', x, z, i, j, a), EQUIPMENT.thermalCam.cost], [mk('thermalCam', x, z, i, j, b), EQUIPMENT.thermalCam.cost]);
      for (const [d, cost] of list) {
        const spec = EQUIPMENT[d.type];
        const seen: number[] = [];
        for (let k = 0; k < cells.length; k++) {
          const t = cells[k];
          const [cx, cz] = t.pts[0];
          if (Math.hypot(d.x - cx, d.z - cz) > spec.range + 1) continue;
          // çit hattı ve kesme noktası birlikte görülmeli (oyundaki kapsama ölçütüyle aynı)
          if (t.pts.every(([px, pz]) => cameraSees(map, env, d, d.yaw, spec.fov - FENCE_FOV_MARGIN, px, pz, FENCE_CUT_H).seen)) seen.push(k);
        }
        if (seen.length) cands.push({ d, cost, seen });
      }
    }
  // açgözlü: yeni kapsanan hücre / kredi oranı en yüksek adayı seç
  const covered = new Uint8Array(cells.length);
  let left = cells.length, cost = 0;
  const chosen: Device[] = [];
  const used = new Set<string>();
  while (left > 0) {
    let best = -1, bestR = 0;
    for (let k = 0; k < cands.length; k++) {
      const cd = cands[k];
      const cellKey = `${cd.d.i},${cd.d.j}`;
      if (used.has(cellKey)) continue;
      let gain = 0;
      for (const s of cd.seen) if (!covered[s]) gain++;
      const r = gain / cd.cost;
      if (r > bestR) {
        bestR = r;
        best = k;
      }
    }
    if (best < 0) break;
    const cd = cands[best];
    used.add(`${cd.d.i},${cd.d.j}`);
    chosen.push(cd.d);
    cost += cd.cost;
    for (const s of cd.seen)
      if (!covered[s]) {
        covered[s] = 1;
        left--;
      }
  }
  const coverCost = cost;
  const coverCount = chosen.length;
  // karşılıklı görüş: her çit kamerasını (direğini) başka bir kamera görmeli — oyundaki sabotaj ölçütüyle aynı
  // (koniler çit üstünde kesişiyorsa da izleniyor sayılır — oyundaki ölçütle aynı)
  const unwatchedOf = () => unwatchedFenceCams(map, env, chosen);
  let unw = unwatchedOf();
  for (let it = 0; it < 40 && unw.length; it++) {
    let best = -1, bestR = 0;
    for (let k = 0; k < cands.length; k++) {
      const cd = cands[k];
      if (used.has(`${cd.d.i},${cd.d.j}`)) continue;
      let gain = 0;
      for (const u of unw) if (camWatched(map, env, [cd.d], u)) gain++;
      // kendisi de izlenecek mi? (izleyeni olan aday biraz daha iyi)
      if (!gain) continue;
      const watchedSelf = camWatched(map, env, chosen, cd.d) ? 0.5 : 0;
      const r = (gain + watchedSelf) / cd.cost;
      if (r > bestR) {
        bestR = r;
        best = k;
      }
    }
    if (best < 0) break;
    const cd = cands[best];
    used.add(`${cd.d.i},${cd.d.j}`);
    chosen.push(cd.d);
    cost += cd.cost;
    unw = unwatchedOf();
  }
  const plan: PerimeterPlan = { cost, coverCost, coverCount, unwatched: unw.length, pct: Math.round((100 * (cells.length - left)) / Math.max(1, cells.length)), devices: chosen };
  cache.set(key, plan);
  return plan;
}

import { EQUIPMENT, levelMult } from '../config/equipment';
import type { Device, MapData } from '../types';
import { angleDiff, cellIndexOf, cellX, idx, inBounds } from '../world/grid';
import type { CoverageResult } from './coverage';
import { cameraSees, type Env } from './vision';

/**
 * Kamerayı en çok "henüz izlenmeyen riskli alanı" görecek yöne çevirir.
 * Önce menzildeki görünen hücreler tek LOS geçişiyle bulunur, sonra 36 aday yön puanlanır.
 */
export function bestYaw(map: MapData, env: Env, dev: Device, cov: CoverageResult | null): number {
  const spec = EQUIPMENT[dev.type];
  const R = spec.range * levelMult(dev.level);
  const cells: { a: number; w: number }[] = [];
  const i0 = cellIndexOf(map, dev.x - R), i1 = cellIndexOf(map, dev.x + R);
  const j0 = cellIndexOf(map, dev.z - R), j1 = cellIndexOf(map, dev.z + R);
  for (let j = j0; j <= j1; j++)
    for (let i = i0; i <= i1; i++) {
      if (!inBounds(map, i, j)) continue;
      const c = idx(map, i, j);
      if (!map.inside[c] || map.nav[c] === 1) continue;
      const x = cellX(map, i), z = cellX(map, j);
      if (!cameraSees(map, env, dev, 0, 360, x, z, 1).seen) continue;
      const already = cov && (cov.cam[c] > 0 ? 0.15 : cov.sensor[c] > 0 ? 0.6 : 1);
      cells.push({ a: Math.atan2(z - dev.z, x - dev.x), w: (1 + map.risk[c] * 1.5) * (already ?? 1) });
    }
  const half = ((spec.fov / 2) * Math.PI) / 180;
  let best = Math.atan2(-dev.z, -dev.x), bestS = -1;
  for (let k = 0; k < 36; k++) {
    const yaw = -Math.PI + (k / 36) * Math.PI * 2;
    let s = 0;
    for (const c of cells) if (Math.abs(angleDiff(c.a, yaw)) <= half) s += c.w;
    if (s > bestS) {
      bestS = s;
      best = yaw;
    }
  }
  return best;
}

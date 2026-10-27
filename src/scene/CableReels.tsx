import { Html } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';
import { useMemo, useRef } from 'react';
import * as THREE from 'three';
import { getEngine, useGame } from '../game/store';
import { planStock } from '../game/systems/SimulationEngine';
import type { CriticalAsset, MapData } from '../game/types';
import { mat } from './materials';

// Tesisteki kablo makaraları: hırsızların hedefi. Çalınınca kaybolur, hırsız yakalanınca yerine döner.

const REEL_GAP = 1.35;

/** Tek makara (ahşap flanşlı, bakır kablolu). Ekseni z yönünde. */
export function Reel({ scale = 1 }: { scale?: number }) {
  const wood = mat('#a8773f', { rough: 0.85 });
  const copper = mat('#c8742f', { metal: 0.55, rough: 0.35 });
  return (
    <group scale={scale}>
      <mesh position={[0, 0.42, 0.2]} rotation-x={Math.PI / 2} castShadow material={wood}>
        <cylinderGeometry args={[0.42, 0.42, 0.06, 18]} />
      </mesh>
      <mesh position={[0, 0.42, -0.2]} rotation-x={Math.PI / 2} castShadow material={wood}>
        <cylinderGeometry args={[0.42, 0.42, 0.06, 18]} />
      </mesh>
      <mesh position={[0, 0.42, 0]} rotation-x={Math.PI / 2} castShadow material={copper}>
        <cylinderGeometry args={[0.31, 0.31, 0.36, 18]} />
      </mesh>
      <mesh position={[0, 0.42, 0]} rotation-x={Math.PI / 2} material={mat('#5a3d1e')}>
        <cylinderGeometry args={[0.09, 0.09, 0.5, 10]} />
      </mesh>
    </group>
  );
}

/** Makaraların konumu: hırsızın çalışma noktasının yanında, varlığa doğru, yan yana */
export function reelSpots(asset: CriticalAsset, n: number, map: MapData) {
  let dx = asset.x - asset.ax, dz = asset.z - asset.az;
  const L = Math.hypot(dx, dz);
  if (L < 0.01) {
    dx = 0;
    dz = 1;
  } else {
    dx /= L;
    dz /= L;
  }
  const px = -dz, pz = dx; // yan doğrultu
  // binanın önünde, hırsızın çalışma noktasının biraz gerisinde (bina içine gömülmesin)
  const back = L < 0.01 ? 0 : 1.5;
  const bx = asset.ax - dx * back;
  const bz = asset.az - dz * back;
  const out: { x: number; z: number; y: number; yaw: number }[] = [];
  for (let k = 0; k < n; k++) {
    const o = (k - (n - 1) / 2) * REEL_GAP + (k % 2 ? 0.0 : 0);
    const x = bx + px * o, z = bz + pz * o;
    out.push({ x, z, y: map.heightAt(x, z), yaw: Math.atan2(pz, px) });
  }
  return out;
}

function ReelSpot({ asset, index }: { asset: CriticalAsset; index: number }) {
  const map = useGame((s) => s.map)!;
  const level = useGame((s) => s.level)!;
  const init = useMemo(() => planStock(map, level).find((s) => s.assetId === asset.id), [map, level, asset.id]);
  const max = init?.max ?? 0;
  const spots = useMemo(() => reelSpots(asset, max, map), [asset, max, map]);
  const refs = useRef<(THREE.Group | null)[]>([]);
  const scales = useRef<number[]>(spots.map(() => 1));
  const tag = useRef<HTMLDivElement>(null);
  useFrame((_, dt) => {
    const e = getEngine();
    const phase = useGame.getState().phase;
    const st = phase === 'sim' && e ? e.stockOf(asset.id) : null;
    const cur = st ? st.cur : max;
    const fair = useGame.getState().fair;
    for (let k = 0; k < spots.length; k++) {
      const g = refs.current[k];
      if (!g) continue;
      const want = k < cur ? 1 : 0;
      scales.current[k] += (want - scales.current[k]) * Math.min(1, dt * 8);
      const s = scales.current[k];
      g.visible = s > 0.02;
      g.scale.setScalar(s * (fair ? 1.6 : 1.15));
    }
    if (tag.current) {
      tag.current.textContent = `${cur}/${max}`;
      tag.current.className = `reel-tag${cur < max ? ' low' : ''}${cur === 0 ? ' empty' : ''}`;
    }
  });
  if (!max) return null;
  const mid = spots[Math.floor(spots.length / 2)];
  return (
    <group>
      {spots.map((p, k) => (
        <group key={k} ref={(el) => (refs.current[k] = el)} position={[p.x, p.y, p.z]} rotation-y={-p.yaw}>
          <Reel />
        </group>
      ))}
      {!level.expo && <group position={[mid.x, mid.y + 2.0, mid.z]}>
        <Html center style={{ pointerEvents: 'none' }} zIndexRange={[9, 0]}>
          <div ref={tag} className="reel-tag" data-k={index}>
            {max}/{max}
          </div>
        </Html>
      </group>}
    </group>
  );
}

export function CableReels() {
  const map = useGame((s) => s.map);
  const level = useGame((s) => s.level);
  const assets = useMemo(() => {
    if (!map || !level) return [];
    const ids = new Set(planStock(map, level).map((s) => s.assetId));
    return map.assets.filter((a) => ids.has(a.id));
  }, [map, level]);
  return (
    <group>
      {assets.map((a, k) => (
        <ReelSpot key={a.id} asset={a} index={k} />
      ))}
    </group>
  );
}

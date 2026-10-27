import { Html } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';
import { useRef } from 'react';
import * as THREE from 'three';
import { useGame } from '../game/store';
import type { Getaway } from '../game/systems/SimulationEngine';
import { Reel } from './CableReels';
import { mat, noRaycast } from './materials';

// Kaçış kamyoneti: çalınan makarayı alıp harita kenarından uzaklaşır (+x yönüne bakar)

export function GetawayView({ g }: { g: Getaway }) {
  const group = useRef<THREE.Group>(null);
  const tag = useRef<HTMLDivElement>(null);
  const map = useGame((s) => s.map)!;
  const level = useGame((s) => s.level)!;
  useFrame(() => {
    const o = group.current;
    if (!o) return;
    const fair = useGame.getState().fair;
    o.visible = g.state !== 'gone';
    o.position.set(g.x, map.heightAt(g.x, g.z), g.z);
    o.rotation.y = -g.yaw;
    o.scale.setScalar(fair ? 1.5 : 1.15);
    if (tag.current) tag.current.style.display = o.visible ? '' : 'none';
  });
  const body = mat('#3b3f47', { metal: 0.3, rough: 0.5 });
  const dark = mat('#1c1f24', { rough: 0.6 });
  const glass = mat('#1d2733', { rough: 0.1, metal: 0.5 });
  return (
    <group ref={group}>
      {/* kasa */}
      <mesh position={[-0.55, 0.62, 0]} castShadow material={body}><boxGeometry args={[1.9, 0.55, 1.3]} /></mesh>
      <mesh position={[-0.55, 0.98, 0]} material={dark}><boxGeometry args={[1.9, 0.18, 1.32]} /></mesh>
      {/* kabin */}
      <mesh position={[0.85, 0.8, 0]} castShadow material={body}><boxGeometry args={[1.0, 0.9, 1.26]} /></mesh>
      <mesh position={[1.36, 0.95, 0]} material={glass}><boxGeometry args={[0.03, 0.4, 1.1]} /></mesh>
      {/* kasadaki makaralar */}
      <group position={[-0.75, 0.9, 0]} scale={0.55}>
        <Reel />
      </group>
      {g.loot > 1 && (
        <group position={[-0.15, 0.9, 0.15]} scale={0.55}>
          <Reel />
        </group>
      )}
      {/* tekerlekler */}
      {[-1.0, 0.95].map((wx) =>
        [-0.66, 0.66].map((wz) => (
          <mesh key={`${wx}${wz}`} position={[wx, 0.32, wz]} rotation-x={Math.PI / 2} material={mat('#16171a')}><cylinderGeometry args={[0.32, 0.32, 0.22, 12]} /></mesh>
        ))
      )}
      {/* farlar */}
      <mesh position={[1.36, 0.6, 0.4]} material={mat('#fff', { emissive: '#fff6d0', ei: level.night ? 2 : 0.3 })}><boxGeometry args={[0.03, 0.14, 0.24]} /></mesh>
      <mesh position={[1.36, 0.6, -0.4]} material={mat('#fff', { emissive: '#fff6d0', ei: level.night ? 2 : 0.3 })}><boxGeometry args={[0.03, 0.14, 0.24]} /></mesh>
      <mesh position={[-1.5, 0.6, 0]} material={mat('#c3202c', { emissive: '#c3202c', ei: 0.6 })} raycast={noRaycast}><boxGeometry args={[0.03, 0.12, 1.2]} /></mesh>
      <Html position={[0, 2.0, 0]} center style={{ pointerEvents: 'none' }} zIndexRange={[10, 0]}>
        <div ref={tag} className="unit-tag getaway">
          KAÇIŞ ARACI
        </div>
      </Html>
    </group>
  );
}

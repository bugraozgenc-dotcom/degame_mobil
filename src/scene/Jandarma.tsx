import { Html } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';
import { useMemo, useRef } from 'react';
import * as THREE from 'three';
import { getEngine, useGame } from '../game/store';
import type { Gendarme } from '../game/systems/entities';
import { Humanoid, type Look, type RigHandle } from './Characters';
import { mat, noRaycast } from './materials';

// Jandarma ekip aracı (+x yönüne bakar) ve gözaltı yapan er.
// Renkler: beyaz gövde, jandarma yeşili şerit, mavi-kırmızı tepe lambası.

const J_GREEN = '#1f5a33';
export const JANDARMA_LOOK: Look = { top: '#4b5a2e', pants: '#3a4724', skin: '#d2a07a', hat: '#2f3a1e', hatType: 'guardcap', shoe: '#101010' };

let textCache: THREE.CanvasTexture | null = null;
function jandarmaText() {
  if (textCache) return textCache;
  const c = document.createElement('canvas');
  c.width = 512;
  c.height = 96;
  const g = c.getContext('2d')!;
  g.clearRect(0, 0, c.width, c.height);
  g.fillStyle = J_GREEN;
  g.font = '800 70px "Be Vietnam Pro", Arial, sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText('JANDARMA', 256, 52);
  textCache = new THREE.CanvasTexture(c);
  textCache.colorSpace = THREE.SRGBColorSpace;
  textCache.anisotropy = 4;
  return textCache;
}

const _right = new THREE.Vector3();
const _fwd = new THREE.Vector3();

export function JandarmaCar({ getLights, night }: { getLights: () => boolean; night?: boolean }) {
  const roofTxt = useRef<THREE.Group>(null);
  const red = useRef<THREE.Mesh>(null);
  const blue = useRef<THREE.Mesh>(null);
  const redMat = useMemo(() => new THREE.MeshStandardMaterial({ color: '#ff2030', emissive: '#ff2030', emissiveIntensity: 0.2 }), []);
  const blueMat = useMemo(() => new THREE.MeshStandardMaterial({ color: '#2a6bff', emissive: '#2a6bff', emissiveIntensity: 0.2 }), []);
  const txtMat = useMemo(() => new THREE.MeshBasicMaterial({ map: jandarmaText(), transparent: true, depthWrite: false }), []);
  const white = mat('#f3f3ef', { metal: 0.3, rough: 0.35 });
  const green = mat(J_GREEN, { rough: 0.5 });
  const glass = mat('#1d2733', { rough: 0.1, metal: 0.5 });
  useFrame(({ clock, camera }) => {
    // tavan yazısı ekranda hep düz okunsun: araç ters yöne giderken yazıyı 180° çevir
    const rt = roofTxt.current;
    if (rt && rt.parent) {
      _right.setFromMatrixColumn(camera.matrixWorld, 0);
      _fwd.set(1, 0, 0).transformDirection(rt.parent.matrixWorld);
      rt.rotation.y = _fwd.x * _right.x + _fwd.z * _right.z < 0 ? Math.PI : 0;
    }
    const on = getLights();
    const t = clock.elapsedTime * 9;
    redMat.emissiveIntensity = on ? (Math.sin(t) > 0 ? 3.2 : 0.1) : 0.2;
    blueMat.emissiveIntensity = on ? (Math.sin(t) <= 0 ? 3.2 : 0.1) : 0.2;
  });
  return (
    <group>
      {/* gövde */}
      <mesh position={[0, 0.55, 0]} castShadow material={white}><boxGeometry args={[2.7, 0.52, 1.24]} /></mesh>
      <mesh position={[0, 0.5, 0]} material={green}><boxGeometry args={[2.72, 0.16, 1.26]} /></mesh>
      {/* kabin */}
      <mesh position={[-0.15, 1.05, 0]} castShadow material={white}><boxGeometry args={[1.45, 0.5, 1.14]} /></mesh>
      <mesh position={[0.58, 1.05, 0]} material={glass}><boxGeometry args={[0.03, 0.38, 1.02]} /></mesh>
      <mesh position={[-0.88, 1.05, 0]} material={glass}><boxGeometry args={[0.03, 0.36, 1.0]} /></mesh>
      <mesh position={[-0.15, 1.07, 0.575]} material={glass}><boxGeometry args={[1.25, 0.32, 0.02]} /></mesh>
      <mesh position={[-0.15, 1.07, -0.575]} material={glass}><boxGeometry args={[1.25, 0.32, 0.02]} /></mesh>
      {/* tepe lambası */}
      <mesh position={[0.36, 1.33, 0]} material={mat('#2a2c30')}><boxGeometry args={[0.3, 0.06, 1.0]} /></mesh>
      <mesh ref={red} position={[0.36, 1.42, 0.26]} material={redMat}><boxGeometry args={[0.26, 0.13, 0.44]} /></mesh>
      <mesh ref={blue} position={[0.36, 1.42, -0.26]} material={blueMat}><boxGeometry args={[0.26, 0.13, 0.44]} /></mesh>
      {/* yazılar: yanlar ve tavan (izometrik kameradan okunur) */}
      <mesh position={[0, 0.7, 0.625]} material={txtMat} raycast={noRaycast}><planeGeometry args={[1.7, 0.32]} /></mesh>
      <mesh position={[0, 0.7, -0.625]} rotation-y={Math.PI} material={txtMat} raycast={noRaycast}><planeGeometry args={[1.7, 0.32]} /></mesh>
      <group ref={roofTxt} position={[-0.34, 1.305, 0]}>
        <mesh rotation-x={-Math.PI / 2} material={txtMat} raycast={noRaycast}><planeGeometry args={[1.0, 0.2]} /></mesh>
      </group>
      {/* tekerlekler */}
      {[-0.85, 0.85].map((wx) =>
        [-0.6, 0.6].map((wz) => (
          <mesh key={`${wx}${wz}`} position={[wx, 0.3, wz]} rotation-x={Math.PI / 2} material={mat('#16171a')}><cylinderGeometry args={[0.3, 0.3, 0.2, 12]} /></mesh>
        ))
      )}
      {/* farlar */}
      <mesh position={[1.36, 0.62, 0.4]} material={mat('#fff', { emissive: '#fff6d0', ei: night ? 2 : 0.3 })}><boxGeometry args={[0.03, 0.14, 0.24]} /></mesh>
      <mesh position={[1.36, 0.62, -0.4]} material={mat('#fff', { emissive: '#fff6d0', ei: night ? 2 : 0.3 })}><boxGeometry args={[0.03, 0.14, 0.24]} /></mesh>
      <mesh position={[-1.36, 0.62, 0.42]} material={mat('#c3202c', { emissive: '#c3202c', ei: 0.6 })}><boxGeometry args={[0.03, 0.12, 0.2]} /></mesh>
      <mesh position={[-1.36, 0.62, -0.42]} material={mat('#c3202c', { emissive: '#c3202c', ei: 0.6 })}><boxGeometry args={[0.03, 0.12, 0.2]} /></mesh>
    </group>
  );
}

export function JandarmaView({ j, ghostMat, animate }: { j: Gendarme; ghostMat: THREE.Material; animate: (rig: RigHandle | null, t: number, walking: boolean, speed: number, dt: number) => void }) {
  const group = useRef<THREE.Group>(null);
  const officer = useRef<THREE.Group>(null);
  const rig = useRef<RigHandle>(null);
  const tag = useRef<HTMLDivElement>(null);
  const map = useGame((s) => s.map)!;
  const level = useGame((s) => s.level)!;
  useFrame(({ clock }, delta) => {
    const g = group.current;
    if (!g) return;
    const fair = useGame.getState().fair;
    g.visible = j.state !== 'gone' && (getEngine()?.time ?? 0) >= j.calledAt;
    g.position.set(j.x, map.heightAt(j.x, j.z), j.z);
    g.rotation.y = -j.yaw;
    g.scale.setScalar(fair ? 1.5 : 1.15);
    if (tag.current) tag.current.style.display = g.visible ? '' : 'none';
    const o = officer.current;
    if (o) {
      o.visible = !!j.officer;
      if (j.officer) {
        o.position.set(j.officer.x, map.heightAt(j.officer.x, j.officer.z), j.officer.z);
        o.rotation.y = -j.officer.yaw;
        o.scale.setScalar(fair ? 1.5 : 1);
        animate(rig.current, clock.elapsedTime, j.officer.walking, 1.6, delta);
      }
    }
  });
  return (
    <>
      <group ref={group}>
        <JandarmaCar night={level.night} getLights={() => j.state === 'enroute' || j.state === 'arrest'} />
        <mesh position={[0, 0.9, 0]} material={ghostMat} renderOrder={20} raycast={noRaycast}>
          <boxGeometry args={[2.6, 1.2, 1.2]} />
        </mesh>
        <Html position={[0, 2.1, 0]} center style={{ pointerEvents: 'none' }} zIndexRange={[10, 0]}>
          <div ref={tag} className="unit-tag jandarma">
            JANDARMA
          </div>
        </Html>
      </group>
      <group ref={officer} visible={false}>
        <Humanoid ref={rig} variant="guard" look={JANDARMA_LOOK} />
      </group>
    </>
  );
}

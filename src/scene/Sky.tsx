import { useFrame } from '@react-three/fiber';
import { useMemo, useRef } from 'react';
import * as THREE from 'three';
import { useGame } from '../game/store';
import { mulberry32 } from '../game/world/grid';

// Gökyüzü kubbesi (gradyan), güneş/ay diski, süzülen alçak poligon bulutlar, gece yıldızları, kuş sürüsü

function SkyDome({ night, fog }: { night: boolean; fog: boolean }) {
  const geom = useMemo(() => {
    const g = new THREE.SphereGeometry(600, 24, 16);
    const col = new Float32Array(g.attributes.position.count * 3);
    const top = new THREE.Color(night ? '#060a16' : fog ? '#aeb8c2' : '#5aa9e6');
    const mid = new THREE.Color(night ? '#0d1730' : fog ? '#c6ced6' : '#a8d4f0');
    const bot = new THREE.Color(night ? '#1a2440' : fog ? '#d2d8dd' : '#e6f1f8');
    const p = g.attributes.position;
    const c = new THREE.Color();
    for (let k = 0; k < p.count; k++) {
      const y = p.getY(k) / 600; // -1..1
      if (y > 0.25) c.copy(mid).lerp(top, Math.min(1, (y - 0.25) / 0.75));
      else c.copy(bot).lerp(mid, Math.max(0, (y + 0.1) / 0.35));
      col[k * 3] = c.r;
      col[k * 3 + 1] = c.g;
      col[k * 3 + 2] = c.b;
    }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    return g;
  }, [night, fog]);
  return (
    <mesh geometry={geom} raycast={() => null} frustumCulled={false}>
      <meshBasicMaterial vertexColors side={THREE.BackSide} fog={false} depthWrite={false} toneMapped={false} />
    </mesh>
  );
}

function Stars() {
  const geom = useMemo(() => {
    const rnd = mulberry32(99);
    const N = 420;
    const pos = new Float32Array(N * 3);
    for (let k = 0; k < N; k++) {
      const a = rnd() * Math.PI * 2, e = 0.12 + rnd() * 1.3;
      const r = 560;
      pos[k * 3] = Math.cos(a) * Math.cos(e) * r;
      pos[k * 3 + 1] = Math.sin(e) * r;
      pos[k * 3 + 2] = Math.sin(a) * Math.cos(e) * r;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    return g;
  }, []);
  return (
    <points geometry={geom} raycast={() => null} frustumCulled={false}>
      <pointsMaterial color="#dfe8ff" size={2.2} sizeAttenuation={false} fog={false} transparent opacity={0.9} />
    </points>
  );
}

function SunDisc({ night }: { night: boolean }) {
  const dir = night ? new THREE.Vector3(-40, 70, -30) : new THREE.Vector3(45, 75, 35);
  const pos = dir.normalize().multiplyScalar(520);
  return (
    <group position={pos.toArray()}>
      <mesh raycast={() => null}>
        <sphereGeometry args={[night ? 14 : 18, 16, 12]} />
        <meshBasicMaterial color={night ? '#e9eefb' : '#fff4c8'} fog={false} toneMapped={false} />
      </mesh>
      <mesh raycast={() => null}>
        <sphereGeometry args={[night ? 22 : 34, 16, 12]} />
        <meshBasicMaterial color={night ? '#c9d4ff' : '#ffe9a8'} fog={false} transparent opacity={0.22} toneMapped={false} depthWrite={false} />
      </mesh>
    </group>
  );
}

/** Kuş sürüsü: V biçiminde süzülen küçük üçgenler (gündüz) */
function Birds() {
  const ref = useRef<THREE.Group>(null);
  const flock = useMemo(() => [0, 1, 2, 3, 4, 5, 6].map((k) => ({ ox: (k - 3) * 1.6, oz: Math.abs(k - 3) * 1.4, ph: k * 0.7 })), []);
  useFrame(({ clock }) => {
    const g = ref.current;
    if (!g) return;
    const t = clock.elapsedTime * 0.08;
    const R = 120;
    g.position.set(Math.cos(t) * R, 38 + Math.sin(t * 2.3) * 3, Math.sin(t) * R);
    g.rotation.y = -t + Math.PI / 2;
    g.children.forEach((c, k) => {
      c.rotation.z = Math.sin(clock.elapsedTime * 7 + flock[k].ph) * 0.5;
    });
  });
  return (
    <group ref={ref}>
      {flock.map((b, k) => (
        <mesh key={k} position={[b.ox, 0, b.oz]} raycast={() => null}>
          <coneGeometry args={[0.35, 1.1, 3]} />
          <meshBasicMaterial color="#2a2e36" fog={false} />
        </mesh>
      ))}
    </group>
  );
}

export function Sky() {
  const level = useGame((s) => s.level)!;
  const night = !!level.night;
  const fog = level.weather === 'fog';
  return (
    <group>
      <SkyDome night={night} fog={fog} />
      {!fog && <SunDisc night={night} />}
      {night && <Stars />}
      {!night && !fog && <Birds />}
    </group>
  );
}

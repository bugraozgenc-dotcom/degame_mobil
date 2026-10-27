import { forwardRef, useImperativeHandle, useMemo, useRef } from 'react';
import * as THREE from 'three';
import type { NpcSub } from '../game/types';

// Stilize karakter modelleri (+x yönüne bakar). Her karakter kendi malzemelerini taşır
// (opaklık / kör nokta görünürlüğü karakter bazında ayarlanır).

export interface RigHandle {
  legs: THREE.Object3D[];
  arms: THREE.Object3D[];
  body: THREE.Object3D | null;
  mats: THREE.MeshStandardMaterial[];
  tail?: THREE.Object3D | null;
}

function useMats(colors: Record<string, string>) {
  return useMemo(() => {
    const m: Record<string, THREE.MeshStandardMaterial> = {};
    for (const [k, c] of Object.entries(colors)) m[k] = new THREE.MeshStandardMaterial({ color: c, roughness: 0.75, transparent: false, flatShading: true });
    return m;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}

export type HumanVariant = 'thief' | 'staff' | 'guard';

export interface Look {
  top: string;
  pants: string;
  skin: string;
  hat: string;
  hatType: 'beanie' | 'cap' | 'hood' | 'helmet' | 'guardcap' | 'none';
  vest?: string;
  stripe?: string; // eşofman şeridi
  bag?: string;
  tool?: boolean;
  shoe: string;
}

const SKINS = ['#c99772', '#e0b08a', '#a8754f', '#d6a37c', '#8d5c3c'];
const pick = <T,>(arr: T[], seed: number, salt: number) => arr[Math.abs(Math.floor(seed * 7.13 + salt * 13.7)) % arr.length];

/** Hırsız tipine göre kıyafet (tohum ile çeşitlenir) */
export function thiefLook(variant: string | null, seed: number): Look {
  const skin = pick(SKINS, seed, 1);
  switch (variant) {
    case 'runner':
      return { top: pick(['#8a1f2e', '#1f3d8a', '#2d6b3a', '#5a2a7a'], seed, 2), stripe: '#f2f2f2', pants: pick(['#1a1c22', '#2a2f3a'], seed, 3), skin, hat: pick(['#111316', '#f2f2f2', '#c43b2e'], seed, 4), hatType: 'cap', shoe: '#f0f0f0' };
    case 'sneak':
      return { top: pick(['#1b1f18', '#26301f', '#1a1a1d'], seed, 2), pants: '#16181a', skin, hat: '#121314', hatType: 'hood', shoe: '#0c0c0c', tool: true };
    case 'disguised':
      return { top: pick(['#3a3f47', '#2b3a4e'], seed, 2), vest: pick(['#e3d12b', '#d8e42b'], seed, 3), pants: '#2a2d33', skin, hat: '#000', hatType: 'none', bag: '#2c2a26', shoe: '#1a1410' };
    case 'tree':
      return { top: pick(['#3f5a2c', '#4a5f30'], seed, 2), pants: '#5a3f26', skin, hat: '#2f4a22', hatType: 'hood', shoe: '#3a2a18' };
    case 'pair':
    case 'cable':
    default:
      return {
        top: pick(['#2c3240', '#3b2f2a', '#2f3b2c', '#40303a', '#1f2a2f'], seed, 2),
        pants: pick(['#1a1c21', '#2a2620', '#22252b'], seed, 3),
        skin,
        hat: pick(['#121316', '#3a1f1f', '#1f2a3a'], seed, 4),
        hatType: pick(['beanie', 'beanie', 'hood', 'cap'] as Look['hatType'][], seed, 5),
        bag: pick(['#3b2f2a', '#23262b', '#4a3b22'], seed, 6),
        tool: seed % 2 === 0,
        shoe: '#101010',
      };
  }
}

const STAFF_LOOK: Look = { top: '#2f4f7a', pants: '#27313f', skin: '#d8a57d', hat: '#ffd23f', hatType: 'helmet', vest: '#ff7f11', stripe: undefined, shoe: '#2a2018' };
const GUARD_LOOK: Look = { top: '#1f2a44', pants: '#151b29', skin: '#d2a07a', hat: '#9e1b39', hatType: 'guardcap', shoe: '#0d0d0d' };

export const Humanoid = forwardRef<RigHandle, { variant: HumanVariant; look?: Look }>(function Humanoid({ variant, look }, ref) {
  const L = look ?? (variant === 'staff' ? STAFF_LOOK : variant === 'guard' ? GUARD_LOOK : thiefLook('cable', 1));
  const m = useMats({ top: L.top, pants: L.pants, skin: L.skin, hat: L.hat, vest: L.vest ?? L.top, stripe: L.stripe ?? '#e8f0f0', bag: L.bag ?? '#333', shoe: L.shoe, steel: '#9aa0a7', badge: '#c8284b' });
  const legL = useRef<THREE.Group>(null);
  const legR = useRef<THREE.Group>(null);
  const armL = useRef<THREE.Group>(null);
  const armR = useRef<THREE.Group>(null);
  const body = useRef<THREE.Group>(null);
  useImperativeHandle(ref, () => ({
    legs: [legL.current!, legR.current!],
    arms: [armL.current!, armR.current!],
    body: body.current,
    mats: Object.values(m),
  }));
  const vested = !!L.vest;
  return (
    <group ref={body}>
      {[1, -1].map((s) => (
        <group key={s} ref={s === 1 ? legL : legR} position={[0, 0.9, s * 0.11]}>
          <mesh position={[0, -0.42, 0]} castShadow material={m.pants}><boxGeometry args={[0.17, 0.84, 0.17]} /></mesh>
          {L.stripe && !vested && <mesh position={[0, -0.42, s * 0.087]} material={m.stripe}><boxGeometry args={[0.04, 0.84, 0.01]} /></mesh>}
          <mesh position={[0.05, -0.86, 0]} castShadow material={m.shoe}><boxGeometry args={[0.26, 0.09, 0.16]} /></mesh>
        </group>
      ))}
      <mesh position={[0, 1.22, 0]} castShadow material={m.top}><boxGeometry args={[0.26, 0.64, 0.44]} /></mesh>
      {L.stripe && !vested && <mesh position={[0.131, 1.22, 0]} material={m.stripe}><boxGeometry args={[0.01, 0.6, 0.06]} /></mesh>}
      {vested && (
        <>
          <mesh position={[0, 1.24, 0]} castShadow material={m.vest}><boxGeometry args={[0.29, 0.5, 0.47]} /></mesh>
          <mesh position={[0, 1.12, 0]} material={m.stripe}><boxGeometry args={[0.3, 0.05, 0.48]} /></mesh>
          <mesh position={[0, 1.32, 0]} material={m.stripe}><boxGeometry args={[0.3, 0.05, 0.48]} /></mesh>
        </>
      )}
      {variant === 'guard' && <mesh position={[0.135, 1.36, 0.1]} material={m.badge}><boxGeometry args={[0.02, 0.08, 0.12]} /></mesh>}
      {L.bag && <mesh position={[-0.2, 1.25, 0]} castShadow material={m.bag}><boxGeometry args={[0.16, 0.42, 0.34]} /></mesh>}
      {[1, -1].map((s) => (
        <group key={s} ref={s === 1 ? armL : armR} position={[0, 1.5, s * 0.29]}>
          <mesh position={[0, -0.29, 0]} castShadow material={m.top}><boxGeometry args={[0.13, 0.6, 0.13]} /></mesh>
          <mesh position={[0, -0.62, 0]} material={m.skin}><boxGeometry args={[0.1, 0.1, 0.1]} /></mesh>
          {L.tool && s === -1 && <mesh position={[0.12, -0.7, 0]} rotation-z={-0.3} material={m.steel}><boxGeometry args={[0.45, 0.04, 0.05]} /></mesh>}
        </group>
      ))}
      <mesh position={[0, 1.71, 0]} castShadow material={m.skin}><sphereGeometry args={[0.15, 10, 8]} /></mesh>
      {L.hatType === 'beanie' && <mesh position={[0, 1.79, 0]} material={m.hat}><sphereGeometry args={[0.16, 10, 8, 0, Math.PI * 2, 0, Math.PI / 2]} /></mesh>}
      {L.hatType === 'hood' && (
        <>
          <mesh position={[-0.03, 1.73, 0]} material={m.hat}><sphereGeometry args={[0.185, 10, 8, Math.PI / 2, Math.PI * 1.15, 0, Math.PI * 0.62]} /></mesh>
          <mesh position={[-0.04, 1.73, 0]} rotation-z={Math.PI / 2} material={m.hat}><sphereGeometry args={[0.18, 10, 8, 0, Math.PI * 2, 0, Math.PI / 2]} /></mesh>
        </>
      )}
      {L.hatType === 'cap' && (
        <>
          <mesh position={[0, 1.8, 0]} material={m.hat}><sphereGeometry args={[0.16, 10, 8, 0, Math.PI * 2, 0, Math.PI / 2]} /></mesh>
          <mesh position={[0.15, 1.8, 0]} material={m.hat}><boxGeometry args={[0.16, 0.025, 0.22]} /></mesh>
        </>
      )}
      {L.hatType === 'helmet' && (
        <>
          <mesh position={[0, 1.8, 0]} material={m.hat}><sphereGeometry args={[0.17, 10, 8, 0, Math.PI * 2, 0, Math.PI / 2]} /></mesh>
          <mesh position={[0.06, 1.8, 0]} material={m.hat}><boxGeometry args={[0.3, 0.03, 0.3]} /></mesh>
        </>
      )}
      {L.hatType === 'guardcap' && (
        <>
          <mesh position={[0, 1.81, 0]} material={m.hat}><cylinderGeometry args={[0.16, 0.16, 0.1, 10]} /></mesh>
          <mesh position={[0.12, 1.77, 0]} material={m.hat}><boxGeometry args={[0.14, 0.03, 0.24]} /></mesh>
        </>
      )}
    </group>
  );
});

export const Animal = forwardRef<RigHandle, { sub: NpcSub; pelt?: boolean }>(function Animal({ sub, pelt }, ref) {
  const palette =
    sub === 'dog'
      ? { body: '#a46b3c', dark: '#5a3a20', nose: '#1a1a1a', light: '#e2c39a' }
      : sub === 'sheep'
        ? { body: '#f1efe8', dark: '#2b2b2b', nose: '#2b2b2b', light: '#ffffff' }
        : sub === 'goat'
          ? { body: '#8e7a66', dark: '#4a3d31', nose: '#2b2b2b', light: '#d8cbb8' }
          : { body: '#4b3a2f', dark: '#2a201a', nose: '#b07a6a', light: '#f3efe6' };
  const m = useMats({ ...palette, hand: '#d6a37c', boot: '#151515', pack: '#2c2a26' });
  const legs = [useRef<THREE.Group>(null), useRef<THREE.Group>(null), useRef<THREE.Group>(null), useRef<THREE.Group>(null)];
  const body = useRef<THREE.Group>(null);
  const tail = useRef<THREE.Group>(null);
  useImperativeHandle(ref, () => ({ legs: legs.map((l) => l.current!), arms: [], body: body.current, mats: Object.values(m), tail: tail.current }));

  const dims =
    sub === 'dog'
      ? { L: 0.7, H: 0.3, W: 0.26, leg: 0.36, y: 0.5, head: 0.24 }
      : sub === 'sheep'
        ? { L: 0.8, H: 0.5, W: 0.5, leg: 0.36, y: 0.62, head: 0.22 }
        : sub === 'goat'
          ? { L: 0.8, H: 0.36, W: 0.3, leg: 0.46, y: 0.66, head: 0.22 }
          : { L: 0.95, H: 0.48, W: 0.42, leg: 0.32, y: 0.56, head: 0.3 };
  return (
    <group ref={body}>
      {sub === 'sheep' ? (
        <mesh position={[0, dims.y, 0]} scale={[1.25, 0.85, 0.95]} castShadow material={m.body}><icosahedronGeometry args={[0.42, 1]} /></mesh>
      ) : (
        <mesh position={[0, dims.y, 0]} castShadow material={m.body}><boxGeometry args={[dims.L, dims.H, dims.W]} /></mesh>
      )}
      {sub === 'boar' && <mesh position={[0.1, dims.y + 0.26, 0]} material={m.dark}><boxGeometry args={[0.6, 0.08, 0.14]} /></mesh>}
      <group position={[dims.L / 2 + 0.05, dims.y + (sub === 'boar' ? 0 : 0.14), 0]}>
        <mesh position={[0.08, 0, 0]} castShadow material={sub === 'sheep' ? m.dark : m.body}><boxGeometry args={[dims.head, dims.head * 0.9, dims.head * 0.85]} /></mesh>
        <mesh position={[0.08 + dims.head / 2 + 0.06, -0.04, 0]} material={sub === 'boar' ? m.nose : sub === 'sheep' ? m.dark : m.light}><boxGeometry args={[0.13, 0.1, 0.12]} /></mesh>
        {sub === 'dog' && (
          <>
            <mesh position={[0.02, 0.14, 0.08]} material={m.dark}><boxGeometry args={[0.06, 0.12, 0.05]} /></mesh>
            <mesh position={[0.02, 0.14, -0.08]} material={m.dark}><boxGeometry args={[0.06, 0.12, 0.05]} /></mesh>
          </>
        )}
        {sub === 'goat' && (
          <>
            <mesh position={[-0.02, 0.15, 0.06]} rotation-z={0.5} material={m.dark}><coneGeometry args={[0.03, 0.2, 5]} /></mesh>
            <mesh position={[-0.02, 0.15, -0.06]} rotation-z={0.5} material={m.dark}><coneGeometry args={[0.03, 0.2, 5]} /></mesh>
            <mesh position={[0.14, -0.14, 0]} material={m.light}><boxGeometry args={[0.04, 0.1, 0.04]} /></mesh>
          </>
        )}
        {sub === 'boar' && (
          <>
            <mesh position={[0.22, -0.06, 0.08]} rotation-z={-0.8} material={m.light}><coneGeometry args={[0.025, 0.12, 5]} /></mesh>
            <mesh position={[0.22, -0.06, -0.08]} rotation-z={-0.8} material={m.light}><coneGeometry args={[0.025, 0.12, 5]} /></mesh>
          </>
        )}
      </group>
      {[
        [dims.L / 2 - 0.1, dims.W / 2 - 0.06],
        [dims.L / 2 - 0.1, -dims.W / 2 + 0.06],
        [-dims.L / 2 + 0.1, dims.W / 2 - 0.06],
        [-dims.L / 2 + 0.1, -dims.W / 2 + 0.06],
      ].map(([lx, lz], k) => (
        <group key={k} ref={legs[k]} position={[lx, dims.y - dims.H / 2 + 0.02, lz]}>
          <mesh position={[0, -dims.leg / 2, 0]} castShadow material={sub === 'sheep' ? m.dark : m.body}><boxGeometry args={[0.08, dims.leg + 0.04, 0.08]} /></mesh>
          {/* post giymiş hırsızın ele veren detayları: önde insan eli, arkada bot */}
          {pelt && k < 2 && <mesh position={[0.03, -dims.leg + 0.01, 0]} material={m.hand}><boxGeometry args={[0.14, 0.07, 0.1]} /></mesh>}
          {pelt && k >= 2 && <mesh position={[0.05, -dims.leg + 0.02, 0]} material={m.boot}><boxGeometry args={[0.2, 0.09, 0.12]} /></mesh>}
        </group>
      ))}
      {pelt && <mesh position={[-0.12, dims.y + dims.H / 2 + 0.12, 0]} castShadow material={m.pack}><boxGeometry args={[0.32, 0.22, 0.26]} /></mesh>}
      <group ref={tail} position={[-dims.L / 2, dims.y + 0.08, 0]}>
        <mesh position={[-0.1, 0.05, 0]} rotation-z={0.8} material={sub === 'dog' ? m.body : m.dark}><boxGeometry args={[0.05, sub === 'dog' ? 0.28 : 0.12, 0.05]} /></mesh>
      </group>
    </group>
  );
});

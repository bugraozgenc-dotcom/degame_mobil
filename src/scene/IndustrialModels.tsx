import { useFrame } from '@react-three/fiber';
import { useMemo, useRef } from 'react';
import * as THREE from 'three';
import logoUrl from '../assets/desecure-logo.svg';
import type { BuildingDef } from '../game/types';
import { COLORS, mat, noRaycast } from './materials';

// Termik santral yapıları + bina üstü Desecure logo levhaları

let logoTex: THREE.CanvasTexture | null = null;
/** Beyaz levha üzerinde vektörel Desecure logosu (yüksek çözünürlüklü tuval dokusu) */
export function logoTexture() {
  if (logoTex) return logoTex;
  const c = document.createElement('canvas');
  c.width = 2048;
  c.height = 300;
  const g = c.getContext('2d')!;
  g.fillStyle = '#ffffff';
  g.fillRect(0, 0, c.width, c.height);
  logoTex = new THREE.CanvasTexture(c);
  logoTex.colorSpace = THREE.SRGBColorSpace;
  logoTex.anisotropy = 8;
  const img = new Image();
  img.onload = () => {
    const w = 1900;
    const h = (w * 217) / 2049;
    g.drawImage(img, (c.width - w) / 2, (c.height - h) / 2, w, h);
    logoTex!.needsUpdate = true;
  };
  img.src = logoUrl;
  return logoTex;
}

/** Logo levhası: genişlik verilir, yükseklik orana göre hesaplanır */
export function LogoPlate({ width, position, rotationY = 0 }: { width: number; position: [number, number, number]; rotationY?: number }) {
  const tex = logoTexture();
  const h = (width * 300) / 2048;
  return (
    <group position={position} rotation-y={rotationY}>
      <mesh position={[0, 0, -0.005]} raycast={noRaycast} material={mat(COLORS.burgundy)}>
        <boxGeometry args={[width + 0.12, h + 0.12, 0.03]} />
      </mesh>
      <mesh position={[0, 0, 0.012]} raycast={noRaycast}>
        <planeGeometry args={[width, h]} />
        <meshStandardMaterial map={tex} roughness={0.5} />
      </mesh>
    </group>
  );
}

/** Yükselen buhar / duman */
export function Steam({ position, radius, color = '#f4f6f8', count = 7, speed = 1, scale = 1, opacity = 0.75 }: { position: [number, number, number]; radius: number; color?: string; count?: number; speed?: number; scale?: number; opacity?: number }) {
  const refs = useRef<(THREE.Mesh | null)[]>([]);
  const mats = useMemo(() => Array.from({ length: count }, () => new THREE.MeshStandardMaterial({ color, transparent: true, opacity, roughness: 1, depthWrite: false, flatShading: true })), [count, color, opacity]);
  const seeds = useMemo(() => Array.from({ length: count }, (_, k) => ({ ph: k / count, ox: (Math.random() - 0.5) * radius, oz: (Math.random() - 0.5) * radius })), [count, radius]);
  useFrame(({ clock }) => {
    const t = clock.elapsedTime * 0.12 * speed;
    refs.current.forEach((m, k) => {
      if (!m) return;
      const s = seeds[k];
      const p = (t + s.ph) % 1;
      m.position.set(s.ox * (1 + p) + p * 3, p * 12 * scale, s.oz * (1 + p) + p * 1.5);
      const sc = (radius * 0.55 + p * radius * 0.9) * scale;
      m.scale.setScalar(sc);
      mats[k].opacity = opacity * Math.sin(Math.min(1, p * 1.2) * Math.PI) ;
    });
  });
  return (
    <group position={position}>
      {seeds.map((_, k) => (
        <mesh key={k} ref={(el) => (refs.current[k] = el)} material={mats[k]} raycast={noRaycast}>
          <icosahedronGeometry args={[1, 1]} />
        </mesh>
      ))}
    </group>
  );
}

export function IndustrialBuilding({ b, y, night }: { b: BuildingDef; y: number; night: boolean }) {
  const winMat = mat('#2e4a66', { emissive: '#ffcf7a', ei: night ? 1.1 : 0.05, rough: 0.2, metal: 0.3 });
  switch (b.kind) {
    case 'turbinehall': {
      return (
        <group position={[b.x, y, b.z]}>
          <mesh position={[0, 0.1, 0]} receiveShadow material={mat('#b7b3aa')}><boxGeometry args={[b.w + 1, 0.2, b.d + 1]} /></mesh>
          <mesh position={[0, b.h / 2 + 0.2, 0]} castShadow receiveShadow material={mat('#e7e4dd')}><boxGeometry args={[b.w, b.h, b.d]} /></mesh>
          <mesh position={[0, 1.2, 0]} material={mat('#9aa0a7', { metal: 0.3 })}><boxGeometry args={[b.w + 0.04, 2.0, b.d + 0.04]} /></mesh>
          <mesh position={[0, b.h - 0.4, 0]} material={mat(COLORS.burgundy)}><boxGeometry args={[b.w + 0.05, 0.5, b.d + 0.05]} /></mesh>
          <mesh position={[0, b.h + 0.32, 0]} castShadow material={mat('#5d6169', { metal: 0.4 })}><boxGeometry args={[b.w + 0.3, 0.25, b.d + 0.3]} /></mesh>
          <mesh position={[0, b.h + 0.75, 0]} castShadow material={mat('#7b828b', { metal: 0.4 })}><boxGeometry args={[b.w * 0.8, 0.7, b.d * 0.3]} /></mesh>
          <mesh position={[0, b.h + 0.75, b.d * 0.15 + 0.01]} material={winMat}><boxGeometry args={[b.w * 0.78, 0.4, 0.04]} /></mesh>
          {[-1, 1].map((sx) => (
            <mesh key={sx} position={[sx * (b.w / 2 - 1.2), b.h + 1.1, -b.d / 4]} castShadow material={mat('#cfd3d8', { metal: 0.3 })}><boxGeometry args={[1.4, 1.2, 1.2]} /></mesh>
          ))}
          {Array.from({ length: 6 }).map((_, k) => (
            <mesh key={k} position={[-b.w / 2 + 1.4 + k * 2.25, 4.6, b.d / 2 + 0.02]} material={winMat}><boxGeometry args={[1.5, 2.6, 0.05]} /></mesh>
          ))}
          <mesh position={[b.w / 2 + 0.03, 2.2, 0]} material={mat('#3a3d44')}><boxGeometry args={[0.05, 4, 3]} /></mesh>
          <LogoPlate width={8.4} position={[0, b.h - 1.55, b.d / 2 + 0.03]} />
          <LogoPlate width={6} position={[0, b.h - 1.55, -b.d / 2 - 0.03]} rotationY={Math.PI} />
        </group>
      );
    }
    case 'boiler': {
      return (
        <group position={[b.x, y, b.z]}>
          <mesh position={[0, 0.1, 0]} receiveShadow material={mat('#b7b3aa')}><boxGeometry args={[b.w + 1, 0.2, b.d + 1]} /></mesh>
          <mesh position={[0, b.h / 2 + 0.2, 0]} castShadow receiveShadow material={mat('#8f969e', { metal: 0.35, rough: 0.55 })}><boxGeometry args={[b.w, b.h, b.d]} /></mesh>
          {[-1, 1].map((sx) =>
            [-1, 1].map((sz) => (
              <mesh key={`${sx}${sz}`} position={[(sx * b.w) / 2, b.h / 2 + 0.2, (sz * b.d) / 2]} material={mat('#4a4f57', { metal: 0.5 })}><boxGeometry args={[0.35, b.h + 0.4, 0.35]} /></mesh>
            ))
          )}
          {[0.25, 0.5, 0.75].map((f) => (
            <mesh key={f} position={[0, b.h * f, 0]} material={mat('#5c6168', { metal: 0.5 })}><boxGeometry args={[b.w + 0.1, 0.2, b.d + 0.1]} /></mesh>
          ))}
          <mesh position={[0, b.h + 1.2, 0]} castShadow material={mat('#6f767e', { metal: 0.4 })}><boxGeometry args={[b.w * 0.6, 2, b.d * 0.6]} /></mesh>
          <mesh position={[b.w / 2 + 0.6, b.h * 0.55, 0]} rotation-z={Math.PI / 2} castShadow material={mat('#b9bec4', { metal: 0.6, rough: 0.3 })}><cylinderGeometry args={[0.4, 0.4, 2.4, 10]} /></mesh>
          <mesh position={[0, b.h * 0.86, b.d / 2 + 0.02]} material={mat(COLORS.burgundy)}><boxGeometry args={[b.w, 0.5, 0.04]} /></mesh>
          <Steam position={[0, b.h + 2.2, 0]} radius={1.2} count={4} color="#e9ecef" opacity={0.45} speed={1.4} scale={0.6} />
        </group>
      );
    }
    case 'stack': {
      const H = b.h;
      return (
        <group position={[b.x, y, b.z]}>
          <mesh position={[0, 0.3, 0]} receiveShadow material={mat('#a8a49c')}><cylinderGeometry args={[2.0, 2.2, 0.6, 16]} /></mesh>
          <mesh position={[0, H / 2, 0]} castShadow material={mat('#d6d2ca')}><cylinderGeometry args={[0.85, 1.4, H, 18]} /></mesh>
          {[0, 1, 2].map((k) => (
            <mesh key={k} position={[0, H - 1 - k * 3.2, 0]} material={mat(k % 2 === 0 ? COLORS.burgundy : '#f4f4f2')}><cylinderGeometry args={[0.92 + k * 0.03, 0.95 + k * 0.03, 1.6, 18]} /></mesh>
          ))}
          <mesh position={[0, H + 0.2, 0]} material={mat('#ff3030', { emissive: '#ff2020', ei: 1.8 })}><sphereGeometry args={[0.18, 8, 6]} /></mesh>
          <Steam position={[0, H + 0.5, 0]} radius={1.3} count={6} color="#b8bcc2" opacity={0.55} speed={1.1} scale={0.8} />
        </group>
      );
    }
    case 'cooling': {
      const r = b.w / 2;
      const pts = useMemo(() => {
        const out: THREE.Vector2[] = [];
        for (let k = 0; k <= 16; k++) {
          const t = k / 16;
          const waist = 0.64;
          const rad = r * (0.62 + 0.38 * Math.pow(Math.abs(t - 0.72) / 0.72, 1.6)) * (t > 0.72 ? 0.95 : 1);
          out.push(new THREE.Vector2(Math.max(rad, r * waist), t * b.h));
        }
        return out;
      }, [r, b.h]);
      return (
        <group position={[b.x, y, b.z]}>
          <mesh castShadow receiveShadow material={new THREE.MeshStandardMaterial({ color: '#cfccc5', roughness: 0.9, side: THREE.DoubleSide })}>
            <latheGeometry args={[pts, 40]} />
          </mesh>
          <mesh position={[0, b.h - 1.6, 0]} material={new THREE.MeshStandardMaterial({ color: COLORS.burgundy, side: THREE.DoubleSide })}>
            <cylinderGeometry args={[pts[15].x + 0.03, pts[14].x + 0.03, 1.2, 40, 1, true]} />
          </mesh>
          {Array.from({ length: 12 }).map((_, k) => {
            const a = (k / 12) * Math.PI * 2;
            return <mesh key={k} position={[Math.cos(a) * r * 0.97, 0.7, Math.sin(a) * r * 0.97]} rotation-y={-a} material={mat('#9a978f')}><boxGeometry args={[0.25, 1.4, 0.6]} /></mesh>;
          })}
          <Steam position={[0, b.h - 0.5, 0]} radius={r * 0.55} count={8} speed={0.9} scale={1.1} opacity={0.8} />
        </group>
      );
    }
    case 'tank': {
      const r = b.w / 2 - 0.2;
      return (
        <group position={[b.x, y, b.z]}>
          <mesh position={[0, 0.12, 0]} receiveShadow material={mat('#a8a49c')}><cylinderGeometry args={[r + 0.8, r + 0.8, 0.24, 24]} /></mesh>
          <mesh position={[0, b.h / 2 + 0.24, 0]} castShadow receiveShadow material={mat('#eeeeec', { rough: 0.4, metal: 0.2 })}><cylinderGeometry args={[r, r, b.h, 28]} /></mesh>
          <mesh position={[0, b.h + 0.24, 0]} castShadow material={mat('#e2e2e0', { rough: 0.4 })}><sphereGeometry args={[r, 28, 10, 0, Math.PI * 2, 0, Math.PI / 6]} /></mesh>
          <mesh position={[0, b.h * 0.18, 0]} material={mat(COLORS.burgundy)}><cylinderGeometry args={[r + 0.02, r + 0.02, 0.45, 28, 1, true]} /></mesh>
          <mesh position={[r + 0.1, b.h / 2 + 0.24, 0]} material={mat('#6d727a', { metal: 0.5 })}><boxGeometry args={[0.1, b.h, 0.5]} /></mesh>
          <LogoPlate width={r * 1.25} position={[0, b.h * 0.6, r + 0.06]} />
        </group>
      );
    }
    case 'coal': {
      const r = Math.min(b.w, b.d) / 2;
      return (
        <group position={[b.x, y, b.z]}>
          <mesh position={[0, b.h / 2, 0]} scale={[b.w / Math.min(b.w, b.d), 1, b.d / Math.min(b.w, b.d)]} castShadow receiveShadow material={mat('#26262a', { flat: true, rough: 1 })}>
            <coneGeometry args={[r, b.h, 9, 2]} />
          </mesh>
        </group>
      );
    }
    case 'wellhead': {
      // jeotermal kuyu başı: beton pad, vana ağacı, buhar
      const steel = mat('#b9bec4', { metal: 0.65, rough: 0.3 });
      const red = mat(COLORS.burgundy, { metal: 0.3 });
      return (
        <group position={[b.x, y, b.z]}>
          <mesh position={[0, 0.15, 0]} receiveShadow material={mat('#b3afa6')}><boxGeometry args={[b.w + 1.6, 0.3, b.d + 1.6]} /></mesh>
          <mesh position={[0, 1.0, 0]} castShadow material={steel}><cylinderGeometry args={[0.42, 0.5, 1.6, 12]} /></mesh>
          <mesh position={[0, 1.85, 0]} castShadow material={red}><cylinderGeometry args={[0.55, 0.55, 0.3, 12]} /></mesh>
          <mesh position={[0, 2.3, 0]} castShadow material={steel}><cylinderGeometry args={[0.32, 0.32, 0.9, 12]} /></mesh>
          <mesh position={[0, 2.85, 0]} material={red}><cylinderGeometry args={[0.45, 0.45, 0.22, 12]} /></mesh>
          {/* yan çıkış boruları */}
          <mesh position={[0.9, 1.5, 0]} rotation-z={Math.PI / 2} castShadow material={steel}><cylinderGeometry args={[0.2, 0.2, 1.6, 10]} /></mesh>
          <mesh position={[1.6, 1.5, 0]} material={red}><torusGeometry args={[0.34, 0.07, 8, 16]} /></mesh>
          <mesh position={[-0.9, 1.1, 0]} rotation-z={Math.PI / 2} castShadow material={steel}><cylinderGeometry args={[0.16, 0.16, 1.4, 10]} /></mesh>
          {/* çarklı vana */}
          <mesh position={[0, 2.3, 0.5]} rotation-x={Math.PI / 2} material={red}><torusGeometry args={[0.28, 0.05, 8, 16]} /></mesh>
          {/* koruma korkuluğu */}
          {[-1, 1].map((sx) => (
            <mesh key={sx} position={[sx * (b.w / 2 + 0.6), 0.8, 0]} material={mat('#f0c030')}><boxGeometry args={[0.08, 1.0, b.d + 1.4]} /></mesh>
          ))}
          <Steam position={[0.4, 3.1, 0]} radius={0.9} count={5} color="#f6f8fa" opacity={0.6} speed={1.5} scale={0.55} />
        </group>
      );
    }
    case 'fancooler': {
      // hava soğutmalı kondenser: dikdörtgen gövde, üstte fan halkaları
      const fans = Math.max(2, Math.round(b.w / 3));
      return (
        <group position={[b.x, y, b.z]}>
          <mesh position={[0, 0.1, 0]} receiveShadow material={mat('#b7b3aa')}><boxGeometry args={[b.w + 1, 0.2, b.d + 1]} /></mesh>
          {[-1, 1].map((sx) =>
            [-1, 1].map((sz) => (
              <mesh key={`${sx}${sz}`} position={[sx * (b.w / 2 - 0.3), 1.2, sz * (b.d / 2 - 0.3)]} material={mat('#5c6168', { metal: 0.5 })}><boxGeometry args={[0.3, 2.4, 0.3]} /></mesh>
            ))
          )}
          <mesh position={[0, b.h / 2 + 1.2, 0]} castShadow receiveShadow material={mat('#8f969e', { metal: 0.35, rough: 0.55 })}><boxGeometry args={[b.w, b.h - 1.2, b.d]} /></mesh>
          <mesh position={[0, b.h * 0.6 + 1.2, b.d / 2 + 0.02]} material={mat(COLORS.burgundy)}><boxGeometry args={[b.w, 0.4, 0.04]} /></mesh>
          {Array.from({ length: fans }).map((_, k) => {
            const fx = -b.w / 2 + (b.w / fans) * (k + 0.5);
            return (
              <group key={k} position={[fx, b.h + 0.65, 0]}>
                <mesh material={mat('#cfd3d8', { metal: 0.4 })}><cylinderGeometry args={[b.d * 0.42, b.d * 0.42, 0.5, 20, 1, true]} /></mesh>
                <mesh position={[0, 0.1, 0]} material={mat('#2a2c31')}><cylinderGeometry args={[b.d * 0.4, b.d * 0.4, 0.06, 20]} /></mesh>
                <mesh position={[0, 0.2, 0]} rotation-y={k} material={mat('#e4e7ea')}><boxGeometry args={[b.d * 0.72, 0.04, 0.22]} /></mesh>
                <mesh position={[0, 0.2, 0]} rotation-y={k + Math.PI / 2} material={mat('#e4e7ea')}><boxGeometry args={[b.d * 0.72, 0.04, 0.22]} /></mesh>
              </group>
            );
          })}
          <Steam position={[0, b.h + 1.2, 0]} radius={1.4} count={5} color="#eef1f4" opacity={0.35} speed={1.2} scale={0.5} />
        </group>
      );
    }
    case 'separator': {
      // yatay buhar separatörü: ayaklı silindir
      const r = b.d / 2 - 0.1;
      return (
        <group position={[b.x, y, b.z]}>
          <mesh position={[0, 0.1, 0]} receiveShadow material={mat('#b7b3aa')}><boxGeometry args={[b.w + 1, 0.2, b.d + 1]} /></mesh>
          {[-1, 1].map((sx) => (
            <mesh key={sx} position={[sx * (b.w / 2 - 1), 0.7, 0]} material={mat('#5c6168', { metal: 0.5 })}><boxGeometry args={[0.6, 1.2, b.d - 0.4]} /></mesh>
          ))}
          <mesh position={[0, 1.2 + r, 0]} rotation-z={Math.PI / 2} castShadow receiveShadow material={mat('#d9d6cf', { metal: 0.35, rough: 0.45 })}><cylinderGeometry args={[r, r, b.w - 0.6, 24]} /></mesh>
          {[-1, 1].map((sx) => (
            <mesh key={sx} position={[sx * (b.w / 2 - 0.3), 1.2 + r, 0]} castShadow material={mat('#d9d6cf', { metal: 0.35, rough: 0.45 })}><sphereGeometry args={[r, 20, 12]} /></mesh>
          ))}
          <mesh position={[0, 1.2 + r, 0]} rotation-z={Math.PI / 2} material={mat(COLORS.burgundy)}><cylinderGeometry args={[r + 0.02, r + 0.02, 0.5, 24, 1, true]} /></mesh>
          <mesh position={[0, 1.2 + r * 2 + 0.5, 0]} material={mat('#b9bec4', { metal: 0.6 })}><cylinderGeometry args={[0.22, 0.22, 1.2, 10]} /></mesh>
          <Steam position={[0, 1.2 + r * 2 + 1.2, 0]} radius={0.6} count={3} color="#f6f8fa" opacity={0.5} speed={1.6} scale={0.4} />
        </group>
      );
    }
    case 'dam': {
      // beton baraj gövdesi: öne eğik yüz, tepede yol ve korkuluk, dolu savak kapakları
      const W = b.w, H = b.h, D = b.d;
      const face = mat('#cfcbc3', { rough: 0.95 });
      return (
        <group position={[b.x, y, b.z]}>
          {/* gövde (öne eğik prizma: alt kalın, üst ince) */}
          <mesh position={[0, H / 2, 0]} castShadow receiveShadow material={face}>
            <boxGeometry args={[W, H, D]} />
          </mesh>
          <mesh position={[0, H * 0.3, D / 2 + 1.2]} rotation-x={-0.5} castShadow receiveShadow material={face}>
            <boxGeometry args={[W, H * 0.75, 2.6]} />
          </mesh>
          {/* tepe yolu */}
          <mesh position={[0, H + 0.12, 0]} material={mat('#6e7177')}><boxGeometry args={[W, 0.24, D - 0.4]} /></mesh>
          {/* korkuluk yok: rezervuar kenarında çit hattı var (tesis ve baraj çit içinde) */}
          <mesh position={[0, H + 0.3, 0]} material={mat(COLORS.burgundy)}><boxGeometry args={[W + 0.1, 0.2, D - 0.3]} /></mesh>
          {/* dolu savak kapakları (doğu) */}
          {[0, 1, 2].map((k) => (
            <group key={k} position={[14 + k * 4.5, 0, D / 2 + 0.3]}>
              <mesh position={[0, H * 0.78, 0]} castShadow material={mat('#8a2030', { metal: 0.3 })}><boxGeometry args={[3.6, 2.6, 0.5]} /></mesh>
              <mesh position={[0, H * 0.55, 0.6]} material={new THREE.MeshStandardMaterial({ color: '#dfe9f2', transparent: true, opacity: 0.75, roughness: 0.2 })}><boxGeometry args={[3.2, H * 0.5, 0.4]} /></mesh>
            </group>
          ))}
          {/* kule / vinç kabinleri */}
          {[-22, 22].map((px) => (
            <mesh key={px} position={[px, H + 2.2, 0]} castShadow material={mat('#e7e4dd')}><boxGeometry args={[3, 3.4, D - 0.6]} /></mesh>
          ))}
          <LogoPlate width={10} position={[-10, H * 0.5, D / 2 + 2.55]} rotationY={0} />
        </group>
      );
    }
    case 'penstock': {
      // cebri borular: barajdan (kuzey, yüksek) santrale (güney, alçak) inen üç büyük çelik boru
      const top = HES_PEN.top, bottom = HES_PEN.bottom;
      const len = Math.hypot(b.d, top - bottom);
      const tilt = Math.atan2(top - bottom, b.d);
      const steel = mat('#b4bcc3', { metal: 0.45, rough: 0.45 });
      const yAt = (u: number) => top + (bottom - top) * u; // u: 0 kuzey ucu, 1 güney ucu
      return (
        <group position={[b.x, 0, b.z]}>
          {[-2.3, 0, 2.3].map((px) => (
            <group key={px} position={[px, 0, 0]}>
              <mesh position={[0, (top + bottom) / 2, 0]} rotation-x={-(Math.PI / 2 - tilt)} castShadow receiveShadow material={steel}>
                <cylinderGeometry args={[0.85, 0.85, len, 14]} />
              </mesh>
              {[0.25, 0.5, 0.75].map((u) => {
                const z = -b.d / 2 + b.d * u;
                const h = Math.max(0.6, yAt(u) - y - 0.6);
                return (
                  <mesh key={u} position={[0, y + h / 2, z]} material={mat('#5c6168', { metal: 0.5 })}>
                    <boxGeometry args={[1.5, h, 1.0]} />
                  </mesh>
                );
              })}
              <mesh position={[0, bottom, b.d / 2 - 0.3]} rotation-x={Math.PI / 2} material={mat(COLORS.burgundy)}><cylinderGeometry args={[0.95, 0.95, 0.5, 14]} /></mesh>
            </group>
          ))}
          {/* giriş yapısı: baraj eteğinde beton blok */}
          <mesh position={[0, y + 1.4, -b.d / 2 - 0.4]} castShadow material={mat('#cfcbc3')}><boxGeometry args={[b.w + 0.6, 2.8, 1.6]} /></mesh>
        </group>
      );
    }
    case 'battery': {
      // batarya konteyneri: beyaz kabin, üstte HVAC üniteleri, yan kapaklar, durum LED'i
      const body = mat('#eceae4', { rough: 0.5, metal: 0.15 });
      const dark = mat('#3a3d44', { metal: 0.4 });
      return (
        <group position={[b.x, y, b.z]}>
          <mesh position={[0, 0.12, 0]} receiveShadow material={mat('#b7b3aa')}><boxGeometry args={[b.w + 0.6, 0.24, b.d + 0.6]} /></mesh>
          <mesh position={[0, b.h / 2 + 0.24, 0]} castShadow receiveShadow material={body}><boxGeometry args={[b.w, b.h, b.d]} /></mesh>
          <mesh position={[0, b.h * 0.72 + 0.24, 0]} material={mat(COLORS.burgundy)}><boxGeometry args={[b.w + 0.03, 0.32, b.d + 0.03]} /></mesh>
          {/* kapak derzleri */}
          {[-0.6, -0.2, 0.2, 0.6].map((f) => (
            <mesh key={f} position={[f * (b.w / 2), b.h / 2 + 0.24, b.d / 2 + 0.01]} material={dark}><boxGeometry args={[0.05, b.h - 0.5, 0.02]} /></mesh>
          ))}
          {/* HVAC üniteleri */}
          {[-1, 1].map((sx) => (
            <group key={sx} position={[sx * (b.w / 2 - 1.1), b.h + 0.24, 0]}>
              <mesh position={[0, 0.3, 0]} castShadow material={mat('#cfd3d8', { metal: 0.3 })}><boxGeometry args={[1.3, 0.6, 1.6]} /></mesh>
              <mesh position={[0, 0.62, 0]} material={dark}><cylinderGeometry args={[0.45, 0.45, 0.06, 16]} /></mesh>
            </group>
          ))}
          {/* durum LED'i + uyarı etiketi */}
          <mesh position={[-b.w / 2 + 0.5, b.h - 0.3 + 0.24, b.d / 2 + 0.03]} material={mat('#3dff7a', { emissive: '#3dff7a', ei: night ? 2.2 : 0.9 })}><boxGeometry args={[0.12, 0.12, 0.03]} /></mesh>
          <mesh position={[0, 1.0 + 0.24, b.d / 2 + 0.02]} material={mat('#ffd23a')}><boxGeometry args={[0.5, 0.5, 0.02]} /></mesh>
          <mesh position={[0, 1.0 + 0.24, b.d / 2 + 0.035]} material={mat('#111')}><boxGeometry args={[0.1, 0.3, 0.01]} /></mesh>
        </group>
      );
    }
    case 'pcs': {
      // PCS / inverter skidi: gri kabin, soğutma kanatçıkları, kablo kanalı
      return (
        <group position={[b.x, y, b.z]}>
          <mesh position={[0, 0.1, 0]} receiveShadow material={mat('#b7b3aa')}><boxGeometry args={[b.w + 0.5, 0.2, b.d + 0.5]} /></mesh>
          <mesh position={[0, b.h / 2 + 0.2, 0]} castShadow receiveShadow material={mat('#8f969e', { metal: 0.4, rough: 0.5 })}><boxGeometry args={[b.w, b.h, b.d]} /></mesh>
          {Array.from({ length: 6 }).map((_, k) => (
            <mesh key={k} position={[-b.w / 2 + 0.3 + k * ((b.w - 0.6) / 5), b.h / 2 + 0.2, b.d / 2 + 0.06]} material={mat('#5c6168', { metal: 0.5 })}><boxGeometry args={[0.08, b.h - 0.4, 0.1]} /></mesh>
          ))}
          <mesh position={[0, b.h - 0.25 + 0.2, 0]} material={mat(COLORS.burgundy)}><boxGeometry args={[b.w + 0.03, 0.25, b.d + 0.03]} /></mesh>
          <mesh position={[0, b.h + 0.45, 0]} castShadow material={mat('#cfd3d8', { metal: 0.3 })}><boxGeometry args={[b.w * 0.6, 0.5, b.d * 0.7]} /></mesh>
          <mesh position={[0, 0.45, -b.d / 2 - 0.5]} material={mat('#6d727a', { metal: 0.5 })}><boxGeometry args={[b.w, 0.3, 0.5]} /></mesh>
        </group>
      );
    }
  }
  return null;
}

/** Cebri boru uç yükseklikleri (dünya y): baraj tepesine yakın giriş, santral önünde çıkış */
export const HES_PEN = { top: 11.5, bottom: 1.6 };

/** Kömür sahasından kazana konveyör bandı */
export function Conveyor({ from, to, y0, y1 }: { from: [number, number]; to: [number, number]; y0: number; y1: number }) {
  const dx = to[0] - from[0], dz = to[1] - from[1];
  const len = Math.hypot(dx, dz);
  const dy = y1 - y0;
  const ang = Math.atan2(dz, dx);
  const tilt = Math.atan2(dy, len);
  const L = Math.hypot(len, dy);
  const legs = Math.floor(len / 5);
  return (
    <group>
      <group position={[(from[0] + to[0]) / 2, (y0 + y1) / 2, (from[1] + to[1]) / 2]} rotation={[0, -ang, tilt]}>
        <mesh castShadow material={mat('#7d838c', { metal: 0.5 })}><boxGeometry args={[L, 0.9, 1.3]} /></mesh>
        <mesh position={[0, 0.5, 0]} material={mat('#2a2c31')}><boxGeometry args={[L, 0.1, 1.0]} /></mesh>
      </group>
      {Array.from({ length: legs }).map((_, k) => {
        const t = (k + 1) / (legs + 1);
        const x = from[0] + dx * t, z = from[1] + dz * t, h = y0 + dy * t;
        return (
          <mesh key={k} position={[x, h / 2, z]} castShadow material={mat('#5c6168', { metal: 0.5 })}>
            <boxGeometry args={[0.3, h, 0.3]} />
          </mesh>
        );
      })}
    </group>
  );
}

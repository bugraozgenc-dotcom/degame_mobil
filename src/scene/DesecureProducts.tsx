import { useFrame } from '@react-three/fiber';
import { useMemo, useRef } from 'react';
import * as THREE from 'three';
import { COLORS, mat } from './materials';
import { LogoPlate } from './IndustrialModels';

// Desecure mobil güvenlik ürünleri (stilize, gerçek ürün görsellerinden): MİK, MAS, MİA.
// Modeller +x yönüne bakar, zemin y=0.

export interface ProductProps {
  ghost?: THREE.Material;
  night?: boolean;
  getActive?: () => boolean;
}

const texCache = new Map<string, THREE.CanvasTexture>();
/** Yazı plakası dokusu (ürün adı + alt yazı) */
function labelTex(key: string, draw: (g: CanvasRenderingContext2D, w: number, h: number) => void, w = 512, h = 512) {
  let t = texCache.get(key);
  if (t) return t;
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const g = c.getContext('2d')!;
  draw(g, w, h);
  t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  texCache.set(key, t);
  return t;
}
const FONT = '"Be Vietnam Pro", "Segoe UI", Arial, sans-serif';

function mikTex() {
  return labelTex('mik', (g, w, h) => {
    g.fillStyle = '#f4f3ef';
    g.fillRect(0, 0, w, h);
    // kamera simgesi
    g.strokeStyle = '#9e1b39';
    g.lineWidth = 10;
    g.strokeRect(w / 2 - 40, 70, 80, 60);
    g.beginPath();
    g.arc(w / 2, 100, 16, 0, Math.PI * 2);
    g.stroke();
    g.fillStyle = '#9e1b39';
    g.font = `900 210px ${FONT}`;
    g.textAlign = 'center';
    g.textBaseline = 'alphabetic';
    g.fillText('MİK', w / 2, 330);
    g.font = `800 40px ${FONT}`;
    g.fillText('MOBİL İZLEME KULESİ', w / 2, 395);
    g.fillStyle = '#1d1f24';
    g.fillRect(40, 440, w - 80, 8);
    g.font = `600 30px ${FONT}`;
    g.fillText('desecuretechnology.com', w / 2, 490);
  });
}

function masTex() {
  return labelTex('mas', (g, w, h) => {
    g.fillStyle = '#4a5157';
    g.fillRect(0, 0, w, h);
    // sarı kenar şeritleri
    g.fillStyle = '#f2c230';
    for (let y = 0; y < h; y += 46) {
      g.fillRect(0, y, 30, 28);
      g.fillRect(w - 30, y + 18, 30, 28);
    }
    g.fillStyle = '#e9ecef';
    g.textAlign = 'center';
    g.font = `900 150px ${FONT}`;
    g.fillText('MAS', w / 2, 175);
    g.font = `800 32px ${FONT}`;
    g.fillText('MOBİL ALARM STANDI', w / 2, 225);
    g.font = `600 26px ${FONT}`;
    g.fillText('www.desecuretechnology.com', w / 2, 480);
  });
}

function miaTex() {
  return labelTex('mia', (g, w, h) => {
    g.fillStyle = '#f4f3ef';
    g.fillRect(0, 0, w, h);
    g.strokeStyle = '#8e1a34';
    g.lineWidth = 14;
    // büyük "D" çerçevesi
    g.beginPath();
    g.moveTo(60, 40);
    g.lineTo(260, 40);
    g.arc(260, 256, 216, -Math.PI / 2, Math.PI / 2);
    g.lineTo(60, 472);
    g.closePath();
    g.stroke();
    g.fillStyle = '#8e1a34';
    g.textAlign = 'center';
    g.font = `900 170px ${FONT}`;
    g.fillText('MİA', w / 2 + 20, 300);
    g.font = `700 34px ${FONT}`;
    g.fillText('Mobil İzleme Aracı', w / 2 + 20, 355);
    g.font = `800 40px ${FONT}`;
    g.fillStyle = '#1d1f24';
    g.fillText('444 76 49', w / 2 + 20, 430);
  });
}

const white = mat('#f3f2ee', { rough: 0.4 });
const steel = mat('#b9bec4', { metal: 0.6, rough: 0.35 });
const dark = mat('#22252a', { rough: 0.4, metal: 0.2 });
const black = mat('#121316', { rough: 0.5 });
const panelMat = mat('#1f3f78', { metal: 0.4, rough: 0.2 });
const panelFrame = mat('#d5d8dc', { metal: 0.5, rough: 0.3 });
const yellow = mat('#f2c230', { rough: 0.5 });
const grey = mat('#4a5157', { rough: 0.55, metal: 0.15 });
const burg = mat(COLORS.burgundy, { rough: 0.45 });

/** Güneş paneli (ızgara çizgili) */
function Solar({ w, h, ghost }: { w: number; h: number; ghost?: THREE.Material }) {
  const G = (m: THREE.Material) => ghost ?? m;
  const lines = [];
  for (let k = 1; k < 4; k++) lines.push(<mesh key={k} position={[0, 0.026, -h / 2 + (k * h) / 4]} material={G(panelFrame)}><boxGeometry args={[w, 0.006, 0.015]} /></mesh>);
  return (
    <group>
      <mesh castShadow material={G(panelFrame)}><boxGeometry args={[w + 0.05, 0.04, h + 0.05]} /></mesh>
      <mesh position={[0, 0.022, 0]} material={G(panelMat)}><boxGeometry args={[w - 0.03, 0.01, h - 0.03]} /></mesh>
      {lines}
    </group>
  );
}

/** PTZ dome kamera (beyaz gövde, koyu kubbe) */
function Ptz({ ghost, s = 1 }: { ghost?: THREE.Material; s?: number }) {
  const G = (m: THREE.Material) => ghost ?? m;
  return (
    <group scale={s}>
      <mesh position={[0, 0.06, 0]} material={G(white)}><cylinderGeometry args={[0.16, 0.18, 0.12, 14]} /></mesh>
      <mesh position={[0, -0.04, 0]} material={G(mat('#0d0f13', { rough: 0.1, metal: 0.6 }))}><sphereGeometry args={[0.15, 14, 10, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2]} /></mesh>
    </group>
  );
}

/** Korna hoparlör */
function Horn({ ghost }: { ghost?: THREE.Material }) {
  const G = (m: THREE.Material) => ghost ?? m;
  return (
    <group>
      <mesh rotation-z={-Math.PI / 2} position={[0.12, 0, 0]} material={G(white)}><cylinderGeometry args={[0.16, 0.05, 0.3, 14, 1, true]} /></mesh>
      <mesh rotation-z={-Math.PI / 2} position={[-0.06, 0, 0]} material={G(white)}><cylinderGeometry args={[0.06, 0.06, 0.12, 10]} /></mesh>
    </group>
  );
}

function useBeacon(getActive?: () => boolean, ghost?: THREE.Material) {
  const ref = useRef<THREE.Mesh>(null);
  const m = useMemo(() => new THREE.MeshStandardMaterial({ color: '#ff2a3a', emissive: '#ff2a3a', emissiveIntensity: 0.2 }), []);
  useFrame(({ clock }) => {
    if (ghost) return;
    const on = getActive ? getActive() : false;
    m.emissiveIntensity = on ? (Math.sin(clock.elapsedTime * 14) > 0 ? 3 : 0.3) : 0.25 + Math.max(0, Math.sin(clock.elapsedTime * 2)) * 0.5;
  });
  return { ref, m };
}

// ───────────── MİK · Mobil İzleme Kulesi ─────────────
export function MikModel({ ghost, night, getActive }: ProductProps) {
  const G = (m: THREE.Material) => ghost ?? m;
  const head = useRef<THREE.Group>(null);
  const beacon = useBeacon(getActive, ghost);
  const tex = useMemo(() => new THREE.MeshStandardMaterial({ map: mikTex(), roughness: 0.45 }), []);
  useFrame(({ clock }) => {
    if (head.current) head.current.rotation.y = Math.sin(clock.elapsedTime * 0.5) * 1.2;
  });
  const H = 6.2;
  return (
    <group>
      {/* ayaklar ve dengeleme kolları */}
      {[
        [1, 1],
        [1, -1],
        [-1, 1],
        [-1, -1],
      ].map(([sx, sz]) => (
        <group key={`${sx}${sz}`}>
          <mesh position={[sx * 0.85, 0.22, sz * 0.85]} rotation-y={Math.atan2(sz, sx)} material={G(steel)}><boxGeometry args={[0.9, 0.06, 0.06]} /></mesh>
          <mesh position={[sx * 1.15, 0.1, sz * 1.15]} material={G(steel)}><cylinderGeometry args={[0.025, 0.025, 0.25, 6]} /></mesh>
          <mesh position={[sx * 1.15, 0.01, sz * 1.15]} material={G(dark)}><boxGeometry args={[0.18, 0.02, 0.18]} /></mesh>
        </group>
      ))}
      {/* gövde (akü + kontrol kabini) */}
      <mesh position={[0, 0.95, 0]} castShadow receiveShadow material={G(white)}><boxGeometry args={[1.2, 1.35, 1.0]} /></mesh>
      <mesh position={[0.605, 0.92, 0]} rotation-y={Math.PI / 2} material={G(tex)}><planeGeometry args={[0.95, 0.95]} /></mesh>
      <mesh position={[0, 0.92, 0.505]} material={G(tex)}><planeGeometry args={[0.95, 0.95]} /></mesh>
      {/* sarı-siyah uyarı bandı */}
      {Array.from({ length: 8 }).map((_, k) => (
        <mesh key={k} position={[0.61, 1.58, -0.5 + 0.0625 + k * 0.125]} material={G(k % 2 ? black : yellow)}><boxGeometry args={[0.02, 0.07, 0.125]} /></mesh>
      ))}
      <mesh position={[0, 1.66, 0]} material={G(dark)}><boxGeometry args={[1.24, 0.06, 1.04]} /></mesh>
      {!ghost && <LogoPlate width={0.5} position={[0.25, 1.48, 0.507]} />}
      {/* güneş panelleri (eğik, arka tarafta) */}
      {[-0.42, 0, 0.42].map((dz) => (
        <group key={dz} position={[-0.95, 1.05, dz]} rotation-z={-1.0}>
          <Solar w={1.05} h={0.4} ghost={ghost} />
        </group>
      ))}
      <mesh position={[-0.75, 0.55, 0]} rotation-z={0.5} material={G(steel)}><boxGeometry args={[0.04, 0.9, 1.2]} /></mesh>
      {/* direk */}
      <mesh position={[0, 1.7 + (H - 1.7) / 2, 0]} castShadow material={G(white)}><cylinderGeometry args={[0.07, 0.09, H - 1.7, 10]} /></mesh>
      <mesh position={[0, 3.9, 0]} material={G(yellow)}><cylinderGeometry args={[0.1, 0.1, 0.1, 10]} /></mesh>
      {/* tepe: kamera, projektör, hoparlör, anten */}
      <mesh position={[0, H, 0]} material={G(white)}><boxGeometry args={[0.2, 0.2, 0.2]} /></mesh>
      <mesh position={[0, H + 0.02, 0]} material={G(steel)}><boxGeometry args={[0.08, 0.06, 1.0]} /></mesh>
      <group ref={head} position={[0, H, 0]}>
        <group position={[0.1, -0.05, -0.45]}>
          <Ptz ghost={ghost} s={1.1} />
        </group>
        <group position={[0.18, 0.02, 0.38]}>
          <Horn ghost={ghost} />
        </group>
        <mesh position={[0.2, -0.18, 0.12]} material={G(white)}><boxGeometry args={[0.22, 0.2, 0.28]} /></mesh>
        <mesh position={[0.315, -0.18, 0.12]} material={G(mat('#fff4cc', { emissive: '#ffe2a0', ei: night ? 2.2 : 0.2 }))}><boxGeometry args={[0.02, 0.15, 0.22]} /></mesh>
      </group>
      <mesh position={[-0.05, H + 0.45, 0.1]} rotation={[0, 0, 0.9]} material={G(white)}><sphereGeometry args={[0.24, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2.4]} /></mesh>
      <mesh position={[0, H + 0.3, 0]} material={G(steel)}><cylinderGeometry args={[0.02, 0.02, 0.6, 6]} /></mesh>
      <mesh ref={beacon.ref} position={[0, H + 0.64, 0]} material={G(beacon.m)}><sphereGeometry args={[0.07, 8, 6]} /></mesh>
    </group>
  );
}

// ───────────── MAS · Mobil Alarm Standı ─────────────
export function MasModel({ ghost, getActive }: ProductProps) {
  const G = (m: THREE.Material) => ghost ?? m;
  const beacon = useBeacon(getActive, ghost);
  const tex = useMemo(() => new THREE.MeshStandardMaterial({ map: masTex(), roughness: 0.55 }), []);
  const faces: [number, number, number][] = [
    [0.56, 0, 0],
    [-0.56, 0, Math.PI],
    [0, 0.56, -Math.PI / 2],
    [0, -0.56, Math.PI / 2],
  ];
  return (
    <group>
      {/* taban plakası ve destek kanatları */}
      <mesh position={[0, 0.03, 0]} receiveShadow material={G(grey)}><boxGeometry args={[1.7, 0.06, 1.7]} /></mesh>
      {faces.map(([x, z, r], k) => (
        <mesh key={k} position={[x * 1.15, 0.2, z * 1.15]} rotation-y={r} material={G(grey)}><boxGeometry args={[0.3, 0.32, 0.08]} /></mesh>
      ))}
      {/* alt gövde */}
      <mesh position={[0, 0.75, 0]} castShadow receiveShadow material={G(grey)}><boxGeometry args={[1.1, 1.1, 1.1]} /></mesh>
      {faces.map(([x, z, r], k) => (
        <group key={k} position={[x, 0.75, z]} rotation-y={-r}>
          <mesh position={[0.006, 0, 0]} rotation-y={Math.PI / 2} material={G(tex)}><planeGeometry args={[1.08, 1.08]} /></mesh>
          {k === 0 && (
            <>
              {/* siren / hoparlör */}
              <mesh position={[0.03, -0.12, 0]} material={G(steel)}><boxGeometry args={[0.05, 0.36, 0.36]} /></mesh>
              <mesh position={[0.06, -0.12, 0]} material={G(dark)}><boxGeometry args={[0.03, 0.3, 0.3]} /></mesh>
            </>
          )}
        </group>
      ))}
      {/* üst gövde: dört yönde kameralı dedektör */}
      <mesh position={[0, 1.68, 0]} castShadow material={G(grey)}><boxGeometry args={[0.95, 0.75, 0.95]} /></mesh>
      {faces.map(([x, z, r], k) => (
        <group key={k} position={[x * 0.86, 1.66, z * 0.86]} rotation-y={-r}>
          <mesh position={[0.01, 0, 0]} material={G(dark)}><boxGeometry args={[0.04, 0.5, 0.42]} /></mesh>
          <mesh position={[0.06, -0.03, 0]} material={G(white)}><boxGeometry args={[0.08, 0.34, 0.18]} /></mesh>
          <mesh position={[0.105, -0.01, 0]} material={G(black)}><boxGeometry args={[0.01, 0.16, 0.1]} /></mesh>
          <mesh position={[0.04, 0.22, 0]} material={G(k === 0 ? beacon.m : mat('#ff3a3a', { emissive: '#ff3a3a', ei: 0.6 }))} ref={k === 0 ? beacon.ref : undefined}><boxGeometry args={[0.03, 0.04, 0.2]} /></mesh>
        </group>
      ))}
      {/* güneş paneli */}
      <group position={[0, 2.16, 0]} rotation-z={0.3}>
        <Solar w={1.0} h={0.95} ghost={ghost} />
      </group>
      <mesh position={[-0.42, 2.1, 0]} material={G(grey)}><boxGeometry args={[0.1, 0.18, 0.9]} /></mesh>
    </group>
  );
}

// ───────────── MİA · Mobil İzleme Aracı ─────────────
export function MiaModel({ ghost, night, getActive }: ProductProps) {
  const G = (m: THREE.Material) => ghost ?? m;
  const beacon = useBeacon(getActive, ghost);
  const head = useRef<THREE.Group>(null);
  const tex = useMemo(() => new THREE.MeshStandardMaterial({ map: miaTex(), roughness: 0.45 }), []);
  useFrame(({ clock }) => {
    if (head.current) head.current.rotation.y = Math.sin(clock.elapsedTime * 0.4 + 1) * 1.0;
  });
  const boxY = 1.25;
  return (
    <group>
      {/* şasi ve çeki demiri (+x) */}
      <mesh position={[0, 0.48, 0]} material={G(steel)}><boxGeometry args={[1.7, 0.08, 1.3]} /></mesh>
      <mesh position={[1.25, 0.46, 0.25]} rotation-y={-0.35} material={G(steel)}><boxGeometry args={[1.0, 0.07, 0.07]} /></mesh>
      <mesh position={[1.25, 0.46, -0.25]} rotation-y={0.35} material={G(steel)}><boxGeometry args={[1.0, 0.07, 0.07]} /></mesh>
      <mesh position={[1.72, 0.46, 0]} material={G(steel)}><boxGeometry args={[0.2, 0.09, 0.1]} /></mesh>
      <mesh position={[1.55, 0.25, 0.12]} material={G(steel)}><cylinderGeometry args={[0.03, 0.03, 0.45, 6]} /></mesh>
      <mesh position={[1.55, 0.08, 0.12]} rotation-x={Math.PI / 2} material={G(black)}><cylinderGeometry args={[0.08, 0.08, 0.05, 10]} /></mesh>
      {/* tekerlekler ve çamurluklar */}
      {[0.72, -0.72].map((z) => (
        <group key={z}>
          <mesh position={[0, 0.3, z]} rotation-x={Math.PI / 2} castShadow material={G(black)}><cylinderGeometry args={[0.3, 0.3, 0.18, 14]} /></mesh>
          <mesh position={[0, 0.3, z + Math.sign(z) * 0.095]} rotation-x={Math.PI / 2} material={G(steel)}><cylinderGeometry args={[0.15, 0.15, 0.02, 10]} /></mesh>
          <mesh position={[0, 0.62, z]} material={G(black)}><boxGeometry args={[0.75, 0.06, 0.24]} /></mesh>
        </group>
      ))}
      {/* dengeleme ayakları */}
      {[
        [0.8, 0.6],
        [0.8, -0.6],
        [-0.8, 0.6],
        [-0.8, -0.6],
      ].map(([x, z]) => (
        <mesh key={`${x}${z}`} position={[x, 0.22, z]} material={G(dark)}><boxGeometry args={[0.06, 0.45, 0.06]} /></mesh>
      ))}
      {/* kasa */}
      <mesh position={[0, boxY, 0]} castShadow receiveShadow material={G(white)}><boxGeometry args={[1.6, 1.45, 1.3]} /></mesh>
      <mesh position={[0, boxY, 0.652]} material={G(tex)}><planeGeometry args={[1.25, 1.25]} /></mesh>
      <mesh position={[0, boxY, -0.652]} rotation-y={Math.PI} material={G(tex)}><planeGeometry args={[1.25, 1.25]} /></mesh>
      <mesh position={[-0.802, boxY, 0]} rotation-y={-Math.PI / 2} material={G(tex)}><planeGeometry args={[1.1, 1.1]} /></mesh>
      {!ghost && <LogoPlate width={0.7} position={[0.802, boxY + 0.45, 0]} rotationY={Math.PI / 2} />}
      <mesh position={[0, boxY + 0.74, 0]} material={G(dark)}><boxGeometry args={[1.64, 0.04, 1.34]} /></mesh>
      {/* direk ve kamera başlığı */}
      <mesh position={[0, boxY + 0.74 + 1.1, 0]} castShadow material={G(black)}><boxGeometry args={[0.14, 2.2, 0.14]} /></mesh>
      <mesh position={[0, boxY + 1.3, 0]} material={G(yellow)}><boxGeometry args={[0.32, 0.03, 0.32]} /></mesh>
      <group ref={head} position={[0, 4.15, 0]}>
        <mesh material={G(black)}><boxGeometry args={[0.36, 0.42, 0.32]} /></mesh>
        {/* bullet kamera */}
        <mesh position={[0.32, 0.12, 0.05]} rotation-z={-Math.PI / 2} material={G(white)}><cylinderGeometry args={[0.08, 0.09, 0.36, 10]} /></mesh>
        <mesh position={[0.5, 0.12, 0.05]} material={G(black)}><boxGeometry args={[0.01, 0.1, 0.1]} /></mesh>
        {/* PTZ + hoparlör */}
        <group position={[-0.05, -0.25, -0.32]}>
          <Ptz ghost={ghost} s={1.1} />
        </group>
        <group position={[0.15, -0.3, 0.3]}>
          <Horn ghost={ghost} />
        </group>
        <mesh position={[0.2, -0.05, -0.15]} material={G(mat('#fff4cc', { emissive: '#ffe2a0', ei: night ? 2 : 0.15 }))}><boxGeometry args={[0.02, 0.12, 0.16]} /></mesh>
      </group>
      <mesh ref={beacon.ref} position={[0, 4.42, 0]} material={G(beacon.m)}><sphereGeometry args={[0.07, 8, 6]} /></mesh>
      <mesh position={[0.8, boxY - 0.6, 0.55]} material={G(burg)}><boxGeometry args={[0.02, 0.08, 0.2]} /></mesh>
    </group>
  );
}

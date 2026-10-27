import { useFrame } from '@react-three/fiber';
import { useMemo, useRef } from 'react';
import * as THREE from 'three';
import { EQUIPMENT } from '../game/config/equipment';
import type { EquipmentType } from '../game/types';
import { COLORS, mat } from './materials';
import { LogoPlate } from './IndustrialModels';
import { MasModel, MiaModel, MikModel } from './DesecureProducts';

// SecurityEquipment — stilize 3D cihaz modelleri (+x yönüne bakar)

export interface ModelProps {
  type: EquipmentType;
  level: 1 | 2;
  yaw: number;
  /** çift başlı bullet: ikinci başlık yönü */
  yaw2?: number;
  ghost?: THREE.Material;
  night?: boolean;
  getYaw?: () => number;
  getActive?: () => boolean;
  getDisabled?: () => boolean;
  hideVehicle?: boolean;
}

const poleMat = mat('#6d727a', { metal: 0.55, rough: 0.4 });
const whiteMat = mat('#f2f1ee', { rough: 0.35 });
const darkMat = mat('#24262b', { rough: 0.35, metal: 0.2 });
const lensMat = mat('#0b0d12', { rough: 0.1, metal: 0.6 });
const burg = mat(COLORS.burgundy, { rough: 0.45 });

export function DeviceModel(p: ModelProps) {
  const head = useRef<THREE.Group>(null);
  const head2 = useRef<THREE.Group>(null);
  const beacon = useRef<THREE.Mesh>(null);
  const led = useRef<THREE.Mesh>(null);
  const lamp = useRef<THREE.Mesh>(null);
  const ring = useRef<THREE.Mesh>(null);
  const drone = useRef<THREE.Group>(null);
  const rotors = useRef<THREE.Group>(null);
  const G = (m: THREE.Material) => p.ghost ?? m;
  const spec = EQUIPMENT[p.type];
  const H = spec.mountHeight;
  // animasyonlu parçalar için cihaza özel malzemeler
  const ledMat = useMemo(() => new THREE.MeshStandardMaterial({ color: '#ff2a2a', emissive: '#ff2a2a', emissiveIntensity: 1 }), []);
  const beaconMat = useMemo(() => {
    const c = p.type === 'siren' ? '#ff2030' : p.type === 'speaker' ? '#6fd3ff' : p.type === 'patrol' ? '#3aa0ff' : '#33ff99';
    return new THREE.MeshStandardMaterial({ color: p.type === 'speaker' ? '#ffffff' : c, emissive: c, emissiveIntensity: 0.2, roughness: 0.2 });
  }, [p.type]);
  const lampMat = useMemo(() => new THREE.MeshStandardMaterial({ color: '#fff2cc', emissive: '#ffd48a', emissiveIntensity: 1.5 }), []);

  useFrame(({ clock }) => {
    const t = clock.elapsedTime;
    if (head.current) head.current.rotation.y = -(p.getYaw ? p.getYaw() : p.yaw);
    if (head2.current && p.yaw2 !== undefined) head2.current.rotation.y = -p.yaw2;
    const active = p.getActive ? p.getActive() : false;
    const disabled = p.getDisabled ? p.getDisabled() : false;
    if (beacon.current) {
      const m = beacon.current.material as THREE.MeshStandardMaterial;
      if (!p.ghost) m.emissiveIntensity = active ? 2.5 + Math.sin(t * 20) * 1.5 : 0.15;
      beacon.current.rotation.y = active ? t * 10 : 0;
    }
    if (led.current && !p.ghost) {
      const m = led.current.material as THREE.MeshStandardMaterial;
      m.emissiveIntensity = disabled ? 0 : (Math.sin(t * 3 + p.yaw * 7) > 0.6 ? 2 : 0.4);
      m.emissive.set(disabled ? '#000' : '#ff2a2a');
    }
    if (lamp.current && !p.ghost) {
      const m = lamp.current.material as THREE.MeshStandardMaterial;
      m.emissiveIntensity = p.night ? (active ? 3.2 : 1.8) : 0.05;
    }
    if (ring.current) ring.current.visible = disabled;
    // drone: dok çevresinde yavaş daire + hafif salınım; pervaneler döner
    if (drone.current) {
      const r = p.ghost ? 0 : 2.4;
      const a = t * 0.45 + p.yaw;
      drone.current.position.set(Math.cos(a) * r, (disabled ? 0.6 : H) + Math.sin(t * 1.6) * 0.3, Math.sin(a) * r);
      drone.current.rotation.y = -a - Math.PI / 2;
      drone.current.rotation.z = disabled ? 0 : 0.08;
    }
    if (rotors.current) rotors.current.children.forEach((c, k) => (c.rotation.y = t * (disabled ? 0 : 40) * (k % 2 ? 1 : -1)));
  });

  const lvlBand = p.level === 2 ? <mesh position={[0, H * 0.45, 0]} material={G(mat('#e0b23c', { metal: 0.6, rough: 0.3 }))}><cylinderGeometry args={[0.1, 0.1, 0.18, 10]} /></mesh> : null;
  const offline = (
    <mesh ref={ring} position={[0, H + 0.9, 0]} visible={false} material={mat('#ff8a1f', { emissive: '#ff8a1f', ei: 1.4 })}>
      <octahedronGeometry args={[0.25, 0]} />
    </mesh>
  );

  const pole = (h: number, r = 0.07) => (
    <>
      <mesh position={[0, 0.06, 0]} castShadow material={G(mat('#9a9890'))}><cylinderGeometry args={[0.28, 0.32, 0.12, 10]} /></mesh>
      <mesh position={[0, h / 2, 0]} castShadow material={G(poleMat)}><cylinderGeometry args={[r * 0.8, r, h, 8]} /></mesh>
    </>
  );

  switch (p.type) {
    case 'fixedCam':
    case 'bulletCam':
    case 'thermalCam': {
      const thermal = p.type === 'thermalCam';
      const camHead = (withLed: boolean) => (
        <>
          <mesh position={[0.18, 0, 0]} material={G(poleMat)}><boxGeometry args={[0.36, 0.06, 0.06]} /></mesh>
          <mesh position={[0.48, -0.05, 0]} rotation-z={-0.18} castShadow material={G(thermal ? darkMat : whiteMat)}><boxGeometry args={[0.62, 0.24, 0.24]} /></mesh>
          <mesh position={[0.5, 0.1, 0]} rotation-z={-0.18} material={G(thermal ? mat('#ff7a2f') : burg)}><boxGeometry args={[0.72, 0.04, 0.3]} /></mesh>
          <mesh position={[0.8, -0.11, 0]} rotation-z={Math.PI / 2 - 0.18} material={G(thermal ? mat('#ff7a2f', { emissive: '#ff5a10', ei: 0.6 }) : lensMat)}><cylinderGeometry args={[0.09, 0.09, 0.04, 14]} /></mesh>
          {withLed ? <mesh ref={led} position={[0.79, 0.02, 0.08]} material={ledMat}><sphereGeometry args={[0.025, 6, 4]} /></mesh> : <mesh position={[0.79, 0.02, 0.08]} material={ledMat}><sphereGeometry args={[0.025, 6, 4]} /></mesh>}
        </>
      );
      return (
        <group>
          {pole(H)}
          {lvlBand}
          {offline}
          <group ref={head} position={[0, H, 0]}>{camHead(true)}</group>
          {p.yaw2 !== undefined && (
            // çift başlı bullet (fuar modu): ikinci başlık biraz aşağıda, kendi yönünde
            <group ref={head2} position={[0, H - 0.34, 0]}>{camHead(false)}</group>
          )}
        </group>
      );
    }
    case 'ptzCam':
      return (
        <group>
          {pole(H, 0.09)}
          {lvlBand}
          {offline}
          <mesh position={[0.25, H + 0.05, 0]} material={G(poleMat)}><boxGeometry args={[0.5, 0.08, 0.08]} /></mesh>
          <group ref={head} position={[0, H, 0]}>
            <group position={[0.5, -0.05, 0]}>
              <mesh position={[0, 0.06, 0]} castShadow material={G(whiteMat)}><cylinderGeometry args={[0.24, 0.26, 0.18, 16]} /></mesh>
              <mesh position={[0, -0.03, 0]} material={G(mat('#1b2230', { rough: 0.05, metal: 0.7 }))}><sphereGeometry args={[0.22, 16, 10, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2]} /></mesh>
              <mesh position={[0.17, -0.08, 0]} rotation-z={Math.PI / 2} material={G(mat('#ffd166', { emissive: '#ffb020', ei: 0.4 }))}><cylinderGeometry args={[0.05, 0.05, 0.05, 10]} /></mesh>
              <mesh position={[0, 0.17, 0]} material={G(burg)}><cylinderGeometry args={[0.27, 0.27, 0.04, 16]} /></mesh>
              <mesh ref={led} position={[0.2, 0.08, 0.12]} material={ledMat}><sphereGeometry args={[0.025, 6, 4]} /></mesh>
            </group>
          </group>
        </group>
      );
    case 'motion':
      return (
        <group>
          {pole(H, 0.05)}
          {lvlBand}
          {offline}
          <group ref={head} position={[0, H, 0]}>
            <mesh castShadow material={G(whiteMat)}><boxGeometry args={[0.2, 0.26, 0.2]} /></mesh>
            <mesh position={[0.1, -0.02, 0]} material={G(mat('#e9eef5', { rough: 0.1 }))}><sphereGeometry args={[0.08, 10, 8]} /></mesh>
            <mesh ref={led} position={[0.1, 0.1, 0]} material={ledMat}><sphereGeometry args={[0.025, 6, 4]} /></mesh>
          </group>
        </group>
      );
    case 'perimeter':
      return (
        <group>
          {pole(1.3, 0.05)}
          {offline}
          <mesh position={[0, 1.25, 0]} castShadow material={G(mat('#2e3238'))}><boxGeometry args={[0.32, 0.36, 0.18]} /></mesh>
          <mesh position={[0, 1.25, 0.1]} material={G(mat('#ffd23f'))}><boxGeometry args={[0.2, 0.06, 0.02]} /></mesh>
          <mesh ref={led} position={[0.12, 1.4, 0.1]} material={ledMat}><sphereGeometry args={[0.03, 6, 4]} /></mesh>
        </group>
      );
    case 'speaker':
      return (
        <group>
          {pole(H)}
          {lvlBand}
          <group ref={head} position={[0, H - 0.2, 0]}>
            {[0, Math.PI].map((r) => (
              <group key={r} rotation-y={r}>
                <mesh position={[0.3, 0, 0]} rotation-z={-Math.PI / 2} castShadow material={G(mat('#d8dadd', { metal: 0.3 }))}><coneGeometry args={[0.22, 0.45, 12, 1, true]} /></mesh>
                <mesh position={[0.1, 0, 0]} material={G(darkMat)}><boxGeometry args={[0.14, 0.14, 0.14]} /></mesh>
              </group>
            ))}
          </group>
          <mesh ref={beacon} position={[0, H + 0.05, 0]} material={G(beaconMat)}><sphereGeometry args={[0.07, 8, 6]} /></mesh>
        </group>
      );
    case 'siren':
      return (
        <group>
          {pole(H)}
          {lvlBand}
          <mesh position={[0, H + 0.05, 0]} castShadow material={G(darkMat)}><cylinderGeometry args={[0.18, 0.2, 0.12, 12]} /></mesh>
          <mesh ref={beacon} position={[0, H + 0.24, 0]} material={G(beaconMat)}>
            <cylinderGeometry args={[0.14, 0.17, 0.28, 12]} />
          </mesh>
          <mesh position={[0, H - 0.3, 0.12]} rotation-x={Math.PI / 2} material={G(mat('#d8dadd'))}><cylinderGeometry args={[0.16, 0.16, 0.1, 12]} /></mesh>
        </group>
      );
    case 'light':
      return (
        <group>
          {pole(H, 0.09)}
          {lvlBand}
          <mesh position={[0.45, H, 0]} material={G(poleMat)}><boxGeometry args={[0.9, 0.08, 0.08]} /></mesh>
          <mesh position={[0.9, H - 0.08, 0]} castShadow material={G(darkMat)}><boxGeometry args={[0.55, 0.14, 0.32]} /></mesh>
          <mesh ref={lamp} position={[0.9, H - 0.16, 0]} material={G(lampMat)}><boxGeometry args={[0.45, 0.03, 0.26]} /></mesh>
        </group>
      );
    case 'mik':
      return <MikModel ghost={p.ghost} night={p.night} getActive={p.getActive} />;
    case 'mas':
      return <MasModel ghost={p.ghost} night={p.night} getActive={p.getActive} />;
    case 'mia':
      return <MiaModel ghost={p.ghost} night={p.night} getActive={p.getActive} />;
    case 'drone': {
      const arm = G(mat('#2a2d33', { metal: 0.4, rough: 0.5 }));
      const body = G(mat('#f2f1ee', { rough: 0.35 }));
      return (
        <group>
          {/* dok: beton pad + Desecure şeridi + şarj kolonu */}
          <mesh position={[0, 0.06, 0]} castShadow material={G(mat('#9a9890'))}><cylinderGeometry args={[0.95, 1.0, 0.12, 20]} /></mesh>
          <mesh position={[0, 0.13, 0]} material={G(burg)}><cylinderGeometry args={[0.98, 0.98, 0.04, 20, 1, true]} /></mesh>
          <mesh position={[0, 0.14, 0]} rotation-x={-Math.PI / 2} material={G(mat('#e8e6e0'))}><ringGeometry args={[0.55, 0.62, 20]} /></mesh>
          <mesh position={[0.75, 0.45, 0]} castShadow material={G(poleMat)}><boxGeometry args={[0.18, 0.8, 0.18]} /></mesh>
          <mesh ref={led} position={[0.75, 0.9, 0]} material={ledMat}><sphereGeometry args={[0.07, 8, 6]} /></mesh>
          {lvlBand}
          {/* uçan gövde */}
          <group ref={drone} position={[0, H, 0]}>
            <mesh castShadow material={body}><boxGeometry args={[0.9, 0.26, 0.9]} /></mesh>
            <mesh position={[0, 0.2, 0]} material={G(burg)}><boxGeometry args={[0.5, 0.14, 0.5]} /></mesh>
            {[-1, 1].map((sx) =>
              [-1, 1].map((sz) => (
                <mesh key={`${sx}${sz}`} position={[sx * 0.55, 0.02, sz * 0.55]} rotation-y={Math.atan2(sz, sx)} material={arm}><boxGeometry args={[0.9, 0.08, 0.1]} /></mesh>
              ))
            )}
            <group ref={rotors}>
              {[-1, 1].map((sx) =>
                [-1, 1].map((sz) => (
                  <group key={`${sx}${sz}`} position={[sx * 0.95, 0.12, sz * 0.95]}>
                    <mesh material={G(mat('#2a2d33'))}><cylinderGeometry args={[0.07, 0.09, 0.14, 8]} /></mesh>
                    <mesh position={[0, 0.1, 0]} material={G(mat('#3a3d44', { rough: 0.3 }))}><boxGeometry args={[0.9, 0.02, 0.09]} /></mesh>
                    <mesh position={[0, 0.1, 0]} rotation-y={Math.PI / 2} material={G(mat('#3a3d44', { rough: 0.3 }))}><boxGeometry args={[0.9, 0.02, 0.09]} /></mesh>
                  </group>
                ))
              )}
            </group>
            {/* gimbal kamera (aşağı bakar) */}
            <mesh position={[0, -0.25, 0]} material={G(darkMat)}><sphereGeometry args={[0.16, 10, 8]} /></mesh>
            <mesh position={[0.1, -0.3, 0]} rotation-z={-1.1} material={G(lensMat)}><cylinderGeometry args={[0.06, 0.08, 0.14, 10]} /></mesh>
            {/* iniş ayakları */}
            {[-1, 1].map((sz) => (
              <mesh key={sz} position={[0, -0.3, sz * 0.3]} material={arm}><boxGeometry args={[0.7, 0.05, 0.05]} /></mesh>
            ))}
            {/* konum ışıkları */}
            <mesh position={[0.5, 0.05, 0.5]} material={G(mat('#3dff7a', { emissive: '#3dff7a', ei: 2 }))}><sphereGeometry args={[0.05, 6, 5]} /></mesh>
            <mesh position={[-0.5, 0.05, -0.5]} material={G(mat('#ff3b4e', { emissive: '#ff3b4e', ei: 2 }))}><sphereGeometry args={[0.05, 6, 5]} /></mesh>
          </group>
          {offline}
        </group>
      );
    }
    case 'tower': {
      const legs = [];
      for (const [lx, lz] of [[-0.7, -0.7], [0.7, -0.7], [0.7, 0.7], [-0.7, 0.7]]) {
        legs.push(
          <mesh key={`${lx}${lz}`} position={[lx * 0.85, 4.4, lz * 0.85]} rotation={[lz * 0.06, 0, -lx * 0.06]} castShadow material={G(mat('#5c6168', { metal: 0.5 }))}>
            <boxGeometry args={[0.16, 8.8, 0.16]} />
          </mesh>
        );
      }
      const braces = [];
      for (let k = 0; k < 4; k++) {
        const y = 1.5 + k * 2;
        braces.push(
          <group key={k} position={[0, y, 0]}>
            <mesh position={[0, 0, 0.62]} rotation-z={0.6} material={G(mat('#6d727a'))}><boxGeometry args={[1.6, 0.06, 0.06]} /></mesh>
            <mesh position={[0, 0, -0.62]} rotation-z={-0.6} material={G(mat('#6d727a'))}><boxGeometry args={[1.6, 0.06, 0.06]} /></mesh>
            <mesh position={[0.62, 0, 0]} rotation-x={0.6} material={G(mat('#6d727a'))}><boxGeometry args={[0.06, 0.06, 1.6]} /></mesh>
            <mesh position={[-0.62, 0, 0]} rotation-x={-0.6} material={G(mat('#6d727a'))}><boxGeometry args={[0.06, 0.06, 1.6]} /></mesh>
          </group>
        );
      }
      return (
        <group>
          {legs}
          {braces}
          <mesh position={[0, 8.8, 0]} castShadow material={G(mat('#8a8f96'))}><boxGeometry args={[2.3, 0.15, 2.3]} /></mesh>
          <mesh position={[0, 9.5, 0]} castShadow material={G(whiteMat)}><boxGeometry args={[1.6, 1.3, 1.6]} /></mesh>
          {[0, 1, 2, 3].map((k) => (
            <mesh key={k} position={[Math.cos((k * Math.PI) / 2) * 0.81, 9.6, Math.sin((k * Math.PI) / 2) * 0.81]} rotation-y={-(k * Math.PI) / 2} material={G(mat('#2e4a66', { emissive: '#ffcf7a', ei: p.night ? 1 : 0.05, rough: 0.2 }))}>
              <boxGeometry args={[0.04, 0.5, 1.2]} />
            </mesh>
          ))}
          <mesh position={[0, 10.35, 0]} rotation-y={Math.PI / 4} castShadow material={G(burg)}><coneGeometry args={[1.45, 0.6, 4]} /></mesh>
          <group ref={head} position={[0, 10.7, 0]}>
            <mesh position={[0.15, 0, 0]} material={G(whiteMat)}><boxGeometry args={[0.4, 0.16, 0.16]} /></mesh>
          </group>
          {offline}
          <mesh ref={led} position={[0, 10.9, 0]} material={ledMat}><sphereGeometry args={[0.06, 6, 4]} /></mesh>
        </group>
      );
    }
    case 'patrol':
      return (
        <group>
          <mesh position={[0, 0.08, 0]} receiveShadow material={G(mat('#b4b0a8'))}><boxGeometry args={[1.1, 0.16, 1.1]} /></mesh>
          <mesh position={[0, 1.2, 0]} castShadow material={G(whiteMat)}><boxGeometry args={[0.9, 2.1, 0.9]} /></mesh>
          <mesh position={[0.46, 1.5, 0]} material={G(mat('#2e4a66', { emissive: '#ffcf7a', ei: p.night ? 1 : 0.05, rough: 0.2 }))}><boxGeometry args={[0.03, 0.6, 0.6]} /></mesh>
          <mesh position={[0, 2.35, 0]} castShadow material={G(burg)}><boxGeometry args={[1.15, 0.18, 1.15]} /></mesh>
          <mesh ref={beacon} position={[0, 2.55, 0]} material={G(beaconMat)}><sphereGeometry args={[0.08, 8, 6]} /></mesh>
          {!p.ghost && <LogoPlate width={0.8} position={[0, 1.95, 0.46]} />}
        </group>
      );
    case 'vehicle':
      if (p.hideVehicle) {
        return (
          <group>
            <mesh position={[0, 0.03, 0]} rotation-x={-Math.PI / 2} material={G(mat('#e8e2d0'))}><planeGeometry args={[2.0, 2.0]} /></mesh>
            <mesh position={[0, 0.04, 0]} rotation-x={-Math.PI / 2} material={G(burg)}><ringGeometry args={[0.85, 0.95, 24]} /></mesh>
          </group>
        );
      }
      return <PatrolTruck ghost={p.ghost} night={p.night} />;
    case 'control':
      return (
        <group>
          <mesh position={[0, 0.1, 0]} receiveShadow material={G(mat('#b4b0a8'))}><boxGeometry args={[3.0, 0.2, 3.0]} /></mesh>
          <mesh position={[0, 1.5, 0]} castShadow receiveShadow material={G(mat('#1d1f24', { rough: 0.5 }))}><boxGeometry args={[2.7, 2.6, 2.5]} /></mesh>
          <mesh position={[0, 2.5, 0]} material={G(burg)}><boxGeometry args={[2.74, 0.3, 2.54]} /></mesh>
          {[-0.7, 0.2].map((wx) => (
            <mesh key={wx} position={[wx, 1.5, 1.26]} material={G(mat('#4a7fb0', { emissive: '#7fd3ff', ei: p.night ? 1.2 : 0.25, rough: 0.1 }))}><boxGeometry args={[0.7, 0.8, 0.03]} /></mesh>
          ))}
          <mesh position={[1.36, 1.1, 0]} material={G(mat('#3a3d44'))}><boxGeometry args={[0.03, 1.9, 0.8]} /></mesh>
          {!p.ghost && <LogoPlate width={2.2} position={[0, 2.1, 1.27]} />}
          <mesh position={[0.6, 3.3, -0.6]} rotation={[0.6, 0.8, 0]} material={G(mat('#efefef'))}><sphereGeometry args={[0.55, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2.3]} /></mesh>
          <mesh position={[-0.9, 3.6, -0.8]} material={G(poleMat)}><cylinderGeometry args={[0.04, 0.05, 2.0, 6]} /></mesh>
          <mesh ref={beacon} position={[-0.9, 4.65, -0.8]} material={G(beaconMat)}><sphereGeometry args={[0.08, 8, 6]} /></mesh>
        </group>
      );
  }
}

export function PatrolTruck({ ghost, night, getSiren }: { ghost?: THREE.Material; night?: boolean; getSiren?: () => boolean }) {
  const G = (m: THREE.Material) => ghost ?? m;
  const red = useRef<THREE.Mesh>(null);
  const blue = useRef<THREE.Mesh>(null);
  const redMat = useMemo(() => new THREE.MeshStandardMaterial({ color: '#ff2030', emissive: '#ff2030', emissiveIntensity: 0.2 }), []);
  const blueMat = useMemo(() => new THREE.MeshStandardMaterial({ color: '#2a6bff', emissive: '#2a6bff', emissiveIntensity: 0.2 }), []);
  useFrame(({ clock }) => {
    const on = getSiren ? getSiren() : false;
    const t = clock.elapsedTime * 8;
    if (red.current && !ghost) (red.current.material as THREE.MeshStandardMaterial).emissiveIntensity = on ? (Math.sin(t) > 0 ? 3 : 0.1) : 0.2;
    if (blue.current && !ghost) (blue.current.material as THREE.MeshStandardMaterial).emissiveIntensity = on ? (Math.sin(t) <= 0 ? 3 : 0.1) : 0.2;
  });
  return (
    <group>
      <mesh position={[0, 0.62, 0]} castShadow material={G(mat('#f4f3ef', { metal: 0.3, rough: 0.35 }))}><boxGeometry args={[2.5, 0.6, 1.2]} /></mesh>
      <mesh position={[0.35, 1.18, 0]} castShadow material={G(mat('#f4f3ef', { metal: 0.3, rough: 0.35 }))}><boxGeometry args={[1.1, 0.55, 1.12]} /></mesh>
      <mesh position={[0.92, 1.18, 0]} material={G(mat('#22303f', { rough: 0.1, metal: 0.5 }))}><boxGeometry args={[0.03, 0.42, 1.0]} /></mesh>
      <mesh position={[0, 0.7, 0.61]} material={G(mat(COLORS.burgundy))}><boxGeometry args={[2.5, 0.14, 0.02]} /></mesh>
      <mesh position={[0, 0.7, -0.61]} material={G(mat(COLORS.burgundy))}><boxGeometry args={[2.5, 0.14, 0.02]} /></mesh>
      <mesh ref={red} position={[0.35, 1.52, 0.28]} material={G(redMat)}><boxGeometry args={[0.25, 0.12, 0.45]} /></mesh>
      <mesh ref={blue} position={[0.35, 1.52, -0.28]} material={G(blueMat)}><boxGeometry args={[0.25, 0.12, 0.45]} /></mesh>
      {[-0.8, 0.8].map((wx) =>
        [-0.58, 0.58].map((wz) => (
          <mesh key={`${wx}${wz}`} position={[wx, 0.3, wz]} rotation-x={Math.PI / 2} material={G(mat('#16171a'))}><cylinderGeometry args={[0.3, 0.3, 0.2, 12]} /></mesh>
        ))
      )}
      <mesh position={[1.26, 0.65, 0.38]} material={G(mat('#fff', { emissive: '#fff6d0', ei: night ? 2 : 0.1 }))}><boxGeometry args={[0.03, 0.14, 0.24]} /></mesh>
      <mesh position={[1.26, 0.65, -0.38]} material={G(mat('#fff', { emissive: '#fff6d0', ei: night ? 2 : 0.1 }))}><boxGeometry args={[0.03, 0.14, 0.24]} /></mesh>
    </group>
  );
}

import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { useLayoutEffect, useRef } from 'react';
import * as THREE from 'three';
import type { EquipmentType } from '../game/types';
import { DeviceModel } from '../scene/SecurityEquipment';

// Bonus paneli küçük resmi: ürünün oyundaki 3D modeli, yavaşça dönerek.

function Fit({ children }: { children: React.ReactNode }) {
  const group = useRef<THREE.Group>(null);
  const spin = useRef<THREE.Group>(null);
  const { camera } = useThree();
  useLayoutEffect(() => {
    const g = group.current;
    if (!g) return;
    g.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(g);
    const size = box.getSize(new THREE.Vector3());
    const center = box.getCenter(new THREE.Vector3());
    // modeli ortala, zemini y=0'da tut
    g.position.set(-center.x, -box.min.y, -center.z);
    const cam = camera as THREE.PerspectiveCamera;
    const radius = Math.max(size.y * 0.5, Math.hypot(size.x, size.z) * 0.48);
    const dist = radius / Math.tan(((cam.fov / 2) * Math.PI) / 180) * 1.02;
    const dir = new THREE.Vector3(1, 0.42, 0.9).normalize();
    const target = new THREE.Vector3(0, size.y * 0.5, 0);
    cam.position.copy(target).addScaledVector(dir, dist);
    cam.near = dist / 20;
    cam.far = dist * 4;
    cam.lookAt(target);
    cam.updateProjectionMatrix();
  }, [camera]);
  useFrame((_, dt) => {
    if (spin.current) spin.current.rotation.y += dt * 0.6;
  });
  return (
    <group ref={spin}>
      <group ref={group}>{children}</group>
    </group>
  );
}

export function ProductThumb({ type, className }: { type: EquipmentType; className?: string }) {
  return (
    <div className={`product-thumb ${className ?? ''}`} aria-hidden>
      <Canvas dpr={[1, 2]} gl={{ antialias: true, alpha: true, powerPreference: 'low-power' }} camera={{ fov: 28, position: [8, 4, 8] }} frameloop="always">
        <hemisphereLight args={['#eaf4ff', '#3a3f2a', 1.1]} />
        <directionalLight position={[5, 8, 4]} intensity={2.2} color="#fff2dc" />
        <directionalLight position={[-4, 3, -5]} intensity={0.6} color="#bcd4ff" />
        <Fit>
          <DeviceModel type={type} level={1} yaw={0} />
        </Fit>
      </Canvas>
    </div>
  );
}

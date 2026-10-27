import { useFrame } from '@react-three/fiber';
import { useLayoutEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { useGame, getEngine } from '../game/store';
import type { BuildingDef, MapData } from '../game/types';
import { fenceNorth, fenceWorld, mulberry32 } from '../game/world/grid';
import { COLORS, corrugatedTexture, fenceTexture, mat, noRaycast, panelTexture, textTexture } from './materials';
import { useMarginTrees } from './Terrain';
import { HES } from '../game/world/maps';
import { Steam } from './IndustrialModels';
import { IndustrialBuilding, LogoPlate } from './IndustrialModels';

// Tesis nesneleri — tekrarlanan nesnelerde instancing kullanılır.

export interface InstItem {
  x: number;
  y: number;
  z: number;
  rx?: number;
  ry?: number;
  rz?: number;
  sx?: number;
  sy?: number;
  sz?: number;
  color?: THREE.Color;
}

export function Instanced({ geometry, material, items, castShadow = true, receiveShadow = true }: { geometry: THREE.BufferGeometry; material: THREE.Material; items: InstItem[]; castShadow?: boolean; receiveShadow?: boolean }) {
  const ref = useRef<THREE.InstancedMesh>(null);
  useLayoutEffect(() => {
    const m = ref.current;
    if (!m) return;
    const o = new THREE.Object3D();
    items.forEach((it, k) => {
      o.position.set(it.x, it.y, it.z);
      o.rotation.set(it.rx ?? 0, it.ry ?? 0, it.rz ?? 0);
      o.scale.set(it.sx ?? 1, it.sy ?? it.sx ?? 1, it.sz ?? it.sx ?? 1);
      o.updateMatrix();
      m.setMatrixAt(k, o.matrix);
      if (it.color) m.setColorAt(k, it.color);
    });
    m.instanceMatrix.needsUpdate = true;
    if (m.instanceColor) m.instanceColor.needsUpdate = true;
    m.computeBoundingSphere();
  }, [items]);
  if (!items.length) return null;
  return <instancedMesh ref={ref} args={[geometry, material, items.length]} castShadow={castShadow} receiveShadow={receiveShadow} raycast={noRaycast} frustumCulled={false} />;
}

// ───────────── geometriler ─────────────
const G = {
  panel: new THREE.BoxGeometry(0.96, 0.05, 1.7),
  panelLegs: (() => {
    const a = new THREE.BoxGeometry(0.06, 0.62, 0.06).translate(0, 0.31, 0.55);
    const b = new THREE.BoxGeometry(0.06, 1.18, 0.06).translate(0, 0.59, -0.55);
    const c = new THREE.BoxGeometry(0.05, 0.05, 1.3).translate(0, 0.85, 0);
    return mergeGeometries([a, b, c])!;
  })(),
  trunk: new THREE.CylinderGeometry(0.12, 0.18, 1.4, 6).translate(0, 0.7, 0),
  conifer: (() => {
    const a = new THREE.ConeGeometry(1.25, 2.2, 7).translate(0, 2.0, 0);
    const b = new THREE.ConeGeometry(0.95, 1.8, 7).translate(0, 3.0, 0);
    const c = new THREE.ConeGeometry(0.6, 1.3, 7).translate(0, 3.9, 0);
    return mergeGeometries([a, b, c])!;
  })(),
  leafy: (() => {
    const a = new THREE.IcosahedronGeometry(1.25, 0).translate(0, 2.4, 0);
    const b = new THREE.IcosahedronGeometry(0.85, 0).translate(0.55, 2.0, 0.3);
    const c = new THREE.IcosahedronGeometry(0.8, 0).translate(-0.5, 2.1, -0.35);
    return mergeGeometries([a, b, c])!;
  })(),
  bush: (() => {
    const a = new THREE.IcosahedronGeometry(0.6, 0).translate(0, 0.45, 0);
    const b = new THREE.IcosahedronGeometry(0.45, 0).translate(0.4, 0.35, 0.2);
    const c = new THREE.IcosahedronGeometry(0.42, 0).translate(-0.35, 0.32, -0.25);
    return mergeGeometries([a, b, c])!;
  })(),
  rock: new THREE.DodecahedronGeometry(0.7, 0),
  post: new THREE.CylinderGeometry(0.055, 0.065, 2.35, 6).translate(0, 1.17, 0),
};

const panelMat = new THREE.MeshStandardMaterial({ map: null, metalness: 0.45, roughness: 0.28, color: '#ffffff', emissive: new THREE.Color('#3355aa'), emissiveIntensity: 0 });
const legMat = mat('#9aa1a9', { metal: 0.5, rough: 0.5 });
const trunkMat = mat('#7a5233', { flat: true });
const foliageMat = new THREE.MeshStandardMaterial({ color: '#ffffff', flatShading: true, roughness: 0.85 });
const bushMat = new THREE.MeshStandardMaterial({ color: '#ffffff', flatShading: true, roughness: 0.9 });
const rockMat = new THREE.MeshStandardMaterial({ color: '#ffffff', flatShading: true, roughness: 0.95 });
const postMat = mat('#a7adb4', { metal: 0.6, rough: 0.4 });
const darkPostMat = mat('#2e3238', { metal: 0.6, rough: 0.5 }); // baraj tepesi çiti: beton üstünde koyu

export function MapObjects() {
  const map = useGame((s) => s.map)!;
  const level = useGame((s) => s.level)!;
  const phase = useGame((s) => s.phase);

  const panelItems = useMemo(() => {
    panelMat.map = panelTexture();
    panelMat.needsUpdate = true;
    return map.panels.map((p) => ({ x: p.x, y: map.heightAt(p.x, p.z) + 0.88, z: p.z, rx: 0.44 }));
  }, [map]);
  const legItems = useMemo(() => map.panels.map((p) => ({ x: p.x, y: map.heightAt(p.x, p.z), z: p.z })), [map]);

  const marginTrees = useMarginTrees(map);
  const treeSets = useMemo(() => {
    const all = [...map.trees, ...marginTrees];
    const rnd = mulberry32(77);
    const trunks: InstItem[] = [];
    const con: InstItem[] = [];
    const leaf: InstItem[] = [];
    for (const t of all) {
      const y = map.heightAt(t.x, t.z);
      const ry = rnd() * Math.PI * 2;
      trunks.push({ x: t.x, y, z: t.z, sx: t.s, ry });
      const col = new THREE.Color(t.kind === 0 ? '#2f7a3d' : '#4fa63a').offsetHSL((rnd() - 0.5) * 0.04, 0, (rnd() - 0.5) * 0.12);
      (t.kind === 0 ? con : leaf).push({ x: t.x, y, z: t.z, sx: t.s, ry, color: col });
    }
    return { trunks, con, leaf };
  }, [map, marginTrees]);

  const bushItems = useMemo(() => {
    const rnd = mulberry32(5);
    return map.bushes.map((b) => ({
      x: b.x,
      y: map.heightAt(b.x, b.z),
      z: b.z,
      sx: b.s * 1.1,
      sy: b.s * 0.95,
      sz: b.s * 1.1,
      ry: rnd() * 6,
      color: new THREE.Color('#5aa83a').offsetHSL((rnd() - 0.5) * 0.05, 0, (rnd() - 0.5) * 0.12),
    }));
  }, [map]);
  const rockItems = useMemo(() => {
    const rnd = mulberry32(9);
    return map.rocks.map((r) => ({
      x: r.x,
      y: map.heightAt(r.x, r.z) + 0.2 * r.s,
      z: r.z,
      sx: r.s,
      sy: r.s * 0.75,
      sz: r.s * 0.9,
      ry: rnd() * 6,
      rx: rnd() * 0.3,
      color: new THREE.Color('#9a968e').offsetHSL(0, 0, (rnd() - 0.5) * 0.12),
    }));
  }, [map]);

  // panel parıltısı (simülasyonda santral "çalışıyor")
  useFrame(({ clock }) => {
    panelMat.emissiveIntensity = phase === 'sim' && !level.night ? 0.06 + 0.05 * Math.sin(clock.elapsedTime * 1.3) : 0;
  });

  return (
    <group>
      <Instanced geometry={G.panel} material={panelMat} items={panelItems} />
      <Instanced geometry={G.panelLegs} material={legMat} items={legItems} castShadow={false} />
      <Instanced geometry={G.trunk} material={trunkMat} items={treeSets.trunks} />
      <Instanced geometry={G.conifer} material={foliageMat} items={treeSets.con} />
      <Instanced geometry={G.leafy} material={foliageMat} items={treeSets.leaf} />
      <Instanced geometry={G.bush} material={bushMat} items={bushItems} />
      <Instanced geometry={G.rock} material={rockMat} items={rockItems} />
      {map.buildings.map((b, k) => (
        <Building key={k} b={b} map={map} night={level.night} />
      ))}
      {map.turbines.map((t) => (
        <Turbine key={t.name} x={t.x} z={t.z} y={map.heightAt(t.x, t.z)} name={t.name} spinning={phase === 'sim'} />
      ))}
      <Fence map={map} />
      {map.gates.map((g) => (
        <GateView key={g.id} map={map} gateId={g.id} />
      ))}
      <Decor map={map} night={level.night} />
      {map.id === 'jes' && <GeoPipes map={map} />}
      {map.id === 'hes' && <HydroWater map={map} />}
    </group>
  );
}

// ───────────── JES: kuyu başlarından santrale buhar hatları ─────────────
function GeoPipes({ map }: { map: MapData }) {
  const hall = map.buildings.find((b) => b.kind === 'turbinehall')!;
  const sep = map.buildings.find((b) => b.kind === 'separator')!;
  const wells = map.buildings.filter((b) => b.kind === 'wellhead');
  const steel = mat('#b9bec4', { metal: 0.65, rough: 0.3 });
  const wrap = mat('#d8d4cb', { rough: 0.8 });
  const segs: { from: [number, number]; to: [number, number]; y: number }[] = [];
  for (const w of wells) {
    // L biçimli hat: önce x'te, sonra z'de separatöre
    const tx = sep.x, tz = sep.z + sep.d / 2 + 0.8;
    const midX = w.x < 0 ? w.x + (tx - w.x) * 0.35 : w.x + (tx - w.x) * 0.65;
    segs.push({ from: [w.x, w.z], to: [midX, w.z], y: 1.1 });
    segs.push({ from: [midX, w.z], to: [midX, tz], y: 1.1 });
    segs.push({ from: [midX, tz], to: [tx, tz], y: 1.1 });
  }
  // separatör → türbin binası
  segs.push({ from: [sep.x - sep.w / 2, sep.z], to: [hall.x + hall.w / 2, sep.z], y: 2.6 });
  return (
    <group>
      {segs.map((sg, k) => {
        const dx = sg.to[0] - sg.from[0], dz = sg.to[1] - sg.from[1];
        const len = Math.hypot(dx, dz);
        if (len < 0.5) return null;
        const ang = Math.atan2(dz, dx);
        const cx = (sg.from[0] + sg.to[0]) / 2, cz = (sg.from[1] + sg.to[1]) / 2;
        const y = map.heightAt(cx, cz) + sg.y;
        const legs = Math.max(1, Math.floor(len / 4));
        return (
          <group key={k}>
            <mesh position={[cx, y, cz]} rotation={[0, -ang, Math.PI / 2]} castShadow material={wrap}>
              <cylinderGeometry args={[0.32, 0.32, len, 10]} />
            </mesh>
            {Array.from({ length: legs }).map((_, j) => {
              const t = (j + 0.5) / legs;
              const x = sg.from[0] + dx * t, z = sg.from[1] + dz * t;
              const gy = map.heightAt(x, z);
              return (
                <mesh key={j} position={[x, gy + (y - gy) / 2, z]} material={steel}>
                  <boxGeometry args={[0.18, Math.max(0.3, y - gy - 0.3), 0.18]} />
                </mesh>
              );
            })}
          </group>
        );
      })}
      {/* doğal buhar çıkışları (saha dışı) */}
      {[
        [-33, -31],
        [-36, -26],
        [34, -30],
      ].map(([x, z], k) => (
        <Steam key={k} position={[x, map.heightAt(x, z) + 0.3, z]} radius={1.2} count={4} color="#f2f5f7" opacity={0.4} speed={0.9} scale={0.5} />
      ))}
    </group>
  );
}

// ───────────── HES: rezervuar, kuyruk suyu kanalı, köprü ─────────────
function HydroWater({ map }: { map: MapData }) {
  const half = map.N / 2 + 40;
  const ch = HES.channel;
  const waterMat = useMemo(() => new THREE.MeshStandardMaterial({ color: '#2f7fb8', roughness: 0.25, metalness: 0.1 }), []);
  const chanMat = useMemo(() => new THREE.MeshStandardMaterial({ color: '#3a8fc4', roughness: 0.3, metalness: 0.1 }), []);
  const ref = useRef<THREE.Mesh>(null);
  useFrame(({ clock }) => {
    const t = clock.elapsedTime;
    waterMat.color.setHSL(0.57, 0.55, 0.42 + Math.sin(t * 0.8) * 0.02);
    if (ref.current) ref.current.position.y = HES.waterY + Math.sin(t * 0.9) * 0.04;
  });
  const resZ0 = -half, resZ1 = HES.damZ - HES.damD / 2 - HES.shoreGap - 0.3; // su, kıyı şeridinin ötesinde
  const chLen = ch.z1 - ch.z0;
  return (
    <group>
      {/* rezervuar */}
      <mesh ref={ref} position={[0, HES.waterY, (resZ0 + resZ1) / 2]} rotation-x={-Math.PI / 2} material={waterMat} raycast={noRaycast}>
        <planeGeometry args={[half * 2, resZ1 - resZ0]} />
      </mesh>
      {/* kuyruk suyu kanalı: beton yatak + su */}
      <mesh position={[(ch.x0 + ch.x1) / 2, 0.02, ch.z0 + chLen / 2]} rotation-x={-Math.PI / 2} material={mat('#9c9a93')} raycast={noRaycast}>
        <planeGeometry args={[ch.x1 - ch.x0 + 1.2, chLen]} />
      </mesh>
      <mesh position={[(ch.x0 + ch.x1) / 2, 0.42, ch.z0 + chLen / 2]} rotation-x={-Math.PI / 2} material={chanMat} raycast={noRaycast}>
        <planeGeometry args={[ch.x1 - ch.x0, chLen]} />
      </mesh>
      {[ch.x0 - 0.5, ch.x1 + 0.5].map((x) => (
        <mesh key={x} position={[x, 0.55, ch.z0 + chLen / 2]} material={mat('#b3afa6')}>
          <boxGeometry args={[0.4, 1.1, chLen]} />
        </mesh>
      ))}
      {/* köprü */}
      <mesh position={[(ch.x0 + ch.x1) / 2, 1.05, (HES.bridgeZ.z0 + HES.bridgeZ.z1) / 2]} castShadow material={mat('#8d8f94')}>
        <boxGeometry args={[ch.x1 - ch.x0 + 2.4, 0.4, HES.bridgeZ.z1 - HES.bridgeZ.z0]} />
      </mesh>
      {[HES.bridgeZ.z0, HES.bridgeZ.z1].map((z) => (
        <mesh key={z} position={[(ch.x0 + ch.x1) / 2, 1.7, z]} material={mat('#e5e5e2')}>
          <boxGeometry args={[ch.x1 - ch.x0 + 2.4, 0.9, 0.1]} />
        </mesh>
      ))}
      {/* santral çıkışı köpük */}
      <Steam position={[(ch.x0 + ch.x1) / 2, 0.6, ch.z0 + 1]} radius={1.0} count={4} color="#eaf4ff" opacity={0.45} speed={1.3} scale={0.35} />
    </group>
  );
}

// ───────────── binalar ─────────────
function Building({ b, map, night }: { b: BuildingDef; map: MapData; night: boolean }) {
  const y = Math.min(
    map.heightAt(b.x - b.w / 2, b.z - b.d / 2),
    map.heightAt(b.x + b.w / 2, b.z + b.d / 2),
    map.heightAt(b.x + b.w / 2, b.z - b.d / 2),
    map.heightAt(b.x - b.w / 2, b.z + b.d / 2)
  );
  const winMat = mat('#2e4a66', { emissive: '#ffcf7a', ei: night ? 1.1 : 0.05, rough: 0.2, metal: 0.3 });
  const signTex = useMemo(() => (b.kind === 'control' ? textTexture('KONTROL MERKEZİ', COLORS.burgundy, '#ffffff', 512, 96, 44) : null), [b.kind]);
  if (b.kind === 'turbinehall' || b.kind === 'boiler' || b.kind === 'stack' || b.kind === 'cooling' || b.kind === 'tank' || b.kind === 'coal' || b.kind === 'wellhead' || b.kind === 'fancooler' || b.kind === 'separator' || b.kind === 'dam' || b.kind === 'penstock' || b.kind === 'battery' || b.kind === 'pcs') {
    return <IndustrialBuilding b={b} y={y} night={night} />;
  }

  if (b.kind === 'control') {
    const wins = [];
    for (let k = 0; k < Math.floor(b.w / 1.4); k++) {
      const wx = -b.w / 2 + 0.9 + k * 1.4;
      wins.push(<mesh key={`a${k}`} position={[wx, 2.2, b.d / 2 + 0.02]} material={winMat}><boxGeometry args={[0.9, 1.0, 0.05]} /></mesh>);
      wins.push(<mesh key={`b${k}`} position={[wx, 2.2, -b.d / 2 - 0.02]} material={winMat}><boxGeometry args={[0.9, 1.0, 0.05]} /></mesh>);
    }
    return (
      <group position={[b.x, y, b.z]}>
        <mesh position={[0, 0.1, 0]} receiveShadow material={mat('#b7b3aa')}><boxGeometry args={[b.w + 0.8, 0.2, b.d + 0.8]} /></mesh>
        <mesh position={[0, b.h / 2 + 0.2, 0]} castShadow receiveShadow material={mat('#efebe3')}><boxGeometry args={[b.w, b.h, b.d]} /></mesh>
        <mesh position={[0, b.h - 0.35, 0]} material={mat(COLORS.burgundy)}><boxGeometry args={[b.w + 0.04, 0.4, b.d + 0.04]} /></mesh>
        <mesh position={[0, b.h + 0.32, 0]} castShadow material={mat('#5d6169')}><boxGeometry args={[b.w + 0.2, 0.25, b.d + 0.2]} /></mesh>
        {wins}
        <mesh position={[b.w / 2 + 0.02, 1.25, 0]} material={mat(COLORS.anthracite)}><boxGeometry args={[0.05, 2.0, 1.1]} /></mesh>
        {signTex && (
          <mesh position={[0, b.h - 0.35, -b.d / 2 - 0.04]} rotation-y={Math.PI}>
            <planeGeometry args={[4.2, 0.4]} />
            <meshBasicMaterial map={signTex} toneMapped={false} />
          </mesh>
        )}
        <LogoPlate width={Math.min(5.4, b.w - 1)} position={[0, 3.2, b.d / 2 + 0.04]} />
        <mesh position={[-1.4, b.h + 0.75, 0.6]} castShadow material={mat('#cfd3d8', { metal: 0.3 })}><boxGeometry args={[1.0, 0.6, 0.8]} /></mesh>
        <mesh position={[0.6, b.h + 0.7, -0.5]} castShadow material={mat('#cfd3d8', { metal: 0.3 })}><boxGeometry args={[0.8, 0.5, 0.7]} /></mesh>
        <mesh position={[b.w / 2 - 0.6, b.h + 2.2, b.d / 2 - 0.6]} material={postMat}><cylinderGeometry args={[0.05, 0.07, 4, 6]} /></mesh>
        <mesh position={[b.w / 2 - 0.6, b.h + 1.3, b.d / 2 - 0.6]} rotation={[0.5, 0.6, 0]} material={mat('#e8e8e8')}><sphereGeometry args={[0.45, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2.4]} /></mesh>
        <mesh position={[b.w / 2 - 0.6, b.h + 4.2, b.d / 2 - 0.6]} material={mat('#ff3030', { emissive: '#ff2020', ei: 1.5 })}><sphereGeometry args={[0.09, 8, 6]} /></mesh>
      </group>
    );
  }
  if (b.kind === 'trafo') {
    const fins = [];
    for (let k = 0; k < 5; k++) {
      const fz = -b.d / 2 + 0.4 + (k * (b.d - 0.8)) / 4;
      fins.push(<mesh key={`l${k}`} position={[-b.w / 2 - 0.12, b.h * 0.45, fz]} castShadow material={mat('#6f7780', { metal: 0.4 })}><boxGeometry args={[0.24, b.h * 0.7, 0.08]} /></mesh>);
      fins.push(<mesh key={`r${k}`} position={[b.w / 2 + 0.12, b.h * 0.45, fz]} castShadow material={mat('#6f7780', { metal: 0.4 })}><boxGeometry args={[0.24, b.h * 0.7, 0.08]} /></mesh>);
    }
    const ins = [];
    for (let k = 0; k < 3; k++) {
      const ix = -b.w / 2 + 0.6 + (k * (b.w - 1.2)) / 2;
      ins.push(
        <group key={k} position={[ix, b.h + 0.1, 0]}>
          <mesh position={[0, 0.45, 0]} material={mat('#8e5c3d', { rough: 0.3 })}><cylinderGeometry args={[0.1, 0.13, 0.9, 8]} /></mesh>
          {[0.2, 0.4, 0.6, 0.8].map((h) => (
            <mesh key={h} position={[0, h, 0]} material={mat('#a86b45', { rough: 0.25 })}><cylinderGeometry args={[0.2, 0.2, 0.05, 10]} /></mesh>
          ))}
        </group>
      );
    }
    return (
      <group position={[b.x, y, b.z]}>
        <mesh position={[0, 0.12, 0]} receiveShadow material={mat('#a8a49c')}><boxGeometry args={[b.w + 1.0, 0.24, b.d + 1.0]} /></mesh>
        <mesh position={[0, b.h / 2 + 0.2, 0]} castShadow receiveShadow material={mat('#8d959e', { metal: 0.35, rough: 0.5 })}><boxGeometry args={[b.w, b.h, b.d]} /></mesh>
        {fins}
        {ins}
        <mesh position={[0, b.h * 0.6, b.d / 2 + 0.02]} material={mat('#ffd23f', { emissive: '#ffd23f', ei: night ? 0.4 : 0 })}><boxGeometry args={[0.6, 0.5, 0.03]} /></mesh>
      </group>
    );
  }
  if (b.kind === 'inverter') {
    return (
      <group position={[b.x, y, b.z]}>
        <mesh position={[0, 0.1, 0]} receiveShadow material={mat('#b2aea6')}><boxGeometry args={[b.w + 0.5, 0.2, b.d + 0.5]} /></mesh>
        <mesh position={[0, b.h / 2 + 0.2, 0]} castShadow receiveShadow material={mat('#f2f2ef')}><boxGeometry args={[b.w, b.h, b.d]} /></mesh>
        <mesh position={[0, b.h + 0.25, 0]} castShadow material={mat('#5d6169')}><boxGeometry args={[b.w + 0.15, 0.1, b.d + 0.15]} /></mesh>
        {[-0.8, 0, 0.8].map((vx) => (
          <mesh key={vx} position={[vx, b.h * 0.7, b.d / 2 + 0.02]} material={mat('#9aa0a7')}><boxGeometry args={[0.6, 0.35, 0.04]} /></mesh>
        ))}
        <mesh position={[b.w / 2 + 0.02, 1.0, 0]} material={mat(COLORS.burgundy)}><boxGeometry args={[0.04, 1.6, 0.8]} /></mesh>
        <mesh position={[-b.w / 2 + 0.3, b.h + 0.5, 0]} material={mat('#3aff7a', { emissive: '#3aff7a', ei: 1.2 })}><sphereGeometry args={[0.07, 8, 6]} /></mesh>
        <LogoPlate width={b.w * 0.8} position={[0, b.h * 0.62, -b.d / 2 - 0.03]} rotationY={Math.PI} />
      </group>
    );
  }
  // depo / konteyner
  const tex = corrugatedTexture();
  const color = b.kind === 'depot' ? '#3f6577' : '#9b3a2e';
  return (
    <group position={[b.x, y, b.z]}>
      <mesh position={[0, 0.1, 0]} receiveShadow material={mat('#b2aea6')}><boxGeometry args={[b.w + 0.4, 0.2, b.d + 0.4]} /></mesh>
      <mesh position={[0, b.h / 2 + 0.2, 0]} castShadow receiveShadow>
        <boxGeometry args={[b.w, b.h, b.d]} />
        <meshStandardMaterial color={color} map={tex} roughness={0.6} metalness={0.3} />
      </mesh>
      <mesh position={[0, b.h / 2 + 0.1, b.d / 2 + 0.03]} material={mat('#2a2c31')}><boxGeometry args={[1.4, b.h * 0.8, 0.04]} /></mesh>
      <mesh position={[0, b.h + 0.22, 0]} material={mat('#5d6169')}><boxGeometry args={[b.w + 0.1, 0.06, b.d + 0.1]} /></mesh>
      <LogoPlate width={b.w * 0.8} position={[0, b.h * 0.68, -b.d / 2 - 0.04]} rotationY={Math.PI} />
    </group>
  );
}

// ───────────── rüzgâr türbini ─────────────
function Turbine({ x, y, z, name, spinning }: { x: number; y: number; z: number; name: string; spinning: boolean }) {
  const rotor = useRef<THREE.Group>(null);
  const speed = useRef(0);
  const dir = useMemo(() => Math.PI * 0.25 + (name.charCodeAt(1) % 3) * 0.12, [name]);
  useFrame((_, dt) => {
    speed.current += ((spinning ? 1.2 : 0.15) - speed.current) * Math.min(1, dt * 0.6);
    if (rotor.current) rotor.current.rotation.x += speed.current * dt;
  });
  const H = 17;
  const tag = useMemo(() => textTexture(name, COLORS.burgundy, '#fff', 128, 64, 40), [name]);
  return (
    <group position={[x, y, z]}>
      <mesh position={[0, 0.3, 0]} receiveShadow castShadow material={mat('#b9b5ad')}><cylinderGeometry args={[1.6, 1.8, 0.6, 16]} /></mesh>
      <mesh position={[0, H / 2 + 0.5, 0]} castShadow material={mat('#f4f4f2', { rough: 0.5 })}><cylinderGeometry args={[0.36, 0.8, H, 16]} /></mesh>
      <mesh position={[0, 2.2, 0]} material={mat(COLORS.burgundy)}><cylinderGeometry args={[0.92, 0.94, 0.5, 16]} /></mesh>
      <mesh position={[0.93, 1.1, 0]} rotation-y={Math.PI / 2} material={mat('#5d6169')}><boxGeometry args={[0.8, 1.6, 0.06]} /></mesh>
      <mesh position={[0, 3.6, 0.95]} >
        <planeGeometry args={[0.9, 0.45]} />
        <meshBasicMaterial map={tag} toneMapped={false} />
      </mesh>
      <group position={[0, H + 0.6, 0]} rotation-y={dir}>
        <mesh position={[-0.6, 0, 0]} castShadow material={mat('#f0f0ee')}><boxGeometry args={[2.6, 1.05, 1.05]} /></mesh>
        <LogoPlate width={2.2} position={[-0.6, 0.05, 0.54]} />
        <LogoPlate width={2.2} position={[-0.6, 0.05, -0.54]} rotationY={Math.PI} />
        <group ref={rotor} position={[1.25, 0, 0]}>
          <mesh rotation-z={Math.PI / 2} material={mat('#f8f8f6')}><coneGeometry args={[0.55, 1.0, 12]} /></mesh>
          {[0, 1, 2].map((k) => (
            <group key={k} rotation-x={(k * Math.PI * 2) / 3}>
              <mesh position={[0, 3.9, 0]} castShadow material={mat('#fafafa', { rough: 0.4 })}>
                <boxGeometry args={[0.13, 7.4, 0.5]} />
              </mesh>
              <mesh position={[0, 7.2, 0]} material={mat(COLORS.burgundyHi)}><boxGeometry args={[0.14, 0.8, 0.45]} /></mesh>
            </group>
          ))}
        </group>
      </group>
    </group>
  );
}

// ───────────── çit ─────────────
function Fence({ map }: { map: MapData }) {
  const L = fenceWorld(map);
  const zN = fenceNorth(map);
  const { geom, posts, wire, geomD, postsD } = useMemo(() => {
    const gaps = map.gates.map((g) => ({ g, a: (g.axis === 'x' ? g.x : g.z) - 2.0, b: (g.axis === 'x' ? g.x : g.z) + 2.0 }));
    const sides: { from: [number, number]; to: [number, number]; side: 'N' | 'S' | 'E' | 'W' }[] = [
      { from: [-L, zN], to: [L, zN], side: 'N' },
      { from: [L, zN], to: [L, L], side: 'E' },
      { from: [L, L], to: [-L, L], side: 'S' },
      { from: [-L, L], to: [-L, zN], side: 'W' },
    ];
    const pos: number[] = [];
    const uv: number[] = [];
    const idx: number[] = [];
    const posts: InstItem[] = [];
    const wire: number[] = [];
    // baraj tepesi (HES kuzey): ayrı, koyu renkli geometri (açık betonun üstünde görünsün)
    const posD: number[] = [];
    const uvD: number[] = [];
    const idxD: number[] = [];
    const postsD: InstItem[] = [];
    let u = 0;
    for (const s of sides) {
      const dark = map.id === 'hes' && s.side === 'N';
      const P = dark ? posD : pos, U = dark ? uvD : uv, I = dark ? idxD : idx, PO = dark ? postsD : posts;
      const len = Math.hypot(s.to[0] - s.from[0], s.to[1] - s.from[1]);
      const steps = Math.ceil(len / 1.0);
      let prev: [number, number, number] | null = null;
      for (let k = 0; k <= steps; k++) {
        const t = k / steps;
        const x = s.from[0] + (s.to[0] - s.from[0]) * t;
        const z = s.from[1] + (s.to[1] - s.from[1]) * t;
        const along = s.side === 'N' || s.side === 'S' ? x : z;
        const onSide = (g: (typeof gaps)[number]) =>
          ((s.side === 'N' && g.g.z < 0 && g.g.axis === 'x') || (s.side === 'S' && g.g.z > 0 && g.g.axis === 'x') || (s.side === 'E' && g.g.x > 0 && g.g.axis === 'z') || (s.side === 'W' && g.g.x < 0 && g.g.axis === 'z'));
        const inGap = gaps.some((g) => onSide(g) && along > g.a && along < g.b);
        const y = map.heightAt(x, z);
        if (inGap) {
          prev = null;
          continue;
        }
        if (k % (dark ? 2 : 3) === 0) PO.push({ x, y, z }); // baraj tepesi: sık direk, uzaktan okunsun
        if (prev) {
          const base = P.length / 3;
          P.push(prev[0], prev[1] + 0.05, prev[2], prev[0], prev[1] + 2.1, prev[2], x, y + 0.05, z, x, y + 2.1, z);
          U.push(u, 0, u, 2.05 / 1.1, u + 1 / 1.1, 0, u + 1 / 1.1, 2.05 / 1.1);
          I.push(base, base + 2, base + 1, base + 1, base + 2, base + 3);
          wire.push(prev[0], prev[1] + 2.25, prev[2], x, y + 2.25, z, prev[0], prev[1] + 2.38, prev[2], x, y + 2.38, z);
          u += 1 / 1.1;
        }
        prev = [x, y, z];
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setIndex(idx);
    g.computeVertexNormals();
    const w = new THREE.BufferGeometry();
    w.setAttribute('position', new THREE.Float32BufferAttribute(wire, 3));
    const gD = new THREE.BufferGeometry();
    gD.setAttribute('position', new THREE.Float32BufferAttribute(posD, 3));
    gD.setAttribute('uv', new THREE.Float32BufferAttribute(uvD, 2));
    gD.setIndex(idxD);
    gD.computeVertexNormals();
    return { geom: g, posts, wire: w, geomD: gD, postsD };
  }, [map, L, zN]);
  const tex = fenceTexture();
  return (
    <group>
      <mesh geometry={geom} raycast={noRaycast} castShadow>
        <meshStandardMaterial map={tex} transparent alphaTest={0.35} side={THREE.DoubleSide} color="#c9ced4" metalness={0.5} roughness={0.5} />
      </mesh>
      <lineSegments geometry={wire} raycast={noRaycast}>
        <lineBasicMaterial color="#8d939a" />
      </lineSegments>
      <Instanced geometry={G.post} material={postMat} items={posts} />
      {postsD.length > 0 && (
        <>
          <mesh geometry={geomD} raycast={noRaycast} castShadow>
            <meshStandardMaterial map={tex} transparent alphaTest={0.3} side={THREE.DoubleSide} color="#3a3f47" metalness={0.4} roughness={0.6} />
          </mesh>
          <Instanced geometry={G.post} material={darkPostMat} items={postsD} />
        </>
      )}
    </group>
  );
}

function GateView({ map, gateId }: { map: MapData; gateId: string }) {
  const g = map.gates.find((x) => x.id === gateId)!;
  const left = useRef<THREE.Group>(null);
  const right = useRef<THREE.Group>(null);
  const open = useRef(0);
  const y = map.heightAt(g.x, g.z);
  useFrame((_, dt) => {
    const e = getEngine();
    const want = e ? e.gateOpenAmount(g.id) : 0;
    open.current += (want - open.current) * Math.min(1, dt * 3);
    const o = open.current * 1.9;
    if (left.current) left.current.position.x = -1.0 - o;
    if (right.current) right.current.position.x = 1.0 + o;
  });
  const tex = fenceTexture();
  const rotY = g.axis === 'x' ? 0 : Math.PI / 2;
  const leaf = (
    <>
      <mesh position={[0, 1.05, 0]}>
        <planeGeometry args={[1.95, 1.9]} />
        <meshStandardMaterial map={tex} transparent alphaTest={0.35} side={THREE.DoubleSide} color="#d6d9dd" />
      </mesh>
      <mesh position={[0, 2.0, 0]} material={mat(COLORS.burgundy)}><boxGeometry args={[2.0, 0.09, 0.09]} /></mesh>
      <mesh position={[0, 0.12, 0]} material={mat(COLORS.burgundy)}><boxGeometry args={[2.0, 0.09, 0.09]} /></mesh>
      <mesh position={[-0.97, 1.05, 0]} material={mat(COLORS.burgundy)}><boxGeometry args={[0.08, 1.95, 0.08]} /></mesh>
      <mesh position={[0.97, 1.05, 0]} material={mat(COLORS.burgundy)}><boxGeometry args={[0.08, 1.95, 0.08]} /></mesh>
    </>
  );
  return (
    <group position={[g.x, y, g.z]} rotation-y={rotY}>
      <group ref={left}>{leaf}</group>
      <group ref={right}>{leaf}</group>
      {[-2.1, 2.1].map((px) => (
        <mesh key={px} position={[px, 1.3, 0]} castShadow material={mat(COLORS.anthracite, { metal: 0.4 })}>
          <boxGeometry args={[0.25, 2.6, 0.25]} />
        </mesh>
      ))}
      <mesh position={[2.1, 2.75, 0]} material={mat('#ffb020', { emissive: '#ffb020', ei: 1 })}><sphereGeometry args={[0.12, 8, 6]} /></mesh>
    </group>
  );
}

// ───────────── dekor ─────────────
function Decor({ map, night }: { map: MapData; night: boolean }) {
  const board = useMemo(() => textTexture('DESECURE · 7/24 ALARM İZLEME', '#111214', '#ffffff', 1024, 128, 54), []);
  const L = fenceWorld(map);
  const sx = 6.5, sz = L + 4.5;
  const cars =
    map.id === 'ges' || map.id === 'bess'
      ? [
          { x: -12.3, z: 17.5, c: '#d9dde2', r: 0 },
          { x: -12.3, z: 20.3, c: '#7a1a26', r: 0 },
        ]
      : map.id === 'tes'
        ? [
            { x: -11, z: 25.3, c: '#d9dde2', r: 0 },
            { x: -1.6 + 4.5, z: 25.3, c: '#7a1a26', r: 0 },
          ]
        : [{ x: -1.5, z: 30.5, c: '#d9dde2', r: Math.PI / 2 }];
  return (
    <group>
      {/* tanıtım panosu */}
      <group position={[sx, map.heightAt(sx, sz), sz]} rotation-y={0}>
        <mesh position={[-1.6, 1.3, 0]} material={postMat}><boxGeometry args={[0.15, 2.6, 0.15]} /></mesh>
        <mesh position={[1.6, 1.3, 0]} material={postMat}><boxGeometry args={[0.15, 2.6, 0.15]} /></mesh>
        <mesh position={[0, 2.4, 0]} castShadow material={mat('#111214')}><boxGeometry args={[4.4, 0.75, 0.12]} /></mesh>
        <mesh position={[0, 2.4, 0.065]}>
          <planeGeometry args={[4.3, 0.6]} />
          <meshBasicMaterial map={board} toneMapped={false} />
        </mesh>
        <mesh position={[0, 2.82, 0]} material={mat(COLORS.burgundy)}><boxGeometry args={[4.4, 0.08, 0.14]} /></mesh>
        <LogoPlate width={4.2} position={[0, 3.35, 0.02]} />
      </group>

      {cars.map((c, k) => (
        <Car key={k} x={c.x} z={c.z} y={map.heightAt(c.x, c.z)} color={c.c} rot={c.r} night={night} />
      ))}
    </group>
  );
}

export function Car({ x, y, z, color, rot, night }: { x: number; y: number; z: number; color: string; rot: number; night: boolean }) {
  return (
    <group position={[x, y, z]} rotation-y={rot}>
      <mesh position={[0, 0.5, 0]} castShadow material={mat(color, { metal: 0.4, rough: 0.35 })}><boxGeometry args={[2.0, 0.55, 0.95]} /></mesh>
      <mesh position={[-0.15, 0.95, 0]} castShadow material={mat('#2c3b4c', { metal: 0.3, rough: 0.2 })}><boxGeometry args={[1.0, 0.4, 0.85]} /></mesh>
      {[-0.65, 0.65].map((wx) =>
        [-0.45, 0.45].map((wz) => (
          <mesh key={`${wx}${wz}`} position={[wx, 0.25, wz]} rotation-x={Math.PI / 2} material={mat('#1a1a1a')}><cylinderGeometry args={[0.24, 0.24, 0.16, 10]} /></mesh>
        ))
      )}
      <mesh position={[1.01, 0.55, 0.3]} material={mat('#fff', { emissive: '#fff6d0', ei: night ? 0.6 : 0 })}><boxGeometry args={[0.03, 0.12, 0.2]} /></mesh>
      <mesh position={[1.01, 0.55, -0.3]} material={mat('#fff', { emissive: '#fff6d0', ei: night ? 0.6 : 0 })}><boxGeometry args={[0.03, 0.12, 0.2]} /></mesh>
    </group>
  );
}

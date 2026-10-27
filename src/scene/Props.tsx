import { useMemo } from 'react';
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { useGame } from '../game/store';
import type { MapData } from '../game/types';
import { cellAt, mulberry32 } from '../game/world/grid';
import { COLORS, mat } from './materials';
import { Instanced, type InstItem } from './MapObjects';
import { useGfx } from './gfx';

// Saha dekoru (Clash of Clans tarzı doluluk): çim tutamları, çiçek öbekleri, çakıl taşları,
// bina çevresinde variller/kasalar/paletler, ana yol boyunca aydınlatma direkleri, çit dibinde kırık dal/çöp.
// Hiçbiri navigasyonu etkilemez.

const PG = {
  tuft: (() => {
    const parts: THREE.BufferGeometry[] = [];
    for (let k = 0; k < 4; k++) {
      const a = (k / 4) * Math.PI * 2;
      parts.push(new THREE.ConeGeometry(0.07, 0.42 + (k % 2) * 0.12, 4).rotateX((k % 2 ? 1 : -1) * 0.25).rotateY(a).translate(Math.cos(a) * 0.08, 0.2, Math.sin(a) * 0.08));
    }
    return mergeGeometries(parts)!;
  })(),
  flower: (() => {
    const parts: THREE.BufferGeometry[] = [];
    for (let k = 0; k < 5; k++) {
      const a = (k / 5) * Math.PI * 2 + 0.4;
      parts.push(new THREE.SphereGeometry(0.1, 6, 5).translate(Math.cos(a) * 0.18, 0.22 + (k % 2) * 0.06, Math.sin(a) * 0.18));
    }
    parts.push(new THREE.SphereGeometry(0.26, 7, 5).scale(1, 0.55, 1).translate(0, 0.1, 0));
    return mergeGeometries(parts)!;
  })(),
  pebble: new THREE.DodecahedronGeometry(0.16, 0).scale(1, 0.55, 0.8),
  barrel: (() => {
    const b = new THREE.CylinderGeometry(0.36, 0.33, 0.9, 10).translate(0, 0.45, 0);
    const r1 = new THREE.TorusGeometry(0.37, 0.025, 6, 12).rotateX(Math.PI / 2).translate(0, 0.25, 0);
    const r2 = new THREE.TorusGeometry(0.37, 0.025, 6, 12).rotateX(Math.PI / 2).translate(0, 0.68, 0);
    return mergeGeometries([b, r1, r2])!;
  })(),
  crate: new THREE.BoxGeometry(0.8, 0.8, 0.8).translate(0, 0.4, 0),
  pallet: (() => {
    const parts: THREE.BufferGeometry[] = [];
    for (let k = 0; k < 5; k++) parts.push(new THREE.BoxGeometry(1.2, 0.05, 0.16).translate(0, 0.14, -0.5 + k * 0.25));
    for (const x of [-0.5, 0, 0.5]) parts.push(new THREE.BoxGeometry(0.12, 0.1, 1.2).translate(x, 0.06, 0));
    return mergeGeometries(parts)!;
  })(),
  lamp: (() => {
    const post = new THREE.CylinderGeometry(0.05, 0.07, 4.2, 6).translate(0, 2.1, 0);
    const arm = new THREE.BoxGeometry(0.7, 0.06, 0.06).translate(0.3, 4.15, 0);
    const base = new THREE.CylinderGeometry(0.16, 0.2, 0.12, 8).translate(0, 0.06, 0);
    return mergeGeometries([post, arm, base])!;
  })(),
  lampHead: new THREE.BoxGeometry(0.36, 0.12, 0.2).translate(0.62, 4.12, 0),
  cone: (() => {
    const c = new THREE.ConeGeometry(0.2, 0.55, 8).translate(0, 0.3, 0);
    const b = new THREE.BoxGeometry(0.42, 0.04, 0.42).translate(0, 0.02, 0);
    return mergeGeometries([c, b])!;
  })(),
  spool: (() => {
    const a = new THREE.CylinderGeometry(0.5, 0.5, 0.08, 12).rotateZ(Math.PI / 2).translate(-0.3, 0.5, 0);
    const b = new THREE.CylinderGeometry(0.5, 0.5, 0.08, 12).rotateZ(Math.PI / 2).translate(0.3, 0.5, 0);
    const c = new THREE.CylinderGeometry(0.3, 0.3, 0.6, 12).rotateZ(Math.PI / 2).translate(0, 0.5, 0);
    return mergeGeometries([a, b, c])!;
  })(),
  log: new THREE.CylinderGeometry(0.1, 0.12, 1.3, 6).rotateZ(Math.PI / 2),
  acunit: (() => {
    const b = new THREE.BoxGeometry(0.9, 0.5, 0.9).translate(0, 0.25, 0);
    const f = new THREE.CylinderGeometry(0.32, 0.32, 0.06, 12).translate(0, 0.53, 0);
    return mergeGeometries([b, f])!;
  })(),
  vent: (() => {
    const p = new THREE.CylinderGeometry(0.12, 0.14, 0.8, 8).translate(0, 0.4, 0);
    const c = new THREE.ConeGeometry(0.22, 0.2, 8).translate(0, 0.85, 0);
    return mergeGeometries([p, c])!;
  })(),
  signpost: (() => {
    const p = new THREE.CylinderGeometry(0.05, 0.05, 1.6, 6).translate(0, 0.8, 0);
    const s = new THREE.BoxGeometry(0.7, 0.45, 0.04).translate(0, 1.35, 0);
    return mergeGeometries([p, s])!;
  })(),
};

const M = {
  tuft: new THREE.MeshStandardMaterial({ color: '#ffffff', flatShading: true, roughness: 0.95 }),
  flower: new THREE.MeshStandardMaterial({ color: '#ffffff', flatShading: true, roughness: 0.9 }),
  pebble: new THREE.MeshStandardMaterial({ color: '#ffffff', flatShading: true, roughness: 0.95 }),
  barrel: new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.55, metalness: 0.35, flatShading: true }),
  crate: new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.85, flatShading: true }),
  pallet: mat('#b98b53', { rough: 0.9, flat: true }),
  lamp: mat('#6d727a', { metal: 0.5, rough: 0.5 }),
  cone: mat('#ff7a1f', { rough: 0.7 }),
  spool: mat('#c8742f', { rough: 0.8, flat: true }),
  log: mat('#7a5233', { rough: 0.95, flat: true }),
  sign: mat(COLORS.burgundy, { rough: 0.6 }),
  ac: mat('#cfd3d8', { metal: 0.35, rough: 0.5 }),
  vent: mat('#8a8f96', { metal: 0.5, rough: 0.5 }),
};

export function Props() {
  const map = useGame((s) => s.map)!;
  const level = useGame((s) => s.level)!;
  const night = !!level.night;
  const items = useMemo(() => buildProps(map), [map]);
  const low = useGfx((s) => s.low);
  const lampHead = useMemo(() => new THREE.MeshStandardMaterial({ color: '#fff3c4', emissive: '#ffd27a', emissiveIntensity: night ? 2.4 : 0.15 }), [night]);
  return (
    <group>
      {/* düşük kalitede ince bitki örtüsü çizilmez */}
      {!low && <Instanced geometry={PG.tuft} material={M.tuft} items={items.tufts} castShadow={false} receiveShadow={false} />}
      {!low && <Instanced geometry={PG.flower} material={M.flower} items={items.flowers} castShadow={false} receiveShadow={false} />}
      {!low && <Instanced geometry={PG.pebble} material={M.pebble} items={items.pebbles} castShadow={false} receiveShadow={false} />}
      <Instanced geometry={PG.barrel} material={M.barrel} items={items.barrels} castShadow={!low} />
      <Instanced geometry={PG.crate} material={M.crate} items={items.crates} castShadow={!low} />
      <Instanced geometry={PG.pallet} material={M.pallet} items={items.pallets} castShadow={false} />
      <Instanced geometry={PG.spool} material={M.spool} items={items.spools} castShadow={!low} />
      <Instanced geometry={PG.log} material={M.log} items={items.logs} castShadow={false} />
      <Instanced geometry={PG.cone} material={M.cone} items={items.cones} castShadow={false} />
      <Instanced geometry={PG.lamp} material={M.lamp} items={items.lamps} castShadow={!low} />
      <Instanced geometry={PG.lampHead} material={lampHead} items={items.lamps} castShadow={false} />
      <Instanced geometry={PG.signpost} material={M.sign} items={items.signs} castShadow={false} />
      <Instanced geometry={PG.acunit} material={M.ac} items={items.acs} castShadow={false} />
      <Instanced geometry={PG.vent} material={M.vent} items={items.vents} castShadow={false} />
    </group>
  );
}

function buildProps(map: MapData) {
  const rnd = mulberry32(map.N * 7 + 11);
  const out = { tufts: [] as InstItem[], flowers: [] as InstItem[], pebbles: [] as InstItem[], barrels: [] as InstItem[], crates: [] as InstItem[], pallets: [] as InstItem[], spools: [] as InstItem[], logs: [] as InstItem[], cones: [] as InstItem[], lamps: [] as InstItem[], signs: [] as InstItem[], acs: [] as InstItem[], vents: [] as InstItem[] };
  const N = map.N;
  const half = N / 2;
  const cx = (i: number) => i - half + 0.5;
  const free = (c: number) => c >= 0 && map.nav[c] === 0 && map.obsType[c] === 0;
  const grass = (c: number) => free(c) && map.road[c] === 0;
  const y = (x: number, z: number) => map.heightAt(x, z);
  const col = (hex: string, dl = 0.1, ds = 0.06) => new THREE.Color(hex).offsetHSL((rnd() - 0.5) * 0.02, (rnd() - 0.5) * ds, (rnd() - 0.5) * dl);
  // bina komşusu hücre mi (bina önü / arkası)
  const nearBuilding = (i: number, j: number) => {
    for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const ii = i + di, jj = j + dj;
      if (ii < 0 || jj < 0 || ii >= N || jj >= N) continue;
      if (map.obsType[jj * N + ii] === 1) return true;
    }
    return false;
  };

  // 1) çim tutamları, çiçekler, çakıl: tüm sahada seyrek (iç ve dış)
  for (let j = 1; j < N - 1; j++)
    for (let i = 1; i < N - 1; i++) {
      const c = j * N + i;
      const x = cx(i), z = cx(j);
      if (map.id === 'hes' && z < -22) continue; // rezervuar
      if (grass(c)) {
        const r = rnd();
        if (r < 0.2) {
          for (let k = 0; k < 1 + Math.floor(rnd() * 2); k++) {
            const px = x + (rnd() - 0.5) * 0.9, pz = z + (rnd() - 0.5) * 0.9;
            out.tufts.push({ x: px, y: y(px, pz), z: pz, sx: 0.8 + rnd() * 0.7, ry: rnd() * 6, color: col('#79c24a', 0.12, 0.08) });
          }
        } else if (r < 0.235 && map.inside[c]) {
          const px = x + (rnd() - 0.5) * 0.6, pz = z + (rnd() - 0.5) * 0.6;
          out.flowers.push({ x: px, y: y(px, pz), z: pz, sx: 0.7 + rnd() * 0.5, ry: rnd() * 6, color: col(['#ffd23a', '#ff6b7d', '#f7f2e8', '#c77dff'][Math.floor(rnd() * 4)], 0.08, 0.05) });
        } else if (r < 0.26) {
          const px = x + (rnd() - 0.5) * 0.8, pz = z + (rnd() - 0.5) * 0.8;
          out.pebbles.push({ x: px, y: y(px, pz) + 0.04, z: pz, sx: 0.5 + rnd() * 0.9, ry: rnd() * 6, color: col('#a6a29a', 0.14, 0.02) });
        }
      } else if (free(c) && map.road[c] === 2 && rnd() < 0.05) {
        // servis yolu kenarında ufak çakıl
        const px = x + (rnd() - 0.5) * 0.8, pz = z + (rnd() - 0.5) * 0.8;
        out.pebbles.push({ x: px, y: y(px, pz) + 0.03, z: pz, sx: 0.4 + rnd() * 0.5, ry: rnd() * 6, color: col('#b9b4aa', 0.1, 0.02) });
      }
    }

  // 2) bina çevresi: depo → kasalar/paletler/makara; kontrol → trafik konisi, tabela; diğer binalar → varil/kasa
  for (const b of map.buildings) {
    const kind = b.kind;
    const spots: { x: number; z: number }[] = [];
    // bina çevresindeki boş hücreler
    const r = Math.max(b.w, b.d) / 2 + 1.2;
    for (let k = 0; k < 10; k++) {
      const a = rnd() * Math.PI * 2;
      const px = b.x + Math.cos(a) * r, pz = b.z + Math.sin(a) * r;
      const c = cellAt(map, px, pz);
      if (!free(c) || map.road[c] === 1 || !map.inside[c]) continue;
      spots.push({ x: px, z: pz });
    }
    const take = (n: number) => spots.splice(0, n);
    if (kind === 'depot' || kind === 'container') {
      for (const s of take(2)) out.crates.push({ x: s.x, y: y(s.x, s.z), z: s.z, sx: 0.9 + rnd() * 0.3, ry: rnd() * 1.5, color: col('#b98b53', 0.14, 0.06) });
      for (const s of take(1)) out.pallets.push({ x: s.x, y: y(s.x, s.z), z: s.z, ry: rnd() * 3 });
      for (const s of take(1)) out.spools.push({ x: s.x, y: y(s.x, s.z), z: s.z, ry: rnd() * 3, sx: 0.8 });
    } else if (kind === 'control') {
      for (const s of take(2)) out.cones.push({ x: s.x, y: y(s.x, s.z), z: s.z });
      for (const s of take(1)) out.signs.push({ x: s.x, y: y(s.x, s.z), z: s.z, ry: Math.atan2(b.x - s.x, b.z - s.z) });
    } else if (kind === 'trafo' || kind === 'inverter' || kind === 'pcs') {
      for (const s of take(1)) out.cones.push({ x: s.x, y: y(s.x, s.z), z: s.z });
    } else if (kind === 'turbinehall' || kind === 'boiler' || kind === 'separator' || kind === 'fancooler' || kind === 'wellhead' || kind === 'battery') {
      for (const s of take(2)) out.barrels.push({ x: s.x, y: y(s.x, s.z), z: s.z, sx: 0.85 + rnd() * 0.25, ry: rnd() * 6, color: col(['#3a5fa8', '#9e1b39', '#cfd3d8', '#f0c030'][Math.floor(rnd() * 4)], 0.1, 0.05) });
      if (kind === 'battery' && rnd() < 0.3) for (const s of take(1)) out.crates.push({ x: s.x, y: y(s.x, s.z), z: s.z, sx: 0.8, ry: rnd() * 1.5, color: col('#8f969e', 0.1, 0.02) });
    } else if (kind === 'tank' || kind === 'cooling' || kind === 'stack') {
      for (const s of take(1)) out.barrels.push({ x: s.x, y: y(s.x, s.z), z: s.z, sx: 0.9, ry: rnd() * 6, color: col('#9e1b39', 0.1, 0.05) });
    }
  }

  // 2b) çatı detayları: klima üniteleri ve havalandırma bacaları (kutu binalar)
  for (const b of map.buildings) {
    if (!['control', 'depot', 'container', 'turbinehall'].includes(b.kind)) continue;
    const by = Math.min(y(b.x - b.w / 2, b.z - b.d / 2), y(b.x + b.w / 2, b.z + b.d / 2), y(b.x + b.w / 2, b.z - b.d / 2), y(b.x - b.w / 2, b.z + b.d / 2)) + 0.2 + b.h + (b.kind === 'turbinehall' ? 0.45 : 0);
    const n = b.kind === 'turbinehall' ? 0 : b.w > 5 ? 2 : 1;
    for (let k = 0; k < n; k++) out.acs.push({ x: b.x - b.w / 2 + 1.2 + k * 2.2, y: by, z: b.z + b.d / 2 - 1.0, ry: 0, sx: 0.8 });
    const nv = b.kind === 'turbinehall' ? 4 : 1 + Math.floor(rnd() * 2);
    for (let k = 0; k < nv; k++) out.vents.push({ x: b.x + b.w / 2 - 0.8 - k * 1.6, y: by, z: b.z - b.d / 2 + 0.8, sx: b.kind === 'turbinehall' ? 1.3 : 0.9 });
  }

  // 3) ana yol boyunca aydınlatma direkleri (yolun kenar hücresinde, her ~7 m)
  const mainX = map.id === 'hes' ? -16 : 0;
  const lim = half - 1.5;
  for (let z = -lim + 2; z < lim - 2; z += 9) {
    for (const side of [-1, 1]) {
      const px = mainX + side * 2.4, pz = z + (side > 0 ? 3.5 : 0);
      const c = cellAt(map, px, pz);
      if (!free(c) || map.road[c] === 1) continue;
      if (!map.inside[c] && pz < 0) continue; // ana yol güneye uzanır
      if (Math.abs(pz) > lim) continue;
      out.lamps.push({ x: px, y: y(px, pz), z: pz, ry: side > 0 ? Math.PI : 0 });
    }
  }
  // 4) çit dışı: kütükler ve ekstra çakıl (bakımsız arazi hissi)
  const L = half - map.fMin - 0.5;
  for (let k = 0; k < Math.round(N * 0.6); k++) {
    const x = (rnd() - 0.5) * (N - 4), z = (rnd() - 0.5) * (N - 4);
    const m = Math.max(Math.abs(x), Math.abs(z));
    if (m < L + 1.5) continue;
    const c = cellAt(map, x, z);
    if (!grass(c)) continue;
    if (map.id === 'hes' && z < -22) continue;
    if (rnd() < 0.5) out.logs.push({ x, y: y(x, z) + 0.1, z, ry: rnd() * 6, sx: 0.8 + rnd() * 0.5 });
    else out.pebbles.push({ x, y: y(x, z) + 0.05, z, sx: 0.8 + rnd() * 1.2, ry: rnd() * 6, color: col('#9a968e', 0.14, 0.02) });
  }
  return out;
}

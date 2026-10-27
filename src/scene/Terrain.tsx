import { useMemo } from 'react';
import * as THREE from 'three';
import type { ThreeEvent } from '@react-three/fiber';
import type { MapData } from '../game/types';
import { cellAt, mulberry32 } from '../game/world/grid';
import { MOBILE_PLACE, useGame } from '../game/store';
import { makeGridGeometry } from './materials';

// TerrainManager (render) — arazi, yollar ve fare etkileşimi
const MARGIN = 26;

function hash(x: number, z: number) {
  const s = Math.sin(x * 12.9898 + z * 78.233) * 43758.5453;
  return s - Math.floor(s);
}

/** Yumuşak değer gürültüsü (köşeler arası pürüzsüz geçiş) — blok/piksel deseni oluşturmaz */
function vnoise(x: number, z: number) {
  const ix = Math.floor(x), iz = Math.floor(z);
  const fx = x - ix, fz = z - iz;
  const ux = fx * fx * (3 - 2 * fx), uz = fz * fz * (3 - 2 * fz);
  const a = hash(ix, iz), b = hash(ix + 1, iz), c = hash(ix, iz + 1), d = hash(ix + 1, iz + 1);
  return a + (b - a) * ux + (c - a) * uz + (a - b - c + d) * ux * uz;
}

export function groundColor(map: MapData, x: number, z: number, out: THREE.Color) {
  const c = cellAt(map, x, z);
  // hafif, büyük ölçekli renk dalgalanması (eski 0,5 m / 3 m blok gürültüsü zeminde piksel görüntüsü veriyordu)
  const n = vnoise(x / 5.5, z / 5.5) * 0.05 + vnoise(x / 17 + 31, z / 17 - 7) * 0.05;
  const h = map.heightAt(x, z);
  const rx = map.id === 'hes' ? x + 16 : x;
  if (c < 0 && Math.abs(rx) <= 1.6 && z > 0) {
    out.set(map.id === 'res' ? '#bf9f6e' : '#64676e');
    out.offsetHSL(0, 0, n - 0.04);
    return out;
  }
  if (c >= 0 && map.road[c]) {
    const r = map.road[c];
    if (map.id !== 'res') {
      if (r === 1) {
        out.set('#64676e');
        // asfalt orta şerit: ana yol eksenine yakın hücrelerde kesikli açık çizgi
        const rx = map.id === 'hes' ? x + 16 : x;
        const onX = Math.abs(rx) < 0.55, onZ = Math.abs(z - (map.id === 'bess' ? 12 : map.id === 'jes' ? 10 : map.id === 'hes' ? 6 : 0)) < 0.55 && map.id !== 'ges';
        const dash = (Math.floor((onX ? z : x) / 2) % 2) === 0;
        if ((onX || onZ) && dash) out.set('#9fa3a8');
        // kenar bandı
        else if (Math.abs(Math.abs(rx) - 1.5) < 0.2) out.set('#7a7d83');
      } else if (r === 3) out.set('#a9a49a');
      else out.set('#cbb994');
    } else {
      if (r === 3) out.set('#bdb6a7');
      else out.set('#bf9f6e');
    }
    out.offsetHSL(0, 0, n - 0.04);
    return out;
  }
  // 2×2 hücrelik dama deseni: biçilmiş çim şeritleri (Clash tarzı okunaklı zemin)
  const tile = ((Math.floor(x / 2) + Math.floor(z / 2)) & 1) === 0 ? 0.03 : -0.03;
  // bina dibi: aşınmış toprak halkası (yapılar zemine otursun)
  const wear = c >= 0 ? buildingWear(map, c) : 0;
  if (c >= 0 && map.inside[c]) {
    if (map.id !== 'res') {
      // panel sahası zemini: kısa kesilmiş çim
      out.set('#8cc65a');
      if (map.obsType[c] === 2) out.set('#7fb552');
      out.offsetHSL(0, 0.03, tile);
    } else {
      out.set('#7dbb52');
      out.lerp(new THREE.Color('#b7b56b'), Math.min(1, Math.max(0, (h - 4) / 7)) * 0.55);
    }
  } else {
    out.set('#6fb247');
    if (map.id === 'res') out.lerp(new THREE.Color('#8c9a5a'), Math.min(1, Math.max(0, (h - 6) / 8)) * 0.6);
    if (c < 0) out.set('#64a442');
    out.offsetHSL(0, 0.02, tile * 0.6);
  }
  if (c >= 0 && map.nav[c] >= 2) out.set('#a39a82');
  if (wear > 0) out.lerp(new THREE.Color('#b8a070'), wear * 0.75);
  out.offsetHSL(0.01 * (n - 0.05), 0.02, n - 0.05);
  return out;
}

/** hücrenin bina (obsType 1) hücrelerine yakınlığı: bitişik 1, iki hücre 0.45, yoksa 0 */
function buildingWear(map: MapData, c: number) {
  const N = map.N;
  const i = c % N, j = Math.floor(c / N);
  if (map.obsType[c] === 1) return 0;
  let best = 0;
  for (let dj = -2; dj <= 2; dj++)
    for (let di = -2; di <= 2; di++) {
      if (!di && !dj) continue;
      const ii = i + di, jj = j + dj;
      if (ii < 0 || jj < 0 || ii >= N || jj >= N) continue;
      if (map.obsType[jj * N + ii] !== 1) continue;
      const d = Math.max(Math.abs(di), Math.abs(dj));
      best = Math.max(best, d === 1 ? 1 : 0.45);
    }
  return best;
}

export function Terrain() {
  const map = useGame((s) => s.map)!;
  const geom = useMemo(() => {
    const size = map.N + MARGIN * 2;
    const segs = size * 2;
    const g = makeGridGeometry(-size / 2, -size / 2, size, segs, map.heightAt);
    const pos = g.getAttribute('position') as THREE.BufferAttribute;
    const colors = new Float32Array(pos.count * 3);
    const col = new THREE.Color();
    for (let k = 0; k < pos.count; k++) {
      groundColor(map, pos.getX(k), pos.getZ(k), col);
      colors[k * 3] = col.r;
      colors[k * 3 + 1] = col.g;
      colors[k * 3 + 2] = col.b;
    }
    // yol / çim sınırlarındaki merdiven (piksel) kenarlarını yumuşat: 2 geçişli 3×3 kutu bulanıklığı
    const n = segs + 1;
    let src = colors;
    for (let pass = 0; pass < 2; pass++) {
      const dst = new Float32Array(src.length);
      for (let j = 0; j < n; j++)
        for (let i = 0; i < n; i++) {
          let r = 0, gg = 0, b = 0, w = 0;
          for (let dj = -1; dj <= 1; dj++) {
            const jj = j + dj;
            if (jj < 0 || jj >= n) continue;
            for (let di = -1; di <= 1; di++) {
              const ii = i + di;
              if (ii < 0 || ii >= n) continue;
              const q = (jj * n + ii) * 3;
              const wt = di === 0 && dj === 0 ? 2 : 1;
              r += src[q] * wt;
              gg += src[q + 1] * wt;
              b += src[q + 2] * wt;
              w += wt;
            }
          }
          const o = (j * n + i) * 3;
          dst[o] = r / w;
          dst[o + 1] = gg / w;
          dst[o + 2] = b / w;
        }
      src = dst;
    }
    g.setAttribute('color', new THREE.BufferAttribute(src, 3));
    return g;
  }, [map]);

  const horizon = useMemo(() => {
    const size = map.N + MARGIN * 2;
    const h = size / 2;
    const steps = size * 2;
    // kenar boyunca arazi yüksekliği; ufuk düzlemi en alçak kenarın biraz altında
    const edge: [number, number][] = [];
    for (let k = 0; k < steps; k++) edge.push([-h + (size * k) / steps, -h]);
    for (let k = 0; k < steps; k++) edge.push([h, -h + (size * k) / steps]);
    for (let k = 0; k < steps; k++) edge.push([h - (size * k) / steps, h]);
    for (let k = 0; k < steps; k++) edge.push([-h, h - (size * k) / steps]);
    let minY = Infinity;
    for (const [x, z] of edge) minY = Math.min(minY, map.heightAt(x, z));
    const y = minY - 0.08;
    const shape = new THREE.Shape();
    shape.moveTo(-450, -450);
    shape.lineTo(450, -450);
    shape.lineTo(450, 450);
    shape.lineTo(-450, 450);
    shape.closePath();
    const hole = new THREE.Path();
    // rotation-x=-90° ile şekil (x, y) → dünya (x, -z); delik simetrik olduğu için yön önemsiz
    hole.moveTo(-h, -h);
    hole.lineTo(-h, h);
    hole.lineTo(h, h);
    hole.lineTo(h, -h);
    hole.closePath();
    shape.holes.push(hole);
    const ring = new THREE.ShapeGeometry(shape);
    const pos: number[] = [];
    const idx: number[] = [];
    edge.push(edge[0]);
    for (let k = 0; k < edge.length; k++) {
      const [x, z] = edge[k];
      pos.push(x, map.heightAt(x, z), z, x, y, z);
      if (k > 0) {
        const a = (k - 1) * 2;
        idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
      }
    }
    const skirt = new THREE.BufferGeometry();
    skirt.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    skirt.setIndex(idx);
    skirt.computeVertexNormals();
    return { ring, skirt, y };
  }, [map]);

  const onMove = (e: ThreeEvent<PointerEvent>) => {
    useGame.getState().setHover(e.point.x, e.point.z);
  };
  const onUp = (e: ThreeEvent<PointerEvent>) => {
    const st = useGame.getState();
    if (MOBILE_PLACE) {
      // mobil: parmak kalkınca hayalet olduğu yerde kalır, ✓ ile onaylanır
      if (st.placing?.fromShopDrag) useGame.setState({ placing: { ...st.placing, fromShopDrag: false } });
      return;
    }
    if (st.placing?.fromShopDrag) {
      st.setHover(e.point.x, e.point.z);
      st.commitPlace();
    }
  };
  const onClick = (e: ThreeEvent<MouseEvent>) => {
    if (e.delta > 6) return;
    const st = useGame.getState();
    if (st.placing) {
      st.setHover(e.point.x, e.point.z);
      if (!MOBILE_PLACE) st.commitPlace();
      return;
    }
    if (st.phase === 'sim' && st.ptzAimId) {
      st.aimPtzAt(e.point.x, e.point.z);
      return;
    }
    if (st.phase === 'planning') st.selectDevice(null);
  };

  return (
    <group>
      <mesh geometry={geom} receiveShadow onPointerMove={onMove} onPointerUp={onUp} onClick={onClick}>
        <meshStandardMaterial vertexColors roughness={0.95} metalness={0} />
      </mesh>
      {/* ufuk zemini: arazinin dışında kalan halka + kenar eteği (arazinin içini asla örtmez) */}
      <mesh geometry={horizon.ring} rotation-x={-Math.PI / 2} position={[0, horizon.y, 0]} raycast={() => null}>
        <meshStandardMaterial color={'#5f9e3f'} roughness={1} />
      </mesh>
      <mesh geometry={horizon.skirt} raycast={() => null}>
        <meshStandardMaterial color={'#5f9e3f'} roughness={1} side={THREE.DoubleSide} />
      </mesh>
    </group>
  );
}

/** Harita kenar boşluğundaki dekoratif ağaçlar (oynanışı etkilemez) */
export function useMarginTrees(map: MapData) {
  return useMemo(() => {
    const rnd = mulberry32(map.N * 31);
    const out: { x: number; z: number; s: number; kind: number }[] = [];
    const half = map.N / 2;
    for (let k = 0; k < (map.id === 'res' ? 900 : 650); k++) {
      const x = (rnd() - 0.5) * (map.N + MARGIN * 2 - 2);
      const z = (rnd() - 0.5) * (map.N + MARGIN * 2 - 2);
      if (Math.abs(x) < half && Math.abs(z) < half) continue;
      if (Math.abs(map.id === 'hes' ? x + 16 : x) < 3 && z > 0) continue; // yol
      if (map.id === 'hes' && z < -22) continue; // rezervuar
      // fuar modu: çite yakın kenar ağaçları da seyrek (sınır görünsün)
      if (map.expo) {
        const L = map.fMax - map.N / 2 + 0.5;
        const d = Math.abs(Math.max(Math.abs(x), Math.abs(z)) - L);
        if (d < 12 && rnd() > 0.15) continue;
      }
      out.push({ x, z, s: 0.8 + rnd() * 0.7, kind: rnd() < 0.55 ? 0 : 1 });
    }
    return out;
  }, [map]);
}

import * as THREE from 'three';

// Paylaşılan malzemeler (önbellekli) — stilize, Clash tarzı canlı renkler
const cache = new Map<string, THREE.Material>();

export function mat(color: string, opts: { rough?: number; metal?: number; emissive?: string; ei?: number; flat?: boolean } = {}) {
  const key = `${color}|${opts.rough ?? 0.7}|${opts.metal ?? 0}|${opts.emissive ?? ''}|${opts.ei ?? 0}|${opts.flat ? 1 : 0}`;
  let m = cache.get(key);
  if (!m) {
    m = new THREE.MeshStandardMaterial({
      color,
      roughness: opts.rough ?? 0.7,
      metalness: opts.metal ?? 0,
      emissive: opts.emissive ? new THREE.Color(opts.emissive) : new THREE.Color(0),
      emissiveIntensity: opts.ei ?? 0,
      flatShading: !!opts.flat,
    });
    cache.set(key, m);
  }
  return m;
}

export const ghostOk = new THREE.MeshStandardMaterial({ color: '#35e28a', emissive: '#1cff7a', emissiveIntensity: 0.55, transparent: true, opacity: 0.55, depthWrite: false });
export const ghostBad = new THREE.MeshStandardMaterial({ color: '#ff3b4e', emissive: '#ff1030', emissiveIntensity: 0.55, transparent: true, opacity: 0.55, depthWrite: false });

export const COLORS = {
  burgundy: '#9e1b39',
  burgundyHi: '#c8284b',
  anthracite: '#2a2c31',
  white: '#f3f1ec',
  steel: '#7d838c',
  darkSteel: '#4a4f57',
};

let panelTex: THREE.Texture | null = null;
export function panelTexture() {
  if (panelTex) return panelTex;
  const c = document.createElement('canvas');
  c.width = 64;
  c.height = 128;
  const g = c.getContext('2d')!;
  const grd = g.createLinearGradient(0, 0, 64, 128);
  grd.addColorStop(0, '#2b4f9e');
  grd.addColorStop(1, '#13275a');
  g.fillStyle = grd;
  g.fillRect(0, 0, 64, 128);
  g.strokeStyle = 'rgba(190,210,255,0.35)';
  g.lineWidth = 1;
  for (let x = 0; x <= 64; x += 16) {
    g.beginPath();
    g.moveTo(x, 0);
    g.lineTo(x, 128);
    g.stroke();
  }
  for (let y = 0; y <= 128; y += 16) {
    g.beginPath();
    g.moveTo(0, y);
    g.lineTo(64, y);
    g.stroke();
  }
  g.strokeStyle = '#d9dde3';
  g.lineWidth = 4;
  g.strokeRect(0, 0, 64, 128);
  panelTex = new THREE.CanvasTexture(c);
  panelTex.colorSpace = THREE.SRGBColorSpace;
  panelTex.anisotropy = 4;
  return panelTex;
}

let fenceTex: THREE.Texture | null = null;
export function fenceTexture() {
  if (fenceTex) return fenceTex;
  const c = document.createElement('canvas');
  c.width = 64;
  c.height = 64;
  const g = c.getContext('2d')!;
  g.clearRect(0, 0, 64, 64);
  g.strokeStyle = 'rgba(200,205,210,0.95)';
  g.lineWidth = 2.2;
  g.beginPath();
  g.moveTo(0, 0);
  g.lineTo(64, 64);
  g.moveTo(64, 0);
  g.lineTo(0, 64);
  g.moveTo(32, -32);
  g.lineTo(96, 32);
  g.moveTo(-32, 32);
  g.lineTo(32, 96);
  g.moveTo(32, 96);
  g.lineTo(96, 32);
  g.moveTo(-32, 32);
  g.lineTo(32, -32);
  g.stroke();
  fenceTex = new THREE.CanvasTexture(c);
  fenceTex.wrapS = fenceTex.wrapT = THREE.RepeatWrapping;
  fenceTex.colorSpace = THREE.SRGBColorSpace;
  return fenceTex;
}

let glowTex: THREE.Texture | null = null;
export function glowTexture() {
  if (glowTex) return glowTex;
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d')!;
  const grd = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  grd.addColorStop(0, 'rgba(255,255,255,1)');
  grd.addColorStop(0.45, 'rgba(255,255,255,0.45)');
  grd.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grd;
  g.fillRect(0, 0, 128, 128);
  glowTex = new THREE.CanvasTexture(c);
  return glowTex;
}

let corrugTex: THREE.Texture | null = null;
export function corrugatedTexture() {
  if (corrugTex) return corrugTex;
  const c = document.createElement('canvas');
  c.width = 64;
  c.height = 8;
  const g = c.getContext('2d')!;
  for (let x = 0; x < 64; x++) {
    const v = 200 + Math.sin(x * 0.8) * 40;
    g.fillStyle = `rgb(${v},${v},${v})`;
    g.fillRect(x, 0, 1, 8);
  }
  corrugTex = new THREE.CanvasTexture(c);
  corrugTex.wrapS = corrugTex.wrapT = THREE.RepeatWrapping;
  corrugTex.repeat.set(4, 1);
  return corrugTex;
}

export function textTexture(text: string, bg: string, fg: string, w = 256, h = 64, font = 30) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const g = c.getContext('2d')!;
  g.fillStyle = bg;
  g.fillRect(0, 0, w, h);
  g.fillStyle = fg;
  g.font = `700 ${font}px "Be Vietnam Pro", Arial, sans-serif`;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(text, w / 2, h / 2 + 2);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** Arazi üzerine oturan ızgara geometrisi (u,v = dünya koordinatından) */
export function makeGridGeometry(
  x0: number,
  z0: number,
  size: number,
  segs: number,
  heightFn: (x: number, z: number) => number,
  uvSize = size,
  uvX0 = x0,
  uvZ0 = z0
) {
  const n = segs + 1;
  const pos = new Float32Array(n * n * 3);
  const uv = new Float32Array(n * n * 2);
  for (let j = 0; j < n; j++)
    for (let i = 0; i < n; i++) {
      const x = x0 + (size * i) / segs;
      const z = z0 + (size * j) / segs;
      const k = j * n + i;
      pos[k * 3] = x;
      pos[k * 3 + 1] = heightFn(x, z);
      pos[k * 3 + 2] = z;
      uv[k * 2] = (x - uvX0) / uvSize;
      uv[k * 2 + 1] = (z - uvZ0) / uvSize;
    }
  const index: number[] = [];
  for (let j = 0; j < segs; j++)
    for (let i = 0; i < segs; i++) {
      const a = j * n + i, b = a + 1, c = a + n, d = c + 1;
      index.push(a, c, b, b, c, d);
    }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  g.setIndex(index);
  g.computeVertexNormals();
  return g;
}

export const noRaycast = () => null;

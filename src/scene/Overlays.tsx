import { useEffect, useMemo } from 'react';
import * as THREE from 'three';
import { useGame } from '../game/store';
import type { MapData } from '../game/types';
import { makeGridGeometry, noRaycast } from './materials';

// RiskMapOverlay + kapsama / kör nokta katmanı (tek dünya ızgarası üzerinde)

function useOverlayGeometry(map: MapData, lift: number) {
  return useMemo(() => makeGridGeometry(-map.N / 2, -map.N / 2, map.N, map.N * 2, (x, z) => map.heightAt(x, z) + lift), [map, lift]);
}

function makeTex(N: number) {
  const data = new Uint8Array(N * N * 4);
  const t = new THREE.DataTexture(data, N, N, THREE.RGBAFormat);
  t.magFilter = THREE.LinearFilter;
  t.minFilter = THREE.LinearFilter;
  t.needsUpdate = true;
  return t;
}

export function CoverageOverlay() {
  const map = useGame((s) => s.map)!;
  const coverage = useGame((s) => s.coverage);
  const layers = useGame((s) => s.layers);
  const geom = useOverlayGeometry(map, 0.07);
  const tex = useMemo(() => makeTex(map.N), [map]);

  useEffect(() => {
    if (!coverage) return;
    const d = tex.image.data as Uint8Array;
    const N = map.N;
    for (let c = 0; c < N * N; c++) {
      let r = 0, g = 0, b = 0, a = 0;
      const ins = map.inside[c] === 1 || map.nav[c] === 2 || map.nav[c] === 3;
      const walk = map.nav[c] !== 1;
      if (layers.coverage && coverage.cam[c] > 0) {
        r = 30; g = 215; b = 190;
        a = Math.min(0.2 + 0.07 * coverage.cam[c], 0.42) * 255;
      } else if (layers.coverage && coverage.sensor[c] > 0) {
        r = 155; g = 115; b = 255;
        a = 0.34 * 255;
      } else if (layers.blind && ins && walk && map.inside[c] === 1) {
        r = 235; g = 45; b = 70;
        a = 0.36 * 255;
      }
      d[c * 4] = r;
      d[c * 4 + 1] = g;
      d[c * 4 + 2] = b;
      d[c * 4 + 3] = a;
    }
    tex.needsUpdate = true;
  }, [coverage, layers.coverage, layers.blind, map, tex]);

  if (!layers.coverage && !layers.blind) return null;
  return (
    <mesh geometry={geom} raycast={noRaycast} renderOrder={2}>
      <meshBasicMaterial map={tex} transparent depthWrite={false} polygonOffset polygonOffsetFactor={-2} />
    </mesh>
  );
}

export function RiskOverlay() {
  const map = useGame((s) => s.map)!;
  const show = useGame((s) => s.layers.risk);
  const geom = useOverlayGeometry(map, 0.09);
  const tex = useMemo(() => {
    const t = makeTex(map.N);
    const d = t.image.data as Uint8Array;
    const cols = [
      [60, 200, 90],
      [245, 215, 50],
      [250, 140, 30],
      [235, 40, 50],
    ];
    for (let c = 0; c < map.N * map.N; c++) {
      const ins = map.inside[c] === 1 || map.nav[c] === 2 || map.nav[c] === 3;
      if (!ins) continue;
      const k = map.risk[c];
      d[c * 4] = cols[k][0];
      d[c * 4 + 1] = cols[k][1];
      d[c * 4 + 2] = cols[k][2];
      d[c * 4 + 3] = map.nav[c] === 1 ? 60 : 120;
    }
    t.needsUpdate = true;
    return t;
  }, [map]);
  if (!show) return null;
  return (
    <mesh geometry={geom} raycast={noRaycast} renderOrder={3}>
      <meshBasicMaterial map={tex} transparent depthWrite={false} polygonOffset polygonOffsetFactor={-3} />
    </mesh>
  );
}

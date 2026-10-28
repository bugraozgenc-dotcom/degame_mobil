import { MapControls } from '@react-three/drei';
import { TOUCH } from 'three';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import type { MapControls as MapControlsImpl } from 'three-stdlib';
import { MOBILE_PLACE, camBasis, getEngine, useGame } from '../game/store';
import { CoverageOverlay, RiskOverlay } from './Overlays';
import { DevicesLayer, PlacementGhost } from './DevicesLayer';
import { MapObjects } from './MapObjects';
import { SimLayer } from './SimLayer';
import { CableReels } from './CableReels';
import { Terrain } from './Terrain';
import { SoundWatcher } from './SoundWatcher';
import { Sky } from './Sky';
import { Props } from './Props';
import { IS_MOBILE, sampleFrame, useGfx } from './gfx';

// GameScene — izometrik 3D sahne

/** büyütülmüş harita (zorluk) için kamera uzaklık çarpanı */
const BASE_N: Record<string, number> = { ges: 72, res: 88, tes: 80, jes: 76, hes: 84, bess: 72 };
export const mapScale = (map: { id: string; N: number }) => 1 + ((map.N - (BASE_N[map.id] ?? map.N)) / 2) / 12;

function IsometricCamera() {
  const ref = useRef<MapControlsImpl>(null);
  const map = useGame((s) => s.map)!;
  const focus = useGame((s) => s.focus);
  const autoOrbit = useGame((s) => s.autoOrbit);
  const placingActive = useGame((s) => !!s.placing);
  const placingFresh = useGame((s) => !!s.placing && !s.placing.hasHover && s.placing.stage === 'position');
  // mobil: yeni hayalet ekranın ortasında (kamera hedefinde) belirir, sonra parmakla sürüklenir
  useEffect(() => {
    if (!MOBILE_PLACE || !placingFresh || !ref.current) return;
    const t = ref.current.target;
    const st = useGame.getState();
    st.setHover(t.x, t.z);
    // hayalete yakınlaş: çit hücreleri parmakla seçilecek kadar büyük görünsün
    const p = useGame.getState().placing;
    if (p && !p.existingId) st.focusOn(p.x, p.z, 44);
  }, [placingFresh]);
  const anim = useRef<{ from: THREE.Vector3; to: THREE.Vector3; d0: number; d1: number; t: number } | null>(null);
  const keys = useRef<Record<string, boolean>>({});
  const { camera, scene: sc3 } = useThree();
  (window as unknown as { __cam: unknown; __scene: unknown }).__cam = camera; // test/debug
  (window as unknown as { __scene: unknown }).__scene = sc3;

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.tagName === 'INPUT') return;
      keys.current[e.key.toLowerCase()] = true;
    };
    const up = (e: KeyboardEvent) => (keys.current[e.key.toLowerCase()] = false);
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
    };
  }, []);

  useEffect(() => {
    if (!focus || !ref.current) return;
    const c = ref.current;
    const curD = camera.position.distanceTo(c.target);
    const off0 = camera.position.clone().sub(c.target);
    anim.current = {
      from: c.target.clone(),
      // fuarda hedef, ekranın alt-ortasındaki karar kartının arkasında kalmasın: hedefi biraz yukarı (ekranda) taşı
      to: (() => {
        const t = new THREE.Vector3(focus.x, map.heightAt(focus.x, focus.z), focus.z);
        if (useGame.getState().fair && useGame.getState().phase === 'sim') {
          const fwd = new THREE.Vector3(-off0.x, 0, -off0.z).normalize();
          t.addScaledVector(fwd, -(focus.dist ?? curD) * 0.16);
        }
        return t;
      })(),
      d0: curD,
      d1: focus.dist ?? curD,
      t: 0,
    };
  }, [focus, map, camera]);

  useFrame((_, dt) => {
    {
      // yer düzleminde kamera ekseni (ok tuşlarıyla kaydırma için)
      const f = new THREE.Vector3();
      camera.getWorldDirection(f);
      f.y = 0;
      if (f.lengthSq() > 1e-6) {
        f.normalize();
        camBasis.fx = f.x;
        camBasis.fz = f.z;
        camBasis.rx = -f.z;
        camBasis.rz = f.x;
      }
    }
    const c = ref.current;
    if (!c) return;
    const off = camera.position.clone().sub(c.target);
    // klavye: WASD / oklar kaydırma, Q/E döndürme
    const k = keys.current;
    const fwd = new THREE.Vector3(-off.x, 0, -off.z).normalize();
    const right = new THREE.Vector3(-fwd.z, 0, fwd.x);
    const sp = off.length() * 0.9 * dt;
    const mv = new THREE.Vector3();
    if (k['w'] || k['arrowup']) mv.add(fwd);
    if (k['s'] || k['arrowdown']) mv.sub(fwd);
    if (k['d'] || k['arrowright']) mv.add(right);
    if (k['a'] || k['arrowleft']) mv.sub(right);
    if (mv.lengthSq() > 0) {
      mv.normalize().multiplyScalar(sp);
      c.target.add(mv);
      camera.position.add(mv);
      anim.current = null;
    }
    const rot = (k['q'] ? 1 : 0) - (k['e'] ? 1 : 0);
    if (rot) {
      off.applyAxisAngle(new THREE.Vector3(0, 1, 0), rot * dt * 1.4);
      camera.position.copy(c.target).add(off);
    }
    // odak animasyonu
    const a = anim.current;
    if (a) {
      a.t = Math.min(1, a.t + dt * 2.2);
      const e = 1 - Math.pow(1 - a.t, 3);
      const tgt = a.from.clone().lerp(a.to, e);
      const dist = a.d0 + (a.d1 - a.d0) * e;
      const dir = camera.position.clone().sub(c.target).normalize();
      c.target.copy(tgt);
      camera.position.copy(tgt).add(dir.multiplyScalar(dist));
      if (a.t >= 1) anim.current = null;
    }
    // hedefi harita içinde tut
    const lim = map.N / 2 + 6;
    const t = c.target;
    const cx = Math.max(-lim, Math.min(lim, t.x));
    const cz = Math.max(-lim, Math.min(lim, t.z));
    if (cx !== t.x || cz !== t.z) {
      const dx = cx - t.x, dz = cz - t.z;
      t.x = cx;
      t.z = cz;
      camera.position.x += dx;
      camera.position.z += dz;
    }
    c.update();
  });

  return (
    <MapControls
      ref={ref}
      makeDefault
      enableDamping
      dampingFactor={0.12}
      screenSpacePanning={false}
      minDistance={14}
      maxDistance={(map.id === 'ges' ? 120 : 150) * mapScale(map)}
      minPolarAngle={0.42}
      maxPolarAngle={1.08}
      zoomSpeed={1.1}
      panSpeed={1.2}
      touches={{ ONE: (MOBILE_PLACE && placingActive ? -1 : TOUCH.PAN) as TOUCH, TWO: TOUCH.DOLLY_ROTATE }}
      rotateSpeed={0.6}
      autoRotate={autoOrbit}
      autoRotateSpeed={0.35}
      enabled={!autoOrbit}
    />
  );
}

function Lighting() {
  const level = useGame((s) => s.level)!;
  const map = useGame((s) => s.map)!;
  const sun = useRef<THREE.DirectionalLight>(null);
  const { scene } = useThree();
  // toz fırtınası: sis sarıya döner ve yaklaşır (yumuşak geçiş)
  const dustMix = useRef(0);
  const baseFog = useRef<{ color: THREE.Color; near: number; far: number } | null>(null);
  useFrame((_, dt) => {
    const f = scene.fog as THREE.Fog | null;
    if (!f) return;
    if (!baseFog.current) baseFog.current = { color: f.color.clone(), near: f.near, far: f.far };
    const e = getEngine();
    const want = e && !e.ended && useGame.getState().phase === 'sim' && e.isDust() ? 1 : 0;
    dustMix.current += (want - dustMix.current) * Math.min(1, dt * 1.5);
    const m = dustMix.current;
    const b = baseFog.current;
    const fs = mapScale(map);
    f.color.copy(b.color).lerp(new THREE.Color('#cfa873'), m);
    f.near = b.near * (1 - m) + 40 * fs * m;
    f.far = b.far * (1 - m) + 175 * fs * m;
  });
  const half = map.N / 2 + 6;
  useEffect(() => {
    if (sun.current) {
      scene.add(sun.current.target);
      sun.current.target.position.set(0, 0, 0);
    }
  }, [scene]);
  const night = level.night;
  const fog = level.weather === 'fog';
  const fs = mapScale(map); // büyük haritada sis uzaklıkları da büyür
  const low = useGfx((s) => s.low);
  useEffect(() => {
    const l = sun.current;
    if (!l) return;
    const size = low ? 512 : IS_MOBILE ? 1024 : 2048;
    if (l.shadow.mapSize.x !== size) {
      l.shadow.mapSize.set(size, size);
      l.shadow.map?.dispose();
      l.shadow.map = null;
    }
  }, [low]);
  const bg = night ? '#070b14' : fog ? '#c3cdd3' : '#a8d4f0';
  return (
    <>
      <color attach="background" args={[bg]} />
      {night ? <fog attach="fog" args={['#0a1220', 70 * fs, 210 * fs]} /> : fog ? <fog attach="fog" args={['#c3cdd3', 55 * fs, 190 * fs]} /> : <fog attach="fog" args={['#bfe0f2', 140 * fs, 330 * fs]} />}
      <hemisphereLight args={[night ? '#3a5488' : fog ? '#dfe6ea' : '#d6ecff', night ? '#0b1018' : '#4f6b33', night ? 0.8 : fog ? 1.0 : 0.95]} />
      {night && <ambientLight intensity={0.2} color="#6f86c0" />}
      <directionalLight
        ref={sun}
        position={night ? [-40, 70, -30] : [45, 75, 35]}
        intensity={night ? 1.0 : fog ? 1.5 : 2.6}
        color={night ? '#a8beff' : '#fff2dc'}
        castShadow
        shadow-mapSize={[2048, 2048]}
        shadow-camera-left={-half}
        shadow-camera-right={half}
        shadow-camera-top={half}
        shadow-camera-bottom={-half}
        shadow-camera-near={10}
        shadow-camera-far={260}
        shadow-bias={-0.0004}
        shadow-normalBias={0.04}
      />
    </>
  );
}

/** gölgeler açılıp kapanınca (Grafik modu) malzemeler yeniden derlensin */
function ShadowToggle() {
  const low = useGfx((s) => s.low);
  const { gl, scene } = useThree();
  useEffect(() => {
    gl.shadowMap.enabled = !low;
    gl.shadowMap.needsUpdate = true;
    scene.traverse((o) => {
      const m = (o as THREE.Mesh).material as THREE.Material | THREE.Material[] | undefined;
      if (!m) return;
      if (Array.isArray(m)) m.forEach((x) => (x.needsUpdate = true));
      else m.needsUpdate = true;
    });
  }, [low, gl, scene]);
  return null;
}

function Rain() {
  const level = useGame((s) => s.level)!;
  const ref = useRef<THREE.LineSegments>(null);
  const COUNT = 2200;
  const { geom, seeds } = useMemo(() => {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(COUNT * 6), 3));
    const seeds = new Float32Array(COUNT * 3);
    for (let k = 0; k < COUNT; k++) {
      seeds[k * 3] = (Math.random() - 0.5) * 120;
      seeds[k * 3 + 1] = Math.random() * 40;
      seeds[k * 3 + 2] = (Math.random() - 0.5) * 120;
    }
    return { geom: g, seeds };
  }, []);
  useFrame(({ controls }, dt) => {
    const l = ref.current;
    if (!l || level.weather !== 'rain') return;
    const tgt = (controls as unknown as { target?: THREE.Vector3 })?.target ?? new THREE.Vector3();
    const pos = geom.getAttribute('position') as THREE.BufferAttribute;
    const a = pos.array as Float32Array;
    for (let k = 0; k < COUNT; k++) {
      seeds[k * 3 + 1] -= dt * 28;
      if (seeds[k * 3 + 1] < 0) seeds[k * 3 + 1] += 40;
      const x = tgt.x + seeds[k * 3], y = seeds[k * 3 + 1], z = tgt.z + seeds[k * 3 + 2];
      a[k * 6] = x;
      a[k * 6 + 1] = y;
      a[k * 6 + 2] = z;
      a[k * 6 + 3] = x + 0.12;
      a[k * 6 + 4] = y + 0.9;
      a[k * 6 + 5] = z + 0.05;
    }
    pos.needsUpdate = true;
  });
  if (level.weather !== 'rain') return null;
  return (
    <lineSegments ref={ref} geometry={geom} frustumCulled={false} raycast={() => null}>
      <lineBasicMaterial color="#9fb8d8" transparent opacity={0.35} />
    </lineSegments>
  );
}

/** toz fırtınası parçacıkları: yatay süzülen kum çizgileri */
function Dust() {
  const ref = useRef<THREE.LineSegments>(null);
  const COUNT = 1400;
  const { geom, seeds } = useMemo(() => {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(COUNT * 6), 3));
    const seeds = new Float32Array(COUNT * 3);
    for (let k = 0; k < COUNT; k++) {
      seeds[k * 3] = (Math.random() - 0.5) * 140;
      seeds[k * 3 + 1] = 0.3 + Math.random() * 9;
      seeds[k * 3 + 2] = (Math.random() - 0.5) * 140;
    }
    return { geom: g, seeds };
  }, []);
  const mat = useMemo(() => new THREE.LineBasicMaterial({ color: '#e0b878', transparent: true, opacity: 0 }), []);
  useFrame(({ controls }, dt) => {
    const l = ref.current;
    if (!l) return;
    const e = getEngine();
    const on = !!e && !e.ended && useGame.getState().phase === 'sim' && e.isDust();
    mat.opacity += ((on ? 0.5 : 0) - mat.opacity) * Math.min(1, dt * 2);
    l.visible = mat.opacity > 0.02;
    if (!l.visible) return;
    const tgt = (controls as unknown as { target?: THREE.Vector3 })?.target ?? new THREE.Vector3();
    const pos = geom.getAttribute('position') as THREE.BufferAttribute;
    const a = pos.array as Float32Array;
    for (let k = 0; k < COUNT; k++) {
      seeds[k * 3] += dt * 26;
      if (seeds[k * 3] > 70) seeds[k * 3] -= 140;
      const x = tgt.x + seeds[k * 3], y = seeds[k * 3 + 1] + Math.sin(seeds[k * 3] * 0.3) * 0.6, z = tgt.z + seeds[k * 3 + 2];
      a[k * 6] = x;
      a[k * 6 + 1] = y;
      a[k * 6 + 2] = z;
      a[k * 6 + 3] = x + 1.6;
      a[k * 6 + 4] = y + 0.08;
      a[k * 6 + 5] = z + 0.3;
    }
    pos.needsUpdate = true;
  });
  return <lineSegments ref={ref} geometry={geom} material={mat} frustumCulled={false} raycast={() => null} visible={false} />;
}

function SimTicker() {
  const acc = useRef(0);
  useFrame((_, dt) => {
    sampleFrame(dt);
    const st = useGame.getState();
    if (st.phase !== 'sim') return;
    st.tick(dt);
    acc.current += dt;
    if (acc.current > 0.2) {
      acc.current = 0;
      useGame.setState({ simTick: useGame.getState().simTick + 1 });
    }
  });
  return null;
}

function Keyboard() {
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      const st = useGame.getState();
      const k = e.key.toLowerCase();
      if (k === 'escape') {
        if (st.placing) st.cancelPlace();
        else if (st.ptzAimId) st.setPtzAim(null);
        else st.selectDevice(null);
      }
      if (k === 'r' && st.placing) st.rotatePlacing(Math.PI / 4);
      if ((k === 'delete' || k === 'backspace') && st.selectedDeviceId && st.phase === 'planning') st.sellDevice(st.selectedDeviceId);
      if (k === ' ' && st.phase === 'sim') {
        e.preventDefault();
        st.togglePause();
      }
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, []);
  return null;
}

export function GameScene() {
  const map = useGame((s) => s.map);
  const level = useGame((s) => s.level);
  const low = useGfx((s) => s.low);
  if (!map || !level) return null;
  const d = (map.id === 'res' ? 105 : map.id === 'tes' ? 92 : map.id === 'jes' ? 88 : map.id === 'hes' ? 98 : 82) * mapScale(map); // bess = ges
  const pol = 0.86;
  const az = Math.PI / 4;
  return (
    <Canvas
      key={`${map.id}-${level.id}`}
      shadows={!low}
      dpr={low ? 1 : IS_MOBILE ? [1, 1.25] : [1, 1.5]}
      style={{ isolation: 'isolate' }} /* sahne içi HTML etiketleri arayüz panellerinin üstüne çıkmasın */
      camera={{ fov: 32, near: 1, far: 700, position: [d * Math.sin(pol) * Math.sin(az), d * Math.cos(pol), d * Math.sin(pol) * Math.cos(az)] }}
      gl={{ antialias: !IS_MOBILE, powerPreference: 'high-performance' }}
      onCreated={({ gl }) => {
        gl.toneMapping = THREE.ACESFilmicToneMapping;
        gl.toneMappingExposure = 1.12;
        gl.shadowMap.type = THREE.PCFShadowMap; // yumuşak PCF zayıf GPU'larda pahalı
      }}
      onContextMenu={(e) => e.preventDefault()}
      onPointerMissed={() => {
        const st = useGame.getState();
        if (st.phase === 'planning' && !st.placing) st.selectDevice(null);
      }}
    >
      <Lighting />
      <ShadowToggle />
      <Sky />
      <IsometricCamera />
      <Terrain />
      <MapObjects />
      <Props />
      <CableReels />
      <RiskOverlay />
      <CoverageOverlay />
      <DevicesLayer />
      <PlacementGhost />
      <SimLayer />
      <Rain />
      <Dust />
      <SimTicker />
      <SoundWatcher />
      <Keyboard />
    </Canvas>
  );
}

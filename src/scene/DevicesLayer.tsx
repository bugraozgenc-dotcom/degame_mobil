import { Html } from '@react-three/drei';
import { useFrame, type ThreeEvent } from '@react-three/fiber';
import { useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { EQUIPMENT, isCameraLike, levelMult } from '../game/config/equipment';
import { MOBILE_PLACE, getEngine, useGame } from '../game/store';
import { isFenceOnly } from '../game/config/expo';
import { makeEnv } from '../game/systems/coverage';
import { computeFan, type Env, perimeterSegment, ptzSweepFov } from '../game/systems/vision';
import type { Device, EquipmentType, MapData } from '../game/types';
import { fenceNorth, fenceWorld, nearestWalkable } from '../game/world/grid';
import { ghostBad, ghostOk, noRaycast } from './materials';
import { DeviceModel } from './SecurityEquipment';

// PlacementSystem + CameraCoverageSystem görselleştirmesi

const CONE_COLORS: Record<string, string> = {
  fixedCam: '#39d0ff',
  bulletCam: '#39d0ff',
  ptzCam: '#ffd166',
  thermalCam: '#ff7a2f',
  tower: '#b88cff',
  drone: '#7fe0ff',
};

export function buildFanGeometry(map: MapData, cx: number, cz: number, fan: { a: number; r: number }[], lift = 0.14) {
  const R = 6;
  const n = fan.length;
  const pos = new Float32Array(n * (R + 1) * 3);
  const alpha = new Float32Array(n * (R + 1));
  for (let k = 0; k < n; k++) {
    const { a, r } = fan[k];
    for (let s = 0; s <= R; s++) {
      const d = (r * s) / R;
      const x = cx + Math.cos(a) * d;
      const z = cz + Math.sin(a) * d;
      const i = k * (R + 1) + s;
      pos[i * 3] = x;
      pos[i * 3 + 1] = map.heightAt(x, z) + lift;
      pos[i * 3 + 2] = z;
      alpha[i] = 0.55 + 0.45 * (s / R);
    }
  }
  const idx: number[] = [];
  for (let k = 0; k < n - 1; k++)
    for (let s = 0; s < R; s++) {
      const a = k * (R + 1) + s, b = a + 1, c = a + R + 1, d = c + 1;
      idx.push(a, b, c, b, d, c);
    }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setIndex(idx);
  // kenar çizgisi
  const edge: number[] = [];
  const pushP = (k: number, s: number) => {
    const i = k * (R + 1) + s;
    edge.push(pos[i * 3], pos[i * 3 + 1] + 0.02, pos[i * 3 + 2]);
  };
  const full = Math.abs(fan[n - 1].a - fan[0].a) >= Math.PI * 1.99;
  if (!full) pushP(0, 0);
  for (let k = 0; k < n; k++) pushP(k, R);
  if (!full) pushP(n - 1, 0);
  const eg = new THREE.BufferGeometry();
  eg.setAttribute('position', new THREE.Float32BufferAttribute(edge, 3));
  return { fill: g, edge: eg };
}

function FanMesh({ geom, color, opacity = 0.2, dashed = false }: { geom: { fill: THREE.BufferGeometry; edge: THREE.BufferGeometry }; color: string; opacity?: number; dashed?: boolean }) {
  const lineObj = useMemo(() => {
    const m = dashed ? new THREE.LineDashedMaterial({ color, dashSize: 0.5, gapSize: 0.35, transparent: true, opacity: 0.9 }) : new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.95 });
    const l = new THREE.Line(geom.edge, m);
    if (dashed) l.computeLineDistances();
    l.raycast = () => {};
    return l;
  }, [geom, color, dashed]);
  useEffect(
    () => () => {
      (lineObj.material as THREE.Material).dispose();
    },
    [lineObj]
  );
  useEffect(
    () => () => {
      geom.fill.dispose();
      geom.edge.dispose();
    },
    [geom]
  );
  return (
    <group>
      <mesh geometry={geom.fill} raycast={noRaycast} renderOrder={4}>
        <meshBasicMaterial color={color} transparent opacity={opacity} depthWrite={false} side={THREE.DoubleSide} polygonOffset polygonOffsetFactor={-4} />
      </mesh>
      <primitive object={lineObj} />
    </group>
  );
}

function usePlanEnv(): Env {
  const level = useGame((s) => s.level)!;
  const coverage = useGame((s) => s.coverage);
  return useMemo(() => makeEnv(level.night, level.weather, coverage?.lit ?? new Uint8Array(1)), [level, coverage]);
}

/** Statik kamera konisi (planlama) */
function StaticCone({ d, env, selected }: { d: Device; env: Env; selected: boolean }) {
  const map = useGame((s) => s.map)!;
  const geom = useMemo(() => {
    const fov = d.type === 'ptzCam' ? EQUIPMENT.ptzCam.fov : EQUIPMENT[d.type].fov;
    return buildFanGeometry(map, d.x, d.z, computeFan(map, env, d, d.yaw, fov));
  }, [map, env, d]);
  const geom2 = useMemo(() => (d.yaw2 === undefined ? null : buildFanGeometry(map, d.x, d.z, computeFan(map, env, d, d.yaw2, EQUIPMENT[d.type].fov))), [map, env, d]);
  const sweep = useMemo(() => (d.type === 'ptzCam' ? buildFanGeometry(map, d.x, d.z, computeFan(map, env, d, d.yaw, ptzSweepFov(d)), 0.11) : null), [map, env, d]);
  const col = CONE_COLORS[d.type];
  return (
    <group>
      {sweep && <FanMesh geom={sweep} color={col} opacity={0.07} dashed />}
      <FanMesh geom={geom} color={col} opacity={selected ? 0.32 : 0.2} />
      {geom2 && <FanMesh geom={geom2} color={col} opacity={selected ? 0.32 : 0.2} />}
    </group>
  );
}

/** Simülasyon konisi — PTZ dönüşü ve arıza durumunu yansıtır */
function LiveCone({ d }: { d: Device }) {
  const map = useGame((s) => s.map)!;
  const [geom, setGeom] = useState<ReturnType<typeof buildFanGeometry> | null>(null);
  const [geom2, setGeom2] = useState<ReturnType<typeof buildFanGeometry> | null>(null);
  const last = useRef({ yaw: 999, t: -1, disabled: false, lit: null as unknown });
  const [off, setOff] = useState(false);
  useFrame(() => {
    const e = getEngine();
    if (!e) return;
    const rt = e.runtime(d.id);
    if (!rt) return;
    if (rt.disabled !== last.current.disabled) {
      last.current.disabled = rt.disabled;
      setOff(rt.disabled);
    }
    const yaw = d.type === 'ptzCam' ? rt.yaw : d.yaw;
    const needs = Math.abs(yaw - last.current.yaw) > 0.03 || last.current.lit !== e.env.lit || (e.env.boosts.length > 0 && e.time - last.current.t > 2);
    if (needs && e.time - last.current.t > 0.15) {
      last.current = { ...last.current, yaw, t: e.time, lit: e.env.lit };
      setGeom(buildFanGeometry(map, d.x, d.z, computeFan(map, e.env, d, yaw, EQUIPMENT[d.type].fov)));
      if (d.yaw2 !== undefined) setGeom2(buildFanGeometry(map, d.x, d.z, computeFan(map, e.env, d, d.yaw2, EQUIPMENT[d.type].fov)));
    }
  });
  if (!geom) return null;
  return (
    <>
      <FanMesh geom={geom} color={off ? '#ff3b4e' : CONE_COLORS[d.type]} opacity={off ? 0.06 : 0.18} />
      {geom2 && <FanMesh geom={geom2} color={off ? '#ff3b4e' : CONE_COLORS[d.type]} opacity={off ? 0.06 : 0.18} />}
    </>
  );
}

function RangeRing({ x, z, r, color, opacity = 0.9, fill = 0.06 }: { x: number; z: number; r: number; color: string; opacity?: number; fill?: number }) {
  const map = useGame((s) => s.map)!;
  const geom = useMemo(() => {
    const fan = Array.from({ length: 73 }, (_, k) => ({ a: (k / 72) * Math.PI * 2, r }));
    return buildFanGeometry(map, x, z, fan, 0.12);
  }, [map, x, z, r]);
  void opacity;
  return <FanMesh geom={geom} color={color} opacity={fill} />;
}

function PerimeterLine({ d }: { d: Device }) {
  const map = useGame((s) => s.map)!;
  const obj = useMemo(() => {
    const s = perimeterSegment(map, d);
    const pts: number[] = [];
    for (let k = 0; k <= 24; k++) {
      const x = s.x0 + ((s.x1 - s.x0) * k) / 24;
      const z = s.z0 + ((s.z1 - s.z0) * k) / 24;
      pts.push(x, map.heightAt(x, z) + 1.2, z);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
    const l = new THREE.Line(g, new THREE.LineBasicMaterial({ color: '#c08cff', linewidth: 2 }));
    l.raycast = () => {};
    return l;
  }, [map, d]);
  return <primitive object={obj} />;
}

function PatrolRoute({ d }: { d: Device }) {
  const map = useGame((s) => s.map)!;
  const obj = useMemo(() => {
    const R = 9;
    const lim = fenceWorld(map) - 1.5;
    const cs = [
      [d.x - R, d.z - R],
      [d.x + R, d.z - R],
      [d.x + R, d.z + R],
      [d.x - R, d.z + R],
      [d.x - R, d.z - R],
    ].map(([x, z]) => nearestWalkable(map, Math.max(-lim, Math.min(lim, x)), Math.max(-lim, Math.min(lim, z)), true));
    const pts: number[] = [];
    for (let k = 0; k < cs.length - 1; k++)
      for (let s = 0; s <= 10; s++) {
        const x = cs[k].x + ((cs[k + 1].x - cs[k].x) * s) / 10;
        const z = cs[k].z + ((cs[k + 1].z - cs[k].z) * s) / 10;
        pts.push(x, map.heightAt(x, z) + 0.2, z);
      }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
    const l = new THREE.Line(g, new THREE.LineDashedMaterial({ color: '#4db3ff', dashSize: 0.7, gapSize: 0.5 }));
    l.computeLineDistances();
    l.raycast = () => {};
    return l;
  }, [map, d]);
  return <primitive object={obj} />;
}

export function rangeFor(type: EquipmentType, level: 1 | 2) {
  if (type === 'speaker') return 14 * levelMult(level);
  if (type === 'siren') return 20 * levelMult(level);
  return EQUIPMENT[type].range * levelMult(level);
}

function DeviceView({ d, env }: { d: Device; env: Env }) {
  const map = useGame((s) => s.map)!;
  const phase = useGame((s) => s.phase);
  const selected = useGame((s) => s.selectedDeviceId === d.id);
  const layers = useGame((s) => s.layers);
  const level = useGame((s) => s.level)!;
  const moving = useGame((s) => s.placing?.existingId === d.id);
  const ptzAim = useGame((s) => s.ptzAimId === d.id);
  const y = map.heightAt(d.x, d.z);
  const fp = EQUIPMENT[d.type].footprint;
  const [hover, setHover] = useState(false);

  if (moving) return null;
  const onClick = (e: ThreeEvent<MouseEvent>) => {
    if (e.delta > 6) return;
    const st = useGame.getState();
    if (st.placing) return;
    e.stopPropagation();
    if (st.phase === 'planning') st.selectDevice(d.id);
    else if (st.phase === 'sim' && d.type === 'ptzCam') {
      st.setPtzAim(d.id);
      st.toast(`${d.label}: Haritada hedef noktaya tıklayın`, 'info');
    } else if (st.phase === 'sim') {
      st.toast(`${d.label} — ${EQUIPMENT[d.type].name}`, 'info');
    }
  };
  const getRt = () => getEngine()?.runtime(d.id);
  const camLike = isCameraLike(d.type);
  const showRange = selected || (phase === 'planning' && layers.coverage);
  return (
    <group>
      <group
        position={[d.x, y, d.z]}
        onClick={onClick}
        onPointerOver={(e) => {
          e.stopPropagation();
          setHover(true);
          document.body.style.cursor = 'pointer';
        }}
        onPointerOut={() => {
          setHover(false);
          document.body.style.cursor = '';
        }}
      >
        <DeviceModel
          type={d.type}
          level={d.level}
          yaw={d.yaw}
          yaw2={d.yaw2}
          night={level.night}
          getYaw={phase === 'sim' && d.type === 'ptzCam' ? () => getRt()?.yaw ?? d.yaw : undefined}
          getActive={phase === 'sim' ? () => {
            const e = getEngine();
            const rt = getRt();
            return !!e && !!rt && rt.activeUntil > e.time;
          } : undefined}
          getDisabled={phase === 'sim' ? () => !!getRt()?.disabled : undefined}
          hideVehicle={phase === 'sim'}
        />
        {/* tıklama alanı */}
        <mesh position={[0, EQUIPMENT[d.type].mountHeight / 2, 0]}>
          <boxGeometry args={[Math.max(1, fp), Math.max(1.5, EQUIPMENT[d.type].mountHeight), Math.max(1, fp)]} />
          <meshBasicMaterial transparent opacity={0} depthWrite={false} />
        </mesh>
        {(selected || hover || ptzAim) && (
          <mesh rotation-x={-Math.PI / 2} position={[0, 0.1, 0]} raycast={noRaycast}>
            <ringGeometry args={[fp * 0.62, fp * 0.62 + 0.14, 32]} />
            <meshBasicMaterial color={ptzAim ? '#ffd166' : selected ? '#ffffff' : '#c0263c'} transparent opacity={0.95} depthWrite={false} />
          </mesh>
        )}
        {(selected || hover || ptzAim) && (
          <Html position={[0, EQUIPMENT[d.type].mountHeight + 1.1, 0]} center style={{ pointerEvents: 'none' }} zIndexRange={[20, 0]}>
            <div className="dev-tag">
              {d.label}
              {d.level === 2 && <span className="lvl">★</span>}
            </div>
          </Html>
        )}
      </group>
      {layers.cones && camLike && (phase === 'sim' ? <LiveCone d={d} /> : <StaticCone d={d} env={env} selected={selected} />)}
      {d.type === 'motion' && showRange && <RangeRing x={d.x} z={d.z} r={rangeFor('motion', d.level)} color="#a57bff" fill={0.08} />}
      {d.type === 'perimeter' && (showRange || phase === 'sim') && <PerimeterLine d={d} />}
      {(d.type === 'speaker' || d.type === 'siren' || d.type === 'light') && selected && <RangeRing x={d.x} z={d.z} r={rangeFor(d.type, d.level)} color={d.type === 'siren' ? '#ff4a5a' : d.type === 'light' ? '#ffd48a' : '#7fd3ff'} fill={0.05} />}
      {d.type === 'patrol' && phase === 'planning' && (selected || layers.coverage) && <PatrolRoute d={d} />}
    </group>
  );
}

/** Gece ışık havuzları */
function LightPools({ devices }: { devices: Device[] }) {
  const map = useGame((s) => s.map)!;
  const level = useGame((s) => s.level)!;
  if (!level.night) return null;
  const pools = [
    ...devices.filter((d) => d.type === 'light').map((d) => ({ x: d.x + 0.9, z: d.z, r: EQUIPMENT.light.range * levelMult(d.level), c: '#ffd9a0', o: 0.55 })),
    ...map.buildings.filter((b) => b.kind === 'control' || b.kind === 'trafo').map((b) => ({ x: b.x, z: b.z + b.d / 2 + 1, r: 4.5, c: '#ffd9a0', o: 0.4 })),
    ...map.gates.filter((g) => g.main).map((g) => ({ x: g.x, z: g.z, r: 5, c: '#ffd9a0', o: 0.45 })),
  ];
  return (
    <>
      {pools.map((p, k) => (
        <LightPool key={k} {...p} y={map.heightAt(p.x, p.z)} />
      ))}
    </>
  );
}
function LightPool({ x, y, z, r, c, o }: { x: number; y: number; z: number; r: number; c: string; o: number }) {
  return (
    <mesh position={[x, y + 0.18, z]} rotation-x={-Math.PI / 2} raycast={noRaycast} renderOrder={5}>
      <circleGeometry args={[r * 1.15, 40]} />
      <meshBasicMaterial color={c} transparent opacity={o} depthWrite={false} blending={THREE.AdditiveBlending} map={glowMap()} />
    </mesh>
  );
}
let _glow: THREE.Texture | null = null;
function glowMap() {
  if (_glow) return _glow;
  const cnv = document.createElement('canvas');
  cnv.width = cnv.height = 128;
  const g = cnv.getContext('2d')!;
  const grd = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  grd.addColorStop(0, 'rgba(255,255,255,0.9)');
  grd.addColorStop(0.6, 'rgba(255,255,255,0.45)');
  grd.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grd;
  g.fillRect(0, 0, 128, 128);
  _glow = new THREE.CanvasTexture(cnv);
  return _glow;
}

/** Projektör takviyesi (simülasyon) */
function BoostPools() {
  const map = useGame((s) => s.map)!;
  useGame((s) => s.simTick);
  const e = getEngine();
  if (!e || !e.level.night) return null;
  return (
    <>
      {e.env.boosts.map((b, k) => (
        <LightPool key={k} x={b.x} y={map.heightAt(b.x, b.z)} z={b.z} r={b.r} c="#fff4d6" o={0.5} />
      ))}
    </>
  );
}

export function DevicesLayer() {
  const devices = useGame((s) => s.devices);
  const env = usePlanEnv();
  return (
    <group>
      {devices.map((d) => (
        <DeviceView key={d.id} d={d} env={env} />
      ))}
      <LightPools devices={devices} />
      <BoostPools />
    </group>
  );
}

/** Yerleştirme hologramı */
export /** mobil: yerleştirme sırasında çit hattını parlayan çizgiyle göster (bullet kamera buraya konur) */
function FenceGuide({ map }: { map: MapData }) {
  const ref = useRef<THREE.Group>(null);
  const L = fenceWorld(map);
  const zN = fenceNorth(map);
  const y = 0.9;
  const w = 0.9;
  useFrame(({ clock }) => {
    const g = ref.current;
    if (!g) return;
    const k = 0.6 + 0.35 * (0.5 + 0.5 * Math.sin(clock.elapsedTime * 3));
    g.traverse((o) => {
      const m = (o as THREE.Mesh).material as THREE.MeshBasicMaterial | undefined;
      if (m && 'opacity' in m) m.opacity = k;
    });
  });
  const segs: [number, number, number, number][] = [
    [-L, zN, L, zN],
    [-L, L, L, L],
    [-L, zN, -L, L],
    [L, zN, L, L],
  ];
  return (
    <group ref={ref}>
      {segs.map(([x0, z0, x1, z1], i) => {
        const len = Math.hypot(x1 - x0, z1 - z0);
        const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
        const h = map.heightAt(cx, cz);
        return (
          <mesh key={i} position={[cx, h + y, cz]} rotation-y={x0 === x1 ? Math.PI / 2 : 0} raycast={noRaycast}>
            <boxGeometry args={[len, 0.25, w]} />
            <meshBasicMaterial color="#2bff86" transparent opacity={0.6} depthWrite={false} />
          </mesh>
        );
      })}
    </group>
  );
}

export function PlacementGhost() {
  const placing = useGame((s) => s.placing);
  const map = useGame((s) => s.map)!;
  const env = usePlanEnv();
  const level = useGame((s) => s.level)!;
  const ghostDev = useMemo<Device | null>(() => {
    if (!placing || !placing.hasHover) return null;
    return { id: 'ghost', label: '', type: placing.type, i: placing.i, j: placing.j, x: placing.x, z: placing.z, yaw: placing.yaw, yaw2: placing.stage === 'position' ? placing.yaw2 : undefined, level: 1 };
  }, [placing]);
  const fan = useMemo(() => {
    if (!ghostDev || !isCameraLike(ghostDev.type)) return null;
    const fov = EQUIPMENT[ghostDev.type].fov;
    return buildFanGeometry(map, ghostDev.x, ghostDev.z, computeFan(map, env, ghostDev, ghostDev.yaw, fov), 0.16);
  }, [ghostDev, map, env]);
  const fan2 = useMemo(() => {
    if (!ghostDev || ghostDev.yaw2 === undefined) return null;
    return buildFanGeometry(map, ghostDev.x, ghostDev.z, computeFan(map, env, ghostDev, ghostDev.yaw2, EQUIPMENT[ghostDev.type].fov), 0.16);
  }, [ghostDev, map, env]);
  if (!placing || !ghostDev) return null;
  const fp = EQUIPMENT[placing.type].footprint;
  const ok = placing.valid;
  const y = map.heightAt(placing.x, placing.z);
  return (
    <group>
      <group position={[placing.x, y, placing.z]}>
        <DeviceModel type={placing.type} level={1} yaw={placing.yaw} yaw2={ghostDev.yaw2} ghost={ok ? ghostOk : ghostBad} night={level.night} />
        <mesh rotation-x={-Math.PI / 2} position={[0, 0.15, 0]} raycast={noRaycast}>
          <planeGeometry args={[fp, fp]} />
          <meshBasicMaterial color={ok ? '#2bff86' : '#ff2b45'} transparent opacity={0.45} depthWrite={false} />
        </mesh>
        <mesh rotation-x={-Math.PI / 2} position={[0, 0.16, 0]} raycast={noRaycast}>
          <ringGeometry args={[fp * 0.7 - 0.06, fp * 0.7 + 0.06, 4, 1, Math.PI / 4]} />
          <meshBasicMaterial color={ok ? '#2bff86' : '#ff2b45'} transparent opacity={0.9} depthWrite={false} />
        </mesh>
        {MOBILE_PLACE && (
          <mesh rotation-x={-Math.PI / 2} position={[0, 0.17, 0]} raycast={noRaycast}>
            <ringGeometry args={[2.4, 3.1, 48]} />
            <meshBasicMaterial color={ok ? '#2bff86' : '#ff2b45'} transparent opacity={0.85} depthWrite={false} />
          </mesh>
        )}
        {placing.stage === 'aim' && (
          <group rotation-y={-placing.yaw}>
            <mesh position={[2.2, 0.3, 0]} rotation-z={-Math.PI / 2} raycast={noRaycast}>
              <coneGeometry args={[0.35, 0.8, 3]} />
              <meshBasicMaterial color="#ffffff" />
            </mesh>
          </group>
        )}
        <Html position={[0, EQUIPMENT[placing.type].mountHeight + 1.2, 0]} center style={{ pointerEvents: 'none' }} zIndexRange={[30, 0]}>
          <div className={`ghost-tag ${ok ? 'ok' : 'bad'}`}>
            {placing.stage === 'aim' ? 'Yönü fareyle seç · tıkla' : ok ? `${EQUIPMENT[placing.type].name} · ${EQUIPMENT[placing.type].cost.toLocaleString('tr-TR')}` : placing.reason || 'Geçersiz konum'}
          </div>
        </Html>
      </group>
      {MOBILE_PLACE && isFenceOnly(placing.type) && <FenceGuide map={map} />}
      {fan && <FanMesh geom={fan} color={ok ? CONE_COLORS[placing.type] : '#ff2b45'} opacity={0.26} />}
      {fan2 && <FanMesh geom={fan2} color={ok ? CONE_COLORS[placing.type] : '#ff2b45'} opacity={0.26} />}
      {!isCameraLike(placing.type) && ['motion', 'speaker', 'siren', 'light'].includes(placing.type) && (
        <RangeRing x={placing.x} z={placing.z} r={rangeFor(placing.type, 1)} color={ok ? '#2bff86' : '#ff2b45'} fill={0.07} />
      )}
      {placing.type === 'perimeter' && ok && <PerimeterLine d={ghostDev} />}
      {placing.type === 'patrol' && ok && <PatrolRoute d={ghostDev} />}
    </group>
  );
}

import { Html } from '@react-three/drei';
import { useFrame, type ThreeEvent } from '@react-three/fiber';
import { useMemo, useRef } from 'react';
import * as THREE from 'three';
import { EQUIPMENT, levelMult } from '../game/config/equipment';
import { getEngine, useGame } from '../game/store';
import type { Incident, NPC, Responder } from '../game/systems/entities';
import { isLit } from '../game/systems/vision';
import { Animal, Humanoid, type RigHandle, thiefLook } from './Characters';
import { glowTexture, noRaycast } from './materials';
import { PatrolTruck } from './SecurityEquipment';
import { JandarmaView } from './Jandarma';
import { GetawayView } from './Getaway';
import { Reel } from './CableReels';

// Simülasyon görselleri: NPC'ler, devriyeler, olay işaretleri, ipuçları, efektler

const CLASS_COLOR: Record<string, string> = {
  insan: '#ff3b4e',
  hayvan: '#ffb020',
  personel: '#39e07a',
  arac: '#6fb7ff',
  yanlis: '#a0a4ab',
};

function animateRig(rig: RigHandle | null, t: number, walking: boolean, speed: number, crouch: boolean, quad: boolean, crawl = false, dt = 0.016) {
  if (!rig) return;
  const k = 1 - Math.exp(-dt * 12); // kare hızından bağımsız yumuşatma
  const running = !quad && !crawl && speed > 3.2;
  const amp = quad ? 0.6 : running ? 1.0 : crawl ? 0.35 : 0.55;
  const sw = walking ? Math.sin(t * (quad ? 9 : crawl ? 5 : 7) * Math.max(0.7, speed / 2)) * amp : 0;
  if (quad) {
    rig.legs.forEach((l, k) => l && (l.rotation.z = (k === 0 || k === 3 ? 1 : -1) * sw));
    if (rig.tail) rig.tail.rotation.x = Math.sin(t * 8) * 0.4;
  } else if (crawl) {
    // dört ayak üstünde sürünme: gövde yatay, kollar yere
    if (rig.legs[0]) rig.legs[0].rotation.z = 0.25 + sw;
    if (rig.legs[1]) rig.legs[1].rotation.z = 0.25 - sw;
    if (rig.arms[0]) rig.arms[0].rotation.z = 1.25 - sw;
    if (rig.arms[1]) rig.arms[1].rotation.z = 1.25 + sw;
  } else {
    if (rig.legs[0]) rig.legs[0].rotation.z = sw;
    if (rig.legs[1]) rig.legs[1].rotation.z = -sw;
    if (rig.arms[0]) rig.arms[0].rotation.z = -sw * 0.8;
    if (rig.arms[1]) rig.arms[1].rotation.z = sw * 0.8;
  }
  if (rig.body) {
    const tilt = crawl ? -1.25 : running ? -0.28 : 0;
    rig.body.rotation.z += (tilt - rig.body.rotation.z) * k;
    const target = crouch && !crawl ? 0.68 : 1;
    rig.body.scale.y += (target - rig.body.scale.y) * k;
    const bob = walking ? Math.abs(Math.sin(t * (running ? 11 : 7))) * (running ? 0.09 : 0.04) : 0;
    rig.body.position.y = crawl ? 0.42 + bob * 0.5 : bob;
  }
}

/** Bina / ağaç arkasında kalan karakterin silueti (yalnızca örtülü olduğu yerde çizilir) */
function occluderMaterial(color: string, opacity: number) {
  return new THREE.MeshBasicMaterial({ color, transparent: true, opacity, depthWrite: false, depthFunc: THREE.GreaterDepth });
}

const _w = new THREE.Vector3();
const _d = new THREE.Vector3();
/** Silueti kameraya doğru öne alır: karakterin kendi gövdesi onu örtmez, yalnızca araya giren bina/ağaç örter */
function placeGhost(g: THREE.Object3D, ghost: THREE.Object3D | null, camera: THREE.Camera, h: number) {
  if (!ghost) return;
  g.updateMatrixWorld();
  _w.set(g.position.x, g.position.y + h, g.position.z);
  _d.copy(camera.position).sub(_w).normalize().multiplyScalar(0.75);
  _w.add(_d);
  ghost.position.copy(g.worldToLocal(_w));
}

function setOpacity(mats: THREE.MeshStandardMaterial[], v: number) {
  const tr = v < 0.999;
  for (const m of mats) {
    if (m.transparent !== tr) {
      m.transparent = tr;
      m.needsUpdate = true;
    }
    m.opacity = v;
    m.depthWrite = !tr || v > 0.5;
  }
}

function NPCView({ npc }: { npc: NPC }) {
  const group = useRef<THREE.Group>(null);
  const rig = useRef<RigHandle>(null);
  const marker = useRef<THREE.Group>(null);
  const markerMat = useMemo(() => new THREE.MeshBasicMaterial({ color: '#ff3b4e', transparent: true, opacity: 0.85, depthWrite: false }), []);
  const flash = useRef<THREE.Group>(null);
  const carry = useRef<THREE.Group>(null);
  const boat = useRef<THREE.Group>(null);
  const vis = useRef(0);
  const ghost = useRef<THREE.Mesh>(null);
  const map = useGame((s) => s.map)!;
  const level = useGame((s) => s.level)!;
  const look = useMemo(() => (npc.kind === 'thief' ? thiefLook(npc.variant, npc.look) : undefined), [npc]);
  const ghostMat = useMemo(() => occluderMaterial(npc.kind === 'staff' ? '#ffb15a' : npc.kind === 'animal' || npc.variant === 'pelt' ? '#ffe2a6' : '#ffffff', 0.4), [npc.kind, npc.variant]);

  useFrame(({ camera, clock }, delta) => {
    const e = getEngine();
    const g = group.current;
    if (!e || !g) return;
    if (!npc.active) {
      g.visible = false;
      return;
    }
    g.visible = true;
    const y = map.heightAt(npc.x, npc.z) + npc.yOff; // tekne / baraj tepesi: zemin üstü ek yükseklik
    g.position.set(npc.x, y, npc.z);
    g.rotation.y = -npc.yaw;
    if (boat.current) {
      boat.current.visible = npc.onWater;
      if (npc.onWater) boat.current.rotation.z = Math.sin(clock.elapsedTime * 2.2 + npc.spawnedAt) * 0.04;
    }
    // ağaç kılıklı hırsız dururken hafifçe salınır (rüzgârdaki ağaç gibi)
    g.rotation.z = npc.variant === 'tree' && !npc.fleeing && !npc.treeMoving ? Math.sin(clock.elapsedTime * 1.3 + npc.spawnedAt) * 0.04 : 0;
    const crawling = npc.variant === 'crawler' && npc.crouch;
    animateRig(rig.current, clock.elapsedTime + npc.spawnedAt, npc.walking, npc.speed, npc.crouch, npc.kind === 'animal' || (npc.variant === 'pelt' && !npc.fleeing), crawling, delta);

    const inc = npc.incidentId ? e.incident(npc.incidentId) : null;
    const tracked = !!inc && inc.status !== 'resolved' && inc.tracking;
    // çıplak göz görünürlüğü: kamera mesafesi + ışık + hava
    const d = camera.position.distanceTo(g.position);
    const lit = isLit(e.env, map, npc.x, npc.z) || npc.flashUntil > e.time;
    const fairMode = useGame.getState().fair;
    let near = 50, far = 86;
    if (level.night) {
      near = lit ? 44 : 30;
      far = lit ? 74 : 54;
    }
    if (level.weather === 'fog') {
      near *= 0.82;
      far *= 0.82;
    }
    let v = d <= near ? 1 : d >= far ? 0 : 1 - (d - near) / (far - near);
    if (npc.kind === 'animal') v *= 0.95;
    g.scale.setScalar(fairMode ? 1.5 : 1); // fuarda uzak kamerada da okunabilsin
    if (tracked || fairMode) v = 1; // fuar modunda karakterler her zaman görünür; sistem yine de kör noktadakini algılamaz
    vis.current = v;
    if (rig.current) setOpacity(rig.current.mats, v);
    // ağaç kılığındayken içindeki silüet belli olmasın
    ghostMat.opacity = npc.variant === 'tree' && !npc.fleeing && npc.state !== 'arrested' && npc.state !== 'held' ? 0 : 0.42 * v;
    placeGhost(g, ghost.current, camera, npc.kind === 'animal' ? 0.55 : 1.0);
    g.visible = v > 0.02;

    if (marker.current) {
      marker.current.visible = tracked;
      if (tracked) {
        const pulse = 1 + Math.sin(clock.elapsedTime * 5) * 0.12;
        marker.current.scale.setScalar(pulse);
        markerMat.color.set(inc!.playerClass ? CLASS_COLOR[inc!.playerClass] : inc!.suggestion ? CLASS_COLOR[inc!.suggestion.label] : '#ff3b4e');
        const sel = useGame.getState().selectedIncidentId === inc!.id;
        markerMat.opacity = sel ? 1 : 0.8;
      }
    }
    if (carry.current) carry.current.visible = npc.loot > 0;
    if (flash.current) flash.current.visible = level.night && (npc.flashUntil > e.time || (npc.state === 'stealing' && npc.hasFlashlight && Math.sin(e.time * 2.3 + npc.spawnedAt) > 0.85));
  });

  const onClick = (ev: ThreeEvent<MouseEvent>) => {
    if (vis.current < 0.3) return;
    ev.stopPropagation();
    if (useGame.getState().placing) return;
    useGame.getState().markNpc(npc.id);
  };

  // post giymiş hırsız kaçarken postu atar ve insan olarak koşar
  const peltOn = npc.variant === 'pelt' && !npc.fleeing;
  const isHuman = npc.kind !== 'animal' && !peltOn;
  // ağaç kılıklı hırsız: kaçana kadar üstünde dal-yaprak kılığı taşır
  const treeOn = npc.variant === 'tree' && !npc.fleeing && npc.state !== 'arrested' && npc.state !== 'held';
  return (
    <group ref={group}>
      {npc.boat && (
        <group ref={boat} visible={false}>
          {/* küçük kayık: gövde, oturak, iki kürek */}
          <mesh position={[0, 0.12, 0]} castShadow material={boatHull}>
            <boxGeometry args={[2.4, 0.42, 1.0]} />
          </mesh>
          <mesh position={[1.35, 0.14, 0]} rotation-y={Math.PI / 4} material={boatHull}>
            <boxGeometry args={[0.7, 0.4, 0.7]} />
          </mesh>
          <mesh position={[0, 0.36, 0]} material={boatSeat}>
            <boxGeometry args={[2.1, 0.06, 0.8]} />
          </mesh>
          <mesh position={[0.1, 0.6, 0.75]} rotation-x={0.6} material={boatOar}>
            <boxGeometry args={[0.06, 0.06, 1.6]} />
          </mesh>
          <mesh position={[0.1, 0.6, -0.75]} rotation-x={-0.6} material={boatOar}>
            <boxGeometry args={[0.06, 0.06, 1.6]} />
          </mesh>
        </group>
      )}
      {treeOn && <TreeDisguise seed={npc.look} />}
      {isHuman ? <Humanoid ref={rig} variant={npc.kind === 'staff' ? 'staff' : 'thief'} look={look} /> : <Animal ref={rig} sub={peltOn ? (npc.look % 2 ? 'sheep' : 'boar') : npc.sub} pelt={peltOn} />}
      <mesh rotation-x={-Math.PI / 2} position={[0, 0.04, 0]} raycast={noRaycast} renderOrder={1}>
        <circleGeometry args={[isHuman ? 0.42 : 0.5, 16]} />
        <meshBasicMaterial color="#000000" transparent opacity={0.32} depthWrite={false} />
      </mesh>
      <mesh ref={ghost} position={[0, isHuman ? 1.0 : 0.55, 0]} material={ghostMat} renderOrder={20} raycast={noRaycast}>
        {isHuman ? <capsuleGeometry args={[0.26, 1.0, 4, 10]} /> : <capsuleGeometry args={[0.3, 0.5, 4, 8]} />}
      </mesh>
      <mesh position={[0, 0.9, 0]} onClick={onClick} onPointerOver={() => (document.body.style.cursor = 'pointer')} onPointerOut={() => (document.body.style.cursor = '')}>
        <cylinderGeometry args={[0.9, 0.9, 2.0, 8]} />
        <meshBasicMaterial transparent opacity={0} depthWrite={false} />
      </mesh>
      <group ref={marker} visible={false}>
        <mesh rotation-x={-Math.PI / 2} position={[0, 0.06, 0]} material={markerMat} raycast={noRaycast}>
          <ringGeometry args={[0.85, 1.1, 28]} />
        </mesh>
        <mesh position={[0, 2.6, 0]} rotation-z={Math.PI} material={markerMat} raycast={noRaycast}>
          <coneGeometry args={[0.22, 0.45, 4]} />
        </mesh>
      </group>
      {/* çalınan makara: sırtında taşır */}
      <group ref={carry} visible={false} position={[isHuman ? -0.42 : -0.3, isHuman ? 0.55 : 0.35, 0]}>
        <Reel scale={0.62} />
      </group>
      <group ref={flash} visible={false} position={[0.35, 1.2, 0.15]}>
        <mesh rotation-z={Math.PI / 2 + 0.35} position={[1.6, -0.5, 0]} raycast={noRaycast}>
          <coneGeometry args={[0.9, 3.2, 14, 1, true]} />
          <meshBasicMaterial color="#fff1b0" transparent opacity={0.28} depthWrite={false} blending={THREE.AdditiveBlending} side={THREE.DoubleSide} />
        </mesh>
        <mesh position={[3.0, -1.15, 0]} rotation-x={-Math.PI / 2} raycast={noRaycast}>
          <circleGeometry args={[1.1, 16]} />
          <meshBasicMaterial map={glowTexture()} color="#fff1b0" transparent opacity={0.7} depthWrite={false} blending={THREE.AdditiveBlending} />
        </mesh>
      </group>
    </group>
  );
}

const boatHull = new THREE.MeshStandardMaterial({ color: '#5a3d26', flatShading: true, roughness: 0.85 });
const boatSeat = new THREE.MeshStandardMaterial({ color: '#8a6a45', flatShading: true, roughness: 0.9 });
const boatOar = new THREE.MeshStandardMaterial({ color: '#c9b08a', roughness: 0.9 });

/** Ağaç kılığı: gövdeye sarılı dallar ve üç kat yaprak konisi; bacaklar alttan görünür (keskin göz fark eder) */
const treeFoliage = new THREE.MeshStandardMaterial({ color: '#3f8a35', flatShading: true, roughness: 0.9 });
const treeFoliage2 = new THREE.MeshStandardMaterial({ color: '#2f6b2a', flatShading: true, roughness: 0.9 });
const treeBark = new THREE.MeshStandardMaterial({ color: '#6b4a2e', flatShading: true, roughness: 0.95 });
function TreeDisguise({ seed }: { seed: number }) {
  const ry = (seed % 7) * 0.9;
  return (
    <group rotation-y={ry} raycast={noRaycast}>
      <mesh position={[0, 1.05, 0]} material={treeBark} castShadow>
        <cylinderGeometry args={[0.3, 0.36, 1.1, 7]} />
      </mesh>
      <mesh position={[0, 1.35, 0]} material={treeFoliage} castShadow>
        <coneGeometry args={[0.95, 1.1, 7]} />
      </mesh>
      <mesh position={[0, 1.95, 0]} material={treeFoliage2} castShadow>
        <coneGeometry args={[0.72, 1.0, 7]} />
      </mesh>
      <mesh position={[0, 2.5, 0]} material={treeFoliage} castShadow>
        <coneGeometry args={[0.45, 0.8, 7]} />
      </mesh>
      {/* dallar */}
      {[0.4, 2.2, 4.1].map((a, k) => (
        <mesh key={k} position={[Math.cos(a) * 0.5, 1.5 + k * 0.25, Math.sin(a) * 0.5]} rotation={[0, -a, 0.9]} material={treeBark}>
          <cylinderGeometry args={[0.03, 0.05, 0.7, 5]} />
        </mesh>
      ))}
    </group>
  );
}

function ResponderView({ r }: { r: Responder }) {
  const group = useRef<THREE.Group>(null);
  const rig = useRef<RigHandle>(null);
  const torch = useRef<THREE.Group>(null);
  const map = useGame((s) => s.map)!;
  const level = useGame((s) => s.level)!;
  const lineGeom = useMemo(() => new THREE.BufferGeometry(), []);
  const guardGhost = useMemo(() => occluderMaterial('#4db3ff', 0.45), []);
  const gGhost = useRef<THREE.Mesh>(null);
  const lineMat = useMemo(() => new THREE.LineDashedMaterial({ color: '#4db3ff', dashSize: 0.6, gapSize: 0.4, transparent: true, opacity: 0.9 }), []);
  const lineObj = useMemo(() => {
    const l = new THREE.Line(lineGeom, lineMat);
    l.raycast = () => {};
    l.frustumCulled = false;
    return l;
  }, [lineGeom, lineMat]);

  useFrame(({ clock, camera }) => {
    const g = group.current;
    if (!g) return;
    g.position.set(r.x, map.heightAt(r.x, r.z), r.z);
    g.rotation.y = -r.yaw;
    g.scale.setScalar(useGame.getState().fair && r.kind === 'guard' ? 1.5 : 1);
    placeGhost(g, gGhost.current, camera, r.kind === 'guard' ? 1.0 : 0.8);
    if (r.kind === 'guard') animateRig(rig.current, clock.elapsedTime, r.walking, r.speed, false, false);
    if (torch.current) torch.current.visible = level.night;
    // sevk rotası
    const L = lineObj;
    if (L) {
      const show = r.state === 'dispatch' || r.state === 'chase' || r.state === 'return';
      L.visible = show && r.pi < r.path.length;
      if (L.visible) {
        const pts: number[] = [r.x, map.heightAt(r.x, r.z) + 0.3, r.z];
        for (let k = r.pi; k < r.path.length; k++) pts.push(r.path[k].x, map.heightAt(r.path[k].x, r.path[k].z) + 0.3, r.path[k].z);
        lineGeom.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
        lineGeom.computeBoundingSphere();
        L.computeLineDistances();
        lineMat.color.set(r.state === 'return' ? '#7d8fa3' : r.state === 'chase' ? '#ff5a6a' : '#4db3ff');
      }
    }
  });

  return (
    <>
      <group ref={group}>
        {r.kind === 'guard' ? <Humanoid ref={rig} variant="guard" /> : <PatrolTruck night={level.night} getSiren={() => r.state === 'dispatch' || r.state === 'chase'} />}
        <mesh ref={gGhost} position={[0, 1.0, 0]} material={guardGhost} renderOrder={20} raycast={noRaycast}>
          {r.kind === 'guard' ? <capsuleGeometry args={[0.26, 1.0, 4, 10]} /> : <boxGeometry args={[2.4, 1.4, 1.2]} />}
        </mesh>
        <mesh rotation-x={-Math.PI / 2} position={[0, 0.05, 0]} raycast={noRaycast}>
          <ringGeometry args={[r.kind === 'guard' ? 0.6 : 1.6, r.kind === 'guard' ? 0.78 : 1.8, 24]} />
          <meshBasicMaterial color="#3aa0ff" transparent opacity={0.85} depthWrite={false} />
        </mesh>
        {r.kind === 'guard' && (
          <group ref={torch} position={[0.3, 1.2, -0.25]}>
            <mesh position={[1.5, -0.5, 0]} rotation-z={Math.PI / 2 + 0.33} raycast={noRaycast}>
              <coneGeometry args={[0.8, 3.0, 12, 1, true]} />
              <meshBasicMaterial color="#e8f4ff" transparent opacity={0.18} depthWrite={false} blending={THREE.AdditiveBlending} side={THREE.DoubleSide} />
            </mesh>
          </group>
        )}
        <Html position={[0, r.kind === 'guard' ? 2.4 : 2.3, 0]} center style={{ pointerEvents: 'none' }} zIndexRange={[10, 0]}>
          <div className="unit-tag">{r.label}</div>
        </Html>
      </group>
      <primitive object={lineObj} />
    </>
  );
}

function IncidentMarker({ inc }: { inc: Incident }) {
  const g = useRef<THREE.Group>(null);
  const area = useRef<THREE.Mesh>(null);
  const areaMat = useMemo(() => new THREE.MeshBasicMaterial({ color: '#ffb020', transparent: true, opacity: 0.22, depthWrite: false, side: THREE.DoubleSide }), []);
  const pinMat = useMemo(() => new THREE.MeshBasicMaterial({ color: '#ffb020' }), []);
  const map = useGame((s) => s.map)!;
  const tag = useRef<HTMLDivElement>(null);
  useFrame(({ clock }) => {
    if (!g.current) return;
    g.current.position.set(inc.x, map.heightAt(inc.x, inc.z), inc.z);
    const sel = useGame.getState().selectedIncidentId === inc.id;
    const t = clock.elapsedTime;
    const unverified = !inc.verified;
    const lost = inc.verified && !inc.tracking && inc.kind !== 'tech';
    const col = inc.kind === 'tech' ? '#ff8a1f' : unverified ? '#ffb020' : lost ? '#9aa3ad' : '#ff3b4e';
    areaMat.color.set(col);
    pinMat.color.set(sel ? '#ffffff' : col);
    if (area.current) {
      const s = unverified ? inc.radius * (1 + Math.sin(t * 3) * 0.06) : lost ? 2.2 : 0.001;
      area.current.scale.set(s, s, s);
      area.current.visible = unverified || lost;
      areaMat.opacity = unverified ? 0.2 + Math.sin(t * 3) * 0.06 : 0.25;
    }
    // izlenen (tracking) olaylarda pin NPC marker'ı tarafından çizilir
    g.current.visible = !(inc.tracking && inc.npcId) || inc.kind === 'tech';
    // drei <Html> grup görünmezliğini izlemez: etiketi ayrıca gizle (aksi halde NPC etiketiyle çift "#1" görünür)
    if (tag.current) tag.current.style.display = g.current.visible ? '' : 'none';
  });
  const onClick = (ev: ThreeEvent<MouseEvent>) => {
    ev.stopPropagation();
    useGame.getState().selectIncident(inc.id);
  };
  return (
    <group ref={g}>
      <mesh ref={area} rotation-x={-Math.PI / 2} position={[0, 0.12, 0]} material={areaMat} raycast={noRaycast}>
        <ringGeometry args={[0.9, 1, 40]} />
      </mesh>
      <mesh ref={undefined} rotation-x={-Math.PI / 2} position={[0, 0.1, 0]} raycast={noRaycast} visible={!inc.verified}>
        <circleGeometry args={[inc.radius, 40]} />
        <meshBasicMaterial color="#ffb020" transparent opacity={0.08} depthWrite={false} />
      </mesh>
      <group position={[0, 3.2, 0]} onClick={onClick}>
        <mesh material={pinMat}>
          <octahedronGeometry args={[0.38, 0]} />
        </mesh>
        <mesh position={[0, -0.9, 0]} material={pinMat} raycast={noRaycast}>
          <cylinderGeometry args={[0.04, 0.04, 1.4, 6]} />
        </mesh>
      </group>
      <Html position={[0, 4.1, 0]} center style={{ pointerEvents: 'none' }} zIndexRange={[10, 0]}>
        <div ref={tag} className={`inc-tag ${inc.kind === 'tech' ? 'tech' : inc.verified ? 'ver' : 'unv'}`}>#{inc.seq}{!inc.verified ? ' ?' : ''}</div>
      </Html>
    </group>
  );
}

function TrackedLabels() {
  // izlenen olaylar için NPC üstü etiket
  useGame((s) => s.simTick);
  const e = getEngine();
  if (!e) return null;
  return (
    <>
      {e.incidents
        .filter((i) => i.status !== 'resolved' && i.tracking && i.npcId)
        .map((i) => (
          <TrackedTag key={i.id} inc={i} />
        ))}
    </>
  );
}
function TrackedTag({ inc }: { inc: Incident }) {
  const g = useRef<THREE.Group>(null);
  const map = useGame((s) => s.map)!;
  useFrame(() => {
    if (g.current) g.current.position.set(inc.x, map.heightAt(inc.x, inc.z) + 3.3, inc.z);
  });
  return (
    <group ref={g}>
      <Html center style={{ pointerEvents: 'auto' }} zIndexRange={[10, 0]}>
        <div className="inc-tag ver clickable" onClick={() => useGame.getState().selectIncident(inc.id)}>
          #{inc.seq}
        </div>
      </Html>
    </group>
  );
}

function Hints() {
  const pool = useRef<(THREE.Group | null)[]>([]);
  const map = useGame((s) => s.map)!;
  useFrame(({ clock }) => {
    const e = getEngine();
    const hints = e ? e.hints : [];
    for (let k = 0; k < pool.current.length; k++) {
      const g = pool.current[k];
      if (!g) continue;
      const h = hints[k];
      if (!h) {
        g.visible = false;
        continue;
      }
      g.visible = true;
      g.position.set(h.x, map.heightAt(h.x, h.z), h.z);
      const life = (e!.time - h.t) / (h.until - h.t);
      const [beam, leaves, sil] = g.children as THREE.Object3D[];
      beam.visible = h.type === 'flashlight';
      leaves.visible = h.type === 'rustle';
      sil.visible = h.type === 'silhouette';
      if (beam.visible) {
        beam.rotation.y = h.yaw + Math.sin(clock.elapsedTime * 6) * 0.4;
        ((beam.children[0] as THREE.Mesh).material as THREE.MeshBasicMaterial).opacity = (Math.sin(life * Math.PI)) * 0.35 * (Math.random() > 0.2 ? 1 : 0.3);
      }
      if (leaves.visible) {
        leaves.children.forEach((c, i) => {
          c.position.set(Math.sin(i * 2.1) * (0.3 + life), 0.4 + life * 1.2 + Math.sin(clock.elapsedTime * 10 + i) * 0.1, Math.cos(i * 2.1) * (0.3 + life));
          c.rotation.set(life * 6 + i, life * 4, 0);
        });
      }
      if (sil.visible) ((sil.children[0] as THREE.Mesh).material as THREE.MeshBasicMaterial).opacity = Math.sin(life * Math.PI) * 0.35;
    }
  });
  return (
    <>
      {Array.from({ length: 10 }).map((_, k) => (
        <group key={k} ref={(el) => (pool.current[k] = el)} visible={false}>
          <group position={[0, 1.2, 0]}>
            <mesh rotation-z={Math.PI / 2 + 0.4} position={[1.6, -0.5, 0]} raycast={noRaycast}>
              <coneGeometry args={[0.9, 3.4, 12, 1, true]} />
              <meshBasicMaterial color="#fff3b8" transparent opacity={0.3} depthWrite={false} blending={THREE.AdditiveBlending} side={THREE.DoubleSide} />
            </mesh>
          </group>
          <group>
            {Array.from({ length: 6 }).map((__, i) => (
              <mesh key={i} raycast={noRaycast}>
                <planeGeometry args={[0.16, 0.1]} />
                <meshBasicMaterial color="#3f8f2a" side={THREE.DoubleSide} />
              </mesh>
            ))}
          </group>
          <group>
            <mesh position={[0, 0.9, 0]} raycast={noRaycast}>
              <capsuleGeometry args={[0.22, 1.1, 4, 8]} />
              <meshBasicMaterial color="#0b0d12" transparent opacity={0.3} depthWrite={false} />
            </mesh>
          </group>
        </group>
      ))}
    </>
  );
}

/** Siren / hoparlör dalgaları */
function DeviceWaves() {
  const pool = useRef<(THREE.Mesh | null)[]>([]);
  const map = useGame((s) => s.map)!;
  useFrame(({ clock }) => {
    const e = getEngine();
    const act = e ? e.devices.filter((d) => d.activeUntil > e.time && (d.dev.type === 'siren' || d.dev.type === 'speaker')) : [];
    for (let k = 0; k < pool.current.length; k++) {
      const m = pool.current[k];
      if (!m) continue;
      const d = act[Math.floor(k / 2)];
      if (!d) {
        m.visible = false;
        continue;
      }
      m.visible = true;
      const R = EQUIPMENT[d.dev.type].range * levelMult(d.dev.level);
      const ph = ((clock.elapsedTime * 0.8 + (k % 2) * 0.5) % 1);
      m.position.set(d.dev.x, map.heightAt(d.dev.x, d.dev.z) + 0.2, d.dev.z);
      m.scale.setScalar(Math.max(0.01, ph * R));
      const mm = m.material as THREE.MeshBasicMaterial;
      mm.color.set(d.dev.type === 'siren' ? '#ff2a3a' : '#7fd3ff');
      mm.opacity = (1 - ph) * 0.55;
    }
  });
  return (
    <>
      {Array.from({ length: 12 }).map((_, k) => (
        <mesh key={k} ref={(el) => (pool.current[k] = el)} rotation-x={-Math.PI / 2} visible={false} raycast={noRaycast}>
          <ringGeometry args={[0.94, 1, 48]} />
          <meshBasicMaterial transparent depthWrite={false} side={THREE.DoubleSide} />
        </mesh>
      ))}
    </>
  );
}

const jGhost = occluderMaterial('#7fd39a', 0.45);
const animateOfficer = (rig: RigHandle | null, t: number, walking: boolean, speed: number, dt: number) => animateRig(rig, t, walking, speed, false, false, false, dt);

export function SimLayer() {
  useGame((s) => s.simTick);
  const phase = useGame((s) => s.phase);
  const e = getEngine();
  if (phase !== 'sim' || !e) return null;
  return (
    <group>
      {e.npcs.map((n) => (
        <NPCView key={n.id} npc={n} />
      ))}
      {e.responders.map((r) => (
        <ResponderView key={r.id} r={r} />
      ))}
      {e.jandarma.map((j) => (
        <JandarmaView key={j.id} j={j} ghostMat={jGhost} animate={animateOfficer} />
      ))}
      {e.getaways.map((g) => (
        <GetawayView key={g.id} g={g} />
      ))}
      {e.incidents
        .filter((i) => i.status !== 'resolved')
        .map((i) => (
          <IncidentMarker key={i.id} inc={i} />
        ))}
      <TrackedLabels />
      <Hints />
      <DeviceWaves />
    </group>
  );
}

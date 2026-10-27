import { create } from 'zustand';
import { EQUIPMENT, deviceValue, upgradeCost } from './config/equipment';
import { ALL_LEVELS } from './config/levels';
import { bestYaw } from './systems/autoAim';
import { EXPO, fenceYaw, fenceYaws, isCameraPlaceable, isFenceOnly } from './config/expo';
import { sfx } from '../audio/sfx';
import { makeEnv } from './systems/coverage';
import { computeCoverage, type CoverageResult } from './systems/coverage';
import { performAction, type ActionId } from './systems/IncidentManager';
import { computeResult, type ResultData } from './systems/ScoringEngine';
import { SimulationEngine } from './systems/SimulationEngine';
import type { Device, EquipmentType, LevelDef, MapData } from './types';
import { cellX, fenceNorth, fenceWorld, idx, inBounds } from './world/grid';
import { getMap } from './world/maps';
import { IS_MOBILE } from '../scene/gfx';

/** Mobil (Clash of Clans tarzı) yerleştirme: hayalet parmakla sürüklenir, ✓ ile onaylanır; haritaya dokunmak yerleştirmez */
export const MOBILE_PLACE = IS_MOBILE;

/** çit hattına mıknatıs: en yakın çit hücresinin (nav === 2) merkezi; yoksa null */
export function snapToFence(map: MapData, x: number, z: number, maxDist = Infinity): { x: number; z: number } | null {
  const N = map.N;
  let best = -1;
  let bd = maxDist * maxDist;
  for (let j = 0; j < N; j++)
    for (let i = 0; i < N; i++) {
      const c = j * N + i;
      if (map.nav[c] !== 2) continue;
      const cx = cellX(map, i), cz = cellX(map, j);
      const d = (cx - x) * (cx - x) + (cz - z) * (cz - z);
      if (d < bd) {
        bd = d;
        best = c;
      }
    }
  if (best < 0) return null;
  return { x: cellX(map, best % N), z: cellX(map, Math.floor(best / N)) };
}

export type Phase = 'menu' | 'planning' | 'sim' | 'result';

export interface Placing {
  type: EquipmentType;
  existingId?: string;
  stage: 'position' | 'aim';
  i: number;
  j: number;
  x: number;
  z: number;
  yaw: number;
  yaw2?: number;
  valid: boolean;
  reason: string;
  hasHover: boolean;
  fromShopDrag: boolean;
}

export interface Toast {
  id: number;
  text: string;
  level: 'ok' | 'warn' | 'info' | 'alert';
}

export interface Layers {
  risk: boolean;
  coverage: boolean;
  blind: boolean;
  cones: boolean;
}

let engine: SimulationEngine | null = null;
export const getEngine = () => engine;

let toastSeq = 0;

interface State {
  phase: Phase;
  level: LevelDef | null;
  map: MapData | null;
  devices: Device[];
  budget: number;
  placing: Placing | null;
  selectedDeviceId: string | null;
  layers: Layers;
  coverage: CoverageResult | null;
  hover: { x: number; z: number } | null;
  labelCounters: Record<string, number>;
  // sim
  simTick: number;
  speed: number;
  paused: boolean;
  selectedIncidentId: string | null;
  ptzAimId: string | null;
  emergency: number;
  result: ResultData | null;
  bestScores: Record<number, number>;
  toasts: Toast[];
  focus: { x: number; z: number; dist?: number; n: number } | null;
  showHelp: boolean;
  fair: boolean; // fuar modu: tek tıkla yerleştirme + otomatik yön
  shopTypes: EquipmentType[] | null;
  autoOrbit: boolean;

  rotateBy: (id: string, delta: number) => void;
  startLevel: (id: number, override?: Partial<LevelDef>) => void;
  toMenu: () => void;
  beginPlace: (type: EquipmentType, fromShopDrag?: boolean) => void;
  cancelPlace: () => void;
  setHover: (x: number, z: number) => void;
  rotatePlacing: (delta: number) => void;
  commitPlace: () => void;
  selectDevice: (id: string | null) => void;
  moveDevice: (id: string) => void;
  rotateDevice: (id: string) => void;
  sellDevice: (id: string) => void;
  upgradeDevice: (id: string) => void;
  toggleLayer: (k: keyof Layers) => void;
  startSim: (seed?: number) => void;
  setSpeed: (s: number) => void;
  togglePause: () => void;
  tick: (dt: number) => void;
  selectIncident: (id: string | null) => void;
  doAction: (action: ActionId, arg?: string) => void;
  markNpc: (npcId: string) => void;
  setPtzAim: (id: string | null) => void;
  aimPtzAt: (x: number, z: number) => void;
  endSim: () => void;
  improvePlan: () => void;
  replay: () => void;
  toast: (text: string, level?: Toast['level']) => void;
  focusOn: (x: number, z: number, dist?: number) => void;
  setShowHelp: (v: boolean) => void;
}

function loadBest(): Record<number, number> {
  try {
    return JSON.parse(localStorage.getItem('desecure-sc-best') || '{}');
  } catch {
    return {};
  }
}
function saveBest(b: Record<number, number>) {
  try {
    localStorage.setItem('desecure-sc-best', JSON.stringify(b));
  } catch {
    /* depolama yoksa yoksay */
  }
}

export function footprintCenter(map: MapData, type: EquipmentType, i: number, j: number) {
  const fp = EQUIPMENT[type].footprint;
  return { x: cellX(map, i) + (fp - 1) / 2, z: cellX(map, j) + (fp - 1) / 2 };
}

export function validatePlacement(
  map: MapData,
  devices: Device[],
  type: EquipmentType,
  i: number,
  j: number,
  budget: number,
  existingId?: string,
  phase: Phase = 'planning',
  emergency = 0
): { valid: boolean; reason: string } {
  const spec = EQUIPMENT[type];
  const fp = spec.footprint;
  if (!existingId && spec.cost > budget) return { valid: false, reason: 'Yetersiz bütçe' };
  if (!existingId && spec.bonus && devices.some((d) => EQUIPMENT[d.type].bonus)) return { valid: false, reason: 'Bonus hakkın kullanıldı' };
  if (!existingId && spec.limit && devices.filter((d) => d.type === type).length >= spec.limit) return { valid: false, reason: `Limit: en fazla ${spec.limit}` };
  if (!existingId && phase === 'sim' && emergency <= 0) return { valid: false, reason: 'Acil yerleştirme hakkı kalmadı' };
  for (let jj = j; jj < j + fp; jj++)
    for (let ii = i; ii < i + fp; ii++) {
      if (!inBounds(map, ii, jj)) return { valid: false, reason: 'Harita dışı' };
      const c = idx(map, ii, jj);
      // fuar modu: kameralar çit hattına ve köşelere konabilir
      const onFence = EXPO.on && isCameraPlaceable(type) && map.nav[c] === 2;
      // fuar modu: bullet (sabit) kamera yalnızca çit hattına kurulur
      if (EXPO.on && isFenceOnly(type) && !onFence) return { valid: false, reason: 'Bullet kamera yalnızca çit sınırına kurulur' };
      if (!map.inside[c] && !onFence) return { valid: false, reason: EXPO.on && isCameraPlaceable(type) && map.nav[c] === 3 ? 'Kapı üstüne kurulamaz' : 'Tesis çiti dışında' };
      if (map.nav[c] !== 0 && !onFence) return { valid: false, reason: 'Engel / yapı üzerinde' };
      if (map.obsType[c] === 4) return { valid: false, reason: 'Çalılık alan' };
      if (map.obsType[c] === 3) return { valid: false, reason: 'Ağaç gölgeliği' };
      for (const d of devices) {
        if (d.id === existingId) continue;
        const dfp = EQUIPMENT[d.type].footprint;
        if (ii >= d.i && ii < d.i + dfp && jj >= d.j && jj < d.j + dfp) return { valid: false, reason: 'Başka ekipmanla çakışıyor' };
      }
    }
  if (type === 'perimeter') {
    const near = i <= map.fMin + 2 || j <= map.fMin + 2 || i >= map.fMax - 2 || j >= map.fMax - 2;
    if (!near) return { valid: false, reason: 'Çevre sensörü çit kenarına konmalı' };
  }
  return { valid: true, reason: '' };
}

const defaultYaw = (x: number, z: number) => Math.atan2(-z, -x);

export const useGame = create<State>((set, get) => {
  const recompute = (devices: Device[]) => {
    const { map, level } = get();
    if (!map || !level) return null;
    return computeCoverage(map, devices, level.night, level.weather);
  };

  const refreshPlacing = (p: Placing): Placing => {
    const { map, devices, budget, phase, emergency } = get();
    if (!map) return p;
    const v = validatePlacement(map, devices, p.type, p.i, p.j, budget, p.existingId, phase, emergency);
    return { ...p, valid: v.valid && p.hasHover, reason: p.hasHover ? v.reason : '' };
  };

  return {
    phase: 'menu',
    level: null,
    map: null,
    devices: [],
    budget: 0,
    placing: null,
    selectedDeviceId: null,
    layers: { risk: false, coverage: true, blind: true, cones: true },
    coverage: null,
    hover: null,
    labelCounters: {},
    simTick: 0,
    speed: 1,
    paused: false,
    selectedIncidentId: null,
    ptzAimId: null,
    emergency: 0,
    result: null,
    bestScores: loadBest(),
    toasts: [],
    focus: null,
    showHelp: false,
    fair: false,
    shopTypes: null,
    autoOrbit: false,

    rotateBy: (id, delta) => {
      const nd = get().devices.map((d) => (d.id === id ? { ...d, yaw: d.yaw + delta, yaw2: d.yaw2 === undefined ? undefined : d.yaw2 + delta } : d));
      set({ devices: nd, coverage: recompute(nd) });
    },

    startLevel: (id, override) => {
      const base = ALL_LEVELS().find((l) => l.id === id)!;
      const level: LevelDef = override ? { ...base, ...override } : base;
      const map = getMap(level.mapId, level.mapGrow ?? 0, { turbines: level.turbines, expo: !!level.expo });
      engine = null;
      set({
        phase: 'planning',
        level,
        map,
        devices: [],
        budget: level.budget,
        placing: null,
        selectedDeviceId: null,
        labelCounters: {},
        result: null,
        selectedIncidentId: null,
        emergency: level.emergencyCharges,
        layers: { risk: true, coverage: true, blind: true, cones: true },
        focus: { x: 0, z: 0, dist: (level.mapId === 'res' ? 105 : level.mapId === 'tes' ? 92 : level.mapId === 'jes' ? 88 : level.mapId === 'hes' ? 98 : 82) * (1 + (level.mapGrow ?? 0) / 12), n: Date.now() },
        showHelp: true,
      });
      set({ coverage: recompute([]) });
    },

    toMenu: () => {
      engine = null;
      set({ phase: 'menu', placing: null, selectedDeviceId: null, result: null, level: null, map: null });
    },

    beginPlace: (type, fromShopDrag = false) => {
      const { map, phase } = get();
      if (!map) return;
      if (phase !== 'planning' && phase !== 'sim') return;
      const h = get().hover;
      const base: Placing = {
        type,
        stage: 'position',
        i: 0,
        j: 0,
        x: h?.x ?? 0,
        z: h?.z ?? 0,
        yaw: 0,
        valid: false,
        reason: '',
        hasHover: false,
        fromShopDrag,
      };
      set({ placing: base, selectedDeviceId: null, ptzAimId: null });
      if (h) get().setHover(h.x, h.z);
    },

    cancelPlace: () => set({ placing: null }),

    setHover: (x, z) => {
      set({ hover: { x, z } });
      const p = get().placing;
      const map = get().map;
      if (!p || !map) return;
      if (p.stage === 'aim') {
        const dx = x - p.x, dz = z - p.z;
        if (Math.hypot(dx, dz) > 0.6) set({ placing: { ...p, yaw: Math.atan2(dz, dx) } });
        return;
      }
      if (MOBILE_PLACE && EXPO.on && isFenceOnly(p.type)) {
        // mobil: bullet kamera en yakın çit hücresine yapışır
        const sn = snapToFence(map, x, z, p.hasHover ? 14 : Infinity); // ilk belirişte en yakın çite git
        if (sn) {
          x = sn.x;
          z = sn.z;
        }
      }
      const fp = EQUIPMENT[p.type].footprint;
      const i = Math.floor(x + map.N / 2 - (fp - 1) / 2);
      const j = Math.floor(z + map.N / 2 - (fp - 1) / 2);
      if (i === p.i && j === p.j && p.hasHover) return;
      const c = footprintCenter(map, p.type, i, j);
      let yaw = p.yaw;
      if (!p.existingId && !EQUIPMENT[p.type].rotatable) yaw = 0;
      else if (p.stage === 'position' && EXPO.on && isCameraPlaceable(p.type)) yaw = fenceYaw(fenceWorld(map), c.x, c.z, get().devices, fenceNorth(map));
      else if (!p.existingId && p.stage === 'position') yaw = defaultYaw(c.x, c.z);
      let yaw2 = p.yaw2;
      if (p.stage === 'position' && EXPO.on && p.type === 'fixedCam') [yaw, yaw2] = fenceYaws(fenceWorld(map), c.x, c.z, fenceNorth(map));
      set({ placing: refreshPlacing({ ...p, i, j, x: c.x, z: c.z, yaw, yaw2, hasHover: true }) });
    },

    rotatePlacing: (delta) => {
      const p = get().placing;
      if (p) set({ placing: { ...p, yaw: p.yaw + delta } });
    },

    commitPlace: () => {
      const p = get().placing;
      const { map, devices, phase } = get();
      if (!p || !map) return;
      if (p.stage === 'position') {
        const v = validatePlacement(map, devices, p.type, p.i, p.j, get().budget, p.existingId, phase, get().emergency);
        if (!v.valid || !p.hasHover) {
          sfx.error();
          if (v.reason) get().toast(v.reason, 'warn');
          return;
        }
        if (EQUIPMENT[p.type].rotatable && p.existingId && EXPO.on && isCameraPlaceable(p.type)) {
          // fuar modu: taşınan kamera da yeni yerinde çite döner
          p.yaw = fenceYaw(fenceWorld(map), p.x, p.z, devices.filter((d) => d.id !== p.existingId), fenceNorth(map));
          if (p.type === 'fixedCam') [p.yaw, p.yaw2] = fenceYaws(fenceWorld(map), p.x, p.z, fenceNorth(map));
        } else if (EQUIPMENT[p.type].rotatable && !p.existingId) {
          if (EXPO.on && isCameraPlaceable(p.type)) {
            // fuar modu: kamera en yakın çite (dışa) / çit boyunca bakar; bullet çift başlı
            p.yaw = fenceYaw(fenceWorld(map), p.x, p.z, devices, fenceNorth(map));
            if (p.type === 'fixedCam') [p.yaw, p.yaw2] = fenceYaws(fenceWorld(map), p.x, p.z, fenceNorth(map));
          } else if (get().fair && get().level) {
            const lvl = get().level!;
            const env = makeEnv(lvl.night, lvl.weather, get().coverage?.lit ?? new Uint8Array(map.N * map.N));
            const probe: Device = { id: 'probe', label: '', type: p.type, i: p.i, j: p.j, x: p.x, z: p.z, yaw: 0, level: 1 };
            p.yaw = bestYaw(map, env, probe, get().coverage);
          } else {
            set({ placing: { ...p, stage: 'aim', fromShopDrag: false } });
            return;
          }
        }
      }
      // tamamla
      if (p.existingId) {
        const nd = devices.map((d) => {
          if (d.id !== p.existingId) return d;
          // yön aşamasında döndürülünce ikinci başlık açısını korur; taşınınca fuar kuralı yeni yaw2 verir
          const yaw2 = p.stage === 'position' && p.yaw2 !== undefined ? p.yaw2 : d.yaw2 === undefined ? undefined : d.yaw2 + (p.yaw - d.yaw);
          return { ...d, i: p.i, j: p.j, x: p.x, z: p.z, yaw: p.yaw, yaw2 };
        });
        set({ devices: nd, placing: null, selectedDeviceId: p.existingId, coverage: recompute(nd) });
        return;
      }
      const spec = EQUIPMENT[p.type];
      const counters = { ...get().labelCounters };
      counters[p.type] = (counters[p.type] ?? 0) + 1;
      const dev: Device = {
        id: `D${Date.now().toString(36)}${Math.floor(Math.random() * 1000)}`,
        label: `${spec.code}-${String(counters[p.type]).padStart(2, '0')}`,
        type: p.type,
        i: p.i,
        j: p.j,
        x: p.x,
        z: p.z,
        yaw: spec.rotatable ? p.yaw : 0,
        yaw2: spec.rotatable ? p.yaw2 : undefined,
        level: 1,
        emergency: phase === 'sim',
      };
      const nd = [...devices, dev];
      const isSim = phase === 'sim';
      set({
        devices: nd,
        budget: get().budget - spec.cost,
        labelCounters: counters,
        placing: null,
        selectedDeviceId: isSim ? null : dev.id,
        coverage: recompute(nd),
        emergency: isSim ? get().emergency - 1 : get().emergency,
      });
      if (isSim && engine) engine.addDevice(dev, true);
      sfx.place();
      get().toast(`${dev.label} yerleştirildi`, 'ok');
    },

    selectDevice: (id) => set({ selectedDeviceId: id, placing: null }),

    moveDevice: (id) => {
      const d = get().devices.find((x) => x.id === id);
      if (!d || get().phase !== 'planning') return;
      set({
        placing: { type: d.type, existingId: id, stage: 'position', i: d.i, j: d.j, x: d.x, z: d.z, yaw: d.yaw, valid: true, reason: '', hasHover: true, fromShopDrag: false },
        selectedDeviceId: null,
      });
    },

    rotateDevice: (id) => {
      const d = get().devices.find((x) => x.id === id);
      if (!d || get().phase !== 'planning') return;
      set({
        placing: { type: d.type, existingId: id, stage: 'aim', i: d.i, j: d.j, x: d.x, z: d.z, yaw: d.yaw, valid: true, reason: '', hasHover: true, fromShopDrag: false },
        selectedDeviceId: null,
      });
    },

    sellDevice: (id) => {
      const d = get().devices.find((x) => x.id === id);
      if (!d || get().phase !== 'planning') return;
      const nd = get().devices.filter((x) => x.id !== id);
      set({ devices: nd, budget: get().budget + deviceValue(d.type, d.level), selectedDeviceId: null, coverage: recompute(nd) });
      sfx.remove();
      get().toast(`${d.label} satıldı (+${deviceValue(d.type, d.level).toLocaleString('tr-TR')})`, 'info');
    },

    upgradeDevice: (id) => {
      const d = get().devices.find((x) => x.id === id);
      if (!d || d.level === 2 || get().phase !== 'planning') return;
      const cost = upgradeCost(d.type);
      if (cost > get().budget) {
        get().toast('Yetersiz bütçe', 'warn');
        return;
      }
      const nd = get().devices.map((x) => (x.id === id ? { ...x, level: 2 as const } : x));
      set({ devices: nd, budget: get().budget - cost, coverage: recompute(nd) });
      get().toast(`${d.label} Seviye 2 — menzil +25%`, 'ok');
    },

    toggleLayer: (k) => set({ layers: { ...get().layers, [k]: !get().layers[k] } }),

    startSim: (seed) => {
      const { map, level, devices } = get();
      if (!map || !level) return;
      engine = new SimulationEngine(map, level, devices, seed ?? (Date.now() ^ (Math.random() * 1e9)) >>> 0);
      set({
        phase: 'sim',
        placing: null,
        selectedDeviceId: null,
        selectedIncidentId: null,
        paused: false,
        speed: 1,
        result: null,
        ptzAimId: null,
        layers: { ...get().layers, risk: false, blind: false, coverage: false, cones: true },
        showHelp: false,
      });
    },

    setSpeed: (s) => set({ speed: s, paused: false }),
    togglePause: () => set({ paused: !get().paused }),

    tick: (dt) => {
      const { phase, paused, speed } = get();
      if (phase !== 'sim' || !engine || paused) return;
      const total = Math.min(dt, 0.1) * speed;
      const steps = Math.ceil(total / 0.05);
      for (let k = 0; k < steps; k++) engine.update(total / steps);
      if (engine.ended) get().endSim();
    },

    selectIncident: (id) => {
      set({ selectedIncidentId: id });
      if (id && engine) {
        const inc = engine.incident(id);
        if (inc) inc.noticed = true;
      }
    },

    doAction: (action, arg) => {
      const id = get().selectedIncidentId;
      if (!id || !engine) return;
      const res = performAction(engine, id, action, arg);
      if (action === 'inspect') {
        const inc = engine.incident(id);
        if (inc) get().focusOn(inc.x, inc.z, 26);
        return;
      }
      get().toast(res.msg, res.level);
      set({ simTick: get().simTick + 1 });
    },

    markNpc: (npcId) => {
      if (!engine) return;
      // fuar modu: AİM yalnızca kameraların gördüğüne müdahale eder (elle işaretleme yok)
      if (engine.level.expo) return;
      const inc = engine.manualMark(npcId);
      if (inc) {
        set({ selectedIncidentId: inc.id, simTick: get().simTick + 1 });
      }
    },

    setPtzAim: (id) => set({ ptzAimId: id }),
    aimPtzAt: (x, z) => {
      const id = get().ptzAimId;
      if (!id || !engine) return;
      engine.aimPtz(id, x, z);
      engine.actionsLog.push({ t: engine.time, action: 'ptz', incidentId: '' });
      const d = engine.runtime(id);
      get().toast(`${d?.dev.label ?? 'PTZ'} yeni hedefe çevriliyor`, 'info');
      set({ ptzAimId: null });
    },

    endSim: () => {
      if (!engine) return;
      engine.end();
      const { map, level, devices, coverage } = get();
      if (!map || !level) return;
      const cov = coverage ?? computeCoverage(map, devices, level.night, level.weather);
      const result = computeResult(engine, cov, devices, level.budget);
      const best = { ...get().bestScores };
      if (!best[level.id] || result.score > best[level.id]) best[level.id] = result.score;
      saveBest(best);
      set({ phase: 'result', result, bestScores: best, paused: false, ptzAimId: null });
    },

    improvePlan: () => {
      const { level, devices } = get();
      if (!level) return;
      const used = devices.reduce((s, d) => s + deviceValue(d.type, d.level), 0);
      engine = null;
      set({
        phase: 'planning',
        budget: level.budget - used,
        result: null,
        selectedIncidentId: null,
        emergency: level.emergencyCharges,
        layers: { risk: false, coverage: true, blind: true, cones: true },
        devices: devices.map((d) => ({ ...d, emergency: false })),
      });
      // bütçe aşıldıysa (acil alımlar) uyar
      if (level.budget - used < 0) get().toast('Acil alımlar bütçeyi aştı — bazı ekipmanları satın.', 'warn');
    },

    replay: () => {
      get().improvePlan();
      get().startSim();
    },

    toast: (text, level = 'info') => {
      const id = ++toastSeq;
      set({ toasts: [...get().toasts.slice(-3), { id, text, level }] });
      setTimeout(() => set({ toasts: get().toasts.filter((t) => t.id !== id) }), 2800);
    },

    focusOn: (x, z, dist) => set({ focus: { x, z, dist, n: Date.now() + Math.random() } }),
    setShowHelp: (v) => set({ showHelp: v }),
  };
});

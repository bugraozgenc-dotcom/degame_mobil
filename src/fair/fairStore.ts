import { create } from 'zustand';
import { FAIR_LEVEL, FAIR_LEVELS } from '../game/config/levels';
import { getEngine, useGame } from '../game/store';
import { performAction } from '../game/systems/IncidentManager';
import type { Device, EquipmentType, LevelDef, MapData, Weather } from '../game/types';
import { EQUIPMENT } from '../game/config/equipment';
import { cellIndexOf, fenceWorld, idx, nearestWalkable } from '../game/world/grid';
import { computeCoverage } from '../game/systems/coverage';
import { sfx } from '../audio/sfx';
import { useAim } from '../ui/AimPanel';
import { loadExpoMode, setExpoMode } from '../game/config/expo';
import { getMap } from '../game/world/maps';
import { expoPerimeterPlan } from '../game/systems/expoBudget';

// Fuar görevi akışı: bekleme ekranı → kurulum → savunma → sonuç

export type FairPhase = 'attract' | 'register' | 'select' | 'build' | 'defend' | 'result' | 'demo';
/** Desecure demosu süresi (sn, gerçek zaman) */
export const DEMO_SECONDS = 60;
export type Choice = 'hirsiz' | 'hayvan' | 'personel';

export const FAIR_SHOP: EquipmentType[] = ['fixedCam', 'ptzCam', 'drone', 'siren', 'patrol'];
/** gece görevinde termal kamera ve aydınlatma da satın alınabilir */
export const FAIR_SHOP_NIGHT: EquipmentType[] = ['fixedCam', 'thermalCam', 'ptzCam', 'light', 'drone', 'siren', 'patrol'];
/** fuar modu: gündüz de termal kamera (3× menzil) satın alınabilir */
export const FAIR_SHOP_EXPO: EquipmentType[] = ['bulletCam', 'fixedCam', 'thermalCam', 'ptzCam', 'drone', 'siren', 'patrol'];
export const FAIR_SHOP_EXPO_NIGHT: EquipmentType[] = ['bulletCam', 'fixedCam', 'thermalCam', 'ptzCam', 'light', 'drone', 'siren', 'patrol'];
export const shopFor = (night: boolean, expo: boolean): EquipmentType[] => (expo ? (night ? FAIR_SHOP_EXPO_NIGHT : FAIR_SHOP_EXPO) : night ? FAIR_SHOP_NIGHT : FAIR_SHOP);
/** fuar modu kredisi: çitin tamamını, kameralar birbirini görecek şekilde kapatmanın maliyeti ×1,2 + iç alan için iki kamera payı */
export function expoBudget(level: LevelDef, night: boolean, weather: Weather): number {
  const map = getMap(level.mapId, level.mapGrow ?? 0, { turbines: level.turbines, expo: true });
  const plan = expoPerimeterPlan(map, night, weather);
  // HES: baraj tepesindeki çit ve rezervuar cephesi için ek pay
  const mapMult = level.mapId === 'hes' ? 1.15 : 1;
  // iç alan payı: iki PTZ (gece + iki aydınlatma direği); termal pahalı olduğu için paya girmez
  const inner = 2 * EQUIPMENT.ptzCam.cost + (night ? 2 * EQUIPMENT.light.cost : 0);
  return Math.ceil(((plan.cost * 1.2 + inner) * mapMult) / 100) * 100;
}

export type TimeOfDay = 'gunduz' | 'gece';
const TOD_KEY = 'desecure-fair-tod';
function loadTod(): TimeOfDay {
  try {
    return localStorage.getItem(TOD_KEY) === 'gece' ? 'gece' : 'gunduz';
  } catch {
    return 'gunduz';
  }
}
/** gece görevi ayarları: karanlık, el fenerli hırsızlar, termal kamera için biraz daha bütçe */
const nightApply = (l: LevelDef): Partial<LevelDef> => ({ night: true, clockStart: 22, budget: Math.round((l.budget * 1.15) / 100) * 100 });
export const BUILD_SECONDS = 120;

// ───────────── zorluk ─────────────
export type Difficulty = 'kolay' | 'normal' | 'zor';
export interface DiffDef {
  label: string;
  short: string;
  desc: string[];
  build: number; // kurulum süresi (sn)
  scoreMult: number;
  apply: (l: LevelDef) => Partial<LevelDef>;
}
const r100 = (v: number) => Math.round(v / 100) * 100;
export const DIFFS: Record<Difficulty, DiffDef> = {
  kolay: {
    label: 'Kolay',
    short: 'KOLAY',
    desc: ['2 yavaş hırsız', 'Bol bütçe', '1 makara götürür'],
    build: 120,
    scoreMult: 0.8,
    apply: (l) => ({ difficulty: 'Kolay', budget: r100(l.budget * 1.2), thieves: 2, animals: 1, staff: 1, stealTime: 11, thiefSpeedMult: 0.9, thiefDetectMult: 1.15, stockTotal: 5, thiefCarry: 1, storm: true, mapGrow: 0 }),
  },
  normal: {
    label: 'Normal',
    short: 'NORMAL',
    desc: ['3 hırsız', 'Orta boy saha', '2 makara götürür'],
    build: 120,
    scoreMult: 1,
    apply: (l) => ({ difficulty: 'Orta', budget: r100(l.budget * 1.15), thieves: 3, animals: 1, staff: 1, stealTime: 7, stockTotal: 5, thiefCarry: 2, storm: true, blackout: true, mapGrow: 4 }),
  },
  zor: {
    label: 'Zor',
    short: 'ZOR',
    desc: ['6 sinsi, hızlı hırsız', 'Büyük saha', 'RES: 6 dağınık türbin'],
    build: 120,
    scoreMult: 1.6,
    apply: (l) => ({
      difficulty: 'Zor',
      budget: r100(l.budget * (l.mapId === 'res' ? 1.6 : 1.35)), // harita büyük, RES'te 6 türbin
      mapGrow: 8,
      turbines: 6,
      thieves: 6,
      animals: 2,
      staff: 2,
      stealTime: 3.5,
      thiefSpeedMult: 1.3,
      thiefDetectMult: 0.7,
      trickyThieves: true,
      stockTotal: 6,
      thiefCarry: 2,
      noCorner: true,
      storm: true,
      blackout: true,
    }),
  },
};
const DIFF_KEY = 'desecure-fair-diff';
function loadDiff(): Difficulty {
  try {
    const v = localStorage.getItem(DIFF_KEY);
    if (v === 'kolay' || v === 'normal' || v === 'zor') return v;
  } catch {
    /* tarayıcı depolaması yok */
  }
  return 'normal';
}
/** fuar modunda zorluğa göre hırsız sayısı (alarm fırtınası hırsızları hariç) */
export const EXPO_THIEVES: Record<Difficulty, number> = { kolay: 20, normal: 24, zor: 32 };
export const SIM_SPEED = 1.5;
const IDLE_MS = 1e12; // mobil: hareketsizlik sıfırlaması yok

export interface Decision {
  choice: Choice;
  correct: boolean;
  truth: 'thief' | 'animal' | 'staff' | null;
}

export interface FairResult {
  total: number;
  max: number;
  stars: 0 | 1 | 2 | 3;
  title: string;
  lines: { label: string; value: string; pts: number }[];
  prevented: number;
  /** fuar modu: sınır özeti */
  expo?: { fencePct: number; gaps: number; viaGap: number; unseenThefts: number; sabotaged: number };
  thieves: number;
  breaches: number;
  correct: number;
  decisions: number;
  coverage: number;
  // AİM özeti
  attempts: number; // sahaya yaklaşan hırsız
  animals: number;
  staff: number;
  incidents: number;
  aimReports: number;
  materialLeft: number;
  detected: number;
  entered: number;
  autoCatches: number;
  materialMax: number;
  endReason: 'time' | 'emptied' | 'quit';
  /** rozetler */
  badges: Badge[];
  /** kaçırılan makara sayısı ve tahmini değeri (₺) */
  lootLost: number;
  lostValue: number;
  bestStreak: number;
  comboBonus: number;
  blackouts: number;
  duststorms: number;
}

export interface Badge {
  id: string;
  label: string;
  desc: string;
}
/** bir kablo makarasının temsili değeri (₺) — kayıp mesajı için */
export const REEL_VALUE = 18000;

/** Taktik müdahale hakları (savunma sırasında) */
export type Tactic = 'siren' | 'backup' | 'light';
export const TACTIC_INFO: Record<Tactic, { name: string; desc: string; uses: number }> = {
  siren: { name: 'Saha sireni', desc: 'Tüm sahada siren: hırsızlar kaçar', uses: 2 },
  backup: { name: 'Ek devriye', desc: 'Kapıdan ekip girer, en yakın şüpheliye koşar', uses: 1 },
  light: { name: 'Projektör', desc: '12 sn tüm saha aydınlık', uses: 1 },
};

/** İki kişilik düello: aynı saha, aynı olay sırası, sırayla */
export interface Duel {
  players: [Player, Player];
  results: [FairResult | null, FairResult | null];
  turn: 0 | 1;
  seed: number;
}
/** Kampanya: GES → RES → TES art arda, toplam puan */
export interface Campaign {
  idx: number;
  results: FairResult[];
}
export const CAMPAIGN_ORDER = [101, 102, 103, 104, 105, 106];

export interface Player {
  first: string;
  last: string;
}

export const capName = (v: string) =>
  v
    .trim()
    .replace(/\s+/g, ' ')
    .split(' ')
    .map((w) => w.charAt(0).toLocaleUpperCase('tr-TR') + w.slice(1).toLocaleLowerCase('tr-TR'))
    .join(' ');

/** Skor tablosunda gösterilecek kısa ad: "Ad S." */
export const displayName = (p: Player) => `${p.first} ${p.last.charAt(0).toLocaleUpperCase('tr-TR')}.`.trim();

export interface LbEntry {
  id: string;
  name: string;
  fullName?: string;
  mission?: number;
  diff?: Difficulty;
  night?: boolean;
  score: number;
  stars: number;
  t: number;
}

const LB_KEY = 'desecure-fair-leaderboard';
function loadLb(): LbEntry[] {
  try {
    return JSON.parse(localStorage.getItem(LB_KEY) || '[]');
  } catch {
    return [];
  }
}
function saveLb(lb: LbEntry[]) {
  try {
    localStorage.setItem(LB_KEY, JSON.stringify(lb.slice(0, 200)));
  } catch {
    /* depolama yoksa yoksay */
  }
}

interface FairState {
  phase: FairPhase;
  buildEndsAt: number;
  decisions: Record<string, Decision>;
  feedback: { text: string; sub: string; tone: 'good' | 'bad'; id: number } | null;
  lastInput: number;
  result: FairResult | null;
  lb: LbEntry[];
  myEntryId: string | null;
  introSeen: boolean;
  player: Player | null;
  levelId: number;
  difficulty: Difficulty;
  setDifficulty: (d: Difficulty) => void;
  tod: TimeOfDay;
  setTod: (t: TimeOfDay) => void;
  /** fuar modu (şifreli): bullet kamera köşelere, termal 3× menzil, kurulum süresi yok, hırsız kapsama dışından girer */
  expo: boolean;
  setExpo: (on: boolean) => void;
  selectMission: (id: number) => void;
  openRegister: () => void;
  register: (first: string, last: string) => void;
  toAttract: () => void;
  startMission: () => void;
  startDefense: () => void;
  decide: (incId: string, choice: Choice) => void;
  finish: () => void;
  /** oyun sırasında: görevi şimdi bitir ve puanı göster */
  quitMission: () => void;
  /** sonuç ekranından: aynı sahayı tam Desecure kurulumuyla 40 sn otomatik savun */
  startDemo: () => void;
  endDemo: () => void;
  demoResult: FairResult | null;
  saveName: (name: string) => void;
  touch: () => void;
  setIntroSeen: () => void;
  clearLb: () => void;
  /** seri (combo) */
  streak: number;
  bestStreak: number;
  comboBonus: number;
  /** taktik müdahale hakları */
  tactics: Record<Tactic, number>;
  useTactic: (t: Tactic) => void;
  /** fuar modu: AİM olayı kendisi sınıflandırır ve müdahale eder */
  autoAim: (incId: string) => void;
  /** bu görevin havası (rastgele) */
  weather: Weather;
  /** düello */
  duel: Duel | null;
  registerDuel: (p1: Player, p2: Player) => void;
  duelNext: () => void;
  duelRematch: () => void;
  /** kampanya */
  campaign: Campaign | null;
  startCampaign: () => void;
  campaignNext: () => void;
}

/** Tam Desecure kurulumu: her kritik varlığın yanına kamera, köşelere kule, MİK+MAS+MİA, gece ise aydınlatma */
function buildFullLayout(map: MapData, night: boolean): Device[] {
  const out: Device[] = [];
  const used = new Set<number>();
  let n = 0;
  const place = (type: EquipmentType, x: number, z: number, yawTo?: { x: number; z: number }) => {
    const fp = EQUIPMENT[type].footprint;
    const p = nearestWalkable(map, x, z, true);
    const i = cellIndexOf(map, p.x), j = cellIndexOf(map, p.z);
    // ayak izi çakışmasın
    for (let dj = 0; dj < fp; dj++) for (let di = 0; di < fp; di++) if (used.has(idx(map, i + di, j + dj))) return;
    for (let dj = 0; dj < fp; dj++) for (let di = 0; di < fp; di++) used.add(idx(map, i + di, j + dj));
    const cx = p.x + (fp - 1) / 2, cz = p.z + (fp - 1) / 2;
    const yaw = yawTo ? Math.atan2(yawTo.z - cz, yawTo.x - cx) : Math.atan2(-cz, -cx);
    out.push({ id: `demo${++n}`, label: `${EQUIPMENT[type].code}-${String(n).padStart(2, '0')}`, type, i, j, x: cx, z: cz, yaw, level: 2 });
  };
  const lim = fenceWorld(map) - 2.5;
  const cl = (v: number) => Math.max(-lim, Math.min(lim, v));
  // her varlığın yanına termal (gece) / sabit kamera, varlığa bakar
  map.assets.forEach((a, k) => {
    const ang = (k * 2.4) % (Math.PI * 2);
    place(night ? 'thermalCam' : k % 2 ? 'ptzCam' : 'fixedCam', cl(a.ax + Math.cos(ang) * 5), cl(a.az + Math.sin(ang) * 5), { x: a.x, z: a.z });
  });
  // köşelerde gözcü dronlar
  for (const [sx, sz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) place('drone', cl(sx * (lim - 4)), cl(sz * (lim - 4)));
  // Desecure ürünleri merkeze yakın üç noktaya
  place('mik', cl(-lim * 0.35), cl(lim * 0.1));
  place('mas', cl(lim * 0.35), cl(-lim * 0.1));
  place('mia', cl(0), cl(lim * 0.45));
  // sirenler + devriyeler + araç
  place('siren', 0, 0);
  place('patrol', cl(-lim * 0.5), cl(-lim * 0.5));
  place('patrol', cl(lim * 0.5), cl(lim * 0.5));
  place('vehicle', cl(lim * 0.2), cl(-lim * 0.6));
  if (night) for (const a of map.assets) place('light', cl(a.ax + 3), cl(a.az - 3));
  return out;
}

let fbSeq = 0;
let attractIdx = -1;
/** haritaya göre kamera uzaklıkları */
const attractDist = (m: string) => (m === 'ges' || m === 'bess' ? 92 : m === 'jes' ? 100 : m === 'hes' ? 108 : 112);
const buildDist = (m: string) => (m === 'ges' || m === 'bess' ? 78 : m === 'tes' ? 86 : m === 'jes' ? 84 : m === 'hes' ? 92 : 100);
const CORRECT_PTS = 100;
/** seri çarpanı: 1. doğru ×1, 2. ×1,5, 3. ×2, 4+ ×3 */
export const streakMult = (n: number) => (n >= 4 ? 3 : n === 3 ? 2 : n === 2 ? 1.5 : 1);

// kalıcı fuar modu ayarını ekipman tanımlarına uygula
setExpoMode(loadExpoMode());

export const useFair = create<FairState>((set, get) => ({
  phase: 'attract',
  buildEndsAt: 0,
  decisions: {},
  feedback: null,
  lastInput: Date.now(),
  result: null,
  lb: loadLb(),
  myEntryId: null,
  introSeen: false,
  player: null,
  levelId: FAIR_LEVEL.id,
  streak: 0,
  bestStreak: 0,
  comboBonus: 0,
  tactics: { siren: 0, backup: 0, light: 0 },
  weather: 'clear',
  duel: null,
  campaign: null,

  expo: loadExpoMode(),
  setExpo: (on) => {
    setExpoMode(on);
    set({ expo: on });
  },

  tod: loadTod(),
  setTod: (t) => {
    try {
      localStorage.setItem(TOD_KEY, t);
    } catch {
      /* yok say */
    }
    set({ tod: t });
  },
  difficulty: loadDiff(),
  setDifficulty: (d) => {
    try {
      localStorage.setItem(DIFF_KEY, d);
    } catch {
      /* yok say */
    }
    set({ difficulty: d });
  },
  selectMission: (id) => {
    set({ levelId: id });
    get().startMission();
  },

  openRegister: () => set({ phase: 'register', lastInput: Date.now(), player: null }),

  register: (first, last) => {
    set({ player: { first: capName(first), last: capName(last) }, phase: 'select', lastInput: Date.now() });
  },

  toAttract: () => {
    const g = useGame.getState();
    attractIdx = (attractIdx + 1) % FAIR_LEVELS.length;
    g.startLevel(FAIR_LEVELS[attractIdx].id);
    useGame.setState({
      fair: true,
      shopTypes: FAIR_SHOP,
      autoOrbit: true,
      showHelp: false,
      layers: { risk: false, coverage: false, blind: false, cones: true },
      focus: { x: 0, z: 0, dist: attractDist(FAIR_LEVELS[attractIdx].mapId), n: Date.now() },
    });
    set({ phase: 'attract', decisions: {}, feedback: null, result: null, myEntryId: null, introSeen: false, player: null, duel: null, campaign: null, streak: 0, bestStreak: 0, comboBonus: 0 });
  },

  registerDuel: (p1, p2) => {
    set({ player: p1, duel: { players: [p1, p2], results: [null, null], turn: 0, seed: (Date.now() ^ (Math.random() * 1e9)) >>> 0 }, phase: 'select', lastInput: Date.now() });
  },
  duelNext: () => {
    const d = get().duel;
    if (!d || d.turn !== 0) return;
    set({ duel: { ...d, turn: 1 }, player: d.players[1] });
    get().startMission();
  },
  duelRematch: () => {
    const d = get().duel;
    if (!d) return;
    set({ duel: { players: [d.players[1], d.players[0]], results: [null, null], turn: 0, seed: (Date.now() ^ (Math.random() * 1e9)) >>> 0 }, player: d.players[1] });
    get().startMission();
  },
  startCampaign: () => {
    set({ campaign: { idx: 0, results: [] }, levelId: CAMPAIGN_ORDER[0] });
    get().startMission();
  },
  campaignNext: () => {
    const c = get().campaign;
    if (!c || c.idx >= CAMPAIGN_ORDER.length - 1) return;
    set({ campaign: { ...c, idx: c.idx + 1 }, levelId: CAMPAIGN_ORDER[c.idx + 1] });
    get().startMission();
  },
  useTactic: (t) => {
    const e = getEngine();
    const left = get().tactics[t];
    if (!e || e.ended || left <= 0 || get().phase !== 'defend') return;
    set({ tactics: { ...get().tactics, [t]: left - 1 }, lastInput: Date.now() });
    if (t === 'siren') {
      e.tacticSiren();
      sfx.siren(3);
    } else if (t === 'backup') {
      e.tacticBackup();
      sfx.radio();
    } else {
      e.tacticFloodlight();
      sfx.alert();
    }
    useGame.setState({ simTick: useGame.getState().simTick + 1 });
  },

  startMission: () => {
    const g = useGame.getState();
    const lvl = FAIR_LEVELS.find((l) => l.id === get().levelId) ?? FAIR_LEVEL;
    const diff = DIFFS[get().difficulty];
    const night = get().tod === 'gece';
    // hava: her görevde rastgele (açık / sis / yağmur) — sis kamera menzilini kısar, gece termali değerli kılar
    const wr = Math.random();
    const weather: Weather = wr < 0.6 ? 'clear' : wr < 0.8 ? 'fog' : 'rain';
    // sürpriz olay: gündüz toz fırtınası, gece elektrik kesintisi (Kolay'da yok)
    const base = diff.apply(lvl);
    const expo = get().expo;
    const ov: Partial<LevelDef> = { ...base, weather, blackout: night && !!base.blackout, duststorm: !night && !!base.blackout, expo };
    const fin: Partial<LevelDef> = night ? { ...ov, ...nightApply({ ...lvl, ...ov }) } : { ...ov };
    if (expo) {
      // fuar modu: kredi = tam sınır maliyeti + pay; oyun başladıktan sonra kamera eklenemez
      fin.budget = expoBudget({ ...lvl, ...fin } as LevelDef, night, weather);
      fin.emergencyCharges = 0;
      fin.tech = 0; // teknik arıza yok: kamerayı yalnızca hırsız sabote edebilir
      // fuar modu: daha sık hırsız (bekleme olmasın), ilk hırsız savunma başlar başlamaz gelir
      fin.thieves = EXPO_THIEVES[get().difficulty];
      // sürpriz olaylar (toz fırtınası / elektrik kesintisi) kapsamayı rastgele bozmasın: sınır kurgusu net kalsın
      fin.duststorm = false;
      fin.blackout = false;
    }
    g.startLevel(lvl.id, fin);
    useGame.setState({
      fair: true,
      shopTypes: shopFor(night, expo),
      autoOrbit: false,
      showHelp: false,
      layers: { risk: !expo, coverage: true, blind: true, cones: true },
      focus: { x: 0, z: 0, dist: buildDist(lvl.mapId) * (1 + (ov.mapGrow ?? 0) / 12), n: Date.now() },
    });
    set({
      phase: 'build',
      // fuar modunda kurulum süresi yok (operatör hazır olunca başlatır)
      buildEndsAt: expo ? 0 : Date.now() + diff.build * 1000,
      decisions: {},
      feedback: null,
      result: null,
      myEntryId: null,
      lastInput: Date.now(),
      introSeen: false,
      streak: 0,
      bestStreak: 0,
      comboBonus: 0,
      weather,
      tactics: { siren: TACTIC_INFO.siren.uses, backup: TACTIC_INFO.backup.uses, light: night ? TACTIC_INFO.light.uses : 0 },
    });
  },

  startDefense: () => {
    const g = useGame.getState();
    if (g.placing) g.cancelPlace();
    g.startSim(get().duel?.seed);
    useGame.setState({ speed: SIM_SPEED, layers: { risk: false, coverage: false, blind: false, cones: true } });
    sfx.start();
    set({ phase: 'defend', lastInput: Date.now() });
  },

  autoAim: (incId) => {
    const e = getEngine();
    if (!e) return;
    const inc = e.incident(incId);
    if (!inc || inc.status === 'resolved' || get().decisions[incId]) return;
    const npc = inc.npcId ? e.npcs.find((n) => n.id === inc.npcId) ?? null : null;
    const truth = npc ? npc.kind : null;
    let choice: Choice = 'personel';
    let text = '';
    let sub = '';
    if (truth === 'thief' && npc) {
      choice = 'hirsiz';
      performAction(e, incId, 'classify', 'insan');
      const s = performAction(e, incId, 'siren');
      if (!s.ok) {
        e.deter(inc.x, inc.z, 16, 'speaker');
        e.feedPush('AİM: Sahaya uzaktan sesli uyarı yapıldı.', 'info', incId);
      }
      // fuar modu: AİM kamerada gördüğü hırsızı hedefli uyarır; içeri girmeden geldiği yoldan kaçar
      if (e.level.expo) e.aimRepel(npc);
      performAction(e, incId, 'aim');
      useAim.getState().show(inc.sector, inc.source, false);
      text = 'AİM: HIRSIZ TESPİT EDİLDİ';
      sub = `${npc.name} · ${inc.source} · ${inc.sector}. Uyarı yapıldı, devriye ve jandarma yönlendirildi.`;
      sfx.correct();
    } else if (truth === 'animal' && npc) {
      choice = 'hayvan';
      performAction(e, incId, 'classify', 'hayvan');
      e.deter(inc.x, inc.z, 14, 'speaker');
      e.feedPush('AİM: Hayvan sesli uyarıyla uzaklaştırılıyor.', 'info', incId);
      performAction(e, incId, 'dispatch');
      text = 'AİM: HAYVAN';
      sub = `${npc.name} · ${inc.source}. Sesli uyarıyla uzaklaştırılıyor, alarm gerekmedi.`;
      sfx.place();
    } else if (truth === 'staff' && npc) {
      performAction(e, incId, 'classify', 'personel');
      performAction(e, incId, 'resolve');
      text = 'AİM: PERSONEL DOĞRULANDI';
      sub = `${inc.source} · yetkili bakım ekibi. Müdahale gerekmedi.`;
      sfx.place();
    } else {
      performAction(e, incId, 'resolve');
      text = 'AİM: SİNYAL ELENDİ';
      sub = 'Görüntüde tehdit yok, kayıt kapatıldı.';
    }
    set({
      decisions: { ...get().decisions, [incId]: { choice, correct: true, truth } },
      feedback: { text, sub, tone: 'good', id: ++fbSeq },
    });
    const id = fbSeq;
    setTimeout(() => {
      if (get().feedback?.id === id) set({ feedback: null });
    }, 2600);
    useGame.setState({ simTick: useGame.getState().simTick + 1 });
  },

  decide: (incId, choice) => {
    const e = getEngine();
    if (!e) return;
    const inc = e.incident(incId);
    if (!inc || get().decisions[incId]) return;
    const npc = inc.npcId ? e.npcs.find((n) => n.id === inc.npcId) ?? null : null;
    const truth = npc ? npc.kind : null;
    if (choice === 'hirsiz') {
      performAction(e, incId, 'classify', 'insan');
      performAction(e, incId, 'siren');
      performAction(e, incId, 'dispatch');
      performAction(e, incId, 'aim');
      useAim.getState().show(inc.sector, inc.source, truth !== 'thief');
    } else if (choice === 'hayvan') {
      performAction(e, incId, 'classify', 'hayvan');
      e.deter(inc.x, inc.z, 14, 'speaker');
      e.feedPush('AİM: Sahaya uzaktan sesli anons yapıldı.', 'info', incId);
      performAction(e, incId, 'dispatch');
    } else {
      performAction(e, incId, 'classify', 'personel');
      performAction(e, incId, 'resolve');
    }
    const correct = (choice === 'hirsiz' && truth === 'thief') || (choice === 'hayvan' && truth === 'animal') || (choice === 'personel' && truth === 'staff');
    let text = '';
    let sub = '';
    if (correct) {
      text = 'DOĞRU KARAR!';
      sub = choice === 'hirsiz' && npc?.variant === 'pelt' ? 'Keskin göz! Post giymiş hırsızı fark ettin.' : choice === 'hirsiz' && npc?.variant === 'tree' ? 'Keskin göz! Ağaç kılığındaki hırsızı fark ettin — ağaçlar yürümez.' : choice === 'hirsiz' && npc?.variant === 'crawler' ? 'Keskin göz! Sürünerek gelen hırsızı fark ettin.' : choice === 'hirsiz' && npc?.variant === 'disguised' ? 'Sahte personeli yakaladın: kask yok, çitten girdi.' : choice === 'hirsiz' ? 'Siren çaldı, devriye yolda, AİM jandarmayı çağırdı.' : choice === 'hayvan' ? 'Hayvan sahadan güvenle uzaklaştırılıyor.' : 'Yetkili bakım personeli — alarm gerekmez.';
    } else if (truth === 'staff') {
      text = 'YANLIŞ ALARM!';
      sub = 'Bu kişi turuncu yelekli bakım personeliydi.';
    } else if (truth === 'animal') {
      text = choice === 'hirsiz' ? 'YANLIŞ ALARM!' : 'YANLIŞ KARAR';
      sub = 'Bu bir hayvandı.';
    } else if (truth === 'thief' && npc?.variant === 'tree') {
      text = 'KANDIRILDIN!';
      sub = 'O bir ağaç değildi: dallara bürünmüş bir hırsızdı. Yerinden oynayan ağaca dikkat!';
      if (choice === 'hayvan') sub += ' Devriye yine de yolda.';
    } else if (truth === 'thief' && (npc?.variant === 'pelt' || npc?.variant === 'crawler')) {
      text = 'KANDIRILDIN!';
      sub = npc.variant === 'pelt' ? 'Bu bir hayvan değil, post giymiş bir hırsızdı. Ön ayaklarına bak: insan eli!' : 'Hayvan gibi sürünen bir hırsızdı. Sırtındaki çantaya dikkat!';
      if (choice === 'hayvan') sub += ' Devriye yine de yolda.';
    } else if (truth === 'thief' && npc?.variant === 'disguised') {
      text = 'SAHTE PERSONEL!';
      sub = 'Yelek giymiş ama kaskı yok ve çitten girdi. Devriye yine de yolda.';
      if (choice === 'personel') sub = 'Yelek giymiş ama kaskı yok ve çitten girdi. Hırsız işine devam ediyor!';
    } else if (truth === 'thief') {
      text = 'DİKKAT, HIRSIZ!';
      sub = choice === 'hayvan' ? 'Bu bir hayvan değil, izinsiz bir kişiydi. Devriye yine de yolda.' : 'Bu bir hırsızdı ve işine devam ediyor!';
    }
    if (correct) sfx.correct();
    else sfx.wrong();
    // seri: art arda doğru kararlar puanı katlar (×1,5 / ×2 / ×3)
    const streak = correct ? get().streak + 1 : 0;
    const mult = streakMult(streak);
    const bonus = correct ? Math.round(CORRECT_PTS * (mult - 1)) : 0;
    if (correct && streak >= 2) text = `DOĞRU KARAR! ×${streak} SERİ`;
    if (correct && streak >= 2) sub = `${sub} Seri bonusu +${bonus}.`;
    if (!correct && get().streak >= 2) sub = `${sub} Seri bozuldu.`;
    set({
      decisions: { ...get().decisions, [incId]: { choice, correct, truth } },
      feedback: { text, sub, tone: correct ? 'good' : 'bad', id: ++fbSeq },
      streak,
      bestStreak: Math.max(get().bestStreak, streak),
      comboBonus: get().comboBonus + bonus,
    });
    const id = fbSeq;
    setTimeout(() => {
      if (get().feedback?.id === id) set({ feedback: null });
    }, 2600);
    useGame.setState({ simTick: useGame.getState().simTick + 1 });
  },

  demoResult: null,
  startDemo: () => {
    const g = useGame.getState();
    const lvl = FAIR_LEVELS.find((l) => l.id === get().levelId) ?? FAIR_LEVEL;
    const diff = DIFFS[get().difficulty];
    const night = get().tod === 'gece';
    const ov = diff.apply(lvl);
    // demo: aynı zorluk ama süre 40 sn (sim hızı dahil), hırsızlar hızlı gelsin
    const base: Partial<LevelDef> = { ...ov, ...(night ? nightApply({ ...lvl, ...ov }) : {}) };
    const demoLvl: Partial<LevelDef> = { ...base, duration: Math.round(DEMO_SECONDS * SIM_SPEED), demo: true, thieves: 0, animals: 0, staff: 0, tech: 0, falseSensor: 0, budget: 999999, thiefSpeedMult: 1.25, expo: get().expo };
    g.startLevel(lvl.id, demoLvl);
    const st = useGame.getState();
    const map = st.map!;
    const devices = buildFullLayout(map, night);
    if (get().expo) {
      // fuar modu demosu: Desecure kurulumunda çit hattı %100 kamera altında
      const plan = expoPerimeterPlan(map, night, lvl.weather ?? 'clear');
      plan.devices.forEach((d, k) => devices.push({ ...d, id: `XB${k}`, label: `BLT-${String(k + 1).padStart(2, '0')}` }));
    }
    const cov = computeCoverage(map, devices, night, lvl.weather);
    useGame.setState({
      fair: true,
      shopTypes: shopFor(night, get().expo),
      autoOrbit: true,
      showHelp: false,
      devices,
      coverage: cov,
      layers: { risk: false, coverage: false, blind: false, cones: true },
      focus: { x: 0, z: 0, dist: (buildDist(lvl.mapId) + 4) * (1 + (ov.mapGrow ?? 0) / 12), n: Date.now() },
    });
    useGame.getState().startSim();
    useGame.setState({ speed: SIM_SPEED });
    sfx.start();
    set({ phase: 'demo', demoResult: get().result, lastInput: Date.now() });
  },
  endDemo: () => {
    const e = getEngine();
    if (e && !e.ended) e.end('time');
    // oyuncunun kendi sonucuna geri dön
    set({ phase: 'result', result: get().demoResult ?? get().result, lastInput: Date.now() });
    useGame.setState({ phase: 'result', autoOrbit: false });
  },

  quitMission: () => {
    const e = getEngine();
    if (get().phase !== 'defend' || !e) return;
    useGame.setState({ paused: false });
    e.end('quit');
    useGame.getState().endSim();
  },

  finish: () => {
    const e = getEngine();
    const cov = useGame.getState().coverage;
    if (!e) return;
    const thievesAll = e.npcs.filter((n) => n.kind === 'thief');
    const counted = thievesAll.filter((n) => n.outcome === 'caught' || n.outcome === 'fled' || n.outcome === 'breach' || n.outcome === 'unresolved');
    const prevented = counted.filter((n) => n.outcome === 'caught' || n.outcome === 'fled').length;
    const breaches = counted.filter((n) => n.outcome === 'breach').length;
    const unresolved = counted.filter((n) => n.outcome === 'unresolved').length;
    const ds = Object.values(get().decisions);
    const correct = ds.filter((d) => d.correct).length;
    const wrong = ds.length - correct;
    const coverage = cov ? cov.coveragePct : 0;
    // tespit: sahaya giren hırsızlardan kamera / operatör / devriye / Desecure ürünü tarafından fark edilenler
    const entered = thievesAll.filter((n) => n.entered || n.firstDetectAt !== null);
    const detected = entered.filter((n) => n.firstDetectAt !== null).length;
    // puan üç şeye dayanır: korunan makara (ana hedef), tespit, doğru karar
    const REEL = 150, DETECT = 120, CORRECT = CORRECT_PTS, WRONG = 60, MISSED = 100;
    const missed = entered.length - detected; // sahaya girip hiç tespit edilemeyen hırsız
    const comboBonus = get().comboBonus;
    const bestStreak = get().bestStreak;
    const lines = [
      { label: 'Korunan kablo makarası', value: `${e.stockRemaining()}/${e.stockMax()}`, pts: e.stockRemaining() * REEL },
      { label: 'Tespit edilen hırsız', value: `${detected}/${entered.length}`, pts: detected * DETECT },
      { label: 'Doğru karar', value: `${correct}/${ds.length}`, pts: correct * CORRECT },
      ...(comboBonus > 0 ? [{ label: 'Seri bonusu', value: `en iyi ×${bestStreak}`, pts: comboBonus }] : []),
      { label: 'Yanlış karar / alarm', value: `${wrong}`, pts: -wrong * WRONG },
      { label: 'Tespit edilemeyen hırsız', value: `${missed}`, pts: -missed * MISSED },
    ];
    const dd = DIFFS[get().difficulty];
    // erken bırakma: süre dolmadan "Oyunu bitir" dendiyse ve hiçbir hırsızla karşılaşılmadıysa puan yok
    const quit = e.endReason === 'quit' && counted.length === 0 && ds.length === 0;
    const raw = quit ? 0 : Math.max(0, lines.reduce((s, l) => s + l.pts, 0));
    let total = Math.round(raw * dd.scoreMult);
    if (quit) lines.push({ label: 'Görev erken bırakıldı', value: 'Pes', pts: 0 });
    if (dd.scoreMult !== 1) lines.push({ label: `Zorluk: ${dd.label}`, value: `×${dd.scoreMult.toLocaleString('tr-TR')}`, pts: total - raw });
    const incidentsWithNpc = e.incidents.filter((i) => i.npcId).length;
    let max = Math.max(1, e.stockMax() * REEL + Math.max(entered.length, 1) * DETECT + Math.max(ds.length, incidentsWithNpc, 1) * CORRECT);
    const r = raw / max;
    const emptied = e.endReason === 'emptied';
    let stars = (emptied || quit ? 0 : r >= 0.75 ? 3 : r >= 0.5 ? 2 : r >= 0.25 ? 1 : 0) as FairResult['stars'];
    let title = quit ? 'Pes etti' : emptied ? 'Tesis boşaltıldı!' : ['Çaylak Operatör', 'Operatör', 'Kıdemli Operatör', 'Baş Operatör'][stars];
    // rozetler
    const night = !!useGame.getState().level?.night;
    const stormThieves = thievesAll.filter((n) => n.spawnedAt >= e.stormAt);
    const badges: Badge[] = [];
    if (!quit && !emptied) {
      if (ds.length >= 2 && wrong === 0) badges.push({ id: 'sifir', label: 'Sıfır yanlış alarm', desc: 'Her kararı doğru verdin' });
      if (counted.length >= 2 && counted.every((n) => n.outcome === 'caught')) badges.push({ id: 'jandarma', label: 'Jandarma dostu', desc: 'Bütün hırsızlar gözaltına alındı' });
      if (night && stars === 3) badges.push({ id: 'gece', label: 'Gece kartalı', desc: 'Gece görevinde 3 yıldız' });
      if (entered.length >= 1 && e.stockRemaining() === e.stockMax()) badges.push({ id: 'makara', label: 'Makara bekçisi', desc: 'Tek makara bile kaybolmadı' });
      if (bestStreak >= 3) badges.push({ id: 'seri', label: 'Seri avcı', desc: `${bestStreak} doğru karar üst üste` });
      if (stars >= 1 && stormThieves.length >= 1 && stormThieves.every((n) => n.outcome !== 'breach')) badges.push({ id: 'firtina', label: 'Fırtına dindi', desc: 'Alarm fırtınasında makara kaptırmadın' });
      if (e.blackoutCount > 0 && stars >= 2) badges.push({ id: 'karanlik', label: 'Karanlıkta nöbet', desc: 'Elektrik kesintisine rağmen sahayı korudun' });
      if (e.dustCount > 0 && stars >= 2) badges.push({ id: 'toz', label: 'Toz fırtınası gazisi', desc: 'Görüş düşükken sahayı korudun' });
      if (thievesAll.some((n) => n.detectedBy === 'Operatör')) badges.push({ id: 'goz', label: 'Keskin göz', desc: 'Kör noktadaki hırsızı kendin buldun' });
      if (e.tacticsUsed.siren + e.tacticsUsed.backup + e.tacticsUsed.light > 0 && stars >= 2) badges.push({ id: 'taktik', label: 'Taktikçi', desc: 'Müdahale hakkını yerinde kullandın' });
      if (e.weatherLabel() && stars >= 2) badges.push({ id: 'hava', label: e.level.weather === 'fog' ? 'Sis delici' : 'Yağmur nöbetçisi', desc: `${e.weatherLabel()} havada sahayı korudun` });
    }
    // fuar modu: puan sınır güvenliğine dayanır (karar kartı yok, AİM otomatik)
    const expoLvl = !!useGame.getState().level?.expo;
    let expoSum: FairResult['expo'] = undefined;
    if (expoLvl) {
      // kurulumun en iyi kapsaması (sabotaj ayrıca sayılır)
      const fencePct = e.fenceBestPct;
      const viaGap = thievesAll.filter((n) => n.viaGap).length;
      const unseenThefts = e.theftLog.filter((t) => !t.seen).length;
      const sabotaged = e.sabotageLog.length;
      expoSum = { fencePct, gaps: e.fenceGapCount(), viaGap, unseenThefts, sabotaged };
      lines.length = 0;
      lines.push(
        { label: 'Çit hattı kapsaması', value: `%${fencePct}`, pts: fencePct * 5 },
        { label: 'Korunan kablo makarası', value: `${e.stockRemaining()}/${e.stockMax()}`, pts: e.stockRemaining() * REEL },
        { label: 'AİM\'in durdurduğu hırsız', value: `${prevented}/${counted.length}`, pts: prevented * DETECT },
        { label: 'Fark edilmeden giren hırsız', value: `${missed}`, pts: -missed * MISSED },
        { label: 'Sabote edilen kamera', value: `${sabotaged}`, pts: -sabotaged * MISSED }
      );
      const raw2 = quit ? 0 : Math.max(0, lines.reduce((s, l) => s + l.pts, 0));
      const tot2 = Math.round(raw2 * dd.scoreMult);
      if (quit) lines.push({ label: 'Görev erken bırakıldı', value: 'Pes', pts: 0 });
      if (dd.scoreMult !== 1) lines.push({ label: `Zorluk: ${dd.label}`, value: `×${dd.scoreMult.toLocaleString('tr-TR')}`, pts: tot2 - raw2 });
      const max2 = 500 + e.stockMax() * REEL + Math.max(counted.length, 1) * DETECT;
      const r2 = raw2 / max2;
      const st2 = (emptied || quit ? 0 : r2 >= 0.75 ? 3 : r2 >= 0.5 ? 2 : r2 >= 0.25 ? 1 : 0) as FairResult['stars'];
      total = tot2;
      max = max2;
      stars = st2;
      title = quit ? 'Pes etti' : emptied ? 'Tesis boşaltıldı!' : ['Çaylak Operatör', 'Operatör', 'Kıdemli Operatör', 'Baş Operatör'][stars];
      if (!quit && !emptied && fencePct >= 100 && sabotaged === 0) badges.unshift({ id: 'sinir', label: 'Sınır bekçisi', desc: 'Çit hattının tamamı kamera kapsamındaydı' });
    }
    const result: FairResult = { expo: expoSum, total, max: Math.round(max * dd.scoreMult), stars, title, lines, prevented, thieves: counted.length, breaches: breaches + unresolved, correct, decisions: ds.length, coverage, attempts: thievesAll.length, animals: e.npcs.filter((n) => n.kind === 'animal').length, staff: e.npcs.filter((n) => n.kind === 'staff').length, incidents: e.incidents.length, aimReports: e.aimReports, materialLeft: e.stockRemaining(), detected, entered: entered.length, autoCatches: e.autoCatches, materialMax: e.stockMax(), endReason: e.endReason ?? 'time', badges, lootLost: e.lootLost, lostValue: e.lootLost * REEL_VALUE, bestStreak, comboBonus, blackouts: e.blackoutCount, duststorms: e.dustCount };
    const duel = get().duel;
    const campaign = get().campaign;
    set({
      phase: 'result',
      result,
      lastInput: Date.now(),
      duel: duel ? { ...duel, results: duel.turn === 0 ? [result, duel.results[1]] : [duel.results[0], result] } : null,
      campaign: campaign ? { ...campaign, results: [...campaign.results, result] } : null,
    });
    get().saveName('');
    sfx.win(stars);
  },

  saveName: (name) => {
    const r = get().result;
    if (!r) return;
    if (r.title === 'Pes etti') return; // pes eden skor tablosuna girmez
    const p = get().player;
    const entry: LbEntry = {
      id: `${Date.now()}`,
      name: p ? displayName(p) : name.trim().slice(0, 16) || 'Ziyaretçi',
      fullName: p ? `${p.first} ${p.last}` : undefined,
      score: r.total,
      stars: r.stars,
      mission: get().levelId,
      diff: get().difficulty,
      night: get().tod === 'gece',
      t: Date.now(),
    };
    const lb = [...get().lb, entry].sort((a, b) => b.score - a.score);
    saveLb(lb);
    set({ lb, myEntryId: entry.id });
  },

  touch: () => set({ lastInput: Date.now() }),
  setIntroSeen: () => set({ introSeen: true }),
  clearLb: () => {
    saveLb([]);
    set({ lb: [] });
  },
}));

export const IDLE_LIMIT = IDLE_MS;

export function todayTop(lb: LbEntry[], n: number) {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return lb.filter((e) => e.t >= d.getTime()).sort((a, b) => b.score - a.score).slice(0, n);
}

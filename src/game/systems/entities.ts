import type { ClassLabel, CriticalAsset, Device, NpcKind, NpcSub, Vec2 } from '../types';

export type NpcOutcome =
  | 'caught'
  | 'fled'
  | 'breach'
  | 'removed'
  | 'left'
  | 'ignored'
  | 'ok'
  | 'unresolved'
  | null;

export type ThiefVariant = 'cable' | 'runner' | 'sneak' | 'pair' | 'disguised' | 'crawler' | 'pelt' | 'tree';

export const THIEF_NAMES: Record<ThiefVariant, string> = {
  cable: 'Kablo hırsızı',
  runner: 'Koşucu hırsız',
  sneak: 'Sinsi hırsız',
  pair: 'Hırsız ekibi',
  disguised: 'Sahte personel',
  crawler: 'Sürünen hırsız',
  pelt: 'Post giymiş hırsız',
  tree: 'Ağaç kılıklı hırsız',
};

/** Yakalanmış ya da etkisiz kalmış hırsız (yakalanınca kaçmaya çalışır, jandarma alıp götürür) */
export const neutralized = (n: { state: string; outcome: string | null }) => n.state === 'caught' || n.state === 'arrested' || n.state === 'held' || n.outcome === 'caught';

/** Tesisteki çalınabilir malzeme (kablo makaraları) */
export interface Stock {
  assetId: string;
  name: string;
  max: number;
  cur: number;
}

/** Jandarma ekip aracı: AİM bildirimi / devriye yakalaması sonrası gelir, hırsızı alıp götürür */
export interface Gendarme {
  id: string;
  label: string;
  x: number;
  z: number;
  yaw: number;
  speed: number;
  path: Vec2[];
  pi: number;
  state: 'enroute' | 'arrest' | 'leave' | 'gone';
  targetNpc: string;
  /** aynı araçla alınacak diğer şüpheliler (hırsız ekibi) */
  queue: string[];
  incidentId: string | null;
  timer: number;
  replanAt: number;
  exit: Vec2;
  calledAt: number;
  /** gözaltı sırasında araçtan inen er */
  officer: { x: number; z: number; yaw: number; walking: boolean } | null;
}

export interface Waypoint {
  x: number;
  z: number;
  y: number;
  speed: number;
  water: boolean;
  tag: 'shore' | 'fence' | 'crest' | 'foot' | 'origin';
}

export interface NPC {
  id: string;
  variant: ThiefVariant | null;
  stealMult: number;
  /** ağaç kılıklı hırsız: kısa adımlarla ilerler, sonra ağaç gibi donar */
  treeT: number;
  treeMoving: boolean;
  /** fuar modu: kamera görmeyen çit bölümünden girdi */
  viaGap: boolean;
  /** fuar modu: sabote etmeye gittiği kamera (kimse onu görmüyor) */
  sabotageId: string | null;
  /** tekneyle gelen hırsız (HES): düz çizgi ara noktaları (su / baraj), nav'ı yok sayar */
  boat: boolean;
  boatX: number;
  wp: Waypoint[];
  /** kaçışta kara yolu bitince devam edecek tekne rotası */
  wpAfter: Waypoint[] | null;
  wpY0: number;
  wpLen: number;
  onWater: boolean;
  /** render: zemine göre ek yükseklik (baraj tepesi / su seviyesi) */
  yOff: number;
  /** geldiği nokta (doğum) ve çitten girdiği hücre — kaçarken aynı yoldan döner */
  originX: number;
  originZ: number;
  entryCell: number;
  look: number; // görünüm tohumu
  kind: NpcKind;
  sub: NpcSub;
  name: string;
  x: number;
  z: number;
  yaw: number;
  speed: number;
  baseSpeed: number;
  path: Vec2[];
  pi: number;
  state: string;
  resumeState: string;
  timer: number;
  target: CriticalAsset | null;
  crouch: boolean;
  detectability: number;
  active: boolean;
  gone: boolean;
  entered: boolean;
  enteredAt: number | null;
  spawnedAt: number;
  detectProg: number;
  sysSeenAt: number; // son sistem görüşü
  firstDetectAt: number | null;
  detectedBy: string | null;
  manualAt: number | null;
  incidentId: string | null;
  outcome: NpcOutcome;
  outcomeAt: number | null;
  stolen: boolean;
  stealProg: number;
  fleeing: boolean;
  alertCooldown: number;
  flashUntil: number;
  nextHintAt: number;
  lastFenceCell: number;
  walking: boolean;
  damage: number;
  leaderId: string | null;
  offX: number;
  offZ: number;
  falseAlarmed: boolean;
  lifeLimit: number;
  hasFlashlight: boolean;
  /** bu hırsız için çağrılan jandarma aracı */
  jandarmaId: string | null;
  /** taşıdığı çalıntı malzeme (kablo makarası adedi) ve alındığı varlık */
  loot: number;
  lootAsset: string | null;
  /** Desecure ürünü otomatik yakalama ilerlemesi */
  autoProg: number;
}

export interface Responder {
  id: string;
  deviceId: string;
  kind: 'guard' | 'vehicle';
  label: string;
  x: number;
  z: number;
  yaw: number;
  home: Vec2;
  route: Vec2[];
  ri: number;
  path: Vec2[];
  pi: number;
  state: 'patrol' | 'idle' | 'dispatch' | 'investigate' | 'return' | 'chase' | 'escort';
  timer: number;
  incidentId: string | null;
  targetNpc: string | null;
  departAt: number;
  replanAt: number;
  walking: boolean;
  speed: number;
}

export type IncidentKind = 'camera' | 'sensor' | 'perimeter' | 'manual' | 'patrol' | 'tech';
export type TechType = 'camera_offline' | 'gate_open' | 'sensor_fault';

export interface Incident {
  id: string;
  seq: number;
  kind: IncidentKind;
  title: string;
  detail: string;
  x: number;
  z: number;
  radius: number; // konum belirsizliği
  npcId: string | null;
  source: string;
  sector: string;
  createdAt: number;
  status: 'open' | 'dispatched' | 'resolved';
  verified: boolean;
  tracking: boolean;
  lastSeenAt: number;
  suggestion: { label: ClassLabel; conf: number } | null;
  truth: ClassLabel | null; // devriye raporu
  playerClass: ClassLabel | null;
  classifiedAt: number | null;
  firstActionAt: number | null;
  resolvedAt: number | null;
  actions: string[];
  aim: boolean;
  priority: 1 | 2 | 3;
  techType?: TechType;
  techDeviceId?: string;
  techGateId?: string;
  techFixAt?: number;
  closedEarly?: boolean;
  falseAlarm?: boolean;
  noticed: boolean; // oyuncu gördü mü (yeni etiketi)
  /** Desecure ürünü (MİK/MAS/MİA) şüpheliyi otomatik yakaladı */
  autoBy?: string;
}

export interface DeviceRuntime {
  dev: Device;
  yaw: number;
  disabled: boolean;
  ptzMode: 'sweep' | 'lock';
  ptzTarget: Vec2 | null;
  sweepPhase: number;
  cooldownUntil: number;
  activeUntil: number; // siren / hoparlör / projektör
  faulty: boolean;
  nextFaultAt: number;
  /** fuar modu: hırsız tarafından sabote edildi (görev sonuna dek kapalı) */
  sabotaged?: boolean;
}

export interface FeedItem {
  id: number;
  t: number;
  text: string;
  level: 'info' | 'warn' | 'alert' | 'ok';
  incidentId?: string;
}

export interface Hint {
  id: number;
  type: 'flashlight' | 'rustle' | 'silhouette' | 'gate';
  x: number;
  z: number;
  t: number;
  until: number;
  yaw: number;
}

export interface FalseAlarmRecord {
  t: number;
  reason: string;
  x: number;
  z: number;
}

export const truthOf = (kind: NpcKind | null): ClassLabel => {
  if (kind === 'thief') return 'insan';
  if (kind === 'animal') return 'hayvan';
  if (kind === 'staff') return 'personel';
  return 'yanlis';
};

export const CLASS_LABELS: Record<ClassLabel, string> = {
  insan: 'İzinsiz kişi',
  hayvan: 'Hayvan',
  arac: 'Araç',
  personel: 'Bakım personeli',
  yanlis: 'Yanlış alarm',
};

export const SUB_NAMES: Record<NpcSub, string> = {
  thief: 'İzinsiz kişi',
  dog: 'Köpek',
  sheep: 'Koyun',
  goat: 'Keçi',
  boar: 'Yaban domuzu',
  staff: 'Bakım personeli',
};

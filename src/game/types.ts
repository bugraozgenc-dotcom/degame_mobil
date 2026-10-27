// Ortak oyun tipleri — tüm sistemler aynı dünya koordinatlarını kullanır.
// Dünya: x (doğu +), z (güney +), y (yukarı). Kuzey = -z.
// Izgara hücresi 1 m. Hücre (i,j) merkezi: x = i - N/2 + 0.5, z = j - N/2 + 0.5

export type MapId = 'ges' | 'res' | 'tes' | 'jes' | 'hes' | 'bess';

export type EquipmentType =
  | 'fixedCam'
  | 'bulletCam'
  | 'ptzCam'
  | 'thermalCam'
  | 'motion'
  | 'perimeter'
  | 'speaker'
  | 'siren'
  | 'light'
  | 'tower'
  | 'drone'
  | 'patrol'
  | 'vehicle'
  | 'control'
  // Desecure ürünleri (bonus): şüpheliyi otomatik tespit edip AİM + jandarmaya bildirir
  | 'mik'
  | 'mas'
  | 'mia';

export type EquipmentCategory = 'camera' | 'sensor' | 'response' | 'support';

export interface EquipmentSpec {
  type: EquipmentType;
  name: string;
  code: string; // KAM, PTZ ...
  desc: string;
  cost: number;
  category: EquipmentCategory;
  footprint: 1 | 2 | 3;
  mountHeight: number; // göz / montaj yüksekliği (m)
  fov: number; // derece (360 = çok yönlü)
  range: number; // algılama / etki menzili (m)
  detectRate: number; // saniyede algılama ilerlemesi
  nightFactor: number; // gece menzil çarpanı (ışıksız)
  thermal?: boolean;
  rotatable?: boolean; // yerleştirmede yön seçimi
  limit?: number;
  /** Desecure bonus ürünü: ücretsiz, görev başına 1 hak; hırsızı otomatik yakalatır */
  bonus?: boolean;
  /** otomatik yakalama hızı (sn⁻¹) */
  autoRate?: number;
  stats: { label: string; value: string }[];
}

export interface Device {
  id: string;
  label: string;
  type: EquipmentType;
  i: number; // ayak izi sol-üst hücre
  j: number;
  x: number; // dünya merkezi
  z: number;
  yaw: number; // radyan, yön = (cos yaw, sin yaw)
  /** fuar modu çift bullet: ikinci başlığın yönü (radyan) */
  yaw2?: number;
  level: 1 | 2;
  emergency?: boolean;
}

export type Weather = 'clear' | 'rain' | 'fog';

export interface LevelDef {
  id: number;
  mapId: MapId;
  title: string;
  subtitle: string;
  difficulty: 'Kolay' | 'Orta' | 'Zor';
  desc: string;
  night: boolean;
  weather: Weather;
  budget: number;
  duration: number; // gerçek saniye (1x hız)
  clockStart: number; // saat (ondalık)
  clockSpan: number; // simüle edilen saat
  thieves: number;
  animals: number;
  staff: number;
  tech: number;
  falseSensor: number;
  stealTime: number;
  emergencyCharges: number;
  tips: string[];
  // zorluk ayarları (fuar görevi)
  stockTotal?: number; // toplam kablo makarası
  thiefSpeedMult?: number;
  thiefDetectMult?: number; // <1: kameralar zor görür
  trickyThieves?: boolean; // post giymiş / sürünen / sahte personel daha sık
  jandarmaSpeed?: number;
  jandarmaDelay?: number; // AİM bildiriminden sonra yola çıkış gecikmesi (sn)
  thiefCarry?: number; // hırsız başına götürülen makara
  noCorner?: boolean; // kaçan hırsız jandarmayı beklemez: yetişemezse kaçar
  demo?: boolean; // Desecure demosu: tüm kameralar otomatik tanımlar ve yakalatır
  storm?: boolean; // final: son 30 sn alarm fırtınası (iki olay üst üste)
  blackout?: boolean; // görev ortasında 10 sn elektrik kesintisi (gece)
  duststorm?: boolean; // görev ortasında 14 sn toz fırtınası (gündüz): kamera menzili düşer
  mapGrow?: number; // harita büyütmesi (hücre / yön) — zorluğa göre
  expo?: boolean; // fuar modu kuralları (çit hattına kamera, kapsama dışından giriş)
  turbines?: number; // RES türbin sayısı
}

export type ObstacleType = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7;
// 0 boş, 1 bina, 2 panel, 3 ağaç, 4 çalı (yeşillik), 5 çit, 6 kaya, 7 türbin

export interface BuildingDef {
  kind: 'control' | 'trafo' | 'inverter' | 'depot' | 'substation' | 'container' | 'turbinehall' | 'boiler' | 'stack' | 'cooling' | 'tank' | 'coal' | 'wellhead' | 'fancooler' | 'separator' | 'dam' | 'penstock' | 'battery' | 'pcs';
  name: string;
  x: number;
  z: number;
  w: number; // x boyutu
  d: number; // z boyutu
  h: number;
}

export interface CriticalAsset {
  id: string;
  name: string;
  kind: 'trafo' | 'inverter' | 'control' | 'depot' | 'turbine' | 'panels' | 'tank' | 'hall' | 'well' | 'penstock' | 'battery';
  x: number;
  z: number;
  ax: number; // yaklaşma noktası (yürünebilir)
  az: number;
  weight: number; // hırsız hedef ağırlığı
}

export interface Zone {
  name: string;
  x0: number;
  z0: number;
  x1: number;
  z1: number;
  critical?: boolean;
}

export interface Gate {
  id: string;
  name: string;
  cells: number[]; // hücre indeksleri
  x: number;
  z: number;
  axis: 'x' | 'z'; // çit hattı yönü
  main: boolean;
  outsideX: number; // kapının dışındaki yol noktası
  outsideZ: number;
}

export interface SpawnPoint {
  x: number;
  z: number;
  weight: number;
  side: 'N' | 'S' | 'E' | 'W';
  /** su üstünde doğum: hırsız tekneyle gelir (HES rezervuarı) */
  boat?: boolean;
}
/** tekne rotası (HES): su kıyısı, baraj tepesi, baraj eteği */
export interface BoatRoute {
  waterY: number;
  shoreZ: number;
  /** tepedeki çit hattı (kesilir) */
  fenceZ: number;
  crestZ: number;
  crestY: number;
  footZ: number;
}

export interface MapData {
  id: MapId;
  /** fuar modu: çit çevresi seyrekleştirildi (sınır görünür) */
  expo?: boolean;
  name: string;
  N: number;
  /** kuzey çit hattının dünya z'si (varsayılan −L); HES'te baraj eteği */
  fenceNorthZ?: number;
  boat?: BoatRoute;
  fMin: number; // çit hattı indeksleri
  fMax: number;
  heightAt: (x: number, z: number) => number;
  obsType: Uint8Array;
  obsH: Float32Array;
  nav: Uint8Array; // 0 yürünebilir, 1 engel, 2 çit, 3 kapı
  road: Uint8Array; // 0 yok, 1 asfalt/ana yol, 2 çakıl/servis, 3 platform
  risk: Uint8Array; // 0..3
  inside: Uint8Array; // çit içi iç alan
  buildings: BuildingDef[];
  panels: { x: number; z: number }[];
  trees: { x: number; z: number; s: number; kind: number }[];
  bushes: { x: number; z: number; s: number }[];
  rocks: { x: number; z: number; s: number }[];
  turbines: { x: number; z: number; name: string }[];
  gates: Gate[];
  assets: CriticalAsset[];
  zones: Zone[];
  spawns: SpawnPoint[];
  staffSpawns: { x: number; z: number; gateId: string }[];
}

export type NpcKind = 'thief' | 'animal' | 'staff';
export type NpcSub = 'thief' | 'dog' | 'sheep' | 'goat' | 'boar' | 'staff';

export type ClassLabel = 'insan' | 'hayvan' | 'arac' | 'personel' | 'yanlis';

export interface Vec2 {
  x: number;
  z: number;
}

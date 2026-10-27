import { EQUIPMENT } from './equipment';

// Fuar modu (şifreli): aynı oyun ve görevler, stant kurallarıyla.
// - Sabit kamera "Bullet Kamera (Sabit)" adını alır
// - Termal kameranın menzili diğer kameraların 3 katı
// - Kameralar çit hattına / köşelere konabilir, konunca en yakın çite döner
// - Kurulum süresi yok
// - Hırsız ve hayvanlar kapsama dışındaki çit bölümünden girer

// Şifre kodda açık yazılmaz (GitHub'da kaynak herkese açık); yalnızca özeti tutulur.
// Şifreyi değiştirmek için: tarayıcı konsolunda __expoHash('yeni-sifre') → çıkan değeri
// EXPO_PASSWORD_HASH'e yaz, EXPO_PASSWORD_LEN'i yeni uzunluğa ayarla.
export const EXPO_PASSWORD_LEN = 7;
const EXPO_PASSWORD_HASH = '81yp6mhz2u';

/** cyrb53: kısa, eşzamanlı özet (gizleme amaçlı, kriptografik değil) */
export function expoHash(str: string, seed = 0x5ec) {
  let h1 = 0xdeadbeef ^ seed;
  let h2 = 0x41c6ce57 ^ seed;
  for (let i = 0; i < str.length; i++) {
    const ch = str.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507);
  h1 ^= Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507);
  h2 ^= Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36);
}

export function checkExpoPassword(input: string) {
  return expoHash(input.trim().toLowerCase()) === EXPO_PASSWORD_HASH;
}
if (typeof window !== 'undefined') (window as unknown as { __expoHash: typeof expoHash }).__expoHash = expoHash;

const EXPO_KEY = 'desecure-fair-expo';

export const EXPO = { on: false };
/** fuar modunda termal kameranın kredisi (3× menzil karşılığı pahalı) */
export const EXPO_THERMAL_COST = 5000;

const BASE = {
  fixedName: EQUIPMENT.fixedCam.name,
  fixedDesc: EQUIPMENT.fixedCam.desc,
  fixedCost: EQUIPMENT.fixedCam.cost,
  thermalRange: EQUIPMENT.thermalCam.range,
  thermalCost: EQUIPMENT.thermalCam.cost,
  thermalStats: EQUIPMENT.thermalCam.stats.map((s) => ({ ...s })),
  thermalDesc: EQUIPMENT.thermalCam.desc,
};

export function setExpoMode(on: boolean) {
  EXPO.on = on;
  const f = EQUIPMENT.fixedCam;
  const t = EQUIPMENT.thermalCam;
  if (on) {
    f.name = 'Çift Bullet';
    f.cost = 400; // 2 × 200 kredi
    f.desc = 'Çift başlı bullet kamera. Yalnızca çit sınırına kurulur; iki başlık çit boyunca iki yöne, köşede iki çite bakar. Sonra döndürülebilir.';
    t.range = BASE.thermalRange * 3;
    t.cost = EXPO_THERMAL_COST; // fuar modunda pahalı: tek başına bir kenarı görür
    t.desc = 'Fuar modu: diğer kameraların 3 katı menzil. Gece ve düşük ışıkta tam performans.';
    t.stats = BASE.thermalStats.map((s) => (s.label === 'Menzil' ? { ...s, value: `${BASE.thermalRange * 3} m` } : { ...s }));
  } else {
    f.name = BASE.fixedName;
    f.desc = BASE.fixedDesc;
    f.cost = BASE.fixedCost;
    t.range = BASE.thermalRange;
    t.cost = BASE.thermalCost;
    t.desc = BASE.thermalDesc;
    t.stats = BASE.thermalStats.map((s) => ({ ...s }));
  }
  try {
    localStorage.setItem(EXPO_KEY, on ? '1' : '0');
  } catch {
    /* depolama yok */
  }
}

// Mobil sürüm: fuar modu her zaman açık (şifre yok)
export function loadExpoMode(): boolean {
  return true;
}

export const isCameraPlaceable = (t: string) => t === 'fixedCam' || t === 'bulletCam' || t === 'ptzCam' || t === 'thermalCam' || t === 'drone';
/** fuar modu: yalnızca çit sınırına kurulan tipler */
export const isFenceOnly = (t: string) => t === 'fixedCam' || t === 'bulletCam';

/** Fuar modu çift bullet: iki başlığın yönleri. Köşede iki çite, düz çitte iki yöne; içeride (olmamalı) dışa bakar. */
export function fenceYaws(L: number, x: number, z: number, zN = -L): [number, number] {
  const dE = L - x, dW = x + L, dS = L - z, dN = z - zN;
  const m = Math.min(dE, dW, dS, dN);
  if (m < 1.0) {
    const onEW = dE < 1.0 || dW < 1.0;
    const onNS = dS < 1.0 || dN < 1.0;
    const ax = (sgn: number) => Math.atan2(0, sgn); // x boyunca
    const az = (sgn: number) => Math.atan2(sgn, 0); // z boyunca
    if (onEW && onNS) return [ax(x <= 0 ? 1 : -1), az(z <= 0 ? 1 : -1)]; // köşe: iki çit boyunca içeri doğru
    if (onNS) return [0, Math.PI]; // kuzey/güney çiti: doğu + batı
    return [Math.PI / 2, -Math.PI / 2]; // doğu/batı çiti: güney + kuzey
  }
  const a = fenceYaw(L, x, z, [], zN);
  return [a, a + Math.PI];
}

/**
 * Fuar modu: kamera konunca otomatik yön.
 * - Çit hattının üstündeyse: çit boyunca bakar (kenarın ortasına doğru, uzun bölümü kapsar);
 *   köşede, üzerinde daha az kamera olan kenar boyunca bakar.
 * - Tesisin içindeyse: en yakın çite (dışa) bakar; köşeye yakınsa çapraz.
 */
export function fenceYaw(L: number, x: number, z: number, devices: { x: number; z: number; yaw: number; type: string }[] = [], zN = -L) {
  const dE = L - x, dW = x + L, dS = L - z, dN = z - zN;
  const m = Math.min(dE, dW, dS, dN);
  if (m < 1.0) {
    // çit hattı üstünde: hangi kenar(lar)?
    const onEW = dE < 1.0 || dW < 1.0; // doğu/batı kenarı (z boyunca uzanır)
    const onNS = dS < 1.0 || dN < 1.0; // kuzey/güney kenarı (x boyunca uzanır)
    const alongX = () => Math.atan2(0, x <= 0 ? 1 : -1); // kenar ortasına doğru
    const alongZ = () => Math.atan2(z <= 0 ? 1 : -1, 0);
    if (onEW && onNS) {
      // köşe: bu köşeye bitişik iki kenarı hangi kameralar izliyor? (kenar üstünde ve kenar boyunca bakan) — az izlenene dön
      const cams = devices.filter((d) => isCameraPlaceable(d.type) && !(Math.abs(d.x - x) < 0.6 && Math.abs(d.z - z) < 0.6));
      const sideZ = dN < 1.0 ? zN : L, sideX = Math.sign(x) * L; // bu köşenin K/G kenarı ve D/B kenarı
      const nNS = cams.filter((d) => Math.abs(d.z - sideZ) < 1.5 && Math.abs(Math.cos(d.yaw)) > 0.7).length;
      const nEW = cams.filter((d) => Math.abs(d.x - sideX) < 1.5 && Math.abs(Math.sin(d.yaw)) > 0.7).length;
      return nEW < nNS ? alongZ() : alongX();
    }
    return onNS ? alongX() : alongZ();
  }
  let dx = 0, dz = 0;
  if (dE - m < 2.5) dx += 1;
  if (dW - m < 2.5) dx -= 1;
  if (dS - m < 2.5) dz += 1;
  if (dN - m < 2.5) dz -= 1;
  if (!dx && !dz) return Math.atan2(-z, -x);
  return Math.atan2(dz, dx);
}

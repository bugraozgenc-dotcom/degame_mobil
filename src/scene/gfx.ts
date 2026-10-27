import { create } from 'zustand';

// Grafik kalitesi: kullanıcı seçer (Otomatik / Yüksek / Düşük); Otomatik'te kare hızı düşerse
// (zayıf GPU / kiosk) ayrıntı katmanı ve çözünürlük kendiliğinden azalır. Seçim cihazda saklanır.
export type GfxMode = 'auto' | 'high' | 'low';
export const GFX_MODES: GfxMode[] = ['auto', 'high', 'low'];
export const GFX_LABEL: Record<GfxMode, string> = { auto: 'Grafik: Otomatik', high: 'Grafik: Yüksek', low: 'Grafik: Düşük' };
export const GFX_DESC: Record<GfxMode, string> = {
  auto: 'Kare hızı düşerse kalite kendiliğinden azalır',
  high: 'Tam çözünürlük, gölgeler ve ayrıntı katmanı',
  low: 'Düşük çözünürlük, az gölge, ayrıntı yok — zayıf bilgisayarlar için',
};
const KEY = 'desecure-gfx';
function load(): GfxMode {
  try {
    const v = localStorage.getItem(KEY);
    if (v === 'auto' || v === 'high' || v === 'low') return v;
  } catch {
    /* depolama yok */
  }
  return 'auto';
}

interface GfxState {
  mode: GfxMode;
  /** Otomatik modda ölçülen düşük kare hızı */
  autoLow: boolean;
  /** uygulanan kalite: Düşük mod ya da Otomatik + düşük kare hızı */
  low: boolean;
  setMode: (m: GfxMode) => void;
  cycle: () => void;
  setLow: (v: boolean) => void;
}
const eff = (mode: GfxMode, autoLow: boolean) => mode === 'low' || (mode === 'auto' && autoLow);
export const useGfx = create<GfxState>((set, get) => ({
  mode: load(),
  autoLow: false,
  low: eff(load(), false),
  setMode: (mode) => {
    try {
      localStorage.setItem(KEY, mode);
    } catch {
      /* depolama yok */
    }
    set({ mode, low: eff(mode, get().autoLow) });
  },
  cycle: () => get().setMode(GFX_MODES[(GFX_MODES.indexOf(get().mode) + 1) % GFX_MODES.length]),
  setLow: (autoLow) => set({ autoLow, low: eff(get().mode, autoLow) }),
}));

let acc = 0;
let frames = 0;
let lowSince = 0;
/** her karede çağrılır (yalnızca Otomatik modda etkili): 4 sn ortalaması 28 fps altındaysa düşük kaliteye geç (bir kez) */
export function sampleFrame(dt: number) {
  acc += dt;
  frames++;
  if (acc < 4) return;
  const fps = frames / acc;
  acc = 0;
  frames = 0;
  if (fps < 28) {
    lowSince++;
    if (lowSince >= 1 && !useGfx.getState().autoLow) useGfx.getState().setLow(true);
  } else lowSince = 0;
}

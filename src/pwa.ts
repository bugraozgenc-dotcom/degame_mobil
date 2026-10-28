// PWA: service worker kaydı, "ana ekrana ekle" istemi, tam ekran + yatay kilit

type BIP = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }> };
let deferred: BIP | null = null;
const listeners = new Set<() => void>();

export const isStandalone = () =>
  (typeof window !== 'undefined' && (window.matchMedia?.('(display-mode: standalone)').matches || window.matchMedia?.('(display-mode: fullscreen)').matches)) ||
  (navigator as Navigator & { standalone?: boolean }).standalone === true;

export const isIOS = () => /iPhone|iPad|iPod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

/** Android/Chrome: tarayıcı kurulum istemi hazır mı */
export const canPromptInstall = () => !!deferred;
export function onInstallChange(cb: () => void) {
  listeners.add(cb);
  return () => listeners.delete(cb);
}
export async function promptInstall(): Promise<'accepted' | 'dismissed' | 'unavailable'> {
  if (!deferred) return 'unavailable';
  const d = deferred;
  await d.prompt();
  const r = await d.userChoice;
  deferred = null;
  listeners.forEach((f) => f());
  return r.outcome;
}

/** tam ekran + yatay kilit (Android Chrome); iOS Safari desteklemez, sessizce geçilir */
export function requestLandscape() {
  const el = document.documentElement as HTMLElement & { webkitRequestFullscreen?: () => Promise<void> };
  try {
    if (!document.fullscreenElement) {
      const p = el.requestFullscreen?.({ navigationUI: 'hide' } as FullscreenOptions) ?? el.webkitRequestFullscreen?.();
      if (p && typeof p.catch === 'function') p.catch(() => undefined);
    }
  } catch {
    /* desteklenmiyor */
  }
  try {
    const o = screen.orientation as ScreenOrientation & { lock?: (o: string) => Promise<void> };
    o?.lock?.('landscape').catch(() => undefined);
  } catch {
    /* desteklenmiyor */
  }
}

export function installPwa() {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferred = e as BIP;
    listeners.forEach((f) => f());
  });
  window.addEventListener('appinstalled', () => {
    deferred = null;
    listeners.forEach((f) => f());
  });
  if ('serviceWorker' in navigator && location.protocol === 'https:') {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('./sw.js').catch(() => undefined);
    });
  }
  // ilk dokunuşta yatay + tam ekran dene (kullanıcı hareketi gerekir)
  const once = () => {
    requestLandscape();
    window.removeEventListener('pointerdown', once);
  };
  window.addEventListener('pointerdown', once, { passive: true });
}

import { useEffect, useState } from 'react';
import { useFair, todayTop } from './fairStore';
import { SoundToggle } from '../ui/SoundToggle';
import { GfxToggle } from '../ui/GfxToggle';
import { Icon } from '../ui/Icons';
import { sfx } from '../audio/sfx';
import { APP_VERSION } from '../version';
import logoDark from '../assets/desecure-logo-dark.svg';

export const INSTAGRAM_HANDLE = 'desecuretechnology';
const DEVELOPER_URL = 'https://www.linkedin.com/in/bugrahanoz/';

/** tam ekran isteği (Android Chrome); iOS Safari desteklemez, sessizce geçilir */
export function requestFullscreen() {
  const el = document.documentElement as HTMLElement & { webkitRequestFullscreen?: () => Promise<void> };
  try {
    const p = el.requestFullscreen?.() ?? el.webkitRequestFullscreen?.();
    if (p && typeof p.catch === 'function') p.catch(() => undefined);
    const o = screen.orientation as ScreenOrientation & { lock?: (o: string) => Promise<void> };
    o?.lock?.('landscape').catch(() => undefined);
  } catch {
    /* desteklenmiyor */
  }
}

/** Mobil giriş ekranı: kiosk bekleme ekranının yerine sade bir başlangıç kartı */
export function MobileStart() {
  const start = useFair((s) => s.openRegister);
  const lb = useFair((s) => s.lb);
  const [best, setBest] = useState<{ name: string; score: number } | null>(null);
  useEffect(() => {
    const t = todayTop(lb, 1)[0];
    setBest(t ? { name: t.name, score: t.score } : null);
  }, [lb]);
  return (
    <div className="m-start">
      <div className="m-start-top">
        <img src={logoDark} alt="Desecure Technology" className="m-start-logo" />
        <div className="m-start-chips">
          <GfxToggle className="f-chip f-sound m-chip" />
          <SoundToggle className="f-chip f-sound m-chip" />
        </div>
      </div>
      <div className="m-start-body">
        <div className="m-start-kicker">
          <span className="m-live">
            <i />
          </span>
          7/24 Alarm İzleme Merkezi
        </div>
        <h1>
          Santrali <em>sen</em> koru.
        </h1>
        <p>
          AİM operatörü ol: kameraları çit hattına kur, kör nokta bırakma. Hırsızlar gördüğün yerden giremez — AİM anında müdahale eder.
        </p>
        <button
          type="button"
          className="f-cta m-start-cta"
          onClick={() => {
            sfx.modeNormal();
            requestFullscreen();
            start();
          }}
        >
          GÖREVE BAŞLA <Icon.chevron size={22} />
        </button>
        {best && (
          <div className="m-start-best">
            <Icon.flag size={14} /> Bugünün en iyisi: <b>{best.name}</b> · {Math.round(best.score).toLocaleString('tr-TR')}
          </div>
        )}
      </div>
      <div className="m-start-foot">
        <span>desecuretechnology.com · Instagram @{INSTAGRAM_HANDLE}</span>
        <span className="m-start-ver">
          <a href={DEVELOPER_URL} target="_blank" rel="noopener noreferrer">
            Geliştirici <b>Buğrahan Özgenç</b>
          </a>
          <b className="ver">{APP_VERSION}</b>
        </span>
      </div>
    </div>
  );
}

/** dikey tutulan telefonda uyarı */
export function RotateHint() {
  return (
    <div className="m-rotate" role="status">
      <Icon.rotate size={44} />
      <b>Telefonu yatay çevir</b>
      <span>Oyun yatay ekranda oynanır.</span>
    </div>
  );
}

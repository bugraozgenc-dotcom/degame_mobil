import { useEffect, useState } from 'react';
import { useFair, todayTop } from './fairStore';
import { SoundToggle } from '../ui/SoundToggle';
import { GfxToggle } from '../ui/GfxToggle';
import { Icon } from '../ui/Icons';
import { sfx } from '../audio/sfx';
import { APP_VERSION } from '../version';
import logoDark from '../assets/desecure-logo-dark.svg';
import { canPromptInstall, isIOS, isStandalone, onInstallChange, promptInstall, requestLandscape } from '../pwa';

export const INSTAGRAM_HANDLE = 'desecuretechnology';
const DEVELOPER_URL = 'https://www.linkedin.com/in/bugrahanoz/';

/** Mobil giriş ekranı: kiosk bekleme ekranının yerine sade bir başlangıç kartı */
export function MobileStart() {
  const start = useFair((s) => s.openRegister);
  const lb = useFair((s) => s.lb);
  const [best, setBest] = useState<{ name: string; score: number } | null>(null);
  const [installed, setInstalled] = useState(isStandalone());
  const [canPrompt, setCanPrompt] = useState(canPromptInstall());
  const [howTo, setHowTo] = useState(false);
  useEffect(() => {
    const off = onInstallChange(() => setCanPrompt(canPromptInstall()));
    return () => {
      off();
    };
  }, []);
  const install = async () => {
    sfx.uiHover();
    if (canPrompt) {
      const r = await promptInstall();
      if (r === 'accepted') setInstalled(true);
      return;
    }
    setHowTo(true);
  };
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
            requestLandscape();
            start();
          }}
        >
          GÖREVE BAŞLA <Icon.chevron size={22} />
        </button>
        <div className="m-start-row">
          {!installed && (
            <button type="button" className="f-ghost m-install" onClick={install}>
              <Icon.grid size={16} /> Ana ekrana ekle
            </button>
          )}
          {installed && (
            <span className="m-start-best">
              <Icon.check size={14} /> Ana ekrandan açıldı · tam ekran
            </span>
          )}
        </div>
        {best && (
          <div className="m-start-best">
            <Icon.flag size={14} /> Bugünün en iyisi: <b>{best.name}</b> · {Math.round(best.score).toLocaleString('tr-TR')}
          </div>
        )}
      </div>
      {howTo && <InstallHowTo onClose={() => setHowTo(false)} />}
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

/** iOS / diğer tarayıcılar: ana ekrana ekleme yönergesi */
function InstallHowTo({ onClose }: { onClose: () => void }) {
  const ios = isIOS();
  return (
    <div className="f-modal solid" onClick={onClose}>
      <div className="f-card m-howto" onClick={(e) => e.stopPropagation()} role="dialog" aria-labelledby="howto-t">
        <div className="f-kicker">Ana ekrana ekle</div>
        <h2 id="howto-t">Oyunu uygulama gibi aç</h2>
        <p>Ana ekrana eklenince oyun tam ekran ve yatay açılır; tarayıcı çubukları görünmez.</p>
        {ios ? (
          <ol className="m-steps">
            <li>
              Safari'de alttaki <b>Paylaş</b> düğmesine dokun (kare içinden çıkan ok).
            </li>
            <li>
              Listeden <b>"Ana Ekrana Ekle"</b> seçeneğini seç.
            </li>
            <li>
              <b>Ekle</b>'ye dokun; oyun ana ekranda "Desecure AİM" adıyla belirir.
            </li>
          </ol>
        ) : (
          <ol className="m-steps">
            <li>
              Tarayıcı menüsünü aç (<b>⋮</b>).
            </li>
            <li>
              <b>"Ana ekrana ekle"</b> ya da <b>"Uygulamayı yükle"</b> seçeneğine dokun.
            </li>
            <li>Onayla; oyun ana ekranda "Desecure AİM" adıyla belirir.</li>
          </ol>
        )}
        <button type="button" className="f-cta sm" onClick={onClose}>
          Anladım
        </button>
      </div>
    </div>
  );
}

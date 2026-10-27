import { useEffect, useMemo, useRef, useState } from 'react';
import { EQUIPMENT } from '../game/config/equipment';
import { FAIR_LEVELS } from '../game/config/levels';
import { BessArt, GesArt, HesArt, JesArt, ResArt, TesArt } from '../ui/MainMenu';
import { getEngine, MOBILE_PLACE, useGame } from '../game/store';
import { performAction } from '../game/systems/IncidentManager';
import type { Incident } from '../game/systems/entities';
import { GameScene } from '../scene/GameScene';
import { EquipmentShop, ModeBanner, Toasts } from '../ui/GameHUD';
import { EquipIcon, Icon } from '../ui/Icons';
import { SoundToggle } from '../ui/SoundToggle';
import { GfxToggle } from '../ui/GfxToggle';
import { GFX_DESC, GFX_LABEL, GFX_MODES, useGfx } from '../scene/gfx';
import { EXPO_PASSWORD_LEN, checkExpoPassword } from '../game/config/expo';
import { sfx } from '../audio/sfx';
import { APP_VERSION } from '../version';
import { renderShareCard, type ShareData } from './shareCard';
import { clearOutbox, flushOutbox, isMailConfigured, loadOutbox, outboxCsv } from './mailer';
import logoDark from '../assets/desecure-logo-dark.svg';
import crNormalImg from '../assets/cr-normal.jpg';
import crExpoImg from '../assets/cr-expo.jpg';
import ytQr from '../assets/youtube-qr.svg';
import { ProductThumb } from '../ui/ProductThumb';
import { BONUS_TYPES } from '../game/config/equipment';
import type { EquipmentType, LevelDef } from '../game/types';
import { AimPanel, useAim } from '../ui/AimPanel';
import { planStock } from '../game/systems/SimulationEngine';
import { create } from 'zustand';
import { CAMPAIGN_ORDER, capName, type Choice, DIFFS, type Difficulty, displayName, expoBudget, EXPO_THIEVES, IDLE_LIMIT, REEL_VALUE, SIM_SPEED, type Tactic, TACTIC_INFO, todayTop, useFair } from './fairStore';
import './fair.css';
import './mobile.css';
import { MobileStart, RotateHint } from './MobileStart';

const fmt = (n: number) => Math.round(n).toLocaleString('tr-TR');

function useNow(ms = 250) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), ms);
    return () => clearInterval(t);
  }, [ms]);
  return now;
}

/** Yıldızlar: satır metniyle dikey hizalı SVG */
function Stars({ n, size = 14 }: { n: number; size?: number }) {
  return (
    <>
      {[0, 1, 2].map((k) => (
        <svg key={k} width={size} height={size} viewBox="0 0 24 24" aria-hidden style={{ opacity: k < n ? 1 : 0.22 }}>
          <path d="M12 2.6l2.9 6.1 6.7.8-4.9 4.6 1.3 6.6L12 17.4l-6 3.3 1.3-6.6L2.4 9.5l6.7-.8z" fill="currentColor" />
        </svg>
      ))}
    </>
  );
}

function Logo({ h = 34 }: { h?: number }) {
  return <img src={logoDark} alt="Desecure Technology" className="f-logo" style={{ height: h }} />;
}

// ───────────── bekleme ekranı ─────────────
// İzleme merkezi temalı giriş ekranı (Konsept B): LED tabela, iki mod ekranı, operatör masası ve ÖGG
const CR_W = 1440;
const CR_H = 900;
const LockIcon = ({ size = 14 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <rect x="5" y="11" width="14" height="10" rx="2" />
    <path d="M8 11V7a4 4 0 0 1 8 0v4" />
  </svg>
);
const Chevron = ({ size = 24 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d="m9 6 6 6-6 6" />
  </svg>
);

function useStageScale() {
  const [s, setS] = useState(1);
  useEffect(() => {
    const f = () => setS(Math.min(window.innerWidth / CR_W, window.innerHeight / CR_H));
    f();
    window.addEventListener('resize', f);
    return () => window.removeEventListener('resize', f);
  }, []);
  return s;
}

function crClock(now: number) {
  const d = new Date(now);
  const p = (n: number) => String(n).padStart(2, '0');
  return { time: `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`, date: `${p(d.getDate())}.${p(d.getMonth() + 1)}.${d.getFullYear()}` };
}

/** arkadan görünen, ekranlara bakan özel güvenlik görevlisi */
function CrGuard() {
  return (
    <div className="cr-guard" role="img" aria-label="Ekrana bakan özel güvenlik görevlisi, arkadan görünüm">
      <i className="g-halo" />
      <i className="g-arm l" />
      <i className="g-arm r" />
      <i className="g-torso" />
      <i className="g-ep l" />
      <i className="g-ep r" />
      <i className="g-radio" />
      <i className="g-ant" />
      <i className="g-led" />
      <i className="g-collar" />
      <i className="g-neck" />
      <i className="g-ear l" />
      <i className="g-ear r" />
      <i className="g-head" />
      <i className="g-cap" />
      <i className="g-band" />
      <i className="g-strap" />
    </div>
  );
}

function Attract() {
  const start = useFair((s) => s.openRegister);
  const expo = useFair((s) => s.expo);
  const setExpo = useFair((s) => s.setExpo);
  const [askExpo, setAskExpo] = useState(false);
  const scale = useStageScale();
  const { time, date } = crClock(useNow(1000));
  const hover = () => sfx.uiHover();
  const led = askExpo ? 'ERİŞİM KİLİDİ · FUAR MODU' : expo ? 'FUAR MODU · GÖREVE HAZIR MISIN?' : 'GÖREVE HAZIR MISIN, OPERATÖR?';
  return (
    <div className={`cr ${expo || askExpo ? 'gold' : ''}`}>
      <div className="cr-stage" style={{ transform: `translate(-50%, -50%) scale(${scale})` }}>
        <i className="cr-glow" />
        {expo && <i className="cr-topline" />}

        <div className="cr-top">
          <img src={logoDark} alt="Desecure Technology" className="cr-logo" />
          <i className="cr-sep" />
          <div className="cr-live">
            <span className="cr-dot">
              <i />
              <i className="ring" />
            </span>
            CANLI · AİM ALARM İZLEME MERKEZİ
          </div>
          <div className="cr-flex" />
          {expo ? (
            <div className="cr-expo-chip">
              <LockIcon /> FUAR MODU AÇIK
            </div>
          ) : (
            <div className="cr-console">KONSOL 01 · NÖBET</div>
          )}
          <div className="cr-clock">{time}</div>
          <GfxToggle className="cr-sound cr-gfx" label />
          <SoundToggle className="cr-sound" label />
        </div>

        <div className="cr-led">
          <span key={led}>{led}</span>
        </div>

        <div className={`cr-wall ${askExpo ? 'dimmed' : ''}`}>
          <div className={`cr-screen red ${expo ? 'dim' : 'on'}`} onMouseEnter={hover}>
            <div className="cr-in">
              <img src={crNormalImg} alt="" className={`cr-bg ${expo ? 'gray' : ''}`} />
              <i className="cr-tint" />
              <i className="cr-scan" />
              {!expo && <i className="cr-sweep" />}
              {!expo && (
                <>
                  <i className="cr-brk tl" />
                  <i className="cr-brk tr" />
                  <i className="cr-brk bl" />
                  <i className="cr-brk br" />
                </>
              )}
              <div className="cr-label">
                <span>EKRAN 05 · MOD 01{expo ? ' · BEKLEMEDE' : ''}</span>
                {!expo && (
                  <span className="cr-state">
                    <i className="cr-rec green" />
                    HAZIR
                  </span>
                )}
              </div>
              {!expo && (
                <div className="cr-stamp r">
                  {date} {time}
                </div>
              )}
              <div className="cr-body">
                {!expo && <span className="cr-tag green">VARSAYILAN</span>}
                <div className="cr-title">Normal mod</div>
                {expo ? (
                  <button
                    type="button"
                    className="cr-btn ghost"
                    onClick={() => {
                      sfx.modeNormal();
                      setExpo(false);
                    }}
                  >
                    Normal moda geç
                  </button>
                ) : (
                  <button
                    type="button"
                    className="cr-btn red"
                    onClick={() => {
                      sfx.modeNormal();
                      start();
                    }}
                  >
                    GÖREVE BAŞLA <Chevron />
                  </button>
                )}
              </div>
            </div>
          </div>

          <div className={`cr-screen gold ${expo ? 'on' : ''}`} onMouseEnter={hover}>
            <div className="cr-in">
              <img src={crExpoImg} alt="" className="cr-bg" />
              <i className="cr-tint" />
              <i className="cr-scan" />
              <i className="cr-sweep" />
              {expo && (
                <>
                  <i className="cr-brk tl" />
                  <i className="cr-brk tr" />
                  <i className="cr-brk bl" />
                  <i className="cr-brk br" />
                </>
              )}
              <div className="cr-label">
                <span>EKRAN 06 · MOD 02</span>
                {expo ? (
                  <span className="cr-state granted">✓ ERİŞİM ONAYLANDI</span>
                ) : (
                  <span className="cr-state">
                    <LockIcon size={13} /> KİLİTLİ
                  </span>
                )}
              </div>
              <div className="cr-stamp">
                {date} {time}
              </div>
              <div className="cr-body">
                {expo ? (
                  <span className="cr-tag solid">AÇIK</span>
                ) : (
                  <span className="cr-tag gold">
                    <LockIcon size={13} /> ŞİFRELİ
                  </span>
                )}
                <div className="cr-title">Fuar modu</div>
                {expo ? (
                  <button
                    type="button"
                    className="cr-btn gold"
                    onClick={() => {
                      sfx.expoStart();
                      start();
                    }}
                  >
                    GÖREVE BAŞLA <Chevron />
                  </button>
                ) : (
                  <button
                    type="button"
                    className="cr-btn gold-ghost"
                    onClick={() => {
                      sfx.modeExpo();
                      setAskExpo(true);
                    }}
                  >
                    <LockIcon size={22} /> ŞİFRE İLE AÇ
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>

        <i className={`cr-desk ${askExpo ? 'dim' : ''}`} />
        <i className="cr-deskline" />
        <i className="cr-keyboard" />
        <i className="cr-joy-base" />
        <i className="cr-joy-stick" />
        <i className="cr-joy-ball" />
        <span className="cr-ptz">PTZ KONTROL</span>
        <CrGuard />

        <div className="cr-foot">desecuretechnology.com · Instagram @{INSTAGRAM_HANDLE}</div>
        <div className="cr-ver" title="Oyun sürümü">
          <b>{APP_VERSION}</b>
        </div>
        <a className="cr-dev" href={DEVELOPER_URL} target="_blank" rel="noopener noreferrer" title="LinkedIn profili">
          <span>Geliştirici</span>
          <b>Buğrahan Özgenç</b>
        </a>

        {askExpo && (
          <CrPassword
            onClose={() => {
              sfx.cancel();
              setAskExpo(false);
            }}
            onOk={() => {
              sfx.unlock();
              setExpo(true);
              setAskExpo(false);
            }}
          />
        )}
      </div>
    </div>
  );
}

/** fuar modu erişim kilidi: büyüyen terminal ekranı, 7 kutulu kod */
function CrPassword({ onClose, onOk }: { onClose: () => void; onOk: () => void }) {
  const [pw, setPw] = useState('');
  const [err, setErr] = useState(0);
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    ref.current?.focus();
  }, []);
  const n = EXPO_PASSWORD_LEN;
  useEffect(() => {
    ref.current?.focus();
  }, [err]);
  const submit = () => {
    if (checkExpoPassword(pw)) onOk();
    else {
      sfx.denied();
      setErr(Date.now());
      setPw('');
      ref.current?.focus();
    }
  };
  return (
    <>
      <div className="cr-lock-bg" onClick={onClose} />
      <form
        className="cr-lock"
        onClick={() => ref.current?.focus()}
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
        onKeyDown={(e) => {
          if (e.key === 'Escape') onClose();
        }}
      >
        <div className="cr-lock-in">
          <i className="cr-scan" />
          <i className="cr-sweep" />
          <div className="cr-lock-label">
            <span>EKRAN 06 · ERİŞİM KİLİDİ</span>
            {err ? (
              <span className="bad">● ERİŞİM REDDEDİLDİ</span>
            ) : (
              <span>
                <i className="cr-rec gold" /> ŞİFRE BEKLENİYOR
              </span>
            )}
          </div>
          <div className="cr-lock-head">
            <span className="cr-lock-ic">
              <LockIcon size={30} />
            </span>
            <div>
              <h2>Fuar modu</h2>
              <p>EIF için hazırlanmıştır.</p>
            </div>
          </div>
          <label htmlFor="cr-code" className="cr-lock-k">
            ERİŞİM KODU
          </label>
          <div className="cr-code-wrap">
            <div key={err} className={`cr-code ${err ? 'err' : ''}`}>
              {Array.from({ length: n }, (_, k) => (
                <span key={k} className={k < pw.length ? 'f' : k === pw.length ? 'cur' : ''}>
                  {k < pw.length ? '●' : k === pw.length ? <i className="caret" /> : null}
                </span>
              ))}
            </div>
            <input
              id="cr-code"
              ref={ref}
              type="password"
              value={pw}
              maxLength={n}
              autoComplete="off"
              aria-label="Erişim kodu"
              onChange={(e) => {
                if (e.target.value.length > pw.length) sfx.key();
                setPw(e.target.value);
                setErr(0);
              }}
            />
          </div>
          <div className="cr-lock-btns">
            <button type="button" className="cr-btn ghost sm" onClick={onClose}>
              Vazgeç
            </button>
            <button type="submit" className="cr-btn gold sm">
              KİLİDİ AÇ <Chevron size={20} />
            </button>
          </div>
        </div>
      </form>
    </>
  );
}

/** Günün Baş Operatörü — stantta büyük görünür */
function TopOperator({ e, compact }: { e: { name: string; fullName?: string; score: number; stars: number; mission?: number; diff?: Difficulty; night?: boolean }; compact?: boolean }) {
  return (
    <div className={`f-topop ${compact ? 'compact' : ''}`}>
      <span className="f-topop-crown" aria-hidden>
        <svg width="26" height="26" viewBox="0 0 24 24" fill="currentColor"><path d="M3 8l4.5 4L12 5l4.5 7L21 8l-1.6 10H4.6L3 8zm1.6 12h14.8v2H4.6v-2z" /></svg>
      </span>
      <div className="f-topop-txt">
        <span className="f-topop-k">{PRIZE_TEXT ? 'Günün Baş Operatörü · ödül standımızda' : 'Günün Baş Operatörü'}</span>
        <b>
          {e.fullName ?? e.name} <MissionTag id={e.mission} diff={e.diff} night={e.night} />
        </b>
      </div>
      <span className="f-topop-sc">
        <Stars n={e.stars} /> {fmt(e.score)}
      </span>
    </div>
  );
}
/** geliştirici bağlantısı (açılış ekranı, sağ alt) */
const DEVELOPER_URL = 'https://www.linkedin.com/in/bugrahanoz/';
/** stant ödülü metni — boş bırakılırsa ödül yazısı çıkmaz */
const PRIZE_TEXT = 'Günün Baş Operatörü standımızdan ödülünü alır!';

// ───────────── kayıt (ad soyad) ─────────────
function Register() {
  const register = useFair((s) => s.register);
  const registerDuel = useFair((s) => s.registerDuel);
  const toAttract = useFair((s) => s.toAttract);
  const [first, setFirst] = useState('');
  const [last, setLast] = useState('');
  const [duel, setDuel] = useState(false);
  const [first2, setFirst2] = useState('');
  const [last2, setLast2] = useState('');
  const [tried, setTried] = useState(false);
  const firstRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    firstRef.current?.focus();
  }, []);
  const okFirst = first.trim().length >= 2;
  const okLast = last.trim().length >= 2;
  const ok2 = !duel || (first2.trim().length >= 2 && last2.trim().length >= 2);
  return (
    <div className="f-modal solid">
      <form
        className="f-card f-register"
        onSubmit={(e) => {
          e.preventDefault();
          setTried(true);
          if (!okFirst || !okLast || !ok2) return;
          if (duel) registerDuel({ first: capName(first), last: capName(last) }, { first: capName(first2), last: capName(last2) });
          else register(first, last);
        }}
      >
        <Logo h={34} />
        <div className="f-kicker">Göreve kayıt</div>
        <h2>{duel ? 'Düello: iki operatör' : 'Operatör, adın nedir?'}</h2>
        <div className="f-mode-tabs" role="tablist">
          <button type="button" role="tab" aria-selected={!duel} className={!duel ? 'on' : ''} onClick={() => setDuel(false)}>
            <Icon.patrol size={18} /> Tek oyuncu
          </button>
          <button type="button" role="tab" aria-selected={duel} className={duel ? 'on' : ''} onClick={() => setDuel(true)}>
            <Icon.patrol size={18} />
            <Icon.patrol size={18} /> 2 oyuncu · düello
          </button>
        </div>
        {duel && <div className="f-note">Aynı saha, aynı olaylar, sırayla: önce 1. oyuncu, sonra 2. oyuncu. Yüksek puan kazanır.</div>}
        <div className="f-fields">
          <label htmlFor="fair-first">
            {duel ? '1. oyuncu · Ad' : 'Ad'}
            <input id="fair-first" ref={firstRef} value={first} maxLength={24} autoComplete="off" placeholder="Adın" className={tried && !okFirst ? 'err' : ''} onChange={(e) => setFirst(e.target.value)} />
          </label>
          <label htmlFor="fair-last">
            {duel ? '1. oyuncu · Soyad' : 'Soyad'}
            <input id="fair-last" value={last} maxLength={24} autoComplete="off" placeholder="Soyadın" className={tried && !okLast ? 'err' : ''} onChange={(e) => setLast(e.target.value)} />
          </label>
        </div>
        {duel && (
          <div className="f-fields">
            <label htmlFor="fair-first2">
              2. oyuncu · Ad
              <input id="fair-first2" value={first2} maxLength={24} autoComplete="off" placeholder="Rakibin adı" className={tried && first2.trim().length < 2 ? 'err' : ''} onChange={(e) => setFirst2(e.target.value)} />
            </label>
            <label htmlFor="fair-last2">
              2. oyuncu · Soyad
              <input id="fair-last2" value={last2} maxLength={24} autoComplete="off" placeholder="Rakibin soyadı" className={tried && last2.trim().length < 2 ? 'err' : ''} onChange={(e) => setLast2(e.target.value)} />
            </label>
          </div>
        )}
        {tried && (!okFirst || !okLast || !ok2) && <div className="f-err">Ad ve soyad en az 2 harf olmalı.</div>}
        <div className="f-note">Skor tablosunda adın kısaltılarak görünür (ör. {first.trim() && last.trim() ? displayName({ first: capName(first), last: capName(last) }) : 'Ayşe Y.'}).</div>
        <div className="f-reg-actions">
          <button type="submit" className="f-cta sm">
            Göreve başla <Icon.chevron size={20} />
          </button>
          <button type="button" className="f-ghost" onClick={toAttract}>
            Vazgeç
          </button>
        </div>
      </form>
    </div>
  );
}

const MISSION_META: Record<number, { code: string; sub: string; art: React.ReactNode }> = {
  101: { code: 'GES', sub: 'Güneş Enerjisi Santrali', art: <GesArt /> },
  102: { code: 'RES', sub: 'Rüzgâr Enerjisi Santrali', art: <ResArt /> },
  103: { code: 'TES', sub: 'Termik Santral', art: <TesArt /> },
  104: { code: 'JES', sub: 'Jeotermal Enerji Santrali', art: <JesArt /> },
  105: { code: 'HES', sub: 'Hidroelektrik Santrali', art: <HesArt /> },
  106: { code: 'BESS', sub: 'Batarya Enerji Depolama', art: <BessArt /> },
};

function MissionTag({ id, diff, night }: { id?: number; diff?: Difficulty; night?: boolean }) {
  if (!id || !MISSION_META[id]) return null;
  return (
    <>
      <i className="f-mtag">{MISSION_META[id].code}</i>
      {night && <i className="f-mtag dt-night">GECE</i>}
      {diff && diff !== 'normal' && <i className={`f-mtag dt-${diff}`}>{DIFFS[diff].short}</i>}
    </>
  );
}

const DIFF_ORDER: Difficulty[] = ['kolay', 'normal', 'zor'];

function TimePicker() {
  const tod = useFair((s) => s.tod);
  const setTod = useFair((s) => s.setTod);
  return (
    <div className="f-diff" role="radiogroup" aria-label="Görev zamanı">
      <div className="f-diff-t">Zaman</div>
      <div className="f-diff-opts two">
        <button role="radio" aria-checked={tod === 'gunduz'} className={`f-diff-opt tod-day ${tod === 'gunduz' ? 'on' : ''}`} onClick={() => setTod('gunduz')}>
          <span className="dn">
            <Icon.sun size={18} /> Gündüz
          </span>
        </button>
        <button role="radio" aria-checked={tod === 'gece'} className={`f-diff-opt tod-night ${tod === 'gece' ? 'on' : ''}`} onClick={() => setTod('gece')}>
          <span className="dn">
            <Icon.moon size={18} /> Gece
          </span>
        </button>
      </div>
    </div>
  );
}

function DifficultyPicker() {
  const diff = useFair((s) => s.difficulty);
  const setDiff = useFair((s) => s.setDifficulty);
  return (
    <div className="f-diff" role="radiogroup" aria-label="Zorluk seviyesi">
      <div className="f-diff-t">Zorluk</div>
      <div className="f-diff-opts">
        {DIFF_ORDER.map((d) => (
          <button key={d} role="radio" aria-checked={diff === d} className={`f-diff-opt dt-${d} ${diff === d ? 'on' : ''}`} onClick={() => setDiff(d)}>
            <span className="dn">
              {d === 'zor' && <Icon.alert size={18} />}
              {DIFFS[d].label}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}

function MissionSelect() {
  const select = useFair((s) => s.selectMission);
  const diff = useFair((s) => s.difficulty);
  const tod = useFair((s) => s.tod);
  const player = useFair((s) => s.player);
  const toAttract = useFair((s) => s.toAttract);
  const duel = useFair((s) => s.duel);
  const startCampaign = useFair((s) => s.startCampaign);
  const lb = useFair((s) => s.lb);
  const expo = useFair((s) => s.expo);
  // fuar modu: kredi tam sınır planına göre hesaplanır — kartlarda da o değer görünsün (açık hava tahmini)
  const [expoBud, setExpoBud] = useState<Record<string, number>>({});
  useEffect(() => {
    if (!expo) return;
    let alive = true;
    let k = 0;
    let t = 0;
    setExpoBud({});
    const step = () => {
      if (!alive || k >= FAIR_LEVELS.length) return;
      const l = FAIR_LEVELS[k++];
      const b = expoBudget({ ...l, ...DIFFS[diff].apply(l) } as LevelDef, tod === 'gece', 'clear');
      if (alive) setExpoBud((m) => ({ ...m, [l.id]: b }));
      t = window.setTimeout(step, 30);
    };
    t = window.setTimeout(step, 60);
    return () => {
      alive = false;
      window.clearTimeout(t);
    };
  }, [expo, diff, tod]);
  const dd = DIFFS[diff];
  const ov = dd.apply(FAIR_LEVELS[0]);
  const grow = ov.mapGrow ?? 0;
  const sizeLabel = grow >= 8 ? 'Büyük saha' : grow >= 4 ? 'Orta saha' : 'Küçük saha';
  // oyuncunun bu oturumda / bugün en iyi skoru (kart rozeti)
  const bestOf = (id: number) => todayTop(lb, 999).filter((e) => e.mission === id).sort((a, b) => b.score - a.score)[0];
  const NEW_IDS = [104, 105, 106];
  return (
    <div className="f-modal solid">
      <div className="f-select">
        <div className="f-select-head">
          <Logo h={30} />
          <div className="f-kicker">Görev seçimi</div>
          <h2>{player ? `${player.first}, h` : 'H'}angi tesisi koruyacaksın?</h2>
        </div>
        <div className="f-select-body">
          <aside className="f-select-side">
            <div className="f-pickers">
              <TimePicker />
              <DifficultyPicker />
            </div>
            <div className="f-sum" aria-live="polite">
              <div className="f-sum-t">Görev özeti</div>
              <div className="f-sum-row">
                <span className="f-sum-chip">
                  <Icon.siren size={16} /> {expo ? EXPO_THIEVES[diff] : ov.thieves ?? 3} hırsız
                </span>
                <span className="f-sum-chip">
                  <Icon.grid size={16} /> {sizeLabel}
                </span>
                <span className="f-sum-chip">
                  <Icon.clock size={16} /> {expo ? 'Süresiz kurulum' : `${dd.build} sn kurulum`}
                </span>
                <span className="f-sum-chip">
                  {tod === 'gece' ? <Icon.moon size={16} /> : <Icon.sun size={16} />} {tod === 'gece' ? 'Gece · termal' : 'Gündüz'}
                </span>
                {diff === 'zor' && (
                  <span className="f-sum-chip hot">
                    <Icon.alert size={16} /> RES'te 6 türbin
                  </span>
                )}
              </div>
              <div className="f-sum-note">Puan çarpanı ×{dd.scoreMult.toLocaleString('tr-TR')} · {diff === 'kolay' ? 'yeni başlayanlar için' : diff === 'normal' ? 'dengeli görev' : 'uzman operatörler için'}</div>
            </div>
            {!duel && (
              <button className="f-campaign-btn" onClick={startCampaign}>
                <span className="fcb-ic">
                  <Icon.flag size={22} />
                </span>
                <span>
                  <b>MEYDAN OKUMA</b>
                  <small>6 tesis art arda · vaka dosyaları · toplam puan</small>
                </span>
                <Icon.chevron size={20} />
              </button>
            )}
            <button className="f-ghost" onClick={toAttract}>
              Vazgeç
            </button>
          </aside>
          <div className="f-missions" role="list">
            {FAIR_LEVELS.map((l, k) => {
              const meta = MISSION_META[l.id];
              const budget = expo
                ? expoBud[l.id]
                  ? fmt(expoBud[l.id])
                  : '…'
                : fmt(Math.round(((DIFFS[diff].apply(l).budget ?? l.budget) * (tod === 'gece' ? 1.15 : 1)) / 100) * 100);
              const best = bestOf(l.id);
              return (
                <button key={l.id} className={`f-mission-card ${k === 0 ? 'rec' : ''}`} role="listitem" onClick={() => select(l.id)} aria-label={`${meta.code} · ${meta.sub}`}>
                  <div className="fm-art">
                    {meta.art}
                    <span className="fm-code">{meta.code}</span>
                    {k === 0 && <span className="fm-tag rec">ÖNERİLEN</span>}
                    {NEW_IDS.includes(l.id) && <span className="fm-tag new">YENİ</span>}
                    <span className="fm-go">
                      Seç <Icon.chevron size={16} />
                    </span>
                  </div>
                  <div className="fm-body">
                    <div className="fm-sub">{meta.sub}</div>
                    <div className="fm-desc">{l.desc}</div>
                    <div className="fm-stats">
                      <span title="Başlangıç bütçesi">
                        <Icon.coin size={15} /> {budget}
                      </span>
                      <span title="Görev süresi">
                        <Icon.clock size={15} /> {Math.round(l.duration / SIM_SPEED)} sn
                      </span>
                      {best ? (
                        <span className="fm-best" title="Günün en iyi puanı">
                          <Stars n={best.stars} size={12} /> {fmt(best.score)}
                        </span>
                      ) : (
                        <span className="fm-best dim">Bugün oynanmadı</span>
                      )}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

// ───────────── üst bar ─────────────
// ───────────── oyun menüsü (ana sayfa / oyunu bitir) ─────────────
const useMenu = create<{ open: boolean; set: (v: boolean) => void }>((set) => ({ open: false, set: (open) => set({ open }) }));

function ReelIcon({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="2" />
      <circle cx="12" cy="12" r="5.5" fill="#c8742f" stroke="currentColor" strokeWidth="1.2" />
      <circle cx="12" cy="12" r="1.8" fill="currentColor" />
    </svg>
  );
}

/** Tesisteki kablo makarası sayacı */
function MaterialChip() {
  useGame((s) => s.simTick);
  const map = useGame((s) => s.map);
  const level = useGame((s) => s.level);
  const phase = useFair((s) => s.phase);
  const e = getEngine();
  let cur = 0, max = 0;
  if ((phase === 'defend' || phase === 'demo') && e) {
    cur = e.stockRemaining();
    max = e.stockMax();
  } else if (map && level) {
    max = planStock(map, level).reduce((t, x) => t + x.max, 0);
    cur = max;
  }
  if (!max) return null;
  return (
    <div className={`f-chip reels ${cur < max ? 'low' : ''} ${cur <= Math.ceil(max / 3) ? 'hot' : ''}`} title="Tesisteki kablo makaraları">
      <ReelIcon size={20} /> {cur}/{max}
      <em className="lbl"> makara</em>
    </div>
  );
}

/** menüde grafik kalitesi seçimi */
function GfxPicker() {
  const mode = useGfx((s) => s.mode);
  const setMode = useGfx((s) => s.setMode);
  return (
    <div className="f-gfx-pick" role="radiogroup" aria-label="Grafik kalitesi">
      <div className="f-gfx-t">Grafik kalitesi</div>
      <div className="f-gfx-opts">
        {GFX_MODES.map((m) => (
          <button key={m} type="button" role="radio" aria-checked={mode === m} className={`f-gfx-opt ${mode === m ? 'on' : ''}`} onClick={() => setMode(m)} title={GFX_DESC[m]}>
            {GFX_LABEL[m].replace('Grafik: ', '')}
          </button>
        ))}
      </div>
      <div className="f-gfx-d">{GFX_DESC[mode]}</div>
    </div>
  );
}

function MenuButton() {
  const set = useMenu((s) => s.set);
  return (
    <button className="f-chip f-menu-btn" onClick={() => set(true)} aria-label="Oyun menüsü" title="Ana sayfa / Oyunu bitir">
      <Icon.menu size={20} />
    </button>
  );
}

function GameMenu() {
  const open = useMenu((s) => s.open);
  const setOpen = useMenu((s) => s.set);
  const phase = useFair((s) => s.phase);
  const toAttract = useFair((s) => s.toAttract);
  const quit = useFair((s) => s.quitMission);
  const buildLeft = useRef(0);
  // menü açıkken oyun durur (kurulum sayacı da)
  useEffect(() => {
    if (!open) return;
    const ph = useFair.getState().phase;
    if (ph === 'defend') useGame.setState({ paused: true });
    if (ph === 'build') buildLeft.current = Math.max(0, useFair.getState().buildEndsAt - Date.now());
    const keep = ph === 'build' ? setInterval(() => useFair.setState({ buildEndsAt: Date.now() + buildLeft.current }), 200) : 0;
    return () => {
      if (keep) clearInterval(keep);
      if (useFair.getState().phase === 'defend') useGame.setState({ paused: false });
    };
  }, [open]);
  useEffect(() => {
    if (phase !== 'build' && phase !== 'defend') setOpen(false);
  }, [phase, setOpen]);
  if (!open || (phase !== 'build' && phase !== 'defend')) return null;
  return (
    <div className="f-modal solid" onClick={() => setOpen(false)}>
      <div className="f-card f-menu" onClick={(ev) => ev.stopPropagation()} role="dialog" aria-labelledby="fmenu-t">
        <div className="f-kicker">Oyun duraklatıldı</div>
        <h2 id="fmenu-t">Ne yapmak istersin?</h2>
        <GfxPicker />
        <button className="f-menu-opt primary" onClick={() => setOpen(false)}>
          <Icon.play size={24} />
          <span>
            Devam et<small>Kaldığın yerden sürdür</small>
          </span>
        </button>
        {phase === 'defend' && (
          <button
            className="f-menu-opt"
            onClick={() => {
              setOpen(false);
              quit();
            }}
          >
            <Icon.flag size={24} />
            <span>
              Oyunu bitir<small>Görevi şimdi sonlandır ve puanını gör</small>
            </span>
          </button>
        )}
        <button
          className="f-menu-opt"
          onClick={() => {
            setOpen(false);
            useGame.setState({ paused: false });
            toAttract();
          }}
        >
          <Icon.rotate size={24} />
          <span>
            Ana sayfaya dön<small>{phase === 'defend' ? 'Bu görev puanlanmaz' : 'Kurulum iptal edilir'}</small>
          </span>
        </button>
      </div>
    </div>
  );
}

/** zorluk göstergesi: 1–3 dolu çubuk */
function DiffBars({ level }: { level: 1 | 2 | 3 }) {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden>
      {[0, 1, 2].map((k) => (
        <rect key={k} x={1.5 + k * 5} y={10 - k * 4} width="3.6" height={4.5 + k * 4} rx="1" fill="currentColor" opacity={k < level ? 1 : 0.28} />
      ))}
    </svg>
  );
}

function FairTop({ right }: { right: React.ReactNode }) {
  const phase = useFair((s) => s.phase);
  const diff = useFair((s) => s.difficulty);
  const nightTop = useGame((s) => !!s.level?.night);
  const weather = useGame((s) => s.level?.weather ?? 'clear');
  const player = useFair((s) => s.player);
  const levelId = useFair((s) => s.levelId);
  const duel = useFair((s) => s.duel);
  const campaign = useFair((s) => s.campaign);
  const expoTop = useGame((s) => !!s.level?.expo);
  const level = FAIR_LEVELS.find((l) => l.id === levelId) ?? FAIR_LEVELS[0];
  const steps = [
    ['build', 'Kur'],
    ['defend', 'Savun'],
    ['result', 'Sonuç'],
  ];
  const idx = steps.findIndex((s) => s[0] === phase);
  return (
    <div className="f-top">
      <Logo h={30} />
      <div className="f-mission">
        <span className={`f-badge ${nightTop ? 'night' : 'day'}`} title={nightTop ? 'Gece görevi' : 'Gündüz görevi'} aria-label={nightTop ? 'Gece görevi' : 'Gündüz görevi'}>
          {nightTop ? <Icon.moon size={16} /> : <Icon.sun size={16} />}
        </span>
        <span className={`f-badge dt-${diff}`} title={`Zorluk: ${DIFFS[diff].label}`} aria-label={`Zorluk: ${DIFFS[diff].label}`}>
          <DiffBars level={diff === 'kolay' ? 1 : diff === 'normal' ? 2 : 3} />
        </span>
        {weather !== 'clear' && (
          <span className={`f-badge wx-${weather}`} title={weather === 'fog' ? 'Sisli hava: kamera menzili kısa' : 'Yağmurlu hava: görüş düşük'} aria-label={weather === 'fog' ? 'Sisli' : 'Yağmurlu'}>
            {weather === 'fog' ? <Icon.fog size={16} /> : <Icon.rain size={16} />}
          </span>
        )}
        {duel && (
          <span className="f-badge duel" title="Düello">
            {duel.turn + 1}/2
          </span>
        )}
        {campaign && (
          <span className="f-badge camp" title="Meydan okuma">
            {campaign.idx + 1}/{CAMPAIGN_ORDER.length}
          </span>
        )}
        {expoTop && (
          <span className="f-badge expo" title="Fuar modu: çit üstü kamera, termal 3×, süre yok">
            FUAR
          </span>
        )}
        <span className="f-mt">
          <b>{level.title.split(' ')[0]}</b>
          <span className="rest"> {level.title.split(' ').slice(1).join(' ')}</span>
        </span>
      </div>
      <div className="f-stepper">
        {steps.map(([k, l], i) => (
          <span key={k} className={i === idx ? 'on' : i < idx ? 'done' : ''}>
            <i>{i + 1}</i>
            <em>{l}</em>
          </span>
        ))}
      </div>
      <div className="f-top-right">
        {player && (
          <div className="f-chip player">
            <Icon.patrol size={20} />
            <span className="pn">
              {player.first}
              <em className="lbl"> {player.last}</em>
            </span>
          </div>
        )}
        {right}
        <GfxToggle className="f-chip f-sound f-gfx" />
        <SoundToggle className="f-chip f-sound" />
        {(phase === 'build' || phase === 'defend') && <MenuButton />}
      </div>
    </div>
  );
}

// ───────────── kurulum ─────────────
function useObjectives() {
  const cov = useGame((s) => s.coverage);
  const devices = useGame((s) => s.devices);
  const levelId = useFair((s) => s.levelId);
  const z = (n: string) => cov?.zones.find((x) => x.name === n)?.pct ?? 0;
  const count = (f: (n: string) => boolean, min: number) => (cov ? cov.zones.filter((x) => f(x.name) && x.pct >= min).length : 0);
  let first: { t: string; ok: boolean; hint: string }[];
  if (levelId === 102) {
    const tb = count((n) => n.endsWith('türbin sahası'), 40);
    first = [
      { t: 'Trafo merkezini kamerayla izle', ok: z('Trafo merkezi çevresi') >= 50, hint: 'Ana girişin yanındaki trafoya bakan bir kamera koy' },
      { t: 'En az 2 türbin sahasını kapsa', ok: tb >= 2, hint: `${tb}/2 türbin kapsamda · tepeler görüşü keser` },
    ];
  } else if (levelId === 103) {
    first = [
      { t: 'Şalt sahasını kamerayla izle', ok: z('Şalt sahası') >= 50, hint: 'Kuzeydoğudaki trafolara bakan bir kamera koy' },
      { t: 'Yakıt tanklarını kapsa', ok: z('Yakıt tankları') >= 40, hint: 'Güneybatıdaki beyaz tanklar · kuleler görüşü keser' },
    ];
  } else if (levelId === 104) {
    const wells = count((n) => n.endsWith('kuyu başı'), 40);
    first = [
      { t: 'Şalt sahasını kamerayla izle', ok: z('Şalt sahası') >= 50, hint: 'Güneydoğudaki trafolara bakan bir kamera koy' },
      { t: 'En az 2 kuyu başını kapsa', ok: wells >= 2, hint: `${wells}/2 kuyu başı kapsamda · buhar görüşü bulandırır` },
    ];
  } else if (levelId === 106) {
    const blocks = count((n) => n.startsWith('Batarya bloğu'), 45);
    first = [
      { t: 'Şalt sahasını kamerayla izle', ok: z('Şalt sahası') >= 50, hint: 'Güneydoğudaki trafolara bakan bir kamera koy' },
      { t: 'En az 2 batarya bloğunu kapsa', ok: blocks >= 2, hint: `${blocks}/2 blok kapsamda · konteyner sıraları görüşü keser` },
    ];
  } else if (levelId === 105) {
    first = [
      { t: 'Şalt sahasını kamerayla izle', ok: z('Şalt sahası') >= 50, hint: 'Santralin doğusundaki trafolara bakan bir kamera koy' },
      { t: 'Cebri boruları kapsa', ok: z('Cebri borular') >= 40, hint: 'Barajdan inen borular · baraj gövdesi görüşü keser' },
    ];
  } else {
    const inv = count((n) => n.startsWith('İnverter'), 50);
    first = [
      { t: 'Trafo merkezini kamerayla izle', ok: z('Trafo merkezi çevresi') >= 50, hint: 'Sağ alttaki trafoya bakan bir kamera koy' },
      { t: 'En az 2 inverter istasyonunu kapsa', ok: inv >= 2, hint: `${inv}/2 inverter kapsamda` },
    ];
  }
  const night = useGame.getState().level?.night;
  const nightObjs = night
    ? [
        { t: 'Termal kamera kur', ok: devices.some((d) => d.type === 'thermalCam'), hint: 'Karanlıkta ısı izinden görür' },
        { t: 'Karanlık bir noktayı aydınlat', ok: devices.some((d) => d.type === 'light'), hint: 'Aydınlatma direği kameraların gece görüşünü artırır' },
      ]
    : [];
  return [
    ...first,
    ...nightObjs,
    ...(night ? [] : [{ t: 'Alarm sireni kur', ok: devices.some((d) => d.type === 'siren'), hint: 'Siren hırsızı kaçırır' }]),
    { t: 'Devriye birimi yerleştir', ok: devices.some((d) => d.type === 'patrol'), hint: 'Devriye hırsızı yakalar' },
  ];
}


function BuildHUD() {
  const nightIntro = useGame((s) => !!s.level?.night);
  const weatherIntro = useGame((s) => s.level?.weather ?? 'clear');
  const endsAt = useFair((s) => s.buildEndsAt);
  const diffNow = useFair((s) => s.difficulty);
  const startDefense = useFair((s) => s.startDefense);
  const introSeen = useFair((s) => s.introSeen);
  const setIntroSeen = useFair((s) => s.setIntroSeen);
  const budget = useGame((s) => s.budget);
  const cov = useGame((s) => s.coverage);
  const expo = useGame((s) => !!s.level?.expo);
  const now = useNow();
  const left = Math.max(0, Math.ceil((endsAt - now) / 1000));
  const objs = useObjectives();
  const allOk = objs.every((o) => o.ok);
  useEffect(() => {
    if (!expo && introSeen && left > 0 && left <= 10) sfx.tick();
  }, [left, introSeen, expo]);
  useEffect(() => {
    // fuar modunda kurulum süresi yok: operatör "Savunmaya geç" diyene kadar bekle
    if (!expo && introSeen && left <= 0) startDefense();
  }, [left, introSeen, startDefense, expo]);
  // giriş kartı açıkken süre işlemesin
  useEffect(() => {
    if (!expo && !introSeen) useFair.setState({ buildEndsAt: Date.now() + DIFFS[useFair.getState().difficulty].build * 1000 });
  }, [introSeen, now, expo]);
  const covPct = Math.round(cov?.coveragePct ?? 0);
  return (
    <>
      <FairTop
        right={
          <>
            <MaterialChip />
            <div className="f-chip budget">
              <Icon.coin size={20} />
              {fmt(budget)}
            </div>
            {expo ? (
              <div className="f-chip timer expo" title="Fuar modu: kurulum süresi yok">
                <Icon.clock size={20} />
                ∞
                <em className="lbl"> süre yok</em>
              </div>
            ) : (
              <div className={`f-chip timer ${left <= 15 ? 'hot' : ''}`}>
                <Icon.clock size={20} />
                {left}
                <em className="lbl"> sn</em>
              </div>
            )}
          </>
        }
      />
      <div className="f-side">
        {!expo && <div className="f-side-t">Görev hedefleri</div>}
        {!expo && objs.map((o) => (
          <div key={o.t} className={`f-obj ${o.ok ? 'ok' : ''}`}>
            <span className="box">{o.ok ? <Icon.check size={16} /> : null}</span>
            <div>
              <div className="ot">{o.t}</div>
              {!o.ok && <div className="oh">{o.hint}</div>}
            </div>
          </div>
        ))}
        <div className="f-cov">
          <div className="f-cov-row">
            <span>Saha kapsaması</span>
            <b>%{covPct}</b>
          </div>
          <div className="f-meter">
            <div style={{ width: `${covPct}%` }} />
          </div>
          <div className="f-legend">
            <span><i className="c" />Kamera görüyor</span>
            <span><i className="b" />Kör nokta</span>
          </div>
        </div>
      </div>
      <FairInspector />
      <MobilePlaceBar />
      <BonusPanel />
      <EquipmentShop />
      <button className={`f-go ${allOk && !expo ? 'ready' : ''}`} onClick={startDefense}>
        <Icon.shield size={26} />
        <span>
          SAVUNMAYA GEÇ
          <small>{allOk && !expo ? 'Tüm hedefler tamam!' : 'Hazır olduğunda başla'}</small>
        </span>
      </button>
      <ModeBanner />
      <Toasts />
      {!introSeen && (
        <div className="f-modal" onClick={setIntroSeen}>
          <div className="f-card" onClick={(e) => e.stopPropagation()}>
            <div className="f-kicker">Adım 1 · Kurulum</div>
            <h2>Güvenlik sistemini kur</h2>
            <p>
              {MOBILE_PLACE ? (
                <>
                  Alttaki menüden bir ekipmana dokun; haritada beliren hayaleti <b className="g">parmağınla sürükle</b>, yeşil olunca <b className="g">✓</b> ile onayla. Bullet kameralar çit hattına kendiliğinden yapışır.
                </>
              ) : (
                <>
                  Alttaki menüden bir ekipmana dokun, sonra haritada <b className="g">yeşil</b> bir noktaya dokun. {expo ? 'Stratejini sen kur.' : 'Kameralar en riskli yöne kendiliğinden döner.'}
                </>
              )}
            </p>
            <p>
              <b className="r">Kırmızı</b> alanlar kör nokta: oradan gelen hırsızı sistem göremez. {expo ? 'Süre sınırı yok; hazır olunca "Savunmaya geç".' : `${DIFFS[diffNow].build} saniyen var.`}
            </p>
            {expo && (
              <p className="f-night-note expo">
                <Icon.fixedCam size={22} />
                <span>
                  <b>Fuar modu:</b> Bullet kameralar (tek 200, çift 400 kredi) yalnızca çit sınırına kurulur; tek bullet çit boyunca, çift bulletin iki başlığı iki yöne bakar, "Döndür" ile çevirirsin. Termal kamera 3 kat menzilli. <b>Savunma başladıktan sonra kamera eklenemez.</b> <b>AİM</b>, kameraların gördüğü her şeyi otomatik tanır ve müdahale eder.
                </span>
              </p>
            )}
            {nightIntro && (
              <p className="f-night-note">
                <Icon.moon size={22} />
                <span>
                  <b>Gece görevi:</b> Sıradan kameralar karanlıkta zor görür. <b>Termal kamera</b> ısı izinden görür; <b>aydınlatma direği</b> karanlık noktaları aydınlatır, oradaki kameralar tam menzil görür.
                </span>
              </p>
            )}
            {!expo && <p className="f-reel-note">
              <ReelIcon size={22} />
              <span>
                Tesiste <b>kablo makaraları</b> var. Hırsızlar hepsini çalarsa görev biter; yakaladığın hırsızın çaldığı makara geri gelir.
              </span>
            </p>}
            {weatherIntro !== 'clear' && (
              <p className="f-night-note wx">
                {weatherIntro === 'fog' ? <Icon.fog size={22} /> : <Icon.rain size={22} />}
                <span>
                  <b>{weatherIntro === 'fog' ? 'Sisli hava:' : 'Yağmurlu hava:'}</b> {weatherIntro === 'fog' ? (expo ? 'kameraların menzili kısalır.' : 'kameraların menzili kısalır; kameraları varlıklara yakın koy.') : 'görüş düşer, hırsızlar daha geç fark edilir.'}
                </span>
              </p>
            )}
            {!expo && <p className="f-tactic-note">
              <Icon.siren size={22} />
              <span>
                Savunmada <b>taktik hakların</b> var: saha sireni ×2, ek devriye ×1{nightIntro ? ', projektör ×1' : ''}. Art arda doğru kararlar <b>seri bonusu</b> kazandırır; son 30 saniye <b>alarm fırtınası</b>! {nightIntro ? 'Gece elektrik kesintisi' : 'Gündüz toz fırtınası'} sürpriz yapabilir; tespit edemediğin her hırsız puan düşürür.
              </span>
            </p>}
            <button className="f-cta sm" onClick={setIntroSeen}>
              Anladım, başla
            </button>
          </div>
        </div>
      )}
    </>
  );
}

// ───────────── bonus: Desecure ürünü ─────────────
const PRODUCT_INFO: Record<string, { name: string; full: string; line: string }> = {
  mik: { name: 'MİK', full: 'Mobil İzleme Kulesi', line: '360° PTZ · 16 m · güneş enerjili' },
  mas: { name: 'MAS', full: 'Mobil Alarm Standı', line: '4 yönlü dedektör + siren · 12 m' },
  mia: { name: 'MİA', full: 'Mobil İzleme Aracı', line: 'Römorklu kamera direği · 14 m' },
};

function BonusPanel() {
  const devices = useGame((s) => s.devices);
  const placing = useGame((s) => s.placing);
  const used = devices.find((d) => EQUIPMENT[d.type].bonus);
  const [open, setOpen] = useState(false);
  const g = useGame.getState();
  const pick = (t: EquipmentType) => {
    if (placing?.type === t) {
      g.cancelPlace();
      return;
    }
    g.beginPlace(t);
  };
  if (used) {
    const info = PRODUCT_INFO[used.type];
    return (
      <div className="f-bonus used">
        <div className="fb-head">
          <span className="fb-gift">BONUS</span>
          <span>Desecure ürünün sahada</span>
        </div>
        <div className="fb-used">
          <ProductThumb type={used.type} />
          <div>
            <b>
              {used.label} · {info.full}
            </b>
            <span>Şüpheliyi otomatik yakalar, AİM jandarmayı çağırır.</span>
          </div>
        </div>
        <button className="fb-change" onClick={() => g.sellDevice(used.id)}>
          <Icon.rotate size={16} /> Başka ürün seç
        </button>
      </div>
    );
  }
  return (
    <div className={`f-bonus ${open ? '' : 'closed'}`}>
      <button className="fb-head" onClick={() => setOpen(!open)}>
        <span className="fb-gift">BONUS</span>
        <span>Ücretsiz bir Desecure ürünü seç</span>
        <Icon.chevron size={18} />
      </button>
      {open && (
        <>
          <div className="fb-sub">Hırsızı otomatik yakalar · 1 hak</div>
          {BONUS_TYPES.map((t) => {
            const info = PRODUCT_INFO[t];
            return (
              <button key={t} className={`fb-item ${placing?.type === t ? 'on' : ''}`} onClick={() => pick(t)}>
                <ProductThumb type={t} />
                <div>
                  <b>
                    {info.name} <em>{info.full}</em>
                  </b>
                  <span>{info.line}</span>
                </div>
              </button>
            );
          })}
        </>
      )}
    </div>
  );
}

/** mobil yerleştirme çubuğu (Clash of Clans tarzı): sürükle → ✓ onayla / ✗ vazgeç */
function MobilePlaceBar() {
  const placing = useGame((s) => s.placing);
  if (!MOBILE_PLACE || !placing) return null;
  const spec = EQUIPMENT[placing.type];
  const g = useGame.getState();
  const ok = placing.valid && placing.hasHover;
  return (
    <div className={`m-place ${ok ? 'ok' : 'bad'}`} role="toolbar" aria-label="Yerleştirme">
      <div className="m-place-info">
        <EquipIcon type={placing.type} size={22} />
        <div>
          <b>{placing.existingId ? 'Taşınıyor · ' : ''}{spec.name}</b>
          <span>{ok ? (isFenceOnlyType(placing.type) ? 'Çit hattına yapıştı · sürükleyerek kaydır' : 'Sürükleyerek yerini ayarla') : placing.reason || 'Haritada bir yere sürükle'}</span>
        </div>
        {!placing.existingId && (
          <span className="m-place-cost">
            <Icon.coin size={14} /> {fmt(spec.cost)}
          </span>
        )}
      </div>
      <div className="m-place-btns">
        <button type="button" className="m-pb x" onClick={() => { sfx.cancel(); g.cancelPlace(); }} aria-label="Vazgeç">
          <Icon.x size={26} />
        </button>
        <button type="button" className="m-pb ok" disabled={!ok} onClick={() => g.commitPlace()} aria-label="Yerleştir">
          <Icon.check size={28} />
        </button>
      </div>
    </div>
  );
}
const isFenceOnlyType = (t: string) => t === 'fixedCam' || t === 'bulletCam';

function FairInspector() {
  const id = useGame((s) => s.selectedDeviceId);
  const devices = useGame((s) => s.devices);
  const d = devices.find((x) => x.id === id);
  if (!d) return null;
  const spec = EQUIPMENT[d.type];
  const g = useGame.getState();
  return (
    <div className="f-insp">
      <EquipIcon type={d.type} size={26} />
      <div className="fi-t">
        <b>{d.label}</b>
        <span>{spec.name}</span>
      </div>
      {spec.rotatable && (
        <button onClick={() => g.rotateBy(d.id, Math.PI / 4)}>
          <Icon.rotate size={18} /> Döndür
        </button>
      )}
      {MOBILE_PLACE && (
        <button onClick={() => g.moveDevice(d.id)}>
          <Icon.grid size={18} /> Taşı
        </button>
      )}
      <button className="danger" onClick={() => g.sellDevice(d.id)}>
        <Icon.trash size={18} /> Kaldır
      </button>
      <button className="x" onClick={() => g.selectDevice(null)}>
        <Icon.x size={16} />
      </button>
    </div>
  );
}

// ───────────── savunma ─────────────
function pickActive(e: NonNullable<ReturnType<typeof getEngine>>, decided: Record<string, unknown>, selId: string | null): Incident[] {
  const open = e.incidents.filter((i) => {
    if (i.status === 'resolved' || i.kind === 'tech' || decided[i.id] || i.autoBy) return false;
    // Desecure ürünü şüpheliye kilitlendiyse karar beklenmez (otomatik yakalanacak)
    const n = i.npcId ? e.npcs.find((m) => m.id === i.npcId) : null;
    return !(n && n.autoProg > 0.05);
  });
  open.sort((a, b) => {
    if (a.id === selId) return -1;
    if (b.id === selId) return 1;
    if (a.verified !== b.verified) return a.verified ? -1 : 1;
    return a.createdAt - b.createdAt;
  });
  return open;
}

function DefendHUD() {
  useGame((s) => s.simTick);
  const decisions = useFair((s) => s.decisions);
  const decide = useFair((s) => s.decide);
  const feedback = useFair((s) => s.feedback);
  const selId = useGame((s) => s.selectedIncidentId);
  const focusOn = useGame((s) => s.focusOn);
  const focused = useRef(new Set<string>());
  const lastTick = useRef(-1);
  const e = getEngine();
  const expo = useGame((s) => !!s.level?.expo);

  // fuar modu: kameraya giren her olayı AİM kendisi sınıflandırır ve müdahale eder
  useEffect(() => {
    if (!expo) return;
    const firstSeen = new Map<string, number>();
    const t = setInterval(() => {
      const en = getEngine();
      if (!en || en.ended || useGame.getState().paused) return;
      const st = useFair.getState();
      for (const i of pickActive(en, st.decisions, null)) {
        const f = firstSeen.get(i.id) ?? Date.now();
        firstSeen.set(i.id, f);
        if (Date.now() - f >= 400) st.autoAim(i.id);
      }
    }, 200);
    return () => clearInterval(t);
  }, [expo]);

  // fuar modu: fark edilmeden çalınan makara → büyük uyarı, kısa ağır çekim
  const theftN = e ? e.theftLog.length : 0;
  const sabN = e ? e.sabotageLog.length : 0;
  const prevTheft = useRef(0);
  const prevSab = useRef(0);
  const theftTimer = useRef(0);
  const [theft, setTheft] = useState<{ kind: 'theft' | 'sabotage'; title: string; text: string; sub: string; id: number } | null>(null);
  const showPop = (p: { kind: 'theft' | 'sabotage'; title: string; text: string; sub: string }, x: number, z: number) => {
    const id = Date.now();
    setTheft({ ...p, id });
    sfx.breach();
    useGame.getState().focusOn(x, z, 32);
    useGame.setState({ speed: SIM_SPEED * 0.3 });
    window.clearTimeout(theftTimer.current);
    theftTimer.current = window.setTimeout(() => {
      if (useFair.getState().phase === 'defend') useGame.setState({ speed: SIM_SPEED });
      setTheft((n) => (n && n.id === id ? null : n));
    }, 3600);
  };
  useEffect(() => {
    const prev = prevTheft.current;
    prevTheft.current = theftN;
    const en = getEngine();
    if (!expo || !en || theftN <= prev) return;
    const ev = en.theftLog[theftN - 1];
    if (ev.seen) return; // AİM görmüştü: normal bildirim yeter
    showPop({ kind: 'theft', title: 'BAKIR KABLO ÇALINDI!', text: 'Makaraları koruyan bir kamera olmadığı için hırsız fark edilmeden kabloları aldı.', sub: `${ev.name} · ${ev.take} makara` }, ev.x, ev.z);
  }, [theftN, expo]);
  // fuar modu: kimsenin görmediği kamera sabote edildi
  useEffect(() => {
    const prev = prevSab.current;
    prevSab.current = sabN;
    const en = getEngine();
    if (!expo || !en || sabN <= prev) return;
    const ev = en.sabotageLog[sabN - 1];
    showPop({ kind: 'sabotage', title: 'KAMERA SABOTE EDİLDİ!', text: `${ev.label} kamerasını başka bir kamera görmüyordu. Hırsız kör noktadan yaklaşıp kamerayı devre dışı bıraktı.`, sub: `${ev.label} · çevrim dışı` }, ev.x, ev.z);
  }, [sabN, expo]);
  useEffect(() => () => window.clearTimeout(theftTimer.current), []);

  // kararı verilmiş olayları sonuç belli olunca otomatik kapat
  useEffect(() => {
    const t = setInterval(() => {
      const en = getEngine();
      if (!en) return;
      const ids = new Set([...Object.keys(useFair.getState().decisions), ...en.incidents.filter((i) => i.autoBy).map((i) => i.id)]);
      for (const id of ids) {
        const inc = en.incident(id);
        if (!inc || inc.status === 'resolved') continue;
        const npc = inc.npcId ? en.npcs.find((n) => n.id === inc.npcId) : null;
        if (!npc || !npc.active || npc.state === 'caught' || npc.outcome === 'caught') performAction(en, id, 'resolve');
      }
    }, 500);
    return () => clearInterval(t);
  }, []);

  const list = e ? pickActive(e, decisions, selId) : [];
  const inc = list[0] ?? null;
  useEffect(() => {
    if (expo) return; // fuar modunda kamera yalnızca çalınma anında kayar
    if (inc && inc.verified && !focused.current.has(inc.id)) {
      focused.current.add(inc.id);
      focusOn(inc.x, inc.z, 40);
    }
  }, [inc?.id, inc?.verified, focusOn]);

  // Desecure ürünü otomatik yakaladı: AİM paneli + bildirim
  const autoSeen = useRef(new Set<string>());
  const [autoNote, setAutoNote] = useState<{ t: string; s: string; id: number } | null>(null);
  const autoInc = e ? e.incidents.find((i) => i.autoBy && !autoSeen.current.has(i.id)) : undefined;
  useEffect(() => {
    if (!autoInc) return;
    autoSeen.current.add(autoInc.id);
    useAim.getState().show(autoInc.sector, autoInc.autoBy!);
    const id = Date.now();
    setAutoNote({ t: `${autoInc.autoBy} HIRSIZI YAKALADI!`, s: 'Desecure ürünü şüpheliyi otomatik durdurdu, AİM jandarmayı yönlendirdi.', id });
    sfx.correct();
    const t = setTimeout(() => setAutoNote((n) => (n && n.id === id ? null : n)), 3000);
    return () => clearTimeout(t);
  }, [autoInc?.id]);

  // makara çalındı / geri geldi bildirimi
  const rem = e ? e.stockRemaining() : 0;
  const prevRem = useRef<number | null>(null);
  const [reelNote, setReelNote] = useState<{ t: string; s: string; tone: 'bad' | 'good'; id: number } | null>(null);
  useEffect(() => {
    const prev = prevRem.current;
    prevRem.current = rem;
    if (prev === null || prev === rem) return;
    const d = rem - prev;
    const id = Date.now();
    const en0 = getEngine();
    // fuar modu: fark edilmeden çalınma büyük uyarıyla gösterilir
    if (d < 0 && en0?.level.expo && en0.theftLog.length && !en0.theftLog[en0.theftLog.length - 1].seen) return;
    if (d < 0) {
      setReelNote({ t: `${-d} KABLO MAKARASI ÇALINDI!`, s: rem > 0 ? `Tesiste ${rem} makara kaldı — hırsızı yakala, malzeme geri gelsin.` : 'Son makaralar da gitti! Hırsızları yakala, yoksa görev biter.', tone: 'bad', id });
      sfx.wrong();
    } else {
      setReelNote({ t: `+${d} MAKARA GERİ GELDİ`, s: 'Yakalanan hırsızın çaldığı malzeme yerine kondu.', tone: 'good', id });
      sfx.correct();
    }
    const t = setTimeout(() => setReelNote((n) => (n && n.id === id ? null : n)), 2800);
    return () => clearTimeout(t);
  }, [rem]);

  // kaçış aracı: makara sahadan çıktı
  const lootLost = e ? e.lootLost : 0;
  const prevLost = useRef(0);
  const [lostNote, setLostNote] = useState<{ t: string; s: string; id: number } | null>(null);
  useEffect(() => {
    const prev = prevLost.current;
    prevLost.current = lootLost;
    if (lootLost <= prev) return;
    const d = lootLost - prev;
    const id = Date.now();
    setLostNote({ t: 'KAMYONET KAÇTI!', s: `${d} makara sahadan çıktı — yaklaşık ${fmt(d * REEL_VALUE)} ₺ kayıp.`, id });
    sfx.breach();
    const t = setTimeout(() => setLostNote((n) => (n && n.id === id ? null : n)), 3600);
    return () => clearTimeout(t);
  }, [lootLost]);

  // alarm fırtınası / elektrik kesintisi
  const storm = !!e && !e.ended && e.time >= e.stormAt;
  const stormSeen = useRef(false);
  const [stormNote, setStormNote] = useState(false);
  useEffect(() => {
    if (!storm || stormSeen.current) return;
    stormSeen.current = true;
    setStormNote(true);
    sfx.alert();
    const t = setTimeout(() => setStormNote(false), 3500);
    return () => clearTimeout(t);
  }, [storm]);
  const blackout = !!e && e.isBlackout();
  const dust = !!e && e.isDust();
  const dustSeen = useRef(0);
  useEffect(() => {
    if (!e || !dust || dustSeen.current === e.dustCount) return;
    dustSeen.current = e.dustCount;
    sfx.alert();
  }, [dust, e]);
  const blackoutSeen = useRef(0);
  useEffect(() => {
    if (!e || !blackout || blackoutSeen.current === e.blackoutCount) return;
    blackoutSeen.current = e.blackoutCount;
    sfx.error();
  }, [blackout, e]);

  if (!e) return null;
  const remaining = Math.max(0, Math.ceil((e.duration - e.time) / SIM_SPEED));
  if (remaining > 0 && remaining <= 10 && remaining !== lastTick.current) {
    lastTick.current = remaining;
    sfx.tick();
  }
  const thieves = e.npcs.filter((n) => n.kind === 'thief');
  const stopped = thieves.filter((n) => n.outcome === 'caught' || n.outcome === 'fled').length;
  const lost = thieves.filter((n) => n.outcome === 'breach').length;
  const ds = Object.values(decisions);

  return (
    <>
      {storm && <div className="f-storm-vignette" aria-hidden />}
      {blackout && <div className="f-blackout" aria-hidden />}
      {dust && <div className="f-dust" aria-hidden />}
      <FairTop
        right={
          <>
            {!expo && <StreakChip />}
            <MaterialChip />

            <div className="f-chip ok" title="Durdurulan hırsız">
              <Icon.shield size={20} /> {stopped}
              <em className="lbl"> durduruldu</em>
            </div>
            <div className={`f-chip ${lost ? 'bad' : ''}`} title="Kaçan hırsız">
              <Icon.alert size={20} /> {lost}
              <em className="lbl"> kaçtı</em>
            </div>
            {!expo && (
              <div className="f-chip" title="Doğru karar">
                <Icon.check size={20} /> {ds.filter((d) => d.correct).length}/{ds.length}
                <em className="lbl"> doğru</em>
              </div>
            )}
            <div className={`f-chip timer ${remaining <= 15 ? 'hot' : ''}`}>
              <Icon.clock size={20} /> {remaining}
            </div>
          </>
        }
      />
      {expo ? (
        <div className="f-watch expo">
          <Icon.eye size={22} />
          <div>
            <b>AİM sahayı izliyor.</b> Kameraların gördüğü her şeyi otomatik tanır ve müdahale eder.
          </div>
        </div>
      ) : (
        !inc && (
          <div className="f-watch">
            <Icon.eye size={22} />
            <div>
              <b>Sahayı izle.</b> Kameraların görmediği yerlerde hareket ara. Bir karakter görürsen <b>üzerine dokun</b>.
            </div>
          </div>
        )
      )}
      {!expo && inc && <DecisionCard inc={inc} more={list.length - 1} onDecide={(c) => decide(inc.id, c)} />}
      {!expo && <TacticsBar />}
      {theft && (
        <div key={theft.id} className={`f-theft-pop ${theft.kind}`} role="alert">
          <span className="f-theft-ic">{theft.kind === 'theft' ? <ReelIcon size={40} /> : <Icon.fixedCam size={40} />}</span>
          <b>{theft.title}</b>
          <p>{theft.text}</p>
          <small>{theft.sub}</small>
        </div>
      )}
      {dust && (
        <div className="f-blackout-banner dust">
          <Icon.fog size={22} />
          <div>
            <b>TOZ FIRTINASI · {Math.max(0, Math.ceil(e.dustUntil - e.time))} sn</b>
            <span>Optik kameraların menzili yarıya indi. Termal, drone ve Desecure ürünleri daha az etkilenir.</span>
          </div>
        </div>
      )}
      {blackout && (
        <div className="f-blackout-banner">
          <Icon.bulb size={22} />
          <div>
            <b>ELEKTRİK KESİNTİSİ · {Math.max(0, Math.ceil(e.blackoutUntil - e.time))} sn</b>
            <span>Sıradan kameralar kör. Termal kamera, kule ve Desecure ürünleri kendi gücüyle çalışıyor.</span>
          </div>
        </div>
      )}
      {stormNote && (
        <div className="f-storm-note">
          <Icon.alert size={34} />
          <div>
            <b>ALARM FIRTINASI!</b>
            <span>Son 30 saniye — hırsızlar son bir hamle yapıyor. Dikkat!</span>
          </div>
        </div>
      )}
      {lostNote && (
        <div key={lostNote.id} className="f-reelnote bad">
          <Icon.vehicle size={30} />
          <div>
            <b>{lostNote.t}</b>
            <span>{lostNote.s}</span>
          </div>
        </div>
      )}
      <AimPanel />
      {autoNote && (
        <div key={autoNote.id} className="f-reelnote good auto">
          <Icon.shield size={30} />
          <div>
            <b>{autoNote.t}</b>
            <span>{autoNote.s}</span>
          </div>
        </div>
      )}
      {reelNote && (
        <div key={reelNote.id} className={`f-reelnote ${reelNote.tone}`}>
          <ReelIcon size={30} />
          <div>
            <b>{reelNote.t}</b>
            <span>{reelNote.s}</span>
          </div>
        </div>
      )}
      {feedback && (
        <div key={feedback.id} className={`f-feedback ${feedback.tone}`}>
          <b>{feedback.text}</b>
          <span>{feedback.sub}</span>
        </div>
      )}
      <Toasts />
    </>
  );
}

/** seri göstergesi: art arda doğru kararlar */
function StreakChip() {
  const streak = useFair((s) => s.streak);
  if (streak < 2) return null;
  return (
    <div key={streak} className={`f-chip streak ${streak >= 4 ? 'max' : ''}`} title="Seri: art arda doğru karar">
      <Icon.fast size={20} /> ×{streak}
      <em className="lbl"> seri</em>
    </div>
  );
}

/** taktik müdahale hakları */
function TacticsBar() {
  const tactics = useFair((s) => s.tactics);
  const use = useFair((s) => s.useTactic);
  const night = useGame((s) => !!s.level?.night);
  const items: Tactic[] = night ? ['siren', 'backup', 'light'] : ['siren', 'backup'];
  const icon = (t: Tactic) => (t === 'siren' ? <Icon.siren size={22} /> : t === 'backup' ? <Icon.patrol size={22} /> : <Icon.light size={22} />);
  return (
    <div className="f-tactics" role="group" aria-label="Taktik müdahale">
      <span className="f-tactics-t">Müdahale</span>
      {items.map((t) => (
        <button key={t} className={`f-tactic ${tactics[t] <= 0 ? 'used' : ''}`} disabled={tactics[t] <= 0} onClick={() => use(t)} title={TACTIC_INFO[t].desc}>
          {icon(t)}
          <span>
            <b>{TACTIC_INFO[t].name}</b>
            <small>{tactics[t] > 0 ? `${tactics[t]} hak` : 'kullanıldı'}</small>
          </span>
        </button>
      ))}
    </div>
  );
}

function DecisionCard({ inc, more, onDecide }: { inc: Incident; more: number; onDecide: (c: Choice) => void }) {
  const focusOn = useGame((s) => s.focusOn);
  const e = getEngine()!;
  const head =
    inc.kind === 'manual' ? 'Kör noktada hareket buldun!' : inc.kind === 'patrol' ? `${inc.source} birini gördü` : inc.verified ? `${inc.source} bir hareket yakaladı` : inc.kind === 'perimeter' ? 'Çit hattında titreşim!' : 'Sensör hareket algıladı';
  const freeUnits = e.responders.some((r) => r.state === 'patrol' || r.state === 'idle' || r.state === 'return');
  return (
    <div className={`f-decide ${inc.verified ? '' : 'unv'}`}>
      <div className="fd-head">
        <span className="fd-pulse" />
        <div>
          <div className="fd-t">{head}</div>
          <div className="fd-s">
            {inc.sector} bölgesi{more > 0 ? ` · ${more} olay daha bekliyor` : ''}
          </div>
        </div>
        <button className="fd-look" onClick={() => focusOn(inc.x, inc.z, 26)}>
          <Icon.target size={18} /> Bölgeye bak
        </button>
      </div>
      {inc.verified ? (
        <>
          <div className="fd-q">Ekrandaki kişi ya da hayvan ne? Kararını ver:</div>
          <div className="fd-btns">
            <button className="thief" onClick={() => onDecide('hirsiz')}>
              <Icon.siren size={30} />
              <b>Hırsız</b>
              <span>Alarm + devriye + jandarma</span>
            </button>
            <button className="animal" onClick={() => onDecide('hayvan')}>
              <Icon.speaker size={30} />
              <b>Hayvan</b>
              <span>Sesli anonsla uzaklaştır</span>
            </button>
            <button className="staff" onClick={() => onDecide('personel')}>
              <Icon.patrol size={30} />
              <b>Personel</b>
              <span>Turuncu yelek · sorun yok</span>
            </button>
          </div>
        </>
      ) : (
        <>
          <div className="fd-q">Konum belirsiz. Turuncu alana bak, karakteri bulup üzerine dokun ya da devriye gönder.</div>
          <div className="fd-btns two">
            <button className="look" onClick={() => focusOn(inc.x, inc.z, 30)}>
              <Icon.eye size={28} />
              <b>Yakınlaş</b>
              <span>Hareketi kendin bul</span>
            </button>
            <button className="patrol" disabled={!freeUnits || inc.status === 'dispatched'} onClick={() => performAction(e, inc.id, 'dispatch')}>
              <Icon.send size={28} />
              <b>{inc.status === 'dispatched' ? 'Devriye yolda' : 'Devriye gönder'}</b>
              <span>{freeUnits ? 'Ekip bölgeye gider' : 'Müsait ekip yok'}</span>
            </button>
          </div>
        </>
      )}
    </div>
  );
}

// ───────────── Desecure demosu ─────────────
function DemoHUD() {
  useGame((s) => s.simTick);
  const endDemo = useFair((s) => s.endDemo);
  const toAttract = useFair((s) => s.toAttract);
  // demodan doğrudan giriş ekranına dön
  const goHome = () => {
    const en = getEngine();
    if (en && !en.ended) en.end('quit');
    useGame.setState({ paused: false });
    toAttract();
  };
  const e = getEngine();
  const now = useNow(250);
  const startedAt = useRef(now);
  const [done, setDone] = useState(false);
  const gamePhase = useGame((s) => s.phase);
  useEffect(() => {
    if (gamePhase === 'result' && !done) setDone(true);
  }, [gamePhase, done]);
  // bitince 8 sn sonuç özeti, sonra geri dön
  useEffect(() => {
    if (!done) return;
    const t = setTimeout(endDemo, 9000);
    return () => clearTimeout(t);
  }, [done, endDemo]);
  // Desecure ürünü yakalayınca AİM paneli
  const autoSeen = useRef(new Set<string>());
  const autoInc = e ? e.incidents.find((i) => i.autoBy && !autoSeen.current.has(i.id)) : undefined;
  useEffect(() => {
    if (!autoInc) return;
    autoSeen.current.add(autoInc.id);
    useAim.getState().show(autoInc.sector, autoInc.autoBy!);
    sfx.correct();
  }, [autoInc?.id]);
  // biten olayları kapat (pinler temizlensin)
  useEffect(() => {
    const t = setInterval(() => {
      const en = getEngine();
      if (!en) return;
      for (const inc of en.incidents) {
        if (inc.status === 'resolved') continue;
        const npc = inc.npcId ? en.npcs.find((n) => n.id === inc.npcId) : null;
        if (!npc || !npc.active || npc.state === 'arrested' || npc.kind === 'staff') performAction(en, inc.id, 'resolve');
      }
    }, 500);
    return () => clearInterval(t);
  }, []);
  // demo uzaktan izlenir: her yakalamada kamera olay yerine yaklaşmaz (tekrarlı yakalamalarda sahne sürekli zıplıyordu)
  if (!e) return null;
  const thieves = e.npcs.filter((n) => n.kind === 'thief');
  const caught = thieves.filter((n) => n.outcome === 'caught' || n.state === 'held' || n.state === 'arrested' || !!n.jandarmaId).length;
  const detected = e.npcs.filter((n) => n.kind !== 'thief' && n.firstDetectAt !== null).length;
  const others = e.npcs.filter((n) => n.kind !== 'thief').length;
  const left = Math.max(0, Math.ceil((e.duration - e.time) / SIM_SPEED));
  const elapsed = Math.floor((now - startedAt.current) / 1000);
  const feed = e.feed.slice(0, 5);
  return (
    <>
      <div className="f-demo-top">
        <Logo h={30} />
        <div className="fdt-title">
          <span className="fdt-live">
            <i /> CANLI DEMO
          </span>
          Desecure ile aynı saha
        </div>
        <div className="f-top-right">
          <div className="f-chip ok" title="Yakalanan hırsız">
            <Icon.shield size={20} /> {caught}/{thieves.length}
            <em className="lbl"> hırsız yakalandı</em>
          </div>
          <div className="f-chip" title="Tanınan personel ve hayvan">
            <Icon.eye size={20} /> {detected}/{others}
            <em className="lbl"> tanındı</em>
          </div>
          <MaterialChip />
          <div className="f-chip timer">
            <Icon.clock size={20} /> {done ? 0 : left}
          </div>
          <SoundToggle className="f-chip f-sound" />
          <button type="button" className="f-chip f-home-btn" onClick={goHome} title="Giriş ekranına dön">
            <HomeIcon />
            <span>Ana sayfa</span>
          </button>
        </div>
      </div>
      <div className="f-demo-side">
        <div className="fds-t">Desecure kurulumu</div>
        <ul>
          <li><Icon.fixedCam size={16} /> Her kritik varlıkta kamera</li>
          <li><Icon.drone size={16} /> Köşelerde gözcü drone</li>
          <li><Icon.mik size={16} /> MİK · MAS · MİA sahada</li>
          <li><Icon.patrol size={16} /> Devriye, araç ve siren</li>
          <li><Icon.radio size={16} /> 7/24 AİM + jandarma</li>
        </ul>
        <div className="fds-t">Canlı akış</div>
        <ul className="fds-feed">
          {feed.map((f) => (
            <li key={f.id} className={f.level}>{f.text}</li>
          ))}
        </ul>
      </div>
      {done && (
        <div className="f-modal solid">
          <div className="f-card f-demo-end" onClick={(ev) => ev.stopPropagation()}>
            <div className="f-kicker">Desecure demosu tamamlandı</div>
            <h2>
              {caught}/{thieves.length} hırsız yakalandı, {e.stockRemaining()}/{e.stockMax()} makara yerinde
            </h2>
            <p>
              Aynı sahada, aynı hırsızlarla. Fark: Desecure AİM her hareketi anında tanıdı ve doğruladı, MİK / MAS / MİA sahada durdurdu, jandarma teslim aldı.
            </p>
            <div className="f-row2">
              <button type="button" className="f-cta sm ghost" onClick={goHome}>
                <HomeIcon /> Ana sayfa
              </button>
              <button className="f-cta sm" onClick={endDemo}>
                Puanıma dön
              </button>
            </div>
          </div>
        </div>
      )}
      <AimPanel />
      <Toasts />
    </>
  );
}

function HomeIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M3 11 12 4l9 7" />
      <path d="M5 10v10h5v-6h4v6h5V10" />
    </svg>
  );
}

// ───────────── sonuç ─────────────
export const INSTAGRAM_HANDLE = 'desecuretechnology';
export const YOUTUBE_HANDLE = 'DesecureTechnology';
const SUMMARY_SECONDS = 20;
/** indirilen PNG adı: desecure-aim-ad-soyad-puan.png (ASCII güvenli) */
function cardFileName(name: string) {
  const slug = name
    .toLocaleLowerCase('tr-TR')
    .replace(/ı/g, 'i').replace(/ğ/g, 'g').replace(/ü/g, 'u').replace(/ş/g, 's').replace(/ö/g, 'o').replace(/ç/g, 'c')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
  return `desecure-aim-game-${slug || 'operator'}.png`;
}

// Görev sonu: AİM'in olayları gerçekleşmeden önlediğini anlatan açılır pencere + YouTube QR
function AimSummary({ onClose }: { onClose: () => void }) {
  const r = useFair((s) => s.result)!;
  const [left, setLeft] = useState(SUMMARY_SECONDS);
  useEffect(() => {
    const t = setInterval(() => setLeft((v) => v - 1), 1000);
    return () => clearInterval(t);
  }, []);
  useEffect(() => {
    if (left <= 0) onClose();
  }, [left, onClose]);
  const rows = [
    { n: r.attempts, icon: <Icon.siren size={24} />, t: 'hırsızlık girişimi', s: r.expo && r.expo.viaGap > 0 ? 'Kamera görmeyen çit bölümünden sızdılar' : 'Kamerayla doğrulandı · devriye ve jandarma yönlendirildi', thief: true },
    { n: r.animals, icon: <Icon.speaker size={24} />, t: 'hayvan hareketi', s: 'Sesli anonsla uzaklaştırıldı · gereksiz alarm yok' },
    { n: r.staff, icon: <Icon.patrol size={24} />, t: 'personel girişi', s: 'Yetkili personel doğrulandı' },
    { n: r.autoCatches ?? 0, icon: <Icon.shield size={24} />, t: 'şüpheli Desecure ürünüyle yakalandı', s: 'MİK / MAS / MİA otomatik tespit · jandarma teslim aldı' },
  ].filter((x, k) => x.n > 0 || k === 0).slice(0, 4);
  return (
    <div className="f-modal solid" onClick={onClose}>
      <div className="f-card f-aimsum" onClick={(ev) => ev.stopPropagation()} role="dialog" aria-labelledby="aimsum-t">
        <div className="as-head">
          <img src={logoDark} alt="Desecure Technology" />
          <span className="as-badge">
            <i /> 7/24 AİM
          </span>
        </div>
        <div className="as-kicker">{r.title === 'Pes etti' ? 'GÖREV YARIM KALDI' : 'GÖREV TAMAMLANDI'}</div>
        <h2 id="aimsum-t">
          Desecure Alarm İzleme Merkezi bütün riskleri <em>gerçekleşmeden önler</em> ve anında müdahale eder
        </h2>
        {r.expo && r.title !== 'Pes etti' && (
          <div className={`as-border ${r.expo.fencePct >= 100 && r.expo.sabotaged === 0 ? 'ok' : 'bad'}`}>
            <Icon.shield size={24} />
            <span>
              <b>Sınır kapsaman %{r.expo.fencePct}</b>
              {r.expo.fencePct >= 100 && r.expo.sabotaged === 0
                ? ' — çitin tamamı kamera altındaydı, hiçbir hırsız fark edilmeden içeri giremedi.'
                : r.expo.fencePct >= 100
                ? ` — çitin tamamı kamera altındaydı${r.expo.viaGap > 0 ? `, ama sabotajla açılan boşluktan ${r.expo.viaGap} hırsız girdi` : ''}.`
                : ` — ${r.expo.gaps} boşluktan ${r.expo.viaGap} hırsız girdi${r.materialMax - r.materialLeft > 0 ? `, ${r.materialMax - r.materialLeft} makara çalındı` : ''}.`}
              {r.expo.sabotaged > 0 && ` ${r.expo.sabotaged} kamera sabote edildi: kameralar birbirini görmüyordu.`}
            </span>
          </div>
        )}
        {r.title === 'Pes etti' && (
          <div className="as-lost">
            <Icon.flag size={22} />
            <span>
              Neden pes ettin, operatör? Hırsızlar daha gelmeden görevi bıraktın. Tekrar dene, bu sefer sonuna kadar kal.
            </span>
          </div>
        )}
        {r.endReason === 'emptied' && (
          <div className="as-lost">
            <ReelIcon size={22} />
            <span>
              Bu görevde tesisteki bütün kablo makaraları çalındı.
            </span>
          </div>
        )}
        {r.endReason !== 'emptied' && r.lootLost > 0 && (
          <div className="as-lost">
            <Icon.vehicle size={22} />
            <span>
              <b>Kaçırılan makara değeri: {fmt(r.lostValue)} ₺</b> — {r.lootLost} makara kamyonetle sahadan çıktı.
            </span>
          </div>
        )}
        {r.badges.length > 0 && (
          <div className="as-badges">
            {r.badges.map((b) => (
              <span key={b.id} className="f-badge-chip" title={b.desc}>
                <Icon.check size={14} /> {b.label}
              </span>
            ))}
          </div>
        )}
        {r.title !== 'Pes etti' && (
        <div className="as-rows">
          {rows.map((x) => (
            <div key={x.t} className="as-row">
              <span className="as-ic">{x.icon}</span>
              <div className="as-txt">
                <b>
                  {x.n} {x.t}
                </b>
                <span>{x.s}</span>
              </div>
              {r.expo && x.thief && r.expo.viaGap > 0 ? (
                <span className="as-ok bad">
                  <Icon.alert size={18} /> {r.expo.viaGap} fark edilmedi
                </span>
              ) : (
                <span className="as-ok">
                  <Icon.check size={18} /> Önlendi
                </span>
              )}
            </div>
          ))}
        </div>
        )}
        <div className="as-yt">
          <div className="as-qr">
            <img src={ytQr} alt={`YouTube @${YOUTUBE_HANDLE} QR kodu`} />
          </div>
          <div>
            <div className="as-yt-k">
              <span className="as-yt-logo" aria-hidden /> YOUTUBE
            </div>
            <b>Alarm İzleme Merkezimizi yakından izle</b>
            <span className="as-yt-h">@{YOUTUBE_HANDLE}</span>
            <span className="as-yt-s">QR kodu telefonunun kamerasıyla okut.</span>
          </div>
        </div>
        <button className="f-cta" onClick={onClose}>
          Puan kartımı gör <small className="as-cd">({left})</small>
        </button>
      </div>
    </div>
  );
}

function ResultView() {
  const r = useFair((s) => s.result)!;
  const lb = useFair((s) => s.lb);
  const my = useFair((s) => s.myEntryId);
  const player = useFair((s) => s.player);
  const levelId = useFair((s) => s.levelId);
  const difficulty = useFair((s) => s.difficulty);
  const tod = useFair((s) => s.tod);
  const start = useFair((s) => s.startMission);
  const startDemo = useFair((s) => s.startDemo);
  const toAttract = useFair((s) => s.toAttract);
  const lastInput = useFair((s) => s.lastInput);
  const duel = useFair((s) => s.duel);
  const duelNext = useFair((s) => s.duelNext);
  const duelRematch = useFair((s) => s.duelRematch);
  const campaign = useFair((s) => s.campaign);
  const campaignNext = useFair((s) => s.campaignNext);
  const [story, setStory] = useState(false);
  const now = useNow(500);
  const mailOpen = false; // e-posta gönderimi kaldırıldı
  const [cardUrl, setCardUrl] = useState<string | null>(null);
  const [summary, setSummary] = useState(true);
  const touch = useFair((s) => s.touch);
  const closeSummary = useMemo(
    () => () => {
      setSummary(false);
      touch();
    },
    [touch]
  );
  const level = FAIR_LEVELS.find((l) => l.id === levelId) ?? FAIR_LEVELS[0];
  const share: ShareData = useMemo(
    () => ({
      name: player ? `${player.first} ${player.last}` : 'Operatör',
      mission: level.title,
      code: `${MISSION_META[levelId]?.code ?? ''}${tod === 'gece' ? ' · GECE' : ''}${difficulty !== 'normal' ? ` · ${DIFFS[difficulty].short}` : ''}`,
      score: r.total,
      stars: r.stars,
      title: r.title,
      stats: [
        { label: 'Korunan makara', value: `${r.materialLeft}/${r.materialMax}` },
        { label: 'Tespit edilen hırsız', value: `${r.detected}/${r.entered}` },
        r.expo ? { label: 'Çit kapsaması', value: `%${r.expo.fencePct}` } : { label: 'Doğru karar', value: `${r.correct}/${r.decisions}` },
      ],
      handle: INSTAGRAM_HANDLE,
      youtube: YOUTUBE_HANDLE,
      date: Date.now(),
      badges: r.badges.map((b) => b.label),
    }),
    [r, player, level, levelId, difficulty, tod]
  );
  useEffect(() => {
    let alive = true;
    renderShareCard(share).then((c) => alive && setCardUrl(c.toDataURL('image/png')));
    return () => {
      alive = false;
    };
  }, [share]);
  const left = 1e9; // mobil: sonuç ekranı kendiliğinden kapanmaz
  useEffect(() => {
    if (left <= 0) toAttract();
  }, [left, toAttract]);
  const top = todayTop(lb, 5);
  const rank = my ? todayTop(lb, 999).findIndex((x) => x.id === my) + 1 : 0;
  return (
    <div className="f-result">
      <div className="f-share">
        <div className="f-share-col">
          <a className={`f-share-card ${cardUrl ? 'ready' : ''}`} href={cardUrl ?? undefined} download={cardUrl ? cardFileName(share.name) : undefined} title="Puan kartını PNG olarak indir" onClick={(ev) => { if (!cardUrl) ev.preventDefault(); else touch(); }}>
            {cardUrl ? <img src={cardUrl} alt={`${share.name} puan kartı: ${fmt(r.total)} puan`} /> : <div className="f-card-loading">Puan kartı hazırlanıyor…</div>}
            {cardUrl && (
              <span className="f-card-dl">
                <Icon.send size={16} /> PNG indir
              </span>
            )}
          </a>
          <a className="f-dl-btn" href={cardUrl ?? undefined} download={cardUrl ? cardFileName(share.name) : undefined} onClick={(ev) => { if (!cardUrl) ev.preventDefault(); else touch(); }}>
            <Icon.send size={18} /> Puan kartını PNG olarak indir
            <small>Karta tıklamak da indirir</small>
          </a>
        </div>
        <div className="f-share-side">
          {rank === 1 && top[0] && <TopOperator e={top[0]} compact />}
          {rank > 1 && (
            <div className="f-rank">
              {player ? `${player.first}, g` : 'G'}ünün sıralamasında <b>{rank}.</b> sıradasın!
            </div>
          )}
          <details className="f-breakdown">
            <summary>Puan dökümü · {fmt(r.total)}</summary>
            <ul>
              {r.lines.map((l) => (
                <li key={l.label} className={l.pts < 0 ? 'neg' : l.pts > 0 ? 'pos' : ''}>
                  <span>
                    {l.label} <em>{l.value}</em>
                  </span>
                  <b>
                    {l.pts > 0 ? '+' : ''}
                    {fmt(l.pts)}
                  </b>
                </li>
              ))}
            </ul>
          </details>
          {r.badges.length > 0 && (
            <div className="f-badges">
              <div className="f-lb-t">Rozetler</div>
              <div className="f-badges-row">
                {r.badges.map((b) => (
                  <span key={b.id} className="f-badge-chip" title={b.desc}>
                    <Icon.check size={14} /> {b.label}
                  </span>
                ))}
              </div>
            </div>
          )}
          {duel && duel.turn === 0 && (
            <button className="f-cta f-share-btn duel" onClick={duelNext}>
              <Icon.patrol size={26} />
              <span>
                SIRA SENDE, {duel.players[1].first.toLocaleUpperCase('tr-TR')}!
                <small>Aynı saha, aynı olaylar — {fmt(r.total)} puanı geç</small>
              </span>
            </button>
          )}
          {campaign && campaign.idx < CAMPAIGN_ORDER.length - 1 && (
            <button className="f-cta f-share-btn camp" onClick={() => setStory(true)}>
              <Icon.flag size={26} />
              <span>
                SONRAKİ SANTRAL: {MISSION_META[CAMPAIGN_ORDER[campaign.idx + 1]].code}
                <small>Meydan okuma {campaign.idx + 1}/{CAMPAIGN_ORDER.length} · toplam {fmt(campaign.results.reduce((t, x) => t + x.total, 0))} puan</small>
              </span>
            </button>
          )}
          {/* e-posta ile gönderme kaldırıldı: puan kartı PNG olarak indirilir */}
          <div className="f-lb">
            <div className="f-lb-t">Günün en iyileri</div>
            {top.length === 0 && <div className="f-lb-empty">İlk skoru sen yaz.</div>}
            {top.map((e, k) => (
              <div key={e.id} className={`f-lb-row ${e.id === my ? 'me' : ''}`}>
                <span className="rk">{k + 1}</span>
                <span className="nm">
                  {e.name} <MissionTag id={e.mission} diff={e.diff} night={e.night} />
                </span>
                <span className="st" aria-label={`${e.stars} yıldız`}>
                  <Stars n={e.stars} />
                </span>
                <span className="sc">{fmt(e.score)}</span>
              </div>
            ))}
          </div>
          <button className="f-demo-btn" onClick={startDemo}>
            <span className="fdb-ic">
              <Icon.shield size={26} />
            </span>
            <span>
              <b>Ya güvenliğim Desecure'da olsaydı?</b>
              <small>Aynı sahayı tam Desecure kurulumuyla 60 saniye izle</small>
            </span>
            <Icon.chevron size={22} />
          </button>
          <div className="f-res-actions">
            <button className="f-cta sm" onClick={start}>
              <Icon.rotate size={20} /> Tekrar oyna
            </button>
            <button className="f-ghost" onClick={toAttract}>
              Bitir
            </button>
          </div>
        </div>
      </div>
      {summary && <AimSummary onClose={closeSummary} />}
      {!summary && duel && duel.turn === 1 && duel.results[0] && duel.results[1] && <DuelResult duel={duel} onRematch={duelRematch} onEnd={toAttract} />}
      {!summary && campaign && campaign.idx === CAMPAIGN_ORDER.length - 1 && campaign.results.length === CAMPAIGN_ORDER.length && <CampaignEnd results={campaign.results} onEnd={toAttract} />}
      {story && campaign && <CaseFile idx={campaign.idx} onNext={() => { setStory(false); campaignNext(); }} />}
    </div>
  );
}

/** düello sonucu: iki oyuncu yan yana */
function DuelResult({ duel, onRematch, onEnd }: { duel: NonNullable<ReturnType<typeof useFair.getState>['duel']>; onRematch: () => void; onEnd: () => void }) {
  const [a, b] = duel.results as [NonNullable<(typeof duel.results)[0]>, NonNullable<(typeof duel.results)[1]>];
  const win: -1 | 0 | 1 = a.total === b.total ? -1 : a.total > b.total ? 0 : 1;
  const winner = win === 0 ? duel.players[0] : win === 1 ? duel.players[1] : null;
  return (
    <div className="f-modal solid">
      <div className="f-card f-duel" role="dialog" aria-labelledby="duel-t">
        <div className="f-kicker">Düello tamamlandı</div>
        <h2 id="duel-t">{winner ? `${winner.first} kazandı!` : 'Berabere!'}</h2>
        <div className="f-duel-cols">
          {[0, 1].map((k) => {
            const r = k === 0 ? a : b;
            const p = duel.players[k];
            return (
              <div key={k} className={`f-duel-col ${win === k ? 'win' : ''}`}>
                <div className="fd-name">
                  {p.first} {p.last}
                </div>
                <div className="fd-score">{fmt(r.total)}</div>
                <div className="fd-stars">
                  <Stars n={r.stars} size={18} /> <span>{r.title}</span>
                </div>
                <ul>
                  <li>Korunan makara: {r.materialLeft}/{r.materialMax}</li>
                  <li>Tespit: {r.detected}/{r.entered}</li>
                  <li>Doğru karar: {r.correct}/{r.decisions}</li>
                </ul>
              </div>
            );
          })}
        </div>
        <div className="f-reg-actions">
          <button className="f-cta sm" onClick={onRematch}>
            <Icon.rotate size={20} /> Rövanş
          </button>
          <button className="f-ghost" onClick={onEnd}>
            Bitir
          </button>
        </div>
      </div>
    </div>
  );
}

/** Meydan okuma bölümleri arası Desecure vaka dosyası (temsili) */
const CASE_FILES: { code: string; title: string; text: string; lesson: string }[] = [
  {
    code: 'VAKA 01 · GES',
    title: 'Gece 03.10, panel sahasının batı çiti',
    text: 'Termal kamera çit hattında iki ısı izi yakaladı. AİM operatörü canlı görüntüyle doğruladı: iki kişi, elde kesici. Sesli anons yapıldı, devriye ve jandarma aynı dakikada yönlendirildi. Şüpheliler çiti geçemeden kaçtı.',
    lesson: 'Kayıp: 0 makara. Müdahale süresi: 48 saniye.',
  },
  {
    code: 'VAKA 02 · RES',
    title: 'Sisli sabah, türbin trafosu',
    text: 'Tepelerin arasındaki trafoya yaklaşan bir figür sis yüzünden kameralarda belirsizdi. AİM, MİK kulesinin PTZ kamerasını kilitledi ve kaskı olmayan "personel"i tanıdı: sahte yelek. Jandarma teslim aldı, çalınmaya çalışılan kablo yerinde kaldı.',
    lesson: 'Ders: Yelek yetki değildir; AİM kimliği doğrular.',
  },
  {
    code: 'VAKA 03 · TES',
    title: 'Elektrik kesintisi, 10 saniye karanlık',
    text: 'Santralde kısa bir kesinti kameraları kör etti. Desecure yedek hat ve kendi bataryalı MAS standı çalışmaya devam etti; kesinti sırasında kapıya yaklaşan kamyonet tespit edildi. Kapı kilitli kaldı, araç plakasıyla jandarmaya bildirildi.',
    lesson: 'Ders: Karanlıkta da nöbet sürer.',
  },
  {
    code: 'VAKA 04 · JES',
    title: 'Buharın arkasında iki gölge',
    text: 'Jeotermal sahada kuyu başındaki buhar, kamerayı kör etti. AİM operatörü termal görüntüye geçti: buharın içinde iki insan silüeti, ellerinde kablo makarası. Sesli anons ve siren aynı anda; şüpheliler makarayı bırakıp kaçtı, jandarma yolda yakaladı.',
    lesson: 'Ders: Buhar görüşü keser, termali kesmez.',
  },
  {
    code: 'VAKA 05 · HES',
    title: 'Baraj eteğinde gece yürüyüşü',
    text: 'Cebri boruların yanından santral binasına sızan bir kişi, baraj gövdesinin gölgesinde kameradan kaçtığını sandı. MİA\'nın direk kamerası tepeden gördü; AİM ekibi kapıyı uzaktan kilitledi, devriye kanal köprüsünde karşıladı. Şalt sahasına ulaşamadı.',
    lesson: 'Ders: Gölge vardır, kör nokta yoktur.',
  },
  {
    code: 'VAKA 06 · BESS',
    title: 'Konteyner sıralarının arasında',
    text: 'Batarya depolama tesisinde konteyner sıraları kameralara dar koridorlar bırakır. AİM, MAS standının dört yönlü dedektörüyle koridora giren kişiyi yakaladı: yedek modül deposuna yönelmişti. Siren, anons ve devriye; şüpheli kapıya varamadan jandarma teslim aldı.',
    lesson: 'Ders: Dar koridorlar kör nokta değil, tuzaktır.',
  },
];
function CaseFile({ idx, onNext }: { idx: number; onNext: () => void }) {
  const c = CASE_FILES[idx] ?? CASE_FILES[0];
  const next = MISSION_META[CAMPAIGN_ORDER[idx + 1]];
  return (
    <div className="f-modal solid">
      <div className="f-card f-case" role="dialog" aria-labelledby="case-t">
        <div className="as-head">
          <img src={logoDark} alt="Desecure Technology" />
          <span className="as-badge">
            <i /> 7/24 AİM
          </span>
        </div>
        <div className="f-kicker">{c.code} · Desecure vaka dosyası (temsili)</div>
        <h2 id="case-t">{c.title}</h2>
        <p>{c.text}</p>
        <p className="f-case-lesson">{c.lesson}</p>
        <button className="f-cta" onClick={onNext}>
          {next ? `${next.code} görevine geç` : 'Devam'} <Icon.chevron size={24} />
        </button>
      </div>
    </div>
  );
}

/** Meydan okuma sonu: tesislerin toplamı */
function CampaignEnd({ results, onEnd }: { results: { total: number; stars: number }[]; onEnd: () => void }) {
  const total = results.reduce((t, r) => t + r.total, 0);
  const stars = results.reduce((t, r) => t + r.stars, 0);
  const maxStars = results.length * 3;
  const title = stars >= maxStars - 2 ? 'Bölge Müdürü' : stars >= maxStars * 0.65 ? 'Baş Operatör' : stars >= maxStars * 0.4 ? 'Kıdemli Operatör' : 'Operatör';
  return (
    <div className="f-modal solid">
      <div className="f-card f-duel" role="dialog" aria-labelledby="camp-t">
        <div className="f-kicker">Meydan okuma tamamlandı · GES → RES → TES → JES → HES → BESS</div>
        <h2 id="camp-t">
          {fmt(total)} puan · {title}
        </h2>
        <div className={`f-duel-cols ${results.length > 3 ? "many" : "three"}`}>
          {results.map((r, k) => (
            <div key={k} className="f-duel-col">
              <div className="fd-name">{MISSION_META[CAMPAIGN_ORDER[k]].code}</div>
              <div className="fd-score">{fmt(r.total)}</div>
              <div className="fd-stars">
                <Stars n={r.stars} size={18} />
              </div>
            </div>
          ))}
        </div>
        <p>{results.length} tesis, {stars}/{maxStars} yıldız.</p>
        <div className="f-reg-actions">
          <button className="f-cta sm" onClick={onEnd}>
            Bitir
          </button>
        </div>
      </div>
    </div>
  );
}

/** Stant görevlisi paneli (Ctrl+Shift+E): e-posta kuyruğu */
function StaffPanel({ onClose }: { onClose: () => void }) {
  const [list, setList] = useState(loadOutbox());
  const [msg, setMsg] = useState('');
  const [confirmClear, setConfirmClear] = useState(false);
  const csv = outboxCsv();
  const sent = list.filter((r) => r.sentAt).length;
  return (
    <div className="f-modal" onClick={onClose}>
      <div className="f-card f-staff" onClick={(e) => e.stopPropagation()}>
        <div className="f-kicker">Stant paneli</div>
        <h2>E-posta kuyruğu</h2>
        <p>
          Toplam <b>{list.length}</b> talep · gönderilen <b>{sent}</b> · bekleyen <b>{list.length - sent}</b>. {isMailConfigured() ? 'E-posta ayarı aktif.' : 'E-posta ayarı henüz yapılmadı; talepler bu cihazda saklanıyor.'}
        </p>
        <textarea readOnly value={csv} rows={7} onFocus={(e) => e.currentTarget.select()} />
        {msg && <div className="f-note">{msg}</div>}
        <div className="f-reg-actions">
          <button
            className="f-cta sm"
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(csv);
                setMsg('Liste panoya kopyalandı.');
              } catch {
                setMsg('Kopyalanamadı; metin kutusundan seçip kopyalayın.');
              }
            }}
          >
            Listeyi kopyala
          </button>
          <a className="f-ghost" href={`data:text/csv;charset=utf-8,${encodeURIComponent('\ufeff' + csv)}`} download="desecure-fuar-eposta.csv">
            CSV indir
          </a>
          {isMailConfigured() && (
            <button
              className="f-ghost"
              onClick={async () => {
                await flushOutbox();
                setList(loadOutbox());
                setMsg('Bekleyenler gönderildi.');
              }}
            >
              Bekleyenleri gönder
            </button>
          )}
          {confirmClear ? (
            <button
              className="f-ghost danger"
              onClick={() => {
                clearOutbox();
                setList([]);
                setConfirmClear(false);
                setMsg('Kuyruk temizlendi.');
              }}
            >
              Emin misiniz? Sil
            </button>
          ) : (
            <button className="f-ghost" onClick={() => setConfirmClear(true)}>
              Kuyruğu temizle
            </button>
          )}
          <button className="f-ghost" onClick={onClose}>
            Kapat
          </button>
        </div>
      </div>
    </div>
  );
}

// ───────────── kök ─────────────
export function FairApp() {
  const phase = useFair((s) => s.phase);
  const toAttract = useFair((s) => s.toAttract);
  const finish = useFair((s) => s.finish);
  const touch = useFair((s) => s.touch);
  const gamePhase = useGame((s) => s.phase);
  const map = useGame((s) => s.map);
  const now = useNow(1000);
  const lastInput = useFair((s) => s.lastInput);

  const [staff, setStaff] = useState(false);
  useEffect(() => {
    toAttract();
    void flushOutbox();
  }, [toAttract]);

  // simülasyon bitince fuar sonucunu hesapla
  useEffect(() => {
    if (phase === 'defend' && gamePhase === 'result') finish();
  }, [phase, gamePhase, finish]);

  // hareketsizlikte bekleme ekranına dön (kurulum aşaması)
  useEffect(() => {
    if ((phase === 'build' || phase === 'register' || phase === 'select') && now - lastInput > IDLE_LIMIT) toAttract();
  }, [now, phase, lastInput, toAttract]);

  useEffect(() => {
    const h = () => touch();
    const k = (e: KeyboardEvent) => {
      touch();
      // stant görevlisi: Ctrl+Shift+L skor tablosunu sıfırlar
      if (e.ctrlKey && e.shiftKey && e.key.toLowerCase() === 'l') useFair.getState().clearLb();
      if (e.ctrlKey && e.shiftKey && e.key.toLowerCase() === 'e') {
        e.preventDefault();
        setStaff(true);
      }
    };
    window.addEventListener('pointerdown', h);
    window.addEventListener('keydown', k);
    return () => {
      window.removeEventListener('pointerdown', h);
      window.removeEventListener('keydown', k);
    };
  }, [touch]);

  const scene = useMemo(() => (map ? <GameScene /> : null), [map]);
  const placingNow = useGame((s) => !!s.placing);
  return (
    <div className={`game-root fair m phase-${phase} ${placingNow ? 'm-placing' : ''}`}>
      {scene}
      <RotateHint />
      <div className="hud">
        {phase === 'attract' && <MobileStart />}
        {phase === 'register' && <Register />}
        {phase === 'select' && <MissionSelect />}
        {(phase === 'register' || phase === 'select' || phase === 'result') && (
          <div className="f-corner">
            <SoundToggle className="f-chip f-sound" label />
          </div>
        )}
        {phase === 'build' && <BuildHUD />}
        {phase === 'defend' && <DefendHUD />}
        {phase === 'result' && <ResultView />}
        {phase === 'demo' && <DemoHUD />}
        <GameMenu />
        {staff && <StaffPanel onClose={() => setStaff(false)} />}
      </div>
    </div>
  );
}

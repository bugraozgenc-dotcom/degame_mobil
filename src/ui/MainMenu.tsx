import { LEVELS } from '../game/config/levels';
import { useGame } from '../game/store';
import { Icon } from './Icons';
import logoDark from '../assets/desecure-logo-dark.svg';

export function GesArt() {
  const rows = [];
  for (let r = 0; r < 5; r++)
    for (let c = 0; c < 7; c++) {
      const x = 40 + c * 34 - r * 14;
      const y = 92 + r * 18 + c * 6;
      rows.push(<polygon key={`${r}-${c}`} points={`${x},${y} ${x + 28},${y + 5} ${x + 22},${y + 16} ${x - 6},${y + 11}`} fill="#1d3f86" stroke="#7fa6ff" strokeWidth="0.6" opacity={0.95} />);
    }
  return (
    <svg viewBox="0 0 320 210" className="world-art" preserveAspectRatio="xMidYMid slice">
      <defs>
        <linearGradient id="gsky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#ffcf7a" />
          <stop offset="1" stopColor="#8a1c2b" />
        </linearGradient>
      </defs>
      <rect width="320" height="210" fill="url(#gsky)" opacity="0.25" />
      <circle cx="262" cy="46" r="20" fill="#ffd36e" opacity="0.9" />
      <polygon points="0,120 160,70 320,120 320,210 0,210" fill="#5ea83b" />
      <polygon points="0,150 160,100 320,150 320,210 0,210" fill="#77bf4c" />
      {rows}
      <rect x="236" y="96" width="34" height="24" fill="#eeeae2" />
      <rect x="236" y="96" width="34" height="5" fill="#8a1c2b" />
      <path d="M210 168 l28 -8 M222 172 v-28" stroke="#cfd3d8" strokeWidth="2" />
      <path d="M222 144 l14 -4" stroke="#f3f1ec" strokeWidth="5" />
      <path d="M180 178 q20 -14 40 -10" stroke="#39d0ff" strokeWidth="1" fill="#39d0ff" fillOpacity="0.15" />
    </svg>
  );
}

export function ResArt() {
  const turb = (x: number, y: number, s: number, a: number) => (
    <g transform={`translate(${x},${y}) scale(${s})`}>
      <path d="M-2 0 L-1 -70 L1 -70 L2 0Z" fill="#f4f4f2" />
      <circle cx="0" cy="-70" r="3" fill="#fff" />
      {[0, 120, 240].map((r) => (
        <path key={r} d="M0 -70 L-2.5 -110 L1.5 -110 Z" fill="#fafafa" transform={`rotate(${r + a} 0 -70)`} />
      ))}
      <rect x="-2.5" y="-14" width="5" height="3" fill="#8a1c2b" />
    </g>
  );
  return (
    <svg viewBox="0 0 320 210" className="world-art" preserveAspectRatio="xMidYMid slice">
      <rect width="320" height="210" fill="#a8d4f0" opacity="0.18" />
      <path d="M0 140 Q60 70 120 120 T240 90 T320 110 V210 H0Z" fill="#5c9a3a" />
      <path d="M0 170 Q80 120 160 150 T320 140 V210 H0Z" fill="#78b84d" />
      {turb(70, 112, 0.85, 10)}
      {turb(180, 104, 1.0, 40)}
      {turb(268, 112, 0.8, 75)}
      {[30, 44, 118, 132, 222, 236].map((x, k) => (
        <polygon key={k} points={`${x},${160 - (k % 2) * 6} ${x + 7},${178} ${x - 7},${178}`} fill="#2f7a3d" />
      ))}
      <path d="M150 210 Q170 170 160 150" stroke="#c9a874" strokeWidth="4" fill="none" />
    </svg>
  );
}


export function TesArt() {
  return (
    <svg viewBox="0 0 320 210" className="world-art" preserveAspectRatio="xMidYMid slice">
      <rect width="320" height="210" fill="#a8d4f0" opacity="0.14" />
      <path d="M0 150 Q160 120 320 150 V210 H0Z" fill="#6aa846" />
      <path d="M40 160 C52 120 50 95 44 70 L86 70 C80 95 78 120 90 160Z" fill="#d6d2ca" />
      <rect x="44" y="76" width="42" height="6" fill="#9e1b39" />
      <path d="M100 160 C112 124 110 102 104 80 L140 80 C134 102 132 124 144 160Z" fill="#cfccc5" />
      <rect x="104" y="86" width="36" height="5" fill="#9e1b39" />
      <circle cx="66" cy="58" r="16" fill="#fff" opacity="0.8" />
      <circle cx="80" cy="44" r="12" fill="#fff" opacity="0.6" />
      <circle cx="124" cy="68" r="12" fill="#fff" opacity="0.7" />
      <rect x="168" y="112" width="70" height="48" fill="#e7e4dd" />
      <rect x="168" y="112" width="70" height="6" fill="#9e1b39" />
      <rect x="196" y="78" width="30" height="40" fill="#8f969e" />
      <rect x="252" y="40" width="10" height="120" fill="#d6d2ca" />
      <rect x="252" y="46" width="10" height="8" fill="#9e1b39" />
      <rect x="252" y="62" width="10" height="8" fill="#9e1b39" />
      <circle cx="262" cy="32" r="9" fill="#b8bcc2" opacity="0.7" />
      <path d="M270 160 l14 -16 l14 16z" fill="#26262a" />
    </svg>
  );
}

export function JesArt() {
  return (
    <svg viewBox="0 0 320 210" className="world-art" preserveAspectRatio="xMidYMid slice">
      <rect width="320" height="210" fill="#ffd9a8" opacity="0.18" />
      <path d="M0 140 Q90 100 160 130 T320 120 V210 H0Z" fill="#8c9a5a" />
      <path d="M0 165 Q110 135 200 160 T320 150 V210 H0Z" fill="#6aa846" />
      {/* kuyu başları + buhar */}
      {[60, 130, 250].map((x, k) => (
        <g key={k} transform={`translate(${x},150)`}>
          <rect x="-10" y="-4" width="20" height="4" fill="#b3afa6" />
          <rect x="-3" y="-22" width="6" height="18" fill="#b9bec4" />
          <rect x="-5" y="-14" width="10" height="3" fill="#9e1b39" />
          <rect x="-4" y="-26" width="8" height="3" fill="#9e1b39" />
          <circle cx="2" cy="-36" r="7" fill="#fff" opacity="0.8" />
          <circle cx="8" cy="-48" r="9" fill="#fff" opacity="0.6" />
          <circle cx="16" cy="-62" r="11" fill="#fff" opacity="0.4" />
        </g>
      ))}
      {/* boru hattı */}
      <path d="M60 148 H250" stroke="#d8d4cb" strokeWidth="4" />
      {/* türbin binası + kondenser */}
      <rect x="168" y="104" width="64" height="44" fill="#e7e4dd" />
      <rect x="168" y="104" width="64" height="6" fill="#9e1b39" />
      <rect x="112" y="118" width="46" height="26" fill="#8f969e" />
      {[122, 136, 150].map((x) => (
        <circle key={x} cx={x} cy="118" r="6" fill="#cfd3d8" stroke="#2a2c31" strokeWidth="1" />
      ))}
      <circle cx="286" cy="40" r="18" fill="#ffd36e" opacity="0.9" />
    </svg>
  );
}

export function HesArt() {
  return (
    <svg viewBox="0 0 320 210" className="world-art" preserveAspectRatio="xMidYMid slice">
      <rect width="320" height="210" fill="#a8d4f0" opacity="0.2" />
      {/* dağlar */}
      <path d="M0 110 L70 40 L130 95 L200 30 L260 90 L320 50 V210 H0Z" fill="#6b7f5a" />
      {/* rezervuar */}
      <path d="M0 96 Q160 80 320 96 V118 H0Z" fill="#2f7fb8" />
      {/* baraj gövdesi */}
      <path d="M40 118 H280 L300 170 H20Z" fill="#cfcbc3" />
      <rect x="40" y="112" width="240" height="7" fill="#9e1b39" />
      {/* savaklar */}
      {[200, 230, 260].map((x) => (
        <rect key={x} x={x} y="126" width="18" height="40" fill="#dfe9f2" opacity="0.85" />
      ))}
      {/* cebri borular */}
      {[110, 130, 150].map((x) => (
        <path key={x} d={`M${x} 124 L${x + 10} 180`} stroke="#9aa3ab" strokeWidth="9" />
      ))}
      {/* santral binası */}
      <rect x="92" y="172" width="88" height="30" fill="#e7e4dd" />
      <rect x="92" y="172" width="88" height="5" fill="#9e1b39" />
      {/* kuyruk suyu */}
      <path d="M186 180 Q220 190 320 186 V210 H186Z" fill="#3a8fc4" opacity="0.9" />
      {/* şalt */}
      <path d="M232 170 l22 -6 M240 174 v-20 M250 172 v-18" stroke="#cfd3d8" strokeWidth="2" />
    </svg>
  );
}

export function BessArt() {
  const boxes = [];
  for (let r = 0; r < 2; r++)
    for (let c = 0; c < 4; c++) {
      const x = 34 + c * 62 - r * 20;
      const y = 112 + r * 34;
      boxes.push(
        <g key={`${r}-${c}`}>
          <rect x={x} y={y} width="48" height="24" fill="#eceae4" />
          <rect x={x} y={y + 6} width="48" height="4" fill="#9e1b39" />
          <rect x={x + 6} y={y - 6} width="12" height="6" fill="#cfd3d8" />
          <rect x={x + 30} y={y - 6} width="12" height="6" fill="#cfd3d8" />
          <circle cx={x + 5} cy={y + 20} r="1.6" fill="#3dff7a" />
        </g>
      );
    }
  return (
    <svg viewBox="0 0 320 210" className="world-art" preserveAspectRatio="xMidYMid slice">
      <rect width="320" height="210" fill="#a8d4f0" opacity="0.16" />
      <polygon points="0,120 160,70 320,120 320,210 0,210" fill="#5ea83b" />
      <polygon points="0,150 160,100 320,150 320,210 0,210" fill="#77bf4c" />
      <rect x="20" y="104" width="280" height="90" fill="#a9a49a" opacity="0.6" />
      {boxes}
      <rect x="250" y="60" width="40" height="30" fill="#8f969e" />
      <path d="M254 56 l32 -6 M262 60 v-18 M276 58 v-16" stroke="#cfd3d8" strokeWidth="2" />
      <path d="M40 92 h60 M40 92 l-6 -8 M100 92 l6 -8" stroke="#ffd23a" strokeWidth="2" fill="none" />
    </svg>
  );
}

export function MainMenu() {
  const start = useGame((s) => s.startLevel);
  const best = useGame((s) => s.bestScores);
  const worlds = [
    { id: 'ges', title: 'GES', sub: 'Güneş Enerjisi Santrali', desc: 'Geniş panel sahaları, trafolar, inverterler, çevre çitleri ve servis yolları.', art: <GesArt /> },
    { id: 'res', title: 'RES', sub: 'Rüzgâr Enerjisi Santrali', desc: 'Dağlık arazi, yüksek tepeler, ormanlık alanlar ve uzak türbinler.', art: <ResArt /> },
    { id: 'tes', title: 'TES', sub: 'Termik Santral', desc: 'Soğutma kuleleri, kazan dairesi, şalt sahası, kömür sahası ve yakıt tankları.', art: <TesArt /> },
    { id: 'jes', title: 'JES', sub: 'Jeotermal Enerji Santrali', desc: 'Buharı tüten üretim kuyuları, boru hatları, separatör ve şalt sahası.', art: <JesArt /> },
    { id: 'hes', title: 'HES', sub: 'Hidroelektrik Santrali', desc: 'Baraj, cebri borular, santral binası, kuyruk suyu kanalı ve şalt sahası.', art: <HesArt /> },
    { id: 'bess', title: 'BESS', sub: 'Batarya Enerji Depolama Tesisi', desc: 'Batarya konteyner blokları, PCS inverter skidleri, şalt sahası ve yedek modül deposu.', art: <BessArt /> },
  ] as const;
  return (
    <div className="menu">
      <div className="menu-bg" />
      <header className="menu-head">
        <div className="brand">
          <div>
            <img src={logoDark} alt="Desecure Technology" style={{ height: 30, display: 'block', marginBottom: 8 }} />
            <div className="brand-game">SECURITY COMMANDER</div>
          </div>
        </div>
        <div className="menu-tag">Enerji tesisleri için izometrik güvenlik strateji simülasyonu</div>
      </header>
      <section className="phases">
        {[
          ['01', 'PLANLA', 'Sahanın risklerini analiz et, güvenlik altyapısını tasarla.'],
          ['02', 'YERLEŞTİR', 'Kamera, sensör, alarm, kule ve ekipleri bütçene göre konumlandır.'],
          ['03', 'SAVUN', 'Simülasyonu başlat, kör noktalardaki olaylara manuel müdahale et.'],
        ].map(([n, t, d]) => (
          <div className="phase" key={n}>
            <span className="phase-n">{n}</span>
            <div>
              <div className="phase-t">{t}</div>
              <div className="phase-d">{d}</div>
            </div>
          </div>
        ))}
      </section>
      <section className="worlds">
        {worlds.map((w) => (
          <div className="world" key={w.id}>
            <div className="world-visual">{w.art}</div>
            <div className="world-body">
              <div className="world-title">
                <span className="world-code">{w.title}</span>
                <span>{w.sub}</span>
              </div>
              <p className="world-desc">{w.desc}</p>
              <div className="chapters">
                {LEVELS.filter((l) => l.mapId === w.id).map((l) => (
                  <button key={l.id} className="chapter" onClick={() => start(l.id)}>
                    <div className="chapter-top">
                      <span className="chapter-n">Bölüm {l.id}</span>
                      <span className={`diff d-${l.difficulty}`}>{l.difficulty}</span>
                    </div>
                    <div className="chapter-t">{l.title}</div>
                    <div className="chapter-meta">
                      {l.night ? <Icon.moon size={14} /> : <Icon.sun size={14} />}
                      {l.weather === 'rain' && <Icon.rain size={14} />}
                      {l.weather === 'fog' && <Icon.fog size={14} />}
                      <span>{l.budget.toLocaleString('tr-TR')} kredi</span>
                      {best[l.id] !== undefined && <span className="best">En iyi: {best[l.id]}</span>}
                    </div>
                    <div className="chapter-go">
                      Başla <Icon.chevron size={14} />
                    </div>
                  </button>
                ))}
              </div>
            </div>
          </div>
        ))}
      </section>
      <footer className="menu-foot">
        <span className="motto">“Önce güvenliğini tasarla. Sonra sistemini test et. Göremediğin riskleri sen yönet.”</span>
        <span className="disc">Oyun simülasyonudur; ürün kabiliyetleri temsilîdir.</span>
      </footer>
    </div>
  );
}

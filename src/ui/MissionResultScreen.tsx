import { LEVELS } from '../game/config/levels';
import { useGame } from '../game/store';
import { Icon } from './Icons';

const fmt = (n: number) => Math.round(n).toLocaleString('tr-TR');

export function MissionResultScreen() {
  const r = useGame((s) => s.result);
  const level = useGame((s) => s.level);
  const { improvePlan, replay, toMenu, startLevel } = useGame.getState();
  if (!r || !level) return null;
  const m = r.metrics;
  const next = LEVELS.find((l) => l.id === level.id + 1);
  const ringC = 2 * Math.PI * 54;
  const col = r.score >= 80 ? '#39d98a' : r.score >= 65 ? '#f5c242' : r.score >= 50 ? '#f59a2c' : '#e5484d';
  const cards: { l: string; v: string; s?: string; tone?: string }[] = [
    { l: 'Güvenlik kapsamı', v: `%${Math.round(m.coveragePct)}`, s: `Kritik alan %${Math.round(m.criticalPct)}` },
    { l: 'Önlenen ihlaller', v: `${m.prevented}/${m.thieves}`, s: `${m.catches} yakalama`, tone: m.thieves && m.prevented === m.thieves ? 'g' : undefined },
    { l: 'Kaçırılan tehditler', v: `${m.breaches}`, s: `${m.missed} hiç fark edilmedi`, tone: m.breaches ? 'r' : 'g' },
    { l: 'Doğru sınıflandırma', v: `${m.classCorrect}/${m.classTotal}`, s: m.classTotal ? `%${Math.round(m.classAccuracy)} doğruluk` : 'Olay yok' },
    { l: 'Yanlış alarmlar', v: `${m.falseAlarms}`, tone: m.falseAlarms ? 'r' : 'g' },
    { l: 'Ort. tespit süresi', v: m.avgDetect !== null ? `${m.avgDetect.toFixed(1)} sn` : '—', s: 'Çit ihlalinden itibaren' },
    { l: 'Ort. müdahale süresi', v: m.avgResponse !== null ? `${m.avgResponse.toFixed(1)} sn` : '—', s: 'Tespitten sonuca' },
    { l: 'Kullanılan bütçe', v: fmt(m.budgetUsed), s: `/ ${fmt(m.budgetTotal)} kredi`, tone: m.budgetUsed > m.budgetTotal ? 'r' : undefined },
    { l: 'Korunan kritik alanlar', v: `${m.criticalProtected}/${m.criticalTotal}`, s: '≥%60 kapsama' },
    { l: 'Devriye performansı', v: `${m.dispatches} sevk`, s: `${m.animalsHandled}/${m.animals} hayvan uzaklaştırıldı` },
  ];
  return (
    <div className="result">
      <div className="result-card">
        <div className="res-head">
          <div className="res-k">GÜVENLİK DEĞERLENDİRME RAPORU · Bölüm {level.id}</div>
          <h1>{level.title}</h1>
        </div>
        <div className="res-top">
          <div className="score-ring">
            <svg viewBox="0 0 128 128" width="150" height="150">
              <circle cx="64" cy="64" r="54" stroke="#2a2c31" strokeWidth="10" fill="none" />
              <circle cx="64" cy="64" r="54" stroke={col} strokeWidth="10" fill="none" strokeLinecap="round" strokeDasharray={`${(r.score / 100) * ringC} ${ringC}`} transform="rotate(-90 64 64)" />
            </svg>
            <div className="score-v">
              <b>{r.score}</b>
              <span>/100</span>
            </div>
          </div>
          <div className="res-grade">
            <div className="grade" style={{ color: col }}>
              {r.grade}
            </div>
            <div className="grade-t">{r.title}</div>
            <div className="breakdown">
              {r.breakdown.map((b) => (
                <div key={b.label} className="bd-row">
                  <span>{b.label}</span>
                  <div className="bar">
                    <div style={{ width: `${(b.value / b.max) * 100}%` }} />
                  </div>
                  <b>
                    {b.value.toFixed(0)}/{b.max}
                  </b>
                </div>
              ))}
            </div>
          </div>
        </div>
        <div className="metric-grid">
          {cards.map((c) => (
            <div key={c.l} className={`metric ${c.tone ?? ''}`}>
              <i>{c.l}</i>
              <b>{c.v}</b>
              {c.s && <span>{c.s}</span>}
            </div>
          ))}
        </div>
        <div className="res-cols">
          <div>
            <div className="section-t">Öneriler</div>
            <ul className="recs">
              {r.recommendations.map((x, k) => (
                <li key={k} className={x.tone}>
                  {x.tone === 'good' ? <Icon.check size={15} /> : x.tone === 'bad' ? <Icon.alert size={15} /> : <Icon.bulb size={15} />}
                  <span>{x.text}</span>
                </li>
              ))}
            </ul>
          </div>
          <div>
            <div className="section-t">Olay kayıtları</div>
            <div className="ev-list">
              {r.events.length === 0 && <div className="empty">Kayıtlı olay yok.</div>}
              {r.events.map((ev) => (
                <div key={ev.seq} className={`ev ${ev.tone}`}>
                  <span className="ic-seq">#{ev.seq}</span>
                  <span className="ev-t">{ev.title}</span>
                  <span className="ev-o">{ev.outcome}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
        <div className="res-actions">
          <button className="start-btn small" onClick={improvePlan}>
            <Icon.upgrade size={18} /> GÜVENLİK PLANINI GELİŞTİR
          </button>
          <button className="ghost-btn" onClick={replay}>
            <Icon.rotate size={16} /> Aynı planla tekrar
          </button>
          {next && (
            <button className="ghost-btn" onClick={() => startLevel(next.id)}>
              Sonraki bölüm <Icon.chevron size={16} />
            </button>
          )}
          <button className="ghost-btn" onClick={toMenu}>
            <Icon.menu size={16} /> Ana menü
          </button>
        </div>
      </div>
    </div>
  );
}

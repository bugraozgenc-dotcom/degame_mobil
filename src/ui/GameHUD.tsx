import { useState } from 'react';
import { AimPanel, useAim } from './AimPanel';
import { EQUIPMENT, SHOP_ORDER, deviceValue, isCameraLike, levelMult, upgradeCost } from '../game/config/equipment';
import { MOBILE_PLACE, getEngine, useGame, validatePlacement } from '../game/store';
import { CLASS_LABELS, type Incident } from '../game/systems/entities';
import { labelTr } from '../game/systems/SimulationEngine';
import type { ClassLabel, EquipmentType } from '../game/types';
import { EquipIcon, Icon } from './Icons';
import { SoundToggle } from './SoundToggle';

const fmt = (n: number) => Math.round(n).toLocaleString('tr-TR');

export function clockStr(start: number, span: number, t: number, dur: number) {
  const h = start + (Math.min(t, dur) / dur) * span;
  const hh = Math.floor(h) % 24;
  const mm = Math.floor((h - Math.floor(h)) * 60);
  return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
}

// ───────────── üst bar ─────────────
function TopBar() {
  const level = useGame((s) => s.level)!;
  const map = useGame((s) => s.map)!;
  const budget = useGame((s) => s.budget);
  const cov = useGame((s) => s.coverage);
  const phase = useGame((s) => s.phase);
  useGame((s) => s.simTick);
  const toMenu = useGame((s) => s.toMenu);
  const setShowHelp = useGame((s) => s.setShowHelp);
  const e = getEngine();
  const t = phase === 'sim' && e ? e.time : 0;
  const weather =
    level.weather === 'rain' ? { i: <Icon.rain size={16} />, l: `${level.night ? 'Gece · ' : ''}Yağmurlu · 11°C` } : level.weather === 'fog' ? { i: <Icon.fog size={16} />, l: 'Sisli · 8°C · Rüzgâr 34 km/s' } : { i: level.night ? <Icon.moon size={16} /> : <Icon.sun size={16} />, l: level.night ? 'Gece · Açık · 14°C' : 'Açık · 24°C' };
  const readiness = cov ? Math.round(cov.riskWeightedPct) : 0;
  let live: { prevented: number; breaches: number; fa: number; open: number } | null = null;
  if (phase === 'sim' && e) {
    live = {
      prevented: e.npcs.filter((n) => n.kind === 'thief' && (n.outcome === 'caught' || n.outcome === 'fled')).length,
      breaches: e.npcs.filter((n) => n.kind === 'thief' && n.outcome === 'breach').length,
      fa: e.falseAlarms.length,
      open: e.incidents.filter((i) => i.status !== 'resolved').length,
    };
  }
  return (
    <div className="topbar">
      <div className="tb-left">
        <div className="tb-logo">
          <Icon.shield size={20} />
        </div>
        <div>
          <div className="tb-site">{map.name}</div>
          <div className="tb-level">
            Bölüm {level.id} · {level.title}
          </div>
        </div>
      </div>
      <div className="tb-center">
        <div className="chip budget" title="Güvenlik kredisi">
          <Icon.coin size={16} />
          <span className="chip-v">{fmt(budget)}</span>
          <span className="chip-l">/ {fmt(level.budget)}</span>
        </div>
        <div className="chip" title="Risk ağırlıklı kapsama — gerçek görüş alanlarının birleşimi">
          <Icon.shield size={16} />
          <span className="chip-l">Güvenlik puanı</span>
          <span className="chip-v">{readiness}</span>
        </div>
        {live && (
          <div className="chip live">
            <span className="ok">
              <Icon.check size={14} /> {live.prevented}
            </span>
            <span className="bad">
              <Icon.alert size={14} /> {live.breaches}
            </span>
            <span className="warn" title="Yanlış alarm">
              <Icon.x size={14} /> {live.fa}
            </span>
            <span title="Açık olay">
              <Icon.flag size={14} /> {live.open}
            </span>
          </div>
        )}
        {live && getEngine() && (
          <div className={`chip reels ${getEngine()!.stockRemaining() < getEngine()!.stockMax() ? 'low' : ''}`} title="Tesisteki kablo makaraları — hepsi çalınırsa görev biter">
            <span className="reel-dot" />
            <span className="chip-v">
              {getEngine()!.stockRemaining()}/{getEngine()!.stockMax()}
            </span>
            <span className="chip-l">makara</span>
          </div>
        )}
        <div className="chip">
          {weather.i}
          <span className="chip-l">{weather.l}</span>
        </div>
        <div className="chip clock">
          <Icon.clock size={16} />
          <span className="chip-v">{clockStr(level.clockStart, level.clockSpan, t, level.duration)}</span>
          {phase === 'sim' && e && (
            <div className="clock-bar">
              <div style={{ width: `${(e.time / e.duration) * 100}%` }} />
            </div>
          )}
        </div>
      </div>
      <div className="tb-right">
        <SoundToggle />
        <button className="icon-btn" onClick={() => setShowHelp(true)} title="Nasıl oynanır">
          <Icon.help size={18} />
        </button>
        <button className="icon-btn" onClick={toMenu} title="Ana menü">
          <Icon.menu size={18} />
        </button>
      </div>
    </div>
  );
}

// ───────────── sol panel ─────────────
function Toggle({ on, label, color, onClick, icon }: { on: boolean; label: string; color: string; onClick: () => void; icon: React.ReactNode }) {
  return (
    <button className={`toggle ${on ? 'on' : ''}`} onClick={onClick}>
      <span className="sw" style={{ background: on ? color : undefined }} />
      {icon}
      <span>{label}</span>
    </button>
  );
}

function Bar({ v, color }: { v: number; color?: string }) {
  return (
    <div className="bar">
      <div style={{ width: `${Math.max(0, Math.min(100, v))}%`, background: color ?? (v >= 70 ? '#39d98a' : v >= 45 ? '#f5c242' : '#e5484d') }} />
    </div>
  );
}

function LeftPanel() {
  const layers = useGame((s) => s.layers);
  const toggle = useGame((s) => s.toggleLayer);
  const cov = useGame((s) => s.coverage);
  const devices = useGame((s) => s.devices);
  const phase = useGame((s) => s.phase);
  const selected = useGame((s) => s.selectedDeviceId);
  const select = useGame((s) => s.selectDevice);
  const focusOn = useGame((s) => s.focusOn);
  const setPtzAim = useGame((s) => s.setPtzAim);
  const ptzAimId = useGame((s) => s.ptzAimId);
  useGame((s) => s.simTick);
  const [open, setOpen] = useState(true);
  const e = getEngine();
  if (!open)
    return (
      <button className="panel-tab left" onClick={() => setOpen(true)}>
        <Icon.layers size={18} />
      </button>
    );
  return (
    <div className="panel left-panel">
      <div className="panel-head">
        <span>Güvenlik Katmanları</span>
        <button className="icon-btn sm" onClick={() => setOpen(false)}>
          <Icon.x size={14} />
        </button>
      </div>
      <div className="toggles">
        <Toggle on={layers.risk} label="Risk haritası" color="#f59a2c" onClick={() => toggle('risk')} icon={<Icon.alert size={15} />} />
        <Toggle on={layers.coverage} label="Kapsama" color="#1ed7be" onClick={() => toggle('coverage')} icon={<Icon.eye size={15} />} />
        <Toggle on={layers.blind} label="Kör noktalar" color="#eb2d46" onClick={() => toggle('blind')} icon={<Icon.target size={15} />} />
        <Toggle on={layers.cones} label="Görüş konileri" color="#39d0ff" onClick={() => toggle('cones')} icon={<Icon.fixedCam size={15} />} />
      </div>
      {layers.risk && (
        <div className="legend">
          <span><i style={{ background: '#3cc85a' }} />Düşük</span>
          <span><i style={{ background: '#f5d732' }} />Orta</span>
          <span><i style={{ background: '#fa8c1e' }} />Yüksek</span>
          <span><i style={{ background: '#eb2832' }} />Kritik</span>
        </div>
      )}
      {cov && (
        <div className="section">
          <div className="section-t">Kapsama Analizi</div>
          <div className="stat-row">
            <span>Toplam kapsama</span>
            <b>%{Math.round(cov.coveragePct)}</b>
          </div>
          <Bar v={cov.coveragePct} />
          <div className="stat-row">
            <span>Kamera görüşü</span>
            <b>%{Math.round(cov.cameraPct)}</b>
          </div>
          <Bar v={cov.cameraPct} color="#1ed7be" />
          <div className="stat-row">
            <span>Kritik alanlar</span>
            <b>%{Math.round(cov.criticalPct)}</b>
          </div>
          <Bar v={cov.criticalPct} />
          <div className="zones">
            {cov.zones
              .filter((z) => z.critical)
              .map((z) => (
                <div key={z.name} className="zone" title={`${z.name}: %${Math.round(z.pct)}`}>
                  <span className="zn">{z.name}</span>
                  <span className={`zp ${z.pct >= 60 ? 'g' : z.pct >= 35 ? 'y' : 'r'}`}>%{Math.round(z.pct)}</span>
                </div>
              ))}
          </div>
        </div>
      )}
      <div className="section grow">
        <div className="section-t">
          {phase === 'sim' ? 'Cihazlar & Ekipler' : 'Ekipman Listesi'} <span className="count">{devices.length}</span>
        </div>
        <div className="dev-list">
          {devices.length === 0 && <div className="empty">Henüz ekipman yok. Alttaki mağazadan seçip haritaya yerleştir.</div>}
          {devices.map((d) => {
            const rt = e?.runtime(d.id);
            const status = phase === 'sim' ? (rt?.disabled ? 'off' : rt?.faulty ? 'warn' : 'on') : null;
            return (
              <div
                key={d.id}
                className={`dev-row ${selected === d.id ? 'sel' : ''} ${ptzAimId === d.id ? 'aim' : ''}`}
                onClick={() => {
                  if (phase === 'planning') select(d.id);
                  focusOn(d.x, d.z);
                }}
              >
                <EquipIcon type={d.type} size={16} />
                <span className="dl">{d.label}</span>
                <span className="dn">{EQUIPMENT[d.type].name}</span>
                {d.level === 2 && <span className="lvl">★</span>}
                {status && <span className={`st ${status}`} title={status === 'off' ? 'Çevrim dışı' : status === 'warn' ? 'Arızalı' : 'Aktif'} />}
                {phase === 'sim' && d.type === 'ptzCam' && (
                  <button
                    className="mini"
                    onClick={(ev) => {
                      ev.stopPropagation();
                      if (rt?.ptzMode === 'lock') {
                        e?.releasePtz(d.id);
                        useGame.getState().toast(`${d.label} taramaya döndü`, 'info');
                      } else {
                        setPtzAim(d.id);
                        useGame.getState().toast(`${d.label}: Haritada hedef noktaya tıklayın`, 'info');
                      }
                    }}
                  >
                    {rt?.ptzMode === 'lock' ? 'Tarama' : 'Yönlendir'}
                  </button>
                )}
              </div>
            );
          })}
          {phase === 'sim' &&
            e?.responders.map((r) => (
              <div key={r.id} className="dev-row unit" onClick={() => focusOn(r.x, r.z)}>
                <EquipIcon type={r.kind === 'vehicle' ? 'vehicle' : 'patrol'} size={16} />
                <span className="dl">{r.label}</span>
                <span className="dn">{{ patrol: 'Devriyede', idle: 'Hazır', dispatch: 'Sevk edildi', investigate: 'İnceliyor', return: 'Dönüyor', chase: 'Takipte', escort: 'Gözaltı' }[r.state]}</span>
                <span className={`st ${r.state === 'patrol' || r.state === 'idle' ? 'on' : 'busy'}`} />
              </div>
            ))}
        </div>
      </div>
    </div>
  );
}

// ───────────── mağaza ─────────────
/** mobil mağaza: kısa adlar (ince tepsi) */
const SHORT_NAME: Partial<Record<EquipmentType, string>> = {
  bulletCam: 'Bullet',
  fixedCam: 'Çift Bullet',
  thermalCam: 'Termal',
  ptzCam: 'PTZ',
  drone: 'Drone',
  siren: 'Siren',
  patrol: 'Devriye',
  light: 'Işık',
  tower: 'Kule',
  motion: 'Dedektör',
  speaker: 'Hoparlör',
  perimeter: 'Çevre',
};

export function EquipmentShop() {
  const budget = useGame((s) => s.budget);
  const devices = useGame((s) => s.devices);
  const placing = useGame((s) => s.placing);
  const begin = useGame((s) => s.beginPlace);
  const phase = useGame((s) => s.phase);
  const emergency = useGame((s) => s.emergency);
  const [hover, setHover] = useState<EquipmentType | null>(null);
  const [simOpen, setSimOpen] = useState(false);
  const shopTypes = useGame((s) => s.shopTypes);
  const fair = useGame((s) => s.fair);
  if (phase === 'sim' && fair) return null;
  if (phase === 'sim' && !simOpen)
    return (
      <button className="emergency-btn" onClick={() => setSimOpen(true)} disabled={emergency <= 0}>
        <Icon.wrench size={16} /> Acil ekipman ({emergency})
      </button>
    );
  return (
    <div className="shop-wrap">
      {phase === 'sim' && (
        <div className="shop-sim-head">
          <span>Acil yerleştirme · {emergency} hak kaldı</span>
          <button className="icon-btn sm" onClick={() => setSimOpen(false)}>
            <Icon.x size={14} />
          </button>
        </div>
      )}
      {hover && (
        <div className="shop-tip">
          <div className="tip-t">
            <EquipIcon type={hover} size={18} /> {EQUIPMENT[hover].name}
          </div>
          <div className="tip-d">{EQUIPMENT[hover].desc}</div>
          <div className="tip-stats">
            {EQUIPMENT[hover].stats.map((s) => (
              <span key={s.label}>
                <i>{s.label}</i>
                {s.value}
              </span>
            ))}
          </div>
        </div>
      )}
      <div className="shop">
        {(shopTypes ?? SHOP_ORDER).map((t) => {
          const spec = EQUIPMENT[t];
          const count = devices.filter((d) => d.type === t).length;
          const lim = spec.limit && count >= spec.limit;
          const poor = spec.cost > budget;
          const dis = !!lim || poor || (phase === 'sim' && emergency <= 0);
          return (
            <button
              key={t}
              className={`shop-item cat-${spec.category} ${placing?.type === t && !placing.existingId ? 'active' : ''} ${dis ? 'dis' : ''}`}
              onPointerDown={(ev) => {
                if (dis) return;
                ev.preventDefault();
                begin(t, true);
              }}
              onPointerUp={() => {
                const p = useGame.getState().placing;
                if (p && p.fromShopDrag) useGame.setState({ placing: { ...p, fromShopDrag: false } });
              }}
              onMouseEnter={() => setHover(t)}
              onMouseLeave={() => setHover(null)}
            >
              <div className="si-icon">
                <EquipIcon type={t} size={24} />
              </div>
              <div className="si-name">{MOBILE_PLACE ? SHORT_NAME[t] ?? spec.name : spec.name}</div>
              <div className="si-cost">
                <Icon.coin size={11} /> {fmt(spec.cost)}
              </div>
              {count > 0 && <span className="si-count">{count}</span>}
              {lim && <span className="si-lim">Limit</span>}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ───────────── sağ panel (planlama) ─────────────
function Inspector() {
  const id = useGame((s) => s.selectedDeviceId);
  const devices = useGame((s) => s.devices);
  const budget = useGame((s) => s.budget);
  const level = useGame((s) => s.level)!;
  const { moveDevice, rotateDevice, sellDevice, upgradeDevice, selectDevice } = useGame.getState();
  const d = devices.find((x) => x.id === id);
  if (!d) {
    return (
      <div className="panel right-panel">
        <div className="panel-head">
          <span>Görev Brifingi</span>
        </div>
        <div className="brief">
          <div className="brief-t">{level.subtitle}</div>
          <p>{level.desc}</p>
          <div className="section-t">Saha ipuçları</div>
          <ul className="tips">
            {level.tips.map((t) => (
              <li key={t}>
                <Icon.bulb size={14} /> {t}
              </li>
            ))}
          </ul>
          <div className="section-t">Kontroller</div>
          <ul className="keys">
            <li><kbd>Sol sürükle</kbd> Haritayı kaydır</li>
            <li><kbd>Sağ sürükle</kbd> / <kbd>Q</kbd><kbd>E</kbd> Döndür</li>
            <li><kbd>Tekerlek</kbd> Yakınlaştır</li>
            <li><kbd>R</kbd> Yerleştirirken 45° döndür</li>
            <li><kbd>Esc</kbd> İptal · <kbd>Del</kbd> Sat</li>
          </ul>
        </div>
      </div>
    );
  }
  const spec = EQUIPMENT[d.type];
  const up = upgradeCost(d.type);
  const range = d.type === 'speaker' ? 14 : d.type === 'siren' ? 20 : spec.range;
  return (
    <div className="panel right-panel">
      <div className="panel-head">
        <span>Ekipman</span>
        <button className="icon-btn sm" onClick={() => selectDevice(null)}>
          <Icon.x size={14} />
        </button>
      </div>
      <div className="insp">
        <div className="insp-top">
          <div className={`insp-icon cat-${spec.category}`}>
            <EquipIcon type={d.type} size={30} />
          </div>
          <div>
            <div className="insp-label">
              {d.label} {d.level === 2 && <span className="lvl">★ Sv.2</span>}
            </div>
            <div className="insp-name">{spec.name}</div>
          </div>
        </div>
        <p className="insp-desc">{spec.desc}</p>
        <div className="insp-stats">
          {spec.fov > 0 && spec.fov < 360 && (
            <div>
              <i>Görüş açısı</i>
              <b>{spec.fov}°</b>
            </div>
          )}
          {spec.fov === 360 && (
            <div>
              <i>Kapsam</i>
              <b>360°</b>
            </div>
          )}
          {range > 0 && (
            <div>
              <i>Menzil</i>
              <b>{(range * levelMult(d.level)).toFixed(0)} m</b>
            </div>
          )}
          <div>
            <i>Montaj</i>
            <b>{spec.mountHeight} m</b>
          </div>
          {isCameraLike(d.type) && (
            <div>
              <i>Gece</i>
              <b>{spec.thermal ? 'Tam' : `%${Math.round(spec.nightFactor * 100)}`}</b>
            </div>
          )}
          <div>
            <i>Değer</i>
            <b>{fmt(deviceValue(d.type, d.level))}</b>
          </div>
        </div>
        <div className="insp-actions">
          <button onClick={() => moveDevice(d.id)}>
            <Icon.move size={16} /> Taşı
          </button>
          {spec.rotatable && (
            <button onClick={() => rotateDevice(d.id)}>
              <Icon.rotate size={16} /> Döndür
            </button>
          )}
          <button onClick={() => upgradeDevice(d.id)} disabled={d.level === 2 || up > budget}>
            <Icon.upgrade size={16} /> {d.level === 2 ? 'Maks. seviye' : `Geliştir · ${fmt(up)}`}
          </button>
          <button className="danger" onClick={() => sellDevice(d.id)}>
            <Icon.trash size={16} /> Sat · +{fmt(deviceValue(d.type, d.level))}
          </button>
        </div>
      </div>
    </div>
  );
}

// ───────────── sağ panel (simülasyon) ─────────────
const KIND_LABEL: Record<Incident['kind'], string> = {
  camera: 'Kamera',
  sensor: 'Sensör',
  perimeter: 'Çevre',
  manual: 'Operatör',
  patrol: 'Devriye',
  tech: 'Teknik',
};

function incStatus(i: Incident): { t: string; c: string } {
  if (i.status === 'resolved') return { t: 'Kapatıldı', c: 'done' };
  if (i.kind === 'tech') return { t: i.techFixAt ? 'Onarılıyor' : 'Arıza', c: 'tech' };
  if (!i.verified) return { t: 'Doğrulanmadı', c: 'unv' };
  if (i.status === 'dispatched') return { t: 'Ekip sevkte', c: 'disp' };
  if (i.tracking) return { t: 'İzleniyor', c: 'trk' };
  return { t: 'Görüş kaybı', c: 'lost' };
}

function IncidentPanel() {
  useGame((s) => s.simTick);
  const selId = useGame((s) => s.selectedIncidentId);
  const select = useGame((s) => s.selectIncident);
  const focusOn = useGame((s) => s.focusOn);
  const e = getEngine();
  if (!e) return null;
  const list = [...e.incidents].sort((a, b) => {
    const ar = a.status === 'resolved' ? 1 : 0, br = b.status === 'resolved' ? 1 : 0;
    if (ar !== br) return ar - br;
    if (a.priority !== b.priority) return b.priority - a.priority;
    return b.createdAt - a.createdAt;
  });
  const sel = selId ? e.incident(selId) : null;
  return (
    <div className="panel right-panel sim">
      <div className="panel-head">
        <span>Olaylar · AİM Konsolu</span>
        <span className="count">{e.incidents.filter((i) => i.status !== 'resolved').length} açık</span>
      </div>
      <div className="inc-list">
        {list.length === 0 && <div className="empty">Henüz olay yok. Haritayı gezerek kör noktaları kontrol edin — şüpheli bir karaktere tıklayarak manuel işaretleyebilirsiniz.</div>}
        {list.map((i) => {
          const st = incStatus(i);
          return (
            <div
              key={i.id}
              className={`inc-card p${i.priority} ${i.id === selId ? 'sel' : ''} ${i.status === 'resolved' ? 'res' : ''} ${!i.noticed ? 'new' : ''}`}
              onClick={() => {
                select(i.id);
                focusOn(i.x, i.z);
              }}
            >
              <div className="ic-top">
                <span className="ic-seq">#{i.seq}</span>
                <span className="ic-kind">{KIND_LABEL[i.kind]}</span>
                <span className={`ic-st ${st.c}`}>{st.t}</span>
              </div>
              <div className="ic-title">{i.title}</div>
              <div className="ic-meta">
                {i.sector} · {i.source} · {Math.max(0, Math.round(e.time - i.createdAt))} sn
                {i.playerClass && <span className="ic-cls">{CLASS_LABELS[i.playerClass]}</span>}
              </div>
            </div>
          );
        })}
      </div>
      {sel && <IncidentDetail inc={sel} />}
      <Feed />
    </div>
  );
}

function IncidentDetail({ inc }: { inc: Incident }) {
  const doAction = useGame((s) => s.doAction);
  const e = getEngine()!;
  const resolved = inc.status === 'resolved';
  const has = (types: EquipmentType[], r: (lvl: 1 | 2) => number) => !!e.nearestDevice(types, inc.x, inc.z, (d) => r(d.dev.level));
  const ptzOk = has(['ptzCam'], (l) => EQUIPMENT.ptzCam.range * levelMult(l) * 1.05);
  const spkOk = has(['speaker'], (l) => EQUIPMENT.speaker.range * levelMult(l));
  const sirOk = has(['siren'], (l) => EQUIPMENT.siren.range * levelMult(l));
  const litOk = has(['light'], (l) => EQUIPMENT.light.range * levelMult(l) + 5);
  const freeUnits = e.responders.filter((r) => r.state === 'patrol' || r.state === 'idle' || r.state === 'return').length;
  const classes: ClassLabel[] = ['insan', 'hayvan', 'arac', 'personel', 'yanlis'];
  return (
    <div className="inc-detail">
      <div className="id-head">
        <span className="ic-seq">#{inc.seq}</span>
        <span className="id-title">{inc.title}</span>
      </div>
      <div className="id-desc">{inc.detail}</div>
      {inc.suggestion && !resolved && (
        <div className="vision">
          <span className="v-tag">Desecure AİM</span>
          <span>
            {labelTr(inc.suggestion.label)} · %{Math.round(inc.suggestion.conf * 100)} güven
          </span>
          {!inc.playerClass && (
            <button className="mini" onClick={() => doAction('classify', inc.suggestion!.label)}>
              Onayla
            </button>
          )}
        </div>
      )}
      {inc.truth && (
        <div className="vision report">
          <span className="v-tag blue">Saha raporu</span>
          <span>{CLASS_LABELS[inc.truth]}</span>
        </div>
      )}
      {inc.kind !== 'tech' && (
        <>
          <div className="id-sub">Sınıflandır</div>
          <div className="cls-row">
            {classes.map((c) => (
              <button key={c} className={`cls ${inc.playerClass === c ? 'on' : ''}`} disabled={resolved} onClick={() => doAction('classify', c)}>
                {CLASS_LABELS[c]}
              </button>
            ))}
          </div>
        </>
      )}
      <div className="id-sub">Müdahale</div>
      <div className="act-grid">
        <button onClick={() => doAction('inspect')}>
          <Icon.eye size={16} /> İncele
        </button>
        {inc.kind === 'tech' ? (
          <button disabled={resolved || !!inc.techFixAt} onClick={() => doAction('reset')}>
            <Icon.wrench size={16} /> {inc.techType === 'gate_open' ? 'Uzaktan kilitle' : 'Uzaktan resetle'}
          </button>
        ) : (
          <>
            <button disabled={resolved || !ptzOk} title={ptzOk ? '' : 'Menzilde PTZ yok'} onClick={() => doAction('ptz')}>
              <Icon.ptzCam size={16} /> Kamera yönlendir
            </button>
            <button disabled={resolved || !spkOk} title={spkOk ? '' : 'Menzilde hoparlör yok'} onClick={() => doAction('speaker')}>
              <Icon.speaker size={16} /> Sesli uyar
            </button>
            <button className="warn" disabled={resolved || !sirOk} title={sirOk ? '' : 'Menzilde siren yok'} onClick={() => doAction('siren')}>
              <Icon.siren size={16} /> Alarm ver
            </button>
            {e.level.night && (
              <button disabled={resolved || !litOk} title={litOk ? '' : 'Yakında aydınlatma yok'} onClick={() => doAction('light')}>
                <Icon.bulb size={16} /> Işıkları aç
              </button>
            )}
          </>
        )}
        <button disabled={resolved || freeUnits === 0 || inc.status === 'dispatched'} title={freeUnits ? '' : 'Müsait ekip yok'} onClick={() => doAction('dispatch')}>
          <Icon.patrol size={16} /> Devriye gönder
        </button>
        {inc.kind !== 'tech' && (
          <button className="aim" disabled={resolved || inc.aim} onClick={() => {
              doAction('aim');
              useAim.getState().show(inc.sector, inc.source, getEngine()?.npcs.find((n) => n.id === inc.npcId)?.kind !== 'thief');
            }}>
            <Icon.radio size={16} /> {inc.aim ? 'AİM\'e iletildi' : 'AİM\'e bildir'}
          </button>
        )}
        <button className="close" disabled={resolved} onClick={() => doAction('resolve')}>
          <Icon.check size={16} /> Olayı sonlandır
        </button>
      </div>
    </div>
  );
}

function Feed() {
  useGame((s) => s.simTick);
  const select = useGame((s) => s.selectIncident);
  const e = getEngine();
  if (!e) return null;
  return (
    <div className="feed">
      {e.feed.slice(0, 6).map((f) => (
        <div key={f.id} className={`feed-row ${f.level}`} onClick={() => f.incidentId && select(f.incidentId)}>
          <span className="ft">{clockStr(e.level.clockStart, e.level.clockSpan, f.t, e.duration)}</span>
          <span>{f.text}</span>
        </div>
      ))}
    </div>
  );
}

// ───────────── alt sağ: başlat / kontroller ─────────────
function ActionCorner() {
  const phase = useGame((s) => s.phase);
  const devices = useGame((s) => s.devices);
  const start = useGame((s) => s.startSim);
  const speed = useGame((s) => s.speed);
  const paused = useGame((s) => s.paused);
  const setSpeed = useGame((s) => s.setSpeed);
  const togglePause = useGame((s) => s.togglePause);
  const endSim = useGame((s) => s.endSim);
  const [confirm, setConfirm] = useState(false);
  if (phase === 'planning') {
    const noCam = !devices.some((d) => isCameraLike(d.type));
    return (
      <div className="corner">
        {noCam && <div className="corner-warn">Henüz kamera yok — tüm saha kör nokta</div>}
        <button className="start-btn" onClick={() => start()}>
          <Icon.play size={22} />
          <span>
            SİMÜLASYONU BAŞLAT
            <small>{devices.length} ekipman · plan hazır</small>
          </span>
        </button>
      </div>
    );
  }
  if (phase !== 'sim') return null;
  return (
    <div className="corner sim-ctl">
      <button className={`ctl ${paused ? 'on' : ''}`} onClick={togglePause} title="Duraklat (Boşluk)">
        {paused ? <Icon.play size={18} /> : <Icon.pause size={18} />}
      </button>
      {[1, 2, 4].map((s) => (
        <button key={s} className={`ctl ${!paused && speed === s ? 'on' : ''}`} onClick={() => setSpeed(s)}>
          {s}×
        </button>
      ))}
      {confirm ? (
        <button className="ctl end" onClick={endSim}>
          Emin misin? Bitir
        </button>
      ) : (
        <button className="ctl end" onClick={() => setConfirm(true)}>
          <Icon.stop size={16} /> Bitir
        </button>
      )}
    </div>
  );
}

export function Toasts() {
  const toasts = useGame((s) => s.toasts);
  return (
    <div className="toasts">
      {toasts.map((t) => (
        <div key={t.id} className={`toast ${t.level}`}>
          {t.text}
        </div>
      ))}
    </div>
  );
}

export function ModeBanner() {
  const placing = useGame((s) => s.placing);
  const ptz = useGame((s) => s.ptzAimId);
  const devices = useGame((s) => s.devices);
  const paused = useGame((s) => s.paused);
  const phase = useGame((s) => s.phase);
  let text: string | null = null;
  const fair = useGame((s) => s.fair);
  if (placing && fair) text = `${EQUIPMENT[placing.type].name}: haritada yeşil bir noktaya dokun · Esc iptal`;
  else if (placing) text = placing.stage === 'aim' ? 'Yön seç: fareyi hareket ettir, onaylamak için tıkla · R: 45° · Esc: iptal' : `${EQUIPMENT[placing.type].name}: konum seç — yeşil geçerli, kırmızı geçersiz · R döndür · Esc iptal`;
  else if (ptz) text = `${devices.find((d) => d.id === ptz)?.label}: PTZ hedefi için haritaya tıkla · Esc iptal`;
  else if (phase === 'sim' && paused) text = 'DURAKLATILDI — Boşluk tuşu ile devam et';
  if (!text) return null;
  return <div className="mode-banner">{text}</div>;
}

function HelpOverlay() {
  const show = useGame((s) => s.showHelp);
  const set = useGame((s) => s.setShowHelp);
  const level = useGame((s) => s.level)!;
  if (!show) return null;
  return (
    <div className="help-overlay" onClick={() => set(false)}>
      <div className="help-card" onClick={(e) => e.stopPropagation()}>
        <div className="help-k">Bölüm {level.id} · {level.subtitle}</div>
        <h2>{level.title}</h2>
        <div className="help-steps">
          <div>
            <span>01</span>
            <b>PLANLA</b>
            <p>Risk haritasını incele. Kritik varlıklar, uzak köşeler ve çalılık çit hatları tehdit için caziptir.</p>
          </div>
          <div>
            <span>02</span>
            <b>YERLEŞTİR</b>
            <p>Mağazadan ekipmanı sürükle. Kameraları fareyle yönlendir; binalar ve tepeler görüşü keser. Kırmızı alanlar kör noktadır.</p>
          </div>
          <div>
            <span>03</span>
            <b>SAVUN</b>
            <p>Kör noktadaki hareketi sistem görmez — haritayı gez, yakınlaş, şüpheliye tıkla. Olayı doğrula, sınıflandır ve müdahale et.</p>
          </div>
        </div>
        <div className="help-note">
          <Icon.alert size={16} /> Bakım personelini ve hayvanları tehdit olarak sınıflandırmak veya doğrulanmamış olayda siren çalmak yanlış alarm sayılır.
        </div>
        <button className="start-btn small" onClick={() => set(false)}>
          Planlamaya başla
        </button>
      </div>
    </div>
  );
}

export function GameHUD() {
  const phase = useGame((s) => s.phase);
  return (
    <div className="hud">
      <TopBar />
      <LeftPanel />
      {phase === 'planning' && <Inspector />}
      {phase === 'sim' && <IncidentPanel />}
      {(phase === 'planning' || phase === 'sim') && <EquipmentShop />}
      <ActionCorner />
      <ModeBanner />
      <Toasts />
      <AimPanel side="full" />
      <HelpOverlay />
    </div>
  );
}

export { validatePlacement };

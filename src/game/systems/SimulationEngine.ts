import { EQUIPMENT, isCameraLike, levelMult } from '../config/equipment';
import type { ClassLabel, CriticalAsset, Device, LevelDef, MapData, NpcSub, Vec2 } from '../types';
import { angleDiff, cellAt, cellIndexOf, cellX, fenceWorld, idx, inBounds, isInside, mulberry32, nearestWalkable, sectorName } from '../world/grid';
import type { DeviceRuntime, FalseAlarmRecord, FeedItem, Gendarme, Hint, Incident, IncidentKind, NPC, Responder, Stock, Waypoint } from './entities';
import { neutralized, SUB_NAMES, THIEF_NAMES, type ThiefVariant, truthOf } from './entities';
import { costField, findPath, pathFromField, type NavContext, type NavProfile } from './pathfinding';
import { updateResponder, GUARD_WALK } from './PatrolAI';
import { updateNpc } from './ThreatAI';
import { cameraSees, computeLit, type Env, losClear, motionSees, perimeterCovers } from './vision';
import { cameraSeenCells, computeFenceCovered, fenceRing, sabotageSpot, unwatchedFenceCams } from './coverage';

// SimulationEngine — gerçek zamanlı simülasyon döngüsü.
// Algılama, oyuncu kararları ve NPC hareketleri aynı dünya koordinatlarında çalışır.

interface Scheduled {
  t: number;
  type: 'thief' | 'animal' | 'staff' | 'tech' | 'falseSensor' | 'blackout' | 'duststorm';
  done: boolean;
}

/** Kaçış aracı: çaldığı makarayla sahadan çıkan hırsızı alıp uzaklaşan kamyonet */
export interface Getaway {
  id: string;
  x: number;
  z: number;
  yaw: number;
  speed: number;
  path: Vec2[];
  pi: number;
  state: 'wait' | 'leave' | 'gone';
  loot: number;
  timer: number;
}

type Mover = { x: number; z: number; yaw: number; speed: number; path: Vec2[]; pi: number };

export class SimulationEngine {
  map: MapData;
  level: LevelDef;
  devices: DeviceRuntime[] = [];
  npcs: NPC[] = [];
  responders: Responder[] = [];
  jandarma: Gendarme[] = [];
  /** varlık başına kablo makarası stoğu */
  stock: Stock[] = [];
  endReason: 'time' | 'emptied' | 'quit' | null = null;
  incidents: Incident[] = [];
  feed: FeedItem[] = [];
  hints: Hint[] = [];
  falseAlarms: FalseAlarmRecord[] = [];
  time = 0;
  duration: number;
  ended = false;
  rng: () => number;
  sched: Scheduled[] = [];
  env: Env;
  nav: NavContext;
  openGates = new Set<string>();
  gatePassUntil: Record<string, number> = {};
  version = 0;
  private seq = 0;
  private incSeq = 0;
  private feedSeq = 0;
  private detectAcc = 0;
  hasControl = false;
  aimReports = 0;
  /** Desecure ürünlerinin otomatik yakaladığı şüpheli sayısı */
  autoCatches = 0;
  emergencyUsed = 0;
  /** final: "alarm fırtınası" başlangıcı (sim sn) */
  stormAt: number;
  stormAnnounced = false;
  /** elektrik kesintisi: bu ana kadar sıradan kameralar kör */
  blackoutUntil = 0;
  blackoutCount = 0;
  /** toz fırtınası: bu ana kadar kamera menzili düşük */
  dustUntil = 0;
  dustCount = 0;
  /** kaçış araçları */
  getaways: Getaway[] = [];
  /** kaçırılan makara sayısı (sahadan çıkan) */
  lootLost = 0;
  /** fuar modu: çitte kamera görmeyen bölüm var mı */
  fenceGap = false;
  /** makara çalınma kayıtları (fuar modu açılır pencere için) */
  theftLog: { t: number; x: number; z: number; name: string; take: number; seen: boolean }[] = [];
  /** fuar modu: kimsenin görmediği çit kameraları (sabotaja açık) */
  vulnerable: string[] = [];
  private vulnInit = false;
  sabotageLog: { t: number; label: string; x: number; z: number }[] = [];
  /** fuar modu: hedef makaraya maliyet alanı önbelleği (kapsama değişince yenilenir) */
  private fieldCache = new Map<string, Float32Array>();
  private covVer = 0;
  /** doğan hırsız sayısı (fuar modu: ilk hırsız sabotajcı olmaz) */
  thiefSpawns = 0;
  /** fuar modu: hırsızların geldiği yön sırası (karıştırılmış N/E/S/W) */
  private sideOrder: string[] = [];
  /** fuar modu: görev boyunca ulaşılan en yüksek çit kapsaması (sabotaj düşürmez) */
  fenceBestPct = 0;
  /** taktik müdahale sayaçları */
  tacticsUsed = { siren: 0, backup: 0, light: 0 };
  actionsLog: { t: number; action: string; incidentId: string }[] = [];

  constructor(map: MapData, level: LevelDef, devices: Device[], seed = Date.now()) {
    this.map = map;
    this.level = level;
    this.duration = level.duration;
    this.stormAt = level.demo ? 1e9 : level.duration - 45;
    this.rng = mulberry32(seed);
    this.env = { night: level.night, weather: level.weather, lit: computeLit(map, devices), boosts: [], time: 0 };
    this.nav = { map, dynBlocked: new Uint8Array(map.N * map.N), openGates: this.openGates };
    for (const d of devices) this.addDevice(d, false);
    if (level.expo) this.computeFenceCoverage();
    this.generateSchedule();
    this.initStock();
    this.feedPush(`Simülasyon başladı — ${map.name}. ${level.night ? 'Gece vardiyası.' : 'Gündüz vardiyası.'}`, 'info');
    if (!devices.some((d) => isCameraLike(d.type))) this.feedPush('Uyarı: Sahada aktif kamera yok. Tüm alan kör nokta!', 'warn');
  }

  /** fuar modu: hangi çit hücreleri kamera kapsamasında? Hırsız/hayvan kapsama dışındaki bölümden girer */
  private computeFenceCoverage() {
    const cov = computeFenceCovered(
      this.map,
      this.env,
      this.devices.filter((d) => !d.disabled).map((d) => d.dev)
    );
    this.nav.fenceCovered = cov;
    this.covVer++;
    this.fieldCache.clear();
    this.fenceGap = false;
    for (let c = 0; c < cov.length; c++) if ((this.map.nav[c] === 2 || this.map.nav[c] === 3) && !cov[c]) {
      this.fenceGap = true;
      break;
    }
    this.fenceBestPct = Math.max(this.fenceBestPct, this.fenceCoverPct());
    // akıllı hırsız: kameraların gördüğü alanlardan kaçınarak ilerler (demo hariç)
    this.nav.camSeen = this.level.demo
      ? undefined
      : cameraSeenCells(
          this.map,
          this.env,
          this.devices.filter((d) => !d.disabled).map((d) => d.dev)
        );
    // birbirini görmeyen çit kameraları: akıllı hırsız bunları sabote eder.
    // Liste savunma başında oyuncunun kurulumuna göre bir kez çıkarılır; başlangıçta başka bir kameranın
    // gördüğü kamera sonradan (izleyeni düşse bile) sabote edilmez.
    if (!this.vulnInit) {
      this.vulnInit = true;
      this.vulnerable = this.level.demo
        ? []
        : unwatchedFenceCams(
            this.map,
            this.env,
            this.devices.filter((d) => !d.disabled).map((d) => d.dev),
            cov
          ).map((d) => d.id);
    } else this.vulnerable = this.vulnerable.filter((id) => !this.runtime(id)?.disabled);
  }
  /** fuar modu: kör noktadan yaklaşıp kimsenin görmediği kamerayı sabote edecek hırsız */
  private spawnSaboteur(): boolean {
    const id = this.vulnerable[Math.floor(this.rng() * this.vulnerable.length)];
    const D = this.runtime(id);
    if (!D || D.disabled) return false;
    const s = sabotageSpot(this.map, D.dev);
    const spot = nearestWalkable(this.map, s.x, s.z, false);
    // kameraya en yakın doğum noktalarından biri
    const near = [...this.map.spawns].sort((a, b) => Math.hypot(a.x - s.x, a.z - s.z) - Math.hypot(b.x - s.x, b.z - s.z)).slice(0, 3);
    const sp = near[Math.floor(this.rng() * near.length)];
    if (!sp) return false;
    const n = this.newNpc('thief', 'thief', sp.x, sp.z, 1.9 + this.rng() * 0.3);
    n.variant = 'sneak';
    n.name = 'Sabotajcı hırsız';
    n.target = this.pickTarget(s.x, s.z);
    n.hasFlashlight = false;
    n.detectability = 0.8;
    n.sabotageId = id;
    n.baseSpeed *= this.level.thiefSpeedMult ?? 1;
    n.speed = n.baseSpeed;
    const p = this.path(n, spot, 'intruder');
    if (!p) return false;
    n.path = p;
    this.npcs.push(n);
    return true;
  }
  /**
   * fuar modu: akıllı hırsız önce hedef makarayı seçer (kamerasız olan önce), sonra o makaraya
   * en ucuz yoldan (çit boşluğu / kör nokta) ulaşabileceği doğum noktasından gelir.
   * Böylece çit dışında uzun süre dolaşmaz; savunma başlar başlamaz çite varır.
   */
  private expoEntry(): { sp: MapData['spawns'][number]; target: CriticalAsset; field: Float32Array } | null {
    const withStock = this.map.assets.filter((a) => (this.stockOf(a.id)?.cur ?? 0) > 0);
    const pool = withStock.length ? withStock : this.map.assets;
    if (!pool.length || !this.map.spawns.length) return null;
    const seen = this.nav.camSeen;
    const N = this.map.N;
    const watched = (a: CriticalAsset) => {
      if (!seen) return false;
      const i = Math.floor(a.ax + N / 2), j = Math.floor(a.az + N / 2);
      return i >= 0 && j >= 0 && i < N && j < N && seen[j * N + i] === 1;
    };
    // yön sırası: hırsızlar tesisin dört yanından sırayla gelir (tek noktadan yığılmasın)
    if (!this.sideOrder.length) {
      const sides = [...new Set(this.map.spawns.map((s) => s.side))];
      for (let i = sides.length - 1; i > 0; i--) {
        const j = Math.floor(this.rng() * (i + 1));
        [sides[i], sides[j]] = [sides[j], sides[i]];
      }
      this.sideOrder = sides;
    }
    const side = this.sideOrder[Math.max(0, this.thiefSpawns - 1) % this.sideOrder.length];
    const sideSpawns = this.map.spawns.filter((s) => s.side === side);
    const cx = sideSpawns.reduce((a, s) => a + s.x, 0) / Math.max(1, sideSpawns.length);
    const cz = sideSpawns.reduce((a, s) => a + s.z, 0) / Math.max(1, sideSpawns.length);
    // hedef: o yöne yakın makara; kamerasız makara 3 kat çekici ama tek hedef olmaz (her hırsız aynı noktadan girmesin)
    const target = this.pickWeighted(pool, (a) => ((1 + (this.stockOf(a.id)?.cur ?? 0)) * (watched(a) ? 1 : 3)) / (1 + Math.hypot(a.ax - cx, a.az - cz) / 12));
    const key = `${target.id}:${this.covVer}`;
    let field = this.fieldCache.get(key);
    if (!field) {
      field = costField(this.nav, { x: target.ax, z: target.az }, 'intruder');
      this.fieldCache.set(key, field);
    }
    const bt = this.map.boat;
    const scored = this.map.spawns
      .map((s) => {
        // tekne: maliyet karaya çıktığı noktadan (baraj eteği) + tekne yolu payı
        const c = s.boat && bt ? cellAt(this.map, s.x, bt.footZ) : cellAt(this.map, s.x, s.z);
        return { s, cost: c >= 0 ? field![c] + (s.boat ? 18 : 0) : Infinity };
      })
      .filter((x) => Number.isFinite(x.cost))
      .sort((a, b) => a.cost - b.cost);
    if (!scored.length) return null;
    // seçilen yöndeki en ucuz yaklaşmalar: hırsızlar her zaman dört yandan gelir; çitte boşluk varsa
    // kendi yönünden gelip çit boyunca dolanarak boşluğa gider (maliyet alanı boşluğu bulur)
    let list = scored.filter((x) => x.s.side === side);
    if (!list.length) list = scored;
    // en ucuza yakın (≈25 m dolaşma payı) noktalardan rastgele biri: aynı yönden gelenler de çitin farklı yerlerinden girsin
    const best = list[0].cost;
    const top = list.filter((x) => x.cost <= best + 25).slice(0, 8);
    const pick = top[Math.floor(this.rng() * top.length)] ?? scored[0];
    return { sp: pick.s, target, field };
  }
  /** hırsız kamerayı devre dışı bırakır; açılan çit bölümünden hedefe yürür */
  sabotage(n: NPC) {
    const D = n.sabotageId ? this.runtime(n.sabotageId) : null;
    n.sabotageId = null;
    if (D && !D.disabled) {
      D.disabled = true;
      D.sabotaged = true;
      this.sabotageLog.push({ t: this.time, label: D.dev.label, x: D.dev.x, z: D.dev.z });
      this.feedPush(`${D.dev.label}: Görüntü kesildi — kamera sabote edildi!`, 'alert');
      this.computeFenceCoverage();
      this.version++;
    }
    const tg = n.target ?? this.pickTarget(n.x, n.z);
    n.target = tg;
    const p = this.path(n, { x: tg.ax, z: tg.az }, 'intruder');
    if (p) {
      n.path = p;
      n.pi = 0;
      n.state = 'approach';
    } else this.startEscape(n, false);
  }
  /** çit hattı kapsama yüzdesi (fuar modu sonuç ekranı) */
  fenceCoverPct(): number {
    const fc = this.nav.fenceCovered;
    if (!fc) return 0;
    let n = 0, t = 0;
    for (let c = 0; c < fc.length; c++) {
      if (this.map.nav[c] !== 2 && this.map.nav[c] !== 3) continue;
      t++;
      n += fc[c];
    }
    return t ? Math.round((100 * n) / t) : 0;
  }
  /** kamera görmeyen ayrı çit bölümü (boşluk) sayısı — çevre boyunca sıralı tarama */
  fenceGapCount(): number {
    const fc = this.nav.fenceCovered;
    if (!fc) return 0;
    const ring = fenceRing(this.map);
    let gaps = 0;
    for (let k = 0; k < ring.length; k++) {
      const cur = !fc[ring[k]], prev = !fc[ring[(k - 1 + ring.length) % ring.length]];
      if (cur && !prev) gaps++;
    }
    if (!gaps && ring.length && !fc[ring[0]]) gaps = 1; // tamamen açık
    return gaps;
  }
  /** fuar modu doğum ağırlığı: çitte boşluk varsa hırsız/hayvan yalnızca boşluğa yakın noktadan gelir */
  private spawnBias(x: number, z: number) {
    const fc = this.nav.fenceCovered;
    if (!fc || !this.fenceGap) return 1;
    const L = fenceWorld(this.map);
    let fx = Math.max(-L, Math.min(L, x)), fz = Math.max(-L, Math.min(L, z));
    if (Math.abs(x) > Math.abs(z)) fx = Math.sign(x) * L;
    else fz = Math.sign(z) * L;
    const c = cellAt(this.map, fx, fz);
    if (c < 0) return 0.002;
    let open = 0;
    const N = this.map.N, i = c % N, j = Math.floor(c / N);
    for (let d = -3; d <= 3; d++) {
      for (const [ii, jj] of [[i + d, j], [i, j + d]]) {
        if (ii < 0 || jj < 0 || ii >= N || jj >= N) continue;
        const cc = jj * N + ii;
        if (this.map.nav[cc] !== 2 && this.map.nav[cc] !== 3) continue;
        if (!fc[cc]) open++;
      }
    }
    return open > 0 ? 4 + open : 0.002;
  }

  // ───────────── kurulum ─────────────
  addDevice(d: Device, emergency: boolean) {
    const rt: DeviceRuntime = {
      dev: d,
      yaw: d.yaw,
      disabled: false,
      ptzMode: 'sweep',
      ptzTarget: null,
      sweepPhase: this.rng() * Math.PI * 2,
      cooldownUntil: 0,
      activeUntil: 0,
      faulty: false,
      nextFaultAt: 0,
    };
    this.devices.push(rt);
    if (d.type === 'control') this.hasControl = true;
    const fp = EQUIPMENT[d.type].footprint;
    if (fp > 1) {
      for (let j = d.j; j < d.j + fp; j++) for (let i = d.i; i < d.i + fp; i++) if (inBounds(this.map, i, j)) this.nav.dynBlocked[idx(this.map, i, j)] = 1;
    }
    if (d.type === 'light') this.env.lit = computeLit(this.map, this.devices.map((r) => r.dev));
    if (d.type === 'patrol' || d.type === 'vehicle') this.addResponder(d);
    if (emergency) {
      this.emergencyUsed++;
      this.feedPush(`Acil yerleştirme: ${d.label} devreye alındı.`, 'info');
      if (this.nav.fenceCovered && isCameraLike(d.type)) this.computeFenceCoverage();
    }
    this.version++;
  }

  private addResponder(d: Device) {
    const kind = d.type === 'vehicle' ? 'vehicle' : 'guard';
    const homeP = nearestWalkable(this.map, d.x + (kind === 'vehicle' ? 0 : 1), d.z + 1, true);
    const r: Responder = {
      id: `R${++this.seq}`,
      deviceId: d.id,
      kind,
      label: d.label,
      x: homeP.x,
      z: homeP.z,
      yaw: 0,
      home: homeP,
      route: [],
      ri: 0,
      path: [],
      pi: 0,
      state: kind === 'guard' ? 'patrol' : 'idle',
      timer: 0,
      incidentId: null,
      targetNpc: null,
      departAt: 0,
      replanAt: 0,
      walking: false,
      speed: GUARD_WALK,
    };
    if (kind === 'guard') {
      const R = 9;
      const lim = fenceWorld(this.map) - 1.5;
      const corners = [
        [d.x - R, d.z - R],
        [d.x + R, d.z - R],
        [d.x + R, d.z + R],
        [d.x - R, d.z + R],
      ].map(([x, z]) => nearestWalkable(this.map, Math.max(-lim, Math.min(lim, x)), Math.max(-lim, Math.min(lim, z)), true));
      r.route = corners;
    }
    this.responders.push(r);
  }

  private generateSchedule() {
    const L = this.level;
    const D = this.duration;
    const add = (type: Scheduled['type'], n: number, from: number, to: number, spread: boolean) => {
      for (let k = 0; k < n; k++) {
        const t = spread ? from + ((to - from) * (k + 0.5)) / n + (this.rng() - 0.5) * ((to - from) / n) * 0.8 : from + this.rng() * (to - from);
        // son 5 saniyede kimse gelmesin; onun dışında süre sonuna kadar olay akışı sürsün
        this.sched.push({ t: Math.min(t, D - 6), type, done: false });
      }
    };
    if (L.expo && !L.demo) {
      // fuar modu: ilk hırsız savunma başlar başlamaz gelir, sonrakiler düzenli aralıkla (bekleme yok)
      const n = Math.max(1, L.thieves);
      for (let k = 0; k < n; k++) {
        const gap = (D - 18) / Math.max(1, n - 1);
        const t = k === 0 ? 2 + this.rng() * 1.5 : 3 + gap * k + (this.rng() - 0.5) * Math.min(5, gap * 0.8);
        this.sched.push({ t: Math.min(t, D - 10), type: 'thief', done: false });
      }
    } else add('thief', L.thieves, 10, D - 10, true);
    add('animal', L.animals, 6, D - 8, true);
    add('staff', L.staff, 4, D - 20, true);
    add('tech', L.tech, 25, D - 30, false);
    add('falseSensor', L.falseSensor, 15, D - 14, false);
    // son 25 saniyede hiç olay yoksa: bir son dakika hırsızı garanti et (final gerilimi)
    const lastT = this.sched.reduce((m, x) => Math.max(m, x.t), 0);
    if (!L.expo && L.thieves > 0 && lastT < D - 25) this.sched.push({ t: D - 20 + this.rng() * 8, type: 'thief', done: false });
    // alarm fırtınası: son 30 sn (gerçek) iki olay üst üste
    if (L.storm && L.thieves > 0) {
      this.sched.push({ t: this.stormAt + 1.5, type: 'thief', done: false });
      this.sched.push({ t: this.stormAt + 7 + this.rng() * 4, type: this.rng() < 0.5 ? 'animal' : 'thief', done: false });
    }
    // elektrik kesintisi (gece): görevin ortasında bir kez, 10 sn kameralar kör
    if (L.blackout) this.sched.push({ t: D * (0.35 + this.rng() * 0.3), type: 'blackout', done: false });
    // toz fırtınası (gündüz): görevin ortasında bir kez, 14 sn kamera menzili yarıya iner
    if (L.duststorm) this.sched.push({ t: D * (0.35 + this.rng() * 0.3), type: 'duststorm', done: false });
    this.sched.sort((a, b) => a.t - b.t);
  }

  // ───────────── ana döngü ─────────────
  update(dt: number) {
    if (this.ended) return;
    this.time += dt;
    this.env.time = this.time;

    if (this.level.demo) this.demoSchedule();
    else
      for (const s of this.sched) {
        if (!s.done && s.t <= this.time) {
          s.done = true;
          this.spawn(s.type);
        }
      }
    this.updateDevices(dt);
    for (const n of this.npcs) updateNpc(this, n, dt);
    for (const r of this.responders) updateResponder(this, r, dt);
    for (const j of this.jandarma) this.updateJandarma(j, dt);
    for (const g of this.getaways) this.updateGetaway(g, dt);
    if (!this.stormAnnounced && this.time >= this.stormAt) {
      this.stormAnnounced = true;
      this.feedPush('ALARM FIRTINASI: Son 30 saniye — hırsızlar son bir hamle yapıyor!', 'alert');
      this.version++;
    }
    if (this.blackoutUntil && this.time >= this.blackoutUntil) {
      this.blackoutUntil = 0;
      this.feedPush('Elektrik geri geldi — kameralar yeniden çevrim içi.', 'ok');
      this.version++;
    }
    if (this.dustUntil && this.time >= this.dustUntil) {
      this.dustUntil = 0;
      this.env.dust = 1;
      this.feedPush('Toz fırtınası dindi — kamera menzilleri normale döndü.', 'ok');
      this.version++;
    }
    this.detectAcc += dt;
    while (this.detectAcc >= 0.1) {
      this.detectAcc -= 0.1;
      this.detectionPass(0.1);
    }
    // fuar modu: sahadan ayrılan / gözaltına alınan şüphelinin olayı kapanır (harita işaretleri birikmesin)
    if (this.level.expo) {
      for (const inc of this.incidents) {
        if (inc.status === 'resolved' || !inc.npcId) continue;
        const n = this.npcs.find((m) => m.id === inc.npcId);
        if (n && !n.active) {
          inc.status = 'resolved';
          inc.resolvedAt = this.time;
        }
      }
    }
    this.updateHints();
    this.updateTech();
    this.env.boosts = this.env.boosts.filter((b) => b.until > this.time);
    this.hints = this.hints.filter((h) => h.until > this.time);

    if (this.stockMax() > 0 && this.stockRemaining() + this.stockCarried() <= 0) {
      // bütün malzeme sahadan götürüldü
      this.endReason = 'emptied';
      this.feedPush('Tesisteki bütün kablo makaraları çalındı!', 'alert');
      this.end();
    }
    if (this.time >= this.duration) this.end();
    this.version++;
  }

  end(reason?: 'time' | 'emptied' | 'quit') {
    if (this.ended) return;
    this.ended = true;
    this.endReason = reason ?? this.endReason ?? 'time';
    for (const n of this.npcs) {
      if (n.outcome) continue;
      if (n.kind === 'thief' && n.active && (n.jandarmaId || n.state === 'held')) {
        // jandarma yolda / şüpheli kıstırıldı: gözaltı kesin, malzeme kurtarılır
        n.outcome = 'caught';
        this.returnLoot(n);
        n.outcomeAt = this.time;
        continue;
      }
      if (n.kind === 'thief') {
        if (n.stolen) n.outcome = 'breach';
        else if (n.entered && n.active) n.outcome = 'unresolved';
        else n.outcome = null;
      } else if (n.kind === 'animal') {
        n.outcome = n.entered && n.active ? 'ignored' : n.outcome ?? 'left';
      } else n.outcome = 'ok';
      n.outcomeAt = this.time;
    }
  }

  private updateDevices(dt: number) {
    for (const d of this.devices) {
      if (d.dev.type !== 'ptzCam' || d.disabled) continue;
      if (d.ptzMode === 'lock' && d.ptzTarget) {
        const want = Math.atan2(d.ptzTarget.z - d.dev.z, d.ptzTarget.x - d.dev.x);
        const diff = angleDiff(want, d.yaw);
        const step = 1.6 * dt;
        d.yaw += Math.abs(diff) < step ? diff : Math.sign(diff) * step;
      } else {
        d.sweepPhase += dt * 0.32;
        const want = d.dev.yaw + Math.sin(d.sweepPhase) * ((55 * Math.PI) / 180);
        const diff = angleDiff(want, d.yaw);
        d.yaw += diff * Math.min(1, dt * 3);
      }
    }
  }

  // ───────────── algılama ─────────────
  private detectionPass(dt: number) {
    const map = this.map;
    const blackout = this.isBlackout();
    const cams = this.devices.filter((d) => !d.disabled && isCameraLike(d.dev.type) && (!blackout || this.poweredInBlackout(d.dev.type)));
    const motions = this.devices.filter((d) => !d.disabled && d.dev.type === 'motion');
    const autos = this.devices.filter((d) => !d.disabled && (EQUIPMENT[d.dev.type].autoRate || (this.level.demo && isCameraLike(d.dev.type))));
    for (const n of this.npcs) {
      if (!n.active) continue;
      const th = n.kind === 'animal' ? (n.sub === 'sheep' || n.sub === 'boar' ? 0.55 : 0.5) : n.crouch ? 0.6 : 1.0;
      if (autos.length && n.kind !== 'staff' && !neutralized(n)) this.autoPass(n, autos, th, dt);
      let best = 0;
      let bestDev: DeviceRuntime | null = null;
      for (const d of cams) {
        const spec = EQUIPMENT[d.dev.type];
        const yaw = d.dev.type === 'ptzCam' ? d.yaw : d.dev.yaw;
        const res = cameraSees(map, this.env, d.dev, yaw, spec.fov, n.x, n.z, th);
        if (!res.seen) continue;
        let rate = spec.detectRate * levelMult(d.dev.level) * (1 - 0.45 * (res.dist / Math.max(1, res.range)));
        if (this.level.night && spec.thermal) rate *= 1.25;
        rate *= n.detectability;
        // fuar modu: AİM görüntü analizi — kameraya giren hedef hızla tanınır
        if (this.level.expo) rate *= 3;
        if (rate > best) {
          best = rate;
          bestDev = d;
        }
      }
      // devriye gözü
      let guardSaw: Responder | null = null;
      for (const r of this.responders) {
        const vis = r.kind === 'vehicle' ? 7 : 8;
        const effVis = this.level.night ? vis * 0.75 : vis;
        if (Math.hypot(n.x - r.x, n.z - r.z) > effVis) continue;
        if (!losClear(map, r.x, map.heightAt(r.x, r.z) + 1.7, r.z, n.x, map.heightAt(n.x, n.z) + th, n.z, false)) continue;
        guardSaw = r;
        if (1.6 > best) best = 1.6;
      }

      if (best > 0) {
        n.detectProg = Math.min(1.5, n.detectProg + best * dt);
        n.sysSeenAt = this.time;
      } else {
        n.detectProg = Math.max(0, n.detectProg - 0.04 * dt * 10);
      }

      if (n.detectProg >= 1 && best > 0) {
        if (bestDev) this.onCameraDetect(n, bestDev);
        else if (guardSaw) this.onGuardDetect(n, guardSaw);
      }
      if (guardSaw && n.kind === 'thief') this.thiefSeesGuard(n, guardSaw);

      // olay takibi
      const inc = n.incidentId ? this.incident(n.incidentId) : null;
      if (inc && inc.status !== 'resolved') {
        const sysSeen = best > 0 && n.detectProg >= 1;
        const manual = n.manualAt !== null && this.time - n.manualAt < 14;
        if (sysSeen || manual) {
          inc.x = n.x;
          inc.z = n.z;
          inc.tracking = true;
          inc.lastSeenAt = this.time;
          inc.radius = 1.2;
          inc.sector = sectorName(n.x, n.z);
        } else inc.tracking = false;
      }

      // hareket sensörleri
      for (const d of motions) {
        if (d.cooldownUntil > this.time) continue;
        if (motionSees(map, d.dev, n.x, n.z, Math.min(th, 0.7))) this.sensorTrigger(d, n);
      }
    }
  }

  private onCameraDetect(n: NPC, d: DeviceRuntime) {
    if (n.firstDetectAt === null) {
      n.firstDetectAt = this.time;
      n.detectedBy = d.dev.label;
    }
    const inc = n.incidentId ? this.incident(n.incidentId) : null;
    if (inc && inc.status === 'resolved') return; // operatör kapattı — aynı hedef için yeniden alarm üretme
    const suggestion = inc && inc.suggestion ? inc.suggestion : this.visionSuggest(n.kind, n.variant);
    if (inc) {
      if (!inc.verified || inc.kind === 'sensor' || inc.kind === 'perimeter') {
        inc.verified = true;
        inc.kind = 'camera';
        inc.source = d.dev.label;
        inc.title = this.hasControl ? `AİM doğrulaması: ${suggestion ? labelTr(suggestion.label) : 'Hareket'}` : 'Kamera doğrulaması: Tanımlanamayan hareket';
        inc.suggestion = inc.suggestion ?? suggestion;
        inc.detail = `${d.dev.label} hedefi görüntüledi.`;
        this.feedPush(`${d.dev.label}: Olay #${inc.seq} kamera ile doğrulandı.`, 'warn', inc.id);
      }
      return;
    }
    const newInc = this.createIncident({
      kind: 'camera',
      title: this.hasControl && suggestion ? `AİM: ${labelTr(suggestion.label)} tespit edildi` : 'Kamera tespiti: Tanımlanamayan hareket',
      detail: `${d.dev.label} görüş alanında hareket algılandı.`,
      x: n.x,
      z: n.z,
      radius: 1.2,
      npcId: n.id,
      source: d.dev.label,
      verified: true,
      tracking: true,
      suggestion,
    });
    n.incidentId = newInc.id;
    this.feedPush(`${d.dev.label}: ${newInc.sector} sektöründe hareket tespiti (#${newInc.seq}).`, 'alert', newInc.id);
  }

  private onGuardDetect(n: NPC, r: Responder) {
    if (n.firstDetectAt === null) {
      n.firstDetectAt = this.time;
      n.detectedBy = r.label;
    }
    if (n.kind === 'staff') return; // devriye personeli tanır
    let inc = n.incidentId ? this.incident(n.incidentId) : null;
    if (inc && inc.status === 'resolved') {
      // kapatılmış olay: devriye yine de hırsızı kovalar
      if (n.kind === 'thief' && !neutralized(n) && (r.state === 'patrol' || r.state === 'return')) {
        r.state = 'chase';
        r.targetNpc = n.id;
        r.replanAt = 0;
      }
      return;
    }
    if (!inc) {
      inc = this.createIncident({
        kind: 'patrol',
        title: n.kind === 'thief' ? 'Devriye: İzinsiz kişi görüldü' : `Devriye: ${n.name} görüldü`,
        detail: `${r.label} rotasında tespit.`,
        x: n.x,
        z: n.z,
        radius: 1.2,
        npcId: n.id,
        source: r.label,
        verified: true,
        tracking: true,
        suggestion: null,
      });
      inc.truth = truthOf(n.kind);
      n.incidentId = inc.id;
      this.feedPush(`${r.label}: ${inc.sector} sektöründe ${n.kind === 'thief' ? 'şüpheli' : n.name.toLowerCase()} görüldü.`, 'alert', inc.id);
    }
    if (n.kind === 'thief' && !neutralized(n) && (r.state === 'patrol' || r.state === 'return' || r.state === 'dispatch' || r.state === 'investigate')) {
      r.state = 'chase';
      r.targetNpc = n.id;
      r.incidentId = inc.id;
      r.replanAt = 0;
    }
  }

  private thiefSeesGuard(n: NPC, r: Responder) {
    if (this.level.demo) return; // demo: hırsız kaçmaz, Desecure ürünleri yakalar (izleyici tam akışı görsün)
    if (n.fleeing || neutralized(n) || n.alertCooldown > this.time) return;
    if (Math.hypot(n.x - r.x, n.z - r.z) > 9) return;
    n.alertCooldown = this.time + 6;
    if (this.rng() < 0.6) this.startEscape(n, true);
    else if (n.state !== 'cutting') {
      n.resumeState = n.state;
      n.state = 'hide';
      n.timer = 3 + this.rng() * 3;
    }
  }

  private sensorTrigger(d: DeviceRuntime, n: NPC | null) {
    d.cooldownUntil = this.time + 12;
    const existing = n?.incidentId ? this.incident(n.incidentId) : null;
    if (existing && existing.status === 'resolved') return;
    if (existing) {
      if (!existing.tracking) {
        existing.x = d.dev.x;
        existing.z = d.dev.z;
        existing.radius = 6;
        existing.detail = `${d.dev.label} yeniden tetiklendi.`;
      }
      return;
    }
    const jx = (this.rng() - 0.5) * 3, jz = (this.rng() - 0.5) * 3;
    const inc = this.createIncident({
      kind: 'sensor',
      title: 'Doğrulanmamış hareket bildirimi',
      detail: `${d.dev.label} hareket algıladı. Tür bilinmiyor — kamera veya devriye ile doğrulayın.`,
      x: d.dev.x + jx,
      z: d.dev.z + jz,
      radius: 7,
      npcId: n?.id ?? null,
      source: d.dev.label,
      verified: false,
      tracking: false,
      suggestion: null,
    });
    if (n) n.incidentId = inc.id;
    this.feedPush(`${d.dev.label}: Doğrulanmamış hareket (#${inc.seq}) — ${inc.sector}.`, 'warn', inc.id);
  }

  onFenceCross(n: NPC, cell: number) {
    const x = cellX(this.map, cell % this.map.N);
    const z = cellX(this.map, Math.floor(cell / this.map.N));
    if (n.kind === 'staff') return;
    if (!n.entered && n.entryCell < 0) n.entryCell = cell; // giriş deliği: kaçarken buradan çıkar
    if (this.nav.fenceCovered && !n.entered && !this.nav.fenceCovered[cell]) n.viaGap = true;
    for (const d of this.devices) {
      if (d.disabled || d.dev.type !== 'perimeter') continue;
      if (!perimeterCovers(this.map, d.dev, x, z)) continue;
      if (d.cooldownUntil > this.time) continue;
      d.cooldownUntil = this.time + 8;
      const existing = n.incidentId ? this.incident(n.incidentId) : null;
      if (existing && existing.status === 'resolved') continue;
      if (existing) {
        existing.detail = `${d.dev.label}: çit hattında yeni ihlal sinyali.`;
        if (!existing.tracking) {
          existing.x = x;
          existing.z = z;
          existing.radius = 4;
        }
        this.feedPush(`${d.dev.label}: Çit hattında titreşim (#${existing.seq}).`, 'warn', existing.id);
        continue;
      }
      const inc = this.createIncident({
        kind: 'perimeter',
        title: 'Çevre ihlali sinyali',
        detail: `${d.dev.label} çit hattında kesme / tırmanma titreşimi algıladı. Tür bilinmiyor.`,
        x: x + (this.rng() - 0.5) * 3,
        z: z + (this.rng() - 0.5) * 3,
        radius: 4.5,
        npcId: n.id,
        source: d.dev.label,
        verified: false,
        tracking: false,
        suggestion: null,
      });
      n.incidentId = inc.id;
      this.feedPush(`${d.dev.label}: Çevre ihlali (#${inc.seq}) — ${inc.sector} çit hattı.`, 'alert', inc.id);
    }
  }

  visionSuggest(kind: NPC['kind'], variant: NPC['variant'] = null): { label: ClassLabel; conf: number } | null {
    if (!this.hasControl) return null;
    // post giymiş / sürünen hırsız yapay zekâyı da kandırabilir
    if ((variant === 'pelt' || variant === 'crawler') && this.rng() < 0.5) return { label: 'hayvan', conf: 0.55 + this.rng() * 0.15 };
    // ağaç kılığı: yapay zekâ tereddüt eder (düşük güven)
    if (variant === 'tree') return { label: this.rng() < 0.35 ? 'hayvan' : 'insan', conf: 0.5 + this.rng() * 0.15 };
    const truth = truthOf(kind);
    const wrongP = this.level.night ? 0.16 : 0.08;
    if (this.rng() < wrongP) {
      const alts: ClassLabel[] = (['insan', 'hayvan', 'personel'] as ClassLabel[]).filter((l) => l !== truth);
      return { label: alts[Math.floor(this.rng() * alts.length)], conf: 0.55 + this.rng() * 0.2 };
    }
    return { label: truth, conf: 0.78 + this.rng() * 0.2 };
  }

  // ───────────── doğum / senaryo ─────────────
  /** Demo: olaylar tek tek, sırayla (hırsız → hayvan → personel → hırsız …); bir öncekisi sonuçlanınca sonraki gelir */
  private demoQueue: Scheduled['type'][] = ['thief', 'animal', 'thief', 'staff', 'thief', 'animal', 'thief', 'staff', 'thief'];
  private demoNextAt = 1.5;
  private demoSchedule() {
    if (this.time < this.demoNextAt || !this.demoQueue.length) return;
    // sahada hâlâ aktif (yakalanmamış / gitmemiş) bir figür varsa bekle
    // meşgul: sahada hâlâ "çözülmemiş" figür var mı? (jandarmaya teslim / kaçıyor / geri dönüyor = çözülmüş)
    const busy = this.npcs.some((n) => {
      if (!n.active) return false;
      if (n.kind === 'thief') return n.state !== 'arrested' && n.state !== 'held' && !n.jandarmaId;
      if (n.kind === 'animal') return n.state !== 'flee';
      return n.state !== 'return';
    });
    if (busy) return;
    // sona yakın yeni olay açma: hırsızın yakalanması için en az 14 sn, diğerleri için 8 sn gerekir
    const nextType = this.demoQueue[0];
    if (this.duration - this.time < (nextType === 'thief' ? 14 : 8)) return;
    const type = this.demoQueue.shift()!;
    this.spawn(type);
    // her olay en az 7 sn sahnede kalsın (izleyici görsün), personel/hayvan için biraz daha kısa
    this.demoNextAt = this.time + (type === 'thief' ? 7 : 5);
    for (const n of this.npcs) if (n.kind === 'staff' && this.level.demo) n.baseSpeed = n.speed = n.baseSpeed * 1.4;
  }

  private spawn(type: Scheduled['type']) {
    if (type === 'thief') this.spawnThief();
    else if (type === 'animal') this.spawnAnimal();
    else if (type === 'staff') this.spawnStaff();
    else if (type === 'tech') this.spawnTech();
    else if (type === 'blackout') this.startBlackout();
    else if (type === 'duststorm') this.startDustStorm();
    else this.spawnFalseSensor();
  }

  /** toz fırtınası: 14 sn boyunca optik kameraların menzili yarıya iner (termal, drone ve Desecure ürünleri %75) */
  startDustStorm() {
    if (this.dustUntil > this.time) return;
    this.dustUntil = this.time + 14;
    this.dustCount++;
    this.env.dust = 0.5;
    this.feedPush('TOZ FIRTINASI! Görüş düştü — optik kameraların menzili yarıya indi, 14 sn.', 'alert');
    this.version++;
  }
  isDust() {
    return this.dustUntil > this.time;
  }

  /** elektrik kesintisi: 10 sn boyunca sıradan kameralar kör (termal ve Desecure ürünleri kendi bataryasıyla çalışır) */
  startBlackout() {
    if (this.blackoutUntil > this.time) return;
    this.blackoutUntil = this.time + 10;
    this.blackoutCount++;
    this.feedPush('ELEKTRİK KESİNTİSİ! Sahadaki kameralar 10 sn kör — Desecure yedek hat devreye giriyor.', 'alert');
    this.version++;
  }
  weatherLabel() {
    return this.level.weather === 'fog' ? 'Sisli' : this.level.weather === 'rain' ? 'Yağmurlu' : '';
  }
  isBlackout() {
    return this.blackoutUntil > this.time;
  }
  /** kesintide çalışmaya devam eden cihazlar: termal, Desecure ürünleri (kendi güç kaynağı), kuleler */
  private poweredInBlackout(type: Device['type']) {
    return type === 'thermalCam' || type === 'tower' || type === 'drone' || !!EQUIPMENT[type].bonus;
  }

  private pickWeighted<T>(items: T[], w: (t: T) => number): T {
    const tot = items.reduce((s, it) => s + w(it), 0);
    let r = this.rng() * tot;
    for (const it of items) {
      r -= w(it);
      if (r <= 0) return it;
    }
    return items[items.length - 1];
  }

  private newNpc(kind: NPC['kind'], sub: NpcSub, x: number, z: number, speed: number): NPC {
    return {
      id: `N${++this.seq}`,
      variant: null,
      stealMult: 1,
      treeT: 0,
      treeMoving: true,
      viaGap: false,
      sabotageId: null,
      boat: false,
      boatX: x,
      wp: [],
      wpAfter: null,
      wpY0: 0,
      wpLen: 0,
      onWater: false,
      yOff: 0,
      originX: x,
      originZ: z,
      entryCell: -1,
      look: Math.floor(this.rng() * 1000),
      kind,
      sub,
      name: SUB_NAMES[sub],
      x,
      z,
      yaw: 0,
      speed,
      baseSpeed: speed,
      path: [],
      pi: 0,
      state: 'approach',
      resumeState: 'approach',
      timer: 0,
      target: null,
      crouch: false,
      detectability: 1,
      active: true,
      gone: false,
      entered: false,
      enteredAt: null,
      spawnedAt: this.time,
      detectProg: 0,
      sysSeenAt: -99,
      firstDetectAt: null,
      detectedBy: null,
      manualAt: null,
      incidentId: null,
      outcome: null,
      outcomeAt: null,
      stolen: false,
      stealProg: 0,
      fleeing: false,
      alertCooldown: 0,
      flashUntil: 0,
      nextHintAt: this.time + 6 + this.rng() * 6,
      lastFenceCell: -1,
      walking: false,
      damage: 0,
      leaderId: null,
      offX: 0,
      offZ: 0,
      falseAlarmed: false,
      lifeLimit: 9999,
      hasFlashlight: false,
      jandarmaId: null,
      loot: 0,
      lootAsset: null,
      autoProg: 0,
    };
  }

  private spawnThief(attempt = 0): void {
    if (attempt > 6) return;
    // fuar modu: çitte boşluk yoksa akıllı hırsız, kimsenin görmediği kamerayı sabote etmeye gider
    // ilk hırsız sabotaj yapmaz: ziyaretçi önce AİM'in sınırda nasıl durdurduğunu görsün
    if (attempt === 0) this.thiefSpawns++;
    if (attempt === 0 && this.thiefSpawns > 1 && this.level.expo && !this.level.demo && !this.fenceGap && this.vulnerable.length && this.spawnSaboteur()) return;
    const smart = this.level.expo && !this.level.demo ? this.expoEntry() : null;
    const sp = smart ? smart.sp : this.pickWeighted(this.map.spawns, (s) => s.weight * (0.6 + this.rng()) * this.spawnBias(s.x, s.z));
    const target = smart ? smart.target : this.pickTarget(sp.x, sp.z);
    // hırsız tipi: farklı hız, görünürlük ve davranış
    const tricky = !!this.level.trickyThieves;
    const variants: [ThiefVariant, number][] = [
      ['cable', tricky ? 1 : 3],
      ['runner', 2],
      ['sneak', tricky ? 2.6 : 2],
      ['pair', tricky ? 1.8 : 1.4],
      ['disguised', tricky ? 2.2 : 1.3],
      ['crawler', tricky ? 2.2 : 1.2],
      ['pelt', tricky ? 2.4 : 1.4],
      ['tree', tricky ? 2.4 : 1.5],
    ];
    const variant = this.pickWeighted(variants, (v) => v[1])[0];
    const count = variant === 'pair' ? 2 : 1;
    for (let k = 0; k < count; k++) {
      const ox = k ? (this.rng() - 0.5) * 3 : 0;
      const oz = k ? (this.rng() - 0.5) * 3 : 0;
      const n = this.newNpc('thief', 'thief', sp.x + ox, sp.z + oz, 1.9 + this.rng() * 0.4);
      n.variant = variant;
      n.name = THIEF_NAMES[variant];
      n.target = target;
      n.hasFlashlight = this.level.night && this.rng() < 0.75;
      n.detectability = 0.85 + this.rng() * 0.3;
      if (variant === 'runner') {
        n.baseSpeed = n.speed = 2.9 + this.rng() * 0.4;
        n.detectability = 1.25;
        n.stealMult = 0.6;
      } else if (variant === 'sneak') {
        n.baseSpeed = n.speed = 1.45;
        n.detectability = 0.6;
        n.stealMult = 1.2;
      } else if (variant === 'pair') {
        n.stealMult = 0.7;
      } else if (variant === 'crawler') {
        n.baseSpeed = n.speed = 1.15;
        n.detectability = 0.55;
        n.stealMult = 1.1;
      } else if (variant === 'pelt') {
        n.baseSpeed = n.speed = 1.4;
        n.detectability = 0.7;
      } else if (variant === 'disguised') {
        n.baseSpeed = n.speed = 1.8;
        n.detectability = 1.0;
      } else if (variant === 'tree') {
        // ağaç kılığı: yavaş, kısa hamlelerle; durunca neredeyse görünmez
        n.baseSpeed = n.speed = 1.05;
        n.detectability = 0.5;
        n.stealMult = 1.15;
        n.treeT = 1.5 + this.rng();
      }
      n.baseSpeed *= this.level.thiefSpeedMult ?? 1;
      n.speed = n.baseSpeed;
      n.detectability *= this.level.thiefDetectMult ?? 1;
      if (sp.boat && this.map.boat) {
        // rezervuardan tekneyle: su → baraj tepesi → baraj eteği; kara yolu karaya çıkınca hesaplanır
        n.boat = true;
        n.boatX = sp.x + ox;
        n.wp = this.boatWps(n, false);
        n.onWater = true;
        this.npcs.push(n);
        continue;
      }
      // fuar modu: yol, doğum noktası seçilirken hesaplanan maliyet alanından çıkarılır (ek A* yok)
      const p =
        (smart && k === 0 ? pathFromField(this.nav, smart.field, { x: n.x, z: n.z }, { x: target.ax, z: target.az }, 'intruder') : null) ??
        this.path(n, { x: target.ax + ox * 0.5, z: target.az + oz * 0.5 }, 'intruder');
      if (!p) {
        if (k === 0) return this.spawnThief(attempt + 1);
        continue;
      }
      n.path = p;
      this.npcs.push(n);
    }
  }

  private spawnAnimal() {
    const subs: NpcSub[] = this.level.night ? ['boar', 'dog', 'boar'] : ['dog', 'sheep', 'goat', 'boar'];
    const sub = subs[Math.floor(this.rng() * subs.length)];
    const sp = this.pickWeighted(this.map.spawns.filter((s) => !s.boat), (s) => (s.side === 'W' || s.side === 'N' ? 2 : 1) * s.weight * this.spawnBias(s.x, s.z));
    const lim = fenceWorld(this.map);
    const inX = Math.max(-lim + 4, Math.min(lim - 4, sp.x * 0.62));
    const inZ = Math.max(-lim + 4, Math.min(lim - 4, sp.z * 0.62));
    const goal = this.randomInsidePoint(inX, inZ, 5) ?? nearestWalkable(this.map, inX, inZ, true);
    const speeds: Record<string, number> = { dog: 2.3, sheep: 1.0, goat: 1.2, boar: 1.8 };
    const count = this.level.demo ? 1 : sub === 'sheep' || sub === 'goat' ? 2 + Math.floor(this.rng() * 2) : 1;
    let leader: NPC | null = null;
    for (let k = 0; k < count; k++) {
      const ox = k === 0 ? 0 : (this.rng() - 0.5) * 3;
      const oz = k === 0 ? 0 : (this.rng() - 0.5) * 3;
      const n = this.newNpc('animal', sub, sp.x + ox, sp.z + oz, speeds[sub] * (0.9 + this.rng() * 0.2));
      n.detectability = 0.8;
      n.lifeLimit = sub === 'dog' ? 55 + this.rng() * 30 : 80 + this.rng() * 40;
      if (leader) {
        n.leaderId = leader.id;
        n.offX = ox;
        n.offZ = oz;
      }
      const p = this.path(n, { x: goal.x + ox * 0.6, z: goal.z + oz * 0.6 }, 'animal');
      if (!p) continue;
      n.path = p;
      this.npcs.push(n);
      if (!leader) leader = n;
    }
  }

  private spawnStaff() {
    const s = this.map.staffSpawns[Math.floor(this.rng() * this.map.staffSpawns.length)];
    const targets0 = this.map.assets.filter((a) => a.kind !== 'control' && a.kind !== 'panels');
    // demo: kapıya en yakın varlığa gider (kısa tur)
    const targets = this.level.demo ? [targets0.reduce((b, a) => (Math.hypot(a.ax - s.x, a.az - s.z) < Math.hypot(b.ax - s.x, b.az - s.z) ? a : b))] : targets0;
    const target = targets[Math.floor(this.rng() * targets.length)];
    const n = this.newNpc('staff', 'staff', s.x, s.z, 1.8);
    n.state = 'goto';
    n.target = target;
    (n as any)._gate = s.gateId;
    const p = this.path(n, { x: target.ax, z: target.az }, 'staff');
    if (!p) return;
    n.path = p;
    this.npcs.push(n);
    this.gatePassUntil[s.gateId] = 0;
  }

  private spawnTech() {
    const options: ('camera_offline' | 'gate_open' | 'sensor_fault')[] = ['gate_open'];
    if (this.devices.some((d) => isCameraLike(d.dev.type) && d.dev.type !== 'tower' && !d.disabled)) options.push('camera_offline', 'camera_offline');
    if (this.devices.some((d) => (d.dev.type === 'motion' || d.dev.type === 'perimeter') && !d.faulty)) options.push('sensor_fault');
    const t = options[Math.floor(this.rng() * options.length)];
    if (t === 'camera_offline') {
      const cams = this.devices.filter((d) => isCameraLike(d.dev.type) && d.dev.type !== 'tower' && !d.disabled);
      const d = cams[Math.floor(this.rng() * cams.length)];
      d.disabled = true;
      const inc = this.createIncident({
        kind: 'tech',
        title: `Kamera bağlantısı kesildi: ${d.dev.label}`,
        detail: 'Görüntü akışı yok. Bu kameranın alanı şu an kör nokta. Uzaktan yeniden başlatın veya devriye gönderin.',
        x: d.dev.x,
        z: d.dev.z,
        radius: 2,
        npcId: null,
        source: 'Sistem',
        verified: true,
        tracking: false,
        suggestion: null,
      });
      inc.techType = 'camera_offline';
      inc.techDeviceId = d.dev.id;
      this.feedPush(`Teknik arıza: ${d.dev.label} çevrim dışı (#${inc.seq}).`, 'warn', inc.id);
    } else if (t === 'gate_open') {
      const g = this.map.gates[Math.floor(this.rng() * this.map.gates.length)];
      this.openGates.add(g.id);
      const inc = this.createIncident({
        kind: 'tech',
        title: `${g.name} açık kaldı`,
        detail: 'Kapı kilitlenmemiş. Hayvanlar ve izinsiz kişiler kolayca girebilir. Uzaktan kilitleyin veya devriye gönderin.',
        x: g.x,
        z: g.z,
        radius: 2.5,
        npcId: null,
        source: 'Kapı kontağı',
        verified: true,
        tracking: false,
        suggestion: null,
      });
      inc.techType = 'gate_open';
      inc.techGateId = g.id;
      this.feedPush(`Teknik olay: ${g.name} açık (#${inc.seq}).`, 'warn', inc.id);
    } else {
      const ss = this.devices.filter((d) => (d.dev.type === 'motion' || d.dev.type === 'perimeter') && !d.faulty);
      const d = ss[Math.floor(this.rng() * ss.length)];
      d.faulty = true;
      d.nextFaultAt = this.time + 3;
      const inc = this.createIncident({
        kind: 'tech',
        title: `Sensör arızası: ${d.dev.label}`,
        detail: 'Sensör tutarsız sinyaller üretiyor. Gelen bildirimler yanlış alarm olabilir. Uzaktan resetleyin.',
        x: d.dev.x,
        z: d.dev.z,
        radius: 2,
        npcId: null,
        source: 'Sistem',
        verified: true,
        tracking: false,
        suggestion: null,
      });
      inc.techType = 'sensor_fault';
      inc.techDeviceId = d.dev.id;
      this.feedPush(`Teknik olay: ${d.dev.label} arızalı sinyal üretiyor (#${inc.seq}).`, 'warn', inc.id);
    }
  }

  private spawnFalseSensor() {
    const ss = this.devices.filter((d) => (d.dev.type === 'motion' || d.dev.type === 'perimeter') && !d.disabled);
    if (!ss.length) return;
    const d = ss[Math.floor(this.rng() * ss.length)];
    this.sensorTrigger(d, null);
  }

  private updateTech() {
    for (const d of this.devices) {
      if (d.faulty && this.time >= d.nextFaultAt) {
        d.nextFaultAt = this.time + 14 + this.rng() * 10;
        d.cooldownUntil = 0;
        this.sensorTrigger(d, null);
      }
    }
    for (const inc of this.incidents) {
      if (inc.techFixAt && inc.status !== 'resolved' && this.time >= inc.techFixAt) {
        inc.techFixAt = undefined;
        if (inc.techType === 'gate_open' && inc.techGateId) this.openGates.delete(inc.techGateId);
        else if (inc.techDeviceId) {
          const d = this.runtime(inc.techDeviceId);
          if (d) {
            d.disabled = false;
            d.faulty = false;
          }
        }
        inc.status = 'resolved';
        inc.resolvedAt = this.time;
        this.feedPush(`#${inc.seq} teknik sorun giderildi.`, 'ok', inc.id);
      }
    }
  }

  private updateHints() {
    for (const n of this.npcs) {
      if (!n.active || n.kind !== 'thief') continue;
      if (this.time < n.nextHintAt) continue;
      n.nextHintAt = this.time + 7 + this.rng() * 8;
      const tracked = n.incidentId && this.incident(n.incidentId)?.tracking;
      if (tracked) continue;
      const out = Math.max(Math.abs(n.x), Math.abs(n.z)) - fenceWorld(this.map);
      if (out > 4) continue;
      const c = cellAt(this.map, n.x, n.z);
      let type: Hint['type'] = 'silhouette';
      if (this.level.night && n.hasFlashlight) type = 'flashlight';
      else if (c >= 0 && this.map.obsType[c] === 4) type = 'rustle';
      else if (this.rng() < 0.5) type = 'rustle';
      const jx = (this.rng() - 0.5) * 5, jz = (this.rng() - 0.5) * 5;
      this.hints.push({ id: ++this.seq, type, x: n.x + jx, z: n.z + jz, t: this.time, until: this.time + 1.6, yaw: this.rng() * Math.PI * 2 });
      if (type === 'flashlight') n.flashUntil = this.time + 1.0;
    }
  }

  // ───────────── yardımcılar ─────────────
  createIncident(p: {
    kind: IncidentKind;
    title: string;
    detail: string;
    x: number;
    z: number;
    radius: number;
    npcId: string | null;
    source: string;
    verified: boolean;
    tracking: boolean;
    suggestion: Incident['suggestion'];
  }): Incident {
    const c = cellAt(this.map, p.x, p.z);
    const risk = c >= 0 ? this.map.risk[c] : 1;
    const inc: Incident = {
      id: `I${++this.incSeq}`,
      seq: this.incSeq,
      ...p,
      sector: sectorName(p.x, p.z),
      createdAt: this.time,
      status: 'open',
      lastSeenAt: this.time,
      truth: null,
      playerClass: null,
      classifiedAt: null,
      firstActionAt: null,
      resolvedAt: null,
      actions: [],
      aim: false,
      priority: (risk >= 3 ? 3 : risk >= 2 ? 2 : 1) as 1 | 2 | 3,
      noticed: false,
    };
    this.incidents.push(inc);
    return inc;
  }

  incident(id: string) {
    return this.incidents.find((i) => i.id === id) ?? null;
  }
  runtime(devId: string) {
    return this.devices.find((d) => d.dev.id === devId) ?? null;
  }

  feedPush(text: string, level: FeedItem['level'], incidentId?: string) {
    this.feed.unshift({ id: ++this.feedSeq, t: this.time, text, level, incidentId });
    if (this.feed.length > 60) this.feed.pop();
  }

  fenceLimit() {
    return fenceWorld(this.map);
  }

  isGateOpenCell(c: number) {
    const g = this.map.gates.find((g) => g.cells.includes(c));
    return !!g && this.openGates.has(g.id);
  }

  gateOpenAmount(gateId: string) {
    if (this.openGates.has(gateId)) return 1;
    return (this.gatePassUntil[gateId] ?? 0) > this.time ? 1 : 0;
  }

  path(agent: { x: number; z: number }, to: Vec2, profile: NavProfile): Vec2[] | null {
    return findPath(this.nav, { x: agent.x, z: agent.z }, to, profile);
  }

  moveAlong(a: Mover, dt: number): boolean {
    let rem = a.speed * dt;
    while (rem > 0 && a.pi < a.path.length) {
      const p = a.path[a.pi];
      const dx = p.x - a.x, dz = p.z - a.z;
      const d = Math.hypot(dx, dz);
      if (d > 0.001) {
        const want = Math.atan2(dz, dx);
        a.yaw += angleDiff(want, a.yaw) * Math.min(1, dt * 10);
      }
      if (d <= rem) {
        a.x = p.x;
        a.z = p.z;
        rem -= d;
        a.pi++;
      } else {
        a.x += (dx / d) * rem;
        a.z += (dz / d) * rem;
        rem = 0;
      }
    }
    return a.pi >= a.path.length;
  }

  randomInsidePoint(cx: number, cz: number, r: number): Vec2 | null {
    for (let k = 0; k < 12; k++) {
      const x = cx + (this.rng() - 0.5) * 2 * r;
      const z = cz + (this.rng() - 0.5) * 2 * r;
      const c = cellAt(this.map, x, z);
      if (c < 0 || !this.map.inside[c] || this.map.nav[c] !== 0 || this.nav.dynBlocked[c]) continue;
      return { x: cellX(this.map, cellIndexOf(this.map, x)), z: cellX(this.map, cellIndexOf(this.map, z)) };
    }
    return null;
  }

  /** tekne rotası (HES): ileri = su kıyısı → baraj tepesi → baraj eteği; geri = tersi, doğduğu su noktasına */
  boatWps(n: NPC, back: boolean): Waypoint[] {
    const bt = this.map.boat!;
    const x = n.boatX;
    const ground = (z: number) => this.map.heightAt(x, z);
    const shore: Waypoint = { x, z: bt.shoreZ, y: bt.waterY, speed: 3.2, water: true, tag: 'shore' };
    const fence: Waypoint = { x, z: bt.fenceZ, y: ground(bt.fenceZ), speed: 1.3, water: false, tag: 'fence' }; // tepedeki çit: kesilir
    const crest: Waypoint = { x, z: bt.crestZ, y: ground(bt.crestZ), speed: 1.3, water: false, tag: 'crest' };
    const foot: Waypoint = { x, z: bt.footZ, y: ground(bt.footZ), speed: 1.5, water: false, tag: 'foot' }; // eğik yüzden iner
    const origin: Waypoint = { x, z: n.originZ, y: bt.waterY, speed: 3.4, water: true, tag: 'origin' };
    if (!back) return [shore, fence, crest, foot]; // kıyı → çit (rezervuar kenarı, kesilir) → tepe (güney kenar) → etek
    // geri: nerede kaldıysa oradan (suda ise doğrudan geri, tepede ise çit → kıyı → su)
    const next = n.wp[0]?.tag ?? 'foot';
    const full: Waypoint[] = [crest, fence, { ...shore, speed: 1.3 }, origin];
    const from = next === 'shore' ? 3 : next === 'fence' ? 2 : next === 'crest' ? 1 : 0;
    return full.slice(from);
  }
  /** ara nokta bitti: hedefe kara yolu */
  boatLanded(n: NPC) {
    n.onWater = false;
    n.yOff = 0;
    const tg = n.target ?? this.pickTarget(n.x, n.z);
    n.target = tg;
    const p = this.path(n, { x: tg.ax, z: tg.az }, 'intruder');
    if (p) {
      n.path = p;
      n.pi = 0;
      n.state = 'approach';
    } else {
      n.fleeing = true;
      n.wp = this.boatWps(n, true);
    }
  }

  startEscape(n: NPC, flee: boolean) {
    const prof: NavProfile = n.kind === 'animal' ? 'animal' : 'intruder';
    let p: Vec2[] | null = null;
    if (n.kind === 'thief' && n.boat && this.map.boat) {
      // tekneyle gelen: henüz karaya çıkmadıysa tekneyle geri döner; içerideyse baraj eteğine yürüyüp tekneye biner
      n.sabotageId = null;
      n.fleeing = true;
      n.crouch = false;
      n.state = 'escape';
      if (n.wp.length || !n.entered) {
        n.wp = this.boatWps(n, true);
        n.wpLen = 0;
        n.path = [];
        n.pi = 0;
        if (flee && n.incidentId) this.feedPush('Şüpheli tekneyle rezervuara kaçıyor.', 'warn', n.incidentId);
        return;
      }
      const bt = this.map.boat;
      const land = this.path(n, { x: n.boatX, z: bt.footZ }, prof);
      if (land) {
        n.path = land;
        n.pi = 0;
        n.wpAfter = this.boatWps(n, true);
        if (flee && n.incidentId) this.feedPush('Şüpheli barajın üstünden tekneye kaçıyor.', 'warn', n.incidentId);
        return;
      }
    }
    if (n.kind === 'thief') {
      // hırsız geldiği yoldan kaçar: içerideyse önce girdiği çit deliğine, oradan geldiği noktaya
      const origin = { x: n.originX, z: n.originZ };
      if (n.entered && n.entryCell >= 0) {
        const N = this.map.N;
        const hole = { x: cellX(this.map, n.entryCell % N), z: cellX(this.map, Math.floor(n.entryCell / N)) };
        const a = this.path(n, hole, prof);
        const b = a ? this.path(hole, origin, prof) : null;
        if (a && b) p = [...a, ...b];
      }
      if (!p) p = this.path(n, origin, prof);
    }
    if (!p) {
      // en yakın dış nokta
      let best: Vec2 | null = null, bd = 1e9;
      for (const s of this.map.spawns) {
        const d = Math.hypot(s.x - n.x, s.z - n.z);
        if (d < bd) {
          bd = d;
          best = s;
        }
      }
      if (!best) return;
      p = this.path(n, best, prof);
    }
    if (!p) return;
    n.path = p;
    n.pi = 0;
    n.crouch = false;
    if (n.variant === 'tree') n.detectability = 1.1 * (this.level.thiefDetectMult ?? 1); // kılığı atar
    if (flee) {
      n.fleeing = true;
      n.state = 'flee';
      n.speed = n.kind === 'animal' ? n.baseSpeed * 2.1 : 3.6;
    } else {
      n.state = 'escape';
      n.speed = n.kind === 'animal' ? n.baseSpeed : 2.6;
    }
  }

  // ───────────── Desecure ürünleri: otomatik yakalama ─────────────
  private autoPass(n: NPC, autos: DeviceRuntime[], th: number, dt: number) {
    let seenBy: DeviceRuntime | null = null;
    let rate = 0;
    for (const d of autos) {
      const spec = EQUIPMENT[d.dev.type];
      const res = cameraSees(this.map, this.env, d.dev, 0, 360, n.x, n.z, th);
      if (!res.seen) continue;
      if (n.kind === 'animal') {
        // hayvan: yapay zekâ ayırt eder, alarm yerine sesli ikaz
        if (n.entered && d.cooldownUntil <= this.time && n.state !== 'flee') {
          d.cooldownUntil = this.time + 10;
          d.activeUntil = this.time + 2.5;
          this.deter(d.dev.x, d.dev.z, spec.range, 'speaker');
          this.feedPush(`${d.dev.label}: Hayvan algılandı, sesli ikazla uzaklaştırılıyor.`, 'info');
        }
        continue;
      }
      const r = (spec.autoRate ?? (this.level.demo ? 1.6 : 1)) * (1 - 0.35 * (res.dist / Math.max(1, res.range)));
      if (r > rate) {
        rate = r;
        seenBy = d;
      }
    }
    if (n.kind !== 'thief') return;
    if (this.level.demo && seenBy) n.autoProg += 0.6 * dt; // demo: AİM anında tanır
    if (seenBy) {
      // ürün yapay zekâsı kılık değiştirmeye kanmaz; yalnızca görünürlük (sinsi/sürünen) biraz yavaşlatır
      n.autoProg += rate * Math.max(0.75, n.detectability) * dt;
      if (n.autoProg >= 1) this.autoCatch(n, seenBy);
    } else n.autoProg = Math.max(0, n.autoProg - 0.3 * dt);
  }

  private autoCatch(n: NPC, d: DeviceRuntime) {
    if (n.firstDetectAt === null) {
      n.firstDetectAt = this.time;
      n.detectedBy = d.dev.label;
    }
    n.detectProg = Math.max(n.detectProg, 1);
    this.onCameraDetect(n, d);
    const inc = n.incidentId ? this.incident(n.incidentId) : null;
    if (inc) {
      inc.autoBy = d.dev.label;
      inc.verified = true;
      inc.tracking = true;
      inc.truth = 'insan';
      inc.playerClass = 'insan';
      inc.classifiedAt = inc.classifiedAt ?? this.time;
      inc.firstActionAt = inc.firstActionAt ?? this.time;
      if (!inc.aim) {
        inc.aim = true;
        this.aimReports++;
      }
      inc.title = `${EQUIPMENT[d.dev.type].code}: Şüpheli otomatik yakalandı`;
      inc.detail = `${d.dev.label} şüpheliyi tespit edip durdurdu; AİM jandarmayı yönlendirdi.`;
    }
    d.activeUntil = this.time + 4;
    n.state = 'held';
    n.crouch = false;
    n.fleeing = false;
    n.walking = false;
    n.path = [];
    n.timer = 15;
    this.autoCatches++;
    this.callJandarma(n, inc?.id ?? null);
    this.feedPush(`${d.dev.label}: Şüpheli otomatik yakalandı! Sesli ikazla durduruldu, AİM jandarmayı yönlendirdi.`, 'ok', inc?.id);
    this.version++;
  }

  // ───────────── malzeme stoğu ─────────────
  private initStock() {
    this.stock = planStock(this.map, this.level);
  }
  stockMax() {
    return this.stock.reduce((s, x) => s + x.max, 0);
  }
  stockRemaining() {
    return this.stock.reduce((s, x) => s + x.cur, 0);
  }
  /** sahada hâlâ yakalanabilir hırsızların elindeki malzeme */
  stockCarried() {
    return this.npcs.reduce((s, n) => s + (n.active && n.kind === 'thief' ? n.loot : 0), 0);
  }
  stockOf(assetId: string | undefined | null) {
    return assetId ? this.stock.find((s) => s.assetId === assetId) ?? null : null;
  }
  /** hırsız hedefi: malzemesi kalan varlıklar arasından (yakın + değerli olan öncelikli) */
  pickTarget(fromX: number, fromZ: number): CriticalAsset {
    const withStock = this.map.assets.filter((a) => (this.stockOf(a.id)?.cur ?? 0) > 0);
    const pool = withStock.length ? withStock : this.map.assets;
    if (this.level.expo) {
      // fuar modu: akıllı hırsız önce kamerasız makaraya, yoksa en yakınına gider
      const seen = this.nav.camSeen;
      const N = this.map.N;
      const watched = (a: CriticalAsset) => {
        if (!seen) return false;
        const i = Math.floor(a.ax + N / 2), j = Math.floor(a.az + N / 2);
        return i >= 0 && j >= 0 && i < N && j < N && seen[j * N + i] === 1;
      };
      const open = pool.filter((a) => !watched(a));
      const pool2 = open.length ? open : pool;
      let best = pool2[0], bd = Infinity;
      for (const a of pool2) {
        const d = Math.hypot(a.ax - fromX, a.az - fromZ);
        if (d < bd) {
          bd = d;
          best = a;
        }
      }
      return best;
    }
    return this.pickWeighted(pool, (a) => (a.weight + (this.stockOf(a.id)?.cur ?? 0) * 0.6) / (1 + Math.hypot(a.x - fromX, a.z - fromZ) / 45));
  }
  /** hırsız işini bitirdi: makara(lar)ı alır; hedefte kalmadıysa 0 döner */
  takeLoot(n: NPC): number {
    const st = this.stockOf(n.target?.id);
    if (!st || st.cur <= 0) return 0;
    const carry = this.level.thiefCarry ?? 2;
    const want = n.variant === 'pair' ? Math.max(1, carry - 1) : carry;
    const take = Math.min(want, st.cur);
    st.cur -= take;
    n.loot += take;
    n.lootAsset = st.assetId;
    this.theftLog.push({ t: this.time, x: n.x, z: n.z, name: n.target?.name ?? 'Tesis', take, seen: n.firstDetectAt !== null });
    this.version++;
    return take;
  }
  /** yakalanan hırsızın elindeki malzeme yerine döner */
  returnLoot(n: NPC): number {
    const back = n.loot;
    if (back > 0) {
      const st = this.stockOf(n.lootAsset);
      if (st) st.cur = Math.min(st.max, st.cur + back);
      n.loot = 0;
      this.version++;
    }
    n.stolen = false;
    return back;
  }

  // ───────────── jandarma ─────────────
  /** AİM bildirimi veya devriye yakalaması sonrası jandarma aracını çağırır */
  callJandarma(n: NPC, incidentId: string | null = n.incidentId): Gendarme | null {
    if (n.kind !== 'thief' || !n.active || n.jandarmaId || n.state === 'arrested') return null;
    if (n.wp.length || n.onWater) return null; // su / baraj üstünde: araç ulaşamaz
    // yakındaki şüpheliye giden araç varsa aynı araç bunu da alır
    for (const j of this.jandarma) {
      if (j.state !== 'enroute' && j.state !== 'arrest') continue;
      const t = this.npcs.find((m) => m.id === j.targetNpc);
      if (t && Math.hypot(t.x - n.x, t.z - n.z) < 15) {
        j.queue.push(n.id);
        n.jandarmaId = j.id;
        return j;
      }
    }
    // giriş noktası: hırsıza en yakın kapının dışından, harita kenarındaki yol ağzı
    const half = this.map.N / 2 - 1.5;
    let start: Vec2 | null = null;
    let exit: Vec2 | null = null;
    let bd = 1e9;
    for (const g of this.map.gates) {
      let dx = g.outsideX - g.x, dz = g.outsideZ - g.z;
      const L = Math.hypot(dx, dz) || 1;
      dx /= L;
      dz /= L;
      const k = Math.min(dx ? (half - Math.abs(g.outsideX)) / Math.abs(dx) : 1e9, dz ? (half - Math.abs(g.outsideZ)) / Math.abs(dz) : 1e9);
      const far = nearestWalkable(this.map, g.outsideX + dx * Math.max(0, k), g.outsideZ + dz * Math.max(0, k), false);
      const d = Math.hypot(g.x - n.x, g.z - n.z) + (g.main ? -6 : 0);
      if (d < bd) {
        bd = d;
        start = far;
        exit = far;
      }
    }
    if (!start || !exit) return null;
    const j: Gendarme = {
      id: `J${++this.seq}`,
      label: 'JANDARMA',
      x: start.x,
      z: start.z,
      yaw: Math.atan2(n.z - start.z, n.x - start.x),
      speed: this.level.jandarmaSpeed ?? 8.5,
      path: [],
      pi: 0,
      state: 'enroute',
      targetNpc: n.id,
      queue: [],
      incidentId,
      timer: 0,
      replanAt: 0,
      exit,
      calledAt: this.time + (this.level.jandarmaDelay ?? 0),
      officer: null,
    };
    n.jandarmaId = j.id;
    this.jandarma.push(j);
    this.feedPush(`AİM: Jandarma bilgilendirildi — ekip aracı ${sectorName(n.x, n.z)} sektörüne yönlendirildi.`, 'info', incidentId ?? undefined);
    this.version++;
    return j;
  }

  private updateJandarma(j: Gendarme, dt: number) {
    if (j.state === 'gone') return;
    // kapıya yaklaşınca bariyer açılır
    for (const g of this.map.gates) if (Math.hypot(g.x - j.x, g.z - j.z) < 7) this.gatePassUntil[g.id] = this.time + 1.5;
    const n = this.npcs.find((m) => m.id === j.targetNpc);
    if (j.state === 'enroute') {
      if (this.time < j.calledAt) return; // ekip henüz yola çıkmadı
      if (!n || !n.active || n.state === 'arrested') {
        if (!this.jandarmaNext(j)) this.jandarmaLeave(j);
        return;
      }
      const dist = Math.hypot(n.x - j.x, n.z - j.z);
      if (this.time >= j.replanAt) {
        j.replanAt = this.time + 0.9;
        const p = this.path(j, { x: n.x, z: n.z }, 'vehicle') ?? this.path(j, nearestWalkable(this.map, n.x, n.z, isInside(this.map, n.x, n.z)), 'vehicle');
        if (p) {
          j.path = p;
          j.pi = 0;
        }
      }
      const done = this.moveAlong(j, dt);
      const reach = done ? 9 : 3.2; // araç yaklaşamıyorsa er yürüyerek alır
      if (dist <= reach || (done && dist <= 12)) this.startArrest(j, n);
      else if (this.time - j.calledAt > 40) this.jandarmaLeave(j);
      return;
    }
    if (j.state === 'arrest') {
      j.timer -= dt;
      if (!n) {
        this.jandarmaLeave(j);
        return;
      }
      // er şüpheliyi kelepçeleyip araca götürür
      const doorX = j.x - Math.sin(j.yaw) * 1.4, doorZ = j.z + Math.cos(j.yaw) * 1.4;
      const dx = doorX - n.x, dz = doorZ - n.z;
      const d = Math.hypot(dx, dz);
      if (j.timer < 1.9 && d > 0.3) {
        const step = Math.min(d, 2.2 * dt);
        n.x += (dx / d) * step;
        n.z += (dz / d) * step;
        n.yaw = Math.atan2(dz, dx);
        n.walking = true;
      } else n.walking = false;
      const side = 0.75;
      j.officer = { x: n.x - Math.sin(n.yaw) * side, z: n.z + Math.cos(n.yaw) * side, yaw: n.yaw, walking: n.walking };
      if (j.timer <= 0 || (j.timer < 1.9 && d <= 0.35)) {
        n.active = false;
        n.gone = true;
        j.officer = null;
        // sırada başka şüpheli varsa ona geç
        if (this.jandarmaNext(j)) {
          this.feedPush('Jandarma bir şüpheliyi araca aldı, diğerine yöneliyor.', 'ok', j.incidentId ?? undefined);
          return;
        }
        this.feedPush('Jandarma şüpheliyi araca aldı ve sahadan götürüyor.', 'ok', j.incidentId ?? undefined);
        this.jandarmaLeave(j);
      }
      return;
    }
    if (j.state === 'leave') {
      if (this.moveAlong(j, dt)) j.state = 'gone';
    }
  }

  private startArrest(j: Gendarme, n: NPC) {
    j.state = 'arrest';
    j.timer = 3.4;
    j.path = [];
    const hadLoot = n.stolen;
    n.state = 'arrested';
    n.crouch = false;
    n.fleeing = false;
    n.path = [];
    const back = this.returnLoot(n); // malzeme kurtarıldı
    if (n.outcome !== 'caught') {
      n.outcome = 'caught';
      n.outcomeAt = this.time;
    }
    const inc = n.incidentId ? this.incident(n.incidentId) : null;
    if (inc) {
      inc.truth = 'insan';
      inc.detail = hadLoot ? 'Jandarma şüpheliyi gözaltına aldı, çalınan malzeme kurtarıldı.' : 'Jandarma şüpheliyi gözaltına aldı.';
    }
    this.feedPush(`Jandarma şüpheliyi gözaltına aldı${hadLoot ? `, ${back} kablo makarası geri getirildi` : ''}!`, 'ok', inc?.id);
  }

  private jandarmaNext(j: Gendarme) {
    while (j.queue.length) {
      const next = this.npcs.find((m) => m.id === j.queue[0]);
      j.queue.shift();
      if (next && next.active && next.state !== 'arrested') {
        j.targetNpc = next.id;
        j.state = 'enroute';
        j.officer = null;
        j.replanAt = 0;
        return true;
      }
    }
    return false;
  }

  private jandarmaLeave(j: Gendarme) {
    j.state = 'leave';
    j.officer = null;
    const p = this.path(j, j.exit, 'vehicle');
    j.path = p ?? [j.exit];
    j.pi = 0;
    j.speed = 7;
  }

  jandarmaActive(id: string | null) {
    if (!id) return false;
    const j = this.jandarma.find((g) => g.id === id);
    return !!j && (j.state === 'enroute' || j.state === 'arrest');
  }

  // ───────────── kaçış aracı ─────────────
  /** çaldığı makarayla sahadan çıkan hırsız: kamyonet gelir, alır, harita kenarından uzaklaşır */
  spawnGetaway(n: NPC) {
    if (n.loot <= 0) return;
    this.lootLost += n.loot;
    // çıkış noktasından harita kenarına doğru
    const half = this.map.N / 2 - 1.5;
    const L = Math.hypot(n.x, n.z) || 1;
    const dx = n.x / L, dz = n.z / L;
    const k = Math.min(dx ? (half - Math.abs(n.x)) / Math.abs(dx) : 1e9, dz ? (half - Math.abs(n.z)) / Math.abs(dz) : 1e9);
    const far = { x: n.x + dx * Math.max(2, k), z: n.z + dz * Math.max(2, k) };
    const g: Getaway = {
      id: `G${++this.seq}`,
      x: n.x + Math.sin(n.yaw) * 1.5,
      z: n.z - Math.cos(n.yaw) * 1.5,
      yaw: Math.atan2(far.z - n.z, far.x - n.x),
      speed: 9,
      path: [far],
      pi: 0,
      state: 'wait',
      loot: n.loot,
      timer: 1.2,
    };
    this.getaways.push(g);
    this.feedPush(`Kaçış aracı: ${n.loot} kablo makarası kamyonete yüklendi ve sahadan uzaklaştı.`, 'alert', n.incidentId ?? undefined);
    this.version++;
  }
  private updateGetaway(g: Getaway, dt: number) {
    if (g.state === 'gone') return;
    if (g.state === 'wait') {
      g.timer -= dt;
      if (g.timer <= 0) g.state = 'leave';
      return;
    }
    if (this.moveAlong(g, dt)) g.state = 'gone';
  }

  // ───────────── taktik müdahale (operatör) ─────────────
  /** tüm sahada siren: hırsızlar büyük olasılıkla kaçar, hayvanlar uzaklaşır */
  tacticSiren() {
    this.tacticsUsed.siren++;
    for (const d of this.devices) if (d.dev.type === 'siren' || EQUIPMENT[d.dev.type].bonus) d.activeUntil = this.time + 4;
    const res = this.deter(0, 0, 999, 'siren');
    this.feedPush(`Operatör: Saha geneli siren çalındı — ${res.thieves} şüpheli kaçtı, ${res.animals} hayvan uzaklaştı.`, 'warn');
    this.version++;
    return res;
  }
  /** ek devriye: ana kapıdan giren ekip en yakın aktif şüpheliye gider, sonra sahada devriye kalır */
  tacticBackup() {
    this.tacticsUsed.backup++;
    const gate = this.map.gates.find((g) => g.main) ?? this.map.gates[0];
    const p = nearestWalkable(this.map, gate.x, gate.z, true);
    const dev: Device = { id: `backup${this.tacticsUsed.backup}`, label: `EKİP-${String(this.tacticsUsed.backup).padStart(2, '0')}`, type: 'patrol', i: cellIndexOf(this.map, p.x), j: cellIndexOf(this.map, p.z), x: p.x, z: p.z, yaw: 0, level: 2 };
    this.addDevice(dev, true);
    const r = this.responders[this.responders.length - 1];
    r.speed = GUARD_WALK * 1.35;
    let best: NPC | null = null, bd = 1e9;
    for (const n of this.npcs) {
      if (!n.active || n.kind !== 'thief' || neutralized(n)) continue;
      const d = Math.hypot(n.x - p.x, n.z - p.z);
      if (d < bd) {
        bd = d;
        best = n;
      }
    }
    if (best) {
      r.state = 'chase';
      r.targetNpc = best.id;
      r.incidentId = best.incidentId;
      r.replanAt = 0;
      this.feedPush(`Operatör: Ek devriye ${r.label} sahaya girdi, ${sectorName(best.x, best.z)} sektörüne koşuyor.`, 'warn', best.incidentId ?? undefined);
    } else this.feedPush(`Operatör: Ek devriye ${r.label} sahaya girdi, devriyeye başladı.`, 'info');
    this.version++;
    return r;
  }
  /** projektör: 12 sn tüm saha aydınlık (gece) + hırsızlar saklanır/kaçar */
  tacticFloodlight() {
    this.tacticsUsed.light++;
    this.env.boosts.push({ x: 0, z: 0, r: 999, until: this.time + 12 });
    const res = this.deter(0, 0, 999, 'light');
    this.feedPush('Operatör: Saha projektörleri yakıldı — 12 sn tam aydınlık.', 'warn');
    this.version++;
    return res;
  }

  /** caydırma: siren / hoparlör / projektör */
  /**
   * fuar modu: AİM kamerada gördüğü hırsıza hedefli sesli uyarı yapar ("Kameradasınız, jandarma yolda").
   * Fark edilen hırsız içeri girmeden / makarayı bırakıp geldiği yoldan kaçar.
   */
  aimRepel(n: NPC) {
    if (!n.active || neutralized(n) || n.kind !== 'thief') return false;
    n.sabotageId = null;
    if (!n.fleeing) this.startEscape(n, true);
    return true;
  }

  deter(x: number, z: number, r: number, kind: 'siren' | 'speaker' | 'light') {
    const res = { thieves: 0, animals: 0, staff: 0 };
    for (const n of this.npcs) {
      if (!n.active || neutralized(n)) continue;
      if (Math.hypot(n.x - x, n.z - z) > r) continue;
      if (n.kind === 'thief') {
        if (this.level.demo) continue; // demo: hayvan anonsu hırsızı kaçırmasın, otomatik yakalama tamamlansın
        if (n.sabotageId) {
          // fark edilen sabotajcı planından vazgeçer
          n.sabotageId = null;
          this.startEscape(n, true);
          res.thieves++;
          continue;
        }
        if (n.fleeing) {
          res.thieves++;
          continue;
        }
        let p = kind === 'siren' ? 0.85 : kind === 'speaker' ? 0.55 : 0.4;
        if (n.incidentId && this.incident(n.incidentId)?.tracking) p += 0.12; // "Sizi kamerayla izliyoruz"
        if (this.rng() < p) {
          this.startEscape(n, true);
          res.thieves++;
        } else if (n.state !== 'cutting') {
          n.resumeState = n.state;
          n.state = 'hide';
          n.timer = 3 + this.rng() * 3;
        }
      } else if (n.kind === 'animal') {
        const p = kind === 'siren' ? 0.95 : kind === 'speaker' ? 0.8 : 0.3;
        if (this.rng() < p && n.state !== 'flee') {
          this.startEscape(n, true);
          res.animals++;
        }
      } else res.staff++;
    }
    return res;
  }

  nearestDevice(types: Device['type'][], x: number, z: number, maxDist: (d: DeviceRuntime) => number) {
    let best: DeviceRuntime | null = null, bd = 1e9;
    for (const d of this.devices) {
      if (!types.includes(d.dev.type) || d.disabled) continue;
      const dist = Math.hypot(d.dev.x - x, d.dev.z - z);
      if (dist <= maxDist(d) && dist < bd) {
        bd = dist;
        best = d;
      }
    }
    return best;
  }

  /** Oyuncu gözle gördüğü karakteri manuel işaretler */
  manualMark(npcId: string): Incident | null {
    const n = this.npcs.find((m) => m.id === npcId);
    if (!n || !n.active) return null;
    n.manualAt = this.time;
    if (n.firstDetectAt === null) {
      n.firstDetectAt = this.time;
      n.detectedBy = 'Operatör';
    }
    let inc = n.incidentId ? this.incident(n.incidentId) : null;
    if (inc && inc.status === 'resolved') return inc;
    if (inc) {
      inc.verified = true;
      inc.tracking = true;
      inc.x = n.x;
      inc.z = n.z;
      inc.radius = 1.2;
      if (inc.kind === 'sensor' || inc.kind === 'perimeter') {
        inc.kind = 'manual';
        inc.title = 'Operatör doğrulaması: Görsel temas';
      }
      return inc;
    }
    inc = this.createIncident({
      kind: 'manual',
      title: 'Operatör tespiti: Görsel temas',
      detail: 'Kör noktada operatör tarafından manuel olarak işaretlendi.',
      x: n.x,
      z: n.z,
      radius: 1.2,
      npcId: n.id,
      source: 'Operatör',
      verified: true,
      tracking: true,
      suggestion: this.visionSuggest(n.kind, n.variant),
    });
    n.incidentId = inc.id;
    this.feedPush(`Operatör: ${inc.sector} sektöründe kör noktada hareket işaretlendi (#${inc.seq}).`, 'alert', inc.id);
    return inc;
  }

  /** NPC'nin oyuncunun manuel işaretinin sürmesi (operatör bakışı) */
  refreshManual(npcId: string) {
    const n = this.npcs.find((m) => m.id === npcId);
    if (n) n.manualAt = this.time;
  }

  aimPtz(devId: string, x: number, z: number) {
    const d = this.runtime(devId);
    if (!d || d.dev.type !== 'ptzCam') return false;
    d.ptzMode = 'lock';
    d.ptzTarget = { x, z };
    return true;
  }
  releasePtz(devId: string) {
    const d = this.runtime(devId);
    if (!d) return;
    d.ptzMode = 'sweep';
    d.ptzTarget = null;
  }

  insideCheck(x: number, z: number) {
    return isInside(this.map, x, z);
  }
}

/** Tesisteki kablo makarası dağılımı: hırsız sayısının ~1,7 katı (4–12).
 *  Makaralar az sayıda noktada toplanır (önce depolar, sonra en değerli varlıklar) — oyuncu neyi koruyacağını görür. */
export function planStock(map: MapData, level: LevelDef): Stock[] {
  const total = level.stockTotal ?? Math.max(4, Math.min(12, Math.round(level.thieves * 1.7)));
  const ranked = [...map.assets].filter((a) => a.kind !== 'control' && a.id !== 'coal').sort((a, b) => (b.kind === 'depot' ? 10 : 0) + b.weight - ((a.kind === 'depot' ? 10 : 0) + a.weight));
  const spots = ranked.slice(0, Math.max(1, Math.ceil(total / 1.5)));
  const out: Stock[] = spots.map((a) => ({ assetId: a.id, name: a.name, max: 0, cur: 0 }));
  for (let k = 0; k < total; k++) out[k % out.length].max++;
  for (const o of out) o.cur = o.max;
  return out;
}

export function labelTr(l: ClassLabel) {
  return { insan: 'İnsan', hayvan: 'Hayvan', arac: 'Araç', personel: 'Personel', yanlis: 'Yanlış alarm' }[l];
}

export type { CriticalAsset };

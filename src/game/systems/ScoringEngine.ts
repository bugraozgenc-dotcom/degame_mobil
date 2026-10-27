import { deviceValue, isCameraLike } from '../config/equipment';
import type { Device } from '../types';
import { sectorName } from '../world/grid';
import type { CoverageResult } from './coverage';
import { CLASS_LABELS, truthOf } from './entities';
import type { SimulationEngine } from './SimulationEngine';

// ScoringEngine — tüm metrikler gerçek simülasyon kayıtlarından hesaplanır.

export interface ResultData {
  score: number;
  grade: string;
  title: string;
  levelId: number;
  metrics: {
    coveragePct: number;
    criticalPct: number;
    classCorrect: number;
    classTotal: number;
    classAccuracy: number;
    unclassified: number;
    prevented: number;
    thieves: number;
    breaches: number;
    missed: number;
    falseAlarms: number;
    avgDetect: number | null;
    avgResponse: number | null;
    budgetUsed: number;
    budgetTotal: number;
    criticalProtected: number;
    criticalTotal: number;
    catches: number;
    dispatches: number;
    animalsHandled: number;
    animals: number;
    incidents: number;
  };
  breakdown: { label: string; value: number; max: number }[];
  recommendations: { text: string; tone: 'good' | 'bad' | 'info' }[];
  events: { seq: number; title: string; sector: string; outcome: string; tone: 'good' | 'bad' | 'info' }[];
}

const clamp01 = (v: number) => Math.max(0, Math.min(1, v));

export function computeResult(e: SimulationEngine, cov: CoverageResult, devices: Device[], budgetTotal: number): ResultData {
  const thieves = e.npcs.filter((n) => n.kind === 'thief' && n.outcome && n.outcome !== null);
  const counted = thieves.filter((n) => n.outcome === 'caught' || n.outcome === 'fled' || n.outcome === 'breach' || n.outcome === 'unresolved');
  const prevented = counted.filter((n) => n.outcome === 'caught' || n.outcome === 'fled');
  const breaches = counted.filter((n) => n.outcome === 'breach');
  const unresolved = counted.filter((n) => n.outcome === 'unresolved');
  const missed = counted.filter((n) => n.firstDetectAt === null);

  // algılama kalitesi
  const detQ: number[] = [];
  const detLat: number[] = [];
  for (const n of counted) {
    if (n.firstDetectAt === null) {
      detQ.push(0);
      continue;
    }
    const lat = Math.max(0, n.firstDetectAt - (n.enteredAt ?? n.firstDetectAt));
    detLat.push(lat);
    detQ.push(lat <= 12 ? 1 : lat <= 25 ? 0.7 : 0.4);
  }
  const respTimes: number[] = [];
  for (const n of prevented) if (n.firstDetectAt !== null && n.outcomeAt !== null) respTimes.push(Math.max(0, n.outcomeAt - n.firstDetectAt));

  // sınıflandırma
  const classInc = e.incidents.filter((i) => i.kind !== 'tech');
  let classCorrect = 0, unclassified = 0;
  for (const i of classInc) {
    const npc = i.npcId ? e.npcs.find((n) => n.id === i.npcId) : null;
    const truth = truthOf(npc ? npc.kind : null);
    if (!i.playerClass) unclassified++;
    else if (i.playerClass === truth) classCorrect++;
  }
  const classTotal = classInc.length;

  const animals = e.npcs.filter((n) => n.kind === 'animal' && n.entered);
  const animalsHandled = animals.filter((n) => n.outcome === 'removed').length;
  const ignoredAnimals = animals.filter((n) => n.outcome === 'ignored').length;
  const closedEarly = e.incidents.filter((i) => i.closedEarly).length;
  const falseAlarms = e.falseAlarms.length;
  const catches = counted.filter((n) => n.outcome === 'caught').length;
  const dispatches = e.actionsLog.filter((a) => a.action === 'dispatch').length;

  const critZones = cov.zones.filter((z) => z.critical);
  const criticalProtected = critZones.filter((z) => z.pct >= 60).length;
  const budgetUsed = devices.reduce((s, d) => s + deviceValue(d.type, d.level), 0);

  // puan
  const sThreat = counted.length ? ((prevented.length + unresolved.length * 0.3) / counted.length) * 35 : 35;
  const sDetect = detQ.length ? (detQ.reduce((a, b) => a + b, 0) / detQ.length) * 15 : 15;
  const sClass = classTotal ? (classCorrect / classTotal) * 15 : 7.5;
  const sCov = ((cov.coveragePct * 0.5 + cov.criticalPct * 0.5) / 100) * 15;
  const sResp = respTimes.length
    ? (respTimes.map((t) => clamp01(1 - (t - 15) / 60)).reduce((a, b) => a + b, 0) / respTimes.length) * 10
    : counted.length
      ? 0
      : 10;
  const leftOpen = e.incidents.filter((i) => i.status !== 'resolved').length;
  const sDisc = Math.max(0, 10 - falseAlarms * 3 - ignoredAnimals * 2 - closedEarly * 2 - Math.min(5, leftOpen));
  const score = Math.round(Math.max(0, Math.min(100, sThreat + sDetect + sClass + sCov + sResp + sDisc)));

  const [grade, title] =
    score >= 90 ? ['A+', 'Kusursuz Savunma'] : score >= 80 ? ['A', 'Güçlü Güvenlik'] : score >= 65 ? ['B', 'Yeterli Koruma'] : score >= 50 ? ['C', 'Geliştirilmeli'] : ['D', 'Kritik Açıklar'];

  // öneriler
  const rec: ResultData['recommendations'] = [];
  const weak = [...critZones].filter((z) => z.pct < 55 && z.cells > 0).sort((a, b) => a.pct - b.pct).slice(0, 3);
  for (const z of weak) rec.push({ text: `${capital(z.name)} bölgesinde kamera kapsaması yetersiz (%${Math.round(z.pct)}).`, tone: 'bad' });
  for (const n of [...breaches, ...unresolved]) {
    const s = sectorName(n.enteredAt !== null ? n.target?.x ?? n.x : n.x, n.target?.z ?? n.z);
    if (n.firstDetectAt === null) rec.push({ text: `${s} sektöründe ${n.target?.name ?? 'sahaya'} yönelik ihlal hiç fark edilmedi.`, tone: 'bad' });
    else rec.push({ text: `${s} sektöründeki ${n.target?.name ?? ''} olayı geç fark edildi veya müdahale yetersiz kaldı.`, tone: 'bad' });
  }
  for (const n of prevented) {
    const lat = n.firstDetectAt !== null ? n.firstDetectAt - (n.enteredAt ?? n.firstDetectAt) : 0;
    if (lat > 20) rec.push({ text: `${sectorName(n.x, n.z)} sektöründeki olay ${Math.round(lat)} sn geç fark edildi.`, tone: 'info' });
  }
  if (classTotal) {
    const acc = Math.round((classCorrect / classTotal) * 100);
    rec.push({ text: `Doğru sınıflandırma oranı: %${acc} (${classCorrect}/${classTotal} olay).`, tone: acc >= 75 ? 'good' : 'bad' });
  }
  if (leftOpen) rec.push({ text: `${leftOpen} olay simülasyon sonunda hâlâ açıktı — olayları kayıt altına alıp sonlandırın.`, tone: 'bad' });
  if (unclassified) rec.push({ text: `${unclassified} olay sınıflandırılmadan bırakıldı.`, tone: 'bad' });
  if (falseAlarms) rec.push({ text: `${falseAlarms} yanlış alarm: siren ve AİM bildiriminden önce olayı kamera veya devriye ile doğrulayın.`, tone: 'bad' });
  if (ignoredAnimals) rec.push({ text: `${ignoredAnimals} hayvan simülasyon sonuna kadar sahada kaldı. Hoparlör veya devriye ile güvenli uzaklaştırma yapın.`, tone: 'bad' });
  if (e.npcs.some((n) => n.sub === 'boar' && n.damage > 30)) rec.push({ text: 'Yaban domuzu uzun süre sahada kaldı — kablo kanallarında hasar riski oluştu.', tone: 'bad' });
  if (e.level.night && !devices.some((d) => d.type === 'thermalCam')) rec.push({ text: 'Gece operasyonunda termal kamera kullanılmadı; ışıksız alanlarda sabit kameralar menzilinin %40\'ını görür.', tone: 'info' });
  if (e.level.night && devices.filter((d) => d.type === 'light').length < 2) rec.push({ text: 'Aydınlatma direkleri, gece sabit kameraların menzilini neredeyse tam seviyeye çıkarır.', tone: 'info' });
  if (!devices.some((d) => d.type === 'control')) rec.push({ text: 'Kontrol Merkezi ile Desecure AİM sınıflandırma önerileri ve 1.5 sn sevk süresi kazanılır.', tone: 'info' });
  if (!devices.some((d) => d.type === 'patrol' || d.type === 'vehicle')) rec.push({ text: 'Devriye birimi veya güvenlik aracı olmadan sahada fiziksel müdahale yapılamaz.', tone: 'bad' });
  if (devices.some((d) => d.type === 'ptzCam') && !e.actionsLog.some((a) => a.action === 'ptz')) rec.push({ text: 'PTZ kameralar hiçbir olaya yönlendirilmedi — doğrulama için PTZ\'yi olay noktasına çevirin.', tone: 'info' });
  if (e.incidents.some((i) => i.kind === 'tech' && i.status !== 'resolved')) rec.push({ text: 'Çözülmemiş teknik arıza(lar) simülasyon sonuna kadar kör nokta oluşturdu.', tone: 'bad' });
  if (!devices.some((d) => isCameraLike(d.type))) rec.push({ text: 'Sahada hiç kamera yoktu — tüm tespitler operatörün gözüne kaldı.', tone: 'bad' });
  if (counted.length && prevented.length === counted.length) rec.push({ text: 'Tüm izinsiz giriş girişimleri önlendi.', tone: 'good' });
  if (cov.criticalPct >= 75) rec.push({ text: `Kritik alanların %${Math.round(cov.criticalPct)}'i kamera/sensör kapsamında.`, tone: 'good' });

  // olay özeti
  const events: ResultData['events'] = e.incidents.map((i) => {
    const npc = i.npcId ? e.npcs.find((n) => n.id === i.npcId) : null;
    let outcome = 'Kapatıldı';
    let tone: 'good' | 'bad' | 'info' = 'info';
    if (i.kind === 'tech') {
      outcome = i.status === 'resolved' && !i.techFixAt ? 'Giderildi' : 'Açık kaldı';
      tone = outcome === 'Giderildi' ? 'good' : 'bad';
    } else if (npc) {
      const truth = CLASS_LABELS[truthOf(npc.kind)];
      const map: Record<string, [string, 'good' | 'bad' | 'info']> = {
        caught: ['Yakalandı', 'good'],
        fled: ['Caydırıldı', 'good'],
        breach: ['İhlal gerçekleşti', 'bad'],
        unresolved: ['Sahada kaldı', 'bad'],
        removed: ['Uzaklaştırıldı', 'good'],
        left: ['Kendiliğinden ayrıldı', 'info'],
        ignored: ['Sahada kaldı', 'bad'],
        ok: [npc.falseAlarmed ? 'Yanlış alarm' : 'Görev tamamlandı', npc.falseAlarmed ? 'bad' : 'good'],
      };
      const m = npc.outcome ? map[npc.outcome] : null;
      outcome = `${truth} · ${m ? m[0] : 'Devam ediyor'}`;
      tone = m ? m[1] : 'info';
    } else {
      outcome = i.playerClass === 'yanlis' ? 'Yanlış alarm (doğru)' : 'Yanlış alarm';
      tone = i.playerClass === 'yanlis' ? 'good' : 'info';
    }
    if (i.playerClass) {
      const truth = truthOf(npc ? npc.kind : null);
      if (i.kind !== 'tech' && i.playerClass !== truth) {
        outcome += ' · hatalı sınıflandırma';
        tone = 'bad';
      }
    }
    return { seq: i.seq, title: i.title, sector: i.sector, outcome, tone };
  });

  return {
    score,
    grade,
    title,
    levelId: e.level.id,
    metrics: {
      coveragePct: cov.coveragePct,
      criticalPct: cov.criticalPct,
      classCorrect,
      classTotal,
      classAccuracy: classTotal ? (classCorrect / classTotal) * 100 : 0,
      unclassified,
      prevented: prevented.length,
      thieves: counted.length,
      breaches: breaches.length,
      missed: missed.length,
      falseAlarms,
      avgDetect: detLat.length ? detLat.reduce((a, b) => a + b, 0) / detLat.length : null,
      avgResponse: respTimes.length ? respTimes.reduce((a, b) => a + b, 0) / respTimes.length : null,
      budgetUsed,
      budgetTotal,
      criticalProtected,
      criticalTotal: critZones.length,
      catches,
      dispatches,
      animalsHandled,
      animals: animals.length,
      incidents: e.incidents.length,
    },
    breakdown: [
      { label: 'Tehdit önleme', value: sThreat, max: 35 },
      { label: 'Tespit hızı', value: sDetect, max: 15 },
      { label: 'Sınıflandırma', value: sClass, max: 15 },
      { label: 'Kapsama', value: sCov, max: 15 },
      { label: 'Müdahale süresi', value: sResp, max: 10 },
      { label: 'Operasyon disiplini', value: sDisc, max: 10 },
    ],
    recommendations: rec.slice(0, 9),
    events,
  };
}

function capital(s: string) {
  return s.charAt(0).toLocaleUpperCase('tr-TR') + s.slice(1);
}

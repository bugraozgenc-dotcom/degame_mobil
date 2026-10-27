import { EQUIPMENT, levelMult } from '../config/equipment';
import type { ClassLabel } from '../types';
import { nearestWalkable } from '../world/grid';
import { CLASS_LABELS, type Incident, neutralized } from './entities';
import { pathLength } from './pathfinding';
import type { SimulationEngine } from './SimulationEngine';

// IncidentManager — operatörün müdahale komutları.
// Sonuçlar menzil, gecikme ve ekip durumuna bağlıdır.

export type ActionId =
  | 'inspect'
  | 'ptz'
  | 'classify'
  | 'speaker'
  | 'siren'
  | 'dispatch'
  | 'aim'
  | 'light'
  | 'reset'
  | 'resolve';

export interface ActionResult {
  ok: boolean;
  msg: string;
  level: 'ok' | 'warn' | 'info' | 'alert';
}

const r = (ok: boolean, msg: string, level: ActionResult['level'] = ok ? 'ok' : 'warn'): ActionResult => ({ ok, msg, level });

export function performAction(e: SimulationEngine, incId: string, action: ActionId, arg?: string): ActionResult {
  const inc = e.incident(incId);
  if (!inc) return r(false, 'Olay bulunamadı');
  if (inc.status === 'resolved' && action !== 'inspect') return r(false, 'Olay kapatılmış');
  if (inc.firstActionAt === null && action !== 'inspect') inc.firstActionAt = e.time;
  inc.noticed = true;
  if (action !== 'inspect') {
    inc.actions.push(action);
    e.actionsLog.push({ t: e.time, action, incidentId: inc.id });
  }
  const npc = inc.npcId ? e.npcs.find((n) => n.id === inc.npcId) ?? null : null;

  switch (action) {
    case 'inspect':
      return r(true, `#${inc.seq} odaklandı`, 'info');

    case 'ptz': {
      const d = e.nearestDevice(['ptzCam'], inc.x, inc.z, (d) => EQUIPMENT.ptzCam.range * levelMult(d.dev.level) * 1.05);
      if (!d) return r(false, 'Menzilde çalışan PTZ kamera yok');
      e.aimPtz(d.dev.id, inc.x, inc.z);
      return r(true, `${d.dev.label} olay noktasına çevriliyor — önceki tarama alanı korumasız kalır`, 'info');
    }

    case 'classify': {
      const label = arg as ClassLabel;
      inc.playerClass = label;
      inc.classifiedAt = e.time;
      if (npc && label !== 'insan' && npc.kind === 'thief') {
        // oyuncu hırsızı yanlış sınıflandırdı — sonuçta ölçülür
      }
      return r(true, `#${inc.seq} → ${CLASS_LABELS[label]}`, 'info');
    }

    case 'speaker': {
      const d = e.nearestDevice(['speaker'], inc.x, inc.z, (d) => EQUIPMENT.speaker.range * levelMult(d.dev.level));
      if (!d) return r(false, 'Olay noktası menzilinde IP hoparlör yok');
      d.activeUntil = e.time + 6;
      const res = e.deter(inc.x, inc.z, 14 * levelMult(d.dev.level), 'speaker');
      e.feedPush(`${d.dev.label}: "Dikkat! Bu alan güvenlik kamerasıyla izlenmektedir."`, 'info', inc.id);
      if (res.thieves) return r(true, 'Sesli ikaz yapıldı — şüpheli uzaklaşıyor');
      if (res.animals) return r(true, 'Sesli ikaz yapıldı — hayvanlar ürktü');
      return r(true, 'Sesli ikaz yapıldı', 'info');
    }

    case 'siren': {
      const d = e.nearestDevice(['siren'], inc.x, inc.z, (d) => EQUIPMENT.siren.range * levelMult(d.dev.level));
      if (!d) return r(false, 'Olay noktası menzilinde alarm sireni yok');
      d.activeUntil = e.time + 10;
      const res = e.deter(inc.x, inc.z, 20 * levelMult(d.dev.level), 'siren');
      const realThreat = res.thieves > 0 || npc?.kind === 'thief';
      if (!realThreat) {
        if (!inc.falseAlarm) {
          inc.falseAlarm = true;
          e.falseAlarms.push({ t: e.time, reason: res.animals ? 'Hayvan için siren' : npc?.kind === 'staff' ? 'Personel için siren' : 'Gerçek tehdit yokken siren', x: inc.x, z: inc.z });
        }
        if (npc?.kind === 'staff') npc.falseAlarmed = true;
        e.feedPush(`${d.dev.label}: Siren çalındı — gerçek tehdit doğrulanmadı (yanlış alarm).`, 'warn', inc.id);
        return r(true, res.animals ? 'Siren hayvanları kaçırdı ama yanlış alarm sayıldı' : 'Yanlış alarm! Gerçek tehdit yoktu', 'warn');
      }
      e.feedPush(`${d.dev.label}: Alarm sireni aktif!`, 'alert', inc.id);
      return r(true, res.thieves ? 'Siren çaldı — şüpheli kaçıyor' : 'Siren çaldı');
    }

    case 'light': {
      const d = e.nearestDevice(['light'], inc.x, inc.z, (d) => EQUIPMENT.light.range * levelMult(d.dev.level) + 5);
      if (!d) return r(false, 'Yakında aydınlatma direği yok');
      d.activeUntil = e.time + 45;
      e.env.boosts.push({ x: d.dev.x, z: d.dev.z, r: EQUIPMENT.light.range * levelMult(d.dev.level) * 1.5, until: e.time + 45 });
      const res = e.deter(d.dev.x, d.dev.z, 10, 'light');
      return r(true, `${d.dev.label} projektör modu (45 sn)${res.thieves ? ' — şüpheli ürktü' : ''}`, 'info');
    }

    case 'dispatch': {
      const free = e.responders.filter((x) => x.state === 'patrol' || x.state === 'idle' || x.state === 'return');
      if (!free.length) return r(false, 'Müsait devriye / araç yok — tüm ekipler meşgul');
      const target = nearestWalkable(e.map, inc.x, inc.z, true);
      let best = null as null | { resp: (typeof free)[number]; path: { x: number; z: number }[]; eta: number };
      const delay = e.hasControl ? 1.5 : 4;
      for (const resp of free) {
        const p = e.path(resp, target, 'guard');
        if (!p) continue;
        const sp = resp.kind === 'vehicle' ? 7.2 : 4.1;
        const eta = pathLength(p, resp) / sp + delay;
        if (!best || eta < best.eta) best = { resp, path: p, eta };
      }
      if (!best) return r(false, 'Olay noktasına ulaşılabilir ekip yok');
      const R = best.resp;
      R.state = 'dispatch';
      R.path = best.path;
      R.pi = 0;
      R.incidentId = inc.id;
      R.departAt = e.time + delay;
      inc.status = 'dispatched';
      e.feedPush(`${R.label} #${inc.seq} için sevk edildi (tahmini varış ${Math.round(best.eta)} sn).`, 'info', inc.id);
      return r(true, `${R.label} yola çıkıyor — ETA ${Math.round(best.eta)} sn`);
    }

    case 'aim': {
      if (inc.aim) return r(false, 'Olay zaten Alarm İzleme Merkezi\'ne iletildi');
      inc.aim = true;
      e.aimReports++;
      const real = npc?.kind === 'thief';
      if (!real) {
        if (!inc.falseAlarm) {
          inc.falseAlarm = true;
          e.falseAlarms.push({ t: e.time, reason: npc?.kind === 'staff' ? 'Personel AİM\'e ihlal olarak bildirildi' : npc?.kind === 'animal' ? 'Hayvan AİM\'e ihlal olarak bildirildi' : 'Doğrulanmamış olay AİM\'e bildirildi', x: inc.x, z: inc.z });
        }
        if (npc?.kind === 'staff') npc.falseAlarmed = true;
        e.feedPush(`AİM: #${inc.seq} için kolluk bildirimi yapıldı — sahada tehdit doğrulanmadı.`, 'warn', inc.id);
        return r(true, 'AİM bildirimi yapıldı — yanlış alarm riski!', 'warn');
      }
      e.feedPush(`AİM: #${inc.seq} önceliklendirildi, kolluk kuvvetlerine bildirim yapıldı.`, 'ok', inc.id);
      if (npc) {
        e.callJandarma(npc, inc.id);
        // hırsız ekibinin diğer üyesi için de ekip
        for (const m of e.npcs) if (m.active && m.kind === 'thief' && m !== npc && (m.leaderId === npc.id || (npc.leaderId && (m.id === npc.leaderId || m.leaderId === npc.leaderId)))) e.callJandarma(m, inc.id);
      }
      // AİM koordinasyonu: ekip sevk edilmediyse otomatik sevk
      if (inc.status === 'open') performAction(e, inc.id, 'dispatch');
      return r(true, 'Alarm İzleme Merkezi olayı devraldı');
    }

    case 'reset': {
      if (inc.kind !== 'tech') return r(false, 'Bu olay teknik değil');
      if (inc.techFixAt) return r(false, 'İşlem sürüyor');
      const t = inc.techType === 'gate_open' ? 5 : 8;
      inc.techFixAt = e.time + t;
      return r(true, inc.techType === 'gate_open' ? `Uzaktan kilitleme başlatıldı (${t} sn)` : `Uzaktan yeniden başlatma (${t} sn)`, 'info');
    }

    case 'resolve': {
      inc.status = 'resolved';
      inc.resolvedAt = e.time;
      if (inc.kind === 'tech') {
        e.feedPush(`#${inc.seq} teknik sorun giderilmeden kapatıldı.`, 'warn', inc.id);
        return r(true, 'Kapatıldı (sorun devam ediyor!)', 'warn');
      }
      if (npc && npc.active && !neutralized(npc) && !npc.fleeing && npc.kind !== 'staff') {
        inc.closedEarly = true;
        npc.incidentId = null;
        npc.detectProg = 0;
        npc.manualAt = null;
        if (npc.kind === 'thief') e.feedPush(`#${inc.seq} kapatıldı — ancak hedef hâlâ sahada!`, 'warn');
      }
      for (const R of e.responders) if (R.incidentId === inc.id && R.state === 'dispatch') R.incidentId = null;
      return r(true, `#${inc.seq} kayıt altına alındı ve kapatıldı`, 'ok');
    }
  }
  return r(false, 'Bilinmeyen komut');
}

export function needsClassification(inc: Incident) {
  return inc.kind !== 'tech';
}

import type { Responder } from './entities';
import { CLASS_LABELS, neutralized, truthOf } from './entities';
import type { SimulationEngine } from './SimulationEngine';
import { losClear } from './vision';

// PatrolAI — devriye rotası, sevk, inceleme, takip ve yakalama

export const GUARD_WALK = 2.1;
export const GUARD_RUN = 4.1;
export const VEHICLE_SPEED = 7.2;

export function updateResponder(e: SimulationEngine, r: Responder, dt: number) {
  r.walking = false;
  switch (r.state) {
    case 'patrol': {
      r.speed = GUARD_WALK;
      if (!r.route.length) {
        r.state = 'idle';
        break;
      }
      if (r.pi >= r.path.length) {
        r.ri = (r.ri + 1) % r.route.length;
        const p = e.path(r, r.route[r.ri], 'guard');
        r.path = p ?? [];
        r.pi = 0;
        if (!p) r.ri = (r.ri + 1) % r.route.length;
      }
      r.walking = e.moveAlong(r, dt) === false;
      break;
    }
    case 'idle':
      break;
    case 'dispatch': {
      if (e.time < r.departAt) break;
      r.speed = r.kind === 'vehicle' ? VEHICLE_SPEED : GUARD_RUN;
      r.walking = true;
      if (e.moveAlong(r, dt)) {
        r.state = 'investigate';
        r.timer = r.kind === 'vehicle' ? 1.5 : 2.2;
      }
      break;
    }
    case 'investigate': {
      r.timer -= dt;
      if (r.timer <= 0) investigate(e, r);
      break;
    }
    case 'chase': {
      const t = r.targetNpc ? e.npcs.find((n) => n.id === r.targetNpc) : null;
      if (!t || !t.active || neutralized(t)) {
        startReturn(e, r);
        break;
      }
      const lim = e.fenceLimit();
      if (Math.max(Math.abs(t.x), Math.abs(t.z)) > lim + 1.2) {
        e.feedPush(`${r.label}: Şüpheli çit dışına kaçtı, takip bırakıldı.`, 'warn', r.incidentId ?? undefined);
        startReturn(e, r);
        break;
      }
      r.speed = r.kind === 'vehicle' ? VEHICLE_SPEED * 0.8 : GUARD_RUN;
      if (e.time >= r.replanAt || r.pi >= r.path.length) {
        r.replanAt = e.time + 0.6;
        const p = e.path(r, { x: t.x, z: t.z }, 'guard');
        if (p) {
          r.path = p;
          r.pi = 0;
        }
      }
      r.walking = true;
      e.moveAlong(r, dt);
      break;
    }
    case 'escort': {
      r.timer -= dt;
      if (r.timer <= 0) startReturn(e, r);
      break;
    }
    case 'return': {
      r.speed = r.kind === 'vehicle' ? VEHICLE_SPEED * 0.7 : GUARD_WALK * 1.2;
      r.walking = true;
      if (e.moveAlong(r, dt)) {
        r.incidentId = null;
        r.targetNpc = null;
        if (r.kind === 'guard' && r.route.length) {
          r.state = 'patrol';
          r.path = [];
          r.pi = 0;
        } else r.state = 'idle';
      }
      break;
    }
  }

  // yakalama kontrolü
  if (r.state === 'chase' || r.state === 'dispatch' || r.state === 'investigate' || r.state === 'patrol') {
    for (const n of e.npcs) {
      if (!n.active || n.kind !== 'thief' || neutralized(n)) continue;
      if (Math.hypot(n.x - r.x, n.z - r.z) < 1.5) catchThief(e, r, n.id);
    }
  }
}

export function startReturn(e: SimulationEngine, r: Responder) {
  r.state = 'return';
  const target = r.kind === 'guard' && r.route.length ? r.route[r.ri] : r.home;
  const p = e.path(r, target, 'guard');
  r.path = p ?? [];
  r.pi = 0;
  r.targetNpc = null;
}

function catchThief(e: SimulationEngine, r: Responder, npcId: string) {
  const n = e.npcs.find((m) => m.id === npcId)!;
  const hadLoot = n.stolen;
  n.outcome = 'caught';
  n.outcomeAt = e.time;
  const back = e.returnLoot(n); // çalınan makaralar yerine döner
  // yakalanan hırsız malzemeyi bırakıp koşarak kaçar
  e.startEscape(n, true);
  n.speed = 4.7;
  n.crouch = false;
  r.state = 'escort';
  r.timer = 2.5;
  r.path = [];
  const inc = n.incidentId ? e.incident(n.incidentId) : null;
  if (inc) {
    inc.truth = 'insan';
    inc.verified = true;
    inc.detail = hadLoot ? 'Devriye yetişti: hırsız çaldığı malzemeyi bırakıp kaçtı.' : 'Devriye yetişti: hırsız eli boş kaçıyor, jandarma yolda.';
  }
  e.feedPush(`${r.label} hırsıza yetişti! ${hadLoot ? `${back} kablo makarası geri alındı, ` : ''}hırsız koşarak kaçıyor — jandarma çağrıldı.`, 'ok', inc?.id);
  e.callJandarma(n, inc?.id ?? null);
}

export function investigate(e: SimulationEngine, r: Responder) {
  const inc = r.incidentId ? e.incident(r.incidentId) : null;
  const eyeY = e.map.heightAt(r.x, r.z) + 1.7;
  const seen = e.npcs.filter(
    (n) =>
      n.active &&
      Math.hypot(n.x - r.x, n.z - r.z) < 9 &&
      losClear(e.map, r.x, eyeY, r.z, n.x, e.map.heightAt(n.x, n.z) + 0.8, n.z, false)
  );

  if (inc?.kind === 'tech') {
    if (inc.techType === 'gate_open' && inc.techGateId) {
      e.openGates.delete(inc.techGateId);
      e.feedPush(`${r.label}: ${e.map.gates.find((g) => g.id === inc.techGateId)?.name} kapatıldı ve kilitlendi.`, 'ok', inc.id);
    } else if (inc.techDeviceId) {
      const d = e.runtime(inc.techDeviceId);
      if (d) {
        d.disabled = false;
        d.faulty = false;
      }
      e.feedPush(`${r.label}: Arızalı cihaz sahada yeniden başlatıldı.`, 'ok', inc.id);
    }
    inc.status = 'resolved';
    inc.resolvedAt = e.time;
    startReturn(e, r);
    return;
  }

  const thief = seen.find((n) => n.kind === 'thief' && !neutralized(n));
  if (thief) {
    r.state = 'chase';
    r.targetNpc = thief.id;
    r.replanAt = 0;
    if (inc) {
      inc.truth = 'insan';
      inc.verified = true;
    }
    if (!thief.incidentId && inc && !inc.npcId) {
      inc.npcId = thief.id;
      thief.incidentId = inc.id;
    }
    e.feedPush(`${r.label}: İzinsiz kişi görüldü, takip ediliyor!`, 'alert', inc?.id);
    // hırsız kaçmaya çalışır
    if (!thief.fleeing && e.rng() < 0.85) e.startEscape(thief, true);
    return;
  }

  const linked = inc?.npcId ? e.npcs.find((n) => n.id === inc.npcId) : null;
  const animals = seen.filter((n) => n.kind === 'animal');
  if (animals.length) {
    for (const a of animals) if (a.state !== 'flee') e.startEscape(a, true);
    if (inc) {
      inc.truth = 'hayvan';
      inc.verified = true;
    }
    e.feedPush(`${r.label}: ${animals[0].name} sahadan uzaklaştırılıyor.`, 'ok', inc?.id);
    startReturn(e, r);
    return;
  }
  const staff = seen.find((n) => n.kind === 'staff');
  if (staff) {
    if (inc) {
      inc.truth = 'personel';
      inc.verified = true;
    }
    e.feedPush(`${r.label}: Yetkili bakım personeli doğrulandı.`, 'info', inc?.id);
    startReturn(e, r);
    return;
  }
  if (inc) {
    if (!inc.npcId) {
      inc.truth = 'yanlis';
      e.feedPush(`${r.label}: Bölgede bulgu yok — olası yanlış alarm.`, 'info', inc.id);
    } else if (linked && !linked.active) {
      inc.truth = truthOf(linked.kind);
      e.feedPush(`${r.label}: Hedef bölgeden ayrılmış (${CLASS_LABELS[inc.truth]} izi).`, 'info', inc.id);
    } else {
      e.feedPush(`${r.label}: Bölgede kimse görülmedi, hedef yer değiştirmiş olabilir.`, 'warn', inc.id);
    }
  }
  startReturn(e, r);
}

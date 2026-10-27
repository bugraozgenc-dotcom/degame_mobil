import type { NPC } from './entities';
import type { SimulationEngine } from './SimulationEngine';
import { angleDiff, cellAt, isInside } from '../world/grid';

// ThreatAI — hırsız, hayvan ve personel davranışları (durum makineleri + A* navigasyon)

/** fuar modu: çit kesme süresi (sim sn) — kamera gören çitte AİM bu sürede hırsızı tanıyıp uyarır */
const EXPO_CUT = 2.6;

export function updateNpc(e: SimulationEngine, n: NPC, dt: number) {
  if (!n.active) return;
  n.walking = false;
  const map = e.map;

  // sabit durumlar
  if (n.state === 'arrested') return; // jandarma gözaltısı: hareketi motor yönetir
  if (n.state === 'held') {
    // Desecure ürünü durdurdu: şüpheli yerinde bekler, jandarma alır
    n.walking = false;
    n.crouch = false;
    n.timer -= dt;
    if (n.timer <= 0 && !e.jandarmaActive(n.jandarmaId)) {
      n.outcome = 'caught';
      n.outcomeAt = e.time;
      e.returnLoot(n);
      n.active = false;
      n.gone = true;
    }
    return;
  }
  if (n.state === 'cornered') {
    // jandarma yolu kesti: şüpheli kaçamadan bekler
    n.crouch = false;
    if (!e.jandarmaActive(n.jandarmaId)) {
      n.active = false;
      n.gone = true;
      if (!n.outcome) {
        n.outcome = n.stolen ? 'breach' : 'fled';
        n.outcomeAt = e.time;
      }
    }
    return;
  }
  if (n.state === 'caught') {
    n.timer -= dt;
    n.crouch = true;
    if (n.timer <= 0) {
      n.active = false;
      n.gone = true;
    }
    return;
  }
  if (n.state === 'cutting' || n.state === 'hide' || n.state === 'idle') {
    n.timer -= dt;
    n.crouch = n.state !== 'idle' && n.kind === 'thief';
    if (n.timer <= 0) {
      n.state = n.resumeState;
      n.crouch = false;
    }
    return;
  }

  // tekne / baraj rotası: düz çizgi, nav yok sayılır (HES)
  if (n.wp.length) {
    const w = n.wp[0];
    const dx = w.x - n.x, dz = w.z - n.z;
    const d = Math.hypot(dx, dz);
    if (n.wpLen <= 0) {
      n.wpLen = Math.max(0.01, d);
      n.wpY0 = map.heightAt(n.x, n.z) + n.yOff;
    }
    n.onWater = w.water;
    n.walking = !w.water;
    n.crouch = false;
    if (d > 0.001) n.yaw += angleDiff(Math.atan2(dz, dx), n.yaw) * Math.min(1, dt * 6);
    const step = Math.min(d, w.speed * dt);
    if (d > 0.001) {
      n.x += (dx / d) * step;
      n.z += (dz / d) * step;
    }
    const rem = Math.max(0, d - step);
    const t = 1 - rem / n.wpLen;
    n.yOff = n.wpY0 + (w.y - n.wpY0) * t - map.heightAt(n.x, n.z);
    if (rem <= 0.05) {
      n.wp.shift();
      n.wpLen = 0;
      // tepedeki çit hücresine vardı: keser (kendi deliğinden dönüyorsa kesmez)
      const fc = cellAt(map, n.x, n.z);
      if (fc >= 0 && (map.nav[fc] === 2 || map.nav[fc] === 3) && fc !== n.lastFenceCell) {
        n.lastFenceCell = fc;
        e.onFenceCross(n, fc);
        if (!(n.entered && fc === n.entryCell)) {
          n.resumeState = n.state;
          n.state = 'cutting';
          n.timer = n.fleeing ? 1.4 : e.level.expo ? EXPO_CUT : 3.8;
          return;
        }
      }
      if (!n.wp.length) {
        if (n.fleeing) {
          // rezervuara geri döndü
          n.active = false;
          n.gone = true;
          n.onWater = false;
          if (!n.outcome) {
            n.outcome = n.stolen ? 'breach' : 'fled';
            n.outcomeAt = e.time;
          }
          if (n.stolen) {
            e.lootLost += n.loot;
            e.feedPush(`İhlal: ${n.target?.name ?? 'saha'} kaynaklı malzeme tekneyle kaçırıldı.`, 'alert');
          }
          else if (n.incidentId) e.feedPush('Şüpheli tekneyle uzaklaştı — ihlal önlendi.', 'ok', n.incidentId);
        } else e.boatLanded(n);
      }
    }
    return;
  }

  // çit / kapı geçişi
  const c = cellAt(map, n.x, n.z);
  if (c >= 0 && (map.nav[c] === 2 || map.nav[c] === 3)) {
    if (c !== n.lastFenceCell) {
      n.lastFenceCell = c;
      e.onFenceCross(n, c);
      if (map.nav[c] === 3) {
        const g = map.gates.find((g) => g.cells.includes(c));
        if (g) e.gatePassUntil[g.id] = e.time + 2.5;
      }
      const gateOpen = map.nav[c] === 3 && e.isGateOpenCell(c);
      // kendi kestiği delikten geri çıkarken yeniden kesmez
      const ownHole = n.entered && c === n.entryCell;
      if (n.kind !== 'staff' && !gateOpen && !ownHole) {
        n.resumeState = n.state;
        n.state = 'cutting';
        n.timer = n.kind === 'thief' ? (n.entered ? (n.fleeing ? 1.4 : 2.2) : e.level.expo ? EXPO_CUT : 3.8) : 1.3;
        return;
      }
    }
  } else if (c >= 0) {
    n.lastFenceCell = -1;
  }

  const inside = isInside(map, n.x, n.z);
  if (!n.entered && inside) {
    n.entered = true;
    n.enteredAt = e.time;
  }

  if (n.kind === 'thief') updateThief(e, n, dt, inside);
  else if (n.kind === 'animal') updateAnimal(e, n, dt, inside);
  else updateStaff(e, n, dt);
}

function updateThief(e: SimulationEngine, n: NPC, dt: number, inside: boolean) {
  switch (n.state) {
    case 'approach': {
      // fuar modu: boşluktan giren hırsız içeride koşar
      n.speed = n.baseSpeed * (e.level.expo && inside ? 1.6 : 1);
      n.walking = true;
      n.crouch = (n.variant === 'sneak' && inside) || n.variant === 'crawler' || n.variant === 'pelt'; // sinsi eğilir, sürünen / postlu alçaktan gider
      if (n.variant === 'tree' && !n.fleeing) {
        // ağaç kılıklı: 1–2 sn yürür, 2–4 sn ağaç gibi donar; dururken fark edilmesi çok zor
        n.treeT -= dt;
        if (n.treeT <= 0) {
          n.treeMoving = !n.treeMoving;
          n.treeT = n.treeMoving ? 1.0 + e.rng() * 1.2 : 2.0 + e.rng() * 2.2;
        }
        n.detectability = (n.treeMoving ? 0.7 : 0.32) * (e.level.thiefDetectMult ?? 1);
        if (!n.treeMoving) {
          n.walking = false;
          break;
        }
      }
      if (e.moveAlong(n, dt)) {
        if (n.sabotageId) {
          // fuar modu: kameranın kör noktasına vardı — sabotaj
          n.state = 'sabotage';
          n.crouch = true;
          n.timer = 2.6;
          break;
        }
        n.state = 'stealing';
        n.crouch = true;
        n.timer = 0;
        const inc = n.incidentId ? e.incident(n.incidentId) : null;
        if (inc && inc.tracking) e.feedPush(`${inc.source}: Şüpheli ${n.target?.name ?? 'ekipmana'} müdahale ediyor!`, 'alert', inc.id);
      }
      break;
    }
    case 'sabotage': {
      n.crouch = true;
      n.walking = false;
      n.timer -= dt;
      if (n.timer <= 0) e.sabotage(n);
      break;
    }
    case 'stealing': {
      n.crouch = true;
      n.stealProg += dt / (e.level.stealTime * n.stealMult);
      if (e.level.night && n.hasFlashlight && n.flashUntil < e.time && e.rng() < dt * 0.25) n.flashUntil = e.time + 0.8 + e.rng();
      if (n.stealProg >= 1) {
        const took = e.takeLoot(n);
        if (took === 0) {
          // hedefte malzeme kalmamış: başka varlığa yönel ya da eli boş kaç
          const alt = e.pickTarget(n.x, n.z);
          const st = e.stockOf(alt.id);
          const p = st && st.cur > 0 && alt !== n.target ? e.path(n, { x: alt.ax, z: alt.az }, 'intruder') : null;
          n.stealProg = 0;
          if (p) {
            n.target = alt;
            n.path = p;
            n.pi = 0;
            n.state = 'approach';
          } else e.startEscape(n, false);
          break;
        }
        n.stolen = true;
        n.crouch = false;
        e.startEscape(n, false);
        const inc = n.incidentId ? e.incident(n.incidentId) : null;
        e.feedPush(`${n.target?.name ?? 'Tesis'}: ${took} kablo makarası çalındı! Şüpheli kaçıyor.`, 'alert', inc?.id);
      }
      break;
    }
    case 'escape':
    case 'flee': {
      n.walking = true;
      if (e.moveAlong(n, dt)) {
        if (n.wpAfter?.length) {
          // baraj eteğine vardı: tekneyle devam
          n.wp = n.wpAfter;
          n.wpAfter = null;
          n.wpLen = 0;
          break;
        }
        if (e.jandarmaActive(n.jandarmaId) && !e.level.noCorner) {
          // jandarma yolda: kaçış noktasında kıstırılır
          n.state = 'cornered';
          n.walking = false;
          e.feedPush('Şüpheli saha dışında jandarma tarafından kıstırıldı.', 'warn', n.incidentId ?? undefined);
          break;
        }
        n.active = false;
        n.gone = true;
        if (!n.outcome) {
          n.outcome = n.stolen ? 'breach' : n.entered || n.fleeing ? 'fled' : 'fled';
          n.outcomeAt = e.time;
        }
        if (n.stolen) {
          e.feedPush(`İhlal: ${n.target?.name ?? 'saha'} kaynaklı malzeme kaybı tespit edildi.`, 'alert');
          e.spawnGetaway(n);
        }
        else if (n.incidentId) e.feedPush('Şüpheli sahayı terk etti — ihlal önlendi.', 'ok', n.incidentId);
      }
      break;
    }
  }
  if (!inside && !n.entered && n.state === 'approach') {
    // dışarıdayken
  }
}

function updateAnimal(e: SimulationEngine, n: NPC, dt: number, inside: boolean) {
  if (inside) {
    if (n.sub === 'boar') n.damage += dt;
  }
  switch (n.state) {
    case 'approach': {
      n.walking = true;
      n.speed = n.baseSpeed;
      if (e.moveAlong(n, dt)) {
        n.state = 'idle';
        n.resumeState = 'wander';
        n.timer = 1 + e.rng() * 2;
        n.path = [];
      }
      break;
    }
    case 'wander': {
      n.speed = n.baseSpeed * 0.6;
      if (n.enteredAt !== null && e.time - n.enteredAt > n.lifeLimit) {
        e.startEscape(n, false);
        n.state = 'leave';
        break;
      }
      if (n.pi >= n.path.length) {
        // yeni gezinti noktası
        let cx = n.x, cz = n.z;
        if (n.leaderId) {
          const L = e.npcs.find((m) => m.id === n.leaderId);
          if (L && L.active) {
            cx = L.x + n.offX;
            cz = L.z + n.offZ;
          }
        }
        const p = e.randomInsidePoint(cx, cz, n.leaderId ? 2.5 : 8);
        const path = p ? e.path(n, p, 'animal') : null;
        if (path && path.length) {
          n.path = path;
          n.pi = 0;
          n.state = 'idle';
          n.resumeState = 'wander';
          n.timer = 0.6 + e.rng() * 2.8;
        }
        break;
      }
      n.walking = true;
      e.moveAlong(n, dt);
      break;
    }
    case 'leave':
    case 'flee': {
      n.walking = true;
      if (e.moveAlong(n, dt)) {
        n.active = false;
        n.gone = true;
        if (!n.outcome) {
          n.outcome = n.state === 'flee' ? 'removed' : 'left';
          n.outcomeAt = e.time;
        }
        if (n.state === 'flee') e.feedPush(`${n.name} sahadan güvenli şekilde uzaklaştırıldı.`, 'ok', n.incidentId ?? undefined);
      }
      break;
    }
  }
}

function updateStaff(e: SimulationEngine, n: NPC, dt: number) {
  switch (n.state) {
    case 'goto': {
      n.walking = true;
      if (e.moveAlong(n, dt)) {
        n.state = 'work';
        n.timer = e.level.demo ? 4 : 20 + e.rng() * 10;
        n.crouch = false;
      }
      break;
    }
    case 'work': {
      n.timer -= dt;
      n.crouch = Math.sin(e.time * 1.5) > 0.3;
      if (n.timer <= 0) {
        n.crouch = false;
        n.state = 'return';
        const home = e.map.staffSpawns.find((s) => s.gateId === (n as any)._gate) ?? e.map.staffSpawns[0];
        const p = e.path(n, { x: home.x, z: home.z }, 'staff');
        n.path = p ?? [];
        n.pi = 0;
      }
      break;
    }
    case 'return': {
      n.walking = true;
      if (e.moveAlong(n, dt)) {
        n.active = false;
        n.gone = true;
        n.outcome = 'ok';
        n.outcomeAt = e.time;
      }
      break;
    }
  }
}

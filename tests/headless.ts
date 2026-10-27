// Başsız (headless) simülasyon testi: motor + puanlama mantığını tarayıcısız doğrular.
import { LEVELS } from '../src/game/config/levels';
import { EQUIPMENT } from '../src/game/config/equipment';
import { getMap } from '../src/game/world/maps';
import { SimulationEngine } from '../src/game/systems/SimulationEngine';
import { computeCoverage } from '../src/game/systems/coverage';
import { computeResult } from '../src/game/systems/ScoringEngine';
import { performAction } from '../src/game/systems/IncidentManager';
import { truthOf } from '../src/game/systems/entities';
import { validatePlacement, footprintCenter } from '../src/game/store';
import type { Device, EquipmentType } from '../src/game/types';

const PLANS: Record<number, [EquipmentType, number, number, number][]> = {
  1: [['fixedCam',-6,14,-1.2],['ptzCam',0,-2,-1.57],['thermalCam',-22,-22,0.78],['fixedCam',14,14,0.6],['fixedCam',22,-22,2.36],['perimeter',-23.5,5,0],['siren',10,2,0],['speaker',-8,-2,0],['patrol',-3,-12,0],['control',-4,21.5,0]],
  2: [['thermalCam',-22,-22,0.78],['thermalCam',22,-22,2.36],['light',16,15,0],['fixedCam',14,14,0.6],['ptzCam',0,-2,-1.57],['siren',-10,-2,0],['patrol',0,10,0],['light',-12,-9,0],['control',-4,21.5,0],['speaker',8,-2,0]],
  3: [['tower',-1,2,0],['ptzCam',2,20,-1.57],['thermalCam',-14,-10,-2.4],['fixedCam',10,-14,-1.0],['siren',-4,-4,0],['vehicle',-2,24,0],['patrol',-12,14,0],['control',-14,30,0],['speaker',16,4,0]],
};

function build(levelId: number, empty: boolean) {
  const level = LEVELS.find((l) => l.id === levelId)!;
  const map = getMap(level.mapId);
  const devices: Device[] = [];
  let budget = level.budget;
  if (!empty) for (const [t, x, z, yaw] of PLANS[levelId]) {
    const fp = EQUIPMENT[t].footprint;
    const i = Math.floor(x + map.N / 2 - (fp - 1) / 2), j = Math.floor(z + map.N / 2 - (fp - 1) / 2);
    const v = validatePlacement(map, devices, t, i, j, budget);
    if (!v.valid) { console.log('  ! invalid', t, x, z, v.reason); continue; }
    const c = footprintCenter(map, t, i, j);
    devices.push({ id: `d${devices.length}`, label: `${EQUIPMENT[t].code}-${devices.length}`, type: t, i, j, x: c.x, z: c.z, yaw, level: 1 });
    budget -= EQUIPMENT[t].cost;
  }
  return { level, map, devices };
}

function run(levelId: number, mode: 'smart' | 'idle' | 'empty', seed: number) {
  const { level, map, devices } = build(levelId, mode === 'empty');
  const t0 = performance.now();
  const cov = computeCoverage(map, devices, level.night, level.weather);
  const tCov = performance.now() - t0;
  const e = new SimulationEngine(map, level, devices, seed);
  let maxStep = 0;
  while (!e.ended) {
    const s = performance.now();
    e.update(0.05);
    maxStep = Math.max(maxStep, performance.now() - s);
    if (mode === 'smart') {
      // "akıllı operatör": gördüğünü doğru sınıflandırır, tehdide müdahale eder
      for (const n of e.npcs) {
        if (n.active && n.entered && !n.incidentId && n.kind !== 'staff' && Math.random() < 0.004) e.manualMark(n.id);
      }
      for (const inc of e.incidents) {
        if (inc.status === 'resolved' || inc.actions.length > 3) continue;
        const npc = inc.npcId ? e.npcs.find((n) => n.id === inc.npcId) : null;
        if (inc.kind === 'tech') { if (!inc.actions.includes('reset')) performAction(e, inc.id, 'reset'); continue; }
        if (!inc.playerClass && (inc.verified || !npc)) performAction(e, inc.id, 'classify', truthOf(npc ? npc.kind : null));
        if (npc?.kind === 'thief' && inc.verified && !inc.actions.includes('siren')) { performAction(e, inc.id, 'siren'); performAction(e, inc.id, 'dispatch'); performAction(e, inc.id, 'aim'); }
        if (npc?.kind === 'animal' && inc.verified && !inc.actions.includes('speaker')) performAction(e, inc.id, 'speaker');
        if ((!npc || npc.kind === 'staff' || !npc.active) && inc.playerClass) performAction(e, inc.id, 'resolve');
        if (npc && (npc.state === 'caught' || !npc.active) && inc.playerClass) performAction(e, inc.id, 'resolve');
      }
    }
  }
  const r = computeResult(e, cov, devices, level.budget);
  console.log(`L${levelId} ${mode.padEnd(5)} seed=${seed} score=${r.score} ${r.grade} | cov=${cov.coveragePct.toFixed(0)}% crit=${cov.criticalPct.toFixed(0)}% (${tCov.toFixed(0)}ms) | thieves ${r.metrics.prevented}/${r.metrics.thieves} breach=${r.metrics.breaches} missed=${r.metrics.missed} | class ${r.metrics.classCorrect}/${r.metrics.classTotal} FA=${r.metrics.falseAlarms} | inc=${r.metrics.incidents} | maxStep=${maxStep.toFixed(1)}ms`);
  console.log('   npcs:', e.npcs.map((n) => `${n.sub}:${n.outcome ?? n.state}${n.firstDetectAt !== null ? '*' : ''}`).join(' '));
  return r;
}

for (const L of [1, 2, 3]) {
  for (const seed of [11, 22]) run(L, 'smart', seed);
  run(L, 'idle', 33);
  run(L, 'empty', 44);
}
const r = run(1, 'smart', 99);
console.log(r.recommendations.map((x) => ' - ' + x.text).join('\n'));

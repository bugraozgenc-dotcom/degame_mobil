import { useFrame } from '@react-three/fiber';
import { useRef } from 'react';
import { setAmbient, setMusicMood, sfx } from '../audio/sfx';
import { getEngine, useGame } from '../game/store';
import type { SimulationEngine } from '../game/systems/SimulationEngine';

// Simülasyondaki olayları seslendirir (yeni olay, siren, hoparlör, sevk, yakalama, ihlal)
export function SoundWatcher() {
  const st = useRef<{ e: SimulationEngine | null; inc: Set<string>; dev: Record<string, boolean>; resp: Record<string, string>; out: Record<string, string | null>; jan: Record<string, string>; acc: number }>({ e: null, inc: new Set(), dev: {}, resp: {}, out: {}, jan: {}, acc: 0 });
  const amb = useRef<boolean | null>(null);
  useFrame((_, dt) => {
    const g = useGame.getState();
    const wantAmb = (g.phase === 'planning' || g.phase === 'sim') && !g.autoOrbit;
    const en = getEngine();
    setMusicMood(g.phase === 'sim' ? (en && !en.ended && en.time >= en.stormAt ? 'storm' : 'tense') : 'calm');
    if (wantAmb !== amb.current) {
      amb.current = wantAmb;
      setAmbient(wantAmb);
    }
    const s = st.current;
    s.acc += dt;
    if (s.acc < 0.15) return;
    s.acc = 0;
    const e = getEngine();
    if (!e || g.phase !== 'sim') return;
    if (s.e !== e) {
      s.e = e;
      s.inc = new Set(e.incidents.map((i) => i.id));
      s.dev = {};
      s.resp = {};
      s.out = {};
      s.jan = {};
      return;
    }
    for (const i of e.incidents) {
      if (s.inc.has(i.id)) continue;
      s.inc.add(i.id);
      if (i.kind === 'tech' || !i.verified) sfx.sensor();
      else sfx.alert();
    }
    for (const d of e.devices) {
      const active = d.activeUntil > e.time;
      if (active && !s.dev[d.dev.id]) {
        if (d.dev.type === 'siren') sfx.siren(Math.min(4, d.activeUntil - e.time));
        else if (d.dev.type === 'speaker') sfx.speaker();
      }
      s.dev[d.dev.id] = active;
    }
    for (const r of e.responders) {
      if (r.state === 'dispatch' && s.resp[r.id] !== 'dispatch') sfx.radio();
      s.resp[r.id] = r.state;
    }
    for (const j of e.jandarma) {
      if (j.state !== s.jan[j.id] && (j.state === 'enroute' || j.state === 'arrest')) sfx.police();
      s.jan[j.id] = j.state;
    }
    for (const n of e.npcs) {
      if (n.outcome !== s.out[n.id]) {
        if (n.outcome === 'caught') sfx.caught();
        else if (n.outcome === 'breach') sfx.breach();
        s.out[n.id] = n.outcome;
      }
    }
  });
  return null;
}

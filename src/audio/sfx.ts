import { create } from 'zustand';

// Ses efektleri — Web Audio ile sentezlenir (harici dosya yok, çevrimdışı çalışır)

const KEY = 'desecure-sound';
function loadEnabled() {
  try {
    return localStorage.getItem(KEY) !== 'off';
  } catch {
    return true;
  }
}

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let ambientNodes: { stop: () => void } | null = null;
let ambientWanted = false;

function ac(): AudioContext | null {
  try {
    if (!ctx) {
      const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = 0.55;
      master.connect(ctx.destination);
    }
    if (ctx.state === 'suspended') void ctx.resume();
    return ctx;
  } catch {
    return null;
  }
}

export const useSound = create<{ enabled: boolean; toggle: () => void }>((set, get) => ({
  enabled: loadEnabled(),
  toggle: () => {
    const v = !get().enabled;
    try {
      localStorage.setItem(KEY, v ? 'on' : 'off');
    } catch {
      /* yoksay */
    }
    set({ enabled: v });
    if (v) {
      ac();
      sfx.click();
      if (ambientWanted) startAmbient();
      startMusic();
    } else {
      stopAmbientNodes();
      stopMusic();
    }
  },
}));

const on = () => useSound.getState().enabled;

function tone(freq: number, dur: number, opts: { type?: OscillatorType; vol?: number; when?: number; at?: number; to?: number; attack?: number; dest?: AudioNode; detune?: number } = {}) {
  const c = ac();
  if (!c || !master) return;
  const t0 = opts.at ?? c.currentTime + (opts.when ?? 0);
  const o = c.createOscillator();
  const g = c.createGain();
  o.type = opts.type ?? 'sine';
  o.frequency.setValueAtTime(freq, t0);
  if (opts.detune) o.detune.value = opts.detune;
  if (opts.to) o.frequency.exponentialRampToValueAtTime(opts.to, t0 + dur);
  const v = opts.vol ?? 0.25;
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(v, t0 + (opts.attack ?? 0.008));
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  o.connect(g).connect(opts.dest ?? master);
  o.start(t0);
  o.stop(t0 + dur + 0.05);
}

function noiseBuffer(c: AudioContext, sec: number) {
  const b = c.createBuffer(1, Math.floor(c.sampleRate * sec), c.sampleRate);
  const d = b.getChannelData(0);
  let last = 0;
  for (let i = 0; i < d.length; i++) {
    const w = Math.random() * 2 - 1;
    last = (last + 0.02 * w) / 1.02; // kahverengi gürültü
    d[i] = last * 3.5;
  }
  return b;
}

function noise(dur: number, opts: { vol?: number; freq?: number; q?: number; type?: BiquadFilterType; when?: number } = {}) {
  const c = ac();
  if (!c || !master) return;
  const t0 = c.currentTime + (opts.when ?? 0);
  const src = c.createBufferSource();
  src.buffer = noiseBuffer(c, dur + 0.1);
  const f = c.createBiquadFilter();
  f.type = opts.type ?? 'bandpass';
  f.frequency.value = opts.freq ?? 1500;
  f.Q.value = opts.q ?? 1;
  const g = c.createGain();
  const v = opts.vol ?? 0.3;
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(v, t0 + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  src.connect(f).connect(g).connect(master);
  src.start(t0);
  src.stop(t0 + dur + 0.05);
}

let lastSiren = 0;

export const sfx = {
  click() {
    if (!on()) return;
    tone(1400, 0.05, { type: 'triangle', vol: 0.12 });
  },
  // ── giriş ekranı (izleme merkezi) ──
  /** mod ekranının üstüne gelince kısa elektronik tık */
  uiHover() {
    if (!on()) return;
    tone(1320, 0.05, { type: 'square', vol: 0.035 });
  },
  /** Normal mod seçildi: çift tonlu onay */
  modeNormal() {
    if (!on()) return;
    tone(660, 0.09, { type: 'square', vol: 0.09 });
    tone(990, 0.16, { type: 'square', vol: 0.09, when: 0.08 });
  },
  /** Fuar modu ekranı seçildi: yumuşak onay */
  modeExpo() {
    if (!on()) return;
    tone(523, 0.1, { type: 'triangle', vol: 0.16 });
    tone(784, 0.18, { type: 'triangle', vol: 0.16, when: 0.09 });
  },
  /** şifre tuşu */
  key() {
    if (!on()) return;
    tone(1200, 0.04, { type: 'square', vol: 0.06 });
  },
  /** erişim onaylandı: yükselen üç nota */
  unlock() {
    if (!on()) return;
    tone(1200, 0.04, { type: 'square', vol: 0.06 });
    tone(523, 0.12, { type: 'sine', vol: 0.2, when: 0.06 });
    tone(659, 0.12, { type: 'sine', vol: 0.2, when: 0.16 });
    tone(784, 0.26, { type: 'sine', vol: 0.2, when: 0.26 });
  },
  /** erişim reddedildi */
  denied() {
    if (!on()) return;
    tone(220, 0.14, { type: 'square', vol: 0.1 });
    tone(165, 0.22, { type: 'square', vol: 0.1, when: 0.14 });
  },
  /** vazgeç / geri */
  cancel() {
    if (!on()) return;
    tone(440, 0.08, { type: 'triangle', vol: 0.14 });
    tone(330, 0.14, { type: 'triangle', vol: 0.14, when: 0.07 });
  },
  /** fuar modunda göreve başla: yükselen başlangıç */
  expoStart() {
    if (!on()) return;
    tone(392, 0.1, { type: 'sawtooth', vol: 0.08 });
    tone(523, 0.1, { type: 'sawtooth', vol: 0.08, when: 0.09 });
    tone(784, 0.3, { type: 'sawtooth', vol: 0.08, when: 0.18 });
  },
  place() {
    if (!on()) return;
    tone(260, 0.16, { type: 'triangle', vol: 0.3, to: 130 });
    tone(880, 0.07, { type: 'square', vol: 0.06, when: 0.02 });
  },
  remove() {
    if (!on()) return;
    tone(500, 0.18, { type: 'triangle', vol: 0.2, to: 160 });
  },
  error() {
    if (!on()) return;
    tone(150, 0.12, { type: 'square', vol: 0.12 });
    tone(130, 0.14, { type: 'square', vol: 0.12, when: 0.14 });
  },
  alert() {
    if (!on()) return;
    tone(988, 0.12, { type: 'square', vol: 0.12 });
    tone(1319, 0.18, { type: 'square', vol: 0.12, when: 0.13 });
  },
  sensor() {
    if (!on()) return;
    tone(660, 0.22, { type: 'sine', vol: 0.2 });
    tone(660, 0.22, { type: 'sine', vol: 0.12, when: 0.28 });
  },
  siren(sec = 3) {
    if (!on()) return;
    const c = ac();
    if (!c || !master) return;
    if (c.currentTime - lastSiren < 1) return;
    lastSiren = c.currentTime;
    const t0 = c.currentTime;
    const o = c.createOscillator();
    o.type = 'sawtooth';
    const lfo = c.createOscillator();
    lfo.frequency.value = 0.9;
    const lfoG = c.createGain();
    lfoG.gain.value = 260;
    o.frequency.value = 820;
    lfo.connect(lfoG).connect(o.frequency);
    const f = c.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = 2200;
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(0.11, t0 + 0.15);
    g.gain.setValueAtTime(0.11, t0 + sec - 0.4);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + sec);
    o.connect(f).connect(g).connect(master);
    o.start(t0);
    lfo.start(t0);
    o.stop(t0 + sec + 0.05);
    lfo.stop(t0 + sec + 0.05);
  },
  speaker() {
    if (!on()) return;
    tone(784, 0.35, { vol: 0.22 });
    tone(622, 0.5, { vol: 0.22, when: 0.32 });
    noise(0.6, { vol: 0.05, freq: 1800, q: 3, when: 0.9 });
  },
  /** jandarma aracı: iki tonlu kısa siren */
  police() {
    if (!on()) return;
    for (let k = 0; k < 4; k++) {
      tone(k % 2 ? 660 : 880, 0.36, { type: 'triangle', vol: 0.09, when: k * 0.38 });
    }
  },
  radio() {
    if (!on()) return;
    noise(0.12, { vol: 0.18, freq: 1700, q: 2 });
    tone(1450, 0.08, { type: 'square', vol: 0.07, when: 0.12 });
    noise(0.1, { vol: 0.12, freq: 1700, q: 2, when: 0.22 });
  },
  correct() {
    if (!on()) return;
    [523, 659, 784, 1047].forEach((f, k) => tone(f, 0.22, { type: 'triangle', vol: 0.22, when: k * 0.08 }));
  },
  wrong() {
    if (!on()) return;
    tone(220, 0.25, { type: 'sawtooth', vol: 0.12, to: 180 });
    tone(165, 0.35, { type: 'sawtooth', vol: 0.12, when: 0.22, to: 110 });
  },
  caught() {
    if (!on()) return;
    [392, 523, 659].forEach((f, k) => tone(f, 0.18, { type: 'square', vol: 0.09, when: k * 0.09 }));
    tone(784, 0.4, { type: 'triangle', vol: 0.2, when: 0.27 });
  },
  breach() {
    if (!on()) return;
    tone(110, 0.9, { type: 'sawtooth', vol: 0.13, to: 70 });
    noise(0.8, { vol: 0.1, freq: 300, type: 'lowpass' });
  },
  tick() {
    if (!on()) return;
    tone(1800, 0.03, { type: 'square', vol: 0.06 });
  },
  start() {
    if (!on()) return;
    tone(300, 0.5, { type: 'sawtooth', vol: 0.1, to: 900 });
    tone(1200, 0.25, { type: 'triangle', vol: 0.16, when: 0.45 });
  },
  win(stars: number) {
    if (!on()) return;
    const notes = stars >= 3 ? [523, 659, 784, 1047, 1319] : stars >= 2 ? [523, 659, 784, 1047] : stars >= 1 ? [523, 659, 784] : [392, 330, 262];
    notes.forEach((f, k) => tone(f, 0.3, { type: 'triangle', vol: 0.22, when: k * 0.12 }));
  },
};

function stopAmbientNodes() {
  ambientNodes?.stop();
  ambientNodes = null;
}

function startAmbient() {
  if (!on() || ambientNodes) return;
  const c = ac();
  if (!c || !master) return;
  const src = c.createBufferSource();
  src.buffer = noiseBuffer(c, 4);
  src.loop = true;
  const f = c.createBiquadFilter();
  f.type = 'lowpass';
  f.frequency.value = 420;
  const g = c.createGain();
  g.gain.value = 0.0001;
  g.gain.exponentialRampToValueAtTime(0.03, c.currentTime + 1.5);
  const hum = c.createOscillator();
  hum.frequency.value = 50;
  const hg = c.createGain();
  hg.gain.value = 0.012;
  src.connect(f).connect(g).connect(master);
  hum.connect(hg).connect(master);
  src.start();
  hum.start();
  ambientNodes = {
    stop: () => {
      try {
        g.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + 0.5);
        src.stop(c.currentTime + 0.6);
        hum.stop(c.currentTime + 0.1);
      } catch {
        /* yoksay */
      }
    },
  };
}

/** Saha ortam sesi (rüzgâr + trafo uğultusu) */
export function setAmbient(want: boolean) {
  ambientWanted = want;
  if (want) startAmbient();
  else stopAmbientNodes();
}

// ───────────── arka plan müziği (prosedürel, çevrimdışı) ─────────────
// Am – F – C – G döngüsü, 88 BPM. "tense" modunda hafif ritim eklenir.
const CHORDS = [
  { root: 110, tones: [220, 261.63, 329.63] },
  { root: 87.31, tones: [174.61, 220, 261.63] },
  { root: 130.81, tones: [261.63, 329.63, 392] },
  { root: 98, tones: [196, 246.94, 293.66] },
];
const ARP = [0, 1, 2, 1, 0, 2, 1, 2];
const EIGHTH_BASE = 60 / 88 / 2;
/** alarm fırtınasında tempo yükselir */
const EIGHTH = () => (mood === 'storm' ? 60 / 118 / 2 : EIGHTH_BASE);
let musicTimer: number | null = null;
let musicGain: GainNode | null = null;
let nextNote = 0;
let step = 0;
let mood: 'calm' | 'tense' | 'storm' = 'calm';

function scheduleMusic() {
  const c = ctx;
  if (!c || !musicGain) return;
  while (nextNote < c.currentTime + 0.35) {
    const bar = Math.floor(step / 8) % CHORDS.length;
    const ch = CHORDS[bar];
    const s8 = step % 8;
    const t = nextNote;
    if (s8 === 0) {
      ch.tones.forEach((f, k) => {
        tone(f, EIGHTH() * 8 + 0.6, { type: 'triangle', vol: 0.05, at: t, attack: 0.5, dest: musicGain!, detune: (k - 1) * 6 });
      });
      tone(ch.root, EIGHTH() * 7, { type: 'sine', vol: 0.12, at: t, attack: 0.05, dest: musicGain });
    }
    if (mood !== 'calm' || s8 % 2 === 0) {
      const f = ch.tones[ARP[s8]] * 2;
      tone(f, 0.28, { type: 'triangle', vol: mood === 'storm' ? 0.045 : mood === 'tense' ? 0.035 : 0.028, at: t, attack: 0.005, dest: musicGain });
    }
    if (mood !== 'calm') {
      if (s8 === 0 || s8 === 4 || (mood === 'storm' && s8 % 2 === 0)) tone(120, 0.16, { type: 'sine', vol: 0.16, at: t, to: 45, attack: 0.003, dest: musicGain });
      if (s8 % 2 === 1) {
        const src = c.createBufferSource();
        src.buffer = noiseBuffer(c, 0.06);
        const hp = c.createBiquadFilter();
        hp.type = 'highpass';
        hp.frequency.value = 6000;
        const g = c.createGain();
        g.gain.setValueAtTime(0.05, t);
        g.gain.exponentialRampToValueAtTime(0.0001, t + 0.05);
        src.connect(hp).connect(g).connect(musicGain);
        src.start(t);
        src.stop(t + 0.07);
      }
    }
    nextNote += EIGHTH();
    step++;
  }
}

export function startMusic() {
  if (!on() || musicTimer !== null) return;
  const c = ac();
  if (!c || !master) return;
  musicGain = c.createGain();
  musicGain.gain.value = 0.0001;
  musicGain.gain.exponentialRampToValueAtTime(0.5, c.currentTime + 2);
  musicGain.connect(master);
  nextNote = c.currentTime + 0.1;
  step = 0;
  musicTimer = window.setInterval(scheduleMusic, 120);
}

export function stopMusic() {
  if (musicTimer !== null) window.clearInterval(musicTimer);
  musicTimer = null;
  if (musicGain && ctx) {
    const g = musicGain;
    g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.4);
    setTimeout(() => g.disconnect(), 600);
  }
  musicGain = null;
}

export function setMusicMood(m: 'calm' | 'tense' | 'storm') {
  mood = m;
}

/** Tarayıcı ses kilidini ilk dokunuşta aç */
export function installAudioUnlock() {
  const h = () => {
    if (on()) ac();
    if (ambientWanted) startAmbient();
    startMusic();
  };
  window.addEventListener('pointerdown', h);
  window.addEventListener('keydown', h);
  // genel düğme tıklama sesi
  window.addEventListener(
    'click',
    (e) => {
      const t = e.target as HTMLElement | null;
      if (t && t.closest('button')) sfx.click();
    },
    true
  );
}

let ctx = null;
let master = null;
let sfxBus = null;
let ambBus = null;
let musicBus = null;
let lowpass = null;
let noiseBuf = null;
let muted = false;
let underwaterState = false;
const volumes = { master: 0.85, sfx: 1, ambience: 1, music: 0.65 };
const windGains = [];
const windFilters = [];
let birdTimer = 3;
let cricketTimer = 1;
let gustTimer = 2;
let gustTarget = 1;
let musicTimer = 5;
let musicStep = 0;
let delayNode = null;

export function initAudio() {
  if (ctx) return;
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return;
  ctx = new AC();
  master = ctx.createGain();
  lowpass = ctx.createBiquadFilter();
  lowpass.type = "lowpass";
  lowpass.frequency.value = 20000;
  lowpass.Q.value = 0.6;
  sfxBus = ctx.createGain();
  ambBus = ctx.createGain();
  musicBus = ctx.createGain();
  sfxBus.connect(master);
  ambBus.connect(master);
  musicBus.connect(master);
  master.connect(lowpass);
  lowpass.connect(ctx.destination);

  delayNode = ctx.createDelay(2);
  delayNode.delayTime.value = 0.42;
  const fb = ctx.createGain();
  fb.gain.value = 0.38;
  const fbFilter = ctx.createBiquadFilter();
  fbFilter.type = "lowpass";
  fbFilter.frequency.value = 1600;
  delayNode.connect(fbFilter);
  fbFilter.connect(fb);
  fb.connect(delayNode);
  delayNode.connect(musicBus);
  applyVolumes();

  noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 3, ctx.sampleRate);
  const data = noiseBuf.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;

  startWind();
}

function applyVolumes() {
  if (!ctx) return;
  const v = muted ? 0 : volumes.master * (underwaterState ? 0.55 : 1);
  master.gain.setTargetAtTime(v, ctx.currentTime, 0.1);
  sfxBus.gain.setTargetAtTime(volumes.sfx, ctx.currentTime, 0.1);
  ambBus.gain.setTargetAtTime(volumes.ambience, ctx.currentTime, 0.1);
  musicBus.gain.setTargetAtTime(volumes.music, ctx.currentTime, 0.3);
}

export function setVolumes(patch) {
  Object.assign(volumes, patch);
  applyVolumes();
  return { ...volumes };
}

export function getVolumes() {
  return { ...volumes };
}

export function resumeAudio() {
  if (ctx && ctx.state === "suspended") ctx.resume();
}

export function toggleMute() {
  muted = !muted;
  applyVolumes();
  return muted;
}

export function isMuted() {
  return muted;
}

export function setMute(v) {
  muted = !!v;
  applyVolumes();
  return muted;
}

function noiseSource() {
  const s = ctx.createBufferSource();
  s.buffer = noiseBuf;
  s.loop = true;
  return s;
}

function startWind() {
  const layers = [
    { f: 320, q: 0.7, g: 0.05 },
    { f: 850, q: 1.3, g: 0.028 },
    { f: 1700, q: 2.4, g: 0.014 },
  ];
  for (const l of layers) {
    const src = noiseSource();
    const bp = ctx.createBiquadFilter();
    bp.type = "bandpass";
    bp.frequency.value = l.f;
    bp.Q.value = l.q;
    const g = ctx.createGain();
    g.gain.value = l.g;
    src.connect(bp);
    bp.connect(g);
    g.connect(ambBus);
    src.start();
    windGains.push(g);
    windFilters.push(bp);
  }
}

function burst({ dur = 0.1, type = "bandpass", freq = 1200, q = 1, gain = 0.2, sweepTo = null, delay = 0 }) {
  if (!ctx) return;
  const t = ctx.currentTime + delay;
  const src = noiseSource();
  const f = ctx.createBiquadFilter();
  f.type = type;
  f.frequency.setValueAtTime(freq, t);
  if (sweepTo) f.frequency.exponentialRampToValueAtTime(sweepTo, t + dur);
  f.Q.value = q;
  const g = ctx.createGain();
  g.gain.setValueAtTime(Math.max(0.0001, gain), t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  src.connect(f);
  f.connect(g);
  g.connect(sfxBus);
  src.start(t);
  src.stop(t + dur + 0.05);
}

function thump(freq = 70, dur = 0.18, gain = 0.3, delay = 0) {
  if (!ctx) return;
  const t = ctx.currentTime + delay;
  const o = ctx.createOscillator();
  o.type = "sine";
  o.frequency.setValueAtTime(freq, t);
  o.frequency.exponentialRampToValueAtTime(Math.max(30, freq * 0.45), t + dur);
  const g = ctx.createGain();
  g.gain.setValueAtTime(gain, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g);
  g.connect(sfxBus);
  o.start(t);
  o.stop(t + dur + 0.02);
}

function tone(freq, dur, gain, type = "sine", sweepTo = null, delay = 0) {
  if (!ctx) return;
  const t = ctx.currentTime + delay;
  const o = ctx.createOscillator();
  o.type = type;
  o.frequency.setValueAtTime(freq, t);
  if (sweepTo) o.frequency.exponentialRampToValueAtTime(sweepTo, t + dur);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(gain, t + Math.min(0.03, dur * 0.25));
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g);
  g.connect(sfxBus);
  o.start(t);
  o.stop(t + dur + 0.02);
}

function distGain(d, max = 55) {
  return Math.max(0, 1 - d / max);
}

export function playClick() {
  if (!ctx) return;
  tone(660, 0.09, 0.1, "square", 440);
  burst({ dur: 0.05, freq: 2400, q: 1.5, gain: 0.06 });
}

export function playStep(surface) {
  if (!ctx) return;
  const j = 0.85 + Math.random() * 0.3;
  if (surface === "sand") {
    burst({ dur: 0.1, type: "lowpass", freq: 620 * j, q: 0.5, gain: 0.16 });
    burst({ dur: 0.05, freq: 1500, q: 0.8, gain: 0.05 });
  } else if (surface === "stone") {
    burst({ dur: 0.05, freq: 2600 * j, q: 2.2, gain: 0.14 });
    thump(120 * j, 0.1, 0.12);
  } else if (surface === "snow") {
    burst({ dur: 0.09, freq: 3200 * j, q: 0.7, gain: 0.12 });
    burst({ dur: 0.13, type: "lowpass", freq: 500, q: 0.5, gain: 0.08 });
  } else if (surface === "water") {
    burst({ dur: 0.2, freq: 1700, q: 1.1, gain: 0.16, sweepTo: 650 });
    tone(420 * j, 0.14, 0.05, "sine", 240);
  } else {
    burst({ dur: 0.07, freq: 1250 * j, q: 0.9, gain: 0.15 });
    burst({ dur: 0.09, type: "lowpass", freq: 420, q: 0.6, gain: 0.1 });
  }
}

export function playJump() {
  if (!ctx) return;
  burst({ dur: 0.14, type: "lowpass", freq: 900, q: 0.7, gain: 0.12, sweepTo: 300 });
  thump(95, 0.1, 0.1);
}

export function playLand(strength) {
  if (!ctx) return;
  const s = Math.min(1, strength);
  thump(70, 0.22, 0.16 + s * 0.3);
  burst({ dur: 0.14, type: "lowpass", freq: 700, q: 0.6, gain: 0.1 + s * 0.24 });
}

export function playSplash(strength = 1) {
  if (!ctx) return;
  const g = 0.14 + Math.min(1, strength) * 0.2;
  burst({ dur: 0.55, freq: 1900, q: 0.8, gain: g, sweepTo: 500 });
  burst({ dur: 0.3, type: "lowpass", freq: 400, q: 0.5, gain: g * 0.7, delay: 0.03 });
}

export function playBreath(strong = false) {
  if (!ctx) return;
  const g = strong ? 1 : 0.7;
  // sharp inhale
  burst({ dur: strong ? 0.26 : 0.2, type: "bandpass", freq: 700, q: 0.8, gain: 0.1 * g, sweepTo: 1300 });
  // heavy exhale / sigh
  burst({
    dur: strong ? 0.6 : 0.42,
    type: "lowpass",
    freq: 600,
    q: 0.5,
    gain: 0.18 * g,
    sweepTo: 220,
    delay: strong ? 0.24 : 0.18,
  });
  if (strong) {
    // exhausted groan under the exhale
    tone(140, 0.4, 0.05, "sawtooth", 85, 0.28);
    // second desperate gasp
    burst({ dur: 0.3, type: "bandpass", freq: 650, q: 0.8, gain: 0.11, sweepTo: 1400, delay: 0.85 });
    burst({ dur: 0.5, type: "lowpass", freq: 500, q: 0.5, gain: 0.14, sweepTo: 200, delay: 1.12 });
  }
}

export function playDeerCall(distance) {
  if (!ctx) return;
  const g = distGain(distance) * 0.14;
  if (g < 0.005) return;
  tone(520, 0.22, g, "triangle", 300);
  tone(380, 0.18, g * 0.7, "sawtooth", 260, 0.05);
}

function chirp(t, freq, dur, gain) {
  const o = ctx.createOscillator();
  o.type = "sine";
  o.frequency.setValueAtTime(freq, t);
  o.frequency.exponentialRampToValueAtTime(freq * 1.45, t + dur * 0.45);
  o.frequency.exponentialRampToValueAtTime(freq * 0.85, t + dur);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(gain, t + 0.012);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g);
  g.connect(ambBus);
  o.start(t);
  o.stop(t + dur + 0.02);
}

function playBird() {
  if (!ctx) return;
  const t0 = ctx.currentTime + 0.05;
  const notes = 2 + Math.floor(Math.random() * 4);
  const base = 1900 + Math.random() * 1700;
  const vol = 0.03 + Math.random() * 0.035;
  for (let i = 0; i < notes; i++) {
    chirp(t0 + i * (0.1 + Math.random() * 0.09), base * (0.92 + Math.random() * 0.2), 0.05 + Math.random() * 0.06, vol);
  }
}

function playCricket() {
  if (!ctx) return;
  const f = 4000 + Math.random() * 900;
  const pulses = 2 + Math.floor(Math.random() * 3);
  const t0 = ctx.currentTime + 0.03;
  for (let i = 0; i < pulses; i++) {
    chirp(t0 + i * 0.1, f, 0.035, 0.022);
  }
}

export function updateAmbience(dt, { dayF, underwater, moving, altitude, swimming }) {
  if (!ctx) return;

  gustTimer -= dt;
  if (gustTimer <= 0) {
    gustTimer = 3 + Math.random() * 6;
    gustTarget = 0.55 + Math.random() * 1.1;
  }
  const now = ctx.currentTime;
  const exposure = Math.min(1, Math.max(0, altitude / 100));
  const target = (0.5 + dayF * 0.5) * (moving ? 1.7 : 1) * (1 + exposure * 0.6);
  for (let i = 0; i < windGains.length; i++) {
    const base = [0.05, 0.028, 0.014][i];
    windGains[i].gain.setTargetAtTime(base * target * gustTarget, now, 0.5);
    windFilters[i].frequency.setTargetAtTime([320, 850, 1700][i] * (0.8 + gustTarget * 0.35), now, 1.2);
  }

  lowpass.frequency.setTargetAtTime(underwater ? 520 : 20000, now, 0.25);
  if (underwater !== underwaterState) {
    underwaterState = underwater;
    applyVolumes();
  }

  if (underwater) return;

  birdTimer -= dt;
  if (dayF > 0.45 && birdTimer <= 0) {
    birdTimer = 2.5 + Math.random() * 7;
    playBird();
  }
  cricketTimer -= dt;
  if (dayF < 0.4 && cricketTimer <= 0) {
    cricketTimer = 0.7 + Math.random() * 1.6;
    playCricket();
  }
  if (swimming && moving && Math.random() < dt * 1.4) {
    burst({ dur: 0.3, freq: 1500, q: 1, gain: 0.09, sweepTo: 700 });
  }
}

export function playEat() {
  if (!ctx) return;
  for (let i = 0; i < 3; i++) {
    burst({ dur: 0.07, type: "lowpass", freq: 750, q: 0.7, gain: 0.12, delay: i * 0.13 });
  }
  tone(392, 0.16, 0.05, "triangle", 523, 0.42);
}

export function playChargeReady() {
  if (!ctx) return;
  burst({ dur: 0.12, type: "bandpass", freq: 1400, q: 1.5, gain: 0.06, sweepTo: 2600 });
  tone(520, 0.1, 0.04, "triangle", 780);
}

export function playGrunt() {
  if (!ctx) return;
  burst({ dur: 0.2, type: "bandpass", freq: 620, q: 1.3, gain: 0.07, sweepTo: 340 });
  tone(150, 0.18, 0.05, "sawtooth", 105);
  tone(95, 0.2, 0.04, "triangle", 80, 0.03);
}

export function playSwing(kind = "fist") {
  if (!ctx) return;
  if (kind === "axe" || kind === "club" || kind === "mace") {
    burst({ dur: 0.24, freq: 900, q: 0.7, gain: 0.15, sweepTo: 240 });
    thump(85, 0.1, 0.07);
  } else if (kind === "pick") {
    burst({ dur: 0.2, freq: 1500, q: 1.4, gain: 0.12, sweepTo: 500 });
    burst({ dur: 0.08, freq: 3000, q: 2.5, gain: 0.05, delay: 0.05 });
  } else if (kind === "spear") {
    burst({ dur: 0.13, freq: 2100, q: 2.4, gain: 0.1, sweepTo: 850 });
  } else if (kind === "knife") {
    burst({ dur: 0.1, freq: 2500, q: 1.8, gain: 0.1, sweepTo: 1300 });
  } else if (kind === "sword") {
    burst({ dur: 0.17, freq: 1700, q: 0.9, gain: 0.13, sweepTo: 400 });
    burst({ dur: 0.1, freq: 3300, q: 2.6, gain: 0.05, delay: 0.03 });
  } else {
    burst({ dur: 0.15, type: "lowpass", freq: 750, q: 0.6, gain: 0.09, sweepTo: 280 });
  }
}

export function playHit(kind = "fist") {
  if (!ctx) return;
  if (kind === "sword" || kind === "knife" || kind === "spear") {
    burst({ dur: 0.09, freq: 3200, q: 2.2, gain: 0.13 });
    thump(160, 0.13, 0.2);
    tone(880, 0.1, 0.04, "triangle", 560);
  } else if (kind === "axe") {
    burst({ dur: 0.11, freq: 2400, q: 1.8, gain: 0.15 });
    thump(120, 0.17, 0.26);
  } else if (kind === "club" || kind === "mace") {
    thump(95, 0.24, 0.32);
    burst({ dur: 0.1, type: "lowpass", freq: 550, q: 0.7, gain: 0.16 });
  } else if (kind === "pick") {
    burst({ dur: 0.08, freq: 3600, q: 3, gain: 0.14 });
    thump(140, 0.14, 0.2);
  } else {
    thump(170, 0.12, 0.22);
    burst({ dur: 0.08, freq: 2600, q: 1.6, gain: 0.14 });
  }
}

export function playHurt() {
  if (!ctx) return;
  thump(90, 0.2, 0.3);
  tone(240, 0.28, 0.1, "sawtooth", 130);
}

export function playPickup() {
  if (!ctx) return;
  tone(784, 0.09, 0.07, "triangle");
  tone(1175, 0.12, 0.07, "triangle", null, 0.07);
}

export function playEquip(kind = "") {
  if (!ctx) return;
  if (kind === "metal") {
    burst({ dur: 0.09, freq: 3400, q: 3, gain: 0.1 });
    burst({ dur: 0.16, type: "lowpass", freq: 1100, q: 0.6, gain: 0.13 });
    tone(880, 0.12, 0.05, "triangle", 1174, 0.05);
  } else if (kind === "wood") {
    burst({ dur: 0.12, freq: 700, q: 1.4, gain: 0.14 });
    thump(150, 0.1, 0.15);
    tone(392, 0.1, 0.04, "triangle", 523, 0.06);
  } else if (kind === "leather") {
    burst({ dur: 0.16, freq: 1700, q: 0.9, gain: 0.12, sweepTo: 650 });
    burst({ dur: 0.07, freq: 2800, q: 1.6, gain: 0.06, delay: 0.08 });
  } else {
    burst({ dur: 0.14, type: "lowpass", freq: 900, q: 0.6, gain: 0.14 });
    tone(523, 0.1, 0.05, "triangle", 659, 0.05);
  }
}

export function playDrop() {
  if (!ctx) return;
  thump(110, 0.13, 0.16);
  burst({ dur: 0.09, type: "lowpass", freq: 700, q: 0.6, gain: 0.1 });
}

export function playChop(strong = true) {
  if (!ctx) return;
  if (strong) {
    burst({ dur: 0.08, type: "lowpass", freq: 1600, q: 0.8, gain: 0.24 });
    thump(140, 0.15, 0.26);
    burst({ dur: 0.16, freq: 3000, q: 1.4, gain: 0.1, delay: 0.02 });
    burst({ dur: 0.12, type: "bandpass", freq: 700, q: 1.2, gain: 0.13, delay: 0.05 });
  } else {
    thump(110, 0.12, 0.16);
    burst({ dur: 0.07, type: "lowpass", freq: 900, q: 0.6, gain: 0.1 });
  }
}

export function playMine(strong = true) {
  if (!ctx) return;
  if (strong) {
    burst({ dur: 0.07, freq: 3800, q: 3, gain: 0.17 });
    thump(150, 0.12, 0.22);
    burst({ dur: 0.14, freq: 2200, q: 1.6, gain: 0.1, sweepTo: 900, delay: 0.03 });
    burst({ dur: 0.2, type: "lowpass", freq: 600, q: 0.7, gain: 0.13, delay: 0.06 });
  } else {
    thump(130, 0.1, 0.16);
    burst({ dur: 0.06, freq: 2400, q: 2, gain: 0.09 });
  }
}

export function playTreeFall() {
  if (!ctx) return;
  tone(120, 0.9, 0.09, "sawtooth", 70);
  burst({ dur: 0.7, type: "bandpass", freq: 520, q: 2, gain: 0.07, sweepTo: 260 });
  burst({ dur: 0.5, type: "bandpass", freq: 900, q: 2.4, gain: 0.05, sweepTo: 400, delay: 0.35 });
  thump(65, 0.5, 0.34, 1.15);
  burst({ dur: 0.7, type: "lowpass", freq: 900, q: 0.6, gain: 0.24, sweepTo: 250, delay: 1.15 });
  burst({ dur: 0.45, freq: 2400, q: 1, gain: 0.12, delay: 1.2 });
}

export function playRockBreak() {
  if (!ctx) return;
  thump(80, 0.3, 0.3);
  burst({ dur: 0.5, type: "lowpass", freq: 1200, q: 0.7, gain: 0.24, sweepTo: 300 });
  for (let i = 0; i < 4; i++) {
    burst({ dur: 0.08, freq: 2600 + Math.random() * 1400, q: 3, gain: 0.1, delay: 0.05 + i * 0.07 });
  }
}

export function playOpen(opening = true) {
  if (!ctx) return;
  if (opening) {
    burst({ dur: 0.22, freq: 500, q: 1.2, gain: 0.1, sweepTo: 1500 });
    tone(523, 0.12, 0.05, "triangle", 784, 0.06);
  } else {
    burst({ dur: 0.2, freq: 1400, q: 1.2, gain: 0.09, sweepTo: 450 });
    tone(659, 0.1, 0.04, "triangle", 440, 0.04);
  }
}

export function playGrowl(distance = 10) {
  if (!ctx) return;
  const g = distGain(distance, 45) * 0.2;
  if (g < 0.005) return;
  tone(92, 0.7, g, "sawtooth", 62);
  burst({ dur: 0.6, type: "lowpass", freq: 420, q: 1.4, gain: g * 0.7 });
}

export function playWolfAttack() {
  if (!ctx) return;
  tone(320, 0.16, 0.16, "sawtooth", 160);
  burst({ dur: 0.16, freq: 1800, q: 1.1, gain: 0.16, sweepTo: 700 });
}

export function playDeath() {
  if (!ctx) return;
  tone(392, 0.5, 0.12, "triangle", 196);
  tone(262, 0.9, 0.1, "triangle", 131, 0.3);
  burst({ dur: 0.7, type: "lowpass", freq: 500, q: 0.6, gain: 0.1, sweepTo: 120 });
}

export function playCraft() {
  if (!ctx) return;
  burst({ dur: 0.1, freq: 1800, q: 2.5, gain: 0.12 });
  burst({ dur: 0.12, freq: 900, q: 2, gain: 0.1, delay: 0.1 });
  tone(659, 0.14, 0.06, "triangle", 880, 0.18);
}

function midi(n) {
  return 440 * Math.pow(2, (n - 69) / 12);
}

const SCALE_DAY = [0, 2, 4, 7, 9];
const SCALE_NIGHT = [0, 3, 5, 7, 10];
let bellTimer = 4;

function playPad(root, semis, bright) {
  const t = ctx.currentTime;
  for (const s of semis) {
    const o = ctx.createOscillator();
    o.type = bright ? "triangle" : "sine";
    o.frequency.value = midi(root + s);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.05, t + 2.6);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 7.5);
    const lp = ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.value = bright ? 1400 : 800;
    o.connect(lp);
    lp.connect(g);
    g.connect(musicBus);
    g.connect(delayNode);
    o.start(t);
    o.stop(t + 7.7);
  }
}

function playBell(note) {
  const t = ctx.currentTime + 0.02;
  const o = ctx.createOscillator();
  o.type = "sine";
  o.frequency.value = midi(note);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(0.045, t + 0.02);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 1.8);
  o.connect(g);
  g.connect(musicBus);
  g.connect(delayNode);
  o.start(t);
  o.stop(t + 2);
}

export function updateMusic(dt, dayF) {
  if (!ctx || volumes.music <= 0.001) return;
  musicTimer -= dt;
  bellTimer -= dt;
  if (musicTimer <= 0) {
    musicTimer = 8 + Math.random() * 6;
    const scale = dayF > 0.5 ? SCALE_DAY : SCALE_NIGHT;
    const root = 40 + scale[Math.floor(Math.random() * scale.length)] + (Math.random() < 0.4 ? 5 : 0);
    const chord = [0, scale[2], scale[4], 12];
    playPad(root, chord, dayF > 0.5);
    musicStep++;
  }
  if (bellTimer <= 0) {
    bellTimer = 3 + Math.random() * 7;
    const scale = dayF > 0.5 ? SCALE_DAY : SCALE_NIGHT;
    playBell(64 + scale[Math.floor(Math.random() * scale.length)] + (Math.random() < 0.5 ? 12 : 0));
  }
}

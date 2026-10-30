// Golf Improvement App — Apex sound: strikes, landings, hazards, putts and jungle ambience.
// Classic script: shares globals with the other files; load order is set in golf-improvement-app.html.

// ════════════════════════════════════════════════════════════
// APEX AUDIO
// Every sound is synthesized with Web Audio (no files to download): short
// filtered noise bursts and tuned tones shaped by fast envelopes. The jungle
// bed (insects, leaves, distant birds, the odd howler monkey) runs only while
// an Apex round is on screen. Muting is remembered in prefs.
// ════════════════════════════════════════════════════════════
const apexAudio = { ctx: null, master: null, noise: null, amb: null, ambTimer: null };

function apexSoundOn() { return getPrefs().apexSound !== false; }
function apexToggleSound() {
  setPref('apexSound', !apexSoundOn());
  if (!apexSoundOn()) apexAmbience(false); else { apexAudioInit(); apexAmbience(true); }
  renderApex();
}

// Audio can only start after a tap or click, so this is called from user actions
function apexAudioInit() {
  if (!apexSoundOn()) return null;
  try {
    if (!apexAudio.ctx) {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      const master = ctx.createGain(); master.gain.value = 0.8; master.connect(ctx.destination);
      const buf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate), d = buf.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
      Object.assign(apexAudio, { ctx, master, noise: buf });
    }
    if (apexAudio.ctx.state === 'suspended') apexAudio.ctx.resume();
    return apexAudio.ctx;
  } catch { return null; }
}

// ── Building blocks ────────────────────────────────────────────
// A filtered noise burst: type = lowpass/highpass/bandpass
function apexNoise(at, dur, { type = 'bandpass', freq = 2000, q = 1, gain = 0.5, attack = 0.002, sweepTo = null, dest } = {}) {
  const { ctx, noise } = apexAudio, src = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain();
  src.buffer = noise; src.loop = true;
  f.type = type; f.frequency.setValueAtTime(freq, at); f.Q.value = q;
  if (sweepTo) f.frequency.exponentialRampToValueAtTime(sweepTo, at + dur);
  g.gain.setValueAtTime(0.0001, at); g.gain.exponentialRampToValueAtTime(gain, at + attack); g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
  src.connect(f); f.connect(g); g.connect(dest || apexAudio.master);
  src.start(at, Math.random() * 1.5); src.stop(at + dur + 0.05);
}
// A tone with a pitch glide and a quick decay
function apexTone(at, dur, { freq = 440, to = null, wave = 'sine', gain = 0.3, attack = 0.003, dest } = {}) {
  const { ctx } = apexAudio, o = ctx.createOscillator(), g = ctx.createGain();
  o.type = wave; o.frequency.setValueAtTime(freq, at);
  if (to) o.frequency.exponentialRampToValueAtTime(to, at + dur);
  g.gain.setValueAtTime(0.0001, at); g.gain.exponentialRampToValueAtTime(gain, at + attack); g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
  o.connect(g); g.connect(dest || apexAudio.master);
  o.start(at); o.stop(at + dur + 0.05);
}

// ── Sounds ─────────────────────────────────────────────────────
// opts.club, opts.power (0–1), opts.type (shot type), opts.surface, opts.n (putts)
function apexSound(name, delayMs = 0, opts = {}) {
  const ctx = apexAudioInit();
  if (!ctx) return;
  const at = ctx.currentTime + delayMs / 1000;
  const pw = opts.power ?? 1;
  switch (name) {
    case 'strike': {
      const club = opts.club || '7-Iron', wood = /Driver|Wood|Hybrid/.test(club), wedge = /PW|GW|SW|LW/.test(club);
      const v = (opts.type === 'punch' ? 0.75 : 1) * (0.55 + 0.45 * pw);
      if (wood) { // the hollow "tock" of a metal head, a bright ping and a body thump
        apexNoise(at, 0.07, { freq: 3200, q: 0.8, gain: 0.55 * v });
        apexTone(at, 0.16, { freq: 1750, to: 1150, wave: 'triangle', gain: 0.16 * v });
        apexTone(at, 0.06, { freq: 140, to: 70, gain: 0.45 * v });
      } else { // irons: a crisp, compressed click; wedges a little softer
        apexNoise(at, wedge ? 0.035 : 0.028, { type: 'highpass', freq: 2400, gain: (wedge ? 0.35 : 0.5) * v });
        apexTone(at, 0.09, { freq: wedge ? 1100 : 900, to: 650, gain: 0.18 * v });
        apexTone(at, 0.05, { freq: 180, to: 90, gain: 0.3 * v });
      }
      apexNoise(at + 0.01, 0.12, { type: 'lowpass', freq: 700, gain: 0.12 * v }); // turf
      break;
    }
    case 'land': {
      const s = opts.surface;
      if (s === 'sand') apexNoise(at, 0.32, { freq: 1300, q: 0.7, gain: 0.35, attack: 0.012, sweepTo: 600 });
      else if (s === 'green') { apexTone(at, 0.09, { freq: 170, to: 90, gain: 0.35 }); apexNoise(at, 0.05, { type: 'lowpass', freq: 900, gain: 0.12 }); }
      else { apexTone(at, 0.12, { freq: 110, to: 55, gain: s === 'rough' ? 0.3 : 0.42 }); apexNoise(at, 0.09, { type: 'lowpass', freq: s === 'rough' ? 900 : 500, gain: s === 'rough' ? 0.22 : 0.15 }); }
      break;
    }
    case 'splash':
      apexNoise(at, 0.5, { type: 'lowpass', freq: 4000, gain: 0.5, attack: 0.005, sweepTo: 500 });
      apexNoise(at + 0.04, 0.25, { freq: 900, q: 2, gain: 0.25 });
      for (let i = 0; i < 6; i++) apexTone(at + 0.12 + Math.random() * 0.45, 0.05, { freq: 450 + Math.random() * 600, to: 900 + Math.random() * 500, gain: 0.07 });
      break;
    case 'leaves': // into the trees or a canopy: a rustle and a knock off a branch
      apexNoise(at, 0.65, { freq: 4200, q: 0.6, gain: 0.32, attack: 0.02, sweepTo: 2500 });
      apexTone(at + 0.05, 0.07, { freq: 320, to: 220, gain: 0.25 });
      apexTone(at + 0.32, 0.06, { freq: 260, to: 200, gain: 0.14 });
      break;
    case 'stone': // off the ruins
      apexTone(at, 0.07, { freq: 1150, to: 900, wave: 'triangle', gain: 0.3 });
      apexTone(at, 0.05, { freq: 1750, wave: 'square', gain: 0.06 });
      apexNoise(at, 0.03, { type: 'highpass', freq: 3000, gain: 0.3 });
      apexTone(at + 0.22, 0.05, { freq: 980, to: 800, wave: 'triangle', gain: 0.12 });
      break;
    case 'gorge': // clattering down the rock
      [0, 0.18, 0.33, 0.45, 0.55].forEach((d, i) => apexTone(at + d, 0.05, { freq: 900 - i * 110, to: 600 - i * 80, wave: 'triangle', gain: 0.22 - i * 0.035 }));
      break;
    case 'putts': // each putt's tap, then the ball rattling into the cup
      for (let i = 0; i < (opts.n || 1); i++) {
        const t = at + i * 0.9;
        apexTone(t, 0.03, { freq: 1500, to: 1100, gain: 0.16 }); apexNoise(t, 0.02, { type: 'highpass', freq: 2500, gain: 0.12 });
      }
      { const t = at + ((opts.n || 1) - 1) * 0.9 + 0.75; [0, 0.07, 0.12].forEach((d, i) => apexTone(t + d, 0.05, { freq: 720 - i * 60, wave: 'triangle', gain: 0.22 - i * 0.05 })); }
      break;
    case 'cup':
      [0, 0.07, 0.12].forEach((d, i) => apexTone(at + d, 0.05, { freq: 720 - i * 60, wave: 'triangle', gain: 0.22 - i * 0.05 }));
      break;
    case 'chime': { // birdie (1), eagle (2), albatross / ace (3): a bright rising arpeggio
      const notes = [523.25, 659.25, 783.99, 1046.5, 1318.5].slice(0, 2 + (opts.level || 1));
      notes.forEach((f, i) => apexTone(at + i * 0.11, 0.7, { freq: f, wave: 'triangle', gain: 0.14, attack: 0.01 }));
      break;
    }
  }
}

// The sounds for one shot, timed to the animation (also used by replays)
function apexShotSounds(res, club, power, type) {
  if (!apexSoundOn()) return;
  const h = apexHole(), fly = apexFlightMs(res), all = apexAnimDuration(res);
  apexSound('strike', 0, { club, power, type });
  const end = res.world[res.world.length - 1].p, hit = res.events.join(' ');
  if (/canopy|trees/i.test(hit)) apexSound('leaves', fly);
  else if (/ruins/i.test(hit)) apexSound('stone', fly);
  else {
    const land = ceSurfaceAt(h, end);
    if (land === 'water') apexSound('splash', fly);
    else if (land === 'ravine') apexSound('gorge', fly);
    else if (land !== 'ob') apexSound('land', fly, { surface: land });
    // rolled into trouble after landing
    if (land !== 'water' && /water/i.test(hit)) apexSound('splash', all - 150);
    if (land !== 'ravine' && /ravine/i.test(hit)) apexSound('gorge', all - 150);
  }
  if (res.holed) apexSound('cup', all);
}

// ── Jungle ambience ────────────────────────────────────────────
function apexAmbienceWanted() {
  const page = document.getElementById('page-apex');
  return apexSoundOn() && !!apex && !!page && page.classList.contains('active') && !document.hidden;
}
function apexAmbience(on) {
  if (on && !apexAudio.amb && apexAmbienceWanted() && apexAudioInit()) {
    const { ctx } = apexAudio, bus = ctx.createGain();
    bus.gain.setValueAtTime(0.0001, ctx.currentTime); bus.gain.exponentialRampToValueAtTime(1, ctx.currentTime + 2);
    bus.connect(apexAudio.master);
    const loop = (type, freq, q, gain, lfoHz, lfoDepth) => {
      const src = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain(), lfo = ctx.createOscillator(), lg = ctx.createGain();
      src.buffer = apexAudio.noise; src.loop = true; f.type = type; f.frequency.value = freq; f.Q.value = q; g.gain.value = gain;
      lfo.frequency.value = lfoHz; lg.gain.value = lfoDepth; lfo.connect(lg); lg.connect(g.gain);
      src.connect(f); f.connect(g); g.connect(bus); src.start(); lfo.start();
      return [src, lfo];
    };
    const nodes = [...loop('bandpass', 6800, 6, 0.018, 11, 0.012),   // insects, trilling
                   ...loop('lowpass', 450, 0.5, 0.05, 0.13, 0.035)]; // leaves in a slow breeze
    apexAudio.amb = { bus, nodes };
    const calls = () => {
      if (!apexAudio.amb) return;
      const t = ctx.currentTime + Math.random() * 0.5;
      if (Math.random() < 0.08) { // a distant howler monkey
        const o = ctx.createOscillator(), f = ctx.createBiquadFilter(), g = ctx.createGain(), trem = ctx.createOscillator(), tg = ctx.createGain();
        o.type = 'sawtooth'; o.frequency.setValueAtTime(85, t); o.frequency.linearRampToValueAtTime(120, t + 0.6); o.frequency.linearRampToValueAtTime(80, t + 1.6);
        f.type = 'lowpass'; f.frequency.value = 420; trem.frequency.value = 7; tg.gain.value = 0.02;
        g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.04, t + 0.3); g.gain.exponentialRampToValueAtTime(0.0001, t + 1.7);
        trem.connect(tg); tg.connect(g.gain); o.connect(f); f.connect(g); g.connect(bus);
        o.start(t); trem.start(t); o.stop(t + 1.8); trem.stop(t + 1.8);
      } else { // a bird: a few quick upward chirps
        const base = 2200 + Math.random() * 1600, n = 2 + (Math.random() * 3 | 0);
        for (let i = 0; i < n; i++) apexTone(t + i * 0.13, 0.08, { freq: base, to: base * 1.35, gain: 0.025, dest: bus });
      }
      apexAudio.ambTimer = setTimeout(calls, 2500 + Math.random() * 6000);
    };
    apexAudio.ambTimer = setTimeout(calls, 1500);
  } else if (!on && apexAudio.amb) {
    const { bus, nodes } = apexAudio.amb, t = apexAudio.ctx.currentTime;
    apexAudio.amb = null; clearTimeout(apexAudio.ambTimer);
    bus.gain.cancelScheduledValues(t); bus.gain.setValueAtTime(bus.gain.value, t); bus.gain.exponentialRampToValueAtTime(0.0001, t + 0.8);
    setTimeout(() => { nodes.forEach(n => { try { n.stop(); } catch {} }); bus.disconnect(); }, 900);
  }
}
// Stop the jungle when leaving the Apex screen or the round (checked lazily)
setInterval(() => { if (apexAudio.amb && !apexAmbienceWanted()) apexAmbience(false); }, 1500);
document.addEventListener('visibilitychange', () => { if (document.hidden) apexAmbience(false); });

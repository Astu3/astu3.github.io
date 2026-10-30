'use strict';
// ═══════════════════════════════════════════════════════════════════════════
// Stueber Road Trip Showdown — app logic
// Content banks (trivia, dares, hunt items, …) live in data.js.
// ═══════════════════════════════════════════════════════════════════════════

// ── Utils ──────────────────────────────────────────────────────────────────
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));
const pick = a => a[Math.floor(Math.random() * a.length)];
const shuffle = arr => { const a = [...arr]; for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const fmtDur = ms => { const m = Math.floor(ms / 60000); return m < 60 ? `${m}m` : `${Math.floor(m / 60)}h ${m % 60}m`; };

// ── Constants ──────────────────────────────────────────────────────────────
const STORE_KEY = 'stueber_showdown_v4';
const AVATARS = ['🦊','🐼','🦁','🐸','🐯','🦄','🐧','🦉','🐨','🐙','🦖','🐶','🐱','🐵','🦈','🐝','🐢','🦝','🐲','🤖','👽','🦸','🧙','🤠'];
const COLORS = ['#ff7a3d','#60a5fa','#4ade80','#f472b6','#facc15','#a78bfa','#2dd4bf','#f87171'];
const TARGETS = [0, 500, 1000, 2000, 5000];
const RANDOM_MIX = '🎲 Random Mix';

const SOURCES = {
  trivia: { label:'Trivia',  color:'#7c8cff' },
  duel:   { label:'Duel',    color:'#ff6b8b' },
  plates: { label:'Plates',  color:'#2dd4bf' },
  hunt:   { label:'Hunt',    color:'#8bd450' },
  bingo:  { label:'Bingo',   color:'#ffd25e' },
  dares:  { label:'Dares',   color:'#ff9a5a' },
  wyr:    { label:'WYR',     color:'#c084fc' },
  story:  { label:'Story',   color:'#60a5fa' },
  wheel:  { label:'Wheel',   color:'#f472b6' },
  cards:  { label:'Cards',   color:'#a78bfa' },
};

const CARDS = {
  steal:    { icon:'💰', name:'Heist',     desc:'Steal 50 pts from a rival',            target:true  },
  double:   { icon:'🌟', name:'Double Up', desc:'Your next score counts double',         target:false },
  sabotage: { icon:'😈', name:'Sabotage',  desc:'Force a rival to do a dare',            target:true  },
  shield:   { icon:'🛡️', name:'Shield',    desc:'Blocks the next Heist or Sabotage',     target:false },
};
const CARD_TYPES = Object.keys(CARDS);
const HAND_LIMIT = 5;

const WHEEL = [
  { id:'bonus',  emoji:'🎁', label:'+75',     color:'#16a34a' },
  { id:'dare',   emoji:'🎭', label:'Dare',    color:'#ea580c' },
  { id:'trivia', emoji:'🧠', label:'Trivia',  color:'#4f46e5' },
  { id:'joke',   emoji:'😄', label:'Joke',    color:'#ca8a04' },
  { id:'all',    emoji:'💰', label:'All +25', color:'#9333ea' },
  { id:'card',   emoji:'🃏', label:'Card',    color:'#db2777' },
  { id:'wyr',    emoji:'🤔', label:'WYR',     color:'#0891b2' },
  { id:'duel',   emoji:'⚔️', label:'Duel',    color:'#dc2626' },
];

const STATE_NAMES = Object.keys(STATE_MAP);
const plateValue = name => PLATE_VALUE[name] || 10;
const triviaCategories = [RANDOM_MIX, ...new Set(triviaBank.map(q => q.cat))];
const HUNT_SIZE = { common:4, uncommon:4, rare:3, legendary:1 };
const TIER_ORDER = ['common','uncommon','rare','legendary'];
const huntById = Object.fromEntries(HUNT_POOL.map(h => [h.id, h]));

// ═══════════════════════════════════════════════════════════════════════════
// STATE
// ═══════════════════════════════════════════════════════════════════════════
function freshState() {
  return {
    v: 4,
    players: [], meta: {}, scores: {}, stats: {},
    plates: {}, plateExtras: [], plateMilestones: [],
    hunt: null, huntEnv: null, huntRounds: 0,
    bingo: {},
    usedDares: [], usedWYR: [], usedTrivia: [],
    stories: [], story: null,
    cards: {}, buffs: {},
    counters: {},
    settings: { muted:false, al:true, voice:null, rate:1, pitch:1, winTarget:1000, category:RANDOM_MIX },
    gameWon: null, tripStart: null,
  };
}
let S = freshState();

function save() { try { localStorage.setItem(STORE_KEY, JSON.stringify(S)); } catch (e) {} }

function load() {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (raw) {
      const d = JSON.parse(raw);
      S = Object.assign(freshState(), d);
      S.settings = Object.assign(freshState().settings, d.settings || {});
      return;
    }
    const old = localStorage.getItem('roadtrip_v3');
    if (old) migrateV3(JSON.parse(old));
  } catch (e) { S = freshState(); }
}

// Carry a v3 save (single-file version) forward so nobody loses their trip.
function migrateV3(d) {
  const s = freshState();
  s.players = (d.players || []).filter(Boolean);
  s.players.forEach((p, i) => { s.meta[p] = { avatar: AVATARS[i % AVATARS.length], color: COLORS[i % COLORS.length] }; });
  s.scores = d.scores || {};
  for (const [p, st] of Object.entries(d.playerStats || {})) {
    s.stats[p] = {};
    for (const [k, v] of Object.entries(st)) if (!k.endsWith('_count')) s.stats[p][k] = v;
  }
  for (const [st, v] of Object.entries(d.platesFound || {})) if (v && STATE_MAP[st]) s.plates[st] = { p: null, t: 0 };
  for (const p of s.players) {
    if (d.bingoCards?.[p]) {
      const marked = d.bingoMarked?.[p] || Array(25).fill(false);
      marked[12] = true;
      s.bingo[p] = { card: d.bingoCards[p], marked, lines: d.bingoWon?.[p] ? 1 : 0, blackout: false };
    }
  }
  s.usedDares = d.usedDares || [];
  s.usedWYR = d.usedWYR || [];
  s.stories = (d.stories || []).map(st => ({ date: st.date, sentences: (st.sentences || []).map(x => ({ p: x.player, text: x.text })) }));
  if (d.currentStory) s.story = { date: d.currentStory.date, turn: d.currentStoryTurn || 0, sentences: (d.currentStory.sentences || []).map(x => ({ p: x.player, text: x.text })) };
  s.cards = d.cards || {};
  for (const p of s.players) {
    if (d.pendingDouble?.[p] || d.pendingShield?.[p]) s.buffs[p] = { double: !!d.pendingDouble?.[p], shield: !!d.pendingShield?.[p] };
  }
  s.settings = {
    muted: !!d.muted, al: d.alEnabled !== false, voice: d.alVoiceName || null,
    rate: d.alRate ?? 1, pitch: d.alPitch ?? 1,
    winTarget: typeof d.winTarget === 'number' ? d.winTarget : 1000,
    category: d.selectedCategory || RANDOM_MIX,
  };
  s.gameWon = d.gameWon || null;
  s.tripStart = d.tripStartTime || null;
  S = s;
  save();
}

const count = (key, n = 1) => { S.counters[key] = (S.counters[key] || 0) + n; };

// ── Players ────────────────────────────────────────────────────────────────
const avatar = p => S.meta[p]?.avatar || '🙂';
const color = p => S.meta[p]?.color || '#64748b';
const avHTML = (p, cls = '') => `<span class="av ${cls}" style="--pc:${color(p)}">${avatar(p)}</span>`;
const isPlayer = p => !!p && S.players.includes(p);
const ranked = () => [...S.players].sort((a, b) => (S.scores[b] || 0) - (S.scores[a] || 0));
function soleLeader() {
  const r = ranked();
  if (!r.length) return null;
  if (r.length > 1 && (S.scores[r[0]] || 0) === (S.scores[r[1]] || 0)) return null;
  return (S.scores[r[0]] || 0) > 0 ? r[0] : null;
}

// ═══════════════════════════════════════════════════════════════════════════
// AUDIO + HAPTICS
// ═══════════════════════════════════════════════════════════════════════════
let audioCtx = null;
function ctx() {
  if (!audioCtx && (window.AudioContext || window.webkitAudioContext)) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  if (audioCtx && audioCtx.state === 'suspended') audioCtx.resume().catch(() => {});
  return audioCtx;
}
function tone(freq, type, dur, gain, delay = 0, slideTo) {
  if (S.settings.muted) return;
  const c = ctx(); if (!c) return;
  try {
    const o = c.createOscillator(), g = c.createGain();
    o.type = type; o.connect(g); g.connect(c.destination);
    const t = c.currentTime + delay;
    o.frequency.setValueAtTime(freq, t);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.start(t); o.stop(t + dur + 0.02);
  } catch (e) {}
}
const sfx = {
  ding:    () => { tone(660,'sine',.15,.28); tone(990,'sine',.28,.22,.09); },
  buzz:    () => { tone(200,'sawtooth',.12,.18); tone(140,'sawtooth',.22,.16,.1); },
  points:  () => [523,659,784].forEach((f,i) => tone(f,'sine',.14,.18,i*.06)),
  combo:   () => [523,659,784,1047].forEach((f,i) => tone(f,'triangle',.18,.22,i*.06)),
  fanfare: () => [523,659,784,1047,1319].forEach((f,i) => tone(f,'triangle',.32,.26,i*.1)),
  stamp:   () => { tone(180,'square',.06,.16); tone(90,'sine',.12,.2,.02); },
  tick:    () => tone(1400,'square',.025,.06),
  card:    () => { tone(880,'triangle',.08,.18); tone(1320,'triangle',.16,.16,.07); },
  undo:    () => tone(500,'sine',.18,.15,0,300),
  whoosh:  () => tone(300,'sawtooth',.35,.06,0,1200),
  vote:    () => tone(720,'square',.06,.1),
};
const vibe = pattern => { if (!S.settings.muted && navigator.vibrate) { try { navigator.vibrate(pattern); } catch (e) {} } };

// ═══════════════════════════════════════════════════════════════════════════
// AL — the AI host (Web Speech API)
// ═══════════════════════════════════════════════════════════════════════════
let voices = [];
function loadVoices() { voices = (window.speechSynthesis && speechSynthesis.getVoices()) || []; }
if (window.speechSynthesis) {
  loadVoices();
  speechSynthesis.addEventListener?.('voiceschanged', () => { loadVoices(); if (nav.cur === 'voice') render(); });
}
function alVoice() {
  if (!voices.length) loadVoices();
  if (S.settings.voice) { const v = voices.find(v => v.name === S.settings.voice); if (v) return v; }
  const tiers = [
    v => /^en/i.test(v.lang) && /Natural|Neural|Online|Premium|Enhanced/i.test(v.name),
    v => /^en/i.test(v.lang) && /Microsoft.*(Aria|Guy|Davis|Tony|Jenny|Brian)/i.test(v.name),
    v => /^en/i.test(v.lang) && /Google US English|Google UK English/i.test(v.name),
    v => /^en/i.test(v.lang) && /Samantha|Alex|Daniel|Karen|Moira|Tessa/i.test(v.name),
    v => /^en[-_]US/i.test(v.lang),
    v => /^en/i.test(v.lang),
  ];
  for (const t of tiers) { const v = voices.find(t); if (v) return v; }
  return voices[0];
}

let bubbleTimer = null, alLast = 0;
function bubble(text, ms) {
  const b = $('#al-bubble');
  $('#al-text').textContent = text;
  b.classList.add('show');
  clearTimeout(bubbleTimer);
  bubbleTimer = setTimeout(() => b.classList.remove('show'), ms || clamp(text.length * 75, 2200, 9000));
}
// Al speaks (when enabled) and the line always shows in the bubble.
// Pass echo:false for text that's already on screen (questions, dares) so the
// bubble only appears when Al actually reads it out.
function say(text, { force = false, rate, voice, echo = true } = {}) {
  if (!text) return;
  const canSpeak = S.settings.al && !S.settings.muted && !!window.speechSynthesis;
  if (!canSpeak && !echo) return;
  const now = Date.now();
  if (!force && now - alLast < 1500) return;
  alLast = now;
  bubble(text);
  if (!canSpeak) return;
  try {
    speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.rate = rate ?? S.settings.rate;
    u.pitch = S.settings.pitch;
    const v = voice || alVoice();
    if (v) u.voice = v;
    speechSynthesis.speak(u);
  } catch (e) {}
}
// Short status line in the bubble without speech (lead changes, card drops).
const announce = (text, ms) => bubble(text, ms);
function alStop() { try { window.speechSynthesis && speechSynthesis.cancel(); } catch (e) {} }
const quip = (type, opts) => QUIPS[type] && say(pick(QUIPS[type]), opts);

// ═══════════════════════════════════════════════════════════════════════════
// UI PRIMITIVES: toast, floating points, confetti, bottom sheets
// ═══════════════════════════════════════════════════════════════════════════
let lastTap = { x: innerWidth / 2, y: innerHeight / 2 };
document.addEventListener('pointerdown', e => { lastTap = { x: e.clientX, y: e.clientY }; }, true);

let toastTimer = null;
function toast(msg, { action, onAction, ms = 2200 } = {}) {
  const t = $('#toast');
  t.innerHTML = `<span>${esc(msg)}</span>${action ? `<button class="toast-act">${esc(action)}</button>` : ''}`;
  if (action) t.querySelector('.toast-act').onclick = () => { t.classList.remove('show'); onAction(); };
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), action ? Math.max(ms, 8000) : ms);
}

function floatPts(pts, at = lastTap, c) {
  const el = document.createElement('div');
  el.className = 'float-pts' + (pts < 0 ? ' neg' : '');
  el.textContent = (pts > 0 ? '+' : '') + pts;
  el.style.left = clamp(at.x, 40, innerWidth - 40) + 'px';
  el.style.top = clamp(at.y, 60, innerHeight - 40) + 'px';
  if (c && pts > 0) el.style.color = c;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 1200);
}

function confetti(origin) {
  const canvas = $('#confetti-canvas');
  const g = canvas.getContext('2d');
  const dpr = Math.min(2, devicePixelRatio || 1);
  canvas.width = innerWidth * dpr; canvas.height = innerHeight * dpr;
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  canvas.style.display = 'block';
  const colors = ['#ff7a3d','#ffc845','#4ade80','#60a5fa','#f472b6','#a78bfa','#2dd4bf'];
  const burst = !!origin;
  const parts = Array.from({ length: burst ? 50 : 130 }, () => {
    const a = Math.random() * Math.PI * 2, sp = Math.random() * 7 + 3;
    return burst
      ? { x: origin.x, y: origin.y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 3, r: Math.random() * 6 + 4 }
      : { x: Math.random() * innerWidth, y: -20 - Math.random() * innerHeight * .4, vx: (Math.random() - .5) * 3, vy: Math.random() * 3 + 2, r: Math.random() * 7 + 4 };
  }).map(p => Object.assign(p, { c: pick(colors), rot: Math.random() * 6, vr: (Math.random() - .5) * .3, sq: Math.random() > .5 }));
  let f = 0; const max = burst ? 80 : 170;
  (function frame() {
    g.clearRect(0, 0, innerWidth, innerHeight);
    g.globalAlpha = Math.max(0, 1 - f / max);
    for (const p of parts) {
      p.vy += .18; p.vx *= .99; p.x += p.vx; p.y += p.vy; p.rot += p.vr;
      g.fillStyle = p.c;
      g.save(); g.translate(p.x, p.y); g.rotate(p.rot);
      if (p.sq) g.fillRect(-p.r / 2, -p.r / 4, p.r, p.r / 2); else { g.beginPath(); g.arc(0, 0, p.r / 2.4, 0, 7); g.fill(); }
      g.restore();
    }
    if (++f < max) requestAnimationFrame(frame); else { canvas.style.display = 'none'; g.clearRect(0, 0, innerWidth, innerHeight); }
  })();
}

let sheetResolve = null;
function openSheet(html) {
  closeSheet(null);
  $('#toast').classList.remove('show');
  const bd = document.createElement('div');
  bd.className = 'sheet-backdrop'; bd.id = 'sheet';
  bd.innerHTML = `<div class="sheet" role="dialog" aria-modal="true"><div class="grabber"></div>${html}</div>`;
  bd.addEventListener('click', e => { if (e.target === bd) closeSheet(null); });
  document.body.appendChild(bd);
  return new Promise(res => { sheetResolve = res; });
}
function closeSheet(val) {
  $('#sheet')?.remove();
  const r = sheetResolve; sheetResolve = null;
  if (r) r(val);
}
const sheetHead = ({ icon, iconHTML, title, sub }) =>
  `${iconHTML || (icon ? `<div class="sheet-icon">${icon}</div>` : '')}<h3>${title}</h3>${sub ? `<div class="sheet-sub">${sub}</div>` : ''}`;

// Resolves to a player name, { extra: id } for an extra button, or null on cancel.
async function pickPlayer({ icon, iconHTML, title, sub, exclude = [], extra = '' }) {
  const list = S.players.filter(p => !exclude.includes(p));
  const v = await openSheet(`${sheetHead({ icon, iconHTML, title, sub })}
    <div class="sheet-body">
      <div class="pick-grid">${list.map(p => `
        <button class="pick-btn" style="--pc:${color(p)}" data-act="sheet" data-val="p:${S.players.indexOf(p)}">
          ${avHTML(p, 'lg')}<span>${esc(p)}</span><span class="pick-score">${S.scores[p] || 0} pts</span>
        </button>`).join('')}
      </div>
      ${extra ? `<div class="center mt">${extra}</div>` : ''}
      <button class="btn btn-ghost mt" data-act="sheet" data-val="">Cancel</button>
    </div>`);
  if (!v) return null;
  if (v.startsWith('p:')) return S.players[+v.slice(2)] || null;
  if (v.startsWith('x:')) return { extra: v.slice(2) };
  return null;
}

async function ask({ icon, iconHTML, title, sub, ok = 'Yes', cancel = 'Cancel', danger = false }) {
  const v = await openSheet(`${sheetHead({ icon, iconHTML, title, sub })}
    <div class="sheet-body">
      <button class="btn ${danger ? 'btn-bad' : 'btn-go'}" data-act="sheet" data-val="1">${ok}</button>
      <button class="btn btn-ghost" data-act="sheet" data-val="">${cancel}</button>
    </div>`);
  return v === '1';
}

// ═══════════════════════════════════════════════════════════════════════════
// ROUTER — every timer goes through later()/every() so leaving a screen
// cancels it (no more ghost timers dragging you back into a quit game).
// ═══════════════════════════════════════════════════════════════════════════
const nav = { cur: null, args: [], token: 0, timers: new Set(), intervals: new Set() };
function later(fn, ms) {
  const tok = nav.token;
  const id = setTimeout(() => { nav.timers.delete(id); if (tok === nav.token) fn(); }, ms);
  nav.timers.add(id);
  return id;
}
function every(fn, ms) { const id = setInterval(fn, ms); nav.intervals.add(id); return id; }
function stopEvery(id) { clearInterval(id); nav.intervals.delete(id); }

function go(id, ...args) {
  closeSheet(null);
  nav.token++;
  nav.timers.forEach(clearTimeout); nav.timers.clear();
  nav.intervals.forEach(clearInterval); nav.intervals.clear();
  alStop();
  nav.cur = id; nav.args = args;
  $$('.screen').forEach(s => s.classList.remove('active'));
  const el = $('#s-' + id);
  RENDER[id](el, ...args);
  el.classList.add('active');
  scrollTo(0, 0);
}
// Re-render the current screen in place (keeps scroll position, keeps timers).
function render() {
  if (!nav.cur) return;
  const y = scrollY;
  RENDER[nav.cur]($('#s-' + nav.cur), ...nav.args);
  scrollTo(0, y);
}

const navBar = (title, sub = '', right = '', back = 'home') => `
  <div class="nav">
    <button class="back" data-act="${back === 'home' ? 'home' : back}" aria-label="Back">←</button>
    <div class="title-wrap"><h1 class="page-title">${title}</h1>${sub ? `<div class="page-sub">${sub}</div>` : ''}</div>
    ${right}
  </div>`;

// ═══════════════════════════════════════════════════════════════════════════
// POINTS, UNDO, LEAD CHANGES, VICTORY, CARD DROPS
// ═══════════════════════════════════════════════════════════════════════════
let victoryTimer = null;

function addPoints(p, pts, source, { at, quiet = false, noCard = false } = {}) {
  if (!isPlayer(p) || !pts) return null;
  const evt = { p, pts, source, doubled: false, card: null, leaderBefore: soleLeader() };
  if (pts > 0 && source !== 'cards' && S.buffs[p]?.double) {
    evt.pts = pts * 2; evt.doubled = true; S.buffs[p].double = false;
    later(() => announce(`🌟 ${p}'s Double Up! ${pts} → ${evt.pts}`), 500);
  }
  S.scores[p] = (S.scores[p] || 0) + evt.pts;
  const st = S.stats[p] || (S.stats[p] = {});
  st[source] = (st[source] || 0) + evt.pts;
  if (!quiet) floatPts(evt.pts, at, color(p));
  if (evt.pts > 0 && !noCard && source !== 'cards' && Math.random() < 0.12) evt.card = earnCard(p);
  save();

  const lead = soleLeader();
  if (S.players.length > 1 && evt.pts > 0 && lead === p && evt.leaderBefore !== p) {
    setTimeout(() => { confetti(); announce(`👑 ${p} takes the lead!`); quip('lead'); }, 700);
  }
  const target = S.settings.winTarget;
  if (target > 0 && !S.gameWon && S.scores[p] >= target) {
    S.gameWon = p; save();
    clearTimeout(victoryTimer);
    victoryTimer = setTimeout(() => { if (S.gameWon === p) go('victory'); }, 1800);
  }
  return evt;
}

function revertPoints(evt) {
  if (!evt) return;
  S.scores[evt.p] = (S.scores[evt.p] || 0) - evt.pts;
  const st = S.stats[evt.p] || (S.stats[evt.p] = {});
  st[evt.source] = (st[evt.source] || 0) - evt.pts;
  if (evt.doubled) (S.buffs[evt.p] || (S.buffs[evt.p] = {})).double = true;
  if (evt.card) { const h = S.cards[evt.p] || []; const i = h.lastIndexOf(evt.card); if (i >= 0) h.splice(i, 1); }
  if (S.gameWon === evt.p && S.scores[evt.p] < S.settings.winTarget) { S.gameWon = null; clearTimeout(victoryTimer); }
  save();
}

function offerUndo(msg, revert) {
  toast(msg, { action: 'Undo', onAction: () => { revert(); save(); sfx.undo(); toast('Undone ↩️'); render(); } });
}

function earnCard(p, type) {
  const hand = S.cards[p] || (S.cards[p] = []);
  if (hand.length >= HAND_LIMIT) return null;
  type = type || pick(CARD_TYPES);
  hand.push(type);
  save();
  const d = CARDS[type];
  setTimeout(() => { sfx.card(); announce(`🃏 ${p} drew a card: ${d.icon} ${d.name}!`); }, 1100);
  return type;
}

// ═══════════════════════════════════════════════════════════════════════════
// SCREENS
// ═══════════════════════════════════════════════════════════════════════════
const RENDER = {};

// ── Setup / players & settings ─────────────────────────────────────────────
RENDER.setup = el => {
  const n = S.players.length;
  el.innerHTML = `
    ${S.tripStart ? `<div class="nav"><button class="back" data-act="home" aria-label="Back">←</button><div class="title-wrap"><h1 class="page-title">Players & Settings</h1></div></div>` : ''}
    <div class="setup-hero">
      <div class="big-car">🚙</div>
      <div class="t1">THE STUEBER</div>
      <div class="t2">ROAD TRIP<br>SHOWDOWN</div>
    </div>
    <div class="panel">
      <h2>Who's in the car?</h2>
      <div class="row">
        <input id="new-player" type="text" maxlength="14" placeholder="${n ? 'Add another player…' : 'Type a name…'}" enterkeyhint="done" autocomplete="off">
        <button class="btn btn-sm btn-go" style="margin:0" data-act="addPlayer">Add</button>
      </div>
      <div class="player-rows">${S.players.map((p, i) => `
        <div class="player-row">
          <button class="av" style="--pc:${color(p)};border:none" data-act="cycleAvatar" data-i="${i}" aria-label="Change avatar">${avatar(p)}</button>
          <span class="pname">${esc(p)}</span>
          <span class="small muted">${S.scores[p] || 0} pts</span>
          <button class="x" data-act="removePlayer" data-i="${i}" aria-label="Remove ${esc(p)}">✕</button>
        </div>`).join('')}
      </div>
      <div class="hint">${n ? 'Tap an avatar to change it.' : 'Add everyone riding along. Up to 8 players.'}</div>
    </div>
    <div class="panel">
      <h2>🏁 Race to…</h2>
      <div class="seg">${TARGETS.map(t => `<button class="${S.settings.winTarget === t ? 'on' : ''}" data-act="setTarget" data-v="${t}">${t ? t.toLocaleString() : 'Free'}</button>`).join('')}</div>
      <div class="hint">${S.settings.winTarget ? `First to ${S.settings.winTarget.toLocaleString()} points wins the trip.` : 'No finish line. Play as long as the road goes.'}</div>
    </div>
    <div class="spacer"></div>
    <button class="btn btn-go mt" data-act="startTrip" ${n ? '' : 'disabled'}>${S.tripStart ? 'Back to the Games 🚗' : "Let's Roll 🚗"}</button>
    ${S.tripStart ? `<button class="btn btn-bad" data-act="newTrip">Start a Brand-New Trip</button>` : ''}`;
};

// ── Home ───────────────────────────────────────────────────────────────────
const heroSVG = () => `
<svg class="scene" viewBox="0 0 400 250" preserveAspectRatio="xMidYMax slice" aria-hidden="true">
  <defs>
    <linearGradient id="hSky" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#120c2c"/><stop offset=".45" stop-color="#2d1858"/>
      <stop offset=".78" stop-color="#8a2f6b"/><stop offset="1" stop-color="#ff7a3d"/>
    </linearGradient>
    <linearGradient id="hSun" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#fff1a8"/><stop offset=".55" stop-color="#ffb347"/><stop offset="1" stop-color="#ff5f6d"/>
    </linearGradient>
    <linearGradient id="hRoad" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#3a3350"/><stop offset="1" stop-color="#1b1a28"/>
    </linearGradient>
    <mask id="hSunMask">
      <rect width="400" height="250" fill="#fff"/>
      <rect x="0" y="150" width="400" height="3" fill="#000"/><rect x="0" y="160" width="400" height="4" fill="#000"/>
      <rect x="0" y="170" width="400" height="5" fill="#000"/><rect x="0" y="180" width="400" height="6" fill="#000"/>
    </mask>
  </defs>
  <rect width="400" height="196" fill="url(#hSky)"/>
  <g fill="#fff" opacity=".7">
    <circle cx="30" cy="30" r="1"/><circle cx="90" cy="60" r=".8"/><circle cx="330" cy="40" r="1.1"/>
    <circle cx="370" cy="90" r=".7"/><circle cx="250" cy="22" r=".9"/><circle cx="150" cy="18" r=".7"/><circle cx="60" cy="110" r=".6"/>
  </g>
  <circle class="hero-sun" cx="200" cy="168" r="64" fill="url(#hSun)" mask="url(#hSunMask)"/>
  <polygon points="0,196 0,150 40,128 82,152 130,118 176,160 200,150 226,162 268,120 312,150 350,128 400,150 400,196" fill="#3a1d5c" opacity=".95"/>
  <polygon points="0,196 0,172 50,160 96,176 150,158 200,178 252,160 300,174 350,158 400,170 400,196" fill="#24143f"/>
  <rect y="194" width="400" height="56" fill="#160f2c"/>
  <polygon points="188,194 212,194 330,250 70,250" fill="url(#hRoad)"/>
  <line x1="190" y1="194" x2="76" y2="250" stroke="#ffe7c2" stroke-opacity=".5" stroke-width="1.5"/>
  <line x1="210" y1="194" x2="324" y2="250" stroke="#ffe7c2" stroke-opacity=".5" stroke-width="1.5"/>
  <line class="road-dash" x1="200" y1="194" x2="200" y2="250" stroke="#ffd23f" stroke-width="3" stroke-dasharray="12 8"/>
  <g class="hero-car">
    <rect x="176" y="222" width="48" height="20" rx="6" fill="#ff7a3d"/>
    <rect x="182" y="212" width="36" height="14" rx="5" fill="#e8532a"/>
    <rect x="186" y="215" width="28" height="8" rx="2" fill="#2b2050"/>
    <rect x="178" y="228" width="9" height="5" rx="1.5" fill="#ff2d55"/><rect x="213" y="228" width="9" height="5" rx="1.5" fill="#ff2d55"/>
    <circle cx="182.5" cy="230.5" r="7" fill="#ff2d55" opacity=".18"/><circle cx="217.5" cy="230.5" r="7" fill="#ff2d55" opacity=".18"/>
    <rect x="192" y="234" width="16" height="5" rx="1" fill="#fff" opacity=".85"/>
    <rect x="178" y="241" width="10" height="5" rx="2" fill="#111"/><rect x="212" y="241" width="10" height="5" rx="2" fill="#111"/>
  </g>
</svg>`;

const racePct = {}; // last drawn position per player, so cars glide to new spots
function raceHTML() {
  if (!S.players.length) return `<div class="race-empty">Add players to start the race.</div>`;
  const target = S.settings.winTarget;
  const max = Math.max(1, ...S.players.map(p => S.scores[p] || 0));
  const denom = target > 0 ? target : max / 0.9;
  const lead = soleLeader();
  return `<div class="race" data-act="go" data-to="standings">
    <div class="race-head"><span>${lead ? `👑 ${esc(lead)} leads` : 'Neck and neck!'}</span><span class="goal">${target ? `🏁 ${target.toLocaleString()}` : '🏁 Free play'}</span></div>
    ${S.players.map(p => {
      const sc = S.scores[p] || 0;
      const pct = clamp(sc / denom, 0, 1);
      const from = racePct[p] ?? pct;
      return `<div class="lane ${lead === p ? 'lead' : ''}" style="--pc:${color(p)}" data-p="${esc(p)}" data-pct="${pct}">
        <div class="trail" style="width:calc(26px + ${from} * (100% - 200px))"></div>
        <div class="flag"></div>
        <div class="racer" style="left:calc(4px + ${from} * (100% - 200px))">${avHTML(p)}<span class="name-tag">${esc(p)}</span></div>
        <div class="pts">${sc.toLocaleString()}</div>
      </div>`;
    }).join('')}
  </div>`;
}
function animateRace(root) {
  requestAnimationFrame(() => requestAnimationFrame(() => {
    $$('.lane', root).forEach(l => {
      const pct = +l.dataset.pct;
      $('.racer', l).style.left = `calc(4px + ${pct} * (100% - 200px))`;
      $('.trail', l).style.width = `calc(26px + ${pct} * (100% - 200px))`;
      racePct[l.dataset.p] = pct;
    });
  }));
}

let greeted = false;
RENDER.home = el => {
  const plates = Object.keys(S.plates).length;
  const h = S.hunt;
  const huntBadge = h ? `R${h.no} · ${Object.keys(h.found).length}/${h.items.length}` : 'New round';
  const bingoLines = S.players.reduce((n, p) => n + (S.bingo[p]?.lines || 0), 0);
  const nCards = S.players.reduce((n, p) => n + (S.cards[p]?.length || 0), 0);
  el.innerHTML = `
    <div class="hero">
      ${heroSVG()}
      <div class="hero-title"><div class="t1">THE STUEBER</div><div class="t2">ROAD TRIP<br>SHOWDOWN</div></div>
      <div class="hero-actions icon-row">
        <button class="icon-btn ${S.settings.al ? '' : 'off'}" data-act="toggleAl" aria-label="Toggle Al">${S.settings.al ? '🎙️' : '🤐'}</button>
        <button class="icon-btn" data-act="go" data-to="voice" aria-label="Al's voice">🎚️</button>
        <button class="icon-btn ${S.settings.muted ? 'off' : ''}" data-act="toggleMute" aria-label="Toggle sound">${S.settings.muted ? '🔇' : '🔊'}</button>
      </div>
    </div>
    <div class="trip-strip">
      <span>⏱️ On the road <b>${S.tripStart ? fmtDur(Date.now() - S.tripStart) : '0m'}</b></span>
      <span>📍 <b>${plates}</b> states spotted</span>
    </div>

    <div class="section-label">Standings</div>
    ${raceHTML()}

    <div class="section-label">Spot it</div>
    <div class="tiles">
      <button class="tile t-plates" data-act="go" data-to="plates"><span class="badge">${plates}/51</span><span class="emoji">🚘</span><span class="tname">Plate Hunt</span><span class="tsub">10–100 per state</span></button>
      <button class="tile t-hunt" data-act="go" data-to="hunt"><span class="badge">${huntBadge}</span><span class="emoji">🔭</span><span class="tname">Scavenger Hunt</span><span class="tsub">Rare finds pay big</span></button>
      <button class="tile t-bingo wide" data-act="go" data-to="bingo"><span class="badge">${bingoLines ? `${bingoLines} line${bingoLines > 1 ? 's' : ''} so far` : 'Fresh cards'}</span><span class="emoji">🎯</span><span class="tname">Road Bingo</span><span class="tsub">Everyone gets a card · 200 for BINGO</span></button>
    </div>

    <div class="section-label">Brain games</div>
    <div class="tiles">
      <button class="tile t-trivia" data-act="go" data-to="trivia-pick"><span class="emoji">🧠</span><span class="tname">Trivia</span><span class="tsub">Streaks up to 2×</span></button>
      <button class="tile t-duel" data-act="go" data-to="duel-pick"><span class="emoji">⚔️</span><span class="tname">Trivia Duel</span><span class="tsub">Buzzer showdown</span></button>
    </div>

    <div class="section-label">Party</div>
    <div class="tiles">
      <button class="tile t-dares" data-act="go" data-to="dare"><span class="emoji">🎭</span><span class="tname">Dares</span><span class="tsub">50 pts if you dare</span></button>
      <button class="tile t-wyr" data-act="go" data-to="wyr"><span class="emoji">🤔</span><span class="tname">Would You Rather</span><span class="tsub">Vote with the crowd</span></button>
      <button class="tile t-story wide" data-act="go" data-to="story"><span class="badge">${S.story ? 'Story in progress' : `${S.stories.length} saved`}</span><span class="emoji">📖</span><span class="tname">Story Builder</span><span class="tsub">One line each · Al reads it back</span></button>
    </div>

    <div class="section-label">Chaos</div>
    <div class="tiles">
      <button class="tile t-wheel" data-act="go" data-to="wheel"><span class="emoji">🎡</span><span class="tname">Spin the Wheel</span><span class="tsub">Anything goes</span></button>
      <button class="tile t-cards" data-act="go" data-to="cards"><span class="badge">${nCards} in hand</span><span class="emoji">🃏</span><span class="tname">Sabotage Cards</span><span class="tsub">Heists & shields</span></button>
    </div>

    <div class="section-label">Ask Al</div>
    <div class="quick-row">
      <button class="quick" data-act="joke"><span class="q-emoji">😄</span>Tell a dad joke</button>
      <button class="quick" data-act="awty"><span class="q-emoji">⏳</span>Are we there yet?</button>
    </div>

    <div class="section-label">Trip</div>
    <div class="quick-row">
      <button class="quick" data-act="go" data-to="recap"><span class="q-emoji">📊</span>Trip recap</button>
      <button class="quick" data-act="go" data-to="setup"><span class="q-emoji">👥</span>Players & settings</button>
    </div>`;
  animateRace(el);
  if (!greeted && S.players.length) { greeted = true; later(() => quip('welcome', { force: true }), 700); }
};

// ── Standings ──────────────────────────────────────────────────────────────
function mixBar(p) {
  const st = S.stats[p] || {};
  const parts = Object.entries(SOURCES).map(([k, s]) => ({ k, s, v: Math.max(0, st[k] || 0) })).filter(x => x.v > 0);
  const tot = parts.reduce((a, x) => a + x.v, 0);
  if (!tot) return `<div class="tiny faint mt">No points yet</div>`;
  return `<div class="mix-bar">${parts.map(x => `<span style="width:${x.v / tot * 100}%;background:${x.s.color}"></span>`).join('')}</div>
    <div class="mix-legend">${parts.sort((a, b) => b.v - a.v).map(x => `<span><i style="background:${x.s.color}"></i>${x.s.label} ${x.v}</span>`).join('')}</div>`;
}
RENDER.standings = el => {
  const medals = ['🥇','🥈','🥉'];
  el.innerHTML = `
    ${navBar('Standings', S.settings.winTarget ? `First to ${S.settings.winTarget.toLocaleString()} wins${S.gameWon ? ` · 🏆 ${esc(S.gameWon)} won!` : ''}` : 'Free play')}
    ${raceHTML().replace('data-act="go" data-to="standings"', '')}
    <div class="section-label">Leaderboard</div>
    ${ranked().map((p, i) => `
      <div class="stand-row ${i === 0 && (S.scores[p] || 0) > 0 ? 'first' : ''}">
        <span class="rank">${medals[i] || i + 1}</span>
        ${avHTML(p)}
        <div style="flex:1;min-width:0"><div class="sname">${esc(p)}</div>${mixBar(p)}</div>
        <span class="sscore">${(S.scores[p] || 0).toLocaleString()}</span>
      </div>`).join('')}
    <div class="spacer"></div>
    <button class="btn btn-go mt" data-act="go" data-to="recap">📊 Trip Recap</button>
    <button class="btn btn-bad" data-act="resetScores">Reset Scores Only</button>`;
  animateRace(el);
};

// ── Trivia ─────────────────────────────────────────────────────────────────
let triviaPickPlayer = null;
let T = null;
const TRIVIA_TIME = 15;

RENDER['trivia-pick'] = el => {
  if (!isPlayer(triviaPickPlayer)) triviaPickPlayer = null;
  el.innerHTML = `
    ${navBar('Trivia', '5 questions · faster answers score more')}
    <div class="section-label">Who's in the hot seat?</div>
    <div class="chips">${S.players.map((p, i) => `<button class="chip ${triviaPickPlayer === p ? 'on' : ''}" style="--pc:${color(p)}" data-act="triviaPlayer" data-i="${i}">${avHTML(p, 'sm')} ${esc(p)}</button>`).join('')}</div>
    <div class="section-label">Category</div>
    <div class="chips scroll">${triviaCategories.map(c => `<button class="chip ${S.settings.category === c ? 'on' : ''}" data-act="triviaCat" data-c="${esc(c)}">${esc(c)}</button>`).join('')}</div>
    <div class="panel mt-lg small muted">🔥 <b class="display" style="color:var(--text)">3 in a row</b> → 1.5× points &nbsp;·&nbsp; 🌟 <b class="display" style="color:var(--text)">5 in a row</b> → 2× and a free card</div>
    <div class="spacer"></div>
    <button class="btn btn-go mt" data-act="triviaStart" ${triviaPickPlayer ? '' : 'disabled'}>${triviaPickPlayer ? `Start — ${esc(triviaPickPlayer)}'s round` : 'Pick a player'}</button>`;
};

function drawTrivia(cat, n) {
  const all = triviaBank.map((q, i) => i).filter(i => cat === RANDOM_MIX || triviaBank[i].cat === cat);
  let fresh = all.filter(i => !S.usedTrivia.includes(i));
  if (fresh.length < n) { S.usedTrivia = S.usedTrivia.filter(i => !all.includes(i)); fresh = all; }
  let chosen = shuffle(fresh).slice(0, n);
  if (chosen.length < n) chosen = chosen.concat(shuffle(triviaBank.map((q, i) => i).filter(i => !chosen.includes(i))).slice(0, n - chosen.length));
  S.usedTrivia.push(...chosen);
  save();
  return chosen.map(i => triviaBank[i]);
}

function startTrivia(player, cat = S.settings.category) {
  T = { player, cat, qs: drawTrivia(cat, 5), i: 0, pts: 0, streak: 0, best: 0, results: [], answered: false, time: TRIVIA_TIME, opts: [] };
  go('trivia');
}

RENDER.trivia = el => {
  el.innerHTML = `
    <div class="nav">
      <button class="back" data-act="quitTrivia" aria-label="Quit">✕</button>
      <div class="title-wrap"><div class="row">${avHTML(T.player, 'sm')}<b>${esc(T.player)}</b><span class="muted small" id="t-pts">${T.pts} pts</span></div></div>
      <span id="t-streak"></span>
      <div class="timer-ring" id="t-ring">
        <svg viewBox="0 0 52 52"><circle class="bg" cx="26" cy="26" r="22" fill="none" stroke-width="5"/>
        <circle class="fg" cx="26" cy="26" r="22" fill="none" stroke-width="5" stroke-linecap="round" stroke-dasharray="138.2" stroke-dashoffset="0"/></svg>
        <div class="num" id="t-num">${TRIVIA_TIME}</div>
      </div>
    </div>
    <div class="q-progress" id="t-prog"></div>
    <div class="q-card"><span class="q-cat" id="t-cat"></span><div class="q-text" id="t-q"></div></div>
    <div class="answers" id="t-ans"></div>`;
  showQuestion();
};

function showQuestion() {
  if (T.i >= T.qs.length) return endTrivia();
  const q = T.qs[T.i];
  T.answered = false;
  T.opts = shuffle(q.opts);
  $('#t-prog').innerHTML = T.qs.map((_, k) => `<span class="${k < T.i ? (T.results[k] ? 'done-right' : 'done-wrong') : k === T.i ? 'now' : ''}"></span>`).join('');
  $('#t-cat').textContent = q.cat;
  $('#t-q').textContent = q.q;
  $('#t-ans').innerHTML = T.opts.map((o, k) => `<button class="ans" data-act="answer" data-k="${k}"><span class="letter">${'ABCD'[k]}</span><span>${esc(o)}</span></button>`).join('');
  streakBadge();
  say(q.q, { force: true, echo: false });
  T.time = TRIVIA_TIME; tickRing();
  T.timer = every(() => { T.time--; tickRing(); if (T.time <= 0) { stopEvery(T.timer); if (!T.answered) answer(-1); } }, 1000);
}
function tickRing() {
  const ring = $('#t-ring'); if (!ring) return;
  $('#t-num').textContent = Math.max(0, T.time);
  $('.fg', ring).style.strokeDashoffset = 138.2 * (1 - T.time / TRIVIA_TIME);
  ring.classList.toggle('low', T.time <= 5);
  if (T.time <= 3 && T.time > 0) sfx.tick();
}
function streakBadge() {
  const s = T.streak, el = $('#t-streak');
  el.innerHTML = s >= 5 ? `<span class="streak x2">🌟 ×2</span>` : s >= 3 ? `<span class="streak">🔥 ${s} · ×1.5</span>` : s > 0 ? `<span class="small muted">🔥 ${s}</span>` : '';
}
function answer(k) {
  if (T.answered) return;
  T.answered = true;
  stopEvery(T.timer);
  alStop();
  const q = T.qs[T.i];
  const correctK = T.opts.indexOf(q.a);
  const btns = $$('#t-ans .ans');
  btns.forEach((b, j) => { b.disabled = true; if (j === correctK) b.classList.add('right'); else if (j !== k) b.classList.add('dim'); });
  const right = k === correctK;
  T.results[T.i] = right;
  if (right) {
    T.streak++; T.best = Math.max(T.best, T.streak);
    const mult = T.streak >= 5 ? 2 : T.streak >= 3 ? 1.5 : 1;
    const pts = Math.round(Math.max(10, T.time * 6 + 10) * mult);
    T.pts += pts;
    floatPts(pts, centerOf(btns[k]), color(T.player));
    $('#t-pts').textContent = `${T.pts} pts`;
    vibe(30);
    if (T.streak === 5) { sfx.combo(); quip('streak5'); }
    else if (T.streak === 3) { sfx.combo(); quip('streak3'); }
    else { sfx.ding(); if (Math.random() < .35) quip('correct'); }
  } else {
    T.streak = 0;
    if (k >= 0) btns[k].classList.add('wrong');
    sfx.buzz(); vibe([40, 60, 40]);
    if (k < 0) say(`Time! It was ${q.a}.`); else if (Math.random() < .5) quip('wrong');
  }
  streakBadge();
  later(() => { T.i++; showQuestion(); }, right ? 1500 : 2200);
}
const centerOf = el => { const r = el.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; };

function endTrivia() {
  const right = T.results.filter(Boolean).length;
  if (T.pts > 0) addPoints(T.player, T.pts, 'trivia', { quiet: true });
  count('triviaRounds');
  const perfect = right === T.qs.length;
  if (perfect) earnCard(T.player);
  save();
  go('trivia-result');
}

RENDER['trivia-result'] = el => {
  const right = T.results.filter(Boolean).length;
  const perfect = right === T.qs.length;
  const big = perfect ? '🏆' : right >= 4 ? '🤩' : right >= 3 ? '🎉' : right >= 1 ? '🙂' : '🫠';
  const msg = perfect ? 'PERFECT ROUND! Bonus card drawn 🃏' : right >= 4 ? 'Genius-level stuff.' : right >= 3 ? 'Nice work!' : right >= 1 ? 'Getting warmed up.' : 'Brutal. Shake it off!';
  el.innerHTML = `
    ${navBar('Round Over')}
    <div class="result-hero">
      <div class="big">${big}</div>
      <div class="row" style="justify-content:center;margin-top:12px">${avHTML(T.player)}<b style="font-size:1.1rem">${esc(T.player)}</b></div>
      <div class="pts">+${T.pts}</div>
      <div class="stars">${T.results.map(r => r ? '⭐' : '▫️').join('')}</div>
      <div class="muted mt">${right}/${T.qs.length} correct${T.best >= 3 ? ` · best streak ${T.best} 🔥` : ''}</div>
      <div class="mt" style="font-weight:900">${msg}</div>
    </div>
    <div class="spacer"></div>
    <button class="btn btn-go" data-act="triviaAgain">🔁 Same player, new questions</button>
    <button class="btn btn-ghost" data-act="go" data-to="trivia-pick">Pick another player</button>
    <button class="btn btn-ghost" data-act="home">Home</button>`;
  sfx.points();
  if (perfect) confetti();
};

// ── Trivia duel ────────────────────────────────────────────────────────────
let duelPick = [];
let D = null;

RENDER['duel-pick'] = el => {
  duelPick = duelPick.filter(isPlayer);
  el.innerHTML = `
    ${navBar('Trivia Duel', 'Head to head · first to buzz answers')}
    ${S.players.length < 2 ? `<div class="panel center">Add at least 2 players to duel.</div>` : `
    <div class="section-label">Pick two rivals</div>
    <div class="chips">${S.players.map((p, i) => {
      const k = duelPick.indexOf(p);
      return `<button class="chip ${k >= 0 ? 'on' : ''}" style="--pc:${color(p)}" data-act="duelPlayer" data-i="${i}">${avHTML(p, 'sm')} ${esc(p)}${k >= 0 ? ` <b>${'AB'[k]}</b>` : ''}</button>`;
    }).join('')}</div>
    ${duelPick.length === 2 ? `<div class="duel-board mt-lg">
      <div class="duel-side" style="--pc:${color(duelPick[0])}">${avHTML(duelPick[0], 'lg')}<div class="dn">${esc(duelPick[0])}</div></div>
      <div class="duel-vs">VS</div>
      <div class="duel-side" style="--pc:${color(duelPick[1])}">${avHTML(duelPick[1], 'lg')}<div class="dn">${esc(duelPick[1])}</div></div>
    </div>` : ''}
    <div class="panel mt small muted">Right answer <b style="color:var(--text)">+100</b> · Wrong answer gives your rival <b style="color:var(--text)">+50</b> · 5 questions</div>`}
    <div class="spacer"></div>
    <button class="btn btn-go mt" data-act="duelStart" ${duelPick.length === 2 ? '' : 'disabled'}>Start Duel ⚔️</button>`;
};

function startDuel(a, b) {
  D = { a, b, qs: drawTrivia(RANDOM_MIX, 5), i: 0, sa: 0, sb: 0, phase: 'buzz', buzz: null, time: 10, opts: [] };
  go('duel');
}
RENDER.duel = el => {
  el.innerHTML = `
    <div class="nav">
      <button class="back" data-act="quitDuel" aria-label="Quit">✕</button>
      <div class="title-wrap"><div class="muted small" id="d-count"></div></div>
      <div class="timer-ring" id="d-ring">
        <svg viewBox="0 0 52 52"><circle class="bg" cx="26" cy="26" r="22" fill="none" stroke-width="5"/>
        <circle class="fg" cx="26" cy="26" r="22" fill="none" stroke-width="5" stroke-linecap="round" stroke-dasharray="138.2" stroke-dashoffset="0"/></svg>
        <div class="num" id="d-num">10</div>
      </div>
    </div>
    <div class="duel-board" id="d-board"></div>
    <div class="duel-banner" id="d-banner"></div>
    <div class="q-card"><div class="q-text" id="d-q" style="margin-top:0"></div></div>
    <div class="answers" id="d-ans"></div>
    <div class="buzzers" id="d-buzz"></div>`;
  duelQuestion();
};
function duelBoard() {
  $('#d-board').innerHTML = ['a', 'b'].map((s, k) => {
    const p = D[s];
    return `${k ? '<div class="duel-vs">VS</div>' : ''}<div class="duel-side ${D.buzz === s ? 'on' : ''}" style="--pc:${color(p)}">${avHTML(p)}<div class="dn">${esc(p)}</div><div class="ds">${D['s' + s]}</div></div>`;
  }).join('');
}
function duelRing(max) {
  $('#d-num').textContent = Math.max(0, D.time);
  $('#d-ring .fg').style.strokeDashoffset = 138.2 * (1 - D.time / max);
  $('#d-ring').classList.toggle('low', D.time <= 3);
}
function duelTimer(max, onOut) {
  D.time = max; duelRing(max);
  D.timer = every(() => { D.time--; duelRing(max); if (D.time <= 0) { stopEvery(D.timer); onOut(); } }, 1000);
}
function duelQuestion() {
  if (D.i >= D.qs.length) return endDuel();
  const q = D.qs[D.i];
  D.phase = 'buzz'; D.buzz = null;
  $('#d-count').textContent = `Question ${D.i + 1} of ${D.qs.length}`;
  $('#d-q').textContent = q.q;
  $('#d-ans').innerHTML = '';
  $('#d-banner').textContent = '🔔 First to buzz gets to answer!';
  $('#d-buzz').innerHTML = ['a', 'b'].map(s => `<button class="buzzer" style="--pc:${color(D[s])}" data-act="buzz" data-side="${s}"><span style="font-size:1.6rem">${avatar(D[s])}</span><span class="bz">BUZZ</span><span>${esc(D[s])}</span></button>`).join('');
  duelBoard();
  say(q.q, { force: true, echo: false });
  duelTimer(10, () => { $('#d-banner').textContent = '⏰ Nobody buzzed. Next!'; sfx.buzz(); D.phase = 'done'; later(() => { D.i++; duelQuestion(); }, 1500); });
}
function duelBuzz(side) {
  if (D.phase !== 'buzz') return;
  stopEvery(D.timer);
  alStop();
  D.phase = 'answer'; D.buzz = side;
  const p = D[side];
  sfx.ding(); vibe(60);
  $('#d-buzz').innerHTML = '';
  $('#d-banner').innerHTML = `${avatar(p)} <b>${esc(p)}</b> buzzed in!`;
  const q = D.qs[D.i];
  D.opts = shuffle(q.opts);
  $('#d-ans').innerHTML = D.opts.map((o, k) => `<button class="ans" data-act="duelAnswer" data-k="${k}"><span class="letter">${'ABCD'[k]}</span><span>${esc(o)}</span></button>`).join('');
  duelBoard();
  duelTimer(8, () => duelAnswer(-1));
}
function duelAnswer(k) {
  if (D.phase !== 'answer') return;
  D.phase = 'done';
  stopEvery(D.timer);
  const q = D.qs[D.i];
  const correctK = D.opts.indexOf(q.a);
  const btns = $$('#d-ans .ans');
  btns.forEach((b, j) => { b.disabled = true; if (j === correctK) b.classList.add('right'); else if (j !== k) b.classList.add('dim'); });
  const me = D.buzz, other = me === 'a' ? 'b' : 'a';
  if (k === correctK) {
    D['s' + me] += 100; sfx.ding();
    floatPts(100, centerOf(btns[k]), color(D[me]));
    $('#d-banner').innerHTML = `✅ <b>${esc(D[me])}</b> nails it! +100`;
  } else {
    if (k >= 0) btns[k].classList.add('wrong');
    D['s' + other] += 50; sfx.buzz(); vibe([40, 60, 40]);
    $('#d-banner').innerHTML = `❌ ${k < 0 ? 'Too slow!' : 'Wrong!'} <b>${esc(D[other])}</b> gets +50`;
  }
  duelBoard();
  later(() => { D.i++; duelQuestion(); }, 2200);
}
function endDuel() {
  if (D.sa > 0) addPoints(D.a, D.sa, 'duel', { quiet: true });
  if (D.sb > 0) addPoints(D.b, D.sb, 'duel', { quiet: true });
  count('duels');
  go('duel-result');
}
RENDER['duel-result'] = el => {
  const w = D.sa > D.sb ? D.a : D.sb > D.sa ? D.b : null;
  el.innerHTML = `
    ${navBar('Duel Over')}
    <div class="result-hero">
      <div class="big">${w ? '🏆' : '🤝'}</div>
      ${w ? `<div class="mt">${avHTML(w, 'xl')}</div><div class="pts">${esc(w)} wins!</div>` : `<div class="pts">It's a tie!</div>`}
    </div>
    <div class="duel-board mt">
      <div class="duel-side" style="--pc:${color(D.a)}">${avHTML(D.a)}<div class="dn">${esc(D.a)}</div><div class="ds">+${D.sa}</div></div>
      <div class="duel-vs">VS</div>
      <div class="duel-side" style="--pc:${color(D.b)}">${avHTML(D.b)}<div class="dn">${esc(D.b)}</div><div class="ds">+${D.sb}</div></div>
    </div>
    <div class="spacer"></div>
    <button class="btn btn-go" data-act="duelRematch">🔁 Rematch</button>
    <button class="btn btn-ghost" data-act="home">Home</button>`;
  sfx.fanfare();
  if (w) { confetti(); say(`${w} wins the duel!`, { force: true }); }
};

// ── Plate hunt ─────────────────────────────────────────────────────────────
let justPlate = null;
const plateArt = (name, by, big) => `<div class="lp ${big ? 'big' : ''}"><span class="bolt l"></span><span class="bolt r"></span>
  <div class="lp-state">${esc(name)}</div><div class="lp-num">${STATE_MAP[name]?.abbr || '★'}</div>${by ? `<div class="lp-by">${esc(by)}</div>` : ''}</div>`;

RENDER.plates = el => {
  const found = STATE_NAMES.filter(s => S.plates[s]);
  const n = found.length;
  const platePts = S.players.reduce((a, p) => a + Math.max(0, S.stats[p]?.plates || 0), 0);
  const next = PLATE_MILESTONES.find(m => !S.plateMilestones.includes(m.n));
  const recent = found.filter(s => S.plates[s].t).sort((a, b) => S.plates[b].t - S.plates[a].t).slice(0, 6);
  const tally = S.players.map(p => [p, found.filter(s => S.plates[s].p === p).length]).filter(x => x[1]).sort((a, b) => b[1] - a[1]);
  el.innerHTML = `
    ${navBar('Plate Hunt', 'Tap a state when you spot its plate')}
    <div class="stat-pills">
      <div class="stat-pill"><div class="v">${n}<span class="small muted">/51</span></div><div class="l">States</div></div>
      <div class="stat-pill"><div class="v">${platePts}</div><div class="l">Plate pts</div></div>
      <div class="stat-pill"><div class="v">${next ? next.n - n : '✓'}</div><div class="l">${next ? `To +${next.pts} bonus` : 'All bonuses'}</div></div>
    </div>
    ${recent.length ? `<div class="section-label">Recently spotted</div><div class="plates-strip">${recent.map(s => plateArt(s, S.plates[s].p ? `${avatar(S.plates[s].p)} ${S.plates[s].p}` : '')).join('')}</div>` : ''}
    <div class="section-label">The map</div>
    <div class="us-map">${STATE_NAMES.map(s => {
      const pos = STATE_MAP[s], f = S.plates[s];
      const cls = ['state', f ? 'found' : '', f && !isPlayer(f.p) ? 'unknown' : '', PLATE_VALUE[s] ? 'bonus' : '', justPlate === s ? 'just' : ''].join(' ');
      return `<button class="${cls}" style="grid-column:${pos.col + 1};grid-row:${pos.row + 1};${f && isPlayer(f.p) ? `--pc:${color(f.p)}` : ''}" data-act="plate" data-s="${esc(s)}" aria-label="${esc(s)}">${pos.abbr}</button>`;
    }).join('')}</div>
    <div class="tiny faint center mt">● Yellow dot = rare plate (Hawaii 100 · Alaska 75 · DC 30)</div>
    ${tally.length ? `<div class="section-label">Top spotters</div><div class="finders">${tally.map(([p, c]) => `<span class="finder">${avHTML(p, 'sm')}${esc(p)} · ${c}</span>`).join('')}</div>` : ''}
    <div class="section-label">Bonus plates (repeatable)</div>
    <div class="bonus-row">${PLATE_BONUS.map(b => {
      const c = S.plateExtras.filter(x => x.id === b.id).length;
      return `<button class="bonus-btn" data-act="plateBonus" data-id="${b.id}"><span class="b-emoji">${b.icon}</span><span>${b.name}${c ? ` <span class="faint">×${c}</span>` : ''}</span><span class="b-pts">+${b.pts}</span></button>`;
    }).join('')}</div>
    <div class="center mt-lg"><button class="link-btn" data-act="resetPlates">Reset all plates</button></div>`;
  justPlate = null;
};

async function plateTap(name) {
  const f = S.plates[name];
  if (f) {
    const ok = await ask({ iconHTML: plateArt(name, '', true), title: esc(name),
      sub: `Spotted by ${isPlayer(f.p) ? `${avatar(f.p)} <b>${esc(f.p)}</b>` : 'someone'}${f.t ? ` · ${new Date(f.t).toLocaleTimeString([], { hour:'numeric', minute:'2-digit' })}` : ''}`,
      ok: 'Remove this plate', cancel: 'Keep it', danger: true });
    if (!ok) return;
    delete S.plates[name];
    if (isPlayer(f.p)) addPoints(f.p, -plateValue(name), 'plates', { quiet: true, noCard: true });
    save(); render(); toast(`${name} removed`);
    return;
  }
  const val = plateValue(name);
  const p = await pickPlayer({ iconHTML: plateArt(name, '', true), title: `Who spotted ${esc(name)}?`, sub: `+${val} pts${val > 10 ? ' · rare plate! 🌟' : ''}` });
  if (!isPlayer(p)) return;
  claimPlate(name, p);
}

function claimPlate(name, p) {
  const val = plateValue(name);
  S.plates[name] = { p, t: Date.now() };
  justPlate = name;
  const evts = [addPoints(p, val, 'plates')];
  const n = Object.keys(S.plates).length;
  const hit = [];
  for (const m of PLATE_MILESTONES) {
    if (n >= m.n && !S.plateMilestones.includes(m.n)) {
      S.plateMilestones.push(m.n); hit.push(m.n);
      evts.push(addPoints(p, m.pts, 'plates', { quiet: true }));
      setTimeout(() => { confetti(); sfx.fanfare(); say(`${m.n} states! ${p} grabs a ${m.pts} point milestone bonus!`, { force: true }); }, 500);
    }
  }
  sfx.stamp(); vibe(25);
  if (val > 10) { setTimeout(() => confetti(lastTap), 50); say(`${name}! That's a rare one! ${val} points!`, { force: true }); }
  else if (!hit.length && Math.random() < .3) say(pick(HUNT_QUIPS.plate));
  save(); render();
  offerUndo(`${avatar(p)} ${p} +${val} · ${name}`, () => {
    delete S.plates[name];
    evts.forEach(revertPoints);
    S.plateMilestones = S.plateMilestones.filter(x => !hit.includes(x));
  });
}

async function plateBonus(id) {
  const b = PLATE_BONUS.find(x => x.id === id);
  const p = await pickPlayer({ icon: b.icon, title: `Who spotted a ${esc(b.name)}?`, sub: `+${b.pts} pts` });
  if (!isPlayer(p)) return;
  const entry = { id, p, t: Date.now() };
  S.plateExtras.push(entry);
  const evt = addPoints(p, b.pts, 'plates');
  sfx.stamp(); save(); render();
  offerUndo(`${p} +${b.pts} · ${b.name}`, () => { S.plateExtras = S.plateExtras.filter(x => x !== entry); revertPoints(evt); });
}

// ── Scavenger hunt ─────────────────────────────────────────────────────────
let justHunt = null;
const huntEligible = env => HUNT_POOL.filter(h => env === 'mixed' || h.env.includes(env) || h.env.includes('any'));
const huntPts = (h, id) => HUNT_TIERS[h.tier].pts * (S.hunt?.bounty === id ? 2 : 1);

function newHuntRound(env) {
  const pool = shuffle(huntEligible(env));
  let items = [];
  for (const tier of TIER_ORDER) items.push(...pool.filter(h => h.tier === tier).slice(0, HUNT_SIZE[tier]));
  const total = Object.values(HUNT_SIZE).reduce((a, b) => a + b, 0);
  if (items.length < total) items.push(...pool.filter(h => !items.includes(h)).slice(0, total - items.length));
  items.sort((a, b) => TIER_ORDER.indexOf(a.tier) - TIER_ORDER.indexOf(b.tier));
  S.huntRounds = (S.huntRounds || 0) + 1;
  S.huntEnv = env;
  S.hunt = { no: S.huntRounds, env, items: items.map(h => h.id), found: {}, bounty: null, swaps: 2, start: Date.now() };
  pickBounty();
  save();
  sfx.whoosh();
  const e = HUNT_ENVS.find(x => x.id === env);
  say(`New ${e.name.toLowerCase()} hunt! Twelve things to spot. Eyes peeled!`, { force: true });
}
function pickBounty() {
  const h = S.hunt;
  const open = h.items.filter(id => !h.found[id] && huntById[id].tier !== 'legendary');
  h.bounty = open.length ? pick(open) : null;
}

RENDER.hunt = el => {
  const h = S.hunt;
  if (!h) {
    el.innerHTML = `
      ${navBar('Scavenger Hunt', 'Where are we driving right now?')}
      <div class="env-grid">${HUNT_ENVS.map(e => `
        <button class="env-btn ${e.id === 'mixed' ? 'wide' : ''} ${S.huntEnv === e.id ? 'last' : ''}" data-act="huntStart" data-env="${e.id}">
          <span class="e-emoji">${e.icon}</span><span><span class="e-name">${e.name}</span><br><span class="e-desc">${e.desc}</span></span>
        </button>`).join('')}
      </div>
      <div class="panel mt-lg">
        <h2>How a round works</h2>
        <div class="small muted" style="line-height:1.6">
          You get <b style="color:var(--text)">12 things to spot</b>, picked for the terrain. Tap one when you see it and pick who saw it first.<br>
          🎯 One item is the <b style="color:var(--sun)">bounty</b>, worth double.<br>
          🔄 Two swaps per round if something's impossible out here.<br>
          👑 When the round ends, the top spotter gets <b style="color:var(--text)">+50</b> (+75 if you find all 12).
        </div>
        <div class="tier-legend">${TIER_ORDER.map(t => `<span style="--tc:${HUNT_TIERS[t].color}">${HUNT_TIERS[t].label} ${HUNT_TIERS[t].pts}</span>`).join('')}</div>
      </div>`;
    return;
  }
  const env = HUNT_ENVS.find(e => e.id === h.env);
  const nFound = Object.keys(h.found).length;
  const roundPts = {};
  for (const f of Object.values(h.found)) if (isPlayer(f.p)) roundPts[f.p] = (roundPts[f.p] || 0) + f.pts;
  const b = h.bounty && !h.found[h.bounty] ? huntById[h.bounty] : null;
  el.innerHTML = `
    ${navBar(`${env.icon} ${env.name} Hunt`, `Round ${h.no} · ${h.swaps} swap${h.swaps === 1 ? '' : 's'} left`, `<button class="icon-btn" data-act="huntEnd" aria-label="End round">🏁</button>`)}
    <div class="between small"><b>${nFound} of ${h.items.length} found</b><span class="muted">${Object.values(h.found).reduce((a, f) => a + f.pts, 0)} pts this round</span></div>
    <div class="hunt-progress"><div style="width:${nFound / h.items.length * 100}%"></div></div>
    ${b ? `<div class="bounty-banner"><span class="bb-emoji">${b.icon}</span><div><div class="bb-title">🎯 Bounty · double points</div><div class="bb-name">${esc(b.name)}</div></div><span class="bb-pts">+${HUNT_TIERS[b.tier].pts * 2}</span></div>` : ''}
    ${Object.keys(roundPts).length ? `<div class="finders mt">${Object.entries(roundPts).sort((x, y) => y[1] - x[1]).map(([p, v], i) => `<span class="finder">${avHTML(p, 'sm')}${i === 0 ? '👑 ' : ''}${esc(p)} · ${v}</span>`).join('')}</div>` : ''}
    <div class="section-label">Find these</div>
    <div class="hunt-grid">${h.items.map(id => {
      const it = huntById[id], f = h.found[id];
      const cls = ['hunt-card', it.tier, f ? 'found' : '', !f && h.bounty === id ? 'bounty' : '', justHunt === id ? 'just' : ''].join(' ');
      return `<button class="${cls}" style="${f && isPlayer(f.p) ? `--pc:${color(f.p)}` : ''}" data-act="huntItem" data-id="${id}">
        ${!f && h.bounty === id ? '<span class="bounty-tag">🎯 2×</span>' : ''}
        <span class="h-emoji">${it.icon}</span><span class="h-name">${esc(it.name)}</span>
        <span class="h-pts">${f ? `+${f.pts}` : `${HUNT_TIERS[it.tier].label} · ${huntPts(it, id)}`}</span>
        ${f && isPlayer(f.p) ? `<span class="stamp">${avHTML(f.p)}</span>` : ''}
      </button>`;
    }).join('')}</div>
    <div class="tier-legend">${TIER_ORDER.map(t => `<span style="--tc:${HUNT_TIERS[t].color}">${HUNT_TIERS[t].label} ${HUNT_TIERS[t].pts}</span>`).join('')}</div>
    <button class="btn btn-ghost mt-lg" data-act="huntEnd">🏁 End round & crown the MVP</button>`;
  justHunt = null;
};

async function huntTap(id) {
  const h = S.hunt, it = huntById[id], f = h.found[id];
  if (f) {
    const ok = await ask({ icon: it.icon, title: esc(it.name), sub: `Found by ${isPlayer(f.p) ? `${avatar(f.p)} <b>${esc(f.p)}</b>` : 'someone'} · +${f.pts}`, ok: 'Remove this find', cancel: 'Keep it', danger: true });
    if (!ok) return;
    delete h.found[id];
    if (isPlayer(f.p)) addPoints(f.p, -f.pts, 'hunt', { quiet: true, noCard: true });
    count('huntFinds', -1);
    save(); render();
    return;
  }
  const tier = HUNT_TIERS[it.tier];
  const isBounty = h.bounty === id;
  const pts = huntPts(it, id);
  const res = await pickPlayer({
    icon: it.icon, title: `Who spotted it first?`,
    sub: `<b style="color:${tier.color}">${tier.label}</b> · ${esc(it.name)} · <b>+${pts}</b>${isBounty ? ' · 🎯 bounty' : ''}`,
    extra: h.swaps > 0 ? `<button class="link-btn" data-act="sheet" data-val="x:swap">🔄 Impossible out here? Swap it (${h.swaps} left)</button>` : '',
  });
  if (res && res.extra === 'swap') return huntSwap(id);
  if (!isPlayer(res)) return;
  claimHunt(id, res);
}

function claimHunt(id, p) {
  const h = S.hunt, it = huntById[id];
  const pts = huntPts(it, id);
  const prevBounty = h.bounty;
  const at = lastTap;
  h.found[id] = { p, t: Date.now(), pts };
  count('huntFinds');
  justHunt = id;
  const evt = addPoints(p, pts, 'hunt', { at });
  sfx.stamp(); vibe(30);
  if (it.tier === 'legendary') { confetti(); sfx.fanfare(); vibe([60, 40, 120]); say(pick(HUNT_QUIPS.legendary), { force: true }); }
  else if (prevBounty === id) { confetti(at); sfx.combo(); say(pick(HUNT_QUIPS.bounty), { force: true }); }
  else if (it.tier === 'rare') { confetti(at); if (Math.random() < .6) say(pick(HUNT_QUIPS.rare)); }
  if (prevBounty === id) pickBounty();
  save(); render();
  offerUndo(`${avatar(p)} ${p} +${pts} · ${it.name}`, () => {
    delete h.found[id];
    h.bounty = prevBounty;
    count('huntFinds', -1);
    revertPoints(evt);
  });
  if (Object.keys(h.found).length === h.items.length) later(() => endHuntRound(true), 1400);
}

function huntSwap(id) {
  const h = S.hunt, it = huntById[id];
  const elig = huntEligible(h.env).filter(x => !h.items.includes(x.id));
  const rep = pick(elig.filter(x => x.tier === it.tier)) || pick(elig);
  if (!rep) { toast('Nothing left to swap in!'); return; }
  h.items[h.items.indexOf(id)] = rep.id;
  h.swaps--;
  if (h.bounty === id) pickBounty();
  sfx.whoosh(); save(); render();
  toast(`🔄 ${it.name} → ${rep.icon} ${rep.name}`);
}

async function endHuntRound(cleared = false) {
  const h = S.hunt; if (!h) return;
  const env = h.env;
  const tally = {};
  for (const f of Object.values(h.found)) if (isPlayer(f.p)) tally[f.p] = tally[f.p] || { pts: 0, n: 0 }, tally[f.p].pts += f.pts, tally[f.p].n++;
  const rows = Object.entries(tally).sort((a, b) => b[1].pts - a[1].pts);
  if (!cleared) {
    const ok = await ask({ icon: '🏁', title: 'End this round?', sub: rows.length ? `Top spotter gets +50.` : 'Nothing found yet. You can start fresh.', ok: 'End round' });
    if (!ok) return;
  }
  const best = rows.length ? rows[0][1].pts : 0;
  const mvps = rows.filter(r => r[1].pts === best && best > 0).map(r => r[0]);
  const bonus = cleared ? 75 : 50;
  mvps.forEach(p => addPoints(p, bonus, 'hunt', { quiet: true }));
  S.hunt = null;
  save();
  if (mvps.length) { confetti(); sfx.fanfare(); say(cleared ? `${pick(HUNT_QUIPS.clear)} ${mvps.join(' and ')} takes MVP!` : `Round over! ${mvps.join(' and ')} takes MVP!`, { force: true }); }
  const v = await openSheet(`${sheetHead({ icon: cleared ? '🌟' : '🏁', title: cleared ? 'Clean sweep!' : `Round ${h.no} complete`, sub: mvps.length ? `👑 MVP: ${mvps.map(esc).join(' & ')} · +${bonus}` : 'No finds this round.' })}
    <div class="sheet-body">
      ${rows.map(([p, t], i) => `<div class="stand-row ${i === 0 ? 'first' : ''}"><span class="rank">${i + 1}</span>${avHTML(p)}<span class="sname">${esc(p)}</span><span class="small muted">${t.n} found</span><span class="sscore">${t.pts}</span></div>`).join('')}
      <button class="btn btn-go mt" data-act="sheet" data-val="same">Next round · same terrain</button>
      <button class="btn btn-ghost" data-act="sheet" data-val="env">Change terrain</button>
    </div>`);
  if (nav.cur !== 'hunt') return;
  if (v === 'same') newHuntRound(env);
  render();
}

// ── Bingo ──────────────────────────────────────────────────────────────────
let bingoViewer = null;
let justCell = null;
const BINGO_LINES = [
  [0,1,2,3,4],[5,6,7,8,9],[10,11,12,13,14],[15,16,17,18,19],[20,21,22,23,24],
  [0,5,10,15,20],[1,6,11,16,21],[2,7,12,17,22],[3,8,13,18,23],[4,9,14,19,24],
  [0,6,12,18,24],[4,8,12,16,20],
];
const lineValue = k => (k === 1 ? 200 : 75); // value of the k-th completed line
const BLACKOUT = 300;
function bingoFor(p) {
  if (!S.bingo[p]) {
    const items = shuffle(bingoPool).slice(0, 24);
    const marked = Array(25).fill(false); marked[12] = true;
    S.bingo[p] = { card: [...items.slice(0, 12), { icon: '⭐', name: 'FREE' }, ...items.slice(12)], marked, lines: 0, blackout: false };
    save();
  }
  return S.bingo[p];
}
const doneLines = b => BINGO_LINES.filter(l => l.every(i => b.marked[i]));

RENDER.bingo = el => {
  if (!isPlayer(bingoViewer)) bingoViewer = S.players[0];
  const p = bingoViewer;
  if (!p) { el.innerHTML = `${navBar('Road Bingo')}<div class="panel center">Add players first.</div>`; return; }
  const b = bingoFor(p);
  const lines = doneLines(b), inLine = new Set(lines.flat());
  const marks = b.marked.filter(Boolean).length - 1;
  el.innerHTML = `
    ${navBar('Road Bingo', 'BINGO 200 · extra lines 75 · blackout 300')}
    <div class="chips">${S.players.map((q, i) => `<button class="chip ${q === p ? 'on' : ''}" style="--pc:${color(q)}" data-act="bingoView" data-i="${i}">${avHTML(q, 'sm')} ${esc(q)}${S.bingo[q]?.lines ? ` · ${S.bingo[q].lines}🎯` : ''}</button>`).join('')}</div>
    <div class="bingo-card mt" style="--pc:${color(p)}">
      <div class="bingo-head"><div>B</div><div>I</div><div>N</div><div>G</div><div>O</div></div>
      <div class="bingo-grid">${b.card.map((it, i) => `
        <button class="bcell ${i === 12 ? 'free' : ''} ${inLine.has(i) ? 'line' : ''} ${justCell === i ? 'just' : ''}" data-act="bcell" data-k="${i}" aria-label="${esc(it.name)}">
          <span class="bi">${it.icon}</span><span class="bn">${esc(it.name)}</span>
          ${b.marked[i] && i !== 12 ? '<span class="daub"></span>' : ''}
        </button>`).join('')}
      </div>
    </div>
    <div class="bingo-status"><span>${avatar(p)} ${esc(p)}'s card · ${marks}/24 marked</span><span><b>${lines.length}</b> line${lines.length === 1 ? '' : 's'}${b.blackout ? ' · ⬛ BLACKOUT' : ''}</span></div>
    <div class="center mt-lg"><button class="link-btn" data-act="bingoNewCard">New card for ${esc(p)}</button> · <button class="link-btn" data-act="bingoReset">Reset all cards</button></div>`;
  justCell = null;
};

// Re-score a card after any change; awards or claws back line/blackout points.
function settleBingo(p, at) {
  const b = S.bingo[p];
  const have = doneLines(b).length;
  const evts = [];
  let firstBingo = false;
  while (b.lines < have) { b.lines++; if (b.lines === 1) firstBingo = true; evts.push(addPoints(p, lineValue(b.lines), 'bingo', { at })); }
  while (b.lines > have) { evts.push(addPoints(p, -lineValue(b.lines), 'bingo', { quiet: true, noCard: true })); b.lines--; }
  const full = b.marked.every(Boolean);
  if (full && !b.blackout) { b.blackout = true; evts.push(addPoints(p, BLACKOUT, 'bingo', { quiet: true })); setTimeout(() => { confetti(); sfx.fanfare(); say(`BLACKOUT! ${p} filled the whole card! ${BLACKOUT} bonus points!`, { force: true }); }, 400); }
  if (!full && b.blackout) { b.blackout = false; evts.push(addPoints(p, -BLACKOUT, 'bingo', { quiet: true, noCard: true })); }
  if (firstBingo) { confetti(); sfx.fanfare(); vibe([80, 50, 160]); quip('bingo', { force: true }); count('bingos'); }
  else if (evts.some(e => e && e.pts > 0)) { sfx.combo(); say(`Another line for ${p}!`); }
  return evts;
}

async function bingoCell(k) {
  const p = bingoViewer, b = bingoFor(p);
  if (k === 12) return;
  const it = b.card[k];
  if (b.marked[k]) {
    const ok = await ask({ icon: it.icon, title: `Unmark ${esc(it.name)}?`, sub: 'Any line it completed will be taken back.', ok: 'Unmark', danger: true });
    if (!ok) return;
    b.marked[k] = false;
    settleBingo(p);
    save(); render();
    return;
  }
  b.marked[k] = true;
  justCell = k;
  sfx.stamp(); vibe(20);
  settleBingo(p, lastTap);
  save(); render();
  offerUndo(`${avatar(p)} Marked ${it.name}`, () => { b.marked[k] = false; settleBingo(p); });
}

// ── Dares ──────────────────────────────────────────────────────────────────
let dareNow = null; // { idx, forced, by }
function drawDare() {
  if (S.usedDares.length >= dares.length) S.usedDares = [];
  const open = dares.map((_, i) => i).filter(i => !S.usedDares.includes(i));
  const idx = pick(open);
  S.usedDares.push(idx); save();
  return idx;
}
RENDER.dare = (el, opts = {}) => {
  if (!dareNow || opts.fresh !== false) dareNow = { idx: drawDare(), forced: opts.forced || null, by: opts.by || null };
  const d = dares[dareNow.idx], f = dareNow.forced;
  el.innerHTML = `
    ${navBar('Dares', 'Do it, then claim the points')}
    <div class="dare-card">
      ${f ? `<div class="d-forced">${avHTML(f, 'sm')} ${dareNow.by ? `${esc(dareNow.by)} sabotaged ${esc(f)}!` : `${esc(f)}'s turn!`}</div>` : ''}
      <div class="d-emoji">${d.icon}</div>
      <div class="d-text">${esc(d.text)}</div>
      <div class="d-pts">+${d.pts} pts</div>
    </div>
    <div class="spacer"></div>
    ${f ? `
      <button class="btn btn-good mt" data-act="dareDone">✅ ${esc(f)} did it! +${d.pts}</button>
      <button class="btn btn-bad" data-act="dareChicken">🐔 ${esc(f)} chickened out (−25)</button>` : `
      <button class="btn btn-good mt" data-act="dareDone">✅ Done! Who did it?</button>`}
    <button class="btn btn-ghost" data-act="dareNew">🎲 Different dare</button>`;
  later(() => say(d.text, { force: true, echo: false }), 350);
};
async function dareDone() {
  const d = dares[dareNow.idx];
  const p = dareNow.forced || await pickPlayer({ icon: d.icon, title: 'Who did the dare?', sub: `+${d.pts} pts` });
  if (!isPlayer(p)) return;
  addPoints(p, d.pts, 'dares');
  count('dares');
  sfx.points(); quip('dare');
  dareNow = null;
  later(() => go('home'), 900);
}

// ── Would you rather ───────────────────────────────────────────────────────
let W = null;
RENDER.wyr = (el, fresh = true) => {
  if (!W || fresh === true) {
    if (S.usedWYR.length >= wyrBank.length) S.usedWYR = [];
    const open = wyrBank.map((_, i) => i).filter(i => !S.usedWYR.includes(i));
    const idx = pick(open);
    S.usedWYR.push(idx); save();
    W = { q: wyrBank[idx], votes: {}, revealed: false };
    nav.args = [false];
    later(() => say(`Would you rather: ${W.q.a}... or... ${W.q.b}?`, { force: true, echo: false }), 300);
  }
  const va = S.players.filter(p => W.votes[p] === 'a'), vb = S.players.filter(p => W.votes[p] === 'b');
  const tot = va.length + vb.length || 1;
  const nVoted = va.length + vb.length;
  const opt = (side, text, list) => `
    <div class="wyr-opt ${side}">
      ${W.revealed ? `<div class="wyr-fill" style="width:${list.length / tot * 100}%"></div>` : ''}
      <span class="ab">${side.toUpperCase()}</span>
      <span>${esc(text)}${W.revealed ? `<span class="wyr-count">${list.length} ${list.map(avatar).join('')}</span>` : ''}</span>
    </div>`;
  el.innerHTML = `
    ${navBar('Would You Rather', W.revealed ? 'The car has spoken' : 'Everyone votes · majority gets +10')}
    ${opt('a', W.q.a, va)}
    <div class="wyr-or">OR</div>
    ${opt('b', W.q.b, vb)}
    ${W.revealed ? '' : `
      <div class="section-label">Votes</div>
      <div class="vote-list">${S.players.map((p, i) => `
        <div class="vote-row">${avHTML(p)}<span class="vname">${esc(p)}</span>
          <button class="vb a ${W.votes[p] === 'a' ? 'on' : ''}" data-act="vote" data-i="${i}" data-c="a">A</button>
          <button class="vb b ${W.votes[p] === 'b' ? 'on' : ''}" data-act="vote" data-i="${i}" data-c="b">B</button>
        </div>`).join('')}
      </div>`}
    <div class="spacer"></div>
    ${W.revealed
      ? `<button class="btn btn-go mt" data-act="wyrNext">Next question →</button><button class="btn btn-ghost" data-act="home">Home</button>`
      : `<button class="btn btn-go mt" data-act="wyrReveal" ${nVoted ? '' : 'disabled'}>${nVoted === S.players.length ? 'Reveal! 🎉' : `Reveal (${nVoted}/${S.players.length} voted)`}</button>`}`;
};
function wyrReveal() {
  if (W.revealed) return;
  W.revealed = true;
  const a = Object.values(W.votes).filter(v => v === 'a').length, b = Object.values(W.votes).filter(v => v === 'b').length;
  const maj = a > b ? 'a' : b > a ? 'b' : null;
  for (const [p, c] of Object.entries(W.votes)) if (isPlayer(p)) addPoints(p, 15 + (maj && c === maj ? 10 : 0), 'wyr', { quiet: true });
  count('wyr');
  sfx.points();
  say(maj ? `${maj.toUpperCase()} wins, ${Math.max(a, b)} to ${Math.min(a, b)}!` : "It's a tie! This car is divided!", { force: true });
  render();
}

// ── Story builder ──────────────────────────────────────────────────────────
RENDER.story = el => {
  if (!S.story) {
    const prompt = pick(STORY_PROMPTS);
    S.story = { date: Date.now(), turn: 0, sentences: [{ p: 'Al', text: prompt }] };
    save();
    later(() => say(`${prompt} ... Take it away!`, { force: true }), 300);
  }
  const st = S.story;
  const who = S.players[st.turn % S.players.length];
  el.innerHTML = `
    ${navBar('Story Builder', '+25 per line · Al reads the finished story', `<button class="icon-btn" data-act="go" data-to="stories" aria-label="Past stories">📚</button>`)}
    <div class="story-scroll" id="story-scroll">${st.sentences.map(s => `<span class="sent ${s.p === 'Al' ? 'al' : ''}" style="--pc:${color(s.p)}">${esc(s.text)}</span> `).join('')}</div>
    <div class="turn-pill" style="--pc:${color(who)}">${avHTML(who)}<span>${esc(who)}, add the next line</span><button class="link-btn" style="margin-left:auto" data-act="storySkip">skip</button></div>
    <div class="row"><input id="story-input" type="text" maxlength="160" placeholder="And then…" enterkeyhint="send" autocomplete="off"></div>
    <button class="btn btn-go mt" data-act="storyAdd">Add line (+25)</button>
    <button class="btn btn-ghost" data-act="storyEnd">📜 The End · read it aloud</button>`;
  const sc = $('#story-scroll', el); sc.scrollTop = sc.scrollHeight;
};
function storyAdd() {
  const input = $('#story-input');
  const text = input.value.trim();
  if (!text) { toast('Type a line first ✏️'); input.focus(); return; }
  const st = S.story, p = S.players[st.turn % S.players.length];
  st.sentences.push({ p, text: /[.!?…]$/.test(text) ? text : text + '.' });
  st.turn++;
  addPoints(p, 25, 'story', { at: centerOf(input) });
  sfx.points(); save(); render();
  $('#story-input')?.focus();
}
function storyEnd() {
  const st = S.story;
  if (!st || st.sentences.length <= 1) { S.story = null; save(); go('home'); return; }
  S.stories.unshift(st);
  S.story = null;
  count('stories');
  save();
  go('stories');
  later(() => say(st.sentences.map(s => s.text).join(' ') + ' ... The end!', { force: true, rate: Math.max(.85, S.settings.rate - .05) }), 400);
}
RENDER.stories = el => {
  el.innerHTML = `
    ${navBar('Story Shelf', `${S.stories.length} stor${S.stories.length === 1 ? 'y' : 'ies'} written on this trip`, '', 'story-back')}
    ${S.stories.length ? S.stories.map((s, i) => `
      <div class="past-story">
        <div class="meta">${new Date(s.date).toLocaleString([], { weekday:'short', hour:'numeric', minute:'2-digit' })} · ${[...new Set(s.sentences.filter(x => x.p !== 'Al').map(x => x.p))].map(p => avatar(p)).join(' ')}</div>
        <div class="txt">${s.sentences.map(x => esc(x.text)).join(' ')}</div>
        <div class="row mt"><button class="btn btn-sm btn-ghost" data-act="storyRead" data-i="${i}">🎙️ Read aloud</button><button class="link-btn" style="margin-left:auto" data-act="storyDelete" data-i="${i}">Delete</button></div>
      </div>`).join('') : `<div class="panel center muted">No stories yet. Go write one!</div>`}
    <div class="spacer"></div>
    <button class="btn btn-go mt" data-act="go" data-to="story">✍️ ${S.story ? 'Back to the story' : 'Start a new story'}</button>`;
};

// ── Spin the wheel ─────────────────────────────────────────────────────────
let wheelRot = 0, wheelBusy = false, wheelResult = null;
function wheelSVG() {
  const n = WHEEL.length, R = 176, cx = 200, cy = 200, step = 360 / n;
  const pt = (deg, r) => { const a = (deg - 90) * Math.PI / 180; return [cx + r * Math.cos(a), cy + r * Math.sin(a)]; };
  let segs = '';
  WHEEL.forEach((w, i) => {
    const [x1, y1] = pt(i * step, R), [x2, y2] = pt((i + 1) * step, R);
    const mid = (i + .5) * step;
    const [ex, ey] = pt(mid, R * .8), [lx, ly] = pt(mid, R * .5);
    segs += `<path d="M${cx},${cy} L${x1.toFixed(1)},${y1.toFixed(1)} A${R},${R} 0 0,1 ${x2.toFixed(1)},${y2.toFixed(1)} Z" fill="${w.color}" stroke="#fff" stroke-opacity=".9" stroke-width="3"/>
      <path d="M${cx},${cy} L${x1.toFixed(1)},${y1.toFixed(1)} A${R},${R} 0 0,1 ${x2.toFixed(1)},${y2.toFixed(1)} Z" fill="url(#wShine)"/>
      <text x="${ex.toFixed(1)}" y="${ey.toFixed(1)}" font-size="30" text-anchor="middle" dominant-baseline="central" transform="rotate(${mid} ${ex.toFixed(1)} ${ey.toFixed(1)})">${w.emoji}</text>
      <text x="${lx.toFixed(1)}" y="${ly.toFixed(1)}" font-size="${w.label.length > 5 ? 13 : 16}" fill="#fff" font-family="Bungee, Arial Black, sans-serif" text-anchor="middle" dominant-baseline="central" transform="rotate(${mid - 90} ${lx.toFixed(1)} ${ly.toFixed(1)})">${w.label}</text>`;
  });
  const pegs = Array.from({ length: n * 2 }, (_, i) => { const [x, y] = pt(i * step / 2, 188); return `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="4.5" fill="#fff3c4"/>`; }).join('');
  return `<svg class="wheel" viewBox="0 0 400 400">
    <defs>
      <radialGradient id="wShine" cx="50%" cy="50%" r="50%"><stop offset=".55" stop-color="#fff" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity=".22"/></radialGradient>
      <linearGradient id="wRim" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffd25e"/><stop offset="1" stop-color="#e0542b"/></linearGradient>
      <radialGradient id="wHub" cx="40%" cy="35%"><stop offset="0" stop-color="#fff7d6"/><stop offset="1" stop-color="#ffb347"/></radialGradient>
    </defs>
    <circle cx="200" cy="200" r="198" fill="url(#wRim)"/>
    <circle cx="200" cy="200" r="180" fill="#1d1442"/>
    <g class="rotor" id="wheel-rotor" style="transform:rotate(${wheelRot}deg)">${segs}${pegs}</g>
    <circle cx="200" cy="200" r="40" fill="url(#wHub)" stroke="#fff" stroke-width="4" data-act="spin" style="cursor:pointer"/>
    <text x="200" y="201" font-size="18" text-anchor="middle" dominant-baseline="central" fill="#7a2a0a" font-family="Bungee, Arial Black, sans-serif" style="pointer-events:none">SPIN</text>
  </svg>`;
}
RENDER.wheel = el => {
  el.innerHTML = `
    ${navBar('Spin the Wheel', 'Tap SPIN and let fate drive')}
    <div class="wheel-wrap">
      <svg class="wheel-pointer" id="wheel-pointer" viewBox="0 0 34 44"><path d="M17 42 L3 8 Q17 -4 31 8 Z" fill="#fff" stroke="#e0542b" stroke-width="3"/><circle cx="17" cy="12" r="4" fill="#e0542b"/></svg>
      ${wheelSVG()}
    </div>
    <div id="wheel-out">${wheelResult ? wheelResultHTML(wheelResult) : ''}</div>
    <div class="spacer"></div>
    <button class="btn btn-go mt" data-act="spin" id="spin-btn">🎡 SPIN!</button>`;
};

function spinWheel() {
  if (wheelBusy || !S.players.length) return;
  wheelBusy = true;
  wheelResult = null;
  $('#wheel-out').innerHTML = '';
  $('#spin-btn').disabled = true;
  const n = WHEEL.length, step = 360 / n;
  const win = Math.floor(Math.random() * n);
  const jitter = (Math.random() - .5) * step * .7;
  const want = ((360 - ((win + .5) * step + jitter)) % 360 + 360) % 360;
  const base = wheelRot - (((wheelRot % 360) + 360) % 360);
  let final = base + 360 * 6 + want;
  if (final - wheelRot < 360 * 5) final += 360;
  wheelRot = final;
  const rotor = $('#wheel-rotor');
  rotor.style.transition = 'transform 4.6s cubic-bezier(.15,.65,.12,1)';
  rotor.style.transform = `rotate(${final}deg)`;
  sfx.whoosh();
  say('Round and round she goes!', { force: true });
  // Click the pointer every time a peg passes it.
  let lastSeg = -1;
  const pointer = $('#wheel-pointer');
  const tok = nav.token;
  (function watch() {
    if (tok !== nav.token || !wheelBusy) return;
    const m = getComputedStyle(rotor).transform;
    if (m && m !== 'none') {
      const [a, b] = m.slice(7, -1).split(',').map(Number);
      const deg = ((Math.atan2(b, a) * 180 / Math.PI) % 360 + 360) % 360;
      const seg = Math.floor(deg / (step / 2));
      if (seg !== lastSeg) { if (lastSeg >= 0) { sfx.tick(); pointer.classList.remove('flick'); void pointer.offsetWidth; pointer.classList.add('flick'); } lastSeg = seg; }
    }
    requestAnimationFrame(watch);
  })();
  later(() => { wheelBusy = false; $('#spin-btn').disabled = false; resolveWheel(WHEEL[win]); }, 4750);
}

function resolveWheel(w) {
  const rp = pick(S.players);
  count('spins');
  sfx.fanfare(); vibe([40, 40, 80]);
  const r = { w, p: rp, text: '', btn: null };
  switch (w.id) {
    case 'bonus': addPoints(rp, 75, 'wheel', { quiet: true }); r.text = `${rp} wins 75 bonus points!`; break;
    case 'all': S.players.forEach(p => addPoints(p, 25, 'wheel', { quiet: true })); r.p = null; r.text = 'Everybody gets 25 points!'; break;
    case 'card': { const got = earnCard(rp); r.text = got ? `${rp} draws a sabotage card!` : `${rp}'s hand is full! No card.`; break; }
    case 'joke': r.p = null; r.text = 'Al has a joke for you…'; later(() => { count('jokes'); say(pick(DAD_JOKES), { force: true }); }, 600); break;
    case 'dare': r.text = `${rp} has to do a dare!`; r.btn = { act: 'wheelGo', label: `🎭 Dare for ${rp} →` }; break;
    case 'trivia': r.text = `${rp} is in the trivia hot seat!`; r.btn = { act: 'wheelGo', label: `🧠 Start ${rp}'s round →` }; break;
    case 'wyr': r.p = null; r.text = 'Would You Rather time!'; r.btn = { act: 'wheelGo', label: '🤔 Let\'s vote →' }; break;
    case 'duel': {
      const [a, b] = shuffle(S.players);
      r.p = a; r.p2 = b;
      r.text = b ? `${a} vs ${b}. Duel!` : 'Need two players for a duel. Free spin!';
      if (b) r.btn = { act: 'wheelGo', label: '⚔️ Start the duel →' };
      break;
    }
  }
  wheelResult = r;
  $('#wheel-out').innerHTML = wheelResultHTML(r);
  if (!['joke'].includes(w.id)) say(r.text, { force: true });
}
const wheelResultHTML = r => `<div class="wheel-result">
  <div class="wr-emoji">${r.w.emoji}</div>
  ${r.p ? `<div class="row" style="justify-content:center;margin-top:6px">${avHTML(r.p)}${r.p2 ? `<b class="display">VS</b>${avHTML(r.p2)}` : ''}</div>` : ''}
  <div class="wr-text">${esc(r.text)}</div>
  ${r.btn ? `<button class="btn btn-go mt" data-act="${r.btn.act}">${esc(r.btn.label)}</button>` : ''}
</div>`;
function wheelGo() {
  const r = wheelResult; if (!r) return;
  wheelResult = null;
  if (r.w.id === 'dare') go('dare', { forced: r.p });
  else if (r.w.id === 'trivia') startTrivia(r.p, RANDOM_MIX);
  else if (r.w.id === 'wyr') go('wyr', true);
  else if (r.w.id === 'duel') { duelPick = [r.p, r.p2]; startDuel(r.p, r.p2); }
}

// ── Sabotage cards ─────────────────────────────────────────────────────────
RENDER.cards = el => {
  el.innerHTML = `
    ${navBar('Sabotage Cards', 'Earned by scoring · play them at the worst possible moment')}
    ${S.players.map((p, i) => {
      const hand = S.cards[p] || [], bf = S.buffs[p] || {};
      return `<div class="section-label" style="margin-top:16px">${avHTML(p, 'sm')} ${esc(p)} · ${hand.length}/${HAND_LIMIT}
        ${bf.shield ? '<span class="buff">🛡️ Shielded</span>' : ''}${bf.double ? '<span class="buff">🌟 Double ready</span>' : ''}</div>
        ${hand.length ? `<div class="hand">${hand.map((t, k) => `<button class="scard ${t}" data-act="cardTap" data-i="${i}" data-k="${k}"><span class="sc-emoji">${CARDS[t].icon}</span><span class="sc-name">${CARDS[t].name}</span><span class="sc-desc">${CARDS[t].desc}</span></button>`).join('')}</div>`
          : `<div class="hand-empty">No cards yet.</div>`}`;
    }).join('')}
    <div class="panel mt-lg small muted" style="line-height:1.6">
      🃏 <b style="color:var(--text)">How to get cards:</b> any time you score there's a 12% chance to draw one. Perfect trivia rounds and the wheel give them too. Max ${HAND_LIMIT} in hand.
    </div>`;
};
async function cardTap(pi, k) {
  const p = S.players[pi], type = S.cards[p]?.[k];
  if (!type) return;
  const c = CARDS[type];
  const ok = await ask({ iconHTML: `<div class="center"><span class="scard ${type}" style="display:inline-flex;cursor:default"><span class="sc-emoji">${c.icon}</span><span class="sc-name">${c.name}</span><span class="sc-desc">${c.desc}</span></span></div>`, title: `${esc(p)}: play ${c.name}?`, ok: `Play ${c.name}` });
  if (!ok) return;
  let target = null;
  if (c.target) {
    target = await pickPlayer({ icon: c.icon, title: `Who's the target?`, sub: c.desc, exclude: [p] });
    if (!isPlayer(target)) return;
  }
  const hand = S.cards[p]; const idx = hand.indexOf(type);
  if (idx < 0) return;
  hand.splice(idx, 1);
  count('cardsPlayed');
  const shielded = target && S.buffs[target]?.shield;
  if (shielded) {
    S.buffs[target].shield = false;
    sfx.buzz(); vibe([30, 30, 30]);
    say(`Blocked! ${target}'s shield stopped the ${c.name}!`, { force: true });
    save(); render();
    return;
  }
  sfx.card();
  if (type === 'steal') {
    const amt = Math.min(50, Math.max(0, S.scores[target] || 0));
    addPoints(target, -amt, 'cards', { quiet: true });
    addPoints(p, amt, 'cards');
    say(amt ? `Heist! ${p} swiped ${amt} points from ${target}!` : `${target} is broke. Nothing to steal!`, { force: true });
  } else if (type === 'double') {
    (S.buffs[p] || (S.buffs[p] = {})).double = true;
    say(`${p} loaded a Double Up. Next score counts twice!`, { force: true });
  } else if (type === 'shield') {
    (S.buffs[p] || (S.buffs[p] = {})).shield = true;
    say(`${p} raises a shield. Bring it on!`, { force: true });
  } else if (type === 'sabotage') {
    save();
    go('dare', { forced: target, by: p });
    return;
  }
  save(); render();
}

// ── Trip recap ─────────────────────────────────────────────────────────────
function recapText() {
  const r = ranked();
  return [
    '🚗 Stueber Road Trip Showdown — Recap',
    S.tripStart ? `⏱️ ${fmtDur(Date.now() - S.tripStart)} on the road` : '',
    `🚘 ${Object.keys(S.plates).length}/51 states · 🔭 ${S.counters.huntFinds || 0} hunt finds · 🎯 ${S.players.reduce((n, p) => n + (S.bingo[p]?.lines || 0), 0)} bingo lines`,
    `🎭 ${S.counters.dares || 0} dares · 🧠 ${S.counters.triviaRounds || 0} trivia rounds · 📖 ${S.stories.length} stories`,
    '',
    ...r.map((p, i) => `${['🥇','🥈','🥉'][i] || `#${i + 1}`} ${p}: ${S.scores[p] || 0}`),
  ].filter(x => x !== null).join('\n');
}
RENDER.recap = el => {
  const stat = (v, l) => `<div class="stat-pill"><div class="v">${v}</div><div class="l">${l}</div></div>`;
  const total = S.players.reduce((a, p) => a + (S.scores[p] || 0), 0);
  el.innerHTML = `
    ${navBar('Trip Recap', S.tripStart ? `${fmtDur(Date.now() - S.tripStart)} on the road · started ${new Date(S.tripStart).toLocaleDateString([], { weekday:'long' })}` : 'Just getting started')}
    <div class="stat-grid">
      ${stat(total.toLocaleString(), 'Total pts')}
      ${stat(`${Object.keys(S.plates).length}`, 'States')}
      ${stat(S.counters.huntFinds || 0, 'Hunt finds')}
      ${stat(S.players.reduce((n, p) => n + (S.bingo[p]?.lines || 0), 0), 'Bingo lines')}
      ${stat(S.counters.triviaRounds || 0, 'Trivia rounds')}
      ${stat(S.counters.duels || 0, 'Duels')}
      ${stat(S.counters.dares || 0, 'Dares')}
      ${stat(S.counters.wyr || 0, 'WYR votes')}
      ${stat(S.stories.length, 'Stories')}
      ${stat(S.counters.spins || 0, 'Wheel spins')}
      ${stat(S.counters.cardsPlayed || 0, 'Cards played')}
      ${stat(S.counters.jokes || 0, 'Dad jokes')}
    </div>
    <div class="section-label">Who scored what</div>
    ${ranked().map((p, i) => `<div class="stand-row ${i === 0 ? 'first' : ''}"><span class="rank">${['🥇','🥈','🥉'][i] || i + 1}</span>${avHTML(p)}<div style="flex:1;min-width:0"><div class="sname">${esc(p)}</div>${mixBar(p)}</div><span class="sscore">${S.scores[p] || 0}</span></div>`).join('')}
    <div class="spacer"></div>
    <button class="btn btn-go mt" data-act="share">📤 Share the recap</button>`;
};
async function shareRecap() {
  const text = recapText();
  if (navigator.share) { try { await navigator.share({ title: 'Stueber Road Trip Showdown', text }); return; } catch (e) { if (e.name === 'AbortError') return; } }
  try { await navigator.clipboard.writeText(text); toast('Copied to clipboard 📋'); }
  catch (e) { openSheet(`${sheetHead({ icon: '📋', title: 'Copy this' })}<div class="sheet-body"><pre style="white-space:pre-wrap;font-family:inherit;font-size:.9rem">${esc(text)}</pre></div>`); }
}

// ── Victory ────────────────────────────────────────────────────────────────
RENDER.victory = el => {
  const w = S.gameWon;
  el.innerHTML = `
    <div class="victory">
      <div class="trophy">🏆</div>
      <div class="winner">${avHTML(w, 'xl')}<div class="wname">${esc(w)}</div><div class="muted">first to ${S.settings.winTarget.toLocaleString()} · ${(S.scores[w] || 0).toLocaleString()} pts</div></div>
    </div>
    <div class="section-label">Final stretch</div>
    ${raceHTML().replace('data-act="go" data-to="standings"', '')}
    <div class="spacer"></div>
    <button class="btn btn-go mt" data-act="go" data-to="recap">📊 Trip Recap</button>
    <button class="btn btn-ghost" data-act="home">Keep playing for fun</button>
    <button class="btn btn-bad" data-act="newTrip">Start a Brand-New Trip</button>`;
  animateRace(el);
  confetti(); setTimeout(confetti, 700); setTimeout(confetti, 1500);
  sfx.fanfare(); vibe([100, 60, 100, 60, 220]);
  quip('victory', { force: true });
};

// ── Al's voice ─────────────────────────────────────────────────────────────
RENDER.voice = el => {
  loadVoices();
  const cur = alVoice();
  const list = [...voices.filter(v => /^en/i.test(v.lang)), ...voices.filter(v => !/^en/i.test(v.lang))];
  el.innerHTML = `
    ${navBar("Al's Voice", 'Pick the voice that hurts the least')}
    <div class="panel">
      <div class="slider-row"><label>Speed</label><input type="range" min="0.6" max="1.5" step="0.05" value="${S.settings.rate}" data-input="rate"><span class="val" id="rate-val">${S.settings.rate.toFixed(2)}×</span></div>
      <div class="slider-row"><label>Pitch</label><input type="range" min="0.5" max="1.5" step="0.05" value="${S.settings.pitch}" data-input="pitch"><span class="val" id="pitch-val">${S.settings.pitch.toFixed(2)}</span></div>
      <button class="btn btn-sm btn-ghost mt" data-act="voiceTest">▶ Test Al</button>
    </div>
    <div class="section-label">Voices on this device</div>
    <div class="tiny faint mb">💡 <b>HQ</b> voices (Natural / Neural / Online / Enhanced) sound the most human.</div>
    ${list.length ? list.map(v => {
      const i = voices.indexOf(v);
      const hq = /Natural|Neural|Online|Premium|Enhanced/i.test(v.name);
      const on = cur && v.name === cur.name;
      return `<div class="voice-row ${on ? 'on' : ''}"><div style="flex:1;min-width:0"><div class="vn">${esc(v.name)}${hq ? '<span class="hq">HQ</span>' : ''}</div><div class="vl">${esc(v.lang)}${v.default ? ' · default' : ''}</div></div>
        <button class="btn btn-sm btn-ghost" data-act="voicePreview" data-i="${i}">▶</button>
        <button class="btn btn-sm ${on ? 'btn-good' : 'btn-go'}" style="margin:0" data-act="voicePick" data-i="${i}">${on ? '✓' : 'Use'}</button></div>`;
    }).join('') : `<div class="panel center muted">No voices loaded yet. Give it a second.</div>`}`;
};

// ═══════════════════════════════════════════════════════════════════════════
// ACTIONS — every button uses data-act; one listener dispatches them all.
// ═══════════════════════════════════════════════════════════════════════════
const ACTIONS = {
  sheet: el => closeSheet(el.dataset.val),
  home: () => go('home'),
  go: el => go(el.dataset.to),
  'story-back': () => go(S.story ? 'story' : 'home'),

  // setup
  addPlayer: () => {
    const input = $('#new-player'), name = input.value.trim().replace(/\s+/g, ' ');
    if (!name) { input.focus(); return; }
    if (S.players.some(p => p.toLowerCase() === name.toLowerCase())) { toast(`${name} is already in the car`); return; }
    if (S.players.length >= 8) { toast('The car is full! (8 max)'); return; }
    const usedAv = new Set(S.players.map(avatar)), usedCol = new Set(S.players.map(color));
    S.players.push(name);
    S.meta[name] = { avatar: AVATARS.find(a => !usedAv.has(a)) || pick(AVATARS), color: COLORS.find(c => !usedCol.has(c)) || pick(COLORS) };
    S.scores[name] = S.scores[name] || 0;
    sfx.points(); save(); render();
    $('#new-player')?.focus();
  },
  cycleAvatar: el => {
    const p = S.players[+el.dataset.i];
    const used = new Set(S.players.filter(x => x !== p).map(avatar));
    let k = AVATARS.indexOf(avatar(p));
    do { k = (k + 1) % AVATARS.length; } while (used.has(AVATARS[k]));
    S.meta[p].avatar = AVATARS[k];
    sfx.vote(); save(); render();
  },
  removePlayer: async el => {
    const p = S.players[+el.dataset.i];
    if ((S.scores[p] || 0) > 0 && !await ask({ icon: avatar(p), title: `Remove ${esc(p)}?`, sub: `Their ${S.scores[p]} points and cards go with them.`, ok: 'Remove', danger: true })) return;
    S.players = S.players.filter(x => x !== p);
    for (const k of ['scores','stats','meta','bingo','cards','buffs']) delete S[k][p];
    if (S.gameWon === p) S.gameWon = null;
    save(); render();
  },
  setTarget: el => { S.settings.winTarget = +el.dataset.v; if (S.gameWon && S.scores[S.gameWon] < S.settings.winTarget) S.gameWon = null; save(); render(); },
  startTrip: () => { if (!S.tripStart) S.tripStart = Date.now(); save(); go('home'); },
  newTrip: async () => {
    if (!await ask({ icon: '🧳', title: 'Start a brand-new trip?', sub: 'Scores, plates, hunts, bingo cards and sabotage cards reset. Players, settings and saved stories stay.', ok: 'New trip', danger: true })) return;
    const keep = { players: S.players, meta: S.meta, settings: S.settings, stories: S.stories };
    S = Object.assign(freshState(), keep);
    S.players.forEach(p => { S.scores[p] = 0; });
    S.tripStart = Date.now();
    Object.keys(racePct).forEach(k => delete racePct[k]);
    save(); go('home'); toast('New trip! Buckle up 🚗');
  },
  resetScores: async () => {
    if (!await ask({ icon: '🔄', title: 'Reset all scores to 0?', sub: 'Plates, hunts and bingo marks stay on the board.', ok: 'Reset scores', danger: true })) return;
    S.players.forEach(p => { S.scores[p] = 0; }); S.stats = {}; S.gameWon = null;
    save(); render();
  },

  // toggles & Al
  toggleMute: () => { S.settings.muted = !S.settings.muted; if (S.settings.muted) alStop(); save(); render(); toast(S.settings.muted ? '🔇 Sound off' : '🔊 Sound on'); },
  toggleAl: () => { S.settings.al = !S.settings.al; if (!S.settings.al) alStop(); save(); render(); if (S.settings.al) say("I'm back! Did you miss me?", { force: true }); else toast('🤐 Al will stay quiet'); },
  joke: () => { count('jokes'); save(); say(pick(DAD_JOKES), { force: true }); },
  awty: () => say(pick(AWTY_QUIPS), { force: true }),
  voiceTest: () => say("Hi! I'm Al, your road trip co-pilot. Buckle up, Stuebers!", { force: true }),
  voicePreview: el => { const v = voices[+el.dataset.i]; if (v) say(`Hi, I'm Al. This is ${v.name.split(/[-(]/)[0].trim()}.`, { force: true, voice: v }); },
  voicePick: el => { const v = voices[+el.dataset.i]; if (!v) return; S.settings.voice = v.name; save(); render(); say('How do I sound now? Better, I hope!', { force: true }); },

  // trivia
  triviaPlayer: el => { triviaPickPlayer = S.players[+el.dataset.i]; sfx.vote(); render(); },
  triviaCat: el => { S.settings.category = el.dataset.c; save(); sfx.vote(); render(); },
  triviaStart: () => isPlayer(triviaPickPlayer) && startTrivia(triviaPickPlayer, S.settings.category),
  triviaAgain: () => startTrivia(T.player, T.cat),
  answer: el => answer(+el.dataset.k),
  quitTrivia: async () => { if (await ask({ icon: '🚪', title: 'Quit this round?', sub: `${esc(T.player)} loses the ${T.pts} points from this round.`, ok: 'Quit', danger: true })) go('home'); },

  // duel
  duelPlayer: el => {
    const p = S.players[+el.dataset.i];
    duelPick = duelPick.includes(p) ? duelPick.filter(x => x !== p) : [...duelPick, p].slice(-2);
    sfx.vote(); render();
  },
  duelStart: () => duelPick.length === 2 && startDuel(duelPick[0], duelPick[1]),
  duelRematch: () => startDuel(D.a, D.b),
  buzz: el => duelBuzz(el.dataset.side),
  duelAnswer: el => duelAnswer(+el.dataset.k),
  quitDuel: async () => { if (await ask({ icon: '🏳️', title: 'Abandon the duel?', sub: 'No points are awarded.', ok: 'Quit', danger: true })) go('home'); },

  // plates
  plate: el => plateTap(el.dataset.s),
  plateBonus: el => plateBonus(el.dataset.id),
  resetPlates: async () => {
    if (!await ask({ icon: '🚘', title: 'Clear the whole map?', sub: 'Points already earned are kept.', ok: 'Clear map', danger: true })) return;
    S.plates = {}; S.plateExtras = []; S.plateMilestones = []; save(); render();
  },

  // hunt
  huntStart: el => { newHuntRound(el.dataset.env); render(); },
  huntItem: el => huntTap(el.dataset.id),
  huntEnd: () => endHuntRound(false),

  // bingo
  bingoView: el => { bingoViewer = S.players[+el.dataset.i]; sfx.vote(); render(); },
  bcell: el => bingoCell(+el.dataset.k),
  bingoNewCard: async () => {
    const p = bingoViewer, b = S.bingo[p];
    if (b?.lines && !await ask({ icon: '🎯', title: `New card for ${esc(p)}?`, sub: 'Points already earned are kept.', ok: 'Deal a new card' })) return;
    delete S.bingo[p]; save(); render();
  },
  bingoReset: async () => {
    if (!await ask({ icon: '🎯', title: 'Deal everyone a new card?', sub: 'Points already earned are kept.', ok: 'New cards for all', danger: true })) return;
    S.bingo = {}; save(); render();
  },

  // dares
  dareDone: () => dareDone(),
  dareNew: () => { dareNow = { idx: drawDare(), forced: dareNow?.forced, by: dareNow?.by }; nav.args = [{ fresh: false }]; render(); },
  dareChicken: () => {
    const p = dareNow.forced;
    addPoints(p, -25, 'dares', { noCard: true });
    sfx.buzz(); say(`Bawk bawk! ${p} chickened out!`, { force: true });
    dareNow = null;
    later(() => go('home'), 1100);
  },

  // wyr
  vote: el => { if (W.revealed) return; W.votes[S.players[+el.dataset.i]] = el.dataset.c; sfx.vote(); render(); },
  wyrReveal: () => wyrReveal(),
  wyrNext: () => { nav.args = [true]; render(); },

  // story
  storyAdd: () => storyAdd(),
  storySkip: () => { S.story.turn++; save(); render(); },
  storyEnd: () => storyEnd(),
  storyRead: el => { const s = S.stories[+el.dataset.i]; if (s) say(s.sentences.map(x => x.text).join(' '), { force: true }); },
  storyDelete: async el => { if (await ask({ icon: '🗑️', title: 'Delete this story?', ok: 'Delete', danger: true })) { S.stories.splice(+el.dataset.i, 1); save(); render(); } },

  // wheel & cards
  spin: () => spinWheel(),
  wheelGo: () => wheelGo(),
  cardTap: el => cardTap(+el.dataset.i, +el.dataset.k),
  share: () => shareRecap(),
};

document.addEventListener('click', e => {
  const el = e.target.closest('[data-act]');
  if (!el || el.disabled) return;
  const fn = ACTIONS[el.dataset.act];
  if (fn) { e.preventDefault(); fn(el, e); }
});
document.addEventListener('input', e => {
  const k = e.target.dataset?.input;
  if (k === 'rate' || k === 'pitch') {
    S.settings[k] = parseFloat(e.target.value);
    $(`#${k}-val`).textContent = k === 'rate' ? `${S.settings.rate.toFixed(2)}×` : S.settings.pitch.toFixed(2);
    save();
  }
});
document.addEventListener('keydown', e => {
  if (e.key !== 'Enter') return;
  if (e.target.id === 'new-player') ACTIONS.addPlayer();
  if (e.target.id === 'story-input') storyAdd();
});
document.addEventListener('keydown', e => { if (e.key === 'Escape' && $('#sheet')) closeSheet(null); });

// ═══════════════════════════════════════════════════════════════════════════
// BOOT
// ═══════════════════════════════════════════════════════════════════════════
let wakeLock = null;
async function keepAwake() {
  if (!('wakeLock' in navigator) || wakeLock) return;
  try { wakeLock = await navigator.wakeLock.request('screen'); wakeLock.addEventListener('release', () => { wakeLock = null; }); } catch (e) {}
}
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') keepAwake(); });
document.addEventListener('pointerdown', () => { ctx(); keepAwake(); }, { once: true });

if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
}

load();
go(S.players.length && S.tripStart ? 'home' : 'setup');

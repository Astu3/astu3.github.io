// Nest Egg: the family bank. Kids have Spend, Save and Give jars; parents are the bank.
// Everything is stored in this browser (localStorage). Money is kept in whole cents.
'use strict';

const KEY = 'nestegg-v1';
const DAY = 864e5;
const JARS = ['spend', 'save', 'give'];
const JAR = {
  spend: { name: 'Spend', color: '#4cc9f0', emoji: '🛍️', blurb: 'For things you want soon' },
  save:  { name: 'Save',  color: '#f4a261', emoji: '🐷', blurb: 'Earns interest' },
  give:  { name: 'Give',  color: '#c77dff', emoji: '💜', blurb: 'For helping others' },
};
const EMOJIS = ['🦊', '🐻', '🐺', '🦉', '🐢', '🦄', '🐯', '🐸', '🐧', '🦖', '🐙', '🐝', '🦅', '🐬', '⚽', '🏒', '⛳', '🏈', '🎨', '🚀', '🎸', '🌟'];
const COLORS = ['#4cc9f0', '#f4a261', '#c77dff', '#52b788', '#ef476f', '#ffd166', '#90e0ef', '#e76f51'];
const GOAL_EMOJIS = ['🎮', '🚲', '🧱', '⚽', '🛹', '📚', '🎧', '🧸', '🎨', '🏒', '⛳', '🎟️', '👟', '🐶', '🎁', '🍦'];
const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const STREAK_STEPS = [7, 30, 90, 180, 365, 730];
const RATE_PRESETS = [
  { rate: 4, label: 'Real bank', note: '4% a year, like a good savings account' },
  { rate: 12, label: 'Generous', note: '12% a year: 1% a month' },
  { rate: 60, label: 'Bank of Mom & Dad', note: '5% a month, so kids can really see it grow' },
];

// ── Small helpers ───────────────────────────────────────────────────────────
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

function money(c, opts = {}) {
  const neg = c < 0, v = Math.abs(c) / 100;
  const whole = Math.abs(c) % 100 === 0;
  const s = v.toLocaleString('en-US', { minimumFractionDigits: opts.short && whole ? 0 : 2, maximumFractionDigits: opts.short && whole ? 0 : 2 });
  return (neg ? '−' : opts.sign && c > 0 ? '+' : '') + '$' + s;
}
const moneyAxis = (c) => {
  const v = c / 100;
  if (Math.abs(v) >= 1e6) return '$' + (v / 1e6).toFixed(v % 1e6 ? 1 : 0) + 'M';
  if (Math.abs(v) >= 1e4) return '$' + Math.round(v / 1e3) + 'k';
  if (Math.abs(v) >= 1e3) return '$' + (v / 1e3).toFixed(v % 1e3 ? 1 : 0) + 'k';
  return '$' + (Number.isInteger(v) ? v : v.toFixed(2));
};
function parseMoney(s) {
  const v = parseFloat(String(s).replace(/[$,\s]/g, ''));
  return isFinite(v) ? Math.round(v * 100) : NaN;
}
const pad = n => String(n).padStart(2, '0');
const dayKey = d => { d = new Date(d); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };
const fromKey = k => { const [y, m, d] = k.split('-').map(Number); return new Date(y, m - 1, d); };
const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
const startOfDay = d => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; };
function fmtDate(t, opts = {}) {
  const d = new Date(t), today = startOfDay(Date.now());
  const diff = Math.round((startOfDay(d) - today) / DAY);
  if (!opts.plain) {
    if (diff === 0) return 'Today';
    if (diff === -1) return 'Yesterday';
    if (diff === 1) return 'Tomorrow';
  }
  return d.toLocaleDateString('en-US', { weekday: opts.noWeekday ? undefined : 'short', month: 'short', day: 'numeric', year: d.getFullYear() !== new Date().getFullYear() ? 'numeric' : undefined });
}
const plural = (n, w, p) => `${n} ${n === 1 ? w : (p || w + 's')}`;
function fmtWait(days) {
  if (days <= 0) return 'now';
  if (days < 14) return plural(days, 'day');
  if (days < 70) return plural(Math.round(days / 7), 'week');
  if (days < 730) return plural(Math.round(days / 30.4), 'month');
  return (days / 365).toFixed(1).replace(/\.0$/, '') + ' years';
}

// ── State ───────────────────────────────────────────────────────────────────
function freshState() {
  return { app: 'nestegg', v: 1, pinHash: null, kids: [], allowanceDay: 6, interestEvery: 'month', sound: true, lastBackup: 0, created: Date.now() };
}
function load() {
  try {
    const s = JSON.parse(localStorage.getItem(KEY));
    if (s && s.app === 'nestegg') return Object.assign(freshState(), s);
  } catch (e) { /* fall through */ }
  return freshState();
}
let state = load();
function save() { localStorage.setItem(KEY, JSON.stringify(state)); }

const ui = { view: 'family', kidId: null, tab: 'jars', parentUntil: 0, lessonId: null, tm: null };
const kidById = id => state.kids.find(k => k.id === id);
const curKid = () => kidById(ui.kidId);
const isParent = () => Date.now() < ui.parentUntil;

// ── The bank engine ─────────────────────────────────────────────────────────
const sortTx = k => k.tx.sort((a, b) => a.t - b.t);
const bal = (k, jar) => k.tx.reduce((s, x) => s + (x.jar === jar ? x.amt : 0), 0);
const total = k => k.tx.reduce((s, x) => s + x.amt, 0);
const periodsPerYear = () => state.interestEvery === 'week' ? 52 : 12;

function lastAllowanceDayOnOrBefore(d) {
  const x = startOfDay(d);
  while (x.getDay() !== state.allowanceDay) x.setDate(x.getDate() - 1);
  return x;
}
function currentPeriodStart(d = Date.now()) {
  const x = startOfDay(d);
  if (state.interestEvery === 'week') return lastAllowanceDayOnOrBefore(x);
  x.setDate(1);
  return x;
}
function nextBoundary(from) {
  const x = startOfDay(from);
  if (state.interestEvery === 'week') return addDays(x, 7);
  return new Date(x.getFullYear(), x.getMonth() + 1, 1);
}

// Lowest Save balance between start and end. Before a kid's very first Save money
// arrives there's nothing to measure, so the clock starts at that first deposit.
function minSave(k, start, end) {
  const xs = k.tx.filter(x => x.jar === 'save').sort((a, b) => a.t - b.t);
  let b = 0, i = 0;
  while (i < xs.length && xs[i].t < start) b += xs[i++].amt;
  let min = i > 0 ? b : Infinity;
  for (; i < xs.length && xs[i].t < end; i++) {
    b += xs[i].amt;
    // several entries at the same moment count as one change
    if (!(xs[i + 1] && xs[i + 1].t === xs[i].t)) min = Math.min(min, b);
  }
  return min === Infinity ? 0 : Math.max(0, min);
}
const interestOn = (k, cents) => Math.round(cents * (k.rate / 100) / periodsPerYear());

function addTx(k, jar, amt, kind, note, extra = {}) {
  const tx = Object.assign({ id: uid(), t: Date.now(), jar, amt, kind, note: note || '' }, extra);
  k.tx.push(tx);
  return tx;
}
function splitAmount(k, amt) {
  const sp = Math.floor(amt * k.split.spend / 100), gv = Math.floor(amt * k.split.give / 100);
  return { spend: sp, save: amt - sp - gv, give: gv };
}
function deposit(k, amt, jarOrSplit, kind, note, t) {
  const g = uid();
  if (jarOrSplit === 'split') {
    const parts = splitAmount(k, amt);
    for (const j of JARS) if (parts[j]) addTx(k, j, parts[j], kind, note, { g, t: t || Date.now() });
  } else addTx(k, jarOrSplit, amt, kind, note, { g, t: t || Date.now() });
}

// Pays allowance and interest that came due since the app was last open.
function catchUp() {
  const now = Date.now(), news = [];
  for (const k of state.kids) {
    const events = [];
    let a = fromKey(k.lastAllowance);
    for (let n = 0; n < 200; n++) {
      a = addDays(a, 7);
      if (a.getTime() > now) break;
      events.push({ t: a.getTime() + 7 * 3600e3, type: 'allow', key: dayKey(a) });
    }
    let p = fromKey(k.lastInterest);
    for (let n = 0; n < 200; n++) {
      const nb = nextBoundary(p);
      if (nb.getTime() > now) break;
      events.push({ t: nb.getTime(), type: 'int', from: p.getTime(), key: dayKey(nb) });
      p = nb;
    }
    events.sort((x, y) => x.t - y.t);
    let gotAllow = 0, gotInt = 0;
    for (const e of events) {
      if (e.type === 'allow') {
        if (k.allowance > 0) { deposit(k, k.allowance, 'split', 'allowance', 'Weekly allowance', e.t); gotAllow += k.allowance; }
        k.lastAllowance = e.key;
      } else {
        const base = minSave(k, e.from, e.t);
        const amt = interestOn(k, base);
        if (amt > 0) { addTx(k, 'save', amt, 'interest', `Interest on ${money(base)} at ${k.rate}% a year`, { t: e.t, g: uid() }); gotInt += amt; }
        k.lastInterest = e.key;
      }
    }
    if (events.length) sortTx(k);
    if (gotAllow) news.push(`${k.emoji} ${k.name}'s allowance arrived: ${money(gotAllow)}`);
    if (gotInt) news.push(`${k.emoji} The bank paid ${k.name} ${money(gotInt)} in interest`);
  }
  if (news.length) { save(); news.forEach((m, i) => setTimeout(() => { toast(m); coin(); }, 400 + i * 2600)); }
}

// Days since money last left the Save jar (buying a finished goal doesn't count).
function patienceDays(k) {
  const outs = k.tx.filter(x => x.jar === 'save' && x.amt < 0 && x.kind !== 'goal');
  const firstSave = k.tx.find(x => x.jar === 'save' && x.amt > 0);
  if (!firstSave) return 0;
  const since = outs.length ? Math.max(...outs.map(x => x.t)) : firstSave.t;
  return Math.max(0, Math.floor((startOfDay(Date.now()) - startOfDay(since)) / DAY));
}
function nextInterest(k) {
  const start = fromKey(k.lastInterest), end = nextBoundary(start);
  const base = minSave(k, start.getTime(), Date.now() + 1);
  return { when: end, base, amt: interestOn(k, base), now: bal(k, 'save') };
}
const weeklySave = k => splitAmount(k, k.allowance).save;

// Weeks until the Save jar reaches target cents, counting allowance and interest.
function weeksTo(k, target, extraNow = 0) {
  let b = bal(k, 'save') + extraNow;
  if (b >= target) return 0;
  const w = weeklySave(k), r = k.rate / 100 / 52;
  for (let n = 1; n <= 1040; n++) {
    b = b * (1 + r) + w;
    if (b >= target) return n;
  }
  return Infinity;
}
const interestTotal = (k, since = 0) => k.tx.reduce((s, x) => s + (x.kind === 'interest' && x.t >= since ? x.amt : 0), 0);

// ── Badges ──────────────────────────────────────────────────────────────────
const BADGES = [
  { id: 'coin', emoji: '🪙', name: 'First coin', desc: 'Get your first money', test: k => k.tx.some(x => x.amt > 0) },
  { id: 'save10', emoji: '🐷', name: 'Ten saved', desc: '$10 in Save', test: k => bal(k, 'save') >= 1000 },
  { id: 'save100', emoji: '💰', name: 'Hundred club', desc: '$100 in Save', test: k => bal(k, 'save') >= 10000 },
  { id: 'save500', emoji: '🏦', name: 'Vault keeper', desc: '$500 in Save', test: k => bal(k, 'save') >= 50000 },
  { id: 'int1', emoji: '🌱', name: 'It grows!', desc: 'Earn your first interest', test: k => interestTotal(k) > 0 },
  { id: 'int10', emoji: '🌳', name: 'Money tree', desc: 'Earn $10 of interest', test: k => interestTotal(k) >= 1000 },
  { id: 'p7', emoji: '⏳', name: 'One week strong', desc: '7-day patience streak', test: k => patienceDays(k) >= 7 },
  { id: 'p30', emoji: '🧘', name: 'Steady', desc: '30-day patience streak', test: k => patienceDays(k) >= 30 },
  { id: 'p90', emoji: '🗿', name: 'Rock solid', desc: '90-day patience streak', test: k => patienceDays(k) >= 90 },
  { id: 'p365', emoji: '👑', name: 'Patience legend', desc: '365-day patience streak', test: k => patienceDays(k) >= 365 },
  { id: 'dream', emoji: '💭', name: 'Dreamer', desc: 'Set a savings goal', test: k => k.goals.length > 0 },
  { id: 'goal', emoji: '🎯', name: 'Goal getter', desc: 'Reach a goal and buy it', test: k => k.goals.some(g => g.doneAt) },
  { id: 'goal3', emoji: '🏆', name: 'Hat trick', desc: 'Reach three goals', test: k => k.goals.filter(g => g.doneAt).length >= 3 },
  { id: 'move', emoji: '➡️', name: 'Smart move', desc: 'Move Spend money into Save', test: k => k.tx.some(x => x.kind === 'move' && x.jar === 'save' && x.from === 'spend') },
  { id: 'give', emoji: '💜', name: 'Big heart', desc: 'Give to a cause', test: k => k.tx.some(x => x.kind === 'give') },
  { id: 'give25', emoji: '🤝', name: 'Generous', desc: 'Give $25 in all', test: k => -k.tx.reduce((s, x) => s + (x.kind === 'give' ? x.amt : 0), 0) >= 2500 },
  { id: 'learn3', emoji: '🧠', name: 'Money mind', desc: 'Finish 3 lessons', test: k => Object.keys(k.lessons).length >= 3 },
  { id: 'learnall', emoji: '🎓', name: 'Money master', desc: 'Finish every lesson', test: k => LESSONS.every(l => k.lessons[l.id]) },
];
function checkBadges(k) {
  const fresh = BADGES.filter(b => !k.seen.includes(b.id) && b.test(k));
  if (!fresh.length) return;
  fresh.forEach(b => k.seen.push(b.id));
  save();
  fresh.forEach((b, i) => setTimeout(() => { toast(`${b.emoji} New badge: ${b.name}!`); confetti(); }, 300 + i * 2400));
}

// ── Sound & celebration ─────────────────────────────────────────────────────
let actx;
function coin() {
  if (!state.sound) return;
  try {
    actx = actx || new (window.AudioContext || window.webkitAudioContext)();
    [[1318.5, 0], [1975.5, 0.07]].forEach(([f, d]) => {
      const o = actx.createOscillator(), g = actx.createGain();
      o.type = 'sine'; o.frequency.value = f;
      const t = actx.currentTime + d;
      g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.18, t + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.35);
      o.connect(g).connect(actx.destination); o.start(t); o.stop(t + 0.4);
    });
  } catch (e) { /* no audio */ }
}
let toastTimer;
function toast(msg) {
  const el = $('#toast');
  el.textContent = msg; el.classList.add('show');
  clearTimeout(toastTimer); toastTimer = setTimeout(() => el.classList.remove('show'), 2400);
}
function confetti() {
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const cv = $('#confetti'), cx = cv.getContext('2d');
  cv.width = innerWidth; cv.height = innerHeight;
  const cols = ['#f4a261', '#4cc9f0', '#c77dff', '#52b788', '#ffd166'];
  const ps = Array.from({ length: 120 }, () => ({ x: innerWidth / 2 + (Math.random() - 0.5) * 200, y: innerHeight * 0.35, vx: (Math.random() - 0.5) * 12, vy: -Math.random() * 12 - 4, s: 4 + Math.random() * 6, c: cols[Math.random() * 5 | 0], r: Math.random() * 6 }));
  const t0 = performance.now();
  (function frame(t) {
    cx.clearRect(0, 0, cv.width, cv.height);
    ps.forEach(p => { p.vy += 0.35; p.x += p.vx; p.y += p.vy; p.r += 0.1; cx.save(); cx.translate(p.x, p.y); cx.rotate(p.r); cx.fillStyle = p.c; cx.fillRect(-p.s / 2, -p.s / 4, p.s, p.s / 2); cx.restore(); });
    if (t - t0 < 1800) requestAnimationFrame(frame); else cx.clearRect(0, 0, cv.width, cv.height);
  })(t0);
}

// ── Modal ───────────────────────────────────────────────────────────────────
function openModal(html, onMount) {
  const root = $('#modal-root');
  root.innerHTML = `<div class="modal-back"><div class="modal" role="dialog" aria-modal="true">${html}</div></div>`;
  const back = $('.modal-back', root);
  back.addEventListener('mousedown', e => { if (e.target === back) closeModal(); });
  $$('[data-close]', root).forEach(b => b.onclick = closeModal);
  onMount && onMount($('.modal', root));
  const first = $('input:not([type=hidden]), select', root);
  if (first && !('ontouchstart' in window)) setTimeout(() => first.focus(), 30);
}
function closeModal() { $('#modal-root').innerHTML = ''; }
document.addEventListener('keydown', e => { if (e.key === 'Escape' && $('#modal-root').innerHTML) closeModal(); });

function confirmBox(title, text, okLabel, onOk, danger) {
  openModal(`<h2>${title}</h2><p class="sub">${text}</p>
    <div class="modal-foot"><button class="btn ghost" data-close>Cancel</button><button class="btn ${danger ? 'danger' : ''}" id="ok">${okLabel}</button></div>`,
  m => { $('#ok', m).onclick = () => { closeModal(); onOk(); }; });
}

// ── Parent PIN ──────────────────────────────────────────────────────────────
async function hashPin(pin) {
  const data = new TextEncoder().encode('nestegg:' + pin);
  if (crypto.subtle) {
    const buf = await crypto.subtle.digest('SHA-256', data);
    return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('');
  }
  let h = 5381; for (const b of data) h = ((h << 5) + h + b) >>> 0;
  return 'x' + h.toString(16);
}
function pinPad(title, sub, onDone) {
  let entry = '';
  openModal(`<h2 style="text-align:center">${title}</h2><p class="sub" style="text-align:center">${sub}</p>
    <div class="pin-dots" id="dots">${'<i></i>'.repeat(4)}</div><div class="err" id="perr" style="text-align:center"></div>
    <div class="pin-pad">${[1, 2, 3, 4, 5, 6, 7, 8, 9].map(n => `<button data-n="${n}">${n}</button>`).join('')}<button data-close style="font-size:0.9rem">Cancel</button><button data-n="0">0</button><button data-del style="font-size:1.1rem">⌫</button></div>`,
  m => {
    const dots = () => $$('#dots i', m).forEach((d, i) => d.classList.toggle('f', i < entry.length));
    const press = async n => {
      if (entry.length >= 4) return;
      entry += n; dots();
      if (entry.length === 4) {
        const ok = await onDone(entry);
        if (ok === false) {
          $('#perr', m).textContent = 'That\'s not it. Try again.';
          const d = $('#dots', m); d.classList.remove('shake'); void d.offsetWidth; d.classList.add('shake');
          entry = ''; setTimeout(dots, 250);
        }
      }
    };
    $$('[data-n]', m).forEach(b => b.onclick = () => press(b.dataset.n));
    $('[data-del]', m).onclick = () => { entry = entry.slice(0, -1); dots(); };
    // Listen on the whole page so typing works wherever focus is; stop once this pad is gone.
    const onKey = e => {
      if (!document.body.contains(m)) { document.removeEventListener('keydown', onKey); return; }
      if (/^\d$/.test(e.key)) { e.preventDefault(); press(e.key); }
      if (e.key === 'Backspace') { e.preventDefault(); entry = entry.slice(0, -1); dots(); }
    };
    setTimeout(() => document.addEventListener('keydown', onKey), 0);
  });
}
function requireParent(then) {
  if (isParent()) { ui.parentUntil = Date.now() + 10 * 60e3; then(); return; }
  pinPad('Parent PIN', 'Only grown-ups can do this part.', async pin => {
    if (await hashPin(pin) !== state.pinHash) return false;
    ui.parentUntil = Date.now() + 10 * 60e3;
    closeModal(); renderTop(); then();
  });
}
function setPinFlow(onSet, title = 'Choose a parent PIN') {
  pinPad(title, '4 digits. Kids will need it to take money out.', first => {
    pinPad('Type it again', 'Just to be sure.', async second => {
      if (second !== first) { toast('Those didn\'t match. Let\'s start over.'); setTimeout(() => setPinFlow(onSet, title), 300); return; }
      state.pinHash = await hashPin(first); save(); closeModal(); onSet();
    });
  });
}

// ── Routing & top bar ───────────────────────────────────────────────────────
function go(view, extra = {}) {
  Object.assign(ui, { view }, extra);
  render();
  scrollTo({ top: 0 });
}
function renderTop() {
  const show = !!state.pinHash && state.kids.length > 0;
  $('#topbar').hidden = !show;
  $('#btn-sound').textContent = state.sound ? '🔊' : '🔇';
  const pb = $('#btn-parent');
  pb.classList.toggle('on', isParent());
  pb.textContent = isParent() ? '🔓 Parent' : '🔒 Parent';
}
function render() {
  renderTop();
  const app = $('#app');
  if (!state.pinHash || !state.kids.length) return renderWelcome(app);
  if (ui.view === 'kid' && curKid()) return renderKid(app, curKid());
  if (ui.view === 'parent' && isParent()) return renderParent(app);
  ui.view = 'family';
  renderFamily(app);
}
$('#btn-sound').onclick = () => { state.sound = !state.sound; save(); renderTop(); if (state.sound) coin(); };
$('#btn-parent').onclick = () => {
  if (isParent() && ui.view === 'parent') { ui.parentUntil = 0; toast('Parent mode locked'); go('family'); return; }
  requireParent(() => go('parent'));
};
document.addEventListener('click', e => { const g = e.target.closest('[data-go]'); if (g) go(g.dataset.go); });

// ── Welcome ─────────────────────────────────────────────────────────────────
function renderWelcome(app) {
  const step = state.pinHash ? 2 : 1;
  app.innerHTML = `<div class="welcome">
    <img src="icon.svg" alt="">
    <h1>Nest Egg</h1>
    <p>The family bank. Kids keep Spend, Save and Give jars. You're the bank, and the bank pays interest for patience.</p>
    <div class="card">
      <ul class="steps">
        <li><span class="dot">🫙</span><div><b>Three jars.</b> <span class="muted">Allowance splits itself into Spend, Save and Give.</span></div></li>
        <li><span class="dot">🌱</span><div><b>Interest that rewards waiting.</b> <span class="muted">The bank pays on the <i>lowest</i> Save balance each month, so leaving money alone pays more.</span></div></li>
        <li><span class="dot">🎯</span><div><b>Goals with a finish line.</b> <span class="muted">Kids see the day they'll get there, and how much sooner if they skip a treat.</span></div></li>
        <li><span class="dot">⏳</span><div><b>A time machine.</b> <span class="muted">Watch what $3 a week becomes in 10 years.</span></div></li>
      </ul>
      <div style="margin-top:20px" class="row">
        ${step === 1
          ? '<button class="btn" id="w-pin">Start: choose a parent PIN</button>'
          : '<button class="btn" id="w-kid">Add your first kid</button><span class="muted small">PIN is set ✓</span>'}
      </div>
      ${step === 1 ? '<p style="margin-top:16px"><button class="link-btn" id="w-restore">Already use Nest Egg on another device? Restore a backup</button></p>' : ''}
    </div>
    <footer class="app-foot">Everything stays on this device. Nothing is uploaded.</footer>
  </div>`;
  $('#w-pin') && ($('#w-pin').onclick = () => setPinFlow(() => { ui.parentUntil = Date.now() + 10 * 60e3; render(); }));
  $('#w-kid') && ($('#w-kid').onclick = () => { ui.parentUntil = Date.now() + 10 * 60e3; kidForm(null); });
  $('#w-restore') && ($('#w-restore').onclick = restorePick);
}

// ── Family page ─────────────────────────────────────────────────────────────
function renderFamily(app) {
  const hr = new Date().getHours();
  const hello = hr < 12 ? 'Good morning' : hr < 17 ? 'Good afternoon' : 'Good evening';
  app.innerHTML = `
    <div class="family-h"><div><p class="muted">${hello}</p><h1>Who's checking their jars?</h1></div></div>
    <div class="kids">
      ${state.kids.map(k => {
        const goal = k.goals.find(g => !g.doneAt), pd = patienceDays(k);
        return `<button class="kid-card" data-kid="${k.id}" style="--c:${k.color}">
          <div class="kid-top"><div class="avatar" style="--c:${k.color}">${k.emoji}</div>
            <div class="grow"><div class="kid-name">${esc(k.name)}</div><div class="muted small">${pd ? `⏳ ${plural(pd, 'day')} of patience` : 'Tap to see your jars'}</div></div>
            <div class="kid-total">${money(total(k))}</div></div>
          <div class="mini-jars">${JARS.map(j => `<div class="mini-jar"><span style="color:${JAR[j].color}">${JAR[j].name}</span><b>${money(bal(k, j))}</b></div>`).join('')}</div>
          ${goal ? goalLine(k, goal) : ''}
        </button>`;
      }).join('')}
      ${isParent() ? '<button class="kid-card add-kid" id="add-kid" style="--c:var(--accent)">+ Add a kid</button>' : ''}
    </div>
    ${backupNudge()}
    <footer class="app-foot">Nest Egg saves to this device only. Parents can back it up from Parent ▸ Settings.</footer>`;
  $$('[data-kid]').forEach(b => b.onclick = () => go('kid', { kidId: b.dataset.kid, tab: 'jars' }));
  $('#add-kid') && ($('#add-kid').onclick = () => requireParent(() => kidForm(null)));
  bindBackupNudge();
}
function goalLine(k, g) {
  const pct = clamp(bal(k, 'save') / g.cost, 0, 1);
  return `<div><div class="row small" style="justify-content:space-between"><span>${g.emoji} ${esc(g.name)}</span><span class="muted num">${Math.round(pct * 100)}%</span></div>
    <div class="bar" style="margin-bottom:0"><i style="width:${pct * 100}%"></i></div></div>`;
}
const backupDue = () => state.kids.some(k => k.tx.length >= 8) && Date.now() - (state.lastBackup || 0) > 30 * DAY;
function backupNudge() {
  return backupDue() && isParent() ? `<div class="callout" style="margin-top:20px;display:flex;gap:12px;align-items:center;flex-wrap:wrap"><span class="grow">💾 <b>Time for a backup.</b> The bank's records live only in this browser.</span><button class="btn small" id="nudge-backup">Save a backup file</button></div>` : '';
}
function bindBackupNudge() { $('#nudge-backup') && ($('#nudge-backup').onclick = () => { backupNow(); render(); }); }

// ── Kid page ────────────────────────────────────────────────────────────────
function renderKid(app, k) {
  const tabs = [['jars', 'Jars'], ['goals', 'Goals'], ['grow', 'Grow'], ['learn', 'Learn'], ['history', 'History']];
  app.innerHTML = `
    <button class="back" data-go="family">← Everyone</button>
    <div class="kid-h"><div class="avatar big" style="--c:${k.color}">${k.emoji}</div>
      <div><h1>${esc(k.name)}</h1><p class="muted small">${k.allowance ? `${money(k.allowance)} every ${WEEKDAYS[state.allowanceDay]}` : 'No weekly allowance'} · Save earns ${k.rate}% a year</p></div>
      <div class="total"><span class="muted small">All my money</span><b>${money(total(k))}</b></div></div>
    <nav class="tabs" role="tablist">${tabs.map(([id, n]) => `<button role="tab" data-tab="${id}" class="${ui.tab === id ? 'on' : ''}">${n}</button>`).join('')}</nav>
    <div id="tab-body"></div>`;
  $$('[data-tab]').forEach(b => b.onclick = () => { ui.tab = b.dataset.tab; ui.lessonId = null; renderKid(app, k); });
  const body = $('#tab-body');
  ({ jars: tabJars, goals: tabGoals, grow: tabGrow, learn: tabLearn, history: tabHistory })[ui.tab](body, k);
  checkBadges(k);
}

function jarSvg(jar, frac) {
  const c = JAR[jar].color, h = 112, top = 30, fill = clamp(frac, 0, 1);
  const level = top + 8 + (h - 8) * (1 - fill);
  const id = 'clip-' + jar;
  return `<svg viewBox="0 0 100 150" aria-hidden="true">
    <defs><clipPath id="${id}"><path d="M22 34 h56 q6 0 6 8 v86 q0 14 -14 14 h-40 q-14 0 -14 -14 v-86 q0 -8 6 -8z"/></clipPath></defs>
    <rect x="28" y="16" width="44" height="14" rx="4" fill="${c}" opacity="0.55"/>
    <g clip-path="url(#${id})">
      <rect x="0" y="0" width="100" height="150" fill="#0d1020"/>
      ${fill > 0 ? `<g class="wave"><path d="M-20 ${level} q15 -6 30 0 t30 0 t30 0 t30 0 t30 0 v200 h-150z" fill="${c}" opacity="0.9"/></g>
      <circle cx="38" cy="${Math.min(134, level + 22)}" r="5" fill="#fff" opacity="0.18"/><circle cx="60" cy="${Math.min(130, level + 34)}" r="3.5" fill="#fff" opacity="0.15"/>` : ''}
    </g>
    <path d="M22 34 h56 q6 0 6 8 v86 q0 14 -14 14 h-40 q-14 0 -14 -14 v-86 q0 -8 6 -8z" fill="none" stroke="${c}" stroke-width="3"/>
    <path d="M28 48 v60" stroke="#fff" stroke-width="3" stroke-linecap="round" opacity="0.18"/>
  </svg>`;
}

function tabJars(body, k) {
  const b = Object.fromEntries(JARS.map(j => [j, bal(k, j)]));
  const ref = Math.max(...JARS.map(j => b[j]), 1) * 1.15;
  const ni = nextInterest(k), pd = patienceDays(k);
  const nextStep = STREAK_STEPS.find(s => s > pd) || pd + 1, prevStep = [...STREAK_STEPS].reverse().find(s => s <= pd) || 0;
  const ringFrac = (pd - prevStep) / (nextStep - prevStep);
  const C = 2 * Math.PI * 44;
  const goal = k.goals.find(g => !g.doneAt);
  // Only call it a dip when money actually left Save this period (new deposits also leave base < now).
  const periodStart = fromKey(k.lastInterest).getTime();
  const dipped = k.tx.some(x => x.jar === 'save' && x.amt < 0 && x.kind !== 'goal' && x.t >= periodStart);
  const grewSince = !dipped && ni.now > ni.base;
  const earned = BADGES.filter(x => x.test(k));

  body.innerHTML = `
    <div class="jars">${JARS.map(j => `<div class="card jar-card">
      ${jarSvg(j, b[j] / ref)}
      <div class="jar-label" style="color:${JAR[j].color}">${JAR[j].emoji} ${JAR[j].name}</div>
      <div class="jar-amt">${money(b[j])}</div>
      <div class="jar-sub">${j === 'save' && k.rate ? `earns ${k.rate}%/yr` : JAR[j].blurb}</div></div>`).join('')}</div>
    <div class="actions">
      <button class="action" id="a-add"><i>➕</i>Add money<span class="lock">🔒 parent</span></button>
      <button class="action" id="a-move"><i>🔁</i>Move<span class="lock">Spend → Save is free</span></button>
      <button class="action" id="a-spend"><i>🛒</i>Spend<span class="lock">🔒 parent</span></button>
      <button class="action" id="a-give"><i>💜</i>Give<span class="lock">🔒 parent</span></button>
    </div>

    <div class="section"><div class="section-h"><h2>Patience pays</h2></div>
      <div class="card patience">
        <div class="ring"><svg viewBox="0 0 104 104"><circle cx="52" cy="52" r="44" fill="none" stroke="#0d1020" stroke-width="10"/>
          <circle cx="52" cy="52" r="44" fill="none" stroke="${JAR.save.color}" stroke-width="10" stroke-linecap="round" stroke-dasharray="${C}" stroke-dashoffset="${C * (1 - ringFrac)}"/></svg>
          <div class="center"><div><b>${pd}</b><span>${pd === 1 ? 'day' : 'days'}</span></div></div></div>
        <div>
          <h3>${pd ? `${plural(pd, 'day')} without touching Save` : b.save > 0 ? 'Your patience streak starts today' : 'Put money in Save to start a streak'}</h3>
          <p>${pd < nextStep && b.save > 0 ? `${plural(nextStep - pd, 'more day')} to reach ${nextStep}. ` : ''}${k.rate > 0
            ? b.save > 0 || ni.base > 0
              ? `On <b>${fmtDate(ni.when, { plain: true })}</b> the bank pays you about <b>${money(ni.amt)}</b>${dipped ? `. That's interest on ${money(ni.base)}, your lowest balance this ${state.interestEvery}. Money that leaves Save stops earning.` : `, as long as Save stays at or above <b>${money(ni.base)}</b>.${grewSince ? ' Money added this ' + state.interestEvery + ' starts earning next ' + state.interestEvery + '.' : ''}`}`
              : 'Money in Save earns interest from the bank every ' + state.interestEvery + '.'
            : 'Ask a parent to turn on interest for your Save jar.'}</p>
          ${interestTotal(k) ? `<p style="margin-top:6px">So far the bank has paid you <b>${money(interestTotal(k))}</b> just for waiting.</p>` : ''}
        </div>
      </div>
    </div>

    ${goal ? `<div class="section"><div class="section-h"><h2>Saving for</h2><button class="link-btn small" data-tab-go="goals">All goals</button></div>
      <div class="card">${goalRow(k, goal, bal(k, 'save'), true)}</div></div>` : ''}

    <div class="section"><div class="section-h"><h2>Badges</h2><span class="muted small">${earned.length} of ${BADGES.length}</span></div>
      <div class="card"><div class="badges">${BADGES.map(x => {
        const got = earned.includes(x);
        return `<div class="badge ${got ? '' : 'locked'}" title="${esc(x.desc)}"><i>${x.emoji}</i><div>${x.name}<small>${x.desc}</small></div></div>`;
      }).join('')}</div></div></div>`;

  $('#a-add').onclick = () => requireParent(() => addMoneyModal(k));
  $('#a-move').onclick = () => moveModal(k);
  $('#a-spend').onclick = () => requireParent(() => spendModal(k));
  $('#a-give').onclick = () => requireParent(() => giveModal(k));
  $$('[data-tab-go]').forEach(x => x.onclick = () => { ui.tab = x.dataset.tabGo; render(); });
  bindGoalButtons(body, k);
}

// ── Money modals ────────────────────────────────────────────────────────────
function jarChooser(name, k, sel, opts = {}) {
  return `<div class="jar-choose" data-name="${name}">${(opts.split ? ['split', ...JARS] : JARS).map(j => {
    if (j === 'split') return `<button type="button" data-j="split" class="${sel === 'split' ? 'on' : ''}" style="--jc:var(--accent);grid-column:1/-1">Split it like allowance<small>${k.split.spend}% Spend · ${k.split.save}% Save · ${k.split.give}% Give</small></button>`;
    const dis = opts.disable && opts.disable(j);
    return `<button type="button" data-j="${j}" class="${sel === j ? 'on' : ''}" style="--jc:${JAR[j].color}" ${dis ? 'disabled' : ''}>${JAR[j].emoji} ${JAR[j].name}<small>${money(bal(k, j))}</small></button>`;
  }).join('')}</div>`;
}
function bindChooser(m, name, onChange) {
  const box = $(`.jar-choose[data-name="${name}"]`, m);
  $$('button', box).forEach(b => b.onclick = () => { $$('button', box).forEach(x => x.classList.remove('on')); b.classList.add('on'); onChange(b.dataset.j); });
}

function addMoneyModal(k) {
  let dest = 'split', src = 'Gift';
  const srcs = ['Gift', 'Chores', 'Birthday', 'Holiday', 'Good grades', 'Other'];
  openModal(`<h2>Add money for ${esc(k.name)}</h2><p class="sub">Where did it come from, and where should it go?</p>
    <label class="field"><span>Amount</span><div class="money-input"><input type="text" inputmode="decimal" id="amt" placeholder="0.00"></div></label>
    <div class="field"><span>From</span><div class="chips" id="srcs">${srcs.map(s => `<button type="button" class="chip ${s === src ? 'on' : ''}" data-s="${s}">${s}</button>`).join('')}</div></div>
    <label class="field"><span>Note (optional)</span><input type="text" id="note" maxlength="60" placeholder="From Grandma and Grandpa"></label>
    <div class="field"><span>Put it in</span>${jarChooser('dest', k, dest, { split: true })}</div>
    <div class="hint" id="prev"></div><div class="err" id="err"></div>
    <div class="modal-foot"><button class="btn ghost" data-close>Cancel</button><button class="btn" id="ok">Add it</button></div>`, m => {
    const prev = () => {
      const a = parseMoney($('#amt', m).value);
      if (!(a > 0)) { $('#prev', m).textContent = ''; return; }
      if (dest === 'split') { const p = splitAmount(k, a); $('#prev', m).textContent = `${money(p.spend)} to Spend, ${money(p.save)} to Save, ${money(p.give)} to Give`; }
      else $('#prev', m).textContent = `${money(a)} to ${JAR[dest].name}`;
    };
    bindChooser(m, 'dest', j => { dest = j; prev(); });
    $$('#srcs .chip', m).forEach(c => c.onclick = () => { $$('#srcs .chip', m).forEach(x => x.classList.remove('on')); c.classList.add('on'); src = c.dataset.s; });
    $('#amt', m).oninput = prev;
    $('#ok', m).onclick = () => {
      const a = parseMoney($('#amt', m).value);
      if (!(a > 0) || a > 10000000) { $('#err', m).textContent = 'Type an amount, like 5 or 12.50.'; return; }
      const note = $('#note', m).value.trim();
      deposit(k, a, dest, 'deposit', note ? `${src}: ${note}` : src);
      sortTx(k); save(); closeModal(); coin(); toast(`${money(a)} added for ${k.name}`); render();
    };
    $('#amt', m).onkeydown = e => { if (e.key === 'Enter') $('#ok', m).click(); };
  });
}

function spendModal(k, presetJar) {
  let from = presetJar || (bal(k, 'spend') > 0 ? 'spend' : 'save');
  openModal(`<h2>${esc(k.name)} bought something</h2><p class="sub">Take money out of a jar.</p>
    <div class="field"><span>From</span>${jarChooser('from', k, from, { disable: j => j === 'give' || bal(k, j) <= 0 })}</div>
    <label class="field"><span>Amount</span><div class="money-input"><input type="text" inputmode="decimal" id="amt" placeholder="0.00"></div></label>
    <label class="field"><span>What was it?</span><input type="text" id="note" maxlength="60" placeholder="Pokémon cards"></label>
    <div id="warn"></div><div class="err" id="err"></div>
    <div class="modal-foot"><button class="btn ghost" data-close>Cancel</button><button class="btn" id="ok">Take it out</button></div>`, m => {
    const warn = () => {
      $('#warn', m).innerHTML = from === 'save' ? `<div class="callout warn" style="margin:0 0 10px">Taking money out of Save ends ${esc(k.name)}'s ${plural(patienceDays(k), 'day')} patience streak and lowers this ${state.interestEvery}'s interest.</div>` : '';
    };
    warn();
    bindChooser(m, 'from', j => { from = j; warn(); });
    $('#ok', m).onclick = () => {
      const a = parseMoney($('#amt', m).value);
      if (!(a > 0)) { $('#err', m).textContent = 'Type an amount.'; return; }
      if (a > bal(k, from)) { $('#err', m).textContent = `There's only ${money(bal(k, from))} in ${JAR[from].name}.`; return; }
      addTx(k, from, -a, 'spend', $('#note', m).value.trim() || 'Bought something', { g: uid() });
      save(); closeModal(); toast(`${money(a)} spent from ${JAR[from].name}`); render();
    };
  });
}

function giveModal(k) {
  const causes = ['Food shelf', 'Animal shelter', 'Church', 'School fundraiser', 'A friend in need', 'Toy drive'];
  openModal(`<h2>${esc(k.name)} is giving</h2><p class="sub">There's ${money(bal(k, 'give'))} in the Give jar.</p>
    <label class="field"><span>Amount</span><div class="money-input"><input type="text" inputmode="decimal" id="amt" placeholder="0.00" value="${bal(k, 'give') > 0 ? (bal(k, 'give') / 100).toFixed(2) : ''}"></div></label>
    <label class="field"><span>Who is it for?</span><input type="text" id="note" maxlength="60" placeholder="Second Harvest food shelf" list="causes"><datalist id="causes">${causes.map(c => `<option value="${c}">`).join('')}</datalist></label>
    <div class="err" id="err"></div>
    <div class="modal-foot"><button class="btn ghost" data-close>Cancel</button><button class="btn" id="ok" style="background:${JAR.give.color}">Give it 💜</button></div>`, m => {
    $('#ok', m).onclick = () => {
      const a = parseMoney($('#amt', m).value);
      if (!(a > 0)) { $('#err', m).textContent = 'Type an amount.'; return; }
      if (a > bal(k, 'give')) { $('#err', m).textContent = `There's only ${money(bal(k, 'give'))} in Give.`; return; }
      const to = $('#note', m).value.trim();
      if (!to) { $('#err', m).textContent = 'Who is it for?'; return; }
      addTx(k, 'give', -a, 'give', to, { g: uid() });
      save(); closeModal(); confetti(); toast(`${k.name} gave ${money(a)} to ${to}. That's kind.`); render();
    };
  });
}

function moveModal(k) {
  let from = 'spend', to = 'save';
  openModal(`<h2>Move money</h2><p class="sub">Moving from Spend to Save or Give is always allowed. Moving out of Save or Give needs a parent.</p>
    <div class="field"><span>From</span>${jarChooser('from', k, from, { disable: j => bal(k, j) <= 0 })}</div>
    <div class="field"><span>To</span>${jarChooser('to', k, to)}</div>
    <label class="field"><span>Amount</span><div class="money-input"><input type="text" inputmode="decimal" id="amt" placeholder="0.00"></div></label>
    <div id="msg" class="hint"></div><div class="err" id="err"></div>
    <div class="modal-foot"><button class="btn ghost" data-close>Cancel</button><button class="btn" id="ok">Move it</button></div>`, m => {
    const msg = () => {
      const a = parseMoney($('#amt', m).value);
      let t = '';
      if (from === 'spend' && to === 'save' && a > 0 && k.rate > 0) {
        const yr = Math.round(a * (Math.pow(1 + k.rate / 100 / periodsPerYear(), periodsPerYear()) - 1));
        t = `Nice. Left alone for a year, ${money(a)} in Save grows to about ${money(a + yr)}.`;
      }
      if (from !== 'spend' && from !== to) t = '🔒 A parent will need to enter the PIN for this one.';
      $('#msg', m).textContent = t;
    };
    bindChooser(m, 'from', j => { from = j; msg(); });
    bindChooser(m, 'to', j => { to = j; msg(); });
    $('#amt', m).oninput = msg;
    $('#ok', m).onclick = () => {
      const a = parseMoney($('#amt', m).value);
      if (from === to) { $('#err', m).textContent = 'Pick two different jars.'; return; }
      if (!(a > 0)) { $('#err', m).textContent = 'Type an amount.'; return; }
      if (a > bal(k, from)) { $('#err', m).textContent = `There's only ${money(bal(k, from))} in ${JAR[from].name}.`; return; }
      const doIt = () => {
        const g = uid(), t = Date.now();
        addTx(k, from, -a, 'move', `Moved to ${JAR[to].name}`, { g, t, to });
        addTx(k, to, a, 'move', `Moved from ${JAR[from].name}`, { g, t, from });
        save(); closeModal(); coin(); toast(`${money(a)} moved to ${JAR[to].name}`); render();
      };
      if (from === 'spend') doIt(); else { const keep = { from, to, a }; closeModal(); requireParent(() => { from = keep.from; to = keep.to; doIt(); }); }
    };
  });
}

// ── Goals ───────────────────────────────────────────────────────────────────
function goalRow(k, g, avail, compact) {
  if (g.doneAt) return `<div class="goal done"><div class="goal-emoji">${g.emoji}</div><div><div class="goal-name">${esc(g.name)}</div>
    <div class="goal-meta">Bought ${fmtDate(g.doneAt, { plain: true })} for ${money(g.cost)} 🎉</div></div><div></div></div>`;
  const have = clamp(avail, 0, g.cost), pct = have / g.cost;
  const w = weeksTo(k, g.cost + Math.max(0, bal(k, 'save') - avail));
  const skip = 500, w2 = weeksTo(k, g.cost + Math.max(0, bal(k, 'save') - avail), skip);
  let when;
  if (pct >= 1) when = '<b>You have enough!</b>';
  else if (w === Infinity) when = 'Add money to Save to get there';
  else {
    const d = addDays(Date.now(), w * 7);
    when = `On track for <b>${fmtDate(d, { plain: true, noWeekday: true })}</b> (${fmtWait(w * 7)})`;
    if (w2 < w && !compact) when += `. Skip one $5 treat and get there <b>${fmtWait((w - w2) * 7)} sooner</b>.`;
  }
  return `<div class="goal"><div class="goal-emoji">${g.emoji}</div>
    <div><div class="row" style="justify-content:space-between"><span class="goal-name">${esc(g.name)}</span><span class="num small"><b>${money(have)}</b> <span class="muted">of ${money(g.cost)}</span></span></div>
      <div class="bar"><i style="width:${pct * 100}%"></i></div><div class="goal-meta">${when}</div></div>
    <div class="row" style="gap:6px;flex-direction:column;align-items:stretch">${pct >= 1 ? `<button class="btn small" data-buy="${g.id}">Buy it!</button>` : ''}${compact ? '' : `<button class="link-btn small" data-delgoal="${g.id}" style="color:var(--muted)">Remove</button>`}</div></div>`;
}
function tabGoals(body, k) {
  let avail = bal(k, 'save');
  const active = k.goals.filter(g => !g.doneAt), done = k.goals.filter(g => g.doneAt);
  const rows = active.map(g => { const r = goalRow(k, g, avail); avail -= g.cost; return r; });
  body.innerHTML = `
    <div class="section-h"><h2>Saving for</h2><button class="btn small" id="new-goal">+ New goal</button></div>
    <div class="card">${active.length ? rows.join('') : `<p class="muted">No goals yet. What would you love to save up for? A goal makes saving a lot more fun.</p>`}</div>
    ${active.length > 1 ? '<p class="hint" style="margin:8px 4px 0">Your Save jar fills goals in order, top to bottom.</p>' : ''}
    ${done.length ? `<div class="section"><div class="section-h"><h2>Goals reached</h2></div><div class="card">${done.map(g => goalRow(k, g, 0)).join('')}</div></div>` : ''}`;
  $('#new-goal').onclick = () => goalForm(k);
  bindGoalButtons(body, k);
}
function bindGoalButtons(body, k) {
  $$('[data-buy]', body).forEach(b => b.onclick = () => requireParent(() => {
    const g = k.goals.find(x => x.id === b.dataset.buy);
    if (bal(k, 'save') < g.cost) { toast('Not quite enough in Save yet'); return; }
    confirmBox(`Buy ${esc(g.name)}?`, `This takes ${money(g.cost)} out of ${esc(k.name)}'s Save jar. Reaching a goal doesn't break the patience streak.`, 'Buy it!', () => {
      addTx(k, 'save', -g.cost, 'goal', `Bought: ${g.name}`, { g: uid() });
      g.doneAt = Date.now(); save(); confetti(); coin(); toast(`🎉 ${k.name} saved up for ${g.name}!`); render();
    });
  }));
  $$('[data-delgoal]', body).forEach(b => b.onclick = () => {
    const g = k.goals.find(x => x.id === b.dataset.delgoal);
    confirmBox('Remove this goal?', `"${esc(g.name)}" will be removed. The money stays in Save.`, 'Remove', () => { k.goals = k.goals.filter(x => x !== g); save(); render(); });
  });
}
function goalForm(k) {
  let emoji = GOAL_EMOJIS[0];
  openModal(`<h2>New savings goal</h2><p class="sub">What, and how much?</p>
    <label class="field"><span>What are you saving for?</span><input type="text" id="gname" maxlength="40" placeholder="New bike"></label>
    <label class="field"><span>How much does it cost?</span><div class="money-input"><input type="text" inputmode="decimal" id="gcost" placeholder="0.00"></div></label>
    <div class="field"><span>Pick a picture</span><div class="emoji-pick">${GOAL_EMOJIS.map((e, i) => `<button type="button" data-e="${e}" class="${i ? '' : 'on'}">${e}</button>`).join('')}</div></div>
    <div class="hint" id="gprev"></div><div class="err" id="err"></div>
    <div class="modal-foot"><button class="btn ghost" data-close>Cancel</button><button class="btn" id="ok">Add goal</button></div>`, m => {
    $$('.emoji-pick button', m).forEach(b => b.onclick = () => { $$('.emoji-pick button', m).forEach(x => x.classList.remove('on')); b.classList.add('on'); emoji = b.dataset.e; });
    $('#gcost', m).oninput = () => {
      const c = parseMoney($('#gcost', m).value);
      const committed = k.goals.filter(g => !g.doneAt).reduce((s, g) => s + g.cost, 0);
      if (!(c > 0)) { $('#gprev', m).textContent = ''; return; }
      const w = weeksTo(k, committed + c);
      $('#gprev', m).textContent = w === 0 ? 'You already have enough saved!' : w === Infinity ? 'You\'ll need to add money to Save to get there.' : `At your pace you'd get there in about ${fmtWait(w * 7)}.`;
    };
    $('#ok', m).onclick = () => {
      const name = $('#gname', m).value.trim(), cost = parseMoney($('#gcost', m).value);
      if (!name) { $('#err', m).textContent = 'Give your goal a name.'; return; }
      if (!(cost > 0)) { $('#err', m).textContent = 'How much does it cost?'; return; }
      k.goals.push({ id: uid(), name, emoji, cost, created: Date.now(), doneAt: 0 });
      save(); closeModal(); toast(`${emoji} Goal set: ${name}`); render();
    };
  });
}

// ── Grow: the time machine ──────────────────────────────────────────────────
function tabGrow(body, k) {
  const kidRate = k.rate;
  if (!ui.tm || ui.tm.kid !== k.id) ui.tm = { kid: k.id, start: Math.round(bal(k, 'save') / 100), weekly: weeklySave(k) / 100 || 3, rate: kidRate > 20 ? 7 : kidRate || 7, years: 10 };
  const tm = ui.tm;
  const rateMax = Math.max(20, kidRate);
  body.innerHTML = `
    <div class="tm-grid">
      <div class="card">
        <h3 style="margin-bottom:4px">Time machine</h3><p class="muted small" style="margin-bottom:18px">What happens if you just… wait?</p>
        <div class="slider"><label>Start with <b id="v-start"></b></label><input type="range" id="s-start" min="0" max="2000" step="5" value="${tm.start}"></div>
        <div class="slider"><label>Add every week <b id="v-weekly"></b></label><input type="range" id="s-weekly" min="0" max="50" step="0.5" value="${tm.weekly}"></div>
        <div class="slider"><label>Interest rate <b id="v-rate"></b></label><input type="range" id="s-rate" min="0" max="${rateMax}" step="0.5" value="${tm.rate}">
          <div class="chips" style="margin-top:6px"><button class="chip" data-r="4">Savings 4%</button><button class="chip" data-r="7">Stocks, long run ~7%</button>${kidRate && kidRate !== 4 && kidRate !== 7 ? `<button class="chip" data-r="${kidRate}">My bank ${kidRate}%</button>` : ''}</div></div>
        <div class="slider"><label>Wait for <b id="v-years"></b></label><input type="range" id="s-years" min="1" max="40" step="1" value="${tm.years}"></div>
      </div>
      <div class="card">
        <p class="headline" id="tm-head"></p>
        <div class="stats">
          <div class="stat"><span><i class="key" style="background:var(--series-1)"></i>You put in</span><b id="st-in"></b></div>
          <div class="stat"><span><i class="key" style="background:var(--series-2)"></i>Interest adds</span><b id="st-int"></b></div>
          <div class="stat"><span>You'd have</span><b id="st-tot"></b></div>
        </div>
        <div id="tm-chart"></div>
        <div id="tm-notes"></div>
      </div>
    </div>`;
  const upd = () => {
    tm.start = +$('#s-start').value; tm.weekly = +$('#s-weekly').value; tm.rate = +$('#s-rate').value; tm.years = +$('#s-years').value;
    $('#v-start').textContent = money(tm.start * 100, { short: true });
    $('#v-weekly').textContent = money(Math.round(tm.weekly * 100));
    $('#v-rate').textContent = tm.rate + '% a year';
    $('#v-years').textContent = plural(tm.years, 'year');
    $$('[data-r]', body).forEach(c => c.classList.toggle('on', +c.dataset.r === tm.rate));
    // Monthly compounding, weekly deposits averaged into months.
    const months = tm.years * 12, perMonth = tm.weekly * 100 * 52 / 12, r = tm.rate / 100 / 12;
    const monthly = tm.years <= 3;
    let b = tm.start * 100, put = tm.start * 100;
    const labels = [], ins = [], ints = [];
    const push = mth => { labels.push(mth); ins.push(Math.round(put)); ints.push(Math.round(b - put)); };
    push(0);
    for (let mth = 1; mth <= months; mth++) {
      b = b * (1 + r) + perMonth; put += perMonth;
      if (monthly || mth % 12 === 0) push(mth);
    }
    const tot = Math.round(b), putIn = Math.round(put), gain = tot - putIn;
    $('#st-in').textContent = money(putIn, { short: true });
    $('#st-int').textContent = money(gain, { short: true });
    $('#st-tot').textContent = money(tot, { short: true });
    const yrs = plural(tm.years, 'year');
    $('#tm-head').innerHTML = tm.weekly > 0 || tm.start > 0
      ? `${tm.start ? `Start with <b>${money(tm.start * 100, { short: true })}</b>${tm.weekly ? ', add' : ''}` : 'Save'}${tm.weekly ? ` <b>${money(Math.round(tm.weekly * 100))}</b> a week` : ''}, wait <b>${yrs}</b>, and you'll have <b>${money(tot, { short: true })}</b>.${gain > 0 ? ` <span class="muted">${Math.round(gain / Math.max(1, tot) * 100)}% of it is money you never had to earn.</span>` : ''}`
      : 'Move the sliders to start the time machine.';
    const lbl = mth => mth === 0 ? 'Now' : monthly ? (mth % 12 === 0 ? plural(mth / 12, 'yr') : `${mth} mo`) : `${mth / 12} yr`;
    Chart.render($('#tm-chart'), {
      title: 'Savings over time', labels, stacked: true, area: true, directLabels: true,
      series: [{ name: 'You put in', color: '#3987e5', values: ins }, { name: 'Interest', color: '#d95926', values: ints }],
      fmtY: (v, axis) => axis ? moneyAxis(v) : money(v), xTick: i => lbl(labels[i]),
      tipTitle: i => labels[i] === 0 ? 'Now' : `After ${monthly ? (labels[i] % 12 === 0 ? plural(labels[i] / 12, 'year') : plural(labels[i], 'month')) : plural(labels[i] / 12, 'year')}`,
      xName: 'When',
    });
    const notes = [];
    if (tm.rate > 0) notes.push(`<b>Rule of 72:</b> at ${tm.rate}%, money doubles about every <b>${(72 / tm.rate).toFixed(1).replace(/\.0$/, '')} years</b>.`);
    if (tm.rate > 0) { const toy = Math.round(2000 * Math.pow(1 + r, months)); notes.push(`<b>Spend or wait?</b> A $20 toy today costs future-you <b>${money(toy, { short: true })}</b> in ${yrs}.`); }
    let html = notes.length ? `<div class="callout">${notes.join('<br>')}</div>` : '';
    if (tm.rate > 20) html += `<div class="callout warn">${tm.rate}% a year is a training rate from the Bank of Mom & Dad. No real bank pays this much, so try 4% or 7% to see real life.</div>`;
    if (tm.rate === 7) html += '<p class="hint" style="margin-top:10px">Stocks have grown about 7% a year after inflation over long stretches, but some years go way down. Nothing is guaranteed.</p>';
    $('#tm-notes').innerHTML = html;
  };
  ['start', 'weekly', 'rate', 'years'].forEach(n => $('#s-' + n).oninput = upd);
  $$('[data-r]', body).forEach(c => c.onclick = () => { $('#s-rate').value = c.dataset.r; upd(); });
  upd();
}

// ── Learn ───────────────────────────────────────────────────────────────────
function tabLearn(body, k) {
  const l = LESSONS.find(x => x.id === ui.lessonId);
  if (!l) {
    const n = Object.keys(k.lessons).length;
    body.innerHTML = `<div class="section-h"><h2>Money moves</h2><span class="muted small">${n} of ${LESSONS.length} done</span></div>
      <div class="lessons">${LESSONS.map(x => `<button class="lesson-card ${k.lessons[x.id] ? 'done' : ''}" data-l="${x.id}"><i>${x.emoji}</i><div><b>${x.title}</b><small>${k.lessons[x.id] ? '✓ Done' : '2 minutes'}</small></div></button>`).join('')}</div>`;
    $$('[data-l]', body).forEach(b => b.onclick = () => { ui.lessonId = b.dataset.l; render(); scrollTo({ top: 0 }); });
    return;
  }
  const i = LESSONS.indexOf(l), next = LESSONS[i + 1];
  body.innerHTML = `<button class="back" id="lback">← All lessons</button>
    <div class="card lesson-body"><div class="big-emoji">${l.emoji}</div><h1>${l.title}</h1>${l.body.map(p => `<p>${p}</p>`).join('')}
      <div class="quiz"><h3>${l.q}</h3>${l.choices.map((c, j) => `<button class="choice" data-c="${j}">${c}</button>`).join('')}<div id="why"></div></div></div>`;
  $('#lback').onclick = () => { ui.lessonId = null; render(); };
  $$('.choice', body).forEach(b => b.onclick = () => {
    const j = +b.dataset.c;
    if (j === l.a) {
      $$('.choice', body).forEach(x => x.disabled = true);
      b.classList.add('right');
      const first = !k.lessons[l.id];
      k.lessons[l.id] = Date.now(); save();
      $('#why').innerHTML = `<div class="callout" style="margin-top:10px">✓ <b>Right!</b> ${l.why}</div><div class="row" style="margin-top:14px">${next ? `<button class="btn" id="lnext">Next: ${next.emoji} ${next.title}</button>` : ''}<button class="btn ghost" id="lall">All lessons</button></div>`;
      if (first) { confetti(); coin(); }
      $('#lnext') && ($('#lnext').onclick = () => { ui.lessonId = next.id; render(); scrollTo({ top: 0 }); });
      $('#lall').onclick = () => { ui.lessonId = null; render(); };
      checkBadges(k);
    } else {
      b.classList.add('wrong'); b.disabled = true;
      $('#why').innerHTML = '<p class="hint" style="margin-top:6px">Not quite. Read it again and try another answer.</p>';
    }
  });
}

// ── History ─────────────────────────────────────────────────────────────────
const KIND_ICON = { deposit: '➕', allowance: '📅', interest: '🌱', spend: '🛒', give: '💜', move: '🔁', goal: '🎯' };
function tabHistory(body, k) {
  sortTx(k);
  const groups = [];
  const seen = new Map();
  for (const x of k.tx.slice().reverse()) {
    const key = x.g || x.id;
    if (!seen.has(key)) { const gr = { key, items: [] }; seen.set(key, gr); groups.push(gr); }
    seen.get(key).items.push(x);
  }
  // daily totals for the chart
  let chart = '';
  if (k.tx.length) {
    const first = startOfDay(k.tx[0].t), days = Math.max(1, Math.round((startOfDay(Date.now()) - first) / DAY));
    const step = Math.max(1, Math.ceil(days / 120));
    const labels = [], vals = [];
    let i = 0, run = 0;
    for (let d = 0; d <= days + step - 1; d += step) {
      const dd = Math.min(d, days), end = addDays(first, dd + 1).getTime();
      while (i < k.tx.length && k.tx[i].t < end) run += k.tx[i++].amt;
      labels.push(addDays(first, dd).getTime()); vals.push(run);
      if (dd === days) break;
    }
    if (labels.length === 1) { labels.unshift(addDays(first, -1).getTime()); vals.unshift(0); }
    chart = `<div class="section-h"><h2>All my money over time</h2></div><div class="card"><div id="h-chart"></div></div>`;
    setTimeout(() => Chart.render($('#h-chart'), {
      title: 'Total money over time', labels, area: true, series: [{ name: 'Total', color: '#3987e5', values: vals }],
      fmtY: (v, axis) => axis ? moneyAxis(v) : money(v), xTick: i => new Date(labels[i]).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
      tipTitle: i => fmtDate(labels[i], { plain: true }), xName: 'Date',
    }));
  }
  const yr = new Date(new Date().getFullYear(), 0, 1).getTime();
  const sumKind = kind => k.tx.reduce((s, x) => s + (x.kind === kind ? x.amt : 0), 0);
  body.innerHTML = `${chart}
    <div class="section"><div class="kpis">
      <div class="kpi"><span>Interest earned</span><b>${money(interestTotal(k))}</b><small>${money(interestTotal(k, yr))} this year</small></div>
      <div class="kpi"><span>Allowance</span><b>${money(sumKind('allowance'))}</b><small>since the start</small></div>
      <div class="kpi"><span>Given away</span><b>${money(-sumKind('give'))}</b><small>to people and causes</small></div>
    </div></div>
    <div class="section"><div class="section-h"><h2>Every coin</h2>${isParent() ? '<span class="muted small">Parent: tap Undo to remove a mistake</span>' : ''}</div>
      <div class="card">${groups.length ? groups.slice(0, 200).map(gr => {
        const x = gr.items[0], sum = gr.items.reduce((s, y) => s + y.amt, 0);
        const jars = x.kind === 'move' ? '' : gr.items.map(y => `<span class="jar-tag" style="background:color-mix(in srgb, ${JAR[y.jar].color} 22%, transparent);color:${JAR[y.jar].color}">${JAR[y.jar].name}${gr.items.length > 1 ? ' ' + money(y.amt) : ''}</span>`).join('');
        const what = x.kind === 'move' ? `Moved ${JAR[gr.items.find(y => y.amt < 0).jar].name} → ${JAR[gr.items.find(y => y.amt > 0).jar].name}` : esc(x.note || x.kind);
        const shown = x.kind === 'move' ? Math.abs(gr.items[0].amt) : sum;
        return `<div class="tx"><div class="tx-ico">${KIND_ICON[x.kind] || '•'}</div>
          <div><div class="tx-what">${what}${x.kind === 'move' ? '' : jars}</div><div class="tx-when">${fmtDate(x.t)} · ${new Date(x.t).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}</div></div>
          <div><div class="tx-amt ${x.kind === 'move' ? '' : shown > 0 ? 'plus' : ''}">${x.kind === 'move' ? money(shown) : money(shown, { sign: true })}</div>${isParent() ? `<button class="tx-del" data-undo="${gr.key}">Undo</button>` : ''}</div></div>`;
      }).join('') : '<p class="muted">Nothing yet. Money you get, save, spend and give will show up here.</p>'}</div></div>`;
  $$('[data-undo]', body).forEach(b => b.onclick = () => requireParent(() => {
    const key = b.dataset.undo, items = k.tx.filter(x => (x.g || x.id) === key);
    const goalTx = items.find(x => x.kind === 'goal');
    confirmBox('Undo this?', `This removes ${items.length > 1 ? 'these entries' : 'this entry'} (${esc(items[0].note || items[0].kind)}) as if it never happened.`, 'Undo it', () => {
      k.tx = k.tx.filter(x => (x.g || x.id) !== key);
      if (goalTx) { const g = k.goals.find(z => z.doneAt && `Bought: ${z.name}` === goalTx.note); if (g) g.doneAt = 0; }
      save(); toast('Removed'); render();
    }, true);
  }));
}

// ── Parent: the bank's office ───────────────────────────────────────────────
function renderParent(app) {
  const yr = new Date(new Date().getFullYear(), 0, 1).getTime();
  const fam = state.kids.reduce((s, k) => s + total(k), 0);
  const paidYr = state.kids.reduce((s, k) => s + interestTotal(k, yr), 0);
  const nextAll = state.kids.reduce((s, k) => s + nextInterest(k).amt, 0);
  const weekly = state.kids.reduce((s, k) => s + k.allowance, 0);
  const nb = nextBoundary(currentPeriodStart());
  app.innerHTML = `
    <div class="family-h"><div><p class="muted">The bank's office</p><h1>Parent mode</h1></div>
      <div class="row"><button class="btn ghost small" id="lock">🔒 Lock</button><button class="btn small" id="p-add">+ Add a kid</button></div></div>
    <div class="kpis">
      <div class="kpi"><span>Family deposits</span><b>${money(fam)}</b><small>what the bank owes the kids</small></div>
      <div class="kpi"><span>Interest paid ${new Date().getFullYear()}</span><b>${money(paidYr)}</b><small>your cost of patience</small></div>
      <div class="kpi"><span>Next interest</span><b>${money(nextAll)}</b><small>about, on ${fmtDate(nb, { plain: true })}</small></div>
      <div class="kpi"><span>Allowance</span><b>${money(weekly)}</b><small>every ${WEEKDAYS[state.allowanceDay]} · ${money(Math.round(weekly * 52 / 12))}/mo</small></div>
    </div>
    <div class="section"><div class="section-h"><h2>Accounts</h2></div>
      <div class="card table-wrap"><table class="p-table">
        <thead><tr><th>Kid</th><th>Spend</th><th>Save</th><th>Give</th><th>Total</th><th>Allowance</th><th>Rate</th><th>Patience</th><th></th></tr></thead>
        <tbody>${state.kids.map(k => `<tr>
          <td><div class="p-kid"><div class="avatar" style="--c:${k.color}">${k.emoji}</div>${esc(k.name)}</div></td>
          <td>${money(bal(k, 'spend'))}</td><td>${money(bal(k, 'save'))}</td><td>${money(bal(k, 'give'))}</td><td><b>${money(total(k))}</b></td>
          <td>${money(k.allowance)}/wk</td><td>${k.rate}%</td><td>${plural(patienceDays(k), 'day')}</td>
          <td><div class="row" style="justify-content:flex-end;gap:6px;flex-wrap:nowrap"><button class="btn ghost small" data-open="${k.id}">Open</button><button class="btn ghost small" data-edit="${k.id}">Edit</button></div></td></tr>`).join('')}</tbody>
      </table></div></div>
    <div class="section"><div class="section-h"><h2>Bank rules</h2></div>
      <div class="card">
        <div class="two">
          <label class="field"><span>Allowance day</span><select id="s-day">${WEEKDAYS.map((d, i) => `<option value="${i}" ${i === state.allowanceDay ? 'selected' : ''}>${d}</option>`).join('')}</select></label>
          <label class="field"><span>Interest is paid</span><select id="s-int"><option value="month" ${state.interestEvery === 'month' ? 'selected' : ''}>Monthly, on the 1st</option><option value="week" ${state.interestEvery === 'week' ? 'selected' : ''}>Weekly, on allowance day</option></select></label>
        </div>
        <p class="hint">Interest is paid on the <b>lowest</b> Save balance during each period, so money that's taken out stops earning right away. That's the lesson: patience pays. Each kid's rate is set under Edit.</p>
      </div></div>
    <div class="section"><div class="section-h"><h2>Settings</h2></div>
      <div class="card">
        <div class="row"><button class="btn ghost small" id="s-backup">💾 Save a backup file</button><button class="btn ghost small" id="s-restore">Restore a backup</button><button class="btn ghost small" id="s-pin">Change PIN</button></div>
        <p class="hint" style="margin-top:10px">${state.lastBackup ? `Last backup: ${fmtDate(state.lastBackup, { plain: true })}.` : 'No backup yet.'} The bank's records live only in this browser, so a backup file keeps them safe and moves them to another device.
        The PIN is a speed bump for kids, not real security.</p>
      </div></div>
    <footer class="app-foot">Parent mode locks itself after 10 minutes.</footer>`;
  $('#lock').onclick = () => { ui.parentUntil = 0; toast('Parent mode locked'); go('family'); };
  $('#p-add').onclick = () => kidForm(null);
  $$('[data-open]').forEach(b => b.onclick = () => go('kid', { kidId: b.dataset.open, tab: 'jars' }));
  $$('[data-edit]').forEach(b => b.onclick = () => kidForm(kidById(b.dataset.edit)));
  $('#s-day').onchange = e => {
    state.allowanceDay = +e.target.value;
    const last = dayKey(lastAllowanceDayOnOrBefore(Date.now()));
    state.kids.forEach(k => { k.lastAllowance = last; if (state.interestEvery === 'week') k.lastInterest = dayKey(currentPeriodStart()); });
    save(); toast(`Allowance now comes every ${WEEKDAYS[state.allowanceDay]}`); render();
  };
  $('#s-int').onchange = e => {
    state.interestEvery = e.target.value;
    const start = dayKey(currentPeriodStart());
    state.kids.forEach(k => k.lastInterest = start);
    save(); toast(state.interestEvery === 'week' ? 'Interest is now paid weekly' : 'Interest is now paid monthly'); render();
  };
  $('#s-backup').onclick = () => { backupNow(); render(); };
  $('#s-restore').onclick = restorePick;
  $('#s-pin').onclick = () => setPinFlow(() => { toast('PIN changed'); render(); }, 'Choose a new PIN');
}

function kidForm(k) {
  const isNew = !k;
  const d = k || { name: '', emoji: EMOJIS[state.kids.length % EMOJIS.length], color: COLORS[state.kids.length % COLORS.length], allowance: 500, split: { spend: 50, save: 40, give: 10 }, rate: 12 };
  let emoji = d.emoji, color = d.color, rate = d.rate;
  openModal(`<h2>${isNew ? 'Add a kid' : 'Edit ' + esc(d.name)}</h2><p class="sub">${isNew ? 'Open a new account at the family bank.' : 'Changes apply from now on.'}</p>
    <label class="field"><span>Name</span><input type="text" id="kname" maxlength="20" value="${esc(d.name)}" placeholder="First name"></label>
    <div class="field"><span>Picture</span><div class="emoji-pick" id="kemoji">${EMOJIS.map(e => `<button type="button" data-e="${e}" class="${e === emoji ? 'on' : ''}">${e}</button>`).join('')}</div></div>
    <div class="field"><span>Color</span><div class="color-pick" id="kcolor">${COLORS.map(c => `<button type="button" data-c="${c}" style="background:${c}" class="${c === color ? 'on' : ''}" aria-label="Color ${c}"></button>`).join('')}</div></div>
    <div class="two">
      <label class="field"><span>Weekly allowance</span><div class="money-input"><input type="text" inputmode="decimal" id="kallow" value="${(d.allowance / 100).toFixed(2)}"></div></label>
      ${isNew ? '<label class="field"><span>Starting money (optional)</span><div class="money-input"><input type="text" inputmode="decimal" id="kstart" placeholder="0.00"></div></label>' : '<div></div>'}
    </div>
    <div class="field"><span>How allowance splits (%)</span><div class="three">
      ${JARS.map(j => `<label class="field" style="margin:0"><span style="color:${JAR[j].color}">${JAR[j].name}</span><input type="number" min="0" max="100" step="5" id="ks-${j}" value="${d.split[j]}"></label>`).join('')}</div>
      <div class="hint" id="ksum"></div></div>
    <div class="field"><span>Interest on Save (% a year)</span>
      <div class="chips" id="krates">${RATE_PRESETS.map(p => `<button type="button" class="chip ${p.rate === rate ? 'on' : ''}" data-r="${p.rate}" title="${p.note}">${p.label} · ${p.rate}%</button>`).join('')}</div>
      <input type="number" class="input" id="krate" min="0" max="120" step="0.5" value="${rate}" style="margin-top:8px">
      <div class="hint" id="kratehint"></div></div>
    <div class="err" id="err"></div>
    <div class="modal-foot">${isNew ? '' : '<button class="btn ghost small" id="kdel" style="margin-right:auto;color:var(--bad)">Close account</button>'}<button class="btn ghost" data-close>Cancel</button><button class="btn" id="ok">${isNew ? 'Open account' : 'Save'}</button></div>`, m => {
    const pick = (box, attr, set) => $$(`#${box} button`, m).forEach(b => b.onclick = () => { $$(`#${box} button`, m).forEach(x => x.classList.remove('on')); b.classList.add('on'); set(b.dataset[attr]); });
    pick('kemoji', 'e', v => emoji = v);
    pick('kcolor', 'c', v => color = v);
    const sumUpd = () => {
      const s = JARS.reduce((a, j) => a + (+$('#ks-' + j, m).value || 0), 0);
      $('#ksum', m).textContent = s === 100 ? '' : `These add up to ${s}%. They need to add up to 100%.`;
      $('#ksum', m).style.color = s === 100 ? '' : 'var(--bad)';
    };
    const rateUpd = () => {
      rate = +$('#krate', m).value || 0;
      $$('#krates .chip', m).forEach(c => c.classList.toggle('on', +c.dataset.r === rate));
      const p = RATE_PRESETS.find(x => x.rate === rate);
      const monthlyOn100 = Math.round(10000 * rate / 100 / 12);
      $('#kratehint', m).textContent = (p ? p.note + '. ' : '') + `On $100 in Save that's about ${money(monthlyOn100)} a month.`;
    };
    JARS.forEach(j => $('#ks-' + j, m).oninput = sumUpd);
    $$('#krates .chip', m).forEach(c => c.onclick = () => { $('#krate', m).value = c.dataset.r; rateUpd(); });
    $('#krate', m).oninput = rateUpd;
    sumUpd(); rateUpd();
    $('#kdel', m) && ($('#kdel', m).onclick = () => {
      openModal(`<h2>Close ${esc(d.name)}'s account?</h2><p class="sub">This deletes all of ${esc(d.name)}'s jars, goals and history from this device (${money(total(d))} on the books). It can't be undone unless you have a backup file.</p>
        <label class="field"><span>Type ${esc(d.name)} to confirm</span><input type="text" id="cname"></label>
        <div class="modal-foot"><button class="btn ghost" data-close>Cancel</button><button class="btn danger" id="cdel">Delete for good</button></div>`, m2 => {
        $('#cdel', m2).onclick = () => {
          if ($('#cname', m2).value.trim().toLowerCase() !== d.name.toLowerCase()) { $('#cname', m2).focus(); return; }
          state.kids = state.kids.filter(x => x !== d); save(); closeModal(); toast('Account closed'); go(isParent() ? 'parent' : 'family');
        };
      });
    });
    $('#ok', m).onclick = () => {
      const name = $('#kname', m).value.trim();
      const allowance = parseMoney($('#kallow', m).value || '0');
      const split = Object.fromEntries(JARS.map(j => [j, Math.round(+$('#ks-' + j, m).value || 0)]));
      if (!name) { $('#err', m).textContent = 'What\'s their name?'; return; }
      if (!(allowance >= 0)) { $('#err', m).textContent = 'Allowance should be an amount, like 5 or 7.50.'; return; }
      if (JARS.reduce((a, j) => a + split[j], 0) !== 100 || JARS.some(j => split[j] < 0)) { $('#err', m).textContent = 'The split needs to add up to 100%.'; return; }
      if (!(rate >= 0 && rate <= 120)) { $('#err', m).textContent = 'Pick an interest rate between 0 and 120%.'; return; }
      if (isNew) {
        const nk = { id: uid(), name, emoji, color, allowance, split, rate, created: Date.now(), tx: [], goals: [], lessons: {}, seen: [],
          lastAllowance: dayKey(lastAllowanceDayOnOrBefore(Date.now())), lastInterest: dayKey(currentPeriodStart()) };
        const start = parseMoney($('#kstart', m).value || '0');
        if (start > 0) deposit(nk, start, 'split', 'deposit', 'Opening deposit');
        state.kids.push(nk);
        save(); closeModal(); coin(); toast(`${emoji} ${name}'s account is open!`);
        go('kid', { kidId: nk.id, tab: 'jars' });
      } else {
        Object.assign(d, { name, emoji, color, allowance, split, rate });
        save(); closeModal(); toast('Saved'); render();
      }
    };
  });
}

// ── Backup & restore ────────────────────────────────────────────────────────
function backupNow() {
  const blob = new Blob([JSON.stringify(state, null, 1)], { type: 'application/json' });
  const url = URL.createObjectURL(blob), a = document.createElement('a');
  a.href = url; a.download = `nestegg-backup-${dayKey(Date.now())}.json`;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
  state.lastBackup = Date.now(); save(); toast('Backup saved to your downloads');
}
function restorePick() {
  const inp = document.createElement('input');
  inp.type = 'file'; inp.accept = '.json,application/json';
  inp.onchange = () => {
    const f = inp.files[0]; if (!f) return;
    f.text().then(txt => {
      let s;
      try { s = JSON.parse(txt); } catch (e) { s = null; }
      if (!s || s.app !== 'nestegg' || !Array.isArray(s.kids)) {
        openModal('<h2>That file didn\'t work</h2><p class="sub">It isn\'t a Nest Egg backup, or it\'s damaged. Backups are named like nestegg-backup-2026-11-25.json.</p><div class="modal-foot"><button class="btn" data-close>OK</button></div>');
        return;
      }
      const sum = s.kids.map(k => `${esc(k.emoji)} ${esc(k.name)} (${money(k.tx.reduce((a, x) => a + x.amt, 0))})`).join(', ');
      confirmBox('Restore this backup?', `It has ${plural(s.kids.length, 'account')}: ${sum}. It replaces everything on this device, including the PIN.`, 'Restore', () => {
        state = Object.assign(freshState(), s); save(); ui.parentUntil = 0; catchUp(); toast('Backup restored'); go('family');
      }, true);
    });
  };
  inp.click();
}

// ── Start ───────────────────────────────────────────────────────────────────
catchUp();
render();
setInterval(() => { renderTop(); if (ui.view === 'parent' && !isParent()) go('family'); }, 30e3);
setInterval(() => { const before = JSON.stringify(state.kids.map(k => k.tx.length)); catchUp(); if (JSON.stringify(state.kids.map(k => k.tx.length)) !== before) render(); }, 30 * 60e3);
document.addEventListener('visibilitychange', () => { if (!document.hidden) { catchUp(); render(); } });
window.addEventListener('storage', e => { if (e.key === KEY) { state = load(); render(); } });
if ('serviceWorker' in navigator && location.protocol !== 'file:') navigator.serviceWorker.register('sw.js').catch(() => {});

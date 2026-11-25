// Chore Board: kids check off chores, a parent approves, and the pay goes into their Nest Egg jars.
// Nest Egg lives on the same site, so both apps can read the same browser storage. When Nest Egg
// has kids, Chore Board uses them (and the Nest Egg parent PIN). Without it, it keeps its own kids.
'use strict';

const KEY = 'choreboard-v1', NE_KEY = 'nestegg-v1';
const DAY = 864e5;
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const CHORE_EMOJIS = ['🛏️', '🍽️', '🐶', '🐱', '🧺', '🗑️', '🧹', '🧽', '❄️', '🍂', '🚗', '📚', '🪴', '🦷', '🎒', '🧸', '🥪', '🛁', '🪟', '📦', '🎹', '⚽'];
const KID_EMOJIS = ['🦊', '🐻', '🐺', '🦉', '🐢', '🦄', '🐯', '🐸', '🐧', '🦖', '🐙', '🐝'];
const COLORS = ['#4cc9f0', '#f4a261', '#c77dff', '#52b788', '#ef476f', '#ffd166', '#90e0ef', '#e76f51'];
const SUGGEST = [
  { name: 'Make your bed', emoji: '🛏️', pay: 0, when: 'daily', who: 'each', on: true },
  { name: 'Clear your dishes', emoji: '🍽️', pay: 25, when: 'daily', who: 'each', on: true },
  { name: 'Read for 20 minutes', emoji: '📚', pay: 0, when: 'daily', who: 'each', on: true },
  { name: 'Feed the pet', emoji: '🐶', pay: 25, when: 'daily', who: 'any', on: false },
  { name: 'Put your laundry away', emoji: '🧺', pay: 50, when: 'days', days: [1, 4], who: 'each', on: false },
  { name: 'Take out the trash', emoji: '🗑️', pay: 100, when: 'days', days: [2], who: 'any', on: false },
  { name: 'Clean your room', emoji: '🧹', pay: 200, when: 'weekly', who: 'each', on: true },
  { name: 'Vacuum the living room', emoji: '🧽', pay: 200, when: 'weekly', who: 'any', on: false },
  { name: 'Shovel the driveway', emoji: '❄️', pay: 500, when: 'once', who: 'any', on: true },
  { name: 'Help wash the car', emoji: '🚗', pay: 300, when: 'once', who: 'any', on: false },
];

// ── Helpers ─────────────────────────────────────────────────────────────────
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const money = c => '$' + (c / 100).toFixed(2);
const parseMoney = s => { const v = parseFloat(String(s).replace(/[$,\s]/g, '')); return isFinite(v) ? Math.round(v * 100) : NaN; };
const pad = n => String(n).padStart(2, '0');
const dayKey = d => { d = new Date(d); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };
const startOfDay = d => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; };
const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
const weekStart = d => { const x = startOfDay(d); x.setDate(x.getDate() - ((x.getDay() + 6) % 7)); return x; }; // Monday
const plural = (n, w) => `${n} ${n === 1 ? w : w + 's'}`;

// ── State ───────────────────────────────────────────────────────────────────
function load() {
  try { const s = JSON.parse(localStorage.getItem(KEY)); if (s && s.app === 'choreboard') return s; } catch (e) { /* new */ }
  return { app: 'choreboard', kids: [], chores: [], log: [], pinHash: null, payJar: 'split', sound: true, created: Date.now() };
}
let state = load();
const save = () => localStorage.setItem(KEY, JSON.stringify(state));
const ui = { view: 'home', kidId: null, parentUntil: 0 };
const isParent = () => Date.now() < ui.parentUntil;

function nestEgg() {
  try { const s = JSON.parse(localStorage.getItem(NE_KEY)); return s && s.app === 'nestegg' && Array.isArray(s.kids) && s.kids.length ? s : null; } catch (e) { return null; }
}
const linked = () => !!nestEgg();
function kids() {
  const ne = nestEgg();
  return ne ? ne.kids.map(k => ({ id: k.id, name: k.name, emoji: k.emoji, color: k.color })) : state.kids;
}
const kidById = id => kids().find(k => k.id === id);

// If the family starts using Nest Egg after setting up kids here, move chores over to the
// Nest Egg kids with the same names.
function linkByName() {
  const ne = nestEgg();
  if (!ne || !state.kids.length) return;
  const map = {};
  for (const k of state.kids) { const m = ne.kids.find(x => x.name.trim().toLowerCase() === k.name.trim().toLowerCase()); if (m) map[k.id] = m.id; }
  if (!Object.keys(map).length) return;
  state.chores.forEach(c => c.who = c.who.map(w => map[w] || w));
  state.log.forEach(e => { if (map[e.kid]) e.kid = map[e.kid]; });
  state.kids = state.kids.filter(k => !map[k.id]);
  save();
}

// ── Chore logic ─────────────────────────────────────────────────────────────
const isAny = c => c.who[0] === 'any';
function period(c, d) { return c.when === 'weekly' ? 'w' + dayKey(weekStart(d)) : c.when === 'once' ? 'once' : dayKey(d); }
function appliesOn(c, d) {
  if (!c.active) return false;
  if (c.when === 'days') return c.days.includes(new Date(d).getDay());
  if (c.when === 'once') return !state.log.some(e => e.chore === c.id && e.status === 'ok') || state.log.some(e => e.chore === c.id && e.period === 'once' && dayKey(e.at) === dayKey(d));
  return true;
}
function entryFor(c, kidId, d) {
  const p = period(c, d);
  return state.log.find(e => e.chore === c.id && e.period === p && (isAny(c) || e.kid === kidId));
}
function choresFor(kidId, d = Date.now()) {
  return state.chores.filter(c => !isAny(c) && c.who.includes(kidId) && appliesOn(c, d) && c.created < startOfDay(d).getTime() + DAY);
}
const bonusJobs = (d = Date.now()) => state.chores.filter(c => isAny(c) && appliesOn(c, d));
function dayProgress(kidId, d) {
  const list = choresFor(kidId, d).filter(c => c.when !== 'weekly' || dayKey(d) === dayKey(Date.now()));
  return { total: list.length, done: list.filter(c => entryFor(c, kidId, d)).length };
}
// Days in a row with every daily chore checked off. Today counts once it's complete.
function streak(kidId) {
  let n = 0, empty = 0;
  for (let i = 0; i < 400; i++) {
    const d = addDays(Date.now(), -i);
    const list = choresFor(kidId, d).filter(c => c.when === 'daily' || c.when === 'days');
    if (!list.length) { if (++empty > 30) break; continue; }
    empty = 0;
    const all = list.every(c => entryFor(c, kidId, d));
    if (all) n++; else if (i > 0) break;
  }
  return n;
}
const earnedSince = (kidId, since) => state.log.reduce((s, e) => s + (e.kid === kidId && e.status === 'ok' && e.okAt >= since ? e.pay : 0), 0);
const owed = kidId => state.log.reduce((s, e) => s + (e.kid === kidId && e.status === 'ok' && e.pay && !e.paid ? e.pay : 0), 0);
const pending = () => state.log.filter(e => e.status === 'done' && kidById(e.kid));
function scheduleText(c) {
  if (c.when === 'daily') return 'Every day';
  if (c.when === 'weekly') return 'Once a week';
  if (c.when === 'once') return 'One time';
  return c.days.slice().sort((a, b) => ((a + 6) % 7) - ((b + 6) % 7)).map(d => WEEKDAYS[d]).join(', ');
}
function whoText(c) {
  if (isAny(c)) return 'Anyone (first to do it)';
  const names = c.who.map(id => kidById(id)?.name).filter(Boolean);
  return names.length === kids().length && names.length > 1 ? 'Each kid' : names.join(', ');
}

// Pays into Nest Egg exactly the way Nest Egg's own "Add money" does.
function payIntoNestEgg(kidId, cents, note) {
  const ne = nestEgg(); if (!ne) return false;
  const k = ne.kids.find(x => x.id === kidId); if (!k) return false;
  const g = uid(), t = Date.now();
  if (state.payJar === 'split') {
    const sp = Math.floor(cents * k.split.spend / 100), gv = Math.floor(cents * k.split.give / 100);
    const parts = { spend: sp, save: cents - sp - gv, give: gv };
    for (const j of ['spend', 'save', 'give']) if (parts[j]) k.tx.push({ id: uid(), t, jar: j, amt: parts[j], kind: 'deposit', note, g });
  } else k.tx.push({ id: uid(), t, jar: state.payJar, amt: cents, kind: 'deposit', note, g });
  localStorage.setItem(NE_KEY, JSON.stringify(ne));
  return true;
}

// Approves entries, then pays each kid once for the batch.
function approve(entries) {
  const byKid = {};
  for (const e of entries) { e.status = 'ok'; e.okAt = Date.now(); if (e.pay) (byKid[e.kid] ||= []).push(e); }
  let paidNE = 0;
  for (const [kidId, es] of Object.entries(byKid)) {
    const sum = es.reduce((s, e) => s + e.pay, 0);
    const names = [...new Set(es.map(e => state.chores.find(c => c.id === e.chore)?.name || 'Chore'))];
    if (linked() && payIntoNestEgg(kidId, sum, `Chores: ${names.join(', ')}`.slice(0, 80))) { es.forEach(e => e.paid = 'nestegg'); paidNE += sum; }
  }
  save();
  return paidNE;
}

// ── Sound, toast, confetti, modal ───────────────────────────────────────────
let actx;
function tone(freqs, len = 0.2, vol = 0.12) {
  if (!state.sound) return;
  try {
    actx = actx || new (window.AudioContext || window.webkitAudioContext)();
    freqs.forEach((f, i) => {
      const o = actx.createOscillator(), g = actx.createGain(), t = actx.currentTime + i * 0.08;
      o.type = 'sine'; o.frequency.value = f;
      g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t + len);
      o.connect(g).connect(actx.destination); o.start(t); o.stop(t + len + 0.05);
    });
  } catch (e) { /* no audio */ }
}
const ding = () => tone([784, 1047]);
const coin = () => tone([1318.5, 1975.5], 0.3, 0.15);
let toastTimer;
function toast(msg) { const el = $('#toast'); el.textContent = msg; el.classList.add('show'); clearTimeout(toastTimer); toastTimer = setTimeout(() => el.classList.remove('show'), 2600); }
function confetti() {
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const cv = $('#confetti'), cx = cv.getContext('2d'); cv.width = innerWidth; cv.height = innerHeight;
  const cols = ['#06d6a0', '#f4a261', '#4cc9f0', '#c77dff', '#ffd166'];
  const ps = Array.from({ length: 110 }, () => ({ x: innerWidth / 2 + (Math.random() - 0.5) * 220, y: innerHeight * 0.4, vx: (Math.random() - 0.5) * 12, vy: -Math.random() * 12 - 4, s: 4 + Math.random() * 6, c: cols[Math.random() * 5 | 0], r: Math.random() * 6 }));
  const t0 = performance.now();
  (function f(t) { cx.clearRect(0, 0, cv.width, cv.height); ps.forEach(p => { p.vy += 0.35; p.x += p.vx; p.y += p.vy; p.r += 0.1; cx.save(); cx.translate(p.x, p.y); cx.rotate(p.r); cx.fillStyle = p.c; cx.fillRect(-p.s / 2, -p.s / 4, p.s, p.s / 2); cx.restore(); }); if (t - t0 < 1700) requestAnimationFrame(f); else cx.clearRect(0, 0, cv.width, cv.height); })(t0);
}
function openModal(html, onMount) {
  $('#modal-root').innerHTML = `<div class="modal-back"><div class="modal" role="dialog" aria-modal="true">${html}</div></div>`;
  const back = $('.modal-back');
  back.addEventListener('mousedown', e => { if (e.target === back) closeModal(); });
  $$('[data-close]').forEach(b => b.onclick = closeModal);
  onMount && onMount($('.modal'));
}
const closeModal = () => { $('#modal-root').innerHTML = ''; };
document.addEventListener('keydown', e => { if (e.key === 'Escape' && $('#modal-root').innerHTML) closeModal(); });
function confirmBox(title, text, ok, onOk, danger) {
  openModal(`<h2>${title}</h2><p class="sub">${text}</p><div class="modal-foot"><button class="btn ghost" data-close>Cancel</button><button class="btn ${danger ? 'danger' : ''}" id="ok">${ok}</button></div>`, m => { $('#ok', m).onclick = () => { closeModal(); onOk(); }; });
}

// ── PIN (shared with Nest Egg when linked: same hashing) ────────────────────
async function hashPin(pin) {
  const data = new TextEncoder().encode('nestegg:' + pin);
  if (crypto.subtle) { const buf = await crypto.subtle.digest('SHA-256', data); return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join(''); }
  let h = 5381; for (const b of data) h = ((h << 5) + h + b) >>> 0; return 'x' + h.toString(16);
}
const pinHash = () => linked() ? nestEgg().pinHash : state.pinHash;
function pinPad(title, sub, onDone) {
  let entry = '';
  openModal(`<h2 style="text-align:center">${title}</h2><p class="sub" style="text-align:center">${sub}</p>
    <div class="pin-dots" id="dots">${'<i></i>'.repeat(4)}</div><div class="err" id="perr" style="text-align:center"></div>
    <div class="pin-pad">${[1, 2, 3, 4, 5, 6, 7, 8, 9].map(n => `<button data-n="${n}">${n}</button>`).join('')}<button data-close style="font-size:0.9rem">Cancel</button><button data-n="0">0</button><button data-del style="font-size:1.1rem">⌫</button></div>`, m => {
    const dots = () => $$('#dots i', m).forEach((d, i) => d.classList.toggle('f', i < entry.length));
    const press = async n => {
      if (entry.length >= 4) return;
      entry += n; dots();
      if (entry.length === 4) {
        if (await onDone(entry) === false) {
          $('#perr', m).textContent = 'That\'s not it. Try again.';
          const d = $('#dots', m); d.classList.remove('shake'); void d.offsetWidth; d.classList.add('shake');
          entry = ''; setTimeout(dots, 250);
        }
      }
    };
    $$('[data-n]', m).forEach(b => b.onclick = () => press(b.dataset.n));
    $('[data-del]', m).onclick = () => { entry = entry.slice(0, -1); dots(); };
    const onKey = e => {
      if (!document.body.contains(m)) { document.removeEventListener('keydown', onKey); return; }
      if (/^\d$/.test(e.key)) { e.preventDefault(); press(e.key); }
      if (e.key === 'Backspace') { e.preventDefault(); entry = entry.slice(0, -1); dots(); }
    };
    setTimeout(() => document.addEventListener('keydown', onKey), 0);
  });
}
function setPinFlow(onSet) {
  pinPad('Choose a parent PIN', '4 digits. Kids will need it to approve chores.', first => {
    pinPad('Type it again', 'Just to be sure.', async second => {
      if (second !== first) { toast('Those didn\'t match. Let\'s start over.'); setTimeout(() => setPinFlow(onSet), 300); return; }
      state.pinHash = await hashPin(first); save(); closeModal(); onSet();
    });
  });
}
function requireParent(then) {
  if (isParent()) { ui.parentUntil = Date.now() + 10 * 60e3; then(); return; }
  if (!pinHash()) return setPinFlow(() => { ui.parentUntil = Date.now() + 10 * 60e3; renderTop(); then(); });
  pinPad('Parent PIN', linked() ? 'Same PIN as Nest Egg.' : 'Only grown-ups can do this part.', async pin => {
    if (await hashPin(pin) !== pinHash()) return false;
    ui.parentUntil = Date.now() + 10 * 60e3; closeModal(); renderTop(); then();
  });
}

// ── Routing ─────────────────────────────────────────────────────────────────
function go(view, extra = {}) { Object.assign(ui, { view }, extra); render(); scrollTo({ top: 0 }); }
function renderTop() {
  $('#topbar').hidden = !state.chores.length;
  $('#btn-sound').textContent = state.sound ? '🔊' : '🔇';
  const pb = $('#btn-parent'), n = pending().length;
  pb.classList.toggle('on', isParent());
  pb.innerHTML = `${isParent() ? '🔓' : '🔒'} Parent${n ? `<span class="badge">${n}</span>` : ''}`;
}
function render() {
  renderTop();
  const app = $('#app');
  if (!state.chores.length || !kids().length) return renderWelcome(app);
  if (ui.view === 'kid' && kidById(ui.kidId)) return renderKid(app, kidById(ui.kidId));
  if (ui.view === 'parent' && isParent()) return renderParent(app);
  ui.view = 'home'; renderHome(app);
}
$('#btn-sound').onclick = () => { state.sound = !state.sound; save(); renderTop(); ding(); };
$('#btn-parent').onclick = () => { if (isParent() && ui.view === 'parent') { ui.parentUntil = 0; toast('Parent mode locked'); go('home'); } else requireParent(() => go('parent')); };
document.addEventListener('click', e => { const g = e.target.closest('[data-go]'); if (g) go(g.dataset.go); });

// ── Welcome / setup ─────────────────────────────────────────────────────────
let draftKids = [];
function renderWelcome(app) {
  const ne = nestEgg();
  const list = ne ? ne.kids : draftKids.length ? draftKids : state.kids;
  app.innerHTML = `<div class="welcome"><img src="icon.svg" alt=""><h1>Chore Board</h1>
    <p>Kids check off their chores. A grown-up approves them. ${ne ? 'The pay goes straight into their Nest Egg jars.' : 'You see exactly what everyone earned.'}</p>
    <div class="card">
      ${ne ? `<div class="callout">🥚 <b>Connected to Nest Egg.</b> Using ${list.map(k => `${esc(k.emoji)} ${esc(k.name)}`).join(', ')}. Approved chores pay into their jars, split like their allowance. You'll use your Nest Egg PIN.</div>`
        : `<b>Who does chores?</b>
        <div class="row" style="margin:10px 0" id="draft">${list.map((k, i) => `<span class="chip">${k.emoji} ${esc(k.name)} <button data-rm="${i}" aria-label="Remove" style="margin-left:4px;color:var(--muted)">✕</button></span>`).join('') || '<span class="muted small">Add each kid.</span>'}</div>
        <form class="row" id="kidform"><input class="input" id="kname" maxlength="16" placeholder="Name" style="flex:1;min-width:0"><button class="btn small" type="submit">Add</button></form>
        <p class="hint" style="margin-top:8px">Using <a class="link-btn" href="../nestegg/">Nest Egg</a>? Set it up first and chores will pay straight into the kids' jars.</p>`}
      <div style="margin-top:18px"><b>Pick some chores to start with</b> <span class="muted small">(you can change them any time)</span></div>
      <div class="suggest">${SUGGEST.map((s, i) => `<label><input type="checkbox" data-sg="${i}" ${s.on ? 'checked' : ''}><span style="font-size:1.3rem">${s.emoji}</span><span>${s.name}<small>${s.pay ? money(s.pay) : 'No pay'} · ${s.when === 'daily' ? 'Every day' : s.when === 'weekly' ? 'Once a week' : s.when === 'once' ? 'One-time bonus' : s.days.map(d => WEEKDAYS[d]).join(', ')}${s.who === 'any' ? ' · anyone' : ''}</small></span></label>`).join('')}</div>
      <div class="err" id="err"></div>
      <button class="btn big" id="go" style="width:100%">Create our chore board</button>
    </div>
    <footer class="app-foot">Everything stays on this device. Nothing is uploaded.</footer></div>`;
  if (!ne) {
    $('#kidform').onsubmit = e => {
      e.preventDefault();
      const name = $('#kname').value.trim(); if (!name) return;
      const n = draftKids.length;
      draftKids.push({ id: uid(), name, emoji: KID_EMOJIS[n % KID_EMOJIS.length], color: COLORS[n % COLORS.length] });
      renderWelcome(app); $('#kname').focus();
    };
    $$('[data-rm]').forEach(b => b.onclick = () => { draftKids.splice(+b.dataset.rm, 1); renderWelcome(app); });
  }
  $('#go').onclick = () => {
    const picks = $$('[data-sg]').filter(x => x.checked).map(x => SUGGEST[+x.dataset.sg]);
    if (!ne && !draftKids.length) { $('#err').textContent = 'Add at least one kid.'; return; }
    const create = () => {
      if (!ne) state.kids = draftKids.slice();
      const ids = kids().map(k => k.id);
      state.chores = picks.map(s => ({ id: uid(), name: s.name, emoji: s.emoji, pay: s.pay, when: s.when, days: s.days || [], who: s.who === 'any' ? ['any'] : ids.slice(), active: true, created: startOfDay(Date.now()).getTime() }));
      if (!state.chores.length) state.chores = [{ id: uid(), name: 'Make your bed', emoji: '🛏️', pay: 0, when: 'daily', days: [], who: ids.slice(), active: true, created: startOfDay(Date.now()).getTime() }];
      save(); confetti(); toast('Chore board ready!'); go('home');
    };
    requireParent(create);
  };
}

// ── Home ────────────────────────────────────────────────────────────────────
function ringSvg(frac, color) {
  const C = 2 * Math.PI * 32;
  return `<svg viewBox="0 0 74 74"><circle cx="37" cy="37" r="32" fill="none" stroke="#0d1020" stroke-width="7"/><circle cx="37" cy="37" r="32" fill="none" stroke="${color}" stroke-width="7" stroke-linecap="round" stroke-dasharray="${C}" stroke-dashoffset="${C * (1 - frac)}"/></svg>`;
}
function renderHome(app) {
  const ws = weekStart(Date.now()).getTime(), bonus = bonusJobs(), np = pending().length;
  const open = bonus.filter(c => !entryFor(c, null, Date.now()));
  const hr = new Date().getHours();
  app.innerHTML = `
    <div class="home-h"><div><p class="muted">${hr < 12 ? 'Good morning' : hr < 17 ? 'Good afternoon' : 'Good evening'} · ${new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}</p><h1>Whose chores?</h1></div></div>
    ${np ? `<div class="callout gold" style="margin-bottom:14px;display:flex;gap:12px;align-items:center;flex-wrap:wrap"><span style="flex:1">⏳ <b>${plural(np, 'chore')}</b> waiting for a grown-up to check.</span><button class="btn small" id="check">Check them</button></div>` : ''}
    <div class="kids">${kids().map(k => {
      const p = dayProgress(k.id, Date.now()), s = streak(k.id), frac = p.total ? p.done / p.total : 0;
      return `<button class="kid-card" data-kid="${k.id}" style="--c:${k.color}"><div class="ring">${ringSvg(frac, p.total && p.done === p.total ? '#3ddc84' : k.color)}<div class="em">${k.emoji}</div></div>
        <div><div class="nm">${esc(k.name)}</div><div class="sub">${p.total ? (p.done === p.total ? 'All done today! 🎉' : `${p.done} of ${p.total} done today`) : 'Nothing due today'}</div>${s > 1 ? `<div class="sub streak">🔥 ${s}-day streak</div>` : ''}</div>
        <div class="earn"><b>${money(earnedSince(k.id, ws))}</b><span>this week</span></div></button>`;
    }).join('')}</div>
    ${bonus.length ? `<div class="section"><div class="section-h"><h2>Bonus jobs</h2><span class="muted small">Anyone can grab these</span></div><div class="chores">${bonus.map(c => bonusRow(c, null)).join('')}</div></div>` : ''}
    <footer class="app-foot">${linked() ? '🥚 Approved chores pay into Nest Egg jars.' : 'Tip: set up <a class="link-btn" href="../nestegg/">Nest Egg</a> and chores pay straight into the kids\' jars.'}<br>Chore Board saves to this device only.</footer>`;
  $$('[data-kid]').forEach(b => b.onclick = () => go('kid', { kidId: b.dataset.kid }));
  $('#check') && ($('#check').onclick = () => requireParent(() => go('parent')));
  bindBonus(app, null);
}
function bonusRow(c, kidId) {
  const e = entryFor(c, kidId, Date.now()), who = e && kidById(e.kid);
  return `<div class="chore ${e ? (e.status === 'ok' ? 'ok' : 'done') : ''} ${e && kidId && e.kid !== kidId ? 'taken' : ''}"><div class="ico">${c.emoji}</div>
    <div><div class="nm">${esc(c.name)}</div><div class="meta">${c.pay ? `<span class="pay">${money(c.pay)}</span> · ` : ''}${c.when === 'once' ? 'One-time job' : scheduleText(c)}</div></div>
    ${e ? `<div class="state ${e.status === 'ok' ? 'ok' : 'wait'}">${who ? `${who.emoji} ${esc(who.name)}` : ''}<br>${e.status === 'ok' ? '✓ Approved' : '⏳ Waiting'}</div>`
      : kidId ? `<button class="did" data-claim="${c.id}">I did it!</button>` : `<button class="did" data-who="${c.id}">I did it!</button>`}</div>`;
}
function bindBonus(root, kidId) {
  $$('[data-claim]', root).forEach(b => b.onclick = () => markDone(state.chores.find(c => c.id === b.dataset.claim), kidId));
  $$('[data-who]', root).forEach(b => b.onclick = () => {
    const c = state.chores.find(x => x.id === b.dataset.who);
    openModal(`<h2>Who did it?</h2><p class="sub">${c.emoji} ${esc(c.name)}</p><div class="row">${kids().map(k => `<button class="btn ghost" data-k="${k.id}">${k.emoji} ${esc(k.name)}</button>`).join('')}</div>
      <div class="modal-foot"><button class="btn ghost" data-close>Cancel</button></div>`, m => {
      $$('[data-k]', m).forEach(x => x.onclick = () => { closeModal(); markDone(c, x.dataset.k); });
    });
  });
}

function markDone(c, kidId) {
  if (!c || entryFor(c, kidId, Date.now())) return;
  state.log.push({ id: uid(), chore: c.id, kid: kidId, period: period(c, Date.now()), at: Date.now(), status: 'done', pay: c.pay || 0, paid: 0 });
  save(); ding();
  const k = kidById(kidId), p = dayProgress(kidId, Date.now());
  if (!isAny(c) && p.total && p.done === p.total) { confetti(); toast(`🎉 All done today, ${k.name}!`); }
  else toast(c.pay ? `Nice! ${money(c.pay)} once a grown-up checks it.` : 'Nice work! A grown-up will check it.');
  render();
}

// ── Kid page ────────────────────────────────────────────────────────────────
function renderKid(app, k) {
  const now = Date.now(), ws = weekStart(now), list = choresFor(k.id, now), s = streak(k.id);
  const order = { daily: 0, days: 1, weekly: 2 };
  list.sort((a, b) => order[a.when] - order[b.when]);
  const bonus = bonusJobs();
  app.innerHTML = `
    <button class="back" data-go="home">← Everyone</button>
    <div class="row" style="margin-bottom:16px;gap:14px"><div class="av" style="--c:${k.color};width:64px;height:64px;font-size:34px;border-radius:18px">${k.emoji}</div>
      <div style="flex:1"><h1 style="font-size:1.8rem;font-weight:900">${esc(k.name)}</h1><p class="muted small">${s > 1 ? `<span class="streak">🔥 ${s}-day streak</span> · ` : ''}${money(earnedSince(k.id, ws.getTime()))} earned this week${!linked() && owed(k.id) ? ` · ${money(owed(k.id))} owed` : ''}</p></div></div>
    <div class="week">${Array.from({ length: 7 }, (_, i) => {
      const d = addDays(ws, i), p = dayProgress(k.id, d), future = d > startOfDay(now), today = dayKey(d) === dayKey(now);
      return `<div class="day ${today ? 'today' : ''} ${p.total && p.done === p.total && !future ? 'full' : ''}">${WEEKDAYS[d.getDay()]}<b>${future ? '·' : p.total ? (p.done === p.total ? '✓' : `${p.done}/${p.total}`) : '–'}</b></div>`;
    }).join('')}</div>
    <div class="section"><div class="section-h"><h2>Today</h2></div>
      <div class="chores">${list.length ? list.map(c => {
        const e = entryFor(c, k.id, now);
        return `<div class="chore ${e ? (e.status === 'ok' ? 'ok' : 'done') : ''}"><div class="ico">${c.emoji}</div>
          <div><div class="nm">${esc(c.name)}</div><div class="meta">${c.pay ? `<span class="pay">${money(c.pay)}</span> · ` : ''}${c.when === 'weekly' ? 'Any day this week' : scheduleText(c)}</div></div>
          ${e ? `<div class="state ${e.status === 'ok' ? 'ok' : 'wait'}">${e.status === 'ok' ? '✓ Approved' : '⏳ Waiting for a grown-up'}${e.status === 'done' ? `<button data-undo="${e.id}">Oops, not yet</button>` : ''}</div>` : `<button class="did" data-done="${c.id}">I did it!</button>`}</div>`;
      }).join('') : '<div class="card empty"><div>🌤️</div>No chores today. Enjoy it!</div>'}</div></div>
    ${bonus.length ? `<div class="section"><div class="section-h"><h2>Bonus jobs</h2><span class="muted small">First one to do it gets paid</span></div><div class="chores">${bonus.map(c => bonusRow(c, k.id)).join('')}</div></div>` : ''}`;
  $$('[data-done]').forEach(b => b.onclick = () => markDone(state.chores.find(c => c.id === b.dataset.done), k.id));
  $$('[data-undo]').forEach(b => b.onclick = () => { state.log = state.log.filter(e => e.id !== b.dataset.undo || e.status !== 'done'); save(); render(); });
  bindBonus(app, k.id);
}

// ── Parent page ─────────────────────────────────────────────────────────────
function renderParent(app) {
  const ws = weekStart(Date.now()).getTime(), list = pending(), ne = nestEgg();
  const choreName = id => state.chores.find(c => c.id === id) || { name: 'Deleted chore', emoji: '❔' };
  const weekPaid = kids().reduce((s, k) => s + earnedSince(k.id, ws), 0);
  app.innerHTML = `
    <div class="home-h"><div><p class="muted">Grown-ups only</p><h1>Parent mode</h1></div><button class="btn ghost small" id="lock">🔒 Lock</button></div>
    <div class="section" style="margin-top:0"><div class="section-h"><h2>Ready to check</h2>${list.length > 1 ? `<button class="btn small" id="all">✓ Approve all ${list.length}</button>` : ''}</div>
      <div class="card">${list.length ? list.sort((a, b) => a.at - b.at).map(e => {
        const k = kidById(e.kid), c = choreName(e.chore);
        return `<div class="inbox-item"><div class="av" style="--c:${k.color}">${k.emoji}</div>
          <div><b>${esc(k.name)}</b>: ${c.emoji} ${esc(c.name)}<div class="hint">${new Date(e.at).toLocaleString('en-US', { weekday: 'short', hour: 'numeric', minute: '2-digit' })}${e.pay ? ` · ${money(e.pay)}` : ''}</div></div>
          <div class="acts"><button class="btn ghost small" data-no="${e.id}" title="Not done yet">Not yet</button><button class="btn small" data-ok="${e.id}">✓</button></div></div>`;
      }).join('') : '<p class="muted">Nothing waiting. 👍</p>'}</div></div>
    <div class="section"><div class="section-h"><h2>This week</h2><span class="muted small">${money(weekPaid)} earned in all</span></div>
      <div class="card"><table class="tbl"><thead><tr><th>Kid</th><th>Today</th><th>Streak</th><th>Earned</th>${ne ? '' : '<th>Owed</th><th></th>'}</tr></thead><tbody>
      ${kids().map(k => { const p = dayProgress(k.id, Date.now()); return `<tr><td>${k.emoji} ${esc(k.name)}</td><td>${p.done}/${p.total}</td><td>${streak(k.id)} 🔥</td><td>${money(earnedSince(k.id, ws))}</td>${ne ? '' : `<td>${money(owed(k.id))}</td><td>${owed(k.id) ? `<button class="btn ghost small" data-paid="${k.id}">Mark paid</button>` : ''}</td>`}</tr>`; }).join('')}
      </tbody></table>${ne ? '<p class="hint" style="margin-top:10px">🥚 Pay goes into Nest Egg as soon as you approve, so nothing is ever owed.</p>' : ''}</div></div>
    <div class="section"><div class="section-h"><h2>Chores</h2><button class="btn small" id="add">+ Add a chore</button></div>
      <div class="chores p-list">${state.chores.filter(c => c.active).map(c => `<div class="chore"><div class="ico">${c.emoji}</div>
        <div><div class="nm">${esc(c.name)}</div><div class="meta">${c.pay ? `<span class="pay">${money(c.pay)}</span> · ` : 'No pay · '}${scheduleText(c)} · ${esc(whoText(c))}</div></div>
        <button class="btn ghost small" data-edit="${c.id}">Edit</button></div>`).join('')}</div></div>
    <div class="section"><div class="section-h"><h2>Settings</h2></div>
      <div class="card">
        ${ne ? `<label class="field"><span>Chore pay goes into</span><select id="jar"><option value="split" ${state.payJar === 'split' ? 'selected' : ''}>Split like allowance (Spend / Save / Give)</option><option value="save" ${state.payJar === 'save' ? 'selected' : ''}>The Save jar</option><option value="spend" ${state.payJar === 'spend' ? 'selected' : ''}>The Spend jar</option></select></label>
          <p class="hint">Kids and the PIN come from <a class="link-btn" href="../nestegg/">Nest Egg</a>. Add or rename kids there.</p>`
        : `<div class="row" style="margin-bottom:10px">${state.kids.map(k => `<span class="chip">${k.emoji} ${esc(k.name)} <button data-rmkid="${k.id}" style="margin-left:4px;color:var(--muted)" aria-label="Remove">✕</button></span>`).join('')}<button class="btn ghost small" id="addkid">+ Kid</button></div>
          <div class="row"><button class="btn ghost small" id="pin">Change PIN</button></div>
          <p class="hint" style="margin-top:8px">Want chore pay to land in savings jars automatically? Set up <a class="link-btn" href="../nestegg/">Nest Egg</a> with the same kid names and they'll link up.</p>`}
      </div></div>`;
  $('#lock').onclick = () => { ui.parentUntil = 0; toast('Parent mode locked'); go('home'); };
  const finishApprove = es => { const paid = approve(es); coin(); if (es.length > 1 || paid) confetti(); toast(paid ? `Approved. ${money(paid)} went into Nest Egg.` : `Approved ${plural(es.length, 'chore')}.`); render(); };
  $$('[data-ok]').forEach(b => b.onclick = () => finishApprove([state.log.find(e => e.id === b.dataset.ok)]));
  $('#all') && ($('#all').onclick = () => finishApprove(pending()));
  $$('[data-no]').forEach(b => b.onclick = () => { state.log = state.log.filter(e => e.id !== b.dataset.no); save(); toast('Sent back. It shows up as not done again.'); render(); });
  $$('[data-paid]').forEach(b => b.onclick = () => {
    const k = kidById(b.dataset.paid), amt = owed(k.id);
    confirmBox(`Paid ${esc(k.name)} ${money(amt)}?`, 'Marks everything they\'re owed as paid.', 'Mark paid', () => { state.log.forEach(e => { if (e.kid === k.id && e.status === 'ok' && e.pay && !e.paid) e.paid = 'cash'; }); save(); coin(); render(); });
  });
  $('#add').onclick = () => choreForm(null);
  $$('[data-edit]').forEach(b => b.onclick = () => choreForm(state.chores.find(c => c.id === b.dataset.edit)));
  $('#jar') && ($('#jar').onchange = e => { state.payJar = e.target.value; save(); toast('Saved'); });
  $('#pin') && ($('#pin').onclick = () => setPinFlow(() => toast('PIN changed')));
  $('#addkid') && ($('#addkid').onclick = () => kidForm());
  $$('[data-rmkid]').forEach(b => b.onclick = () => {
    const k = state.kids.find(x => x.id === b.dataset.rmkid);
    confirmBox(`Remove ${esc(k.name)}?`, 'Their chore history stays, but they come off every chore.', 'Remove', () => {
      state.kids = state.kids.filter(x => x !== k);
      state.chores.forEach(c => { c.who = c.who.filter(w => w !== k.id); if (!c.who.length) c.active = false; });
      save(); render();
    }, true);
  });
}

function kidForm() {
  openModal(`<h2>Add a kid</h2><label class="field"><span>Name</span><input type="text" id="kn" maxlength="16"></label><div class="err" id="err"></div>
    <div class="modal-foot"><button class="btn ghost" data-close>Cancel</button><button class="btn" id="ok">Add</button></div>`, m => {
    $('#kn', m).focus();
    $('#ok', m).onclick = () => {
      const name = $('#kn', m).value.trim(); if (!name) { $('#err', m).textContent = 'Type a name.'; return; }
      const n = state.kids.length, k = { id: uid(), name, emoji: KID_EMOJIS[n % KID_EMOJIS.length], color: COLORS[n % COLORS.length] };
      state.kids.push(k);
      state.chores.forEach(c => { if (!isAny(c) && c.who.length === n) c.who.push(k.id); }); // "each kid" chores include the new kid
      save(); closeModal(); render();
    };
  });
}

function choreForm(c) {
  const isNew = !c;
  const d = c || { name: '', emoji: CHORE_EMOJIS[0], pay: 0, when: 'daily', days: [], who: kids().map(k => k.id) };
  let emoji = d.emoji, when = d.when, days = d.days.slice(), who = d.who.slice();
  openModal(`<h2>${isNew ? 'New chore' : 'Edit chore'}</h2><p class="sub">${isNew ? 'What needs doing, how often, and by whom?' : 'Changes apply from today.'}</p>
    <label class="field"><span>Chore</span><input type="text" id="cn" maxlength="40" value="${esc(d.name)}" placeholder="Empty the dishwasher"></label>
    <div class="field"><span>Picture</span><div class="emoji-pick">${CHORE_EMOJIS.map(e => `<button type="button" data-e="${e}" class="${e === emoji ? 'on' : ''}">${e}</button>`).join('')}</div></div>
    <label class="field"><span>Pay (0 for "because we're a family")</span><div class="money-input"><input type="text" inputmode="decimal" id="cp" value="${(d.pay / 100).toFixed(2)}"></div></label>
    <div class="field"><span>How often</span><div class="chips" id="when">${[['daily', 'Every day'], ['days', 'Some days'], ['weekly', 'Once a week'], ['once', 'One time']].map(([v, l]) => `<button type="button" class="chip ${when === v ? 'on' : ''}" data-w="${v}">${l}</button>`).join('')}</div>
      <div class="chips" id="days" style="margin-top:8px"></div></div>
    <div class="field"><span>Who</span><div class="chips" id="who"></div><div class="hint">Pick kids to give each of them their own copy, or "Anyone" for a bonus job the first kid can claim.</div></div>
    <div class="err" id="err"></div>
    <div class="modal-foot">${isNew ? '' : '<button class="btn ghost small" id="del" style="margin-right:auto;color:var(--bad)">Delete</button>'}<button class="btn ghost" data-close>Cancel</button><button class="btn" id="ok">${isNew ? 'Add chore' : 'Save'}</button></div>`, m => {
    const drawDays = () => {
      $('#days', m).innerHTML = when === 'days' ? [1, 2, 3, 4, 5, 6, 0].map(i => `<button type="button" class="chip ${days.includes(i) ? 'on' : ''}" data-d="${i}">${WEEKDAYS[i]}</button>`).join('') : '';
      $$('[data-d]', m).forEach(b => b.onclick = () => { const i = +b.dataset.d; days = days.includes(i) ? days.filter(x => x !== i) : [...days, i]; drawDays(); });
    };
    const drawWho = () => {
      $('#who', m).innerHTML = kids().map(k => `<button type="button" class="chip ${who.includes(k.id) ? 'on' : ''}" data-k="${k.id}">${k.emoji} ${esc(k.name)}</button>`).join('') + `<button type="button" class="chip ${who[0] === 'any' ? 'on' : ''}" data-k="any">🙋 Anyone</button>`;
      $$('[data-k]', m).forEach(b => b.onclick = () => {
        const id = b.dataset.k;
        if (id === 'any') who = who[0] === 'any' ? [] : ['any'];
        else { who = who.filter(x => x !== 'any'); who = who.includes(id) ? who.filter(x => x !== id) : [...who, id]; }
        drawWho();
      });
    };
    drawDays(); drawWho();
    $$('.emoji-pick button', m).forEach(b => b.onclick = () => { $$('.emoji-pick button', m).forEach(x => x.classList.remove('on')); b.classList.add('on'); emoji = b.dataset.e; });
    $$('#when .chip', m).forEach(b => b.onclick = () => { $$('#when .chip', m).forEach(x => x.classList.remove('on')); b.classList.add('on'); when = b.dataset.w; drawDays(); });
    $('#del', m) && ($('#del', m).onclick = () => confirmBox('Delete this chore?', `"${esc(d.name)}" comes off everyone's list. Past history and pay stay.`, 'Delete', () => { c.active = false; save(); render(); }, true));
    $('#ok', m).onclick = () => {
      const name = $('#cn', m).value.trim(), pay = parseMoney($('#cp', m).value || '0');
      if (!name) return $('#err', m).textContent = 'What\'s the chore?';
      if (!(pay >= 0) || pay > 100000) return $('#err', m).textContent = 'Pay should be an amount, like 0.50.';
      if (when === 'days' && !days.length) return $('#err', m).textContent = 'Pick at least one day.';
      if (!who.length) return $('#err', m).textContent = 'Who does this chore?';
      if (isNew) state.chores.push({ id: uid(), name, emoji, pay, when, days, who, active: true, created: startOfDay(Date.now()).getTime() });
      else Object.assign(c, { name, emoji, pay, when, days, who });
      save(); closeModal(); toast(isNew ? `${emoji} ${name} added` : 'Saved'); render();
    };
  });
}

// ── Start ───────────────────────────────────────────────────────────────────
linkByName();
render();
setInterval(renderTop, 30e3);
let lastDay = dayKey(Date.now());
setInterval(() => { if (dayKey(Date.now()) !== lastDay) { lastDay = dayKey(Date.now()); render(); } }, 60e3);
document.addEventListener('visibilitychange', () => { if (!document.hidden) render(); });
window.addEventListener('storage', e => { if (e.key === KEY) { state = load(); render(); } else if (e.key === NE_KEY) render(); });
if ('serviceWorker' in navigator && location.protocol !== 'file:') navigator.serviceWorker.register('sw.js').catch(() => {});

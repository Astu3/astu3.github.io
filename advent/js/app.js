// Kindness Advent: one door a day, December 1–24. Each finished kindness lights a light in the village.
'use strict';

const KEY = 'advent-v1';
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// "Today". On a local test server only, ?date=2026-12-10 pretends it's another day.
function today() {
  const q = new URLSearchParams(location.search).get('date');
  if (q && /^(localhost|127\.0\.0\.1)$/.test(location.hostname)) { const [y, m, d] = q.split('-').map(Number); return new Date(y, m - 1, d, 12); }
  return new Date();
}
const NOW = today();
// The season runs into early January so late doors can still be finished.
const YEAR = NOW.getMonth() === 0 ? NOW.getFullYear() - 1 : NOW.getFullYear();
const isOpenable = d => d === 0 ? true : NOW >= new Date(YEAR, 11, d);
const daysUntil = d => Math.ceil((new Date(YEAR, 11, d) - new Date(NOW.getFullYear(), NOW.getMonth(), NOW.getDate())) / 864e5);
const isToday = d => NOW.getFullYear() === YEAR && NOW.getMonth() === 11 && NOW.getDate() === d;

function load() {
  try { const s = JSON.parse(localStorage.getItem(KEY)); if (s && s.app === 'advent') return s; } catch (e) { /* new */ }
  return { app: 'advent', names: [], sound: true, years: {} };
}
let state = load();
const save = () => localStorage.setItem(KEY, JSON.stringify(state));
const yr = () => (state.years[YEAR] ||= { opened: {}, done: {} });
const dayData = d => d === 0 ? WARMUP : DAYS[d - 1];
const doneCount = () => Object.keys(yr().done).filter(d => +d > 0).length;

// Doors sit in a scrambled order, like a real Advent calendar.
const ORDER = [7, 15, 2, 21, 11, 18, 4, 23, 13, 1, 9, 16, 20, 6, 24, 12, 3, 19, 10, 22, 5, 14, 17, 8];

// ── Sound & snow ────────────────────────────────────────────────────────────
let actx;
function bells(notes = [1568, 1976, 2349]) {
  if (!state.sound) return;
  try {
    actx = actx || new (window.AudioContext || window.webkitAudioContext)();
    notes.forEach((f, i) => {
      const t = actx.currentTime + i * 0.12;
      [1, 2.76].forEach((mult, j) => {
        const o = actx.createOscillator(), g = actx.createGain();
        o.type = 'sine'; o.frequency.value = f * mult;
        g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(j ? 0.03 : 0.1, t + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t + 1.2);
        o.connect(g).connect(actx.destination); o.start(t); o.stop(t + 1.3);
      });
    });
  } catch (e) { /* no audio */ }
}
const creak = () => bells([523, 659]);
(function snow() {
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const cv = $('#snow'), cx = cv.getContext('2d');
  let flakes = [];
  const size = () => { cv.width = innerWidth; cv.height = innerHeight; flakes = Array.from({ length: Math.round(innerWidth / 14) }, () => ({ x: Math.random() * innerWidth, y: Math.random() * innerHeight, r: 0.8 + Math.random() * 2.2, v: 0.3 + Math.random() * 0.8, w: Math.random() * 6 })); };
  size(); addEventListener('resize', size);
  let burst = 0;
  window.snowBurst = () => { burst = 160; };
  (function frame() {
    if (!document.hidden) {
      cx.clearRect(0, 0, cv.width, cv.height);
      cx.fillStyle = 'rgba(255,255,255,0.75)';
      const boost = burst > 0 ? 3 : 1; if (burst > 0) burst--;
      for (const f of flakes) {
        f.y += f.v * boost; f.w += 0.01; f.x += Math.sin(f.w) * 0.4;
        if (f.y > cv.height) { f.y = -4; f.x = Math.random() * cv.width; }
        cx.beginPath(); cx.arc(f.x, f.y, f.r * (boost > 1 ? 1.3 : 1), 0, 7); cx.fill();
      }
    }
    requestAnimationFrame(frame);
  })();
})();
let toastTimer;
function toast(msg) { const el = $('#toast'); el.textContent = msg; el.classList.add('show'); clearTimeout(toastTimer); toastTimer = setTimeout(() => el.classList.remove('show'), 2800); }

// ── The village: 24 lights, one per day ─────────────────────────────────────
// [x, y, kind] kind: w window, t tree light, s sky star, l lamp, top the star on the big tree
const LIGHTS = [
  [96, 196, 'w'], [392, 196, 't'], [118, 46, 's'], [204, 190, 'w'], [418, 178, 't'], [318, 206, 'w'],
  [664, 202, 'w'], [380, 158, 't'], [262, 30, 's'], [552, 186, 'w'], [412, 140, 't'], [128, 196, 'w'],
  [474, 176, 'l'], [234, 190, 'w'], [384, 120, 't'], [580, 186, 'w'], [560, 40, 's'], [296, 206, 'w'],
  [424, 214, 't'], [696, 202, 'w'], [404, 102, 't'], [752, 26, 's'], [372, 212, 't'], [400, 64, 'top'],
];
const TREE_COLORS = ['#ff5d6c', '#ffd36b', '#4ce0b3', '#6fb1ff'];
function star(x, y, r) { let p = ''; for (let i = 0; i < 10; i++) { const a = Math.PI / 5 * i - Math.PI / 2, rr = i % 2 ? r * 0.42 : r; p += `${i ? 'L' : 'M'}${(x + Math.cos(a) * rr).toFixed(1)} ${(y + Math.sin(a) * rr).toFixed(1)}`; } return p + 'Z'; }
function house(x, w, h, roof, body) {
  const base = 240;
  return `<rect x="${x}" y="${base - h}" width="${w}" height="${h}" fill="${body}"/><path d="M${x - 8} ${base - h} L${x + w / 2} ${base - h - roof} L${x + w + 8} ${base - h}Z" fill="#e9edf5"/><path d="M${x - 8} ${base - h} L${x + w / 2} ${base - h - roof} L${x + w + 8} ${base - h}" fill="none" stroke="#c8cfdf" stroke-width="2"/>`;
}
function villageSvg(fresh) {
  const done = yr().done;
  let lights = '';
  LIGHTS.forEach(([x, y, k], i) => {
    const d = i + 1, on = !!done[d], cls = `light ${on ? 'lit' : ''} ${fresh === d ? 'pop' : ''}`;
    if (k === 'w') lights += `<rect class="${cls}" x="${x - 8}" y="${y - 8}" width="16" height="16" rx="2" fill="${on ? '#ffd36b' : '#1b2246'}" stroke="#3b4370" stroke-width="2"/>`;
    else if (k === 't') lights += `<circle class="${cls}" cx="${x}" cy="${y}" r="${on ? 5.5 : 4}" fill="${on ? TREE_COLORS[i % 4] : '#1f3a36'}"/>`;
    else if (k === 's') lights += `<path class="${cls} ${on ? 'twinkle' : ''}" d="${star(x, y, on ? 11 : 6)}" fill="${on ? '#fff3c4' : '#2b3366'}"/>`;
    else if (k === 'l') lights += `<rect x="${x - 2}" y="${y}" width="4" height="${240 - y}" fill="#2b2f45"/><circle class="${cls}" cx="${x}" cy="${y - 4}" r="${on ? 9 : 7}" fill="${on ? '#ffe9a8' : '#232a4d'}" stroke="#2b2f45" stroke-width="3"/>`;
    else lights += `<path class="${cls}" d="${star(x, y, on ? 22 : 15)}" fill="${on ? '#ffd36b' : '#2e3560'}" stroke="${on ? '#fff3c4' : '#3b4370'}" stroke-width="2"/>`;
  });
  const decoStars = [[40, 70], [180, 80], [330, 55], [470, 30], [620, 75], [700, 110], [520, 95], [90, 120], [240, 110]].map(([x, y]) => `<circle cx="${x}" cy="${y}" r="1.4" fill="#cfd6ff" opacity="0.7"/>`).join('');
  const pine = (x, s, c = '#163d36') => `<path d="M${x} ${240 - 70 * s} L${x - 22 * s} ${240 - 30 * s} L${x - 10 * s} ${240 - 30 * s} L${x - 28 * s} 240 L${x + 28 * s} 240 L${x + 10 * s} ${240 - 30 * s} L${x + 22 * s} ${240 - 30 * s}Z" fill="${c}"/>`;
  return `<svg viewBox="0 0 800 280" role="img" aria-label="A winter village with ${doneCount()} of 24 lights lit">
    <defs>
      <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#070b22"/><stop offset="1" stop-color="#1b2556"/></linearGradient>
      <filter id="glow" x="-200%" y="-200%" width="500%" height="500%"><feGaussianBlur stdDeviation="4" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
    </defs>
    <rect width="800" height="280" fill="url(#sky)"/>${decoStars}
    <circle cx="680" cy="70" r="26" fill="#f4f1e4"/><circle cx="691" cy="63" r="24" fill="#111739"/>
    <path d="M0 220 Q160 190 320 214 T640 206 T800 214 V280 H0Z" fill="#cfd7ea"/>
    ${pine(30, 0.9)}${pine(170, 0.7)}${pine(470, 0.75, '#12352f')}${pine(620, 0.8)}${pine(770, 1)}
    ${house(70, 84, 64, 40, '#7a2a33')}${house(184, 70, 58, 34, '#2b4a7a')}${house(282, 52, 48, 28, '#5a4636')}
    <rect x="530" y="168" width="70" height="72" fill="#4a3a5a"/><path d="M522 168 L565 120 L608 168Z" fill="#e9edf5"/><rect x="556" y="96" width="18" height="30" fill="#4a3a5a"/><path d="M552 98 L565 80 L578 98Z" fill="#e9edf5"/>
    ${house(640, 74, 60, 36, '#2a5a4f')}
    <path d="M400 70 L344 230 L456 230Z" fill="#1e5a45"/><path d="M400 70 L356 170 L444 170Z" fill="#23694f"/><rect x="392" y="230" width="16" height="14" fill="#5a3a20"/>
    <path d="M0 246 Q200 236 400 248 T800 244 V280 H0Z" fill="#eef2fa"/>
    ${lights}
  </svg>`;
}

// ── Home ────────────────────────────────────────────────────────────────────
function statusHtml() {
  const n = doneCount();
  const m = NOW.getMonth(), d = NOW.getDate();
  if (NOW < new Date(YEAR, 11, 1)) {
    const k = daysUntil(1);
    return `<h2>Door 1 opens in ${k} ${k === 1 ? 'day' : 'days'}</h2><p>Waiting is part of it. Try the warm-up door while you wait.</p>`;
  }
  if (n === 24) return '<h2>All 24 lights are lit! 🌟</h2><p>Merry Christmas. Your Kindness Book has the whole month in it.</p>';
  if (m === 11 && d <= 24) {
    const td = yr().done[d], late = Array.from({ length: d - 1 }, (_, i) => i + 1).filter(x => !yr().done[x]).length;
    return `<h2>${td ? `Door ${d} is done. ✨` : `Today is door ${d}!`}</h2><p>${td ? 'See you tomorrow.' : 'Open it, do the kindness, and light up the village.'}${late ? ` ${late} earlier ${late === 1 ? 'door is' : 'doors are'} still waiting. It\'s never too late to be kind.` : ''}</p>`;
  }
  return `<h2>Merry Christmas!</h2><p>You lit ${n} of 24 lights. Unfinished doors stay open until New Year's.</p>`;
}
function render(fresh) {
  const n = doneCount(), y = yr();
  $('#app').innerHTML = `
    <div class="top no-print"><div class="title"><img src="icon.svg" alt=""><div><h1>Kindness Advent</h1><p>24 small kindnesses before Christmas</p></div></div>
      <div class="tools"><button class="icon-btn" id="snd" title="Sound">${state.sound ? '🔔' : '🔕'}</button><button class="icon-btn" id="set" title="Settings">⚙️</button></div></div>
    <div class="village">${villageSvg(fresh)}</div>
    <div class="village-cap"><span class="count"><b>${n}</b> of 24 lights</span></div>
    <div class="status">${statusHtml()}</div>
    ${NOW < new Date(YEAR, 11, 1) ? `<button class="warmup" id="warm"><span class="em">${WARMUP.emoji}</span><span><b>Warm-up door ${y.done[0] ? '✓' : ''}</b><span class="muted small">Try one now, before December starts.</span></span></button>` : ''}
    <div class="doors">${ORDER.map(d => {
      const can = isOpenable(d), done = !!y.done[d], opened = !!y.opened[d] || done;
      const cls = !can ? 'locked' : done ? 'open done' : opened ? 'open' : 'ready';
      return `<button class="door ${cls} ${isToday(d) ? 'today' : ''}" data-d="${d}" aria-label="Door ${d}${!can ? ', locked' : done ? ', done' : ''}">${opened ? `<span class="em">${dayData(d).emoji}</span>` : ''}<span class="n">${d}</span>${!can ? '<span class="lk">🔒</span>' : ''}${done ? '<span class="ck">✓</span>' : ''}</button>`;
    }).join('')}</div>
    ${n || y.done[0] ? '<div class="book-link"><button class="btn gold" id="book">📖 Our Kindness Book</button></div>' : ''}
    <footer>A new door opens each morning in December. Saved on this device only.</footer>`;
  $$('[data-d]').forEach(b => b.onclick = () => openDoor(+b.dataset.d));
  $('#warm') && ($('#warm').onclick = () => openDoor(0));
  $('#book') && ($('#book').onclick = renderBook);
  $('#snd').onclick = () => { state.sound = !state.sound; save(); render(); bells([1568]); };
  $('#set').onclick = settings;
}

// ── A door ──────────────────────────────────────────────────────────────────
function openDoor(d) {
  if (!isOpenable(d)) {
    const k = daysUntil(d);
    toast(`Door ${d} opens in ${k} ${k === 1 ? 'day' : 'days'}. Patience! 🎄`);
    return;
  }
  const y = yr(), data = dayData(d), done = y.done[d];
  if (!y.opened[d]) { y.opened[d] = Date.now(); save(); creak(); }
  const dateText = d === 0 ? 'Warm-up' : new Date(YEAR, 11, d).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
  let who = done ? done.who.slice() : [];
  openModal(`
    <div class="door-head"><div class="em">${data.emoji}</div><div><div class="date">${d ? `Door ${d} · ` : ''}${dateText}</div><h2>${d ? 'Today\'s kindness' : 'Try a kindness'}</h2><span class="tag">${TAGS[data.tag].emoji} ${TAGS[data.tag].label}</span></div></div>
    <div class="block kind"><h3>The kindness</h3><p>${esc(data.kind)}</p></div>
    <div class="block fun"><h3>Family fun</h3><p>${esc(data.fun)}</p></div>
    <div class="block fact"><h3>Did you know?</h3><p>${esc(data.fact)}</p></div>
    ${done ? `<div class="done-note">✓ <b>Done</b> ${new Date(done.at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}${done.who.length ? ` by ${done.who.map(esc).join(', ')}` : ''}${done.note ? `<br><i>"${esc(done.note)}"</i>` : ''}</div>`
      : `<label class="field"><span>What happened? (goes in your Kindness Book)</span><textarea id="note" rows="2" maxlength="300" placeholder="We shoveled Mrs. Olson's walk and she gave us hot cocoa."></textarea></label>
      ${state.names.length ? `<div class="field"><span>Who helped?</span><div class="chips" id="who">${state.names.map(n => `<button type="button" class="chip" data-n="${esc(n)}">${esc(n)}</button>`).join('')}</div></div>` : ''}`}
    <div class="modal-foot">${done ? '<button class="link-btn" id="undo" style="margin-right:auto">Mark as not done</button>' : ''}<button class="btn ghost" data-close>${done ? 'Close' : 'Later'}</button>${done ? '' : '<button class="btn big" id="did">We did it! ✨</button>'}</div>`, m => {
    $$('#who .chip', m).forEach(c => c.onclick = () => { const n = c.dataset.n; who = who.includes(n) ? who.filter(x => x !== n) : [...who, n]; c.classList.toggle('on'); });
    $('#did', m) && ($('#did', m).onclick = () => {
      y.done[d] = { at: Date.now(), note: $('#note', m).value.trim(), who };
      save(); closeModal(); bells(); window.snowBurst && window.snowBurst();
      const n = doneCount();
      render(d || undefined);
      toast(d === 0 ? 'Warm-up done! See you on December 1.' : n === 24 ? '🌟 The star is lit! Merry Christmas!' : `✨ Light ${n} of 24 is on!`);
      if (d) setTimeout(() => $('.village').scrollIntoView({ behavior: 'smooth', block: 'center' }), 50);
    });
    $('#undo', m) && ($('#undo', m).onclick = () => { delete y.done[d]; save(); closeModal(); render(); });
  });
}

// ── Kindness Book ───────────────────────────────────────────────────────────
function renderBook() {
  const y = yr(), list = [0, ...Array.from({ length: 24 }, (_, i) => i + 1)].filter(d => y.done[d]);
  $('#app').innerHTML = `<div class="book">
    <div class="no-print"><button class="link-btn" id="back">← Back to the calendar</button></div>
    <div class="book-h"><div style="font-size:48px">📖</div><h1>Our Kindness Book</h1><p class="muted">${YEAR} · ${doneCount()} of 24 kindnesses</p></div>
    ${list.map(d => { const x = dayData(d), e = y.done[d]; return `<div class="page"><div class="em">${x.emoji}</div><div>
      <div class="d">${d ? `December ${d}` : 'Warm-up'}</div><div class="k">${esc(x.kind)}</div>
      ${e.note ? `<div class="note">"${esc(e.note)}"</div>` : ''}${e.who.length ? `<div class="who">— ${e.who.map(esc).join(', ')}</div>` : ''}</div></div>`; }).join('')}
    <div class="no-print" style="text-align:center;margin-top:18px"><button class="btn ghost" id="print">🖨️ Print or save as PDF</button></div></div>`;
  $('#back').onclick = () => { render(); scrollTo({ top: 0 }); };
  $('#print').onclick = () => print();
  scrollTo({ top: 0 });
}

// ── Settings & modal ────────────────────────────────────────────────────────
function settings() {
  openModal(`<h2>Settings</h2>
    <label class="field"><span>Family names (so you can tick who helped)</span><input id="names" value="${esc(state.names.join(', '))}" placeholder="Mom, Dad, Maya, Ben"></label>
    <p class="sub" style="margin-top:8px">Separate names with commas. Leave it empty to skip.</p>
    <div class="modal-foot"><button class="link-btn" id="reset" style="margin-right:auto;color:#ff8a93">Start ${YEAR} over</button><button class="btn ghost" data-close>Cancel</button><button class="btn" id="ok">Save</button></div>`, m => {
    $('#ok', m).onclick = () => { state.names = $('#names', m).value.split(',').map(s => s.trim()).filter(Boolean).slice(0, 12); save(); closeModal(); toast('Saved'); render(); };
    $('#reset', m).onclick = () => openModal(`<h2>Start ${YEAR} over?</h2><p class="sub">This turns off every light and erases this year's Kindness Book on this device. It can't be undone.</p>
      <div class="modal-foot"><button class="btn ghost" data-close>Cancel</button><button class="btn" id="yes">Erase ${YEAR}</button></div>`, m2 => {
      $('#yes', m2).onclick = () => { delete state.years[YEAR]; save(); closeModal(); render(); };
    });
  });
}
function openModal(html, onMount) {
  $('#modal-root').innerHTML = `<div class="modal-back"><div class="modal" role="dialog" aria-modal="true">${html}</div></div>`;
  const back = $('.modal-back');
  back.addEventListener('mousedown', e => { if (e.target === back) closeModal(); });
  $$('[data-close]').forEach(b => b.onclick = closeModal);
  onMount && onMount($('.modal'));
}
const closeModal = () => { $('#modal-root').innerHTML = ''; };
document.addEventListener('keydown', e => { if (e.key === 'Escape') closeModal(); });

render();
// A new door may open at midnight while the app is open.
let lastDay = new Date().getDate();
setInterval(() => { if (new Date().getDate() !== lastDay) location.reload(); }, 60e3);
if ('serviceWorker' in navigator && location.protocol !== 'file:') navigator.serviceWorker.register('sw.js').catch(() => {});

'use strict';
// ═══════════════════════════════════════════════════════════════════════════
// TypeUp — app logic
// Keyboard, lessons and the word bank live in lessons.js; passages in passages.js.
// ═══════════════════════════════════════════════════════════════════════════

// ── Utils ──────────────────────────────────────────────────────────────────
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));
const pick = a => a[Math.floor(Math.random() * a.length)];
const shuffle = arr => { const a = [...arr]; for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
const fmtTime = ms => { const s = Math.round(ms / 1000); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };
const fmtAcc = a => (a >= 99.95 ? '100' : (Math.floor(a * 10) / 10).toFixed(1)) + '%';
const fmtDay = t => {
  const d = new Date(t), today = new Date();
  const days = Math.round((new Date(today.toDateString()) - new Date(d.toDateString())) / 864e5);
  return days === 0 ? 'Today' : days === 1 ? 'Yesterday' : d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
};
const keyLabel = ch => ch === ' ' ? 'space' : ch;
const mean = a => a.reduce((x, y) => x + y, 0) / (a.length || 1);
const svgEl = (tag, attrs = {}) => { const el = document.createElementNS('http://www.w3.org/2000/svg', tag); for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v); return el; };

// ── Constants ──────────────────────────────────────────────────────────────
const PASS_ACC = 95;        // accuracy needed to pass a lesson's check
const GHOST_STEP = 5;       // the ghost's pace is saved once every this many characters
const IDLE_CAP = 5000;      // a pause longer than this doesn't count against your speed
const AVATARS = ['🦊','🐼','🦁','🐸','🐯','🦉','🐨','🐙','🦖','🐶','🐱','🐢','🦅','🐻','🦬','🐺','⛳','🏈','🤖','🌱','🎯','🚀','⭐','🔥'];
const COLORS = ['#4cc9f0','#f4a261','#52b788','#b07cff','#ff7aa2','#ffd166','#5ee6a8','#8fa3ff'];
const TIPS = [
  'Keep your eyes on the screen, not your hands. It feels slow at first, then it gets fast.',
  'Accuracy first. Speed shows up on its own once your fingers know the way.',
  'After every reach, slide your finger back to its home key.',
  'Sit up, feet flat, wrists floating just above the keyboard. Relaxed hands are quick hands.',
  'Short and often beats long and rare. Ten minutes a day adds up fast.',
  'Feel for the bumps on F and J. They tell you where home is without looking.',
  'If you keep missing a key, slow down on that key only. The rest can stay at your pace.',
];

// ── Storage ────────────────────────────────────────────────────────────────
// Everything is one JSON object in IndexedDB (localStorage if that's missing).
const Store = {
  db: null, timer: null,
  open() {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open('typeup', 1);
      req.onupgradeneeded = () => req.result.createObjectStore('kv');
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  },
  async load() {
    try {
      this.db = await this.open();
      const v = await new Promise((resolve, reject) => {
        const req = this.db.transaction('kv').objectStore('kv').get('state');
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      });
      if (v) return JSON.parse(v);
    } catch { this.db = null; }
    try { return JSON.parse(localStorage.getItem('typeup_state')); } catch { return null; }
  },
  save(data) {
    if (!tabActive) return;   // another tab owns the data now
    this.data = data;
    clearTimeout(this.timer);
    this.timer = setTimeout(() => this.flush(), 250);
  },
  // Write now. Also runs when the window is hidden or closed, so a save
  // waiting on the short delay isn't lost.
  flush() {
    clearTimeout(this.timer); this.timer = null;
    if (!this.data) return;
    const json = JSON.stringify(this.data);
    this.data = null;
    if (this.db) {
      try { this.db.transaction('kv', 'readwrite').objectStore('kv').put(json, 'state'); return; } catch { /* fall through */ }
    }
    try { localStorage.setItem('typeup_state', json); } catch { /* storage full or blocked */ }
  },
};
addEventListener('pagehide', () => Store.flush());
document.addEventListener('visibilitychange', () => { if (document.hidden) Store.flush(); });

// ── One tab at a time ──────────────────────────────────────────────────────
// Two open tabs would overwrite each other's saves. The newest tab takes over;
// older ones save what they have, then stop and say so.
const TAB_ID = Math.random().toString(36).slice(2);
let tabActive = true;
const tabChannel = 'BroadcastChannel' in window ? new BroadcastChannel('typeup') : null;
tabChannel?.addEventListener('message', e => {
  if (e.data?.type !== 'claim' || e.data.id === TAB_ID || !tabActive) return;
  Store.flush();
  tabActive = false;
  const ov = document.createElement('div');
  ov.className = 'overlay guard';
  ov.innerHTML = `<div class="modal" role="dialog" aria-modal="true">
    <h2>TypeUp is open in another tab</h2>
    <p class="muted" style="margin:10px 0 18px;line-height:1.55">To keep progress safe, only one tab can save at a time. Your work here is saved. Keep going in the other tab, or switch back to this one.</p>
    <div class="btn-row"><button class="btn" id="use-here">Use this tab instead</button></div></div>`;
  document.body.appendChild(ov);
  modalOpen = true;   // pauses typing and games underneath
  $('#use-here', ov).onclick = () => location.reload();
});
const claimTab = () => tabChannel?.postMessage({ type: 'claim', id: TAB_ID });

let state = { profiles: [], current: null };
const save = () => Store.save(state);
const me = () => state.profiles.find(p => p.id === state.current);

const newId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
function newProfile(name, avatar) {
  return {
    id: 'p' + newId(),
    name, avatar,
    color: COLORS[state.profiles.length % COLORS.length],
    created: Date.now(),
    introDone: false,
    settings: { guide: 'full', errorMode: 'stop', goal: 10, sound: true, fade: true, ghost: true },
    games: {},      // id -> { best, plays }
    lessons: {},    // id -> { passed, bestAcc, bestWpm, attempts }
    passages: {},   // id -> { bestWpm, bestAcc, runs }
    keys: {},       // char -> { n: hits, m: misses, t: total ms, tn: timed hits }
    history: [],    // { t, kind, ref, step, wpm, acc, ms, chars }
    goalDays: [],   // dates (toDateString) the daily goal was met, kept as they happen
    xpBank: 0,      // XP from old runs trimmed out of history
    plan: null,     // today's practice: { day, steps: [{ type, ref, label, mins, done }], started }
    custom: [],     // the person's own practice texts: { id, title, text, added }
    mixups: {},     // "expected>typed" physical keys -> count, plus "x^" for Shift slips
    badges: {},     // badge id -> time earned
    badgesV: BADGES_VERSION,
    plansDone: 0,   // whole Today's practice sessions finished
    ghostWins: 0,   // passages where you beat your own best run
    msBank: 0,      // practice time from old runs trimmed out of history
  };
}

// Profiles saved by older versions (or read from a backup file) get any
// fields added since, and anything that ends up in the page is checked.
function normalizeProfile(p) {
  const fresh = newProfile(p.name, p.avatar);
  p.name = String(p.name || 'Typist').slice(0, 20);
  if (!AVATARS.includes(p.avatar)) p.avatar = AVATARS[0];
  if (!/^#[0-9a-f]{6}$/i.test(p.color)) p.color = COLORS[0];
  if (!/^[\w-]{1,40}$/.test(p.id)) p.id = fresh.id;
  for (const k of ['games', 'lessons', 'passages', 'keys', 'pairs', 'history']) p[k] ||= fresh[k] || {};
  p.settings = { ...fresh.settings, ...p.settings };
  if (!GOALS.includes(p.settings.goal)) p.settings.goal = 10;
  const num = v => Number.isFinite(v);
  p.history = p.history.filter(h => h && num(h.t) && num(h.wpm) && num(h.acc) && num(h.ms) && num(h.chars) && typeof h.kind === 'string');
  for (const [id, g] of Object.entries(p.games)) if (!num(g?.best) || !num(g?.plays)) delete p.games[id];
  for (const [id, r] of Object.entries(p.passages)) {
    if (!r || typeof r !== 'object' || !num(r.bestWpm)) { delete p.passages[id]; continue; }
    if (r.ghost && !(Array.isArray(r.ghost) && r.ghost.every(num) && num(r.ghostLen) && num(r.ghostMs))) delete r.ghost;
  }
  p.xpBank = num(p.xpBank) ? p.xpBank : 0;
  p.custom = (Array.isArray(p.custom) ? p.custom : [])
    .filter(c => c && typeof c.title === 'string' && typeof c.text === 'string')
    .map(c => ({ id: /^[\w-]{1,40}$/.test(c.id) ? c.id : newId(), title: c.title.slice(0, 60), text: cleanText(c.text).text.slice(0, MY_MAX), added: num(c.added) ? c.added : Date.now() }))
    .filter(c => c.text).slice(0, MY_LIMIT);
  for (const k of ['plansDone', 'ghostWins', 'msBank']) if (!num(p[k])) p[k] = 0;
  p.goalDays = Array.isArray(p.goalDays) ? p.goalDays.filter(d => typeof d === 'string')
    : [...dayTotals(p).entries()].filter(([, ms]) => ms >= goalMs(p)).map(([d]) => d);
  if (!p.mixups || typeof p.mixups !== 'object') p.mixups = {};
  for (const [k, v] of Object.entries(p.mixups)) if (!num(v)) delete p.mixups[k];
  // Badges added since this profile last looked are granted quietly if
  // already earned, so an update doesn't bring a flood of announcements.
  if (!p.badges || typeof p.badges !== 'object') p.badges = {};
  for (const id of Object.keys(p.badges)) if (!num(p.badges[id])) delete p.badges[id];
  if (p.badgesV !== BADGES_VERSION) { newBadges(p); p.badgesV = BADGES_VERSION; }
  if (!(p.plan && typeof p.plan.day === 'string' && Array.isArray(p.plan.steps) && p.plan.steps.every(s => s && PLAN_TYPES.includes(s.type)))) p.plan = null;
  return p;
}

// ── Lesson helpers ─────────────────────────────────────────────────────────
const lessonById = id => LESSONS.find(l => l.id === id);
const cumChars = upTo => {
  const s = new Set([' ']);
  LESSONS.filter(l => l.id <= upTo).forEach(l => [...l.keys].forEach(c => s.add(c)));
  return s;
};
function learnedSet(p) {
  const s = new Set([' ']);
  LESSONS.filter(l => p.lessons[l.id]?.passed).forEach(l => [...l.keys].forEach(c => s.add(c)));
  return s;
}
const nextLesson = p => LESSONS.find(l => !p.lessons[l.id]?.passed);

// The lesson after which a passage can be typed with only learned keys.
const passageNeeds = {};
PASSAGES.forEach(ps => {
  const chars = new Set(ps.text);
  passageNeeds[ps.id] = (LESSONS.find(l => [...chars].every(c => cumChars(l.id).has(c))) || LESSONS.at(-1)).id;
});
const missingKeys = (ps, learned) => [...new Set(ps.text)].filter(c => !learned.has(c));

// ── Your own texts ─────────────────────────────────────────────────────────
// Anyone can paste in their own practice text. It's tidied into plain
// keyboard characters (curly quotes, long dashes and accents become their
// plain versions) and then works like any other passage.
const MY_MAX = 3000, MY_LIMIT = 50;
const MY_TOPIC = { label: 'My texts', color: '#ffd166', icon: '✍️' };
const topicOf = ps => TOPICS[ps.topic] || MY_TOPIC;
function cleanText(raw) {
  const t = String(raw).normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[‘’‚′´]/g, "'").replace(/[“”„″]/g, '"')
    .replace(/[‐-―−]/g, '-').replace(/…/g, '...')
    .replace(/[\s ]+/g, ' ');
  const ok = c => c >= ' ' && c <= '~';   // printable characters on a US keyboard
  return { text: [...t].filter(ok).join('').replace(/ +/g, ' ').trim(), dropped: [...new Set([...t].filter(c => !ok(c)))] };
}
const myPassages = p => (p.custom || []).map(c => ({ id: 'my-' + c.id, topic: 'mine', title: c.title, text: c.text }));
// The lesson that teaches every key a text needs, or null if it uses symbols no lesson covers.
const needsLesson = text => LESSONS.find(l => [...new Set(text)].every(c => cumChars(l.id).has(c)))?.id ?? null;
const needOf = ps => passageNeeds[ps.id] ?? needsLesson(ps.text);
const difficulty = ps => { const n = needOf(ps); return n == null || n > 12 ? 'hard' : n <= 10 ? 'easy' : 'medium'; };

function editMyText(existing) {
  const p = me();
  if (!existing && p.custom.length >= MY_LIMIT) {
    return openModal(`<h2>That's a lot of texts!</h2><p class="muted" style="margin:10px 0 18px">You can keep up to ${MY_LIMIT}. Remove one to add another.</p>`, [{ label: 'OK' }]);
  }
  openModal(`<h2>${existing ? 'Edit your text' : 'Add your own text'}</h2>
    <p class="muted small" style="margin:6px 0 4px;line-height:1.5">Paste or type anything you'd like to practice: a verse, a recipe, spelling words, an email. Up to ${MY_MAX.toLocaleString()} characters.</p>
    <div class="add-form" style="max-width:none">
      <label for="m-title">Title</label>
      <input type="text" id="m-title" maxlength="60" autocomplete="off" value="${esc(existing?.title || '')}" placeholder="Psalm 23">
      <label for="m-text">Text</label>
      <textarea id="m-text" rows="8" maxlength="${MY_MAX * 2}">${esc(existing?.text || '')}</textarea>
      <p class="muted small" id="m-note" style="margin-top:6px;min-height:1.2em"></p>
    </div>
    <div class="btn-row" style="justify-content:space-between;margin-top:14px">
      <div class="btn-row"><button class="btn" id="m-save">Save</button><button class="btn ghost" id="m-cancel">Cancel</button></div>
      ${existing ? '<button class="btn danger" id="m-delete">Remove</button>' : ''}
    </div>`, [], ov => {
    const note = $('#m-note', ov), area = $('#m-text', ov);
    const check = () => {
      const { text, dropped } = cleanText(area.value);
      const need = text ? needsLesson(text) : 0;
      note.textContent = !text ? '' : [
        `${text.length.toLocaleString()} characters${text.length > MY_MAX ? ` (only the first ${MY_MAX.toLocaleString()} are kept)` : ''}.`,
        dropped.length ? `Left out: ${dropped.slice(0, 8).join(' ')} (not on a US keyboard).` : '',
        need == null ? 'Uses symbols the lessons don\'t teach, so you\'ll type it with "Try it anyway".' : need > 1 ? `Unlocks after lesson ${need}.` : '',
      ].filter(Boolean).join(' ');
    };
    area.addEventListener('input', check); check();
    $(existing ? '#m-text' : '#m-title', ov).focus();
    $('#m-cancel', ov).onclick = closeModal;
    $('#m-save', ov).onclick = () => {
      const text = cleanText(area.value).text.slice(0, MY_MAX);
      if (!text) { note.textContent = 'Type or paste some text first.'; return; }
      const title = $('#m-title', ov).value.trim().slice(0, 60) || text.split(' ').slice(0, 4).join(' ');
      if (existing) Object.assign(existing, { title, text });
      else p.custom.push({ id: newId(), title, text, added: Date.now() });
      save(); closeModal(); go('passages', 'mine');
    };
    $('#m-delete', ov) && ($('#m-delete', ov).onclick = () => openModal(`<h2>Remove "${esc(existing.title)}"?</h2>`,
      [{ label: 'Remove', style: 'danger', action: () => { p.custom = p.custom.filter(c => c !== existing); save(); go('passages', 'mine'); } },
       { label: 'Keep', style: 'ghost', action: () => editMyText(existing) }]));
  });
}

// ── Lesson text ────────────────────────────────────────────────────────────
function fillTo(target, gen) {
  const parts = [];
  let len = 0;
  while (len < target) {
    let w = gen();
    for (let tries = 0; parts.slice(-3).includes(w) && tries < 8; tries++) w = gen();
    parts.push(w); len += w.length + 1;
  }
  return parts.join(' ');
}
function pseudoWord(newKeys, letters) {
  const len = 2 + Math.floor(Math.random() * 3);
  const w = Array.from({ length: len }, () => pick(Math.random() < 0.45 ? newKeys : letters));
  if (!w.some(c => newKeys.includes(c))) w[Math.floor(Math.random() * len)] = pick(newKeys);
  return w.join('');
}
function wordGen(allowed, newKeys, newShare, letters) {
  const words = WORDS.filter(w => [...w].every(c => allowed.has(c)));
  const withNew = words.filter(w => [...w].some(c => newKeys.includes(c)));
  if (words.length < 6) return () => pseudoWord(newKeys, letters);
  return () => (withNew.length && Math.random() < newShare ? pick(withNew) : pick(words));
}
const cap = w => w[0].toUpperCase() + w.slice(1);

function lessonSteps(lesson) {
  const allowed = cumChars(lesson.id);
  const letters = [...allowed].filter(c => c >= 'a' && c <= 'z');

  if (lesson.kind === 'letters') {
    const newKeys = [...lesson.keys].filter(c => c !== ';' || lesson.id === 1);
    let drill;
    if (lesson.id === 1) {
      const pairs = [['f','j'], ['d','k'], ['s','l'], ['a',';']];
      drill = pairs.map(([a, b]) => [a.repeat(3), b.repeat(3), a.repeat(3), b.repeat(3)].join(' ')).join(' ')
        + ' fj dk sl a; jf kd ls ;a';
    } else {
      const groups = [];
      newKeys.forEach(k => { const h = HOME_KEY[FINGER_OF[k]]; groups.push(k.repeat(3), h + k + h, k.repeat(3), h + k + h); });
      if (newKeys.length > 1) groups.push(newKeys.join(''), [...newKeys].reverse().join(''), newKeys.join(''));
      drill = fillTo(60, (() => { let i = 0; return () => groups[i++ % groups.length]; })());
    }
    const mixLetters = letters.length ? letters : newKeys;
    const lettersOnly = newKeys.filter(c => c !== ';');
    return [
      { name: 'New keys', desc: 'Get a feel for the new reach', text: drill },
      { name: 'Mix it up', desc: 'Short groups using everything so far', text: fillTo(80, () => pseudoWord(lettersOnly, mixLetters)) },
      { name: 'Real words', desc: 'Words made only from keys you know', text: fillTo(100, wordGen(allowed, lettersOnly, 0.65, mixLetters)) },
      { name: 'Check', desc: `Pass with ${PASS_ACC}% accuracy`, text: fillTo(120, wordGen(allowed, lettersOnly, 0.45, mixLetters)), check: true },
    ];
  }

  if (lesson.kind === 'shift') {
    const words = WORDS.filter(w => w.length > 2);
    return [
      { name: 'Shift practice', desc: 'Capital, then lowercase', text: fillTo(60, () => { const l = pick(letters); return l.toUpperCase() + l + l; }) },
      { name: 'Capital words', desc: 'Shift with the other hand', text: fillTo(80, () => cap(pick(words))) },
      { name: 'Names', desc: 'People and places', text: fillTo(100, () => pick(NAMES)) },
      { name: 'Check', desc: `Pass with ${PASS_ACC}% accuracy`, text: fillTo(120, () => (Math.random() < 0.5 ? pick(NAMES) : cap(pick(words)) + ' ' + pick(words))), check: true },
    ];
  }

  const pool = POOLS[lesson.id];
  const sentences = n => { let bag = []; return fillTo(n, () => { if (!bag.length) bag = shuffle(pool); return bag.pop(); }); };
  return [
    { name: 'Warm-up', desc: 'Get a feel for the new keys', text: POOL_DRILLS[lesson.id] },
    { name: 'Sentences', desc: 'Short and steady', text: sentences(80) },
    { name: 'More sentences', desc: 'Keep your eyes on the screen', text: sentences(100) },
    { name: 'Check', desc: `Pass with ${PASS_ACC}% accuracy`, text: sentences(120), check: true },
  ];
}

// ── On-screen keyboard and hands ───────────────────────────────────────────
const fingerClass = f => 'ft-' + (f === 'th' ? 't' : f[1]);

function handsSVG() {
  // Left hand drawn once; the right hand is its mirror image.
  const hand = side => {
    const f = (id, x, y, w, h) => `<rect class="finger ${fingerClass(side + id)}" data-f="${side}${id}" x="${x}" y="${y}" width="${w}" height="${h}" rx="13"/>`;
    return `<rect class="palm" x="16" y="88" width="132" height="62" rx="28"/>
      ${f('p', 18, 46, 24, 64)}${f('r', 48, 22, 26, 86)}${f('m', 80, 10, 27, 96)}${f('i', 113, 26, 26, 82)}
      <rect class="finger ft-t" data-f="th" x="150" y="92" width="26" height="58" rx="13" transform="rotate(-38 163 121)"/>`;
  };
  return `<svg class="hands" viewBox="0 0 440 160" aria-hidden="true">
    <g transform="translate(14 0)">${hand('l')}</g>
    <g transform="translate(426 0) scale(-1 1)">${hand('r')}</g>
  </svg>`;
}

function buildGuide(container, { mode = 'full', lesson = null, mastered = new Set() } = {}) {
  const learned = lesson ? cumChars(lesson.id) : null;
  const newKeys = lesson ? new Set([...lesson.keys].map(c => keyFor(c).key)) : new Set();
  if (lesson?.kind === 'shift') newKeys.add('ShiftL').add('ShiftR');
  const learnedKeys = learned ? new Set([...learned].map(c => keyFor(c).key)) : null;
  if (learnedKeys && lesson.id >= 11) learnedKeys.add('ShiftL').add('ShiftR');

  container.innerHTML = `<div class="guide">
    <div class="kb ${mode === 'full' ? 'fingers' : ''}">${KB_ROWS.map(row => `<div class="kb-row">${row.map(([base, shift, w = 1, label]) => {
      const f = FINGER_OF[base];
      const special = base.length > 1;
      const text = label ?? (base >= 'a' && base <= 'z' ? base.toUpperCase() : base);
      const cls = ['key', f ? fingerClass(f) : '', special ? 'special' : '', base === 'f' || base === 'j' ? 'home' : '',
        learnedKeys && base !== ' ' && !learnedKeys.has(base) ? 'unlearned' : '', newKeys.has(base) ? 'new' : '',
        mastered.has(base) && !newKeys.has(base) ? 'mastered' : ''].join(' ');
      return `<div class="${cls}" data-k="${esc(base)}" style="--w:${w}">${shift && !(base >= 'a' && base <= 'z') ? `<span class="alt">${esc(shift)}</span>` : ''}${esc(text)}</div>`;
    }).join('')}</div>`).join('')}</div>
    ${mode === 'full' ? handsSVG() : ''}
  </div>`;
  if (mode === 'off') container.hidden = true;

  const keyEls = {};
  $$('.key', container).forEach(el => { keyEls[el.dataset.k] = el; });
  const fingers = $$('.finger', container);
  const flash = (el, cls, ms) => { if (!el) return; el.classList.add(cls); setTimeout(() => el.classList.remove(cls), ms); };

  return {
    keyEls,
    // Highlight the key (and Shift) for the next character; returns the finger hint.
    setNext(ch) {
      $$('.next, .next-shift', container).forEach(el => el.classList.remove('next', 'next-shift'));
      fingers.forEach(el => el.classList.remove('on', 'on-shift'));
      if (ch == null) return null;
      const { key, shift } = keyFor(ch);
      keyEls[key]?.classList.add('next');
      const f = FINGER_OF[key];
      fingers.filter(el => el.dataset.f === f).forEach(el => el.classList.add('on'));
      let sf = null;
      if (shift) {
        const sk = shiftFor(key);
        keyEls[sk]?.classList.add('next-shift');
        sf = FINGER_OF[sk];
        fingers.filter(el => el.dataset.f === sf).forEach(el => el.classList.add('on-shift'));
      }
      return { finger: f, shiftFinger: sf };
    },
    press(ch) { flash(keyEls[keyFor(ch).key], 'down', 90); },
    wrong(ch) { flash(keyEls[keyFor(ch).key], 'wrong', 220); },
  };
}

function fingerHint(h) {
  if (!h) return '';
  let s = `<span class="finger ${fingerClass(h.finger)}">${FINGER_NAMES[h.finger]}</span>`;
  if (h.shiftFinger) s += ` + <span class="finger ${fingerClass(h.shiftFinger)}">${h.shiftFinger[0] === 'l' ? 'Left' : 'Right'} Shift</span>`;
  return s;
}

// ── Typing session ─────────────────────────────────────────────────────────
// marks: 0 not typed, 1 right, 2 wrong, 3 right after a miss.
function createSession(text, errorMode) {
  const s = {
    text, errorMode, pos: 0, marks: new Array(text.length).fill(0), wrongAt: new Set(),
    keystrokes: 0, correct: 0, errors: 0, start: 0, last: 0, active: 0,
    missed: false, prevOk: false, misses: {}, lat: {}, pairs: {}, done: false,
    wrongs: {},                                 // expected + typed character -> count
    times: new Array(text.length).fill(0),      // active ms when each position was reached
  };
  // Letter pairs ("th", "ed") are tracked too: some reaches are only slow in combination.
  const pairAt = i => {
    const a = text[i - 1], b = text[i];
    return i > 0 && /[a-z]/i.test(a) && /[a-z]/i.test(b) ? (a + b).toLowerCase() : null;
  };
  const pairRec = pr => s.pairs[pr] || (s.pairs[pr] = [0, 0, 0, 0]);   // hits, misses, ms, timed
  const tick = now => {
    if (!s.start) { s.start = s.last = now; return; }
    s.active += Math.min(now - s.last, IDLE_CAP);
    s.last = now;
  };
  s.type = ch => {
    if (s.done) return null;
    const now = performance.now();
    const gap = s.start ? now - s.last : 0;
    tick(now);
    const expected = text[s.pos];
    const ok = ch === expected;
    const pr = pairAt(s.pos);
    s.keystrokes++;
    if (ok) {
      s.correct++;
      const timed = s.prevOk && s.pos > 0 && gap < IDLE_CAP;
      if (timed) {
        const l = s.lat[expected] || (s.lat[expected] = [0, 0]);
        l[0] += gap; l[1]++;
      }
      if (pr && !s.missed) { const r = pairRec(pr); r[0]++; if (timed) { r[2] += gap; r[3]++; } }
      s.marks[s.pos] = s.missed || s.wrongAt.has(s.pos) ? 3 : 1;
      s.times[s.pos] = s.active;
      s.pos++; s.missed = false;
    } else {
      s.errors++;
      s.misses[expected] = (s.misses[expected] || 0) + 1;
      if (pr && !s.missed) pairRec(pr)[1]++;
      // Which key went down instead. After a slip in "keep going" mode the
      // following keys are often just out of step, so only the first counts.
      if (errorMode === 'stop' || s.prevOk || s.pos === 0) s.wrongs[expected + ch] = (s.wrongs[expected + ch] || 0) + 1;
      if (errorMode === 'stop') s.missed = true;
      else { s.marks[s.pos] = 2; s.wrongAt.add(s.pos); s.times[s.pos] = s.active; s.pos++; }
    }
    s.prevOk = ok;
    if (s.pos >= text.length) s.done = true;
    return { ok, expected };
  };
  s.backspace = () => {
    if (s.done || errorMode === 'stop' || s.pos === 0) return false;
    s.pos--; s.marks[s.pos] = 0; s.prevOk = false;
    return true;
  };
  s.elapsed = () => s.start ? s.active + Math.min(performance.now() - s.last, IDLE_CAP) * (s.done ? 0 : 1) : 0;
  s.goodChars = () => s.marks.filter(m => m === 1 || m === 3).length;
  s.wpm = ms => { const t = ms ?? s.elapsed(); return t < 1500 ? 0 : (s.goodChars() / 5) / (t / 60000); };
  s.acc = () => s.keystrokes ? (s.correct / s.keystrokes) * 100 : 100;
  return s;
}

// Render a typing screen. opts: { title, sub, text, lesson, step, onDone(result) }
function startTyping(opts) {
  const p = me();
  const mode = p.settings.guide;
  const session = createSession(opts.text, p.settings.errorMode);
  const app = $('#app');
  app.innerHTML = `
    <div class="type-head">
      <button class="btn ghost" id="t-back">← Back</button>
      <div><div class="title">${esc(opts.title)}</div><div class="sub">${esc(opts.sub || '')}</div></div>
      <div class="live">
        ${opts.ghost ? '<div class="ghost-stat"><b id="t-ghost">±0</b><span>vs your best</span></div>' : ''}
        <div><b id="t-wpm">0</b><span>WPM</span></div>
        <div><b id="t-acc">100%</b><span>Accuracy</span></div>
        <div><b id="t-time">0:00</b><span>Time</span></div>
      </div>
    </div>
    <div class="progress"><div id="t-prog"></div></div>
    <div class="textbox idle" id="t-box"><div class="view"><div class="inner" id="t-inner"></div></div></div>
    <div class="type-hint" id="t-hint"></div>
    <div id="t-guide"></div>`;

  // Words stay together on a line; spaces are their own spans so lines break there.
  const inner = $('#t-inner');
  const spans = [];
  let word = null;
  [...opts.text].forEach(ch => {
    const sp = document.createElement('span');
    sp.className = 'ch' + (ch === ' ' ? ' sp' : '');
    sp.textContent = ch;
    spans.push(sp);
    if (ch === ' ') { word = null; inner.appendChild(sp); }
    else { if (!word) { word = document.createElement('span'); word.className = 'w'; inner.appendChild(word); } word.appendChild(sp); }
  });
  inner.style.position = 'relative';

  // Fading guide: known keys stay dark unless you miss one or pause on it.
  const mastered = mode === 'off' ? new Set() : masteredKeys(p);
  if (opts.lesson) [...opts.lesson.keys].forEach(c => mastered.delete(keyFor(c).key));
  const guide = buildGuide($('#t-guide'), { mode, lesson: opts.lesson, mastered });
  const hint = $('#t-hint');
  let capsOn = false, deadKey = false, stuck = false, stuckTimer = 0;
  const HESITATE = 1500;

  const paint = i => {
    const sp = spans[i];
    if (!sp) return;
    const m = session.marks[i];
    sp.className = 'ch' + (opts.text[i] === ' ' ? ' sp' : '') + (m === 1 ? ' ok' : m === 2 ? ' bad' : m === 3 ? ' fixed' : '')
      + (i === session.pos && !session.done ? ' cur' : '') + (i === session.pos && session.missed ? ' miss' : '')
      + (i === ghostAt ? ' ghost' : '');
  };
  const scroll = () => {
    const cur = spans[Math.min(session.pos, spans.length - 1)];
    const lh = parseFloat(getComputedStyle(inner).lineHeight);
    const line = Math.floor(cur.offsetTop / lh);
    inner.style.transform = `translateY(${-Math.max(0, line - 1) * lh}px)`;
  };
  const showHint = () => {
    const next = session.done ? null : opts.text[session.pos];
    const known = next != null && session.start && mastered.has(keyFor(next).key) && !session.missed && !stuck;
    const h = guide.setNext(known ? null : next);
    clearTimeout(stuckTimer);
    if (known) stuckTimer = setTimeout(() => { stuck = true; showHint(); }, HESITATE);
    const parts = [];
    if (capsOn) parts.push('<span class="caps-warn">Caps Lock is on</span>');
    // US-International and similar layouts hold quote keys back as "dead keys".
    if (deadKey) parts.push('<span class="caps-warn">Your keyboard layout is holding back the quote key. Switch Windows to the plain US keyboard layout for TypeUp.</span>');
    if (!session.start) parts.push('Start typing when you\'re ready. The timer starts on your first key. Esc starts over.');
    if (mode !== 'off' && h) parts.push(fingerHint(h));
    if (session.missed) parts.push(`Find <span class="keycap sm">${esc(keyLabel(opts.text[session.pos]))}</span>`);
    hint.innerHTML = parts.join(' · ');
  };
  // Ghost: your best run's pace, one mark every GHOST_STEP characters. A faint
  // cursor shows where that run was at this moment.
  let ghostAt = -1;
  const paintGhost = () => {
    if (!opts.ghost) return;
    const t = session.elapsed();
    let n = 0;
    while (n < opts.ghost.length && opts.ghost[n] <= t) n++;
    const pos = session.start ? Math.min(spans.length - 1, n * GHOST_STEP) : -1;
    if (pos !== ghostAt) { spans[ghostAt]?.classList.remove('ghost'); spans[pos]?.classList.add('ghost'); ghostAt = pos; }
    const d = session.start ? session.pos - Math.max(0, pos) : 0;
    const el = $('#t-ghost');
    el.textContent = d > 0 ? `+${d}` : d < 0 ? `−${-d}` : '±0';
    el.className = d > 0 ? 'ahead' : d < 0 ? 'behind' : '';
  };
  // Timed runs (the speed test) count wall-clock time and end when it runs out.
  const wall = () => session.start ? performance.now() - session.start : 0;
  const live = () => {
    paintGhost();
    $('#t-wpm').textContent = Math.round(opts.limitMs ? session.wpm(Math.max(wall(), 1)) : session.wpm());
    $('#t-acc').textContent = fmtAcc(session.acc());
    $('#t-time').textContent = opts.limitMs ? fmtTime(Math.ceil(Math.max(0, opts.limitMs - wall()) / 1000) * 1000) : fmtTime(session.elapsed());
    $('#t-prog').style.width = (opts.limitMs ? Math.min(1, wall() / opts.limitMs) : session.pos / opts.text.length) * 100 + '%';
  };
  paint(0); showHint();
  if (opts.limitMs) live();
  requestAnimationFrame(scroll);
  const timer = setInterval(() => {
    if (!session.start || session.done) return;
    if (opts.limitMs && wall() >= opts.limitMs && !modalOpen) {
      session.done = true;
      paint(session.pos); showHint(); finish();
      return;
    }
    live();
  }, 250);
  const onResize = () => scroll();
  window.addEventListener('resize', onResize);
  let reported = false, pending = null;
  setCleanup(() => {
    clearInterval(timer); clearTimeout(stuckTimer); window.removeEventListener('resize', onResize);
    if (pending) { clearTimeout(pending); pending = null; report(false); celebrateFrom = null; planMoved = false; }   // left during the pause: still save the run
  });

  let result;
  const report = show => { if (reported) return; reported = true; opts.onDone(result, show); };
  const finish = () => {
    live();
    const ms = opts.limitMs ? Math.min(opts.limitMs, wall()) : session.active;
    result = {
      wpm: session.wpm(ms), acc: session.acc(), ms, chars: opts.limitMs ? session.pos : opts.text.length,
      misses: session.misses, lat: session.lat, wrongs: session.wrongs, times: session.times,
    };
    recordKeys(p, session);
    if (opts.finishSound !== false) Sound.done();
    // A short pause so the last letter shows before the results appear.
    pending = setTimeout(() => { pending = null; report(true); }, 250);
  };

  $('#t-back').onclick = () => opts.onBack();
  if (document.activeElement) document.activeElement.blur();

  setKeyHandler(e => {
    if (e.ctrlKey || e.altKey || e.metaKey) return;
    if (e.getModifierState) capsOn = e.getModifierState('CapsLock');
    if (session.done) return;
    if (e.key === 'Escape') { e.preventDefault(); opts.onRestart(); return; }
    if (e.key === 'Dead') { deadKey = true; showHint(); return; }
    if (e.key === 'Backspace') {
      e.preventDefault();
      const before = session.pos;
      if (session.backspace()) { paint(before); paint(session.pos); scroll(); }
      showHint(); live();
      return;
    }
    if (e.key.length !== 1) { if (e.key === 'CapsLock') showHint(); return; }
    e.preventDefault();
    if (e.repeat) return;
    const before = session.pos;
    const r = session.type(e.key);
    if (!r) return;
    if (r.ok) stuck = false;
    $('#t-box').classList.remove('idle');
    if (r.ok) { guide.press(e.key); if (!session.done) Sound.click(); }
    else { guide.wrong(e.key); Sound.error(); }
    paint(before); paint(session.pos);
    if (session.pos !== before) scroll();
    showHint(); live();
    if (session.done) finish();
  });
}

function recordKeys(p, session) {
  const touch = ch => p.keys[ch] || (p.keys[ch] = { n: 0, m: 0, t: 0, tn: 0 });
  for (const [ch, n] of Object.entries(session.misses)) touch(ch).m += n;
  for (const [ch, [t, n]] of Object.entries(session.lat)) { const k = touch(ch); k.t += t; k.tn += n; }
  // Count hits from what was typed correctly
  [...session.text].forEach((ch, i) => { if (session.marks[i] === 1 || session.marks[i] === 3) touch(ch).n++; });
  for (const [pair, n] of Object.entries(session.wrongs)) {
    const id = mixupId(...pair);
    if (id) p.mixups[id] = (p.mixups[id] || 0) + n;
  }
  p.pairs ||= {};
  for (const [pr, [n, m, t, tn]] of Object.entries(session.pairs)) {
    const r = p.pairs[pr] || (p.pairs[pr] = { n: 0, m: 0, t: 0, tn: 0 });
    r.n += n; r.m += m; r.t += t; r.tn += tn;
  }
}

// ── Daily goal, streak and levels ──────────────────────────────────────────
const GOALS = [5, 10, 15, 20, 30];
const goalMs = p => (p.settings.goal || 10) * 60000;
function dayTotals(p) {
  const m = new Map();
  p.history.forEach(h => { const d = new Date(h.t).toDateString(); m.set(d, (m.get(d) || 0) + h.ms); });
  return m;
}
// Days count once their goal is met, and stay counted: changing the goal later
// doesn't rewrite the past. Today doesn't break the streak until it's over.
function goalDaySet(p) {
  const set = new Set(p.goalDays || []);
  const today = new Date().toDateString();
  if ((dayTotals(p).get(today) || 0) >= goalMs(p)) set.add(today);
  return set;
}
function streakInfo(p) {
  const set = goalDaySet(p), goal = goalMs(p);
  const today = new Date();
  const d = new Date();
  if (!set.has(d.toDateString())) d.setDate(d.getDate() - 1);
  let streak = 0;
  while (set.has(d.toDateString())) { streak++; d.setDate(d.getDate() - 1); }
  const days = [...set].map(k => new Date(k)).sort((a, b) => a - b);
  let best = 0, run = 0, prev = null;
  days.forEach(x => { run = prev && Math.round((x - prev) / 864e5) === 1 ? run + 1 : 1; best = Math.max(best, run); prev = x; });
  return { streak, best, todayMs: dayTotals(p).get(today.toDateString()) || 0, goal, metToday: set.has(today.toDateString()) };
}

// XP comes from what's already saved: clean typing, passed lessons and goal days.
const runXp = h => Math.round(h.chars / 10 * (h.acc / 100) ** 2);
function xpTotal(p) {
  return (p.xpBank || 0) + p.history.reduce((a, h) => a + runXp(h), 0) + lessonsPassed(p) * 50 + goalDaySet(p).size * 25;
}
// Level n starts at 60·n·(n−1) XP, so each level takes a little longer than the last.
const LEVEL_TITLES = ['Rookie', 'Practice squad', 'Starter', 'Team captain', 'Pro Bowler', 'All-Pro', 'MVP', 'Hall of Famer'];
function levelInfo(p) {
  const xp = xpTotal(p);
  let n = 1;
  while (60 * (n + 1) * n <= xp) n++;
  const base = 60 * n * (n - 1), next = 60 * (n + 1) * n;
  return { n, xp, into: xp - base, need: next - base, title: LEVEL_TITLES[Math.min(LEVEL_TITLES.length - 1, Math.floor((n - 1) / 3))] };
}

// ── Badges ─────────────────────────────────────────────────────────────────
// The list lives in badges.js. The time each was first earned is kept so it's
// announced once and stays earned even if old history is trimmed.
const bestSpeed = p => p.history.filter(h => h.kind === 'passage' || h.kind === 'test' || h.step === 'check').reduce((m, h) => Math.max(m, h.wpm), 0);
function newBadges(p) {
  const todo = BADGES.filter(b => !p.badges[b.id]);
  if (!todo.length) return [];
  const c = badgeContext(p);
  const got = todo.filter(b => { try { return b.test(c); } catch { return false; } });
  got.forEach(b => { p.badges[b.id] = Date.now(); });
  return got;
}

// Set just before a run is saved; the next results screen compares against it.
let celebrateFrom = null;
function celebrations(p) {
  const badges = newBadges(p);
  if (badges.length) save();
  let html = badges.slice(0, 3).map(b => `<div class="verdict badge">🏅 New badge: ${b.icon} <b>${esc(b.name)}</b> · ${esc(b.how)}</div>`).join('')
    + (badges.length > 3 ? `<div class="verdict badge">🏅 …and ${badges.length - 3} more. See them all under Progress → Badges.</div>` : '');
  if (!celebrateFrom) return html;
  const from = celebrateFrom;
  celebrateFrom = null;
  const lv = levelInfo(p), st = streakInfo(p);
  if (!from.met && st.metToday) html += `<div class="verdict goal">🎯 Daily goal reached! ${st.streak > 1 ? `That's a ${st.streak}-day streak 🔥` : 'Come back tomorrow to start a streak 🔥'}</div>`;
  if (lv.n > from.level) { html += `<div class="verdict level">⭐ Level ${lv.n}! Your title: ${esc(lv.title)}.</div>`; setTimeout(() => Sound.pass(), 500); }
  return html;
}

// ── Weak spots ─────────────────────────────────────────────────────────────
// Stats per physical key: capital F and f both count toward the F key.
function keyStats(p) {
  const out = {};
  for (const [ch, k] of Object.entries(p.keys)) {
    const key = keyFor(ch).key;
    const o = out[key] || (out[key] = { n: 0, m: 0, t: 0, tn: 0 });
    o.n += k.n; o.m += k.m; o.t += k.t; o.tn += k.tn;
  }
  return out;
}
const missRate = k => k.m / Math.max(1, k.n + k.m);
const avgMs = k => k.tn ? k.t / k.tn : 0;

// Keys you clearly know: plenty of presses, almost no misses, no long pauses.
// The guide stops lighting these up so you learn to trust your fingers.
function masteredKeys(p, evenIfOff = false) {
  if (p.settings.fade === false && !evenIfOff) return new Set();
  return new Set(Object.entries(keyStats(p))
    .filter(([k, s]) => k !== ' ' && s.n + s.m >= 40 && missRate(s) <= 0.03 && (s.tn < 10 || avgMs(s) <= 700))
    .map(([k]) => k));
}

// Rank keys and letter pairs by how far they sit from your own average:
// a score of 2 is average, so only clearly-worse spots make the list.
function rankWeak(entries, minSamples, limit) {
  const pool = entries.filter(([, k]) => k.n + k.m >= minSamples);
  if (pool.length < 4) return [];
  const baseRate = Math.max(0.01, mean(pool.map(([, k]) => missRate(k))));
  const timed = pool.filter(([, k]) => k.tn >= 4);
  const baseMs = mean(timed.map(([, k]) => avgMs(k))) || 1;
  return pool
    .map(([id, k]) => [id, missRate(k) / baseRate + (k.tn >= 4 ? avgMs(k) / baseMs : 1)])
    .filter(([, score]) => score > 2.3)
    .sort((a, b) => b[1] - a[1]).slice(0, limit).map(([id]) => id);
}
function weakSpots(p) {
  const learned = new Set([...learnedSet(p)].map(c => keyFor(c).key));
  const keys = rankWeak(Object.entries(keyStats(p)).filter(([k]) => k !== ' ' && learned.has(k)), 12, 4);
  const pairs = rankWeak(Object.entries(p.pairs || {}), 6, 3).filter(pr => !keys.includes(pr[0]) || !keys.includes(pr[1]));
  return { keys, pairs };
}

// A short drill built from your weak keys, using only keys you've learned.
function drillText(p) {
  const { keys, pairs } = weakSpots(p);
  if (!keys.length && !pairs.length) return null;
  const learned = learnedSet(p);
  const letters = keys.filter(k => k >= 'a' && k <= 'z');
  const others = keys.filter(k => !(k >= 'a' && k <= 'z'));
  const warm = [];
  letters.forEach(k => { const h = HOME_KEY[FINGER_OF[k]]; warm.push(k.repeat(3), h && h !== k ? h + k + h : k + k); });
  pairs.forEach(pr => warm.push(pr, pr, pr));
  const targets = [...letters, ...pairs];
  const words = WORDS.filter(w => [...w].every(c => learned.has(c)));
  const hits = words.filter(w => targets.some(t => w.includes(t)));
  const parts = warm.length ? [fillTo(45, (() => { let i = 0; return () => warm[i++ % warm.length]; })())] : [];
  if (hits.length) parts.push(fillTo(110, () => (Math.random() < 0.75 ? pick(hits) : pick(words))));
  // Punctuation and numbers are practiced in real sentences from the lessons.
  const sentences = Object.values(POOLS).flat().filter(s => others.some(k => [...s].some(c => keyFor(c).key === k)) && [...s].every(c => learned.has(c)));
  if (sentences.length) parts.push(fillTo(70, () => pick(sentences)));
  if (!parts.length) return null;
  return { text: parts.join(' '), keys, pairs };
}

// ── Mix-ups ────────────────────────────────────────────────────────────────
// Not just which key you missed, but which one you hit instead, and why that
// tends to happen. Ids are physical keys: "r>t" (hit T for R), or "t^" when
// the key was right but Shift wasn't.
const ROW_OF = {}, COL_OF = {};
KB_ROWS.forEach((row, r) => row.forEach(([base], c) => { ROW_OF[base] = r; COL_OF[base] = c; }));
const ROW_NAMES = ['on the number row', 'on the top row', 'on home row', 'on the bottom row', 'the space bar'];
const keyName = k => k === ' ' ? 'Space' : k.toUpperCase();

function mixupId(expected, typed) {
  const a = keyFor(expected), b = keyFor(typed);
  if (a.key === b.key) return a.shift !== b.shift ? a.key + '^' : null;
  return FINGER_OF[a.key] && FINGER_OF[b.key] ? `${a.key}>${b.key}` : null;
}
function mixupInfo(id) {
  if (id.endsWith('^') && id.length === 2) {
    const k = id[0];
    return { id, keys: [k], title: `Shift with ${keyName(k)}`,
      tip: `Right key, wrong case. Press Shift with the other hand first, hold it until ${keyName(k)} is down, then let go.` };
  }
  const [a, b] = [id[0], id.slice(2)];
  const fa = FINGER_OF[a], fb = FINGER_OF[b], A = keyName(a), B = keyName(b);
  const fname = f => FINGER_NAMES[f].toLowerCase();
  let tip;
  if (fa === fb && ROW_OF[a] === ROW_OF[b]) tip = `${A} and ${B} sit side by side under your ${fname(fa)}. Start each reach from ${keyName(HOME_KEY[fa] || a)} so the distance is always the same.`;
  else if (fa === fb) tip = `Same finger, wrong row: ${A} is ${ROW_NAMES[ROW_OF[a]]} and ${B} is ${ROW_NAMES[ROW_OF[b]]}. Come back home after every reach.`;
  else if (fa[0] === fb[0]) tip = `${A} belongs to your ${fname(fa)}, but your ${fname(fb)} is getting there first. Keep each finger in its own lane.`;
  else if (fa[1] === fb[1] && fa !== 'th') tip = `Mirror keys: ${A} and ${B} use the same finger on opposite hands. Your fingers know the move but swap the hand.`;
  else tip = `${A} is your ${fname(fa)}'s key; ${B} is your ${fname(fb)}'s. Slow down on ${A} until the reach feels automatic.`;
  return { id, keys: [a, b], title: `${B} instead of ${A}`, tip };
}
// The mix-ups worth coaching: they keep happening, not a one-off slip.
const topMixups = (p, limit = 3) => Object.entries(p.mixups || {})
  .filter(([, n]) => n >= 3).sort((a, b) => b[1] - a[1]).slice(0, limit).map(([id, n]) => ({ ...mixupInfo(id), n }));

function mixupDrillText(p, id) {
  const learned = learnedSet(p);
  const info = mixupInfo(id);
  const words = WORDS.filter(w => [...w].every(c => learned.has(c)));
  if (id.endsWith('^')) {
    const k = id[0];
    const withK = words.filter(w => w[0] === k && w.length > 2);
    const pool = withK.length >= 3 ? withK : words.filter(w => w.length > 2);
    return fillTo(150, () => (Math.random() < 0.6 ? cap(pick(pool)) : pick(words)));
  }
  const [a, b] = info.keys;
  const letter = c => c >= 'a' && c <= 'z';
  const warm = letter(a) && letter(b) ? [a.repeat(3), b.repeat(3), a + b, b + a, a + b + a, b + a + b] : [a.repeat(3), b.repeat(3), a + ' ' + b];
  const withA = words.filter(w => w.includes(a)), withB = words.filter(w => w.includes(b));
  const parts = [fillTo(40, (() => { let i = 0; return () => warm[i++ % warm.length]; })())];
  if (withA.length) parts.push(fillTo(110, () => (Math.random() < 0.65 || !withB.length ? pick(withA) : pick(withB))));
  else {
    const sentences = Object.values(POOLS).flat().filter(s => s.includes(a) && [...s].every(c => learned.has(c)));
    if (sentences.length) parts.push(fillTo(90, () => pick(sentences)));
  }
  return parts.join(' ');
}
function runMixupDrill(id, back = 'progress') {
  const p = me();
  const info = mixupInfo(id);
  startTyping({
    title: `Mix-up drill: ${info.title}`, sub: info.tip, text: mixupDrillText(p, id),
    onBack: () => go(back),
    onRestart: () => runMixupDrill(id, back),
    onDone: (result, show) => {
      recordRun(p, { kind: 'drill', ref: 'mixup', wpm: result.wpm, acc: result.acc, ms: result.ms, chars: result.chars });
      if (!show) return;
      showResults({
        title: 'Mix-up drill done', result, same: h => h.kind === 'drill' && h.ref === 'mixup',
        buttons: [{ label: 'Try again', action: () => runMixupDrill(id, back) }, { label: 'See my progress', action: () => go('progress') }],
      });
    },
  });
}

function recordRun(p, entry) {
  celebrateFrom = { level: levelInfo(p).n, met: streakInfo(p).metToday };
  p.history.push({ t: Date.now(), ...entry, wpm: +entry.wpm.toFixed(1), acc: +entry.acc.toFixed(1), ms: Math.round(entry.ms) });
  const today = new Date().toDateString();
  if (!p.goalDays.includes(today) && (dayTotals(p).get(today) || 0) >= goalMs(p)) p.goalDays.push(today);
  planAdvance(p, p.history.at(-1));
  // Keep history from growing forever, but bank the XP of what's trimmed.
  if (p.history.length > 3000) {
    const old = p.history.splice(0, p.history.length - 3000);
    p.xpBank += old.reduce((a, h) => a + runXp(h), 0);
    p.msBank = (p.msBank || 0) + old.reduce((a, h) => a + h.ms, 0);
  }
  save();
}

// ── Results ────────────────────────────────────────────────────────────────
// `same` picks the earlier runs this one is compared with (a lesson check
// against other checks, not against warm-up drills).
function showResults({ title, result, same, verdict = '', buttons }) {
  const p = me();
  const prior = p.history.filter(same).slice(-11, -1);
  const avg = prior.length >= 3 ? prior.reduce((a, h) => a + h.wpm, 0) / prior.length : null;
  const missed = Object.entries(result.misses).sort((a, b) => b[1] - a[1]).slice(0, 6);
  const slow = Object.entries(result.lat).filter(([, [, n]]) => n >= 2)
    .map(([ch, [t, n]]) => [ch, t / n]).sort((a, b) => b[1] - a[1]).slice(0, 4);
  const chip = ch => `<span class="keycap sm ${fingerClass(FINGER_OF[keyFor(ch).key] || 'th')}" style="--kc:var(--fc)">${esc(keyLabel(ch))}</span>`;
  const plan = planResult(buttons);
  const mix = {};
  for (const [pair, n] of Object.entries(result.wrongs || {})) { const id = mixupId(...pair); if (id) mix[id] = (mix[id] || 0) + n; }
  const mixes = Object.entries(mix).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([id, n]) => ({ ...mixupInfo(id), n }));
  let compare = '';
  if (avg != null) {
    const d = result.wpm - avg;
    compare = `<div class="compare">${Math.abs(d) < 0.5 ? 'Right on your average' : `<b class="${d > 0 ? 'up' : 'down'}">${d > 0 ? '+' : '−'}${Math.abs(d).toFixed(1)} WPM</b> vs your recent average`} of ${avg.toFixed(1)} WPM.</div>`;
  }
  openModal(`
    <h2>${esc(title)}</h2>
    <div class="big-stats">
      <div class="stat"><div class="v">${Math.round(result.wpm)}</div><div class="k">Words per minute</div></div>
      <div class="stat"><div class="v">${fmtAcc(result.acc)}</div><div class="k">Accuracy</div></div>
      <div class="stat"><div class="v">${fmtTime(result.ms)}</div><div class="k">Time</div></div>
    </div>
    ${plan.banner}
    ${verdict}
    ${celebrations(p)}
    ${missed.length ? `<div class="key-list"><span class="lbl">Missed most</span>${missed.map(([c, n]) => `${chip(c)}<span class="cnt">×${n}</span>`).join('')}</div>`
      : '<div class="key-list"><span class="lbl">Missed most</span><span class="muted small">Nothing. Clean run!</span></div>'}
    ${mixes.length ? `<div class="key-list"><span class="lbl">Mixed up</span>${mixes.map(m => `<span class="mix" title="${esc(m.tip)}">${esc(m.title)}</span><span class="cnt">×${m.n}</span>`).join('')}</div>` : ''}
    ${slow.length ? `<div class="key-list"><span class="lbl">Slowest keys</span>${slow.map(([c, ms]) => `${chip(c)}<span class="cnt">${(ms / 1000).toFixed(1)}s</span>`).join('')}</div>` : ''}
    ${compare}
  `, plan.buttons);
}

// ── Modal ──────────────────────────────────────────────────────────────────
let modalOpen = false;
function openModal(html, buttons = [], onMount) {
  closeModal();
  const ov = document.createElement('div');
  ov.className = 'overlay';
  // Draw the buttons unless the content already placed them.
  const row = buttons.length && !html.includes('data-i=')
    ? `<div class="btn-row">${buttons.map((b, i) => `<button class="btn ${b.style || (i ? 'ghost' : '')}" data-i="${i}">${esc(b.label)}</button>`).join('')}</div>` : '';
  ov.innerHTML = `<div class="modal" role="dialog" aria-modal="true">${html}${row}</div>`;
  document.body.appendChild(ov);
  modalOpen = true;
  $$('[data-i]', ov).forEach(btn => { btn.onclick = () => { const b = buttons[+btn.dataset.i]; closeModal(); b.action?.(); }; });
  // Enter picks the first safe button, so you never need the mouse between
  // runs; a destructive button is never the Enter default. Escape backs out.
  const safe = buttons.findIndex(b => b.style !== 'danger');
  ov._keys = e => {
    if (e.key === 'Enter' && safe >= 0 && !(e.target instanceof Element && e.target.matches('input, textarea, button'))) { e.preventDefault(); const b = buttons[safe]; closeModal(); b.action?.(); }
    if (e.key === 'Escape') { e.preventDefault(); const b = buttons.at(-1); closeModal(); b?.action?.(); }
  };
  document.addEventListener('keydown', ov._keys);
  onMount?.(ov);
  (safe >= 0 ? $$('[data-i]', ov)[safe] : $('button.btn', ov))?.focus();
}
function closeModal() {
  const ov = $('.overlay:not(.guard)');
  if (!ov) return;
  document.removeEventListener('keydown', ov._keys);
  ov.remove();
  modalOpen = !!$('.overlay');   // the other-tab notice stays up
}

// ── Router ─────────────────────────────────────────────────────────────────
let cleanup = null, keyHandler = null;
const setCleanup = fn => { cleanup = fn; };
const setKeyHandler = fn => { keyHandler = fn; };
document.addEventListener('keydown', e => {
  if (modalOpen || !keyHandler) return;
  // Enter on a focused button or field belongs to that control, not the screen.
  if (e.key === 'Enter' && e.target instanceof Element && e.target.matches('button, input, textarea, a, summary')) return;
  keyHandler(e);
});

function go(screen, ...args) {
  closeModal();
  if (cleanup) { cleanup(); cleanup = null; }
  keyHandler = null;
  const p = me();
  $('#topbar').hidden = !p || screen === 'profiles' || screen === 'addProfile';
  if (p) {
    const streak = streakInfo(p).streak;
    $('#btn-me').innerHTML = `<span class="av" style="--c:${p.color}">${p.avatar}</span>${esc(p.name)}${streak ? `<span class="streak" title="${streak}-day streak">🔥${streak}</span>` : ''}`;
    const tab = { home: 'home', lessons: 'lessons', lesson: 'lessons', intro: 'lessons', passages: 'passages', progress: 'progress', badges: 'progress', games: 'games', fairway: 'games', twominute: 'games' }[screen];
    $$('.tabs button').forEach(b => b.classList.toggle('on', b.dataset.go === tab));
    paintSoundBtn();
  }
  window.scrollTo(0, 0);
  SCREENS[screen](...args);
}

// ── Screens ────────────────────────────────────────────────────────────────
const SCREENS = {
  profiles() {
    $('#app').innerHTML = `<div class="profiles">
      <img class="logo" src="icon.svg" alt="">
      <h1>Who's typing?</h1>
      <p class="muted">Everyone gets their own lessons, scores and progress.</p>
      <div class="profile-list">
        ${state.profiles.map(p => `<button class="profile" data-id="${p.id}" style="--c:${p.color}">
          <span class="av">${p.avatar}</span><span class="name">${esc(p.name)}</span>
          <span class="muted small">${lessonsPassed(p)}/${LESSONS.length} lessons</span></button>`).join('')}
        <button class="profile add" id="add-person"><span class="av">＋</span><span class="name">Add person</span></button>
      </div>
      <button class="link-btn" id="restore">Restore from a backup file</button></div>`;
    $$('.profile[data-id]').forEach(b => b.onclick = () => { state.current = b.dataset.id; save(); go('home'); });
    $('#add-person').onclick = () => go('addProfile');
    $('#restore').onclick = restorePick;
  },

  addProfile() {
    let avatar = AVATARS[state.profiles.length % AVATARS.length];
    $('#app').innerHTML = `<div class="profiles"><h1>Add a person</h1>
      <form class="add-form card" id="add-form" style="margin-top:24px">
        <label for="pname">Name</label>
        <input type="text" id="pname" maxlength="20" autocomplete="off" required>
        <label>Pick a picture</label>
        <div class="emoji-grid">${AVATARS.map(a => `<button type="button" data-a="${a}" class="${a === avatar ? 'on' : ''}">${a}</button>`).join('')}</div>
        <div class="btn-row" style="margin-top:20px">
          <button class="btn" type="submit">Start typing</button>
          ${state.profiles.length ? '<button class="btn ghost" type="button" id="cancel">Cancel</button>' : ''}
        </div>
      </form>
      ${state.profiles.length ? '' : '<button class="link-btn" id="restore">Already use TypeUp on another computer? Restore from a backup file</button>'}</div>`;
    $('#restore') && ($('#restore').onclick = restorePick);
    $$('.emoji-grid button').forEach(b => b.onclick = () => {
      avatar = b.dataset.a;
      $$('.emoji-grid button').forEach(x => x.classList.toggle('on', x === b));
    });
    $('#cancel') && ($('#cancel').onclick = () => go('profiles'));
    $('#pname').focus();
    $('#add-form').onsubmit = e => {
      e.preventDefault();
      const name = $('#pname').value.trim();
      if (!name) return;
      const p = newProfile(name, avatar);
      state.profiles.push(p);
      state.current = p.id;
      save();
      go('intro');
    };
  },

  home() {
    const p = me();
    const nl = nextLesson(p);
    const runs = p.history;
    const last10 = runs.slice(-10);
    const best = runs.filter(h => h.kind === 'passage' || h.kind === 'test' || h.step === 'check').reduce((m, h) => Math.max(m, h.wpm), 0);
    const st = streakInfo(p), lv = levelInfo(p);
    const plan = freshPlan(p), planStep = planNext(plan);
    const minsLeft = plan.steps.filter(s => !s.done).reduce((a, s) => a + s.mins, 0);
    const planBtn = !plan.started ? 'Start today\'s practice →' : planStep ? 'Keep going →' : 'Practice more →';
    const spots = p.introDone ? weakSpots(p) : { keys: [], pairs: [] };

    let next;
    if (!p.introDone) next = { label: 'Start here', title: 'Find home row', text: 'Learn where your fingers live on the keyboard. It takes about a minute.', btn: 'Let\'s go', go: () => go('intro') };
    else if (nl) next = { label: `Lesson ${nl.id} of ${LESSONS.length}`, title: nl.title, text: nl.tip, keys: nl.kind === 'shift' ? ['Shift'] : [...nl.keys], btn: 'Start lesson', go: () => go('lesson', nl.id) };
    else next = { label: 'All lessons passed', title: 'Passage practice', text: 'You know every key. Now build speed and learn something while you type.', btn: 'Pick a passage', go: () => go('passages') };

    $('#app').innerHTML = `
      <h1>Hi, ${esc(p.name)}.</h1>
      <p class="muted" style="margin-top:6px">${runs.length ? 'Ready for a little practice?' : 'Welcome to TypeUp. Let\'s teach your fingers where to go.'}</p>
      <div class="card plan-card">
        <div class="plan-head">
          <div><div class="label">Today's practice</div>
            <h2>${planStep ? `${plan.started ? `${minsLeft} min to go` : `About ${minsLeft} minutes`}` : 'Done for today 🎉'}</h2>
            <p class="muted small">${planStep ? 'One button, start to finish: a warm-up, real practice and a game to close it out.' : 'Nice work. Come back tomorrow to keep your streak going, or do another round.'}</p></div>
          <button class="btn" id="go-plan">${planBtn}</button>
        </div>
        <ol class="plan-steps">${plan.steps.map((s, i) => `<li class="${s.done ? 'done' : s === planStep && plan.started ? 'now' : ''}">
          <span class="dot">${s.done ? '✓' : i + 1}</span><span class="t">${esc(s.label)}</span><span class="m">~${s.mins} min</span></li>`).join('')}</ol>
      </div>
      <div class="hero">
        <div class="card next-card">
          <div class="label">${esc(next.label)}</div>
          <h2>${esc(next.title)}</h2>
          <p>${esc(next.text)}</p>
          ${next.keys ? `<div class="keys">${next.keys.map(k => `<span class="keycap ${k.length === 1 ? fingerClass(FINGER_OF[keyFor(k).key]) : 'ft-p'}" style="--kc:var(--fc)">${esc(k.length === 1 ? k.toUpperCase() : k)}</span>`).join('')}</div>` : ''}
          <button class="btn" id="go-next">${esc(next.btn)} →</button>
        </div>
        <div class="stats">
          <div class="stat"><div class="v">${Math.floor(st.todayMs / 60000)}<small> / ${st.goal / 60000} min</small></div>
            <div class="bar ${st.metToday ? 'done' : ''}"><div style="width:${Math.min(100, st.todayMs / st.goal * 100)}%"></div></div>
            <div class="k">${st.metToday ? 'Daily goal reached 🎯' : 'Today\'s goal'}</div></div>
          <div class="stat"><div class="v">${st.streak ? '🔥 ' : ''}${st.streak}<small> day${st.streak === 1 ? '' : 's'}</small></div><div class="k">Streak${st.best > st.streak ? ` · best ${st.best}` : ''}</div></div>
          <div class="stat"><div class="v">${lv.n}<small> ${esc(lv.title)}</small></div>
            <div class="bar xp"><div style="width:${lv.into / lv.need * 100}%"></div></div>
            <div class="k">Level · ${lv.need - lv.into} XP to level ${lv.n + 1}</div></div>
          <div class="stat"><div class="v">${Math.round(best)}<small> WPM</small></div><div class="k">Best speed · ${last10.length ? fmtAcc(last10.reduce((a, h) => a + h.acc, 0) / last10.length) : '–'} accuracy lately</div></div>
        </div>
      </div>
      ${spots.keys.length || spots.pairs.length ? `<div class="section-title">Trouble keys</div>
        <div class="card weak-card"><div><p>These slow you down the most right now.</p><div class="keys">${weakChips(spots)}</div></div>
        <button class="btn warm" id="go-drill">Practice them →</button></div>` : ''}
      ${backupDue() ? `<div class="card weak-card backup-card" style="margin-top:16px"><div><p><b>💾 Back up your progress.</b> It's saved only in this browser${state.lastBackup ? `, and the last backup was ${esc(fmtDay(state.lastBackup).toLowerCase())}` : ''}.</p></div>
        <button class="btn ghost" id="go-backup">Save a backup file</button></div>` : ''}
      <div class="section-title">Tip</div>
      <div class="card tip-card"><span class="ic">💡</span><p>${esc(pick(TIPS))}</p></div>
      ${runs.length ? `<div class="section-title">Recent</div><div class="recent">${runs.slice(-6).reverse().map(h => `
        <div class="recent-row"><span class="t">${esc(runTitle(h))}</span>
        <span class="n">${Math.round(h.wpm)} WPM · ${fmtAcc(h.acc)}</span><span class="muted small">${fmtDay(h.t)}</span></div>`).join('')}</div>` : ''}`;
    $('#go-next').onclick = next.go;
    $('#go-plan').onclick = startPlan;
    $('#go-drill') && ($('#go-drill').onclick = () => runDrill('home'));
    $('#go-backup') && ($('#go-backup').onclick = () => { backupNow(); go('home'); });
    setKeyHandler(e => { if (e.key === 'Enter') { e.preventDefault(); startPlan(); } });
  },

  intro() {
    const p = me();
    const need = ['a','s','d','f','j','k','l',';',' '];
    const found = new Set();
    $('#app').innerHTML = `<div class="intro">
      <button class="back" id="i-back">← Back</button>
      <h1>Find home row</h1>
      <p>Touch typists never hunt for keys. Each finger owns a few keys and always comes back to one <b>home key</b>.</p>
      <p>Put your <b>left</b> fingers on <b>A S D F</b> and your <b>right</b> fingers on <b>J K L ;</b>. Your thumbs rest on the space bar. Feel the small bumps on <b>F</b> and <b>J</b>? That's how you find home without looking.</p>
      <p>Now, <b>without looking down</b>, press each home key once, then the space bar.</p>
      <div class="home-check">${need.map(k => `<span class="keycap ${fingerClass(FINGER_OF[k])}" data-k="${esc(k)}">${k === ' ' ? 'space' : k.toUpperCase()}</span>`).join('')}</div>
      <div id="i-guide"></div>
      <div id="i-done" hidden style="margin-top:20px">
        <p style="color:var(--good);font-weight:800;font-size:1.1rem">You found home row! Your fingers will come back here after every key.</p>
        <button class="btn" id="i-start" style="margin-top:8px">Start Lesson 1 →</button>
      </div></div>`;
    const guide = buildGuide($('#i-guide'), { mode: 'full' });
    $('#i-back').onclick = () => go('home');
    const done = () => {
      p.introDone = true;
      const step = todaysPlan(p)?.started && todaysPlan(p).steps.find(s => s.type === 'intro' && !s.done);
      if (step) step.done = true;
      save();
      $('#i-done').hidden = false;
      $('#i-start').onclick = () => go('lesson', 1);
    };
    setKeyHandler(e => {
      if (e.ctrlKey || e.altKey || e.metaKey) return;
      if (found.size === need.length && e.key === 'Enter') { e.preventDefault(); go('lesson', 1); return; }
      const k = e.key.toLowerCase();
      if (e.key.length === 1) e.preventDefault();
      if (!need.includes(k)) { if (e.key.length === 1) guide.wrong(e.key); return; }
      guide.press(k);
      if (found.has(k)) return;
      found.add(k);
      $(`.home-check [data-k="${CSS.escape(k)}"]`).classList.add('done');
      guide.keyEls[k]?.classList.add('found');
      if (found.size === need.length) done();
    });
  },

  lessons() {
    const p = me();
    const nl = nextLesson(p);
    $('#app').innerHTML = `
      <h1>Lessons</h1>
      <p class="muted" style="margin-top:6px">A few new keys at a time. Pass each check with ${PASS_ACC}% accuracy. Speed isn't graded yet.</p>
      <div class="section-title">Start here</div>
      <div class="grid"><button class="lesson-card" data-intro>
        <div class="top"><span class="num">WARM-UP</span>${p.introDone ? '<span class="pill ok">Done</span>' : '<span class="pill next">Up next</span>'}</div>
        <div class="title">Find home row</div>
        <div class="meta">Where your fingers rest, and the bumps on F and J</div>
      </button></div>
      <div class="section-title">The keys</div>
      <div class="grid">${LESSONS.map(l => {
        const r = p.lessons[l.id];
        const status = r?.passed ? `<span class="pill ok">Passed · ${fmtAcc(r.bestAcc)}</span>`
          : l === nl && p.introDone ? '<span class="pill next">Up next</span>' : '';
        const keys = l.kind === 'shift' ? '<span class="keycap sm ft-p" style="--kc:var(--fc)">Shift</span>'
          : [...l.keys].map(k => `<span class="keycap sm ${fingerClass(FINGER_OF[keyFor(k).key])}" style="--kc:var(--fc)">${esc(k.toUpperCase())}</span>`).join('');
        const later = !r?.passed && l !== nl;
        return `<button class="lesson-card ${later ? 'later' : ''}" data-l="${l.id}">
          <div class="top"><span class="num">LESSON ${l.id}</span>${status}</div>
          <div class="title">${esc(l.title)}</div>
          <div class="keys">${keys}</div>
          ${r?.bestWpm ? `<div class="meta">Best check: ${Math.round(r.bestWpm)} WPM</div>` : later ? '<div class="meta">You can try it anytime</div>' : ''}
        </button>`;
      }).join('')}</div>`;
    $('[data-intro]').onclick = () => go('intro');
    $$('[data-l]').forEach(b => b.onclick = () => go('lesson', +b.dataset.l));
  },

  lesson(id) {
    const p = me();
    const lesson = lessonById(id);
    const steps = lessonSteps(lesson);
    const r = p.lessons[id];
    const keys = lesson.kind === 'shift' ? ['Shift'] : [...lesson.keys];
    $('#app').innerHTML = `
      <button class="back" id="l-back">← All lessons</button>
      <div class="lesson-intro">
        <div>
          <div class="section-title" style="margin-top:0">Lesson ${id} of ${LESSONS.length}</div>
          <h1>${esc(lesson.title)}</h1>
          <div class="keys">${keys.map(k => `<span class="keycap ${k.length === 1 ? fingerClass(FINGER_OF[keyFor(k).key]) : 'ft-p'}" style="--kc:var(--fc)">${esc(k.length === 1 ? k.toUpperCase() : k)}</span>`).join('')}</div>
          <p class="tip">${esc(lesson.tip)}</p>
          <ol class="steps">${steps.map((s, i) => `<li><span class="dot">${i + 1}</span><span><b>${esc(s.name)}</b> · ${esc(s.desc)}</span></li>`).join('')}</ol>
          <div class="btn-row">
            <button class="btn" id="l-start">Start →</button>
            ${r?.passed ? '<button class="btn ghost" id="l-check">Skip to the check</button>' : ''}
          </div>
          ${r ? `<p class="muted small" style="margin-top:14px">${r.passed ? `Passed. Best check: ${fmtAcc(r.bestAcc)}, ${Math.round(r.bestWpm)} WPM.` : `Best check so far: ${fmtAcc(r.bestAcc)}.`}</p>` : ''}
        </div>
        <div id="l-guide"></div>
      </div>`;
    buildGuide($('#l-guide'), { mode: 'full', lesson });
    $('#l-back').onclick = () => go('lessons');
    $('#l-start').onclick = () => runLessonStep(lesson, steps, 0);
    $('#l-check') && ($('#l-check').onclick = () => runLessonStep(lesson, steps, steps.length - 1));
    setKeyHandler(e => { if (e.key === 'Enter') { e.preventDefault(); runLessonStep(lesson, steps, 0); } });
  },

  passages(topic = 'all') {
    const p = me();
    const learned = learnedSet(p);
    const mine = topic === 'mine';
    const source = mine ? myPassages(p) : PASSAGES.filter(ps => topic === 'all' || ps.topic === topic);
    const list = source.sort((a, b) => (needOf(a) ?? 99) - (needOf(b) ?? 99));
    const lockNote = ps => { const n = needOf(ps); return n == null ? 'Uses symbols the lessons don\'t teach' : `After lesson ${n}`; };
    $('#app').innerHTML = `
      <div class="page-head"><div><h1>Passages</h1>
        <p class="muted" style="margin-top:6px">Learn something while you type. Passages open up as you learn their keys.</p></div>
        <button class="btn ghost" id="speed-test">⏱ 1-minute speed test</button></div>
      <div class="chips">
        <button class="chip ${topic === 'all' ? 'on' : ''}" data-t="all">All</button>
        ${Object.entries(TOPICS).map(([k, t]) => `<button class="chip ${topic === k ? 'on' : ''}" data-t="${k}" style="--c:${t.color}">${t.icon} ${esc(t.label)}</button>`).join('')}
        <button class="chip ${mine ? 'on' : ''}" data-t="mine" style="--c:${MY_TOPIC.color}">${MY_TOPIC.icon} ${MY_TOPIC.label}${p.custom.length ? ` (${p.custom.length})` : ''}</button>
      </div>
      <div class="grid" style="margin-top:16px">
        ${mine ? `<button class="passage-card add-text" id="add-text" style="--c:${MY_TOPIC.color}">
          <span class="topic">＋ New</span><span class="title">Add your own text</span>
          <span class="preview">A verse, a recipe, spelling words, an email: anything you'd like to practice typing.</span></button>` : ''}
        ${list.map(ps => {
          const t = topicOf(ps);
          const open = missingKeys(ps, learned).length === 0;
          const best = p.passages[ps.id];
          const d = difficulty(ps);
          return `<div class="passage-wrap"><button class="passage-card ${open ? '' : 'locked'}" data-p="${ps.id}" style="--c:${t.color}">
            <span class="topic">${t.icon} ${esc(t.label)}</span>
            <span class="title">${esc(ps.title)}</span>
            <span class="preview">${esc(ps.text)}</span>
            <span class="meta"><span class="pill ${d}">${d[0].toUpperCase() + d.slice(1)}</span>${ps.text.split(' ').length} words
              ${best ? ` · Best ${Math.round(best.bestWpm)} WPM` : ''}${open ? '' : ` · 🔒 ${lockNote(ps)}`}</span>
          </button>${ps.topic === 'mine' ? `<button class="edit-btn" data-edit="${ps.id}">Edit</button>` : ''}</div>`;
        }).join('')}
      </div>
      ${mine && !list.length ? '<p class="muted" style="margin-top:14px">Your texts are saved for you only, and they\'re included in backups.</p>' : ''}`;
    $$('[data-t]').forEach(b => b.onclick = () => go('passages', b.dataset.t));
    $('#speed-test').onclick = () => runSpeedTest('passages');
    $('#add-text') && ($('#add-text').onclick = () => editMyText(null));
    $$('[data-edit]').forEach(b => b.onclick = () => editMyText(p.custom.find(c => 'my-' + c.id === b.dataset.edit)));
    $$('[data-p]').forEach(b => b.onclick = () => {
      const ps = list.find(x => x.id === b.dataset.p);
      const miss = missingKeys(ps, learned);
      if (!miss.length) return runPassage(ps, topic);
      const n = needOf(ps);
      openModal(`<h2>Not quite yet</h2>
        <p class="muted" style="margin:10px 0 14px;line-height:1.55">This ${mine ? 'text' : 'passage'} uses keys you haven't learned yet. ${n == null ? 'Some of them aren\'t in any lesson, so expect to hunt for those.' : `It opens after lesson ${n}.`}</p>
        <div class="key-list"><span class="lbl">New to you</span>${miss.slice(0, 14).map(c => `<span class="keycap sm">${esc(keyLabel(c))}</span>`).join('')}</div>`,
        [{ label: 'Try it anyway', action: () => runPassage(ps, topic) }, { label: 'Not now', style: 'ghost' }],
      );
    });
  },
};

const lessonsPassed = p => LESSONS.filter(l => p.lessons[l.id]?.passed).length;
function runTitle(h) {
  if (h.kind === 'passage') return (PASSAGES.find(ps => ps.id === h.ref) || myPassages(me()).find(ps => ps.id === h.ref))?.title || 'Passage';
  if (h.kind === 'drill') return 'Weak-key drill';
  if (h.kind === 'test') return '1-minute speed test';
  if (h.kind === 'game') return GAMES[h.ref]?.title || 'Game';
  const l = lessonById(h.ref);
  return l ? `Lesson ${l.id}: ${l.title}${h.step === 'check' ? ' · check' : ''}` : 'Lesson';
}

// ── Progress ───────────────────────────────────────────────────────────────
// Trends use passages, lesson checks and drills. The warm-up steps repeat
// letters ("fff jjj"), which would make speed look better than it is.
const countsForTrend = h => h.kind === 'passage' || h.kind === 'drill' || h.kind === 'test' || h.step === 'check';

function trendSeries(p) {
  const runs = p.history.filter(countsForTrend).sort((a, b) => a.t - b.t);
  const byDay = new Map();
  runs.forEach(h => { const d = new Date(h.t).toDateString(); if (!byDay.has(d)) byDay.set(d, []); byDay.get(d).push(h); });
  if (byDay.size >= 3) {
    return { by: 'day', points: [...byDay.entries()].slice(-60).map(([d, hs]) => ({
      label: new Date(d).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }),
      wpm: mean(hs.map(h => h.wpm)), acc: mean(hs.map(h => h.acc)), n: hs.length })) };
  }
  return { by: 'run', points: runs.slice(-40).map(h => ({ label: `${runTitle(h)} · ${fmtDay(h.t)}`, wpm: h.wpm, acc: h.acc, n: 1 })) };
}

function niceStep(span, count) {
  const raw = span / count, mag = 10 ** Math.floor(Math.log10(raw || 1));
  return [1, 2, 2.5, 5, 10].map(f => f * mag).find(s => span / s <= count) || mag * 10;
}

// One series per chart (speed and accuracy have different scales, so they
// never share an axis). Hover or arrow keys move a crosshair with a readout.
function lineChart(box, pts, o) {
  box.innerHTML = '';
  const W = Math.max(260, box.clientWidth), H = 210, m = { l: 40, r: 58, t: 14, b: 28 };
  const iw = W - m.l - m.r, ih = H - m.t - m.b;
  const vals = pts.map(d => d[o.key]);
  let lo = o.min(vals), hi = o.max(vals);
  const step = niceStep(hi - lo || 1, 4);
  lo = Math.floor(lo / step) * step; hi = Math.ceil(hi / step) * step;
  if (hi === lo) hi = lo + step;
  const x = i => m.l + (pts.length === 1 ? iw / 2 : i * iw / (pts.length - 1));
  const y = v => m.t + ih - (v - lo) / (hi - lo) * ih;

  const svg = svgEl('svg', { viewBox: `0 0 ${W} ${H}`, width: W, height: H, class: 'chart', tabindex: 0, role: 'img',
    'aria-label': `${o.title}: latest ${o.fmt(vals.at(-1))}, ${pts.length} ${o.unit}. Use the arrow keys to read each point.` });
  for (let v = lo; v <= hi + 1e-9; v += step) {
    svg.append(svgEl('line', { x1: m.l, x2: m.l + iw, y1: y(v), y2: y(v), class: 'grid' }));
    const t = svgEl('text', { x: m.l - 8, y: y(v) + 4, class: 'tick', 'text-anchor': 'end' }); t.textContent = o.tick(v); svg.append(t);
  }
  if (o.ref != null && o.ref >= lo && o.ref <= hi) {
    svg.append(svgEl('line', { x1: m.l, x2: m.l + iw, y1: y(o.ref), y2: y(o.ref), class: 'ref' }));
    const t = svgEl('text', { x: m.l + 4, y: y(o.ref) - 6, class: 'tick' }); t.textContent = o.refLabel; svg.append(t);
  }
  const xl = pts.length > 4 ? [0, Math.floor((pts.length - 1) / 2), pts.length - 1] : pts.map((_, i) => i);
  if (o.unit === 'days') xl.forEach(i => {
    const t = svgEl('text', { x: x(i), y: H - 8, class: 'tick', 'text-anchor': i === 0 && pts.length > 1 ? 'start' : i === pts.length - 1 && pts.length > 1 ? 'end' : 'middle' });
    t.textContent = pts[i].label; svg.append(t);
  });
  else { const t = svgEl('text', { x: m.l, y: H - 8, class: 'tick' }); t.textContent = `Last ${pts.length} runs, oldest to newest`; svg.append(t); }

  svg.append(svgEl('path', { d: pts.map((d, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(d[o.key]).toFixed(1)}`).join(''), class: 'line', style: `stroke:${o.color}` }));
  const last = pts.length - 1;
  svg.append(svgEl('circle', { cx: x(last), cy: y(vals[last]), r: 4, class: 'dot', style: `fill:${o.color}` }));
  const lbl = svgEl('text', { x: x(last) + 10, y: y(vals[last]) + 4, class: 'direct' }); lbl.textContent = o.fmt(vals[last]); svg.append(lbl);

  // Hover layer
  const hair = svgEl('line', { y1: m.t, y2: m.t + ih, class: 'hair', visibility: 'hidden' });
  const mark = svgEl('circle', { r: 5, class: 'dot', style: `fill:${o.color}`, visibility: 'hidden' });
  const hit = svgEl('rect', { x: m.l - 10, y: 0, width: iw + 20, height: H, fill: 'transparent' });
  svg.append(hair, mark, hit);
  const tip = document.createElement('div');
  tip.className = 'viz-tip'; tip.hidden = true;
  box.append(svg, tip);
  const show = i => {
    i = Math.max(0, Math.min(last, i));
    hair.setAttribute('x1', x(i)); hair.setAttribute('x2', x(i)); hair.setAttribute('visibility', 'visible');
    mark.setAttribute('cx', x(i)); mark.setAttribute('cy', y(vals[i])); mark.setAttribute('visibility', 'visible');
    tip.replaceChildren();
    const strong = document.createElement('b'); strong.textContent = o.fmt(vals[i]);
    const sub = document.createElement('span'); sub.textContent = pts[i].label + (pts[i].n > 1 ? ` · ${pts[i].n} runs` : '');
    tip.append(strong, sub);
    tip.hidden = false;
    const left = x(i) / W * box.clientWidth;
    tip.style.left = Math.min(Math.max(left, 70), box.clientWidth - 70) + 'px';
    tip.style.top = (y(vals[i]) / H * svg.getBoundingClientRect().height - 12) + 'px';
    svg._i = i;
  };
  const hide = () => { hair.setAttribute('visibility', 'hidden'); mark.setAttribute('visibility', 'hidden'); tip.hidden = true; };
  hit.addEventListener('pointermove', e => {
    const r = svg.getBoundingClientRect();
    const px = (e.clientX - r.left) / r.width * W;
    show(pts.length === 1 ? 0 : Math.round((px - m.l) / (iw / (pts.length - 1))));
  });
  hit.addEventListener('pointerleave', hide);
  svg.addEventListener('focus', () => show(last));
  svg.addEventListener('blur', hide);
  svg.addEventListener('keydown', e => {
    if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') { e.preventDefault(); show((svg._i ?? last) + (e.key === 'ArrowLeft' ? -1 : 1)); }
  });
}

// Keyboard heatmap: one hue, five steps, deeper = worse. Keys without enough
// typing yet stay plain and say so on hover.
const HEAT = {
  mistakes: { label: 'Mistakes', color: 'var(--warm)', value: missRate, enough: k => k.n + k.m >= 5,
    bins: [0.01, 0.03, 0.06, 0.1], names: ['Under 1%', '1–3%', '3–6%', '6–10%', 'Over 10%'] },
  speed: { label: 'Slow keys', color: 'var(--accent)', value: avgMs, enough: k => k.tn >= 3,
    bins: [300, 450, 650, 900], names: ['Under 0.3s', '0.3–0.45s', '0.45–0.65s', '0.65–0.9s', 'Over 0.9s'] },
};
const HEAT_MIX = [16, 34, 54, 76, 100];

function heatmap(box, p, mode) {
  const H = HEAT[mode];
  box.innerHTML = `<div class="heat-kb"></div>
    <div class="legend" aria-hidden="true"><span class="muted small">${mode === 'mistakes' ? 'Fewer mistakes' : 'Faster'}</span>
      ${H.names.map((n, i) => `<span class="sw" style="--heat:${H.color};--h:${HEAT_MIX[i]}" title="${esc(n)}"></span>`).join('')}
      <span class="muted small">${mode === 'mistakes' ? 'More' : 'Slower'}</span>
      <span class="sw none"></span><span class="muted small">Not enough typing yet</span></div>
    <div class="viz-tip" hidden></div>`;
  const g = buildGuide($('.heat-kb', box), { mode: 'hint' });
  const stats = keyStats(p);
  const tip = $('.viz-tip', box);
  for (const [key, el] of Object.entries(g.keyEls)) {
    if (key.length > 1 && key !== ' ') { el.classList.add('nodata'); continue; }
    const k = stats[key];
    const name = key === ' ' ? 'Space' : key.toUpperCase();
    let line;
    if (k && H.enough(k)) {
      const bin = H.bins.filter(b => H.value(k) >= b).length;
      el.classList.add('heat'); el.style.setProperty('--heat', H.color); el.style.setProperty('--h', HEAT_MIX[bin]);
      if (bin >= 3) el.classList.add('hot');
      line = mode === 'mistakes'
        ? `${(missRate(k) * 100).toFixed(1)}% missed · ${k.m} of ${k.n + k.m}`
        : `${(avgMs(k) / 1000).toFixed(2)}s per press · ${k.tn} timed`;
    } else { el.classList.add('nodata'); line = 'Not enough typing yet'; }
    el.tabIndex = 0;
    el.setAttribute('aria-label', `${name}: ${line}`);
    const show = () => {
      tip.replaceChildren();
      const b = document.createElement('b'); b.textContent = name;
      const s = document.createElement('span'); s.textContent = line;
      tip.append(b, s); tip.hidden = false;
      const r = el.getBoundingClientRect(), br = box.getBoundingClientRect();
      tip.style.left = Math.min(Math.max(r.left - br.left + r.width / 2, 80), br.width - 80) + 'px';
      tip.style.top = (r.top - br.top - 8) + 'px';
    };
    el.addEventListener('pointerenter', show); el.addEventListener('focus', show);
    el.addEventListener('pointerleave', () => { tip.hidden = true; }); el.addEventListener('blur', () => { tip.hidden = true; });
  }
}

function weakChips(spots) {
  return [...spots.keys.map(k => `<span class="keycap ${fingerClass(FINGER_OF[k] || 'th')}" style="--kc:var(--fc)">${esc(k === ' ' ? 'space' : k.toUpperCase())}</span>`),
    ...spots.pairs.map(pr => `<span class="keycap pair">${esc(pr)}</span>`)].join('');
}

SCREENS.progress = function (heatMode = 'mistakes') {
  const p = me();
  const trend = trendSeries(p);
  const recent = p.history.filter(countsForTrend).slice(-10);
  const days = new Set(p.history.map(h => new Date(h.t).toDateString())).size;
  const totalMs = p.history.reduce((a, h) => a + h.ms, 0);
  const spots = weakSpots(p);
  const passagesDone = Object.keys(p.passages).length;
  const unit = trend.by === 'day' ? 'days' : 'runs';
  const tests = testRuns(p);
  const mixups = topMixups(p);
  if (newBadges(p).length) save();   // anything earned outside a results screen
  const earned = BADGES.filter(b => p.badges[b.id]).sort((a, b) => p.badges[b.id] - p.badges[a.id]);
  const known = masteredKeys(p, true);

  $('#app').innerHTML = `
    <h1>Progress</h1>
    <p class="muted" style="margin-top:6px">Speed and accuracy from passages, lesson checks, drills and speed tests.</p>
    <div class="stats four" style="margin-top:18px">
      <div class="stat"><div class="v">${recent.length ? Math.round(mean(recent.map(h => h.wpm))) : '–'}<small> WPM</small></div><div class="k">Typing speed, last 10 runs</div></div>
      <div class="stat"><div class="v">${recent.length ? fmtAcc(mean(recent.map(h => h.acc))) : '–'}</div><div class="k">Accuracy, last 10 runs</div></div>
      <div class="stat"><div class="v">${Math.round(totalMs / 60000)}<small> min</small></div><div class="k">Practice on ${days} day${days === 1 ? '' : 's'}</div></div>
      <div class="stat"><div class="v">${passagesDone}<small> / ${PASSAGES.length}</small></div><div class="k">Passages typed</div></div>
    </div>
    ${trend.points.length >= 2 ? `
      <div class="charts">
        <div class="card"><h3>Speed</h3><p class="muted small">Words per minute${trend.by === 'day' ? ', daily average' : ''}</p><div class="chart-box" id="c-wpm"></div></div>
        <div class="card"><h3>Accuracy</h3><p class="muted small">Percent of keys right the first time${trend.by === 'day' ? ', daily average' : ''}</p><div class="chart-box" id="c-acc"></div></div>
      </div>
      <details class="table-view"><summary>Show as a table</summary>
        <table><thead><tr><th>${trend.by === 'day' ? 'Day' : 'Run'}</th><th>WPM</th><th>Accuracy</th>${trend.by === 'day' ? '<th>Runs</th>' : ''}</tr></thead>
        <tbody>${trend.points.slice().reverse().map(d => `<tr><td>${esc(d.label)}</td><td>${d.wpm.toFixed(1)}</td><td>${fmtAcc(d.acc)}</td>${trend.by === 'day' ? `<td>${d.n}</td>` : ''}</tr>`).join('')}</tbody></table>
      </details>`
    : `<div class="card empty" style="margin-top:16px"><b>Your charts show up here.</b><p class="muted">Pass a lesson check or type a passage or two, and you'll see your speed and accuracy over time.</p></div>`}

    <div class="section-title">Speed test</div>
    <div class="card weak-card">
      <div><p>${tests.length
        ? `Best <b>${Math.round(Math.max(...tests.map(h => h.wpm)))} WPM</b> · last <b>${Math.round(tests.at(-1).wpm)} WPM</b> at ${fmtAcc(tests.at(-1).acc)} (${esc(fmtDay(tests.at(-1).t).toLowerCase())}) · ${tests.length} test${tests.length === 1 ? '' : 's'} taken`
        : 'A 1-minute test gives you one number to track. Take it now for a starting point, then again every week or so.'}</p></div>
      <button class="btn" id="speed-test">⏱ Take the 1-minute test</button>
    </div>

    <div class="section-title">Your keyboard</div>
    <div class="card">
      <p class="muted small" style="margin-bottom:12px">${known.size
        ? `You know <b style="color:var(--text)">${known.size} key${known.size === 1 ? '' : 's'}</b> well enough that ${p.settings.fade !== false ? 'the guide fades them out' : 'the guide could fade them (turn it on in Settings)'}.`
        : 'Keys you know well will fade out of the guide as you practice.'}</p>
      <div class="chips" style="margin-top:0">
        ${Object.entries(HEAT).map(([k, h]) => `<button class="chip ${k === heatMode ? 'on' : ''}" data-heat="${k}">${h.label}</button>`).join('')}
      </div>
      <div class="heat-box" id="heat"></div>
    </div>

    <div class="section-title">Mix-ups</div>
    ${mixups.length ? `<div class="mix-list">${mixups.map(m => `<div class="card mix-card">
        <div class="mix-keys">${m.keys.map(k => `<span class="keycap ${fingerClass(FINGER_OF[k] || 'th')}" style="--kc:var(--fc)">${esc(keyName(k))}</span>`).join('<span class="arrow">→</span>')}</div>
        <div class="mix-body"><b>${esc(m.title)}</b> <span class="muted small">· ${m.n} times</span><p class="muted">${esc(m.tip)}</p></div>
        <button class="btn ghost" data-mix="${esc(m.id)}">Drill it →</button></div>`).join('')}</div>`
      : '<div class="card"><p class="muted">When the same wrong key keeps going down in place of the right one, TypeUp will spot the pattern here, explain why it happens, and build a drill for it.</p></div>'}

    <div class="section-title">Weak spots</div>
    <div class="card weak-card">
      ${spots.keys.length || spots.pairs.length
        ? `<div><p>These keys and letter pairs trip you up more than the rest. A one-minute drill on them is the fastest way to improve.</p>
           <div class="keys">${weakChips(spots)}</div></div>
           <button class="btn warm" id="drill">Fix my weak keys →</button>`
        : `<p class="muted">Nothing stands out yet. After a few more runs, TypeUp will find the keys that slow you down and build drills for them.</p>`}
    </div>

    <div class="section-title">Badges</div>
    <div class="card badge-summary">
      <div class="badge-count"><b>${earned.length}</b><span>of ${BADGES.length} earned</span>
        <div class="bar xp"><div style="width:${earned.length / BADGES.length * 100}%"></div></div></div>
      <div class="badge-grid">${earned.length ? earned.slice(0, 6).map(badgeTile).join('') : BADGES.slice(0, 6).map(badgeTile).join('')}</div>
      <button class="btn ghost" id="all-badges">See all ${BADGES.length} badges →</button>
    </div>`;

  const draw = () => {
    if (trend.points.length < 2) return;
    lineChart($('#c-wpm'), trend.points, { key: 'wpm', title: 'Speed', unit, color: 'var(--accent)',
      min: () => 0, max: v => Math.max(10, ...v) * 1.1, fmt: v => `${Math.round(v)} WPM`, tick: v => String(Math.round(v)) });
    lineChart($('#c-acc'), trend.points, { key: 'acc', title: 'Accuracy', unit, color: 'var(--good)',
      min: v => Math.min(90, ...v), max: () => 100, fmt: fmtAcc, tick: v => v + '%', ref: PASS_ACC, refLabel: `Lesson pass line ${PASS_ACC}%` });
  };
  draw();
  heatmap($('#heat'), p, heatMode);
  $$('[data-heat]').forEach(b => b.onclick = () => {
    $$('[data-heat]').forEach(x => x.classList.toggle('on', x === b));
    heatmap($('#heat'), p, b.dataset.heat);
  });
  $('#drill') && ($('#drill').onclick = () => runDrill('progress'));
  $('#speed-test').onclick = () => runSpeedTest('progress');
  $$('[data-mix]').forEach(b => b.onclick = () => runMixupDrill(b.dataset.mix, 'progress'));
  $('#all-badges').onclick = () => go('badges');
  let t;
  const onResize = () => { clearTimeout(t); t = setTimeout(draw, 150); };
  window.addEventListener('resize', onResize);
  setCleanup(() => window.removeEventListener('resize', onResize));
};

function badgeTile(b) {
  const got = me().badges[b.id];
  const when = got ? fmtDay(got) : '';
  return `<div class="badge-tile ${got ? 'got' : ''}" title="${esc(b.how)}">
    <span class="b-icon">${b.icon}</span><span class="b-name">${esc(b.name)}</span>
    <span class="b-how">${got ? `Earned ${esc(/^(Today|Yesterday)$/.test(when) ? when.toLowerCase() : when)}` : esc(b.how)}</span></div>`;
}

SCREENS.badges = function (show = 'all') {
  const p = me();
  if (newBadges(p).length) save();
  const keep = b => show === 'all' || (show === 'got') === !!p.badges[b.id];
  const total = BADGES.filter(b => p.badges[b.id]).length;
  $('#app').innerHTML = `
    <button class="back" id="b-back">← Progress</button>
    <h1>Badges</h1>
    <p class="muted" style="margin-top:6px">${total} of ${BADGES.length} earned. Hover over one to see how to get it.</p>
    <div class="chips">${[['all', 'All'], ['got', 'Earned'], ['todo', 'Not yet']].map(([k, label]) =>
      `<button class="chip ${show === k ? 'on' : ''}" data-show="${k}">${label}</button>`).join('')}</div>
    ${Object.entries(BADGE_GROUPS).map(([g, label]) => {
      const all = BADGES.filter(b => b.group === g), list = all.filter(keep);
      if (!list.length) return '';
      return `<div class="section-title">${esc(label)} · ${all.filter(b => p.badges[b.id]).length} of ${all.length}</div>
        <div class="badge-grid">${list.map(badgeTile).join('')}</div>`;
    }).join('') || '<p class="muted" style="margin-top:20px">Nothing here yet. Keep practicing!</p>'}`;
  $('#b-back').onclick = () => go('progress');
  $$('[data-show]').forEach(b => b.onclick = () => go('badges', b.dataset.show));
};

// ── Lesson and passage runs ────────────────────────────────────────────────
function runLessonStep(lesson, steps, i) {
  const step = steps[i];
  const p = me();
  startTyping({
    title: `Lesson ${lesson.id}: ${lesson.title}`,
    sub: `Step ${i + 1} of ${steps.length} · ${step.name}${step.check ? ` · pass with ${PASS_ACC}%` : ''}`,
    text: step.text, lesson, finishSound: !step.check,
    onBack: () => go('lesson', lesson.id),
    onRestart: () => runLessonStep(lesson, steps, i),
    onDone: (result, show) => {
      const stepId = step.check ? 'check' : i + 1;
      recordRun(p, { kind: 'lesson', ref: lesson.id, step: stepId, wpm: result.wpm, acc: result.acc, ms: result.ms, chars: result.chars });
      const same = h => h.kind === 'lesson' && h.step === stepId;
      if (!step.check) {
        if (!show) return;
        return showResults({
          title: `Step ${i + 1} done: ${step.name}`, result, same,
          buttons: [
            { label: `Next: ${steps[i + 1].name} →`, action: () => runLessonStep(lesson, steps, i + 1) },
            { label: 'Try again', action: () => runLessonStep(lesson, steps, i) },
          ],
        });
      }
      const r = p.lessons[lesson.id] || (p.lessons[lesson.id] = { passed: false, bestAcc: 0, bestWpm: 0, attempts: 0 });
      const passed = result.acc >= PASS_ACC;
      const firstPass = passed && !r.passed;
      r.attempts++;
      r.bestAcc = Math.max(r.bestAcc, result.acc);
      if (passed) { r.passed = true; r.bestWpm = Math.max(r.bestWpm, result.wpm); }
      save();
      if (!show) return;
      if (passed) Sound.pass(); else Sound.done();
      const next = lessonById(lesson.id + 1);
      const fresh = lessonSteps(lesson);
      const verdict = passed
        ? `<div class="verdict pass">${firstPass ? `Lesson ${lesson.id} passed!` : 'Passed again.'} ${next ? `Next up: <b>${esc(next.title)}</b>.` : 'That was the last lesson. Every key is yours now.'}</div>`
        : `<div class="verdict fail">So close. You need ${PASS_ACC}% to pass. Slow down a little and let each finger find its key. Accuracy first, speed later.</div>`;
      showResults({
        title: passed ? 'Lesson passed! 🎉' : 'Almost there', result, same, verdict,
        buttons: passed
          ? [next ? { label: `Lesson ${next.id}: ${next.title} →`, action: () => go('lesson', next.id) } : { label: 'Try a passage →', action: () => go('passages') },
             { label: 'Back to lessons', action: () => go('lessons') }]
          : [{ label: 'Try the check again', action: () => runLessonStep(lesson, fresh, fresh.length - 1) },
             { label: 'Redo the lesson', action: () => runLessonStep(lesson, fresh, 0) },
             { label: 'Back to lessons', action: () => go('lessons') }],
      });
    },
  });
}

function runPassage(ps, topic = 'all') {
  const p = me();
  const t = topicOf(ps);
  const rec = p.passages[ps.id];
  // Race your best: only if that run was saved for exactly this text.
  const ghost = p.settings.ghost !== false && Array.isArray(rec?.ghost) && rec.ghostLen === ps.text.length ? rec.ghost : null;
  startTyping({
    title: ps.title, sub: `${t.icon} ${t.label}${ghost ? ' · 👻 racing your best' : ''}`, text: ps.text, ghost,
    onBack: () => go('passages', topic),
    onRestart: () => runPassage(ps, topic),
    onDone: (result, show) => {
      recordRun(p, { kind: 'passage', ref: ps.id, wpm: result.wpm, acc: result.acc, ms: result.ms, chars: result.chars });
      const b = p.passages[ps.id] || (p.passages[ps.id] = { bestWpm: 0, bestAcc: 0, runs: 0 });
      const isBest = b.runs > 0 && result.wpm > b.bestWpm;
      const ghostMs = ghost ? b.ghostMs : null;
      // Keep the pace of the best run so the next try can race it.
      if (!b.ghost || b.ghostLen !== ps.text.length || result.wpm > b.bestWpm) {
        const marks = [];
        for (let i = GHOST_STEP - 1; i < result.times.length; i += GHOST_STEP) marks.push(Math.round(result.times[i]));
        Object.assign(b, { ghost: marks, ghostLen: ps.text.length, ghostMs: Math.round(result.ms) });
      }
      b.runs++; b.bestWpm = Math.max(b.bestWpm, result.wpm); b.bestAcc = Math.max(b.bestAcc, result.acc);
      if (ghostMs != null && result.ms < ghostMs) p.ghostWins = (p.ghostWins || 0) + 1;
      save();
      if (!show) return;
      const race = ghostMs == null ? '' : result.ms < ghostMs
        ? `<div class="verdict pass">👻 You beat your best run by ${((ghostMs - result.ms) / 1000).toFixed(1)} seconds!</div>`
        : `<div class="verdict fail">👻 Your best run was ${((result.ms - ghostMs) / 1000).toFixed(1)} seconds faster. Race it again?</div>`;
      // Next up: a passage you haven't typed yet, if any are open.
      const learned = learnedSet(p);
      const source = topic === 'mine' ? myPassages(p) : PASSAGES.filter(x => topic === 'all' || x.topic === topic);
      const pool = source.filter(x => x.id !== ps.id && (topic === 'mine' || !missingKeys(x, learned).length));
      const fresh = pool.filter(x => !p.passages[x.id]);
      const next = fresh.length ? pick(fresh) : pool.length ? pick(pool) : null;
      showResults({
        title: isBest ? 'New personal best! 🎉' : 'Passage done', result, same: h => h.kind === 'passage', verdict: race,
        buttons: [
          ...(next ? [{ label: 'Next passage →', action: () => runPassage(next, topic) }] : []),
          { label: 'Try again', action: () => runPassage(ps, topic) },
          { label: 'All passages', action: () => go('passages', topic) },
        ],
      });
    },
  });
}

function runDrill(back = 'progress') {
  const p = me();
  const drill = drillText(p);
  if (!drill) return go(back);
  startTyping({
    title: 'Weak-key drill', sub: `Working on ${[...drill.keys.map(keyLabel), ...drill.pairs].join(', ')}`, text: drill.text,
    onBack: () => go(back),
    onRestart: () => runDrill(back),
    onDone: (result, show) => {
      recordRun(p, { kind: 'drill', ref: 'weak', wpm: result.wpm, acc: result.acc, ms: result.ms, chars: result.chars });
      if (!show) return;
      showResults({
        title: 'Drill done', result, same: h => h.kind === 'drill' && h.ref === 'weak',
        buttons: [
          { label: 'Another drill →', action: () => runDrill(back) },
          { label: 'See my progress', action: () => go('progress') },
          { label: 'Home', action: () => go('home') },
        ],
      });
    },
  });
}

// A standard 1-minute test: type as much as you can, as cleanly as you can.
// The text comes from passages you've unlocked, or from learned words.
const TEST_MS = 60000;
function testText(p) {
  const learned = learnedSet(p);
  const open = shuffle(PASSAGES.filter(ps => !missingKeys(ps, learned).length));
  if (open.length) { let t = ''; for (const ps of open) { t += (t ? ' ' : '') + ps.text; if (t.length > 1200) break; } return t; }
  const words = WORDS.filter(w => [...w].every(c => learned.has(c)));
  return fillTo(1200, () => pick(words.length >= 8 ? words : WORDS.filter(w => [...w].every(c => cumChars(1).has(c)))));
}
const testRuns = p => p.history.filter(h => h.kind === 'test');

function runSpeedTest(back = 'progress') {
  const p = me();
  startTyping({
    title: '1-minute speed test', sub: 'Type as far as you can in 60 seconds. Accuracy counts: only correct letters add speed.',
    text: testText(p), limitMs: TEST_MS,
    onBack: () => go(back),
    onRestart: () => runSpeedTest(back),
    onDone: (result, show) => {
      const prevBest = Math.max(0, ...testRuns(p).map(h => h.wpm));
      recordRun(p, { kind: 'test', ref: 'minute', wpm: result.wpm, acc: result.acc, ms: result.ms, chars: result.chars });
      if (!show) return;
      const isBest = testRuns(p).length > 1 && result.wpm > prevBest;
      showResults({
        title: isBest ? 'New best speed! 🎉' : `Speed test: ${Math.round(result.wpm)} WPM`, result, same: h => h.kind === 'test',
        verdict: testRuns(p).length === 1 ? '<div class="verdict goal">That\'s your starting point. Take the test again every week or so to see how far you\'ve come.</div>' : '',
        buttons: [
          { label: 'Take it again', action: () => runSpeedTest(back) },
          { label: 'See my progress', action: () => go('progress') },
        ],
      });
    },
  });
}

// A plain warm-up of words made from learned keys, for when no keys stand out as weak.
function runReview() {
  const p = me();
  const learned = learnedSet(p);
  const words = WORDS.filter(w => [...w].every(c => learned.has(c)));
  const pool = words.length >= 6 ? words : WORDS.filter(w => [...w].every(c => cumChars(1).has(c)));
  startTyping({
    title: 'Warm-up', sub: 'Words made only from keys you know', text: fillTo(180, () => pick(pool)),
    onBack: () => go('home'),
    onRestart: runReview,
    onDone: (result, show) => {
      recordRun(p, { kind: 'drill', ref: 'review', wpm: result.wpm, acc: result.acc, ms: result.ms, chars: result.chars });
      if (!show) return;
      showResults({
        title: 'Warm-up done', result, same: h => h.kind === 'drill' && h.ref === 'review',
        buttons: [{ label: 'Try again', action: runReview }, { label: 'Home', action: () => go('home') }],
      });
    },
  });
}

// ── Today's practice ───────────────────────────────────────────────────────
// One button builds a session sized to the daily goal: a warm-up, the next
// lesson, new passages and a game to finish. Finishing a matching activity
// checks off a part, and its results screen offers the next one.
const PLAN_TYPES = ['intro', 'drill', 'review', 'lesson', 'passage', 'test', 'game'];
const todayKey = () => new Date().toDateString();
const todaysPlan = p => p.plan?.day === todayKey() ? p.plan : null;
const planNext = plan => plan?.steps.find(s => !s.done) || null;

function buildPlan(p) {
  const goalMin = goalMs(p) / 60000;
  const cpm = Math.max(25, recentWpm(p) * 5);   // characters per minute, from recent speed
  const mins = chars => Math.max(1, Math.round(chars / cpm + 0.4));
  const steps = [];
  const add = (type, ref, label, m) => steps.push({ type, ref, label, mins: m, done: false });
  const total = () => steps.reduce((a, s) => a + s.mins, 0);
  const nl = nextLesson(p);
  const weak = weakSpots(p);

  if (!p.introDone) add('intro', null, 'Find home row', 1);
  else if (weak.keys.length || weak.pairs.length) add('drill', 'weak', 'Weak-key warm-up', mins(200));
  else if (lessonsPassed(p)) add('review', 'review', 'Warm-up', mins(180));
  if (nl) add('lesson', nl.id, `Lesson ${nl.id}: ${nl.title}`, mins(360));
  const tests = testRuns(p);
  if (!nl && (!tests.length || Date.now() - tests.at(-1).t > 7 * 864e5)) add('test', 'minute', '1-minute speed test', 1);

  // Fill the rest of the goal with passages, new ones first, leaving room for a game.
  const learned = learnedSet(p);
  const open = PASSAGES.filter(ps => !missingKeys(ps, learned).length);
  const queue = [...shuffle(open.filter(ps => !p.passages[ps.id])), ...shuffle(open.filter(ps => p.passages[ps.id]))];
  const gameMins = 2;
  while (queue.length && total() + gameMins < goalMin && steps.filter(s => s.type === 'passage').length < 4) {
    const ps = queue.shift();
    add('passage', ps.id, ps.title, mins(ps.text.length));
  }
  if (!open.length && p.introDone && total() + gameMins < goalMin) add('review', 'review', 'Word practice', mins(180));
  const game = new Date().getDate() % 2 ? 'fairway' : 'twominute';   // alternate by day
  add('game', game, GAMES[game].title, gameMins);
  return { day: todayKey(), steps, started: false };
}

// A plan built earlier today can go stale before it's started (say, the
// lesson in it was passed some other way). Started plans are kept as they are.
function freshPlan(p) {
  let plan = todaysPlan(p);
  const stale = plan && !plan.started && plan.steps.some(s =>
    (s.type === 'lesson' && p.lessons[s.ref]?.passed) || (s.type === 'intro' && p.introDone));
  if (!plan || stale) { p.plan = plan = buildPlan(p); save(); }
  return plan;
}

function planMatches(s, h) {
  switch (s.type) {
    case 'drill': return h.kind === 'drill' && h.ref === 'weak';
    case 'review': return h.kind === 'drill' && h.ref === 'review';
    case 'lesson': return h.kind === 'lesson' && h.ref === s.ref && h.step === 'check';
    case 'passage': return h.kind === 'passage';
    case 'test': return h.kind === 'test';
    case 'game': return h.kind === 'game';
    default: return false;
  }
}
// Set when the run just saved checked off a part; the results screen reads it.
let planMoved = false;
function planAdvance(p, h) {
  planMoved = false;
  const plan = todaysPlan(p);
  if (!plan?.started || !h) return;
  const s = plan.steps.find(x => !x.done && planMatches(x, h));
  if (s) { s.done = true; planMoved = true; if (!planNext(plan)) p.plansDone = (p.plansDone || 0) + 1; }
}

function startPlan() {
  const p = me();
  let plan = freshPlan(p);
  if (!planNext(plan)) p.plan = plan = buildPlan(p);   // finished: build another round
  plan.started = true;
  save();
  runPlanStep(planNext(plan));
}
function runPlanStep(s) {
  const p = me();
  if (!s) return go('home');
  const skip = () => { s.done = true; save(); runPlanStep(planNext(todaysPlan(p))); };
  switch (s.type) {
    case 'intro': return p.introDone ? skip() : go('intro');
    case 'drill': return drillText(p) ? runDrill('home') : skip();
    case 'review': return runReview();
    case 'lesson': return go('lesson', s.ref);
    case 'passage': { const ps = PASSAGES.find(x => x.id === s.ref); return ps ? runPassage(ps) : skip(); }
    case 'test': return runSpeedTest('home');
    case 'game': return GAMES[s.ref] ? go(s.ref) : skip();
  }
}

// When a run checks off a part of today's practice, its results lead with
// "Next: …" and say how far along you are.
function planResult(buttons) {
  if (!planMoved) return { buttons, banner: '' };
  planMoved = false;
  const plan = todaysPlan(me()), next = planNext(plan);
  const done = plan.steps.filter(s => s.done).length;
  const again = buttons.find(b => /again/i.test(b.label));
  return {
    banner: `<div class="verdict plan">${next ? `✅ Part ${done} of ${plan.steps.length} done` : '🎉 That\'s today\'s practice, all done!'}</div>`,
    buttons: [
      next ? { label: `Next: ${next.label} →`, action: () => runPlanStep(next) } : { label: 'Finish today\'s practice 🎉', action: () => go('home') },
      ...(again ? [{ ...again, style: 'ghost' }] : []),
      { label: 'Stop for now', style: 'ghost', action: () => go('home') },
    ],
  };
}

// ── Sound ──────────────────────────────────────────────────────────────────
// Small synthesized sounds, so there are no audio files to download.
const Sound = {
  ctx: null,
  on() { return me()?.settings.sound !== false; },
  tone(freq, dur, { type = 'sine', gain = 0.05, at = 0 } = {}) {
    if (!this.on()) return;
    try {
      this.ctx ||= new (window.AudioContext || window.webkitAudioContext)();
      if (this.ctx.state === 'suspended') this.ctx.resume();
      const t = this.ctx.currentTime + at;
      const osc = this.ctx.createOscillator(), g = this.ctx.createGain();
      osc.type = type; osc.frequency.value = freq;
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(gain, t + 0.004);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      osc.connect(g).connect(this.ctx.destination);
      osc.start(t); osc.stop(t + dur + 0.02);
    } catch { /* no audio available */ }
  },
  click() { this.tone(1500 + Math.random() * 300, 0.03, { type: 'triangle', gain: 0.03 }); },
  error() { this.tone(160, 0.12, { type: 'square', gain: 0.035 }); },
  done() { [659, 784, 988].forEach((f, i) => this.tone(f, 0.22, { at: i * 0.09, gain: 0.05 })); },
  pass() { [523, 659, 784, 1047].forEach((f, i) => this.tone(f, i === 3 ? 0.5 : 0.2, { at: i * 0.11, gain: 0.06 })); },
};
function paintSoundBtn() {
  const b = $('#btn-sound');
  const on = Sound.on();
  b.textContent = on ? '🔊' : '🔇';
  b.title = on ? 'Sound on (click to mute)' : 'Sound off (click to turn on)';
  b.setAttribute('aria-pressed', String(!on));
}

// ── Backup and restore ─────────────────────────────────────────────────────
// Progress lives in this browser only, so a backup file is the way to keep it
// safe or move it to another computer. One file holds everyone.
const BACKUP_REMIND_DAYS = 14;
const backupDue = () => state.profiles.some(p => p.history.length >= 5)
  && (!state.lastBackup || Date.now() - state.lastBackup > BACKUP_REMIND_DAYS * 864e5);

function backupNow() {
  const payload = { app: 'typeup', version: 1, saved: new Date().toISOString(), profiles: state.profiles };
  const url = URL.createObjectURL(new Blob([JSON.stringify(payload)], { type: 'application/json' }));
  const a = document.createElement('a');
  a.href = url; a.download = `typeup-backup-${new Date().toISOString().slice(0, 10)}.json`;
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
  state.lastBackup = Date.now(); save();
}

function restorePick() {
  const input = document.createElement('input');
  input.type = 'file'; input.accept = '.json,application/json';
  input.onchange = async () => { if (input.files[0]) restoreFrom(await input.files[0].text()); };
  input.click();
}
// Reads a backup file's text and asks before restoring anything.
function restoreFrom(text) {
  let data = null;
  try { data = JSON.parse(text); } catch { /* not JSON */ }
  const people = data?.app === 'typeup' && Array.isArray(data.profiles)
    ? data.profiles.filter(p => p && typeof p === 'object' && p.id && p.name && Array.isArray(p.history)) : [];
  if (!people.length) {
    return openModal(`<h2>That file didn't work</h2>
      <p class="muted" style="margin:10px 0 18px;line-height:1.55">It isn't a TypeUp backup, or it's damaged. Backups are named like typeup-backup-2026-11-06.json.</p>`, [{ label: 'OK' }]);
  }
  people.forEach(normalizeProfile);
  const here = new Set(state.profiles.map(p => p.id));
  const replaced = people.filter(p => here.has(p.id));
  const names = list => list.map(p => esc(p.name)).join(', ');
  const when = data.saved ? new Date(data.saved).toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' }) : 'an unknown date';
  openModal(`<h2>Restore from this backup?</h2>
    <p class="muted" style="margin:10px 0 8px;line-height:1.55">Saved ${esc(when)}, with ${people.length === 1 ? '1 person' : `${people.length} people`}: ${names(people)}.</p>
    <p class="muted" style="margin:0 0 18px;line-height:1.55">${replaced.length
      ? `<b style="color:var(--fixed)">This replaces what's on this computer for ${names(replaced)}.</b> `
      : ''}Anyone not in the file stays as they are.</p>`,
    [{ label: 'Restore', style: replaced.length ? 'danger' : '', action: () => {
      people.forEach(np => { const i = state.profiles.findIndex(p => p.id === np.id); if (i >= 0) state.profiles[i] = np; else state.profiles.push(np); });
      if (!me()) state.current = people[0].id;
      save(); Store.flush();
      go('home');
    } }, { label: 'Cancel', style: 'ghost' }]);
}

// ── Settings ───────────────────────────────────────────────────────────────
function openSettings() {
  const p = me();
  if (!p) return;
  const radio = (name, value, label, help) => `<label><input type="radio" name="${name}" value="${value}" ${p.settings[name] === value ? 'checked' : ''}>
    <span><b>${label}</b><small>${help}</small></span></label>`;
  openModal(`
    <h2>Settings for ${esc(p.name)}</h2>
    <div class="add-form" style="max-width:none">
      <label for="s-name">Name</label>
      <input type="text" id="s-name" maxlength="20" value="${esc(p.name)}" autocomplete="off">
      <label>Picture</label>
      <div class="emoji-grid">${AVATARS.map(a => `<button type="button" data-a="${a}" class="${a === p.avatar ? 'on' : ''}">${a}</button>`).join('')}</div>
    </div>
    <h3 style="margin:20px 0 4px">Daily goal</h3>
    <div class="chips" style="margin:8px 0 6px">${GOALS.map(g => `<button type="button" class="chip ${g === (p.settings.goal || 10) ? 'on' : ''}" data-goal="${g}">${g} min</button>`).join('')}</div>
    <p class="muted small" style="margin-bottom:14px">Practice this much each day to keep your streak going.</p>
    <h3 style="margin:20px 0 4px">Keyboard guide</h3>
    <div class="radio-group">
      ${radio('guide', 'full', 'Full guide', 'Colored fingers, hands, and the next key lit up. Best while learning.')}
      ${radio('guide', 'hint', 'Next key only', 'Just the next key lights up.')}
      ${radio('guide', 'off', 'No guide', 'Nothing to peek at. For when your fingers know the way.')}
    </div>
    <label class="check"><input type="checkbox" id="s-fade" ${p.settings.fade !== false ? 'checked' : ''}>
      <span><b>Fade the guide for keys I know</b><small>Once you rarely miss a key, it stops lighting up. Pause on it, or miss it, and the hint comes back.</small></span></label>
    <label class="check"><input type="checkbox" id="s-ghost" ${p.settings.ghost !== false ? 'checked' : ''}>
      <span><b>Race my best on passages 👻</b><small>When you retype a passage, a faint cursor shows where your best run was at that moment.</small></span></label>
    <h3 style="margin:4px 0 4px">When I press the wrong key</h3>
    <div class="radio-group">
      ${radio('errorMode', 'stop', 'Stop until I fix it', 'You can\'t go on until you press the right key. Builds accuracy.')}
      ${radio('errorMode', 'continue', 'Keep going', 'Mistakes are marked in red; use Backspace to fix them.')}
    </div>
    <h3 style="margin:4px 0 4px">Backup</h3>
    <p class="muted small" style="margin-bottom:10px;line-height:1.5">Progress is saved only in this browser. A backup file keeps everyone's progress safe and lets you move it to another computer.
      ${state.lastBackup ? `Last backup: ${esc(fmtDay(state.lastBackup))}.` : 'No backup yet.'}</p>
    <div class="btn-row" style="margin-bottom:22px"><button class="btn ghost" id="s-backup">💾 Save a backup file</button><button class="btn ghost" id="s-restore">Restore from a file</button></div>
    <div class="btn-row" style="justify-content:space-between">
      <div class="btn-row"><button class="btn" id="s-save">Save</button><button class="btn ghost" id="s-cancel">Cancel</button></div>
      <button class="btn danger" id="s-delete">Remove ${esc(p.name)}</button>
    </div>`, [], ov => {
    let avatar = p.avatar, goal = p.settings.goal || 10;
    $$('.emoji-grid button', ov).forEach(b => b.onclick = () => { avatar = b.dataset.a; $$('.emoji-grid button', ov).forEach(x => x.classList.toggle('on', x === b)); });
    $$('[data-goal]', ov).forEach(b => b.onclick = () => { goal = +b.dataset.goal; $$('[data-goal]', ov).forEach(x => x.classList.toggle('on', x === b)); });
    $('#s-cancel', ov).onclick = closeModal;
    $('#s-backup', ov).onclick = () => { backupNow(); closeModal(); };
    $('#s-restore', ov).onclick = () => { closeModal(); restorePick(); };
    $('#s-save', ov).onclick = () => {
      p.name = $('#s-name', ov).value.trim() || p.name;
      p.avatar = avatar;
      p.settings.goal = goal;
      p.settings.guide = $('input[name=guide]:checked', ov).value;
      p.settings.fade = $('#s-fade', ov).checked;
      p.settings.ghost = $('#s-ghost', ov).checked;
      p.settings.errorMode = $('input[name=errorMode]:checked', ov).value;
      save(); closeModal(); go('home');
    };
    $('#s-delete', ov).onclick = () => openModal(`<h2>Remove ${esc(p.name)}?</h2>
      <p class="muted" style="margin:10px 0 18px;line-height:1.55">This deletes ${esc(p.name)}'s lessons, scores and history on this computer. It can't be undone.</p>`,
      [{ label: `Remove ${p.name}`, style: 'danger', action: () => {
        state.profiles = state.profiles.filter(x => x !== p);
        state.current = null; save(); go('profiles');
      } }, { label: 'Keep', style: 'ghost' }]);
  });
}

// ── Start ──────────────────────────────────────────────────────────────────
$$('[data-go]').forEach(b => b.onclick = () => go(b.dataset.go));
$('#btn-me').onclick = () => go('profiles');
$('#btn-settings').onclick = openSettings;
$('#btn-sound').onclick = () => {
  const p = me();
  if (!p) return;
  p.settings.sound = !Sound.on();
  save(); paintSoundBtn();
  Sound.click();
};
// Top-bar buttons give focus back after a click, so Space or Enter during a
// run types instead of pressing the button again.
$('#topbar').addEventListener('click', e => e.target.closest('button')?.blur());
if (matchMedia('(hover: none) and (pointer: coarse)').matches) $('#touch-note').hidden = false;

(async () => {
  // Ask any older tab to save and step aside, then give it a moment to write.
  if (tabChannel) { claimTab(); await new Promise(r => setTimeout(r, 200)); }
  const saved = await Store.load();
  if (saved?.profiles) { state = saved; state.profiles.forEach(normalizeProfile); }
  navigator.storage?.persist?.().catch(() => {});
  if ('serviceWorker' in navigator && location.protocol !== 'file:') navigator.serviceWorker.register('sw.js').catch(() => {});
  if (!state.profiles.length) go('addProfile');
  else if (me()) go('home');
  else go('profiles');
})();

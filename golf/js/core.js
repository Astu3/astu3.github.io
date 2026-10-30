// Golf Improvement App — Auth, storage, shared helpers (toasts, escaping, dates), XP tiers and navigation.
// Classic script: shares globals with the other files; load order is set in golf-improvement-app.html.

// ════════════════════════════════════════════════════════════
// GOOGLE AUTH CONFIG
// Paste your Google Client ID here after setting it up.
// See instructions at the bottom of the page after login.
// ════════════════════════════════════════════════════════════
const GOOGLE_CLIENT_ID = ''; // <-- paste your Client ID here

// ════════════════════════════════════════════════════════════
// AUTH STATE
// ════════════════════════════════════════════════════════════
let currentUser = null; // { sub, name, email, picture }

function parseJwt(token) {
  try {
    const base64 = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
    return JSON.parse(atob(base64));
  } catch { return null; }
}

function handleCredentialResponse(response) {
  const payload = parseJwt(response.credential);
  if (!payload) return;
  currentUser = { sub: payload.sub, name: payload.name, email: payload.email, picture: payload.picture };
  localStorage.setItem('golf_current_user', JSON.stringify(currentUser));
  onUserLoggedIn();
}

function onUserLoggedIn() {
  // Update header
  document.getElementById('user-avatar').src     = currentUser.picture || '';
  document.getElementById('user-name').textContent = currentUser.name.split(' ')[0];
  document.getElementById('user-area').style.display = 'flex';

  // Hide login overlay
  document.getElementById('login-overlay').classList.remove('show');

  // Render app
  updateXPHeader();
  renderDashboard();
  checkBadges(getAllRounds());
  sgLoadDraft();
  apexLoad();
}

function signOut() {
  currentUser = null;
  localStorage.removeItem('golf_current_user');
  document.getElementById('user-area').style.display = 'none';
  document.getElementById('login-overlay').classList.add('show');
  if (typeof google !== 'undefined') {
    google.accounts.id.disableAutoSelect();
  }
}

function initAuth() {
  // Restore session from localStorage
  try {
    const saved = localStorage.getItem('golf_current_user');
    if (saved) {
      currentUser = JSON.parse(saved);
      onUserLoggedIn();
      return;
    }
  } catch {}

  // Show login overlay
  document.getElementById('login-overlay').classList.add('show');

  if (!GOOGLE_CLIENT_ID) {
    document.getElementById('no-client-msg').style.display = 'block';
    return;
  }

  // Wait for Google library to load then initialize
  const tryInit = () => {
    if (typeof google === 'undefined') { setTimeout(tryInit, 200); return; }
    google.accounts.id.initialize({
      client_id: GOOGLE_CLIENT_ID,
      callback: handleCredentialResponse,
      auto_select: false,
    });
    google.accounts.id.renderButton(
      document.getElementById('google-btn-wrap'),
      { theme: 'outline', size: 'large', text: 'sign_in_with', shape: 'pill', width: 260 }
    );
  };
  tryInit();
}

// ════════════════════════════════════════════════════════════
// DATA LAYER  (all keys scoped to the logged-in user's Google ID)
// ════════════════════════════════════════════════════════════
// Every stored item, in one place. Keys are prefixed per signed-in user by uk().
// Export/import (backup.js) copies every key containing "golf".
const KEYS = {
  rounds:   'golf_rounds_v1',
  profile:  'golf_profile_v2',
  tasks:    'golf_tasks_v2',
  badges:   'golf_badges_v2',
  quests:   'golf_quests_v1',
  putting:  'golf_putting_v1',
  courses:  'golf_courses_v1',
  goals:    'golf_goals_v1',
  sgRounds: 'golf_sg_rounds_v1',
  sgDraft:  'golf_sg_draft_v1',
  speed:    'golf_speed_v1',
  speedSettings: 'golf_speed_settings',
  speedPlan:   'golf_speed_plan_v1',   // completed sessions per training program
  speedCustom: 'golf_speed_custom_v1', // the user's custom session sets
  range:    'golf_range_v1',           // R10 driving-range shots
  prefs:    'golf_prefs_v1',           // speed unit, last range club, Apex tees
  apexRounds: 'golf_apex_rounds_v1',   // finished Apex (virtual) rounds
  apexDraft:  'golf_apex_draft_v1',    // Apex round in progress
  apexChallenges: 'golf_apex_challenges_v1', // best result per Apex challenge
  speedProfile: 'golf_speed_profile_v1', // baseline tests and progress checks
  activity:    'golf_activity_v1',
  coach:       'golf_coach_v1',         // improvement coach: profile, goal, snapshots over time
  plan:        'golf_plan_v1',           // this week's practice plan (and past weeks' results)
  coachTests:  'golf_coach_tests_v1',   // putting and short-game assessment tests      // practice days by type (for days with no other dated record)
  drills:      'golf_drills_v1',        // drill history, personal bests and last setups
  wedgeMatrix: 'golf_wedge_matrix_v1',  // wedge shots by club and swing length
  drillDraft:  'golf_drill_draft_v1',   // drill in progress
};

// ── Preferences + speed units (speeds are stored in mph, shown in the chosen unit)
function getPrefs()          { return loadData(KEYS.prefs, {}); }
function setPref(key, value) { saveData(KEYS.prefs, { ...getPrefs(), [key]: value }); }
const MPH_TO_KMH = 1.609344;
function speedUnit()  { return getPrefs().speedUnit === 'kmh' ? 'kmh' : 'mph'; }
function unitLabel()  { return speedUnit() === 'kmh' ? 'km/h' : 'mph'; }
function toUnit(mph)  { if (mph === null || mph === undefined) return null; return Math.round((speedUnit() === 'kmh' ? mph * MPH_TO_KMH : mph) * 10) / 10; }
function fromUnit(v)  { return speedUnit() === 'kmh' ? v / MPH_TO_KMH : v; }

function uk(base) {
  // Prefix key with user's Google sub so each account has separate data
  return currentUser ? `${currentUser.sub}_${base}` : base;
}

// Newest first by play date (then by entry time), so a back-dated round lands
// in the right place for the handicap window, charts and history.
function byDateDesc(a, b) { return (b.date || '').localeCompare(a.date || '') || (b.id - a.id); }
// Read/write a stored JSON value; unreadable or missing data gives the fallback
function loadData(key, fallback) {
  try { return JSON.parse(store.getItem(uk(key))) ?? fallback; }
  catch { return fallback; }
}
// Saves never fail silently: if the browser's storage is full, older bulk data is
// compacted (oldest range shots, wedge shots, swing-by-swing detail of old speed
// sessions) and the save is retried; if it still won't fit, you're told to export a backup.
function saveData(key, value) {
  const json = JSON.stringify(value);
  try { store.setItem(uk(key), json); }
  catch (e) {
    if (!storageCompact() ) { showToast('⚠️ Storage is full — export a backup (Dashboard › Backup) and clear old range data'); console.error(e); return false; }
    // if the bulk history is what's being saved, save it trimmed too (else the retry undoes the trim)
    const cap = { [KEYS.range]: 2500, [KEYS.wedgeMatrix]: 600 }[key];
    const retry = cap && Array.isArray(value) && value.length > cap ? JSON.stringify(value.slice(0, cap)) : json;
    try { store.setItem(uk(key), retry); }
    catch (e2) { showToast('⚠️ Storage is full — export a backup (Dashboard › Backup) and clear old range data'); console.error(e2); return false; }
  }
  dataChanged();
  return true;
}
// Free space by trimming the bulkiest history; returns true if anything was trimmed
function storageCompact() {
  let freed = false;
  const put = (k, v) => { try { store.setItem(uk(k), JSON.stringify(v)); return true; } catch { return false; } }; // compaction must never throw
  const trim = (k, n) => { const v = loadData(k, null); if (Array.isArray(v) && v.length > n && put(k, v.slice(0, n))) freed = true; };
  trim(KEYS.range, 2500); trim(KEYS.wedgeMatrix, 600);
  const ss = loadData(KEYS.speed, null);
  if (Array.isArray(ss) && ss.length > 40) { // keep each old session's bests, drop its swing-by-swing detail
    let slim = false;
    ss.slice(40).forEach(s => { if (s.swings && s.swings.length) { const best = {}; s.swings.forEach(w => { if (w.warmup) return; const k = `${w.tool}|${w.drill || 'normal'}`; if (!best[k] || w.mph > best[k].mph) best[k] = { ...w, rep: 1 }; }); if (Object.keys(best).length < s.swings.length) slim = true; s.swings = Object.values(best); } });
    if (slim && put(KEYS.speed, ss)) freed = true;
  }
  if (freed) { dataChanged(); showToast('🧹 Storage nearly full — trimmed the oldest range and practice detail'); }
  return freed;
}
// A counter that changes whenever saved data changes: derived stats are cached against it
let dataVersion = 0;
function dataChanged() { dataVersion++; }
function memo(name, fn) {
  const c = memo.cache[name];
  if (c && c.v === dataVersion && c.u === (typeof currentUser !== 'undefined' && currentUser ? currentUser.email : '')) return c.value;
  const value = fn();
  memo.cache[name] = { v: dataVersion, u: typeof currentUser !== 'undefined' && currentUser ? currentUser.email : '', value };
  return value;
}
memo.cache = {};

// Scorecard rounds only — use for saving, editing and deleting them
function getRounds()      { return loadData(KEYS.rounds, []).sort(byDateDesc); }
// Every round that counts: scorecard rounds plus completed shot-by-shot rounds.
// Use this for anything read-only (handicap, stats, history, badges, quests).
function getAllRounds() {
  const sg = getSGRounds().map(sgToRound).filter(Boolean);
  return [...loadData(KEYS.rounds, []), ...sg].sort(byDateDesc);
}
function saveRounds(r)    { saveData(KEYS.rounds, r); }
function getProfile()     { return loadData(KEYS.profile, { totalXP: 0 }); }
function saveProfile(p)   { saveData(KEYS.profile, p); }
function getTaskState()   { return loadData(KEYS.tasks, {}); }
function saveTaskState(t) { saveData(KEYS.tasks, t); }
function getBadgeState()  { return loadData(KEYS.badges, []); }
function saveBadgeState(b){ saveData(KEYS.badges, b); }

// ════════════════════════════════════════════════════════════
// TOAST & HELPERS
// ════════════════════════════════════════════════════════════
// Toasts are queued so a burst (round XP + badge + quest) shows every message
const toastQueue = [];
let toastBusy = false;
function showToast(msg) {
  toastQueue.push(msg);
  if (!toastBusy) nextToast();
}
function nextToast() {
  const t = document.getElementById('toast');
  const msg = toastQueue.shift();
  if (msg === undefined) { toastBusy = false; return; }
  toastBusy = true;
  t.textContent = msg;
  t.classList.add('show');
  setTimeout(() => {
    t.classList.remove('show');
    setTimeout(nextToast, 350); // let the slide-out finish
  }, toastQueue.length ? 2200 : 3000);
}

// Score relative to par: "+5", "E", "-2"; and the matching score-chip class
function toPar(score, par)      { const d = score - par; return d === 0 ? 'E' : d > 0 ? `+${d}` : `${d}`; }
function toParClass(score, par) { const d = score - par; return d < 0 ? 'under' : d === 0 ? 'even' : 'over'; }
// Signed number for strokes gained: "+1.2", "-0.4"
function signed(v, digits = 1)  { return (v >= 0 ? '+' : '') + v.toFixed(digits); }

// Escape user-entered text (course names, notes) before putting it in innerHTML
function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));
}

function avg(arr, fn) {
  if (!arr.length) return 0;
  return Math.round(arr.reduce((s,x) => s+fn(x), 0) / arr.length);
}

function todayISO() {
  // Local date (not UTC) so late-evening rounds log on the correct calendar day
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

function formatDate(iso) {
  const d = new Date(iso + 'T12:00:00');
  return d.toLocaleDateString('en-US', { month:'short', day:'numeric', year:'numeric' });
}

// ════════════════════════════════════════════════════════════
// TIER SYSTEM
// ════════════════════════════════════════════════════════════
const TIERS = [
  { name: 'Rookie',       xp: 0     },
  { name: 'Novice',       xp: 500   },
  { name: 'Amateur',      xp: 1200  },
  { name: 'Club Pro',     xp: 2500  },
  { name: 'Local Legend', xp: 4500  },
  { name: 'State Champ',  xp: 7500  },
  { name: 'National',     xp: 12000 },
  { name: 'Elite',        xp: 18000 },
  { name: 'World Class',  xp: 26000 },
  { name: 'Tour Pro',     xp: 36000 },
];

function getTierInfo(totalXP) {
  let tier = 0;
  for (let i = 0; i < TIERS.length; i++) {
    if (totalXP >= TIERS[i].xp) tier = i;
  }
  const current = TIERS[tier];
  const next    = TIERS[tier + 1];
  const pct = next
    ? Math.min(100, Math.round((totalXP - current.xp) / (next.xp - current.xp) * 100))
    : 100;
  const toNext = next ? (next.xp - totalXP) : 0;
  return { tier: tier + 1, name: current.name, pct, toNext, nextName: next?.name };
}

function updateXPHeader() {
  const profile = getProfile();
  const info = getTierInfo(profile.totalXP);
  document.getElementById('tier-badge').textContent   = info.name;
  document.getElementById('xp-label').textContent     = profile.totalXP.toLocaleString() + ' XP';
  document.getElementById('xp-next-label').textContent = info.toNext ? info.toNext.toLocaleString() + ' to next' : 'MAX TIER';
  document.getElementById('xp-bar-fill').style.width  = info.pct + '%';
}

// ════════════════════════════════════════════════════════════
// XP CALCULATION
// ════════════════════════════════════════════════════════════
function calcRoundXP(holes) {
  let xp = 0;
  for (const h of holes) {
    const rel = h.score - h.par;
    if      (rel <= -3) xp += 100; // albatross
    else if (rel === -2) xp += 50; // eagle
    else if (rel === -1) xp += 25; // birdie
    else if (rel ===  0) xp += 12; // par
    else if (rel ===  1) xp += 5;  // bogey
    else if (rel ===  2) xp += 2;  // double
    // triple+ = 0
  }
  // Round completion bonus based on total score vs par
  const totalScore = holes.reduce((s,h) => s+h.score, 0);
  const totalPar   = holes.reduce((s,h) => s+h.par, 0);
  const diff = totalScore - totalPar;
  if      (diff < 0)  xp += 60;
  else if (diff === 0) xp += 35;
  else if (diff <= 5)  xp += 20;
  else if (diff <= 10) xp += 10;
  else                 xp += 5;

  return xp;
}

function awardXP(amount, reason) {
  const profile = getProfile();
  const oldTier = getTierInfo(profile.totalXP).tier;
  profile.totalXP += amount;
  const newTier = getTierInfo(profile.totalXP).tier;
  saveProfile(profile);
  updateXPHeader();
  // XP from any source (SG rounds, speed sessions, putting) can unlock XP/tier badges
  checkBadges(getAllRounds());

  if (newTier > oldTier) {
    const info = getTierInfo(profile.totalXP);
    setTimeout(() => showToast(`🏆 TIER UP! You reached ${info.name}!`), 800);
  }
}

// ════════════════════════════════════════════════════════════
// NAVIGATION
// ════════════════════════════════════════════════════════════
const PAGE_NAMES = ['dashboard','coach','new-round','sg-round','history','clubs','speed','apex','practice','badges','quests','putting'];

// Tab-bar navigation. Clears transient view state that would otherwise leak:
// an unsaved edit (so "New Round" can't silently overwrite an old round) and
// the SG summary being viewed (so the SG tab opens on its round list).
function navTo(name) {
  if (editingRoundId !== null && name !== 'new-round') {
    editingRoundId = null;
    setEditUIMode(false);
    resetScorecard();
  }
  if (name === 'sg-round') sgViewId = null;
  showPage(name);
}

function showPage(name) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('nav button').forEach(b => b.classList.remove('active'));
  document.getElementById('page-' + name).classList.add('active');
  const idx = PAGE_NAMES.indexOf(name);
  document.querySelectorAll('nav button')[idx].classList.add('active');
  if (name === 'dashboard') renderDashboard();
  if (name === 'history')   renderHistory();
  if (name === 'practice')  renderPractice();
  if (name === 'badges')    renderBadges();
  if (name === 'quests')    renderQuests();
  if (name === 'putting')   renderPutting();
  if (name === 'sg-round')  renderSGRound();
  if (name === 'clubs')     renderClubs();
  if (name === 'speed')     renderSpeed();
  if (name === 'coach')     renderCoach();
  if (name === 'apex')      renderApex();
}

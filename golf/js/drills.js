// Golf Improvement App — Drills: Combine, target practice, wedge matrix, fairway finder,
// range games (Bullseye, Closest to the Pin, Capture the Flag, Long Drive, Ladder) and the 9-shot drill.
// Classic script: shares globals with the other files; load order is set in golf-improvement-app.html.

// ════════════════════════════════════════════════════════════
// DRILLS
// Every drill takes the same input: an R10 shot (or, without one, a test shot
// simulated from your club numbers), turned into carry, landing offline,
// total and finishing offline by the ball-flight model. Targets are scored
// where the ball lands (how a launch monitor judges approach shots); fairway
// and long-drive tests use where it finishes. Offline: + = right of the line.
// One drill runs at a time; it's saved after every shot, so a refresh resumes it.
// ════════════════════════════════════════════════════════════
let drill;                // active drill (undefined until loaded, null when none)
let drillLastResult = null; // message for the shot just played

const DRILL_WEDGES = ['9-Iron', 'PW', 'GW', 'SW', 'LW'];
const DRILL_SWINGS = { half: { name: '½ swing', power: 66 }, threeq: { name: '¾ swing', power: 84 }, full: { name: 'Full', power: 100 } };
const DRILL_COMBINE_TARGETS = [60, 70, 80, 90, 100, 120, 140, 160, 180, 'Driver'];

function getDrillData()      { return loadData(KEYS.drills, { history: {}, best: {} }); }
function saveDrillData(d)    { saveData(KEYS.drills, d); }
function getWedgeShots()     { return loadData(KEYS.wedgeMatrix, []); }
function saveWedgeShots(s)   { saveData(KEYS.wedgeMatrix, s); }
function drillSave()         { if (drill) saveData(KEYS.drillDraft, drill); else store.removeItem(uk(KEYS.drillDraft)); }
function drillLoad()         { if (drill === undefined) drill = loadData(KEYS.drillDraft, null); return drill; }
function drillActive()       { return !!drillLoad() && drill.phase === 'play'; }

// ── Scoring ────────────────────────────────────────────────────
const drillClamp01 = v => Math.max(0, Math.min(1, v));
// 0–100 for a target shot: the miss allowed grows with distance (a 10-yard miss is fine from 180, poor from 60)
function drillScore(dist, miss) { return Math.max(0, Math.round(100 - 100 * miss / (0.4 * dist + 6))); }
// Driver: distance and accuracy together (out past ~12 yds offline starts to cost)
function drillDriverScore(s) {
  return Math.round(100 * drillClamp01((s.total - 180) / 130) * drillClamp01(1 - Math.max(0, Math.abs(s.totalOff) - 12) / 38));
}
// Rough handicap equivalent of a Combine average (a guide, not an official measure)
function drillCombineHandicap(avg) {
  const T = [[92, -4], [84, 0], [74, 5], [64, 10], [55, 15], [47, 20], [39, 25], [30, 30], [0, 40]];
  for (let i = 0; i < T.length - 1; i++) {
    const [s0, h0] = T[i], [s1, h1] = T[i + 1];
    if (avg >= s1) return Math.round(h0 + (h1 - h0) * (s0 - Math.min(avg, s0)) / (s0 - s1));
  }
  return 40;
}

// ── Shots ──────────────────────────────────────────────────────
// launch: { ballMph, launch, direction, spin, spinAxis } → everything the drills need
function drillProcess(launch, club, sim) {
  const f = simulateShot({ ballMph: launch.ballMph, launch: launch.launch, direction: launch.direction || 0,
                           spin: launch.spin || 0, spinAxis: launch.spinAxis || 0 }, 'fairway');
  const r1 = v => Math.round(v * 10) / 10;
  return { at: Date.now(), club, sim: !!sim, ballMph: launch.ballMph, clubMph: launch.clubMph ?? null,
    launch: launch.launch, spin: launch.spin, spinAxis: launch.spinAxis || 0, direction: launch.direction || 0,
    carry: r1(f.carry), carryOff: r1(f.offline), total: r1(f.total), totalOff: r1(f.totalOffline), apexFt: Math.round(f.apexFt) };
}
// Where a shot landed relative to a target `dist` yards out, `side` yards off the line
function drillMiss(s, dist, side = 0) {
  const long = s.carry - dist, off = s.carryOff - side;
  return { long, off, miss: Math.hypot(long, off) };
}
const drillFmtMiss = m => `${Math.round(m.miss)} yds — ${Math.abs(m.long) < 1 ? 'pin high' : `${Math.round(Math.abs(m.long))} ${m.long > 0 ? 'long' : 'short'}`}, ${Math.abs(m.off) < 1 ? 'on line' : `${Math.round(Math.abs(m.off))} ${m.off > 0 ? 'right' : 'left'}`}`;

// Club suggestion for a distance, from your range averages where you have them
function drillClubCarry(club) {
  const mine = getRangeShots().filter(s => s.club === club && s.carry);
  if (mine.length >= 3) return mine.reduce((a, s) => a + s.carry, 0) / mine.length;
  return ceClubDistance(ceClubProfile(club, bagProfileShots())).carry;
}
function drillSuggestClub(dist) {
  const clubs = RANGE_CLUBS.filter(c => c !== 'Driver');
  let pick = clubs[clubs.length - 1];
  for (const c of clubs) if (drillClubCarry(c) >= dist * 0.97) pick = c; // shortest club that still gets there
  const swing = drillSwingFor(pick, dist);
  return { club: pick, swing, text: `${pick}${swing === 'full' ? '' : ' · ' + DRILL_SWINGS[swing].name}` };
}

// ── The drills ─────────────────────────────────────────────────
// Each drill: name, icon, blurb, options (setup form), start(opts) → state, now(state) → the current
// shot's setup, shot(state, s) → result message (updates state), done(state), summary(state) → HTML,
// field(state) → top-down view (or null), players: true for hot-seat games
const drillRand = (lo, hi, step = 5) => lo + Math.floor(Math.random() * ((hi - lo) / step + 1)) * step;
const drillPlayerOpt = { key: 'players', label: 'Players (comma separated)', type: 'text', def: 'You' };

const DRILLS = {
  combine: {
    name: 'Combine', icon: '🏆', blurb: 'The benchmark test: three shots at each of 60–180 yards plus driver, scored 0–100. Rerun it monthly to track progress.',
    options: [{ key: 'full', label: 'Length', type: 'choice', choices: [[false, 'Quick · 30 shots'], [true, 'Full · 60 shots']], def: false }],
    start: o => ({ seq: [...Array(o.full ? 2 : 1)].flatMap(() => DRILL_COMBINE_TARGETS.flatMap(t => [t, t, t])), i: 0, results: [] }),
    now: st => {
      const t = st.seq[st.i], k = st.i % 3 + 1, n = DRILL_COMBINE_TARGETS.indexOf(t) + 1;
      return t === 'Driver'
        ? { title: `Driver · shot ${k} of 3`, sub: 'Distance and accuracy both count: keep it within 12 yards of the line.', club: 'Driver', swing: 'full' }
        : { title: `${t} yards · shot ${k} of 3`, sub: `Target ${n} of 10 · scored on where the ball lands`, dist: t, ...drillSuggestClub(t) };
    },
    shot: (st, s) => {
      const t = st.seq[st.i++];
      if (t === 'Driver') { const sc = drillDriverScore(s); st.results.push({ t, score: sc, total: s.total, off: s.totalOff }); return { ok: sc >= 60, text: `${sc} pts · ${Math.round(s.total)} yds, ${fmtOff(s.totalOff)}` }; }
      const m = drillMiss(s, t), sc = drillScore(t, m.miss);
      st.results.push({ t, score: sc, miss: m.miss });
      return { ok: sc >= 70, text: `${sc} pts · ${drillFmtMiss(m)}` };
    },
    done: st => st.i >= st.seq.length,
    field: st => { const t = st.seq[Math.min(st.i, st.seq.length - 1)];
      return t === 'Driver' ? { max: 300, corridor: { width: 24 }, useTotal: true }
                            : { max: Math.max(120, t * 1.25), targets: [{ d: t, x: 0, r: 0.1 * t + 2, active: true }] }; },
  },
  target: {
    name: 'Target Practice', icon: '🎯', blurb: 'Pick a distance — or let it pick random ones — and see exactly how far, long/short and left/right you miss. Shots feed your wedge matrix.',
    options: [
      { key: 'mode', label: 'Targets', type: 'choice', choices: [['fixed', 'One distance'], ['random', 'Random']], def: 'random' },
      { key: 'dist', label: 'Distance (yds)', type: 'number', def: 100, min: 20, max: 250, when: o => o.mode === 'fixed' },
      { key: 'lo', label: 'Random from (yds)', type: 'number', def: 40, min: 20, max: 240, when: o => o.mode === 'random' },
      { key: 'hi', label: 'to (yds)', type: 'number', def: 130, min: 30, max: 250, when: o => o.mode === 'random' },
      { key: 'n', label: 'Shots', type: 'choice', choices: [[10, '10'], [20, '20'], [30, '30']], def: 10 },
    ],
    start: o => ({ n: o.n, i: 0, results: [], dist: o.mode === 'fixed' ? o.dist : drillRand(Math.min(o.lo, o.hi), Math.max(o.lo, o.hi)) }),
    now: st => ({ title: `${st.dist} yards · shot ${st.i + 1} of ${st.n}`, sub: 'Scored on where the ball lands', dist: st.dist, ...drillSuggestClub(st.dist) }),
    shot: (st, s, o) => {
      const m = drillMiss(s, st.dist), sc = drillScore(st.dist, m.miss);
      st.results.push({ t: st.dist, score: sc, miss: m.miss, long: m.long, off: m.off });
      st.i++;
      if (o.mode === 'random') st.dist = drillRand(Math.min(o.lo, o.hi), Math.max(o.lo, o.hi));
      return { ok: sc >= 70, text: `${sc} pts · ${drillFmtMiss(m)}` };
    },
    done: st => st.i >= st.n,
    field: st => ({ max: Math.max(120, st.dist * 1.25), targets: [{ d: st.dist, x: 0, r: 0.1 * st.dist + 2, active: true }] }),
  },
  wedges: {
    name: 'Wedge Matrix', icon: '📐', blurb: 'Hit each wedge with a ½, ¾ and full swing to build your carry chart — the numbers you need inside 120 yards.',
    options: [
      { key: 'clubs', label: 'Clubs', type: 'multi', choices: DRILL_WEDGES, def: ['PW', 'GW', 'SW', 'LW'] },
      { key: 'per', label: 'Shots per cell', type: 'choice', choices: [[3, '3'], [5, '5']], def: 3 },
    ],
    start: o => ({ seq: (o.clubs.length ? o.clubs : ['SW']).flatMap(c => ['half', 'threeq', 'full'].flatMap(w => Array(o.per).fill([c, w]))), i: 0, results: [] }),
    now: (st, o) => { const [c, w] = st.seq[st.i], k = st.i % o.per + 1;
      return { title: `${c} · ${DRILL_SWINGS[w].name} · shot ${k} of ${o.per}`, sub: 'Swing at a steady, repeatable length — only carry matters here.', club: c, swing: w, lockClub: true }; },
    shot: (st, s) => { const [c, w] = st.seq[st.i++]; st.results.push({ club: c, swing: w, carry: s.carry, total: s.total });
      return { ok: true, text: `${c} ${DRILL_SWINGS[w].name}: ${Math.round(s.carry)} yds carry, ${Math.round(s.total)} total` }; },
    done: st => st.i >= st.seq.length,
    field: () => null,
  },
  fairway: {
    name: 'Fairway Finder', icon: '🛣️', blurb: 'A round’s worth of drives at a real fairway: fairways hit, distance and your miss pattern.',
    options: [
      { key: 'n', label: 'Drives', type: 'choice', choices: [[10, '10'], [14, '14 (a round)']], def: 14 },
      { key: 'width', label: 'Fairway width', type: 'choice', choices: [[25, '25 yds (tight)'], [32, '32 yds'], [40, '40 yds (wide)']], def: 32 },
      { key: 'club', label: 'Club', type: 'club', def: 'Driver' },
    ],
    start: o => ({ n: o.n, i: 0, results: [] }),
    now: (st, o) => ({ title: `Drive ${st.i + 1} of ${st.n}`, sub: `Finish in the ${o.width}-yard fairway`, club: o.club, swing: 'full' }),
    shot: (st, s, o) => { const fw = Math.abs(s.totalOff) <= o.width / 2; st.i++;
      st.results.push({ fw, total: s.total, carry: s.carry, off: s.totalOff });
      return { ok: fw, text: `${fw ? 'Fairway' : `Missed ${s.totalOff > 0 ? 'right' : 'left'}`} · ${Math.round(s.total)} yds, ${fmtOff(s.totalOff)}` }; },
    done: st => st.i >= st.n,
    field: (st, o) => ({ max: 320, corridor: { width: o.width }, useTotal: true }),
  },
  bullseye: {
    name: 'Bullseye', icon: '🔴', blurb: 'A new target every shot with scoring rings: 10 for the bull, then 6, 3 and 1. Highest total wins.', players: true,
    options: [{ key: 'n', label: 'Shots each', type: 'choice', choices: [[6, '6'], [8, '8'], [10, '10']], def: 8 }, drillPlayerOpt],
    start: (o, P) => ({ targets: [...Array(o.n)].map(() => drillRand(50, 170)), i: 0, points: P.map(() => 0), results: [] }),
    now: (st, o, P) => { const t = st.targets[Math.floor(st.i / P.length)];
      return { title: `${t} yards · target ${Math.floor(st.i / P.length) + 1} of ${o.n}`, sub: 'Rings: 10 · 6 · 3 · 1', dist: t, ...drillSuggestClub(t) }; },
    shot: (st, s, o, P) => {
      const p = st.i % P.length, t = st.targets[Math.floor(st.i / P.length)], m = drillMiss(s, t);
      const pts = drillRings(t).find(r => m.miss <= r.r)?.pts || 0;
      st.points[p] += pts; st.results.push({ p, t, miss: m.miss, pts }); st.i++;
      return { ok: pts >= 3, text: `${pts} point${pts === 1 ? '' : 's'} · ${drillFmtMiss(m)}` };
    },
    done: (st, o, P) => st.i >= o.n * P.length,
    field: (st, o, P) => { const t = st.targets[Math.min(o.n - 1, Math.floor(st.i / P.length))];
      return { max: Math.max(120, t * 1.25), targets: [{ d: t, x: 0, rings: drillRings(t), active: true }] }; },
  },
  ctp: {
    name: 'Closest to the Pin', icon: '📍', blurb: 'Three balls each at a new flag every round; your best ball counts. Lowest total distance wins.', players: true,
    options: [{ key: 'rounds', label: 'Rounds', type: 'choice', choices: [[3, '3'], [5, '5']], def: 3 }, drillPlayerOpt],
    start: (o, P) => ({ targets: [...Array(o.rounds)].map(() => drillRand(60, 180)), i: 0, best: P.map(() => []), results: [] }),
    now: (st, o, P) => { const per = P.length * 3, r = Math.floor(st.i / per), t = st.targets[r];
      return { title: `${t} yards · round ${r + 1} of ${o.rounds} · ball ${st.i % 3 + 1} of 3`, sub: 'Best of three counts', dist: t, ...drillSuggestClub(t) }; },
    shot: (st, s, o, P) => {
      const per = P.length * 3, r = Math.floor(st.i / per), p = Math.floor((st.i % per) / 3), t = st.targets[r], m = drillMiss(s, t);
      st.best[p][r] = Math.min(st.best[p][r] ?? Infinity, m.miss); st.results.push({ p, t, miss: m.miss }); st.i++;
      return { ok: m.miss <= st.best[p][r] + 0.01, text: `${drillFmtMiss(m)}${m.miss <= st.best[p][r] + 0.01 ? ' · best so far' : ''}` };
    },
    done: (st, o, P) => st.i >= o.rounds * P.length * 3,
    field: (st, o, P) => { const t = st.targets[Math.min(o.rounds - 1, Math.floor(st.i / (P.length * 3)))];
      return { max: Math.max(120, t * 1.25), targets: [{ d: t, x: 0, r: 3, active: true }] }; },
  },
  ctf: {
    name: 'Capture the Flag', icon: '🚩', blurb: 'Two or more players. Pick a flag and hit — closest ball captures it, and flags can be stolen back. Most flags wins.', players: true, minPlayers: 2,
    options: [{ key: 'turns', label: 'Shots each', type: 'choice', choices: [[6, '6'], [9, '9']], def: 6 }, { ...drillPlayerOpt, def: 'Player 1, Player 2' }],
    start: () => ({ flags: [[60, -14], [85, 12], [110, -8], [135, 16], [160, -18], [185, 6]].map(([d, x]) => ({ d, x, owner: null, miss: null })), sel: 2, i: 0, results: [] }),
    now: (st, o, P) => { const f = st.flags[st.sel];
      return { title: `${P[st.i % P.length]} · flag ${st.sel + 1}: ${f.d} yds ${f.x ? `(${Math.abs(f.x)} ${f.x > 0 ? 'right' : 'left'})` : ''}`, sub: f.owner === null ? 'Unclaimed — any ball on the range takes it' : `Held by ${P[f.owner]} at ${Math.round(f.miss)} yds — beat it to steal`, dist: f.d, ...drillSuggestClub(f.d), pickFlag: true }; },
    shot: (st, s, o, P) => {
      const p = st.i % P.length, f = st.flags[st.sel], m = drillMiss(s, f.d, f.x); st.i++;
      st.results.push({ p, t: f.d, miss: m.miss });
      if (f.owner === null || m.miss < f.miss) { const stole = f.owner !== null && f.owner !== p; f.owner = p; f.miss = m.miss; return { ok: true, text: `${stole ? 'Stolen!' : 'Captured!'} ${drillFmtMiss(m)}` }; }
      return { ok: false, text: `Not close enough · ${drillFmtMiss(m)}` };
    },
    done: (st, o, P) => st.i >= o.turns * P.length,
    field: st => ({ max: 210, targets: st.flags.map((f, i) => ({ d: f.d, x: f.x, r: 3, active: i === st.sel, owner: f.owner, label: String(i + 1) })) }),
  },
  longdrive: {
    name: 'Long Drive', icon: '💥', blurb: 'Six balls each into a 50-yard grid. Longest drive that stays in the grid wins.', players: true,
    options: [{ key: 'balls', label: 'Balls each', type: 'choice', choices: [[3, '3'], [6, '6']], def: 6 }, drillPlayerOpt],
    start: (o, P) => ({ i: 0, best: P.map(() => 0), results: [] }),
    now: (st, o, P) => ({ title: `Ball ${Math.floor(st.i / P.length) + 1} of ${o.balls}`, sub: 'Must finish within 25 yards of the line', club: 'Driver', swing: 'full' }),
    shot: (st, s, o, P) => {
      const p = st.i % P.length, inGrid = Math.abs(s.totalOff) <= 25; st.i++;
      st.results.push({ p, total: s.total, inGrid });
      if (inGrid && s.total > st.best[p]) { st.best[p] = s.total; return { ok: true, text: `${Math.round(s.total)} yds — new best!` }; }
      return { ok: inGrid, text: inGrid ? `${Math.round(s.total)} yds` : `Out of the grid (${fmtOff(s.totalOff)})` };
    },
    done: (st, o, P) => st.i >= o.balls * P.length,
    field: () => ({ max: 330, corridor: { width: 50 }, useTotal: true }),
  },
  ladder: {
    name: 'Ladder', icon: '🪜', blurb: 'Climb from short to long: land within the window to step up a rung, miss and you stay. How far can you climb in 30 shots?',
    options: [
      { key: 'from', label: 'From (yds)', type: 'number', def: 50, min: 20, max: 200 },
      { key: 'to', label: 'To (yds)', type: 'number', def: 150, min: 40, max: 250 },
      { key: 'step', label: 'Step', type: 'choice', choices: [[5, '5 yds'], [10, '10 yds']], def: 10 },
      { key: 'win', label: 'Window', type: 'choice', choices: [[3, '±3 yds'], [5, '±5 yds'], [8, '±8 yds']], def: 5 },
    ],
    start: o => ({ rungs: drillLadderRungs(o), rung: 0, i: 0, max: 30, results: [] }),
    now: (st, o) => { const d = st.rungs[st.rung];
      return { title: `Rung ${st.rung + 1} of ${st.rungs.length}: ${d} yds`, sub: `Carry within ±${o.win} yds to climb · shot ${st.i + 1} of ${st.max}`, dist: d, ...drillSuggestClub(d) }; },
    shot: (st, s, o) => { const d = st.rungs[st.rung], long = s.carry - d, ok = Math.abs(long) <= o.win; st.i++;
      st.results.push({ t: d, ok, long }); if (ok) st.rung++;
      return { ok, text: ok ? `Climbed! ${Math.round(s.carry)} yds carry` : `${Math.round(Math.abs(long))} yds ${long > 0 ? 'long' : 'short'} — try again` }; },
    done: st => st.rung >= st.rungs.length || st.i >= st.max,
    field: (st, o) => { const d = st.rungs[Math.min(st.rung, st.rungs.length - 1)];
      return { max: Math.max(120, st.rungs[st.rungs.length - 1] * 1.15), bands: st.rungs.map((r, i) => ({ d: r, win: o.win, active: i === st.rung, done: i < st.rung })), targets: [{ d, x: 0, r: 2, active: true }] }; },
  },
  nine: {
    name: '9-Shot Drill', icon: '🔳', blurb: 'Low, mid and high × draw, straight and fade. The R10’s launch angle and spin axis judge whether you pulled each one off.',
    options: [
      { key: 'club', label: 'Club', type: 'club', def: '7-Iron' },
      { key: 'hand', label: 'You swing', type: 'choice', choices: [['right', 'Right-handed'], ['left', 'Left-handed']], def: 'right' },
    ],
    start: o => ({ done: Array(9).fill(false), tries: Array(9).fill(0), cell: 4, i: 0, max: 36, base: ceClubProfile(o.club, bagProfileShots()).launch, results: [] }),
    now: (st, o) => ({ title: `${drillNineName(st.cell)} · shot ${st.i + 1} of ${st.max}`, sub: `Height from launch angle (your ${o.club} launches ~${Math.round(st.base)}°), shape from spin axis`, club: o.club, swing: 'full', lockClub: true, pickCell: true }),
    shot: (st, s, o) => {
      const want = drillNineCell(st.cell), got = drillNineRead(s, st.base, o.hand), ok = want.h === got.h && want.s === got.s;
      st.tries[st.cell]++; st.i++; st.results.push({ cell: st.cell, ok });
      if (ok) { st.done[st.cell] = true; const next = st.done.findIndex(d => !d); if (next >= 0) st.cell = next; }
      return { ok, text: `${ok ? 'Nailed it!' : 'Not quite'} — that was ${got.h} and ${got.s} (launch ${s.launch}°, spin axis ${s.spinAxis > 0 ? '+' : ''}${s.spinAxis}°)` };
    },
    done: st => st.done.every(Boolean) || st.i >= st.max,
    field: () => null,
  },
};

function drillRings(t) { return [{ r: 0.03 * t + 1, pts: 10 }, { r: 0.06 * t + 2, pts: 6 }, { r: 0.1 * t + 3, pts: 3 }, { r: 0.15 * t + 4, pts: 1 }]; }
function drillLadderRungs(o) {
  const a = Math.min(o.from, o.to), b = Math.max(o.from, o.to), out = [];
  for (let d = a; d <= b + 0.1; d += o.step) out.push(d);
  return out;
}
// 9-shot grid: row = height (0 high, 1 mid, 2 low), column = shape (0 draw, 1 straight, 2 fade)
function drillNineCell(i) { return { h: ['high', 'mid', 'low'][Math.floor(i / 3)], s: ['draw', 'straight', 'fade'][i % 3] }; }
function drillNineName(i) { const c = drillNineCell(i); return `${c.h[0].toUpperCase() + c.h.slice(1)} ${c.s}`; }
function drillNineRead(s, base, hand) {
  const h = s.launch > base + 2.5 ? 'high' : s.launch < base - 2.5 ? 'low' : 'mid';
  const axis = hand === 'left' ? -s.spinAxis : s.spinAxis; // + curves right; a right-hander's draw curves left
  return { h, s: axis <= -2 ? 'draw' : axis >= 2 ? 'fade' : 'straight' };
}

// ── Flow ───────────────────────────────────────────────────────
function drillPlayers(o) {
  const p = (o.players || 'You').split(',').map(x => x.trim()).filter(Boolean).slice(0, 6);
  return p.length ? p : ['You'];
}
function drillDef()      { return DRILLS[drill.id]; }
// Whose turn it is: players alternate shot by shot, except Closest to the Pin (three balls in a row)
function drillTurn(st, P) {
  if (P.length < 2) return 0;
  return drill.id === 'ctp' ? Math.floor((st.i % (P.length * 3)) / 3) : st.i % P.length;
}
// Swing length for a wedge shot at a distance, from that club's full carry
function drillSwingFor(club, dist) {
  const full = drillClubCarry(club);
  return dist >= full * 0.9 ? 'full' : dist >= full * 0.7 ? 'threeq' : 'half';
}
function drillCtx()      { const P = drill.opts && drillDef().players ? drillPlayers(drill.opts) : ['You']; return [drill.st, drill.opts, P]; }

function drillOpen(id) {
  const def = DRILLS[id], saved = (getDrillData().opts || {})[id] || {};
  const opts = {};
  def.options.forEach(op => { opts[op.key] = saved[op.key] ?? op.def; });
  drill = { id, phase: 'setup', opts };
  drillLastResult = null;
  renderClubs(); drillScrollIntoView();
}
function drillSetOpt(key, val) {
  const op = drillDef().options.find(o => o.key === key);
  if (op.type === 'number') val = Math.max(op.min ?? 0, Math.min(op.max ?? 999, Math.round(+val || op.def)));
  if (op.type === 'choice') val = op.choices.find(c => String(c[0]) === String(val))[0];
  if (op.type === 'multi') { const set = new Set(drill.opts[key]); set.has(val) ? set.delete(val) : set.add(val); val = op.choices.filter(c => set.has(c)); }
  drill.opts[key] = val; renderClubs();
}
function drillStart() {
  const def = drillDef(), P = def.players ? drillPlayers(drill.opts) : ['You'];
  if (def.minPlayers && P.length < def.minPlayers) { showToast(`${def.name} needs at least ${def.minPlayers} players`); return; }
  const d = getDrillData(); d.opts = d.opts || {}; d.opts[drill.id] = drill.opts; saveDrillData(d); // remember the setup
  drill.st = def.start(drill.opts, P); drill.phase = 'play'; drill.startedAt = Date.now(); drill.shots = [];
  drill.club = null; drillLastResult = null; rangeOn = false;
  drillSave(); renderClubs(); drillScrollIntoView();
}
function drillQuit() {
  if (drill && drill.phase === 'play' && drill.shots.length && !confirm('Quit this drill? Progress won\'t be saved.')) return;
  drill = null; drillLastResult = null; drillSave(); renderClubs();
}
function drillScrollIntoView() { setTimeout(() => { const el = document.getElementById('drill-panel'); if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' }); }, 30); }

// The club being hit now: the suggestion unless the player picked another
function drillCurrentClub(now) { return now.lockClub || !drill.club ? now.club : drill.club; }
function drillSetClub(c) { drill.club = c; drillSave(); renderClubs(); }
function drillPickFlag(i) { if (drill?.st?.flags) { drill.st.sel = i; drillSave(); renderClubs(); } }
function drillPickCell(i) { if (drill?.st && drill.id === 'nine' && !drill.st.done[i]) { drill.st.cell = i; drillSave(); renderClubs(); } }

// An R10 shot while a drill is running
function drillOnR10Shot(shot) {
  if (!shot.ballMph || shot.launch === null) { showToast('📡 No ball data — drills need a real ball hit'); return; }
  drillTakeShot(shot, false);
}
// Without an R10: a test shot from your club numbers, aimed at the current target
function drillTestShot() {
  const [st, o, P] = drillCtx(), now = drillDef().now(st, o, P), club = drillCurrentClub(now);
  const prof = ceClubProfile(club, bagProfileShots());
  let power = DRILL_SWINGS[now.swing || 'full']?.power ?? 100, type = 'normal';
  if (now.dist) { // aim the distance like a player would
    const full = ceClubDistance(prof).carry;
    power = Math.min(100, Math.max(15, 100 * Math.sqrt(now.dist / full)));
    power = Math.min(100, Math.max(15, power * Math.sqrt(now.dist / Math.max(5, ceClubDistance(prof, power).carry))));
  }
  let launch;
  if (drill.id === 'nine') { // try the requested shape, with a realistic chance of missing it
    const want = drillNineCell(st.cell);
    type = { high: 'high', low: 'punch', mid: 'normal' }[want.h];
    launch = ceSimulatedSwing(prof, 100, type);
    launch.spinAxis = ({ draw: -6, straight: 0, fade: 6 }[want.s]) * (o.hand === 'left' ? -1 : 1) + ceGauss(Math.random) * 3.5;
  } else launch = ceSimulatedSwing(prof, power, type);
  drillTakeShot(launch, true);
}

function drillTakeShot(launch, sim) {
  if (!drillActive()) return;
  const def = drillDef(), [st, o, P] = drillCtx(), now = def.now(st, o, P), club = drillCurrentClub(now);
  const s = drillProcess(launch, club, sim), player = drillTurn(st, P);
  const res = def.shot(st, s, o, P);
  drill.shots.push({ ...s, ok: res.ok, player });
  drillLastResult = { ...res, shot: s };
  // Real full swings also go into your range data (which Apex uses for your club numbers);
  // wedge-matrix and target shots go into the wedge matrix
  if (!sim) {
    const swing = now.swing || 'full';
    if (swing === 'full' && !now.dist) rangeLogDrillShot(launch, club);
    if (drill.id === 'wedges' || (drill.id === 'target' && DRILL_WEDGES.includes(club))) {
      const w = drill.id === 'wedges' ? now.swing : drillSwingFor(club, now.dist);
      const all = getWedgeShots(); all.unshift({ at: s.at, club, swing: w, carry: s.carry, total: s.total }); saveWedgeShots(all.slice(0, 2000));
    }
  }
  if (typeof apexSound === 'function') apexSound('land', 0, { surface: res.ok ? 'green' : 'rough' });
  if (def.done(st, o, P)) drillFinish();
  else { drillSave(); renderClubs(); }
}
// Log a drill's full swing as a range shot (same format as range mode)
function rangeLogDrillShot(shot, club) {
  const rec = { id: Date.now(), at: Date.now(), date: todayISO(), club, clubMph: shot.clubMph ?? null, ballMph: shot.ballMph,
    smash: shot.clubMph && shot.ballMph ? Math.round(shot.ballMph / shot.clubMph * 100) / 100 : null,
    launch: shot.launch, direction: shot.direction, spin: shot.spin !== null && shot.spin !== undefined ? Math.round(shot.spin) : null,
    face: shot.face ?? null, path: shot.path ?? null, attack: shot.attack ?? null, spinAxis: shot.spinAxis, ...rangeDistances(shot), drill: true };
  const all = getRangeShots(); all.unshift(rec); saveRangeShots(all);
}

function drillFinish() {
  const def = drillDef(), [st, o, P] = drillCtx(), d = getDrillData();
  const summary = drillSummaryData(drill.id, st, o, P);
  const realShots = drill.shots.filter(s => !s.sim).length, test = realShots < drill.shots.length * 0.8;
  // Runs made mostly of test shots are kept in history (marked) but earn no XP, bests or quests
  const hist = d.history[drill.id] = d.history[drill.id] || [];
  hist.unshift({ at: Date.now(), opts: o, ...summary.record, ...(test ? { test: true } : {}) });
  d.history[drill.id] = hist.slice(0, 60);
  let xp = 0;
  if (!test) { // XP for real practice, not test shots
    xp = drill.id === 'combine' ? (o.full ? 150 : 75) : drill.id === 'wedges' ? 60 : 40;
    awardXP(xp, def.name);
  }
  if (summary.best !== undefined && !test) {
    const prev = d.best[drill.id + (summary.bestKey || '')];
    if (prev === undefined || (summary.lowerBetter ? summary.best < prev : summary.best > prev)) d.best[drill.id + (summary.bestKey || '')] = summary.best;
  }
  saveDrillData(d);
  drill.phase = 'done'; drill.summary = { html: summary.html, xp, real: realShots };
  drillSave(); renderClubs();
  if (!test) onActivity('drill'); else { checkQuests(getAllRounds()); checkBadges(getAllRounds()); }
  if (typeof apexSound === 'function') apexSound('chime', 200, { level: 2 });
}
function drillAgain() { drill = { id: drill.id, phase: 'setup', opts: drill.opts }; drillStart(); }

// ── Summaries ──────────────────────────────────────────────────
const drillAvg = a => a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0;
function drillSummaryData(id, st, o, P) {
  const R = st.results, tile = (l, v) => `<div class="range-tile"><div class="range-tile-value">${v}</div><div class="range-tile-label">${l}</div></div>`;
  const ranking = (scores, lowerBetter, fmt) => P.length < 2 ? '' : `<div class="drill-ranking">${P.map((p, i) => ({ p, v: scores[i] }))
    .sort((a, b) => lowerBetter ? a.v - b.v : b.v - a.v).map((x, k) => `<div>${k === 0 ? '🥇' : k === 1 ? '🥈' : k === 2 ? '🥉' : `${k + 1}.`} <strong>${esc(x.p)}</strong> — ${fmt(x.v)}</div>`).join('')}</div>`;
  switch (id) {
    case 'combine': {
      const avg = Math.round(drillAvg(R.map(r => r.score))), hcp = drillCombineHandicap(avg);
      const per = DRILL_COMBINE_TARGETS.map(t => { const rs = R.filter(r => r.t === t);
        return { t, score: Math.round(drillAvg(rs.map(r => r.score))), miss: t === 'Driver' ? null : drillAvg(rs.map(r => r.miss)), total: t === 'Driver' ? drillAvg(rs.map(r => r.total)) : null }; });
      const hist = (getDrillData().history.combine || []).filter(h => h.full === o.full && !h.test);
      return { record: { full: o.full, avg, per: per.map(p => p.score) }, best: avg, bestKey: o.full ? 'Full' : 'Quick',
        html: `<div class="range-tiles">${tile('Combine score', avg)}${tile('Plays like', hcp <= 0 ? `+${-hcp}` : `${hcp} hcp`)}${tile('Best target', `${per.slice().sort((a, b) => b.score - a.score)[0].t}`)}${tile('Work on', `${per.slice().sort((a, b) => a.score - b.score)[0].t}`)}</div>
          <div class="drill-bars">${per.map(p => `<div class="drill-bar"><div class="drill-bar-fill" style="height:${p.score}%;background:${p.score >= 70 ? 'var(--green-mid)' : p.score >= 45 ? 'var(--gold)' : 'var(--red)'}"></div><div class="drill-bar-val">${p.score}</div><div class="drill-bar-lbl">${p.t === 'Driver' ? 'Drv' : p.t}</div></div>`).join('')}</div>
          <div class="apex-hole-meta" style="margin-top:6px;">Average miss: ${per.filter(p => p.miss !== null).map(p => `${p.t}: ${Math.round(p.miss)} yds`).join(' · ')} · Driver: ${Math.round(per[9].total)} yds avg</div>
          ${hist.length ? `<div class="apex-hole-meta" style="margin-top:6px;">Previous ${o.full ? 'full' : 'quick'} combines: ${hist.slice(0, 6).map(h => `${h.avg} (${new Date(h.at).toLocaleDateString()})`).join(' · ')}</div>` : ''}
          <p class="apex-hole-meta" style="margin-top:6px;">“Plays like” is a rough guide from typical scores by handicap — not an official handicap.</p>` };
    }
    case 'target': {
      const avg = Math.round(drillAvg(R.map(r => r.score))), miss = drillAvg(R.map(r => r.miss));
      const longs = R.filter(r => r.long > 0).length, rights = R.filter(r => r.off > 0).length;
      return { record: { avg, miss }, best: avg, html: `<div class="range-tiles">${tile('Average score', avg)}${tile('Average miss', `${Math.round(miss)} yds`)}${tile('Within 10% of the distance', `${Math.round(R.filter(r => r.miss <= r.t * 0.1).length / R.length * 100)}%`)}${tile('Tendency', `${longs > R.length / 2 ? 'Long' : 'Short'} · ${rights > R.length / 2 ? 'right' : 'left'}`)}</div>` };
    }
    case 'wedges':
      return { record: { shots: R.length }, html: drillWedgeTableHTML(R) };
    case 'fairway': {
      const fw = R.filter(r => r.fw), pct = Math.round(fw.length / R.length * 100), lefts = R.filter(r => !r.fw && r.off < 0).length, rights = R.filter(r => !r.fw && r.off > 0).length;
      const sd = Math.sqrt(drillAvg(R.map(r => r.off ** 2)) - drillAvg(R.map(r => r.off)) ** 2);
      return { record: { pct, total: drillAvg(R.map(r => r.total)) }, best: pct, html: `<div class="range-tiles">${tile('Fairways', `${fw.length}/${R.length} · ${pct}%`)}${tile('Average total', `${Math.round(drillAvg(R.map(r => r.total)))} yds`)}${tile('Longest in play', fw.length ? `${Math.round(Math.max(...fw.map(r => r.total)))} yds` : '—')}${tile('Misses', `${lefts} left · ${rights} right`)}${tile('Spread (side to side)', `±${Math.round(sd)} yds`)}</div>` };
    }
    case 'bullseye': {
      return { record: { points: st.points }, best: P.length === 1 ? st.points[0] : undefined, html: `<div class="range-tiles">${tile(P.length > 1 ? 'Winning score' : 'Score', Math.max(...st.points))}${tile('Bulls', R.filter(r => r.pts === 10).length)}${tile('Average miss', `${Math.round(drillAvg(R.map(r => r.miss)))} yds`)}</div>${ranking(st.points, false, v => `${v} pts`)}` };
    }
    case 'ctp': {
      const tot = st.best.map(b => b.reduce((a, x) => a + x, 0));
      return { record: { totals: tot }, best: P.length === 1 ? Math.round(tot[0] * 3) : undefined, lowerBetter: true,
        html: `<div class="range-tiles">${tile(P.length > 1 ? 'Winning total' : 'Total of best balls', `${Math.round(Math.min(...tot) * 3)} ft`)}${tile('Closest ball', `${Math.round(Math.min(...R.map(r => r.miss)) * 3)} ft`)}</div>${ranking(tot, true, v => `${Math.round(v * 3)} ft`)}` };
    }
    case 'ctf': {
      const counts = P.map((_, i) => st.flags.filter(f => f.owner === i).length);
      return { record: { counts }, html: `<div class="range-tiles">${tile('Flags captured', counts.reduce((a, b) => a + b, 0) + ' of 6')}</div>${ranking(counts, false, v => `${v} flag${v === 1 ? '' : 's'}`)}` };
    }
    case 'longdrive':
      return { record: { best: st.best }, best: P.length === 1 ? Math.round(st.best[0]) : Math.round(Math.max(...st.best)),
        html: `<div class="range-tiles">${tile('Longest in the grid', `${Math.round(Math.max(...st.best))} yds`)}${tile('In the grid', `${R.filter(r => r.inGrid).length}/${R.length}`)}</div>${ranking(st.best, false, v => v ? `${Math.round(v)} yds` : 'no drive in the grid')}` };
    case 'ladder': {
      const top = st.rung >= st.rungs.length;
      return { record: { rung: st.rung, shots: st.i }, best: st.rung * 100 - (top ? st.i : 99),
        html: `<div class="range-tiles">${tile(top ? 'Top of the ladder!' : 'Highest rung', top ? `in ${st.i} shots` : `${st.rung} of ${st.rungs.length}`)}${tile('Hit rate', `${Math.round(R.filter(r => r.ok).length / R.length * 100)}%`)}</div>` };
    }
    case 'nine':
      return { record: { made: st.done.filter(Boolean).length, shots: st.i }, best: st.done.filter(Boolean).length * 100 - st.i,
        html: `${drillNineGridHTML(st, true)}<div class="apex-hole-meta" style="margin-top:8px;">${st.done.filter(Boolean).length} of 9 shapes in ${st.i} shots.</div>` };
  }
  return { record: {}, html: '' };
}

// The wedge matrix: average carry per club and swing (the latest 10 shots in each cell)
function drillWedgeTableHTML(fresh) {
  const shots = fresh || getWedgeShots();
  const clubs = DRILL_WEDGES.filter(c => shots.some(s => s.club === c));
  if (!clubs.length) return '';
  const cell = (c, w) => {
    const v = shots.filter(s => s.club === c && s.swing === w).slice(0, 10).map(s => s.carry);
    if (!v.length) return '<td>—</td>';
    const a = drillAvg(v), sd = Math.sqrt(drillAvg(v.map(x => (x - a) ** 2)));
    return `<td><strong>${Math.round(a)}</strong>${v.length > 1 ? `<span class="drill-sd"> ±${Math.round(sd)}</span>` : ''}</td>`;
  };
  return `<div class="scorecard-wrap"><table class="scorecard"><thead><tr><th style="text-align:left;">Carry (yds)</th>${Object.values(DRILL_SWINGS).map(w => `<th>${w.name}</th>`).join('')}</tr></thead>
    <tbody>${clubs.map(c => `<tr><td style="text-align:left;font-weight:700;">${c}</td>${Object.keys(DRILL_SWINGS).map(w => cell(c, w)).join('')}</tr>`).join('')}</tbody></table></div>`;
}
function drillNineGridHTML(st, readOnly) {
  return `<div class="drill-nine"><div></div>${['Draw', 'Straight', 'Fade'].map(x => `<div class="drill-nine-h">${x}</div>`).join('')}
    ${[0, 1, 2].map(r => `<div class="drill-nine-h">${['High', 'Mid', 'Low'][r]}</div>${[0, 1, 2].map(c => { const i = r * 3 + c;
      return `<button class="drill-nine-cell${st.done[i] ? ' done' : ''}${!readOnly && st.cell === i ? ' on' : ''}" ${readOnly || st.done[i] ? 'disabled' : `onclick="drillPickCell(${i})"`}>${st.done[i] ? '✓' : st.tries[i] ? `${st.tries[i]} tr${st.tries[i] === 1 ? 'y' : 'ies'}` : ''}</button>`; }).join('')}`).join('')}</div>`;
}

// ── Screens (on the Range & Clubs page) ────────────────────────
function drillsHTML() {
  drillLoad();
  if (drill && DRILLS[drill.id]) return `<div id="drill-panel">${drill.phase === 'setup' ? drillSetupHTML() : drill.phase === 'play' ? drillPlayHTML() : drillDoneHTML()}</div>`;
  const d = getDrillData(), wedge = drillWedgeTableHTML();
  const bestTxt = id => {
    const b = d.best;
    if (id === 'combine' && (b.combineQuick !== undefined || b.combineFull !== undefined)) return `Best ${[b.combineFull !== undefined ? `full ${b.combineFull}` : '', b.combineQuick !== undefined ? `quick ${b.combineQuick}` : ''].filter(Boolean).join(' · ')}`;
    if (b[id] === undefined) return '';
    return { target: `Best avg ${b[id]}`, fairway: `Best ${b[id]}% fairways`, bullseye: `Best ${b[id]} pts`, ctp: `Best ${b[id]} ft`, longdrive: `Longest ${b[id]} yds`,
             ladder: b[id] >= 0 ? `Best rung ${Math.floor((b[id] + 99) / 100)}` : '', nine: `Best ${Math.floor((b[id] + 99) / 100)}/9` }[id] || '';
  };
  const card = id => { const D = DRILLS[id];
    return `<button class="drill-card" onclick="drillOpen('${id}')"><div class="drill-card-icon">${D.icon}</div><div class="drill-card-body"><div class="drill-card-name">${D.name}${D.players ? ' <span class="drill-tag">multiplayer</span>' : ''}</div><div class="drill-card-blurb">${D.blurb}</div>${bestTxt(id) ? `<div class="drill-card-best">${bestTxt(id)}</div>` : ''}</div></button>`; };
  return `<div class="card" id="drill-panel">
    <div class="card-title">Drills</div>
    <p style="font-size:0.82rem;color:var(--gray-mid);margin-bottom:10px;">Structured practice with your R10 — every shot measured and scored. ${R10.isConnected() ? '' : 'Connect the R10 above, or use test shots to try them out.'}</p>
    <div class="drill-group-title">Tests</div>
    <div class="drill-grid">${['combine', 'fairway', 'nine'].map(card).join('')}</div>
    <div class="drill-group-title">Practice</div>
    <div class="drill-grid">${['target', 'wedges', 'ladder'].map(card).join('')}</div>
    <div class="drill-group-title">Range games</div>
    <div class="drill-grid">${['bullseye', 'ctp', 'ctf', 'longdrive'].map(card).join('')}</div>
    ${wedge ? `<div class="drill-group-title">Your wedge matrix</div>${wedge}<p class="apex-hole-meta" style="margin-top:4px;">Average carry of your latest shots in each cell, ± their spread. Built by the Wedge Matrix drill and Target Practice.</p>` : ''}
  </div>`;
}

function drillSetupHTML() {
  const D = drillDef(), o = drill.opts;
  const field = op => {
    if (op.when && !op.when(o)) return '';
    let input;
    if (op.type === 'choice') input = `<div class="toggle-group">${op.choices.map(([v, l]) => `<button class="toggle-btn ${String(o[op.key]) === String(v) ? 'active' : ''}" onclick="drillSetOpt('${op.key}', '${v}')">${l}</button>`).join('')}</div>`;
    else if (op.type === 'number') input = `<input type="number" min="${op.min}" max="${op.max}" value="${o[op.key]}" onchange="drillSetOpt('${op.key}', this.value)" style="max-width:110px;">`;
    else if (op.type === 'text') input = `<input type="text" value="${esc(o[op.key])}" onchange="drillSetOpt('${op.key}', this.value)" maxlength="80">`;
    else if (op.type === 'club') input = `<select onchange="drillSetOpt('${op.key}', this.value)">${RANGE_CLUBS.map(c => `<option ${c === o[op.key] ? 'selected' : ''}>${c}</option>`).join('')}</select>`;
    else if (op.type === 'multi') input = `<div class="range-chips" style="margin:0;">${op.choices.map(c => `<button class="range-chip ${o[op.key].includes(c) ? 'active' : ''}" onclick="drillSetOpt('${op.key}', '${c}')">${c}</button>`).join('')}</div>`;
    return `<div class="drill-opt"><label>${op.label}</label>${input}</div>`;
  };
  return `<div class="card">
    <div class="section-header" style="margin-bottom:6px;"><div class="card-title" style="margin:0;">${D.icon} ${D.name}</div>
      <button class="btn btn-sm" style="background:var(--gray-light);color:var(--gray-dark);" onclick="drillQuit()">‹ All drills</button></div>
    <p style="font-size:0.84rem;color:var(--gray-mid);margin-bottom:12px;">${D.blurb}</p>
    ${D.options.map(field).join('')}
    <button class="btn btn-primary" style="margin-top:6px;" onclick="drillStart()">▶ Start</button>
  </div>`;
}

function drillPlayHTML() {
  const D = drillDef(), [st, o, P] = drillCtx(), now = D.now(st, o, P), club = drillCurrentClub(now);
  const turn = P.length > 1 ? `<div class="drill-turn">🏌️ <strong>${esc(P[drillTurn(st, P)])}</strong>’s turn</div>` : '';
  const last = drillLastResult;
  const lastHTML = last ? `<div class="drill-result ${last.ok ? 'ok' : 'miss'}">${last.ok ? '✅' : '❌'} ${esc(last.text)}${last.shot.sim ? ' <span class="drill-tag">test shot</span>' : ''}
    <div class="drill-result-data">${last.shot.club} · carry ${Math.round(last.shot.carry)} · total ${Math.round(last.shot.total)} · ${fmtOff(last.shot.carryOff)} · ball ${fmtSpd(last.shot.ballMph)} ${unitLabel()} · launch ${fmtDeg(last.shot.launch)} · spin ${fmtSpin(last.shot.spin)} · apex ${last.shot.apexFt} ft</div></div>` : '';
  const flags = now.pickFlag ? `<div class="range-chips" style="margin:8px 0 0;">${st.flags.map((f, i) => `<button class="range-chip ${i === st.sel ? 'active' : ''}" onclick="drillPickFlag(${i})">${i + 1}: ${f.d} yds${f.owner !== null ? ` · ${esc(P[f.owner])}` : ''}</button>`).join('')}</div>` : '';
  const progress = drillProgress(st, o, P);
  return `<div class="card">
    <div class="section-header" style="margin-bottom:6px;"><div class="card-title" style="margin:0;">${D.icon} ${D.name}</div>
      <button class="btn btn-sm" style="background:none;color:var(--gray-mid);" onclick="drillQuit()">Quit</button></div>
    <div class="drill-progress"><div style="width:${Math.round(progress * 100)}%"></div></div>
    ${turn}
    <div class="drill-now"><div class="drill-now-title">${esc(now.title)}</div><div class="drill-now-sub">${esc(now.sub)}</div></div>
    ${flags}
    ${drill.id === 'nine' ? drillNineGridHTML(st, false) : ''}
    ${D.field(st, o, P) ? `<canvas id="drill-field" class="drill-field"></canvas>` : ''}
    ${lastHTML}
    <div class="drill-club"><span>Club:</span> ${now.lockClub ? `<strong>${club}</strong>` : `<select onchange="drillSetClub(this.value)">${RANGE_CLUBS.map(c => `<option ${c === club ? 'selected' : ''}>${c}</option>`).join('')}</select>`}
      ${now.text && !now.lockClub ? `<span class="apex-hole-meta">suggested: ${esc(now.text)}</span>` : now.swing && now.swing !== 'full' ? `<span class="apex-hole-meta">${DRILL_SWINGS[now.swing].name}</span>` : ''}</div>
    ${R10.isConnected() ? `<div class="apex-swing-r10">📡 R10 ready — take your shot</div>` : `<button class="btn btn-sm" style="background:var(--gray-light);color:var(--gray-dark);margin-top:8px;" onclick="drillTestShot()">🧪 Test shot (no R10)</button>`}
  </div>`;
}
function drillProgress(st, o, P) {
  switch (drill.id) {
    case 'combine': case 'wedges': return st.i / st.seq.length;
    case 'ladder': return Math.max(st.rung / st.rungs.length, 0);
    case 'nine': return st.done.filter(Boolean).length / 9;
    case 'bullseye': return st.i / (o.n * P.length);
    case 'ctp': return st.i / (o.rounds * P.length * 3);
    case 'ctf': return st.i / (o.turns * P.length);
    case 'longdrive': return st.i / (o.balls * P.length);
    default: return st.i / st.n;
  }
}
function drillDoneHTML() {
  const D = drillDef();
  return `<div class="card">
    <div class="section-header" style="margin-bottom:10px;"><div class="card-title" style="margin:0;">${D.icon} ${D.name} · results</div></div>
    ${drill.summary.html}
    ${drill.summary.xp ? `<div class="apex-hole-meta" style="margin-top:8px;">+${drill.summary.xp} XP</div>` : drill.summary.real < drill.shots.length ? `<div class="apex-hole-meta" style="margin-top:8px;">Test shots don’t earn XP.</div>` : ''}
    <div style="display:flex;gap:8px;margin-top:12px;flex-wrap:wrap;">
      <button class="btn btn-primary" onclick="drillAgain()">↻ Again</button>
      <button class="btn btn-sm" style="background:var(--gray-light);color:var(--gray-dark);" onclick="drillQuit()">All drills</button>
    </div>
  </div>`;
}

// ── The range view: top-down, the hitting spot at the bottom ───
function drillAfterRender() {
  const cv = document.getElementById('drill-field');
  if (!cv || !drill || drill.phase !== 'play') return;
  const [st, o, P] = drillCtx(), view = drillDef().field(st, o, P);
  if (view) drillDrawField(cv, view, drill.shots);
}
function drillDrawField(cv, view, shots) {
  const dpr = window.devicePixelRatio || 1, W = cv.clientWidth, H = cv.clientHeight;
  if (!W || !H) return;
  cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr);
  const ctx = cv.getContext('2d'); ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  const max = view.max, pad = 16, ppy = (H - pad * 2) / max, halfW = W / 2 / ppy;
  const X = off => W / 2 + off * ppy, Y = d => H - pad - d * ppy;
  // grass with mowing bands every 10 yds
  for (let d = 0; d < max + 20; d += 10) { ctx.fillStyle = (d / 10) % 2 ? '#78b552' : '#6dab49'; ctx.fillRect(0, Y(d + 10), W, 10 * ppy + 1); }
  if (view.corridor) { // fairway / grid
    const w = view.corridor.width / 2;
    ctx.fillStyle = 'rgba(160,215,110,0.55)'; ctx.fillRect(X(-w), 0, (X(w) - X(-w)), H);
    ctx.strokeStyle = 'rgba(255,255,255,0.8)'; ctx.setLineDash([6, 6]); ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(X(-w), 0); ctx.lineTo(X(-w), H); ctx.moveTo(X(w), 0); ctx.lineTo(X(w), H); ctx.stroke(); ctx.setLineDash([]);
  }
  (view.bands || []).forEach(b => { // ladder rungs
    ctx.fillStyle = b.active ? 'rgba(255,215,90,0.45)' : b.done ? 'rgba(255,255,255,0.22)' : 'rgba(255,255,255,0.08)';
    ctx.fillRect(0, Y(b.d + b.win), W, (2 * b.win) * ppy);
  });
  // yardage lines
  ctx.font = '600 10px system-ui, sans-serif'; ctx.fillStyle = 'rgba(255,255,255,0.85)'; ctx.strokeStyle = 'rgba(255,255,255,0.35)'; ctx.lineWidth = 1;
  const step = max > 200 ? 50 : 25;
  for (let d = step; d < max; d += step) { ctx.beginPath(); ctx.moveTo(0, Y(d)); ctx.lineTo(W, Y(d)); ctx.stroke(); ctx.fillText(`${d}`, 4, Y(d) - 3); }
  // targets
  const colors = ['#e63946', '#2b6cb0', '#f4a261', '#7b2d8b', '#2d9d5a', '#111'];
  (view.targets || []).forEach(t => {
    if (t.rings) [...t.rings].reverse().forEach((r, i) => { ctx.fillStyle = ['rgba(255,255,255,0.35)', 'rgba(255,255,255,0.5)', 'rgba(230,57,70,0.35)', 'rgba(230,57,70,0.75)'][i]; ctx.beginPath(); ctx.ellipse(X(t.x), Y(t.d), r.r * ppy, r.r * ppy, 0, 0, 7); ctx.fill(); });
    else { ctx.fillStyle = t.active ? 'rgba(170,230,120,0.95)' : 'rgba(170,230,120,0.6)'; ctx.beginPath(); ctx.ellipse(X(t.x), Y(t.d), Math.max(4, t.r * ppy), Math.max(4, t.r * ppy), 0, 0, 7); ctx.fill(); }
    // flag
    ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(X(t.x), Y(t.d)); ctx.lineTo(X(t.x), Y(t.d) - 16); ctx.stroke();
    ctx.fillStyle = t.owner !== undefined && t.owner !== null ? colors[t.owner % colors.length] : t.active ? '#e63946' : '#ffd166';
    ctx.beginPath(); ctx.moveTo(X(t.x), Y(t.d) - 16); ctx.lineTo(X(t.x) + 10, Y(t.d) - 12.5); ctx.lineTo(X(t.x), Y(t.d) - 9); ctx.fill();
    if (t.label) { ctx.fillStyle = '#fff'; ctx.fillText(t.label, X(t.x) + 3, Y(t.d) + 12); }
  });
  // shots: curved flight lines for the last few, landing (or resting) dots for all
  const recent = shots.slice(-12);
  recent.forEach((s, i) => {
    const last = i === recent.length - 1, d = view.useTotal ? s.total : s.carry, off = view.useTotal ? s.totalOff : s.carryOff;
    if (i >= recent.length - 3) {
      const startOff = Math.tan(s.direction * Math.PI / 180) * d * 0.5;
      ctx.strokeStyle = last ? 'rgba(255,240,170,0.95)' : 'rgba(255,255,255,0.4)'; ctx.lineWidth = last ? 2.2 : 1.2;
      ctx.beginPath(); ctx.moveTo(X(0), Y(0)); ctx.quadraticCurveTo(X(startOff), Y(d * 0.5), X(off), Y(d)); ctx.stroke();
    }
    ctx.fillStyle = s.ok ? '#ffffff' : '#ffb3a8'; ctx.strokeStyle = 'rgba(0,0,0,0.45)'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.arc(X(off), Y(d), last ? 5 : 3.5, 0, 7); ctx.fill(); ctx.stroke();
  });
  // hitting spot
  ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(X(0), Y(0), 3, 0, 7); ctx.fill();
}

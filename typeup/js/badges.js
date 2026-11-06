'use strict';
// ═══════════════════════════════════════════════════════════════════════════
// TypeUp — badges. Each one is a check on what's already saved. The checks
// run against one summary (badgeContext) built per look, so 140 of them stay
// quick. Bump BADGES_VERSION when badges are added: people who already
// qualify get them quietly instead of a pile of announcements.
// Loaded before app.js; the app's helpers are only called once it's running.
// ═══════════════════════════════════════════════════════════════════════════

const BADGES_VERSION = 2;

const BADGE_GROUPS = {
  lessons:  'Lessons',
  speed:    'Speed',
  accuracy: 'Accuracy',
  habits:   'Habits',
  passages: 'Passages',
  games:    'Games',
  coaching: 'Coaching',
  fun:      'Just for fun',
};

// Everything the checks need, worked out once.
function badgeContext(p) {
  const h = p.history;
  const trend = h.filter(countsForTrend).sort((a, b) => a.t - b.t);
  const tests = testRuns(p).sort((a, b) => a.t - b.t);
  const totals = dayTotals(p);
  const ids = Object.keys(p.passages);
  const flawless = new Set(h.filter(x => x.kind === 'passage' && x.acc >= 100).map(x => x.ref));
  const hard = PASSAGES.filter(ps => difficulty(ps) === 'hard');
  const days = [...totals.keys()].map(d => new Date(d)).sort((a, b) => a - b);
  const checks = Object.values(p.lessons);
  return {
    p,
    best: bestSpeed(p),
    tests,
    testGain: tests.length > 1 ? Math.max(...tests.map(x => x.wpm)) - tests[0].wpm : 0,
    streak: streakInfo(p).best,
    goalDays: goalDaySet(p).size,
    level: levelInfo(p).n,
    hours: ((p.msBank || 0) + h.reduce((a, x) => a + x.ms, 0)) / 36e5,
    plans: p.plansDone || 0,
    typed: ids.filter(id => !id.startsWith('my-')).length,
    mineTyped: ids.filter(id => id.startsWith('my-')).length,
    topic: t => PASSAGES.filter(ps => ps.topic === t && p.passages[ps.id]).length,
    topicSize: t => PASSAGES.filter(ps => ps.topic === t).length,
    flawless: [...flawless].filter(id => !id.startsWith('my-')).length,
    hardTyped: hard.filter(ps => p.passages[ps.id]).length,
    hardFlawless: hard.some(ps => flawless.has(ps.id)),
    longRun: h.some(x => x.kind === 'passage' && x.chars >= 1000),
    ghostWins: p.ghostWins || 0,
    firstTries: checks.filter(r => r.passed && r.attempts === 1).length,
    perfectChecks: checks.filter(r => r.bestAcc >= 100).length,
    mastered: masteredKeys(p, true),
    drills: h.filter(x => x.kind === 'drill' && x.ref === 'weak').length,
    mixDrills: h.filter(x => x.kind === 'drill' && x.ref === 'mixup').length,
    game: id => p.games[id] || { best: 0, plays: 0 },
    steady: trend.length >= 20 && mean(trend.slice(-20).map(x => x.acc)) >= 98,
    lockedIn: trend.length >= 10 && trend.slice(-10).every(x => x.acc >= 97),
    atHour: (from, to) => h.some(x => { const hr = new Date(x.t).getHours(); return hr >= from && hr < to; }),
    days,
    maxDayMin: Math.max(0, ...totals.values()) / 60000,
    goalMin: goalMs(p) / 60000,
  };
}

const LESSON_BADGES = [
  ['⌨️', 'Home row hero'], ['↔️', 'Side step'], ['🎯', 'Middle reach'], ['☝️', 'Up and over'], ['🤸', 'Big stretch'],
  ['⬇️', 'Downstairs'], ['❓', 'Why not?'], ['⛰️', 'Peaks and valleys'], ['🐦', 'Birdie'], ['🔤', 'Alphabet'],
  ['🔠', 'Shift happens'], ['⏹️', 'Full stop'], ['❗', 'Punctuation pro'], ['🔢', 'Number cruncher'], ['🔟', 'Count it all'],
];
const tier = (group, list, make) => list.map(([n, icon, name]) => ({ group, icon, name, ...make(n) }));
const allLetters = [...'abcdefghijklmnopqrstuvwxyz'];
const isSaturday = d => d.getDay() === 6;

const BADGES = [
  // ── Lessons ────────────────────────────────────────────────────────────
  { id: 'home', group: 'lessons', icon: '🏠', name: 'Home base', how: 'Find home row', test: c => c.p.introDone },
  ...LESSONS.map((l, i) => ({ id: `l${l.id}`, group: 'lessons', icon: LESSON_BADGES[i][0], name: LESSON_BADGES[i][1],
    how: `Pass lesson ${l.id}: ${l.title}`, test: c => !!c.p.lessons[l.id]?.passed })),
  { id: 'keys', group: 'lessons', icon: '🎓', name: 'Every key', how: 'Pass all 15 lessons', test: c => lessonsPassed(c.p) === LESSONS.length },
  { id: 'first1', group: 'lessons', icon: '1️⃣', name: 'First try', how: 'Pass a lesson check on your first attempt', test: c => c.firstTries >= 1 },
  { id: 'first5', group: 'lessons', icon: '🥇', name: 'Natural', how: 'Pass 5 lessons on the first try', test: c => c.firstTries >= 5 },
  { id: 'perf1', group: 'lessons', icon: '✨', name: 'Perfect check', how: 'Get 100% on a lesson check', test: c => c.perfectChecks >= 1 },
  { id: 'perf5', group: 'lessons', icon: '🌟', name: 'Picture perfect', how: 'Get 100% on 5 lesson checks', test: c => c.perfectChecks >= 5 },

  // ── Speed ──────────────────────────────────────────────────────────────
  ...tier('speed', [[10, '🐢'], [15, '🚶'], [20, '🏃'], [25, '🚲'], [30, '🛵'], [35, '🚗'], [40, '🏎️'], [45, '🚄'], [50, '✈️'], [60, '🚀'], [70, '⚡'], [80, '🌠'], [100, '👑']]
    .map(([n, icon]) => [n, icon, `${n} WPM`]),
    n => ({ id: `w${n}`, how: `Reach ${n} words per minute in a passage, lesson check or speed test`, test: c => c.best >= n })),
  { id: 'test1', group: 'speed', icon: '⏱️', name: 'On the clock', how: 'Take the 1-minute speed test', test: c => c.tests.length >= 1 },
  { id: 'test5', group: 'speed', icon: '📈', name: 'Check-up', how: 'Take the speed test 5 times', test: c => c.tests.length >= 5 },
  { id: 'test10', group: 'speed', icon: '🩺', name: 'Regular check-ups', how: 'Take the speed test 10 times', test: c => c.tests.length >= 10 },
  { id: 'gain5', group: 'speed', icon: '📊', name: 'Rising', how: 'Beat your first speed test by 5 WPM', test: c => c.testGain >= 5 },
  { id: 'gain10', group: 'speed', icon: '🧗', name: 'Climber', how: 'Beat your first speed test by 10 WPM', test: c => c.testGain >= 10 },
  { id: 'gain20', group: 'speed', icon: '🗻', name: 'Summit', how: 'Beat your first speed test by 20 WPM', test: c => c.testGain >= 20 },

  // ── Accuracy ───────────────────────────────────────────────────────────
  ...tier('accuracy', [[1, '💎', 'Flawless'], [5, '💍', 'Five clean'], [10, '🔷', 'Clean sweep'], [25, '🏵️', 'Spotless']],
    n => ({ id: `clean${n}`, how: n === 1 ? 'Type a passage with 100% accuracy' : `Type ${n} different passages with 100% accuracy`, test: c => c.flawless >= n })),
  { id: 'iceclean', group: 'accuracy', icon: '🧊', name: 'Ice cold', how: 'Type a hard passage with 100% accuracy', test: c => c.hardFlawless },
  { id: 'steady', group: 'accuracy', icon: '🤲', name: 'Steady hands', how: 'Average 98% accuracy over your last 20 runs', test: c => c.steady },
  { id: 'locked', group: 'accuracy', icon: '🔒', name: 'Locked in', how: 'Get 97% or better on 10 runs in a row', test: c => c.lockedIn },

  // ── Habits ─────────────────────────────────────────────────────────────
  ...tier('habits', [[3, '🔥', 'On a roll'], [5, '🕯️', 'Five alive'], [7, '📅', 'Week strong'], [14, '🗓️', 'Fortnight'], [21, '🧱', 'Habit formed'],
    [30, '🏆', 'Month of practice'], [50, '🎖️', 'Fifty days'], [100, '💯', 'Centurion'], [200, '🌋', 'Unstoppable'], [365, '🌍', 'Year-round']],
    n => ({ id: `s${n}`, how: `Keep a ${n}-day streak`, test: c => c.streak >= n })),
  ...tier('habits', [[1, '🎯', 'Goal getter'], [5, '✋', 'High five'], [10, '📌', 'Ten goals'], [25, '🪙', 'Quarter century'],
    [50, '🥈', 'Fifty goals'], [100, '🥇', 'Hundred goals'], [200, '🏛️', 'Two hundred goals']],
    n => ({ id: `g${n}`, how: n === 1 ? 'Reach your daily goal' : `Reach your daily goal on ${n} days`, test: c => c.goalDays >= n })),
  ...tier('habits', [[0.25, '⏲️', 'Warmed up'], [1, '⏳', 'One hour in'], [3, '🕒', 'Three hours'], [5, '🖐️', 'Five hours'], [10, '🔋', 'Ten hours'],
    [25, '📀', 'Twenty-five hours'], [50, '🏋️', 'Fifty hours'], [100, '🧠', 'Hundred hours']],
    n => ({ id: `h${n}`, how: n < 1 ? 'Practice for 15 minutes in total' : `Practice for ${n} hour${n === 1 ? '' : 's'} in total`, test: c => c.hours >= n })),
  ...tier('habits', [[1, '✅', 'Full session'], [5, '☑️', 'Five sessions'], [10, '📋', 'Ten sessions'], [25, '🗂️', 'Twenty-five sessions'],
    [50, '🧾', 'Fifty sessions'], [100, '🎗️', 'Hundred sessions']],
    n => ({ id: `plan${n}`, how: n === 1 ? 'Finish a whole Today\'s practice' : `Finish ${n} Today's practice sessions`, test: c => c.plans >= n })),
  ...tier('habits', [[5, '⭐', 'Level 5'], [10, '🌙', 'Level 10'], [15, '☀️', 'Level 15'], [20, '🪐', 'Level 20'], [25, '🌌', 'Level 25']],
    n => ({ id: `lv${n}`, how: `Reach level ${n}`, test: c => c.level >= n })),

  // ── Passages ───────────────────────────────────────────────────────────
  ...tier('passages', [[1, '📖', 'First passage'], [10, '📗', 'Ten passages'], [25, '📚', 'Bookworm'], [50, '📙', 'Fifty passages'],
    [75, '📘', 'Seventy-five passages'], [100, '📕', 'Hundred passages']],
    n => ({ id: `p${n}`, how: n === 1 ? 'Type a passage' : `Type ${n} different passages`, test: c => c.typed >= n })),
  { id: 'pall', group: 'passages', icon: '📜', name: 'Every passage', how: 'Type every built-in passage', test: c => c.typed >= PASSAGES.length },
  ...[['vikings', '🏈', 'Skol!', '🟣', 'Vikings fan'], ['golf', '⛳', 'Full round', '🏌️', 'Golf nut'],
      ['ai', '🤖', 'Machine learner', '💡', 'AI curious'], ['character', '🌱', 'Good character', '🌿', 'Growing']]
    .flatMap(([t, icon, name, icon10, name10]) => [
      { id: `t10-${t}`, group: 'passages', icon: icon10, name: name10, how: `Type 10 ${TOPICS[t].label} passages`, test: c => c.topic(t) >= 10 },
      { id: `tall-${t}`, group: 'passages', icon, name, how: `Type every ${TOPICS[t].label} passage`, test: c => c.topic(t) >= c.topicSize(t) },
    ]),
  { id: 'hard1', group: 'passages', icon: '🪨', name: 'Tough stuff', how: 'Type a hard passage', test: c => c.hardTyped >= 1 },
  { id: 'hard10', group: 'passages', icon: '⛏️', name: 'Hard worker', how: 'Type 10 hard passages', test: c => c.hardTyped >= 10 },
  { id: 'ghost1', group: 'passages', icon: '👻', name: 'Ghost buster', how: 'Beat your best run on a passage', test: c => c.ghostWins >= 1 },
  { id: 'ghost10', group: 'passages', icon: '🦇', name: 'Ghost chaser', how: 'Beat your best run 10 times', test: c => c.ghostWins >= 10 },
  { id: 'ghost25', group: 'passages', icon: '🌕', name: 'Ghost whisperer', how: 'Beat your best run 25 times', test: c => c.ghostWins >= 25 },
  { id: 'mine1', group: 'passages', icon: '✍️', name: 'Author', how: 'Type one of your own texts', test: c => c.mineTyped >= 1 },
  { id: 'mine5', group: 'passages', icon: '📝', name: 'Collector', how: 'Save 5 of your own texts', test: c => c.p.custom.length >= 5 },
  { id: 'mine10', group: 'passages', icon: '🖋️', name: 'Prolific', how: 'Type 10 different texts of your own', test: c => c.mineTyped >= 10 },
  { id: 'long', group: 'passages', icon: '🧵', name: 'Long haul', how: 'Type a text of 1,000 characters or more in one go', test: c => c.longRun },

  // ── Games ──────────────────────────────────────────────────────────────
  { id: 'fd0', group: 'games', icon: '🟢', name: 'Tee time', how: 'Play Fairway Drop', test: c => c.game('fairway').plays >= 1 },
  ...tier('games', [[500, '⚪', 'Ball striker'], [1000, '🏌️‍♀️', 'Fairway finder'], [2500, '🦅', 'Eagle'], [5000, '🦢', 'Albatross']],
    n => ({ id: `fd${n}`, how: `Score ${n.toLocaleString()} in Fairway Drop`, test: c => c.game('fairway').best >= n })),
  { id: 'fdplays', group: 'games', icon: '🧺', name: 'Range rat', how: 'Play Fairway Drop 10 times', test: c => c.game('fairway').plays >= 10 },
  { id: 'tm0', group: 'games', icon: '📣', name: 'Kickoff', how: 'Play the Two-Minute Drill', test: c => c.game('twominute').plays >= 1 },
  ...tier('games', [[7, '🏟️', 'Touchdown!'], [14, '✌️', 'Two scores'], [21, '🎩', 'Hat trick'], [35, '🛡️', 'Dynasty']],
    n => ({ id: `tm${n}`, how: n === 7 ? 'Score a touchdown in the Two-Minute Drill' : `Score ${n / 7} touchdowns in one Two-Minute Drill`, test: c => c.game('twominute').best >= n })),
  { id: 'tmplays', group: 'games', icon: '🧢', name: 'Two-minute warrior', how: 'Play the Two-Minute Drill 10 times', test: c => c.game('twominute').plays >= 10 },

  // ── Coaching ───────────────────────────────────────────────────────────
  ...tier('coaching', [[1, '🛠️', 'Tune-up'], [10, '🔧', 'Mechanic'], [50, '⚙️', 'Engineer']],
    n => ({ id: `drill${n}`, how: n === 1 ? 'Do a weak-key drill' : `Do ${n} weak-key drills`, test: c => c.drills >= n })),
  { id: 'mix1', group: 'coaching', icon: '🔀', name: 'Untangled', how: 'Do a mix-up drill', test: c => c.mixDrills >= 1 },
  { id: 'mix10', group: 'coaching', icon: '🧩', name: 'Puzzle solver', how: 'Do 10 mix-up drills', test: c => c.mixDrills >= 10 },
  { id: 'know10', group: 'coaching', icon: '🗝️', name: 'Ten keys known', how: 'Know 10 keys well enough that the guide fades them', test: c => c.mastered.size >= 10 },
  { id: 'eyes', group: 'coaching', icon: '👀', name: 'No peeking', how: 'Know all 26 letters well enough that the guide fades them', test: c => allLetters.every(k => c.mastered.has(k)) },
  { id: 'digits', group: 'coaching', icon: '🧮', name: 'Numbers by feel', how: 'Know every number key well enough that the guide fades it', test: c => [...'1234567890'].every(k => c.mastered.has(k)) },
  { id: 'know40', group: 'coaching', icon: '🎹', name: 'Whole keyboard', how: 'Know 40 keys well enough that the guide fades them', test: c => c.mastered.size >= 40 },

  // ── Just for fun ───────────────────────────────────────────────────────
  { id: 'early', group: 'fun', icon: '🌅', name: 'Early bird', how: 'Practice before 7 in the morning', test: c => c.atHour(4, 7) },
  { id: 'lunch', group: 'fun', icon: '🥪', name: 'Lunch break', how: 'Practice between noon and 1', test: c => c.atHour(12, 13) },
  { id: 'owl', group: 'fun', icon: '🦉', name: 'Night owl', how: 'Practice after 10 at night', test: c => c.atHour(22, 24) },
  { id: 'weekend', group: 'fun', icon: '🏖️', name: 'Weekend warrior', how: 'Practice on a Saturday and the Sunday after it', test: c => c.days.some(d => isSaturday(d) && c.days.some(e => Math.round((e - d) / 864e5) === 1)) },
  { id: 'gameday', group: 'fun', icon: '🟪', name: 'Game day', how: 'Practice on a Sunday during football season (September to January)', test: c => c.days.some(d => d.getDay() === 0 && (d.getMonth() >= 8 || d.getMonth() === 0)) },
  { id: 'newyear', group: 'fun', icon: '🎆', name: 'Fresh start', how: 'Practice on New Year\'s Day', test: c => c.days.some(d => d.getMonth() === 0 && d.getDate() === 1) },
  { id: 'comeback', group: 'fun', icon: '🔁', name: 'Comeback', how: 'Come back to practice after a week or more away', test: c => c.days.some((d, i) => i > 0 && Math.round((d - c.days[i - 1]) / 864e5) >= 7) },
  { id: 'double', group: 'fun', icon: '2️⃣', name: 'Double goal', how: 'Practice twice your daily goal in one day', test: c => c.maxDayMin >= c.goalMin * 2 },
  { id: 'triple', group: 'fun', icon: '3️⃣', name: 'Triple goal', how: 'Practice three times your daily goal in one day', test: c => c.maxDayMin >= c.goalMin * 3 },
  { id: 'half', group: 'fun', icon: '🕧', name: 'Half hour', how: 'Practice 30 minutes in one day', test: c => c.maxDayMin >= 30 },
  { id: 'fullhour', group: 'fun', icon: '🌞', name: 'Big day', how: 'Practice 60 minutes in one day', test: c => c.maxDayMin >= 60 },
];

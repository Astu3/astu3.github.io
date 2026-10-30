// Golf Improvement App — Daily tasks, badges, quests and putting challenges.
// Classic script: shares globals with the other files; load order is set in golf-improvement-app.html.

// ════════════════════════════════════════════════════════════
// DAILY TASKS
// ════════════════════════════════════════════════════════════
const DAILY_TASKS = [
  { id: 'log_any',     icon: '🏌️', name: 'First Swing of the Day',     desc: 'Log any round',                          xp: 50  },
  { id: 'log_9',       icon: '⛳', name: 'Hit the 9',                   desc: 'Log a 9-hole round',                     xp: 50  },
  { id: 'log_18',      icon: '🌳', name: 'Full 18',                     desc: 'Log an 18-hole round',                   xp: 100 },
  { id: 'gir_33',      icon: '🎯', name: 'Green Machine',               desc: 'Hit GIR on 33%+ of holes in a round',   xp: 75  },
  { id: 'fir_50',      icon: '🎳', name: 'Straight Driver',             desc: 'Hit FIR on 50%+ of holes in a round',   xp: 75  },
  { id: 'add_notes',   icon: '📝', name: 'Reflection',                  desc: 'Add notes to a round',                  xp: 25  },
  // Training days count too
  { id: 'speed_session', icon: '⚡', name: 'Speed Session',            desc: 'Finish a speed training session',       xp: 60, group: 'train' },
  { id: 'speed_pb',      icon: '🚀', name: 'New Personal Best',        desc: 'Set a speed PB with any club or stick', xp: 50, group: 'train' },
  { id: 'drill_done',    icon: '🎯', name: 'Drill Time',               desc: 'Complete a drill with your R10',        xp: 50, group: 'train' },
  { id: 'apex_play',     icon: '🗿', name: 'Jungle Run',               desc: 'Finish an Apex hole or challenge',      xp: 30, group: 'train' },
  { id: 'range_20',      icon: '📡', name: 'Range Session',            desc: 'Log 20 range shots with the R10',       xp: 40, group: 'train' },
];

function todayKey() { return todayISO(); }

function getCompletedToday() {
  const state = getTaskState();
  return state[todayKey()] || [];
}

function completeTask(taskId) {
  const state = getTaskState();
  const key   = todayKey();
  if (!state[key]) state[key] = [];
  if (state[key].includes(taskId)) return false;
  state[key].push(taskId);
  saveTaskState(state);
  const task = DAILY_TASKS.find(t => t.id === taskId);
  if (task) awardXP(task.xp, task.name);
  return true;
}

function checkTasksForRound(round) {
  const bonuses = [];
  const done = getCompletedToday();

  const tryComplete = (id) => {
    if (!done.includes(id) && completeTask(id)) {
      const t = DAILY_TASKS.find(t => t.id === id);
      if (t) bonuses.push(t);
    }
  };

  tryComplete('log_any');

  if (round.holeCount === 9)  tryComplete('log_9');
  if (round.holeCount === 18) tryComplete('log_18');

  if (round.girPct >= 33) tryComplete('gir_33');
  if (round.firPct >= 50) tryComplete('fir_50');
  if (round.notes && round.notes.trim()) tryComplete('add_notes');

  return bonuses;
}

// ════════════════════════════════════════════════════════════
// BADGE DEFINITIONS & LOGIC
// ════════════════════════════════════════════════════════════
const BADGE_DEFS = [
  // Common
  { id: 'first_round',   emoji:'⛳', name:'First Round',        rarity:'common',    desc:'Log your first round' },
  { id: 'three_rounds',  emoji:'🌿', name:'Getting Started',    rarity:'common',    desc:'Log 3 rounds' },
  { id: 'tier_2',        emoji:'⭐', name:'Rising Star',        rarity:'common',    desc:'Reach Novice tier' },
  { id: 'notes_writer',  emoji:'📝', name:'Analyst',            rarity:'common',    desc:'Add notes to 5 rounds' },
  { id: 'nine_holer',    emoji:'🔟', name:'Nine Is Fine',       rarity:'common',    desc:'Log a 9-hole round' },
  // Rare
  { id: 'ten_rounds',    emoji:'🏅', name:'Regular',            rarity:'rare',      desc:'Log 10 rounds' },
  { id: 'tier_5',        emoji:'🏆', name:'Local Legend',       rarity:'rare',      desc:'Reach Local Legend tier' },
  { id: 'birdie_hunter', emoji:'🐦', name:'Birdie Hunter',      rarity:'rare',      desc:'Make 10 birdies total' },
  { id: 'xp_1000',       emoji:'💯', name:'Century Club',       rarity:'rare',      desc:'Earn 1,000 total XP' },
  { id: 'gir_star',      emoji:'🎯', name:'GIR Star',           rarity:'rare',      desc:'Hit 50%+ GIR in a round' },
  // Epic
  { id: 'twenty_rounds', emoji:'🌳', name:'Course Veteran',     rarity:'epic',      desc:'Log 20 rounds' },
  { id: 'tier_8',        emoji:'💎', name:'Elite',              rarity:'epic',      desc:'Reach Elite tier' },
  { id: 'under_par',     emoji:'🔥', name:'Sub-Par Round',      rarity:'epic',      desc:'Shoot under par in a round' },
  { id: 'xp_5000',       emoji:'🚀', name:'XP Machine',         rarity:'epic',      desc:'Earn 5,000 total XP' },
  // Speed
  { id: 'speed_100',     emoji:'💯', name:'Triple Digits',      rarity:'rare',      desc:'Swing your driver 100 mph' },
  { id: 'speed_105',     emoji:'💨', name:'Wind Maker',         rarity:'rare',      desc:'Swing your driver 105 mph' },
  { id: 'speed_110',     emoji:'⚡', name:'Lightning',          rarity:'epic',      desc:'Swing your driver 110 mph' },
  { id: 'speed_115',     emoji:'🚀', name:'Launch Code',        rarity:'epic',      desc:'Swing your driver 115 mph' },
  { id: 'speed_120',     emoji:'🌪️', name:'Long Drive Territory', rarity:'legendary', desc:'Swing your driver 120 mph' },
  { id: 'speed_gain3',   emoji:'📈', name:'Gainer',             rarity:'common',    desc:'Beat your first baseline driver speed by 3 mph' },
  { id: 'speed_gain5',   emoji:'🏋️', name:'Stronger, Faster',   rarity:'rare',      desc:'Beat your first baseline driver speed by 5 mph' },
  { id: 'speed_gain10',  emoji:'🦍', name:'Beast Mode',         rarity:'legendary', desc:'Beat your first baseline driver speed by 10 mph' },
  { id: 'speed_grad',    emoji:'🎓', name:'Program Graduate',   rarity:'rare',      desc:'Finish a speed training program' },
  { id: 'speed_grit',    emoji:'🧱', name:'Iron Will',          rarity:'epic',      desc:'Finish a speed program with a consistency score of 90+' },
  { id: 'speed_25',      emoji:'🔁', name:'Speed Regular',      rarity:'rare',      desc:'Complete 25 speed sessions' },
  // Consistency
  { id: 'streak_2',      emoji:'🔥', name:'Warming Up',         rarity:'common',    desc:'Hit your weekly goal 2 weeks in a row' },
  { id: 'streak_4',      emoji:'🔥', name:'On Fire',            rarity:'rare',      desc:'Hit your weekly goal 4 weeks in a row' },
  { id: 'streak_12',     emoji:'☄️', name:'Unstoppable',        rarity:'epic',      desc:'Hit your weekly goal 12 weeks in a row' },
  { id: 'streak_26',     emoji:'🏔️', name:'Half-Year Hero',     rarity:'legendary', desc:'Hit your weekly goal 26 weeks in a row' },
  { id: 'active_25',     emoji:'📅', name:'Habit Formed',       rarity:'common',    desc:'Practice or play on 25 different days' },
  { id: 'active_100',    emoji:'🗓️', name:'Century of Practice', rarity:'epic',     desc:'Practice or play on 100 different days' },
  // Drills
  { id: 'drill_10',      emoji:'🧰', name:'Range Rat',          rarity:'common',    desc:'Complete 10 drills with your R10' },
  { id: 'drill_comb80',  emoji:'🎯', name:'Sharpshooter',       rarity:'epic',      desc:'Score 80+ in a Combine' },
  { id: 'drill_fw80',    emoji:'🛣️', name:'Fairway Machine',    rarity:'epic',      desc:'Hit 80%+ fairways in a Fairway Finder' },
  // Apex (the virtual course)
  { id: 'apex_explorer', emoji:'🗿', name:'Jungle Explorer',    rarity:'common',    desc:'Finish a round at Apex' },
  { id: 'apex_relics',   emoji:'🏺', name:'Relic Hunter',       rarity:'epic',      desc:'Earn a medal in every Apex challenge' },
  { id: 'apex_ace',      emoji:'🐆', name:'Jaguar Ace',         rarity:'legendary', desc:'Make a hole-in-one at Apex' },
  // Legendary
  { id: 'fifty_rounds',  emoji:'👑', name:'Dedicated',          rarity:'legendary', desc:'Log 50 rounds' },
  { id: 'tier_10',       emoji:'🌟', name:'Tour Pro',           rarity:'legendary', desc:'Reach Tour Pro tier' },
];

function checkBadges(rounds) {
  const earned = new Set(getBadgeState());
  const profile = getProfile();
  const newBadges = [];

  const award = (id) => {
    if (!earned.has(id)) { earned.add(id); newBadges.push(id); }
  };

  const totalRounds = rounds.length;
  const totalBirdies = rounds.reduce((s,r) =>
    s + (r.holes || []).filter(h => h.score < h.par).length, 0);
  const bestGIR = Math.max(0, ...rounds.map(r => r.girPct || 0));
  const hasUnderPar = rounds.some(r => r.score < r.par);
  const notesRounds = rounds.filter(r => r.notes && r.notes.trim()).length;
  const has9hole = rounds.some(r => r.holeCount === 9);
  const info = getTierInfo(profile.totalXP);

  if (totalRounds >= 1)  award('first_round');
  if (totalRounds >= 3)  award('three_rounds');
  if (totalRounds >= 10) award('ten_rounds');
  if (totalRounds >= 20) award('twenty_rounds');
  if (totalRounds >= 50) award('fifty_rounds');
  if (has9hole)          award('nine_holer');
  if (notesRounds >= 5)  award('notes_writer');
  if (totalBirdies >= 10) award('birdie_hunter');
  if (bestGIR >= 50)     award('gir_star');
  if (hasUnderPar)       award('under_par');
  if (profile.totalXP >= 1000)  award('xp_1000');
  if (profile.totalXP >= 5000)  award('xp_5000');
  if (info.tier >= 2)  award('tier_2');
  if (info.tier >= 5)  award('tier_5');
  if (info.tier >= 8)  award('tier_8');
  if (info.tier >= 10) award('tier_10');
  // Apex: virtual rounds and challenges (kept out of the real-round counts above)
  // Speed, consistency and drills
  const spdSessions = getSpeedSessions(), dpb = spdPB() || 0, profiles = getSpeedProfiles();
  const firstBase = (profiles.slice().reverse().find(p => p.best['Driver|normal']) || { best: {} }).best['Driver|normal'];
  [[100, 'speed_100'], [105, 'speed_105'], [110, 'speed_110'], [115, 'speed_115'], [120, 'speed_120']].forEach(([v, id]) => { if (dpb >= v) award(id); });
  if (firstBase) [[3, 'speed_gain3'], [5, 'speed_gain5'], [10, 'speed_gain10']].forEach(([v, id]) => { if (dpb - firstBase >= v) award(id); });
  const graduated = Object.keys(SPEED_PROGRAMS).filter(id => spdPlanPosition(id)?.complete);
  if (graduated.length) award('speed_grad');
  if (graduated.some(id => (spdConsistency(id) || 0) >= 90)) award('speed_grit');
  if (spdSessions.length >= 25) award('speed_25');
  const wp = weeklyProgress();
  [[2, 'streak_2'], [4, 'streak_4'], [12, 'streak_12'], [26, 'streak_26']].forEach(([v, id]) => { if (wp.best >= v) award(id); });
  if (wp.totalDays >= 25) award('active_25');
  if (wp.totalDays >= 100) award('active_100');
  const dh = getDrillData().history || {}, real = id => (dh[id] || []).filter(h => !h.test);
  if (Object.keys(dh).reduce((a, k) => a + real(k).length, 0) >= 10) award('drill_10');
  if (real('combine').some(h => h.avg >= 80)) award('drill_comb80');
  if (real('fairway').some(h => h.pct >= 80)) award('drill_fw80');
  const apexRounds = getApexRounds(), chBest = getApexChallengeBest();
  if (apexRounds.length) award('apex_explorer');
  if (APEX_CHALLENGES.every(c => (chBest[c.id] || {}).made >= 2)) award('apex_relics');
  if (apexRounds.some(r => r.holes.some(h => !h.maxed && apexHoleScore(h) === 1))) award('apex_ace');

  if (newBadges.length) {
    saveBadgeState([...earned]);
    newBadges.forEach((id, i) => {
      const def = BADGE_DEFS.find(b => b.id === id);
      if (def) setTimeout(() => i === 0 ? celebrate(`${def.emoji} Badge Unlocked: ${def.name}!`) : showToast(`${def.emoji} Badge Unlocked: ${def.name}!`), 1200 + i * 1500);
    });
  }
}

// ════════════════════════════════════════════════════════════
// BADGES PAGE
// ════════════════════════════════════════════════════════════
// Badges are grouped by what earns them
function badgeCategory(b) {
  if (b.id.startsWith('apex_')) return 'Apex';
  if (b.id.startsWith('speed_')) return 'Speed';
  if (b.id.startsWith('drill_')) return 'Drills';
  if (b.id.startsWith('streak_') || b.id.startsWith('active_')) return 'Consistency';
  if (b.id.startsWith('tier_') || b.id.startsWith('xp_')) return 'Progress';
  return 'Rounds';
}

function renderBadges() {
  const earned = new Set(getBadgeState());
  const el = document.getElementById('badges-content');
  const earnedCount = BADGE_DEFS.filter(b => earned.has(b.id)).length;

  let html = `<div class="card">
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;">
      <div class="card-title" style="margin:0;">Your Collection</div>
      <span style="font-size:0.85rem;font-weight:700;color:var(--gold-dark);">${earnedCount} / ${BADGE_DEFS.length} earned</span>
    </div>`;

  const rank = { common: 0, rare: 1, epic: 2, legendary: 3 };
  for (const cat of ['Rounds', 'Speed', 'Consistency', 'Drills', 'Apex', 'Progress']) {
    const group = BADGE_DEFS.filter(b => badgeCategory(b) === cat).sort((a, b) => rank[a.rarity] - rank[b.rarity]);
    if (!group.length) continue;
    const have = group.filter(b => earned.has(b.id)).length;
    html += `<div style="margin-bottom:18px;">
      <div style="display:flex;justify-content:space-between;font-size:0.72rem;font-weight:800;text-transform:uppercase;letter-spacing:1px;color:var(--gray-mid);margin-bottom:8px;"><span>${cat}</span><span>${have}/${group.length}</span></div>
      <div class="badge-grid">
        ${group.map(b => {
          const isEarned = earned.has(b.id), label = b.rarity.charAt(0).toUpperCase() + b.rarity.slice(1);
          return `<div class="badge-item ${isEarned ? 'earned ' + b.rarity : ''}" title="${b.desc}">
            <div class="badge-emoji">${b.emoji}</div>
            <div class="badge-name">${b.name}</div>
            <div class="badge-desc">${b.desc}</div>
            <div class="badge-rarity">${label}</div>
          </div>`;
        }).join('')}
      </div>
    </div>`;
  }

  html += '</div>';
  el.innerHTML = html;
}

// ════════════════════════════════════════════════════════════
// QUEST SYSTEM
// ════════════════════════════════════════════════════════════
const QUEST_DEFS = [
  // ── Scoring ──────────────────────────────────────────────
  { id:'break_110',   tier:'bronze', cat:'Scoring',     name:'Break 110',          desc:'Shoot 109 or better on an 18-hole round',         xp:200,  total:1,
    check: r => r.holeCount===18 && r.score<=109 ? 1 : 0 },
  { id:'break_100',   tier:'silver', cat:'Scoring',     name:'Break 100',          desc:'Shoot 99 or better on an 18-hole round',          xp:350,  total:1,
    check: r => r.holeCount===18 && r.score<=99  ? 1 : 0 },
  { id:'break_90',    tier:'silver', cat:'Scoring',     name:'Break 90',           desc:'Shoot 89 or better on an 18-hole round',          xp:600,  total:1,
    check: r => r.holeCount===18 && r.score<=89  ? 1 : 0 },
  { id:'break_80',    tier:'gold',   cat:'Scoring',     name:'Break 80',           desc:'Shoot 79 or better on an 18-hole round',          xp:1200, total:1,
    check: r => r.holeCount===18 && r.score<=79  ? 1 : 0 },
  { id:'break_45_9',  tier:'bronze', cat:'Scoring',     name:'Break 45 (9H)',      desc:'Shoot 44 or better on a 9-hole round',            xp:150,  total:1,
    check: r => r.holeCount===9  && r.score<=44  ? 1 : 0 },
  { id:'break_40_9',  tier:'silver', cat:'Scoring',     name:'Break 40 (9H)',      desc:'Shoot 39 or better on a 9-hole round',            xp:300,  total:1,
    check: r => r.holeCount===9  && r.score<=39  ? 1 : 0 },
  { id:'under_par',   tier:'gold',   cat:'Scoring',     name:'Sub-Par Round',      desc:'Shoot under par in any round',                    xp:900,  total:1,
    check: r => r.score < r.par ? 1 : 0 },

  // ── Volume ────────────────────────────────────────────────
  { id:'rounds_5',    tier:'bronze', cat:'Volume',      name:'Getting Started',    desc:'Log 5 rounds',                                    xp:150,  total:5,
    checkAll: rs => rs.length },
  { id:'rounds_15',   tier:'silver', cat:'Volume',      name:'Regular Golfer',     desc:'Log 15 rounds',                                   xp:400,  total:15,
    checkAll: rs => rs.length },
  { id:'rounds_30',   tier:'gold',   cat:'Volume',      name:'Course Veteran',     desc:'Log 30 rounds',                                   xp:900,  total:30,
    checkAll: rs => rs.length },

  // ── Birdies ───────────────────────────────────────────────
  { id:'birdie_1',    tier:'bronze', cat:'Scoring',     name:'First Birdie',       desc:'Make your first birdie',                          xp:100,  total:1,
    checkAll: rs => Math.min(1, rs.reduce((s,r)=>s+(r.holes||[]).filter(h=>h.score<h.par).length,0)) },
  { id:'birdie_10',   tier:'silver', cat:'Scoring',     name:'Bird Watcher',       desc:'Make 10 birdies total',                           xp:450,  total:10,
    checkAll: rs => rs.reduce((s,r)=>s+(r.holes||[]).filter(h=>h.score<h.par).length,0) },
  { id:'birdie_25',   tier:'gold',   cat:'Scoring',     name:'Birdie Machine',     desc:'Make 25 birdies total',                           xp:1000, total:25,
    checkAll: rs => rs.reduce((s,r)=>s+(r.holes||[]).filter(h=>h.score<h.par).length,0) },

  // ── Stats ─────────────────────────────────────────────────
  { id:'gir_33',      tier:'bronze', cat:'Stats',       name:'Green Seeker',       desc:'Hit GIR on 33%+ of holes in a round',             xp:150,  total:1,
    check: r => r.girPct>=33 ? 1 : 0 },
  { id:'gir_50',      tier:'silver', cat:'Stats',       name:'Green Machine',      desc:'Hit GIR on 50%+ of holes in a round',             xp:350,  total:1,
    check: r => r.girPct>=50 ? 1 : 0 },
  { id:'gir_50_3x',   tier:'gold',   cat:'Stats',       name:'Iron Sharpens Iron', desc:'Hit 50%+ GIR in 3 different rounds',              xp:700,  total:3,
    checkAll: rs => rs.filter(r=>r.girPct>=50).length },
  { id:'fir_50',      tier:'bronze', cat:'Stats',       name:'Fairway Finder',     desc:'Hit FIR on 50%+ of holes in a round',             xp:150,  total:1,
    check: r => r.firPct>=50 ? 1 : 0 },
  { id:'fir_60_3x',   tier:'silver', cat:'Stats',       name:'Straight & Narrow',  desc:'Hit 60%+ FIR in 3 different rounds',              xp:400,  total:3,
    checkAll: rs => rs.filter(r=>r.firPct>=60).length },
  { id:'putts_30',    tier:'silver', cat:'Stats',       name:'Putting Master',     desc:'Take 30 or fewer putts in an 18-hole round',      xp:450,  total:1,
    check: r => r.holeCount===18 && r.putts<=30 ? 1 : 0 },

  // ── Apex (virtual course; checkApex gets the Apex rounds and challenge bests) ──
  { id:'apex_round',  tier:'bronze', cat:'Apex',        name:'Into the Jungle',    desc:'Finish an 18-hole round at Apex',                 xp:150,  total:1,
    checkApex: rs => rs.filter(r => r.holeCount === 18).length },
  { id:'apex_90',     tier:'silver', cat:'Apex',        name:'Temple Breaker',     desc:'Break 90 at Apex (18 holes, any tees)',           xp:350,  total:1,
    checkApex: rs => rs.filter(r => r.holeCount === 18 && r.score < 90).length },
  { id:'apex_80',     tier:'gold',   cat:'Apex',        name:'Summit Master',      desc:'Break 80 at Apex from the Temple or Jaguar tees', xp:800,  total:1,
    checkApex: rs => rs.filter(r => r.holeCount === 18 && r.score < 80 && !/Canopy$/.test(r.course)).length },
  { id:'apex_birdies',tier:'silver', cat:'Apex',        name:'Jungle Birdies',     desc:'Make 10 birdies or better at Apex',               xp:300,  total:10,
    checkApex: rs => rs.reduce((a, r) => a + r.holes.filter(h => !h.maxed && apexHoleScore(h) < h.par).length, 0) },
  { id:'apex_ch_4',   tier:'silver', cat:'Apex',        name:'Challenger',         desc:'Earn a medal in 4 Apex challenges',               xp:250,  total:4,
    checkApex: (rs, ch) => APEX_CHALLENGES.filter(c => (ch[c.id] || {}).made >= 2).length },
  { id:'apex_ch_gold',tier:'gold',   cat:'Apex',        name:'Golden Jungle',      desc:'Win gold in every Apex challenge',                xp:1000, get total() { return APEX_CHALLENGES.length; }, // (apex-challenges.js loads later)
    checkApex: (rs, ch) => APEX_CHALLENGES.filter(c => (ch[c.id] || {}).made >= 4).length },

  // ── Speed and consistency (checkAny takes no arguments) ──
  { id:'speed_base',    tier:'bronze', cat:'Speed',       name:'Baseline Set',       desc:'Take a speed baseline test',                      xp:100,  total:1,
    checkAny: () => Math.min(1, getSpeedProfiles().length) },
  { id:'speed_10',      tier:'silver', cat:'Speed',       name:'Ten Sessions',       desc:'Complete 10 speed sessions',                      xp:250,  total:10,
    checkAny: () => getSpeedSessions().filter(s => s.completed).length },
  { id:'speed_prog',    tier:'gold',   cat:'Speed',       name:'Graduate',           desc:'Complete a speed training program',               xp:600,  total:1,
    checkAny: () => Object.keys(SPEED_PROGRAMS).some(id => spdPlanPosition(id)?.complete) ? 1 : 0 },
  { id:'speed_plus3',   tier:'silver', cat:'Speed',       name:'Plus Three',         desc:'Gain 3 mph over your first baseline',             xp:400,  total:3,
    checkAny: () => { const p = getSpeedProfiles().slice().reverse().find(x => x.best['Driver|normal']); return p ? Math.max(0, Math.floor((spdPB() || 0) - p.best['Driver|normal'])) : 0; } },
  { id:'speed_plus5',   tier:'gold',   cat:'Speed',       name:'Plus Five',          desc:'Gain 5 mph over your first baseline',             xp:800,  total:5,
    checkAny: () => { const p = getSpeedProfiles().slice().reverse().find(x => x.best['Driver|normal']); return p ? Math.max(0, Math.floor((spdPB() || 0) - p.best['Driver|normal'])) : 0; } },
  { id:'streak_q4',     tier:'silver', cat:'Consistency', name:'Four-Week Streak',   desc:'Hit your weekly practice goal 4 weeks in a row',  xp:400,  total:4,
    checkAny: () => weeklyProgress().best },
  { id:'active_q50',    tier:'gold',   cat:'Consistency', name:'Fifty Days',         desc:'Practice or play on 50 different days',           xp:700,  total:50,
    checkAny: () => weeklyProgress().totalDays },

  // ── Drills (checkDrills gets the drill history) ──
  { id:'drill_combine', tier:'bronze', cat:'Drills',      name:'Combine Rookie',     desc:'Complete a Combine with your R10',                xp:150,  total:1,
    checkDrills: d => (d.history.combine || []).filter(h => !h.test).length },
  { id:'drill_comb_70', tier:'gold',   cat:'Drills',      name:'Combine 70',         desc:'Score 70 or more in a Combine',                   xp:700,  total:1,
    checkDrills: d => (d.history.combine || []).some(h => !h.test && h.avg >= 70) ? 1 : 0 },
  { id:'drill_fw_60',   tier:'silver', cat:'Drills',      name:'Fairway Finder',     desc:'Hit 60%+ fairways in a Fairway Finder test',      xp:300,  total:1,
    checkDrills: d => (d.history.fairway || []).some(h => !h.test && h.pct >= 60) ? 1 : 0 },
  { id:'drill_wedges',  tier:'bronze', cat:'Drills',      name:'Know Your Numbers',  desc:'Complete a Wedge Matrix',                         xp:150,  total:1,
    checkDrills: d => (d.history.wedges || []).filter(h => !h.test).length },
  { id:'drill_nine',    tier:'gold',   cat:'Drills',      name:'Shotmaker',          desc:'Hit all nine shapes in the 9-Shot Drill',         xp:800,  total:1,
    checkDrills: d => (d.history.nine || []).some(h => !h.test && h.made === 9) ? 1 : 0 },

  // ── Improvement ───────────────────────────────────────────
  { id:'notes_5',     tier:'bronze', cat:'Improvement', name:'Analyst',            desc:'Add notes to 5 rounds',                           xp:120,  total:5,
    checkAll: rs => rs.filter(r=>r.notes&&r.notes.trim()).length },
  { id:'notes_15',    tier:'silver', cat:'Improvement', name:'Student of the Game',desc:'Add notes to 15 rounds',                          xp:350,  total:15,
    checkAll: rs => rs.filter(r=>r.notes&&r.notes.trim()).length },
];

const QUEST_MEDAL = { gold: '🥇', silver: '🥈', bronze: '🥉' };

// Storage: set of quest IDs that have already fired a completion toast
function getAwardedQuests() {
  return new Set(loadData(KEYS.quests, []));
}
function saveAwardedQuests(set) {
  saveData(KEYS.quests, [...set]);
}

// Returns current progress (number) for a quest given all rounds
function questProgress(q, rounds) {
  let raw = q.checkAny ? q.checkAny()
           : q.checkDrills ? q.checkDrills(getDrillData())
           : q.checkApex ? q.checkApex(getApexRounds(), getApexChallengeBest())
           : q.checkAll ? q.checkAll(rounds)
           : rounds.reduce((s,r) => s + q.check(r), 0);
  return Math.min(q.total, raw);
}

// Call after every saveRound() — detects newly completed quests and toasts them
function checkQuests(rounds) {
  const awarded = getAwardedQuests();
  const newlyDone = [];

  for (const q of QUEST_DEFS) {
    if (awarded.has(q.id)) continue;
    const prog = questProgress(q, rounds);
    if (prog >= q.total) {
      awarded.add(q.id);
      newlyDone.push(q);
    }
  }

  if (newlyDone.length) {
    saveAwardedQuests(awarded);
    newlyDone.forEach((q, i) => {
      awardXP(q.xp, q.name);
      const emoji = QUEST_MEDAL[q.tier];
      setTimeout(()=> showToast(`${emoji} Quest Complete: ${q.name}! +${q.xp} XP`), 600 + i*1600);
    });
  }
}

// Active quests = incomplete, sorted by % complete descending
function getActiveQuests(rounds, limit=4) {
  const awarded = getAwardedQuests();
  return QUEST_DEFS
    .filter(q => !awarded.has(q.id))
    .map(q => ({ ...q, prog: questProgress(q, rounds) }))
    .filter(q => q.prog < q.total)
    .sort((a,b) => (b.prog/b.total) - (a.prog/a.total))
    .slice(0, limit);
}

function renderQuestsWidget(rounds) {
  const active = getActiveQuests(rounds, 3);
  if (!active.length) return `<div class="card">
    <div class="card-title">Active Quests</div>
    <p style="font-size:0.85rem;color:var(--gray-mid);">All quests complete! Head to the Quests tab to see your history.</p>
  </div>`;

  const rows = active.map(q => {
    const pct = Math.round(q.prog/q.total*100);
    const emoji = QUEST_MEDAL[q.tier];
    return `<div class="active-quest-row">
      <div style="font-size:1.3rem;">${emoji}</div>
      <div class="aq-info">
        <div class="aq-name">${q.name}</div>
        <div class="aq-desc">${q.desc}</div>
        <div class="aq-bar-bg"><div class="aq-bar-fill" style="width:${pct}%"></div></div>
      </div>
      <div class="aq-count">${q.prog}/${q.total}</div>
    </div>`;
  }).join('');

  return `<div class="card">
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;">
      <div class="card-title" style="margin:0;">Active Quests</div>
      <button class="btn btn-sm" style="background:var(--gray-light);color:var(--gray-dark);font-size:0.78rem;" onclick="showPage('quests')">View All</button>
    </div>
    ${rows}
  </div>`;
}

function renderQuests() {
  const rounds  = getAllRounds();
  const awarded = getAwardedQuests();
  const el      = document.getElementById('quests-content');

  const categories = [...new Set(QUEST_DEFS.map(q=>q.cat))];
  const completedCount = QUEST_DEFS.filter(q=>awarded.has(q.id)).length;

  let html = `<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px;">
    <p style="font-size:0.85rem;color:var(--gray-mid);">Complete quests to earn bonus XP.</p>
    <span style="font-size:0.85rem;font-weight:700;color:var(--gold-dark);">${completedCount}/${QUEST_DEFS.length} done</span>
  </div>`;

  for (const cat of categories) {
    const quests = QUEST_DEFS.filter(q=>q.cat===cat);
    html += `<div class="card">
      <div class="card-title">${cat}</div>`;

    for (const q of quests) {
      const prog    = questProgress(q, rounds);
      const done    = awarded.has(q.id);
      const pct     = Math.round(prog/q.total*100);
      const tierCls = `tier-${q.tier}`;
      const barCls  = q.tier;

      html += `<div class="quest-item" style="${done?'opacity:0.55':''}">
        <span class="quest-tier-badge ${tierCls}">${q.tier}</span>
        <div class="quest-info">
          <div class="quest-name">${q.name}</div>
          <div class="quest-desc">${q.desc}</div>
        </div>
        <div class="quest-right">
          ${done
            ? `<div class="quest-done">✅</div>`
            : `<div class="quest-progress-label">${prog} / ${q.total}</div>
               <div class="quest-bar-bg"><div class="quest-bar-fill ${barCls}" style="width:${pct}%"></div></div>`
          }
          <div class="quest-xp">+${q.xp} XP</div>
        </div>
      </div>`;
    }

    html += `</div>`;
  }

  el.innerHTML = html;
}

// ════════════════════════════════════════════════════════════
// PUTTING CHALLENGES
// ════════════════════════════════════════════════════════════
const PUTTING_CHALLENGES = [
  // ── Bronze — Short Game Foundation ──────────────────────
  { id:'p_3ft_foundation', tier:'bronze', name:'3-Foot Foundation',
    req:'Make 10 putts in a row from 3 feet.',
    tip:'Stand directly over the ball. Pick a spot on your target line just an inch ahead and roll over it.',
    xp:75 },
  { id:'p_gate_drill', tier:'bronze', name:'Gate Drill',
    req:'Roll 15 putts through a two-tee gate (slightly wider than putter face) from 4 feet without hitting a tee.',
    tip:'If you can thread the gate, your face is square. Misses reveal exactly where your stroke goes offline.',
    xp:75 },
  { id:'p_clock_3ft', tier:'bronze', name:'Clock Drill — 3 Feet',
    req:'Place 4 balls at 3 feet at 12, 3, 6, and 9 o\'clock positions. Make all 4 without missing.',
    tip:'Each position has a different break. Learn to read it before you step into the putt.',
    xp:100 },
  { id:'p_one_hand', tier:'bronze', name:'One-Hand Drill',
    req:'Make 10 putts from 4 feet using your lead hand only.',
    tip:'Forces you to feel the putter face with your dominant hand. Great for eliminating the "flip."',
    xp:75 },
  { id:'p_pace_20ft', tier:'bronze', name:'Pace Control I',
    req:'Roll 5 lag putts from 20 feet — all must finish within 18 inches of the hole.',
    tip:'Forget the hole. Focus on rolling the ball to a 3-foot circle. Distance control beats direction at this range.',
    xp:100 },
  { id:'p_straight_5ft', tier:'bronze', name:'Straight Line',
    req:'Make 7 of 10 putts from 5 feet on a straight, flat putt.',
    tip:'Place a tee 6 inches behind the ball on your target line. If your putter touches it on the backswing, you\'re cutting across.',
    xp:75 },
  { id:'p_10_footer', tier:'bronze', name:'10-Footer Intro',
    req:'Make 3 of 10 putts from 10 feet.',
    tip:'Tour average from 10 feet is ~40%. Three makes is a solid start. Focus on starting the ball on your intended line.',
    xp:100 },
  { id:'p_lag_30ft', tier:'bronze', name:'Lag Specialist I',
    req:'From 30 feet, 2-putt 5 times in a row (no 3-putts).',
    tip:'Pick a landing spot 2 feet past the hole and putt to that spot, not the hole. Eliminates short lag putts.',
    xp:125 },

  // ── Silver — Building Real Skill ────────────────────────
  { id:'p_6ft_streak', tier:'silver', name:'6-Foot Streak',
    req:'Make 10 putts in a row from 6 feet.',
    tip:'6 feet is the most important distance in golf — inside this range you\'re expected to make it. Build the habit.',
    xp:150 },
  { id:'p_clock_6ft', tier:'silver', name:'Clock Drill — 6 Feet',
    req:'Place 4 balls at 6 feet at 12, 3, 6, and 9 o\'clock. Make all 4.',
    tip:'The hardest positions will be the ones with left-to-right break. Aim at the high edge and trust the speed.',
    xp:175 },
  { id:'p_pressure_streak', tier:'silver', name:'Pressure Streak',
    req:'Make 20 consecutive putts from 4 feet. Restart from 0 if you miss.',
    tip:'The last 5 are the hardest. Slow down your routine on each putt — pressure speeds everything up.',
    xp:200 },
  { id:'p_breaking_8ft', tier:'silver', name:'Breaking Putt Master',
    req:'Make 5 left-to-right breakers from 8 feet and 5 right-to-left breakers from 8 feet.',
    tip:'Play the apex, not the hole. Find the highest point of the break and aim at that. Let gravity do the rest.',
    xp:175 },
  { id:'p_pace_40ft', tier:'silver', name:'Lag Specialist II',
    req:'From 40 feet, 2-putt 5 times in a row.',
    tip:'From 40+ feet, 3-putts wreck your score more than anything. Dial in speed — direction is secondary.',
    xp:200 },
  { id:'p_100_putts', tier:'silver', name:'The Grind',
    req:'Make 100 total putts in a single practice session (any distance).',
    tip:'Mix it up: 30 from 3 feet, 30 from 6 feet, 20 from 10 feet, 20 from 20+ feet. Quality over quantity.',
    xp:225 },
  { id:'p_10ft_mastery', tier:'silver', name:'10-Foot Mastery',
    req:'Make 6 of 10 putts from 10 feet.',
    tip:'At 60% from 10 feet you\'re better than most club players. Commit to your read before every single putt.',
    xp:200 },
  { id:'p_updown_fringe', tier:'silver', name:'Up-and-Down Artist I',
    req:'Get up and down (chip or putt + one putt) from the fringe in 3 of 5 attempts.',
    tip:'From the fringe, use a putting stroke with a 7-iron or hybrid. Far more consistent than chipping for most players.',
    xp:225 },
  { id:'p_distance_10ft', tier:'silver', name:'Precision Speed',
    req:'From 10 feet, stop 7 of 10 balls within 6 inches of the hole (whether you make it or not).',
    tip:'Ignore the hole for this drill. You\'re training speed, not direction. A putt that dies at the hole is perfectly struck.',
    xp:175 },
  { id:'p_eyes_closed', tier:'silver', name:'Feel Drill',
    req:'Make 10 putts from 4 feet with your eyes closed after the setup.',
    tip:'Close your eyes after you\'ve aimed. Forces you to rely on feel rather than looking up. Builds a repeatable stroke.',
    xp:150 },

  // ── Gold — Advanced & Pressure ──────────────────────────
  { id:'p_clock_10ft', tier:'gold', name:'Clock Drill — 10 Feet',
    req:'Place 4 balls at 10 feet at 12, 3, 6, and 9 o\'clock. Make all 4 without missing.',
    tip:'At 10 feet, one miss and you restart. Commit fully to each read. Tension in your hands is your enemy.',
    xp:350 },
  { id:'p_15ft_sniper', tier:'gold', name:'15-Foot Sniper',
    req:'Make 5 of 10 putts from 15 feet.',
    tip:'Tour average from 15 feet is ~25%. 5 of 10 is elite. Focus on a smooth, rhythmic stroke — don\'t guide it.',
    xp:400 },
  { id:'p_lag_50ft', tier:'gold', name:'Long Lag Master',
    req:'From 50+ feet, 2-putt 5 times in a row.',
    tip:'Walk the line from ball to hole before putting. Feel the slope with your feet — your body knows the slope better than your eyes.',
    xp:375 },
  { id:'p_updown_II', tier:'gold', name:'Up-and-Down Artist II',
    req:'Get up and down from a greenside bunker or rough in 4 of 5 attempts.',
    tip:'The putt after the chip is where most amateurs give up. Commit to making the follow-up putt — that\'s the real challenge.',
    xp:400 },
  { id:'p_20ft_specialist', tier:'gold', name:'20-Foot Specialist',
    req:'Make 4 of 10 putts from 20 feet.',
    tip:'Read the putt from both sides and behind the hole. The view from behind the hole shows the final break most clearly.',
    xp:425 },
  { id:'p_pressure_30', tier:'gold', name:'Pressure 30',
    req:'Make 30 consecutive putts from 3 feet without missing.',
    tip:'Putts 25–30 are pure mental. Breathe before each one. Same routine, same tempo — pretend putt 30 is putt 1.',
    xp:450 },
  { id:'p_no_3putt', tier:'gold', name:'3-Putt Free Zone',
    req:'Complete 18 holes of putting practice (on a putting green) without a single 3-putt.',
    tip:'Play from at least 30 feet on every hole. If you 3-putt, reset and start over. This builds real mental toughness.',
    xp:500 },
  { id:'p_speed_mastery', tier:'gold', name:'Speed Control Master',
    req:'From 25 feet, stop 8 of 10 balls within 12 inches of the hole.',
    tip:'Your pre-shot routine must include a practice stroke where you look at the hole. Your body already knows the distance.',
    xp:400 },
  { id:'p_one_hand_adv', tier:'gold', name:'One-Hand Challenge',
    req:'Make 10 putts from 6 feet using your lead hand only.',
    tip:'If you can make 10 from 6 feet with one hand, your two-handed stroke will feel effortless by comparison.',
    xp:350 },
  { id:'p_tour_routine', tier:'gold', name:'Tour Routine',
    req:'Complete 20 putts in a row using a full pre-shot routine (read, practice stroke, aim, putt) from 6–10 feet — make at least 15.',
    tip:'The routine is the goal. Tour players don\'t think about mechanics over the ball — they trust the preparation.',
    xp:450 },
  { id:'p_legend', tier:'gold', name:'The Legend',
    req:'Make 50 putts from 6 feet in a single session without missing 3 in a row.',
    tip:'This is the ultimate short putt test. The rule of "no 3 misses in a row" mirrors real pressure. Every make matters.',
    xp:750 },
];

// Storage
function getPuttingDone() {
  return new Set(loadData(KEYS.putting, []));
}
function savePuttingDone(set) {
  saveData(KEYS.putting, [...set]);
}

function completePuttingChallenge(id) {
  const done = getPuttingDone();
  if (done.has(id)) return;
  done.add(id);
  savePuttingDone(done);

  const ch = PUTTING_CHALLENGES.find(c => c.id === id);
  if (!ch) return;
  awardXP(ch.xp, ch.name);
  showToast(`🏌️ Putting challenge complete: ${ch.name}! +${ch.xp} XP`);

  // Re-render to update UI
  renderPutting();
  updateXPHeader();
}

function renderPutting() {
  const done  = getPuttingDone();
  const total = PUTTING_CHALLENGES.length;
  const comp  = done.size;
  const pct   = Math.round(comp / total * 100);
  const el    = document.getElementById('putting-content');

  const tiers = ['bronze', 'silver', 'gold'];
  const tierLabels = { bronze: '🥉 Bronze — Short Game Foundation', silver: '🥈 Silver — Building Real Skill', gold: '🥇 Gold — Advanced & Pressure' };

  let html = `
    <div class="putting-header">
      <div>
        <div class="putting-progress-big">${comp} <span style="font-size:1.2rem;opacity:0.7;">/ ${total}</span></div>
        <div class="putting-progress-label">Challenges Completed</div>
      </div>
      <div class="putting-progress-bar-bg">
        <div class="putting-progress-bar-fill" style="width:${pct}%"></div>
      </div>
      <div style="text-align:right;">
        <div style="font-size:1.4rem;font-weight:900;">${pct}%</div>
        <div style="font-size:0.8rem;opacity:0.75;">Complete</div>
      </div>
    </div>
    <p style="font-size:0.85rem;color:var(--gray-mid);margin-bottom:20px;">
      Mark a challenge complete after you've done it during practice. Putting is 40% of your score — master it here first.
    </p>`;

  for (const tier of tiers) {
    const challenges = PUTTING_CHALLENGES.filter(c => c.tier === tier);
    const tierDone   = challenges.filter(c => done.has(c.id)).length;
    html += `<div class="putting-section-title">${tierLabels[tier]} — ${tierDone}/${challenges.length}</div>
    <div class="putting-grid">`;

    for (const ch of challenges) {
      const isDone = done.has(ch.id);
      html += `
        <div class="putting-card ${isDone ? 'done' : ''}">
          <div class="putting-card-top">
            <div class="putting-card-name">${isDone ? '✅ ' : ''}${ch.name}</div>
            <div class="putting-card-xp">+${ch.xp} XP</div>
          </div>
          <div class="putting-card-req"><strong>Challenge:</strong> ${ch.req}</div>
          <div class="putting-card-tip">💡 ${ch.tip}</div>
          <button
            class="putting-card-btn ${isDone ? 'complete' : 'incomplete'}"
            onclick="${isDone ? '' : `completePuttingChallenge('${ch.id}')`}"
            ${isDone ? 'disabled' : ''}
          >${isDone ? 'Completed ✓' : 'Mark Complete'}</button>
        </div>`;
    }

    html += `</div>`;
  }

  el.innerHTML = html;
}

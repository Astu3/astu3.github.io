// Golf Improvement App — Activity tracking and engagement: weekly goal and streak, activity
// heatmap, personal records, the speed goal, celebrations and the after-activity checks.
// Classic script: shares globals with the other files; load order is set in golf-improvement-app.html.

// ════════════════════════════════════════════════════════════
// PROGRESS
// Every kind of practice counts toward one activity log, built from the data
// the app already keeps (rounds, strokes-gained rounds, speed sessions, drills,
// Apex rounds, range shots), so nothing has to be logged twice.
// A week runs Monday to Sunday. The streak counts weeks in a row that met the
// weekly goal (active days); the current week joins the streak once it's met.
// ════════════════════════════════════════════════════════════
const ACTIVITY_TYPES = {
  round: { icon: '⛳', name: 'Round' }, speed: { icon: '⚡', name: 'Speed' }, drill: { icon: '🎯', name: 'Drill' },
  apex:  { icon: '🗿', name: 'Apex' },  range: { icon: '📡', name: 'Range' },
};
const WEEKLY_BONUS_XP = 100;

function weeklyGoal() { return getPrefs().weeklyGoal || 3; }
function setWeeklyGoal(n) { setPref('weeklyGoal', n); refreshProgressViews(); }

const isoOf = d => { const z = new Date(d); return `${z.getFullYear()}-${String(z.getMonth() + 1).padStart(2, '0')}-${String(z.getDate()).padStart(2, '0')}`; };
function weekStart(iso) { // Monday of that week (ISO date)
  const d = new Date(iso + 'T12:00:00'), dow = (d.getDay() + 6) % 7;
  d.setDate(d.getDate() - dow); return isoOf(d);
}

// date → Set of activity types
function activityDaysRaw() {
  const days = new Map(), add = (date, type) => { if (!date) return; if (!days.has(date)) days.set(date, new Set()); days.get(date).add(type); };
  getRounds().forEach(r => add(r.date, 'round'));
  getSGRounds().forEach(r => add(r.date, 'round'));
  getSpeedSessions().forEach(s => add(s.date, 'speed'));
  Object.values(getDrillData().history || {}).forEach(list => list.forEach(h => { if (!h.test) add(isoOf(h.at), 'drill'); }));
  getApexRounds().forEach(r => add(r.date, 'apex'));
  Object.entries(loadData(KEYS.activity, {})).forEach(([d, types]) => types.forEach(t => add(d, t)));
  const rangeByDay = {};
  getRangeShots().forEach(s => { if (!s.drill) rangeByDay[s.date] = (rangeByDay[s.date] || 0) + 1; });
  Object.entries(rangeByDay).forEach(([d, n]) => { if (n >= 5) add(d, 'range'); }); // a real range session, not one stray shot
  return days;
}

// This week's active days, the streak and the best streak ever
function weeklyProgress() {
  const days = activityDays(), goal = weeklyGoal(), perWeek = new Map();
  days.forEach((_, d) => { const w = weekStart(d); perWeek.set(w, (perWeek.get(w) || 0) + 1); });
  const thisWeek = weekStart(todayISO()), activeThisWeek = perWeek.get(thisWeek) || 0;
  const prevWeek = w => { const d = new Date(w + 'T12:00:00'); d.setDate(d.getDate() - 7); return isoOf(d); };
  let streak = 0, w = activeThisWeek >= goal ? thisWeek : prevWeek(thisWeek);
  while ((perWeek.get(w) || 0) >= goal) { streak++; w = prevWeek(w); }
  // best streak: scan every week from the first activity to now
  let best = 0, run = 0;
  const weeks = [...perWeek.keys()].sort();
  if (weeks.length) for (let x = weeks[0]; x <= thisWeek; ) {
    run = (perWeek.get(x) || 0) >= goal ? run + 1 : 0; best = Math.max(best, run);
    const d = new Date(x + 'T12:00:00'); d.setDate(d.getDate() + 7); x = isoOf(d);
  }
  const dow = (new Date().getDay() + 6) % 7, daysLeft = 7 - dow; // including today
  return { goal, activeThisWeek, met: activeThisWeek >= goal, streak, best, daysLeft, activeToday: days.has(todayISO()), totalDays: days.size, days };
}

// ── After any activity: daily tasks, the weekly bonus, badges and quests ──
function onActivity(type, detail = {}) {
  if (typeof planCurrent === 'function') setTimeout(() => planReward(planCurrent()), 600); // a drill, session or test may finish a plan block
  const log = loadData(KEYS.activity, {}), today = todayISO();
  // (range days come from the shots themselves: five or more make a session)
  if (type !== 'range' && !(log[today] || []).includes(type)) { log[today] = [...(log[today] || []), type]; saveData(KEYS.activity, log); }
  const done = getCompletedToday(), toastTask = id => { if (!done.includes(id) && completeTask(id)) { const t = DAILY_TASKS.find(x => x.id === id); if (t) setTimeout(() => showToast(`${t.icon} Daily task: ${t.name} +${t.xp} XP`), 400); } };
  if (type === 'speed') { toastTask('speed_session'); if (detail.pb) toastTask('speed_pb'); }
  if (type === 'drill') toastTask('drill_done');
  if (type === 'apex') toastTask('apex_play');
  if (type === 'range') { const n = getRangeShots().filter(s => s.date === todayISO() && !s.drill).length; if (n >= 20) toastTask('range_20'); }
  // Weekly goal reached: a bonus once per week
  const wp = weeklyProgress(), wk = weekStart(todayISO()), paid = getPrefs().weeklyBonus || [];
  if (wp.met && !paid.includes(wk)) {
    setPref('weeklyBonus', [...paid, wk].slice(-60));
    awardXP(WEEKLY_BONUS_XP, 'weekly goal');
    celebrate(`🔥 Weekly goal reached! ${wp.streak > 1 ? `${wp.streak}-week streak · ` : ''}+${WEEKLY_BONUS_XP} XP`);
  }
  checkBadges(getAllRounds()); checkQuests(getAllRounds());
}
function refreshProgressViews() {
  const active = id => document.getElementById('page-' + id)?.classList.contains('active');
  if (active('dashboard')) renderDashboard();
  if (active('speed') && typeof spd !== 'undefined' && !spd) renderSpeed();
}

// ── Celebrations ───────────────────────────────────────────────
function celebrate(message) {
  if (message) showToast(message);
  if (typeof apexSound === 'function') apexSound('chime', 0, { level: 2 });
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const cv = document.createElement('canvas'); cv.className = 'confetti-canvas';
  cv.width = innerWidth; cv.height = innerHeight; document.body.appendChild(cv);
  const ctx = cv.getContext('2d'), colors = ['#52b788', '#f4a261', '#e63946', '#457b9d', '#ffd166', '#2d6a4f'];
  const bits = Array.from({ length: 140 }, () => ({ x: innerWidth / 2 + (Math.random() - 0.5) * 120, y: innerHeight * 0.35, vx: (Math.random() - 0.5) * 14, vy: -6 - Math.random() * 10,
    s: 5 + Math.random() * 6, r: Math.random() * 6, vr: (Math.random() - 0.5) * 0.4, c: colors[(Math.random() * colors.length) | 0] }));
  const t0 = performance.now();
  (function frame(t) {
    const el = t - t0; ctx.clearRect(0, 0, cv.width, cv.height);
    bits.forEach(b => { b.vy += 0.35; b.vx *= 0.99; b.x += b.vx; b.y += b.vy; b.r += b.vr;
      ctx.save(); ctx.translate(b.x, b.y); ctx.rotate(b.r); ctx.globalAlpha = Math.max(0, 1 - el / 2600); ctx.fillStyle = b.c; ctx.fillRect(-b.s / 2, -b.s / 4, b.s, b.s / 2); ctx.restore(); });
    if (el < 2600) requestAnimationFrame(frame); else cv.remove();
  })(t0);
}

// ── Speed goal ─────────────────────────────────────────────────
function speedGoal() { return getPrefs().speedGoal || null; } // mph
function setSpeedGoal() {
  const cur = spdPB(), unit = unitLabel();
  const v = prompt(`Target driver speed (${unit})?`, cur ? Math.ceil(toUnit(cur) + (speedUnit() === 'kmh' ? 8 : 5)) : '');
  if (v === null) return;
  const mph = fromUnit(parseFloat(v));
  if (!isFinite(mph) || mph < 50 || mph > 160) { showToast('Enter a realistic driver speed'); return; }
  setPref('speedGoal', Math.round(mph * 10) / 10); setPref('speedGoalSet', todayISO()); refreshProgressViews();
}
function clearSpeedGoal() { setPref('speedGoal', null); refreshProgressViews(); }
// Trend over the last 90 days of session tops: mph per week, and when the goal is reached at that pace
function speedTrend() {
  const pts = getSpeedSessions().filter(s => s.max && !SPD_SPECIAL[s.programId]).map(s => ({ x: (new Date(s.date + 'T12:00:00') - Date.now()) / 86400000, y: s.max }))
    .filter(p => p.x > -90);
  if (pts.length < 4) return null;
  const n = pts.length, mx = pts.reduce((a, p) => a + p.x, 0) / n, my = pts.reduce((a, p) => a + p.y, 0) / n;
  const sxx = pts.reduce((a, p) => a + (p.x - mx) ** 2, 0);
  if (sxx < 1) return null;
  const slope = pts.reduce((a, p) => a + (p.x - mx) * (p.y - my), 0) / sxx; // mph per day
  return { perWeek: slope * 7, now: my - slope * mx };
}
function speedGoalHTML(compact = false) {
  const goal = speedGoal(), pb = spdPB(), unit = unitLabel();
  if (!goal) return compact ? '' : `<div class="card"><div class="card-title">Speed Goal</div>
    <p style="font-size:0.84rem;color:var(--gray-mid);margin-bottom:10px;">Set a target driver speed and track your pace toward it.</p>
    <button class="btn btn-primary btn-sm" onclick="setSpeedGoal()">🎯 Set a speed goal</button></div>`;
  const first = (getSpeedProfiles().slice(-1)[0]?.best || {})['Driver|normal'] || getSpeedSessions().filter(s => s.max).slice(-1)[0]?.max || pb || goal;
  const pct = pb ? Math.max(0, Math.min(100, Math.round((pb - first) / Math.max(0.1, goal - first) * 100))) : 0;
  const tr = speedTrend(), reached = pb && pb >= goal;
  let pace = '';
  if (reached) pace = '🏆 Goal reached — time to set a new one!';
  else if (tr && tr.perWeek > 0.05) { const weeks = (goal - Math.max(pb || 0, tr.now)) / tr.perWeek, eta = new Date(Date.now() + weeks * 7 * 86400000);
    pace = `Gaining ${toUnit(tr.perWeek).toFixed(1)} ${unit}/week — on pace for ${eta.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`; }
  else pace = tr ? 'Your trend is flat right now — stick with the program, gains often come in steps.' : 'A few more sessions and you’ll see your pace here.';
  const dist = spdDistance(goal), now = spdDistance(pb);
  return `<div class="card">
    <div style="display:flex;justify-content:space-between;align-items:center;gap:8px;">
      <div class="card-title" style="margin:0;">Speed Goal · ${toUnit(goal)} ${unit}</div>
      ${compact ? `<button class="btn btn-sm" style="background:none;color:var(--gray-mid);" onclick="navTo('speed')">Speed ›</button>` : `<div><button class="btn btn-sm" style="background:none;color:var(--gray-mid);" onclick="setSpeedGoal()">Edit</button><button class="btn btn-sm" style="background:none;color:var(--gray-mid);" onclick="clearSpeedGoal()">Clear</button></div>`}
    </div>
    <div style="display:flex;justify-content:space-between;font-size:0.8rem;color:var(--gray-mid);margin:8px 0 4px;"><span>Start ${toUnit(first)}</span><span><strong style="color:var(--green-dark);">PB ${pb ? toUnit(pb) : '—'}</strong></span><span>Goal ${toUnit(goal)}</span></div>
    <div class="progress-bar-wrap"><div class="progress-bar" style="width:${pct}%"></div></div>
    <div style="font-size:0.8rem;margin-top:8px;color:var(--gray-dark);">${pace}</div>
    ${!compact && dist && now ? `<div class="apex-hole-meta" style="margin-top:4px;">${toUnit(goal)} ${unit} is worth ~${dist.carry} yds carry — ${dist.carry - now.carry} more than today.</div>` : ''}
  </div>`;
}

// ── Personal records ───────────────────────────────────────────
function personalRecords() {
  const recs = [], rounds = getAllRounds(), d = getDrillData(), unit = unitLabel();
  const pb = spdPB(); if (pb) recs.push({ icon: '⚡', name: 'Driver speed', value: `${toUnit(pb)} ${unit}`, sub: `~${spdDistance(pb).carry} yds carry potential` });
  const best18 = rounds.filter(r => r.holeCount === 18).sort((a, b) => a.score - b.score)[0];
  if (best18) recs.push({ icon: '⛳', name: 'Best 18', value: best18.score, sub: `${esc(best18.course || '')} · ${formatDate(best18.date)}` });
  const comb = Math.max(d.best.combineFull ?? -1, d.best.combineQuick ?? -1); if (comb >= 0) recs.push({ icon: '🏆', name: 'Combine', value: comb, sub: d.best.combineFull >= (d.best.combineQuick ?? -1) ? 'full' : 'quick' });
  if (d.best.longdrive) recs.push({ icon: '💥', name: 'Long drive (in play)', value: `${d.best.longdrive} yds`, sub: 'Long Drive game' });
  if (d.best.fairway !== undefined) recs.push({ icon: '🛣️', name: 'Fairways', value: `${d.best.fairway}%`, sub: 'Fairway Finder' });
  const apex18 = getApexRounds().filter(r => r.holeCount === 18).sort((a, b) => a.score - b.score)[0];
  if (apex18) recs.push({ icon: '🗿', name: 'Apex 18', value: apex18.score, sub: apex18.course });
  const wp = weeklyProgress(); if (wp.best) recs.push({ icon: '🔥', name: 'Longest streak', value: `${wp.best} wk${wp.best > 1 ? 's' : ''}`, sub: `${wp.totalDays} active days total` });
  return recs;
}

// ── Dashboard cards ────────────────────────────────────────────
function thisWeekCardHTML() {
  const wp = weeklyProgress(), days = wp.days;
  // this week's seven days
  const mon = new Date(weekStart(todayISO()) + 'T12:00:00');
  const week = [...Array(7)].map((_, i) => { const d = new Date(mon); d.setDate(d.getDate() + i); const iso = isoOf(d);
    return { iso, label: 'MTWTFSS'[i], types: days.get(iso), today: iso === todayISO(), future: iso > todayISO() }; });
  const ring = Math.min(1, wp.activeThisWeek / wp.goal), C = 2 * Math.PI * 34;
  const need = Math.max(0, wp.goal - wp.activeThisWeek);
  const msg = wp.met ? (wp.streak > 1 ? `Goal met — ${wp.streak}-week streak! 🔥` : 'Goal met this week! 🔥')
    : need > wp.daysLeft ? 'Out of days for the goal this week — next week starts a fresh streak.'
    : `${need} more active day${need > 1 ? 's' : ''} to ${wp.streak ? `keep your ${wp.streak}-week streak` : 'hit your goal'}${wp.activeToday ? '' : ' — today counts'}.`;
  return `<div class="card">
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;gap:8px;">
      <div class="card-title" style="margin:0;">This Week</div>
      <label style="font-size:0.76rem;color:var(--gray-mid);">Goal <select style="width:auto;padding:2px 6px;" onchange="setWeeklyGoal(+this.value)">${[2, 3, 4, 5].map(n => `<option value="${n}" ${n === wp.goal ? 'selected' : ''}>${n} days</option>`).join('')}</select></label>
    </div>
    <div class="week-wrap">
      <svg class="week-ring" viewBox="0 0 80 80" width="88" height="88" role="img" aria-label="${wp.activeThisWeek} of ${wp.goal} active days">
        <circle cx="40" cy="40" r="34" fill="none" stroke="var(--gray-light)" stroke-width="8"/>
        <circle cx="40" cy="40" r="34" fill="none" stroke="${wp.met ? 'var(--gold-dark)' : 'var(--green-light)'}" stroke-width="8" stroke-linecap="round"
          stroke-dasharray="${(ring * C).toFixed(1)} ${C.toFixed(1)}" transform="rotate(-90 40 40)"/>
        <text x="40" y="38" text-anchor="middle" font-size="18" font-weight="800" fill="var(--green-dark)">${wp.activeThisWeek}/${wp.goal}</text>
        <text x="40" y="54" text-anchor="middle" font-size="9" fill="var(--gray-mid)">days</text>
      </svg>
      <div style="flex:1;min-width:0;">
        <div class="week-days">${week.map(d => `<div class="week-day${d.types ? ' on' : ''}${d.today ? ' today' : ''}${d.future ? ' future' : ''}" title="${d.types ? [...d.types].map(t => ACTIVITY_TYPES[t].name).join(', ') : ''}"><div class="week-day-dot">${d.types ? [...d.types].slice(0, 2).map(t => ACTIVITY_TYPES[t].icon).join('') : ''}</div><div class="week-day-lbl">${d.label}</div></div>`).join('')}</div>
        <div style="font-size:0.82rem;margin-top:8px;color:var(--gray-dark);">${msg}</div>
        <div class="apex-hole-meta" style="margin-top:2px;">🔥 Streak ${wp.streak} wk · best ${wp.best} · +${WEEKLY_BONUS_XP} XP each week you hit the goal</div>
      </div>
    </div>
    ${activityHeatmapHTML(days)}
  </div>`;
}
// The last 16 weeks, one square per day, darker for more kinds of practice
function activityHeatmapHTML(days) {
  const start = new Date(weekStart(todayISO()) + 'T12:00:00'); start.setDate(start.getDate() - 7 * 15);
  const cols = [];
  for (let w = 0; w < 16; w++) {
    const cells = [];
    for (let i = 0; i < 7; i++) {
      const d = new Date(start); d.setDate(d.getDate() + w * 7 + i); const iso = isoOf(d), t = days.get(iso), n = t ? t.size : 0;
      cells.push(`<div class="heat-cell heat-${Math.min(3, n)}${iso > todayISO() ? ' future' : ''}" title="${formatDate(iso)}${t ? ': ' + [...t].map(x => ACTIVITY_TYPES[x].name).join(', ') : ''}"></div>`);
    }
    cols.push(`<div class="heat-col">${cells.join('')}</div>`);
  }
  return `<div class="heat-wrap"><div class="heat-grid" aria-label="Practice activity, last 16 weeks">${cols.join('')}</div>
    <div class="heat-legend">Less <span class="heat-cell heat-0"></span><span class="heat-cell heat-1"></span><span class="heat-cell heat-2"></span><span class="heat-cell heat-3"></span> More · last 16 weeks</div></div>`;
}
function recordsCardHTML() {
  const recs = personalRecords();
  if (!recs.length) return '';
  return `<div class="card"><div class="card-title">Personal Records</div>
    <div class="records-grid">${recs.map(r => `<div class="record"><div class="record-icon">${r.icon}</div><div><div class="record-value">${r.value}</div><div class="record-name">${r.name}</div><div class="record-sub">${r.sub}</div></div></div>`).join('')}</div></div>`;
}
function activityDays() { return memo('activityDays', activityDaysRaw); } // cached until data changes

// Golf Improvement App — This week's practice plan, built from the Improvement Coach.
// Classic script: shares globals with the other files; load order is set in golf-improvement-app.html.

// ════════════════════════════════════════════════════════════
// WEEKLY PLAN
// Each Monday the coach's top priorities become a week of practice. It starts
// small — about 30 minutes, two short blocks on your biggest weakness — because
// the habit matters more than the hours. Finish a week and the next steps up
// (PLAN_RAMP), until it reaches the hours you set (Coach › practice time);
// finish about half and it holds; less and it eases back a step. Time is shared
// out by how many strokes each area costs you, filled from a menu of the app's own drills,
// tests and challenges plus a few no-tech routines, and grouped by where
// you'll be — range, short-game area, putting green, home. Anything the app
// can see (drills, speed sessions, tests, Apex rounds and challenges, range
// shots) ticks itself off; the rest you tick. A finished week earns a bonus.
// ════════════════════════════════════════════════════════════
const PLAN_PLACES = {
  range: { icon: '📡', name: 'Range (R10)' },
  short: { icon: '⛳', name: 'Short-game area' },
  green: { icon: '🕳️', name: 'Putting green' },
  home:  { icon: '🏠', name: 'Home' },
};
const PLAN_XP = { block: 15, week: 150 };
const PLAN_RAMP = [30, 45, 60, 90, 120, 180, 240, 360]; // minutes a week, step by step
const planTarget = () => (getCoach().hours || 2) * 60;
// the highest step the plan grows to: the first that reaches your target hours
const planTopStage = () => { const i = PLAN_RAMP.findIndex(m => m >= planTarget()); return i < 0 ? PLAN_RAMP.length - 1 : i; };
const planBudget = stage => Math.min(PLAN_RAMP[Math.max(0, Math.min(stage, planTopStage()))], planTarget());
const planGo = {
  drill: id => `navTo('clubs');setTimeout(()=>drillOpen('${id}'),50)`,
  challenge: id => `navTo('apex');setTimeout(()=>apexStartChallenge('${id}'),50)`,
};
// The menu for each area, best first: [title, detail, minutes, place, auto-check, action]
// auto: { drill } | { speed } | { test } | { challenge } | { apex } | { range } — null means you tick it
function planMenu(area, a) {
  const band = a && a.sub && a.sub[0] && a.sub[0].sg < -0.15 ? a.sub[0].k : null;
  const coachT = getCoachTests(), stale = list => !list.length || (Date.now() - new Date(list[0].date)) / 864e5 > 21;
  const combineFresh = (getDrillData().history.combine || []).some(h => !h.test && Date.now() - h.at < 14 * 864e5);
  const B = (title, detail, min, place, auto, js) => ({ title, detail, min, place, auto, js });
  switch (area) {
    case 'approach': {
      const r = { app50: '50–100', app100: '100–150', app150: '150–200', app200: '180–230' }[band] || '80–170';
      return [
        B('Target Practice', `20 balls, random ${r} yds — one ball, one target`, 20, 'range', { drill: 'target' }, planGo.drill('target')),
        band === 'app50' ? B('Wedge Matrix', 'Learn your ½, ¾ and full wedge numbers', 20, 'range', { drill: 'wedges' }, planGo.drill('wedges'))
          : B('Bullseye', 'Rings around the flag: pick a club, score points', 15, 'range', { drill: 'bullseye' }, planGo.drill('bullseye')),
        combineFresh ? null : B('Combine (quick)', 'Re-measure your approach play', 25, 'range', { drill: 'combine' }, planGo.drill('combine')),
        B('Apex: Cathedral Approach', 'Approach challenge, 5 balls', 10, 'home', { challenge: 'cathedral' }, planGo.challenge('cathedral')),
        B('Target Practice', `Another 20 balls, ${r} yds`, 20, 'range', { drill: 'target' }, planGo.drill('target')),
      ].filter(Boolean);
    }
    case 'offTee': return [
      B('Fairway Finder', '14 drives into a 32-yd fairway', 20, 'range', { drill: 'fairway' }, planGo.drill('fairway')),
      B('Nine-Shot', 'Shape it: high/low × draw/straight/fade', 20, 'range', { drill: 'nine' }, planGo.drill('nine')),
      B('Apex: Thread the Gate', 'Tee-shot challenge, 5 balls', 10, 'home', { challenge: 'gate' }, planGo.challenge('gate')),
      B('Fairway Finder', '14 more drives', 20, 'range', { drill: 'fairway' }, planGo.drill('fairway')),
    ];
    case 'penalties': return [
      B('Fairway Finder — tight', '14 drives at the 25-yd width', 20, 'range', { drill: 'fairway' }, planGo.drill('fairway')),
      B('Apex: 9 holes, safe lines', 'Play to the fat side of every hazard', 35, 'home', { apex: 9 }, "navTo('apex')"),
      B('Apex: Under the Vines', 'Keep it under the canopy, 5 balls', 10, 'home', { challenge: 'vines' }, planGo.challenge('vines')),
    ];
    case 'putting': return [
      band === 'putLag' ? B('Lag ladder', '30, 40, 50 ft — stop each inside 3 ft. 3 rounds', 15, 'green', null, null)
        : B('Gate drill', '25 putts from 3–6 ft through a tee gate', 15, 'green', null, null),
      B('Clock drill', '8 balls round the hole at 4 ft — all in to move back a foot', 15, 'green', null, null),
      stale(coachT.putting) ? B('Putting re-test', '40 putts: 3, 8, 20, 40 ft — updates your coach', 15, 'green', { test: 'putting' }, "coachOpenTest('putting')")
        : B('Lag ladder', '30, 40, 50 ft — stop each inside 3 ft', 15, 'green', null, null),
      B('Putting challenges', 'In the app: log a challenge', 10, 'green', null, "navTo('putting')"),
    ];
    case 'short': return [
      B('Landing-spot drill', '10 balls each to 3 spots, 10–30 yds — land it on the towel', 20, 'short', null, null),
      B('Up-and-down game', '9 random lies, par 2 each: chip, then putt out', 20, 'short', null, null),
      stale(coachT.short) ? B('Short-game re-test', '10 chips + 10 pitches — updates your coach', 15, 'short', { test: 'short' }, "coachOpenTest('short')")
        : B('One-club challenge', 'Every chip with one club: learn its trajectories', 15, 'short', null, null),
    ];
    case 'speed': return [
      B('Speed session', 'Your program\'s next session', 20, 'home', { speed: true }, "navTo('speed')"),
      B('Speed session', 'Second session (rest a day between)', 20, 'home', { speed: true }, "navTo('speed')"),
      B('Speed session', 'Third session', 20, 'home', { speed: true }, "navTo('speed')"),
    ];
  }
  return [];
}

function getPlan()   { return loadData(KEYS.plan, null); }
function savePlan(p) { saveData(KEYS.plan, p); }

// Build this week's blocks to fit `minutes`
function planBuild(minutes) {
  const an = coachAnalysis(), blocks = [];
  // a small week works on fewer things: one area per half hour or so, up to three
  const focus = an.ranked.filter(a => a.sg < -0.05).slice(0, Math.max(1, Math.min(3, Math.floor(minutes / 30))));
  const add = (b, area) => blocks.push({ ...b, area, id: `${area}-${blocks.length}` });
  // Assessment steps still to do: until the coach has evidence, the week is about getting it
  const place = { putting: 'green', short: 'short', combine: 'range', fairway: 'range', speed: 'home' };
  const auto = { putting: { test: 'putting' }, short: { test: 'short' }, combine: { drill: 'combine' }, fairway: { drill: 'fairway' }, speed: { speed: true } };
  const todo = coachAssessment().filter(s => !s.done && place[s.id]).map(s => ({ title: s.name, detail: s.desc, min: 20, place: place[s.id], auto: auto[s.id], js: s.js }));
  if (!focus.length) {
    let t = 0;
    for (const b of todo) { if (blocks.length && t + b.min > minutes + 5) break; add(b, 'assess'); t += b.min; }
    return blocks;
  }
  // an active speed program keeps its sessions, whatever the priorities
  const prog = spdCurrentProgram(), pos = spdPlanPosition(prog), inProgram = pos && pos.done > 0 && !pos.complete;
  let left = minutes;
  if (inProgram) { // (fewer sessions while the habit is new)
    const n = Math.max(1, Math.min(3, SPEED_PROGRAMS[prog].perWeek || 2, Math.floor(minutes / 30)));
    planMenu('speed').slice(0, n).forEach(b => add({ ...b, detail: `${spdProgramName(prog)} · week ${pos.week}` }, 'speed'));
    left -= n * 20;
  }
  // gapping: if the bag has holes in its data, one session fills them
  const stats = bagStats(), shaky = bagInsights(stats).some(x => x.icon === '📋') || stats.length < 4;
  if (shaky && left > 60) { add({ title: 'Gapping session', detail: '10 balls with each club you haven\'t measured (record on the range)', min: 25, place: 'range', auto: { range: 30 }, js: "navTo('clubs')" }, 'bag'); left -= 25; }
  // share the rest by how many strokes each area costs
  const weight = a => Math.max(0.05, a.priority);
  const W = focus.filter(a => !(a.area === 'speed' && inProgram)).reduce((s, a) => s + weight(a), 0);
  const menus = {}, used = {};
  focus.forEach(a => {
    if (a.area === 'speed' && inProgram) return;
    let budget = Math.max(15, left * weight(a) / (W || 1)), i = 0;
    // early weeks: short blocks only (20 min or less), so each one is easy to start
    const menu = menus[a.area] = planMenu(a.area, a).filter(b => minutes >= 90 || b.min <= 20);
    while (budget >= 10 && i < menu.length) { add(menu[i], a.area); budget -= menu[i].min; i++; }
    used[a.area] = i;
  });
  // time to spare: first the assessment steps not done (they sharpen the coach), then more of the top priority
  let spare = minutes - blocks.reduce((t, x) => t + x.min, 0);
  for (const b of todo) { if (spare < b.min) break; add(b, 'assess'); spare -= b.min; }
  const times = t => blocks.filter(x => x.title === t).length; // no routine more than twice a week
  for (let k = 0; spare >= 10 && k < 12; k++) {
    const a = focus[k % focus.length], menu = menus[a.area];
    if (!menu || !menu.length) continue;
    const b = menu[(used[a.area]++) % menu.length];
    if (b.min > spare + 5 || times(b.title) >= 2) continue;
    add(b, a.area); spare -= b.min;
  }
  // still time: keep the other areas ticking over, weakest first
  const others = Object.keys(COACH_AREAS).filter(k => !focus.some(a => a.area === k) && k !== 'speed')
    .sort((x, y) => ((an.areas[x] || {}).sg ?? 0) - ((an.areas[y] || {}).sg ?? 0));
  for (const k of others) {
    const b = planMenu(k, an.areas[k]).find(x => !times(x.title));
    if (!b || spare < 10) break;
    add({ ...b, detail: `Maintenance · ${b.detail}` }, k); spare -= b.min;
  }
  // never more than the week's size (a little over is fine)
  while (blocks.length > 1 && blocks.reduce((t, x) => t + x.min, 0) > minutes + 5) blocks.pop();
  return blocks;
}

// Is a block done this week? Count matching events since Monday; the nth block of a kind needs n of them
function planAutoDone(blocks, week) {
  const since = new Date(week + 'T00:00:00').getTime(), done = {}, used = {};
  const dh = getDrillData().history || {}, ch = getApexChallengeBest(), T = getCoachTests();
  const count = auto => {
    if (auto.drill) return (dh[auto.drill] || []).filter(h => !h.test && h.at >= since).length;
    if (auto.speed) return getSpeedSessions().filter(s => s.date >= week).length;
    if (auto.test) return (T[auto.test] || []).filter(t => t.date >= week).length;
    if (auto.challenge) return (ch[auto.challenge] || {}).lastPlayed >= week ? 1 : 0;
    if (auto.apex) return getApexRounds().filter(r => r.date >= week && r.holeCount >= auto.apex).length;
    if (auto.range) return getRangeShots().filter(s => !s.drill && s.date >= week).length >= auto.range ? 1 : 0;
    return 0;
  };
  blocks.forEach(b => {
    if (!b.auto) return;
    const key = JSON.stringify(b.auto);
    used[key] = (used[key] || 0) + 1;
    if (count(b.auto) >= used[key]) done[b.id] = true;
  });
  return done;
}

// This week's plan (made on first look each week); finished weeks are kept for the record
function planCurrent() {
  const week = weekStart(todayISO());
  let p = getPlan();
  if (!p || p.week !== week) {
    let stage = 0, note = null;
    if (p) {
      const pr = planProgress(p), share = pr.total ? pr.done / pr.total : 0, prev = p.stage || 0;
      const missedWeeks = Math.round((new Date(week) - new Date(p.week)) / (7 * 864e5)) - 1; // weeks with no plan opened
      stage = share >= 1 ? prev + 1 : share >= 0.5 ? prev : prev - 1;
      if (missedWeeks > 0) stage = Math.min(stage, prev - 1);
      stage = Math.max(0, Math.min(stage, planTopStage()));
      note = stage > prev ? 'up' : stage < prev ? 'down' : 'hold';
    }
    const history = p ? [...(p.history || []), { week: p.week, done: planProgress(p).done, total: p.blocks.length, stage: p.stage || 0 }].slice(-52) : [];
    p = { week, stage, note, blocks: planBuild(planBudget(stage)), ticked: {}, rewarded: [], history, hours: getCoach().hours || 2 };
    savePlan(p);
    if (note === 'up') setTimeout(() => showToast(`📈 Last week's plan done — this week steps up to ${planBudget(stage)} min`), 1500);
  }
  return p;
}
function planProgress(p) {
  const auto = planAutoDone(p.blocks, p.week), isDone = b => !!(auto[b.id] || p.ticked[b.id]);
  return { isDone, done: p.blocks.filter(isDone).length, total: p.blocks.length };
}
// XP for newly finished blocks and the whole week (once each)
function planReward(p) {
  const pr = planProgress(p), fresh = p.blocks.filter(b => pr.isDone(b) && !p.rewarded.includes(b.id));
  if (!fresh.length) return;
  p.rewarded.push(...fresh.map(b => b.id));
  let xp = fresh.length * PLAN_XP.block;
  const weekDone = pr.total > 0 && pr.done === pr.total && !p.rewarded.includes('week');
  if (weekDone) { p.rewarded.push('week'); xp += PLAN_XP.week; }
  savePlan(p);
  awardXP(xp, 'practice plan');
  if (weekDone) { celebrate(`📅 Week's plan complete! +${xp} XP`); checkBadges(getAllRounds()); }
  else showToast(`📅 Plan: ${fresh.map(b => b.title).join(', ')} done · +${xp} XP`);
}
function planTick(id) {
  const p = planCurrent();
  p.ticked[id] = !p.ticked[id];
  if (!p.ticked[id]) delete p.ticked[id];
  savePlan(p); planReward(p); refreshPlanViews();
}
function planRebuild(quiet) {
  const p = planCurrent(), keep = planProgress(p);
  p.stage = Math.max(0, Math.min(p.stage || 0, planTopStage()));
  const blocks = planBuild(planBudget(p.stage)), ticked = {};
  // keep ticks on blocks that survive (same title and area)
  blocks.forEach(b => { const old = p.blocks.find(o => o.title === b.title && o.area === b.area && keep.isDone(o) && p.ticked[o.id]); if (old) ticked[b.id] = true; });
  Object.assign(p, { blocks, ticked, hours: getCoach().hours || 2 });
  savePlan(p); if (!quiet) showToast('📅 Plan rebuilt from your latest coach priorities'); refreshPlanViews();
}
// Change the week's size by hand
function planStep(d) {
  const p = planCurrent(), s = Math.max(0, Math.min((p.stage || 0) + d, planTopStage()));
  if (s === (p.stage || 0)) return showToast(d > 0 ? 'Already at your target hours — raise them in your game & goal below' : 'Already at the smallest week');
  p.stage = s; p.note = d > 0 ? 'mine-up' : 'mine-down'; savePlan(p); planRebuild(true);
  showToast(`📅 This week: about ${planBudget(s)} min`);
}
function refreshPlanViews() {
  if (document.getElementById('page-coach').classList.contains('active')) renderCoach();
  if (document.getElementById('page-dashboard').classList.contains('active')) renderDashboard();
}
// Completed weeks (every block done), for badges
function planWeeksCompleted() {
  const p = getPlan(); if (!p) return 0;
  const past = (p.history || []).filter(h => h.total && h.done >= h.total).length, pr = planProgress(p);
  return past + (pr.total && pr.done === pr.total ? 1 : 0);
}

// ── Screens ───────────────────────────────────────────────────
function planCardHTML() {
  const p = planCurrent(); planReward(p);
  const pr = planProgress(p), mins = p.blocks.reduce((s, b) => s + b.min, 0);
  const areaName = a => a === 'assess' ? 'Assessment' : a === 'bag' ? 'My Bag' : (COACH_AREAS[a] || {}).name || a;
  const places = Object.keys(PLAN_PLACES).filter(k => p.blocks.some(b => b.place === k));
  const dow = (new Date().getDay() + 6) % 7, daysLeft = 7 - dow;
  const stage = p.stage || 0, top = planTopStage(), budget = planBudget(stage), atTop = stage >= top;
  const why = { up: '📈 Stepped up after last week', hold: 'Same size as last week — finish it all to step up', down: 'Eased back a step — a size you’ll finish beats a big one you won’t', 'mine-up': 'You stepped it up', 'mine-down': 'You eased it off — that’s fine' }[p.note] || 'Starting small: the habit first, then the hours';
  return `<div class="card" id="plan-card">
    <div style="display:flex;justify-content:space-between;align-items:center;gap:8px;flex-wrap:wrap;">
      <div class="card-title" style="margin:0;">📅 This week's plan</div>
      <span class="apex-hole-meta">${pr.done}/${pr.total} done · about ${Math.round(mins / 5) * 5} min · ${daysLeft} day${daysLeft > 1 ? 's' : ''} left</span>
    </div>
    <div class="plan-ramp">
      <div class="plan-steps">${PLAN_RAMP.slice(0, top + 1).map((m, i) => `<span class="plan-step ${i < stage ? 'past' : i === stage ? 'now' : ''}" title="${Math.min(m, planTarget())} min a week"></span>`).join('')}</div>
      <div class="apex-hole-meta">Step ${stage + 1} of ${top + 1} · <b>${budget} min</b> this week${atTop ? ' — your full target' : ` · target ${Math.round(planTarget() / 60 * 10) / 10} h`} · ${why}${!atTop && pr.done < pr.total ? ' · finish every block to step up next week' : ''}</div>
    </div>
    <div class="progress-bar-wrap" style="margin:8px 0 10px;"><div class="progress-bar" style="width:${pr.total ? Math.round(pr.done / pr.total * 100) : 0}%"></div></div>
    ${p.blocks.length ? places.map(k => { const list = p.blocks.filter(b => b.place === k);
      return `<div class="plan-place"><div class="apex-subtitle">${PLAN_PLACES[k].icon} ${PLAN_PLACES[k].name} · ${list.reduce((s, b) => s + b.min, 0)} min</div>
        ${list.map(b => { const done = pr.isDone(b), auto = !!b.auto;
          return `<div class="plan-block ${done ? 'done' : ''}">
            <button class="plan-check" ${auto && !p.ticked[b.id] ? `title="Ticks itself when you do it in the app" onclick="planTick('${b.id}')"` : `onclick="planTick('${b.id}')"`} aria-label="${done ? 'Done' : 'Mark done'}">${done ? '✓' : ''}</button>
            <div style="flex:1;min-width:0;"><b>${esc(b.title)}</b> <span class="plan-area">${esc(areaName(b.area))}</span><div class="apex-hole-meta">${esc(b.detail)} · ${b.min} min${auto && !done ? ' · ticks itself' : ''}</div></div>
            ${b.js && !done ? `<button class="btn btn-sm btn-primary" onclick="${b.js}">Go ›</button>` : ''}
          </div>`; }).join('')}</div>`; }).join('')
      : `<p style="font-size:0.84rem;color:var(--gray-mid);">Nothing to plan yet — your coach needs a little evidence first.</p>`}
    <div style="display:flex;justify-content:space-between;align-items:center;gap:8px;margin-top:8px;flex-wrap:wrap;">
      <span class="apex-hole-meta">+${PLAN_XP.block} XP a block, +${PLAN_XP.week} for the whole week</span>
      <span style="display:flex;gap:6px;flex-wrap:wrap;">
        <button class="btn btn-sm btn-quiet" onclick="planStep(-1)" ${stage ? '' : 'disabled'}>− Ease off</button>
        <button class="btn btn-sm btn-quiet" onclick="planStep(1)" ${atTop ? 'disabled' : ''}>+ Step up</button>
        <button class="btn btn-sm btn-quiet" onclick="planRebuild()">↻ Rebuild</button>
      </span>
    </div>
  </div>`;
}
// Dashboard: one line and the next thing to do
function planMiniHTML() {
  const p = planCurrent(); planReward(p);
  const pr = planProgress(p), next = p.blocks.find(b => !pr.isDone(b));
  if (!p.blocks.length) return '';
  return `<div class="plan-mini"><span>📅 <b>This week:</b> ${pr.done}/${pr.total}</span>
    ${next ? `<span class="plan-mini-next">Next: ${esc(next.title)} · ${next.min} min</span><button class="btn btn-sm btn-primary" onclick="${next.js || "navTo('coach')"}">Go ›</button>` : '<span class="plan-mini-next">All done this week 🎉</span>'}</div>`;
}

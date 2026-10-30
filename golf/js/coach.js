// Golf Improvement App — Improvement Coach: where you lose strokes, how sure we are, and what to practise.
// Classic script: shares globals with the other files; load order is set in golf-improvement-app.html.

// ════════════════════════════════════════════════════════════
// IMPROVEMENT COACH
// One currency: strokes per round compared with a golfer at your GOAL
// handicap (the app's strokes-gained tables, calibrated to that handicap).
// Evidence comes from everywhere the app measures you, weighted by how
// reliable it is:
//   strokes-gained rounds (best) · scorecard rounds · assessment tests
//   (putting, short game) · drills (Combine, Fairway Finder) · speed · Apex
// Each area's estimate is the weighted average of its evidence; confidence
// grows with the total weight. Areas are ranked by strokes lost × how quickly
// practice tends to fix them × confidence, and the top three become a plan.
// Starting from nothing, a short assessment gives first priorities.
// Rules of thumb throughout — directionally right, not a lab measurement.
// ════════════════════════════════════════════════════════════
const COACH_AREAS = {
  offTee:    { name: 'Off the tee',  icon: '🏌️', train: 0.8 },
  approach:  { name: 'Approach',     icon: '🎯', train: 0.9 },
  short:     { name: 'Short game',   icon: '⛳', train: 1.0 },
  putting:   { name: 'Putting',      icon: '🕳️', train: 1.0 },
  penalties: { name: 'Penalties',    icon: '🚫', train: 1.2 },
  speed:     { name: 'Distance',     icon: '⚡', train: 0.6 },
};
// Shots per round in each situation for a typical amateur (to turn "per shot" into "per round")
const COACH_SHOTS = { drives: 14, app50: 2, app100: 4, app150: 4, app200: 2.5, chips: 3, pitches: 3, putShort: 8, putMid: 6, putLag: 4 };

function getCoach()        { return loadData(KEYS.coach, {}); }
function saveCoach(c)      { saveData(KEYS.coach, c); }
function getCoachTests()   { return loadData(KEYS.coachTests, { putting: [], short: [] }); }
function saveCoachTests(t) { saveData(KEYS.coachTests, t); }
function coachSet(key, val) { const c = getCoach(); c[key] = val; saveCoach(c); renderCoach(); }

// The handicap you're measured against: your goal (else 3 better than now, else 18)
function coachGoal() {
  const c = getCoach(), g = (typeof getGoals === 'function' && getGoals()) || null;
  if (isFinite(c.goal)) return +c.goal;
  if (g && isFinite(g.targetHandicap)) return g.targetHandicap;
  const cur = coachCurrent();
  return cur !== null ? Math.max(0, cur - 3) : 18;
}
function coachCurrent() {
  const c = getCoach();
  if (isFinite(c.handicap)) return +c.handicap;
  const h = typeof calcHandicap === 'function' ? calcHandicap(getAllRounds()) : null;
  return h ? h.value : null;
}
const coachCal = () => sgCalibration(coachGoal(), 72, 18);

// ── Evidence ───────────────────────────────────────────────────
// Each item: { area, sg (strokes/round vs goal; + good), w (weight), src, detail, sub: { band: sg } }
function coachEvidence() {
  const ev = [], cal = coachCal(), E = (lie, d) => sgExpected(lie, d, cal), goal = coachGoal();
  // Around the green a goal-handicap golfer is much closer to scratch than the full long-game
  // scaling implies, so expectations inside ~50 yds use half of it
  const Es = (lie, d) => sgInterp(SG_EXPECTED[lie], d) * (1 + (cal.long - 1) * 0.5);
  const expectedPen = Math.max(0.3, goal * 0.09); // penalty strokes per round at the goal handicap

  // 1. Strokes-gained rounds: every shot, sorted into areas (penalties pulled out on their own)
  getSGRounds().filter(r => r.completed !== false && r.holes).forEach(r => {
    const rc = sgCalibration(goal, r.rating, r.holeCount), per = 18 / (r.holeCount || 18);
    const acc = { offTee: 0, approach: 0, short: 0, putting: 0 }, sub = {}; let pens = 0;
    r.holes.forEach(h => { if (h.maxed) return; sgHole(h.shots || [], h.par, rc).shots.forEach(s => {
      const pen = s.penalty || 0; pens += pen;
      const sg = s.sg + pen, cat = s.cat === 'offTee' ? 'offTee' : s.cat;
      acc[cat] += sg;
      const band = cat === 'approach' ? coachBand(s.dist) : cat === 'putting' ? (s.dist < 6 ? 'putShort' : s.dist < 20 ? 'putMid' : 'putLag') : null;
      if (band) sub[band] = (sub[band] || 0) + sg;
    }); });
    Object.entries(acc).forEach(([a, v]) => ev.push({ area: a, sg: v * per, w: 1, src: 'SG round', date: r.date, sub: coachScale(sub, per, a) }));
    ev.push({ area: 'penalties', sg: expectedPen - pens * per, w: 1, src: 'SG round', date: r.date, detail: `${(pens * per).toFixed(1)} penalties/18` });
  });

  // 2. Scorecard rounds: fairways, greens, putts, penalties (strokes-gained-lite), half weight
  getRounds().forEach(r => {
    const lite = strokesGainedLite([r]); if (!lite) return;
    const per = 18 / (r.holeCount || 18), pen18 = roundPenalties(r) * per, c = Object.fromEntries(lite.categories.map(x => [x.key, x.sg]));
    ev.push({ area: 'offTee', sg: c.driving - (SG_BASELINE.pen18 - pen18), w: 0.5, src: 'Scorecard', date: r.date });
    ev.push({ area: 'approach', sg: c.approach, w: 0.5, src: 'Scorecard', date: r.date });
    ev.push({ area: 'short', sg: c.shortGame, w: 0.4, src: 'Scorecard', date: r.date });
    ev.push({ area: 'putting', sg: c.putting, w: 0.5, src: 'Scorecard', date: r.date });
    ev.push({ area: 'penalties', sg: expectedPen - pen18, w: 0.6, src: 'Scorecard', date: r.date });
  });

  // 3. Assessment tests
  const T = getCoachTests();
  T.putting.forEach(t => { // 10 putts per station: makes from 3, 8 and 20 ft; 40 ft lags finishing inside 3 ft
    const s3 = E('green', 3) - (1 + (1 - t.m3 / 10)), s8 = E('green', 8) - (1 + (1 - t.m8 / 10) * 1.02),
          s20 = E('green', 20) - (1 + (1 - t.m20 / 10) * 1.05), lag = E('green', 40) - (1 + (t.lag / 10) * 1.03 + (1 - t.lag / 10) * E('green', 6));
    const sub = { putShort: s3 * COACH_SHOTS.putShort, putMid: s8 * COACH_SHOTS.putMid, putLag: (s20 * 0.4 + lag * 0.6) * COACH_SHOTS.putLag };
    ev.push({ area: 'putting', sg: sub.putShort + sub.putMid + sub.putLag, w: 0.7, src: 'Putting test', date: t.date, sub,
              detail: `3 ft ${t.m3}/10 · 8 ft ${t.m8}/10 · 20 ft ${t.m20}/10 · lag ${t.lag}/10` });
  });
  T.short.forEach(t => { // 10 chips (15 yds) and 10 pitches (40 yds), counted by where they finish
    const prox = c => (c[0] * 2 + c[1] * 4.5 + c[2] * 9 + c[3] * 18) / Math.max(1, c[0] + c[1] + c[2] + c[3]); // ft
    const after = c => (c[0] * E('green', 2) + c[1] * E('green', 4.5) + c[2] * E('green', 9) + c[3] * E('green', 18)) / Math.max(1, c[0] + c[1] + c[2] + c[3]);
    const chip = Es('rough', 15) - (1 + after(t.chip)), pitch = Es('fairway', 40) - (1 + after(t.pitch));
    ev.push({ area: 'short', sg: chip * COACH_SHOTS.chips + pitch * COACH_SHOTS.pitches, w: 0.7, src: 'Short-game test', date: t.date,
              sub: { chips: chip * COACH_SHOTS.chips, pitches: pitch * COACH_SHOTS.pitches }, detail: `chips avg ${prox(t.chip).toFixed(1)} ft · pitches avg ${prox(t.pitch).toFixed(1)} ft` });
  });

  // 4. Drills: Combine (approach by distance) and Fairway Finder (driving)
  const dh = getDrillData().history || {};
  (dh.combine || []).filter(h => !h.test && h.per).forEach(h => {
    const sub = {}; let tot = 0;
    DRILL_COMBINE_TARGETS.forEach((D, i) => { if (D === 'Driver' || h.per[i] === undefined) return;
      const miss = (100 - h.per[i]) * (0.4 * D + 6) / 100; // the Combine score back to a typical landing miss (yds)
      const prox = miss * 0.8; // where it finishes: many misses still roll onto or toward the green
      const after = prox <= 12 ? E('green', prox * 3) : (Es('fairway', prox) + Es('rough', prox)) / 2;
      const perShot = E('fairway', D) - (1 + after), band = coachBand(D);
      sub[band] = (sub[band] || []).concat(perShot); });
    Object.keys(sub).forEach(b => { const v = sub[b].reduce((a, x) => a + x, 0) / sub[b].length; sub[b] = v * COACH_SHOTS[b]; tot += sub[b]; });
    ev.push({ area: 'approach', sg: tot, w: h.full ? 0.8 : 0.5, src: 'Combine', date: isoOf(h.at), sub, detail: `score ${h.avg}` });
  });
  (dh.fairway || []).filter(h => !h.test).forEach(h => {
    const fwExp = Math.max(30, 56 - 0.8 * goal), driveExp = 255 - 2.2 * goal;
    const perDrive = (h.pct - fwExp) / 100 * 0.25 * cal.long + (E('fairway', 400 - driveExp) - E('fairway', 400 - (h.total || driveExp)));
    ev.push({ area: 'offTee', sg: perDrive * COACH_SHOTS.drives, w: 0.6, src: 'Fairway Finder', date: isoOf(h.at), detail: `${h.pct}% fairways · ${Math.round(h.total)} yds` });
  });

  // 5. Speed: distance compared with a typical golfer at your goal
  const pb = spdPB();
  if (pb) {
    const typical = 104 - 0.6 * goal, d = mph => spdDistance(mph).total;
    const per = mph => COACH_SHOTS.drives * (E('fairway', 400 - d(typical)) - E('fairway', 400 - d(mph)));
    ev.push({ area: 'speed', sg: per(pb), w: Math.min(1, getSpeedSessions().length / 4), src: 'Speed', detail: `PB ${toUnit(pb)} ${unitLabel()} vs ~${toUnit(typical)} typical at ${goal} hcp`,
              gain5: per(pb + 5) - per(pb) });
  }

  // 6. Apex (virtual): a light touch, putting excluded (it's automatic there)
  getApexRounds().slice(0, 10).forEach(r => {
    const t = sgRoundTotals(r.holes, sgCalibration(goal, r.rating, r.holeCount)), per = 18 / (r.holeCount || 18);
    ['offTee', 'approach', 'short'].forEach(a => ev.push({ area: a, sg: t.byCat[a] * per, w: 0.2, src: 'Apex', date: r.date }));
  });

  // 7. What you told us (only matters until there's real evidence)
  const weak = getCoach().weak;
  if (weak && COACH_AREAS[weak]) ev.push({ area: weak, sg: -0.8, w: 0.15, src: 'Your self-assessment' });
  return ev;
}
const coachBand = d => d < 100 ? 'app50' : d < 150 ? 'app100' : d < 200 ? 'app150' : 'app200';
function coachScale(sub, per, area) { // the bands that belong to this area, per 18 holes
  const keep = area === 'approach' ? ['app50', 'app100', 'app150', 'app200'] : area === 'putting' ? ['putShort', 'putMid', 'putLag'] : [];
  return Object.fromEntries(Object.entries(sub).filter(([k]) => keep.includes(k)).map(([k, v]) => [k, v * per]));
}
const COACH_BANDS = { app50: '50–100 yds', app100: '100–150 yds', app150: '150–200 yds', app200: '200+ yds', putShort: 'short putts (under 6 ft)', putMid: 'mid putts (6–20 ft)',
                      putLag: 'lag putts (20+ ft)', chips: 'chips', pitches: 'pitches' };

// ── Analysis: one estimate per area ─────────────────────────────
function coachAnalysis() {
  const ev = coachEvidence(), out = {};
  Object.keys(COACH_AREAS).forEach(a => {
    const items = ev.filter(e => e.area === a);
    const W = items.reduce((s, e) => s + e.w, 0);
    if (!W) { out[a] = null; return; }
    const sg = items.reduce((s, e) => s + e.sg * e.w, 0) / W, conf = 1 - Math.exp(-W / 1.5);
    const subs = {}; items.forEach(e => Object.entries(e.sub || {}).forEach(([k, v]) => { (subs[k] = subs[k] || { s: 0, w: 0 }); subs[k].s += v * e.w; subs[k].w += e.w; }));
    const sub = Object.entries(subs).map(([k, v]) => ({ k, sg: v.s / v.w })).sort((x, y) => x.sg - y.sg);
    const loss = Math.max(0, -sg), priority = loss * COACH_AREAS[a].train * (0.45 + 0.55 * conf);
    out[a] = { area: a, sg, conf, items, sub, priority, gain5: (items.find(e => e.gain5) || {}).gain5 };
  });
  const ranked = Object.values(out).filter(Boolean).sort((x, y) => y.priority - x.priority);
  return { areas: out, ranked, evidence: ev, goal: coachGoal(), current: coachCurrent() };
}
const coachConfLabel = c => c >= 0.75 ? 'high' : c >= 0.45 ? 'medium' : 'low';

// ── The plan: practice that fixes each area, using the app's own tools ──
function coachPlan(a) {
  const worst = a.sub && a.sub[0], band = worst && worst.sg < -0.15 ? worst.k : null;
  const go = (label, js) => ({ label, js });
  switch (a.area) {
    case 'approach': {
      const ranges = { app50: [50, 100], app100: [100, 150], app150: [150, 200], app200: [180, 230] }[band] || [80, 170];
      return { why: band ? `Most of it comes from ${COACH_BANDS[band]}.` : 'Spread across your approach distances.',
        items: [`2× Target Practice, random ${ranges[0]}–${ranges[1]} yds (20 balls)`, band === 'app50' ? '1× Wedge Matrix: know your ½ / ¾ / full numbers' : '1× Combine (quick) every 2–3 weeks to re-measure'],
        actions: [go('Target Practice', "navTo('clubs');setTimeout(()=>drillOpen('target'),50)"), go(band === 'app50' ? 'Wedge Matrix' : 'Combine', `navTo('clubs');setTimeout(()=>drillOpen('${band === 'app50' ? 'wedges' : 'combine'}'),50)`)],
        target: `Lose ${Math.max(0.3, -a.sg * 0.5).toFixed(1)} fewer strokes to your goal here in 4–6 weeks` };
    }
    case 'offTee': return { why: 'Fairways and trouble off the tee.', items: ['2× Fairway Finder (14 drives, 32-yd fairway)', 'On the course: pick the widest target, not the flag line'],
      actions: [go('Fairway Finder', "navTo('clubs');setTimeout(()=>drillOpen('fairway'),50)")], target: 'Fairways hit up 10 points' };
    case 'penalties': return { why: 'Penalty strokes are the cheapest strokes to save.', items: ['1× Fairway Finder at the tight 25-yd width', 'Course plan: when there\'s water or OB, aim at the fat side and club down off the tee'],
      actions: [go('Fairway Finder', "navTo('clubs');setTimeout(()=>drillOpen('fairway'),50)")], target: `Under ${Math.max(0.5, coachGoal() * 0.09).toFixed(1)} penalties per round` };
    case 'putting': return { why: band ? `Mostly ${COACH_BANDS[band]}.` : 'Across your putting.',
      items: band === 'putShort' ? ['Gate drill: 3–6 ft, 25 putts, start each on line', 'Putting challenge: 6-foot streak'] : band === 'putLag' ? ['Lag ladder: 30, 40, 50 ft — stop each inside 3 ft', 'Putting challenge: distance control'] : ['Putting challenges: mid-range (8–15 ft) make %'],
      actions: [go('Putting challenges', "navTo('putting')"), go('Re-test putting', "coachOpenTest('putting')")], target: 'Re-test in 3 weeks: 1 more make per station' };
    case 'short': return { why: band ? `Mostly your ${COACH_BANDS[band]}.` : 'Getting up and down.',
      items: ['Landing-spot drill: 10 balls each to 3 spots, from 10–30 yds', 'Up-and-down game: 9 random lies, par 2 each'],
      actions: [go('Re-test short game', "coachOpenTest('short')")], target: 'Re-test in 3 weeks: more inside 6 ft' };
    case 'speed': return { why: a.gain5 ? `+5 mph would be worth about ${a.gain5.toFixed(1)} strokes a round.` : 'More distance means shorter approaches.',
      items: ['Speed program, 2–3 sessions a week', '1× Distance Check a month'], actions: [go('Speed training', "navTo('speed')")], target: '+3–5 mph in a program' };
  }
  return { why: '', items: [], actions: [], target: '' };
}

// ── Assessment (from scratch) ──────────────────────────────────
function coachAssessment() {
  const T = getCoachTests(), dh = getDrillData().history || {}, real = id => (dh[id] || []).some(h => !h.test);
  return [
    { id: 'profile', name: 'Your game & goal', desc: '2 minutes of questions', done: isFinite(getCoach().goal) && !!getCoach().weak, js: "document.getElementById('coach-profile').scrollIntoView({behavior:'smooth'})" },
    { id: 'putting', name: 'Putting test', desc: '40 putts at 3, 8, 20 and 40 ft (15 min)', done: T.putting.length > 0, js: "coachOpenTest('putting')" },
    { id: 'short', name: 'Short-game test', desc: '10 chips and 10 pitches (15 min)', done: T.short.length > 0, js: "coachOpenTest('short')" },
    { id: 'combine', name: 'Approach: Combine', desc: 'R10 · 30 shots, 60–180 yds', done: real('combine'), js: "navTo('clubs');setTimeout(()=>drillOpen('combine'),50)" },
    { id: 'fairway', name: 'Driving: Fairway Finder', desc: 'R10 · 14 drives', done: real('fairway'), js: "navTo('clubs');setTimeout(()=>drillOpen('fairway'),50)" },
    { id: 'speed', name: 'Speed baseline', desc: 'R10 + your trainer', done: getSpeedProfiles().length > 0, js: "navTo('speed')" },
    { id: 'round', name: 'Log a strokes-gained round', desc: 'The richest evidence of all', done: getSGRounds().some(r => r.completed !== false), js: "navTo('sg-round')" },
  ];
}

// ── Tests: putting and short game (entered as counts) ──────────
let coachTestOpen = null;
function coachOpenTest(kind) { navTo('coach'); coachTestOpen = kind; renderCoach(); setTimeout(() => document.getElementById('coach-test')?.scrollIntoView({ behavior: 'smooth' }), 30); }
function coachSaveTest(kind) {
  const v = id => Math.max(0, Math.min(10, parseInt(document.getElementById(id)?.value) || 0));
  const T = getCoachTests();
  if (kind === 'putting') T.putting.unshift({ date: todayISO(), m3: v('ct-m3'), m8: v('ct-m8'), m20: v('ct-m20'), lag: v('ct-lag') });
  else {
    const four = p => [v(p + '0'), v(p + '1'), v(p + '2'), v(p + '3')];
    const chip = four('ct-c'), pitch = four('ct-p');
    if (chip.reduce((a, b) => a + b, 0) !== 10 || pitch.reduce((a, b) => a + b, 0) !== 10) { showToast('Each station should add up to 10 balls'); return; }
    T.short.unshift({ date: todayISO(), chip, pitch });
  }
  saveCoachTests(T); coachTestOpen = null;
  awardXP(40, 'coach test'); onActivity('drill');
  showToast('✅ Test saved — your coach has updated');
  renderCoach();
}
function coachTestHTML() {
  if (!coachTestOpen) return '';
  const num = (id, label) => `<label class="coach-num"><span>${label}</span><input type="number" id="${id}" min="0" max="10" value="0" inputmode="numeric"></label>`;
  if (coachTestOpen === 'putting') return `<div class="card" id="coach-test"><div class="card-title">🕳️ Putting test</div>
    <p class="apex-hole-meta" style="margin-bottom:10px;">On a practice green, 10 putts at each station. Count them honestly — the coach is only as good as the numbers.</p>
    <div class="coach-nums">${num('ct-m3', 'Made from 3 ft')}${num('ct-m8', 'Made from 8 ft')}${num('ct-m20', 'Made from 20 ft')}${num('ct-lag', '40 ft lags stopped inside 3 ft')}</div>
    <div style="display:flex;gap:8px;margin-top:10px;"><button class="btn btn-primary" onclick="coachSaveTest('putting')">Save test</button><button class="btn btn-sm" style="background:var(--gray-light);color:var(--gray-dark);" onclick="coachTestOpen=null;renderCoach()">Cancel</button></div></div>`;
  const row = (p, title) => `<div class="coach-test-row"><div class="apex-subtitle">${title}</div><div class="coach-nums">${num(p + '0', 'Inside 3 ft')}${num(p + '1', '3–6 ft')}${num(p + '2', '6–12 ft')}${num(p + '3', 'Further')}</div></div>`;
  return `<div class="card" id="coach-test"><div class="card-title">⛳ Short-game test</div>
    <p class="apex-hole-meta" style="margin-bottom:10px;">10 balls per station to a hole. Count where each one finishes (each station adds up to 10).</p>
    ${row('ct-c', 'Chips from 15 yds (just off the green, light rough)')}${row('ct-p', 'Pitches from 40 yds (fairway)')}
    <div style="display:flex;gap:8px;margin-top:10px;"><button class="btn btn-primary" onclick="coachSaveTest('short')">Save test</button><button class="btn btn-sm" style="background:var(--gray-light);color:var(--gray-dark);" onclick="coachTestOpen=null;renderCoach()">Cancel</button></div></div>`;
}

// ── Snapshots: the estimates over time, so progress shows ──────
function coachSnapshot(an) {
  const c = getCoach(), snaps = c.snaps || [], key = an.evidence.length;
  const last = snaps[snaps.length - 1];
  if (last && last.n === key) return snaps; // nothing new
  snaps.push({ date: todayISO(), n: key, areas: Object.fromEntries(Object.values(an.areas).filter(Boolean).map(a => [a.area, Math.round(a.sg * 100) / 100])) });
  c.snaps = snaps.slice(-60); saveCoach(c);
  return c.snaps;
}

// ── Screens ────────────────────────────────────────────────────
function coachBarsHTML(an, snaps) {
  const first = snaps.length > 1 ? snaps[0] : null, max = Math.max(1.5, ...Object.values(an.areas).filter(Boolean).map(a => Math.abs(a.sg)));
  return Object.keys(COACH_AREAS).map(k => {
    const a = an.areas[k], A = COACH_AREAS[k];
    if (!a) return `<div class="coach-bar-row muted"><span class="coach-bar-name">${A.icon} ${A.name}</span><span class="coach-bar-none">no evidence yet</span></div>`;
    const w = Math.min(50, Math.abs(a.sg) / max * 50), was = first && first.areas[k];
    const trend = was !== undefined && was !== null ? a.sg - was : null;
    return `<div class="coach-bar-row"><span class="coach-bar-name">${A.icon} ${A.name}</span>
      <div class="coach-bar"><div class="coach-bar-mid"></div><div class="coach-bar-fill ${a.sg < 0 ? 'neg' : 'pos'}" style="${a.sg < 0 ? `right:50%;width:${w}%` : `left:50%;width:${w}%`}"></div></div>
      <span class="coach-bar-val ${a.sg < 0 ? 'neg' : 'pos'}">${a.sg >= 0 ? '+' : ''}${a.sg.toFixed(1)}</span>
      <span class="coach-conf ${coachConfLabel(a.conf)}">${coachConfLabel(a.conf)}</span>
      ${trend !== null && Math.abs(trend) >= 0.1 ? `<span class="coach-trend ${trend > 0 ? 'up' : 'down'}">${trend > 0 ? '▲' : '▼'} ${Math.abs(trend).toFixed(1)}</span>` : '<span class="coach-trend"></span>'}</div>`;
  }).join('');
}
function coachFocusHTML(a, i) {
  const A = COACH_AREAS[a.area], p = coachPlan(a);
  const ev = a.items.slice().sort((x, y) => y.w - x.w).slice(0, 3).map(e => `${e.src}${e.detail ? `: ${e.detail}` : ''}`);
  return `<div class="coach-focus">
    <div class="coach-focus-head"><span class="coach-rank">${i + 1}</span><span>${A.icon} <b>${A.name}</b></span>
      <span class="coach-focus-loss">${a.area === 'speed' ? `${a.sg.toFixed(1)}` : `${a.sg.toFixed(1)}`} strokes/round</span><span class="coach-conf ${coachConfLabel(a.conf)}">${coachConfLabel(a.conf)} confidence</span></div>
    <div class="coach-focus-why">${p.why}${a.sub.length > 1 ? ` <span class="apex-hole-meta">(${a.sub.slice(0, 3).map(s => `${COACH_BANDS[s.k] || s.k} ${s.sg >= 0 ? '+' : ''}${s.sg.toFixed(1)}`).join(' · ')})</span>` : ''}</div>
    <div class="coach-focus-ev">Evidence: ${ev.join(' · ')}</div>
    <div class="apex-subtitle" style="margin-top:8px;">This week</div><ul class="coach-plan">${p.items.map(x => `<li>${x}</li>`).join('')}</ul>
    <div class="apex-hole-meta">Target: ${p.target}</div>
    <div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:8px;">${p.actions.map(x => `<button class="btn btn-sm btn-primary" onclick="${x.js}">${x.label} ›</button>`).join('')}</div>
  </div>`;
}

function renderCoach() {
  const el = document.getElementById('coach-content'); if (!el) return;
  const an = coachAnalysis(), snaps = coachSnapshot(an), steps = coachAssessment(), c = getCoach();
  const done = steps.filter(s => s.done).length, focus = an.ranked.filter(a => a.sg < -0.05).slice(0, 3);
  const totalLoss = an.ranked.reduce((s, a) => s + Math.min(0, a.sg), 0);
  el.innerHTML = `
    <div class="card coach-hero">
      <div><div class="coach-hero-title">Your Improvement Coach</div>
        <div class="coach-hero-sub">Strokes per round compared with a <b>${an.goal}-handicap</b> golfer (your goal)${an.current !== null ? ` · you’re about ${an.current}` : ''}</div></div>
      ${focus.length ? `<div class="coach-hero-num">${totalLoss.toFixed(1)}<span>strokes/round to find</span></div>` : ''}
    </div>
    ${done < steps.length ? `<div class="card"><div class="card-title">Assessment · ${done}/${steps.length}</div>
      <p class="apex-hole-meta" style="margin-bottom:8px;">Starting from scratch: each step gives your coach real evidence. Do them in any order — priorities appear after the first one and sharpen with each.</p>
      <div class="progress-bar-wrap" style="margin-bottom:10px;"><div class="progress-bar" style="width:${Math.round(done / steps.length * 100)}%"></div></div>
      ${steps.map(s => `<div class="coach-step ${s.done ? 'done' : ''}"><span class="coach-step-check">${s.done ? '✅' : '○'}</span><div style="flex:1;"><b>${s.name}</b><div class="apex-hole-meta">${s.desc}</div></div>${s.done ? '' : `<button class="btn btn-sm btn-primary" onclick="${s.js}">Start</button>`}</div>`).join('')}</div>` : ''}
    ${coachTestHTML()}
    ${focus.length ? `<div class="card"><div class="card-title">What to work on</div>${focus.map(coachFocusHTML).join('')}</div>`
      : `<div class="card"><div class="card-title">What to work on</div><p style="font-size:0.86rem;color:var(--gray-mid);">${an.evidence.length ? 'Nothing is costing you strokes against your goal yet — set a tougher goal, or add more evidence.' : 'Complete any assessment step and your first priorities appear here.'}</p></div>`}
    ${an.ranked.length ? `<div class="card"><div class="card-title">Where your strokes go</div>
      <div class="apex-hole-meta" style="margin-bottom:8px;">Each area vs a ${an.goal}-handicap golfer: left (red) loses strokes, right gains. ▲▼ = change since your first assessment.</div>
      ${coachBarsHTML(an, snaps)}
      <div class="apex-hole-meta" style="margin-top:8px;">Confidence grows with evidence: strokes-gained rounds count most, then tests and drills, then scorecards and Apex.</div></div>` : ''}
    <div class="card" id="coach-profile"><div class="card-title">Your game & goal</div>
      <div class="drill-opt"><label>Current handicap (or your best guess)</label><input type="number" step="0.1" min="-5" max="54" value="${isFinite(c.handicap) ? c.handicap : ''}" placeholder="${an.current ?? 'e.g. 18'}" onchange="coachSet('handicap', this.value === '' ? null : parseFloat(this.value))" style="max-width:120px;"></div>
      <div class="drill-opt"><label>Goal handicap — the coach measures you against this</label><input type="number" step="0.1" min="-5" max="54" value="${isFinite(c.goal) ? c.goal : ''}" placeholder="${an.goal}" onchange="coachSet('goal', this.value === '' ? null : parseFloat(this.value))" style="max-width:120px;"></div>
      <div class="drill-opt"><label>Where do you feel you lose the most shots?</label><div class="toggle-group">${Object.entries(COACH_AREAS).map(([k, A]) => `<button class="toggle-btn ${c.weak === k ? 'active' : ''}" onclick="coachSet('weak','${k}')">${A.name}</button>`).join('')}</div></div>
      <div class="drill-opt"><label>Practice time per week</label><div class="toggle-group">${[1, 2, 4, 6].map(hrs => `<button class="toggle-btn ${c.hours === hrs ? 'active' : ''}" onclick="coachSet('hours', ${hrs})">${hrs === 6 ? '6+' : hrs} h</button>`).join('')}</div></div>
    </div>`;
}

// Dashboard: the top three in brief
function coachCardHTML() {
  const an = coachAnalysis(), focus = an.ranked.filter(a => a.sg < -0.05).slice(0, 3), steps = coachAssessment(), done = steps.filter(s => s.done).length;
  return `<div class="card"><div style="display:flex;justify-content:space-between;align-items:center;gap:8px;margin-bottom:8px;">
      <div class="card-title" style="margin:0;">🧭 What to work on</div><button class="btn btn-sm" style="background:var(--gray-light);color:var(--gray-dark);" onclick="navTo('coach')">Coach ›</button></div>
    ${focus.length ? focus.map((a, i) => `<div class="coach-mini"><span class="coach-rank">${i + 1}</span><span>${COACH_AREAS[a.area].icon} <b>${COACH_AREAS[a.area].name}</b></span><span class="coach-focus-loss">${a.sg.toFixed(1)}/rd</span><span class="coach-conf ${coachConfLabel(a.conf)}">${coachConfLabel(a.conf)}</span></div>`).join('')
      : `<p style="font-size:0.84rem;color:var(--gray-mid);">Take the ${done ? 'next' : 'first'} assessment step (${done}/${steps.length} done) and your coach will show where your strokes are going.</p>`}
  </div>`;
}

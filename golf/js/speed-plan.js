// Golf Improvement App — Speed training plans: equipment, baseline profile, program library,
// recommendations, scheduling, progress checks and the consistency score.
// Classic script: shares globals with the other files; load order is set in golf-improvement-app.html.

// ════════════════════════════════════════════════════════════
// SPEED PLANS
// The approach follows the published principles of modern speed training
// (overspeed with lighter implements, load with heavier ones, max intent,
// both sides, low volume, rest between sessions), in the spirit of systems
// like The Stack. The programs and the profile rules below are our own:
// rules of thumb, not anyone's proprietary algorithm.
//
// Equipment: a driver, plus optional light / medium / heavy speed sticks
// (e.g. one stick with screw-on weights) and an optional weighted driver
// (anything heavier than your driver, e.g. a weighted headcover) for true overload.
// ════════════════════════════════════════════════════════════
const SPD_GEAR_DEFAULT = {
  sticks: true, overload: false, perWeek: 3, experience: 'some', weakArm: 'none',
  labels: { 'Light stick': 'bare, 240 g', 'Medium stick': 'one weight, 275 g', 'Heavy stick': 'all weights, 325 g', 'Weighted driver': 'driver + weight' },
};
function spdGear() { return { ...SPD_GEAR_DEFAULT, ...(spdSettings.gear || {}), labels: { ...SPD_GEAR_DEFAULT.labels, ...((spdSettings.gear || {}).labels || {}) } }; }
function spdSetGear(key, val) { spdSettings.gear = { ...spdGear(), [key]: val }; spdSaveSettings(); renderSpeed(); }
function spdSetGearLabel(tool, val) { const g = spdGear(); g.labels[tool] = String(val).slice(0, 40); spdSettings.gear = g; spdSaveSettings(); }
function spdToolLabel(tool) { const l = spdGear().labels[tool]; return tool === 'Driver' || !l ? tool : `${tool} (${l})`; }

function getSpeedProfiles()  { return loadData(KEYS.speedProfile, []); }
function saveSpeedProfiles(p){ saveData(KEYS.speedProfile, p); }
function spdLatestProfile()  { return getSpeedProfiles()[0] || null; }

// ── Program library ────────────────────────────────────────────
// build(week, k, ctx) → sets, where k is the session number within the program (1-based)
// and ctx = { gear, final (last session), recovery (lighter week) }
const SPD_L = 'Light stick', SPD_M = 'Medium stick', SPD_H = 'Heavy stick', SPD_D = 'Driver', SPD_WD = 'Weighted driver';
function spdReps(week, weeks, recovery) {
  if (recovery) return 3;
  return week <= Math.ceil(weeks / 3) ? 3 : week <= Math.ceil(weeks * 2 / 3) ? 4 : 5;
}
const spdRecoveryWeek = (week, weeks) => (weeks >= 8 && week === 5) || (weeks === 6 && week === 4);
// Every session opens with easy driver swings and ends with driver work (or a test on the last day)
function spdWrap(sets, ctx, r, rest = 20) {
  const out = [spdSet('warmup', SPD_D, 3, 15), ...sets.filter(Boolean)];
  out.push(spdSet(ctx.final ? 'test' : 'normal', SPD_D, ctx.final ? 5 : r, ctx.final ? 30 : rest));
  return ctx.recovery ? out.filter((s, i) => i < 3 || i === out.length - 1) : out; // recovery: fewer sets
}

const SPEED_PROGRAMS = {
  foundation: { name: 'Foundation', weeks: 6, perWeek: 3, needs: 'sticks', focus: 'Balanced',
    desc: 'All three stick weights from both sides plus the step drill, then driver. The place to start, and worth repeating.',
    build: (w, k, c) => { const r = spdReps(w, 6, c.recovery);
      return spdWrap([spdSet('normal', SPD_L, r, 10), spdSet('opposite', SPD_L, r - 1, 10), spdSet('normal', SPD_M, r, 10), spdSet('opposite', SPD_M, r - 1, 10),
                      spdSet('normal', SPD_H, r, 10), spdSet('step', SPD_H, r - 1, 10)], c, r); } },
  spectrum: { name: 'Full Spectrum', weeks: 8, perWeek: 3, needs: 'sticks', focus: 'Speed + force',
    desc: 'Alternates fast days (light stick, max speed) with force days (heavy, step, weighted). For golfers with some speed training behind them.',
    build: (w, k, c) => { const r = spdReps(w, 8, c.recovery);
      return k % 2
        ? spdWrap([spdSet('normal', SPD_L, r, 15), spdSet('opposite', SPD_L, r, 15), spdSet('step', SPD_L, r, 15), spdSet('normal', SPD_M, r, 15)], c, r)
        : spdWrap([spdSet('normal', SPD_H, r, 15), spdSet('opposite', SPD_H, r, 15), spdSet('step', SPD_H, r, 15), c.gear.overload ? spdSet('normal', SPD_WD, r, 20) : null, spdSet('step', SPD_D, r, 20)], c, r); } },
  speed: { name: 'Speed Focus', weeks: 8, perWeek: 3, needs: 'sticks', focus: 'Overspeed',
    desc: 'Few swings, long rests, every one the fastest you can make: mostly the light stick. For golfers who are strong but don’t swing as fast as they should.',
    build: (w, k, c) => { const r = Math.min(4, spdReps(w, 8, c.recovery));
      return spdWrap([spdSet('normal', SPD_L, r, 25), spdSet('normal', SPD_L, r, 25), spdSet('opposite', SPD_L, r, 20), spdSet('step', SPD_L, r, 25), spdSet('normal', SPD_M, r, 25)], c, r, 30); } },
  heavy: { name: 'Heavy & Control', weeks: 8, perWeek: 3, needs: 'sticks', focus: 'Load',
    desc: 'Heavier swings to build force and control through the swing. Best with a weighted driver; otherwise it uses your heaviest setting.',
    build: (w, k, c) => { const r = spdReps(w, 8, c.recovery);
      return spdWrap([spdSet('normal', SPD_H, r, 15), spdSet('opposite', SPD_H, r, 15), c.gear.overload ? spdSet('normal', SPD_WD, r, 20) : spdSet('step', SPD_H, r, 15),
                      c.gear.overload ? spdSet('step', SPD_WD, r - 1, 20) : null, spdSet('normal', SPD_M, r, 15)], c, r); } },
  step: { name: 'Step & Sequence', weeks: 8, perWeek: 3, needs: 'sticks', focus: 'Transition',
    desc: 'Built around the step drill to train the lower body to start the downswing. For golfers whose step swings aren’t faster than their normal ones.',
    build: (w, k, c) => { const r = spdReps(w, 8, c.recovery);
      return spdWrap([spdSet('step', SPD_L, r, 15), spdSet('opposite', SPD_L, r, 10), spdSet('step', SPD_M, r, 15), spdSet('step', SPD_H, r, 15), spdSet('step', SPD_D, r, 20)], c, r); } },
  lead: { name: 'Lead Arm', weeks: 8, perWeek: 3, needs: 'sticks', focus: 'Single arm',
    desc: 'Lead-arm-only swings with the light and medium settings, so the trail arm can’t hide a weak lead side. Then two-handed swings to blend it in.',
    build: (w, k, c) => { const r = spdReps(w, 8, c.recovery);
      return spdWrap([spdSet('lead', SPD_L, r, 15), spdSet('lead', SPD_M, r, 15), spdSet('normal', SPD_L, r, 10), spdSet('normal', SPD_M, r, 10)], c, r); } },
  trail: { name: 'Trail Arm', weeks: 8, perWeek: 3, needs: 'sticks', focus: 'Single arm',
    desc: 'Trail-arm-only swings with the light and medium settings, to build a trail arm that pushes speed. Then two-handed swings to blend it in.',
    build: (w, k, c) => { const r = spdReps(w, 8, c.recovery);
      return spdWrap([spdSet('trail', SPD_L, r, 15), spdSet('trail', SPD_M, r, 15), spdSet('normal', SPD_L, r, 10), spdSet('normal', SPD_M, r, 10)], c, r); } },
  foundations: { name: 'Driver Only', weeks: 6, perWeek: 3, needs: null, focus: 'No sticks',
    desc: 'Driver only, no extra gear: max-effort normal and step swings that build each week and finish with a speed test.',
    build: (w, k, c) => { const r = spdReps(w, 6, c.recovery) + 1;
      return spdWrap([spdSet('normal', SPD_D, r, 20), spdSet('step', SPD_D, r, 20), w >= 3 ? spdSet('opposite', SPD_D, r - 2, 20) : null, w >= 3 ? spdSet('step', SPD_D, r, 20) : null], c, r); } },
  maintain: { name: 'Maintenance', weeks: 0, perWeek: 2, needs: null, focus: 'In season',
    desc: 'Hold the speed you’ve gained when time is short: pick an 8, 15 or 25-minute session each time. No end date.',
    build: (w, k, c) => spdFlexSets('mixed', spdSettings.flexLen || 15, c.gear) },
  flex: { name: 'Flex', weeks: 0, perWeek: 3, needs: null, focus: 'Your choice',
    desc: 'Choose the focus (overspeed, load or mixed) and length each session. No end date.',
    build: (w, k, c) => spdFlexSets(spdSettings.flexFocus || 'mixed', spdSettings.flexLen || 15, c.gear) },
  custom: { name: 'Custom Session', weeks: 0, perWeek: 0, needs: null, focus: 'Your sets',
    desc: 'Build your own session from the drills below. Sessions are saved, but there is no weekly plan.',
    build: () => spdCustomSets().map(s => spdSet(s.drill, s.tool, s.reps, s.rest)) },
};
const SPD_LEGACY_NAMES = { overspeed: 'Overspeed Training Sticks' }; // older sessions keep their label

// Sessions for Maintenance and Flex: focus × length (minutes)
function spdFlexSets(focus, mins, gear) {
  const sticks = gear.sticks;
  const fast = sticks ? [spdSet('normal', SPD_L, 3, 15), spdSet('opposite', SPD_L, 3, 10), spdSet('normal', SPD_M, 3, 15), spdSet('step', SPD_L, 3, 15)] : [spdSet('step', SPD_D, 4, 20)];
  const load = sticks ? [spdSet('normal', SPD_H, 3, 15), gear.overload ? spdSet('normal', SPD_WD, 3, 20) : spdSet('step', SPD_H, 3, 15), spdSet('opposite', SPD_H, 3, 15)] : [spdSet('normal', SPD_D, 4, 20)];
  const pool = focus === 'overspeed' ? fast : focus === 'overload' ? load : fast.map((s, i) => [s, load[i]]).flat().filter(Boolean);
  const n = mins <= 8 ? 1 : mins <= 15 ? 3 : 5;
  return [spdSet('warmup', SPD_D, mins <= 8 ? 2 : 3, 15), ...pool.slice(0, n), spdSet('normal', SPD_D, mins <= 8 ? 3 : 4, 20)];
}

// Special sessions (not part of a program)
function spdBaselineSets() {
  const g = spdGear(), rec = s => ({ ...s, record: true }); // every swing is measured (type it in if the R10 can't read the stick)
  return [spdSet('warmup', SPD_D, 3, 15),
    ...(g.sticks ? [rec(spdSet('normal', SPD_L, 3, 20)), rec(spdSet('opposite', SPD_L, 2, 20)), rec(spdSet('normal', SPD_M, 3, 20)), rec(spdSet('normal', SPD_H, 3, 20))] : []),
    ...(g.sticks && g.overload ? [rec(spdSet('normal', SPD_WD, 3, 25))] : []),
    rec(spdSet('normal', SPD_D, 3, 25)), rec(spdSet('step', SPD_D, 3, 25)), ...(g.sticks ? [] : [rec(spdSet('opposite', SPD_D, 2, 25))])];
}
function spdPrimingSets() {
  const g = spdGear();
  return [spdSet('warmup', SPD_D, 3, 10), ...(g.sticks ? [spdSet('normal', SPD_L, 3, 10), spdSet('opposite', SPD_L, 2, 10)] : [spdSet('step', SPD_D, 3, 15)]), spdSet('normal', SPD_D, 3, 15)];
}
const SPD_SPECIAL = {
  baseline: { name: 'Baseline Test', desc: 'Measures every tool you own to build your speed profile.' },
  check:    { name: 'Progress Check', desc: 'Re-tests your baseline to measure what the program gained you.' },
  priming:  { name: 'Pre-round Priming', desc: 'Five minutes before you play: wake up your speed without tiring yourself out.' },
  distance: { name: 'Distance Check', desc: 'Five real driver balls with the R10: what your speed is worth in yards.' },
};
function spdProgramName(id) { return (SPEED_PROGRAMS[id] || SPD_SPECIAL[id] || {}).name || SPD_LEGACY_NAMES[id] || 'Speed session'; }
function spdProgramAvailable(id) { const p = SPEED_PROGRAMS[id]; return !!p && (p.needs !== 'sticks' || spdGear().sticks); }

// ── Profile ────────────────────────────────────────────────────
// Best speed for each tool + drill from a measuring session's swings
function spdProfileFrom(swings) {
  const best = {};
  swings.filter(s => !s.warmup && s.mph).forEach(s => { const k = `${s.tool}|${s.drill || 'normal'}`; best[k] = Math.max(best[k] || 0, s.mph); });
  return best;
}
// What the numbers say (rules of thumb)
function spdAnalyze(p) {
  const b = p.best, d = b['Driver|normal'], l = b['Light stick|normal'], h = b['Heavy stick|normal'];
  const out = { notes: [], ratios: {} };
  if (d && b['Driver|step']) {
    const gain = b['Driver|step'] / d - 1; out.ratios.step = gain;
    out.notes.push(gain < 0.01 ? { k: 'step', text: `Your step swings aren’t faster than your normal ones (${(gain * 100).toFixed(1)}%). Most golfers gain 2–5%: the transition is worth training.` }
                               : { k: 'stepok', text: `The step drill adds ${(gain * 100).toFixed(1)}% — your lower body is helping.` });
  }
  if (l && h) {
    const drop = (l - h) / l; out.ratios.load = drop;
    out.notes.push(drop < 0.05 ? { k: 'speed', text: `You lose only ${(drop * 100).toFixed(1)}% going from the light to the heavy setting: you’re strong for your speed. Overspeed (light, fast) work should pay off most.` }
      : drop > 0.12 ? { k: 'force', text: `You lose ${(drop * 100).toFixed(1)}% from light to heavy: force is your limiter. Heavier, controlled work should pay off most.` }
      : { k: 'balanced', text: `Light-to-heavy drop of ${(drop * 100).toFixed(1)}% is in the balanced range: train both ends.` });
  }
  if (l && b['Light stick|opposite']) {
    const side = b['Light stick|opposite'] / l; out.ratios.side = side;
    if (side < 0.85) out.notes.push({ k: 'side', text: `Your opposite side is ${Math.round(side * 100)}% of your normal side. Narrowing that gap is an easy early gain.` });
  }
  if (d && l) out.ratios.overspeed = l / d;
  return out;
}
// Programs ranked for you: [{ id, score, why }]
function spdRecommend() {
  const g = spdGear(), prof = spdLatestProfile(), a = prof ? spdAnalyze(prof) : { notes: [] }, has = k => a.notes.some(n => n.k === k);
  const done = id => spdPlanPosition(id)?.complete;
  const list = [];
  const add = (id, score, why) => { if (spdProgramAvailable(id)) list.push({ id, score: score - (done(id) ? 1.5 : 0), why }); };
  if (!g.sticks) { add('foundations', 5, 'You train with your driver only'); add('maintain', 1, 'Short sessions to hold your speed'); return list.sort((x, y) => y.score - x.score); }
  add('foundation', g.experience === 'new' || !prof ? 4 : 2.5, g.experience === 'new' ? 'New to speed training: start here' : 'Balanced work for everyone');
  add('speed', has('speed') ? 4.5 : 1.5, has('speed') ? 'You’re strong for your speed' : 'Overspeed emphasis');
  add('heavy', has('force') ? 4.5 : 1, has('force') ? 'Force is your limiter' : 'Load emphasis' + (g.overload ? '' : ' (best with a weighted driver)'));
  add('spectrum', g.experience === 'experienced' ? 3.5 : has('balanced') ? 2.8 : 1.5, g.experience === 'experienced' ? 'You have speed training behind you' : 'Speed and force together');
  add('step', has('step') ? 4.2 : 1, has('step') ? 'Your step swings aren’t adding speed' : 'Transition emphasis');
  add('lead', g.weakArm === 'lead' ? 4 : 0.5, g.weakArm === 'lead' ? 'You said your lead arm limits you' : 'Single-arm (lead)');
  add('trail', g.weakArm === 'trail' ? 4 : 0.5, g.weakArm === 'trail' ? 'You said your trail arm limits you' : 'Single-arm (trail)');
  return list.sort((x, y) => y.score - x.score);
}

// Estimated driver speed from a stick swing, using your own baseline ratio
function spdESpeed(mph, tool) {
  if (tool === 'Driver') return mph;
  const p = spdLatestProfile(), d = p && p.best['Driver|normal'], t = p && p.best[`${tool}|normal`];
  return d && t ? Math.round(mph * d / t * 10) / 10 : null;
}
// What a driver speed is worth: good strike (smash 1.45), ~13° launch, ~2,600 rpm, fairway, no wind
function spdDistance(mph) {
  if (!mph) return null;
  const r = simulateShot({ ballMph: mph * 1.45, launch: 13, spin: 2600 }, 'fairway');
  return { carry: Math.round(r.carry), total: Math.round(r.total) };
}
// Personal bests for every tool (normal, step and test swings)
function spdToolPBsRaw() {
  const pb = {};
  getSpeedSessions().forEach(s => (s.swings || []).forEach(w => {
    if (w.warmup || !w.mph || ['opposite', 'lead', 'trail'].includes(w.drill)) return;
    pb[w.tool] = Math.max(pb[w.tool] || 0, w.mph);
  }));
  return pb;
}

// ── Schedule and consistency ───────────────────────────────────
const SPD_DAY = 86400000;
const spdDate = iso => new Date(iso + 'T12:00:00');
function spdGapDays(perWeek) { return perWeek >= 3 ? 2 : 3; }
// When the next program session is due: rest days between sessions keep you fresh
function spdSchedule(id) {
  const prog = SPEED_PROGRAMS[id];
  if (!prog || !prog.perWeek) return null;
  const perWeek = Math.min(prog.perWeek, spdGear().perWeek);
  const last = getSpeedSessions().find(s => s.programId === id && s.completed);
  const gap = spdGapDays(perWeek);
  if (!last) return { due: true, gap, perWeek };
  const dueAt = new Date(spdDate(last.date).getTime() + gap * SPD_DAY), today = spdDate(todayISO());
  return { due: today >= dueAt || (today - spdDate(last.date)) / SPD_DAY >= gap - 0.5, dueAt, lastDate: last.date, gap, perWeek,
           sameDay: last.date === todayISO() };
}
// 0–100: sessions on schedule, sets finished, rests taken (not skipped)
function spdConsistency(id) {
  const start = (spdSettings.programStart || {})[id], sessions = getSpeedSessions().filter(s => s.programId === id && (!start || s.date >= start));
  if (!start || !sessions.length) return null;
  const sch = spdSchedule(id), total = SPEED_PROGRAMS[id].weeks * SPEED_PROGRAMS[id].perWeek || Infinity;
  const days = Math.max(0, (spdDate(todayISO()) - spdDate(start)) / SPD_DAY);
  const expected = Math.min(total, 1 + Math.floor(days / (sch ? sch.gap : 2)));
  const done = sessions.filter(s => s.completed).length;
  const timely = Math.min(1, done / Math.max(1, expected));
  const finish = sessions.reduce((a, s) => a + (s.setsPlanned ? Math.min(1, (s.setsDone ?? s.setsPlanned) / s.setsPlanned) : 1), 0) / sessions.length;
  const rests = sessions.reduce((a, s) => a + (s.rests || 0), 0), skipped = sessions.reduce((a, s) => a + (s.skips || 0), 0);
  const restOk = rests ? 1 - Math.min(1, skipped / rests) : 1;
  return Math.round(100 * (0.6 * timely + 0.25 * finish + 0.15 * restOk));
}
function spdMarkProgramStart(id) {
  const starts = { ...(spdSettings.programStart || {}) };
  if (!starts[id] || spdPlanDone(id) === 0) { starts[id] = todayISO(); spdSettings.programStart = starts; spdSaveSettings(); }
}
function spdToolPBs() { return memo('spdToolPBs', spdToolPBsRaw); } // cached until data changes

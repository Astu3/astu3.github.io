// Golf Improvement App — Audio-coached speed training sessions and the Speed page (plans live in speed-plan.js).
// Classic script: shares globals with the other files; load order is set in golf-improvement-app.html.

// ════════════════════════════════════════════════════════════
// SPEED TRAINING  (audio coach + Garmin R10)
// A session is a list of sets: drill × tool × reps × rest. With the R10
// connected, driver swings are recorded automatically; otherwise the user
// types (or says) the speed. Training-stick sets are counted, not recorded,
// unless "Record stick speeds" is on (some players measure them with a radar).
// Speeds are stored in mph and shown in the chosen unit.
// ════════════════════════════════════════════════════════════
function getSpeedSessions()  { return loadData(KEYS.speed, []); }
function saveSpeedSessions(s){ saveData(KEYS.speed, s); }

const SPEED_DRILLS = {
  warmup:   { name: 'Warm-up',       cue: 'Easy swings at about seventy percent effort. Get loose.' },
  normal:   { name: 'Normal stance', cue: 'Normal stance. Swing as fast as you possibly can.' },
  step:     { name: 'Step drill',    cue: 'Start with your feet together, step toward the target, and swing all out.' },
  opposite: { name: 'Opposite side', cue: 'Turn around and swing from your opposite side. Full speed.' },
  lead:     { name: 'Lead arm only',  cue: 'Lead arm only. Trail hand behind your back. Swing as fast as you can.' },
  trail:    { name: 'Trail arm only', cue: 'Trail arm only. Lead hand off the club. Push the speed with that trail arm.' },
  test:     { name: 'Speed test',    cue: 'Test time. All-out swings. Your best one counts.' },
};
const SPEED_TOOLS = ['Driver', 'Light stick', 'Medium stick', 'Heavy stick', 'Weighted driver'];
const isStick = tool => tool !== 'Driver';
const SPD_TIMED_SWING_MS = 8000; // gap between counted (unrecorded) swings

let spdSettings = { audio: true, voice: false, recordSticks: false, program: 'foundation', flexLen: 15, flexFocus: 'mixed', ...loadData(KEYS.speedSettings, {}) };
function spdSaveSettings() { saveData(KEYS.speedSettings, spdSettings); }

function spdSet(drill, tool, reps, rest) {
  return { drill, tool, reps, rest, record: !isStick(tool) || !!spdSettings.recordSticks };
}
function spdSetName(set) {
  const d = SPEED_DRILLS[set.drill] || SPEED_DRILLS.normal;
  return set.tool === 'Driver' ? d.name : `${set.tool} · ${d.name}`;
}
function spdBetweenRest(nextSet) { return isStick(nextSet.tool) ? 30 : 60; }

// Programs, profiles and scheduling: speed-plan.js

const SPD_DEFAULT_CUSTOM = [
  { drill: 'warmup', tool: 'Driver', reps: 3, rest: 15 },
  { drill: 'normal', tool: 'Driver', reps: 5, rest: 20 },
  { drill: 'step',   tool: 'Driver', reps: 5, rest: 20 },
];
function spdCustomSets() {
  const s = loadData(KEYS.speedCustom, null);
  return Array.isArray(s) ? s : SPD_DEFAULT_CUSTOM.map(x => ({ ...x }));
}
function spdSaveCustom(sets) { saveData(KEYS.speedCustom, sets); }

// Weekly plans progress by completed sessions, so missed days don't skip weeks
function spdPlanDone(id)       { return loadData(KEYS.speedPlan, {})[id] || 0; }
function spdSetPlanDone(id, n) { saveData(KEYS.speedPlan, { ...loadData(KEYS.speedPlan, {}), [id]: n }); }
function spdPlanPosition(id) {
  const prog = SPEED_PROGRAMS[id];
  if (!prog || !prog.weeks) return null;
  const total = prog.weeks * prog.perWeek, done = Math.min(spdPlanDone(id), total);
  return {
    done, total, complete: done >= total,
    week: Math.min(prog.weeks, Math.floor(done / prog.perWeek) + 1),
    session: done >= total ? prog.perWeek : (done % prog.perWeek) + 1,
  };
}
function spdCurrentProgram() {
  if (spdProgramAvailable(spdSettings.program)) return spdSettings.program;
  return spdGear().sticks ? 'foundation' : 'foundations';
}
// Today's sets: the session after the last completed one (a finished program repeats its final week)
function spdBuildToday(id) {
  const prog = SPEED_PROGRAMS[id], pos = spdPlanPosition(id);
  const week = pos ? pos.week : 1, k = pos ? Math.min(pos.total, pos.done + 1) : 1;
  return prog.build(week, k, { gear: spdGear(), final: !!pos && !pos.complete && pos.done + 1 === pos.total,
                               recovery: !!pos && spdRecoveryWeek(week, prog.weeks) });
}

let spd = null;        // active session state
let spdTimer = null;   // rest countdown interval
let spdSwingTimer = null; // auto-advance for counted swings
let spdRec = null;     // active speech recognizer
let spdWake = null;    // screen wake lock
let spdAudioCtx = null;

function spdAlive(tok) { return !!spd && spd.token === tok; }
function spdVoiceSupported() { return !!(window.SpeechRecognition || window.webkitSpeechRecognition); }
// Driver max-effort swings are what the speed stats and personal best track
const spdScored = s => !s.warmup && (s.tool || 'Driver') === 'Driver' && s.mph !== null && s.mph !== undefined;
function spdPBRaw() {
  let pb = 0;
  getSpeedSessions().forEach(s => { if (s.max && s.max > pb) pb = s.max; });
  return pb || null;
}
function spdFmt(sec) { sec = Math.max(0, sec); return `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`; }
function spdMinutes(sets) {
  let secs = 0;
  sets.forEach((s, i) => {
    secs += s.reps * ((s.record ? 15 : SPD_TIMED_SWING_MS / 1000) + s.rest) - s.rest;
    if (i < sets.length - 1) secs += spdBetweenRest(sets[i + 1]) + 15;
  });
  return Math.max(1, Math.round(secs / 60));
}

// ── Audio: spoken cues + beeps ─────────────────────────────────
function spdSay(text) {
  return new Promise(res => {
    if (!spdSettings.audio || !('speechSynthesis' in window)) return res();
    let finished = false;
    const done = () => { if (!finished) { finished = true; clearTimeout(t); res(); } };
    const t = setTimeout(done, 1500 + text.length * 90); // safety net: onend doesn't always fire
    try {
      speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(text);
      u.rate = 1.0;
      u.onend = done; u.onerror = done;
      speechSynthesis.speak(u);
    } catch { done(); }
  });
}

function spdBeep(freq = 880, ms = 150) {
  if (!spdSettings.audio) return;
  try {
    if (!spdAudioCtx) spdAudioCtx = new (window.AudioContext || window.webkitAudioContext)();
    const ctx = spdAudioCtx, o = ctx.createOscillator(), g = ctx.createGain();
    o.frequency.value = freq;
    o.connect(g); g.connect(ctx.destination);
    g.gain.setValueAtTime(0.25, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + ms / 1000);
    o.start(); o.stop(ctx.currentTime + ms / 1000);
  } catch {}
}

async function spdWakeLock() { try { if ('wakeLock' in navigator) spdWake = await navigator.wakeLock.request('screen'); } catch {} }
function spdReleaseWake()    { try { spdWake && spdWake.release(); } catch {} spdWake = null; }

// ── Voice entry: "one oh five", "105", "redo" ──────────────────
// Returns the spoken number (in the user's unit), or null
function spdParseSpeech(t) {
  t = t.toLowerCase().replace(/,/g, '');
  const m = t.match(/\d+(\.\d+)?/);
  let v = m ? parseFloat(m[0]) : null;
  if (v === null) {
    const DIG = { zero:0, oh:0, o:0, one:1, two:2, to:2, too:2, three:3, four:4, for:4, five:5, six:6, seven:7, eight:8, ate:8, nine:9 };
    const ONES = { ...DIG, ten:10, eleven:11, twelve:12, thirteen:13, fourteen:14, fifteen:15, sixteen:16, seventeen:17, eighteen:18, nineteen:19 };
    const TENS = { twenty:20, thirty:30, forty:40, fifty:50, sixty:60, seventy:70, eighty:80, ninety:90 };
    const skip = ['and', 'mph', 'miles', 'per', 'hour', 'kilometers', 'kilometres', 'km', 'kph'];
    const words = t.split(/[\s-]+/).filter(w => w && !skip.includes(w));
    const additive = ws => {                                       // "ninety eight", "one hundred five"
      let cur = 0, seen = false;
      for (const w of ws) {
        if (w in ONES) { cur += ONES[w]; seen = true; }
        else if (w in TENS) { cur += TENS[w]; seen = true; }
        else if (w === 'hundred') { cur = (cur || 1) * 100; seen = true; }
      }
      return seen ? cur : null;
    };
    if (words.length >= 2 && words.every(w => w in DIG)) {
      v = parseFloat(words.map(w => DIG[w]).join(''));            // "one oh five"
    } else if (words.length >= 2 && DIG[words[0]] > 0 && words[1] !== 'hundred') {
      const rest = additive(words.slice(1));                       // "one fifteen" = 115, "one eighty" = 180
      v = rest !== null ? DIG[words[0]] * 100 + rest : null;
    } else {
      v = additive(words);
    }
  }
  const mph = v ? fromUnit(v) : 0;
  return (mph >= 30 && mph <= 170) ? v : null;
}

function spdStopListening() {
  if (spdRec) { spdRec._handled = true; try { spdRec.abort(); } catch {} spdRec = null; }
  const mic = document.getElementById('spd-mic'); if (mic) mic.textContent = '';
}

function spdListen(tok) {
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SR || !spdSettings.voice || !spdAlive(tok) || spd.phase !== 'swing') return;
  spdStopListening();
  const rec = new SR();
  rec.lang = 'en-US'; rec.interimResults = false; rec.maxAlternatives = 3; rec.continuous = false;
  rec.onresult = e => {
    rec._handled = true;
    const alts = Array.from(e.results[0]).map(a => a.transcript);
    if (alts.some(a => /redo|again|repeat|misread/i.test(a))) { spdRedoSwing(); return; }
    for (const a of alts) { const v = spdParseSpeech(a); if (v) { spdRecord(v); return; } }
    spdSay("Didn't catch that. Say the speed again.").then(() => spdListen(tok));
  };
  rec.onerror = e => {
    if (e.error === 'not-allowed' || e.error === 'service-not-allowed') {
      rec._handled = true;
      spdSettings.voice = false; spdSaveSettings();
      showToast('🎙️ Microphone blocked — type speeds instead');
    }
  };
  rec.onend = () => {
    if (spdRec === rec) spdRec = null;
    // Recognition times out on silence — keep listening while we're waiting for a speed
    if (!rec._handled) setTimeout(() => spdListen(tok), 250);
  };
  try {
    rec.start(); spdRec = rec;
    const mic = document.getElementById('spd-mic'); if (mic) mic.textContent = '🎙️ Listening…';
  } catch {}
}

// ── Session flow ───────────────────────────────────────────────
// kind: a program session (default) or 'baseline' / 'check' / 'priming'
function startSpeedSession(kind) {
  const special = SPD_SPECIAL[kind] ? kind : null;
  const programId = special || spdCurrentProgram();
  if (special === 'distance' && !R10.isConnected()) { showToast('📡 The distance check needs the R10 connected (and real balls)'); return; }
  const sets = special === 'priming' ? spdPrimingSets() : special === 'distance' ? spdDistanceSets() : special ? spdBaselineSets() : spdBuildToday(programId);
  if (!sets.length) { showToast('Add at least one set to your custom session'); return; }
  if (!special) {
    const sch = spdSchedule(programId);
    if (sch && !sch.due && !confirm(sch.sameDay
      ? 'You already trained today. Speed gains come from recovering between sessions. Train again anyway?'
      : `Rest day: your next session is due ${sch.dueAt.toLocaleDateString('en-US', { weekday: 'long' })}. Training on tired legs usually means slower swings. Train anyway?`)) return;
    spdMarkProgramStart(programId);
  }
  // Created inside the click so the browser allows audio playback
  try { if (!spdAudioCtx) spdAudioCtx = new (window.AudioContext || window.webkitAudioContext)(); spdAudioCtx.resume && spdAudioCtx.resume(); } catch {}
  const pos = special ? null : spdPlanPosition(programId);
  spd = { token: Date.now(), programId, week: pos ? pos.week : null, sets, setIdx: 0, rep: 0, swings: [],
          phase: 'intro', restLeft: 0, date: todayISO(), completed: false, drops: 0, extraRest: 0, rests: 0, skips: 0, cutSets: 0,
          recovery: !!pos && spdRecoveryWeek(pos.week, SPEED_PROGRAMS[programId].weeks) };
  const tok = spd.token;
  spdWakeLock();
  renderSpeed();
  const intro = [`${spdProgramName(programId)}.`];
  if (pos) intro.push(`Week ${pos.week}, session ${pos.session}.${spd.recovery ? ' This is a recovery week, so fewer sets. Still swing at full speed.' : ''}`);
  if (special === 'baseline' || special === 'check') intro.push('Every swing is measured. If the R ten can\'t read the stick, type or say the speed from your radar.');
  if (special === 'priming') intro.push('Short and sharp. Get loose, then a few fast swings. Don\'t tire yourself out.');
  intro.push(R10.isConnected()
    ? 'Your R ten is connected, so just swing when I say swing now.'
    : 'Make sure your R ten is on and showing club speed. After each driver swing, enter or say your speed.');
  if (sets.some(s => !s.record)) intro.push("I'll count your training stick swings for you.");
  intro.push('Every swing at full speed. If your speed starts dropping, I\'ll give you extra rest.');
  spdSay(intro.join(' ')).then(() => { if (spdAlive(tok)) spdBeginSet(tok); });
}

async function spdBeginSet(tok) {
  const set = spd.sets[spd.setIdx];
  spd.rep = 0; spd.phase = 'setintro'; renderSpeed();
  spd.drops = 0;
  const lbl = set.tool !== 'Driver' && spdGear().labels[set.tool] ? `, ${spdGear().labels[set.tool].replace(/(\d+) g\b/, '$1 grams')}` : '';
  const tgt = spdPrepareSet(); // this set's target (speed-live.js)
  await spdSay(`${spdSetName(set).replace('·', lbl + ',')}. ${(SPEED_DRILLS[set.drill] || SPEED_DRILLS.normal).cue}${tgt}`);
  if (spdAlive(tok)) spdPromptSwing(tok);
}

async function spdPromptSwing(tok) {
  const set = spd.sets[spd.setIdx];
  spd.phase = 'swing'; renderSpeed();
  await spdSay(`Swing ${spd.rep + 1} of ${set.reps}. ${set.drill === 'warmup' ? 'Easy swing.' : 'Swing now!'}`);
  if (!spdAlive(tok) || spd.phase !== 'swing') return;
  spdBeep(1046, 180);
  if (set.record) spdListen(tok);
  else {
    clearTimeout(spdSwingTimer);
    spdSwingTimer = setTimeout(() => { if (spdAlive(tok)) spdSwingDone(); }, SPD_TIMED_SWING_MS);
  }
}

// A counted (not recorded) swing is done: advance
function spdSwingDone() {
  if (!spd || spd.phase !== 'swing' || spd.sets[spd.setIdx].record) return;
  clearTimeout(spdSwingTimer);
  spd.rep++;
  spdNext(spd.token);
}

// `value` is in the user's unit, unless inMph (R10 readings)
async function spdRecord(value, src = 'manual', inMph = false) {
  if (!spd || spd.phase !== 'swing') return;
  const set = spd.sets[spd.setIdx];
  if (!set.record) return;
  const raw = parseFloat(value);
  // Two decimals so a km/h entry converts back exactly (180 km/h shows as 180, not 179.9)
  const mph = Math.round((inMph ? raw : fromUnit(raw)) * 100) / 100;
  if (!isFinite(mph) || mph < 30 || mph > 170) {
    showToast(`⚠️ Enter a speed between ${toUnit(30)} and ${toUnit(170)} ${unitLabel()}`);
    return;
  }
  const tok = spd.token;
  spdStopListening();
  const warmup = set.drill === 'warmup';
  const prevPB = spdPB();
  const sameTool = spd.swings.filter(s => !s.warmup && s.tool === set.tool);
  const prevSessionBest = sameTool.length ? Math.max(...sameTool.map(s => s.mph)) : 0;

  const toolPB = spdToolPBs()[set.tool] || 0;
  const sw = { set: spd.setIdx, tool: set.tool, drill: set.drill, rep: spd.rep + 1, mph, warmup, src };
  if (spd.pendingShot && src === 'r10') spdAttachBall(sw, spd.pendingShot);
  spd.pendingShot = null;
  spd.swings.push(sw);
  spd.rep++;
  spd.phase = 'feedback'; renderSpeed();

  let msg = `${toUnit(mph)}.`;
  if (!warmup) {
    if (set.tool === 'Driver' && prevPB && mph > prevPB) { msg += ' New personal best!'; spdBeep(1318, 250); spd.anyPB = true; }
    else if (set.tool !== 'Driver' && toolPB && mph > toolPB && ['normal', 'step', 'test'].includes(set.drill)) { msg += ` ${set.tool} personal best!`; spdBeep(1318, 250); spd.anyPB = true; }
    else if (prevSessionBest && mph > prevSessionBest) msg += ' Session best.';
    // Fatigue: quality over quantity. Two swings in a row more than 3% under this
    // session's best with the same tool earn extra rest; a third ends the set.
    // (compared within the same tool and drill: opposite-side swings are naturally slower)
    const like = spd.swings.filter(s => !s.warmup && s.tool === set.tool && s.drill === set.drill).slice(0, -1);
    const likeBest = like.length ? Math.max(...like.map(s => s.mph)) : 0;
    if (likeBest && like.length >= 2 && mph < likeBest * 0.97) spd.drops++; else spd.drops = 0;
    if (spd.drops === 2) { spd.extraRest = 30; msg += ' Speed is dipping. Take an extra thirty seconds.'; }
    if (spd.drops >= 3 && spd.rep < set.reps) { spd.rep = set.reps; spd.cutSets++; msg += ' Speed has dropped three in a row. Ending this set. Quality over quantity.'; }
  }
  if (sw.carry) msg += ` Carry ${Math.round(sw.carry)}.`;
  msg += spdAfterSwing(sw);      // target gap, then the readiness check
  msg += spdGhostAfterSwing(sw); // at the end of a set: you vs your ghost
  renderSpeed();
  await spdSay(msg);
  if (spdAlive(tok)) spdNext(tok);
}

// Swings arriving from the R10 Bluetooth connection
function spdOnR10Shot(shot) {
  if (spd.phase !== 'swing') { showToast('📡 Swing ignored — wait for the coach to say "swing now"'); return; }
  const set = spd.sets[spd.setIdx];
  if (!set.record) { spdSwingDone(); return; }
  if (set.ball && !shot.ballMph) { spdSay('No ball read. The distance check needs a real ball. Hit it again.'); return; }
  spd.pendingShot = set.ball ? shot : null; // ball data for the distance check
  if (shot.clubMph) spdRecord(shot.clubMph, 'r10', true);
  else spdSay('No club speed read. Swing again.');
}

async function spdRedoSwing() {
  if (!spd || spd.phase !== 'swing') return;
  const tok = spd.token;
  spdStopListening();
  await spdSay('No problem. Redo that swing.');
  if (spdAlive(tok)) spdPromptSwing(tok);
}

function spdNext(tok) {
  const set = spd.sets[spd.setIdx];
  const extra = spd.extraRest; spd.extraRest = 0;
  if (spd.rep < set.reps) {
    return spdRest(tok, set.rest + extra, `${spdSetName(set)} — swing ${spd.rep + 1}`, false, () => spdPromptSwing(tok));
  }
  if (spd.setIdx < spd.sets.length - 1) {
    spd.setIdx++;
    const next = spd.sets[spd.setIdx];
    return spdRest(tok, spdBetweenRest(next) + extra, spdSetName(next), true, () => spdBeginSet(tok));
  }
  spd.completed = true;
  spdFinish(tok);
}

function spdRest(tok, secs, nextLabel, betweenSets, next) {
  spd.phase = 'rest'; spd.restLeft = secs; spd.restNext = next; spd.rests++;
  spd.restLabel = nextLabel; spd.restBetweenSets = betweenSets;
  renderSpeed();
  // Short rests between counted stick swings just get the countdown beeps
  if (betweenSets) spdSay(`Set complete. Rest ${secs} seconds.`);
  else if (secs > 12) spdSay(`Rest ${secs} seconds.`);
  clearInterval(spdTimer);
  spdTimer = setInterval(() => {
    if (!spdAlive(tok) || spd.phase !== 'rest') { clearInterval(spdTimer); return; }
    spd.restLeft--;
    const el = document.getElementById('spd-rest'); if (el) el.textContent = spdFmt(spd.restLeft);
    if (spd.restLeft === 10 && secs > 15) spdSay('Ten seconds.');
    if (spd.restLeft > 0 && spd.restLeft <= 3) spdBeep(660, 120);
    if (spd.restLeft <= 0) { clearInterval(spdTimer); next(); }
  }, 1000);
}

function spdSkipRest() {
  if (!spd || spd.phase !== 'rest') return;
  clearInterval(spdTimer);
  if (spd.restLeft > 3) spd.skips++; // skipped rests lower the consistency score
  spd.restNext && spd.restNext();
}

async function spdFinish(tok) {
  const scored = spd.swings.filter(spdScored);
  const prevPB = spdPB();
  const maxByTool = {};
  spd.swings.filter(s => !s.warmup).forEach(s => { maxByTool[s.tool] = Math.max(maxByTool[s.tool] || 0, s.mph); });
  const special = SPD_SPECIAL[spd.programId] ? spd.programId : null;
  const session = {
    id: Date.now(), date: spd.date, programId: spd.programId, week: spd.week, completed: spd.completed,
    swings: spd.swings, maxByTool, setsPlanned: spd.sets.length, setsDone: spd.completed ? spd.sets.length : spd.setIdx,
    rests: spd.rests, skips: spd.skips, cutSets: spd.cutSets,
    readiness: spd.ready && spd.ready.ratio ? Math.round(spd.ready.ratio * 1000) / 1000 : null, light: !!spd.light,
    targetsHit: spd.swings.filter(w => w.hit).length, targetsAimed: spd.swings.filter(w => w.target).length,
    ghostDelta: (g => g.length ? Math.round(g.reduce((a, w) => a + w.mph - w.ghost, 0) / g.length * 100) / 100 : null)(spd.swings.filter(w => w.ghost)),
    anyPB: !!spd.anyPB, distance: special === 'distance' ? spdDistanceSummary(spd.swings) : undefined,
    max: scored.length ? Math.max(...scored.map(s => s.mph)) : null,
    avg: scored.length ? Math.round(scored.reduce((a, s) => a + s.mph, 0) / scored.length * 10) / 10 : null,
  };
  const recent = getSpeedSessions().filter(s => s.max && !SPD_SPECIAL[s.programId]).slice(0, 3);
  if (spd.completed || spd.swings.some(s => !s.warmup)) {
    const all = getSpeedSessions(); all.unshift(session); saveSpeedSessions(all);
    awardXP(special === 'priming' ? 15 : special === 'distance' ? 40 : 60, 'speed');
  }
  // Baseline / progress check: save the profile (compared with the previous one)
  spd.profile = null;
  if ((special === 'baseline' || special === 'check') && spd.swings.some(s => !s.warmup)) {
    const prev = spdLatestProfile();
    const prof = { date: spd.date, kind: special, best: spdProfileFrom(spd.swings) };
    const profiles = getSpeedProfiles(); profiles.unshift(prof); saveSpeedProfiles(profiles.slice(0, 40));
    spd.profile = { prof, prev };
  }

  // Only a fully completed session moves a weekly plan forward
  spd.planText = '';
  const before = spdPlanPosition(spd.programId);
  if (spd.completed && before && !before.complete) {
    spdSetPlanDone(spd.programId, before.done + 1);
    const after = spdPlanPosition(spd.programId);
    spd.planText = after.complete ? 'Program complete!'
      : after.week > before.week ? `Week ${before.week} done — week ${after.week} starts next session.`
      : `Week ${after.week}: session ${after.session} of ${SPEED_PROGRAMS[spd.programId].perWeek} is next.`;
    if (after.complete) spd.planText += ' Rest for three or four days, then take a progress check to measure your gains.';
  }

  // A session well below your recent ones is a sign you need more recovery
  const recentAvg = recent.length ? recent.reduce((a, s) => a + s.max, 0) / recent.length : 0;
  if (!special && session.max && recentAvg && session.max < recentAvg * 0.96)
    spd.planText = (spd.planText ? spd.planText + ' ' : '') + 'Today was below your recent sessions — give yourself an extra rest day before the next one.';
  spd.phase = 'done'; spd.result = session; spd.newPB = !!(scored.length && prevPB && session.max > prevPB);
  renderSpeed();
  if (session.swings.some(s => !s.warmup)) {
    if (spd.newPB) celebrate(`⚡ New driver PB: ${toUnit(session.max)} ${unitLabel()}!`);
    else if (/Program complete/.test(spd.planText || '')) celebrate('🎓 Program complete!');
    onActivity('speed', { pb: !!spd.anyPB });
    if (!special) spdCheckWeekly();
  }
  spdReleaseWake();
  const dist = session.max ? spdDistance(session.max) : null;
  const said = [scored.length ? `Session complete. Top driver speed ${toUnit(session.max)}. Average ${toUnit(session.avg)}.${dist ? ` That speed is worth about ${dist.carry} yards of carry.` : ''}` : 'Session complete. Nice work.'];
  if (spd.profile) said.push('Your speed profile is updated. Have a look at what it says.');
  if (spd.newPB) said.push('That is a new personal best!');
  if (spd.planText) said.push(spd.planText);
  await spdSay(said.join(' '));
}

function spdStopAll() { clearInterval(spdTimer); clearTimeout(spdSwingTimer); spdStopListening(); try { speechSynthesis.cancel(); } catch {} }

function spdEnd() {
  if (!spd) return;
  const work = spd.swings.filter(s => !s.warmup);
  if (!confirm(work.length ? 'End the session now and save the swings recorded so far?\n\nAn unfinished session doesn\'t count toward your program.' : 'End this session? Nothing has been recorded yet.')) return;
  spdStopAll();
  spd.token = Date.now() + 1; // invalidate any pending steps
  spd.completed = false;
  if (work.length) spdFinish(spd.token);
  else { spdReleaseWake(); spd = null; renderSpeed(); }
}

function spdClose() { spdStopAll(); spdReleaseWake(); spd = null; renderSpeed(); }

function spdToggle(key, on) {
  spdSettings[key] = on; spdSaveSettings();
  if (key === 'voice' && on && !spdVoiceSupported()) {
    spdSettings.voice = false; spdSaveSettings();
    showToast('🎙️ Voice entry needs Chrome or Edge');
  }
  renderSpeed();
}

function spdChooseProgram(id) { spdSettings.program = id; spdSaveSettings(); renderSpeed(); }
function spdRestartProgram(id) {
  if (!confirm(`Restart ${SPEED_PROGRAMS[id].name} from week 1? Your session history is kept.`)) return;
  spdSetPlanDone(id, 0); renderSpeed();
}

// ── Custom session editor ──────────────────────────────────────
function spdCustomEdit(i, field, value) {
  const sets = spdCustomSets();
  if (!sets[i]) return;
  if (field === 'reps') value = Math.max(1, Math.min(15, parseInt(value) || 1));
  if (field === 'rest') value = Math.max(5, Math.min(120, parseInt(value) || 20));
  sets[i][field] = value;
  spdSaveCustom(sets); renderSpeed();
}
function spdCustomAdd()      { const s = spdCustomSets(); s.push({ drill: 'normal', tool: 'Driver', reps: 5, rest: 20 }); spdSaveCustom(s); renderSpeed(); }
function spdCustomRemove(i)  { const s = spdCustomSets(); s.splice(i, 1); spdSaveCustom(s); renderSpeed(); }
function spdCustomMove(i, d) {
  const s = spdCustomSets(), j = i + d;
  if (j < 0 || j >= s.length) return;
  [s[i], s[j]] = [s[j], s[i]]; spdSaveCustom(s); renderSpeed();
}

function spdCustomEditorHTML() {
  const sets = spdCustomSets();
  const opt = (v, cur, label = v) => `<option value="${v}" ${v === cur ? 'selected' : ''}>${label}</option>`;
  return `<div class="spd-custom">
    ${sets.map((s, i) => `<div class="spd-custom-row">
      <select aria-label="Drill" onchange="spdCustomEdit(${i},'drill',this.value)">${Object.entries(SPEED_DRILLS).map(([k, d]) => opt(k, s.drill, d.name)).join('')}</select>
      <select aria-label="Club or stick" onchange="spdCustomEdit(${i},'tool',this.value)">${SPEED_TOOLS.map(t => opt(t, s.tool)).join('')}</select>
      <label class="spd-num">× <input type="number" min="1" max="15" value="${s.reps}" aria-label="Swings" onchange="spdCustomEdit(${i},'reps',this.value)"></label>
      <label class="spd-num"><input type="number" min="5" max="120" step="5" value="${s.rest}" aria-label="Rest seconds" onchange="spdCustomEdit(${i},'rest',this.value)"> s</label>
      <div class="spd-custom-actions">
        <button class="sg-shot-del" style="background:var(--gray-light);color:var(--gray-dark);" title="Move up" onclick="spdCustomMove(${i},-1)" ${i === 0 ? 'disabled' : ''}>↑</button>
        <button class="sg-shot-del" title="Remove" onclick="spdCustomRemove(${i})">✕</button>
      </div>
    </div>`).join('')}
    <button class="btn btn-sm" style="background:var(--green-pale);color:var(--green-mid);margin-top:4px;" onclick="spdCustomAdd()">+ Add set</button>
  </div>`;
}

// ── Screens ────────────────────────────────────────────────────
function renderSpeed() {
  const el = document.getElementById('speed-content');
  if (!el) return;
  if (!spd) { el.innerHTML = spdHomeHTML(); requestAnimationFrame(spdDrawChart); return; }

  const set  = spd.sets[spd.setIdx];
  const unit = unitLabel();
  const scored = spd.swings.filter(spdScored);
  const best = scored.length ? Math.max(...scored.map(s => s.mph)) : null;
  let panel;

  if (spd.phase === 'done') {
    const r = spd.result;
    panel = `<div class="spd-status done">
      <div class="spd-label">${spd.newPB ? '🏆 New personal best!' : 'Session complete'}</div>
      ${r.max ? `<div class="spd-big">${toUnit(r.max)}<span> ${unit} top</span></div>
        <div class="spd-sub">Average ${toUnit(r.avg)} ${unit} · ${scored.length} max-effort driver swings</div>`
        : `<div class="spd-big">✓</div><div class="spd-sub">${spd.sets.length} sets done</div>`}
      ${r.max ? `<div class="spd-sub">Worth about ${spdDistance(r.max).carry} yds carry · ${spdDistance(r.max).total} total with a good strike</div>` : ''}
      ${spd.planText ? `<div class="spd-sub" style="font-weight:700;">${spd.planText}</div>` : ''}
      ${spd.profile ? spdProfileResultHTML(spd.profile) : ''}
      ${spd.programId === 'distance' ? spdDistanceDoneHTML(r.distance, spdDistanceChecks()[1]) : ''}
      ${r.ghostDelta !== null && r.ghostDelta !== undefined ? `<div class="spd-sub">👻 vs your ghost: ${r.ghostDelta >= 0 ? '+' : '−'}${toUnit(Math.abs(r.ghostDelta)).toFixed(1)} ${unit} per swing</div>` : ''}
      <button class="btn btn-primary" style="margin-top:16px;" onclick="spdClose()">Done</button>
    </div>`;
  } else if ((spd.phase === 'swing' || spd.phase === 'feedback') && set.record) {
    panel = spdLivePanelHTML(set, spd.phase); // speedometer, target, session graph (speed-live.js)
  } else if (spd.phase === 'swing') {
    panel = `<div class="spd-status swing">
      <div class="spd-label">${spdSetName(set)} · Swing ${spd.rep + 1} of ${set.reps}</div>
      <div class="spd-big">SWING NOW</div>
      <div class="spd-sub">Counted swing — no speed needed. The next one starts automatically.</div>
      <button class="btn btn-gold" style="margin-top:14px;" onclick="spdSwingDone()">Next ›</button>
    </div>`;
  } else if (spd.phase === 'rest') {
    panel = `<div class="spd-status rest">
      <div class="spd-label">${spd.restBetweenSets ? 'Set complete — rest' : 'Rest'}</div>
      <div class="spd-big" id="spd-rest">${spdFmt(spd.restLeft)}</div>
      <div class="spd-sub">Next: ${spd.restLabel}</div>
      <button class="btn btn-sm" style="margin-top:12px;background:white;color:var(--gray-dark);" onclick="spdSkipRest()">Skip rest ›</button>
    </div>`;
  } else {
    panel = `<div class="spd-status">
      <div class="spd-label">${spdSetName(set)}</div>
      <div style="font-size:1.25rem;font-weight:700;line-height:1.4;">${(SPEED_DRILLS[set.drill] || SPEED_DRILLS.normal).cue}</div>
      <div class="spd-sub">🔊 Listen to the coach…</div>
      ${spdGuideCardHTML(set.drill, true)}
    </div>`;
  }

  const log = spd.swings.map(s => `<tr>
      <td style="text-align:left;">${spdSetName(spd.sets[s.set])}</td>
      <td>${s.rep}</td>
      <td style="font-weight:800;${spdScored(s) && s.mph === best ? 'color:var(--green-mid);' : ''}">${toUnit(s.mph)}${spdScored(s) && s.mph === best ? ' ★' : ''}${s.src === 'r10' ? ' <span title="Recorded by the R10">📡</span>' : ''}</td>
      <td style="color:var(--gray-mid);">${s.tool === 'Driver' || s.warmup ? '' : (e => e ? toUnit(e) : '—')(spdESpeed(s.mph, s.tool))}</td>
    </tr>`).join('');

  el.innerHTML = `
    ${spd.phase !== 'done' ? r10StripHTML() : ''}
    ${spd.phase !== 'done' ? `<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;gap:10px;">
      <div style="font-size:0.85rem;color:var(--gray-mid);font-weight:600;">${spd.week ? `Week ${spd.week} · ` : ''}Set ${spd.setIdx + 1} of ${spd.sets.length} · Driver best: <strong style="color:var(--green-mid);">${best ? `${toUnit(best)} ${unit}` : '—'}</strong></div>
      <button class="btn btn-sm" style="background:var(--gray-light);color:var(--gray-dark);" onclick="spdEnd()">End Session</button>
    </div>` : ''}
    ${panel}
    ${spd.swings.length ? `<div class="card">
      <div class="card-title">This Session</div>
      <div class="scorecard-wrap"><table class="scorecard">
        <thead><tr><th style="text-align:left;">Set</th><th>Swing</th><th>Speed (${unit})</th><th title="Estimated driver speed, from your baseline">≈ Driver</th></tr></thead>
        <tbody>${log}</tbody>
      </table></div>
    </div>` : ''}
  `;

  if (spd.phase === 'swing' && set.record) {
    const inp = document.getElementById('spd-input');
    if (inp) inp.focus();
    if (spdRec) { const mic = document.getElementById('spd-mic'); if (mic) mic.textContent = '🎙️ Listening…'; }
  }
}

// Baseline / progress-check results: bests per tool, change since last time, what it means
function spdProfileResultHTML({ prof, prev }) {
  const unit = unitLabel(), a = spdAnalyze(prof), top = spdRecommend()[0];
  const rows = Object.entries(prof.best).sort((x, y) => SPEED_TOOLS.indexOf(x[0].split('|')[0]) - SPEED_TOOLS.indexOf(y[0].split('|')[0])).map(([k, v]) => {
    const [tool, drill] = k.split('|'), was = prev && prev.best[k];
    const ch = was ? (v / was - 1) * 100 : null;
    return `<tr><td style="text-align:left;">${tool}${drill !== 'normal' ? ` · ${SPEED_DRILLS[drill]?.name || drill}` : ''}</td><td style="font-weight:800;">${toUnit(v)}</td>
      <td style="color:${ch === null ? 'var(--gray-mid)' : ch >= 0 ? 'var(--green-mid)' : 'var(--red)'};">${ch === null ? '—' : `${ch >= 0 ? '+' : ''}${ch.toFixed(1)}%`}</td></tr>`;
  }).join('');
  return `<div class="spd-profile-result">
    <div class="card-title" style="margin:14px 0 6px;">${prof.kind === 'check' ? 'Progress check' : 'Your speed profile'}</div>
    <div class="scorecard-wrap"><table class="scorecard"><thead><tr><th style="text-align:left;">Tool</th><th>Best (${unit})</th><th>${prev ? 'Change' : ''}</th></tr></thead><tbody>${rows}</tbody></table></div>
    ${a.notes.map(n => `<div class="spd-note">• ${n.text}</div>`).join('')}
    ${top ? `<div class="spd-note" style="font-weight:700;">Recommended next: ${SPEED_PROGRAMS[top.id].name} — ${top.why}.</div>` : ''}
  </div>`;
}

function spdSetFlex(key, val) { spdSettings[key] = val; spdSaveSettings(); renderSpeed(); }

function spdHomeHTML() {
  const sessions = getSpeedSessions(), unit = unitLabel(), gear = spdGear();
  const pb = spdPB(), toolPB = spdToolPBs(), prof = spdLatestProfile(), recs = spdRecommend();
  const last = sessions.find(s => s.max);
  const id = spdCurrentProgram(), prog = SPEED_PROGRAMS[id], pos = spdPlanPosition(id), sch = spdSchedule(id);
  const today = spdBuildToday(id), grit = spdConsistency(id), dist = spdDistance(pb);
  const totalSwings = today.reduce((a, s) => a + s.reps, 0);
  // a program finished since the last test → time for a progress check
  const finishedProgram = Object.keys(SPEED_PROGRAMS).some(p => { const st = (spdSettings.programStart || {})[p];
    return spdPlanPosition(p)?.complete && st && (!prof || st >= prof.date); });
  const toggle = (key, val, cur, label, fn = 'spdSetGear') => `<button class="toggle-btn ${String(cur) === String(val) ? 'active' : ''}" onclick="${fn}('${key}', ${typeof val === 'string' ? `'${val}'` : val})">${label}</button>`;

  // 1. Speed profile
  const a = prof ? spdAnalyze(prof) : null;
  const profileCard = `<div class="card">
    <div class="card-title">Speed Profile</div>
    ${prof ? `
      <div class="apex-hole-meta" style="margin-bottom:8px;">${prof.kind === 'check' ? 'Progress check' : 'Baseline'} · ${formatDate(prof.date)}</div>
      <div class="spd-profile-tools">${SPEED_TOOLS.filter(t => prof.best[`${t}|normal`]).map(t => `<div class="range-tile"><div class="range-tile-value">${toUnit(prof.best[`${t}|normal`])}</div><div class="range-tile-label">${t}${t === 'Driver' ? '' : ` <span>${esc(gear.labels[t] || '')}</span>`}</div></div>`).join('')}</div>
      ${a.notes.map(n => `<div class="spd-note">• ${n.text}</div>`).join('')}
      <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:10px;">
        <button class="btn btn-sm ${finishedProgram ? 'btn-primary' : ''}" style="${finishedProgram ? '' : 'background:var(--gray-light);color:var(--gray-dark);'}" onclick="startSpeedSession('check')">📈 Progress check</button>
        <button class="btn btn-sm" style="background:var(--gray-light);color:var(--gray-dark);" onclick="startSpeedSession('baseline')">↻ Redo baseline</button>
      </div>
      ${finishedProgram ? '<div class="apex-hole-meta" style="margin-top:6px;">You’ve finished a program since your last test: a progress check measures what it gained you.</div>' : ''}`
    : `<p style="font-size:0.86rem;color:var(--gray-dark);margin-bottom:10px;">Start with a <strong>baseline test</strong> (about ${spdMinutes(spdBaselineSets())} minutes): ${gear.sticks ? 'each stick setting and your driver, from both sides and with a step' : 'your driver, with normal and step swings'}. It builds your speed profile and recommends the program that should help you most.</p>
       <button class="btn btn-primary" onclick="startSpeedSession('baseline')">▶ Take the baseline test</button>`}
  </div>`;

  // 2. Program
  const recIds = recs.slice(0, 3).map(r => r.id);
  const programCards = [...recs.map(r => r.id), ...Object.keys(SPEED_PROGRAMS).filter(p => !recs.some(r => r.id === p))]
    .filter(spdProgramAvailable).map(pid => {
      const p = SPEED_PROGRAMS[pid], pp = spdPlanPosition(pid), rec = recs.find(r => r.id === pid);
      return `<button class="spd-program ${pid === id ? 'active' : ''}" onclick="spdChooseProgram('${pid}')">
        <div class="spd-program-name">${p.name}${recIds[0] === pid && prof ? ' <span class="drill-tag">recommended</span>' : ''}</div>
        <div class="spd-program-meta">${p.weeks ? `${p.weeks * p.perWeek} sessions · ${p.focus}` : p.focus}${pp && pp.done ? ` · ${pp.done}/${pp.total} done` : ''}</div>
        ${rec && recIds.includes(pid) && prof ? `<div class="spd-program-why">${rec.why}</div>` : ''}
      </button>`;
    }).join('');
  const schedLine = !sch ? '' : sch.due ? `<span style="color:var(--green-mid);font-weight:700;">● Session due today</span>`
    : `<span style="color:var(--gold-dark);font-weight:700;">● Rest day${sch.sameDay ? ' (you trained today)' : ''} — next session ${sch.dueAt.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}</span>`;
  const planHTML = pos ? `
    <div style="margin:4px 0 12px;">
      <div style="display:flex;justify-content:space-between;align-items:center;font-size:0.85rem;font-weight:600;margin-bottom:4px;gap:8px;flex-wrap:wrap;">
        <span>${pos.complete ? '🏆 Program complete — take a progress check, then pick your next program' : `Week ${pos.week} of ${prog.weeks} · Session ${pos.session} of ${prog.perWeek}${spdRecoveryWeek(pos.week, prog.weeks) ? ' · recovery week' : ''}`}</span>
        ${pos.done ? `<button class="btn btn-sm" style="background:none;color:var(--gray-mid);padding:2px 6px;" onclick="spdRestartProgram('${id}')">Restart</button>` : ''}
      </div>
      <div class="progress-bar-wrap"><div class="progress-bar" style="width:${Math.round(pos.done / pos.total * 100)}%"></div></div>
      <div style="display:flex;justify-content:space-between;font-size:0.78rem;margin-top:6px;gap:8px;flex-wrap:wrap;">${schedLine}${grit !== null ? `<span title="Sessions on schedule, sets finished and rests taken">Consistency <strong>${grit}</strong>/100</span>` : ''}</div>
    </div>` : sch ? `<div style="font-size:0.78rem;margin-bottom:10px;">${schedLine}</div>` : '';
  const flexOpts = (id === 'flex' || id === 'maintain') ? `<div class="drill-opt"><label>Length</label><div class="toggle-group">${[8, 15, 25].map(m => toggle('flexLen', m, spdSettings.flexLen || 15, `${m} min`, 'spdSetFlex')).join('')}</div></div>
    ${id === 'flex' ? `<div class="drill-opt"><label>Focus</label><div class="toggle-group">${[['overspeed', 'Overspeed'], ['overload', 'Load'], ['mixed', 'Mixed']].map(([v, l]) => toggle('flexFocus', v, spdSettings.flexFocus || 'mixed', l, 'spdSetFlex')).join('')}</div></div>` : ''}` : '';
  const programCard = `<div class="card">
    <div class="card-title">Training Program</div>
    <div class="spd-programs">${programCards}</div>
    <p style="font-size:0.84rem;color:var(--gray-mid);margin:12px 0 10px;">${prog.desc}</p>
    ${planHTML}
    ${flexOpts}
    ${id === 'custom' ? spdCustomEditorHTML() : ''}
    <div style="background:var(--page-bg);border:1px solid var(--border);border-radius:10px;padding:12px 14px;margin:14px 0;">
      <div style="font-size:0.72rem;font-weight:800;text-transform:uppercase;letter-spacing:1px;color:var(--gray-mid);margin-bottom:6px;">${pos ? `Today · week ${pos.week}` : "Today's session"}</div>
      ${today.length ? today.map(s => `<div style="display:flex;justify-content:space-between;font-size:0.84rem;padding:3px 0;gap:8px;">
        <span><strong>${spdSetName(s)}</strong>${s.tool !== 'Driver' && gear.labels[s.tool] ? ` <span style="color:var(--gray-mid);">(${esc(gear.labels[s.tool])})</span>` : ''}${s.record ? '' : ' <span style="color:var(--gray-mid);font-weight:600;">· counted</span>'}</span>
        <span style="color:var(--gray-mid);white-space:nowrap;">${s.reps} × · ${s.rest}s</span>
      </div>`).join('') : '<div style="font-size:0.84rem;color:var(--gray-mid);">No sets yet — add one above.</div>'}
      ${today.length ? `<div style="font-size:0.74rem;color:var(--gray-mid);margin-top:6px;">${totalSwings} swings · about ${spdMinutes(today)} minutes · every swing at full speed</div>` : ''}
    </div>
    <div style="display:flex;gap:8px;flex-wrap:wrap;">
      <button class="btn btn-primary" onclick="startSpeedSession()" ${today.length ? '' : 'disabled'}>▶ Start ${pos && !pos.complete ? `Week ${pos.week} · Session ${pos.session}` : 'Session'}</button>
      <button class="btn btn-sm" style="background:var(--gray-light);color:var(--gray-dark);" onclick="startSpeedSession('priming')" title="${SPD_SPECIAL.priming.desc}">⚡ Pre-round priming (5 min)</button>
      <button class="btn btn-sm" style="background:var(--gray-light);color:var(--gray-dark);" onclick="startSpeedSession('distance')" title="${SPD_SPECIAL.distance.desc}">🎯 Distance check (5 balls)</button>
    </div>
  </div>`;

  // 3. Equipment and settings
  const gearCard = `<div class="card">
    <div class="card-title">Equipment & Settings</div>
    <div class="drill-opt"><label>Speed sticks</label><div class="toggle-group">${toggle('sticks', true, gear.sticks, 'I have light / medium / heavy')}${toggle('sticks', false, gear.sticks, 'Driver only')}</div></div>
    ${gear.sticks ? `<div class="drill-opt"><label>Your three settings</label>${['Light stick', 'Medium stick', 'Heavy stick'].map(t => `<div class="spd-gear-row"><span>${t.split(' ')[0]}</span><input type="text" value="${esc(gear.labels[t])}" maxlength="40" onchange="spdSetGearLabel('${t}', this.value)"></div>`).join('')}</div>
      <div class="drill-opt"><label>Something heavier than your driver? <span class="apex-hole-meta">(weighted headcover, donut, heavy club — for true overload)</span></label><div class="toggle-group">${toggle('overload', true, gear.overload, 'Yes')}${toggle('overload', false, gear.overload, 'No')}</div></div>` : ''}
    <div class="drill-opt"><label>Sessions per week</label><div class="toggle-group">${toggle('perWeek', 2, gear.perWeek, '2')}${toggle('perWeek', 3, gear.perWeek, '3')}</div></div>
    <div class="drill-opt"><label>Speed-training experience</label><div class="toggle-group">${toggle('experience', 'new', gear.experience, 'New')}${toggle('experience', 'some', gear.experience, 'Some')}${toggle('experience', 'experienced', gear.experience, 'Experienced')}</div></div>
    <div class="drill-opt"><label>Does one arm feel like it limits your speed?</label><div class="toggle-group">${toggle('weakArm', 'none', gear.weakArm, 'No')}${toggle('weakArm', 'lead', gear.weakArm, 'Lead arm')}${toggle('weakArm', 'trail', gear.weakArm, 'Trail arm')}</div></div>
    <label class="spd-toggle"><input type="checkbox" ${spdSettings.audio ? 'checked' : ''} onchange="spdToggle('audio', this.checked)"> 🔊 Audio coach</label>
    <label class="spd-toggle"><input type="checkbox" ${spdSettings.voice ? 'checked' : ''} ${spdVoiceSupported() ? '' : 'disabled'} onchange="spdToggle('voice', this.checked)"> 🎙️ Voice entry — say the speed${spdVoiceSupported() ? '' : ' (needs Chrome or Edge)'}</label>
    ${gear.sticks ? `<label class="spd-toggle"><input type="checkbox" ${spdSettings.recordSticks ? 'checked' : ''} onchange="spdToggle('recordSticks', this.checked)"> 📏 Record stick speeds in programs too (the baseline always does)</label>` : ''}
    <label class="spd-toggle">Speed unit
      <select style="width:auto;padding:4px 8px;" onchange="setPref('speedUnit', this.value); renderSpeed();">
        <option value="mph" ${speedUnit() === 'mph' ? 'selected' : ''}>mph</option>
        <option value="kmh" ${speedUnit() === 'kmh' ? 'selected' : ''}>km/h</option>
      </select>
    </label>
  </div>`;

  return `
    ${r10PanelHTML()}
    ${profileCard}
    ${speedGoalHTML()}
    ${programCard}
    ${spdWeeklyHTML()}
    <div class="stat-grid" style="margin-bottom:16px;">
      <div class="stat-box"><div class="stat-value">${pb ? toUnit(pb) : '—'}</div><div class="stat-label">Driver PB (${unit})</div></div>
      <div class="stat-box gold"><div class="stat-value">${dist ? dist.carry : '—'}</div><div class="stat-label">Carry potential (yds)${dist ? ` · ${dist.total} total` : ''}</div></div>
      <div class="stat-box blue"><div class="stat-value">${last ? toUnit(last.max) : '—'}</div><div class="stat-label">Last Session Top</div></div>
      <div class="stat-box"><div class="stat-value">${sessions.length}</div><div class="stat-label">Sessions</div></div>
    </div>
    ${Object.keys(toolPB).some(t => t !== 'Driver') ? `<div class="card"><div class="card-title">Personal Bests by Tool (${unit})</div>
      <div class="spd-profile-tools">${SPEED_TOOLS.filter(t => toolPB[t]).map(t => `<div class="range-tile"><div class="range-tile-value">${toUnit(toolPB[t])}</div><div class="range-tile-label">${t}${t !== 'Driver' && spdESpeed(toolPB[t], t) ? ` <span>≈ ${toUnit(spdESpeed(toolPB[t], t))} driver</span>` : ''}</div></div>`).join('')}</div></div>` : ''}
    ${spdInsightsHTML()}
    ${sessions.length ? `
      ${sessions.some(s => s.max) ? `<div class="card">
        <div class="card-title">Top Driver Speed Trend (${unit})</div>
        <canvas id="spd-chart" class="chart-canvas" height="150"></canvas>
      </div>` : ''}
      <div class="card">
        <div class="card-title">Recent Sessions</div>
        ${sessions.slice(0, 8).map(s => {
          const label = `${spdProgramName(s.programId)}${s.week ? ` · week ${s.week}` : ''}${s.completed === false ? ' · ended early' : ''}${s.cutSets ? ` · ${s.cutSets} set${s.cutSets > 1 ? 's' : ''} cut short` : ''}`;
          return `<div class="round-row">
            <div>
              <div class="round-course">${formatDate(s.date)}</div>
              <div class="round-date">${label}${s.avg ? ` · avg ${toUnit(s.avg)} ${unit}` : ''}</div>
            </div>
            <div class="score-chip ${s.max && s.max === pb ? 'under' : 'even'}">${s.max ? `${toUnit(s.max)} ${unit}${s.max === pb ? ' ★' : ''}` : 'Sticks'}</div>
          </div>`;
        }).join('')}
      </div>` : ''}
    ${spdGuideLibraryHTML()}
    ${gearCard}
  `;
}

function spdDrawChart() {
  const canvas = document.getElementById('spd-chart');
  if (!canvas) return;
  canvas.width = canvas.offsetWidth || canvas.parentElement.offsetWidth;
  const points = getSpeedSessions().filter(s => s.max).reverse().map(s => ({
    y: toUnit(s.max),
    label: new Date(s.date + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  }));
  drawLineChart(canvas, points, { color: '#2d6a4f', fillColor: 'rgba(82,183,136,0.15)' });
}
function spdPB() { return memo('spdPB', spdPBRaw); } // cached until data changes

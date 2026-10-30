// Golf Improvement App — Apex virtual course: round flow, top-down map, controls, scoring.
// Classic script: shares globals with the other files; load order is set in golf-improvement-app.html.

// ════════════════════════════════════════════════════════════
// APEX GAME
// Swings come from the R10 (real launch data) or, without it, simulated
// swings built from the player's range averages. Putting is automatic
// (strokes-gained expected putts). Every shot is logged in the same format
// as a shot-by-shot round, so a finished round gets a strokes-gained summary.
// Apex rounds are virtual: they never count toward the handicap.
// ════════════════════════════════════════════════════════════
let apex = null;          // round in progress (persisted)
let apexAnim = null;      // shot animation
let apexFullView = false; // show the whole hole instead of following the ball
let apexLastRes = null;   // the last full shot on this hole, for replays (not saved)

const APEX_MAX_STROKES = 10; // pick up at this score on any hole

const APEX_CLUBS = Object.keys(CE_DEFAULT_CLUBS).filter(c => !['2-Iron', '3-Iron'].includes(c));

function getApexRounds()   { return loadData(KEYS.apexRounds, []); }
function saveApexRounds(r) { saveData(KEYS.apexRounds, r); }
function apexSave()        { if (apex) saveData(KEYS.apexDraft, apex); }
function apexLoad()        { apex = loadData(KEYS.apexDraft, null); }
function apexClear()       { apex = null; store.removeItem(uk(KEYS.apexDraft)); }

function apexHole()    { return apexCourse().holes[apex.holeIdx]; }
function apexProfile(club) { return ceClubProfile(club, getRangeShots()); }
function apexCal()     { const t = APEX_TEES[apex.tee]; return sgCalibration(apex.target, t.rating, 18); }
function apexHoleState() { return apex.holes[apex.holeIdx]; }

// ── Round flow ─────────────────────────────────────────────────
function apexStart(tee, which) {
  const idx = which === 'back' ? [9, 18] : which === 'front' ? [0, 9] : [0, 18];
  apex = {
    id: Date.now(), tee, date: todayISO(), target: sgTargetDefault(),
    first: idx[0], last: idx[1] - 1, holeIdx: idx[0],
    holes: apexCourse().holes.map(() => ({ shots: [], strokes: 0, done: false })),
    club: 'Driver', shotType: 'normal', power: 100,
  };
  apexStartHole();
}

// start (optional): { ball, lie } for a shot that doesn't begin on the tee (challenges)
function apexStartHole(start) {
  const h = apexHole();
  apex.ball = start ? start.ball : h.tees[apex.tee];
  apex.lie = start ? start.lie : 'tee';
  apex.tracers = [];
  apex.lastShot = null;
  apex.holeResult = null;
  apexLastRes = null;
  apexAutoClub();
  apexSave();
  renderApex();
}

// Suggest club, power, shot type and aim with the engine's shot planner
function apexAutoClub() {
  const profiles = {};
  APEX_CLUBS.forEach(c => { profiles[c] = apexProfile(c); });
  const pl = ceSuggestShot(apexHole(), apex.ball, apex.lie, profiles, APEX_CLUBS);
  if (!pl) return;
  apex.club = pl.club; apex.power = pl.power; apex.shotType = pl.type; apex.aimDeg = pl.aimDeg;
}
function apexAimAt(p) {
  apex.aimDeg = Math.atan2(p[0] - apex.ball[0], p[1] - apex.ball[1]) * 180 / Math.PI;
}

// A shot was struck: `launch` is real (R10) or simulated launch data
function apexHit(launch, src) {
  if (!apex || apexAnim || apex.holeResult) return;
  const h = apexHole(), hs = apexHoleState();
  const startLie = apex.lie, startDist = ceDist(apex.ball, h.pin);
  const res = ceResolveShot(h, apex.ball, apex.aimDeg, launch, startLie);
  hs.shots.push({ lie: startLie, dist: Math.round(startDist), club: apex.club, penalty: res.penalty });
  hs.strokes += 1 + res.penalty;
  apex.lastShot = { club: apex.club, src, carry: res.carry, total: res.total, apexFt: res.flight.apexFt, events: res.events,
                ballMph: launch.ballMph, launch: launch.launch, spin: launch.spin };
  // TV-style green camera for approaches that finish near the hole (3D view)
  const greenCam = startDist <= 240 && ceDist(res.rest, h.pin) < 50 && !res.events.some(e => /canopy|trees|ruins/i.test(e));
  const power = src === 'r10' ? 1 : apex.power / 100;
  apexAnim = { res, start: performance.now(), from: apex.ball.slice(), greenCam };
  apexLastRes = { res, from: apex.ball.slice(), club: apex.club, power, type: apex.shotType };
  apexShotSounds(res, apex.club, power, apex.shotType);
  apexAmbience(true);
  if (!res.replay) apex.ball = res.rest;
  apex.lie = res.replay ? apex.lie : (CE_LIE[res.surface] || 'rough');
  apex.tracers.push({ pts: res.world.map(w => w.p), zs: res.world.map(w => Math.round(w.z)), roll: res.rollPath }); // zs: heights (ft) for the 3D view
  arKick();

  setTimeout(() => {
    // Finish the animation here too: requestAnimationFrame pauses in background tabs
    apexAnim = null;
    if (apex.challenge) return apexChallengeShotDone(res);
    if (res.holed) apexFinishHole('Holed it!');
    else if (hs.strokes >= APEX_MAX_STROKES) apexPickUp();
    else if (apex.lie === 'green') apexPutt();
    else { apexAutoClub(); apexSave(); renderApex(); }
  }, apexAnimDuration(res) + 150);
  apexSave();
}

function apexSwingSimulated() {
  apexHit(ceSimulatedSwing(apexProfile(apex.club), apex.power, apex.shotType), 'sim');
}

// From the R10 (routed by r10-ui.js)
function apexAwaitingShot() {
  return !!apex && !apexAnim && !apex.holeResult &&
    document.getElementById('page-apex').classList.contains('active') && apex.lie !== 'green';
}
function apexOnR10Shot(shot) {
  if (!shot.ballMph || shot.launch === null) { showToast('📡 No ball data — Apex needs a real ball hit'); return; }
  apexHit({ ballMph: shot.ballMph, launch: shot.launch, direction: shot.direction || 0,
            spin: shot.spin || 0, spinAxis: shot.spinAxis || 0 }, 'r10');
}

function apexPutt() {
  const h = apexHole(), hs = apexHoleState();
  const putts = ceAutoPutt(ceDist(apex.ball, h.pin), apexCal());
  if (hs.strokes + putts.length > APEX_MAX_STROKES) return apexPickUp();
  putts.forEach(ft => hs.shots.push({ lie: 'green', dist: Math.round(ft * 10) / 10, club: 'Putter', penalty: 0 }));
  hs.strokes += putts.length;
  apexSound('putts', 0, { n: putts.length });
  apexFinishHole(`${putts.length} putt${putts.length > 1 ? 's' : ''} from ${Math.round(putts[0])} ft`, putts.length * 900 + 400);
}

// The 10-stroke maximum: the hole scores 10 and play moves on
function apexPickUp() {
  const hs = apexHoleState();
  hs.strokes = APEX_MAX_STROKES; hs.pickedUp = true;
  apexFinishHole(`Picked up at the ${APEX_MAX_STROKES}-stroke maximum`);
}

function apexFinishHole(how, chimeMs = 300) { // chimeMs: after any putts have dropped
  const h = apexHole(), hs = apexHoleState();
  hs.done = true;
  const d = hs.strokes - h.par;
  const name = hs.pickedUp ? `${APEX_MAX_STROKES} (max)` : hs.strokes === 1 ? 'Hole in one!' : ({ '-3': 'Albatross', '-2': 'Eagle', '-1': 'Birdie', '0': 'Par', '1': 'Bogey', '2': 'Double bogey' })[d] || `${hs.strokes} (+${d})`;
  apex.holeResult = { name, how };
  onActivity('apex');
  if (!hs.pickedUp && d <= -1) apexSound('chime', chimeMs, { level: hs.strokes === 1 ? 3 : Math.min(3, -d) });
  apexSave(); renderApex();
}

function apexNextHole() {
  if (apex.holeIdx >= apex.last) return apexFinishRound();
  apex.holeIdx++;
  apexStartHole();
}

function apexFinishRound() {
  const t = APEX_TEES[apex.tee];
  const played = apex.holes.slice(apex.first, apex.last + 1);
  const round = {
    id: apex.id, type: 'apex', virtual: true, course: `Apex · ${t.name}`, date: apex.date,
    rating: apex.last - apex.first < 9 ? t.rating / 2 : t.rating, slope: t.slope, targetHandicap: apex.target,
    holeCount: played.length,
    holes: played.map((hs, i) => ({ par: apexCourse().holes[apex.first + i].par,
                                   shots: hs.pickedUp ? [] : hs.shots, ...(hs.pickedUp ? { maxed: APEX_MAX_STROKES } : {}) })),
    score: played.reduce((a, hs) => a + hs.strokes, 0), firstHole: apex.first + 1,
  };
  const all = getApexRounds(); all.unshift(round); saveApexRounds(all);
  awardXP(100, 'apex');
  checkQuests(getAllRounds()); checkBadges(getAllRounds());
  apexClear();
  apexViewRound(round.id);
}

let apexViewId = null;
function apexViewRound(id) { apexViewId = id; renderApex(); }
function apexAbandon() {
  if (!confirm('Abandon this Apex round? It won\'t be saved.')) return;
  apexClear(); renderApex();
}

// Watch the last shot again (from the side camera in 3D); changes nothing
function apexReplay() {
  if (!apex || apexAnim || !apexLastRes) return;
  const L = apexLastRes;
  apexAnim = { res: L.res, start: performance.now(), from: L.from, isReplay: true };
  apexShotSounds(L.res, L.club, L.power, L.type);
  renderApex(); arKick();
  setTimeout(() => { if (apexAnim && apexAnim.isReplay) { apexAnim = null; renderApex(); } }, apexAnimDuration(L.res) + 500);
}

// ── Shot animation timing (drawing lives in apex-render.js) ────
// Time actually flown: a ball that hits a canopy stops early
function apexFlightMs(res) { return Math.min(2600, 600 + res.world[res.world.length - 1].t * 260); }
function apexAnimDuration(res) { return apexFlightMs(res) + res.rollPath.length * 18; }

// Predicted result of the current setup (no dispersion), cached until something changes
let apexPreviewCache = { key: null, res: null };
function apexPreview() {
  const key = [apex.holeIdx, apex.ball, apex.aimDeg, apex.club, apex.power, apex.shotType, apex.lie].join('|');
  if (apexPreviewCache.key === key) return apexPreviewCache.res;
  apexPreviewCache = { key, res: apexPreviewUncached() };
  return apexPreviewCache.res;
}
function apexPreviewUncached() {
  const p = apexProfile(apex.club), t = CE_SHOT_TYPES[apex.shotType], pw = Math.max(0.1, apex.power / 100);
  return ceResolveShot(apexHole(), apex.ball, apex.aimDeg,
    { ballMph: p.ballMph * pw * t.speed, launch: p.launch * t.launch, spin: p.spin * (0.55 + 0.45 * pw) * t.spin, direction: 0, spinAxis: 0 },
    apex.lie);
}

// Click or tap the map to aim
function apexCanvasClick(e) {
  if (!apex || apexAnim || apex.holeResult) return;
  apexAimAt(arScreenToWorld(e));
  apexSave(); apexRefreshInfo();
}
function apexNudgeAim(deg) { apex.aimDeg += deg; apexSave(); apexRefreshInfo(); }
function apexSetClub(c)    { apex.club = c; apex.power = 100; apexSave(); apexRefreshInfo(); }
function apexSetType(t)    { apex.shotType = t; apexSave(); renderApex(); }
function apexSetPower(v)   { apex.power = +v; apexSave(); apexRefreshInfo(); }
function apexToggleView()  { apexFullView = !apexFullView; renderApex(); }

// ── Screens ────────────────────────────────────────────────────
function renderApex() {
  const el = document.getElementById('apex-content');
  if (!el) return;
  if (apexViewId !== null) return apexRenderSummary(el);
  if (!apex) return apexRenderHome(el);

  const h = apexHole(), hs = apexHoleState();
  const total = apex.holes.reduce((a, x) => a + x.strokes, 0);
  const parSoFar = apex.holes.reduce((a, x, i) => a + (x.done ? apexCourse().holes[i].par : 0), 0);
  const doneStrokes = apex.holes.reduce((a, x) => a + (x.done ? x.strokes : 0), 0);
  const r10 = R10.isConnected();

  el.innerHTML = `
    <div class="apex-top">
      <div>
        <div class="apex-hole-title">Hole ${h.n} · ${esc(h.name)}</div>
        <div class="apex-hole-meta">Par ${h.par} · ${h.yards[apex.tee]} yds · ${APEX_TEES[apex.tee].name} tees</div>
      </div>
      ${apex.challenge ? `<div style="text-align:right;">
        <div class="apex-score">${Math.min(APEX_CH_BALLS, apex.challenge.results.length + 1)}<span class="apex-hole-meta"> / ${APEX_CH_BALLS}</span></div>
        <div class="apex-hole-meta">ball</div>
      </div>` : `<div style="text-align:right;">
        <div class="apex-score">${doneStrokes ? toPar(doneStrokes, parSoFar) : 'E'}</div>
        <div class="apex-hole-meta">Total ${total} · this hole ${hs.strokes}</div>
      </div>`}
    </div>
    ${apex.challenge ? apexChallengeBarHTML() : ''}
    <div class="apex-map-wrap">
      <canvas id="apex-canvas" class="apex-canvas" onclick="apexCanvasClick(event)"${ap3.on ? ' style="display:none;"' : ''}></canvas>
      <div id="apex-3d-host" class="apex-3d-host"${ap3.on ? '' : ' style="display:none;"'}></div>
      <div class="apex-view-btns">
        ${ap3Available() ? `<button class="apex-view-btn${ap3.on ? ' on' : ''}" onclick="ap3Toggle()">${ap3.loading ? 'Loading 3D…' : ap3.on ? '2D map' : '3D view'}</button>` : ''}
        ${ap3.on ? '' : `<button class="apex-view-btn" onclick="apexToggleView()">${apexFullView ? 'Follow ball' : 'Whole hole'}</button>`}
        ${apexLastRes && !apexAnim ? `<button class="apex-view-btn" onclick="apexReplay()" title="Watch the last shot again">↺ Replay</button>` : ''}
        <button class="apex-view-btn" onclick="apexToggleSound()" title="${apexSoundOn() ? 'Mute' : 'Sound on'}" aria-label="${apexSoundOn() ? 'Mute' : 'Sound on'}">${apexSoundOn() ? '🔊' : '🔇'}</button>
      </div>
      ${apex.holeResult && !(apexAnim && apexAnim.isReplay) ? `<div class="apex-result">
        <div class="apex-result-name">${apex.holeResult.name}</div>
        ${apex.challenge ? `<div class="apex-result-how">${esc(apex.holeResult.how)}</div>
        <div style="display:flex;gap:8px;justify-content:center;flex-wrap:wrap;">
          <button class="btn btn-gold" onclick="apexChallengeAgain()">↻ Try again</button>
          <button class="btn btn-sm" style="background:rgba(255,255,255,0.85);color:var(--gray-dark);" onclick="apexChallengeQuit()">All challenges</button>
        </div>` : `<div class="apex-result-how">${esc(apex.holeResult.how)} · ${hs.strokes} strokes</div>
        <button class="btn btn-gold" onclick="apexNextHole()">${apex.holeIdx >= apex.last ? '🏁 Finish round' : 'Next hole ›'}</button>`}
      </div>` : ''}
    </div>
    <div class="apex-side-wrap"><canvas id="apex-side" class="apex-side"></canvas></div>
    ${apex.holeResult ? '' : `
    <div class="card apex-controls">
      <div id="apex-info" class="apex-info"></div>
      <div class="apex-row">
        <select aria-label="Club" onchange="apexSetClub(this.value)">${APEX_CLUBS.map(c => `<option ${c === apex.club ? 'selected' : ''}>${c}</option>`).join('')}</select>
        <div class="toggle-group">${Object.entries(CE_SHOT_TYPES).map(([k, t]) => `<button class="toggle-btn ${apex.shotType === k ? 'active' : ''}" onclick="apexSetType('${k}')">${t.name}</button>`).join('')}</div>
        <button class="btn btn-sm" style="background:var(--gray-light);color:var(--gray-dark);" onclick="apexNudgeAim(-2)" title="Aim left">◀</button>
        <button class="btn btn-sm" style="background:var(--gray-light);color:var(--gray-dark);" onclick="apexNudgeAim(2)" title="Aim right">▶</button>
      </div>
      ${r10 ? `<div class="apex-swing-r10">📡 R10 ready — take your swing</div>` : `
      <div class="apex-row">
        <label class="spd-num" style="flex:1;">Power <input type="range" min="10" max="100" step="1" value="${apex.power}" oninput="apexSetPower(this.value)" style="flex:1;"> <span id="apex-power">${apex.power}%</span></label>
        <button class="btn btn-primary" onclick="apexSwingSimulated()">🏌️ Swing</button>
      </div>`}
      <div class="apex-hint">Tap the map to aim · ${r10 ? 'Shots use your real R10 launch data' : 'No R10 connected — simulated swings use ' + (apexProfile(apex.club).source === 'yours' ? 'your range averages' : 'typical amateur numbers')}</div>
    </div>`}
    <div class="card">
      <div class="apex-hole-meta" style="margin-bottom:6px;">${esc(h.note)}</div>
      ${apex.challenge ? '' : apexScorecardHTML()}
      <div style="text-align:right;margin-top:8px;">${apex.challenge
        ? `<button class="btn btn-sm" style="background:none;color:var(--gray-mid);" onclick="apexChallengeQuit()">Quit challenge</button>`
        : `<button class="btn btn-sm" style="background:none;color:var(--gray-mid);" onclick="apexAbandon()">Abandon round</button>`}</div>
    </div>
  `;
  apexRefreshInfo();
  arAttach();
  apexAmbience(true);
}

function apexRefreshInfo() {
  const el = document.getElementById('apex-info');
  if (!el || !apex) return;
  const h = apexHole(), pv = apexPreview(), last = apex.lastShot;
  const lieName = { tee: 'Tee', fairway: 'Fairway', rough: 'Rough', sand: 'Bunker', recovery: 'Jungle', green: 'Green' }[apex.lie];
  const pw = document.getElementById('apex-power'); if (pw) pw.textContent = apex.power + '%';
  el.innerHTML = `
    <div class="apex-stat"><span>To pin</span><strong>${Math.round(ceDist(apex.ball, h.pin))} yds</strong></div>
    <div class="apex-stat"><span>Lie</span><strong>${lieName}</strong></div>
    ${(() => { const up = Math.round(ceElevation(h, h.pin) - ceElevation(h, apex.ball));
      return `<div class="apex-stat"><span>To green</span><strong>${up > 1 ? `▲ ${up} ft up` : up < -1 ? `▼ ${-up} ft down` : 'Level'}</strong></div>`; })()}
    <div class="apex-stat"><span>${esc(apex.club)} plays</span><strong>${Math.round(pv.total)} yds</strong></div>
    <div class="apex-stat ${pv.events.length || pv.penalty ? 'warn' : ''}"><span>Preview</span><strong>${pv.events.length ? esc(pv.events[0]) : pv.penalty ? 'Hazard' : 'Clear'}</strong></div>
    ${last ? `<div class="apex-last">Last: ${esc(last.club)} ${last.src === 'r10' ? '📡' : ''} — carry ${Math.round(last.carry)}, total ${Math.round(last.total)} yds, apex ${Math.round(last.apexFt)} ft${last.events.length ? ' · ' + esc(last.events.join(' · ')) : ''}</div>` : ''}`;
}

function apexScorecardHTML() {
  const holes = apexCourse().holes, cells = (fn) => holes.map((h, i) => `<td>${fn(h, i)}</td>`).join('');
  const st = i => apex.holes[i];
  const cls = (h, i) => !st(i).done ? '' : st(i).strokes < h.par ? 'apex-under' : st(i).strokes > h.par ? 'apex-over' : '';
  return `<div class="scorecard-wrap"><table class="scorecard apex-card">
    <thead><tr><th>Hole</th>${holes.map(h => `<th${h.n - 1 === apex.holeIdx ? ' class="apex-cur"' : ''}>${h.n}</th>`).join('')}</tr></thead>
    <tbody>
      <tr><td>Par</td>${cells(h => h.par)}</tr>
      <tr><td>Score</td>${holes.map((h, i) => `<td class="${cls(h, i)}">${st(i).done ? st(i).strokes : ''}</td>`).join('')}</tr>
    </tbody></table></div>`;
}

function apexRenderHome(el) {
  const rounds = getApexRounds();
  const best = rounds.filter(r => r.holeCount === 18).sort((a, b) => a.score - b.score)[0];
  el.innerHTML = `
    <div class="apex-hero">
      <div class="apex-hero-title">APEX</div>
      <div class="apex-hero-sub">Par 72 · carved through jungle ruins and temple pyramids</div>
    </div>
    <div class="card">
      <div class="card-title">New Round</div>
      <p style="font-size:0.84rem;color:var(--gray-mid);margin-bottom:12px;">Play with your R10 for real launch data, or without it using simulated swings. Putting is automatic. Apex rounds get a strokes-gained summary but never count toward your handicap.</p>
      <label>Tees</label>
      <div class="spd-programs" style="margin-bottom:14px;">
        ${Object.entries(APEX_TEES).map(([k, t]) => {
          const yds = APEX_HOLES.reduce((a, h) => a + h.yards[k], 0);
          return `<button class="spd-program ${k === (getPrefs().apexTee || 'temple') ? 'active' : ''}" onclick="setPref('apexTee','${k}'); renderApex();">
            <div class="spd-program-name"><span style="display:inline-block;width:10px;height:10px;border-radius:50%;background:${t.color};margin-right:6px;"></span>${t.name}</div>
            <div class="spd-program-meta">${yds.toLocaleString()} yds · ${t.rating} / ${t.slope}</div></button>`;
        }).join('')}
      </div>
      <div style="display:flex;gap:8px;flex-wrap:wrap;">
        <button class="btn btn-primary" onclick="apexStart(getPrefs().apexTee || 'temple', 'all')">▶ Play 18</button>
        <button class="btn btn-sm" style="background:var(--gray-light);color:var(--gray-dark);" onclick="apexStart(getPrefs().apexTee || 'temple', 'front')">Front 9</button>
        <button class="btn btn-sm" style="background:var(--gray-light);color:var(--gray-dark);" onclick="apexStart(getPrefs().apexTee || 'temple', 'back')">Back 9</button>
      </div>
    </div>
    ${apexChallengesHTML()}
    ${apexStatsHTML(rounds)}
    ${r10PanelHTML()}
    <div class="card">
      <div class="card-title">The Holes</div>
      ${APEX_HOLES.map(h => `<div class="apex-hole-row"><span class="apex-hole-num">${h.n}</span><div style="flex:1;"><strong>${esc(h.name)}</strong> <span class="apex-hole-meta">Par ${h.par} · ${h.yards.jaguar} / ${h.yards.temple} / ${h.yards.canopy}</span><div class="apex-hole-meta">${esc(h.note)}</div></div></div>`).join('')}
    </div>
    ${rounds.length ? `<div class="card">
      <div class="card-title">Your Apex Rounds${best ? ` · best ${best.score} (${toPar(best.score, 72)})` : ''}</div>
      ${rounds.slice(0, 10).map(r => `<div class="round-row" style="cursor:pointer;" onclick="apexViewRound(${r.id})">
        <div><div class="round-course">${esc(r.course)} <span style="font-size:0.75rem;color:var(--gray-mid);">${r.holeCount}H</span></div><div class="round-date">${formatDate(r.date)}</div></div>
        <div class="score-chip ${toParClass(r.score, r.holes.reduce((a, h) => a + h.par, 0))}">${r.score} (${toPar(r.score, r.holes.reduce((a, h) => a + h.par, 0))})</div>
      </div>`).join('')}
    </div>` : ''}
  `;
}

function apexRenderSummary(el) {
  const r = getApexRounds().find(x => x.id === apexViewId);
  if (!r) { apexViewId = null; return renderApex(); }
  el.innerHTML = `
    <div class="section-header">
      <div class="page-title">Apex Round</div>
      <button class="btn btn-sm" style="background:var(--gray-light);color:var(--gray-dark);" onclick="apexViewId = null; renderApex();">‹ Back</button>
    </div>
    ${sgSummaryHTML(r)}`;
}

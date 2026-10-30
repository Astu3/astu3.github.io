// Golf Improvement App — Shot-by-shot strokes gained: engine, round entry, summary and club data.
// Classic script: shares globals with the other files; load order is set in golf-improvement-app.html.

// ════════════════════════════════════════════════════════════
// STROKES GAINED ENGINE  (shot-by-shot, Broadie-style baseline)
// ════════════════════════════════════════════════════════════
// Expected strokes to hole out, scratch/benchmark baseline.
// Through-the-green lies are keyed by distance in YARDS; the green
// (putting) is keyed by distance in FEET. Values interpolated linearly.
const SG_EXPECTED = {
  tee:      [[100,2.85],[150,2.94],[200,3.05],[250,3.22],[300,3.55],[350,3.85],[400,3.99],[450,4.18],[500,4.45],[600,4.9]],
  fairway:  [[10,2.18],[20,2.40],[40,2.60],[60,2.66],[80,2.70],[100,2.80],[120,2.85],[140,2.91],[160,2.98],[180,3.08],[200,3.19],[220,3.32],[240,3.45],[260,3.58],[300,3.85]],
  rough:    [[10,2.34],[20,2.59],[40,2.78],[60,2.91],[80,2.96],[100,3.02],[120,3.08],[140,3.15],[160,3.23],[180,3.33],[200,3.44],[220,3.59],[240,3.74],[280,4.05]],
  sand:     [[10,2.43],[20,2.53],[40,2.82],[60,3.00],[80,3.06],[100,3.16],[120,3.27],[140,3.38],[160,3.50],[180,3.66],[200,3.80],[240,4.1]],
  recovery: [[20,3.10],[60,3.45],[100,3.80],[150,3.95],[200,4.15],[260,4.5]],
  green:    [[1,1.001],[2,1.009],[3,1.053],[4,1.147],[5,1.234],[6,1.32],[7,1.4],[8,1.467],[9,1.53],[10,1.582],[12,1.67],[15,1.78],[18,1.852],[20,1.878],[25,1.943],[30,1.998],[40,2.092],[50,2.17],[60,2.26],[90,2.51]],
};

const SG_LIES  = ['tee','fairway','rough','sand','recovery','green'];
const SG_CLUBS = ['Driver','3-Wood','5-Wood','Hybrid','2-Iron','3-Iron','4-Iron','5-Iron','6-Iron','7-Iron','8-Iron','9-Iron','PW','GW','SW','LW','Putter'];

function sgInterp(table, dist) {
  if (dist <= table[0][0]) return table[0][1];
  const last = table[table.length - 1];
  if (dist >= last[0]) {
    const a = table[table.length - 2];
    const slope = (last[1] - a[1]) / (last[0] - a[0]);
    return last[1] + slope * (dist - last[0]);
  }
  for (let i = 0; i < table.length - 1; i++) {
    const a = table[i], b = table[i + 1];
    if (dist >= a[0] && dist <= b[0]) {
      return a[1] + (b[1] - a[1]) * (dist - a[0]) / (b[0] - a[0]);
    }
  }
  return last[1];
}

// Calibration: scale the scratch baseline so a round of "expected" shots sums
// to the player's target score (course rating + target handicap). Putting is
// far less handicap-sensitive than the long game, so it gets a gentler factor.
function sgCalibration(targetHandicap, rating, holeCount) {
  // 9-hole rounds use a 9-hole rating; effectiveRating() corrects an 18-hole value entered by mistake
  const baseRating = (holeCount === 9) ? (isFinite(rating) ? effectiveRating(rating, 9) : 36) * 2 : (isFinite(rating) ? rating : 72);
  const H = isFinite(targetHandicap) ? Math.max(0, targetHandicap) : 14;
  const f = baseRating > 0 ? (baseRating + H) / baseRating : 1; // >= 1 for most amateurs
  return { long: f, putt: 1 + (f - 1) * 0.4 };
}

function sgExpected(lie, dist, cal) {
  const table = SG_EXPECTED[lie] || SG_EXPECTED.fairway;
  const raw = sgInterp(table, Math.max(0, dist));
  const factor = (lie === 'green') ? cal.putt : cal.long;
  return raw * factor;
}

// Classify a shot by its starting position.
function sgCategory(shot, par) {
  if (shot.lie === 'green') return 'putting';
  if (shot.lie === 'tee') return (par >= 4) ? 'offTee' : 'approach'; // par-3 tee shot = approach
  // through the green, off the tee box
  return (shot.dist >= 100) ? 'approach' : 'short';
}

const SG_CATS = [
  { key:'offTee',   name:'Off the Tee' },
  { key:'approach', name:'Approach' },
  { key:'short',    name:'Short Game' },
  { key:'putting',  name:'Putting' },
];

// Compute per-shot SG + category totals for one hole.
// shots: ordered [{lie, dist, club?, penalty?}]; the last shot holes out.
function sgHole(shots, par, cal) {
  const out = { shots: [], byCat: { offTee:0, approach:0, short:0, putting:0 }, strokes: 0 };
  for (let i = 0; i < shots.length; i++) {
    const s = shots[i];
    const pen = s.penalty || 0;
    const startE = sgExpected(s.lie, s.dist, cal);
    const isLast = (i === shots.length - 1);
    const endE = isLast ? 0 : sgExpected(shots[i + 1].lie, shots[i + 1].dist, cal);
    const sg = startE - endE - 1 - pen;
    const cat = sgCategory(s, par);
    out.byCat[cat] += sg;
    out.strokes += 1 + pen;
    out.shots.push({ ...s, sg, cat, startE, endE });
  }
  out.total = SG_CATS.reduce((a, c) => a + out.byCat[c.key], 0);
  return out;
}

// Aggregate a whole SG round (holes: [{par, shots[]}]).
function sgRoundTotals(holes, cal) {
  const totals = { sgTotal: 0, byCat: { offTee:0, approach:0, short:0, putting:0 }, score: 0, par: 0, putts: 0, penalties: 0, shots: [] };
  for (const h of holes) {
    // A hole picked up at a stroke maximum counts its capped score but no strokes gained
    if (h.maxed) { totals.score += h.maxed; totals.par += h.par || 0; continue; }
    const res = sgHole(h.shots || [], h.par, cal);
    totals.sgTotal += res.total;
    SG_CATS.forEach(c => totals.byCat[c.key] += res.byCat[c.key]);
    totals.score += res.strokes;
    totals.par   += h.par || 0;
    totals.putts += (h.shots || []).filter(s => s.lie === 'green').length;
    totals.penalties += (h.shots || []).reduce((a, s) => a + (s.penalty || 0), 0);
    res.shots.forEach(s => totals.shots.push({ ...s, par: h.par }));
  }
  return totals;
}

// ════════════════════════════════════════════════════════════
// SG ROUND — storage, draft state, entry UI
// ════════════════════════════════════════════════════════════
function getSGRounds()  { return loadData(KEYS.sgRounds, []); }
function saveSGRounds(r){ saveData(KEYS.sgRounds, r); }

// A shot-by-shot round where every hole was played can stand in for a
// scorecard round (handicap, history, dashboard stats, badges, quests).
// FIR/GIR/putts are derived from the shots. Returns null for partial rounds,
// which don't qualify for a handicap.
function sgToRound(r) {
  if (!r.holes || !r.holes.length || r.holes.some(h => !h.shots || !h.shots.length)) return null;
  let firCount = 0, firTotal = 0, girCount = 0;
  const holes = r.holes.map(h => {
    const shots = h.shots;
    const pen = shots.reduce((a, s) => a + (s.penalty || 0), 0);
    const score = shots.length + pen;
    const putts = shots.filter(s => s.lie === 'green').length;
    // Fairway hit: on a par 4/5 the tee shot finished in the fairway
    const fir = h.par >= 4 && shots.length > 1 && shots[1].lie === 'fairway';
    // Green in regulation: on the green (or holed) in par − 2 strokes or fewer
    const firstGreen = shots.findIndex(s => s.lie === 'green');
    const gir = firstGreen >= 0
      ? firstGreen + shots.slice(0, firstGreen).reduce((a, s) => a + (s.penalty || 0), 0) <= h.par - 2
      : score <= h.par - 1;
    if (h.par >= 4) { firTotal++; if (fir) firCount++; }
    if (gir) girCount++;
    return { par: h.par, score, putts, pen, fir, gir };
  });
  const sum = k => holes.reduce((a, h) => a + h[k], 0);
  return {
    id: 'sg-' + r.id, sgId: r.id, type: 'sg',
    course: r.course, date: r.date, rating: r.rating, slope: r.slope,
    holeCount: r.holeCount, holes,
    score: sum('score'), par: sum('par'), putts: sum('putts'), penalties: sum('pen'),
    firPct: firTotal ? Math.round(firCount / firTotal * 100) : 0,
    girPct: Math.round(girCount / holes.length * 100),
    notes: '',
  };
}

let sgDraft = null;          // { course, date, rating, slope, targetHandicap, holeCount, holes:[{par,shots}], current }
let sgViewId = null;         // id of a saved SG round being viewed (summary)

// The in-progress round is saved on every change so a refresh or closed tab
// mid-round does not lose shots.
function sgPersistDraft() { if (sgDraft) saveData(KEYS.sgDraft, sgDraft); }
function sgClearDraft()   { sgDraft = null; localStorage.removeItem(uk(KEYS.sgDraft)); }
function sgLoadDraft()    { sgDraft = loadData(KEYS.sgDraft, null); }

function sgTargetDefault() {
  const g = getGoals();
  if (g && typeof g.targetHandicap === 'number') return g.targetHandicap;
  const h = calcHandicap(getAllRounds());
  return h ? h.value : 14;
}

function sgDraftCal() {
  return sgCalibration(sgDraft.targetHandicap, sgDraft.rating, sgDraft.holeCount);
}

// ── Render entry: setup form, or the active hole stepper ──────
function renderSGRound() {
  const el = document.getElementById('sg-round-content');
  if (sgViewId !== null) { renderSGSummaryPage(el, sgViewId); return; }
  if (sgDraft) { renderSGEntry(el); return; }

  const recent = getSGRounds().slice(0, 6);
  el.innerHTML = `
    <div class="section-header"><div class="page-title">Track Round · Strokes Gained</div></div>
    <div class="card">
      <p style="font-size:0.85rem;color:var(--gray-mid);margin-bottom:14px;">
        Log every shot's lie &amp; distance and we'll compute true strokes gained, calibrated to your target handicap — so you see exactly where you're losing strokes. Club is optional but unlocks your Club Data.
      </p>
      <div class="form-row">
        <div>
          <label>Course Name</label>
          <input type="text" id="sg-course" placeholder="e.g. Pebble Beach" />
        </div>
        <div>
          <label>Date</label>
          <input type="date" id="sg-date" />
        </div>
      </div>
      <div style="margin-bottom:14px;">
        <label>Format</label>
        <div class="toggle-group">
          <button class="toggle-btn active" id="sg-toggle-9" onclick="sgSetSetupHoles(9)">9 Holes</button>
          <button class="toggle-btn" id="sg-toggle-18" onclick="sgSetSetupHoles(18)">18 Holes</button>
        </div>
      </div>
      <div class="form-row triple">
        <div><label>Course Rating</label><input type="number" id="sg-rating" value="36.0" step="0.1" />
          <div id="sg-rating-hint" style="font-size:0.7rem;color:var(--gray-mid);margin-top:3px;">9-hole rating (≈ half the 18-hole rating, ~35)</div></div>
        <div><label>Slope</label><input type="number" id="sg-slope" value="113" min="55" max="155" /></div>
        <div><label>Target Handicap</label><input type="number" id="sg-target" step="0.1" /></div>
      </div>
      <p style="font-size:0.72rem;color:var(--gray-mid);margin:-6px 0 14px;">Strokes gained is graded against the score a golfer of your target handicap would expect on this course.</p>
      <button class="btn btn-primary" onclick="beginSGRound()">▶ Start Round</button>
    </div>
    ${recent.length ? `
      <div class="card">
        <div class="card-title">Recent SG Rounds</div>
        ${recent.map(r => {
          const cal = sgCalibration(r.targetHandicap, r.rating, r.holeCount);
          const t = sgRoundTotals(r.holes, cal);
          const cls = t.sgTotal >= 0 ? 'under' : 'over';
          return `<div class="round-row" style="cursor:pointer;" onclick="viewSGRound(${r.id})">
            <div>
              <div class="round-course">${esc(r.course || 'Unknown')} <span style="font-size:0.75rem;color:var(--gray-mid);">${r.holeCount}H</span></div>
              <div class="round-date">${formatDate(r.date)} · ${t.score} strokes</div>
            </div>
            <div class="score-chip ${cls}">${signed(t.sgTotal)} SG</div>
          </div>`;
        }).join('')}
      </div>` : ''}
  `;
  document.getElementById('sg-date').value   = todayISO();
  document.getElementById('sg-target').value = sgTargetDefault().toFixed(1);
  sgSetupHoles = 9;
  // course autocomplete reuse is optional; keep simple here
}

let sgSetupHoles = 9;
function sgSetSetupHoles(n) {
  sgSetupHoles = n;
  document.getElementById('sg-toggle-9').classList.toggle('active', n===9);
  document.getElementById('sg-toggle-18').classList.toggle('active', n===18);
  document.getElementById('sg-rating').value = (n===9 ? 36.0 : 72.0);
  document.getElementById('sg-rating-hint').textContent = n === 9
    ? '9-hole rating (≈ half the 18-hole rating, ~35)'
    : '18-hole course rating (~72)';
}

function beginSGRound() {
  const n = sgSetupHoles;
  const pars = (n === 9 ? DEFAULT_PARS_9 : DEFAULT_PARS_18).slice(0, n);
  sgDraft = {
    course: document.getElementById('sg-course').value.trim() || 'Unknown Course',
    date:   document.getElementById('sg-date').value || todayISO(),
    rating: parseFloat(document.getElementById('sg-rating').value) || (n===9?36:72),
    slope:  parseInt(document.getElementById('sg-slope').value) || 113,
    targetHandicap: parseFloat(document.getElementById('sg-target').value),
    holeCount: n,
    holes: pars.map(p => ({ par: p, shots: [{ lie:'tee', dist:'', club:'', penalty:0 }] })),
    current: 0
  };
  if (!isFinite(sgDraft.targetHandicap)) sgDraft.targetHandicap = 14;
  renderSGRound();
}

function sgCancelDraft() {
  if (confirm('Discard this in-progress round?')) { sgClearDraft(); renderSGRound(); }
}

// ── Hole stepper entry ────────────────────────────────────────
function renderSGEntry(el) {
  sgPersistDraft(); // every edit re-renders, so this saves each change
  const d = sgDraft, h = d.current, hole = d.holes[h];
  const cal = sgDraftCal();
  const res = sgHole(hole.shots.filter(s => s.dist !== '' && isFinite(+s.dist)).map(s => ({...s, dist:+s.dist})), hole.par, cal);

  // running round total over holes that have ≥1 valid shot
  let roundSG = 0, holesPlayed = 0;
  d.holes.forEach(hh => {
    const valid = hh.shots.filter(s => s.dist !== '' && isFinite(+s.dist)).map(s => ({...s, dist:+s.dist}));
    if (valid.length) { roundSG += sgHole(valid, hh.par, cal).total; holesPlayed++; }
  });

  const shotRows = hole.shots.map((s, i) => {
    const unit = s.lie === 'green' ? 'ft' : 'yds';
    return `<div class="sg-shot-row">
      <div class="sg-shot-num">${i+1}</div>
      <select onchange="sgSetShot(${i},'lie',this.value)">
        ${SG_LIES.map(l => `<option value="${l}" ${s.lie===l?'selected':''}>${l[0].toUpperCase()+l.slice(1)}</option>`).join('')}
      </select>
      <div class="sg-dist-wrap">
        <input type="number" min="0" placeholder="dist" value="${s.dist}" onchange="sgSetShot(${i},'dist',this.value)" />
        <span class="sg-unit">${unit}</span>
      </div>
      <select onchange="sgSetShot(${i},'club',this.value)">
        <option value="">Club (opt)</option>
        ${SG_CLUBS.map(c => `<option value="${c}" ${s.club===c?'selected':''}>${c}</option>`).join('')}
      </select>
      <select title="Penalty strokes" onchange="sgSetShot(${i},'penalty',this.value)">
        ${[0,1,2].map(p => `<option value="${p}" ${(+s.penalty||0)===p?'selected':''}>${p===0?'—':'+'+p}</option>`).join('')}
      </select>
      <button class="sg-shot-del" onclick="sgRemoveShot(${i})" ${hole.shots.length<=1?'disabled':''}>✕</button>
    </div>`;
  }).join('');

  el.innerHTML = `
    <div class="section-header">
      <div class="page-title">${esc(d.course)} · Hole ${h+1}/${d.holeCount}</div>
      <button class="btn btn-sm" style="background:var(--gray-light);color:var(--gray-dark);" onclick="sgCancelDraft()">Discard</button>
    </div>

    <div class="card">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:14px;">
        <div style="display:flex;align-items:center;gap:10px;">
          <label style="margin:0;">Par</label>
          <div class="toggle-group">
            ${[3,4,5].map(p => `<button class="toggle-btn ${hole.par===p?'active':''}" onclick="sgSetPar(${p})">${p}</button>`).join('')}
          </div>
        </div>
        <div style="text-align:right;">
          <div style="font-size:0.72rem;color:var(--gray-mid);">Hole SG / Strokes</div>
          <div style="font-weight:800;color:${res.shots.length && res.total >= 0 ? 'var(--green-mid)' : 'var(--red)'};">
            ${res.shots.length ? signed(res.total, 2) : '—'}
            <span style="color:var(--gray-mid);font-weight:600;">· ${res.strokes||0}</span>
          </div>
        </div>
      </div>

      <p style="font-size:0.78rem;color:var(--gray-mid);margin-bottom:8px;">Enter each shot in order with the lie you played from and the distance <strong>to the hole</strong>. The last shot is the one that holed out. Putts use feet.</p>
      <div class="sg-shots">${shotRows}</div>
      <button class="btn btn-sm" style="background:var(--green-pale);color:var(--green-mid);margin-top:6px;" onclick="sgAddShot()">+ Add Shot</button>
    </div>

    <div class="card" style="display:flex;align-items:center;justify-content:space-between;">
      <div>
        <div style="font-size:0.72rem;color:var(--gray-mid);">Round so far</div>
        <div style="font-weight:800;">${signed(roundSG)} SG · ${holesPlayed}/${d.holeCount} holes</div>
      </div>
      <div style="display:flex;gap:8px;">
        <button class="btn btn-sm" style="background:var(--gray-light);color:var(--gray-dark);" onclick="sgPrevHole()" ${h===0?'disabled':''}>‹ Prev</button>
        ${h < d.holeCount-1
          ? `<button class="btn btn-primary btn-sm" onclick="sgNextHole()">Next ›</button>`
          : `<button class="btn btn-gold btn-sm" onclick="sgFinishRound()">🏁 Finish Round</button>`}
      </div>
    </div>
  `;
}

function sgSetShot(i, field, val) {
  const hole = sgDraft.holes[sgDraft.current];
  if (field === 'penalty') hole.shots[i].penalty = +val || 0;
  else if (field === 'dist') hole.shots[i].dist = val;
  else hole.shots[i][field] = val;
  // Re-render only when lie changes (unit/label may change); otherwise light refresh
  if (field === 'lie') renderSGRound();
  else renderSGEntry(document.getElementById('sg-round-content'));
}
function sgAddShot() {
  const hole = sgDraft.holes[sgDraft.current];
  const prev = hole.shots[hole.shots.length - 1];
  const nextLie = prev && prev.lie === 'green' ? 'green' : 'fairway';
  hole.shots.push({ lie: nextLie, dist:'', club:'', penalty:0 });
  renderSGEntry(document.getElementById('sg-round-content'));
}
function sgRemoveShot(i) {
  const hole = sgDraft.holes[sgDraft.current];
  if (hole.shots.length > 1) hole.shots.splice(i, 1);
  renderSGEntry(document.getElementById('sg-round-content'));
}
function sgSetPar(p) { sgDraft.holes[sgDraft.current].par = p; renderSGEntry(document.getElementById('sg-round-content')); }
function sgPrevHole() { if (sgDraft.current > 0) { sgDraft.current--; renderSGRound(); } }
function sgNextHole() { if (sgDraft.current < sgDraft.holeCount-1) { sgDraft.current++; renderSGRound(); } }

function sgFinishRound() {
  // Persist holes with numeric distances; drop empty shots
  const holes = sgDraft.holes.map(h => ({
    par: h.par,
    shots: h.shots.filter(s => s.dist !== '' && isFinite(+s.dist))
                   .map(s => ({ lie:s.lie, dist:+s.dist, club:s.club||'', penalty:+s.penalty||0 }))
  }));
  const played = holes.filter(h => h.shots.length).length;
  if (!played) { showToast('⚠️ Enter at least one shot'); return; }

  // The last shot on each hole is treated as the one that holed out. A hole
  // that doesn't end on the green was usually left unfinished (e.g. the putts
  // weren't entered), which would score it as a hole-out from off the green.
  const offGreen = holes.map((h, i) => ({ h, n: i + 1 }))
    .filter(x => x.h.shots.length && x.h.shots[x.h.shots.length - 1].lie !== 'green')
    .map(x => x.n);
  const skipped = holes.map((h, i) => h.shots.length ? null : i + 1).filter(Boolean);
  const warnings = [];
  if (offGreen.length) warnings.push(`Hole${offGreen.length > 1 ? 's' : ''} ${offGreen.join(', ')} end${offGreen.length > 1 ? '' : 's'} off the green — the last shot will count as holed out. That's right for a chip-in; otherwise add the missing putts.`);
  if (skipped.length) warnings.push(`Hole${skipped.length > 1 ? 's' : ''} ${skipped.join(', ')} ha${skipped.length > 1 ? 've' : 's'} no shots and won't be included.`);
  if (warnings.length && !confirm(warnings.join('\n\n') + '\n\nFinish and save the round?')) return;

  const round = {
    id: Date.now(), type:'sg',
    course: sgDraft.course, date: sgDraft.date,
    rating: sgDraft.rating, slope: sgDraft.slope,
    targetHandicap: sgDraft.targetHandicap, holeCount: sgDraft.holeCount,
    holes
  };
  const all = getSGRounds();
  all.unshift(round);
  saveSGRounds(all);
  saveCourseToDB({ course: round.course, rating: round.rating, slope: round.slope, par: holes.reduce((s,h)=>s+h.par,0), holeCount: round.holeCount });

  // Reward XP for completing a tracked round
  awardXP(80, 'sg-round');
  // A completed round now counts toward quests (and badges, via awardXP)
  checkQuests(getAllRounds());
  onActivity('round'); // weekly goal and streak
  showToast('🏁 Round saved! +80 XP');

  sgClearDraft();
  viewSGRound(round.id);
}

function viewSGRound(id) { sgViewId = id; showPage('sg-round'); }
function sgBackToList() { sgViewId = null; renderSGRound(); }
function deleteSGRound(id) {
  if (!confirm('Delete this SG round?')) return;
  saveSGRounds(getSGRounds().filter(r => r.id !== id));
  sgViewId = null;
  renderSGRound();
}

// ════════════════════════════════════════════════════════════
// SG ROUND SUMMARY  (Data Driven Golf style)
// ════════════════════════════════════════════════════════════
function renderSGSummaryPage(el, id) {
  const r = getSGRounds().find(x => x.id === id);
  if (!r) { sgViewId = null; renderSGRound(); return; }
  el.innerHTML = `
    <div class="section-header">
      <div class="page-title">Round Summary</div>
      <button class="btn btn-sm" style="background:var(--gray-light);color:var(--gray-dark);" onclick="sgBackToList()">‹ Back</button>
    </div>
    ${sgSummaryHTML(r)}
    <div style="display:flex;gap:10px;margin-top:4px;">
      <button class="btn btn-danger" onclick="deleteSGRound(${r.id})">Delete Round</button>
    </div>
  `;
}

function sgSummaryHTML(r) {
  const cal = sgCalibration(r.targetHandicap, r.rating, r.holeCount);
  const t = sgRoundTotals(r.holes, cal);
  const relStr = toPar(t.score, t.par);

  const cats = SG_CATS.map(c => ({ name: c.name, key: c.key, sg: t.byCat[c.key] }));
  const worst = [...cats].sort((a,b) => a.sg - b.sg)[0];
  const best  = [...cats].sort((a,b) => b.sg - a.sg)[0];
  const rows  = sgBarsHTML(cats, 4);

  return `
    <div class="sg-hero">
      <div class="sg-hero-main">
        <div class="sg-hero-sg ${t.sgTotal>=0?'pos':'neg'}">${signed(t.sgTotal)}</div>
        <div class="sg-hero-label">Total Strokes Gained<br><span>vs ${hcpStr(r.targetHandicap)} target handicap</span></div>
      </div>
      <div class="sg-hero-meta">
        <div><strong>${esc(r.course)}</strong></div>
        <div>${formatDate(r.date)} · ${r.holeCount} holes</div>
        <div style="font-size:0.74rem;opacity:0.8;margin-top:2px;">${r.virtual ? 'Virtual round — not counted toward your handicap' : sgToRound(r) ? '✓ Counts toward your handicap' : 'Partial round — not counted toward your handicap'}</div>
        <div style="margin-top:6px;font-size:1.3rem;font-weight:800;">${t.score} <span style="font-size:0.85rem;font-weight:600;opacity:0.8;">(${relStr})</span></div>
      </div>
    </div>

    <div class="card">
      <div class="card-title">Strokes Gained by Category</div>
      ${rows}
      <div class="sg-focus" style="margin-top:14px;">
        ${t.sgTotal!==0 || cats.some(c=>c.sg!==0)
          ? `<strong>🎯 Biggest leak:</strong> ${worst.name} (${signed(worst.sg)}). <strong>Strength:</strong> ${best.name} (${signed(best.sg)}).`
          : 'Log shots to see your breakdown.'}
      </div>
    </div>

    <div class="stat-grid" style="margin-bottom:20px;">
      <div class="stat-box"><div class="stat-value">${t.score}</div><div class="stat-label">Score</div></div>
      <div class="stat-box blue"><div class="stat-value">${t.putts}</div><div class="stat-label">Putts</div></div>
      <div class="stat-box gold"><div class="stat-value">${t.penalties}</div><div class="stat-label">Penalties</div></div>
      <div class="stat-box"><div class="stat-value">${t.shots.length}</div><div class="stat-label">Shots Logged</div></div>
    </div>

    <div class="card">
      <div class="card-title">Hole by Hole</div>
      <div class="scorecard-wrap">
        <table class="scorecard">
          <thead><tr><th>Hole</th><th>Par</th><th>Score</th><th>SG</th><th>Shots</th></tr></thead>
          <tbody>
            ${r.holes.map((h,i) => {
              const hr = sgHole(h.shots, h.par, cal);
              const sg = hr.total;
              if (h.maxed) return `<tr><td>${i+1}</td><td>${h.par}</td><td>${h.maxed}</td><td>—</td><td style="font-size:0.75rem;color:var(--gray-mid);">Picked up (max)</td></tr>`;
              if (!h.shots.length) return '';
              return `<tr>
                <td>${i+1}</td><td>${h.par}</td><td>${hr.strokes}</td>
                <td style="color:${sg>=0?'var(--green-mid)':'var(--red)'};font-weight:700;">${signed(sg)}</td>
                <td style="font-size:0.75rem;color:var(--gray-mid);">${h.shots.map(s=>s.club||s.lie[0].toUpperCase()).join(' · ')}</td>
              </tr>`;
            }).join('')}
          </tbody>
        </table>
      </div>
    </div>
  `;
}

// ════════════════════════════════════════════════════════════
// CLUB DATA
// ════════════════════════════════════════════════════════════
function renderClubs() {
  const el = document.getElementById('clubs-content');
  const rounds = getSGRounds();

  // Aggregate per club from all SG rounds. Distance covered = start − end,
  // converting green feet to yards (÷3) so iron approaches that finish on the
  // green still register a yardage. Putts are measured in feet.
  const byClub = {};
  rounds.forEach(r => {
    const cal = sgCalibration(r.targetHandicap, r.rating, r.holeCount);
    r.holes.forEach(h => {
      const hr = sgHole(h.shots, h.par, cal);
      hr.shots.forEach((s, i) => {
        if (!s.club) return;
        const isPutt = s.lie === 'green';
        if (!byClub[s.club]) byClub[s.club] = { club: s.club, shots: 0, sgSum: 0, dists: [], putt: isPutt };
        const c = byClub[s.club];
        c.shots++; c.sgSum += s.sg;
        // distance covered toward the hole
        const next = h.shots[i + 1];
        const startU = isPutt ? s.dist : s.dist;                  // start in club's natural unit
        let endU;
        if (!next) endU = 0;                                       // holed out
        else if (isPutt) endU = (next.lie === 'green') ? next.dist : next.dist * 3; // keep feet
        else endU = (next.lie === 'green') ? next.dist / 3 : next.dist;             // convert green ft→yds
        const covered = startU - endU;
        if (isFinite(covered) && covered > 0) c.dists.push(covered);
      });
    });
  });

  const clubsArr = Object.values(byClub).sort((a,b) => {
    return SG_CLUBS.indexOf(a.club) - SG_CLUBS.indexOf(b.club);
  });

  // Range data (R10) sits above the on-course data from Strokes Gained rounds
  if (!clubsArr.length) {
    el.innerHTML = rangeSectionHTML() + `<div class="card">
      <div class="card-title">On-Course Club Data</div>
      <p style="font-size:0.85rem;color:var(--gray-mid);">Log a Strokes Gained round with the optional club field to see how far you hit each club on the course and how many strokes each one gains or loses.</p>
      <button class="btn btn-primary btn-sm" style="margin-top:10px;" onclick="navTo('sg-round')">Track a Round</button>
    </div>`;
    drillAfterRender();
    return;
  }

  const rows = clubsArr.map(c => {
    const avg = c.dists.length ? Math.round(c.dists.reduce((a,b)=>a+b,0)/c.dists.length) : null;
    const long = c.dists.length ? Math.round(Math.max(...c.dists)) : null;
    const unit = c.putt ? 'ft' : 'yds';
    const avgSG = (c.sgSum / c.shots);
    return `<tr>
      <td style="text-align:left;font-weight:700;">${c.club}</td>
      <td>${c.shots}</td>
      <td>${avg!==null ? avg+' '+unit : '—'}</td>
      <td>${long!==null ? long+' '+unit : '—'}</td>
      <td style="color:${avgSG>=0?'var(--green-mid)':'var(--red)'};font-weight:700;">${signed(avgSG, 2)}</td>
    </tr>`;
  }).join('');

  el.innerHTML = rangeSectionHTML() + `
    <div class="card">
      <div class="card-title">On-Course Club Data</div>
      <p style="font-size:0.85rem;color:var(--gray-mid);margin-bottom:14px;">Aggregated from your Strokes Gained rounds. Average distance is how far the ball actually traveled toward the hole. Avg SG is strokes gained per shot with that club.</p>
      <div class="scorecard-wrap">
        <table class="scorecard">
          <thead><tr><th style="text-align:left;">Club</th><th>Shots</th><th>Avg Dist</th><th>Longest</th><th>Avg SG</th></tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
    </div>
  `;
  drillAfterRender();
}

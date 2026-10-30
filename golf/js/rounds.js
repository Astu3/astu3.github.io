// Golf Improvement App — Quick scorecard entry/editing, saving rounds, handicap (WHS), round modal, course autocomplete.
// Classic script: shares globals with the other files; load order is set in golf-improvement-app.html.

// ════════════════════════════════════════════════════════════
// SCORECARD
// ════════════════════════════════════════════════════════════
const DEFAULT_PARS_9  = [4,3,5,4,4,3,4,5,4];
const DEFAULT_PARS_18 = [4,4,3,4,5,3,4,5,4, 4,3,5,4,4,3,5,4,4];

let currentHoleCount = 9;
let editingRoundId = null;   // id of the round being edited, or null when creating

function setHoleCount(n) {
  currentHoleCount = n;
  document.getElementById('toggle-9').classList.toggle('active', n === 9);
  document.getElementById('toggle-18').classList.toggle('active', n === 18);
  document.getElementById('course-par').value    = n === 9 ? 36 : 72;
  document.getElementById('course-rating').value = n === 9 ? 36.0 : 72.0;
  const hint = document.getElementById('rating-hint');
  if (hint) hint.textContent = n === 9
    ? '9-hole rating (≈ half the 18-hole rating, ~35)'
    : '18-hole course rating (~72)';
  buildScorecard();
}

function buildScorecard() {
  const n     = currentHoleCount;
  const pars  = n === 9 ? DEFAULT_PARS_9 : DEFAULT_PARS_18;
  const tbody = document.getElementById('scorecard-body');
  const tfoot = document.getElementById('scorecard-foot');
  tbody.innerHTML = '';
  tfoot.innerHTML = '';

  for (let i = 0; i < n; i++) {
    if (i === 9) {
      const sub = document.createElement('tr');
      sub.className = 'nine-divider';
      sub.id = 'row-out';
      sub.innerHTML = `<td>OUT</td><td id="out-par">—</td><td id="out-score">—</td><td id="out-putts">—</td><td id="out-pen">—</td><td colspan="2" id="out-stats">—</td>`;
      tbody.appendChild(sub);
    }
    const row = document.createElement('tr');
    row.innerHTML = `
      <td>${i+1}</td>
      <td><input type="number" class="par-input"   id="par-${i}"   value="${pars[i]}" min="3" max="6" oninput="updateTotals()" style="width:42px"/></td>
      <td><input type="number" class="score-input" id="score-${i}" min="1" max="15" placeholder="—" oninput="updateTotals()" style="width:52px"/></td>
      <td><input type="number" class="putt-input"  id="putts-${i}" min="0" max="8"  placeholder="—" oninput="updateTotals()" style="width:52px"/></td>
      <td><input type="number" class="pen-input"   id="pen-${i}"   min="0" max="10" placeholder="0" value="0" oninput="updateTotals()" style="width:46px"/></td>
      <td><input type="checkbox" class="fir-input" id="fir-${i}" onchange="updateTotals()"/></td>
      <td><input type="checkbox" class="gir-input" id="gir-${i}" onchange="updateTotals()"/></td>`;
    tbody.appendChild(row);
  }

  if (n === 18) {
    tfoot.innerHTML = `
      <tr class="nine-divider" id="row-in" style="background:var(--gray-light)!important;">
        <td style="color:var(--gray-dark)!important;">IN</td>
        <td id="in-par" style="color:var(--gray-dark)!important;">—</td>
        <td id="in-score" style="color:var(--gray-dark)!important;">—</td>
        <td id="in-putts" style="color:var(--gray-dark)!important;">—</td>
        <td id="in-pen" style="color:var(--gray-dark)!important;">—</td>
        <td colspan="2" id="in-stats" style="color:var(--gray-dark)!important;">—</td>
      </tr>`;
  }

  tfoot.innerHTML += `
    <tr>
      <td>TOTAL</td>
      <td id="total-par">—</td>
      <td id="total-score">—</td>
      <td id="total-putts">—</td>
      <td id="total-pen">—</td>
      <td colspan="2" id="total-stats">—</td>
    </tr>`;

  updateTotals(); // reset summary/footer to match the freshly-built (empty) card
}

function updateTotals() {
  const n = currentHoleCount;
  let outPar=0, inPar=0, outScore=0, inScore=0, outPutts=0, inPutts=0, outPen=0, inPen=0;
  let outFIR=0, inFIR=0, outGIR=0, inGIR=0, outFIRTotal=0, inFIRTotal=0, outGIRTotal=0, inGIRTotal=0;

  for (let i = 0; i < n; i++) {
    const par   = parseInt(document.getElementById(`par-${i}`).value)   || 0;
    const score = parseInt(document.getElementById(`score-${i}`).value) || 0;
    const putts = parseInt(document.getElementById(`putts-${i}`).value) || 0;
    const pen   = parseInt(document.getElementById(`pen-${i}`).value)   || 0;
    const fir   = document.getElementById(`fir-${i}`).checked;
    const gir   = document.getElementById(`gir-${i}`).checked;
    if (i < 9) {
      outPar += par; outScore += score; outPutts += putts; outPen += pen;
      if (fir) outFIR++; if (gir) outGIR++;
      if (par > 3) outFIRTotal++;
      outGIRTotal++;
    } else {
      inPar += par; inScore += score; inPutts += putts; inPen += pen;
      if (fir) inFIR++; if (gir) inGIR++;
      if (par > 3) inFIRTotal++;
      inGIRTotal++;
    }
  }

  const set = (id, val) => { const el = document.getElementById(id); if(el) el.textContent = val; };
  const pct = (a,b) => b ? Math.round(a/b*100)+'%' : '—';
  const relStr = (s, p) => s ? toPar(s, p) : '—';

  set('out-par',   outPar || '—');
  set('out-score', relStr(outScore, outPar));
  set('out-putts', outPutts || '—');
  set('out-pen',   outPen || '—');
  set('out-stats', `FIR:${pct(outFIR,outFIRTotal)} GIR:${pct(outGIR,outGIRTotal)}`);

  if (n === 18) {
    set('in-par',   inPar || '—');
    set('in-score', relStr(inScore, inPar));
    set('in-putts', inPutts || '—');
    set('in-pen',   inPen || '—');
    set('in-stats', `FIR:${pct(inFIR,inFIRTotal)} GIR:${pct(inGIR,inGIRTotal)}`);
  }

  const totPar = outPar+inPar, totScore = outScore+inScore, totPutts = outPutts+inPutts, totPen = outPen+inPen;
  const totFIR = outFIR+inFIR, totFIRTotal = outFIRTotal+inFIRTotal;
  const totGIR = outGIR+inGIR;
  set('total-par',   totPar || '—');
  set('total-score', relStr(totScore, totPar));
  set('total-putts', totPutts || '—');
  set('total-pen',   totPen || '—');
  set('total-stats', `FIR:${pct(totFIR,totFIRTotal)} GIR:${pct(totGIR,n)}`);

  // Live round summary: actual total score, to-par, and projected differential
  set('summary-score', totScore || '—');
  set('summary-topar', totScore ? relStr(totScore, totPar) : '—');
  const rating = parseFloat(document.getElementById('course-rating').value) || (n === 9 ? 36 : 72);
  const slope  = parseInt(document.getElementById('slope-rating').value)    || 113;
  const diff   = (totScore && slope) ? ((totScore - effectiveRating(rating, n)) * 113 / slope).toFixed(1) : null;
  set('summary-diff', diff !== null ? diff : '—');
}

function resetScorecard() {
  document.getElementById('course-name').value  = '';
  document.getElementById('round-notes').value  = '';
  document.getElementById('round-date').value   = todayISO();
  buildScorecard();
}

// ── EDIT A ROUND ───────────────────────────────────────────────
function setEditUIMode(on) {
  const title  = document.getElementById('new-round-title');
  const btn    = document.getElementById('save-round-btn');
  const banner = document.getElementById('edit-banner');
  if (title)  title.textContent  = on ? 'Edit Round' : 'New Round';
  if (btn)    btn.textContent    = on ? '💾 Update Round' : '💾 Save Round';
  if (banner) banner.style.display = on ? 'flex' : 'none';
}

function editRound(id) {
  const r = getRounds().find(x => x.id === id);
  if (!r) return;
  closeModal();
  editingRoundId = id;

  const n = r.holeCount || 18;
  setHoleCount(n); // rebuilds an empty scorecard for n holes

  document.getElementById('course-name').value   = (r.course && r.course !== 'Unknown Course') ? r.course : '';
  document.getElementById('round-date').value    = r.date || todayISO();
  document.getElementById('course-par').value    = r.par;
  document.getElementById('course-rating').value = r.rating;
  document.getElementById('slope-rating').value  = r.slope;
  document.getElementById('round-notes').value   = r.notes || '';

  const holes = r.holes || [];
  for (let i = 0; i < n; i++) {
    const h = holes[i] || {};
    const set = (id, v) => { const el = document.getElementById(id); if (el) el.value = v; };
    set(`par-${i}`,   h.par   ?? '');
    set(`score-${i}`, h.score ?? '');
    set(`putts-${i}`, h.putts ?? '');
    set(`pen-${i}`,   h.pen   ?? 0);
    const fir = document.getElementById(`fir-${i}`); if (fir) fir.checked = !!h.fir;
    const gir = document.getElementById(`gir-${i}`); if (gir) gir.checked = !!h.gir;
  }
  updateTotals();
  setEditUIMode(true);
  showPage('new-round');
}

function cancelEdit() {
  editingRoundId = null;
  setEditUIMode(false);
  resetScorecard();
  showPage('dashboard');
}

// ════════════════════════════════════════════════════════════
// SAVE ROUND
// ════════════════════════════════════════════════════════════
function saveRound() {
  const n      = currentHoleCount;
  const course = document.getElementById('course-name').value.trim()  || 'Unknown Course';
  const date   = document.getElementById('round-date').value           || todayISO();
  const rating = parseFloat(document.getElementById('course-rating').value) || (n === 9 ? 36 : 72);
  const slope  = parseInt(document.getElementById('slope-rating').value)    || 113;
  const notes  = document.getElementById('round-notes').value.trim();

  // Blank holes would otherwise be saved as par with 2 putts, skewing stats
  // and the handicap — make the user confirm that.
  const blank = [];
  for (let i = 0; i < n; i++) {
    if (!(parseInt(document.getElementById(`score-${i}`).value) > 0)) blank.push(i + 1);
  }
  if (blank.length === n) { showToast('⚠️ Enter your scores before saving'); return; }
  if (blank.length && !confirm(`No score entered for hole${blank.length > 1 ? 's' : ''} ${blank.join(', ')}.\n\nSave anyway? Blank holes will be recorded as par with 2 putts.`)) return;

  let holes = [], firCount=0, firTotal=0, girCount=0, puttTotal=0, scoreTotal=0, parTotal=0, penTotal=0;

  for (let i = 0; i < n; i++) {
    const par   = parseInt(document.getElementById(`par-${i}`).value)   || 4;
    const score = parseInt(document.getElementById(`score-${i}`).value) || par;
    const putts = parseInt(document.getElementById(`putts-${i}`).value) || 2;
    const pen   = parseInt(document.getElementById(`pen-${i}`).value)   || 0;
    const fir   = document.getElementById(`fir-${i}`).checked;
    const gir   = document.getElementById(`gir-${i}`).checked;
    holes.push({ par, score, putts, pen, fir, gir });
    scoreTotal += score; parTotal += par; puttTotal += putts; penTotal += pen;
    girCount += gir ? 1 : 0;
    if (par > 3) { firTotal++; if (fir) firCount++; }
  }

  const diff    = parseFloat(((scoreTotal - effectiveRating(rating, n)) * 113 / slope).toFixed(1));
  const xpGained = calcRoundXP(holes);

  const rounds = getRounds();

  // ── EDIT MODE: update the existing round in place ──────────────
  if (editingRoundId !== null) {
    const idx = rounds.findIndex(r => r.id === editingRoundId);
    if (idx === -1) { editingRoundId = null; setEditUIMode(false); return; }
    const oldXP = rounds[idx].xpGained || 0;
    rounds[idx] = {
      ...rounds[idx],
      course, date, rating, slope, notes, holes, holeCount: n,
      score: scoreTotal, par: parTotal, putts: puttTotal, penalties: penTotal,
      firPct: firTotal ? Math.round(firCount/firTotal*100) : 0,
      girPct: Math.round(girCount/n*100),
      diff, xpGained
    };
    saveRounds(rounds);
    saveCourseToDB(rounds[idx]);
    // Adjust profile XP by the delta so totals stay consistent
    awardXP(xpGained - oldXP, 'round-edit');
    // Re-evaluate badges/quests (these only add, never remove)
    checkBadges(getAllRounds());
    checkQuests(getAllRounds());
    showToast('✏️ Round updated');
    editingRoundId = null;
    setEditUIMode(false);
    resetScorecard();
    showPage('dashboard');
    return;
  }

  // ── CREATE MODE: add a new round ───────────────────────────────
  const round = {
    id: Date.now(),
    course, date, rating, slope, notes, holes, holeCount: n,
    score: scoreTotal, par: parTotal, putts: puttTotal, penalties: penTotal,
    firPct: firTotal ? Math.round(firCount/firTotal*100) : 0,
    girPct: Math.round(girCount/n*100),
    diff, xpGained
  };

  rounds.unshift(round);
  saveRounds(rounds);
  saveCourseToDB(round);

  // Award round XP
  awardXP(xpGained, 'round');

  // Check daily tasks (may award bonus XP)
  const bonusTasks = checkTasksForRound(round);

  // Check badges & quests
  checkBadges(getAllRounds());
  checkQuests(getAllRounds());
  onActivity('round'); // weekly goal and streak

  const totalBonus = bonusTasks.reduce((s,t) => s+t.xp, 0);
  let msg = `+${xpGained} XP earned!`;
  if (bonusTasks.length) msg += ` +${totalBonus} task bonus (${bonusTasks.map(t=>t.name).join(', ')})`;
  showToast(msg);

  resetScorecard();
  showPage('dashboard');
}

// ════════════════════════════════════════════════════════════
// HANDICAP
// ════════════════════════════════════════════════════════════
// 18-hole-equivalent score differential for a single round, recomputed from
// score/rating/slope (falls back to a stored diff). Returns null if unusable.
// A 9-hole round needs a 9-hole course rating (~35). Scorecards print the full
// 18-hole rating (~68-77), so users often enter that by mistake — which makes the
// differential wildly negative. If a 9-hole rating clearly looks like an 18-hole
// figure, treat it as one and halve it.
// Golf convention: a better-than-scratch index is written with a plus sign
function hcpStr(v) {
  if (v === null || v === undefined || !isFinite(v)) return '—';
  return v < 0 ? `+${Math.abs(v).toFixed(1)}` : v.toFixed(1);
}

function effectiveRating(rating, holeCount) {
  return (holeCount === 9 && isFinite(rating) && rating > 50) ? rating / 2 : rating;
}

function roundDifferential(r) {
  const score  = Number(r.score);
  let   rating = isFinite(Number(r.rating)) ? Number(r.rating) : Number(r.par);
  const slopeN = (isFinite(Number(r.slope)) && Number(r.slope) > 0) ? Number(r.slope) : 113;
  rating = effectiveRating(rating, r.holeCount);

  // Recompute from score/rating when possible (more reliable + applies the
  // 9-hole correction even to older rounds); otherwise fall back to stored diff.
  let d;
  if (isFinite(score) && isFinite(rating)) {
    d = (score - rating) * 113 / slopeN;
  } else if (typeof r.diff === 'number' && isFinite(r.diff)) {
    d = r.diff;
  } else {
    return null;
  }
  if (!isFinite(d)) return null;
  // Double 9-hole differentials to an 18-hole equivalent (WHS convention)
  return r.holeCount === 9 ? d * 2 : d;
}

function calcHandicap(rounds) {
  if (!rounds.length) return null;

  // Most recent 20 rounds → valid 18-hole-equivalent differentials, sorted low→high
  const diffs = rounds.slice(0, 20)
    .map(roundDifferential)
    .filter(d => d !== null)
    .sort((a, b) => a - b);

  if (!diffs.length) return null;

  const count = diffs.length;
  // WHS Rule 5.2 table: how many of the lowest differentials to average, and
  // the adjustment applied with few scores. 1–2 scores are below the WHS
  // minimum, so they produce a provisional index from the single best score.
  const [take, adj] =
    count <= 2  ? [1, 0]    :
    count === 3 ? [1, -2.0] :
    count === 4 ? [1, -1.0] :
    count === 5 ? [1, 0]    :
    count === 6 ? [2, -1.0] :
    count <= 8  ? [2, 0]    :
    count <= 11 ? [3, 0]    :
    count <= 14 ? [4, 0]    :
    count <= 16 ? [5, 0]    :
    count <= 18 ? [6, 0]    :
    count === 19 ? [7, 0]   : [8, 0];

  const best   = diffs.slice(0, take);
  const avgVal = best.reduce((a, b) => a + b, 0) / take + adj;
  // WHS allows plus handicaps; cap at the 54.0 maximum
  const value  = Math.min(54, Math.round(avgVal * 10) / 10);

  // Official WHS index needs ~54 holes (3 eighteen-hole equivalents); below that it's provisional.
  const equivalents = rounds.slice(0, 20)
    .filter(r => roundDifferential(r) !== null)
    .reduce((s, r) => s + (r.holeCount === 9 ? 0.5 : 1), 0);
  const provisional = equivalents < 3;

  return { value, provisional };
}

// ════════════════════════════════════════════════════════════
// MODAL
// ════════════════════════════════════════════════════════════
// One clickable round in a list (dashboard + history); `detail` extends the date line
function roundRowHTML(r, detail = '') {
  // Shot-by-shot rounds open their strokes-gained summary instead of the round modal
  const open = r.type === 'sg' ? `viewSGRound(${r.sgId})` : `openModal(${r.id})`;
  return `
    <div class="round-row" onclick="${open}" style="cursor:pointer;">
      <div>
        <div class="round-course">${esc(r.course)} <span style="font-size:0.75rem;color:var(--gray-mid);">${r.holeCount || 18}H</span>${r.type === 'sg' ? ' <span class="xp-chip" style="margin-left:4px;background:var(--green-pale);color:var(--green-mid);">Shot-by-shot</span>' : ''}</div>
        <div class="round-date">${formatDate(r.date)}${detail ? ` &nbsp;·&nbsp; ${detail}` : ''}</div>
      </div>
      <div style="display:flex;align-items:center;gap:6px;">
        <div class="score-chip ${toParClass(r.score, r.par)}">${r.score} (${toPar(r.score, r.par)})</div>
        ${r.xpGained ? `<span class="xp-chip">+${r.xpGained} XP</span>` : ''}
      </div>
    </div>`;
}

function openModal(id) {
  const rounds = getRounds();
  const r = rounds.find(x => x.id === id);
  if (!r) return;
  const label = r.score === r.par ? 'Even par' : toPar(r.score, r.par);
  document.getElementById('modal-body').innerHTML = `
    <p><strong>Course:</strong> ${esc(r.course)}</p>
    <p><strong>Date:</strong> ${formatDate(r.date)}</p>
    <p><strong>Holes:</strong> ${r.holeCount || 18}</p>
    <p><strong>Score:</strong> ${r.score} (${label})</p>
    <p><strong>Putts:</strong> ${r.putts}</p>
    <p><strong>Penalty Strokes:</strong> ${roundPenalties(r)}</p>
    <p><strong>GIR:</strong> ${r.girPct}%</p>
    <p><strong>FIR:</strong> ${r.firPct}%</p>
    <p><strong>Differential:</strong> ${(() => { const d = roundDifferential(r); return d === null ? '—' : d.toFixed(1) + (r.holeCount === 9 ? ' (18-hole equivalent)' : ''); })()}</p>
    ${r.xpGained ? `<p><strong>XP Earned:</strong> <span style="color:var(--gold-dark);font-weight:800;">+${r.xpGained} XP</span></p>` : ''}
    ${(r.holes && r.holes.length) ? `<p style="margin-top:10px;"><strong>Scoring:</strong><br>${scoringChipsHTML(r)}</p>` : ''}
    ${r.notes ? `<p style="margin-top:10px;"><strong>Notes:</strong> ${esc(r.notes)}</p>` : ''}
  `;
  document.getElementById('modal-delete-btn').onclick = () => confirmDeleteRound(id);
  document.getElementById('modal-edit-btn').onclick   = () => editRound(id);
  document.getElementById('round-modal').classList.add('open');
}

function closeModal() {
  document.getElementById('round-modal').classList.remove('open');
}

function deleteRound(id) {
  let rounds = getRounds();
  rounds = rounds.filter(r => r.id !== id);
  saveRounds(rounds);
  closeModal();
  showToast('Round deleted');
  const activePage = document.querySelector('.page.active').id;
  if (activePage === 'page-history')   renderHistory();
  if (activePage === 'page-dashboard') renderDashboard();
}

document.getElementById('round-modal').addEventListener('click', function(e) {
  if (e.target === this) closeModal();
});

// ════════════════════════════════════════════════════════════
// CONFIRM DELETE
// ════════════════════════════════════════════════════════════
function confirmDeleteRound(id) {
  closeModal();
  const overlay = document.getElementById('confirm-modal');
  overlay.classList.add('open');
  document.getElementById('confirm-delete-btn').onclick = () => {
    closeConfirmModal();
    deleteRound(id);
  };
}

function closeConfirmModal() {
  document.getElementById('confirm-modal').classList.remove('open');
}

document.getElementById('confirm-modal').addEventListener('click', function(e) {
  if (e.target === this) closeConfirmModal();
});

// ════════════════════════════════════════════════════════════
// COURSE DATABASE  (autocomplete)
// ════════════════════════════════════════════════════════════
function getCourseDB() {
  return loadData(KEYS.courses, {});
}
function saveCourseDB(db) { saveData(KEYS.courses, db); }

function saveCourseToDB(round) {
  if (!round.course || round.course === 'Unknown Course') return;
  const db = getCourseDB();
  db[round.course.toLowerCase()] = {
    name: round.course, rating: round.rating, slope: round.slope,
    par: round.par, holeCount: round.holeCount
  };
  saveCourseDB(db);
}

function filterCourseAutocomplete() {
  const input = document.getElementById('course-name');
  const list  = document.getElementById('course-autocomplete-list');
  if (!input || !list) return;
  const q   = input.value.trim().toLowerCase();
  const db  = getCourseDB();
  const all = Object.values(db);
  const matches = q ? all.filter(c => c.name.toLowerCase().includes(q)) : all;
  if (!matches.length) { list.style.display = 'none'; return; }
  autocompleteMatches = matches;
  list.innerHTML = matches.map((c, i) =>
    `<div class="autocomplete-item" onmousedown="applyCourseAutofill(event, ${i})">
      <div>${esc(c.name)}</div>
      <div class="autocomplete-sub">Par ${c.par} &nbsp;·&nbsp; Rating ${c.rating} &nbsp;·&nbsp; Slope ${c.slope} &nbsp;·&nbsp; ${c.holeCount}H</div>
    </div>`
  ).join('');
  list.style.display = 'block';
}

let autocompleteMatches = [];
function applyCourseAutofill(e, i) {
  e.preventDefault();
  const match = autocompleteMatches[i];
  if (!match) return;
  // setHoleCount rebuilds the card and resets par/rating, so only switch
  // formats when needed, and do it before filling the fields
  if (match.holeCount && match.holeCount !== currentHoleCount) setHoleCount(match.holeCount);
  document.getElementById('course-name').value    = match.name;
  document.getElementById('course-par').value     = match.par;
  document.getElementById('course-rating').value  = match.rating;
  document.getElementById('slope-rating').value   = match.slope;
  updateTotals();
  document.getElementById('course-autocomplete-list').style.display = 'none';
}

document.addEventListener('click', e => {
  const list = document.getElementById('course-autocomplete-list');
  if (list && !list.contains(e.target) && e.target.id !== 'course-name') {
    list.style.display = 'none';
  }
});

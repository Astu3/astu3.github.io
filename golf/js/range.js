// Golf Improvement App — R10 driving-range mode: per-shot launch data and per-club averages.
// Classic script: shares globals with the other files; load order is set in golf-improvement-app.html.

// ════════════════════════════════════════════════════════════
// DRIVING RANGE  (Garmin R10)
// While recording, every R10 shot is logged against the selected club with
// club speed, ball speed, smash factor, launch, direction, spin and club
// delivery (face, path, attack angle). Speeds are stored in mph.
// The R10 doesn't send distance, so carry/total/offline come from the ball
// flight model (ballflight.js), assuming a fairway landing at sea level.
// ════════════════════════════════════════════════════════════
let rangeOn = false;          // logging R10 shots to the range
let rangeSessionStart = 0;    // shots at/after this time are "this session"

function getRangeShots()   { return loadData(KEYS.range, []); }
const RANGE_MAX_SHOTS = 6000; // newest kept; averages and club profiles only need recent shots
function saveRangeShots(s) { saveData(KEYS.range, s.length > RANGE_MAX_SHOTS ? s.slice(0, RANGE_MAX_SHOTS) : s); }

const RANGE_CLUBS = SG_CLUBS.filter(c => c !== 'Putter');
function rangeClub()       { return getPrefs().rangeClub || 'Driver'; }
function setRangeClub(c)   { setPref('rangeClub', c); renderClubs(); }

function rangeToggle() {
  if (!rangeOn && !R10.isConnected()) { showToast('📡 Connect the R10 first'); return; }
  if (!rangeOn && drillActive()) { showToast('Finish or quit the drill first — its shots are recorded there'); return; }
  rangeOn = !rangeOn;
  if (rangeOn) rangeSessionStart = Date.now();
  renderClubs();
}

function rangeRecordShot(shot) {
  if (!shot.clubMph && !shot.ballMph) return; // nothing was measured
  const rec = {
    id: Date.now(), at: shot.at, date: todayISO(), club: rangeClub(),
    clubMph: shot.clubMph, ballMph: shot.ballMph,
    smash: shot.clubMph && shot.ballMph ? Math.round(shot.ballMph / shot.clubMph * 100) / 100 : null,
    launch: shot.launch, direction: shot.direction,
    spin: shot.spin !== null ? Math.round(shot.spin) : null,
    face: shot.face, path: shot.path, attack: shot.attack, spinAxis: shot.spinAxis,
    ...rangeDistances(shot),
  };
  const all = getRangeShots(); all.unshift(rec); saveRangeShots(all);
  onActivity('range');
  if (document.getElementById('page-clubs').classList.contains('active')) renderClubs();
  else showToast(`📡 ${rec.club}: ${rec.ballMph ? `${toUnit(rec.ballMph)} ${unitLabel()} ball` : `${toUnit(rec.clubMph)} ${unitLabel()} club`}`);
}

// Carry/total/offline in yards from the ball data (null without a ball)
function rangeDistances(shot) {
  if (!shot.ballMph || shot.launch === null || shot.launch === undefined) return { carry: null, total: null, offline: null };
  const f = simulateShot({ ballMph: shot.ballMph, launch: shot.launch, direction: shot.direction || 0,
                           spin: shot.spin || 0, spinAxis: shot.spinAxis || 0 }, 'fairway');
  const r1 = v => Math.round(v * 10) / 10;
  return { carry: r1(f.carry), total: r1(f.total), offline: r1(f.totalOffline) };
}

function rangeDeleteLast() {
  const all = getRangeShots();
  if (!all.length || all[0].at < rangeSessionStart) return;
  all.shift(); saveRangeShots(all); renderClubs();
}

function rangeClearAll() {
  if (!confirm('Delete all saved range shots? This can\'t be undone.')) return;
  saveRangeShots([]); renderClubs();
}

// ── Formatting ─────────────────────────────────────────────────
const rangeAvg = (shots, key) => {
  const v = shots.map(s => s[key]).filter(x => x !== null && x !== undefined && isFinite(x));
  return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null;
};
const fmtSpd   = mph => mph === null ? '—' : `${Math.round(toUnit(mph))}`;
const fmtDeg   = d => d === null || d === undefined ? '—' : `${(Math.round(d * 10) / 10).toFixed(1)}°`;
// Horizontal angles: positive = right of target, negative = left
const fmtSide  = d => d === null || d === undefined ? '—' : `${Math.abs(Math.round(d * 10) / 10).toFixed(1)}° ${d > 0.05 ? 'R' : d < -0.05 ? 'L' : ''}`.trim();
const fmtSmash = s => s === null ? '—' : s.toFixed(2);
const fmtSpin  = s => s === null ? '—' : Math.round(s).toLocaleString();
const fmtYds   = y => y === null || y === undefined ? '—' : `${Math.round(y)}`;
const fmtOff   = y => y === null || y === undefined ? '—' : Math.abs(y) < 0.5 ? 'on line' : `${Math.round(Math.abs(y))} ${y > 0 ? 'R' : 'L'}`;

// ── Screen (top of the Clubs page) ─────────────────────────────
function rangeSectionHTML() {
  const connected = R10.isConnected();
  if (rangeOn && !connected) rangeOn = false; // connection dropped
  const all = getRangeShots();
  const club = rangeClub(), unit = unitLabel();
  const session = all.filter(s => s.at >= rangeSessionStart && rangeSessionStart);
  const last = rangeOn ? session[0] : null;

  const chips = RANGE_CLUBS.map(c => `<button class="range-chip ${c === club ? 'active' : ''}" onclick="setRangeClub('${c}')">${c}</button>`).join('');

  const tile = (label, value, sub = '') => `<div class="range-tile"><div class="range-tile-value">${value}</div><div class="range-tile-label">${label}${sub ? ` <span>${sub}</span>` : ''}</div></div>`;
  const lastHTML = last ? `
    <div class="range-tiles">
      ${tile('Carry', fmtYds(last.carry), 'yds')}
      ${tile('Total', fmtYds(last.total), 'yds')}
      ${tile('Offline', fmtOff(last.offline))}
      ${tile('Club speed', fmtSpd(last.clubMph), unit)}
      ${tile('Ball speed', fmtSpd(last.ballMph), unit)}
      ${tile('Smash', fmtSmash(last.smash))}
      ${tile('Launch', fmtDeg(last.launch))}
      ${tile('Spin', fmtSpin(last.spin), 'rpm')}
      ${tile('Direction', fmtSide(last.direction))}
    </div>
    <div style="font-size:0.8rem;color:var(--gray-mid);margin-top:8px;">${esc(last.club)} · face ${fmtSide(last.face)} · path ${fmtSide(last.path)} · attack ${last.attack === null ? '—' : `${last.attack > 0 ? '+' : ''}${fmtDeg(last.attack)}`}</div>`
    : rangeOn ? `<div class="spd-sub" style="text-align:center;padding:14px 0;">Waiting for your first ${esc(club)} shot…</div>` : '';

  const sessionTable = session.length ? `
    <div class="scorecard-wrap" style="margin-top:14px;"><table class="scorecard">
      <thead><tr><th style="text-align:left;">Club</th><th>Carry</th><th>Total</th><th>Offline</th><th>Club ${unit}</th><th>Ball ${unit}</th><th>Smash</th><th>Launch</th><th>Spin</th></tr></thead>
      <tbody>${session.slice(0, 15).map(s => `<tr>
        <td style="text-align:left;">${esc(s.club)}</td><td>${fmtYds(s.carry)}</td><td>${fmtYds(s.total)}</td><td>${fmtOff(s.offline)}</td>
        <td>${fmtSpd(s.clubMph)}</td><td>${fmtSpd(s.ballMph)}</td>
        <td>${fmtSmash(s.smash)}</td><td>${fmtDeg(s.launch)}</td><td>${fmtSpin(s.spin)}</td>
      </tr>`).join('')}</tbody>
    </table></div>
    <div style="display:flex;justify-content:space-between;align-items:center;margin-top:8px;font-size:0.78rem;color:var(--gray-mid);">
      <span>${session.length} shot${session.length > 1 ? 's' : ''} this session${session.length > 15 ? ' (latest 15 shown)' : ''}</span>
      <button class="btn btn-sm" style="background:none;color:var(--gray-mid);padding:2px 6px;" onclick="rangeDeleteLast()">Delete last shot</button>
    </div>` : '';

  // Per-club averages over every saved range shot
  const byClub = {};
  all.forEach(s => (byClub[s.club] = byClub[s.club] || []).push(s));
  const clubs = Object.keys(byClub).sort((a, b) => SG_CLUBS.indexOf(a) - SG_CLUBS.indexOf(b));
  const averages = clubs.length ? `
    <div class="card">
      <div class="card-title">Launch Averages by Club · all range shots</div>
      <div class="scorecard-wrap"><table class="scorecard">
        <thead><tr><th style="text-align:left;">Club</th><th>Shots</th><th>Carry</th><th>Total</th><th>Club ${unit}</th><th>Ball ${unit}</th><th>Smash</th><th>Launch</th><th>Spin</th><th>Attack</th></tr></thead>
        <tbody>${clubs.map(c => { const s = byClub[c], carry = rangeAvg(s, 'carry');
          return `<tr>
          <td style="text-align:left;font-weight:700;">${esc(c)}</td><td>${s.length}</td>
          <td style="font-weight:700;">${fmtYds(carry)}</td><td>${fmtYds(rangeAvg(s, 'total'))}</td>
          <td>${fmtSpd(rangeAvg(s, 'clubMph'))}</td><td>${fmtSpd(rangeAvg(s, 'ballMph'))}</td>
          <td>${fmtSmash(rangeAvg(s, 'smash'))}</td><td>${fmtDeg(rangeAvg(s, 'launch'))}</td>
          <td>${fmtSpin(rangeAvg(s, 'spin'))}</td><td>${fmtDeg(rangeAvg(s, 'attack'))}</td>
        </tr>`; }).join('')}</tbody>
      </table></div>
      <div style="display:flex;justify-content:space-between;align-items:center;margin-top:8px;font-size:0.76rem;color:var(--gray-mid);">
        <span>Every saved shot, mishits included (My Bag above uses recent clean strikes). Ball-flight numbers need a real ball.</span>
        <button class="btn btn-sm" style="background:none;color:var(--gray-mid);padding:2px 6px;" onclick="rangeClearAll()">Clear range data</button>
      </div>
    </div>` : '';

  return `
    ${r10PanelHTML()}
    ${drillsHTML()}
    <div class="card">
      <div style="display:flex;justify-content:space-between;align-items:center;gap:10px;margin-bottom:12px;">
        <div class="card-title" style="margin:0;">Driving Range · R10</div>
        <button class="btn btn-sm ${rangeOn ? 'btn-danger' : 'btn-primary'}" onclick="rangeToggle()" ${!connected && !rangeOn ? 'disabled title="Connect the R10 first"' : ''}>${rangeOn ? '■ Stop recording' : '● Start recording'}</button>
      </div>
      <p style="font-size:0.82rem;color:var(--gray-mid);margin-bottom:10px;">${connected
        ? 'Pick the club you\'re hitting, start recording, and every shot is logged with its launch data.'
        : 'Connect the R10 above to log every range shot with club speed, ball speed, smash factor, launch and spin.'}</p>
      <div class="range-chips">${chips}</div>
      ${lastHTML}
      ${sessionTable}
    </div>
    ${bagSectionHTML()}
    ${averages}
  `;
}

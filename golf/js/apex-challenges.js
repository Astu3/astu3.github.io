// Golf Improvement App — Apex challenges: five-ball tests of the course's signature shots.
// Classic script: shares globals with the other files; load order is set in golf-improvement-app.html.

// ════════════════════════════════════════════════════════════
// APEX CHALLENGES
// Each challenge sets up one shot on one hole (from a tee or a spot on the
// fairway) and gives five balls. Successes earn a medal (2 bronze, 3 silver,
// 4+ gold); green-finding challenges also track your closest ball. Best
// results are saved, medals pay XP once each, and feed the Apex quests and badges.
// `success(res, h)` judges a resolved shot (see ceResolveShot).
// ════════════════════════════════════════════════════════════
const APEX_CH_BALLS = 5;
const APEX_CH_MEDALS = [{ min: 4, key: 'gold', emoji: '🥇', xp: 200 }, { min: 3, key: 'silver', emoji: '🥈', xp: 100 }, { min: 2, key: 'bronze', emoji: '🥉', xp: 50 }];
const apexInPlay = res => !res.penalty && !res.events.length && ['fairway', 'rough', 'green', 'tee'].includes(res.surface);
const apexOnGreen = res => !res.penalty && res.surface === 'green';

const APEX_CHALLENGES = [
  { id: 'gate', hole: 1, name: 'Thread the Gate', from: { tee: 'temple' }, green: false,
    desc: 'Drive between the two great trees and find the fairway.',
    success: res => !res.penalty && !res.events.length && res.surface === 'fairway' },
  { id: 'vines', hole: 7, name: 'Under the Vines', from: { tee: 'temple' }, green: false,
    desc: 'Keep the tee shot under the vines (they hang from 45 ft) and in play. A punch is your friend.',
    success: apexInPlay },
  { id: 'well', hole: 6, name: 'The Sacrificial Well', from: { tee: 'temple' }, green: true,
    desc: 'Find the island green. There is nowhere else to be.', success: apexOnGreen },
  { id: 'leap', hole: 15, name: "Jaguar's Leap", from: { tee: 'temple' }, green: false,
    desc: 'Carry the gorge — about 195 yards — onto the platform fairway.', success: apexInPlay },
  { id: 'eclipse', hole: 12, name: 'Eclipse', from: { tee: 'temple' }, green: true,
    desc: 'A long iron across the dark ravine. Hit the green.', success: apexOnGreen },
  { id: 'altar', hole: 16, name: 'Over the Altar', from: { tee: 'temple' }, green: true,
    desc: 'The canopy hides the green: get over 58 feet as you pass it, and hold the green.', success: apexOnGreen },
  { id: 'cathedral', hole: 14, name: 'Cathedral Approach', from: { s: 280, side: 4, lie: 'fairway' }, green: true,
    desc: 'From 150 yards, come in under the canopy over the green — land short and run it on.', success: apexOnGreen },
  { id: 'summit', hole: 18, name: 'The Summit', from: { s: 560, side: -3, lie: 'fairway' }, green: true,
    desc: 'An uphill approach to the summit green. Come up short and it rolls back down.', success: apexOnGreen },
];

function getApexChallengeBest()     { return loadData(KEYS.apexChallenges, {}); }
function saveApexChallengeBest(b)   { saveData(KEYS.apexChallenges, b); }
function apexChMedal(made)          { return APEX_CH_MEDALS.find(m => made >= m.min) || null; }
function apexChallengeDef(id)       { return APEX_CHALLENGES.find(c => c.id === id); }

// Where a challenge's shot starts
function apexChallengeStart(c) {
  const h = apexCourse().holes[c.hole - 1];
  if (c.from.tee) return { ball: h.tees[c.from.tee], lie: 'tee', tee: c.from.tee };
  return { ball: ceAt(h.path, c.from.s, c.from.side || 0), lie: c.from.lie || 'fairway', tee: 'temple' };
}

function apexStartChallenge(id) {
  const c = apexChallengeDef(id); if (!c) return;
  const st = apexChallengeStart(c);
  apexViewId = null;
  apex = {
    id: Date.now(), tee: st.tee, date: todayISO(), target: sgTargetDefault(),
    first: c.hole - 1, last: c.hole - 1, holeIdx: c.hole - 1,
    holes: apexCourse().holes.map(() => ({ shots: [], strokes: 0, done: false })),
    club: 'Driver', shotType: 'normal', power: 100,
    challenge: { id, results: [] },
  };
  apexStartHole(st);
}

// Called when a challenge shot finishes animating
function apexChallengeShotDone(res) {
  const c = apexChallengeDef(apex.challenge.id), h = apexHole();
  const ok = !!c.success(res, h);
  const ft = !res.penalty && res.surface === 'green' ? Math.round(ceDist(res.rest, h.pin) * 3) : null;
  apex.challenge.results.push({ ok, ft });
  const left = APEX_CH_BALLS - apex.challenge.results.length;
  showToast(ok ? `✅ ${ft !== null ? ft + ' ft from the hole' : 'Made it!'}` : `❌ ${res.events[0] || ({ rough: 'In the rough', sand: 'In the bunker', fairway: 'Fairway — but not the target', green: 'On the green — but not the target' }[res.surface]) || 'Missed'}`);
  if (left > 0) { // next ball from the same spot; keep the club and settings the player chose
    const st = apexChallengeStart(c);
    apex.ball = st.ball; apex.lie = st.lie;
    apexSave(); renderApex();
    return;
  }
  apexFinishChallenge();
}

function apexFinishChallenge() {
  const c = apexChallengeDef(apex.challenge.id), rs = apex.challenge.results;
  const made = rs.filter(r => r.ok).length, closest = Math.min(...rs.filter(r => r.ft !== null).map(r => r.ft));
  const medal = apexChMedal(made);
  const all = getApexChallengeBest(), prev = all[c.id] || { made: 0, closest: null, plays: 0, medals: [] };
  const rec = { made: Math.max(prev.made, made), plays: prev.plays + 1, medals: prev.medals || [],
                closest: isFinite(closest) ? Math.min(prev.closest ?? Infinity, closest) : prev.closest };
  // XP once per medal level reached (bronze, silver, gold)
  let xp = 0;
  APEX_CH_MEDALS.filter(m => made >= m.min && !rec.medals.includes(m.key)).forEach(m => { rec.medals.push(m.key); xp += m.xp; });
  all[c.id] = rec; saveApexChallengeBest(all);
  if (xp) awardXP(xp, 'apex challenge');
  const newBest = made > prev.made;
  apex.holeResult = {
    name: medal ? `${medal.emoji} ${made} of ${APEX_CH_BALLS}` : `${made} of ${APEX_CH_BALLS}`,
    how: `${c.name}${medal ? ` · ${medal.key} medal` : ' · 2 for a medal'}${newBest && prev.plays ? ' · new best!' : ''}${isFinite(closest) ? ` · closest ${closest} ft` : ''}${xp ? ` · +${xp} XP` : ''}`,
  };
  if (medal) apexSound('chime', 200, { level: made >= 4 ? 3 : made >= 3 ? 2 : 1 });
  onActivity('apex');
  apexSave(); renderApex();
}

function apexChallengeAgain() { const id = apex.challenge.id; apexClear(); apexStartChallenge(id); }
function apexChallengeQuit()  { apexClear(); renderApex(); }

// Status line shown above the map during a challenge
function apexChallengeBarHTML() {
  const c = apexChallengeDef(apex.challenge.id), rs = apex.challenge.results;
  const dots = Array.from({ length: APEX_CH_BALLS }, (_, i) => rs[i] ? (rs[i].ok ? '✅' : '❌') : '⚪').join(' ');
  return `<div class="apex-ch-bar"><div><strong>${esc(c.name)}</strong> <span class="apex-hole-meta">· ${esc(c.desc)}</span></div>
    <div class="apex-ch-dots" aria-label="${rs.filter(r => r.ok).length} made of ${rs.length}">${dots}</div></div>`;
}

// The challenge list on the Apex home screen
function apexChallengesHTML() {
  const best = getApexChallengeBest();
  return `<div class="card">
    <div class="card-title">Challenges</div>
    <p style="font-size:0.84rem;color:var(--gray-mid);margin-bottom:10px;">Five balls at one of the course's signature shots. Make 2 for bronze, 3 for silver, 4 for gold — each medal pays XP once.</p>
    ${APEX_CHALLENGES.map(c => {
      const b = best[c.id], m = b ? apexChMedal(b.made) : null;
      return `<div class="apex-ch-row">
        <div class="apex-ch-medal">${m ? m.emoji : '·'}</div>
        <div style="flex:1;min-width:0;"><strong>${esc(c.name)}</strong> <span class="apex-hole-meta">Hole ${c.hole}</span>
          <div class="apex-hole-meta">${esc(c.desc)}</div>
          ${b ? `<div class="apex-hole-meta">Best ${b.made}/${APEX_CH_BALLS}${c.green && b.closest !== null && b.closest !== undefined ? ` · closest ${b.closest} ft` : ''} · played ${b.plays}×</div>` : ''}</div>
        <button class="btn btn-sm btn-primary" onclick="apexStartChallenge('${c.id}')">Play</button>
      </div>`;
    }).join('')}
  </div>`;
}

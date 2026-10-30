// Golf Improvement App — Speed extras: the distance check (speed → yards), the drill guide,
// racing your ghost (last session) and the weekly speed challenge.
// Classic script: shares globals with the other files; load order is set in golf-improvement-app.html.

// ════════════════════════════════════════════════════════════
// 1. DISTANCE CHECK
// Five real driver balls with the R10: club speed, ball speed, smash, launch,
// spin, carry and total (from the ball-flight model). Repeated now and then,
// it shows what your speed gains are worth in yards, alongside the drives
// you actually hit on the course (from strokes-gained rounds).
// ════════════════════════════════════════════════════════════
function spdDistanceSets() {
  return [spdSet('warmup', 'Driver', 3, 20), { ...spdSet('test', 'Driver', 5, 40), record: true, ball: true }];
}
// Attach the ball data from an R10 shot to the swing just recorded (distance check)
function spdAttachBall(sw, shot) {
  if (!shot || !shot.ballMph || shot.launch === null) return;
  const d = rangeDistances(shot);
  Object.assign(sw, { ballMph: shot.ballMph, launch: shot.launch, spin: shot.spin, carry: d.carry, total: d.total, offline: d.offline,
                      smash: shot.clubMph ? Math.round(shot.ballMph / shot.clubMph * 100) / 100 : null });
  if (typeof rangeLogDrillShot === 'function') rangeLogDrillShot(shot, 'Driver'); // your real driver numbers feed Apex too
}
// Summary of a distance check's ball swings
function spdDistanceSummary(swings) {
  const b = swings.filter(w => !w.warmup && w.ballMph);
  if (!b.length) return null;
  const avg = k => { const v = b.map(w => w[k]).filter(x => x !== null && x !== undefined); return v.length ? v.reduce((a, x) => a + x, 0) / v.length : null; };
  return { n: b.length, club: avg('mph'), ball: avg('ballMph'), smash: avg('smash'), launch: avg('launch'), spin: avg('spin'), carry: avg('carry'), total: avg('total'),
           bestCarry: Math.max(...b.map(w => w.carry || 0)) };
}
function spdDistanceChecks() {
  return getSpeedSessions().filter(s => s.programId === 'distance' && s.distance).map(s => ({ date: s.date, ...s.distance }));
}
// What a club speed is worth with YOUR strike (smash, launch, spin from your latest check)
function spdDistanceWithYourStrike(clubMph) {
  const c = spdDistanceChecks()[0];
  if (!c || !c.smash) return spdDistance(clubMph);
  const r = simulateShot({ ballMph: clubMph * c.smash, launch: c.launch || 13, spin: c.spin || 2600 }, 'fairway');
  return { carry: Math.round(r.carry), total: Math.round(r.total) };
}
// Drives on the course: tee shots on par 4s and 5s in strokes-gained rounds (yards covered)
function spdCourseDrives() {
  const out = [];
  getSGRounds().filter(r => r.completed !== false).forEach(r => (r.holes || []).forEach(h => {
    const s = h.shots || [];
    if (h.par >= 4 && s[0] && s[0].lie === 'tee' && s[1] && s[1].lie !== 'green' && s[0].club === 'Driver') {
      const d = s[0].dist - s[1].dist; if (d > 120 && d < 400) out.push({ date: r.date, d });
    }
  }));
  return out;
}
function spdDistanceDoneHTML(sum, prev) {
  if (!sum) return '<div class="spd-sub">No ball data was recorded — the distance check needs real balls hit with the R10 on.</div>';
  const unit = unitLabel(), d = v => v === null ? '—' : Math.round(v);
  return `<div class="spd-profile-result">
    <div class="card-title" style="margin:14px 0 6px;color:inherit;">Distance check · ${sum.n} balls</div>
    <div class="spd-dist-grid">
      <div><b>${toUnit(sum.club)}</b><span>club ${unit}</span></div><div><b>${toUnit(sum.ball)}</b><span>ball ${unit}</span></div>
      <div><b>${sum.smash ? sum.smash.toFixed(2) : '—'}</b><span>smash</span></div><div><b>${d(sum.carry)}</b><span>avg carry</span></div>
      <div><b>${d(sum.total)}</b><span>avg total</span></div><div><b>${d(sum.bestCarry)}</b><span>best carry</span></div>
    </div>
    ${prev ? `<div class="spd-note" style="color:inherit;">Since ${formatDate(prev.date)}: club ${sum.club - prev.club >= 0 ? '+' : ''}${(toUnit(sum.club) - toUnit(prev.club)).toFixed(1)} ${unit}, carry ${sum.carry - prev.carry >= 0 ? '+' : ''}${Math.round(sum.carry - prev.carry)} yds.</div>` : ''}
    ${sum.smash && sum.smash < 1.42 ? `<div class="spd-note" style="color:inherit;">Smash ${sum.smash.toFixed(2)}: centring the strike (1.45+) would add distance without any extra speed.</div>` : ''}
  </div>`;
}
function spdDistancePanelHTML() {
  const checks = spdDistanceChecks(), drives = spdCourseDrives(), unit = unitLabel();
  if (!checks.length && !drives.length) return '';
  const first = checks[checks.length - 1], last = checks[0], pb = spdPB();
  const gain = first && last && first !== last ? { mph: last.club - first.club, carry: last.carry - first.carry } : null;
  const recentDrives = drives.slice(-10), earlyDrives = drives.slice(0, Math.min(10, Math.floor(drives.length / 2)));
  const avgD = list => list.length ? Math.round(list.reduce((a, x) => a + x.d, 0) / list.length) : null;
  return `<div class="spd-insight"><div class="apex-subtitle">Speed → distance</div>
    ${checks.length ? `<div class="scorecard-wrap"><table class="scorecard"><thead><tr><th style="text-align:left;">Distance check</th><th>Club</th><th>Ball</th><th>Smash</th><th>Carry</th><th>Total</th></tr></thead>
      <tbody>${checks.slice(0, 6).map(c => `<tr><td style="text-align:left;">${formatDate(c.date)}</td><td>${toUnit(c.club)}</td><td>${toUnit(c.ball)}</td><td>${c.smash ? c.smash.toFixed(2) : '—'}</td><td>${Math.round(c.carry)}</td><td>${Math.round(c.total)}</td></tr>`).join('')}</tbody></table></div>` : ''}
    ${gain ? `<div class="spd-note">• Since your first check: <b>${gain.mph >= 0 ? '+' : ''}${(toUnit(last.club) - toUnit(first.club)).toFixed(1)} ${unit}</b> club speed = <b>${gain.carry >= 0 ? '+' : ''}${Math.round(gain.carry)} yds</b> carry.</div>` : ''}
    ${pb && last ? `<div class="spd-note">• With your strike, your training PB of ${toUnit(pb)} ${unit} is worth about <b>${spdDistanceWithYourStrike(pb).carry} yds carry</b> — the next step is moving it from the training session to the ball.</div>` : ''}
    ${drives.length >= 3 ? `<div class="spd-note">• On the course (strokes-gained rounds, driver tee shots): ${avgD(recentDrives)} yds on average${earlyDrives.length >= 3 && drives.length >= 8 ? `, up from ${avgD(earlyDrives)} early on` : ''}.</div>` : ''}
    ${!checks.length ? `<div class="spd-note">Take a distance check (5 balls with the R10) to connect your speed to real yards.</div>` : ''}
  </div>`;
}

// ════════════════════════════════════════════════════════════
// 2. DRILL GUIDE
// Short coaching cards: setup, what to feel, common faults, with a simple
// top-down diagram of the feet and the swing direction.
// ════════════════════════════════════════════════════════════
const SPD_GUIDE = {
  warmup: { title: 'Warm-up', setup: ['Normal stance and grip, driver or stick.'], cues: ['Smooth and loose, about 70% effort', 'Build the speed swing by swing'],
            faults: ['Going all-out on the first swing'], art: 'normal' },
  normal: { title: 'Normal stance', setup: ['Your usual driver stance and grip.', 'No ball needed: swing at a spot or a tee.'],
            cues: ['Fastest swing you can make — speed is the only goal', 'Let the club go: a full, free finish', 'Hear the "whoosh" past the bottom, not before it'],
            faults: ['Steering it like a golf shot', 'Decelerating to keep balance'], art: 'normal' },
  step:   { title: 'Step drill', setup: ['Start with your feet together.', 'As the backswing starts, step toward the target with your lead foot.'],
            cues: ['Plant the lead foot before your arms come down', 'Push off the ground into the downswing', 'Then swing as fast as you can'],
            faults: ['Stepping and swinging at the same time', 'A tiny step: make it a real stride'], art: 'step' },
  opposite: { title: 'Opposite side', setup: ['Turn around and set up as a golfer of the other hand would.', 'Hands swapped too.'],
            cues: ['Full speed, even if it feels clumsy', 'It balances the body and trains speed in both directions'],
            faults: ['Going easy because it feels strange'], art: 'opposite' },
  lead:   { title: 'Lead arm only', setup: ['Lead hand only (left for right-handers), trail hand behind your back.', 'Light or medium setting.'],
            cues: ['Pull the club through with the lead arm', 'Keep the wrist firm, let it release naturally'],
            faults: ['Using the body to make up for the arm', 'Too heavy a setting to keep it fast'], art: 'lead' },
  trail:  { title: 'Trail arm only', setup: ['Trail hand only (right for right-handers), lead hand off the club.', 'Light or medium setting.'],
            cues: ['Throw the club at the target with the trail arm', 'Like a sidearm throw: speed past the ball'],
            faults: ['Pushing slowly instead of throwing', 'Losing your posture'], art: 'trail' },
  test:   { title: 'Speed test', setup: ['Normal stance, driver.'], cues: ['All-out swings — your best one counts', 'Full rest between swings'], faults: ['Rushing between swings'], art: 'normal' },
};
// A top-down sketch: feet, the ball, the swing direction (and the step / the hand used)
function spdGuideArtSVG(kind) {
  const foot = (x, y, flip) => `<ellipse cx="${x}" cy="${y}" rx="7" ry="13" fill="#2d6a4f" transform="rotate(${flip ? -12 : 12} ${x} ${y})"/>`;
  const arrow = (x1, x2, y) => `<path d="M${x1},${y} Q${(x1 + x2) / 2},${y - 26} ${x2},${y}" fill="none" stroke="#e0a43a" stroke-width="3" marker-end="url(#ah)"/>`;
  const target = '<text x="150" y="16" font-size="10" fill="var(--gray-mid)" text-anchor="end">target →</text>';
  const ball = '<circle cx="80" cy="70" r="4" fill="#fff" stroke="#777"/>';
  const parts = {
    normal: foot(62, 92) + foot(98, 92, true) + ball + arrow(40, 125, 58),
    step: foot(80, 92) + foot(88, 92, true) + `<ellipse cx="125" cy="92" rx="7" ry="13" fill="none" stroke="#2d6a4f" stroke-dasharray="3 3"/><path d="M95,100 L118,100" stroke="#2d6a4f" stroke-width="2" marker-end="url(#ah2)"/>` + ball + arrow(40, 125, 58),
    opposite: foot(62, 92) + foot(98, 92, true) + ball + arrow(125, 40, 58).replace('#e0a43a', '#2b6cb0') + '<text x="10" y="16" font-size="10" fill="var(--gray-mid)">← swing this way</text>',
    lead: foot(62, 92) + foot(98, 92, true) + ball + arrow(40, 125, 58) + '<text x="80" y="122" font-size="11" text-anchor="middle" fill="#2d6a4f" font-weight="700">lead hand only</text>',
    trail: foot(62, 92) + foot(98, 92, true) + ball + arrow(40, 125, 58) + '<text x="80" y="122" font-size="11" text-anchor="middle" fill="#2d6a4f" font-weight="700">trail hand only</text>',
  };
  return `<svg class="spd-guide-art" viewBox="0 0 160 128" role="img" aria-label="Diagram: ${kind}">
    <defs><marker id="ah" markerWidth="8" markerHeight="8" refX="6" refY="4" orient="auto"><path d="M0,0 L8,4 L0,8 z" fill="#e0a43a"/></marker>
          <marker id="ah2" markerWidth="8" markerHeight="8" refX="6" refY="4" orient="auto"><path d="M0,0 L8,4 L0,8 z" fill="#2d6a4f"/></marker></defs>
    <rect x="0" y="0" width="160" height="128" rx="10" fill="var(--green-pale)"/>${kind === 'opposite' ? '' : target}${parts[kind] || parts.normal}</svg>`;
}
function spdGuideCardHTML(drill, compact = false) {
  const g = SPD_GUIDE[drill] || SPD_GUIDE.normal;
  return `<div class="spd-guide${compact ? ' compact' : ''}">
    ${spdGuideArtSVG(g.art)}
    <div class="spd-guide-body">
      <div class="spd-guide-title">${g.title}</div>
      <div class="spd-guide-h">Set up</div><ul>${g.setup.map(x => `<li>${x}</li>`).join('')}</ul>
      <div class="spd-guide-h">Feel</div><ul>${g.cues.map(x => `<li>${x}</li>`).join('')}</ul>
      ${compact ? '' : `<div class="spd-guide-h">Avoid</div><ul>${g.faults.map(x => `<li>${x}</li>`).join('')}</ul>`}
    </div>
  </div>`;
}
function spdGuideLibraryHTML() {
  return `<div class="card"><details><summary class="card-title" style="cursor:pointer;margin:0;">📖 Drill Guide</summary>
    <p style="font-size:0.82rem;color:var(--gray-mid);margin:8px 0 10px;">How to do each drill — the coach also shows the card before a drill starts.</p>
    ${['normal', 'step', 'opposite', 'lead', 'trail', 'warmup'].map(d => spdGuideCardHTML(d)).join('')}</details></div>`;
}

// ════════════════════════════════════════════════════════════
// 3. GHOST: race your last session, set by set
// The ghost is your most recent session of the same program (else the most
// recent one with the same tool and drill). Each set is matched to the ghost's
// set with the same tool and drill, in order; swing n races swing n.
// ════════════════════════════════════════════════════════════
function spdPickGhost() {
  const all = getSpeedSessions().filter(s => s.swings && s.swings.some(w => !w.warmup && w.mph));
  return all.find(s => s.programId === spd.programId) || all[0] || null;
}
function spdGhostSet(setIdx) {
  if (spd.ghostSets && setIdx in spd.ghostSets) return spd.ghostSets[setIdx];
  spd.ghostSets = spd.ghostSets || {};
  if (spd.ghost === undefined) spd.ghost = spdPickGhost();
  const g = spd.ghost, set = spd.sets[setIdx];
  let res = null;
  if (g && set.record && set.drill !== 'warmup') {
    const k = spdKey(set), nth = spd.sets.slice(0, setIdx).filter(s => s.record && spdKey(s) === k).length; // which occurrence of this tool+drill
    const gSets = {}; g.swings.filter(w => !w.warmup && w.mph && spdKey(w) === k).forEach(w => (gSets[w.set] = gSets[w.set] || []).push(w.mph));
    const ordered = Object.keys(gSets).map(Number).sort((a, b) => a - b).map(i => gSets[i]);
    res = ordered[nth] || ordered[ordered.length - 1] || null;
  }
  spd.ghostSets[setIdx] = res;
  return res;
}
// Called after each measured swing: returns words for the coach at the end of a set
function spdGhostAfterSwing(sw) {
  const gs = spdGhostSet(sw.set);
  if (!gs || sw.warmup) return '';
  const gv = gs[Math.min(gs.length - 1, sw.rep - 1)];
  sw.ghost = gv;
  const set = spd.sets[sw.set];
  if (sw.rep < set.reps && spd.rep < set.reps) return '';
  const mine = spd.swings.filter(w => w.set === sw.set && w.ghost);
  if (!mine.length) return '';
  const d = mine.reduce((a, w) => a + w.mph - w.ghost, 0) / mine.length, dU = toUnit(Math.abs(d)).toFixed(1);
  return d >= 0.05 ? ` Set done: ${dU} faster than your ghost.` : d <= -0.05 ? ` Set done: ${dU} behind your ghost.` : ' Set done: level with your ghost.';
}
function spdGhostLineHTML() {
  const gs = spdGhostSet(spd.setIdx);
  if (!gs || !spd.ghost) return '';
  const mine = spd.swings.filter(w => w.ghost), lead = mine.length ? mine.reduce((a, w) => a + w.mph - w.ghost, 0) / mine.length : null; // mph
  const next = gs[Math.min(gs.length - 1, spd.swings.filter(w => w.set === spd.setIdx && !w.warmup).length)];
  const fmt = d => `${d >= 0 ? '+' : '−'}${toUnit(Math.abs(d)).toFixed(1)}`; // a difference, in the unit you train in
  return `<div class="spd-ghost">👻 Ghost (${formatDate(spd.ghost.date)}) this swing: ${toUnit(next)}${lead !== null ? ` · you’re <b>${fmt(lead)}</b> per swing so far` : ''}</div>`;
}

// ════════════════════════════════════════════════════════════
// 4. WEEKLY SPEED CHALLENGE
// One challenge a week (it rotates), measured from this week's sessions.
// ════════════════════════════════════════════════════════════
const SPD_WEEKLY = [
  { id: 'targets', name: 'Target Practice', desc: 'Hit 10 set targets this week', total: 10, xp: 150, prog: S => S.reduce((a, s) => a + (s.targetsHit || 0), 0) },
  { id: 'sessions', name: 'Three for Three', desc: 'Complete 3 speed sessions this week', total: 3, xp: 150, prog: S => S.filter(s => s.completed).length },
  { id: 'ghost', name: 'Ghostbuster', desc: 'Beat your ghost in 2 sessions this week', total: 2, xp: 175, prog: S => S.filter(s => s.ghostDelta > 0).length },
  { id: 'pb', name: 'New Ground', desc: 'Set a personal best with any club or stick setting', total: 1, xp: 200, prog: S => S.some(s => s.anyPB) ? 1 : 0 },
  { id: 'ready', name: 'Fresh Legs', desc: 'Start 2 sessions at 100%+ readiness', total: 2, xp: 150, prog: S => S.filter(s => s.readiness >= 1).length },
];
function spdWeeklyChallenge() {
  const wk = weekStart(todayISO()), n = Math.floor(new Date(wk + 'T12:00:00').getTime() / (7 * 86400000));
  const c = SPD_WEEKLY[((n % SPD_WEEKLY.length) + SPD_WEEKLY.length) % SPD_WEEKLY.length];
  const S = getSpeedSessions().filter(s => weekStart(s.date) === wk && !SPD_SPECIAL[s.programId]);
  return { ...c, week: wk, value: Math.min(c.total, c.prog(S)), done: (getPrefs().speedWeekly || []).includes(wk) };
}
function spdCheckWeekly() {
  const c = spdWeeklyChallenge();
  if (c.value >= c.total && !c.done) {
    setPref('speedWeekly', [...(getPrefs().speedWeekly || []), c.week].slice(-52));
    awardXP(c.xp, 'weekly speed challenge');
    celebrate(`🏁 Weekly challenge complete: ${c.name}! +${c.xp} XP`);
  }
}
function spdWeeklyHTML() {
  const c = spdWeeklyChallenge(), pct = Math.round(c.value / c.total * 100);
  const end = new Date(c.week + 'T12:00:00'); end.setDate(end.getDate() + 6);
  return `<div class="card spd-weekly">
    <div style="display:flex;justify-content:space-between;align-items:center;gap:8px;"><div class="card-title" style="margin:0;">🏁 This week’s challenge</div><span class="apex-hole-meta">ends ${end.toLocaleDateString('en-US', { weekday: 'short' })}</span></div>
    <div style="font-weight:800;color:var(--green-dark);margin-top:6px;">${c.name} ${c.done ? '✅' : ''}</div>
    <div class="apex-hole-meta">${c.desc} · +${c.xp} XP</div>
    <div class="progress-bar-wrap" style="margin-top:8px;"><div class="progress-bar" style="width:${pct}%"></div></div>
    <div class="apex-hole-meta" style="margin-top:4px;">${c.value} / ${c.total}</div>
  </div>`;
}

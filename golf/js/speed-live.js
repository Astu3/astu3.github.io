// Golf Improvement App — Speed sessions, live: a target for every set, the speedometer, the session
// graph, and the readiness check that turns a slow day into a lighter one.
// Classic script: shares globals with the other files; load order is set in golf-improvement-app.html.

// ════════════════════════════════════════════════════════════
// LIVE SESSION
// Targets: each measured set gets a target just above your most recent best
// for that tool and drill (or, the first time, just under your baseline).
// Hitting it is the goal of every swing; the coach calls the gap.
// Readiness: after your first three measured swings, the best of them is
// compared with your average best (same tool and drill) over the last three
// sessions. 3%+ down means a tired system: the rest of the session is cut to
// ~60% of the swings (same intent). You can keep the full session instead.
// ════════════════════════════════════════════════════════════
const SPD_TARGET_STEP = 0.4;   // mph above your last best
const SPD_READY_LOW = 0.97, SPD_READY_HIGH = 1.01;

// tool|drill (older sessions didn't store the drill: those were normal-stance swings)
const spdKey = s => `${s.tool || 'Driver'}|${s.drill || 'normal'}`;
// Best speed per tool|drill in each saved session, newest first: [{ date, best: { key: mph } }]
function spdSessionBestsRaw() {
  return getSpeedSessions().map(s => {
    const best = {};
    (s.swings || []).forEach(w => { if (w.warmup || !w.mph) return; const k = spdKey(w); best[k] = Math.max(best[k] || 0, w.mph); });
    return { date: s.date, programId: s.programId, best };
  });
}
function spdSetTarget(set) {
  if (!set.record || set.drill === 'warmup') return null;
  const k = spdKey(set), last = spdSessionBests().find(b => b.best[k]);
  if (last) return Math.round((last.best[k] + SPD_TARGET_STEP) * 10) / 10;
  const p = spdLatestProfile(); return p && p.best[k] ? Math.round(p.best[k] * 0.99 * 10) / 10 : null;
}
function spdRecentRef(key) { // average best over the last three sessions with that tool and drill
  const v = spdSessionBests().map(b => b.best[key]).filter(Boolean).slice(0, 3);
  return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null;
}

// Called when a set starts: its target, announced by the coach
function spdPrepareSet() {
  const set = spd.sets[spd.setIdx];
  spd.targets = spd.targets || {};
  if (!(spd.setIdx in spd.targets)) spd.targets[spd.setIdx] = spdSetTarget(set);
  const t = spd.targets[spd.setIdx];
  return t ? ` Target: ${toUnit(t)}.` : '';
}
// After each measured swing: target feedback, then the readiness check (returns extra words for the coach)
function spdAfterSwing(swing) {
  const t = spd.targets && spd.targets[swing.set];
  let say = '';
  if (t && !swing.warmup) {
    swing.target = t; swing.hit = swing.mph >= t;
    const dU = Math.round((toUnit(swing.mph) - toUnit(t)) * 10) / 10; // in the unit you train in
    say = swing.hit ? (dU >= 0.1 ? ` Target hit, ${dU.toFixed(1)} over.` : ' Target hit.') : ` ${(-dU).toFixed(1)} under.`;
  }
  return say + spdReadiness(swing);
}
function spdReadiness(swing) {
  if (spd.ready || SPD_SPECIAL[spd.programId] || swing.warmup) return '';
  const first = spd.swings.filter(w => !w.warmup);
  if (first.length < 3) return '';
  const k = spdKey(first[0]), same = first.filter(w => spdKey(w) === k).slice(0, 3);
  if (same.length < 3) return '';
  const ref = spdRecentRef(k);
  if (!ref) { spd.ready = { ratio: null }; return ''; }
  const ratio = Math.max(...same.map(w => w.mph)) / ref;
  spd.ready = { ratio, key: k };
  if (ratio < SPD_READY_LOW) {
    spdMakeLight(true);
    return ` Readiness check: you're ${Math.round((1 - ratio) * 100)} percent below your recent sessions. I'll make today lighter: fewer swings, same full intent.`;
  }
  if (ratio >= SPD_READY_HIGH) return ' Readiness check: you are flying today. Full session.';
  return '';
}
// Light day: the rest of the session at about 60% of the swings (or back to full)
function spdMakeLight(on) {
  spd.light = on;
  spd.sets.forEach((s, i) => {
    if (s.origReps === undefined) s.origReps = s.reps;
    if (i <= spd.setIdx) return; // sets already done or underway stay as they are
    s.reps = on ? Math.max(2, Math.round(s.origReps * 0.6)) : s.origReps;
  });
}
function spdKeepFull() { if (spd) { spdMakeLight(false); spd.ready.overridden = true; renderSpeed(); } }

// ── The live panel for a measured swing ────────────────────────
function spdGaugeSVG(value, target, unit) {
  const lo = (target || value || 90) - 14, hi = (target || value || 90) + 6, clamp = v => Math.max(lo, Math.min(hi, v));
  const ang = v => Math.PI * (1 - (clamp(v) - lo) / (hi - lo)); // 180° (left) → 0° (right)
  const pt = (v, r) => [100 + Math.cos(ang(v)) * r, 100 - Math.sin(ang(v)) * r];
  const arc = (a, b, r) => { const [x1, y1] = pt(a, r), [x2, y2] = pt(b, r); return `M${x1.toFixed(1)},${y1.toFixed(1)} A${r},${r} 0 0 1 ${x2.toFixed(1)},${y2.toFixed(1)}`; };
  const hit = value !== null && target && value >= target;
  const [nx, ny] = value !== null ? pt(value, 70) : [100, 30];
  return `<svg class="spd-gauge" viewBox="0 0 200 118" role="img" aria-label="${value !== null ? `${toUnit(value)} ${unit}` : 'Waiting'}${target ? `, target ${toUnit(target)}` : ''}">
    <path d="${arc(lo, hi, 82)}" stroke="rgba(255,255,255,0.22)" stroke-width="14" fill="none" stroke-linecap="round"/>
    ${target ? `<path d="${arc(target, hi, 82)}" stroke="rgba(120,230,150,0.55)" stroke-width="14" fill="none" stroke-linecap="round"/>
    <line x1="${pt(target, 70)[0].toFixed(1)}" y1="${pt(target, 70)[1].toFixed(1)}" x2="${pt(target, 94)[0].toFixed(1)}" y2="${pt(target, 94)[1].toFixed(1)}" stroke="#fff" stroke-width="3"/>` : ''}
    ${value !== null ? `<path d="${arc(lo, value, 82)}" stroke="${hit ? '#7ee2a0' : '#ffd166'}" stroke-width="14" fill="none" stroke-linecap="round"/>
    <line x1="100" y1="100" x2="${nx.toFixed(1)}" y2="${ny.toFixed(1)}" stroke="#fff" stroke-width="3" stroke-linecap="round"/><circle cx="100" cy="100" r="5" fill="#fff"/>` : ''}
  </svg>`;
}
// The session so far: every measured swing, coloured by tool, with this set's target
function spdSessionChartSVG() {
  const pts = spd.swings.filter(w => !w.warmup && w.mph);
  if (pts.length < 2) return '';
  const W = 320, H = 90, vals = pts.map(p => p.mph), tgt = spd.targets && spd.targets[spd.setIdx];
  const lo = Math.min(...vals, tgt || Infinity) - 2, hi = Math.max(...vals, tgt || 0) + 2;
  const X = i => 8 + i / (pts.length - 1) * (W - 16), Y = v => H - 8 - (v - lo) / (hi - lo) * (H - 16);
  const color = { 'Driver': '#ffffff', 'Light stick': '#7ee2a0', 'Medium stick': '#ffd166', 'Heavy stick': '#ff9f80', 'Weighted driver': '#c7a6ff' };
  return `<svg class="spd-session-chart" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" role="img" aria-label="This session's speeds">
    ${tgt ? `<line x1="0" x2="${W}" y1="${Y(tgt).toFixed(1)}" y2="${Y(tgt).toFixed(1)}" stroke="rgba(126,226,160,0.7)" stroke-dasharray="4 4"/>` : ''}
    <polyline points="${pts.map((p, i) => `${X(i).toFixed(1)},${Y(p.mph).toFixed(1)}`).join(' ')}" fill="none" stroke="rgba(255,255,255,0.35)" stroke-width="1.5"/>
    ${pts.map((p, i) => `<circle cx="${X(i).toFixed(1)}" cy="${Y(p.mph).toFixed(1)}" r="${i === pts.length - 1 ? 4.5 : 3}" fill="${color[p.tool] || '#fff'}" stroke="${p.hit ? '#7ee2a0' : 'none'}" stroke-width="2"/>`).join('')}
  </svg>`;
}
function spdLivePanelHTML(set, phase) {
  const unit = unitLabel(), t = spd.targets && spd.targets[spd.setIdx];
  const inSet = spd.swings.filter(w => w.set === spd.setIdx && !w.warmup);
  const last = phase === 'feedback' ? spd.swings[spd.swings.length - 1] : null;
  const dots = Array.from({ length: set.reps }, (_, i) => { const w = inSet[i]; return `<span class="spd-dot ${w ? (w.hit ? 'hit' : t ? 'miss' : 'done') : i === inSet.length ? 'now' : ''}"></span>`; }).join('');
  const hits = spd.swings.filter(w => w.hit).length, aimed = spd.swings.filter(w => w.target).length;
  const delta = last && t ? Math.round((toUnit(last.mph) - toUnit(t)) * 10) / 10 : null;
  return `<div class="spd-status swing live">
    <div class="spd-label">${spdSetName(set)} · Swing ${Math.min(set.reps, spd.rep + (phase === 'feedback' ? 0 : 1))} of ${set.reps}${spd.light ? ' · light day' : ''}</div>
    <div class="spd-live-row">
      <div class="spd-gauge-wrap">
        ${spdGaugeSVG(last ? last.mph : null, t, unit)}
        <div class="spd-gauge-num">${last ? toUnit(last.mph) : set.drill === 'warmup' ? 'EASY' : 'SWING'}</div>
        <div class="spd-gauge-sub">${last ? (delta === null ? unit : delta >= 0 ? `✓ +${delta.toFixed(1)} over target` : `${delta.toFixed(1)} to target`) : t ? `target ${toUnit(t)} ${unit}` : set.drill === 'warmup' ? 'warm-up' : 'set the bar'}</div>
      </div>
    </div>
    <div class="spd-dots">${dots}</div>
    ${spdGhostLineHTML()}
    ${spdSessionChartSVG()}
    ${aimed ? `<div class="spd-sub">Targets hit this session: <strong>${hits}/${aimed}</strong></div>` : ''}
    ${spd.ready && spd.ready.ratio && spd.light && !spd.ready.overridden ? `<div class="spd-ready-note">Readiness ${Math.round(spd.ready.ratio * 100)}% of your recent sessions → lighter session. <button class="btn btn-sm" style="background:white;color:var(--gray-dark);" onclick="spdKeepFull()">Keep full session</button></div>` : ''}
    ${phase !== 'feedback' ? `<div class="spd-entry">
      <input type="number" id="spd-input" inputmode="decimal" step="0.1" placeholder="${unit}" onkeydown="if(event.key==='Enter')spdRecord(this.value)" />
      <button class="btn btn-gold" onclick="spdRecord(document.getElementById('spd-input').value)">Record</button>
    </div>
    <div class="spd-sub">${R10.isConnected() ? 'Just swing — the R10 records it (you can still type a speed)' : spdSettings.voice ? 'Type it, or say the speed — say “redo” for a misread' : 'Enter the speed from your radar'}</div>
    <div class="spd-sub" id="spd-mic"></div>
    <button class="btn btn-sm spd-ghost" onclick="spdRedoSwing()">↺ Redo swing (misread)</button>` : ''}
  </div>`;
}
function spdSessionBests() { return memo('spdSessionBests', spdSessionBestsRaw); } // cached until data changes

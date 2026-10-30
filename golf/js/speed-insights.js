// Golf Improvement App — Speed insights: trends by tool and drill, the fatigue curve, the overspeed
// ratio, program results and readiness, from every saved speed session.
// Classic script: shares globals with the other files; load order is set in golf-improvement-app.html.

// ════════════════════════════════════════════════════════════
// SPEED INSIGHTS
// Everything here is computed from saved sessions (and baseline / progress
// check profiles), so it fills in as you train. Each panel needs a little
// history before it says anything.
// ════════════════════════════════════════════════════════════
const SPD_SERIES = [
  { key: 'Driver|normal', name: 'Driver', color: '#1f6f4a' }, { key: 'Driver|step', name: 'Driver · step', color: '#2b6cb0' },
  { key: 'Light stick|normal', name: 'Light', color: '#52b788' }, { key: 'Medium stick|normal', name: 'Medium', color: '#e0a43a' },
  { key: 'Heavy stick|normal', name: 'Heavy', color: '#d9534f' },
];

// A small multi-line chart (dates across, speed up)
function spdLineChartSVG(series) {
  const all = series.flatMap(s => s.pts);
  if (!all.length) return '';
  const W = 640, H = 200, P = { l: 34, r: 10, t: 10, b: 22 };
  const x0 = Math.min(...all.map(p => p.x)), x1 = Math.max(...all.map(p => p.x)), y0 = Math.floor(Math.min(...all.map(p => p.y)) - 1), y1 = Math.ceil(Math.max(...all.map(p => p.y)) + 1);
  const X = x => P.l + (x1 > x0 ? (x - x0) / (x1 - x0) : 0.5) * (W - P.l - P.r), Y = y => H - P.b - (y - y0) / (y1 - y0) * (H - P.t - P.b);
  const step = y1 - y0 > 20 ? 5 : 2, grid = [];
  for (let v = Math.ceil(y0 / step) * step; v <= y1; v += step) grid.push(`<line x1="${P.l}" x2="${W - P.r}" y1="${Y(v).toFixed(1)}" y2="${Y(v).toFixed(1)}" stroke="var(--border)"/><text x="${P.l - 4}" y="${(Y(v) + 3).toFixed(1)}" text-anchor="end" font-size="10" fill="var(--gray-mid)">${toUnit(v)}</text>`);
  const fmtD = x => new Date(x).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  return `<svg class="spd-insight-chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="Best speed per session for each tool">
    ${grid.join('')}
    <text x="${P.l}" y="${H - 6}" font-size="10" fill="var(--gray-mid)">${fmtD(x0)}</text><text x="${W - P.r}" y="${H - 6}" font-size="10" text-anchor="end" fill="var(--gray-mid)">${fmtD(x1)}</text>
    ${series.map(s => `<polyline points="${s.pts.map(p => `${X(p.x).toFixed(1)},${Y(p.y).toFixed(1)}`).join(' ')}" fill="none" stroke="${s.color}" stroke-width="2.2" stroke-linejoin="round"/>
      ${s.pts.map(p => `<circle cx="${X(p.x).toFixed(1)}" cy="${Y(p.y).toFixed(1)}" r="3" fill="${s.color}"><title>${s.name}: ${toUnit(p.y)} on ${fmtD(p.x)}</title></circle>`).join('')}`).join('')}
  </svg>
  <div class="spd-legend">${series.map(s => `<span><i style="background:${s.color}"></i>${s.name}</span>`).join('')}</div>`;
}

function spdInsights() {
  const sessions = getSpeedSessions().slice().reverse(); // oldest first
  const bests = spdSessionBests().slice().reverse();
  // 1. trends: best per tool|drill per session
  const series = SPD_SERIES.map(s => ({ ...s, pts: bests.map(b => b.best[s.key] ? { x: new Date(b.date + 'T12:00:00').getTime(), y: b.best[s.key] } : null).filter(Boolean) }))
    .filter(s => s.pts.length >= 2);
  // 2. fatigue: each swing as a share of its set's best, by swing number; and by session thirds
  const byRep = {}, thirds = [[], [], []];
  sessions.forEach(s => {
    const sw = (s.swings || []).filter(w => !w.warmup && w.mph);
    const sets = {}; sw.forEach(w => (sets[w.set] = sets[w.set] || []).push(w));
    Object.values(sets).forEach(list => { if (list.length < 3) return; const best = Math.max(...list.map(w => w.mph));
      list.forEach((w, i) => (byRep[i + 1] = byRep[i + 1] || []).push(w.mph / best)); });
    const drv = sw.filter(w => spdKey(w) === 'Driver|normal');
    if (drv.length >= 6) { const best = Math.max(...drv.map(w => w.mph)); drv.forEach((w, i) => thirds[Math.min(2, Math.floor(i / drv.length * 3))].push(w.mph / best)); }
  });
  const avg = a => a.length ? a.reduce((x, y) => x + y, 0) / a.length : null;
  const repCurve = Object.entries(byRep).filter(([, v]) => v.length >= 3).map(([r, v]) => ({ rep: +r, pct: avg(v) * 100 })).slice(0, 8);
  const thirdPct = thirds.map(t => t.length >= 3 ? avg(t) * 100 : null);
  // 3. overspeed ratio: light stick vs driver, per session that has both
  const ratio = bests.filter(b => b.best['Light stick|normal'] && b.best['Driver|normal']).map(b => ({ date: b.date, r: b.best['Light stick|normal'] / b.best['Driver|normal'] }));
  // 4. program results: first baseline vs latest test
  const profiles = getSpeedProfiles(), first = profiles[profiles.length - 1], latest = profiles[0];
  // 5. readiness and targets, recent sessions
  const recent = getSpeedSessions().filter(s => !SPD_SPECIAL[s.programId]).slice(0, 10).reverse();
  return { series, repCurve, thirdPct, ratio, first, latest, recent, sessions: sessions.length };
}

function spdInsightsHTML() {
  const I = spdInsights(), unit = unitLabel();
  const dist = spdDistancePanelHTML();
  if (I.sessions < 2) return `<div class="card"><div class="card-title">Speed Insights</div>${dist}
    <p style="font-size:0.84rem;color:var(--gray-mid);">Trends, your fatigue curve and how each tool is improving appear here after a couple of sessions.</p></div>`;
  const panels = dist ? [dist] : [];
  if (I.series.length) panels.push(`<div class="spd-insight"><div class="apex-subtitle">Best speed per session (${unit})</div>${spdLineChartSVG(I.series)}</div>`);
  if (I.repCurve.length >= 3) {
    const peak = I.repCurve.reduce((m, r) => r.pct > m.pct ? r : m), lastR = I.repCurve[I.repCurve.length - 1];
    const fadeAt = I.repCurve.find(r => r.rep > peak.rep && r.pct < 97);
    const bars = I.repCurve.map(r => `<div class="spd-fbar"><div class="spd-fbar-fill" style="height:${Math.max(4, (r.pct - 88) / 12 * 100)}%;background:${r.pct >= 98 ? 'var(--green-mid)' : r.pct >= 96 ? 'var(--gold)' : 'var(--red)'}"></div><div class="spd-fbar-v">${r.pct.toFixed(1)}%</div><div class="spd-fbar-l">#${r.rep}</div></div>`).join('');
    const t = I.thirdPct;
    panels.push(`<div class="spd-insight"><div class="apex-subtitle">Fatigue curve: speed by swing number within a set (% of that set’s best)</div>
      <div class="spd-fbars">${bars}</div>
      <div class="spd-note">• You’re fastest on swing ${peak.rep} of a set${fadeAt ? `; by swing ${fadeAt.rep} you’ve dropped below 97%` : lastR.pct >= 97 ? ', and you hold your speed to the end of a set — good' : ''}.${fadeAt && fadeAt.rep <= 4 ? ' Shorter sets (or more rest) would keep every swing fast.' : ''}</div>
      ${t[0] && t[2] ? `<div class="spd-note">• Across a session your driver swings average ${t[0].toFixed(1)}% of your best early on and ${t[2].toFixed(1)}% late${t[2] < t[0] - 2 ? ' — you fade; warm up well and take the full rests' : t[2] > t[0] + 1 ? ' — you get faster as you go: a longer warm-up could help you start fast' : ' — steady'}.</div>` : ''}</div>`);
  }
  if (I.ratio.length) {
    const lastR = I.ratio[I.ratio.length - 1], firstR = I.ratio[0];
    panels.push(`<div class="spd-insight"><div class="apex-subtitle">Overspeed ratio (light stick ÷ driver)</div>
      <div class="spd-note">Latest <strong>${lastR.r.toFixed(3)}</strong> — your light stick moves ${((lastR.r - 1) * 100).toFixed(1)}% faster than your driver.${I.ratio.length > 1 ? ` Started at ${firstR.r.toFixed(3)}.` : ''}
      ${lastR.r < 1.04 ? ' A small gap usually means overspeed work has the most to give.' : lastR.r > 1.12 ? ' A big gap: you move light things fast — driver speed may be limited by force (heavier work).' : ''}</div></div>`);
  }
  if (I.first && I.latest && I.first !== I.latest) {
    const rows = Object.keys(I.latest.best).filter(k => I.first.best[k]).map(k => {
      const a = I.first.best[k], b = I.latest.best[k], ch = (b / a - 1) * 100, [tool, drill] = k.split('|');
      return `<tr><td style="text-align:left;">${tool}${drill !== 'normal' ? ` · ${SPEED_DRILLS[drill]?.name || drill}` : ''}</td><td>${toUnit(a)}</td><td>${toUnit(b)}</td><td style="color:${ch >= 0 ? 'var(--green-mid)' : 'var(--red)'};font-weight:700;">${ch >= 0 ? '+' : ''}${ch.toFixed(1)}%</td></tr>`;
    }).join('');
    panels.push(`<div class="spd-insight"><div class="apex-subtitle">Since your first baseline (${formatDate(I.first.date)} → ${formatDate(I.latest.date)})</div>
      <div class="scorecard-wrap"><table class="scorecard"><thead><tr><th style="text-align:left;">Tool</th><th>Then</th><th>Now</th><th>Change</th></tr></thead><tbody>${rows}</tbody></table></div></div>`);
  }
  const withReady = I.recent.filter(s => s.readiness || s.targetsAimed);
  if (withReady.length) {
    panels.push(`<div class="spd-insight"><div class="apex-subtitle">Recent sessions: readiness and targets hit</div>
      <div class="spd-ready-rows">${withReady.map(s => `<div class="spd-ready-row"><span>${formatDate(s.date)}</span>
        <span>${s.readiness ? `<b style="color:${s.readiness < SPD_READY_LOW ? 'var(--red)' : s.readiness >= SPD_READY_HIGH ? 'var(--green-mid)' : 'var(--gray-dark)'}">${Math.round(s.readiness * 100)}%</b> ready${s.light ? ' · light day' : ''}` : '—'}</span>
        <span>${s.targetsAimed ? `${s.targetsHit}/${s.targetsAimed} targets` : ''}</span></div>`).join('')}</div></div>`);
  }
  return `<div class="card"><div class="card-title">Speed Insights</div>${panels.length ? panels.join('') : '<p style="font-size:0.84rem;color:var(--gray-mid);">Keep training — insights need a few more measured sessions.</p>'}</div>`;
}

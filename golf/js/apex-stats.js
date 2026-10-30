// Golf Improvement App — Apex stats: scoring, strokes gained and hole-by-hole records.
// Classic script: shares globals with the other files; load order is set in golf-improvement-app.html.

// ════════════════════════════════════════════════════════════
// APEX STATS
// Built from saved Apex rounds (each hole's shots are logged like a
// shot-by-shot round). Strokes gained use each round's own baseline (the
// target handicap chosen when it started), per 18 holes.
// ════════════════════════════════════════════════════════════
function apexHoleScore(h) {
  if (h.maxed) return h.maxed;
  return (h.shots || []).reduce((a, s) => a + 1 + (s.penalty || 0), 0);
}

function apexStats(rounds) {
  const holes = APEX_HOLES.map(d => ({ n: d.n, name: d.name, par: d.par, scores: [] }));
  const sg = { offTee: 0, approach: 0, short: 0, putting: 0, total: 0, holes: 0 };
  let putts = 0, pens = 0, holeCount = 0;
  rounds.forEach(r => {
    r.holes.forEach((h, i) => { const hs = holes[(r.firstHole || 1) - 1 + i]; if (hs) hs.scores.push(apexHoleScore(h)); });
    const t = sgRoundTotals(r.holes, sgCalibration(r.targetHandicap, r.rating, r.holeCount));
    SG_CATS.forEach(c => { sg[c.key] += t.byCat[c.key]; });
    sg.total += t.sgTotal; sg.holes += r.holes.filter(h => !h.maxed).length;
    putts += t.putts; pens += t.penalties; holeCount += r.holes.length;
  });
  holes.forEach(h => {
    const n = h.scores.length;
    h.avg = n ? h.scores.reduce((a, b) => a + b, 0) / n : null;
    h.best = n ? Math.min(...h.scores) : null;
    h.underPar = h.scores.filter(x => x < h.par).length;
  });
  const per18 = k => sg.holes ? k / sg.holes * 18 : 0;
  return {
    holes, played: holes.filter(h => h.avg !== null),
    sg: { offTee: per18(sg.offTee), approach: per18(sg.approach), short: per18(sg.short), putting: per18(sg.putting), total: per18(sg.total) },
    puttsPer18: holeCount ? putts / holeCount * 18 : 0, pensPer18: holeCount ? pens / holeCount * 18 : 0,
  };
}

// A tiny line of recent 18-hole scores (oldest → newest)
function apexSparkline(scores) {
  if (scores.length < 2) return '';
  const W = 220, H = 44, lo = Math.min(...scores) - 2, hi = Math.max(...scores) + 2;
  const X = i => 4 + i / (scores.length - 1) * (W - 8), Y = v => 4 + (v - lo) / (hi - lo) * (H - 8); // lower score = higher on the chart
  const pts = scores.map((v, i) => `${X(i).toFixed(1)},${(H - Y(v)).toFixed(1)}`).join(' ');
  const last = scores.length - 1;
  return `<svg class="apex-spark" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-label="Recent 18-hole scores: ${scores.join(', ')}">
    <polyline points="${pts}" fill="none" stroke="var(--green-mid, #2d6a4f)" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>
    <circle cx="${X(last).toFixed(1)}" cy="${(H - Y(scores[last])).toFixed(1)}" r="3.5" fill="var(--gold, #e0a43a)"/></svg>`;
}

function apexStatsHTML(rounds) {
  if (!rounds.length) return '';
  const st = apexStats(rounds), full = rounds.filter(r => r.holeCount === 18);
  const byTee = Object.keys(APEX_TEES).map(k => {
    const rs = full.filter(r => r.course.endsWith(APEX_TEES[k].name));
    return rs.length ? { name: APEX_TEES[k].name, color: APEX_TEES[k].color, n: rs.length, best: Math.min(...rs.map(r => r.score)), avg: rs.reduce((a, r) => a + r.score, 0) / rs.length } : null;
  }).filter(Boolean);
  const ranked = st.played.filter(h => h.scores.length >= 1).slice().sort((a, b) => (b.avg - b.par) - (a.avg - a.par));
  const toughest = ranked.slice(0, 3), bestHoles = ranked.slice(-3).reverse();
  const sgCell = (name, v) => `<div class="apex-stat"><span>${name}</span><strong class="${v >= 0 ? 'sg-pos' : 'sg-neg'}">${signed(Math.round(v * 10) / 10)}</strong></div>`;
  const vsPar = h => { if (h.avg === null) return ''; const d = Math.round((h.avg - h.par) * 10) / 10;
    return `<span class="${d < 0 ? 'apex-under' : d >= 1 ? 'apex-over' : ''}">${d === 0 ? 'E' : signed(d)}</span>`; };
  return `<div class="card">
    <div class="card-title">Your Apex Stats</div>
    <div class="apex-stats-top">
      ${byTee.map(t => `<div class="apex-stat"><span><i class="apex-tee-dot" style="background:${t.color}"></i>${t.name} · ${t.n} round${t.n > 1 ? 's' : ''}</span><strong>best ${t.best} · avg ${t.avg.toFixed(1)}</strong></div>`).join('')}
      ${byTee.length ? '' : `<div class="apex-stat"><span>Rounds</span><strong>${rounds.length} (no 18-hole rounds yet)</strong></div>`}
      ${full.length >= 2 ? `<div class="apex-stat"><span>Last ${Math.min(15, full.length)} rounds</span>${apexSparkline(full.slice(0, 15).reverse().map(r => r.score))}</div>` : ''}
    </div>
    <div class="apex-subtitle">Strokes gained per 18 <span class="apex-hole-meta">vs. your target handicap</span></div>
    <div class="apex-stats-sg">
      ${SG_CATS.map(c => sgCell(c.name, st.sg[c.key])).join('')}
      ${sgCell('Total', st.sg.total)}
    </div>
    <div class="apex-hole-meta" style="margin:6px 0 10px;">Putts per 18: ${st.puttsPer18.toFixed(1)} · penalty strokes per 18: ${st.pensPer18.toFixed(1)}</div>
    ${ranked.length >= 4 ? `<div class="apex-stats-cols">
      <div><div class="apex-subtitle">Toughest for you</div>${toughest.map(h => `<div class="apex-hole-meta">${h.n}. ${esc(h.name)} — ${vsPar(h)} avg</div>`).join('')}</div>
      <div><div class="apex-subtitle">Your best holes</div>${bestHoles.map(h => `<div class="apex-hole-meta">${h.n}. ${esc(h.name)} — ${vsPar(h)} avg</div>`).join('')}</div>
    </div>` : ''}
    <div class="scorecard-wrap"><table class="scorecard apex-card">
      <thead><tr><th>Hole</th>${st.holes.map(h => `<th>${h.n}</th>`).join('')}</tr></thead>
      <tbody>
        <tr><td>Par</td>${st.holes.map(h => `<td>${h.par}</td>`).join('')}</tr>
        <tr><td>Avg</td>${st.holes.map(h => `<td>${h.avg === null ? '' : h.avg.toFixed(1)}</td>`).join('')}</tr>
        <tr><td>± par</td>${st.holes.map(h => `<td>${vsPar(h)}</td>`).join('')}</tr>
        <tr><td>Best</td>${st.holes.map(h => `<td class="${h.best !== null && h.best < h.par ? 'apex-under' : ''}">${h.best ?? ''}</td>`).join('')}</tr>
        <tr><td>Birdie+</td>${st.holes.map(h => `<td>${h.scores.length ? h.underPar : ''}</td>`).join('')}</tr>
      </tbody></table></div>
  </div>`;
}

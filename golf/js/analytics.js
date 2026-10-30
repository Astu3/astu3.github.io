// Golf Improvement App — Scoring distribution and the round-level strokes-gained estimate.
// Classic script: shares globals with the other files; load order is set in golf-improvement-app.html.

// ════════════════════════════════════════════════════════════
// SCORING DISTRIBUTION
// ════════════════════════════════════════════════════════════
const SCORE_BUCKETS = [
  { key:'eagle',  label:'Eagle+',  color:'var(--purple)',      test: rel => rel <= -2 },
  { key:'birdie', label:'Birdie',  color:'var(--green-light)', test: rel => rel === -1 },
  { key:'par',    label:'Par',     color:'var(--blue)',        test: rel => rel === 0 },
  { key:'bogey',  label:'Bogey',   color:'var(--gold)',        test: rel => rel === 1 },
  { key:'double', label:'Double+', color:'var(--red)',         test: rel => rel >= 2 },
];

// Total penalty strokes for a round (back-compat: derive from holes, else 0)
function roundPenalties(r) {
  if (typeof r.penalties === 'number') return r.penalties;
  return (r.holes || []).reduce((s, h) => s + (h.pen || 0), 0);
}

function scoringDistribution(rounds) {
  const counts = { eagle:0, birdie:0, par:0, bogey:0, double:0 };
  let totalHoles = 0;
  for (const r of rounds) {
    for (const h of (r.holes || [])) {
      const rel = h.score - h.par;
      const b = SCORE_BUCKETS.find(b => b.test(rel));
      if (b) { counts[b.key]++; totalHoles++; }
    }
  }
  return { counts, totalHoles };
}

function scoringDistributionHTML(rounds, title) {
  const { counts, totalHoles } = scoringDistribution(rounds);
  if (!totalHoles) return '';
  const bars = SCORE_BUCKETS.map(b => {
    const n   = counts[b.key];
    const pct = Math.round(n / totalHoles * 100);
    return `
      <div class="stat-row" style="margin-bottom:4px;">
        <div class="stat-name">${b.label}</div>
        <div class="stat-pct">${n} <span style="color:var(--gray-mid);font-weight:600;">(${pct}%)</span></div>
      </div>
      <div class="progress-bar-wrap" style="margin-bottom:12px;">
        <div class="progress-bar" style="width:${pct}%;background:${b.color};"></div>
      </div>`;
  }).join('');
  return `<div class="card">
    <div class="card-title">${title}</div>
    ${bars}
  </div>`;
}

function scoringChipsHTML(round) {
  const { counts } = scoringDistribution([round]);
  return SCORE_BUCKETS.map(b => {
    const n = counts[b.key];
    return n ? `<span style="display:inline-block;background:${b.color};color:white;font-size:0.72rem;font-weight:700;padding:2px 9px;border-radius:10px;margin:2px 3px 2px 0;">${b.label}: ${n}</span>` : '';
  }).join('');
}

// ════════════════════════════════════════════════════════════
// STROKES GAINED — LITE  (heuristic estimate vs a baseline golfer)
// ════════════════════════════════════════════════════════════
// Baseline ≈ an average mid-90s golfer, normalized per 18 holes.
const SG_BASELINE = { fir: 45, gir: 30, putts18: 34, scramble: 30, pen18: 2.5 };
// Rough stroke weights converting % gaps into strokes.
const SG_WEIGHTS  = { drivingHoles: 14, drivingPenalty: 0.45, approachPenalty: 0.55, scramblePenalty: 0.5 };

function strokesGainedLite(rounds) {
  if (!rounds.length) return null;
  let fir = 0, gir = 0, putts18 = 0, pen18 = 0, scrambleNum = 0, scrambleDen = 0;
  const n = rounds.length;
  for (const r of rounds) {
    fir += r.firPct || 0;
    gir += r.girPct || 0;
    const holes = r.holeCount || (r.holes || []).length || 18;
    putts18 += (r.putts || 0) * (18 / holes);
    pen18   += roundPenalties(r) * (18 / holes);
    for (const h of (r.holes || [])) {
      if (!h.gir) { scrambleDen++; if (h.score <= h.par) scrambleNum++; }
    }
  }
  fir /= n; gir /= n; putts18 /= n; pen18 /= n;
  const scramble = scrambleDen ? (scrambleNum / scrambleDen * 100) : 0;

  // Penalty strokes are mostly tee-shot trouble (OB / hazard), so charge them to driving.
  const drivingPen = (SG_BASELINE.pen18 - pen18); // fewer penalties than baseline = strokes gained
  const driving   = (fir - SG_BASELINE.fir) / 100 * SG_WEIGHTS.drivingHoles * SG_WEIGHTS.drivingPenalty + drivingPen;
  const approach  = (gir - SG_BASELINE.gir) / 100 * 18 * SG_WEIGHTS.approachPenalty;
  const putting   = (SG_BASELINE.putts18 - putts18);
  const greensMissed18 = (1 - gir / 100) * 18;
  const shortGame = (scramble - SG_BASELINE.scramble) / 100 * greensMissed18 * SG_WEIGHTS.scramblePenalty;

  return {
    categories: [
      { key:'driving',   name:'Off the Tee', sg: driving,   detail:`${Math.round(fir)}% fairways · ${pen18.toFixed(1)} pen/18` },
      { key:'approach',  name:'Approach',    sg: approach,  detail:`${Math.round(gir)}% greens` },
      { key:'shortGame', name:'Short Game',  sg: shortGame, detail:`${Math.round(scramble)}% scrambling` },
      { key:'putting',   name:'Putting',     sg: putting,   detail:`${putts18.toFixed(1)} putts/18` },
    ],
    sampleSize: n
  };
}

// Diverging strokes-gained bars, worst category first (flagged red).
// `scale` strokes fills half the bar. Used by Practice and the SG round summary.
function sgBarsHTML(cats, scale) {
  return [...cats].sort((a, b) => a.sg - b.sg).map((c, i) => {
    const pos   = c.sg >= 0;
    const half  = Math.min(100, Math.abs(c.sg) / scale * 100) / 2;
    const color = pos ? 'var(--green-light)' : 'var(--red)';
    const fill  = pos ? `left:50%;width:${half}%` : `right:50%;width:${half}%`;
    return `
      <div class="sg-row">
        <div><span class="sg-name">${i === 0 ? '🔴 ' : ''}${c.name}</span>${c.detail ? ` <span class="sg-detail">${c.detail}</span>` : ''}</div>
        <div class="sg-track">
          <div class="sg-fill" style="${fill};background:${color};"></div>
          <div class="sg-mid"></div>
        </div>
        <div class="sg-val" style="color:${color};">${signed(c.sg)}</div>
      </div>`;
  }).join('');
}

function strokesGainedRows(sg) { return sgBarsHTML(sg.categories, 3); }

const SG_FOCUS = {
  driving:   "Your tee shots are leaking the most. Prioritize the Fairway Finder drill and lock in your start line before chasing distance.",
  approach:  "Approach play is your biggest gap. Work the Stock Shot Groove drill and aim for the fat side of greens, not the flag.",
  shortGame: "Short game is where you're bleeding shots. Hammer the Up-and-Down Challenge — saving par from off the green is pure scoring.",
  putting:   "Putting is your weakest link. Run the Gate and Clock drills, and dial in lag speed to eliminate 3-putts.",
};

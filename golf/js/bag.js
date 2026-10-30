// Golf Improvement App — My Bag: yardage gapping and dispersion from R10 range shots.
// Classic script: shares globals with the other files; load order is set in golf-improvement-app.html.

// ════════════════════════════════════════════════════════════
// MY BAG
// What each club really does, from recent full-swing range shots: carry and
// total, how far shots spread long–short and left–right, which way they miss
// and why (face vs path), how often it's mishit, and the yardage gaps between
// clubs — flagging overlaps (two clubs that go the same distance) and holes.
// Mishits (well under the club's usual carry or smash) are counted but kept out
// of the averages, so one topped shot doesn't make a 7-iron "go" 120. Apex
// and the drills use the same cleaned numbers.
// ════════════════════════════════════════════════════════════
const BAG = { RECENT_DAYS: 120, PER_CLUB: 40, MIN: 3 };
let bagClub = null; // the club shown in the dispersion view

const bagMedian = v => { const s = v.slice().sort((a, b) => a - b), m = s.length >> 1; return s.length ? (s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2) : null; };
const bagMean = v => v.length ? v.reduce((a, b) => a + b, 0) / v.length : null;
const bagSD = v => { const m = bagMean(v); return v.length > 1 ? Math.sqrt(v.reduce((a, b) => a + (b - m) ** 2, 0) / (v.length - 1)) : 0; };
const bagPct = (v, p) => { const s = v.slice().sort((a, b) => a - b); return s.length ? s[Math.min(s.length - 1, Math.max(0, Math.round(p * (s.length - 1))))] : null; };

// Recent full swings per club (drill shots are often partial swings: left out), newest first
function bagRecent() {
  const cutoff = isoOf(Date.now() - BAG.RECENT_DAYS * 864e5), by = {};
  getRangeShots().forEach(s => {
    if (s.drill || s.carry === null || s.carry === undefined || !s.ballMph || s.date < cutoff) return;
    const list = by[s.club] = by[s.club] || [];
    if (list.length < BAG.PER_CLUB) list.push(s);
  });
  return by;
}
// Split a club's shots into good strikes and mishits
function bagSplit(shots) {
  const medC = bagMedian(shots.map(s => s.carry)), medS = bagMedian(shots.map(s => s.smash).filter(x => x));
  const mishit = s => s.carry < medC * 0.8 || (medS && s.smash && s.smash < medS - 0.12);
  return { good: shots.filter(s => !mishit(s)), bad: shots.filter(mishit) };
}
// Shots to build Apex / drill club profiles from: clean strikes only
function bagProfileShots() { return Object.values(bagRecent()).flatMap(list => bagSplit(list).good); }

function bagStats() { return memo('bagStats', bagStatsRaw); } // cached until data changes
function bagStatsRaw() {
  const by = bagRecent(), out = [];
  Object.entries(by).forEach(([club, shots]) => {
    if (shots.length < BAG.MIN) return;
    const { good, bad } = bagSplit(shots), g = good.length >= BAG.MIN ? good : shots;
    const carry = g.map(s => s.carry), off = g.map(s => s.offline || 0), num = k => g.map(s => s[k]).filter(x => x !== null && x !== undefined && isFinite(x));
    const missYds = Math.max(6, bagMean(carry) * 0.06); // further offline than this is a miss
    const fp = g.filter(s => s.face !== null && s.face !== undefined && s.path !== null && s.path !== undefined).map(s => s.face - s.path);
    out.push({
      club, n: shots.length, good: g.length, mishit: bad.length / shots.length,
      carry: bagMean(carry), carrySD: bagSD(carry), lo: bagPct(carry, 0.1), hi: bagPct(carry, 0.9),
      total: bagMean(g.map(s => s.total)), off: bagMean(off), offSD: bagSD(off),
      left: off.filter(o => o < -missYds).length / g.length, right: off.filter(o => o > missYds).length / g.length,
      faceToPath: fp.length >= BAG.MIN ? bagMean(fp) : null, clubMph: bagMean(num('clubMph')), ballMph: bagMean(num('ballMph')),
      launch: bagMean(num('launch')), spin: bagMean(num('spin')), smash: bagMean(num('smash')),
      last: shots[0].date, pts: g.map(s => [s.offline || 0, s.carry]),
    });
  });
  out.sort((a, b) => b.carry - a.carry); // longest first
  // gaps to the next shorter club
  out.forEach((c, i) => {
    const next = out[i + 1];
    c.gap = next ? c.carry - next.carry : null;
    // what a sensible gap is: wider between the long clubs
    const ideal = c.carry > 180 ? [10, 22] : c.carry > 120 ? [8, 16] : [6, 15];
    // clubs between these two (in a standard bag) with no data: the gap is missing data, not a hole
    const skipped = next ? RANGE_CLUBS.slice(RANGE_CLUBS.indexOf(c.club) + 1, RANGE_CLUBS.indexOf(next.club)).filter(x => !['2-Iron', '3-Iron'].includes(x)) : [];
    c.gapState = c.gap === null ? null : c.gap < Math.max(4, c.carry * 0.03) ? 'overlap' : c.gap < ideal[0] ? 'tight'
      : c.gap > ideal[1] ? (skipped.length ? 'unmeasured' : 'big') : 'good';
    c.skipped = skipped;
  });
  return out;
}

// Plain-English findings, most useful first
function bagInsights(stats) {
  const out = [], name = c => `<b>${esc(c.club)}</b>`;
  stats.forEach((c, i) => {
    const n = stats[i + 1];
    if (c.gapState === 'overlap') out.push({ icon: '🔁', w: 3, text: `${name(c)} and ${name(n)} carry within ${Math.max(0, Math.round(c.gap))} yds of each other — one of them is doing the other's job. Consider dropping one, or a loft change, and use the slot for a club you're missing.` });
    const wedge = x => /^(PW|GW|SW|LW)$/.test(x.club), mid = n ? Math.round(n.carry + c.gap / 2) : 0;
    if (c.gapState === 'big') out.push({ icon: '🕳️', w: 2.5, text: `A ${Math.round(c.gap)}-yd hole between ${name(c)} (${Math.round(c.carry)}) and ${name(n)} (${Math.round(n.carry)}). ${wedge(c) && wedge(n)
      ? `A gap wedge, or a ¾ ${esc(c.club)} you've practised, would cover ${mid} yds (the Wedge Matrix drill measures it).`
      : c.carry > 170 ? `Shots of about ${mid} yds have no stock club — a hybrid or utility club could fill it.` : `Shots of about ${mid} yds need a three-quarter ${esc(c.club)} — or a club change.`}` });
  });
  const shape = stats.filter(c => c.good >= 6 && Math.max(c.left, c.right) >= 0.35 && Math.abs(c.left - c.right) >= 0.25);
  shape.slice(0, 3).forEach(c => {
    const side = c.right > c.left ? 'right' : 'left', why = c.faceToPath === null ? '' : Math.abs(c.faceToPath) >= 1.5
      ? ` Face ${Math.abs(c.faceToPath).toFixed(1)}° ${c.faceToPath > 0 ? 'open' : 'closed'} to path on average — that's the ${c.faceToPath > 0 ? 'fade/slice' : 'draw/hook'} spin.` : ' Face and path match, so it\'s a start-line miss: check aim and ball position.';
    out.push({ icon: '↔️', w: 2, text: `${name(c)} misses ${side}: ${Math.round(Math.max(c.left, c.right) * 100)}% of shots end more than ${Math.round(Math.max(6, c.carry * 0.06))} yds ${side}.${why}` });
  });
  stats.filter(c => c.n >= 8 && c.mishit >= 0.2).slice(0, 2).forEach(c => out.push({ icon: '🔨', w: 1.8, text: `${name(c)}: ${Math.round(c.mishit * 100)}% mishits (well short or a low smash). Strike is the first thing to fix with this club.` }));
  const rated = stats.filter(c => c.good >= 6).map(c => ({ c, spread: c.carrySD / c.carry }));
  if (rated.length >= 3) {
    rated.sort((a, b) => a.spread - b.spread);
    const best = rated[0].c, worst = rated[rated.length - 1].c;
    out.push({ icon: '🎯', w: 1, text: `Most dependable distance: ${name(best)} (±${Math.round(best.carrySD)} yds). Least: ${name(worst)} (±${Math.round(worst.carrySD)} yds) — practise it to a target, not just a direction.` });
  }
  const have = new Set(stats.map(c => c.club)), missing = stats.length ? RANGE_CLUBS.slice(RANGE_CLUBS.indexOf(stats[0].club), RANGE_CLUBS.indexOf(stats[stats.length - 1].club)).filter(c => !have.has(c) && c !== '2-Iron' && c !== '3-Iron') : [];
  if (missing.length) out.push({ icon: '📋', w: 0.5, text: `No recent range data for ${missing.map(esc).join(', ')} — if they're in your bag, hit 10 of each to complete your gapping.` });
  const old = stats.filter(c => (Date.now() - new Date(c.last)) / 864e5 > 60);
  if (old.length) out.push({ icon: '⏳', w: 0.4, text: `${old.map(c => esc(c.club)).join(', ')}: last hit over two months ago — numbers may have moved.` });
  return out.sort((a, b) => b.w - a.w);
}

// ── Charts (SVG) ──────────────────────────────────────────────
// Gapping ladder: each club's usual carry window (10th–90th percentile), its
// average carry (dot) and total (tick), with the gap to the next club
function bagLadderSVG(stats) {
  const W = 640, row = 30, padL = 74, padR = 70, H = stats.length * row + 26;
  const maxY = Math.max(...stats.map(c => Math.max(c.hi, c.total || 0))) * 1.04, minY = Math.max(0, Math.min(...stats.map(c => c.lo)) * 0.9);
  const X = y => padL + (y - minY) / (maxY - minY) * (W - padL - padR);
  const col = { overlap: 'var(--red)', tight: 'var(--gold-dark)', big: 'var(--gold-dark)', good: 'var(--green-mid)', unmeasured: 'var(--gray-mid)' };
  const ticks = []; for (let t = Math.ceil(minY / 25) * 25; t <= maxY; t += 25) ticks.push(t);
  return `<svg class="bag-ladder" viewBox="0 0 ${W} ${H}" role="img" aria-label="Carry distance by club">
    ${ticks.map(t => `<line x1="${X(t)}" x2="${X(t)}" y1="0" y2="${H - 20}" class="bag-grid"/><text x="${X(t)}" y="${H - 6}" class="bag-axis" text-anchor="middle">${t}</text>`).join('')}
    ${stats.map((c, i) => { const y = i * row + 14;
      return `<text x="${padL - 8}" y="${y + 4}" class="bag-club" text-anchor="end">${esc(c.club)}</text>
        <rect x="${X(c.lo)}" y="${y - 6}" width="${Math.max(3, X(c.hi) - X(c.lo))}" height="12" rx="6" class="bag-window"/>
        ${c.total ? `<line x1="${X(c.total)}" x2="${X(c.total)}" y1="${y - 8}" y2="${y + 8}" class="bag-total"/>` : ''}
        <circle cx="${X(c.carry)}" cy="${y}" r="5" class="bag-dot"/>
        <text x="${W - padR + 8}" y="${y + 4}" class="bag-carry">${Math.round(c.carry)}</text>
        ${c.gap !== null ? `<text x="${W - 6}" y="${y + row / 2 + 4}" class="bag-gap" text-anchor="end" fill="${col[c.gapState]}">${c.gapState === 'overlap' ? '⚠ ' : ''}${Math.round(c.gap)}</text>` : ''}`;
    }).join('')}
  </svg>`;
}
// Dispersion: top-down, every clean shot, with the ellipse holding about 80% of them
function bagDispersionSVG(c) {
  const W = 300, H = 300, side = Math.max(20, ...c.pts.map(p => Math.abs(p[0]))) * 1.25;
  const span = Math.max(30, (c.hi - c.lo) * 1.8, c.carrySD * 7), y0 = c.carry - span / 2, y1 = c.carry + span / 2;
  const X = x => W / 2 + x / side * (W / 2 - 14), Y = y => H - 14 - (y - y0) / (y1 - y0) * (H - 28);
  const k = 1.8; // ~80% for a 2-D normal
  const fw = c.club === 'Driver' || /Wood|Hybrid/.test(c.club) ? 16 : 0; // a 32-yd fairway for the long clubs
  return `<svg class="bag-disp" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(c.club)} shot dispersion">
    ${fw ? `<rect x="${X(-fw)}" y="0" width="${X(fw) - X(-fw)}" height="${H}" class="bag-fairway"/>` : ''}
    <line x1="${X(0)}" x2="${X(0)}" y1="0" y2="${H}" class="bag-target"/>
    ${[y0, c.carry, y1].map(v => `<text x="4" y="${Y(v) + 3}" class="bag-axis">${Math.round(v)}</text>`).join('')}
    <ellipse cx="${X(c.off)}" cy="${Y(c.carry)}" rx="${Math.max(3, X(c.off + k * c.offSD) - X(c.off))}" ry="${Math.max(3, Y(c.carry) - Y(c.carry + k * c.carrySD))}" class="bag-ellipse"/>
    ${c.pts.map(p => `<circle cx="${X(p[0])}" cy="${Y(p[1])}" r="3.5" class="bag-pt"/>`).join('')}
    <text x="${W - 4}" y="${H - 4}" class="bag-axis" text-anchor="end">← L · R →</text>
  </svg>`;
}

function bagSetClub(c) { bagClub = c; renderClubs(); }

// The section on the Range & Clubs page
function bagSectionHTML() {
  const stats = bagStats();
  if (!stats.length) return `<div class="card"><div class="card-title">🎒 My Bag · Gapping & Dispersion</div>
    <p style="font-size:0.84rem;color:var(--gray-mid);">Record a range session with the R10 — 5 or more shots per club — and your real carry distances, gaps and miss patterns appear here.</p></div>`;
  if (!bagClub || !stats.some(c => c.club === bagClub)) bagClub = stats[0].club;
  const sel = stats.find(c => c.club === bagClub), ins = bagInsights(stats);
  const pct = v => `${Math.round(v * 100)}%`;
  return `<div class="card">
    <div class="card-title">🎒 My Bag · Gapping & Dispersion</div>
    <div class="apex-hole-meta" style="margin-bottom:8px;">From your last ${BAG.RECENT_DAYS} days of full swings with a ball (up to ${BAG.PER_CLUB} per club). Bars show where 8 of 10 shots carry; ● average carry, | average total; gaps on the right (⚠ overlap).</div>
    ${bagLadderSVG(stats)}
    ${ins.length ? `<div class="bag-insights">${ins.slice(0, 5).map(x => `<div class="bag-insight"><span>${x.icon}</span><div>${x.text}</div></div>`).join('')}</div>` : ''}
    <div class="apex-subtitle" style="margin-top:14px;">Dispersion</div>
    <div class="range-chips" style="margin-bottom:8px;">${stats.map(c => `<button class="range-chip ${c.club === bagClub ? 'active' : ''}" onclick="bagSetClub('${c.club}')">${esc(c.club)}</button>`).join('')}</div>
    <div class="bag-disp-wrap">
      ${bagDispersionSVG(sel)}
      <div class="bag-disp-stats">
        <div><span>Carry</span><b>${Math.round(sel.carry)} ±${Math.round(sel.carrySD)}</b></div>
        <div><span>Total</span><b>${sel.total ? Math.round(sel.total) : '—'}</b></div>
        <div><span>Left–right</span><b>±${Math.round(sel.offSD)} yds</b></div>
        <div><span>Average line</span><b>${fmtOff(sel.off)}</b></div>
        <div><span>Misses</span><b>${pct(sel.left)} L · ${pct(sel.right)} R</b></div>
        <div><span>Face to path</span><b>${sel.faceToPath === null ? '—' : `${Math.abs(sel.faceToPath).toFixed(1)}° ${sel.faceToPath > 0.3 ? 'open' : sel.faceToPath < -0.3 ? 'closed' : ''}`}</b></div>
        <div><span>Mishits</span><b>${pct(sel.mishit)} of ${sel.n}</b></div>
        <div><span>Ball speed · spin</span><b>${fmtSpd(sel.ballMph)} · ${fmtSpin(sel.spin)}</b></div>
      </div>
    </div>
    <div class="apex-subtitle" style="margin-top:14px;">Yardage card</div>
    <div class="scorecard-wrap"><table class="scorecard bag-card">
      <thead><tr><th style="text-align:left;">Club</th><th>Carry</th><th>Total</th><th>8 of 10 carry</th><th>L–R</th><th>Gap</th></tr></thead>
      <tbody>${stats.map(c => `<tr><td style="text-align:left;font-weight:700;">${esc(c.club)}</td><td style="font-weight:800;">${Math.round(c.carry)}</td><td>${c.total ? Math.round(c.total) : '—'}</td>
        <td>${Math.round(c.lo)}–${Math.round(c.hi)}</td><td>±${Math.round(c.offSD)}</td>
        <td class="bag-gap-${c.gapState || 'none'}"${c.gapState === 'unmeasured' ? ` title="No data for ${esc(c.skipped.join(', '))}"` : ''}>${c.gap === null ? '—' : Math.round(c.gap)}</td></tr>`).join('')}</tbody></table></div>
    ${getWedgeShots().length ? `<div class="apex-subtitle" style="margin-top:12px;">Wedges by swing length</div>${drillWedgeTableHTML()}` : ''}
    <div class="apex-hole-meta" style="margin-top:8px;">Carry is modelled from launch data (fairway, sea level). Apex and the drills use these same clean numbers.</div>
  </div>`;
}

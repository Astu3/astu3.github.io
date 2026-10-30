// Golf Improvement App — Practice plan page.
// Classic script: shares globals with the other files; load order is set in golf-improvement-app.html.

// ════════════════════════════════════════════════════════════
// PRACTICE
// ════════════════════════════════════════════════════════════
function renderPractice() {
  const rounds = getAllRounds();
  const el = document.getElementById('practice-content');
  const recent = rounds.slice(0, 5);

  let recs = '';
  if (recent.length) {
    const sg    = strokesGainedLite(recent);
    const worst = [...sg.categories].sort((a, b) => a.sg - b.sg)[0];

    recs = `<div class="card">
      <div class="card-title">Strokes Gained — Where You're Losing Shots (Last ${recent.length} Rounds)</div>
      <p style="font-size:0.8rem;color:var(--gray-mid);margin-bottom:16px;">Estimated strokes vs a ~mid-90s baseline golfer, per 18 holes. Negative (red) = losing shots. <em>Approximate — a directional guide, not tour data.</em></p>
      ${strokesGainedRows(sg)}
      <div class="sg-focus"><strong>🎯 Focus:</strong> ${SG_FOCUS[worst.key]}</div>
    </div>`;
  }

  el.innerHTML = `
    ${recs}
    <div class="card">
      <div class="card-title">Recommended Drills</div>
      <div class="drill-card">
        <div class="drill-badge badge-green">Putting</div>
        <div class="drill-title">Gate Drill — 6 ft Confidence Builder</div>
        <div class="drill-desc">Place two tees just wider than your putter face, 6 feet from the hole. Make 10 consecutive putts before moving to 8 ft. Builds stroke consistency and confidence inside makeable range.</div>
      </div>
      <div class="drill-card gold">
        <div class="drill-badge badge-gold">Putting</div>
        <div class="drill-title">Clock Drill — 3/6/9 ft Around the Hole</div>
        <div class="drill-desc">Place 4 balls at 3 ft, 4 at 6 ft, 4 at 9 ft at 12 o'clock intervals. Complete all 12 in order. Great for reading break from multiple angles and building pressure tolerance.</div>
      </div>
      <div class="drill-card blue">
        <div class="drill-badge badge-blue">Iron Play</div>
        <div class="drill-title">Stock Shot Groove — 7 Iron to a Target</div>
        <div class="drill-desc">Hit 30 balls with a 7 iron focusing on a specific target 150 yds away. Track dispersion: how many land within a 15 yd radius? Goal is 80%+ consistency with your stock swing.</div>
      </div>
      <div class="drill-card">
        <div class="drill-badge badge-green">Chipping</div>
        <div class="drill-title">Up-and-Down Challenge</div>
        <div class="drill-desc">Drop 5 balls around the green at different lies (tight, fluffy, uphill, downhill, side-hill). Get up and down in 2 from each. Track your success rate over time.</div>
      </div>
      <div class="drill-card gold">
        <div class="drill-badge badge-gold">Driver</div>
        <div class="drill-title">Fairway Finder — Alignment Station</div>
        <div class="drill-desc">Set up 2 alignment sticks parallel to your target. Hit 20 drivers focusing on a narrower "fairway" in the range. Eliminate the big miss by ingraining correct alignment before every shot.</div>
      </div>
    </div>

    <div class="card">
      <div class="card-title">Pro Tips & Mental Game</div>
      ${tipSection('Pre-Shot Routine', `<ul>
        <li>Stand behind the ball and visualize the shot before approaching.</li>
        <li>Pick a specific intermediate target 2–3 ft ahead of the ball to align to.</li>
        <li>Commit to one swing thought — never two.</li>
        <li>Keep your routine the same whether it's hole 1 or hole 18.</li>
      </ul>`)}
      ${tipSection('Course Management', `<ul>
        <li>Play to the fat part of the green, not the flag, unless you have a clear look.</li>
        <li>Know your actual carry distances — most amateurs overestimate by 10–15 yards.</li>
        <li>From trouble, always take your medicine. A bogey beats a double every time.</li>
        <li>On par 5s, think "can I get to 100 yards from here?" — the money zone.</li>
      </ul>`)}
      ${tipSection('Scoring Mindset', `<ul>
        <li>Focus on the next shot, not the last one. Each shot is independent.</li>
        <li>Have a "reset phrase" ready (e.g. "next shot") to stop a bad hole becoming a bad round.</li>
        <li>Celebrate pars. They are the goal — not birdies.</li>
        <li>Accept bogeys on hard holes. Elite amateurs average under 1 bogey per 3 holes.</li>
      </ul>`)}
      ${tipSection('Practice Efficiency', `<ul>
        <li>Practice with purpose: pick a target for every shot on the range, no mindless hitting.</li>
        <li>Short game = 60% of shots. Spend at least half of practice time within 50 yards.</li>
        <li>Simulate on-course pressure: play games on the putting green with stakes.</li>
        <li>Film your swing monthly to track real changes, not just how it feels.</li>
      </ul>`)}
    </div>
  `;

  document.querySelectorAll('.tip-header').forEach(h => {
    h.addEventListener('click', () => {
      const body = h.nextElementSibling;
      const open = body.style.display === 'block';
      body.style.display = open ? 'none' : 'block';
      h.classList.toggle('open', !open);
    });
  });
}

function tipSection(title, html) {
  return `<div class="tip-section">
    <div class="tip-header">${title} <span>▼</span></div>
    <div class="tip-body">${html}</div>
  </div>`;
}

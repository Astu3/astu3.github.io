// Golf Improvement App — Round history and per-course score trend.
// Classic script: shares globals with the other files; load order is set in golf-improvement-app.html.

// ════════════════════════════════════════════════════════════
// HISTORY
// ════════════════════════════════════════════════════════════
function renderHistory() {
  const rounds = getAllRounds();
  const el = document.getElementById('history-content');

  if (!rounds.length) {
    el.innerHTML = `<div class="empty-state">
      <div class="empty-icon">📋</div>
      <div class="empty-text">No rounds yet</div>
      <div class="empty-sub">Start tracking your game!</div>
      <br><button class="btn btn-primary" onclick="showPage('new-round')">+ Add Round</button>
    </div>`;
    return;
  }

  const rows = rounds.map(r => roundRowHTML(r, `GIR: ${r.girPct}% &nbsp;·&nbsp; Putts: ${r.putts}`)).join('');

  el.innerHTML = `<div id="course-comparison"></div><div class="card">${rows}</div>`;
  renderCourseComparisonSection();
}

// ════════════════════════════════════════════════════════════
// COURSE COMPARISON  (score trend per course)
// ════════════════════════════════════════════════════════════
function renderCourseComparisonChart(courseName) {
  const canvas = document.getElementById('course-chart');
  if (!canvas) return;
  canvas.width = canvas.offsetWidth || canvas.parentElement.offsetWidth;
  const rounds = getAllRounds()
    .filter(r => r.course.toLowerCase() === courseName.toLowerCase())
    .reverse(); // oldest first
  if (rounds.length < 2) {
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = '#aab8b0';
    ctx.font = '12px Segoe UI,sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('Need 2+ rounds at this course', canvas.width / 2, canvas.height / 2);
    return;
  }
  const points = rounds.map(r => ({
    y: r.score - r.par,
    label: new Date(r.date + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  }));
  // Score vs par: lower is better, so invert
  drawLineChart(canvas, points, {
    color: '#457b9d',
    fillColor: 'rgba(69,123,157,0.12)',
    inverted: true
  });
}

function renderCourseComparisonSection() {
  const rounds = getAllRounds();
  const el = document.getElementById('course-comparison');
  if (!el) return;

  // Find courses with 2+ rounds
  const counts = {};
  rounds.forEach(r => { counts[r.course] = (counts[r.course] || 0) + 1; });
  const courses = Object.entries(counts).filter(([,n]) => n >= 2).map(([name]) => name).sort();

  if (!courses.length) { el.style.display = 'none'; return; }
  el.style.display = '';

  const select = document.getElementById('course-comparison-select');
  const current = select ? select.value : courses[0];
  const selected = courses.includes(current) ? current : courses[0];

  el.innerHTML = `
    <div class="card">
      <div class="card-title">Score Trend by Course</div>
      <div class="course-select-row">
        <label>Course</label>
        <select id="course-comparison-select" onchange="renderCourseComparisonChart(this.value); renderCourseComparisonSection();">
          ${courses.map(c => `<option value="${esc(c)}" ${c === selected ? 'selected' : ''}>${esc(c)}</option>`).join('')}
        </select>
      </div>
      <canvas id="course-chart" class="chart-canvas" height="150"></canvas>
      <p style="font-size:0.75rem;color:var(--gray-mid);margin-top:8px;text-align:center;">Score vs par over time — lower is better</p>
    </div>`;

  requestAnimationFrame(() => renderCourseComparisonChart(selected));
}

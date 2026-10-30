// Golf Improvement App — Dashboard, handicap/penalty trend charts, handicap goal.
// Classic script: shares globals with the other files; load order is set in golf-improvement-app.html.

// ════════════════════════════════════════════════════════════
// DASHBOARD
// ════════════════════════════════════════════════════════════
function renderDashboard() {
  const rounds  = getAllRounds();
  const profile = getProfile();
  const hcp     = calcHandicap(rounds);
  const info    = getTierInfo(profile.totalXP);
  const el      = document.getElementById('dashboard-content');
  const completedToday = getCompletedToday();

  if (!rounds.length) {
    el.innerHTML = `
      <div class="handicap-banner" style="justify-content:center;text-align:center;">
        <div>
          <div style="font-size:2rem;margin-bottom:8px;">⛳</div>
          <div style="font-size:1.2rem;font-weight:700;">Welcome to Golf Improvement!</div>
          <div style="opacity:0.8;margin-top:6px;margin-bottom:16px;">Log a round, or train speed, drills or Apex, to start earning XP and badges.</div>
          <button class="btn btn-gold" onclick="showPage('new-round')">+ Add First Round</button>
        </div>
      </div>
      ${coachCardHTML()}
      ${thisWeekCardHTML()}
      ${renderDailyTasksHTML(completedToday)}
      ${speedGoalHTML(true)}
      ${recordsCardHTML()}
      ${renderGoalsCard(rounds)}
      ${renderQuestsWidget(rounds)}`;
    return;
  }

  const recent5   = rounds.slice(0, 5);
  // Score and putt averages only make sense within one format, so use the
  // last 5 rounds of the same length as the most recent round.
  const fmt       = rounds[0].holeCount || 18;
  const sameFmt   = rounds.filter(r => (r.holeCount || 18) === fmt).slice(0, 5);
  const avgScore  = avg(sameFmt, r => r.score);
  const avgPutts  = avg(sameFmt, r => r.putts);
  const avgFIR    = avg(recent5, r => r.firPct);
  const avgGIR    = avg(recent5, r => r.girPct);
  // Penalties shown per 18 so 9- and 18-hole rounds are comparable
  const avgPen    = recent5.reduce((s, r) => s + roundPenalties(r) * 18 / (r.holeCount || 18), 0) / recent5.length;

  const hcpValue = hcp ? hcp.value : null;
  const hcpProvisional = hcp ? hcp.provisional : false;
  const prevHcpResult = rounds.length >= 2 ? calcHandicap(rounds.slice(1)) : null;
  const prevHcp = prevHcpResult ? prevHcpResult.value : null;
  const trend = (hcpValue !== null && prevHcp !== null)
    ? (hcpValue < prevHcp ? `▼ ${(prevHcp-hcpValue).toFixed(1)} improving` : hcpValue > prevHcp ? `▲ ${(hcpValue-prevHcp).toFixed(1)} higher` : '→ steady')
    : '';

  const recentRows = recent5.map(r => roundRowHTML(r)).join('');

  el.innerHTML = `
    <div class="handicap-banner">
      <div>
        <div class="handicap-index">${hcpStr(hcpValue)}</div>
        <div class="handicap-label">${hcpProvisional ? 'Provisional Index' : 'Handicap Index'}</div>
      </div>
      <div style="text-align:right;">
        <div style="font-size:1.1rem;font-weight:800;">${info.name}</div>
        <div style="font-size:0.8rem;opacity:0.8;">${profile.totalXP.toLocaleString()} XP</div>
        ${trend ? `<div class="handicap-trend" style="margin-top:6px;">${trend}</div>` : ''}
      </div>
    </div>

    ${coachCardHTML()}

    ${thisWeekCardHTML()}

    <div class="card" style="margin-bottom:20px;">
      <div class="card-title">Handicap Trend</div>
      <canvas id="handicap-chart" class="chart-canvas" height="150"></canvas>
      <p style="font-size:0.75rem;color:var(--gray-mid);margin-top:8px;text-align:center;">Lower is better — chart inverted so improvement goes up</p>
    </div>

    <div class="stat-grid" style="margin-bottom:20px;">
      <div class="stat-box">
        <div class="stat-value">${avgScore || '—'}</div>
        <div class="stat-label">Avg Score (${fmt}H)</div>
      </div>
      <div class="stat-box gold">
        <div class="stat-value">${avgPutts || '—'}</div>
        <div class="stat-label">Avg Putts (${fmt}H)</div>
      </div>
      <div class="stat-box blue">
        <div class="stat-value">${avgGIR ? avgGIR+'%' : '—'}</div>
        <div class="stat-label">GIR %</div>
      </div>
      <div class="stat-box">
        <div class="stat-value">${avgFIR ? avgFIR+'%' : '—'}</div>
        <div class="stat-label">FIR %</div>
      </div>
      <div class="stat-box gold">
        <div class="stat-value">${avgPen.toFixed(1)}</div>
        <div class="stat-label">Penalties / 18</div>
      </div>
    </div>

    <div class="card" style="margin-bottom:20px;">
      <div class="card-title">Penalty Strokes Trend</div>
      <canvas id="penalties-chart" class="chart-canvas" height="150"></canvas>
      <p style="font-size:0.75rem;color:var(--gray-mid);margin-top:8px;text-align:center;">Per 18 holes — fewer is better (chart inverted so improvement goes up)</p>
    </div>

    ${renderGoalsCard(rounds)}

    ${renderDailyTasksHTML(completedToday)}

    ${speedGoalHTML(true)}

    ${recordsCardHTML()}

    ${renderQuestsWidget(rounds)}

    <div class="card">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;">
        <div class="card-title" style="margin:0">Recent Rounds</div>
        <button class="btn btn-primary btn-sm" onclick="showPage('new-round')">+ New Round</button>
      </div>
      ${recentRows}
    </div>

    <div class="card">
      <div class="card-title">Performance Breakdown (Last 5 Rounds)</div>
      ${statBar('Greens in Regulation', avgGIR, 100, '')}
      ${statBar('Fairways in Regulation', avgFIR, 100, 'gold')}
      ${statBar('Putting Efficiency', puttEff(avgPutts * 18 / fmt), 100, 'blue')}
    </div>

    ${scoringDistributionHTML(rounds, 'Scoring Breakdown (All Rounds)')}
  `;
  requestAnimationFrame(() => { drawHandicapChart(); drawPenaltiesChart(); });
}

function renderDailyTasksHTML(completedToday) {
  // On the course, then training (so practice days have tasks too)
  const row = t => {
    const done = completedToday.includes(t.id);
    return `<div class="task-item ${done ? 'done' : ''}">
      <div class="task-icon">${t.icon}</div>
      <div class="task-text">
        <div class="task-name">${t.name}</div>
        <div class="task-desc">${t.desc}</div>
      </div>
      <div class="task-xp">+${t.xp} XP</div>
      <div class="task-check">${done ? '✅' : '○'}</div>
    </div>`;
  };
  const tasksHTML = `<div class="task-group">On the course</div>${DAILY_TASKS.filter(t => t.group !== 'train').map(row).join('')}
    <div class="task-group">Training</div>${DAILY_TASKS.filter(t => t.group === 'train').map(row).join('')}`;

  const doneCount = DAILY_TASKS.filter(t => completedToday.includes(t.id)).length;

  return `<div class="card">
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;">
      <div class="card-title" style="margin:0;">Daily Tasks</div>
      <span style="font-size:0.8rem;font-weight:700;color:var(--gold-dark);">${doneCount}/${DAILY_TASKS.length} done</span>
    </div>
    ${tasksHTML}
  </div>`;
}

function statBar(name, val, max, cls) {
  const pct = val ? Math.min(100, Math.round(val/max*100)) : 0;
  return `
    <div class="stat-row">
      <div class="stat-name">${name}</div>
      <div class="stat-pct">${val ? val+'%' : '—'}</div>
    </div>
    <div class="progress-bar-wrap" style="margin-bottom:14px;">
      <div class="progress-bar ${cls}" style="width:${pct}%"></div>
    </div>`;
}

function puttEff(avgPutts) {
  if (!avgPutts) return 0;
  return Math.max(0, Math.min(100, Math.round((36 - avgPutts) / 9 * 100)));
}

// ════════════════════════════════════════════════════════════
// HANDICAP HISTORY
// ════════════════════════════════════════════════════════════
function buildHandicapHistory(rounds) {
  const sorted = [...rounds].reverse(); // oldest first
  const points = [];
  for (let i = 0; i < sorted.length; i++) {
    const subset = sorted.slice(0, i + 1).reverse(); // newest-first for calcHandicap
    const hcp = calcHandicap(subset);
    if (hcp) {
      const d = new Date(sorted[i].date + 'T12:00:00');
      points.push({
        y: hcp.value,
        label: d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
      });
    }
  }
  return points;
}

function drawHandicapChart() {
  const canvas = document.getElementById('handicap-chart');
  if (!canvas) return;
  canvas.width = canvas.offsetWidth || canvas.parentElement.offsetWidth;
  const points = buildHandicapHistory(getAllRounds());
  // Handicap improving = going down, so we invert so "down" looks good visually
  drawLineChart(canvas, points, {
    color: '#2d6a4f',
    fillColor: 'rgba(82,183,136,0.15)',
    inverted: true   // lower handicap = higher on chart
  });
}

function drawPenaltiesChart() {
  const canvas = document.getElementById('penalties-chart');
  if (!canvas) return;
  canvas.width = canvas.offsetWidth || canvas.parentElement.offsetWidth;
  const rounds = getAllRounds().slice().reverse(); // oldest first
  const points = rounds.map(r => {
    const holes = r.holeCount || (r.holes || []).length || 18;
    return {
      y: roundPenalties(r) * (18 / holes), // normalize to per-18
      label: new Date(r.date + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
    };
  });
  drawLineChart(canvas, points, {
    color: '#e63946',
    fillColor: 'rgba(230,57,70,0.12)',
    inverted: true   // fewer penalties = higher on chart
  });
}

// ════════════════════════════════════════════════════════════
// GOALS  (target handicap, progress tied to current index)
// ════════════════════════════════════════════════════════════
function getGoals() {
  return loadData(KEYS.goals, null);
}
function saveGoals(g) { saveData(KEYS.goals, g); }

function setHandicapGoal() {
  const input = prompt('Set your target Handicap Index (e.g. 12.0):',
    getGoals()?.targetHandicap ?? '');
  if (input === null) return;
  const target = parseFloat(input);
  if (isNaN(target) || target < 0 || target > 54) { showToast('⚠️ Enter a valid index (0–54)'); return; }
  const hcp   = calcHandicap(getAllRounds());
  const prev  = getGoals();
  saveGoals({
    targetHandicap: parseFloat(target.toFixed(1)),
    startHandicap: prev?.startHandicap ?? (hcp ? hcp.value : null),
    setAt: prev?.setAt ?? todayISO()
  });
  showToast('🎯 Goal set!');
  renderDashboard();
}

function clearGoal() {
  store.removeItem(uk(KEYS.goals));
  showToast('Goal cleared');
  renderDashboard();
}

function renderGoalsCard(rounds) {
  const g   = getGoals();
  const hcp = calcHandicap(rounds);
  const cur = hcp ? hcp.value : null;

  if (!g) {
    return `<div class="card">
      <div class="card-title">Goal</div>
      <p style="font-size:0.85rem;color:var(--gray-mid);margin-bottom:12px;">Set a target handicap to track your progress over time. (Scoring goals like "Break 90" live in the Quests tab.)</p>
      <button class="btn btn-gold btn-sm" onclick="setHandicapGoal()">🎯 Set Handicap Goal</button>
    </div>`;
  }

  const start = (typeof g.startHandicap === 'number') ? g.startHandicap : cur;
  let pct = 0, achieved = false;
  if (cur !== null) {
    if (cur <= g.targetHandicap) { pct = 100; achieved = true; }
    else if (start !== null && start > g.targetHandicap) {
      pct = Math.max(0, Math.min(100, Math.round((start - cur) / (start - g.targetHandicap) * 100)));
    }
  }

  const curStr   = hcpStr(cur);
  const startStr = hcpStr(typeof start === 'number' ? start : null);

  return `<div class="card">
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;">
      <div class="card-title" style="margin:0;">Handicap Goal</div>
      <div>
        <button class="btn btn-sm" style="background:var(--gray-light);color:var(--gray-dark);font-size:0.74rem;" onclick="setHandicapGoal()">Edit</button>
        <button class="btn btn-sm" style="background:var(--gray-light);color:var(--gray-dark);font-size:0.74rem;" onclick="clearGoal()">Clear</button>
      </div>
    </div>
    ${achieved
      ? `<div class="sg-focus" style="background:#fff8e8;"><strong>🏆 Goal achieved!</strong> You hit your target of ${hcpStr(g.targetHandicap)}. Set a new one?</div>`
      : `<div style="display:flex;justify-content:space-between;font-size:0.85rem;margin-bottom:6px;">
          <span>Now: <strong>${curStr}</strong></span>
          <span style="color:var(--gray-mid);">Start: ${startStr}</span>
          <span>Target: <strong style="color:var(--gold-dark);">${hcpStr(g.targetHandicap)}</strong></span>
        </div>
        <div class="progress-bar-wrap"><div class="progress-bar gold" style="width:${pct}%"></div></div>
        <p style="font-size:0.78rem;color:var(--gray-mid);margin-top:8px;">${pct}% of the way from your starting index to your goal.</p>`
    }
  </div>`;
}

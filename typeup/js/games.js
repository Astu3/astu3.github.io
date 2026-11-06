'use strict';
// ═══════════════════════════════════════════════════════════════════════════
// TypeUp — games. Both use only keys the player has learned, and both count
// toward the daily goal and XP (but not the speed charts).
// ═══════════════════════════════════════════════════════════════════════════

const GAMES = {
  fairway: { title: 'Fairway Drop', icon: '⛳', color: '#52b788', tag: 'Golf · Quick eyes', unit: 'Points',
    desc: 'Words fall like golf balls toward the pond. Type each one before it splashes. You have 3 balls, and the pace picks up as you go.' },
  twominute: { title: 'Two-Minute Drill', icon: '🏈', color: '#b07cff', tag: 'Vikings · Speed and accuracy', unit: 'Points',
    desc: 'Two minutes on the clock, ball on your own 25. Type each play to move downfield. Faster plays gain more yards, and every mistake is a penalty.' },
  putt: { title: 'Putt Out', icon: '🏌️', color: '#ffd166', tag: 'Golf · Smooth and steady', unit: 'Strokes', lower: true,
    desc: 'Nine holes on the putting green. Type each putt cleanly and at your pace to drain it. Slips lip out, slow putts come up short. Par is 18.' },
};

const PLAYS = [
  'hut hut', 'go deep', 'skol vikings', 'run the ball', 'play action', 'quick slant', 'screen pass', 'hard count',
  'stay in bounds', 'spike the ball', 'move the chains', 'first and ten', 'third and short', 'hurry up', 'no huddle',
  'pick up the blitz', 'go for two', 'fair catch', 'deep post', 'out route', 'block for the runner', 'clock is running',
  'get out of bounds', 'purple and gold', 'protect the ball', 'great catch', 'what a run', 'hold the line',
  'read the defense', 'find the open man', 'throw it away', 'keep your feet', 'break the tackle', 'trust the line',
];

function gameWords(p) {
  const learned = lessonsPassed(p) ? learnedSet(p) : cumChars(1);
  const ok = s => [...s].every(c => learned.has(c));
  const words = WORDS.filter(ok);
  return { ok, words: words.length >= 8 ? words : WORDS.filter(w => [...w].every(c => cumChars(1).has(c))) };
}
const recentWpm = p => { const r = p.history.filter(countsForTrend).slice(-10); return r.length ? mean(r.map(h => h.wpm)) : 12; };

function gameOver(id, { score, wpm, acc, ms, chars, lines }) {
  const p = me();
  const g = p.games[id] || (p.games[id] = { best: 0, plays: 0 });
  const lower = GAMES[id].lower;   // golf scoring: fewer strokes is better
  const better = lower ? score < g.best : score > g.best;
  const isBest = g.plays > 0 && better;
  g.best = g.plays === 0 || better ? score : g.best;
  g.plays++;
  if (ms > 3000 && chars > 0) recordRun(p, { kind: 'game', ref: id, wpm, acc, ms, chars });
  else save();
  if (isBest) Sound.pass(); else Sound.done();
  const plan = planResult([{ label: 'Play again', action: () => go(id) }, { label: 'All games', action: () => go('games') }]);
  openModal(`<h2>${isBest ? (lower ? 'New best round! 🎉' : 'New high score! 🎉') : lower ? 'Round complete' : 'Game over'}</h2>
    ${plan.banner}
    <div class="big-stats">
      <div class="stat"><div class="v">${score}</div><div class="k">${GAMES[id].unit}</div></div>
      <div class="stat"><div class="v">${Math.round(wpm)}</div><div class="k">Words per minute</div></div>
      <div class="stat"><div class="v">${fmtAcc(acc)}</div><div class="k">Accuracy</div></div>
    </div>
    ${lines ? `<p class="muted" style="margin-bottom:14px">${esc(lines)}</p>` : ''}
    ${celebrations(p)}
    <p class="compare">${lower ? 'Best round' : 'High score'}: <b>${g.best}</b> · ${g.plays} game${g.plays === 1 ? '' : 's'} played</p>`,
    plan.buttons);
}

// Shared pause/quit handling while a game is running.
function gameShell(id, sub, stats) {
  const g = GAMES[id];
  $('#app').innerHTML = `
    <div class="type-head">
      <button class="btn ghost" id="g-back">← Games</button>
      <div><div class="title">${g.icon} ${esc(g.title)}</div><div class="sub">${esc(sub)}</div></div>
      <div class="live">${stats.map(([key, label, v]) => `<div><b id="g-${key}">${v}</b><span>${label}</span></div>`).join('')}</div>
    </div>
    <div id="g-body"></div>`;
  $('#g-back').onclick = () => go('games');
  return $('#g-body');
}

SCREENS.games = function () {
  const p = me();
  $('#app').innerHTML = `
    <h1>Games</h1>
    <p class="muted" style="margin-top:6px">Practice that doesn't feel like practice. Games only use keys you've learned, and they count toward your daily goal.</p>
    <div class="grid games-grid" style="margin-top:20px">${Object.entries(GAMES).map(([id, g]) => {
      const rec = p.games?.[id];
      return `<div class="card game-card" style="--c:${g.color}">
        <div class="game-art ${id}"><span>${g.icon}</span></div>
        <div class="app-tag">${esc(g.tag)}</div>
        <h2>${esc(g.title)}</h2>
        <p class="muted">${esc(g.desc)}</p>
        <div class="game-foot"><span class="muted small">${rec ? `${g.lower ? 'Best round' : 'High score'} ${rec.best} · ${rec.plays} played` : 'Not played yet'}</span>
        <button class="btn" data-play="${id}" style="background:${g.color}">Play →</button></div>
      </div>`;
    }).join('')}</div>`;
  p.games ||= {};
  $$('[data-play]').forEach(b => b.onclick = () => go(b.dataset.play));
};

// ── Fairway Drop ───────────────────────────────────────────────────────────
SCREENS.fairway = function () {
  const p = me();
  const { words } = gameWords(p);
  const short = words.filter(w => w.length <= 4);
  const wpm0 = recentWpm(p);
  const body = gameShell('fairway', 'Type a ball\'s word before it reaches the pond · Esc pauses', [['score', 'Score', 0], ['balls', 'Balls', '⚪⚪⚪'], ['mult', 'Bonus', '×1']]);
  body.innerHTML = `
    <div class="fd-field" id="fd">
      <div class="fd-flag">⛳</div>
      <div class="fd-pond"></div>
      <div class="fd-msg" id="fd-msg"><b>Ready to tee off?</b><span>Type the word on any ball. Press the space bar to start.</span></div>
    </div>
    <div class="fd-typed" id="fd-typed"></div>`;
  const field = $('#fd'), msg = $('#fd-msg'), typed = $('#fd-typed');

  let balls = [], buffer = '', target = null;
  let score = 0, lives = 3, clean = 0, t = 0, spawnIn = 0;
  let keystrokes = 0, correct = 0, chars = 0, sunk = 0;
  let running = false, paused = false, over = false, raf = 0, last = 0;
  const mult = () => Math.min(5, 1 + Math.floor(clean / 5));
  const H = () => field.clientHeight, pondH = 56;
  // Start slower for slower typists; the pace tightens with time.
  const fallTime = () => Math.max(3.2, Math.min(11, Math.max(5.5, 11 - wpm0 * 0.2)) - t * 0.035);
  const spawnEvery = () => Math.max(0.85, 2.6 - t * 0.018);

  const paintStats = () => {
    $('#g-score').textContent = score;
    $('#g-balls').textContent = '⚪'.repeat(lives) + '◌'.repeat(3 - lives);
    $('#g-mult').textContent = '×' + mult();
    typed.innerHTML = buffer ? `<span class="keycap">${esc(buffer)}</span>` : '<span class="muted small">Start typing a word…</span>';
  };
  const paintBall = b => {
    [...b.el.children].forEach((sp, i) => sp.classList.toggle('hit', b === target && i < buffer.length));
    b.el.classList.toggle('aim', b === target);
  };
  const spawn = () => {
    const pool = t < 25 && short.length >= 5 ? short : words;
    let w = pick(pool);
    for (let i = 0; i < 12 && balls.some(b => b.word[0] === w[0] || b.word === w); i++) w = pick(pool);
    const el = document.createElement('div');
    el.className = 'fd-ball';
    el.innerHTML = [...w].map(c => `<span>${esc(c)}</span>`).join('');
    field.appendChild(el);
    const maxX = Math.max(10, field.clientWidth - el.offsetWidth - 10);
    const b = { word: w, el, x: 10 + Math.random() * (maxX - 10), y: -40, speed: (H() - pondH) / fallTime() };
    el.style.transform = `translate(${b.x}px, ${b.y}px)`;
    balls.push(b);
  };
  const remove = (b, cls) => {
    balls = balls.filter(x => x !== b);
    b.el.classList.add(cls);
    setTimeout(() => b.el.remove(), 450);
  };
  const end = () => {
    over = true; running = false; cancelAnimationFrame(raf);
    const ms = t * 1000;
    gameOver('fairway', { score, ms, chars, wpm: ms > 1500 ? (chars / 5) / (ms / 60000) : 0, acc: keystrokes ? correct / keystrokes * 100 : 100,
      lines: `${sunk} ball${sunk === 1 ? '' : 's'} sunk in ${fmtTime(ms)}.` });
  };
  const frame = now => {
    if (!running || paused) return;
    if (modalOpen) return pause(true);   // Settings opened mid-game
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now; t += dt;
    spawnIn -= dt;
    if (spawnIn <= 0) { spawn(); spawnIn = spawnEvery(); }
    const limit = H() - pondH - 18;
    for (const b of [...balls]) {
      b.y += b.speed * dt;
      b.el.style.transform = `translate(${b.x}px, ${b.y}px)`;
      if (b.y >= limit) {
        remove(b, 'splash');
        lives--; clean = 0;
        if (b === target) { target = null; buffer = ''; }
        Sound.error();
        paintStats();
        if (lives <= 0) return end();
      }
    }
    raf = requestAnimationFrame(frame);
  };
  const start = () => { running = true; msg.hidden = true; last = performance.now(); raf = requestAnimationFrame(frame); };
  const pause = on => {
    if (!running && !paused) return;
    paused = on;
    msg.hidden = !on;
    msg.innerHTML = '<b>Paused</b><span>Press Esc to keep playing.</span>';
    if (!on) { running = true; last = performance.now(); raf = requestAnimationFrame(frame); } else { running = false; cancelAnimationFrame(raf); }
  };
  const onVis = () => { if (document.hidden && running) pause(true); };
  document.addEventListener('visibilitychange', onVis);
  setCleanup(() => { over = true; running = false; cancelAnimationFrame(raf); document.removeEventListener('visibilitychange', onVis); });
  paintStats();

  setKeyHandler(e => {
    if (over || e.ctrlKey || e.altKey || e.metaKey) return;
    if (e.key === 'Escape') { e.preventDefault(); pause(!paused); return; }
    if (!running && !paused) { if (e.key === ' ' || e.key.length === 1) { e.preventDefault(); start(); } return; }
    if (paused) return;
    if (e.key === 'Backspace') {
      e.preventDefault();
      buffer = buffer.slice(0, -1);
      if (!buffer) target = null;
      balls.forEach(paintBall); paintStats();
      return;
    }
    if (e.key.length !== 1 || e.key === ' ') { if (e.key === ' ') e.preventDefault(); return; }
    e.preventDefault();
    if (e.repeat) return;
    const cand = buffer + e.key;
    keystrokes++;
    const next = target?.word.startsWith(cand) ? target
      : balls.filter(b => b.word.startsWith(cand)).sort((a, b) => b.y - a.y)[0];
    if (!next) {
      clean = 0; Sound.error();
      typed.classList.remove('shake'); void typed.offsetWidth; typed.classList.add('shake');
      paintStats();
      return;
    }
    correct++;
    buffer = cand; target = next;
    if (buffer === target.word) {
      clean++; sunk++;
      score += target.word.length * 10 * mult();
      chars += target.word.length + 1;
      remove(target, 'sink');
      Sound.tone(1320, 0.12, { gain: 0.05 }); Sound.tone(1760, 0.16, { at: 0.06, gain: 0.04 });
      target = null; buffer = '';
    } else Sound.click();
    balls.forEach(paintBall); paintStats();
  });
};

// ── Two-Minute Drill ───────────────────────────────────────────────────────
SCREENS.twominute = function () {
  const p = me();
  const { ok, words } = gameWords(p);
  const plays = PLAYS.filter(ok);
  const makePlay = () => plays.length >= 6 ? pick(plays) : Array.from({ length: 2 }, () => pick(words)).join(' ');
  const target = Math.max(8, recentWpm(p));
  const body = gameShell('twominute', 'Type each play cleanly. Mistakes are penalties.', [['score', 'Vikings', 0], ['clock', 'Clock', '2:00'], ['spot', 'Ball on', 'own 25']]);
  body.innerHTML = `
    <div class="tm-field" id="tm-field">
      <div class="tm-ez own"></div>
      <div class="tm-grass">${[10, 20, 30, 40, 50, 60, 70, 80, 90].map(y => `<div class="tm-line" style="left:${y}%"><span>${y <= 50 ? y : 100 - y}</span></div>`).join('')}</div>
      <div class="tm-ez goal"><span>TOUCHDOWN</span></div>
      <div class="tm-ball" id="tm-ball">🏈</div>
    </div>
    <div class="tm-call" id="tm-call">Press the first key of the play to snap the ball. The clock starts on the snap.</div>
    <div class="textbox tm-box"><div class="inner" id="tm-play"></div></div>
    <div class="tm-log" id="tm-log"></div>`;

  let yard = 25, score = 0, tds = 0, totalYards = 0, penalties = 0;
  let play = '', pos = 0, playErrors = 0, playStart = 0;
  let keystrokes = 0, correct = 0, chars = 0;
  let clockStart = 0, over = false, timer = 0, busy = false;
  const LIMIT = 120000;

  const spotLabel = () => yard >= 100 ? 'end zone' : yard < 50 ? `own ${Math.max(1, Math.round(yard))}` : yard === 50 ? 'the 50' : `their ${Math.max(1, Math.round(100 - yard))}`;
  const paintField = () => {
    $('#tm-ball').style.left = `calc(8% + ${Math.min(100, yard) * 0.84}%)`;
    $('#g-spot').textContent = spotLabel();
    $('#g-score').textContent = score;
  };
  const paintPlay = () => {
    $('#tm-play').innerHTML = [...play].map((c, i) => `<span class="ch${c === ' ' ? ' sp' : ''}${i < pos ? ' ok' : ''}${i === pos ? ' cur' : ''}">${esc(c)}</span>`).join('');
  };
  const log = (text, cls = '') => {
    const el = $('#tm-log');
    el.innerHTML = `<span class="${cls}">${esc(text)}</span>`;
  };
  const nextPlay = () => { play = makePlay(); pos = 0; playErrors = 0; playStart = 0; paintPlay(); };
  const remaining = () => clockStart ? Math.max(0, LIMIT - (performance.now() - clockStart)) : LIMIT;
  let lastTick = 0;
  const tick = () => {
    // The clock stops while a dialog is open or the window is hidden.
    const now = performance.now();
    if (lastTick && (modalOpen || document.hidden)) clockStart += now - lastTick;
    lastTick = now;
    const r = remaining();
    const el = $('#g-clock');
    el.textContent = fmtTime(Math.ceil(r / 1000) * 1000);
    el.classList.toggle('late', r < 15000);
    if (r <= 0) end();
  };
  const end = () => {
    if (over) return;
    over = true; clearInterval(timer);
    const ms = clockStart ? Math.min(LIMIT, performance.now() - clockStart) : 0;
    gameOver('twominute', { score, ms, chars, wpm: ms > 1500 ? (chars / 5) / (ms / 60000) : 0, acc: keystrokes ? correct / keystrokes * 100 : 100,
      lines: `${tds} touchdown${tds === 1 ? '' : 's'} · ${totalYards} yards gained · ${penalties} penalt${penalties === 1 ? 'y' : 'ies'}.` });
  };
  setCleanup(() => { over = true; clearInterval(timer); });
  nextPlay(); paintField();

  setKeyHandler(e => {
    if (over || busy || e.ctrlKey || e.altKey || e.metaKey) return;
    if (e.key.length !== 1) return;
    e.preventDefault();
    if (e.repeat) return;
    const now = performance.now();
    if (!clockStart) { clockStart = now; timer = setInterval(tick, 200); $('#tm-call').textContent = 'Hike! Keep the drive alive.'; }
    if (!playStart) playStart = now;
    keystrokes++;
    if (e.key !== play[pos]) {
      playErrors++; penalties++;
      yard = Math.max(1, yard - 2);
      log('🚩 Flag on the play: 2-yard penalty', 'flag');
      Sound.error(); paintField();
      return;
    }
    correct++; pos++;
    Sound.click();
    if (pos < play.length) { paintPlay(); return; }

    // Play complete: yards depend on speed against your own recent average.
    chars += play.length + 1;
    const playWpm = (play.length / 5) / (Math.max(300, now - playStart) / 60000);
    const factor = Math.min(2.2, Math.max(0.4, playWpm / target));
    let gain = Math.max(2, Math.round(play.length * 0.45 * factor + Math.random() * 3));
    if (!playErrors) gain += 3;
    yard += gain; totalYards += gain;
    if (yard >= 100) {
      score += 7; tds++;
      yard = 100; paintField();
      log(`🏈 TOUCHDOWN! Skol! ${gain}-yard play`, 'td');
      Sound.pass();
      busy = true;
      setTimeout(() => { busy = false; if (over) return; yard = 25; paintField(); nextPlay(); }, 1200);
      return;
    }
    log(gain >= 15 ? `💨 Big play! Gain of ${gain}` : `Gain of ${gain}${playErrors ? '' : ' · clean play +3'}`, gain >= 15 ? 'big' : '');
    paintField(); nextPlay();
  });
};

// ── Putt Out ───────────────────────────────────────────────────────────────
// Nine holes, par 2 each. Longer putts mean more to type. A clean putt at
// your usual pace drops; clean but slow comes up short; a slip lips out.
// Either way the next putt is a short one, and a clean one holes it.
SCREENS.putt = function () {
  const p = me();
  const { words } = gameWords(p);
  const short = words.filter(w => w.length <= 4);
  const cpm = Math.max(40, recentWpm(p) * 5);   // your usual characters per minute
  const HOLES = 9, PAR = 2;
  const body = gameShell('putt', 'Type each putt cleanly, at your usual pace', [['hole', 'Hole', `1/${HOLES}`], ['topar', 'To par', 'E'], ['strokes', 'Strokes', 0]]);
  body.innerHTML = `
    <div class="pt-green" id="pt-green">
      <div class="pt-fringe"></div>
      <div class="pt-cup" id="pt-cup"><span class="pt-flag">⛳</span></div>
      <div class="pt-ball" id="pt-ball"></div>
      <div class="pt-dist" id="pt-dist"></div>
    </div>
    <div class="tm-call" id="pt-call"></div>
    <div class="textbox tm-box"><div class="inner" id="pt-text"></div></div>
    <div class="tm-log" id="pt-log"></div>
    <div class="pt-card" id="pt-card"></div>`;

  const card = [];            // strokes per hole
  let hole = 0, putt = 0, feet = 0, text = '', pos = 0, errors = 0, puttStart = 0;
  let strokes = 0, keystrokes = 0, correct = 0, chars = 0, firstKey = 0, onePutts = 0, busy = false, over = false;
  const timers = [];
  const later = (fn, ms) => timers.push(setTimeout(() => { if (!over) fn(); }, ms));
  setCleanup(() => { over = true; timers.forEach(clearTimeout); });

  const toPar = () => { const d = strokes - PAR * card.length; return d === 0 ? 'E' : d > 0 ? `+${d}` : `−${-d}`; };
  const paintCard = () => {
    $('#pt-card').innerHTML = Array.from({ length: HOLES }, (_, i) => {
      const s = card[i];
      const cls = s == null ? '' : s < PAR ? 'birdie' : s > PAR ? 'bogey' : 'par';
      return `<div class="pt-hole ${cls} ${i === hole && s == null ? 'now' : ''}"><span>${i + 1}</span><b>${s ?? '·'}</b></div>`;
    }).join('') + `<div class="pt-hole total"><span>Tot</span><b>${strokes}</b></div>`;
    $('#g-hole').textContent = `${Math.min(hole + 1, HOLES)}/${HOLES}`;
    $('#g-topar').textContent = toPar();
    $('#g-strokes').textContent = strokes;
  };
  const paintText = () => {
    $('#pt-text').innerHTML = [...text].map((c, i) => `<span class="ch${c === ' ' ? ' sp' : ''}${i < pos ? ' ok' : ''}${i === pos ? ' cur' : ''}">${esc(c)}</span>`).join('');
  };
  // The ball travels from the left toward the cup as you type.
  const ballAt = frac => { $('#pt-ball').style.left = `calc(10% + ${Math.min(1, frac) * 74}%)`; };
  const log = (msg, cls = '') => { $('#pt-log').innerHTML = `<span class="${cls}">${esc(msg)}</span>`; };

  const setPutt = (len, label) => {
    putt++; pos = 0; errors = 0; puttStart = 0;
    const pool = len <= 5 && short.length >= 4 ? short : words;
    const parts = [];
    do parts.push(pick(pool)); while (parts.join(' ').length < len);
    text = parts.join(' ');
    $('#pt-call').textContent = label;
    $('#pt-dist').textContent = `${feet} ft`;
    paintText();
  };
  const startHole = () => {
    putt = 0;
    feet = 3 + Math.floor(Math.random() * 33);             // 3 to 35 feet
    ballAt(0); $('#pt-ball').className = 'pt-ball';
    log('');
    setPutt(4 + Math.round(feet * 0.5), `Hole ${hole + 1} · ${feet} feet · read it, then type the putt`);
    paintCard();
  };
  const finishHole = (n, msg, cls) => {
    card.push(n); strokes += n;
    if (n === 1) onePutts++;
    log(msg, cls);
    paintCard();
    busy = true;
    later(() => {
      busy = false;
      hole++;
      if (hole < HOLES) return startHole();
      over = true;
      const ms = firstKey ? performance.now() - firstKey : 0;
      const d = strokes - PAR * HOLES;
      gameOver('putt', { score: strokes, ms, chars, wpm: ms > 1500 ? (chars / 5) / (ms / 60000) : 0, acc: keystrokes ? correct / keystrokes * 100 : 100,
        lines: `You shot ${strokes} (${d === 0 ? 'even par' : d > 0 ? `${d} over par` : `${-d} under par`}) with ${onePutts} one-putt${onePutts === 1 ? '' : 's'}.` });
    }, 1400);
  };

  startHole();
  setKeyHandler(e => {
    if (over || busy || e.ctrlKey || e.altKey || e.metaKey) return;
    if (e.key.length !== 1) return;
    e.preventDefault();
    if (e.repeat) return;
    const now = performance.now();
    if (!firstKey) firstKey = now;
    if (!puttStart) puttStart = now;
    keystrokes++;
    if (e.key !== text[pos]) {
      errors++;
      Sound.error();
      $('#pt-ball').classList.remove('wobble'); void $('#pt-ball').offsetWidth; $('#pt-ball').classList.add('wobble');
      return;
    }
    correct++; pos++;
    Sound.click();
    paintText();
    if (putt === 1) ballAt(pos / text.length * 0.96);
    if (pos < text.length) return;
    chars += text.length + 1;

    if (putt === 1) {
      const target = text.length / cpm * 60000;
      const onPace = now - puttStart <= target * 1.25;
      if (!errors && onPace) {
        ballAt(1); $('#pt-ball').classList.add('drop');
        Sound.tone(880, 0.12, { gain: 0.05 }); Sound.tone(1320, 0.2, { at: 0.1, gain: 0.05 });
        return finishHole(1, feet >= 20 ? `🎯 Drained it from ${feet} feet!` : '🎯 In the hole! One putt.', 'td');
      }
      feet = errors ? 2 + Math.min(4, errors) : 2;
      ballAt(errors ? 0.88 : 0.82);
      log(errors ? `Lipped out! ${feet} feet coming back.` : `Good line, but short. ${feet} feet left.`, 'flag');
      busy = true;
      return later(() => { busy = false; setPutt(feet <= 3 ? 2 : 5, `Hole ${hole + 1} · ${feet} feet for ${putt === 1 ? 'par' : 'bogey'}`); }, 900);
    }
    // Second putt: clean holes it; a slip means one more tap-in.
    ballAt(1); $('#pt-ball').classList.add('drop');
    if (!errors) { Sound.tone(880, 0.12, { gain: 0.04 }); return finishHole(2, 'Par. Nicely done.', ''); }
    Sound.error();
    return finishHole(3, 'Missed it, tapped in for bogey.', 'flag');
  });
};

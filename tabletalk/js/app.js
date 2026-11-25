// Table Talk: pass the phone around the table. Everyone secretly picks an answer and guesses
// what most people picked. Then the answers are revealed and the table talks about them.
'use strict';

const KEY = 'tabletalk-v1';
const EMOJIS = ['🦊', '🐻', '🐺', '🦉', '🐢', '🦄', '🐯', '🐸', '🐧', '🦖', '🐙', '🐝', '🦅', '🐬', '🦌', '🐿️', '🦆', '🐟', '⚽', '🏈', '⛳', '🎨', '🚀', '🌟', '👵', '👴', '👩', '👨', '👧', '👦'];
const COLORS = ['#4cc9f0', '#f4a261', '#c77dff', '#52b788', '#ef476f', '#ffd166', '#90e0ef', '#e76f51', '#2ec4b6', '#b5e48c'];
const LETTERS = 'ABCD';

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const uid = () => Math.random().toString(36).slice(2, 9);
const shuffle = a => { for (let i = a.length - 1; i > 0; i--) { const j = Math.random() * (i + 1) | 0; [a[i], a[j]] = [a[j], a[i]]; } return a; };
const packOf = key => PACKS.find(p => p.id === key.split(':')[0]);
const cardOf = key => packOf(key).cards[+key.split(':')[1]];

function load() {
  try { const s = JSON.parse(localStorage.getItem(KEY)); if (s && s.app === 'tabletalk') return s; } catch (e) { /* new */ }
  return { app: 'tabletalk', players: [], packs: ['thanks', 'kids', 'wyr', 'long'], rounds: 10, mode: 'guess', used: {}, favs: [], games: [], sound: true };
}
let state = load();
const save = () => localStorage.setItem(KEY, JSON.stringify(state));
let game = null; // the game in progress (kept in memory, plus a copy so a reload can resume)

// ── Sound & confetti ────────────────────────────────────────────────────────
let actx;
function tone(freqs, len = 0.18, vol = 0.12) {
  if (!state.sound) return;
  try {
    actx = actx || new (window.AudioContext || window.webkitAudioContext)();
    freqs.forEach((f, i) => {
      const o = actx.createOscillator(), g = actx.createGain(), t = actx.currentTime + i * 0.08;
      o.type = 'triangle'; o.frequency.value = f;
      g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t + len);
      o.connect(g).connect(actx.destination); o.start(t); o.stop(t + len + 0.05);
    });
  } catch (e) { /* no audio */ }
}
const tap = () => tone([660], 0.08, 0.06);
const reveal = () => tone([523, 659, 784], 0.25);
const fanfare = () => tone([523, 659, 784, 1047], 0.35, 0.14);
function confetti() {
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const cv = $('#confetti'), cx = cv.getContext('2d');
  cv.width = innerWidth; cv.height = innerHeight;
  const cols = ['#2ec4b6', '#f4a261', '#c77dff', '#ffd166', '#ef476f'];
  const ps = Array.from({ length: 140 }, () => ({ x: Math.random() * innerWidth, y: -20 - Math.random() * innerHeight * 0.4, vx: (Math.random() - 0.5) * 3, vy: 2 + Math.random() * 4, s: 5 + Math.random() * 6, c: cols[Math.random() * 5 | 0], r: Math.random() * 6 }));
  const t0 = performance.now();
  (function f(t) {
    cx.clearRect(0, 0, cv.width, cv.height);
    ps.forEach(p => { p.x += p.vx; p.y += p.vy; p.r += 0.08; cx.save(); cx.translate(p.x, p.y); cx.rotate(p.r); cx.fillStyle = p.c; cx.fillRect(-p.s / 2, -p.s / 4, p.s, p.s / 2); cx.restore(); });
    if (t - t0 < 3000) requestAnimationFrame(f); else cx.clearRect(0, 0, cv.width, cv.height);
  })(t0);
}

// ── Modal ───────────────────────────────────────────────────────────────────
function openModal(html, onMount) {
  $('#modal-root').innerHTML = `<div class="modal-back"><div class="modal" role="dialog" aria-modal="true">${html}</div></div>`;
  const back = $('.modal-back');
  back.addEventListener('mousedown', e => { if (e.target === back) closeModal(); });
  $$('[data-close]').forEach(b => b.onclick = closeModal);
  onMount && onMount($('.modal'));
}
const closeModal = () => { $('#modal-root').innerHTML = ''; };
document.addEventListener('keydown', e => { if (e.key === 'Escape') closeModal(); });

// ── Home ────────────────────────────────────────────────────────────────────
function renderHome() {
  const app = $('#app');
  const total = state.packs.reduce((s, id) => s + PACKS.find(p => p.id === id).cards.length, 0);
  const needPlayers = state.mode === 'guess' && state.players.length < 2;
  const resumable = loadSavedGame();
  app.innerHTML = `
    <div class="hero"><img src="icon.svg" alt=""><h1>Table Talk</h1>
      <p>Pass the phone around the table. Everyone secretly picks an answer and guesses what most of the family picked. Then you see the answers and talk.</p></div>
    ${resumable ? `<div class="card row" style="margin-top:18px;justify-content:space-between"><span>A game is in progress (card ${resumable.i + 1} of ${resumable.cards.length}).</span><span class="row"><button class="btn small" id="resume">Keep playing</button><button class="link-btn" id="discard">Discard</button></span></div>` : ''}

    <div class="h2"><span>Who's at the table?</span><span>${state.players.length || ''}</span></div>
    <div class="card">
      <div class="players">${state.players.map(p => `<div class="player" style="--c:${p.color}"><button class="av" data-edit="${p.id}" title="Change picture">${p.emoji}</button>${esc(p.name)}<button class="x" data-del="${p.id}" aria-label="Remove ${esc(p.name)}">✕</button></div>`).join('') || '<span class="muted">Add everyone who\'s playing.</span>'}</div>
      <form class="add-player" id="add-form"><input id="pname" maxlength="16" placeholder="Name" autocomplete="off" aria-label="Player name"><button class="btn small" type="submit">Add</button></form>
    </div>

    <div class="h2"><span>Card packs</span><span>${total} cards</span></div>
    <div class="packs">${PACKS.map(p => `<button class="pack ${state.packs.includes(p.id) ? 'on' : ''}" data-pack="${p.id}" style="--pc:${p.color}">
      <i>${p.emoji}</i><div><b>${p.name}</b><small>${p.blurb}</small><div class="ages">${p.ages} · ${p.cards.length}</div></div><span class="tick">✓</span></button>`).join('')}</div>

    <div class="h2"><span>How to play</span></div>
    <div class="card">
      <div class="row" style="justify-content:space-between">
        <div class="seg" id="mode"><button data-m="guess" class="${state.mode === 'guess' ? 'on' : ''}">Pick &amp; guess</button><button data-m="talk" class="${state.mode === 'talk' ? 'on' : ''}">Just talk</button></div>
        <div class="seg" id="rounds">${[5, 10, 15, 20].map(n => `<button data-r="${n}" class="${state.rounds === n ? 'on' : ''}">${n}</button>`).join('')}</div>
      </div>
      <p class="mode-note">${state.mode === 'guess'
        ? 'Each person takes the phone, picks their answer in secret, and guesses which answer will be most popular. You get a point for every right guess.'
        : 'One person reads each card out loud and everyone answers out loud. Nobody needs to pass the phone.'} ${state.rounds} cards a game.</p>
    </div>

    <div class="start-bar">
      <button class="btn big" id="start" ${needPlayers || !state.packs.length ? 'disabled' : ''}>Start the game</button>
      <div class="why">${!state.packs.length ? 'Pick at least one pack.' : needPlayers ? 'Add at least 2 players, or choose "Just talk".' : ''}</div>
    </div>
    <footer>
      ${state.favs.length ? `<button class="link-btn" id="favs">⭐ Saved cards (${state.favs.length})</button> · ` : ''}
      ${state.games.length ? `${state.games.length} games played · ` : ''}<button class="link-btn" id="snd">${state.sound ? '🔊 Sound on' : '🔇 Sound off'}</button><br>
      <span>Cards you've played recently are saved for later games.</span>
    </footer>`;

  $('#add-form').onsubmit = e => {
    e.preventDefault();
    const name = $('#pname').value.trim();
    if (!name) return;
    const n = state.players.length;
    const used = new Set(state.players.map(p => p.emoji));
    state.players.push({ id: uid(), name, emoji: EMOJIS.find(x => !used.has(x)) || EMOJIS[n % EMOJIS.length], color: COLORS[n % COLORS.length] });
    save(); tap(); renderHome(); $('#pname').focus();
  };
  $$('[data-del]').forEach(b => b.onclick = () => { state.players = state.players.filter(p => p.id !== b.dataset.del); save(); renderHome(); });
  $$('[data-edit]').forEach(b => b.onclick = () => pickEmoji(state.players.find(p => p.id === b.dataset.edit)));
  $$('[data-pack]').forEach(b => b.onclick = () => {
    const id = b.dataset.pack;
    state.packs = state.packs.includes(id) ? state.packs.filter(x => x !== id) : [...state.packs, id];
    save(); tap(); renderHome();
  });
  $$('#mode button').forEach(b => b.onclick = () => { state.mode = b.dataset.m; save(); renderHome(); });
  $$('#rounds button').forEach(b => b.onclick = () => { state.rounds = +b.dataset.r; save(); renderHome(); });
  $('#start').onclick = startGame;
  $('#snd').onclick = () => { state.sound = !state.sound; save(); renderHome(); tap(); };
  $('#favs') && ($('#favs').onclick = showFavs);
  $('#resume') && ($('#resume').onclick = () => { game = resumable; renderGame(); });
  $('#discard') && ($('#discard').onclick = () => { localStorage.removeItem(KEY + '-game'); renderHome(); });
}

function pickEmoji(p) {
  openModal(`<h2>${esc(p.name)}'s picture</h2><div class="emoji-grid">${EMOJIS.map(e => `<button data-e="${e}" class="${e === p.emoji ? 'on' : ''}">${e}</button>`).join('')}</div>
    <div class="modal-foot"><button class="btn ghost" data-close>Done</button></div>`, m => {
    $$('[data-e]', m).forEach(b => b.onclick = () => { p.emoji = b.dataset.e; save(); closeModal(); renderHome(); });
  });
}

function showFavs() {
  openModal(`<h2>⭐ Saved cards</h2><p>Cards you starred during games. Good ones to bring back.</p>
    <div class="fav-list">${state.favs.filter(k => packOf(k)).map(k => `<div class="fav-item"><span>${packOf(k).emoji}</span><div>${esc(cardOf(k).q)}<small>${esc(cardOf(k).talk)}</small></div><button class="link-btn" data-unfav="${k}" aria-label="Remove">✕</button></div>`).join('')}</div>
    <div class="modal-foot"><button class="btn ghost" data-close>Close</button></div>`, m => {
    $$('[data-unfav]', m).forEach(b => b.onclick = () => { state.favs = state.favs.filter(k => k !== b.dataset.unfav); save(); b.parentElement.remove(); renderHome(); });
  });
}

// ── Game ────────────────────────────────────────────────────────────────────
// Draws cards the table hasn't seen lately, spread across the chosen packs.
function drawCards(n) {
  const all = state.packs.flatMap(id => PACKS.find(p => p.id === id).cards.map((_, i) => `${id}:${i}`));
  const fresh = shuffle(all.filter(k => !state.used[k]));
  const stale = all.filter(k => state.used[k]).sort((a, b) => state.used[a] - state.used[b]);
  // Round-robin by pack so one big pack doesn't crowd out the rest.
  const byPack = {};
  for (const k of fresh) (byPack[k.split(':')[0]] ||= []).push(k);
  const order = shuffle(Object.keys(byPack)), out = [];
  while (out.length < n && order.some(id => byPack[id].length)) for (const id of order) if (byPack[id].length && out.length < n) out.push(byPack[id].shift());
  for (const k of stale) if (out.length < n) out.push(k);
  return shuffle(out);
}

function startGame() {
  const cards = drawCards(state.rounds);
  game = {
    mode: state.mode, cards, i: 0,
    players: state.players.map(p => ({ ...p })),
    scores: Object.fromEntries(state.players.map(p => [p.id, 0])),
    history: [], phase: state.mode === 'guess' ? 'handoff' : 'talk', turn: 0, votes: {}, started: Date.now(),
  };
  const now = Date.now();
  cards.forEach(k => state.used[k] = now);
  // Once every card in the chosen packs has been seen, start the cycle again.
  save(); persistGame(); renderGame();
}
const persistGame = () => game && localStorage.setItem(KEY + '-game', JSON.stringify(game));
function loadSavedGame() {
  try { const g = JSON.parse(localStorage.getItem(KEY + '-game')); return g && g.cards && g.i < g.cards.length ? g : null; } catch (e) { return null; }
}
const order = () => { const n = game.players.length, s = game.i % n; return game.players.map((_, j) => game.players[(s + j) % n]); };

function renderGame() {
  const app = $('#app'), key = game.cards[game.i], pack = packOf(key), card = cardOf(key);
  document.documentElement.style.setProperty('--pack', pack.color);
  const top = `<div class="g-top"><button class="link-btn" id="quit">✕ End</button>
    <div class="progress"><i style="width:${(game.i / game.cards.length) * 100}%"></i></div><span class="count">${game.i + 1} / ${game.cards.length}</span></div>`;
  const tag = `<div class="pack-tag">${pack.emoji} ${pack.name}</div>`;
  let body = '';

  if (game.phase === 'talk') {
    body = `<div class="stage">${tag}<div class="question">${esc(card.q)}</div>
      <div class="answers">${card.a.map((a, j) => `<div class="answer"><span class="letter">${LETTERS[j]}</span>${esc(a)}</div>`).join('')}</div>
      ${talkBox(card)}
      <div class="g-actions"><button class="fav ${state.favs.includes(key) ? 'on' : ''}" id="fav" title="Save this card">⭐</button>
        <div class="row">${game.i > 0 ? '<button class="btn ghost" id="prev">Back</button>' : ''}<button class="btn" id="next">${game.i + 1 < game.cards.length ? 'Next card' : 'Finish'}</button></div></div></div>`;
  } else if (game.phase === 'handoff') {
    const p = order()[game.turn];
    body = `<div class="stage handoff" style="--c:${p.color}"><div class="big-av">${p.emoji}</div>
      <h1>Pass to ${esc(p.name)}</h1><p>${game.turn === 0 ? 'New card! Everyone else, no peeking.' : 'Your turn. No peeking, everyone else.'}</p>
      <div><button class="btn big" id="ready" style="background:${p.color}">I'm ${esc(p.name)}. Show me</button></div>
      <div class="waiting">${order().map((q, j) => `<span class="${j < game.turn ? 'done' : j === game.turn ? 'now' : ''}" style="--c:${q.color}" title="${esc(q.name)}">${q.emoji}</span>`).join('')}</div>
      ${game.turn === 0 ? '<p style="margin:18px 0 0"><button class="link-btn" id="skip">Skip this card</button></p>' : ''}</div>`;
  } else if (game.phase === 'pick' || game.phase === 'guess') {
    const p = order()[game.turn], v = game.votes[p.id] || {};
    const guessing = game.phase === 'guess';
    body = `<div class="stage">${tag}
      <div class="step-label" style="--c:${p.color}"><span class="av">${p.emoji}</span><span><b>${esc(p.name)}</b> · ${guessing ? 'Step 2 of 2: <b>Which answer will most people pick?</b>' : 'Step 1 of 2: your answer'}</span></div>
      <div class="question">${esc(card.q)}</div>
      <div class="answers">${card.a.map((a, j) => `<button class="answer ${guessing && v.pick === j ? 'picked' : ''}" data-a="${j}"><span class="letter">${LETTERS[j]}</span>${esc(a)}${guessing && v.pick === j ? '<span class="muted small" style="margin-left:auto">your pick</span>' : ''}</button>`).join('')}</div>
      ${guessing ? '<p class="muted small" style="margin-top:12px">Think about everyone at the table, not just you. Ties count.</p><p style="margin-top:8px"><button class="link-btn" id="back">← Change my answer</button></p>' : ''}</div>`;
  } else if (game.phase === 'reveal') {
    body = revealHtml(key, card, tag);
  }
  app.innerHTML = top + body;
  bindGame(key, card);
}

function talkBox(card) {
  return `<div class="talk"><h3>Talk about it</h3><p>${esc(card.talk)}</p>${card.think ? `<div class="think">💡 <b>Something to weigh:</b> ${esc(card.think)}</div>` : ''}</div>`;
}

function tally(votes, n) {
  const counts = Array(n).fill(0);
  Object.values(votes).forEach(v => counts[v.pick]++);
  const max = Math.max(...counts);
  return { counts, max, top: counts.map((c, j) => c === max && max > 0 ? j : -1).filter(j => j >= 0) };
}

function revealHtml(key, card, tag) {
  const { counts, top } = tally(game.votes, card.a.length);
  const total = Object.keys(game.votes).length;
  const right = game.players.filter(p => game.votes[p.id] && top.includes(game.votes[p.id].guess));
  const unanimous = counts.some(c => c === total) && total > 1;
  // Split = no answer won a majority (2–2, 1–1–1, ...).
  const split = !unanimous && total >= 3 && Math.max(...counts) / total <= 0.5;
  return `<div class="stage">${tag}<div class="question" style="font-size:clamp(1.2rem,4vw,1.6rem);margin-bottom:16px">${esc(card.q)}</div>
    <div class="results">${card.a.map((a, j) => `<div class="result ${top.includes(j) ? 'top' : ''}"><div class="fill" data-w="${total ? counts[j] / total * 100 : 0}"></div>
      <div class="in"><span class="txt">${esc(a)} ${top.includes(j) ? `<span class="crown">${top.length > 1 ? '· tied' : '· most picked'}</span>` : ''}</span>
      <span class="votes">${game.players.filter(p => game.votes[p.id] && game.votes[p.id].pick === j).map(p => `<span style="--c:${p.color}" title="${esc(p.name)}">${p.emoji}</span>`).join('')}</span>
      <span class="pct">${total ? Math.round(counts[j] / total * 100) : 0}%</span></div></div>`).join('')}</div>
    <div class="verdict">${right.length ? `🎯 <b>${right.map(p => esc(p.name)).join(', ')}</b> read the room${right.length > 1 ? '' : ''} (+1 ${right.length > 1 ? 'each' : ''})` : '🎯 Nobody guessed it. This family is full of surprises.'}</div>
    ${unanimous ? '<span class="split-badge">🤝 Everyone agreed!</span>' : split ? '<span class="split-badge">⚡ The table is split. Talk about this one!</span>' : ''}
    ${talkBox(card)}
    <div class="g-actions"><button class="fav ${state.favs.includes(key) ? 'on' : ''}" id="fav" title="Save this card">⭐</button>
      <button class="btn" id="next">${game.i + 1 < game.cards.length ? 'Next card' : 'See who won'}</button></div></div>`;
}

function bindGame(key, card) {
  $('#quit').onclick = () => openModal(`<h2>End this game?</h2><p>${game.mode === 'guess' && game.history.length ? 'You\'ll go straight to the scores for the cards you\'ve played.' : 'You can start a new one any time.'}</p>
    <div class="modal-foot"><button class="btn ghost" data-close>Keep playing</button><button class="btn" id="endnow">End game</button></div>`, m => {
    $('#endnow', m).onclick = () => { closeModal(); if (game.mode === 'guess' && game.history.length) finish(); else { localStorage.removeItem(KEY + '-game'); game = null; renderHome(); } };
  });
  $('#fav') && ($('#fav').onclick = e => {
    state.favs = state.favs.includes(key) ? state.favs.filter(k => k !== key) : [...state.favs, key];
    save(); e.currentTarget.classList.toggle('on'); tap();
  });
  $('#ready') && ($('#ready').onclick = () => { game.phase = 'pick'; tap(); renderGame(); });
  $('#skip') && ($('#skip').onclick = () => {
    const rep = drawCards(game.cards.length + 5).find(k => !game.cards.includes(k));
    if (rep) { game.cards[game.i] = rep; state.used[rep] = Date.now(); save(); }
    else game.cards.splice(game.i, 1);
    if (game.i >= game.cards.length) return finish();
    persistGame(); renderGame();
  });
  $('#back') && ($('#back').onclick = () => { game.phase = 'pick'; renderGame(); });
  $$('[data-a]').forEach(b => b.onclick = () => {
    const p = order()[game.turn], j = +b.dataset.a;
    tap();
    if (game.phase === 'pick') { game.votes[p.id] = { pick: j }; game.phase = 'guess'; }
    else {
      game.votes[p.id].guess = j;
      game.turn++;
      if (game.turn >= game.players.length) {
        const { top } = tally(game.votes, card.a.length);
        game.players.forEach(q => { if (top.includes(game.votes[q.id].guess)) game.scores[q.id]++; });
        game.history.push({ key, votes: game.votes });
        game.phase = 'reveal'; reveal();
      } else game.phase = 'handoff';
    }
    persistGame(); renderGame();
    if (game.phase === 'reveal') requestAnimationFrame(() => setTimeout(() => $$('.result .fill').forEach(f => f.style.width = f.dataset.w + '%'), 30));
  });
  $('#prev') && ($('#prev').onclick = () => { game.i--; persistGame(); renderGame(); });
  $('#next') && ($('#next').onclick = () => {
    if (game.i + 1 >= game.cards.length) return finish();
    game.i++; game.turn = 0; game.votes = {}; game.phase = game.mode === 'guess' ? 'handoff' : 'talk';
    tap(); persistGame(); renderGame(); scrollTo({ top: 0 });
  });
}

// ── Finish: scores and awards ───────────────────────────────────────────────
function awards() {
  const ps = game.players, H = game.history, out = [];
  if (!H.length) return out;
  // Free thinker: most often picked something other than the most popular answer.
  const offbeat = Object.fromEntries(ps.map(p => [p.id, 0]));
  H.forEach(h => { const n = cardOf(h.key).a.length, { top } = tally(h.votes, n); ps.forEach(p => { if (!top.includes(h.votes[p.id].pick)) offbeat[p.id]++; }); });
  const free = ps.slice().sort((a, b) => offbeat[b.id] - offbeat[a.id])[0];
  if (offbeat[free.id] > 0) out.push({ emoji: '🦋', title: 'Free thinker', text: `<b>${esc(free.name)}</b> went against the crowd ${offbeat[free.id]} ${offbeat[free.id] === 1 ? 'time' : 'times'}.` });
  // Twin minds: the pair who picked the same answer most often.
  if (ps.length >= 3) {
    let best = null;
    for (let a = 0; a < ps.length; a++) for (let b = a + 1; b < ps.length; b++) {
      const same = H.filter(h => h.votes[ps[a].id].pick === h.votes[ps[b].id].pick).length;
      if (!best || same > best.same) best = { a: ps[a], b: ps[b], same };
    }
    if (best.same > 0) out.push({ emoji: '👯', title: 'Twin minds', text: `<b>${esc(best.a.name)}</b> and <b>${esc(best.b.name)}</b> agreed on ${best.same} of ${H.length} cards.` });
  }
  // Same page: how often the whole table agreed.
  const agreed = H.filter(h => new Set(Object.values(h.votes).map(v => v.pick)).size === 1).length;
  out.push({ emoji: '🤝', title: 'Same page', text: agreed ? `The whole table agreed on <b>${agreed}</b> ${agreed === 1 ? 'card' : 'cards'}.` : 'You never all agreed once. Lively table!' });
  // Biggest split: the card with the most even spread, worth talking about again.
  const spread = h => new Set(Object.values(h.votes).map(v => v.pick)).size;
  const hot = H.slice().sort((a, b) => spread(b) - spread(a))[0];
  if (spread(hot) >= 2) out.push({ emoji: '⚡', title: 'Hottest card', text: `"${esc(cardOf(hot.key).q)}" split the table ${spread(hot)} ways.` });
  return out;
}

function finish() {
  localStorage.removeItem(KEY + '-game');
  if (game.mode !== 'guess') { game = null; confetti(); renderHome(); return; }
  const ranked = game.players.slice().sort((a, b) => game.scores[b.id] - game.scores[a.id]);
  const best = game.scores[ranked[0].id];
  const winners = ranked.filter(p => game.scores[p.id] === best);
  state.games.push({ t: Date.now(), cards: game.history.length, scores: game.players.map(p => ({ name: p.name, emoji: p.emoji, pts: game.scores[p.id] })) });
  state.games = state.games.slice(-50);
  save();
  document.documentElement.style.setProperty('--pack', 'var(--accent)');
  $('#app').innerHTML = `<div class="stage" style="justify-content:flex-start">
    <div class="hero" style="margin-top:2vh"><div style="font-size:64px">🏆</div>
      <h1 style="font-size:clamp(1.8rem,6vw,2.4rem)">${winners.length > 1 ? `${winners.map(p => esc(p.name)).join(' & ')} tie!` : `${esc(winners[0].name)} reads the room best!`}</h1>
      <p>${game.history.length} cards played. One point for each time you guessed the most popular answer.</p></div>
    <div class="h2"><span>Scores</span></div>
    <div class="podium">${ranked.map((p, i) => `<div class="score-row ${game.scores[p.id] === best ? 'first' : ''}" style="--c:${p.color}"><span class="rank">${i + 1}</span><span class="av">${p.emoji}</span><span class="nm">${esc(p.name)}</span><span class="pts">${game.scores[p.id]}</span></div>`).join('')}</div>
    <div class="h2"><span>Awards</span></div>
    <div class="awards">${awards().map(a => `<div class="award"><i>${a.emoji}</i><h3>${a.title}</h3><p>${a.text}</p></div>`).join('')}</div>
    <div class="row" style="justify-content:center;margin-top:26px"><button class="btn big" id="again">Play again</button><button class="btn ghost" id="home">Change players or packs</button></div></div>`;
  $('#again').onclick = startGame;
  $('#home').onclick = () => { game = null; renderHome(); };
  fanfare(); confetti();
}

renderHome();
if ('serviceWorker' in navigator && location.protocol !== 'file:') navigator.serviceWorker.register('sw.js').catch(() => {});

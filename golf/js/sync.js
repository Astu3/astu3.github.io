// Golf Improvement App — Sync between devices through a hidden app folder in your Google Drive.
// Classic script: shares globals with the other files; load order is set in golf-improvement-app.html.

// ════════════════════════════════════════════════════════════
// SYNC
// Every device keeps its own data (store.js). Sync keeps them alike through
// one file in the Drive "app data" folder — hidden, and only this app can
// read it (scope drive.appdata: it can't see anything else in your Drive).
// Merging is three-way against the copy from the last sync, value by value:
//  • changed on one device only → that change wins;
//  • lists of records with ids (rounds, range shots, sessions…) → combined:
//    new records from both sides kept, deletions honoured;
//  • lists of names (badges) → combined; objects → merged field by field;
//  • counters (XP) changed on both → both gains kept;
//  • anything else changed on both → this device wins.
// Sign-in uses Google's token flow (no password is ever seen by the app);
// a token lasts an hour, so after that one tap reconnects.
// ════════════════════════════════════════════════════════════
const SYNC = {
  CLIENT_ID: '', // Google OAuth client ID (Web) for https://astu3.github.io — see the setup steps
  SCOPE: 'https://www.googleapis.com/auth/drive.appdata',
  FILE: 'golf-sync.json',
  LAST: 'golf_sync_last',
  SKIP: ['golf_store_migrated', 'golf_backup_last', 'golf_sync_last'], // device-only bookkeeping
  AUTO_MS: 20000, // after a change, sync this long after things go quiet
};
const syncState = { token: null, expires: 0, busy: false, timer: null, client: null, err: '' };

const syncConfigured = () => !!SYNC.CLIENT_ID;
const syncKeys = () => store.keys().filter(k => k.includes('golf') && !SYNC.SKIP.includes(k));
const syncHasToken = () => syncState.token && Date.now() < syncState.expires - 60000;

// ── Sign-in (Google Identity Services token client) ──────────────
function syncTokenClient() {
  if (syncState.client) return syncState.client;
  if (!(window.google && google.accounts && google.accounts.oauth2)) return null;
  syncState.client = google.accounts.oauth2.initTokenClient({ client_id: SYNC.CLIENT_ID, scope: SYNC.SCOPE, callback: () => {} });
  return syncState.client;
}
function syncGetToken(prompt) {
  return new Promise((resolve, reject) => {
    const c = syncTokenClient();
    if (!c) return reject(new Error('Google sign-in didn\'t load — check the connection'));
    c.callback = r => {
      if (r.error) return reject(new Error(r.error_description || r.error));
      syncState.token = r.access_token; syncState.expires = Date.now() + r.expires_in * 1000;
      storeHandle('syncToken', { token: syncState.token, expires: syncState.expires }).catch(() => {});
      resolve();
    };
    c.error_callback = e => reject(new Error(e.type === 'popup_closed' ? 'Sign-in was closed' : e.message || e.type));
    c.requestAccessToken({ prompt });
  });
}

// ── Drive (app data folder) ───────────────────────────────────
async function syncDrive(url, opts = {}) {
  const r = await fetch(url, { ...opts, headers: { Authorization: 'Bearer ' + syncState.token, ...(opts.headers || {}) } });
  if (r.status === 401) { syncState.token = null; throw new Error('Google sign-in expired — tap Sync to reconnect'); }
  if (!r.ok) throw new Error(`Drive error ${r.status}`);
  return r;
}
async function syncFindFile() {
  const q = encodeURIComponent(`name='${SYNC.FILE}'`);
  const r = await syncDrive(`https://www.googleapis.com/drive/v3/files?spaces=appDataFolder&q=${q}&fields=files(id)`);
  return ((await r.json()).files || [])[0] || null;
}
async function syncUpload(id, body) {
  const json = JSON.stringify(body);
  if (id) return syncDrive(`https://www.googleapis.com/upload/drive/v3/files/${id}?uploadType=media`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: json });
  const fd = new FormData();
  fd.append('metadata', new Blob([JSON.stringify({ name: SYNC.FILE, parents: ['appDataFolder'] })], { type: 'application/json' }));
  fd.append('file', new Blob([json], { type: 'application/json' }));
  return syncDrive('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart', { method: 'POST', body: fd });
}

// ── Three-way merge ───────────────────────────────────────────
const syncEq = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const syncIsObj = v => v && typeof v === 'object' && !Array.isArray(v);
const syncIdList = a => Array.isArray(a) && a.length > 0 && a.every(x => syncIsObj(x) && x.id !== undefined);
function syncMerge(B, L, R, name = '') {
  if (syncEq(L, R)) return L;
  if (syncEq(L, B)) return R;
  if (syncEq(R, B)) return L;
  if (L === undefined || R === undefined) return L === undefined ? R : L; // edited on one side, deleted on the other: keep the edit
  const lists = [B, L, R].filter(Array.isArray);
  if (Array.isArray(L) && Array.isArray(R)) {
    if ((syncIdList(L) || !L.length) && (syncIdList(R) || !R.length)) return syncMergeRecords(Array.isArray(B) ? B : [], L, R);
    if (lists.every(a => a.every(x => typeof x !== 'object'))) return [...new Set([...R, ...L])]; // names: combine
    return L;
  }
  if (syncIsObj(L) && syncIsObj(R)) {
    const b = syncIsObj(B) ? B : {}, out = {};
    new Set([...Object.keys(L), ...Object.keys(R)]).forEach(k => { const v = syncMerge(b[k], L[k], R[k], k); if (v !== undefined) out[k] = v; });
    return out;
  }
  // a counter grown on both devices keeps both gains
  if (typeof L === 'number' && typeof R === 'number' && typeof B === 'number' && /xp|count|total/i.test(name)) return L + R - B;
  return L;
}
function syncMergeRecords(B, L, R) {
  const map = a => new Map(a.map(x => [String(x.id), x]));
  const b = map(B), l = map(L), r = map(R), out = new Map();
  for (const id of new Set([...l.keys(), ...r.keys()])) {
    const inL = l.has(id), inR = r.has(id), inB = b.has(id);
    if (inL && inR) out.set(id, syncMerge(b.get(id), l.get(id), r.get(id)));
    else if (inL) { if (!inB || !syncEq(l.get(id), b.get(id))) out.set(id, l.get(id)); }      // new here, or deleted there but edited here
    else if (!inB || !syncEq(r.get(id), b.get(id))) out.set(id, r.get(id));                 // new there, or deleted here but edited there
  }
  // keep the list's order: newest-first lists stay newest-first
  const vals = [...out.values()], nums = vals.every(x => typeof x.id === 'number');
  const desc = L.length > 1 ? L[0].id > L[L.length - 1].id : R.length > 1 ? R[0].id > R[R.length - 1].id : true;
  return nums ? vals.sort((x, y) => desc ? y.id - x.id : x.id - y.id) : vals;
}

// ── Sync ──────────────────────────────────────────────────────
async function syncNow(interactive) {
  if (!syncConfigured() || syncState.busy) return;
  syncState.busy = true; syncState.err = ''; renderSyncStatus();
  try {
    if (!syncHasToken()) {
      if (!interactive) throw new Error('Tap Sync to reconnect to Google');
      await syncGetToken(store.getItem(SYNC.LAST) ? '' : 'consent');
    }
    const file = await syncFindFile();
    const remote = file ? (await (await syncDrive(`https://www.googleapis.com/drive/v3/files/${file.id}?alt=media`)).json()).data || {} : {};
    const base = (await storeHandle('syncBase')) || {};
    const local = {}; syncKeys().forEach(k => { local[k] = store.getItem(k); });
    const parse = s => { try { return s == null ? undefined : JSON.parse(s); } catch { return s; } };
    const merged = {};
    for (const k of new Set([...Object.keys(local), ...Object.keys(remote)])) {
      if (SYNC.SKIP.includes(k)) continue;
      const v = syncMerge(parse(base[k]), parse(local[k]), parse(remote[k]), k);
      if (v !== undefined) merged[k] = JSON.stringify(v);
    }
    // apply — but never over something saved on this device while the sync was running
    let changed = 0, raced = false;
    for (const k of new Set([...Object.keys(merged), ...Object.keys(local)])) {
      if (store.getItem(k) !== local[k]) { raced = true; continue; }
      if (merged[k] === undefined) { store.removeItem(k); changed++; }
      else if (merged[k] !== local[k]) { store.setItem(k, merged[k]); changed++; }
    }
    await syncUpload(file && file.id, { app: 'golf-improvement', version: 1, syncedAt: new Date().toISOString(), data: merged });
    await storeHandle('syncBase', merged);
    store.setItem(SYNC.LAST, new Date().toISOString());
    if (changed) { dataChanged(); updateXPHeader(); syncRefreshPage(); showToast(`☁️ Synced — ${changed} update${changed > 1 ? 's' : ''} from your other device`); }
    else if (interactive) showToast('☁️ Synced — everything matches');
    if (raced) syncSoon();
  } catch (e) {
    syncState.err = e.message; console.warn('Sync', e);
    if (interactive) showToast('⚠️ ' + e.message);
  } finally {
    syncState.busy = false; renderSyncStatus();
  }
}
// Re-draw whichever page is open so synced data shows
function syncRefreshPage() {
  const page = document.querySelector('.page.active');
  const name = page && page.id.replace('page-', '');
  if (name && typeof showPage === 'function' && !(name === 'apex' && typeof apexAnim !== 'undefined' && apexAnim)) showPage(name);
}
// After saves, sync once things go quiet (only while signed in)
function syncSoon() {
  if (!syncConfigured() || !store.getItem(SYNC.LAST)) return;
  clearTimeout(syncState.timer);
  syncState.timer = setTimeout(() => { if (syncHasToken()) syncNow(false); else renderSyncStatus(); }, SYNC.AUTO_MS);
}
async function syncDisconnect() {
  if (syncState.token && window.google && google.accounts.oauth2) google.accounts.oauth2.revoke(syncState.token, () => {});
  syncState.token = null; syncState.expires = 0;
  await storeHandle('syncToken', null); await storeHandle('syncBase', null);
  store.removeItem(SYNC.LAST);
  renderSyncStatus(); showToast('Sync turned off on this device (your Drive copy is kept)');
}
// At start-up: reuse a still-valid token and sync quietly
async function syncAuto() {
  if (!syncConfigured()) return renderSyncStatus();
  const t = await storeHandle('syncToken').catch(() => null);
  if (t && t.expires > Date.now()) { syncState.token = t.token; syncState.expires = t.expires; }
  renderSyncStatus();
  if (store.getItem(SYNC.LAST) && syncHasToken()) syncNow(false);
}

function renderSyncStatus() {
  const el = document.getElementById('sync-status'), hb = document.getElementById('sync-header-btn');
  const on = !!store.getItem(SYNC.LAST), last = store.getItem(SYNC.LAST);
  if (hb) {
    hb.style.display = syncConfigured() && on ? '' : 'none';
    hb.classList.toggle('busy', syncState.busy);
    hb.classList.toggle('needs', on && !syncHasToken());
    hb.title = syncState.busy ? 'Syncing…' : syncHasToken() ? 'Synced with Google Drive — tap to sync now' : 'Tap to reconnect and sync';
  }
  if (!el) return;
  if (!syncConfigured()) { el.innerHTML = `<div class="backup-line">Sync between your phone and computer isn't set up yet.</div>`; return; }
  const ago = last ? Math.round((Date.now() - new Date(last)) / 60000) : null;
  const when = ago === null ? '' : ago < 1 ? 'just now' : ago < 60 ? `${ago} min ago` : ago < 1440 ? `${Math.round(ago / 60)} h ago` : `${Math.round(ago / 1440)} days ago`;
  el.innerHTML = `
    <div class="backup-line">${on ? `☁️ Synced with Google Drive · last ${when}` : 'Keep this device and your others in step through Google Drive.'}
      ${syncState.err ? `<div style="color:var(--red);margin-top:4px;">${esc(syncState.err)}</div>` : ''}</div>
    <div class="backup-btns">
      <button class="btn btn-primary btn-sm" onclick="syncNow(true)" ${syncState.busy ? 'disabled' : ''}>${syncState.busy ? 'Syncing…' : on ? '☁️ Sync now' : '☁️ Connect Google Drive'}</button>
      ${on ? `<button class="btn btn-sm btn-quiet" onclick="syncDisconnect()">Turn off</button>` : ''}
    </div>`;
}

// Golf Improvement App — Backups: export / import, automatic folder backups and a weekly reminder.
// Classic script: shares globals with the other files; load order is set in golf-improvement-app.html.

// ════════════════════════════════════════════════════════════
// DATA BACKUP
// A backup is one JSON file holding every saved value. Three ways to make one:
//  • a backup folder (Windows / desktop Chrome or Edge): choose it once and the
//    app writes a dated file there on its own, at most once a day, keeping the
//    newest BACKUP.KEEP files it wrote. Browsers ask again for access after a
//    restart unless "Allow on every visit" was chosen, so then it's one click.
//  • Share (Android): sends the file to Google Drive, email, etc.
//  • Download: saves the file to Downloads.
// If nothing has been backed up for BACKUP.REMIND_DAYS, the dashboard says so.
// ════════════════════════════════════════════════════════════
const BACKUP = { KEEP: 14, REMIND_DAYS: 7, LAST: 'golf_backup_last', PREFIX: 'golf-backup-' };
const backupState = { dir: null, perm: null };

function backupPayload() {
  const data = {};
  store.keys().forEach(k => { if (k.includes('golf') && k !== BACKUP.LAST && k !== 'golf_store_migrated') data[k] = store.getItem(k); });
  return { app: 'golf-improvement', version: 1, exportedAt: new Date().toISOString(), data };
}
function backupBlob() { return new Blob([JSON.stringify(backupPayload())], { type: 'application/json' }); }
function backupFileName() { return `${BACKUP.PREFIX}${todayISO()}.json`; }
function backupMark() { store.setItem(BACKUP.LAST, new Date().toISOString()); renderBackupStatus(); }
function backupDaysSince() {
  const last = store.getItem(BACKUP.LAST);
  return last ? Math.floor((Date.now() - new Date(last)) / 864e5) : null;
}
const backupCanUseFolder = () => 'showDirectoryPicker' in window;
const backupCanShare = () => { try { return !!(navigator.canShare && navigator.canShare({ files: [new File(['{}'], 'x.json', { type: 'application/json' })] })); } catch { return false; } };

function exportData() {
  const url = URL.createObjectURL(backupBlob());
  const a = document.createElement('a');
  a.href = url; a.download = backupFileName();
  document.body.appendChild(a); a.click(); a.remove();
  URL.revokeObjectURL(url);
  backupMark();
  showToast('💾 Backup downloaded');
}

async function shareBackup() {
  try {
    await navigator.share({ files: [new File([backupBlob()], backupFileName(), { type: 'application/json' })], title: 'Golf backup' });
    backupMark();
    showToast('💾 Backup shared');
  } catch (e) { if (e.name !== 'AbortError') { console.error(e); exportData(); } } // cancelled: nothing to do
}

// ── Backup folder ─────────────────────────────────────────
async function chooseBackupFolder() {
  try {
    const dir = await window.showDirectoryPicker({ id: 'golf-backups', mode: 'readwrite', startIn: 'documents' });
    await storeHandle('backupDir', dir);
    backupState.dir = dir; backupState.perm = 'granted';
    await backupToFolder();
  } catch (e) { if (e.name !== 'AbortError') { console.error(e); showToast('⚠️ Couldn\'t use that folder'); } }
}
async function forgetBackupFolder() {
  await storeHandle('backupDir', null);
  backupState.dir = null; backupState.perm = null;
  renderBackupStatus();
}
// Write today's file and keep only the newest BACKUP.KEEP of the app's own files
async function backupToFolder(quiet) {
  const dir = backupState.dir;
  if (!dir) return false;
  try {
    if (backupState.perm !== 'granted') backupState.perm = await dir.requestPermission({ mode: 'readwrite' });
    if (backupState.perm !== 'granted') { renderBackupStatus(); return false; }
    const fh = await dir.getFileHandle(backupFileName(), { create: true });
    const w = await fh.createWritable(); await w.write(backupBlob()); await w.close();
    const ours = [];
    for await (const [name, h] of dir.entries()) if (h.kind === 'file' && /^golf-backup-\d{4}-\d{2}-\d{2}\.json$/.test(name)) ours.push(name);
    ours.sort().reverse().slice(BACKUP.KEEP).forEach(n => dir.removeEntry(n).catch(() => {}));
    backupMark();
    if (!quiet) showToast(`💾 Backed up to “${dir.name}”`);
    return true;
  } catch (e) {
    console.error(e);
    if (!quiet) showToast('⚠️ Backup to the folder failed — try Download instead');
    return false;
  }
}

// One click from the dashboard: folder if there is one, else share (phones) or download
function backupNow() {
  if (backupState.dir) return backupToFolder();
  if (backupCanShare() && !backupCanUseFolder()) return shareBackup();
  exportData();
}

// At start-up: reconnect to the folder and back up there silently if a day has passed
async function backupAuto() {
  try {
    if (backupCanUseFolder()) {
      backupState.dir = await storeHandle('backupDir');
      if (backupState.dir) {
        backupState.perm = await backupState.dir.queryPermission({ mode: 'readwrite' });
        const days = backupDaysSince();
        if (backupState.perm === 'granted' && (days === null || days >= 1)) await backupToFolder(true);
      }
    }
  } catch (e) { console.error(e); }
  renderBackupStatus();
}

function renderBackupStatus() {
  const el = document.getElementById('backup-status');
  if (!el) return;
  const days = backupDaysSince(), dir = backupState.dir;
  const when = days === null ? 'never' : days === 0 ? 'today' : days === 1 ? 'yesterday' : `${days} days ago`;
  const overdue = days === null || days >= BACKUP.REMIND_DAYS;
  const needsClick = dir && backupState.perm !== 'granted';
  el.innerHTML = `
    <div class="backup-line ${overdue ? 'overdue' : ''}">
      ${overdue ? '⚠️' : '✅'} Last backup: <b>${when}</b>
      ${dir ? ` · folder “${esc(dir.name)}”${needsClick ? ' (click Back up now to reconnect)' : ' · automatic, daily'}` : ''}
    </div>
    <div class="backup-btns">
      <button class="btn btn-primary btn-sm" onclick="backupNow()">💾 Back up now</button>
      ${backupCanUseFolder() ? (dir
        ? `<button class="btn btn-sm btn-quiet" onclick="chooseBackupFolder()">📁 Change folder</button><button class="btn btn-sm btn-quiet" onclick="forgetBackupFolder()">Stop folder backups</button>`
        : `<button class="btn btn-sm btn-quiet" onclick="chooseBackupFolder()">📁 Back up automatically to a folder…</button>`) : ''}
      ${backupCanShare() ? `<button class="btn btn-sm btn-quiet" onclick="shareBackup()">📤 Share to Drive…</button>` : ''}
      <button class="btn btn-sm btn-quiet" onclick="exportData()">⬇️ Download</button>
      <button class="btn btn-sm btn-quiet" onclick="document.getElementById('import-file').click()">⬆️ Restore…</button>
    </div>`;
  const banner = document.getElementById('backup-banner');
  if (banner) banner.innerHTML = overdue && !(dir && !needsClick)
    ? `<div class="backup-banner">💾 ${days === null ? 'You haven\'t backed up yet' : `It's been ${days} days since your last backup`}. <button class="btn btn-primary btn-sm" onclick="backupNow()">Back up now</button></div>`
    : '';
}

function importData(inputEl) {
  const file = inputEl.files && inputEl.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = e => {
    try {
      const parsed = JSON.parse(e.target.result);
      const data = (parsed && typeof parsed.data === 'object') ? parsed.data : parsed;
      if (!data || typeof data !== 'object') throw new Error('bad format');
      const keys = Object.keys(data).filter(k => k.includes('golf'));
      if (!keys.length) throw new Error('no golf data');
      if (!confirm(`Restore ${keys.length} data item(s)? This overwrites your current data on this device.`)) {
        inputEl.value = ''; return;
      }
      keys.forEach(k => { if (typeof data[k] === 'string') store.setItem(k, data[k]); });
      dataChanged();
      showToast('✅ Backup restored');
      updateXPHeader();
      renderDashboard();
    } catch (err) {
      showToast('⚠️ Invalid backup file');
    }
    inputEl.value = '';
  };
  reader.readAsText(file);
}

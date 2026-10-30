// Golf Improvement App — Export / import of all app data.
// Classic script: shares globals with the other files; load order is set in golf-improvement-app.html.

// ════════════════════════════════════════════════════════════
// DATA BACKUP  (export / import)
// ════════════════════════════════════════════════════════════
function exportData() {
  const data = {};
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (k && k.includes('golf')) data[k] = localStorage.getItem(k);
  }
  const payload = { app: 'golf-improvement', version: 1, exportedAt: new Date().toISOString(), data };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href = url;
  a.download = `golf-backup-${todayISO()}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
  showToast('💾 Backup downloaded');
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
      keys.forEach(k => { if (typeof data[k] === 'string') localStorage.setItem(k, data[k]); });
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

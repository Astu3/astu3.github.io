// Golf Improvement App — App start-up.
// Classic script: shares globals with the other files; load order is set in golf-improvement-app.html.

// ════════════════════════════════════════════════════════════
// BOOT
// ════════════════════════════════════════════════════════════
// Data is read from memory, so start once the store has loaded it from disk
storeReady.then(() => {
  document.getElementById('round-date').value = todayISO();
  buildScorecard();
  // Google login requires an http server — skip for local file testing
  // initAuth();
  updateXPHeader();
  renderDashboard();
  checkBadges(getAllRounds());
  sgLoadDraft(); // resume an SG round that was in progress
  apexLoad();    // and an Apex round
  backupAuto();  // daily folder backup / weekly reminder
  syncAuto();    // Google Drive sync, if it's on
});

// Installable, offline app: the service worker keeps a complete copy of each version.
// A new version downloads in the background; then the app offers to switch to it
// (never mid-shot), and reloads once the new version has taken over.
if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  navigator.serviceWorker.register('golf-sw.js', { updateViaCache: 'none' }).then(reg => {
    const offer = w => {
      if (!w || !navigator.serviceWorker.controller) return; // first install: nothing to replace
      const t = document.createElement('div');
      t.className = 'update-bar';
      t.innerHTML = '✨ A new version is ready <button class="btn btn-gold btn-sm">Update</button>';
      t.querySelector('button').onclick = () => { t.remove(); w.postMessage('skip-waiting'); };
      document.querySelectorAll('.update-bar').forEach(x => x.remove());
      document.body.appendChild(t);
    };
    offer(reg.waiting);
    reg.addEventListener('updatefound', () => {
      const w = reg.installing;
      w.addEventListener('statechange', () => { if (w.state === 'installed') offer(w); });
    });
    // apps can stay open for days: look for a new version whenever it comes back to the front
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') reg.update().catch(() => {}); });
  }).catch(e => console.warn('Offline support unavailable', e));
  let reloading = false;
  const hadVersion = !!navigator.serviceWorker.controller; // a first install has nothing to swap out
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!hadVersion || reloading || (typeof apexAnim !== 'undefined' && apexAnim)) return;
    reloading = true; location.reload();
  });
}

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
});

// Installable, offline app: the service worker keeps a copy of every app file
if ('serviceWorker' in navigator && location.protocol !== 'file:')
  navigator.serviceWorker.register('golf-sw.js').catch(e => console.warn('Offline support unavailable', e));

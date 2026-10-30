// Golf Improvement App — App start-up.
// Classic script: shares globals with the other files; load order is set in golf-improvement-app.html.

// ════════════════════════════════════════════════════════════
// BOOT
// ════════════════════════════════════════════════════════════
document.getElementById('round-date').value = todayISO();
buildScorecard();
// Google login requires an http server — skip for local file testing
// initAuth();
updateXPHeader();
renderDashboard();
checkBadges(getAllRounds());
sgLoadDraft(); // resume an SG round that was in progress
apexLoad();    // and an Apex round
// Golf Improvement App — R10 connection panel (Speed + Range pages) and swing routing.
// Classic script: shares globals with the other files; load order is set in golf-improvement-app.html.

// ════════════════════════════════════════════════════════════
// R10 CONNECTION UI
// The same panel appears on the Speed and Clubs pages, so it's found by class.
// ════════════════════════════════════════════════════════════
function r10PanelHTML() {
  const st = R10.status, connected = R10.isConnected();
  const dot = { ready: '#2d9d5a', busy: '#e0a030', connecting: '#e0a030', error: 'var(--red)' }[st] || 'var(--gray-mid)';
  const last = R10.lastShot;
  let buttons;
  if (connected) buttons = `<button class="btn btn-sm" style="background:var(--gray-light);color:var(--gray-dark);" onclick="R10.disconnect()">Disconnect</button>`;
  else if (st === 'connecting') buttons = '';
  else if (R10.device) buttons = `<button class="btn btn-primary btn-sm" onclick="R10.reconnect()">↻ Reconnect</button>
      <button class="btn btn-sm" style="background:var(--gray-light);color:var(--gray-dark);" onclick="R10.connect()">Choose device</button>`;
  else buttons = `<button class="btn btn-primary btn-sm" onclick="R10.connect()" ${R10.supported() ? '' : 'disabled'}>📡 Connect R10</button>`;

  return `<div class="card r10-panel">
    <div class="card-title">Garmin R10 · Bluetooth</div>
    <div style="display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap;">
      <div style="display:flex;align-items:center;gap:8px;font-size:0.9rem;font-weight:600;">
        <span style="width:10px;height:10px;border-radius:50%;background:${dot};display:inline-block;flex-shrink:0;"></span>
        <span>${esc(R10.statusText)}</span>
      </div>
      <div style="display:flex;gap:8px;">${buttons}</div>
    </div>
    ${!R10.supported() ? `<p style="font-size:0.8rem;color:var(--red);margin-top:10px;">${esc(R10.unsupportedReason())}</p>` : ''}
    ${last ? `<div style="margin-top:12px;padding:10px 12px;background:var(--page-bg);border:1px solid var(--border);border-radius:8px;font-size:0.84rem;">
      <strong>Last swing:</strong> ${last.clubMph ? `<strong style="color:var(--green-mid);">${toUnit(last.clubMph)} ${unitLabel()}</strong> club speed` : 'club speed not read (swing too slow)'}${last.ballMph ? ` · ${toUnit(last.ballMph)} ${unitLabel()} ball` : ''}${last.launch !== null && last.ballMph ? ` · ${last.launch}° launch` : ''}
    </div>` : ''}
    ${R10.log.length ? `<div style="margin-top:10px;text-align:right;"><button class="btn btn-sm" style="background:none;color:var(--gray-mid);font-size:0.76rem;" onclick="r10CopyLog()" title="Copies the connection log, to share when something isn't working">📋 Copy log</button></div>` : ''}
    ${!connected ? `<details style="margin-top:12px;font-size:0.82rem;color:var(--gray-dark);">
      <summary style="cursor:pointer;font-weight:600;">How to connect</summary>
      <ol class="spd-steps" style="margin-top:8px;">
        <li>Use <strong>Chrome or Edge</strong> on Windows, Mac, Android or ChromeOS. iPhone and iPad can't use Web Bluetooth.</li>
        <li><strong>Windows:</strong> pair the R10 once in <em>Settings › Bluetooth &amp; devices › Add device</em> (put the R10 in pairing mode per Garmin's instructions).</li>
        <li><strong>Close the Garmin Golf app</strong> on your phone, or turn the phone's Bluetooth off. The R10 talks to one app at a time.</li>
        <li>Set the R10 6–8 ft behind the ball, aimed at your target.</li>
        <li>Click <strong>Connect R10</strong> and pick "Approach R10". Once it says <em>Ready</em>, swings are recorded automatically. No ball is needed for club speed.</li>
      </ol>
      <p style="font-size:0.74rem;color:var(--gray-mid);">Unofficial: this uses a community-documented protocol that Garmin doesn't support, so an R10 firmware update could break it. In speed sessions, typing or saying speeds always works.</p>
    </details>` : ''}
  </div>`;
}

// One-line status shown above an active speed session
function r10StripHTML() {
  if (!R10.isConnected()) return '<div class="r10-strip"></div>';
  return `<div class="r10-strip" style="font-size:0.8rem;font-weight:600;color:var(--green-mid);margin-bottom:10px;">📡 R10: ${esc(R10.statusText)}</div>`;
}

// Copies the R10 log (app events, device info and launch numbers; nothing personal)
function r10CopyLog() {
  const text = ['Golf Improvement · R10 log', ...R10.log].join('\n');
  (navigator.clipboard ? navigator.clipboard.writeText(text) : Promise.reject())
    .then(() => showToast('📋 R10 log copied — paste it into the chat'))
    .catch(() => { console.log(text); showToast('Couldn\'t copy — the log is in the browser console'); });
}

function r10Refresh() {
  document.querySelectorAll('.r10-panel').forEach(el => { el.outerHTML = r10PanelHTML(); });
  document.querySelectorAll('.r10-strip').forEach(el => { el.outerHTML = r10StripHTML(); });
}

R10.on('status', () => {
  r10Refresh();
  // The range "record" button depends on the connection state
  if (document.getElementById('page-clubs').classList.contains('active')) renderClubs();
});
R10.on('deviceError', msg => showToast('📡 R10: ' + msg));

// A running speed session owns every swing, then a drill, then an Apex round on screen, then range mode.
R10.on('shot', shot => {
  r10Refresh();
  if (spd && spd.phase !== 'done') { R10.addLog('→ speed session'); spdOnR10Shot(shot); }
  else if (drillActive()) { R10.addLog('→ drill'); drillOnR10Shot(shot); }
  else if (apexAwaitingShot()) { R10.addLog('→ Apex'); apexOnR10Shot(shot); }
  else if (rangeOn) { R10.addLog('→ range'); rangeRecordShot(shot); }
  else R10.addLog('→ not used (no speed session, drill, Apex shot or range mode waiting)');
});

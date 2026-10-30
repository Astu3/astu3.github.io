// Golf Improvement App — Canvas line chart used by the dashboard, history and speed pages.
// Classic script: shares globals with the other files; load order is set in golf-improvement-app.html.

// ════════════════════════════════════════════════════════════
// CHART UTILITY  (Canvas-based line chart)
// ════════════════════════════════════════════════════════════
function drawLineChart(canvas, points, opts = {}) {
  const { color = '#2d6a4f', fillColor = 'rgba(82,183,136,0.15)', inverted = false } = opts;
  const ctx = canvas.getContext('2d');
  const W = canvas.width, H = canvas.height;
  const PAD = { top: 18, right: 14, bottom: 28, left: 44 };

  ctx.clearRect(0, 0, W, H);

  if (points.length < 2) {
    ctx.fillStyle = '#aab8b0';
    ctx.font = '12px Segoe UI, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('Log more rounds to see the trend', W / 2, H / 2);
    return;
  }

  const vals  = points.map(p => p.y);
  const lo    = Math.min(...vals);
  const hi    = Math.max(...vals);
  const range = hi - lo || 1;

  const sx = i  => PAD.left + (i / (points.length - 1)) * (W - PAD.left - PAD.right);
  const sy = v  => PAD.top  + (inverted ? (v - lo) : (1 - (v - lo) / range)) * (H - PAD.top - PAD.bottom);

  // Grid lines
  ctx.strokeStyle = '#e8f0ea'; ctx.lineWidth = 1;
  for (let i = 0; i <= 4; i++) {
    const y   = PAD.top + (i / 4) * (H - PAD.top - PAD.bottom);
    const val = inverted ? lo + (i / 4) * range : hi - (i / 4) * range;
    ctx.beginPath(); ctx.moveTo(PAD.left, y); ctx.lineTo(W - PAD.right, y); ctx.stroke();
    ctx.fillStyle = '#aab8b0'; ctx.font = '9px Segoe UI,sans-serif'; ctx.textAlign = 'right';
    ctx.fillText(val.toFixed(1), PAD.left - 4, y + 3);
  }

  // Fill area
  ctx.beginPath();
  ctx.moveTo(sx(0), sy(points[0].y));
  points.forEach((p, i) => ctx.lineTo(sx(i), sy(p.y)));
  ctx.lineTo(sx(points.length - 1), H - PAD.bottom);
  ctx.lineTo(sx(0), H - PAD.bottom);
  ctx.closePath();
  ctx.fillStyle = fillColor; ctx.fill();

  // Line
  ctx.beginPath();
  ctx.moveTo(sx(0), sy(points[0].y));
  points.forEach((p, i) => ctx.lineTo(sx(i), sy(p.y)));
  ctx.strokeStyle = color; ctx.lineWidth = 2.5; ctx.lineJoin = 'round'; ctx.stroke();

  // Dots
  points.forEach((p, i) => {
    ctx.beginPath(); ctx.arc(sx(i), sy(p.y), 4, 0, Math.PI * 2);
    ctx.fillStyle = color; ctx.fill();
    ctx.strokeStyle = 'white'; ctx.lineWidth = 1.5; ctx.stroke();
  });

  // X-axis labels (max 6)
  const step = Math.max(1, Math.ceil(points.length / 6));
  ctx.fillStyle = '#aab8b0'; ctx.font = '9px Segoe UI,sans-serif'; ctx.textAlign = 'center';
  points.forEach((p, i) => {
    if (i % step === 0 || i === points.length - 1) {
      ctx.fillText(p.label || '', sx(i), H - PAD.bottom + 12);
    }
  });
}

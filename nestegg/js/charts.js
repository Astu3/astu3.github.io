// Small SVG chart helper: line or stacked-area, with a crosshair tooltip and a table view.
// Chart.render(el, { series:[{name,color,values}], labels:[...], stacked, area, fmtY, height, tableEvery })
const Chart = (() => {
  const NS = 'http://www.w3.org/2000/svg';
  const SURFACE = '#161b33';

  function niceStep(max, count) {
    const raw = max / count, mag = Math.pow(10, Math.floor(Math.log10(raw || 1)));
    const n = raw / mag;
    return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10) * mag;
  }

  function render(el, cfg) {
    const W = 640, H = cfg.height || 260, L = 58, R = 18, T = 14, B = 30;
    const n = cfg.labels.length;
    const fmtY = cfg.fmtY || (v => v);
    const series = cfg.series;
    // Stacked tops
    const tops = series.map(() => new Array(n).fill(0));
    for (let i = 0; i < n; i++) {
      let acc = 0;
      series.forEach((s, k) => { acc = cfg.stacked ? acc + s.values[i] : s.values[i]; tops[k][i] = acc; });
    }
    let maxV = Math.max(1, ...tops.flat());
    const minV = Math.min(0, ...tops.flat());
    const step = niceStep(maxV - minV, 4);
    maxV = Math.ceil(maxV / step) * step;
    const lo = Math.floor(minV / step) * step;
    const x = i => L + (n <= 1 ? (W - L - R) / 2 : (i / (n - 1)) * (W - L - R));
    const y = v => T + (1 - (v - lo) / (maxV - lo || 1)) * (H - T - B);

    let g = '';
    for (let v = lo; v <= maxV + 1e-9; v += step) {
      g += `<line class="${v === 0 ? 'baseline' : 'gridline'}" x1="${L}" x2="${W - R}" y1="${y(v)}" y2="${y(v)}"/>`;
      g += `<text class="tick" x="${L - 8}" y="${y(v) + 4}" text-anchor="end">${fmtY(v, true)}</text>`;
    }
    // x ticks: about 5
    const every = Math.max(1, Math.ceil(n / 5));
    for (let i = 0; i < n; i += every) {
      g += `<text class="tick" x="${x(i)}" y="${H - 8}" text-anchor="${i === 0 ? 'start' : 'middle'}">${cfg.xTick ? cfg.xTick(i) : cfg.labels[i]}</text>`;
    }
    if ((n - 1) % every && n > 1 && (n - 1) - Math.floor((n - 1) / every) * every > every / 2) {
      g += `<text class="tick" x="${x(n - 1)}" y="${H - 8}" text-anchor="end">${cfg.xTick ? cfg.xTick(n - 1) : cfg.labels[n - 1]}</text>`;
    }

    let marks = '';
    series.forEach((s, k) => {
      const top = tops[k], base = cfg.stacked && k > 0 ? tops[k - 1] : null;
      const linePts = top.map((v, i) => `${x(i)},${y(v)}`);
      if (cfg.area) {
        const basePts = base ? base.map((v, i) => `${x(i)},${y(v)}`).reverse() : [`${x(n - 1)},${y(Math.max(0, lo))}`, `${x(0)},${y(Math.max(0, lo))}`];
        marks += `<polygon points="${linePts.concat(basePts).join(' ')}" fill="${s.color}" fill-opacity="${cfg.stacked ? 0.9 : 0.22}"/>`;
      }
      marks += `<polyline points="${linePts.join(' ')}" fill="none" stroke="${cfg.stacked ? SURFACE : s.color}" stroke-width="2" stroke-linejoin="round"/>`;
    });
    // Direct labels at the right end for stacked series (2 series max here)
    let labels = '';
    if (cfg.directLabels && n > 1) {
      series.forEach((s, k) => {
        const topV = tops[k][n - 1], botV = cfg.stacked && k > 0 ? tops[k - 1][n - 1] : 0;
        const mid = y((topV + botV) / 2);
        if (Math.abs(y(topV) - y(botV)) > 18) labels += `<text class="dlabel" x="${W - R - 6}" y="${mid + 4}" text-anchor="end" fill="#fff" style="fill:#fff">${s.name}</text>`;
      });
    }

    el.classList.add('chart');
    el.innerHTML = (series.length > 1 ? `<div class="legend">${series.map(s => `<span><i class="key" style="background:${s.color}"></i>${s.name}</span>`).join('')}</div>` : '') +
      `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${cfg.title || 'Chart'}">${g}${marks}${labels}
        <g class="hover" style="display:none"><line class="cross" y1="${T}" y2="${H - B}"/>${series.map(() => `<circle r="5" stroke="${SURFACE}" stroke-width="2"/>`).join('')}</g>
        <rect class="hit" x="${L}" y="0" width="${W - L - R}" height="${H}" fill="transparent"/></svg>
      <div class="chart-tip"></div>
      ${cfg.noTable ? '' : `<button class="link-btn table-toggle">Show as a table</button><div class="tbl" hidden></div>`}`;

    const svg = el.querySelector('svg'), hover = svg.querySelector('.hover'), tip = el.querySelector('.chart-tip');
    const dots = hover.querySelectorAll('circle'), cross = hover.querySelector('line');
    function show(evt) {
      const r = svg.getBoundingClientRect();
      const px = ((evt.touches ? evt.touches[0].clientX : evt.clientX) - r.left) * (W / r.width);
      const i = Math.max(0, Math.min(n - 1, Math.round(((px - L) / (W - L - R)) * (n - 1))));
      hover.style.display = '';
      cross.setAttribute('x1', x(i)); cross.setAttribute('x2', x(i));
      series.forEach((s, k) => { dots[k].setAttribute('cx', x(i)); dots[k].setAttribute('cy', y(tops[k][i])); dots[k].setAttribute('fill', s.color); });
      const rows = series.slice().reverse().map(s => `<div class="r"><span><i class="key" style="background:${s.color}"></i>${s.name}</span><b>${fmtY(s.values[i])}</b></div>`).join('');
      const total = cfg.stacked && series.length > 1 ? `<div class="r" style="margin-top:4px;border-top:1px solid #2a3260;padding-top:4px"><span>Total</span><b>${fmtY(tops[series.length - 1][i])}</b></div>` : '';
      tip.innerHTML = `<div class="t">${cfg.tipTitle ? cfg.tipTitle(i) : cfg.labels[i]}</div>${rows}${total}`;
      tip.classList.add('show');
      const sx = x(i) * (r.width / W), tw = tip.offsetWidth;
      tip.style.left = Math.max(0, Math.min(r.width - tw, sx + (sx > r.width / 2 ? -tw - 14 : 14))) + 'px';
      tip.style.top = (el.querySelector('.legend') ? 30 : 4) + 'px';
    }
    function hide() { hover.style.display = 'none'; tip.classList.remove('show'); }
    const hit = svg.querySelector('.hit');
    hit.addEventListener('mousemove', show);
    hit.addEventListener('touchstart', show, { passive: true });
    hit.addEventListener('touchmove', show, { passive: true });
    hit.addEventListener('mouseleave', hide);
    hit.addEventListener('touchend', () => setTimeout(hide, 1600));

    const tg = el.querySelector('.table-toggle');
    if (tg) tg.onclick = () => {
      const box = el.querySelector('.tbl');
      box.hidden = !box.hidden;
      tg.textContent = box.hidden ? 'Show as a table' : 'Hide the table';
      if (!box.hidden && !box.innerHTML) {
        const ev = cfg.tableEvery || Math.max(1, Math.ceil(n / 12));
        const idx = [];
        for (let i = 0; i < n; i += ev) idx.push(i);
        if (idx[idx.length - 1] !== n - 1) idx.push(n - 1);
        box.innerHTML = `<table class="data-table"><thead><tr><th>${cfg.xName || ''}</th>${series.map(s => `<th>${s.name}</th>`).join('')}${cfg.stacked && series.length > 1 ? '<th>Total</th>' : ''}</tr></thead><tbody>${
          idx.map(i => `<tr><td>${cfg.tipTitle ? cfg.tipTitle(i) : cfg.labels[i]}</td>${series.map(s => `<td>${fmtY(s.values[i])}</td>`).join('')}${cfg.stacked && series.length > 1 ? `<td>${fmtY(tops[series.length - 1][i])}</td>` : ''}</tr>`).join('')}</tbody></table>`;
      }
    };
  }
  return { render };
})();

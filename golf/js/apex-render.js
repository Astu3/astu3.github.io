// Golf Improvement App — Apex graphics: painted terrain, smooth camera, animation and the side-view flight panel.
// Classic script: shares globals with the other files; load order is set in golf-improvement-app.html.

// ════════════════════════════════════════════════════════════
// APEX RENDERER
// Each hole's terrain is painted once into a large offscreen canvas: shaded
// tree crowns with shadows, mown fairway stripes, fringed greens, grained
// bunkers, stepped-pyramid ruins, rocky ravines and graded water. Every frame
// then draws that image through a smoothly moving camera and adds the live
// layer on top: water shimmer, a waving flag, tracers, the aim preview and the
// ball with its shadow. A second canvas shows the shot from the side against
// the canopy and tree heights it has to get under or over.
// Light comes from the upper left, so shadows fall down and to the right.
// ════════════════════════════════════════════════════════════
const AR = { PPY: 4, MAX_DIM: 4096, JUNGLE_DENSITY: 15 }; // terrain pixels per yard; sq yds per tree crown
let arTerrain = null;   // { n, canvas, x0, y1, ppy } — painted terrain for the current hole
let arCam = null;       // camera box [x0, y0, x1, y1] in yards
let arCamHole = null;   // hole the camera belongs to (snap instead of gliding between holes)
let arView = null;      // last drawn view, for mapping clicks back to the course
let arRunning = false, arLastT = 0;
let arTerrainCanvas = null; // the single reusable terrain canvas

// ── Small helpers ──────────────────────────────────────────────
function arRng(seed) { let s = (seed % 2147483646) + 1; return () => (s = s * 16807 % 2147483647) / 2147483647; }
function arCentroid(poly) { return [poly.reduce((a, p) => a + p[0], 0) / poly.length, poly.reduce((a, p) => a + p[1], 0) / poly.length]; }
function arScalePoly(poly, k) { const c = arCentroid(poly); return poly.map(p => [c[0] + (p[0] - c[0]) * k, c[1] + (p[1] - c[1]) * k]); }
function arBox(poly) {
  const xs = poly.map(p => p[0]), ys = poly.map(p => p[1]);
  return [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)];
}
function arArea(poly) { let a = 0; for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) a += (poly[j][0] + poly[i][0]) * (poly[j][1] - poly[i][1]); return Math.abs(a / 2); }
function arPill(ctx, x, y, text, bg, fg) {
  ctx.font = '600 11px system-ui, sans-serif';
  const w = ctx.measureText(text).width + 14, hgt = 18;
  ctx.fillStyle = bg; ctx.beginPath(); ctx.roundRect(x - w / 2, y - hgt / 2, w, hgt, 9); ctx.fill();
  ctx.fillStyle = fg; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(text, x, y + 0.5);
  ctx.textBaseline = 'alphabetic';
}

// ── Tree sprites ───────────────────────────────────────────────
// Each crown style is painted once (gradient + leaf clumps) and then stamped
// thousands of times: far faster than building a gradient per tree.
const AR_CROWN_PALS = [['#4e8d40', '#18402a'], ['#5b9a47', '#1f4b2c'], ['#3d7a3a', '#123622'], ['#6aa64e', '#245433'], ['#467f3a', '#163d24']];
const AR_DEEP_PALS  = [['#2f5f30', '#0c2414'], ['#386a35', '#0f2a17'], ['#29552b', '#0a2011']];
let arSpriteSet = null;
function arSprites() {
  if (arSpriteSet) return arSpriteSet;
  const crown = ([light, dark], seed) => {
    const c = document.createElement('canvas'); c.width = c.height = 64;
    const x = c.getContext('2d'), r = arRng(seed);
    const g = x.createRadialGradient(20, 20, 3, 32, 32, 31);
    g.addColorStop(0, light); g.addColorStop(1, dark);
    x.fillStyle = g; x.beginPath(); x.arc(32, 32, 31, 0, Math.PI * 2); x.fill();
    for (let i = 0; i < 10; i++) { // leaf clumps catching the light
      const a = r() * Math.PI * 2, d = r() * 19, cx = 32 + Math.cos(a) * d, cy = 32 + Math.sin(a) * d, rr = 5 + r() * 7;
      const g2 = x.createRadialGradient(cx - rr * 0.35, cy - rr * 0.35, 1, cx, cy, rr);
      g2.addColorStop(0, 'rgba(255,255,220,0.22)'); g2.addColorStop(1, 'rgba(0,0,0,0.12)');
      x.fillStyle = g2; x.beginPath(); x.arc(cx, cy, rr, 0, Math.PI * 2); x.fill();
    }
    return c;
  };
  const shadow = document.createElement('canvas'); shadow.width = shadow.height = 64;
  const sx = shadow.getContext('2d');
  sx.filter = 'blur(4px)'; sx.fillStyle = 'rgba(0,0,0,0.5)';
  sx.beginPath(); sx.ellipse(32, 32, 22, 20, 0, 0, Math.PI * 2); sx.fill();
  arSpriteSet = { crowns: AR_CROWN_PALS.map((p, i) => crown(p, 101 + i)), deep: AR_DEEP_PALS.map((p, i) => crown(p, 301 + i)), shadow };
  return arSpriteSet;
}

// Out-of-bounds forest as one seamless tile, filled in a single operation.
// Each tree is also drawn wrapped across the tile edges so the repeat is invisible.
function arForestPattern(ctx, ppy, rnd) {
  const SP = arSprites(), size = Math.round(150 * ppy), sizeY = Math.round(113 * ppy), tile = document.createElement('canvas');
  tile.width = size; tile.height = sizeY;
  const t = tile.getContext('2d');
  t.fillStyle = '#0c2414'; t.fillRect(0, 0, size, sizeY);
  const trees = [];
  for (let i = 0; i < 380; i++) trees.push({ x: rnd() * size, y: rnd() * sizeY, r: (3.4 + rnd() * 3.2) * ppy, img: SP.deep[(rnd() * SP.deep.length) | 0] });
  const each = fn => trees.forEach(tr => { for (const ox of [-size, 0, size]) for (const oy of [-sizeY, 0, sizeY]) fn(tr, tr.x + ox, tr.y + oy); });
  each((tr, x, y) => t.drawImage(SP.shadow, x + tr.r * 0.45 - tr.r * 1.45, y + tr.r * 0.55 - tr.r * 1.45, tr.r * 2.9, tr.r * 2.9));
  each((tr, x, y) => t.drawImage(tr.img, x - tr.r, y - tr.r, tr.r * 2, tr.r * 2));
  return ctx.createPattern(tile, 'repeat');
}

// ── Terrain painting (once per hole) ───────────────────────────
// opts.groundOnly: paint the ground for the 3D view — no tree crowns or canopies, and the
//   ravines cut out (it builds those in 3D)
// opts.canvas: paint into this canvas instead of the shared 2D terrain canvas
// opts.pad / opts.ppy: margin around the jungle and pixels per yard (the 3D ground wants detail)
function arPaintTerrain(h, opts = {}) {
  const [jx0, jy0, jx1, jy1] = arBox(h.junglePoly);
  // Paint well beyond the jungle so any screen shape (wide desktop, tall phone) stays filled
  const wW = jx1 - jx0, wH = jy1 - jy0;
  const padX = opts.pad ?? Math.max(60, ((wH + 120) * 1.7 - wW) / 2), padY = opts.pad ?? Math.max(60, ((wW + 120) / 0.6 - wH) / 2);
  const x0 = jx0 - padX, y0 = jy0 - padY, x1 = jx1 + padX, y1 = jy1 + padY;
  const ppy = Math.min(opts.ppy ?? AR.PPY, AR.MAX_DIM / (x1 - x0), AR.MAX_DIM / (y1 - y0));
  // One terrain canvas, reused for every hole: allocating a fresh ~40 MB canvas per
  // hole exhausts graphics memory and makes later holes paint very slowly
  const cv = opts.canvas || arTerrainCanvas || (arTerrainCanvas = document.createElement('canvas'));
  cv.width = Math.ceil((x1 - x0) * ppy); cv.height = Math.ceil((y1 - y0) * ppy); // resizing also clears it
  const ctx = cv.getContext('2d');
  const S = p => [(p[0] - x0) * ppy, (y1 - p[1]) * ppy];
  const trace = poly => { ctx.beginPath(); poly.forEach((p, i) => { const [x, y] = S(p); i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); }); ctx.closePath(); };
  const fill = (poly, style) => { trace(poly); ctx.fillStyle = style; ctx.fill(); };
  const clipTo = (poly, draw) => { ctx.save(); trace(poly); ctx.clip(); draw(); ctx.restore(); };
  const rnd = arRng(h.n * 7919 + 13);
  // Scatter tiny specks of color for texture (grass, sand grain, rock)
  // (Points are tested in JS and drawn as one path per color: clipping thousands of tiny
  // rects to a bent, concave shape sent the browser down a path that took seconds)
  const specks = (poly, perSqYd, colors, sizeYd) => {
    const [bx0, by0, bx1, by1] = arBox(poly);
    const n = Math.min(40000, Math.round((bx1 - bx0) * (by1 - by0) * perSqYd));
    const paths = colors.map(() => new Path2D());
    for (let i = 0; i < n; i++) {
      const p = [bx0 + rnd() * (bx1 - bx0), by0 + rnd() * (by1 - by0)];
      const c = (rnd() * colors.length) | 0, s = Math.max(1, sizeYd * ppy * (0.5 + rnd()));
      if (!cePointInPoly(p, poly)) continue;
      const [x, y] = S(p); paths[c].rect(x, y, s, s);
    }
    paths.forEach((path, c) => { ctx.fillStyle = colors[c]; ctx.fill(path); });
  };
  // Shadow cast inward from the edges of a hollow (bunkers, ravines, water)
  // Layered translucent strokes along the edge (clipped inside), offset toward the light:
  // looks like a soft blur, but canvas shadowBlur on a big hazard took seconds of GPU time
  const innerShadow = (poly, color, blurYd, offYd) => clipTo(poly, () => {
    ctx.translate(offYd * ppy * 0.5, offYd * ppy * 0.5);
    ctx.strokeStyle = color; ctx.lineJoin = 'round';
    const steps = 5; ctx.globalAlpha = 0.32;
    for (let k = steps; k >= 1; k--) { trace(poly); ctx.lineWidth = blurYd * ppy * 1.6 * k / steps; ctx.stroke(); }
    ctx.globalAlpha = 1;
  });
  // Mowing stripes across the line of play
  const stripes = (poly, light, dark, widthYd) => clipTo(poly, () => {
    const c = arCentroid(poly);
    let best = 0, bd = 1e9;
    for (let s = 0; s <= h.length; s += 5) { const d = ceDist(ceAt(h.path, s), c); if (d < bd) { bd = d; best = s; } }
    const f = ceFrame(h.path, best), [cx, cy] = S(c);
    ctx.translate(cx, cy); ctx.rotate(Math.atan2(-f.dir[1], f.dir[0]));
    // stripes only need to cover this shape, not the whole canvas
    const [bx0, by0, bx1, by1] = arBox(poly);
    const w = widthYd * ppy, span = Math.hypot(bx1 - bx0, by1 - by0) * ppy / 2 + w;
    for (let k = -Math.ceil(span / w); k < span / w; k++) { ctx.fillStyle = k % 2 ? light : dark; ctx.fillRect(k * w, -span, w + 0.5, span * 2); }
  });

  // 1. Forest floor beyond the course, then the jungle band
  ctx.fillStyle = opts.groundOnly ? '#1e331c' : arForestPattern(ctx, ppy, rnd); ctx.fillRect(0, 0, cv.width, cv.height);
  // Large soft patches of light and shade hide the tile repeat and give the canopy depth
  for (let i = 0; i < 60; i++) {
    const x = rnd() * cv.width, y = rnd() * cv.height, r = (40 + rnd() * 90) * ppy;
    const g = ctx.createRadialGradient(x, y, 0, x, y, r), light = rnd() < 0.45;
    g.addColorStop(0, light ? 'rgba(120,170,90,0.16)' : 'rgba(0,10,4,0.32)'); g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g; ctx.fillRect(x - r, y - r, r * 2, r * 2);
  }
  fill(h.junglePoly, '#123420');

  // 2. Rough with grass texture
  fill(h.roughPoly, '#4a873a');
  specks(h.roughPoly, 0.9, ['#3f7832', '#558f42', '#447f36', '#5c9a47'], 0.45);

  // 3. Ravines: dark gorges with rocky floors and shadowed rims
  h.ravines.forEach(r => {
    fill(r, '#2a1e17');
    specks(r, 0.5, ['#3a2b21', '#1c140f', '#4a382b'], 0.8);
    innerShadow(r, 'rgba(0,0,0,0.85)', 5, 1.2);
    trace(r); ctx.strokeStyle = 'rgba(120,100,80,0.55)'; ctx.lineWidth = 0.8 * ppy; ctx.stroke();
  });
  // The 3D view cuts the gorges out of the ground and builds real walls and floors
  if (opts.groundOnly) { ctx.globalCompositeOperation = 'destination-out'; h.ravines.forEach(r => fill(r, '#000')); ctx.globalCompositeOperation = 'source-over'; }

  // 4. Water: deeper in the middle, lighter at the banks
  h.water.forEach(w => {
    const [bx0, by0, bx1, by1] = arBox(w), [cx, cy] = S([(bx0 + bx1) / 2, (by0 + by1) / 2]);
    const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, Math.max(bx1 - bx0, by1 - by0) * ppy * 0.6);
    g.addColorStop(0, '#1b5d8c'); g.addColorStop(1, '#3a92c4');
    fill(w, g);
    innerShadow(w, 'rgba(10,40,60,0.6)', 3, 0.6);
    trace(w); ctx.strokeStyle = 'rgba(210,235,250,0.55)'; ctx.lineWidth = 0.6 * ppy; ctx.stroke();
  });

  // 5. Fairways and tee boxes: striped, with a darker first-cut edge
  [...h.fairways, ...h.teeBoxes].forEach(f => {
    trace(f); ctx.strokeStyle = '#5f9e46'; ctx.lineWidth = 2.4 * ppy; ctx.stroke(); // first cut
    if (opts.groundOnly) fill(f, '#7bbb53'); else stripes(f, '#82c25a', '#73b44d', 9); // (3D: the shader mows them)
    trace(f); ctx.strokeStyle = 'rgba(30,60,20,0.18)'; ctx.lineWidth = 0.5 * ppy; ctx.stroke();
  });

  // 6. Bunkers: grained sand with a shadowed lip
  h.bunkers.forEach(b => {
    trace(b); ctx.strokeStyle = '#5a8f45'; ctx.lineWidth = 1.6 * ppy; ctx.stroke(); // grass lip
    fill(b, '#ead7a3');
    specks(b, 3, ['#dcc58c', '#f4e6bd', '#d6bd82'], 0.25);
    innerShadow(b, 'rgba(110,80,30,0.55)', 2.2, 0.7);
  });

  // 7. Green: fringe collar, a soft dome of light, and the false-front slope
  trace(h.green); ctx.strokeStyle = '#6fae4c'; ctx.lineWidth = 4.5 * ppy; ctx.stroke();
  {
    const [bx0, by0, bx1, by1] = arBox(h.green);
    const [lx, ly] = S([bx0 + (bx1 - bx0) * 0.38, by0 + (by1 - by0) * 0.62]);
    const g = ctx.createRadialGradient(lx, ly, 0, lx, ly, Math.max(bx1 - bx0, by1 - by0) * ppy * 0.7);
    g.addColorStop(0, '#b9e985'); g.addColorStop(1, '#8fcd5f');
    fill(h.green, g);
    if (!opts.groundOnly) stripes(h.green, 'rgba(255,255,255,0.05)', 'rgba(0,0,0,0.03)', 4);
  }
  h.falseFronts.forEach(ff => clipTo(h.green, () => {
    const [bx0, by0, bx1, by1] = arBox(ff.poly), [ax, ay] = S([(bx0 + bx1) / 2, by1]), [zx, zy] = S([(bx0 + bx1) / 2, by0]);
    const g = ctx.createLinearGradient(ax, ay, zx, zy);
    g.addColorStop(0, 'rgba(40,80,25,0)'); g.addColorStop(1, 'rgba(40,80,25,0.45)');
    fill(ff.poly, g);
  }));

  // 7b. Hill shading (2D only; the 3D view lights real slopes): light from the upper left
  if (!opts.groundOnly && h.elevSpec) {
    const step = CE_ELEV_STEP, cols = Math.ceil((x1 - x0) / step), rows = Math.ceil((y1 - y0) / step);
    const sc = document.createElement('canvas'); sc.width = cols; sc.height = rows;
    const sctx = sc.getContext('2d'), img = sctx.createImageData(cols, rows);
    const L = [-0.55, 0.55, 0.63], flatLit = L[2];
    for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) {
      const [gx, gy] = ceSlope(h, [x0 + (i + 0.5) * step, y1 - (j + 0.5) * step]);
      const n = 1 / Math.hypot(gx, gy, 1), lit = (-gx * L[0] - gy * L[1] + L[2]) * n;
      const v = Math.max(0, Math.min(255, 128 + (lit - flatLit) * 600)), k = (j * cols + i) * 4;
      img.data[k] = img.data[k + 1] = img.data[k + 2] = v; img.data[k + 3] = 255;
    }
    sctx.putImageData(img, 0, 0);
    ctx.save(); ctx.globalCompositeOperation = 'overlay'; ctx.imageSmoothingEnabled = true;
    ctx.drawImage(sc, 0, 0, cols * step * ppy, rows * step * ppy); ctx.restore();
  }

  // 8. Ruins: stepped stone pyramids, lit from the upper left, with a central stair
  h.ruins.forEach(r => {
    const [bx0, by0, bx1, by1] = arBox(r);
    const c = [(bx0 + bx1) / 2, (by0 + by1) / 2], hw = (bx1 - bx0) / 2, hh = (by1 - by0) / 2;
    const [cx, cy] = S(c);
    // ground shadow, cast down-right
    ctx.fillStyle = opts.groundOnly ? 'rgba(0,0,0,0)' : 'rgba(0,0,0,0.42)'; // 3D ruins cast real shadows
    ctx.fillRect(cx - hw * ppy + 2.6 * ppy, cy - hh * ppy + 3 * ppy, hw * 2 * ppy, hh * 2 * ppy);
    const tiers = 5;
    for (let i = 0; i < tiers; i++) {
      const k = 1 - i / tiers * 0.82, w = hw * k * ppy, hgt = hh * k * ppy, lip = Math.max(1, 0.7 * ppy);
      const x = cx - w, y = cy - hgt;
      ctx.fillStyle = i % 2 ? '#b4ab97' : '#a69d87'; ctx.fillRect(x, y, w * 2, hgt * 2);      // tier top
      ctx.fillStyle = 'rgba(255,250,230,0.28)';                                            // lit edges
      ctx.fillRect(x, y, w * 2, lip); ctx.fillRect(x, y, lip, hgt * 2);
      ctx.fillStyle = 'rgba(40,32,22,0.42)';                                               // shadowed edges
      ctx.fillRect(x, y + hgt * 2 - lip, w * 2, lip); ctx.fillRect(x + w * 2 - lip, y, lip, hgt * 2);
    }
    // stone texture and the stair running down the face toward the fairway
    specks([[bx0, by0], [bx1, by0], [bx1, by1], [bx0, by1]], 0.5, ['#8f866f', '#c9c0aa'], 0.3);
    const toward = Math.sign((ceAt(h.path, h.length / 2)[0]) - c[0]) || 1;
    const sw = Math.max(2, hw * 0.28 * ppy), sx0 = toward > 0 ? cx : cx - hw * ppy;
    ctx.fillStyle = '#c2b9a3'; ctx.fillRect(sx0, cy - sw / 2, hw * ppy, sw);
    ctx.strokeStyle = 'rgba(60,50,38,0.55)'; ctx.lineWidth = 1;
    for (let x = 0; x < hw * ppy; x += Math.max(2, 0.9 * ppy)) { ctx.beginPath(); ctx.moveTo(sx0 + x, cy - sw / 2); ctx.lineTo(sx0 + x, cy + sw / 2); ctx.stroke(); }
  });

  // 9. Rainforest: thousands of shaded crowns, shadows first so crowns overlap them
  const SP = arSprites(), CROWNS = SP.crowns;
  const blocked = p => cePointInPoly(p, h.green) || inAnyPoly(p, h.water) || inAnyPoly(p, h.ravines) || inAnyPoly(p, h.ruins) ||
                       inAnyPoly(p, h.fairways) || inAnyPoly(p, h.bunkers) || inAnyPoly(p, h.teeBoxes);
  const crowns = [];
  const [tx0, ty0, tx1, ty1] = arBox(h.junglePoly);
  const want = Math.min(11000, Math.round((arArea(h.junglePoly) - arArea(h.roughPoly) + h.trees.reduce((a, t) => a + arArea(t), 0)) / AR.JUNGLE_DENSITY));
  for (let tries = 0; crowns.length < want && tries < want * 6; tries++) {
    const p = [tx0 + rnd() * (tx1 - tx0), ty0 + rnd() * (ty1 - ty0)];
    if (!cePointInPoly(p, h.junglePoly)) continue;
    if (cePointInPoly(p, h.roughPoly) && !inAnyPoly(p, h.trees)) continue;
    if (blocked(p)) continue;
    crowns.push({ p, r: 2.4 + rnd() * 3.4, pal: CROWNS[(rnd() * CROWNS.length) | 0] });
  }
  // Lone trees dotting the rough edges
  for (let i = 0; i < h.length / 12; i++) {
    const side = rnd() < 0.5 ? -1 : 1, s = rnd() * h.length;
    const p = ceAt(h.path, s, side * ((h.roughPoly ? 1 : 1) * (26 + rnd() * 10)));
    if (cePointInPoly(p, h.roughPoly) && !blocked(p) && ceDist(p, h.pin) > 25) crowns.push({ p, r: 2 + rnd() * 1.8, pal: CROWNS[(rnd() * CROWNS.length) | 0] });
  }
  if (!opts.groundOnly) crowns.forEach(c => { const [x, y] = S(c.p), r = c.r * ppy; ctx.drawImage(SP.shadow, x + r * 0.45 - r * 1.45, y + r * 0.55 - r * 1.45, r * 2.9, r * 2.9); });
  // 3D ground: contact shade under the canopy, and a soft dark band where the rough meets
  // the forest, so the 3D trees sit in the ground instead of on it
  if (opts.groundOnly) {
    crowns.forEach(c => { const [x, y] = S(c.p), r = c.r * ppy * 1.7; ctx.drawImage(SP.shadow, x - r, y - r, r * 2, r * 2); });
    // ambient occlusion where stone meets the ground: ruins, and the great temples
    const stones = [...h.ruins.map(r => { const [bx0, by0, bx1, by1] = arBox(r); return { c: [(bx0 + bx1) / 2, (by0 + by1) / 2], r: Math.max(bx1 - bx0, by1 - by0) * 0.62 }; }),
                    ...(typeof ap3Temples === 'function' ? ap3Temples(h).map(t => ({ c: t.c, r: Math.max(t.hu, t.hv) * 1.25 })) : [])];
    stones.forEach(st => { const [x, y] = S(st.c), r = st.r * ppy; ctx.drawImage(SP.shadow, x - r, y - r, r * 2, r * 2); ctx.drawImage(SP.shadow, x - r, y - r, r * 2, r * 2); });
    clipTo(h.roughPoly, () => {
      ctx.strokeStyle = 'rgba(8,30,12,0.16)'; ctx.lineJoin = 'round';
      for (let k = 4; k >= 1; k--) { trace(h.roughPoly); ctx.lineWidth = 7 * ppy * k / 4; ctx.stroke(); }
    });
  }
  if (!opts.groundOnly) crowns.forEach(c => { const [x, y] = S(c.p), r = c.r * ppy; ctx.drawImage(c.pal, x - r, y - r, r * 2, r * 2); });

  // 10. Canopies: a shadow on the ground, then a translucent mass of leaves above
  if (!opts.groundOnly) h.canopies.forEach(c => { // the 3D view builds real canopies
    ctx.save(); ctx.translate(2.5 * ppy, 3 * ppy); fill(c.poly, 'rgba(0,0,0,0.28)'); ctx.restore();
    const [bx0, by0, bx1, by1] = arBox(c.poly), n = Math.round(arArea(c.poly) / 6);
    const leaves = [];
    for (let i = 0; i < n * 4 && leaves.length < n; i++) {
      const p = [bx0 + rnd() * (bx1 - bx0), by0 + rnd() * (by1 - by0)];
      if (cePointInPoly(p, c.poly)) leaves.push({ p, r: 2.2 + rnd() * 2.6 });
    }
    ctx.globalAlpha = 0.82;
    leaves.forEach(l => {
      const [x, y] = S(l.p), r = l.r * ppy;
      const g = ctx.createRadialGradient(x - r * 0.35, y - r * 0.35, r * 0.1, x, y, r);
      g.addColorStop(0, '#79b85a'); g.addColorStop(1, '#2a5a30');
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
    });
    ctx.globalAlpha = 1;
  });

  return { n: h.n, canvas: cv, x0, y0, x1, y1, ppy, crowns: crowns.map(c => ({ p: c.p, r: c.r })) };
}
function inAnyPoly(p, list) { return list.some(q => cePointInPoly(p, q)); }

// ── Animation state ────────────────────────────────────────────
// Where the ball is right now during a shot: { pos, z, flightIdx, rollIdx }
function arShotProgress(t) {
  const r = apexAnim.res, el = Math.max(0, t - apexAnim.start), flyMs = apexFlightMs(r);
  if (el < flyMs) {
    const k = el / flyMs, f = k * (r.world.length - 1), i = Math.floor(f), a = r.world[i], b = r.world[Math.min(r.world.length - 1, i + 1)], u = f - i;
    return { pos: [a.p[0] + (b.p[0] - a.p[0]) * u, a.p[1] + (b.p[1] - a.p[1]) * u], z: a.z + (b.z - a.z) * u, flightIdx: i, rollIdx: 0 };
  }
  const n = r.rollPath.length, k = Math.min(1, (el - flyMs) / Math.max(1, n * 18)), ri = Math.floor(k * n);
  const end = r.world[r.world.length - 1].p;
  return { pos: ri > 0 ? r.rollPath[ri - 1] : end, z: 0, flightIdx: r.world.length - 1, rollIdx: ri };
}

// ── Camera ─────────────────────────────────────────────────────
function arTargetBox(h, W, H, t) {
  let box;
  if (apexFullView) {
    const [x0, y0, x1, y1] = arBox(h.roughPoly);
    box = [x0 - 20, y0 - 10, x1 + 20, y1 + 10];
  } else {
    let pts;
    if (apexAnim) pts = [apexAnim.from, apexAnim.res.rest, arShotProgress(t).pos, h.pin];
    else if (apex.holeResult) pts = [apex.ball, h.pin];
    else pts = [apex.ball, h.pin, apexPreview().rest];
    const xs = pts.map(p => p[0]), ys = pts.map(p => p[1]);
    box = [Math.min(...xs) - 35, Math.min(...ys) - 35, Math.max(...xs) + 35, Math.max(...ys) + 35];
  }
  // Minimum span, then match the canvas shape
  let [x0, y0, x1, y1] = box;
  const minSpan = 130;
  if (x1 - x0 < minSpan) { const c = (x0 + x1) / 2; x0 = c - minSpan / 2; x1 = c + minSpan / 2; }
  if (y1 - y0 < minSpan) { const c = (y0 + y1) / 2; y0 = c - minSpan / 2; y1 = c + minSpan / 2; }
  const aspect = W / H, w = x1 - x0, hh = y1 - y0;
  if (w / hh < aspect) { const nw = hh * aspect, c = (x0 + x1) / 2; x0 = c - nw / 2; x1 = c + nw / 2; }
  else { const nh = w / aspect, c = (y0 + y1) / 2; y0 = c - nh / 2; y1 = c + nh / 2; }
  return [x0, y0, x1, y1];
}

// ── Main view ──────────────────────────────────────────────────
function arDraw(t, dt) {
  const canvas = document.getElementById('apex-canvas');
  if (!canvas || !apex) return;
  const h = apexHole();
  if (!arTerrain || arTerrain.n !== h.n) arTerrain = arPaintTerrain(h);
  const dpr = window.devicePixelRatio || 1, W = canvas.clientWidth, H = canvas.clientHeight;
  if (!W || !H) return;
  if (canvas.width !== Math.round(W * dpr) || canvas.height !== Math.round(H * dpr)) { canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr); }
  const ctx = canvas.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  // Glide the camera toward its target (snap on a new hole)
  const target = arTargetBox(h, W, H, t);
  if (!arCam || arCamHole !== h.n) { arCam = target; arCamHole = h.n; }
  else { const k = 1 - Math.exp(-dt / 0.35); arCam = arCam.map((v, i) => v + (target[i] - v) * k); }
  const [cx0, cy0, cx1, cy1] = arCam, sc = W / (cx1 - cx0);
  arView = { x0: cx0, y1: cy1, sc };
  const S = p => [(p[0] - cx0) * sc, (cy1 - p[1]) * sc];
  const trace = poly => { ctx.beginPath(); poly.forEach((p, i) => { const [x, y] = S(p); i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); }); ctx.closePath(); };

  // Painted terrain through the camera
  const T = arTerrain;
  ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
  ctx.fillStyle = '#0a1d11'; ctx.fillRect(0, 0, W, H);
  ctx.drawImage(T.canvas, (cx0 - T.x0) * T.ppy, (T.y1 - cy1) * T.ppy, (cx1 - cx0) * T.ppy, (cy1 - cy0) * T.ppy, 0, 0, W, H);

  // Water shimmer: slow diagonal glints
  h.water.forEach(w => {
    ctx.save(); trace(w); ctx.clip();
    const [bx0, by0, bx1, by1] = arBox(w), span = Math.max(bx1 - bx0, by1 - by0);
    ctx.strokeStyle = 'rgba(255,255,255,0.16)'; ctx.lineWidth = Math.max(1, 0.5 * sc);
    for (let i = 0; i < 9; i++) {
      const off = ((t / 4000 + i / 9) % 1) * span * 2 - span * 0.5;
      const [ax, ay] = S([bx0 + off, by0]), [bx, by] = S([bx0 + off - span * 0.15, by0 + span * 0.15]);
      ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(bx, by); ctx.stroke();
    }
    ctx.restore();
  });

  // Canopy outlines + heights (crisp, not part of the painted image)
  h.canopies.forEach(c => {
    ctx.setLineDash([6, 5]); ctx.lineWidth = 1.3; ctx.strokeStyle = 'rgba(220,255,210,0.75)'; trace(c.poly); ctx.stroke(); ctx.setLineDash([]);
    const [x, y] = S(arCentroid(c.poly));
    arPill(ctx, x, y, `canopy ${c.bottom}–${c.top} ft`, 'rgba(12,40,20,0.78)', '#e6ffe0');
  });

  // Tee markers: this round's tee bright, the others faint
  Object.entries(h.tees).forEach(([k, tp]) => {
    const f = ceFrame(h.path, 0), [x, y] = S(tp), off = 4 * sc;
    ctx.globalAlpha = k === apex.tee ? 1 : 0.35;
    [-1, 1].forEach(sd => {
      const mx = x + f.right[0] * off * sd, my = y - f.right[1] * off * sd;
      ctx.fillStyle = APEX_TEES[k].color; ctx.beginPath(); ctx.arc(mx, my, Math.max(2.2, 0.9 * sc), 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,0.7)'; ctx.lineWidth = 1; ctx.stroke();
    });
    ctx.globalAlpha = 1;
  });

  // Earlier shots on this hole
  const tracers = apexAnim ? apex.tracers.slice(0, -1) : apex.tracers;
  tracers.forEach(tr => arTracer(ctx, S, tr.pts, tr.roll, 0.55));

  // Shot in flight
  let ball = apex.ball, ballZ = 0;
  if (apexAnim) {
    const pr = arShotProgress(t), r = apexAnim.res;
    const flown = r.world.slice(0, pr.flightIdx + 1).map(w => w.p).concat([pr.pos]);
    arTracer(ctx, S, pr.rollIdx ? r.world.map(w => w.p) : flown, r.rollPath.slice(0, pr.rollIdx), 1, true);
    ball = pr.pos; ballZ = pr.z;
  }

  // Aim: predicted ground track, roll and landing ring
  if (!apexAnim && !apex.holeResult) {
    const pv = apexPreview(), bad = pv.events.length || pv.penalty;
    ctx.setLineDash([2, 6]); ctx.lineCap = 'round'; ctx.lineWidth = 2.2;
    ctx.strokeStyle = bad ? 'rgba(255,170,150,0.9)' : 'rgba(255,255,255,0.85)';
    ctx.beginPath(); pv.world.forEach((w, i) => { const [x, y] = S(w.p); i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); });
    pv.rollPath.forEach(p => { const [x, y] = S(p); ctx.lineTo(x, y); }); ctx.stroke(); ctx.setLineDash([]); ctx.lineCap = 'butt';
    const [lx, ly] = S(pv.rest), pulse = 1 + 0.12 * Math.sin(t / 260);
    ctx.lineWidth = 2; ctx.strokeStyle = bad ? '#ff9c86' : '#ffffff';
    ctx.beginPath(); ctx.arc(lx, ly, Math.max(7, 4 * sc) * pulse, 0, Math.PI * 2); ctx.stroke();
    ctx.globalAlpha = 0.25; ctx.fillStyle = bad ? '#ff9c86' : '#ffffff'; ctx.fill(); ctx.globalAlpha = 1;
    if (bad) arPill(ctx, lx, ly - Math.max(16, 6 * sc), pv.events[0] || 'Hazard', 'rgba(150,30,20,0.85)', '#fff');
  }

  // Pin: cup, flagstick shadow, waving flag
  {
    const [px, py] = S(h.pin), pole = Math.max(26, 7 * sc);
    ctx.strokeStyle = 'rgba(0,0,0,0.28)'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(px, py); ctx.lineTo(px + pole * 0.55, py + pole * 0.35); ctx.stroke();
    ctx.fillStyle = '#1b1b1b'; ctx.beginPath(); ctx.ellipse(px, py, Math.max(2.5, 0.35 * sc), Math.max(1.6, 0.25 * sc), 0, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#f5f5f5'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(px, py); ctx.lineTo(px, py - pole); ctx.stroke();
    const wave = Math.sin(t / 180) * 2.2, fw = pole * 0.5, fh = pole * 0.32;
    ctx.fillStyle = '#e63946'; ctx.beginPath(); ctx.moveTo(px, py - pole);
    ctx.quadraticCurveTo(px + fw * 0.5, py - pole + wave, px + fw, py - pole + fh * 0.5 + wave * 0.5);
    ctx.quadraticCurveTo(px + fw * 0.5, py - pole + fh + wave, px, py - pole + fh); ctx.fill();
  }

  // Ball: shadow stays on the ground, the ball rises and grows with height
  {
    const [bx, by] = S(ball), lift = Math.min(60, ballZ * 0.32) * Math.min(1.4, sc / 3);
    const shadowOff = lift * 0.6;
    ctx.fillStyle = 'rgba(0,0,0,0.38)'; ctx.beginPath(); ctx.ellipse(bx + shadowOff, by + shadowOff * 0.4, 4, 2.6, 0, 0, Math.PI * 2); ctx.fill();
    const r = 4.2 + Math.min(4, ballZ / 30);
    const g = ctx.createRadialGradient(bx - r * 0.35, by - lift - r * 0.35, r * 0.1, bx, by - lift, r);
    g.addColorStop(0, '#ffffff'); g.addColorStop(1, '#c9cfd4');
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(bx, by - lift, r, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,0.45)'; ctx.lineWidth = 0.8; ctx.stroke();
  }

  // Vignette and scale
  const vg = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.35, W / 2, H / 2, Math.max(W, H) * 0.75);
  vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(0,0,0,0.38)');
  ctx.fillStyle = vg; ctx.fillRect(0, 0, W, H);
  const bar = sc * 50;
  ctx.fillStyle = 'rgba(255,255,255,0.85)'; ctx.fillRect(14, H - 18, bar, 2.5);
  ctx.font = '600 11px system-ui, sans-serif'; ctx.textAlign = 'left'; ctx.fillText('50 yds', 14, H - 24);
}

// A shot tracer: glow underneath, crisp line on top, dotted roll
function arTracer(ctx, S, pts, roll, alpha, live = false) {
  if (pts.length < 2) return;
  const line = () => { ctx.beginPath(); pts.forEach((p, i) => { const [x, y] = S(p); i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); }); };
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  if (live) { ctx.strokeStyle = 'rgba(255,214,120,0.35)'; ctx.lineWidth = 7; line(); ctx.stroke(); }
  ctx.strokeStyle = live ? `rgba(255,245,215,${alpha})` : `rgba(255,255,255,${alpha})`; ctx.lineWidth = live ? 2.6 : 2; line(); ctx.stroke();
  if (roll.length) {
    ctx.setLineDash([2, 4]); ctx.strokeStyle = `rgba(255,255,255,${alpha * 0.8})`; ctx.lineWidth = 2;
    ctx.beginPath(); const [sx, sy] = S(pts[pts.length - 1]); ctx.moveTo(sx, sy);
    roll.forEach(p => { const [x, y] = S(p); ctx.lineTo(x, y); }); ctx.stroke(); ctx.setLineDash([]);
  }
  ctx.lineCap = 'butt';
}

// ── Side view: the shot's height against what it must clear ───
function arDrawSide(t) {
  const canvas = document.getElementById('apex-side');
  if (!canvas || !apex) return;
  const dpr = window.devicePixelRatio || 1, W = canvas.clientWidth, H = canvas.clientHeight;
  if (!W || !H) return;
  if (canvas.width !== Math.round(W * dpr) || canvas.height !== Math.round(H * dpr)) { canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr); }
  const ctx = canvas.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  const h = apexHole();

  // Which shot to show: the one in flight, else the preview of the next one
  let res, start, live = false, progress = null;
  if (apexAnim) { res = apexAnim.res; start = apexAnim.from; live = true; progress = arShotProgress(t); }
  else if (!apex.holeResult) { res = apexPreview(); start = apex.ball; }
  // Sky
  const sky = ctx.createLinearGradient(0, 0, 0, H);
  sky.addColorStop(0, '#cfe8f7'); sky.addColorStop(1, '#eef7ee');
  ctx.fillStyle = sky; ctx.fillRect(0, 0, W, H);
  if (!res) { ctx.fillStyle = '#5a7a5a'; ctx.font = '600 12px system-ui, sans-serif'; ctx.textAlign = 'center'; ctx.fillText('Side view appears with your next shot', W / 2, H / 2); return; }

  const ground = 16, pad = 10;
  // Heights are drawn relative to the ball's own ground, with the terrain profile beneath
  const e0 = ceElevation(h, start), rel = p => ceElevation(h, p) - e0;
  const dists = res.world.map(w => ceDist(start, w.p));
  const rollEnd = res.rollPath.length ? ceDist(start, res.rollPath[res.rollPath.length - 1]) : 0;
  const maxX = Math.max(60, ...dists, rollEnd) * 1.06;
  // Obstacles under the flight: canopies, rainforest and ruins
  const cols = [];
  let topFt = res.flight.apexFt;
  const samples = 90;
  for (let i = 0; i <= samples; i++) {
    const d = maxX * i / samples, a = Math.atan2(res.rest[0] - start[0], res.rest[1] - start[1]);
    // follow the actual ground track while in flight
    let p;
    if (d <= dists[dists.length - 1]) { const j = dists.findIndex(x => x >= d); p = res.world[Math.max(0, j)].p; }
    else p = [start[0] + Math.sin(a) * d, start[1] + Math.cos(a) * d];
    const surf = ceSurfaceAt(h, p);
    const can = h.canopies.find(c => cePointInPoly(p, c.poly));
    const g = rel(p);
    cols.push({ d, surf, can, g });
    if (can) topFt = Math.max(topFt, can.top + g);
    if (surf === 'jungle') topFt = Math.max(topFt, CE.JUNGLE_TOP_FT + g);
  }
  topFt = Math.max(topFt, ...res.world.map(w => w.za - e0));
  const minY = Math.min(0, ...cols.map(c => c.g)) - 4;
  const maxY = Math.min(180, Math.max(40, topFt) * 1.18);
  const X = d => pad + (d / maxX) * (W - pad * 2), Y = z => H - ground - ((z - minY) / (maxY - minY)) * (H - ground - 8);

  // Obstacles as height bands
  const colW = (W - pad * 2) / samples + 1;
  cols.forEach(c => {
    const x = X(c.d) - colW / 2;
    if (c.surf === 'jungle') { ctx.fillStyle = 'rgba(24,70,36,0.55)'; ctx.fillRect(x, Y(c.g + CE.JUNGLE_TOP_FT), colW, Y(c.g) - Y(c.g + CE.JUNGLE_TOP_FT)); }
    if (c.surf === 'ruins') { ctx.fillStyle = 'rgba(140,130,110,0.7)'; ctx.fillRect(x, Y(c.g + CE.RUIN_TOP_FT), colW, Y(c.g) - Y(c.g + CE.RUIN_TOP_FT)); }
    if (c.can) { ctx.fillStyle = 'rgba(40,110,50,0.5)'; ctx.fillRect(x, Y(c.g + c.can.top), colW, Y(c.g + c.can.bottom) - Y(c.g + c.can.top)); }
  });
  // Ground: earth beneath the terrain profile, topped with a strip colored by surface
  ctx.fillStyle = '#8a7a5e';
  ctx.beginPath(); ctx.moveTo(X(0), H); cols.forEach(c => ctx.lineTo(X(c.d), Y(c.g))); ctx.lineTo(X(maxX), H); ctx.closePath(); ctx.fill();
  const SURF = { fairway: '#7cbd52', tee: '#7cbd52', rough: '#4d8a3c', green: '#a6dc72', sand: '#e6d29c', water: '#2f7fb5', ravine: '#2a1e17', jungle: '#1f4a2b', ruins: '#a39b8b', ob: '#0c2416' };
  cols.forEach(c => { ctx.fillStyle = SURF[c.surf] || '#4d8a3c'; ctx.fillRect(X(c.d) - colW / 2, Y(c.g), colW, c.surf === 'ravine' ? H - Y(c.g) : 5); });

  // Height gridlines (above the ball's ground)
  ctx.strokeStyle = 'rgba(60,90,70,0.15)'; ctx.lineWidth = 1; ctx.fillStyle = 'rgba(50,80,60,0.6)'; ctx.font = '10px system-ui, sans-serif'; ctx.textAlign = 'left';
  for (let z = 25; z < maxY; z += 25) { ctx.beginPath(); ctx.moveTo(pad, Y(z)); ctx.lineTo(W - pad, Y(z)); ctx.stroke(); ctx.fillText(`${z} ft`, pad + 2, Y(z) - 2); }

  // The trajectory
  const traj = res.world.map((w, i) => [X(dists[i]), Y(w.za - e0)]);
  const upto = live ? progress.flightIdx + 1 : traj.length;
  ctx.lineCap = 'round';
  if (!live) ctx.setLineDash([4, 5]);
  ctx.strokeStyle = live ? '#c76b1c' : ((res.events.length || res.penalty) ? '#d9534f' : '#2d6a4f'); ctx.lineWidth = 2.4;
  ctx.beginPath(); traj.slice(0, upto).forEach(([x, y], i) => i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)); ctx.stroke(); ctx.setLineDash([]);
  if (live) {
    const [bx, by] = [X(ceDist(start, progress.pos)), Y(progress.z + rel(progress.pos))];
    ctx.fillStyle = '#fff'; ctx.strokeStyle = '#333'; ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(bx, by, 4, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
  }
  // Blocked: mark where it hits
  if (res.events.some(e => /canopy|trees|ruins/i.test(e))) {
    const [ex, ey] = traj[traj.length - 1];
    ctx.strokeStyle = '#d9534f'; ctx.lineWidth = 2.5;
    ctx.beginPath(); ctx.moveTo(ex - 5, ey - 5); ctx.lineTo(ex + 5, ey + 5); ctx.moveTo(ex + 5, ey - 5); ctx.lineTo(ex - 5, ey + 5); ctx.stroke();
  }
  // Labels
  const apexIdx = res.world.reduce((m, w, i) => w.za > res.world[m].za ? i : m, 0);
  ctx.fillStyle = '#1e3d2b'; ctx.font = '600 11px system-ui, sans-serif'; ctx.textAlign = 'center';
  ctx.fillText(`${Math.round(res.flight.apexFt)} ft`, X(dists[apexIdx]), Math.max(12, Y(res.world[apexIdx].za - e0) - 6));
  ctx.textAlign = 'right';
  ctx.fillText(`${live ? '' : 'Preview · '}carry ${Math.round(res.carry)} · total ${Math.round(res.total)} yds`, W - pad, 14);
}

// ── Loop + input ───────────────────────────────────────────────
function arFrame(t) {
  const page = document.getElementById('page-apex');
  if (!apex || !page || !page.classList.contains('active') || !document.getElementById('apex-canvas')) { arRunning = false; return; }
  const dt = Math.min(0.1, Math.max(0, (t - arLastT) / 1000)); arLastT = t;
  try { if (ap3.on) ap3Frame(t, dt); else arDraw(t, dt); arDrawSide(t); } catch (e) { console.error(e); }
  requestAnimationFrame(arFrame);
}
function arKick() {
  if (arRunning) return;
  arRunning = true; arLastT = performance.now();
  requestAnimationFrame(arFrame);
}
// Called after the Apex screen is (re)built
function arAttach() {
  if (apex && arTerrain && arTerrain.n !== apexHole().n) arTerrain = null;
  arKick();
  // Draw immediately too, so the view is never blank while frames are paused
  try { if (ap3.on) ap3Attach(); else arDraw(performance.now(), 0); arDrawSide(performance.now()); } catch (e) { console.error(e); }
}
function arScreenToWorld(e) {
  const canvas = e.currentTarget, rect = canvas.getBoundingClientRect();
  if (!arView) return apexHole().pin;
  return [arView.x0 + (e.clientX - rect.left) / arView.sc, arView.y1 - (e.clientY - rect.top) / arView.sc];
}

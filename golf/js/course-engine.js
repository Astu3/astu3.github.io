// Golf Improvement App — Virtual course engine: hole geometry, surfaces, shot resolution,
// penalties, auto-putting and simulated swings. Pure logic (no DOM), so it also runs in Node.
// Classic script: shares globals with the other files; load order is set in golf-improvement-app.html.

// ════════════════════════════════════════════════════════════
// COURSE ENGINE
// Hole coordinates are yards: x = right, y = toward the green (the back tee
// is at 0,0 and play starts heading "up"). Holes are authored along a
// centerline with distances (s) and side offsets, and built into polygons.
// Heights (canopies, trees) are in feet, matching the ball flight path.
// ════════════════════════════════════════════════════════════
const CE = {
  JUNGLE_TOP_FT: 85,   // rainforest blocks any ball below this height
  RUIN_TOP_FT: 30,     // stone ruins block low balls
  ROUGH_HALF: 34,      // default half-width of the playable rough corridor
  JUNGLE_RING: 50,     // jungle beyond the rough, then out of bounds
  FAIRWAY_HALF: 17,
  // Ball speed / spin multipliers by lie (flyers out of rough, sand and jungle cost distance)
  LIE: { tee: [1, 1], fairway: [1, 1], rough: [0.92, 0.75], sand: [0.85, 0.9], recovery: [0.65, 0.8], green: [1, 1] },
};

// ── Geometry ───────────────────────────────────────────────────
// (each polygon's bounding box is cached, so most polygons are ruled out with four comparisons)
const ceBoxCache = new WeakMap();
function cePointInPoly(p, poly) {
  let b = ceBoxCache.get(poly);
  if (!b) {
    b = [Infinity, Infinity, -Infinity, -Infinity];
    for (const [x, y] of poly) { if (x < b[0]) b[0] = x; if (y < b[1]) b[1] = y; if (x > b[2]) b[2] = x; if (y > b[3]) b[3] = y; }
    ceBoxCache.set(poly, b);
  }
  if (p[0] < b[0] || p[0] > b[2] || p[1] < b[1] || p[1] > b[3]) return false;
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i], [xj, yj] = poly[j];
    if ((yi > p[1]) !== (yj > p[1]) && p[0] < (xj - xi) * (p[1] - yi) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}
function ceEllipse(cx, cy, rx, ry, rotDeg = 0, n = 32) {
  const r = rotDeg * Math.PI / 180, out = [];
  for (let i = 0; i < n; i++) {
    const a = i / n * Math.PI * 2, x = Math.cos(a) * rx, y = Math.sin(a) * ry;
    out.push([cx + x * Math.cos(r) - y * Math.sin(r), cy + x * Math.sin(r) + y * Math.cos(r)]);
  }
  return out;
}
const ceDist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);

// A hole's centerline: segments of [length, turn°] (turn is applied before the segment, + = right)
function ceBuildPath(segments) {
  const pts = [[0, 0]];
  let heading = 0, x = 0, y = 0;
  for (const [len, turn = 0] of segments) {
    heading += turn * Math.PI / 180;
    x += Math.sin(heading) * len; y += Math.cos(heading) * len;
    pts.push([x, y]);
  }
  const cum = [0];
  for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + ceDist(pts[i - 1], pts[i]));
  return { pts, cum, length: cum[cum.length - 1] };
}
// Position and heading on the centerline at arc length s (extrapolates past either end)
function ceFrame(path, s) {
  const { pts, cum } = path;
  let i = 1;
  while (i < pts.length - 1 && cum[i] < s) i++;
  const a = pts[i - 1], b = pts[i], segLen = cum[i] - cum[i - 1] || 1;
  const t = (s - cum[i - 1]) / segLen;
  const dir = [(b[0] - a[0]) / segLen, (b[1] - a[1]) / segLen];
  return { p: [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t], dir, right: [dir[1], -dir[0]] };
}
function ceAt(path, s, side = 0) {
  const f = ceFrame(path, s);
  return [f.p[0] + f.right[0] * side, f.p[1] + f.right[1] * side];
}
// A band along the centerline from s0 to s1, `half` yards either side of (center offset `side`)
function ceCorridor(path, s0, s1, half, side = 0, step = 8) {
  const L = [], R = [];
  for (let s = s0; ; s = Math.min(s1, s + step)) {
    const f = ceFrame(path, s);
    const c = [f.p[0] + f.right[0] * side, f.p[1] + f.right[1] * side];
    L.push([c[0] - f.right[0] * half, c[1] - f.right[1] * half]);
    R.push([c[0] + f.right[0] * half, c[1] + f.right[1] * half]);
    if (s >= s1) break;
  }
  return [...L, ...R.reverse()];
}
// An ellipse placed by centerline position, rotated to follow the hole
function ceBlob(path, s, side, rx, ry) {
  const f = ceFrame(path, s), c = ceAt(path, s, side);
  return ceEllipse(c[0], c[1], rx, ry, -Math.atan2(f.dir[1], f.dir[0]) * 180 / Math.PI + 90);
}

// ── Build a hole from its authored definition ──────────────────
function ceBuildHole(def) {
  const path = ceBuildPath(def.segments);
  const L = path.length, pin = path.pts[path.pts.length - 1];
  const rough = def.rough || CE.ROUGH_HALF, ring = def.jungleRing ?? CE.JUNGLE_RING;
  const tees = {};
  for (const [name, yds] of Object.entries(def.yards)) tees[name] = ceAt(path, Math.max(0, L - yds));
  const blob = b => ceBlob(path, b[0], b[1], b[2], b[3]);
  const green = ceBlob(path, L, def.greenSide || 0, ...(def.green || [15, 13]));
  const ff = def.falseFront;
  const greenRy = (def.green || [15, 13])[1];
  return {
    n: def.n, name: def.name, par: def.par, yards: def.yards, note: def.note || '', elevSpec: def.elev || null,
    path, pin, tees, length: L,
    roughPoly:  ceCorridor(path, -12, L + 30, rough),
    junglePoly: ceCorridor(path, -40, L + 30 + ring, rough + ring),
    teeBoxes:   Object.values(tees).map(t => ceEllipse(t[0], t[1], 7, 5)),
    green,
    falseFronts: ff ? [{ poly: ceBlob(path, L - greenRy + ff.depth / 2, 0, (def.green || [15])[0] * 0.85, ff.depth / 2 + 1), back: ff.back || 12 }] : [],
    fairways:  (def.fairways || []).map(([s0, s1, half = CE.FAIRWAY_HALF, side = 0]) => ceCorridor(path, s0, s1, half, side)),
    bunkers:   (def.bunkers || []).map(blob),
    water:     [
      ...(def.ponds || []).map(blob),
      ...(def.island ? [ceBlob(path, L, 0, def.island[0], def.island[1])] : []),
      ...(def.creeks || []).map(c => ceCreek(path, c.pts, c.half || 5)),
    ],
    ravines:   (def.ravines || []).map(([s0, s1, half = rough + 8]) => ceCorridor(path, s0, s1, half)),
    trees:     (def.trees || []).map(blob),
    ruins:     (def.ruins || []).map(blob),
    canopies:  (def.canopies || []).map(c => ({ poly: blob(c), bottom: c[4], top: c[5] })),
  };
}
// A winding stream through centerline points [[s, side], ...]
function ceCreek(path, pts, half) {
  const L = [], R = [];
  const world = pts.map(([s, side]) => ceAt(path, s, side));
  world.forEach((p, i) => {
    const a = world[Math.max(0, i - 1)], b = world[Math.min(world.length - 1, i + 1)];
    const len = ceDist(a, b) || 1, n = [(b[1] - a[1]) / len, -(b[0] - a[0]) / len];
    L.push([p[0] - n[0] * half, p[1] - n[1] * half]); R.push([p[0] + n[0] * half, p[1] + n[1] * half]);
  });
  return [...L, ...R.reverse()];
}

// ── Elevation ──────────────────────────────────────────────────
// Each hole's ground height (feet) comes from its authored `elev` spec:
//   climb      rise from the back tee to the green (uphill holes)
//   greenRise  a raised green (+) on a plateau, or a sunken one (−) in a bowl
//   teeRise    raised tee boxes looking down the hole
//   roll       amplitude of gentle undulations through fairway and rough
// Greens, tees, water, sand and ruins sit flat (undulations fade out near them).
// Built once per hole into a 3-yard grid and read with bilinear interpolation.
const CE_ELEV_STEP = 3;
function ceProjectS(path, p) { // arc length of the nearest centerline point (extends past the ends)
  let best = 0, bd = Infinity;
  for (let i = 1; i < path.pts.length; i++) {
    const a = path.pts[i - 1], b = path.pts[i], dx = b[0] - a[0], dy = b[1] - a[1], L = Math.hypot(dx, dy) || 1;
    let t = ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / (L * L);
    if (i > 1) t = Math.max(0, t);
    if (i < path.pts.length - 1) t = Math.min(1, t);
    const d = Math.hypot(p[0] - a[0] - dx * t, p[1] - a[1] - dy * t);
    if (d < bd) { bd = d; best = path.cum[i - 1] + t * L; }
  }
  return best;
}
function ceBBox(poly) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  poly.forEach(([x, y]) => { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); });
  return [x0, y0, x1, y1];
}
// Distance from p to a polygon (0 inside), capped at `cap` for speed
function ceDistToPoly(p, poly, box, cap) {
  const bx = Math.max(box[0] - p[0], 0, p[0] - box[2]), by = Math.max(box[1] - p[1], 0, p[1] - box[3]);
  if (Math.hypot(bx, by) >= cap) return cap;
  if (cePointInPoly(p, poly)) return 0;
  let best = cap;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[j], b = poly[i], dx = b[0] - a[0], dy = b[1] - a[1], L = dx * dx + dy * dy || 1;
    const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / L));
    best = Math.min(best, Math.hypot(p[0] - a[0] - dx * t, p[1] - a[1] - dy * t));
  }
  return best;
}
const ceSmooth = (e0, e1, x) => { const t = Math.max(0, Math.min(1, (x - e0) / (e1 - e0))); return t * t * (3 - 2 * t); };

function ceBuildElevation(h) {
  const sp = h.elevSpec, step = CE_ELEV_STEP, pad = 170;
  const [jx0, jy0, jx1, jy1] = ceBBox(h.junglePoly);
  const x0 = jx0 - pad, y0 = jy0 - pad, nx = Math.ceil((jx1 - jx0 + pad * 2) / step) + 1, ny = Math.ceil((jy1 - jy0 + pad * 2) / step) + 1;
  const data = new Float32Array(nx * ny);
  const withBox = list => list.map(poly => ({ poly, box: ceBBox(poly) }));
  const green = withBox([h.green])[0], tees = withBox(h.teeBoxes), sand = withBox(h.bunkers);
  const flat = withBox([h.green, ...h.teeBoxes, ...h.water, ...h.bunkers, ...h.ruins]);
  const climb = sp.climb || 0, gr = sp.greenRise || 0, tr = sp.teeRise || 0, amp = sp.roll || 0;
  // plateau/bowl shoulders: wide enough that a 1-yard rise takes 5 yards
  const gw = Math.max(12, Math.abs(gr) / 3 * 5), tw = Math.max(10, Math.abs(tr) / 3 * 5);
  const ph = [h.n * 1.7, h.n * 2.3 + 1, h.n * 0.9 + 2];
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
    const p = [x0 + i * step, y0 + j * step];
    let e = climb ? climb * Math.max(0, Math.min(1, ceProjectS(h.path, p) / h.length)) : 0;
    if (gr) e += gr * (1 - ceSmooth(0, gw, ceDistToPoly(p, green.poly, green.box, gw)));
    if (tr) { let m = 0; tees.forEach(t => { m = Math.max(m, 1 - ceSmooth(0, tw, ceDistToPoly(p, t.poly, t.box, tw))); }); e += tr * m; }
    // bunkers sit 2 ft down, inside a short grass lip
    sand.forEach(b => { const d = ceDistToPoly(p, b.poly, b.box, 2.5); if (d < 2.5) e -= 2 * (1 - ceSmooth(0, 2.5, d)); });
    if (amp) {
      let dmin = 14; flat.forEach(f => { dmin = Math.min(dmin, ceDistToPoly(p, f.poly, f.box, dmin)); });
      const n = 0.6 * Math.sin(p[0] / 21 + ph[0]) * Math.cos(p[1] / 29 + ph[1]) + 0.4 * Math.sin((p[0] * 0.6 + p[1] * 0.8) / 37 + ph[2]);
      e += amp * n * ceSmooth(0, 14, dmin);
    }
    data[j * nx + i] = e;
  }
  return { x0, y0, nx, ny, step, data };
}
// Ground height in feet at a point
function ceElevation(h, p) {
  if (!h.elevSpec) return 0;
  const g = h._elev || (h._elev = ceBuildElevation(h));
  const fx = Math.max(0, Math.min(g.nx - 1.001, (p[0] - g.x0) / g.step)), fy = Math.max(0, Math.min(g.ny - 1.001, (p[1] - g.y0) / g.step));
  const i = Math.floor(fx), j = Math.floor(fy), u = fx - i, v = fy - j, d = g.data, k = j * g.nx + i;
  return (d[k] * (1 - u) + d[k + 1] * u) * (1 - v) + (d[k + g.nx] * (1 - u) + d[k + g.nx + 1] * u) * v;
}
function ceElevMax(h) {
  ceElevation(h, [0, 0]);
  return h._elevMax ?? (h._elevMax = h._elev.data.reduce((m, v) => Math.max(m, v), -Infinity));
}
// Downhill pull: ground gradient as rise over run (dimensionless), [d/dx, d/dy]
function ceSlope(h, p) {
  const e = 1.5;
  return [(ceElevation(h, [p[0] + e, p[1]]) - ceElevation(h, [p[0] - e, p[1]])) / (2 * e * 3),
          (ceElevation(h, [p[0], p[1] + e]) - ceElevation(h, [p[0], p[1] - e])) / (2 * e * 3)];
}

// ── Surfaces ───────────────────────────────────────────────────
// Priority matters: an island green beats the water around it, a platform
// fairway beats the ravine beneath it.
function ceSurfaceAt(h, p) {
  const inAny = list => list.some(poly => cePointInPoly(p, poly));
  if (!cePointInPoly(p, h.junglePoly)) return 'ob';
  if (cePointInPoly(p, h.green)) return 'green';
  if (inAny(h.bunkers)) return 'sand';
  if (inAny(h.teeBoxes)) return 'tee';
  if (inAny(h.fairways)) return 'fairway';
  if (inAny(h.ruins)) return 'ruins';
  if (inAny(h.water)) return 'water';
  if (inAny(h.ravines)) return 'ravine';
  if (inAny(h.trees)) return 'jungle';
  if (cePointInPoly(p, h.roughPoly)) return 'rough';
  return 'jungle';
}
// Strokes-gained lie for a surface
const CE_LIE = { tee: 'tee', fairway: 'fairway', rough: 'rough', sand: 'sand', jungle: 'recovery', ruins: 'recovery', green: 'green' };
const ceIsHazard = s => s === 'water' || s === 'ravine';

// What (if anything) the ball hits at this point of its flight
function ceObstacleAt(h, p, zFt) {
  for (const c of h.canopies) if (zFt > c.bottom && zFt < c.top && cePointInPoly(p, c.poly)) return 'canopy';
  if (zFt < CE.JUNGLE_TOP_FT || zFt < CE.RUIN_TOP_FT) {
    const s = ceSurfaceAt(h, p);
    if (s === 'jungle' && zFt < CE.JUNGLE_TOP_FT) return 'trees';
    if (s === 'ruins' && zFt < CE.RUIN_TOP_FT) return 'ruins';
  }
  return null;
}

// ── Wind ───────────────────────────────────────────────────────
// { mph, toDeg } on the map → { x, y } mph in a shot's frame (x = along the aim, y = to its right)
function ceWindRel(wind, aimDeg) {
  const a = (wind.toDeg - aimDeg) * Math.PI / 180;
  return { x: wind.mph * Math.cos(a), y: wind.mph * Math.sin(a) };
}

// ── Shot resolution ────────────────────────────────────────────
// ball: [x, y]; aimDeg: heading, 0 = straight "up", + clockwise;
// shot: launch data { ballMph, launch, direction, spin, spinAxis }; lie: strokes-gained lie
// wind (optional): { mph, toDeg } — the heading the wind blows toward, on the same scale as aimDeg
function ceResolveShot(h, ball, aimDeg, shot, lie, wind) {
  const [spdMul, spinMul] = CE.LIE[lie] || [1, 1];
  const adj = { ...shot, ballMph: shot.ballMph * spdMul, spin: (shot.spin || 0) * spinMul };
  const a = aimDeg * Math.PI / 180, fwd = [Math.sin(a), Math.cos(a)], right = [Math.cos(a), -Math.sin(a)];
  const toWorld = (x, y) => [ball[0] + fwd[0] * x + right[0] * y, ball[1] + fwd[1] * x + right[1] * y];
  // The flight lands on the real ground; heights are kept two ways:
  //   z  = feet above the ground beneath the ball (what trees, ruins and canopies care about)
  //   za = feet relative to the hole's datum (for drawing in 3D)
  const e0 = ceElevation(h, ball);
  const env = h.elevSpec ? { ground: (x, y) => ceElevation(h, toWorld(x, y)) - e0, groundMax: ceElevMax(h) - e0 } : {};
  if (wind && wind.mph) env.wind = ceWindRel(wind, aimDeg);
  const flight = simulateFlight(adj, env);
  const toW = q => { const p = toWorld(q.x, q.y), za = e0 + q.z; return { p, z: za - ceElevation(h, p), za, t: q.t }; };
  const world = flight.path.map(toW);
  const events = [];

  // 1. Did it clip a canopy, the trees or ruins? (not right off the club face)
  let blocked = null;
  for (let i = 0; i < world.length; i++) {
    const w = world[i];
    if (ceDist(w.p, ball) < 10 || w.z <= 0) continue;
    const hit = ceObstacleAt(h, w.p, w.z);
    if (hit) { blocked = { ...w, hit, idx: i }; break; }
  }

  let rest, flightEnd, rollPath = [], hops = [];
  if (blocked) {
    rest = blocked.p; flightEnd = blocked;
    events.push({ canopy: 'Clipped the canopy', trees: 'Into the trees', ruins: 'Hit the ruins' }[blocked.hit]);
  } else {
    flightEnd = world[world.length - 1];
    rest = flightEnd.p;
    // 2. Bounces on the real ground, surface by surface (one can kick into sand or water),
    //    then the roll, which stops at sand, water, trees or out of bounds
    const surfAt = (x, y) => ceSurfaceAt(h, toWorld(x, y));
    const b = bfBounce(flight, surfAt(flight.path[flight.path.length - 1].x, flight.path[flight.path.length - 1].y), { ...env, surface: surfAt });
    hops = b.hops.map(toW);
    if (hops.length) rest = hops[hops.length - 1].p;
    const rollSurf = b.stopped ? null : ceSurfaceAt(h, rest);
    if (rollSurf && rollSurf !== 'sand') {
      const vel = [fwd[0] * b.rollVel[0] + right[0] * b.rollVel[1], fwd[1] * b.rollVel[0] + right[1] * b.rollVel[1]];
      rollPath = ceRollPath(h, rest, vel, rollSurf);
      if (rollPath.length) rest = rollPath[rollPath.length - 1];
    }
  }

  // 3. False fronts: a ball that stops on the front slope rolls back off the green
  for (const ff of h.falseFronts) {
    if (cePointInPoly(rest, ff.poly)) {
      const away = [rest[0] - h.pin[0], rest[1] - h.pin[1]], d = Math.hypot(...away) || 1;
      const back = [rest[0] + away[0] / d * ff.back, rest[1] + away[1] / d * ff.back];
      rollPath.push(back); rest = back;
      events.push('Rolled back off the false front');
    }
  }

  // 4. Penalties
  let surface = ceSurfaceAt(h, rest), penalty = 0, replay = false;
  if (surface === 'ob') {
    penalty = 1; replay = true; rest = ball; surface = null;
    events.push('Out of bounds — stroke and distance');
  } else if (ceIsHazard(surface)) {
    penalty = 1;
    events.push(surface === 'water' ? 'In the water — penalty drop' : 'Into the ravine — penalty drop');
    rest = ceDropPoint(h, [ball, ...world.map(w => w.p), ...hops.map(w => w.p), ...rollPath]);
    surface = ceSurfaceAt(h, rest);
  }

  const holed = !penalty && ceDist(rest, h.pin) < 0.25; // a hole-out from off the green
  // A blocked ball's flight ends where it hit (tracers, animation and side view stop there);
  // otherwise the bounces follow the flight (landIdx: where it first came down)
  const flown = blocked ? world.slice(0, blocked.idx + 1) : world.concat(hops);
  return {
    flight, world: flown, landIdx: blocked ? blocked.idx : world.length - 1, rollPath, rest, surface, penalty, replay, holed, events,
    carry: ceDist(ball, flightEnd.p), total: ceDist(ball, rest), apexFt: flight.apexFt,
  };
}

// ── Rolling on slopes ──────────────────────────────────────────
// The ball leaves its last bounce with a real velocity (backwards, if it spun
// back), then rolls under gravity and the surface's resistance — which grows
// with speed, as grass slows a fast ball more than a slow one — so it runs out
// downhill, checks up uphill, and curls with the side slope. It stops at sand,
// trees, hazards and out of bounds, and keeps rolling if a slope is too steep to hold it.
// vel: [x, y] yards/s
function ceRollPath(h, start, vel, surface) {
  const G = 10.73, dt = 0.04, YD_MS = 0.9144; // yards/s², yards/s → m/s
  const res = sf => BF_SURFACES[sf === 'tee' ? 'fairway' : sf] || BF_SURFACES.rough;
  let rs = res(surface), p = start.slice(), last = start;
  vel = vel.slice();
  const path = [];
  for (let step = 0; step < 450; step++) {
    const sl = h.elevSpec ? ceSlope(h, p) : [0, 0], slope = Math.hypot(sl[0], sl[1]);
    const speed = Math.hypot(vel[0], vel[1]), mu = rs.roll + (rs.drag || 0) * speed * YD_MS;
    if (speed < 0.12 && slope < rs.roll * 1.6) break;  // at rest, and the slope can't move it
    // gravity down the slope, friction against the motion
    let ax = -G * sl[0], ay = -G * sl[1];
    if (speed > 1e-6) { ax -= mu * G * vel[0] / speed; ay -= mu * G * vel[1] / speed; }
    const nv = [vel[0] + ax * dt, vel[1] + ay * dt];
    // friction alone can't reverse the ball: if it would, it has stopped
    if (speed > 1e-6 && nv[0] * vel[0] + nv[1] * vel[1] < 0 && slope < rs.roll * 1.6) break;
    vel = nv;
    p = [p[0] + vel[0] * dt, p[1] + vel[1] * dt];
    if (ceDist(p, last) >= 1 || path.length === 0) {
      path.push(p.slice()); last = p;
      const s = ceSurfaceAt(h, p);
      if (s === 'sand' || s === 'jungle' || s === 'ruins' || ceIsHazard(s) || s === 'ob') return path;
      rs = res(s);
    }
  }
  if (!path.length || ceDist(path[path.length - 1], p) > 0.05) path.push(p);
  return path.length === 1 && ceDist(path[0], start) < 0.05 ? [] : path;
}

// Drop where the ball last crossed into the hazard, nudged two yards back
function ceDropPoint(h, track) {
  for (let i = track.length - 1; i > 0; i--) {
    const s = ceSurfaceAt(h, track[i - 1]);
    if (!ceIsHazard(s) && s !== 'ob') {
      const a = track[i - 1], b = track[i], d = ceDist(a, b) || 1;
      const p = [a[0] - (b[0] - a[0]) / d * 2, a[1] - (b[1] - a[1]) / d * 2];
      const ps = ceSurfaceAt(h, p);
      return (ceIsHazard(ps) || ps === 'ob') ? a : p;
    }
  }
  return track[0];
}

// ── Auto-putting ───────────────────────────────────────────────
// Putts are drawn from the strokes-gained expected-putts curve for the
// player's level: E between 1 and 2 → one-putt chance 2 − E; above 2 →
// three-putt chance E − 2. Returns each putt's starting distance in feet.
function ceAutoPutt(distYds, cal, rng = Math.random) {
  const ft = Math.max(0.5, distYds * 3);
  if (ft <= 1.5) return [ft];
  const E = sgExpected('green', ft, cal), u = rng();
  if (E <= 2) return u < 2 - E ? [ft] : [ft, Math.min(ft * 0.5, 1 + rng() * 3)];
  return u < E - 2 ? [ft, Math.min(ft * 0.6, 4 + rng() * 6), 1 + rng() * 2] : [ft, Math.min(ft * 0.5, 1 + rng() * 3.5)];
}

// ── Simulated swings (no R10) ──────────────────────────────────
// Typical mid-handicap launch numbers per club; replaced by the player's
// own range averages once they have three or more measured shots.
const CE_DEFAULT_CLUBS = {
  'Driver': [135, 13, 2900], '3-Wood': [125, 12, 3800], '5-Wood': [118, 13, 4300], 'Hybrid': [112, 14, 4600],
  '2-Iron': [114, 12, 4200], '3-Iron': [111, 13, 4500], '4-Iron': [108, 14, 5000], '5-Iron': [104, 15, 5400],
  '6-Iron': [100, 16, 5900], '7-Iron': [95, 18, 6500], '8-Iron': [90, 20, 7200], '9-Iron': [84, 22, 7900],
  'PW': [78, 26, 8500], 'GW': [72, 28, 9000], 'SW': [64, 31, 9500], 'LW': [56, 34, 10000],
};
const CE_SHOT_TYPES = {
  normal: { name: 'Normal', speed: 1,    launch: 1,    spin: 1 },
  punch:  { name: 'Punch',  speed: 0.9,  launch: 0.5,  spin: 0.75 },
  high:   { name: 'High',   speed: 0.96, launch: 1.25, spin: 1.1 },
};
// rangeShots: saved R10 range shots (optional)
function ceClubProfile(club, rangeShots = []) {
  const mine = rangeShots.filter(s => s.club === club && s.ballMph && s.launch !== null && s.spin !== null);
  if (mine.length >= 3) {
    const avg = k => mine.reduce((a, s) => a + s[k], 0) / mine.length;
    return { ballMph: avg('ballMph'), launch: avg('launch'), spin: avg('spin'), source: 'yours' };
  }
  const d = CE_DEFAULT_CLUBS[club] || CE_DEFAULT_CLUBS['7-Iron'];
  return { ballMph: d[0], launch: d[1], spin: d[2], source: 'typical' };
}
function ceGauss(rng) { // standard normal via Box–Muller
  const u = Math.max(1e-9, rng()), v = rng();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}
// powerPct 10–100 shortens the swing. Direction scatter grows with power,
// distance scatter grows on partial swings.
function ceSimulatedSwing(profile, powerPct = 100, type = 'normal', rng = Math.random) {
  const p = Math.max(0.1, Math.min(1, powerPct / 100)), t = CE_SHOT_TYPES[type] || CE_SHOT_TYPES.normal;
  return {
    // partial swings are harder to judge: distance scatter grows as power drops
    ballMph:  profile.ballMph * p * t.speed * (1 + ceGauss(rng) * (0.025 + 0.12 * (1 - p))),
    launch:   profile.launch * t.launch + ceGauss(rng) * 1.2,
    direction: ceGauss(rng) * (1.2 + 1.6 * p + 2 * (1 - p)),
    spin:     profile.spin * (0.55 + 0.45 * p) * t.spin * (1 + ceGauss(rng) * 0.07),
    spinAxis: ceGauss(rng) * (3 + 5 * p),
  };
}
// Expected carry/total for a club with no dispersion (aim previews, club suggestions);
// windRel (optional): { x, y } mph relative to the shot, as from ceWindRel
function ceClubDistance(profile, powerPct = 100, type = 'normal', windRel) {
  const p = Math.max(0.1, Math.min(1, powerPct / 100)), t = CE_SHOT_TYPES[type] || CE_SHOT_TYPES.normal;
  return simulateShot({ ballMph: profile.ballMph * p * t.speed, launch: profile.launch * t.launch,
                        spin: profile.spin * (0.55 + 0.45 * p) * t.spin }, 'fairway', windRel ? { wind: windRel } : {});
}

// ── Shot planner ───────────────────────────────────────────────
// Suggests club, power, shot type and aim like a thinking player: tries the
// pin and points down the hole (a little left/center/right), matches club and
// power to each distance, previews normal/punch/high without dispersion, and
// scores where the ball ends up (distance left, lie, penalties, obstacles).
// In wind it plays the shot like a golfer would: a plays-like distance (more
// club into it, less downwind) and aim off so the wind brings the ball back.
// profiles: { club: { ballMph, launch, spin } }; clubs ordered longest first.
function ceSuggestShot(h, ball, lie, profiles, clubs, wind) {
  const windy = wind && wind.mph >= 1;
  const allowed = lie === 'tee' ? clubs : clubs.filter(c => c !== 'Driver');
  // Full-swing carry/total per shot type + club, computed once
  const fullCache = {};
  const full = (c, type) => (fullCache[type + c] ??= ceClubDistance(profiles[c], 100, type));
  const reach = full(allowed[0], 'normal').total;
  let s0 = 0, bd = 1e9;
  for (let s = -20; s <= h.length + 20; s += 3) { const d = ceDist(ceAt(h.path, s), ball); if (d < bd) { bd = d; s0 = s; } }
  const targets = [h.pin];
  // From the jungle, also consider chipping straight back out to the hole
  if (lie === 'recovery') for (const s of [s0 - 15, s0, s0 + 15]) targets.push(ceAt(h.path, s));
  for (let s = s0 + 20; s < Math.min(h.length, s0 + reach * 1.05); s += 15) {
    for (const side of [-12, 0, 12]) targets.push(ceAt(h.path, s, side));
  }
  const pinDist = ceDist(ball, h.pin);
  let best = null;
  for (const tgt of targets) {
    // plays-like distance: about a yard longer per yard uphill, shorter downhill
    const d = Math.max(5, ceDist(ball, tgt) + (ceElevation(h, tgt) - ceElevation(h, ball)) / 3);
    const aim = Math.atan2(tgt[0] - ball[0], tgt[1] - ball[1]) * 180 / Math.PI;
    for (const type of ['normal', 'punch', 'high']) {
      let clean = false;
      // Match either total distance (rolls up to the target) or carry (flies to it,
      // e.g. over water); the preview decides which works.
      for (const key of ['total', 'carry']) {
        // club, then power from a square-root guess refined once against the model
        const pick = dist => {
          const club = [...allowed].reverse().find(c => full(c, type)[key] >= dist * 0.97);
          if (!club) return null;
          let power = Math.min(100, Math.max(12, 100 * Math.sqrt(dist / full(club, type)[key])));
          if (power < 100) power = Math.min(100, Math.max(12, power * Math.sqrt(dist / Math.max(5, ceClubDistance(profiles[club], power, type)[key]))));
          return { club, power: Math.round(power) };
        };
        let pc = pick(d), aimAt = aim;
        if (!pc) continue;
        if (windy) {
          const wr = ceWindRel(wind, aim);
          const calm = ceClubDistance(profiles[pc.club], pc.power, type)[key], blown = ceClubDistance(profiles[pc.club], pc.power, type, wr)[key];
          pc = pick(d * calm / Math.max(5, blown)) || pc;                      // plays-like distance
          const w = ceClubDistance(profiles[pc.club], pc.power, type, wr);
          aimAt = aim - Math.atan2(key === 'total' ? w.totalOffline : w.offline, Math.max(5, w[key])) * 180 / Math.PI; // aim off
        }
        const { club, power } = pc;
        const p = profiles[club], t = CE_SHOT_TYPES[type], pw = power / 100;
        const r = ceResolveShot(h, ball, aimAt, { ballMph: p.ballMph * pw * t.speed, launch: p.launch * t.launch,
                                               spin: p.spin * (0.55 + 0.45 * pw) * t.spin, direction: 0, spinAxis: 0 }, lie, wind);
        const left = r.replay ? pinDist : ceDist(r.rest, h.pin);
        const lieCost = { green: -10, fairway: 0, tee: 0, rough: 8, sand: 15, jungle: 45, ruins: 45 }[r.surface] ?? 0;
        const score = left + lieCost + r.penalty * 150 + r.events.length * 60 + (type === 'normal' ? 0 : 3);
        if (!best || score < best.score) best = { score, target: tgt, club, power, type, aimDeg: aimAt };
        if (!r.events.length && !r.penalty) clean = true;
      }
      if (type === 'normal' && clean) break; // clean already: no need to punch or loft it
    }
  }
  return best;
}

if (typeof module !== 'undefined') module.exports = { CE, ceElevation, ceSlope, ceRollPath, ceBuildHole, ceSurfaceAt, ceResolveShot, ceAutoPutt, ceClubProfile, ceSimulatedSwing, ceClubDistance, ceDist, CE_LIE, CE_DEFAULT_CLUBS, ceSuggestShot };

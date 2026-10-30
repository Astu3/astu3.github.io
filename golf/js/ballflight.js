// Golf Improvement App — Ball flight model: launch data → trajectory, carry, curve and roll.
// Classic script: shares globals with the other files; load order is set in golf-improvement-app.html.
// Also runs under Node (no DOM use) so its coefficients can be fitted offline.

// ════════════════════════════════════════════════════════════
// BALL FLIGHT
// Point-mass golf ball with gravity, aerodynamic drag and Magnus lift,
// integrated in small time steps. Spin decays during flight. Lift and drag
// coefficients depend on the spin factor S = (spin × radius) / speed, and
// were fitted to published tour and amateur launch-monitor averages.
// Forces come from the ball's speed through the air, so wind (stronger with
// height, as over real ground) pushes it sideways, and a headwind adds lift
// and drag: balls into the wind climb, balloon and come up short.
// Coordinates: x = toward the target, y = right of the target line, z = up.
// Spin axis convention: positive tilts the spin so the ball curves right.
// ════════════════════════════════════════════════════════════
const BF_BALL = { mass: 0.04593, radius: 0.021335 }; // kg, m (USGA ball)
BF_BALL.area = Math.PI * BF_BALL.radius ** 2;

// Fitted to TrackMan tour averages (PGA driver, 3-wood, 5-iron, 7-iron, PW and
// LPGA driver): carry within about ±4%, apex within ±5%, descent within 4°.
const BF_COEF = { cd0: 0.228, cdS: 0.185, cdV: 0.083, clk: 0.616, clExp: 0.576, clMax: 0.312, spinTau: 33.8 };

const MPH_TO_MS = 0.44704, M_TO_YD = 1.0936133, M_TO_FT = 3.2808399;

// Air density from altitude (m) and temperature (°C); sea level 15 °C ≈ 1.225 kg/m³
function bfAirDensity(env = {}) {
  const alt = env.altitudeM || 0, tC = env.tempC ?? 15;
  return 1.225 * Math.exp(-alt / 8434) * (288.15 / (273.15 + tC));
}

// Wind speed at height z (m) as a share of its speed at 10 m: a log profile over short grass
const BF_WIND_Z0 = 0.03;
const bfWindAt = z => Math.log(Math.max(0.5, z) / BF_WIND_Z0) / Math.log(10 / BF_WIND_Z0);

// shot: { ballMph, launch (°), direction (°, + right), spin (rpm), spinAxis (°, + curves right) }
// env.wind (optional): { x, y } mph at 10 m — the way the air moves, x = toward the target, y = rightward
// env.ground (optional): (x, y yards) → ground height in feet relative to the launch point,
// so the ball lands on sloping ground (uphill shots land sooner, downhill later)
// Returns flight data in yards/feet, plus the sampled path for drawing and
// canopy checks: path = [{ x, y (yards), z (feet), t (s) }]
function simulateFlight(shot, env = {}, coef = BF_COEF) {
  const rho = bfAirDensity(env);
  const k = 0.5 * rho * BF_BALL.area / BF_BALL.mass;
  const v0 = (shot.ballMph || 0) * MPH_TO_MS;
  const la = (shot.launch || 0) * Math.PI / 180;
  const dir = (shot.direction || 0) * Math.PI / 180;
  let vx = v0 * Math.cos(la) * Math.cos(dir), vy = v0 * Math.cos(la) * Math.sin(dir), vz = v0 * Math.sin(la);
  let x = 0, y = 0, z = 0, t = 0;

  // Spin axis, fixed in space: pure backspin spins about the leftward axis;
  // tilting it adds side force. Yawed to match the start direction.
  const tilt = (shot.spinAxis || 0) * Math.PI / 180;
  let ax = 0, ay = -Math.cos(tilt);
  const az = Math.sin(tilt);
  [ax, ay] = [ax * Math.cos(dir) - ay * Math.sin(dir), ax * Math.sin(dir) + ay * Math.cos(dir)];
  const omega0 = (shot.spin || 0) * 2 * Math.PI / 60;

  const wx = ((env.wind && env.wind.x) || 0) * MPH_TO_MS, wy = ((env.wind && env.wind.y) || 0) * MPH_TO_MS, windy = wx || wy;
  const dt = 0.008, path = [{ x: 0, y: 0, z: 0, t: 0 }]; // 0.008 s: within 0.35 yds of a 0.004 s step at half the cost
  let apex = 0, steps = 0, spinLeft = 1;
  const spinDecay = Math.exp(-dt / coef.spinTau);
  while (t < 15) {
    // velocity through the air
    const wf = windy ? bfWindAt(z) : 0, rx = vx - wx * wf, ry = vy - wy * wf, rz = vz;
    const v = Math.hypot(rx, ry, rz);
    if (v < 0.01) break;
    const omega = omega0 * spinLeft; spinLeft *= spinDecay; // spin decays exponentially (same as exp(-t/τ), one multiply per step)
    const S = omega * BF_BALL.radius / v;
    // Dimpled balls lose drag at high speed (drag crisis): lower Cd above 50 m/s
    const cd = Math.max(0.12, coef.cd0 + coef.cdS * S - (coef.cdV || 0) * (v - 50) / 50);
    const cl = Math.min(coef.clMax, coef.clk * Math.pow(S, coef.clExp));
    // Magnus force points along (spin axis × velocity)
    let lx = ay * rz - az * ry, ly = az * rx - ax * rz, lz = ax * ry - ay * rx;
    const ln = Math.hypot(lx, ly, lz) || 1;
    lx /= ln; ly /= ln; lz /= ln;
    const accX = -k * cd * v * rx + k * cl * v * v * lx;
    const accY = -k * cd * v * ry + k * cl * v * v * ly;
    const accZ = -k * cd * v * rz + k * cl * v * v * lz - 9.81;
    vx += accX * dt; vy += accY * dt; vz += accZ * dt;
    const nz = z + vz * dt;
    // (env.groundMax, ft: the highest ground there is, so the lookup is skipped while the ball is above it)
    const gz = env.ground && nz * M_TO_FT < (env.groundMax ?? Infinity) + 1 ? env.ground((x + vx * dt) * M_TO_YD, (y + vy * dt) * M_TO_YD) / M_TO_FT : (env.ground ? -Infinity : 0);
    if (nz < gz && t > 0.05) {
      // interpolate the exact landing point within this step
      const f = Math.max(0, Math.min(1, z - nz > 1e-9 ? (z - gz) / (z - nz) : 1));
      x += vx * dt * f; y += vy * dt * f; t += dt * f; z = gz;
      break;
    }
    x += vx * dt; y += vy * dt; z = nz; t += dt;
    apex = Math.max(apex, z);
    if (++steps % 6 === 0) path.push({ x: x * M_TO_YD, y: y * M_TO_YD, z: z * M_TO_FT, t });
  }
  path.push({ x: x * M_TO_YD, y: y * M_TO_YD, z: z * M_TO_FT, t });

  const vh = Math.hypot(vx, vy);
  return {
    carry: x * M_TO_YD,          // yards along the target line
    offline: y * M_TO_YD,        // yards right (+) / left (−) at landing
    apexFt: apex * M_TO_FT,
    flightTime: t,
    descentAngle: Math.atan2(-vz, vh) * 180 / Math.PI,
    landing: { vx, vy, vz, vh, spinRpm: (shot.spin || 0) * Math.exp(-t / coef.spinTau), spinAxis: shot.spinAxis || 0 },
    path,
  };
}

// ── Bounce and roll after landing ──────────────────────────────
// Each landing is an impact with the turf (after Penner, "The run of a golf
// ball", 2002). The ball digs a small crater, so it meets a surface tilted
// back toward it — more so the faster and steeper it lands and the softer
// the ground. Restitution sets how much it rebounds; friction acts on the
// contact point, where backspin opposes the ball's travel. If friction can
// bring the contact point to rest the ball leaves rolling, else it skids.
// Hops fly until the rebound is tiny; then the ball rolls, skidding until
// its spin matches its speed, so enough backspin checks it up or draws it back.
//   e: restitution scale (1 = Penner's green)   mu: turf friction on impact
//   pit: crater depth scale    bite: share of the backspin that grips the turf
//   roll, drag: rolling resistance — deceleration = g × (roll + drag × speed in m/s);
//   grass slows a fast ball far more than a slow one
// Fitted to typical amateur roll-outs: driver ~22 yds on the fairway, 7-iron ~8,
// wedges about 1; on greens a 7-iron releases ~5 and wedges stop; chips, bump-and-
// runs, thin shots and wind-assisted drives run out by believable amounts.
const BF_SURFACES = {
  green:   { e: 0.50, mu: 0.60, pit: 1.5, bite: 0.85, roll: 0.065, drag: 0.10 },
  fringe:  { e: 0.55, mu: 0.50, pit: 1.5, bite: 0.80, roll: 0.10,  drag: 0.10 },
  fairway: { e: 0.60, mu: 0.40, pit: 1.0, bite: 0.85, roll: 0.18,  drag: 0.10 },
  tee:     { e: 0.60, mu: 0.40, pit: 1.0, bite: 0.85, roll: 0.18,  drag: 0.10 },
  rough:   { e: 0.40, mu: 0.60, pit: 2.5, bite: 0.50, roll: 0.30,  drag: 0.15 },
  sand:    { e: 0.08, mu: 0.90, pit: 4.0, bite: 0.50, roll: 1.20,  drag: 0.20 },
};
const BF_G = 9.81;
// Distance (m) a ball rolling at v m/s covers on flat ground before it stops
function bfRollDist(v, s) {
  const c = s.drag || 0;
  return c > 1e-6 ? (v - s.roll / c * Math.log(1 + c * v / s.roll)) / (BF_G * c) : v * v / (2 * s.roll * BF_G);
}
// Restitution falls as the impact gets harder (Penner's fit for a green; m/s into the turf)
const bfRestitution = vn => vn < 20 ? Math.max(0.12, 0.510 - 0.0375 * vn + 0.000903 * vn * vn) : 0.12;

// One impact. v: [vx, vy, vz] m/s; n: unit ground normal; spin: backspin, rad/s (negative = topspin).
// Returns the velocity and spin leaving the ground, and the direction of travel along it.
function bfImpact(v, n, spin, s) {
  const r = BF_BALL.radius, vin = -(v[0] * n[0] + v[1] * n[1] + v[2] * n[2]);   // speed into the ground
  const tv = [v[0] + vin * n[0], v[1] + vin * n[1], v[2] + vin * n[2]], vt = Math.hypot(tv[0], tv[1], tv[2]);
  const dir = vt > 1e-6 ? [tv[0] / vt, tv[1] / vt, tv[2] / vt] : [1, 0, 0];
  const speed = Math.hypot(v[0], v[1], v[2]), angle = Math.atan2(vin, vt);
  // the crater: the surface the ball actually meets is tilted back by `pit`
  const pit = Math.min(0.6, s.pit * (15.4 * Math.PI / 180) * (speed / 18.6) * (angle / (44 * Math.PI / 180)));
  const vn = speed * Math.sin(angle + pit), vtc = speed * Math.cos(angle + pit);
  const e = bfRestitution(vn) * s.e;
  const slip = vtc + r * spin, have = s.mu * (1 + e) * vn;
  let vt2, spin2;
  if (have >= 2 / 7 * Math.abs(slip)) { vt2 = (5 * vtc - 2 * r * spin) / 7; spin2 = -vt2 / r; }  // leaves rolling
  else { const J = Math.sign(slip) * have; vt2 = vtc - J; spin2 = spin - 2.5 * J / r; }           // skids through
  const vn2 = e * vn;
  // back from the crater's frame to the ground's
  const along = vt2 * Math.cos(pit) - vn2 * Math.sin(pit), up = vt2 * Math.sin(pit) + vn2 * Math.cos(pit);
  return { v: [dir[0] * along + n[0] * up, dir[1] * along + n[1] * up, dir[2] * along + n[2] * up], spin: spin2, dir, up };
}

// Bounces, then the roll. env.ground as in simulateFlight; env.surface (optional):
// (x, y yards) → surface name at each impact (else `surface` throughout). An impact
// on anything without bounce settings (water, trees, out of bounds) ends it there:
// `stopped` names what it landed on.
// Returns hops (points like flight.path, after the landing), the rolling velocity
// [x, y] in yards/s once the ball settles (pointing back toward the golfer when
// it spins back), and — for flat ground — dx, dy, dist from landing to rest.
function bfBounce(flight, surface = 'fairway', env = {}) {
  const L = flight.landing, p0 = flight.path[flight.path.length - 1];
  let s = BF_SURFACES[surface];
  if (!s) return { hops: [], rollVel: [0, 0], dx: 0, dy: 0, dist: 0, stopped: surface }; // water, out of bounds, etc.
  const gAt = env.ground ? (x, y) => env.ground(x * M_TO_YD, y * M_TO_YD) / M_TO_FT : () => 0; // metres
  const normal = (x, y) => {
    if (!env.ground) return [0, 0, 1];
    const e = 0.75, gx = (gAt(x + e, y) - gAt(x - e, y)) / (2 * e), gy = (gAt(x, y + e) - gAt(x, y - e)) / (2 * e), m = Math.hypot(gx, gy, 1);
    return [-gx / m, -gy / m, 1 / m];
  };
  let x = p0.x / M_TO_YD, y = p0.y / M_TO_YD, t = p0.t, v = [L.vx, L.vy, L.vz], dir = [1, 0, 0];
  let spin = (L.spinRpm || 0) * 2 * Math.PI / 60 * Math.cos((L.spinAxis || 0) * Math.PI / 180) * s.bite;
  const hops = [];
  let stopped = null;
  for (let bounce = 0; bounce < 10; bounce++) {
    if (bounce && env.surface) {
      const here = env.surface(x * M_TO_YD, y * M_TO_YD);
      if (!BF_SURFACES[here]) { stopped = here; v = [0, 0, 0]; spin = 0; break; }
      s = BF_SURFACES[here]; surface = here;
    }
    const out = bfImpact(v, normal(x, y), spin, s);
    v = out.v; spin = out.spin; dir = out.dir;
    if (out.up < 0.7) break;                  // a hop under ~2.5 cm: it's rolling now
    // a short, slow ballistic hop (drag and lift don't matter here)
    let z = gAt(x, y), n = 0;
    do {
      x += v[0] * 0.01; y += v[1] * 0.01; z += v[2] * 0.01; v[2] -= BF_G * 0.01; t += 0.01;
      if (++n % 3 === 0) hops.push({ x: x * M_TO_YD, y: y * M_TO_YD, z: z * M_TO_FT, t });
    } while (z > gAt(x, y) && n < 600);
    hops.push({ x: x * M_TO_YD, y: y * M_TO_YD, z: gAt(x, y) * M_TO_FT, t });
  }
  // settle: skidding ends when the spin matches the speed, at v = (5·v − 2·r·ω) / 7
  const vt = Math.hypot(v[0], v[1]), ux = vt > 1e-6 ? v[0] / vt : dir[0], uy = vt > 1e-6 ? v[1] / vt : dir[1];
  const roll = (5 * vt - 2 * BF_BALL.radius * spin) / 7;              // m/s; negative = spinning back
  const flat = Math.sign(roll) * bfRollDist(Math.abs(roll), s) * M_TO_YD; // yards on flat ground
  const end = hops.length ? hops[hops.length - 1] : p0, dx = end.x - p0.x + ux * flat, dy = end.y - p0.y + uy * flat;
  return { hops, rollVel: [ux * roll * M_TO_YD, uy * roll * M_TO_YD], t, dx, dy, dist: Math.hypot(dx, dy) * (dx < 0 ? -1 : 1), surface, stopped };
}
// Landing to rest on flat ground along the line of flight: { dx, dy, dist } yards
function bfRoll(flight, surface = 'fairway') { return bfBounce(flight, surface); }

// Convenience: flight + bounce and roll on one surface (used by range mode)
function simulateShot(shot, surface = 'fairway', env = {}) {
  const f = simulateFlight(shot, env);
  const r = bfBounce(f, surface);
  return { ...f, total: f.carry + r.dx, totalOffline: f.offline + r.dy, roll: r.dx };
}

if (typeof module !== 'undefined') module.exports = { simulateFlight, simulateShot, bfRoll, bfBounce, BF_SURFACES, BF_COEF };

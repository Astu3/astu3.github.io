// Golf Improvement App — Ball flight model: launch data → trajectory, carry, curve and roll.
// Classic script: shares globals with the other files; load order is set in golf-improvement-app.html.
// Also runs under Node (no DOM use) so its coefficients can be fitted offline.

// ════════════════════════════════════════════════════════════
// BALL FLIGHT
// Point-mass golf ball with gravity, aerodynamic drag and Magnus lift,
// integrated in small time steps. Spin decays during flight. Lift and drag
// coefficients depend on the spin factor S = (spin × radius) / speed, and
// were fitted to published tour and amateur launch-monitor averages.
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

// shot: { ballMph, launch (°), direction (°, + right), spin (rpm), spinAxis (°, + curves right) }
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

  const dt = 0.008, path = [{ x: 0, y: 0, z: 0, t: 0 }]; // 0.008 s: within 0.35 yds of a 0.004 s step at half the cost
  let apex = 0, steps = 0, spinLeft = 1;
  const spinDecay = Math.exp(-dt / coef.spinTau);
  while (t < 15) {
    const v = Math.hypot(vx, vy, vz);
    if (v < 0.01) break;
    const omega = omega0 * spinLeft; spinLeft *= spinDecay; // spin decays exponentially (same as exp(-t/τ), one multiply per step)
    const S = omega * BF_BALL.radius / v;
    // Dimpled balls lose drag at high speed (drag crisis): lower Cd above 50 m/s
    const cd = Math.max(0.12, coef.cd0 + coef.cdS * S - (coef.cdV || 0) * (v - 50) / 50);
    const cl = Math.min(coef.clMax, coef.clk * Math.pow(S, coef.clExp));
    // Magnus force points along (spin axis × velocity)
    let lx = ay * vz - az * vy, ly = az * vx - ax * vz, lz = ax * vy - ay * vx;
    const ln = Math.hypot(lx, ly, lz) || 1;
    lx /= ln; ly /= ln; lz /= ln;
    const accX = -k * cd * v * vx + k * cl * v * v * lx;
    const accY = -k * cd * v * vy + k * cl * v * v * ly;
    const accZ = -k * cd * v * vz + k * cl * v * v * lz - 9.81;
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
    landing: { vx, vy, vz, vh, spinRpm: (shot.spin || 0) * Math.exp(-t / coef.spinTau) },
    path,
  };
}

// ── Bounce and roll after landing ──────────────────────────────
// Empirical: roll grows with landing speed, shrinks with steeper descent
// and more spin. Factors per surface (yards per m/s of landing speed).
const BF_SURFACES = {
  fairway: { roll: 3.1 },
  rough:   { roll: 1.1 },
  green:   { roll: 2.6 },
  fringe:  { roll: 1.8 },
  sand:    { roll: 0.15 },
  tee:     { roll: 3.1 },
};
// Returns { dx, dy } yards of roll in the ball's direction of travel
function bfRoll(flight, surface = 'fairway') {
  const s = BF_SURFACES[surface];
  if (!s) return { dx: 0, dy: 0, dist: 0 }; // water, out of bounds, etc. — no roll
  const L = flight.landing;
  const steep = Math.max(0, 1 - flight.descentAngle / 90) ** 1.5;
  const spinFactor = Math.max(0.03, 1 - L.spinRpm / 9000);
  const dist = Math.max(0, s.roll * L.vh * steep * spinFactor);
  const ux = L.vh ? L.vx / L.vh : 1, uy = L.vh ? L.vy / L.vh : 0;
  return { dx: ux * dist, dy: uy * dist, dist };
}

// Convenience: flight + roll on one surface (used by range mode)
function simulateShot(shot, surface = 'fairway', env = {}) {
  const f = simulateFlight(shot, env);
  const r = bfRoll(f, surface);
  return { ...f, total: f.carry + r.dx, totalOffline: f.offline + r.dy, roll: r.dist };
}

if (typeof module !== 'undefined') module.exports = { simulateFlight, simulateShot, bfRoll, BF_COEF };

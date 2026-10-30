// Golf Improvement App — Apex 3D view (behind the ball), all 18 holes.
// Classic script: shares globals with the other files; load order is set in golf-improvement-app.html.

// ════════════════════════════════════════════════════════════
// APEX 3D
// A golfer's-eye view built with Three.js (loaded on first use from a CDN).
// The ground reuses the 2D terrain painting as one big texture, so both views
// always match; trees become real 3D trees (instanced trunks and crowns that
// cast shadows) at exactly the places the 2D map draws them. Heights match the
// rules: rainforest trees top out around the 85 ft the ball has to clear,
// ruins stand 30 ft, canopies hang between their authored heights, and the
// ravines are real gorges cut into the ground (platform fairways stand on stone).
// World units are yards: x = right, y = up, and the hole runs toward −z.
// ════════════════════════════════════════════════════════════
const AP3 = {
  THREE_URL: 'golf/vendor/three/three.min.js', // r128, bundled so the 3D view works offline
  RAVINE_DEPTH: 9,         // yards down to a gorge floor
  RUIN_TOP: CE.RUIN_TOP_FT / 3, // yards
  BALL_R: 0.08,            // a little larger than life (0.05 yd); scaled up with distance so it stays visible
  TREE_TOP: CE.JUNGLE_TOP_FT / 3, // yards
};
const ap3 = { on: false, loading: false, hole: null, renderer: null, scene: null, camera: null,
              objs: {}, previewKey: null, tracerCount: -1, camPos: null, camLook: null, snap: true };

function ap3Available() { return !!apex; }
const ap3V = (p, y = 0) => new THREE.Vector3(p[0], y, -p[1]); // course yards → world (y absolute, yards)
const ap3G = (p, y = 0) => ap3V(p, y + ceElevation(ap3.h, p) / 3);  // y above the ground there

function ap3LoadThree() {
  return new Promise((resolve, reject) => {
    if (window.THREE) return resolve();
    const s = document.createElement('script');
    s.src = AP3.THREE_URL;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error('Couldn\'t load the 3D engine.'));
    document.head.appendChild(s);
  });
}

async function ap3Toggle() {
  if (ap3.on) { ap3.on = false; renderApex(); return; }
  if (!ap3Available() || ap3.loading) return;
  ap3.loading = true; renderApex();
  try {
    await ap3LoadThree();
    await ap3LoadPost(); // bloom + colour grading (desktop); optional
    await new Promise(r => setTimeout(r, 50)); // let "Loading 3D…" show before the first build compiles its shaders
    ap3.on = true; ap3.snap = true;
  }
  catch (e) { showToast('⚠️ ' + e.message); }
  ap3.loading = false; renderApex();
}

// Called whenever the Apex screen is rebuilt
function ap3Attach() {
  const host = document.getElementById('apex-3d-host');
  if (!host || !ap3.on) return;
  if (!ap3Available()) { ap3.on = false; return; }
  if (!ap3.renderer) ap3Init();
  const h = apexHole();
  if (ap3.hole !== h.n) ap3BuildHole(h);
  host.appendChild(ap3.renderer.domElement);
  ap3Resize();
  ap3Frame(performance.now(), 0);
}

function ap3Init() {
  const T = THREE;
  const r = new T.WebGLRenderer({ antialias: true });
  r.setPixelRatio(Math.min(AP3_LOOK.lite ? 1.5 : 2, window.devicePixelRatio || 1));
  r.shadowMap.enabled = true; r.shadowMap.type = T.PCFSoftShadowMap;
  r.outputEncoding = T.sRGBEncoding;
  // filmic tone mapping: richer greens, highlights that roll off instead of clipping
  r.toneMapping = T.ACESFilmicToneMapping; r.toneMappingExposure = 1.12;
  r.domElement.className = 'apex-3d-canvas';
  r.domElement.addEventListener('click', ap3Click);
  ap3.renderer = r;
  ap3.camera = new T.PerspectiveCamera(52, 1, 0.2, 4000); // far enough for the distant ridges
  ap3.camera.layers.enable(AP3_FAR_LAYER);
  r.shadowMap.autoUpdate = false; // updated once per frame, just before the main render (not for mirror renders)
  ap3SetupPost(); // HDR → bloom → grade (apex-3d-post.js), when available
}

function ap3Resize() {
  const el = ap3.renderer.domElement, host = el.parentElement;
  const w = host.clientWidth, h = host.clientHeight;
  if (!w || !h) return;
  ap3.renderer.setSize(w, h, false);
  ap3.camera.aspect = w / h; ap3.camera.updateProjectionMatrix();
  ap3PostResize(w, h);
}

// ── Scene for one hole ─────────────────────────────────────────
// Free the previous hole's GPU memory (geometries and textures). Materials are left
// undisposed on purpose: disposing them throws away their compiled shaders, and
// recompiling those costs seconds on every hole change (GC reclaims the objects).
function ap3DisposeScene(scene) {
  scene.traverse(obj => {
    if (obj.geometry && !(obj.geometry.userData || {}).keep) obj.geometry.dispose(); // shared assets are kept
    [].concat(obj.material || []).forEach(m => Object.values(m).forEach(v => v && v.isTexture && !(v.userData || {}).keep && v.dispose()));
  });
  if (scene.background && scene.background.isTexture) scene.background.dispose();
}

function ap3BuildHole(h) {
  if (ap3.scene) ap3DisposeScene(ap3.scene);
  ((ap3.objs && ap3.objs.mirrors) || []).forEach(m => m.rt.dispose()); // GPU memory held outside the scene
  const T = THREE, scene = new T.Scene(), o = {};
  ap3.scene = scene; ap3.objs = o; ap3.hole = h.n; ap3.h = h; ap3.previewKey = null; ap3.tracerCount = -1; ap3.snap = true;

  // Sky: an atmosphere dome with the sun in it, fading to a humid haze that matches the fog
  const haze = ap3.post ? 0xa7bcc2 : 0xcfdcd8; // (HDR: a touch deeper, or the distance washes out)
  scene.fog = new T.Fog(haze, 160, 820);
  ap3AddSkyDome(scene, o, haze);

  // Light: soft sky fill plus a warm sun from the upper left of the map
  o.hemi = new T.HemisphereLight(0xdcecff, 0x34421f, 0.8);
  scene.add(o.hemi);
  const sun = new T.DirectionalLight(0xffe9c4, 1.25);
  sun.castShadow = true;
  sun.shadow.mapSize.set(AP3_LOOK.lite ? 1024 : 2048, AP3_LOOK.lite ? 1024 : 2048);
  Object.assign(sun.shadow.camera, { left: -140, right: 140, top: 140, bottom: -140, near: 1, far: 900 });
  sun.shadow.bias = -0.0006;
  scene.add(sun, sun.target);
  o.sun = sun;
  ap3AddSky(scene, h, o);

  // Ground: the 2D painting (without its painted trees) as one texture
  const ground = arPaintTerrain(h, { groundOnly: true, canvas: document.createElement('canvas'), pad: 140, ppy: 6 });
  const tex = new T.CanvasTexture(ground.canvas);
  tex.encoding = T.sRGBEncoding;
  tex.anisotropy = ap3.renderer.capabilities.getMaxAnisotropy();
  const gw = ground.x1 - ground.x0, gh = ground.y1 - ground.y0;
  // A heightfield on the elevation grid's 3-yard spacing (gorges are cut out of the texture)
  const pg = new T.PlaneGeometry(gw, gh, Math.ceil(gw / CE_ELEV_STEP), Math.ceil(gh / CE_ELEV_STEP));
  const gcx = (ground.x0 + ground.x1) / 2, gcy = (ground.y0 + ground.y1) / 2, gp = pg.attributes.position;
  for (let i = 0; i < gp.count; i++) gp.setZ(i, ceElevation(h, [gcx + gp.getX(i), gcy + gp.getY(i)]) / 3);
  pg.computeVertexNormals();
  const mowD = [h.pin[0] - h.tees.temple[0], h.pin[1] - h.tees.temple[1]], mowL = Math.hypot(...mowD) || 1;
  if (ap3.groundMask) ap3.groundMask.dispose(); // (held in a shader uniform, so freed here rather than with the scene)
  ap3.groundMask = ap3SurfaceMask(h, ground);
  const plane = new T.Mesh(pg, ap3GroundDetail(new T.MeshLambertMaterial({ map: tex, alphaTest: 0.5 }),
    { mask: ap3.groundMask, box: [ground.x0, ground.y0, ground.x1, ground.y1], mow: [mowD[0] / mowL, mowD[1] / mowL] }));
  plane.rotation.x = -Math.PI / 2;
  plane.position.set(gcx, 0, -gcy);
  plane.receiveShadow = true;
  scene.add(plane);
  o.ground = plane;
  // forest floor running to the horizon, around (not under) the painted ground so the gorges stay open
  const cx = plane.position.x, cy = -plane.position.z, F = 3000, outer = new T.Shape([
    new T.Vector2(cx - F, cy - F), new T.Vector2(cx + F, cy - F), new T.Vector2(cx + F, cy + F), new T.Vector2(cx - F, cy + F)]);
  outer.holes.push(new T.Path([new T.Vector2(ground.x0 + 1, ground.y0 + 1), new T.Vector2(ground.x0 + 1, ground.y1 - 1),
                               new T.Vector2(ground.x1 - 1, ground.y1 - 1), new T.Vector2(ground.x1 - 1, ground.y0 + 1)]));
  const floor = new T.Mesh(new T.ShapeGeometry(outer), new T.MeshLambertMaterial({ color: 0x1e331c }));
  floor.rotation.x = -Math.PI / 2; floor.position.y = -1.5; floor.receiveShadow = true; // under any dip at the ground's edge
  scene.add(floor);

  const mats = ap3Materials();
  ap3AddRavines(scene, h, mats);
  ap3AddWater(scene, h, o);
  const temples = ap3Temples(h);
  h.ruins.forEach(r => ap3AddRuin(scene, h, r, mats));
  temples.forEach(t => ap3Pyramid(scene, t, mats));
  h.canopies.forEach((c, i) => ap3AddCanopy(scene, c, arRng(h.n * 131 + i)));

  // Trees: the painter's crown positions, plus a deep forest out to the edges
  const rnd = arRng(h.n * 4243 + 7);
  const trees = ground.crowns.map(c => ({ p: c.p, r: c.r * 1.15 }));
  const deepWant = Math.min(5000, Math.round((gw * gh - arArea(h.junglePoly)) / 70));
  for (let i = 0, made = 0; made < deepWant && i < deepWant * 4; i++) {
    const p = [ground.x0 + rnd() * gw, ground.y0 + rnd() * gh];
    if (cePointInPoly(p, h.junglePoly)) continue;
    trees.push({ p, r: 4 + rnd() * 3.5 }); made++;
  }
  // clear the jungle around the great temples
  ap3AddTrees(scene, h, trees.filter(t => !temples.some(tp => ap3DistToPoly(t.p, [tp.from, tp.c]) < tp.hu + 6)), rnd);

  // Pin: cup, white flagstick and a red flag that sways in the breeze
  const cup = new T.Mesh(new T.CircleGeometry(0.18, 20), new T.MeshBasicMaterial({ color: 0x111111 }));
  cup.rotation.x = -Math.PI / 2; cup.position.copy(ap3G(h.pin, 0.02)); scene.add(cup);
  const stick = new T.Mesh(new T.CylinderGeometry(0.035, 0.035, 2.6, 8), new T.MeshLambertMaterial({ color: 0xf6f6f6 }));
  stick.position.copy(ap3G(h.pin, 1.3)); stick.castShadow = true; scene.add(stick);
  const flagGeo = ap3FlagGeometry(); // waves like cloth (apex-3d-fx.js)
  const flag = new T.Mesh(flagGeo, new T.MeshLambertMaterial({ map: ap3FlagTex(h.n), side: T.DoubleSide })); // the hole number on it
  flag.position.copy(ap3G(h.pin, 2.25)); flag.castShadow = true; scene.add(flag);
  o.flag = flag;

  // Tee markers for the round's tees
  const tee = h.tees[apex.tee], f = ceFrame(h.path, h.length - h.yards[apex.tee]);
  [-1, 1].forEach(sd => {
    const m = new T.Mesh(new T.SphereGeometry(0.13, 14, 10), new T.MeshLambertMaterial({ color: new T.Color(APEX_TEES[apex.tee].color) }));
    m.position.copy(ap3G([tee[0] + f.right[0] * 3 * sd, tee[1] + f.right[1] * 3 * sd], 0.13)); m.castShadow = true; scene.add(m);
  });

  // Ball
  const ball = new T.Mesh(new T.SphereGeometry(AP3.BALL_R, 20, 14), new T.MeshStandardMaterial({ color: 0xffffff, roughness: 0.35, emissive: 0x222222 }));
  ball.castShadow = true; scene.add(ball); o.ball = ball;
  // A soft glow so the ball stays easy to follow against sky and trees
  const glowCv = document.createElement('canvas'); glowCv.width = glowCv.height = 64;
  const gc = glowCv.getContext('2d'), gg = gc.createRadialGradient(32, 32, 0, 32, 32, 32);
  gg.addColorStop(0, 'rgba(255,250,225,0.95)'); gg.addColorStop(0.25, 'rgba(255,236,170,0.45)'); gg.addColorStop(1, 'rgba(255,230,160,0)');
  gc.fillStyle = gg; gc.fillRect(0, 0, 64, 64);
  const glow = new T.Sprite(new T.SpriteMaterial({ map: new T.CanvasTexture(glowCv), transparent: true, depthWrite: false, blending: T.AdditiveBlending, toneMapped: false }));
  scene.add(glow); o.glow = glow;

  ap3AddBirds(scene, h, o);
  ap3AddBallShadow(scene, o);

  // Live tracer (grows during the shot) and earlier tracers on this hole
  o.live = null; o.previous = []; // tracer tubes, rebuilt as needed
  // Aim preview: predicted arc and a landing ring
  o.previewArc = ap3Line(scene, 0xffffff, 600, true);
  const ring = new T.Mesh(new T.RingGeometry(1.6, 2.2, 40), new T.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.85, depthWrite: false, toneMapped: false }));
  ring.rotation.x = -Math.PI / 2; scene.add(ring); o.ring = ring;
}

// Lumpy, smooth-shaded crowns: an indexed sphere (so normals blend across faces)
// with its surface pushed in and out
function ap3CrownGeo(wSeg = 12, hSeg = 9) {
  const crownGeo = new THREE.SphereGeometry(1, wSeg, hSeg), pos = crownGeo.attributes.position, lump = arRng(991);
  const bumps = new Map();
  for (let i = 0; i < pos.count; i++) {
    const key = [pos.getX(i), pos.getY(i), pos.getZ(i)].map(v => v.toFixed(3)).join();
    if (!bumps.has(key)) bumps.set(key, 0.82 + lump() * 0.36); // shared vertices move together (no cracks)
    const k = bumps.get(key);
    pos.setXYZ(i, pos.getX(i) * k, pos.getY(i) * k, pos.getZ(i) * k);
  }
  crownGeo.computeVertexNormals();
  // Self-shading baked into vertex colors: darker underneath and in the hollows,
  // so crowns read as masses of leaves rather than smooth balls
  const col = [];
  for (let i = 0; i < pos.count; i++) {
    const y = pos.getY(i), r = Math.hypot(pos.getX(i), y, pos.getZ(i));
    const v = (0.5 + 0.5 * ceSmooth(-1, 0.9, y)) * (0.8 + 0.2 * Math.min(1, (r - 0.8) / 0.4));
    col.push(v, v, v);
  }
  crownGeo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  const uv = crownGeo.attributes.uv; // repeat the leaf texture so leaves stay small
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * 4, uv.getY(i) * 2);
  return crownGeo;
}

// Distance from a point to a polygon's outline
function ap3DistToPoly(p, poly) {
  let best = Infinity;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[j], b = poly[i], dx = b[0] - a[0], dy = b[1] - a[1], L = dx * dx + dy * dy || 1;
    const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / L));
    best = Math.min(best, Math.hypot(p[0] - a[0] - dx * t, p[1] - a[1] - dy * t));
  }
  return best;
}

// Trees near the corridor get full detail (four foliage layers, trunks, shadows);
// trees deep in the jungle, only ever seen from a distance through haze, get two
// simpler lobes and no shadows. That keeps the long holes smooth to draw.
// Leafy crowns: the leaf texture, tinted per tree, shaded by the crown's vertex colors
function ap3Foliage() { return ap3WindMaterial(new THREE.MeshLambertMaterial({ map: ap3LeafTex(), vertexColors: true }), 'foliage'); }

function ap3AddTrees(scene, h, trees, rnd) {
  const T = THREE, near = [], far = [], palms = [], giants = [];
  trees.forEach(t => {
    const inRough = cePointInPoly(t.p, h.roughPoly), edge = inRough ? 0 : ap3DistToPoly(t.p, h.roughPoly);
    // palms: many of the lone trees in the rough, a few along the jungle edge
    if ((inRough && rnd() < 0.55) || (!inRough && edge < 10 && rnd() < 0.07)) palms.push(t.p);
    else if (inRough || edge < 24) near.push(t);
    else if (rnd() < 0.02) giants.push(t); // emergent giants towering over the far canopy
    else far.push(t);
  });
  ap3AddPalms(scene, palms, rnd);
  const greens = ['#4a8f45', '#5aa04a', '#3a7c3e', '#68ad52', '#418043', '#529247'].map(c => new T.Color(c));
  const m = new T.Matrix4(), q = new T.Quaternion(), up = new T.Vector3(0, 1, 0);

  const farCrowns = new T.InstancedMesh(ap3CrownGeo(7, 5), ap3Foliage(), Math.max(1, far.length * 2));
  let f = 0;
  far.forEach(t => {
    const top = AP3.TREE_TOP * (0.85 + rnd() * 0.25), r = Math.max(2.6, t.r) * 1.15, yaw = q.setFromAxisAngle(up, rnd() * 6.28).clone();
    m.compose(ap3G(t.p, top - r * 0.75), yaw, new T.Vector3(r, r * 0.75, r));
    farCrowns.setMatrixAt(f, m); farCrowns.setColorAt(f++, greens[(rnd() * greens.length) | 0]);
    m.compose(ap3G(t.p, top * 0.45), yaw, new T.Vector3(r * 0.95, top * 0.45, r * 0.95)); // tall lobe filling down to the floor
    farCrowns.setMatrixAt(f, m); farCrowns.setColorAt(f++, greens[(rnd() * greens.length) | 0].clone().multiplyScalar(0.82));
  });
  farCrowns.count = f;
  if (farCrowns.instanceColor) farCrowns.instanceColor.needsUpdate = true;
  farCrowns.layers.set(AP3_FAR_LAYER);
  scene.add(farCrowns);

  // Giants: a tall bare trunk and a broad, flat crown well above the canopy, like a kapok
  if (giants.length) {
    const gt = new T.InstancedMesh(new T.CylinderGeometry(0.5, 1.1, 1, 7).translate(0, 0.5, 0), new T.MeshLambertMaterial({ map: ap3BarkTex(), color: 0xc8bba8 }), giants.length);
    const gc = new T.InstancedMesh(ap3CrownGeo(), ap3Foliage(), giants.length * 3);
    let gk = 0;
    giants.forEach((t, i) => {
      const H = AP3.TREE_TOP * (1.45 + rnd() * 0.3), R = 9 + rnd() * 5, yaw = q.setFromAxisAngle(up, rnd() * 6.28).clone();
      m.compose(ap3G(t.p, 0), yaw, new T.Vector3(1.4, H, 1.4)); gt.setMatrixAt(i, m);
      m.compose(ap3G(t.p, H), yaw, new T.Vector3(R, R * 0.42, R)); gc.setMatrixAt(gk, m); gc.setColorAt(gk++, greens[(rnd() * greens.length) | 0]);
      for (const sd of [-1, 1]) {
        m.compose(ap3G([t.p[0] + sd * R * 0.55, t.p[1] + (rnd() - 0.5) * R * 0.6], H - 2.5), yaw, new T.Vector3(R * 0.6, R * 0.34, R * 0.6));
        gc.setMatrixAt(gk, m); gc.setColorAt(gk++, greens[(rnd() * greens.length) | 0].clone().multiplyScalar(0.9));
      }
    });
    if (gc.instanceColor) gc.instanceColor.needsUpdate = true;
    gt.layers.set(AP3_FAR_LAYER); gc.layers.set(AP3_FAR_LAYER);
    scene.add(gt, gc);
    ap3AddCardShell(scene, gc, { shadows: false }); // leafy silhouettes over the far canopy
  }

  trees = near;
  const n = trees.length;
  const trunkGeo = new T.CylinderGeometry(0.35, 0.55, 1, 6); trunkGeo.translate(0, 0.5, 0);
  const crownGeo = ap3CrownGeo();
  const trunks = new T.InstancedMesh(trunkGeo, new T.MeshLambertMaterial({ map: ap3BarkTex(), color: 0x8f7a64 }), n); // barked trunks
  const crowns = new T.InstancedMesh(crownGeo, ap3Foliage(), n * 4);
  crowns.castShadow = true;
  let k = 0;
  trees.forEach((t, i) => {
    const top = AP3.TREE_TOP * (0.85 + rnd() * 0.25), r = Math.max(2.2, t.r);
    // trunk up to the crown
    m.compose(ap3G(t.p, 0), q.setFromAxisAngle(up, rnd() * 6.28), new T.Vector3(0.6 + r * 0.08, top - r * 0.6, 0.6 + r * 0.08));
    trunks.setMatrixAt(i, m);
    // main crown, plus a smaller lower lobe so the canopy looks layered
    const yaw = q.setFromAxisAngle(up, rnd() * 6.28).clone();
    m.compose(ap3G(t.p, top - r * 0.7), yaw, new T.Vector3(r, r * 0.72, r));
    crowns.setMatrixAt(k, m); crowns.setColorAt(k++, greens[(rnd() * greens.length) | 0]);
    const off = [t.p[0] + (rnd() - 0.5) * r, t.p[1] + (rnd() - 0.5) * r];
    m.compose(ap3G(off, top - r * 1.35), yaw, new T.Vector3(r * 0.7, r * 0.5, r * 0.7));
    crowns.setMatrixAt(k, m); crowns.setColorAt(k++, greens[(rnd() * greens.length) | 0]);
    // mid-storey: foliage between the understory and the crown, so no bare trunks show
    const mp = [t.p[0] + (rnd() - 0.5) * r, t.p[1] + (rnd() - 0.5) * r], mr = r * (0.8 + rnd() * 0.3);
    m.compose(ap3G(mp, top * (0.38 + rnd() * 0.18)), yaw, new T.Vector3(mr, mr * 0.8, mr));
    crowns.setMatrixAt(k, m); crowns.setColorAt(k++, greens[(rnd() * greens.length) | 0].clone().multiplyScalar(0.88));
    // understory: low, dense foliage so the jungle edge reads as a wall of green
    const u = [t.p[0] + (rnd() - 0.5) * r * 0.8, t.p[1] + (rnd() - 0.5) * r * 0.8], ur = r * (0.75 + rnd() * 0.35);
    m.compose(ap3G(u, ur * 0.55), yaw, new T.Vector3(ur, ur * 0.75, ur));
    crowns.setMatrixAt(k, m); crowns.setColorAt(k++, greens[(rnd() * greens.length) | 0].clone().multiplyScalar(0.8));
  });
  trunks.instanceMatrix.needsUpdate = true; crowns.instanceMatrix.needsUpdate = true;
  if (crowns.instanceColor) crowns.instanceColor.needsUpdate = true;
  scene.add(trunks, crowns);
  ap3AddCardShell(scene, crowns); // leaf-card shells: leafy, game-style crowns (apex-3d-nature.js)
}

// ── Terrain features ───────────────────────────────────────────
// Small procedural textures: cut stone blocks for the ruins, broken rock for the gorges
function ap3Materials() {
  const T = THREE;
  const make = (paint, tileYd) => {
    const cv = document.createElement('canvas'); cv.width = cv.height = 256;
    paint(cv.getContext('2d'), arRng(tileYd * 977));
    const tex = new T.CanvasTexture(cv);
    tex.wrapS = tex.wrapT = T.RepeatWrapping; tex.encoding = T.sRGBEncoding;
    tex.anisotropy = Math.min(8, ap3.renderer.capabilities.getMaxAnisotropy());
    tex.userData = { tile: tileYd }; // (r128 textures have no userData of their own)
    return tex;
  };
  const stone = make((c, rnd) => {
    c.fillStyle = '#5d554a'; c.fillRect(0, 0, 256, 256); // mortar
    for (let row = 0; row < 8; row++) {
      let x = row % 2 ? -24 : 0;
      while (x < 256) {
        const w = 36 + rnd() * 40, l = 128 + rnd() * 40 | 0;
        c.fillStyle = `rgb(${l + 22},${l + 15},${l - 4})`; c.fillRect(x + 1.5, row * 32 + 1.5, w - 3, 29);
        c.fillStyle = 'rgba(255,248,225,0.18)'; c.fillRect(x + 1.5, row * 32 + 1.5, w - 3, 3); // lit upper edge
        x += w;
      }
    }
    for (let i = 0; i < 900; i++) { // weathering and moss
      c.fillStyle = rnd() < 0.55 ? `rgba(60,90,40,${0.15 + rnd() * 0.3})` : `rgba(40,30,20,${0.08 + rnd() * 0.15})`;
      const r = 1 + rnd() * 4; c.fillRect(rnd() * 256, rnd() * 256, r, r);
    }
  }, 4);
  const rock = make((c, rnd) => {
    c.fillStyle = '#3d3026'; c.fillRect(0, 0, 256, 256);
    for (let i = 0; i < 260; i++) {
      const l = 40 + rnd() * 50 | 0, x = rnd() * 256, y = rnd() * 256, r = 6 + rnd() * 22;
      c.fillStyle = `rgb(${l + 18},${l + 8},${l})`;
      c.beginPath(); c.ellipse(x, y, r, r * (0.4 + rnd() * 0.5), rnd() * 3, 0, 7); c.fill();
    }
    for (let i = 0; i < 1500; i++) { c.fillStyle = rnd() < 0.5 ? 'rgba(0,0,0,0.2)' : 'rgba(160,140,110,0.2)'; c.fillRect(rnd() * 256, rnd() * 256, 2, 2); }
  }, 8);
  // Every textured material matches the ground's settings (Lambert, alphaTest, front side)
  // so they all share one compiled shader: each new shader costs seconds to compile on Windows
  const tm = (map, color = 0xffffff) => new T.MeshLambertMaterial({ map, color, alphaTest: 0.5 });
  return { stone: tm(stone), stone2: tm(stone, 0xc9d4b4) /* mossier tiers */, stair: tm(stone, 0xfff6e4), rock: tm(rock), rockFloor: tm(rock, 0x9a8a78) };
}

// A box whose texture keeps a constant scale, whatever its size
function ap3Box(w, hgt, d, tile) {
  const g = new THREE.BoxGeometry(w, hgt, d), uv = g.attributes.uv;
  const dims = [[d, hgt], [d, hgt], [w, d], [w, d], [w, hgt], [w, hgt]];
  for (let f = 0; f < 6; f++) for (let k = 0; k < 4; k++) {
    const i = f * 4 + k; uv.setXY(i, uv.getX(i) * dims[f][0] / tile, uv.getY(i) * dims[f][1] / tile);
  }
  return g;
}
// A flat shape on the ground (course polygon → world), facing up; UVs in yards / tile
function ap3Flat(poly, y, mat, tile = 0) {
  const T = THREE, g = new T.ShapeGeometry(new T.Shape(poly.map(p => new T.Vector2(p[0], p[1]))));
  if (tile) { const uv = g.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) / tile, uv.getY(i) / tile); }
  const m = new T.Mesh(g, mat);
  m.rotation.x = -Math.PI / 2; m.position.y = y;
  return m;
}
// Vertical walls hanging from the edges of a polygon, from the ground down to `bottomY` (yards)
function ap3Walls(poly, bottomY, mat, keepEdge = () => true) {
  const T = THREE, pos = [], uv = [], tile = mat.map ? mat.map.userData.tile : 8;
  let run = 0;
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i], b = poly[(i + 1) % poly.length], len = ceDist(a, b);
    if (len > 0.01 && keepEdge([(a[0] + b[0]) / 2, (a[1] + b[1]) / 2])) {
      const ya = ceElevation(ap3.h, a) / 3, yb = ceElevation(ap3.h, b) / 3;
      const A = [a[0], ya, -a[1]], B = [b[0], yb, -b[1]], u0 = run / tile, u1 = (run + len) / tile, v = (ya - bottomY) / tile;
      const A2 = [A[0], bottomY, A[2]], B2 = [B[0], bottomY, B[2]];
      // both windings, so the wall shows from either side without a double-sided shader
      pos.push(...A, ...A2, ...B, ...B, ...A2, ...B2, ...A, ...B, ...A2, ...B, ...B2, ...A2);
      uv.push(u0, v, u0, 0, u1, v, u1, v, u0, 0, u1, 0, u0, v, u1, v, u0, 0, u1, v, u1, 0, u0, 0);
    }
    run += len;
  }
  if (!pos.length) return null;
  const g = new T.BufferGeometry();
  g.setAttribute('position', new T.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new T.Float32BufferAttribute(uv, 2));
  g.computeVertexNormals();
  const m = new T.Mesh(g, mat); m.receiveShadow = true;
  return m;
}

// Ravines: rock walls down to a stony floor (a river on River of Stones). Anything
// painted over a gorge (platform fairways, ledge tees and greens) stands on stone walls.
function ap3AddRavines(scene, h, mats) {
  ap3.ravineFloors = [];
  if (!h.ravines.length) return;
  const D = AP3.RAVINE_DEPTH, inRavine = p => h.ravines.some(r => cePointInPoly(p, r));
  // each gorge floor sits D yards below the lowest ground along its rim
  ap3.ravineFloors = h.ravines.map(r => ({ poly: r, y: Math.min(...r.map(p => ceElevation(h, p))) / 3 - D }));
  ap3.ravineFloors.forEach(({ poly: r, y }) => {
    const w = ap3Walls(r, y, mats.rock); if (w) scene.add(w);
    const floor = ap3Flat(r, y, mats.rockFloor, 8); floor.receiveShadow = true;
    scene.add(floor);
    if (h.n === 11) { // the river of stones
      ap3AddReflectiveWater(scene, [{ polys: [r], y: y + 0.5 }], ap3.objs, 0x123e52);
    }
  });
  [...h.fairways, ...h.teeBoxes, h.green, ...h.bunkers].forEach(poly => {
    if (!poly.some(inRavine)) return;
    const w = ap3Walls(poly, Math.min(...ap3.ravineFloors.map(f => f.y)), mats.stone, inRavine); if (w) { w.castShadow = true; scene.add(w); }
  });
}

// Water: a tinted, slightly bright surface over the painted water (plain Lambert, like the
// forest floor, so it needs no shader of its own)
// Water: a real mirror of the trees, temples and sky (apex-3d-fx.js), one per water level
function ap3AddWater(scene, h, o) {
  const levels = new Map();
  h.water.forEach(w => { const y = Math.round((ceElevation(h, arCentroid(w)) / 3 + 0.04) * 5) / 5;
    if (!levels.has(y)) levels.set(y, []); levels.get(y).push(w); });
  ap3AddReflectiveWater(scene, [...levels].map(([y, polys]) => ({ polys, y })), o);
}

// Ruins: stepped stone pyramids, 30 ft tall (the height a ball has to clear),
// with a stair running up the face toward the fairway
function ap3AddRuin(scene, h, poly, mats) {
  const [bx0, by0, bx1, by1] = arBox(poly), c = [(bx0 + bx1) / 2, (by0 + by1) / 2];
  // nearest point on the centerline gives the hole's direction here (ruins are authored along it)
  let best = 0, bd = 1e9;
  for (let s = 0; s <= h.length; s += 4) { const d = ceDist(ceAt(h.path, s), c); if (d < bd) { bd = d; best = s; } }
  const f = ceFrame(h.path, best), off = (c[0] - f.p[0]) * f.right[0] + (c[1] - f.p[1]) * f.right[1];
  // the authored half-sizes: across the hole and along it
  let hu = 0, hv = 0;
  poly.forEach(p => { const dx = p[0] - c[0], dy = p[1] - c[1];
    hu = Math.max(hu, Math.abs(dx * f.right[0] + dy * f.right[1])); hv = Math.max(hv, Math.abs(dx * f.dir[0] + dy * f.dir[1])); });
  ap3Pyramid(scene, { c, dir: f.dir, hu: hu * 0.82, hv: hv * 0.82, height: AP3.RUIN_TOP, tiers: 5,
    stair: Math.abs(off) < 4 ? { axis: 'v', sign: -1 } : { axis: 'u', sign: -Math.sign(off) } }, mats);
}

// The great temples behind the 9th (Temple Steps) and 18th (Apex) greens: scenery only
function ap3Temples(h) {
  if (h.n !== 9 && h.n !== 18) return [];
  const big = h.n === 18, f = ceFrame(h.path, h.length), c = ceAt(h.path, h.length + (big ? 105 : 90));
  // towering over the 85 ft jungle, with the trees cleared in a sightline from the green
  return [{ c, from: ceAt(h.path, h.length + 32), dir: f.dir, hu: big ? 36 : 28, hv: big ? 36 : 28, height: big ? 48 : 36,
            tiers: big ? 9 : 7, stair: { axis: 'v', sign: -1 }, shrine: true }];
}

function ap3Pyramid(scene, t, mats) {
  const T = THREE, g = new T.Group(), th = t.height / t.tiers;
  g.position.copy(ap3G(t.c, 0));
  g.rotation.y = Math.atan2(-t.dir[0], t.dir[1]); // local x = across the hole (right), local −z = toward the green
  const add = (geo, mat, x, y, z) => { const m = new T.Mesh(geo, mat); m.position.set(x, y, z); m.castShadow = m.receiveShadow = true; g.add(m); return m; };
  // a footing below the base, so the pyramid never floats on sloping ground
  add(ap3Box(t.hu * 2, 3, t.hv * 2, 4), mats.stone2, 0, -1.5, 0);
  for (let i = 0; i < t.tiers; i++) {
    const k = 1 - i / t.tiers * 0.82;
    add(ap3Box(t.hu * 2 * k, th, t.hv * 2 * k, 4), i % 2 ? mats.stone : mats.stone2, 0, th * (i + 0.5), 0);
  }
  // Stair: solid steps rising from the base to the top tier on one face
  const kTop = 1 - (t.tiers - 1) / t.tiers * 0.82, n = t.tiers * 2;
  const along = t.stair.axis === 'u' ? t.hu : t.hv, across = (t.stair.axis === 'u' ? t.hv : t.hu) * 0.3;
  const run = along * (1 - kTop);
  for (let j = 0; j < n; j++) {
    const outer = along - j * run / n, hgt = (j + 1) * t.height / n + 0.03, mid = t.stair.sign * outer / 2;
    // local x = +u (right); local z = −v (toward the tee)
    if (t.stair.axis === 'u') add(ap3Box(outer, hgt, across * 2, 4), mats.stair, mid, hgt / 2, 0);
    else add(ap3Box(across * 2, hgt, outer, 4), mats.stair, 0, hgt / 2, -mid);
  }
  ap3Overgrow(g, t, arRng(Math.round(t.c[0] * 31 + t.c[1] * 17))); // the jungle reclaiming the stone
  if (t.shrine) { // a small temple on the summit, with a dark doorway facing the course
    const w = t.hu * 2 * kTop * 0.7, d = t.hv * 2 * kTop * 0.7, sh = t.height * 0.22;
    add(ap3Box(w, sh, d, 4), mats.stone, 0, t.height + sh / 2, 0);
    add(ap3Box(w * 1.1, sh * 0.18, d * 1.1, 4), mats.stone2, 0, t.height + sh * 1.09, 0);
    const door = new T.Mesh(new T.PlaneGeometry(w * 0.28, sh * 0.6), new T.MeshBasicMaterial({ color: 0x14100c }));
    door.position.set(0, t.height + sh * 0.3, d / 2 + 0.02); g.add(door);
  }
  scene.add(g);
}

// Canopies: a hanging mass of leaves between the authored heights, with vines below.
// The underside sits at the canopy's lowest blocking height, so what you see is what blocks.
function ap3AddCanopy(scene, c, rnd) {
  const T = THREE, lo = c.bottom / 3, hi = c.top / 3, [bx0, by0, bx1, by1] = arBox(c.poly);
  const area = arArea(c.poly), thick = hi - lo;
  const want = Math.min(900, Math.round(area * Math.max(2, thick) / 55));
  const clumps = [];
  for (let i = 0; i < want * 4 && clumps.length < want; i++) {
    const p = [bx0 + rnd() * (bx1 - bx0), by0 + rnd() * (by1 - by0)];
    if (!cePointInPoly(p, c.poly)) continue;
    const r = Math.min(2.4 + rnd() * 2.4, Math.max(1.2, thick * 0.5));
    const ry = r * 0.65, y = lo + ry + rnd() * Math.max(0, thick - ry * 2);
    clumps.push({ p, r, ry, y });
  }
  const crowns = new T.InstancedMesh(ap3CrownGeo(), ap3Foliage(), clumps.length);
  crowns.castShadow = true;
  const greens = ['#4a8f45', '#5aa04a', '#3a7c3e', '#68ad52', '#418043'].map(x => new T.Color(x));
  const m = new T.Matrix4(), q = new T.Quaternion(), up = new T.Vector3(0, 1, 0);
  clumps.forEach((k, i) => {
    m.compose(ap3G(k.p, k.y), q.setFromAxisAngle(up, rnd() * 6.28), new T.Vector3(k.r, k.ry, k.r));
    crowns.setMatrixAt(i, m); crowns.setColorAt(i, greens[(rnd() * greens.length) | 0]);
  });
  scene.add(crowns);
  ap3AddCardShell(scene, crowns, { grow: 1.1 });
  // vines hanging from the underside (kept short so they don't look like they block lower)
  if (lo < 4) return;
  const vines = clumps.filter(() => rnd() < 0.35);
  const vm = new T.InstancedMesh(new T.CylinderGeometry(0.06, 0.04, 1, 4).translate(0, -0.5, 0), new T.MeshLambertMaterial({ color: 0x3d6b2c }), vines.length);
  vines.forEach((k, i) => {
    const len = 1.5 + rnd() * Math.min(5, lo * 0.25);
    m.compose(ap3G([k.p[0] + (rnd() - 0.5) * k.r, k.p[1] + (rnd() - 0.5) * k.r], lo + 0.4), q.identity(), new T.Vector3(1, len, 1));
    vm.setMatrixAt(i, m);
  });
  scene.add(vm);
}

// A glowing tube along a tracer (WebGL lines are only one pixel wide)
function ap3Tube(points, radius, color, opacity) {
  const T = THREE;
  const pts = points.filter((p, i) => i === 0 || p.distanceToSquared(points[i - 1]) > 0.01);
  if (pts.length < 2) return null;
  const step = Math.max(1, Math.floor(pts.length / 90)); // keep the tube light to rebuild
  const use = pts.filter((p, i) => i % step === 0 || i === pts.length - 1);
  if (use.length < 2) return null;
  const geo = new T.TubeGeometry(new T.CatmullRomCurve3(use), Math.min(240, use.length * 3), radius, 6, false);
  // in HDR (post) mode: the colour in linear light, a little over 1 so it just catches the bloom and stays gold
  const c = ap3.post ? new T.Color(color).convertSRGBToLinear().multiplyScalar(1.25) : new T.Color(color);
  const mesh = new T.Mesh(geo, new T.MeshBasicMaterial({ color: c, transparent: true, opacity, depthWrite: false, toneMapped: false })); // (overlays skip tone mapping so they stay vivid)
  ap3.scene.add(mesh);
  return mesh;
}
function ap3Dispose(mesh) { ap3.scene.remove(mesh); mesh.geometry.dispose(); } // material kept: see ap3DisposeScene

// A polyline whose points are rewritten as needed
function ap3Line(scene, color, maxPts, dashed = false) {
  const T = THREE, geo = new T.BufferGeometry();
  geo.setAttribute('position', new T.BufferAttribute(new Float32Array(maxPts * 3), 3));
  geo.setDrawRange(0, 0);
  const mat = dashed ? new T.LineDashedMaterial({ color, dashSize: 1.2, gapSize: 1.6, transparent: true, opacity: 0.85, toneMapped: false })
                     : new T.LineBasicMaterial({ color, transparent: true, opacity: 0.95 });
  const line = new T.Line(geo, mat);
  line.frustumCulled = false;
  scene.add(line);
  return line;
}
function ap3SetLine(line, pts) {
  const a = line.geometry.attributes.position, n = Math.min(pts.length, a.count);
  for (let i = 0; i < n; i++) a.setXYZ(i, pts[i].x, pts[i].y, pts[i].z);
  a.needsUpdate = true; line.geometry.setDrawRange(0, n);
  if (line.material.isLineDashedMaterial) line.computeLineDistances();
}

// ── Per frame ──────────────────────────────────────────────────
function ap3Frame(t, dt) {
  if (!ap3.on || !ap3.renderer || !ap3.scene || ap3.hole !== apexHole().n) return;
  const T = THREE, o = ap3.objs, h = apexHole();

  // Aim preview (only rebuilt when the shot setup changes)
  const showPreview = !apexAnim && !apex.holeResult;
  o.previewArc.visible = o.ring.visible = showPreview;
  if (showPreview) {
    const pv = apexPreview();
    if (apexPreviewCache.key !== ap3.previewKey) {
      ap3.previewKey = apexPreviewCache.key;
      ap3SetLine(o.previewArc, [...pv.world.map(w => ap3G(w.p, w.z / 3)), ...pv.rollPath.map(p => ap3G(p, 0.1))]);
      const bad = pv.events.length || pv.penalty;
      o.previewArc.material.color.set(bad ? 0xff9c86 : 0xffffff);
      o.ring.material.color.set(bad ? 0xff9c86 : 0xffffff);
      o.ring.position.copy(ap3G(pv.rest, 0.05));
    }
    const s = 1 + 0.1 * Math.sin(t / 260); o.ring.scale.set(s, s, s);
  }

  // Earlier tracers on this hole
  const done = apexAnim ? apex.tracers.length - 1 : apex.tracers.length;
  if (done !== ap3.tracerCount) {
    ap3.tracerCount = done;
    o.previous.forEach(m => ap3Dispose(m)); o.previous = [];
    apex.tracers.slice(0, done).forEach(tr => {
      const pts = [...tr.pts.map((p, i) => ap3G(p, tr.zs ? tr.zs[i] / 3 + 0.1 : 0.15)), ...tr.roll.map(p => ap3G(p, 0.12))];
      const m = ap3Tube(pts, 0.09, 0xffffff, 0.45);
      if (m) o.previous.push(m);
    });
  }

  // Ball and live tracer
  let ballPos, ballZ = 0, shotDir = null;
  if (apexAnim) {
    const pr = arShotProgress(t), r = apexAnim.res;
    ballPos = pr.pos; ballZ = pr.z / 3;
    const flown = r.world.slice(0, pr.flightIdx + 1).map(w => ap3G(w.p, w.z / 3));
    flown.push(ap3G(pr.pos, ballZ));
    if (o.live) ap3Dispose(o.live);
    o.live = ap3Tube(pr.rollIdx ? [...r.world.map(w => ap3G(w.p, w.z / 3)), ...r.rollPath.slice(0, pr.rollIdx).map(p => ap3G(p, 0.12))] : flown, 0.14, 0xffd98a, 0.95);
    const a = apexAnim.from, b = r.rest, d = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
    shotDir = [(b[0] - a[0]) / d, (b[1] - a[1]) / d];
  } else {
    ballPos = apex.ball;
    if (o.live) { ap3Dispose(o.live); o.live = null; }
  }
  // On the ground in a hazard: down to the gorge floor, or out of sight under the water
  const lie = ballZ < 0.01 ? ceSurfaceAt(h, ballPos) : null;
  if (lie === 'ravine') { const fl = (ap3.ravineFloors || []).find(f => cePointInPoly(ballPos, f.poly)); ballZ = fl ? fl.y - ceElevation(h, ballPos) / 3 : -AP3.RAVINE_DEPTH; }
  o.ball.visible = lie !== 'water';
  o.ball.position.copy(ap3G(ballPos, ballZ + AP3.BALL_R));
  ap3PlaceBallShadow(o, lie === 'ravine' ? ap3G(ballPos, ballZ) : ap3G(ballPos, 0), lie === 'ravine' ? 0 : ballZ, lie !== 'water');
  const camDist = ap3.camPos ? ap3.camPos.distanceTo(o.ball.position) : 10;
  o.ball.scale.setScalar(Math.max(1, camDist / 14));
  o.glow.position.copy(o.ball.position);
  o.glow.scale.setScalar(Math.max(0.6, camDist / 22));
  o.glow.visible = !!apexAnim || camDist > 25;

  // Camera: behind the ball down the aim line; chases the ball during a shot
  const aim = apex.aimDeg * Math.PI / 180, dir = [Math.sin(aim), Math.cos(aim)];
  let camPos, camLook, mode = 'behind';
  if (apexAnim) {
    const el = Math.max(0, t - apexAnim.start), flyMs = apexFlightMs(apexAnim.res);
    mode = apexAnim.isReplay ? 'side' : apexAnim.greenCam && el > flyMs * 0.45 ? 'green' : 'chase';
  }
  const ballNow = ap3G(ballPos, ballZ);
  if (mode === 'side') {
    // Replay: a broadcast camera side-on to the shot, so the whole arc shows
    const r = apexAnim.res, a = apexAnim.from, fe = r.world[r.world.length - 1].p;
    if (!apexAnim.sideCam) apexAnim.sideCam = ap3SideCam(h, a, fe, shotDir, r);
    camPos = apexAnim.sideCam.clone();
    camLook = ballNow.clone().lerp(ap3G([(a[0] + fe[0]) / 2, (a[1] + fe[1]) / 2], r.flight.apexFt / 6), 0.35);
  } else if (mode === 'green') {
    // TV green camera: behind and beside the hole, looking back up the fairway at the ball coming in
    const a = apexAnim.from, d = ceDist(a, h.pin) || 1, u = [(h.pin[0] - a[0]) / d, (h.pin[1] - a[1]) / d], perp = [u[1], -u[0]];
    camPos = ap3G([h.pin[0] + u[0] * 26 + perp[0] * 9, h.pin[1] + u[1] * 26 + perp[1] * 9], 6);
    camLook = ballNow.clone();
  } else if (apexAnim) {
    const fd = shotDir, start = apexAnim.from, el = Math.max(0, t - apexAnim.start);
    const behindStart = ap3G([start[0] - fd[0] * 10, start[1] - fd[1] * 10], 3.4);
    const chase = ap3G([ballPos[0] - fd[0] * 22, ballPos[1] - fd[1] * 22], Math.max(5, ballZ * 0.75 + 4));
    const k = Math.min(1, el / 900); // stay at the tee for a moment, then give chase
    camPos = behindStart.lerp(chase, k * k);
    camLook = ap3G([ballPos[0] + fd[0] * 25, ballPos[1] + fd[1] * 25], ballZ * 0.6);
  } else {
    const pv = apex.holeResult ? null : apexPreview();
    const target = pv ? pv.rest : h.pin;
    // a little higher for longer shots, so a distant target (an island green) still reads
    const lift = Math.min(5, ceDist(ballPos, target) * 0.022);
    // step in toward the ball while the usual spot is in (or within a crown's
    // reach of) the jungle or ruins
    const wooded = (d, side) => ['jungle', 'ruins'].includes(ceSurfaceAt(h, [ballPos[0] - dir[0] * d + dir[1] * side, ballPos[1] - dir[1] * d - dir[0] * side]));
    let back = 10 + lift;
    while (back > 2.5 && (wooded(back, 0) || wooded(back + 4, 0) || wooded(back, 4) || wooded(back, -4))) back -= 1;
    const cp = [ballPos[0] - dir[0] * back, ballPos[1] - dir[1] * back];
    const lp = [ballPos[0] + (target[0] - ballPos[0]) * 0.6, ballPos[1] + (target[1] - ballPos[1]) * 0.6];
    camPos = ap3G(cp, 3.4 + lift);
    camLook = ap3G(lp, 0);
    // rise over any ground between the camera and where it looks (a ball stopped behind a
    // mound); the clearance tapers to nothing at the look point, which is on the ground
    for (let k = 0.15; k < 0.9; k += 0.1) {
      const g = ceElevation(h, [cp[0] + (lp[0] - cp[0]) * k, cp[1] + (lp[1] - cp[1]) * k]) / 3 + 1.2 * (1 - k);
      if (camPos.y + (camLook.y - camPos.y) * k < g) camPos.y = (g - camLook.y * k) / (1 - k);
    }
  }
  if (mode !== ap3.camMode) { ap3.snap = ap3.snap || mode === 'side' || mode === 'green' || ap3.camMode === 'side' || ap3.camMode === 'green'; ap3.camMode = mode; } // cut, don't pan, to and from the TV cameras
  if (ap3.snap || !ap3.camPos) { ap3.camPos = camPos.clone(); ap3.camLook = camLook.clone(); ap3.snap = false; }
  else if (mode === 'side' || mode === 'green') { // fixed camera that follows the ball with its gaze
    ap3.camPos.copy(camPos); ap3.camLook.lerp(camLook, 1 - Math.exp(-dt / 0.06));
  } else {
    const k = 1 - Math.exp(-dt / (apexAnim ? 0.12 : 0.35));
    ap3.camPos.lerp(camPos, k); ap3.camLook.lerp(camLook, k);
  }
  ap3.camera.position.copy(ap3.camPos); ap3.camera.lookAt(ap3.camLook);

  // Shadows follow the action; the flag sways
  ap3LookFrame(t);
  ap3Wind.value = t / 1000;
  ap3UpdateBirds(t);
  ap3NatureFrame(h, o); // grass around the ball
  const wind = (apex && apex.wind) || null;
  ap3WaveFlag(o.flag, t, wind ? wind.mph : 0);
  // an eclipse (the 12th's secret): light fades to near night and back
  const ek = ap3.eclipseAt ? Math.max(0, Math.sin(Math.min(1, (t - ap3.eclipseAt) / 9000) * Math.PI)) : 0;
  o.sun.intensity = 1.25 * (1 - 0.92 * ek); o.hemi.intensity = 0.8 * (1 - 0.8 * ek);
  const focus = ap3G(ballPos, 0);
  o.sun.position.set(focus.x + AP3_POST.SUN[0] * 400, focus.y + AP3_POST.SUN[1] * 400, focus.z + AP3_POST.SUN[2] * 400); // where the sky's sun is
  if (o.sky) o.sky.position.copy(ap3.camera.position);
  o.sun.target.position.copy(focus); o.sun.target.updateMatrixWorld();
  // the flag points the way the wind blows (map heading → world: +x local edge along it)
  o.flag.rotation.y = (wind ? (90 - wind.toDeg) * Math.PI / 180 : 0.4) + Math.sin(t / 700) * (wind ? 0.12 : 0.05);

  ap3.camera.updateMatrixWorld();
  ap3RenderMirrors(ap3.renderer, ap3.scene, ap3.camera);
  ap3.renderer.shadowMap.needsUpdate = true;
  ap3RenderFrame();
}

// Where the replay camera stands: off to the side with the most open ground, as far
// back as the corridor allows; if the jungle is too close, up above the treetops instead
function ap3SideCam(h, a, fe, fd, r) {
  const mid = [(a[0] + fe[0]) / 2, (a[1] + fe[1]) / 2], want = Math.max(35, r.carry * 0.55);
  let best = { side: 1, clear: 0 };
  for (const side of [1, -1]) {
    let clear = 0;
    for (let off = 4; off <= want; off += 3) {
      const s = ceSurfaceAt(h, [mid[0] + fd[1] * side * off, mid[1] - fd[0] * side * off]);
      if (s === 'jungle' || s === 'ob' || s === 'ruins') break;
      clear = off;
    }
    if (clear > best.clear) best = { side, clear };
  }
  const roomy = best.clear >= 30, off = roomy ? Math.min(want, best.clear - 3) : want * 0.75;
  const p = [mid[0] + fd[1] * best.side * off, mid[1] - fd[0] * best.side * off];
  return ap3G(p, roomy ? Math.max(4, r.flight.apexFt / 3 * 0.45) : AP3.TREE_TOP + 6);
}

// Tap the ground to aim
function ap3Click(e) {
  if (!apex || apexAnim || apex.holeResult) return;
  const T = THREE, rect = e.currentTarget.getBoundingClientRect();
  const ndc = new T.Vector2(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1);
  const ray = new T.Raycaster(); ray.setFromCamera(ndc, ap3.camera);
  const onGround = ray.intersectObject(ap3.objs.ground)[0];
  const hit = onGround ? onGround.point : new T.Vector3();
  if (!onGround && !ray.ray.intersectPlane(new T.Plane(new T.Vector3(0, 1, 0), -ceElevation(apexHole(), apex.ball) / 3), hit)) return;
  apexAimAt([hit.x, -hit.z]);
  apexSave(); apexRefreshInfo();
}

window.addEventListener('resize', () => {
  if (ap3.on && ap3.renderer && ap3.renderer.domElement.parentElement) ap3Resize();
});

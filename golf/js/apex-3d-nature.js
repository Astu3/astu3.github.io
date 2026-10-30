// Golf Improvement App — Apex 3D nature: leaf-card foliage shells and instanced grass blades.
// Classic script: shares globals with the other files; load order is set in golf-improvement-app.html.

// ════════════════════════════════════════════════════════════
// APEX 3D · NATURE
// Foliage the way games do it: each crown gets a shell of alpha-cut leaf
// "cards" (small quads textured with a cluster of leaves). Their normals point
// out from the crown's centre, so light wraps around the whole crown like a
// soft volume rather than lighting each card flat. The original crown stays
// inside as a darker core, so there are no see-through gaps.
// Grass: thousands of tapered, swaying blades in the rough around the ball.
// ════════════════════════════════════════════════════════════
const AP3_NATURE = { CARDS: 26, GRASS: AP3_LOOK.lite ? 6000 : 16000, GRASS_RADIUS: 26, GRASS_AHEAD: 12 }; // GRASS: tufts of five blades

// A cluster of leaves on transparency (grey, tinted per tree)
function ap3LeafCardTex() {
  return ap3CanvasTex('leafcard', 256, (c, S, rnd) => {
    c.clearRect(0, 0, S, S);
    const leaf = (x, y, len, w, a, l) => {
      c.save(); c.translate(x, y); c.rotate(a);
      const g = c.createLinearGradient(0, -w, 0, w);
      g.addColorStop(0, `rgb(${l - 30},${l - 30},${l - 30})`); g.addColorStop(0.5, `rgb(${l + 15},${l + 15},${l + 15})`); g.addColorStop(1, `rgb(${l - 40},${l - 40},${l - 40})`);
      c.fillStyle = g;
      c.beginPath(); c.moveTo(0, 0); c.quadraticCurveTo(len * 0.5, -w, len, 0); c.quadraticCurveTo(len * 0.5, w, 0, 0); c.fill();
      c.strokeStyle = `rgba(40,40,40,0.35)`; c.lineWidth = 1; c.beginPath(); c.moveTo(0, 0); c.lineTo(len * 0.95, 0); c.stroke(); // midrib
      c.restore();
    };
    // leaves radiating from a few twigs, denser toward the middle
    for (let i = 0; i < 70; i++) {
      const r = Math.sqrt(rnd()) * S * 0.36, a = rnd() * Math.PI * 2;
      const x = S / 2 + Math.cos(a) * r, y = S / 2 + Math.sin(a) * r;
      leaf(x, y, 26 + rnd() * 26, 8 + rnd() * 6, a + (rnd() - 0.5) * 1.2, 170 + rnd() * 80 | 0);
    }
  }, { repeat: false });
}

// A shell of leaf cards around a unit sphere: one geometry, instanced per crown
function ap3CardShellGeo() {
  if (ap3Tex.cardShell) return ap3Tex.cardShell;
  const T = THREE, rnd = arRng(4711), pos = [], nrm = [], uv = [], col = [], idx = [];
  for (let i = 0; i < AP3_NATURE.CARDS; i++) {
    // a direction on the sphere, favouring the top and sides
    const y = -0.35 + rnd() * 1.35, phi = rnd() * Math.PI * 2, rr = Math.sqrt(Math.max(0, 1 - Math.min(1, y) ** 2));
    const dir = new T.Vector3(Math.cos(phi) * rr, Math.min(1, y), Math.sin(phi) * rr).normalize();
    const center = dir.clone().multiplyScalar(0.55 + rnd() * 0.38), size = 0.62 + rnd() * 0.4;
    // the card faces roughly outward, with a random tilt and twist
    const n = dir.clone().add(new T.Vector3(rnd() - 0.5, rnd() - 0.5, rnd() - 0.5).multiplyScalar(0.9)).normalize();
    const right = new T.Vector3(0, 1, 0).cross(n); if (right.lengthSq() < 1e-4) right.set(1, 0, 0); right.normalize();
    const up = n.clone().cross(right).normalize(), tw = rnd() * Math.PI;
    const r2 = right.clone().multiplyScalar(Math.cos(tw)).add(up.clone().multiplyScalar(Math.sin(tw)));
    const u2 = n.clone().cross(r2).normalize();
    const base = pos.length / 3;
    [[-1, -1, 0, 0], [1, -1, 1, 0], [1, 1, 1, 1], [-1, 1, 0, 1]].forEach(([a, b, s, t]) => {
      const v = center.clone().add(r2.clone().multiplyScalar(a * size / 2)).add(u2.clone().multiplyScalar(b * size / 2));
      pos.push(v.x, v.y, v.z);
      const sn = v.clone().normalize().lerp(dir, 0.35).normalize(); nrm.push(sn.x, sn.y, sn.z); // volume normal
      uv.push(s, t);
      const ao = (0.55 + 0.45 * Math.min(1, (v.y + 1) / 1.7)) * (0.8 + 0.2 * Math.min(1, v.length())); col.push(ao, ao, ao);
    });
    idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
  }
  const g = new T.BufferGeometry();
  g.setAttribute('position', new T.Float32BufferAttribute(pos, 3)); g.setAttribute('normal', new T.Float32BufferAttribute(nrm, 3));
  g.setAttribute('uv', new T.Float32BufferAttribute(uv, 2)); g.setAttribute('color', new T.Float32BufferAttribute(col, 3));
  g.setIndex(idx); g.userData.keep = true;
  return (ap3Tex.cardShell = g);
}

// Wrap an instanced crown mesh in leaf-card shells (same placement, a little larger),
// and darken the crown itself into an inner core
function ap3AddCardShell(scene, crowns, { grow = 1.14, coreDark = 0.72, shadows = true } = {}) {
  const T = THREE, n = crowns.count;
  if (!n) return null;
  const mat = ap3WindMaterial(new T.MeshLambertMaterial({ map: ap3LeafCardTex(), alphaTest: 0.5, side: T.DoubleSide, vertexColors: true }), 'foliage');
  const shell = new T.InstancedMesh(ap3CardShellGeo(), mat, n);
  if (shadows) { shell.castShadow = true; shell.customDepthMaterial = new T.MeshDepthMaterial({ depthPacking: T.RGBADepthPacking, map: ap3LeafCardTex(), alphaTest: 0.5 }); }
  const m = new T.Matrix4(), c = new T.Color(), s = new T.Vector3(grow, grow, grow);
  for (let i = 0; i < n; i++) {
    crowns.getMatrixAt(i, m); m.scale(s); shell.setMatrixAt(i, m);
    if (crowns.instanceColor) { crowns.getColorAt(i, c); shell.setColorAt(i, c.clone().multiplyScalar(1.12)); crowns.setColorAt(i, c.multiplyScalar(coreDark)); }
  }
  if (crowns.instanceColor) crowns.instanceColor.needsUpdate = true;
  if (shell.instanceColor) shell.instanceColor.needsUpdate = true;
  shell.layers.mask = crowns.layers.mask;
  scene.add(shell);
  return shell;
}

// ── Bark, and the flag with the hole number ─────────────────────
function ap3BarkTex() {
  const t = ap3CanvasTex('bark', 128, (c, S, rnd, wrap) => {
    c.fillStyle = '#8a7660'; c.fillRect(0, 0, S, S);
    for (let i = 0; i < 70; i++) { // vertical fissures and ridges
      const x = rnd() * S, w = 1 + rnd() * 3, dark = rnd() < 0.6;
      wrap(() => { c.fillStyle = dark ? `rgba(40,28,18,${0.35 + rnd() * 0.3})` : `rgba(200,180,150,${0.15 + rnd() * 0.15})`;
        c.beginPath(); c.moveTo(x, 0); for (let y = 0; y <= S; y += 16) c.lineTo(x + Math.sin(y * 0.09 + i) * 2.5, y); c.lineTo(x + w, S); c.lineTo(x + w, 0); c.fill(); });
    }
    for (let i = 0; i < 140; i++) { const x = rnd() * S, y = rnd() * S; c.fillStyle = rnd() < 0.5 ? 'rgba(70,95,50,0.35)' : 'rgba(30,22,14,0.3)'; c.fillRect(x, y, 2 + rnd() * 5, 2 + rnd() * 3); } // moss and knots
  });
  t.repeat.set(2, 3);
  return t;
}
function ap3FlagTex(n) {
  const T = THREE, cv = document.createElement('canvas'); cv.width = 128; cv.height = 82;
  const c = cv.getContext('2d');
  c.fillStyle = '#d62839'; c.fillRect(0, 0, 128, 82);
  c.fillStyle = 'rgba(0,0,0,0.12)'; c.fillRect(0, 0, 6, 82);            // the hem at the pole
  c.fillStyle = '#ffffff'; c.font = '900 52px system-ui, sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle';
  c.fillText(String(n), 66, 44);
  const tex = new T.CanvasTexture(cv); tex.encoding = T.sRGBEncoding;
  return tex;
}

// ── Overgrown ruins: bushes on the terraces and vines down the faces ──
function ap3Overgrow(group, t, rnd) {
  const T = THREE, th = t.height / t.tiers, spots = [];
  for (let i = 0; i < t.tiers - 1; i++) {
    const k = 1 - i / t.tiers * 0.82, hu = t.hu * k, hv = t.hv * k, n = Math.round((3 + rnd() * 3) * Math.max(1, (t.hu + t.hv) / 24));
    for (let j = 0; j < n; j++) {
      const side = rnd() * 4 | 0, u = rnd() * 2 - 1; // a point along one edge of this terrace
      const x = side < 2 ? (side ? 1 : -1) * hu * 0.92 : u * hu * 0.9, z = side < 2 ? u * hv * 0.9 : (side === 2 ? 1 : -1) * hv * 0.92;
      spots.push({ x, z, y: th * (i + 1), r: (1.0 + rnd() * 1.4) * Math.min(1.6, th / 2), vine: rnd() < 0.6 ? th * (0.8 + rnd() * 1.8) : 0 });
    }
  }
  const bushes = new T.InstancedMesh(ap3CrownGeo(), ap3Foliage(), spots.length);
  const vines = new T.InstancedMesh(new T.BoxGeometry(0.28, 1, 0.06).translate(0, -0.5, 0), new T.MeshLambertMaterial({ color: 0x2f5a24 }), spots.length);
  const m = new T.Matrix4(), q = new T.Quaternion(), greens = ['#3e7a35', '#4b8a3e', '#356b2d'].map(x => new T.Color(x));
  let v = 0;
  spots.forEach((s, i) => {
    m.compose(new T.Vector3(s.x, s.y + s.r * 0.3, s.z), q.setFromAxisAngle(new T.Vector3(0, 1, 0), rnd() * 6.3), new T.Vector3(s.r, s.r * 0.7, s.r));
    bushes.setMatrixAt(i, m); bushes.setColorAt(i, greens[(rnd() * greens.length) | 0]);
    if (s.vine) { m.compose(new T.Vector3(s.x * 1.04, s.y, s.z * 1.04), q.identity(), new T.Vector3(1, s.vine, 1)); vines.setMatrixAt(v++, m); }
  });
  vines.count = v;
  bushes.castShadow = true;
  group.add(bushes, vines);
  ap3AddCardShell(group, bushes, { grow: 1.12 });
}

// ── Grass: tapered blades in the rough around the ball ──────────
function ap3BladeGeo() {
  if (ap3Tex.blade) return ap3Tex.blade;
  // a tuft: five tapered, slightly curved blades leaning out from one spot
  const T = THREE, pos = [], col = [], nrm = [], idx = [], rnd = arRng(77);
  const rows = [[0, 1], [0.35, 0.75], [0.7, 0.42], [1, 0]]; // height, relative width
  for (let b = 0; b < 5; b++) {
    const yaw = b / 5 * Math.PI * 2 + rnd(), lean = 0.15 + rnd() * 0.3, hgt = 0.7 + rnd() * 0.5, ox = (rnd() - 0.5) * 0.5, oz = (rnd() - 0.5) * 0.5;
    const cy = Math.cos(yaw), sy = Math.sin(yaw), start = pos.length / 3;
    rows.forEach(([y, w], i) => {
      const out = lean * y * y; // curves outward as it rises
      [-0.5 * w, 0.5 * w].forEach(x => { pos.push(ox + x * cy + out * sy, y * hgt, oz - x * sy + out * cy); });
      const shade = 0.78 + 0.34 * y; col.push(shade, shade, shade, shade, shade, shade); // only slightly darker at the root
      nrm.push(0, 1, 0, 0, 1, 0);
      if (i) { const q = start + (i - 1) * 2; idx.push(q, q + 1, q + 3, q, q + 3, q + 2); }
    });
  }
  const g = new T.BufferGeometry();
  g.setAttribute('position', new T.Float32BufferAttribute(pos, 3)); g.setAttribute('color', new T.Float32BufferAttribute(col, 3));
  g.setAttribute('normal', new T.Float32BufferAttribute(nrm, 3)); g.setIndex(idx); g.userData.keep = true;
  return (ap3Tex.blade = g);
}
function ap3GrassMaterial() {
  const mat = new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide });
  mat.onBeforeCompile = sh => {
    sh.uniforms.uWind = ap3Wind;
    sh.vertexShader = 'uniform float uWind;\n' + sh.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
      #ifdef USE_INSTANCING
        vec3 ip = vec3(instanceMatrix[3][0], 0.0, instanceMatrix[3][2]);
      #else
        vec3 ip = vec3(0.0);
      #endif
      float gust = sin(uWind * 1.6 + ip.x * 0.35 + ip.z * 0.22) * 0.5 + sin(uWind * 3.1 + ip.x * 0.9) * 0.2;
      transformed.z += gust * position.y * position.y * 0.35;
      transformed.x += gust * position.y * position.y * 0.12;`);
    // both faces of a blade are lit like the ground it grows from (a back face would otherwise light from below)
    sh.fragmentShader = sh.fragmentShader.replace(/gl_FrontFacing/g, 'true');
  };
  mat.customProgramCacheKey = () => 'ap3-grass-lit';
  return mat;
}
// (Re)plant the grass around a point (the ball, looking toward where it's aimed)
function ap3PlantGrass(h, o, ball, aimDeg) {
  const T = THREE;
  if (!o.grass) {
    o.grass = new T.InstancedMesh(ap3BladeGeo(), ap3GrassMaterial(), AP3_NATURE.GRASS);
    // colours from the start: if the first planting finds no rough, the shader must still be built with them
    o.grass.instanceColor = new T.InstancedBufferAttribute(new Float32Array(AP3_NATURE.GRASS * 3).fill(0.3), 3);
    o.grass.frustumCulled = false; o.grass.receiveShadow = true;
    ap3.scene.add(o.grass);
  }
  const a = aimDeg * Math.PI / 180, c = [ball[0] + Math.sin(a) * AP3_NATURE.GRASS_AHEAD, ball[1] + Math.cos(a) * AP3_NATURE.GRASS_AHEAD];
  const rnd = arRng(Math.round(c[0] * 7 + c[1] * 13) & 0xffff), m = new T.Matrix4(), q = new T.Quaternion(), up = new T.Vector3(0, 1, 0), s = new T.Vector3();
  const cell = new Map(), surfAt = p => { const k = `${Math.round(p[0] / 2)},${Math.round(p[1] / 2)}`; if (!cell.has(k)) cell.set(k, ceSurfaceAt(h, p)); return cell.get(k); };
  // the rough's own colours (the ground texture is sRGB, so convert these to linear light to match it)
  const tints = { rough: ['#4f8c3a', '#5a9842', '#467d33', '#62a049'].map(x => new T.Color(x).convertSRGBToLinear()),
                  jungle: ['#2f5a25', '#36652b', '#284f20'].map(x => new T.Color(x).convertSRGBToLinear()) };
  let k = 0;
  for (let tries = 0; k < AP3_NATURE.GRASS && tries < AP3_NATURE.GRASS * 2.2; tries++) {
    const r = Math.sqrt(rnd()) * AP3_NATURE.GRASS_RADIUS, t = rnd() * Math.PI * 2, p = [c[0] + Math.cos(t) * r, c[1] + Math.sin(t) * r];
    const surf = surfAt(p);
    if (surf !== 'rough' && surf !== 'jungle') continue;
    const tall = surf === 'jungle' ? 0.32 : 0.16;
    const fade = 1 - Math.pow(r / AP3_NATURE.GRASS_RADIUS, 3); // shorter toward the edge, so the patch has no hard border
    const wide = 0.05 + rnd() * 0.03; s.set(wide, tall * (0.6 + rnd() * 0.8) * fade, wide);
    m.compose(ap3G(p, -0.01), q.setFromAxisAngle(up, rnd() * Math.PI * 2), s);
    o.grass.setMatrixAt(k, m); o.grass.setColorAt(k++, tints[surf][(rnd() * tints[surf].length) | 0]);
  }
  o.grass.count = k;
  o.grass.instanceMatrix.needsUpdate = true;
  if (o.grass.instanceColor) o.grass.instanceColor.needsUpdate = true;
  o.grassAt = ball.slice();
}
function ap3NatureFrame(h, o) {
  if (apexAnim || !apex) return;
  if (!o.grassAt || ceDist(o.grassAt, apex.ball) > 3) ap3PlantGrass(h, o, apex.ball, apex.aimDeg || 0);
}

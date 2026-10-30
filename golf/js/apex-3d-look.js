// Golf Improvement App — Apex 3D look: textures, sky, distant mountains, palms, grass detail and water.
// Classic script: shares globals with the other files; load order is set in golf-improvement-app.html.

// ════════════════════════════════════════════════════════════
// APEX 3D · LOOK
// Everything here is generated in code (canvas textures, procedural
// geometry), so there is nothing extra to download. Textures that never
// change are made once and kept between holes (userData.keep).
// ════════════════════════════════════════════════════════════
const AP3_LOOK = {
  lite: typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches, // phones and tablets: lighter settings
};
const ap3Tex = {}; // cached textures

// A seamless canvas texture: paint(ctx, size, rnd, wrap) where wrap(fn) draws fn at the 9 tiled offsets
function ap3CanvasTex(key, size, paint, { color = true, repeat = true } = {}) {
  if (ap3Tex[key]) return ap3Tex[key];
  const T = THREE, cv = document.createElement('canvas'); cv.width = cv.height = size;
  const ctx = cv.getContext('2d'), rnd = arRng(key.length * 7919 + size);
  const wrap = fn => { for (const dx of [-size, 0, size]) for (const dy of [-size, 0, size]) { ctx.save(); ctx.translate(dx, dy); fn(); ctx.restore(); } };
  paint(ctx, size, rnd, wrap);
  const tex = new T.CanvasTexture(cv);
  if (repeat) tex.wrapS = tex.wrapT = T.RepeatWrapping;
  if (color) tex.encoding = T.sRGBEncoding;
  tex.anisotropy = Math.min(8, ap3.renderer.capabilities.getMaxAnisotropy());
  tex.userData = { keep: true };
  return (ap3Tex[key] = tex);
}

// Leaves for the tree crowns: a light speckle of overlapping leaves (tinted per tree by its color)
function ap3LeafTex() {
  return ap3CanvasTex('leaf', 256, (c, S, rnd, wrap) => {
    c.fillStyle = '#d2d2d2'; c.fillRect(0, 0, S, S);
    for (let i = 0; i < 1100; i++) {
      const x = rnd() * S, y = rnd() * S, r = 5 + rnd() * 8, a = rnd() * Math.PI, l = 185 + rnd() * 70 | 0;
      wrap(() => {
        c.fillStyle = `rgb(${l},${l},${l})`;
        c.beginPath(); c.ellipse(x, y, r, r * 0.55, a, 0, 7); c.fill();
        c.strokeStyle = 'rgba(60,60,60,0.10)'; c.lineWidth = 1; c.stroke();
      });
    }
  });
}
// Ground detail: grain and short blades, averaging mid-gray (multiplied ×2 in the shader)
function ap3DetailTex() {
  return ap3CanvasTex('detail', 256, (c, S, rnd, wrap) => {
    c.fillStyle = 'rgb(128,128,128)'; c.fillRect(0, 0, S, S);
    for (let i = 0; i < 260; i++) { // soft clumps
      const x = rnd() * S, y = rnd() * S, r = 6 + rnd() * 18, v = rnd() < 0.5 ? 0 : 255;
      wrap(() => { const g = c.createRadialGradient(x, y, 0, x, y, r); g.addColorStop(0, `rgba(${v},${v},${v},0.10)`); g.addColorStop(1, `rgba(${v},${v},${v},0)`); c.fillStyle = g; c.fillRect(x - r, y - r, r * 2, r * 2); });
    }
    for (let i = 0; i < 5000; i++) { // blades
      const x = rnd() * S, y = rnd() * S, len = 3 + rnd() * 6, a = -Math.PI / 2 + (rnd() - 0.5) * 1.2, v = rnd() < 0.5 ? 70 + rnd() * 40 : 170 + rnd() * 50;
      wrap(() => { c.strokeStyle = `rgba(${v},${v},${v},0.55)`; c.lineWidth = 1; c.beginPath(); c.moveTo(x, y); c.lineTo(x + Math.cos(a) * len, y + Math.sin(a) * len); c.stroke(); });
    }
  }, { color: false });
}
// A palm frond: a midrib with leaflets, on transparency
function ap3FrondTex() {
  return ap3CanvasTex('frond', 256, (c, S) => {
    c.clearRect(0, 0, S, S);
    c.strokeStyle = '#4c6b2a'; c.lineWidth = 4; c.beginPath(); c.moveTo(0, S / 2); c.lineTo(S, S / 2); c.stroke();
    for (let x = 6; x < S - 4; x += 7) {
      const k = 1 - x / S, len = (S / 2 - 6) * (0.35 + 0.65 * Math.sin(Math.PI * Math.min(1, x / S * 1.15)));
      for (const sd of [-1, 1]) {
        const g = c.createLinearGradient(x, S / 2, x + 14, S / 2 + sd * len);
        g.addColorStop(0, '#5f8f34'); g.addColorStop(1, k > 0.5 ? '#86b44a' : '#6f9e3c');
        c.strokeStyle = g; c.lineWidth = 4.5; c.lineCap = 'round';
        c.beginPath(); c.moveTo(x, S / 2); c.quadraticCurveTo(x + 6, S / 2 + sd * len * 0.5, x + 14, S / 2 + sd * len); c.stroke();
      }
    }
  }, { repeat: false });
}
// Cumulus clouds: overlapping soft puffs, shaded underneath
function ap3CloudTex() {
  return ap3CanvasTex('cloud', 256, (c, S, rnd) => {
    c.clearRect(0, 0, S, S);
    for (let i = 0; i < 26; i++) {
      const x = S * (0.15 + rnd() * 0.7), y = S * (0.42 + rnd() * 0.2) - Math.sin((x / S) * Math.PI) * S * 0.12, r = S * (0.08 + rnd() * 0.12);
      const g = c.createRadialGradient(x, y - r * 0.3, r * 0.1, x, y, r);
      g.addColorStop(0, 'rgba(255,255,255,0.95)'); g.addColorStop(0.6, 'rgba(236,240,244,0.75)'); g.addColorStop(1, 'rgba(210,220,228,0)');
      c.fillStyle = g; c.beginPath(); c.arc(x, y, r, 0, 7); c.fill();
    }
  }, { repeat: false });
}
// Ripples for water: a tiling normal map built from a few crossing waves
function ap3RippleTex() {
  if (ap3Tex.ripple) return ap3Tex.ripple;
  const T = THREE, S = 128, data = new Uint8Array(S * S * 4), H = (x, y) => {
    const u = x / S * Math.PI * 2, v = y / S * Math.PI * 2;
    return Math.sin(u * 3 + v) * 0.5 + Math.sin(u * 5 - v * 4) * 0.3 + Math.sin(-u * 2 + v * 7) * 0.25 + Math.sin(u * 9 + v * 6) * 0.12;
  };
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const dx = H(x + 1, y) - H(x - 1, y), dy = H(x, y + 1) - H(x, y - 1), n = 1 / Math.hypot(dx * 1.4, dy * 1.4, 1), k = (y * S + x) * 4;
    data[k] = (-dx * 1.4 * n * 0.5 + 0.5) * 255; data[k + 1] = (-dy * 1.4 * n * 0.5 + 0.5) * 255; data[k + 2] = (n * 0.5 + 0.5) * 255; data[k + 3] = 255;
  }
  const tex = new T.DataTexture(data, S, S, T.RGBAFormat);
  tex.wrapS = tex.wrapT = T.RepeatWrapping; tex.magFilter = T.LinearFilter; tex.minFilter = T.LinearMipmapLinearFilter; tex.generateMipmaps = true;
  tex.needsUpdate = true; tex.userData = { keep: true };
  return (ap3Tex.ripple = tex);
}

// ── Ground: fine grass detail close to the camera, broad variation further out ──
// A low-resolution map of where each surface is (r = fairway/tee, g = green, b = sand), so the
// ground shader can draw each one procedurally at full resolution
function ap3SurfaceMask(h, ground) {
  const T = THREE, w = ground.x1 - ground.x0, ht = ground.y1 - ground.y0, ppy = Math.min(3, 2048 / Math.max(w, ht));
  const cv = document.createElement('canvas'); cv.width = Math.ceil(w * ppy); cv.height = Math.ceil(ht * ppy);
  const c = cv.getContext('2d'), S = p => [(p[0] - ground.x0) * ppy, (ground.y1 - p[1]) * ppy];
  const fill = (poly, col) => { c.beginPath(); poly.forEach((p, i) => { const [x, y] = S(p); i ? c.lineTo(x, y) : c.moveTo(x, y); }); c.closePath(); c.fillStyle = col; c.fill(); };
  c.fillStyle = '#000'; c.fillRect(0, 0, cv.width, cv.height);
  [...h.fairways, ...h.teeBoxes].forEach(f => fill(f, '#f00'));
  fill(h.green, '#0f0');
  h.bunkers.forEach(b => fill(b, '#00f'));
  const tex = new T.CanvasTexture(cv); tex.minFilter = T.LinearFilter; tex.generateMipmaps = false;
  return tex;
}

// opts (3D holes): { mask, box: [x0, y0, x1, y1] course yards, mow: [x, y] direction of play }
function ap3GroundDetail(mat, opts = null) {
  mat.onBeforeCompile = sh => {
    sh.uniforms.detailMap = { value: ap3DetailTex() };
    sh.uniforms.maskMap = { value: opts ? opts.mask : null };
    sh.uniforms.maskBox = { value: new THREE.Vector4(...(opts ? opts.box : [0, 0, 1, 1])) };
    sh.uniforms.mowDir = { value: new THREE.Vector2(...(opts ? [opts.mow[0], -opts.mow[1]] : [0, -1])) }; // world xz
    sh.vertexShader = 'varying vec2 vDetail;\nvarying float vDist;\n' + sh.vertexShader
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvDetail = (modelMatrix * vec4(transformed, 1.0)).xz;')
      .replace('#include <project_vertex>', '#include <project_vertex>\nvDist = -mvPosition.z;');
    sh.fragmentShader = 'uniform sampler2D detailMap, maskMap;\nuniform vec4 maskBox;\nuniform vec2 mowDir;\nvarying vec2 vDetail;\nvarying float vDist;\n' + sh.fragmentShader
      .replace('#include <map_fragment>', `#include <map_fragment>
        // which surface is this? (fairway / green / sand / otherwise rough)
        vec2 cxy = vec2(vDetail.x, -vDetail.y);
        vec3 msk = texture2D(maskMap, vec2((cxy.x - maskBox.x) / (maskBox.z - maskBox.x), (cxy.y - maskBox.y) / (maskBox.w - maskBox.y))).rgb;
        float fair = msk.r, grn = msk.g, sand = msk.b, mown = clamp(fair + grn, 0.0, 1.0);
        float near = 1.0 - smoothstep(18.0, 90.0, vDist);
        // mowing stripes: grass laid one way looks light from one side and dark from the other
        vec2 vxz = normalize(cameraPosition.xz - vDetail + vec2(1e-4));
        vec2 perp = vec2(-mowDir.y, mowDir.x);
        float band = mod(floor(dot(vDetail, perp) / 8.0), 2.0) * 2.0 - 1.0;
        float gband = mod(floor(dot(vDetail, mowDir) / 3.2), 2.0) * 2.0 - 1.0; // greens: finer, cut across
        // strongest looking along the line of play, fading (not vanishing) when viewed across it
        float sheen = fair * band * (0.05 + 0.13 * abs(dot(vxz, mowDir))) + grn * gband * (0.03 + 0.05 * abs(dot(vxz, mowDir)));
        vec3 fineCut = texture2D(detailMap, vDetail * 1.7).rgb * 2.0;     // short, even turf
        vec3 clumps = texture2D(detailMap, vDetail * 0.5).rgb * 2.0;      // longer, clumpy rough
        vec3 grain = texture2D(detailMap, vDetail * 3.5 + 0.21).rgb * 2.0; // sand
        vec3 broad = texture2D(detailMap, vDetail * 0.045 + 0.37).rgb * 2.0;
        vec3 surf = mix(mix(vec3(1.0), clumps, 0.7 * near), mix(vec3(1.0), fineCut, 0.3 * near), mown);
        surf = mix(surf, mix(vec3(1.0), grain, 0.35), sand);
        diffuseColor.rgb *= surf * (1.0 + sheen) * mix(vec3(1.0), broad, 0.45 * (1.0 - 0.6 * mown));`);
  };
  mat.customProgramCacheKey = () => 'ap3-ground-surface';
  return mat;
}

// ── Sky: clouds and distant ridges (ignore the fog; they carry their own haze) ──
function ap3AddSky(scene, h, o) {
  const T = THREE, rnd = arRng(h.n * 61 + 5), c = arCentroid(h.junglePoly);
  // Two rings of far ridges, lighter and bluer with distance (aerial perspective)
  [[1500, 0x3c5c4e, 90, 230], [2300, 0x68858c, 150, 360]].forEach(([R, color, lo, hi], ring) => {
    const n = 480, pos = [], ph = [rnd() * 6, rnd() * 6, rnd() * 6, rnd() * 6, rnd() * 6];
    for (let i = 0; i <= n; i++) {
      const a = i / n * Math.PI * 2;
      // broad ranges, then peaks and saddles at finer and finer scales
      // (1 − |sin|) makes sharp crests and rounded valleys, like real ridgelines)
      const ridge = (f, p) => 1 - Math.abs(Math.sin(a * f + p));
      const k = 0.3 + 0.26 * Math.sin(a * 3 + ph[0]) + 0.16 * Math.sin(a * 7 + ph[1]) + 0.18 * ridge(11, ph[2])
              + 0.1 * ridge(29, ph[3]) + 0.04 * ridge(71, ph[4]);
      const x = c[0] + Math.cos(a) * R, z = -(c[1] + Math.sin(a) * R), y = lo + (hi - lo) * Math.max(0, k);
      pos.push([x, y, z]);
    }
    const verts = [], cols = [], crest = new T.Color(color), base = new T.Color(0xcfdcd8);
    for (let i = 0; i < n; i++) {
      const [x0, y0, z0] = pos[i], [x1, y1, z1] = pos[i + 1];
      verts.push(x0, -60, z0, x1, -60, z1, x0, y0, z0, x1, -60, z1, x1, y1, z1, x0, y0, z0);
      [base, base, crest, base, crest, crest].forEach(c => cols.push(c.r, c.g, c.b));
    }
    const g = new T.BufferGeometry(); g.setAttribute('position', new T.Float32BufferAttribute(verts, 3));
    g.setAttribute('color', new T.Float32BufferAttribute(cols, 3));
    const m = new T.Mesh(g, new T.MeshBasicMaterial({ vertexColors: true, fog: false, side: T.DoubleSide }));
    m.renderOrder = -2 + ring; scene.add(m);
  });
  // Clouds drifting slowly across the sky
  o.clouds = [];
  for (let i = 0; i < 16; i++) {
    const a = rnd() * Math.PI * 2, R = 1100 + rnd() * 900, w = 380 + rnd() * 520;
    const s = new T.Sprite(new T.SpriteMaterial({ map: ap3CloudTex(), fog: false, transparent: true, depthWrite: false, opacity: 0.75 + rnd() * 0.2 }));
    s.scale.set(w, w * 0.5, 1);
    s.position.set(c[0] + Math.cos(a) * R, 260 + rnd() * 260, -(c[1] + Math.sin(a) * R));
    s.userData.drift = 0.004 + rnd() * 0.006;
    scene.add(s); o.clouds.push(s);
  }
}

// ── Palms: a curved trunk and a crown of drooping fronds ──
function ap3PalmGeos() {
  if (ap3Tex.palmGeos) return ap3Tex.palmGeos;
  const T = THREE;
  const curve = new T.CatmullRomCurve3([new T.Vector3(0, 0, 0), new T.Vector3(0.25, 0.35, 0), new T.Vector3(0.6, 0.7, 0), new T.Vector3(1.05, 1, 0)]);
  const trunk = new T.TubeGeometry(curve, 10, 0.022, 6, false); // unit height, scaled per palm
  // fronds merged into one geometry: arched strips radiating from the top
  const pos = [], uv = [], idx = [], N = 9, SEG = 6;
  for (let f = 0; f < N; f++) {
    const yaw = f / N * Math.PI * 2 + (f % 2) * 0.2, L = 4.4 + (f % 3) * 0.5, W = 0.9;
    const base = pos.length / 3;
    for (let i = 0; i <= SEG; i++) {
      const u = i / SEG, x = u * L, y = 0.9 * u - 1.9 * u * u; // rises, then droops
      for (const side of [-1, 1]) {
        const lx = x, lz = side * W * (0.3 + 0.7 * Math.sin(Math.PI * Math.min(1, u * 1.1)));
        pos.push(lx * Math.cos(yaw) - lz * Math.sin(yaw), y, lx * Math.sin(yaw) + lz * Math.cos(yaw));
        uv.push(u, side < 0 ? 0 : 1);
      }
    }
    for (let i = 0; i < SEG; i++) { const a = base + i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
  }
  const fronds = new T.BufferGeometry();
  fronds.setAttribute('position', new T.Float32BufferAttribute(pos, 3));
  fronds.setAttribute('uv', new T.Float32BufferAttribute(uv, 2));
  fronds.setIndex(idx); fronds.computeVertexNormals();
  trunk.userData.keep = fronds.userData.keep = true; // shared by every hole
  return (ap3Tex.palmGeos = { trunk, fronds });
}
function ap3AddPalms(scene, palms, rnd) {
  if (!palms.length) return;
  const T = THREE, { trunk, fronds } = ap3PalmGeos();
  const tm = new T.InstancedMesh(trunk, new T.MeshLambertMaterial({ map: ap3BarkTex(), color: 0xa08a70 }), palms.length);
  const fm = new T.InstancedMesh(fronds, ap3WindMaterial(new T.MeshLambertMaterial({ map: ap3FrondTex(), alphaTest: 0.45, side: T.DoubleSide }), 'frond'), palms.length);
  fm.customDepthMaterial = new T.MeshDepthMaterial({ depthPacking: T.RGBADepthPacking, map: ap3FrondTex(), alphaTest: 0.45 });
  tm.castShadow = fm.castShadow = true;
  const m = new T.Matrix4(), q = new T.Quaternion(), up = new T.Vector3(0, 1, 0);
  palms.forEach((p, i) => {
    const H = 9 + rnd() * 5, lean = 0.6 + rnd() * 1.6, yaw = rnd() * Math.PI * 2;
    q.setFromAxisAngle(up, yaw);
    m.compose(ap3G(p, -0.2), q, new T.Vector3(lean * 2.2, H, lean * 2.2)); tm.setMatrixAt(i, m);
    // the crown sits where the curved trunk ends (it leans 1.05 × its x scale along local x)
    const top = new T.Vector3(1.05 * lean * 2.2, H - 0.2, 0).applyQuaternion(q).add(ap3G(p, 0));
    const s = 0.85 + rnd() * 0.35;
    m.compose(top, q.clone().multiply(new T.Quaternion().setFromAxisAngle(up, rnd() * 3)), new T.Vector3(s, s, s)); fm.setMatrixAt(i, m);
  });
  scene.add(tm, fm);
}

// Per-frame touches: drifting clouds and moving ripples
function ap3LookFrame(t) {
  (ap3.objs.clouds || []).forEach(c => { c.position.x += c.userData.drift; });
  if (ap3Tex.ripple) ap3Tex.ripple.offset.set(t * 0.000012, t * 0.000008);
}

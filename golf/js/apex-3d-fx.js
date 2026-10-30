// Golf Improvement App — Apex 3D effects: reflective water, wind, cloth flag, birds, ball shadow.
// Classic script: shares globals with the other files; load order is set in golf-improvement-app.html.

// ════════════════════════════════════════════════════════════
// APEX 3D · FX
// Water is a real planar mirror: each frame a second camera, mirrored below
// the water's surface, renders the scene into a texture (with an oblique near
// plane so nothing under the water leaks in). The water shader samples it with
// ripple distortion, blends it with the water's own colour by viewing angle
// (Fresnel: mirror-like at a glancing angle, clear looking straight down) and
// adds a sun glint. Far-off trees sit on layer 1, which the mirror skips.
// Wind and flapping wings are vertex-shader offsets driven by one time uniform.
// ════════════════════════════════════════════════════════════
const ap3Wind = { value: 0 };       // seconds, shared by every swaying material
const AP3_FAR_LAYER = 1;

// ── Wind ───────────────────────────────────────────────────────
// kind 'foliage': crowns sway a little, more at the top; 'frond': palm fronds bob at their tips
function ap3WindMaterial(mat, kind) {
  mat.onBeforeCompile = sh => {
    sh.uniforms.uWind = ap3Wind;
    const body = kind === 'frond'
      ? `float ph = ip.x * 0.13 + ip.z * 0.09;
         transformed.y += sin(uWind * 1.7 + ph + position.x * 0.8) * 0.06 * position.x * position.x;
         transformed.z += sin(uWind * 1.1 + ph) * 0.05 * position.x;`
      : `float ph = ip.x * 0.071 + ip.z * 0.053;
         float s = sin(uWind * 1.15 + ph) * 0.045 + sin(uWind * 2.3 + ph * 1.7) * 0.02;
         float lift = clamp(position.y + 0.6, 0.0, 1.6);
         transformed.x += s * lift; transformed.z += s * 0.6 * lift;`;
    sh.vertexShader = 'uniform float uWind;\n' + sh.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
      #ifdef USE_INSTANCING
        vec3 ip = vec3(instanceMatrix[3][0], instanceMatrix[3][1], instanceMatrix[3][2]);
      #else
        vec3 ip = vec3(0.0);
      #endif
      ${body}`);
  };
  mat.customProgramCacheKey = () => 'ap3-wind-' + kind;
  return mat;
}

// ── Reflective water ───────────────────────────────────────────
const AP3_WATER_VS = `
  uniform mat4 textureMatrix;
  varying vec4 vUv; varying vec3 vWorld; varying float vDist;
  void main() {
    vUv = textureMatrix * vec4(position, 1.0);
    vec4 wp = modelMatrix * vec4(position, 1.0); vWorld = wp.xyz;
    vec4 mv = viewMatrix * wp; vDist = -mv.z;
    gl_Position = projectionMatrix * mv;
  }`;
const AP3_WATER_FS = `
  uniform sampler2D tReflect; uniform sampler2D tNormal;
  uniform float uTime; uniform vec3 deepColor; uniform vec3 sunDir;
  uniform vec3 fogColor; uniform float fogNear; uniform float fogFar; uniform float opacity; uniform float decode;
  varying vec4 vUv; varying vec3 vWorld; varying float vDist;
  void main() {
    // two ripple layers drifting in different directions
    vec2 a = vWorld.xz * 0.055 + vec2(uTime * 0.010, uTime * 0.007);
    vec2 b = vWorld.xz * 0.032 - vec2(uTime * 0.008, -uTime * 0.009);
    vec2 n = (texture2D(tNormal, a).rg * 2.0 - 1.0) + (texture2D(tNormal, b).rg * 2.0 - 1.0);
    vec4 proj = vUv; proj.xy += n * 0.007 * proj.w; // gentle: a still jungle pond
    vec3 refl = texture2DProj(tReflect, proj).rgb;
    if (decode > 0.5) refl = pow(refl, vec3(2.2)); // on the direct render the mirror holds display (sRGB) colours: back to linear
    vec3 V = normalize(cameraPosition - vWorld);
    float fres = 0.06 + 0.94 * pow(1.0 - clamp(V.y, 0.0, 1.0), 5.0);
    vec3 col = mix(deepColor, refl * 0.9, clamp(0.2 + fres, 0.0, 0.88));
    // sun glint off the ripples
    vec3 N = normalize(vec3(n.x * 0.25, 1.0, n.y * 0.25));
    col += vec3(1.0, 0.93, 0.78) * pow(max(dot(N, normalize(sunDir + V)), 0.0), 220.0) * 2.2;
    gl_FragColor = vec4(col, opacity);
    gl_FragColor.rgb = mix(gl_FragColor.rgb, fogColor, smoothstep(fogNear, fogFar, vDist));
    #include <tonemapping_fragment>
    #include <encodings_fragment>
  }`;

// One mirror per water level: polygons at the same height share it
function ap3AddReflectiveWater(scene, groups, o, deep = 0x174a63) {
  const T = THREE, lite = AP3_LOOK.lite;
  o.mirrors = o.mirrors || [];
  groups.forEach(({ polys, y, opacity = 0.96 }) => {
    const shapes = polys.map(poly => new T.Shape(poly.map(p => new T.Vector2(p[0], p[1]))));
    const geo = new T.ShapeGeometry(shapes);
    const size = lite ? 384 : 768;
    const rt = new T.WebGLRenderTarget(size, size, { minFilter: T.LinearFilter, magFilter: T.LinearFilter, format: T.RGBAFormat });
    // same output as the main render, so every material reuses its compiled shader
    // (sRGB on the direct render; linear HDR when post-processing is on)
    rt.texture.encoding = ap3.post ? T.LinearEncoding : T.sRGBEncoding;
    if (ap3.post) rt.texture.type = T.HalfFloatType;
    rt.texture.generateMipmaps = false;
    const mat = new T.ShaderMaterial({
      uniforms: { tReflect: { value: rt.texture }, tNormal: { value: ap3RippleTex() }, textureMatrix: { value: new T.Matrix4() }, uTime: ap3Wind,
                  deepColor: { value: new T.Color(deep) }, sunDir: { value: new T.Vector3(-0.5, 0.75, -0.45).normalize() },
                  fogColor: { value: new T.Color() }, fogNear: { value: 140 }, fogFar: { value: 760 }, opacity: { value: opacity },
                  decode: { value: ap3.post ? 0 : 1 } },
      vertexShader: AP3_WATER_VS, fragmentShader: AP3_WATER_FS, transparent: opacity < 1, depthWrite: true,
    });
    const mesh = new T.Mesh(geo, mat);
    mesh.rotation.x = -Math.PI / 2; mesh.position.y = y;
    mesh.updateMatrixWorld();
    geo.computeBoundingSphere();
    scene.add(mesh);
    o.mirrors.push({ mesh, rt, cam: new T.PerspectiveCamera(), y });
  });
}

// Render each visible mirror's reflection (call before the main render)
function ap3RenderMirrors(renderer, scene, camera) {
  const o = ap3.objs; if (!o.mirrors || !o.mirrors.length) return;
  const T = THREE, frustum = new T.Frustum(), pv = new T.Matrix4();
  camera.updateMatrixWorld(); pv.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse); frustum.setFromProjectionMatrix(pv);
  const fog = scene.fog, sunDir = o.sun ? o.sun.position.clone().sub(o.sun.target.position).normalize() : null;
  o.mirrors.forEach(m => {
    const u = m.mesh.material.uniforms;
    if (fog) { u.fogColor.value.copy(fog.color); u.fogNear.value = fog.near; u.fogFar.value = fog.far; }
    if (sunDir) u.sunDir.value.copy(sunDir);
    const sphere = m.mesh.geometry.boundingSphere.clone().applyMatrix4(m.mesh.matrixWorld);
    if (!frustum.intersectsSphere(sphere) || camera.position.y < m.y) return; // off screen, or looking from below
    // mirrored camera
    const normal = new T.Vector3(0, 1, 0), planePos = new T.Vector3(0, m.y, 0), camPos = new T.Vector3().setFromMatrixPosition(camera.matrixWorld);
    const rot = new T.Matrix4().extractRotation(camera.matrixWorld);
    const look = new T.Vector3(0, 0, -1).applyMatrix4(rot).add(camPos);
    const view = camPos.clone(); view.y = 2 * m.y - view.y;
    const target = look.clone(); target.y = 2 * m.y - target.y;
    const vc = m.cam;
    vc.position.copy(view); vc.up.set(0, 1, 0).applyMatrix4(rot).reflect(normal); vc.lookAt(target);
    vc.far = camera.far; vc.near = camera.near; vc.updateMatrixWorld(); vc.projectionMatrix.copy(camera.projectionMatrix);
    vc.layers.set(0); // the mirror skips the far forest (layer 1)
    u.textureMatrix.value.set(0.5, 0, 0, 0.5, 0, 0.5, 0, 0.5, 0, 0, 0.5, 0.5, 0, 0, 0, 1)
      .multiply(vc.projectionMatrix).multiply(vc.matrixWorldInverse).multiply(m.mesh.matrixWorld);
    // oblique near plane at the water surface (nothing below the water shows in the reflection)
    const plane = new T.Plane().setFromNormalAndCoplanarPoint(normal, planePos).applyMatrix4(vc.matrixWorldInverse);
    const clip = new T.Vector4(plane.normal.x, plane.normal.y, plane.normal.z, plane.constant), pm = vc.projectionMatrix, q = new T.Vector4();
    q.x = (Math.sign(clip.x) + pm.elements[8]) / pm.elements[0];
    q.y = (Math.sign(clip.y) + pm.elements[9]) / pm.elements[5];
    q.z = -1.0; q.w = (1.0 + pm.elements[10]) / pm.elements[14];
    clip.multiplyScalar(2.0 / clip.dot(q));
    pm.elements[2] = clip.x; pm.elements[6] = clip.y; pm.elements[10] = clip.z + 1.0 - 0.003; pm.elements[14] = clip.w;
    // render
    const prevTarget = renderer.getRenderTarget(), prevShadow = renderer.shadowMap.autoUpdate;
    m.mesh.visible = false; renderer.shadowMap.autoUpdate = false;
    renderer.setRenderTarget(m.rt); renderer.state.buffers.depth.setMask(true); renderer.clear();
    renderer.render(scene, vc);
    renderer.setRenderTarget(prevTarget); renderer.shadowMap.autoUpdate = prevShadow; m.mesh.visible = true;
  });
}

// ── Cloth flag ─────────────────────────────────────────────────
function ap3FlagGeometry() {
  const g = new THREE.PlaneGeometry(1.1, 0.7, 10, 4); g.translate(0.55, 0, 0);
  g.userData.base = Float32Array.from(g.attributes.position.array);
  return g;
}
// mph: wind speed — a calm flag hangs down the pole, a strong one streams out flat and snaps
function ap3WaveFlag(flag, t, mph = 8) {
  const p = flag.geometry.attributes.position, base = flag.geometry.userData.base;
  if (!base) return;
  const s = Math.min(1, mph / 18), droop = 0.55 * (1 - s) ** 2, flap = 0.03 + 0.1 * s, rate = 0.004 + 0.008 * s;
  for (let i = 0; i < p.count; i++) {
    const x = base[i * 3], y = base[i * 3 + 1], k = x / 1.1; // 0 at the pole, 1 at the free edge
    p.setZ(i, Math.sin(x * 6 - t * rate * 1.3 + y * 1.5) * flap * k);
    p.setX(i, x * (1 - droop * 0.6 * k));
    p.setY(i, y + Math.sin(x * 4 - t * rate) * 0.025 * k - (0.04 + droop) * k * k);
  }
  p.needsUpdate = true; flag.geometry.computeVertexNormals();
}

// ── Birds: small flocks circling over the jungle ───────────────
function ap3AddBirds(scene, h, o) {
  const T = THREE, rnd = arRng(h.n * 97 + 3), c = arCentroid(h.junglePoly);
  const geo = new T.BufferGeometry(); // a body point, a beak, two wing tips: two triangles
  geo.setAttribute('position', new T.Float32BufferAttribute([0, 0, 0.25, 0, 0, -0.45, -1, 0, 0.15, 0, 0, 0.25, 1, 0, 0.15, 0, 0, -0.45], 3));
  geo.computeVertexNormals();
  const mat = new T.MeshBasicMaterial({ color: 0x24302a, side: T.DoubleSide });
  mat.onBeforeCompile = sh => {
    sh.uniforms.uWind = ap3Wind;
    sh.vertexShader = 'uniform float uWind;\n' + sh.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
      #ifdef USE_INSTANCING
        float ph = instanceMatrix[3][0] * 0.37 + instanceMatrix[3][2] * 0.21;
      #else
        float ph = 0.0;
      #endif
      transformed.y += abs(position.x) * sin(uWind * 11.0 + ph) * 0.75;`);
  };
  mat.customProgramCacheKey = () => 'ap3-bird';
  const flocks = [...Array(3)].map(() => ({ cx: c[0] + (rnd() - 0.5) * 160, cy: c[1] + (rnd() - 0.5) * 300, r: 50 + rnd() * 70,
    h: 34 + rnd() * 18, speed: (rnd() < 0.5 ? -1 : 1) * (5 + rnd() * 4), phase: rnd() * 6.28, n: 4 + (rnd() * 5 | 0) }));
  const total = flocks.reduce((a, f) => a + f.n, 0);
  const mesh = new T.InstancedMesh(geo, mat, total); mesh.frustumCulled = false;
  scene.add(mesh);
  o.birds = { mesh, flocks };
}
function ap3UpdateBirds(t) {
  const b = ap3.objs.birds; if (!b) return;
  const T = THREE, m = new T.Matrix4(), q = new T.Quaternion(), e = new T.Euler(), s = new T.Vector3(0.7, 0.7, 0.7);
  let k = 0;
  b.flocks.forEach(f => {
    const a = f.phase + (t / 1000) * f.speed / f.r;
    for (let i = 0; i < f.n; i++) {
      const ai = a - i * 0.045 * Math.sign(f.speed), side = (i % 2 ? 1 : -1) * Math.ceil(i / 2) * 1.6;
      const x = f.cx + Math.cos(ai) * (f.r + side), z = -(f.cy + Math.sin(ai) * (f.r + side)), y = f.h + Math.sin(t / 1300 + i) * 0.8;
      const heading = Math.atan2(-Math.sin(ai), -Math.cos(ai)) * Math.sign(f.speed); // along the circle
      e.set(0, heading + (f.speed > 0 ? 0 : Math.PI), 0.25 * Math.sign(f.speed)); q.setFromEuler(e);
      m.compose(new T.Vector3(x, y, z), q, s); b.mesh.setMatrixAt(k++, m);
    }
  });
  b.mesh.instanceMatrix.needsUpdate = true;
}

// ── Ball shadow: a soft spot on the ground under the ball ───────
function ap3BallShadowTex() {
  return ap3CanvasTex('ballshadow', 64, (c, S) => {
    const g = c.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
    g.addColorStop(0, 'rgba(0,0,0,0.75)'); g.addColorStop(0.5, 'rgba(0,0,0,0.35)'); g.addColorStop(1, 'rgba(0,0,0,0)');
    c.fillStyle = g; c.fillRect(0, 0, S, S);
  }, { repeat: false, color: false });
}
function ap3AddBallShadow(scene, o) {
  const T = THREE, m = new T.Mesh(new T.PlaneGeometry(1, 1), new T.MeshBasicMaterial({ map: ap3BallShadowTex(), transparent: true, depthWrite: false, toneMapped: false }));
  m.rotation.x = -Math.PI / 2; m.renderOrder = 1; scene.add(m); o.ballShadow = m;
}
// heightYds: ball height above the ground beneath it
function ap3PlaceBallShadow(o, groundPos, heightYds, visible) {
  const s = o.ballShadow; if (!s) return;
  s.visible = visible;
  s.position.copy(groundPos); s.position.y += 0.04;
  const k = 1 / (1 + Math.max(0, heightYds) / 12);       // fainter and wider as the ball climbs
  s.scale.setScalar(0.32 + (1 - k) * 1.4);
  s.material.opacity = 0.25 + 0.6 * k;
}

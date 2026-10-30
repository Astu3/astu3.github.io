// Golf Improvement App — Apex 3D post-processing and sky: HDR render → bloom → colour grade, plus a sun-lit sky dome.
// Classic script: shares globals with the other files; load order is set in golf-improvement-app.html.

// ════════════════════════════════════════════════════════════
// APEX 3D · POST
// Like a game engine: the scene renders in HDR (linear light, values above 1
// allowed), bright things bloom, and a final pass does filmic (ACES) tone
// mapping, contrast, saturation, a warm/cool split tone and a vignette, then
// converts to the screen's colour space. Three.js's post-processing modules
// are loaded on first use (desktop only; phones keep the lighter direct render).
// ════════════════════════════════════════════════════════════
const AP3_POST = {
  BASE: 'https://cdn.jsdelivr.net/npm/three@0.128.0/examples/js/',
  FILES: ['shaders/CopyShader.js', 'shaders/LuminosityHighPassShader.js', 'postprocessing/EffectComposer.js',
          'postprocessing/RenderPass.js', 'postprocessing/ShaderPass.js', 'postprocessing/UnrealBloomPass.js'],
  EXPOSURE: 0.95, BLOOM: { strength: 0.32, radius: 0.55, threshold: 0.92 },
  SUN: [-0.52, 0.56, -0.64], // direction toward the sun (world), ~34° up, ahead and to the left
};
function ap3PostWanted() { return !AP3_LOOK.lite && getPrefs().apexPost !== false; }

function ap3LoadScript(src) {
  return new Promise((res, rej) => { const s = document.createElement('script'); s.src = src; s.onload = res; s.onerror = rej; document.head.appendChild(s); });
}
async function ap3LoadPost() {
  if (!ap3PostWanted() || THREE.EffectComposer) return !!THREE.EffectComposer;
  try { for (const f of AP3_POST.FILES) await ap3LoadScript(AP3_POST.BASE + f); return true; }
  catch { return false; } // without them the view still works, just without bloom and grading
}

// Final pass: ACES filmic (as three.js does it), grade, vignette, then linear → sRGB
const AP3_GRADE = {
  uniforms: { tDiffuse: { value: null }, exposure: { value: AP3_POST.EXPOSURE }, saturation: { value: 1.0 }, contrast: { value: 1.08 },
              vignette: { value: 0.32 }, aspect: { value: 1.5 } },
  vertexShader: `varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
  fragmentShader: `
    uniform sampler2D tDiffuse; uniform float exposure, saturation, contrast, vignette, aspect; varying vec2 vUv;
    vec3 RRTAndODTFit(vec3 v) { vec3 a = v * (v + 0.0245786) - 0.000090537; vec3 b = v * (0.983729 * v + 0.4329510) + 0.238081; return a / b; }
    vec3 aces(vec3 c) {
      const mat3 inM = mat3(vec3(0.59719, 0.07600, 0.02840), vec3(0.35458, 0.90834, 0.13383), vec3(0.04823, 0.01566, 0.83777));
      const mat3 outM = mat3(vec3(1.60475, -0.10208, -0.00327), vec3(-0.53108, 1.10813, -0.07276), vec3(-0.07367, -0.00605, 1.07602));
      c *= exposure / 0.6; c = inM * c; c = RRTAndODTFit(c); c = outM * c; return clamp(c, 0.0, 1.0);
    }
    vec3 toSRGB(vec3 c) { return mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(0.0031308, c)); }
    void main() {
      vec3 c = aces(texture2D(tDiffuse, vUv).rgb);
      float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
      c = mix(vec3(l), c, saturation);                                       // richer colour
      c = mix(c, c * vec3(1.05, 1.0, 0.93), smoothstep(0.45, 1.0, l));       // warm highlights
      c = mix(c, c * vec3(0.94, 1.0, 1.06), 1.0 - smoothstep(0.0, 0.35, l));  // cool shadows
      c = clamp((c - 0.5) * contrast + 0.5, 0.0, 1.0);
      vec2 d = (vUv - 0.5) * vec2(aspect, 1.0);
      c *= 1.0 - vignette * smoothstep(0.35, 1.05, length(d));
      gl_FragColor = vec4(toSRGB(c), 1.0);
    }`,
};

// Set up the composer (or not): the renderer then outputs linear, untone-mapped light into it
function ap3SetupPost() {
  const T = THREE, r = ap3.renderer;
  if (!T.EffectComposer || !ap3PostWanted()) { ap3.post = null; return; }
  r.toneMapping = T.NoToneMapping; r.outputEncoding = T.LinearEncoding;
  const size = r.getDrawingBufferSize(new T.Vector2());
  const opts = { type: T.HalfFloatType, format: T.RGBAFormat };
  const rt = r.capabilities.isWebGL2 && T.WebGLMultisampleRenderTarget
    ? Object.assign(new T.WebGLMultisampleRenderTarget(size.x, size.y, opts), { samples: 4 }) // keeps anti-aliasing
    : new T.WebGLRenderTarget(size.x, size.y, opts);
  const composer = new T.EffectComposer(r, rt);
  composer.addPass(new T.RenderPass(ap3.scene || new T.Scene(), ap3.camera));
  const B = AP3_POST.BLOOM;
  composer.addPass(new T.UnrealBloomPass(new T.Vector2(size.x, size.y), B.strength, B.radius, B.threshold));
  const grade = new T.ShaderPass(AP3_GRADE);
  composer.addPass(grade);
  ap3.post = { composer, render: composer.passes[0], grade };
}
function ap3PostResize(w, h) {
  if (!ap3.post) return;
  const pr = ap3.renderer.getPixelRatio();
  ap3.post.composer.setPixelRatio ? ap3.post.composer.setPixelRatio(pr) : null;
  ap3.post.composer.setSize(w, h);
  ap3.post.grade.uniforms.aspect.value = w / h;
}
function ap3RenderFrame() {
  if (ap3.post) { ap3.post.render.scene = ap3.scene; ap3.post.render.camera = ap3.camera; ap3.post.composer.render(); }
  else ap3.renderer.render(ap3.scene, ap3.camera);
}

// ── Sky dome: atmosphere gradient, sun disk and halo (HDR, so the sun blooms) ──
const AP3_SKY_FS = `
  uniform vec3 sunDir, zenith, horizon, haze; varying vec3 vDir;
  void main() {
    vec3 d = normalize(vDir);
    float h = max(d.y, 0.0);
    vec3 col = mix(horizon, zenith, pow(h, 0.55));
    col = mix(haze, col, smoothstep(-0.02, 0.12, d.y));            // humid haze at the horizon (matches the fog)
    float s = max(dot(d, normalize(sunDir)), 0.0);
    col += vec3(1.0, 0.86, 0.62) * (pow(s, 8.0) * 0.16 + pow(s, 64.0) * 0.7); // the glow around the sun
    col += vec3(1.0, 0.95, 0.85) * smoothstep(0.99955, 0.99975, s) * 24.0;    // the sun itself
    gl_FragColor = vec4(col, 1.0);
    #include <tonemapping_fragment>
    #include <encodings_fragment>
  }`;
function ap3AddSkyDome(scene, o, fogColor) {
  const T = THREE;
  const mat = new T.ShaderMaterial({
    uniforms: { sunDir: { value: new T.Vector3(...AP3_POST.SUN) }, zenith: { value: new T.Color(0x0b3a9e) }, horizon: { value: new T.Color(0x6a9cc4) }, // (linear light)
                haze: { value: new T.Color(fogColor) } },
    vertexShader: `varying vec3 vDir; void main() { vec4 wp = modelMatrix * vec4(position, 1.0); vDir = wp.xyz - cameraPosition;
                   gl_Position = projectionMatrix * viewMatrix * wp; gl_Position.z = gl_Position.w; }`, // always at the far plane
    fragmentShader: AP3_SKY_FS, side: T.BackSide, depthWrite: false, fog: false,
  });
  const dome = new T.Mesh(new T.SphereGeometry(3000, 32, 16), mat);
  dome.frustumCulled = false; dome.renderOrder = -10;
  scene.add(dome); o.sky = dome;
}

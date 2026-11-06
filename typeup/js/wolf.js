'use strict';
// ═══════════════════════════════════════════════════════════════════════════
// TypeUp — your timberwolf. Drawn in code (SVG) from simple shapes, so it can
// grow, change its face and wear gear without any image files.
// The wolf sits facing you in a 200-wide box with the ground at y = 186.
// ═══════════════════════════════════════════════════════════════════════════

// Twenty stages across a wolf's life, following your level (which only goes up).
const WOLF_STAGES = [
  [1,  'Newborn pup',          'Eyes still closed, snuggled up in the den.'],
  [2,  'Den pup',              'Eyes open! Blue, like every wolf pup\'s.'],
  [3,  'Wobbly pup',           'First wobbly steps out of the den.'],
  [4,  'Curious pup',          'Sniffing everything. What\'s that?'],
  [5,  'Explorer pup',         'Ears up and ready to explore the woods.'],
  [6,  'Playful pup',          'Chasing tails and tumbling in the leaves.'],
  [7,  'Pouncer',              'Practicing pounces on pinecones.'],
  [8,  'Tracker pup',          'Learning to follow a trail by scent.'],
  [9,  'Yearling',             'A year old. All legs and big paws.'],
  [10, 'Long-legged yearling', 'Growing into those long legs.'],
  [12, 'Young wolf',           'A fuller coat and a steady stride.'],
  [14, 'Scout',                'Out ahead, scouting the trail.'],
  [16, 'Trail runner',         'Runs for miles without tiring.'],
  [18, 'Pack wolf',            'A true member of the pack.'],
  [20, 'Pack guardian',        'Watches over the younger pups.'],
  [22, 'Howler',               'Leads the pack\'s evening howl.'],
  [25, 'Ridge runner',         'At home on the high ridges.'],
  [28, 'Silver coat',          'A silver-tipped winter coat.'],
  [32, 'Alpha',                'Leader of the pack. Calm and sure.'],
  [36, 'Legend of the North',  'A legend of the north woods.'],
].map(([level, name, say]) => ({ level, name, say }));
const WOLF_ALPHA = 18, WOLF_LEGEND = 19;

// The body grows between a few key shapes; every stage in between is a blend.
// r/hy: head size and height; bw/bh: body width and height; leg width; ear
// height; neck ruff; muzzle length; eye size.
const WOLF_KEYS = [
  [0,  { r: 42, hy: 96, bw: 32, bh: 52, leg: 11,   ear: 14, ruff: 0,   muz: 0.8,  eye: 0.22 }],
  [5,  { r: 38, hy: 86, bw: 37, bh: 66, leg: 13,   ear: 21, ruff: 0,   muz: 0.92, eye: 0.2 }],
  [9,  { r: 35, hy: 77, bw: 41, bh: 78, leg: 13.5, ear: 25, ruff: 0.4, muz: 1,    eye: 0.18 }],
  [13, { r: 33.5, hy: 70, bw: 46, bh: 90, leg: 15, ear: 28, ruff: 0.9, muz: 1.08, eye: 0.165 }],
  [19, { r: 33, hy: 66, bw: 51, bh: 97, leg: 16.5, ear: 30, ruff: 1.3, muz: 1.14, eye: 0.16 }],
];
const lerp = (a, b, t) => a + (b - a) * t;
const mixHex = (a, b, t) => '#' + [0, 2, 4].map(i => Math.round(lerp(parseInt(a.slice(1 + i, 3 + i), 16), parseInt(b.slice(1 + i, 3 + i), 16), t)).toString(16).padStart(2, '0')).join('');
const WOLF_SHAPES = WOLF_STAGES.map((_, i) => {
  const k = WOLF_KEYS.findIndex(([at]) => at >= i);
  if (WOLF_KEYS[k][0] === i) return { ...WOLF_KEYS[k][1] };
  const [a, A] = WOLF_KEYS[k - 1], [b, B] = WOLF_KEYS[k];
  const t = (i - a) / (b - a);
  return Object.fromEntries(Object.keys(A).map(key => [key, lerp(A[key], B[key], t)]));
});
// North-woods night colors: a slate coat, midnight-navy markings, lake-blue
// shading and moonlit white. Pups' eyes are blue and turn gold around the
// yearling stage; ears go from pup pink to pine green; the coat silvers late.
const WOLF_COLORS = WOLF_STAGES.map((_, i) => {
  const age = i / WOLF_LEGEND, silver = Math.max(0, (i - 15) / 4);
  return {
    fur: mixHex(mixHex('#a3adbd', '#7d8aa0', age), '#b9c4d6', silver),
    dark: mixHex('#36425f', '#1c2642', age),
    shade: mixHex('#6385ad', '#3c638f', age),
    cream: mixHex('#eaeff4', '#f5f8fb', silver),
    inner: mixHex('#cfa49c', '#2f6b52', Math.min(1, age * 1.7)),
    line: '#111a2c',
    eyes: i <= 7 ? '#7fb2e5' : i >= 10 ? (i === WOLF_LEGEND ? '#ffe08a' : '#f6c343') : mixHex('#7fb2e5', '#f6c343', (i - 7) / 3),
  };
});

// Gear goes in three slots, one item each. Each piece is unlocked by a badge.
const WOLF_GEAR = {
  neck: [
    { id: 'bandana', name: 'Skol bandana', badge: 'l1' },
    { id: 'scarf',   name: 'Knit scarf',   badge: 's3' },
    { id: 'medal',   name: 'Gold medal',   badge: 'keys' },
  ],
  eyes: [
    { id: 'shades',  name: 'Sunglasses',   badge: 's7' },
    { id: 'visor',   name: 'Robot visor',  badge: 't10-ai' },
  ],
  head: [
    { id: 'cap',     name: 'Golf cap',     badge: 'pt0' },
    { id: 'helmet',  name: 'Viking helmet', badge: 't10-vikings' },
    { id: 'flowers', name: 'Flower crown', badge: 't10-character' },
    { id: 'grad',    name: 'Graduation cap', badge: 'straightA' },
    { id: 'crown',   name: 'Crown',        badge: 'w40' },
  ],
};
const WOLF_SCENES = [
  { id: 'den',     name: 'The den',           badge: null },
  { id: 'pines',   name: 'Pine forest',       badge: 'l10' },
  { id: 'lake',    name: 'Lake Superior',     badge: 's14' },
  { id: 'green',   name: 'The 18th green',    badge: 'pt18' },
  { id: 'stadium', name: 'Game day',          badge: 'tall-vikings' },
  { id: 'aurora',  name: 'Northern lights',   badge: null, stage: WOLF_ALPHA },   // reaching Alpha
];

const wolfStageFor = level => WOLF_STAGES.reduce((s, st, i) => (level >= st.level ? i : s), 0);
let wolfUid = 0;

// mood: happy, excited, focus, oops, sleepy, howl.
// Drawn in an angular mascot style: faceted shapes, a bold dark outline and
// north-woods night colors. Pups keep softer corners and grow into the edge.
function wolfSVG({ stage = 0, mood = 'happy', gear = {}, scene = null, cls = '', silhouette = false } = {}) {
  const id = 'w' + (++wolfUid);
  const { r, hy, bw, bh, leg, ear, ruff, muz, eye } = WOLF_SHAPES[stage];
  const C = silhouette ? Object.fromEntries(Object.keys(WOLF_COLORS[0]).map(k => [k, '#2a3158'])) : WOLF_COLORS[stage];
  const top = 186 - bh, ny = hy + r * 0.82, my = hy + r * 0.5;
  const ex = r * 0.36, ey = hy - r * 0.08, er = r * eye;
  const lr = f => [f(-1), f(1)].join('');            // draw on the left, then mirror on the right
  const pts = list => list.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(' ');
  const mirror = list => [...list, ...list.slice(0, -1).reverse().map(([x, y]) => [200 - x, y])];
  // m: 0 for a soft pup, 1 for a fully grown, rugged male wolf.
  const m = Math.max(0, Math.min(1, (stage - 4) / 10));
  const soft = 6 * (1 - m) + 1.2;                     // rounding on pup corners, crisp on adults
  const poly = (list, fill, extra = '') => `<polygon points="${pts(list)}" fill="${fill}" stroke="${fill}" stroke-width="${soft}" stroke-linejoin="round" ${extra}/>`;

  // ── Silhouette parts (these also get the bold outline) ──
  const T = [100 + bw * 1.55, 172 - bh * 0.08];       // tail tip
  const tailPts = [[100 + bw * 0.55, 186], [100 + bw * 1.1, 187], [100 + bw * 1.38, 181], T,
    [100 + bw * 1.38, 170 - bh * 0.12], [100 + bw * 1.26, 175 - bh * 0.06], [100 + bw * 1.08, 166 - bh * 0.12], [100 + bw * 0.92, 172], [100 + bw * 0.5, 172]];
  const tail = poly(tailPts, C.fur);
  const haunches = lr(s => poly([[100 + s * bw * 0.35, 186], [100 + s * bw * 1.12, 186], [100 + s * bw * 1.08, 186 - bh * 0.3], [100 + s * bw * 0.7, 186 - bh * 0.44], [100 + s * bw * 0.38, 186 - bh * 0.32]], C.fur));
  const sh = 0.55 + 0.2 * m, shoulder = 1.05 + 0.1 * m;
  const bodyPts = [[100 - bw * sh, top], [100 + bw * sh, top], [100 + bw * shoulder, top + bh * 0.26], [100 + bw * (0.95 - 0.17 * m), 186], [100 - bw * (0.95 - 0.17 * m), 186], [100 - bw * shoulder, top + bh * 0.26]];
  const body = poly(bodyPts, C.fur);
  const lw = leg * (1 + 0.22 * m);
  const legX = s => 100 + s * bw * 0.29;
  const legs = lr(s => `<rect x="${legX(s) - lw / 2}" y="${top + bh * 0.4}" width="${lw}" height="${186 - (top + bh * 0.4) - 2}" rx="${lw * (0.45 - 0.3 * m)}" fill="${C.fur}"/>`);
  // Just the sides of each front leg, so the legs stand apart from the chest.
  const legEdges = lr(s => `<path d="M ${legX(s) - lw / 2} ${top + bh * 0.56} V 181 M ${legX(s) + lw / 2} ${top + bh * 0.56} V 181" stroke="${C.dark}" stroke-width="1.8" stroke-linecap="round" opacity="${0.3 + 0.4 * m}"/>`);
  const mane = (R, depth, color, n = 16) => {
    const cy = hy + r * 0.55, list = [];
    for (let i = 0; i <= n; i++) {
      const a = Math.PI * (0.02 + 0.96 * i / n), rad = i % 2 ? R : R * depth;
      list.push([100 - Math.cos(a) * rad * 1.1, cy + Math.sin(a) * rad]);
    }
    return poly(list, color);
  };
  const maneOuter = ruff > 0 ? mane(r * 0.92 + 12 * ruff, 0.64, C.fur) : '';
  const hw = r * (1 + 0.1 * m), hh = r * (0.9 - 0.05 * m);
  const earPts = s => {
    const a = [100 + s * hw * 0.92, hy - hh * 0.36], b = [100 + s * hw * 0.34, hy - hh * 0.9];
    const t = [100 + s * hw * (0.8 + 0.12 * m), hy - hh * 0.96 - ear * (1 - 0.12 * m)];
    return [a, t, b];
  };
  const ears = lr(s => poly(earPts(s), C.fur));
  const cheek = 1.15 + 0.12 * m;
  const headPts = mirror([[100 - hw * 0.5, hy - hh * 0.98], [100 - hw * 0.95, hy - hh * 0.38], [100 - hw * cheek, hy + hh * 0.28],
    [100 - hw * 0.78, hy + hh * 0.42], [100 - hw * (0.98 + 0.06 * m), hy + hh * 0.64], [100 - hw * 0.44, hy + hh * 0.95], [100, hy + hh * 1.08]]);
  const head = poly(headPts, C.fur);

  // ── Details on top ──
  const bodyDetail = `
    ${lr(s => poly([[100 + s * bw * shoulder, top + bh * 0.26], [100 + s * bw * 0.56, top + bh * 0.16], [100 + s * bw * 0.56, 186], [100 + s * bw * (0.95 - 0.17 * m), 186]], C.shade, 'opacity="0.55"'))}
    ${lr(s => poly([[100 + s * bw * sh, top], [100 + s * bw * shoulder, top + bh * 0.26], [100 + s * bw * 0.6, top + bh * 0.12]], C.dark, `opacity="${0.45 + 0.35 * m}"`))}
    ${poly([[100 - bw * 0.45, top + bh * 0.05], [100 + bw * 0.45, top + bh * 0.05], [100 + bw * 0.22, top + bh * 0.5], [100, top + bh * 0.92], [100 - bw * 0.22, top + bh * 0.5]], C.cream)}
    ${lr(s => `<rect x="${legX(s) - lw * 0.2}" y="${top + bh * 0.62}" width="${lw * 0.4}" height="${186 - (top + bh * 0.62) - 5}" fill="${C.cream}" opacity="${0.6 - 0.35 * m}"/>
      ${poly([[legX(s) - lw * 0.8, 186], [legX(s) - lw * 0.62, 181], [legX(s) + lw * 0.62, 181], [legX(s) + lw * 0.8, 186]], C.cream)}
      <path d="M ${legX(s) - lw * 0.25} 182 v 4 M ${legX(s) + lw * 0.25} 182 v 4" stroke="${C.dark}" stroke-width="1.3" opacity="0.6"/>`)}
    ${poly([T, [100 + bw * 1.38, 181], [100 + bw * 1.38, 170 - bh * 0.12]], C.dark)}${legEdges}`;
  const maneInner = ruff > 0 ? mane(r * 0.72 + 8 * ruff, 0.66, C.cream) + mane(r * 0.92 + 12 * ruff, 0.9, C.dark, 8).replace('<polygon', '<polygon opacity="0.25"') : '';
  const earDetail = lr(s => {
    const [a, t, b] = earPts(s), c = [(a[0] + b[0] + t[0]) / 3, (a[1] + b[1] + t[1]) / 3];
    return poly([a, t, b].map(p => [c[0] + (p[0] - c[0]) * 0.5, c[1] + (p[1] - c[1]) * 0.5]), C.inner);
  });
  const mw = r * (0.36 + 0.07 * m) * muz, nw = r * (0.15 + 0.05 * m);
  const face = `
    ${lr(s => poly([[100 + s * hw * 0.95, hy - hh * 0.38], [100 + s * hw * 0.45, hy - hh * 0.12], [100 + s * hw * cheek, hy + hh * 0.28]], C.shade, 'opacity="0.55"'))}
    ${poly([[100, hy - hh * 0.98], [100 - hw * (0.2 + 0.06 * m), hy - hh * 0.42], [100, hy + hh * 0.12], [100 + hw * (0.2 + 0.06 * m), hy - hh * 0.42]], C.dark, `opacity="${0.6 + 0.3 * m}"`)}
    ${poly(mirror([[100 - hw * 0.82, hy + hh * 0.12], [100 - hw * 0.32, hy + hh * 0.02], [100, hy + hh * 0.22]]).concat([[100 + hw * 0.62, hy + hh * 0.74], [100, hy + hh * 1.02], [100 - hw * 0.62, hy + hh * 0.74]]), C.cream)}
    ${lr(s => poly([[100 + s * (ex - er * 0.2), hy - r * 0.36], [100 + s * (ex + er * 0.9), hy - r * 0.4], [100 + s * (ex + er * 0.4), hy - r * 0.28]], C.cream, `opacity="${1 - 0.7 * m}"`))}
    ${poly([[100 - mw * 0.62, hy + r * 0.12], [100 + mw * 0.62, hy + r * 0.12], [100 + mw, hy + r * 0.5], [100 + mw * 0.55, hy + r * 0.66], [100 - mw * 0.55, hy + r * 0.66], [100 - mw, hy + r * 0.5]], silhouette ? C.cream : '#f9fbfd')}`;
  const nose = `${poly([[100 - nw, hy + r * 0.18], [100 + nw, hy + r * 0.18], [100 + nw * 0.55, hy + r * 0.34], [100, hy + r * 0.41], [100 - nw * 0.55, hy + r * 0.34]], '#141a26')}
    <path d="M ${100 - nw * 0.6} ${hy + r * 0.22} L ${100 - nw * 0.1} ${hy + r * 0.21}" stroke="#fff" stroke-width="1.6" opacity="0.5" stroke-linecap="round"/>`;

  const line = `stroke="${silhouette ? C.line : '#141a26'}" stroke-width="${Math.max(2, r * 0.07)}" stroke-linecap="round" stroke-linejoin="round" fill="none"`;
  // Brows: sharp navy wedges, low at the nose and high at the temples.
  const brows = (lift = 0) => m <= 0.15 ? '' : lr(s => poly([
    [100 + s * (ex - er * 1.2), ey - er * (0.95 + lift)], [100 + s * (ex + er * 1.5), ey - er * (1.55 + lift)],
    [100 + s * (ex + er * 1.3), ey - er * (2.1 + lift)], [100 + s * (ex - er * 1.1), ey - er * (1.4 + lift)]], C.dark, `opacity="${0.5 + 0.5 * m}"`));
  let eyes, mouth;
  const openEyes = (squint = 1) => (m < 0.35
    // pups: round and bright
    ? lr(s => `<ellipse cx="${100 + s * ex}" cy="${ey}" rx="${er * 0.9}" ry="${er * squint * 0.95}" fill="${C.eyes}" stroke="#141a26" stroke-width="1.5"/>
      <circle cx="${100 + s * ex}" cy="${ey + er * 0.05}" r="${er * 0.48 * Math.min(1, squint + 0.2)}" fill="#141a26"/>
      <circle cx="${100 + s * ex - er * 0.28}" cy="${ey - er * 0.25}" r="${er * 0.24}" fill="#fff"/>`)
    // grown: narrow almond eyes, outer corners lifted
    : lr(s => {
      const i = [100 + s * (ex - er * 1.2), ey + er * 0.18], o = [100 + s * (ex + er * 1.3), ey - er * 0.4];
      return `<path d="M ${i} Q ${100 + s * ex} ${ey - er * 1.3 * squint} ${o} Q ${100 + s * ex} ${ey + er * 0.95 * squint} ${i} Z" fill="${C.eyes}" stroke="#141a26" stroke-width="${1.6 + 0.8 * m}" stroke-linejoin="round"/>
        <circle cx="${100 + s * ex}" cy="${ey - er * 0.08}" r="${er * 0.46 * Math.min(1, squint + 0.2)}" fill="#141a26"/>
        <circle cx="${100 + s * ex - er * 0.2}" cy="${ey - er * 0.3}" r="${er * 0.14}" fill="#fff"/>`;
    })) + brows();
  const closed = (down = true) => lr(s => `<path d="M ${100 + s * ex - er} ${ey} Q ${100 + s * ex} ${ey + (down ? 1 : -1) * er * 0.9} ${100 + s * ex + er} ${ey}" ${line}/>`) + brows(down ? 0 : 0.4);
  // A pup's "w" smile flattens into a calm, confident line as he grows.
  const sd = 0.11 - 0.08 * m, sw = 0.17 + 0.06 * m;
  const smile = `<path d="M 100 ${hy + r * 0.41} L 100 ${my}" ${line}/><path d="M ${100 - r * sw} ${my - r * (0.02 + 0.04 * m)} Q ${100 - r * sw * 0.5} ${my + r * sd} 100 ${my} Q ${100 + r * sw * 0.5} ${my + r * sd} ${100 + r * sw} ${my - r * (0.02 + 0.04 * m)}" ${line}/>`;
  switch (mood) {
    case 'excited':
      eyes = closed(false);
      mouth = `<path d="M 100 ${hy + r * 0.41} L 100 ${my - r * 0.02}" ${line}/><path d="M ${100 - r * 0.22} ${my - r * 0.04} L 100 ${my + r * 0.34} L ${100 + r * 0.22} ${my - r * 0.04} Z" fill="#4a1622" stroke="#141a26" stroke-width="1.5" stroke-linejoin="round"/><path d="M ${100 - r * 0.1} ${my + r * 0.12} L 100 ${my + r * 0.26} L ${100 + r * 0.1} ${my + r * 0.12} Z" fill="#e85d6f"/>`;
      break;
    case 'focus':
      eyes = openEyes(0.72);
      mouth = `<path d="M 100 ${hy + r * 0.41} L 100 ${my}" ${line}/><path d="M ${100 - r * 0.12} ${my + r * 0.02} L ${100 + r * 0.12} ${my + r * 0.02}" ${line}/>`;
      break;
    case 'oops':
      eyes = lr(s => `<path d="M ${100 + s * ex - s * er} ${ey - er * 0.7} L ${100 + s * ex + s * er * 0.6} ${ey} L ${100 + s * ex - s * er} ${ey + er * 0.7}" ${line}/>`);
      mouth = `<path d="M ${100 - r * 0.17} ${my + r * 0.06} l ${r * 0.085} ${-r * 0.06} l ${r * 0.085} ${r * 0.06} l ${r * 0.085} ${-r * 0.06} l ${r * 0.085} ${r * 0.06}" ${line}/>`;
      break;
    case 'sleepy':
      eyes = closed(true);
      mouth = `<path d="M ${100 - r * 0.08} ${my + r * 0.04} L ${100 + r * 0.08} ${my + r * 0.04}" ${line}/>`;
      break;
    case 'howl':
      eyes = closed(true);
      mouth = `<polygon points="${pts([[100 - r * 0.1, my - r * 0.05], [100 + r * 0.1, my - r * 0.05], [100 + r * 0.06, my + r * 0.18], [100 - r * 0.06, my + r * 0.18]])}" fill="#4a1622" stroke="#141a26" stroke-width="1.5" stroke-linejoin="round"/>`;
      break;
    default:
      eyes = openEyes();
      mouth = smile;
  }
  // Wolf pups are born with their eyes shut; the newborn keeps them closed.
  if (stage === 0 && (mood === 'happy' || mood === 'focus')) eyes = closed(true);

  // ── Gear ──
  const neckGear = {
    bandana: `<path d="M ${100 - r * 0.64} ${ny - 5} L ${100 + r * 0.64} ${ny - 5} L 100 ${ny + r * 0.62} Z" fill="#5b2a8c" stroke="#141a26" stroke-width="2.5" stroke-linejoin="round"/><path d="M ${100 - r * 0.44} ${ny + 2} L ${100 + r * 0.44} ${ny + 2}" stroke="#ffc62f" stroke-width="2.5"/><circle cx="100" cy="${ny + r * 0.25}" r="2.4" fill="#ffc62f"/>`,
    scarf: `<rect x="${100 - r * 0.74}" y="${ny - 7}" width="${r * 1.48}" height="12" rx="3" fill="#c73e3e" stroke="#141a26" stroke-width="2"/><path d="M ${100 - r * 0.5} ${ny - 6} v 10 M ${100 - r * 0.1} ${ny - 6} v 10 M ${100 + r * 0.3} ${ny - 6} v 10" stroke="#f4f0e8" stroke-width="3"/><rect x="${100 + r * 0.28}" y="${ny}" width="11" height="${r * 0.85}" rx="2" fill="#c73e3e" stroke="#141a26" stroke-width="2" transform="rotate(-8 ${100 + r * 0.28} ${ny})"/>`,
    medal: `<path d="M ${100 - r * 0.42} ${ny - 6} L 100 ${ny + r * 0.62} L ${100 + r * 0.42} ${ny - 6}" stroke="#3c638f" stroke-width="5" fill="none" stroke-linejoin="round"/><circle cx="100" cy="${ny + r * 0.72}" r="10" fill="#f4c542" stroke="#141a26" stroke-width="2"/><path d="M 100 ${ny + r * 0.72 - 5} l 1.6 3.4 3.7 .5 -2.7 2.6 .6 3.7 -3.2 -1.8 -3.2 1.8 .6 -3.7 -2.7 -2.6 3.7 -.5 Z" fill="#fff7d6"/>`,
  }[gear.neck] || '';
  const eyeGear = {
    shades: `${lr(s => `<polygon points="${pts([[100 + s * (ex - er * 1.5), ey - er * 0.9], [100 + s * (ex + er * 1.6), ey - er * 1.2], [100 + s * (ex + er * 1.3), ey + er * 0.8], [100 + s * (ex - er * 1.3), ey + er * 0.9]])}" fill="#0e1119" stroke="#0e1119" stroke-width="2" stroke-linejoin="round"/>`)}<path d="M ${100 - ex + er * 1.4} ${ey - er * 0.5} L ${100 + ex - er * 1.4} ${ey - er * 0.5}" stroke="#0e1119" stroke-width="3"/><path d="M ${100 - ex - er * 0.9} ${ey - er * 0.5} l ${er * 0.7} ${-er * 0.2}" stroke="#fff" stroke-width="2" opacity="0.6" stroke-linecap="round"/>`,
    visor: `<polygon points="${pts([[100 - ex - er * 1.7, ey - er * 0.9], [100 + ex + er * 1.7, ey - er * 0.9], [100 + ex + er * 1.4, ey + er * 1.0], [100 - ex - er * 1.4, ey + er * 1.0]])}" fill="#4cc9f0" opacity="0.55" stroke="#8fe3ff" stroke-width="2" stroke-linejoin="round"/>${lr(s => `<circle cx="${100 + s * ex}" cy="${ey}" r="${er * 0.35}" fill="#e8fbff"/>`)}`,
  }[gear.eyes] || '';
  const crownY = hy - r * 0.8;
  const headGear = {
    cap: `<path d="M ${100 - r * 0.74} ${hy - r * 0.44} Q 100 ${hy - r * 1.42} ${100 + r * 0.74} ${hy - r * 0.44} Z" fill="#f7f7f2" stroke="#141a26" stroke-width="2"/><path d="M ${100 - r * 0.98} ${hy - r * 0.42} L ${100 + r * 0.74} ${hy - r * 0.48} L ${100 + r * 0.6} ${hy - r * 0.32} L ${100 - r * 0.9} ${hy - r * 0.3} Z" fill="#2f6b52" stroke="#141a26" stroke-width="2" stroke-linejoin="round"/><circle cx="100" cy="${hy - r * 1.07}" r="3" fill="#2f6b52"/><circle cx="100" cy="${hy - r * 0.74}" r="${r * 0.12}" fill="#ffd166"/>`,
    helmet: `${lr(s => `<path d="M ${100 + s * r * 0.62} ${hy - r * 0.64} Q ${100 + s * r * 1.32} ${hy - r * 0.72} ${100 + s * r * 1.22} ${hy - r * 1.44} Q ${100 + s * r * 1.06} ${hy - r * 0.98} ${100 + s * r * 0.58} ${hy - r * 0.9} Z" fill="#f1e7cf" stroke="#141a26" stroke-width="2" stroke-linejoin="round"/>`)}<path d="M ${100 - r * 0.8} ${hy - r * 0.4} Q 100 ${hy - r * 1.52} ${100 + r * 0.8} ${hy - r * 0.4} Z" fill="#9aa3b2" stroke="#141a26" stroke-width="2.5"/><rect x="${100 - r * 0.84}" y="${hy - r * 0.52}" width="${r * 1.68}" height="${r * 0.2}" fill="#c9a227" stroke="#141a26" stroke-width="2"/><path d="M 100 ${hy - r * 1.12} V ${hy - r * 0.52}" stroke="#141a26" stroke-width="3"/>`,
    flowers: Array.from({ length: 7 }, (_, i) => {
      const a = Math.PI * (1.12 + 0.76 * i / 6), fx = 100 + Math.cos(a) * r * 0.9, fy = hy + Math.sin(a) * r * 0.86;
      const col = ['#ff9fc0', '#ffd166', '#ffffff', '#b9a7ff'][i % 4];
      return `<ellipse cx="${fx + 5}" cy="${fy + 3}" rx="5" ry="2.6" fill="#2f6b52" transform="rotate(30 ${fx} ${fy})"/>${[0, 72, 144, 216, 288].map(d => `<circle cx="${fx + Math.cos(d * Math.PI / 180) * 3.4}" cy="${fy + Math.sin(d * Math.PI / 180) * 3.4}" r="2.8" fill="${col}"/>`).join('')}<circle cx="${fx}" cy="${fy}" r="2" fill="#f4a261"/>`;
    }).join(''),
    grad: `<path d="M ${100 - r * 0.58} ${hy - r * 0.64} L ${100 - r * 0.58} ${hy - r * 0.9} L ${100 + r * 0.58} ${hy - r * 0.9} L ${100 + r * 0.58} ${hy - r * 0.64} Z" fill="#23232e" stroke="#141a26" stroke-width="2"/><polygon points="${100 - r * 1.04},${hy - r * 1} 100,${hy - r * 1.3} ${100 + r * 1.04},${hy - r * 1} 100,${hy - r * 0.72}" fill="#2d2d3a" stroke="#141a26" stroke-width="2"/><path d="M 100 ${hy - r * 1.01} L ${100 + r * 0.82} ${hy - r * 0.94} L ${100 + r * 0.86} ${hy - r * 0.46}" stroke="#ffd166" stroke-width="2" fill="none"/><circle cx="${100 + r * 0.86}" cy="${hy - r * 0.43}" r="3.2" fill="#ffd166"/>`,
    crown: `<path d="M ${100 - r * 0.6} ${crownY + 2} L ${100 - r * 0.66} ${crownY - r * 0.52} L ${100 - r * 0.3} ${crownY - r * 0.22} L 100 ${crownY - r * 0.62} L ${100 + r * 0.3} ${crownY - r * 0.22} L ${100 + r * 0.66} ${crownY - r * 0.52} L ${100 + r * 0.6} ${crownY + 2} Z" fill="#f4c542" stroke="#141a26" stroke-width="2" stroke-linejoin="round"/>${[-0.4, 0, 0.4].map((d, i) => `<circle cx="${100 + d * r}" cy="${crownY - r * 0.06}" r="3" fill="${['#ef476f', '#4cc9f0', '#52b788'][i]}"/>`).join('')}`,
  }[gear.head] || '';

  // Little extras that go with a mood
  const extras = {
    sleepy: `<text x="${100 + r * 0.9}" y="${hy - r * 0.9}" class="wolf-z" font-size="${r * 0.42}">z</text><text x="${100 + r * 1.2}" y="${hy - r * 1.3}" class="wolf-z" font-size="${r * 0.56}">Z</text>`,
    oops: `<path d="M ${100 + r * 0.95} ${hy - r * 0.55} q -5 8 0 10 q 5 -2 0 -10 Z" fill="#8fe3ff"/>`,
    excited: `${[[-1.25, -0.9], [1.2, -1.05], [1.35, -0.2]].map(([a, b]) => `<path d="M ${100 + a * r} ${hy + b * r - 5} l 1.5 3.5 3.5 1.5 -3.5 1.5 -1.5 3.5 -1.5 -3.5 -3.5 -1.5 3.5 -1.5 Z" fill="#ffd166"/>`).join('')}`,
    howl: `<text x="${100 + r * 0.55}" y="${hy - r * 1.25}" class="wolf-awoo" font-size="${r * 0.36}">Awoo!</text>`,
  }[mood] || '';

  // Alpha and Legend stand inside a crest, chin up, like a team emblem.
  const top2 = stage >= WOLF_ALPHA && !silhouette;
  const crest = top2 ? `<circle cx="100" cy="104" r="93" fill="none" stroke="#141a26" stroke-width="7"/><circle cx="100" cy="104" r="88" fill="none" stroke="${C.inner}" stroke-width="3"/>
    ${[-0.42, -0.21, 0, 0.21, 0.42].map((d, i) => { const a = -Math.PI / 2 + d, x = 100 + Math.cos(a) * 88, y = 104 + Math.sin(a) * 88, s = i === 2 ? 6 : 4;
      return `<path d="M ${x} ${y - s} L ${x + s * 0.3} ${y - s * 0.3} L ${x + s} ${y} L ${x + s * 0.3} ${y + s * 0.3} L ${x} ${y + s} L ${x - s * 0.3} ${y + s * 0.3} L ${x - s} ${y} L ${x - s * 0.3} ${y - s * 0.3} Z" fill="#f4f7fa"/>`; }).join('')}` : '';
  const glow = stage === WOLF_LEGEND && !silhouette ? `<circle cx="100" cy="${hy + 20}" r="92" fill="url(#${id}-glow)"/>` : '';
  const headTilt = mood === 'howl' ? `rotate(-16 100 ${hy + r * 0.6})` : top2 && mood !== 'sleepy' ? `rotate(-5 100 ${hy + r * 0.6})` : '';
  const outline = `<g class="wolf-ol" style="--wl:${C.line};--ow:${(5 + 2.5 * m).toFixed(1)}px">${tail}${haunches}${body}${legs}${maneOuter}</g>`;
  const headOutline = `<g class="wolf-ol" style="--wl:${C.line};--ow:${(5 + 2.5 * m).toFixed(1)}px">${ears}${head}</g>`;

  return `<svg class="wolf mood-${mood} ${cls}" viewBox="0 -22 200 212" role="img" aria-label="${silhouette ? 'A stage still to come' : `${WOLF_STAGES[stage].name}, feeling ${mood}`}">
    <defs>
      <clipPath id="${id}-clip"><rect x="0" y="-22" width="200" height="212" rx="26"/></clipPath>
      <radialGradient id="${id}-glow"><stop offset="0" stop-color="#ffe9a8" stop-opacity="0.55"/><stop offset="1" stop-color="#ffe9a8" stop-opacity="0"/></radialGradient>
    </defs>
    ${scene ? `<g clip-path="url(#${id}-clip)">${sceneSVG(scene, id)}</g>` : ''}
    ${glow}${crest}
    <ellipse cx="100" cy="187" rx="${bw * 1.3}" ry="6" fill="#000" opacity="0.25"/>
    <g class="wolf-body">${outline}${tail}${haunches}${body}${legs}${bodyDetail}${maneOuter}${maneInner}${neckGear}</g>
    <g class="wolf-head" transform="${headTilt}">${headOutline}${ears}${earDetail}${head}${face}${eyes}${nose}${mouth}${silhouette ? '' : eyeGear + headGear}</g>
    ${silhouette ? '' : extras}
  </svg>`;
}

// Backgrounds, drawn in the same box (y from -22 to 190).
function sceneSVG(scene, id) {
  const sky = (a, b) => `<defs><linearGradient id="${id}-sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${a}"/><stop offset="1" stop-color="${b}"/></linearGradient></defs><rect x="0" y="-22" width="200" height="212" fill="url(#${id}-sky)"/>`;
  const pines = (y, color, scale = 1) => [12, 40, 160, 188, 64, 138].map((x, i) => {
    const h = (48 + (i % 3) * 14) * scale;
    return `<polygon points="${x - 16 * scale},${y} ${x},${y - h} ${x + 16 * scale},${y}" fill="${color}"/>`;
  }).join('');
  switch (scene) {
    case 'pines':
      return sky('#1b2a4a', '#3b5878') + `<circle cx="150" cy="18" r="16" fill="#f3ecd2"/>` + pines(150, '#1f3b33') + pines(168, '#183029', 1.2)
        + `<rect x="0" y="160" width="200" height="30" fill="#dfe8ee"/>`;
    case 'lake':
      return sky('#f4a261', '#8f5fa8') + `<circle cx="100" cy="118" r="30" fill="#ffd166"/><rect x="0" y="118" width="200" height="72" fill="#2f5f8f"/>`
        + [128, 138, 150].map((y, i) => `<path d="M ${30 + i * 20} ${y} h ${60 - i * 6}" stroke="#ffd166" stroke-width="2" opacity="${0.6 - i * 0.15}"/>`).join('')
        + `<rect x="0" y="164" width="200" height="26" fill="#6b5a4e"/><ellipse cx="22" cy="166" rx="26" ry="10" fill="#5a4b41"/><ellipse cx="182" cy="168" rx="24" ry="9" fill="#5a4b41"/>`;
    case 'green':
      return sky('#7cc4f0', '#cfeaf7') + `<path d="M 0 130 Q 60 105 120 125 T 200 118 V 190 H 0 Z" fill="#4caf6e"/><path d="M 0 150 Q 80 135 200 150 V 190 H 0 Z" fill="#3f9a5f"/>`
        + `<path d="M 165 148 V 98" stroke="#eee" stroke-width="2"/><path d="M 165 98 l 18 6 -18 6 Z" fill="#ef476f"/><ellipse cx="165" cy="149" rx="5" ry="2" fill="#1d2b22"/>`;
    case 'stadium':
      return sky('#2a1245', '#5b2a8c') + [18, 40, 62].map((y, i) => `<rect x="0" y="${y + 40}" width="200" height="14" fill="${i % 2 ? '#ffc62f' : '#7a3fb8'}" opacity="0.85"/>`).join('')
        + [20, 180].map(x => `<rect x="${x - 3}" y="-10" width="6" height="56" fill="#3b2a55"/><rect x="${x - 14}" y="-16" width="28" height="12" rx="3" fill="#fff6c9"/>`).join('')
        + `<rect x="0" y="150" width="200" height="40" fill="#2f7a4e"/><path d="M 0 165 H 200" stroke="#fff" stroke-width="2" opacity="0.7"/>`;
    case 'aurora':
      return sky('#07101f', '#1a2747') + Array.from({ length: 26 }, (_, i) => `<circle cx="${(i * 73) % 200}" cy="${-15 + (i * 37) % 110}" r="${i % 3 ? 0.9 : 1.5}" fill="#fff" opacity="0.8"/>`).join('')
        + `<path d="M -10 40 C 40 0, 80 70, 130 20 S 190 30, 210 5" stroke="#5ee6a8" stroke-width="22" fill="none" opacity="0.35"/><path d="M -10 62 C 50 25, 90 85, 140 45 S 200 50, 210 30" stroke="#b07cff" stroke-width="16" fill="none" opacity="0.3"/>`
        + pines(160, '#0e1a22') + `<rect x="0" y="158" width="200" height="32" fill="#d6e2f0" opacity="0.85"/>`;
    default:   // the den
      return `<rect x="0" y="-22" width="200" height="212" fill="#3b2f2a"/><ellipse cx="100" cy="150" rx="118" ry="140" fill="#2a211d"/><ellipse cx="100" cy="160" rx="92" ry="112" fill="#4a3a32"/>`
        + `<rect x="0" y="168" width="200" height="22" fill="#5a4636"/>` + [[24, 176, '#d9822b'], [60, 182, '#b5562a'], [150, 178, '#e0a03a'], [178, 184, '#c4632b'], [110, 185, '#d9822b']]
          .map(([x, y, c]) => `<ellipse cx="${x}" cy="${y}" rx="7" ry="3.5" fill="${c}" transform="rotate(${x % 50 - 25} ${x} ${y})"/>`).join('');
  }
}

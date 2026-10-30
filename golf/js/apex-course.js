// Golf Improvement App — Apex: an original 18-hole virtual course through jungle ruins.
// Classic script: shares globals with the other files; load order is set in golf-improvement-app.html.

// ════════════════════════════════════════════════════════════
// APEX · Par 72
// Each hole is authored along its centerline, measured from the Jaguar
// (back) tee: segments are [length, turn°] (+ = bends right). Features are
// placed by distance along the hole (s) and side offset (+ = right), yards.
//   fairways  [s0, s1, halfWidth?, side?]     bunkers/ponds/trees/ruins [s, side, rx, ry]
//   ravines   [s0, s1, halfWidth?] (forced carries)   canopies [s, side, rx, ry, bottomFt, topFt]
//   island    [rx, ry] water ring around the green     falseFront { depth, back }
//   elev      { climb, greenRise, teeRise, roll } in feet (see ceBuildElevation)
// ════════════════════════════════════════════════════════════
const APEX_TEES = {
  jaguar: { name: 'Jaguar', color: '#1a1a1a', rating: 79.8, slope: 155 },
  temple: { name: 'Temple', color: '#2b6cb0', rating: 74.6, slope: 143 },
  canopy: { name: 'Canopy', color: '#c7a008', rating: 70.2, slope: 130 },
};

const APEX_HOLES = [
  { n: 1, name: 'Jungle Gate', par: 4, elev: { roll: 3, teeRise: 4 }, yards: { jaguar: 430, temple: 385, canopy: 350 },
    note: 'A gentle opener. Two great trees form a gate in front of the tee — thread the drive between them.',
    segments: [[250, 0], [180, 6]],
    fairways: [[205, 400]], bunkers: [[255, -24, 9, 6], [405, 20, 7, 5]],
    trees: [[120, -40, 15, 10], [120, 40, 15, 10]] },

  { n: 2, name: 'Serpent Creek', par: 4, elev: { roll: 3 }, yards: { jaguar: 455, temple: 410, canopy: 350 },
    note: 'A creek snakes down the left as the hole bends right. Bail out right, not left.',
    segments: [[240, 0], [215, 14]],
    fairways: [[200, 425, 16]], bunkers: [[295, 24, 8, 6], [448, -19, 7, 5]],
    creeks: [{ pts: [[80, -24], [160, -30], [240, -22], [330, -27], [420, -24], [470, -20]], half: 5 }] },

  { n: 3, name: "Howler's Ledge", par: 3, elev: { teeRise: 12, greenRise: 6 }, yards: { jaguar: 215, temple: 175, canopy: 140 },
    note: 'The green sits on a stone ledge above a ravine. Come up short and the false front sends you back down.',
    segments: [[215, 0]], rough: 30,
    ravines: [[25, 185]], falseFront: { depth: 7, back: 12 }, bunkers: [[226, -15, 6, 5]] },

  { n: 4, name: 'The Long March', par: 5, elev: { roll: 4 }, yards: { jaguar: 720, temple: 590, canopy: 530 },
    note: 'A monster across two raised platform fairways. From the Jaguar tee the first ravine needs a 280-yard carry — or lay up short of it.',
    segments: [[300, 0], [220, -10], [200, 8]],
    fairways: [[120, 228], [282, 465, 18], [522, 705, 16]], ravines: [[230, 280], [468, 520]],
    bunkers: [[600, 22, 9, 6], [712, -18, 8, 6]] },

  { n: 5, name: 'Punch Bowl', par: 4, elev: { roll: 3, greenRise: -6 }, yards: { jaguar: 410, temple: 360, canopy: 330 },
    note: 'A canopy hangs over the approach 65 yards short of the green. Punch under it, or go very high over it.',
    segments: [[260, 0], [150, -8]],
    fairways: [[190, 395, 18]], canopies: [[345, 0, 34, 16, 35, 90]], bunkers: [[402, 18, 7, 5], [404, -18, 7, 5]] },

  { n: 6, name: 'Sacrificial Well', par: 3, elev: { teeRise: 8 }, yards: { jaguar: 165, temple: 140, canopy: 115 },
    note: 'An island green in a flooded cenote. There is nowhere to miss.',
    segments: [[165, 0]], green: [13, 11], island: [34, 30] },

  { n: 7, name: 'Vine Alley', par: 4, elev: { roll: 2 }, yards: { jaguar: 475, temple: 420, canopy: 360 },
    note: 'Vines hang over the corridor from 45 to 110 feet. Keep the drive low — a punch off the tee is the play.',
    segments: [[475, 0]], rough: 24,
    fairways: [[190, 460, 13]], canopies: [[105, 0, 30, 42, 45, 110]], bunkers: [[468, 16, 7, 5]] },

  { n: 8, name: 'Platform Dogleg', par: 5, elev: { roll: 3 }, yards: { jaguar: 610, temple: 520, canopy: 470 },
    note: 'A raised platform fairway sits at the corner above a ravine. Cutting the corner means flying the jungle.',
    segments: [[280, 0], [330, -35]],
    fairways: [[248, 318, 20], [345, 595, 16]], ravines: [[205, 342]], trees: [[300, -60, 42, 40]],
    bunkers: [[600, 18, 8, 6], [470, -22, 9, 6]] },

  { n: 9, name: 'Temple Steps', par: 4, elev: { roll: 2, climb: 18, greenRise: 10 }, yards: { jaguar: 440, temple: 395, canopy: 340 },
    note: 'Uphill to a green on the temple terrace, guarded by stone steps. The tiered front throws short shots well back.',
    segments: [[250, 0], [190, 4]],
    fairways: [[200, 405]], falseFront: { depth: 9, back: 15 },
    bunkers: [[422, -21, 6, 5], [425, 21, 6, 5]], ruins: [[380, -42, 14, 10], [380, 42, 14, 10]] },

  { n: 10, name: "Toucan's Rest", par: 4, elev: { roll: 3, greenRise: 4 }, yards: { jaguar: 360, temple: 320, canopy: 270 },
    note: 'A short dogleg right. A canopy hangs 40 yards short of the green — go under it low, or over it high.',
    segments: [[230, 0], [130, 25]],
    fairways: [[180, 328, 18]], trees: [[262, 44, 34, 30]], canopies: [[318, -4, 22, 12, 35, 70]], bunkers: [[368, -16, 6, 5]] },

  { n: 11, name: 'River of Stones', par: 5, elev: { roll: 3, teeRise: 6 }, yards: { jaguar: 705, temple: 585, canopy: 505 },
    note: 'A forced carry over the river from the tee — 230 yards from the Jaguar tee. Then a long, winding march home.',
    segments: [[300, 0], [230, 10], [175, -6]],
    fairways: [[232, 690, 17]], ravines: [[40, 230]],
    bunkers: [[420, -24, 9, 6], [560, 24, 9, 6], [698, 17, 7, 5]] },

  { n: 12, name: 'Eclipse', par: 3, elev: { teeRise: 15 }, yards: { jaguar: 240, temple: 190, canopy: 150 },
    note: 'A long iron over a dark ravine. There is a little room short of the green — but only a little.',
    segments: [[240, 0]], ravines: [[30, 205]], green: [16, 13], bunkers: [[234, -19, 7, 6], [246, 18, 6, 5]] },

  { n: 13, name: 'Ruins Run', par: 4, elev: { roll: 4 }, yards: { jaguar: 465, temple: 410, canopy: 350 },
    note: 'The fairway threads between toppled ruins, and the jungle is tight — out of bounds lurks on both sides.',
    segments: [[465, 0]], rough: 28, jungleRing: 18,
    fairways: [[200, 450, 14]], ruins: [[190, -31, 12, 8], [262, 29, 12, 8], [342, -27, 10, 7]], bunkers: [[458, 16, 6, 5]] },

  { n: 14, name: 'Canopy Cathedral', par: 4, elev: { roll: 2, greenRise: -3 }, yards: { jaguar: 430, temple: 380, canopy: 340 },
    note: 'The green sits under a canopy opening. Approaches must come in low — land short and run it on.',
    segments: [[300, 0], [130, -6]],
    fairways: [[205, 418, 18]], canopies: [[400, 0, 32, 22, 25, 95]], bunkers: [[436, 17, 6, 5]] },

  { n: 15, name: "Jaguar's Leap", par: 4, elev: { teeRise: 10 }, yards: { jaguar: 500, temple: 445, canopy: 370 },
    note: 'A forced carry over a gorge onto a platform fairway. 250 yards from the back — nerve required.',
    segments: [[500, 0]],
    fairways: [[252, 486, 16]], ravines: [[120, 250]], bunkers: [[492, -17, 7, 5], [505, 17, 6, 5]] },

  { n: 16, name: 'Hidden Altar', par: 3, elev: { greenRise: 5 }, yards: { jaguar: 185, temple: 155, canopy: 135 },
    note: 'A canopy hides the green. Hit it high — over 58 feet as it passes the trees.',
    segments: [[185, 0]], canopies: [[125, 0, 24, 10, 6, 58]], ruins: [[203, 0, 10, 4]], bunkers: [[178, 18, 6, 5]] },

  { n: 17, name: 'Cenote', par: 4, elev: { roll: 3 }, yards: { jaguar: 450, temple: 400, canopy: 340 },
    note: 'A sinkhole lake guards the approach front-left. Play right, or carry it.',
    segments: [[270, 0], [180, -12]],
    fairways: [[190, 300, 18], [378, 440, 14]], ponds: [[340, -8, 30, 26]], bunkers: [[452, 18, 7, 5]] },

  { n: 18, name: 'Apex', par: 5, elev: { roll: 2, climb: 12, greenRise: 6 }, yards: { jaguar: 690, temple: 560, canopy: 480 },
    note: 'The climb to the great pyramid. A ravine crosses at 440 — lay up or carry it — then up to a broad summit green with a false front. They say the pyramid returns what is offered to it.',
    segments: [[290, 0], [220, 8], [180, -4]],
    fairways: [[210, 438], [472, 678, 21]], ravines: [[440, 470]], green: [19, 16], falseFront: { depth: 6, back: 10 },
    ruins: [[642, -40, 16, 26], [642, 40, 16, 26]], bunkers: [[600, 20, 8, 6]] },
];

// Built lazily (the geometry needs the course engine)
let APEX = null;
function apexCourse() {
  if (!APEX) APEX = { name: 'Apex', par: 72, tees: APEX_TEES, holes: APEX_HOLES.map(ceBuildHole) };
  return APEX;
}

if (typeof module !== 'undefined') module.exports = { APEX_HOLES, APEX_TEES, apexCourse };

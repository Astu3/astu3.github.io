'use strict';
// ═══════════════════════════════════════════════════════════════════════════
// TypeUp — keyboard layout, finger map, lessons and the word bank
// ═══════════════════════════════════════════════════════════════════════════

// ── Keyboard (US layout) ───────────────────────────────────────────────────
// Each key: [base, shifted, width, label]. Special keys use a name as base.
const KB_ROWS = [
  [['`','~'],['1','!'],['2','@'],['3','#'],['4','$'],['5','%'],['6','^'],['7','&'],['8','*'],['9','('],['0',')'],['-','_'],['=','+'],['Backspace','',2,'⌫']],
  [['Tab','',1.5,'Tab'],['q'],['w'],['e'],['r'],['t'],['y'],['u'],['i'],['o'],['p'],['[','{'],[']','}'],['\\','|',1.5]],
  [['Caps','',1.8,'Caps'],['a'],['s'],['d'],['f'],['g'],['h'],['j'],['k'],['l'],[';',':'],["'",'"'],['Enter','',2.2,'Enter']],
  [['ShiftL','',2.4,'Shift'],['z'],['x'],['c'],['v'],['b'],['n'],['m'],[',','<'],['.','>'],['/','?'],['ShiftR','',2.6,'Shift']],
  [[' ','',7,'']],
];

// Which finger presses each key. l/r = hand; p r m i = pinky ring middle index; th = thumbs.
const FINGER_KEYS = {
  lp: ['`','1','q','a','z','Tab','Caps','ShiftL'],
  lr: ['2','w','s','x'],
  lm: ['3','e','d','c'],
  li: ['4','5','r','t','f','g','v','b'],
  ri: ['6','7','y','u','h','j','n','m'],
  rm: ['8','i','k',','],
  rr: ['9','o','l','.'],
  rp: ['0','-','=','p','[',']','\\',';',"'",'/','Backspace','Enter','ShiftR'],
  th: [' '],
};
const FINGER_OF = {};
for (const [f, keys] of Object.entries(FINGER_KEYS)) keys.forEach(k => { FINGER_OF[k] = f; });

const FINGER_NAMES = {
  lp: 'Left pinky', lr: 'Left ring finger', lm: 'Left middle finger', li: 'Left index finger',
  ri: 'Right index finger', rm: 'Right middle finger', rr: 'Right ring finger', rp: 'Right pinky', th: 'Either thumb',
};
const HOME_KEY = { lp: 'a', lr: 's', lm: 'd', li: 'f', ri: 'j', rm: 'k', rr: 'l', rp: ';' };

const SHIFTED = {};
KB_ROWS.flat().forEach(([base, shift]) => { if (shift) SHIFTED[shift] = base; });

// The physical key for a character, and whether Shift is needed.
function keyFor(ch) {
  if (ch >= 'A' && ch <= 'Z') return { key: ch.toLowerCase(), shift: true };
  if (SHIFTED[ch]) return { key: SHIFTED[ch], shift: true };
  return { key: ch, shift: false };
}
// Shift is pressed by the pinky of the other hand.
function shiftFor(key) {
  const f = FINGER_OF[key] || '';
  return f[0] === 'l' ? 'ShiftR' : 'ShiftL';
}

// ── Lessons ────────────────────────────────────────────────────────────────
// kind: 'letters' (drills + words built from the keys learned so far),
// 'shift' (capitals), 'pool' (sentences written for the lesson).
const UPPER = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
const LESSONS = [
  { id: 1, title: 'Home row', keys: 'asdfjkl;', kind: 'letters',
    tip: 'Rest your left fingers on A S D F and your right fingers on J K L ;. Thumbs rest on the space bar. Feel the little bumps on F and J? They let you find home without looking.' },
  { id: 2, title: 'G and H', keys: 'gh', kind: 'letters',
    tip: 'Your index fingers reach sideways: left index from F over to G, right index from J over to H. Slide back home after every reach.' },
  { id: 3, title: 'E and I', keys: 'ei', kind: 'letters',
    tip: 'Reach straight up with your middle fingers: D up to E, K up to I. Keep the other fingers resting on home.' },
  { id: 4, title: 'R and U', keys: 'ru', kind: 'letters',
    tip: 'Your index fingers reach up: F up to R, J up to U.' },
  { id: 5, title: 'T and O', keys: 'to', kind: 'letters',
    tip: 'T is a stretch up and to the right for your left index finger. O belongs to your right ring finger, straight up from L.' },
  { id: 6, title: 'N and C', keys: 'nc', kind: 'letters',
    tip: 'Reach down: right index from J down to N, left middle from D down to C. Curl the finger; keep your hand still.' },
  { id: 7, title: 'W and Y', keys: 'wy', kind: 'letters',
    tip: 'W is up from S with your left ring finger. Y is a stretch up and to the left for your right index finger.' },
  { id: 8, title: 'M and V', keys: 'mv', kind: 'letters',
    tip: 'Down reaches for both index fingers: J down to M, F down to V.' },
  { id: 9, title: 'B and P', keys: 'bp', kind: 'letters',
    tip: 'B is a long reach down and to the right for your left index finger. P is up from ; with your right pinky.' },
  { id: 10, title: 'Q, X and Z', keys: 'qxz', kind: 'letters',
    tip: 'The last letters! Q and Z belong to your left pinky, up and down from A. X is down from S with your left ring finger.' },
  { id: 11, title: 'Capital letters', keys: UPPER, kind: 'shift',
    tip: 'Use the Shift key on the opposite side. For a capital J, hold Left Shift with your left pinky and tap J. For a capital F, hold Right Shift with your right pinky.' },
  { id: 12, title: 'Period and comma', keys: '.,', kind: 'pool',
    tip: 'The comma is down from K (right middle finger). The period is down from L (right ring finger). Put one space after each.' },
  { id: 13, title: 'More punctuation', keys: '\'"?!-:', kind: 'pool',
    tip: 'Apostrophe is right of ; with your right pinky, and Shift makes it a quote mark. ? is Shift + /. ! is Shift + 1. The hyphen is at the top right, right pinky.' },
  { id: 14, title: 'Numbers 1 to 5', keys: '12345', kind: 'pool',
    tip: 'Numbers are a long reach, so go slowly. Left hand: 1 pinky, 2 ring, 3 middle, 4 and 5 index. Reach up and come right back home.' },
  { id: 15, title: 'Numbers 6 to 0', keys: '67890', kind: 'pool',
    tip: 'Right hand: 6 and 7 index, 8 middle, 9 ring, 0 pinky.' },
];

// A fixed warm-up for the 'pool' lessons; the rest is drawn from POOLS.
const POOL_DRILLS = {
  12: 'k,k l.l k,k l.l ,,, ... k,k l.l yes, no. so, go. a, b, c. stop. go, go, go.',
  13: ";'; ;'; it's it's don't don't ;:; a: b: a-b a-b \"hi\" \"hi\" ok? ok? yes! yes!",
  14: 'a1a s2s d3d f4f f5f a1a s2s d3d f4f f5f 12 34 45 51 123 345 543 21',
  15: 'j6j j7j k8k l9l ;0; j6j j7j k8k l9l ;0; 67 89 90 678 890 1961 2026',
};

const POOLS = {
  12: [
    'The ball is on the green.', 'Keep your head still, then swing.', 'Skol, Vikings.',
    'Breathe in, breathe out.', 'Be patient. Be kind.', 'Read the green, pick a line, and trust it.',
    'AI can help, but you must check its work.', 'The lake was calm, so we fished all day.',
    'Slow down. Smooth is fast.', 'Aim small, miss small.', 'Practice a little, every day.',
    'Say thank you, and mean it.', 'The fans stood, cheered, and sang.', 'Eyes up. Trust your fingers.',
    'Tarkenton ran left, then right, then threw.', 'A good model learns from many examples.',
    'Tell the truth, even when it costs you.', 'The wind was strong, so we hit it low.',
    'Fix the mistake. Then move on.', 'Winter is long in Minnesota, but summer is worth it.',
  ],
  13: [
    "Don't rush it.", 'Is it a birdie? Yes!', 'She said, "Trust your swing."', "It's a well-earned win.",
    'Skol! What a catch!', 'Ask: is it true? Is it kind?', 'Two tips: relax, and breathe.',
    "Who's up next?", "That's a long putt - nice roll!", "Don't look down; feel the keys.",
    '"Patience," he said, "is a skill."', "Can a computer think? Turing wasn't sure.",
    "It's not luck; it's practice.", 'Fore! Heads up!', 'Rule one: play it as it lies.',
    "He's a two-time champ.", 'What would a good person do here?', "We're down by six - keep going!",
    '"Check your work," the coach said.', "Mistakes aren't failures; they're lessons.",
  ],
  14: [
    'Hole 4 is a par 5.', 'We hit 25 balls.', 'He shot 43 on the front side.', 'Take 3 deep breaths.',
    'Par 3, 4, or 5?', 'The 5 iron flew 145 yards.', 'It was 21 to 14 at the half.',
    'You may carry 14 clubs, not 15.', 'Gate 3, row 12, seat 4.', 'Type for 15 minutes.',
    'He made 2 putts and 1 chip.', 'The 1st hole is 345 yards.', 'Look up 1, 2, 3 times. Then stop.',
    'She scored 52 points in 4 games.', 'Rest 5 minutes, then try 2 more.',
  ],
  15: [
    'The Vikings played their first game in 1961.', 'Hole 18 is a par 4.', 'Bud Grant coached for 18 seasons.',
    'Alan Turing asked his famous question in 1950.', 'Deep Blue beat Kasparov in 1997.',
    'AlphaGo won 4 games to 1 in 2016.', 'A score of 79 beats a score of 80.', 'Set a goal of 30 words per minute.',
    'The Old Course went to 18 holes in 1764.', 'He drove it 290 yards.', 'Practice 10 minutes a day for 90 days.',
    'Adrian Peterson ran for 2,097 yards in 2012.', 'Page 68, line 9.', 'The ball must be 1.68 inches across.',
    'Call 911 only in an emergency.', 'There are 60 minutes in an hour.',
  ],
};

// Proper nouns for the capitals lesson.
const NAMES = [
  'Minnesota', 'Vikings', 'Bud Grant', 'Alan Page', 'Randy Moss', 'Fran Tarkenton', 'Cris Carter',
  'Jim Marshall', 'Carl Eller', 'Alan Turing', 'Bobby Jones', 'Jack Nicklaus', 'Duluth', 'Lake Superior',
  'Marcus Aurelius', 'Ben Franklin', 'Twin Cities', 'Saint Paul', 'Minneapolis', 'Scotland', 'Augusta',
  'Grand Marais', 'Red Wing', 'Rochester', 'Moorhead', 'Mankato', 'Kasparov', 'Adrian Peterson',
];

// ── Word bank ──────────────────────────────────────────────────────────────
// Lessons pick words made only from the keys learned so far.
const WORDS = `
a ad add adds ads aid aide ail alas all ask asks dad dads fad fads fall falls flask flasks lad lads lass sad
salad salads sass ash dash flash gas glad glass hall half hash shall slash flag flags has had gal gals lash
ha aha sash hah jag
age aged ages alike eel egg eggs else fee feed feel feels fees field file files fill fish fig figs fake hike
idea ideal ideas idle jail jade kale keg kid kids kiss leaf lead leg legs lie lied lies life like liked lid
lids sea seal seed seek see she shed side sigh silk skid skill skills skied slide sled slid fade dial
deal deals dead deaf desk dish disk heal heel heels held hide high hill hills his if is it die dig
safe sail sale same said shake shade sheaf shelf ski skies jiggle giggle gale glide glides isle
air are area aside dare dear dress drill drag drier fair far fear free fresh friend frill fur gear girl
grade grass grid hair hard hear heard her here hire jar rail raise rake rare read real red ride rides rise
rug rule ruler rules run rush sure surge urge user users dug due fuse guide huge just judge rude sugar
fluid laugh lure liar lure rider ridge share sharp shirt
at ate dot eat fat fit fist foot for fort get goal goat gold golf got great hat heat hit hot it its jot
kit lift light lost lot oak oar oil old other our out rest right road roof root rose sat set shoot shot
sit soft sort start state still stop store street that the their them these this those though three tire
toad toe told too took tool tree true trust total quiet dirt diet doubt
and an can cane cent chance chair chase cheer chest chin chose clean clear close cloth coach coat code
coin cold come corn cost could count course cross dance dine done end enter even fence find fine
fresh friend gain gone grand green ground hand hold hole honest in inch into iron join kind king land
lean learn line lion long need neck new nice night nine noise none north nose not note nothing once
one only own rain ran reach rich round run sand scene since snack snow son song soon stance stand
stone strong such sun tan ten than then thin thing think tone town train turn under unit
lunch hunch inner corner center decide second tennis teach ditch catch chalk
away below bowl brow cow draw few flow grow how know law low new now owl own row saw show slow snow sow
stew straw throw tow town two view war warm was wash way we week well went were west what when where
which while white who whole why wide wild will win wind wing wise wish with word work world worth write
yard yarn yay year yell yes yet you young your yours yourself day eye fly happy key lay may say stay
they try type wary yawn early every every heavy many play ready sorry story study they today twenty
sky shy dry hurry jury lucky
am arm came claim dream farm film form game home maybe me mean meet mind miss mom more most mother
much must my name team time move over save very vote vast give have live love seven river silver
average eleven even ever five forever glove grove heavy invest leave mild model moment motion
move movie never number some summer swim
back bad bag ball band bank base be bear beat became because bed been before begin behind being bell
below best better big bird bit black blade blue board boat body bold bone book born both bottom box
brain brave bread break bright bring broad brown build built burn busy but by cab club bunker birdie bogey
pace pack page paint pair paper par park part pass past path patient peace people perfect pick piece pin
place plan plant play please point pool power practice press proud pull push put putt putter happy hope
help keep kept open plenty pop simple sleep spend spirit sport spot step stop super up upon wrap
quick quiet quit quite quote queen equal squad square squeeze
box exact example exit expert fix fox mix next six tax text wax extra
zero zone zoom lazy maze prize size crazy dozen
`.trim().split(/\s+/).filter((w, i, all) => all.indexOf(w) === i);

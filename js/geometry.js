// גאומטריית הקו: זוויות, הקרנת שבירה, וסוגי הזזה (רק עמידה / 2:1 / 2:2)
export const BP_FT = 40;        // מרחק משוער של השבירה מקו העבירה
export const ARROW_FT = 15;
// החצים בצורת V: חץ 1 (בורד 5) כ-12 רגל מקו העבירה, חץ 4 (בורד 20) הקצה בכ-16 רגל
export const arrowFt = b => 12 + Math.max(0, Math.min(b, 40 - b) - 5) * 4 / 15;
export const POCKET = 17.5;     // הכיס (1-3 לימני / 1-2 לשמאלי)

const r1 = x => Math.round(x * 10) / 10;
const median = a => { if (!a.length) return null; const s = [...a].sort((x, y) => x - y); const m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
const has = v => v !== null && v !== undefined && v !== '' && Number.isFinite(Number(v));

export const arrowNum = b => (b >= 5 && b <= 35 && b % 5 === 0) ? b / 5 : null;
export const arrowLabel = b => !has(b) ? '—' : arrowNum(b) ? `חץ ${arrowNum(b)} (בורד ${b})` : `בורד ${b}`;

// גוף השחקן: דריפט = כמה בורדים רגל ההחלקה זזה מהעמידה לקו העבירה (חיובי = פנימה, לימני שמאלה)
// ballOff = כמה בורדים הכדור משתחרר בצד היד ביחס לרגל ההחלקה
export const bodyCfg = st => ({ drift: Number(st?.drift ?? 2), ballOff: Number(st?.ballOff ?? 5) });
export const finishOf = (s, cfg) => has(s.finish) ? Number(s.finish) : (has(s.stance?.board) ? s.stance.board + cfg.drift : null);
export const releaseOf = (finish, cfg) => finish - cfg.ballOff;

// קו ישר מנקודת השחרור בקו העבירה, דרך החץ, עד אזור השבירה
export function projectBp(release, arrow) {
  const af = arrowFt(arrow);
  return arrow + (arrow - release) * (BP_FT - af) / af;
}

// כיול אישי: כמה בורדים השבירה בפועל שונה מהקו הישר (הכדור מתחיל לפנות, סיבוב, מהירות)
export function calibrate(first, cfg) {
  const d = first.filter(s => has(s.stance?.board) && has(s.arrow) && has(s.bp))
    .map(s => s.bp - projectBp(releaseOf(finishOf(s, cfg), cfg), s.arrow));
  if (d.length < 2) return { offset: 0, n: d.length };
  return { offset: Math.max(-15, Math.min(15, r1(median(d)))), n: d.length };
}

export function geometry(stance, arrow, bp) {
  const g = {};
  if (has(stance) && has(arrow)) g.launch = stance - arrow;       // זווית יציאה: עמידה ← חץ
  if (has(arrow) && has(bp)) g.swing = arrow - bp;                // כמה הכדור יוצא החוצה אחרי החץ
  if (has(bp)) g.hook = r1(POCKET - bp);                          // כמה הכדור פונה מהשבירה לכיס
  if (has(stance) && has(bp)) g.total = stance - bp;
  return g;
}

export const MOVE_INFO = {
  feet: { name: 'רק עמידה', what: 'הרגליים זזות 2, החץ נשאר. הזווית נפתחת (או נסגרת) ב-2 בורדים, והשבירה זזה לכיוון ההפוך מהרגליים.' },
  '21': { name: '2:1', what: 'רגליים 2, חץ 1, לאותו כיוון. השבירה נשארת בערך במקום, אבל הכדור עובר בחלק הקדמי באזור אחר של שמן.' },
  '22': { name: '2:2 מקבילי', what: 'רגליים וחץ זזים 2 בורדים יחד. אותה זווית, וכל הקו (כולל השבירה) זז 2 בורדים.' },
};

// dir: +1 = פנימה (בורד גבוה יותר), -1 = החוצה
// drift: הדריפט שלך בפועל (מניחים שהוא נשאר אותו דבר גם אחרי ההזזה)
export function moveOptions(stance, arrow, drift, dir, offset = 0, cfg = bodyCfg()) {
  if (!has(stance) || !has(arrow)) return [];
  return [['feet', 2, 0], ['21', 2, 1], ['22', 2, 2]].map(([type, ds, da]) => {
    const s = stance + ds * dir, a = arrow + da * dir;
    return { type, name: MOVE_INFO[type].name, stance: s, finish: s + drift, arrow: a, launch: s - a, bp: r1(projectBp(releaseOf(s + drift, cfg), a) + offset) };
  });
}

// בחירת סוג ההזזה לפי סוג הבעיה
// heavy = התגובה עצמה שגויה (ספליטים, ברוקלין, פספוס ראש) → שינוי זווית
// mild = הצורה טובה, רק מגיע קצת גבוה/חלש → הזזה מקבילית
export function chooseMove(kind, heavy) {
  if (kind === 'strong10') return { type: '22', dir: 1, reason: 'הצורה טובה והכדור בכיס, אבל הוא מגיע עם קצת יותר מדי. הזזה מקבילית קטנה פנימה שומרת על הזווית, ומכניסה את הכדור עמוק יותר לשמן כך שהוא מגיע לכיס "רך" יותר.' };
  if (kind === 'weak10') return { type: 'feet', dir: 1, reason: 'ה-10 נשאר כי הכדור נכנס בלי מספיק זווית. הזזת רגליים פנימה כשהחץ נשאר פותחת את הזווית, דוחפת את השבירה החוצה לאזור עם יותר חיכוך, והכדור מגיע לכיס בזווית חדה יותר.' };
  if (kind === 'high') return heavy
    ? { type: '21', dir: 1, reason: 'התגובה חזקה מדי (ספליטים או ברוקלין), לא רק הכיוון. 2:1 פנימה שומר על נקודת השבירה, אבל מעביר את החלק הקדמי של הקו לאזור עם יותר שמן. הכדור שומר אנרגיה ופונה פחות חד.' }
    : { type: '22', dir: 1, reason: 'הצורה של התגובה טובה, הכדור רק מגיע קצת גבוה. הזזה מקבילית שומרת על אותה זווית ומזיזה את כל הקו, כולל השבירה.' };
  return heavy
    ? { type: '21', dir: -1, reason: 'הכדור ממש לא פונה (פספוס ראש או השארות כבדות). 2:1 החוצה מעביר את החלק הקדמי לאזור יבש יותר, והכדור מתחיל להתגלגל מוקדם יותר.' }
    : { type: '22', dir: -1, reason: 'הכדור כמעט שם, רק חסר לו בורד או שניים. הזזה מקבילית החוצה שומרת על הזווית שעבדה ומקרבת את השבירה לאזור היבש.' };
}

// אינדיקציה על המסלול מתוך הזוויות של הזריקות
export function lineRead(first, two = false) {
  const full = first.filter(s => has(s.stance?.board) && has(s.arrow) && has(s.bp));
  if (full.length < 3) return null;
  const gs = full.map(s => ({ ...geometry(s.stance.board, s.arrow, s.bp), x: s.left.length === 0 }));
  const med = (arr, k) => r1(median(arr.map(g => g[k])));
  const strikes = gs.filter(g => g.x), base = strikes.length >= 2 ? strikes : gs;
  const launch = med(base, 'launch'), swing = med(base, 'swing'), hook = med(base, 'hook');
  const notes = [];
  const HI = two ? 14 : 11, LO = two ? 8 : 6;
  if (hook >= HI) notes.push(`הכדור פונה ${hook} בורדים מהשבירה לכיס. יש הרבה חיכוך בסוף המסלול (backend), סימן לתבנית קצרה עד בינונית או למסלול שהתייבש בסוף.`);
  else if (hook <= LO) notes.push(`הכדור פונה רק ${hook} בורדים אחרי השבירה. יש שמן כבד או ארוך, או שהכדור חלש לתנאים. המסלול דורש קו ישר יותר.`);
  else notes.push(`הכדור פונה ${hook} בורדים אחרי השבירה. זו כמות פנייה מאוזנת${two ? ' לשחקן שתי ידיים' : ''}.`);
  if (swing >= 4) notes.push(`הכדור יוצא ${swing} בורדים החוצה אחרי החץ וחוזר. יש "החזקה" (hold) בחוץ, וזה אופייני לשימון ליגה עם יותר שמן במרכז.`);
  else if (swing <= 1) notes.push('הקו מהחץ לשבירה כמעט ישר. אין הרבה מקום החוצה: אולי החוץ יבש ושבור, או שהתבנית שטוחה.');
  if (launch >= 10) notes.push(`זווית יציאה גדולה (${launch} בורדים מהעמידה לחץ). המסלול מאפשר לשחק עמוק פנימה.`);
  else if (launch <= 4) notes.push(`זווית יציאה צרה (${launch} בורדים). משחק כמעט ישר, אופייני לשמן כבד או לתבנית ספורט.`);
  let cmp = null;
  const miss = gs.filter(g => !g.x);
  if (strikes.length >= 2 && miss.length >= 2) {
    const d = r1(median(strikes.map(g => g.launch)) - median(miss.map(g => g.launch)));
    if (Math.abs(d) >= 1.5) cmp = `בסטרייקים הזווית הייתה ${med(strikes, 'launch')} בורדים, ובשאר ${med(miss, 'launch')}. ${d > 0 ? 'המסלול מתגמל זווית פתוחה יותר.' : 'המסלול מתגמל קו ישר יותר.'}`;
  }
  return { launch, swing, hook, notes, cmp, n: full.length, fromStrikes: base === strikes };
}

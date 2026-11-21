// מנוע קריאת מסלול: סטטיסטיקה + תובנות מלמדות (מה ראינו / מה זה אומר / מה לעשות / למה)
import { getDb, ballById, ballStrength, isSplit, lastSanded, gamesSinceSand, recStats } from './store.js';
import { calibrate, moveOptions, chooseMove, lineRead, arrowLabel, MOVE_INFO, bodyCfg, finishOf } from './geometry.js';

const MIRROR = { 1: 1, 2: 3, 3: 2, 4: 6, 5: 5, 6: 4, 7: 10, 8: 9, 9: 8, 10: 7 };
const norm = (pins, hand) => hand === 'L' ? pins.map(p => MIRROR[p]) : pins;

const median = a => { if (!a.length) return null; const s = [...a].sort((x, y) => x - y); const m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
const mean = a => a.length ? a.reduce((x, y) => x + y, 0) / a.length : null;
const std = a => { if (a.length < 2) return 0; const m = mean(a); return Math.sqrt(mean(a.map(x => (x - m) ** 2))); };
const pct = (n, d) => d ? Math.round(n / d * 100) : 0;
const r1 = x => x === null ? null : Math.round(x * 10) / 10;
const nums = (arr, k) => arr.map(s => s[k]).filter(v => v !== null && v !== undefined && v !== '' && !isNaN(v)).map(Number);

// סיווג השארת כדור ראשון (מנורמל ליד ימין)
export function classifyLeave(shot, hand) {
  if (shot.left.length === 0) return 'strike';
  if (shot.quality === 'brooklyn') return 'high';
  if (shot.quality === 'high') return 'high';
  if (shot.quality === 'light') return 'light';
  const L = norm(shot.left, hand);
  const has = p => L.includes(p);
  if (has(1)) return 'head';
  // 10 בודד: ברירת מחדל 10 חלש. "10 חזק" = פין 6 עף חזק מסביב ל-10 (מסמנים ידנית)
  if (L.length === 1 && has(10)) return shot.quality === 'strong10' ? 'strong10' : 'weak10';
  if (L.length === 2 && has(6) && has(10)) return 'weak10';
  if (has(4) && !has(2) && !has(5) && !has(8)) return 'high';
  // 7 בודד לא חד-משמעי: יכול לבוא מכניסה גבוהה או מכניסה שטוחה (פין 4 עף ישר)
  if (L.length === 1 && has(7)) return 'ambig';
  // 7-10 בכיס לא חד-משמעי: מקורות מקשרים אותו גם לכדור חזק שפוגע קצת חלש
  if (has(7) && has(10) && L.length === 2) return 'ambig';
  if (has(2) || has(5) || has(8)) return 'light';
  return 'other';
}

export const LEAVE_LABEL = {
  strike: 'סטרייק', weak10: '10 חלש', strong10: '10 חזק', light: 'כניסה חלשה', high: 'כניסה גבוהה', ambig: '7 (לא חד-משמעי)', head: 'פספוס ראש', other: 'אחר',
};

// זריקה "נקייה" = בוצעה כמו שתוכנן. רק היא נכנסת לקריאת המסלול
// פספוס עם בורד ידוע נחשב נקי לקריאה: אנחנו יודעים בדיוק מה הכדור עשה
export const isClean = s => !s.exec || s.exec === 'ok' || s.actualKnown;

export function laneStats(shots, lane, hand) {
  const firstAll = shots.filter(s => s.shot === 0 && s.lane === lane && s.rack.length === 10);
  const first = firstAll.filter(isClean);
  const spares = shots.filter(s => s.lane === lane && s.rack.length < 10);
  const exec = { in: 0, out: 0, unsure: 0 };
  firstAll.forEach(s => { if (exec[s.exec] !== undefined) exec[s.exec]++; });
  const cats = {};
  first.forEach(s => { const c = classifyLeave(s, hand); cats[c] = (cats[c] || 0) + 1; });
  const leaves = {};
  first.filter(s => s.left.length).forEach(s => { const k = [...s.left].sort((a, b) => a - b).join('-'); leaves[k] = (leaves[k] || 0) + 1; });
  const bps = nums(first, 'bp');
  const allStrikes = firstAll.filter(s => !s.left.length).length;
  return {
    n: firstAll.length, clean: first.length, exec, firstAll,
    onTargetPct: pct(first.length, firstAll.length),
    strikes: allStrikes,
    strikePct: pct(allStrikes, firstAll.length),
    spareN: spares.length,
    sparePct: pct(spares.filter(s => s.left.length === 0).length, spares.length),
    splits: firstAll.filter(s => isSplit(s.left)).length,
    cats, leaves,
    arrow: r1(median(nums(first, 'arrow'))),
    bp: r1(median(bps)), bpStd: r1(std(bps)),
    stance: r1(median(first.map(s => s.stance?.board).filter(Number.isFinite))),
    cm: r1(median(first.map(s => s.stance?.cm).filter(Number.isFinite))),
    speed: r1(median(nums(first, 'speed'))), speedStd: r1(std(nums(first, 'speed'))),
    // דריפט: רק זריקות שבהן סימנת בפועל איפה הרגל סיימה
    drift: r1(median(firstAll.filter(s => s.finishSet && Number.isFinite(s.stance?.board)).map(s => s.finish - s.stance.board))),
    driftStd: r1(std(firstAll.filter(s => s.finishSet && Number.isFinite(s.stance?.board)).map(s => s.finish - s.stance.board))),
    driftN: firstAll.filter(s => s.finishSet).length,
    first,
  };
}

// הערכת אורך שימון לפי כלל ה-31: בורד שבירה ≈ אורך תבנית − 31
export function oilEstimate(st) {
  const bps = nums(st.first, 'bp');
  if (bps.length < 3) return null;
  const s = [...bps].sort((a, b) => a - b);
  const q1 = s[Math.floor(s.length * 0.25)], q3 = s[Math.floor(s.length * 0.75)];
  const len = Math.round(median(bps) + 31);
  const conf = bps.length >= 8 && q3 - q1 <= 3 ? 'גבוה' : bps.length >= 5 && q3 - q1 <= 5 ? 'בינוני' : 'נמוך';
  return { len, lo: Math.round(q1 + 31), hi: Math.round(q3 + 31), conf, n: bps.length };
}

export function oilLabel(len) {
  // חלוקה מקובלת: קצרה עד 35 רגל, בינונית 36-42, ארוכה 43 ומעלה
  if (len <= 35) return 'תבנית קצרה: הכדור יתעורר מוקדם. משחקים יותר פנימה עם קווים ישרים יחסית';
  if (len <= 42) return 'תבנית בינונית: התבנית הנפוצה במצב ליגה. יש לך גמישות בבחירת הקו';
  return 'תבנית ארוכה: הכדור מחליק הרבה. צריך יותר ישר עם כדור חזק, ופחות מקום לטעויות החוצה';
}

function sideWord(hand, inward) {
  // לימני "פנימה" = שמאלה (בורד גבוה יותר); לשמאלי "פנימה" = ימינה
  if (hand === 'R') return inward ? 'שמאלה' : 'ימינה';
  return inward ? 'ימינה' : 'שמאלה';
}

function pickBall(curId, stronger) {
  const cur = ballById(curId);
  const balls = getDb().balls.filter(b => b.id !== curId && !b.spareOnly);
  if (!cur || !balls.length) return null;
  const cs = ballStrength(cur);
  const cands = balls.map(b => ({ b, d: ballStrength(b) - cs })).filter(x => stronger ? x.d >= 1 : x.d <= -1);
  cands.sort((a, b) => Math.abs(a.d) - Math.abs(b.d));
  return cands[0]?.b || null;
}

function ballWhy(b, stronger) {
  const bits = [];
  if (b.cover === 'solid') bits.push('כיסוי סוליד אוחז מוקדם יותר בשמן');
  if (b.cover === 'pearl') bits.push('כיסוי פנינה מחליק יותר בהתחלה ומגיב חד בסוף');
  if (b.cover === 'hybrid') bits.push('כיסוי היברידי נותן תגובה מאוזנת');
  if (b.cover === 'urethane') bits.push('אורטן נותן קשת חלקה וצפויה, טוב כשהמסלול שבור');
  if (b.grit) bits.push(Number(b.grit) <= 2000 ? `משטח מחוספס (${b.grit}) תופס יותר` : `משטח מבריק (${b.grit}) מחליק יותר`);
  if (b.desc) bits.push(`ומה שכתבת עליו: "${b.desc}"`);
  return (stronger ? 'הוא חזק יותר מהכדור הנוכחי: ' : 'הוא חלש יותר מהכדור הנוכחי: ') + bits.join(', ');
}

// משטח שהתחלק: הכדור נחלש בלי ששמת לב
function wornNote(id) {
  const b = ballById(id), l = lastSanded(b);
  if (!l) return '';
  const g = gamesSinceSand(b), days = Math.round((Date.now() - Date.parse(l.date)) / 864e5);
  // Storm: שיוף מלא כל 60-80 משחקים. ריענון משטח מומלץ בערך כל 30
  if (g < 30 && days < 35) return '';
  const full = g >= 60;
  return `שים לב: ${b.name} שויף ל-${l.grit} לפני ${days} ימים (~${g} משחקים רשומים). ${full ? 'לפי ההמלצה של Storm (שיוף מלא כל 60-80 משחקים) הגיע הזמן לשיוף.' : 'ייתכן שהמשטח כבר התחלק קצת, והכדור חלש ממה שהיה. ריענון משטח יכול להחזיר אחיזה.'} בדוק את זה לפני שאתה מזיז את הקו.`;
}

// ---------- תובנות ----------
export function insights(shots, lane, hand, session) {
  const out = [];
  const two = getDb().settings.style === 'two';
  const all = laneStats(shots, lane, hand);
  const recent = laneStats(shots.slice(-30), lane, hand);
  const R = recent.first.slice(-10);
  if (all.n < 3) {
    out.push({ level: 'info', title: 'צריך עוד כמה זריקות', seen: `נרשמו ${all.n} זריקות ראשונות במסלול הזה.`, means: 'עם פחות מ-3 זריקות כל מסקנה היא ניחוש.', todo: 'המשך לרשום. אחרי 4-5 זריקות מתחילים לראות כיוון.', why: 'קריאת מסלול היא חיפוש דפוס, וזריקה אחת לא יוצרת דפוס.' });
    return out;
  }
  // הקו הנוכחי: הזריקות האחרונות ברצף על אותה עמידה ואותו חץ (±1). אחרי הזזה מאבחנים רק את הקו החדש,
  // כדי שכניסות גבוהות מהקו הישן לא ימשיכו "לצעוק" אחרי שכבר תיקנת
  const lastS = R[R.length - 1];
  const sameLine = x => lastS && Math.abs((x.stance?.board ?? 0) - (lastS.stance?.board ?? 0)) <= 1 && Math.abs((x.arrow ?? 0) - (lastS.arrow ?? 0)) <= 1;
  const run = [];
  for (let i = R.length - 1; i >= 0 && sameLine(R[i]); i--) run.unshift(R[i]);
  const onNewLine = run.length < R.length;
  const waitNewLine = onNewLine && run.length < 3;
  const D = onNewLine && !waitNewLine ? run : R;
  const n = D.length;
  const c = k => D.filter(s => classifyLeave(s, hand) === k).length;
  const strikes = c('strike'), high = c('high'), light = c('light'), weak10 = c('weak10'), strong10 = c('strong10');
  const lastBall = R[R.length - 1]?.ball;
  const st = onNewLine ? median(run.map(x => x.stance?.board).filter(Number.isFinite)) : recent.stance;
  const cm = onNewLine ? median(run.map(x => x.stance?.cm).filter(Number.isFinite)) ?? recent.cm : recent.cm;
  if (waitNewLine) out.push({ level: 'info', title: 'קו חדש: נותנים לו כמה זריקות', seen: `עברת לעמידה ${lastS.stance?.board ?? '?'} ו${arrowLabel(lastS.arrow)} (${run.length} ${run.length === 1 ? 'זריקה' : 'זריקות'} עד עכשיו).`, means: 'הזריקות מהקו הקודם כבר לא מספרות על הקו הזה.', todo: 'זרוק לפחות 3 זריקות בקו החדש לפני שמחליטים אם הוא עובד.', why: 'הזזה אחת נשפטת על פי כמה זריקות, לא על פי הראשונה.' });
  const inW = sideWord(hand, true), outW = sideWord(hand, false);

  // 0. דיוק ביצוע ומרחב טעות
  if (all.n >= 5 && all.onTargetPct < 60) {
    out.push({ level: 'warn', title: 'קודם דיוק, אחר כך קריאה', seen: `רק ${all.onTargetPct}% מהזריקות יצאו כמו שתכננת (פנימה: ${all.exec.in}, החוצה: ${all.exec.out}, לא בטוח: ${all.exec.unsure}).`, means: 'כשהכדור לא עובר איפה שכיוונת, הפינים מספרים על הטעות ולא על המסלול. לכן הזריקות האלה לא נכנסות להמלצות.', todo: 'בחר יעד אחד ברור (חץ או נקודה לפני החצים), האט את ההליכה, והחזק את היד עד שהכדור עובר את החצים.', why: 'קריאת מסלול דורשת "מכשיר מדידה" יציב, והמכשיר הזה הוא אתה.' });
  }
  const missRoom = (dir) => {
    const ms = all.firstAll.filter(s => s.exec === dir);
    if (ms.length < 2) return;
    const k = ms.map(s => classifyLeave({ ...s, quality: s.quality }, hand));
    const good = k.filter(c => c === 'strike').length, hi = k.filter(c => c === 'high').length, lo = k.filter(c => ['light', 'weak10', 'head'].includes(c)).length;
    const dw = dir === 'in' ? inW : outW;
    let means, level = 'info';
    if (dir === 'out') means = good + hi >= lo ? `גם כשהכדור יצא ${dw} הוא חזר לכיס. יש "החזקה" בחוץ, כלומר מרחב טעות החוצה. אפשר לשחק בביטחון ולתת לכדור לצאת.` : `כשהכדור יצא ${dw} הוא לא חזר (כניסה חלשה או פספוס ראש). אין החזקה בחוץ, והחוץ לא סלחן. עדיף לטעות פנימה.`;
    else means = good >= hi && good >= 1 ? `גם כשהכדור עבר ${dw} מהיעד הוא עדיין היכה טוב. יש מרחב פנימה.` : hi > lo ? `גם כשעברת ${dw}, לתוך השמן, הכדור עדיין פנה חזק. גם בפנים כבר יבש: סימן לטרנזישן מתקדם. הגיע הזמן להזזה גדולה ${inW} או לכדור חלש יותר.` : `כשעברת ${dw} הכדור החליק והגיע חלש. בפנים יש שמן, ואין שם מרחב טעות.`;
    if (dir === 'out' && good + hi < lo) level = 'warn';
    out.push({ level, title: `מרחב טעות ${dw}`, seen: `${ms.length} זריקות יצאו ${dw} מהיעד: ${good} סטרייקים, ${hi} כניסות גבוהות, ${lo} חלשות או פספוס.`, means, todo: 'כשתבחר קו, העדף קו שהטעויות שלך בו "נסלחות". זה הקו שיחזיק לאורך משחק שלם.', why: 'שחקנים מקצועיים לא מחפשים רק את הקו הכי טוב, אלא את הקו עם הכי הרבה מרחב טעות.' });
  };
  missRoom('out'); missRoom('in');

  // 1. עקביות קודם
  if (recent.bpStd !== null && recent.bpStd > 3 && nums(R, 'bp').length >= 4) {
    out.push({ level: 'warn', title: 'השבירה מפוזרת: קודם עקביות, אחר כך קריאה', seen: `בורד השבירה זז בממוצע ±${recent.bpStd} בורדים בין זריקות.`, means: 'כשהשבירה לא קבועה, אי אפשר לדעת אם המסלול השתנה או שהזריקה השתנתה.', todo: 'התמקד בחץ אחד ובאותה מהירות ל-3-4 זריקות, ורק אז שפוט את המסלול.', why: 'המסלול "מדבר" רק כשהשחקן קבוע. אחרת אתה קורא את הטעויות של עצמך.' });
  }
  if (recent.speedStd > 1.5 && nums(R, 'speed').length >= 4) {
    out.push({ level: 'warn', title: 'המהירות קופצת', seen: `סטיית מהירות של ${recent.speedStd} בין זריקות.`, means: 'כל שינוי של 1-2 קמ"ש מזיז את נקודת השבירה בכמה רגליים.', todo: 'נסה לשמור על אותו קצב הליכה ואותה גובה מטוטלת.', why: 'מהירות גבוהה = הכדור מחליק יותר. מהירות נמוכה = מתעורר מוקדם.' });
  }

  if (all.driftN >= 4 && all.driftStd >= 1.5) {
    out.push({ level: 'warn', title: 'הדריפט משתנה מזריקה לזריקה', seen: `רגל ההחלקה זזה בממוצע ${Math.abs(all.drift)} בורדים ${all.drift >= 0 ? inW : outW}, אבל עם פיזור של ±${all.driftStd} בורדים.`, means: 'כשהרגל מסיימת כל פעם במקום אחר, גם נקודת השחרור זזה, ואיתה כל הקו. זה נראה כמו שינוי במסלול אבל זה ביצוע.', todo: 'הסתכל על החץ לאורך כל ההליכה, וודא שהצעד הראשון הולך ישר לכיוון המטרה. אם הדריפט קבוע (גם אם הוא 3-4 בורדים), זה בסדר גמור.', why: 'דריפט קבוע הוא חלק מהסגנון שלך והתוכנה מתחשבת בו. דריפט משתנה הוא רעש שמסתיר את קריאת המסלול.' });
  }

  // 2. אבחון כניסה לכיס
  if (!waitNewLine && strikes / n >= 0.5 && high / n < 0.3 && light / n < 0.3) {
    out.push({ level: 'good', title: 'אתה בקו, אל תיגע', seen: `${strikes} סטרייקים מתוך ${n} זריקות אחרונות.`, means: 'הכדור, הקו והמסלול מסונכרנים כרגע.', todo: 'שמור עמידה, חץ ומהירות. שים לב לסימן הראשון של כניסה גבוהה (4 / 7-10): זה הרמז שהמסלול מתחיל להתייבש.', why: 'שחקנים רבים מאבדים קו טוב כי הם "מתקנים" משהו שעובד.' });
  }
  // הזזות: בחירת סוג (רק עמידה / 2:1 / 2:2) + טבלת השוואה עם שבירה צפויה
  const arrowNow = onNewLine ? (lastS?.arrow ?? null) : (recent.arrow !== null ? Math.round(recent.arrow) : null);
  const stR = st !== null ? Math.round(st) : null;
  const cfg = bodyCfg(getDb().settings);
  const cal = calibrate(all.first, cfg);
  const driftNow = recent.drift ?? cfg.drift;
  const heavyOf = arr => arr.filter(s => isSplit(s.left) || s.quality === 'brooklyn' || s.left.length >= 3 || classifyLeave(s, hand) === 'head').length;
  const moveBlock = (kind, probs) => {
    let ch = chooseMove(kind, heavyOf(probs) >= Math.max(1, probs.length / 3));
    // הניסיון שלך גובר על הכלל: אם ההזזה המומלצת לא עבדה לך, ואחרת כן, עוברים לזו שעבדה
    const mine = recStats(kind, ch.type);
    if (mine.n >= 2 && mine.ok / mine.n < 0.34) {
      const better = ['feet', '21', '22'].filter(t => t !== ch.type).map(t => ({ t, ...recStats(kind, t) }))
        .filter(x => x.n >= 2 && x.ok / x.n >= 0.5).sort((a, b) => b.ok / b.n - a.ok / a.n)[0];
      if (better) ch = { ...ch, type: better.t, reason: `אצלך ${MOVE_INFO[ch.type].name} במצב הזה עבדה רק ${mine.ok} מתוך ${mine.n} פעמים, ו-${MOVE_INFO[better.t].name} עבדה ${better.ok} מתוך ${better.n}. לכן הפעם ההמלצה מבוססת על הניסיון שלך ולא על הכלל הכללי.` };
    }
    const fin = recStats(kind, ch.type);
    const track = fin.n ? `אצלך בעבר: ${MOVE_INFO[ch.type].name} במצב הזה עבדה ${fin.ok} מתוך ${fin.n} פעמים.` : '';
    const w = ch.dir > 0 ? inW : outW;
    const opts = moveOptions(stR, arrowNow, driftNow, ch.dir, cal.offset, cfg);
    const rec = opts.find(o => o.type === ch.type);
    const text = rec
      ? `הזזה ${MOVE_INFO[ch.type].name} ${w}: עמידה מבורד ${stR} ל-${rec.stance}, ${arrowLabel(arrowNow)} ← ${arrowLabel(rec.arrow)}. זווית ${stR - arrowNow} ← ${rec.launch} בורדים, שבירה צפויה בבורד ${rec.bp}.`
      : `הזזה ${MOVE_INFO[ch.type].name} ${w} (רשום עמידה וחץ כדי לקבל מספרים מדויקים).`;
    return { ch, opts, text, track, from: { stance: stR, arrow: arrowNow }, to: rec ? { stance: rec.stance, arrow: rec.arrow } : null };
  };
  const stepTwo = dirIn => dirIn
    ? (cm > 0 ? ` אם זה לא מספיק: עמוד 15-30 ס"מ אחורה (מ-${cm} ל-${Math.max(0, cm - 20)} ס"מ, ${cm - 20 <= 0 ? 'הכי אחורה' : 'קרוב לאמצע'}) או הוסף קצת מהירות.` : ' אם זה לא מספיק: אתה כבר הכי אחורה בגישה, אז הוסף קצת מהירות.')
    : ` אם זה לא מספיק: עמוד 15-20 ס"מ קדימה${cm !== null ? ` (ל-${cm + 20} ס"מ${cm + 20 === 20 ? ', באמצע' : ''})` : ''} או האט קצת.`;

  const highShots = D.filter(s => classifyLeave(s, hand) === 'high');
  if (!waitNewLine && high / n >= 0.35) {
    const alt = pickBall(lastBall, false);
    const m = moveBlock('high', highShots);
    out.push({
      level: 'warn', title: 'הכדור מתעורר מוקדם מדי (כניסה גבוהה)',
      seen: `${high} מתוך ${n} זריקות השאירו פינים של כניסה גבוהה (4, 7, 4-7, 4-9, 7-10).`,
      means: 'השמן בקו שלך התייבש (טרנזישן) או שהכדור חזק מדי לתנאים. הכדור מתחיל לפנות לפני הזמן ונכנס עמוק מדי לכיס.',
      todo: m.text + stepTwo(true) + (alt ? ` ואם גם זה לא: ${alt.name}.` : ''),
      why: m.ch.reason + (two ? ' כשחקן שתי ידיים עם סיבוב גבוה, הכדור מגיב חזק לכל שינוי בשמן, ולכן לפעמים צריך הזזות גדולות יותר (3-4 בורדים ברגליים).' : '') + (alt ? ' ' + ballWhy(alt, false) + '.' : ''),
      moves: m.opts, rec: m.ch.type, kind: 'high', from: m.from, to: m.to, track: m.track,
    });
  }
  if (!waitNewLine && (light + weak10) / n >= 0.35) {
    const alt = pickBall(lastBall, true);
    const w10 = weak10 >= light;
    const m = moveBlock(w10 ? 'weak10' : 'light', D.filter(s => ['light', 'weak10', 'head'].includes(classifyLeave(s, hand))));
    out.push({
      level: 'warn', title: w10 ? '10 חלש: הכדור מגיע בלי מספיק זווית' : 'הכדור לא פונה מספיק (כניסה חלשה)',
      seen: w10 ? `${weak10} פעמים נשאר 10 (או 6-10) מתוך ${n}.` : `${light} זריקות השאירו פינים של כניסה חלשה (2, 5, 8, 2-8, 2-4-5).`,
      means: w10 ? 'הכדור הגיע לכיס אבל "התעייף": נכנס ישר מדי בלי זווית, או פנה מוקדם ואיבד אנרגיה.' : 'יש יותר שמן בקו שלך ממה שהכדור יודע לחתוך. הוא מחליק עד מאוחר ולא נכנס מספיק לכיס.',
      todo: (wornNote(lastBall) ? wornNote(lastBall) + ' ' : '') + m.text + (w10 ? '' : stepTwo(false)) + (alt ? ` אם זה חוזר: ${alt.name}.` : ''),
      why: m.ch.reason + (alt ? ' ' + ballWhy(alt, true) + '.' : ''),
      moves: m.opts, rec: m.ch.type, kind: w10 ? 'weak10' : 'light', from: m.from, to: m.to, track: m.track,
    });
  }

  // 10 חזק: לרוב זריקה טובה. מגיבים רק כשזה חוזר
  if (!waitNewLine && strong10 >= 3 && strong10 / n >= 0.3) {
    const m = moveBlock('strong10', D.filter(s => classifyLeave(s, hand) === 'strong10'));
    const sp10 = nums(D.filter(s => classifyLeave(s, hand) === 'strong10'), 'speed'), spAll = nums(D, 'speed');
    const fast = sp10.length >= 2 && spAll.length >= 4 && median(sp10) > median(spAll) + 0.5;
    const altW = pickBall(lastBall, false);
    out.push({
      level: 'warn', title: '10 חזק חוזר',
      seen: `${strong10} פעמים מתוך ${n} פין 6 עף חזק מסביב ל-10 והשאיר אותו עומד.${fast ? ` בזריקות האלה המהירות הייתה גבוהה מהרגיל (${r1(median(sp10))}).` : ''}`,
      means: 'שתי סיבות מוכרות: זווית כניסה חדה מדי (פין 3 פוגע ביותר מדי מפין 6 ומעיף אותו מסביב ל-10), או קצת יותר מדי מהירות. 10 חזק אחד או שניים הם בדרך כלל זריקה טובה וחוסר מזל.',
      todo: (fast ? 'קודם כול האט מעט: אצלך ה-10 החזק מגיע דווקא בזריקות המהירות. ' : '') +
        `כדי לסגור קצת את הזווית: ${m.text}` + (altW ? ` או כדור חלק יותר: ${altW.name}.` : ''),
      why: m.ch.reason + ' לפי מקורות ההדרכה, ל-10 חזק ול-10 חלש יש סיבות שונות ותיקונים שונים, ולכן חשוב לסמן נכון איזה מהם היה.',
      moves: m.opts, rec: m.ch.type, kind: 'strong10', from: m.from, to: m.to, track: m.track,
    });
  }

  // גאומטריה: מה הזוויות אומרות על המסלול
  const lr = lineRead(all.first, two);
  if (lr) {
    out.push({
      level: 'info', title: 'מה הזוויות אומרות על המסלול',
      seen: `${lr.fromStrikes ? 'בזריקות הסטרייק' : 'בממוצע'}: זווית יציאה ${lr.launch} בורדים (עמידה ← חץ), יציאה החוצה ${lr.swing} בורדים אחרי החץ, ופנייה של ${lr.hook} בורדים מהשבירה לכיס.${cal.n >= 2 ? ` השבירה שלך בפועל נמצאת ${Math.abs(cal.offset)} בורדים ${cal.offset >= 0 ? inW : outW} מהקו הישר עמידה ← חץ.` : ''}`,
      means: lr.notes.join(' ') + (lr.cmp ? ' ' + lr.cmp : ''),
      todo: 'השווה את המספרים האלה בין משחקים: אם הפנייה מהשבירה לכיס גדלה, המסלול מתייבש. אם היא קטנה, השמן נדחף קדימה (carry down).',
      why: 'הזווית שהמסלול "מבקש" היא הדרך הכי ישירה לדעת איפה השמן ואיפה היבש, בלי לראות את השמן עצמו.',
    });
  }

  // 3. טרנזישן: השוואת חצי ראשון ושני של הסשן
  if (all.n >= 10) {
    const h = all.first.length >> 1;
    const hiRate = arr => arr.filter(s => classifyLeave(s, hand) === 'high').length / arr.length;
    const a = hiRate(all.first.slice(0, h)), b = hiRate(all.first.slice(h));
    if (b - a >= 0.25) out.push({ level: 'info', title: 'זיהוי טרנזישן', seen: `כניסות גבוהות עלו מ-${pct(a * h, h)}% ל-${pct(b, 1)}% במהלך האימון.`, means: 'זה המסלול שמשתנה ולא אתה: הכדורים של כולם מנגבים את השמן בקו הנפוץ ומסיעים אותו קדימה.', todo: `צפה להזזות ${inW} כל משחק בערך. מי שזז ראשון מרוויח.`, why: 'בליגה עם שני מסלולים, גם השכנים שלך שוחקים את השמן. לכן הקריאה צריכה להיות מתמשכת.' });
  }

  // 3.5 מרחק מעמדת המוצא: כמה המסלול "הזיז" אותך
  const home = getDb().settings.home;
  if (home && st !== null && all.clean >= 4) {
    const dS = Math.round(st - home.board), dA = arrowNow !== null ? arrowNow - home.arrow : 0;
    const dir = v => `${Math.abs(v)} ${v > 0 ? inW : outW}`;
    if (Math.abs(dS) >= 2 || Math.abs(dA) >= 2) {
      const inward = dS + dA > 0;
      out.push({ level: 'info', title: 'כמה המסלול הזיז אותך מעמדת המוצא', seen: `עמדת המוצא שלך: בורד ${home.board}, ${arrowLabel(home.arrow)}. עכשיו: בורד ${Math.round(st)}${arrowNow !== null ? `, ${arrowLabel(arrowNow)}` : ''}. ברגליים זזת ${dir(dS)}${dA ? `, ובחץ ${dir(dA)}` : ''}.`,
        means: inward ? `היית צריך לזוז ${inW}, לכיוון השמן. המסלול הזה "חזק" מהבסיס שלך: יבש יותר, תבנית קצרה יותר, או שכבר עבר טרנזישן.` : `היית צריך לזוז ${outW}, לכיוון היבש. במסלול הזה יש יותר שמן מהבסיס שלך: שימון טרי, כבד או תבנית ארוכה.`,
        todo: 'זכור את המספר הזה: בפעם הבאה באולם הזה, אם תצטרך לזוז באותו כיוון כבר בחימום, תדע מראש איזה מסלול מחכה לך.',
        why: 'עמדת מוצא קבועה היא סרגל. המרחק ממנה מודד את המסלול, בדיוק כמו שמשקל מודד דרך נקודת אפס קבועה.' });
    } else if (all.strikePct >= 40) {
      out.push({ level: 'good', title: 'המסלול דומה לבסיס שלך', seen: `אתה עדיין קרוב לעמדת המוצא (בורד ${home.board}, ${arrowLabel(home.arrow)}) ומפיל ${all.strikePct}% סטרייקים.`, means: 'התנאים קרובים לתנאים שהקו הבסיסי שלך נבנה עבורם.', todo: 'שמור. הסימן הראשון לשינוי יגיע מהפינים, לא מהלוח.', why: 'כשהבסיס עובד, אין סיבה להמציא קו חדש.' });
    }
  }

  // 4. מה הכי עבד
  const combos = {};
  all.first.forEach(s => {
    const k = `${s.ball}|${s.stance?.board ?? '?'}|${s.stance?.cm ?? 0}|${s.arrow ?? '?'}`;
    (combos[k] ||= { n: 0, x: 0, s }).n++;
    if (s.left.length === 0) combos[k].x++;
  });
  const best = Object.values(combos).filter(v => v.n >= 3).sort((a, b) => b.x / b.n - a.x / a.n)[0];
  if (best && best.x / best.n >= 0.4) {
    const b = ballById(best.s.ball);
    out.push({ level: 'good', title: 'הקו הכי מוצלח עד עכשיו', seen: `${b?.name || 'כדור'}, עמידה בבורד ${best.s.stance?.board ?? '?'}${best.s.stance?.cm ? ` (${best.s.stance.cm} ס"מ קדימה)` : ' (הכי אחורה)'}, ${arrowLabel(best.s.arrow)}: ${best.x}/${best.n} סטרייקים.`, means: 'זה הבסיס שלך למסלול הזה. כשהמסלול משתנה, זזים ממנו ולא מתחילים מאפס.', todo: 'רשום לעצמך את הנקודה הזו כנקודת פתיחה בפעם הבאה באולם הזה.', why: 'שחקנים טובים לא מחפשים קו חדש בכל פעם. הם זוכרים את הקו הקודם ומתאימים אותו.' });
  }

  // 4.5 עומק העמידה מול תוצאה: אותו בורד, קדימה או אחורה
  {
    const groups = {};
    all.first.forEach(x => { const d = Number(x.stance?.cm) || 0; (groups[d >= 15 ? 'fwd' : 'back'] ||= []).push(x); });
    const B = groups.back || [], F = groups.fwd || [];
    if (B.length >= 3 && F.length >= 3) {
      const rate = (arr, k) => pct(arr.filter(x => classifyLeave(x, hand) === k).length, arr.length);
      const spd = arr => r1(median(nums(arr, 'speed')));
      const fCm = Math.round(median(F.map(x => Number(x.stance.cm))));
      const line = (t, arr) => `${t}: ${rate(arr, 'strike')}% סטרייק, ${rate(arr, 'high')}% כניסה גבוהה${spd(arr) ? `, מהירות ${spd(arr)}` : ''}`;
      const fBetter = rate(F, 'strike') - rate(F, 'high') > rate(B, 'strike') - rate(B, 'high');
      const diff = Math.abs((rate(F, 'strike') - rate(F, 'high')) - (rate(B, 'strike') - rate(B, 'high')));
      if (diff >= 20) out.push({
        level: 'info', title: 'עומק העמידה משנה כאן',
        seen: `${line('הכי אחורה', B)}. ${line(`באמצע (כ-${fCm} ס"מ קדימה)`, F)}.`,
        means: fBetter
          ? 'קדימה עבד טוב יותר: הליכה קצרה נותנת פחות מהירות, והכדור תופס מוקדם יותר. כנראה יש עוד שמן בקו שלך.'
          : 'אחורה עבד טוב יותר: הליכה ארוכה נותנת יותר תנופה ומהירות, והכדור מחליק רחוק יותר ומגיע לכיס במקום לברוקלין. הקו שלך כבר יבש יחסית.',
        todo: `בתנאים האלה העדף לעמוד ${fBetter ? `באמצע (כ-${fCm} ס"מ קדימה)` : 'הכי אחורה'}. זו התאמה עדינה, שכדאי לנסות לפני הזזת רגליים לרוחב או החלפת כדור.`,
        why: 'עומק העמידה משנה את המהירות בלי לשנות את הקו. זה הכלי הכי עדין שיש לך, ולכן הוא מצוין לתיקונים קטנים בין פריימים.',
      });
    }
  }

  // 5. מהירות מול תוצאה
  const sp = R.filter(s => Number.isFinite(Number(s.speed)) && s.speed !== '' && s.speed !== null);
  if (sp.length >= 8) {
    const m = median(sp.map(s => Number(s.speed)));
    const fast = sp.filter(s => s.speed > m), slow = sp.filter(s => s.speed <= m);
    if (fast.length < 3 || slow.length < 3) return out;
    const fx = pct(fast.filter(s => !s.left.length).length, fast.length), sx = pct(slow.filter(s => !s.left.length).length, slow.length);
    if (Math.abs(fx - sx) >= 25) out.push({ level: 'info', title: 'המהירות משפיעה כאן', seen: `מעל ${m}: ${fx}% סטרייקים. עד ${m}: ${sx}%.`, means: fx > sx ? 'במסלול הזה עדיף שהכדור יחליק יותר: הקו יבש יחסית.' : 'במסלול הזה עדיף שהכדור יתפוס מוקדם: יש עוד שמן בקו.', todo: fx > sx ? 'שמור על הקצב המהיר יותר (או עמוד מעט אחורה).' : 'האט מעט או עמוד קצת קדימה.', why: 'מהירות היא כלי התאמה בדיוק כמו הזזת רגליים או החלפת כדור.' });
  }
  return out;
}

export function compareLanes(shots, hand) {
  const L = laneStats(shots, 'L', hand), Rr = laneStats(shots, 'R', hand);
  if (L.n < 4 || Rr.n < 4 || L.bp === null || Rr.bp === null) return null;
  const d = Math.abs(L.bp - Rr.bp);
  if (d < 3) return { level: 'info', title: 'שני המסלולים דומים', seen: `שבירה ממוצעת: שמאל ${L.bp}, ימין ${Rr.bp}.`, means: 'אפשר לשחק באותו קו בשני המסלולים.', todo: 'שמור על עמידה זהה ועקוב אחרי שינויים.', why: 'בצמד מסלולים שמומן באותו זמן, התנאים בדרך כלל דומים בהתחלה.' };
  return { level: 'warn', title: 'המסלולים שונים', seen: `שבירה ממוצעת: שמאל ${L.bp}, ימין ${Rr.bp} (הפרש ${r1(d)} בורדים).`, means: 'כל מסלול מתנהג אחרת: שימון לא אחיד, שחיקה שונה או שחקנים שונים.', todo: 'עבוד עם שתי נקודות עמידה, אחת לכל מסלול. האפליקציה זוכרת מה עשית בכל צד.', why: 'הטעות הנפוצה בליגה היא להתעקש על אותו קו ולהאשים את הזריקה.' };
}

// ---------- עצה לפתיחה: לפי מצב השימון וההיסטוריה על אותו מסלול ----------
export function startAdvice(session, seg, lane, hand, historyShots) {
  const out = [];
  const balls = getDb().balls.filter(b => !b.spareOnly).sort((a, b) => ballStrength(a) - ballStrength(b));
  const inW = sideWord(hand, true);
  const mid = balls[Math.floor((balls.length - 1) / 2)], weak = balls[0];
  const laneNum = seg.laneNums[lane];
  if (getDb().settings.style === 'two') out.push({ level: 'info', title: 'שחקן שתי ידיים', seen: 'הגדרת סגנון של שתי ידיים.', means: 'סיבוב גבוה פירושו שהכדור פונה מוקדם וחזק יותר מאשר אצל שחקן יד אחת באותו מסלול.', todo: `התחל עמוק יותר ${inW}, עם זווית יציאה פתוחה, ושקול כדור מתון כבר מהפתיחה.`, why: 'שחקני שתי ידיים צריכים יותר שמן מול הכדור כדי לשמור אנרגיה לסוף.' });
  if (seg.oil === 'fresh') out.push({ level: 'info', title: 'שימון טרי: איך לפתוח', seen: 'סימנת שהמסלולים שומנו עכשיו.', means: 'יש הרבה שמן בקו המרכזי. הכדור יחליק יותר, והשבירה תהיה מוגדרת וצפויה.', todo: `פתח עם כדור הבנצ'מרק${mid ? ` (${mid.name})` : ''}. אחרי משחק עד משחק וחצי צפה לטרנזישן ולהזזות ${inW}.`, why: 'זה הזמן שבו כלל ה-31 הכי אמין. השבירות של המשחק הראשון הן ההערכה הטובה ביותר לאורך התבנית.' });
  if (seg.oil === 'used') out.push({ level: 'info', title: 'שימון משוחק: איך לפתוח', seen: 'המסלולים כבר שוחקו לפניך.', means: 'הקו הנפוץ (בערך בורדים 8-15) כבר יבש יותר, והשמן נדחף קדימה (carry down).', todo: `התחל 2-3 בורדים ${inW} מהעמידה הרגילה שלך, או עם כדור מתון.`, why: 'כשאתה נכנס למסלול משוחק אתה לא יודע מה היה לפניך. עדיף להתחיל זהיר ולזוז לפי מה שהפינים אומרים.' });
  if (seg.oil === 'dry') out.push({ level: 'info', title: 'מסלול יבש: איך לפתוח', seen: 'סימנת שהמסלול יבש יחסית.', means: 'הכדור יתעורר מוקדם ויפנה חזק. כדור חזק מדי יכנס גבוה או יעבור לברוקלין.', todo: `פתח ${inW} יותר, עם הכדור החלש בארסנל${weak ? ` (${weak.name})` : ''}. אפשר להוסיף מהירות או לעמוד מעט אחורה.`, why: 'במסלול יבש השבירה זזה פנימה, ולכן הערכת אורך השימון לפי כלל ה-31 פחות אמינה. תסתכל עליה בעירבון מוגבל.' });

  if (historyShots && historyShots.length >= 5) {
    const first = historyShots.filter(s => s.shot === 0 && s.rack.length === 10 && isClean(s));
    const g = {};
    first.forEach(s => { const k = `${s.ball}|${s.stance?.board ?? '?'}|${s.stance?.cm ?? 0}|${s.arrow ?? '?'}`; (g[k] ||= { n: 0, x: 0, s }).n++; if (!s.left.length) g[k].x++; });
    const best = Object.values(g).filter(v => v.n >= 3).sort((a, b) => b.x / b.n - a.x / a.n)[0];
    const bp = median(nums(first, 'bp'));
    if (best) {
      const b = ballById(best.s.ball);
      out.push({ level: 'good', title: `מה עבד לך בעבר על מסלול ${laneNum}`, seen: `${b?.name || 'כדור'}, עמידה בבורד ${best.s.stance?.board ?? '?'}, ${arrowLabel(best.s.arrow)}: ${best.x}/${best.n} סטרייקים (${first.length} זריקות בהיסטוריה).${bp !== null ? ` שבירה ממוצעת: ${r1(bp)}.` : ''}`, means: 'לכל מסלול יש אופי: שיפוע, גיל העץ/סינתטי, שחיקה. הוא נוטה לחזור על עצמו.', todo: 'השתמש בזה כנקודת פתיחה והתאם לפי מצב השימון של היום.', why: 'שחקנים מקצועיים מנהלים "פנקס מסלולים" לכל אולם, בדיוק בשביל זה.' });
    }
  }
  return out;
}

// ---------- תוכנית פתיחה בסוף החימום ----------
export function openingPlan(shots, lane, hand, session) {
  const home = getDb().settings.home || { board: 18, cm: 0, arrow: 10 };
  const st = laneStats(shots, lane, hand);
  const counts = {};
  st.first.forEach(x => { if (x.ball) counts[x.ball] = (counts[x.ball] || 0) + 1; });
  const ball = Object.entries(counts).sort((a, b) => b[1] - a[1])[0]?.[0] || null;
  const oil = oilEstimate(st);
  if (st.clean < 2) return { stance: home.board, cm: home.cm || 0, arrow: home.arrow, ball, n: st.n, oil, reason: st.n ? 'מעט מדי זריקות נקיות בחימום. מתחילים מעמדת המוצא ומתאימים לפי הפינים.' : 'לא נזרקו זריקות חימום במסלול הזה. מתחילים מעמדת המוצא.' };
  const base = { stance: Math.round(st.stance ?? home.board), cm: Math.round(st.cm ?? 0), arrow: Math.round(st.arrow ?? home.arrow), ball, n: st.n, oil };
  const mv = insights(shots, lane, hand, session).find(i => i.moves?.length);
  if (mv) {
    const r = mv.moves.find(m => m.type === mv.rec);
    const alt = mv.why.includes('הוא חלש יותר') || mv.why.includes('הוא חזק יותר');
    return { ...base, stance: r.stance, arrow: r.arrow, reason: `בחימום: ${mv.title}. לכן מתחילים אחרי הזזת ${r.name}, עם שבירה צפויה בבורד ${r.bp}.${alt ? ' אם זה לא מסתדר אחרי 2-3 פריימים, ההמלצה בלשונית קריאה כוללת גם כדור חלופי.' : ''}` };
  }
  return { ...base, reason: st.strikePct >= 40 ? 'החימום הלך טוב בקו הזה. מתחילים בדיוק ממנו.' : 'אין עדיין דפוס ברור. מתחילים מהקו של החימום ושמים לב לשלוש הזריקות הראשונות.' };
}

// ---------- מקור ורמת ביטחון לכל תובנה ----------
// principle = עיקרון מקובל בהדרכת באולינג, estimate = הערכה/ספים של האפליקציה, data = מחושב מהזריקות שלך
const SRC = [
  ['צריך עוד', ['estimate']],
  ['קודם דיוק', ['principle', 'estimate'], 'עקביות לפני קריאה: Bowling This Month, NBA'],
  ['מרחב טעות', ['data']],
  ['השבירה מפוזרת', ['principle', 'estimate']],
  ['המהירות קופצת', ['principle'], 'מהירות מאריכה את ההחלקה: Bowlingball.com, USBC'],
  ['הדריפט משתנה', ['principle'], 'החלקה עקבית = שחרור עקבי: National Bowling Academy'],
  ['אתה בקו', ['data']],
  ['מתעורר מוקדם', ['principle', 'estimate'], 'קריאת השארות והזזות 2:1 / מקבילית: NBA, Bowling.com'],
  ['לא פונה מספיק', ['principle', 'estimate'], 'קריאת השארות והזזות: NBA, Bowling.com'],
  ['10 חלש', ['principle', 'estimate'], '10 חלש מול 10 חזק: Storm Bowling, Bowling This Month'],
  ['10 חזק', ['principle', 'estimate'], '10 חזק = זווית חדה או מהירות עודפת: Storm, BTM'],
  ['הזוויות', ['data', 'estimate']],
  ['טרנזישן', ['principle', 'data'], 'טרנזישן ו-carry down: Bowling This Month, NBA'],
  ['הזיז אותך', ['data']],
  ['דומה לבסיס', ['data']],
  ['הכי מוצלח', ['data']],
  ['עומק העמידה', ['data', 'principle'], 'אחורה = יותר מהירות: USBC (bowl.com), BTM'],
  ['המהירות משפיעה', ['data']],
  ['המסלולים', ['data']],
  ['שימון טרי', ['principle']], ['שימון משוחק', ['principle']], ['מסלול יבש', ['principle']],
  ['עבד לך בעבר', ['data']],
  ['שתי ידיים', ['estimate']],
  ['ההמלצות שלך', ['data']],
];
export const SRC_LABEL = { principle: '📚 עיקרון מקובל', estimate: '🧪 הערכה של האפליקציה', data: '📊 מהנתונים שלך' };
export function sourceOf(title) {
  const hit = SRC.find(([k]) => title.includes(k));
  return hit ? { kinds: hit[1], ref: hit[2] || '' } : { kinds: ['estimate'], ref: '' };
}

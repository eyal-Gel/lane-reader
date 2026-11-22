// נקודת מוקד ב-60 רגל ודריפט נמדד
import { getDb } from './store.js';
import { arrowLabel, focalOf, standForFocal, releaseOf } from './geometry.js';

const median = a => { const s = [...a].sort((x, y) => x - y); const m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
const std = a => { const m = a.reduce((x, y) => x + y, 0) / a.length; return Math.sqrt(a.reduce((x, y) => x + (y - m) ** 2, 0) / a.length); };
const r1 = x => Math.round(x * 10) / 10;

// הדריפט שלך באמת: חציון של (סיום רגל − עמידה) בכל הזריקות שסימנת בהן סיום רגל
export function measuredDrift() {
  const d = getDb().shots.filter(s => s.finishSet && Number.isFinite(s.finish) && Number.isFinite(s.stance?.board)).map(s => s.finish - s.stance.board);
  if (d.length < 5) return null;
  return { drift: Math.round(median(d)), n: d.length, std: r1(std(d)) };
}

// קו לפי נקודת מוקד: יעד קבוע במקום שבירה שקשה לראות
export function focalInsight(stR, arrowNow, driftNow, cfg, inW, outW) {
  if (stR === null || arrowNow === null) return null;
    const F = Number(getDb().settings.focal ?? 7);
    const md = measuredDrift();
    const dr = md ? md.drift : driftNow;
    const drTxt = md ? `דריפט ${dr} (נמדד מ-${md.n} זריקות)` : `דריפט ${dr} (משוער. סמן "סיום רגל" בזריקות כדי למדוד)`;
    const relNow = Math.round(releaseOf(stR + dr, cfg)), focNow = Math.round(focalOf(relNow, arrowNow));
    const want = standForFocal(arrowNow, F, dr, cfg);
    const on = Math.abs(focNow - F) <= 1;
    return { level: 'info', title: `קו לפי נקודת מוקד (בורד ${F})`,
      seen: `עכשיו: עמידה ${stR} ← גלישה ~${stR + dr} ← הכדור יוצא ~${relNow} ← ${arrowLabel(arrowNow)} ← מוקד ב-60 רגל: ${focNow < 1 ? `מחוץ למסלול (${focNow})` : `בורד ${focNow}`}. ${drTxt}.`,
      means: on ? `אתה כבר על קו המוקד שלך (בורד ${F}).` : `הקו שלך מכוון ${Math.abs(focNow - F)} בורדים ${focNow < F ? outW : inW} מהמוקד. כדי שהקו דרך ${arrowLabel(arrowNow)} יגיע לבורד ${F}, הכדור צריך לצאת מבורד ${want.release} בקו העבירה.`,
      todo: on ? 'תשאיר. אם המסלול מתייבש: שומרים על המוקד ומזיזים רגליים וחץ ביחד ביחס 4:3. רק אם זה לא מספיק, מזיזים את המוקד עצמו פנימה.' : `עמוד ${want.stance} ← גלישה ${want.finish} ← הכדור יוצא ${want.release} ← ${arrowLabel(arrowNow)} ← מוקד ${F}. בשמן ארוך באמת (43 רגל ומעלה) אפשר להעביר את המוקד ${inW}.`,
      why: 'את השבירה קשה לראות מהגישה, ונקודה בקצה המסלול היא יעד קבוע. בורד אחד בחץ ≈ 4 בורדים במוקד. המספרים תלויים בדריפט ובמרחק הכדור מהרגל, אז כדאי למדוד אותם.' };
}

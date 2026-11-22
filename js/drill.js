// תרגול טכניקה באימון: מנסים משהו חדש (צעדים, סווינג, שחרור), ולכן הזריקה משתנה ולא המסלול.
// זריקות כאלה נכנסות לניקוד ולכרטיס התרגול, אבל לא לקריאת המסלול, לדריפט או להמלצות
import { getDb, save } from './store.js';
import { classifyLeave } from './analysis.js';

export const DRILLS = [['steps', 'צעדים'], ['swing', 'סווינג'], ['release', 'שחרור'], ['speed', 'מהירות'], ['other', 'אחר']];
export const drillName = k => (DRILLS.find(d => d[0] === k) || [0, 'טכניקה'])[1];

export function drillBar(s, warm) {
  if (warm || s.type !== 'training') return '';
  const chips = `<div class="chips">${DRILLS.map(([k, t]) => `<button data-drill="${k}" class="${s.drill === k ? 'on' : ''}">${t}</button>`).join('')}</div>`;
  if (!s.drill) return `<details class="drillbar"><summary>🧪 מנסה משהו חדש בטכניקה?</summary><p class="mute" style="margin:6px 0 0">בחר מה אתה מתרגל. מעכשיו הזריקות לא ייכנסו לקריאת המסלול עד שתלחץ "סיימתי לתרגל".</p>${chips}</details>`;
  return `<div class="card drillbar on"><div class="row" style="justify-content:space-between"><b>🧪 מתרגל: ${drillName(s.drill)}</b><button class="btn sm" data-drill="">סיימתי לתרגל</button></div>
    <div class="mute">הזריקות נכנסות לניקוד ולכרטיס התרגול, לא לקריאת המסלול, לדריפט או להמלצות.</div>${chips}</div>`;
}

export function bindDrill(root, s, rerender) {
  root.querySelectorAll('[data-drill]').forEach(b => b.addEventListener('click', () => { s.drill = b.dataset.drill || null; save(); rerender(); }));
}

const pct = (a, b) => (b ? Math.round((a / b) * 100) : 0);
const firstOf = (shots, lane) => shots.filter(s => s.shot === 0 && s.rack.length === 10 && !s.warm && (lane == null || s.lane === lane));
function rates(list, hand) {
  const k = list.map(s => classifyLeave(s, hand));
  return { n: list.length, on: pct(list.filter(s => !s.exec || s.exec === 'ok').length, list.length),
    pocket: pct(k.filter(c => ['strike', 'weak10', 'strong10'].includes(c)).length, list.length), strike: pct(k.filter(c => c === 'strike').length, list.length) };
}
const line = r => `${r.n} זריקות, ${r.on}% בחץ, ${r.pocket}% בכיס, ${r.strike}% סטרייק`;

// כרטיס: תרגול מול זריקה רגילה, ומגמה לאורך כל האימונים באותו נושא
export function drillInsight(shots, lane, hand) {
  const first = firstOf(shots, lane);
  const D = first.filter(s => s.drill);
  if (!D.length) return null;
  const N = rates(first.filter(s => !s.drill && !s.straight), hand);
  const keys = [...new Set(D.map(s => s.drill))];
  const parts = keys.map(k => `${drillName(k)}: ${line(rates(D.filter(s => s.drill === k), hand))}`);
  const d = rates(D, hand);
  const close = N.n >= 3 && d.on >= N.on - 10 && d.pocket >= N.pocket - 10;
  // מגמה בכל ההיסטוריה של הנושא הראשי: חצי ראשון מול חצי אחרון
  const main = keys.length === 1 ? keys[0] : D[D.length - 1].drill;
  const H = firstOf(getDb().shots).filter(s => s.drill === main);
  let trend = '';
  if (H.length >= 10) {
    const h = H.length >> 1, a = rates(H.slice(0, h), hand), b = rates(H.slice(-h), hand);
    trend = ` בכל האימונים: ${H.length} זריקות תרגול ב${drillName(main)}. בחץ: ${a.on}% בהתחלה ← ${b.on}% לאחרונה. בכיס: ${a.pocket}% ← ${b.pocket}%.`;
  }
  return { level: 'info', title: 'תרגול טכניקה',
    seen: `${parts.join(' · ')}.${N.n ? ` זריקה רגילה: ${line(N)}.` : ''}${trend}`,
    means: N.n < 3 ? 'עוד אין מספיק זריקות רגילות במסלול הזה להשוואה.' : close ? 'השינוי כבר כמעט לא עולה לך בדיוק ובכניסה לכיס. סימן שהגוף מתחיל לקלוט.' : 'ירידה בדיוק ובתוצאה בזמן שינוי טכניקה היא נורמלית. זה מחיר הלמידה, לא סימן שהשינוי לא טוב.',
    todo: `${D.length < 20 ? `עוד מוקדם לשפוט (${D.length} זריקות). ` : ''}שופטים שינוי טכני אחרי 20-30 זריקות לפחות, לפי פגיעה בחץ וכניסה לכיס ולא לפי הניקוד. בליגה זורקים רגיל, ומכניסים את השינוי רק כשהמספרים מתקרבים לזריקה הרגילה.`,
    why: 'כשמשנים טכניקה הכדור מתנהג אחרת גם אם המסלול לא השתנה. אם הזריקות האלה היו נכנסות לקריאה, האפליקציה הייתה מזיזה אותך בגלל הטכניקה החדשה ולא בגלל השמן.' };
}

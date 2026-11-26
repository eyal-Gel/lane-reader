// תוכנית פתיחה אחרי חימום + "שליף" להזזות בזמן ליגה, בלי לגעת בטלפון
import * as S from './store.js';
import { arrowNum, chooseMove, MOVE_INFO } from './geometry.js';

const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const laneName = (s, lane) => {
  const seg = S.segOf(s, S.curSegIdx(s));
  return `${lane === 'L' ? 'שמאל' : 'ימין'}${seg.laneNums[lane] ? ' · ' + seg.laneNums[lane] : ''}`;
};
const arr = a => (arrowNum(a) ? `חץ ${arrowNum(a)}` : `בורד ${a}`);
const STEP = { feet: [2, 0], '21': [2, 1], '22': [2, 2] };

// מה לעשות אם... מחושב מהקו של התוכנית, לפי אותם כללים של הקריאה החיה
function cheat(p) {
  if (p.stance == null || p.arrow == null) return '';
  const rows = [['נכנס גבוה לכיס', 'high', false], ['ספליטים / ברוקלין', 'high', true], ['חלש / כמעט פספוס ראש', 'light', false],
    ...(S.getDb().settings.hand === 'L' ? [['7 חלש', 'weak10'], ['7 חזק (4 עף מסביב)', 'strong10']] : [['10 חלש', 'weak10'], ['10 חזק (6 עף מסביב)', 'strong10']])].map(([t, k, heavy]) => {
    const m = chooseMove(k, heavy), [ds, da] = STEP[m.type];
    return `<tr><td>${t}</td><td>${MOVE_INFO[m.type].name} ${m.dir > 0 ? 'פנימה' : 'החוצה'}</td><td><b>${p.stance + ds * m.dir}</b> · ${arr(p.arrow + da * m.dir)}</td></tr>`;
  }).join('');
  return `<details style="margin-top:6px"><summary><b>🗂️ שליף לליגה: אם... אז זז ל...</b></summary>
    <table class="moves"><tr><th>אם רואים</th><th>הזזה</th><th>עמידה · חץ</th></tr>${rows}</table>
    <p class="mute" style="margin:6px 0 0">זזים רק אחרי 2 פריימים עם אותו סימן באותו מסלול. זריקה שלא יצאה כמו שתכננת לא נחשבת.</p></details>`;
}

export function planCards(s, plan) {
  return ['L', 'R'].map(lane => {
    const p = plan[lane]; if (!p) return '';
    const b = S.ballById(p.ball);
    return `<div class="card"><h3>מסלול ${laneName(s, lane)}</h3>
      <div class="stats"><div class="stat"><div class="v">${p.stance}${p.cm ? `<small> +${p.cm}</small>` : ''}</div><div class="k">עמידה</div></div>
      <div class="stat"><div class="v">${arrowNum(p.arrow) ? `חץ ${arrowNum(p.arrow)}` : p.arrow}</div><div class="k">בורד ${p.arrow}</div></div>
      <div class="stat"><div class="v" style="font-size:.95rem">${esc(b?.name || '—')}</div><div class="k">כדור</div></div></div>
      <p style="line-height:1.5">${esc(p.reason)}</p>
      ${p.oil ? `<p class="mute">אורך שימון משוער: ~${p.oil.len} רגל (ביטחון ${p.oil.conf})</p>` : ''}
      <p class="mute">${p.n} זריקות חימום במסלול הזה.</p>${cheat(p)}</div>`;
  }).join('');
}

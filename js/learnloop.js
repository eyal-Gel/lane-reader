// לולאת למידה: האפליקציה רושמת כל המלצת הזזה, מזהה אם ביצעת אותה, ובודקת מה קרה אחריה
import * as S from './store.js';
import { classifyLeave, isClean } from './analysis.js';
import { MOVE_INFO } from './geometry.js';

// אילו השארות נחשבות "הבעיה" שההמלצה ניסתה לפתור
const PROBLEM = { high: ['high'], light: ['light', 'head'], weak10: ['weak10'], strong10: ['strong10'] };
export const KIND_LABEL = { high: 'כניסה גבוהה', light: 'כניסה חלשה', weak10: '10 חלש', strong10: '10 חזק' };
const AFTER_N = 4;      // כמה זריקות אחרי ההזזה עד שבודקים
const EXPIRE_N = 8;     // אחרי כמה זריקות בלי לבצע, ההמלצה נחשבת "לא בוצעה"
const near = (a, b) => a != null && b != null && Math.abs(a - b) <= 1;
const pct = x => Math.round(x * 100);

function laneFirst(sid, seg, lane) {
  return S.sessionShots(sid).filter(x => (x.seg ?? 0) === seg && x.lane === lane && x.shot === 0 && x.rack.length === 10 && isClean(x));
}
function rates(arr, kind, hand) {
  const n = arr.length;
  const strike = arr.filter(s => !s.left.length).length, prob = arr.filter(s => PROBLEM[kind].includes(classifyLeave(s, hand))).length;
  return { n, strike: n ? strike / n : 0, problem: n ? prob / n : 0 };
}

// רישום ההמלצות שהוצגו לך (מהקריאה או מההודעה אחרי זריקה)
export function registerRecs(session, lane, list) {
  const db = S.getDb(); db.recs ||= [];
  const hand = db.settings.hand, seg = S.curSegIdx(session);
  let changed = false;
  list.filter(i => i.kind && i.to && i.from?.stance != null).forEach(i => {
    const active = db.recs.find(r => r.sessionId === session.id && r.seg === seg && r.lane === lane && (r.status === 'open' || r.status === 'following'));
    if (active) {
      if (active.status === 'following') return;   // כבר מבצע הזזה: מחכים לתוצאה לפני המלצה חדשה
      if (active.kind === i.kind && active.type === i.rec && active.to.stance === i.to.stance && active.to.arrow === i.to.arrow) return;
      active.status = 'replaced';
    }
    db.recs.push({
      id: S.uid(), ts: Date.now(), sessionId: session.id, seg, lane, kind: i.kind, type: i.rec,
      from: { ...i.from }, to: { ...i.to }, before: rates(laneFirst(session.id, seg, lane).slice(-6), i.kind, hand), status: 'open',
    });
    changed = true;
  });
  if (changed) S.save();
}

// אחרי כל זריקה: האם ביצעת המלצה פתוחה? והאם כבר אפשר לבדוק אם היא עזרה?
export function updateRecs(session) {
  const db = S.getDb(); if (!db.recs?.length) return [];
  const hand = db.settings.hand, events = [];
  db.recs.filter(r => r.sessionId === session.id && (r.status === 'open' || r.status === 'following')).forEach(r => {
    const arr = laneFirst(session.id, r.seg, r.lane).filter(s => s.ts > r.ts);
    if (r.status === 'open') {
      const hit = arr.find(s => near(s.stance?.board, r.to.stance) && near(s.arrow, r.to.arrow) && Math.abs(s.stance.board - r.from.stance) >= 1);
      if (hit) { r.status = 'following'; r.followTs = hit.ts; events.push({ type: 'follow', r }); }
      else if (arr.length >= EXPIRE_N) r.status = 'ignored';
    }
    if (r.status === 'following') {
      const after = arr.filter(s => s.ts >= r.followTs);
      if (after.length >= AFTER_N) {
        const a = rates(after.slice(0, 6), r.kind, hand);
        const dp = r.before.problem - a.problem, ds = a.strike - r.before.strike;
        r.after = a;
        r.status = (dp >= 0.2 || ds >= 0.2) && dp > -0.1 ? 'better' : (dp <= -0.2 || ds <= -0.2) ? 'worse' : 'same';
        events.push({ type: 'eval', r });
      }
    }
  });
  S.save();
  return events;
}

export function eventText(e) {
  const r = e.r, name = MOVE_INFO[r.type].name, k = KIND_LABEL[r.kind];
  if (e.type === 'follow') return `📋 זיהיתי שביצעת את ההמלצה (${name}: עמידה ${r.to.stance}, בורד ${r.to.arrow}). אחרי ${AFTER_N} זריקות אבדוק אם זה עזר.`;
  const b = r.before, a = r.after;
  const nums = `${k}: ${pct(b.problem)}% ← ${pct(a.problem)}%, סטרייקים: ${pct(b.strike)}% ← ${pct(a.strike)}%`;
  if (r.status === 'better') return `✅ ההזזה עבדה. ${nums}. נרשם לזיכרון שלך.`;
  if (r.status === 'worse') return `⚠️ אחרי ההזזה המצב החמיר. ${nums}. נרשם, ובפעם הבאה במצב כזה ההמלצה תתחשב בזה.`;
  return `➖ ההזזה לא שינתה הרבה. ${nums}. אולי צריך צעד נוסף, או שהבעיה היא בכדור או בביצוע.`;
}

// סיכום לכרטיס "מה למדנו": לכל מצב וסוג הזזה, כמה פעמים עבד
export function learnedSummary() {
  const recs = S.getDb().recs || [];
  const done = recs.filter(r => ['better', 'same', 'worse'].includes(r.status));
  const groups = {};
  done.forEach(r => { const k = `${r.kind}|${r.type}`; (groups[k] ||= { kind: r.kind, type: r.type, n: 0, ok: 0, worse: 0 }).n++; if (r.status === 'better') groups[k].ok++; if (r.status === 'worse') groups[k].worse++; });
  return {
    rows: Object.values(groups).sort((a, b) => b.n - a.n),
    pending: recs.filter(r => r.status === 'following').length,
    open: recs.filter(r => r.status === 'open').length,
    followed: recs.filter(r => r.status !== 'open' && r.status !== 'replaced' && r.status !== 'ignored').length,
    ignored: recs.filter(r => r.status === 'ignored').length,
  };
}

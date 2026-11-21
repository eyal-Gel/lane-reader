// מודל נתונים, שמירה מקומית וחישוב ניקוד
const KEY = 'blr.v1';
export const ALL_PINS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];

const defaults = () => ({
  settings: { hand: 'R', style: 'one', center: 'בולה באולינג חולון', speedUnit: 'kmh', home: { board: 18, cm: 0, arrow: 10 }, drift: 2, ballOff: 5 },
  balls: [],
  sessions: [],
  shots: [],
  currentSessionId: null,
});

let db = load();

function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return defaults();
    const d = defaults(), o = JSON.parse(raw);
    return Object.assign(d, o, { settings: Object.assign(d.settings, o.settings) });
  } catch { return defaults(); }
}

export function save() {
  try { localStorage.setItem(KEY, JSON.stringify(db)); } catch (e) { console.warn('save failed', e); }
}

export const getDb = () => db;
export const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

export function replaceDb(obj) {
  if (!obj || !Array.isArray(obj.shots) || !Array.isArray(obj.sessions)) throw new Error('קובץ לא תקין');
  db = Object.assign(defaults(), obj);
  save();
}

// ---------- העברה למכשיר אחר (כדורים + הגדרות) ----------
// הקוד נכנס אחרי # בקישור, ולכן לא נשלח לשום שרת
const b64e = s => btoa(unescape(encodeURIComponent(s))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const b64d = s => decodeURIComponent(escape(atob(s.replace(/-/g, '+').replace(/_/g, '/'))));
export function makeTransfer() {
  return b64e(JSON.stringify({ v: 1, balls: db.balls, settings: db.settings }));
}
export function readTransfer(code) {
  const raw = String(code || '').trim().replace(/^.*#xfer=/, '');
  const o = JSON.parse(b64d(raw));
  if (!o || o.v !== 1 || !Array.isArray(o.balls) || o.balls.length > 50) throw new Error('קוד לא תקין');
  const balls = o.balls.filter(b => b && typeof b.name === 'string' && b.name.trim()).map(b => ({ ...b, name: String(b.name).slice(0, 60) }));
  return { balls, settings: o.settings && typeof o.settings === 'object' ? o.settings : null };
}
// מיזוג: כדור עם אותו שם מתעדכן, כדור חדש נוסף. ההגדרות מתעדכנות
export function applyTransfer(t) {
  t.balls.forEach(b => {
    const ex = db.balls.find(x => x.name.trim().toLowerCase() === b.name.trim().toLowerCase());
    if (ex) Object.assign(ex, b, { id: ex.id }); else db.balls.push({ ...b, id: b.id || uid() });
  });
  if (t.settings) {
    const keep = ['hand', 'style', 'center', 'speedUnit', 'home', 'drift', 'ballOff'];
    keep.forEach(k => { if (t.settings[k] !== undefined) db.settings[k] = t.settings[k]; });
  }
  save();
}

// ---------- כדורים ----------
export function upsertBall(ball) {
  const i = db.balls.findIndex(b => b.id === ball.id);
  if (i >= 0) db.balls[i] = ball; else db.balls.push({ ...ball, id: ball.id || uid() });
  save();
}
export function removeBall(id) { db.balls = db.balls.filter(b => b.id !== id); save(); }
export const ballById = id => db.balls.find(b => b.id === id);

// שיוף: רושם את התאריך והגריט החדש. המשטח הנוכחי (grit) הוא מה שנכנס לחישוב העוצמה
export function resurface(id, grit, date = new Date().toISOString()) {
  const b = ballById(id); if (!b) return;
  b.grit = String(grit);
  (b.surfaceLog ||= []).push({ date, grit: String(grit) });
  save();
}
export const lastSanded = b => b?.surfaceLog?.length ? b.surfaceLog[b.surfaceLog.length - 1] : null;
// משחקים משוערים מאז השיוף: כדורים ראשונים עם הכדור הזה ÷ 10 (כ-10 כדורים ראשונים במשחק)
export function gamesSinceSand(b) {
  const l = lastSanded(b); if (!l) return null;
  const t = Date.parse(l.date);
  const n = db.shots.filter(x => x.ball === b.id && x.shot === 0 && x.rack.length === 10 && !x.warm && x.ts >= t).length;
  return Math.round(n / 10);
}

// עוצמת כדור משוערת (0-13 בערך): כיסוי + משטח + דיפרנציאל + RG + ליבה
const COVER_SCORE = { plastic: 0, urethane: 3, pearl: 5, hybrid: 6, solid: 7 };
export function ballStrength(b) {
  if (!b) return 0;
  let s = COVER_SCORE[b.cover] ?? 4;
  const g = Number(b.grit) || 3000;
  s += g <= 1000 ? 2 : g <= 2000 ? 1.5 : g <= 3000 ? 1 : g <= 4000 ? 0.5 : 0;
  if (b.diff) s += Math.min(3, Number(b.diff) * 50);
  if (b.rg) s += Math.max(0, Math.min(3, (2.6 - Number(b.rg)) * 20));
  if (b.core === 'asym') s += 0.5;
  return Math.round(s * 10) / 10;
}

// ---------- אימונים ----------
export function newSession(opts) {
  const s = {
    id: uid(), date: new Date().toISOString(),
    center: opts.center || db.settings.center,
    type: opts.type || 'training',
    laneNums: { L: opts.laneL || '', R: opts.laneR || '' },
    startLane: opts.startLane || 'L',
    alternate: opts.alternate !== false,
    patternLen: opts.patternLen ? Number(opts.patternLen) : null,
    note: opts.note || '',
    liveTips: opts.liveTips !== false,   // false = רישום בלבד (ליגה/תחרות)
    phase: opts.warmup ? 'warm' : 'play', // חימום: זריקות בלי ניקוד, המלצות פעילות תמיד
    plan: null,                          // תוכנית פתיחה שנבנתה בסוף החימום
    games: 1,
    // קטעים: כל מעבר לזוג מסלולים אחר (או שינוי מצב שימון) פותח קטע חדש
    segs: [{ laneNums: { L: opts.laneL || '', R: opts.laneR || '' }, oil: opts.oil || 'fresh', startGame: 0 }],
  };
  db.sessions.push(s);
  db.currentSessionId = s.id;
  save();
  return s;
}

export const OIL_LABEL = { fresh: 'שימון טרי', used: 'משוחק חלקית', dry: 'יבש יחסית' };

// מעבר לזוג מסלולים אחר באמצע אימון: מתחיל משחק חדש בקטע חדש
export function newSegment(session, laneL, laneR, oil) {
  session.segs ||= [{ laneNums: session.laneNums, oil: 'fresh', startGame: 0 }];
  const hasShots = gameShots(session.id, session.games - 1).length > 0;
  if (hasShots) session.games++;
  session.segs.push({ laneNums: { L: laneL, R: laneR }, oil, startGame: session.games - 1 });
  session.laneNums = { L: laneL, R: laneR };
  save();
}
export const curSegIdx = s => (s.segs?.length || 1) - 1;
export const segOf = (s, idx) => (s.segs || [{ laneNums: s.laneNums, oil: 'fresh' }])[idx];

// היסטוריה: זריקות קודמות באותו אולם ובאותם מספרי מסלול (לא כולל האימון הנוכחי)
export function historyFor(session, laneNum) {
  if (!laneNum) return [];
  const out = [];
  db.sessions.filter(s => s.id !== session.id && s.center === session.center).forEach(s => {
    (s.segs || [{ laneNums: s.laneNums }]).forEach((seg, i) => {
      ['L', 'R'].forEach(side => {
        if (String(seg.laneNums[side]) === String(laneNum)) {
          db.shots.filter(x => x.sessionId === s.id && (x.seg ?? 0) === i && x.lane === side).forEach(x => out.push({ ...x, oil: seg.oil, date: s.date }));
        }
      });
    });
  });
  return out;
}
export const currentSession = () => db.sessions.find(s => s.id === db.currentSessionId) || null;
export const sessionShots = sid => db.shots.filter(x => x.sessionId === sid);
export const warmShots = sid => db.shots.filter(x => x.sessionId === sid && x.warm);
export const gameShots = (sid, g) => db.shots.filter(x => x.sessionId === sid && x.game === g);

export function deleteSession(id) {
  db.sessions = db.sessions.filter(s => s.id !== id);
  db.shots = db.shots.filter(x => x.sessionId !== id);
  if (db.currentSessionId === id) db.currentSessionId = null;
  save();
}

export function addShot(shot) { db.shots.push({ ...shot, id: uid(), ts: Date.now() }); save(); }
export function undoShot(sid) {
  for (let i = db.shots.length - 1; i >= 0; i--) {
    if (db.shots[i].sessionId === sid) { db.shots.splice(i, 1); save(); return true; }
  }
  return false;
}

// מסלול ברירת מחדל לפריים: החלפה בכל פריים, ובמשחק הבא מתחילים בצד השני
export function defaultLane(session, game, frame) {
  if (!session.alternate) return session.startLane;
  const other = session.startLane === 'L' ? 'R' : 'L';
  return (frame + game) % 2 === 0 ? session.startLane : other;
}

// ---------- מצב המשחק: מה הזריקה הבאה ----------
export function framesOf(shots) {
  const frames = Array.from({ length: 10 }, () => []);
  shots.forEach(s => frames[s.frame].push(s));
  frames.forEach(f => f.sort((a, b) => a.shot - b.shot));
  return frames;
}

export function nextShot(shots) {
  const frames = framesOf(shots);
  for (let f = 0; f < 10; f++) {
    const fr = frames[f];
    if (f < 9) {
      if (fr.length === 0) return { frame: f, shot: 0, rack: [...ALL_PINS] };
      if (fr.length === 1 && fr[0].left.length > 0) return { frame: f, shot: 1, rack: [...fr[0].left], lane: fr[0].lane };
      continue;
    }
    if (fr.length === 0) return { frame: 9, shot: 0, rack: [...ALL_PINS] };
    const lane = fr[0].lane;
    if (fr.length === 1) {
      return { frame: 9, shot: 1, rack: fr[0].left.length ? [...fr[0].left] : [...ALL_PINS], lane };
    }
    if (fr.length === 2) {
      const a = fr[0], b = fr[1];
      const earned = a.left.length === 0 || b.left.length === 0;
      if (!earned) return null;
      const rack = b.left.length === 0 ? [...ALL_PINS] : [...b.left];
      return { frame: 9, shot: 2, rack, lane };
    }
    return null;
  }
  return null;
}

// ---------- ניקוד ----------
export function scoreGame(shots) {
  const frames = framesOf(shots);
  const rolls = [];
  const frameStart = [];
  frames.forEach(fr => {
    frameStart.push(rolls.length);
    fr.forEach(s => rolls.push(s.rack.length - s.left.length));
  });
  const totals = [];
  let total = 0;
  for (let f = 0; f < 10; f++) {
    const fr = frames[f];
    if (!fr.length) { totals.push(null); continue; }
    const i = frameStart[f];
    let val = null;
    if (f < 9) {
      if (rolls[i] === 10) val = rolls[i + 1] !== undefined && rolls[i + 2] !== undefined ? 10 + rolls[i + 1] + rolls[i + 2] : null;
      else if (fr.length === 2) {
        const sum = rolls[i] + rolls[i + 1];
        val = sum === 10 ? (rolls[i + 2] !== undefined ? 10 + rolls[i + 2] : null) : sum;
      }
    } else {
      const done = nextShot(shots) === null;
      if (done) val = fr.reduce((a, s) => a + s.rack.length - s.left.length, 0);
    }
    if (val === null) { totals.push(null); continue; }
    total += val;
    totals.push(total);
  }
  return { totals, total, frames };
}

// סימון לתצוגה בלוח: X, /, -, מספר
export function shotMark(s, prev) {
  const knocked = s.rack.length - s.left.length;
  if (s.rack.length === 10 && s.left.length === 0) return 'X';
  if (prev && s.rack.length < 10 && s.left.length === 0) return '/';
  return knocked === 0 ? '-' : String(knocked);
}

export function isSplit(left) {
  if (left.includes(1) || left.length < 2) return false;
  // ספליט: אין פין עומד שצמוד לאחר (מפושט: בדיקת שכנות בין הפינים)
  const adj = { 1: [2, 3, 5], 2: [1, 3, 4, 5, 8], 3: [1, 2, 5, 6, 9], 4: [2, 7, 8, 5], 5: [1, 2, 3, 4, 6, 8, 9], 6: [3, 9, 10, 5], 7: [4], 8: [4, 5, 2], 9: [5, 6, 3], 10: [6] };
  const set = new Set(left);
  const seen = new Set([left[0]]);
  const stack = [left[0]];
  while (stack.length) {
    const p = stack.pop();
    adj[p].forEach(n => { if (set.has(n) && !seen.has(n)) { seen.add(n); stack.push(n); } });
  }
  return seen.size < set.size;
}

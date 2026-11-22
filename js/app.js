// מסך הזריקה + ניווט
import * as S from './store.js';
import { renderLane, renderDeck } from './lane.js';
import { classifyLeave, insights, openingPlan } from './analysis.js';
import { renderRead, renderBalls, renderMore, renderLearn, importTransfer } from './views.js';
import { geometry, arrowNum, bodyCfg, releaseOf, focalOf } from './geometry.js';
import { renderOnboard } from './onboard.js';
import { registerRecs, updateRecs, eventText } from './learnloop.js';
import { QUICK } from './tips.js'; import { drillBar, bindDrill, drillName } from './drill.js';
import { TERMS_VERSION, renderTermsGate } from './terms.js';

export const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const $ = (sel, root = document) => root.querySelector(sel);

let entry = null;      // מצב הזריקה שבהזנה
let entryKey = '';     // משחק-פריים-זריקה, כדי לאתחל רק כשעוברים זריקה
let startForm = { oil: 'fresh', startLane: 'L', alternate: true, type: 'training', liveTips: true, warmup: false };

export function toast(html, ms = 4200) {
  const t = $('#toast');
  t.innerHTML = html; t.hidden = false;
  clearTimeout(toast._t); toast._t = setTimeout(() => { t.hidden = true; }, ms);
}
$('#toast').addEventListener('click', () => { $('#toast').hidden = true; });

// ---------- ניווט ----------
const RENDER = { play: renderPlay, read: renderRead, balls: renderBalls, learn: renderLearn, more: renderMore };
export function go(view) {
  document.querySelectorAll('.tabs button').forEach(b => b.classList.toggle('active', b.dataset.view === view));
  document.querySelectorAll('.view').forEach(v => v.classList.toggle('active', v.id === 'view-' + view));
  renderHeader();
  RENDER[view]();
  window.scrollTo(0, 0);
}
document.querySelectorAll('.tabs button').forEach(b => b.addEventListener('click', () => go(b.dataset.view)));

function renderHeader() {
  const s = S.currentSession();
  // כשיש יותר משחקן אחד במכשיר, השם מופיע בכותרת כדי לא לרשום בטעות לשחקן הלא נכון
  $('#playerTag').textContent = S.listProfiles().length > 1 ? `👤 ${S.currentProfile()?.name || ''}` : '';
  if (!s) { $('#sessionInfo').textContent = 'אין אימון פעיל'; return; }
  const seg = S.segOf(s, S.curSegIdx(s));
  const nums = seg.laneNums.L || seg.laneNums.R ? ` · מסלולים ${seg.laneNums.L || '?'} | ${seg.laneNums.R || '?'}` : '';
  const pat = S.patternOf(s, S.curSegIdx(s));
  const patTxt = pat ? ` · 🛢️ ${pat.name ? pat.name + ' ' : ''}${pat.len ? pat.len + ' רגל' : ''}` : '';
  $('#sessionInfo').textContent = `${s.center}${nums} · ${S.OIL_LABEL[seg.oil]}${patTxt} · ${s.phase === 'warm' ? 'חימום' : `משחק ${s.games}`}`;
}

const laneName = (s, lane) => {
  const seg = S.segOf(s, S.curSegIdx(s));
  return `${lane === 'L' ? 'שמאל' : 'ימין'}${seg.laneNums[lane] ? ' · ' + seg.laneNums[lane] : ''}`;
};

// ---------- פתיחת אימון ----------
function renderStart(root) {
  const db = S.getDb();
  const f = startForm;
  root.innerHTML = `
  <div class="card">
    <h2>אימון חדש</h2>
    ${db.balls.length ? '' : `<p class="mute">💡 עוד לא הוספת כדורים. כדאי להוסיף אותם בלשונית "ארסנל" כדי לקבל המלצות על החלפת כדור.</p>`}
    <label>אולם</label><input type="text" id="sCenter" value="${esc(db.settings.center)}" placeholder="שם האולם">
    <label>סוג</label>
    <div class="seg" id="sType"><button data-v="training">אימון</button><button data-v="league">ליגה</button><button data-v="tournament">תחרות</button></div>
    <label>חימום לפני המשחק</label>
    <div class="seg" id="sWarm"><button data-v="1">כן, עם המלצות</button><button data-v="0">בלי חימום</button></div>
    <label>המלצות בזמן משחק</label>
    <div class="seg" id="sTips"><button data-v="1">כן</button><button data-v="0">רישום בלבד</button></div>
    <p class="mute" id="tipsNote" style="margin:4px 0 0"></p>
    <label>יד וסגנון</label>
    <div class="seg" id="sHand"><button data-v="R">ימין</button><button data-v="L">שמאל</button></div>
    <div class="seg" id="sStyle" style="margin-top:6px"><button data-v="one">יד אחת</button><button data-v="two">שתי ידיים</button></div>
    <div class="row">
      <div class="grow"><label>מסלול שמאל (לא חובה)</label><input type="number" id="sL" inputmode="numeric" placeholder="לתיעוד"></div>
      <div class="grow"><label>מסלול ימין (לא חובה)</label><input type="number" id="sR" inputmode="numeric" placeholder="לתיעוד"></div>
    </div>
    <p class="mute" style="margin:4px 0 0">מספרי המסלולים לא חובה. אם תמלא אותם, בפעם הבאה על אותם מסלולים תקבל תזכורת למה שעבד.</p>
    <label>מה מצב השימון? (חשוב לקריאה)</label>
    <div class="seg" id="sOil"><button data-v="fresh">🛢️ טרי</button><button data-v="used">〰️ משוחק</button><button data-v="dry">🏜️ יבש</button></div>
    <label>מתחילים במסלול</label>
    <div class="seg" id="sStart"><button data-v="L">שמאל</button><button data-v="R">ימין</button></div>
    <label>החלפת מסלול בכל פריים</label>
    <div class="seg" id="sAlt"><button data-v="1">כן (מצב ליגה)</button><button data-v="0">לא, מסלול אחד</button></div>
    ${patternFields(S.centerPattern(db.settings.center))}
    <label>הערה</label><input type="text" id="sNote" placeholder="למשל: אחרי ליגה, מזגן חזק...">
    <div style="height:12px"></div>
    <button class="btn pri big" id="sGo">יאללה, מתחילים</button>
  </div>`;
  const bindSeg = (id, key, conv = v => v) => {
    const el = $('#' + id, root);
    const sync = () => el.querySelectorAll('button').forEach(b => b.classList.toggle('on', conv(b.dataset.v) === f[key]));
    el.addEventListener('click', e => { const b = e.target.closest('button'); if (!b) return; f[key] = conv(b.dataset.v); sync(); });
    sync();
  };
  const tipsNote = () => { $('#tipsNote', root).textContent = f.liveTips ? '' : 'במצב רישום בלבד האפליקציה רק רושמת, בלי טיפים תוך כדי משחק. הקריאה המלאה נפתחת בסיום. בליגה ובתחרות כדאי לבדוק מול התקנון או האיגוד אם מותר להשתמש בטלפון לייעוץ.'; };
  $('#sType', root).addEventListener('click', e => { const b = e.target.closest('button'); if (!b) return; f.liveTips = b.dataset.v === 'training'; f.warmup = !f.liveTips; root.querySelectorAll('#sTips button').forEach(x => x.classList.toggle('on', (x.dataset.v === '1') === f.liveTips)); root.querySelectorAll('#sWarm button').forEach(x => x.classList.toggle('on', (x.dataset.v === '1') === f.warmup)); tipsNote(); });
  bindSeg('sType', 'type'); bindSeg('sOil', 'oil'); bindSeg('sTips', 'liveTips', v => v === '1'); bindSeg('sWarm', 'warmup', v => v === '1');
  $('#sTips', root).addEventListener('click', tipsNote); tipsNote();
  const bindSet = (id, key) => {
    const el = $('#' + id, root);
    const sync = () => el.querySelectorAll('button').forEach(b => b.classList.toggle('on', b.dataset.v === (db.settings[key] || (key === 'style' ? 'one' : 'R'))));
    el.addEventListener('click', e => { const b = e.target.closest('button'); if (!b) return; db.settings[key] = b.dataset.v; S.save(); sync(); });
    sync();
  };
  bindSet('sHand', 'hand'); bindSet('sStyle', 'style'); bindSeg('sStart', 'startLane'); bindSeg('sAlt', 'alternate', v => v === '1');
  $('#sGo', root).onclick = () => {
    const center = $('#sCenter', root).value.trim() || db.settings.center;
    db.settings.center = center;
    S.newSession({ center, type: f.type, laneL: $('#sL', root).value, laneR: $('#sR', root).value, oil: f.oil, startLane: f.startLane, alternate: f.alternate, liveTips: f.liveTips, warmup: f.warmup, note: $('#sNote', root).value });
    S.setPattern(S.currentSession(), readPattern(root));
    entryKey = '';
    renderPlay();
    toast(f.liveTips ? 'האימון התחיל. בלשונית <b>קריאה</b> מחכה לך עצה לפתיחה לפי מצב השימון 👀' : 'מצב רישום בלבד. בהצלחה! הקריאה תיפתח בסיום.');
  };
}

// ---------- מעבר מסלולים ----------
// ---------- תבנית שימון: שדות משותפים לפתיחת אימון ולעדכון באמצע ----------
function patternFields(p) {
  return `<label>תבנית השימון של האולם (אם ידוע)</label>
    <p class="mute" style="margin:0 0 6px">מדף התבנית שהאולם מפרסם, או ממי שמשמן. האורך הוא הנתון החשוב. אם מולא מהפעם הקודמת, בדוק שזו התבנית של היום.</p>
    <div class="row">
      <div class="grow" style="flex-basis:100%"><input type="text" id="pName" value="${esc(p?.name || '')}" placeholder="שם התבנית, למשל House Shot"></div>
      <div class="grow"><input type="number" id="pLen" inputmode="numeric" value="${p?.len ?? ''}" placeholder="אורך (רגל)"></div>
      <div class="grow"><input type="number" id="pVol" inputmode="decimal" step="0.1" value="${p?.vol ?? ''}" placeholder='נפח (מ"ל)'></div>
    </div>`;
}
const readPattern = root => ({ name: $('#pName', root)?.value, len: $('#pLen', root)?.value, vol: $('#pVol', root)?.value });

function renderPatternForm(root, s) {
  const seg = S.segOf(s, S.curSegIdx(s));
  const cur = S.patternOf(s, S.curSegIdx(s)) || S.centerPattern(s.center);
  let oil = seg.oil, mode = 'fix';
  root.innerHTML = `<div class="card"><h2>🛢️ עדכון שימון</h2>
    <p class="mute">אפשר לעדכן בכל רגע: אם רשמת מצב לא נכון, אם המסלול משומן מחדש, או אם התבנית שונה ממה שחשבת.</p>
    <label>מה קרה?</label>
    <div class="seg" id="cMode"><button data-v="fix" class="on">תיקון: כך זה היה מההתחלה</button><button data-v="now">השימון השתנה עכשיו</button></div>
    <p class="mute" id="cModeTxt" style="margin:4px 0 0"></p>
    <label>מצב השימון</label>
    <div class="seg" id="cOil"><button data-v="fresh">🛢️ טרי</button><button data-v="used">〰️ משוחק</button><button data-v="dry">🏜️ יבש</button></div>
    ${patternFields(cur)}
    <div style="height:12px"></div>
    <div class="row"><button class="btn pri grow" id="pSave">שמור</button><button class="btn" id="pClear">אין תבנית ידועה</button><button class="btn" id="pBack">ביטול</button></div></div>`;
  const sync = () => {
    root.querySelectorAll('#cOil button').forEach(b => b.classList.toggle('on', b.dataset.v === oil));
    root.querySelectorAll('#cMode button').forEach(b => b.classList.toggle('on', b.dataset.v === mode));
    $('#cModeTxt', root).textContent = mode === 'fix'
      ? 'הזריקות שכבר נרשמו יקבלו את המצב המתוקן, והקריאה תמשיך כרגיל.'
      : 'הקריאה מתחילה מחדש מהזריקה הבאה (באותם מסלולים ובאותו משחק), כי הזריקות הקודמות היו בתנאים אחרים.';
  };
  $('#cOil', root).onclick = e => { const b = e.target.closest('button'); if (b) { oil = b.dataset.v; sync(); } };
  $('#cMode', root).onclick = e => { const b = e.target.closest('button'); if (b) { mode = b.dataset.v; sync(); } };
  sync();
  const apply = p => {
    if (mode === 'now') { S.newSegment(s, seg.laneNums.L, seg.laneNums.R, oil, true); entryKey = ''; }
    else S.setSegOil(s, oil);
    S.setPattern(s, p);
    renderPlay();
  };
  $('#pSave', root).onclick = () => {
    const raw = readPattern(root), p = S.cleanPattern(raw);
    if (!p && (raw.name?.trim() || raw.len)) { toast('האורך צריך להיות בין 25 ל-60 רגל'); return; }
    apply(p);
    toast(`${mode === 'now' ? 'נפתחה קריאה חדשה' : 'עודכן'}: ${S.OIL_LABEL[oil]}${p ? ` · ${p.name ? esc(p.name) + ' ' : ''}${p.len ? `${p.len} רגל (שבירה צפויה בסביבות בורד ${p.len - 31})` : ''}` : ''}.`, 6000);
  };
  $('#pClear', root).onclick = () => apply(null);
  $('#pBack', root).onclick = () => renderPlay();
}

function renderSwitch(root, s) {
  let oil = 'used';
  root.innerHTML = `<div class="card"><h2>מעבר לזוג מסלולים אחר</h2>
    <p class="mute">ההמלצות מעכשיו יתבססו רק על הזריקות במסלולים החדשים. אם המשחק הנוכחי באמצע, המשחק הבא יתחיל במסלולים החדשים.</p>
    <div class="row"><div class="grow"><label>מסלול שמאל (לא חובה)</label><input type="number" id="wL" inputmode="numeric"></div>
    <div class="grow"><label>מסלול ימין (לא חובה)</label><input type="number" id="wR" inputmode="numeric"></div></div>
    <label>מצב השימון במסלולים החדשים</label>
    <div class="seg" id="wOil"><button data-v="fresh">🛢️ טרי</button><button data-v="used" class="on">〰️ משוחק</button><button data-v="dry">🏜️ יבש</button></div>
    <div style="height:12px"></div>
    <div class="row"><button class="btn pri grow" id="wGo">עברתי</button><button class="btn" id="wNo">ביטול</button></div></div>`;
  $('#wOil', root).onclick = e => { const b = e.target.closest('button'); if (!b) return; oil = b.dataset.v; root.querySelectorAll('#wOil button').forEach(x => x.classList.toggle('on', x === b)); };
  $('#wNo', root).onclick = () => renderPlay();
  $('#wGo', root).onclick = () => { S.newSegment(s, $('#wL', root).value, $('#wR', root).value, oil); entryKey = ''; renderPlay(); toast('מסלולים חדשים, קריאה חדשה. התחל מהקו הבסיסי שלך ותן לפינים לדבר.'); };
}

// ---------- לוח ניקוד ----------
function scoreboard(shots, s, curFrame) {
  const { totals, frames } = S.scoreGame(shots);
  return `<div class="score">${frames.map((fr, i) => `
    <div class="f ${i === curFrame ? 'cur' : ''}">
      <div class="marks">${fr.map((sh, j) => { const m = S.shotMark(sh, j > 0 && fr[j - 1].left.length > 0 ? fr[j - 1] : null); return `<b class="${m === 'X' || m === '/' ? 'x' : ''}">${m}</b>`; }).join('')}</div>
      <div class="tot">${totals[i] ?? ''}</div>
      <div class="ln">${fr[0] ? (fr[0].lane === 'L' ? 'ש' : 'י') : i + 1}</div>
    </div>`).join('')}</div>`;
}

// ---------- מסך הזריקה ----------
function lastFor(shots, lane, first) {
  for (let i = shots.length - 1; i >= 0; i--) {
    const x = shots[i];
    if (x.lane === lane && (first ? x.shot === 0 && x.rack.length === 10 : true)) return x;
  }
  return null;
}

// עומק לכדור ספייר: מה שעשית בספייר הקודם באותו צד, אחרת 40 ס"מ
const lastSpare = (shots, lane) => [...shots].reverse().find(x => x.lane === lane && x.rack.length < 10);

function initEntry(s, ctx, game) {
  const segIdx = S.curSegIdx(s);
  const segShots = S.sessionShots(s.id).filter(x => (x.seg ?? 0) === segIdx);
  const lane = ctx.lane || S.defaultLane(s, game, ctx.frame);
  const isFirst = ctx.rack.length === 10;
  // ברירת מחדל: הזריקה הקודמת באותו צד בקטע הנוכחי, ואם אין: תוכנית הפתיחה, ואם אין: עמדת המוצא
  const realFirst = segShots.filter(x => !x.warm && x.lane === lane && x.rack.length === 10);
  const plan = !ctx.warm && s.plan?.[lane] && !realFirst.length ? s.plan[lane] : null;
  const home = S.getDb().settings.home || { board: 18, cm: 0, arrow: 10 };
  const fallback = plan ? { stance: { board: plan.stance, cm: plan.cm }, arrow: plan.arrow, ball: plan.ball } : { stance: { board: home.board, cm: home.cm || 0 }, arrow: home.arrow };
  const prev = plan ? fallback : (lastFor(segShots, lane, isFirst) || (isFirst ? fallback : lastFor(S.sessionShots(s.id), lane, isFirst)));
  const spareBall = S.getDb().balls.find(b => b.spareOnly);
  const lastFirst = lastFor(segShots, lane, true);
  entry = {
    lane, left: [],
    ball: isFirst ? (prev?.ball || S.getDb().balls.find(b => !b.spareOnly)?.id || null) : (spareBall?.id || lastFirst?.ball || null),
    stance: { board: prev?.stance?.board ?? null, cm: isFirst ? (prev?.stance?.cm ?? 0) : (lastSpare(S.sessionShots(s.id), lane)?.stance?.cm ?? 40) },
    arrow: isFirst ? prev?.arrow ?? null : null,
    bp: isFirst && !plan ? prev?.bp ?? null : null,
    speed: prev?.speed ?? '',
    quality: null,
    exec: 'ok', miss: 'ok', actual: null, straight: false,
  };
  // סיום רגל: שומרים את הדריפט האחרון שסימנת בצד הזה, אחרת הדריפט הרגיל מההגדרות
  const lastDrift = [...segShots].reverse().find(x => x.lane === lane && x.finishSet && Number.isFinite(x.stance?.board));
  const drift = lastDrift ? lastDrift.finish - lastDrift.stance.board : bodyCfg(S.getDb().settings).drift;
  entry.finish = entry.stance.board != null ? clamp(entry.stance.board + drift, 1, 39) : null;
  entry.finishSet = false;
}

// הזזת עמידה שומרת על אותו דריפט
function setStance(b) {
  const d = entry.finish != null && entry.stance.board != null ? entry.finish - entry.stance.board : bodyCfg(S.getDb().settings).drift;
  entry.stance.board = b;
  entry.finish = clamp(b + d, 1, 39);
}

export function renderPlay() {
  renderHeader();
  const root = $('#view-play');
  // שחקן חדש (מכשיר חדש או פרופיל חדש): קודם מסך פתיחה
  if (!S.getDb().settings.onboarded) {
    return renderOnboard(root, {
      onImport: code => importTransfer(code),
      onDone: fresh => { renderPlay(); renderHeader(); if (fresh) toast('מוכן! עכשיו הוסף את הכדורים שלך בלשונית <b>ארסנל</b>, ואחר כך פתח אימון כאן.', 6000); },
    });
  }
  const st0 = S.getDb().settings;
  if (st0.termsOk !== TERMS_VERSION) return renderTermsGate(root, () => { st0.termsOk = TERMS_VERSION; S.save(); renderPlay(); });
  const s = S.currentSession();
  if (!s) return renderStart(root);
  const warm = s.phase === 'warm';
  const game = warm ? -1 : s.games - 1;
  const shots = S.gameShots(s.id, game);
  const ctx = warm ? { frame: shots.length, shot: 0, rack: [...S.ALL_PINS], warm: true } : S.nextShot(shots);
  if (!ctx) {
    const { total } = S.scoreGame(shots);
    root.innerHTML = `${scoreboard(shots, s, -1)}
      <div class="card" style="margin-top:12px;text-align:center"><h2>משחק ${game + 1} הסתיים: ${total}</h2>
      <p class="mute">לפני המשחק הבא, הצץ ב"קריאה" ובדוק מה המסלול אומר.</p>
      <div class="actions"><button class="btn pri" id="gNext">משחק הבא</button><button class="btn" id="gRead">🧠 קריאה</button>
      <button class="btn" id="gSwitch">עברתי מסלולים</button><button class="btn danger" id="gEnd">סיום אימון</button>
      <button class="btn full sm" id="gUndo">↩︎ בטל זריקה אחרונה</button></div></div>`;
    $('#gNext').onclick = () => { s.games++; S.save(); entryKey = ''; renderPlay(); };
    $('#gRead').onclick = () => go('read');
    $('#gSwitch').onclick = () => renderSwitch(root, s);
    $('#gEnd').onclick = () => endSession();
    $('#gUndo').onclick = () => { S.undoShot(s.id); entryKey = ''; renderPlay(); };
    return;
  }
  const key = `${s.id}-${game}-${ctx.frame}-${ctx.shot}-${S.curSegIdx(s)}`;
  if (key !== entryKey) { initEntry(s, ctx, warm ? 0 : game); entryKey = key; }
  const planNow = !warm && s.plan?.[entry.lane] && !S.sessionShots(s.id).some(x => !x.warm && x.lane === entry.lane && x.seg === S.curSegIdx(s)) ? s.plan[entry.lane] : null;
  const isFirst = ctx.rack.length === 10;
  const balls = S.getDb().balls;
  const unit = S.getDb().settings.speedUnit === 'mph' ? 'מייל' : 'קמ"ש';
  root.innerHTML = `
    ${warm ? `<div class="card warmbar"><b>🔥 חימום</b> · ${shots.length} זריקות · ההמלצות פעילות<button class="btn pri sm" id="warmDone">סיימתי חימום ←</button></div>` : scoreboard(shots, s, ctx.frame)}
    <div class="shothead">
      <div><div class="title">${warm ? `זריקת חימום ${ctx.frame + 1}` : `פריים ${ctx.frame + 1} · ${['כדור ראשון', 'כדור שני', 'כדור שלישי'][ctx.shot]}${isFirst ? '' : ' (ספייר)'}`}</div>
      <div class="mute">${warm ? 'רק כדור ראשון, בלי ניקוד' : `משחק ${game + 1}`}</div></div>
      <button class="lanetag" id="laneTog" ${ctx.shot > 0 ? 'disabled' : ''}>מסלול ${laneName(s, entry.lane)} ⇄</button>
    </div>
    ${balls.length ? `<div class="chips" id="ballChips">${balls.map(b => `<button data-id="${b.id}" class="${b.id === entry.ball ? 'on' : ''}">${esc(b.name)}${b.spareOnly ? ' (ספייר)' : ''}</button>`).join('')}</div>` : `<p class="mute">אין כדורים בארסנל. <a href="#" id="toBalls" style="color:var(--acc)">הוסף כדור</a></p>`}
    ${drillBar(s, warm)}${planNow ? `<p class="mute" style="margin:6px 0 0">📋 לפי תוכנית הפתיחה: עמידה ${planNow.stance}, ${arrowNum(planNow.arrow) ? `חץ ${arrowNum(planNow.arrow)}` : `בורד ${planNow.arrow}`}</p>` : ''}
    <div class="entry" style="margin-top:8px">
      <div class="lanebox"><svg id="laneSvg"></svg></div>
      <div class="ctl">
        ${stepper('st', 'עמידה (בורד)', entry.stance.board)}
        ${stepper('fin', 'סיום רגל (בורד)', entry.finish)}
        ${stepper('cm', 'עומק: ס"מ קדימה', entry.stance.cm)}
        ${stepper('arrow', 'חץ (בורד)', entry.arrow)}
        ${stepper('bp', 'שבירה (בורד)', entry.bp)}
        <div class="stepper"><div class="lbl">מהירות (${unit})</div><input type="number" id="speed" inputmode="decimal" step="0.1" value="${esc(entry.speed)}" placeholder="—"></div>
      </div>
    </div>
    <p class="mute" style="margin:6px 0 0">נגיעה במסלול: למטה = עמידה, באמצע = חץ, למעלה = שבירה.</p>
    <div class="card" style="margin-top:10px">
      <h3>${isFirst ? 'אילו פינים נשארו עומדים?' : 'מה נשאר אחרי הכדור השני?'}</h3>
      <div class="deck"><svg id="deckSvg"></svg></div>
      ${isFirst ? `<label>איך הכדור נכנס? (לא חובה)</label>
      <div class="chips" id="qChips">${[['light', 'חלש'], ['pocket', 'כיס'], ['high', 'גבוה'], ['brooklyn', 'ברוקלין'], ['strong10', S.getDb().settings.hand === 'L' ? '7 חזק (4 עף מסביב)' : '10 חזק (6 עף מסביב)']].map(([v, t]) => `<button data-v="${v}" class="${entry.quality === v ? 'on' : ''}">${t}</button>`).join('')}</div>` : ''}
      <label>פגעת בחץ שרצית?</label>
      <div class="chips" id="xChips">${[['ok', '✓ פגעתי בחץ שרציתי'], ['left', 'יצא שמאלה מהחץ'], ['right', 'יצא ימינה מהחץ'], ['unsure', 'לא בטוח']].map(([v, t]) => `<button data-v="${v}" class="${entry.miss === v ? 'on' : ''}">${t}</button>`).join('')}</div>
      <div class="chips"><button id="straightTog" class="${entry.straight ? 'on warnc' : ''}">↯ זרקתי ישר/חזק מדי</button></div>
      <div id="actualRow" class="actual" ${entry.miss === 'left' || entry.miss === 'right' ? '' : 'hidden'}>
        <span>באיזה בורד הכדור עבר? (אם זוכר)</span>
        <div class="ctr"><button data-act="-1">−</button><b id="v-act">${entry.actual ?? '—'}</b><button data-act="1">+</button><button class="forget" data-act="0">לא זוכר</button></div>
      </div>
      <div class="actions">
        <button class="btn pri full big" id="saveShot"></button>
        <button class="btn sm" id="undo">↩︎ בטל אחרונה</button>
        <button class="btn sm" id="switchLanes">עברתי מסלולים</button><button class="btn sm danger" id="endNow">סיום אימון</button>
        <button class="btn sm full" id="patBtn">🛢️ עדכון שימון: מצב ותבנית</button>
      </div>
    </div>`;
  const draw = () => {
    const hand = S.getDb().settings.hand;
    // הציור משקף את התוצאה: אחרי שסימנת פינים או "איך נכנס", הקו מסתיים בנקודת הפגיעה האמיתית
    const marked = entry.left.length > 0 || !!entry.quality;
    const cfg = bodyCfg(S.getDb().settings);
    const view = { ...entry, rack: ctx.rack, marked, release: entry.finish != null ? releaseOf(entry.finish, cfg) : undefined, cat: isFirst ? classifyLeave({ left: entry.left, quality: entry.quality }, hand) : null };
    renderLane($('#laneSvg'), view, hand, (k, b) => {
      if (k === 'stance') setStance(b); else entry[k] = b;
      draw(); syncSteppers();
    });
    renderDeck($('#deckSvg'), ctx.rack, entry.left, p => {
      entry.left = entry.left.includes(p) ? entry.left.filter(x => x !== p) : [...entry.left, p];
      draw();
    });
    const corner = S.getDb().settings.hand === 'L' ? 7 : 10;
    const only10 = entry.left.length === 1 && entry.left[0] === corner;
    const s10 = root.querySelector('#qChips [data-v=strong10]');
    if (s10) { s10.hidden = !only10; if (!only10 && entry.quality === 'strong10') { entry.quality = null; s10.classList.remove('on'); } }
    const clear = entry.left.length === 0;
    $('#saveShot').textContent = clear ? (isFirst ? 'X  סטרייק!' : '/  ספייר!') : `שמור (${ctx.rack.length - entry.left.length} פינים)`;
  };
  const syncSteppers = () => {
    $('#v-st').textContent = entry.stance.board ?? '—';
    $('#v-fin').textContent = entry.finish ?? '—';
    const dr = entry.finish != null && entry.stance.board != null ? entry.finish - entry.stance.board : null;
    const inW = S.getDb().settings.hand === 'L' ? 'ימינה' : 'שמאלה', outW = S.getDb().settings.hand === 'L' ? 'שמאלה' : 'ימינה';
    $('#s-fin').textContent = dr === null ? '' : `דריפט ${dr === 0 ? '0' : `${Math.abs(dr)} ${dr > 0 ? inW : outW}`}${entry.finishSet ? '' : ' (רגיל)'}`;
    $('#v-cm').textContent = entry.stance.cm ?? 0;
    root.querySelectorAll('.depth [data-depth]').forEach(b => b.classList.toggle('on', Number(b.dataset.depth) === (entry.stance.cm ?? 0)));
    $('#v-arrow').textContent = entry.arrow ?? '—';
    $('#v-bp').textContent = entry.bp ?? '—';
    root.querySelectorAll('.rf [data-rf]').forEach(b => b.classList.toggle('on', Number(b.dataset.rf) === entry.bp));
    const g = geometry(entry.stance.board, entry.arrow, entry.bp);
    const cfgB = bodyCfg(S.getDb().settings), finB = entry.finish ?? (entry.stance.board != null ? entry.stance.board + cfgB.drift : null);
    const foc = finB != null && entry.arrow != null ? Math.round(focalOf(releaseOf(finB, cfgB), entry.arrow)) : null;
    $('#s-arrow').textContent = [arrowNum(entry.arrow) ? `חץ ${arrowNum(entry.arrow)}` : '', g.launch !== undefined ? `זווית ${g.launch}` : '', foc !== null ? (foc < 1 ? 'מוקד בתעלה' : `מוקד ${foc}`) : ''].filter(Boolean).join(' · ');
    $('#s-bp').textContent = g.swing !== undefined ? `${g.swing} מהחץ · ${g.hook} לכיס` : '';
  };
  draw(); syncSteppers();
  root.querySelectorAll('.stepper [data-k]').forEach(btn => btn.addEventListener('click', () => {
    const k = btn.dataset.k, d = Number(btn.dataset.d);
    if (k === 'st') setStance(clamp((entry.stance.board ?? 20) + d, 1, 39));
    else if (k === 'fin') { entry.finish = clamp((entry.finish ?? entry.stance.board ?? 20) + d, 1, 39); entry.finishSet = true; }
    else if (k === 'cm') entry.stance.cm = clamp((entry.stance.cm ?? 0) + d * 10, 0, 200);
    else entry[k] = clamp((entry[k] ?? (k === 'arrow' ? 15 : 10)) + d, 1, 39);
    draw(); syncSteppers();
  }));
  $('#speed').oninput = e => { entry.speed = e.target.value; };
  $('#laneTog').onclick = () => { entry.lane = entry.lane === 'L' ? 'R' : 'L'; renderPlay(); };
  $('#ballChips')?.addEventListener('click', e => { const b = e.target.closest('button'); if (!b) return; entry.ball = b.dataset.id; renderPlay(); });
  $('#toBalls')?.addEventListener('click', e => { e.preventDefault(); go('balls'); });
  // "שמאלה/ימינה מהחץ" מתורגם ל"פנימה/החוצה" לפי יד הזריקה (לימני שמאלה = פנימה)
  const handNow = S.getDb().settings.hand;
  $('#xChips').addEventListener('click', e => {
    const b = e.target.closest('button'); if (!b) return;
    entry.miss = b.dataset.v;
    entry.exec = b.dataset.v === 'left' ? (handNow === 'R' ? 'in' : 'out') : b.dataset.v === 'right' ? (handNow === 'R' ? 'out' : 'in') : b.dataset.v;
    if (!['left', 'right'].includes(entry.miss)) entry.actual = null;
    root.querySelectorAll('#xChips button').forEach(x => x.classList.toggle('on', x === b));
    $('#actualRow').hidden = !['left', 'right'].includes(entry.miss);
    $('#v-act').textContent = entry.actual ?? '—';
  });
  $('#straightTog').onclick = e => { entry.straight = !entry.straight; e.currentTarget.classList.toggle('on', entry.straight); e.currentTarget.classList.toggle('warnc', entry.straight); }; bindDrill(root, s, renderPlay);
  root.querySelectorAll('#actualRow [data-act]').forEach(btn => btn.addEventListener('click', () => {
    const d = Number(btn.dataset.act);
    if (!d) entry.actual = null;
    else {
      // בורד גבוה = שמאלה לימני. ההתחלה: בורד אחד מעבר לחץ לכיוון שסימנת
      const inward = entry.exec === 'in' ? 1 : -1;
      const start = (entry.arrow ?? 10) + inward;
      entry.actual = entry.actual == null ? clamp(start, 1, 39) : clamp(entry.actual + d, 1, 39);
    }
    $('#v-act').textContent = entry.actual ?? '—';
  }));
  root.querySelectorAll('.depth [data-depth]').forEach(btn => btn.addEventListener('click', () => { entry.stance.cm = Number(btn.dataset.depth); draw(); syncSteppers(); }));
  root.querySelectorAll('.rf [data-rf]').forEach(btn => btn.addEventListener('click', () => { entry.bp = Number(btn.dataset.rf); draw(); syncSteppers(); }));
  root.querySelectorAll('.stepper [data-forget]').forEach(btn => btn.addEventListener('click', () => { entry[btn.dataset.forget] = null; draw(); syncSteppers(); }));
  $('#qChips')?.addEventListener('click', e => { const b = e.target.closest('button'); if (!b) return; entry.quality = entry.quality === b.dataset.v ? null : b.dataset.v; renderPlay(); });
  $('#undo').onclick = () => { if (S.undoShot(s.id)) { entryKey = ''; renderPlay(); toast('הזריקה האחרונה בוטלה'); } };
  $('#switchLanes').onclick = () => renderSwitch(root, s); $('#endNow').onclick = () => endSession(ctx.frame > 0 || ctx.shot > 0);
  $('#patBtn').onclick = () => renderPatternForm(root, s);
  $('#warmDone')?.addEventListener('click', () => renderWarmEnd(root, s));
  $('#saveShot').onclick = () => saveShot(s, ctx, game);
}

// שבירה לפי ה-Range finders (בורד 10 ו-15, בערך 40 רגל): מה שבאמת רואים מהגישה. כל כפתור = בורד משוער
const RF = [[8, 'חוץ'], [10, '10'], [12, 'בין'], [15, '15'], [17, 'פנים']];
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
function stepper(k, lbl, v) {
  return `<div class="stepper ${k}"><div class="lbl">${lbl}</div><div class="ctr">
    <button data-k="${k}" data-d="-1">−</button><span class="val" id="v-${k}">${v ?? (k === 'cm' ? 0 : '—')}</span><button data-k="${k}" data-d="1">+</button></div>
    ${k === 'cm' ? `<div class="depth">${[[0, 'אחורה'], [20, 'אמצע'], [40, 'ספייר']].map(([v, t]) => `<button data-depth="${v}" class="${(v ?? 0) === (entry.stance.cm ?? 0) ? 'on' : ''}">${t}</button>`).join('')}</div>` : ''}
    ${k === 'bp' ? `<div class="sub rfl">לפי הריינג' פיינדרס</div><div class="depth rf" title="ריינג' פיינדרס בבורד 10 ובבורד 15">${RF.map(([v, t]) => `<button data-rf="${v}" class="${v === entry.bp ? 'on' : ''}">${t}</button>`).join('')}</div>` : ''}
    ${k === 'fin' ? `<div class="sub" id="s-fin"></div>` : ''}
    ${k === 'arrow' || k === 'bp' ? `<div class="sub" id="s-${k}"></div><button class="forget" data-forget="${k}">לא זוכר</button>` : ''}</div>`;
}


function saveShot(s, ctx, game) {
  const hand = S.getDb().settings.hand;
  const shot = {
    sessionId: s.id, seg: S.curSegIdx(s), game, frame: ctx.frame, shot: ctx.shot, lane: entry.lane,
    ball: entry.ball, stance: { ...entry.stance }, finish: entry.finish, finishSet: !!entry.finishSet, arrow: entry.arrow, bp: entry.bp,
    speed: entry.speed === '' ? null : Number(entry.speed), quality: entry.quality, exec: entry.exec,
    ...(entry.straight ? { straight: true } : {}), ...(s.drill && !ctx.warm ? { drill: s.drill } : {}),
    // אם ידוע באיזה בורד הכדור עבר: החץ = מה שקרה בפועל, והיעד נשמר בנפרד
    ...(entry.actual != null && entry.exec !== 'ok' ? { target: entry.arrow, arrow: entry.actual, actualKnown: true } : {}),
    rack: [...ctx.rack], left: [...entry.left].sort((a, b) => a - b),
    ...(ctx.warm ? { warm: true } : {}),
    ballGrit: S.ballById(entry.ball)?.grit || null,   // צילום מצב המשטח בזמן הזריקה
  };
  S.addShot(shot);
  // לולאת למידה: האם ביצעת המלצה? האם אפשר כבר לבדוק אם היא עזרה?
  const evs = updateRecs(s);
  const evHtml = evs.map(e => `<div style="margin-top:6px">${esc(eventText(e))}</div>`).join('');
  if (s.liveTips === false && !ctx.warm) { toast('נרשם ✓', 1200); entryKey = ''; renderPlay(); return; }
  if (ctx.rack.length === 10 && (shot.straight || shot.drill)) {
    toast(shot.drill ? `נרשם כתרגול ${drillName(shot.drill)} 🧪. נכנס לניקוד ולכרטיס התרגול, לא לקריאת המסלול ולא להמלצות.` : 'נרשם כזריקה ישרה/חזקה. היא נכנסת לניקוד ולכרטיס "נטייה", אבל לא לקריאת המסלול: הפעם השתנתה הזריקה, לא המסלול.');
  } else if (ctx.rack.length === 10 && shot.exec !== 'ok') {
    const side = entry.miss === 'left' ? 'שמאלה' : 'ימינה';
    toast(shot.exec === 'unsure' ? 'נרשם. זריקה שלא בטוח לגביה לא נכנסת לקריאת המסלול, רק לניקוד.'
      : shot.actualKnown ? `נרשם: כיוונת ל${arrowNum(shot.target) ? `חץ ${arrowNum(shot.target)} (בורד ${shot.target})` : `בורד ${shot.target}`}, הכדור עבר בבורד ${shot.arrow} (${side}). הזריקה נכנסת לקריאה לפי מה שקרה בפועל, וגם למרחב הטעות.`
      : `נרשם: יצא ${side} מהחץ. בלי בורד מדויק הזריקה לא נכנסת להמלצות, אבל היא מלמדת כמה מרחב טעות יש במסלול.`);
  } else if (ctx.rack.length === 10) {
    const cat = classifyLeave(shot, hand);
    let msg = QUICK[cat];
    const segShots = S.sessionShots(s.id).filter(x => (x.seg ?? 0) === shot.seg);
    const ins = insights(segShots, shot.lane, hand, s);
    registerRecs(s, shot.lane, ins);
    const warn = ins.find(i => i.level === 'warn');
    if (warn) msg += `<br><b style="color:var(--warn)">⚠️ ${esc(warn.title)}</b>: פרטים בלשונית קריאה`;
    toast(msg + evHtml, evHtml ? 8000 : 4200);
  } else if (evHtml) toast(evHtml, 7000);
  entryKey = '';
  renderPlay();
}

// ---------- סיום חימום: תוכנית פתיחה ----------
function renderWarmEnd(root, s) {
  const hand = S.getDb().settings.hand;
  const segShots = S.sessionShots(s.id).filter(x => (x.seg ?? 0) === S.curSegIdx(s));
  const plan = { L: openingPlan(segShots, 'L', hand, s), R: openingPlan(segShots, 'R', hand, s) };
  const card = lane => {
    const p = plan[lane], b = S.ballById(p.ball);
    return `<div class="card"><h3>מסלול ${laneName(s, lane)}</h3>
      <div class="stats"><div class="stat"><div class="v">${p.stance}${p.cm ? `<small> +${p.cm}</small>` : ''}</div><div class="k">עמידה</div></div>
      <div class="stat"><div class="v">${arrowNum(p.arrow) ? `חץ ${arrowNum(p.arrow)}` : p.arrow}</div><div class="k">בורד ${p.arrow}</div></div>
      <div class="stat"><div class="v" style="font-size:.95rem">${esc(b?.name || '—')}</div><div class="k">כדור</div></div></div>
      <p style="line-height:1.5">${esc(p.reason)}</p>
      ${p.oil ? `<p class="mute">אורך שימון משוער: ~${p.oil.len} רגל (ביטחון ${p.oil.conf})</p>` : ''}
      <p class="mute">${p.n} זריקות חימום במסלול הזה.</p></div>`;
  };
  root.innerHTML = `<div class="card"><h2>📋 תוכנית פתיחה</h2><p class="mute">זה מה שהחימום לימד אותנו. המספרים ייכנסו אוטומטית לזריקה הראשונה בכל מסלול.${s.liveTips === false ? ' מכאן והלאה: רישום בלבד, בלי המלצות.' : ''}</p></div>
    ${card('L')}${card('R')}
    <div class="actions"><button class="btn pri full big" id="goGame">מתחילים משחק 1</button><button class="btn full sm" id="backWarm">↩︎ עוד זריקות חימום</button></div>`;
  $('#goGame').onclick = () => { s.plan = plan; s.phase = 'play'; S.save(); entryKey = ''; renderPlay(); toast('בהצלחה! 🎳'); };
  $('#backWarm').onclick = () => renderPlay();
}

function endSession(midGame = false) {
  if (!confirm(`לסיים את האימון?${midGame ? ' המשחק הנוכחי לא הושלם, והוא יישמר עם הניקוד עד הפריים האחרון שזרקת.' : ''} הנתונים נשמרים ותוכל לראות אותם בהיסטוריה.`)) return;
  const db = S.getDb();
  db.viewSessionId = db.currentSessionId;
  db.currentSessionId = null; S.save();
  go('read');
}

// ---------- אתחול ----------
renderPlay();
// נפתח מקישור העברה: מייבאים (אחרי אישור) ומנקים את הקישור מהכתובת
if (location.hash.startsWith('#xfer=')) {
  const code = location.hash;
  history.replaceState(null, '', location.pathname);
  setTimeout(() => { if (importTransfer(code)) go('balls'); }, 300);
}
if ('serviceWorker' in navigator && location.protocol !== 'file:') navigator.serviceWorker.register('sw.js').catch(() => {});

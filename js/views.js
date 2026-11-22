// מסכי קריאה, ארסנל, עוד (היסטוריה+הגדרות), לימוד
import * as S from './store.js';
import { laneStats, oilEstimate, oilLabel, insights, compareLanes, startAdvice, LEAVE_LABEL, sourceOf, SRC_LABEL, measuredDrift } from './analysis.js';
import { esc, go, toast, renderPlay } from './app.js';
import { LEARN_HTML } from './learn.js';
import { TERMS_LIST, TERMS_SHORT } from './terms.js';
import { arrowNum, MOVE_INFO, geometry } from './geometry.js';
import { registerRecs, learnedSummary, KIND_LABEL } from './learnloop.js';

const $ = (sel, root = document) => root.querySelector(sel);
export const APP_VERSION = '2.2';
let readScope = 'seg';   // seg | session
let unlocked = null;     // מזהה אימון שנפתח למרות מצב רישום בלבד

const insHtml = i => `<div class="ins ${i.level}"><h4>${esc(i.title)}</h4>
  <p><b>מה ראינו:</b> ${esc(i.seen)}</p><p><b>מה זה אומר:</b> ${esc(i.means)}</p>
  <p><b>מה לעשות:</b> ${esc(i.todo)}</p>${i.moves?.length ? movesTable(i.moves, i.rec) : ''}${i.track ? `<p class="track">📊 ${esc(i.track)}</p>` : ''}<p><b>למה:</b> ${esc(i.why)}</p>${srcLine(i.title)}</div>`;

// מקור ורמת ביטחון: כדי שתדע על מה לסמוך
const srcLine = title => { const s = sourceOf(title); return `<div class="src">${s.kinds.map(k => `<span class="tag ${k}">${SRC_LABEL[k]}</span>`).join('')}${s.ref ? `<span class="ref">${esc(s.ref)}</span>` : ''}</div>`; };

// השוואת שלוש ההזזות: מה כל אחת עושה לזווית ולשבירה
const movesTable = (moves, rec) => `<table class="moves"><thead><tr><th>הזזה</th><th>עמידה</th><th>חץ</th><th>זווית</th><th>שבירה צפויה</th><th>מוקד</th></tr></thead><tbody>
  ${moves.map(m => `<tr class="${m.type === rec ? 'rec' : ''}"><td>${m.type === rec ? '✓ ' : ''}${esc(m.name)}</td><td>${m.stance}</td><td>${arrowNum(m.arrow) ? `חץ ${arrowNum(m.arrow)}` : m.arrow}</td><td>${m.launch}</td><td>${m.bp}</td><td>${m.focal == null ? '—' : m.focal < 1 ? 'תעלה' : m.focal}</td></tr>`).join('')}
  </tbody></table><p class="mute" style="font-size:.8rem">${esc(MOVE_INFO[rec].what)} השבירה הצפויה היא הערכה גאומטרית של האפליקציה, מכוילת לזריקות שלך.</p>`;

// ---------- קריאה ----------
export function renderRead() {
  const root = $('#view-read');
  const db = S.getDb();
  const s = S.currentSession() || db.sessions.find(x => x.id === db.viewSessionId) || db.sessions[db.sessions.length - 1];
  if (!s) { root.innerHTML = `<div class="card"><h2>אין עדיין נתונים</h2><p class="mute">התחל אימון בלשונית "זריקה", ואחרי כמה זריקות יופיעו כאן קריאה ותובנות.</p></div>`; return; }
  const hand = db.settings.hand;
  const segIdx = S.curSegIdx(s), seg = S.segOf(s, segIdx);
  const all = S.sessionShots(s.id);
  const shots = readScope === 'seg' ? all.filter(x => (x.seg ?? 0) === segIdx) : all;
  const live = s.id === db.currentSessionId;
  if (live && s.liveTips === false && s.phase !== 'warm' && unlocked !== s.id) {
    root.innerHTML = `<div class="card lock"><h2>🔒 מצב רישום בלבד</h2>
      <p class="mute">באימון הזה בחרת לא לקבל המלצות תוך כדי משחק. הקריאה המלאה תיפתח כשתסיים את האימון בלשונית "זריקה".</p>
      <p class="mute">בליגה ובתחרות כדאי לבדוק מול התקנון או האיגוד אם מותר להיעזר בטלפון.</p>
      <button class="btn" id="unlock">הצג בכל זאת</button></div>`;
    $('#unlock', root).onclick = () => { if (confirm('לפתוח את הקריאה עכשיו?')) { unlocked = s.id; renderRead(); } };
    return;
  }
  let html = `<div class="card"><div class="row"><div class="grow"><h2 style="margin:0">${live ? 'קריאה חיה' : 'סיכום אימון'}</h2>
    <div class="mute">${new Date(s.date).toLocaleDateString('he-IL')} · ${esc(s.center)} · ${S.OIL_LABEL[seg.oil]}</div></div></div>
    ${(s.segs?.length || 1) > 1 ? `<div class="seg" id="scope" style="margin-top:10px"><button data-v="seg" class="${readScope === 'seg' ? 'on' : ''}">מסלולים נוכחיים</button><button data-v="session" class="${readScope === 'session' ? 'on' : ''}">כל האימון</button></div>` : ''}
  </div>`;

  // עצת פתיחה, כל עוד יש מעט זריקות בקטע
  if (live && shots.filter(x => x.shot === 0).length < 6) {
    const adv = [];
    ['L', 'R'].forEach(l => startAdvice(s, seg, l, hand, S.historyFor(s, seg.laneNums[l])).forEach((a, i) => { if (l === 'L' || i > 0) adv.push(a); }));
    if (adv.length) html += `<h3>לפני שמתחילים</h3>${adv.map(insHtml).join('')}`;
  }

  const cmp = compareLanes(shots, hand);
  if (cmp) html += insHtml(cmp);

  ['L', 'R'].forEach(lane => {
    const st = laneStats(shots, lane, hand);
    if (!st.n) return;
    const oil = oilEstimate(st);
    const num = seg.laneNums[lane];
    html += `<div class="card"><h2>מסלול ${lane === 'L' ? 'שמאל' : 'ימין'}${num ? ' · ' + esc(num) : ''}</h2>
      <div class="stats">
        <div class="stat"><div class="v">${st.strikePct}%</div><div class="k">סטרייקים (${st.strikes}/${st.n})</div></div>
        <div class="stat"><div class="v">${st.spareN ? st.sparePct + '%' : '—'}</div><div class="k">המרת ספייר</div></div>
        <div class="stat"><div class="v">${st.splits}</div><div class="k">ספליטים</div></div>
        <div class="stat"><div class="v">${st.stance ?? '—'}${st.cm ? `<small> +${st.cm}</small>` : ''}</div><div class="k">עמידה${st.driftN ? ` · דריפט ${st.drift}` : ''}</div></div>
        <div class="stat"><div class="v">${st.arrow ?? '—'}</div><div class="k">${arrowNum(st.arrow) ? `חץ ${arrowNum(st.arrow)}` : 'חץ (בורד)'}</div></div>
        <div class="stat"><div class="v">${st.bp ?? '—'}</div><div class="k">שבירה ${st.bpStd ? '±' + st.bpStd : ''}</div></div>
      </div>
      ${geoLine(st)}
      ${st.n - st.clean ? `<div class="mute" style="margin-top:6px">${st.n - st.clean} זריקות לא נכללו בקריאת המסלול (פספוס יעד או לא בטוח). הן נספרות רק בניקוד ובמרחב הטעות. דיוק: ${st.onTargetPct}%.</div>` : ''}
      ${oil ? `<div style="margin-top:12px"><div class="mute">אורך שימון משוער (${oil.personal ? `הכלל האישי שלך: שבירה + ${oil.k}` : 'כלל ה-31: כלל אצבע מקובל, לא מדידה'})</div>
        <div class="oil">~${oil.len} רגל <small class="mute" style="font-size:.8rem">(${oil.lo}-${oil.hi}, ביטחון ${oil.conf}, ${oil.n} זריקות)</small></div>
        <div class="mute">${oilLabel(oil.len)}${S.patternOf(s, segIdx)?.len ? ` · התבנית האמיתית: ${S.patternOf(s, segIdx).len} רגל` : ''}${seg.oil === 'dry' ? ' · ⚠️ מסלול יבש: ההערכה פחות אמינה' : ''}</div></div>` : ''}
      ${bpChart(st.first)}
      ${leaveBars(st)}
      <h3 style="margin-top:12px">קריאה</h3>
      ${laneIns(s, live, shots, lane, hand).map(insHtml).join('')}
    </div>`;
  });
  html += ballTable(shots, hand) + learnedCard();
  root.innerHTML = html;
  $('#scope', root)?.addEventListener('click', e => { const b = e.target.closest('button'); if (!b) return; readScope = b.dataset.v; renderRead(); });
}

// שרשרת הקו: עמידה → חץ → שבירה → כיס, עם הזוויות ביניהם
function geoLine(st) {
  const g = geometry(st.stance, st.arrow, st.bp);
  if (g.launch === undefined || g.swing === undefined) return '';
  const r = x => Math.round(x * 10) / 10;
  return `<div class="geo"><span>עמידה <b>${st.stance}</b></span><i>${r(g.launch)}</i><span>חץ <b>${st.arrow}</b></span><i>${r(g.swing)}</i><span>שבירה <b>${st.bp}</b></span><i>${g.hook}</i><span>כיס <b>17.5</b></span></div>
    <div class="mute" style="font-size:.78rem">המספרים בין התחנות: כמה בורדים הכדור עובר בכל קטע. עמידה ← חץ = זווית היציאה.</div>`;
}

// תובנות למסלול + רישום ההמלצות לטובת לולאת הלמידה (רק באימון פעיל, ורק אם ההמלצות מוצגות)
function laneIns(s, live, shots, lane, hand) {
  const ins = insights(shots, lane, hand, s);
  if (live) registerRecs(s, lane, ins);
  return ins;
}

// מה למדנו מההמלצות שביצעת
function learnedCard() {
  const L = learnedSummary();
  if (!L.rows.length && !L.pending && !L.open) return '';
  return `<div class="card"><h2>🧠 מה למדנו מההמלצות שלך</h2>
    <p class="mute">כשאתה מבצע הזזה שהומלצה, האפליקציה מזהה את זה ובודקת את ${4} הזריקות הבאות. ככה ההמלצות לומדות מה עובד דווקא אצלך.</p>
    ${L.rows.length ? `<table class="moves"><thead><tr><th>מצב</th><th>הזזה</th><th>עבד</th><th>החמיר</th></tr></thead><tbody>
      ${L.rows.map(r => `<tr><td>${KIND_LABEL[r.kind]}</td><td>${esc(MOVE_INFO[r.type].name)}</td><td>${r.ok}/${r.n}</td><td>${r.worse}</td></tr>`).join('')}
    </tbody></table>` : '<p class="mute">עוד אין המלצה שבוצעה ונבדקה.</p>'}
    <p class="mute" style="margin-top:8px">${L.pending ? `⏳ ${L.pending} בבדיקה עכשיו · ` : ''}${L.open ? `${L.open} ממתינות לביצוע · ` : ''}בוצעו ${L.followed}, לא בוצעו ${L.ignored}.</p>
    <p class="mute" style="font-size:.78rem">כשהזזה מסוימת לא עובדת לך פעמיים או יותר, וסוג אחר כן עבד, ההמלצה הבאה תעבור לזה שעובד לך.</p>
  </div>`;
}

function bpChart(first) {
  const pts = first.map((s, i) => ({ i, bp: s.bp, a: s.arrow, x: s.left.length === 0 })).filter(p => p.bp);
  if (pts.length < 2) return '';
  const W = 320, H = 140, n = first.length;
  const lo = Math.max(1, Math.min(...pts.map(p => Math.min(p.bp, p.a ?? p.bp))) - 2), hi = Math.min(39, Math.max(...pts.map(p => Math.max(p.bp, p.a ?? p.bp))) + 2);
  const X = i => 20 + i / Math.max(1, n - 1) * (W - 30), Y = b => 10 + (hi - b) / (hi - lo) * (H - 30);
  const line = k => pts.filter(p => p[k]).map((p, j) => `${j ? 'L' : 'M'}${X(p.i)} ${Y(p[k])}`).join('');
  return `<div class="chart" style="margin-top:10px"><div class="mute">שבירה (כתום) וחץ (כחול) לאורך הזריקות · ● ירוק = סטרייק</div>
    <svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none">
      <line class="ax" x1="20" x2="${W}" y1="${H - 20}" y2="${H - 20}"/>
      <text class="t" x="2" y="${Y(hi) + 4}">${hi}</text><text class="t" x="2" y="${Y(lo) + 4}">${lo}</text>
      <path d="${line('a')}" fill="none" stroke="var(--info)" stroke-width="1.5" opacity=".6"/>
      <path d="${line('bp')}" fill="none" stroke="var(--acc)" stroke-width="2"/>
      ${pts.map(p => `<circle cx="${X(p.i)}" cy="${Y(p.bp)}" r="4" fill="${p.x ? 'var(--good)' : 'var(--warn)'}"/>`).join('')}
    </svg></div>`;
}

function leaveBars(st) {
  const order = ['strike', 'high', 'light', 'weak10', 'strong10', 'ambig', 'head', 'other'];
  const max = Math.max(1, ...Object.values(st.cats));
  const top = Object.entries(st.leaves).sort((a, b) => b[1] - a[1]).slice(0, 5);
  return `<div class="bars" style="margin-top:10px">${order.filter(k => st.cats[k]).map(k =>
    `<div class="bar"><span>${LEAVE_LABEL[k]}</span><i style="width:${st.cats[k] / max * 55}%"></i><span>${st.cats[k]}</span></div>`).join('')}</div>
    ${top.length ? `<div class="mute" style="margin-top:6px">השארות נפוצות: ${top.map(([k, v]) => `<b>${k}</b>×${v}`).join(' · ')}</div>` : ''}`;
}

function ballTable(shots, hand) {
  const by = {};
  shots.filter(s => s.shot === 0 && s.rack.length === 10).forEach(s => { (by[s.ball] ||= []).push(s); });
  const ids = Object.keys(by);
  if (!ids.length) return '';
  return `<div class="card"><h2>לפי כדור</h2>${ids.map(id => {
    const b = S.ballById(id), arr = by[id];
    const x = arr.filter(s => !s.left.length).length;
    return `<div class="row" style="justify-content:space-between;margin:6px 0"><span>${esc(b?.name || 'לא ידוע')}</span>
      <span class="mute">${arr.length} זריקות · ${Math.round(x / arr.length * 100)}% סטרייק</span></div>`;
  }).join('')}</div>`;
}

// ---------- ארסנל ----------
const COVERS = [['solid', 'ריאקטיב סוליד'], ['hybrid', 'ריאקטיב היברידי'], ['pearl', 'ריאקטיב פנינה'], ['urethane', 'אורטן'], ['plastic', 'פלסטיק/פוליאסטר']];
const COVER_COLOR = { solid: '#7b3fe4', hybrid: '#d9467a', pearl: '#3fa7e4', urethane: '#e4a53f', plastic: '#8a8f99' };
let editBall = null;

export function renderBalls() {
  const root = $('#view-balls');
  const db = S.getDb();
  if (editBall) return ballForm(root);
  const sorted = [...db.balls].sort((a, b) => S.ballStrength(b) - S.ballStrength(a));
  root.innerHTML = `<div class="card"><h2>הארסנל שלי</h2>
    <p class="mute">תאר את הכדורים שיש לך. ההמלצות יבחרו רק מתוכם, מהחזק לחלש. מספרי RG ו-Diff מופיעים בדף היצרן או על הקופסה. אם אין לך אותם, מספיק הכיסוי והמשטח.</p>
    <button class="btn pri big" id="addBall">+ הוסף כדור</button></div>
    ${sorted.map(b => {
      const used = db.shots.filter(s => s.ball === b.id && s.shot === 0 && s.rack.length === 10);
      const x = used.filter(s => !s.left.length).length;
      return `<div class="card ball" data-id="${b.id}">
        <div class="dot" style="background:radial-gradient(circle at 30% 30%, #fff8, ${COVER_COLOR[b.cover] || '#666'} 45%)"></div>
        <div class="grow"><b>${esc(b.name)}</b>${b.spareOnly ? ' <span class="mute">· ספייר</span>' : ''}
          <div class="mute">${esc(COVERS.find(c => c[0] === b.cover)?.[1] || '')}${b.grit ? ' · ' + esc(b.grit) : ''}${b.rg ? ' · RG ' + esc(b.rg) : ''}${b.diff ? ' · Diff ' + esc(b.diff) : ''}</div>
          ${b.desc ? `<div class="mute">"${esc(b.desc)}"</div>` : ''}
          ${b.spareOnly ? '' : sandLine(b)}
          <div class="strength"><i style="width:${Math.min(100, S.ballStrength(b) / 13 * 100)}%"></i></div>
          <div class="mute" style="font-size:.78rem">עוצמה ${S.ballStrength(b)} · ${used.length ? `${used.length} זריקות, ${Math.round(x / used.length * 100)}% סטרייק` : 'עוד לא בשימוש'}</div></div>
        <div class="col"><button class="btn sm edit">עריכה</button>${b.spareOnly ? '' : '<button class="btn sm sand">שייפתי</button>'}</div></div>`;
    }).join('')}`;
  $('#addBall', root).onclick = () => { editBall = { id: '', name: '', cover: 'solid', core: 'sym', grit: '', rg: '', diff: '', weight: '', desc: '', spareOnly: false }; renderBalls(); };
  root.querySelectorAll('.ball .sand').forEach(btn => btn.onclick = () => {
    const b = S.ballById(btn.closest('.ball').dataset.id);
    const g = prompt(`לאיזה גריט שייפת את ${b.name}?`, S.lastSanded(b)?.grit || '1000');
    if (!g || !Number(g)) return;
    S.resurface(b.id, Math.round(Number(g)));
    toast(`נרשם: ${esc(b.name)} שויף ל-${Math.round(Number(g))}. ספירת המשחקים התאפסה.`);
    renderBalls();
  });
  root.querySelectorAll('.ball .edit').forEach(btn => btn.onclick = () => { editBall = { ...S.ballById(btn.closest('.ball').dataset.id) }; renderBalls(); });
}

function ballForm(root) {
  const b = editBall;
  root.innerHTML = `<div class="card"><h2>${b.id ? 'עריכת כדור' : 'כדור חדש'}</h2>
    <label>שם (דגם + יצרן)</label><input type="text" id="bName" value="${esc(b.name)}" placeholder="למשל Storm Phaze II">
    <label>תיאור במילים שלך: איך הוא מתנהג, מתי אתה לוקח אותו</label><textarea id="bDesc" placeholder="למשל: הכדור שלי לשימון טרי, ממשיך חזק בסוף">${esc(b.desc)}</textarea>
    <label>כיסוי</label><select id="bCover">${COVERS.map(([v, t]) => `<option value="${v}" ${b.cover === v ? 'selected' : ''}>${t}</option>`).join('')}</select>
    <label>ליבה</label><select id="bCore"><option value="sym" ${b.core === 'sym' ? 'selected' : ''}>סימטרית</option><option value="asym" ${b.core === 'asym' ? 'selected' : ''}>א-סימטרית</option></select>
    <div class="row">
      <div class="grow"><label>משטח נוכחי (גריט)</label><input type="number" id="bGrit" inputmode="numeric" value="${esc(b.grit)}" placeholder="2000"></div>
      <div class="grow"><label>משטח מהמפעל</label><input type="number" id="bFac" inputmode="numeric" value="${esc(b.factoryGrit || '')}" placeholder="4000"></div>
      <div class="grow"><label>משקל (ליברות)</label><input type="number" id="bW" inputmode="numeric" value="${esc(b.weight)}" placeholder="15"></div>
    </div>
    <div class="row">
      <div class="grow"><label>RG</label><input type="number" id="bRg" step="0.001" inputmode="decimal" value="${esc(b.rg)}" placeholder="2.50"></div>
      <div class="grow"><label>Diff</label><input type="number" id="bDiff" step="0.001" inputmode="decimal" value="${esc(b.diff)}" placeholder="0.050"></div>
    </div>
    <label class="row" style="color:var(--text);margin-top:12px"><input type="checkbox" id="bSpare" ${b.spareOnly ? 'checked' : ''}> כדור ספייר (לא ייכלל בהמלצות לכדור ראשון)</label>
    <div style="height:12px"></div>
    <div class="row"><button class="btn pri grow" id="bSave">שמור</button><button class="btn" id="bCancel">ביטול</button>${b.id ? '<button class="btn danger" id="bDel">מחק</button>' : ''}</div></div>`;
  $('#bCancel', root).onclick = () => { editBall = null; renderBalls(); };
  $('#bDel', root)?.addEventListener('click', () => { if (confirm('למחוק את הכדור?')) { S.removeBall(b.id); editBall = null; renderBalls(); } });
  $('#bSave', root).onclick = () => {
    const name = $('#bName', root).value.trim();
    if (!name) { toast('צריך שם לכדור'); return; }
    S.upsertBall({ id: b.id || S.uid(), name, desc: $('#bDesc', root).value.trim(), cover: $('#bCover', root).value, core: $('#bCore', root).value,
      grit: $('#bGrit', root).value, factoryGrit: $('#bFac', root).value, surfaceLog: b.surfaceLog || [], weight: $('#bW', root).value, rg: $('#bRg', root).value, diff: $('#bDiff', root).value, spareOnly: $('#bSpare', root).checked });
    editBall = null; renderBalls();
  };
}

// שורת משטח בכרטיס הכדור: מתי שויף וכמה משחקים מאז
function sandLine(b) {
  const l = S.lastSanded(b);
  if (!l) return `<div class="mute" style="font-size:.78rem">משטח ${esc(b.grit || '?')}${b.factoryGrit ? ` (מהמפעל ${esc(b.factoryGrit)})` : ''} · לחץ "שייפתי" אחרי השיוף הבא כדי להתחיל לעקוב</div>`;
  const days = Math.round((Date.now() - Date.parse(l.date)) / 864e5), g = S.gamesSinceSand(b);
  const worn = g >= 30 || days >= 35;
  return `<div class="mute" style="font-size:.78rem;${worn ? 'color:var(--warn)' : ''}">שויף ל-${esc(l.grit)} ${days ? `לפני ${days} ימים` : 'היום'} · ~${g} משחקים מאז${g >= 60 ? ' · הגיע הזמן לשיוף מלא (Storm: כל 60-80 משחקים)' : worn ? ' · כדאי לבדוק אם המשטח התחלק' : ''}</div>`;
}

// ---------- עוד: היסטוריה + הגדרות ----------
export function renderMore() {
  const root = $('#view-more');
  const db = S.getDb(), st = db.settings;
  const sess = [...db.sessions].reverse();
  const profs = S.listProfiles();
  root.innerHTML = `<div class="card"><h2>👥 שחקנים במכשיר</h2>
    <p class="mute">לכל שחקן כדורים, הגדרות ואימונים משלו. כדי לתת למישהו להתנסות, צור לו שחקן חדש. הנתונים שלך לא נוגעים.</p>
    ${profs.map(p => `<div class="row prof ${p.current ? 'cur' : ''}" data-id="${p.id}">
      <div class="grow"><b>${esc(p.name)}</b>${p.current ? ' <span style="color:var(--acc)">(פעיל עכשיו)</span>' : ''}</div>
      ${p.current ? '<button class="btn sm ren">שינוי שם</button>' : `<button class="btn sm pri sw">עבור</button>${p.id === 'main' ? '' : '<button class="btn sm danger delp">🗑</button>'}`}
    </div>`).join('')}
    <div class="row" style="margin-top:10px"><button class="btn grow" id="addProf">+ שחקן חדש</button><button class="btn danger grow" id="resetProf">נקה את ${esc(S.currentProfile()?.name || '')}</button></div>
  </div>
  <div class="card"><h2>הגדרות</h2>
    <label>יד זריקה (דומיננטית)</label><div class="seg" id="hand"><button data-v="R" class="${st.hand === 'R' ? 'on' : ''}">ימין</button><button data-v="L" class="${st.hand === 'L' ? 'on' : ''}">שמאל</button></div>
    <label>סגנון</label><div class="seg" id="style"><button data-v="one" class="${st.style !== 'two' ? 'on' : ''}">יד אחת</button><button data-v="two" class="${st.style === 'two' ? 'on' : ''}">שתי ידיים</button></div>
    <p class="mute" style="margin:4px 0 0">שמאלי: הבורדים נספרים מהצד השמאלי, וזיהוי הפינים מתהפך (7 ↔ 10). שתי ידיים: ההמלצות מתחשבות בסיבוב גבוה ובפנייה חזקה יותר.</p>
    <label>עמדת מוצא: הקו שאתה תמיד מתחיל ממנו</label>
    <div class="row">
      <div class="grow"><span class="mute">עמידה (בורד)</span><input type="number" id="hB" inputmode="numeric" value="${st.home?.board ?? 18}"></div>
      <div class="grow"><span class="mute">עומק (ס"מ קדימה)</span><input type="number" id="hC" inputmode="numeric" step="10" value="${st.home?.cm ?? 0}"></div>
      <div class="grow"><span class="mute">חץ (בורד)</span><input type="number" id="hA" inputmode="numeric" value="${st.home?.arrow ?? 10}"></div>
    </div>
    <p class="mute" style="margin:4px 0 0">כל אימון וכל מעבר מסלולים מתחילים מכאן, והקריאה מודדת כמה המסלול הזיז אותך מהנקודה הזו.</p>
    <label>הגוף שלך בזריקה</label>
    <div class="row">
      <div class="grow"><span class="mute">דריפט רגיל (בורדים פנימה)</span><input type="number" id="bDr" inputmode="numeric" value="${st.drift ?? 2}"></div>
      <div class="grow"><span class="mute">הכדור מהרגל (בורדים)</span><input type="number" id="bOff" inputmode="numeric" value="${st.ballOff ?? 5}"></div>
    </div>
    ${(() => { const md = measuredDrift(); return md ? `<p class="mute" style="margin:4px 0 0">📏 הדריפט שלך נמדד: <b>${md.drift}</b> בורדים (חציון של ${md.n} זריקות, פיזור ±${md.std}). ${md.drift !== Number(st.drift ?? 2) ? `<button class="btn sm" id="useMd">לעדכן ל-${md.drift}</button>` : '✓ תואם להגדרה'}</p>` : `<p class="mute" style="margin:4px 0 0">📏 כדי למדוד את הדריפט באמת: בכמה זריקות, סמן ב"סיום רגל" איפה הרגל עצרה. אחרי 5 זריקות הוא יופיע כאן.</p>`; })()}
    <div class="row"><div class="grow"><span class="mute">נקודת מוקד ב-60 רגל (בורד)</span><input type="number" id="fcl" inputmode="numeric" value="${st.focal ?? 7}"></div></div>
    <p class="mute" style="margin:4px 0 0">נקודת מוקד: הבורד בקצה המסלול שהקו הישר שלך (שחרור ← חץ) מכוון אליו. בסיס מקובל: בורד 7, הקצה של פין 6. בשמן ארוך באמת, פנימה יותר.</p>
    <p class="mute" style="margin:4px 0 0">דריפט: כמה בורדים רגל ההחלקה זזה מהעמידה עד קו העבירה (לימני, חיובי = שמאלה). הכדור משתחרר בצד היד, כמה בורדים מהרגל. משני אלה התוכנה מחשבת מאיפה הכדור באמת יוצא.</p>
    <label>יחידת מהירות</label><div class="seg" id="unit"><button data-v="kmh" class="${st.speedUnit === 'kmh' ? 'on' : ''}">קמ"ש</button><button data-v="mph" class="${st.speedUnit === 'mph' ? 'on' : ''}">מייל לשעה</button></div>
    <label>אולם ברירת מחדל</label><input type="text" id="center" value="${esc(st.center)}"></div>
    <div class="card"><h2>היסטוריה</h2>${sess.length ? sess.map(s => {
      const games = Array.from({ length: s.games }, (_, g) => S.scoreGame(S.gameShots(s.id, g)).total).filter(Boolean);
      return `<div class="row" style="justify-content:space-between;border-bottom:1px solid var(--line);padding:8px 0" data-id="${s.id}">
        <div class="grow"><b>${new Date(s.date).toLocaleDateString('he-IL')}</b> · ${esc(s.center)}${s.id === db.currentSessionId ? ' <span style="color:var(--acc)">(פעיל)</span>' : ''}
        <div class="mute">${(s.segs || []).map(g => `${g.laneNums.L}|${g.laneNums.R} ${S.OIL_LABEL[g.oil]}`).join(' → ')} · משחקים: ${games.join(', ') || '—'}${S.sessionShots(s.id).some(x => x.drill) ? ' · 🧪 כולל תרגול טכניקה' : ''}</div></div>
        <button class="btn sm view">קריאה</button><button class="btn sm danger del">🗑</button></div>`;
    }).join('') : '<p class="mute">עוד אין אימונים.</p>'}</div>
    <div class="card"><h2>📲 העברה למכשיר אחר</h2>
      <p class="mute">שולח את הכדורים וההגדרות (יד, עמדת מוצא, דריפט) בקישור. שלח אותו לעצמך בוואטסאפ ופתח בנייד. היסטוריית האימונים לא עוברת בקישור, בשבילה יש ייצוא וייבוא למטה.</p>
      <button class="btn pri big" id="xferMake">שלח את הכדורים וההגדרות</button>
      <div class="row" style="margin-top:10px"><input type="text" id="xferIn" class="grow" placeholder="או הדבק כאן קישור או קוד העברה"><button class="btn" id="xferGo">ייבא</button></div>
    </div>
    <div class="card"><h2>גיבוי</h2><p class="mute">הנתונים שמורים רק בטלפון הזה. כדאי לייצא מדי פעם.</p>
      <div class="row"><button class="btn grow" id="exp">⬇️ ייצוא</button><label class="btn grow" style="margin:0;text-align:center;color:var(--text)">⬆️ ייבוא<input type="file" id="imp" accept=".json" hidden></label></div></div>
    <div class="card"><details><summary><b>📋 הסתייגות ותנאי שימוש</b></summary>${TERMS_LIST}</details></div>
    <p class="mute" style="text-align:center">EGG קורא המסלולים · גרסה ${APP_VERSION}<br>${TERMS_SHORT}<br>© 2026 אייל גלברג (EGG · Eyal Gelberg Game). כל הזכויות שמורות.</p>`;
  // שחקנים
  $('#addProf', root).onclick = () => {
    const name = (prompt('שם השחקן החדש:', 'אורח') || '').trim();
    if (!name) return;
    const id = S.addProfile(name);
    if (confirm(`נוצר "${name}". לעבור אליו עכשיו?`)) S.switchProfile(id); else renderMore();
  };
  root.querySelectorAll('.prof .sw').forEach(b => b.onclick = () => S.switchProfile(b.closest('.prof').dataset.id));
  root.querySelectorAll('.prof .ren').forEach(b => b.onclick = () => {
    const p = S.currentProfile(); const name = (prompt('שם חדש:', p.name) || '').trim();
    if (name) { S.renameProfile(p.id, name); renderMore(); }
  });
  root.querySelectorAll('.prof .delp').forEach(b => b.onclick = () => {
    const p = S.listProfiles().find(x => x.id === b.closest('.prof').dataset.id);
    if (confirm(`למחוק את "${p.name}" וכל הנתונים שלו (כדורים, הגדרות ואימונים)? אי אפשר לשחזר.`)) { S.deleteProfile(p.id); renderMore(); }
  });
  $('#resetProf', root).onclick = () => {
    const p = S.currentProfile();
    if (!confirm(`לנקות את כל הנתונים של "${p.name}": כדורים, הגדרות ואימונים? אי אפשר לשחזר.`)) return;
    if (!confirm('בטוח? כדאי לעשות קודם "ייצוא" לגיבוי.')) return;
    S.resetCurrentProfile();
  };
  const seg = (id, key) => $('#' + id, root).onclick = e => { const b = e.target.closest('button'); if (!b) return; st[key] = b.dataset.v; S.save(); renderMore(); };
  seg('hand', 'hand'); seg('style', 'style'); seg('unit', 'speedUnit');
  $('#center', root).onchange = e => { st.center = e.target.value.trim(); S.save(); };
  $('#bDr', root).onchange = e => { st.drift = Math.max(-8, Math.min(8, Math.round(Number(e.target.value) || 0))); S.save(); toast(`דריפט רגיל: ${st.drift}`); };
  $('#useMd', root)?.addEventListener('click', () => { st.drift = measuredDrift().drift; S.save(); toast(`דריפט רגיל עודכן ל-${st.drift}`); renderMore(); });
  $('#fcl', root).onchange = e => { st.focal = Math.max(1, Math.min(30, Math.round(Number(e.target.value) || 7))); S.save(); toast(`נקודת מוקד: בורד ${st.focal}`); };
  $('#bOff', root).onchange = e => { st.ballOff = Math.max(0, Math.min(12, Math.round(Number(e.target.value) || 0))); S.save(); toast(`הכדור ${st.ballOff} בורדים מהרגל`); };
  const clampB = v => Math.max(1, Math.min(39, Math.round(Number(v) || 0)));
  ['hB', 'hC', 'hA'].forEach(id => $('#' + id, root).onchange = () => {
    st.home = { board: clampB($('#hB', root).value), cm: Math.max(0, Math.round(Number($('#hC', root).value) || 0)), arrow: clampB($('#hA', root).value) };
    S.save(); toast(`עמדת המוצא עודכנה: בורד ${st.home.board}, ${st.home.arrow % 5 === 0 ? `חץ ${st.home.arrow / 5}` : `בורד ${st.home.arrow}`}`);
  });
  root.querySelectorAll('[data-id] .view').forEach(b => b.onclick = () => { db.viewSessionId = b.closest('[data-id]').dataset.id; S.save(); go('read'); });
  root.querySelectorAll('[data-id] .del').forEach(b => b.onclick = () => { if (confirm('למחוק את האימון וכל הזריקות שלו? אי אפשר לשחזר.')) { S.deleteSession(b.closest('[data-id]').dataset.id); renderMore(); } });
  $('#xferMake', root).onclick = async () => {
    const url = `${location.origin}${location.pathname}#xfer=${S.makeTransfer()}`;
    try { if (navigator.share) { await navigator.share({ title: 'EGG קורא המסלולים: הכדורים שלי', url }); return; } } catch (e) { if (e.name === 'AbortError') return; }
    try { await navigator.clipboard.writeText(url); toast('הקישור הועתק. הדבק אותו בוואטסאפ לעצמך ופתח בנייד.'); }
    catch { $('#xferIn', root).value = url; toast('הקישור מופיע בשדה. העתק אותו ידנית.'); }
  };
  $('#xferGo', root).onclick = () => importTransfer($('#xferIn', root).value);
  $('#exp', root).onclick = () => {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([JSON.stringify(db, null, 1)], { type: 'application/json' }));
    a.download = `lane-reader-${new Date().toISOString().slice(0, 10)}.json`; a.click();
  };
  $('#imp', root).onchange = async e => {
    const f = e.target.files[0]; if (!f) return;
    try { if (!confirm('הייבוא יחליף את כל הנתונים הנוכחיים. להמשיך?')) return; S.replaceDb(JSON.parse(await f.text())); toast('הנתונים יובאו'); renderMore(); renderPlay(); }
    catch (err) { toast('שגיאה בייבוא: ' + esc(err.message)); }
  };
}

// ייבוא מקישור או מקוד, עם אישור
export function importTransfer(code) {
  let t;
  try { t = S.readTransfer(code); } catch { toast('הקוד לא תקין. ודא שהעתקת את כל הקישור.'); return false; }
  const names = t.balls.map(b => b.name).join(', ');
  if (!confirm(`לייבא ${t.balls.length} כדורים (${names})${t.settings ? ' והגדרות' : ''}? כדור עם אותו שם יתעדכן, וכדור חדש יתווסף.`)) return false;
  S.applyTransfer(t);
  toast(`יובאו ${t.balls.length} כדורים${t.settings ? ' והגדרות' : ''} ✓`);
  return true;
}

export function renderLearn() { $('#view-learn').innerHTML = LEARN_HTML; }

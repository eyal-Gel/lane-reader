// מסך פתיחה: בפעם הראשונה כל שחקן מגדיר את עצמו (יד, סגנון, עמדת מוצא, דריפט, אולם)
import * as S from './store.js';

const $ = (sel, root = document) => root.querySelector(sel);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const ARROWS = [[5, 'חץ 1'], [10, 'חץ 2'], [15, 'חץ 3'], [20, 'חץ 4']];

export function renderOnboard(root, { onDone, onImport }) {
  const st = S.getDb().settings;
  const prof = S.currentProfile();
  const f = {
    name: prof && prof.name !== 'שחקן ראשי' ? prof.name : '',
    hand: st.hand || 'R', style: st.style || 'one',
    board: st.home?.board ?? 18, arrow: st.home?.arrow ?? 10, cm: st.home?.cm ?? 0,
    drift: st.drift ?? 2, ballOff: st.ballOff ?? 5, center: st.center || '', unit: st.speedUnit || 'kmh',
  };
  const inW = () => f.hand === 'L' ? 'ימינה' : 'שמאלה';
  root.innerHTML = `
  <div class="card onboard">
    <h2>👋 ברוך הבא לקורא המסלול</h2>
    <p class="mute">כמה שאלות קצרות כדי שההמלצות יתאימו לך. אפשר לשנות הכול אחר כך בלשונית "עוד".</p>

    <label>איך קוראים לך?</label>
    <input type="text" id="oName" value="${esc(f.name)}" placeholder="השם שלך">

    <label>באיזו יד אתה זורק?</label>
    <div class="seg" id="oHand"><button data-v="R">ימין</button><button data-v="L">שמאל</button></div>

    <label>סגנון</label>
    <div class="seg" id="oStyle"><button data-v="one">יד אחת</button><button data-v="two">שתי ידיים</button></div>

    <h3 style="margin-top:16px">עמדת המוצא שלך</h3>
    <p class="mute">הקו שאתה בדרך כלל מתחיל ממנו. הבורדים נספרים מהתעלה בצד היד שלך.</p>
    <label>עומד על בורד</label>
    <div class="row stp"><button class="btn sm" data-n="board" data-d="-1">−</button><b class="num" id="vBoard"></b><button class="btn sm" data-n="board" data-d="1">+</button></div>
    <label>מכוון לחץ</label>
    <div class="seg" id="oArrow">${ARROWS.map(([b, t]) => `<button data-v="${b}">${t}<br><small>בורד ${b}</small></button>`).join('')}</div>
    <label>עומק העמידה</label>
    <div class="seg" id="oCm"><button data-v="0">הכי אחורה</button><button data-v="20">אמצע (20 ס"מ)</button></div>

    <label>דריפט: כמה בורדים רגל ההחלקה זזה עד קו העבירה</label>
    <div class="row stp"><button class="btn sm" data-n="drift" data-d="-1">−</button><b class="num" id="vDrift"></b><button class="btn sm" data-n="drift" data-d="1">+</button><span class="mute" id="driftTxt"></span></div>
    <p class="mute" style="margin:4px 0 0">לא יודע? השאר 2. תוכל לתקן כל זריקה בנפרד במסך הזריקה.</p>

    <details style="margin-top:10px"><summary class="mute">מתקדם</summary>
      <label>הכדור משתחרר כמה בורדים מרגל ההחלקה (בצד היד)</label>
      <div class="row stp"><button class="btn sm" data-n="ballOff" data-d="-1">−</button><b class="num" id="vOff"></b><button class="btn sm" data-n="ballOff" data-d="1">+</button></div>
      <label>יחידת מהירות</label>
      <div class="seg" id="oUnit"><button data-v="kmh">קמ"ש</button><button data-v="mph">מייל לשעה</button></div>
    </details>

    <label>האולם שבו אתה משחק בדרך כלל</label>
    <input type="text" id="oCenter" value="${esc(f.center)}" placeholder="שם האולם">

    <div style="height:14px"></div>
    <button class="btn pri big" id="oDone">יאללה, מתחילים</button>
    <button class="btn full sm" id="oHasLink" style="margin-top:8px;width:100%">יש לי קישור העברה ממכשיר אחר</button>
    <div id="oLinkBox" hidden style="margin-top:8px">
      <div class="row"><input type="text" id="oLink" class="grow" placeholder="הדבק כאן את הקישור"><button class="btn" id="oLinkGo">ייבא</button></div>
    </div>
  </div>`;

  const sync = () => {
    $('#vBoard', root).textContent = f.board;
    $('#vDrift', root).textContent = f.drift;
    $('#vOff', root).textContent = f.ballOff;
    $('#driftTxt', root).textContent = f.drift === 0 ? 'ישר' : `${Math.abs(f.drift)} ${f.drift > 0 ? inW() : (f.hand === 'L' ? 'שמאלה' : 'ימינה')}`;
    [['oHand', 'hand'], ['oStyle', 'style'], ['oArrow', 'arrow'], ['oCm', 'cm'], ['oUnit', 'unit']].forEach(([id, k]) =>
      root.querySelectorAll(`#${id} button`).forEach(b => b.classList.toggle('on', String(b.dataset.v) === String(f[k]))));
  };
  const bindSeg = (id, k, num) => $('#' + id, root).addEventListener('click', e => {
    const b = e.target.closest('button'); if (!b) return;
    f[k] = num ? Number(b.dataset.v) : b.dataset.v; sync();
  });
  bindSeg('oHand', 'hand'); bindSeg('oStyle', 'style'); bindSeg('oArrow', 'arrow', true); bindSeg('oCm', 'cm', true); bindSeg('oUnit', 'unit');
  const LIM = { board: [1, 39], drift: [-8, 8], ballOff: [0, 12] };
  root.querySelectorAll('[data-n]').forEach(b => b.addEventListener('click', () => {
    const k = b.dataset.n, [lo, hi] = LIM[k];
    f[k] = Math.max(lo, Math.min(hi, f[k] + Number(b.dataset.d))); sync();
  }));
  sync();

  $('#oHasLink', root).onclick = () => { $('#oLinkBox', root).hidden = false; $('#oLink', root).focus(); };
  $('#oLinkGo', root).onclick = () => { if (onImport($('#oLink', root).value)) onDone(); };
  $('#oDone', root).onclick = () => {
    const name = $('#oName', root).value.trim();
    if (name && prof) S.renameProfile(prof.id, name);
    Object.assign(st, {
      hand: f.hand, style: f.style, speedUnit: f.unit, center: $('#oCenter', root).value.trim(),
      home: { board: f.board, cm: f.cm, arrow: f.arrow }, drift: f.drift, ballOff: f.ballOff, onboarded: true,
    });
    S.save();
    onDone(true);
  };
}

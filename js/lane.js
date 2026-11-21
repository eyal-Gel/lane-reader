// ציור המסלול (עמידה, חצים, שבירה, מסלול הכדור) ומשולש הפינים
import { arrowFt } from './geometry.js';
const NS = 'http://www.w3.org/2000/svg';
const W = 400, X0 = 20, X1 = 380, BW = (X1 - X0) / 39;
const FOUL = 620, PX_FT = 9.6;           // 0 רגל = קו עבירה
const ftY = ft => FOUL - ft * PX_FT;      // 60 רגל = ראש הפינים
const yFt = y => (FOUL - y) / PX_FT;
const H = ftY(-16) + 10;
export const BP_FT = 40;
const APPROACH_BACK_FT = 15;              // הנקודות האחוריות: 15 רגל מקו העבירה

// בורד 1 = התעלה בצד היד של השחקן
const bx = (b, hand) => hand === 'R' ? X1 - (b - 0.5) * BW : X0 + (b - 0.5) * BW;
const xb = (x, hand) => {
  const raw = hand === 'R' ? (X1 - x) / BW + 0.5 : (x - X0) / BW + 0.5;
  return Math.max(1, Math.min(39, Math.round(raw)));
};
// הגישה נמצאת מאחורי קו העבירה (רגל שלילית); 0 ס"מ = הכי אחורה, ליד הנקודות האחוריות
const cmFt = cm => -(APPROACH_BACK_FT - (cm || 0) / 30.48);

// משולש הפינים: המסלול מצויר דחוס לאורך, אז את הפינים מציירים כמשולש שווה צלעות קריא
// (לא בקנה מידה), עם פין 1 בראש המסלול ופין 7 תמיד משמאל במבט מהגישה
const PIN_S = 46, PIN_ROW = PIN_S * 0.866, HEAD_Y = ftY(60), CX = 200;
const PIN_POS = { 1: [0, 0], 2: [-0.5, 1], 3: [0.5, 1], 4: [-1, 2], 5: [0, 2], 6: [1, 2], 7: [-1.5, 3], 8: [-0.5, 3], 9: [0.5, 3], 10: [1.5, 3] };
const pinXY = p => [CX + PIN_POS[p][0] * PIN_S, HEAD_Y - PIN_POS[p][1] * PIN_ROW];
const TOP = HEAD_Y - 3 * PIN_ROW - 26;

// נקודת הפגיעה בפינים לפי מה שקרה בפועל (ביחידות של מרווח פינים, חיובי = לצד פין 3 אצל ימני)
const HIT = { strike: 0.25, pocket: 0.25, weak10: 0.32, strong10: 0.18, high: 0.08, ambig: 0.12, light: 0.45, brooklyn: -0.25, head: 0.75, other: 0.25 };
const HIT_LABEL = { strike: 'כיס', pocket: 'כיס', weak10: 'כיס, בלי זווית', strong10: 'כיס, חזק', high: 'גבוה', ambig: 'כיס', light: 'חלש', brooklyn: 'ברוקלין', head: 'פספוס ראש', other: '' };
function hitPoint(st, hand) {
  const sign = hand === 'R' ? 1 : -1;
  const [hx, hy] = pinXY(1);
  // ספייר: הכדור מכוון למרכז הפינים שנשארו לפני הזריקה
  if (st.rack && st.rack.length < 10) {
    const pts = st.rack.map(pinXY);
    return { x: pts.reduce((a, p) => a + p[0], 0) / pts.length, y: pts.reduce((a, p) => a + p[1], 0) / pts.length + PIN_ROW / 2, label: '' };
  }
  const k = st.quality === 'brooklyn' ? 'brooklyn' : (st.cat || 'pocket');
  const off = HIT[k] ?? 0.25;
  return { x: hx + sign * off * PIN_S, y: hy - PIN_ROW / 2 + 4 + (k === 'head' ? PIN_ROW * 0.6 : 0), label: st.marked ? HIT_LABEL[k] : '' };
}

function el(tag, attrs = {}, parent) {
  const e = document.createElementNS(NS, tag);
  for (const k in attrs) e.setAttribute(k, attrs[k]);
  if (parent) parent.appendChild(e);
  return e;
}

export function renderLane(svg, st, hand, onPick) {
  svg.innerHTML = '';
  svg.setAttribute('viewBox', `0 ${TOP} ${W} ${H - TOP}`);
  const g = el('g', {}, svg);
  // גישה
  el('rect', { x: X0, y: FOUL, width: X1 - X0, height: H - FOUL - 10, class: 'approach' }, g);
  // לוחות
  for (let b = 1; b <= 39; b++) {
    el('rect', { x: bx(b, hand) - BW / 2, y: TOP, width: BW, height: FOUL - TOP, class: b % 2 ? 'board a' : 'board b' }, g);
  }
  el('line', { x1: X0, x2: X1, y1: FOUL, y2: FOUL, class: 'foul' }, g);
  // אזור שבירה משוער
  el('rect', { x: X0, y: ftY(46), width: X1 - X0, height: ftY(32) - ftY(46), class: 'bpzone' }, g);
  // נקודות וחצים
  [3, 5, 8, 11, 14, 26, 29, 32, 35, 37].forEach(b => {
    el('circle', { cx: bx(b, hand), cy: ftY(7), r: 2.5, class: 'mark' }, g);
    el('circle', { cx: bx(b, hand), cy: ftY(-12), r: 2.5, class: 'mark' }, g);
    el('circle', { cx: bx(b, hand), cy: ftY(-15), r: 2.5, class: 'mark' }, g);
  });
  [5, 10, 15, 20, 25, 30, 35].forEach(b => {
    const x = bx(b, hand), y = ftY(arrowFt(b));
    el('path', { d: `M${x} ${y - 10} L${x - 5} ${y + 6} L${x + 5} ${y + 6}Z`, class: 'arrow' }, g);
  });
  // מספרי בורדים
  [5, 10, 15, 20, 25, 30, 35].forEach(b => {
    const t = el('text', { x: bx(b, hand), y: FOUL + 18, class: 'bnum' }, g); t.textContent = b;
  });
  // אזור הפינים
  el('rect', { x: X0, y: TOP, width: X1 - X0, height: HEAD_Y + 16 - TOP, class: 'pindeck' }, g);
  // פינים: עומד = לבן, נפל בזריקה הזו = שקוף, נפל קודם (ספייר) = לא מוצג
  for (const p in PIN_POS) {
    const n = Number(p), [x, y] = pinXY(p);
    if (st.rack && !st.rack.includes(n)) continue;
    const down = st.marked && !(st.left || []).includes(n);
    const pg = el('g', { class: down ? 'lp down' : 'lp' }, g);
    el('circle', { cx: x, cy: y, r: 11, class: 'lanepin' }, pg);
    el('circle', { cx: x, cy: y, r: 6, class: 'pinneck' }, pg);
  }
  // מיקום עמידה
  if (st.stance?.board) {
    const y = ftY(cmFt(st.stance.cm));
    el('rect', { x: bx(st.stance.board, hand) - 7, y: y - 7, width: 14, height: 14, rx: 3, class: 'stance' }, g);
  }
  // מסלול הכדור
  if (st.arrow && st.bp) {
    const af = arrowFt(st.arrow);
    // השחרור: מנקודת סיום הרגל פחות מרחק הכדור מהרגל. בלי נתון, משחזרים מהשבירה
    const r = st.release ?? (st.arrow - (st.bp - st.arrow) * af / (BP_FT - af));
    // הכיס: בין פין 1 ל-3 לימני, בין 1 ל-2 לשמאלי
    const p0 = [bx(r, hand), ftY(0)], pA = [bx(st.arrow, hand), ftY(af)], pB = [bx(st.bp, hand), ftY(BP_FT)];
    const hp = hitPoint(st, hand);
    const pE = [hp.x, hp.y], c = [bx(st.bp, hand), ftY(52)];
    if (st.stance?.board) {
      const fb = st.finish ?? st.stance.board;
      el('line', { x1: bx(st.stance.board, hand), y1: ftY(cmFt(st.stance.cm)), x2: bx(fb, hand), y2: ftY(-1), class: 'walk' }, g);
      el('rect', { x: bx(fb, hand) - 5, y: ftY(-1) - 5, width: 10, height: 10, rx: 2, class: 'finish' }, g);
      el('line', { x1: bx(fb, hand), y1: ftY(-1), x2: p0[0], y2: p0[1], class: 'handoff' }, g);
    }
    el('path', { d: `M${p0} L${pA} L${pB} Q${c} ${pE}`, class: 'ballpath' }, g);
    el('circle', { cx: pE[0], cy: pE[1], r: 5, class: 'hitdot' }, g);
    if (hp.label) { const t = el('text', { x: CX, y: HEAD_Y + 42, class: 'hitlbl', 'text-anchor': 'middle' }, g); t.textContent = hp.label; }
  }
  if (st.arrow) el('circle', { cx: bx(st.arrow, hand), cy: ftY(arrowFt(st.arrow)), r: 7, class: 'pick arrowpick' }, g);
  if (st.bp) el('circle', { cx: bx(st.bp, hand), cy: ftY(BP_FT), r: 8, class: 'pick bppick' }, g);
  // תוויות אזורים
  [['שבירה', 39], ['חצים', 15], ['עמידה', -8]].forEach(([t, ft]) => {
    const e = el('text', { x: hand === 'R' ? X0 + 4 : X1 - 4, y: ftY(ft), class: 'zlabel', 'text-anchor': hand === 'R' ? 'start' : 'end' }, g); e.textContent = t;
  });

  svg.onclick = ev => {
    const pt = svg.createSVGPoint(); pt.x = ev.clientX; pt.y = ev.clientY;
    const p = pt.matrixTransform(svg.getScreenCTM().inverse());
    const ft = yFt(p.y), board = xb(p.x, hand);
    if (ft < -1) onPick('stance', board);
    else if (ft < 27) onPick('arrow', board);
    else if (ft < 56) onPick('bp', board);
  };
}

// משולש פינים: rack = פינים שעמדו לפני הזריקה, left = פינים שנשארו
const DECK = { 7: [40, 40], 8: [113, 40], 9: [187, 40], 10: [260, 40], 4: [77, 100], 5: [150, 100], 6: [223, 100], 2: [113, 160], 3: [187, 160], 1: [150, 220] };
export function renderDeck(svg, rack, left, onToggle, mini = false) {
  svg.innerHTML = '';
  svg.setAttribute('viewBox', '0 0 300 260');
  for (const p in DECK) {
    const n = Number(p), [x, y] = DECK[p];
    const inRack = rack.includes(n), standing = left.includes(n);
    const g = el('g', { class: `pin ${inRack ? '' : 'gone'} ${standing ? 'up' : 'down'}` }, svg);
    el('circle', { cx: x, cy: y, r: 28, class: 'hit' }, g);
    el('circle', { cx: x, cy: y, r: 24, class: 'disc' }, g);
    const t = el('text', { x, y: y + 8, class: 'pnum' }, g); t.textContent = p;
    if (inRack && !mini) g.addEventListener('click', () => onToggle(n));
  }
}

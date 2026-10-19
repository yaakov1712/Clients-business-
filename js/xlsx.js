'use strict';

/* =========================================================
   xlsx.js – קורא קבצי אקסל (.xlsx) בדפדפן, בלי ספריות ובלי אינטרנט.
   קורא גם צבעי רקע של תאים (כחול = שולם / כתום = לא שולם).
   ========================================================= */

async function unzip(buf) {
  const dv = new DataView(buf), u8 = new Uint8Array(buf), dec = new TextDecoder();
  let e = u8.length - 22;
  while (e >= 0 && dv.getUint32(e, true) !== 0x06054b50) e--;
  if (e < 0) throw new Error('הקובץ אינו קובץ אקסל תקין');
  const n = dv.getUint16(e + 10, true);
  let p = dv.getUint32(e + 16, true);
  const entries = {};
  for (let i = 0; i < n; i++) {
    if (dv.getUint32(p, true) !== 0x02014b50) break;
    const method = dv.getUint16(p + 10, true), csize = dv.getUint32(p + 20, true);
    const nlen = dv.getUint16(p + 28, true), elen = dv.getUint16(p + 30, true), clen = dv.getUint16(p + 32, true);
    const lho = dv.getUint32(p + 42, true);
    entries[dec.decode(u8.subarray(p + 46, p + 46 + nlen))] = { method, csize, lho };
    p += 46 + nlen + elen + clen;
  }
  return {
    has: name => !!entries[name],
    names: () => Object.keys(entries),
    async text(name) {
      const ent = entries[name];
      if (!ent) return null;
      const nl = dv.getUint16(ent.lho + 26, true), el = dv.getUint16(ent.lho + 28, true);
      const start = ent.lho + 30 + nl + el;
      const data = u8.subarray(start, start + ent.csize);
      if (ent.method === 0) return dec.decode(data);
      if (typeof DecompressionStream === 'undefined') throw new Error('הדפדפן לא תומך בקריאת אקסל. עדכן את iOS');
      const stream = new Blob([data]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
      return dec.decode(await new Response(stream).arrayBuffer());
    },
  };
}

const xmlDoc = t => new DOMParser().parseFromString(t, 'application/xml');
const colIdx = ref => { let n = 0; for (const ch of ref.replace(/\d+/g, '')) n = n * 26 + ch.charCodeAt(0) - 64; return n; };
const xl = (el, tag) => el.getElementsByTagName(tag);

function hex2rgb(h) { return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)]; }
function applyTint(rgb, tint) {
  if (!tint) return rgb;
  return rgb.map(c => Math.round(tint < 0 ? c * (1 + tint) : c + (255 - c) * tint));
}
const toHex = rgb => '#' + rgb.map(c => pad2(c)).join('');
const pad2 = c => Math.max(0, Math.min(255, c)).toString(16).padStart(2, '0');

function parseTheme(text) {
  if (!text) return [];
  const d = xmlDoc(text), out = [];
  const scheme = xl(d, 'a:clrScheme')[0];
  if (!scheme) return out;
  const order = ['lt1', 'dk1', 'lt2', 'dk2', 'accent1', 'accent2', 'accent3', 'accent4', 'accent5', 'accent6'];
  for (const k of order) {
    const el = xl(scheme, 'a:' + k)[0];
    if (!el) { out.push(null); continue; }
    const c = el.firstElementChild;
    out.push(c ? (c.getAttribute('val') || c.getAttribute('lastClr') || '').toLowerCase() : null);
  }
  return out;
}

function parseStyles(text, theme) {
  const d = xmlDoc(text);
  const fmts = {};
  for (const nf of xl(d, 'numFmt')) fmts[nf.getAttribute('numFmtId')] = nf.getAttribute('formatCode');
  const fills = [];
  const fillsEl = xl(d, 'fills')[0];
  for (const f of fillsEl ? fillsEl.children : []) {
    const pf = f.firstElementChild;
    let color = null;
    if (pf && pf.getAttribute('patternType') === 'solid') {
      const fg = xl(pf, 'fgColor')[0];
      if (fg) {
        if (fg.getAttribute('rgb')) color = '#' + fg.getAttribute('rgb').slice(-6).toLowerCase();
        else if (fg.getAttribute('theme') !== null) {
          const base = theme[+fg.getAttribute('theme')];
          if (base) color = toHex(applyTint(hex2rgb(base), +(fg.getAttribute('tint') || 0)));
        }
      }
    }
    fills.push(color);
  }
  const xfs = [];
  const cx = xl(d, 'cellXfs')[0];
  for (const x of cx ? cx.children : []) xfs.push({ numFmt: x.getAttribute('numFmtId') || '0', fill: +(x.getAttribute('fillId') || 0) });
  const kindOf = id => {
    const n = +id;
    if ((n >= 14 && n <= 17) || n === 22) return 'date';
    if ((n >= 18 && n <= 21) || (n >= 45 && n <= 47)) return 'time';
    const code = (fmts[id] || '').replace(/"[^"]*"|\[[^\]]*\]|\\./g, '');
    if (!code) return '';
    const hasD = /[dy]/i.test(code), hasT = /h|s|AM\/PM/i.test(code);
    if (hasD) return 'date';
    return hasT ? 'time' : '';
  };
  return xfs.map(x => ({ kind: kindOf(x.numFmt), fill: fills[x.fill] || null }));
}

const serialToDate = n => { const d = new Date(1899, 11, 30); d.setDate(d.getDate() + Math.floor(n)); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };

// מחזיר { sheets: [{ name, cell(r,c), maxRow, maxCol, rowNums }] }
async function readXlsx(file) {
  const zip = await unzip(await file.arrayBuffer());
  const wbXml = await zip.text('xl/workbook.xml');
  if (!wbXml) throw new Error('לא נמצא גיליון בקובץ');
  const rels = xmlDoc(await zip.text('xl/_rels/workbook.xml.rels'));
  const relTarget = {};
  for (const r of xl(rels, 'Relationship')) relTarget[r.getAttribute('Id')] = r.getAttribute('Target');
  const theme = parseTheme(await zip.text('xl/theme/theme1.xml'));
  const styles = zip.has('xl/styles.xml') ? parseStyles(await zip.text('xl/styles.xml'), theme) : [];
  const shared = [];
  if (zip.has('xl/sharedStrings.xml')) {
    const sd = xmlDoc(await zip.text('xl/sharedStrings.xml'));
    for (const si of xl(sd, 'si')) shared.push([...xl(si, 't')].map(t => t.textContent).join(''));
  }
  const sheets = [];
  for (const sh of xl(xmlDoc(wbXml), 'sheet')) {
    const rid = sh.getAttribute('r:id') || sh.getAttributeNS('http://schemas.openxmlformats.org/officeDocument/2006/relationships', 'id');
    let target = relTarget[rid] || '';
    target = target.startsWith('/') ? target.slice(1) : 'xl/' + target.replace(/^\.\//, '');
    const txt = await zip.text(target);
    if (!txt) continue;
    const rows = new Map();
    let maxRow = 0, maxCol = 0;
    for (const row of xl(xmlDoc(txt), 'row')) {
      const r = +row.getAttribute('r');
      const cells = new Map();
      for (const c of xl(row, 'c')) {
        const ref = c.getAttribute('r'), ci = colIdx(ref), t = c.getAttribute('t');
        const st = styles[+(c.getAttribute('s') || 0)] || { kind: '', fill: null };
        const vEl = xl(c, 'v')[0];
        let v = null, kind = '';
        if (t === 'inlineStr') { v = [...xl(c, 't')].map(x => x.textContent).join(''); kind = 's'; }
        else if (vEl) {
          const raw = vEl.textContent;
          if (t === 's') { v = shared[+raw]; kind = 's'; }
          else if (t === 'str' || t === 'e') { v = raw; kind = 's'; }
          else if (t === 'b') { v = raw === '1'; kind = 'b'; }
          else { v = parseFloat(raw); kind = st.kind === 'date' ? 'date' : st.kind === 'time' ? 'time' : 'n'; }
        }
        if (kind === 'n' && v !== null && isNaN(v)) { v = null; kind = ''; }
        if (v === null && !st.fill) continue;
        const cell = { v, kind, fill: st.fill };
        if (kind === 'date') { cell.date = serialToDate(v); cell.min = Math.round((v % 1) * 1440); }
        if (kind === 'time') cell.min = Math.round((v % 1) * 1440);
        cells.set(ci, cell);
        if (v !== null) { maxCol = Math.max(maxCol, ci); }
      }
      if (cells.size) { rows.set(r, cells); maxRow = Math.max(maxRow, r); }
    }
    sheets.push({ name: sh.getAttribute('name'), rows, maxRow, maxCol, cell: (r, c) => (rows.get(r) || new Map()).get(c) || null });
  }
  return { sheets };
}

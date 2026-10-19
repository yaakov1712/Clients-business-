'use strict';

/* =========================================================
   import26.js – מפרש את טבלת ההכנסות (אקסל / גוגל שיטס) לנתוני האפליקציה.
   כל לשונית שיש בה את הכותרת "שם הלקוח" נקראת.
   צבע התא של שם הלקוח: כחול = שולם, כתום = לא שולם.
   ========================================================= */

const HEAD_KEYS = [ // סדר חשוב: ספציפי קודם
  ['hours', ['תחילת יום']], ['start', ['תחילת עבודה', 'תחילה עבודה']], ['end', ['סיום']],
  ['date', ['תאריך']], ['name', ['שם הלקוח', 'שם לקוח']], ['desc', ['תיאור']],
  ['price', ['סכום']], ['mats', ['הוצאות', 'חלקים']], ['profit', ['רווח']],
  ['source', ['איך הגיע', 'מקור']], ['nat', ['מוצא']], ['pay', ['אופן התשלום', 'אופן תשלום']],
];
const RANGE_RE = /(\d{1,2}):(\d{2})\s*[-–־]\s*(\d{1,2}):(\d{2})/;
const WD_LETTER = { 'א': 0, 'ב': 1, 'ג': 2, 'ד': 3, 'ה': 4, 'ו': 5, 'ז': 6 };
const NOTE_ROW_RE = /^[\s\-—–_־]+$|לא עבדתי|חופש|הצעות מחיר|קניות/;

const cellStr = c => {
  if (!c || c.v === null || c.v === undefined) return '';
  if (c.kind === 'time') return min2hm(c.min);
  if (c.kind === 'date') return c.date;
  return String(c.v).replace(/\s+/g, ' ').trim();
};
const fillIsGrey = h => { if (!h) return false; const [r, g, b] = hex2rgb(h.slice(1)); return Math.abs(r - g) < 12 && Math.abs(g - b) < 12 && r > 150 && r < 235; };
const firstNum = t => { const m = /(\d[\d,]*(?:\.\d+)?)/.exec(t || ''); return m ? parseFloat(m[1].replace(/,/g, '')) : 0; };
const validYmd = (y, m, d) => { const dt = new Date(y, m - 1, d); return dt.getFullYear() === y && dt.getMonth() === m - 1 && dt.getDate() === d; };

function findHeader(sh) {
  for (let r = 1; r <= Math.min(30, sh.maxRow); r++) {
    const row = sh.rows.get(r);
    if (!row) continue;
    if (![...row.values()].some(c => typeof c.v === 'string' && /שם הלקוח|שם לקוח/.test(c.v))) continue;
    const cols = {};
    for (const ci of [...row.keys()].sort((a, b) => a - b)) {
      const t = cellStr(row.get(ci));
      if (!t) continue;
      for (const [key, words] of HEAD_KEYS)
        if (words.some(w => t.includes(w))) { if (!(key in cols)) cols[key] = ci; break; }
    }
    if (cols.name === undefined) continue;
    if (cols.nat === undefined && cols.source !== undefined && cols.pay === cols.source + 2) cols.nat = cols.source + 1;
    return { row: r, cols };
  }
  return null;
}

function fixDate(d, m, ys, text, ctx, warn) {
  let y = ys.length === 4 ? +ys : ys.length === 2 ? 2000 + +ys : ctx.year;
  const letter = (/יום\s*-?\s*([א-ז])(?![א-ת])/.exec(text) || [])[1];
  const want = letter !== undefined ? WD_LETTER[letter] : null;
  if (validYmd(y, m, d) && (want === null || new Date(y, m - 1, d).getDay() === want)) return ymd(new Date(y, m - 1, d));
  if (want !== null) {
    const cands = [[ctx.year, m], [y, m - 1], [y, m + 1], [y - 1, m], [y + 1, m]].map(([yy, mm]) => {
      if (mm < 1) { mm = 12; yy--; } if (mm > 12) { mm = 1; yy++; }
      return [yy, mm];
    }).filter(([yy, mm]) => validYmd(yy, mm, d) && new Date(yy, mm - 1, d).getDay() === want);
    if (cands.length) {
      const near = ctx.date ? cands.sort((a, b) => Math.abs(diffDays(ymd(new Date(a[0], a[1] - 1, d)), ctx.date)) - Math.abs(diffDays(ymd(new Date(b[0], b[1] - 1, d)), ctx.date)))[0] : cands[0];
      const fixed = ymd(new Date(near[0], near[1] - 1, d));
      warn(`תאריך תוקן אוטומטית: ${d}/${m}/${y} ← ${fmtG(fixed)} (היום בשבוע לא התאים)`);
      return fixed;
    }
  }
  if (validYmd(y, m, d)) { warn(`תאריך חשוד: ${d}/${m}/${y} (היום בשבוע לא תואם)`); return ymd(new Date(y, m - 1, d)); }
  warn(`תאריך לא תקין: ${text}`);
  return null;
}

function analyzeC(cell, ctx, warn) {
  const res = { date: null, vacation: false, range: null, shopMin: 0, paid: 0, receipt: false };
  if (!cell || cell.v === null) return res;
  if (cell.kind === 'date') { res.date = cell.date; return res; }
  if (cell.kind !== 's') return res;
  const t = String(cell.v).trim();
  const m = /(\d{1,2})\s*[\/\-.]\s*(\d{1,2})\s*[\/\-.]\s*(\d{2,4})/.exec(t);
  if (m) res.date = fixDate(+m[1], +m[2], m[3], t, ctx, warn);
  if (/חופש/.test(t)) res.vacation = true;
  const rg = RANGE_RE.exec(t);
  if (rg && !m) res.range = { start: `${pad(+rg[1])}:${rg[2]}`, end: `${pad(+rg[3])}:${rg[4]}` };
  if (/קנ/.test(t) && /שעתיים|שעות|שעה/.test(t)) res.shopMin = durMin(t);
  const pm = /שילם\s*(\d[\d,.]*)/.exec(t);
  if (pm) res.paid = parseFloat(pm[1].replace(/,/g, ''));
  if (/קבלה/.test(t)) res.receipt = true;
  return res;
}

function durMin(t) {
  if (/שעתיים/.test(t)) return 120;
  const m = /(\d{1,2}):(\d{2})/.exec(t);
  if (m) return +m[1] * 60 + +m[2];
  const n = /(\d+(?:[.,]\d+)?)/.exec(t);
  let h = n ? parseFloat(n[1].replace(',', '.')) : /שעה/.test(t) ? 1 : 0;
  if (/וחצי/.test(t)) h += 0.5;
  return Math.round(h * 60);
}

function analyzeX(cell, slot) {
  if (!cell || cell.v === null) return null;
  if (cell.kind === 'time') return { type: slot === 'N' ? 'dur' : 'time', min: cell.min, slot };
  if (cell.kind !== 's') return { type: 'note', text: String(cell.v) };
  const t = String(cell.v).replace(/\s+/g, ' ').trim();
  if (!t) return null;
  if (/נתתי|תתי|זמן אצל|מעשר|צדקה/.test(t)) return { type: 'donation', amount: firstNum(t), text: t, inKind: /זמן/.test(t) };
  const rg = RANGE_RE.exec(t);
  if (rg) return { type: 'range', start: `${pad(+rg[1])}:${rg[2]}`, end: `${pad(+rg[3])}:${rg[4]}` };
  if (/שעות|שעה|שעתיים/.test(t)) return { type: 'dur', min: durMin(t) };
  const one = /(\d{1,2}):(\d{2})/.exec(t);
  if (one) return { type: 'time', min: +one[1] * 60 + +one[2], slot };
  return { type: 'note', text: t };
}

function parseSource(raw) {
  raw = (raw || '').replace(/\s+/g, ' ').trim();
  const r = { raw, ctype: '', source: '', referredBy: '' };
  if (!raw) return r;
  if (/חוזר|חור\b|מעסיק/.test(raw)) r.ctype = 'returning';
  else if (/חדש/.test(raw)) r.ctype = 'new';
  if (/וו?אצאפ|ווצאפ|וואטסאפ/.test(raw)) r.source = 'ווצאפ';
  else if (/עיתון/.test(raw)) r.source = 'עיתון';
  else if (/המל|המצה/.test(raw)) {
    r.source = 'המלצה';
    let who = raw.replace(/חדש|המלצ(?:ה|ות)|המצה/g, ' ').replace(/[,()]/g, ' ').replace(/\s+/g, ' ').trim();
    if (/^מ(חבר|חברה|לקוח|משפחה|חנות|שכן)/.test(who)) who = who.slice(1);
    else if (/^מ[א-ת]{3,}/.test(who) && !/^(משה|מאיר|מרדכי|מנחם|מיכל|מיכאל|מתי|מנדל|מרים|מלכה)/.test(who)) who = who.slice(1);
    r.referredBy = who;
  } else if (/שכן|חבר|מכיר|הייתי איתו|משפחה/.test(raw)) r.source = 'חבר / שכן';
  else if (/רחוב|בנין|דלת|פגש|ראה|ראיתי|מגנט|הצעתי/.test(raw)) r.source = 'פגישה ברחוב';
  else if (/שלח/.test(raw)) { r.source = 'המלצה'; r.referredBy = raw.replace(/שלח/, '').trim(); }
  else if (!r.ctype) r.source = 'אחר';
  return r;
}

function parseNat(t) {
  t = t || '';
  const opts = [['ישראלי', /ישראל/], ['אמריקאי', /אמריק/], ['אנגלי', /אנגל/], ['חוצניק', /חוצניק|חו״ל/]];
  let best = null;
  for (const [name, re] of opts) { const m = re.exec(t); if (m && (!best || m.index < best.i)) best = { name, i: m.index }; }
  return best ? best.name : '';
}
const NAT_WORD = /\s+(אמריקאית|אמריקאי|אמריקית|אמריקאים|אנגלי|אנגלית|חוצניק|חוצניקית)$/;

function normMethod(t) {
  t = t || '';
  if (/ביט/.test(t)) return 'ביט';
  if (/פיי|בוקס/.test(t)) return 'פייבוקס';
  if (/צ.?ק/.test(t)) return 'צ׳ק';
  if (/העברה|בנק/.test(t)) return 'העברה בנקאית';
  if (/מזומן/.test(t)) return 'מזומן';
  return '';
}

function fillState(hex) {
  if (!hex) return '';
  const [r, g, b] = hex2rgb(hex.slice(1));
  if (b > r + 25 && b >= g - 10) return 'paid';
  if (r > b + 70 && r >= g) return 'unpaid';
  return '';
}

// הפונקציה הראשית: book (מ-readXlsx) → תוצאה לתצוגה מקדימה ולייבוא
function parseIncomeWorkbook(book) {
  const out = { jobs: [], clients: new Map(), workdays: new Map(), trips: [], donations: [], warnings: [], sheets: [], stats: {} };
  const keyCount = new Map();
  for (const sh of book.sheets) {
    const head = findHeader(sh);
    if (!head) continue;
    const { cols } = head;
    const warn = msg => out.warnings.push(`${sh.name}: ${msg}`);
    const ctx = { date: null, year: new Date().getFullYear(), anchor: null, pending: false, weekOffset: 0, dayIdx: 0 };
    const weekCol = cols.date !== undefined ? cols.date - 1 : 1;
    let approx = 0;
    let rowsRead = 0, jobsHere = 0;
    const get = (r, k) => (cols[k] === undefined ? null : sh.cell(r, cols[k]));
    const wd = date => { let w = out.workdays.get(date); if (!w) out.workdays.set(date, w = { date, start: '', end: '', minutes: 0, note: '', off: false }); return w; };
    for (let r = head.row + 1; r <= sh.maxRow; r++) {
      if (!sh.rows.has(r)) continue;
      const nameRaw = cellStr(get(r, 'name'));
      const c = analyzeC(get(r, 'date'), ctx, warn);
      if (c.date) { ctx.date = c.date; ctx.anchor = c.date; ctx.year = +c.date.slice(0, 4); ctx.pending = false; ctx.weekOffset = 0; ctx.dayIdx = 0; }
      // סימני סוף שבוע / סוף יום – משמשים להערכת תאריך לשורות שאין להן תאריך
      const wcell = sh.cell(r, weekCol), ccell = get(r, 'date');
      if (!nameRaw && wcell && wcell.kind === 'n' && wcell.v > 0) { ctx.pending = true; ctx.weekOffset++; ctx.dayIdx = 0; }
      else if (ctx.pending && !nameRaw && ((ccell && ccell.kind === 'n') || fillIsGrey((get(r, 'name') || {}).fill))) ctx.dayIdx++;
      const xs = { L: analyzeX(get(r, 'end'), 'L'), M: analyzeX(get(r, 'start'), 'M'), N: analyzeX(get(r, 'hours'), 'N') };
      const isNoteRow = !nameRaw || NOTE_ROW_RE.test(nameRaw);
      if (c.vacation && ctx.date && !(nameRaw && !isNoteRow)) { const w = wd(ctx.date); w.off = true; w.note = w.note || 'חופש'; }
      if (isNoteRow) {
        // שורת סיכום / הערה: שעות ותרומות שייכות ליום הנוכחי
        if (!ctx.date) continue;
        const w = wd(ctx.date);
        if (nameRaw && /לא עבדתי|חופש/.test(nameRaw)) { w.off = true; w.note = nameRaw; }
        else if (nameRaw && !/^[\s\-—–_־]+$/.test(nameRaw)) w.note = w.note ? w.note + ' · ' + nameRaw : nameRaw;
        if (c.range) { w.start = w.start || c.range.start; w.end = w.end || c.range.end; }
        for (const [slot, x] of Object.entries(xs)) {
          if (!x) continue;
          if (x.type === 'time') { if (slot === 'L') w.end = w.end || min2hm(x.min); else w.start = w.start || min2hm(x.min); }
          else if (x.type === 'range') { w.start = w.start || x.start; w.end = w.end || x.end; }
          else if (x.type === 'dur') w.minutes = w.minutes || x.min;
          else if (x.type === 'donation') out.donations.push({ date: ctx.date, amount: x.amount, text: x.text, inKind: x.inKind });
        }
        if (c.shopMin) out.trips.push({ date: ctx.date, minutes: c.shopMin, note: 'נסיעה לקניות (מהאקסל)' });
        continue;
      }
      // ---- שורת עבודה ----
      rowsRead++;
      let dateApprox = false;
      if (ctx.pending && !c.date && ctx.anchor) {
        let d = addDays(weekStart(ctx.anchor), 7 * ctx.weekOffset), n = ctx.dayIdx;
        while (n > 0 || dow(d) === 6) { d = addDays(d, 1); if (dow(d) !== 6) n--; }
        ctx.date = d; dateApprox = true; approx++;
      }
      if (!ctx.date) { warn(`שורה ${r} (${nameRaw}) בלי תאריך – דולגה`); continue; }
      const date = ctx.date;
      let name = nameRaw.replace(/\s+/g, ' ').trim(), nat = parseNat(cellStr(get(r, 'nat')));
      const nm = NAT_WORD.exec(name);
      if (nm) { nat = nat || parseNat(nm[1]); name = name.replace(NAT_WORD, ''); }
      const priceCell = get(r, 'price');
      const price = priceCell && priceCell.kind === 'n' ? priceCell.v : (cellStr(priceCell) ? firstNum(cellStr(priceCell)) : null);
      const matsCell = get(r, 'mats');
      let mats = matsCell && matsCell.kind === 'n' ? matsCell.v : 0;
      const profitCell = get(r, 'profit');
      if (!mats && price && profitCell && profitCell.kind === 'n' && profitCell.v < price) mats = price - profitCell.v;
      const desc = cellStr(get(r, 'desc'));
      const src = parseSource(cellStr(get(r, 'source')));
      const method = normMethod(cellStr(get(r, 'pay')));
      const payRaw = cellStr(get(r, 'pay'));
      const fs = fillState((get(r, 'name') || {}).fill);
      const isQuote = /הצעת מחיר/.test(desc) && !price;
      const notes = [];
      if (c.receipt) notes.push('הונפקה קבלה');
      if (payRaw && !method) notes.push(payRaw);
      const job = {
        date, status: isQuote ? 'open' : 'closed', clientKey: normName(name),
        source: src.source, sourceRaw: src.raw, referredBy: src.referredBy, ctype: src.ctype,
        description: desc, price: price || 0, materials: mats || 0, extra: 0, payments: [], tStart: '', tEnd: '', dur: 0, dateApprox,
      };
      // שעות: L = סיום, M = תחילה, N = יום עבודה כולל
      for (const [slot, x] of Object.entries(xs)) {
        if (!x) continue;
        if (x.type === 'time') { if (slot === 'L') job.tEnd = min2hm(x.min); else job.tStart = min2hm(x.min); }
        else if (x.type === 'range') { if (slot === 'N') { const w = wd(date); w.start = w.start || x.start; w.end = w.end || x.end; } else { job.tStart = x.start; job.tEnd = x.end; } }
        else if (x.type === 'dur') { if (slot === 'N') { const w = wd(date); w.minutes = w.minutes || x.min; } job.dur = job.dur || x.min; }
        else if (x.type === 'donation') out.donations.push({ date, amount: x.amount, text: x.text, inKind: x.inKind });
        else if (x.type === 'note') notes.push(x.text);
      }
      if (job.tStart && job.tEnd) job.dur = 0;
      if (c.range) { const w = wd(date); w.start = w.start || c.range.start; w.end = w.end || c.range.end; }
      if (c.shopMin) out.trips.push({ date, minutes: c.shopMin, note: `נסיעה לקניות (${name})` });
      // תשלום
      if (job.status === 'closed') {
        const paidAmt = c.paid ? Math.min(c.paid, price || c.paid) : (fs === 'unpaid' ? 0 : (price || 0));
        job.paidState = c.paid ? 'partial' : fs || 'paid?';
        if (paidAmt > 0) job.payments.push({ date, amount: paidAmt, method: method || 'לא צוין' });
      }
      job.notes = notes.join(' · ');
      const base = ['x', sh.name, date, normName(name), price ?? '', normName(desc), job.paidState || ''].join('|');
      const occ = (keyCount.get(base) || 0) + 1; keyCount.set(base, occ);
      job.importKey = base + '|' + occ;
      out.jobs.push(job); jobsHere++;
      let cl = out.clients.get(job.clientKey);
      if (!cl) out.clients.set(job.clientKey, cl = { key: job.clientKey, name, nationality: '', origin: '', referredBy: '' });
      cl.nationality = cl.nationality || nat;
      if (src.source && !cl.origin && src.ctype !== 'returning') { cl.origin = src.source; cl.referredBy = src.referredBy; }
    }
    if (approx) warn(`${approx} עבודות בסוף הטבלה לא היה להן תאריך – קיבלו תאריך משוער לפי השבוע בטבלה (מסומנות להשלמה)`);
    out.approx = (out.approx || 0) + approx;
    out.sheets.push({ name: sh.name, jobs: jobsHere, rows: rowsRead });
  }
  for (const [k, w] of [...out.workdays]) if (!w.start && !w.end && !w.minutes && !w.note && !w.off) out.workdays.delete(k);
  const closed = out.jobs.filter(j => j.status === 'closed');
  const dates = out.jobs.map(j => j.date).sort();
  out.stats = {
    jobs: out.jobs.length, closed: closed.length,
    paid: closed.filter(j => paidOf(j) >= num(j.price) && num(j.price) > 0).length,
    partial: closed.filter(j => paidOf(j) > 0 && paidOf(j) < num(j.price)).length,
    unpaid: closed.filter(j => num(j.price) > 0 && paidOf(j) === 0).length,
    noPrice: closed.filter(j => !num(j.price)).length,
    quotes: out.jobs.length - closed.length, approx: out.approx || 0,
    revenue: sum(closed, j => num(j.price)), profit: sum(closed, profitOf),
    due: sum(closed, j => Math.max(0, num(j.price) - paidOf(j))),
    clients: out.clients.size, workdays: out.workdays.size,
    donations: out.donations.length, trips: out.trips.length,
    vacations: [...out.workdays.values()].filter(w => w.off).length,
    from: dates[0] || '', to: dates[dates.length - 1] || '',
  };
  return out;
}

// כתיבה למסד הנתונים. replace = מחיקת מה שיובא בעבר ולא נערך ידנית, ואז ייבוא מחדש
async function commitImport(res, replace) {
  const now = Date.now();
  const byName = new Map(S.clients.map(c => [normName(c.name), c]));
  const newClients = [], touched = [];
  const idOf = new Map();
  for (const d of res.clients.values()) {
    let c = byName.get(d.key);
    if (!c) {
      c = { id: uid(), name: d.name, phone: '', address: '', nationality: d.nationality, origin: d.origin, referredBy: d.referredBy, notes: '', imported: true };
      newClients.push(c); byName.set(d.key, c);
    } else {
      let changed = false;
      if (!c.nationality && d.nationality) { c.nationality = d.nationality; changed = true; }
      if (!c.origin && d.origin) { c.origin = d.origin; changed = true; }
      if (changed) touched.push(c);
    }
    idOf.set(d.key, c.id);
  }
  await saveMany('clients', [...newClients, ...touched]);

  const existingKeys = new Set(S.jobs.filter(j => j.importKey).map(j => j.importKey));
  const newKeys = new Set(res.jobs.map(j => j.importKey));
  let removed = 0;
  if (replace) {
    const { from, to } = res.stats;
    const stale = S.jobs.filter(j => j.imported && !j.edited && !newKeys.has(j.importKey) && j.date >= from && j.date <= to).map(j => j.id);
    removed = stale.length;
    await removeMany('jobs', stale);
  }
  const jobs = [];
  for (const j of res.jobs) {
    if (existingKeys.has(j.importKey)) continue;
    const { clientKey, paidState, ...rest } = j;
    jobs.push({ id: uid(), ...rest, clientId: idOf.get(clientKey), imported: true });
  }
  await saveMany('jobs', jobs);

  const wds = [];
  for (const w of res.workdays.values()) {
    if (!w.start && !w.end && !w.minutes && !w.note && !w.off) continue;
    const ex = S.workdays.find(x => x.date === w.date);
    if (ex && !ex.imported) continue;
    wds.push({ id: ex ? ex.id : uid(), ...w, imported: true, createdAt: ex ? ex.createdAt : undefined });
  }
  await saveMany('workdays', wds);

  const pKeys = new Set(S.purchases.map(p => p.importKey).filter(Boolean));
  const trips = [];
  res.trips.forEach((t, i) => {
    const key = `t|${t.date}|${t.minutes}|${i}`;
    if (pKeys.has(key)) return;
    trips.push({ id: uid(), date: t.date, store: '', amount: 0, method: '', minutes: t.minutes, note: t.note, importKey: key, imported: true });
  });
  await saveMany('purchases', trips);

  const mKeys = new Set(S.money.map(m => m.importKey).filter(Boolean));
  const gifts = [];
  res.donations.forEach((d, i) => {
    if (!d.amount) return;
    const key = `d|${d.date}|${d.amount}|${normName(d.text)}|${i}`;
    if (mKeys.has(key)) return;
    gifts.push({ id: uid(), ledger: 'personal', kind: 'out', date: d.date, amount: d.amount, category: 'צדקה / מעשר', note: d.text, inKind: !!d.inKind, importKey: key, imported: true });
  });
  await saveMany('money', gifts);
  return { jobs: jobs.length, skipped: res.jobs.length - jobs.length, removed, clients: newClients.length, workdays: wds.length, trips: trips.length, donations: gifts.length };
}

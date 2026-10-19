'use strict';

/* =========================================================
   core.js – כלים, תאריכים (לועזי/עברי), אחסון, לוגיקה עסקית, ניווט
   ========================================================= */

// ---------- כלים כלליים ----------
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
const num = v => {
  if (typeof v === 'number') return isFinite(v) ? v : 0;
  const n = parseFloat(String(v ?? '').replace(/[^\d.\-]/g, ''));
  return isNaN(n) ? 0 : n;
};
const nf = new Intl.NumberFormat('he-IL');
const money = n => (Math.round(n) < 0 ? '\u200E-' : '') + '₪' + nf.format(Math.round(Math.abs(n)));
const moneyK = n => { const a = Math.abs(n); return (n < 0 ? '\u200E-' : '') + (a >= 1000 ? (a / 1000).toFixed(a >= 10000 ? 0 : 1).replace(/\.0$/, '') + 'K' : Math.round(a)); };
const sum = (arr, f) => arr.reduce((s, x) => s + f(x), 0);
const pct = (a, b) => (b ? Math.round((a / b) * 100) : 0) + '%';
const byDateDesc = (a, b) => b.date.localeCompare(a.date) || (b.createdAt || 0) - (a.createdAt || 0);

function normPhone(p) {
  let d = String(p || '').replace(/\D/g, '');
  if (d.startsWith('972')) d = '0' + d.slice(3);
  if (d.length === 9 && /^[5-9]/.test(d)) d = '0' + d;
  return d;
}
const waPhone = p => { const d = normPhone(p); return d.startsWith('0') ? '972' + d.slice(1) : d; };
const waLink = (p, text = '') => `https://wa.me/${waPhone(p)}${text ? '?text=' + encodeURIComponent(text) : ''}`;
const wazeLink = addr => `https://waze.com/ul?q=${encodeURIComponent(addr)}&navigate=yes`;
const normName = s => String(s || '').replace(/\s+/g, ' ').trim().toLowerCase();

function toast(msg, icon = 'check') {
  const t = $('#toast');
  t.innerHTML = ic(icon, 'sm') + esc(msg); t.hidden = false;
  clearTimeout(toast.t); toast.t = setTimeout(() => (t.hidden = true), 2200);
}
function opts(arr, sel, empty) {
  const list = sel && !arr.includes(sel) ? [...arr, sel] : arr;
  return (empty !== undefined ? `<option value="">${esc(empty)}</option>` : '') +
    list.map(v => `<option ${v === sel ? 'selected' : ''}>${esc(v)}</option>`).join('');
}
function download(name, data, type) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([data], { type }));
  a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
}

// ---------- אייקונים ----------
const ICONS = {
  home: '<path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><path d="M9 22V12h6v10"/>',
  calendar: '<rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  users: '<path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/>',
  user: '<path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>',
  grid: '<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/>',
  phone: '<path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/>',
  message: '<path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/>',
  pin: '<path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/>',
  nav: '<path d="M3 11l19-9-9 19-2-8-8-2z"/>',
  search: '<circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/>',
  left: '<path d="M15 18l-6-6 6-6"/>',
  right: '<path d="M9 18l6-6-6-6"/>',
  check: '<path d="M20 6L9 17l-5-5"/>',
  checkc: '<path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><path d="M22 4L12 14.01l-3-3"/>',
  x: '<path d="M18 6L6 18M6 6l12 12"/>',
  clock: '<circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/>',
  wallet: '<path d="M20 12V8H6a2 2 0 0 1-2-2c0-1.1.9-2 2-2h12v4"/><path d="M4 6v12c0 1.1.9 2 2 2h14v-4"/><path d="M18 12a2 2 0 0 0 0 4h4v-4z"/>',
  trend: '<path d="M23 6l-9.5 9.5-5-5L1 18"/><path d="M17 6h6v6"/>',
  chart: '<path d="M18 20V10M12 20V4M6 20v-6"/>',
  cart: '<circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/><path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"/>',
  bag: '<path d="M6 2L3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z"/><path d="M3 6h18"/><path d="M16 10a4 4 0 0 1-8 0"/>',
  tool: '<path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/>',
  alert: '<path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><path d="M12 9v4M12 17h.01"/>',
  download: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="M7 10l5 5 5-5M12 15V3"/>',
  upload: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="M17 8l-5-5-5 5M12 3v12"/>',
  sliders: '<path d="M4 21v-7M4 10V3M12 21v-9M12 8V3M20 21v-5M20 12V3M1 14h6M9 8h6M17 16h6"/>',
  edit: '<path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/>',
  trash: '<path d="M3 6h18"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>',
  file: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6M16 13H8M16 17H8M10 9H8"/>',
  refresh: '<path d="M23 4v6h-6M1 20v-6h6"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/>',
  truck: '<rect x="1" y="3" width="15" height="13" rx="1"/><path d="M16 8h4l3 3v5h-7V8z"/><circle cx="5.5" cy="18.5" r="2.5"/><circle cx="18.5" cy="18.5" r="2.5"/>',
  play: '<path d="M5 3l14 9-14 9V3z"/>',
  stop: '<rect x="6" y="6" width="12" height="12" rx="2"/>',
  arrowin: '<path d="M17 7L7 17M17 17H7V7"/>',
  arrowout: '<path d="M7 17L17 7M7 7h10v10"/>',
  card: '<rect x="1" y="4" width="22" height="16" rx="2"/><path d="M1 10h22"/>',
  list: '<path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/>',
  info: '<circle cx="12" cy="12" r="10"/><path d="M12 16v-4M12 8h.01"/>',
  incoming: '<path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/><path d="M16 2v6h6M23 1l-7 7"/>',
  heart: '<path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41"/>',
  shield: '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>',
  copy: '<rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>',
  star: '<path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/>',
};
const ic = (name, cls = '') => `<svg class="ico ${cls}" viewBox="0 0 24 24" aria-hidden="true">${ICONS[name] || ''}</svg>`;
const AV = n => { let h = 0; for (const ch of String(n || '')) h = (h * 31 + ch.charCodeAt(0)) >>> 0; return 'av' + (h % 6); };

// ---------- תאריכים: לועזי ועברי ----------
const pad = n => String(n).padStart(2, '0');
const ymd = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const parseYmd = s => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
const today = () => ymd(new Date());
const addDays = (s, n) => { const d = parseYmd(s); d.setDate(d.getDate() + n); return ymd(d); };
const dow = s => parseYmd(s).getDay();
const diffDays = (a, b) => Math.round((parseYmd(a) - parseYmd(b)) / 864e5);
const DAYS = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת'];
const DAYS_S = ['א׳', 'ב׳', 'ג׳', 'ד׳', 'ה׳', 'ו׳', 'ש׳'];
const GMONTHS = ['ינואר', 'פברואר', 'מרץ', 'אפריל', 'מאי', 'יוני', 'יולי', 'אוגוסט', 'ספטמבר', 'אוקטובר', 'נובמבר', 'דצמבר'];
const fmtG = s => { const [y, m, d] = s.split('-'); return `${+d}/${+m}/${y}`; };
const fmtDM = s => { const [, m, d] = s.split('-'); return `${+d}/${+m}`; };
const fmtLong = s => { const d = parseYmd(s); return `יום ${DAYS[d.getDay()]}, ${d.getDate()} ב${GMONTHS[d.getMonth()]}`; };
const monthKey = s => s.slice(0, 7);
const weekStart = s => addDays(s, -dow(s));

function gem(n) { // מספר לגימטריה: 787 -> תשפ״ז
  const ones = ['', 'א', 'ב', 'ג', 'ד', 'ה', 'ו', 'ז', 'ח', 'ט'];
  const tens = ['', 'י', 'כ', 'ל', 'מ', 'נ', 'ס', 'ע', 'פ', 'צ'];
  const hund = ['', 'ק', 'ר', 'ש', 'ת', 'תק', 'תר', 'תש', 'תת', 'תתק'];
  let s = hund[Math.floor(n / 100)]; n %= 100;
  if (n === 15) s += 'טו'; else if (n === 16) s += 'טז'; else s += tens[Math.floor(n / 10)] + ones[n % 10];
  return s.length === 1 ? s + '׳' : s.slice(0, -1) + '״' + s.slice(-1);
}
const hebFmt = new Intl.DateTimeFormat('he-u-ca-hebrew', { day: 'numeric', month: 'long', year: 'numeric' });
const hebCache = new Map();
function hebParts(s) {
  let r = hebCache.get(s);
  if (!r) {
    const p = {};
    for (const x of hebFmt.formatToParts(parseYmd(s))) p[x.type] = x.value;
    r = { day: +p.day, month: p.month, year: +p.year };
    hebCache.set(s, r);
  }
  return r;
}
const hebDate = s => { const p = hebParts(s); return `${gem(p.day)} ${p.month} ${gem(p.year % 1000)}`; };
const hebDM = s => { const p = hebParts(s); return `${gem(p.day)} ${p.month}`; };
const hebDay = s => gem(hebParts(s).day);

// חגים ומועדים (לפי התאריך העברי)
function holidayOf(s) {
  const { day: d, month: m } = hebParts(s), w = dow(s);
  const adar = m === 'אדר' || m === 'אדר ב׳';
  if (m === 'תשרי') {
    if (d === 1 || d === 2) return { name: 'ראש השנה', kind: 'yt' };
    if (d === 3 && w !== 6) return { name: 'צום גדליה', kind: 'fast' };
    if (d === 4 && w === 0) return { name: 'צום גדליה', kind: 'fast' };
    if (d === 10) return { name: 'יום כיפור', kind: 'yt' };
    if (d === 15) return { name: 'סוכות', kind: 'yt' };
    if (d >= 16 && d <= 21) return { name: 'חול המועד סוכות', kind: 'chm' };
    if (d === 22) return { name: 'שמיני עצרת', kind: 'yt' };
  }
  if (m === 'כסלו' && d >= 25) return { name: 'חנוכה', kind: 'minor' };
  if (m === 'טבת') {
    if (d <= 2) return { name: 'חנוכה', kind: 'minor' };
    if (d === 3 && hebParts(addDays(s, -3)).day === 29) return { name: 'חנוכה', kind: 'minor' };
    if (d === 10) return { name: 'עשרה בטבת', kind: 'fast' };
  }
  if (m === 'שבט' && d === 15) return { name: 'ט״ו בשבט', kind: 'minor' };
  if (adar) {
    const lastAdar = m === 'אדר ב׳' || (m === 'אדר' && true);
    if (lastAdar) {
      if (d === 14) return { name: 'פורים', kind: 'minor' };
      if (d === 15) return { name: 'שושן פורים', kind: 'minor' };
      if (d === 13 && w !== 6) return { name: 'תענית אסתר', kind: 'fast' };
      if (d === 11 && w === 4) return { name: 'תענית אסתר', kind: 'fast' };
    }
  }
  if (m === 'ניסן') {
    if (d === 15) return { name: 'פסח', kind: 'yt' };
    if (d >= 16 && d <= 20) return { name: 'חול המועד פסח', kind: 'chm' };
    if (d === 21) return { name: 'שביעי של פסח', kind: 'yt' };
  }
  if (m === 'אייר') {
    if (d === 18) return { name: 'ל״ג בעומר', kind: 'minor' };
    if (d === 28) return { name: 'יום ירושלים', kind: 'minor' };
  }
  if (m === 'סיוון' && d === 6) return { name: 'שבועות', kind: 'yt' };
  if (m === 'תמוז') {
    if (d === 17 && w !== 6) return { name: 'י״ז בתמוז', kind: 'fast' };
    if (d === 18 && w === 0) return { name: 'י״ז בתמוז', kind: 'fast' };
  }
  if (m === 'אב') {
    if (d === 9 && w !== 6) return { name: 'תשעה באב', kind: 'fast' };
    if (d === 10 && w === 0) return { name: 'תשעה באב', kind: 'fast' };
  }
  if ((d === 1 || d === 30) && !(m === 'תשרי' && d === 1)) return { name: 'ראש חודש', kind: 'rc' };
  return null;
}

// תקופות לדוחות: יום / שבוע / חודש / שנה, בלוח לועזי או עברי
function periodOf(s, unit, heb) {
  if (unit === 'day') return { key: s, label: `${fmtLong(s)}`, sub: hebDate(s) };
  if (unit === 'week') {
    const ws = weekStart(s), we = addDays(ws, 6);
    return heb
      ? { key: ws, label: `שבוע ${hebDM(ws)} – ${hebDM(we)}`, sub: `${fmtDM(ws)} – ${fmtG(we)}` }
      : { key: ws, label: `שבוע ${fmtDM(ws)} – ${fmtG(we)}`, sub: `${hebDM(ws)} – ${hebDM(we)}` };
  }
  if (unit === 'month') {
    if (heb) { const p = hebParts(s); return { key: p.year + '-' + p.month, label: `${p.month} ${gem(p.year % 1000)}`, sub: '' }; }
    const [y, m] = s.split('-');
    return { key: y + '-' + m, label: `${GMONTHS[+m - 1]} ${y}`, sub: '' };
  }
  if (heb) { const p = hebParts(s); return { key: '' + p.year, label: `שנת ${gem(p.year % 1000)}`, sub: '' }; }
  return { key: s.slice(0, 4), label: `שנת ${s.slice(0, 4)}`, sub: '' };
}

// שעות
const hm2min = s => { const m = /^(\d{1,2}):(\d{2})/.exec(s || ''); return m ? +m[1] * 60 + +m[2] : null; };
const min2hm = m => `${pad(Math.floor(m / 60) % 24)}:${pad(Math.round(m) % 60)}`;
const nowHM = () => { const d = new Date(); return `${pad(d.getHours())}:${pad(d.getMinutes())}`; };
function fmtDur(min) {
  min = Math.round(min || 0);
  if (!min) return '0 דק׳';
  const h = Math.floor(min / 60), m = min % 60;
  return h ? (m ? `${h}:${pad(m)} ש׳` : `${h} ש׳`) : `${m} דק׳`;
}
const spanMin = (a, b) => { const x = hm2min(a), y = hm2min(b); if (x === null || y === null) return 0; return y >= x ? y - x : y + 1440 - x; };

// ---------- אחסון (IndexedDB) ----------
const STORES = ['clients', 'jobs', 'money', 'events', 'purchases', 'workdays'];
const DEFAULTS = {
  sources: ['ווצאפ', 'המלצה', 'עיתון', 'חבר / שכן', 'פגישה ברחוב', 'פייסבוק', 'גוגל', 'אחר'],
  nationalities: ['ישראלי', 'אמריקאי', 'אנגלי', 'חוצניק'],
  methods: ['מזומן', 'ביט', 'פייבוקס', 'העברה בנקאית', 'צ׳ק', 'אשראי'],
  bizOutCats: ['חומרים למלאי', 'כלי עבודה', 'דלק', 'רכב', 'טלפון', 'פרסום', 'ביטוח', 'מס הכנסה', 'ביטוח לאומי', 'מע״מ', 'רואה חשבון', 'אחר'],
  bizInCats: ['הכנסה אחרת', 'הפקדת בעלים', 'הלוואה', 'אחר'],
  personalOutCats: ['שכר דירה', 'אוכל וקניות', 'חשבונות', 'רכב', 'ביגוד', 'בילויים', 'חיסכון', 'צדקה / מעשר', 'אחר'],
  personalInCats: ['משיכה מהעסק', 'מתנה', 'אחר'],
  lostReasons: ['יקר מדי', 'לא הייתי זמין', 'לא ענה / נעלם', 'לא בתחום שלי', 'אחר'],
  city: 'ירושלים',
  opening: { bizCash: 0, bizBank: 0, personal: 0 },
  openingDate: '2026-01-01',
  materialsAccount: 'bank',
  maaserPct: 10,
  hebrewDefault: false,
  lastBackup: 0,
  timer: null,
};
const WITHDRAW = 'משיכה לפרטי';
const S = { clients: [], jobs: [], money: [], events: [], purchases: [], workdays: [], settings: null };
let db;

function openDB() {
  return new Promise((res, rej) => {
    const r = indexedDB.open('handyman-business', 2);
    r.onupgradeneeded = () => {
      for (const s of [...STORES, 'meta'])
        if (!r.result.objectStoreNames.contains(s)) r.result.createObjectStore(s, { keyPath: 'id' });
    };
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
}
function idb(store, mode, fn) {
  return new Promise((res, rej) => {
    const t = db.transaction(store, mode);
    const r = fn(t.objectStore(store));
    t.oncomplete = () => res(r && r.result);
    t.onerror = () => rej(t.error);
  });
}
async function loadAll() {
  db = await openDB();
  for (const s of STORES) S[s] = await idb(s, 'readonly', os => os.getAll());
  const m = await idb('meta', 'readonly', os => os.get('settings'));
  S.settings = { ...structuredClone(DEFAULTS), ...(m ? m.value : {}) };
}
async function save(store, obj) {
  obj.updatedAt = Date.now();
  if (!obj.createdAt) obj.createdAt = obj.updatedAt;
  const arr = S[store], i = arr.findIndex(x => x.id === obj.id);
  if (i >= 0) arr[i] = obj; else arr.push(obj);
  await idb(store, 'readwrite', os => os.put(obj));
  return obj;
}
async function saveMany(store, objs) {
  const now = Date.now();
  for (const o of objs) { o.updatedAt = now; o.createdAt = o.createdAt || now; }
  const ids = new Set(objs.map(o => o.id));
  S[store] = S[store].filter(x => !ids.has(x.id)).concat(objs);
  await idb(store, 'readwrite', os => { objs.forEach(o => os.put(o)); });
}
async function remove(store, id) {
  S[store] = S[store].filter(x => x.id !== id);
  await idb(store, 'readwrite', os => os.delete(id));
}
async function removeMany(store, ids) {
  const set = new Set(ids);
  S[store] = S[store].filter(x => !set.has(x.id));
  await idb(store, 'readwrite', os => { ids.forEach(id => os.delete(id)); });
}
const saveSettings = () => idb('meta', 'readwrite', os => os.put({ id: 'settings', value: S.settings }));
async function wipeAll() {
  for (const s of STORES) { await idb(s, 'readwrite', os => os.clear()); S[s] = []; }
}

// ---------- לוגיקה עסקית ----------
const STATUS = { open: 'בבירור', closed: 'נסגר', lost: 'לא נסגר' };
const clientById = id => S.clients.find(c => c.id === id);
const paidOf = j => sum(j.payments || [], p => num(p.amount));
const profitOf = j => num(j.price) - num(j.materials) - num(j.extra);
const dueOf = j => (j.status === 'closed' ? Math.max(0, num(j.price) - paidOf(j)) : 0);
function payState(j) {
  if (j.status !== 'closed') return null;
  const p = paidOf(j), pr = num(j.price);
  if (pr > 0 && p >= pr) return 'paid';
  if (p > 0) return 'partial';
  return pr > 0 ? 'unpaid' : null;
}
const accountOf = method => (method === 'מזומן' ? 'cash' : 'bank');
const durOf = j => (j.tStart && j.tEnd ? spanMin(j.tStart, j.tEnd) : num(j.dur));
const tripMin = p => (p.leave && p.back ? spanMin(p.leave, p.back) : num(p.minutes));
function sourceOf(j) {
  if (j.source) return j.source;
  const c = clientById(j.clientId);
  if (clientTypes().get(j.id) === 'returning') return 'לקוח חוזר';
  return (c && c.origin) || '';
}

let _ctCache = null, _ctVer = -1;
const dataVer = () => S.jobs.length + ':' + sum(S.jobs, j => j.updatedAt || 0);
// לקוח חדש/חוזר: חוזר = כבר הייתה לו עבודה שנסגרה לפני כן
function clientTypes() {
  const v = dataVer();
  if (_ctCache && _ctVer === v) return _ctCache;
  const m = new Map(), seen = new Set();
  const sorted = [...S.jobs].sort((a, b) => a.date.localeCompare(b.date) || (a.createdAt || 0) - (b.createdAt || 0));
  for (const j of sorted) {
    m.set(j.id, j.ctype || (seen.has(j.clientId) ? 'returning' : 'new'));
    if (j.status === 'closed') seen.add(j.clientId);
  }
  _ctCache = m; _ctVer = v;
  return m;
}
function clientStats(id) {
  const jobs = S.jobs.filter(j => j.clientId === id).sort(byDateDesc);
  const closed = jobs.filter(j => j.status === 'closed');
  return {
    jobs, count: jobs.length, closed: closed.length,
    revenue: sum(closed, j => num(j.price)), profit: sum(closed, profitOf), due: sum(closed, dueOf),
    last: jobs[0] ? jobs[0].date : '',
  };
}
function findByPhone(phone) {
  const np = normPhone(phone);
  if (np.length < 6) return [];
  return S.clients.filter(c => [c.phone, c.phone2].some(p => p && normPhone(p) === np));
}

// נתונים חסרים (להשלמה)
function missingJob(j) {
  if (j.status !== 'closed') return [];
  const m = [];
  if (j.dateApprox) m.push('date');
  if (!num(j.price)) m.push('price');
  if (!j.description) m.push('description');
  const returning = clientTypes().get(j.id) === 'returning';
  if (!returning && !j.source && !(clientById(j.clientId) || {}).origin) m.push('source');
  return m;
}
const MISS_LABEL = { date: 'תאריך מדויק', price: 'סכום', description: 'מה נעשה', source: 'מאיפה הגיע' };
function missingClient(c) {
  const m = [];
  if (!c.phone) m.push('phone');
  if (!c.address) m.push('address');
  if (!c.nationality) m.push('nationality');
  return m;
}
const CMISS_LABEL = { phone: 'טלפון', address: 'כתובת', nationality: 'מוצא' };
function todoItems() {
  const jobs = S.jobs.filter(j => missingJob(j).length);
  const stats = new Map(S.clients.map(c => [c.id, clientStats(c.id)]));
  const clients = S.clients.filter(c => stats.get(c.id).closed > 0 && missingClient(c).length)
    .sort((a, b) => stats.get(b.id).revenue - stats.get(a.id).revenue);
  const trips = S.purchases.filter(p => !num(p.amount) || !p.store);
  return { jobs: jobs.sort(byDateDesc), clients, trips };
}

// תנועות העסק: ידניות + אוטומטיות (תשלומי לקוחות, קניות חומרים)
function bizEntries() {
  const out = [];
  for (const j of S.jobs) {
    if (j.status !== 'closed') continue;
    const c = clientById(j.clientId), name = c ? c.name : '';
    for (const p of j.payments || [])
      out.push({ date: p.date || j.date, kind: 'in', amount: num(p.amount), account: accountOf(p.method), category: 'תשלום מלקוח', note: `${name}${p.method ? ' · ' + p.method : ''}`, href: '#job/' + j.id });
  }
  for (const p of S.purchases) {
    if (!num(p.amount)) continue;
    out.push({ date: p.date, kind: 'out', amount: num(p.amount), account: accountOf(p.method), category: 'חומרים' + (p.store ? ' · ' + p.store : ''), note: p.note || p.method || '', href: '#materials?m=' + monthKey(p.date) });
  }
  for (const m of S.money) if (m.ledger === 'biz') out.push({ ...m, href: '' });
  return out;
}
const personalEntries = () => S.money.filter(m => m.ledger === 'personal');

// סטטיסטיקות שעות ליום
function dayStats(date) {
  const jobs = S.jobs.filter(j => j.date === date && j.status !== 'lost');
  const trips = S.purchases.filter(p => p.date === date);
  const wd = S.workdays.find(w => w.date === date);
  const work = sum(jobs, durOf);
  const travel = sum(trips, tripMin);
  const starts = [...jobs.map(j => j.tStart), ...trips.map(t => t.leave), wd && wd.start].filter(Boolean).map(hm2min);
  const ends = [...jobs.map(j => j.tEnd), ...trips.map(t => t.back), wd && wd.end].filter(Boolean).map(hm2min);
  let shift = 0;
  if (wd && wd.minutes) shift = wd.minutes;
  else if (wd && wd.start && wd.end) shift = spanMin(wd.start, wd.end);
  else if (starts.length && ends.length) shift = Math.max(0, Math.max(...ends) - Math.min(...starts));
  const profit = sum(jobs.filter(j => j.status === 'closed'), profitOf);
  return { date, jobs, trips, wd, work, travel, shift, total: Math.max(shift, work + travel), profit, off: !!(wd && wd.off),
    start: starts.length ? min2hm(Math.min(...starts)) : '', end: ends.length ? min2hm(Math.max(...ends)) : '' };
}

// ---------- ניווט ----------
const routes = {};
const go = h => { location.hash = h; };
function goBack(fallback) { if (history.length > 1) history.back(); else go(fallback); }
const TAB_OF = { home: 'home', cal: 'cal', clients: 'clients', jobs: 'clients', client: 'clients', more: 'more' };
const NOTAB = new Set(['job', 'fill', 'caller', 'import', 'settings']);
let viewCleanup = null;
function render() {
  if (viewCleanup) { viewCleanup(); viewCleanup = null; }
  const [path, qs] = location.hash.slice(1).split('?');
  const [name, arg] = (path || 'home').split('/');
  const params = new URLSearchParams(qs || '');
  const known = !!routes[name];
  const view = routes[name] || routes.home;
  const tab = known ? (TAB_OF[name] || 'more') : 'home';
  $$('#tabbar [data-tab]').forEach(a => a.classList.toggle('active', a.dataset.tab === tab));
  document.body.classList.toggle('notab', NOTAB.has(name));
  const cleanup = view(arg, params);
  if (typeof cleanup === 'function') viewCleanup = cleanup;
  window.scrollTo(0, 0);
}
const app = html => { const el = $('#app'); el.innerHTML = html; el.style.animation = 'none'; void el.offsetWidth; el.style.animation = ''; return el; };

// גיליון תחתון
function sheet(html, mount) {
  const d = $('#dlg');
  d.innerHTML = `<div class="sheet"><div class="grab"></div>${html}</div>`;
  if (!d.open) d.showModal();
  if (mount) mount(d);
  return d;
}
const closeSheet = () => { const d = $('#dlg'); if (d.open) d.close(); };

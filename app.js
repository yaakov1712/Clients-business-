'use strict';

/* =========================================================
   העסק שלי – ניהול לקוחות, עבודות ותזרים. עובד גם בלי אינטרנט.
   כל הנתונים נשמרים במכשיר (IndexedDB).
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
const money = n => (n < 0 ? '-' : '') + '₪' + Math.round(Math.abs(n)).toLocaleString('he-IL');
const sum = (arr, f) => arr.reduce((s, x) => s + f(x), 0);
const pct = (a, b) => (b ? Math.round((a / b) * 100) : 0) + '%';

function normPhone(p) {
  let d = String(p || '').replace(/\D/g, '');
  if (d.startsWith('972')) d = '0' + d.slice(3);
  if (d.length === 9 && /^[5-9]/.test(d)) d = '0' + d;
  return d;
}
const waPhone = p => { const d = normPhone(p); return d.startsWith('0') ? '972' + d.slice(1) : d; };
const waLink = (p, text = '') => `https://wa.me/${waPhone(p)}${text ? '?text=' + encodeURIComponent(text) : ''}`;
const wazeLink = addr => `https://waze.com/ul?q=${encodeURIComponent(addr)}&navigate=yes`;

function toast(msg) {
  const t = $('#toast');
  t.textContent = msg; t.hidden = false;
  clearTimeout(toast.t); toast.t = setTimeout(() => (t.hidden = true), 2200);
}

function opts(arr, sel, empty) {
  const list = sel && !arr.includes(sel) ? [...arr, sel] : arr;
  return (empty !== undefined ? `<option value="">${esc(empty)}</option>` : '') +
    list.map(v => `<option ${v === sel ? 'selected' : ''}>${esc(v)}</option>`).join('');
}

// ---------- תאריכים: לועזי ועברי ----------
const pad = n => String(n).padStart(2, '0');
const ymd = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const parseYmd = s => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
const today = () => ymd(new Date());
const addDays = (s, n) => { const d = parseYmd(s); d.setDate(d.getDate() + n); return ymd(d); };
const DAYS = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת'];
const GMONTHS = ['ינואר', 'פברואר', 'מרץ', 'אפריל', 'מאי', 'יוני', 'יולי', 'אוגוסט', 'ספטמבר', 'אוקטובר', 'נובמבר', 'דצמבר'];
const fmtG = s => { const [y, m, d] = s.split('-'); return `${+d}/${+m}/${y}`; };
const fmtDM = s => { const [, m, d] = s.split('-'); return `${+d}/${+m}`; };

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
  if (!hebCache.has(s)) {
    const p = {};
    for (const x of hebFmt.formatToParts(parseYmd(s))) p[x.type] = x.value;
    hebCache.set(s, { day: +p.day, month: p.month, year: +p.year });
  }
  return hebCache.get(s);
}
const hebDate = s => { const p = hebParts(s); return `${gem(p.day)} ${p.month} ${gem(p.year % 1000)}`; };
const hebDM = s => { const p = hebParts(s); return `${gem(p.day)} ${p.month}`; };
const weekStart = s => { const d = parseYmd(s); d.setDate(d.getDate() - d.getDay()); return ymd(d); };

function periodOf(s, unit, heb) {
  if (unit === 'day') return { key: s, label: `יום ${DAYS[parseYmd(s).getDay()]} ${fmtG(s)}`, sub: hebDate(s) };
  if (unit === 'week') {
    const ws = weekStart(s), we = addDays(ws, 6);
    return heb
      ? { key: ws, label: `שבוע ${hebDM(ws)} – ${hebDM(we)}`, sub: `${fmtDM(ws)}–${fmtG(we)}` }
      : { key: ws, label: `שבוע ${fmtDM(ws)}–${fmtG(we)}`, sub: `${hebDM(ws)} – ${hebDM(we)}` };
  }
  if (unit === 'month') {
    if (heb) { const p = hebParts(s); return { key: p.year + '-' + p.month, label: `${p.month} ${gem(p.year % 1000)}`, sub: '' }; }
    const [y, m] = s.split('-');
    return { key: y + '-' + m, label: `${GMONTHS[+m - 1]} ${y}`, sub: '' };
  }
  if (heb) { const p = hebParts(s); return { key: '' + p.year, label: `שנת ${gem(p.year % 1000)}`, sub: '' }; }
  return { key: s.slice(0, 4), label: `שנת ${s.slice(0, 4)}`, sub: '' };
}

// ---------- אחסון (IndexedDB) ----------
const DEFAULTS = {
  sources: ['ווצאפ', 'המלצה', 'עיתון', 'פייסבוק', 'גוגל', 'שלט / מודעה', 'אחר'],
  nationalities: ['ישראלי', 'אמריקאי', 'אנגלי', 'חוצניק'],
  methods: ['מזומן', 'ביט', 'פייבוקס', 'העברה בנקאית', 'צ׳ק', 'אשראי'],
  bizOutCats: ['חומרים למלאי', 'כלי עבודה', 'דלק', 'רכב', 'טלפון', 'פרסום', 'ביטוח', 'מס הכנסה', 'ביטוח לאומי', 'מע״מ', 'רואה חשבון', 'אחר'],
  bizInCats: ['הכנסה אחרת', 'הפקדת בעלים', 'הלוואה', 'אחר'],
  personalOutCats: ['שכר דירה', 'אוכל וקניות', 'חשבונות', 'רכב', 'ביגוד', 'בילויים', 'חיסכון', 'צדקה / מעשר', 'אחר'],
  personalInCats: ['משיכה מהעסק', 'מתנה', 'אחר'],
  lostReasons: ['יקר מדי', 'לא הייתי זמין', 'לא ענה / נעלם', 'לא בתחום שלי', 'אחר'],
  city: 'ירושלים',
  opening: { bizCash: 0, bizBank: 0, personal: 0 },
  materialsAccount: 'bank',
  maaserPct: 10,
  hebrewDefault: false,
  lastBackup: 0,
};
const WITHDRAW = 'משיכה לפרטי';
const S = { clients: [], jobs: [], money: [], settings: null };
let db;

function openDB() {
  return new Promise((res, rej) => {
    const r = indexedDB.open('handyman-business', 1);
    r.onupgradeneeded = () => {
      for (const s of ['clients', 'jobs', 'money', 'meta'])
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
  for (const s of ['clients', 'jobs', 'money']) S[s] = await idb(s, 'readonly', os => os.getAll());
  const m = await idb('meta', 'readonly', os => os.get('settings'));
  S.settings = { ...structuredClone(DEFAULTS), ...(m ? m.value : {}) };
}
async function save(store, obj) {
  obj.updatedAt = Date.now();
  if (!obj.createdAt) obj.createdAt = obj.updatedAt;
  const arr = S[store], i = arr.findIndex(x => x.id === obj.id);
  if (i >= 0) arr[i] = obj; else arr.push(obj);
  await idb(store, 'readwrite', os => os.put(obj));
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
const saveSettings = () => idb('meta', 'readwrite', os => os.put({ id: 'settings', value: S.settings }));

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
function payTag(j) {
  const s = payState(j);
  if (s === 'paid') return '<span class="tag good">שולם</span>';
  if (s === 'partial') return `<span class="tag warn">חלקי · חסר ${money(dueOf(j))}</span>`;
  if (s === 'unpaid') return '<span class="tag bad">לא שולם</span>';
  return '';
}
function statusTag(j) {
  if (j.status === 'open') return '<span class="tag warn">בבירור</span>';
  if (j.status === 'lost') return '<span class="tag gray">לא נסגר</span>';
  return '';
}
const accountOf = method => (method === 'מזומן' ? 'cash' : 'bank');

// לקוח חדש/חוזר: חוזר = כבר הייתה לו עבודה שנסגרה לפני כן
function clientTypes() {
  const m = new Map(), seen = new Set();
  const sorted = [...S.jobs].sort((a, b) => a.date.localeCompare(b.date) || (a.createdAt || 0) - (b.createdAt || 0));
  for (const j of sorted) {
    m.set(j.id, j.ctype || (seen.has(j.clientId) ? 'returning' : 'new'));
    if (j.status === 'closed') seen.add(j.clientId);
  }
  return m;
}
function clientStats(id) {
  const jobs = S.jobs.filter(j => j.clientId === id).sort((a, b) => b.date.localeCompare(a.date));
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

// כל תנועות העסק: ידניות + אוטומטיות מתוך העבודות (תשלומים וחומרים)
function bizEntries() {
  const out = [];
  for (const j of S.jobs) {
    if (j.status !== 'closed') continue;
    const c = clientById(j.clientId), name = c ? c.name : '';
    for (const p of j.payments || [])
      out.push({ date: p.date || j.date, kind: 'in', amount: num(p.amount), account: accountOf(p.method), category: 'תשלום מלקוח', note: `${name} · ${p.method || ''}`, href: '#job/' + j.id });
    const cost = num(j.materials) + num(j.extra);
    if (cost > 0)
      out.push({ date: j.date, kind: 'out', amount: cost, account: S.settings.materialsAccount, category: 'חומרים לעבודה', note: `${name} · ${j.description || ''}`, href: '#job/' + j.id });
  }
  for (const m of S.money) if (m.ledger === 'biz') out.push({ ...m, href: '' });
  return out;
}
const personalEntries = () => S.money.filter(m => m.ledger === 'personal');

// ---------- ניווט ----------
const routes = {};
function go(h) { location.hash = h; }
function goBack(fallback) { if (history.length > 1) history.back(); else go(fallback); }
function render() {
  const [path, qs] = location.hash.slice(1).split('?');
  const [name, arg] = (path || 'home').split('/');
  const params = new URLSearchParams(qs || '');
  const view = routes[name] || routes.home;
  $$('[data-nav]').forEach(a => a.classList.toggle('active', a.dataset.nav === (routes[name] ? name : 'home')));
  $('.fab').hidden = ['job', 'import', 'more'].includes(name);
  view(arg, params);
  window.scrollTo(0, 0);
}
const app = html => { $('#app').innerHTML = html; return $('#app'); };

// ---------- רכיבי תצוגה ----------
function jobItem(j, opt = {}) {
  const c = clientById(j.clientId);
  const right = j.status === 'closed'
    ? `<div>${money(num(j.price))}</div><div class="small muted">רווח ${money(profitOf(j))}</div>`
    : `<div class="small muted">${j.price ? 'הצעה ' + money(num(j.price)) : ''}</div>`;
  return `<li><a class="item" href="#job/${j.id}">
    <div class="main">
      <div class="title">${esc(c ? c.name : '—')} ${statusTag(j)} ${payTag(j)}</div>
      <div class="sub">${opt.noDate ? '' : fmtDM(j.date) + ' · '}${esc(j.description || '')}${c && c.address ? ' · ' + esc(c.address) : ''}</div>
    </div>
    <div class="side">${right}</div>
  </a></li>`;
}
function kpi(label, value, cls = '') { return `<div class="kpi ${cls}"><div class="v">${value}</div><div class="l">${label}</div></div>`; }

function summarize(jobs) {
  const closed = jobs.filter(j => j.status === 'closed');
  return {
    leads: jobs.length, closed: closed.length,
    revenue: sum(closed, j => num(j.price)), materials: sum(closed, j => num(j.materials) + num(j.extra)),
    profit: sum(closed, profitOf), due: sum(closed, dueOf),
  };
}

// ---------- מסך בית ----------
routes.home = () => {
  const t = today(), ws = weekStart(t), mon = t.slice(0, 7), hp = hebParts(t);
  const hebMonthKey = hp.year + '-' + hp.month;
  const block = (title, jobs) => {
    const s = summarize(jobs);
    return `<div class="card"><div class="period-title"><b>${title}</b><span class="small muted">${s.leads} פניות · ${s.closed} נסגרו</span></div>
      <div class="grid3">${kpi('רווח גולמי', money(s.profit), 'good')}${kpi('הכנסות', money(s.revenue))}${kpi('חומרים', money(s.materials))}</div></div>`;
  };
  const open = S.jobs.filter(j => j.status === 'open').sort((a, b) => b.date.localeCompare(a.date));
  const debts = S.jobs.filter(j => dueOf(j) > 0);
  const recent = [...S.jobs].sort((a, b) => b.date.localeCompare(a.date) || b.createdAt - a.createdAt).slice(0, 6);
  const daysSinceBackup = S.settings.lastBackup ? Math.floor((Date.now() - S.settings.lastBackup) / 864e5) : null;
  app(`
    <h2>שלום! <span class="muted small">${DAYS[new Date().getDay()]} · ${fmtG(t)} · ${hebDate(t)}</span></h2>
    <div class="grid2" style="margin-bottom:12px">
      <a class="btn big primary" href="#job/new?status=open">📞 פנייה חדשה</a>
      <a class="btn big" href="#job/new">✅ עבודה שבוצעה</a>
    </div>
    ${debts.length ? `<a class="alert bad" href="#debts">💸 ${debts.length} עבודות לא שולמו במלואן · חוב פתוח ${money(sum(debts, dueOf))}</a>` : ''}
    ${S.jobs.length && (daysSinceBackup === null || daysSinceBackup > 7) ? `<a class="alert" href="#more">💾 לא נעשה גיבוי ${daysSinceBackup === null ? 'אף פעם' : daysSinceBackup + ' ימים'} – מומלץ לגבות עכשיו</a>` : ''}
    ${block('היום', S.jobs.filter(j => j.date === t))}
    ${block('השבוע', S.jobs.filter(j => j.date >= ws && j.date <= t))}
    ${block(`חודש ${GMONTHS[+mon.slice(5) - 1]}`, S.jobs.filter(j => j.date.startsWith(mon)))}
    ${block(`חודש ${hp.month}`, S.jobs.filter(j => { const p = hebParts(j.date); return p.year + '-' + p.month === hebMonthKey; }))}
    ${open.length ? `<div class="card"><b>פניות בבירור (${open.length})</b><ul class="list">${open.slice(0, 8).map(j => jobItem(j)).join('')}</ul>
      ${open.length > 8 ? '<a href="#jobs?f=open">לכל הפניות ←</a>' : ''}</div>` : ''}
    <div class="card"><b>אחרונות</b>${recent.length ? `<ul class="list">${recent.map(j => jobItem(j)).join('')}</ul>` :
      '<p class="muted">עוד אין נתונים. לחץ על ＋ כדי להוסיף עבודה, או <a href="#import">ייבא מגוגל שיטס</a>.</p>'}</div>
  `);
};

// ---------- רשימת עבודות ----------
routes.jobs = (_, p) => {
  const f = p.get('f') || 'all', q = (p.get('q') || '').trim().toLowerCase();
  const filters = { all: 'הכל', closed: 'נסגרו', open: 'בבירור', lost: 'לא נסגרו', unpaid: 'לא שולם' };
  let jobs = S.jobs.filter(j =>
    f === 'all' ? true : f === 'unpaid' ? dueOf(j) > 0 : j.status === f);
  if (q) jobs = jobs.filter(j => {
    const c = clientById(j.clientId) || {};
    return [c.name, c.phone, c.address, j.description, j.notes].some(v => String(v || '').toLowerCase().includes(q));
  });
  jobs.sort((a, b) => b.date.localeCompare(a.date) || b.createdAt - a.createdAt);
  const shown = jobs.slice(0, 300);
  let html = '', day = '';
  for (const j of shown) {
    if (j.date !== day) {
      day = j.date;
      const dj = jobs.filter(x => x.date === day && x.status === 'closed');
      html += `<li class="day-head"><span>${DAYS[parseYmd(day).getDay()]} ${fmtG(day)} · ${hebDM(day)}</span><span>${dj.length ? 'רווח ' + money(sum(dj, profitOf)) : ''}</span></li>`;
    }
    html += jobItem(j, { noDate: true });
  }
  const el = app(`
    <h2>עבודות ופניות</h2>
    <div class="chips">${Object.entries(filters).map(([k, v]) => `<a class="chip ${k === f ? 'on' : ''}" href="#jobs?f=${k}">${v}</a>`).join('')}</div>
    <input class="search" type="search" placeholder="חיפוש לפי שם, טלפון, כתובת, עבודה…" value="${esc(p.get('q') || '')}">
    <div class="card">${shown.length ? `<ul class="list">${html}</ul>` : '<p class="muted">אין תוצאות</p>'}
    ${jobs.length > shown.length ? `<p class="muted small">מוצגות 300 מתוך ${jobs.length} – השתמש בחיפוש</p>` : ''}</div>`);
  const s = $('.search', el);
  s.addEventListener('change', () => go(`#jobs?f=${f}&q=${encodeURIComponent(s.value)}`));
};

// ---------- טופס פנייה / עבודה ----------
routes.job = (id, p) => {
  const isNew = !id || id === 'new';
  const orig = isNew ? null : S.jobs.find(x => x.id === id);
  if (!isNew && !orig) return app('<p>העבודה לא נמצאה</p>');
  const j = isNew
    ? { id: uid(), date: today(), status: p.get('status') || 'closed', payments: [] }
    : structuredClone(orig);
  let selected = j.clientId ? clientById(j.clientId) : p.get('client') ? clientById(p.get('client')) : null;
  const st = S.settings;
  const pays = (j.payments || []).map(x => ({ ...x }));
  const descs = [...new Set(S.jobs.map(x => x.description).filter(Boolean))].slice(-200);
  const addrs = [...new Set(S.clients.map(x => x.address).filter(Boolean))];

  const el = app(`
    <h2>${isNew ? (j.status === 'open' ? 'פנייה חדשה' : 'עבודה חדשה') : 'עריכת עבודה / פנייה'}</h2>
    <form id="jf" class="card form" data-status="${j.status}" autocomplete="off">
      <div class="row2">
        <label>תאריך<input type="date" name="date" value="${j.date}" required></label>
        <label>סטטוס<select name="status">${Object.entries(STATUS).map(([k, v]) => `<option value="${k}" ${k === j.status ? 'selected' : ''}>${v}</option>`).join('')}</select></label>
      </div>
      <div class="small muted" id="hebd" style="margin:-6px 0 10px">${hebDate(j.date)}</div>

      <h3>👤 לקוח</h3>
      <div id="cbadge"></div>
      <div class="ac-wrap">
        <label>שם הלקוח (התחל להקליד – יקפוץ מהזיכרון)<input name="cname" value="${esc(p.get('name') || '')}"></label>
        <div class="ac-list" hidden></div>
      </div>
      <label>טלפון<input name="phone" type="tel" inputmode="tel" value="${esc(p.get('phone') || '')}"></label>
      <div id="phone-hint"></div>
      <label>כתובת<input name="address" list="dl-addr" placeholder="רחוב ומספר, ${esc(st.city)}"></label>
      <datalist id="dl-addr">${addrs.map(a => `<option value="${esc(a)}">`).join('')}</datalist>
      <div class="row2">
        <label>מוצא<select name="nationality">${opts(st.nationalities, '', '—')}</select></label>
        <label>מאיפה הגיע<select name="source">${opts(st.sources, j.source || '', '—')}</select></label>
      </div>
      <label class="ref-only">מי המליץ?<input name="referredBy" list="dl-clients" value="${esc(j.referredBy || '')}"></label>
      <datalist id="dl-clients">${S.clients.map(c => `<option value="${esc(c.name)}">`).join('')}</datalist>
      <label>לקוח חדש / חוזר
        <select name="ctype"><option value="">אוטומטי</option><option value="new" ${j.ctype === 'new' ? 'selected' : ''}>חדש</option><option value="returning" ${j.ctype === 'returning' ? 'selected' : ''}>חוזר</option></select>
      </label>

      <h3>🔧 העבודה</h3>
      <label>מה עשיתי / מה צריך לעשות<input name="description" list="dl-desc" value="${esc(j.description || '')}"></label>
      <datalist id="dl-desc">${descs.map(d => `<option value="${esc(d)}">`).join('')}</datalist>
      <div class="row3">
        <label>כמה גביתי<input name="price" inputmode="decimal" value="${j.price || ''}"></label>
        <label>חומרים<input name="materials" inputmode="decimal" value="${j.materials || ''}"></label>
        <label>הוצאות נוספות<input name="extra" inputmode="decimal" value="${j.extra || ''}"></label>
      </div>
      <div class="profit-box closed-only">רווח גולמי: <b id="profit"></b></div>

      <div class="closed-only">
        <h3>💳 תשלום</h3>
        <div id="payrows"></div>
        <div class="btns">
          <button type="button" class="sm primary" id="full-pay">שולם במלואו ✓</button>
          <button type="button" class="sm" id="add-pay">+ תשלום חלקי</button>
        </div>
        <p id="paystate" class="small"></p>
      </div>
      <div class="lost-only"><label>למה לא נסגר?<select name="lostReason">${opts(st.lostReasons, j.lostReason || '', '—')}</select></label></div>

      <label>הערות<textarea name="notes">${esc(j.notes || '')}</textarea></label>
      <div class="btns end">
        ${isNew ? '' : '<button type="button" class="danger" id="del">מחק</button>'}
        <button type="button" onclick="history.back()">ביטול</button>
        <button class="primary">שמור</button>
      </div>
    </form>`);

  const f = $('#jf', el), E = f.elements;
  const acList = $('.ac-list', el);

  function fillClient(c) {
    selected = c;
    E.cname.value = c.name || '';
    E.phone.value = c.phone || '';
    E.address.value = c.address || '';
    E.nationality.innerHTML = opts(st.nationalities, c.nationality || '', '—');
    if (!j.source || isNew) E.source.innerHTML = opts(st.sources, c.origin || '', '—');
    if (c.referredBy && !E.referredBy.value) E.referredBy.value = c.referredBy;
    refreshBadge(); syncRef();
  }
  function refreshBadge() {
    const box = $('#cbadge', el);
    if (!selected) {
      box.innerHTML = E.cname.value || E.phone.value ? '<div class="badge-box new">🆕 לקוח חדש – יישמר ברשימת הלקוחות</div>' : '';
      return;
    }
    const s = clientStats(selected.id);
    const prev = s.jobs.filter(x => x.id !== j.id);
    box.innerHTML = `<div class="badge-box">🔁 <b>${prev.length ? 'לקוח חוזר' : 'לקוח קיים'}</b> · ${prev.length} פניות קודמות · סה״כ ${money(s.revenue)}
      ${s.due > 0 ? `<br><b style="color:var(--bad)">⚠️ חוב פתוח: ${money(s.due)}</b>` : ''}
      ${selected.notes ? `<br><span class="small">📝 ${esc(selected.notes)}</span>` : ''}
      <br><button type="button" class="sm" id="unlink">✕ זה לקוח אחר</button></div>`;
    $('#unlink', box).onclick = () => { selected = null; E.cname.value = ''; E.phone.value = ''; E.address.value = ''; refreshBadge(); E.cname.focus(); };
  }
  function showAC() {
    const q = E.cname.value.trim().toLowerCase();
    if (!q || (selected && selected.name.toLowerCase() === q)) { acList.hidden = true; return; }
    const nq = normPhone(q);
    const res = S.clients.filter(c =>
      (c.name || '').toLowerCase().includes(q) || (nq.length >= 3 && normPhone(c.phone).includes(nq)) ||
      (c.address || '').toLowerCase().includes(q)).slice(0, 8);
    acList.innerHTML = res.map(c => `<div data-id="${c.id}"><b>${esc(c.name)}</b> <span class="small muted">${esc(c.phone || '')} · ${esc(c.address || '')} ${c.nationality ? '· ' + esc(c.nationality) : ''}</span></div>`).join('');
    acList.hidden = !res.length;
  }
  E.cname.addEventListener('input', () => { showAC(); refreshBadge(); });
  E.cname.addEventListener('focus', showAC);
  E.cname.addEventListener('blur', () => setTimeout(() => (acList.hidden = true), 150));
  acList.addEventListener('pointerdown', e => {
    const it = e.target.closest('[data-id]');
    if (it) { e.preventDefault(); fillClient(clientById(it.dataset.id)); acList.hidden = true; }
  });
  E.phone.addEventListener('input', () => {
    const hint = $('#phone-hint', el);
    const m = findByPhone(E.phone.value).filter(c => !selected || c.id !== selected.id);
    hint.innerHTML = m.length ? `<div class="alert">המספר הזה שייך ל<b>${esc(m[0].name)}</b> <button type="button" class="sm" id="pick">זה הוא – מלא פרטים</button></div>` : '';
    if (m.length) $('#pick', hint).onclick = () => { fillClient(m[0]); hint.innerHTML = ''; };
    refreshBadge();
  });

  const syncRef = () => f.toggleAttribute('data-source-ref', E.source.value === 'המלצה');
  E.source.addEventListener('change', syncRef);
  E.status.addEventListener('change', () => { f.dataset.status = E.status.value; });
  E.date.addEventListener('change', () => { if (E.date.value) $('#hebd', el).textContent = hebDate(E.date.value); });

  function calc() {
    const pr = num(E.price.value);
    $('#profit', el).textContent = money(pr - num(E.materials.value) - num(E.extra.value));
    const paid = sum(pays, x => num(x.amount));
    $('#paystate', el).innerHTML = pr <= 0 ? '' : paid >= pr ? '<span class="tag good">שולם במלואו</span>'
      : paid > 0 ? `<span class="tag warn">שולם ${money(paid)} · נשאר ${money(pr - paid)}</span>` : '<span class="tag bad">עוד לא שולם</span>';
  }
  function renderPays() {
    $('#payrows', el).innerHTML = pays.map((x, i) => `<div class="payrow" data-i="${i}">
      <input type="date" data-k="date" value="${x.date}"><input data-k="amount" inputmode="decimal" value="${x.amount}" placeholder="סכום">
      <select data-k="method">${opts(st.methods, x.method)}</select><button type="button" class="sm" data-del>✕</button></div>`).join('');
    calc();
  }
  $('#payrows', el).addEventListener('input', e => {
    const row = e.target.closest('[data-i]'); if (!row || !e.target.dataset.k) return;
    pays[row.dataset.i][e.target.dataset.k] = e.target.value; calc();
  });
  $('#payrows', el).addEventListener('click', e => {
    if (e.target.matches('[data-del]')) { pays.splice(e.target.closest('[data-i]').dataset.i, 1); renderPays(); }
  });
  const remaining = () => Math.max(0, num(E.price.value) - sum(pays, x => num(x.amount)));
  $('#full-pay', el).onclick = () => {
    if (num(E.price.value) <= 0) return toast('קודם תרשום כמה גבית');
    if (remaining() > 0) pays.push({ date: E.date.value || today(), amount: remaining(), method: st.methods[0] });
    renderPays();
  };
  $('#add-pay', el).onclick = () => { pays.push({ date: today(), amount: '', method: st.methods[0] }); renderPays(); };
  ['price', 'materials', 'extra'].forEach(k => E[k].addEventListener('input', calc));

  if (selected) fillClient(selected);
  if (!selected && p.get('phone')) E.phone.dispatchEvent(new Event('input'));
  if (!isNew && j.source) E.source.innerHTML = opts(st.sources, j.source, '—');
  syncRef(); renderPays(); refreshBadge();

  if (!isNew) $('#del', el).onclick = async () => {
    if (!confirm('למחוק את העבודה/פנייה?')) return;
    await remove('jobs', j.id); toast('נמחק'); goBack('#jobs');
  };

  f.addEventListener('submit', async e => {
    e.preventDefault();
    const name = E.cname.value.trim(), phone = E.phone.value.trim();
    if (!name && !phone) return toast('צריך לפחות שם או טלפון');
    let c = selected ? { ...selected } : null;
    if (!c) {
      const ex = findByPhone(phone)[0] || (name && S.clients.find(x => x.name.trim().toLowerCase() === name.toLowerCase() && !normPhone(phone)));
      if (ex && confirm(`כבר קיים לקוח "${ex.name}" ${ex.phone ? '(' + ex.phone + ')' : ''}. לשייך אליו?`)) c = { ...ex };
    }
    if (!c) c = { id: uid(), origin: E.source.value, referredBy: E.referredBy.value.trim() };
    Object.assign(c, { name: name || phone, phone, address: E.address.value.trim(), nationality: E.nationality.value });
    if (!c.origin) c.origin = E.source.value;
    if (!c.referredBy && E.source.value === 'המלצה') c.referredBy = E.referredBy.value.trim();
    await save('clients', c);
    Object.assign(j, {
      date: E.date.value, status: E.status.value, clientId: c.id, source: E.source.value,
      referredBy: E.source.value === 'המלצה' ? E.referredBy.value.trim() : '', ctype: E.ctype.value,
      description: E.description.value.trim(), price: num(E.price.value), materials: num(E.materials.value), extra: num(E.extra.value),
      lostReason: E.status.value === 'lost' ? E.lostReason.value : '', notes: E.notes.value.trim(),
      payments: pays.filter(x => num(x.amount) > 0).map(x => ({ date: x.date || E.date.value, amount: num(x.amount), method: x.method })),
    });
    await save('jobs', j);
    toast('נשמר ✓');
    goBack('#jobs');
  });
};

// ---------- לקוחות ----------
routes.clients = (_, p) => {
  const q = (p.get('q') || '').trim().toLowerCase();
  const stats = new Map(S.clients.map(c => [c.id, clientStats(c.id)]));
  let list = S.clients.filter(c => !q || [c.name, c.phone, c.address, c.nationality, c.origin].some(v => String(v || '').toLowerCase().includes(q)) || (normPhone(q).length >= 3 && normPhone(c.phone).includes(normPhone(q))));
  list.sort((a, b) => (stats.get(b.id).last || '').localeCompare(stats.get(a.id).last || ''));
  const el = app(`
    <h2>לקוחות <span class="muted small">(${S.clients.length})</span></h2>
    <div class="btns" style="margin:0 0 10px"><a class="btn sm" href="#client/new">+ לקוח חדש</a><a class="btn sm" href="#debts">💸 חובות</a></div>
    <input class="search" type="search" placeholder="חיפוש שם / טלפון / כתובת / מוצא…" value="${esc(p.get('q') || '')}">
    <div class="card"><ul class="list">${list.slice(0, 300).map(c => {
      const s = stats.get(c.id);
      return `<li><a class="item" href="#client/${c.id}"><div class="main">
        <div class="title">${esc(c.name)} ${c.nationality ? `<span class="tag gray">${esc(c.nationality)}</span>` : ''}</div>
        <div class="sub">${esc(c.phone || '')} · ${esc(c.address || '')}</div></div>
        <div class="side"><div class="small">${s.closed} עבודות</div>${s.due > 0 ? `<div class="small amount-out">חוב ${money(s.due)}</div>` : `<div class="small muted">${money(s.revenue)}</div>`}</div>
      </a></li>`;
    }).join('') || '<li class="muted">אין לקוחות</li>'}</ul></div>`);
  const s = $('.search', el);
  s.addEventListener('change', () => go('#clients?q=' + encodeURIComponent(s.value)));
};

function clientForm(c) {
  const st = S.settings;
  return `<form id="cf" class="form">
    <label>שם<input name="cname" value="${esc(c.name || '')}" required></label>
    <div class="row2"><label>טלפון<input name="phone" type="tel" value="${esc(c.phone || '')}"></label>
    <label>טלפון נוסף<input name="phone2" type="tel" value="${esc(c.phone2 || '')}"></label></div>
    <label>כתובת<input name="address" value="${esc(c.address || '')}"></label>
    <div class="row2"><label>מוצא<select name="nationality">${opts(st.nationalities, c.nationality || '', '—')}</select></label>
    <label>מאיפה הגיע<select name="origin">${opts(st.sources, c.origin || '', '—')}</select></label></div>
    <label>מי המליץ (אם המלצה)<input name="referredBy" value="${esc(c.referredBy || '')}"></label>
    <label>הערות (קוד בניין, קומה, איך לדבר איתו…)<textarea name="notes">${esc(c.notes || '')}</textarea></label>
    <div class="btns end"><button class="primary">שמור לקוח</button></div>
  </form>`;
}
function bindClientForm(el, c, after) {
  $('#cf', el).addEventListener('submit', async e => {
    e.preventDefault();
    const E = e.target.elements;
    Object.assign(c, {
      name: E.cname.value.trim(), phone: E.phone.value.trim(), phone2: E.phone2.value.trim(), address: E.address.value.trim(),
      nationality: E.nationality.value, origin: E.origin.value, referredBy: E.referredBy.value.trim(), notes: E.notes.value.trim(),
    });
    await save('clients', c); toast('הלקוח נשמר ✓'); after(c);
  });
}

routes.client = id => {
  if (!id || id === 'new') {
    const c = { id: uid() };
    const el = app(`<h2>לקוח חדש</h2><div class="card">${clientForm(c)}</div>`);
    return bindClientForm(el, c, c2 => go('#client/' + c2.id));
  }
  const c = clientById(id);
  if (!c) return app('<p>הלקוח לא נמצא</p>');
  const s = clientStats(id);
  const debtMsg = `שלום ${c.name}, תזכורת ידידותית לגבי תשלום על העבודה – יתרה לתשלום ${money(s.due)}. תודה!`;
  const el = app(`
    <h2>${esc(c.name)} ${c.nationality ? `<span class="tag gray">${esc(c.nationality)}</span>` : ''}</h2>
    <div class="card">
      <div>📞 <a href="tel:${esc(c.phone)}" class="ltr">${esc(c.phone || '—')}</a>${c.phone2 ? ` · <a href="tel:${esc(c.phone2)}" class="ltr">${esc(c.phone2)}</a>` : ''}</div>
      <div>📍 ${esc(c.address || '—')}</div>
      <div class="small muted">הגיע דרך: ${esc(c.origin || '—')}${c.referredBy ? ` (המליץ: ${esc(c.referredBy)})` : ''}</div>
      ${c.notes ? `<div class="small">📝 ${esc(c.notes)}</div>` : ''}
      <div class="btns">
        ${c.phone ? `<a class="btn sm" href="tel:${esc(c.phone)}">📞 חייג</a><a class="btn sm" href="${waLink(c.phone)}" target="_blank">💬 ווצאפ</a>` : ''}
        ${c.address ? `<a class="btn sm" href="${wazeLink(c.address + ' ' + S.settings.city)}" target="_blank">🚗 ווייז</a>` : ''}
        ${s.due > 0 && c.phone ? `<a class="btn sm danger" href="${waLink(c.phone, debtMsg)}" target="_blank">💸 תזכורת תשלום</a>` : ''}
      </div>
    </div>
    <div class="grid3" style="margin-bottom:12px">${kpi('פניות', s.count)}${kpi('עבודות', s.closed)}${kpi('רווח גולמי', money(s.profit), 'good')}
      ${kpi('סה״כ גבייה', money(s.revenue))}${kpi('חוב פתוח', money(s.due), s.due > 0 ? 'bad' : '')}${kpi('אחרון', s.last ? fmtG(s.last) : '—')}</div>
    <div class="btns" style="margin-bottom:12px"><a class="btn primary" href="#job/new?client=${c.id}">+ עבודה ללקוח</a><a class="btn" href="#job/new?client=${c.id}&status=open">+ פנייה</a></div>
    <div class="card"><b>היסטוריה</b><ul class="list">${s.jobs.map(j => jobItem(j)).join('') || '<li class="muted">אין עדיין</li>'}</ul></div>
    <details class="card"><summary>✏️ עריכת פרטי לקוח</summary>${clientForm(c)}
      <div class="btns"><button class="danger sm" id="delc">מחק לקוח</button></div></details>
  `);
  bindClientForm(el, { ...c }, () => routes.client(id));
  $('#delc', el).onclick = async () => {
    if (!confirm(s.count ? `ללקוח יש ${s.count} עבודות/פניות – הן יימחקו גם. למחוק?` : 'למחוק את הלקוח?')) return;
    for (const j of s.jobs) await remove('jobs', j.id);
    await remove('clients', c.id); toast('נמחק'); go('#clients');
  };
};

// ---------- חובות ----------
routes.debts = () => {
  const list = S.jobs.filter(j => dueOf(j) > 0).sort((a, b) => a.date.localeCompare(b.date));
  const el = app(`
    <h2>מי עוד לא שילם <span class="muted small">סה״כ ${money(sum(list, dueOf))}</span></h2>
    <div class="card"><ul class="list">${list.map(j => {
      const c = clientById(j.clientId) || {};
      const days = Math.floor((Date.now() - parseYmd(j.date)) / 864e5);
      const msg = `שלום ${c.name || ''}, תזכורת ידידותית לגבי התשלום על ${j.description || 'העבודה'} מתאריך ${fmtG(j.date)} – יתרה ${money(dueOf(j))}. תודה רבה!`;
      return `<li><div class="item"><a class="main" href="#job/${j.id}">
          <div class="title">${esc(c.name || '—')} <span class="tag ${days > 30 ? 'bad' : 'warn'}">לפני ${days} ימים</span></div>
          <div class="sub">${fmtG(j.date)} · ${esc(j.description || '')}</div></a>
        <div class="side"><div class="amount-out">${money(dueOf(j))}</div></div></div>
        <div class="btns" style="margin:0 0 10px">
          ${c.phone ? `<a class="btn sm" href="${waLink(c.phone, msg)}" target="_blank">💬 תזכורת בווצאפ</a>` : ''}
          <select class="sm" data-pay="${j.id}" style="padding:5px;border-radius:10px"><option value="">✓ התקבל תשלום ב…</option>${opts(S.settings.methods)}</select>
        </div></li>`;
    }).join('') || '<li class="muted">אין חובות פתוחים 🎉</li>'}</ul></div>`);
  $$('[data-pay]', el).forEach(sel => sel.addEventListener('change', async () => {
    if (!sel.value) return;
    const j = S.jobs.find(x => x.id === sel.dataset.pay);
    j.payments = [...(j.payments || []), { date: today(), amount: dueOf(j), method: sel.value }];
    await save('jobs', j); toast('סומן כשולם ✓'); routes.debts();
  }));
};

// ---------- שיחה נכנסת / זיהוי מתקשר ----------
routes.caller = (_, p) => {
  const phone = p.get('phone') || '';
  const np = normPhone(phone);
  let matches = findByPhone(phone);
  let partial = [];
  if (!matches.length && np.length >= 7) partial = S.clients.filter(c => normPhone(c.phone).endsWith(np.slice(-7)));
  const card = c => {
    const s = clientStats(c.id);
    return `<div class="card">
      <div class="badge-box">🔁 <b>לקוח מוכר: ${esc(c.name)}</b> ${c.nationality ? `<span class="tag gray">${esc(c.nationality)}</span>` : ''}</div>
      <div>📍 ${esc(c.address || '—')}</div>
      <div class="small muted">הגיע דרך ${esc(c.origin || '—')} · ${s.count} פניות · ${s.closed} עבודות · סה״כ ${money(s.revenue)}</div>
      ${s.due > 0 ? `<div class="alert bad">⚠️ חייב לך ${money(s.due)}</div>` : ''}
      ${c.notes ? `<div class="small">📝 ${esc(c.notes)}</div>` : ''}
      ${s.jobs.length ? `<ul class="list">${s.jobs.slice(0, 3).map(j => jobItem(j)).join('')}</ul>` : ''}
      <div class="btns"><a class="btn primary" href="#job/new?client=${c.id}&status=open">📝 רשום פנייה</a>
        <a class="btn" href="#job/new?client=${c.id}">✅ עבודה שנסגרה</a><a class="btn" href="#client/${c.id}">כרטיס לקוח</a></div>
    </div>`;
  };
  const el = app(`
    <h2>📞 מי מתקשר?</h2>
    <form id="lk" class="card form"><label>מספר טלפון<input name="phone" type="tel" inputmode="tel" value="${esc(phone)}" placeholder="050-0000000"></label>
      <button class="primary">בדוק</button></form>
    ${!np ? '<p class="muted small">אפשר לחבר את זה לשיחות נכנסות אוטומטית – ראה <a href="#more">הגדרות ← חיבור לשיחות טלפון</a>.</p>' : ''}
    ${matches.map(card).join('')}
    ${np && !matches.length ? `
      <div class="card"><div class="badge-box new">🆕 <b>מספר לא מוכר – כנראה לקוח חדש</b></div>
        ${partial.length ? `<p class="small">אולי זה: ${partial.map(c => `<a href="#client/${c.id}">${esc(c.name)}</a>`).join(', ')}</p>` : ''}
        <b>שאלות לבירור:</b>
        <ol class="steps"><li>מה השם?</li><li>מה הכתובת (רחוב, מספר, קומה)?</li><li>מה צריך לעשות? יש תמונה בווצאפ?</li>
          <li><b>מאיפה שמעת עליי?</b> (ווצאפ / המלצה – ממי? / עיתון / אחר)</li><li>מתי נוח? דחוף?</li></ol>
        <div class="btns"><a class="btn primary" href="#job/new?status=open&phone=${encodeURIComponent(phone)}">📝 רשום פנייה חדשה</a>
          <a class="btn" href="${waLink(phone)}" target="_blank">💬 ווצאפ</a></div>
      </div>` : ''}
  `);
  $('#lk', el).addEventListener('submit', e => { e.preventDefault(); go('#caller?phone=' + encodeURIComponent(e.target.elements.phone.value)); });
};

// ---------- סיכומים (יומי/שבועי/חודשי/שנתי, לועזי/עברי) ----------
routes.reports = (_, p) => {
  const unit = p.get('u') || 'month';
  const heb = (p.get('cal') || (S.settings.hebrewDefault ? 'h' : 'g')) === 'h';
  const ct = clientTypes();
  const groups = new Map();
  const grp = date => {
    const k = periodOf(date, unit, heb);
    let g = groups.get(k.key);
    if (!g) groups.set(k.key, g = { ...k, jobs: [], collected: 0, exp: 0, expCats: {}, maaserGiven: 0, max: date });
    if (date > g.max) g.max = date;
    return g;
  };
  for (const j of S.jobs) {
    grp(j.date).jobs.push(j);
    if (j.status === 'closed') for (const x of j.payments || []) grp(x.date || j.date).collected += num(x.amount);
  }
  for (const m of S.money) {
    if (m.ledger === 'biz' && m.kind === 'out' && m.category !== WITHDRAW) {
      const g = grp(m.date); g.exp += num(m.amount); g.expCats[m.category] = (g.expCats[m.category] || 0) + num(m.amount);
    }
    if (m.ledger === 'personal' && m.kind === 'out' && /מעשר|צדקה/.test(m.category || '')) grp(m.date).maaserGiven += num(m.amount);
  }
  const list = [...groups.values()].sort((a, b) => b.max.localeCompare(a.max));
  const limit = +(p.get('n') || 30);
  const units = { day: 'יומי', week: 'שבועי', month: 'חודשי', year: 'שנתי' };
  const link = (u, c, n) => `#reports?u=${u}&cal=${c}${n ? '&n=' + n : ''}`;

  const breakdown = (jobs, keyFn) => {
    const t = {};
    for (const j of jobs) {
      const k = keyFn(j) || 'לא צוין';
      t[k] = t[k] || { leads: 0, closed: 0, profit: 0 };
      t[k].leads++;
      if (j.status === 'closed') { t[k].closed++; t[k].profit += profitOf(j); }
    }
    return `<div class="scroll-x"><table class="mini"><tr><th></th><th class="n">פניות</th><th class="n">נסגרו</th><th class="n">רווח</th></tr>
      ${Object.entries(t).sort((a, b) => b[1].leads - a[1].leads).map(([k, v]) => `<tr><td>${esc(k)}</td><td class="n">${v.leads}</td><td class="n">${v.closed} (${pct(v.closed, v.leads)})</td><td class="n">${money(v.profit)}</td></tr>`).join('')}
    </table></div>`;
  };

  const cards = list.slice(0, limit).map(g => {
    const s = summarize(g.jobs);
    const closed = g.jobs.filter(j => j.status === 'closed');
    const nNew = closed.filter(j => ct.get(j.id) === 'new').length;
    const net = s.profit - g.exp;
    const maaser = Math.max(0, net) * (num(S.settings.maaserPct) / 100);
    return `<div class="card">
      <div class="period-title"><b>${esc(g.label)}</b><span class="small muted">${esc(g.sub)}</span></div>
      <div class="grid3">
        ${kpi('פניות', s.leads)}${kpi('נסגרו', `${s.closed} <span class="small muted">(${pct(s.closed, s.leads)})</span>`)}${kpi('רווח גולמי', money(s.profit), 'good')}
        ${kpi('הכנסות', money(s.revenue))}${kpi('חומרים', money(s.materials))}${kpi('נגבה בפועל', money(g.collected))}
      </div>
      <details><summary>פירוט</summary>
        <p class="small">לקוחות חדשים: <b>${nNew}</b> · חוזרים: <b>${closed.length - nNew}</b>${s.due > 0 ? ` · <span class="amount-out">עוד לא שולם: ${money(s.due)}</span>` : ''}</p>
        <b class="small">לפי מקור הגעה</b>${breakdown(g.jobs, j => j.source)}
        <b class="small">לפי מוצא</b>${breakdown(g.jobs, j => (clientById(j.clientId) || {}).nationality)}
        <table class="mini" style="margin-top:10px">
          <tr><td>רווח גולמי</td><td class="n">${money(s.profit)}</td></tr>
          ${Object.entries(g.expCats).map(([k, v]) => `<tr><td class="muted">− ${esc(k)}</td><td class="n">${money(v)}</td></tr>`).join('')}
          <tr><td><b>רווח נקי (אחרי הוצאות עסק)</b></td><td class="n"><b>${money(net)}</b></td></tr>
          ${num(S.settings.maaserPct) ? `<tr><td>מעשר ${S.settings.maaserPct}% מהרווח הנקי</td><td class="n">${money(maaser)}</td></tr>
          <tr><td class="muted">ניתן לצדקה/מעשר בתקופה</td><td class="n">${money(g.maaserGiven)}</td></tr>` : ''}
        </table>
      </details>
    </div>`;
  }).join('');

  app(`
    <h2>סיכומים</h2>
    <div class="chips">${Object.entries(units).map(([k, v]) => `<a class="chip ${k === unit ? 'on' : ''}" href="${link(k, heb ? 'h' : 'g')}">${v}</a>`).join('')}</div>
    <div class="chips"><a class="chip ${!heb ? 'on' : ''}" href="${link(unit, 'g')}">📅 לועזי</a><a class="chip ${heb ? 'on' : ''}" href="${link(unit, 'h')}">🕍 עברי</a></div>
    ${cards || '<p class="muted">אין עדיין נתונים</p>'}
    ${list.length > limit ? `<a class="btn big" href="${link(unit, heb ? 'h' : 'g', limit + 30)}">הצג עוד</a>` : ''}
  `);
};

// ---------- תזרים מזומנים: עסקי ואישי ----------
routes.cash = (ledger, p) => {
  ledger = ledger === 'personal' ? 'personal' : 'biz';
  const st = S.settings;
  const month = p.get('m') || today().slice(0, 7);
  const entries = ledger === 'biz' ? bizEntries() : personalEntries();
  const sign = e => (e.kind === 'in' ? 1 : -1) * num(e.amount);
  const monthEntries = entries.filter(e => e.date.startsWith(month)).sort((a, b) => b.date.localeCompare(a.date));
  const tin = sum(monthEntries.filter(e => e.kind === 'in'), e => num(e.amount));
  const tout = sum(monthEntries.filter(e => e.kind === 'out'), e => num(e.amount));
  const t = today();
  const upToNow = entries.filter(e => e.date <= t);
  const bal = acc => sum(upToNow.filter(e => e.account === acc), sign);
  const [y, m] = month.split('-').map(Number);
  const shift = d => { const x = new Date(y, m - 1 + d, 1); return ymd(x).slice(0, 7); };
  const hebSpan = `${hebParts(month + '-01').month} – ${hebParts(ymd(new Date(y, m, 0))).month}`;

  const balances = ledger === 'biz'
    ? `<div class="grid3">${kpi('💵 מזומן', money(num(st.opening.bizCash) + bal('cash')))}${kpi('🏦 חשבון עסקי', money(num(st.opening.bizBank) + bal('bank')))}${kpi('סה״כ בעסק', money(num(st.opening.bizCash) + num(st.opening.bizBank) + bal('cash') + bal('bank')), 'good')}</div>`
    : `<div class="grid2">${kpi('יתרה אישית', money(num(st.opening.personal) + sum(upToNow, sign)), 'good')}${kpi('משיכות מהעסק החודש', money(sum(monthEntries.filter(e => e.transferId), e => num(e.amount))))}</div>`;

  const el = app(`
    <div class="chips"><a class="chip ${ledger === 'biz' ? 'on' : ''}" href="#cash/biz?m=${month}">🧰 תזרים עסקי</a><a class="chip ${ledger === 'personal' ? 'on' : ''}" href="#cash/personal?m=${month}">🏠 תזרים אישי</a></div>
    <div class="card"><b>יתרות היום</b>${balances}</div>
    <div class="month-nav"><a class="btn sm" href="#cash/${ledger}?m=${shift(-1)}">→ קודם</a><b>${GMONTHS[m - 1]} ${y}<br><span class="small muted">${hebSpan}</span></b><a class="btn sm" href="#cash/${ledger}?m=${shift(1)}">הבא ←</a></div>
    <div class="grid3" style="margin-bottom:12px">${kpi('נכנס', money(tin), 'good')}${kpi('יצא', money(tout), 'bad')}${kpi('נשאר', money(tin - tout), tin - tout >= 0 ? 'good' : 'bad')}</div>
    <div class="btns" style="margin-bottom:12px">
      <button class="primary" data-add="in">+ הכנסה</button><button data-add="out">− הוצאה</button>
      ${ledger === 'biz' ? '<button id="xfer">↔ משיכה לפרטי</button>' : ''}
    </div>
    ${ledger === 'biz' ? '<p class="small muted">תשלומים מלקוחות וחומרים לעבודות נכנסים לכאן אוטומטית מתוך העבודות.</p>' : ''}
    <div class="card"><ul class="list">${monthEntries.map(e => {
      const inner = `<div class="main"><div class="title">${esc(e.category || '')}</div><div class="sub">${fmtDM(e.date)} · ${esc(e.note || '')}${ledger === 'biz' ? ' · ' + (e.account === 'cash' ? 'מזומן' : 'בנק') : ''}</div></div>
        <div class="side ${e.kind === 'in' ? 'amount-in' : 'amount-out'}">${e.kind === 'in' ? '+' : '−'}${money(num(e.amount))}</div>`;
      return `<li>${e.href ? `<a class="item" href="${e.href}">${inner}</a>` : `<div class="item" data-edit="${e.id}" style="cursor:pointer">${inner}</div>`}</li>`;
    }).join('') || '<li class="muted">אין תנועות בחודש הזה</li>'}</ul></div>
  `);
  $$('[data-add]', el).forEach(b => b.onclick = () => moneyDialog({ ledger, kind: b.dataset.add, date: month === t.slice(0, 7) ? t : month + '-01' }));
  $$('[data-edit]', el).forEach(d => d.onclick = () => moneyDialog(S.money.find(x => x.id === d.dataset.edit)));
  if ($('#xfer', el)) $('#xfer', el).onclick = transferDialog;
};

function moneyDialog(m) {
  const st = S.settings, isNew = !m.id;
  const cats = m.ledger === 'biz' ? (m.kind === 'in' ? st.bizInCats : st.bizOutCats) : (m.kind === 'in' ? st.personalInCats : st.personalOutCats);
  const dlg = $('#dlg');
  dlg.innerHTML = `<form method="dialog" class="form" id="mf">
    <h3 style="margin-top:0">${m.kind === 'in' ? 'הכנסה' : 'הוצאה'} – ${m.ledger === 'biz' ? 'עסק' : 'אישי'}</h3>
    ${m.transferId ? '<p class="alert small">זו משיכה לפרטי – מחיקה תמחק גם את הצד השני.</p>' : ''}
    <div class="row2"><label>תאריך<input type="date" name="date" value="${m.date || today()}" required></label>
    <label>סכום<input name="amount" inputmode="decimal" value="${m.amount || ''}" required></label></div>
    <label>קטגוריה<select name="category">${opts(cats, m.category || cats[0])}</select></label>
    ${m.ledger === 'biz' ? `<label>חשבון<select name="account"><option value="cash" ${m.account === 'cash' ? 'selected' : ''}>💵 מזומן</option><option value="bank" ${m.account !== 'cash' ? 'selected' : ''}>🏦 חשבון עסקי (בנק/אשראי)</option></select></label>` : ''}
    <label>פירוט<input name="note" value="${esc(m.note || '')}"></label>
    <div class="btns end">${isNew ? '' : '<button type="button" class="danger" id="mdel">מחק</button>'}
      <button type="button" id="mcancel">ביטול</button><button class="primary" value="ok">שמור</button></div>
  </form>`;
  dlg.showModal();
  const f = $('#mf', dlg);
  $('#mcancel', dlg).onclick = () => dlg.close();
  if (!isNew) $('#mdel', dlg).onclick = async () => {
    if (!confirm('למחוק?')) return;
    for (const x of S.money.filter(x => x.id === m.id || (m.transferId && x.transferId === m.transferId))) await remove('money', x.id);
    dlg.close(); render();
  };
  f.onsubmit = async e => {
    e.preventDefault();
    const E = f.elements;
    if (num(E.amount.value) <= 0) return toast('סכום לא תקין');
    const obj = { ...m, id: m.id || uid(), date: E.date.value, amount: num(E.amount.value), category: E.category.value, note: E.note.value.trim(), account: E.account ? E.account.value : '' };
    await save('money', obj);
    if (m.transferId) { // לעדכן גם את הצד השני של המשיכה
      const other = S.money.find(x => x.transferId === m.transferId && x.id !== m.id);
      if (other) await save('money', { ...other, date: obj.date, amount: obj.amount });
    }
    dlg.close(); toast('נשמר ✓'); render();
  };
}

function transferDialog() {
  const dlg = $('#dlg');
  dlg.innerHTML = `<form class="form" id="tf"><h3 style="margin-top:0">↔ משיכה מהעסק לכיס הפרטי</h3>
    <div class="row2"><label>תאריך<input type="date" name="date" value="${today()}"></label><label>סכום<input name="amount" inputmode="decimal" required></label></div>
    <label>מאיפה<select name="account"><option value="bank">🏦 חשבון עסקי</option><option value="cash">💵 מזומן</option></select></label>
    <div class="btns end"><button type="button" id="tcancel">ביטול</button><button class="primary">בצע</button></div></form>`;
  dlg.showModal();
  $('#tcancel', dlg).onclick = () => dlg.close();
  $('#tf', dlg).onsubmit = async e => {
    e.preventDefault();
    const E = e.target.elements, amount = num(E.amount.value);
    if (amount <= 0) return toast('סכום לא תקין');
    const transferId = uid();
    await saveMany('money', [
      { id: uid(), ledger: 'biz', kind: 'out', date: E.date.value, amount, category: WITHDRAW, account: E.account.value, note: '', transferId },
      { id: uid(), ledger: 'personal', kind: 'in', date: E.date.value, amount, category: 'משיכה מהעסק', note: '', transferId },
    ]);
    dlg.close(); toast('בוצע ✓'); render();
  };
}

// ---------- ייבוא מגוגל שיטס / CSV ----------
function parseCSV(text) {
  text = text.replace(/^﻿/, '');
  const delim = (text.split('\n')[0].match(/\t/g) || []).length > (text.split('\n')[0].match(/,/g) || []).length ? '\t' : ',';
  const rows = []; let row = [], cell = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (q) {
      if (ch === '"') { if (text[i + 1] === '"') { cell += '"'; i++; } else q = false; }
      else cell += ch;
    } else if (ch === '"' && cell === '') q = true;
    else if (ch === delim) { row.push(cell); cell = ''; }
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      row.push(cell); rows.push(row); row = []; cell = '';
    } else cell += ch;
  }
  if (cell !== '' || row.length) { row.push(cell); rows.push(row); }
  return rows.map(r => r.map(c => c.trim()));
}

function parseDate(s, dmy, defYear) {
  s = String(s || '').trim();
  if (!s) return null;
  const mk = (y, m, d) => (m >= 1 && m <= 12 && d >= 1 && d <= 31 && y > 1990 && y < 2100 ? `${y}-${pad(m)}-${pad(d)}` : null);
  let m;
  if ((m = s.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/))) return mk(+m[1], +m[2], +m[3]);
  if ((m = s.match(/^(\d{1,2})[/.\-](\d{1,2})[/.\-](\d{2,4})/))) {
    let y = +m[3]; if (y < 100) y += 2000;
    return dmy ? mk(y, +m[2], +m[1]) : mk(y, +m[1], +m[2]);
  }
  if ((m = s.match(/^(\d{1,2})[/.](\d{1,2})$/))) return dmy ? mk(defYear, +m[2], +m[1]) : mk(defYear, +m[1], +m[2]);
  if (/^\d{5}(\.\d+)?$/.test(s)) { const d = new Date(1899, 11, 30); d.setDate(d.getDate() + Math.floor(+s)); return ymd(d); }
  return null;
}

const IMPORT_FIELDS = [ // סדר הבדיקה חשוב: מילים ספציפיות קודם
  ['date', 'תאריך', ['תאריך', 'date', 'יום']],
  ['phone', 'טלפון', ['טלפון', 'פלאפון', 'נייד', 'phone', 'מספר']],
  ['profit', 'רווח (אם אין עמודת חומרים)', ['רווח', 'profit', 'נטו']],
  ['paid', 'שולם? / כמה שולם', ['שולם', 'שילם', 'paid', 'תשלום התקבל', 'סטטוס']],
  ['method', 'אמצעי תשלום', ['אמצעי', 'צורת תשלום', 'איך שילם', 'method']],
  ['materials', 'חומרים', ['חומר', 'הוצא', 'עלות', 'cost']],
  ['price', 'כמה גביתי', ['מחיר', 'סכום', 'הכנסה', 'גבי', 'תשלום', 'price', 'total', 'סה"כ', 'סה״כ']],
  ['source', 'מאיפה הגיע', ['מקור', 'הגיע', 'מאיפה', 'source', 'דרך']],
  ['nationality', 'מוצא', ['מוצא', 'לאום', 'שפה', 'ארץ', 'אמריקאי']],
  ['ctype', 'חדש/חוזר', ['חדש', 'חוזר']],
  ['address', 'כתובת', ['כתובת', 'רחוב', 'address', 'מקום', 'איפה']],
  ['description', 'מה עשיתי', ['עבודה', 'תיאור', 'עשיתי', 'פירוט', 'סוג', 'job', 'description', 'מה']],
  ['notes', 'הערות', ['הערה', 'הערות', 'notes']],
  ['name', 'שם לקוח', ['שם', 'לקוח', 'name', 'client']],
];

routes.import = () => {
  const st = { rows: null, header: 0, map: {} };
  const el = app(`
    <h2>ייבוא מגוגל שיטס</h2>
    <div class="card form">
      <b>אפשרות 1 – קובץ (הכי אמין)</b>
      <p class="small muted">בגוגל שיטס: פתח את הלשונית (למשל 2025) ← קובץ ← הורדה ← CSV. ואז בחר את הקובץ כאן. חוזרים על זה לכל לשונית (2025, 2026).</p>
      <input type="file" id="file" accept=".csv,.tsv,.txt,text/csv">
      <b>אפשרות 2 – קישור לגיליון</b>
      <p class="small muted">צריך אינטרנט, והגיליון צריך להיות משותף "כל מי שיש לו את הקישור – צופה". פתח את הלשונית הנכונה והעתק את הקישור מהדפדפן.</p>
      <label>קישור<input id="url" class="ltr" placeholder="https://docs.google.com/spreadsheets/d/..."></label>
      <label>שם הלשונית (לא חובה)<input id="sheet" placeholder="2025"></label>
      <button id="fetch">טען מהקישור</button>
      <b style="display:block;margin-top:12px">אפשרות 3 – העתק-הדבק</b>
      <p class="small muted">סמן בגיליון את כל הטבלה כולל הכותרות, העתק, והדבק כאן.</p>
      <textarea id="paste" placeholder="הדבק כאן…"></textarea>
      <button id="usepaste">השתמש בטקסט</button>
    </div>
    <div id="mapping"></div>`);

  const load = text => {
    st.rows = parseCSV(text).filter(r => r.some(c => c));
    if (!st.rows.length) return toast('לא נמצאו נתונים');
    st.header = Math.max(0, st.rows.findIndex(r => r.filter(c => c).length >= 2));
    guess(); renderMap();
  };
  function guess() {
    st.map = {};
    const hdr = st.rows[st.header].map(h => h.toLowerCase());
    const used = new Set();
    for (const [key, , words] of IMPORT_FIELDS) {
      const i = hdr.findIndex((h, i) => !used.has(i) && h && words.some(w => h.includes(w.toLowerCase())));
      if (i >= 0) { st.map[key] = i; used.add(i); }
    }
  }
  function renderMap() {
    const hdr = st.rows[st.header];
    const colOpts = sel => `<option value="">— אין —</option>` + hdr.map((h, i) => `<option value="${i}" ${sel === i ? 'selected' : ''}>${esc(h || 'עמודה ' + (i + 1))}</option>`).join('');
    const sample = st.rows.slice(st.header + 1, st.header + 6);
    $('#mapping', el).innerHTML = `<div class="card form">
      <b>נמצאו ${st.rows.length - st.header - 1} שורות. התאם עמודות:</b>
      <label>שורת הכותרות<input type="number" id="hdr" min="1" value="${st.header + 1}"></label>
      ${IMPORT_FIELDS.map(([k, label]) => `<label>${label}<select data-f="${k}">${colOpts(st.map[k])}</select></label>`).join('')}
      <div class="row2">
        <label>פורמט תאריך<select id="dmy"><option value="1">יום/חודש/שנה (ישראלי)</option><option value="0">חודש/יום/שנה (אמריקאי)</option></select></label>
        <label>שנה (כשחסרה בתאריך)<input id="year" type="number" value="${new Date().getFullYear()}"></label>
      </div>
      <label>אם אין עמודת "שולם"<select id="allpaid"><option value="1">לסמן הכל כשולם</option><option value="0">לסמן הכל כלא שולם</option></select></label>
      <label>אמצעי תשלום ברירת מחדל<select id="defmethod">${opts(S.settings.methods)}</select></label>
      <b class="small">תצוגה מקדימה</b>
      <div class="scroll-x"><table class="mini"><tr>${hdr.map(h => `<th>${esc(h)}</th>`).join('')}</tr>
        ${sample.map(r => `<tr>${hdr.map((_, i) => `<td>${esc(r[i] || '')}</td>`).join('')}</tr>`).join('')}</table></div>
      <div class="btns end"><button class="primary" id="go">ייבא ✓</button></div>
    </div>`;
    $('#hdr', el).onchange = e => { st.header = Math.max(0, Math.min(st.rows.length - 1, +e.target.value - 1)); guess(); renderMap(); };
    $$('[data-f]', el).forEach(s => s.onchange = () => { st.map[s.dataset.f] = s.value === '' ? undefined : +s.value; });
    $('#go', el).onclick = doImport;
  }

  async function doImport() {
    const M = st.map, dmy = $('#dmy', el).value === '1', year = +$('#year', el).value;
    const allPaid = $('#allpaid', el).value === '1', defMethod = $('#defmethod', el).value;
    const get = (r, k) => (M[k] === undefined ? '' : String(r[M[k]] || '').trim());
    const existingKeys = new Set(S.jobs.map(j => j.importKey).filter(Boolean));
    const byPhone = new Map(), byName = new Map();
    for (const c of S.clients) { if (normPhone(c.phone)) byPhone.set(normPhone(c.phone), c); byName.set((c.name || '').trim().toLowerCase(), c); }
    const newClients = new Map(), jobs = [];
    let lastDate = null, dup = 0, skipped = 0;
    for (const r of st.rows.slice(st.header + 1)) {
      const name = get(r, 'name'), phone = get(r, 'phone'), desc = get(r, 'description');
      const priceRaw = get(r, 'price');
      if (/סה"?כ|סה״כ|total/i.test(name + ' ' + desc + ' ' + r[0])) { skipped++; continue; }
      if (!name && !phone && !desc && !num(priceRaw)) { skipped++; continue; }
      const date = parseDate(get(r, 'date'), dmy, year) || lastDate || `${year}-01-01`;
      lastDate = date;
      const key = 'imp:' + r.join('|');
      if (existingKeys.has(key)) { dup++; continue; }
      existingKeys.add(key);

      const np = normPhone(phone), lname = (name || '').toLowerCase();
      let c = (np && byPhone.get(np)) || (lname && byName.get(lname));
      if (!c) {
        const nm = name || phone || 'לקוח לא ידוע (ייבוא)';
        c = { id: uid(), name: nm, phone, address: get(r, 'address'), nationality: get(r, 'nationality'), origin: get(r, 'source'), notes: '' };
        newClients.set(c.id, c);
        if (np) byPhone.set(np, c);
        byName.set(nm.toLowerCase(), c);
      } else if (newClients.has(c.id)) {
        c.address = c.address || get(r, 'address'); c.nationality = c.nationality || get(r, 'nationality'); c.origin = c.origin || get(r, 'source');
      }
      const price = num(priceRaw);
      const materials = M.materials !== undefined ? num(get(r, 'materials')) : M.profit !== undefined && get(r, 'profit') !== '' ? Math.max(0, price - num(get(r, 'profit'))) : 0;
      let paidAmt;
      if (M.paid === undefined) paidAmt = allPaid ? price : 0;
      else {
        const v = get(r, 'paid');
        if (/^[\d.,₪\s]+$/.test(v) && num(v) > 1) paidAmt = Math.min(num(v), price || num(v));
        else if (/לא|no|false|✗|❌|^x$/i.test(v)) paidAmt = 0;
        else if (/כן|שולם|שילם|yes|true|v|✓|✔|✅|^1$/i.test(v)) paidAmt = price;
        else paidAmt = v === '' ? (allPaid ? price : 0) : 0;
      }
      const ctRaw = get(r, 'ctype');
      jobs.push({
        id: uid(), date, status: 'closed', clientId: c.id, source: get(r, 'source') || c.origin || '',
        ctype: /חוזר/.test(ctRaw) ? 'returning' : /חדש/.test(ctRaw) ? 'new' : '',
        description: desc, price, materials, extra: 0, notes: get(r, 'notes'), importKey: key,
        payments: paidAmt > 0 ? [{ date, amount: paidAmt, method: get(r, 'method') || defMethod }] : [],
      });
    }
    if (!jobs.length) return toast(dup ? 'כל השורות כבר יובאו בעבר' : 'לא נמצאו שורות לייבוא');
    await saveMany('clients', [...newClients.values()]);
    await saveMany('jobs', jobs);
    $('#mapping', el).innerHTML = `<div class="alert good">✅ יובאו <b>${jobs.length}</b> עבודות, נוספו <b>${newClients.size}</b> לקוחות חדשים.
      ${dup ? `<br>${dup} שורות דולגו כי כבר יובאו בעבר.` : ''}${skipped ? `<br>${skipped} שורות ריקות/סיכום דולגו.` : ''}
      <br><a href="#reports?u=month">לסיכומים ←</a></div>`;
  }

  $('#file', el).onchange = async e => { const f = e.target.files[0]; if (f) load(await f.text()); };
  $('#usepaste', el).onclick = () => load($('#paste', el).value);
  $('#fetch', el).onclick = async () => {
    const u = $('#url', el).value.trim(), id = (u.match(/\/d\/([\w-]+)/) || [])[1];
    if (!id) return toast('קישור לא תקין');
    const gid = (u.match(/[#&?]gid=(\d+)/) || [])[1], sheet = $('#sheet', el).value.trim();
    const urls = [
      sheet ? `https://docs.google.com/spreadsheets/d/${id}/gviz/tq?tqx=out:csv&sheet=${encodeURIComponent(sheet)}` : null,
      `https://docs.google.com/spreadsheets/d/${id}/export?format=csv${gid ? '&gid=' + gid : ''}`,
      `https://docs.google.com/spreadsheets/d/${id}/gviz/tq?tqx=out:csv${gid ? '&gid=' + gid : ''}`,
    ].filter(Boolean);
    toast('טוען…');
    for (const url of urls) {
      try {
        const r = await fetch(url);
        if (r.ok) { const t = await r.text(); if (!/^\s*</.test(t)) return load(t); }
      } catch (_) { /* ננסה את הכתובת הבאה */ }
    }
    toast('לא הצלחתי לטעון. בדוק שיתוף/אינטרנט, או השתמש בקובץ CSV');
  };
};

// ---------- הגדרות, גיבוי ועוד ----------
routes.more = () => {
  const st = S.settings;
  const appUrl = location.href.split('#')[0].split('?')[0];
  const lists = [
    ['sources', 'מקורות הגעה'], ['nationalities', 'מוצא לקוחות'], ['methods', 'אמצעי תשלום'], ['lostReasons', 'סיבות לאי-סגירה'],
    ['bizOutCats', 'קטגוריות הוצאה – עסק'], ['bizInCats', 'קטגוריות הכנסה – עסק'], ['personalOutCats', 'קטגוריות הוצאה – אישי'], ['personalInCats', 'קטגוריות הכנסה – אישי'],
  ];
  const el = app(`
    <h2>הגדרות ועוד</h2>
    <div class="card">
      <b>💾 גיבוי</b>
      <p class="small muted">כל המידע שמור רק בטלפון הזה. אם הטלפון הולך לאיבוד – המידע הולך איתו. תגבה פעם בשבוע ושמור את הקובץ בווצאפ לעצמך / בדרייב.
      ${st.lastBackup ? `גיבוי אחרון: ${fmtG(ymd(new Date(st.lastBackup)))}` : 'עוד לא נעשה גיבוי.'}</p>
      <div class="btns"><button class="primary" id="backup">גבה עכשיו</button><button id="restore">שחזר מגיבוי</button>
        <button id="csv">ייצוא עבודות לאקסל</button><a class="btn" href="#import">ייבוא מגוגל שיטס</a></div>
      <input type="file" id="restore-file" accept=".json,application/json" hidden>
    </div>

    <details class="card"><summary>📞 חיבור לשיחות טלפון (זיהוי לקוח בשיחה נכנסת)</summary>
      <p class="small">אפליקציית אינטרנט לא יכולה לקרוא שיחות לבד, אז מחברים אותה דרך אפליקציה חינמית לאנדרואיד בשם <b>MacroDroid</b>:</p>
      <ol class="steps small">
        <li>התקן את האפליקציה הזו למסך הבית (תפריט הדפדפן ← "הוסף למסך הבית").</li>
        <li>התקן <b>MacroDroid</b> מחנות Play ותן לו הרשאת טלפון.</li>
        <li>צור מאקרו חדש. טריגר: <b>Call Incoming</b> (שיחה נכנסת) – כל המספרים. אפשר לסמן "רק מספרים שלא באנשי קשר".</li>
        <li>פעולה: <b>Open Website / URL</b> עם הכתובת:<br><code>${esc(appUrl)}?phone=[call_number]</code><br>
          (את <code>[call_number]</code> בוחרים מכפתור ה-Magic Text "מספר מתקשר").</li>
        <li>שמור. מעכשיו בכל שיחה נכנסת תיפתח מסך שאומר אם זה לקוח מוכר (כולל חוב פתוח והיסטוריה) או לקוח חדש – עם רשימת שאלות לבירור.</li>
      </ol>
      <p class="small muted">באייפון אפל לא מאפשרת זיהוי אוטומטי. אפשר ללחוץ על 📞 למעלה ולהקליד את המספר.</p>
      <a class="btn sm" href="#caller">נסה את מסך הזיהוי</a>
    </details>

    <details class="card"><summary>🏦 יתרות פתיחה ותזרים</summary>
      <form class="form" id="open">
        <div class="row3"><label>מזומן בעסק<input name="bizCash" inputmode="decimal" value="${st.opening.bizCash}"></label>
        <label>חשבון עסקי<input name="bizBank" inputmode="decimal" value="${st.opening.bizBank}"></label>
        <label>יתרה אישית<input name="personal" inputmode="decimal" value="${st.opening.personal}"></label></div>
        <label>חומרים לעבודות משולמים בדרך כלל מ-<select name="materialsAccount"><option value="bank" ${st.materialsAccount === 'bank' ? 'selected' : ''}>חשבון עסקי / אשראי</option><option value="cash" ${st.materialsAccount === 'cash' ? 'selected' : ''}>מזומן</option></select></label>
        <div class="row2"><label>אחוז מעשר (0 = לא להציג)<input name="maaserPct" inputmode="decimal" value="${st.maaserPct}"></label>
        <label>עיר ברירת מחדל<input name="city" value="${esc(st.city)}"></label></div>
        <label>לוח שנה ברירת מחדל בסיכומים<select name="hebrewDefault"><option value="0">לועזי</option><option value="1" ${st.hebrewDefault ? 'selected' : ''}>עברי</option></select></label>
        <button class="primary">שמור</button>
      </form>
    </details>

    <details class="card"><summary>📝 עריכת רשימות (מקורות, מוצא, קטגוריות…)</summary>
      <form class="form" id="lists"><p class="small muted">פריט אחד בכל שורה.</p>
        ${lists.map(([k, l]) => `<label>${l}<textarea name="${k}" rows="4">${esc(st[k].join('\n'))}</textarea></label>`).join('')}
        <button class="primary">שמור רשימות</button></form>
    </details>

    <details class="card"><summary>📲 התקנה כאפליקציה ועבודה בלי אינטרנט</summary>
      <p class="small">אנדרואיד (כרום): תפריט ⋮ ← "התקן אפליקציה" / "הוסף למסך הבית". אייפון (ספארי): כפתור שיתוף ← "הוסף למסך הבית".
      אחרי הפתיחה הראשונה הכל עובד גם בלי קליטה.</p>
    </details>

    <details class="card"><summary>⚠️ מחיקת כל הנתונים</summary>
      <button class="danger" id="wipe">מחק הכל מהמכשיר</button></details>
  `);

  $('#backup', el).onclick = async () => {
    const data = JSON.stringify({ app: 'handyman-business', version: 1, exportedAt: new Date().toISOString(), clients: S.clients, jobs: S.jobs, money: S.money, settings: S.settings });
    const name = `גיבוי-העסק-${today()}.json`;
    const file = new File([data], name, { type: 'application/json' });
    let shared = false;
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      try { await navigator.share({ files: [file], title: name }); shared = true; } catch (_) { /* בוטל – נוריד כקובץ */ }
    }
    if (!shared) download(name, data, 'application/json');
    st.lastBackup = Date.now(); await saveSettings(); toast('הגיבוי מוכן ✓');
  };
  $('#restore', el).onclick = () => $('#restore-file', el).click();
  $('#restore-file', el).onchange = async e => {
    const f = e.target.files[0]; if (!f) return;
    try {
      const d = JSON.parse(await f.text());
      if (d.app !== 'handyman-business') throw new Error('bad');
      if (!confirm(`לשחזר ${d.clients.length} לקוחות ו-${d.jobs.length} עבודות? המידע הנוכחי יוחלף.`)) return;
      await wipeAll();
      await saveMany('clients', d.clients); await saveMany('jobs', d.jobs); await saveMany('money', d.money || []);
      S.settings = { ...structuredClone(DEFAULTS), ...d.settings }; await saveSettings();
      toast('שוחזר ✓'); go('#home');
    } catch (_) { toast('קובץ גיבוי לא תקין'); }
  };
  $('#csv', el).onclick = () => {
    const ct = clientTypes();
    const head = ['תאריך', 'תאריך עברי', 'סטטוס', 'לקוח', 'טלפון', 'כתובת', 'מוצא', 'מקור', 'חדש/חוזר', 'עבודה', 'גבייה', 'חומרים', 'הוצאות נוספות', 'רווח גולמי', 'שולם', 'חוב', 'הערות'];
    const rows = [...S.jobs].sort((a, b) => a.date.localeCompare(b.date)).map(j => {
      const c = clientById(j.clientId) || {};
      return [j.date, hebDate(j.date), STATUS[j.status], c.name, c.phone, c.address, c.nationality, j.source, ct.get(j.id) === 'new' ? 'חדש' : 'חוזר',
        j.description, num(j.price), num(j.materials), num(j.extra), profitOf(j), paidOf(j), dueOf(j), j.notes];
    });
    const csv = [head, ...rows].map(r => r.map(v => `"${String(v ?? '').replace(/"/g, '""')}"`).join(',')).join('\r\n');
    download(`עבודות-${today()}.csv`, '﻿' + csv, 'text/csv');
  };
  $('#open', el).onsubmit = async e => {
    e.preventDefault(); const E = e.target.elements;
    st.opening = { bizCash: num(E.bizCash.value), bizBank: num(E.bizBank.value), personal: num(E.personal.value) };
    st.materialsAccount = E.materialsAccount.value; st.maaserPct = num(E.maaserPct.value);
    st.city = E.city.value.trim(); st.hebrewDefault = E.hebrewDefault.value === '1';
    await saveSettings(); toast('נשמר ✓');
  };
  $('#lists', el).onsubmit = async e => {
    e.preventDefault();
    for (const [k] of lists) { const v = e.target.elements[k].value.split('\n').map(s => s.trim()).filter(Boolean); if (v.length) st[k] = v; }
    await saveSettings(); toast('נשמר ✓');
  };
  $('#wipe', el).onclick = async () => {
    if (!confirm('למחוק את כל הלקוחות, העבודות והתזרים? (כדאי לגבות קודם)')) return;
    if (prompt('כדי לאשר כתוב: מחק') !== 'מחק') return;
    await wipeAll(); toast('נמחק'); go('#home');
  };
};

async function wipeAll() {
  for (const s of ['clients', 'jobs', 'money']) { await idb(s, 'readwrite', os => os.clear()); S[s] = []; }
}
function download(name, data, type) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([data], { type }));
  a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
}

// ---------- הפעלה ----------
(async function start() {
  try { await loadAll(); } catch (e) { app(`<p class="alert bad">שגיאה בטעינת הנתונים: ${esc(e.message)}</p>`); return; }
  if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});
  // פתיחה מתוך MacroDroid: ...?phone=0501234567
  const qp = new URLSearchParams(location.search).get('phone');
  if (qp) { history.replaceState(null, '', location.pathname + '#caller?phone=' + encodeURIComponent(qp)); }
  window.addEventListener('hashchange', render);
  render();
  if ('serviceWorker' in navigator && location.protocol !== 'file:') navigator.serviceWorker.register('sw.js').catch(() => {});
})();

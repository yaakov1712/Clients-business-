'use strict';

/* =========================================================
   views-more.js – סיכומים, תפריט "עוד", ייבוא מאקסל, גיבוי והגדרות
   ========================================================= */

// ---------- סיכומים ----------
routes.reports = (_, p) => {
  const unit = p.get('u') || 'month';
  const heb = (p.get('cal') || (S.settings.hebrewDefault ? 'h' : 'g')) === 'h';
  const ct = clientTypes();
  const groups = new Map();
  const grp = date => {
    const k = periodOf(date, unit, heb);
    let g = groups.get(k.key);
    if (!g) groups.set(k.key, g = { ...k, jobs: [], collected: 0, exp: 0, expCats: {}, maaserGiven: 0, buy: 0, minutes: 0, max: date });
    if (date > g.max) g.max = date;
    return g;
  };
  const hourDates = new Set();
  for (const j of S.jobs) {
    grp(j.date).jobs.push(j);
    if (j.status === 'closed') for (const x of j.payments || []) grp(x.date || j.date).collected += num(x.amount);
    if (durOf(j)) hourDates.add(j.date);
  }
  for (const m of S.money) {
    if (m.ledger === 'biz' && m.kind === 'out' && m.category !== WITHDRAW) {
      const g = grp(m.date); g.exp += num(m.amount); g.expCats[m.category] = (g.expCats[m.category] || 0) + num(m.amount);
    }
    if (m.ledger === 'personal' && m.kind === 'out' && /מעשר|צדקה/.test(m.category || '')) grp(m.date).maaserGiven += num(m.amount);
  }
  for (const x of S.purchases) { grp(x.date).buy += num(x.amount); if (tripMin(x)) hourDates.add(x.date); }
  for (const w of S.workdays) if (w.start || w.minutes) hourDates.add(w.date);
  for (const date of hourDates) grp(date).minutes += dayStats(date).total;

  const list = [...groups.values()].sort((a, b) => b.max.localeCompare(a.max));
  const limit = +(p.get('n') || 24);
  const units = [['day', 'יומי'], ['week', 'שבועי'], ['month', 'חודשי'], ['year', 'שנתי']];
  const link = (u, c, n) => `#reports?u=${u}&cal=${c}${n ? '&n=' + n : ''}`;

  const breakdown = (jobs, keyFn) => {
    const t = {};
    for (const j of jobs) {
      const k = keyFn(j) || 'לא צוין';
      t[k] = t[k] || { leads: 0, closed: 0, profit: 0 };
      t[k].leads++;
      if (j.status === 'closed') { t[k].closed++; t[k].profit += profitOf(j); }
    }
    return `<table class="ptable"><tr style="color:var(--ink-3);font-size:.78rem"><td></td><td>פניות</td><td>נסגרו</td><td style="text-align:left">רווח</td></tr>
      ${Object.entries(t).sort((a, b) => b[1].leads - a[1].leads).map(([k, v]) => `<tr><td>${esc(k)}</td><td class="num">${v.leads}</td><td class="num">${v.closed} <span class="faint small">(${pct(v.closed, v.leads)})</span></td><td class="num">${money(v.profit)}</td></tr>`).join('')}</table>`;
  };

  const sums = list.map(g => ({ g, s: summarize(g.jobs) }));
  const chartItems = sums.slice(0, 8).reverse().map(({ g, s }) => ({ key: g.key, label: g.label, short: unit === 'month' ? g.label.split(' ')[0].slice(0, 5) : unit === 'year' ? g.label.replace('שנת ', '') : unit === 'week' ? (heb ? hebDM(g.key) : fmtDM(g.key)) : fmtDM(g.max), value: s.profit }));

  const cards = sums.slice(0, limit).map(({ g, s }) => {
    const closed = g.jobs.filter(j => j.status === 'closed');
    const nNew = closed.filter(j => ct.get(j.id) === 'new').length;
    const net = s.profit - g.exp;
    const maaser = Math.max(0, net) * (num(S.settings.maaserPct) / 100);
    return `<div class="card">
      <div class="card-title"><span>${esc(g.label)}</span><span class="small muted">${esc(g.sub)}</span></div>
      <div class="tiles three" style="margin-bottom:8px">${kpiTile('פניות', s.leads)}${kpiTile('נסגרו', `${s.closed}`, '', pct(s.closed, s.leads))}${kpiTile('רווח גולמי', money(s.profit), 'good')}</div>
      <div class="tiles three" style="margin-bottom:0">${kpiTile('הכנסות', money(s.revenue))}${kpiTile('חומרים', money(s.materials))}${kpiTile('נגבה בפועל', money(g.collected))}</div>
      <details><summary class="link-btn">פירוט מלא</summary>
        <p class="small">לקוחות חדשים: <b>${nNew}</b> · חוזרים: <b>${closed.length - nNew}</b>${s.due > 0 ? ` · <span style="color:var(--bad)">עוד לא שולם: <b>${money(s.due)}</b></span>` : ''}</p>
        <div class="small muted" style="margin-top:10px"><b>לפי מקור הגעה</b></div>${breakdown(g.jobs, sourceOf)}
        <div class="small muted" style="margin-top:10px"><b>לפי מוצא</b></div>${breakdown(g.jobs, j => (clientById(j.clientId) || {}).nationality)}
        <table class="ptable" style="margin-top:12px">
          <tr><td>רווח גולמי</td><td>${money(s.profit)}</td></tr>
          ${Object.entries(g.expCats).map(([k, v]) => `<tr class="sub"><td>− ${esc(k)}</td><td>${money(v)}</td></tr>`).join('')}
          <tr class="total"><td>רווח נקי (אחרי הוצאות עסק)</td><td>${money(net)}</td></tr>
          ${g.buy ? `<tr class="sub"><td>קניות חומרים בחנויות (לידיעה)</td><td>${money(g.buy)}</td></tr>` : ''}
          ${g.minutes ? `<tr class="sub"><td>שעות עבודה</td><td>${fmtDur(g.minutes)}</td></tr><tr class="sub"><td>רווח גולמי לשעה</td><td>${money(s.profit / (g.minutes / 60))}</td></tr>` : ''}
          ${num(S.settings.maaserPct) ? `<tr class="sub"><td>מעשר ${S.settings.maaserPct}% מהרווח הנקי</td><td>${money(maaser)}</td></tr><tr class="sub"><td>ניתן לצדקה בתקופה</td><td>${money(g.maaserGiven)}</td></tr>` : ''}
        </table></details></div>`;
  }).join('');

  app(`
    <div class="head"><div><h1>סיכומים</h1><div class="sub">רווח גולמי, חומרים והכנסות</div></div></div>
    ${segHTML(units.map(([k, l]) => [k, l, link(k, heb ? 'h' : 'g')]), unit)}
    <div class="pills"><a class="${!heb ? 'on' : ''}" href="${link(unit, 'g')}">לוח לועזי</a><a class="${heb ? 'on' : ''}" href="${link(unit, 'h')}">לוח עברי</a></div>
    ${chartItems.length > 1 ? `<div class="card"><div class="card-title"><span>רווח גולמי</span><span class="small muted">${chartItems.length} תקופות אחרונות</span></div>${barChart(chartItems, chartItems[chartItems.length - 1].key)}</div>` : ''}
    ${cards || emptyState('chart', 'אין עדיין נתונים', 'ברגע שתרשום עבודות או תייבא את הטבלה – הסיכומים יופיעו כאן.', '<a class="btn primary" href="#import" style="margin-top:12px">ייבוא מאקסל</a>')}
    ${list.length > limit ? `<a class="btn block" href="${link(unit, heb ? 'h' : 'g', limit + 24)}">הצג עוד</a>` : ''}`);
};

// ---------- תפריט "עוד" ----------
routes.more = () => {
  const todo = todoItems(), todoN = todo.jobs.length + todo.clients.length + todo.trips.length;
  const debt = sum(S.jobs, dueOf);
  const row = (href, color, icon, title, desc = '', badge = '') => `<li><a class="set-row" href="${href}"><span class="si ${color}">${ic(icon)}</span><div class="main">${title}${desc ? `<div class="d">${desc}</div>` : ''}</div>${badge}${ic('left', 'sm faint')}</a></li>`;
  app(`
    <div class="head"><div><h1>עוד</h1></div></div>
    ${sectionLabel('מעקב')}
    <div class="card flush"><ul class="list">
      ${row('#reports', 'b1', 'chart', 'סיכומים', 'יומי, שבועי, חודשי · לועזי ועברי')}
      ${row('#cash/biz', 'b2', 'wallet', 'תזרים עסקי', 'מזומן וחשבון עסקי')}
      ${row('#cash/personal', 'b4', 'user', 'תזרים אישי')}
      ${row('#materials', 'b3', 'cart', 'חומרים וקניות', 'כמה, איפה, ואיך שולם')}
      ${row('#hours', 'b6', 'clock', 'שעות עבודה', 'כניסה ללקוח, נסיעות לחנויות')}
      ${row('#debts', 'b5', 'card', 'חובות', 'מי עוד לא שילם', debt ? pill(money(debt), 'bad') : '')}
    </ul></div>
    ${sectionLabel('נתונים')}
    <div class="card flush"><ul class="list">
      ${row('#fill', 'b3', 'edit', 'השלמת נתונים', 'מידע שחסר בעבודות ובלקוחות', todoN ? pill(todoN, 'warn') : pill('✓', 'good'))}
      ${row('#import', 'b1', 'upload', 'ייבוא מאקסל / גוגל שיטס', 'קורא גם צבעים: כחול שולם, כתום לא שולם')}
      ${row('#backup', 'b2', 'shield', 'גיבוי ושחזור')}
    </ul></div>
    ${sectionLabel('אפליקציה')}
    <div class="card flush"><ul class="list">
      ${row('#caller', 'b6', 'incoming', 'מי מתקשר?', 'זיהוי לקוח לפי מספר')}
      ${row('#settings', 'b7', 'sliders', 'הגדרות', 'יתרות פתיחה, רשימות, מעשר, התקנה')}
    </ul></div>`);
};

// ---------- ייבוא מאקסל ----------
routes.import = () => {
  const el = app(`
    <div class="topnav">${backBtn('#more', 'עוד')}<div class="title">ייבוא מאקסל</div><span></span></div>
    <div class="card"><div class="empty" style="padding:10px 0 4px"><div class="ei">${ic('upload', 'lg')}</div><b>בחר את קובץ האקסל של ההכנסות</b>
      <div class="small">האפליקציה קוראת את כל הלשוניות שיש בהן "שם הלקוח", כולל הצבעים: כחול = שולם, כתום = לא שולם.</div>
      <label class="btn primary" style="margin-top:14px">${ic('file', 'sm')}בחר קובץ<input type="file" id="file" hidden accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"></label></div></div>
    <details class="card"><summary class="link-btn">איך משיגים את הקובץ בטלפון?</summary><div class="prose small muted" style="margin-top:8px">
      <p>באפליקציית <b>Google Sheets</b>: פתח את הגיליון ← ⋮ ← <b>שיתוף וייצוא</b> ← <b>שמירה בפורמט Excel (.xlsx)</b> ← "שמור בקבצים".</p>
      <p>או מהדפדפן במחשב: קובץ ← הורדה ← Microsoft Excel (.xlsx), ושלח לעצמך בווצאפ / דרייב.</p>
      <p>כשבוחרים קובץ באפליקציה, בחר אותו מ"קבצים" (iCloud Drive / בטלפון).</p></div></details>
    <div id="preview"></div>`);
  const prev = $('#preview', el);
  const busy = msg => (prev.innerHTML = `<div class="card"><div class="loading">${msg}</div></div>`);
  $('#file', el).onchange = async e => {
    const file = e.target.files[0]; if (!file) return;
    busy('קורא את הקובץ…');
    try {
      const book = await readXlsx(file);
      const res = parseIncomeWorkbook(book);
      if (!res.jobs.length) { prev.innerHTML = `<div class="alert-soft bad">${ic('alert', 'sm')} לא נמצאו שורות לקוחות. ודא שיש בלשונית כותרת "שם הלקוח". לשוניות בקובץ: ${book.sheets.map(s => esc(s.name)).join(', ')}</div>`; return; }
      showPreview(res);
    } catch (err) { prev.innerHTML = `<div class="alert-soft bad">${ic('alert', 'sm')} ${esc(err.message || 'שגיאה בקריאת הקובץ')}</div>`; }
  };

  function showPreview(res) {
    const s = res.stats, existing = new Set(S.clients.map(c => normName(c.name)));
    const newC = [...res.clients.keys()].filter(k => !existing.has(k)).length;
    const already = S.jobs.filter(j => j.imported).length;
    prev.innerHTML = `
      <div class="hero"><div class="label">נמצא בקובץ · ${esc(res.sheets.map(x => x.name).join(', '))}</div><div class="big num">${s.jobs} עבודות</div>
        <span class="delta">${fmtG(s.from)} – ${fmtG(s.to)}</span>
        <div class="hero-stats"><div><b class="num">${money(s.revenue)}</b><span>הכנסות</span></div><div><b class="num">${money(s.profit)}</b><span>רווח גולמי</span></div><div><b class="num">${s.clients}</b><span>לקוחות</span></div></div></div>
      <div class="card"><table class="ptable">
        <tr><td>${pill('שולם', 'good')} (כחול)</td><td>${s.paid}</td></tr>
        <tr><td>${pill('לא שולם', 'bad')} (כתום)</td><td>${s.unpaid}${s.due ? ` · ${money(s.due)}` : ''}</td></tr>
        ${s.partial ? `<tr><td>${pill('שולם חלקית', 'warn')}</td><td>${s.partial}</td></tr>` : ''}
        ${s.quotes ? `<tr><td>הצעות מחיר (בבירור)</td><td>${s.quotes}</td></tr>` : ''}
        ${s.noPrice ? `<tr><td>${pill('חסר סכום', 'info')} להשלמה</td><td>${s.noPrice}</td></tr>` : ''}
        ${s.approx ? `<tr><td>${pill('תאריך משוער', 'info')} (בלי תאריך בטבלה)</td><td>${s.approx}</td></tr>` : ''}
        <tr class="sub"><td>לקוחות חדשים באפליקציה</td><td>${newC}</td></tr>
        <tr class="sub"><td>ימי עבודה עם שעות / חופש</td><td>${s.workdays}${s.vacations ? ` (${s.vacations} חופש)` : ''}</td></tr>
        ${s.donations ? `<tr class="sub"><td>תרומות ומעשר שנרשמו בטבלה</td><td>${s.donations}</td></tr>` : ''}
        ${s.trips ? `<tr class="sub"><td>נסיעות לקניות</td><td>${s.trips}</td></tr>` : ''}</table></div>
      ${res.warnings.length ? `<div class="alert-soft">${ic('info', 'sm')} <div><b>תיקונים אוטומטיים</b><br>${res.warnings.map(w => `<div class="small">${esc(w)}</div>`).join('')}</div></div>` : ''}
      <p class="small muted" style="padding:0 6px">אחרי הייבוא תראה אילו נתונים חסרים (טלפון, כתובת, מקור הגעה ועוד) ותוכל להשלים אותם בקלות.</p>
      ${already ? `<div class="seg" id="mode"><button type="button" data-v="add" class="on">הוסף חדשים בלבד</button><button type="button" data-v="replace">עדכן הכל מחדש</button></div>
        <p class="small muted" id="modetxt" style="padding:0 6px">כבר יובאו ${already} עבודות בעבר. שורות שכבר קיימות לא יוכפלו.</p>` : ''}
      <button class="btn primary block" id="go">${ic('download', 'sm')}ייבא עכשיו</button>`;
    let replace = false;
    const mode = $('#mode', prev);
    if (mode) mode.onclick = e => { const b = e.target.closest('button'); if (!b) return; replace = b.dataset.v === 'replace'; $$('button', mode).forEach(x => x.classList.toggle('on', x === b)); $('#modetxt', prev).textContent = replace ? 'שורות שנמחקו או שונו בקובץ יתעדכנו. עבודות שערכת באפליקציה לא יידרסו.' : `כבר יובאו ${already} עבודות בעבר. שורות שכבר קיימות לא יוכפלו.`; };
    $('#go', prev).onclick = async () => {
      busy('מייבא…');
      const r = await commitImport(res, replace);
      const todo = todoItems();
      prev.innerHTML = `<div class="card"><div class="result-big"><div class="ei" style="background:var(--good-soft);color:var(--good)">${ic('checkc', 'lg')}</div><h2 style="margin:0">הייבוא הושלם!</h2>
        <div class="muted small">נוספו ${r.jobs} עבודות, ${r.clients} לקוחות חדשים${r.workdays ? `, ${r.workdays} ימי עבודה` : ''}${r.donations ? `, ${r.donations} תרומות` : ''}.${r.skipped ? ` ${r.skipped} שורות כבר היו קיימות.` : ''}${r.removed ? ` ${r.removed} שורות ישנות הוסרו.` : ''}</div></div>
        <div class="btn-row" style="margin-top:14px"><a class="btn primary" href="#fill">השלמת נתונים (${todo.jobs.length + todo.clients.length + todo.trips.length})</a><a class="btn" href="#reports">לסיכומים</a></div></div>`;
      toast('יובא בהצלחה', 'checkc');
    };
  }
};

// ---------- גיבוי ----------
routes.backup = () => {
  const st = S.settings;
  const el = app(`
    <div class="topnav">${backBtn('#more', 'עוד')}<div class="title">גיבוי ושחזור</div><span></span></div>
    <div class="alert-soft">${ic('shield', 'sm')} כל המידע שמור רק בטלפון הזה. אם הטלפון הולך לאיבוד – המידע הולך איתו. גבה פעם בשבוע ושמור את הקובץ ב"קבצים", בדרייב או בווצאפ לעצמך.</div>
    <div class="card"><div class="small muted">${st.lastBackup ? 'גיבוי אחרון: ' + fmtG(ymd(new Date(st.lastBackup))) : 'עוד לא נעשה גיבוי'}</div>
      <div class="small muted">${S.clients.length} לקוחות · ${S.jobs.length} עבודות · ${S.purchases.length} קניות · ${S.events.length} אירועים</div>
      <div class="btn-row" style="margin-top:12px"><button class="btn primary" id="backup">${ic('download', 'sm')}גבה עכשיו</button><button class="btn" id="restore">${ic('upload', 'sm')}שחזר מגיבוי</button></div>
      <input type="file" id="restore-file" accept=".json,application/json" hidden></div>
    <div class="card"><b>ייצוא לאקסל</b><div class="small muted">כל העבודות כקובץ CSV שנפתח באקסל / גוגל שיטס.</div><button class="btn" id="csv" style="margin-top:10px">${ic('file', 'sm')}ייצוא עבודות</button></div>
    <details class="card"><summary class="link-btn" style="color:var(--bad)">מחיקת כל הנתונים</summary><button class="btn danger" id="wipe" style="margin-top:10px">${ic('trash', 'sm')}מחק הכל מהמכשיר</button></details>`);
  $('#backup', el).onclick = async () => {
    const data = JSON.stringify({ app: 'handyman-business', version: 2, exportedAt: new Date().toISOString(), settings: S.settings, ...Object.fromEntries(STORES.map(s => [s, S[s]])) });
    const name = `גיבוי-העסק-${today()}.json`, file = new File([data], name, { type: 'application/json' });
    let shared = false;
    if (navigator.canShare && navigator.canShare({ files: [file] })) { try { await navigator.share({ files: [file], title: name }); shared = true; } catch (_) { /* בוטל */ } }
    if (!shared) download(name, data, 'application/json');
    st.lastBackup = Date.now(); await saveSettings(); toast('הגיבוי מוכן', 'shield'); routes.backup();
  };
  $('#restore', el).onclick = () => $('#restore-file', el).click();
  $('#restore-file', el).onchange = async e => {
    const f = e.target.files[0]; if (!f) return;
    try {
      const d = JSON.parse(await f.text());
      if (d.app !== 'handyman-business') throw new Error('bad');
      if (!confirm(`לשחזר ${d.clients.length} לקוחות ו-${d.jobs.length} עבודות? המידע הנוכחי יוחלף.`)) return;
      await wipeAll();
      for (const s of STORES) if (d[s] && d[s].length) await saveMany(s, d[s]);
      S.settings = { ...structuredClone(DEFAULTS), ...d.settings }; await saveSettings();
      toast('שוחזר', 'checkc'); go('#home');
    } catch (_) { toast('קובץ גיבוי לא תקין', 'alert'); }
  };
  $('#csv', el).onclick = () => {
    const ct = clientTypes();
    const head = ['תאריך', 'תאריך עברי', 'סטטוס', 'לקוח', 'טלפון', 'כתובת', 'מוצא', 'מקור', 'חדש/חוזר', 'עבודה', 'גבייה', 'חומרים', 'הוצאות נוספות', 'רווח גולמי', 'שולם', 'חוב', 'נכנסתי', 'שמתי באוטו', 'הערות'];
    const rows = [...S.jobs].sort((a, b) => a.date.localeCompare(b.date)).map(j => {
      const c = clientById(j.clientId) || {};
      return [j.date, hebDate(j.date), STATUS[j.status], c.name, c.phone, c.address, c.nationality, sourceOf(j), ct.get(j.id) === 'new' ? 'חדש' : 'חוזר', j.description, num(j.price), num(j.materials), num(j.extra), profitOf(j), paidOf(j), dueOf(j), j.tStart, j.tEnd, j.notes];
    });
    download(`עבודות-${today()}.csv`, '﻿' + [head, ...rows].map(r => r.map(v => `"${String(v ?? '').replace(/"/g, '""')}"`).join(',')).join('\r\n'), 'text/csv');
  };
  $('#wipe', el).onclick = async () => {
    if (!confirm('למחוק את כל הלקוחות, העבודות, הקניות והיומן? (כדאי לגבות קודם)')) return;
    if (prompt('כדי לאשר כתוב: מחק') !== 'מחק') return;
    await wipeAll(); toast('נמחק', 'trash'); go('#home');
  };
};

// ---------- הגדרות ----------
routes.settings = () => {
  const st = S.settings;
  const isIOS = /iPhone|iPad|iPod/.test(navigator.userAgent);
  const appUrl = location.href.split('#')[0].split('?')[0];
  const lists = [['sources', 'מקורות הגעה'], ['nationalities', 'מוצא לקוחות'], ['methods', 'אמצעי תשלום'], ['lostReasons', 'סיבות לאי-סגירה'],
    ['bizOutCats', 'קטגוריות הוצאה – עסק'], ['bizInCats', 'קטגוריות הכנסה – עסק'], ['personalOutCats', 'קטגוריות הוצאה – אישי'], ['personalInCats', 'קטגוריות הכנסה – אישי']];
  const iosHelp = `<ol class="steps small"><li>באייפון אי אפשר לזהות שיחה נכנסת אוטומטית (אפל לא מאפשרת זאת לאפליקציות).</li>
    <li>כשמישהו מתקשר: באפליקציית הטלפון לחץ והחזק על המספר ← <b>העתק</b>.</li><li>פתח את "העסק שלי" ← 📞 <b>מי מתקשר?</b> ← <b>הדבק מספר</b>. תראה מיד אם זה לקוח מוכר, כמה חייב, והיסטוריה – או לקוח חדש עם שאלות לבירור.</li></ol>`;
  const androidHelp = `<ol class="steps small"><li>התקן <b>MacroDroid</b> מחנות Play.</li><li>טריגר: <b>Call Incoming</b>. פעולה: <b>Open Website</b> עם הכתובת:<br><code>${esc(appUrl)}?phone=[call_number]</code></li><li>בכל שיחה נכנסת יפתח מסך הזיהוי.</li></ol>`;
  const el = app(`
    <div class="topnav">${backBtn('#more', 'עוד')}<div class="title">הגדרות</div><span></span></div>
    <form class="form" id="open">
      ${sectionLabel('יתרות פתיחה לתזרים')}
      <div class="fgroup"><label class="field"><span>תאריך יתרת הפתיחה</span><input type="date" name="openingDate" value="${st.openingDate || ''}"></label>
        <div class="field-row"><label class="field"><span>מזומן בעסק</span><input name="bizCash" inputmode="decimal" value="${st.opening.bizCash}"></label><label class="field"><span>חשבון עסקי</span><input name="bizBank" inputmode="decimal" value="${st.opening.bizBank}"></label></div>
        <label class="field"><span>יתרה אישית</span><input name="personal" inputmode="decimal" value="${st.opening.personal}"></label>
        <div class="field"><span class="flabel">מאיפה מתקזזים תשלומים שלא במזומן</span><div class="hint">תשלומים בביט / העברה / אשראי נחשבים כחשבון עסקי.</div></div></div>
      ${sectionLabel('כללי')}
      <div class="fgroup"><div class="field-row"><label class="field"><span>אחוז מעשר (0 = לא להציג)</span><input name="maaserPct" inputmode="decimal" value="${st.maaserPct}"></label><label class="field"><span>עיר</span><input name="city" value="${esc(st.city)}"></label></div>
        <div class="field"><span class="flabel">לוח שנה ברירת מחדל</span>${choiceHTML('cal', ['לועזי', 'עברי'], st.hebrewDefault ? 'עברי' : 'לועזי')}</div></div>
      <button class="btn primary block" style="margin-top:12px">שמור</button>
    </form>

    ${sectionLabel('רשימות')}
    <details class="card"><summary class="link-btn">עריכת רשימות (מקורות, מוצא, קטגוריות…)</summary>
      <form class="form" id="lists"><p class="small muted">פריט אחד בכל שורה.</p>
        ${lists.map(([k, l]) => `<div class="fgroup" style="margin-bottom:10px"><label class="field"><span>${l}</span><textarea name="${k}" rows="4">${esc(st[k].join('\n'))}</textarea></label></div>`).join('')}
        <button class="btn primary block">שמור רשימות</button></form></details>

    ${sectionLabel('זיהוי שיחה נכנסת')}
    <div class="card prose">${isIOS ? iosHelp : androidHelp}
      <details><summary class="link-btn">${isIOS ? 'הוראות לאנדרואיד' : 'הוראות לאייפון'}</summary>${isIOS ? androidHelp : iosHelp}</details>
      <a class="btn sm" href="#caller" style="margin-top:8px">נסה את מסך הזיהוי</a></div>

    ${sectionLabel('התקנה כאפליקציה')}
    <div class="card prose small muted"><p><b>אייפון (ספארי):</b> לחץ על כפתור השיתוף ← "הוסף למסך הבית" ← הוסף. מאותו רגע פותחים מהאייקון, והכל עובד גם בלי קליטה.</p>
      <p><b>אנדרואיד (כרום):</b> תפריט ⋮ ← "התקן אפליקציה".</p>
      <p>⚠️ באייפון, המידע של האפליקציה מהאייקון נפרד מהמידע בספארי. תמיד עבוד מהאייקון.</p></div>`);
  bindChoice(el);
  $('#open', el).onsubmit = async e => {
    e.preventDefault(); const E = e.target.elements;
    st.opening = { bizCash: num(E.bizCash.value), bizBank: num(E.bizBank.value), personal: num(E.personal.value) };
    st.openingDate = E.openingDate.value || '2026-01-01'; st.maaserPct = num(E.maaserPct.value);
    st.city = E.city.value.trim(); st.hebrewDefault = choiceVal(el, 'cal') === 'עברי';
    await saveSettings(); toast('נשמר');
  };
  $('#lists', el).onsubmit = async e => {
    e.preventDefault();
    for (const [k] of lists) { const v = e.target.elements[k].value.split('\n').map(s => s.trim()).filter(Boolean); if (v.length) st[k] = v; }
    await saveSettings(); toast('נשמר');
  };
};

// ---------- הפעלה ----------
function openAddMenu() {
  sheet(`<h2>מה להוסיף?</h2><ul class="action-list">
    <li><button data-go="#job/new?status=open"><span class="ai av1">${ic('phone')}</span><div><b>פנייה חדשה</b><div class="d">מישהו התקשר / שלח הודעה</div></div></button></li>
    <li><button data-go="#job/new"><span class="ai av2">${ic('checkc')}</span><div><b>עבודה שבוצעה</b><div class="d">כולל סכום, חומרים ותשלום</div></div></button></li>
    <li><button data-ev><span class="ai av0">${ic('calendar')}</span><div><b>אירוע ביומן</b><div class="d">תיאום עבודה, ביקור, קניות</div></div></button></li>
    <li><button data-buy><span class="ai av5">${ic('cart')}</span><div><b>קנייה בחנות</b><div class="d">חנות, סכום, איך שילמתי, זמן נסיעה</div></div></button></li>
    <li><button data-cash><span class="ai av4">${ic('wallet')}</span><div><b>הוצאה / הכנסה בתזרים</b><div class="d">דלק, ביטוח, משיכה לפרטי…</div></div></button></li></ul>`, d => {
    $$('[data-go]', d).forEach(b => b.onclick = () => { closeSheet(); go(b.dataset.go); });
    $('[data-ev]', d).onclick = () => { closeSheet(); eventSheet({ date: (location.hash.match(/d=([\d-]+)/) || [])[1] || today() }); };
    $('[data-buy]', d).onclick = () => { closeSheet(); purchaseSheet(); };
    $('[data-cash]', d).onclick = () => { closeSheet(); moneyDialog({ ledger: 'biz', kind: 'out', date: today() }); };
  });
}

(async function start() {
  try { await loadAll(); } catch (e) { document.getElementById('app').innerHTML = `<p class="alert-soft bad">שגיאה בטעינת הנתונים: ${esc(e.message)}</p>`; return; }
  if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});
  $('#dlg').addEventListener('click', e => { if (e.target === e.currentTarget) closeSheet(); });
  $('#tabbar').innerHTML = `<a data-tab="home" href="#home">${ic('home')}בית</a><a data-tab="cal" href="#cal">${ic('calendar')}יומן</a>
    <button class="plus" aria-label="הוספה">${ic('plus')}</button><a data-tab="clients" href="#clients">${ic('users')}לקוחות</a><a data-tab="more" href="#more">${ic('grid')}עוד</a>`;
  $('#tabbar .plus').onclick = openAddMenu;
  const qp = new URLSearchParams(location.search).get('phone');
  if (qp) history.replaceState(null, '', location.pathname + '#caller?phone=' + encodeURIComponent(qp));
  window.addEventListener('hashchange', () => { closeSheet(); render(); });
  render();
  if ('serviceWorker' in navigator && location.protocol !== 'file:') navigator.serviceWorker.register('sw.js').catch(() => {});
})();

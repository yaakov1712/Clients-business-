'use strict';

/* =========================================================
   views-main.js – בית, עבודות, טופס עבודה, לקוחות, חובות, מתקשר, השלמת נתונים
   ========================================================= */

// ---------- טיימר (הגעתי ללקוח / יצאתי לקניות) ----------
async function startTimer(kind) {
  S.settings.timer = { kind, start: Date.now() };
  await saveSettings(); toast(kind === 'job' ? 'הטיימר התחיל – בהצלחה!' : 'נסיעה טובה – הטיימר רץ', 'clock'); render();
}
async function cancelTimer() { S.settings.timer = null; await saveSettings(); render(); }
async function finishTimer() {
  const t = S.settings.timer; if (!t) return;
  const s = new Date(t.start), date = ymd(s), a = `${pad(s.getHours())}:${pad(s.getMinutes())}`, b = nowHM();
  S.settings.timer = null; await saveSettings();
  if (t.kind === 'job') go(`#job/new?date=${date}&tStart=${a}&tEnd=${b}`);
  else purchaseSheet({ date, leave: a, back: b });
}
const fmtElapsed = ms => { const s = Math.floor(ms / 1000); return `${pad(Math.floor(s / 3600))}:${pad(Math.floor(s / 60) % 60)}:${pad(s % 60)}`; };

function timerCard() {
  const t = S.settings.timer;
  if (!t) return `<div class="card"><div class="card-title"><span>מעקב זמן</span><span class="small faint">נכנסתי ← שמתי באוטו</span></div>
    <div class="btn-row"><button class="btn primary" id="t-job">${ic('play', 'sm')}הגעתי ללקוח</button><button class="btn" id="t-trip">${ic('truck', 'sm')}יצאתי לקניות</button></div></div>`;
  const s = new Date(t.start);
  return `<div class="card timer-run"><div class="card-title"><span>${t.kind === 'job' ? 'אצל לקוח' : 'בדרך לחנות'} · מ-${pad(s.getHours())}:${pad(s.getMinutes())}</span><span class="pill warn">רץ</span></div>
    <div class="timer-clock num" id="t-clock">${fmtElapsed(Date.now() - t.start)}</div>
    <div class="btn-row"><button class="btn primary" id="t-done">${ic('check', 'sm')}${t.kind === 'job' ? 'סיימתי – שמתי באוטו' : 'חזרתי'}</button><button class="btn danger" id="t-cancel" style="flex:0 0 auto">ביטול</button></div></div>`;
}

// ---------- בית ----------
function periodJobs(date, unit, heb) {
  const key = periodOf(date, unit, heb).key;
  return S.jobs.filter(j => periodOf(j.date, unit, heb).key === key);
}
function prevPeriodDate(date, unit, heb) {
  const key = periodOf(date, unit, heb).key;
  let d = date;
  for (let i = 0; i < 400; i++) { d = addDays(d, -1); if (periodOf(d, unit, heb).key !== key) return d; }
  return d;
}
function summarize(jobs) {
  const closed = jobs.filter(j => j.status === 'closed');
  return {
    leads: jobs.length, closed: closed.length,
    revenue: sum(closed, j => num(j.price)), materials: sum(closed, j => num(j.materials) + num(j.extra)),
    profit: sum(closed, profitOf), due: sum(closed, dueOf),
  };
}

function bindTimer(el) {
  const st = S.settings, bind = (id, fn) => { const b = $(id, el); if (b) b.onclick = fn; };
  bind('#t-job', () => startTimer('job')); bind('#t-trip', () => startTimer('trip'));
  bind('#t-done', finishTimer); bind('#t-cancel', () => confirm('לבטל את הטיימר?') && cancelTimer());
  const clock = $('#t-clock', el);
  if (clock && st.timer) { const iv = setInterval(() => { clock.textContent = fmtElapsed(Date.now() - st.timer.start); }, 1000); return () => clearInterval(iv); }
  return null;
}

routes.home = () => {
  const st = S.settings, t = today(), heb = st.hebrewDefault;
  const hr = new Date().getHours();
  const greet = hr < 5 ? 'לילה טוב' : hr < 12 ? 'בוקר טוב' : hr < 17 ? 'צהריים טובים' : hr < 21 ? 'ערב טוב' : 'לילה טוב';
  const hol = holidayOf(t);
  const cur = periodOf(t, 'month', heb), prevDate = prevPeriodDate(t, 'month', heb), prev = periodOf(prevDate, 'month', heb);
  const ms = summarize(periodJobs(t, 'month', heb)), ps = summarize(periodJobs(prevDate, 'month', heb));
  const delta = ps.profit ? Math.round((ms.profit - ps.profit) / ps.profit * 100) : null;
  const day = summarize(S.jobs.filter(j => j.date === t));
  const wk = summarize(periodJobs(t, 'week', heb));
  const todo = todoItems(), todoN = todo.jobs.length + todo.clients.length + todo.trips.length;
  const debts = S.jobs.filter(j => dueOf(j) > 0);
  const open = S.jobs.filter(j => j.status === 'open').sort(byDateDesc);
  const recent = [...S.jobs].filter(j => j.status !== 'open').sort(byDateDesc).slice(0, 6);
  const backupDays = st.lastBackup ? Math.floor((Date.now() - st.lastBackup) / 864e5) : null;
  const ci = calendarItems(t), agenda = [...ci.timed, ...ci.allDay].slice(0, 4);
  const hasData = S.jobs.length > 0;

  const el = app(`
    <div class="head"><div><h1>${greet}</h1><div class="sub">${fmtLong(t)} · ${hebDate(t)}${hol ? ' · ' + esc(hol.name) : ''}</div></div>
      <div class="head-actions"><a class="round" href="#caller" title="מי מתקשר?">${ic('incoming')}</a></div></div>

    ${hasData ? `<a class="hero" href="#reports?u=month&cal=${heb ? 'h' : 'g'}" style="display:block;color:#fff">
      <div class="label">רווח גולמי · ${esc(cur.label)}</div>
      <div class="big num">${money(ms.profit)}</div>
      ${delta !== null ? `<span class="delta">${delta >= 0 ? '▲' : '▼'} ${Math.abs(delta)}% מ${esc(prev.label)}</span>` : `<span class="delta">${ms.closed} עבודות החודש</span>`}
      <div class="hero-stats"><div><b class="num">${money(ms.revenue)}</b><span>הכנסות</span></div><div><b class="num">${money(ms.materials)}</b><span>חומרים</span></div><div><b class="num">${ms.closed}</b><span>עבודות · ${ms.leads} פניות</span></div></div></a>` : ''}

    ${timerCard()}

    ${hasData ? `<div class="tiles">${kpiTile('היום', money(day.profit), day.profit ? 'good' : '', `${day.closed} עבודות`)}${kpiTile('השבוע', money(wk.profit), wk.profit ? 'good' : '', `${wk.closed} עבודות · ${wk.leads} פניות`)}</div>` : ''}

    ${debts.length ? banner('bad', 'wallet', `${debts.length} לקוחות לא שילמו`, `חוב פתוח ${money(sum(debts, dueOf))}`, '#debts') : ''}
    ${todoN ? banner('info', 'edit', `${todoN} פריטים להשלמה`, 'נתונים שלא מילאת – אפשר להשלים בקלות, אחד אחרי השני', '#fill') : ''}
    ${hasData && (backupDays === null || backupDays > 7) ? banner('warn', 'shield', 'מומלץ לגבות', backupDays === null ? 'עוד לא נעשה גיבוי' : `הגיבוי האחרון לפני ${backupDays} ימים`, '#backup') : ''}

    ${agenda.length ? `<div class="card flush"><div class="card-title"><span>היום ביומן</span><a class="small" href="#cal?v=day&d=${t}">פתח ${ic('left', 'sm')}</a></div><ul class="list">${agenda.map(i => `<li><a class="row" href="#cal?v=day&d=${t}"><span class="cdot" style="background:${i.color}"></span><div class="main"><div class="t"><span class="nm">${esc(i.title)}</span></div><div class="d">${i.timeLabel || 'כל היום'}${i.sub ? ' · ' + esc(i.sub) : ''}</div></div></a></li>`).join('')}</ul></div>` : ''}

    <div class="quick">
      <a href="#job/new?status=open"><span class="qi c1">${ic('phone', 'lg')}</span>פנייה חדשה</a>
      <a href="#job/new"><span class="qi c2">${ic('checkc', 'lg')}</span>עבודה שבוצעה</a>
      <a href="#materials"><span class="qi c3">${ic('cart', 'lg')}</span>חומרים</a>
      <a href="#cal"><span class="qi c4">${ic('calendar', 'lg')}</span>יומן</a>
      <a href="#reports"><span class="qi c3">${ic('chart', 'lg')}</span>סיכומים</a>
      <a href="#cash/biz"><span class="qi c2">${ic('wallet', 'lg')}</span>תזרים</a>
      <a href="#hours"><span class="qi c1">${ic('clock', 'lg')}</span>שעות</a>
      <a href="#debts"><span class="qi c4">${ic('card', 'lg')}</span>חובות</a>
    </div>

    ${open.length ? `<div class="card flush"><div class="card-title"><span>פניות בבירור (${open.length})</span></div><ul class="list">${open.slice(0, 6).map(j => jobRow(j)).join('')}</ul>${open.length > 6 ? '<div style="padding:8px 16px"><a href="#jobs?f=open">לכל הפניות ←</a></div>' : ''}</div>` : ''}

    <div class="card flush"><div class="card-title"><span>אחרונות</span><a class="small" href="#jobs">הכל ${ic('left', 'sm')}</a></div>${recent.length ? `<ul class="list">${recent.map(j => jobRow(j)).join('')}</ul>` :
      emptyState('tool', 'מתחילים!', 'לחץ על ＋ כדי להוסיף עבודה, או ייבא את הטבלה שלך מאקסל.', '<div class="btn-row" style="margin-top:14px"><a class="btn primary" href="#import">ייבוא מאקסל</a><a class="btn" href="#job/new">עבודה חדשה</a></div>')}</div>
  `);

  return bindTimer(el);
};

// ---------- רשימת עבודות ----------
routes.jobs = (_, p) => {
  const f = p.get('f') || 'all', q = (p.get('q') || '').trim().toLowerCase();
  const filters = { all: 'הכל', closed: 'נסגרו', open: 'בבירור', lost: 'לא נסגרו', unpaid: 'לא שולם', todo: 'להשלמה' };
  let jobs = S.jobs.filter(j => f === 'all' ? true : f === 'unpaid' ? dueOf(j) > 0 : f === 'todo' ? missingJob(j).length : j.status === f);
  if (q) jobs = jobs.filter(j => {
    const c = clientById(j.clientId) || {};
    return [c.name, c.phone, c.address, j.description, j.notes, j.sourceRaw].some(v => String(v || '').toLowerCase().includes(q));
  });
  jobs.sort(byDateDesc);
  const shown = jobs.slice(0, 250);
  let html = '', day = '';
  for (const j of shown) {
    if (j.date !== day) {
      if (day) html += '</ul></div>';
      day = j.date;
      const dj = jobs.filter(x => x.date === day && x.status === 'closed');
      html += `<div class="day-head"><span>${fmtLong(day)} · ${hebDM(day)}</span><span class="num">${dj.length ? 'רווח ' + money(sum(dj, profitOf)) : ''}</span></div><div class="card flush"><ul class="list">`;
    }
    html += jobRow(j, { noDate: true });
  }
  if (day) html += '</ul></div>';
  const el = app(`
    <div class="head"><div><h1>לקוחות</h1></div><div class="head-actions"><a class="round brand" href="#job/new">${ic('plus')}</a></div></div>
    ${segHTML([['clients', 'לקוחות', '#clients'], ['jobs', 'עבודות', '#jobs']], 'jobs')}
    <div class="search-box">${ic('search', 'sm')}<input type="search" placeholder="חיפוש לפי שם, כתובת, עבודה…" value="${esc(p.get('q') || '')}"></div>
    <div class="pills">${Object.entries(filters).map(([k, v]) => `<a class="${k === f ? 'on' : ''}" href="#jobs?f=${k}">${v}</a>`).join('')}</div>
    ${html || emptyState('search', 'לא נמצאו תוצאות')}
    ${jobs.length > shown.length ? `<p class="muted small" style="text-align:center">מוצגות 250 מתוך ${jobs.length} – השתמש בחיפוש</p>` : ''}`);
  const s = $('input', el);
  s.addEventListener('change', () => go(`#jobs?f=${f}&q=${encodeURIComponent(s.value)}`));
};

// ---------- טופס פנייה / עבודה ----------
routes.job = (id, p) => {
  const isNew = !id || id === 'new';
  const orig = isNew ? null : S.jobs.find(x => x.id === id);
  if (!isNew && !orig) return app(emptyState('alert', 'העבודה לא נמצאה', '', `<a class="btn" href="#jobs" style="margin-top:12px">לרשימה</a>`));
  const st = S.settings;
  const j = isNew
    ? { id: uid(), date: p.get('date') || today(), status: p.get('status') || 'closed', payments: [], tStart: p.get('tStart') || '', tEnd: p.get('tEnd') || '', description: p.get('desc') || '' }
    : structuredClone(orig);
  let selected = j.clientId ? clientById(j.clientId) : p.get('client') ? clientById(p.get('client')) : null;
  const pays = (j.payments || []).map(x => ({ ...x }));
  const miss = isNew ? [] : missingJob(j);
  const descs = [...new Set(S.jobs.map(x => x.description).filter(Boolean))].slice(-300);
  const addrs = [...new Set(S.clients.map(x => x.address).filter(Boolean))];
  const ctLabels = { '': 'אוטומטי', new: 'חדש', returning: 'חוזר' };
  const m = k => (miss.includes(k) ? ' miss' : '');

  const el = app(`
    <div class="topnav"><button class="link-btn" id="cancel">ביטול</button><div class="title">${isNew ? (j.status === 'open' ? 'פנייה חדשה' : 'עבודה חדשה') : 'עריכה'}</div><button class="link-btn strong" id="save">שמור</button></div>
    ${miss.length ? `<div class="alert-soft">${ic('info', 'sm')} חסר מידע: <b>${miss.map(k => MISS_LABEL[k]).join(' · ')}</b></div>` : ''}
    <form id="jf" class="form" data-status="${j.status}" ${j.source === 'המלצה' ? 'data-ref' : ''} autocomplete="off">
      <div class="seg status">${Object.entries(STATUS).map(([k, v]) => `<button type="button" data-v="${k}" class="${k === j.status ? 'on' : ''}">${v}</button>`).join('')}</div>

      <div class="fgroup">
        <label class="field${m('date')}"><span>תאריך${j.dateApprox ? ' – משוער, תקן אם צריך' : ''}</span><input type="date" name="date" value="${j.date}" required></label>
        <div class="field" style="padding-top:0"><span id="hebd" class="hint" style="margin:0">${hebDate(j.date)}</span></div>
      </div>

      <div class="section-label">לקוח</div>
      <div id="cbadge"></div>
      <div class="fgroup">
        <div class="field ac-wrap"><span>שם (התחל להקליד – יקפוץ מהזיכרון)</span><input name="cname" value="${esc(p.get('name') || '')}"></div>
        <label class="field"><span>טלפון</span><input name="phone" type="tel" inputmode="tel" value="${esc(p.get('phone') || '')}"></label>
        <div id="phone-hint"></div>
        <label class="field"><span>כתובת</span><input name="address" list="dl-addr" placeholder="רחוב ומספר, ${esc(st.city)}"></label>
        <datalist id="dl-addr">${addrs.map(a => `<option value="${esc(a)}">`).join('')}</datalist>
        <div class="field"><span class="flabel">מוצא</span>${choiceHTML('nationality', st.nationalities, '').replace('data-choice', 'data-allow-off data-choice')}</div>
        <div class="field${m('source')}"><span class="flabel">מאיפה הגיע</span>${choiceHTML('source', st.sources, j.source || '').replace('data-choice', 'data-allow-off data-choice')}</div>
        <label class="field ref-only"><span>מי המליץ?</span><input name="referredBy" list="dl-clients" value="${esc(j.referredBy || '')}"></label>
        <datalist id="dl-clients">${S.clients.map(c => `<option value="${esc(c.name)}">`).join('')}</datalist>
        <div class="field"><span class="flabel">חדש / חוזר</span>${choiceHTML('ctype', Object.values(ctLabels), ctLabels[j.ctype || ''])}</div>
      </div>

      <div class="section-label">העבודה</div>
      <div class="fgroup">
        <label class="field${m('description')}"><span>מה עשיתי / מה צריך לעשות</span><input name="description" value="${esc(j.description || '')}"></label>
        <div class="field big${m('price')}"><span class="flabel" id="price-l">${j.status === 'open' ? 'הצעת מחיר' : 'כמה גביתי'}</span><div class="money-in"><i>₪</i><input name="price" inputmode="decimal" value="${j.price || ''}" placeholder="0"></div></div>
        <div class="field-row closed-only"><label class="field"><span>חומרים</span><div class="money-in"><i>₪</i><input name="materials" inputmode="decimal" value="${j.materials || ''}" placeholder="0"></div></label>
        <label class="field"><span>הוצאות נוספות</span><div class="money-in"><i>₪</i><input name="extra" inputmode="decimal" value="${j.extra || ''}" placeholder="0"></div></label></div>
      </div>
      <div class="profit-card closed-only" id="profit-card"><span>רווח גולמי</span><b class="num" id="profit"></b></div>

      <div class="closed-only">
        <div class="section-label">שעות</div>
        <div class="fgroup">
          <div class="field-row"><label class="field"><span>נכנסתי ${nowBtn('tStart')}</span><input type="time" name="tStart" value="${j.tStart || ''}"></label>
          <label class="field"><span>שמתי באוטו ${nowBtn('tEnd')}</span><input type="time" name="tEnd" value="${j.tEnd || ''}"></label></div>
          <label class="field" id="dur-wrap"><span>משך (אם לא רשמת שעות) – למשל 2:30</span><input name="dur" inputmode="decimal" value="${j.dur ? Math.floor(j.dur / 60) + ':' + pad(j.dur % 60) : ''}" placeholder="שעות:דקות"></label>
          <div class="field" style="padding-top:0"><span class="hint" id="durtxt" style="margin:0"></span></div>
        </div>

        <div class="section-label">תשלום</div>
        <div class="fgroup${m('method')}" style="padding-bottom:12px">
          <div class="seg" style="margin:12px 0 4px" id="payseg"><button type="button" data-v="full">שולם במלואו</button><button type="button" data-v="partial">חלקי</button><button type="button" data-v="none">עוד לא שולם</button></div>
          <div class="field" style="border:0;padding-bottom:0"><span class="flabel">איך שולם</span>${choiceHTML('paymethod', st.methods, '')}</div>
          <div id="payrows"></div>
          <div class="small" id="paystate" style="padding:6px 0 0"></div>
        </div>
      </div>
      <div class="lost-only"><div class="fgroup"><div class="field"><span class="flabel">למה לא נסגר?</span>${choiceHTML('lostReason', st.lostReasons, j.lostReason || '')}</div></div></div>

      <div class="section-label">הערות</div>
      <div class="fgroup"><label class="field"><span>הערות</span><textarea name="notes">${esc(j.notes || '')}</textarea></label></div>
      ${!isNew && (j.sourceRaw || j.imported) ? `<p class="small faint" style="padding:0 6px">${j.sourceRaw ? 'כפי שנכתב בטבלה: ' + esc(j.sourceRaw) : ''}${j.imported ? ' · יובא מהאקסל' : ''}</p>` : ''}
      <div class="form-actions"><button class="btn primary block" type="submit">שמור</button>
        ${isNew ? '' : '<button type="button" class="del-link" id="del">מחק</button>'}</div>
    </form>`);

  const f = $('#jf', el), E = f.elements, st2 = S.settings;
  const bindings = [];
  bindChoice(el, (name, v) => {
    if (name === 'source') f.toggleAttribute('data-ref', v === 'המלצה');
    if (name === 'paymethod' && v) { pays.forEach(x => (x.method = v)); renderPays(); }
  });
  bindNow(el);
  clientAC(el, E.cname, c => fillClient(c));
  bindDatalist(E.description, descs);

  function fillClient(c) {
    selected = c;
    E.cname.value = c.name || ''; E.phone.value = c.phone || ''; E.address.value = c.address || '';
    setChoice(el, 'nationality', c.nationality || '');
    if (!choiceVal(el, 'source') && c.origin) { setChoice(el, 'source', c.origin); f.toggleAttribute('data-ref', c.origin === 'המלצה'); }
    if (c.referredBy && !E.referredBy.value) E.referredBy.value = c.referredBy;
    refreshBadge();
  }
  function refreshBadge() {
    const box = $('#cbadge', el);
    if (!selected) { box.innerHTML = E.cname.value || E.phone.value ? `<div class="cbadge new">${avatar(E.cname.value || '+')}<div class="main"><b>לקוח חדש</b><br>יישמר ברשימת הלקוחות</div></div>` : ''; return; }
    const s = clientStats(selected.id), prev = s.jobs.filter(x => x.id !== j.id);
    box.innerHTML = `<div class="cbadge">${avatar(selected.name)}<div class="main"><b>${prev.length ? 'לקוח חוזר' : 'לקוח קיים'}</b> · ${prev.length} פניות קודמות · ${money(s.revenue)}
      ${s.due > 0 ? `<br><b style="color:var(--bad)">חוב פתוח ${money(s.due)}</b>` : ''}${selected.notes ? `<br><span class="small">${esc(selected.notes)}</span>` : ''}</div>
      <button type="button" class="link-btn" id="unlink">${ic('x', 'sm')}אחר</button></div>`;
    $('#unlink', box).onclick = () => { selected = null; E.cname.value = ''; E.phone.value = ''; E.address.value = ''; setChoice(el, 'nationality', ''); refreshBadge(); E.cname.focus(); };
  }
  E.cname.addEventListener('input', refreshBadge);
  E.phone.addEventListener('input', () => {
    const hint = $('#phone-hint', el);
    const mt = findByPhone(E.phone.value).filter(c => !selected || c.id !== selected.id);
    hint.innerHTML = mt.length ? `<div class="field"><div class="alert-soft" style="margin:0">המספר שייך ל<b>${esc(mt[0].name)}</b> <button type="button" class="btn sm" id="pick">זה הוא</button></div></div>` : '';
    if (mt.length) $('#pick', hint).onclick = () => { fillClient(mt[0]); hint.innerHTML = ''; };
    refreshBadge();
  });
  $$('.seg.status button', el).forEach(b => b.onclick = () => {
    $$('.seg.status button', el).forEach(x => x.classList.remove('on')); b.classList.add('on');
    f.dataset.status = b.dataset.v; $('#price-l', el).textContent = b.dataset.v === 'open' ? 'הצעת מחיר' : 'כמה גביתי';
  });
  E.date.addEventListener('change', () => { if (E.date.value) $('#hebd', el).textContent = hebDate(E.date.value); });

  const parseDur = s => { s = String(s || '').trim(); if (!s) return 0; if (s.includes(':')) { const [h, mm] = s.split(':'); return num(h) * 60 + num(mm); } return Math.round(num(s) * 60); };
  function calc() {
    const pr = num(E.price.value), pf = pr - num(E.materials.value) - num(E.extra.value);
    $('#profit', el).textContent = money(pf);
    $('#profit-card', el).classList.toggle('neg', pf < 0);
    const paid = sum(pays, x => num(x.amount));
    $('#paystate', el).innerHTML = pr <= 0 ? '' : paid >= pr ? pill('שולם במלואו', 'good') : paid > 0 ? pill(`שולם ${money(paid)} · נשאר ${money(pr - paid)}`, 'warn') : pill('עוד לא שולם', 'bad');
    const seg = pr > 0 && paid >= pr ? 'full' : paid > 0 ? 'partial' : (pays.length || pr > 0) ? 'none' : '';
    $$('#payseg button', el).forEach(b => b.classList.toggle('on', b.dataset.v === seg));
    const mins = E.tStart.value && E.tEnd.value ? spanMin(E.tStart.value, E.tEnd.value) : parseDur(E.dur.value);
    $('#durtxt', el).textContent = mins ? `משך העבודה: ${fmtDur(mins)}${pf > 0 ? ' · ' + money(pf / (mins / 60)) + ' לשעה' : ''}` : '';
    $('#dur-wrap', el).style.display = E.tStart.value && E.tEnd.value ? 'none' : '';
  }
  function renderPays() {
    $('#payrows', el).innerHTML = pays.map((x, i) => `<div class="payrow" data-i="${i}"><input type="date" data-k="date" value="${x.date || ''}"><input data-k="amount" inputmode="decimal" value="${x.amount}" placeholder="סכום">
      <select data-k="method">${opts(st2.methods, x.method)}</select><button type="button" class="icon-x" data-del>${ic('x', 'sm')}</button></div>`).join('');
    calc();
  }
  $('#payrows', el).addEventListener('input', e => { const row = e.target.closest('[data-i]'); if (row && e.target.dataset.k) { pays[row.dataset.i][e.target.dataset.k] = e.target.value; calc(); } });
  $('#payrows', el).addEventListener('click', e => { const d = e.target.closest('[data-del]'); if (d) { pays.splice(d.closest('[data-i]').dataset.i, 1); renderPays(); } });
  const remaining = () => Math.max(0, num(E.price.value) - sum(pays, x => num(x.amount)));
  $$('#payseg button', el).forEach(b => b.onclick = () => {
    const v = b.dataset.v, method = choiceVal(el, 'paymethod') || (pays[0] && pays[0].method) || st2.methods[0];
    if (v === 'none') pays.length = 0;
    else if (v === 'full') { if (num(E.price.value) <= 0) return toast('קודם רשום כמה גבית', 'alert'); if (remaining() > 0) pays.push({ date: E.date.value || today(), amount: remaining(), method }); }
    else pays.push({ date: E.date.value || today(), amount: '', method });
    renderPays();
  });
  ['price', 'materials', 'extra', 'tStart', 'tEnd', 'dur'].forEach(k => E[k].addEventListener('input', calc));
  $('#cancel', el).onclick = () => goBack('#home');
  $('#save', el).onclick = () => f.requestSubmit();

  if (selected) fillClient(selected);
  else if (p.get('phone')) E.phone.dispatchEvent(new Event('input'));
  if (!isNew) setChoice(el, 'source', j.source || '');
  if (pays[0] && pays[0].method) setChoice(el, 'paymethod', pays[0].method);
  renderPays(); refreshBadge();
  if (isNew && !selected && !E.cname.value) setTimeout(() => E.cname.focus(), 60);

  if (!isNew) $('#del', el).onclick = async () => { if (!confirm('למחוק את העבודה?')) return; await remove('jobs', j.id); toast('נמחק', 'trash'); goBack('#jobs'); };

  f.addEventListener('submit', async e => {
    e.preventDefault();
    const name = E.cname.value.trim(), phone = E.phone.value.trim(), srcV = choiceVal(el, 'source');
    if (!name && !phone) return toast('צריך לפחות שם או טלפון', 'alert');
    let c = selected ? { ...selected } : null;
    if (!c) {
      const ex = findByPhone(phone)[0] || (name && S.clients.find(x => normName(x.name) === normName(name) && !normPhone(phone)));
      if (ex && confirm(`כבר קיים לקוח "${ex.name}"${ex.phone ? ' (' + ex.phone + ')' : ''}. לשייך אליו?`)) c = { ...ex };
    }
    if (!c) c = { id: uid(), origin: srcV, referredBy: E.referredBy.value.trim() };
    Object.assign(c, { name: name || phone, phone, address: E.address.value.trim(), nationality: choiceVal(el, 'nationality') });
    if (!c.origin) c.origin = srcV;
    if (!c.referredBy && srcV === 'המלצה') c.referredBy = E.referredBy.value.trim();
    await save('clients', c);
    const ctRev = Object.fromEntries(Object.entries(ctLabels).map(([k, v]) => [v, k]));
    const hasTimes = E.tStart.value && E.tEnd.value;
    Object.assign(j, {
      date: E.date.value, status: f.dataset.status, clientId: c.id, source: srcV,
      referredBy: srcV === 'המלצה' ? E.referredBy.value.trim() : '', ctype: ctRev[choiceVal(el, 'ctype')] || '',
      description: E.description.value.trim(), price: num(E.price.value), materials: num(E.materials.value), extra: num(E.extra.value),
      tStart: E.tStart.value, tEnd: E.tEnd.value, dur: hasTimes ? 0 : parseDur(E.dur.value),
      lostReason: f.dataset.status === 'lost' ? choiceVal(el, 'lostReason') : '', notes: E.notes.value.trim(),
      payments: f.dataset.status === 'closed' ? pays.filter(x => num(x.amount) > 0).map(x => ({ date: x.date || E.date.value, amount: num(x.amount), method: x.method })) : [],
    });
    if (j.imported) j.edited = true;
    j.dateApprox = false;
    await save('jobs', j);
    const evId = p.get('event');
    if (evId) { const ev = S.events.find(x => x.id === evId); if (ev) { ev.jobId = j.id; await save('events', ev); } }
    toast('נשמר', 'check');
    goBack('#jobs');
  });
};

// ---------- לקוחות ----------
routes.clients = (_, p) => {
  const q = normName(p.get('q'));
  const stats = new Map(S.clients.map(c => [c.id, clientStats(c.id)]));
  const nq = normPhone(q);
  const list = S.clients.filter(c => !q || [c.name, c.phone, c.address, c.nationality, c.origin].some(v => normName(v).includes(q)) || (nq.length >= 3 && normPhone(c.phone).includes(nq)))
    .sort((a, b) => (stats.get(b.id).last || '').localeCompare(stats.get(a.id).last || ''));
  const el = app(`
    <div class="head"><div><h1>לקוחות</h1></div><div class="head-actions"><a class="round brand" href="#client/new">${ic('plus')}</a></div></div>
    ${segHTML([['clients', 'לקוחות', '#clients'], ['jobs', 'עבודות', '#jobs']], 'clients')}
    <div class="search-box">${ic('search', 'sm')}<input type="search" placeholder="חיפוש שם, טלפון, כתובת, מוצא…" value="${esc(p.get('q') || '')}"></div>
    <div class="small muted" style="margin:0 6px 8px">${list.length} לקוחות${q ? '' : ' · לפי פעילות אחרונה'}</div>
    <div class="card flush">${list.length ? `<ul class="list">${list.slice(0, 300).map(c => {
      const s = stats.get(c.id);
      return `<li><a class="row" href="#client/${c.id}">${avatar(c.name)}<div class="main"><div class="t"><span class="nm">${esc(c.name)}</span>${c.nationality ? pill(esc(c.nationality)) : ''}</div>
        <div class="d">${esc([c.phone, c.address].filter(Boolean).join(' · ') || (s.last ? 'עבודה אחרונה ' + fmtDM(s.last) : ''))}</div></div>
        <div class="end">${s.due > 0 ? `<div class="a amount-out num" style="color:var(--bad)">חוב ${money(s.due)}</div>` : `<div class="a num">${money(s.revenue)}</div>`}<div class="p">${s.closed} עבודות</div></div></a></li>`;
    }).join('')}</ul>` : emptyState('users', 'אין לקוחות עדיין', 'לקוחות נוספים אוטומטית כשרושמים פנייה או עבודה.')}</div>`);
  const s = $('input', el);
  s.addEventListener('change', () => go('#clients?q=' + encodeURIComponent(s.value)));
};

function clientFormHTML(c) {
  const st = S.settings;
  return `<form id="cf" class="form">
    <div class="fgroup">
      <label class="field"><span>שם</span><input name="cname" value="${esc(c.name || '')}" required></label>
      <div class="field-row"><label class="field"><span>טלפון</span><input name="phone" type="tel" value="${esc(c.phone || '')}"></label>
      <label class="field"><span>טלפון נוסף</span><input name="phone2" type="tel" value="${esc(c.phone2 || '')}"></label></div>
      <label class="field"><span>כתובת</span><input name="address" value="${esc(c.address || '')}"></label>
      <div class="field"><span class="flabel">מוצא</span>${choiceHTML('nationality', st.nationalities, c.nationality || '').replace('data-choice', 'data-allow-off data-choice')}</div>
      <div class="field"><span class="flabel">מאיפה הגיע</span>${choiceHTML('origin', st.sources, c.origin || '').replace('data-choice', 'data-allow-off data-choice')}</div>
      <label class="field"><span>מי המליץ</span><input name="referredBy" value="${esc(c.referredBy || '')}"></label>
      <label class="field"><span>הערות (קוד בניין, קומה, איך לדבר איתו…)</span><textarea name="notes">${esc(c.notes || '')}</textarea></label>
    </div>
    <div class="form-actions"><button class="btn primary block">שמור לקוח</button></div></form>`;
}
function bindClientForm(root, c, after) {
  bindChoice(root);
  $('#cf', root).addEventListener('submit', async e => {
    e.preventDefault();
    const E = e.target.elements;
    Object.assign(c, { name: E.cname.value.trim(), phone: E.phone.value.trim(), phone2: E.phone2.value.trim(), address: E.address.value.trim(),
      nationality: choiceVal(root, 'nationality'), origin: choiceVal(root, 'origin'), referredBy: E.referredBy.value.trim(), notes: E.notes.value.trim() });
    await save('clients', c); toast('הלקוח נשמר'); after(c);
  });
}

routes.client = id => {
  if (!id || id === 'new') {
    const c = { id: uid() };
    const el = app(`<div class="topnav">${backBtn('#clients')}<div class="title">לקוח חדש</div><span></span></div>${clientFormHTML(c)}`);
    return bindClientForm(el, c, c2 => go('#client/' + c2.id));
  }
  const c = clientById(id);
  if (!c) return app(emptyState('alert', 'הלקוח לא נמצא'));
  const s = clientStats(id);
  const msg = `שלום ${c.name}, תזכורת ידידותית לגבי תשלום על העבודה – יתרה לתשלום ${money(s.due)}. תודה!`;
  const el = app(`
    <div class="topnav">${backBtn('#clients', 'לקוחות')}<div class="title"></div><button class="link-btn" id="edit">${ic('edit', 'sm')}עריכה</button></div>
    <div class="profile">${avatar(c.name, 'xl')}<h1>${esc(c.name)}</h1>
      <div class="meta">${esc(c.address || 'אין כתובת')}${c.nationality ? ' · ' + esc(c.nationality) : ''}</div>
      <div class="meta">הגיע דרך ${esc(c.origin || '—')}${c.referredBy ? ` (${esc(c.referredBy)})` : ''}</div>
      <div class="actions4">
        ${c.phone ? `<a href="tel:${esc(c.phone)}"><span class="ai">${ic('phone')}</span>חייג</a><a href="${waLink(c.phone)}" target="_blank"><span class="ai">${ic('message')}</span>ווצאפ</a>` : ''}
        ${c.address ? `<a href="${wazeLink(c.address + ' ' + S.settings.city)}" target="_blank"><span class="ai">${ic('nav')}</span>ווייז</a>` : ''}
        <a href="#job/new?client=${c.id}"><span class="ai">${ic('plus')}</span>עבודה</a>
        ${s.due > 0 && c.phone ? `<a class="danger" href="${waLink(c.phone, msg)}" target="_blank"><span class="ai">${ic('wallet')}</span>תזכורת</a>` : ''}
      </div></div>
    ${c.notes ? `<div class="card"><span class="small muted">הערות</span><div>${esc(c.notes)}</div></div>` : ''}
    ${missingClient(c).length ? `<div class="alert-soft">${ic('info', 'sm')} חסר: <b>${missingClient(c).map(k => CMISS_LABEL[k]).join(' · ')}</b> <a href="#" id="editlink">להשלמה</a></div>` : ''}
    <div class="tiles three">${kpiTile('עבודות', s.closed)}${kpiTile('רווח', money(s.profit), 'good')}${kpiTile('חוב פתוח', money(s.due), s.due > 0 ? 'bad' : '')}</div>
    <div class="card flush"><div class="card-title"><span>היסטוריה (${s.count})</span><span class="small muted num">סה״כ ${money(s.revenue)}</span></div>${s.jobs.length ? `<ul class="list">${s.jobs.map(j => jobRow(j)).join('')}</ul>` : '<div class="empty small">אין עדיין</div>'}</div>
    <button class="del-link" id="delc" style="display:block;margin:6px auto">מחק לקוח</button>`);
  const openEdit = () => sheet(`<h2>עריכת לקוח</h2>${clientFormHTML(c)}`, d => bindClientForm(d, { ...c }, () => { closeSheet(); render(); }));
  $('#edit', el).onclick = openEdit;
  const el2 = $('#editlink', el); if (el2) el2.onclick = e => { e.preventDefault(); openEdit(); };
  $('#delc', el).onclick = async () => {
    if (!confirm(s.count ? `ללקוח יש ${s.count} עבודות/פניות – הן יימחקו גם. למחוק?` : 'למחוק את הלקוח?')) return;
    await removeMany('jobs', s.jobs.map(j => j.id));
    await remove('clients', c.id); toast('נמחק', 'trash'); go('#clients');
  };
};

// ---------- חובות ----------
routes.debts = () => {
  const list = S.jobs.filter(j => dueOf(j) > 0).sort((a, b) => a.date.localeCompare(b.date));
  const total = sum(list, dueOf);
  const el = app(`
    <div class="topnav">${backBtn('#more', 'עוד')}<div class="title">חובות</div><span></span></div>
    <div class="hero red"><div class="label">סה״כ חייבים לך</div><div class="big num">${money(total)}</div><span class="delta">${list.length} עבודות</span></div>
    ${list.length ? list.map(j => {
      const c = clientById(j.clientId) || {};
      const days = Math.max(0, diffDays(today(), j.date));
      const msg = `שלום ${c.name || ''}, תזכורת ידידותית לגבי התשלום על ${j.description || 'העבודה'} מתאריך ${fmtG(j.date)} – יתרה ${money(dueOf(j))}. תודה רבה!`;
      return `<div class="card"><a class="row" href="#job/${j.id}" style="padding:0;min-height:0">${avatar(c.name)}<div class="main"><div class="t"><span class="nm">${esc(c.name || '—')}</span>${pill(`לפני ${days} ימים`, days > 30 ? 'bad' : 'warn')}</div>
        <div class="d">${fmtDM(j.date)} · ${esc(j.description || '')}</div></div><div class="end"><div class="a num" style="color:var(--bad)">${money(dueOf(j))}</div></div></a>
        <div class="btn-row" style="margin-top:12px">${c.phone ? `<a class="btn sm" href="${waLink(c.phone, msg)}" target="_blank">${ic('message', 'sm')}תזכורת בווצאפ</a>` : ''}
        <button class="btn sm good" data-paid="${j.id}">${ic('check', 'sm')}התקבל תשלום</button></div></div>`;
    }).join('') : emptyState('checkc', 'אין חובות פתוחים', 'כולם שילמו. כל הכבוד!')}`);
  $$('[data-paid]', el).forEach(b => b.onclick = () => {
    const j = S.jobs.find(x => x.id === b.dataset.paid);
    sheet(`<h2>התקבל תשלום – ${esc((clientById(j.clientId) || {}).name || '')}</h2>
      <div class="fgroup"><label class="field big"><span>סכום</span><div class="money-in"><i>₪</i><input id="pamt" inputmode="decimal" value="${dueOf(j)}"></div></label>
      <div class="field"><span class="flabel">איך שולם</span>${choiceHTML('m', S.settings.methods, S.settings.methods[0])}</div></div>
      <button class="btn primary block" id="pok" style="margin-top:12px">שמור</button>`, d => {
      bindChoice(d);
      $('#pok', d).onclick = async () => {
        const amt = num($('#pamt', d).value); if (amt <= 0) return;
        j.payments = [...(j.payments || []), { date: today(), amount: amt, method: choiceVal(d, 'm') }];
        if (j.imported) j.edited = true;
        await save('jobs', j); closeSheet(); toast('נרשם תשלום'); render();
      };
    });
  });
};

// ---------- מי מתקשר ----------
routes.caller = (_, p) => {
  const phone = p.get('phone') || '';
  const np = normPhone(phone);
  const matches = findByPhone(phone);
  const partial = !matches.length && np.length >= 7 ? S.clients.filter(c => normPhone(c.phone).endsWith(np.slice(-7))) : [];
  const card = c => {
    const s = clientStats(c.id);
    return `<div class="card"><div class="result-big"><div class="ei" style="background:var(--good-soft);color:var(--good)">${ic('checkc', 'lg')}</div>
      <h2 style="margin:0">${esc(c.name)}</h2><div class="muted">${esc(c.address || '')}${c.nationality ? ' · ' + esc(c.nationality) : ''}</div></div>
      <div class="muted small" style="text-align:center">הגיע דרך ${esc(c.origin || '—')} · ${s.count} פניות · סה״כ ${money(s.revenue)}</div>
      ${s.due > 0 ? `<div class="alert-soft bad" style="margin-top:10px">${ic('alert', 'sm')} חייב לך ${money(s.due)}</div>` : ''}
      ${c.notes ? `<div class="small" style="margin-top:8px">${esc(c.notes)}</div>` : ''}
      ${s.jobs.length ? `<ul class="list" style="margin-top:6px">${s.jobs.slice(0, 3).map(j => jobRow(j)).join('')}</ul>` : ''}
      <div class="btn-row" style="margin-top:12px"><a class="btn primary" href="#job/new?client=${c.id}&status=open">${ic('plus', 'sm')}רשום פנייה</a><a class="btn" href="#client/${c.id}">כרטיס לקוח</a></div></div>`;
  };
  const el = app(`
    <div class="topnav">${backBtn('#home', 'בית')}<div class="title">מי מתקשר?</div><span></span></div>
    <form id="lk" class="card dial"><input name="phone" type="tel" inputmode="tel" value="${esc(phone)}" placeholder="050-0000000" ${phone ? '' : 'autofocus'}>
      <div class="hint">הקלד או הדבק את המספר</div>
      <div class="btn-row" style="margin-top:12px"><button class="btn primary">${ic('search', 'sm')}בדוק</button><button type="button" class="btn" id="paste">${ic('copy', 'sm')}הדבק מספר</button></div></form>
    ${matches.map(card).join('')}
    ${np && !matches.length ? `<div class="card"><div class="result-big"><div class="ei" style="background:var(--accent-soft);color:var(--accent)">${ic('star', 'lg')}</div><h2 style="margin:0">לקוח חדש</h2><div class="muted small">המספר לא מוכר במערכת</div></div>
      ${partial.length ? `<p class="small">אולי זה: ${partial.map(c => `<a href="#client/${c.id}">${esc(c.name)}</a>`).join(', ')}</p>` : ''}
      <b>שאלות לבירור:</b>
      <ol class="steps"><li>מה השם?</li><li>מה הכתובת (רחוב, מספר, קומה)?</li><li>מה צריך לעשות? אפשר לשלוח תמונה בווצאפ</li><li><b>מאיפה שמעת עליי?</b> (ווצאפ / המלצה ממי / עיתון)</li><li>מתי נוח? זה דחוף?</li></ol>
      <div class="btn-row" style="margin-top:12px"><a class="btn primary" href="#job/new?status=open&phone=${encodeURIComponent(phone)}">${ic('plus', 'sm')}רשום פנייה חדשה</a><a class="btn" href="${waLink(phone)}" target="_blank">${ic('message', 'sm')}ווצאפ</a></div></div>` : ''}
    ${!np ? `<div class="card prose small muted">${ic('info', 'sm')} באייפון אי אפשר לזהות שיחה נכנסת אוטומטית. כשמישהו מתקשר: לחץ והחזק על המספר באפליקציית הטלפון ← "העתק", חזור לכאן ולחץ "הדבק מספר".</div>` : ''}`);
  $('#lk', el).addEventListener('submit', e => { e.preventDefault(); go('#caller?phone=' + encodeURIComponent(e.target.elements.phone.value)); });
  $('#paste', el).onclick = async () => {
    try { const t = await navigator.clipboard.readText(); const d = normPhone(t); if (d.length >= 7) go('#caller?phone=' + encodeURIComponent(d)); else toast('לא נמצא מספר בלוח', 'alert'); }
    catch (_) { toast('אפשר להדביק ידנית בשדה', 'alert'); }
  };
};

// ---------- השלמת נתונים ----------
const wiz = { kind: '', ids: [], i: 0 };
routes.fill = (_, p) => {
  const k = p.get('k');
  const todo = todoItems();
  if (!k) {
    const hub = app(`
      <div class="topnav">${backBtn('#home', 'בית')}<div class="title">השלמת נתונים</div><span></span></div>
      <div class="alert-soft">${ic('info', 'sm')} חלק מהנתונים בטבלה לא מולאו. כאן משלימים אותם בקלות – שדה אחרי שדה, בלי לחפש.</div>
      ${[['jobs', 'עבודות עם מידע חסר', 'תאריך משוער, סכום, תיאור, מקור הגעה', todo.jobs.length, 'tool'],
        ['clients', 'פרטי לקוחות', 'טלפון, כתובת ומוצא (מסודר לפי הלקוחות החשובים)', todo.clients.length, 'users'],
        ['trips', 'קניות ונסיעות', 'באיזו חנות היית וכמה שילמת', todo.trips.length, 'cart']].map(([kk, t, d, n, icn]) => `
        <a class="banner info" href="${n ? '#fill?k=' + kk : '#fill'}" style="${n ? '' : 'opacity:.55'}"><div class="bi">${ic(icn)}</div><div class="bt"><b>${t}</b>${d}</div><span class="pill ${n ? 'warn' : 'good'}">${n || '✓'}</span></a>`).join('')}
      ${(() => { const n = sum(S.jobs, j => (j.payments || []).filter(x => !x.method || x.method === 'לא צוין').length); return n ? `<div class="card"><b>איך שולמו התשלומים?</b><div class="small muted">ב-${n} תשלומים לא רשום אם זה מזומן, ביט וכו׳. אפשר לסמן את כולם בבת אחת (למשל "מזומן"), ואחר כך לתקן בודדים במידת הצורך.</div>${choiceHTML('bulkm', S.settings.methods, '')}</div>` : ''; })()}
      ${!todo.jobs.length && !todo.clients.length && !todo.trips.length ? emptyState('checkc', 'הכל מלא!', 'אין נתונים חסרים.') : ''}`);
    const bm = $('[data-choice="bulkm"]', hub);
    if (bm) bm.addEventListener('click', async e => {
      const b = e.target.closest('button[data-v]'); if (!b) return;
      if (!confirm(`לסמן את כל התשלומים שאין להם אופן תשלום כ"${b.dataset.v}"?`)) return;
      const jobs = S.jobs.filter(j => (j.payments || []).some(x => !x.method || x.method === 'לא צוין'));
      for (const j of jobs) { j.payments = j.payments.map(x => (!x.method || x.method === 'לא צוין' ? { ...x, method: b.dataset.v } : x)); if (j.imported) j.edited = true; }
      await saveMany('jobs', jobs); toast('עודכן'); routes.fill(null, new URLSearchParams());
    });
    return;
  }
  wiz.kind = k; wiz.ids = (k === 'jobs' ? todo.jobs : k === 'clients' ? todo.clients : todo.trips).map(x => x.id); wiz.i = 0;
  renderWizard();
};

function renderWizard() {
  const { kind, ids } = wiz, st = S.settings;
  const done = () => { toast('סיימנו! כל הכבוד', 'checkc'); go('#fill'); };
  while (wiz.i < ids.length && !(kind === 'jobs' ? S.jobs : kind === 'clients' ? S.clients : S.purchases).find(x => x.id === ids[wiz.i])) wiz.i++;
  if (wiz.i >= ids.length) return done();
  const id = ids[wiz.i];
  const prog = `<div class="conv" style="margin:0 0 14px"><div class="track"><div class="fill" style="width:${Math.round(wiz.i / ids.length * 100)}%;background:var(--brand-2)"></div></div><span class="small muted num">${wiz.i + 1}/${ids.length}</span></div>`;
  const nav = `<div class="btn-row" style="margin-top:12px"><button class="btn" id="skip">דלג</button><button class="btn primary" id="next">שמור והבא ${ic('left', 'sm')}</button></div>`;
  let body = '', collect;
  if (kind === 'jobs') {
    const j = S.jobs.find(x => x.id === id), c = clientById(j.clientId) || {}, miss = missingJob(j);
    body = `<div class="card"><div class="row" style="padding:0;min-height:0">${avatar(c.name)}<div class="main"><div class="t"><span class="nm">${esc(c.name || '')}</span></div><div class="d">${fmtLong(j.date)}${j.price ? ' · ' + money(j.price) : ''}</div></div></div>${j.description ? `<div style="margin-top:8px">${esc(j.description)}</div>` : ''}</div>
      <div class="fgroup">
        ${miss.includes('date') ? `<label class="field miss"><span>באיזה תאריך זה היה? (השבוע משוער)</span><input type="date" name="date" value="${j.date}"></label>` : ''}
        ${miss.includes('price') ? `<div class="field big miss"><span class="flabel">כמה גבית?</span><div class="money-in"><i>₪</i><input name="price" inputmode="decimal" placeholder="0"></div></div>` : ''}
        ${miss.includes('description') ? `<label class="field miss"><span>מה עשית?</span><input name="description"></label>` : ''}
        ${miss.includes('source') ? `<div class="field miss"><span class="flabel">מאיפה הגיע?</span>${choiceHTML('source', st.sources, '').replace('data-choice', 'data-allow-off data-choice')}</div>` : ''}
        ${miss.includes('method') ? `<div class="field miss"><span class="flabel">איך שילם?</span>${choiceHTML('method', st.methods, '')}</div>` : ''}
      </div>`;
    collect = async root => {
      const E = $('#wf', root).elements;
      if (E.date && E.date.value) { j.date = E.date.value; j.dateApprox = false; }
      if (E.price && num(E.price.value)) j.price = num(E.price.value);
      if (E.description && E.description.value.trim()) j.description = E.description.value.trim();
      const s = choiceVal(root, 'source'); if (s) { j.source = s; j.referredBy = j.referredBy || ''; }
      const m = choiceVal(root, 'method'); if (m) j.payments = (j.payments || []).map(x => (!x.method || x.method === 'לא צוין' ? { ...x, method: m } : x));
      if (j.imported) j.edited = true;
      await save('jobs', j);
    };
  } else if (kind === 'clients') {
    const c = S.clients.find(x => x.id === id), s = clientStats(id);
    body = `<div class="card"><div class="row" style="padding:0;min-height:0">${avatar(c.name)}<div class="main"><div class="t"><span class="nm">${esc(c.name)}</span></div><div class="d">${s.closed} עבודות · ${money(s.revenue)} · אחרונה ${s.last ? fmtDM(s.last) : '—'}</div></div></div>
      <div class="small muted" style="margin-top:8px">${s.jobs.slice(0, 3).map(j => esc(j.description || '')).filter(Boolean).join(' · ')}</div></div>
      <div class="fgroup"><label class="field${c.phone ? '' : ' miss'}"><span>טלפון</span><input name="phone" type="tel" inputmode="tel" value="${esc(c.phone || '')}"></label>
        <label class="field${c.address ? '' : ' miss'}"><span>כתובת</span><input name="address" value="${esc(c.address || '')}" list="dl-addr2"></label>
        <datalist id="dl-addr2">${[...new Set(S.clients.map(x => x.address).filter(Boolean))].map(a => `<option value="${esc(a)}">`).join('')}</datalist>
        <div class="field${c.nationality ? '' : ' miss'}"><span class="flabel">מוצא</span>${choiceHTML('nationality', st.nationalities, c.nationality || '').replace('data-choice', 'data-allow-off data-choice')}</div></div>`;
    collect = async root => {
      const E = $('#wf', root).elements;
      await save('clients', { ...c, phone: E.phone.value.trim(), address: E.address.value.trim(), nationality: choiceVal(root, 'nationality') });
    };
  } else {
    const pu = S.purchases.find(x => x.id === id);
    body = `<div class="card"><div class="t" style="font-weight:600">${fmtLong(pu.date)}</div><div class="muted small">${esc(pu.note || '')}${tripMin(pu) ? ' · ' + fmtDur(tripMin(pu)) : ''}</div></div>
      <div class="fgroup"><div class="field ac-wrap miss"><span>באיזו חנות?</span><input name="store" value="${esc(pu.store || '')}"></div>
        <label class="field big miss"><span class="flabel">כמה שילמת?</span><div class="money-in"><i>₪</i><input name="amount" inputmode="decimal" placeholder="0"></div></label>
        <div class="field"><span class="flabel">איך שילמת?</span>${choiceHTML('method', st.methods, pu.method || '')}</div></div>`;
    collect = async root => {
      const E = $('#wf', root).elements;
      await save('purchases', { ...pu, store: E.store.value.trim(), amount: num(E.amount.value), method: choiceVal(root, 'method') });
    };
  }
  const el = app(`<div class="topnav">${backBtn('#fill', 'חזרה')}<div class="title">${{ jobs: 'השלמת עבודות', clients: 'פרטי לקוחות', trips: 'קניות' }[kind]}</div><span></span></div>${prog}<form id="wf" class="form" autocomplete="off">${body}</form>${nav}`);
  bindChoice(el);
  if (kind === 'trips') bindDatalist($('[name=store]', el), [...new Set(S.purchases.map(x => x.store).filter(Boolean))]);
  const next = async skip => { if (!skip) await collect(el); wiz.i++; renderWizard(); window.scrollTo(0, 0); };
  $('#next', el).onclick = () => next(false);
  $('#skip', el).onclick = () => next(true);
  $('#wf', el).addEventListener('submit', e => { e.preventDefault(); next(false); });
}

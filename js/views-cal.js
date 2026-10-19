'use strict';

/* =========================================================
   views-cal.js – יומן (חודש / שבוע / יום) עם תאריך עברי ולועזי, ושעות עבודה
   ========================================================= */

const EV_COLORS = [['blue', 'כחול', '#3b82f6'], ['green', 'ירוק', '#1d9a57'], ['orange', 'כתום', '#f07a2b'], ['red', 'אדום', '#e5493a'],
  ['purple', 'סגול', '#8b5cf6'], ['teal', 'טורקיז', '#0e9aa7'], ['pink', 'ורוד', '#e0558f'], ['gray', 'אפור', '#7b8794']];
const evHex = id => (EV_COLORS.find(c => c[0] === id) || EV_COLORS[0])[2];
const EV_TYPES = [['עבודה אצל לקוח', 'blue'], ['ביקור / הצעת מחיר', 'orange'], ['קניות', 'teal'], ['אישי', 'purple'], ['חופש', 'gray']];
const JOB_COLOR = { paid: '#1d9a57', unpaid: '#f07a2b', open: '#3b82f6', lost: '#8b95a1', none: '#7b8794' };

// אינדקס לפי תאריך (נבנה מחדש כשהנתונים משתנים)
let _calIdx = null, _calVer = '';
function calIndex() {
  const ver = [S.jobs, S.events, S.purchases, S.workdays].map(a => a.length + ':' + sum(a, x => x.updatedAt || 0)).join('|');
  if (_calIdx && _calVer === ver) return _calIdx;
  const idx = { jobs: new Map(), events: new Map(), trips: new Map(), wd: new Map() };
  const add = (m, k, v) => { if (!m.has(k)) m.set(k, []); m.get(k).push(v); };
  S.jobs.forEach(j => add(idx.jobs, j.date, j));
  S.events.forEach(e => add(idx.events, e.date, e));
  S.purchases.forEach(p => add(idx.trips, p.date, p));
  S.workdays.forEach(w => idx.wd.set(w.date, w));
  _calIdx = idx; _calVer = ver;
  return idx;
}

function calendarItems(date) {
  const idx = calIndex();
  const out = { allDay: [], timed: [], band: null, holiday: holidayOf(date), off: false, profit: 0, jobs: 0 };
  for (const e of idx.events.get(date) || []) {
    const it = { kind: 'event', id: e.id, title: e.title || 'אירוע', sub: [e.clientName, e.address].filter(Boolean).join(' · '), color: evHex(e.color) };
    if (e.allDay || !e.start) out.allDay.push(it);
    else { it.s = hm2min(e.start); it.e = e.end ? hm2min(e.end) : it.s + 60; if (it.e <= it.s) it.e = it.s + 60; it.timeLabel = `${e.start}${e.end ? '–' + e.end : ''}`; out.timed.push(it); }
  }
  for (const j of idx.jobs.get(date) || []) {
    const c = clientById(j.clientId), ps = payState(j);
    const color = j.status === 'open' ? JOB_COLOR.open : j.status === 'lost' ? JOB_COLOR.lost : ps === 'paid' ? JOB_COLOR.paid : ps ? JOB_COLOR.unpaid : JOB_COLOR.none;
    const it = { kind: 'job', id: j.id, title: c ? c.name : 'עבודה', sub: j.description || '', color };
    if (j.status === 'closed') { out.profit += profitOf(j); out.jobs++; }
    if (j.tStart) {
      it.s = hm2min(j.tStart); it.e = j.tEnd ? it.s + spanMin(j.tStart, j.tEnd) : it.s + 60;
      it.timeLabel = `${j.tStart}${j.tEnd ? '–' + j.tEnd : ''}`; out.timed.push(it);
    } else out.allDay.push(it);
  }
  for (const p of idx.trips.get(date) || []) {
    if (!(p.leave && p.back)) continue;
    const s = hm2min(p.leave);
    out.timed.push({ kind: 'trip', id: p.id, title: 'קניות' + (p.store ? ' · ' + p.store : ''), sub: num(p.amount) ? money(num(p.amount)) : '', color: '#0e9aa7', s, e: s + spanMin(p.leave, p.back), timeLabel: `${p.leave}–${p.back}` });
  }
  const w = idx.wd.get(date);
  if (w) {
    if (w.off) { out.off = true; out.allDay.push({ kind: 'off', id: date, title: w.note || 'חופש', sub: '', color: '#8b95a1' }); }
    if (w.start && w.end) out.band = { s: hm2min(w.start), e: hm2min(w.end) };
  }
  out.timed.sort((a, b) => a.s - b.s);
  return out;
}

function openItem(kind, id) {
  if (kind === 'job') go('#job/' + id);
  else if (kind === 'event') eventSheet(S.events.find(e => e.id === id));
  else if (kind === 'trip') purchaseSheet(S.purchases.find(p => p.id === id));
  else if (kind === 'off') workdaySheet(id);
}

function layoutItems(items) {
  const arr = items.map(i => ({ ...i, e: Math.max(i.e, i.s + 30) })).sort((a, b) => a.s - b.s || b.e - a.e);
  const out = []; let cluster = [], end = 0;
  const flush = () => {
    const cols = [];
    cluster.forEach(it => { let c = cols.findIndex(x => x <= it.s); if (c < 0) { c = cols.length; cols.push(0); } cols[c] = it.e; it.col = c; });
    cluster.forEach(it => (it.cols = cols.length)); out.push(...cluster); cluster = [];
  };
  for (const it of arr) { if (cluster.length && it.s >= end) { flush(); end = 0; } cluster.push(it); end = Math.max(end, it.e); }
  flush();
  return out;
}

const calUrl = (v, d) => `#cal?v=${v}&d=${d}`;

routes.cal = (_, p) => {
  const v = p.get('v') || 'month', d = p.get('d') || today(), t = today();
  const step = v === 'month' ? 0 : v === 'week' ? 7 : 1;
  let prev, next, title, sub;
  if (v === 'month') {
    const [y, m] = d.split('-').map(Number);
    prev = ymd(new Date(y, m - 2, 1)); next = ymd(new Date(y, m, 1));
    const ml = monthLabel(d.slice(0, 7)); title = ml.g; sub = ml.h;
  } else if (v === 'week') {
    prev = addDays(d, -7); next = addDays(d, 7);
    const ws = weekStart(d), we = addDays(ws, 6);
    title = `${parseYmd(ws).getDate()}–${parseYmd(we).getDate()} ב${GMONTHS[parseYmd(we).getMonth()]}`; sub = `${hebDM(ws)} – ${hebDM(we)}`;
  } else {
    prev = addDays(d, -1); next = addDays(d, 1);
    title = fmtLong(d); sub = hebDate(d);
  }
  const hol = holidayOf(d);
  const head = `
    <div class="head"><div><h1>${title}</h1><div class="sub">${sub}${v === 'day' && hol ? ' · <b>' + esc(hol.name) + '</b>' : ''}</div></div>
      <div class="head-actions"><button class="round brand" id="addev">${ic('plus')}</button></div></div>
    <div class="cal-bar">
      <div class="cal-nav"><a class="round" href="${calUrl(v, prev)}">${ic('right')}</a><a class="round" href="${calUrl(v, next)}">${ic('left')}</a><a class="btn sm" href="${calUrl(v, t)}">היום</a></div>
      <div class="seg" style="margin:0;flex:1;max-width:240px">${[['month', 'חודש'], ['week', 'שבוע'], ['day', 'יום']].map(([k, l]) => `<a class="${k === v ? 'on' : ''}" href="${calUrl(k, d)}">${l}</a>`).join('')}</div>
    </div>`;
  let el;
  if (v === 'month') el = monthView(d, head);
  else if (v === 'week') el = weekView(d, head);
  else el = dayView(d, head);
  $('#addev', el).onclick = () => eventSheet({ date: d });
  el.addEventListener('click', e => {
    const it = e.target.closest('[data-open]');
    if (it) { e.stopPropagation(); const [k, id] = it.dataset.open.split(':'); openItem(k, id); return; }
    const slot = e.target.closest('[data-slot]');
    if (slot) { const [dt, min] = slot.dataset.slot.split('@'); const rect = slot.getBoundingClientRect(); const y = (e.clientY - rect.top) / slot.dataset.hh * 60; const m = Math.max(0, Math.min(23 * 60, Math.floor(y / 30) * 30)); eventSheet({ date: dt, start: min2hm(m), end: min2hm(m + 60) }); }
  });
  // החלקה בין ימים/שבועות/חודשים (ב-RTL: החלקה ימינה = הבא)
  let x0 = null, y0 = 0;
  el.addEventListener('touchstart', e => { x0 = e.touches[0].clientX; y0 = e.touches[0].clientY; }, { passive: true });
  el.addEventListener('touchend', e => {
    if (x0 === null) return;
    const dx = e.changedTouches[0].clientX - x0, dy = e.changedTouches[0].clientY - y0; x0 = null;
    if (Math.abs(dx) > 70 && Math.abs(dx) > Math.abs(dy) * 1.8) go(calUrl(v, dx > 0 ? next : prev));
  }, { passive: true });
  if (v !== 'month') {
    const hh = v === 'day' ? 56 : 44;
    const items = v === 'day' ? calendarItems(d).timed : Array.from({ length: 7 }, (_, i) => calendarItems(addDays(weekStart(d), i)).timed).flat().sort((a, b) => a.s - b.s);
    let hour = 7;
    if (items.length) hour = Math.max(0, Math.floor(items[0].s / 60) - 1);
    else if (d === t || (v === 'week' && weekStart(d) === weekStart(t))) hour = Math.max(0, new Date().getHours() - 2);
    const sc = $('.hscroll', el);
    requestAnimationFrame(() => { sc.scrollTop = hour * hh; });
  }
  void step;
};

function monthView(d, head) {
  const t = today(), [y, m] = d.split('-').map(Number);
  const first = ymd(new Date(y, m - 1, 1)), last = ymd(new Date(y, m, 0));
  const start = weekStart(first), weeks = Math.ceil((diffDays(last, start) + 1) / 7);
  let cells = '';
  for (let i = 0; i < weeks * 7; i++) {
    const ds = addDays(start, i), ci = calendarItems(ds), inMonth = ds.slice(0, 7) === d.slice(0, 7);
    const all = [...ci.timed, ...ci.allDay];
    const dots = all.slice(0, 4).map(x => `<i style="background:${x.color}"></i>`).join('');
    const hp = hebParts(ds);
    cells += `<a class="mc${inMonth ? '' : ' out'}${ds === t ? ' today' : ''}${dow(ds) === 6 ? ' sat' : ''}${ci.holiday && ci.holiday.kind !== 'rc' ? ' hol' : ''}" href="${calUrl('day', ds)}">
      <span class="gn">${parseYmd(ds).getDate()}</span><span class="hn">${hp.day === 1 ? esc(hp.month) : gem(hp.day)}</span>
      <span class="dots">${dots}${all.length > 4 ? `<b>+${all.length - 4}</b>` : ''}</span>
      ${ci.profit ? `<span class="mp num">${moneyK(ci.profit)}</span>` : ci.holiday ? `<span class="mh">${esc(ci.holiday.name.replace('חול המועד ', 'חה״מ '))}</span>` : ''}</a>`;
  }
  const mon = summarize(S.jobs.filter(j => j.date.startsWith(d.slice(0, 7))));
  return app(`${head}
    <div class="mgrid"><div class="mdays">${DAYS_S.map(x => `<span>${x}</span>`).join('')}</div><div class="mcells">${cells}</div></div>
    <div class="tiles three" style="margin-top:14px">${kpiTile('רווח החודש', money(mon.profit), 'good')}${kpiTile('עבודות', mon.closed)}${kpiTile('פניות', mon.leads)}</div>
    <div class="legend" style="flex-wrap:wrap;justify-content:center;margin-top:6px">
      <span><i style="background:${JOB_COLOR.paid}"></i>שולם</span><span><i style="background:${JOB_COLOR.unpaid}"></i>לא שולם</span><span><i style="background:${JOB_COLOR.open}"></i>בבירור / אירוע</span><span><i style="background:#0e9aa7"></i>קניות</span></div>`);
}

function hourColumn(hh) {
  return `<div class="hours-col">${Array.from({ length: 24 }, (_, h) => `<span style="height:${hh}px">${h ? pad(h) + ':00' : ''}</span>`).join('')}</div>`;
}
function blocks(items, hh, withTime) {
  return layoutItems(items).map(i => {
    const w = 100 / i.cols;
    return `<div class="evb${i.kind !== 'event' ? ' soft' : ''}" data-open="${i.kind}:${i.id}" style="top:${i.s / 60 * hh}px;height:${Math.max(18, (i.e - i.s) / 60 * hh - 2)}px;right:${i.col * w}%;width:calc(${w}% - 2px);--c:${i.color}">
      <b>${esc(i.title)}</b>${withTime ? `<small>${i.timeLabel}${i.sub ? ' · ' + esc(i.sub) : ''}</small>` : ''}</div>`;
  }).join('');
}
function nowLine(date, hh) {
  if (date !== today()) return '';
  const n = new Date(); return `<div class="nowline" style="top:${(n.getHours() * 60 + n.getMinutes()) / 60 * hh}px"></div>`;
}

function dayView(d, head) {
  const t = today(), hh = 56, ci = calendarItems(d);
  const ws = weekStart(d);
  const strip = Array.from({ length: 7 }, (_, i) => {
    const ds = addDays(ws, i), c = calendarItems(ds), n = c.timed.length + c.allDay.length;
    return `<a class="wd${ds === d ? ' sel' : ''}${ds === t ? ' today' : ''}" href="${calUrl('day', ds)}"><small>${DAYS_S[i]}</small><b>${parseYmd(ds).getDate()}</b><small>${hebDay(ds)}</small><span class="${n ? 'has' : ''}"></span></a>`;
  }).join('');
  const band = ci.band ? `<div class="band" style="top:${ci.band.s / 60 * hh}px;height:${(ci.band.e - ci.band.s) / 60 * hh}px"></div>` : '';
  const st = dayStats(d);
  return app(`${head}
    <div class="wstrip">${strip}</div>
    ${ci.holiday ? `<div class="hol-tag ${ci.holiday.kind}">${ic('star', 'sm')}${esc(ci.holiday.name)}</div>` : ''}
    ${ci.allDay.length ? `<div class="allday">${ci.allDay.map(i => `<div class="chip-ev" data-open="${i.kind}:${i.id}" style="--c:${i.color}"><b>${esc(i.title)}</b>${i.sub ? ' · ' + esc(i.sub) : ''}</div>`).join('')}</div>` : ''}
    <div class="hscroll"><div class="hgrid-wrap"><div class="hgrid" style="height:${24 * hh}px">${hourColumn(hh)}
      <div class="hcol" data-slot="${d}@0" data-hh="${hh}" style="background-size:100% ${hh}px">${band}${blocks(ci.timed, hh, true)}${nowLine(d, hh)}</div></div></div></div>
    ${st.jobs.length || st.trips.length ? `<div class="tiles three" style="margin-top:14px">${kpiTile('רווח היום', money(st.profit), 'good')}${kpiTile('שעות עבודה', st.work ? fmtDur(st.work) : '—')}${kpiTile('בדרך', st.travel ? fmtDur(st.travel) : '—')}</div>` : ''}
    <div class="btn-row" style="margin-top:12px"><button class="btn" id="wdbtn">${ic('clock', 'sm')}שעות היום / חופש</button><a class="btn" href="#job/new?date=${d}">${ic('plus', 'sm')}עבודה ליום זה</a></div>`);
}

function weekView(d, head) {
  const t = today(), hh = 44, ws = weekStart(d);
  const days = Array.from({ length: 7 }, (_, i) => addDays(ws, i));
  const cis = days.map(calendarItems);
  const heads = days.map((ds, i) => `<a class="wh${ds === t ? ' today' : ''}${dow(ds) === 6 ? ' sat' : ''}" href="${calUrl('day', ds)}"><small>${DAYS_S[i]}</small><b>${parseYmd(ds).getDate()}</b><small>${hebDay(ds)}</small>${cis[i].holiday && cis[i].holiday.kind !== 'rc' ? '<em></em>' : ''}</a>`).join('');
  const adays = cis.map((c, i) => `<div class="wad">${c.allDay.slice(0, 3).map(x => `<span data-open="${x.kind}:${x.id}" style="--c:${x.color}">${esc(x.title)}</span>`).join('')}${c.allDay.length > 3 ? `<small>+${c.allDay.length - 3}</small>` : ''}</div>`).join('');
  const cols = cis.map((c, i) => `<div class="hcol" data-slot="${days[i]}@0" data-hh="${hh}" style="background-size:100% ${hh}px">${blocks(c.timed, hh, false)}${nowLine(days[i], hh)}</div>`).join('');
  const wk = summarize(S.jobs.filter(j => j.date >= ws && j.date <= days[6]));
  return app(`${head}
    <div class="wk"><div class="wk-head"><span></span>${heads}</div>
    ${cis.some(c => c.allDay.length) ? `<div class="wk-head wk-ad"><span class="ad-l">כל היום</span>${adays}</div>` : ''}
    <div class="hscroll"><div class="hgrid wk-grid" style="height:${24 * hh}px">${hourColumn(hh)}${cols}</div></div></div>
    <div class="tiles three" style="margin-top:14px">${kpiTile('רווח השבוע', money(wk.profit), 'good')}${kpiTile('עבודות', wk.closed)}${kpiTile('פניות', wk.leads)}</div>`);
}

// ---------- אירוע ביומן ----------
function eventSheet(init = {}) {
  const isNew = !init.id;
  const ev = { date: today(), title: '', allDay: false, start: '', end: '', color: 'blue', clientId: '', clientName: '', address: '', notes: '', ...init };
  if (isNew && !ev.start && !init.allDay) { ev.start = '09:00'; ev.end = '10:00'; }
  sheet(`<h2>${isNew ? 'אירוע חדש' : 'עריכת אירוע'}</h2>
    <form id="ef" class="form" autocomplete="off">
      <div class="fgroup">
        <label class="field"><span>כותרת</span><input name="title" value="${esc(ev.title)}" placeholder="למשל: תיקון ברז אצל כהן"></label>
        <div class="field"><span class="flabel">סוג</span><div class="choice" id="evtypes">${EV_TYPES.map(([l, c]) => `<button type="button" data-t="${esc(l)}" data-c="${c}">${esc(l)}</button>`).join('')}</div></div>
        <label class="field"><span>תאריך</span><input type="date" name="date" value="${ev.date}" required></label>
        <div class="hint" style="padding:0 0 8px" id="ehd">${hebDate(ev.date)}</div>
        <div class="field"><span class="flabel">זמן</span><div class="seg" id="adseg" style="margin:0"><button type="button" data-v="timed" class="${ev.allDay ? '' : 'on'}">בשעות</button><button type="button" data-v="all" class="${ev.allDay ? 'on' : ''}">כל היום</button></div></div>
        <div class="field-row timed-only"><label class="field"><span>התחלה</span><input type="time" name="start" value="${ev.start || ''}"></label><label class="field"><span>סיום</span><input type="time" name="end" value="${ev.end || ''}"></label></div>
        <div class="field ac-wrap"><span>לקוח (לא חובה)</span><input name="client" value="${esc(ev.clientName || '')}"></div>
        <label class="field"><span>כתובת</span><input name="address" value="${esc(ev.address || '')}"></label>
        <div class="field"><span class="flabel">צבע</span><div class="swatches" id="swatches">${EV_COLORS.map(([id, n, hex]) => `<button type="button" data-c="${id}" title="${n}" class="${id === ev.color ? 'on' : ''}" style="background:${hex}"></button>`).join('')}</div></div>
        <label class="field"><span>הערות</span><textarea name="notes">${esc(ev.notes || '')}</textarea></label>
      </div>
      <div class="btn-row" style="margin-top:12px"><button class="btn primary" style="flex:2">שמור</button>${isNew ? '' : '<button type="button" class="btn danger" id="edel">מחק</button>'}</div>
      ${!isNew ? `<div class="btn-row" style="margin-top:8px"><button type="button" class="btn" id="e2job">${ic('checkc', 'sm')}רשום כעבודה</button>${ev.address ? `<a class="btn" href="${wazeLink(ev.address + ' ' + S.settings.city)}" target="_blank">${ic('nav', 'sm')}ווייז</a>` : ''}</div>` : ''}
    </form>`, d => {
    const f = $('#ef', d), E = f.elements;
    let color = ev.color, allDay = !!ev.allDay, clientId = ev.clientId;
    const syncAD = () => $$('.timed-only', d).forEach(x => (x.style.display = allDay ? 'none' : ''));
    syncAD();
    $('#adseg', d).onclick = e => { const b = e.target.closest('button'); if (!b) return; allDay = b.dataset.v === 'all'; $$('#adseg button', d).forEach(x => x.classList.toggle('on', x === b)); syncAD(); };
    $('#swatches', d).onclick = e => { const b = e.target.closest('button'); if (!b) return; color = b.dataset.c; $$('#swatches button', d).forEach(x => x.classList.toggle('on', x === b)); };
    $('#evtypes', d).onclick = e => { const b = e.target.closest('button'); if (!b) return; if (!E.title.value) E.title.value = b.dataset.t; color = b.dataset.c; $$('#swatches button', d).forEach(x => x.classList.toggle('on', x.dataset.c === color)); if (b.dataset.t === 'חופש') { allDay = true; $$('#adseg button', d).forEach(x => x.classList.toggle('on', x.dataset.v === 'all')); syncAD(); } };
    E.date.addEventListener('change', () => { if (E.date.value) $('#ehd', d).textContent = hebDate(E.date.value); });
    E.start.addEventListener('change', () => { if (E.start.value && (!E.end.value || hm2min(E.end.value) <= hm2min(E.start.value))) E.end.value = min2hm((hm2min(E.start.value) + 60) % 1440); });
    clientAC(d, E.client, c => { clientId = c.id; E.client.value = c.name; if (!E.address.value) E.address.value = c.address || ''; if (!E.title.value) E.title.value = c.name; });
    E.client.addEventListener('input', () => { clientId = ''; });
    const read = () => ({ ...ev, id: ev.id || uid(), title: E.title.value.trim() || E.client.value.trim() || 'אירוע', date: E.date.value, allDay, start: allDay ? '' : E.start.value, end: allDay ? '' : E.end.value,
      color, clientId, clientName: E.client.value.trim(), address: E.address.value.trim(), notes: E.notes.value.trim() });
    f.onsubmit = async e => { e.preventDefault(); await save('events', read()); closeSheet(); toast('נשמר ביומן'); render(); };
    if (!isNew) {
      $('#edel', d).onclick = async () => { if (!confirm('למחוק את האירוע?')) return; await remove('events', ev.id); closeSheet(); toast('נמחק', 'trash'); render(); };
      $('#e2job', d).onclick = async () => {
        const o = read(); await save('events', o); closeSheet();
        go(`#job/new?event=${o.id}&date=${o.date}${clientId ? '&client=' + clientId : '&name=' + encodeURIComponent(o.clientName)}&desc=${encodeURIComponent(o.title)}${o.start ? '&tStart=' + o.start : ''}${o.end ? '&tEnd=' + o.end : ''}`);
      };
    }
  });
}

// ---------- יום עבודה (שעות / חופש) ----------
function workdaySheet(date) {
  const w = S.workdays.find(x => x.date === date) || { date, start: '', end: '', minutes: 0, note: '', off: false };
  const st = dayStats(date);
  sheet(`<h2>${fmtLong(date)}</h2><div class="muted small" style="text-align:center;margin-top:-8px">${hebDate(date)}</div>
    <form id="wf2" class="form" style="margin-top:12px"><div class="fgroup">
      <div class="field-row"><label class="field"><span>התחלת יום ${nowBtn('start')}</span><input type="time" name="start" value="${w.start || ''}"></label><label class="field"><span>סוף יום ${nowBtn('end')}</span><input type="time" name="end" value="${w.end || ''}"></label></div>
      <label class="field"><span>או סה״כ שעות (למשל 9:30)</span><input name="minutes" value="${w.minutes ? Math.floor(w.minutes / 60) + ':' + pad(w.minutes % 60) : ''}" inputmode="decimal"></label>
      <div class="field"><span class="flabel">יום חופש</span><div class="seg" style="margin:0" id="offseg"><button type="button" data-v="0" class="${w.off ? '' : 'on'}">עבדתי</button><button type="button" data-v="1" class="${w.off ? 'on' : ''}">חופש</button></div></div>
      <label class="field"><span>הערה</span><input name="note" value="${esc(w.note || '')}"></label></div>
      ${st.work || st.travel ? `<p class="small muted" style="padding:0 6px">מהעבודות והקניות של היום: ${st.work ? 'עבודה ' + fmtDur(st.work) : ''}${st.work && st.travel ? ' · ' : ''}${st.travel ? 'בדרך ' + fmtDur(st.travel) : ''}</p>` : ''}
      <button class="btn primary block" style="margin-top:12px">שמור</button></form>`, d => {
    bindNow(d);
    let off = w.off;
    $('#offseg', d).onclick = e => { const b = e.target.closest('button'); if (!b) return; off = b.dataset.v === '1'; $$('#offseg button', d).forEach(x => x.classList.toggle('on', x === b)); };
    $('#wf2', d).onsubmit = async e => {
      e.preventDefault(); const E = e.target.elements;
      const ms = E.minutes.value.trim(), mins = ms.includes(':') ? num(ms.split(':')[0]) * 60 + num(ms.split(':')[1]) : Math.round(num(ms) * 60);
      const rec = { ...w, id: w.id || uid(), date, start: E.start.value, end: E.end.value, minutes: mins, note: E.note.value.trim(), off, imported: false };
      if (!rec.start && !rec.end && !rec.minutes && !rec.note && !rec.off) { if (w.id) await remove('workdays', w.id); } else await save('workdays', rec);
      closeSheet(); toast('נשמר'); render();
    };
  });
}

// ---------- שעות עבודה ----------
routes.hours = (_, p) => {
  const unit = p.get('u') || 'week', heb = (p.get('cal') || (S.settings.hebrewDefault ? 'h' : 'g')) === 'h';
  const dates = new Set([...S.jobs.filter(j => durOf(j) > 0 || j.tStart).map(j => j.date), ...S.purchases.map(x => x.date), ...S.workdays.map(w => w.date)]);
  const groups = new Map();
  for (const date of [...dates].sort().reverse()) {
    const st = dayStats(date);
    if (!st.total && !st.off && !st.wd) continue;
    const k = periodOf(date, unit, heb);
    let g = groups.get(k.key);
    if (!g) groups.set(k.key, g = { ...k, days: [], max: date });
    g.days.push(st);
  }
  const list = [...groups.values()];
  const agg = g => {
    const worked = g.days.filter(x => x.total > 0);
    const total = sum(worked, x => x.total), profit = sum(worked, x => x.profit);
    return { worked: worked.length, work: sum(g.days, x => x.work), travel: sum(g.days, x => x.travel), total, profit, perHour: total ? profit / (total / 60) : 0, off: g.days.filter(x => x.off).length };
  };
  const link = (u, c) => `#hours?u=${u}&cal=${c}`;
  const chartItems = list.slice(0, 8).reverse().map(g => ({ key: g.key, label: g.label, short: unit === 'day' ? fmtDM(g.days[0].date) : unit === 'week' ? (heb ? hebDM(g.key) : fmtDM(g.key)) : g.label.split(' ')[0].slice(0, 5), value: agg(g).total / 60 }));
  const cards = list.slice(0, 24).map(g => {
    const a = agg(g);
    return `<div class="card"><div class="card-title"><span>${esc(g.label)}</span><span class="small muted">${esc(g.sub)}</span></div>
      <div class="tiles three" style="margin-bottom:8px">${kpiTile('סה״כ שעות', fmtDur(a.total))}${kpiTile('ימי עבודה', a.worked, '', a.off ? `${a.off} ימי חופש` : '')}${kpiTile('רווח לשעה', a.perHour ? money(a.perHour) : '—', a.perHour ? 'good' : '')}</div>
      <div class="small muted">אצל לקוחות ${fmtDur(a.work)} · בנסיעות לחנויות ${fmtDur(a.travel)}</div>
      <details><summary class="link-btn">פירוט ימים</summary><table class="ptable"><tr style="color:var(--ink-3);font-size:.78rem"><td>יום</td><td>שעות</td><td>עבודה</td><td>בדרך</td><td style="text-align:left">₪/שעה</td></tr>
      ${g.days.map(x => `<tr data-wd="${x.date}" style="cursor:pointer"><td>${DAYS_S[dow(x.date)]} ${fmtDM(x.date)}${x.off ? ' ' + pill('חופש', 'gray') : ''}</td><td class="num">${x.start && x.end ? x.start + '–' + x.end : x.total ? fmtDur(x.total) : '—'}</td><td class="num">${x.work ? fmtDur(x.work) : '—'}</td><td class="num">${x.travel ? fmtDur(x.travel) : '—'}</td><td class="num">${x.total && x.profit ? money(x.profit / (x.total / 60)) : '—'}</td></tr>`).join('')}</table></details></div>`;
  }).join('');
  const el = app(`
    <div class="topnav">${backBtn('#more', 'עוד')}<div class="title">שעות עבודה</div><button class="link-btn" id="addday">${ic('plus', 'sm')}יום</button></div>
    ${timerCard()}
    ${segHTML([['day', 'יומי', link('day', heb ? 'h' : 'g')], ['week', 'שבועי', link('week', heb ? 'h' : 'g')], ['month', 'חודשי', link('month', heb ? 'h' : 'g')]], unit)}
    <div class="pills"><a class="${!heb ? 'on' : ''}" href="${link(unit, 'g')}">לועזי</a><a class="${heb ? 'on' : ''}" href="${link(unit, 'h')}">עברי</a></div>
    ${chartItems.length > 1 ? `<div class="card"><div class="card-title"><span>שעות ${unit === 'day' ? 'ביום' : unit === 'week' ? 'בשבוע' : 'בחודש'}</span></div>${barChart(chartItems, chartItems[chartItems.length - 1].key, v => String(Math.round(v * 10) / 10))}</div>` : ''}
    ${cards || emptyState('clock', 'עוד אין שעות רשומות', 'בכל עבודה אפשר לרשום מתי נכנסת ומתי שמת באוטו, ובקניות מתי יצאת ומתי חזרת. או פשוט להפעיל את הטיימר.')}`);
  $('#addday', el).onclick = () => workdaySheet(today());
  $$('[data-wd]', el).forEach(r => r.onclick = () => workdaySheet(r.dataset.wd));
  return bindTimer(el);
};

document.addEventListener('click', e => { const b = e.target.closest('#wdbtn'); if (b) workdaySheet((location.hash.match(/d=([\d-]+)/) || [])[1] || today()); });

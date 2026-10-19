'use strict';

/* =========================================================
   views-money.js – חומרים וקניות, תזרים עסקי ואישי
   ========================================================= */

const knownStores = () => {
  const cnt = new Map();
  for (const p of S.purchases) if (p.store) cnt.set(p.store, (cnt.get(p.store) || 0) + 1);
  return [...cnt.entries()].sort((a, b) => b[1] - a[1]).map(x => x[0]);
};
const monthLabel = (key, heb) => { // key = YYYY-MM
  const [y, m] = key.split('-').map(Number);
  const first = `${key}-01`, last = ymd(new Date(y, m, 0));
  const a = hebParts(first), b = hebParts(last);
  return { g: `${GMONTHS[m - 1]} ${y}`, h: a.month === b.month ? `${a.month} ${gem(a.year % 1000)}` : `${a.month} – ${b.month} ${gem(b.year % 1000)}` };
};
const shiftMonth = (key, d) => { const [y, m] = key.split('-').map(Number); return ymd(new Date(y, m - 1 + d, 1)).slice(0, 7); };

// ---------- קנייה / נסיעה לחנות ----------
function purchaseSheet(init = {}) {
  const isNew = !init.id;
  const pu = { date: today(), store: '', amount: '', method: '', leave: '', back: '', minutes: 0, note: '', ...init };
  const stores = knownStores();
  const lastByStore = s => [...S.purchases].filter(x => x.store === s && x.method).sort(byDateDesc)[0];
  sheet(`<h2>${isNew ? 'קנייה בחנות' : 'עריכת קנייה'}</h2>
    <form id="pf" class="form" autocomplete="off">
      <div class="fgroup">
        <label class="field"><span>תאריך</span><input type="date" name="date" value="${pu.date}" required></label>
        <div class="field ac-wrap"><span>באיזו חנות? (זוכר חנויות קודמות)</span><input name="store" value="${esc(pu.store)}" placeholder="למשל: אקה, טמבור…"></div>
        <label class="field big"><span class="flabel">כמה שילמתי</span><div class="money-in"><i>₪</i><input name="amount" inputmode="decimal" value="${pu.amount || ''}" placeholder="0"></div></label>
        <div class="field"><span class="flabel">איך שילמתי</span>${choiceHTML('method', S.settings.methods, pu.method)}</div>
        <div class="field-row"><label class="field"><span>יצאתי ${nowBtn('leave')}</span><input type="time" name="leave" value="${pu.leave || ''}"></label>
          <label class="field"><span>חזרתי ${nowBtn('back')}</span><input type="time" name="back" value="${pu.back || ''}"></label></div>
        <label class="field" id="min-wrap"><span>זמן הנסיעה בדקות (אם לא רשמת שעות)</span><input name="minutes" inputmode="numeric" value="${pu.minutes || ''}"></label>
        <label class="field"><span>מה קניתי / הערה</span><input name="note" value="${esc(pu.note || '')}"></label>
      </div>
      <p class="small muted" id="trip-txt" style="padding:0 6px"></p>
      <div class="btn-row" style="margin-top:12px"><button class="btn primary" style="flex:2">שמור</button>${isNew ? '' : '<button type="button" class="btn danger" id="pdel">מחק</button>'}</div>
    </form>`, d => {
    const f = $('#pf', d), E = f.elements;
    bindChoice(d); bindNow(d);
    bindDatalist(E.store, stores);
    E.store.addEventListener('change', () => { const l = lastByStore(E.store.value.trim()); if (l && !choiceVal(d, 'method')) setChoice(d, 'method', l.method); });
    const calc = () => {
      const m = E.leave.value && E.back.value ? spanMin(E.leave.value, E.back.value) : num(E.minutes.value);
      $('#trip-txt', d).textContent = m ? `זמן נסיעה והקנייה: ${fmtDur(m)}` : '';
      $('#min-wrap', d).style.display = E.leave.value && E.back.value ? 'none' : '';
    };
    ['leave', 'back', 'minutes'].forEach(k => E[k].addEventListener('input', calc)); calc();
    if (!isNew) $('#pdel', d).onclick = async () => { if (!confirm('למחוק?')) return; await remove('purchases', pu.id); closeSheet(); toast('נמחק', 'trash'); render(); };
    f.onsubmit = async e => {
      e.preventDefault();
      const both = E.leave.value && E.back.value;
      await save('purchases', { ...pu, id: pu.id || uid(), date: E.date.value, store: E.store.value.trim(), amount: num(E.amount.value), method: choiceVal(d, 'method'),
        leave: E.leave.value, back: E.back.value, minutes: both ? 0 : num(E.minutes.value), note: E.note.value.trim() });
      closeSheet(); toast('נשמר'); render();
    };
  });
}

// ---------- חומרים וקניות ----------
routes.materials = (_, p) => {
  const view = p.get('v') || 'month';
  const month = p.get('m') || today().slice(0, 7);
  const [y] = month.split('-');
  const list = S.purchases.filter(x => (view === 'year' ? x.date.startsWith(y) : x.date.startsWith(month))).sort(byDateDesc);
  const total = sum(list, x => num(x.amount)), trips = list.length, travel = sum(list, tripMin);
  const byStore = new Map();
  for (const x of list) {
    const k = x.store || 'ללא חנות';
    const o = byStore.get(k) || { amt: 0, n: 0, min: 0 };
    o.amt += num(x.amount); o.n++; o.min += tripMin(x); byStore.set(k, o);
  }
  const stores = [...byStore.entries()].sort((a, b) => b[1].amt - a[1].amt);
  const byMethod = new Map();
  for (const x of list) { const k = x.method || 'לא צוין'; byMethod.set(k, (byMethod.get(k) || 0) + num(x.amount)); }
  const methods = [...byMethod.entries()].sort((a, b) => b[1] - a[1]);
  const jobMats = sum(S.jobs.filter(j => j.status === 'closed' && (view === 'year' ? j.date.startsWith(y) : j.date.startsWith(month))), j => num(j.materials) + num(j.extra));
  const ml = monthLabel(month);
  const colors = ['var(--chart)', '#f07a2b', '#2e9d63', '#8b5cf6', '#e0558f', '#7b8794'];

  // טבלה שנתית: חודש × סכום
  const months = Array.from({ length: 12 }, (_, i) => `${y}-${pad(i + 1)}`);
  const yearRows = months.map(k => {
    const l = S.purchases.filter(x => x.date.startsWith(k));
    const top = {}; l.forEach(x => (top[x.store || 'ללא חנות'] = (top[x.store || 'ללא חנות'] || 0) + num(x.amount)));
    const t = Object.entries(top).sort((a, b) => b[1] - a[1])[0];
    return { k, amt: sum(l, x => num(x.amount)), n: l.length, min: sum(l, tripMin), top: t ? t[0] : '' };
  });

  const el = app(`
    <div class="head"><div><h1>חומרים וקניות</h1><div class="sub">כמה קניתי, איפה, ואיך שולם</div></div><div class="head-actions"><button class="round brand" id="add">${ic('plus')}</button></div></div>
    ${segHTML([['month', 'חודשי', `#materials?v=month&m=${month}`], ['year', 'שנתי', `#materials?v=year&m=${month}`]], view)}
    <div class="month-nav"><a class="round" href="#materials?v=${view}&m=${shiftMonth(month, view === 'year' ? -12 : -1)}">${ic('right')}</a>
      <div class="mt">${view === 'year' ? 'שנת ' + y : ml.g}<div>${view === 'year' ? '' : ml.h}</div></div>
      <a class="round" href="#materials?v=${view}&m=${shiftMonth(month, view === 'year' ? 12 : 1)}">${ic('left')}</a></div>
    <div class="tiles three">${kpiTile('סה״כ קניות', money(total))}${kpiTile('קניות', trips, '', trips ? `ממוצע ${money(total / trips)}` : '')}${kpiTile('זמן בדרך', fmtDur(travel), '', trips && travel ? `${fmtDur(travel / trips)} לנסיעה` : '')}</div>

    ${view === 'year' ? `<div class="card"><div class="card-title"><span>טבלה שנתית</span></div><div class="scroll-x"><table class="ptable"><tr style="color:var(--ink-3);font-size:.8rem"><td>חודש</td><td>קניות</td><td>חנות מובילה</td><td style="text-align:left">סכום</td></tr>
      ${yearRows.map(r => `<tr><td><a href="#materials?v=month&m=${r.k}">${GMONTHS[+r.k.slice(5) - 1]}</a></td><td class="num">${r.n || '—'}</td><td class="muted small">${esc(r.top)}</td><td class="num">${r.amt ? money(r.amt) : '—'}</td></tr>`).join('')}
      <tr class="total"><td>סה״כ</td><td class="num">${sum(yearRows, r => r.n)}</td><td></td><td class="num">${money(sum(yearRows, r => r.amt))}</td></tr></table></div></div>` : ''}

    ${stores.length ? `<div class="card"><div class="card-title"><span>בכמה קניתי בכל חנות</span></div>
      ${stores.map(([k, o]) => hbar(k, o.amt, stores[0][1].amt || 1, money(o.amt), `${o.n} קניות${o.min ? ' · ' + fmtDur(o.min / o.n) + ' בדרך' : ''}`)).join('')}</div>` : ''}

    ${methods.length && total ? `<div class="card"><div class="card-title"><span>איך שולם</span></div>
      <div class="split">${methods.map(([k, v], i) => `<i style="width:${Math.max(2, v / total * 100)}%;background:${colors[i % colors.length]}"></i>`).join('')}</div>
      <div class="legend" style="flex-wrap:wrap">${methods.map(([k, v], i) => `<span><i style="background:${colors[i % colors.length]}"></i>${esc(k)} ${money(v)}</span>`).join('')}</div></div>` : ''}

    ${jobMats ? `<div class="card"><div class="d small muted">חומרים שרשמת בתוך העבודות בתקופה: <b class="num">${money(jobMats)}</b>${total ? ` · ההפרש מול הקניות: <b class="num">${money(total - jobMats)}</b>` : ''}</div></div>` : ''}

    <div class="card flush"><div class="card-title"><span>${view === 'year' ? 'כל הקניות בשנה' : 'קניות החודש'}</span><button class="link-btn" id="csv">${ic('download', 'sm')}ייצוא</button></div>
      ${list.length ? `<ul class="list">${list.slice(0, 200).map(x => `<li><div class="row" data-edit="${x.id}" style="cursor:pointer"><div class="avatar av5">${ic('bag', 'sm')}</div><div class="main"><div class="t"><span class="nm">${esc(x.store || 'ללא חנות')}</span>${!num(x.amount) ? pill('חסר סכום', 'info') : ''}</div>
        <div class="d">${fmtDM(x.date)}${x.method ? ' · ' + esc(x.method) : ''}${tripMin(x) ? ' · ' + fmtDur(tripMin(x)) + ' בדרך' : ''}${x.note ? ' · ' + esc(x.note) : ''}</div></div>
        <div class="end"><div class="a num">${num(x.amount) ? money(num(x.amount)) : '—'}</div></div></div></li>`).join('')}</ul>`
        : emptyState('cart', 'עוד אין קניות בתקופה', 'רשום קנייה אחרי שיצאת לחנות – אפשר גם להפעיל טיימר מהמסך הראשי.', `<button class="btn primary" id="add2" style="margin-top:12px">${ic('plus', 'sm')}קנייה חדשה</button>`)}</div>`);
  $('#add', el).onclick = () => purchaseSheet({ date: view === 'month' && month !== today().slice(0, 7) ? month + '-01' : today() });
  const a2 = $('#add2', el); if (a2) a2.onclick = () => purchaseSheet();
  $$('[data-edit]', el).forEach(r => r.onclick = () => purchaseSheet(S.purchases.find(x => x.id === r.dataset.edit)));
  $('#csv', el).onclick = () => {
    const rows = [...list].reverse().map(x => [x.date, x.store, num(x.amount), x.method, x.leave, x.back, tripMin(x), x.note]);
    const csv = [['תאריך', 'חנות', 'סכום', 'אופן תשלום', 'יצאתי', 'חזרתי', 'דקות נסיעה', 'הערה'], ...rows].map(r => r.map(v => `"${String(v ?? '').replace(/"/g, '""')}"`).join(',')).join('\r\n');
    download(`קניות-${view === 'year' ? y : month}.csv`, '﻿' + csv, 'text/csv');
  };
};

// ---------- תזרים מזומנים: עסקי ואישי ----------
routes.cash = (ledger, p) => {
  ledger = ledger === 'personal' ? 'personal' : 'biz';
  const st = S.settings, t = today();
  const month = p.get('m') || t.slice(0, 7);
  const entries = ledger === 'biz' ? bizEntries() : personalEntries();
  const sign = e => (e.kind === 'in' ? 1 : -1) * num(e.amount);
  const real = e => !e.inKind;
  const monthEntries = entries.filter(e => e.date.startsWith(month)).sort((a, b) => b.date.localeCompare(a.date));
  const tin = sum(monthEntries.filter(e => e.kind === 'in' && real(e)), e => num(e.amount));
  const tout = sum(monthEntries.filter(e => e.kind === 'out' && real(e)), e => num(e.amount));
  const upToNow = entries.filter(e => e.date <= t && e.date >= (st.openingDate || '0000') && real(e));
  const bal = acc => sum(upToNow.filter(e => e.account === acc), sign);
  const ml = monthLabel(month);
  const cashBal = num(st.opening.bizCash) + bal('cash'), bankBal = num(st.opening.bizBank) + bal('bank');
  const persBal = num(st.opening.personal) + sum(upToNow, sign);
  const total = ledger === 'biz' ? cashBal + bankBal : persBal;

  // פילוח הוצאות החודש לפי קטגוריה
  const cats = {};
  monthEntries.filter(e => e.kind === 'out' && real(e)).forEach(e => { const k = String(e.category || 'אחר').split(' · ')[0]; cats[k] = (cats[k] || 0) + num(e.amount); });
  const catRows = Object.entries(cats).sort((a, b) => b[1] - a[1]);

  const el = app(`
    <div class="head"><div><h1>תזרים</h1><div class="sub">יתרות והוצאות</div></div></div>
    ${segHTML([['biz', 'עסקי', `#cash/biz?m=${month}`], ['personal', 'אישי', `#cash/personal?m=${month}`]], ledger)}
    <div class="hero"><div class="label">${ledger === 'biz' ? 'יתרה בעסק' : 'יתרה אישית'} (מ-${fmtG(st.openingDate || t)})</div><div class="big num">${money(total)}</div>
      ${ledger === 'biz' ? `<div class="hero-stats" style="grid-template-columns:1fr 1fr"><div><b class="num">${money(cashBal)}</b><span>מזומן</span></div><div><b class="num">${money(bankBal)}</b><span>חשבון עסקי</span></div></div>` : ''}</div>
    <div class="month-nav"><a class="round" href="#cash/${ledger}?m=${shiftMonth(month, -1)}">${ic('right')}</a><div class="mt">${ml.g}<div>${ml.h}</div></div><a class="round" href="#cash/${ledger}?m=${shiftMonth(month, 1)}">${ic('left')}</a></div>
    <div class="tiles three">${kpiTile('נכנס', money(tin), 'good')}${kpiTile('יצא', money(tout), 'bad')}${kpiTile('נשאר', money(tin - tout), tin - tout >= 0 ? 'good' : 'bad')}</div>
    <div class="btn-row" style="margin-bottom:14px"><button class="btn primary" data-add="in">${ic('arrowin', 'sm')}הכנסה</button><button class="btn" data-add="out">${ic('arrowout', 'sm')}הוצאה</button>${ledger === 'biz' ? `<button class="btn" id="xfer">${ic('refresh', 'sm')}משיכה לפרטי</button>` : ''}</div>
    ${ledger === 'biz' ? `<p class="small muted" style="padding:0 6px">תשלומים מלקוחות וקניות חומרים נכנסים לכאן אוטומטית. <a href="#settings">הגדרת יתרות פתיחה</a></p>` : ''}
    ${catRows.length ? `<div class="card"><div class="card-title"><span>הוצאות לפי סוג</span></div>${catRows.slice(0, 6).map(([k, v]) => hbar(k, v, catRows[0][1], money(v))).join('')}</div>` : ''}
    <div class="card flush"><div class="card-title"><span>תנועות</span><span class="small muted">${monthEntries.length}</span></div>${monthEntries.length ? `<ul class="list">${monthEntries.map(e => {
      const inner = `<div class="avatar ${e.kind === 'in' ? 'av2' : 'av4'}">${ic(e.kind === 'in' ? 'arrowin' : 'arrowout', 'sm')}</div><div class="main"><div class="t"><span class="nm">${esc(e.category || '')}</span>${e.inKind ? pill('בשווה כסף', 'gray') : ''}</div>
        <div class="d">${fmtDM(e.date)} · ${esc(e.note || '')}${ledger === 'biz' ? ' · ' + (e.account === 'cash' ? 'מזומן' : 'בנק') : ''}</div></div>
        <div class="end"><div class="a num" style="color:var(--${e.kind === 'in' ? 'good' : 'bad'})">${e.kind === 'in' ? '+' : '−'}${money(num(e.amount))}</div></div>`;
      return `<li>${e.href ? `<a class="row" href="${e.href}">${inner}</a>` : `<div class="row" data-edit="${e.id}" style="cursor:pointer">${inner}</div>`}</li>`;
    }).join('')}</ul>` : '<div class="empty small">אין תנועות בחודש הזה</div>'}</div>`);
  $$('[data-add]', el).forEach(b => b.onclick = () => moneyDialog({ ledger, kind: b.dataset.add, date: month === t.slice(0, 7) ? t : month + '-01' }));
  $$('[data-edit]', el).forEach(d => d.onclick = () => moneyDialog(S.money.find(x => x.id === d.dataset.edit)));
  const x = $('#xfer', el); if (x) x.onclick = transferDialog;
};

function moneyDialog(m) {
  const st = S.settings, isNew = !m.id;
  const cats = m.ledger === 'biz' ? (m.kind === 'in' ? st.bizInCats : st.bizOutCats) : (m.kind === 'in' ? st.personalInCats : st.personalOutCats);
  sheet(`<h2>${m.kind === 'in' ? 'הכנסה' : 'הוצאה'} · ${m.ledger === 'biz' ? 'עסק' : 'אישי'}</h2>
    ${m.transferId ? '<div class="alert-soft">משיכה לפרטי – שינוי או מחיקה יתעדכנו גם בצד השני.</div>' : ''}
    <form id="mf" class="form" autocomplete="off"><div class="fgroup">
      <label class="field big"><span class="flabel">סכום</span><div class="money-in"><i>₪</i><input name="amount" inputmode="decimal" value="${m.amount || ''}" placeholder="0" required></div></label>
      <label class="field"><span>תאריך</span><input type="date" name="date" value="${m.date || today()}" required></label>
      <div class="field"><span class="flabel">קטגוריה</span>${choiceHTML('category', cats, m.category || cats[0])}</div>
      ${m.ledger === 'biz' ? `<div class="field"><span class="flabel">חשבון</span>${choiceHTML('account', ['מזומן', 'חשבון עסקי'], m.account === 'cash' ? 'מזומן' : 'חשבון עסקי')}</div>` : ''}
      <label class="field"><span>פירוט</span><input name="note" value="${esc(m.note || '')}"></label></div>
      <div class="btn-row" style="margin-top:12px"><button class="btn primary" style="flex:2">שמור</button>${isNew ? '' : '<button type="button" class="btn danger" id="mdel">מחק</button>'}</div></form>`, d => {
    bindChoice(d);
    if (!isNew) $('#mdel', d).onclick = async () => {
      if (!confirm('למחוק?')) return;
      await removeMany('money', S.money.filter(x => x.id === m.id || (m.transferId && x.transferId === m.transferId)).map(x => x.id));
      closeSheet(); render();
    };
    $('#mf', d).onsubmit = async e => {
      e.preventDefault();
      const E = e.target.elements;
      if (num(E.amount.value) <= 0) return toast('סכום לא תקין', 'alert');
      const obj = { ...m, id: m.id || uid(), date: E.date.value, amount: num(E.amount.value), category: choiceVal(d, 'category'), note: E.note.value.trim(),
        account: m.ledger === 'biz' ? (choiceVal(d, 'account') === 'מזומן' ? 'cash' : 'bank') : '' };
      await save('money', obj);
      if (m.transferId) { const other = S.money.find(x => x.transferId === m.transferId && x.id !== m.id); if (other) await save('money', { ...other, date: obj.date, amount: obj.amount }); }
      closeSheet(); toast('נשמר'); render();
    };
  });
}

function transferDialog() {
  sheet(`<h2>משיכה מהעסק לכיס הפרטי</h2><form id="tf" class="form"><div class="fgroup">
    <label class="field big"><span class="flabel">סכום</span><div class="money-in"><i>₪</i><input name="amount" inputmode="decimal" placeholder="0" required></div></label>
    <label class="field"><span>תאריך</span><input type="date" name="date" value="${today()}"></label>
    <div class="field"><span class="flabel">מאיפה</span>${choiceHTML('account', ['חשבון עסקי', 'מזומן'], 'חשבון עסקי')}</div></div>
    <button class="btn primary block" style="margin-top:12px">בצע</button></form>`, d => {
    bindChoice(d);
    $('#tf', d).onsubmit = async e => {
      e.preventDefault();
      const E = e.target.elements, amount = num(E.amount.value);
      if (amount <= 0) return toast('סכום לא תקין', 'alert');
      const transferId = uid(), account = choiceVal(d, 'account') === 'מזומן' ? 'cash' : 'bank';
      await saveMany('money', [
        { id: uid(), ledger: 'biz', kind: 'out', date: E.date.value, amount, category: WITHDRAW, account, note: '', transferId },
        { id: uid(), ledger: 'personal', kind: 'in', date: E.date.value, amount, category: 'משיכה מהעסק', note: '', transferId },
      ]);
      closeSheet(); toast('בוצע'); render();
    };
  });
}

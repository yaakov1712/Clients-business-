'use strict';

/* =========================================================
   ui.js – רכיבי תצוגה משותפים
   ========================================================= */

const avatar = (name, cls = '') => `<div class="avatar ${AV(name)} ${cls}">${esc((String(name || '?').trim()[0]) || '?')}</div>`;
const pill = (text, kind = 'gray') => `<span class="pill ${kind}">${text}</span>`;
const kpiTile = (label, value, cls = '', sub = '') => `<div class="tile"><div class="l">${label}</div><div class="v ${cls}">${value}</div>${sub ? `<div class="s">${sub}</div>` : ''}</div>`;
const banner = (kind, icon, title, text, href) => `<${href ? 'a href="' + href + '"' : 'div'} class="banner ${kind}"><div class="bi">${ic(icon)}</div><div class="bt"><b>${title}</b>${text || ''}</div>${href ? ic('left', 'sm faint') : ''}</${href ? 'a' : 'div'}>`;
const emptyState = (icon, title, text = '', btn = '') => `<div class="empty"><div class="ei">${ic(icon, 'lg')}</div><b>${title}</b><div class="small">${text}</div>${btn}</div>`;
const sectionLabel = t => `<div class="section-label">${t}</div>`;
const backBtn = (href, label = 'חזרה') => `<a class="link-btn" href="${href}">${ic('right', 'sm')}${label}</a>`;

function payPill(j) {
  const s = payState(j);
  if (s === 'paid') return pill('שולם', 'good');
  if (s === 'partial') return pill(`חסר ${money(dueOf(j))}`, 'warn');
  if (s === 'unpaid') return pill('לא שולם', 'bad');
  return '';
}
function statusPill(j) {
  if (j.status === 'open') return pill('בבירור', 'warn');
  if (j.status === 'lost') return pill('לא נסגר', 'gray');
  return '';
}

function jobRow(j, opt = {}) {
  const c = clientById(j.clientId);
  const name = c ? c.name : '—';
  const miss = missingJob(j);
  const end = j.status === 'closed'
    ? `<div class="a num">${num(j.price) ? money(num(j.price)) : '<span class="faint">—</span>'}</div><div class="p num">רווח ${money(profitOf(j))}</div>`
    : `<div class="p num">${j.price ? 'הצעה ' + money(num(j.price)) : ''}</div>`;
  const dur = durOf(j);
  return `<li><a class="row" href="#job/${j.id}">
    ${avatar(name)}
    <div class="main">
      <div class="t"><span class="nm">${esc(name)}</span>${statusPill(j)}${payPill(j)}${miss.length ? pill('חסר מידע', 'info') : ''}</div>
      <div class="d">${opt.noDate ? '' : fmtDM(j.date) + ' · '}${esc(j.description || (miss.includes('description') ? 'ללא תיאור' : ''))}${dur ? ' · ' + fmtDur(dur) : ''}</div>
    </div>
    <div class="end">${end}</div>
  </a></li>`;
}

// גרף עמודות (סדרה אחת, כתוויות ישירות)
function barChart(items, selKey, fmt = moneyK) {
  const max = Math.max(1, ...items.map(i => Math.abs(i.value)));
  return `<div class="chart">${items.map(i => `<div class="bar ${i.key === selKey ? 'on' : ''}" title="${esc(i.label)}: ${fmt(i.value)}">
      <span class="val num">${fmt(i.value)}</span><i style="height:${Math.max(3, Math.round(Math.abs(i.value) / max * 100))}%"></i></div>`).join('')}</div>
    <div class="chart-axis">${items.map(i => `<span>${esc(i.short)}</span>`).join('')}</div>`;
}
function hbar(label, value, max, right, sub = '') {
  return `<div class="hbar"><div class="top"><span>${esc(label)}${sub ? ` <span class="faint">${sub}</span>` : ''}</span><b class="num">${right}</b></div>
    <div class="track"><div class="fill" style="width:${Math.max(2, Math.round(value / (max || 1) * 100))}%"></div></div></div>`;
}

// בורר בחירה (צ'יפים): מחזיר HTML; הערך נשמר ב-data-value של העוטף
function choiceHTML(name, options, selected) {
  return `<div class="choice" data-choice="${name}" data-value="${esc(selected || '')}">${options.map(o => `<button type="button" data-v="${esc(o)}" class="${o === selected ? 'on' : ''}">${esc(o)}</button>`).join('')}</div>`;
}
function bindChoice(root, onChange) {
  $$('[data-choice]', root).forEach(box => box.addEventListener('click', e => {
    const b = e.target.closest('button[data-v]'); if (!b) return;
    const same = b.classList.contains('on') && box.dataset.allowOff !== undefined;
    $$('button', box).forEach(x => x.classList.remove('on'));
    if (!same) b.classList.add('on');
    box.dataset.value = same ? '' : b.dataset.v;
    if (onChange) onChange(box.dataset.choice, box.dataset.value);
  }));
}
const choiceVal = (root, name) => ($(`[data-choice="${name}"]`, root) || { dataset: { value: '' } }).dataset.value;
function setChoice(root, name, value, options) {
  const box = $(`[data-choice="${name}"]`, root); if (!box) return;
  if (options) box.innerHTML = options.map(o => `<button type="button" data-v="${esc(o)}">${esc(o)}</button>`).join('');
  box.dataset.value = value || '';
  $$('button', box).forEach(b => b.classList.toggle('on', b.dataset.v === value));
}

function segHTML(items, active, attr = 'href') {
  return `<div class="seg">${items.map(([k, label, link]) => attr === 'href'
    ? `<a class="${k === active ? 'on' : ''}" href="${link}">${label}</a>`
    : `<button type="button" data-v="${k}" class="${k === active ? 'on' : ''}">${label}</button>`).join('')}</div>`;
}

// השלמת שם לקוח מהזיכרון
function clientSearch(q, limit = 8) {
  q = normName(q);
  if (!q) return [];
  const nq = normPhone(q);
  return S.clients.filter(c => normName(c.name).includes(q) || (nq.length >= 3 && normPhone(c.phone).includes(nq)) || normName(c.address).includes(q))
    .sort((a, b) => (normName(a.name).startsWith(q) ? 0 : 1) - (normName(b.name).startsWith(q) ? 0 : 1)).slice(0, limit);
}
function clientAC(root, input, onPick) {
  const wrap = input.closest('.ac-wrap');
  let list = $('.ac-list', wrap);
  if (!list) { list = document.createElement('div'); list.className = 'ac-list'; list.hidden = true; wrap.appendChild(list); }
  const show = () => {
    const res = clientSearch(input.value);
    list.innerHTML = res.map(c => `<div class="row" data-id="${c.id}">${avatar(c.name)}<div class="main"><div class="t"><span class="nm">${esc(c.name)}</span>${c.nationality ? pill(esc(c.nationality)) : ''}</div><div class="d">${esc([c.phone, c.address].filter(Boolean).join(' · ') || 'ללא פרטים')}</div></div></div>`).join('');
    list.hidden = !res.length;
  };
  input.addEventListener('input', show);
  input.addEventListener('focus', show);
  input.addEventListener('blur', () => setTimeout(() => (list.hidden = true), 160));
  list.addEventListener('pointerdown', e => {
    const it = e.target.closest('[data-id]');
    if (it) { e.preventDefault(); onPick(clientById(it.dataset.id)); list.hidden = true; }
  });
}

// השלמה כללית מהזיכרון (חנויות, תיאורים)
function bindDatalist(input, values) {
  const id = 'dl-' + uid();
  const dl = document.createElement('datalist'); dl.id = id;
  dl.innerHTML = values.map(v => `<option value="${esc(v)}">`).join('');
  input.setAttribute('list', id);
  input.after(dl);
}

// כפתור "עכשיו" ליד שדה שעה
function nowBtn(target) { return `<button type="button" class="link-btn" data-now="${target}">${ic('clock', 'sm')}עכשיו</button>`; }
function bindNow(root) { $$('[data-now]', root).forEach(b => b.onclick = () => { const i = $(`[name="${b.dataset.now}"]`, root); i.value = nowHM(); i.dispatchEvent(new Event('input', { bubbles: true })); }); }

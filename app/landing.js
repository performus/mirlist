/* B2B-лендинги МАЙСЛИСТ (R4): общее поведение и макеты интерфейса с данными из data.js.
   Подключается после data.js и shared.js. Тексты лендингов лежат в HTML статично,
   отсюда только интерактив и декоративные «скриншоты» продукта. */
(function () {
  'use strict';
  const $ = (s, r) => (r || document).querySelector(s);
  const $$ = (s, r) => [...(r || document).querySelectorAll(s)];
  const esc = (s) => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const num = (n) => Number(n || 0).toLocaleString('ru');
  const ML = window.ML;

  /* ── появление секций при прокрутке ── */
  function reveal() {
    const els = $$('.rv');
    if (!('IntersectionObserver' in window) || matchMedia('(prefers-reduced-motion: reduce)').matches) { els.forEach(e => e.classList.add('in')); return; }
    const io = new IntersectionObserver(es => es.forEach(e => { if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); } }),
      { threshold: .12, rootMargin: '0px 0px -40px 0px' });
    els.forEach(e => io.observe(e));
  }

  /* ── переключатели: [data-sw="группа"][data-k] ↔ [data-pane="группа"][data-k] ──
     Роли, задачи агентства, разделы кабинета. На десктопе роли переключаются и наведением. */
  function switches() {
    $$('[data-sw]').forEach(btn => {
      const g = btn.dataset.sw;
      const go = () => {
        $$(`[data-sw="${g}"]`).forEach(b => { const on = b === btn; b.classList.toggle('on', on); b.setAttribute('aria-selected', on); });
        $$(`[data-pane="${g}"]`).forEach(p => p.classList.toggle('on', p.dataset.k === btn.dataset.k));
      };
      btn.addEventListener('click', go);
      btn.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); go(); } });
      if (btn.hasAttribute('data-hover')) btn.addEventListener('mouseenter', () => { if (matchMedia('(hover: hover) and (min-width: 1101px)').matches) go(); });
    });
  }

  /* ── ленты карточек: кнопки «назад / вперёд» ── */
  function rails() {
    $$('[data-rail-nav]').forEach(nav => {
      const rail = document.getElementById(nav.dataset.railNav); if (!rail) return;
      $$('button', nav).forEach(b => b.addEventListener('click', () => rail.scrollBy({ left: (+b.dataset.dir) * Math.min(rail.clientWidth * .8, 640), behavior: 'smooth' })));
    });
  }

  /* ══ МАКЕТЫ С ДАННЫМИ ИЗ data.js ══ */
  const IC = {
    users: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/></svg>',
    pin: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 21s-7-6.2-7-11a7 7 0 0 1 14 0c0 4.8-7 11-7 11z"/><circle cx="12" cy="10" r="2.5"/></svg>',
    bell: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.7 21a2 2 0 0 1-3.4 0"/></svg>',
  };
  const ROOMS = (v) => (v.rooms && (v.rooms.total || ML.venueRooms(v))) || 0;
  /* главный зал — самый большой по «театру» (иначе по банкету): открытая поляна на 800 фуршетных мест главным залом не считается */
  const seatMain = (h) => (h.seats.theatre || 0) * 10000 + (h.seats.banquet || 0) * 10 + (h.type === 'Открытая площадка' ? 0 : 1);
  const mainHall = (v) => v.halls.slice().sort((a, b) => seatMain(b) - seatMain(a))[0];
  const minDay = (v) => { const p = v.halls.map(h => h.priceDay).filter(x => x > 0); return p.length ? Math.min(...p) : 0; };

  /** Карточка зала из выдачи — hero площадок. */
  function hallCard(el) {
    const v = ML.venueById(+el.dataset.venue || 1); if (!v) return;
    const h = v.halls.find(x => x.id === +el.dataset.hall) || v.halls[0];
    const seats = ['theatre', 'class', 'banquet'].filter(k => h.seats[k]).map(k => `<span class="m-chip">${esc(ML.seatingByKey(k).l)} · ${h.seats[k]}</span>`).join('');
    el.innerHTML = `<a class="v-card" href="hall.html?id=${h.id}" tabindex="-1" aria-hidden="true">
      <div class="v-card-img"><img src="${ML.photoUrl(h.photo)}" alt=""><span class="v-card-tag">${esc(h.type)}</span></div>
      <div class="v-card-b"><div class="v-card-n">${esc(h.name)}</div><div class="v-card-l">${esc(v.name)} · ${esc(v.city)} · ${h.area} м²</div>
        <div class="lp-req-halls" style="margin-top:12px">${seats}</div>
        <div class="v-card-f"><span>до <b>${ML.hallCapacity(h)}</b> чел.</span><span><b>${num(h.priceDay)} ₽</b> / день</span></div></div></a>`;
  }

  /** Лента реальных объектов каталога — «Площадки на платформе». */
  function venueRail(el) {
    const ids = (el.dataset.ids || '').split(',').map(Number).filter(Boolean);
    const list = ids.length ? ids.map(id => ML.venueById(id)).filter(Boolean) : ML.VENUES.slice(0, 10);
    el.innerHTML = list.map(v => {
      const h = mainHall(v), p = minDay(v);
      return `<a class="v-card" href="venue.html?id=${v.id}">
        <div class="v-card-img"><img src="${ML.photoUrl(v.photo)}" alt="${esc(v.name)}"><span class="v-card-tag">${esc(v.cat)}${v.stars ? ' · ' + v.stars + '★' : ''}</span></div>
        <div class="v-card-b"><div class="v-card-n">${esc(v.name)}</div><div class="v-card-l">${esc(v.city)} · ${v.halls.length} ${ML.plural(v.halls.length, ['зал', 'зала', 'залов'])}</div>
          <div class="v-card-f"><span>до <b>${ML.hallCapacity(h)}</b> чел.</span><span>${p ? `от <b>${num(p)} ₽</b>` : 'по договорённости'}</span></div></div></a>`;
    }).join('');
  }

  /** Мини-витрина бонусной программы: баллы, не рубли. */
  function shop(el) {
    const n = +el.dataset.n || 3;
    el.innerHTML = ML.SHOP.filter(s => !s.own).slice(0, n).map(s => `<div class="lp-shop-i"><b>${esc(s.title)}</b><span>${esc(s.provider)}</span>
      <div class="lp-shop-pts">${num(s.pts)}<small>баллов</small></div></div>`).join('');
  }

  /** Таблица сравнения: три объекта для двухдневной встречи (агентства). */
  function compare(el) {
    const vs = (el.dataset.ids || '1,16,47').split(',').map(Number).map(id => ML.venueById(id)).filter(Boolean);
    const full = el.dataset.full === '1';
    const rows = [
      ['Город', v => esc(v.city)],
      ['Главный зал', v => { const h = mainHall(v); return `${esc(h.name)}<br><span class="m-s">${h.area} м²</span>`; }],
      ['Театр / класс / банкет', v => { const h = mainHall(v); return ['theatre', 'class', 'banquet'].map(k => h.seats[k] || '—').join(' / '); }],
      ['Залов в объекте', v => v.halls.length],
      ['Проживание', v => ROOMS(v) ? `${ROOMS(v)} ${ML.plural(ROOMS(v), ['номер', 'номера', 'номеров'])}${v.rooms.sngl ? `<br><span class="m-s">SNGL ${v.rooms.sngl} · TWIN ${v.rooms.twin}</span>` : ''}` : 'нет'],
      ['Питание', v => `${(v.features || []).includes('inhouse_catering') ? 'Свой ресторан' : 'Кейтеринг заказчика'}${v.avgCheck ? `<br><span class="m-s">чек ≈ ${num(v.avgCheck)} ₽</span>` : ''}`],
      ['Конференц-пакет', v => v.confPackage ? `${num(v.confPackage)} ₽/чел.` : '—'],
      ['Аренда зала', v => { const p = minDay(v); return p ? `от ${num(p)} ₽/день` : 'по договорённости'; }],
    ].slice(0, full ? 8 : 5);
    el.innerHTML = `<table class="m-tbl lp-cmp"><thead><tr><th></th>${vs.map(v => `<th><span class="lp-cmp-v"><img src="${ML.photoUrl(v.photo)}" alt="" loading="lazy">${esc(v.name)}</span></th>`).join('')}</tr></thead>
      <tbody>${rows.map(([l, f]) => `<tr><td class="m-s" style="white-space:nowrap">${l}</td>${vs.map(v => `<td>${f(v)}</td>`).join('')}</tr>`).join('')}</tbody></table>`;
  }

  /** Карточка презентации: фото и характеристики зала. */
  function presentation(el) {
    const v = ML.venueById(+el.dataset.venue || 16); if (!v) return;
    const h = mainHall(v);
    el.innerHTML = `<div class="lp-pres">
      <div class="lp-pres-img"><img src="${ML.photoUrl(h.photo)}" alt="" loading="lazy"><span>Зал 1 из 3</span></div>
      <div class="lp-pres-b"><div class="m-s">${esc(v.name)} · ${esc(v.city)}</div><div class="m-t" style="font-size:17px;margin:4px 0 10px">${esc(h.name)}</div>
        <div class="lp-pres-kv"><span>Площадь</span><b>${h.area} м²</b><span>Театр</span><b>${h.seats.theatre || '—'}</b><span>Банкет</span><b>${h.seats.banquet || '—'}</b><span>Номерной фонд</span><b>${ROOMS(v)}</b></div></div></div>`;
  }

  /** Карточки услуг трёх направлений (поставщики): что предлагается и как считается цена. */
  const SV_IC = {
    'Кейтеринг': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M3 17h18M5 17a7 7 0 0 1 14 0M12 7V5M10 5h4M4 20h16"/></svg>',
    'Оборудование': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="7" width="13" height="9" rx="2"/><circle cx="9.5" cy="11.5" r="2.5"/><path d="M16 10l5-2v8l-5-2M6 16l-1 4M13 16l1 4"/></svg>',
    'Фотограф': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M4 8h3l2-3h6l2 3h3v11H4z"/><circle cx="12" cy="13" r="3.5"/></svg>',
  };
  SV_IC['Видеооператор'] = SV_IC['Фотограф'];
  SV_IC['Хостес'] = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="7" r="4"/><path d="M4 21v-1a6 6 0 0 1 6-6h4a6 6 0 0 1 6 6v1"/></svg>';
  function priceLine(s) {
    if (s.pricePerPerson) return [`от ${num(s.pricePerPerson)} ₽`, 'за человека'];
    /* цена — по первой позиции прайса: её единица совпадает с единицей карточки */
    const first = (s.services || [])[0];
    return [`от ${num(first ? first.price : s.price)} ₽`, ML.priceUnitLabel(s.priceUnit) || ''];
  }
  function supplierCards(el) {
    const pick = (el.dataset.childs || 'Кейтеринг,Оборудование,Фотограф').split(',');
    const list = pick.map(c => ML.SUPPLIERS.find(s => s.child === c)).filter(Boolean);
    el.innerHTML = list.map(s => {
      const [p, u] = priceLine(s);
      const items = (s.services || []).slice(0, 3).map(x => `<li><span>${esc(x.name)}</span><span>${num(x.price)} ₽</span></li>`).join('');
      return `<a class="sv-card" href="supplier.html?id=${s.id}">
        <div class="sv-img lp-media-box" style="--ar:16/9;border-radius:0">${SV_IC[s.child] || SV_IC['Оборудование']}<span class="sv-sec">${esc(s.parent)}</span></div>
        <div class="sv-b"><div class="sv-cat">${esc(s.child)}</div><div class="sv-n">${esc(s.name)}</div>
          <div class="sv-meta"><span class="m-chip">${esc(s.city)}</span>${s.travel ? '<span class="m-chip">выезд в другие города</span>' : ''}<span class="m-chip">опыт ${s.exp} ${ML.plural(s.exp, ['год', 'года', 'лет'])}</span></div>
          ${items ? `<ul class="sv-list">${items}</ul>` : ''}
          <div class="sv-price"><b>${p}</b><span>${esc(u)}</span></div></div></a>`;
    }).join('');
  }
  /** Стопка карточек услуг в hero поставщиков: цена и единица. */
  function supplierStack(el) {
    const list = ['Кейтеринг', 'Оборудование', 'Хостес'].map(c => ML.SUPPLIERS.find(s => s.child === c)).filter(Boolean);
    el.innerHTML = list.map((s, i) => {
      const [p, u] = priceLine(s);
      return `<div class="lp-win lp-stack-c c${i}" aria-hidden="true"><div class="lp-win-b">
        <div class="m-row"><span class="lp-stack-ic">${SV_IC[s.child] || SV_IC['Оборудование']}</span><div><div class="m-s">${esc(s.parent)} · ${esc(s.child)}</div><div class="m-t">${esc(s.name)}</div></div></div>
        <div class="m-hr"></div><div class="m-row"><span class="m-chip">${esc(s.city)}</span><span class="m-sp"></span><b style="color:var(--sd);font-size:15px">${p}</b></div>
        <div class="m-s" style="text-align:right;margin-top:2px">${esc(u)}</div></div></div>`;
    }).join('');
  }

  /* ── форма заявки агентства: обязательные поля, окно в стиле сайта ── */
  function agencyForm() {
    const f = document.getElementById('agencyForm'); if (!f) return;
    const req = [['agName', v => !!v.trim(), 'Укажите название агентства'], ['agPerson', v => !!v.trim(), 'Укажите контактное лицо'],
      ['agMail', v => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v.trim()), 'Укажите рабочий email']];
    const mark = (id, ok, text) => { const box = document.getElementById(id).closest('.lp-f'); box.classList.toggle('bad', !ok); box.querySelector('.lp-f-err').textContent = ok ? '' : text; };
    req.forEach(([id]) => document.getElementById(id).addEventListener('input', () => document.getElementById(id).closest('.lp-f').classList.remove('bad')));
    f.addEventListener('submit', e => {
      e.preventDefault();
      let first = null;
      req.forEach(([id, ok, text]) => { const good = ok(document.getElementById(id).value); mark(id, good, text); if (!good && !first) first = document.getElementById(id); });
      const cons = document.getElementById('agConsent'), lab = cons.closest('.lp-consent');
      lab.classList.toggle('bad', !cons.checked);
      if (!cons.checked && !first) first = cons;
      if (first) { first.focus(); return; }
      MH.dialog({ title: 'Заявка отправлена — менеджер свяжется с вами',
        html: `<p>Спасибо! Мы получили заявку агентства <b>${esc(document.getElementById('agName').value.trim())}</b>. Менеджер МАЙСЛИСТ свяжется с вами по адресу <b>${esc(document.getElementById('agMail').value.trim())}</b> и предложит условия группового тарифа.</p>`,
        actions: [{ label: 'Найти площадку', href: 'search.html' }, { label: 'Хорошо', primary: true }] });
      f.reset();
    });
  }

  function mocks() {
    if (!ML) return;
    const run = { 'hall-card': hallCard, 'venue-rail': venueRail, shop, compare, presentation, 'supplier-cards': supplierCards, 'supplier-stack': supplierStack };
    $$('[data-mock]').forEach(el => { const fn = run[el.dataset.mock]; if (fn) try { fn(el); } catch (e) { console.warn('mock', el.dataset.mock, e); } });
  }

  window.LP = { IC };
  mocks(); switches(); rails(); agencyForm(); reveal();
})();

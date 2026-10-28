/* Сценарии модели app/data.js без браузера: node tests/lifecycle.test.js
   Каждый сценарий загружает data.js в чистую среду с моком localStorage. */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const assert = require('assert');

const SRC = fs.readFileSync(path.join(__dirname, '..', 'app', 'data.js'), 'utf8');

function mockStorage(initial) {
  const data = Object.assign({}, initial);
  return {
    getItem: (k) => (k in data ? data[k] : null),
    setItem: (k, v) => { data[k] = String(v); },
    removeItem: (k) => { delete data[k]; },
    dump: () => data,
  };
}
/** Загрузить модель; initial — содержимое localStorage в виде объектов. */
function load(initial) {
  const raw = {};
  for (const k in initial || {}) raw[k] = JSON.stringify(initial[k]);
  const localStorage = mockStorage(raw);
  const window = {};
  vm.runInNewContext(SRC, { window, localStorage, console });
  return { ML: window.ML, storage: localStorage };
}
const stored = (storage, k) => JSON.parse(storage.getItem(k));
/* массивы из контекста vm — другой realm: сравниваем копии */
const plain = (x) => JSON.parse(JSON.stringify(x));

let passed = 0, failed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log('  ✓ ' + name); }
  catch (e) { failed++; console.log('  ✗ ' + name + '\n      ' + (e.message || e)); }
}

console.log('Жизненный цикл запроса');

test('в словаре статусов нет «Мероприятие подтверждено»', () => {
  const { ML } = load();
  assert.deepStrictEqual(plain(Object.keys(ML.REQUEST_FLOW)), ['sent', 'done', 'reviewed', 'cancelled', 'declined']);
  assert.strictEqual(ML.REQUEST_FLOW.sent.next, 'done');
  const labels = Object.values(ML.REQUEST_FLOW).map(x => x.label);
  assert.ok(!labels.includes('Мероприятие подтверждено'));
});

test('«Мероприятие состоялось» доступно сразу после отправки запроса', () => {
  const { ML } = load();
  const o = { status: 'sent' };
  assert.strictEqual(ML.canSetStatus(o, 'done'), true);
  assert.strictEqual(ML.canSetStatus(o, 'confirmed'), false);
  assert.strictEqual(ML.canSetStatus(o, 'reviewed'), false, 'отзыв — только после «состоялось»');
});

test('отметка «состоялось» сохраняет участников и даты из визарда', () => {
  const { ML, storage } = load({ ml_tariff: 'biz' });   // клиент 27.10: на СТАРТ и у гостя баллов нет — начисление видно с БИЗНЕСА
  const r = ML.state.requests[0], venueId = r.objects[0].venueId;
  assert.strictEqual(r.objects[0].status, 'sent');
  assert.ok(ML.setStatus(r.id, venueId, 'done', { guests: 100, dates: '15.09.2026, 16.09.2026' }));
  const o = stored(storage, 'ml_requests')[0].objects[0];
  assert.strictEqual(o.status, 'done');
  assert.strictEqual(o.guests, 100);
  assert.strictEqual(o.dates, '15.09.2026, 16.09.2026');
  assert.strictEqual(ML.accrualFor(r, r.objects[0]).state, 'waiting', 'ждём подтверждения объекта');
});

test('полный путь: отправлен → состоялось (пользователь) → состоялось (объект) → отзыв', () => {
  const { ML } = load({ ml_tariff: 'prem' });
  const r = ML.state.requests[0], venueId = r.objects[0].venueId;
  const before = Object.assign({}, ML.state.points);
  assert.ok(ML.setStatus(r.id, venueId, 'done', { guests: 100, dates: '15.09.2026' }));
  assert.ok(ML.venueMarkDone(r.id, venueId, 100));
  const o = r.objects[0];
  assert.ok(ML.bothConfirmed(o));
  assert.strictEqual(ML.accrualFor(r, o).state, 'done');
  assert.ok(ML.state.points.free > before.free, 'баллы за мероприятие разблокированы');
  const freeBeforeReview = ML.state.points.free;
  assert.ok(ML.setStatus(r.id, venueId, 'reviewed', { review: { rating: 5, text: 'Всё прошло хорошо' } }));
  assert.strictEqual(o.status, 'reviewed');
  assert.strictEqual(ML.state.points.free - freeBeforeReview, 150, 'баллы за отзыв на ПРЕМИУМ');
});

test('объект отметил первым — баллы разблокируются после отметки пользователя', () => {
  const { ML } = load({ ml_tariff: 'biz' });
  const r = ML.state.requests[0], venueId = r.objects[0].venueId;
  const free0 = ML.state.points.free;
  assert.ok(ML.venueMarkDone(r.id, venueId, 100));
  assert.strictEqual(ML.state.points.free, free0, 'пока отметка одна, баллы не разблокированы');
  assert.ok(ML.setStatus(r.id, venueId, 'done', { guests: 100, dates: '15.09.2026' }));
  assert.ok(ML.bothConfirmed(r.objects[0]));
  assert.ok(ML.state.points.free > free0, 'после второй отметки баллы разблокированы');
});

test('отмена: после неё «состоялось» и отзыв недоступны', () => {
  const { ML } = load();
  const r = ML.state.requests[0], venueId = r.objects[0].venueId;
  assert.ok(ML.setStatus(r.id, venueId, 'cancelled', { reason: 'Перенос мероприятия' }));
  assert.strictEqual(ML.setStatus(r.id, venueId, 'done', { guests: 50 }), false);
  assert.strictEqual(ML.setStatus(r.id, venueId, 'reviewed', {}), false);
});

test('сохранённые запросы в статусе «подтверждено» переходят в «отправлен» с участниками и датами', () => {
  const { ML, storage } = load({ ml_requests: [{
    id: 'RQ-260801-0001', date: '01.08.2026', title: 'Тест',
    objects: [{ venueId: 11, status: 'confirmed', guests: 120, dates: '20.08.2026' }, { venueId: 4, status: 'done' }],
  }] });
  const o = ML.state.requests[0].objects[0];
  assert.strictEqual(o.status, 'sent');
  assert.strictEqual(o.guests, 120);
  assert.strictEqual(o.dates, '20.08.2026');
  assert.ok(ML.canSetStatus(o, 'done'));
  assert.ok(!storage.getItem('ml_requests').includes('"confirmed"'), 'хранилище перезаписано');
});

test('статистика объекта: «доходят до мероприятия» считаются от отметок «состоялось»', () => {
  const { ML } = load();
  const s0 = ML.venueStats(1);
  const r = ML.state.requests[0];
  ML.setStatus(r.id, 1, 'done', { guests: 100, dates: '15.09.2026' });
  const s1 = ML.venueStats(1);
  assert.strictEqual(s1.requests, s0.requests);
  assert.strictEqual(s1.done, s0.done + 1);
  assert.ok(s1.toEvent > s0.toEvent);
});

console.log('Тарифы и типы мероприятий');

test('лимиты тарифов: сравнение 2 / 5 / 10, групповой запрос СТАРТ — до 2, БИЗНЕС — до 5 объектов', () => {
  const { ML } = load();
  assert.deepStrictEqual(plain(ML.plans().map(t => t.compare)), [2, 5, 10]);
  assert.strictEqual(ML.TARIFFS.start.groupRequest, 2);
  assert.strictEqual(ML.TARIFFS.biz.groupRequest, 5);
});

test('клиент 27.10: групповой запрос — гость 0 / СТАРТ 2 / БИЗНЕС 5 / ПРЕМИУМ без ограничения', () => {
  const max = (key) => {
    const { ML } = load({ ml_tariff: key });
    let n = 0;
    while (n < 60 && ML.canGroupRequest(n + 1).ok) n++;
    return n;
  };
  assert.strictEqual(max('guest'), 0, 'гостю — только после регистрации');
  assert.strictEqual(max('start'), 2);
  assert.strictEqual(max('biz'), 5);
  assert.strictEqual(max('prem'), 60, 'ПРЕМИУМ — без ограничения');
  const start = load({ ml_tariff: 'start' }).ML;
  const over = start.canGroupRequest(3);
  assert.strictEqual(over.need, 'biz', 'превышение на СТАРТ — предложение БИЗНЕСА');
  assert.match(over.reason, /не более 2 объектов/);
  assert.strictEqual(load({ ml_tariff: 'biz' }).ML.canGroupRequest(6).need, 'prem');
  assert.strictEqual(load({ ml_tariff: 'guest' }).ML.canGroupRequest(1).need, undefined, 'гостю — регистрация, а не тариф');
});

test('клиент 27.10: СТАРТ отправляет групповой запрос в 2 объекта из сравнения', () => {
  const { ML } = load({ ml_tariff: 'start', ml_requests: [] });
  ML.VENUES.slice(0, 2).forEach(v => assert.ok(ML.toggleCompare(v.halls[0].id).ok));
  const req = ML.createRequest('Два объекта', '', { dates: '10.11.2026', guests: 40 });
  assert.ok(req, 'запрос создан');
  assert.strictEqual(req.objects.length, 2);
  assert.strictEqual(ML.state.compare.size, 0, 'сравнение очищено');
});

test('лимит сравнения — по объектам: на ПРЕМИУМ 10 объектов, 11-й нет, залы тех же объектов — без ограничения', () => {
  const { ML } = load({ ml_tariff: 'prem' });
  const vs = ML.VENUES.slice(0, 11);
  vs.slice(0, 10).forEach(v => assert.ok(ML.toggleCompare(v.halls[0].id).ok));
  assert.strictEqual(ML.toggleCompare(vs[10].halls[0].id).ok, false, '11-й объект');
  vs.slice(0, 10).forEach(v => v.halls.slice(1).forEach(h => assert.ok(ML.toggleCompare(h.id).ok, 'ещё зал того же объекта')));
  assert.strictEqual(ML.compareVenueCount(), 10);
});

test('при понижении тарифа остаются залы первых объектов в пределах лимита', () => {
  const { ML } = load({ ml_tariff: 'prem' });
  ML.VENUES.slice(0, 4).forEach(v => v.halls.forEach(h => ML.toggleCompare(h.id)));
  ML.setTariff('start');
  assert.strictEqual(ML.compareVenueCount(), 2);
  const kept = plain(ML.compareHalls().map(h => h.venueId));
  assert.deepStrictEqual([...new Set(kept)], [ML.VENUES[0].id, ML.VENUES[1].id]);
  assert.strictEqual(kept.length, ML.VENUES[0].halls.length + ML.VENUES[1].halls.length, 'все залы оставшихся объектов');
});

test('типы мероприятий (R3-A, R5 стр.131/146): четыре типа и «Комбинированное» по умолчанию, по каждому есть выдача; спорт — при тимбилдинге', () => {
  const { ML } = load();
  assert.deepStrictEqual(plain(ML.EVENT_TYPES.map(e => e.l)), ['Деловое', 'Банкет / фуршет', 'Свадьба', 'Тимбилдинг/Спортивное'], 'подписи — везде одинаковые');
  assert.deepStrictEqual(plain(ML.EVENT_TYPES.map(e => e.k)), ['business', 'banquet', 'wedding', 'teambuilding'], 'ключи — коды файла');
  for (const k of ['business', 'banquet', 'wedding', 'teambuilding', 'combined']) {
    const F = ML.emptyFilters(); F.eventType = k;
    assert.ok(ML.filterVenues(F).length > 0, k);
  }
  // R5: «Комбинированное» стоит по умолчанию и не сужает выдачу по типу (заменяет «Любой тип»)
  assert.strictEqual(ML.emptyFilters().eventType, 'combined');
  const C = ML.emptyFilters();
  assert.strictEqual(ML.filterVenues(C).length, ML.VENUES.length, 'комбинированное — все объекты');
  assert.strictEqual(ML.filtersActive(C), false, 'тип по умолчанию — не применённый фильтр');
  assert.ok(!ML.EVENT_TYPES.some(e => / \/ |\/ | \//.test(e.l) && e.k === 'teambuilding'), 'без пробелов вокруг «/»');
  assert.ok(ML.VENUE_FILTERS.find(d => d.code === 'event_type').opts.every(o => o.code), 'варианта «Любой тип» нет');
  const sport = ML.venueFilter('football');
  assert.deepStrictEqual(plain(sport.events), ['teambuilding']);
  for (const [t, vis] of [['teambuilding', true], ['combined', true], ['business', false], ['wedding', false]]) {
    const F = ML.emptyFilters(); F.eventType = t;
    assert.strictEqual(ML.venueFilterVisible(sport, F), vis, 'спорт при «' + (t || 'любой') + '»');
  }
});

test('миграция сохранённых фильтров: старые типы, удобства русскими строками, «Своя парковка»', () => {
  const { ML, storage } = load({ ml_filters: { eventType: 'forum', food: ['Место для велкома'], other: ['Своя парковка', 'ЧОП'] } });
  const F = ML.loadFilters();
  assert.strictEqual(F.eventType, 'business');
  assert.deepStrictEqual([...F.feats].sort(), ['security', 'welcome_area'], 'удобства — кодами');
  assert.strictEqual(F.parking, 'private', '«Своя парковка» → «Собственная парковка»');
  const s = stored(storage, 'ml_filters');
  assert.ok(!('food' in s) && s.feats.includes('welcome_area'), 'хранилище перезаписано');
  for (const k of ['presentation', 'meeting', 'online'])
    assert.strictEqual(load({ ml_filters: { eventType: k } }).ML.loadFilters().eventType, 'business', k);
  assert.strictEqual(load({ ml_filters: { eventType: 'team' } }).ML.loadFilters().eventType, 'teambuilding', 'team → teambuilding');
  assert.strictEqual(load({ ml_filters: { eventType: 'wedding' } }).ML.loadFilters().eventType, 'wedding');
});

console.log('Бэклог Артёма');

test('подбор нескольких залов: два требования закрываются РАЗНЫМИ залами (перебор с возвратом, не жадный)', () => {
  const { ML } = load();
  // зал A подходит под оба требования, зал B — только под первое: жадный выбор взял бы A под первое и провалил второе
  const halls = [
    { id: 1, seats: { theatre: 300, banquet: 200 } },
    { id: 2, seats: { theatre: 150 } },
  ];
  const r = ML.hallsSatisfy(halls, [{ seating: 'theatre', min: 100 }, { seating: 'banquet', min: 150 }]);
  assert.strictEqual(r.ok, true);
  assert.deepStrictEqual(plain(r.used), [1, 0], 'театр — второй зал, банкет — первый');
  assert.strictEqual(ML.hallsSatisfy(halls, [{ seating: 'banquet', min: 150 }, { seating: 'banquet', min: 150 }]).ok, false,
    'один зал не закрывает два требования');
  const F = ML.emptyFilters(); F.halls = [{ seating: 'theatre', min: 200 }, { seating: 'banquet', min: 100 }];
  ML.setTariff('prem');
  const found = ML.filterVenues(F);
  assert.ok(found.length > 0);
  found.forEach(x => assert.ok(x.halls.length >= 2, x.venue.name));
});

test('гейтинг фильтров: СТАРТ — город, гости, категория; БИЗНЕС — без рассадки и SNGL/TWIN; ПРЕМИУМ — всё', () => {
  const { ML } = load();
  const groups = ['city', 'people', 'cats', 'stars', 'rooms', 'twin', 'sngl', 'halls', 'seats', 'priceDay', 'food'];
  const open = (t) => groups.filter(g => ML.canUseFilter(t, g));
  assert.deepStrictEqual(plain(open('start')), ['city', 'people', 'cats'], 'на СТАРТ звёздность закрыта');
  assert.deepStrictEqual(plain(open('guest')), ['city', 'people', 'cats']);
  assert.deepStrictEqual(plain(open('biz')), ['city', 'people', 'cats', 'stars', 'rooms', 'halls', 'priceDay', 'food']);
  assert.deepStrictEqual(plain(open('prem')), groups);
  // коды конфига R3: новые фильтры — с «БИЗНЕСА», TWIN/SNGL — только ПРЕМИУМ
  for (const c of ['cuisine', 'wardrobe', 'parking', 'price_hour', 'conference_package_price_per_person', 'menu']) {
    assert.ok(!ML.canUseFilter('start', c) && ML.canUseFilter('biz', c), c);
  }
  assert.ok(!ML.canUseFilter('biz', 'rooms_twin') && ML.canUseFilter('prem', 'rooms_twin'));
  assert.ok(ML.canUseFilter('start', 'category') && ML.canUseFilter('start', 'guests'));
});

test('звёздность (R3-A): «Без звёзд», 2–5 звёзд, варианта «1 звезда» нет; ни один пункт не пустой', () => {
  const { ML } = load({ ml_tariff: 'biz' });
  assert.deepStrictEqual(plain(ML.STAR_OPTIONS.map(o => o.k)), [0, 2, 3, 4, 5]);
  const names = { 0: 'Бутик-отель «Гавань»', 2: 'Отель «Лагуна»', 3: 'Отель «Панорама»', 4: 'Отель «Аврора»', 5: 'Отель «Флагман»' };
  for (const k of [0, 2, 3, 4, 5]) {
    const F = ML.emptyFilters(); F.stars = new Set([k]);
    const found = ML.filterVenues(F).map(x => x.venue.name);
    assert.ok(found.length > 0, 'пункт ' + k + ' не пустой');
    assert.ok(found.includes(names[k]), 'вариант ' + k + ': ' + found.join(', '));
  }
  assert.strictEqual(ML.VENUES.find(v => v.name === 'Отель «Причал»').stars, 2, '«Причал» переведён в 2★');
  assert.ok(!ML.VENUES.some(v => v.stars === 1), 'объектов с 1★ нет');
  // логика «ИЛИ»: два пункта — объединение
  const two = ML.emptyFilters(); two.stars = new Set([2, 3]);
  const a = ML.emptyFilters(); a.stars = new Set([2]); const b = ML.emptyFilters(); b.stars = new Set([3]);
  assert.strictEqual(ML.filterVenues(two).length, ML.filterVenues(a).length + ML.filterVenues(b).length);
  // сохранённый выбор «1 звезда» отбрасывается
  assert.deepStrictEqual([...load({ ml_filters: { stars: [1, 2] } }).ML.loadFilters().stars], [2]);
});

test('вместимость «от – до» (R2 стр.69): в объекте есть зал из диапазона; «до» меньше «от» — меняются местами', () => {
  const { ML } = load({ ml_tariff: 'biz' });
  const cap = (v) => v.halls.map(ML.hallCapacity);
  const F = ML.emptyFilters(); F.people = 100; F.peopleTo = 200;
  const res = ML.filterVenues(F);
  assert.ok(res.length > 0);
  res.forEach(x => {
    assert.ok(x.halls.length > 0);
    x.halls.forEach(h => { const c = ML.hallCapacity(h); assert.ok(c >= 100 && c <= 200, x.venue.name + ' ' + c); });
  });
  // объекты без единого зала в диапазоне не проходят
  ML.VENUES.filter(v => !cap(v).some(c => c >= 100 && c <= 200))
    .forEach(v => assert.ok(!res.some(x => x.venue.id === v.id), v.name));
  const G = ML.emptyFilters(); G.people = 200; G.peopleTo = 100;
  assert.deepStrictEqual(plain(ML.filterVenues(G).map(x => x.venue.id)), plain(res.map(x => x.venue.id)), 'перевёрнутый диапазон');
  const H = ML.emptyFilters(); H.peopleTo = 50;
  ML.filterVenues(H).forEach(x => x.halls.forEach(h => assert.ok(ML.hallCapacity(h) <= 50)));
  assert.strictEqual(ML.peopleLabel(F), 'от 100 до 200 чел.');
  assert.strictEqual(ML.peopleLabel(H), 'до 50 чел.');
  // счётчик категории учитывает оба порога
  const n = ML.facetCount(F, 'cats', 'Отель');
  assert.strictEqual(n, res.filter(x => x.venue.cat === 'Отель').length);
});

test('категории (R3-A): 10 вариантов файла, «Конгрессно-выставочная площадка» полностью, «Другое» в конце', () => {
  const { ML } = load();
  assert.strictEqual(ML.VENUE_CATS.length, 10);
  assert.ok(!ML.VENUE_CATS.includes('Конференц-площадка'));
  assert.strictEqual(ML.VENUE_CATS[ML.VENUE_CATS.length - 1], 'Другое');
  assert.strictEqual(ML.VENUES.find(v => v.name === 'Конференц-центр «Высота»').cat, 'Конгрессно-выставочная площадка');
  ML.VENUES.forEach(v => assert.ok(ML.VENUE_CATS.includes(v.cat), v.name + ': ' + v.cat));
  assert.deepStrictEqual([...load({ ml_filters: { cats: ['Конгрессно-выставочная'] } }).ML.loadFilters().cats], ['Конгрессно-выставочная площадка'], 'сохранённая категория переименована');
});

test('лимит сравнения по объектам: на СТАРТ (2 объекта) — 10 залов одного объекта и 5 второго, третий объект — нет', () => {
  const { ML } = load({ ml_tariff: 'start' });
  // в тестовой базе у объектов по 2–4 зала — добавляем два объекта с 10 и 5 залами
  const mk = (vid, n) => Array.from({ length: n }, (_, i) => ({ id: vid * 100 + i, venueId: vid, name: 'Зал ' + i, seats: { theatre: 50 }, priceDay: 0 }));
  ML.VENUES.push({ id: 901, name: 'Тест-1', halls: mk(901, 10) }, { id: 902, name: 'Тест-2', halls: mk(902, 5) });
  mk(901, 10).forEach(h => assert.ok(ML.toggleCompare(h.id).ok, 'зал ' + h.id));
  mk(902, 5).forEach(h => assert.ok(ML.toggleCompare(h.id).ok, 'зал ' + h.id));
  assert.strictEqual(ML.state.compare.size, 15);
  assert.strictEqual(ML.compareVenueCount(), 2);
  const third = ML.toggleCompare(ML.VENUES[0].halls[0].id);
  assert.strictEqual(third.ok, false, 'зал третьего объекта сверх лимита');
  assert.strictEqual(third.need, 'biz', 'пейвол предлагает БИЗНЕС');
});

test('архив (R5 стр.160): в архиве только закрытые строки — обе стороны отметили, объект отклонил, пользователь отменил', () => {
  const { ML } = load({ ml_tariff: 'biz' });
  const reqs = ML.state.requests;
  const q = reqs.find(x => x.id === 'RQ-260714-0031');
  const live = q.objects.find(o => o.venueId === 1);
  assert.strictEqual(ML.isClosedRow(live), false);
  ML.setStatus(q.id, 1, 'done', { guests: 120 });
  assert.strictEqual(ML.isClosedRow(live), false, 'пользователь отметил — строка остаётся в «Активных»');
  assert.strictEqual(ML.waitingVenue(live), true, 'статус «Ждёт подтверждения площадки»');
  assert.ok(ML.activeRequests().some(x => x.id === q.id) && !ML.splitRequest(q).archived.includes(live), 'не в архиве');
  assert.strictEqual(ML.accrualFor(q, live).state, 'waiting', 'баллы — после подтверждения площадкой');
  assert.strictEqual(ML.isClosedRow(live, 'venue'), false, 'у площадки тоже активен');
  ML.venueMarkDone(q.id, 1, 120);
  assert.strictEqual(ML.isClosedRow(live), true, 'обе стороны отметили — в архиве у пользователя');
  assert.strictEqual(ML.isClosedRow(live, 'venue'), true, 'и у площадки');
  assert.strictEqual(ML.waitingVenue(live), false);
  assert.strictEqual(ML.accrualFor(q, live).state, 'done', 'баллы начислены');
  // отклонение объектом и отмена пользователем — без изменений: закрывают строку у обеих сторон
  assert.ok(ML.venueDecline(q.id, 11, 'Нет свободных дат'));
  const dec = q.objects.find(o => o.venueId === 11);
  assert.ok(ML.isClosedRow(dec) && ML.isClosedRow(dec, 'venue'));
  assert.ok(!ML.activeRequests().some(x => x.id === q.id), 'все строки закрыты — запрос целиком в архиве');
  const q2 = reqs.find(x => x.id === 'RQ-260703-0018');
  ML.setStatus(q2.id, 7, 'cancelled', { reason: 'Передумали' });
  const can = q2.objects.find(o => o.venueId === 7);
  assert.ok(ML.isClosedRow(can) && ML.isClosedRow(can, 'venue'), 'отмена пользователем — в архив у обеих сторон');
});

test('запрос без дат или участников не создаётся (R2 стр.19); у тестовых запросов даты и участники есть', () => {
  const { ML } = load({ ml_tariff: 'prem' });
  ML.state.requests.forEach(r => { assert.ok(String(r.dates || '').trim(), r.id + ' даты'); assert.ok(+r.guests > 0, r.id + ' участники'); });
  [101, 401].forEach(id => ML.toggleCompare(id));
  const n = ML.state.requests.length;
  assert.strictEqual(ML.createRequest('Т', '', { guests: 50 }), null, 'без дат');
  assert.strictEqual(ML.createRequest('Т', '', { dates: '01.11.2026' }), null, 'без участников');
  assert.strictEqual(ML.createRequest('Т', '', { dates: '01.11.2026', guests: 0 }), null, 'ноль участников');
  assert.strictEqual(ML.createDirectRequest([101], { dates: '', guests: 10 }), null, 'прямой без дат');
  assert.strictEqual(ML.createDirectRequest([101], { dates: '01.11.2026' }), null, 'прямой без участников');
  assert.strictEqual(ML.state.requests.length, n, 'ничего не создано');
  assert.strictEqual(ML.requestFieldsError({ guests: 5 }).field, 'dates');
  assert.strictEqual(ML.requestFieldsError({ dates: 'x' }).field, 'guests');
  const ok = ML.createRequest('Т', '', { dates: '01.11.2026', guests: 50 });
  assert.ok(ok && ok.dates === '01.11.2026' && +ok.guests === 50);
  const d = ML.createDirectRequest([102], { dates: '02.11.2026', guests: 20 });
  assert.ok(d);
  assert.strictEqual(ML.repeatRequest(ok.id, { dates: '', guests: 50 }), null, 'повтор без дат');
  assert.strictEqual(ML.updateRequest(ok.id, { guests: 0 }), false, 'корректировка: ноль участников');
  assert.strictEqual(ML.createSupplierRequest([1], { dates: '01.11.2026' }), null, 'поставщику без участников');
});

test('оплата по счёту для юрлиц (R2 стр.15): ИНН с контрольной цифрой, счёт ждёт оплаты, оплата включает тариф', () => {
  const { ML } = load({ ml_tariff: 'start' });
  assert.ok(ML.innValid('7707083893'), 'ИНН организации, 10 цифр');
  assert.ok(ML.innValid('500100732259'), 'ИНН ИП, 12 цифр');
  assert.ok(!ML.innValid('7707083894'), 'неверная контрольная цифра');
  assert.ok(!ML.innValid('77070838'), 'не та длина');
  const ok = { org: 'ООО «Тест»', inn: '7707083893', kpp: '', addr: 'Москва, ул. Тестовая, 1', email: 'buh@test.ru' };
  assert.strictEqual(ML.invoiceErrors(ok).length, 0);
  const bad = ML.invoiceErrors({ org: '', inn: '7707083894', kpp: '12', addr: '', email: 'нет' }).map(e => e.field);
  assert.strictEqual(bad.join(), 'org,inn,kpp,addr,email');
  assert.strictEqual(ML.createInvoice(Object.assign({ plan: 'prem', period: 'half' }, ok, { inn: '123' })), null, 'с ошибкой — счёт не выставлен');
  const inv = ML.createInvoice(Object.assign({ plan: 'prem', period: 'half' }, ok));
  assert.ok(inv && inv.status === 'pending' && inv.sum === ML.TARIFFS.prem.priceHalf);
  assert.strictEqual(ML.tariff().key, 'start', 'до оплаты тариф прежний');
  assert.strictEqual(ML.pendingInvoices().length, 1);
  assert.ok(ML.payInvoice());
  assert.strictEqual(ML.tariff().key, 'prem', 'после оплаты счёта тариф включён');
  assert.strictEqual(ML.pendingInvoices().length, 0);
  assert.strictEqual(ML.invoices()[0].status, 'paid');
  assert.strictEqual(ML.payInvoice(), null, 'неоплаченных больше нет');
});

test('склонение: 1 зал, 2 зала, 5, 11–14 и 111 залов, 21 зал', () => {
  const { ML } = load();
  const f = ['зал', 'зала', 'залов'];
  assert.strictEqual([1, 2, 5, 11, 12, 14, 21, 22, 111].map(n => n + ' ' + ML.plural(n, f)).join(', '),
    '1 зал, 2 зала, 5 залов, 11 залов, 12 залов, 14 залов, 21 зал, 22 зала, 111 залов');
});

test('ПРЕМИУМ на 6 месяцев за баллы: списание, активация, продление и нехватка баллов', () => {
  const { ML, storage } = load({ ml_tariff: 'biz', ml_points: { free: 50000, locked: 0, expiring: 0, expiresAt: '' } });
  const price = ML.premiumItem().pts;
  const r1 = ML.buyPremiumForPoints('2026-10-10');
  assert.strictEqual(r1.ok, true);
  assert.strictEqual(ML.tariff().key, 'prem');
  assert.strictEqual(r1.until, '10.04.2027');
  assert.strictEqual(ML.state.points.free, 50000 - price);
  assert.strictEqual(stored(storage, 'ml_prem_until'), '10.04.2027');
  const r2 = ML.buyPremiumForPoints('2026-10-10');
  assert.strictEqual(r2.extended, true);
  assert.strictEqual(r2.until, '10.10.2027', 'продление считается от текущей даты окончания');
  const poor = load({ ml_tariff: 'biz', ml_points: { free: 10, locked: 0, expiring: 0, expiresAt: '' } }).ML;
  const r3 = poor.buyPremiumForPoints();
  assert.strictEqual(r3.ok, false);
  assert.strictEqual(r3.lack, poor.premiumItem().pts - 10);
  assert.strictEqual(poor.tariff().key, 'biz', 'тариф не меняется');
  assert.strictEqual(poor.state.points.free, 10, 'баллы не списаны');
});

test('сравнение синхронизируется после сброса на другой странице (reloadState, как при pageshow)', () => {
  const { ML, storage } = load({ ml_tariff: 'prem' });
  const h = ML.VENUES[0].halls[0].id;
  ML.toggleCompare(h);
  // другая страница (тот же localStorage) сбрасывает сравнение
  const window2 = {};
  vm.runInNewContext(SRC, { window: window2, localStorage: storage, console });
  window2.ML.clearCompare();
  assert.strictEqual(ML.inCompare(h), true, 'до синхронизации — устаревшее состояние');
  ML.reloadState();
  assert.strictEqual(ML.inCompare(h), false, 'после pageshow зал не отмечен');
  assert.strictEqual(ML.state.compare.size, 0);
});

test('баллы за мероприятие (R3-C): 1000/1500, 3000/5000, 7000/10500, 501+ — 10000/15000; вознаграждение 501+ — по согласованию', () => {
  const { ML } = load({ ml_tariff: 'biz' });
  assert.deepStrictEqual(plain(ML.FEE_TIERS.map(t => [t.ptsBiz, t.ptsPrem])), [[1000, 1500], [3000, 5000], [7000, 10500], [10000, 15000]]);
  const t = ML.FEE_TIERS[ML.FEE_TIERS.length - 1];
  assert.strictEqual(t.label, '501+ чел.');
  assert.strictEqual(t.fee, null, 'вознаграждение объекта за 501+ — по согласованию');
  assert.strictEqual(ML.eventPoints(120), 3000);
  assert.strictEqual(ML.eventPoints(800), 10000, '501+ — числом, без «по согласованию»');
  const p = load({ ml_tariff: 'prem' }).ML;
  assert.strictEqual(p.eventPoints(50), 1500);
});

test('клиент 27.10: на СТАРТ баллы не начисляются — ни за мероприятие, ни за отзыв; «ПРИВЕТ» — на любом тарифе; тратить можно', () => {
  const { ML } = load({ ml_tariff: 'start', ml_points: { free: 0, locked: 0 } });
  [50, 120, 400, 800].forEach(g => assert.strictEqual(ML.eventPoints(g), 0, 'мероприятие на ' + g + ' чел.'));
  assert.strictEqual(ML.reviewPoints(), 0, 'отзыв');
  assert.strictEqual(load({ ml_tariff: 'guest' }).ML.eventPoints(120), 0, 'гость');
  const r = ML.state.requests[0], venueId = r.objects[0].venueId;
  assert.ok(ML.setStatus(r.id, venueId, 'done', { guests: 120, dates: '15.09.2026' }));
  assert.ok(ML.venueMarkDone(r.id, venueId, 120));
  assert.ok(ML.setStatus(r.id, venueId, 'reviewed', { review: { rating: 5, text: 'Хорошо', author: 'Анна К.' } }));
  assert.strictEqual(ML.state.points.free, 0, 'за мероприятие и отзыв на СТАРТ — 0');
  assert.strictEqual(ML.state.points.locked, 0);
  assert.strictEqual(ML.accrualFor(r, r.objects[0]), null, 'в истории нет «будет начислено»');
  ML.addPoints(ML.POINTS_HELLO, 'free', 'Баллы «ПРИВЕТ» за регистрацию');
  assert.strictEqual(ML.state.points.free, 100, '«ПРИВЕТ» начисляется и на СТАРТ');
  const item = ML.shopCatalog().slice().sort((a, b) => a.pts - b.pts)[0];
  ML.addPoints(item.pts, 'free', 'Корректировка');
  assert.ok(ML.orderFromShop(item, ''), 'на СТАРТ баллы можно тратить на витрине');
});

console.log('Фильтры R3-A');

test('зависимые фильтры показываются по типу мероприятия и сбрасываются при скрытии', () => {
  const { ML } = load({ ml_tariff: 'prem' });
  const F = ML.emptyFilters();
  F.eventType = 'teambuilding'; F.feats.add('football');
  assert.ok(ML.filterVenues(F).every(x => x.venue.features.includes('football')));
  F.eventType = 'business';
  assert.deepStrictEqual(plain(ML.pruneFilters(F)), ['football'], 'спорт скрыт при «Деловом» — значение сброшено');
  assert.ok(!F.feats.has('football'));
  F.eventType = 'wedding'; F.feats.add('bridal_room'); F.feats.add('welcome_area');
  F.eventType = 'teambuilding';
  assert.deepStrictEqual(plain(ML.pruneFilters(F).sort()), ['bridal_room', 'welcome_area']);
  F.eventType = 'combined'; F.feats.add('bridal_room'); F.feats.add('football'); F.confPkg = [2000, 4000];
  assert.deepStrictEqual(plain(ML.pruneFilters(F)), [], 'при «Комбинированном» видны все фильтры');
  F.eventType = 'banquet';
  assert.ok(ML.pruneFilters(F).includes('conference_package_price_per_person'), 'конференц-пакет — только для делового и комбинированного');
  assert.deepStrictEqual(plain(F.confPkg), [0, ML.LIMITS.confPkg]);
});

test('переключатель «За день / За час»: виден один ползунок, второй сбрасывается', () => {
  const { ML } = load({ ml_tariff: 'biz' });
  const F = ML.emptyFilters();
  F.priceMode = 'hour'; F.priceHour = [3000, 6000];
  const res = ML.filterVenues(F);
  assert.ok(res.length > 0);
  res.forEach(x => x.halls.forEach(h => assert.ok((!h.priceDay && !h.priceHour) || (h.priceHour >= 3000 && h.priceHour <= 6000), h.name)));
  assert.ok(!ML.venueFilterVisible(ML.venueFilter('price_day'), F) && ML.venueFilterVisible(ML.venueFilter('price_hour'), F));
  F.priceMode = 'day';
  assert.ok(ML.pruneFilters(F).includes('price_hour'));
  assert.deepStrictEqual(plain(F.priceHour), [0, ML.LIMITS.priceHour]);
  F.priceDay = [40000, 60000];
  ML.filterVenues(F).forEach(x => x.halls.forEach(h => assert.ok(!h.priceDay || (h.priceDay >= 40000 && h.priceDay <= 60000))));
});

test('кухня — мультивыбор, логика «ИЛИ»', () => {
  const { ML } = load({ ml_tariff: 'biz' });
  const run = (...c) => { const F = ML.emptyFilters(); F.cuisine = new Set(c); return ML.filterVenues(F).map(x => x.venue.id); };
  const jp = run('japanese'), cau = run('caucasian'), both = run('japanese', 'caucasian');
  assert.ok(jp.length && cau.length);
  assert.strictEqual(both.length, new Set(jp.concat(cau)).size, 'объединение');
  assert.strictEqual(ML.CUISINE_OPTS.length, 12);
  const F = ML.emptyFilters(); F.cuisine = new Set(['japanese']);
  assert.strictEqual(ML.facetCount(F, 'cuisine', 'caucasian'), cau.length, 'счётчик варианта не сужается выбранной кухней');
});

test('«Гардероб» (R5 стр.151): чекбокс, под ним «мест от»; без числа — «гардероб есть», снятие сбрасывает число', () => {
  const { ML } = load({ ml_tariff: 'biz' });
  assert.strictEqual(ML.venueFilter('wardrobe').control, 'check');
  assert.strictEqual(ML.venueFilter('wardrobe_min').control, 'numFrom');
  const F = ML.emptyFilters();
  assert.strictEqual(ML.venueFilterVisible(ML.venueFilter('wardrobe_min'), F), false, 'поле мест — только под отмеченным чекбоксом');
  F.feats.add('wardrobe');
  const any = ML.filterVenues(F);
  assert.ok(any.length > 0 && any.length < ML.VENUES.length);
  any.forEach(x => assert.ok(x.venue.wardrobe > 0, x.venue.name));
  F.wardrobe = 400;
  const res = ML.filterVenues(F);
  assert.ok(res.length > 0);
  res.forEach(x => assert.ok(x.venue.wardrobe >= 400, x.venue.name));
  F.feats.delete('wardrobe'); ML.pruneFilters(F);
  assert.strictEqual(F.wardrobe, 0, 'чекбокс снят — число мест сброшено');
  assert.strictEqual(ML.filterVenues(F).length, ML.VENUES.length);
  assert.ok(load({ ml_filters: { wardrobe: 300 } }).ML.loadFilters().feats.has('wardrobe'), 'прежнее «Гардероб от 300» — отмеченный чекбокс');
});

test('«Парковочных мест от» — только при собственной парковке', () => {
  const { ML } = load({ ml_tariff: 'biz' });
  const d = ML.venueFilter('parking_spaces_min');
  const F = ML.emptyFilters();
  assert.ok(!ML.venueFilterVisible(d, F), 'при «Любой» скрыто');
  F.parking = 'private'; F.parkingSpaces = 100;
  assert.ok(ML.venueFilterVisible(d, F));
  const res = ML.filterVenues(F);
  assert.ok(res.length > 0);
  res.forEach(x => assert.ok(x.venue.parking === 'private' && x.venue.parkingSpaces >= 100));
  F.parking = 'city';
  assert.ok(ML.pruneFilters(F).includes('parking_spaces_min'));
  assert.strictEqual(F.parkingSpaces, 0);
  assert.ok(!ML.venueFilter('parking').opts.find(o => o.code === 'none').decision.includes('УТВ'), '«Нет парковки» удалена');
});

test('«Цена на человека» у кейтеринга: появляется при выборе «Кейтеринг», действует только на кейтеринг', () => {
  const { ML } = load({ ml_tariff: 'biz' });
  const d = ML.SUPPLIER_FILTERS.find(x => x.code === 'catering.price_per_person');
  assert.strictEqual(d.control, 'range2');
  const F = ML.emptySupplierFilters();
  assert.ok(!ML.supplierFilterVisible(d, F));
  F.cats.add('Питание·Кейтеринг'); F.cats.add('Питание·Выездной бар');
  assert.ok(ML.supplierFilterVisible(d, F));
  F.ppp = [0, 2000];
  const res = ML.filterSuppliers(F);
  assert.ok(res.some(s => s.child === 'Кейтеринг') && res.every(s => s.child !== 'Кейтеринг' || s.pricePerPerson <= 2000));
  assert.ok(res.some(s => s.child === 'Выездной бар'), 'бар не отсекается фильтром кейтеринга');
  F.cats.delete('Питание·Кейтеринг');
  assert.ok(ML.pruneSupplierFilters(F).includes('catering.price_per_person'));
  assert.deepStrictEqual(plain(F.ppp), [0, F._maxPpp]);
  for (const code of ['catering.guests', 'catering.vegetarian_menu', 'transport.seats_min', 'transport.class'])
    assert.strictEqual(ML.SUPPLIER_FILTERS.find(x => x.code === code).control, null, code + ' удалён');
});

test('«Цена за» у поставщиков: единица цены у каждой услуги, «За человека» удалено', () => {
  const { ML } = load({ ml_tariff: 'biz' });
  ML.SUPPLIERS.forEach(s => assert.ok(['hour', 'shift', 'unit', 'project'].includes(s.priceUnit), s.name + ': ' + s.priceUnit));
  const F = ML.emptySupplierFilters(); F.units = new Set(['shift']);
  const res = ML.filterSuppliers(F);
  assert.ok(res.length > 0 && res.every(s => s.priceUnit === 'shift'));
  assert.strictEqual(ML.priceUnitLabel('shift'), 'за смену');
  assert.strictEqual(ML.PRICE_UNITS.find(u => u.code === 'person').decision, 'Удалить');
  assert.deepStrictEqual([...load({ ml_supplier_filters: { units: ['person', 'hour'] } }).ML.loadSupplierFilters().units], ['hour']);
});

test('конфиг: у каждого УТВЕРЖДЕНО — контрол нужного типа, у «Удалить» и «СЛ ЭТАП» — контрола нет', () => {
  const { ML } = load();
  const kinds = ['city', 'select', 'range2', 'checks', 'check', 'numFrom', 'numTo', 'fromTo', 'multi', 'segments', 'halls', 'sliderFrom', 'tree'];
  for (const d of ML.VENUE_FILTERS.concat(ML.SUPPLIER_FILTERS)) {
    if (d.decision === 'Удалить' || d.decision === 'СЛ ЭТАП') assert.strictEqual(d.control, null, d.code);
    else if (d.inHall) assert.strictEqual(d.control, null, d.code + ': задаётся в блоке «Зал N» (R5 стр.140)');
    else assert.ok(kinds.includes(d.control), d.code + ': ' + d.control);
  }
  const want = { guests: 'range2', price_day: 'range2', price_hour: 'range2', conference_package_price_per_person: 'range2',
    avg_check: 'numTo', cuisine: 'multi', parking: 'segments', wardrobe: 'check', wardrobe_min: 'numFrom', hall_requirements: 'halls', has_floor_plan: 'check',
    dressing_rooms: 'numFrom', hall_area_min: null };
  for (const c in want) assert.strictEqual(ML.venueFilter(c).control, want[c], c);
  assert.deepStrictEqual(plain(ML.VENUE_FILTER_GROUPS.map(g => g.l)), ['Основное', 'Тип площадки', 'Проживание', 'Залы', 'Стоимость',
    'Питание', 'Оснащение зала', 'Пространство', 'Инфраструктура', 'Правила', 'Спорт']);
  assert.strictEqual(ML.VENUE_FILTERS.filter(d => d.group === 'equip').length, 14);
  assert.strictEqual(ML.venueFilter('dressing_rooms').group, 'infra', 'R5 стр.142: гримёрки — в «Инфраструктуре»');
  assert.strictEqual(ML.VENUE_FILTERS.filter(d => d.group === 'sport').length, 8);
});

test('тестовые данные: не меньше 45 объектов, в Москве не меньше 22; у каждого варианта есть счётчик', () => {
  const { ML } = load({ ml_tariff: 'prem' });
  assert.ok(ML.VENUES.length >= 45, ML.VENUES.length);
  assert.ok(ML.VENUES.filter(v => v.city === 'Москва').length >= 22);
  const types = ['', 'business', 'banquet', 'wedding', 'teambuilding', 'combined'];
  const best = (fn) => Math.max(...types.map(t => { const F = ML.emptyFilters(); F.eventType = t; return fn(F); }));
  ML.VENUE_FILTERS.filter(d => d.control === 'check').forEach(d => assert.ok(best(F => ML.facetCount(F, d.code)) > 0, d.code));
  ML.CUISINE_OPTS.forEach(o => assert.ok(best(F => ML.facetCount(F, 'cuisine', o.code)) > 0, o.l));
  ML.SUPPLIER_SECTIONS.forEach(s => s.kids.forEach(k => assert.ok(ML.supplierFacet(ML.emptySupplierFilters(), 'leaf', s.l + '·' + k.l) > 0, k.l)));
});

console.log('Бэклог R3');

test('R3-B стр.120: у тестовых запросов у каждого объекта есть залы, у запроса — параметры поиска', () => {
  const { ML } = load();
  ML.state.requests.forEach(r => {
    assert.ok((r.params || []).length > 0, r.id + ' параметры');
    ML.requestByVenue(r).forEach(x => assert.ok(x.halls.length > 0, r.id + ': ' + x.venue.name));
  });
  const old = load({ ml_requests: [{ id: 'RQ-260703-0018', date: '03.07.2026', title: 'x', dates: '08.08.2026', guests: 60, objects: [{ venueId: 7, status: 'sent' }] }] }).ML;
  assert.ok(old.state.requests[0].hallIds.length && old.state.requests[0].params.length, 'сохранённые раньше запросы дополняются');
});

test('R3-B стр.109: «Редактировать» обновляет тот же объект, «Добавить зал» — зал этого объекта', () => {
  const { ML } = load();
  assert.strictEqual(ML.state.myVenues.length, 1, 'демо-объект кабинета');
  assert.strictEqual(ML.state.myVenues[0].status, 'published');
  const d = ML.venueToWizard(ML.state.myVenues[0]);
  d.name = 'Новое имя'; d.feats = d.feats.concat(['karaoke']);
  ML.updateMyVenue(0, d);
  assert.strictEqual(ML.state.myVenues.length, 1, 'новый объект не создан');
  assert.strictEqual(ML.state.myVenues[0].name, 'Новое имя');
  assert.ok(ML.state.myVenues[0].features.includes('karaoke'));
  const n = ML.state.myVenues[0].halls.length;
  ML.addHallToMyVenue(0, { name: 'Терраса', type: 'Открытая площадка', area: 100, seats: { reception: 80 }, priceHour: 3000 });
  assert.strictEqual(ML.state.myVenues[0].halls.length, n + 1);
  assert.strictEqual(ML.state.myVenues[0].halls[n].priceHour, 3000);
});

test('R3-B стр.123–124: обращения — по ролям, новое появляется первым со статусом «Отправлено»', () => {
  const { ML } = load();
  ['user', 'venue', 'supplier'].forEach(r => assert.ok(ML.appealsFor(r).length >= 2, r));
  const a = ML.addAppeal({ role: 'venue', kind: 'dispute', topic: 'Спор', requestId: 'RQ-1', text: 'x' });
  assert.strictEqual(ML.appealsFor('venue')[0].id, a.id);
  assert.strictEqual(ML.APPEAL_STATUS[a.status], 'Отправлено');
  assert.ok(!ML.appealsFor('user').some(x => x.id === a.id));
});

test('R3-B стр.106: отметка и фильтр «Есть отзывы» — по наличию отзывов', () => {
  const { ML } = load();
  const s17 = ML.SUPPLIERS.find(s => s.id === 17);
  assert.ok(ML.reviewsFor('supplier', 17).length > 0 && ML.supplierHasReviews(s17));
  const F = ML.emptySupplierFilters(); F.reviews = true;
  ML.filterSuppliers(F).forEach(s => assert.ok(ML.reviewsFor('supplier', s.id).length > 0, s.name));
});

console.log('R3-D. Оснащение — у зала');

const HALL_SPEC = ['sound', 'light', 'screen', 'led_screen', 'projector', 'plasma_panel', 'stage', 'power', 'rigging', 'car_entry',
  'equipment_load_in', 'column_free', 'blackout', 'windows', 'air_conditioning', 'separate_entrance', 'hall_area_min', 'has_floor_plan'];
/* требования клиента: банкет от 120 с LED и две переговорные от 10 */
function clientReqs(ML, F) {
  ML.hallReqAdd(F); Object.assign(F.halls[0], { seating: 'banquet', min: 120 }); ML.hallReqToggle(F, 0, 'led_screen');
  ML.hallReqAdd(F); Object.assign(F.halls[1], { seating: 'board', min: 10 });
  ML.hallReqAdd(F); Object.assign(F.halls[2], { seating: 'board', min: 10 });
  return F;
}

test('R3-D конфиг: у каждого фильтра есть level; у зала — оснащение, часть «Пространства», площадь и план', () => {
  const { ML } = load();
  ML.VENUE_FILTERS.forEach(d => assert.ok(d.level === 'hall' || d.level === 'venue', d.code));
  HALL_SPEC.forEach(c => assert.strictEqual(ML.VENUE_FILTERS.find(d => d.code === c).level, 'hall', c));
  ['internet', 'wifi', 'freight_elevator', 'separate_restrooms', 'external_furniture', 'external_decor', 'dressing_rooms', 'wardrobe', 'cuisine', 'price_day', 'parking']
    .forEach(c => assert.strictEqual(ML.VENUE_FILTERS.find(d => d.code === c).level, 'venue', c));
});

test('R3-D данные: у объектов нет кодов зала, переговорные — экран или плазма без сцены, у открытых нет затемнения и окон, залы различаются', () => {
  const { ML } = load();
  ML.VENUES.forEach(v => {
    assert.ok(!v.features.some(c => ML.HALL_FEATURE_CODES.includes(c)), v.name);
    if (v.halls.length > 1) assert.ok(v.halls.some(h => h.features.join() !== v.halls[0].features.join()), 'одинаковое оснащение залов: ' + v.name);
    v.halls.forEach(h => {
      if (h.type === 'Переговорная') {
        assert.ok(h.features.includes('screen') || h.features.includes('plasma_panel'), h.name);
        assert.ok(!h.features.includes('stage') && !h.features.includes('rigging'), h.name);
      }
      if (h.type === 'Открытая площадка') assert.ok(!h.features.includes('blackout') && !h.features.includes('windows'), h.name);
    });
  });
  const a = ML.venueById(1), led = a.halls.filter(h => h.features.includes('led_screen'));
  assert.deepStrictEqual(plain(led.map(h => h.type)), ['Трансформер'], 'у «Авроры» LED — только в трансформере');
  assert.strictEqual(a.halls.filter(h => h.type === 'Переговорная' && !h.features.includes('led_screen')).length, 2, 'две переговорные без LED');
});

test('R3-D сценарий клиента: банкет от 120 + LED и две переговорные — «Аврора» в выдаче, подобраны все три зала', () => {
  const { ML } = load(); ML.setTariff('prem');
  const F = clientReqs(ML, ML.emptyFilters());
  const x = ML.filterVenues(F).find(r => r.venue.id === 1);
  assert.ok(x, 'объект в выдаче');
  assert.strictEqual(x.halls.length, 3);
  assert.deepStrictEqual(plain(x.halls.map(h => h.name).sort()), ['Зал «Панорама»', 'Переговорная «Арбат»', 'Переговорная «Сити»'].sort());
  assert.strictEqual(ML.hallReqLabel(F.halls[0], 0), 'Зал 1: банкет от 120 · LED-экран');
  // то же на синтетических залах: банкетный с LED и две переговорные без LED
  const halls = [{ seats: { banquet: 150 }, features: ['led_screen', 'sound'] }, { seats: { board: 12 }, features: ['screen'] }, { seats: { board: 14 }, features: ['plasma_panel'] }];
  const r = ML.hallsSatisfy(halls, [{ seating: 'banquet', min: 120, feats: ['led_screen'] }, { seating: 'board', min: 10 }, { seating: 'board', min: 10 }]);
  assert.strictEqual(r.ok, true);
  assert.deepStrictEqual(plain(r.used).sort(), [0, 1, 2]);
});

test('R3-D сценарий клиента: LED только в переговорной, в банкетном нет — объекта нет', () => {
  const { ML } = load(); ML.setTariff('prem');
  const a = ML.venueById(1);
  a.halls.forEach(h => { h.features = h.features.filter(c => c !== 'led_screen'); });
  a.halls.find(h => h.id === 103).features.push('led_screen');
  assert.ok(!ML.filterVenues(clientReqs(ML, ML.emptyFilters())).some(x => x.venue.id === 1));
  const halls = [{ seats: { banquet: 150 }, features: [] }, { seats: { board: 12 }, features: ['led_screen'] }, { seats: { board: 14 }, features: [] }];
  assert.strictEqual(ML.hallsSatisfy(halls, [{ seating: 'banquet', min: 120, feats: ['led_screen'] }, { seating: 'board', min: 10 }, { seating: 'board', min: 10 }]).ok, false);
});

test('R3-D общий «LED-экран» без блоков «Зал N»: объект есть, показан только зал с LED', () => {
  const { ML } = load(); ML.setTariff('prem');
  const F = ML.emptyFilters(); F.feats.add('led_screen');
  const x = ML.filterVenues(F).find(r => r.venue.id === 1);
  assert.ok(x);
  assert.deepStrictEqual(plain(x.halls.map(h => h.name)), ['Зал «Панорама»']);
  ML.filterVenues(F).forEach(r => r.halls.forEach(h => assert.ok(h.features.includes('led_screen'), r.venue.name + ' / ' + h.name)));
});

test('R3-D перебор с возвратом: один зал не закрывает два требования, оснащение учитывается при сопоставлении', () => {
  const { ML } = load();
  const one = [{ seats: { banquet: 300, board: 30 }, features: ['led_screen'] }];
  assert.strictEqual(ML.hallsSatisfy(one, [{ seating: 'banquet', min: 100, feats: ['led_screen'] }, { seating: 'board', min: 10 }]).ok, false);
  // зал 0 подходит под оба требования, но LED только у него: жадный взял бы его под переговоры
  const halls = [{ seats: { banquet: 200, board: 12 }, features: ['led_screen'] }, { seats: { banquet: 180, board: 20 }, features: [] }];
  const r = ML.hallsSatisfy(halls, [{ seating: 'board', min: 10 }, { seating: 'banquet', min: 150, feats: ['led_screen'] }]);
  assert.strictEqual(r.ok, true);
  assert.deepStrictEqual(plain(r.used), [1, 0]);
});

test('R3-D счётчики: у чекбокса свойства зала — фактическое число объектов после отметки', () => {
  const { ML } = load(); ML.setTariff('prem');
  const sets = [ML.emptyFilters(), Object.assign(ML.emptyFilters(), { city: 'Москва' }), Object.assign(ML.emptyFilters(), { people: 100 })];
  sets[1].feats.add('sound'); sets[2].feats.add('wifi');
  sets.forEach(F => ML.VENUE_FILTERS.filter(d => d.control === 'check' && d.level === 'hall').forEach(d => {
    const G = Object.assign({}, F, { feats: new Set([...F.feats, d.code]) });
    assert.strictEqual(ML.facetCount(F, d.code), ML.filterVenues(G).length, d.code);
  }));
});

test('R3-D дополнение: с первым блоком «Зал N» общие свойства зала переезжают в «Зал 1», без блоков — снова общие и пустые', () => {
  const { ML } = load(); ML.setTariff('prem');
  const F = ML.emptyFilters(); F.feats.add('led_screen'); F.feats.add('projector'); F.feats.add('wifi');
  ML.hallReqAdd(F);
  assert.deepStrictEqual(plain(F.halls[0].feats), ['led_screen', 'projector']);
  assert.deepStrictEqual(plain([...F.feats]), ['wifi'], 'свойство объекта осталось общим');
  ML.hallReqAdd(F);
  assert.deepStrictEqual(plain(F.halls[1].feats), [], 'второй блок пустой');
  assert.strictEqual(ML.hallReqLabel(F.halls[0], 0), 'Зал 1: схема не выбрана · LED-экран · Проектор');
  assert.strictEqual(ML.hallReqOn(F.halls[0]), false, 'R5 стр.137: без схемы требование не применяется');
  F.halls[0].seating = 'theatre';
  assert.strictEqual(ML.hallReqLabel(F.halls[0], 0), 'Зал 1: театр · LED-экран · Проектор');
  // правила «хотя бы один из подобранных» нет: свойство не из блока не участвует
  const n = ML.filterVenues(F).length;
  ML.hallReqRemove(F, 1); ML.hallReqRemove(F, 0);
  assert.strictEqual(F.halls.length, 0);
  assert.ok(![...F.feats].some(ML.isHallCheck), 'общие свойства зала пустые');
  assert.ok(n > 0);
  // сохранённое до R3-D состояние: общий LED при блоке — читается как оснащение «Зала 1»
  const { ML: M2 } = load({ ml_filters: { feats: ['led_screen', 'wifi'], halls: [{ seating: 'banquet', min: 100 }] } });
  const G = M2.loadFilters();
  assert.deepStrictEqual(plain(G.halls[0].feats), ['led_screen']);
  assert.ok(!G.feats.has('led_screen') && G.feats.has('wifi'));
});

test('R3-D кабинет: оснащение задаётся в визарде зала, «Редактировать» отдаёт его в поля, у объекта кодов зала нет', () => {
  const { ML } = load();
  const v = ML.state.myVenues[0];
  assert.ok(!v.features.some(c => ML.HALL_FEATURE_CODES.includes(c)));
  assert.ok(v.halls.find(h => h.name === 'Зал «Панорама»').features.includes('led_screen'));
  const d = ML.venueToWizard(v);
  assert.ok(d.halls.find(h => h.name === 'Зал «Панорама»').feats.includes('led_screen'));
  assert.ok(!d.feats.some(c => ML.HALL_FEATURE_CODES.includes(c)), 'в визарде объекта полей зала нет');
  d.halls[0].feats = ['sound', 'stage'];
  ML.updateMyVenue(0, d);
  assert.deepStrictEqual(plain(ML.state.myVenues[0].halls[0].features), ['sound', 'stage']);
  ML.addHallToMyVenue(0, { name: 'Терраса', type: 'Открытая площадка', area: 100, seats: { reception: 80 }, feats: ['power', 'sound'] });
  assert.deepStrictEqual(plain(ML.state.myVenues[0].halls.slice(-1)[0].features), ['sound', 'power'], 'порядок — как в конфиге');
});

console.log('R5. Бэклог 26.10');

test('R5 стр.141: счётчик каждого чекбокса — число ОБЪЕКТОВ после его применения (свойства объекта и зала, категории)', () => {
  const { ML } = load(); ML.setTariff('prem');
  const sets = [ML.emptyFilters(), Object.assign(ML.emptyFilters(), { city: 'Москва' }), Object.assign(ML.emptyFilters(), { eventType: 'teambuilding' }),
    Object.assign(ML.emptyFilters(), { people: 100 })];
  sets.forEach((F, si) => {
    ML.VENUE_FILTERS.filter(d => d.control === 'check' && ML.venueFilterVisible(d, F)).forEach(d => {
      const G = Object.assign({}, F, { feats: new Set([...F.feats, d.code]) });
      assert.strictEqual(ML.facetCount(F, d.code), ML.filterVenues(G).length, `набор ${si}: ${d.code}`);
    });
    ML.VENUE_CATS.forEach(c => {
      const G = Object.assign({}, F, { cats: new Set([c]) });
      assert.strictEqual(ML.facetCount(F, 'category', c), ML.filterVenues(G).length, `набор ${si}: категория ${c}`);
    });
  });
  const F = ML.emptyFilters();
  assert.strictEqual(ML.facetCount(F, 'has_floor_plan'), ML.filterVenues(Object.assign({}, F, { feats: new Set(['has_floor_plan']) })).length, '«Есть план зала» — объекты, а не залы');
});

test('R5 стр.128: включить → выключить любой фильтр — выдача и счётчики как до включения (общий тест)', () => {
  const { ML } = load(); ML.setTariff('prem');
  const F = ML.emptyFilters();
  const snap = () => JSON.stringify([ML.filterVenues(F).map(x => x.venue.id + ':' + x.halls.length),
    ML.VENUE_FILTERS.filter(d => d.control === 'check').map(d => ML.facetCount(F, d.code))]);
  const base = snap();
  ML.VENUE_FILTERS.filter(d => d.control === 'check').forEach(d => {
    F.feats.add(d.code); ML.pruneFilters(F); F.feats.delete(d.code); ML.pruneFilters(F);
    assert.strictEqual(snap(), base, d.code);
  });
  const E = ML.emptyFilters();
  [['people', 100], ['peopleTo', 300], ['rooms', 45], ['twin', 34], ['sngl', 43], ['dressing', 2], ['wardrobe', 200], ['parkingSpaces', 50], ['avgCheck', 3000],
   ['priceDay', [20000, 90000]], ['priceHour', [3000, 9000]], ['confPkg', [2000, 4000]]].forEach(([k, v]) => {
    F[k] = v; ML.filterVenues(F); F[k] = JSON.parse(JSON.stringify(E[k])); ML.pruneFilters(F);
    assert.strictEqual(snap(), base, k);
  });
  // сценарий клиента: «Есть проживание» + номера → снять галочку — номера сбрасываются, выдача возвращается
  F.feats.add('has_accommodation'); F.rooms = 45; F.twin = 34; F.sngl = 43;
  assert.ok(ML.filterVenues(F).length < ML.VENUES.length);
  F.feats.delete('has_accommodation'); ML.pruneFilters(F);
  assert.deepStrictEqual([F.rooms, F.twin, F.sngl], [0, 0, 0], 'поля номеров — под «Есть проживание»');
  assert.strictEqual(snap(), base);
  [['cats', 'Отель'], ['cuisine', 'european']].forEach(([k, v]) => { F[k].add(v); F[k].delete(v); assert.strictEqual(snap(), base, k); });
  F.parking = 'private'; F.parkingSpaces = 50; F.parking = ''; ML.pruneFilters(F);
  assert.strictEqual(F.parkingSpaces, 0); assert.strictEqual(snap(), base, 'парковка');
  ML.hallReqAdd(F); Object.assign(F.halls[0], { seating: 'banquet', min: 120, area: 200 }); ML.hallReqRemove(F, 0);
  assert.strictEqual(snap(), base, 'блок «Зал N»');
});

test('R5 стр.132/136/156: введённые числа не округляются и не обрезаются; максимумы базы известны', () => {
  const saved = { people: 43, peopleTo: 56, priceDay: [43210, 87650], confPkg: [1234, 3456], avgCheck: 2345, dressing: 9, rooms: 777 };
  const { ML } = load({ ml_filters: saved });
  const F = ML.loadFilters();
  assert.deepStrictEqual([F.people, F.peopleTo, F.avgCheck, F.dressing, F.rooms], [43, 56, 2345, 9, 777]);
  assert.deepStrictEqual(plain(F.priceDay), [43210, 87650]);
  assert.deepStrictEqual(plain(F.confPkg), [1234, 3456]);
  const M = ML.DB_MAX;
  assert.ok(M.people > 0 && M.area > 0 && M.dressing > 0 && M.priceDay > 0, 'максимумы посчитаны');
  assert.strictEqual(M.people, Math.max(...ML.VENUES.flatMap(v => v.halls.map(ML.hallCapacity))), 'максимум вместимости — фактический, без округления');
  const big = ML.emptyFilters(); big.people = 10000;
  assert.strictEqual(big.people, 10000);
  assert.strictEqual(ML.filterVenues(big).length, 0, 'больше максимума — пустая выдача, значение не меняется');
  const { ML: M2 } = load({ ml_filters: { people: 10000, priceDay: [0, 999999] } });
  assert.strictEqual(M2.loadFilters().people, 10000, 'при загрузке не сбрасывается до максимума');
  assert.strictEqual(M2.loadFilters().priceDay[1], 999999);
});

test('R5 стр.140/137: площадь — у каждого зала; схема обязательна; перебор с возвратом учитывает площадь', () => {
  const { ML } = load(); ML.setTariff('prem');
  assert.strictEqual(ML.venueFilter('hall_area_min').control, null, 'общей «Площадь зала от» в панели нет');
  const halls = [{ seats: { theatre: 300, banquet: 200 }, area: 400 }, { seats: { theatre: 250 }, area: 150 }];
  // зал 0 подходит под оба требования, но площадь 300+ есть только у него
  const r = ML.hallsSatisfy(halls, [{ seating: 'theatre', min: 200 }, { seating: 'banquet', min: 100, area: 300 }]);
  assert.strictEqual(r.ok, true);
  assert.deepStrictEqual(plain(r.used), [1, 0]);
  assert.strictEqual(ML.hallsSatisfy(halls, [{ seating: 'theatre', min: 100, area: 500 }]).ok, false, 'площадь меньше — требование не закрыто');
  assert.strictEqual(ML.hallsSatisfy(halls, [{ seating: 'board', min: 0 }]).ok, false, 'выбранной схемы у зала нет — не закрывает');
  const F = ML.emptyFilters(); ML.hallReqAdd(F);
  assert.strictEqual(ML.filterVenues(F).length, ML.VENUES.length, 'без схемы требование не применяется');
  Object.assign(F.halls[0], { seating: 'theatre', area: 600 });
  const res = ML.filterVenues(F);
  assert.ok(res.length > 0);
  res.forEach(x => x.halls.forEach(h => assert.ok(h.area >= 600 && h.seats.theatre > 0, x.venue.name + ' / ' + h.name)));
  assert.strictEqual(ML.hallReqLabel(F.halls[0], 0), 'Зал 1: театр · от 600 м²');
  // показ схем на плитке — только выбранные (стр.138)
  F.halls[0].area = 0; ML.hallReqAdd(F); Object.assign(F.halls[1], { seating: 'banquet', min: 50 });
  ML.filterVenues(F).forEach(x => x.halls.forEach(h => (x.seatKeys[h.id] || []).forEach(k => assert.ok(['theatre', 'banquet'].includes(k)))));
  // сохранённая общая площадь — в «Зал 1»
  const { ML: M2 } = load({ ml_filters: { hallArea: 300, halls: [{ seating: 'theatre', min: 100 }] } });
  assert.strictEqual(M2.loadFilters().halls[0].area, 300);
  assert.strictEqual(M2.loadFilters().hallArea, 0);
});

test('R5 стр.134: звёздность — только при «Отеле» или «Бутик-отеле», снятие категории сбрасывает звёзды', () => {
  const { ML } = load(); ML.setTariff('prem');
  const F = ML.emptyFilters(); F.stars.add(5);
  assert.strictEqual(ML.starsEnabled(F), false);
  assert.ok(ML.pruneFilters(F).includes('stars')); assert.strictEqual(F.stars.size, 0);
  F.cats.add('Отель'); F.stars.add(5); ML.pruneFilters(F);
  assert.strictEqual(F.stars.size, 1, 'с «Отелем» звёзды остаются');
  ML.filterVenues(F).forEach(x => assert.strictEqual(x.venue.stars, 5));
  F.cats.delete('Отель'); F.cats.add('Лофт'); ML.pruneFilters(F);
  assert.strictEqual(F.stars.size, 0, 'отели сняты — звёзды сброшены');
});

test('R5 стр.131/146: старые ссылки и фильтры с пустым типом — «Комбинированное»', () => {
  assert.strictEqual(load({ ml_filters: { eventType: '' } }).ML.loadFilters().eventType, 'combined');
  const { ML } = load();
  assert.strictEqual(ML.normEventType(''), 'combined');
  assert.ok(!ML.filtersSummary(ML.emptyFilters()).includes('Комбинированное'), 'тип по умолчанию в сводку не попадает');
});

test('R5 стр.165: отзыв — только после подтверждения обеими сторонами', () => {
  const { ML } = load({ ml_tariff: 'prem' });
  const r = ML.state.requests[0], venueId = r.objects[0].venueId, o = r.objects[0];
  assert.ok(ML.setStatus(r.id, venueId, 'done', { guests: 100, dates: '15.09.2026' }));
  assert.strictEqual(ML.canSetStatus(o, 'reviewed'), false, 'отметил только пользователь — отзыв недоступен');
  assert.strictEqual(ML.setStatus(r.id, venueId, 'reviewed', { review: { rating: 5, text: 'x' } }), false);
  ML.venueMarkDone(r.id, venueId, 100);
  assert.strictEqual(ML.canSetStatus(o, 'reviewed'), true, 'отметили обе стороны — отзыв доступен');
  assert.ok(ML.setStatus(r.id, venueId, 'reviewed', { review: { rating: 5, text: 'Всё прошло хорошо' } }));
});

test('R5 стр.155: зал объекта редактируется с текущими данными, удаляется, последний зал удалить нельзя', () => {
  const { ML } = load();
  const v = ML.state.myVenues[0], n = v.halls.length;
  const d = ML.hallToWizard(v.halls[1]);
  assert.ok(d.feats.length > 0 && Object.keys(d.seats).length > 0 && d.area > 0, 'в форме — оснащение, схемы, площадь');
  d.area = 401; d.feats = ['sound', 'led_screen']; d.seats.banquet = 130;
  ML.updateMyHall(0, 1, d);
  assert.strictEqual(ML.state.myVenues[0].halls.length, n, 'новый зал не создан');
  assert.strictEqual(ML.state.myVenues[0].halls[1].area, 401);
  assert.deepStrictEqual(plain(ML.state.myVenues[0].halls[1].features), ['sound', 'led_screen']);
  assert.strictEqual(ML.state.myVenues[0].halls[1].seats.banquet, 130);
  while (ML.state.myVenues[0].halls.length > 1) assert.ok(ML.removeMyHall(0, 0));
  assert.strictEqual(ML.removeMyHall(0, 0), false, 'последний зал не удаляется');
  assert.strictEqual(ML.state.myVenues[0].halls.length, 1);
});

test('R5 стр.162: вид тарифа для ролей — только вид страницы, сохранённый тариф не меняется', () => {
  const { ML, storage } = load({ ml_tariff: 'prem' });
  ML.setTariffView('guest');
  assert.strictEqual(ML.tariff().key, 'guest');
  assert.strictEqual(stored(storage, 'ml_tariff') || ML.state.tariff, 'prem', 'в хранилище — по-прежнему ПРЕМИУМ');
  ML.setTariffView(null);
  assert.strictEqual(ML.tariff().key, 'prem');
});

console.log(`\n${passed} прошло, ${failed} упало`);
process.exit(failed ? 1 : 0);

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
  const { ML, storage } = load();
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

test('лимиты тарифов: сравнение 2 / 5 / 10, групповой запрос БИЗНЕС — до 5 объектов', () => {
  const { ML } = load();
  assert.deepStrictEqual(plain(ML.plans().map(t => t.compare)), [2, 5, 10]);
  assert.strictEqual(ML.TARIFFS.biz.groupRequest, 5);
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

test('четыре типа мероприятий, по каждому есть выдача', () => {
  const { ML } = load();
  assert.deepStrictEqual(plain(ML.EVENT_TYPES.map(e => e.l)), ['Деловое', 'Банкет / фуршет', 'Свадьба', 'Тимбилдинг']);
  for (const e of ML.EVENT_TYPES) {
    const F = ML.emptyFilters(); F.eventType = e.k;
    assert.ok(ML.filterVenues(F).length > 0, e.l);
  }
  assert.strictEqual(ML.FEATURE_GROUPS.find(g => g.k === 'sport').onlyEvent, 'team', 'спортивные объекты — при тимбилдинге');
});

test('миграция сохранённых фильтров: старые типы и названия удобств', () => {
  const { ML, storage } = load({ ml_filters: { eventType: 'forum', food: ['Место для велкома'], other: ['Своя парковка'] } });
  const F = ML.loadFilters();
  assert.strictEqual(F.eventType, 'business');
  assert.deepStrictEqual([...F.food], ['Зона Welcome']);
  assert.deepStrictEqual([...F.other], ['Отдельная парковка']);
  const s = stored(storage, 'ml_filters');
  assert.deepStrictEqual(s.food, ['Зона Welcome'], 'хранилище перезаписано');
  for (const k of ['presentation', 'meeting', 'online'])
    assert.strictEqual(load({ ml_filters: { eventType: k } }).ML.loadFilters().eventType, 'business', k);
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
});

test('звёздность: «Без звёзд» и «1–2 звезды» дают непустую выдачу', () => {
  const { ML } = load({ ml_tariff: 'biz' });
  for (const k of [0, 2]) {
    const F = ML.emptyFilters(); F.stars = new Set([k]);
    assert.ok(ML.filterVenues(F).length > 0, 'вариант ' + k);
  }
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

test('архив: строка закрыта, если обе стороны отметили «состоялось», объект отклонил или пользователь отменил', () => {
  const { ML } = load();
  const reqs = ML.state.requests;
  // тестовые данные: в активных нет состоявшихся
  ML.activeRequests().forEach(q => ML.splitRequest(q).active.forEach(o => assert.ok(!ML.bothConfirmed(o), q.id)));
  const q = reqs.find(x => x.id === 'RQ-260714-0031');
  const live = q.objects.find(o => o.venueId === 1);
  assert.strictEqual(ML.isClosedRow(live), false);
  ML.setStatus(q.id, 1, 'done', { guests: 120 });
  assert.strictEqual(ML.isClosedRow(live), false, 'отметил только пользователь — ещё активен');
  ML.venueMarkDone(q.id, 1, 120);
  assert.strictEqual(ML.isClosedRow(live), true, 'обе стороны — в архиве');
  assert.ok(ML.venueDecline(q.id, 11, 'Нет свободных дат'));
  assert.strictEqual(q.objects.find(o => o.venueId === 11).status, 'declined');
  assert.strictEqual(ML.splitRequest(q).active.length, 0);
  assert.ok(ML.archivedRequests().some(x => x.id === q.id));
  assert.ok(!ML.activeRequests().some(x => x.id === q.id), 'все строки закрыты — запрос целиком в архиве');
  const q2 = reqs.find(x => x.id === 'RQ-260703-0018');
  ML.setStatus(q2.id, 7, 'cancelled', { reason: 'Передумали' });
  assert.strictEqual(ML.isClosedRow(q2.objects.find(o => o.venueId === 7)), true, 'отмена пользователем — в архив');
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

test('ступень «501+ чел.» — по согласованию, без подстановки ближайшей', () => {
  const { ML } = load();
  const t = ML.FEE_TIERS[ML.FEE_TIERS.length - 1];
  assert.strictEqual(t.label, '501+ чел.');
  assert.strictEqual(t.byAgreement, true);
  assert.strictEqual(t.fee, null);
});

console.log(`\n${passed} прошло, ${failed} упало`);
process.exit(failed ? 1 : 0);

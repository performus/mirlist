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
  assert.deepStrictEqual(plain(Object.keys(ML.REQUEST_FLOW)), ['sent', 'done', 'reviewed', 'cancelled']);
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

test('на ПРЕМИУМ в сравнение помещается 10 залов, 11-й — нет', () => {
  const { ML } = load({ ml_tariff: 'prem' });
  const ids = ML.VENUES.flatMap(v => v.halls.map(h => h.id)).slice(0, 11);
  ids.slice(0, 10).forEach(id => assert.ok(ML.toggleCompare(id).ok));
  assert.strictEqual(ML.toggleCompare(ids[10]).ok, false);
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

console.log(`\n${passed} прошло, ${failed} упало`);
process.exit(failed ? 1 : 0);

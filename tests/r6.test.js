/* Раунд R6 (бэклог 15.11): сценарии модели app/data.js без браузера — node tests/r6.test.js
   Та же обвязка, что в lifecycle.test.js: data.js в чистой среде с моком localStorage. */
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
  };
}
function load(initial) {
  const raw = {};
  for (const k in initial || {}) raw[k] = JSON.stringify(initial[k]);
  const localStorage = mockStorage(raw);
  const window = {};
  vm.runInNewContext(SRC, { window, localStorage, console });
  return { ML: window.ML, storage: localStorage };
}
const plain = (x) => JSON.parse(JSON.stringify(x));
const withF = (ML, o) => Object.assign(ML.emptyFilters(), o);

let passed = 0, failed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log('  ✓ ' + name); }
  catch (e) { failed++; console.log('  ✗ ' + name + '\n      ' + (e.message || e)); }
}

console.log('R6 — бэклог 15.11');

test('стр.180/185/209: «Есть план зала» — свойство зала в «Оснащении зала», «Расширенных параметров» нет; «С поэтажным планом» — свойство объекта', () => {
  const { ML } = load(); ML.setTariff('prem');
  const hp = ML.venueFilter('has_floor_plan'), fp = ML.venueFilter('venue_floor_plan');
  assert.strictEqual(hp.group, 'equip'); assert.strictEqual(hp.level, 'hall'); assert.ok(!hp.advanced);
  assert.ok(ML.hallReqDefs().some(d => d.code === 'has_floor_plan'), 'чекбокс есть в блоке «Зал N»');
  assert.strictEqual(ML.VENUE_FILTERS.filter(d => d.advanced && d.control).length, 0, 'группа «Расширенные параметры» пустая — её нет');
  assert.strictEqual(fp.control, 'check'); assert.strictEqual(fp.level, 'venue'); assert.strictEqual(fp.label, 'С поэтажным планом');
  const withPlan = ML.VENUES.filter(v => v.floorPlan);
  assert.ok(withPlan.length >= 4 && withPlan.length <= 6, 'поэтажный план у 4–6 объектов: ' + withPlan.length);
  assert.ok(withPlan.every(v => /\.pdf$/i.test(v.floorPlan.url)), 'план — PDF');
});

test('стр.180/185: счётчик «Есть план зала» и «С поэтажным планом» = число объектов после применения (на разных наборах)', () => {
  const { ML } = load(); ML.setTariff('prem');
  const sets = [ML.emptyFilters(), withF(ML, { city: 'Москва' }), withF(ML, { people: 100 }), withF(ML, { feats: new Set(['has_floor_plan']) }),
    withF(ML, { feats: new Set(['venue_floor_plan']) })];
  sets.forEach((F, si) => ['has_floor_plan', 'venue_floor_plan'].forEach(code => {
    const G = Object.assign({}, F, { feats: new Set([...F.feats, code]) });
    assert.strictEqual(ML.facetCount(F, code), ML.filterVenues(G).length, `набор ${si}: ${code}`);
  }));
  const n = ML.filterVenues(withF(ML, { feats: new Set(['venue_floor_plan']) })).length;
  assert.strictEqual(n, ML.VENUES.filter(v => v.floorPlan).length, 'фильтр находит все объекты с поэтажным планом');
  // «Есть план зала» в блоке «Зал N» проверяется у конкретного зала
  const F = withF(ML, {}); ML.hallReqAdd(F); F.halls[0].seating = 'theatre'; ML.hallReqToggle(F, 0, 'has_floor_plan');
  assert.ok(ML.filterVenues(F).every(x => x.halls.some(h => h.plan)), 'подобранный зал — с планом');
});

test('стр.186: в «Оснащении зала» только пункты зала; Wi‑Fi, интернет и грузовой лифт — в «Инфраструктуре»; отмеченное переносится в блоки залов', () => {
  const { ML } = load(); ML.setTariff('prem');
  assert.ok(ML.VENUE_FILTERS.filter(d => d.group === 'equip').every(d => d.level === 'hall'), 'в «Оснащении зала» — только level hall');
  ['internet', 'wifi', 'freight_elevator'].forEach(c => {
    assert.strictEqual(ML.venueFilter(c).group, 'infra', c); assert.strictEqual(ML.venueFilter(c).level, 'venue', c);
  });
  const F = withF(ML, { feats: new Set(['screen', 'led_screen', 'wifi']) });
  const before = ML.filterVenues(F).length;
  const r = ML.hallReqAdd(F);
  assert.deepStrictEqual(plain(r.moved), ['screen', 'led_screen'], 'перенесены отмеченные пункты зала');
  assert.deepStrictEqual(plain([...F.feats]), ['wifi'], 'свойство объекта остаётся общим');
  assert.deepStrictEqual(plain(F.halls[0].feats), ['screen', 'led_screen']);
  F.halls[0].seating = 'theatre';
  assert.ok(ML.filterVenues(F).length <= before);
  const r2 = ML.hallReqAdd(F);
  assert.deepStrictEqual(plain(r2.moved), [], 'второй блок ничего не забирает');
  // состояние в обход панели: общий пункт зала при двух блоках относится к обоим
  const G = withF(ML, { feats: new Set(['projector']) });
  G.halls = [{ seating: 'theatre', min: 10, area: 0, feats: [] }, { seating: 'banquet', min: 10, area: 0, feats: [] }];
  ML.filterVenues(G).forEach(x => x.halls.forEach(h => assert.ok(ML.hallHas(h, 'projector'), x.venue.name + ': ' + h.name)));
});

test('стр.136: «В базе максимум N» — по выбранной схеме блока; ввод ровно максимума даёт непустую выдачу, на единицу больше — пустую', () => {
  const { ML } = load(); ML.setTariff('prem');
  const block = (o) => { const F = ML.emptyFilters(); F.halls = [Object.assign({ seating: '', min: 0, area: 0, feats: [] }, o)]; return F; };
  ML.SEATING.forEach(s => {
    const M = ML.hallReqMax({ seating: s.k });
    if (!M.people) return;
    assert.ok(ML.filterVenues(block({ seating: s.k, min: M.people })).length > 0, `${s.l}: ${M.people} — есть выдача`);
    assert.strictEqual(ML.filterVenues(block({ seating: s.k, min: M.people + 1 })).length, 0, `${s.l}: ${M.people + 1} — пусто`);
    assert.ok(M.people <= ML.DB_MAX.people, `${s.l}: не больше общего максимума`);
  });
  const th = ML.hallReqMax({ seating: 'theatre' }).people, cls = ML.hallReqMax({ seating: 'class' }).people;
  assert.ok(cls < ML.DB_MAX.people, 'класс меньше общего максимума — подсказка теперь честная');
  // площадь и оснащение блока сужают максимум
  [{ seating: 'banquet', feats: ['led_screen'] }, { seating: 'theatre', area: 300 }, { seating: 'class', feats: ['has_floor_plan', 'projector'] }].forEach(o => {
    const M = ML.hallReqMax(o);
    assert.ok(M.people > 0 && M.people <= ML.hallReqMax({ seating: o.seating }).people, JSON.stringify(o));
    assert.ok(ML.filterVenues(block(Object.assign({}, o, { min: M.people }))).length > 0, 'максимум с площадью/оснащением: ' + JSON.stringify(o));
    const A = ML.hallReqMax(Object.assign({}, o, { min: M.people })).area;
    assert.ok(ML.filterVenues(block(Object.assign({}, o, { min: M.people, area: A }))).length > 0, 'максимум площади при этой вместимости');
  });
  // каждый из нескольких блоков по отдельности: максимум своей схемы находит объект
  const F = ML.emptyFilters(); ML.hallReqAdd(F); ML.hallReqAdd(F);
  F.halls[0].seating = 'theatre'; F.halls[1].seating = 'banquet';
  F.halls.forEach((r, i) => {
    const G = ML.emptyFilters(); G.halls = [Object.assign({}, r, { min: ML.hallReqMax(r).people })];
    assert.ok(ML.filterVenues(G).length > 0, 'Зал ' + (i + 1));
  });
  assert.ok(th > 0);
});

test('стр.184: счётчик чекбокса оснащения в блоке «Зал N» = число объектов, если отметить пункт у этого зала', () => {
  const { ML } = load(); ML.setTariff('prem');
  const F = ML.emptyFilters(); ML.hallReqAdd(F); ML.hallReqAdd(F);
  F.halls[0].seating = 'theatre'; F.halls[0].min = 100; F.halls[1].seating = 'banquet';
  [0, 1].forEach(i => ML.hallReqDefs().forEach(d => {
    const G = Object.assign({}, F, { halls: F.halls.map((r, k) => k === i ? Object.assign({}, r, { feats: [...new Set(r.feats.concat(d.code))] }) : r) });
    assert.strictEqual(ML.hallReqFacet(F, i, d.code), ML.filterVenues(G).length, `Зал ${i + 1}: ${d.code}`);
  }));
  ML.hallReqToggle(F, 0, 'led_screen');
  assert.strictEqual(ML.hallReqFacet(F, 0, 'led_screen'), ML.filterVenues(F).length, 'отмеченный пункт — текущая выдача');
});

test('стр.177: поиск по названию — объект и его залы, без регистра и кавычек, вместе с фильтрами; счётчики учитывают название', () => {
  const { ML } = load(); ML.setTariff('prem');
  const aurora = ML.VENUES.find(v => /Аврора/.test(v.name));
  ['аврора', 'АВРОРА', '«Аврора»', '"аврора"', 'отель аврора'].forEach(q => {
    const ids = ML.filterVenues(withF(ML, { name: q })).map(x => x.venue.id);
    assert.ok(ids.includes(aurora.id), q);
  });
  const hall = ML.VENUES.flatMap(v => v.halls.map(h => ({ v, h }))).find(x => !ML.normName(x.v.name).includes(ML.normName(x.h.name)) && x.h.name.length > 6);
  assert.ok(ML.filterVenues(withF(ML, { name: hall.h.name.toUpperCase() })).some(x => x.venue.id === hall.v.id), 'по названию зала: ' + hall.h.name);
  // И с фильтрами
  const other = ML.filterVenues(withF(ML, { name: 'аврора', city: aurora.city })).length;
  assert.ok(other > 0);
  assert.strictEqual(ML.filterVenues(withF(ML, { name: 'аврора', city: 'Казань' })).length, 0);
  // счётчики учитывают название
  const F = withF(ML, { name: 'аврора' });
  ML.VENUE_FILTERS.filter(d => d.control === 'check').forEach(d => {
    const G = Object.assign({}, F, { feats: new Set([d.code]) });
    assert.strictEqual(ML.facetCount(F, d.code), ML.filterVenues(G).length, d.code);
  });
  assert.ok(ML.filtersActive(F), 'название — активный фильтр (кнопка «Сбросить всё»)');
  // пустая выдача: название есть в базе, но фильтры отсекают — называем условия
  const X = ML.explainEmpty(withF(ML, { name: 'аврора', city: 'Казань' }));
  assert.ok(X.named > 0, 'объект с таким названием есть');
  assert.deepStrictEqual(plain(X.reasons.map(r => r.key)), ['city']);
  // название, которого нет
  const Y = ML.explainEmpty(withF(ML, { name: 'нет-такого-объекта' }));
  assert.strictEqual(Y.named, 0); assert.strictEqual(Y.reasons[0].key, 'name');
  // сохранение и загрузка фильтров
  const again = load({ ml_filters: { name: 'аврора', city: 'Москва' } }).ML.loadFilters();
  assert.strictEqual(again.name, 'аврора');
});

test('стр.177: каталог поставщиков — по названию поставщика и названиям услуг', () => {
  const { ML } = load();
  const s0 = ML.SUPPLIERS.find(s => (s.services || []).length);
  const byName = ML.filterSuppliers(Object.assign(ML.emptySupplierFilters(), { name: s0.name.toLowerCase() }), null).map(s => s.id);
  assert.ok(byName.includes(s0.id), s0.name);
  const svc = s0.services[0].name;
  assert.ok(ML.filterSuppliers(Object.assign(ML.emptySupplierFilters(), { name: '«' + svc.toUpperCase() + '»' }), null).some(s => s.id === s0.id), 'по услуге: ' + svc);
  assert.strictEqual(ML.filterSuppliers(Object.assign(ML.emptySupplierFilters(), { name: 'нет-такой-услуги' }), null).length, 0);
});

test('стр.143/181: пустая выдача объясняет причину по цене «до» ниже минимума, по «от» выше максимума, по чекбоксам и сочетаниям', () => {
  const { ML } = load(); ML.setTariff('prem');
  const lo = ML.DB_MIN.priceDay;
  /* «по договорённости» проходит любой ценовой фильтр (R2), поэтому пустую выдачу дают сочетания: цена «до» ниже минимума
     базы и условие, которому залы «по договорённости» не отвечают. Причина — цена, с подсказкой «минимум в базе». */
  const A0 = ML.VENUE_FILTERS.filter(d => d.control === 'check').map(d => withF(ML, { feats: new Set([d.code]), priceDay: [0, lo - 1000] }))
    .find(F => !ML.filterVenues(F).length && ML.filterVenues(Object.assign({}, F, { priceDay: [0, ML.LIMITS.priceDay] })).length);
  assert.ok(A0, 'есть свойство, у залов которого цена указана (например, «Есть план зала»)');
  const A = ML.explainEmpty(A0);
  const pr = A.reasons.find(r => r.key === 'priceDay');
  assert.ok(pr, 'цена — среди причин: ' + JSON.stringify(plain(A.reasons)));
  assert.ok(/^Нет залов с арендой до .* ₽ в день — минимум в базе .* ₽$/.test(pr.text), pr.text);
  assert.ok(A.reasons.every(r => r.found > 0), 'у каждой причины — сколько найдётся без неё');
  const B = ML.explainEmpty(withF(ML, { priceDay: [ML.DB_MAX.priceDay + 1, ML.LIMITS.priceDay] }));
  assert.ok(/максимум в базе/.test(B.reasons[0].text), B.reasons[0].text);
  const C = ML.explainEmpty(withF(ML, { priceMode: 'hour', priceHour: [0, ML.DB_MIN.priceHour - 100] }));
  assert.ok(/₽ в час — минимум в базе/.test(C.reasons[0].text), C.reasons[0].text);
  const D = ML.explainEmpty(withF(ML, { confPkg: [0, ML.DB_MIN.confPkg - 100] }));
  assert.ok(/конференц-пакетом до .* — минимум в базе/.test(D.reasons[0].text), D.reasons[0].text);
  const E = ML.explainEmpty(withF(ML, { avgCheck: ML.DB_MIN.avgCheck - 100 }));
  assert.ok(/средним чеком до .* — минимум в базе/.test(E.reasons[0].text), E.reasons[0].text);
  // чекбоксы: пара свойств, которых вместе нет ни у одного объекта, — каждое по отдельности причина «Нет объектов с: …»
  const codes = ML.VENUE_FILTERS.filter(d => d.control === 'check' && d.level === 'venue').map(d => d.code);
  let pair = null;
  for (const a of codes) { for (const b of codes) { if (a < b && ML.filterVenues(withF(ML, { feats: new Set([a]) })).length && ML.filterVenues(withF(ML, { feats: new Set([b]) })).length
    && !ML.filterVenues(withF(ML, { feats: new Set([a, b]) })).length) { pair = [a, b]; break; } } if (pair) break; }
  assert.ok(pair, 'есть несовместимая пара свойств');
  const P = ML.explainEmpty(withF(ML, { feats: new Set(pair) }));
  assert.deepStrictEqual(plain(P.reasons.map(r => r.key).sort()), pair.map(c => 'feat:' + c).sort());
  assert.ok(P.reasons.every(r => r.text.startsWith('Нет объектов с: ')), JSON.stringify(plain(P.reasons)));
  // сброс одного условия возвращает выдачу
  const G = withF(ML, { feats: new Set(pair) });
  ML.resetCondition(G, 'feat:' + pair[0]);
  assert.ok(ML.filterVenues(G).length > 0);
  // сочетание из трёх, где ни одно снятие не помогает, — кандидаты со сбросом
  const T = withF(ML, { people: ML.DB_MAX.people + 1, feats: new Set(['has_accommodation']), rooms: ML.DB_MAX.rooms + 1 });
  const XT = ML.explainEmpty(T);
  assert.deepStrictEqual(plain(XT.reasons.map(r => r.key).sort()), ['people', 'rooms'], 'оба условия за пределами базы — каждое причина');
  assert.ok(XT.reasons.every(r => /максимум в базе/.test(r.text)));
  // только сочетание: каждое условие само по себе находит объекты, снятие любого одного — нет → кандидаты
  const triple = (() => { for (const a of codes) for (const b of codes) for (const c of codes) {
    if (!(a < b && b < c)) continue;
    const F = withF(ML, { feats: new Set([a, b, c]) });
    if (ML.filterVenues(F).length) continue;
    const ok = [[a, b], [a, c], [b, c]].every(p => !ML.filterVenues(withF(ML, { feats: new Set(p) })).length);
    if (ok) return F; } return null; })();
  if (triple) {
    const XC = ML.explainEmpty(triple);
    assert.strictEqual(XC.reasons.length, 0); assert.strictEqual(XC.combo.length, 3, 'три кандидата со сбросом');
  }
  // R5: введённое не меняется при разборе
  assert.strictEqual(T.people, ML.DB_MAX.people + 1);
});

test('стр.143: «В базе от N до M» — фактический разброс базы', () => {
  const { ML } = load();
  const days = ML.VENUES.flatMap(v => v.halls.map(h => h.priceDay)).filter(n => n > 0);
  assert.strictEqual(ML.DB_MIN.priceDay, Math.min(...days)); assert.strictEqual(ML.DB_MAX.priceDay, Math.max(...days));
  ['priceHour', 'confPkg', 'avgCheck', 'area', 'rooms'].forEach(k => assert.ok(ML.DB_MIN[k] > 0 && ML.DB_MIN[k] <= ML.DB_MAX[k], k));
});

console.log(`\n${passed} прошло, ${failed} упало`);
process.exit(failed ? 1 : 0);

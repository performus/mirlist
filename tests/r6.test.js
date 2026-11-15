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

console.log(`\n${passed} прошло, ${failed} упало`);
process.exit(failed ? 1 : 0);

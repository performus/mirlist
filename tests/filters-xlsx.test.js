/* R3-A: сверка конфига фильтров (app/data.js → ML.VENUE_FILTERS, ML.SUPPLIER_FILTERS)
   с файлом клиента «ФИЛЬТРЫ — редактура 20.10.xlsx», листы «Площадки» и «Поставщики».
   Сравнивает по служебному коду (колонка L / G): название, тип контрола, условие показа, решение.
   Запуск: node tests/filters-xlsx.test.js [путь к xlsx]
   Без файла (например, на чужой машине) сверка пропускается, тест не падает.
   С ключом --md печатает таблицу расхождений в Markdown — она идёт в отчёт. */
'use strict';
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const vm = require('vm');

const XLSX = process.argv.find(a => a.endsWith('.xlsx'))
  || path.join(__dirname, '..', '..', 'r3', 'inputs', 'ФИЛЬТРЫ — редактура 20.10.xlsx');
const MD = process.argv.includes('--md');

/* ── минимальное чтение xlsx: zip (deflate) + XML общих строк и листов ── */
function unzip(buf) {
  let eocd = buf.length - 22;
  while (eocd >= 0 && buf.readUInt32LE(eocd) !== 0x06054b50) eocd--;
  const n = buf.readUInt16LE(eocd + 10);
  let p = buf.readUInt32LE(eocd + 16);
  const files = {};
  for (let i = 0; i < n; i++) {
    const method = buf.readUInt16LE(p + 10), csize = buf.readUInt32LE(p + 20);
    const nlen = buf.readUInt16LE(p + 28), xlen = buf.readUInt16LE(p + 30), clen = buf.readUInt16LE(p + 32);
    const off = buf.readUInt32LE(p + 42);
    const name = buf.slice(p + 46, p + 46 + nlen).toString('utf8');
    const lnlen = buf.readUInt16LE(off + 26), lxlen = buf.readUInt16LE(off + 28);
    const data = buf.slice(off + 30 + lnlen + lxlen, off + 30 + lnlen + lxlen + csize);
    files[name] = method === 8 ? zlib.inflateRawSync(data) : data;
    p += 46 + nlen + xlen + clen;
  }
  return files;
}
const unxml = (s) => s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&');
function readSheets(file) {
  const z = unzip(fs.readFileSync(file));
  const str = (n) => (z[n] || Buffer.alloc(0)).toString('utf8');
  const shared = [...str('xl/sharedStrings.xml').matchAll(/<si>([\s\S]*?)<\/si>/g)]
    .map(m => unxml([...m[1].matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map(t => t[1]).join('')));
  const rels = {};
  for (const m of str('xl/_rels/workbook.xml.rels').matchAll(/<Relationship [^>]*Id="([^"]+)"[^>]*Target="([^"]+)"/g)) rels[m[1]] = m[2];
  for (const m of str('xl/_rels/workbook.xml.rels').matchAll(/<Relationship [^>]*Target="([^"]+)"[^>]*Id="([^"]+)"/g)) rels[m[2]] = m[1];
  const sheets = {};
  for (const m of str('xl/workbook.xml').matchAll(/<sheet [^>]*name="([^"]+)"[^>]*r:id="([^"]+)"/g)) {
    const target = rels[m[2]].replace(/^\/?(xl\/)?/, 'xl/');
    const rows = {};
    for (const c of str(target).matchAll(/<c r="([A-Z]+)(\d+)"([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const [, col, row, attrs, inner] = c;
      if (!inner) continue;
      const v = (inner.match(/<v>([\s\S]*?)<\/v>/) || [])[1];
      const t = (attrs.match(/t="(\w+)"/) || [])[1];
      let val = t === 's' ? shared[+v] : t === 'inlineStr' ? unxml((inner.match(/<t[^>]*>([\s\S]*?)<\/t>/) || [])[1] || '') : (v != null ? unxml(v) : '');
      (rows[row] = rows[row] || {})[col] = val;
    }
    sheets[unxml(m[1])] = rows;
  }
  return sheets;
}

/* ── нормализация файла: как переносили названия и контролы ── */
const clean = (s) => String(s || '').replace(/\s+/g, ' ').trim().replace(/^"(.*)"$/, '$1').replace(/^«(.*)»$/, '$1');
const TYPOS = { 'Начисляет балы': 'Начисляет баллы', 'Можно запускать конфети': 'Можно запускать конфетти',
  'Можно со своим тех. Оснащением': 'Можно со своим тех. оснащением', 'Минимальное Количество часов': 'Минимальное количество часов' };
const nameOf = (s) => TYPOS[clean(s)] || clean(s);
/* «Как выбирается» (колонка C) → тип контрола конфига */
function controlOf(c) {
  c = clean(c).toLowerCase();
  if (!c) return '';
  if (c.startsWith('автозаполнение')) return 'city';
  if (c.startsWith('выпадающий список')) return 'select';
  if (c.startsWith('2 поля + двойной ползунок')) return 'range2';
  if (c.startsWith('2 поля: от и до')) return 'fromTo';
  if (c.startsWith('чекбоксы со счётчиками') || c === 'чекбоксы') return 'checks';
  if (c.startsWith('чекбокс')) return 'check';
  if (c.startsWith('числовое поле «до»')) return 'numTo';
  if (c.startsWith('числовое поле')) return 'numFrom';
  if (c.startsWith('поле / ползунок «до»')) return 'numTo';
  if (c.startsWith('поле / ползунок «от»')) return 'sliderFrom';
  if (c.startsWith('мультивыбор')) return 'multi';
  if (c.startsWith('сегменты')) return 'segments';
  if (c.startsWith('повторяемый блок')) return 'halls';
  if (c.startsWith('дерево')) return 'tree';
  return '?' + c;
}
const EVCOLS = { E: 'business', F: 'banquet', G: 'wedding', H: 'teambuilding' };

/* ── модель ── */
function loadModel() {
  const src = fs.readFileSync(path.join(__dirname, '..', 'app', 'data.js'), 'utf8');
  const store = {};
  const window = {};
  vm.runInNewContext(src, { window, console, localStorage: { getItem: (k) => store[k] || null, setItem: (k, v) => { store[k] = String(v); }, removeItem() {} } });
  return window.ML;
}

function compare() {
  const ML = loadModel();
  const sh = readSheets(XLSX);
  const diffs = [];
  const rows = [];
  const add = (sheet, row, name, field, file, site) => diffs.push({ sheet, row, name, field, file, site });

  /* Площадки: фильтры (B = «Фильтр» / «Зависимый фильтр») сверяем с ML.VENUE_FILTERS, варианты — с opts */
  const V = sh['Площадки'];
  let cur = null;
  for (const r of Object.keys(V).map(Number).sort((a, b) => a - b)) {
    const x = V[r]; if (r < 5) continue;
    const kind = clean(x.B), code = clean(x.L).replace(/^venue\./, ''), decision = clean(x.J), name = nameOf(x.A);
    if (kind === 'Фильтр' || kind === 'Зависимый фильтр') {
      cur = ML.VENUE_FILTERS.find(d => d.code === (code || 'confetti'));
      const events = Object.keys(EVCOLS).filter(c => clean(x[c]) === '●').map(c => EVCOLS[c]);
      const always = events.length === 4;
      rows.push({ sheet: 'Площадки', row: r, name, decision, site: cur });
      if (!cur) { add('Площадки', r, name, 'нет в конфиге', code, '—'); continue; }
      if (cur.label !== name) add('Площадки', r, name, 'название', name, cur.label);
      if ((cur.decision || '') !== decision) add('Площадки', r, name, 'решение', decision || '(пусто)', cur.decision || '(пусто)');
      const want = controlOf(x.C);
      const has = cur.control === null ? 'нет (' + (cur.planned || '') + ')' : cur.control;
      if (decision === 'Удалить' || decision === 'СЛ ЭТАП') { if (cur.control !== null) add('Площадки', r, name, 'контрол', 'не показывать', has); }
      else if (cur.control !== want) add('Площадки', r, name, 'контрол', want, has);
      const siteEvents = cur.events ? cur.events.slice().sort() : null;
      if (!always && JSON.stringify(siteEvents) !== JSON.stringify(events.slice().sort())) add('Площадки', r, name, 'условие показа', events.join(', '), siteEvents ? siteEvents.join(', ') : 'всегда');
      if (always && siteEvents) add('Площадки', r, name, 'условие показа', 'всегда', siteEvents.join(', '));
    } else if (kind === 'Вариант выбора' && cur) {
      const ocode = clean(x.L).split('.').pop();
      const opt = (cur.opts || []).find(o => ocode ? o.code === ocode : o.l === name);   // у «Комбинированного» кода в файле нет
      if (!opt) { add('Площадки', r, name, 'вариант нет в конфиге', ocode, '—'); continue; }
      if (opt.l !== name && !(cur.code === 'event_type')) add('Площадки', r, name, 'название варианта', name, opt.l);
      const od = opt.decision != null ? opt.decision : cur.decision;
      if ((od || '') !== decision && decision) add('Площадки', r, name, 'решение варианта', decision, od || '(пусто)');
    }
  }

  /* Поставщики: дерево «Услуги» и фильтры */
  const S = sh['Поставщики'];
  let sec = null;
  for (const r of Object.keys(S).map(Number).sort((a, b) => a - b)) {
    const x = S[r]; if (r < 6) continue;
    const kind = clean(x.B), code = clean(x.G).replace(/^supplier\./, ''), decision = clean(x.E), name = nameOf(x.A);
    if (kind === 'Группа вариантов') {
      sec = ML.SUPPLIER_SECTIONS.find(s => 'supplier_category.' + s.code === clean(x.G));
      rows.push({ sheet: 'Поставщики', row: r, name, decision, site: sec ? { label: sec.l, control: 'tree' } : null });
      if (!sec) add('Поставщики', r, name, 'раздел нет в дереве', clean(x.G), '—');
      else if (sec.l !== name) add('Поставщики', r, name, 'название раздела', name, sec.l);
    } else if (kind === 'Вариант выбора' && clean(x.G).startsWith('supplier_category.') && sec) {
      const kcode = clean(x.G).split('.').pop();
      const kid = sec.kids.find(k => k.code === kcode);
      rows.push({ sheet: 'Поставщики', row: r, name, decision, site: kid ? { label: kid.l, control: 'tree' } : null });
      if (!kid) add('Поставщики', r, name, 'пункт нет в дереве', clean(x.G), '—');
      else {
        if (kid.l !== name) add('Поставщики', r, name, 'название пункта', name, kid.l);
        if ((kid.decision || '') !== decision) add('Поставщики', r, name, 'решение', decision, kid.decision);
      }
    } else if (kind === 'Фильтр' || kind === 'Зависимый фильтр') {
      const d = ML.SUPPLIER_FILTERS.find(f => f.code === code);
      rows.push({ sheet: 'Поставщики', row: r, name, decision, site: d });
      if (!d) { add('Поставщики', r, name, 'нет в конфиге', code, '—'); continue; }
      if (d.label !== name) add('Поставщики', r, name, 'название', name, d.label);
      if ((d.decision || '') !== decision) add('Поставщики', r, name, 'решение', decision, d.decision);
      const want = controlOf(x.C);
      if (decision === 'Удалить') { if (d.control !== null) add('Поставщики', r, name, 'контрол', 'не показывать', d.control); }
      else if (d.control !== want) add('Поставщики', r, name, 'контрол', want, d.control);
    } else if (kind === 'Вариант выбора' && clean(x.G).startsWith('supplier_price_unit.')) {
      const u = ML.PRICE_UNITS.find(p => p.code === clean(x.G).split('.').pop());
      if (!u) add('Поставщики', r, name, 'единица цены нет в конфиге', clean(x.G), '—');
      else if (u.l !== name || u.decision !== decision) add('Поставщики', r, name, 'единица цены', name + ' / ' + decision, u.l + ' / ' + u.decision);
    }
  }
  return { diffs, rows };
}

if (!fs.existsSync(XLSX)) {
  console.log('Сверка с файлом фильтров пропущена: нет файла ' + XLSX);
  process.exit(0);
}
const { diffs: all, rows } = compare();
/* R5: осознанные отступления от файла — объяснены в R5_REPORT.md («Решения на согласование»).
   Звёздность (зависит от категории) и гримёрки (перенесены в «Инфраструктуру») с файлом не расходятся
   по сверяемым полям — они перечислены здесь, чтобы список отступлений был полным. */
const EXPLAINED = [
  { name: 'Гардероб', field: 'контрол', why: 'R5 стр.151: чекбокс «Гардероб» и под ним поле «мест от»' },
  { name: 'Площадь зала от, м²', field: 'контрол', why: 'R5 стр.140: площадь задаётся у каждого зала в блоке «Зал N»' },
];
const NOTES = ['Звёздность — R5 стр.134: доступна только при категориях «Отель» и «Бутик-отель» (в файле — «Всегда»)',
  'Гримёрок от — R5 стр.142: перенесено из «Расширенных параметров» залов в «Инфраструктуру»'];
const isExplained = (d) => EXPLAINED.some(e => e.name === d.name && e.field === d.field);
const diffs = all.filter(d => !isExplained(d)), explained = all.filter(isExplained);
if (MD) {
  console.log('| Лист | Строка | Фильтр | Что | В файле | На сайте |\n|---|---|---|---|---|---|');
  diffs.forEach(d => console.log(`| ${d.sheet} | ${d.row} | ${d.name} | ${d.field} | ${d.file} | ${d.site} |`));
  console.log(`\nСтрок файла сверено: ${rows.length}, расхождений: ${diffs.length}.`);
} else {
  console.log(`Сверка с «${path.basename(XLSX)}»: строк ${rows.length}, расхождений ${diffs.length}, объяснённых отступлений ${explained.length + NOTES.length}`);
  diffs.forEach(d => console.log(`  • ${d.sheet}, стр. ${d.row}, «${d.name}» — ${d.field}: в файле «${d.file}», на сайте «${d.site}»`));
  if (process.argv.includes('--explained')) {
    explained.forEach(d => console.log(`  ◦ «${d.name}» — ${d.field}: в файле «${d.file}», на сайте «${d.site}» — ${EXPLAINED.find(e => e.name === d.name).why}`));
    NOTES.forEach(t => console.log('  ◦ ' + t));
  }
}
/* Расхождения — не падение: часть из них решения, принятые осознанно (они перечислены в отчёте).
   Падаем только если фильтра из файла нет в конфиге вовсе. */
const missing = diffs.filter(d => /нет в конфиге|нет в дереве/.test(d.field));
// R5: необъяснённых расхождений быть не должно
process.exit(missing.length || diffs.length ? 1 : 0);

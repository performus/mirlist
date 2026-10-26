/* R4: тест покрытия текста B2B-лендингов. node tests/landings-text.test.js
   Берёт каждый md из docs/landings (без комментариев и разметки), разбивает на заголовки,
   абзацы, пункты и кнопки (« · ») и проверяет, что каждый фрагмент есть в тексте страницы.
   Сравнение — после нормализации пробелов, кавычек и пробелов перед знаками препинания.
   Явные опечатки источника исправлены на страницах — таблица FIXES ниже (она же в отчёте). */
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const PAGES = [
  { md: 'лендинг_площадкам2.md', html: 'list-venue.html' },
  { md: 'лендинг_агентствам.md', html: 'for-organizers.html' },
  { md: 'лендинг_поставщикам.md', html: 'for-suppliers.html' },
  { md: 'лендинг_артистам.md', html: 'for-artists.html' },
];
/* явные опечатки: [как в источнике, как на странице] */
const FIXES = {
  'лендинг_поставщикам.md': [
    ['в котором вы хотели бы разместиться и перейдите', 'в котором вы хотели бы разместиться, и перейдите'],
  ],
  'лендинг_артистам.md': [
    ['впринципе', 'в принципе'],
    ['понять открыты ли вы', 'понять, открыты ли вы'],
    ['Вас выбирают, потому, что вы интересны', 'Вас выбирают, потому что вы интересны'],
    ['Уточните пожалуйста продолжительноть', 'Уточните, пожалуйста, продолжительность'],
    ['уточните предусмотрены ли', 'уточните, предусмотрены ли'],
    ['Будет ли проводится', 'Будет ли проводиться'],
  ],
};

const norm = (s) => s
  .replace(/[   ]/g, ' ')
  .replace(/[«»„“”"]/g, '"')
  .replace(/[‘’']/g, "'")
  .replace(/\s+/g, ' ')
  .replace(/ ([,.!?:;)])/g, '$1')
  .replace(/\( /g, '(')
  .trim();

function mdFragments(src, fixes) {
  let t = src.replace(/\\?<!--[\s\S]*?-->/g, ' ').replace(/<br\s*\/?>/gi, ' ');
  const out = [];
  for (let line of t.split(/\r?\n/)) {
    line = line.trim();
    if (!line || /^(\*{3,}|-{3,})$/.test(line)) continue;
    line = line.replace(/^#{1,6}\s*/, '').replace(/^>\s?/, '').replace(/^[-*]\s+/, '')
      .replace(/\\\s*$/, '').replace(/\*\*|\*/g, '').replace(/\\([\[\]<>])/g, '$1').replace(/<([^\s<>@]+@[^\s<>]+)>/g, '$1');
    for (const part of line.split(' · ')) {
      let f = part.trim();
      if (!/[A-Za-zА-Яа-яЁё0-9]/.test(f)) continue;
      for (const [from, to] of fixes) f = f.split(from).join(to);
      out.push(f);
    }
  }
  return out;
}

function pageText(html) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ').replace(/<style[\s\S]*?<\/style>/gi, ' ').replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ').replace(/&laquo;/g, '«').replace(/&raquo;/g, '»').replace(/&mdash;/g, '—').replace(/&ndash;/g, '–')
    .replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
}

let total = 0, found = 0;
const missing = [];
for (const p of PAGES) {
  const md = fs.readFileSync(path.join(ROOT, 'docs', 'landings', p.md), 'utf8');
  const html = fs.readFileSync(path.join(ROOT, 'app', p.html), 'utf8');
  const text = norm(pageText(html));
  const frags = mdFragments(md, FIXES[p.md] || []);
  let ok = 0;
  frags.forEach(f => { if (text.includes(norm(f))) ok++; else missing.push(`${p.html}: «${f.slice(0, 120)}»`); });
  // ТЗ дизайнера и служебные комментарии на страницу не выводятся
  if (/дизайнеру/i.test(text)) missing.push(`${p.html}: на странице текст комментария «дизайнеру»`);
  console.log(`  ${ok === frags.length ? '✓' : '✗'} ${p.html} ← ${p.md}: ${ok} из ${frags.length}`);
  total += frags.length; found += ok;
}
console.log(`\nТекст лендингов: ${found} из ${total} фрагментов на месте`);
if (missing.length) { console.log('Пропуски:\n' + missing.map(m => '  — ' + m).join('\n')); process.exit(1); }

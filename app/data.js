/* ═══════════════════════════════════════════════════════════════════════════
   app/data.js — единый источник данных МАЙСЛИСТ.
   Подключать ПЕРЕД shared.js на каждой странице:
     <script src="data.js"></script>
     <script src="shared.js"></script>

   Заменяет собой шесть разрозненных массивов площадок, которые сейчас лежат
   в shared.js, homepage.html, venue.html, compare.html, venue-presentation.html
   и dashboard.html. Ключевое отличие от старой модели: ЗАЛ — самостоятельная
   сущность со своей вместимостью по схемам рассадки и своей ценой. Пользователь
   ищет залы, а не объекты; объект — контейнер и карточка-приложение к залу.

   В конце файла — шим совместимости: собирает старый MH.VENUES из новых данных,
   чтобы catalog.html и search.html продолжали работать во время миграции.
   ═══════════════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  /* ─────────── 1. СПРАВОЧНИКИ И КОНФИГ ФИЛЬТРОВ ───────────
     R3-A: единственный источник правды по фильтрам — файл клиента
     «ФИЛЬТРЫ — редактура 20.10.xlsx», листы «Площадки» и «Поставщики».
     Здесь он перенесён в конфиг VENUE_FILTERS / SUPPLIER_FILTERS; по нему строятся
     панели фильтров (search.html, suppliers.html), визарды кабинетов и карточки.
     code — служебный код из колонки L без префикса («venue.cuisine» → cuisine);
     по коду tests/filters-xlsx.test.js сверяет конфиг с файлом.

     control — как выбирается (колонка C), буквально:
       city      поле с автоподсказкой           select    выпадающий список, один выбор
       range2    2 поля + двойной ползунок        checks    чекбоксы со счётчиками (логика «ИЛИ»)
       check     чекбокс (со счётчиком)           numFrom   числовое поле «от»
       numTo     поле / ползунок «до»             fromTo    2 поля: от и до
       multi     мультивыбор с поиском            segments  сегменты, один выбор
       halls     повторяемый блок «схема + вместимость от»
       sliderFrom поле / ползунок «от»            tree      дерево чекбоксов со счётчиками
       null      фильтра на сайте нет («Удалить», «СЛ ЭТАП»)
     events   — типы мероприятий, при которых фильтр виден (нет — виден всегда);
                при «Любом типе» и «Комбинированном» видны все.
     decision — решение редактора из колонки J как есть; '' — не проставлено.
     card     — короткая подпись на карточке объекта, если отличается. */

  const CITIES = ['Москва', 'Санкт-Петербург', 'Сочи', 'Казань', 'Нижний Новгород', 'Самара', 'Подмосковье'];
  /* Первая строка подсказок города в фильтре (комментарий клиента, строка 7 файла).
     Плейсхолдер пустого поля остаётся «Любой город», как в текстах сайта. */
  const ALL_CITIES = 'Все города';

  const OK = 'УТВЕРЖДЕНО';
  const EV = { b: 'business', q: 'banquet', w: 'wedding', t: 'teambuilding' };
  const evs = (s) => s.split(' ').map(x => EV[x]);

  /* Категории объекта — 10 вариантов файла. В данных объекта хранится подпись (v.cat),
     код — в конфиге: так карточки и визарды не зависят от переименований. */
  const VENUE_CAT_OPTS = [
    { code: 'hotel', l: 'Отель' }, { code: 'boutique_hotel', l: 'Бутик-отель' }, { code: 'restaurant', l: 'Ресторан' },
    { code: 'loft', l: 'Лофт' }, { code: 'congress_exhibition', l: 'Конгрессно-выставочная площадка' },
    { code: 'outdoor', l: 'Уличная площадка' }, { code: 'ship', l: 'Корабль' }, { code: 'glamping', l: 'Глэмпинг' },
    { code: 'club', l: 'Клуб' }, { code: 'other', l: 'Другое' },
  ];
  const VENUE_CATS = VENUE_CAT_OPTS.map(o => o.l);
  /* Категории, переименованные по файлу фильтров (сохранённые фильтры, объекты кабинета). */
  const CAT_RENAMES = { 'Конгрессно-выставочная': 'Конгрессно-выставочная площадка' };
  const STARRED_CATS = ['Отель', 'Бутик-отель'];   // где звёздность вообще применима
  /* Звёздность по файлу: «Без звёзд», 2, 3, 4, 5. Варианта «1 звезда» в файле нет. */
  const STAR_OPTIONS = [
    { k: 0, code: '0', l: 'Без звёзд' },
    { k: 2, code: '2', l: '2 звезды' },
    { k: 3, code: '3', l: '3 звезды' },
    { k: 4, code: '4', l: '4 звезды' },
    { k: 5, code: '5', l: '5 звёзд' },
  ];
  /** Ключ варианта звёздности объекта; null — звёздность к объекту неприменима. */
  const starKey = (v) => !STARRED_CATS.includes(v.cat) ? null : (v.stars || 0);

  /* Типы мероприятий. l — подписи как в текстах сайта (главная, строка параметров подбора),
     lf — названия из файла фильтров (сам фильтр в панели). «Комбинированное» — объекты,
     у которых указано несколько типов (комментарий в строке 5 файла); при нём видны все фильтры. */
  const EVENT_TYPES = [
    { k: 'business', l: 'Деловое', lf: 'Деловое мероприятие' },
    { k: 'banquet', l: 'Банкет / фуршет', lf: 'Банкет / фуршет' },
    { k: 'wedding', l: 'Свадьба', lf: 'Свадьба' },
    { k: 'teambuilding', l: 'Тимбилдинг', lf: 'Тимбилдинг/Спортивное' },
  ];
  const EVENT_COMBINED = { k: 'combined', l: 'Комбинированное', lf: 'Комбинированное' };
  /* Ключи из прошлых версий (сохранённые фильтры и ссылки): шесть типов промежуточной
     версии → «Деловое», 'team' (до R3) → 'teambuilding'. Пустой ключ — «Любой тип». */
  const EVENT_TYPE_RENAMES = { forum: 'business', presentation: 'business', meeting: 'business', online: 'business', team: 'teambuilding' };
  const normEventType = (k) => {
    k = EVENT_TYPE_RENAMES[k] || k || '';
    return EVENT_TYPES.some(e => e.k === k) || k === 'combined' ? k : '';
  };

  /* Схемы рассадки. k — ключ в данных зала (seats), code — код файла; названия — из файла. */
  const SEATING = [
    { k: 'theatre',   code: 'theatre',   l: 'Театр' },
    { k: 'class',     code: 'classroom', l: 'Класс' },
    { k: 'ushape',    code: 'ushape',    l: 'U-образная' },
    { k: 'banquet',   code: 'banquet',   l: 'Банкет' },
    { k: 'reception', code: 'reception', l: 'Фуршет' },
    { k: 'cabaret',   code: 'cabaret',   l: 'Кабаре' },
    { k: 'board',     code: 'boardroom', l: 'Переговорная' },
  ];
  const seatingByKey = (k) => SEATING.find(s => s.k === k) || null;

  /* Тип зала: фильтр удалён (решение редактора), поле остаётся подписью на карточке зала. */
  const HALL_TYPES = ['Конференц-зал', 'Банкетный зал', 'Трансформер', 'Ресторанный зал', 'Переговорная', 'Амфитеатр', 'Фойе', 'Открытая площадка'];

  const CUISINE_OPTS = [
    { code: 'russian', l: 'Русская' }, { code: 'european', l: 'Европейская' }, { code: 'italian', l: 'Итальянская' },
    { code: 'caucasian', l: 'Кавказская' }, { code: 'asian', l: 'Азиатская' }, { code: 'pan_asian', l: 'Паназиатская' },
    { code: 'middle_eastern', l: 'Ближневосточная' }, { code: 'chinese', l: 'Китайская' }, { code: 'japanese', l: 'Японская' },
    { code: 'author', l: 'Авторская' }, { code: 'mixed', l: 'Смешанная' }, { code: 'other', l: 'Другая' },
  ];
  const PARKING_OPTS = [
    { code: '', l: 'Любая' }, { code: 'private', l: 'Собственная', full: 'Собственная парковка' },
    { code: 'city', l: 'Городская', full: 'Городская парковка рядом' },
  ];

  const VENUE_FILTER_GROUPS = [
    { k: 'main', l: 'Основное' }, { k: 'type', l: 'Тип площадки' }, { k: 'rooms', l: 'Проживание' },
    { k: 'halls', l: 'Залы' }, { k: 'price', l: 'Стоимость' }, { k: 'food', l: 'Питание' },
    { k: 'equip', l: 'Оснащение зала' }, { k: 'space', l: 'Пространство' }, { k: 'infra', l: 'Инфраструктура' },
    { k: 'rules', l: 'Правила' }, { k: 'sport', l: 'Спорт' },
  ];

  /* f(...) — строка конфига; ch(...) — чекбокс со счётчиком (самый частый случай). */
  const f = (group, code, label, control, o) => Object.assign({ group, code, label, control, decision: OK }, o || {});
  const ch = (group, code, label, o) => f(group, code, label, 'check', o);

  const VENUE_FILTERS = [
    f('main', 'city', 'Город', 'city', { fkey: 'city' }),
    f('main', 'event_type', 'Тип мероприятия', 'select', { fkey: 'eventType',
      opts: EVENT_TYPES.map(e => ({ code: e.k, l: e.lf })).concat([{ code: 'combined', l: 'Комбинированное', decision: '' }]) }),
    f('main', 'guests', 'Количество гостей', 'range2', { fkey: 'people' }),
    f('main', 'rating_min', 'Рейтинг от', null, { decision: 'СЛ ЭТАП', planned: 'select',
      opts: [{ code: '4_0', l: '4,0 и выше' }, { code: '4_5', l: '4,5 и выше' }, { code: '4_8', l: '4,8 и выше' }] }),

    f('type', 'category', 'Категория объекта', 'checks', { fkey: 'cats', opts: VENUE_CAT_OPTS }),
    f('type', 'stars', 'Звёздность', 'checks', { fkey: 'stars', opts: STAR_OPTIONS.map(o => ({ code: o.code, l: o.l })) }),

    ch('rooms', 'has_accommodation', 'Есть проживание'),
    f('rooms', 'rooms_total', 'Всего номеров от', 'numFrom', { fkey: 'rooms' }),
    f('rooms', 'rooms_twin', 'Номеров TWIN от', 'numFrom', { fkey: 'twin', tariff: 'prem' }),
    f('rooms', 'rooms_single', 'Номеров SNGL от', 'numFrom', { fkey: 'sngl', tariff: 'prem' }),

    f('halls', 'hall_requirements', 'Схема и вместимость', 'halls', { fkey: 'halls',
      opts: SEATING.map(s => ({ code: s.code, l: s.l })) }),
    f('halls', 'hall_type', 'Тип зала', null, { decision: 'Удалить', planned: 'checks',
      opts: [{ code: 'conference', l: 'Конференц-зал' }, { code: 'banquet', l: 'Банкетный зал' }, { code: 'meeting_room', l: 'Переговорная' },
        { code: 'transformer', l: 'Трансформер' }, { code: 'amphitheatre', l: 'Амфитеатр' }, { code: 'foyer', l: 'Фойе' }, { code: 'outdoor', l: 'Открытая площадка' }] }),
    f('halls', 'hall_area_min', 'Площадь зала от, м²', 'numFrom', { fkey: 'hallArea', advanced: true }),
    f('halls', 'ceiling_height_min', 'Высота потолка от, м', null, { decision: 'Удалить', planned: 'numFrom', advanced: true }),
    ch('halls', 'has_floor_plan', 'Есть план зала', { advanced: true }),
    f('halls', 'dressing_rooms', 'Гримёрок от', 'numFrom', { fkey: 'dressing', advanced: true }),

    f('price', 'price_day', 'Стоимость за день', 'range2', { fkey: 'priceDay', mode: 'day' }),
    f('price', 'price_hour', 'Стоимость за час', 'range2', { fkey: 'priceHour', mode: 'hour' }),
    f('price', 'conference_package_price_per_person', 'Конференц-пакет', 'range2', { fkey: 'confPkg', unit: 'Цена/чел., ₽', events: evs('b') }),
    f('price', 'price_on_request', 'Показывать цены по запросу', null, { decision: 'Удалить', planned: 'check' }),
    ch('price', 'loyalty', 'Начисляет баллы', { card: 'Участвует в бонусной программе' }),

    f('food', 'avg_check', 'Средний чек до', 'numTo', { fkey: 'avgCheck' }),
    ch('food', 'menu', 'Есть меню на сайте'),
    f('food', 'cuisine', 'Кухня', 'multi', { fkey: 'cuisine', opts: CUISINE_OPTS }),
    ch('food', 'inhouse_catering', 'Свой ресторан / кейтеринг'),
    ch('food', 'external_alcohol', 'Можно со своим алкоголем', { decision: 'На проверке' }),
    ch('food', 'external_catering', 'Возможен сторонний кейтеринг', { decision: 'На проверке' }),
    ch('food', 'welcome_area', 'Фойе для кофе-брейка / велкома', { events: evs('b q w'), card: 'Фойе' }),
    ch('food', 'menu_tasting', 'Возможна дегустация меню'),
    ch('food', 'halal', 'Сертификат халяль'),
    ch('food', 'kashrut_certificate', 'Сертификат кашрута'),
    ch('food', 'michelin', 'Звезда Michelin', { events: evs('b q w') }),

    ch('equip', 'sound', 'Звуковое оборудование'),
    ch('equip', 'light', 'Световое оборудование'),
    ch('equip', 'screen', 'Экран'),
    ch('equip', 'led_screen', 'LED-экран'),
    ch('equip', 'projector', 'Проектор'),
    ch('equip', 'plasma_panel', 'Плазменная панель'),
    ch('equip', 'internet', 'Выделенная линия интернета'),
    ch('equip', 'wifi', 'Wi‑Fi'),
    ch('equip', 'stage', 'Стационарная сцена'),
    ch('equip', 'power', 'Силовое подключение'),
    ch('equip', 'rigging', 'Точки подвеса'),
    ch('equip', 'freight_elevator', 'Грузовой лифт'),
    ch('equip', 'car_entry', 'Заезд автомобиля в зал', { events: evs('b q w') }),
    ch('equip', 'equipment_load_in', 'Можно со своим тех. оснащением'),

    ch('space', 'column_free', 'Без колонн'),
    ch('space', 'blackout', 'Затемнение', { events: evs('b q w') }),
    ch('space', 'windows', 'Окна', { events: evs('b q w') }),
    ch('space', 'air_conditioning', 'Кондиционер'),
    f('space', 'wardrobe', 'Гардероб', 'numFrom', { fkey: 'wardrobe', unit: 'мест' }),
    ch('space', 'separate_restrooms', 'Раздельные туалеты'),
    ch('space', 'separate_entrance', 'Отдельный вход'),
    ch('space', 'external_furniture', 'Можно со своей мебелью'),
    ch('space', 'external_decor', 'Можно со своим декором'),

    f('infra', 'parking', 'Парковка', 'segments', { fkey: 'parking',
      opts: [{ code: 'none', l: 'Нет парковки', decision: 'Удалить' }, { code: 'city', l: 'Городская парковка рядом' }, { code: 'private', l: 'Собственная парковка' }] }),
    f('infra', 'parking_spaces_min', 'Парковочных мест от', 'numFrom', { fkey: 'parkingSpaces', dependsOn: { parking: 'private' } }),
    ch('infra', 'security', 'Охрана / ЧОП'),
    ch('infra', 'accessible', 'Доступная среда', { info: 'Пандус или лифт до зала, проходы шириной от 90 см без порогов и ступеней, доступный санузел. Уточняйте детали у площадки.' }),
    ch('infra', 'prayer_room', 'Молельная комната'),
    ch('infra', 'karaoke', 'Караоке'),
    ch('infra', 'hookah', 'Кальян', { events: evs('q w t') }),
    ch('infra', 'bridal_room', 'Комната невесты', { events: evs('w') }),
    ch('infra', 'beach', 'Пляж', { events: evs('q w t') }),
    ch('infra', 'waterfront', 'У водоёма'),
    ch('infra', 'outdoor_area', 'Уличная площадка'),
    ch('infra', 'spa', 'СПА'),

    ch('rules', 'late_music', 'Музыка после «часа тишины»'),
    ch('rules', 'fireworks', 'Можно запускать фейерверки', { events: evs('q w t') }),
    ch('rules', 'confetti', 'Можно запускать конфетти', { codeNote: 'код в файле не указан' }),

    ch('sport', 'football', 'Футбольное поле', { events: evs('t') }),
    ch('sport', 'volleyball', 'Волейбольная площадка', { events: evs('t') }),
    ch('sport', 'tennis', 'Теннисный корт', { events: evs('t') }),
    ch('sport', 'table_tennis', 'Настольный теннис', { events: evs('t') }),
    ch('sport', 'pool', 'Бассейн', { events: evs('t') }),
    ch('sport', 'equipment_rental', 'Прокат инвентаря', { events: evs('t') }),
    ch('sport', 'medical_staff', 'Медперсонал', { events: evs('t') }),
    ch('sport', 'podium', 'Пьедестал', { events: evs('t') }),
  ];
  const venueFilter = (code) => VENUE_FILTERS.find(x => x.code === code) || null;
  /* Чекбоксы-свойства объекта: хранятся кодами в v.features. Особые чекбоксы считаются
     из других полей и в features не попадают. */
  const DERIVED_CHECKS = ['has_accommodation', 'has_floor_plan', 'menu', 'loyalty'];
  const FEATURE_CODES = VENUE_FILTERS.filter(x => x.control === 'check' && !DERIVED_CHECKS.includes(x.code)).map(x => x.code);
  const featureLabel = (code, short) => { const x = venueFilter(code); return x ? (short && x.card) || x.label : code; };

  /** Виден ли фильтр при текущем выборе: тип мероприятия (events) и родитель (dependsOn). */
  function venueFilterVisible(def, F) {
    if (!def || !def.control) return false;
    if (def.events && F && F.eventType && F.eventType !== 'combined' && !def.events.includes(F.eventType)) return false;
    if (def.dependsOn && F) for (const k in def.dependsOn) if (F[k] !== def.dependsOn[k]) return false;
    if (def.mode && F && (F.priceMode || 'day') !== def.mode) return false;
    return true;
  }

  /* ── Поставщики ── */
  /* Дерево «Услуги» по файлу. code — код раздела/пункта; l — подпись (в данных поставщика
     хранятся подписи parent/child). partnerOnly — пункт есть в фильтре, но в визарде
     поставщика недоступен: карточку создаёт только партнёр платформы (комментарий клиента). */
  const SUPPLIER_SECTIONS = [
    { code: 'artists', l: 'Артисты', kids: [
      ['host', 'Ведущий'], ['dj', 'Диджей'], ['animator', 'Аниматор'], ['cover_band', 'Кавер-группа'], ['show', 'Шоу-программа'],
      ['celebrity', 'Знаменитость'], ['circus', 'Цирковой артист'], ['illusionist', 'Иллюзионист'], ['comedian', 'Юморист / стендап-комик'],
      ['actor', 'Актёр театра и кино'], ['musician', 'Музыкант'], ['artist', 'Художник'], ['other', 'Другое']] },
    { code: 'rental', l: 'Аренда', kids: [
      ['animals', 'Животные'], ['furniture', 'Мебель'], ['tent', 'Шатры'], ['costumes', 'Костюмы'], ['equipment', 'Оборудование'], ['other', 'Другое']] },
    { code: 'food', l: 'Питание', kids: [['catering', 'Кейтеринг'], ['mobile_bar', 'Выездной бар'], ['other', 'Другое']] },
    { code: 'media', l: 'Фото и видео', kids: [['photographer', 'Фотограф'], ['videographer', 'Видеооператор'], ['streaming', 'Онлайн-трансляция']] },
    { code: 'staff', l: 'Персонал', kids: [
      ['event_director', 'Режиссёр мероприятия'], ['producer', 'Продюсер'], ['hostess', 'Хостес'], ['assistant', 'Ассистент на мероприятие'],
      ['helper', 'Хелпер'], ['coordinator', 'Координатор / сопровождение', { partnerOnly: true }], ['guide', 'Гид'], ['interpreter', 'Переводчик'],
      ['technical_director', 'Технический директор'], ['stylist_makeup', 'Стилист'], ['makeup', 'Визажист'], ['cleaning', 'Клининг'],
      ['moderator', 'Модератор'], ['security', 'Охрана / ЧОП'], ['waiter', 'Официант'], ['scriptwriter', 'Сценарист'], ['model', 'Модель'], ['other', 'Другие']] },
    { code: 'transport', l: 'Транспорт', kids: [['bus', 'Автобусы'], ['car_with_driver', 'Автомобиль с водителем', { decision: 'Обсудить' }]] },
    { code: 'other', l: 'Прочее', kids: [
      ['workshop', 'Мастер-класс'], ['stand_building', 'Застройка'], ['printing', 'Типография'], ['souvenirs', 'Сувенирная продукция'],
      ['decor_design', 'Оформление / дизайн'], ['hookah_service', 'Кальянный кейтеринг'], ['excursions', 'Экскурсионное обслуживание'],
      ['tickets', 'Авиа- и ж/д-билеты'], ['dmc', 'DMC'], ['production', 'Продакшн'], ['teambuilding', 'Организация тимбилдинга']] },
  ].map(s => Object.assign(s, { kids: s.kids.map(([code, l, o]) => Object.assign({ code, l, decision: OK }, o || {})) }));
  /* Совместимость: SUPPLIER_TREE — { раздел: [пункты] } подписями, как раньше. */
  const SUPPLIER_TREE = SUPPLIER_SECTIONS.reduce((a, s) => { a[s.l] = s.kids.map(k => k.l); return a; }, {});
  const PARTNER_ONLY = SUPPLIER_SECTIONS.flatMap(s => s.kids.filter(k => k.partnerOnly).map(k => s.l + '·' + k.l));
  /* Подписи из прошлых версий дерева → новые (данные кабинета, сохранённые фильтры, ссылки). */
  const SUPPLIER_RENAMES = {
    'Фото / видео': 'Фото и видео', 'Звёзды': 'Знаменитость', 'Цирковые артисты': 'Цирковой артист', 'Иллюзионисты': 'Иллюзионист',
    'Актёры театра и кино': 'Актёр театра и кино', 'Шатёр': 'Шатры', 'Бары': 'Выездной бар', 'Оператор': 'Видеооператор',
    'Стилист-визажист': 'Стилист', 'ЧОП': 'Охрана / ЧОП', 'Водитель с авто': 'Автомобиль с водителем', 'Застройщики': 'Застройка',
    'Оформители': 'Оформление / дизайн', 'Кальяны': 'Кальянный кейтеринг', 'Экскурсии': 'Экскурсионное обслуживание',
    'Авиа и ЖД': 'Авиа- и ж/д-билеты', 'Production': 'Продакшн', 'Тимбилдинг': 'Организация тимбилдинга',
  };
  const supRename = (x) => SUPPLIER_RENAMES[x] || x;

  const PRICE_UNITS = [
    { code: 'hour', l: 'За час', card: 'за час', decision: 'Добавлено/Утвердить' },
    { code: 'shift', l: 'За смену', card: 'за смену', decision: 'Добавлено/Утвердить' },
    { code: 'person', l: 'За человека', card: 'за человека', decision: 'Удалить' },
    { code: 'unit', l: 'За единицу', card: 'за единицу', decision: 'Добавлено/Утвердить' },
    { code: 'project', l: 'За проект', card: 'за проект', decision: 'Добавлено/Утвердить' },
  ];
  const priceUnitLabel = (code) => (PRICE_UNITS.find(u => u.code === code) || {}).card || '';

  const SUPPLIER_FILTER_GROUPS = [
    { k: 'services', l: 'Услуги' }, { k: 'geo', l: 'География' }, { k: 'price', l: 'Стоимость и опыт' }, { k: 'media', l: 'Медиа и доверие' },
  ];
  const SUPPLIER_FILTERS = [
    f('services', 'category', 'Услуги', 'tree', { fkey: 'cats' }),
    f('services', 'catering.guests', 'Количество гостей', null, { decision: 'Удалить', planned: 'range2', parent: 'Питание·Кейтеринг' }),
    f('services', 'catering.price_per_person', 'Цена на человека', 'range2', { fkey: 'ppp', parent: 'Питание·Кейтеринг' }),
    f('services', 'catering.vegetarian_menu', 'Вегетарианское меню', null, { decision: 'Удалить', planned: 'check', parent: 'Питание·Кейтеринг' }),
    f('services', 'catering.halal_menu', 'Халяльное меню', 'check', { fkey: 'halal', parent: 'Питание·Кейтеринг' }),
    f('services', 'catering.kosher_menu', 'Кошерное меню', 'check', { fkey: 'kosher', parent: 'Питание·Кейтеринг' }),
    f('services', 'rental.delivery', 'Доставка', 'check', { fkey: 'delivery', parent: 'Аренда·Оборудование' }),
    f('services', 'rental.installation', 'Монтаж', 'check', { fkey: 'installation', parent: 'Аренда·Оборудование' }),
    f('services', 'rental.operator_included', 'Оператор включён', 'check', { fkey: 'operator', parent: 'Аренда·Оборудование' }),
    f('services', 'media.hours', 'Минимальное количество часов', 'fromTo', { fkey: 'hours', parentSection: 'Фото и видео' }),
    f('services', 'media.delivery_days_max', 'Срок готовности материалов', 'numTo', { fkey: 'days', unit: 'дней', parentSection: 'Фото и видео' }),
    f('services', 'transport.seats_min', 'Количество мест', null, { decision: 'Удалить', planned: 'numFrom', parentSection: 'Транспорт' }),
    f('services', 'transport.class', 'Класс транспорта', null, { decision: 'Удалить', planned: 'checks', parentSection: 'Транспорт',
      opts: [{ code: 'economy', l: 'Эконом' }, { code: 'comfort', l: 'Комфорт' }, { code: 'business', l: 'Бизнес' }, { code: 'premium', l: 'Премиум' }] }),
    f('geo', 'city', 'Город', 'city', { fkey: 'city' }),
    f('geo', 'travel', 'Выезд в другие города', 'check', { fkey: 'travel' }),
    f('price', 'price', 'Стоимость услуги', 'range2', { fkey: 'price' }),
    f('price', 'price_unit', 'Цена за', 'checks', { fkey: 'units', decision: 'Добавлено/Утвердить',
      opts: PRICE_UNITS.map(u => ({ code: u.code, l: u.l, decision: u.decision })) }),
    f('price', 'experience', 'Опыт от', 'sliderFrom', { fkey: 'expMin' }),
    f('media', 'video', 'Есть видео', 'check', { fkey: 'video' }),
    f('media', 'reviews', 'Есть отзывы', 'check', { fkey: 'reviews' }),
    f('media', 'loyalty', 'Принимает баллы', 'check', { fkey: 'loyalty' }),
  ];
  /** Виден ли зависимый фильтр поставщиков: появляется только при выборе родителя. */
  function supplierFilterVisible(def, F) {
    if (!def || !def.control) return false;
    if (def.parent) return !!(F && F.cats && F.cats.has(def.parent));
    if (def.parentSection) return !!(F && F.cats && [...F.cats].some(k => k.split('·')[0] === def.parentSection));
    return true;
  }

  /* ─────────── 2. ТАРИФЫ ─────────── */
  /* Расхождение документов: каркас проекта — «2 / 6 / 15–20 ЗАЛОВ», приложение
     к договору — «2 / 6 / от 10 ОБЪЕКТОВ, вопрос к Тёме», и тариф там назван
     «ПРО», а не «ПРЕМИУМ». Здесь взят вариант каркаса. Поменять — только тут. */

  /* Уровни доступа. guest — не тариф, а отсутствие регистрации; он лежит
     здесь, чтобы все существующие проверки tariff().fullInfo продолжали
     работать без правок на каждой странице. Признак plan отделяет то, что
     можно купить, от служебного уровня: страницы тарифов и оплаты обязаны
     строиться по ML.plans(), а не по Object.values(TARIFFS), иначе на них
     вылезет колонка «ГОСТЬ». */

  const TARIFFS = {
    guest: {
      key: 'guest', name: 'ГОСТЬ', plan: false, blur: true,
      price: 0, priceHalf: 0, priceYear: 0,
      compare: 0, presentation: false, groupRequest: 0,
      fullInfo: false, blacklist: false, bonusRate: 0,
      filters: ['city', 'event_type', 'guests', 'category', 'cats', 'people'],
    },
    start: {
      key: 'start', name: 'СТАРТ', plan: true, blur: false,
      price: 0, priceHalf: 0, priceYear: 0,
      compare: 2, presentation: false, groupRequest: 0,
      fullInfo: false, blacklist: false, bonusRate: 0,
      filters: ['city', 'event_type', 'guests', 'category', 'cats', 'people'],   // остальные заблокированы
    },
    biz: {
      key: 'biz', name: 'БИЗНЕС', plan: true, blur: false,
      price: 890, priceHalf: 4000, priceYear: 6400,
      compare: 5, presentation: 'ads', groupRequest: 5,
      fullInfo: true, blacklist: false, bonusRate: 1,
      filters: 'all-except-seating-roomsplit',   // номера — только общий фонд, без SNGL/TWIN
    },
    prem: {
      key: 'prem', name: 'ПРЕМИУМ', plan: true, blur: false,
      price: 1950, priceHalf: 8750, priceYear: 14000,
      compare: 10, presentation: 'clean', groupRequest: Infinity,
      fullInfo: true, blacklist: true, bonusRate: 1.5,
      filters: 'all',
    },
  };
  /** Открыт ли фильтр на тарифе (код из конфига; старые имена групп тоже понимает).
      СТАРТ и гость — город, тип мероприятия, гости и категория объекта; БИЗНЕС — всё,
      кроме схем рассадки и номеров TWIN/SNGL; ПРЕМИУМ — всё. Новые фильтры R3 — с «БИЗНЕСА». */
  const PREM_FILTERS = ['rooms_twin', 'rooms_single', 'seating', 'seats', 'twin', 'sngl'];
  function canUseFilter(tariffKey, code) {
    const f = (TARIFFS[tariffKey] || TARIFFS.start).filters;
    if (f === 'all') return true;
    if (f === 'all-except-seating-roomsplit') return !PREM_FILTERS.includes(code);
    if (Array.isArray(f)) return f.includes(code);
    return false;
  }
  /** Только покупаемые тарифы — для pricing.html и checkout.html. */
  const plans = () => Object.values(TARIFFS).filter(t => t.plan);
  const isGuest = () => state.tariff === 'guest';

  // Вознаграждение объекта и начисление баллов по количеству участников.
  const FEE_TIERS = [
    /* R3-C: баллы — по выгрузке текстов 20.10 (БИЗНЕС / ПРЕМИУМ). Вознаграждение объекта (fee)
       из публичной таблицы убрано (бэклог, строка 122), в данных остаётся для кабинета площадки. */
    { min: 1, max: 100, label: '1–100 чел.', fee: 6000, ptsBiz: 1000, ptsPrem: 1500 },
    { min: 101, max: 300, label: '101–300 чел.', fee: 21000, ptsBiz: 3000, ptsPrem: 5000 },
    { min: 301, max: 500, label: '301–500 чел.', fee: 45000, ptsBiz: 7000, ptsPrem: 10500 },
    /* Ярус «501+» — по корректуре: сумма и баллы «по согласованию». Числа нет,
       поэтому fee и баллы — null: начисление считается вручную, а не подставляется ближайшее. */
    { min: 501, max: Infinity, label: '501+ чел.', fee: null, ptsBiz: 10000, ptsPrem: 15000, feeByAgreement: true },
  ];

  const POINT_RATE = 0.70;          // 1 балл = 0,70 ₽
  const POINTS_HELLO = 100;         // баллы «ПРИВЕТ» за регистрацию
  const POINTS_REVIEW = { biz: 100, prem: 150 };

  /* Экономика еБалльного магазина. По договору о продаже услуг по бонусной
     программе ресурс получает скидку 30% от розничной цены услуги, а с
     пользователя списывает баллы в эквиваленте ПОЛНОЙ розничной цены.
     Пример из каркаса проекта: услуга стоит 10 000 ₽ розницей, мы платим
     партнёру 7 000 ₽, с пользователя списываем 10 000 / 0,70 = 14 286 баллов.
     Не заменять это одним множителем — экономика перестанет читаться. */
  const LOYALTY_DISCOUNT = 0.30;
  /** Сколько баллов списать с пользователя за услугу с розничной ценой retail. */
  const servicePoints = (retail) => Math.round(retail / POINT_RATE);
  /** Сколько ресурс платит партнёру за эту же услугу. */
  const serviceCost = (retail) => Math.round(retail * (1 - LOYALTY_DISCOUNT));

  const CANCEL_REASONS = ['Отмена мероприятия', 'Перенос мероприятия', 'Не устроила стоимость',
    'Некорректное общение', 'Выбрана другая площадка', 'Изменились вводные запроса', 'Другое'];

  // Жизненный цикл объекта внутри запроса. next — какая кнопка активна дальше.
  const REQUEST_FLOW = {
    sent: { label: 'Запрос отправлен', next: 'done' },
    done: { label: 'Мероприятие состоялось', next: 'reviewed' },
    reviewed: { label: 'Отзыв оставлен', next: null },
    cancelled: { label: 'Отменён', next: null, dead: true },
    declined: { label: 'Отклонён объектом', next: null, dead: true },
  };

  /* ─────────── 3. ОБЪЕКТЫ И ЗАЛЫ ─────────── */
  /* Схема зала:
       id        сквозной по всей базе, именно он лежит в сравнении и избранном
       venueId   обратная ссылка на объект
       name,type название и тип зала
       area      площадь, м²   height  высота потолка, м
       seats     {theatre, class, ushape, banquet, reception, cabaret, board} — чел.
                 отсутствующий ключ = схема неприменима
       priceDay  ₽/день, 0 = «по договорённости» (такой зал остаётся в выдаче всегда)
       priceHour ₽/час, 0 = не сдаётся почасово
       plan      есть ли точный план пространства (продаётся как услуга замера)
       photo     номер файла ../assets/photos/v{N}.jpg
  */

  const V = (id, name, cat, city, addr, o) => Object.assign({
    id, name, cat, city, addr,
    stars: 0,
    coords: null, rating: 4.5, reviews: 40,
    promo: null,   // {highlight:true, top:3|10|null, until:'30.09.2026'}
    rooms: { twin: 0, sngl: 0 },
    eventTypes: ['business', 'banquet'],
    features: [], halls: [], photo: 1, px: 50, py: 50, loyaltyContract: false,
  }, o);

  const H = (id, venueId, name, type, area, height, seats, priceDay, priceHour, plan, photo) =>
    ({ id, venueId, name, type, area, height, seats, priceDay, priceHour, plan: !!plan, photo: photo || 1 });

  const VENUES = [
    V(1, 'Отель «Аврора»', 'Отель', 'Москва', 'Пресненская наб., 12', {
      coords: { lat: 55.7492, lng: 37.5390 }, rating: 4.9, reviews: 127, photo: 1, px: 52, py: 38,
      promo: { highlight: true, top: 3, until: '30.09.2026' },
      rooms: { twin: 60, sngl: 24 }, loyaltyContract: true,
      eventTypes: ['business', 'banquet', 'wedding'],
      features: ['Свой ресторан / кейтеринг', 'Зона Welcome', 'Дегустация меню', 'Wi-Fi',
        'Звуковое оборудование', 'Световое оборудование', 'Экран', 'Гримёрки', 'Без колонн',
        'Затемнение', 'Наличие окон', 'Отдельная парковка', 'Кондиционер', 'Гардероб', 'ЧОП'],
      halls: [
        H(101, 1, 'Большой зал', 'Конференц-зал', 712, 6.0,
          { theatre: 250, class: 140, ushape: 60, banquet: 180, reception: 300, cabaret: 120, board: 40 }, 45000, 8000, true, 1),
        H(102, 1, 'Зал «Панорама»', 'Трансформер', 380, 4.2,
          { theatre: 160, class: 90, ushape: 45, banquet: 120, reception: 200, cabaret: 80 }, 28000, 5000, true, 2),
        H(103, 1, 'Переговорная «Сити»', 'Переговорная', 48, 3.2,
          { ushape: 16, board: 20 }, 0, 2500, false, 3),
      ],
    }),
    V(2, 'Лофт «Кирпич»', 'Лофт', 'Москва', 'Нижняя Сыромятническая, 10', {
      coords: { lat: 55.7539, lng: 37.6656 }, rating: 4.6, reviews: 112, photo: 2, px: 57, py: 46,
      promo: { highlight: false, top: 10, until: '01.11.2026' },
      eventTypes: ['banquet', 'team', 'wedding'],
      features: ['Возможен кейтеринг заказчика', 'Возможен свой алкоголь (пробковый сбор)', 'Зона Welcome', 'Wi-Fi',
        'Звуковое оборудование', 'Световое оборудование', 'Стационарная сцена', 'Возможность подвеса',
        'Завоз оборудования', 'Своя мебель', 'Свой декор', 'Затемнение', 'Отдельный вход',
        'Музыка после «часа тишины»', 'Кальян'],
      halls: [
        H(201, 2, 'Основное пространство', 'Трансформер', 420, 5.5,
          { theatre: 180, banquet: 100, reception: 250, cabaret: 90 }, 60000, 0, true, 2),
        H(202, 2, 'Малый зал', 'Ресторанный зал', 130, 3.6,
          { banquet: 50, reception: 80, class: 40 }, 25000, 4000, false, 4),
      ],
    }),
    V(3, 'Конгресс-центр «Экспо-Волга»', 'Конгрессно-выставочная', 'Самара', 'Мичурина, 23А', {
      coords: { lat: 53.2001, lng: 50.1401 }, rating: 4.4, reviews: 61, photo: 3, px: 22, py: 62,
      eventTypes: ['business'],
      features: ['Свой ресторан / кейтеринг', 'Wi-Fi', 'Звуковое оборудование', 'Световое оборудование',
        'Экран', 'Стационарная сцена', 'Силовое подключение', 'Грузовой лифт', 'Завоз оборудования',
        'Без колонн', 'Отдельная парковка', 'Кондиционер', 'Гардероб', 'ЧОП', 'Раздельный туалет М/Ж'],
      halls: [
        H(301, 3, 'Конгресс-холл', 'Конференц-зал', 1400, 9.0,
          { theatre: 850, class: 420, banquet: 500, reception: 900 }, 120000, 0, true, 3),
        H(302, 3, 'Зал А', 'Конференц-зал', 320, 4.5,
          { theatre: 200, class: 110, ushape: 50, board: 30 }, 40000, 7000, true, 5),
        H(303, 3, 'Зал Б', 'Конференц-зал', 190, 4.5,
          { theatre: 110, class: 60, ushape: 34, board: 24 }, 26000, 5000, true, 6),
        H(304, 3, 'Выставочный павильон', 'Открытая площадка', 2200, 12.0,
          { reception: 1500 }, 0, 0, false, 7),
      ],
    }),
    V(4, 'Отель «Флагман»', 'Отель', 'Санкт-Петербург', 'Адмиралтейская наб., 4', {
      coords: { lat: 59.9364, lng: 30.3061 }, rating: 4.9, reviews: 203, photo: 4, px: 30, py: 20,
      rooms: { twin: 120, sngl: 55 }, loyaltyContract: true,
      eventTypes: ['business', 'banquet', 'wedding'],
      features: ['Свой ресторан / кейтеринг', 'Дегустация меню', 'Зона Welcome', 'Сертификат халяль',
        'Wi-Fi', 'Звуковое оборудование', 'Световое оборудование', 'Экран', 'Гримёрки', 'Без колонн',
        'Наличие окон', 'Отдельная парковка', 'Кондиционер', 'Гардероб', 'ЧОП', 'У водоёма / пляж', 'Молельная комната'],
      halls: [
        H(401, 4, 'Бальный зал', 'Банкетный зал', 640, 7.5,
          { theatre: 400, banquet: 300, reception: 550, cabaret: 240 }, 180000, 0, true, 4),
        H(402, 4, 'Зал «Нева»', 'Конференц-зал', 280, 4.0,
          { theatre: 150, class: 80, ushape: 44, board: 32 }, 65000, 12000, true, 8),
        H(403, 4, 'Каминный зал', 'Ресторанный зал', 95, 3.4,
          { banquet: 40, reception: 60, board: 18 }, 35000, 6000, false, 9),
      ],
    }),
    V(5, 'Ресторан «Терраса»', 'Ресторан', 'Сочи', 'Курортный просп., 72', {
      coords: { lat: 43.5734, lng: 39.7300 }, rating: 4.8, reviews: 156, photo: 5, px: 34, py: 84,
      eventTypes: ['banquet', 'wedding'],
      features: ['Свой ресторан / кейтеринг', 'Дегустация меню', 'Зона Welcome', 'Возможен свой алкоголь (пробковый сбор)',
        'Wi-Fi', 'Звуковое оборудование', 'Наличие окон', 'Кондиционер', 'Отдельный вход',
        'У водоёма / пляж', 'Фейерверки', 'Кальян', 'Музыка после «часа тишины»'],
      halls: [
        H(501, 5, 'Основной зал', 'Ресторанный зал', 210, 3.8,
          { banquet: 90, reception: 140, cabaret: 70 }, 40000, 0, false, 5),
        H(502, 5, 'Веранда у моря', 'Открытая площадка', 160, 0,
          { banquet: 60, reception: 110 }, 0, 0, false, 10),
      ],
    }),
    V(6, 'Клуб «Лофт 22»', 'Клуб', 'Казань', 'Профсоюзная, 22', {
      coords: { lat: 55.7887, lng: 49.1221 }, rating: 4.3, reviews: 47, photo: 6, px: 26, py: 55,
      eventTypes: ['banquet', 'team'],
      features: ['Возможен кейтеринг заказчика', 'Возможен свой алкоголь (пробковый сбор)', 'Wi-Fi', 'Звуковое оборудование',
        'Световое оборудование', 'Стационарная сцена', 'Гримёрки', 'Возможность подвеса', 'Затемнение',
        'Отдельный вход', 'Музыка после «часа тишины»', 'ЧОП', 'Кальян'],
      halls: [
        H(601, 6, 'Танцпол', 'Трансформер', 340, 6.0,
          { theatre: 200, reception: 400, cabaret: 120 }, 55000, 0, false, 6),
        H(602, 6, 'VIP-зона', 'Ресторанный зал', 70, 3.2,
          { banquet: 30, reception: 45 }, 18000, 3500, false, 11),
      ],
    }),
    V(7, 'Усадьба «Белые ночи»', 'Уличная площадка', 'Подмосковье', 'Рублёво-Успенское ш., 24 км', {
      coords: { lat: 55.7300, lng: 37.1900 }, rating: 4.9, reviews: 98, photo: 7, px: 44, py: 30,
      eventTypes: ['wedding', 'banquet', 'team'],
      features: ['Возможен кейтеринг заказчика', 'Возможен свой алкоголь (пробковый сбор)', 'Зона Welcome', 'Дегустация меню',
        'Отдельная парковка', 'Отдельный вход', 'Фейерверки', 'У водоёма / пляж', 'Свой декор',
        'Завоз оборудования', 'Своя мебель', 'Футбольное поле', 'Волейбольная площадка',
        'Настольный теннис', 'Бассейн', 'Прокат инвентаря', 'Медперсонал'],
      halls: [
        H(701, 7, 'Шатёр', 'Открытая площадка', 480, 0,
          { banquet: 200, reception: 350, theatre: 260 }, 90000, 0, false, 7),
        H(702, 7, 'Каминный зал усадьбы', 'Банкетный зал', 180, 4.4,
          { banquet: 80, reception: 120, cabaret: 60 }, 65000, 0, true, 12),
        H(703, 7, 'Поляна', 'Открытая площадка', 1200, 0,
          { reception: 600 }, 0, 0, false, 13),
      ],
    }),
    V(8, 'Теплоход «Меридиан»', 'Корабль', 'Нижний Новгород', 'Нижне-Волжская наб., причал 5', {
      coords: { lat: 56.3285, lng: 44.0059 }, rating: 4.5, reviews: 34, photo: 8, px: 38, py: 44,
      eventTypes: ['banquet', 'team', 'wedding'],
      features: ['Свой ресторан / кейтеринг', 'Возможен свой алкоголь (пробковый сбор)', 'Wi-Fi', 'Звуковое оборудование',
        'Световое оборудование', 'Кондиционер', 'Гардероб', 'У водоёма / пляж', 'Кальян'],
      halls: [
        H(801, 8, 'Главная палуба', 'Банкетный зал', 220, 2.9,
          { banquet: 90, reception: 150, theatre: 110 }, 75000, 0, false, 8),
        H(802, 8, 'Верхняя палуба', 'Открытая площадка', 140, 0,
          { reception: 90 }, 0, 0, false, 14),
      ],
    }),
    V(9, 'Бутик-отель «Гавань»', 'Бутик-отель', 'Санкт-Петербург', 'наб. реки Мойки, 58', {
      coords: { lat: 59.9333, lng: 30.3081 }, rating: 4.7, reviews: 71, photo: 9, px: 32, py: 24,
      rooms: { twin: 25, sngl: 10 }, loyaltyContract: true,
      eventTypes: ['business', 'banquet'],
      features: ['Свой ресторан / кейтеринг', 'Зона Welcome', 'Wi-Fi', 'Экран',
        'Наличие окон', 'Кондиционер', 'Гардероб', 'Отдельный вход', 'Без колонн'],
      halls: [
        H(901, 9, 'Библиотека', 'Переговорная', 62, 3.5,
          { ushape: 22, board: 26, class: 30 }, 22000, 4000, true, 9),
        H(902, 9, 'Зал «Мойка»', 'Конференц-зал', 145, 3.9,
          { theatre: 90, class: 50, banquet: 60, reception: 100 }, 38000, 7000, true, 15),
      ],
    }),
    V(10, 'Глэмпинг «Сосны»', 'Глэмпинг', 'Подмосковье', 'Дмитровское ш., 48 км', {
      coords: { lat: 56.1200, lng: 37.4500 }, rating: 4.6, reviews: 29, photo: 10, px: 48, py: 22,
      eventTypes: ['team', 'wedding'],
      features: ['Возможен кейтеринг заказчика', 'Возможен свой алкоголь (пробковый сбор)', 'Отдельная парковка', 'Отдельный вход',
        'У водоёма / пляж', 'Фейерверки', 'Свой декор', 'Волейбольная площадка', 'Настольный теннис',
        'Прокат инвентаря', 'Медперсонал', 'Футбольное поле'],
      halls: [
        H(1001, 10, 'Купольный шатёр', 'Открытая площадка', 260, 0,
          { banquet: 100, reception: 180, theatre: 140 }, 55000, 0, false, 10),
        H(1002, 10, 'Костровая площадка', 'Открытая площадка', 300, 0,
          { reception: 150 }, 0, 0, false, 16),
      ],
    }),
    V(11, 'Конференц-центр «Высота»', 'Конгрессно-выставочная', 'Москва', 'Павелецкая пл., 2', {
      coords: { lat: 55.7297, lng: 37.6392 }, rating: 4.7, reviews: 88, photo: 11, px: 54, py: 44,
      promo: { highlight: true, top: null, until: '15.10.2026' },
      eventTypes: ['business'],
      features: ['Свой ресторан / кейтеринг', 'Wi-Fi', 'Звуковое оборудование', 'Световое оборудование',
        'Экран', 'Силовое подключение', 'Грузовой лифт', 'Без колонн', 'Затемнение', 'Кондиционер',
        'Гардероб', 'Раздельный туалет М/Ж', 'Отдельная парковка'],
      halls: [
        H(1101, 11, 'Амфитеатр', 'Конференц-зал', 240, 5.0,
          { theatre: 180, class: 90, ushape: 40 }, 52000, 9000, true, 11),
        H(1102, 11, 'Зал «Высота-2»', 'Конференц-зал', 110, 3.6,
          { theatre: 70, class: 40, ushape: 26, board: 22 }, 24000, 4500, true, 1),
        H(1103, 11, 'Фойе', 'Открытая площадка', 180, 4.0,
          { reception: 150 }, 0, 3000, false, 2),
      ],
    }),
    V(12, 'Отель «Лагуна»', 'Отель', 'Сочи', 'ул. Приморская, 9', {
      coords: { lat: 43.5800, lng: 39.7200 }, rating: 4.2, reviews: 55, photo: 12, px: 36, py: 86,
      rooms: { twin: 40, sngl: 18 },
      eventTypes: ['business', 'banquet', 'team'],
      features: ['Свой ресторан / кейтеринг', 'Зона Welcome', 'Wi-Fi', 'Экран', 'Кондиционер',
        'Отдельная парковка', 'У водоёма / пляж', 'Бассейн', 'Прокат инвентаря', 'Настольный теннис'],
      halls: [
        H(1201, 12, 'Конференц-зал «Бриз»', 'Конференц-зал', 160, 3.8,
          { theatre: 100, class: 55, ushape: 32, banquet: 70 }, 30000, 5500, false, 12),
        H(1202, 12, 'Банкетный зал', 'Банкетный зал', 200, 3.8,
          { banquet: 90, reception: 130 }, 35000, 0, false, 3),
      ],
    }),
    V(13, 'Арт-пространство «Винзавод»', 'Лофт', 'Москва', '4-й Сыромятнический пер., 1', {
      coords: { lat: 55.7548, lng: 37.6640 }, rating: 4.5, reviews: 64, photo: 13, px: 56, py: 48,
      eventTypes: ['business', 'banquet', 'team'],
      features: ['Возможен кейтеринг заказчика', 'Возможен свой алкоголь (пробковый сбор)', 'Wi-Fi', 'Звуковое оборудование',
        'Световое оборудование', 'Экран', 'Возможность подвеса', 'Завоз оборудования', 'Своя мебель',
        'Свой декор', 'Затемнение', 'Отдельный вход', 'Гардероб'],
      halls: [
        H(1301, 13, 'Цех белого', 'Трансформер', 390, 6.5,
          { theatre: 220, reception: 300, banquet: 140, class: 120 }, 70000, 0, true, 13),
        H(1302, 13, 'Галерея', 'Открытая площадка', 210, 5.0,
          { reception: 160 }, 42000, 0, false, 4),
      ],
    }),
    V(14, 'Отель «Панорама»', 'Отель', 'Казань', 'ул. Баумана, 44', {
      coords: { lat: 55.7900, lng: 49.1200 }, rating: 4.6, reviews: 82, photo: 14, px: 28, py: 56,
      rooms: { twin: 55, sngl: 22 }, loyaltyContract: true,
      eventTypes: ['business', 'banquet', 'wedding'],
      features: ['Свой ресторан / кейтеринг', 'Дегустация меню', 'Сертификат халяль', 'Зона Welcome',
        'Wi-Fi', 'Звуковое оборудование', 'Экран', 'Без колонн', 'Наличие окон', 'Кондиционер',
        'Гардероб', 'Отдельная парковка', 'Молельная комната', 'Раздельный туалет М/Ж'],
      halls: [
        H(1401, 14, 'Большой зал', 'Конференц-зал', 420, 5.2,
          { theatre: 280, class: 150, ushape: 60, banquet: 200, reception: 320 }, 58000, 10000, true, 14),
        H(1402, 14, 'Зал «Казан»', 'Банкетный зал', 190, 4.0,
          { banquet: 80, reception: 120, cabaret: 60 }, 32000, 0, false, 15),
        H(1403, 14, 'Переговорная', 'Переговорная', 40, 3.0,
          { board: 16, ushape: 14 }, 9000, 1800, false, 16),
      ],
    }),
    V(15, 'Отель «Причал»', 'Отель', 'Нижний Новгород', 'Рождественская ул., 21', {
      coords: { lat: 56.3274, lng: 43.9958 }, rating: 4.3, reviews: 26, photo: 15, px: 40, py: 41,
      rooms: { twin: 18, sngl: 8 },
      eventTypes: ['business', 'banquet'],
      features: ['Свой ресторан / кейтеринг', 'Зона Welcome', 'Wi-Fi', 'Экран',
        'Наличие окон', 'Кондиционер', 'Гардероб', 'У водоёма / пляж'],
      halls: [
        H(1501, 15, 'Зал «Волга»', 'Конференц-зал', 95, 3.2,
          { theatre: 60, class: 32, ushape: 22, banquet: 40 }, 18000, 3500, false, 5),
        H(1502, 15, 'Переговорная «Откос»', 'Переговорная', 32, 2.9,
          { board: 12, ushape: 10 }, 7000, 1500, false, 9),
      ],
    }),
  ];
  /* ── R3-A: свойства объектов по конфигу фильтров ──
     Удобства прежних версий хранились русскими строками; теперь — кодами из файла
     фильтров. Таблица ниже переводит старые строки (в том числе из объектов,
     заведённых в кабинете до R3) в коды и особые поля. */
  const OLD_FEATURE_CODE = {
    'Свой ресторан / кейтеринг': 'inhouse_catering', 'Возможен свой алкоголь (пробковый сбор)': 'external_alcohol',
    'Можно привезти алкоголь': 'external_alcohol', 'Возможен кейтеринг заказчика': 'external_catering',
    'Возможен свой кейтеринг': 'external_catering', 'Зона Welcome': 'welcome_area', 'Место для велкома': 'welcome_area',
    'Дегустация меню': 'menu_tasting', 'Сертификат халяль': 'halal', 'Звуковое оборудование': 'sound',
    'Световое оборудование': 'light', 'Экран': 'screen', 'Стационарная сцена': 'stage', 'Wi-Fi': 'wifi',
    'Силовое подключение': 'power', 'Грузовой лифт': 'freight_elevator', 'Возможность подвеса': 'rigging',
    'Завоз оборудования': 'equipment_load_in', 'Своя мебель': 'external_furniture', 'Без колонн': 'column_free',
    'Свой декор': 'external_decor', 'Затемнение': 'blackout', 'Наличие окон': 'windows', 'Кондиционер': 'air_conditioning',
    'Раздельный туалет М/Ж': 'separate_restrooms', 'Отдельный вход': 'separate_entrance', 'Кальян': 'hookah',
    'Фейерверки': 'fireworks', 'Музыка после «часа тишины»': 'late_music', 'ЧОП': 'security', 'У водоёма / пляж': 'waterfront',
    'Молельная комната': 'prayer_room', 'Футбольное поле': 'football', 'Волейбольная площадка': 'volleyball',
    'Теннисный корт': 'tennis', 'Настольный теннис': 'table_tennis', 'Бассейн': 'pool', 'Прокат инвентаря': 'equipment_rental',
    'Медперсонал': 'medical_staff',
  };
  /** Старые строки удобств → коды + особые поля (гардероб, парковка, гримёрки). */
  function migrateFeatures(list, v) {
    const out = new Set();
    (list || []).forEach(x => {
      if (FEATURE_CODES.includes(x)) out.add(x);
      else if (OLD_FEATURE_CODE[x]) out.add(OLD_FEATURE_CODE[x]);
      else if (x === 'Гардероб' && v && !v.wardrobe) v.wardrobe = 100;
      else if ((x === 'Отдельная парковка' || x === 'Своя парковка') && v && !v.parking) v.parking = 'private';
      else if (x === 'Гримёрки' && v && !v.dressingRooms) v.dressingRooms = 1;
    });
    return [...out];
  }

  const MENU_SAMPLE = { name: 'menu-sample.pdf', url: '../assets/menus/menu-sample.pdf' };

  /* Свойства 15 объектов, которые были в базе до R3: добавки к их удобствам и новые поля. */
  const VENUE_EXTRA = {
    1: { add: 'led_screen projector internet accessible spa car_entry', cuisine: 'european russian', avgCheck: 3500, menu: 1, confPackage: 4500, wardrobe: 300, parking: 'private', parkingSpaces: 80, dressingRooms: 2, roomsTotal: 92 },
    2: { add: 'projector plasma_panel karaoke confetti', cuisine: 'author', avgCheck: 2800, wardrobe: 120, parking: 'city', dressingRooms: 1 },
    3: { add: 'led_screen projector internet accessible car_entry wifi', cuisine: 'european russian', avgCheck: 1800, confPackage: 3200, wardrobe: 1200, parking: 'private', parkingSpaces: 400, dressingRooms: 4 },
    4: { add: 'led_screen projector plasma_panel internet accessible spa bridal_room michelin', cuisine: 'european russian japanese', avgCheck: 5500, menu: 1, confPackage: 6500, wardrobe: 450, parking: 'private', parkingSpaces: 120, dressingRooms: 3, roomsTotal: 190 },
    5: { add: 'beach outdoor_area confetti bridal_room', cuisine: 'caucasian european', avgCheck: 4000, menu: 1, wardrobe: 60, parking: 'city' },
    6: { add: 'karaoke led_screen confetti projector', cuisine: 'pan_asian mixed', avgCheck: 2200, wardrobe: 250, parking: 'city', dressingRooms: 2 },
    7: { add: 'podium bridal_room outdoor_area beach confetti tennis', cuisine: 'russian european', avgCheck: 4500, menu: 1, wardrobe: 150, parking: 'private', parkingSpaces: 120, roomsTotal: 12, twin: 6, sngl: 2 },
    8: { add: 'waterfront karaoke outdoor_area', cuisine: 'russian european', avgCheck: 3200, wardrobe: 120, parking: 'city' },
    9: { add: 'projector accessible', cuisine: 'european italian', avgCheck: 3800, menu: 1, confPackage: 3900, wardrobe: 80, parking: 'city', roomsTotal: 38 },
    10: { add: 'podium outdoor_area bridal_room spa', cuisine: 'russian mixed', avgCheck: 2500, parking: 'private', parkingSpaces: 60, roomsTotal: 24, twin: 16, sngl: 4 },
    11: { add: 'led_screen projector plasma_panel internet accessible car_entry prayer_room wifi', cuisine: 'european mixed', avgCheck: 2000, confPackage: 2900, wardrobe: 400, parking: 'private', parkingSpaces: 150, dressingRooms: 2 },
    12: { add: 'beach outdoor_area karaoke projector', cuisine: 'russian caucasian', avgCheck: 2200, confPackage: 2400, wardrobe: 100, parking: 'private', parkingSpaces: 40, roomsTotal: 64 },
    13: { add: 'projector led_screen outdoor_area confetti', cuisine: 'author mixed', avgCheck: 3000, wardrobe: 300, parking: 'city', dressingRooms: 1 },
    14: { add: 'projector internet accessible bridal_room', cuisine: 'middle_eastern russian european', avgCheck: 2600, menu: 1, confPackage: 3100, wardrobe: 220, parking: 'private', parkingSpaces: 60, roomsTotal: 85 },
    15: { add: 'projector waterfront wifi', cuisine: 'russian', avgCheck: 1800, confPackage: 1900, wardrobe: 50, parking: 'city', roomsTotal: 30 },
  };

  /* ── Новые объекты R3 (бэклог, строки 46 и 88): чтобы без фильтров их было не меньше 45,
     а в Москве — не меньше 22. Залы и свойства собираются по профилю площадки:
     детерминированно (без Math.random), чтобы выдача и тесты не менялись от загрузки к загрузке. */
  const NEW_VENUE_ROWS = [
    // id, название, категория, город, адрес, звёзды, типы, рейтинг, отзывы, профиль
    [16, 'Гранд-отель «Тверской»', 'Отель', 'Москва', 'ул. Тверская, 22', 5, 'b q w', 4.8, 214, 'hotel_big'],
    [17, 'Отель «Белорусская»', 'Отель', 'Москва', 'ул. Лесная, 15', 4, 'b q', 4.5, 96, 'hotel_mid'],
    [18, 'Бизнес-отель «Сити Тауэр»', 'Отель', 'Москва', 'Пресненская наб., 6', 4, 'b', 4.6, 141, 'hotel_mid'],
    [19, 'Бутик-отель «Арбат 9»', 'Бутик-отель', 'Москва', 'ул. Арбат, 9', 0, 'b q w', 4.7, 58, 'boutique'],
    [20, 'Ресторан «Белый рояль»', 'Ресторан', 'Москва', 'Никитский бул., 12', 0, 'q w', 4.8, 173, 'restaurant'],
    [21, 'Ресторан «Сакура Холл»', 'Ресторан', 'Москва', 'ул. Новый Арбат, 21', 0, 'q b', 4.4, 88, 'restaurant_asia'],
    [22, 'Лофт «Фабрика 7»', 'Лофт', 'Москва', 'ул. Электрозаводская, 21', 0, 'b q t', 4.5, 67, 'loft'],
    [23, 'Лофт «Стрелка»', 'Лофт', 'Москва', 'Берсеневская наб., 14', 0, 'b q w', 4.7, 120, 'loft'],
    [24, 'Конгресс-центр «Технопарк»', 'Конгрессно-выставочная площадка', 'Москва', 'Волгоградский просп., 42', 0, 'b', 4.6, 74, 'congress'],
    [25, 'Экспоцентр «Северный»', 'Конгрессно-выставочная площадка', 'Москва', 'Ленинградское ш., 16', 0, 'b q', 4.3, 52, 'congress'],
    [26, 'Клуб «Глобус»', 'Клуб', 'Москва', 'ул. Большая Дмитровка, 32', 0, 'q t', 4.2, 61, 'club'],
    [27, 'Теплоход «Москва-река»', 'Корабль', 'Москва', 'Фрунзенская наб., причал 3', 0, 'q w t', 4.6, 83, 'ship'],
    [28, 'Сад «Эрмитаж Парк»', 'Уличная площадка', 'Москва', 'ул. Каретный Ряд, 3', 0, 'q w t', 4.7, 109, 'outdoor'],
    [29, 'Арт-кластер «Красный Октябрь»', 'Другое', 'Москва', 'Берсеневский пер., 5', 0, 'b q', 4.5, 77, 'other'],
    [30, 'Отель «Измайлово Парк»', 'Отель', 'Москва', 'Измайловское ш., 71', 3, 'b q t', 4.1, 132, 'hotel_mid'],
    [31, 'Ресторан «Чайхона на Покровке»', 'Ресторан', 'Москва', 'ул. Покровка, 17', 0, 'q w', 4.6, 154, 'restaurant_east'],
    [32, 'Лофт «Цех»', 'Лофт', 'Москва', 'Хохловский пер., 7', 0, 'b q', 4.4, 45, 'loft'],
    [33, 'Отель «Метрополь Холл»', 'Отель', 'Москва', 'Театральный пр., 2', 5, 'b q w', 4.9, 236, 'hotel_big'],
    [34, 'Пространство «Атриум»', 'Другое', 'Москва', 'ул. Земляной Вал, 33', 0, 'b', 4.3, 39, 'other'],
    [35, 'Клуб «Ритм»', 'Клуб', 'Москва', 'Пятницкая ул., 29', 0, 'q w', 4.4, 70, 'club'],
    [36, 'Отель «Невский берег»', 'Отель', 'Санкт-Петербург', 'наб. реки Фонтанки, 40', 4, 'b q w', 4.6, 118, 'hotel_mid'],
    [37, 'Лофт «Литейный»', 'Лофт', 'Санкт-Петербург', 'Литейный пр., 57', 0, 'b q t', 4.5, 63, 'loft'],
    [38, 'Ресторан «Палкинъ Холл»', 'Ресторан', 'Санкт-Петербург', 'Невский пр., 47', 0, 'q w', 4.8, 190, 'restaurant'],
    [39, 'Отель «Морская звезда»', 'Отель', 'Сочи', 'Курортный пр., 98', 3, 'q w t', 4.3, 101, 'hotel_sea'],
    [40, 'Глэмпинг «Красная Поляна»', 'Глэмпинг', 'Сочи', 'Эстосадок, ул. Горная, 8', 0, 't w', 4.7, 57, 'glamping'],
    [41, 'Конгресс-холл «Казань Экспо»', 'Конгрессно-выставочная площадка', 'Казань', 'ул. Выставочная, 1', 0, 'b', 4.6, 92, 'congress'],
    [42, 'Ресторан «Тюбетей»', 'Ресторан', 'Казань', 'ул. Баумана, 64', 0, 'q w', 4.5, 84, 'restaurant_east'],
    [43, 'Отель «Волжский откос»', 'Отель', 'Нижний Новгород', 'Верхне-Волжская наб., 2', 4, 'b q w', 4.5, 66, 'hotel_mid'],
    [44, 'Лофт «Литера»', 'Лофт', 'Нижний Новгород', 'ул. Ильинская, 50', 0, 'b q t', 4.4, 41, 'loft'],
    [45, 'Отель «Жигули»', 'Отель', 'Самара', 'ул. Куйбышева, 99', 3, 'b q', 4.2, 73, 'hotel_mid'],
    [46, 'Яхт-клуб «Парус»', 'Корабль', 'Самара', 'Волжский пр., 2', 0, 'q w t', 4.6, 38, 'ship'],
    [47, 'Загородный клуб «Завидово»', 'Отель', 'Подмосковье', 'Конаковский р-н, д. Мокшино', 5, 'b q w t', 4.8, 167, 'resort'],
    [48, 'Усадьба «Архангельское Парк»', 'Уличная площадка', 'Подмосковье', 'Красногорский р-н, п. Архангельское', 0, 'w q', 4.7, 95, 'outdoor'],
    [49, 'Глэмпинг «Лесная гавань»', 'Глэмпинг', 'Подмосковье', 'Истринский р-н, д. Лечищево', 0, 't w', 4.5, 44, 'glamping'],
  ];
  /* Точка города на схематичной карте подбора (проценты подложки) и разброс объектов вокруг. */
  const CITY_MAP = { 'Москва': [54, 42, 9], 'Санкт-Петербург': [31, 21, 5], 'Сочи': [36, 84, 4], 'Казань': [27, 56, 4],
    'Нижний Новгород': [39, 43, 4], 'Самара': [22, 63, 4], 'Подмосковье': [46, 27, 7] };
  const CITY_LATLNG = { 'Москва': [55.7558, 37.6173], 'Санкт-Петербург': [59.9386, 30.3141], 'Сочи': [43.5855, 39.7231],
    'Казань': [55.7963, 49.1088], 'Нижний Новгород': [56.3269, 44.0059], 'Самара': [53.1959, 50.1002], 'Подмосковье': [55.6, 37.2] };
  /* Детерминированный «случай»: одно и то же число для пары (id, соль). */
  const hash01 = (id, salt) => { const x = Math.sin(id * 97.13 + salt * 13.7) * 43758.5453; return x - Math.floor(x); };

  /* Профили новых площадок: залы [название, тип, площадь, высота, схемы, день, час, план],
     базовые свойства, пул необязательных свойств, кухни, чек, гардероб, парковка. */
  const S = (t, c, u, b, r, k, bd) => { const o = {}; [['theatre', t], ['class', c], ['ushape', u], ['banquet', b], ['reception', r], ['cabaret', k], ['board', bd]].forEach(([key, n]) => { if (n) o[key] = n; }); return o; };
  const PROFILES = {
    hotel_big: { halls: [['Бальный зал', 'Банкетный зал', 820, 7.2, S(500, 260, 0, 380, 650, 300, 0), 260000, 0, 1],
        ['Конференц-зал «Атлас»', 'Конференц-зал', 340, 4.5, S(220, 120, 56, 140, 260, 0, 40), 85000, 14000, 1],
        ['Переговорная «Кабинет»', 'Переговорная', 54, 3.2, S(0, 0, 18, 0, 0, 0, 22), 0, 4500, 0]],
      base: 'inhouse_catering welcome_area menu_tasting sound light screen led_screen projector internet wifi stage power freight_elevator column_free air_conditioning separate_restrooms security accessible spa',
      pool: 'plasma_panel kashrut_certificate michelin bridal_room car_entry prayer_room halal blackout windows rigging pool late_music karaoke',
      cuisine: 'european russian author', avgCheck: 5200, wardrobe: 500, parking: 'private', spaces: 150, rooms: [240, 120, 60], conf: 6200, dressing: 2, menu: 1 },
    hotel_mid: { halls: [['Конференц-зал', 'Конференц-зал', 260, 4.0, S(160, 90, 44, 110, 180, 70, 30), 52000, 9000, 1],
        ['Банкетный зал', 'Банкетный зал', 210, 3.8, S(0, 0, 0, 120, 160, 80, 0), 45000, 0, 0],
        ['Переговорная', 'Переговорная', 38, 3.0, S(0, 0, 14, 0, 0, 0, 16), 0, 2800, 0]],
      base: 'inhouse_catering welcome_area sound screen projector wifi power air_conditioning separate_restrooms security',
      pool: 'light led_screen plasma_panel internet stage menu_tasting halal windows blackout accessible late_music karaoke bridal_room spa column_free',
      cuisine: 'european russian', avgCheck: 2600, wardrobe: 180, parking: 'private', spaces: 50, rooms: [120, 70, 30], conf: 3300, dressing: 0 },
    hotel_sea: { halls: [['Зал «Бриз»', 'Банкетный зал', 240, 3.8, S(120, 0, 0, 110, 170, 70, 0), 48000, 0, 0],
        ['Терраса у моря', 'Открытая площадка', 300, 0, S(0, 0, 0, 120, 220, 0, 0), 60000, 0, 0]],
      base: 'inhouse_catering welcome_area sound light wifi air_conditioning beach waterfront outdoor_area pool late_music',
      pool: 'hookah fireworks bridal_room karaoke confetti projector spa volleyball table_tennis equipment_rental medical_staff',
      cuisine: 'european caucasian', avgCheck: 2400, wardrobe: 80, parking: 'private', spaces: 35, rooms: [90, 50, 20], dressing: 0 },
    resort: { halls: [['Конгресс-холл', 'Конференц-зал', 600, 6.5, S(420, 220, 70, 300, 500, 200, 0), 180000, 0, 1],
        ['Ресторан «Охотничий»', 'Ресторанный зал', 260, 4.0, S(0, 0, 0, 140, 200, 90, 0), 70000, 0, 0],
        ['Переговорная «Озеро»', 'Переговорная', 60, 3.2, S(0, 0, 20, 0, 0, 0, 24), 0, 5000, 0],
        ['Поляна у озера', 'Открытая площадка', 1500, 0, S(0, 0, 0, 0, 800, 0, 0), 0, 0, 0]],
      base: 'inhouse_catering welcome_area menu_tasting sound light screen led_screen projector internet wifi stage power column_free air_conditioning separate_restrooms security accessible spa waterfront outdoor_area beach pool tennis football volleyball table_tennis equipment_rental medical_staff podium fireworks late_music',
      pool: 'bridal_room hookah karaoke car_entry confetti rigging',
      cuisine: 'russian european author', avgCheck: 4800, wardrobe: 300, parking: 'private', spaces: 200, rooms: [180, 90, 40], conf: 5600, dressing: 2, menu: 1 },
    boutique: { halls: [['Каминный зал', 'Ресторанный зал', 110, 3.6, S(0, 30, 0, 50, 70, 30, 20), 32000, 5500, 0],
        ['Библиотека', 'Переговорная', 48, 3.4, S(0, 20, 14, 0, 0, 0, 18), 0, 3500, 0]],
      base: 'inhouse_catering welcome_area menu_tasting wifi screen air_conditioning windows separate_entrance',
      pool: 'projector plasma_panel accessible bridal_room late_music spa',
      cuisine: 'european italian', avgCheck: 3600, wardrobe: 60, parking: 'city', rooms: [28, 14, 8], conf: 3800, dressing: 0, menu: 1 },
    restaurant: { halls: [['Главный зал', 'Ресторанный зал', 320, 4.2, S(0, 0, 0, 160, 240, 110, 0), 0, 0, 0],
        ['VIP-зал', 'Ресторанный зал', 80, 3.4, S(0, 0, 0, 36, 50, 0, 18), 25000, 4000, 0]],
      base: 'inhouse_catering welcome_area menu_tasting sound light wifi air_conditioning windows late_music',
      pool: 'stage karaoke bridal_room confetti hookah plasma_panel michelin kashrut_certificate separate_entrance external_alcohol',
      cuisine: 'european russian author', avgCheck: 4200, wardrobe: 120, parking: 'city', dressing: 0, menu: 1 },
    restaurant_asia: { halls: [['Зал «Сакура»', 'Ресторанный зал', 240, 3.8, S(0, 0, 0, 110, 160, 70, 0), 38000, 0, 0],
        ['Кабинет «Токио»', 'Ресторанный зал', 60, 3.2, S(0, 0, 0, 24, 30, 0, 14), 0, 3500, 0]],
      base: 'inhouse_catering welcome_area menu_tasting wifi air_conditioning karaoke plasma_panel',
      pool: 'sound light hookah late_music confetti',
      cuisine: 'japanese chinese pan_asian asian', avgCheck: 3100, wardrobe: 90, parking: 'city', dressing: 0, menu: 1 },
    restaurant_east: { halls: [['Главный зал', 'Ресторанный зал', 360, 4.0, S(0, 0, 0, 180, 260, 0, 0), 0, 0, 0],
        ['Летняя веранда', 'Открытая площадка', 200, 0, S(0, 0, 0, 80, 140, 0, 0), 30000, 0, 0]],
      base: 'inhouse_catering welcome_area menu_tasting halal hookah sound wifi air_conditioning outdoor_area prayer_room',
      pool: 'light bridal_room late_music karaoke confetti kashrut_certificate',
      cuisine: 'caucasian middle_eastern asian other', avgCheck: 2400, wardrobe: 150, parking: 'city', dressing: 0, menu: 1 },
    loft: { halls: [['Основной зал', 'Трансформер', 420, 6.0, S(220, 110, 0, 140, 300, 100, 0), 70000, 9000, 1],
        ['Малый зал', 'Трансформер', 120, 4.0, S(70, 40, 24, 50, 80, 0, 20), 26000, 4000, 0]],
      base: 'external_catering external_alcohol sound light screen projector wifi rigging power external_furniture external_decor separate_entrance column_free',
      pool: 'led_screen stage blackout windows karaoke confetti late_music outdoor_area equipment_load_in freight_elevator car_entry',
      cuisine: 'mixed', avgCheck: 2900, wardrobe: 200, parking: 'city', dressing: 1 },
    congress: { halls: [['Пленарный зал', 'Амфитеатр', 1100, 9.0, S(800, 400, 0, 450, 900, 0, 0), 150000, 0, 1],
        ['Секционный зал A', 'Конференц-зал', 220, 4.5, S(140, 80, 40, 0, 0, 0, 30), 38000, 6500, 1],
        ['Секционный зал B', 'Конференц-зал', 150, 4.5, S(90, 50, 30, 0, 0, 0, 24), 26000, 5000, 1],
        ['Фойе второго этажа', 'Фойе', 600, 5.0, S(0, 0, 0, 0, 450, 0, 0), 0, 0, 0]],
      base: 'inhouse_catering welcome_area sound light screen led_screen projector internet wifi stage power rigging freight_elevator car_entry column_free blackout air_conditioning separate_restrooms security accessible equipment_load_in',
      pool: 'plasma_panel prayer_room windows halal',
      cuisine: 'european russian mixed', avgCheck: 1700, wardrobe: 1500, parking: 'private', spaces: 500, conf: 2800, dressing: 4 },
    club: { halls: [['Танцпол', 'Трансформер', 380, 6.5, S(220, 0, 0, 0, 450, 140, 0), 65000, 0, 0],
        ['Лаунж', 'Ресторанный зал', 90, 3.4, S(0, 0, 0, 36, 60, 0, 0), 20000, 3500, 0]],
      base: 'inhouse_catering sound light led_screen stage rigging power blackout air_conditioning security karaoke late_music confetti hookah',
      pool: 'projector plasma_panel external_alcohol separate_entrance wifi',
      cuisine: 'pan_asian mixed', avgCheck: 2300, wardrobe: 300, parking: 'city', dressing: 2 },
    ship: { halls: [['Главная палуба', 'Банкетный зал', 240, 2.8, S(110, 0, 0, 100, 160, 0, 0), 85000, 12000, 0],
        ['Открытая палуба', 'Открытая площадка', 160, 0, S(0, 0, 0, 0, 100, 0, 0), 0, 0, 0]],
      base: 'inhouse_catering welcome_area sound light wifi air_conditioning waterfront outdoor_area late_music',
      pool: 'karaoke hookah fireworks bridal_room confetti plasma_panel',
      cuisine: 'russian european', avgCheck: 3400, wardrobe: 100, parking: 'city', dressing: 0 },
    outdoor: { halls: [['Шатёр у пруда', 'Открытая площадка', 520, 0, S(260, 0, 0, 220, 380, 0, 0), 95000, 0, 0],
        ['Летняя сцена', 'Открытая площадка', 900, 0, S(500, 0, 0, 0, 700, 0, 0), 0, 0, 0]],
      base: 'external_catering external_alcohol welcome_area sound light outdoor_area waterfront fireworks bridal_room external_furniture external_decor separate_entrance',
      pool: 'stage power rigging car_entry beach podium football volleyball medical_staff confetti late_music hookah',
      cuisine: 'russian european', avgCheck: 3800, wardrobe: 120, parking: 'private', spaces: 90, dressing: 1 },
    glamping: { halls: [['Купольный шатёр', 'Открытая площадка', 240, 0, S(120, 0, 0, 90, 160, 0, 0), 50000, 0, 0],
        ['Костровая поляна', 'Открытая площадка', 400, 0, S(0, 0, 0, 0, 200, 0, 0), 0, 0, 0]],
      base: 'external_catering external_alcohol outdoor_area waterfront football volleyball table_tennis equipment_rental medical_staff podium fireworks',
      pool: 'tennis pool spa bridal_room beach hookah sound',
      cuisine: 'russian mixed', avgCheck: 2600, wardrobe: 0, parking: 'private', spaces: 40, rooms: [30, 18, 6], dressing: 0 },
    other: { halls: [['Атриум', 'Трансформер', 540, 8.0, S(300, 160, 0, 200, 420, 0, 0), 90000, 12000, 1],
        ['Галерея', 'Фойе', 260, 4.5, S(0, 0, 0, 0, 200, 0, 0), 30000, 5000, 0],
        ['Переговорная', 'Переговорная', 44, 3.0, S(0, 0, 16, 0, 0, 0, 18), 0, 3000, 0]],
      base: 'external_catering welcome_area sound light screen led_screen projector internet wifi power rigging column_free air_conditioning separate_restrooms accessible',
      pool: 'plasma_panel stage blackout windows freight_elevator car_entry external_decor external_furniture equipment_load_in',
      cuisine: 'mixed', avgCheck: 2700, wardrobe: 350, parking: 'city', conf: 3500, dressing: 2 },
  };
  const PROFILE_TEXT = {
    hotel_big: 'Отель с бальным залом и конференц-этажом: пленарная часть, секции и банкет проходят в одном здании, участников можно разместить здесь же.',
    hotel_mid: 'Городской отель с конференц-залом и банкетным залом. Удобен для однодневных конференций и корпоративов с проживанием иногородних участников.',
    hotel_sea: 'Отель на первой линии: терраса у моря для вечерних программ, банкетный зал для свадеб и корпоративов, пляж для тимбилдинга.',
    resort: 'Загородный клуб с конгресс-холлом, ресторанами и спортивной инфраструктурой. Подходит для выездных стратегических сессий на несколько дней.',
    boutique: 'Небольшой бутик-отель с каминным залом и библиотекой — для камерных встреч, презентаций и ужинов до 70 гостей.',
    restaurant: 'Ресторан с главным залом и VIP-залом: банкеты, свадьбы, фуршеты. Меню можно скачать на карточке.',
    restaurant_asia: 'Ресторан азиатской кухни с караоке и отдельным кабинетом. Хорош для неформальных корпоративов и банкетов.',
    restaurant_east: 'Ресторан восточной кухни с летней верандой. Халяльная кухня, кальян, большие застолья и свадьбы.',
    loft: 'Лофт-пространство с высокими потолками и точками подвеса: конференции, презентации и вечеринки. Кейтеринг и декор — ваши.',
    congress: 'Конгрессно-выставочная площадка: пленарный зал-амфитеатр, секционные залы и фойе под выставку. Есть заезд техники.',
    club: 'Клуб со сценой, светом и звуком: корпоративы, вечеринки, концертные программы. Работает после «часа тишины».',
    ship: 'Теплоход с закрытой и открытой палубами: банкеты, свадьбы и выездные вечеринки на воде.',
    outdoor: 'Площадка под открытым небом с шатром и летней сценой: свадьбы, фестивали, летние корпоративы.',
    glamping: 'Глэмпинг в лесу: домики, купольный шатёр и спортивные площадки для тимбилдингов и выездных свадеб.',
    other: 'Многофункциональное пространство с атриумом и галереей: конференции, выставки, презентации.',
  };
  const NEW_DESCRIPTIONS = {};
  const NEW_VENUES = NEW_VENUE_ROWS.map(([id, name, cat, city, addr, stars, ev, rating, reviews, prof]) => {
    const P = PROFILES[prof];
    const [cx, cy, spread] = CITY_MAP[city];
    const [la, lo] = CITY_LATLNG[city];
    const pool = P.pool.split(' ').filter((c, i) => hash01(id, i + 1) > 0.45);
    let hid = 0;
    const halls = P.halls.map(([hn, ht, area, height, seats, day, hour, plan], i) =>
      H(id * 100 + (++hid), id, hn, ht, area, height, seats, day, hour, plan, ((id + i * 3) % 16) + 1));
    const rooms = P.rooms ? { total: P.rooms[0], twin: P.rooms[1], sngl: P.rooms[2] } : { total: 0, twin: 0, sngl: 0 };
    NEW_DESCRIPTIONS[id] = PROFILE_TEXT[prof];
    return V(id, name, cat, city, addr, {
      stars, coords: { lat: +(la + (hash01(id, 31) - 0.5) * 0.08).toFixed(4), lng: +(lo + (hash01(id, 32) - 0.5) * 0.14).toFixed(4) },
      rating, reviews, photo: ((id - 1) % 16) + 1,
      px: Math.round(cx + (hash01(id, 21) - 0.5) * 2 * spread), py: Math.round(cy + (hash01(id, 22) - 0.5) * 2 * spread),
      rooms, loyaltyContract: hash01(id, 41) > 0.55,
      eventTypes: evs(ev), features: [...new Set(P.base.split(' ').concat(pool))],
      cuisine: P.cuisine.split(' ').filter((c, i) => i < 2 || hash01(id, 50 + i) > 0.5),
      avgCheck: Math.round(P.avgCheck * (0.85 + hash01(id, 61) * 0.3) / 100) * 100,
      menu: P.menu && hash01(id, 62) > 0.3 ? MENU_SAMPLE : null,
      confPackage: P.conf && ev.includes('b') ? Math.round(P.conf * (0.85 + hash01(id, 63) * 0.3) / 100) * 100 : 0,
      wardrobe: P.wardrobe, parking: P.parking, parkingSpaces: P.parking === 'private' ? P.spaces : 0,
      dressingRooms: P.dressing, halls,
    });
  });

  VENUES.push(...NEW_VENUES);
  /* Удобства — кодами, типы мероприятий — ключами файла, номерной фонд — с общим числом. */
  VENUES.forEach(v => {
    v.features = migrateFeatures(v.features, v);
    v.eventTypes = [...new Set(v.eventTypes.map(e => normEventType(e)).filter(Boolean))];
    v.cat = CAT_RENAMES[v.cat] || v.cat;
    const x = VENUE_EXTRA[v.id];
    if (x) {
      x.add.split(' ').forEach(c => { if (!v.features.includes(c)) v.features.push(c); });
      Object.assign(v, { cuisine: x.cuisine.split(' '), avgCheck: x.avgCheck, menu: x.menu ? MENU_SAMPLE : null,
        confPackage: x.confPackage || 0, wardrobe: x.wardrobe || 0, parking: x.parking || '',
        parkingSpaces: x.parkingSpaces || 0, dressingRooms: x.dressingRooms || 0 });
      if (x.twin != null) v.rooms = { twin: x.twin, sngl: x.sngl };
      if (x.roomsTotal) v.rooms.total = x.roomsTotal;
    }
    if (!v.rooms.total) v.rooms.total = (v.rooms.twin || 0) + (v.rooms.sngl || 0);
    ['cuisine'].forEach(k => { if (!Array.isArray(v[k])) v[k] = []; });
  });
  const roundUp = (n, step) => Math.ceil(Math.max(n, step) / step) * step;
  /* Верхние границы ползунков — по базе, с округлением. */
  const PRICE_DAY_MAX = roundUp(Math.max(...VENUES.flatMap(v => v.halls.map(h => h.priceDay || 0))), 10000);
  const PRICE_HOUR_MAX = roundUp(Math.max(...VENUES.flatMap(v => v.halls.map(h => h.priceHour || 0))), 1000);
  const CONF_MAX = roundUp(Math.max(...VENUES.map(v => v.confPackage || 0)), 500);
  const AVG_CHECK_MAX = roundUp(Math.max(...VENUES.map(v => v.avgCheck || 0)), 500);
  const LIMITS = { priceDay: PRICE_DAY_MAX, priceHour: PRICE_HOUR_MAX, confPkg: CONF_MAX, avgCheck: AVG_CHECK_MAX };

  /* Просмотры карточки. В прототипе заданы, на разработке считаются
     счётчиком. Объект узнаёт о просмотре только в момент запроса —
     сами просмотры видит лишь как цифру в своей статистике. */
  const VIEWS = { 1: 862, 2: 611, 3: 344, 4: 903, 5: 428, 6: 217, 7: 556,
    8: 168, 9: 295, 10: 141, 11: 674, 12: 233, 13: 389, 14: 512, 15: 126 };
  VENUES.forEach(v => { v.stats = { views: VIEWS[v.id] || 200 }; });

  /* По отелю на каждый пункт фильтра звёздности: «Гавань» — без звёзд, «Лагуна» и «Причал» — 2★,
     «Панорама» — 3★, «Аврора» — 4★, «Флагман» — 5★; у новых объектов R3 звёзды заданы в строке. */
  const STARS = { 1: 4, 4: 5, 12: 2, 14: 3, 15: 2 };   // «Причал» — 2★: варианта «1 звезда» в файле фильтров нет
  VENUES.forEach(v => { if (v.id in STARS) v.stars = STARS[v.id]; });

  /* Галереи (номера фото ../assets/photos/vN.jpg). У большинства объектов
     семь фото — чтобы было видно «+N»; у глэмпинга три — короткая галерея.
     Залы с точным планом получают по шесть фото, остальные — по два. */
  const extraPhotos = (seed, n) => Array.from({ length: n }, (_, k) => ((seed * 5 + k * 3) % 16) + 1);
  const uniq = (a) => a.filter((x, i) => a.indexOf(x) === i);
  VENUES.forEach(v => {
    const want = v.id === 10 ? 3 : 7;
    v.gallery = uniq([v.photo, ...v.halls.map(h => h.photo), ...extraPhotos(v.id, 16)]).slice(0, want);
    v.halls.forEach(h => { h.gallery = uniq([h.photo, ...extraPhotos(h.id, 16)]).slice(0, h.plan ? 6 : 2); });
  });

  /* ─────────── 4. ПОСТАВЩИКИ ─────────── */

  const SUPPLIERS = [
    { id: 1, parent: 'Артисты', child: 'Ведущий', name: 'Ведущий Артём Соколов', city: 'Москва', price: 45000, exp: 12, video: true, reviews: true, travel: true, loyalty: true, photo: 1 },
    { id: 2, parent: 'Артисты', child: 'Диджей', name: 'DJ Kuznetsov', city: 'Москва', price: 30000, exp: 8, video: true, reviews: true, travel: true, loyalty: true, photo: 2 },
    { id: 3, parent: 'Артисты', child: 'Кавер-группа', name: 'Кавер-группа «Апрель»', city: 'Санкт-Петербург', price: 90000, exp: 6, video: true, reviews: true, travel: true, loyalty: false, photo: 3 },
    { id: 4, parent: 'Артисты', child: 'Шоу-программа', name: 'Шоу-балет «Ритм»', city: 'Москва', price: 70000, exp: 10, video: true, reviews: false, travel: true, loyalty: false, photo: 4 },
    { id: 5, parent: 'Артисты', child: 'Аниматор', name: 'Студия «Праздник+»', city: 'Казань', price: 15000, exp: 5, video: false, reviews: true, travel: false, loyalty: true, photo: 5 },
    { id: 6, parent: 'Питание', child: 'Кейтеринг', name: 'Кейтеринг «Формат»', city: 'Москва', price: 2500, exp: 14, video: false, reviews: true, travel: false, loyalty: true, photo: 6 },
    { id: 7, parent: 'Питание', child: 'Бары', name: 'Мобильный бар «Шейкер»', city: 'Москва', price: 40000, exp: 7, video: true, reviews: true, travel: false, loyalty: true, photo: 7 },
    { id: 8, parent: 'Фото / видео', child: 'Фотограф', name: 'Фотограф Мария Лебедева', city: 'Москва', price: 35000, exp: 9, video: false, reviews: true, travel: true, loyalty: true, photo: 8 },
    { id: 9, parent: 'Фото / видео', child: 'Оператор', name: 'Видеопродакшн Kadr', city: 'Санкт-Петербург', price: 60000, exp: 11, video: true, reviews: true, travel: true, loyalty: false, photo: 9 },
    { id: 10, parent: 'Фото / видео', child: 'Онлайн-трансляция', name: 'StreamLab', city: 'Москва', price: 120000, exp: 6, video: true, reviews: false, travel: true, loyalty: false, photo: 10 },
    { id: 11, parent: 'Аренда', child: 'Мебель', name: 'Прокат мебели «Лофт-декор»', city: 'Москва', price: 25000, exp: 8, video: false, reviews: true, travel: false, loyalty: true, photo: 11 },
    { id: 12, parent: 'Аренда', child: 'Шатёр', name: 'Шатры «Тент-Про»', city: 'Подмосковье', price: 150000, exp: 13, video: false, reviews: true, travel: false, loyalty: false, photo: 12 },
    { id: 13, parent: 'Аренда', child: 'Оборудование', name: 'Техпрокат «Сцена»', city: 'Москва', price: 80000, exp: 15, video: true, reviews: true, travel: false, loyalty: true, photo: 13 },
    { id: 14, parent: 'Персонал', child: 'Хостес', name: 'Агентство «Хостес-Сервис»', city: 'Москва', price: 5000, exp: 9, video: false, reviews: true, travel: false, loyalty: false, photo: 14 },
    { id: 15, parent: 'Персонал', child: 'Технический директор', name: 'Техдиректор Павел Гринёв', city: 'Москва', price: 50000, exp: 16, video: false, reviews: true, travel: true, loyalty: false, photo: 15 },
    { id: 16, parent: 'Персонал', child: 'Переводчик', name: 'Бюро «Синхрон»', city: 'Санкт-Петербург', price: 45000, exp: 12, video: false, reviews: true, travel: true, loyalty: true, photo: 16 },
    { id: 17, parent: 'Транспорт', child: 'Автобусы', name: 'Трансфер «БасЛайн»', city: 'Москва', price: 18000, exp: 10, video: false, reviews: true, travel: false, loyalty: false, photo: 1 },
    { id: 18, parent: 'Прочее', child: 'Тимбилдинг', name: 'Организация тимбилдинга TeamUp', city: 'Москва', price: 95000, exp: 11, video: true, reviews: true, travel: true, loyalty: true, photo: 2 },
  ];

  SUPPLIERS.forEach((s, i) => { s.stats = { views: [341, 508, 196, 271, 154, 622, 383, 447,
    229, 118, 265, 97, 412, 188, 143, 206, 174, 331][i] || 150 }; });

  /* ─────────── 5. ПРАЙС-ЛИСТЫ ПОСТАВЩИКОВ ─────────── */
  /* По договору поставщик заполняет карточку перечнем услуг через визард.
     Цена — розничная; в бонусной программе участвует не обязательно вся
     карточка, а конкретные позиции. Поле price у поставщика выводится из
     минимальной цены услуг — оно нужно фильтру «стоимость от». */

  const SERVICES = {
    1: [{ name: 'Ведение мероприятия, до 6 часов', price: 45000, loyalty: true },
        { name: 'Ведение с написанием сценария', price: 72000, loyalty: true },
        { name: 'Выезд в другой город', price: 18000, loyalty: false }],
    2: [{ name: 'Диджей-сет, 4 часа', price: 30000, loyalty: true },
        { name: 'Диджей-сет с саксофоном', price: 55000, loyalty: true },
        { name: 'Дополнительный час', price: 8000, loyalty: false }],
    3: [{ name: 'Концертная программа, 2 отделения', price: 90000, loyalty: false },
        { name: 'Фоновая программа, 3 часа', price: 60000, loyalty: false }],
    4: [{ name: 'Шоу-номер, 15 минут', price: 70000, loyalty: false },
        { name: 'Три номера в течение вечера', price: 160000, loyalty: false }],
    5: [{ name: 'Аниматор на детскую зону, 4 часа', price: 15000, loyalty: true },
        { name: 'Аквагрим и твистинг', price: 12000, loyalty: true }],
    6: [{ name: 'Кофе-брейк, цена за гостя', price: 900, loyalty: true },
        { name: 'Фуршет, цена за гостя', price: 2500, loyalty: true },
        { name: 'Банкет, цена за гостя', price: 4200, loyalty: true },
        { name: 'Дегустация меню', price: 6000, loyalty: true }],
    7: [{ name: 'Мобильный бар, 4 часа', price: 40000, loyalty: true },
        { name: 'Велком-зона с шампанским', price: 25000, loyalty: true }],
    8: [{ name: 'Фотосъёмка мероприятия, 5 часов', price: 35000, loyalty: true },
        { name: 'Съёмка полного дня', price: 60000, loyalty: true },
        { name: 'Экспресс-отбор в течение суток', price: 12000, loyalty: false }],
    9: [{ name: 'Видеосъёмка, монтаж ролика 3 минуты', price: 60000, loyalty: false },
        { name: 'Многокамерная съёмка конференции', price: 140000, loyalty: false }],
    10: [{ name: 'Онлайн-трансляция, одна камера', price: 120000, loyalty: false },
         { name: 'Трансляция с режиссёрским пультом', price: 260000, loyalty: false }],
    11: [{ name: 'Комплект лаунж-мебели на 30 гостей', price: 25000, loyalty: true },
         { name: 'Банкетные стулья, цена за штуку', price: 350, loyalty: true }],
    12: [{ name: 'Шатёр 10×20 с монтажом', price: 150000, loyalty: false },
         { name: 'Отопление шатра на сутки', price: 40000, loyalty: false }],
    13: [{ name: 'Звуковой комплект на 200 человек', price: 80000, loyalty: true },
         { name: 'Световое оборудование', price: 65000, loyalty: true },
         { name: 'LED-экран, цена за м²', price: 9000, loyalty: false }],
    14: [{ name: 'Хостес, смена 8 часов', price: 5000, loyalty: false },
         { name: 'Стойка регистрации под ключ', price: 35000, loyalty: false }],
    15: [{ name: 'Технический директор на площадке', price: 50000, loyalty: false },
         { name: 'Техническая проработка площадки', price: 25000, loyalty: false }],
    16: [{ name: 'Синхронный перевод, пара языков', price: 45000, loyalty: true },
         { name: 'Аренда оборудования для синхрона', price: 38000, loyalty: true }],
    17: [{ name: 'Автобус 45 мест, подача и трансфер', price: 18000, loyalty: false },
         { name: 'Микроавтобус 19 мест', price: 12000, loyalty: false }],
    18: [{ name: 'Тимбилдинг на 50 человек', price: 95000, loyalty: true },
         { name: 'Квест на территории площадки', price: 60000, loyalty: true }],
  };
  /* ── R3-A: поставщики по новому дереву «Услуги» ──
     Подписи разделов и пунктов приведены к файлу фильтров (supRename). У каждой услуги
     появилась единица цены (priceUnit); у кейтеринга — цена на человека и меню,
     у аренды оборудования — доставка, монтаж и оператор, у фото и видео — минимальное
     количество часов и срок готовности материалов. */
  const SUPPLIER_EXTRA = {
    1: { priceUnit: 'project' }, 2: { priceUnit: 'shift' }, 3: { priceUnit: 'project' }, 4: { priceUnit: 'project' },
    5: { priceUnit: 'hour' }, 6: { priceUnit: 'project', pricePerPerson: 2500, halal: true },
    7: { priceUnit: 'shift' }, 8: { priceUnit: 'shift', minHours: 3, deliveryDays: 5 }, 9: { priceUnit: 'project', minHours: 4, deliveryDays: 14 },
    10: { priceUnit: 'project', minHours: 2, deliveryDays: 1 }, 11: { priceUnit: 'unit' }, 12: { priceUnit: 'unit' },
    13: { priceUnit: 'shift', delivery: true, installation: true, operator: true }, 14: { priceUnit: 'shift' },
    15: { priceUnit: 'shift' }, 16: { priceUnit: 'hour' }, 17: { priceUnit: 'hour' }, 18: { priceUnit: 'project' },
  };
  /* Новые поставщики R3: по одному на пункт дерева, где раньше никого не было,
     и ещё два кейтеринга — чтобы у «Халяльного» и «Кошерного меню» были счётчики. */
  const NEW_SUPPLIER_ROWS = [
    // id, раздел, пункт, название, город, цена, единица, опыт, флаги (v видео, r отзывы, t выезд), [услуга 1, услуга 2], доп. поля
    [19, 'Артисты', 'Знаменитость', 'Агентство звёзд «Афиша Live»', 'Москва', 450000, 'project', 15, 'v t', ['Выступление артиста, 40 минут', 'Ведение вечера известным ведущим']],
    [20, 'Артисты', 'Цирковой артист', 'Цирковая труппа «Арена»', 'Москва', 60000, 'project', 11, 'v r t', ['Цирковое шоу, 20 минут', 'Воздушная гимнастика на банкете']],
    [21, 'Артисты', 'Иллюзионист', 'Иллюзионист Марк Белов', 'Санкт-Петербург', 50000, 'project', 9, 'v r t', ['Сценическое шоу иллюзий', 'Микромагия для гостей, 2 часа']],
    [22, 'Артисты', 'Юморист / стендап-комик', 'Стендап-комик Илья Орлов', 'Москва', 120000, 'project', 7, 'v t', ['Стендап-программа, 30 минут', 'Стендап с импровизацией по брифу']],
    [23, 'Артисты', 'Актёр театра и кино', 'Актёрское агентство «Сцена»', 'Москва', 90000, 'project', 13, 'v r', ['Интерактивный спектакль', 'Ростовые персонажи и мизансцены']],
    [24, 'Артисты', 'Музыкант', 'Саксофонист Денис Волков', 'Казань', 25000, 'hour', 10, 'v r t', ['Саксофон на велкоме, 1 час', 'Живая музыка весь вечер']],
    [25, 'Артисты', 'Художник', 'Арт-студия «Шарж за минуту»', 'Москва', 18000, 'hour', 6, 'r', ['Шаржи гостей, 2 часа', 'Живописный портрет на сцене']],
    [26, 'Артисты', 'Другое', 'Песочная анимация «Дюна»', 'Нижний Новгород', 35000, 'project', 5, 'v', ['Песочное шоу на экране', 'Песочная история компании']],
    [27, 'Аренда', 'Животные', 'Ферма «Альпака-тур»', 'Подмосковье', 30000, 'hour', 4, 'r', ['Альпаки на празднике, 2 часа', 'Контактный зоопарк']],
    [28, 'Аренда', 'Костюмы', 'Прокат костюмов «Гардероб эпох»', 'Санкт-Петербург', 3500, 'unit', 12, 'r', ['Костюм на вечер', 'Тематический образ под ключ']],
    [29, 'Аренда', 'Другое', 'Прокат фотозон «Рамка»', 'Москва', 22000, 'unit', 6, 'r', ['Фотозона на мероприятие', 'Неоновая вывеска на заказ']],
    [30, 'Питание', 'Кейтеринг', 'Кейтеринг «Восток»', 'Казань', 120000, 'project', 9, 'r', ['Банкет, цена за гостя', 'Фуршет с халяльным меню'], { pricePerPerson: 1800, halal: true }],
    [31, 'Питание', 'Кейтеринг', 'Кошер-кейтеринг «Шалом»', 'Москва', 180000, 'project', 14, 'r t', ['Кошерный банкет, цена за гостя', 'Кофе-брейк под надзором'], { pricePerPerson: 3900, kosher: true }],
    [32, 'Питание', 'Другое', 'Кондитерская «Торт-Event»', 'Москва', 15000, 'unit', 8, 'r', ['Торт на 50 гостей', 'Кенди-бар']],
    [33, 'Персонал', 'Режиссёр мероприятия', 'Режиссёр Анна Мельникова', 'Москва', 80000, 'project', 14, 'r t', ['Режиссура мероприятия', 'Сценарий и прогон']],
    [34, 'Персонал', 'Продюсер', 'Продюсерский центр «Эфир»', 'Москва', 150000, 'project', 12, 'v r t', ['Продюсирование мероприятия', 'Подбор артистов под бюджет']],
    [35, 'Персонал', 'Ассистент на мероприятие', 'Агентство «Правая рука»', 'Санкт-Петербург', 6000, 'shift', 5, 'r', ['Ассистент, смена 8 часов', 'Команда ассистентов на форум']],
    [36, 'Персонал', 'Хелпер', 'Команда хелперов «Помощь+»', 'Москва', 4000, 'shift', 4, '', ['Хелпер, смена 8 часов', 'Регистрация и навигация гостей']],
    [37, 'Персонал', 'Координатор / сопровождение', 'ЛУКМАЙС — координация мероприятий', 'Москва', 45000, 'shift', 10, 'r t', ['Координатор на площадке', 'Сопровождение группы']],
    [38, 'Персонал', 'Гид', 'Гид-экскурсовод Ольга Сергеева', 'Санкт-Петербург', 12000, 'hour', 9, 'r', ['Обзорная экскурсия, 3 часа', 'Экскурсия для иностранных гостей']],
    [39, 'Персонал', 'Стилист', 'Стилист Вера Ланская', 'Москва', 15000, 'hour', 8, 'r t', ['Образ для спикера', 'Стилист на съёмку']],
    [40, 'Персонал', 'Визажист', 'Визаж-студия «Лицо»', 'Москва', 7000, 'unit', 6, 'r', ['Макияж к выходу на сцену', 'Визажист на весь день']],
    [41, 'Персонал', 'Клининг', 'Клининг «Чистый зал»', 'Москва', 25000, 'shift', 7, '', ['Уборка во время мероприятия', 'Уборка после демонтажа']],
    [42, 'Персонал', 'Модератор', 'Модератор Сергей Иванов', 'Москва', 60000, 'project', 11, 'v r t', ['Модерация дискуссии', 'Модерация стратегической сессии']],
    [43, 'Персонал', 'Охрана / ЧОП', 'ЧОП «Щит»', 'Москва', 3500, 'hour', 15, 'r', ['Охранник, 1 час', 'Пост охраны на мероприятии']],
    [44, 'Персонал', 'Официант', 'Агентство официантов «Сервис»', 'Самара', 2500, 'hour', 6, '', ['Официант, 1 час', 'Бармен на банкет']],
    [45, 'Персонал', 'Сценарист', 'Сценарист Ксения Рябова', 'Москва', 40000, 'project', 7, 'r t', ['Сценарий корпоратива', 'Сценарий конференции']],
    [46, 'Персонал', 'Модель', 'Модельное агентство «Профиль»', 'Москва', 9000, 'hour', 10, 'v', ['Промо-модель, 1 час', 'Модели для стенда']],
    [47, 'Персонал', 'Другие', 'Сурдопереводчики «Жест»', 'Москва', 5000, 'hour', 8, 'r t', ['Сурдоперевод, 1 час', 'Сурдоперевод трансляции']],
    [48, 'Транспорт', 'Автомобиль с водителем', 'Трансфер «Премьер»', 'Санкт-Петербург', 3500, 'hour', 9, 'r', ['Автомобиль бизнес-класса', 'Встреча в аэропорту']],
    [49, 'Прочее', 'Мастер-класс', 'Студия мастер-классов «Руки»', 'Москва', 2500, 'unit', 6, 'v r', ['Мастер-класс по керамике', 'Кулинарный мастер-класс']],
    [50, 'Прочее', 'Застройка', 'Выставочная застройка «Стенд-Про»', 'Москва', 300000, 'project', 13, 'r t', ['Стенд 36 м²', 'Застройка сцены']],
    [51, 'Прочее', 'Типография', 'Типография «Оттиск»', 'Москва', 9000, 'unit', 16, '', ['Бейджи, 100 шт.', 'Пресс-волл']],
    [52, 'Прочее', 'Сувенирная продукция', 'Мерч-студия «Логотип»', 'Санкт-Петербург', 50000, 'project', 8, 'r', ['Наборы участника', 'Брендированный мерч']],
    [53, 'Прочее', 'Оформление / дизайн', 'Декор-студия «Флора»', 'Москва', 80000, 'project', 9, 'v r t', ['Оформление зала цветами', 'Декор свадебной церемонии']],
    [54, 'Прочее', 'Кальянный кейтеринг', 'Кальянный кейтеринг «Дым»', 'Москва', 12000, 'unit', 5, 'r', ['Кальян на мероприятие', 'Кальянная зона на вечер']],
    [55, 'Прочее', 'Экскурсионное обслуживание', 'Экскурсионное бюро «Маршрут»', 'Казань', 35000, 'project', 10, 'r', ['Экскурсия по Казани для группы', 'Трансфер с гидом']],
    [56, 'Прочее', 'Авиа- и ж/д-билеты', 'Бизнес-тревел «Трэвел Деск»', 'Москва', 1500, 'unit', 12, 'r t', ['Оформление билетов', 'Групповое бронирование']],
    [57, 'Прочее', 'DMC', 'DMC «Волга Инсентив»', 'Нижний Новгород', 250000, 'project', 11, 'v r t', ['Инсентив-программа под ключ', 'Логистика группы']],
    [58, 'Прочее', 'Продакшн', 'Продакшн «Сцена 360»', 'Москва', 400000, 'project', 14, 'v r t', ['Техническое продакшн-сопровождение', 'Постановка шоу']],
    [59, 'Фото и видео', 'Фотограф', 'Фотограф Никита Громов', 'Сочи', 20000, 'hour', 7, 'r t', ['Фотосъёмка, 1 час', 'Съёмка выездной свадьбы'], { minHours: 2, deliveryDays: 7 }],
    [60, 'Аренда', 'Оборудование', 'Прокат техники «Звук и свет»', 'Санкт-Петербург', 45000, 'shift', 9, 'r', ['Звуковой комплект на 100 человек', 'Проектор и экран'], { delivery: true }],
  ];
  const FLAG = (s, k) => s.split(' ').includes(k);
  NEW_SUPPLIER_ROWS.forEach(([id, parent, child, name, city, price, unit, exp, flags, svc, extra]) => {
    SUPPLIERS.push(Object.assign({ id, parent, child, name, city, price, exp,
      video: FLAG(flags, 'v'), reviews: FLAG(flags, 'r'), travel: FLAG(flags, 't'), loyalty: false,
      photo: ((id + 5) % 16) + 1, priceUnit: unit, stats: { views: 60 + (id * 37) % 300 } }, extra || {}));
    SERVICES[id] = [{ name: svc[0], price, loyalty: id % 3 === 0 }, { name: svc[1], price: Math.round(price * 1.6 / 500) * 500, loyalty: false }];
  });
  SUPPLIERS.forEach(s => {
    s.parent = supRename(s.parent); s.child = supRename(s.child);
    Object.assign(s, SUPPLIER_EXTRA[s.id] || {});
    if (!s.priceUnit) s.priceUnit = 'project';
  });

  SUPPLIERS.forEach(s => {
    s.services = SERVICES[s.id] || [];
    if (s.services.length) s.price = Math.min(...s.services.map(x => x.price));
    s.loyalty = s.services.some(x => x.loyalty);
  });

  /* ─────────── 6. ОПИСАНИЯ ОБЪЕКТОВ ─────────── */
  /* Прозаический блок «О площадке» на карточке объекта. Пишем то, что менеджер
     всё равно выясняет звонком: чем площадка удобна и где подвох. */

  const DESCRIPTIONS = {
    1: 'Отель в деловом центре с тремя залами на одном этаже — удобно, когда пленарная часть и секции идут параллельно. Большой зал делится перегородками на две части. Загрузка оборудования через грузовой лифт из подземного паркинга.',
    2: 'Кирпичный лофт с окнами в пол и потолком 5,5 м. Кейтеринг свой или привозной, алкоголь можно везти без пробкового сбора. Единственный вход общий с грузовым — тяжёлое оборудование заводите до заезда гостей.',
    3: 'Конгресс-центр с павильоном под выставку и залом на 850 человек театром. Есть силовое подключение и подвес по всей площади. Инфраструктура рассчитана на многодневные форумы, но кейтеринг только собственный.',
    4: 'Пятизвёздочный отель на набережной: бальный зал с окнами на Неву, номерной фонд на 175 номеров. Подходит, когда нужно разместить иногородних участников на той же площадке. Согласование монтажа — за трое суток.',
    5: 'Ресторан с открытой верандой у моря. Хорош для банкетов до 90 человек и выездных регистраций. Веранда не отапливается — с ноября по апрель работает только основной зал.',
    6: 'Клуб с готовым светом и звуком, работает после «часа тишины». Танцпол трансформируется под конференцию, но окон нет совсем — для дневных мероприятий закладывайте световое оборудование.',
    7: 'Загородная усадьба с шатром, поляной и спортивной инфраструктурой. Основной сценарий — выездной тимбилдинг с ночёвкой или свадьба. До Москвы 24 км, трансфер гостей планируйте заранее.',
    8: 'Теплоход на Волге: банкет на главной палубе, велком на верхней. Навигация с мая по октябрь. Высота потолка 2,9 м — сцену и подвес не поставить.',
    9: 'Небольшой бутик-отель в центре: библиотека под совет директоров и зал на 90 человек. Формат камерный, для массовых мероприятий не подходит, зато согласования проходят быстро.',
    10: 'Глэмпинг в сосновом лесу с купольным шатром и костровой площадкой. Электричество ограничено, тяжёлый звук не потянет. Сильная сторона — территория и активности, а не техническое оснащение.',
    11: 'Конференц-центр с амфитеатром: ряды с уклоном, экран виден с любого места. Три зала и фойе под кофе-брейки. Парковка на 40 машин, в будни днём заполняется к десяти утра.',
    12: 'Курортный отель с конференц-залом и банкетным залом, выход к пляжу. Загрузка высокая с июня по сентябрь — даты бронируйте за три месяца.',
    13: 'Арт-пространство в бывшем цехе: белые стены, потолок 6,5 м, полный подвес. Часто берут под презентации и showcase. Своей мебели нет, всё привозное.',
    14: 'Отель в центре с большим залом на 280 человек театром и халяльной кухней. Есть молельная комната — важно для мероприятий с гостями из региона и стран Залива.',
  };
  VENUES.forEach(v => { v.desc = DESCRIPTIONS[v.id] || ''; });

  Object.assign(DESCRIPTIONS, NEW_DESCRIPTIONS);

  /* ─────────── 7. ВИТРИНА БАЛЛОВ ─────────── */
  /* rub — розничная цена. pts считается через servicePoints, стоимость для
     ресурса — через serviceCost. Собственные услуги ресурса (подписка)
     скидки не имеют и списываются по номиналу. */

  const SHOP = [
    { id: 1, title: 'Аренда переговорной, 4 часа', provider: 'Отель «Аврора»', rub: 10000 },
    { id: 2, title: 'Кофе-брейк на 20 человек', provider: 'Кейтеринг «Формат»', rub: 18000 },
    { id: 3, title: 'Ведение корпоратива, до 6 часов', provider: 'Ведущий Артём Соколов', rub: 45000 },
    { id: 4, title: 'Фотосъёмка мероприятия, 5 часов', provider: 'Фотограф Мария Лебедева', rub: 35000 },
    { id: 5, title: 'Дегустация банкетного меню', provider: 'Кейтеринг «Формат»', rub: 6000 },
    { id: 6, title: 'Подписка ПРЕМИУМ на 6 месяцев', provider: 'МАЙСЛИСТ', rub: 8750, own: true, premiumMonths: 6 },
  ].map(s => Object.assign(s, {
    pts: servicePoints(s.rub),
    cost: s.own ? s.rub : serviceCost(s.rub),
  }));

  /* Затравка отзывов. Объявлена до состояния — оно её читает. */
  /* Тестовые отзывы, добавленные позже, дописываются к уже сохранённым у посетителя. */
  const withSeedReviews = (list) => { list = Array.isArray(list) ? list : []; const ids = new Set(list.map(r => r.id));
    return list.concat(REVIEW_SEED.filter(r => !ids.has(r.id))); };
  const REVIEW_SEED = [
    { id: 1, target: 'venue', targetId: 1, author: 'Мария И.', role: 'Event-агентство «Формат»', date: '18.07.2026', rating: 5, event: 'Конференция на 120 человек', text: 'Площадку отдали за час до заезда, техника отработала без замечаний. Единственное — парковка тесная, автобус пришлось ставить на улице.' },
    { id: 2, target: 'venue', targetId: 2, author: 'Дмитрий К.', role: 'Прямой клиент', date: '02.07.2026', rating: 4, event: 'Презентация продукта', text: 'Затемнение реальное, свой свет не понадобился. Загрузка оборудования только через основной вход — закладывайте лишний час на монтаж.' },
    { id: 3, target: 'venue', targetId: 4, author: 'Анна С.', role: 'DMC', date: '26.06.2026', rating: 5, event: 'Гала-ужин, 280 гостей', text: 'Отработали ровно, меню согласовали с третьего захода без нервов. Монтаж просят согласовывать за трое суток — это правда, не формальность.' },
    { id: 4, target: 'venue', targetId: 7, author: 'Игорь В.', role: 'Фриланс-организатор', date: '14.06.2026', rating: 4, event: 'Выездной тимбилдинг', text: 'Территория отличная, активности свои есть. Связь на поляне ловит плохо — рации берите с собой.' },
    { id: 5, target: 'supplier', targetId: 8, author: 'Мария И.', role: 'Event-агентство «Формат»', date: '10.07.2026', rating: 5, event: 'Корпоратив, 200 гостей', text: 'Материал прислали на третий день, отбор нормальный. Работали спокойно, в кадр не лезли.' },
    { id: 7, target: 'venue', targetId: 1, author: 'Сергей Л.', role: 'Корпоративный клиент', date: '05.08.2026', rating: 5, event: 'Стратегическая сессия, 60 человек', text: 'Переговорные рядом с большим залом — удобно делить группу на секции. Кофе-брейк подавали в фойе вовремя.' },
    { id: 8, target: 'venue', targetId: 3, author: 'Елена Р.', role: 'Event-агентство «Вектор»', date: '22.07.2026', rating: 4, event: 'Отраслевой форум, 900 участников', text: 'Залы трансформируются быстро, регистрацию поставили в атриуме. Навигацию внутри комплекса лучше продумать заранее.' },
    { id: 9, target: 'venue', targetId: 5, author: 'Павел Т.', role: 'Прямой клиент', date: '15.07.2026', rating: 5, event: 'Юбилей компании, 90 гостей', text: 'Терраса вечером — то, ради чего выбирали. Кухня ровная, меню утвердили за одну встречу.' },
    { id: 10, target: 'venue', targetId: 9, author: 'Кира Н.', role: 'DMC', date: '09.07.2026', rating: 5, event: 'Выездное совещание, 30 человек', text: 'Камерно, тихо, номера с видом на залив. Для небольшой группы руководителей — идеальный формат.' },
    { id: 11, target: 'venue', targetId: 11, author: 'Алексей М.', role: 'Фриланс-организатор', date: '30.06.2026', rating: 4, event: 'Обучающий семинар', text: 'Техника в залах современная, техник на площадке отзывчивый. Парковка платная — предупредите гостей.' },
    { id: 12, target: 'venue', targetId: 14, author: 'Наталья Г.', role: 'Event-агентство «Формат»', date: '20.06.2026', rating: 5, event: 'Пресс-конференция', text: 'Панорамный зал производит впечатление на гостей, свет для съёмки ставить почти не пришлось.' },
    { id: 6, target: 'supplier', targetId: 6, author: 'Ольга П.', role: 'Прямой клиент', date: '28.06.2026', rating: 4, event: 'Кофе-брейки на трёхдневном форуме', text: 'По вкусу вопросов нет. Смену подач держат по таймингу, но на третий день ассортимент повторился.' },
  ];

  /* R3-B, строка 106: у поставщиков с отметкой «Отзывы» должны быть отзывы — отметка и фильтр
     «Есть отзывы» теперь считаются по наличию отзывов (supplierHasReviews), а не по флагу. */
  const SUPPLIER_REVIEW_TEXTS = [
    ['Мария И.', 'Event-агентство «Формат»', 5, 'Договорились за один звонок, на площадку приехали заранее, всё по таймингу. Будем работать ещё.'],
    ['Олег Д.', 'Корпоративный клиент', 5, 'Сделали ровно то, что обсуждали на брифе. Гости потом спрашивали контакты.'],
    ['Светлана Ж.', 'DMC', 4, 'Хороший уровень, но смету пришлось уточнять дважды: часть позиций добавили по ходу.'],
    ['Артём П.', 'Фриланс-организатор', 5, 'Отвечают быстро, документы закрывающие прислали на следующий день после мероприятия.'],
    ['Ирина К.', 'Прямой клиент', 4, 'Всё прошло спокойно. Единственное — в день мероприятия связь была только через менеджера.'],
    ['Глеб С.', 'Event-агентство «Вектор»', 5, 'Работаем не первый раз: стабильное качество и понятные условия.'],
  ];
  const SUPPLIER_EVENTS = ['Корпоратив, 120 гостей', 'Конференция, 300 участников', 'Выездная сессия, 40 человек',
    'Новогодний вечер, 200 гостей', 'Презентация продукта, 80 гостей', 'Свадьба, 90 гостей'];
  SUPPLIERS.filter(s => s.reviews && !REVIEW_SEED.some(r => r.target === 'supplier' && r.targetId === s.id)).forEach((s, i) => {
    const [author, role, rating, text] = SUPPLIER_REVIEW_TEXTS[(s.id + i) % SUPPLIER_REVIEW_TEXTS.length];
    const d = String(1 + (s.id * 7) % 27).padStart(2, '0'), m = String(5 + (s.id % 5)).padStart(2, '0');
    REVIEW_SEED.push({ id: 100 + s.id, target: 'supplier', targetId: s.id, author, role, date: `${d}.${m}.2026`, rating,
      event: SUPPLIER_EVENTS[s.id % SUPPLIER_EVENTS.length], text });
  });

  /* ─────────── 8. СОСТОЯНИЕ ПОЛЬЗОВАТЕЛЯ ─────────── */
  /* Ключи localStorage. mh_compare теперь хранит ID ЗАЛОВ, а не объектов —
     это ломающее изменение относительно старого mh_compare, поэтому ключ новый. */

  const K = {
    tariff: 'ml_tariff', compare: 'ml_compare_halls', favs: 'ml_favs_halls', premUntil: 'ml_prem_until',
    black: 'ml_blacklist', points: 'ml_points', requests: 'ml_requests',
    myVenues: 'ml_my_venues', myServices: 'ml_my_services', reviews: 'ml_reviews',
    shopItems: 'ml_shop_items', bonusOrders: 'ml_bonus_orders', supplierRequests: 'ml_supplier_requests',
    filters: 'ml_filters', sfilters: 'ml_supplier_filters', invoices: 'ml_invoices', appeals: 'ml_appeals',
  };
  const read = (k, d) => { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch (e) { return d; } };
  const write = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { } };

  const state = {
    tariff: read(K.tariff, 'guest'),   // первый заход — незарегистрированный посетитель
    premUntil: read(K.premUntil, null),
    invoices: read(K.invoices, []),
    filters: unpackFilters(read(K.filters, null)),
    /* R3-B, строка 109: у демо-кабинета площадки сразу есть опубликованный объект — его можно открыть
       через «Редактировать» и дополнить через «Добавить зал». */
    myVenues: (read(K.myVenues, null) || [seedOwnVenue()]).map(v => Array.isArray(v.features) ? Object.assign({}, v, { features: migrateFeatures(v.features, v) }) : v),
    /* R3-B, строка 124: обращения в поддержку и арбитраж — по ролям кабинета. */
    appeals: read(K.appeals, null) || appealSeed(),
    shopItems: read(K.shopItems, []),
    bonusOrders: read(K.bonusOrders, []),
    supplierRequests: read(K.supplierRequests, []),
    reviews: withSeedReviews(read(K.reviews, REVIEW_SEED)),
    myServices: read(K.myServices, []),
    supplierFilters: unpackSupplierFilters(read(K.sfilters, null)),
    compare: new Set(read(K.compare, [])),
    favs: new Set(read(K.favs, [])),
    blacklist: new Set(read(K.black, [])),
    points: read(K.points, { free: 12800, locked: 4500, expiring: 800, expiresAt: '31.12.2026' }),
    requests: migrateRequests(read(K.requests, [
      {
        id: 'RQ-260714-0031', date: '14.07.2026', title: 'Конференция «Итоги полугодия», 120 чел.',
        dates: '24–25.07.2026', guests: 120,
        objects: [{ venueId: 1, status: 'sent' }, { venueId: 11, status: 'sent' },
          { venueId: 4, status: 'done', venueDone: true, guests: 120, dates: '10.07.2026' }],
      },
      {
        id: 'RQ-260703-0018', date: '03.07.2026', title: 'Выездной тимбилдинг, 60 чел.',
        dates: '08.08.2026', guests: 60,
        objects: [{ venueId: 7, status: 'sent' }, { venueId: 10, status: 'cancelled', reason: 'Не устроила стоимость' }],
      },
      {
        id: 'RQ-260612-0007', date: '12.06.2026', title: 'Летний корпоратив, 80 чел.',
        dates: '20.06.2026', guests: 80,
        objects: [{ venueId: 2, status: 'reviewed', venueDone: true, guests: 80, dates: '20.06.2026' },
          { venueId: 6, status: 'declined', reason: 'Нет свободных дат' }],
      },
    ])),
  };

  function migrateRequests(list) {
    /* Даты и участники тестовых запросов — для посетителей, у которых запросы уже сохранены без них. */
    const SEED_REQ_FIELDS = {
      'RQ-260714-0031': { dates: '24–25.07.2026', guests: 120 },
      'RQ-260703-0018': { dates: '08.08.2026', guests: 60 },
      'RQ-260612-0007': { dates: '20.06.2026', guests: 80 },
    };
    /* R3-B, строка 120: групповой запрос уходит из сравнения залов — у каждого объекта есть залы,
       а у запроса — параметры поиска. Тестовые запросы, сохранённые без них, дополняем. */
    const SEED_REQ_HALLS = {
      'RQ-260714-0031': { hallIds: [101, 1101, 402], params: ['от 120 чел.', 'Деловое', 'зал 1: Театр от 120'] },
      'RQ-260703-0018': { hallIds: [701, 1001], params: ['Подмосковье', 'от 60 чел.', 'Тимбилдинг'] },
      'RQ-260612-0007': { hallIds: [201, 601], params: ['от 80 чел.', 'Банкет / фуршет'] },
    };
    return (Array.isArray(list) ? list : []).map(r => Object.assign({}, r,
      SEED_REQ_FIELDS[r.id] && !(r.dates && +r.guests) ? SEED_REQ_FIELDS[r.id] : {},
      SEED_REQ_HALLS[r.id] && !(r.hallIds || []).length ? { hallIds: SEED_REQ_HALLS[r.id].hallIds } : {},
      SEED_REQ_HALLS[r.id] && !(r.params || []).length ? { params: SEED_REQ_HALLS[r.id].params } : {}, {
      objects: (r.objects || []).map(o => o.status === 'confirmed' ? Object.assign({}, o, { status: 'sent' }) : o),
    }));
  }

  const persist = {
    tariff: () => write(K.tariff, state.tariff),
    invoices: () => write(K.invoices, state.invoices),
    appeals: () => write(K.appeals, state.appeals),
    filters: () => write(K.filters, packFilters(state.filters)),
    myVenues: () => write(K.myVenues, state.myVenues),
    shopItems: () => write(K.shopItems, state.shopItems),
    bonusOrders: () => write(K.bonusOrders, state.bonusOrders),
    supplierRequests: () => write(K.supplierRequests, state.supplierRequests),
    reviews: () => write(K.reviews, state.reviews),
    myServices: () => write(K.myServices, state.myServices),
    supplierFilters: () => write(K.sfilters, packSupplierFilters(state.supplierFilters)),
    compare: () => write(K.compare, [...state.compare]),
    favs: () => write(K.favs, [...state.favs]),
    blacklist: () => write(K.black, [...state.blacklist]),
    points: () => write(K.points, state.points),
    requests: () => write(K.requests, state.requests),
  };

  // Однократная миграция: фильтры и объекты кабинета со старыми удобствами (русские строки) сохраняем кодами
  const oldShape = (x) => !!x && ['food', 'opts', 'other', 'sport'].some(k => k in x);
  if (oldShape(read(K.filters, null))) persist.filters();
  if (JSON.stringify(read(K.myVenues, null) || '').match(/"features":\[[^\]]*[А-Яа-я]/)) persist.myVenues();
  if (JSON.stringify(read(K.requests, null) || '').includes('"status":"confirmed"')) persist.requests();

  /* ─────────── 9. СЕЛЕКТОРЫ И ЛОГИКА ─────────── */

  const tariff = () => TARIFFS[state.tariff] || TARIFFS.start;
  const setTariff = (k) => {
    if (!TARIFFS[k]) return;
    if (k === 'guest') { state.compare.clear(); persist.compare(); }
    state.tariff = k; persist.tariff();
    // лимит сравнения (по объектам) мог уменьшиться — оставляем залы первых lim объектов
    const lim = TARIFFS[k].compare;
    const keep = new Set();
    const next = [...state.compare].filter(id => {
      const h = hallById(id); if (!h) return false;
      if (keep.has(h.venueId)) return true;
      if (keep.size >= lim) return false;
      keep.add(h.venueId); return true;
    });
    if (next.length !== state.compare.size) { state.compare = new Set(next); persist.compare(); }
  };

  const venueById = (id) => VENUES.find(v => v.id === +id) || null;
  const allHalls = () => VENUES.reduce((a, v) => a.concat(v.halls), []);
  const hallById = (id) => allHalls().find(h => h.id === +id) || null;
  const hallVenue = (h) => venueById(h.venueId);

  /** Максимальная вместимость зала по любой схеме рассадки. */
  const hallCapacity = (h) => Math.max(0, ...Object.values(h.seats || {}));
  /** Вместимость объекта — по самому большому залу. */
  const venueCapacity = (v) => Math.max(0, ...v.halls.map(hallCapacity));
  /** Минимальная цена дня среди залов, 0 = есть залы по договорённости. */
  /** Общий номерной фонд. Разбивка TWIN/SNGL доступна только на ПРЕМИУМ. */
  const venueRooms = (v) => (v.rooms.twin || 0) + (v.rooms.sngl || 0);
  const venueMinPrice = (v) => {
    const p = v.halls.map(h => h.priceDay).filter(x => x > 0);
    return p.length ? Math.min(...p) : 0;
  };

  /**
   * Можно ли закрыть все требования РАЗНЫМИ залами объекта.
   * Требований и залов единицы, поэтому обычный перебор с возвратом:
   * жадный выбор здесь ошибается, если два требования претендуют на один зал.
   */
  function hallsSatisfy(halls, reqs) {
    if (!reqs || !reqs.length) return { ok: true, used: [] };
    const fits = (h, r) => {
      const need = +r.min || 0;
      if (!r.seating) return hallCapacity(h) >= need;
      return (h.seats[r.seating] || 0) >= need;
    };
    const cand = reqs.map(r => halls.map((h, i) => i).filter(i => fits(halls[i], r)));
    if (cand.some(c => !c.length)) return { ok: false, used: [] };
    // сначала самые узкие требования — меньше ветвлений
    const order = reqs.map((_, i) => i).sort((a, b) => cand[a].length - cand[b].length);
    const used = new Set(), pick = {};
    const go = (k) => {
      if (k === order.length) return true;
      const ri = order[k];
      for (const hi of cand[ri]) {
        if (used.has(hi)) continue;
        used.add(hi); pick[ri] = hi;
        if (go(k + 1)) return true;
        used.delete(hi); delete pick[ri];
      }
      return false;
    };
    if (!go(0)) return { ok: false, used: [] };
    return { ok: true, used: reqs.map((_, i) => pick[i]) };
  }

  /** Пустой набор фильтров. Ключи — fkey из VENUE_FILTERS. */
  function emptyFilters() {
    return {
      city: '', people: 0, peopleTo: 0, eventType: '',   // peopleTo 0 — без верхней границы
      cats: new Set(), stars: new Set(),
      feats: new Set(),                // чекбоксы-свойства по кодам (логика «И»)
      cuisine: new Set(),              // кухня — мультивыбор, логика «ИЛИ»
      rooms: 0,                        // всего номеров от — виден всем с «БИЗНЕСА»
      twin: 0, sngl: 0,                // разбивка, только ПРЕМИУМ
      /* Требования к залам. Каждый элемент — ОТДЕЛЬНЫЙ зал объекта:
         {seating:'theatre', min:250} плюс {seating:'banquet', min:120}
         найдёт объект, где есть И зал-театр на 250, И другой зал-банкет
         на 120. Пустой seating означает любую схему. */
      halls: [],
      hallArea: 0, dressing: 0,
      priceMode: 'day',                // переключатель «За день / За час»
      priceDay: [0, PRICE_DAY_MAX], priceHour: [0, PRICE_HOUR_MAX], confPkg: [0, CONF_MAX],
      avgCheck: 0, wardrobe: 0, parking: '', parkingSpaces: 0,
    };
  }
  const rangeOn = (F, k) => !!(F[k] && (F[k][0] > 0 || F[k][1] < LIMITS[k]));

  /** Есть ли у объекта чекбокс-свойство (has_floor_plan — свойство залов, считается отдельно). */
  function venueHas(v, code) {
    if (code === 'has_accommodation') return venueRooms(v) > 0;
    if (code === 'menu') return !!v.menu;
    if (code === 'loyalty') return !!v.loyaltyContract;
    if (code === 'has_floor_plan') return v.halls.some(h => h.plan);
    return (v.features || []).includes(code);
  }
  const eventOk = (v, et) => !et || (et === 'combined' ? v.eventTypes.length > 1 : v.eventTypes.includes(et));

  /**
   * Отбор залов по фильтрам. Возвращает объекты с УЖЕ отфильтрованными залами:
   * [{venue, halls:[...]}] — в выдаче показываются только подходящие залы.
   * exclude — код фильтра, который не учитывать (фасетные счётчики по логике «ИЛИ»:
   * иначе группа блокирует сама себя).
   */
  function filterVenues(F, exclude) {
    const out = [];
    const feats = [...(F.feats || [])].filter(c => c !== 'has_floor_plan');
    const planOnly = F.feats && F.feats.has('has_floor_plan');
    const mode = F.priceMode || 'day';
    const dayOn = mode === 'day' && rangeOn(F, 'priceDay'), hourOn = mode === 'hour' && rangeOn(F, 'priceHour');
    for (const v of VENUES) {
      if (state.blacklist.has(v.id)) continue;
      if (!eventOk(v, F.eventType)) continue;
      if (F.city && F.city !== ALL_CITIES && !v.city.toLowerCase().includes(F.city.toLowerCase())) continue;
      if (exclude !== 'category' && F.cats.size && !F.cats.has(v.cat)) continue;
      if (exclude !== 'stars' && F.stars.size && !F.stars.has(starKey(v))) continue;
      if (F.rooms && venueRooms(v) < F.rooms) continue;
      if (F.twin && (v.rooms.twin || 0) < F.twin) continue;
      if (F.sngl && (v.rooms.sngl || 0) < F.sngl) continue;
      // Чекбоксы-свойства — логика «И»: должны присутствовать все отмеченные.
      if (!feats.every(c => venueHas(v, c))) continue;
      if (exclude !== 'cuisine' && F.cuisine && F.cuisine.size && !(v.cuisine || []).some(c => F.cuisine.has(c))) continue;
      if (F.avgCheck && !(v.avgCheck && v.avgCheck <= F.avgCheck)) continue;
      if (rangeOn(F, 'confPkg') && !(v.confPackage && v.confPackage >= F.confPkg[0] && v.confPackage <= F.confPkg[1])) continue;
      if (F.dressing && (v.dressingRooms || 0) < F.dressing) continue;
      if (F.wardrobe && (v.wardrobe || 0) < F.wardrobe) continue;
      if (exclude !== 'parking' && F.parking && v.parking !== F.parking) continue;
      if (F.parkingSpaces && !(v.parking === 'private' && (v.parkingSpaces || 0) >= F.parkingSpaces)) continue;

      // Залы объекта, подходящие под ТЗ. «По договорённости» (цена 0) проходит всегда.
      const pool = v.halls.filter(h => {
        // вместимость «от – до»: объект проходит, если в нём есть зал из этого диапазона
        const lo = Math.min(F.people || 0, F.peopleTo || Infinity), hi = Math.max(F.people || 0, F.peopleTo || 0) || Infinity;
        if (lo && hallCapacity(h) < lo) return false;
        if (F.peopleTo && hallCapacity(h) > hi) return false;
        if (dayOn && h.priceDay > 0 && (h.priceDay < F.priceDay[0] || h.priceDay > F.priceDay[1])) return false;
        if (hourOn) {
          const agree = !h.priceDay && !h.priceHour;
          if (!agree && !(h.priceHour > 0 && h.priceHour >= F.priceHour[0] && h.priceHour <= F.priceHour[1])) return false;
        }
        if (F.hallArea && (h.area || 0) < F.hallArea) return false;
        if (planOnly && !h.plan) return false;
        return true;
      });
      if (!pool.length) continue;

      const reqs = (F.halls || []).filter(r => r.seating || +r.min > 0);
      const m = hallsSatisfy(pool, reqs);
      if (!m.ok) continue;
      // показываем те залы, что закрывают требования; без требований — весь пул
      const halls = reqs.length ? m.used.map(i => pool[i]).filter((h, i, a) => a.indexOf(h) === i) : pool;
      out.push({ venue: v, halls: sortHallsByPrice(halls), matched: reqs.length > 0 });
    }
    /* Платное продвижение: Топ-3 выше Топ-10, остальные в обычном порядке.
       Выделение рамкой (highlight) на позицию не влияет — это только вид. */
    const rank = (v) => (v.promo && v.promo.top) ? v.promo.top : 999;
    return out.sort((a, b) => rank(a.venue) - rank(b.venue));
  }

  /**
   * Зависимые фильтры: если фильтр скрыт при текущем типе мероприятия, режиме цены
   * или родителе, его значение сбрасывается, чтобы скрытый фильтр не сужал выдачу.
   * Возвращает список кодов, которые пришлось сбросить.
   */
  function pruneFilters(F) {
    const dropped = [];
    const E = emptyFilters();
    for (const d of VENUE_FILTERS) {
      if (!d.control || venueFilterVisible(d, F)) continue;
      if (d.control === 'check') { if (F.feats.has(d.code)) { F.feats.delete(d.code); dropped.push(d.code); } continue; }
      const k = d.fkey; if (!k) continue;
      const cur = JSON.stringify(F[k] instanceof Set ? [...F[k]] : F[k]);
      const def = JSON.stringify(E[k] instanceof Set ? [...E[k]] : E[k]);
      if (cur !== def) { F[k] = E[k]; dropped.push(d.code); }
    }
    return dropped;
  }

  /** Применён ли хоть один фильтр (для «Сбросить всё» и стартового состояния подбора). */
  function filtersActive(F) {
    return !!(F.city || F.people || F.peopleTo || F.eventType || F.cats.size || F.stars.size || F.feats.size
      || (F.cuisine && F.cuisine.size) || F.rooms || F.twin || F.sngl || F.hallArea || F.dressing || F.avgCheck
      || F.wardrobe || F.parking || F.parkingSpaces || (F.halls || []).some(r => r.seating || +r.min)
      || rangeOn(F, 'priceDay') || rangeOn(F, 'priceHour') || rangeOn(F, 'confPkg') || (F.priceMode || 'day') !== 'day');
  }

  /** Подпись диапазона вместимости: «от 100 до 300 чел.», «от 100 чел.», «до 300 чел.» */
  function peopleLabel(F) {
    const a = F.people || 0, b = F.peopleTo || 0;
    if (a && b) return `от ${Math.min(a, b)} до ${Math.max(a, b)} чел.`;
    return a ? `от ${a} чел.` : b ? `до ${b} чел.` : '';
  }
  /** Верхняя граница ползунков вместимости — по самому большому залу базы, с округлением до сотни. */
  const capacityMax = () => Math.ceil(Math.max(...VENUES.flatMap(v => v.halls.map(hallCapacity)), 100) / 100) * 100;

  /** Залы по цене дня по возрастанию; цена 0 («по договорённости») — в конце. */
  const sortHallsByPrice = (halls) => halls.slice().sort((a, b) => (a.priceDay || Infinity) - (b.priceDay || Infinity));

  /** Фасетный счётчик: сколько объектов останется, если добавить это условие.
      Старые имена групп ('cats') принимаются для совместимости. */
  function facetCount(F, code, value) {
    if (code === 'cats') code = 'category';
    if (code === 'category') return filterVenues(F, 'category').filter(x => x.venue.cat === value).length;
    if (code === 'stars') return filterVenues(F, 'stars').filter(x => starKey(x.venue) === +value).length;
    if (code === 'cuisine') return filterVenues(F, 'cuisine').filter(x => (x.venue.cuisine || []).includes(value)).length;
    if (code === 'parking') return filterVenues(F, 'parking').filter(x => !value || x.venue.parking === value).length;
    const base = filterVenues(F);
    if (code === 'has_floor_plan') return base.filter(x => x.halls.some(h => h.plan)).length;
    return base.filter(x => venueHas(x.venue, code)).length;
  }

  /* — сравнение и избранное работают по ID ЗАЛОВ, а лимит тарифа считается
       по ОБЪЕКТАМ: залов одного объекта можно добавить сколько угодно — */

  function inCompare(hallId) { return state.compare.has(+hallId); }
  /** Объекты, залы которых сейчас в сравнении. */
  const compareVenueIds = () => new Set([...state.compare].map(id => (hallById(id) || {}).venueId).filter(Boolean));
  /** @returns {{ok:boolean, reason?:string}} */
  function toggleCompare(hallId) {
    hallId = +hallId;
    if (state.compare.has(hallId)) { state.compare.delete(hallId); persist.compare(); return { ok: true }; }
    const lim = tariff().compare;
    const h = hallById(hallId), vs = compareVenueIds();
    if (h && !vs.has(h.venueId) && vs.size >= lim) {
      const w = lim % 10 === 1 && lim % 100 !== 11 ? 'объект' : lim % 10 >= 2 && lim % 10 <= 4 && (lim % 100 < 12 || lim % 100 > 14) ? 'объекта' : 'объектов';
      const need = tariff().key === 'prem' ? null : tariff().key === 'biz' ? 'prem' : 'biz';
      return { ok: false, need, reason: `Тариф «${tariff().name}»: максимум ${lim} ${w} в сравнении` };
    }
    state.compare.add(hallId); persist.compare(); return { ok: true };
  }
  const clearCompare = () => { state.compare.clear(); persist.compare(); };
  /** Перечитать изменчивое состояние из localStorage. Нужно при возврате
      на страницу из bfcache (pageshow): другая вкладка или страница могла
      очистить сравнение, а объект state в памяти остался прежним. */
  function reloadState() {
    state.tariff = read(K.tariff, state.tariff);
    state.invoices = read(K.invoices, state.invoices);
    state.compare = new Set(read(K.compare, []));
    state.favs = new Set(read(K.favs, []));
    state.blacklist = new Set(read(K.black, []));
    state.points = read(K.points, state.points);
    state.requests = migrateRequests(read(K.requests, state.requests));
    state.filters = unpackFilters(read(K.filters, null));
  }
  const compareHalls = () => [...state.compare].map(hallById).filter(Boolean);

  const isFav = (hallId) => state.favs.has(+hallId);
  const toggleFav = (hallId) => {
    hallId = +hallId;
    state.favs.has(hallId) ? state.favs.delete(hallId) : state.favs.add(hallId);
    persist.favs(); return state.favs.has(hallId);
  };

  const addToBlacklist = (venueId) => { state.blacklist.add(+venueId); persist.blacklist(); };
  const removeFromBlacklist = (venueId) => { state.blacklist.delete(+venueId); persist.blacklist(); };

  /* — групповые запросы — */

  function canGroupRequest(venueCount) {
    const lim = tariff().groupRequest;
    if (lim === 0) return { ok: false, reason: 'На тарифе «СТАРТ» групповые запросы недоступны — только одиночные' };
    if (venueCount > lim) return { ok: false, reason: `Тариф «${tariff().name}»: не более ${lim} объектов в групповом запросе` };
    return { ok: true };
  }

  function newRequestId() {
    const d = new Date();
    const p = (n) => String(n).padStart(2, '0');
    const stamp = String(d.getFullYear()).slice(2) + p(d.getMonth() + 1) + p(d.getDate());
    const seq = String(state.requests.length + 1).padStart(4, '0');
    return `RQ-${stamp}-${seq}`;
  }

  /* стр.19: запрос без дат или количества участников не создаётся.
     Возвращает {field, text} первой ошибки или null, если всё заполнено. */
  function requestFieldsError(opts) {
    opts = opts || {};
    if (!String(opts.dates || '').trim()) return { field: 'dates', text: 'Укажите даты мероприятия' };
    const g = +String(opts.guests || '').replace(/\s+/g, '');
    if (!(Number.isInteger(g) && g > 0)) return { field: 'guests', text: 'Укажите количество участников' };
    return null;
  }

  /** Создаёт запрос из текущего сравнения. Возвращает объект запроса или null. */
  function createRequest(title, letter, opts) {
    opts = opts || {};
    if (requestFieldsError(opts)) return null;
    const halls = compareHalls();
    const venueIds = [...new Set(halls.map(h => h.venueId))];
    const chk = canGroupRequest(venueIds.length);
    if (!chk.ok) return null;
    const req = {
      id: newRequestId(), date: new Date().toLocaleDateString('ru'),
      title: title || `Запрос на ${venueIds.length} объектов`, letter: letter || '',
      dates: opts.dates || '', guests: opts.guests || '',
      params: filtersSummary(state.filters),
      hallIds: halls.map(h => h.id),
      objects: venueIds.map(venueId => ({ venueId, status: 'sent' })),
    };
    state.requests.unshift(req); persist.requests();
    clearCompare();
    return req;
  }

  /* Быстрый запрос из карточки зала — мимо сравнения.
     По документам одиночные запросы доступны даже на «СТАРТ»: групповых
     там нет, а по отдельной площадке написать можно. Гостю — нельзя. */
  function canDirectRequest() {
    if (isGuest()) return { ok: false, reason: 'Отправка запросов доступна после регистрации' };
    return { ok: true };
  }
  function createDirectRequest(hallIds, opts) {
    opts = opts || {};
    if (requestFieldsError(opts)) return null;
    const halls = (hallIds || []).map(hallById).filter(Boolean);
    if (!halls.length) return null;
    if (!canDirectRequest().ok) return null;
    const venueIds = [...new Set(halls.map(h => h.venueId))];
    const first = venueById(venueIds[0]);
    const req = {
      id: newRequestId(), date: new Date().toLocaleDateString('ru'),
      title: opts.title || `Запрос: ${halls[0].name}, ${first ? first.name : ''}`.trim(),
      letter: opts.letter || '', dates: opts.dates || '', guests: opts.guests || '',
      params: filtersSummary(state.filters),
      hallIds: halls.map(h => h.id),
      objects: venueIds.map(venueId => ({ venueId, status: 'sent' })),
      direct: true,
    };
    state.requests.unshift(req); persist.requests();
    return req;
  }

  const requestById = (id) => state.requests.find(r => r.id === id) || null;

  /** Залы запроса — для окна «посмотреть запрос». */
  const requestHalls = (r) => (r.hallIds || []).map(hallById).filter(Boolean);
  /** Залы запроса, сгруппированные по объектам. */
  function requestByVenue(r) {
    const out = [];
    for (const o of r.objects) {
      const v = venueById(o.venueId); if (!v) continue;
      out.push({ venue: v, obj: o, halls: requestHalls(r).filter(h => h.venueId === o.venueId) });
    }
    return out;
  }

  /** Корректировка запроса. Отменённые объекты не воскрешаются. */
  function updateRequest(reqId, patch) {
    const r = requestById(reqId); if (!r) return false;
    if (('dates' in patch || 'guests' in patch) && requestFieldsError(Object.assign({ dates: r.dates, guests: r.guests }, patch))) return false;
    ['title', 'letter', 'dates', 'guests'].forEach(k => { if (k in patch) r[k] = patch[k]; });
    r.updatedAt = new Date().toLocaleDateString('ru');
    persist.requests();
    return true;
  }

  /** Повторный запрос по тем же объектам и залам — «оставить ещё один». */
  function repeatRequest(reqId, opts) {
    const src = requestById(reqId); if (!src) return null;
    opts = opts || {};
    if (requestFieldsError(opts)) return null;
    const live = src.objects.filter(o => o.status !== 'cancelled');
    if (!live.length) return null;
    const req = {
      id: newRequestId(), date: new Date().toLocaleDateString('ru'),
      title: opts.title || src.title, letter: opts.letter || src.letter,
      dates: opts.dates || '', guests: opts.guests || '',
      params: src.params || [], hallIds: (src.hallIds || []).slice(),
      objects: live.map(o => ({ venueId: o.venueId, status: 'sent' })),
      repeatOf: src.id,
    };
    state.requests.unshift(req); persist.requests();
    return req;
  }

  /** Можно ли нажать кнопку статуса. Отмена активна всегда, пока не отменено. */
  function canSetStatus(obj, next) {
    if (obj.status === 'cancelled' || obj.status === 'declined') return false;
    if (next === 'cancelled') return true;
    if (next === 'done') return obj.status === 'sent';
    if (next === 'reviewed') return obj.status === 'done';
    return false;
  }

  function setStatus(reqId, venueId, next, extra) {
    const r = requestById(reqId); if (!r) return false;
    const o = r.objects.find(x => x.venueId === +venueId); if (!o) return false;
    if (!canSetStatus(o, next)) return false;
    o.status = next;
    if (extra && extra.reason) o.reason = extra.reason;
    if (extra && extra.guests) o.guests = extra.guests;
    if (extra && extra.dates) o.dates = extra.dates;
    // объект мог отметить «состоялось» раньше пользователя: тогда вторая отметка — эта, и баллы разблокируются сейчас
    if (next === 'done' && o.venueDone) unlockPoints(eventPoints(o.guests || 100));
    if (next === 'reviewed') {
      addPoints(reviewPoints(), 'free');
      if (extra && extra.review) addReview(Object.assign({ target: 'venue', targetId: venueId, requestId: reqId, event: r.title }, extra.review));
    }
    persist.requests();
    return true;
  }

  /* — баллы — */

  const feeTier = (guests) => FEE_TIERS.find(t => guests >= t.min && guests <= t.max) || null;
  /** Сколько баллов начислится за мероприятие на текущем тарифе. */
  function eventPoints(guests) {
    const t = feeTier(guests); if (!t) return 0;
    return tariff().key === 'prem' ? (t.ptsPrem || 0) : (t.ptsBiz || 0);
  }
  /**
   * Что показать в истории запросов рядом с объектом.
   * @returns {{pts:number, state:'pending'|'waiting'|'done', label:string}|null}
   */
  function accrualFor(req, obj) {
    const guests = +(obj.guests || req.guests || 0);
    if (!guests) return null;
    const pts = eventPoints(guests);
    if (!pts) return null;
    if (obj.status === 'cancelled') return null;
    if (bothConfirmed(obj)) return { pts, state: 'done', label: 'начислено' };
    if (obj.status === 'done' || obj.status === 'reviewed')
      return { pts, state: 'waiting', label: 'ожидает подтверждения объекта' };
    return { pts, state: 'pending', label: 'будет начислено' };
  }

  const reviewPoints = () => tariff().key === 'prem' ? POINTS_REVIEW.prem : tariff().key === 'biz' ? POINTS_REVIEW.biz : 0;
  /* Только для внутренних расчётов. НЕ показывать пользователю: пересчёт
     баланса в рубли создаёт впечатление, что баллы можно вывести или
     обменять на деньги. Баллы тратятся исключительно внутри ресурса. */
  const pointsToRub = (p) => Math.round(p * POINT_RATE);

  /** bucket: 'free' — можно тратить, 'locked' — до поступления оплаты от объекта. */
  function addPoints(n, bucket) {
    if (!n) return;
    state.points[bucket === 'locked' ? 'locked' : 'free'] += n;
    persist.points();
  }
  function spendPoints(n) {
    if (state.points.free < n) return false;
    state.points.free -= n; persist.points(); return true;
  }
  /** Объект подтвердил оплату — переводим баллы из заблокированных в доступные. */
  function unlockPoints(n) {
    const amount = Math.min(n, state.points.locked);
    state.points.locked -= amount; state.points.free += amount; persist.points();
  }

  /* — поставщики — */

  function emptySupplierFilters() {
    const maxPrice = roundUp(Math.max(...SUPPLIERS.map(s => s.price)), 5000);
    const maxExp = Math.max(...SUPPLIERS.map(s => s.exp));
    const maxPpp = roundUp(Math.max(...SUPPLIERS.map(s => s.pricePerPerson || 0)), 500);
    return {
      city: '', travel: false,
      price: [0, maxPrice], units: new Set(), expMin: 0,
      video: false, reviews: false, loyalty: false,
      cats: new Set(),                 // ключи вида 'Артисты·Ведущий'
      // зависимые: кейтеринг, аренда оборудования, фото и видео
      ppp: [0, maxPpp], halal: false, kosher: false,
      delivery: false, installation: false, operator: false,
      hours: [0, 0], days: 0,
      _maxPrice: maxPrice, _maxExp: maxExp, _maxPpp: maxPpp,
    };
  }
  const supplierKey = (s) => s.parent + '·' + s.child;
  const isCatering = (s) => supplierKey(s) === 'Питание·Кейтеринг';
  const isEquipment = (s) => supplierKey(s) === 'Аренда·Оборудование';
  const isMedia = (s) => s.parent === 'Фото и видео';
  /** Есть ли у поставщика отзывы (R3-B, строка 106: отметка зависит от отзывов, а не от флага). */
  const supplierHasReviews = (s) => state.reviews.some(r => r.target === 'supplier' && r.targetId === s.id);

  /** excludeGroup='cats' — не учитывать дерево категорий (для фасетов по «ИЛИ»). */
  function filterSuppliers(F, excludeGroup) {
    const pppOn = F.ppp && (F.ppp[0] > 0 || F.ppp[1] < F._maxPpp);
    const [hFrom, hTo] = F.hours || [0, 0];
    return SUPPLIERS.filter(s => {
      /* Город: поставщик показывается, если он в этом городе, либо если
         отмечен «Выезд в другие города» и он выезжает.
         Без выбранного города галочка работает как самостоятельный фильтр. */
      if (F.city && F.city !== ALL_CITIES) {
        const here = s.city.toLowerCase().includes(F.city.toLowerCase());
        if (!here && !(F.travel && s.travel)) return false;
      } else if (F.travel && !s.travel) return false;
      if (s.price < F.price[0] || s.price > F.price[1]) return false;
      if (excludeGroup !== 'units' && F.units && F.units.size && !F.units.has(s.priceUnit)) return false;
      if (F.expMin && s.exp < F.expMin) return false;
      if (F.video && !s.video) return false;
      if (F.reviews && !supplierHasReviews(s)) return false;
      if (F.loyalty && !s.loyalty) return false;
      if (excludeGroup !== 'cats' && F.cats.size && !F.cats.has(supplierKey(s))) return false;
      // Зависимые фильтры действуют только на поставщиков своего пункта: остальные выбранные разделы не отсекаются.
      if (isCatering(s)) {
        if (pppOn && !(s.pricePerPerson >= F.ppp[0] && s.pricePerPerson <= F.ppp[1])) return false;
        if (F.halal && !s.halal) return false;
        if (F.kosher && !s.kosher) return false;
      }
      if (isEquipment(s)) {
        if (F.delivery && !s.delivery) return false;
        if (F.installation && !s.installation) return false;
        if (F.operator && !s.operator) return false;
      }
      if (isMedia(s)) {
        if (hFrom && !(s.minHours >= hFrom)) return false;
        if (hTo && !(s.minHours <= hTo)) return false;
        if (F.days && !(s.deliveryDays && s.deliveryDays <= F.days)) return false;
      }
      return true;
    });
  }
  /** kind: 'leaf' (подкатегория), 'parent' (раздел), 'flag' (video|reviews|loyalty|travel|halal…), 'unit' (единица цены). */
  function supplierFacet(F, kind, value) {
    if (kind === 'flag') return filterSuppliers(F, null).filter(s => value === 'reviews' ? supplierHasReviews(s) : s[value]).length;
    if (kind === 'unit') return filterSuppliers(F, 'units').filter(s => s.priceUnit === value).length;
    const base = filterSuppliers(F, 'cats');
    if (kind === 'parent') return base.filter(s => s.parent === value).length;
    return base.filter(s => supplierKey(s) === value).length;
  }
  /** Сбросить значения скрытых зависимых фильтров поставщиков (родитель снят). */
  function pruneSupplierFilters(F) {
    const E = emptySupplierFilters(), dropped = [];
    for (const d of SUPPLIER_FILTERS) {
      if (!d.control || !d.fkey || supplierFilterVisible(d, F)) continue;
      const k = d.fkey;
      if (JSON.stringify(F[k]) !== JSON.stringify(E[k])) { F[k] = E[k]; dropped.push(d.code); }
    }
    return dropped;
  }
  /** Применён ли хоть один фильтр поставщиков (R3-B, строка 97: «Сбросить всё» неактивна без фильтров). */
  function supplierFiltersActive(F) {
    return !!(F.city || F.travel || F.price[0] > 0 || F.price[1] < F._maxPrice || (F.units && F.units.size) || F.expMin
      || F.video || F.reviews || F.loyalty || F.cats.size || F.halal || F.kosher || F.delivery || F.installation || F.operator
      || (F.ppp && (F.ppp[0] > 0 || F.ppp[1] < F._maxPpp)) || (F.hours && (F.hours[0] || F.hours[1])) || F.days);
  }
  /* R3-B, строки 102 и 126: группового запроса поставщикам нет — запрос уходит из карточки поставщика. */
  function canGroupSupplierRequest_removed(supplierIds) {
    const cats = new Set(supplierIds.map(id => {
      const s = SUPPLIERS.find(x => x.id === +id); return s ? s.parent : null;
    }));
    if (cats.size > 1) return { ok: false, reason: 'Групповой запрос возможен только поставщикам одной категории' };
    return { ok: true };
  }

  /* — сохранение фильтров между страницами —
     Приложение многостраничное: уход на карточку объекта и возврат на подбор
     обнулял бы всю выборку. Set не переживает JSON, поэтому раскладываем в
     массивы и собираем обратно. */

  const SET_KEYS = ['cats', 'stars', 'feats', 'cuisine'];

  function packFilters(F) {
    const o = {};
    for (const k in F) {
      if (k.charAt(0) === '_') continue;
      o[k] = F[k] instanceof Set ? [...F[k]] : F[k];
    }
    return o;
  }
  function unpackFilters(raw) {
    const F = emptyFilters();
    if (!raw || typeof raw !== 'object') return F;
    for (const k in F) {
      if (!(k in raw)) continue;
      if (F[k] instanceof Set) F[k] = new Set(Array.isArray(raw[k]) ? raw[k] : []);
      else if (k === 'halls') F[k] = Array.isArray(raw[k])
        ? raw[k].filter(x => x && typeof x === 'object').map(x => ({ seating: String(x.seating || ''), min: +x.min || 0 }))
        : [];
      else if (Array.isArray(F[k]) && Array.isArray(raw[k]) && raw[k].length === 2) F[k] = raw[k].map(Number);
      else if (typeof F[k] === typeof raw[k]) F[k] = raw[k];
    }
    /* До R3 удобства лежали группами русских строк (food/opts/other/sport) — переводим в коды. */
    const dummy = {};
    ['food', 'opts', 'other', 'sport'].forEach(g => {
      if (Array.isArray(raw[g])) migrateFeatures(raw[g], dummy).forEach(c => F.feats.add(c));
    });
    if (dummy.parking && !F.parking) F.parking = dummy.parking;
    F.feats = new Set([...F.feats].filter(c => FEATURE_CODES.includes(c) || DERIVED_CHECKS.includes(c)));
    F.cats = new Set([...F.cats].map(c => CAT_RENAMES[c] || c).filter(c => VENUE_CATS.includes(c)));
    F.stars = new Set([...F.stars].map(Number).filter(n => STAR_OPTIONS.some(o => o.k === n)));
    F.cuisine = new Set([...F.cuisine].filter(c => CUISINE_OPTS.some(o => o.code === c)));
    // Ползунки, сохранённые со старым потолком (200 000 ₽), растягиваем до нового максимума.
    for (const k of ['priceDay', 'priceHour', 'confPkg']) {
      const mx = LIMITS[k];
      F[k] = [Math.max(0, Math.min(F[k][0] || 0, mx)), (!F[k][1] || F[k][1] >= mx || (k === 'priceDay' && F[k][1] === 200000)) ? mx : F[k][1]];
    }
    if (F.priceMode !== 'hour') F.priceMode = 'day';
    F.eventType = normEventType(F.eventType);
    return F;
  }
  const saveFilters = (F) => { state.filters = F; write(K.filters, packFilters(F)); };
  const loadFilters = () => state.filters;
  const resetFilters = () => { state.filters = emptyFilters(); write(K.filters, packFilters(state.filters)); return state.filters; };

  function packSupplierFilters(F) {
    const o = {}; for (const k in F) { if (k.charAt(0) === '_') continue; o[k] = F[k] instanceof Set ? [...F[k]] : F[k]; }
    return o;
  }
  function unpackSupplierFilters(raw) {
    const F = emptySupplierFilters();
    if (!raw || typeof raw !== 'object') return F;
    for (const k in F) {
      if (k.charAt(0) === '_' || !(k in raw)) continue;
      if (F[k] instanceof Set) F[k] = new Set(Array.isArray(raw[k]) ? raw[k] : []);
      else if (Array.isArray(F[k]) && Array.isArray(raw[k])) F[k] = raw[k];
      else if (typeof F[k] === typeof raw[k]) F[k] = raw[k];
    }
    // ключи дерева со старыми подписями → новые; несуществующие пункты отбрасываем
    F.cats = new Set([...F.cats].map(kk => kk.split('·').map(supRename).join('·'))
      .filter(kk => { const [p, c] = kk.split('·'); return (SUPPLIER_TREE[p] || []).includes(c); }));
    F.units = new Set([...F.units].filter(u => PRICE_UNITS.some(x => x.code === u && x.decision !== 'Удалить')));
    if (F.price[1] > F._maxPrice || !F.price[1]) F.price = [F.price[0], F._maxPrice];
    return F;
  }
  const saveSupplierFilters = (F) => { state.supplierFilters = F; write(K.sfilters, packSupplierFilters(F)); };
  const loadSupplierFilters = () => state.supplierFilters;
  const resetSupplierFilters = () => { state.supplierFilters = emptySupplierFilters(); write(K.sfilters, packSupplierFilters(state.supplierFilters)); return state.supplierFilters; };

  /**
   * Читаемая выписка параметров поиска — для шапки презентации и для
   * сопроводительного письма в групповом запросе.
   * @returns {string[]} например ['Москва', 'от 120 чел.', 'Деловое', 'Театр от 100']
   */
  function filtersSummary(F) {
    const out = [];
    const money = (n) => n.toLocaleString('ru');
    if (F.city && F.city !== ALL_CITIES) out.push(F.city);
    if (F.people || F.peopleTo) out.push(peopleLabel(F));
    const et = EVENT_TYPES.find(e => e.k === F.eventType) || (F.eventType === 'combined' ? EVENT_COMBINED : null);
    if (et) out.push(et.l);
    if (F.cats.size) out.push([...F.cats].join(', '));
    if (F.stars.size) out.push([...F.stars].sort().map(n => (STAR_OPTIONS.find(o => o.k === n) || { l: n + '★' }).l).join(', '));
    if (F.rooms) out.push('номеров от ' + F.rooms);
    if (F.twin) out.push('TWIN от ' + F.twin);
    if (F.sngl) out.push('SNGL от ' + F.sngl);
    (F.halls || []).forEach((r, i) => {
      if (!r.seating && !+r.min) return;
      const s = seatingByKey(r.seating);
      out.push(`зал ${i + 1}: ${s ? s.l : 'любая схема'}${+r.min ? ' от ' + r.min : ''}`);
    });
    if (F.hallArea) out.push('площадь зала от ' + F.hallArea + ' м²');
    if (F.dressing) out.push('гримёрок от ' + F.dressing);
    if (rangeOn(F, 'priceDay') && (F.priceMode || 'day') === 'day') out.push(`аренда ${money(F.priceDay[0])}–${money(F.priceDay[1])} ₽ / день`);
    if (rangeOn(F, 'priceHour') && F.priceMode === 'hour') out.push(`аренда ${money(F.priceHour[0])}–${money(F.priceHour[1])} ₽ / час`);
    if (rangeOn(F, 'confPkg')) out.push(`конференц-пакет ${money(F.confPkg[0])}–${money(F.confPkg[1])} ₽/чел.`);
    if (F.avgCheck) out.push('средний чек до ' + money(F.avgCheck) + ' ₽');
    if (F.cuisine && F.cuisine.size) out.push('кухня: ' + [...F.cuisine].map(c => (CUISINE_OPTS.find(o => o.code === c) || { l: c }).l.toLowerCase()).join(', '));
    if (F.wardrobe) out.push('гардероб от ' + F.wardrobe + ' мест');
    if (F.parking) out.push((PARKING_OPTS.find(o => o.code === F.parking) || {}).full || '');
    if (F.parkingSpaces) out.push('парковочных мест от ' + F.parkingSpaces);
    F.feats.forEach(c => out.push(featureLabel(c)));
    return out.filter(Boolean);
  }

  /* — карточки, которые заводит сам владелец —
     Объекты и услуги, созданные через визард, попадают сюда со статусом
     «на модерации» и в поисковую выдачу не идут: по документам карточку
     проверяют перед публикацией. */

  const MODERATION = { draft: 'черновик', review: 'на модерации', published: 'опубликован', rejected: 'отклонён' };

  /** Демо-объект кабинета площадки: Отель «Аврора» из каталога, опубликован. */
  function seedOwnVenue() {
    const v = VENUES[0];
    return {
      localId: 'v-seed-1', catalogId: v.id, name: v.name, cat: v.cat, stars: v.stars, city: v.city, addr: v.addr,
      coords: v.coords ? v.coords.lat + ', ' + v.coords.lng : '', rooms: Object.assign({}, v.rooms), eventTypes: v.eventTypes.slice(),
      features: v.features.slice(), cuisine: (v.cuisine || []).slice(), avgCheck: v.avgCheck || 0, wardrobe: v.wardrobe || 0,
      parking: v.parking || '', parkingSpaces: v.parkingSpaces || 0, confPackage: v.confPackage || 0, dressingRooms: v.dressingRooms || 0,
      menu: v.menu ? Object.assign({}, v.menu) : null, photos: ['aurora-facade.jpg', 'aurora-lobby.jpg', 'aurora-hall.jpg'], photoCount: 3,
      halls: v.halls.map(h => ({ name: h.name, type: h.type, floor: '', area: h.area, height: h.height, seats: Object.assign({}, h.seats),
        priceDay: h.priceDay, priceHour: h.priceHour, hourly: false, agree: !h.priceDay, plan: !!h.plan, planFiles: h.plan ? ['plan-' + h.id + '.pdf'] : [],
        photos: [], schemes: [] })),
      contacts: { person: 'Ирина Котова', phone: '+7 495 120-45-67', mail: 'sales@aurora-hotel.ru', inn: '7703123456', bank: 'р/с 40702810900000012345 в АО «Банк»' },
      contracts: ['Договор размещения', 'Договор бонусной программы'], desc: '',
      status: 'published', createdAt: '01.06.2026',
    };
  }
  function appealSeed() { return [
    { id: 'SR-260712-1048', date: '12.07.2026', role: 'user', kind: 'question', topic: 'Вопрос по работе платформы', text: 'Как перенести баллы на подписку?', status: 'done' },
    { id: 'SR-260801-2215', date: '01.08.2026', role: 'user', kind: 'dispute', topic: 'Спор по факту состоявшегося мероприятия', requestId: 'RQ-260612-0007', text: 'Объект не отметил мероприятие как состоявшееся.', status: 'work' },
    { id: 'SR-260905-3307', date: '05.09.2026', role: 'user', kind: 'tech', topic: 'Техническая проблема', text: 'Не скачивается презентация сравнения.', status: 'sent' },
    { id: 'SR-260722-1190', date: '22.07.2026', role: 'venue', kind: 'question', topic: 'Вопрос по работе платформы', text: 'Как добавить второй объект?', status: 'done' },
    { id: 'SR-260818-4402', date: '18.08.2026', role: 'venue', kind: 'dispute', topic: 'Спор по факту состоявшегося мероприятия', requestId: 'RQ-260714-0031', text: 'Пользователь не подтвердил мероприятие.', status: 'work' },
    { id: 'SR-260730-5120', date: '30.07.2026', role: 'supplier', kind: 'complaint', topic: 'Жалоба на объект или поставщика', text: 'Пользователь не отвечает на письма.', status: 'sent' },
    { id: 'SR-260910-6031', date: '10.09.2026', role: 'supplier', kind: 'question', topic: 'Вопрос по работе платформы', text: 'Как попасть в бонусную программу?', status: 'done' },
  ]; }
  const APPEAL_STATUS = { sent: 'Отправлено', work: 'В работе', done: 'Решено' };
  /** Новое обращение со support.html — появляется в кабинете своей роли (R3-B, строки 123–124). */
  function addAppeal(o) {
    const d = new Date(), p2 = (n) => String(n).padStart(2, '0');
    const a = Object.assign({
      id: 'SR-' + String(d.getFullYear()).slice(2) + p2(d.getMonth() + 1) + p2(d.getDate()) + '-' + String(1000 + (state.appeals.length * 37) % 9000),
      date: d.toLocaleDateString('ru'), status: 'sent',
    }, o);
    state.appeals.unshift(a); persist.appeals();
    return a;
  }
  const appealsFor = (role) => state.appeals.filter(a => (a.role || 'user') === role);

  /* Фото и файлы из визарда: в прототипе на сервер не уходят — храним только имена и количество. */
  const fileNames = (list) => (Array.isArray(list) ? list : []).map(x => typeof x === 'string' ? x : (x && x.name) || '').filter(Boolean);
  function venueFromWizard(d, base) {
    const twin = +d.twin || 0, sngl = +d.sngl || 0;
    return Object.assign(base || {}, {
      name: d.name || 'Без названия', cat: d.cat || '', city: d.city || '',
      addr: d.addr || '', coords: d.coords || '',
      rooms: { total: +d.roomsTotal || twin + sngl, twin, sngl },
      eventTypes: (d.events || []).slice(),
      features: migrateFeatures([].concat(d.feats || [], d.food || [], d.opts || [], d.other || [], d.sport || [])),
      cuisine: (d.cuisine || []).slice(), avgCheck: +d.avgCheck || 0, wardrobe: +d.wardrobe || 0,
      parking: d.parking || '', parkingSpaces: d.parking === 'private' ? (+d.parkingSpaces || 0) : 0,
      confPackage: +d.confPackage || 0, dressingRooms: +d.dressingRooms || 0,
      menu: d.menu ? { name: d.menu.name, url: d.menu.url && !String(d.menu.url).startsWith('blob:') ? d.menu.url : '' } : null,
      photos: fileNames(d.photos), photoCount: fileNames(d.photos).length,
      halls: (d.halls || []).map(hallFromWizard),
      contacts: { person: d.person || '', phone: d.phone || '', mail: d.mail || '', inn: d.inn || '', bank: d.bank || '' },
      contracts: d.contracts || [], desc: d.about || '',
    });
  }
  function hallFromWizard(h) {
    return {
      name: h.name || 'Без названия', type: h.type || '', floor: h.floor || '', area: +h.area || 0, height: +h.height || 0,
      seats: h.seats || {}, priceDay: +h.priceDay || 0, priceHour: +h.priceHour || 0, hourly: !!h.hourly && !(+h.priceHour > 0),
      agree: Array.isArray(h.agree) ? h.agree.length > 0 : !!h.agree,
      plan: fileNames(h.plan).length > 0 || (h.plan === true), planFiles: fileNames(h.planFiles || h.plan),
      photos: fileNames(h.photos), schemes: fileNames(h.schemes),
    };
  }
  /** «Добавить зал» у объекта кабинета — зал этого объекта, а не новый объект (R3-B, строка 109). */
  function addHallToMyVenue(i, h) {
    const v = state.myVenues[i]; if (!v) return null;
    const x = hallFromWizard(h);
    (v.halls = v.halls || []).push(x); v.updatedAt = new Date().toLocaleDateString('ru');
    persist.myVenues(); return x;
  }
  function addMyVenue(d) {
    const v = venueFromWizard(d, { localId: 'v' + Date.now(), status: 'review', createdAt: new Date().toLocaleDateString('ru') });
    state.myVenues.unshift(v); persist.myVenues();
    return v;
  }
  /** R3-B, строка 109: «Редактировать» обновляет этот же объект, а не создаёт новый. */
  function updateMyVenue(i, d) {
    const v = state.myVenues[i]; if (!v) return null;
    venueFromWizard(d, v); v.updatedAt = new Date().toLocaleDateString('ru');
    persist.myVenues(); return v;
  }
  /** Данные объекта кабинета → поля визарда (для «Редактировать»). */
  function venueToWizard(v) {
    return {
      name: v.name, cat: v.cat, stars: v.stars ? (STAR_OPTIONS.find(o => o.k === v.stars) || {}).l : '',
      events: (v.eventTypes || []).slice(), about: v.desc || '', city: v.city, addr: v.addr, coords: v.coords || '',
      roomsTotal: (v.rooms || {}).total || '', twin: (v.rooms || {}).twin || '', sngl: (v.rooms || {}).sngl || '',
      feats: (v.features || []).slice(), cuisine: (v.cuisine || []).slice(), avgCheck: v.avgCheck || '', wardrobe: v.wardrobe || '',
      parking: v.parking || '', parkingSpaces: v.parkingSpaces || '', confPackage: v.confPackage || '', dressingRooms: v.dressingRooms || '',
      menu: v.menu ? Object.assign({}, v.menu) : null, photos: (v.photos || []).map(name => ({ name })),
      halls: (v.halls || []).map(h => Object.assign({}, h, {
        agree: h.agree ? ['Стоимость по договорённости'] : [], plan: (h.planFiles || []).map(name => ({ name })), planFiles: undefined,
        photos: (h.photos || []).map(name => ({ name })), schemes: (h.schemes || []).map(name => ({ name })),
      })),
      person: (v.contacts || {}).person || '', phone: (v.contacts || {}).phone || '', mail: (v.contacts || {}).mail || '',
      inn: (v.contacts || {}).inn || '', bank: (v.contacts || {}).bank || '', contracts: (v.contracts || []).slice(),
    };
  }
  function addMyService(d) {
    const price = +d.price || 0;
    const s = {
      localId: 's' + Date.now(), name: d.name || 'Без названия',
      parent: d.parent || '', child: d.child || '', about: d.about || '',
      price, priceUnit: d.priceUnit || 'project', exp: +d.exp || 0,
      city: d.city || '', travel: Array.isArray(d.travel) ? d.travel.length > 0 : !!d.travel,
      loyalty: !!(d.loy || []).length,
      pricePerPerson: +d.pricePerPerson || 0, halal: !!d.halal, kosher: !!d.kosher,
      delivery: !!d.delivery, installation: !!d.installation, operator: !!d.operator,
      minHours: +d.minHours || 0, deliveryDays: +d.deliveryDays || 0,
      photos: fileNames(d.photos), video: fileNames(d.video).length > 0,
      pts: servicePoints(price), cost: serviceCost(price),
      status: 'review', createdAt: new Date().toLocaleDateString('ru'),
    };
    state.myServices.unshift(s); persist.myServices();
    return s;
  }
  const removeMyVenue = (i) => { state.myVenues.splice(i, 1); persist.myVenues(); };
  const removeMyService = (i) => { state.myServices.splice(i, 1); persist.myServices(); };

  /* — двустороннее подтверждение —
     Баллы разблокируются только когда обе стороны отметили, что мероприятие
     состоялось. До этого они висят со статусом «нельзя потратить», чтобы
     не возникало кассового разрыва. */

  const bothConfirmed = (o) => !!o.venueDone && (o.status === 'done' || o.status === 'reviewed');

  /** Отметка со стороны объекта. Вызывается из кабинета объекта. */
  function venueMarkDone(reqId, venueId, guests) {
    const r = requestById(reqId); if (!r) return false;
    const o = r.objects.find(x => x.venueId === +venueId); if (!o) return false;
    if (o.status === 'cancelled' || o.status === 'declined') return false;
    o.venueDone = true;
    if (guests) o.guests = guests;
    if (bothConfirmed(o)) unlockPoints(eventPoints(o.guests || 100));
    persist.requests();
    return true;
  }
  /** Объект отклоняет запрос: строка закрывается и уходит в архив. */
  function venueDecline(reqId, venueId, reason) {
    const r = requestById(reqId); if (!r) return false;
    const o = r.objects.find(x => x.venueId === +venueId); if (!o) return false;
    if (o.status !== 'sent' || o.venueDone) return false;
    o.status = 'declined';
    if (reason) o.reason = reason;
    persist.requests();
    return true;
  }

  /* — активные и архив (стр.25) —
     Строка запроса (объект группового запроса) уходит в архив той стороны,
     которая сама отметила «Мероприятие состоялось»: у пользователя — после его
     отметки (до подтверждения площадкой статус «Ждёт подтверждения площадки»,
     баллы начислятся после подтверждения), у площадки — после её отметки.
     Отклонение объектом и отмена пользователем закрывают строку у обеих сторон. */
  function isClosedRow(o, side) {
    if (o.status === 'cancelled' || o.status === 'declined') return true;
    return side === 'venue' ? !!o.venueDone : (o.status === 'done' || o.status === 'reviewed');
  }
  /** Отметка пользователя есть, площадка ещё не подтвердила. */
  const waitingVenue = (o) => (o.status === 'done' || o.status === 'reviewed') && !o.venueDone;
  /** Запрос, разложенный на активную и архивную части (по умолчанию — для пользователя). */
  const splitRequest = (r, side) => ({
    active: r.objects.filter(o => !isClosedRow(o, side)),
    archived: r.objects.filter(o => isClosedRow(o, side)),
  });
  const activeRequests = (side) => state.requests.filter(r => r.objects.some(o => !isClosedRow(o, side)));
  const archivedRequests = (side) => state.requests.filter(r => r.objects.some(o => isClosedRow(o, side)));

  /** Что объект должен ресурсу за это мероприятие. */
  function venueFee(o) {
    const t = feeTier(o.guests || 0);
    return t ? t.fee : null;
  }

  /* — отзывы —
     Пишутся только по фактически проведённому мероприятию: кнопка «Отзыв»
     в истории запросов открывается после статуса done. За отзыв начисляются
     баллы, поэтому связь с запросом обязательна — иначе баллы можно намолотить
     пустыми отзывами. */

  const reviewsFor = (target, id) => state.reviews.filter(r => r.target === target && r.targetId === +id);
  const reviewsLatest = (n) => state.reviews.slice().sort((a, b) => (b.id || 0) - (a.id || 0)).slice(0, n || 3);
  function reviewScore(target, id) {
    const list = reviewsFor(target, id);
    if (!list.length) return null;
    return +(list.reduce((a, r) => a + r.rating, 0) / list.length).toFixed(1);
  }
  function addReview(d) {
    const r = {
      id: Math.max(0, ...state.reviews.map(x => x.id)) + 1,
      target: d.target === 'supplier' ? 'supplier' : 'venue',
      targetId: +d.targetId,
      author: d.author || 'Пользователь', role: d.role || '',
      date: new Date().toLocaleDateString('ru'),
      rating: Math.min(5, Math.max(1, +d.rating || 5)),
      event: d.event || '', text: d.text || '',
      requestId: d.requestId || null,
    };
    state.reviews.unshift(r); persist.reviews();
    return r;
  }

  /* — витрина владельца —
     Объект или поставщик сам выставляет услуги в еБалльный магазин.
     Цена задаётся розничная; сколько списать с пользователя и сколько
     ресурс заплатит партнёру, считают servicePoints и serviceCost. */

  function addShopItem(d) {
    const retail = +d.retail || 0;
    const item = {
      localId: 'i' + Date.now(),
      owner: d.owner === 'supplier' ? 'supplier' : 'venue',
      ownerName: d.ownerName || '',
      title: d.title || 'Без названия',
      about: d.about || '',
      retail, pts: servicePoints(retail), cost: serviceCost(retail),
      limit: +d.limit || 0,          // сколько раз в месяц готовы принять, 0 = без лимита
      status: 'review', createdAt: new Date().toLocaleDateString('ru'),
    };
    state.shopItems.unshift(item); persist.shopItems();
    return item;
  }
  const removeShopItem = (i) => { state.shopItems.splice(i, 1); persist.shopItems(); };
  const myShopItems = (owner) => state.shopItems.filter(x => !owner || x.owner === owner);
  /** Витрина для пользователя: затравка плюс опубликованные позиции владельцев. */
  const shopCatalog = () => SHOP.concat(
    state.shopItems.filter(x => x.status === 'published')
      .map(x => ({ id: x.localId, title: x.title, provider: x.ownerName, rub: x.retail, pts: x.pts, cost: x.cost }))
  );

  /* — заказы за баллы —
     По документам: пользователь оставляет заявку, ресурс связывается
     с партнёром и возвращается с подтверждением. Баллы списываются
     сразу, чтобы их нельзя было потратить дважды; при отказе
     возвращаются. */

  const ORDER_FLOW = { new: 'новая заявка', confirmed: 'подтверждена партнёром',
    done: 'услуга оказана', rejected: 'отклонена, баллы возвращены' };

  /* — ПРЕМИУМ за баллы: оформляется сразу, без заявки —
     Баллы списываются, ПРЕМИУМ включается или продлевается на 6 месяцев
     от текущей даты окончания (если подписка ещё действует) или от сегодня. */
  const parseDmy = (s) => { const m = String(s || '').match(/(\d{2})\.(\d{2})\.(\d{4})/); return m ? new Date(+m[3], +m[2] - 1, +m[1]) : null; };
  const fmtDmy = (d) => [d.getDate(), d.getMonth() + 1].map(n => String(n).padStart(2, '0')).join('.') + '.' + d.getFullYear();
  const premiumItem = () => SHOP.find(x => x.premiumMonths);
  /** @returns {{ok:boolean, lack?:number, until?:string, extended?:boolean, order?:object}} */
  function buyPremiumForPoints(today) {
    const item = premiumItem();
    if (state.points.free < item.pts) return { ok: false, lack: item.pts - state.points.free };
    const now = today ? new Date(today) : new Date(); now.setHours(0, 0, 0, 0);
    const cur = parseDmy(state.premUntil);
    const extended = state.tariff === 'prem' && !!cur && cur > now;
    const from = extended ? cur : now;
    const until = new Date(from.getFullYear(), from.getMonth() + item.premiumMonths, from.getDate());
    state.points.free -= item.pts; persist.points();
    state.premUntil = fmtDmy(until); write(K.premUntil, state.premUntil);
    state.tariff = 'prem'; persist.tariff();
    const o = {
      id: 'BN-' + String(state.bonusOrders.length + 1).padStart(4, '0'),
      itemId: item.id, title: item.title, provider: item.provider, pts: item.pts, note: '',
      date: fmtDmy(now), status: 'done',
    };
    state.bonusOrders.unshift(o); persist.bonusOrders();
    return { ok: true, until: state.premUntil, extended, order: o };
  }

  function orderFromShop(item, note) {
    if (!item) return null;
    if (state.points.free < item.pts) return null;
    state.points.free -= item.pts; persist.points();
    const o = {
      id: 'BN-' + String(state.bonusOrders.length + 1).padStart(4, '0'),
      itemId: item.id, title: item.title, provider: item.provider,
      pts: item.pts, note: note || '',
      date: new Date().toLocaleDateString('ru'), status: 'new',
    };
    state.bonusOrders.unshift(o); persist.bonusOrders();
    return o;
  }
  const bonusOrdersFor = (providerName) => !providerName ? state.bonusOrders
    : state.bonusOrders.filter(o => o.provider === providerName);
  function setOrderStatus(id, status) {
    const o = state.bonusOrders.find(x => x.id === id); if (!o) return false;
    if (!ORDER_FLOW[status]) return false;
    if (status === 'rejected' && o.status !== 'rejected') { state.points.free += o.pts; persist.points(); }
    o.status = status; persist.bonusOrders();
    return true;
  }

  /* — запросы поставщикам —
     Запрос отправляется из карточки поставщика кнопкой «Отправить запрос».
     Без них у поставщика не считается конверсия. */

  function createSupplierRequest(supplierIds, opts) {
    opts = opts || {};
    const ids = (supplierIds || []).map(Number).filter(id => SUPPLIERS.some(s => s.id === id));
    if (!ids.length) return null;
    if (requestFieldsError(opts)) return null;
    const req = {
      id: 'SQ-' + String(state.supplierRequests.length + 1).padStart(4, '0'),
      date: new Date().toLocaleDateString('ru'),
      title: opts.title || 'Запрос поставщикам',
      letter: opts.letter || '', dates: opts.dates || '', guests: opts.guests || '',
      suppliers: ids.map(id => ({ supplierId: id, status: 'sent' })),
    };
    state.supplierRequests.unshift(req); persist.supplierRequests();
    return req;
  }

  /* — конверсия —
     Сколько из просмотров карточки превратилось в запросы. Это главная
     цифра для объекта: она показывает, окупается ли присутствие. */

  function venueStats(venueId) {
    const v = venueById(venueId); if (!v) return null;
    const id = +venueId;
    const withObj = (f) => state.requests.filter(r => r.objects.some(o => o.venueId === id && f(o)));
    const requests = withObj(() => true).length;
    const done = withObj(o => o.status === 'done' || o.status === 'reviewed').length;
    const orders = bonusOrdersFor(v.name).length;
    const views = v.stats ? v.stats.views : 0;
    return { views, requests, done, orders,
      conversion: views ? +(requests / views * 100).toFixed(1) : 0,
      toEvent: requests ? +(done / requests * 100).toFixed(1) : 0 };
  }
  function supplierStats(supplierId) {
    const s = SUPPLIERS.find(x => x.id === +supplierId); if (!s) return null;
    const requests = state.supplierRequests
      .filter(r => r.suppliers.some(x => x.supplierId === +supplierId)).length;
    const orders = bonusOrdersFor(s.name).length;
    const views = s.stats ? s.stats.views : 0;
    return { views, requests, orders,
      conversion: views ? +((requests + orders) / views * 100).toFixed(1) : 0 };
  }

  /* — оплата по счёту для юрлиц (R2 стр.15) —
     Настоящего выставления счетов нет: счёт хранится в localStorage со статусом
     «ожидает оплаты», тариф включается, когда счёт отмечен оплаченным
     (в демо — кнопка «Счёт оплачен» в сервисной панели). */
  const BILL_PERIODS = {
    month: { months: 1,  l: 'месяц',     total: t => t.price },
    half:  { months: 6,  l: '6 месяцев', total: t => t.priceHalf },
    year:  { months: 12, l: 'год',       total: t => t.priceYear },
  };
  /** ИНН: 10 цифр (организация) или 12 (ИП) с контрольными цифрами. */
  function innValid(inn) {
    const s = String(inn || '').replace(/\s+/g, '');
    if (!/^(\d{10}|\d{12})$/.test(s)) return false;
    const d = s.split('').map(Number);
    const ctl = (w) => w.reduce((a, k, i) => a + k * d[i], 0) % 11 % 10;
    if (s.length === 10) return ctl([2, 4, 10, 3, 5, 9, 4, 6, 8]) === d[9];
    return ctl([7, 2, 4, 10, 3, 5, 9, 4, 6, 8]) === d[10] && ctl([3, 7, 2, 4, 10, 3, 5, 9, 4, 6, 8]) === d[11];
  }
  /** Ошибки реквизитов счёта: [{ field, text }], пусто — всё заполнено верно. */
  function invoiceErrors(f) {
    f = f || {};
    const inn = String(f.inn || '').replace(/\s+/g, '');
    const kpp = String(f.kpp || '').replace(/\s+/g, '');
    const out = [];
    if (!String(f.org || '').trim()) out.push({ field: 'org', text: 'Укажите название организации' });
    if (!/^(\d{10}|\d{12})$/.test(inn)) out.push({ field: 'inn', text: 'ИНН — 10 цифр у организации или 12 у ИП' });
    else if (!innValid(inn)) out.push({ field: 'inn', text: 'Проверьте ИНН: контрольная цифра не совпадает' });
    if (kpp && !/^\d{9}$/.test(kpp)) out.push({ field: 'kpp', text: 'КПП — 9 цифр' });
    if (!String(f.addr || '').trim()) out.push({ field: 'addr', text: 'Укажите юридический адрес' });
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(f.email || '').trim())) out.push({ field: 'email', text: 'Укажите e-mail, на который отправить счёт' });
    return out;
  }
  /** Выставить счёт: тариф не меняется, пока счёт не оплачен. */
  function createInvoice(o) {
    o = o || {};
    const t = TARIFFS[o.plan], per = BILL_PERIODS[o.period];
    if (!t || !t.price || !per || invoiceErrors(o).length) return null;
    const inv = {
      no: String(1041 + state.invoices.length), date: fmtDmy(new Date()),
      plan: o.plan, period: o.period, sum: per.total(t),
      org: String(o.org).trim(), inn: String(o.inn).replace(/\s+/g, ''), kpp: String(o.kpp || '').replace(/\s+/g, ''),
      addr: String(o.addr).trim(), email: String(o.email).trim(), status: 'pending',
    };
    state.invoices.unshift(inv); persist.invoices();
    return inv;
  }
  const invoices = () => state.invoices.slice();
  const pendingInvoices = () => state.invoices.filter(i => i.status === 'pending');
  /** Отметить счёт оплаченным (по номеру, иначе последний неоплаченный) и включить тариф. */
  function payInvoice(no) {
    const inv = no ? state.invoices.find(i => i.no === String(no) && i.status === 'pending') : pendingInvoices()[0];
    if (!inv) return null;
    inv.status = 'paid'; inv.paidAt = fmtDmy(new Date()); persist.invoices();
    setTariff(inv.plan);
    return inv;
  }

  /* ─────────── 10. ЭКСПОРТ ─────────── */

  window.ML = {
    CITIES, VENUE_CATS, EVENT_TYPES, normEventType, STARRED_CATS, STAR_OPTIONS, starKey, sortHallsByPrice, peopleLabel, capacityMax, SEATING, HALL_TYPES, SUPPLIER_TREE,
    ALL_CITIES, EVENT_COMBINED, VENUE_CAT_OPTS, CUISINE_OPTS, PARKING_OPTS, VENUE_FILTER_GROUPS, VENUE_FILTERS, venueFilter, venueFilterVisible,
    FEATURE_CODES, DERIVED_CHECKS, featureLabel, venueHas, migrateFeatures, pruneFilters, filtersActive, LIMITS, MENU_SAMPLE, CITY_MAP,
    SUPPLIER_SECTIONS, SUPPLIER_FILTER_GROUPS, SUPPLIER_FILTERS, supplierFilterVisible, PARTNER_ONLY, PRICE_UNITS, priceUnitLabel, supRename,
    pruneSupplierFilters, supplierFiltersActive, supplierHasReviews,
    TARIFFS, plans, isGuest, canUseFilter, FEE_TIERS, POINT_RATE, POINTS_HELLO, POINTS_REVIEW, CANCEL_REASONS, REQUEST_FLOW,
    LOYALTY_DISCOUNT, servicePoints, serviceCost,
    VENUES, SUPPLIERS, SHOP,
    state, persist,
    tariff, setTariff,
    BILL_PERIODS, innValid, invoiceErrors, createInvoice, invoices, pendingInvoices, payInvoice,
    venueById, allHalls, hallById, hallVenue,
    hallCapacity, venueCapacity, venueMinPrice, venueRooms, seatingByKey, hallsSatisfy,
    emptyFilters, filterVenues, facetCount,
    saveFilters, loadFilters, resetFilters, filtersSummary,
    saveSupplierFilters, loadSupplierFilters, resetSupplierFilters,
    emptySupplierFilters, filterSuppliers, supplierFacet, supplierKey,
    inCompare, toggleCompare, clearCompare, compareHalls, reloadState, buyPremiumForPoints, premiumItem, compareVenueCount: () => compareVenueIds().size,
    isFav, toggleFav,
    addToBlacklist, removeFromBlacklist,
    canGroupRequest, createRequest, canDirectRequest, createDirectRequest, requestById, requestHalls, requestByVenue,
    updateRequest, repeatRequest, canSetStatus, setStatus,
    feeTier, eventPoints, accrualFor, reviewPoints, pointsToRub, addPoints, spendPoints, unlockPoints,
    MODERATION, STARRED_CATS, addMyVenue, updateMyVenue, venueToWizard, addHallToMyVenue, addMyService,
    APPEAL_STATUS, addAppeal, appealsFor, removeMyVenue, removeMyService,
    addShopItem, removeShopItem, myShopItems, shopCatalog,
    ORDER_FLOW, orderFromShop, bonusOrdersFor, setOrderStatus,
    createSupplierRequest, venueStats, supplierStats,
    addReview, reviewsFor, reviewsLatest, reviewScore,
    bothConfirmed, venueMarkDone, venueFee, venueDecline, isClosedRow, waitingVenue, splitRequest, activeRequests, archivedRequests, requestFieldsError,
    photoUrl: (n) => `../assets/photos/v${((n - 1) % 16) + 1}.jpg`,
    money: (n) => n > 0 ? n.toLocaleString('ru') + ' ₽' : 'по договорённости',
    plural: (n, f) => { const a = n % 10, b = n % 100; return b >= 11 && b <= 14 ? f[2] : a === 1 ? f[0] : a >= 2 && a <= 4 ? f[1] : f[2]; },
  };

})();

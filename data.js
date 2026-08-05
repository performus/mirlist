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

  /* ─────────── 1. СПРАВОЧНИКИ ─────────── */

  const CITIES = ['Москва', 'Санкт-Петербург', 'Сочи', 'Казань', 'Нижний Новгород', 'Самара', 'Подмосковье'];

  const VENUE_CATS = ['Отель 3*', 'Отель 4*', 'Отель 5*', 'Бутик-отель', 'Конференц-площадка',
    'Лофт', 'Конгрессно-выставочная', 'Ресторан', 'Уличная площадка', 'Клуб', 'Корабль', 'Глэмпинг'];

  const EVENT_TYPES = [
    { k: 'business', l: 'Деловое' },
    { k: 'banquet', l: 'Банкет / фуршет' },
    { k: 'wedding', l: 'Свадьба' },
    { k: 'team', l: 'Тимбилдинг' },
  ];

  // Ключи совпадают с полем formats из старого compare.html — плюс U-shape.
  const SEATING = [
    { k: 'theatre', l: 'Театр' },
    { k: 'class', l: 'Класс' },
    { k: 'ushape', l: 'U-shape' },
    { k: 'banquet', l: 'Банкет' },
    { k: 'reception', l: 'Фуршет' },
    { k: 'cabaret', l: 'Кабаре' },
    { k: 'board', l: 'Переговоры' },
  ];

  const HALL_TYPES = ['Конференц-зал', 'Банкетный зал', 'Трансформер', 'Ресторанный зал', 'Переговорная', 'Открытая площадка'];

  // Группы удобств. Строки — они же подписи в фильтрах, отдельного словаря не нужно.
  const FEATURES = {
    food: ['Свой ресторан / кейтеринг', 'Можно привезти алкоголь', 'Возможен свой кейтеринг',
      'Место для велкома', 'Дегустация меню', 'Сертификат халяль'],
    opts: ['Звуковое оборудование', 'Световое оборудование', 'Экран', 'Стационарная сцена', 'Wi-Fi',
      'Гримёрки', 'Силовое подключение', 'Грузовой лифт', 'Возможность подвеса', 'Завоз оборудования',
      'Своя мебель', 'Без колонн', 'Свой декор', 'Затемнение', 'Наличие окон'],
    other: ['Своя парковка', 'Кондиционер', 'Гардероб', 'Раздельный туалет М/Ж', 'Отдельный вход',
      'Кальян', 'Фейерверки', 'Музыка после «часа тишины»', 'ЧОП', 'У водоёма / пляж', 'Молельная комната'],
    sport: ['Футбольное поле', 'Волейбольная площадка', 'Теннисный корт', 'Настольный теннис',
      'Бассейн', 'Прокат инвентаря', 'Медперсонал'],
  };
  const FEATURE_GROUPS = [
    { k: 'food', l: 'Питание' },
    { k: 'opts', l: 'Возможности для мероприятий' },
    { k: 'other', l: 'Прочее' },
    { k: 'sport', l: 'Спортивные объекты', onlyEvent: 'team' },
  ];

  const SUPPLIER_TREE = {
    'Артисты': ['Ведущий', 'Диджей', 'Аниматор', 'Кавер-группа', 'Шоу-программа', 'Звёзды',
      'Цирковые артисты', 'Иллюзионисты', 'Актёры театра и кино', 'Музыкант', 'Художник'],
    'Аренда': ['Животные', 'Мебель', 'Шатёр', 'Костюмы', 'Оборудование'],
    'Питание': ['Кейтеринг', 'Бары'],
    'Фото / видео': ['Фотограф', 'Оператор', 'Онлайн-трансляция'],
    'Персонал': ['Режиссёр мероприятия', 'Продюсер', 'Хостес', 'Хелпер', 'Гид', 'Переводчик',
      'Технический директор', 'Стилист-визажист', 'Клининг', 'Модератор', 'ЧОП', 'Официант', 'Сценарист', 'Модель'],
    'Транспорт': ['Автобусы', 'Водитель с авто'],
    'Прочее': ['Мастер-класс', 'Застройщики', 'Типография', 'Сувенирная продукция', 'Оформители',
      'Кальяны', 'Экскурсии', 'Авиа и ЖД', 'DMC', 'Production', 'Тимбилдинг'],
  };

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
      filters: ['cats', 'city', 'people'],
    },
    start: {
      key: 'start', name: 'СТАРТ', plan: true, blur: false,
      price: 0, priceHalf: 0, priceYear: 0,
      compare: 2, presentation: false, groupRequest: 0,
      fullInfo: false, blacklist: false, bonusRate: 0,
      filters: ['cats', 'city', 'people'],           // остальные заблокированы
    },
    biz: {
      key: 'biz', name: 'БИЗНЕС', plan: true, blur: false,
      price: 890, priceHalf: 4000, priceYear: 6400,
      compare: 6, presentation: 'ads', groupRequest: 3,
      fullInfo: true, blacklist: false, bonusRate: 1,
      filters: 'all-except-seating-twin',
    },
    prem: {
      key: 'prem', name: 'ПРЕМИУМ', plan: true, blur: false,
      price: 1950, priceHalf: 8750, priceYear: 14000,
      compare: 15, presentation: 'clean', groupRequest: Infinity,
      fullInfo: true, blacklist: true, bonusRate: 1.5,
      filters: 'all',
    },
  };
  /** Только покупаемые тарифы — для pricing.html и checkout.html. */
  const plans = () => Object.values(TARIFFS).filter(t => t.plan);
  const isGuest = () => state.tariff === 'guest';

  // Вознаграждение объекта и начисление баллов по количеству участников.
  const FEE_TIERS = [
    { min: 1, max: 100, label: '1–100 чел.', fee: 6000, ptsBiz: 500, ptsPrem: 750 },
    { min: 101, max: 300, label: '101–300 чел.', fee: 21000, ptsBiz: 1500, ptsPrem: 2250 },
    { min: 301, max: 500, label: '301–500 чел.', fee: 45000, ptsBiz: 3000, ptsPrem: 4500 },
    { min: 501, max: Infinity, label: '501+ чел.', fee: null, ptsBiz: null, ptsPrem: null },
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
    sent: { label: 'Запрос отправлен', next: 'confirmed' },
    confirmed: { label: 'Мероприятие подтверждено', next: 'done' },
    done: { label: 'Мероприятие состоялось', next: 'reviewed' },
    reviewed: { label: 'Отзыв оставлен', next: null },
    cancelled: { label: 'Отменён', next: null, dead: true },
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
    stars: /Отель (\d)\*/.test(cat) ? +RegExp.$1 : 0,
    coords: null, rating: 4.5, reviews: 40,
    rooms: { twin: 0, sngl: 0 },
    eventTypes: ['business', 'banquet'],
    features: [], halls: [], photo: 1, px: 50, py: 50, loyaltyContract: false,
  }, o);

  const H = (id, venueId, name, type, area, height, seats, priceDay, priceHour, plan, photo) =>
    ({ id, venueId, name, type, area, height, seats, priceDay, priceHour, plan: !!plan, photo: photo || 1 });

  const VENUES = [
    V(1, 'Отель «Аврора»', 'Отель 4*', 'Москва', 'Пресненская наб., 12', {
      coords: { lat: 55.7492, lng: 37.5390 }, rating: 4.9, reviews: 127, photo: 1, px: 52, py: 38,
      rooms: { twin: 60, sngl: 24 }, loyaltyContract: true,
      eventTypes: ['business', 'banquet', 'wedding'],
      features: ['Свой ресторан / кейтеринг', 'Место для велкома', 'Дегустация меню', 'Wi-Fi',
        'Звуковое оборудование', 'Световое оборудование', 'Экран', 'Гримёрки', 'Без колонн',
        'Затемнение', 'Наличие окон', 'Своя парковка', 'Кондиционер', 'Гардероб', 'ЧОП'],
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
      eventTypes: ['banquet', 'team', 'wedding'],
      features: ['Возможен свой кейтеринг', 'Можно привезти алкоголь', 'Место для велкома', 'Wi-Fi',
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
        'Без колонн', 'Своя парковка', 'Кондиционер', 'Гардероб', 'ЧОП', 'Раздельный туалет М/Ж'],
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
    V(4, 'Отель «Флагман»', 'Отель 5*', 'Санкт-Петербург', 'Адмиралтейская наб., 4', {
      coords: { lat: 59.9364, lng: 30.3061 }, rating: 4.9, reviews: 203, photo: 4, px: 30, py: 20,
      rooms: { twin: 120, sngl: 55 }, loyaltyContract: true,
      eventTypes: ['business', 'banquet', 'wedding'],
      features: ['Свой ресторан / кейтеринг', 'Дегустация меню', 'Место для велкома', 'Сертификат халяль',
        'Wi-Fi', 'Звуковое оборудование', 'Световое оборудование', 'Экран', 'Гримёрки', 'Без колонн',
        'Наличие окон', 'Своя парковка', 'Кондиционер', 'Гардероб', 'ЧОП', 'У водоёма / пляж', 'Молельная комната'],
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
      features: ['Свой ресторан / кейтеринг', 'Дегустация меню', 'Место для велкома', 'Можно привезти алкоголь',
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
      features: ['Возможен свой кейтеринг', 'Можно привезти алкоголь', 'Wi-Fi', 'Звуковое оборудование',
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
      features: ['Возможен свой кейтеринг', 'Можно привезти алкоголь', 'Место для велкома', 'Дегустация меню',
        'Своя парковка', 'Отдельный вход', 'Фейерверки', 'У водоёма / пляж', 'Свой декор',
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
      features: ['Свой ресторан / кейтеринг', 'Можно привезти алкоголь', 'Wi-Fi', 'Звуковое оборудование',
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
      features: ['Свой ресторан / кейтеринг', 'Место для велкома', 'Wi-Fi', 'Экран',
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
      features: ['Возможен свой кейтеринг', 'Можно привезти алкоголь', 'Своя парковка', 'Отдельный вход',
        'У водоёма / пляж', 'Фейерверки', 'Свой декор', 'Волейбольная площадка', 'Настольный теннис',
        'Прокат инвентаря', 'Медперсонал', 'Футбольное поле'],
      halls: [
        H(1001, 10, 'Купольный шатёр', 'Открытая площадка', 260, 0,
          { banquet: 100, reception: 180, theatre: 140 }, 55000, 0, false, 10),
        H(1002, 10, 'Костровая площадка', 'Открытая площадка', 300, 0,
          { reception: 150 }, 0, 0, false, 16),
      ],
    }),
    V(11, 'Конференц-центр «Высота»', 'Конференц-площадка', 'Москва', 'Павелецкая пл., 2', {
      coords: { lat: 55.7297, lng: 37.6392 }, rating: 4.7, reviews: 88, photo: 11, px: 54, py: 44,
      eventTypes: ['business'],
      features: ['Свой ресторан / кейтеринг', 'Wi-Fi', 'Звуковое оборудование', 'Световое оборудование',
        'Экран', 'Силовое подключение', 'Грузовой лифт', 'Без колонн', 'Затемнение', 'Кондиционер',
        'Гардероб', 'Раздельный туалет М/Ж', 'Своя парковка'],
      halls: [
        H(1101, 11, 'Амфитеатр', 'Конференц-зал', 240, 5.0,
          { theatre: 180, class: 90, ushape: 40 }, 52000, 9000, true, 11),
        H(1102, 11, 'Зал «Высота-2»', 'Конференц-зал', 110, 3.6,
          { theatre: 70, class: 40, ushape: 26, board: 22 }, 24000, 4500, true, 1),
        H(1103, 11, 'Фойе', 'Открытая площадка', 180, 4.0,
          { reception: 150 }, 0, 3000, false, 2),
      ],
    }),
    V(12, 'Отель «Лагуна»', 'Отель 3*', 'Сочи', 'ул. Приморская, 9', {
      coords: { lat: 43.5800, lng: 39.7200 }, rating: 4.2, reviews: 55, photo: 12, px: 36, py: 86,
      rooms: { twin: 40, sngl: 18 },
      eventTypes: ['business', 'banquet', 'team'],
      features: ['Свой ресторан / кейтеринг', 'Место для велкома', 'Wi-Fi', 'Экран', 'Кондиционер',
        'Своя парковка', 'У водоёма / пляж', 'Бассейн', 'Прокат инвентаря', 'Настольный теннис'],
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
      features: ['Возможен свой кейтеринг', 'Можно привезти алкоголь', 'Wi-Fi', 'Звуковое оборудование',
        'Световое оборудование', 'Экран', 'Возможность подвеса', 'Завоз оборудования', 'Своя мебель',
        'Свой декор', 'Затемнение', 'Отдельный вход', 'Гардероб'],
      halls: [
        H(1301, 13, 'Цех белого', 'Трансформер', 390, 6.5,
          { theatre: 220, reception: 300, banquet: 140, class: 120 }, 70000, 0, true, 13),
        H(1302, 13, 'Галерея', 'Открытая площадка', 210, 5.0,
          { reception: 160 }, 42000, 0, false, 4),
      ],
    }),
    V(14, 'Отель «Панорама»', 'Отель 4*', 'Казань', 'ул. Баумана, 44', {
      coords: { lat: 55.7900, lng: 49.1200 }, rating: 4.6, reviews: 82, photo: 14, px: 28, py: 56,
      rooms: { twin: 55, sngl: 22 }, loyaltyContract: true,
      eventTypes: ['business', 'banquet', 'wedding'],
      features: ['Свой ресторан / кейтеринг', 'Дегустация меню', 'Сертификат халяль', 'Место для велкома',
        'Wi-Fi', 'Звуковое оборудование', 'Экран', 'Без колонн', 'Наличие окон', 'Кондиционер',
        'Гардероб', 'Своя парковка', 'Молельная комната', 'Раздельный туалет М/Ж'],
      halls: [
        H(1401, 14, 'Большой зал', 'Конференц-зал', 420, 5.2,
          { theatre: 280, class: 150, ushape: 60, banquet: 200, reception: 320 }, 58000, 10000, true, 14),
        H(1402, 14, 'Зал «Казан»', 'Банкетный зал', 190, 4.0,
          { banquet: 80, reception: 120, cabaret: 60 }, 32000, 0, false, 15),
        H(1403, 14, 'Переговорная', 'Переговорная', 40, 3.0,
          { board: 16, ushape: 14 }, 9000, 1800, false, 16),
      ],
    }),
  ];

  /* ─────────── 4. ПОСТАВЩИКИ ─────────── */

  const SUPPLIERS = [
    { id: 1, parent: 'Артисты', child: 'Ведущий', name: 'Ведущий Артём Соколов', city: 'Москва', price: 45000, exp: 12, video: true, reviews: true, loyalty: true, photo: 1 },
    { id: 2, parent: 'Артисты', child: 'Диджей', name: 'DJ Kuznetsov', city: 'Москва', price: 30000, exp: 8, video: true, reviews: true, loyalty: true, photo: 2 },
    { id: 3, parent: 'Артисты', child: 'Кавер-группа', name: 'Кавер-группа «Апрель»', city: 'Санкт-Петербург', price: 90000, exp: 6, video: true, reviews: true, loyalty: false, photo: 3 },
    { id: 4, parent: 'Артисты', child: 'Шоу-программа', name: 'Шоу-балет «Ритм»', city: 'Москва', price: 70000, exp: 10, video: true, reviews: false, loyalty: false, photo: 4 },
    { id: 5, parent: 'Артисты', child: 'Аниматор', name: 'Студия «Праздник+»', city: 'Казань', price: 15000, exp: 5, video: false, reviews: true, loyalty: true, photo: 5 },
    { id: 6, parent: 'Питание', child: 'Кейтеринг', name: 'Кейтеринг «Формат»', city: 'Москва', price: 2500, exp: 14, video: false, reviews: true, loyalty: true, photo: 6 },
    { id: 7, parent: 'Питание', child: 'Бары', name: 'Мобильный бар «Шейкер»', city: 'Москва', price: 40000, exp: 7, video: true, reviews: true, loyalty: true, photo: 7 },
    { id: 8, parent: 'Фото / видео', child: 'Фотограф', name: 'Фотограф Мария Лебедева', city: 'Москва', price: 35000, exp: 9, video: false, reviews: true, loyalty: true, photo: 8 },
    { id: 9, parent: 'Фото / видео', child: 'Оператор', name: 'Видеопродакшн Kadr', city: 'Санкт-Петербург', price: 60000, exp: 11, video: true, reviews: true, loyalty: false, photo: 9 },
    { id: 10, parent: 'Фото / видео', child: 'Онлайн-трансляция', name: 'StreamLab', city: 'Москва', price: 120000, exp: 6, video: true, reviews: false, loyalty: false, photo: 10 },
    { id: 11, parent: 'Аренда', child: 'Мебель', name: 'Прокат мебели «Лофт-декор»', city: 'Москва', price: 25000, exp: 8, video: false, reviews: true, loyalty: true, photo: 11 },
    { id: 12, parent: 'Аренда', child: 'Шатёр', name: 'Шатры «Тент-Про»', city: 'Подмосковье', price: 150000, exp: 13, video: false, reviews: true, loyalty: false, photo: 12 },
    { id: 13, parent: 'Аренда', child: 'Оборудование', name: 'Техпрокат «Сцена»', city: 'Москва', price: 80000, exp: 15, video: true, reviews: true, loyalty: true, photo: 13 },
    { id: 14, parent: 'Персонал', child: 'Хостес', name: 'Агентство «Хостес-Сервис»', city: 'Москва', price: 5000, exp: 9, video: false, reviews: true, loyalty: false, photo: 14 },
    { id: 15, parent: 'Персонал', child: 'Технический директор', name: 'Техдиректор Павел Гринёв', city: 'Москва', price: 50000, exp: 16, video: false, reviews: true, loyalty: false, photo: 15 },
    { id: 16, parent: 'Персонал', child: 'Переводчик', name: 'Бюро «Синхрон»', city: 'Санкт-Петербург', price: 45000, exp: 12, video: false, reviews: true, loyalty: true, photo: 16 },
    { id: 17, parent: 'Транспорт', child: 'Автобусы', name: 'Трансфер «БасЛайн»', city: 'Москва', price: 18000, exp: 10, video: false, reviews: true, loyalty: false, photo: 1 },
    { id: 18, parent: 'Прочее', child: 'Тимбилдинг', name: 'Организация тимбилдинга TeamUp', city: 'Москва', price: 95000, exp: 11, video: true, reviews: true, loyalty: true, photo: 2 },
  ];

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
    { id: 6, title: 'Подписка ПРЕМИУМ на 6 месяцев', provider: 'МАЙСЛИСТ', rub: 8750, own: true },
  ].map(s => Object.assign(s, {
    pts: servicePoints(s.rub),
    cost: s.own ? s.rub : serviceCost(s.rub),
  }));

  /* Затравка отзывов. Объявлена до состояния — оно её читает. */
  const REVIEW_SEED = [
    { id: 1, target: 'venue', targetId: 1, author: 'Мария И.', role: 'Event-агентство «Формат»', date: '18.07.2026', rating: 5, event: 'Конференция на 120 человек', text: 'Площадку отдали за час до заезда, техника отработала без замечаний. Единственное — парковка тесная, автобус пришлось ставить на улице.' },
    { id: 2, target: 'venue', targetId: 2, author: 'Дмитрий К.', role: 'Прямой клиент', date: '02.07.2026', rating: 4, event: 'Презентация продукта', text: 'Затемнение реальное, свой свет не понадобился. Загрузка оборудования только через основной вход — закладывайте лишний час на монтаж.' },
    { id: 3, target: 'venue', targetId: 4, author: 'Анна С.', role: 'DMC', date: '26.06.2026', rating: 5, event: 'Гала-ужин, 280 гостей', text: 'Отработали ровно, меню согласовали с третьего захода без нервов. Монтаж просят согласовывать за трое суток — это правда, не формальность.' },
    { id: 4, target: 'venue', targetId: 7, author: 'Игорь В.', role: 'Фриланс-организатор', date: '14.06.2026', rating: 4, event: 'Выездной тимбилдинг', text: 'Территория отличная, активности свои есть. Связь на поляне ловит плохо — рации берите с собой.' },
    { id: 5, target: 'supplier', targetId: 8, author: 'Мария И.', role: 'Event-агентство «Формат»', date: '10.07.2026', rating: 5, event: 'Корпоратив, 200 гостей', text: 'Материал прислали на третий день, отбор нормальный. Работали спокойно, в кадр не лезли.' },
    { id: 6, target: 'supplier', targetId: 6, author: 'Ольга П.', role: 'Прямой клиент', date: '28.06.2026', rating: 4, event: 'Кофе-брейки на трёхдневном форуме', text: 'По вкусу вопросов нет. Смену подач держат по таймингу, но на третий день ассортимент повторился.' },
  ];

  /* ─────────── 8. СОСТОЯНИЕ ПОЛЬЗОВАТЕЛЯ ─────────── */
  /* Ключи localStorage. mh_compare теперь хранит ID ЗАЛОВ, а не объектов —
     это ломающее изменение относительно старого mh_compare, поэтому ключ новый. */

  const K = {
    tariff: 'ml_tariff', compare: 'ml_compare_halls', favs: 'ml_favs_halls',
    black: 'ml_blacklist', points: 'ml_points', requests: 'ml_requests',
    myVenues: 'ml_my_venues', myServices: 'ml_my_services', reviews: 'ml_reviews',
    filters: 'ml_filters', sfilters: 'ml_supplier_filters',
  };
  const read = (k, d) => { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch (e) { return d; } };
  const write = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { } };

  const state = {
    tariff: read(K.tariff, 'guest'),   // первый заход — незарегистрированный посетитель
    filters: unpackFilters(read(K.filters, null)),
    myVenues: read(K.myVenues, []),
    reviews: read(K.reviews, REVIEW_SEED),
    myServices: read(K.myServices, []),
    supplierFilters: unpackSupplierFilters(read(K.sfilters, null)),
    compare: new Set(read(K.compare, [])),
    favs: new Set(read(K.favs, [])),
    blacklist: new Set(read(K.black, [])),
    points: read(K.points, { free: 2400, locked: 1500, expiring: 800, expiresAt: '31.12.2026' }),
    requests: read(K.requests, [
      {
        id: 'RQ-260714-0031', date: '14.07.2026', title: 'Конференция «Итоги полугодия», 120 чел.',
        objects: [{ venueId: 1, status: 'sent' }, { venueId: 11, status: 'confirmed' }, { venueId: 4, status: 'done' }],
      },
      {
        id: 'RQ-260703-0018', date: '03.07.2026', title: 'Выездной тимбилдинг, 60 чел.',
        objects: [{ venueId: 7, status: 'sent' }, { venueId: 10, status: 'cancelled', reason: 'Не устроила стоимость' }],
      },
    ]),
  };

  const persist = {
    tariff: () => write(K.tariff, state.tariff),
    filters: () => write(K.filters, packFilters(state.filters)),
    myVenues: () => write(K.myVenues, state.myVenues),
    reviews: () => write(K.reviews, state.reviews),
    myServices: () => write(K.myServices, state.myServices),
    supplierFilters: () => write(K.sfilters, packSupplierFilters(state.supplierFilters)),
    compare: () => write(K.compare, [...state.compare]),
    favs: () => write(K.favs, [...state.favs]),
    blacklist: () => write(K.black, [...state.blacklist]),
    points: () => write(K.points, state.points),
    requests: () => write(K.requests, state.requests),
  };

  /* ─────────── 9. СЕЛЕКТОРЫ И ЛОГИКА ─────────── */

  const tariff = () => TARIFFS[state.tariff] || TARIFFS.start;
  const setTariff = (k) => {
    if (!TARIFFS[k]) return;
    if (k === 'guest') { state.compare.clear(); persist.compare(); }
    state.tariff = k; persist.tariff();
    // лимит сравнения мог уменьшиться — обрезаем
    const lim = TARIFFS[k].compare;
    if (state.compare.size > lim) { state.compare = new Set([...state.compare].slice(0, lim)); persist.compare(); }
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
  const venueMinPrice = (v) => {
    const p = v.halls.map(h => h.priceDay).filter(x => x > 0);
    return p.length ? Math.min(...p) : 0;
  };

  /** Пустой набор фильтров. */
  function emptyFilters() {
    return {
      city: '', people: 0, eventType: 'business',
      cats: new Set(), priceDay: [0, 200000],
      twin: 0, sngl: 0, hallsMin: 0,
      seats: {},                       // {theatre: 200, banquet: 80, ...}
      food: new Set(), opts: new Set(), other: new Set(), sport: new Set(),
    };
  }

  /**
   * Отбор залов по фильтрам. Возвращает объекты с УЖЕ отфильтрованными залами:
   * [{venue, halls:[...]}] — в выдаче показываются только подходящие залы.
   * excludeGroup — имя группы, которую не учитывать (для фасетных счётчиков
   * по логике «ИЛИ»: иначе группа блокирует сама себя).
   */
  function filterVenues(F, excludeGroup) {
    const out = [];
    for (const v of VENUES) {
      if (state.blacklist.has(v.id)) continue;
      if (F.eventType && !v.eventTypes.includes(F.eventType)) continue;
      if (F.city && !v.city.toLowerCase().includes(F.city.toLowerCase())) continue;
      if (excludeGroup !== 'cats' && F.cats.size && !F.cats.has(v.cat)) continue;
      if (F.twin && v.rooms.twin < F.twin) continue;
      if (F.sngl && v.rooms.sngl < F.sngl) continue;
      if (F.hallsMin && v.halls.length < F.hallsMin) continue;

      // Удобства объекта — логика «И»: должны присутствовать все отмеченные.
      const featuresOk = ['food', 'opts', 'other', 'sport'].every(g =>
        g === excludeGroup || [...F[g]].every(a => v.features.includes(a)));
      if (!featuresOk) continue;

      // Залы объекта, подходящие под ТЗ. Цена 0 («по договорённости») проходит всегда.
      const halls = v.halls.filter(h => {
        if (F.people && hallCapacity(h) < F.people) return false;
        if (h.priceDay > 0 && (h.priceDay < F.priceDay[0] || h.priceDay > F.priceDay[1])) return false;
        for (const k in F.seats) { const need = F.seats[k]; if (need > 0 && (h.seats[k] || 0) < need) return false; }
        return true;
      });
      if (!halls.length) continue;
      out.push({ venue: v, halls });
    }
    return out;
  }

  /** Фасетный счётчик: сколько объектов останется, если добавить это условие. */
  function facetCount(F, group, value) {
    const or = group === 'cats';
    const base = filterVenues(F, or ? group : null);
    if (or) return base.filter(x => x.venue.cat === value).length;
    return base.filter(x => x.venue.features.includes(value)).length;
  }

  /* — сравнение и избранное работают по ID ЗАЛОВ — */

  function inCompare(hallId) { return state.compare.has(+hallId); }
  /** @returns {{ok:boolean, reason?:string}} */
  function toggleCompare(hallId) {
    hallId = +hallId;
    if (state.compare.has(hallId)) { state.compare.delete(hallId); persist.compare(); return { ok: true }; }
    const lim = tariff().compare;
    if (state.compare.size >= lim) {
      return { ok: false, reason: `Тариф «${tariff().name}»: максимум ${lim} залов в сравнении` };
    }
    state.compare.add(hallId); persist.compare(); return { ok: true };
  }
  const clearCompare = () => { state.compare.clear(); persist.compare(); };
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

  /** Создаёт запрос из текущего сравнения. Возвращает объект запроса или null. */
  function createRequest(title, letter) {
    const halls = compareHalls();
    const venueIds = [...new Set(halls.map(h => h.venueId))];
    const chk = canGroupRequest(venueIds.length);
    if (!chk.ok) return null;
    const req = {
      id: newRequestId(), date: new Date().toLocaleDateString('ru'),
      title: title || `Запрос на ${venueIds.length} объектов`, letter: letter || '',
      params: filtersSummary(state.filters),
      hallIds: halls.map(h => h.id),
      objects: venueIds.map(venueId => ({ venueId, status: 'sent' })),
    };
    state.requests.unshift(req); persist.requests();
    clearCompare();
    return req;
  }

  const requestById = (id) => state.requests.find(r => r.id === id) || null;

  /** Можно ли нажать кнопку статуса. Отмена активна всегда, пока не отменено. */
  function canSetStatus(obj, next) {
    if (obj.status === 'cancelled') return false;
    if (next === 'cancelled') return true;
    if (next === 'confirmed') return obj.status === 'sent';
    if (next === 'done') return obj.status === 'confirmed';
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
  const reviewPoints = () => tariff().key === 'prem' ? POINTS_REVIEW.prem : tariff().key === 'biz' ? POINTS_REVIEW.biz : 0;
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
    const maxPrice = Math.max(...SUPPLIERS.map(s => s.price));
    const maxExp = Math.max(...SUPPLIERS.map(s => s.exp));
    return {
      city: '', price: [0, maxPrice], expMin: 0,
      video: false, reviews: false, loyalty: false,
      cats: new Set(),                 // ключи вида 'Артисты·Ведущий'
      _maxPrice: maxPrice, _maxExp: maxExp,
    };
  }
  const supplierKey = (s) => s.parent + '·' + s.child;

  /** excludeGroup='cats' — не учитывать дерево категорий (для фасетов по «ИЛИ»). */
  function filterSuppliers(F, excludeGroup) {
    return SUPPLIERS.filter(s => {
      if (F.city && !s.city.toLowerCase().includes(F.city.toLowerCase())) return false;
      if (s.price < F.price[0] || s.price > F.price[1]) return false;
      if (F.expMin && s.exp < F.expMin) return false;
      if (F.video && !s.video) return false;
      if (F.reviews && !s.reviews) return false;
      if (F.loyalty && !s.loyalty) return false;
      if (excludeGroup !== 'cats' && F.cats.size && !F.cats.has(supplierKey(s))) return false;
      return true;
    });
  }
  /** kind: 'leaf' (подкатегория), 'parent' (раздел), 'flag' (video|reviews|loyalty). */
  function supplierFacet(F, kind, value) {
    if (kind === 'flag') return filterSuppliers(F, null).filter(s => s[value]).length;
    const base = filterSuppliers(F, 'cats');
    if (kind === 'parent') return base.filter(s => s.parent === value).length;
    return base.filter(s => supplierKey(s) === value).length;
  }
  /** Групповой запрос поставщикам возможен только внутри одной категории. */
  function canGroupSupplierRequest(supplierIds) {
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

  const SET_KEYS = ['cats', 'food', 'opts', 'other', 'sport'];

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
      else if (k === 'seats' && raw[k] && typeof raw[k] === 'object') F[k] = raw[k];
      else if (Array.isArray(F[k]) && Array.isArray(raw[k])) F[k] = raw[k];
      else if (typeof F[k] === typeof raw[k]) F[k] = raw[k];
    }
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
    if (F.city) out.push(F.city);
    if (F.people) out.push('от ' + F.people + ' чел.');
    const et = EVENT_TYPES.find(e => e.k === F.eventType);
    if (et) out.push(et.l);
    if (F.cats.size) out.push([...F.cats].join(', '));
    if (F.twin) out.push('TWIN от ' + F.twin);
    if (F.sngl) out.push('SNGL от ' + F.sngl);
    if (F.hallsMin) out.push('залов от ' + F.hallsMin);
    for (const k in F.seats) {
      if (!F.seats[k]) continue;
      const s = SEATING.find(x => x.k === k);
      out.push((s ? s.l : k) + ' от ' + F.seats[k]);
    }
    const [lo, hi] = F.priceDay;
    if (lo > 0 || hi < 200000) out.push(`аренда ${lo.toLocaleString('ru')}–${hi.toLocaleString('ru')} ₽`);
    for (const g of SET_KEYS) { if (g === 'cats') continue; F[g].forEach(x => out.push(x)); }
    return out;
  }

  /* — карточки, которые заводит сам владелец —
     Объекты и услуги, созданные через визард, попадают сюда со статусом
     «на модерации» и в поисковую выдачу не идут: по документам карточку
     проверяют перед публикацией. */

  const MODERATION = { draft: 'черновик', review: 'на модерации', published: 'опубликован', rejected: 'отклонён' };

  function addMyVenue(d) {
    const v = {
      localId: 'v' + Date.now(), name: d.name || 'Без названия', cat: d.cat || '', city: d.city || '',
      addr: d.addr || '', coords: d.coords || '', rooms: { twin: +d.twin || 0, sngl: +d.sngl || 0 },
      features: [].concat(d.food || [], d.opts || [], d.other || [], d.sport || []),
      halls: (d.halls || []).map(h => ({
        name: h.name || 'Без названия', type: h.type || '', area: +h.area || 0, height: +h.height || 0,
        seats: h.seats || {}, priceDay: +h.priceDay || 0, priceHour: +h.priceHour || 0,
        plan: !!(h.plan || []).length, props: h.props || [],
      })),
      contacts: { person: d.person || '', phone: d.phone || '', mail: d.mail || '', inn: d.inn || '', bank: d.bank || '' },
      contracts: d.contracts || [], desc: d.about || '',
      status: 'review', createdAt: new Date().toLocaleDateString('ru'),
    };
    state.myVenues.unshift(v); persist.myVenues();
    return v;
  }
  function addMyService(d) {
    const price = +d.price || 0;
    const s = {
      localId: 's' + Date.now(), name: d.name || 'Без названия',
      parent: d.parent || '', child: d.child || '', about: d.about || '',
      price, exp: +d.exp || 0, geo: d.geo || [],
      loyalty: !!(d.loy || []).length,
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
    if (o.status === 'cancelled') return false;
    o.venueDone = true;
    if (guests) o.guests = guests;
    if (bothConfirmed(o)) unlockPoints(eventPoints(o.guests || 100));
    persist.requests();
    return true;
  }
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

  /* ─────────── 10. ЭКСПОРТ ─────────── */

  window.ML = {
    CITIES, VENUE_CATS, EVENT_TYPES, SEATING, HALL_TYPES, FEATURES, FEATURE_GROUPS, SUPPLIER_TREE,
    TARIFFS, plans, isGuest, FEE_TIERS, POINT_RATE, POINTS_HELLO, POINTS_REVIEW, CANCEL_REASONS, REQUEST_FLOW,
    LOYALTY_DISCOUNT, servicePoints, serviceCost,
    VENUES, SUPPLIERS, SHOP,
    state, persist,
    tariff, setTariff,
    venueById, allHalls, hallById, hallVenue,
    hallCapacity, venueCapacity, venueMinPrice,
    emptyFilters, filterVenues, facetCount,
    saveFilters, loadFilters, resetFilters, filtersSummary,
    saveSupplierFilters, loadSupplierFilters, resetSupplierFilters,
    emptySupplierFilters, filterSuppliers, supplierFacet, supplierKey, canGroupSupplierRequest,
    inCompare, toggleCompare, clearCompare, compareHalls,
    isFav, toggleFav,
    addToBlacklist, removeFromBlacklist,
    canGroupRequest, createRequest, requestById, canSetStatus, setStatus,
    feeTier, eventPoints, reviewPoints, pointsToRub, addPoints, spendPoints, unlockPoints,
    MODERATION, addMyVenue, addMyService, removeMyVenue, removeMyService,
    addReview, reviewsFor, reviewsLatest, reviewScore,
    bothConfirmed, venueMarkDone, venueFee,
    photoUrl: (n) => `../assets/photos/v${((n - 1) % 16) + 1}.jpg`,
    money: (n) => n > 0 ? n.toLocaleString('ru') + ' ₽' : 'по договорённости',
    plural: (n, f) => { const a = n % 10, b = n % 100; return b > 11 && b < 15 ? f[2] : a === 1 ? f[0] : a >= 2 && a <= 4 ? f[1] : f[2]; },
  };

})();

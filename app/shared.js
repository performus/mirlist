/* МАЙСЛИСТ shared utilities — auth state + nav injection */
const MH = (() => {
  /* ДЕМО-ПАНЕЛЬ, УДАЛИТЬ ПЕРЕД ПРОДАКШЕНОМ — единственный выключатель.
     false → панель не отрисовывается ни на одной странице и в разметке
     от неё ничего не остаётся. Правки по файлам для этого не нужны. */
  const DEMO = true;

  const KEY = 'mh_session';
  const esc = (x) => String(x == null ? '' : x).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const FAV_KEY = 'mh_favs';

  function getFavs() {
    try { return new Set(JSON.parse(localStorage.getItem(FAV_KEY)) || []); } catch { return new Set(); }
  }
  function saveFavs(set) { localStorage.setItem(FAV_KEY, JSON.stringify([...set])); }
  function toggleFav(id) {
    const favs = getFavs();
    const added = !favs.has(id);
    if (added) favs.add(id); else favs.delete(id);
    saveFavs(favs);
    toast(added ? 'Добавлено в избранное' : 'Удалено из избранного', added ? 'success' : 'info');
    return added;
  }
  function isFav(id) { return getFavs().has(id); }

  function getSession() {
    try { return JSON.parse(localStorage.getItem(KEY)); } catch { return null; }
  }
  function setSession(data) { localStorage.setItem(KEY, JSON.stringify(data)); }
  function clearSession() {
    localStorage.removeItem(KEY);
    // выход из аккаунта возвращает гостевой уровень доступа
    if (typeof ML !== 'undefined' && ML.setTariff) ML.setTariff('guest');
  }
  /** Роль текущей сессии. Старые сессии без роли — пользователь. */
  function sessionRole() {
    const s = getSession();
    return s && ROLE_NAMES[s.role] ? s.role : 'user';
  }

  /* ══════════════════════════════════════════════════════════════════
     АККАУНТЫ ПО РОЛЯМ

     Пользователь, площадка и поставщик — отдельные аккаунты. Ключ аккаунта —
     пара «роль + почта»: одна почта может быть в нескольких ролях, и у каждой
     свой пароль. В прототипе аккаунты лежат в localStorage; пароли хранятся
     открытым текстом только потому, что это демо без сервера.
     ══════════════════════════════════════════════════════════════════ */
  const ACC_KEY = 'mh_accounts';
  const ROLE_NAMES = { user: 'Пользователь', venue: 'Площадка', supplier: 'Поставщик' };
  /* Демо-аккаунты: одна почта во всех трёх ролях, пароли разные. */
  const DEMO_ACCOUNTS = [
    { role: 'user',     email: 'demo@micelist.ru', pass: 'user1234',  name: 'Анна Козлова' },
    { role: 'venue',    email: 'demo@micelist.ru', pass: 'venue1234', name: 'Отель «Аврора»' },
    { role: 'supplier', email: 'demo@micelist.ru', pass: 'supp1234',  name: 'Артём Соколов' },
  ];
  const normMail = (m) => String(m || '').trim().toLowerCase();
  function accounts() {
    let list = null;
    try { list = JSON.parse(localStorage.getItem(ACC_KEY)); } catch (e) { list = null; }
    if (!Array.isArray(list)) {
      list = DEMO_ACCOUNTS.map(a => ({ ...a }));
      try { localStorage.setItem(ACC_KEY, JSON.stringify(list)); } catch (e) { /* приватный режим */ }
    }
    return list;
  }
  function saveAccounts(list) { try { localStorage.setItem(ACC_KEY, JSON.stringify(list)); } catch (e) { /* приватный режим */ } }
  function findAccount(role, email) { return accounts().find(a => a.role === role && a.email === normMail(email)) || null; }
  function initialsOf(name) {
    const p = String(name || '').trim().split(/\s+/).map(w => w.replace(/^[^A-Za-zА-Яа-яЁё]+/, '')).filter(Boolean);
    return (((p[0] || '')[0] || '') + ((p[1] || '')[0] || '')).toUpperCase() || 'МЛ';
  }
  function sessionFor(acc) {
    return { name: acc.name, initials: initialsOf(acc.name), role: acc.role, email: acc.email,
      phone: acc.phone || '', org: acc.org || '', premium: false };
  }
  /** @returns {{ok:boolean, error?:string, account?:object}} */
  function register(role, email, pass, profile) {
    if (!ROLE_NAMES[role]) return { ok: false, error: 'Неизвестная роль' };
    if (findAccount(role, email)) {
      return { ok: false, error: `Эта почта уже зарегистрирована в роли «${ROLE_NAMES[role]}». Войдите или восстановите пароль.` };
    }
    const acc = { role, email: normMail(email), pass, ...(profile || {}) };
    const list = accounts(); list.push(acc); saveAccounts(list);
    return { ok: true, account: acc };
  }
  function login(role, email, pass) {
    const acc = findAccount(role, email);
    if (!acc) return { ok: false, error: `Аккаунт с этой почтой в роли «${ROLE_NAMES[role]}» не найден. Проверьте роль или зарегистрируйтесь.` };
    if (acc.pass !== pass) return { ok: false, error: 'Неверный пароль для этой роли' };
    return { ok: true, account: acc };
  }
  /** Новый пароль ставится только аккаунту выбранной роли — у других ролей той же почты он прежний. */
  function resetPassword(role, email, pass) {
    const list = accounts();
    const acc = list.find(a => a.role === role && a.email === normMail(email));
    if (!acc) return { ok: false, error: `Аккаунт с этой почтой в роли «${ROLE_NAMES[role]}» не найден` };
    acc.pass = pass; saveAccounts(list);
    return { ok: true, account: acc };
  }

  /* Пункты кабинета по ролям — один список на левую колонку кабинета
     и выпадающее меню в шапке. Иконки и счётчики добавляет dashboard.html. */
  const CABINET_MENU = {
    user: [
      { id: 'dash', label: 'Обзор' },
      { id: 'requests', label: 'История запросов' },
      { id: 'compare', label: 'Сравнение', href: 'compare.html' },
      { id: 'favs', label: 'Избранное' },
      { id: 'points', label: 'Мои баллы' },
      { id: 'profile', label: 'Профиль' },
      { id: 'billing', label: 'Подписка и оплата' },
    ],
    venue: [
      { id: 'odash', label: 'Обзор' },
      { id: 'ovenues', label: 'Мои объекты' },
      { id: 'oreqs', label: 'Входящие запросы' },
      { id: 'oshop', label: 'Витрина' },
      { id: 'ostats', label: 'Статистика' },
      { id: 'oprofile', label: 'Реквизиты' },
    ],
    supplier: [
      { id: 'sdash', label: 'Обзор' },
      { id: 'sservices', label: 'Мои услуги' },
      { id: 'sreqs', label: 'Входящие запросы' },
      { id: 'sshop', label: 'Витрина' },
      { id: 'ssub', label: 'Подписка' },
      { id: 'sprofile', label: 'Реквизиты' },
    ],
  };
  const menuHref = (role, it) => it.href || `dashboard.html?role=${role}&page=${it.id}`;
  function logout() { clearSession(); window.location.href = 'homepage.html'; }

  function injectNavCSS() {
    if (document.getElementById('mh-nav-style')) return;
    const s = document.createElement('style');
    s.id = 'mh-nav-style';
    s.textContent = `
      .mh-header {
        position: fixed; top: 0; left: 0; right: 0; height: 64px; z-index: 650;   /* выше сервисной панели: меню пользователя выпадает поверх неё */
        display: flex; align-items: center; padding: 0 36px;
        background: rgba(255,255,255,.85); backdrop-filter: blur(20px); -webkit-backdrop-filter: blur(20px);
        box-shadow: 0 2px 24px rgba(53,78,99,.07);
        font-family: 'Onest', system-ui, sans-serif;
      }
      .mh-logo {
        text-decoration: none; white-space: nowrap; margin-right: 32px; flex-shrink: 0;
        display: flex; align-items: center;
      }
      .mh-logo-img { display: block; height: 34px; width: auto; }
      @media (max-width: 860px) { .mh-logo-img { height: 30px; } }
      .mh-nav {
        display: flex; align-items: center; gap: 4px; flex: 1;
      }
      .mh-nav a {
        font-size: 12px; font-weight: 600; letter-spacing: .07em; text-transform: uppercase;
        color: #3D5A6E; padding: 8px 12px; border-radius: 6px;
        text-decoration: none; white-space: nowrap; transition: color .18s, background .18s;
      }
      .mh-nav a:hover { color: #E8846A; background: rgba(232,132,106,.06); }
      .mh-nav a.active { color: #E8846A; }
      .mh-divider {
        width: 1px; height: 32px; background: #e8e0d8;
        margin: 0 20px; flex-shrink: 0;
      }
      .mh-right {
        display: flex; align-items: center; gap: 12px; flex-shrink: 0;
      }
      .mh-prem {
        display: flex; align-items: center; gap: 6px;
        font-size: 14.5px; font-weight: 700; color: #E8846A;
        text-decoration: none; white-space: nowrap; padding: 0 4px;
      }
      .mh-prem:hover { color: #d4704f; }
      .mh-prem .star { font-size: 16px; }
      .mh-login {
        padding: 10px 28px; border-radius: 50px;
        border: 2px solid #B4C3CC; background: #fff;
        font-size: 14.5px; font-weight: 700; color: #354E63;
        text-decoration: none; white-space: nowrap; transition: all .18s;
      }
      .mh-login:hover { border-color: #E8846A; color: #E8846A; }
      .mh-cta {
        padding: 11px 28px; border-radius: 50px;
        background: #E8846A; color: #fff;
        font-size: 14.5px; font-weight: 700;
        text-decoration: none; white-space: nowrap; transition: background .18s;
        box-shadow: 0 4px 16px rgba(232,132,106,.32);
      }
      .mh-cta:hover { background: #d4704f; }
      .mh-avatar-wrap {
        display: flex; align-items: center; gap: 9px; cursor: pointer;
        padding: 5px 14px 5px 5px; border-radius: 50px; transition: background .18s;
        text-decoration: none; color: inherit;
      }
      .mh-avatar-wrap:hover { background: rgba(237,246,245,.8); }
      .mh-avatar {
        width: 34px; height: 34px; border-radius: 50%;
        background: #FCEAE4; display: flex; align-items: center; justify-content: center;
        font-size: 12px; font-weight: 800; color: #E8846A; flex-shrink: 0;
      }
      .mh-uname { font-size: 13.5px; font-weight: 600; color: #354E63; }
      .mh-prem-mark {
        display: inline-flex; align-items: center; justify-content: center;
        width: 26px; height: 26px; flex-shrink: 0;
        color: #E8846A;
      }
      .mh-points {
        display: inline-flex; align-items: center;
        padding: 6px 14px; border-radius: 50px;
        background: #FCEAE4; color: #E8846A;
        font-size: 13px; font-weight: 700; text-decoration: none;
        white-space: nowrap; transition: background .18s;
      }
      .mh-points:hover { background: #F6DDD3; }
      .mh-prem-badge {
        display: inline-flex; align-items: center; gap: 3px;
        padding: 2px 9px; border-radius: 50px;
        background: linear-gradient(135deg, #E98667, #D96345); color: #fff;
        font-size: 10.5px; font-weight: 700;
      }
      body.has-mh-nav { padding-top: 64px; }

      /* Toast */
      #mh-toasts {
        position: fixed; bottom: 24px; right: 24px; z-index: 9000;
        display: flex; flex-direction: column; gap: 8px; pointer-events: none;
      }
      .mh-toast {
        display: flex; align-items: center; gap: 10px;
        padding: 12px 18px; border-radius: 12px; min-width: 220px; max-width: 320px;
        background: #354E63; color: #fff;
        font-family: 'Onest', system-ui, sans-serif; font-size: 13.5px; font-weight: 500;
        box-shadow: 0 8px 28px rgba(53,78,99,.22);
        opacity: 0; transform: translateY(8px);
        transition: opacity .22s ease, transform .22s ease;
        pointer-events: auto;
      }
      .mh-toast.show { opacity: 1; transform: translateY(0); }
      .mh-toast.success .mh-toast-icon { color: #4CAF78; }
      .mh-toast.error   .mh-toast-icon { color: #E8846A; }
      .mh-toast.info    .mh-toast-icon { color: #79B9C3; }
      .mh-toast-icon { font-size: 15px; flex-shrink: 0; }

      .mh-burger {
        display: none; flex-direction: column; justify-content: center; gap: 5px;
        width: 36px; height: 36px; cursor: pointer; padding: 6px; margin-left: auto;
        border: none; background: none; border-radius: 8px; transition: background .18s;
      }
      .mh-burger:hover { background: rgba(232,132,106,.08); }
      .mh-burger span {
        display: block; width: 100%; height: 2px; border-radius: 2px; background: #3D5A6E;
        transition: transform .25s, opacity .25s, width .25s;
      }
      .mh-burger.open span:nth-child(1) { transform: translateY(7px) rotate(45deg); }
      .mh-burger.open span:nth-child(2) { opacity: 0; width: 0; }
      .mh-burger.open span:nth-child(3) { transform: translateY(-7px) rotate(-45deg); }

      .mh-drawer {
        display: none; position: fixed; top: 64px; left: 0; right: 0;
        background: #fff; border-bottom: 1px solid #e8e0d8;
        box-shadow: 0 8px 32px rgba(53,78,99,.10);
        padding: 16px 24px 24px; z-index: 640;
        flex-direction: column; gap: 4px;
        animation: mhDrawerIn .2s ease;
      }
      .mh-drawer.open { display: flex; }
      @keyframes mhDrawerIn {
        from { opacity: 0; transform: translateY(-8px); }
        to   { opacity: 1; transform: translateY(0); }
      }
      .mh-drawer a {
        font-size: 14px; font-weight: 600; letter-spacing: .05em; text-transform: uppercase;
        color: #3D5A6E; padding: 12px 14px; border-radius: 8px;
        text-decoration: none; transition: color .15s, background .15s;
      }
      .mh-drawer a:hover { color: #E8846A; background: rgba(232,132,106,.06); }
      .mh-drawer a.active { color: #E8846A; }
      .mh-drawer-sep { height: 1px; background: #e8e0d8; margin: 10px 0; }
      .mh-drawer-cta {
        display: block; text-align: center; margin-top: 4px;
        padding: 13px 22px; border-radius: 50px;
        background: #E8846A; color: #fff !important;
        font-size: 14px; font-weight: 600; text-transform: none !important;
        letter-spacing: 0 !important; box-shadow: 0 3px 12px rgba(232,132,106,.28);
      }
      .mh-drawer-cta:hover { background: #d4704f !important; }

      /* Меню пользователя: на мыши — по наведению, на касании — по тапу */
      .mh-umenu { position: relative; }
      .mh-umenu .mh-avatar-wrap { border: none; background: none; font-family: inherit; }
      .mh-umenu .mh-caret { width: 10px; height: 10px; color: #7A919F; transition: transform .18s; }
      .mh-umenu.open .mh-caret { transform: rotate(180deg); }
      .mh-udrop {
        position: absolute; top: calc(100% + 6px); right: 0; min-width: 230px;
        background: #fff; border-radius: 14px; padding: 8px;
        border: 1px solid rgba(197,227,225,.6); box-shadow: 0 14px 40px rgba(53,78,99,.14);
        display: none; flex-direction: column; z-index: 700;
      }
      .mh-udrop::before { content: ''; position: absolute; left: 0; right: 0; top: -8px; height: 8px; }
      .mh-umenu.open .mh-udrop { display: flex; }
      @media (hover: hover) { .mh-umenu:hover .mh-udrop { display: flex; } }
      .mh-udrop-h { padding: 8px 12px 10px; border-bottom: 1px solid #F0EAE4; margin-bottom: 6px; }
      .mh-udrop-h b { display: block; font-size: 13.5px; color: #354E63; }
      .mh-udrop-h span { font-size: 11.5px; color: #7A919F; }
      .mh-udrop a, .mh-udrop button {
        display: block; text-align: left; width: 100%;
        padding: 9px 12px; border-radius: 9px; border: none; background: none; cursor: pointer;
        font-family: inherit; font-size: 13.5px; font-weight: 500; color: #354E63; text-decoration: none;
      }
      .mh-udrop a:hover, .mh-udrop button:hover { background: #F6F1EC; color: #E8846A; }
      .mh-udrop .mh-udrop-out { border-top: 1px solid #F0EAE4; margin-top: 6px; border-radius: 0 0 9px 9px; padding-top: 11px; color: #7A919F; }
      .mh-drawer .mh-drawer-u { font-size: 12px; color: #7A919F; padding: 4px 14px 2px; text-transform: none; letter-spacing: 0; }
      .mh-drawer a.mh-drawer-m, .mh-drawer button.mh-drawer-m {
        text-transform: none; letter-spacing: 0; font-size: 14px; padding: 10px 14px;
      }
      .mh-drawer button.mh-drawer-m {
        border: none; background: none; text-align: left; font-family: inherit; font-weight: 600;
        color: #7A919F; cursor: pointer; border-radius: 8px;
      }
      .mh-drawer-msub { display: none; flex-direction: column; }
      .mh-drawer-msub.open { display: flex; }

      @media (max-width: 860px) {
        .mh-nav { display: none !important; }
        .mh-divider { display: none !important; }
        .mh-right { display: none !important; }
        .mh-burger { display: flex !important; }
        .mh-header { padding: 0 14px; }
      }

      /* Пометка рекламы — одна на весь сайт */
      .ml-ad {
        display: inline-flex; align-items: center; gap: 5px;
        padding: 3px 9px; border-radius: 50px;
        background: rgba(53,78,99,.08); color: #5E7688;
        font-family: 'Onest', system-ui, sans-serif; font-size: 10.5px; font-weight: 700;
        letter-spacing: .08em; text-transform: uppercase; line-height: 1.4; white-space: nowrap;
      }
      .ml-ad-frame { position: relative; outline: 2px solid #E8C9BC; outline-offset: -2px; }
      .ml-ad-frame > .ml-ad-pin { position: absolute; top: 10px; right: 10px; z-index: 3; }

      /* Модальное окно сайта: подтверждения и пейвол */
      .mh-dlg-ovl {
        position: fixed; inset: 0; z-index: 9500; padding: 20px;
        background: rgba(53,78,99,.35); backdrop-filter: blur(6px);
        display: flex; align-items: center; justify-content: center;
        animation: mhDlgIn .2s ease;
      }
      @keyframes mhDlgIn { from { opacity: 0 } to { opacity: 1 } }
      .mh-dlg {
        width: 100%; max-width: 460px; background: #fff; border-radius: 20px;
        box-shadow: 0 24px 64px rgba(53,78,99,.18); overflow: hidden;
        font-family: 'Onest', system-ui, sans-serif; color: #354E63;
      }
      .mh-dlg-h { display: flex; align-items: flex-start; justify-content: space-between; gap: 14px; padding: 24px 26px 0; }
      .mh-dlg-t { font-family: 'Literata', Georgia, serif; font-weight: 600; font-size: 21px; line-height: 1.3; }
      .mh-dlg-x {
        width: 32px; height: 32px; border-radius: 50%; border: 1.5px solid #B4C3CC; background: #fff;
        color: #7A919F; cursor: pointer; flex-shrink: 0; font-size: 13px;
      }
      .mh-dlg-x:hover { border-color: #E8846A; color: #E8846A; }
      .mh-dlg-b { padding: 12px 26px 4px; font-size: 14px; line-height: 1.6; color: #5E7688; }
      .mh-dlg-b b { color: #354E63; }
      .mh-dlg-f { display: flex; gap: 10px; justify-content: flex-end; flex-wrap: wrap; padding: 18px 26px 24px; }
      .mh-dlg-btn {
        padding: 11px 22px; border-radius: 50px; border: 1.5px solid #B4C3CC; background: #fff;
        font-family: inherit; font-size: 14px; font-weight: 600; color: #354E63;
        cursor: pointer; text-decoration: none; text-align: center;
      }
      .mh-dlg-btn:hover { border-color: #E8846A; color: #E8846A; }
      .mh-dlg-btn.pri { background: #E8846A; border-color: #E8846A; color: #fff; box-shadow: 0 4px 14px rgba(232,132,106,.28); }
      .mh-dlg-btn.pri:hover { background: #d4704f; border-color: #d4704f; color: #fff; }
      .mh-dlg-btn:disabled { opacity: .45; cursor: default; }
      .mh-pw-ic {
        width: 46px; height: 46px; border-radius: 14px; background: #FCEAE4; color: #E8846A;
        display: flex; align-items: center; justify-content: center; margin-bottom: 12px;
      }
      @media (max-width: 480px) {
        .mh-dlg-f { flex-direction: column-reverse; }
        .mh-dlg-btn { width: 100%; }
      }
    `;
    document.head.appendChild(s);
  }

  /* Знак премиум-тарифа. Эмодзи не годится: ⭐ рисуется по-своему в Windows,
     macOS и Android. Ромб — инлайновый SVG, красится акцентным цветом. */
  const IC_DIAMOND = '<svg class="mh-dia" width="15" height="15" viewBox="0 0 24 24" aria-hidden="true" focusable="false">'
    + '<path d="M12 2.2 21.8 12 12 21.8 2.2 12z" fill="currentColor" opacity=".92"/>'
    + '<path d="M12 6.6 17.4 12 12 17.4 6.6 12z" fill="#fff" opacity=".28"/></svg>';

  function isPrem() {
    return typeof ML !== 'undefined' && ML.tariff && ML.tariff().key === 'prem';
  }

  function buildRight(session) {
    if (session) {
      // Баллы рядом с кабинетом — из модели, если она подключена на странице
      /* У гостя аккаунта нет, показывать баланс нечему: вместо счётчика — вход. */
      const guest = typeof ML !== 'undefined' && ML.isGuest && ML.isGuest();
      /* баллы — у пользователя; у площадки и поставщика их нет */
      const pts = (!guest && sessionRole() === 'user' && typeof ML !== 'undefined' && ML.state && ML.state.points)
        ? ML.state.points.free : null;
      const backNext = encodeURIComponent(location.pathname.split('/').pop() + location.search);
      return `${guest
        ? `<a class="mh-login" href="auth.html?next=${backNext}">Войти</a>`
        : pts !== null
        ? `<a class="mh-points" href="bonus.html" title="Доступные баллы">${pts.toLocaleString('ru')} Б</a>` : ''}
      ${isPrem() ? `<span class="mh-prem-mark" title="Тариф «ПРЕМИУМ»">${IC_DIAMOND}</span>` : ''}
      <div class="mh-umenu" id="mh-umenu">
        <button type="button" class="mh-avatar-wrap" id="mh-ubtn" aria-haspopup="true" aria-expanded="false">
          <div class="mh-avatar">${esc(session.initials || 'АК')}</div>
          <span class="mh-uname">${esc(session.name || 'Профиль')}</span>
          ${session.premium ? '<span class="mh-prem-badge">★ Premium</span>' : ''}
          <svg class="mh-caret" viewBox="0 0 10 10" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2 3.5 5 6.5 8 3.5"/></svg>
        </button>
        <div class="mh-udrop" role="menu">${userMenuHTML(session, 'mh-udrop')}</div>
      </div>`;
    }
    const _next = encodeURIComponent(location.pathname.split('/').pop() + location.search);
    return `<a class="mh-prem" href="pricing.html">Тарифы</a>
      <a class="mh-login" href="auth.html?next=${_next}">Войти</a>
      <a class="mh-cta" href="auth.html?mode=signup">Регистрация</a>`;
  }

  /** Пункты меню пользователя: те же, что в левой колонке кабинета его роли, последним — «Выйти». */
  function userMenuHTML(session, cls) {
    const role = ROLE_NAMES[session.role] ? session.role : 'user';
    const items = CABINET_MENU[role].map(it =>
      `<a role="menuitem" class="${cls === 'mh-drawer' ? 'mh-drawer-m' : ''}" href="${menuHref(role, it)}">${esc(it.label)}</a>`).join('');
    const out = `<button type="button" role="menuitem" class="${cls === 'mh-drawer' ? 'mh-drawer-m' : 'mh-udrop-out'}" onclick="MH.logout()">Выйти</button>`;
    if (cls === 'mh-drawer') return items + out;
    return `<div class="mh-udrop-h"><b>${esc(session.name || 'Профиль')}</b><span>${ROLE_NAMES[role]}</span></div>${items}${out}`;
  }

  function bindUserMenu() {
    const box = document.getElementById('mh-umenu'), btn = document.getElementById('mh-ubtn');
    if (box && btn) {
      btn.addEventListener('click', e => {
        e.stopPropagation();
        const open = box.classList.toggle('open');
        btn.setAttribute('aria-expanded', open ? 'true' : 'false');
      });
      document.addEventListener('click', e => { if (!box.contains(e.target)) { box.classList.remove('open'); btn.setAttribute('aria-expanded', 'false'); } });
      document.addEventListener('keydown', e => { if (e.key === 'Escape') { box.classList.remove('open'); btn.setAttribute('aria-expanded', 'false'); } });
    }
    const dbtn = document.getElementById('mh-drawer-ubtn'), dsub = document.getElementById('mh-drawer-msub');
    if (dbtn && dsub) dbtn.addEventListener('click', () => {
      const open = dsub.classList.toggle('open');
      dbtn.setAttribute('aria-expanded', open ? 'true' : 'false');
    });
  }

  function renderNav(targetEl, active) {
    injectNavCSS();
    const session = getSession();
    /* Состав меню — по документам. Ссылки пишутся с расширением .html:
       cleanUrls в vercel.json выключен, прототип должен кликаться и локально. */
    const links = [
      { label: 'ПЛОЩАДКИ',        href: 'search.html',    key: 'map' },
      { label: 'ПОСТАВЩИКИ',      href: 'suppliers.html', key: 'suppliers' },
      { label: 'БОНУСЫ',          href: 'bonus.html',     key: 'bonus' },
      { label: 'FAQ',             href: 'faq.html',       key: 'faq' },
      { label: 'О ПРОЕКТЕ',       href: 'about.html',     key: 'about' },
      { label: 'КАК ЭТО РАБОТАЕТ', href: 'how.html',      key: 'how' },
      { label: 'ДЛЯ ПЛОЩАДОК',    href: 'list-venue.html', key: 'listvenue' },
    ];
    const navLinks = links.map(l =>
      `<a href="${l.href}"${active === l.key ? ' class="active"' : ''}>${l.label}</a>`
    ).join('');

    const drawerLinks = links.map(l =>
      `<a href="${l.href}"${active === l.key ? ' class="active"' : ''}>${l.label}</a>`
    ).join('');
    /* На мобильном меню пользователя раскрывается по тапу на имя внутри шторки. */
    const drawerRight = session
      ? `<div class="mh-drawer-sep"></div>
         <button type="button" class="mh-drawer-m" id="mh-drawer-ubtn" aria-expanded="false"
           style="color:#354E63">${esc(session.name || 'Профиль')} ▾</button>
         <div class="mh-drawer-msub" id="mh-drawer-msub">${userMenuHTML(session, 'mh-drawer')}</div>`
      : `<div class="mh-drawer-sep"></div>
         <a href="pricing.html" style="text-transform:none;letter-spacing:0;font-size:14px;">Тарифы</a>
         <a href="${'auth.html?next=' + encodeURIComponent(location.pathname.split('/').pop() + location.search)}" style="text-transform:none;letter-spacing:0;font-size:14px;">Войти</a>
         <a class="mh-drawer-cta" href="auth.html?mode=signup">Регистрация</a>`;

    targetEl.innerHTML = `
      <header class="mh-header">
        <a class="mh-logo" href="homepage.html"><img class="mh-logo-img" src="../assets/logo.svg" alt="МАЙСЛИСТ"></a>
        <nav class="mh-nav">${navLinks}</nav>
        <div class="mh-divider"></div>
        <div class="mh-right">${buildRight(session)}</div>
        <button class="mh-burger" id="mh-burger" aria-label="Меню">
          <span></span><span></span><span></span>
        </button>
      </header>
      <div class="mh-drawer" id="mh-drawer">
        ${drawerLinks}${drawerRight}
      </div>
      ${mountDemo()}`;

    document.body.classList.add('has-mh-nav');
    bindUserMenu();
    bindDemo();

    const burger = document.getElementById('mh-burger');
    const drawer = document.getElementById('mh-drawer');
    burger.addEventListener('click', () => {
      const open = drawer.classList.toggle('open');
      burger.classList.toggle('open', open);
    });
    document.addEventListener('click', e => {
      if (!targetEl.contains(e.target)) {
        drawer.classList.remove('open');
        burger.classList.remove('open');
      }
    });
    document.addEventListener('keydown', e => {
      if (e.key === 'Escape') { drawer.classList.remove('open'); burger.classList.remove('open'); }
    });
  }

  /* Подвал — один компонент на все страницы. Стили вставляются один раз,
     разметка — при каждом вызове (кабинет перерисовывает колонку целиком). */
  function renderFooter(el) {
    if (!el) return;
    if (!document.getElementById('mh-ft-style')) {
    const s = document.createElement('style');
    s.id = 'mh-ft-style';
    s.textContent = `
      .mh-footer {
        background: #F5F2EE; border-top: 1px solid #E5DDD6;
        font-family: 'Onest', system-ui, sans-serif; color: #7A919F;
      }
      .mh-ft-main {
        display: grid; grid-template-columns: 2fr 1fr 1fr 1fr 1fr;
        gap: 40px;
        padding: 52px 36px 40px;
      }
      .mh-ft-logo {
        margin-bottom: 10px;
      }
      .mh-ft-brand p {
        font-size: 13px; line-height: 1.65; color: #8A9DAA;
        max-width: 190px; margin-bottom: 20px;
      }
      /* Описание — ровно две строки без переносов по дефису (дефисы неразрывные) */
      .mh-ft-brand p.mh-ft-desc {
        max-width: none; white-space: nowrap;
      }
      .mh-ft-contacts { display: flex; flex-direction: column; gap: 8px; }
      .mh-ft-contact {
        display: flex; align-items: center; gap: 8px;
        font-size: 13px; color: #7A919F; text-decoration: none;
        transition: color .18s;
      }
      .mh-ft-contact:hover { color: #354E63; }
      .mh-ft-col h4 {
        font-size: 12.5px; font-weight: 600; color: #7A919F;
        margin-bottom: 16px; letter-spacing: .01em;
      }
      .mh-ft-col a {
        display: block; font-size: 13.5px; color: #8A9DAA;
        text-decoration: none; margin-bottom: 11px;
        transition: color .18s;
      }
      .mh-ft-col a:hover { color: #354E63; }
      .mh-ft-col a.bold { font-weight: 600; color: #354E63; }
      .mh-ft-social-row {
        padding: 20px 36px 24px;
        border-top: 1px solid #E5DDD6;
        display: flex; gap: 14px;
      }
      .mh-ft-social {
        width: 36px; height: 36px; border-radius: 50%;
        display: flex; align-items: center; justify-content: center;
        color: #8A9DAA; text-decoration: none; transition: color .18s;
      }
      .mh-ft-social:hover { color: #354E63; }
      .mh-ft-bottom {
        border-top: 1px solid #E5DDD6;
        padding: 20px 36px;
        display: flex; align-items: center; justify-content: space-between;
        font-size: 12.5px; color: #A8B8C2;
      }
      .mh-ft-bottom a {
        color: #A8B8C2; text-decoration: none; margin-left: 20px;
        transition: color .18s;
      }
      .mh-ft-bottom a:hover { color: #354E63; }
      @media (max-width: 900px) {
        .mh-ft-main { grid-template-columns: 1fr 1fr; padding: 36px 20px 28px; gap: 28px; }
        .mh-ft-social-row { padding: 16px 20px 20px; }
        .mh-ft-bottom { padding: 16px 20px; flex-direction: column; gap: 10px; text-align: center; }
      }
      @media (max-width: 560px) {
        .mh-ft-main { grid-template-columns: 1fr; }
      }
    `;
    document.head.appendChild(s);
    }

    const ICON_MAIL = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="20" height="16" x="2" y="4" rx="2"/><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/></svg>`;
    const ICON_PHONE = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.11 12 19.79 19.79 0 0 1 1.09 3.18 2 2 0 0 1 3.06 1h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/></svg>`;
    const ICON_VK = `<svg width="20" height="20" fill="currentColor" viewBox="0 0 32 20" xmlns="http://www.w3.org/2000/svg"><path d="M17.0871 18.3783C17.8777 18.3783 18.201 17.8893 18.1919 17.2762C18.1516 14.9672 19.1188 13.7242 20.8649 15.3442C22.7966 17.1365 23.1965 18.3783 25.5424 18.3783H29.6967C30.7456 18.3783 31.1584 18.0651 31.1584 17.5737C31.1584 16.5342 29.3137 14.6998 27.7506 13.3532C25.5618 11.4682 25.4593 11.4237 27.3443 9.15446C29.6824 6.33721 32.741 2.72742 30.0355 2.72742H24.8673C23.8651 2.72742 23.7924 3.25136 23.4354 4.03186C22.1436 6.85874 19.6887 10.5203 18.7566 9.96024C17.7816 9.37608 18.2282 7.0623 18.3022 3.62354C18.3217 2.71537 18.3165 2.09266 16.821 1.76986C16.0044 1.59522 15.2099 1.52295 14.4725 1.52295C11.5217 1.52295 9.48605 2.67081 10.6428 2.87075C12.6823 3.22366 12.4862 7.31764 12.0111 9.0858C11.1828 12.1644 8.0697 6.64796 6.77279 3.90057C6.45992 3.24052 6.36385 2.72742 5.24738 2.72742H1.02169C0.382973 2.72742 0 2.92013 0 3.34892C0 4.07401 3.84272 11.4429 7.51147 15.1166C11.0893 18.6999 14.6257 18.3783 17.0871 18.3783Z"/></svg>`;
    const ICON_TG = `<svg width="20" height="20" fill="currentColor" viewBox="0 0 26 22" xmlns="http://www.w3.org/2000/svg"><path transform="translate(-59 0)" d="M82.7739 0.175812C79.3485 1.49208 64.6608 7.13658 60.6026 8.67497C57.8809 9.66037 59.4742 10.5843 59.4742 10.5843C59.4742 10.5843 61.7974 11.3233 63.7891 11.8776C65.7805 12.4319 66.8426 11.8161 66.8426 11.8161L76.2023 5.96521C79.5214 3.87122 78.7249 5.59559 77.9281 6.33483C76.2023 7.93625 73.3479 10.4611 70.9581 12.4936C69.896 13.3558 70.4269 14.0948 70.8919 14.4644C72.6176 15.8194 77.3309 18.5909 77.5962 18.7756C78.9985 19.6966 81.7569 21.0225 82.1764 18.2213L83.836 8.55203C84.3671 5.28796 84.8981 2.27006 84.9643 1.40787C85.1636 -0.686373 82.7739 0.175812 82.7739 0.175812Z"/></svg>`;

    el.innerHTML = `
      <footer class="mh-footer">
        <div class="mh-ft-main">
          <div class="mh-ft-brand">
            <div class="mh-ft-logo"><img src="../assets/logo.svg" alt="МАЙСЛИСТ" height="20" style="display:block"></div>
            <p class="mh-ft-desc">B2B‑платформа для ивент‑менеджеров,<br>MICE‑агентств и их подрядчиков.</p>
            <div class="mh-ft-contacts">
              <a class="mh-ft-contact" href="mailto:info@micelist.ru">${ICON_MAIL} info@micelist.ru</a>
              <a class="mh-ft-contact" href="tel:+79166704905">${ICON_PHONE} +79166704905 (Алексей)</a>
              <a class="mh-ft-contact" href="tel:+79251751570">${ICON_PHONE} +79251751570 (Денис)</a>
            </div>
          </div>
          <div class="mh-ft-col">
            <h4>Платформа</h4>
            <a href="search.html">Подбор залов</a>
            <a href="suppliers.html">Поставщики</a>
            <a href="bonus.html">Бонусная программа</a>
            <a href="pricing.html">Тарифы</a>
          </div>
          <div class="mh-ft-col">
            <h4>Размещение</h4>
            <a href="list-venue.html">Добавить зал</a>
            <a href="for-organizers.html">Агентствам</a>
            <a href="listing-help.html">Помощь с оформлением</a>
          </div>
          <div class="mh-ft-col">
            <h4>Поддержка</h4>
            <a href="support.html">Поддержка и арбитраж</a>
            <a href="#" onclick="MH.feedback();return false;">Написать в поддержку</a>
            <a href="mailto:info@micelist.ru">Контакты</a>
            <a href="../index.html">Карта сайта</a>
          </div>
          <div class="mh-ft-col">
            <h4>Документы</h4>
            <a href="privacy.html">Политика конфиденциальности</a>
            <a href="#">Условия использования</a>
            <a href="#">Оферта</a>
          </div>
        </div>
        <div class="mh-ft-social-row">
          <a class="mh-ft-social" href="#" aria-label="ВКонтакте">${ICON_VK}</a>
          <a class="mh-ft-social" href="#" aria-label="Telegram">${ICON_TG}</a>
        </div>
        <div class="mh-ft-bottom">
          <span>© 2026 ООО «МАЙСЛИСТ»</span>
          <div>
            <a href="privacy.html">Политика конфиденциальности</a>
            <a href="#">Условия</a>
          </div>
        </div>
      </footer>`;
  }

  function go(url) {
    document.body.style.transition = 'opacity .15s ease';
    document.body.style.opacity = '0';
    setTimeout(() => { window.location.href = url; }, 150);
  }

  function initTransition() {
    document.body.style.opacity = '0';
    document.body.style.transition = 'opacity .2s ease';
    requestAnimationFrame(() => {
      requestAnimationFrame(() => { document.body.style.opacity = '1'; });
    });
    window.addEventListener('pageshow', e => {
      if (e.persisted) { document.body.style.transition = 'none'; document.body.style.opacity = '1'; }
    });
    /* Страница, восстановленная кнопкой «Назад» из bfcache, показывает старое
       состояние: например, залы отмечены добавленными, хотя сравнение уже
       сброшено. Сверяем снимок хранилища и перерисовываем страницу. */
    const snap = () => { try { return ['ml_compare_halls', 'ml_favs_halls', 'ml_tariff', 'mh_session'].map(k => localStorage.getItem(k)).join('|'); } catch (e) { return ''; } };
    let saved = snap();
    window.addEventListener('pagehide', () => { saved = snap(); });
    window.addEventListener('pageshow', e => {
      if (!e.persisted || snap() === saved) return;
      if (typeof ML !== 'undefined' && ML.reloadState) ML.reloadState();
      if (typeof RESTORE === 'function') RESTORE(); else location.reload();
    });
  }

  function injectSkeletonCSS() {
    if (document.getElementById('mh-sk-style')) return;
    const sel='.v-thumb,.v-img,.venue-thumb,.m-thumb,.city-thumb,.gallery-hero,.gallery-thumb,.sim-img,.vh-img,.hero-vcard-photo';
    const s = document.createElement('style');
    s.id = 'mh-sk-style';
    s.textContent = `@keyframes mh-shimmer{0%{background-position:-600px 0}100%{background-position:600px 0}}${sel}{background:linear-gradient(90deg,#e8ecef 25%,#f2f5f7 50%,#e8ecef 75%);background-size:1200px 100%;animation:mh-shimmer 1.5s infinite linear;}img.sk-on{opacity:1!important;}`;
    document.head.appendChild(s);
    document.addEventListener('load', e => {
      if (e.target.tagName !== 'IMG') return;
      const img = e.target;
      requestAnimationFrame(() => {
        img.classList.add('sk-on');
        const p = img.parentElement;
        if (p) p.style.animation = 'none';
      });
    }, true);
    requestAnimationFrame(() => {
      document.querySelectorAll('img').forEach(img => {
        if (img.complete && !img.classList.contains('sk-on')) {
          img.classList.add('sk-on');
          const p = img.parentElement;
          if (p) p.style.animation = 'none';
        }
      });
    });
  }

  function init(active) {
    injectSeatCSS();
    initTransition();
    injectSkeletonCSS();
    const el = document.getElementById('mh-nav');
    if (el) renderNav(el, active);
    const fel = document.getElementById('mh-footer');
    if (fel) renderFooter(fel);
    if (!document.getElementById('mh-toasts')) {
      const tc = document.createElement('div');
      tc.id = 'mh-toasts';
      document.body.appendChild(tc);
    }
  }

  function toast(msg, type) {
    type = type || 'success';
    const icons = { success: '✓', error: '✕', info: 'ℹ' };
    let container = document.getElementById('mh-toasts');
    if (!container) {
      injectNavCSS();
      container = document.createElement('div');
      container.id = 'mh-toasts';
      document.body.appendChild(container);
    }
    const el = document.createElement('div');
    el.className = `mh-toast ${type}`;
    el.innerHTML = `<span class="mh-toast-icon">${icons[type] || icons.success}</span><span>${msg}</span>`;
    container.appendChild(el);
    requestAnimationFrame(() => el.classList.add('show'));
    setTimeout(() => {
      el.classList.remove('show');
      setTimeout(() => el.remove(), 250);
    }, 3000);
  }

  function feedback() {
    if (document.getElementById('mh-feedback-overlay')) {
      document.getElementById('mh-feedback-overlay').style.display = 'flex';
      return;
    }
    const style = document.createElement('style');
    style.textContent = `
      #mh-feedback-overlay {
        position: fixed; inset: 0; z-index: 9000;
        background: rgba(53,78,99,.35); backdrop-filter: blur(6px);
        display: flex; align-items: center; justify-content: center; padding: 20px;
        animation: mhFbIn .2s ease;
      }
      @keyframes mhFbIn { from { opacity:0 } to { opacity:1 } }
      #mh-feedback-modal {
        background: #fff; border-radius: 20px; width: 100%; max-width: 480px;
        box-shadow: 0 24px 64px rgba(53,78,99,.18); overflow: hidden;
        animation: mhFbSlide .25s ease;
      }
      @keyframes mhFbSlide { from { transform: translateY(16px); opacity:0 } to { transform: translateY(0); opacity:1 } }
      .mhfb-head {
        padding: 24px 28px 0; display: flex; align-items: flex-start; justify-content: space-between;
      }
      .mhfb-title { font-family: 'Literata', Georgia, serif; font-weight: 600; font-size: 22px; color: #354E63; }
      .mhfb-sub { font-size: 13.5px; color: #7A919F; margin-top: 4px; }
      .mhfb-close {
        width: 32px; height: 32px; border-radius: 50%; border: 1.5px solid #B4C3CC;
        background: #fff; color: #7A919F; display: flex; align-items: center; justify-content: center;
        cursor: pointer; transition: all .2s; flex-shrink: 0; font-size: 14px;
      }
      .mhfb-close:hover { border-color: #E8846A; color: #E8846A; }
      .mhfb-body { padding: 20px 28px 28px; }
      .mhfb-field { margin-bottom: 16px; }
      .mhfb-label {
        display: block; font-size: 11.5px; font-weight: 700; text-transform: uppercase;
        letter-spacing: .07em; color: #7A919F; margin-bottom: 7px;
      }
      .mhfb-input {
        width: 100%; padding: 11px 15px; border-radius: 10px;
        border: 1.5px solid rgba(197,227,225,.5); background: #F8F5F2;
        font-family: 'Onest', system-ui, sans-serif; font-size: 14px; color: #354E63;
        outline: none; transition: border-color .2s;
      }
      .mhfb-input:focus { border-color: #E8846A; background: #fff; }
      .mhfb-row { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 16px; }
      .mhfb-chips { display: flex; gap: 7px; flex-wrap: wrap; }
      .mhfb-chip {
        padding: 6px 14px; border-radius: 50px; font-size: 12.5px; font-weight: 500;
        background: #F6E6DE; color: #46627A; border: 1.5px solid transparent;
        cursor: pointer; transition: all .18s; font-family: 'Onest', system-ui, sans-serif;
      }
      .mhfb-chip.sel { background: #FCEAE4; color: #E8846A; border-color: rgba(232,132,106,.3); font-weight: 600; }
      /* Узкий экран: длинная тема «Спор по факту…» занимает строку целиком и переносится
         ровно, остальные кнопки тянутся по ширине строки и выравниваются по высоте. */
      @media (max-width: 480px) {
        .mhfb-chips { align-items: stretch; }
        .mhfb-chip {
          flex: 1 1 auto; display: inline-flex; align-items: center; justify-content: center;
          text-align: center; line-height: 1.3; min-height: 34px;
        }
        .mhfb-chip[data-dispute] { flex-basis: 100%; border-radius: 14px; text-wrap: balance; }
      }
      .mhfb-textarea {
        width: 100%; padding: 11px 15px; border-radius: 10px;
        border: 1.5px solid rgba(197,227,225,.5); background: #F8F5F2;
        font-family: 'Onest', system-ui, sans-serif; font-size: 14px; color: #354E63;
        outline: none; resize: vertical; min-height: 110px; transition: border-color .2s;
      }
      .mhfb-textarea:focus { border-color: #E8846A; background: #fff; }
      .mhfb-btn {
        width: 100%; padding: 13px; border-radius: 10px; border: none;
        background: #E8846A; color: #fff; font-family: 'Onest', system-ui, sans-serif;
        font-size: 15px; font-weight: 700; cursor: pointer; transition: all .2s;
        box-shadow: 0 4px 16px rgba(232,132,106,.28);
      }
      .mhfb-btn:hover { background: #d4704f; transform: translateY(-1px); }
      .mhfb-hint { font-size: 12px; line-height: 1.55; color: #7A919F; margin-top: 6px; }
      .mhfb-hint b { color: #354E63; }
      .mhfb-success { text-align: center; padding: 40px 28px; }
      .mhfb-success-icon { font-size: 48px; margin-bottom: 14px; }
      .mhfb-success-title { font-family: 'Literata', Georgia, serif; font-weight: 600; font-size: 22px; color: #354E63; margin-bottom: 8px; }
      .mhfb-success-text { font-size: 14px; color: #7A919F; line-height: 1.6; }
    `;
    document.head.appendChild(style);

    const overlay = document.createElement('div');
    overlay.id = 'mh-feedback-overlay';
    overlay.innerHTML = `
      <div id="mh-feedback-modal" role="dialog" aria-modal="true" aria-label="Обратная связь">
        <div class="mhfb-head">
          <div>
            <div class="mhfb-title">Написать нам</div>
            <div class="mhfb-sub">Ответим в течение 1 рабочего дня</div>
          </div>
          <button class="mhfb-close" id="mhfb-close-btn" aria-label="Закрыть">✕</button>
        </div>
        <div class="mhfb-body" id="mhfb-body">
          <div class="mhfb-row">
            <div class="mhfb-field">
              <label class="mhfb-label">Имя</label>
              <input class="mhfb-input" id="mhfb-name" type="text" placeholder="Анна Козлова">
            </div>
            <div class="mhfb-field">
              <label class="mhfb-label">Email</label>
              <input class="mhfb-input" id="mhfb-email" type="email" placeholder="anna@company.ru">
            </div>
          </div>
          <div class="mhfb-field">
            <label class="mhfb-label">Тема</label>
            <div class="mhfb-chips" id="mhfb-chips">
              <button class="mhfb-chip sel" data-topic="Вопрос">Вопрос</button>
              <button class="mhfb-chip" data-topic="Спор по мероприятию" data-dispute="1">Спор по факту состоявшегося мероприятия</button>
              <button class="mhfb-chip" data-topic="Жалоба на объект или поставщика">Жалоба</button>
              <button class="mhfb-chip" data-topic="Техническая проблема">Техническая проблема</button>
              <button class="mhfb-chip" data-topic="Предложение">Предложение</button>
            </div>
          </div>
          <div class="mhfb-field" id="mhfb-id-field" hidden>
            <label class="mhfb-label">ID запроса <span style="color:#C7563B">*</span></label>
            <input class="mhfb-input" id="mhfb-reqid" type="text" placeholder="RQ-260714-0031">
            <div class="mhfb-hint" id="mhfb-id-hint"></div>
          </div>
          <div class="mhfb-field">
            <label class="mhfb-label">Сообщение</label>
            <textarea class="mhfb-textarea" id="mhfb-msg" placeholder="Введите ваш вопрос / предложение / комментарий..."></textarea>
          </div>
          <button class="mhfb-btn" id="mhfb-send">Отправить</button>
        </div>
      </div>`;
    document.body.appendChild(overlay);

    function closeFeedback() { overlay.style.display = 'none'; }
    document.getElementById('mhfb-close-btn').addEventListener('click', closeFeedback);
    overlay.addEventListener('click', e => { if (e.target === overlay) closeFeedback(); });
    document.addEventListener('keydown', function esc(e) {
      if (e.key === 'Escape') { closeFeedback(); document.removeEventListener('keydown', esc); }
    });

    /* Спор по мероприятию разбирается только по номеру запроса: без него
       непонятно, какое мероприятие и какие стороны сверять. */
    function syncDispute() {
      const sel = document.querySelector('#mhfb-chips .mhfb-chip.sel');
      const dispute = !!(sel && sel.dataset.dispute);
      const field = document.getElementById('mhfb-id-field');
      field.hidden = !dispute;
      if (dispute) {
        const ids = (typeof ML !== 'undefined' && ML.state && ML.state.requests)
          ? ML.state.requests.map(r => r.id) : [];
        document.getElementById('mhfb-id-hint').innerHTML =
          'Найдите его в личном кабинете, в разделе «История запросов», в шапке каждого запроса.'
          + (ids.length ? ' Например: ' + ids.slice(0, 2).join(', ') + '.' : '')
          + '<br><b>Для спора ID обязателен</b> — без него обращение не разобрать.';
      }
    }

    document.getElementById('mhfb-chips').addEventListener('click', e => {
      const chip = e.target.closest('.mhfb-chip');
      if (!chip) return;
      document.querySelectorAll('#mhfb-chips .mhfb-chip').forEach(c => c.classList.remove('sel'));
      chip.classList.add('sel');
      syncDispute();
    });
    syncDispute();

    const sess = getSession();
    if (sess) {
      document.getElementById('mhfb-name').value = sess.name || '';
      document.getElementById('mhfb-email').value = sess.email || '';
    }

    document.getElementById('mhfb-send').addEventListener('click', () => {
      const name = document.getElementById('mhfb-name').value.trim();
      const email = document.getElementById('mhfb-email').value.trim();
      const msg = document.getElementById('mhfb-msg').value.trim();
      const sel = document.querySelector('#mhfb-chips .mhfb-chip.sel');
      const dispute = !!(sel && sel.dataset.dispute);
      const reqId = (document.getElementById('mhfb-reqid') || {}).value || '';
      if (dispute && !reqId.trim()) {
        toast('Для спора по мероприятию укажите ID запроса', 'error'); return;
      }
      if (!name || !email || !msg) {
        toast('Заполните все обязательные поля', 'error'); return;
      }
      document.getElementById('mhfb-body').innerHTML = `
        <div class="mhfb-success">
          <div class="mhfb-success-icon">✉️</div>
          <div class="mhfb-success-title">Сообщение отправлено!</div>
          <div class="mhfb-success-text">Спасибо, ${name}. Мы свяжемся с вами по адресу ${email} в течение 1 рабочего дня.</div>
        </div>`;
      setTimeout(closeFeedback, 3500);
    });
  }

  /* ══════════════════════════════════════════════════════════════════
     МОДАЛКА САЙТА, ПЕЙВОЛ, РЕКЛАМА, ПОЯСНЕНИЯ ПРОТОТИПА
     Нативные alert/confirm на сайте не используются — только dialog().
     ══════════════════════════════════════════════════════════════════ */

  /**
   * Модальное окно в стиле сайта.
   * @param {{title:string, html:string, icon?:string, actions:Array<{label:string, primary?:boolean, href?:string, onClick?:Function, keep?:boolean}>}} o
   * @returns {Function} close
   */
  function dialog(o) {
    injectNavCSS();
    closeDialog();
    const ovl = document.createElement('div');
    ovl.className = 'mh-dlg-ovl'; ovl.id = 'mh-dlg';
    ovl.innerHTML = `<div class="mh-dlg" role="dialog" aria-modal="true" aria-labelledby="mh-dlg-t">
      <div class="mh-dlg-h"><div>${o.icon ? `<div class="mh-pw-ic">${o.icon}</div>` : ''}
        <div class="mh-dlg-t" id="mh-dlg-t">${o.title}</div></div>
        <button type="button" class="mh-dlg-x" aria-label="Закрыть">✕</button></div>
      <div class="mh-dlg-b">${o.html || ''}</div>
      <div class="mh-dlg-f">${(o.actions || []).map((a, i) => a.href
        ? `<a class="mh-dlg-btn${a.primary ? ' pri' : ''}" href="${a.href}" data-i="${i}">${a.label}</a>`
        : `<button type="button" class="mh-dlg-btn${a.primary ? ' pri' : ''}" data-i="${i}">${a.label}</button>`).join('')}</div>
    </div>`;
    document.body.appendChild(ovl);
    const close = () => closeDialog();
    ovl.addEventListener('click', e => { if (e.target === ovl) close(); });
    ovl.querySelector('.mh-dlg-x').addEventListener('click', close);
    ovl.querySelectorAll('[data-i]').forEach(b => b.addEventListener('click', e => {
      const a = o.actions[+b.dataset.i];
      if (a.onClick) { e.preventDefault(); a.onClick(close); if (!a.keep) close(); }
      else if (!a.href) close();
    }));
    document.addEventListener('keydown', dlgEsc);
    const first = ovl.querySelector('.mh-dlg-btn.pri') || ovl.querySelector('.mh-dlg-btn');
    if (first) setTimeout(() => first.focus(), 30);
    return close;
  }
  function dlgEsc(e) { if (e.key === 'Escape') closeDialog(); }
  function closeDialog() {
    const d = document.getElementById('mh-dlg');
    if (d) d.remove();
    document.removeEventListener('keydown', dlgEsc);
  }
  /** Подтверждение вместо нативного confirm(). */
  function confirmDialog(title, html, okLabel, onOk) {
    return dialog({ title, html, actions: [
      { label: 'Отмена' },
      { label: okLabel || 'Подтвердить', primary: true, onClick: onOk },
    ] });
  }

  /* ── Пейвол: единый ответ на клик по закрытой функции ── */
  const IC_LOCK = '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="10.5" width="16" height="10.5" rx="2.4"/><path d="M8 10.5V7.5a4 4 0 0 1 8 0v3"/></svg>';
  /**
   * @param {'start'|'biz'|'prem'} need  минимальный тариф, где функция открыта
   * @param {string} what  что именно закрыто: «Фильтр по звёздности»
   */
  function paywall(need, what) {
    const T = typeof ML !== 'undefined' ? ML.TARIFFS : {};
    const guest = typeof ML !== 'undefined' && ML.isGuest && ML.isGuest();
    if (guest) {
      return dialog({ icon: IC_LOCK, title: 'Нужна регистрация',
        html: `${what ? `<b>${esc(what)}</b> — ` : ''}доступно зарегистрированным пользователям. Регистрация бесплатная, тариф «${esc((T.start || {}).name || 'СТАРТ')}» подключится сразу.`,
        actions: [{ label: 'Сравнить тарифы', href: 'pricing.html' }, { label: 'Зарегистрироваться', primary: true, href: signupHref() }] });
    }
    const t = T[need] || T.biz || { name: 'БИЗНЕС', key: 'biz' };
    return dialog({ icon: IC_LOCK, title: `Доступно с тарифа «${esc(t.name)}»`,
      html: `${what ? `<b>${esc(what)}</b> — ` : ''}эта возможность открывается на тарифе «${esc(t.name)}»${t.key === 'biz' ? ' и выше' : ''}.
        Сравните тарифы или сразу оформите подписку.`,
      actions: [{ label: 'Сравнить тарифы', href: 'pricing.html' },
        { label: `Перейти на «${esc(t.name)}»`, primary: true, href: `checkout.html?plan=${t.key}` }] });
  }
  /** Атрибут onclick для закрытого элемента: onclick="MH.paywall('biz','…')". */
  const payAttr = (need, what) => `onclick="MH.paywall('${need}','${String(what).replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/"/g, '&quot;')}');return false;"`;

  /** п.46: ПРЕМИУМ на 6 месяцев за баллы — подтверждение, списание, активация; при нехватке — своё состояние. */
  function buyPremium(onDone) {
    if (typeof ML === 'undefined') return;
    const item = ML.premiumItem(), P = ML.state.points;
    const fmt = (n) => n.toLocaleString('ru') + ' Б';
    if (P.free < item.pts) {
      return dialog({ title: 'Недостаточно баллов',
        html: `Для подписки «ПРЕМИУМ» на 6 месяцев нужно <b>${fmt(item.pts)}</b>, на счёте — <b>${fmt(P.free)}</b>.
          Не хватает <b>${fmt(item.pts - P.free)}</b>. Баллы начисляются за состоявшиеся мероприятия и отзывы.`,
        actions: [{ label: 'Закрыть' }, { label: 'Оплатить подписку', primary: true, href: 'checkout.html?plan=prem' }] });
    }
    const active = ML.tariff().key === 'prem' && ML.state.premUntil;
    return dialog({ title: 'ПРЕМИУМ на 6 месяцев за баллы',
      html: `<table style="width:100%;border-collapse:collapse;margin-bottom:10px;font-size:13.5px">
          <tr><td style="padding:6px 0;color:#7A919F">Спишется с баланса</td><td style="text-align:right"><b>${fmt(item.pts)}</b></td></tr>
          <tr><td style="padding:6px 0;color:#7A919F">Останется</td><td style="text-align:right"><b>${fmt(P.free - item.pts)}</b></td></tr></table>
        ${active ? `Текущая подписка действует до <b>${esc(ML.state.premUntil)}</b> — она продлится ещё на 6 месяцев.`
          : 'Тариф «ПРЕМИУМ» включится сразу после подтверждения и будет действовать 6 месяцев.'}
        Заявка не нужна — подписка оформляется мгновенно.`,
      actions: [{ label: 'Отмена' }, { label: active ? 'Продлить за баллы' : 'Подключить за баллы', primary: true, onClick: () => {
        const res = ML.buyPremiumForPoints();
        if (!res.ok) { toast('Не хватает баллов', 'error'); return; }
        toast(`ПРЕМИУМ ${res.extended ? 'продлён' : 'подключён'} до ${res.until}`, 'success');
        if (onDone) onDone(res);
      } }] });
  }

  /** Пометка «Реклама» — одинаковая для баннеров и мест в выдаче. */
  function adMark(cls) { injectNavCSS(); return `<span class="ml-ad${cls ? ' ' + cls : ''}">Реклама</span>`; }



  /* ══════════════════════════════════════════════════════════════════
     ГАЛЕРЕЯ ФОТО С ЛАЙТБОКСОМ
     До пяти фото — сетка целиком. С пятью и больше — пять ячеек, на последней
     счётчик «+N», по клику любая открывается в лайтбоксе со счётчиком «3 / 8».
     ══════════════════════════════════════════════════════════════════ */
  let LB = { urls: [], i: 0, alt: '' };
  function injectGalCSS() {
    if (document.getElementById('mh-gal-style')) return;
    const s = document.createElement('style');
    s.id = 'mh-gal-style';
    s.textContent = `
      .mh-gal { display: grid; grid-template-columns: 2fr 1fr 1fr; grid-template-rows: 1fr 1fr; gap: 8px;
        height: 380px; border-radius: 20px; overflow: hidden; margin-bottom: 26px; }
      .mh-gal.n1 { grid-template-columns: 1fr; grid-template-rows: 1fr; }
      .mh-gal.n2 { grid-template-columns: 2fr 1fr; grid-template-rows: 1fr; }
      .mh-gal.n3, .mh-gal.n4 { grid-template-columns: 2fr 1fr; }
      .mh-gal-c { position: relative; border: none; padding: 0; margin: 0; cursor: zoom-in; overflow: hidden;
        background: #EDF6F5; display: block; width: 100%; height: 100%; }
      .mh-gal-c img { width: 100%; height: 100%; object-fit: cover; display: block; transition: transform .35s; }
      .mh-gal-c:hover img { transform: scale(1.04); }
      .mh-gal-c.main { grid-row: 1 / 3; }
      .mh-gal.n1 .mh-gal-c.main, .mh-gal.n2 .mh-gal-c.main { grid-row: auto; }
      .mh-gal.n4 .mh-gal-c:nth-child(4) { display: none; }
      .mh-gal-more { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center;
        background: rgba(34,50,63,.55); color: #fff; font-family: 'Onest', system-ui, sans-serif; font-size: 22px; font-weight: 700; }
      .mh-gal-count { position: absolute; right: 12px; bottom: 12px; padding: 5px 11px; border-radius: 50px;
        background: rgba(255,255,255,.92); color: #354E63; font-family: 'Onest', system-ui, sans-serif; font-size: 12px; font-weight: 600; }
      @media (max-width: 760px) {
        .mh-gal { height: 240px; grid-template-columns: 1fr 1fr; grid-template-rows: 1fr; }
        .mh-gal .mh-gal-c.main { grid-row: auto; grid-column: 1 / 3; }
        .mh-gal .mh-gal-c:not(.main) { display: none; }
        .mh-gal.n1 .mh-gal-c.main { grid-column: 1 / 3; }
      }
      .mh-lb { position: fixed; inset: 0; z-index: 9600; background: rgba(20,30,38,.92);
        display: flex; align-items: center; justify-content: center; padding: 56px 70px; }
      .mh-lb img { max-width: 100%; max-height: 100%; border-radius: 12px; box-shadow: 0 20px 60px rgba(0,0,0,.4); }
      .mh-lb-btn { position: absolute; width: 48px; height: 48px; border-radius: 50%; border: none;
        background: rgba(255,255,255,.14); color: #fff; font-size: 22px; cursor: pointer; display: flex; align-items: center; justify-content: center; }
      .mh-lb-btn:hover { background: rgba(255,255,255,.26); }
      .mh-lb-btn:disabled { opacity: .3; cursor: default; }
      .mh-lb-prev { left: 14px; top: 50%; transform: translateY(-50%); }
      .mh-lb-next { right: 14px; top: 50%; transform: translateY(-50%); }
      .mh-lb-x { top: 12px; right: 14px; width: 40px; height: 40px; font-size: 16px; }
      .mh-lb-n { position: absolute; top: 20px; left: 50%; transform: translateX(-50%); color: #fff;
        font-family: 'Onest', system-ui, sans-serif; font-size: 14px; font-weight: 600; }
      @media (max-width: 560px) { .mh-lb { padding: 56px 8px 80px; } .mh-lb-prev, .mh-lb-next { top: auto; bottom: 16px; transform: none; } }`;
    document.head.appendChild(s);
  }
  /** Разметка галереи. urls — адреса фото, alt — подпись для первой. */
  function gallery(urls, alt) {
    injectGalCSS();
    const list = (urls || []).filter(Boolean);
    if (!list.length) return '';
    const key = 'g' + Math.random().toString(36).slice(2, 8);
    window.__mhGal = window.__mhGal || {};
    window.__mhGal[key] = { urls: list, alt: alt || '' };
    const shown = list.slice(0, 5);
    const rest = list.length - shown.length;
    return `<div class="mh-gal n${Math.min(shown.length, 5)}">${shown.map((u, i) =>
      `<button type="button" class="mh-gal-c${i === 0 ? ' main' : ''}" onclick="MH.lightbox('${key}',${i})"
        aria-label="Открыть фото ${i + 1} из ${list.length}">
        <img src="${u}" alt="${i === 0 ? esc(alt || '') : ''}" loading="${i === 0 ? 'eager' : 'lazy'}">
        ${i === shown.length - 1 && rest > 0 ? `<span class="mh-gal-more">+${rest}</span>` : ''}
        ${i === 0 && list.length > 1 ? `<span class="mh-gal-count">${list.length} фото</span>` : ''}
      </button>`).join('')}</div>`;
  }
  function lightbox(key, i) {
    const g = (window.__mhGal || {})[key]; if (!g) return;
    injectGalCSS();
    LB = { urls: g.urls, i: i || 0, alt: g.alt };
    let el = document.getElementById('mh-lb');
    if (!el) {
      el = document.createElement('div'); el.id = 'mh-lb'; el.className = 'mh-lb';
      el.setAttribute('role', 'dialog'); el.setAttribute('aria-modal', 'true'); el.setAttribute('aria-label', 'Просмотр фото');
      document.body.appendChild(el);
      el.addEventListener('click', e => { if (e.target === el) lbClose(); });
      document.addEventListener('keydown', lbKey);
    }
    lbDraw();
  }
  function lbDraw() {
    const el = document.getElementById('mh-lb'); if (!el) return;
    const n = LB.urls.length;
    el.innerHTML = `<span class="mh-lb-n">${LB.i + 1} / ${n}</span>
      <button type="button" class="mh-lb-btn mh-lb-x" onclick="MH.lbClose()" aria-label="Закрыть">✕</button>
      <button type="button" class="mh-lb-btn mh-lb-prev" onclick="MH.lbStep(-1)" aria-label="Предыдущее фото" ${LB.i ? '' : 'disabled'}>‹</button>
      <img src="${LB.urls[LB.i]}" alt="${esc(LB.alt)}">
      <button type="button" class="mh-lb-btn mh-lb-next" onclick="MH.lbStep(1)" aria-label="Следующее фото" ${LB.i < n - 1 ? '' : 'disabled'}>›</button>`;
  }
  function lbStep(d) { LB.i = Math.max(0, Math.min(LB.urls.length - 1, LB.i + d)); lbDraw(); }
  function lbKey(e) {
    if (!document.getElementById('mh-lb')) return;
    if (e.key === 'Escape') lbClose();
    if (e.key === 'ArrowRight') lbStep(1);
    if (e.key === 'ArrowLeft') lbStep(-1);
  }
  function lbClose() { const el = document.getElementById('mh-lb'); if (el) el.remove(); document.removeEventListener('keydown', lbKey); }

  /* ══════════════════════════════════════════════════════════════════
     ИКОНКИ СХЕМ РАССАДКИ

     Заглушки: рисуем по полю shape из ML.SEATING. Настоящие иконки
     придут позже — менять нужно будет только SEAT_SHAPES, страницы
     обращаются сюда и ничего о фигурах не знают.

     У каждой иконки title и aria-label с названием схемы: без подписи
     ряд из семи фигур нечитаем.
     ══════════════════════════════════════════════════════════════════ */

  const SEAT_SHAPES = {
    triangle:   '<path d="M12 4.5 20.5 19.5H3.5z"/>',
    square:     '<rect x="4.5" y="4.5" width="15" height="15" rx="1.6"/>',
    u:          '<path d="M6 4.5v8a6 6 0 0 0 12 0v-8" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"/>',
    circle:     '<circle cx="12" cy="12" r="7.6"/>',
    dots:       '<circle cx="7" cy="8" r="2.1"/><circle cx="12" cy="8" r="2.1"/><circle cx="17" cy="8" r="2.1"/>'
                + '<circle cx="7" cy="16" r="2.1"/><circle cx="12" cy="16" r="2.1"/><circle cx="17" cy="16" r="2.1"/>',
    halfcircle: '<path d="M3.6 17.5a8.4 8.4 0 0 1 16.8 0z"/>',
    rect:       '<rect x="3" y="7.6" width="18" height="8.8" rx="1.6"/>',
  };

  function seatingOf(key) {
    if (typeof ML === 'undefined' || !ML.seatingByKey) return null;
    return ML.seatingByKey(key);
  }

  /**
   * Иконка схемы рассадки.
   * @param {string} key  ключ схемы из ML.SEATING
   * @param {object} opts {size, cls, label} — label подставляет свой текст подсказки
   */
  function seatIcon(key, opts) {
    opts = opts || {};
    const s = seatingOf(key);
    const shape = SEAT_SHAPES[(s && s.shape) || ''] || SEAT_SHAPES.square;
    const name = opts.label || (s ? s.l : key);
    const size = opts.size || 18;
    return `<svg class="ml-seat${opts.cls ? ' ' + opts.cls : ''}" width="${size}" height="${size}"`
      + ` viewBox="0 0 24 24" fill="currentColor" role="img"`
      + ` aria-label="${String(name).replace(/"/g, '&quot;')}"><title>${String(name).replace(/</g, '&lt;')}</title>`
      + shape + '</svg>';
  }

  /** Иконка вместе с подписью — для мест, где нужен и текст. */
  function seatIconLabel(key, extra) {
    const s = seatingOf(key);
    return `<span class="ml-seat-pair">${seatIcon(key)}<span>${s ? s.l : key}${extra ? ' ' + extra : ''}</span></span>`;
  }

  /** Компактная легенда: где иконок много подряд, без неё не разобраться. */
  function seatLegend(keys) {
    if (typeof ML === 'undefined' || !ML.SEATING) return '';
    injectSeatCSS();
    const list = (keys && keys.length ? keys : ML.SEATING.map(s => s.k));
    return `<div class="ml-seat-legend">${list.map(k => {
      const s = seatingOf(k);
      return `<span class="ml-legend-i">${seatIcon(k)}<span>${s ? s.l : k}</span></span>`;
    }).join('')}</div>`;
  }

  function injectSeatCSS() {
    if (document.getElementById('ml-seat-style')) return;
    const st = document.createElement('style');
    st.id = 'ml-seat-style';
    st.textContent = `
      .ml-seat { flex-shrink: 0; vertical-align: -3px; }
      .ml-seat-pair { display: inline-flex; align-items: center; gap: 5px; }
      .ml-seat-legend {
        display: flex; flex-wrap: wrap; gap: 6px 16px;
        padding: 10px 14px; margin: 10px 0 0;
        background: rgba(237,246,245,.7); border-radius: 12px;
        font-family: 'Onest', system-ui, sans-serif; font-size: 11.5px; color: #7A919F;
      }
      .ml-legend-i { display: inline-flex; align-items: center; gap: 6px; }
      .ml-legend-i .ml-seat { width: 15px; height: 15px; color: #7A919F; }`;
    document.head.appendChild(st);
  }

  /* ══════════════════════════════════════════════════════════════════
     ЗАМОК ДЛЯ НЕЗАРЕГИСТРИРОВАННЫХ

     Условие ровно одно — ML.tariff().blur. Своих проверок сессии здесь нет:
     уровень guest живёт в модели, страницы к ней и обращаются.

     Размывать и накрывать плашкой один и тот же узел нельзя: filter
     применяется ко всему поддереву, и плашка размылась бы вместе с
     содержимым. Поэтому lock() строит обёртку из двух соседей —
     размытого содержимого и чистой плашки поверх него.
     ══════════════════════════════════════════════════════════════════ */

  function isLocked() {
    return typeof ML !== 'undefined' && !!(ML.tariff && ML.tariff().blur);
  }

  /* Адрес регистрации с возвратом на текущую страницу: гость, читавший
     карточку зала, после входа должен вернуться к ней, а не на главную. */
  function signupHref() {
    const back = location.pathname.split('/').pop() + location.search;
    return 'auth.html?mode=signup&next=' + encodeURIComponent(back);
  }

  function injectLockCSS() {
    if (document.getElementById('ml-lock-style')) return;
    const s = document.createElement('style');
    s.id = 'ml-lock-style';
    s.textContent = `
      .ml-lock { position: relative; }
      .ml-locked {
        filter: blur(5px);
        user-select: none; -webkit-user-select: none;
        pointer-events: none;
      }
      .ml-lock-veil {
        position: absolute; inset: 0; z-index: 2;
        display: flex; align-items: center; justify-content: center;
        padding: 10px;
      }
      .ml-lock-box {
        max-width: 100%; box-sizing: border-box; text-align: center;
        background: rgba(255,255,255,.94);
        border: 1px solid rgba(197,227,225,.65); border-radius: 14px;
        box-shadow: 0 6px 24px rgba(53,78,99,.12);
        padding: 13px 16px;
      }
      .ml-lock-t {
        font-family: 'Onest', system-ui, sans-serif;
        font-size: 12.5px; line-height: 1.45; font-weight: 600; color: #354E63;
        margin-bottom: 10px;
      }
      .ml-lock-b {
        display: inline-block; white-space: nowrap;
        padding: 9px 20px; border-radius: 50px;
        background: #E98667; color: #fff;
        font-family: 'Onest', system-ui, sans-serif;
        font-size: 12.5px; font-weight: 600; text-decoration: none;
        box-shadow: 0 4px 14px rgba(233,134,103,.28);
      }
      .ml-lock-b:hover { background: #D97757; }

      /* Мелкие значения внутри карточек: размываем без плашки, иначе
         на экране выдачи получится частокол из кнопок. */
      .ml-blur {
        display: inline-block;
        filter: blur(5px);
        user-select: none; -webkit-user-select: none;
        pointer-events: none;
      }

      /* Полоса-объяснение на страницу, где размыты только мелкие значения. */
      .ml-lock-bar {
        display: flex; align-items: center; justify-content: space-between;
        gap: 14px; flex-wrap: wrap;
        padding: 13px 18px; margin-bottom: 14px;
        background: #FCEAE4; border: 1px solid rgba(233,134,103,.35); border-radius: 14px;
        font-family: 'Onest', system-ui, sans-serif;
        font-size: 12.5px; line-height: 1.5; color: #354E63;
      }

      /* Экран вместо содержимого — для разделов, закрытых гостю целиком. */
      .ml-lock-screen {
        max-width: 560px; margin: 40px auto; text-align: center;
        background: #fff; border: 1px solid rgba(197,227,225,.5); border-radius: 20px;
        box-shadow: 0 8px 40px rgba(53,78,99,.09);
        padding: 40px 28px;
        font-family: 'Onest', system-ui, sans-serif;
      }
      .ml-lock-screen h2 {
        font-family: 'Literata', Georgia, serif; font-weight: 600;
        font-size: 24px; color: #354E63; margin-bottom: 10px;
      }
      .ml-lock-screen p { font-size: 14px; line-height: 1.65; color: #7A919F; margin-bottom: 22px; }

      @media (max-width: 560px) {
        .ml-lock-box { padding: 10px 12px; }
        .ml-lock-t { font-size: 11.5px; margin-bottom: 8px; }
        .ml-lock-b { padding: 8px 15px; font-size: 11.5px; }
        .ml-lock-screen { padding: 28px 18px; margin: 24px auto; }
      }`;
    document.head.appendChild(s);
  }

  /* Оборачивает разметку блока: размытое содержимое + плашка поверх.
     Если уровень доступа не гостевой — возвращает разметку как есть. */
  function lock(html, text) {
    if (!isLocked()) return html;
    injectLockCSS();
    return `<div class="ml-lock">
      <div class="ml-locked" aria-hidden="true">${html}</div>
      <div class="ml-lock-veil">
        <div class="ml-lock-box">
          <div class="ml-lock-t">${text || 'Доступно после регистрации'}</div>
          <a class="ml-lock-b" href="${signupHref()}">Зарегистрироваться</a>
        </div>
      </div>
    </div>`;
  }

  /* Размытие без плашки — для отдельных значений в карточках. */
  function blurOnly(html) {
    if (!isLocked()) return html;
    injectLockCSS();
    return `<span class="ml-blur" aria-hidden="true">${html}</span>`;
  }

  /* Одна полоса с объяснением на страницу. */
  function lockBar(text) {
    if (!isLocked()) return '';
    injectLockCSS();
    return `<div class="ml-lock-bar">
      <span>${text}</span>
      <a class="ml-lock-b" href="${signupHref()}">Зарегистрироваться</a>
    </div>`;
  }

  /* Экран вместо содержимого раздела. */
  function lockScreen(title, text) {
    injectLockCSS();
    return `<div class="ml-lock-screen">
      <h2>${title}</h2>
      <p>${text}</p>
      <a class="ml-lock-b" href="${signupHref()}">Зарегистрироваться</a>
    </div>`;
  }

  /* ══════════════════════════════════════════════════════════════════
     ДЕМО-ПАНЕЛЬ, УДАЛИТЬ ПЕРЕД ПРОДАКШЕНОМ

     Полоса под основной шапкой для показа клиенту: мгновенно переключает
     уровень доступа и роль. Разметка, стили и обработчики держатся здесь
     вместе, чтобы удаление свелось к вырезанию одного блока и одной
     константы DEMO наверху файла. Единственная внешняя привязка —
     вызов mountDemo() в renderNav.
     ══════════════════════════════════════════════════════════════════ */

  const DEMO_LEVELS = [
    { k: 'guest', l: 'Гость' },
    { k: 'start', l: 'Старт' },
    { k: 'biz',   l: 'Бизнес' },
    { k: 'prem',  l: 'Премиум' },
  ];
  const DEMO_ROLES = [
    { k: 'user', l: 'Пользователь',
      ic: '<path d="M12 12a4 4 0 100-8 4 4 0 000 8zM4.5 20a7.5 7.5 0 0115 0"/>' },
    { k: 'venue', l: 'Площадка',
      ic: '<path d="M3 20h18M5 20V9l7-5 7 5v11M9.5 20v-5h5v5"/>' },
    { k: 'supplier', l: 'Поставщик',
      ic: '<path d="M3 8.5 12 4l9 4.5-9 4.5-9-4.5zM3 12.5 12 17l9-4.5M3 16.5 12 21l9-4.5"/>' },
  ];

  function demoCSS() {
    return `
      .mh-demo {
        position: fixed; top: 64px; left: 0; right: 0; z-index: 600;
        display: flex; align-items: center; flex-wrap: wrap; gap: 8px 22px;
        padding: 7px 36px;
        background: #22323F; border-bottom: 1px solid #16232C;
        font-family: 'Onest', system-ui, sans-serif; font-size: 11.5px; color: #9FB4C1;
      }
      .mh-demo-g { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; }
      .mh-demo-l {
        text-transform: uppercase; letter-spacing: .09em;
        font-size: 9.5px; font-weight: 700; color: #5E7688;
      }
      .mh-demo button {
        border: 1px solid transparent; background: none;
        padding: 4px 10px; border-radius: 50px;
        font-family: inherit; font-size: 11.5px; font-weight: 500;
        color: #C2D2DC; text-decoration: none; cursor: pointer;
        transition: background .15s, color .15s, border-color .15s;
      }
      .mh-demo button:hover { background: #2E4252; color: #fff; }
      .mh-demo button.on {
        background: #E98667; border-color: #E98667; color: #fff; font-weight: 600;
      }
      /* Сегментированный переключатель ролей: одна дорожка, активный сегмент
         подсвечен. В продукте роль у человека одна — это демо-режим. */
      .mh-seg {
        display: inline-flex; align-items: stretch; gap: 2px;
        padding: 2px; border-radius: 8px; background: #1A2833; border: 1px solid #16232C;
      }
      .mh-seg-i {
        display: inline-flex; align-items: center; gap: 6px;
        padding: 5px 11px; border-radius: 6px;
        font-family: inherit; font-size: 11.5px; font-weight: 500;
        color: #9FB4C1; text-decoration: none; white-space: nowrap;
        transition: background .15s, color .15s;
      }
      .mh-seg-i svg { width: 14px; height: 14px; flex-shrink: 0; }
      .mh-seg-i:hover { background: #2E4252; color: #fff; }
      .mh-seg-i.on { background: #E98667; color: #fff; font-weight: 600; }
      @media (max-width: 900px) {
        .mh-demo { padding: 6px 14px; gap: 6px 14px; }
      }
      @media (max-width: 560px) {
        .mh-seg-i span { display: none; }
        .mh-seg-i { padding: 6px 10px; }
      }`;
  }

  function demoHTML() {
    const cur = (typeof ML !== 'undefined' && ML.tariff) ? ML.tariff().key : '';
    const page = location.pathname.split('/').pop();
    const role = new URLSearchParams(location.search).get('role');
    const lv = DEMO_LEVELS.map(x =>
      `<button type="button" data-demo-level="${x.k}"${cur === x.k ? ' class="on"' : ''}>${x.l}</button>`).join('');
    const sessRole = getSession() ? sessionRole() : '';
    const onRole = page === 'dashboard.html' ? (role || sessRole) : sessRole;
    /* Роли — отдельные аккаунты. Переключатель входит в демо-аккаунт нужной
       роли; в рабочей версии его нет, у пользователя только своя роль. */
    const rl = DEMO_ROLES.map(x =>
      `<a class="mh-seg-i${onRole === x.k ? ' on' : ''}" href="dashboard.html?role=${x.k}" onclick="MH.demoRole('${x.k}');return false;">
         <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"
              stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${x.ic}</svg>
         <span>${x.l}</span>
       </a>`).join('');
    return `<div class="mh-demo" id="mh-demo">
      <span class="mh-demo-l">Уровень доступа</span>
      <div class="mh-demo-g">${lv}</div>
      <span class="mh-demo-l">Роль</span>
      <div class="mh-seg">${rl}</div>
    </div>`;
  }

  /* Шапка фиксированная, поэтому отступ сверху у body считаем по факту:
     на узком экране полоса переносится и становится выше. */
  function demoOffset() {
    const bar = document.getElementById('mh-demo');
    if (!bar) return;
    document.body.style.paddingTop = (64 + bar.offsetHeight) + 'px';
  }

  function mountDemo(targetEl) {
    if (!DEMO) return '';
    if (!document.getElementById('mh-demo-style')) {
      const s = document.createElement('style');
      s.id = 'mh-demo-style';
      s.textContent = demoCSS();
      document.head.appendChild(s);
    }
    return demoHTML();
  }

  /* Перезагрузка теряет позицию прокрутки, и на длинной выдаче экран улетал
     в начало. Запоминаем её перед перезагрузкой и возвращаем после — человек
     остаётся на том же месте и видит, как меняется то, на что он смотрит.
     В кабинете прокручивается не окно, а колонка .main, поэтому сохраняем обе. */
  const DEMO_SCROLL = 'mh_demo_scroll';

  function saveDemoScroll() {
    const main = document.querySelector('.main');
    try {
      sessionStorage.setItem(DEMO_SCROLL, JSON.stringify({
        y: window.scrollY || 0,
        m: main ? main.scrollTop : 0,
      }));
    } catch (e) { /* приватный режим — просто не восстановим */ }
  }

  function restoreDemoScroll() {
    let saved = null;
    try { saved = JSON.parse(sessionStorage.getItem(DEMO_SCROLL) || 'null'); } catch (e) { saved = null; }
    if (!saved) return;
    const apply = () => {
      if (saved.y) window.scrollTo(0, saved.y);
      const main = document.querySelector('.main');
      if (main && saved.m) main.scrollTop = saved.m;
    };
    /* Содержимое страниц собирается скриптами, а картинки догружаются позже
       и двигают раскладку, поэтому возвращаем позицию дважды. */
    const run = () => { apply(); setTimeout(() => { apply(); sessionStorage.removeItem(DEMO_SCROLL); }, 220); };
    if (document.readyState === 'complete') requestAnimationFrame(run);
    else window.addEventListener('load', () => requestAnimationFrame(run));
  }

  function bindDemo() {
    if (!DEMO) return;
    const bar = document.getElementById('mh-demo');
    if (!bar) return;
    bar.querySelectorAll('[data-demo-level]').forEach(b => {
      b.addEventListener('click', () => {
        if (typeof ML === 'undefined' || !ML.setTariff) return;
        ML.setTariff(b.dataset.demoLevel);
        saveDemoScroll();
        location.reload();     // состояние уже в localStorage, страница перерисовывается целиком
      });
    });
    restoreDemoScroll();
    demoOffset();
    window.addEventListener('resize', demoOffset);
  }

  /** Демо: войти в демо-аккаунт роли и открыть его кабинет. */
  function demoRole(role, page) {
    const acc = accounts().find(a => a.role === role && a.email === DEMO_ACCOUNTS[0].email)
      || DEMO_ACCOUNTS.find(a => a.role === role);
    if (!acc) return;
    const prev = getSession();
    setSession({ ...sessionFor(acc), premium: !!(prev && prev.premium) });
    if (typeof ML !== 'undefined' && ML.isGuest && ML.isGuest()) ML.setTariff('start');
    window.location.href = 'dashboard.html?role=' + role + (page ? '&page=' + encodeURIComponent(page) : '');
  }

  /* ══════ конец демо-блока ══════ */

  return {
    getSession, setSession, clearSession, renderNav, init, toast, go,
    renderFooter, gallery, lightbox, lbStep, lbClose, sessionRole, ROLE_NAMES, DEMO_ACCOUNTS, CABINET_MENU, findAccount, register, login, resetPassword,
    sessionFor, logout, demoRole, buyPremium, dialog, closeDialog, confirmDialog, paywall, payAttr, adMark,
    getFavs, toggleFav, isFav, feedback,
    isLocked, lock, blurOnly, lockBar, lockScreen,
    seatIcon, seatIconLabel, seatLegend,
  };
})();

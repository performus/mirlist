/* МАЙСЛИСТ shared utilities — auth state + nav injection */
const MH = (() => {
  /* ДЕМО-ПАНЕЛЬ, УДАЛИТЬ ПЕРЕД ПРОДАКШЕНОМ — единственный выключатель.
     false → панель не отрисовывается ни на одной странице и в разметке
     от неё ничего не остаётся. Правки по файлам для этого не нужны. */
  const DEMO = true;

  const KEY = 'mh_session';
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

  function injectNavCSS() {
    if (document.getElementById('mh-nav-style')) return;
    const s = document.createElement('style');
    s.id = 'mh-nav-style';
    s.textContent = `
      .mh-header {
        position: fixed; top: 0; left: 0; right: 0; height: 64px; z-index: 500;
        display: flex; align-items: center; padding: 0 36px;
        background: rgba(255,255,255,.85); backdrop-filter: blur(20px); -webkit-backdrop-filter: blur(20px);
        box-shadow: 0 2px 24px rgba(53,78,99,.07);
        font-family: 'Onest', system-ui, sans-serif;
      }
      .mh-logo {
        text-decoration: none; white-space: nowrap; margin-right: 40px; flex-shrink: 0;
        display: flex; align-items: center;
      }
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
        padding: 16px 24px 24px; z-index: 499;
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

      @media (max-width: 860px) {
        .mh-nav { display: none !important; }
        .mh-divider { display: none !important; }
        .mh-right { display: none !important; }
        .mh-burger { display: flex !important; }
        .mh-header { padding: 0 14px; }
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
      const pts = (!guest && typeof ML !== 'undefined' && ML.state && ML.state.points)
        ? ML.state.points.free : null;
      const backNext = encodeURIComponent(location.pathname.split('/').pop() + location.search);
      return `${guest
        ? `<a class="mh-login" href="auth.html?next=${backNext}">Войти</a>`
        : pts !== null
        ? `<a class="mh-points" href="bonus.html" title="Доступные баллы">${pts.toLocaleString('ru')} Б</a>` : ''}
      ${isPrem() ? `<span class="mh-prem-mark" title="Тариф «ПРЕМИУМ»">${IC_DIAMOND}</span>` : ''}
      <a class="mh-avatar-wrap" href="dashboard.html">
        <div class="mh-avatar">${session.initials || 'АК'}</div>
        <span class="mh-uname">${session.name || 'Профиль'}</span>
        ${session.premium ? '<span class="mh-prem-badge">★ Premium</span>' : ''}
      </a>`;
    }
    const _next = encodeURIComponent(location.pathname.split('/').pop() + location.search);
    return `<a class="mh-prem" href="pricing.html">Тарифы</a>
      <a class="mh-login" href="auth.html?next=${_next}">Войти</a>
      <a class="mh-cta" href="auth.html?mode=signup">Регистрация</a>`;
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
    ];
    const navLinks = links.map(l =>
      `<a href="${l.href}"${active === l.key ? ' class="active"' : ''}>${l.label}</a>`
    ).join('');

    const drawerLinks = links.map(l =>
      `<a href="${l.href}"${active === l.key ? ' class="active"' : ''}>${l.label}</a>`
    ).join('');
    const drawerRight = session
      ? `<div class="mh-drawer-sep"></div>
         <a href="dashboard.html" style="text-transform:none;letter-spacing:0;font-size:14px;">👤 ${session.name || 'Профиль'}</a>`
      : `<div class="mh-drawer-sep"></div>
         <a href="pricing.html" style="text-transform:none;letter-spacing:0;font-size:14px;">Тарифы</a>
         <a href="${'auth.html?next=' + encodeURIComponent(location.pathname.split('/').pop() + location.search)}" style="text-transform:none;letter-spacing:0;font-size:14px;">Войти</a>
         <a class="mh-drawer-cta" href="auth.html?mode=signup">Регистрация</a>`;

    targetEl.innerHTML = `
      <header class="mh-header">
        <a class="mh-logo" href="homepage.html"><img src="../assets/logo.svg" alt="МАЙСЛИСТ" height="24" style="display:block"></a>
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

  function renderFooter(el) {
    if (document.getElementById('mh-ft-style')) return;
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

    const ICON_MAIL = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="20" height="16" x="2" y="4" rx="2"/><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/></svg>`;
    const ICON_PHONE = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.11 12 19.79 19.79 0 0 1 1.09 3.18 2 2 0 0 1 3.06 1h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/></svg>`;
    const ICON_VK = `<svg width="20" height="20" fill="currentColor" viewBox="0 0 32 20" xmlns="http://www.w3.org/2000/svg"><path d="M17.0871 18.3783C17.8777 18.3783 18.201 17.8893 18.1919 17.2762C18.1516 14.9672 19.1188 13.7242 20.8649 15.3442C22.7966 17.1365 23.1965 18.3783 25.5424 18.3783H29.6967C30.7456 18.3783 31.1584 18.0651 31.1584 17.5737C31.1584 16.5342 29.3137 14.6998 27.7506 13.3532C25.5618 11.4682 25.4593 11.4237 27.3443 9.15446C29.6824 6.33721 32.741 2.72742 30.0355 2.72742H24.8673C23.8651 2.72742 23.7924 3.25136 23.4354 4.03186C22.1436 6.85874 19.6887 10.5203 18.7566 9.96024C17.7816 9.37608 18.2282 7.0623 18.3022 3.62354C18.3217 2.71537 18.3165 2.09266 16.821 1.76986C16.0044 1.59522 15.2099 1.52295 14.4725 1.52295C11.5217 1.52295 9.48605 2.67081 10.6428 2.87075C12.6823 3.22366 12.4862 7.31764 12.0111 9.0858C11.1828 12.1644 8.0697 6.64796 6.77279 3.90057C6.45992 3.24052 6.36385 2.72742 5.24738 2.72742H1.02169C0.382973 2.72742 0 2.92013 0 3.34892C0 4.07401 3.84272 11.4429 7.51147 15.1166C11.0893 18.6999 14.6257 18.3783 17.0871 18.3783Z"/></svg>`;
    const ICON_TG = `<svg width="20" height="20" fill="currentColor" viewBox="0 0 26 22" xmlns="http://www.w3.org/2000/svg"><path transform="translate(-59 0)" d="M82.7739 0.175812C79.3485 1.49208 64.6608 7.13658 60.6026 8.67497C57.8809 9.66037 59.4742 10.5843 59.4742 10.5843C59.4742 10.5843 61.7974 11.3233 63.7891 11.8776C65.7805 12.4319 66.8426 11.8161 66.8426 11.8161L76.2023 5.96521C79.5214 3.87122 78.7249 5.59559 77.9281 6.33483C76.2023 7.93625 73.3479 10.4611 70.9581 12.4936C69.896 13.3558 70.4269 14.0948 70.8919 14.4644C72.6176 15.8194 77.3309 18.5909 77.5962 18.7756C78.9985 19.6966 81.7569 21.0225 82.1764 18.2213L83.836 8.55203C84.3671 5.28796 84.8981 2.27006 84.9643 1.40787C85.1636 -0.686373 82.7739 0.175812 82.7739 0.175812Z"/></svg>`;

    el.innerHTML = `
      <footer class="mh-footer">
        <div class="mh-ft-main">
          <div class="mh-ft-brand">
            <div class="mh-ft-logo"><img src="../assets/logo.svg" alt="МАЙСЛИСТ" height="20" style="display:block"></div>
            <p>Умный поиск и подбор залов под мероприятие. B2B-платформа для MICE- и Event-менеджеров и их подрядчиков.</p>
            <div class="mh-ft-contacts">
              <a class="mh-ft-contact" href="mailto:info@micelist.ru">${ICON_MAIL} info@micelist.ru</a>
              <a class="mh-ft-contact" href="tel:+78005553535">${ICON_PHONE} +7 (800) 555-35-35</a>
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
      .mh-demo-note { margin-left: auto; font-size: 10.5px; color: #5E7688; }
      @media (max-width: 900px) {
        .mh-demo { padding: 6px 14px; gap: 6px 14px; }
        .mh-demo-note { margin-left: 0; width: 100%; }
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
    const rl = DEMO_ROLES.map(x =>
      `<a class="mh-seg-i${page === 'dashboard.html' && role === x.k ? ' on' : ''}" href="dashboard.html?role=${x.k}">
         <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"
              stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${x.ic}</svg>
         <span>${x.l}</span>
       </a>`).join('');
    return `<div class="mh-demo" id="mh-demo">
      <span class="mh-demo-l">Уровень доступа</span>
      <div class="mh-demo-g">${lv}</div>
      <span class="mh-demo-l">Роль</span>
      <div class="mh-seg">${rl}</div>
      <span class="mh-demo-note">Тестовая панель для демонстрации — в рабочей версии её не будет</span>
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

  /* ══════ конец демо-блока ══════ */

  return {
    getSession, setSession, clearSession, renderNav, init, toast, go,
    getFavs, toggleFav, isFav, feedback,
    isLocked, lock, blurOnly, lockBar, lockScreen,
    seatIcon, seatIconLabel, seatLegend,
  };
})();

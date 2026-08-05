/* MirHub shared utilities — auth state + nav injection */
const MH = (() => {
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
  function clearSession() { localStorage.removeItem(KEY); }

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
        font-family: 'Outfit', 'Inter', sans-serif;
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
        font-family: 'Outfit', 'Inter', sans-serif; font-size: 13.5px; font-weight: 500;
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

  function buildRight(session) {
    if (session) {
      // Баллы рядом с кабинетом — из модели, если она подключена на странице
      const pts = (typeof ML !== 'undefined' && ML.state && ML.state.points)
        ? ML.state.points.free : null;
      return `${pts !== null
        ? `<a class="mh-points" href="bonus.html" title="Доступные баллы">${pts.toLocaleString('ru')} Б</a>` : ''}
      <a class="mh-avatar-wrap" href="dashboard.html">
        <div class="mh-avatar">${session.initials || 'АК'}</div>
        <span class="mh-uname">${session.name || 'Профиль'}</span>
        ${session.premium ? '<span class="mh-prem-badge">★ Premium</span>' : ''}
      </a>`;
    }
    const _next = encodeURIComponent(location.pathname.split('/').pop() + location.search);
    return `<a class="mh-prem" href="pricing.html"><span class="star">⭐</span> Премиум</a>
      <a class="mh-login" href="auth.html?next=${_next}">Войти</a>
      <a class="mh-cta" href="auth.html?mode=venue">Разместить площадку</a>`;
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
         <a href="pricing.html" style="text-transform:none;letter-spacing:0;font-size:14px;">⭐ Премиум</a>
         <a href="${'auth.html?next=' + encodeURIComponent(location.pathname.split('/').pop() + location.search)}" style="text-transform:none;letter-spacing:0;font-size:14px;">Войти</a>
         <a class="mh-drawer-cta" href="auth.html?mode=venue">Разместить площадку</a>`;

    targetEl.innerHTML = `
      <header class="mh-header">
        <a class="mh-logo" href="homepage.html"><img src="../assets/logo.svg" alt="МирХАБ" height="24" style="display:block"></a>
        <nav class="mh-nav">${navLinks}</nav>
        <div class="mh-divider"></div>
        <div class="mh-right">${buildRight(session)}</div>
        <button class="mh-burger" id="mh-burger" aria-label="Меню">
          <span></span><span></span><span></span>
        </button>
      </header>
      <div class="mh-drawer" id="mh-drawer">
        ${drawerLinks}${drawerRight}
      </div>`;

    document.body.classList.add('has-mh-nav');

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
        font-family: 'Outfit', 'Inter', sans-serif; color: #7A919F;
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
            <div class="mh-ft-logo"><img src="../assets/logo.svg" alt="МирХАБ" height="20" style="display:block"></div>
            <p>В2В маркетплейс площадок для деловых мероприятий в России</p>
            <div class="mh-ft-contacts">
              <a class="mh-ft-contact" href="mailto:info@mirhub.ru">${ICON_MAIL} info@mirhub.ru</a>
              <a class="mh-ft-contact" href="tel:+78005553535">${ICON_PHONE} +7 (800) 555-35-35</a>
            </div>
          </div>
          <div class="mh-ft-col">
            <h4>Платформа</h4>
            <a href="search.html">Подбор площадок</a>
            <a href="suppliers.html">Поставщики</a>
            <a href="bonus.html">Бонусная программа</a>
            <a href="pricing.html">Тарифы</a>
          </div>
          <div class="mh-ft-col">
            <h4>Размещение</h4>
            <a href="list-venue.html">Разместить площадку</a>
            <a href="for-organizers.html">Агентствам</a>
            <a href="support.html" class="bold">Поддержка и арбитраж</a>
          </div>
          <div class="mh-ft-col">
            <h4>Поддержка</h4>
            <a href="support.html">Написать в поддержку</a>
            <a href="mailto:info@mirhub.ru">Контакты</a>
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
          <span>© 2026 Мирхаб. Рынок открыт.</span>
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
      .mhfb-title { font-family: 'DM Serif Display', serif; font-size: 22px; color: #354E63; }
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
        font-family: 'Outfit', sans-serif; font-size: 14px; color: #354E63;
        outline: none; transition: border-color .2s;
      }
      .mhfb-input:focus { border-color: #E8846A; background: #fff; }
      .mhfb-row { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 16px; }
      .mhfb-chips { display: flex; gap: 7px; flex-wrap: wrap; }
      .mhfb-chip {
        padding: 6px 14px; border-radius: 50px; font-size: 12.5px; font-weight: 500;
        background: #F6E6DE; color: #46627A; border: 1.5px solid transparent;
        cursor: pointer; transition: all .18s; font-family: 'Outfit', sans-serif;
      }
      .mhfb-chip.sel { background: #FCEAE4; color: #E8846A; border-color: rgba(232,132,106,.3); font-weight: 600; }
      .mhfb-textarea {
        width: 100%; padding: 11px 15px; border-radius: 10px;
        border: 1.5px solid rgba(197,227,225,.5); background: #F8F5F2;
        font-family: 'Outfit', sans-serif; font-size: 14px; color: #354E63;
        outline: none; resize: vertical; min-height: 110px; transition: border-color .2s;
      }
      .mhfb-textarea:focus { border-color: #E8846A; background: #fff; }
      .mhfb-btn {
        width: 100%; padding: 13px; border-radius: 10px; border: none;
        background: #E8846A; color: #fff; font-family: 'Outfit', sans-serif;
        font-size: 15px; font-weight: 700; cursor: pointer; transition: all .2s;
        box-shadow: 0 4px 16px rgba(232,132,106,.28);
      }
      .mhfb-btn:hover { background: #d4704f; transform: translateY(-1px); }
      .mhfb-success { text-align: center; padding: 40px 28px; }
      .mhfb-success-icon { font-size: 48px; margin-bottom: 14px; }
      .mhfb-success-title { font-family: 'DM Serif Display', serif; font-size: 22px; color: #354E63; margin-bottom: 8px; }
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
              <button class="mhfb-chip" data-topic="Техническая проблема">Техническая проблема</button>
              <button class="mhfb-chip" data-topic="Предложение">Предложение</button>
              <button class="mhfb-chip" data-topic="Другое">Другое</button>
            </div>
          </div>
          <div class="mhfb-field">
            <label class="mhfb-label">Сообщение</label>
            <textarea class="mhfb-textarea" id="mhfb-msg" placeholder="Опишите ваш вопрос или предложение..."></textarea>
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

    document.getElementById('mhfb-chips').addEventListener('click', e => {
      const chip = e.target.closest('.mhfb-chip');
      if (!chip) return;
      document.querySelectorAll('#mhfb-chips .mhfb-chip').forEach(c => c.classList.remove('sel'));
      chip.classList.add('sel');
    });

    const sess = getSession();
    if (sess) {
      document.getElementById('mhfb-name').value = sess.name || '';
      document.getElementById('mhfb-email').value = sess.email || '';
    }

    document.getElementById('mhfb-send').addEventListener('click', () => {
      const name = document.getElementById('mhfb-name').value.trim();
      const email = document.getElementById('mhfb-email').value.trim();
      const msg = document.getElementById('mhfb-msg').value.trim();
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

  return { getSession, setSession, clearSession, renderNav, init, toast, go, getFavs, toggleFav, isFav, feedback };
})();

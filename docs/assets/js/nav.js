// frontend/assets/js/nav.js
(function(){
  function escapeHtml(s){
    return String(s ?? '').replace(/[&<>"']/g, (c)=>({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
  }
  function getUser(){
    try{ return (window.getAuthUser && getAuthUser()) || null; }catch(_){ return null; }
  }
  function isAuthed(){ return !!getUser(); }
function activeClass(route){
  const p = (location.pathname || '/').replace(/\/+$/,'') || '/';
  return p === route ? 'active' : '';
}

function isAuthPage(){
  const parts = (location.pathname || '').toLowerCase().split('/').filter(Boolean);
  const last = (parts[parts.length - 1] || '').trim();
  return last === 'login' || last === 'login.html' || last === 'register' || last === 'register.html';
}


  function settingsIcon(){
    // Minimal "gear" icon
    return `
      <svg class="nav-icon" viewBox="0 0 24 24" aria-hidden="true">
        <path d="M12 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7z"></path>
        <path d="M19.4 15a7.8 7.8 0 0 0 .1-1 7.8 7.8 0 0 0-.1-1l2-1.6a.6.6 0 0 0 .14-.75l-1.9-3.3a.6.6 0 0 0-.73-.26l-2.3.9a7.2 7.2 0 0 0-1.7-1l-.3-2.4a.6.6 0 0 0-.6-.5h-3.8a.6.6 0 0 0-.6.5l-.3 2.4a7.2 7.2 0 0 0-1.7 1l-2.3-.9a.6.6 0 0 0-.73.26l-1.9 3.3a.6.6 0 0 0 .14.75L4.6 13a7.8 7.8 0 0 0-.1 1 7.8 7.8 0 0 0 .1 1l-2 1.6a.6.6 0 0 0-.14.75l1.9 3.3a.6.6 0 0 0 .73.26l2.3-.9a7.2 7.2 0 0 0 1.7 1l.3 2.4a.6.6 0 0 0 .6.5h3.8a.6.6 0 0 0 .6-.5l.3-2.4a7.2 7.2 0 0 0 1.7-1l2.3.9a.6.6 0 0 0 .73-.26l1.9-3.3a.6.6 0 0 0-.14-.75L19.4 15z"></path>
      </svg>`;
  }

  function userIcon(){
    // Outline avatar icon (like image reference)
    return `
      <svg class="nav-icon" viewBox="0 0 24 24" aria-hidden="true">
        <path d="M20 21a8 8 0 0 0-16 0"></path>
        <path d="M12 13a4 4 0 1 0-4-4 4 4 0 0 0 4 4z"></path>
      </svg>`;
  }

  function themeToggleMarkup(){
    return `
      <button id="theme-toggle" class="theme-toggle" type="button" aria-label="Toggle theme" title="Toggle theme">
        <span class="theme-toggle-track">
          <span class="theme-toggle-icon sun" aria-hidden="true">☀</span>
          <span class="theme-toggle-icon moon" aria-hidden="true">☾</span>
          <span class="theme-toggle-thumb" aria-hidden="true"></span>
        </span>
      </button>`;
  }

  function renderNavbar(){
    const mount = document.getElementById('app-navbar');
    if(!mount) return;

    const authed = isAuthed();
    const user = getUser();
    const displayName = authed ? (user.name || user.full_name || user.email || 'Akun') : 'Masuk';

    const authPage = isAuthPage();

    mount.innerHTML = `
      <nav class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div class="flex items-center justify-between h-16">
          <div class="flex-shrink-0 text-xl font-bold text-blue-400">
            Home Face Guard
          </div>

          <div class="flex items-center gap-2 md:gap-4">
            ${authPage ? '' : `
              <div class="flex space-x-1 md:space-x-2">
                <a href="index.html" class="nav-link px-3 py-2 text-sm font-medium ${activeClass('index.html')}">Dashboard</a>
                <a href="log.html" class="nav-link px-3 py-2 text-sm font-medium ${activeClass('log.html')}">Log</a>
              </div>
            `}

            ${themeToggleMarkup()}

            ${(authed && !authPage) ? `
              <a href="akun.html" class="icon-btn ${activeClass('akun.html')}" title="Pengaturan">
                ${settingsIcon()}
              </a>
            ` : ''}

            <div class="relative">
              <button id="user-menu-btn" class="icon-btn" type="button" aria-haspopup="menu" aria-expanded="false" title="${escapeHtml(displayName)}">
                ${userIcon()}
              </button>

              <div id="user-menu" class="menu hidden" role="menu" aria-label="User menu">
                ${authed ? `
                  <div class="menu-header">
                    <div class="menu-title">${escapeHtml(displayName)}</div>
                    ${user?.email ? `<div class="menu-sub">${escapeHtml(user.email)}</div>` : ``}
                  </div>
                  <a class="menu-item" href="akun.html">Pengaturan</a>
                  <button id="logout-btn" class="menu-item danger" type="button">Logout</button>
                ` : `
                  <div class="menu-header">
                    <div class="menu-title">Belum Login</div>
                    <div class="menu-sub">Silakan masuk</div>
                  </div>
                  <a class="menu-item" href="login.html">Login</a>
                  <a class="menu-item" href="register.html">Registrasi</a>
                `}
              </div>
            </div>
          </div>
        </div>
      </nav>
    `;

    // Theme toggle
    try{
      if (window.updateThemeButton) updateThemeButton();
      const tbtn = document.getElementById('theme-toggle');
      if(tbtn && window.getTheme && window.setTheme){
        tbtn.addEventListener('click', () => {
          const t = getTheme();
          setTheme(t === 'dark' ? 'light' : 'dark');
        });
      }
    }catch(_){}

    // User menu
    const btn = document.getElementById('user-menu-btn');
    const menu = document.getElementById('user-menu');
    if(btn && menu){
      const close = ()=>{
        menu.classList.add('hidden');
        btn.setAttribute('aria-expanded','false');
      };
      const toggle = ()=>{
        const open = !menu.classList.contains('hidden');
        if(open) close(); else {
          menu.classList.remove('hidden');
          btn.setAttribute('aria-expanded','true');
        }
      };
      btn.addEventListener('click', (e)=>{
        e.preventDefault();
        e.stopPropagation();
        toggle();
      });
      document.addEventListener('click', close);
      document.addEventListener('keydown', (e)=>{ if(e.key === 'Escape') close(); });
    }

    // Logout
    const logoutBtn = document.getElementById('logout-btn');
    if(logoutBtn && window.logout){
      logoutBtn.addEventListener('click', (e)=>{ e.preventDefault(); logout(); });
    }
  }

  document.addEventListener('DOMContentLoaded', renderNavbar);
})();

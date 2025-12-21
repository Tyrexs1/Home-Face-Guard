// frontend/assets/js/theme.js
(function(){
  try{
    const saved = localStorage.getItem('theme');
    const theme = saved || 'dark';
    document.documentElement.setAttribute('data-theme', theme);
  }catch(_){}
})();

function setTheme(next){
  document.documentElement.setAttribute('data-theme', next);
  try{ localStorage.setItem('theme', next); }catch(_){}
  updateThemeButton();
}

function getTheme(){
  return document.documentElement.getAttribute('data-theme') || 'dark';
}

function updateThemeButton(){
  const btn = document.getElementById('theme-toggle');
  if(!btn) return;
  const t = getTheme();
  btn.classList.toggle('is-light', t === 'light');
  btn.setAttribute('aria-label', t === 'light' ? 'Switch to dark mode' : 'Switch to light mode');
  btn.title = t === 'light' ? 'Dark mode' : 'Light mode';
}

document.addEventListener('DOMContentLoaded', () => {
  updateThemeButton();
  const btn = document.getElementById('theme-toggle');
  if(btn){
    btn.addEventListener('click', () => {
      const t = getTheme();
      setTheme(t === 'dark' ? 'light' : 'dark');
    });
  }
});

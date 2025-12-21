// frontend/assets/js/auth.js

// Gunakan MOCK_API_BASE dari app.js
if (typeof MOCK_API_BASE === 'undefined') {
    console.error('app.js belum dimuat (MOCK_API_BASE tidak ditemukan).');
}

function setAuthUser(user) {
    try {
        localStorage.setItem('auth_user', JSON.stringify(user || null));
    } catch (_) {}
}

function getAuthUser() {
    try {
        const raw = localStorage.getItem('auth_user');
        return raw ? JSON.parse(raw) : null;
    } catch (_) {
        return null;
    }
}

function showFormMessage(el, type, text) {
    if (!el) return;
    el.className = type === 'error'
        ? 'mb-4 rounded-xl border border-red-500/40 bg-red-500/10 p-3 text-red-200 text-sm'
        : 'mb-4 rounded-xl border border-green-500/40 bg-green-500/10 p-3 text-green-200 text-sm';
    el.textContent = text;
    el.style.display = 'block';
}

// =========================
// LOGIN
// =========================
async function handleLoginSubmit(e) {
    e.preventDefault();
    const msg = document.getElementById('form-message');
    if (msg) msg.style.display = 'none';

    const email = (document.getElementById('login-email')?.value || '').trim();
    const password = (document.getElementById('login-password')?.value || '').trim();

    try {
        const res = await fetch(MOCK_API_BASE + '/auth/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, password })
        });

        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.message || 'Login gagal');

        setAuthUser(data.user);
        showFormMessage(msg, 'success', data.message || 'Login berhasil');

        setTimeout(() => {
            window.location.href = 'index.html';
        }, 600);
    } catch (err) {
        showFormMessage(msg, 'error', err.message || 'Terjadi kesalahan');
    }
}

// =========================
// REGISTER
// =========================
async function handleRegisterSubmit(e) {
    e.preventDefault();
    const msg = document.getElementById('form-message');
    if (msg) msg.style.display = 'none';

    const name = (document.getElementById('reg-name')?.value || '').trim();
    const email = (document.getElementById('reg-email')?.value || '').trim();
    const password = (document.getElementById('reg-password')?.value || '').trim();
    const confirm = (document.getElementById('reg-confirm')?.value || '').trim();

    if (password !== confirm) {
        showFormMessage(msg, 'error', 'Konfirmasi password tidak sama.');
        return;
    }

    try {
        const res = await fetch(MOCK_API_BASE + '/auth/register', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name, email, password })
        });

        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.message || 'Registrasi gagal');

        showFormMessage(msg, 'success', data.message || 'Registrasi berhasil');
        setTimeout(() => {
            window.location.href = 'login.html';
        }, 700);
    } catch (err) {
        showFormMessage(msg, 'error', err.message || 'Terjadi kesalahan');
    }
}

// Auto-bind sesuai halaman
document.addEventListener('DOMContentLoaded', () => {
    const loginForm = document.getElementById('login-form');
    const registerForm = document.getElementById('register-form');

    if (loginForm) loginForm.addEventListener('submit', handleLoginSubmit);
    if (registerForm) registerForm.addEventListener('submit', handleRegisterSubmit);

    // Optional: tampilkan nama user jika sudah login
    const u = getAuthUser();
    const who = document.getElementById('auth-who');
    if (who && u?.name) who.textContent = u.name;
});


// =========================
// GUARD (halaman protected)
// =========================
function isAuthPage() {
    const parts = (location.pathname || '')
        .toLowerCase()
        .split('/')
        .filter(Boolean);

    const last = (parts[parts.length - 1] || '').trim(); // contoh: "register.html" atau "register"

    return last === 'login' || last === 'login.html' || last === 'register' || last === 'register.html';
}

function requireAuth() {
    // jangan guard di halaman login/register
    if (isAuthPage()) return;

    const user = getAuthUser();
    if (!user) {
        // pakai root relatif agar aman di Netlify & GitHub Pages
        location.replace('./login.html');
    }
}


function logout(){
    setAuthUser(null);
    try { localStorage.removeItem('auth_user'); } catch(_) {}
    location.replace('login.html');
}

document.addEventListener('DOMContentLoaded', () => {
    // Auto-guard
    try { requireAuth(); } catch(_) {}

    // Hook logout button if present
    const btn = document.getElementById('logout-btn');
    if (btn) {
        btn.addEventListener('click', (e) => {
            e.preventDefault();
            logout();
        });
    }
});

(function(global) {
    const AUTH_COOKIE = 'cowork_auth';
    const AUTH_USER_COOKIE = 'cowork_auth_user';
    const AUTH_LOCAL_KEY = 'cowork_auth_local';
    const AUTH_SESSION_KEY = 'cowork_auth_session';
    const LOGIN_PATH = '/login.html';
    const CREDENTIALS = {
        admin: '123456789',
    };

    function setCookie(name, value, days) {
        let cookie = `${name}=${encodeURIComponent(value)}; path=/; SameSite=Lax`;
        if (typeof days === 'number') {
            cookie += `; max-age=${days * 24 * 60 * 60}`;
        }
        document.cookie = cookie;
    }

    function getCookie(name) {
        const prefix = `${name}=`;
        const found = document.cookie.split(';').map((item) => item.trim()).find((item) => item.startsWith(prefix));
        return found ? decodeURIComponent(found.slice(prefix.length)) : '';
    }

    function clearCookie(name) {
        document.cookie = `${name}=; path=/; max-age=0; SameSite=Lax`;
    }

    function persistAuth(username, remember) {
        const payload = JSON.stringify({ username, remember, loginAt: Date.now() });
        localStorage.removeItem(AUTH_LOCAL_KEY);
        sessionStorage.removeItem(AUTH_SESSION_KEY);
        if (remember) localStorage.setItem(AUTH_LOCAL_KEY, payload);
        else sessionStorage.setItem(AUTH_SESSION_KEY, payload);
        setCookie(AUTH_COOKIE, '1', remember ? 30 : undefined);
        setCookie(AUTH_USER_COOKIE, username, remember ? 30 : undefined);
    }

    function readAuthRecord() {
        const local = localStorage.getItem(AUTH_LOCAL_KEY);
        if (local) {
            try { return JSON.parse(local); } catch (_) {}
        }
        const session = sessionStorage.getItem(AUTH_SESSION_KEY);
        if (session) {
            try { return JSON.parse(session); } catch (_) {}
        }
        const cookieUser = getCookie(AUTH_USER_COOKIE);
        const cookieAuth = getCookie(AUTH_COOKIE);
        if (cookieAuth === '1' && cookieUser) {
            return { username: cookieUser, remember: true };
        }
        return null;
    }

    function isAuthenticated() {
        return !!readAuthRecord()?.username;
    }

    function getCurrentUser() {
        return readAuthRecord()?.username || '';
    }

    function buildNextUrl() {
        return `${location.pathname}${location.search}${location.hash}`;
    }

    function redirectToLogin() {
        if (location.pathname.endsWith('/login.html') || location.pathname === '/login.html') return;
        const next = encodeURIComponent(buildNextUrl());
        location.replace(`${LOGIN_PATH}?next=${next}`);
    }

    function getNextTarget() {
        const params = new URLSearchParams(location.search);
        const next = params.get('next');
        return next || '/';
    }

    function redirectAfterLogin() {
        location.replace(getNextTarget());
    }

    function login(username, password, remember) {
        const normalized = String(username || '').trim();
        if (!normalized || CREDENTIALS[normalized] !== String(password || '')) {
            throw new Error('ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง');
        }
        persistAuth(normalized, !!remember);
        return normalized;
    }

    function logout() {
        localStorage.removeItem(AUTH_LOCAL_KEY);
        sessionStorage.removeItem(AUTH_SESSION_KEY);
        clearCookie(AUTH_COOKIE);
        clearCookie(AUTH_USER_COOKIE);
        location.replace(LOGIN_PATH);
    }

    function requireAuth() {
        if (!isAuthenticated()) redirectToLogin();
    }

    function mountProtectedPage() {
        const username = getCurrentUser() || 'admin';
        document.querySelectorAll('[data-auth-username]').forEach((element) => {
            element.textContent = username;
        });
        document.querySelectorAll('[data-logout-btn]').forEach((button) => {
            button.addEventListener('click', logout);
        });
    }

    function initLoginPage() {
        if (isAuthenticated()) {
            redirectAfterLogin();
            return;
        }

        const form = document.getElementById('login-form');
        if (!form) return;
        const usernameInput = document.getElementById('login-username');
        const passwordInput = document.getElementById('login-password');
        const rememberInput = document.getElementById('login-remember');
        const errorBox = document.getElementById('login-error');

        form.addEventListener('submit', (event) => {
            event.preventDefault();
            errorBox.classList.add('hidden');
            try {
                login(usernameInput.value, passwordInput.value, rememberInput.checked);
                redirectAfterLogin();
            } catch (error) {
                errorBox.textContent = error.message || String(error);
                errorBox.classList.remove('hidden');
                passwordInput.focus();
            }
        });
    }

    global.Auth = {
        getCurrentUser,
        initLoginPage,
        isAuthenticated,
        login,
        logout,
        mountProtectedPage,
        requireAuth,
    };
})(window);
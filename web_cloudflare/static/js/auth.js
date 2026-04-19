(function(global) {
    const AUTH_COOKIE = 'cowork_auth';
    const AUTH_USER_COOKIE = 'cowork_auth_user';
    const AUTH_LOCAL_KEY = 'cowork_auth_local';
    const AUTH_SESSION_KEY = 'cowork_auth_session';
    const USERS_KEY = 'cowork_users';
    const LOGIN_PATH = '/login.html';
    const DEFAULT_USERS = {
        admin: { password: '123456789', role: 'admin', createdAt: Date.now() },
    };

    function ensureUsers() {
        try {
            const parsed = JSON.parse(localStorage.getItem(USERS_KEY) || '{}');
            if (parsed && Object.keys(parsed).length) return parsed;
        } catch (_) {}
        localStorage.setItem(USERS_KEY, JSON.stringify(DEFAULT_USERS));
        return { ...DEFAULT_USERS };
    }

    function saveUsers(users) {
        localStorage.setItem(USERS_KEY, JSON.stringify(users));
    }

    function getUsers() {
        return ensureUsers();
    }

    function getUserEntries() {
        const users = getUsers();
        return Object.entries(users).map(([username, profile]) => ({ username, ...profile }));
    }

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
        const users = getUsers();
        if (!normalized || !users[normalized] || users[normalized].password !== String(password || '')) {
            throw new Error('ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง');
        }
        persistAuth(normalized, !!remember);
        return normalized;
    }

    function createUser(username, password) {
        const normalized = String(username || '').trim();
        const secret = String(password || '');
        if (!normalized) throw new Error('กรุณากรอกชื่อผู้ใช้');
        if (secret.length < 6) throw new Error('รหัสผ่านต้องมีอย่างน้อย 6 ตัวอักษร');
        const users = getUsers();
        if (users[normalized]) throw new Error('ชื่อผู้ใช้นี้มีอยู่แล้ว');
        users[normalized] = { password: secret, role: 'user', createdAt: Date.now() };
        saveUsers(users);
        return normalized;
    }

    function changePassword(currentUsername, currentPassword, nextPassword) {
        const username = String(currentUsername || '').trim();
        const users = getUsers();
        const profile = users[username];
        if (!profile) throw new Error('ไม่พบบัญชีผู้ใช้นี้');
        if (profile.password !== String(currentPassword || '')) throw new Error('รหัสผ่านปัจจุบันไม่ถูกต้อง');
        if (String(nextPassword || '').length < 6) throw new Error('รหัสผ่านใหม่ต้องมีอย่างน้อย 6 ตัวอักษร');
        profile.password = String(nextPassword);
        users[username] = profile;
        saveUsers(users);
    }

    function deleteUser(username) {
        const normalized = String(username || '').trim();
        if (!normalized) throw new Error('ไม่พบชื่อผู้ใช้');
        if (normalized === 'admin') throw new Error('ไม่สามารถลบบัญชี admin ได้');
        if (normalized === getCurrentUser()) throw new Error('ไม่สามารถลบบัญชีที่กำลังใช้งานอยู่ได้');
        const users = getUsers();
        if (!users[normalized]) throw new Error('ไม่พบบัญชีผู้ใช้นี้');
        delete users[normalized];
        saveUsers(users);
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
        changePassword,
        createUser,
        deleteUser,
        getCurrentUser,
        getUserEntries,
        initLoginPage,
        isAuthenticated,
        login,
        logout,
        mountProtectedPage,
        requireAuth,
    };
})(window);
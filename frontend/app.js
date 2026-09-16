(() => {
  'use strict';

  const API = '/api';
  const state = {
    token: localStorage.getItem('wallet_token') || null,
    user: null,
    pendingPhone: null, // phone currently going through OTP
  };

  // -------------------------------------------------------------------
  // Element references
  // -------------------------------------------------------------------
  const screens = {
    returning: document.getElementById('returning-view'),
    phone: document.getElementById('phone-view'),
    login: document.getElementById('login-view'),
    otp: document.getElementById('otp-view'),
    details: document.getElementById('details-view'),
    app: document.getElementById('app-view'),
  };

  const pages = {
    dashboard: document.getElementById('page-dashboard'),
    history: document.getElementById('page-history'),
    profile: document.getElementById('page-profile'),
    settings: document.getElementById('page-settings'),
    favorites: document.getElementById('page-favorites'),
    admin: document.getElementById('page-admin'),
  };

  const toastEl = document.getElementById('toast');
  const sheetBackdrop = document.getElementById('sheet-backdrop');
  const sheets = {
    fund: document.getElementById('sheet-fund'),
    transfer: document.getElementById('sheet-transfer'),
    withdraw: document.getElementById('sheet-withdraw'),
    bill: document.getElementById('sheet-bill'),
    pin: document.getElementById('sheet-pin'),
    email: document.getElementById('sheet-email'),
  };

  // -------------------------------------------------------------------
  // API helper
  // -------------------------------------------------------------------
  async function api(path, options = {}) {
    const headers = { 'Content-Type': 'application/json', ...(options.headers || {}) };
    if (state.token) headers['Authorization'] = `Bearer ${state.token}`;
    const res = await fetch(`${API}${path}`, { ...options, headers });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || 'Something went wrong.');
    return data;
  }

  function showToast(message, kind = 'success') {
    toastEl.textContent = message;
    toastEl.className = `toast is-${kind}`;
    clearTimeout(showToast._t);
    showToast._t = setTimeout(() => toastEl.classList.add('is-hidden'), 3200);
  }

  function setFormError(name, message) {
    const el = document.querySelector(`[data-error-for="${name}"]`);
    if (el) el.textContent = message || '';
  }

  function showScreen(name) {
    Object.values(screens).forEach((s) => s.classList.add('is-hidden'));
    screens[name].classList.remove('is-hidden');
  }

  function normalizePhoneDisplay(phone) {
    return phone;
  }

  // -------------------------------------------------------------------
  // Onboarding: phone -> OTP -> details, or returning-user unlock, or login
  // -------------------------------------------------------------------

  const lastPhone = localStorage.getItem('wallet_last_phone');
  const lastName = localStorage.getItem('wallet_last_name');
  const hasCredential = !!localStorage.getItem('wallet_webauthn_id');

  document.getElementById('phone-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    setFormError('phone', '');
    const phone = new FormData(e.target).get('phone');
    try {
      const data = await api('/request-otp', { method: 'POST', body: JSON.stringify({ phone }) });
      state.pendingPhone = phone;
      openOtpScreen(data);
    } catch (err) {
      setFormError('phone', err.message);
    }
  });

  document.getElementById('have-account-btn').addEventListener('click', () => showScreen('login'));
  document.getElementById('new-wallet-btn').addEventListener('click', () => showScreen('phone'));

  document.getElementById('login-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    setFormError('login', '');
    const fd = new FormData(e.target);
    try {
      const { token, user } = await api('/login', {
        method: 'POST',
        body: JSON.stringify({ phone: fd.get('phone'), password: fd.get('password') }),
      });
      onAuthed(token, user);
    } catch (err) {
      setFormError('login', err.message);
    }
  });

  function openOtpScreen(requestOtpResponse) {
    document.getElementById('otp-phone-display').textContent = state.pendingPhone;
    const note = document.getElementById('otp-demo-note');
    if (requestOtpResponse && requestOtpResponse.demoMode) {
      note.textContent = `Demo mode — no SMS is sent. Your code is ${requestOtpResponse.demoCode}.`;
    } else {
      note.textContent = '';
    }
    setFormError('otp', '');
    showScreen('otp');
  }

  document.getElementById('otp-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    setFormError('otp', '');
    const code = new FormData(e.target).get('code');
    try {
      await api('/verify-otp', { method: 'POST', body: JSON.stringify({ phone: state.pendingPhone, code }) });
      showScreen('details');
    } catch (err) {
      setFormError('otp', err.message);
    }
  });

  document.getElementById('resend-otp-btn').addEventListener('click', async () => {
    try {
      const data = await api('/request-otp', { method: 'POST', body: JSON.stringify({ phone: state.pendingPhone }) });
      openOtpScreen(data);
      showToast('New code generated.');
    } catch (err) {
      setFormError('otp', err.message);
    }
  });

  document.getElementById('change-phone-btn').addEventListener('click', () => showScreen('phone'));

  document.getElementById('details-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    setFormError('details', '');
    const fd = new FormData(e.target);
    try {
      const { token, user } = await api('/register', {
        method: 'POST',
        body: JSON.stringify({
          phone: state.pendingPhone,
          name: fd.get('name'),
          password: fd.get('password'),
          pin: fd.get('pin'),
        }),
      });
      onAuthed(token, user);
    } catch (err) {
      setFormError('details', err.message);
    }
  });

  function onAuthed(token, user) {
    state.token = token;
    state.user = user;
    localStorage.setItem('wallet_token', token);
    localStorage.setItem('wallet_last_phone', user.phone);
    localStorage.setItem('wallet_last_name', user.name);
    showScreen('app');
    navigateTo('dashboard');
    renderUser(user);
    loadTransactions();
  }

  function signOut() {
    state.token = null;
    state.user = null;
    localStorage.removeItem('wallet_token');
    showReturningOrPhoneScreen();
  }

  document.getElementById('signout-btn').addEventListener('click', signOut);

  // -------------------------------------------------------------------
  // Returning-user screen (fingerprint device-unlock convenience)
  //
  // Note: this is a LOCAL device unlock, not a full server-verified
  // WebAuthn login. It simply re-uses the already-stored session token
  // on this device once the browser's platform authenticator confirms
  // the same person is present. Building true passwordless WebAuthn
  // (with server-side signature verification) is a bigger project than
  // this pass covers.
  // -------------------------------------------------------------------

  async function showReturningOrPhoneScreen() {
    if (lastPhone && state.token) {
      // We still have a token from before; offer the quick-unlock screen.
      document.getElementById('returning-name').textContent = lastName || 'Welcome back';
      document.getElementById('returning-phone').textContent = maskPhoneLocal(lastPhone);
      document.getElementById('returning-avatar').textContent = (lastName || '?').charAt(0).toUpperCase();
      const fpBtn = document.getElementById('fingerprint-btn');
      const supported = await webauthnAvailable();
      fpBtn.classList.toggle('is-hidden', !supported);
      showScreen('returning');
    } else {
      showScreen('phone');
    }
  }

  function maskPhoneLocal(phone) {
    const digits = String(phone || '').replace(/\D/g, '');
    if (digits.length < 6) return digits;
    return `${digits.slice(0, 3)}****${digits.slice(-3)}`;
  }

  async function webauthnAvailable() {
    if (!window.PublicKeyCredential) return false;
    try {
      return await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();
    } catch (e) {
      return false;
    }
  }

  async function enableFingerprintUnlock() {
    if (!(await webauthnAvailable())) return;
    try {
      const cred = await navigator.credentials.create({
        publicKey: {
          challenge: crypto.getRandomValues(new Uint8Array(32)),
          rp: { name: 'ibeto' },
          user: {
            id: crypto.getRandomValues(new Uint8Array(16)),
            name: state.user.phone,
            displayName: state.user.name,
          },
          pubKeyCredParams: [{ type: 'public-key', alg: -7 }],
          authenticatorSelection: { authenticatorAttachment: 'platform', userVerification: 'required' },
          timeout: 60000,
        },
      });
      if (cred) {
        localStorage.setItem('wallet_webauthn_id', cred.id);
        showToast('Fingerprint unlock enabled on this device.');
      }
    } catch (e) {
      // User declined or device unsupported — silently skip, not critical.
    }
  }

  document.getElementById('fingerprint-btn').addEventListener('click', async () => {
    const credId = localStorage.getItem('wallet_webauthn_id');
    document.getElementById('returning-error').textContent = '';
    try {
      await navigator.credentials.get({
        publicKey: {
          challenge: crypto.getRandomValues(new Uint8Array(32)),
          allowCredentials: credId
            ? [{ id: Uint8Array.from(atob(credId.replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0)), type: 'public-key' }]
            : [],
          userVerification: 'required',
          timeout: 60000,
        },
      });
      // Verified locally — unlock using the session token already on this device.
      state.token = localStorage.getItem('wallet_token');
      const { user } = await api('/me');
      onAuthed(state.token, user);
    } catch (err) {
      document.getElementById('returning-error').textContent =
        'Fingerprint not recognized. Please use your password instead.';
    }
  });

  document.getElementById('switch-account-btn').addEventListener('click', () => {
    localStorage.removeItem('wallet_token');
    localStorage.removeItem('wallet_last_phone');
    localStorage.removeItem('wallet_last_name');
    localStorage.removeItem('wallet_webauthn_id');
    state.token = null;
    showScreen('phone');
  });

  document.getElementById('login-password-btn').addEventListener('click', () => showScreen('login'));

  // -------------------------------------------------------------------
  // App shell: navigation between pages + bottom nav
  // -------------------------------------------------------------------

  function navigateTo(pageName) {
    Object.values(pages).forEach((p) => p.classList.add('is-hidden'));
    pages[pageName].classList.remove('is-hidden');
    document.querySelectorAll('.nav-btn').forEach((b) => {
      b.classList.toggle('is-active', b.dataset.nav === pageName);
    });
    const nav = document.querySelector('.bottom-nav');
    nav.classList.toggle('is-hidden', pageName === 'history' || pageName === 'favorites' || pageName === 'admin' || pageName === 'settings' || pageName === 'profile');

    if (pageName === 'history') loadTransactions(true);
    if (pageName === 'profile') fillProfileForm();
    if (pageName === 'favorites') renderFavorites();
    if (pageName === 'admin') loadAdminUsers();
  }

  document.querySelectorAll('[data-nav]').forEach((btn) => {
    btn.addEventListener('click', () => navigateTo(btn.dataset.nav));
  });
  document.querySelectorAll('[data-back]').forEach((btn) => {
    btn.addEventListener('click', () => navigateTo('dashboard'));
  });
  document.querySelectorAll('[data-alert]').forEach((btn) => {
    btn.addEventListener('click', () => showToast(btn.dataset.alert, 'success'));
  });

  // -------------------------------------------------------------------
  // Dashboard rendering
  // -------------------------------------------------------------------

  let balanceHidden = false;

  function renderUser(user) {
    state.user = user;
    document.getElementById('user-name').textContent = user.name.split(' ')[0];
    document.getElementById('account-number').textContent = user.accountNumber;
    updateBalanceDisplay();
    document.getElementById('admin-settings-group').classList.toggle('is-hidden', !user.isAdmin);
  }

  function updateBalanceDisplay() {
    const el = document.getElementById('balance-value');
    el.textContent = balanceHidden ? '••••••' : Number(state.user.balance).toFixed(2);
  }

  document.getElementById('toggle-balance-btn').addEventListener('click', () => {
    balanceHidden = !balanceHidden;
    updateBalanceDisplay();
  });

  document.getElementById('history-link-btn').addEventListener('click', () => navigateTo('history'));

  function formatDate(iso) {
    const d = new Date(iso);
    return d.toLocaleDateString(undefined, { day: 'numeric', month: 'short' }) +
      ' · ' + d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
  }

  function escapeHTML(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  function renderTxRow(tx) {
    const li = document.createElement('li');
    li.className = 'ledger-row';
    const sign = tx.direction === 'in' ? '+' : tx.direction === 'out' ? '-' : '';
    const amountClass = tx.direction === 'in' ? 'in' : tx.direction === 'out' ? 'out' : '';
    li.innerHTML = `
      <div class="ledger-row-main">
        <span class="ledger-row-title">${escapeHTML(tx.description || tx.type)}</span>
        <span class="ledger-row-meta">${formatDate(tx.createdAt)}</span>
      </div>
      <span class="ledger-row-amount ${amountClass}">${sign}₦${Number(tx.amount).toFixed(2)}</span>
    `;
    return li;
  }

  function renderTransactions(transactions, full) {
    const listEl = full ? document.getElementById('full-transaction-list') : document.getElementById('transaction-list');
    const shown = full ? transactions : transactions.slice(0, 6);
    listEl.innerHTML = '';
    if (!shown.length) {
      if (!full) document.getElementById('empty-state').classList.remove('is-hidden');
      return;
    }
    if (!full) document.getElementById('empty-state').classList.add('is-hidden');
    shown.forEach((tx) => listEl.appendChild(renderTxRow(tx)));
  }

  let cachedTransactions = [];

  async function refreshBalance() {
    try {
      const { user } = await api('/me');
      renderUser(user);
    } catch (err) {
      signOut();
    }
  }

  async function loadTransactions(full) {
    try {
      const { transactions } = await api('/transactions');
      cachedTransactions = transactions;
      renderTransactions(transactions, false);
      if (full) renderTransactions(transactions, true);
    } catch (err) {
      showToast(err.message, 'error');
    }
  }

  // -------------------------------------------------------------------
  // Bottom sheets
  // -------------------------------------------------------------------

  function openSheet(name) {
    if (name === 'transfer') renderFavoritesQuickpick();
    if (name === 'pin') {
      document.getElementById('current-pin-field').classList.toggle('is-hidden', !state.user.pinSet);
      document.getElementById('pin-sub').textContent = state.user.pinSet
        ? 'Enter your current PIN, then choose a new one.'
        : 'Set the 4-digit PIN used to approve transfers, withdrawals, and bill payments.';
    }
    sheetBackdrop.classList.remove('is-hidden');
    sheets[name].classList.remove('is-hidden');
  }

  function closeSheets() {
    sheetBackdrop.classList.add('is-hidden');
    Object.values(sheets).forEach((s) => s.classList.add('is-hidden'));
    document.querySelectorAll('.form-error').forEach((el) => (el.textContent = ''));
  }

  document.querySelectorAll('[data-open]').forEach((btn) => {
    btn.addEventListener('click', () => openSheet(btn.dataset.open));
  });
  sheetBackdrop.addEventListener('click', closeSheets);
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeSheets(); });

  function renderFavoritesQuickpick() {
    const wrap = document.getElementById('favorites-quickpick');
    const favorites = (state.user.favorites || []).slice(0, 6);
    wrap.innerHTML = '';
    favorites.forEach((f) => {
      const chip = document.createElement('button');
      chip.type = 'button';
      chip.className = 'favorite-chip';
      chip.textContent = f.label || f.name;
      chip.addEventListener('click', () => {
        document.querySelector('[data-form="transfer"] [name="recipient"]').value = f.accountNumber;
      });
      wrap.appendChild(chip);
    });
  }

  function bindSheetForm(name, path, buildPayload, { successMsg, onSuccess } = {}) {
    const form = document.querySelector(`[data-form="${name}"]`);
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      setFormError(name, '');
      const fd = new FormData(form);
      const submitBtn = form.querySelector('button[type="submit"]');
      submitBtn.disabled = true;
      try {
        const result = await api(path, { method: 'POST', body: JSON.stringify(buildPayload(fd)) });
        if (result.user) renderUser(result.user);
        await loadTransactions();
        closeSheets();
        form.reset();
        showToast(successMsg || 'Done.', 'success');
        if (onSuccess) onSuccess(fd, result);
      } catch (err) {
        setFormError(name, err.message);
      } finally {
        submitBtn.disabled = false;
      }
    });
  }

  bindSheetForm('fund', '/fund', (fd) => ({ amount: fd.get('amount'), source: fd.get('source') }),
    { successMsg: 'Wallet funded.' });

  bindSheetForm('transfer', '/transfer', (fd) => ({
    recipient: fd.get('recipient'), amount: fd.get('amount'), note: fd.get('note'), pin: fd.get('pin'),
  }), {
    successMsg: 'Transfer sent.',
    onSuccess: async (fd) => {
      if (fd.get('saveFavorite')) {
        try {
          const result = await api('/save-favorite', {
            method: 'POST',
            body: JSON.stringify({ identifier: fd.get('recipient') }),
          });
          renderUser(result.user);
        } catch (e) { /* non-critical */ }
      }
    },
  });

  bindSheetForm('withdraw', '/withdraw', (fd) => ({
    amount: fd.get('amount'), bankName: fd.get('bankName'), accountNumber: fd.get('accountNumber'), pin: fd.get('pin'),
  }), { successMsg: 'Withdrawal requested.' });

  bindSheetForm('bill', '/pay-bill', (fd) => ({
    billType: fd.get('billType'), provider: fd.get('provider'), customerId: fd.get('customerId'),
    amount: fd.get('amount'), pin: fd.get('pin'),
  }), { successMsg: 'Bill paid.' });

  bindSheetForm('pin', '/set-pin', (fd) => ({ pin: fd.get('pin'), currentPin: fd.get('currentPin') }),
    { successMsg: 'PIN saved.', onSuccess: () => { if (!localStorage.getItem('wallet_webauthn_id')) enableFingerprintUnlock(); } });

  bindSheetForm('email', '/link-email', (fd) => ({ email: fd.get('email') }),
    { successMsg: 'Email linked.', onSuccess: () => fillProfileForm() });

  // -------------------------------------------------------------------
  // Profile page
  // -------------------------------------------------------------------

  function fillProfileForm() {
    const u = state.user;
    document.getElementById('profile-name-display').textContent = u.name;
    document.getElementById('profile-account-number').textContent = u.accountNumber;
    document.getElementById('profile-tier').textContent = u.tier;
    document.getElementById('profile-phone').textContent = u.phone;
    const emailBtn = document.getElementById('email-action-btn');
    emailBtn.textContent = u.email ? u.email : 'Add email';

    const form = document.getElementById('profile-form');
    form.name.value = u.name || '';
    form.gender.value = u.gender || '';
    form.dateOfBirth.value = u.dateOfBirth || '';
    form.address.value = u.address || '';

    const img = document.getElementById('profile-photo-img');
    const fallback = document.getElementById('profile-photo-fallback');
    if (u.photo) {
      img.src = u.photo;
      img.classList.remove('is-hidden');
      fallback.classList.add('is-hidden');
    } else {
      img.classList.add('is-hidden');
      fallback.classList.remove('is-hidden');
    }
  }

  document.getElementById('email-action-btn').addEventListener('click', () => openSheet('email'));

  document.getElementById('photo-input').addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async () => {
      try {
        const result = await api('/update-profile', { method: 'POST', body: JSON.stringify({ photo: reader.result }) });
        renderUser(result.user);
        fillProfileForm();
        showToast('Photo updated.');
      } catch (err) {
        showToast(err.message, 'error');
      }
    };
    reader.readAsDataURL(file);
  });

  document.getElementById('profile-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    setFormError('profile', '');
    const fd = new FormData(e.target);
    try {
      const result = await api('/update-profile', {
        method: 'POST',
        body: JSON.stringify({
          name: fd.get('name'),
          gender: fd.get('gender'),
          dateOfBirth: fd.get('dateOfBirth'),
          address: fd.get('address'),
        }),
      });
      renderUser(result.user);
      fillProfileForm();
      showToast('Profile updated.');
    } catch (err) {
      setFormError('profile', err.message);
    }
  });

  // -------------------------------------------------------------------
  // Favorites page
  // -------------------------------------------------------------------

  function renderFavorites() {
    const listEl = document.getElementById('favorites-list');
    const emptyEl = document.getElementById('favorites-empty');
    const favorites = state.user.favorites || [];
    listEl.innerHTML = '';
    emptyEl.classList.toggle('is-hidden', favorites.length > 0);
    favorites.forEach((f) => {
      const li = document.createElement('li');
      li.className = 'ledger-row';
      li.innerHTML = `
        <div class="ledger-row-main">
          <span class="ledger-row-title">${escapeHTML(f.label || f.name)}</span>
          <span class="ledger-row-meta">${escapeHTML(f.accountNumber)}</span>
        </div>
      `;
      listEl.appendChild(li);
    });
  }

  // -------------------------------------------------------------------
  // Admin page
  // -------------------------------------------------------------------

  async function loadAdminUsers() {
    document.getElementById('admin-user-detail-wrap').classList.add('is-hidden');
    document.getElementById('admin-user-list-wrap').classList.remove('is-hidden');
    try {
      const { users } = await api('/admin-users');
      const listEl = document.getElementById('admin-user-list');
      listEl.innerHTML = '';
      users.forEach((u) => {
        const li = document.createElement('li');
        li.className = 'ledger-row ledger-row-clickable';
        li.innerHTML = `
          <div class="ledger-row-main">
            <span class="ledger-row-title">${escapeHTML(u.name)}${u.isAdmin ? ' 👑' : ''}</span>
            <span class="ledger-row-meta">${escapeHTML(u.phone)} · Tier ${u.tier}</span>
          </div>
          <span class="ledger-row-amount">₦${Number(u.balance).toFixed(2)}</span>
        `;
        li.addEventListener('click', () => loadAdminUserDetail(u));
        listEl.appendChild(li);
      });
    } catch (err) {
      showToast(err.message, 'error');
    }
  }

  async function loadAdminUserDetail(u) {
    try {
      const { transactions } = await api(`/admin-transactions?userId=${encodeURIComponent(u.id)}`);
      document.getElementById('admin-user-list-wrap').classList.add('is-hidden');
      document.getElementById('admin-user-detail-wrap').classList.remove('is-hidden');
      document.getElementById('admin-detail-name').textContent = u.name;
      document.getElementById('admin-detail-meta').textContent = `${u.phone} · Balance ₦${Number(u.balance).toFixed(2)}`;
      const listEl = document.getElementById('admin-detail-transactions');
      listEl.innerHTML = '';
      transactions.forEach((tx) => listEl.appendChild(renderTxRow(tx)));
    } catch (err) {
      showToast(err.message, 'error');
    }
  }

  document.getElementById('admin-back-to-list').addEventListener('click', loadAdminUsers);

  // -------------------------------------------------------------------
  // Boot
  // -------------------------------------------------------------------

  (async function boot() {
    if (!state.token) {
      await showReturningOrPhoneScreen();
      return;
    }
    try {
      const { user } = await api('/me');
      onAuthed(state.token, user);
    } catch (err) {
      state.token = null;
      await showReturningOrPhoneScreen();
    }
  })();
})();

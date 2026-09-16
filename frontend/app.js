(() => {
  'use strict';

  const API = '/api';
  const state = {
    token: localStorage.getItem('wallet_token') || null,
    user: null,
  };

  // -------------------------------------------------------------------
  // Element references
  // -------------------------------------------------------------------
  const authView = document.getElementById('auth-view');
  const appView = document.getElementById('app-view');

  const loginForm = document.getElementById('login-form');
  const registerForm = document.getElementById('register-form');
  const authTabs = document.querySelectorAll('.auth-tab');

  const userNameEl = document.getElementById('user-name');
  const balanceValueEl = document.getElementById('balance-value');
  const accountNumberEl = document.getElementById('account-number');
  const transactionListEl = document.getElementById('transaction-list');
  const emptyStateEl = document.getElementById('empty-state');

  const sheetBackdrop = document.getElementById('sheet-backdrop');
  const sheets = {
    fund: document.getElementById('sheet-fund'),
    transfer: document.getElementById('sheet-transfer'),
    withdraw: document.getElementById('sheet-withdraw'),
    bill: document.getElementById('sheet-bill'),
  };

  const toastEl = document.getElementById('toast');

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

  // -------------------------------------------------------------------
  // Toast
  // -------------------------------------------------------------------
  let toastTimer = null;
  function showToast(message, kind = 'success') {
    toastEl.textContent = message;
    toastEl.className = `toast is-${kind}`;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toastEl.classList.add('is-hidden'), 3200);
  }

  // -------------------------------------------------------------------
  // Auth view: tab switching
  // -------------------------------------------------------------------
  authTabs.forEach((tab) => {
    tab.addEventListener('click', () => {
      authTabs.forEach((t) => {
        t.classList.remove('is-active');
        t.setAttribute('aria-selected', 'false');
      });
      tab.classList.add('is-active');
      tab.setAttribute('aria-selected', 'true');
      const target = tab.dataset.tab;
      loginForm.classList.toggle('is-hidden', target !== 'login');
      registerForm.classList.toggle('is-hidden', target !== 'register');
    });
  });

  function setFormError(formName, message) {
    const el = document.querySelector(`[data-error-for="${formName}"]`);
    if (el) el.textContent = message || '';
  }

  loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    setFormError('login', '');
    const fd = new FormData(loginForm);
    try {
      const { token, user } = await api('/login', {
        method: 'POST',
        body: JSON.stringify({ email: fd.get('email'), password: fd.get('password') }),
      });
      onAuthed(token, user);
    } catch (err) {
      setFormError('login', err.message);
    }
  });

  registerForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    setFormError('register', '');
    const fd = new FormData(registerForm);
    try {
      const { token, user } = await api('/register', {
        method: 'POST',
        body: JSON.stringify({
          name: fd.get('name'),
          email: fd.get('email'),
          password: fd.get('password'),
        }),
      });
      onAuthed(token, user);
    } catch (err) {
      setFormError('register', err.message);
    }
  });

  document.getElementById('logout-btn').addEventListener('click', () => {
    state.token = null;
    state.user = null;
    localStorage.removeItem('wallet_token');
    appView.classList.add('is-hidden');
    authView.classList.remove('is-hidden');
    loginForm.reset();
  });

  function onAuthed(token, user) {
    state.token = token;
    state.user = user;
    localStorage.setItem('wallet_token', token);
    authView.classList.add('is-hidden');
    appView.classList.remove('is-hidden');
    renderUser(user);
    loadTransactions();
  }

  // -------------------------------------------------------------------
  // Rendering
  // -------------------------------------------------------------------
  function renderUser(user) {
    userNameEl.textContent = user.name;
    balanceValueEl.textContent = user.balance.toFixed(2);
    accountNumberEl.textContent = user.accountNumber;
  }

  function formatDate(iso) {
    const d = new Date(iso);
    return d.toLocaleDateString(undefined, { day: 'numeric', month: 'short' }) +
      ' · ' + d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
  }

  function renderTransactions(transactions) {
    transactionListEl.innerHTML = '';
    if (!transactions.length) {
      emptyStateEl.classList.remove('is-hidden');
      return;
    }
    emptyStateEl.classList.add('is-hidden');
    for (const tx of transactions) {
      const li = document.createElement('li');
      li.className = 'ledger-row';
      const sign = tx.direction === 'in' ? '+' : tx.direction === 'out' ? '-' : '';
      const amountClass = tx.direction === 'in' ? 'in' : tx.direction === 'out' ? 'out' : '';
      li.innerHTML = `
        <div class="ledger-row-main">
          <span class="ledger-row-title">${escapeHTML(tx.description || tx.type)}</span>
          <span class="ledger-row-meta">${formatDate(tx.createdAt)}</span>
        </div>
        <span class="ledger-row-amount ${amountClass}">${sign}£${Number(tx.amount).toFixed(2)}</span>
      `;
      transactionListEl.appendChild(li);
    }
  }

  function escapeHTML(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  async function refreshBalance() {
    try {
      const { user } = await api('/me');
      state.user = user;
      renderUser(user);
    } catch (err) {
      // token likely expired
      document.getElementById('logout-btn').click();
    }
  }

  async function loadTransactions() {
    try {
      const { transactions } = await api('/transactions');
      renderTransactions(transactions);
    } catch (err) {
      showToast(err.message, 'error');
    }
  }

  // -------------------------------------------------------------------
  // Bottom sheets
  // -------------------------------------------------------------------
  function openSheet(name) {
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

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeSheets();
  });

  // -------------------------------------------------------------------
  // Sheet forms
  // -------------------------------------------------------------------
  function bindSheetForm(name, path, buildPayload) {
    const form = document.querySelector(`[data-form="${name}"]`);
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      setFormError(name, '');
      const fd = new FormData(form);
      const submitBtn = form.querySelector('button[type="submit"]');
      submitBtn.disabled = true;
      try {
        const { user } = await api(path, {
          method: 'POST',
          body: JSON.stringify(buildPayload(fd)),
        });
        state.user = user;
        renderUser(user);
        await loadTransactions();
        closeSheets();
        form.reset();
        showToast(successMessage(name), 'success');
      } catch (err) {
        setFormError(name, err.message);
      } finally {
        submitBtn.disabled = false;
      }
    });
  }

  function successMessage(name) {
    switch (name) {
      case 'fund': return 'Wallet funded.';
      case 'transfer': return 'Transfer sent.';
      case 'withdraw': return 'Withdrawal requested.';
      case 'bill': return 'Bill paid.';
      default: return 'Done.';
    }
  }

  bindSheetForm('fund', '/fund', (fd) => ({
    amount: fd.get('amount'),
    source: fd.get('source'),
  }));

  bindSheetForm('transfer', '/transfer', (fd) => ({
    recipient: fd.get('recipient'),
    amount: fd.get('amount'),
    note: fd.get('note'),
  }));

  bindSheetForm('withdraw', '/withdraw', (fd) => ({
    amount: fd.get('amount'),
    bankName: fd.get('bankName'),
    accountNumber: fd.get('accountNumber'),
  }));

  bindSheetForm('bill', '/pay-bill', (fd) => ({
    billType: fd.get('billType'),
    provider: fd.get('provider'),
    customerId: fd.get('customerId'),
    amount: fd.get('amount'),
  }));

  // -------------------------------------------------------------------
  // Boot
  // -------------------------------------------------------------------
  (async function boot() {
    if (!state.token) return; // stay on auth view
    authView.classList.add('is-hidden');
    appView.classList.remove('is-hidden');
    await refreshBalance();
    await loadTransactions();
  })();
})();

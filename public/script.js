(() => {
  const form = document.getElementById('weather-form');
  const input = document.getElementById('city-input');
  const message = document.getElementById('message');
  const card = document.getElementById('weather-card');
  const cityEl = document.getElementById('city-name');
  const countryEl = document.getElementById('country');
  const tempEl = document.getElementById('temperature');
  const descEl = document.getElementById('description');
  const iconEl = document.getElementById('weather-icon');
  const feelsEl = document.getElementById('feels-like');
  const minEl = document.getElementById('temp-min');
  const maxEl = document.getElementById('temp-max');
  const humidityEl = document.getElementById('humidity');
  const windEl = document.getElementById('wind');
  const pressureEl = document.getElementById('pressure');
  const visibilityEl = document.getElementById('visibility');
  const sunriseEl = document.getElementById('sunrise');
  const sunsetEl = document.getElementById('sunset');
  const coordsEl = document.getElementById('coords');
  const updatedRow = document.querySelector('.updated');
  const updatedEl = document.getElementById('updated');
  const suggestionsEl = document.getElementById('suggestions');
  // Auth & extras
  const authStatus = document.getElementById('auth-status');
  const loginForm = document.getElementById('login-form');
  const registerForm = document.getElementById('register-form');
  const logoutBtn = document.getElementById('logout-btn');
  const favoritesSection = document.getElementById('favorites-section');
  const favoritesList = document.getElementById('favorites-list');
  const addFavoriteBtn = document.getElementById('add-favorite');
  const historySection = document.getElementById('history-section');
  const historyList = document.getElementById('history-list');
  const trendingList = document.getElementById('trending-list');
  const subsSection = document.getElementById('subs-section');
  const subsList = document.getElementById('subs-list');
  const addSubBtn = document.getElementById('add-subscription');
  const adminSection = document.getElementById('admin-section');
  const analyticsTop = document.getElementById('analytics-top');
  const analyticsHour = document.getElementById('analytics-hour');
  const analyticsAvgTemp = document.getElementById('analytics-avgtemp');
  // Modals & nav
  const loginModal = document.getElementById('login-modal');
  const registerModal = document.getElementById('register-modal');
  const openLoginBtn = document.getElementById('open-login');
  const openRegisterBtn = document.getElementById('open-register');

  function setMessage(text, isError = false) {
    message.textContent = text || '';
    message.style.color = isError ? '#ef4444' : '#0f172a';
  }

  function renderWeather(data) {
    if (!data || data.error) {
      card.classList.add('hidden');
      setMessage(data?.error || 'Could not fetch weather.');
      return;
    }
    const { city, country, temperature, description, icon, feels_like, temp_min, temp_max, humidity, wind_speed, pressure, visibility, sunrise, sunset, coord, last_updated } = data;
    cityEl.textContent = city || 'Unknown';
    countryEl.textContent = country ? `(${country})` : '';
    tempEl.textContent = typeof temperature === 'number' ? Math.round(temperature) : '—';
    descEl.textContent = description || '—';
    feelsEl.textContent = typeof feels_like === 'number' ? Math.round(feels_like) : '—';
    minEl.textContent = typeof temp_min === 'number' ? Math.round(temp_min) : '—';
    maxEl.textContent = typeof temp_max === 'number' ? Math.round(temp_max) : '—';
    humidityEl.textContent = humidity ?? '—';
    windEl.textContent = typeof wind_speed === 'number' ? wind_speed.toFixed(1) : '—';
    pressureEl.textContent = pressure ?? '—';
    visibilityEl.textContent = visibility ?? '—';
    sunriseEl.textContent = sunrise ? new Date(sunrise * 1000).toLocaleTimeString() : '—';
    sunsetEl.textContent = sunset ? new Date(sunset * 1000).toLocaleTimeString() : '—';
    coordsEl.textContent = (coord && typeof coord.lat === 'number' && typeof coord.lon === 'number') ? `${coord.lat.toFixed(2)}, ${coord.lon.toFixed(2)}` : '—';
    if (last_updated) {
      updatedRow?.classList.remove('hidden');
      updatedEl.textContent = new Date(last_updated * 1000).toLocaleString();
    } else {
      updatedRow?.classList.add('hidden');
    }

    if (icon) {
      iconEl.src = `https://openweathermap.org/img/wn/${icon}@2x.png`;
      iconEl.alt = description || 'Weather icon';
      iconEl.hidden = false;
    } else {
      iconEl.hidden = true;
      iconEl.removeAttribute('src');
      iconEl.alt = '';
    }

    card.classList.remove('hidden');
  }

  async function fetchWeather(city) {
    const params = new URLSearchParams({ mode: 'weather', city: city.trim() });
    const endpoint = new URL('../server.php', window.location.href).toString();

    try {
      setMessage('Loading...');
      document.body.classList.add('loading');
      const response = await fetch(`${endpoint}?${params.toString()}`, {
        method: 'GET',
        headers: { 'Accept': 'application/json' },
      });
      if (!response.ok) {
        const text = await response.text().catch(() => '');
        throw new Error(text || `Request failed (${response.status})`);
      }
      const data = await response.json();
      renderWeather(data);
      setMessage('');
    } catch (err) {
      renderWeather({ error: err?.message || 'Network error' });
    }
    finally {
      document.body.classList.remove('loading');
    }
  }

  // Debounce utility
  function debounce(fn, delay) {
    let handle = null;
    return (...args) => {
      if (handle) clearTimeout(handle);
      handle = setTimeout(() => fn(...args), delay);
    };
  }

  function clearSuggestions() {
    if (!suggestionsEl) return;
    suggestionsEl.innerHTML = '';
    suggestionsEl.classList.add('hidden');
  }

  function renderSuggestions(items) {
    if (!suggestionsEl) return;
    clearSuggestions();
    if (!Array.isArray(items) || items.length === 0) return;

    const fragment = document.createDocumentFragment();
    items.forEach((item, index) => {
      const name = item?.name || '';
      const country = item?.country || '';
      const div = document.createElement('div');
      div.className = 'suggestion-item';
      div.setAttribute('role', 'option');
      div.setAttribute('aria-selected', 'false');
      div.textContent = country ? `${name}, ${country}` : name;
      div.addEventListener('click', () => {
        input.value = name;
        clearSuggestions();
        input.focus();
      });
      fragment.appendChild(div);
    });
    suggestionsEl.appendChild(fragment);
    suggestionsEl.classList.remove('hidden');
  }

  async function fetchSuggestions(query) {
    const trimmed = query.trim();
    if (!trimmed) {
      clearSuggestions();
      return;
    }
    const endpoint = new URL('../server.php', window.location.href).toString();
    const params = new URLSearchParams({ mode: 'suggest', query: trimmed });
    try {
      const response = await fetch(`${endpoint}?${params.toString()}`, {
        method: 'GET',
        headers: { 'Accept': 'application/json' },
      });
      if (!response.ok) {
        clearSuggestions();
        return;
      }
      const data = await response.json();
      if (!Array.isArray(data)) {
        clearSuggestions();
        return;
      }
      renderSuggestions(data);
    } catch (_) {
      clearSuggestions();
    }
  }

  const debouncedSuggest = debounce(fetchSuggestions, 500);

  form?.addEventListener('submit', (e) => {
    e.preventDefault();
    const city = input?.value || '';
    if (!city.trim()) {
      setMessage('Please enter a city name.', true);
      return;
    }
    clearSuggestions();
    fetchWeather(city);
  });

  input?.addEventListener('input', (e) => {
    const value = e.target?.value ?? '';
    debouncedSuggest(String(value));
  });

  // Hide suggestions when clicking outside
  document.addEventListener('click', (e) => {
    if (!suggestionsEl || !input) return;
    const target = e.target;
    if (target === input) return;
    if (suggestionsEl.contains(target)) return;
    clearSuggestions();
  });

  // ---------- Backend helpers ----------
  const endpoint = new URL('../server.php', window.location.href).toString();
  async function apiGet(params) {
    const url = `${endpoint}?${new URLSearchParams(params).toString()}`;
    const res = await fetch(url, { headers: { 'Accept': 'application/json' } });
    if (!res.ok) throw new Error(`${res.status}`);
    return res.json();
  }
  async function apiPost(params) {
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Accept': 'application/json', 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams(params).toString(),
    });
    if (!res.ok) throw new Error(`${res.status}`);
    return res.json();
  }

  // ---------- Auth ----------
  async function refreshMe() {
    try {
      const { user } = await apiGet({ mode: 'me' });
      if (user) {
        authStatus.textContent = `Logged in as ${user.email}${user.isAdmin ? ' (admin)' : ''}`;
        logoutBtn.hidden = false;
        favoritesSection.hidden = false;
        historySection.hidden = false;
        subsSection.hidden = false;
        if (user.isAdmin) { adminSection.hidden = false; loadAnalytics(); }
        loadFavorites();
        loadHistory();
        loadSubscriptions();
      } else {
        authStatus.textContent = 'Not logged in';
        logoutBtn.hidden = true;
        favoritesSection.hidden = true;
        historySection.hidden = true;
        subsSection.hidden = true;
        adminSection.hidden = true;
      }
    } catch (_) {
      authStatus.textContent = 'Not logged in';
    }
  }

  function showToast(text, kind = 'success') {
    const box = document.getElementById('toast-container');
    if (!box) return;
    const div = document.createElement('div');
    div.className = `toast ${kind}`;
    div.textContent = text;
    box.appendChild(div);
    setTimeout(() => { div.remove(); }, 3000);
  }

  loginForm?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = document.getElementById('login-email').value;
    const password = document.getElementById('login-password').value;
    const msg = document.getElementById('login-message');
    msg.textContent = '';
    try { await apiPost({ mode: 'login', email, password }); await refreshMe(); closeModal('login-modal'); showToast('Logged in successfully', 'success'); }
    catch (err) { msg.textContent = 'Login failed'; showToast('Login failed', 'error'); }
  });

  registerForm?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = document.getElementById('register-email').value;
    const password = document.getElementById('register-password').value;
    const password2 = document.getElementById('register-password2').value;
    const msg = document.getElementById('register-message');
    msg.textContent = '';
    if (password !== password2) { msg.textContent = 'Passwords do not match.'; return; }
    try { await apiPost({ mode: 'register', email, password }); await refreshMe(); closeModal('register-modal'); showToast('Registered successfully', 'success'); openModal('login-modal'); document.getElementById('login-email').value = email; }
    catch (err) { msg.textContent = 'Registration failed'; showToast('Registration failed', 'error'); }
  });

  logoutBtn?.addEventListener('click', async () => {
    try { await apiPost({ mode: 'logout' }); await refreshMe(); }
    catch (_) {}
  });

  // ---------- Favorites ----------
  async function loadFavorites() {
    try {
      const items = await apiGet({ mode: 'favorites', action: 'list' });
      favoritesList.innerHTML = '';
      items.forEach((city) => {
        const chip = document.createElement('div');
        chip.className = 'chip';
        const btn = document.createElement('button');
        btn.textContent = city;
        btn.addEventListener('click', () => fetchWeather(city));
        const del = document.createElement('button');
        del.textContent = '✕';
        del.title = 'Remove';
        del.addEventListener('click', async () => { await apiPost({ mode: 'favorites', action: 'delete', city }); loadFavorites(); });
        chip.appendChild(btn);
        chip.appendChild(del);
        favoritesList.appendChild(chip);
      });
    } catch (_) {}
  }

  addFavoriteBtn?.addEventListener('click', async () => {
    const city = input.value.trim();
    if (!city) return;
    try { await apiPost({ mode: 'favorites', action: 'add', city }); loadFavorites(); }
    catch (_) {}
  });

  // ---------- History ----------
  async function loadHistory() {
    try {
      const items = await apiGet({ mode: 'history' });
      historyList.innerHTML = '';
      items.forEach((row) => {
        const li = document.createElement('li');
        li.textContent = row.city;
        li.addEventListener('click', () => fetchWeather(row.city));
        historyList.appendChild(li);
      });
    } catch (_) {}
  }

  // ---------- Trending ----------
  async function loadTrending() {
    try {
      const items = await apiGet({ mode: 'trending' });
      trendingList.innerHTML = '';
      items.forEach((row) => {
        const li = document.createElement('li');
        li.textContent = `${row.city} (${row.cnt})`;
        li.addEventListener('click', () => fetchWeather(row.city));
        trendingList.appendChild(li);
      });
    } catch (_) {}
  }

  // ---------- Subscriptions ----------
  async function loadSubscriptions() {
    try {
      const items = await apiGet({ mode: 'subscriptions', action: 'list' });
      subsList.innerHTML = '';
      items.forEach((city) => {
        const chip = document.createElement('div');
        chip.className = 'chip';
        const btn = document.createElement('button');
        btn.textContent = city;
        btn.addEventListener('click', () => fetchWeather(city));
        const del = document.createElement('button');
        del.textContent = '✕';
        del.title = 'Unsubscribe';
        del.addEventListener('click', async () => { await apiPost({ mode: 'subscriptions', action: 'delete', city }); loadSubscriptions(); });
        chip.appendChild(btn);
        chip.appendChild(del);
        subsList.appendChild(chip);
      });
    } catch (_) {}
  }
  addSubBtn?.addEventListener('click', async () => {
    const city = input.value.trim();
    if (!city) return;
    try { await apiPost({ mode: 'subscriptions', action: 'add', city }); loadSubscriptions(); }
    catch (_) {}
  });

  // ---------- Analytics (Admin) ----------
  async function loadAnalytics() {
    try {
      const data = await apiGet({ mode: 'analytics' });
      analyticsAvgTemp.textContent = (data.avgTemp ?? '—').toString();
      // Charts
      const ctxTop = document.getElementById('chart-top')?.getContext('2d');
      const ctxHour = document.getElementById('chart-hour')?.getContext('2d');
      const ctxFav = document.getElementById('chart-fav')?.getContext('2d');
      if (ctxTop && window.Chart) {
        const labels = data.topCities.map(r => r.city);
        const values = data.topCities.map(r => Number(r.cnt));
        if (window._chartTop) window._chartTop.destroy();
        window._chartTop = new Chart(ctxTop, {
          type: 'bar',
          data: { labels, datasets: [{ label: 'Top Cities', data: values, backgroundColor: 'rgba(79,172,254,0.6)', borderColor: 'rgba(79,172,254,1)', borderWidth: 1 }] },
          options: { responsive: true, plugins: { legend: { display: false } }, scales: { x: { ticks: { color: getComputedStyle(document.documentElement).getPropertyValue('--text') } }, y: { ticks: { color: getComputedStyle(document.documentElement).getPropertyValue('--text') } } } }
        });
      }
      if (ctxHour && window.Chart) {
        const labels = data.perHour.map(r => r.hour);
        const values = data.perHour.map(r => Number(r.cnt));
        if (window._chartHour) window._chartHour.destroy();
        window._chartHour = new Chart(ctxHour, {
          type: 'line',
          data: { labels, datasets: [{ label: 'Searches', data: values, borderColor: 'rgba(0,242,254,1)', backgroundColor: 'rgba(0,242,254,0.2)', tension: 0.3 }] },
          options: { responsive: true, plugins: { legend: { display: false } }, scales: { x: { ticks: { color: getComputedStyle(document.documentElement).getPropertyValue('--text') } }, y: { ticks: { color: getComputedStyle(document.documentElement).getPropertyValue('--text') } } } }
        });
      }
      if (ctxFav && window.Chart) {
        // For demo, use topCities as proxy for favorites distribution unless a dedicated endpoint is added
        const labels = data.topCities.map(r => r.city);
        const values = data.topCities.map(r => Number(r.cnt));
        if (window._chartFav) window._chartFav.destroy();
        window._chartFav = new Chart(ctxFav, {
          type: 'pie',
          data: { labels, datasets: [{ data: values, backgroundColor: labels.map((_, i) => `hsl(${(i*36)%360} 90% 60% / 0.9)`)}] },
          options: { responsive: true }
        });
      }
    } catch (_) {}
  }

  // Initial loads
  refreshMe();
  loadTrending();

  // Simple page routing
  const navHome = document.getElementById('nav-home');
  const navLogin = document.getElementById('nav-login');
  const navRegister = document.getElementById('nav-register');
  const navLogout = document.getElementById('nav-logout');
  function setActive(btn) {
    [navHome, navLogin, navRegister].forEach(b => b?.classList.remove('active'));
    btn?.classList.add('active');
  }
  navHome?.addEventListener('click', () => setActive(navHome));
  navLogin?.addEventListener('click', () => setActive(navLogin));
  navRegister?.addEventListener('click', () => setActive(navRegister));
  // Logout button mirrors backend logout already wired

  // Dark mode toggle
  const themeToggle = document.getElementById('theme-toggle');
  function applyTheme(mode) {
    const dark = mode === 'dark';
    document.documentElement.classList.toggle('light', !dark);
    localStorage.setItem('theme', dark ? 'dark' : 'light');
  }
  const savedTheme = localStorage.getItem('theme');
  const prefersDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
  const initial = savedTheme || (prefersDark ? 'dark' : 'light');
  themeToggle.checked = initial === 'dark';
  applyTheme(initial);
  themeToggle?.addEventListener('change', (e) => applyTheme(e.target.checked ? 'dark' : 'light'));

  // Modals
  function openModal(id) { const m = document.getElementById(id); if (m) m.classList.remove('hidden'); }
  function closeModal(id) { const m = document.getElementById(id); if (m) m.classList.add('hidden'); }
  openLoginBtn?.addEventListener('click', () => openModal('login-modal'));
  openRegisterBtn?.addEventListener('click', () => openModal('register-modal'));
  document.querySelectorAll('.modal-close')?.forEach(btn => btn.addEventListener('click', (e) => {
    const id = e.currentTarget.getAttribute('data-close');
    if (id) closeModal(id);
  }));
  window.addEventListener('keydown', (e) => { if (e.key === 'Escape') { closeModal('login-modal'); closeModal('register-modal'); } });

  // Footer year
  document.getElementById('year').textContent = String(new Date().getFullYear());
})();


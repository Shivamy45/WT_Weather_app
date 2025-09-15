(() => {
  const form = document.getElementById('weather-form');
  const input = document.getElementById('city-input');
  const message = document.getElementById('message');
  const card = document.getElementById('weather-card');
  const cityEl = document.getElementById('city-name');
  const tempEl = document.getElementById('temperature');
  const descEl = document.getElementById('description');
  const iconEl = document.getElementById('weather-icon');
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
    const { city, temperature, description, icon } = data;
    cityEl.textContent = city || 'Unknown';
    tempEl.textContent = typeof temperature === 'number' ? Math.round(temperature) : '—';
    descEl.textContent = description || '—';

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

  loginForm?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = document.getElementById('login-email').value;
    const password = document.getElementById('login-password').value;
    try { await apiPost({ mode: 'login', email, password }); await refreshMe(); }
    catch (err) { setMessage('Login failed', true); }
  });

  registerForm?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = document.getElementById('register-email').value;
    const password = document.getElementById('register-password').value;
    try { await apiPost({ mode: 'register', email, password }); await refreshMe(); }
    catch (err) { setMessage('Registration failed', true); }
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
        const ts = new Date(row.searched_at?.replace(' ', 'T'));
        li.textContent = `${row.city} — ${isNaN(ts) ? row.searched_at : ts.toLocaleString()}`;
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
      analyticsTop.innerHTML = '';
      data.topCities.forEach((row) => {
        const li = document.createElement('li');
        li.textContent = `${row.city} (${row.cnt})`;
        analyticsTop.appendChild(li);
      });
      analyticsHour.innerHTML = '';
      data.perHour.forEach((row) => {
        const li = document.createElement('li');
        const date = new Date(row.hour.replace(' ', 'T'));
        li.textContent = `${isNaN(date) ? row.hour : date.toLocaleString()} — ${row.cnt}`;
        analyticsHour.appendChild(li);
      });
      analyticsAvgTemp.textContent = (data.avgTemp ?? '—').toString();
    } catch (_) {}
  }

  // Initial loads
  refreshMe();
  loadTrending();
})();


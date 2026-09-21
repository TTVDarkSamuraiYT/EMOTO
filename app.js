(() => {
  'use strict';
  const $ = (id) => document.getElementById(id);
  const page = document.body.dataset.page;
  const legacyKey = 'yozma-in10-rides';

  document.querySelectorAll('[data-nav]').forEach((link) => link.classList.toggle('active', link.dataset.nav === page));

  function money(value) {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(value);
  }

  function timeText(hours) {
    const totalMinutes = Math.max(0, Math.round(hours * 60));
    return `${Math.floor(totalMinutes / 60)}h ${totalMinutes % 60}m`;
  }

  if (page === 'charging') {
    const form = $('chargingForm');
    const update = () => {
      const voltage = Number($('batteryVoltage').value), ah = Number($('batteryAh').value);
      const current = Number($('currentBattery').value), price = Number($('priceKwh').value), watts = Number($('chargerWatts').value);
      if (![voltage, ah, current, price, watts].every(Number.isFinite) || voltage <= 0 || ah <= 0 || current < 0 || current > 100 || price < 0 || watts <= 0) return;
      const wh = voltage * ah, kwh = wh / 1000, neededKwh = kwh * (1 - current / 100), wallKwh = neededKwh * 1.15, hours = wallKwh / (watts / 1000);
      $('energyWh').textContent = `${Math.round(wh).toLocaleString()} Wh`;
      $('energyKwh').textContent = `${kwh.toFixed(2)} kWh stored`;
      $('neededKwh').textContent = `${neededKwh.toFixed(2)} kWh`;
      $('chargeFrom').textContent = current;
      $('chargeTime').textContent = timeText(hours);
      $('chargeCost').textContent = money(wallKwh * price);
    };
    form.addEventListener('submit', (event) => { event.preventDefault(); update(); });
    form.querySelectorAll('input').forEach((input) => input.addEventListener('input', update));
    update();
  }

  if (page !== 'tracker') return;

  const escapeHtml = (text) => String(text).replace(/[&<>'"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[char]);
  const config = window.YOZMA_SUPABASE || {};
  const supabaseUrl = String(config.url || '').replace(/\/$/, '');
  const configured = /^https:\/\/.+\.supabase\.co$/i.test(supabaseUrl) && Boolean(config.key) && !config.key.startsWith('PASTE_');
  const client = configured && window.supabase ? window.supabase.createClient(supabaseUrl, config.key) : null;
  let currentUser = null;
  let rides = [];

  const setSyncMessage = (title, message, signedIn = false) => {
    $('syncTitle').textContent = title;
    $('syncStatus').textContent = message;
    $('syncSignIn').hidden = signedIn;
    $('syncSignOut').hidden = !signedIn;
    $('rideForm').querySelector('button[type="submit"]').disabled = !signedIn;
  };

  const render = () => {
    const averageFor = (items) => items.length ? items.reduce((sum, item) => sum + item.estimatedRange, 0) / items.length : null;
    const modeCards = [1, 2, 3].map((mode) => {
      const matches = rides.filter((ride) => Number(ride.mode) === mode), average = averageFor(matches);
      return `<article class="mode-card"><p>MODE ${mode}</p><strong>${average === null ? '—' : `${average.toFixed(1)} mi`}</strong><small>${matches.length} ride${matches.length === 1 ? '' : 's'} logged</small></article>`;
    });
    const overall = averageFor(rides);
    modeCards.push(`<article class="mode-card"><p>ALL MODES</p><strong>${overall === null ? '—' : `${overall.toFixed(1)} mi`}</strong><small>${rides.length} ride${rides.length === 1 ? '' : 's'} logged</small></article>`);
    $('modeAverages').innerHTML = modeCards.join('');
    $('ridesTable').innerHTML = rides.map((ride) => `<tr><td>${new Date(ride.date).toLocaleDateString()}</td><td>Mode ${ride.mode}</td><td>${ride.distance.toFixed(2)} mi</td><td>${ride.used.toFixed(1)}%</td><td>${ride.estimatedRange.toFixed(1)} mi</td><td>${escapeHtml(ride.notes || '—')}</td><td><button class="delete-ride" type="button" data-id="${ride.id}">Delete</button></td></tr>`).join('');
    $('ridesEmpty').hidden = rides.length > 0;
  };

  const loadRides = async () => {
    const { data, error } = await client.from('yozma_rides').select('*').order('ride_date', { ascending: false });
    if (error) throw error;
    rides = data.map((ride) => ({ id: ride.id, date: ride.ride_date, mode: Number(ride.mode), distance: Number(ride.distance), used: Number(ride.battery_used), estimatedRange: Number(ride.estimated_range), notes: ride.notes }));
    render();
  };

  const importLegacyRides = async () => {
    try {
      const saved = JSON.parse(localStorage.getItem(legacyKey)) || [];
      if (!saved.length) return;
      const records = saved.filter((ride) => Number(ride.mode) >= 1 && Number(ride.mode) <= 3).map((ride) => ({ user_id: currentUser.id, ride_date: ride.date, mode: Number(ride.mode), distance: Number(ride.distance), battery_used: Number(ride.used), estimated_range: Number(ride.estimatedRange), notes: ride.notes || '' }));
      if (!records.length) return;
      const { error } = await client.from('yozma_rides').insert(records);
      if (error) throw error;
      localStorage.removeItem(legacyKey);
    } catch (error) { console.warn('Previous device-only rides could not be imported.', error); }
  };

  const startSignedInSession = async (user) => {
    currentUser = user;
    setSyncMessage('Your rides are syncing', `Signed in as ${user.email}. Add or remove rides from any device using this email.`, true);
    await importLegacyRides();
    await loadRides();
  };

  const initialize = async () => {
    render();
    if (!client) {
      setSyncMessage('Supabase needs connecting', 'Add your Supabase Project URL and publishable key in supabase-config.js, then refresh this page.');
      return;
    }
    const { data: { session } } = await client.auth.getSession();
    if (session?.user) await startSignedInSession(session.user);
    else setSyncMessage('Connect your rides', 'Sign in with the same email on each device to see the same ride data.');
    client.auth.onAuthStateChange((event, session) => {
      if ((event === 'SIGNED_IN' || event === 'INITIAL_SESSION') && session?.user) startSignedInSession(session.user).catch(showError);
      if (event === 'SIGNED_OUT') { currentUser = null; rides = []; render(); setSyncMessage('Connect your rides', 'Sign in with the same email on each device to see the same ride data.'); }
    });
  };

  const showError = (error) => {
    console.error(error);
    setSyncMessage('Sync needs attention', error.message || 'Something went wrong. Check your Supabase setup and try again.', Boolean(currentUser));
  };

  $('syncSignIn').addEventListener('click', async () => {
    if (!client) return;
    const email = prompt('Enter the email address you will use on both devices:');
    if (!email) return;
    const { error } = await client.auth.signInWithOtp({ email, options: { emailRedirectTo: `${window.location.origin}${window.location.pathname}` } });
    if (error) return showError(error);
    setSyncMessage('Check your email', 'Open the sign-in link in your email, then return here.');
  });

  $('syncSignOut').addEventListener('click', async () => {
    const { error } = await client.auth.signOut();
    if (error) showError(error);
  });

  $('rideForm').addEventListener('submit', async (event) => {
    event.preventDefault();
    if (!currentUser) return;
    const mode = Number($('rideMode').value), distance = Number($('rideDistance').value), used = Number($('batteryUsed').value);
    if (!Number.isFinite(distance) || !Number.isFinite(used) || distance <= 0 || used <= 0 || used > 100) return;
    const { error } = await client.from('yozma_rides').insert({ user_id: currentUser.id, mode, distance, battery_used: used, estimated_range: distance / used * 100, notes: $('rideNotes').value.trim() });
    if (error) return showError(error);
    event.target.reset(); $('rideMode').value = '1';
    try { await loadRides(); } catch (error) { showError(error); }
  });

  $('ridesTable').addEventListener('click', async (event) => {
    const button = event.target.closest('[data-id]'); if (!button || !currentUser) return;
    const { error } = await client.from('yozma_rides').delete().eq('id', button.dataset.id);
    if (error) return showError(error);
    try { await loadRides(); } catch (error) { showError(error); }
  });

  $('clearRides').addEventListener('click', async () => {
    if (!currentUser || !rides.length || !confirm('Clear every synced ride? This cannot be undone.')) return;
    const { error } = await client.from('yozma_rides').delete().eq('user_id', currentUser.id);
    if (error) return showError(error);
    try { await loadRides(); } catch (error) { showError(error); }
  });

  initialize().catch(showError);
})();

(() => {
  'use strict';
  const key = 'yozma-in10-rides';
  const $ = (id) => document.getElementById(id);
  const page = document.body.dataset.page;

  document.querySelectorAll('[data-nav]').forEach((link) => {
    link.classList.toggle('active', link.dataset.nav === page);
  });

  function readRides() {
    try { return JSON.parse(localStorage.getItem(key)) || []; } catch { return []; }
  }
  function writeRides(rides) { localStorage.setItem(key, JSON.stringify(rides)); }
  function money(value) { return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(value); }
  function timeText(hours) {
    const total = Math.max(0, Math.round(hours * 60));
    return `${Math.floor(total / 60)}h ${total % 60}m`;
  }

  if (page === 'dashboard') {
    const count = $('dashboardRideCount');
    if (count) { const rides = readRides(); count.textContent = `${rides.length} ride${rides.length === 1 ? '' : 's'} saved`; }
  }

  if (page === 'charging') {
    const form = $('chargingForm');
    const update = () => {
      const voltage = Number($('batteryVoltage').value);
      const ah = Number($('batteryAh').value);
      const watts = Number($('chargerWatts').value);
      const price = Number($('priceKwh').value);
      if (![voltage, ah, watts, price].every(Number.isFinite) || voltage <= 0 || ah <= 0 || watts <= 0 || price < 0) return;
      const wh = voltage * ah;
      const kwh = wh / 1000;
      const wallKwh = kwh * 1.15;
      const hours = (wallKwh / (watts / 1000));
      $('energyWh').textContent = `${Math.round(wh).toLocaleString()} Wh`;
      $('energyKwh').textContent = `${kwh.toFixed(2)} kWh stored`;
      $('wallKwh').textContent = `${wallKwh.toFixed(2)} kWh`;
      $('chargeTime').textContent = timeText(hours);
      $('chargeCost').textContent = money(wallKwh * price);
    };
    form.addEventListener('submit', (event) => { event.preventDefault(); update(); });
    form.querySelectorAll('input').forEach((input) => input.addEventListener('input', update));
    update();
  }

  if (page === 'tracker') {
    const render = () => {
      const rides = readRides();
      const averages = $('modeAverages');
      averages.innerHTML = [1, 2, 3, 4].map((mode) => {
        const matches = rides.filter((ride) => Number(ride.mode) === mode);
        const average = matches.length ? matches.reduce((sum, ride) => sum + ride.estimatedRange, 0) / matches.length : null;
        return `<article class="mode-card"><p>MODE ${mode}</p><strong>${average === null ? '—' : `${average.toFixed(1)} mi`}</strong><small>${matches.length} ride${matches.length === 1 ? '' : 's'} logged</small></article>`;
      }).join('');
      const body = $('ridesTable');
      body.innerHTML = rides.map((ride) => `<tr><td>${new Date(ride.date).toLocaleDateString()}</td><td>Mode ${ride.mode}</td><td>${ride.distance.toFixed(2)} mi</td><td>${ride.used.toFixed(1)}%</td><td>${ride.estimatedRange.toFixed(1)} mi</td><td>${escapeHtml(ride.notes || '—')}</td><td><button class="delete-ride" type="button" data-id="${ride.id}">Delete</button></td></tr>`).join('');
      $('ridesEmpty').hidden = rides.length > 0;
    };
    const escapeHtml = (text) => String(text).replace(/[&<>'"]/g, (char) => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', "'":'&#39;', '"':'&quot;' })[char]);
    $('rideForm').addEventListener('submit', (event) => {
      event.preventDefault();
      const mode = Number($('rideMode').value), distance = Number($('rideDistance').value), used = Number($('batteryUsed').value);
      if (!Number.isFinite(distance) || !Number.isFinite(used) || distance <= 0 || used <= 0 || used > 100) return;
      const rides = readRides();
      rides.unshift({ id: `${Date.now()}-${Math.random()}`, date: new Date().toISOString(), mode, distance, used, estimatedRange: distance / used * 100, notes: $('rideNotes').value.trim() });
      writeRides(rides); event.target.reset(); $('rideMode').value = '1'; render();
    });
    $('ridesTable').addEventListener('click', (event) => {
      const button = event.target.closest('[data-id]'); if (!button) return;
      writeRides(readRides().filter((ride) => ride.id !== button.dataset.id)); render();
    });
    $('clearRides').addEventListener('click', () => { if (readRides().length && confirm('Clear every saved ride on this device?')) { localStorage.removeItem(key); render(); } });
    render();
  }
})();

const INR = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  maximumFractionDigits: 0
});

const LOCAL_SESSIONS_KEY = 'pokerFinishedSessions';

const STARTER_PLAYERS = [
  'Rishabh',
  'Raj',
  'Divy',
  'Karan',
  'Rowan',
  'Akshat'
];

const state = {
  screen: 'screenStart',
  session: null,
  sessions: [],
  defaultPlayers: loadDefaultPlayers(),
  password: localStorage.getItem('pokerAppPassword') || ''
};

const $ = (id) => document.getElementById(id);
const uid = () => crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
const money = (n) => INR.format(Math.round(Number(n) || 0));
const cleanName = (name) => name.trim().replace(/\s+/g, ' ');

function loadDefaultPlayers() {
  const saved = localStorage.getItem('pokerDefaultPlayers');
  if (!saved) return STARTER_PLAYERS;
  try {
    const parsed = JSON.parse(saved);
    return Array.isArray(parsed) && parsed.length ? parsed : STARTER_PLAYERS;
  } catch {
    return STARTER_PLAYERS;
  }
}

function saveDefaultPlayers(players) {
  state.defaultPlayers = players;
  localStorage.setItem('pokerDefaultPlayers', JSON.stringify(players));
}

function loadLocalSessions() {
  try {
    const sessions = JSON.parse(localStorage.getItem(LOCAL_SESSIONS_KEY) || '[]');
    return Array.isArray(sessions) ? sessions : [];
  } catch {
    return [];
  }
}

function saveLocalSessions(sessions) {
  localStorage.setItem(LOCAL_SESSIONS_KEY, JSON.stringify(sessions));
}

function mergeSessions(...groups) {
  const sessionsById = new Map();
  groups.flat().forEach((session) => {
    if (session?.id) sessionsById.set(session.id, session);
  });
  return [...sessionsById.values()].sort((a, b) => new Date(a.finishedAt || a.createdAt) - new Date(b.finishedAt || b.createdAt));
}

function cacheFinishedSession(session) {
  state.sessions = mergeSessions(state.sessions, loadLocalSessions(), [session]);
  saveLocalSessions(state.sessions);
}

function saveDraft() {
  if (state.session) localStorage.setItem('pokerDraftSession', JSON.stringify(state.session));
}

function loadDraft() {
  const raw = localStorage.getItem('pokerDraftSession');
  if (!raw) return;
  try {
    const draft = JSON.parse(raw);
    if (draft?.players?.length) state.session = draft;
  } catch {}
}

function showToast(message) {
  const toast = $('toast');
  toast.textContent = message;
  toast.classList.add('show');
  window.setTimeout(() => toast.classList.remove('show'), 2400);
}

function showScreen(id) {
  document.querySelectorAll('.screen').forEach((el) => el.classList.remove('active'));
  $(id).classList.add('active');
  state.screen = id;
  window.scrollTo({ top: 0, behavior: 'smooth' });
  render();
}

function totalBuyIns() {
  return state.session.players.reduce((sum, p) => sum + p.buyIns * state.session.buyInAmount, 0);
}

function totalFinalStacks() {
  return state.session.players.reduce((sum, p) => sum + (Number(p.finalAmount) || 0), 0);
}

function allFinalsEntered() {
  return state.session.players.every((p) => p.finalAmount !== '' && p.finalAmount !== null && !Number.isNaN(Number(p.finalAmount)));
}

function playerNet(player) {
  return (Number(player.finalAmount) || 0) - player.buyIns * state.session.buyInAmount;
}

function calculateSettlements(players, buyInAmount) {
  const creditors = [];
  const debtors = [];

  players.forEach((player) => {
    const net = (Number(player.finalAmount) || 0) - player.buyIns * buyInAmount;
    const item = { name: player.name, amount: Math.round(Math.abs(net)) };
    if (net > 0) creditors.push(item);
    if (net < 0) debtors.push(item);
  });

  creditors.sort((a, b) => b.amount - a.amount);
  debtors.sort((a, b) => b.amount - a.amount);

  const payments = [];
  let i = 0;
  let j = 0;

  while (i < debtors.length && j < creditors.length) {
    const amount = Math.min(debtors[i].amount, creditors[j].amount);
    if (amount > 0) {
      payments.push({ from: debtors[i].name, to: creditors[j].name, amount });
    }
    debtors[i].amount -= amount;
    creditors[j].amount -= amount;
    if (debtors[i].amount === 0) i += 1;
    if (creditors[j].amount === 0) j += 1;
  }

  return payments;
}

function startSession() {
  const name = $('sessionName').value.trim() || new Date().toLocaleDateString('en-IN', { dateStyle: 'medium' });
  const buyInAmount = Math.max(1, Number($('defaultBuyIn').value) || 1000);
  const uniquePlayers = [...new Set(state.defaultPlayers.map(cleanName).filter(Boolean))];

  state.session = {
    id: uid(),
    name,
    createdAt: new Date().toISOString(),
    buyInAmount,
    players: uniquePlayers.map((name) => ({ id: uid(), name, buyIns: 1, finalAmount: '' })),
    buyInsConfirmed: false,
    finishedAt: null,
    settlements: []
  };
  saveDraft();
  showScreen('screenBuyIns');
}

function addPlayer() {
  const input = $('newPlayerName');
  const name = cleanName(input.value);
  if (!name) return;
  if (state.session.players.some((p) => p.name.toLowerCase() === name.toLowerCase())) {
    showToast('That player is already in this game.');
    return;
  }
  state.session.players.push({ id: uid(), name, buyIns: 1, finalAmount: '' });
  input.value = '';
  saveDraft();
  renderBuyIns();
}

function changeBuyIn(playerId, delta) {
  const player = state.session.players.find((p) => p.id === playerId);
  if (!player) return;
  player.buyIns = Math.max(1, player.buyIns + delta);
  saveDraft();
  renderBuyIns();
}

function removePlayer(playerId) {
  if (state.session.players.length <= 2) {
    showToast('Keep at least 2 players.');
    return;
  }
  state.session.players = state.session.players.filter((p) => p.id !== playerId);
  saveDraft();
  renderBuyIns();
}

function updateFinalAmount(playerId, value) {
  const player = state.session.players.find((p) => p.id === playerId);
  if (!player) return;
  player.finalAmount = value === '' ? '' : Math.max(0, Number(value));
  saveDraft();
  renderFinals(false);
}

function renderBuyIns() {
  if (!state.session) return;
  $('buyInTotal').textContent = money(totalBuyIns());
  $('playerCount').textContent = state.session.players.length;
  $('buyInIncrementLabel').textContent = money(state.session.buyInAmount);
  $('confirmBuyIns').checked = !!state.session.buyInsConfirmed;
  $('endGameBtn').disabled = !state.session.buyInsConfirmed;

  $('buyInCards').innerHTML = state.session.players.map((player) => `
    <article class="player-card">
      <div class="player-head">
        <div>
          <div class="player-name">${escapeHtml(player.name)}</div>
          <p class="label">Current buy-in: ${money(player.buyIns * state.session.buyInAmount)}</p>
        </div>
        <button class="remove-btn" data-remove-player="${player.id}">Remove</button>
      </div>
      <div class="buyin-controls">
        <button class="round-btn" data-buyin-minus="${player.id}" aria-label="Remove buy-in for ${escapeHtml(player.name)}">−</button>
        <div class="buyin-number">
          <strong>${player.buyIns}</strong>
          <span>${player.buyIns === 1 ? 'buy-in' : 'buy-ins'}</span>
        </div>
        <button class="round-btn" data-buyin-plus="${player.id}" aria-label="Add buy-in for ${escapeHtml(player.name)}">+</button>
      </div>
    </article>
  `).join('');
}

function renderFinals(renderCards = true) {
  if (!state.session) return;
  const buyTotal = totalBuyIns();
  const stackTotal = totalFinalStacks();
  const difference = stackTotal - buyTotal;
  const valid = allFinalsEntered() && difference === 0;

  $('finalBuyInTotal').textContent = money(buyTotal);
  $('finalStacksTotal').textContent = money(stackTotal);
  $('differenceTotal').textContent = money(difference);
  $('differenceTotal').className = difference === 0 ? 'positive' : difference > 0 ? 'negative' : 'negative';

  const tally = $('tallyMessage');
  tally.className = `notice show ${valid ? 'ok' : 'bad'}`;
  if (!allFinalsEntered()) {
    tally.textContent = 'Enter every player’s final amount. The settlement updates live as you type.';
  } else if (difference > 0) {
    tally.textContent = `Final stacks are ${money(difference)} too high. Recheck chip counts/final amounts.`;
  } else if (difference < 0) {
    tally.textContent = `Final stacks are ${money(Math.abs(difference))} too low. Recheck chip counts/final amounts.`;
  } else {
    tally.textContent = 'Perfect tally. Final stacks match total buy-ins.';
  }

  if (renderCards) {
    $('finalCards').innerHTML = state.session.players.map((player) => `
      <article class="player-card">
        <div class="player-head">
          <div>
            <div class="player-name">${escapeHtml(player.name)}</div>
            <p class="label">Bought in for ${money(player.buyIns * state.session.buyInAmount)}</p>
          </div>
          <span class="net-pill neutral" data-final-net="${player.id}">Waiting</span>
        </div>
        <div class="final-row">
          <label>
            <span class="field-label">Final amount</span>
            <div class="currency-input">
              <span>₹</span>
              <input class="input no-border" type="number" min="0" step="1" inputmode="numeric" value="${player.finalAmount}" data-final-input="${player.id}" placeholder="0" autocomplete="off" />
            </div>
          </label>
        </div>
      </article>
    `).join('');
  }

  state.session.players.forEach((player) => {
    const net = player.finalAmount === '' ? null : playerNet(player);
    const netPill = document.querySelector(`[data-final-net="${player.id}"]`);
    if (!netPill) return;
    netPill.className = `net-pill ${net === null || net === 0 ? 'neutral' : net > 0 ? 'positive' : 'negative'}`;
    netPill.textContent = net === null ? 'Waiting' : `${net > 0 ? '+' : ''}${money(net)}`;
  });

  const payments = calculateSettlements(state.session.players, state.session.buyInAmount);
  $('liveSettlement').innerHTML = payments.length
    ? payments.map((p) => `<div class="payment-row"><span><b>${escapeHtml(p.from)}</b> pays <b>${escapeHtml(p.to)}</b></span><strong>${money(p.amount)}</strong></div>`).join('')
    : allFinalsEntered() ? '<div class="payment-row"><span>No one owes anything.</span><strong>Settled</strong></div>' : 'Enter final stacks to see payments.';

  $('finishBtn').disabled = !valid;
}

async function finishSession() {
  const buyTotal = totalBuyIns();
  const stackTotal = totalFinalStacks();
  if (!allFinalsEntered() || buyTotal !== stackTotal) return;

  const settlements = calculateSettlements(state.session.players, state.session.buyInAmount);
  state.session = {
    ...state.session,
    finishedAt: new Date().toISOString(),
    totalBuyIns: buyTotal,
    settlements,
    players: state.session.players.map((p) => ({
      ...p,
      buyInTotal: p.buyIns * state.session.buyInAmount,
      finalAmount: Number(p.finalAmount),
      net: playerNet(p)
    }))
  };

  cacheFinishedSession(state.session);
  localStorage.removeItem('pokerDraftSession');

  try {
    const saved = await saveSessionToServer(state.session);
    cacheFinishedSession(saved.session || state.session);
    showToast('Session saved.');
  } catch (error) {
    console.error(error);
    showToast('Saved on this device. Online sync will retry automatically.');
  }

  await loadSessions();
  renderSummary();
  showScreen('screenSummary');
}

function renderSummary() {
  const s = state.session;
  const sortedPlayers = [...s.players].sort((a, b) => b.net - a.net);
  $('summaryContent').innerHTML = `
    <div class="panel highlight-panel">
      <p class="eyebrow">${new Date(s.finishedAt || s.createdAt).toLocaleString()}</p>
      <h2>${escapeHtml(s.name)}</h2>
      <div class="stats-grid">
        <div class="stat-card"><span>Total buy-in</span><strong>${money(s.totalBuyIns)}</strong></div>
        <div class="stat-card"><span>Players</span><strong>${s.players.length}</strong></div>
        <div class="stat-card"><span>Buy-in size</span><strong>${money(s.buyInAmount)}</strong></div>
        <div class="stat-card"><span>Payments</span><strong>${s.settlements.length}</strong></div>
      </div>
    </div>
    <div class="panel">
      <h2>Up / Down</h2>
      ${sortedPlayers.map((p) => `<div class="summary-row"><b>${escapeHtml(p.name)}</b> <span class="net-pill ${p.net > 0 ? 'positive' : p.net < 0 ? 'negative' : 'neutral'}">${p.net > 0 ? '+' : ''}${money(p.net)}</span><p class="label">Bought in ${money(p.buyInTotal)} • Ended ${money(p.finalAmount)}</p></div>`).join('')}
    </div>
    <div class="panel">
      <h2>Who pays who</h2>
      <div class="settlement-list">
        ${s.settlements.length ? s.settlements.map((p) => `<div class="payment-row"><span><b>${escapeHtml(p.from)}</b> pays <b>${escapeHtml(p.to)}</b></span><strong>${money(p.amount)}</strong></div>`).join('') : '<div class="payment-row"><span>No payments needed.</span><strong>Settled</strong></div>'}
      </div>
    </div>
  `;
}

async function loadSessions() {
  const localSessions = loadLocalSessions();
  state.sessions = mergeSessions(state.sessions, localSessions);

  try {
    const response = await fetch('/api/sessions', {
      headers: authHeaders()
    });
    if (response.status === 401) throw new Error('Password needed. Tap settings and enter your app password.');
    if (!response.ok) throw new Error('Could not load saved sessions.');
    const data = await response.json();
    const serverSessions = Array.isArray(data.sessions) ? data.sessions : [];
    const serverIds = new Set(serverSessions.map((session) => session.id));
    const unsyncedSessions = localSessions.filter((session) => !serverIds.has(session.id));

    for (const session of unsyncedSessions) {
      try {
        const result = await saveSessionToServer(session);
        if (result.session) serverSessions.push(result.session);
      } catch (error) {
        console.warn('Could not sync a locally saved session.', error);
      }
    }

    state.sessions = mergeSessions(serverSessions, localSessions);
    saveLocalSessions(state.sessions);
  } catch (error) {
    console.warn(error);
    state.sessions = mergeSessions(state.sessions, localSessions);
  }
  renderStats();
}

async function saveSessionToServer(session) {
  const response = await fetch('/api/sessions', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...authHeaders()
    },
    body: JSON.stringify(session)
  });
  if (response.status === 401) throw new Error('Password needed. Tap settings and enter your app password.');
  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw new Error(data.error || 'Save failed.');
  }
  return response.json();
}

function authHeaders() {
  return state.password ? { 'x-app-password': state.password } : {};
}

function renderStats() {
  const sessions = state.sessions;
  const totalGames = sessions.length;
  const totalBuyIns = sessions.reduce((sum, s) => sum + (Number(s.totalBuyIns) || 0), 0);
  const playerMap = new Map();
  let biggestWin = null;
  let biggestLoss = null;

  sessions.forEach((s) => {
    (s.players || []).forEach((p) => {
      const current = playerMap.get(p.name) || { name: p.name, games: 0, net: 0, buyIns: 0 };
      current.games += 1;
      current.net += Number(p.net) || 0;
      current.buyIns += Number(p.buyInTotal) || 0;
      playerMap.set(p.name, current);
      if (!biggestWin || p.net > biggestWin.net) biggestWin = { ...p, session: s.name };
      if (!biggestLoss || p.net < biggestLoss.net) biggestLoss = { ...p, session: s.name };
    });
  });

  $('statsGrid').innerHTML = `
    <div class="stat-card"><span>Sessions</span><strong>${totalGames}</strong></div>
    <div class="stat-card"><span>Total buy-ins</span><strong>${money(totalBuyIns)}</strong></div>
    <div class="stat-card"><span>Biggest win</span><strong>${biggestWin ? `${escapeHtml(biggestWin.name)} ${money(biggestWin.net)}` : '—'}</strong></div>
    <div class="stat-card"><span>Biggest loss</span><strong>${biggestLoss ? `${escapeHtml(biggestLoss.name)} ${money(biggestLoss.net)}` : '—'}</strong></div>
  `;

  const leaderboard = [...playerMap.values()].sort((a, b) => b.net - a.net);
  $('leaderboard').innerHTML = leaderboard.length
    ? leaderboard.map((p) => `<div class="payment-row"><span><b>${escapeHtml(p.name)}</b><br><small>${p.games} game${p.games === 1 ? '' : 's'} • buy-ins ${money(p.buyIns)}</small></span><strong class="${p.net > 0 ? 'positive' : p.net < 0 ? 'negative' : 'neutral'}">${p.net > 0 ? '+' : ''}${money(p.net)}</strong></div>`).join('')
    : '<div class="muted-box">No finished sessions yet.</div>';

  $('pastSessions').innerHTML = sessions.length
    ? [...sessions].reverse().slice(0, 12).map((s) => `<div class="session-row"><strong>${escapeHtml(s.name)}</strong><span>${new Date(s.finishedAt || s.createdAt).toLocaleString()} • ${money(s.totalBuyIns)} • ${(s.players || []).length} players</span></div>`).join('')
    : 'No finished sessions yet.';
}

function render() {
  if (state.screen === 'screenBuyIns') renderBuyIns();
  if (state.screen === 'screenFinals') renderFinals();
  if (state.screen === 'screenSummary' && state.session) renderSummary();
}

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function bindEvents() {
  $('startBtn').addEventListener('click', startSession);
  $('addPlayerBtn').addEventListener('click', addPlayer);
  $('newPlayerName').addEventListener('keydown', (event) => {
    if (event.key === 'Enter') addPlayer();
  });
  $('confirmBuyIns').addEventListener('change', (event) => {
    state.session.buyInsConfirmed = event.target.checked;
    saveDraft();
    renderBuyIns();
  });
  $('endGameBtn').addEventListener('click', () => showScreen('screenFinals'));
  $('finishBtn').addEventListener('click', finishSession);
  $('newSessionBtn').addEventListener('click', () => {
    state.session = null;
    showScreen('screenStart');
  });
  $('refreshStatsBtn').addEventListener('click', loadSessions);
  $('clearLocalBtn').addEventListener('click', () => {
    localStorage.removeItem('pokerDraftSession');
    state.session = null;
    showToast('Current draft cleared.');
  });

  document.body.addEventListener('click', (event) => {
    const plus = event.target.closest('[data-buyin-plus]');
    const minus = event.target.closest('[data-buyin-minus]');
    const remove = event.target.closest('[data-remove-player]');
    const back = event.target.closest('[data-goto]');
    if (plus) changeBuyIn(plus.dataset.buyinPlus, 1);
    if (minus) changeBuyIn(minus.dataset.buyinMinus, -1);
    if (remove) removePlayer(remove.dataset.removePlayer);
    if (back) showScreen(back.dataset.goto);
  });

  document.body.addEventListener('input', (event) => {
    const input = event.target.closest('[data-final-input]');
    if (input) updateFinalAmount(input.dataset.finalInput, input.value);
  });

  $('settingsBtn').addEventListener('click', () => {
    $('defaultPlayersText').value = state.defaultPlayers.join('\n');
    $('appPassword').value = state.password;
    $('settingsDialog').showModal();
  });

  $('saveSettingsBtn').addEventListener('click', (event) => {
    event.preventDefault();
    const players = $('defaultPlayersText').value.split('\n').map(cleanName).filter(Boolean);
    saveDefaultPlayers([...new Set(players)]);
    state.password = $('appPassword').value;
    localStorage.setItem('pokerAppPassword', state.password);
    $('settingsDialog').close();
    showToast('Settings saved.');
    loadSessions();
  });
}

loadDraft();
bindEvents();
loadSessions();

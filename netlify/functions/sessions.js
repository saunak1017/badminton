const { getStore } = require('@netlify/blobs');

const json = (statusCode, body) => ({
  statusCode,
  headers: {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store'
  },
  body: JSON.stringify(body)
});

function isAuthorized(event) {
  const requiredPassword = process.env.APP_PASSWORD;
  if (!requiredPassword) return true;
  return event.headers['x-app-password'] === requiredPassword;
}

function sanitizeSession(input) {
  if (!input || typeof input !== 'object') throw new Error('Missing session data.');
  if (!Array.isArray(input.players) || input.players.length < 2) throw new Error('A session needs at least 2 players.');

  const buyInAmount = Math.round(Number(input.buyInAmount));
  const totalBuyIns = Math.round(Number(input.totalBuyIns));
  if (!buyInAmount || buyInAmount <= 0) throw new Error('Invalid buy-in amount.');

  const players = input.players.map((p) => {
    const name = String(p.name || '').trim().slice(0, 80);
    const buyIns = Math.max(1, Math.round(Number(p.buyIns) || 1));
    const finalAmount = Math.max(0, Math.round(Number(p.finalAmount) || 0));
    const buyInTotal = buyIns * buyInAmount;
    const net = finalAmount - buyInTotal;
    if (!name) throw new Error('Every player needs a name.');
    return {
      id: String(p.id || `${name}-${Math.random()}`).slice(0, 120),
      name,
      buyIns,
      buyInTotal,
      finalAmount,
      net
    };
  });

  const computedTotalBuyIns = players.reduce((sum, p) => sum + p.buyInTotal, 0);
  const computedFinalTotal = players.reduce((sum, p) => sum + p.finalAmount, 0);
  if (computedTotalBuyIns !== computedFinalTotal) throw new Error('Final amounts do not match total buy-ins.');
  if (totalBuyIns && totalBuyIns !== computedTotalBuyIns) throw new Error('Submitted total buy-ins are incorrect.');

  return {
    id: String(input.id || crypto.randomUUID()).slice(0, 120),
    name: String(input.name || 'Poker session').trim().slice(0, 120),
    createdAt: input.createdAt || new Date().toISOString(),
    finishedAt: input.finishedAt || new Date().toISOString(),
    buyInAmount,
    totalBuyIns: computedTotalBuyIns,
    players,
    settlements: Array.isArray(input.settlements) ? input.settlements.map((p) => ({
      from: String(p.from || '').slice(0, 80),
      to: String(p.to || '').slice(0, 80),
      amount: Math.max(0, Math.round(Number(p.amount) || 0))
    })).filter((p) => p.from && p.to && p.amount > 0) : []
  };
}

exports.handler = async (event) => {
  if (!isAuthorized(event)) return json(401, { error: 'Unauthorized' });

  const store = getStore('poker-sessions');
  const key = 'sessions.json';

  if (event.httpMethod === 'GET') {
    const sessions = await store.get(key, { type: 'json', consistency: 'strong' }).catch(() => []);
    return json(200, { sessions: Array.isArray(sessions) ? sessions : [] });
  }

  if (event.httpMethod === 'POST') {
    try {
      const incoming = sanitizeSession(JSON.parse(event.body || '{}'));
      const existing = await store.get(key, { type: 'json', consistency: 'strong' }).catch(() => []);
      const sessions = Array.isArray(existing) ? existing.filter((s) => s.id !== incoming.id) : [];
      sessions.push(incoming);
      sessions.sort((a, b) => new Date(a.finishedAt) - new Date(b.finishedAt));
      await store.setJSON(key, sessions);
      return json(200, { ok: true, session: incoming, count: sessions.length });
    } catch (error) {
      return json(400, { error: error.message || 'Invalid session.' });
    }
  }

  return json(405, { error: 'Method not allowed' });
};

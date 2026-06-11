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

  try {
    const store = getStore('poker-sessions');

    if (event.httpMethod === 'GET') {
      const [{ blobs }, legacySessions] = await Promise.all([
        store.list({ prefix: 'sessions/' }),
        store.get('sessions.json', { type: 'json', consistency: 'strong' }).catch(() => [])
      ]);
      const savedSessions = await Promise.all(blobs.map((blob) => store.get(blob.key, { type: 'json', consistency: 'strong' })));
      const sessions = [...savedSessions, ...(Array.isArray(legacySessions) ? legacySessions : [])]
        .filter((session) => session?.id)
        .filter((session, index, all) => all.findIndex((item) => item.id === session.id) === index)
        .sort((a, b) => new Date(a.finishedAt) - new Date(b.finishedAt));
      return json(200, { sessions });
    }

    if (event.httpMethod === 'POST') {
      const incoming = sanitizeSession(JSON.parse(event.body || '{}'));
      await store.setJSON(`sessions/${incoming.id}.json`, incoming);
      return json(200, { ok: true, session: incoming });
    }

    return json(405, { error: 'Method not allowed' });
  } catch (error) {
    console.error('Sessions function failed.', error);
    const statusCode = event.httpMethod === 'POST' ? 400 : 500;
    return json(statusCode, { error: error.message || 'Could not access saved sessions.' });
  }
};

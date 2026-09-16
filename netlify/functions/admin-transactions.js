// Admin-only: a given user's full transaction history, via ?userId=...
const { readDB, getAuthedUser, json } = require('./_shared/helpers');

exports.handler = async (event) => {
  if (event.httpMethod !== 'GET') return json(405, { error: 'Method not allowed.' });

  const db = await readDB(event);
  const admin = getAuthedUser(event, db);
  if (!admin) return json(401, { error: 'Please sign in again.' });
  if (!admin.isAdmin) return json(403, { error: 'Admin access only.' });

  const userId = (event.queryStringParameters || {}).userId;
  if (!userId) return json(400, { error: 'Missing userId query parameter.' });

  const targetUser = db.users.find((u) => u.id === userId);
  if (!targetUser) return json(404, { error: 'User not found.' });

  const transactions = db.transactions.filter((t) => t.userId === userId).slice(0, 200);
  return json(200, {
    user: { id: targetUser.id, name: targetUser.name, phone: targetUser.phone },
    transactions,
  });
};

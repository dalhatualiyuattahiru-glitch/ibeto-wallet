const { readDB, getAuthedUser, json } = require('./_shared/helpers');

exports.handler = async (event) => {
  if (event.httpMethod !== 'GET') return json(405, { error: 'Method not allowed.' });

  const db = await readDB(event);
  const user = getAuthedUser(event, db);
  if (!user) return json(401, { error: 'Please sign in again.' });

  const history = db.transactions.filter((t) => t.userId === user.id).slice(0, 200);
  return json(200, { transactions: history });
};

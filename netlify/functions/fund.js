const {
  readDB, writeDB, getAuthedUser, toCents, publicUser, recordTransaction, json, parseBody,
} = require('./_shared/helpers');

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') return json(405, { error: 'Method not allowed.' });

  const db = await readDB(event);
  const user = getAuthedUser(event, db);
  if (!user) return json(401, { error: 'Please sign in again.' });

  let body;
  try {
    body = parseBody(event);
  } catch (e) {
    return json(400, { error: e.message });
  }
  const { amount, source } = body;
  const cents = toCents(amount);
  if (!Number.isFinite(cents) || cents <= 0) {
    return json(400, { error: 'Enter an amount greater than zero.' });
  }

  user.balanceCents += cents;
  const tx = recordTransaction(db, {
    userId: user.id,
    type: 'fund',
    direction: 'in',
    amount: cents / 100,
    status: 'completed',
    description: `Wallet funded from ${source || 'linked card'}`,
  });

  await writeDB(event, db);
  return json(200, { user: publicUser(user), transaction: tx });
};

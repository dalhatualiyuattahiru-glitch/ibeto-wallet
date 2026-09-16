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
  const { recipient, amount, note } = body;
  const cents = toCents(amount);

  if (!Number.isFinite(cents) || cents <= 0) {
    return json(400, { error: 'Enter an amount greater than zero.' });
  }
  if (!recipient) {
    return json(400, { error: "Enter the recipient's email or account number." });
  }

  const target = db.users.find(
    (u) =>
      u.id !== user.id &&
      (u.email.toLowerCase() === String(recipient).toLowerCase() ||
        u.accountNumber === String(recipient))
  );
  if (!target) {
    return json(404, { error: 'No wallet found for that email or account number.' });
  }
  if (user.balanceCents < cents) {
    return json(400, { error: 'Insufficient balance for this transfer.' });
  }

  user.balanceCents -= cents;
  target.balanceCents += cents;

  const tx = recordTransaction(db, {
    userId: user.id,
    type: 'transfer',
    direction: 'out',
    amount: cents / 100,
    counterparty: target.name,
    status: 'completed',
    description: note || `Transfer to ${target.name}`,
  });
  recordTransaction(db, {
    userId: target.id,
    type: 'transfer',
    direction: 'in',
    amount: cents / 100,
    counterparty: user.name,
    status: 'completed',
    description: note || `Transfer from ${user.name}`,
  });

  await writeDB(event, db);
  return json(200, { user: publicUser(user), transaction: tx });
};

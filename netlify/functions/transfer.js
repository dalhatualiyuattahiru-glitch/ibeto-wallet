const {
  readDB, writeDB, getAuthedUser, verifySecret, toCents, publicUser,
  recordTransaction, findUserByIdentifier, json, parseBody,
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
  const { recipient, amount, note, pin } = body;
  const cents = toCents(amount);

  if (!Number.isFinite(cents) || cents <= 0) {
    return json(400, { error: 'Enter an amount greater than zero.' });
  }
  if (!recipient) {
    return json(400, { error: "Enter the recipient's phone number, account number, or email." });
  }
  if (!user.pinHash) {
    return json(400, { error: 'Please set a transaction PIN in Settings first.' });
  }
  if (!verifySecret(pin || '', user.pinSalt, user.pinHash)) {
    return json(401, { error: 'Incorrect PIN.' });
  }

  const target = findUserByIdentifier(db, recipient);
  if (!target || target.id === user.id) {
    return json(404, { error: 'No wallet found for that phone number, account number, or email.' });
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

const {
  readDB, writeDB, getAuthedUser, verifySecret, toCents, publicUser,
  recordTransaction, json, parseBody,
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
  const { amount, bankName, accountNumber, pin } = body;
  const cents = toCents(amount);

  if (!Number.isFinite(cents) || cents <= 0) {
    return json(400, { error: 'Enter an amount greater than zero.' });
  }
  if (!bankName || !accountNumber) {
    return json(400, { error: 'Enter the destination bank name and account number.' });
  }
  if (!user.pinHash) {
    return json(400, { error: 'Please set a transaction PIN in Settings first.' });
  }
  if (!verifySecret(pin || '', user.pinSalt, user.pinHash)) {
    return json(401, { error: 'Incorrect PIN.' });
  }
  if (user.balanceCents < cents) {
    return json(400, { error: 'Insufficient balance for this withdrawal.' });
  }

  user.balanceCents -= cents;
  const tx = recordTransaction(db, {
    userId: user.id,
    type: 'withdrawal',
    direction: 'out',
    amount: cents / 100,
    status: 'completed',
    description: `Withdrawal to ${bankName} \u2022\u2022\u2022\u2022${String(accountNumber).slice(-4)}`,
  });

  await writeDB(event, db);
  return json(200, { user: publicUser(user), transaction: tx });
};

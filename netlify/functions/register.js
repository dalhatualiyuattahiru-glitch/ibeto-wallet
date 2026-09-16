const {
  readDB, writeDB, hashPassword, createToken, genId, genAccountNumber,
  isValidEmail, publicUser, recordTransaction, json, parseBody,
} = require('./_shared/helpers');

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') return json(405, { error: 'Method not allowed.' });

  let body;
  try {
    body = parseBody(event);
  } catch (e) {
    return json(400, { error: e.message });
  }
  const { name, email, password } = body;

  if (!name || !isValidEmail(email) || !password || password.length < 6) {
    return json(400, {
      error: 'Provide a name, a valid email, and a password of at least 6 characters.',
    });
  }

  const db = await readDB(event);

  if (db.users.some((u) => u.email.toLowerCase() === email.toLowerCase())) {
    return json(409, { error: 'An account with that email already exists.' });
  }

  const { salt, hash } = hashPassword(password);
  const user = {
    id: genId(),
    name,
    email,
    passwordSalt: salt,
    passwordHash: hash,
    accountNumber: genAccountNumber(db),
    balanceCents: 0,
    createdAt: new Date().toISOString(),
  };
  db.users.push(user);
  recordTransaction(db, {
    userId: user.id,
    type: 'account_opened',
    amount: 0,
    status: 'completed',
    description: 'Wallet account opened',
  });

  await writeDB(event, db);

  const token = createToken(user.id);
  return json(201, { token, user: publicUser(user) });
};

const {
  readDB, writeDB, hashSecret, createToken, genId, normalizePhone,
  publicUser, recordTransaction, json, parseBody, getAdminPhone,
} = require('./_shared/helpers');

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') return json(405, { error: 'Method not allowed.' });

  let body;
  try {
    body = parseBody(event);
  } catch (e) {
    return json(400, { error: e.message });
  }
  const phone = normalizePhone(body.phone);
  const { name, password, pin } = body;

  if (!name || !password || password.length < 6) {
    return json(400, {
      error: 'Provide a name and a password of at least 6 characters.',
    });
  }
  if (!pin || !/^\d{4}$/.test(String(pin))) {
    return json(400, { error: 'Choose a 4-digit transaction PIN.' });
  }

  const db = await readDB(event);
  const otpEntry = (db.otps || {})[phone];

  if (!otpEntry || !otpEntry.verified || Date.now() > otpEntry.expiresAt) {
    return json(400, { error: 'Please verify your phone number first.' });
  }
  if (db.users.some((u) => u.phone === phone)) {
    return json(409, { error: 'That phone number already has a wallet.' });
  }

  const { salt: passwordSalt, hash: passwordHash } = hashSecret(password);
  const { salt: pinSalt, hash: pinHash } = hashSecret(pin);

  const user = {
    id: genId(),
    name,
    phone,
    accountNumber: phone,
    email: null,
    passwordSalt,
    passwordHash,
    pinSalt,
    pinHash,
    balanceCents: 0,
    tier: 1,
    isAdmin: getAdminPhone() && phone === getAdminPhone(),
    gender: null,
    dateOfBirth: null,
    address: null,
    photo: null,
    favorites: [],
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

  delete db.otps[phone];
  await writeDB(event, db);

  const token = createToken(user.id);
  return json(201, { token, user: publicUser(user) });
};

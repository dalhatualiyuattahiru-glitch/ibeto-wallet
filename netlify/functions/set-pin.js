const {
  readDB, writeDB, getAuthedUser, hashSecret, verifySecret, publicUser, json, parseBody,
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
  const { pin, currentPin } = body;

  if (!pin || !/^\d{4}$/.test(String(pin))) {
    return json(400, { error: 'Choose a 4-digit PIN.' });
  }
  if (user.pinHash && !verifySecret(currentPin || '', user.pinSalt, user.pinHash)) {
    return json(401, { error: 'Your current PIN is incorrect.' });
  }

  const { salt, hash } = hashSecret(pin);
  user.pinSalt = salt;
  user.pinHash = hash;
  await writeDB(event, db);

  return json(200, { user: publicUser(user) });
};

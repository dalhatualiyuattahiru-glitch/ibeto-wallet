const {
  readDB, verifySecret, createToken, publicUser, normalizePhone, json, parseBody,
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
  const { password } = body;

  const db = await readDB(event);
  const user = db.users.find((u) => u.phone === phone);

  if (!user || !verifySecret(password || '', user.passwordSalt, user.passwordHash)) {
    return json(401, { error: 'Incorrect phone number or password.' });
  }

  const token = createToken(user.id);
  return json(200, { token, user: publicUser(user) });
};

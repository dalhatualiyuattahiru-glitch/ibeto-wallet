const {
  readDB, verifyPassword, createToken, publicUser, json, parseBody,
} = require('./_shared/helpers');

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') return json(405, { error: 'Method not allowed.' });

  let body;
  try {
    body = parseBody(event);
  } catch (e) {
    return json(400, { error: e.message });
  }
  const { email, password } = body;

  const db = await readDB(event);
  const user = db.users.find((u) => u.email.toLowerCase() === (email || '').toLowerCase());

  if (!user || !verifyPassword(password || '', user.passwordSalt, user.passwordHash)) {
    return json(401, { error: 'Incorrect email or password.' });
  }

  const token = createToken(user.id);
  return json(200, { token, user: publicUser(user) });
};

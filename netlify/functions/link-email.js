const {
  readDB, writeDB, getAuthedUser, isValidEmail, publicUser, json, parseBody,
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
  const { email } = body;

  if (!isValidEmail(email)) {
    return json(400, { error: 'Enter a valid email address.' });
  }
  if (db.users.some((u) => u.id !== user.id && u.email && u.email.toLowerCase() === email.toLowerCase())) {
    return json(409, { error: 'That email is already linked to another wallet.' });
  }

  user.email = email;
  await writeDB(event, db);

  return json(200, { user: publicUser(user) });
};

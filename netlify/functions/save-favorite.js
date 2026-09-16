const {
  readDB, writeDB, getAuthedUser, findUserByIdentifier, publicUser, json, parseBody,
} = require('./_shared/helpers');

const MAX_FAVORITES = 20;

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
  const { identifier, label } = body;

  if (!identifier) {
    return json(400, { error: "Enter the recipient's phone number, account number, or email." });
  }
  const target = findUserByIdentifier(db, identifier);
  if (!target) {
    return json(404, { error: 'No wallet found for that phone number, account number, or email.' });
  }
  if (target.id === user.id) {
    return json(400, { error: "You can't save your own wallet as a favorite." });
  }

  user.favorites = user.favorites || [];
  if (!user.favorites.some((f) => f.userId === target.id)) {
    if (user.favorites.length >= MAX_FAVORITES) {
      return json(400, { error: `You can save up to ${MAX_FAVORITES} favorites.` });
    }
    user.favorites.unshift({
      userId: target.id,
      label: label || target.name,
      name: target.name,
      accountNumber: target.accountNumber,
    });
  }

  await writeDB(event, db);
  return json(200, { user: publicUser(user) });
};

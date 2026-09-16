const { readDB, getAuthedUser, publicUser, json } = require('./_shared/helpers');

exports.handler = async (event) => {
  if (event.httpMethod !== 'GET') return json(405, { error: 'Method not allowed.' });

  const db = await readDB(event);
  const user = getAuthedUser(event, db);
  if (!user) return json(401, { error: 'Please sign in again.' });

  return json(200, { user: publicUser(user) });
};

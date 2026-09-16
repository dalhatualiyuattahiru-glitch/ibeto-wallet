// Admin-only: lists every registered user. Locked to whichever phone
// number is set as ADMIN_PHONE in the site's environment variables.
const { readDB, getAuthedUser, json } = require('./_shared/helpers');

exports.handler = async (event) => {
  if (event.httpMethod !== 'GET') return json(405, { error: 'Method not allowed.' });

  const db = await readDB(event);
  const user = getAuthedUser(event, db);
  if (!user) return json(401, { error: 'Please sign in again.' });
  if (!user.isAdmin) return json(403, { error: 'Admin access only.' });

  const users = db.users
    .slice()
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
    .map((u) => ({
      id: u.id,
      name: u.name,
      phone: u.phone,
      email: u.email || null,
      accountNumber: u.accountNumber,
      balance: u.balanceCents / 100,
      tier: u.tier || 1,
      isAdmin: !!u.isAdmin,
      createdAt: u.createdAt,
    }));

  return json(200, { users });
};

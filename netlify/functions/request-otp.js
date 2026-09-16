// Sends (in demo mode, RETURNS) a one-time code to verify a phone number
// before it can be registered. No SMS provider is connected, so this
// simulates delivery — see the note at the top of _shared/helpers.js.
const {
  readDB, writeDB, isValidPhone, normalizePhone, generateOtp,
  findUserByIdentifier, json, parseBody, OTP_TTL_MS,
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

  if (!isValidPhone(phone)) {
    return json(400, { error: 'Enter a valid phone number.' });
  }

  const db = await readDB(event);

  if (findUserByIdentifier(db, phone)) {
    return json(409, { error: 'That phone number already has a wallet. Try signing in instead.' });
  }

  const code = generateOtp();
  db.otps = db.otps || {};
  db.otps[phone] = { code, expiresAt: Date.now() + OTP_TTL_MS, verified: false };
  await writeDB(event, db);

  return json(200, {
    message: 'Code generated.',
    demoMode: true,
    demoCode: code, // demo-only: a real integration would text this instead
  });
};

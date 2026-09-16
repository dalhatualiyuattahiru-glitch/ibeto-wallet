const {
  readDB, writeDB, normalizePhone, json, parseBody, OTP_VERIFIED_TTL_MS,
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
  const code = String(body.code || '').trim();

  const db = await readDB(event);
  const entry = (db.otps || {})[phone];

  if (!entry || Date.now() > entry.expiresAt) {
    return json(400, { error: 'That code has expired. Request a new one.' });
  }
  if (entry.code !== code) {
    return json(400, { error: 'Incorrect code. Please try again.' });
  }

  entry.verified = true;
  entry.expiresAt = Date.now() + OTP_VERIFIED_TTL_MS; // extend window to finish signing up
  await writeDB(event, db);

  return json(200, { verified: true });
};

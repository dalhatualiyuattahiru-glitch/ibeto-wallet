// Updates editable profile fields. Photo is stored as a data URL string
// directly on the user record (capped in size) since there's no separate
// file/image storage wired up in this demo backend.
const {
  readDB, writeDB, getAuthedUser, publicUser, json, parseBody,
} = require('./_shared/helpers');

const MAX_PHOTO_BYTES = 250_000; // ~250 KB, keeps the Blobs record small

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
  const { name, gender, dateOfBirth, address, photo } = body;

  if (photo && photo.length > MAX_PHOTO_BYTES) {
    return json(400, { error: 'That photo is too large. Please choose a smaller image.' });
  }

  if (name) user.name = name;
  if (gender !== undefined) user.gender = gender || null;
  if (dateOfBirth !== undefined) user.dateOfBirth = dateOfBirth || null;
  if (address !== undefined) user.address = address || null;
  if (photo !== undefined) user.photo = photo || null;

  await writeDB(event, db);

  return json(200, { user: publicUser(user) });
};

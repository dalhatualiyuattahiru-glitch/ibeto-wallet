/**
 * Shared helpers for the ibeto wallet Netlify Functions.
 *
 * Data is persisted with Netlify Blobs (a key/value store built into
 * Netlify) instead of a local JSON file, because serverless functions
 * don't share a filesystem between invocations.
 *
 * Prototype-grade backend:
 * - Funding, withdrawals, and bill payments are SIMULATED. No real bank,
 *   card, or biller is ever contacted.
 * - OTP delivery is SIMULATED. There's no SMS provider connected, so the
 *   generated code is returned directly in the API response (clearly
 *   marked "demo mode" in the UI) instead of being texted. Swapping in a
 *   real provider (Termii, Twilio, etc.) later just means changing
 *   request-otp.js to call their API instead of returning the code.
 */

const crypto = require('crypto');

const TOKEN_SECRET = process.env.WALLET_TOKEN_SECRET || 'ibeto-demo-secret-change-me';
const TOKEN_TTL_MS = 1000 * 60 * 60 * 12; // 12 hours
const OTP_TTL_MS = 1000 * 60 * 5; // 5 minutes to enter the code
const OTP_VERIFIED_TTL_MS = 1000 * 60 * 15; // 15 minutes to finish registering after verifying
const DB_KEY = 'state';
function getAdminPhone() {
  return (process.env.ADMIN_PHONE || '').replace(/\D/g, '');
}

// ---------------------------------------------------------------------
// Store access
// ---------------------------------------------------------------------

// Loaded with a dynamic import() rather than require(): @netlify/blobs
// ships in a module format that Node's CommonJS require() can fail to
// resolve inside a bundled Lambda function, even though the package is
// physically present. Dynamic import() uses ESM resolution and avoids it.
async function store(event) {
  const { connectLambda, getStore } = await import('@netlify/blobs');
  connectLambda(event);
  return getStore('wallet-db');
}

async function readDB(event) {
  const s = await store(event);
  const data = await s.get(DB_KEY, { type: 'json' });
  return data || { users: [], transactions: [], otps: {} };
}

async function writeDB(event, db) {
  const s = await store(event);
  await s.setJSON(DB_KEY, db);
}

// ---------------------------------------------------------------------
// Password / PIN hashing (scrypt) - never stored in plain text
// ---------------------------------------------------------------------

function hashSecret(secret) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(String(secret), salt, 64).toString('hex');
  return { salt, hash };
}

function verifySecret(secret, salt, hash) {
  if (!salt || !hash) return false;
  const check = crypto.scryptSync(String(secret), salt, 64).toString('hex');
  return crypto.timingSafeEqual(Buffer.from(check), Buffer.from(hash));
}

// ---------------------------------------------------------------------
// Session tokens: base64(userId.expiry) + "." + HMAC signature
// ---------------------------------------------------------------------

function createToken(userId) {
  const expiry = Date.now() + TOKEN_TTL_MS;
  const payload = Buffer.from(`${userId}.${expiry}`).toString('base64url');
  const sig = crypto.createHmac('sha256', TOKEN_SECRET).update(payload).digest('hex');
  return `${payload}.${sig}`;
}

function verifyToken(token) {
  if (!token || typeof token !== 'string' || !token.includes('.')) return null;
  const [payload, sig] = token.split('.');
  const expectedSig = crypto.createHmac('sha256', TOKEN_SECRET).update(payload).digest('hex');
  if (sig !== expectedSig) return null;
  const decoded = Buffer.from(payload, 'base64url').toString('utf8');
  const [userId, expiryStr] = decoded.split('.');
  if (Date.now() > Number(expiryStr)) return null;
  return userId;
}

function getAuthedUser(event, db) {
  const authHeader = event.headers.authorization || event.headers.Authorization || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
  const userId = verifyToken(token);
  if (!userId) return null;
  return db.users.find((u) => u.id === userId) || null;
}

// ---------------------------------------------------------------------
// Phone numbers / OTP
// ---------------------------------------------------------------------

// Normalize to digits only, e.g. "+234 702 632 7275" -> "2347026327275".
// Used as the account number too (like OPay), so it doubles as the
// identifier people transfer money to.
function normalizePhone(phone) {
  return String(phone || '').replace(/\D/g, '');
}

function isValidPhone(phone) {
  const digits = normalizePhone(phone);
  return digits.length >= 10 && digits.length <= 15;
}

function generateOtp() {
  return String(crypto.randomInt(100000, 999999));
}

function maskPhone(phone) {
  const digits = normalizePhone(phone);
  if (digits.length < 6) return digits;
  return `${digits.slice(0, 3)}****${digits.slice(-3)}`;
}

// ---------------------------------------------------------------------
// Misc helpers
// ---------------------------------------------------------------------

function genId() {
  return crypto.randomUUID();
}

function isValidEmail(email) {
  return typeof email === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function toCents(amount) {
  return Math.round(Number(amount) * 100);
}

function publicUser(user) {
  return {
    id: user.id,
    name: user.name,
    phone: user.phone,
    maskedPhone: maskPhone(user.phone),
    email: user.email || null,
    accountNumber: user.accountNumber,
    balance: user.balanceCents / 100,
    tier: user.tier || 1,
    isAdmin: !!user.isAdmin,
    pinSet: !!user.pinHash,
    gender: user.gender || null,
    dateOfBirth: user.dateOfBirth || null,
    address: user.address || null,
    photo: user.photo || null,
    favorites: user.favorites || [],
    createdAt: user.createdAt,
  };
}

function recordTransaction(db, entry) {
  const tx = { id: genId(), createdAt: new Date().toISOString(), ...entry };
  db.transactions.unshift(tx);
  return tx;
}

function json(statusCode, body) {
  return {
    statusCode,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  };
}

function parseBody(event) {
  if (!event.body) return {};
  try {
    return JSON.parse(event.body);
  } catch (e) {
    throw new Error('Invalid JSON body');
  }
}

function findUserByIdentifier(db, identifier) {
  const raw = String(identifier || '').trim().toLowerCase();
  const digits = normalizePhone(identifier);
  return db.users.find(
    (u) =>
      (u.email && u.email.toLowerCase() === raw) ||
      u.accountNumber === digits ||
      u.phone === digits
  );
}

module.exports = {
  readDB,
  writeDB,
  hashSecret,
  verifySecret,
  createToken,
  verifyToken,
  getAuthedUser,
  genId,
  isValidEmail,
  normalizePhone,
  isValidPhone,
  generateOtp,
  maskPhone,
  toCents,
  publicUser,
  recordTransaction,
  json,
  parseBody,
  findUserByIdentifier,
  getAdminPhone,
  OTP_TTL_MS,
  OTP_VERIFIED_TTL_MS,
};

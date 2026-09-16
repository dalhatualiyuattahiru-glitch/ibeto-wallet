/**
 * Shared helpers for the ibeto wallet Netlify Functions.
 *
 * Data is persisted with Netlify Blobs (a key/value store built into
 * Netlify) instead of a local JSON file, because serverless functions
 * don't share a filesystem between invocations.
 *
 * ⚠️ Prototype-grade backend: funding, withdrawals, and bill payments are
 * SIMULATED. No real bank, card, or biller is ever contacted.
 */

const crypto = require('crypto');

const TOKEN_SECRET = process.env.WALLET_TOKEN_SECRET || 'ibeto-demo-secret-change-me';
const TOKEN_TTL_MS = 1000 * 60 * 60 * 12; // 12 hours
const DB_KEY = 'state';

// ---------------------------------------------------------------------
// Store access
// ---------------------------------------------------------------------

// Loaded with a dynamic import() rather than require(): @netlify/blobs
// ships in a module format that Node's CommonJS require() can fail to
// resolve inside a bundled Lambda function, even though the package is
// physically present. Dynamic import() uses ESM resolution and avoids it.
async function store(event) {
  const { connectLambda, getStore } = await import('@netlify/blobs');
  connectLambda(event); // configures the Blobs environment from the Lambda event
  return getStore('wallet-db');
}

async function readDB(event) {
  const s = await store(event);
  const data = await s.get(DB_KEY, { type: 'json' });
  return data || { users: [], transactions: [] };
}

async function writeDB(event, db) {
  const s = await store(event);
  await s.setJSON(DB_KEY, db);
}

// ---------------------------------------------------------------------
// Password hashing (scrypt) — no plaintext passwords are ever stored
// ---------------------------------------------------------------------

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(password, salt, 64).toString('hex');
  return { salt, hash };
}

function verifyPassword(password, salt, hash) {
  const check = crypto.scryptSync(password, salt, 64).toString('hex');
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
// Misc helpers
// ---------------------------------------------------------------------

function genId() {
  return crypto.randomUUID();
}

function genAccountNumber(db) {
  let acc;
  do {
    acc = String(Math.floor(1000000000 + Math.random() * 9000000000));
  } while (db.users.some((u) => u.accountNumber === acc));
  return acc;
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
    email: user.email,
    accountNumber: user.accountNumber,
    balance: user.balanceCents / 100,
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

module.exports = {
  readDB,
  writeDB,
  hashPassword,
  verifyPassword,
  createToken,
  verifyToken,
  getAuthedUser,
  genId,
  genAccountNumber,
  isValidEmail,
  toCents,
  publicUser,
  recordTransaction,
  json,
  parseBody,
};

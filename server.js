import { readFile, mkdir, writeFile, rename } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { timingSafeEqual } from 'node:crypto';
import mysql from 'mysql2/promise';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const DIST = path.join(ROOT, 'dist');
const DATA_DIR = path.join(ROOT, 'data');
const DATA_FILE = path.join(DATA_DIR, 'store.json');
const RPC = 'https://api.devnet.solana.com';
const MEMO_PROGRAM = 'MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr';
const PRODUCTION = process.env.NODE_ENV === 'production';
const PORT = Number(process.env.PORT || (PRODUCTION ? 3000 : 8001));
const ACCESS_CODE = process.env.APP_ACCESS_CODE || '';
const publicMysqlUrl = process.env.MYSQL_PUBLIC_URL ? new URL(process.env.MYSQL_PUBLIC_URL) : null;
const DB_HOST = process.env.DB_HOST || publicMysqlUrl?.hostname || process.env.MYSQLHOST;
const DB_PORT = process.env.DB_PORT || publicMysqlUrl?.port || process.env.MYSQLPORT || '3306';
const DB_NAME = process.env.DB_NAME || (publicMysqlUrl?.pathname ? decodeURIComponent(publicMysqlUrl.pathname.slice(1)) : '') || process.env.MYSQLDATABASE;
const DB_USERNAME = process.env.DB_USERNAME || (publicMysqlUrl?.username ? decodeURIComponent(publicMysqlUrl.username) : '') || process.env.MYSQLUSER;
const DB_PASSWORD = process.env.DB_PASSWORD || (publicMysqlUrl?.password ? decodeURIComponent(publicMysqlUrl.password) : '') || process.env.MYSQLPASSWORD;
const hasDatabase = Boolean(DB_HOST && DB_PORT && DB_NAME && DB_USERNAME && DB_PASSWORD);
if (PRODUCTION && ACCESS_CODE.length < 32) throw new Error('Set APP_ACCESS_CODE to a random value of at least 32 characters before production startup.');
if (PRODUCTION && !hasDatabase) throw new Error('Production startup requires MySQL settings (DB_* variables or Railway MYSQL_PUBLIC_URL / MYSQLHOST variables).');
const pool = hasDatabase ? mysql.createPool({
  host: DB_HOST,
  port: Number(DB_PORT),
  database: DB_NAME,
  user: DB_USERNAME,
  password: DB_PASSWORD,
  waitForConnections: true,
  connectionLimit: 5,
  queueLimit: 20,
  charset: 'utf8mb4',
  ...(process.env.DB_SSL === 'true' ? { ssl: { rejectUnauthorized: true } } : {}),
}) : null;
const MAX_BODY = 2_000_000;
let state = { org: null, assets: [], events: [] };
let saveQueue = Promise.resolve();

if (pool) {
  await pool.execute(`CREATE TABLE IF NOT EXISTS temirtrace_state (
    state_id TINYINT UNSIGNED NOT NULL PRIMARY KEY,
    payload LONGTEXT NOT NULL,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);
  const [rows] = await pool.execute('SELECT payload FROM temirtrace_state WHERE state_id = 1');
  if (rows.length) state = { ...state, ...JSON.parse(rows[0].payload) };
  else await pool.execute('INSERT INTO temirtrace_state (state_id, payload) VALUES (1, ?)', [JSON.stringify(state)]);
} else {
  await mkdir(DATA_DIR, { recursive: true });
  if (existsSync(DATA_FILE)) {
    try { state = { ...state, ...JSON.parse(await readFile(DATA_FILE, 'utf8')) }; }
    catch (e) { console.error('Could not read data/store.json:', e.message); }
  }
}

function json(res, status, value) {
  const body = JSON.stringify(value);
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'content-length': Buffer.byteLength(body), 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' });
  res.end(body);
}
async function persist(connection = null) {
  const snapshot = JSON.stringify(state, null, 2);
  if (pool) {
    await (connection || pool).execute('INSERT INTO temirtrace_state (state_id, payload) VALUES (1, ?) ON DUPLICATE KEY UPDATE payload = VALUES(payload)', [snapshot]);
    return;
  }
  saveQueue = saveQueue.then(async () => {
    const tmp = `${DATA_FILE}.tmp`;
    await writeFile(tmp, snapshot, 'utf8');
    await rename(tmp, DATA_FILE);
  });
  await saveQueue;
}
async function refreshState(connection) {
  if (!pool) return;
  const [rows] = await connection.execute('SELECT payload FROM temirtrace_state WHERE state_id = 1');
  state = rows.length ? { ...state, ...JSON.parse(rows[0].payload) } : { org: null, assets: [], events: [] };
}
function validAccessCode(candidate) {
  if (!ACCESS_CODE) return !PRODUCTION;
  const provided = Buffer.from(String(candidate || ''));
  const expected = Buffer.from(ACCESS_CODE);
  return provided.length === expected.length && timingSafeEqual(provided, expected);
}
async function bodyJson(req) {
  if (req.body && typeof req.body === 'object' && !Buffer.isBuffer(req.body)) return req.body;
  let body = '';
  for await (const chunk of req) {
    body += chunk;
    if (Buffer.byteLength(body) > MAX_BODY) throw Object.assign(new Error('Request body is too large'), { status: 413 });
  }
  try { return JSON.parse(body || '{}'); }
  catch { throw Object.assign(new Error('Request must contain valid JSON'), { status: 400 }); }
}
function decodeBase58(str) {
  const alphabet = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
  let n = 0n;
  for (const ch of str) {
    const digit = alphabet.indexOf(ch);
    if (digit < 0) throw new Error('Invalid base58 memo data');
    n = n * 58n + BigInt(digit);
  }
  const bytes = [];
  while (n > 0n) { bytes.unshift(Number(n & 255n)); n >>= 8n; }
  for (let i = 0; i < str.length && str[i] === '1'; i++) bytes.unshift(0);
  return Buffer.from(bytes).toString('utf8');
}
function memoTexts(instructions = []) {
  const found = [];
  for (const ix of instructions) {
    if (ix.programId !== MEMO_PROGRAM && ix.program !== 'spl-memo' && ix.program !== 'spl_memo') continue;
    if (typeof ix.parsed === 'string') found.push(ix.parsed);
    else if (typeof ix.parsed?.info?.memo === 'string') found.push(ix.parsed.info.memo);
    else if (typeof ix.data === 'string') {
      try { found.push(decodeBase58(ix.data)); } catch { /* ignore undecodable memo */ }
    }
  }
  return found;
}
async function verifyRecord(record, signature, connection) {
  if (!record || !/^[1-9A-HJ-NP-Za-km-z]{70,100}$/.test(signature || '')) throw Object.assign(new Error('Record or Solana signature is invalid'), { status: 400 });
  const rpcRes = await fetch(RPC, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 'temirtrace', method: 'getTransaction', params: [signature, { commitment: 'confirmed', maxSupportedTransactionVersion: 0, encoding: 'jsonParsed' }] }), signal: AbortSignal.timeout(12_000) });
  if (!rpcRes.ok) throw Object.assign(new Error(`Solana Devnet RPC returned HTTP ${rpcRes.status}`), { status: 502 });
  const payload = await rpcRes.json();
  if (payload.error) throw Object.assign(new Error(payload.error.message || 'Solana RPC request failed'), { status: 502 });
  const tx = payload.result;
  if (!tx) {
    record.chainStatus = 'pending'; record.signature = signature;
    await persist(connection);
    return { status: 'pending', signature, message: 'Transaction is not visible at confirmed commitment yet.' };
  }
  if (tx.meta?.err) {
    record.chainStatus = 'failed'; record.signature = signature;
    await persist(connection);
    throw Object.assign(new Error('The Devnet transaction failed on-chain'), { status: 422 });
  }
  const instructions = tx.transaction?.message?.instructions || [];
  const found = memoTexts(instructions).includes(`TEMIRTRACE|v1|${record.id}|${record.hash}`);
  if (!found) {
    record.chainStatus = 'mismatch'; record.signature = signature;
    await persist(connection);
    throw Object.assign(new Error('Confirmed transaction does not contain the expected TemirTrace memo'), { status: 422 });
  }
  record.signature = signature; record.chainStatus = 'confirmed'; record.chainBlockTime = tx.blockTime || null; record.chainSlot = tx.slot; record.chainVerifiedAt = new Date().toISOString();
  await persist(connection);
  return { status: 'confirmed', signature, slot: tx.slot, blockTime: tx.blockTime || null, explorerUrl: `https://explorer.solana.com/tx/${signature}?cluster=devnet` };
}
const mime = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon' };
async function serveStatic(req, res, pathname) {
  let target = pathname === '/' || /^\/p\/[A-Za-z0-9-]+\/?$/.test(pathname) ? path.join(DIST, 'index.html') : path.resolve(DIST, `.${decodeURIComponent(pathname)}`);
  if (!target.startsWith(`${DIST}${path.sep}`)) return json(res, 403, { error: 'Forbidden path' });
  try {
    const contents = await readFile(target);
    res.writeHead(200, { 'content-type': mime[path.extname(target)] || 'application/octet-stream', 'cache-control': 'no-cache', 'x-content-type-options': 'nosniff' });
    if (req.method === 'HEAD') return res.end();
    res.end(contents);
  } catch { json(res, 404, { error: 'Not found. Run npm run build first.' }); }
}

async function handleRequest(req, res) {
  const url = new URL(req.url || '/', `http://${req.headers.host || `localhost:${PORT}`}`);
  let dbConnection = null;
  let dbLock = false;
  try {
    if (url.pathname === '/api/access' && req.method === 'POST') {
      const input = await bodyJson(req);
      return validAccessCode(input.accessCode)
        ? json(res, 200, { authorized: true })
        : json(res, 401, { error: 'That access code is not correct.' });
    }
    const privateRoute = ['/api/state', '/api/review-queue', '/api/review-queue/decision'].includes(url.pathname) || /^\/api\/verify\/[A-Za-z0-9-]+$/.test(url.pathname);
    if (privateRoute && !validAccessCode(req.headers.authorization?.replace(/^Bearer\s+/i, ''))) {
      return json(res, 401, { error: 'Enter the private demo access code to continue.' });
    }
    if (pool && url.pathname.startsWith('/api/')) {
      dbConnection = await pool.getConnection();
      if (['PUT', 'POST', 'PATCH', 'DELETE'].includes(req.method)) {
        const [lockRows] = await dbConnection.query('SELECT GET_LOCK(?, 10) AS acquired', ['temirtrace_state_v1']);
        if (lockRows[0]?.acquired !== 1) throw Object.assign(new Error('The shared workspace is busy. Try again.'), { status: 503 });
        dbLock = true;
      }
      await refreshState(dbConnection);
    }
    if (url.pathname === '/api/health' && req.method === 'GET') return json(res, 200, { status: 'ok', app: 'TemirTrace', backend: pool ? 'mysql' : 'local-json', accessProtected: Boolean(ACCESS_CODE), cluster: 'devnet', timestamp: new Date().toISOString() });
    if (url.pathname === '/api/state' && req.method === 'GET') return json(res, 200, state);
    if (url.pathname === '/api/review-queue' && req.method === 'GET') {
      const org = state.org?.verification?.status === 'pending' ? state.org : null;
      return json(res, 200, { items: org ? [{ id: org.id, name: org.name, bin: org.bin, city: org.city, type: org.type, submittedAt: org.verification.requestedAt || null }] : [] });
    }
    if (url.pathname === '/api/review-queue/decision' && req.method === 'POST') {
      const input = await bodyJson(req);
      const decision = input.decision;
      const note = typeof input.note === 'string' ? input.note.trim().slice(0, 500) : '';
      if (!['approve_demo', 'request_changes'].includes(decision)) return json(res, 400, { error: 'Choose approve_demo or request_changes' });
      if (!note) return json(res, 400, { error: 'A reviewer note is required' });
      if (!state.org || state.org.verification?.status !== 'pending') return json(res, 409, { error: 'There is no pending organization review' });
      const reviewedAt = new Date().toISOString();
      const entry = { decision, note, reviewedAt, reviewer: 'Local demo reviewer' };
      const history = Array.isArray(state.org.reviewHistory) ? state.org.reviewHistory : [];
      state.org = { ...state.org, verification: decision === 'approve_demo'
        ? { status: 'demo_verified', mode: 'manual_demo_review', reviewedAt }
        : { status: 'needs_changes', mode: 'manual_demo_review', reviewedAt, note },
        reviewHistory: [entry, ...history] };
      await persist(dbConnection);
      return json(res, 200, { org: state.org });
    }
    if (url.pathname === '/api/state' && req.method === 'PUT') {
      const next = await bodyJson(req);
      if (!next || typeof next !== 'object' || !Array.isArray(next.assets) || !Array.isArray(next.events)) return json(res, 400, { error: 'State must contain assets and events arrays' });
      if (JSON.stringify(next).length > MAX_BODY) return json(res, 413, { error: 'Saved workspace is too large' });
      state = { org: next.org || null, assets: next.assets, events: next.events };
      await persist(dbConnection); return json(res, 200, { saved: true, counts: { assets: state.assets.length, events: state.events.length } });
    }
    const verifyMatch = url.pathname.match(/^\/api\/verify\/([A-Za-z0-9-]+)$/);
    if (verifyMatch && req.method === 'POST') {
      const record = state.events.find(x => x.id === verifyMatch[1]);
      const input = await bodyJson(req);
      const result = await verifyRecord(record, input.signature, dbConnection);
      return json(res, 200, result);
    }
    const publicMatch = url.pathname.match(/^\/api\/public\/passport\/([A-Za-z0-9-]+)$/);
    if (publicMatch && req.method === 'GET') {
      const asset = state.assets.find(x => x.id === publicMatch[1]);
      if (!asset) return json(res, 404, { error: 'Public passport not found' });
      const org = state.org?.id === asset.organizationId ? state.org : null;
      if (!org) return json(res, 404, { error: 'Issuing organization not found' });
      const records = state.events.filter(x => x.assetId === asset.id).map(ev => ({
        id: ev.id, title: ev.title, date: ev.date, provider: ev.provider, notes: ev.notes, hash: ev.hash,
        signature: ev.signature || '', chainStatus: ev.chainStatus || (ev.signature ? 'submitted' : 'not_submitted'), chainBlockTime: ev.chainBlockTime || null,
      }));
      return json(res, 200, { asset, organization: { name: org.name, city: org.city, verificationLabel: org.verification?.status === 'demo_verified' ? 'Demo review only' : org.verification?.status === 'verified' ? 'Reviewed' : 'Not reviewed' }, events: records });
    }
    if (url.pathname.startsWith('/api/')) return json(res, 404, { error: 'API route not found' });
    if (req.method !== 'GET' && req.method !== 'HEAD') return json(res, 405, { error: 'Method not allowed' });
    return await serveStatic(req, res, url.pathname);
  } catch (e) {
    console.error('Request failed:', e.message);
    return json(res, e.status || 500, { error: e.status && e.status < 500 ? e.message : 'The server could not complete this request.' });
  } finally {
    if (dbConnection) {
      if (dbLock) { try { await dbConnection.query('SELECT RELEASE_LOCK(?)', ['temirtrace_state_v1']); } catch { /* connection will be returned below */ } }
      dbConnection.release();
    }
  }
}

export default handleRequest;

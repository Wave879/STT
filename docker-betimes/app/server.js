import express from 'express';
import { execFile } from 'child_process';
import crypto from 'crypto';
import fs from 'fs/promises';
import multer from 'multer';
import os from 'os';
import path from 'path';
import pg from 'pg';
import { promisify } from 'util';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const execFileAsync = promisify(execFile);
// WEB_ROOT is set in Dockerfile. In local dev it falls back relative to this file.
const webRoot = process.env.WEB_ROOT
  ? path.resolve(process.env.WEB_ROOT)
  : path.resolve(__dirname, '..', '..', 'web_cloudflare');
const pythonRoot = process.env.PYTHON_ROOT
  ? path.resolve(process.env.PYTHON_ROOT)
  : path.resolve(__dirname, '..', 'python');
const app = express();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 500 * 1024 * 1024 } });
const { Pool } = pg;

const port = Number(process.env.PORT || 9100);
const azureRegion = process.env.AZURE_REGION || 'southeastasia';
const oaiDeploy = process.env.OAI_DEPLOY || 'gpt-4o-mini-2';
const whisperMode = (process.env.WHISPER_MODE || 'local').toLowerCase();
const whisperEndpoint = (process.env.WHISPER_ENDPOINT || process.env.WHISPERX_ENDPOINT || 'http://192.168.10.19:9000').replace(/\/$/, '');
const whisperEnabled = !['0', 'false', 'no', 'off'].includes(String(process.env.ENABLE_WHISPER || 'true').toLowerCase());
const pythonBin = process.env.PYTHON_BIN || (process.platform === 'win32' ? 'python' : 'python3');
const authSecret = process.env.AUTH_SECRET || 'change-me-in-production';
const authTtlHours = Number(process.env.AUTH_TTL_HOURS || 12);
const defaultAdminUsername = process.env.DEFAULT_ADMIN_USERNAME || 'admin';
const defaultAdminPassword = process.env.DEFAULT_ADMIN_PASSWORD || '123456789';
const whisperProxySecret = process.env.WHISPER_PROXY_SECRET || '';
const pool = new Pool({
  host: process.env.PGHOST || 'db',
  port: Number(process.env.PGPORT || 5432),
  user: process.env.PGUSER || 'btimes',
  password: process.env.PGPASSWORD || 'btimes123',
  database: process.env.PGDATABASE || 'betimes_apps',
});

app.disable('x-powered-by');
app.use(express.json({ limit: '500mb' }));
app.use(express.urlencoded({ extended: true, limit: '500mb' }));

function ocrUploadMiddleware(req, res, next) {
  const contentType = req.headers['content-type'] || '';
  if (contentType.includes('multipart/form-data')) {
    upload.single('file')(req, res, next);
    return;
  }
  express.raw({ type: '*/*', limit: '50mb' })(req, res, next);
}

function sendJson(res, status, payload) {
  res.status(status).type('application/json; charset=utf-8').send(JSON.stringify(payload));
}

async function fetchWithTimeout(url, options = {}, timeoutMs = 90000) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(new Error(`Timeout after ${timeoutMs}ms`)), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}

function base64UrlEncode(value) {
  return Buffer.from(value).toString('base64url');
}

function base64UrlDecode(value) {
  return Buffer.from(value, 'base64url').toString('utf8');
}

function safeCompareString(left, right) {
  const a = Buffer.from(String(left || ''));
  const b = Buffer.from(String(right || ''));
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const digest = crypto.scryptSync(String(password), salt, 64).toString('hex');
  return `${salt}:${digest}`;
}

function verifyPassword(password, storedHash) {
  const [salt, digest] = String(storedHash || '').split(':');
  if (!salt || !digest) return false;
  const incoming = crypto.scryptSync(String(password), salt, 64);
  const stored = Buffer.from(digest, 'hex');
  if (incoming.length !== stored.length) return false;
  return crypto.timingSafeEqual(incoming, stored);
}

function signToken(payload) {
  const encodedPayload = base64UrlEncode(JSON.stringify(payload));
  const signature = crypto.createHmac('sha256', authSecret).update(encodedPayload).digest('base64url');
  return `${encodedPayload}.${signature}`;
}

function verifyToken(token) {
  const [encodedPayload, signature] = String(token || '').split('.');
  if (!encodedPayload || !signature) throw new Error('Invalid token');
  const expected = crypto.createHmac('sha256', authSecret).update(encodedPayload).digest('base64url');
  if (!safeCompareString(signature, expected)) throw new Error('Invalid token signature');
  const payload = JSON.parse(base64UrlDecode(encodedPayload));
  if (!payload.exp || payload.exp < Date.now()) throw new Error('Token expired');
  return payload;
}

function issueAuth(user) {
  const expiresAt = Date.now() + authTtlHours * 60 * 60 * 1000;
  return {
    token: signToken({
      sub: user.id,
      username: user.username,
      role: user.role,
      exp: expiresAt,
    }),
    expiresAt,
    user: sanitizeUser(user),
  };
}

function sanitizeUser(user) {
  if (!user) return null;
  return {
    id: user.id,
    username: user.username,
    role: user.role,
    is_active: user.is_active,
    created_at: user.created_at,
    updated_at: user.updated_at,
  };
}

function extractBearerToken(req) {
  const authHeader = req.get('Authorization') || '';
  const match = authHeader.match(/^Bearer\s+(.+)$/i);
  return match ? match[1] : '';
}

async function findUserByUsername(username) {
  const result = await pool.query(
    `SELECT id, username, password_hash, role, is_active, created_at, updated_at
     FROM app_users
     WHERE username = $1
     LIMIT 1`,
    [username],
  );
  return result.rows[0] || null;
}

async function requireApiAuth(req, res, next) {
  try {
    const token = extractBearerToken(req);
    if (!token) {
      sendJson(res, 401, { error: 'Authentication required' });
      return;
    }
    const payload = verifyToken(token);
    const user = await findUserByUsername(payload.username);
    if (!user || !user.is_active) {
      sendJson(res, 401, { error: 'Authentication required' });
      return;
    }
    req.authPayload = payload;
    req.authUser = user;
    next();
  } catch {
    sendJson(res, 401, { error: 'Authentication required' });
  }
}

function requireAdmin(req, res, next) {
  if (req.authUser?.role !== 'admin') {
    sendJson(res, 403, { error: 'Admin access required' });
    return;
  }
  next();
}

function requireWhisperProxySecret(req, res, next) {
  if (!whisperProxySecret) {
    next();
    return;
  }
  const incoming = req.get('X-Whisper-Proxy-Secret') || '';
  if (!incoming || !safeCompareString(incoming, whisperProxySecret)) {
    sendJson(res, 401, { error: 'Invalid whisper proxy secret' });
    return;
  }
  next();
}

async function saveHistoryRecord({ userId, kind, fileName, meta = {}, payload = {} }) {
  const result = await pool.query(
    `INSERT INTO app_history (user_id, kind, file_name, meta, payload)
     VALUES ($1, $2, $3, $4::jsonb, $5::jsonb)
     RETURNING id, user_id, kind, file_name, meta, payload, created_at, updated_at`,
    [userId, kind, fileName || null, JSON.stringify(meta || {}), JSON.stringify(payload || {})],
  );
  return result.rows[0];
}

async function findHistoryRecordById({ id, userId }) {
  const result = await pool.query(
    `SELECT id, user_id, kind, file_name, meta, payload, created_at, updated_at
     FROM app_history
     WHERE id = $1 AND user_id = $2
     LIMIT 1`,
    [id, userId],
  );
  return result.rows[0] || null;
}

async function updateHistoryRecord({ id, userId, meta, payload }) {
  const fields = [];
  const values = [id, userId];
  let cursor = values.length;

  if (meta !== undefined) {
    cursor += 1;
    fields.push(`meta = $${cursor}::jsonb`);
    values.push(JSON.stringify(meta || {}));
  }
  if (payload !== undefined) {
    cursor += 1;
    fields.push(`payload = $${cursor}::jsonb`);
    values.push(JSON.stringify(payload || {}));
  }

  if (!fields.length) return findHistoryRecordById({ id, userId });

  const result = await pool.query(
    `UPDATE app_history
     SET ${fields.join(', ')}, updated_at = NOW()
     WHERE id = $1 AND user_id = $2
     RETURNING id, user_id, kind, file_name, meta, payload, created_at, updated_at`,
    values,
  );
  return result.rows[0] || null;
}

function normalizeAgentComments(comments) {
  if (!Array.isArray(comments)) return [];
  return comments
    .map((item) => ({
      id: Number(item?.id) || Date.now(),
      role: item?.role === 'assistant' ? 'assistant' : 'user',
      text: String(item?.text || '').trim(),
      ts: String(item?.ts || '').trim(),
    }))
    .filter((item) => item.text)
    .slice(-100);
}

async function requestAzureOpenAiWhisper(inputFile, language) {
  const key = process.env.OAI_KEY;
  const endpointRaw = process.env.OAI_ENDPOINT;
  if (!key || !endpointRaw) {
    return { ok: false, status: 503, text: JSON.stringify({ error: 'Azure OpenAI Whisper fallback not configured' }) };
  }

  const deploy = process.env.WHISPER_DEPLOY || 'whisper';
  const form = new FormData();
  form.append('file', new Blob([inputFile.buffer], { type: inputFile.mimetype || 'audio/wav' }), inputFile.originalname || 'audio.wav');
  form.append('language', String(language || 'th'));
  form.append('response_format', 'json');

  const response = await fetchWithTimeout(`${String(endpointRaw).replace(/\/$/, '')}/openai/deployments/${deploy}/audio/transcriptions?api-version=2024-06-01`, {
    method: 'POST',
    headers: { 'api-key': key },
    body: form,
  }, 120000).catch((error) => ({ ok: false, status: 502, text: async () => String(error) }));

  const text = await response.text();
  return { ok: response.ok, status: response.status || 502, text };
}

function extractWhisperText(text) {
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    return { ok: false, error: { error: 'Invalid Whisper response', raw: String(text || '').slice(0, 500) } };
  }
  const chunkText = Array.isArray(data?.chunks)
    ? data.chunks.map((item) => item?.text || '').filter(Boolean).join(' ').trim()
    : '';
  const finalText =
    data?.text ||
    data?.transcription ||
    data?.response?.text ||
    data?.response?.transcription ||
    chunkText ||
    '';
  if (!String(finalText).trim()) {
    return { ok: false, error: { error: 'Whisper returned empty text' } };
  }
  return { ok: true, text: finalText };
}

const inMemoryUploads = new Map();
const uploadSessions = new Map();

function cleanupUploadStores() {
  const now = Date.now();
  for (const [id, item] of inMemoryUploads.entries()) {
    if ((item.expiresAt || 0) <= now) inMemoryUploads.delete(id);
  }
  for (const [id, item] of uploadSessions.entries()) {
    if ((item.expiresAt || 0) <= now) uploadSessions.delete(id);
  }
}

function createUploadResource({ buffer, type, originalname }) {
  cleanupUploadStores();
  const id = crypto.randomUUID();
  inMemoryUploads.set(id, {
    buffer,
    type: type || 'application/octet-stream',
    originalname: originalname || 'upload.bin',
    expiresAt: Date.now() + (15 * 60 * 1000),
  });
  return id;
}

function getUploadResource(uploadId) {
  cleanupUploadStores();
  const item = inMemoryUploads.get(String(uploadId || ''));
  if (!item) return null;
  return {
    buffer: item.buffer,
    mimetype: item.type || 'application/octet-stream',
    originalname: item.originalname || 'upload.bin',
  };
}

function resolveUploadedInput(req, fieldNames = ['file', 'audio']) {
  const files = Array.isArray(req.files)
    ? req.files
    : Object.values(req.files || {}).flat();
  const directFile = files.find((item) => fieldNames.includes(item.fieldname))
    || (req.file && fieldNames.includes(req.file.fieldname || fieldNames[0]) ? req.file : null);
  if (directFile) return directFile;

  const uploadId = String(req.body?.uploadId || '').trim();
  if (!uploadId) return null;
  return getUploadResource(uploadId);
}

async function bootstrapDatabase() {
  await withDbRetry(async () => {
    await pool.query('SELECT 1');
    const schemaSql = await fs.readFile(path.resolve(__dirname, '..', 'db', 'init', '001_auth.sql'), 'utf8');
    await pool.query(schemaSql);
    const existing = await findUserByUsername(defaultAdminUsername);
    if (!existing) {
      await pool.query(
        `INSERT INTO app_users (username, password_hash, role)
         VALUES ($1, $2, 'admin')`,
        [defaultAdminUsername, hashPassword(defaultAdminPassword)],
      );
    }
  });
}

async function withDbRetry(task, attempts = 30, waitMs = 2000) {
  let lastError = null;
  for (let index = 0; index < attempts; index += 1) {
    try {
      return await task();
    } catch (error) {
      lastError = error;
      console.warn(`DB retry ${index + 1}/${attempts}: ${error.message}`);
      await new Promise((resolve) => setTimeout(resolve, waitMs));
    }
  }
  throw lastError;
}

function sanitizeFileStem(value) {
  return String(value || 'document')
    .replace(/\.[^.]+$/, '')
    .replace(/[^a-zA-Z0-9ก-๙_-]+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '') || 'document';
}

function getExportMeta(format, fileName) {
  const stem = sanitizeFileStem(fileName);
  const mapping = {
    docx: {
      contentType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      extension: 'docx',
    },
    xlsx: {
      contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      extension: 'xlsx',
    },
    md: {
      contentType: 'text/markdown; charset=utf-8',
      extension: 'md',
    },
    txt: {
      contentType: 'text/plain; charset=utf-8',
      extension: 'txt',
    },
    json: {
      contentType: 'application/json; charset=utf-8',
      extension: 'json',
    },
  };
  const meta = mapping[format];
  return {
    contentType: meta.contentType,
    downloadName: `${stem}.${meta.extension}`,
  };
}

async function runOcrExport({ format, fileBuffer, fileName, ocrResult }) {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ocr-export-'));
  const safeInputName = path.basename(fileName || 'document');
  const inputPath = path.join(tempDir, safeInputName);
  const ocrJsonPath = path.join(tempDir, 'ocr-result.json');
  const extension = getExportMeta(format, safeInputName).downloadName.split('.').pop();
  const outputPath = path.join(tempDir, `export.${extension}`);

  try {
    await fs.writeFile(inputPath, fileBuffer);
    await fs.writeFile(ocrJsonPath, JSON.stringify(ocrResult || {}), 'utf8');

    await execFileAsync(
      pythonBin,
      [
        path.join(pythonRoot, 'ocr_export.py'),
        '--format', format,
        '--input', inputPath,
        '--ocr-json', ocrJsonPath,
        '--output', outputPath,
      ],
      {
        env: process.env,
        maxBuffer: 10 * 1024 * 1024,
      },
    );

    return await fs.readFile(outputPath);
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
  }
}

function stripSelectionTokens(value) {
  return String(value || '')
    .replace(/:unselected:|:selected:/g, '')
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/\n[ \t]+/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function toBase64(buffer) {
  return Buffer.from(buffer).toString('base64');
}

function polygonToBounds(poly, width, height) {
  if (!Array.isArray(poly) || poly.length < 8 || !width || !height) return null;
  const xs = poly.filter((_, index) => index % 2 === 0).map((x) => x / width);
  const ys = poly.filter((_, index) => index % 2 === 1).map((y) => y / height);
  const left = Math.min(...xs);
  const top = Math.min(...ys);
  const right = Math.max(...xs);
  const bottom = Math.max(...ys);
  return {
    left: Math.max(0, Math.min(1, left)),
    top: Math.max(0, Math.min(1, top)),
    width: Math.max(0, Math.min(1, right - left)),
    height: Math.max(0, Math.min(1, bottom - top)),
  };
}

function buildTable(table) {
  const headers = {};
  const rows = {};
  for (const cell of table.cells || []) {
    const rowIndex = cell.rowIndex || 0;
    const colIndex = cell.columnIndex || 0;
    const content = stripSelectionTokens(cell.content || '');
    if (rowIndex === 0) {
      headers[colIndex] = content || `Col_${colIndex + 1}`;
      continue;
    }
    if (!rows[rowIndex]) rows[rowIndex] = {};
    rows[rowIndex][headers[colIndex] || `Col_${colIndex + 1}`] = content;
  }
  return Object.values(rows);
}

function buildBoxes(paragraphs, lines, width, height) {
  const boxes = [];
  let titleUsed = false;
  for (const paragraph of paragraphs) {
    const bounds = polygonToBounds(paragraph.polygon, width, height);
    if (!bounds) continue;
    let label = paragraph.role && paragraph.role !== 'text' ? paragraph.role : 'text';
    if (label === 'text' && !titleUsed && (paragraph.content || '').length > 40) {
      label = 'title';
      titleUsed = true;
    }
    boxes.push({ label, content: paragraph.content || '', bounds });
  }
  if (boxes.length) return boxes;
  for (const line of lines || []) {
    const bounds = polygonToBounds(line.polygon, width, height);
    if (bounds) boxes.push({ label: 'text', content: stripSelectionTokens(line.content || ''), bounds });
  }
  return boxes;
}

function buildMarkdown(pages) {
  return pages.map((page) => {
    const parts = [];
    for (const paragraph of page.paragraphs || []) {
      const content = (paragraph.content || '').trim();
      if (!content) continue;
      if (paragraph.role === 'title') parts.push(`# ${content}`);
      else if (paragraph.role === 'sectionHeading') parts.push(`## ${content}`);
      else if (paragraph.role === 'footnote') parts.push(`_${content}_`);
      else parts.push(content);
    }
    return parts.join('\n\n');
  }).join('\n\n---\n\n');
}

function getRequiredEnv(name, res) {
  const value = process.env[name];
  if (!value) {
    sendJson(res, 500, { error: `${name} not configured in environment` });
    return null;
  }
  return value;
}

app.post('/api/auth/login', async (req, res) => {
  try {
    const username = String(req.body?.username || '').trim();
    const password = String(req.body?.password || '');
    if (!username || !password) {
      sendJson(res, 400, { error: 'Missing username or password' });
      return;
    }
    const user = await findUserByUsername(username);
    if (!user || !user.is_active || !verifyPassword(password, user.password_hash)) {
      sendJson(res, 401, { error: 'Invalid username or password' });
      return;
    }
    sendJson(res, 200, issueAuth(user));
  } catch (error) {
    sendJson(res, 500, { error: String(error.message || error) });
  }
});

app.get('/api/auth/me', requireApiAuth, async (req, res) => {
  sendJson(res, 200, {
    user: sanitizeUser(req.authUser),
    expiresAt: req.authPayload.exp,
  });
});

app.post('/api/auth/change-password', requireApiAuth, async (req, res) => {
  try {
    const currentPassword = String(req.body?.currentPassword || '');
    const newPassword = String(req.body?.newPassword || '');
    if (!currentPassword || !newPassword) {
      sendJson(res, 400, { error: 'Missing password values' });
      return;
    }
    if (newPassword.length < 6) {
      sendJson(res, 400, { error: 'Password must be at least 6 characters' });
      return;
    }
    if (!verifyPassword(currentPassword, req.authUser.password_hash)) {
      sendJson(res, 401, { error: 'Current password is incorrect' });
      return;
    }
    await pool.query(
      `UPDATE app_users
       SET password_hash = $2, updated_at = NOW()
       WHERE id = $1`,
      [req.authUser.id, hashPassword(newPassword)],
    );
    const refreshedUser = await findUserByUsername(req.authUser.username);
    sendJson(res, 200, issueAuth(refreshedUser));
  } catch (error) {
    sendJson(res, 500, { error: String(error.message || error) });
  }
});

app.get('/api/auth/users', requireApiAuth, requireAdmin, async (_req, res) => {
  try {
    const result = await pool.query(
      `SELECT id, username, role, is_active, created_at, updated_at
       FROM app_users
       ORDER BY username ASC`,
    );
    sendJson(res, 200, { users: result.rows.map(sanitizeUser) });
  } catch (error) {
    sendJson(res, 500, { error: String(error.message || error) });
  }
});

app.post('/api/auth/users', requireApiAuth, requireAdmin, async (req, res) => {
  try {
    const username = String(req.body?.username || '').trim();
    const password = String(req.body?.password || '');
    const role = String(req.body?.role || 'user').toLowerCase() === 'admin' ? 'admin' : 'user';
    if (!username) {
      sendJson(res, 400, { error: 'Username is required' });
      return;
    }
    if (password.length < 6) {
      sendJson(res, 400, { error: 'Password must be at least 6 characters' });
      return;
    }
    const existing = await findUserByUsername(username);
    if (existing) {
      sendJson(res, 409, { error: 'Username already exists' });
      return;
    }
    const result = await pool.query(
      `INSERT INTO app_users (username, password_hash, role)
       VALUES ($1, $2, $3)
       RETURNING id, username, role, is_active, created_at, updated_at`,
      [username, hashPassword(password), role],
    );
    sendJson(res, 201, { user: sanitizeUser(result.rows[0]) });
  } catch (error) {
    sendJson(res, 500, { error: String(error.message || error) });
  }
});

app.delete('/api/auth/users/:username', requireApiAuth, requireAdmin, async (req, res) => {
  try {
    const username = String(req.params.username || '').trim();
    if (!username) {
      sendJson(res, 400, { error: 'Username is required' });
      return;
    }
    if (username === defaultAdminUsername) {
      sendJson(res, 400, { error: 'Cannot delete default admin user' });
      return;
    }
    if (username === req.authUser.username) {
      sendJson(res, 400, { error: 'Cannot delete the current user' });
      return;
    }
    const deleted = await pool.query(
      `DELETE FROM app_users WHERE username = $1 RETURNING id`,
      [username],
    );
    if (!deleted.rowCount) {
      sendJson(res, 404, { error: 'User not found' });
      return;
    }
    sendJson(res, 200, { ok: true });
  } catch (error) {
    sendJson(res, 500, { error: String(error.message || error) });
  }
});

app.get('/api/history', requireApiAuth, async (req, res) => {
  try {
    const kind = String(req.query.kind || '').trim();
    const limitRaw = Number(req.query.limit || 50);
    const limit = Number.isFinite(limitRaw) ? Math.min(Math.max(limitRaw, 1), 200) : 50;
    const values = [req.authUser.id];
    let where = 'WHERE user_id = $1';
    if (kind) {
      values.push(kind);
      where += ` AND kind = $${values.length}`;
    }
    values.push(limit);
    const result = await pool.query(
      `SELECT id, kind, file_name, meta, payload, created_at, updated_at
       FROM app_history
       ${where}
       ORDER BY created_at DESC
       LIMIT $${values.length}`,
      values,
    );
    sendJson(res, 200, { records: result.rows });
  } catch (error) {
    sendJson(res, 500, { error: String(error.message || error) });
  }
});

app.get('/api/history/:id', requireApiAuth, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT id, kind, file_name, meta, payload, created_at, updated_at
       FROM app_history
       WHERE id = $1 AND user_id = $2
       LIMIT 1`,
      [req.params.id, req.authUser.id],
    );
    if (!result.rows.length) {
      sendJson(res, 404, { error: 'History item not found' });
      return;
    }
    sendJson(res, 200, { record: result.rows[0] });
  } catch (error) {
    sendJson(res, 500, { error: String(error.message || error) });
  }
});

app.delete('/api/history/:id', requireApiAuth, async (req, res) => {
  try {
    const result = await pool.query(
      `DELETE FROM app_history
       WHERE id = $1 AND user_id = $2
       RETURNING id`,
      [req.params.id, req.authUser.id],
    );
    if (!result.rowCount) {
      sendJson(res, 404, { error: 'History item not found' });
      return;
    }
    sendJson(res, 200, { ok: true });
  } catch (error) {
    sendJson(res, 500, { error: String(error.message || error) });
  }
});

app.post('/api/history/transcript', requireApiAuth, async (req, res) => {
  try {
    const fileName = String(req.body?.fileName || '').trim();
    const transcript = String(req.body?.transcript || '');
    if (!transcript) {
      sendJson(res, 400, { error: 'Transcript is required' });
      return;
    }
    const record = await saveHistoryRecord({
      userId: req.authUser.id,
      kind: 'transcript',
      fileName,
      meta: {
        duration: req.body?.duration || '',
        speakers: req.body?.speakers || null,
        sourceModels: req.body?.sourceModels || [],
      },
      payload: {
        transcript,
        summary: req.body?.summary || '',
        azure: req.body?.azure || '',
        whisper: req.body?.whisper || '',
        mai: req.body?.mai || '',
        agentComments: normalizeAgentComments(req.body?.agentComments),
      },
    });
    sendJson(res, 201, { record });
  } catch (error) {
    sendJson(res, 500, { error: String(error.message || error) });
  }
});

app.patch('/api/history/:id/transcript', requireApiAuth, async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isFinite(id) || id <= 0) {
      sendJson(res, 400, { error: 'Invalid history id' });
      return;
    }

    const existing = await findHistoryRecordById({ id, userId: req.authUser.id });
    if (!existing) {
      sendJson(res, 404, { error: 'History item not found' });
      return;
    }
    if (existing.kind !== 'transcript') {
      sendJson(res, 400, { error: 'Only transcript history can be updated' });
      return;
    }

    const nextPayload = {
      ...(existing.payload || {}),
      ...(req.body?.summary !== undefined ? { summary: String(req.body.summary || '') } : {}),
      ...(req.body?.transcript !== undefined ? { transcript: String(req.body.transcript || '') } : {}),
      ...(req.body?.azure !== undefined ? { azure: String(req.body.azure || '') } : {}),
      ...(req.body?.whisper !== undefined ? { whisper: String(req.body.whisper || '') } : {}),
      ...(req.body?.mai !== undefined ? { mai: String(req.body.mai || '') } : {}),
      ...(req.body?.agentComments !== undefined ? { agentComments: normalizeAgentComments(req.body.agentComments) } : {}),
    };

    const nextMeta = {
      ...(existing.meta || {}),
      ...(req.body?.duration !== undefined ? { duration: req.body.duration || '' } : {}),
      ...(req.body?.speakers !== undefined ? { speakers: req.body.speakers || null } : {}),
      ...(req.body?.sourceModels !== undefined ? { sourceModels: req.body.sourceModels || [] } : {}),
    };

    const record = await updateHistoryRecord({
      id,
      userId: req.authUser.id,
      meta: nextMeta,
      payload: nextPayload,
    });

    if (!record) {
      sendJson(res, 404, { error: 'History item not found' });
      return;
    }
    sendJson(res, 200, { record });
  } catch (error) {
    sendJson(res, 500, { error: String(error.message || error) });
  }
});

app.get('/api/health', async (_req, res) => {
  let whisperReachable = null;
  if (whisperEnabled && whisperMode === 'local' && whisperEndpoint) {
    try {
      const response = await fetchWithTimeout(`${whisperEndpoint}/`, { method: 'GET' }, 4000);
      whisperReachable = response.ok;
    } catch {
      whisperReachable = false;
    }
  }

  sendJson(res, 200, {
    status: 'ok',
    service: 'sttfinal-summary-server',
    whisperEnabled,
    whisperMode,
    whisperEndpoint,
    whisperReachable,
    ocrConfigured: Boolean(process.env.AZURE_DOCUMENT_INTELLIGENCE_ENDPOINT && process.env.AZURE_DOCUMENT_INTELLIGENCE_KEY),
    oaiConfigured: Boolean(process.env.OAI_ENDPOINT && process.env.OAI_KEY),
  });
});

app.get('/api/azure-token', requireApiAuth, async (_req, res) => {
  const key = getRequiredEnv('AZURE_KEY', res);
  if (!key) return;

  const tokenUrl = `https://${azureRegion}.api.cognitive.microsoft.com/sts/v1.0/issueToken`;
  const response = await fetchWithTimeout(tokenUrl, {
    method: 'POST',
    headers: { 'Ocp-Apim-Subscription-Key': key },
  }, 15000).catch((error) => ({ ok: false, status: 502, text: async () => String(error) }));

  if (!response.ok) {
    sendJson(res, response.status || 502, { error: `Azure token issue failed: ${await response.text()}` });
    return;
  }

  const token = await response.text();
  res.setHeader('Cache-Control', 'no-store');
  sendJson(res, 200, { token, region: azureRegion });
});

app.post('/api/oai', requireApiAuth, async (req, res) => {
  const key = getRequiredEnv('OAI_KEY', res);
  const endpointRaw = getRequiredEnv('OAI_ENDPOINT', res);
  if (!key || !endpointRaw) return;

  const endpoint = endpointRaw.replace(/\/$/, '');
  const payload = req.body || {};
  const { deploy: deployOverride, ...oaiBody } = payload;
  const deployment = deployOverride || oaiDeploy;
  const url = `${endpoint}/openai/deployments/${deployment}/chat/completions?api-version=2024-02-01`;

  const response = await fetchWithTimeout(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'api-key': key,
    },
    body: JSON.stringify(oaiBody),
  }, 120000).catch((error) => ({ ok: false, status: 502, text: async () => String(error) }));

  const text = await response.text();
  res.status(response.status || 502).type('application/json').send(text);
});

app.post('/api/upload-sessions', requireApiAuth, async (req, res) => {
  const fileName = String(req.body?.fileName || 'upload.bin').trim() || 'upload.bin';
  const mimeType = String(req.body?.mimeType || 'application/octet-stream').trim() || 'application/octet-stream';
  const totalSize = Number(req.body?.totalSize || 0);
  if (!Number.isFinite(totalSize) || totalSize <= 0) {
    sendJson(res, 400, { error: 'Invalid totalSize' });
    return;
  }
  cleanupUploadStores();
  const sessionId = crypto.randomUUID();
  uploadSessions.set(sessionId, {
    userId: req.authUser.id,
    fileName,
    mimeType,
    totalSize,
    chunks: new Map(),
    expiresAt: Date.now() + (15 * 60 * 1000),
  });
  sendJson(res, 201, { sessionId });
});

app.put('/api/upload-sessions/:id/chunk', requireApiAuth, express.raw({ type: '*/*', limit: '10mb' }), async (req, res) => {
  cleanupUploadStores();
  const session = uploadSessions.get(req.params.id);
  if (!session || session.userId !== req.authUser.id) {
    sendJson(res, 404, { error: 'Upload session not found' });
    return;
  }
  const index = Number(req.query?.index);
  const body = Buffer.isBuffer(req.body) ? req.body : Buffer.from(req.body || []);
  if (!Number.isInteger(index) || index < 0 || !body.length) {
    sendJson(res, 400, { error: 'Invalid chunk payload' });
    return;
  }
  session.chunks.set(index, body);
  session.expiresAt = Date.now() + (15 * 60 * 1000);
  sendJson(res, 200, { ok: true, index });
});

app.post('/api/upload-sessions/:id/complete', requireApiAuth, async (req, res) => {
  cleanupUploadStores();
  const session = uploadSessions.get(req.params.id);
  if (!session || session.userId !== req.authUser.id) {
    sendJson(res, 404, { error: 'Upload session not found' });
    return;
  }
  const ordered = [...session.chunks.entries()].sort((a, b) => a[0] - b[0]);
  const buffers = ordered.map(([, value]) => value);
  const totalBytes = buffers.reduce((sum, item) => sum + item.length, 0);
  if (!buffers.length || totalBytes <= 0) {
    sendJson(res, 400, { error: 'No uploaded chunks' });
    return;
  }
  if (session.totalSize && totalBytes !== session.totalSize) {
    sendJson(res, 400, { error: `Uploaded size mismatch (${totalBytes}/${session.totalSize})` });
    return;
  }
  const uploadId = createUploadResource({
    buffer: Buffer.concat(buffers),
    type: session.mimeType,
    originalname: session.fileName,
  });
  uploadSessions.delete(req.params.id);
  sendJson(res, 201, { uploadId });
});

app.post('/api/ocr-analyze', requireApiAuth, ocrUploadMiddleware, async (req, res) => {
  const endpointRaw = getRequiredEnv('AZURE_DOCUMENT_INTELLIGENCE_ENDPOINT', res);
  const key = getRequiredEnv('AZURE_DOCUMENT_INTELLIGENCE_KEY', res);
  if (!endpointRaw || !key) return;

  let fileBuffer;
  let fileName;
  let browserMime;
  let isPdf = false;

  if (req.file) {
    fileBuffer = req.file.buffer;
    fileName = req.file.originalname || 'document';
    browserMime = req.file.mimetype || 'application/octet-stream';
  } else {
    fileBuffer = Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0);
    const rawName = req.header('X-Filename') || 'document.pdf';
    try {
      fileName = decodeURIComponent(rawName);
    } catch {
      fileName = rawName;
    }
    browserMime = req.header('Content-Type') || 'application/octet-stream';
    isPdf = browserMime.includes('application/pdf') || browserMime.includes('application/x-pdf');
  }

  if (!fileBuffer || fileBuffer.length === 0) {
    sendJson(res, 400, { detail: 'Uploaded file is empty' });
    return;
  }

  if (!isPdf) {
    const magic = fileBuffer.subarray(0, 4);
    isPdf = (magic[0] === 0x25 && magic[1] === 0x50 && magic[2] === 0x44 && magic[3] === 0x46)
      || String(fileName || '').toLowerCase().endsWith('.pdf')
      || browserMime === 'application/pdf'
      || browserMime === 'application/x-pdf';
  }

  const contentType = isPdf ? 'application/pdf' : (browserMime || 'image/jpeg');
  const endpoint = endpointRaw.replace(/\/$/, '');
  const analyzeUrl = `${endpoint}/documentintelligence/documentModels/prebuilt-layout:analyze?api-version=2024-11-30`;

  const submitRes = await fetch(analyzeUrl, {
    method: 'POST',
    headers: {
      'Ocp-Apim-Subscription-Key': key,
      'Content-Type': contentType,
    },
    body: fileBuffer,
  }).catch((error) => ({ ok: false, status: 502, text: async () => `Network error: ${String(error)}`, headers: new Headers() }));

  if (!submitRes.ok) {
    sendJson(res, submitRes.status || 502, { detail: `Azure DI submit failed: ${(await submitRes.text()).slice(0, 800)}` });
    return;
  }

  const operationLocation = submitRes.headers.get('Operation-Location');
  if (!operationLocation) {
    sendJson(res, 502, { detail: 'No Operation-Location from Azure DI' });
    return;
  }

  let analyzeResult = null;
  for (let attempt = 0; attempt < 40; attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 1500));
    const pollRes = await fetch(operationLocation, {
      headers: { 'Ocp-Apim-Subscription-Key': key },
    }).catch((error) => ({ ok: false, status: 502, text: async () => `Poll network error: ${String(error)}` }));

    if (!pollRes.ok) {
      sendJson(res, pollRes.status || 502, { detail: `Poll failed: ${(await pollRes.text()).slice(0, 500)}` });
      return;
    }

    const pollData = await pollRes.json();
    if (pollData.status === 'succeeded') {
      analyzeResult = pollData.analyzeResult;
      break;
    }
    if (pollData.status === 'failed') {
      sendJson(res, 502, { detail: `Azure DI failed: ${JSON.stringify(pollData.error)}` });
      return;
    }
  }

  if (!analyzeResult) {
    sendJson(res, 504, { detail: 'Azure DI timed out.' });
    return;
  }

  const rawContent = stripSelectionTokens(analyzeResult.content || '');
  const pages = analyzeResult.pages || [];
  const paragraphs = analyzeResult.paragraphs || [];
  const tables = analyzeResult.tables || [];
  const imageDataUrl = !isPdf && fileBuffer.length < 4 * 1024 * 1024
    ? `data:${contentType};base64,${toBase64(fileBuffer)}`
    : null;

  const pagePayload = pages.map((page, index) => {
    const pageNumber = page.pageNumber || index + 1;
    const width = page.width || 1;
    const height = page.height || 1;
    const pageText = (page.lines || []).map((line) => stripSelectionTokens(line.content || '')).filter(Boolean).join('\n');
    const pageParagraphs = paragraphs
      .filter((paragraph) => (paragraph.boundingRegions || []).some((region) => region.pageNumber === pageNumber))
      .map((paragraph) => {
        const region = (paragraph.boundingRegions || []).find((entry) => entry.pageNumber === pageNumber) || {};
        return {
          content: stripSelectionTokens(paragraph.content || ''),
          role: paragraph.role || 'text',
          polygon: region.polygon || [],
        };
      });
    const pageTables = tables
      .filter((table) => (table.boundingRegions || []).some((region) => region.pageNumber === pageNumber))
      .map(buildTable);
    const preview = imageDataUrl && index === 0
      ? { image: imageDataUrl, width: Math.round(width * 96), height: Math.round(height * 96) }
      : null;

    return {
      pageNumber,
      width,
      height,
      unit: page.unit || 'inch',
      text: pageText,
      paragraphs: pageParagraphs,
      tables: pageTables,
      boxes: buildBoxes(pageParagraphs, page.lines || [], width, height),
      preview,
    };
  });

  const responsePayload = {
    filename: fileName,
    pageCount: pagePayload.length,
    markdown: rawContent || buildMarkdown(pagePayload),
    rawText: rawContent.slice(0, 50000),
    pages: pagePayload,
  };

  try {
    await saveHistoryRecord({
      userId: req.authUser.id,
      kind: 'ocr',
      fileName,
      meta: {
        pageCount: pagePayload.length,
        contentType,
        isPdf,
      },
      payload: responsePayload,
    });
  } catch (error) {
    console.warn('Failed to save OCR history:', error.message);
  }

  sendJson(res, 200, responsePayload);
});

app.post('/api/mai', requireApiAuth, upload.fields([{ name: 'audio', maxCount: 1 }, { name: 'definition', maxCount: 1 }]), async (req, res) => {
  try {
    const key = process.env.MAI_KEY || process.env.MAI_SPEECH_KEY;
    const endpointRaw = process.env.MAI_ENDPOINT || process.env.MAI_SPEECH_ENDPOINT || 'https://mai-speech.cognitiveservices.azure.com/';

    if (!key) {
      sendJson(res, 500, { error: 'MAI_KEY or MAI_SPEECH_KEY not configured' });
      return;
    }

    const audio = resolveUploadedInput(req, ['audio', 'file']);
    const definition = req.files?.definition?.[0] || (typeof req.body?.definition === 'string' ? req.body.definition : null);
    if (!audio || !definition) {
      sendJson(res, 400, { error: 'Missing audio or definition field' });
      return;
    }

    const definitionText = typeof definition === 'string' ? definition : definition.buffer.toString('utf-8');
    const audioType = audio.mimetype || 'audio/wav';
    const audioName = audio.originalname || 'audio.wav';
    const form = new FormData();
    form.append('audio', new Blob([audio.buffer], { type: audioType }), audioName);
    form.append('definition', new Blob([definitionText], { type: 'application/json' }), 'definition.json');

    let response;
    try {
      response = await fetchWithTimeout(`${endpointRaw.replace(/\/$/, '')}/speechtotext/transcriptions:transcribe?api-version=2024-11-15`, {
        method: 'POST',
        headers: {
          'Ocp-Apim-Subscription-Key': key,
        },
        body: form,
      }, 120000);
    } catch (error) {
      sendJson(res, 503, { error: 'Failed to reach MAI upstream service', detail: String(error) });
      return;
    }

    const text = await response.text();
    res.status(response.status || 502).type('application/json').send(text);
  } catch (error) {
    sendJson(res, 500, { error: 'Unhandled MAI proxy error', detail: String(error) });
  }
});

app.post('/api/azure-stt', requireApiAuth, upload.single('audio'), async (req, res) => {
  const key = getRequiredEnv('AZURE_KEY', res);
  if (!key) return;
  const inputFile = resolveUploadedInput(req, ['audio', 'file']);
  if (!inputFile) {
    sendJson(res, 400, { error: 'Missing audio field' });
    return;
  }

  const rawLang = typeof req.body?.language === 'string' ? req.body.language : 'th-TH';
  const language = rawLang && rawLang.includes('-') ? rawLang : `${rawLang || 'th'}-TH`;

  const form = new FormData();
  form.append('audio', new Blob([inputFile.buffer], { type: inputFile.mimetype || 'audio/wav' }), inputFile.originalname || 'audio.wav');
  form.append('definition', new Blob([JSON.stringify({
    locales: [language],
    profanityFilterMode: 'None',
    channels: [0],
    diarizationSettings: { minSpeakerCount: 1, maxSpeakerCount: 8 },
  })], { type: 'application/json' }));

  const response = await fetchWithTimeout(`https://${azureRegion}.api.cognitive.microsoft.com/speechtotext/transcriptions:transcribe?api-version=2024-11-15`, {
    method: 'POST',
    headers: { 'Ocp-Apim-Subscription-Key': key },
    body: form,
  }, 120000).catch((error) => ({ ok: false, status: 502, text: async () => String(error) }));

  const text = await response.text();
  res.status(response.status || 502).type('application/json').send(text);
});

app.post('/api/whisper-public', requireWhisperProxySecret, upload.any(), async (req, res) => {
  if (!whisperEnabled) {
    sendJson(res, 503, { error: 'Whisper disabled' });
    return;
  }
  const inputFile = resolveUploadedInput(req, ['file', 'audio']);
  if (!inputFile) {
    sendJson(res, 400, { error: 'audio field missing' });
    return;
  }

  const language = String(req.body?.language || 'th');
  const transcribeUrl = `${whisperEndpoint}/transcribe`;
  const form = new FormData();
  form.append('file', new Blob([inputFile.buffer], { type: inputFile.mimetype || 'audio/wav' }), inputFile.originalname || 'audio.wav');
  form.append('language', language);
  form.append('device', String(req.body?.device || 'auto'));

  const response = await fetchWithTimeout(transcribeUrl, {
    method: 'POST',
    body: form,
  }, 180000).catch((error) => ({ ok: false, status: 502, text: async () => String(error) }));

  const text = await response.text();
  if (response.ok) {
    const parsed = extractWhisperText(text);
    if (parsed.ok) {
      sendJson(res, 200, { text: parsed.text });
      return;
    }
  }

  const fallback = await requestAzureOpenAiWhisper(inputFile, language);
  if (fallback.ok) {
    res.status(fallback.status).type('application/json').send(fallback.text);
    return;
  }
  const localDetail = response.ok ? 'Whisper returned empty text' : text;
  res.status(502).type('application/json').send(JSON.stringify({
    error: 'Whisper local failed and Azure OpenAI fallback failed',
    local: String(localDetail || '').slice(0, 500),
    fallback: String(fallback.text || '').slice(0, 500),
  }));
});

app.post('/api/whisper', requireApiAuth, upload.any(), async (req, res) => {
  if (!whisperEnabled) {
    sendJson(res, 503, { error: 'Whisper disabled' });
    return;
  }
  const inputFile = resolveUploadedInput(req, ['file', 'audio']);
  if (!inputFile) {
    sendJson(res, 400, { error: 'audio field missing' });
    return;
  }

  if (whisperMode === 'local') {
    const language = String(req.body?.language || 'th');
    const transcribeUrl = `${whisperEndpoint}/transcribe`;
    const form = new FormData();
    form.append('file', new Blob([inputFile.buffer], { type: inputFile.mimetype || 'audio/wav' }), inputFile.originalname || 'audio.wav');
    form.append('language', language);
    form.append('device', String(req.body?.device || 'auto'));
    const response = await fetchWithTimeout(transcribeUrl, {
      method: 'POST',
      body: form,
    }, 180000).catch((error) => ({ ok: false, status: 502, text: async () => String(error) }));

    const text = await response.text();
    if (response.ok) {
      const parsed = extractWhisperText(text);
      if (parsed.ok) {
        sendJson(res, 200, { text: parsed.text });
        return;
      }
    }

    const fallback = await requestAzureOpenAiWhisper(inputFile, language);
    if (fallback.ok) {
      res.status(fallback.status).type('application/json').send(fallback.text);
      return;
    }
    const localDetail = response.ok ? 'Whisper returned empty text' : text;
    res.status(502).type('application/json').send(JSON.stringify({
      error: 'Whisper local failed and Azure OpenAI fallback failed',
      local: String(localDetail || '').slice(0, 500),
      fallback: String(fallback.text || '').slice(0, 500),
    }));
    return;
  }

  const fallback = await requestAzureOpenAiWhisper(inputFile, String(req.body?.language || 'th'));
  res.status(fallback.status || 502).type('application/json').send(fallback.text);
});

app.get('/_uploads/:id', (req, res) => {
  const item = inMemoryUploads.get(req.params.id);
  if (!item) {
    res.sendStatus(404);
    return;
  }
  res.type(item.type || 'application/octet-stream').send(item.buffer);
  setTimeout(() => inMemoryUploads.delete(req.params.id), 60_000);
});

app.use(express.static(webRoot));

app.get('/', (_req, res) => {
  res.sendFile(path.join(webRoot, 'login.html'));
});

app.get('/ocr_scan', (_req, res) => {
  res.sendFile(path.join(webRoot, 'ocr_scan.html'));
});

app.get('/profile', (_req, res) => {
  res.sendFile(path.join(webRoot, 'settings.html'));
});

app.post('/api/ocr-export', requireApiAuth, upload.single('file'), async (req, res) => {
  const formatRaw = String(req.body?.format || '').toLowerCase();
  const formatMap = { word: 'docx', excel: 'xlsx', markdown: 'md', txt: 'txt', json: 'json', docx: 'docx', xlsx: 'xlsx', md: 'md' };
  const format = formatMap[formatRaw];
  if (!format) {
    sendJson(res, 400, { error: 'Unsupported export format' });
    return;
  }
  if (!req.file) {
    sendJson(res, 400, { error: 'Missing file field' });
    return;
  }

  let ocrResult = {};
  try {
    ocrResult = req.body?.ocrResult ? JSON.parse(req.body.ocrResult) : {};
  } catch {
    sendJson(res, 400, { error: 'Invalid ocrResult JSON' });
    return;
  }

  try {
    const buffer = await runOcrExport({
      format,
      fileBuffer: req.file.buffer,
      fileName: req.file.originalname || 'document',
      ocrResult,
    });
    const meta = getExportMeta(format, req.file.originalname || 'document');
    res.setHeader('Content-Type', meta.contentType);
    res.setHeader('Content-Disposition', `attachment; filename="${meta.downloadName}"`);
    res.status(200).send(buffer);
  } catch (error) {
    sendJson(res, 502, { error: `OCR export failed: ${String(error)}` });
  }
});

// ── Global error handler (catches multer/busboy errors) ──────
app.use((err, _req, res, _next) => {
  const message = String(err?.message || err || 'Unknown error');
  console.error(`[express error] ${message}`);

  // Multer / busboy "Unexpected end of form" — almost always caused by
  // a reverse proxy (e.g. IIS/ARR or Nginx) truncating the upload before Node
  // finishes receiving it.  Return a clear message so the frontend
  // can display something actionable.
  if (message.includes('Unexpected end of form')) {
    sendJson(res, 413, {
      error: 'ไฟล์ถูกตัดระหว่างอัปโหลด — ตรวจสอบ reverse-proxy ว่าตั้งขนาดรับไฟล์พอ เช่น IIS/ARR (maxAllowedContentLength, uploadReadAheadSize) หรือ Nginx (client_max_body_size)',
      detail: message,
    });
    return;
  }

  // Multer file-size limit
  if (err?.code === 'LIMIT_FILE_SIZE') {
    sendJson(res, 413, { error: 'ไฟล์ใหญ่เกินขีดจำกัด (500 MB)', detail: message });
    return;
  }

  sendJson(res, err?.status || 500, { error: message });
});

app.use((req, res) => {
  const cleanPath = req.path.replace(/^\//, '');
  const directFile = path.join(webRoot, cleanPath);
  if (cleanPath && !cleanPath.includes('..')) {
    res.sendFile(directFile, (error) => {
      if (error) res.status(404).send('Not found');
    });
    return;
  }
  res.status(404).send('Not found');
});

async function start() {
  await bootstrapDatabase();
  app.listen(port, '0.0.0.0', () => {
    console.log(`Server listening on http://0.0.0.0:${port}`);
  });
}

start().catch((error) => {
  console.error('Failed to start server:', error);
  process.exit(1);
});

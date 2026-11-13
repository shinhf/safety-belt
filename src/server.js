import http from 'node:http';
import { readFile } from 'node:fs/promises';
import {
  createSession, selectVariant, publicSnapshot, outcomeView, recordAttempt, reset, variantList,
} from './domain/checkout.js';
import { confirmIntent, intentView } from './domain/intent.js';

const PUBLIC = new URL('../public/', import.meta.url);
// Fixed allowlist: URL paths are never joined onto the filesystem.
const STATIC = {
  '/': ['index.html', 'text/html; charset=utf-8'],
  '/app.js': ['app.js', 'text/javascript; charset=utf-8'],
  '/styles.css': ['styles.css', 'text/css; charset=utf-8'],
};
const BODY_LIMIT = 4096;
const INTENT_FIELDS = ['documentId', 'merchantId', 'currency', 'capCents', 'billingScope', 'confirmed'];
const SECURITY_HEADERS = {
  'X-Content-Type-Options': 'nosniff',
  'Content-Security-Policy': "default-src 'self'",
  'Cache-Control': 'no-store',
};

class HttpError extends Error {
  constructor(status, code) { super(code); this.status = status; }
}

function send(res, status, body, type = 'application/json; charset=utf-8') {
  res.writeHead(status, { ...SECURITY_HEADERS, 'Content-Type': type });
  res.end(type.startsWith('application/json') ? JSON.stringify(body) : body);
}

async function readJson(req, allowedKeys) {
  if (!/^application\/json(\s*;|$)/i.test(req.headers['content-type'] ?? '')) throw new HttpError(415, 'JSON_REQUIRED');
  if (Number(req.headers['content-length']) > BODY_LIMIT) throw new HttpError(413, 'BODY_TOO_LARGE');
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > BODY_LIMIT) throw new HttpError(413, 'BODY_TOO_LARGE');
    chunks.push(chunk);
  }
  const text = Buffer.concat(chunks).toString('utf8').trim();
  let body;
  try { body = text ? JSON.parse(text) : {}; } catch { throw new HttpError(400, 'INVALID_JSON'); }
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw new HttpError(400, 'INVALID_JSON');
  if (Object.keys(body).some((k) => !allowedKeys.includes(k))) throw new HttpError(400, 'UNKNOWN_FIELD');
  return body;
}

export function startServer({ port = 3000 } = {}) {
  const session = createSession();
  const state = () => ({ checkout: publicSnapshot(session.checkout), outcomes: outcomeView(session), intent: intentView(session), simulation: true });

  const server = http.createServer(async (req, res) => {
    try {
      const actualPort = server.address().port;
      const host = req.headers.host;
      if (host !== `127.0.0.1:${actualPort}` && host !== `localhost:${actualPort}`) throw new HttpError(421, 'MISDIRECTED_HOST');
      const path = req.url.split('?')[0];
      const route = `${req.method} ${path}`;

      if (req.method === 'GET' && Object.hasOwn(STATIC, path)) {
        const [file, type] = STATIC[path];
        const content = await readFile(new URL(file, PUBLIC)).catch(() => null);
        return content ? send(res, 200, content, type) : send(res, 404, { error: 'NOT_FOUND' });
      }
      if (route === 'GET /api/variants') return send(res, 200, variantList());
      if (route === 'GET /api/state') return send(res, 200, state());

      if (req.method === 'POST' && ['/api/checkout', '/api/intent', '/api/reset', '/api/submit'].includes(path)) {
        const origin = req.headers.origin;
        if (origin !== undefined && origin !== `http://${host}`) throw new HttpError(403, 'FORBIDDEN_ORIGIN');
        if (path === '/api/checkout') {
          const { variantId } = await readJson(req, ['variantId']);
          if (typeof variantId !== 'string') throw new HttpError(400, 'INVALID_VARIANT');
          try { selectVariant(session, variantId); } catch { throw new HttpError(400, 'INVALID_VARIANT'); }
          return send(res, 200, { checkout: publicSnapshot(session.checkout) });
        }
        if (path === '/api/intent') {
          const input = await readJson(req, INTENT_FIELDS);
          try { confirmIntent(session, input); } catch (err) { throw new HttpError(400, err.code ?? 'INVALID_INTENT'); }
          return send(res, 200, { intent: intentView(session) });
        }
        await readJson(req, []);
        if (path === '/api/reset') {
          reset(session);
          return send(res, 200, state());
        }
        recordAttempt(session);
        return send(res, 409, { error: 'SUBMISSION_GATE_NOT_INTEGRATED' });
      }
      throw new HttpError(404, 'NOT_FOUND');
    } catch (err) {
      if (!(err instanceof HttpError)) console.error('request failed:', err.message);
      if (!res.headersSent) send(res, err.status ?? 500, { error: err.status ? err.message : 'INTERNAL_ERROR' });
    }
  });

  return new Promise((resolve) => {
    server.listen(port, '127.0.0.1', () => {
      resolve({ server, url: `http://127.0.0.1:${server.address().port}` });
    });
  });
}

if (import.meta.main) {
  const { url } = await startServer({ port: Number(process.env.PORT ?? 3000) });
  console.log(`Safety Belt fixture (simulation) at ${url}`);
}

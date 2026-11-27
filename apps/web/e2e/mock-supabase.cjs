// Uçtan uca denemeler için sahte Supabase (Auth + profiles tablosu).
// Gerçek projeye hiçbir istek gitmez; veriler yalnızca bellekte tutulur.
const http = require('http');
const crypto = require('crypto');

const GOOD_CODE = '123456';
const users = new Map(); // email -> { id, email, password, confirmed, meta, profile }
const log = [];

const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
function jwt(u) {
  const now = Math.floor(Date.now() / 1000);
  return [
    b64({ alg: 'HS256', typ: 'JWT' }),
    b64({ sub: u.id, email: u.email, role: 'authenticated', aud: 'authenticated', iat: now, exp: now + 3600, session_id: crypto.randomUUID() }),
    'imza',
  ].join('.');
}
function userJson(u, obfuscated = false) {
  return {
    id: obfuscated ? crypto.randomUUID() : u.id,
    aud: 'authenticated',
    role: 'authenticated',
    email: u.email,
    email_confirmed_at: u.confirmed ? new Date().toISOString() : undefined,
    app_metadata: { provider: 'email', providers: ['email'] },
    user_metadata: obfuscated ? {} : u.meta,
    identities: obfuscated ? [] : [{ id: u.id, user_id: u.id, provider: 'email', identity_data: { email: u.email } }],
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
}
function session(u) {
  const now = Math.floor(Date.now() / 1000);
  return { access_token: jwt(u), token_type: 'bearer', expires_in: 3600, expires_at: now + 3600, refresh_token: 'yenile-' + u.id, user: userJson(u) };
}
function byToken(req) {
  const m = /^Bearer (.+)$/.exec(req.headers.authorization || '');
  if (!m) return null;
  try {
    const sub = JSON.parse(Buffer.from(m[1].split('.')[1], 'base64url').toString()).sub;
    return [...users.values()].find((u) => u.id === sub) || null;
  } catch {
    return null;
  }
}
const err = (res, status, error_code, msg) => send(res, status, { code: status, error_code, msg });
function send(res, status, body) {
  res.writeHead(status, {
    'content-type': 'application/json',
    'access-control-allow-origin': '*',
    'access-control-allow-headers': '*',
    'access-control-allow-methods': '*',
    'access-control-expose-headers': '*',
  });
  res.end(body === undefined ? '' : JSON.stringify(body));
}

const server = http.createServer((req, res) => {
  let raw = '';
  req.on('data', (c) => (raw += c));
  req.on('end', () => {
    const url = new URL(req.url, 'http://x');
    if (req.method === 'OPTIONS') return send(res, 204);
    const body = raw ? JSON.parse(raw) : {};
    const path = url.pathname;
    log.push(`${req.method} ${path}${url.search}`);

    if (path === '/__log') return send(res, 200, { log, users: [...users.values()].map((u) => ({ email: u.email, confirmed: u.confirmed, profile: u.profile, pwlen: u.password.length })) });

    if (path === '/auth/v1/signup') {
      const existing = users.get(body.email);
      if (existing && existing.confirmed) return send(res, 200, userJson(existing, true));
      if (body.password.length < 8) return err(res, 422, 'weak_password', 'Password should be at least 8 characters.');
      const u = existing || { id: crypto.randomUUID(), email: body.email, password: body.password, confirmed: false, meta: body.data || {} };
      if (!existing) {
        // Veritabanındaki tetikleyicinin yaptığını taklit et.
        const phone = /^05[0-9]{9}$/.test(u.meta.phone || '') ? u.meta.phone : null;
        u.profile = { full_name: (u.meta.full_name || '').trim() || null, phone, school: (u.meta.school || '').trim() || null };
        users.set(u.email, u);
      }
      return send(res, 200, userJson(u));
    }
    if (path === '/auth/v1/verify') {
      const u = users.get(body.email);
      if (!u || body.token !== GOOD_CODE) return err(res, 403, 'otp_expired', 'Token has expired or is invalid');
      u.confirmed = true;
      return send(res, 200, session(u));
    }
    if (path === '/auth/v1/resend' || path === '/auth/v1/recover') return send(res, 200, {});
    if (path === '/auth/v1/token') {
      if (url.searchParams.get('grant_type') === 'refresh_token') {
        const u = [...users.values()].find((x) => 'yenile-' + x.id === body.refresh_token);
        return u ? send(res, 200, session(u)) : err(res, 400, 'refresh_token_not_found', 'Invalid Refresh Token');
      }
      const u = users.get(body.email);
      if (!u || u.password !== body.password) return err(res, 400, 'invalid_credentials', 'Invalid login credentials');
      if (!u.confirmed) return err(res, 400, 'email_not_confirmed', 'Email not confirmed');
      return send(res, 200, session(u));
    }
    if (path === '/auth/v1/user') {
      const u = byToken(req);
      if (!u) return err(res, 401, 'bad_jwt', 'invalid JWT');
      if (req.method === 'PUT') {
        if (body.password) {
          if (body.password === u.password) return err(res, 422, 'same_password', 'New password should be different from the old password.');
          u.password = body.password;
        }
      }
      return send(res, 200, userJson(u));
    }
    if (path === '/auth/v1/logout') return send(res, 204);

    if (path === '/rest/v1/profiles') {
      const u = byToken(req);
      if (!u) return send(res, 200, []); // anon: RLS hiçbir satır göstermez
      const id = (url.searchParams.get('id') || '').replace('eq.', '');
      if (req.method === 'GET') return send(res, 200, id === u.id ? [u.profile] : []);
      if (req.method === 'PATCH') {
        if (id !== u.id) return send(res, 204);
        if (body.phone != null && !/^05[0-9]{9}$/.test(body.phone)) return send(res, 400, { code: '23514', message: 'check constraint' });
        Object.assign(u.profile, body);
        return send(res, 204);
      }
    }
    send(res, 404, { msg: 'mock: bilinmeyen yol ' + path });
  });
});

/** Sahte sunucuyu başlatır; kapatmak için dönen sunucunun close() fonksiyonu çağrılır. */
function startMock(port) {
  return new Promise((resolve) => server.listen(port, () => resolve(server)));
}

module.exports = { startMock, GOOD_CODE, requestLog: log };

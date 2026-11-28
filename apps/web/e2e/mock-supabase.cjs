// Uçtan uca denemeler için sahte Supabase (Auth + profiles tablosu).
// Gerçek projeye hiçbir istek gitmez; veriler yalnızca bellekte tutulur, e-postalar gönderilmez.
// Davranışlar gerçek Supabase Auth sunucusunun (GoTrue) yaptıklarını taklit eder.
const http = require('http');
const crypto = require('crypto');

const users = new Map(); // email -> { id, email, password, confirmed, providers, meta, profile }
const mails = []; // "gönderilen" e-postalar, eskiden yeniye: { to, kind, link, flow }
const links = new Map(); // e-postadaki linkin anahtarı -> { email, kind, challenge, used, revoked }
const codes = new Map(); // tek kullanımlık kod -> { email, challenge }
const oauthStates = new Map(); // Google'a gidiş -> { redirectTo, challenge }
const log = [];

/** Denemelerin değiştirebildiği davranışlar. */
const settings = {
  /** Supabase panelindeki "Site URL": izinli olmayan bir dönüş adresi istenirse buraya dönülür. */
  siteUrl: 'http://localhost:3000',
  /**
   * "Tekrar gönder" linkinin türü. Gerçek sunucu sürümüne göre linki isteğin yapıldığı tarayıcıya
   * bağlayabilir (pkce) ya da bağlamayabilir (implicit); site ikisinde de çalışmalıdır.
   */
  resendFlow: 'implicit',
  /** Aynı adrese bu süre dolmadan ikinci e-posta istenirse sunucu reddeder (0: sınır yok). */
  mailCooldownMs: 0,
  /** Supabase'in kendi e-posta servisi yalnızca proje ekibindeki adreslere gönderir; bu adres "ekipte değil" sayılır. */
  unauthorizedEmail: '',
  /** "Google ile devam et"te Google'ın bildireceği hesap. */
  google: { email: 'google-kullanici@example.com', name: 'Google Kullanıcı' },
};

let origin = '';
const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
const random = () => crypto.randomBytes(16).toString('hex');

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
    app_metadata: { provider: u.providers[0], providers: u.providers },
    user_metadata: obfuscated ? {} : u.meta,
    identities: obfuscated ? [] : u.providers.map((provider) => ({ id: u.id, user_id: u.id, provider, identity_data: { email: u.email } })),
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

/** Veritabanındaki "yeni üye" tetikleyicisinin yaptığını taklit eder (supabase/migrations). */
function createUser({ email, password, confirmed, provider, meta }) {
  const phone = /^05[0-9]{9}$/.test(meta.phone || '') ? meta.phone : null;
  const u = {
    id: crypto.randomUUID(),
    email,
    password,
    confirmed,
    providers: [provider],
    meta,
    profile: {
      full_name: String(meta.full_name || '').trim().slice(0, 120) || null,
      phone,
      school: String(meta.school || '').trim().slice(0, 160) || null,
      kvkk_accepted_at: meta.kvkk_accepted === true ? new Date().toISOString() : null,
    },
  };
  users.set(email, u);
  return u;
}

/** İzinli dönüş adresi değilse "Site URL" kullanılır. */
function allowedRedirect(redirectTo) {
  return redirectTo && redirectTo.startsWith(settings.siteUrl + '/') ? redirectTo : settings.siteUrl;
}

/** E-posta "gönderir": yeni link eskisini geçersiz kılar. Sınır aşıldıysa false döner. */
function sendMail(u, kind, redirectTo, challenge) {
  const previous = [...mails].reverse().find((m) => m.to === u.email && m.kind === kind);
  if (previous && Date.now() - previous.at < settings.mailCooldownMs) return false;
  for (const link of links.values()) if (link.email === u.email && link.kind === kind) link.revoked = true;
  const token = (challenge ? 'pkce_' : '') + random();
  links.set(token, { email: u.email, kind, challenge: challenge || null, used: false, revoked: false });
  const link = `${origin}/auth/v1/verify?token=${token}&type=${kind}&redirect_to=${encodeURIComponent(allowedRedirect(redirectTo))}`;
  mails.push({ to: u.email, kind, link, flow: challenge ? 'pkce' : 'implicit', at: Date.now() });
  return true;
}

function issueCode(u, challenge) {
  const code = random();
  codes.set(code, { email: u.email, challenge });
  return code;
}

/** Başarılı bir linkten ya da Google'dan siteye dönüş: kod (pkce) ya da doğrudan oturum bilgisi (implicit). */
function successRedirect(res, target, u, challenge, type) {
  const url = new URL(target);
  if (challenge) {
    url.searchParams.set('code', issueCode(u, challenge));
  } else {
    const s = session(u);
    const hash = new URLSearchParams({
      access_token: s.access_token,
      expires_at: String(s.expires_at),
      expires_in: String(s.expires_in),
      refresh_token: s.refresh_token,
      token_type: 'bearer',
    });
    if (type) hash.set('type', type);
    url.hash = hash.toString();
  }
  redirect(res, url.toString());
}

/** Hata bilgisi adresin # kısmına, istenirse soru işaretinden sonrasına da yazılır. */
function errorRedirect(res, target, params, alsoQuery) {
  const url = new URL(target);
  if (alsoQuery) for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  url.hash = new URLSearchParams(params).toString();
  redirect(res, url.toString());
}

const mailLimit = (res) => err(res, 429, 'over_email_send_rate_limit', 'For security purposes, you can only request this after 60 seconds.');
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
function redirect(res, location) {
  res.writeHead(303, { location });
  res.end();
}
function html(res, body) {
  res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
  res.end(`<!doctype html><html lang="tr"><meta charset="utf-8"><title>Sahte Google</title><body>${body}</body></html>`);
}

const server = http.createServer((req, res) => {
  let raw = '';
  req.on('data', (c) => (raw += c));
  req.on('end', () => {
    const url = new URL(req.url, 'http://x');
    if (req.method === 'OPTIONS') return send(res, 204);
    const body = raw ? JSON.parse(raw) : {};
    const path = url.pathname;
    const q = url.searchParams;
    log.push(`${req.method} ${path}${url.search}`);

    if (path === '/auth/v1/signup') {
      const existing = users.get(body.email);
      // Kayıtlı bir e-posta için sunucu, hesabın varlığını belli etmemek adına sahte bir kullanıcı döndürür.
      if (existing && existing.confirmed) return send(res, 200, userJson(existing, true));
      if (body.password.length < 8) return err(res, 422, 'weak_password', 'Password should be at least 8 characters.');
      if (body.email === settings.unauthorizedEmail) return err(res, 400, 'email_address_not_authorized', 'Email address cannot be used as it is not authorized');
      // Doğrulanmamış bir kayıt varsa sunucu onu güncellemez: ilk yazılan şifre ve bilgiler kalır, yalnızca yeni e-posta gider.
      const u = existing || createUser({ email: body.email, password: body.password, confirmed: false, provider: 'email', meta: body.data || {} });
      if (!sendMail(u, 'signup', q.get('redirect_to'), body.code_challenge)) return mailLimit(res);
      return send(res, 200, userJson(u));
    }

    if (path === '/auth/v1/resend') {
      const u = users.get(body.email);
      if (u && !u.confirmed && body.type === 'signup') {
        const challenge = settings.resendFlow === 'pkce' ? body.code_challenge : null;
        if (!sendMail(u, 'signup', q.get('redirect_to'), challenge)) return mailLimit(res);
      }
      return send(res, 200, {});
    }

    if (path === '/auth/v1/recover') {
      const u = users.get(body.email);
      // Hesap yoksa da aynı yanıt döner; e-posta gitmez.
      if (u && !sendMail(u, 'recovery', q.get('redirect_to'), body.code_challenge)) return mailLimit(res);
      return send(res, 200, {});
    }

    // E-postadaki linkin açtığı adres: e-postayı doğrular, sonra siteye yönlendirir.
    if (path === '/auth/v1/verify' && req.method === 'GET') {
      const token = q.get('token') || '';
      const link = links.get(token);
      const target = allowedRedirect(q.get('redirect_to'));
      if (!link || link.used || link.revoked || link.kind !== q.get('type')) {
        const params = { error: 'access_denied', error_code: 'otp_expired', error_description: 'Email link is invalid or has expired' };
        return errorRedirect(res, target, params, token.startsWith('pkce_'));
      }
      link.used = true;
      const u = users.get(link.email);
      u.confirmed = true;
      return successRedirect(res, target, u, link.challenge, link.kind);
    }

    // "Google ile devam et": gerçekte Google'ın hesap seçme ekranına gidilir.
    if (path === '/auth/v1/authorize' && req.method === 'GET') {
      const state = random();
      oauthStates.set(state, { redirectTo: allowedRedirect(q.get('redirect_to')), challenge: q.get('code_challenge') });
      return html(
        res,
        `<h1>Sahte Google: ${settings.google.email}</h1>
         <p><a id="devam" href="/auth/v1/callback?state=${state}">Bu hesapla devam et</a></p>
         <p><a id="vazgec" href="/auth/v1/callback?state=${state}&error=access_denied">Vazgeç</a></p>`,
      );
    }
    if (path === '/auth/v1/callback' && req.method === 'GET') {
      const state = oauthStates.get(q.get('state'));
      if (!state) return send(res, 400, { msg: 'mock: bilinmeyen Google dönüşü' });
      oauthStates.delete(q.get('state'));
      if (q.get('error')) {
        // Google'dan gelen vazgeçmede sunucunun kendi hata kodu (error_code) olmaz.
        return errorRedirect(res, state.redirectTo, { error: q.get('error'), error_description: 'User denied access' }, true);
      }
      const { email, name } = settings.google;
      const googleMeta = { email, full_name: name, name, email_verified: true, iss: 'https://accounts.google.com', sub: 'google-' + email };
      let u = users.get(email);
      if (!u) {
        u = createUser({ email, password: null, confirmed: true, provider: 'google', meta: googleMeta });
      } else if (!u.confirmed) {
        // Doğrulanmamış e-posta kaydının şifresi ve kayıt bilgileri düşer; hesap Google ile doğrulanmış olur.
        Object.assign(u, { password: null, confirmed: true, providers: ['google'], meta: googleMeta });
      } else if (!u.providers.includes('google')) {
        u.providers.push('google');
      }
      return successRedirect(res, state.redirectTo, u, state.challenge);
    }

    if (path === '/auth/v1/token') {
      const grant = q.get('grant_type');
      if (grant === 'refresh_token') {
        const u = [...users.values()].find((x) => 'yenile-' + x.id === body.refresh_token);
        return u ? send(res, 200, session(u)) : err(res, 400, 'refresh_token_not_found', 'Invalid Refresh Token');
      }
      if (grant === 'pkce') {
        const code = codes.get(body.auth_code);
        if (!code) return err(res, 404, 'flow_state_not_found', 'invalid flow state, no valid flow state found');
        const challenge = crypto.createHash('sha256').update(String(body.code_verifier)).digest('base64url');
        if (challenge !== code.challenge) return err(res, 400, 'bad_code_verifier', 'code challenge does not match previously saved code verifier');
        codes.delete(body.auth_code);
        return send(res, 200, session(users.get(code.email)));
      }
      const u = users.get(body.email);
      // Şifre, e-postanın doğrulanıp doğrulanmadığından önce kontrol edilir.
      if (!u || u.password === null || u.password !== body.password) return err(res, 400, 'invalid_credentials', 'Invalid login credentials');
      if (!u.confirmed) return err(res, 400, 'email_not_confirmed', 'Email not confirmed');
      return send(res, 200, session(u));
    }

    if (path === '/auth/v1/user') {
      const u = byToken(req);
      if (!u) return err(res, 401, 'bad_jwt', 'invalid JWT');
      if (req.method === 'PUT' && body.password) {
        if (body.password.length < 8) return err(res, 422, 'weak_password', 'Password should be at least 8 characters.');
        if (body.password === u.password) return err(res, 422, 'same_password', 'New password should be different from the old password.');
        u.password = body.password;
      }
      return send(res, 200, userJson(u));
    }
    if (path === '/auth/v1/logout') return send(res, 204);

    if (path === '/rest/v1/profiles') {
      const u = byToken(req);
      if (!u) return send(res, 200, []); // anon: RLS hiçbir satır göstermez
      const id = (q.get('id') || '').replace('eq.', '');
      const columns = (q.get('select') || '*').split(',').map((c) => c.trim());
      const row = () => (columns[0] === '*' ? u.profile : Object.fromEntries(columns.map((c) => [c, u.profile[c]])));
      if (req.method === 'GET') return send(res, 200, id === u.id ? [row()] : []);
      if (req.method === 'PATCH') {
        const representation = /return=representation/.test(req.headers.prefer || '');
        if (id !== u.id) return representation ? send(res, 200, []) : send(res, 204);
        // Üyenin değiştirebildiği sütunlar (migration dosyalarındaki "grant update").
        const writable = ['full_name', 'phone', 'school', 'kvkk_accepted_at'];
        if (Object.keys(body).some((k) => !writable.includes(k))) return send(res, 403, { code: '42501', message: 'permission denied for table profiles' });
        if (body.phone != null && !/^05[0-9]{9}$/.test(body.phone)) return send(res, 400, { code: '23514', message: 'check constraint' });
        const before = u.profile.kvkk_accepted_at;
        Object.assign(u.profile, body);
        // Onay zamanı bir kez ve sunucu saatiyle yazılır (profiles_guard_consent tetikleyicisi).
        if (before) u.profile.kvkk_accepted_at = before;
        else if (u.profile.kvkk_accepted_at) u.profile.kvkk_accepted_at = new Date().toISOString();
        return representation ? send(res, 200, [row()]) : send(res, 204);
      }
    }
    send(res, 404, { msg: 'mock: bilinmeyen yol ' + path });
  });
});

/** Sahte sunucuyu başlatır; kapatmak için dönen sunucunun close() fonksiyonu çağrılır. */
function startMock(port) {
  origin = `http://localhost:${port}`;
  return new Promise((resolve) => server.listen(port, () => resolve(server)));
}

/** Bir adrese gönderilen e-postalar (eskiden yeniye). */
const mailsTo = (email, kind) => mails.filter((m) => m.to === email && (!kind || m.kind === kind));

module.exports = { startMock, settings, users, mailsTo, requestLog: log };

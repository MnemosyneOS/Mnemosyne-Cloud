'use strict';

/* Mnemosyne site server.
 *
 * The site itself is a single static page. This server exists for exactly one
 * reason: a third-party OAuth callback has to be received somewhere that can
 * hold the client secret, and the browser cannot. So the secret lives in
 * oauth.config.json — which is never served over HTTP — and the exchange
 * happens here.
 *
 * Routes
 *   GET  /                        → index.html
 *   GET  /auth/github             → 302 to GitHub's consent screen
 *   GET  /auth/github/callback    → exchange code, read /user, set a session
 *   GET  /api/session             → { signedIn, provider, login, name, avatar }
 *   POST /api/logout              → drop the session
 */

const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT = __dirname;
const PORT = parseInt(process.env.PORT || '3000', 10);
const DATA = path.join(ROOT, '.data');
const SESS_PATH = path.join(DATA, 'sessions.json');
const STATE_PATH = path.join(DATA, 'states.json');

const TXT = { 'Content-Type': 'text/plain; charset=utf-8' };
const JSONH = { 'Content-Type': 'application/json; charset=utf-8' };

/* Files that must never be reachable from the browser: the server itself, the
   file holding the OAuth secret, the package manifest — plus anything that is
   simply not a web asset. A stray .py or an editor backup sitting in this
   folder would otherwise be served verbatim to anyone who guessed the name. */
const BLOCKED = ['server.js', 'oauth.config.json', 'package.json', 'package-lock.json'];
const BLOCKED_EXT = ['.py', '.bak', '.md', '.ts', '.mjs', '.cjs', '.yml', '.yaml',
  '.env', '.sh', '.ps1', '.log', '.db', '.sqlite', '.sql'];
const BLOCKED_INFIX = ['.bak-', '.bak.', '.orig', '.save', '.tmp', '~'];
const SESSION_DAYS = 30;

function readJSON(p, fb) {
  try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch (e) { return fb; }
}
function writeJSON(p, v) {
  try {
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.writeFileSync(p, JSON.stringify(v), 'utf8');
  } catch (e) { console.error('[warn] could not write ' + p + ': ' + e.message); }
}

const CFG = readJSON(path.join(ROOT, 'oauth.config.json'), {});
const GH = CFG.github || {};
const BASE = String(CFG.publicBaseUrl || 'https://mnemosyne-os.app.workbuddy.host').replace(/\/+$/, '');
const CALLBACK = GH.callbackUrl || (BASE + '/auth/github/callback');
const SECURE_COOKIE = BASE.indexOf('https://') === 0;
const CONFIGURED = !!(GH.clientId && GH.clientSecret);

function send(res, code, body, headers) {
  res.writeHead(code, Object.assign({ 'Cache-Control': 'no-store' }, headers || {}));
  res.end(body);
}
function sendJSON(res, code, obj) {
  send(res, code, JSON.stringify(obj), JSONH);
}
function cookies(req) {
  const out = {};
  String(req.headers.cookie || '').split(';').forEach(function (part) {
    const i = part.indexOf('=');
    if (i > 0) out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  });
  return out;
}
function cookieHeader(sid, maxAge) {
  const bits = ['mn_gh=' + sid, 'Path=/', 'HttpOnly', 'SameSite=Lax', 'Max-Age=' + maxAge];
  if (SECURE_COOKIE) bits.push('Secure');
  return bits.join('; ');
}

function getSession(req) {
  const sid = cookies(req).mn_gh;
  if (!sid) return null;
  const all = readJSON(SESS_PATH, {});
  const s = all[sid];
  if (!s) return null;
  if (Date.now() - s.at > SESSION_DAYS * 86400000) return null;
  return { sid: sid, user: s };
}
function createSession(user) {
  const sid = crypto.randomBytes(24).toString('hex');
  const all = readJSON(SESS_PATH, {});
  const now = Date.now();
  Object.keys(all).forEach(function (k) {
    if (now - all[k].at > SESSION_DAYS * 86400000) delete all[k];
  });
  all[sid] = {
    id: user.id,
    login: user.login,
    name: user.name || '',
    avatar: user.avatar_url || '',
    at: now
  };
  writeJSON(SESS_PATH, all);
  return sid;
}
function dropSession(req) {
  const sid = cookies(req).mn_gh;
  if (!sid) return;
  const all = readJSON(SESS_PATH, {});
  if (all[sid]) { delete all[sid]; writeJSON(SESS_PATH, all); }
}

function httpsJSON(opts, body, cb) {
  let done = false;
  const finish = function (a, b) { if (!done) { done = true; cb(a, b); } };
  const req = https.request(opts, function (r) {
    let buf = '';
    r.setEncoding('utf8');
    r.on('data', function (c) { buf += c; });
    r.on('end', function () {
      let parsed = null;
      try { parsed = JSON.parse(buf); } catch (e) {}
      finish(null, { status: r.statusCode, body: parsed, raw: buf });
    });
  });
  req.on('error', function (e) { finish(e); });
  req.setTimeout(20000, function () { req.destroy(new Error('timeout after 20s')); });
  if (body) req.write(body);
  req.end();
}

/* ------------------------------------------------------------------ oauth */

function handleAuthorize(req, res) {
  if (!CONFIGURED) {
    return send(res, 503, 'GitHub sign-in is not configured on this deployment.', TXT);
  }
  const state = crypto.randomBytes(18).toString('hex');
  const states = readJSON(STATE_PATH, {});
  const now = Date.now();
  Object.keys(states).forEach(function (k) {
    if (now - states[k] > 600000) delete states[k];
  });
  states[state] = now;
  writeJSON(STATE_PATH, states);

  const u = new URL('https://github.com/login/oauth/authorize');
  u.searchParams.set('client_id', GH.clientId);
  u.searchParams.set('redirect_uri', CALLBACK);
  u.searchParams.set('scope', 'read:user user:email');
  u.searchParams.set('state', state);

  res.writeHead(302, { Location: u.toString(), 'Cache-Control': 'no-store' });
  res.end();
}

function handleCallback(req, res, url) {
  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');

  const states = readJSON(STATE_PATH, {});
  if (!state || !states[state]) {
    return send(res, 400, 'This sign-in link has expired. Start again from the site.', TXT);
  }
  delete states[state];
  writeJSON(STATE_PATH, states);

  if (!code) {
    res.writeHead(302, { Location: BASE + '/?gh=denied#/login', 'Cache-Control': 'no-store' });
    return res.end();
  }

  const payload = JSON.stringify({
    client_id: GH.clientId,
    client_secret: GH.clientSecret,
    code: code,
    redirect_uri: CALLBACK
  });

  httpsJSON({
    hostname: 'github.com',
    path: '/login/oauth/access_token',
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
      'Content-Length': Buffer.byteLength(payload),
      'User-Agent': 'mnemosyne-site'
    }
  }, payload, function (err, out) {
    const token = out && out.body && out.body.access_token;
    if (err || !token) {
      /* Carry the reason back in the URL. "GitHub rejected the code" and "we
         could not reach GitHub at all" are indistinguishable from the outside
         otherwise, and they need completely different fixes. */
      const why = err
        ? ('net:' + (err.code || err.message || 'error'))
        : ('gh:' + ((out && out.body && out.body.error) || 'no_token'));
      console.error('[github] token exchange failed -> ' + why +
        (err ? ' :: ' + err.message : ' :: ' + (out && out.raw)));
      res.writeHead(302, {
        Location: BASE + '/?gh=token&why=' + encodeURIComponent(why) + '#/login',
        'Cache-Control': 'no-store'
      });
      return res.end();
    }
    httpsJSON({
      hostname: 'api.github.com',
      path: '/user',
      method: 'GET',
      headers: {
        'Authorization': 'Bearer ' + token,
        'Accept': 'application/vnd.github+json',
        'User-Agent': 'mnemosyne-site'
      }
    }, null, function (e2, me) {
      if (e2 || !me || !me.body || !me.body.login) {
        const whyU = e2 ? ('net:' + (e2.code || e2.message)) : ('gh:' + (me ? me.status : 'no_body'));
        console.error('[github] /user failed -> ' + whyU + ' :: ' + (e2 ? e2.message : (me && me.raw)));
        res.writeHead(302, {
          Location: BASE + '/?gh=user&why=' + encodeURIComponent(whyU) + '#/login',
          'Cache-Control': 'no-store'
        });
        return res.end();
      }
      const sid = createSession(me.body);
      res.writeHead(302, {
        Location: BASE + '/?gh=ok#/login',
        'Set-Cookie': cookieHeader(sid, SESSION_DAYS * 86400),
        'Cache-Control': 'no-store'
      });
      res.end();
    });
  });
}

/* ----------------------------------------------------------------- static */

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8',
  '.xml': 'application/xml; charset=utf-8'
};

function serveStatic(req, res, url) {
  let p;
  try { p = decodeURIComponent(url.pathname); } catch (e) { return send(res, 400, 'Bad path.', TXT); }
  if (!p || p === '/') p = '/index.html';
  if (p.indexOf('\0') >= 0 || p.indexOf('..') >= 0) return send(res, 404, 'Not found.', TXT);

  const rel = p.replace(/^\/+/, '');
  const base = path.basename(rel);
  const lower = base.toLowerCase();
  const ext = path.extname(lower);
  if (BLOCKED.indexOf(base) >= 0 ||
      BLOCKED_EXT.indexOf(ext) >= 0 ||
      BLOCKED_INFIX.some(function (s) { return lower.indexOf(s) >= 0; }) ||
      rel.split('/')[0].charAt(0) === '.') {
    return send(res, 404, 'Not found.', TXT);
  }

  const file = path.join(ROOT, rel);
  if (file.indexOf(ROOT) !== 0) return send(res, 404, 'Not found.', TXT);

  fs.stat(file, function (err, st) {
    if (err || !st.isFile()) return send(res, 404, 'Not found.', TXT);
    const ext = path.extname(file).toLowerCase();
    const headers = { 'Content-Type': MIME[ext] || 'application/octet-stream' };
    if (ext === '.html') {
      /* The entry page must not be cached anywhere in the chain. The site is
         redeployed often, and a stale copy was served to a real browser even
         after a hard refresh — so tell every layer, not just the browser. */
      headers['Cache-Control'] = 'no-store, no-cache, must-revalidate, max-age=0';
      headers['Pragma'] = 'no-cache';
      headers['Expires'] = '0';
      headers['Surrogate-Control'] = 'no-store';
    } else {
      headers['Cache-Control'] = 'public, max-age=3600';
    }
    res.writeHead(200, headers);
    const rs = fs.createReadStream(file);
    rs.on('error', function () { try { res.destroy(); } catch (e) {} });
    rs.pipe(res);
  });
}

/* ------------------------------------------------------------------- main */

const server = http.createServer(function (req, res) {
  let url;
  try { url = new URL(req.url, 'http://placeholder'); } catch (e) {
    return send(res, 400, 'Bad request.', TXT);
  }
  const p = url.pathname;

  if (p === '/auth/github' && req.method === 'GET') return handleAuthorize(req, res);
  if (p === '/auth/github/callback' && req.method === 'GET') return handleCallback(req, res, url);

  if (p === '/api/session' && req.method === 'GET') {
    const s = getSession(req);
    if (!s) return sendJSON(res, 200, { signedIn: false });
    return sendJSON(res, 200, {
      signedIn: true,
      provider: 'github',
      login: s.user.login,
      name: s.user.name,
      avatar: s.user.avatar
    });
  }

  if (p === '/api/logout' && req.method === 'POST') {
    dropSession(req);
    return send(res, 200, JSON.stringify({ ok: true }), {
      'Content-Type': 'application/json; charset=utf-8',
      'Set-Cookie': cookieHeader('', 0)
    });
  }

  if (p === '/healthz') return sendJSON(res, 200, { ok: true, github: CONFIGURED });

  /* Which revision of the entry page actually landed in this sandbox? Deployment
     pipelines are allowed to cache, so the app should be able to answer that
     itself instead of leaving it to guesswork from the outside. */
  if (p === '/api/build' && req.method === 'GET') {
    let html = '';
    try { html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8'); } catch (e) {}
    return sendJSON(res, 200, {
      entryBytes: Buffer.byteLength(html, 'utf8'),
      entrySha256: crypto.createHash('sha256').update(html).digest('hex').slice(0, 24),
      hasGithubButton: html.indexOf('/auth/github') >= 0,
      hasGhBanner: html.indexOf('loadGithubSession') >= 0,
      hasCloudAuth: html.indexOf('signInWithPassword') >= 0,
      serverBytes: Buffer.byteLength(fs.readFileSync(__filename, 'utf8'), 'utf8')
    });
  }

  if (p.indexOf('/api/') === 0 || p.indexOf('/auth/') === 0) {
    return sendJSON(res, 404, { error: 'not_found' });
  }

  return serveStatic(req, res, url);
});

server.listen(PORT, '0.0.0.0', function () {
  console.log('[mnemosyne] listening on 0.0.0.0:' + PORT);
  console.log('[mnemosyne] public base   : ' + BASE);
  console.log('[mnemosyne] github callback: ' + CALLBACK);
  console.log('[mnemosyne] github ready   : ' + CONFIGURED);
});

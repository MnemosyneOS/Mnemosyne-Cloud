'use strict';

/* 站点指标（访问量 + 注册量）—— 可插拔模块，不依赖任何第三方包。
 *
 * 为什么单独一个文件：server.js 可能正被另一个会话编辑，
 * 把逻辑塞进去容易互相覆盖。这里只暴露 3 个入口，接线成本极低：
 *
 *   const metrics = require('./metrics');            // ① 顶部
 *   ...
 *   metrics.track(req, url);                         // ② 请求处理最前面
 *   ...
 *   if (p === '/api/stats') return metrics.handle(req, res);   // ③ 路由区
 *   ...
 *   metrics.signIn(user);                            // ④ 可选：createSession 里调一次
 *
 * 数据落在 .data/metrics.json（与 sessions.json 同目录）：
 *   - 访问量：按天存 req / pv / uv（uv 存 IP+UA 的哈希，不存明文）
 *   - 注册量：signins.total 累计、signins.logins 每个账号首次时间
 *
 * 查看：
 *   GET /api/stats?token=<token>               → JSON
 *   GET /api/stats?token=<token>&format=html   → 可视化页面
 * token 首次运行自动生成，存在 .data/metrics.token
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const DATA = path.join(__dirname, '.data');
const STORE = path.join(DATA, 'metrics.json');
const TOKEN_FILE = path.join(DATA, 'metrics.token');

const ASSET_EXT = /\.(js|css|woff2?|ttf|eot|png|jpe?g|svg|ico|map|gif|webp|txt|xml)$/i;
const MAX_KEYS = 200;          // 每个维度的最大留存键数
const FLUSH_MS = 10000;        // 落盘节流
const KEEP_DAYS = 400;         // 保留天数

let store = null;
let dirty = false;
let timer = null;

/* ------------------------------------------------------------------ 存储 */

function emptyStore() {
  return { first: Date.now(), days: {}, signins: { total: 0, logins: {} } };
}

function load() {
  if (store) return store;
  try {
    store = JSON.parse(fs.readFileSync(STORE, 'utf8'));
    if (!store.days) store.days = {};
    if (!store.signins) store.signins = { total: 0, logins: {} };
  } catch (e) {
    store = emptyStore();
  }
  return store;
}

function flush() {
  if (!dirty || !store) return;
  dirty = false;
  try {
    fs.mkdirSync(DATA, { recursive: true });
    fs.writeFileSync(STORE, JSON.stringify(store), 'utf8');
  } catch (e) {
    console.error('[metrics] 落盘失败: ' + e.message);
  }
}

function schedule() {
  dirty = true;
  if (!timer) timer = setTimeout(function () { timer = null; flush(); }, FLUSH_MS);
  if (timer.unref) timer.unref();
}

function token() {
  try {
    const t = fs.readFileSync(TOKEN_FILE, 'utf8').trim();
    if (t) return t;
  } catch (e) { /* 首次 */ }
  const t = crypto.randomBytes(16).toString('hex');
  try {
    fs.mkdirSync(DATA, { recursive: true });
    fs.writeFileSync(TOKEN_FILE, t, 'utf8');
    fs.chmodSync(TOKEN_FILE, 0o600);
  } catch (e) {
    console.error('[metrics] 写 token 失败: ' + e.message);
  }
  return t;
}

/* ------------------------------------------------------------------ 采集 */

function dayKey(ts) {
  const d = new Date(ts + 8 * 3600000);   // 北京时间切天，便于与国内习惯对齐
  return d.toISOString().slice(0, 10);
}

function visitorHash(req) {
  const ip = (req.headers['x-forwarded-for'] || '').split(',')[0].trim() ||
             (req.socket && req.socket.remoteAddress) || '-';
  const ua = req.headers['user-agent'] || '-';
  return crypto.createHash('sha1').update(ip + '|' + ua).digest('hex').slice(0, 12);
}

function bump(map, key) {
  if (!key) key = '(unknown)';
  key = String(key).slice(0, 120);
  if (!(key in map) && Object.keys(map).length >= MAX_KEYS) {
    // 满了就清掉计数最少的那个，避免无限增长
    let minK = null, minV = Infinity;
    for (const k of Object.keys(map)) if (map[k] < minV) { minV = map[k]; minK = k; }
    if (minK) delete map[minK];
  }
  map[key] = (map[key] || 0) + 1;
}

function track(req, url) {
  try {
    const s = load();
    const now = Date.now();
    const dk = dayKey(now);
    let d = s.days[dk];
    if (!d) {
      d = s.days[dk] = { req: 0, pv: 0, uv: [], paths: {}, refs: {}, ua: {}, status: {} };
      // 清理过期天，防止文件无限增长
      const keys = Object.keys(s.days).sort();
      while (keys.length > KEEP_DAYS) delete s.days[keys.shift()];
    }
    if (!Array.isArray(d.uv)) d.uv = [];
    if (!d.paths) d.paths = {};
    if (!d.refs) d.refs = {};
    if (!d.ua) d.ua = {};
    if (!d.status) d.status = {};

    const p = (url && url.pathname) || '/';
    const isAsset = ASSET_EXT.test(p) || p.indexOf('/assets/') === 0;

    d.req++;
    if (!isAsset) d.pv++;
    const h = visitorHash(req);
    if (d.uv.indexOf(h) < 0 && d.uv.length < 20000) d.uv.push(h);
    if (!isAsset) bump(d.paths, p);
    bump(d.ua, shortUA(req.headers['user-agent']));

    const ref = req.headers['referer'] || req.headers['referrer'];
    if (ref) {
      try { bump(d.refs, new URL(ref).host); } catch (e) { bump(d.refs, ref.slice(0, 80)); }
    }

    // 状态码要等响应结束才知道
    const origWriteHead = req.res && req.res.writeHead;
    if (origWriteHead && !req.res.__metricsWrapped) {
      req.res.__metricsWrapped = true;
      req.res.writeHead = function (code) {
        try { bump(d.status, code); schedule(); } catch (e) { /* 忽略 */ }
        return origWriteHead.apply(this, arguments);
      };
    }

    schedule();
  } catch (e) {
    console.error('[metrics] track 失败: ' + e.message);
  }
}

function shortUA(ua) {
  ua = ua || '-';
  if (/Edg\//.test(ua)) return 'Edge';
  if (/OPR\//.test(ua)) return 'Opera';
  if (/Firefox\//.test(ua)) return 'Firefox';
  if (/Chrome\//.test(ua) && /Safari/.test(ua)) return 'Chrome';
  if (/Safari\//.test(ua)) return 'Safari';
  if (/bot|spider|crawl|slurp/i.test(ua)) return '爬虫';
  if (/curl|wget|python|go-http/i.test(ua)) return '命令行';
  return ua.slice(0, 40);
}

/* 注册/登录事件。在 server.js 的 createSession() 里调一次即可获得累计注册量。 */
function signIn(user) {
  try {
    const s = load();
    if (!user) return;
    const login = String(user.login || user.id || 'unknown');
    s.signins.total = (s.signins.total || 0) + 1;
    if (!s.signins.logins[login]) s.signins.logins[login] = Date.now();
    schedule();
    flush();
  } catch (e) {
    console.error('[metrics] signIn 失败: ' + e.message);
  }
}

/* ------------------------------------------------------------------ 输出 */

function snapshot() {
  const s = load();
  const days = Object.keys(s.days).sort();
  let req = 0, pv = 0;
  const uvAll = new Set();
  const paths = {}, refs = {}, ua = {}, status = {};
  const series = [];
  for (const k of days) {
    const d = s.days[k];
    req += d.req || 0;
    pv += d.pv || 0;
    (d.uv || []).forEach(function (h) { uvAll.add(h); });
    series.push({ day: k, req: d.req || 0, pv: d.pv || 0, uv: (d.uv || []).length });
    for (const m of [d.paths, d.refs, d.ua, d.status]) {
      if (!m) continue;
      const tgt = m === d.paths ? paths : m === d.refs ? refs : m === d.ua ? ua : status;
      for (const kk of Object.keys(m)) tgt[kk] = (tgt[kk] || 0) + m[kk];
    }
  }
  const top = function (o, n) {
    return Object.keys(o).sort(function (a, b) { return o[b] - o[a]; })
      .slice(0, n || 15).map(function (k) { return { k: k, n: o[k] }; });
  };

  // 当前有效会话（server.js 的 .data/sessions.json）
  let sessions = 0, accounts = [];
  try {
    const raw = JSON.parse(fs.readFileSync(path.join(DATA, 'sessions.json'), 'utf8'));
    sessions = Object.keys(raw).length;
    const seen = {};
    Object.keys(raw).forEach(function (sid) {
      const u = raw[sid] || {};
      if (u.login) seen[u.login] = u.at || 0;
    });
    accounts = Object.keys(seen).sort(function (a, b) { return seen[b] - seen[a]; });
  } catch (e) { /* 没有会话文件是正常的 */ }

  const regLogins = Object.keys(s.signins.logins || {});

  return {
    generatedAt: new Date().toISOString(),
    traffic: {
      firstSeen: s.first ? new Date(s.first).toISOString() : null,
      totalRequests: req,
      totalPageViews: pv,
      uniqueVisitors: uvAll.size,
      byDay: series,
      topPaths: top(paths, 15),
      topReferers: top(refs, 12),
      browsers: top(ua, 12),
      statusCodes: top(status, 10)
    },
    signups: {
      signInsTotal: s.signins.total || 0,
      uniqueAccounts: regLogins.length,
      firstSignIn: regLogins.length
        ? new Date(Math.min.apply(null, regLogins.map(function (l) { return s.signins.logins[l]; }))).toISOString()
        : null,
      accounts: regLogins.map(function (l) {
        return { login: l, firstAt: new Date(s.signins.logins[l]).toISOString() };
      }),
      activeSessions: sessions,
      accountsInSessions: accounts
    }
  };
}

function esc(s) {
  return String(s).replace(/[&<>"']/g, function (c) {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
  });
}

function renderHTML(snap) {
  const t = snap.traffic, g = snap.signups;
  const card = function (label, v, sub) {
    return '<div class="c"><div class="l">' + esc(label) + '</div><div class="v">' +
      esc(v) + '</div><div class="s">' + esc(sub || '') + '</div></div>';
  };
  const rows = function (arr, head) {
    if (!arr.length) return '<tr><td colspan="2" class="m">无</td></tr>';
    return arr.map(function (x) {
      return '<tr><td>' + esc(x.k || x.day) + '</td><td class="n">' + esc(x.n !== undefined ? x.n : x.pv) + '</td></tr>';
    }).join('');
  };
  const dayRows = t.byDay.slice(-30).map(function (d) {
    return '<tr><td class="mono">' + esc(d.day) + '</td><td class="n">' + d.req +
      '</td><td class="n">' + d.pv + '</td><td class="n">' + d.uv + '</td></tr>';
  }).join('') || '<tr><td colspan="4" class="m">暂无</td></tr>';
  const acct = g.accounts.map(function (a) {
    return '<tr><td class="mono">' + esc(a.login) + '</td><td class="mono s">' + esc(a.firstAt.slice(0, 19)) + '</td></tr>';
  }).join('') || '<tr><td colspan="2" class="m">暂无注册</td></tr>';

  return '<!DOCTYPE html><html lang="zh-CN"><head><meta charset="utf-8">' +
    '<meta name="viewport" content="width=device-width,initial-scale=1">' +
    '<meta http-equiv="refresh" content="60"><title>Mnemosyne 站点指标</title><style>' +
    'body{margin:0;background:#0b0f14;color:#e6edf3;font:14px/1.6 -apple-system,"PingFang SC","Microsoft YaHei",sans-serif}' +
    '.w{max-width:1000px;margin:0 auto;padding:24px 16px 60px}' +
    'h1{font-size:20px;margin:0 0 4px}h1 i{color:#71DCC8;font-style:normal}' +
    '.sub{color:#8b98a8;font-size:12.5px;margin-bottom:20px}' +
    '.cs{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:12px;margin-bottom:22px}' +
    '.c{background:#12171f;border:1px solid #1e2733;border-radius:11px;padding:13px 14px}' +
    '.l{color:#8b98a8;font-size:12px}.v{font-size:25px;font-weight:600;color:#71DCC8;font-variant-numeric:tabular-nums}' +
    '.v.p{color:#C4B5FD}.s{color:#6b7889;font-size:11.5px}' +
    'section{background:#12171f;border:1px solid #1e2733;border-radius:12px;padding:15px 17px;margin-bottom:16px}' +
    'h2{font-size:13.5px;margin:0 0 11px;color:#cbd5e1}' +
    'table{width:100%;border-collapse:collapse;font-size:12.8px}' +
    'th{text-align:left;color:#7d8a99;font-weight:500;padding:6px 9px;border-bottom:1px solid #222c38;font-size:11.5px}' +
    'td{padding:6px 9px;border-bottom:1px solid #1a222c}.n{text-align:right;font-variant-numeric:tabular-nums}' +
    '.mono{font-family:ui-monospace,Menlo,Consolas,monospace}.s{color:#6b7889}.m{color:#6b7889}' +
    '.g2{display:grid;grid-template-columns:1fr 1fr;gap:16px}@media(max-width:780px){.g2{grid-template-columns:1fr}}' +
    '</style></head><body><div class="w"><h1>Mnemosyne 站点 <i>访问量 / 注册量</i></h1>' +
    '<div class="sub">生成于 ' + esc(snap.generatedAt.slice(0, 19)) + ' UTC · 每 60 秒自动刷新 · 数据自 ' +
    esc((t.firstSeen || '').slice(0, 19)) + ' 起</div>' +
    '<div class="cs">' +
    card('请求总数', t.totalRequests, '含静态资源') +
    card('页面访问 PV', t.totalPageViews, '已排除资源') +
    card('独立访客 UV', t.uniqueVisitors, 'IP+UA 去重') +
    card('注册量', g.uniqueAccounts, '累计唯一账号') +
    card('登录次数', g.signInsTotal, '含重复登录') +
    card('当前会话', g.activeSessions, '未过期登录') +
    '</div>' +
    '<section><h2>每日趋势（近 30 天）</h2><table><thead><tr><th>日期</th>' +
    '<th class="n">请求</th><th class="n">PV</th><th class="n">UV</th></tr></thead><tbody>' +
    dayRows + '</tbody></table></section>' +
    '<div class="g2"><section><h2>页面 PV 排行</h2><table><tbody>' + rows(t.topPaths) +
    '</tbody></table></section><section><h2>浏览器分布</h2><table><tbody>' + rows(t.browsers) +
    '</tbody></table></section></div>' +
    '<div class="g2"><section><h2>来源</h2><table><tbody>' + rows(t.topReferers) +
    '</tbody></table></section><section><h2>状态码</h2><table><tbody>' + rows(t.statusCodes) +
    '</tbody></table></section></div>' +
    '<section><h2>注册账号（累计 ' + g.uniqueAccounts + '）</h2><table><thead><tr><th>账号</th>' +
    '<th>首次注册</th></tr></thead><tbody>' + acct + '</tbody></table></section>' +
    '</div></body></html>';
}

function handle(req, res) {
  const url = new URL(req.url, 'http://placeholder');
  const want = url.searchParams.get('token') || '';
  const auth = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  if (want !== token() && auth !== token()) {
    res.writeHead(401, { 'Content-Type': 'text/plain; charset=utf-8', 'WWW-Authenticate': 'Bearer' });
    return res.end('需要 token：/api/stats?token=<token>（见 .data/metrics.token）');
  }
  flush();
  const snap = snapshot();
  if ((url.searchParams.get('format') || '') === 'html') {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
    return res.end(renderHTML(snap));
  }
  res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(snap, null, 2));
}

process.on('exit', flush);
process.on('SIGINT', function () { flush(); process.exit(0); });
process.on('SIGTERM', function () { flush(); process.exit(0); });

/* 启动即生成 token 文件。否则要等第一次调用 /api/stats 才创建，
   而调用又必须先知道 token —— 鸡生蛋。 */
const TOKEN = token();

module.exports = {
  track: track,
  signIn: signIn,
  handle: handle,
  snapshot: snapshot,
  token: TOKEN,
  tokenPath: TOKEN_FILE
};

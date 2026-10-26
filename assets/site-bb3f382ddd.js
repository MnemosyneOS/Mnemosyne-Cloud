/* ===========================================================================
 *  MN —— 站点级运行时模块
 * ===========================================================================
 * 这一段与上面那个巨大的 IIFE 之间只有两条接口：MN.apply()（每次整页渲染完调一次）
 * 与 MN.wireAdmin()（后台管理页把它自己的容器交过来绑事件）。这样切分的理由很实际：
 * 主脚本是「营销站 + 控制台」的历史产物，绝大多数函数定义在闭包里，从外部改不动；
 * 与其去动那 60 万字节，不如给新功能一条明确的通道，两边都能单独读懂。
 *
 * 它负责三件事：
 *   ① 公告栏 / 页脚 —— 由服务端 site.json 下发，改完刷新即生效，无需重新部署；
 *   ② 登录方式 —— 按服务端「后台开关 AND 凭据就绪」的结论，决定 SSO 按钮可不可点；
 *   ③ 后台管理的新面板 —— 就绪状态、品牌、登录方式、第三方凭据、记忆系统、页脚。
 */
(function () {
  'use strict';

  var CFG = null;          /* /api/site 的最近一次结果 */
  var CFG_AT = 0;          /* 取回时刻，用于过期判断 */
  var CFG_P = null;        /* 进行中的请求，避免同一时刻打多个 */
  var CFG_TTL = 30000;     /* 30 秒内重复调用直接吃缓存 */
  /* 🔴 2026-10-26：换键名 + 加时间窗（本次修「通知栏消失」与「刷新闪旧内容」）。
     · 旧键 'mn-ann-dismissed' 存的是裸 revision 字符串，一旦点过 × 就**永久**
       不再出现，直到运营再改一次公告。用户反馈「首页通知栏没有了」正是这个。
       换新键名 = 一次性作废所有历史关闭记录，所有人刷新即重新看到公告。
     · 新值存 JSON {rev, at}：同一份公告压 3 天后自动重新出现，
       误点一次不会让访客永久失去公告入口。 */
  var DISMISS_KEY = 'mn-ann-dismissed-v2';
  var DISMISS_TTL = 3 * 24 * 60 * 60 * 1000;   /* 3 天 */
  var RELOADS = {};        /* 容器 id -> 重新加载函数 */
  var STORE = {};          /* 生成出来的配置文本，按 id 暂存（避免塞进属性里） */
  var SEQ = 0;

  /* ------------------------------------------------------------- 基础工具 */

  function docLang() {
    var a = document.documentElement.getAttribute('data-lang');
    if (a === 'zh' || a === 'en') return a;
    try {
      var ls = localStorage.getItem('mn-lang');
      if (ls === 'zh' || ls === 'en') return ls;
    } catch (e) {}
    return (String(navigator.language || '').toLowerCase().indexOf('zh') === 0) ? 'zh' : 'en';
  }

  function L(zh, en) { return docLang() === 'zh' ? zh : en; }

  function esc(s) {
    return String(s === null || s === undefined ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  var escAttr = esc;

  function api(path, body) {
    var init = { credentials: 'same-origin', headers: { 'X-Mn-Lang': docLang() } };
    if (body !== undefined) {
      init.method = 'POST';
      init.body = JSON.stringify(body);
      init.headers['Content-Type'] = 'application/json';
    }
    return fetch(path, init).then(function (r) {
      return r.text().then(function (t) {
        var b = {};
        try { b = JSON.parse(t); } catch (e) {}
        return { ok: r.ok, status: r.status, body: b };
      });
    })['catch'](function () { return { ok: false, status: 0, body: {} }; });
  }

  function $(sel, root) { return (root || document).querySelector(sel); }

  function toast(msg, bad) {
    var el = document.getElementById('mn-toast');
    if (!el) {
      el = document.createElement('div');
      el.id = 'mn-toast';
      el.setAttribute('role', 'status');
      el.setAttribute('aria-live', 'polite');
      el.style.cssText = 'position:fixed;left:50%;transform:translateX(-50%);bottom:26px;' +
        'z-index:99999;max-width:min(560px,92vw);padding:11px 16px;border-radius:10px;' +
        'font-size:13.5px;line-height:1.6;box-shadow:0 10px 30px rgba(0,0,0,.28);' +
        'transition:opacity .18s ease;pointer-events:none;font-weight:500;';
      document.body.appendChild(el);
    }
    el.style.background = bad ? '#3A1D22' : '#1E1B2E';
    el.style.color = bad ? '#FFC9C9' : '#EAE7F5';
    el.style.border = '1px solid ' + (bad ? '#6B2B33' : '#3B3556');
    el.textContent = msg;
    el.style.opacity = '1';
    clearTimeout(el.__t);
    el.__t = setTimeout(function () { el.style.opacity = '0'; }, 4200);
  }

  function copy(text, label) {
    function done(ok) {
      toast(ok ? L('已复制' + (label || ''), 'Copied ' + (label || ''))
               : L('复制失败，请手动选择文本', 'Copy failed — please select manually'), !ok);
    }
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(function () { done(true); })['catch'](function () { done(false); });
    } else { done(false); }
  }

  function reIcons() { try { if (window.lucide && lucide.createIcons) lucide.createIcons(); } catch (e) {} }

  function rerenderSoon() {
    setTimeout(function () { applyAnnounce(); applyFooter(); }, 60);
  }

  /* ------------------------------------ 后台改过的页面文案 → 外层 i18n 表 */
  /* content 段是「语言前缀 + i18n 键」的扁平结构（zh.hero.l1 / en.hero.l1）。
     在这里拆成两份交给外层脚本，外层才知道当前是哪种语言、该压哪一份。
     只认 zh / en 两种前缀、值一律转字符串：配置是管理员手填的，
     形状不对时宁可丢掉这一条，也不要让整个语言表变成 undefined。 */
  function publishContent(raw) {
    var out = { zh: {}, en: {} };
    if (raw && typeof raw === 'object') {
      for (var k in raw) {
        if (!Object.prototype.hasOwnProperty.call(raw, k)) continue;
        var m = /^(zh|en)\.(.+)$/.exec(k);
        if (!m) continue;
        var v = raw[k];
        if (v === null || v === undefined) continue;
        out[m[1]][m[2]] = String(v);
      }
    }
    /* 没配过覆盖时什么都不做：绝大多数访客走的就是这条，不要为了一个空对象
       在首屏加载后再整页重画一次（那会冲掉刚敲了一半的输入）。
       配了才重画，而且内容和上次完全一致也不重画 —— 防止 admin 页反复
       MN.refresh() 时把控制台界面刷回初始状态。 */
    var sig = '';
    try { sig = JSON.stringify(out); } catch (e) {}
    var had = window.__SITE_CONTENT_COMPARE !== null && window.__SITE_CONTENT_COMPARE !== undefined;
    var empty = !out.zh || !Object.keys(out.zh).length;
    if (empty && (!out.en || !Object.keys(out.en).length)) {
      window.__SITE_CONTENT_COMPARE = null;
      window.__SITE_CONTENT_HAD = had;
      window.__SITE_CONTENT = out;
      try { if (typeof window.__onSiteContentEmpty === 'function') window.__onSiteContentEmpty(); } catch (e) {}
      return;
    }
    if (sig === window.__SITE_CONTENT_COMPARE) return;
    window.__SITE_CONTENT_COMPARE = sig;
    window.__SITE_CONTENT = out;
    try {
      if (typeof window.__onSiteContent === 'function') window.__onSiteContent();
    } catch (e) {}
  }

  /* --------------------------------------------------------------- 取配置 */

  function fetchCfg(force) {
    var now = Date.now();
    if (!force && CFG && (now - CFG_AT) < CFG_TTL) return Promise.resolve(CFG);
    if (CFG_P) return CFG_P;
    /* 带时间戳：这份 JSON 决定登录页哪些第三方按钮是可点的。CDN 对
       no-cache 会按 stale-while-revalidate 直接返旧副本（CF-Cache-Status:
       REVALIDATED），后台刚保存的配置刷新后仍旧读不到，Google 按钮就一直灰着。
       服务端已改成 no-store，这里再带一层 cache-bust 双保险 —— 几 KB 的
       JSON 每次回源，换来「保存即生效」，这笔交换是值的。 */
    CFG_P = api('/api/site?_=' + now).then(function (r) {
      CFG_P = null;
      if (r && r.ok && r.body && r.body.brand) {
        CFG = r.body; CFG_AT = Date.now();
        publishContent(CFG.content);
      }
      return CFG;
    })['catch'](function () { CFG_P = null; return CFG; });
    return CFG_P;
  }

  /* ---------------------------------------------------- 公告栏 / 页脚 */

  function applyAnnounce() {
    var bar = document.getElementById('announce');
    if (!bar) return;
    /* 🔴 2026-10-26：配置没到之前**必须保持隐藏**，绝不能把静态兜底文案亮出来。
       原来这里是 remove('off') —— 于是每次刷新都先画一帧「2026-09-25 上线…18万+」
       的化石文案，等 /api/site 回来才换成真值，用户看到的就是
       「刷新瞬间闪一下旧内容」。现在 index.html 里 #announce 默认带 off，
       只有拿到真值才显示，宁可晚 200ms 出现，也不显示错的内容。 */
    if (!CFG) { bar.classList.add('off'); return; }
    var a = CFG.announce || {};
    var zh = docLang() === 'zh';

    if (a.enabled === false) { bar.classList.add('off'); return; }

    var rev = String(CFG.revision || '');
    var dismissed = false;
    try {
      var rec = JSON.parse(localStorage.getItem(DISMISS_KEY) || 'null');
      /* 「关掉」必须认版本：公告换了新内容就该重新出现，否则运营改完公告，
         老访客永远看不到 —— 这是通知栏最常见的坑。
         再叠一层时间窗：同一份公告最多压 3 天，误点一次不至于永久失去入口。 */
      dismissed = !!(rec && rec.rev && String(rec.rev) === rev
                     && (Date.now() - Number(rec.at || 0)) < DISMISS_TTL);
    } catch (e) { dismissed = false; }
    if (a.dismissible !== false && dismissed) {
      bar.classList.add('off');
      return;
    }
    bar.classList.remove('off');

    var tone = String(a.tone || 'accent');
    bar.setAttribute('data-tone', tone);
    bar.style.background = tone === 'warn' ? 'rgba(255,196,84,.10)'
      : (tone === 'info' ? 'rgba(113,180,255,.10)' : '');
    bar.style.borderBottomColor = tone === 'warn' ? 'rgba(255,196,84,.32)'
      : (tone === 'info' ? 'rgba(113,180,255,.30)' : '');

    /* 摘掉 data-i18n 是关键：renderStatic() 只会覆盖**还带着该属性**的节点。
       服务端下发的文案必须逃离本地词典，否则每次整页渲染都会被静态默认值盖回去。 */
    var tag = $('.in b', bar);
    if (tag) {
      var tv = String(a.tag || '');
      tag.removeAttribute('data-i18n');
      tag.textContent = tv;
      tag.style.display = tv ? '' : 'none';
    }
    var txt = $('.in span', bar);
    if (txt) {
      txt.removeAttribute('data-i18n');
      txt.textContent = zh ? (a.text_zh || a.text_en || '') : (a.text_en || a.text_zh || '');
    }
    var cta = $('.in a.cta', bar);
    if (cta) {
      var label = zh ? (a.cta_zh || a.cta_en || '') : (a.cta_en || a.cta_zh || '');
      cta.removeAttribute('data-i18n');
      if (label && a.href) {
        cta.textContent = label;
        cta.setAttribute('href', a.href);
        /* 外链必须带 rel=noopener：否则目标页能通过 window.opener 反控制本页。 */
        if (/^https?:/i.test(a.href)) cta.setAttribute('rel', 'noopener');
        cta.style.display = '';
      } else {
        cta.style.display = 'none';
      }
    }
    var x = document.getElementById('ann-x');
    if (x && !x.__mnBound) {
      x.__mnBound = true;
      x.addEventListener('click', function () {
        /* 记下「关掉的是哪一版公告 + 什么时候关的」，同时立刻收起来。
           主 bundle 也绑了同一个按钮（只加 off），两边各管一半：一个负责视觉，
           一个负责记忆，重复绑定不会冲突（这里还有 __mnBound 兜底）。 */
        try {
          localStorage.setItem(DISMISS_KEY, JSON.stringify({
            rev: String((CFG || {}).revision || ''), at: Date.now()
          }));
        } catch (e) {}
        bar.classList.add('off');
      });
    }
  }

  function applyFooter() {
    if (!CFG) return;
    var f = CFG.footer || {};
    var b = CFG.brand || {};
    var foot = document.querySelector('footer');
    if (!foot) return;
    var host = document.getElementById('mn-foot-note');
    if (!host) {
      host = document.createElement('div');
      host.id = 'mn-foot-note';
      host.style.cssText = 'max-width:1439.98px;margin:0 auto;padding:12px 24px 28px;' +
        'font-size:12px;line-height:1.85;opacity:.72;';
      foot.appendChild(host);
    }
    var zh = docLang() === 'zh';
    var parts = [];
    if (f.copyright) parts.push(esc(f.copyright));
    if (zh && f.note_zh) parts.push(esc(f.note_zh));
    if (!zh && f.note_en) parts.push(esc(f.note_en));
    if (f.icp) parts.push(esc(f.icp));
    var links = [];
    if (b.repo) links.push('<a href="' + escAttr(b.repo) + '" target="_blank" rel="noopener">GitHub</a>');
    if (b.feedback_url) links.push('<a href="' + escAttr(b.feedback_url) + '" target="_blank" rel="noopener">' + L('反馈', 'Feedback') + '</a>');
    if (b.support_email) links.push('<a href="mailto:' + escAttr(b.support_email) + '">' + esc(b.support_email) + '</a>');
    if (links.length) parts.push(links.join(' &middot; '));
    host.innerHTML = parts.join('<br>');
    host.style.display = parts.length ? '' : 'none';
  }

  /* ------------------------------------------------------------ 对外接口 */

  var MN = {};

  MN.authReady = function (id) {
    /* 配置还没到时保持旧行为，别让本来能用的 GitHub 按钮消失一秒。 */
    if (!CFG || !CFG.auth) return id === 'github';
    return !!CFG.auth[id];
  };

  MN.apply = function () {
    if (CFG) { applyAnnounce(); applyFooter(); return; }
    fetchCfg().then(function () {
      if (!CFG) return;
      applyAnnounce();
      applyFooter();
      /* 刚拿到就绪状态：登录页的 SSO 按钮是按它画的，所以要重画一次。
         用 hashchange 触发是刻意的 —— 它走主脚本自己的路由，不依赖它的内部函数。 */
      try {
        var p = (location.hash || '').replace(/^#\/?/, '').split('/')[0].toLowerCase();
        if (p === 'login' || p === 'admin' || p === 'account') {
          window.dispatchEvent(new Event('hashchange'));
        }
      } catch (e) {}
    });
  };

  /* SSO 回跳结果：服务端在 URL 上留了 ?github=ok / ?google=token&why=…
     这些查询参数不会被路由消费，由这里捡起来给用户一句人话。 */
  MN.handleSSOResult = function () {
    var q = location.search || '';
    if (!q || q.length < 2) return;
    var p;
    try { p = new URLSearchParams(q); } catch (e) { return; }
    var ids = ['github', 'google'];
    for (var i = 0; i < ids.length; i++) {
      var id = ids[i];
      var v = p.get(id);
      if (!v) continue;
      var name = id === 'github' ? 'GitHub' : 'Google';
      if (v === 'ok') {
        toast(L('已使用 ' + name + ' 登录成功。', 'Signed in with ' + name + '.'));
      } else {
        var why = p.get('why') || '';
        var human = v === 'unverified'
          ? L(name + ' 账号的邮箱未经验证，出于安全考虑不能用于登录。',
              'That ' + name + ' account has an unverified e-mail, so it cannot be used to sign in.')
          : v === 'denied'
            ? L('你取消了 ' + name + ' 授权。', 'You cancelled the ' + name + ' authorisation.')
            : L(name + ' 登录未完成（' + v + '）。', name + ' sign-in did not complete (' + v + ').');
        toast(human + (why ? '  ' + why : ''), true);
      }
      try { history.replaceState(null, '', location.pathname + location.hash); } catch (e) {}
      return;
    }
  };

  /* ====================================================================== *
   *  后台管理的面板
   * ====================================================================== */

  function hrow(title, sub, right) {
    return '<div class="dx-hrow"><div><h1 class="dx-h1">' + esc(title) + '</h1>' +
      (sub ? '<p class="dx-sub">' + esc(sub) + '</p>' : '') + '</div>' +
      '<div class="sp"></div>' + (right || '') + '</div>';
  }

  function field(label, inner) {
    return '<div class="dx-field"><label>' + esc(label) + '</label>' + inner + '</div>';
  }

  function tag(ok, yes, no) {
    var on = ok ? 'background:rgba(113,220,200,.14);color:#71DCC8'
                : 'background:rgba(255,196,84,.14);color:#FFC454';
    return '<span class="dx-tag" style="' + on + '">' + esc(ok ? yes : no) + '</span>';
  }

  function fact(k, v) {
    return '<div class="dx-card" style="padding:12px 14px"><div style="font-size:11.5px;' +
      'opacity:.66;margin-bottom:4px">' + esc(k) + '</div>' +
      '<div class="mono" style="font-size:12.5px;overflow-wrap:anywhere">' + esc(v) + '</div></div>';
  }

  function block(title, body, key) {
    var id = 'mn-code-' + key + '-' + (++SEQ);
    STORE[id] = body;
    return '<div style="margin-bottom:12px">' +
      '<div style="display:flex;align-items:center;gap:8px;margin-bottom:6px;flex-wrap:wrap">' +
      '<span style="font-size:12.5px;font-weight:600;overflow-wrap:anywhere">' + esc(title) + '</span>' +
      '<button class="dx-btn" type="button" data-mncp2="' + escAttr(id) + '" style="margin-left:auto">' +
      esc(L('复制', 'Copy')) + '</button>' +
      '</div>' +
      '<pre class="mono" style="margin:0;padding:12px 14px;border-radius:9px;' +
      'background:rgba(0,0,0,.28);border:1px solid rgba(255,255,255,.09);font-size:12px;' +
      'line-height:1.65;overflow:auto;max-height:300px;white-space:pre">' + esc(body) + '</pre>' +
      '</div>';
  }

  function fmtBytes(n) {
    n = Number(n || 0);
    if (!n) return '—';
    var u = ['B', 'KB', 'MB', 'GB', 'TB'];
    var i = 0;
    while (n >= 1024 && i < u.length - 1) { n = n / 1024; i++; }
    return (i === 0 ? n : n.toFixed(1)) + ' ' + u[i];
  }

  function sec(fn) { return '<section class="site-sec">' + fn + '</section>'; }

  /* ---- ① 就绪状态：管理员第一眼要看的就是「哪些能用了」 ---- */
  MN.secReadiness = function (d) {
    d = d || {};
    var ready = d.ready || {};
    var cb = d.callbacks || {};
    var rows = [
      ['GitHub 登录', 'GitHub sign-in', ready.github, cb.github],
      ['Google 登录', 'Google sign-in', ready.google, cb.google],
      ['邮件发送（验证码）', 'Mail sender (verification codes)', ready.mail, '']
    ];
    return hrow(L('就绪状态', 'Readiness'),
                L('这一栏是实时的：填了凭据、存了邮件设置，下一次刷新就会变成「已就绪」。',
                  'Live state. Fill in credentials or mail settings and it turns ready on the next load.')) +
      rows.map(function (r) {
        return '<div style="display:flex;gap:10px;align-items:center;padding:9px 0;' +
          'border-bottom:1px solid rgba(255,255,255,.06);flex-wrap:wrap">' +
          '<span style="min-width:160px;font-size:13.5px">' + esc(L(r[0], r[1])) + '</span>' +
          tag(!!r[2], L('已就绪', 'ready'), L('未配置', 'not configured')) +
          (r[3] ? '<button class="dx-btn" type="button" data-mncopy="' + escAttr(r[3]) +
                  '" data-mncopy-label="回调地址" style="margin-left:auto">' +
                  esc(L('复制回调地址', 'Copy callback URL')) + '</button>' : '') +
          '</div>' + (r[3] ? '<div class="mono" style="font-size:11px;opacity:.6;' +
          'overflow-wrap:anywhere;padding:0 0 8px">' + esc(r[3]) + '</div>' : '');
      }).join('') +
      '<p class="dx-note" style="margin-top:10px">' +
      esc(L('回调地址要一个字符不差地填进各家开发者后台，否则会报 redirect_uri_mismatch。',
            'Paste the callback URL into each provider console exactly, or you get redirect_uri_mismatch.')) +
      '</p>';
  };

  /* ---- ② 品牌 ---- */
  MN.secBrand = function (d) {
    var s = ((d || {}).site || {}).brand || {};
    return hrow(L('品牌', 'Brand'),
                L('站点名称与对外联系方式，会用在公告栏、邮件与页脚。',
                  'Site name and contact details, used in the announcement bar, e-mails and footer.')) +
      '<div class="dx-grid">' +
      field(L('站点名称', 'Site name'),
            '<input class="inp" data-mnf="brand.name" value="' + escAttr(s.name || '') + '">') +
      field(L('GitHub 仓库', 'Repository'),
            '<input class="inp" data-mnf="brand.repo" value="' + escAttr(s.repo || '') + '">') +
      field(L('支持邮箱', 'Support e-mail'),
            '<input class="inp" type="email" data-mnf="brand.support_email" value="' +
            escAttr(s.support_email || '') + '" placeholder="support@example.com">') +
      field(L('支持微信 / 其他联系方式', 'WeChat or other contact'),
            '<input class="inp" data-mnf="brand.support_wechat" value="' +
            escAttr(s.support_wechat || '') + '">') +
      field(L('标语（中文）', 'Tagline (Chinese)'),
            '<input class="inp" data-mnf="brand.tagline_zh" value="' +
            escAttr(s.tagline_zh || '') + '">') +
      field(L('标语（英文）', 'Tagline (English)'),
            '<input class="inp" data-mnf="brand.tagline_en" value="' +
            escAttr(s.tagline_en || '') + '">') +
      '</div>' +
      '<div><button class="dx-btn" type="button" data-mnsave="brand">' +
      esc(L('保存品牌设置', 'Save brand settings')) + '</button></div>';
  };

  /* ---- ③c 邮件模板：验证码邮件的主题与措辞 ---- */
  /* 主题后缀、动作名、安全提示这三段原来写死在 otp_mail() 里，改一句
     「注册验证码」要改 Python + 重新部署。这里把它们暴露出来，
     留空即用内置默认（与页面文案同一套「空值=撤销覆盖」的语义）。 */
  MN.secMailTpl = function (d) {
    var mt = ((d || {}).site || {}).mail_templates || {};
    var v = function (k) { return escAttr(mt[k] || ''); };
    return hrow(L('邮件模板', 'E-mail templates'),
                L('验证码邮件的主题后缀、动作名与安全提示。留空即用内置默认；改完对下一封发出的邮件生效。',
                  'Subject suffix, action name and security notice for verification e-mails. Empty means built-in default; applies to the next message sent.')) +
      '<div class="dx-grid">' +
      field(L('主题后缀（中文）', 'Subject suffix (Chinese)'),
            '<input class="inp" data-mnt="zh.subject" value="' + v('zh.subject') +
            '" placeholder="注册验证码">') +
      field(L('主题后缀（英文）', 'Subject suffix (English)'),
            '<input class="inp" data-mnt="en.subject" value="' + v('en.subject') +
            '" placeholder="verification code">') +
      field(L('动作名（中文）', 'Action name (Chinese)'),
            '<input class="inp" data-mnt="zh.action" value="' + v('zh.action') +
            '" placeholder="注册">') +
      field(L('动作名（英文）', 'Action name (English)'),
            '<input class="inp" data-mnt="en.action" value="' + v('en.action') +
            '" placeholder="sign-up">') +
      field(L('安全提示（中文）', 'Security notice (Chinese)'),
            '<textarea class="inp" rows="2" data-mnt="zh.safety">' +
            esc(mt['zh.safety'] || '') + '</textarea>') +
      field(L('安全提示（英文）', 'Security notice (English)'),
            '<textarea class="inp" rows="2" data-mnt="en.safety">' +
            esc(mt['en.safety'] || '') + '</textarea>') +
      '</div>' +
      '<p class="dx-note">' +
        esc(L('主题的实际格式是「验证码 + 主题后缀」，例如「123456 是你的 Mnemosyne OS 注册验证码」。只改后缀即可，不要把验证码写进来。',
              'The subject is built as “code + suffix”, e.g. “123456 is your Mnemosyne OS verification code”. Change only the suffix.')) +
      '</p>' +
      '<div><button class="dx-btn" type="button" data-mnsave="mail">' +
      esc(L('保存邮件模板', 'Save templates')) + '</button></div>';
  };

  /* ---- ③ 页脚 ---- */
  MN.secFooter = function (d) {
    var s = ((d || {}).site || {}).footer || {};
    return hrow(L('页脚与备案', 'Footer and legal'),
                L('版权声明、备案号与补充说明；留空则整段不显示。',
                  'Copyright, filing number and notes. Anything empty is not rendered.')) +
      '<div class="dx-grid">' +
      field(L('版权声明', 'Copyright'),
            '<input class="inp" data-mnf="footer.copyright" value="' +
            escAttr(s.copyright || '') + '" placeholder="© 2026 Mnemosyne OS">') +
      field(L('备案号 / 许可号', 'Filing or licence number'),
            '<input class="inp" data-mnf="footer.icp" value="' + escAttr(s.icp || '') + '">') +
      field(L('补充说明（中文）', 'Note (Chinese)'),
            '<textarea class="inp" rows="2" data-mnf="footer.note_zh">' +
            esc(s.note_zh || '') + '</textarea>') +
      field(L('补充说明（英文）', 'Note (English)'),
            '<textarea class="inp" rows="2" data-mnf="footer.note_en">' +
            esc(s.note_en || '') + '</textarea>') +
      '</div>' +
      '<div><button class="dx-btn" type="button" data-mnsave="footer">' +
      esc(L('保存页脚', 'Save footer')) + '</button></div>';
  };

  /* ---- ③b 页面文案：全站 i18n 键的可视化编辑 ---- */
  /* 这里列的是前台每一处写死的文案（77 个键、18 个分区）。改的是覆盖层，
     不是源码：值写进 site.json 的 content 段，前台加载时压到 i18n 表上；
     清空一个输入框 = 撤销这条覆盖，回到内置默认。
     分组按页面从上到下的阅读顺序排，不按字母 —— 管理员找「页脚」时脑子里
     的顺序是「往下滚」，不是「f 排在 a 后面」。 */
  var CONTENT_GROUPS = [
    ['hero',  '首页 · 主视觉',     'Home · hero'],
    ['ann',   '首页 · 公告条',     'Home · announcement'],
    ['proof', '首页 · 产品主张',   'Home · value proposition'],
    ['how',   '首页 · 工作方式',   'Home · how it works'],
    ['arch',  '首页 · 架构',       'Home · architecture'],
    ['bench', '首页 · 性能基准',   'Home · benchmarks'],
    ['uc',    '首页 · 使用场景',   'Home · use cases'],
    ['int',   '首页 · 集成',       'Home · integrations'],
    ['ent',   '首页 · 企业与信任', 'Home · enterprise and trust'],
    ['price', '首页 · 定价',       'Home · pricing'],
    ['res',   '首页 · 资源',       'Home · resources'],
    ['cta',   '首页 · 结尾号召',   'Home · closing CTA'],
    ['nav',   '顶栏',              'Header'],
    ['theme', '外观菜单',          'Appearance menu'],
    ['lang',  '语言菜单',          'Language menu'],
    ['code',  '代码窗口',          'Code window'],
    ['foot',  '页脚',              'Footer'],
    ['a11y',  '无障碍',            'Accessibility']
  ];

  MN.secContent = function (d) {
    var site = (d || {}).site || {};
    var content = site.content || {};
    var keys = window.__I18N_KEYS || [];
    var defs = window.__I18N_DEFAULTS || { zh: {}, en: {} };
    var byGroup = {};
    keys.forEach(function (k) {
      var p = k.split('.')[0];
      (byGroup[p] = byGroup[p] || []).push(k);
    });
    /* 分组表没覆盖到的前缀也要露出来：以后往 i18n 表里加文案时，
       新键会自动出现在后台，不会因为忘了登记分组就变成改不了的死文案。 */
    var extra = Object.keys(byGroup).filter(function (p) {
      return !CONTENT_GROUPS.some(function (g) { return g[0] === p; });
    });
    var groups = CONTENT_GROUPS.concat(extra.map(function (p) { return [p, p, p]; }));
    var overridden = 0;
    for (var ck in content) {
      if (Object.prototype.hasOwnProperty.call(content, ck) && content[ck]) overridden++;
    }
    var cellInp = 'width:100%;min-width:150px';

    return hrow(L('页面文案', 'Page copy'),
                L('前台每一处写死的文案都在这里。改的是覆盖层，不动源码；清空一个框就是撤销这条覆盖、回到内置默认。保存后前台立即生效。',
                  'Every hard-coded string on the site lives here. Edits go into an override layer, not the source; clearing a field reverts it to the built-in default. Applies immediately.')) +
      '<p class="dx-note">' +
        esc(L('已覆盖 ', 'Overrides: ') + overridden + L(' 条（共 ' + keys.length + ' 条可改文案）',
             ' of ' + keys.length + ' editable strings')) +
      '</p>' +
      '<div style="margin:10px 0 14px">' +
        '<input class="inp" id="mn-content-q" style="max-width:340px" placeholder="' +
        escAttr(L('搜索文案或键名…', 'Search copy or key…')) + '">' +
      '</div>' +
      groups.map(function (g) {
        var list = byGroup[g[0]] || [];
        if (!list.length) return '';
        var rows = list.map(function (key) {
          var z = content['zh.' + key];
          var e = content['en.' + key];
          return '<tr data-mnc-row="' + escAttr(key) + '">' +
            '<td class="mono" style="font-size:11px;opacity:.62;white-space:nowrap;vertical-align:top;padding:6px 10px 6px 0">' +
              esc(key) + '</td>' +
            '<td style="padding:4px 8px 4px 0"><input class="inp" style="' + cellInp + '" data-mnc="zh.' +
              escAttr(key) + '" value="' + escAttr(z || '') + '" placeholder="' +
              escAttr(String(defs.zh[key] || '')) + '"></td>' +
            '<td style="padding:4px 0"><input class="inp" style="' + cellInp + '" data-mnc="en.' +
              escAttr(key) + '" value="' + escAttr(e || '') + '" placeholder="' +
              escAttr(String(defs.en[key] || '')) + '"></td>' +
          '</tr>';
        }).join('');
        return '<details class="mn-cg" style="margin:0 0 10px;border:1px solid var(--d-line);border-radius:8px;padding:0 12px">' +
          '<summary style="cursor:pointer;padding:10px 0;font-size:13px;font-weight:500">' +
            esc(L(g[1], g[2])) +
            ' <span style="opacity:.45;font-weight:400">· ' + list.length + '</span>' +
          '</summary>' +
          '<div style="overflow-x:auto"><table style="width:100%;border-collapse:collapse">' +
            '<thead><tr style="font-size:10.5px;opacity:.5;text-align:left">' +
              '<th style="padding:0 10px 6px 0">KEY</th>' +
              '<th style="padding:0 8px 6px 0">' + esc(L('中文', 'Chinese')) + '</th>' +
              '<th style="padding:0 0 6px">English</th>' +
            '</tr></thead><tbody>' + rows + '</tbody></table></div>' +
          '</details>';
      }).join('') +
      '<div style="display:flex;gap:10px;flex-wrap:wrap;align-items:center">' +
        '<button class="dx-btn" type="button" data-mnsave="content">' +
          esc(L('保存页面文案', 'Save page copy')) + '</button>' +
        '<button class="dx-btn" type="button" data-mncontentreset="1">' +
          esc(L('清空全部覆盖', 'Clear all overrides')) + '</button>' +
      '</div>';
  };

  /* ---- ④ 登录方式（开关） ---- */
  MN.secAuth = function (d) {
    var a = ((d || {}).site || {}).auth || {};
    var ready = (d || {}).ready || {};
    var items = [
      ['password', L('邮箱 + 密码', 'E-mail and password'), ''],
      ['emailCode', L('邮箱验证码', 'E-mail verification code'), ready.mail ? '' : L('邮件未配置', 'mail not configured')],
      ['github', 'GitHub', ready.github ? '' : L('凭据未配置', 'no credentials')],
      ['google', 'Google', ready.google ? '' : L('凭据未配置', 'no credentials')],
      ['wechat', 'WeChat', L('尚未接入', 'not implemented')],
      ['signup', L('允许自助注册', 'Allow self sign-up'), '']
    ];
    return hrow(L('登录方式', 'Sign-in methods'),
                L('关掉的入口会从登录页消失。至少要留一种 —— 服务端也会拦住「全关」的提交。',
                  'Disabled methods disappear from the sign-in page. At least one must stay on.')) +
      items.map(function (it) {
        var on = a[it[0]] !== false;
        return '<label style="display:flex;align-items:center;gap:9px;padding:8px 0;' +
          'border-bottom:1px solid rgba(255,255,255,.06);cursor:pointer;flex-wrap:wrap">' +
          '<input type="checkbox" data-mna="auth.' + it[0] + '"' + (on ? ' checked' : '') +
          ' style="width:15px;height:15px">' +
          '<span style="font-size:13.5px">' + esc(it[1]) + '</span>' +
          (it[2] ? '<span style="margin-left:auto;font-size:11.5px;opacity:.62">' +
                   esc(it[2]) + '</span>' : '') +
          '</label>';
      }).join('') +
      '<div style="margin-top:12px"><button class="dx-btn" type="button" data-mnsave="auth">' +
      esc(L('保存登录方式', 'Save sign-in methods')) + '</button></div>';
  };

  /* ---- ⑤ 第三方登录凭据 ---- */
  MN.secOAuth = function (d) {
    d = d || {};
    function blk(id, label, o) {
      o = o || {};
      return '<div style="margin-bottom:18px">' +
        '<div style="font-size:13.5px;font-weight:600;margin-bottom:8px">' + esc(label) +
        '&nbsp;&nbsp;' + tag(!!o.configured, L('已配置', 'configured'),
                              L('未配置', 'not configured')) + '</div>' +
        '<div class="dx-grid">' +
        field(L('Client ID', 'Client ID'),
              '<input class="inp" data-mno="' + id + '.clientId" value="' +
              escAttr(o.clientId || '') + '" autocomplete="off" spellcheck="false">') +
        field(L('Client Secret（留空则不改）', 'Client Secret (empty keeps it)'),
              '<input class="inp" type="password" data-mno="' + id + '.clientSecret" value="" ' +
              'autocomplete="new-password" placeholder="' + escAttr(o.secretSet
                ? L('已设置，指纹 ' + (o.secretFingerprint || ''), 'set, fingerprint ' + (o.secretFingerprint || ''))
                : L('未设置', 'not set')) + '">') +
        field(L('回调地址（照抄到对方后台）', 'Callback URL (paste into the provider console)'),
              '<input class="inp" readonly value="' + escAttr(o.callbackUrl || '') + '">') +
        '</div>' +
        '<button class="dx-btn" type="button" data-mncopy="' + escAttr(o.callbackUrl || '') +
        '" data-mncopy-label="回调地址">' + esc(L('复制回调地址', 'Copy callback URL')) +
        '</button>' +
        (o.overridden
          ? ' <button class="dx-btn" type="button" data-mnoclear="' + id + '">' +
            esc(L('回退到出厂默认', 'Revert to factory default')) + '</button>'
          : '') +
        '</div>';
    }
    return hrow(L('第三方登录凭据', 'Third-party credentials'),
                L('保存在持久卷上，重新部署也不会被覆盖。密钥只以指纹回显，永远不返回明文。',
                  'Stored on the persistent volume, so a redeploy will not wipe them. Secrets are only echoed as a fingerprint.')) +
      blk('github', 'GitHub', d.github) +
      blk('google', 'Google', d.google) +
      '<div><button class="dx-btn" type="button" data-mnsave="oauth">' +
      esc(L('保存凭据', 'Save credentials')) + '</button></div>' +
      '<p class="dx-note" style="margin-top:10px">' +
      esc(L('Google 侧还要在 OAuth 同意屏幕里把这个回调地址加进「已获授权的重定向 URI」，' +
            '并把应用发布为「生产」；否则只有测试用户能登录。',
            'On Google, also add the callback to "Authorised redirect URIs" on the consent screen ' +
            'and publish the app, or only test users can sign in.')) + '</p>';
  };

  /* ---- ⑥ 记忆系统：对外地址 + 一键生成 + 压缩引擎 ---- */
  var ACTIONS = [
    ['diagnose', '体检', 'Health scan', false],
    ['recall', '召回质量', 'Recall quality', false],
    ['stats', '统计', 'Statistics', false],
    ['dedup_preview', '重复检测', 'Duplicate scan', false],
    ['consolidate_preview', '合并预览', 'Consolidate preview', false],
    ['export', '导出备份', 'Export backup', false],
    ['dedup_apply', '去重执行', 'Apply de-duplication', true],
    ['consolidate_apply', '合并执行', 'Apply consolidation', true]
  ];

  MN.secMemory = function (d, sys) {
    var s = ((d || {}).site || {}).memory || {};
    var tok = (sys || {}).token || {};
    return hrow(L('记忆系统', 'Memory system'),
                L('Agent 跑在你自己这台机器上，所以要用对外地址；容器内的 127.0.0.1 是错的。',
                  'Agents run on your own machine, so they need the public address — the container-local 127.0.0.1 will not work.'),
                '<button class="dx-btn" type="button" data-mnact="probe">' +
                esc(L('重新体检', 'Re-run health check')) + '</button>') +
      '<div class="dx-grid">' +
      field(L('对外网关地址（MCP）', 'Public gateway URL (MCP)'),
            '<input class="inp" data-mnf="memory.public_mcp_url" value="' +
            escAttr(s.public_mcp_url || (sys || {}).publicMcpUrl || '') +
            '" placeholder="http://203.0.113.10:8788/mcp" spellcheck="false">') +
      field(L('对外引擎地址（管理端）', 'Public engine URL'),
            '<input class="inp" data-mnf="memory.public_engine_url" value="' +
            escAttr(s.public_engine_url || (sys || {}).publicEngineUrl || '') +
            '" placeholder="http://203.0.113.10:9090" spellcheck="false">') +
      field(L('命名空间', 'Namespace'),
            '<input class="inp" data-mnf="memory.namespace" value="' +
            escAttr(s.namespace || 'default') + '">') +
      field(L('默认 Agent 名（用于来源标签）', 'Default agent label'),
            '<input class="inp" data-mnf="memory.default_agent" value="' +
            escAttr(s.default_agent || 'WorkBuddy') + '">') +
      '</div>' +
      '<div style="display:flex;gap:8px;flex-wrap:wrap;margin:2px 0 14px">' +
      '<button class="dx-btn" type="button" data-mnsave="memory">' +
      esc(L('保存地址设置', 'Save addresses')) + '</button>' +
      '<button class="dx-btn" type="button" data-mngen="config">' +
      esc(L('一键生成 Agent 配置', 'Generate agent config')) + '</button>' +
      '</div>' +
      '<p class="dx-note">' +
      esc(L('网关令牌指纹（用来核对本机那份配置是否和网关一致）：',
            'Gateway token fingerprint (to verify your local config matches the gateway): ')) +
      '<code class="mono" style="font-size:13px;letter-spacing:.5px">' +
      esc(tok.fingerprint || '—') + '</code>' +
      (tok.configured ? '' : ' &nbsp;' + esc(L('（网关尚未设置令牌）', '(no gateway token set)'))) +
      '</p>' +
      '<div id="mn-gen-out"></div>' +
      '<div class="dx-dsep"></div>' +
      '<div style="font-size:13.5px;font-weight:600;margin-bottom:6px">' +
      esc(L('压缩引擎', 'Compression engine')) + '</div>' +
      '<p class="dx-sub" style="margin-bottom:12px">' +
      esc(L('记忆用得越久越乱。这些动作把重复、同义的记忆收敛掉，并支持可回退的导出。' +
            '「检测 / 预览」不改任何东西；「执行」会真实改写记忆库，需要二次确认。',
            'Memories get noisy over time. These collapse duplicates and synonyms, and export is restorable. ' +
            'Scans and previews change nothing; apply rewrites the store and asks for confirmation.')) + '</p>' +
      '<div style="display:flex;gap:8px;flex-wrap:wrap">' +
      ACTIONS.map(function (a) {
        return '<button class="dx-btn" type="button" data-mnact="' + a[0] + '"' +
          (a[3] ? ' style="border-color:rgba(255,120,120,.5);color:#FF9C9C"' : '') +
          '>' + esc(L(a[1], a[2])) + '</button>';
      }).join('') + '</div>' +
      '<div id="mn-act-out"></div>';
  };

  /* ---- 系统概览（独立标签页） ---- */
  window.mnHealthPanel = function () {
    setTimeout(loadHealth, 0);
    return '<div id="mn-health"><div class="kempty">' +
      esc(L('正在体检…', 'Running the health check…')) + '</div></div>';
  };

  function loadHealth() {
    var box = document.getElementById('mn-health');
    if (!box) return;
    api('/api/dash/system').then(function (r) {
      if (!document.getElementById('mn-health')) return;
      if (!r.ok) {
        box.innerHTML = '<div class="kempty">' +
          esc(L('读不到体检数据，可能需要重新登录。',
                'Could not load health data — you may need to sign in again.')) + '</div>';
        return;
      }
      box.innerHTML = healthHTML(r.body || {});
      reIcons();
      wirePanel(box, loadHealth);
    });
  }

  function healthHTML(d) {
    var checks = d.checks || [];
    var bad = checks.filter(function (c) { return !c.ok; });
    var healthy = d.ok && !bad.length;

    var head = '<div style="padding:14px 16px;border-radius:12px;margin-bottom:14px;border:1px solid ' +
      (healthy ? 'rgba(113,220,200,.32);background:rgba(113,220,200,.08)'
               : 'rgba(255,196,84,.32);background:rgba(255,196,84,.08)') + '">' +
      '<div style="font-size:15px;font-weight:600">' +
      esc(healthy ? L('全链路正常', 'All systems nominal')
                  : L('有 ' + bad.length + ' 项需要注意', bad.length + ' item(s) need attention')) + '</div>' +
      '<div class="mono" style="font-size:11.5px;opacity:.72;margin-top:6px;overflow-wrap:anywhere">' +
      esc('gateway ' + (d.gatewayUrl || '') + '  ·  engine ' + (d.engineUrl || '')) + '</div></div>';

    var rows = checks.map(function (c) {
      var col = c.ok ? 'rgba(113,220,200,.95)' : (c.level === 'warn' ? '#FFC454' : '#FF9C9C');
      return '<div style="padding:10px 0;border-bottom:1px solid rgba(255,255,255,.06)">' +
        '<div style="display:flex;gap:9px;align-items:flex-start">' +
        '<span aria-hidden="true" style="color:' + col + ';font-weight:700;line-height:1.55">' +
        (c.ok ? '✓' : '!') + '</span><div style="flex:1;min-width:0">' +
        '<div style="font-size:13.5px">' + esc(docLang() === 'zh' ? c.zh : c.en) + '</div>' +
        (c.ok ? '' : '<div style="font-size:12.5px;opacity:.76;margin-top:4px;line-height:1.75">' +
          esc(docLang() === 'zh' ? (c.hint_zh || '') : (c.hint_en || '')) + '</div>') +
        '</div></div></div>';
    }).join('');

    var c = d.counts || {};
    var vol = d.volume || {};
    var t = d.tools || {};
    function kv(v, l) {
      return '<div class="kpi"><div class="v">' +
        esc(v === null || v === undefined ? '—' : v) + '</div><div class="l">' + esc(l) + '</div></div>';
    }
    var kpis = '<div class="kgrid" style="margin:14px 0">' +
      kv(c.facade, L('记忆总数', 'Memories')) +
      kv(c.engineActive, L('有效', 'Active')) +
      kv(c.engineDeleted, L('已删除', 'Deleted')) +
      kv(t.count, L('MCP 工具', 'MCP tools')) +
      kv(vol.usedPct === undefined ? '—' : (vol.usedPct + '%'), L('卷已用', 'Volume used')) +
      '</div>';

    var db = d.db || {};
    var facts = '<div class="dx-grid dx-g3" style="margin-bottom:4px">' +
      fact(L('记忆库文件', 'Database file'), db.path || L('未找到', 'not found')) +
      fact(L('主库 / WAL', 'Main / WAL'), fmtBytes(db.main) + ' / ' + fmtBytes(db.wal)) +
      fact(L('令牌指纹', 'Token fingerprint'), (d.token || {}).fingerprint || '—') +
      fact(L('命名空间', 'Namespace'), d.namespace || '—') +
      fact(L('数据目录', 'Data directory'), d.dataDir || '—') +
      fact(L('网关版本 / Brain', 'Gateway version / brain'),
           String(t.version || '—') + ' / ' + String(t.brainDir || '—')) +
      '</div>';

    return head + kpis +
      '<div style="font-size:13.5px;font-weight:600;margin:8px 0 2px">' +
      esc(L('逐项检查', 'Checks')) + '</div>' + rows +
      '<h2 style="font-size:13.5px;font-weight:600;margin:20px 0 10px">' +
      esc(L('运行数据', 'Runtime facts')) + '</h2>' + facts +
      '<div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:14px">' +
      '<button class="dx-btn" type="button" data-mnact="probe">' + esc(L('重新体检', 'Re-run')) + '</button>' +
      '<button class="dx-btn" type="button" data-mngen="config">' +
      esc(L('生成 Agent 配置', 'Generate agent config')) + '</button>' +
      '</div><div id="mn-gen-out"></div><div id="mn-act-out"></div>';
  }

  /* ---- 通知栏（带实时预览） ---- */
  window.mnNoticePanel = function () {
    setTimeout(loadNotice, 0);
    return '<div id="mn-notice"><div class="kempty">' + esc(L('加载中…', 'Loading…')) + '</div></div>';
  };

  function loadNotice() {
    var box = document.getElementById('mn-notice');
    if (!box) return;
    api('/api/dash/site').then(function (r) {
      if (!document.getElementById('mn-notice')) return;
      var a = ((r.body || {}).site || {}).announce || {};
      box.innerHTML = noticeHTML(a);
      reIcons();
      wirePanel(box, loadNotice);
      var form = document.getElementById('mn-ann-form');
      if (form) {
        form.addEventListener('input', previewNotice);
        form.addEventListener('change', previewNotice);
      }
      previewNotice();
    });
  }

  function noticeHTML(a) {
    return hrow(L('通知栏', 'Announcement bar'),
                L('保存后立即生效：访客下一次刷新就能看到，不需要重新部署本站。',
                  'Takes effect on the visitor\u2019s next page load — no redeploy needed.')) +
      '<div id="mn-ann-preview" style="border:1px solid rgba(255,255,255,.12);' +
      'border-radius:10px;overflow:hidden;margin-bottom:16px"></div>' +
      '<div id="mn-ann-form" class="dx-grid">' +
      '<div class="dx-field"><label>' + esc(L('启用', 'Enabled')) + '</label>' +
      '<label style="display:flex;gap:8px;align-items:center;font-size:13px">' +
      '<input type="checkbox" data-mnf="announce.enabled"' + (a.enabled === false ? '' : ' checked') +
      ' style="width:15px;height:15px">' + esc(L('显示通知栏', 'Show the bar')) + '</label></div>' +
      '<div class="dx-field"><label>' + esc(L('可关闭', 'Dismissible')) + '</label>' +
      '<label style="display:flex;gap:8px;align-items:center;font-size:13px">' +
      '<input type="checkbox" data-mnf="announce.dismissible"' + (a.dismissible === false ? '' : ' checked') +
      ' style="width:15px;height:15px">' + esc(L('访客可以关掉', 'Visitors may dismiss it')) + '</label></div>' +
      '<div class="dx-field"><label>' + esc(L('语气 / 底色', 'Tone')) + '</label>' +
      '<select class="inp" data-mnf="announce.tone">' +
      '<option value="accent"' + (a.tone === 'accent' || !a.tone ? ' selected' : '') + '>Accent</option>' +
      '<option value="info"' + (a.tone === 'info' ? ' selected' : '') + '>Info</option>' +
      '<option value="warn"' + (a.tone === 'warn' ? ' selected' : '') + '>Warn</option>' +
      '</select></div>' +
      '<div class="dx-field"><label>' + esc(L('角标（版本号之类）', 'Tag')) + '</label>' +
      '<input class="inp" data-mnf="announce.tag" value="' + escAttr(a.tag || '') + '"></div>' +
      '<div class="dx-field"><label>' + esc(L('正文（中文）', 'Message (Chinese)')) + '</label>' +
      '<textarea class="inp" rows="2" data-mnf="announce.text_zh">' + esc(a.text_zh || '') + '</textarea></div>' +
      '<div class="dx-field"><label>' + esc(L('正文（英文）', 'Message (English)')) + '</label>' +
      '<textarea class="inp" rows="2" data-mnf="announce.text_en">' + esc(a.text_en || '') + '</textarea></div>' +
      '<div class="dx-field"><label>' + esc(L('按钮文字（中文）', 'Button (Chinese)')) + '</label>' +
      '<input class="inp" data-mnf="announce.cta_zh" value="' + escAttr(a.cta_zh || '') + '"></div>' +
      '<div class="dx-field"><label>' + esc(L('按钮文字（英文）', 'Button (English)')) + '</label>' +
      '<input class="inp" data-mnf="announce.cta_en" value="' + escAttr(a.cta_en || '') + '"></div>' +
      '<div class="dx-field"><label>' + esc(L('按钮链接', 'Button link')) + '</label>' +
      '<input class="inp" data-mnf="announce.href" value="' + escAttr(a.href || '') +
      '" placeholder="#/changelog" spellcheck="false"></div>' +
      '</div>' +
      '<div style="margin-top:12px;display:flex;gap:8px;flex-wrap:wrap">' +
      '<button class="dx-btn" type="button" data-mnsave="announce">' +
      esc(L('保存并立即生效', 'Save and publish')) + '</button>' +
      '<button class="dx-btn" type="button" data-mnreload="notice">' +
      esc(L('放弃修改 / 重新载入', 'Discard changes')) + '</button>' +
      '</div>' +
      '<p class="dx-note" style="margin-top:10px">' +
      esc(L('按钮链接留空则只显示文字；填 #/changelog 这类站内锚点不会跳走。',
            'An empty link hides the button. An in-page anchor such as #/changelog stays on this site.')) + '</p>';
  }

  function previewNotice() {
    var form = document.getElementById('mn-ann-form');
    var box = document.getElementById('mn-ann-preview');
    if (!form || !box) return;
    var d = readForm(form).announce || {};
    var zh = docLang() === 'zh';
    if (d.enabled === false) {
      box.innerHTML = '<div style="padding:16px;text-align:center;font-size:12.5px;opacity:.62">' +
        esc(L('通知栏已关闭，前台不会显示。', 'The bar is off and will not appear on the site.')) + '</div>';
      return;
    }
    var bg = d.tone === 'warn' ? 'rgba(255,196,84,.12)'
      : (d.tone === 'info' ? 'rgba(113,180,255,.12)' : 'rgba(91,63,214,.14)');
    var line = d.tone === 'warn' ? 'rgba(255,196,84,.32)'
      : (d.tone === 'info' ? 'rgba(113,180,255,.30)' : 'rgba(91,63,214,.34)');
    var text = zh ? (d.text_zh || d.text_en || '') : (d.text_en || d.text_zh || '');
    var cta = zh ? (d.cta_zh || d.cta_en || '') : (d.cta_en || d.cta_zh || '');
    box.innerHTML = '<div style="background:' + bg + ';border-bottom:1px solid ' + line +
      ';padding:11px 16px;display:flex;gap:12px;align-items:center;font-size:13px">' +
      (d.tag ? '<b class="mono" style="font-size:11.5px;opacity:.8">' + esc(d.tag) + '</b>' : '') +
      '<span style="flex:1;min-width:0">' + esc(text) + '</span>' +
      (cta && d.href ? '<span style="text-decoration:underline;white-space:nowrap">' + esc(cta) + '</span>' : '') +
      (d.dismissible === false ? '' : '<span aria-hidden="true" style="opacity:.5;font-size:15px">×</span>') +
      '</div><div style="padding:5px 16px 8px;font-size:11px;opacity:.5">' +
      esc(L('预览：以上是中文访客看到的样子', 'Preview as a Chinese visitor')) + '</div>';
  }

  /* ------------------------------------------------------- 表单读取与保存 */

  function readForm(root) {
    var out = {};
    function put(path, val) {
      var ps = path.split('.');
      var o = out;
      for (var i = 0; i < ps.length - 1; i++) { o[ps[i]] = o[ps[i]] || {}; o = o[ps[i]]; }
      o[ps[ps.length - 1]] = val;
    }
    Array.prototype.forEach.call(root.querySelectorAll('[data-mnf]'), function (el) {
      put(el.getAttribute('data-mnf'), el.type === 'checkbox' ? !!el.checked : el.value);
    });
    Array.prototype.forEach.call(root.querySelectorAll('[data-mna]'), function (el) {
      put(el.getAttribute('data-mna'), !!el.checked);
    });
    return out;
  }

  /* ---- 事件绑定 ---- */
  function wirePanel(box, reload) {
    if (reload) RELOADS[box.id || ('mn-' + (++SEQ))] = reload;
    if (box.id) RELOADS[box.id] = reload || RELOADS[box.id];
    if (box.__mnWired) return;
    box.__mnWired = true;
    box.addEventListener('click', onClick);
    /* 文案搜索：77 条文案摊开太长，边打边筛。命中的行留在原位、不命中的
       直接 display:none，同时把所有分组展开 —— 折叠状态下搜到却看不见
       等于没搜到。 */
    box.addEventListener('input', function (e) {
      var q = e.target;
      if (!q || q.id !== 'mn-content-q') return;
      var v = String(q.value || '').toLowerCase().trim();
      Array.prototype.forEach.call(box.querySelectorAll('[data-mnc-row]'), function (tr) {
        var key = (tr.getAttribute('data-mnc-row') || '').toLowerCase();
        var txt = (tr.textContent || '').toLowerCase();
        tr.style.display = (!v || key.indexOf(v) >= 0 || txt.indexOf(v) >= 0) ? '' : 'none';
      });
      if (v) {
        Array.prototype.forEach.call(box.querySelectorAll('details.mn-cg'), function (d) { d.open = true; });
      }
    });
  }

  MN.wireAdmin = function (box, reload) { wirePanel(box, reload); };

  function doReload() {
    var fns = Object.keys(RELOADS).map(function (k) { return RELOADS[k]; });
    for (var i = 0; i < fns.length; i++) {
      try { if (typeof fns[i] === 'function') fns[i](); } catch (e) {}
    }
  }

  function onClick(e) {
    var t = e.target;
    if (!t || !t.closest) return;

    var cp = t.closest('[data-mncopy]');
    if (cp) { copy(cp.getAttribute('data-mncopy') || '', cp.getAttribute('data-mncopy-label') || ''); return; }

    var cp2 = t.closest('[data-mncp2]');
    if (cp2) { copy(STORE[cp2.getAttribute('data-mncp2')] || '', '配置'); return; }

    var rl = t.closest('[data-mnreload]');
    if (rl) { doReload(); return; }

    var cl = t.closest('[data-mnoclear]');
    if (cl) {
      var prov = cl.getAttribute('data-mnoclear');
      if (!window.confirm(L('确定把这个提供商的凭据回退到出厂默认？\n\n回退后如果出厂也没有凭据，该登录入口会消失。',
                            'Revert this provider to factory credentials?\n\nIf the factory has none either, the button disappears.'))) return;
      cl.disabled = true;
      api('/api/dash/oauth/clear', { provider: prov }).then(function (r) {
        cl.disabled = false;
        toast(r.ok ? L('已回退。', 'Reverted.') : L('操作失败。', 'Failed.'), !r.ok);
        doReload();
      });
      return;
    }

    var sv = t.closest('[data-mnsave]');
    if (sv) { saveSection(sv); return; }

    /* 清空全部文案覆盖：一次性把 content 段整体替换成空对象。
       服务端对 content 是「整体替换」语义，所以空对象 = 真的清干净，
       不会像深合并那样留下上一次的值。 */
    var cr = t.closest('[data-mncontentreset]');
    if (cr) {
      if (!window.confirm(L('清空全部文案覆盖，前台回到内置默认？',
                            'Clear every copy override and revert to the built-in defaults?'))) return;
      cr.disabled = true;
      api('/api/dash/site', { site: { content: {} } }).then(function (r) {
        cr.disabled = false;
        toast(r.ok ? L('已回到内置默认。', 'Reverted to the built-in defaults.')
                   : L('操作失败。', 'Failed.'), !r.ok);
        if (r.ok) {
          fetchCfg(true).then(function () {
            try { applySiteContent(); renderAll(); } catch (e) {}
          });
          doReload();
        }
      });
      return;
    }

    var gen = t.closest('[data-mngen]');
    if (gen) { genConfig(gen); return; }

    var act = t.closest('[data-mnact]');
    if (act) { runAction(act); return; }
  }

  /* 只保存**当前卡片**：把范围收到最近的 section，避免「改页脚却顺手提交了
     页面上还没保存的品牌输入框」。 */
  function scopeOf(el) { return el.closest('section.site-sec') || el.closest('.dx') || document.body; }

  function saveSection(btn) {
    var kind = btn.getAttribute('data-mnsave');
    var scope = scopeOf(btn);
    btn.disabled = true;
    var label = btn.textContent;
    btn.textContent = L('保存中…', 'Saving…');

    function done(ok, msg) {
      btn.disabled = false;
      btn.textContent = label;
      toast(msg, !ok);
      if (ok) {
        fetchCfg(true).then(function () { applyAnnounce(); applyFooter(); });
        if (kind !== 'announce') doReload();
      }
    }

    /* 邮件模板：与 content 同构的扁平键（zh.subject / en.action …），
       服务端 mail_templates 段要的就是扁平结构，不能过 readForm 转嵌套。 */
    if (kind === 'mail') {
      var mt = {};
      Array.prototype.forEach.call(scope.querySelectorAll('[data-mnt]'), function (el) {
        mt[el.getAttribute('data-mnt')] = el.value;
      });
      api('/api/dash/site', { site: { mail_templates: mt } }).then(function (r) {
        if (r.ok) {
          done(true, L('邮件模板已保存，下一封邮件生效。', 'Templates saved — applies to the next message.'));
        } else {
          done(false, (r.body && (r.body.message_zh || r.body.message)) || L('保存失败。', 'Could not save.'));
        }
      });
      return;
    }

    /* 页面文案走的是扁平键（zh.hero.l1 / en.hero.l1），不是 readForm 的点路径
       嵌套对象 —— 服务端 content 段要的就是扁平结构，转成嵌套反而全被白名单
       过滤掉。所以这里单独收集 data-mnc，不经过 readForm。 */
    if (kind === 'content') {
      var content = {};
      Array.prototype.forEach.call(scope.querySelectorAll('[data-mnc]'), function (el) {
        content[el.getAttribute('data-mnc')] = el.value;
      });
      api('/api/dash/site', { site: { content: content } }).then(function (r) {
        if (r.ok) {
          done(true, L('文案已保存，前台立即生效。', 'Copy saved — the site is updated.'));
        } else {
          done(false, (r.body && (r.body.message_zh || r.body.message)) || L('保存失败。', 'Could not save.'));
        }
      });
      return;
    }

    if (kind === 'oauth') {      var payload = {};
      ['github', 'google'].forEach(function (p) {
        var o = {};
        var cid = scope.querySelector('[data-mno="' + p + '.clientId"]');
        var sec = scope.querySelector('[data-mno="' + p + '.clientSecret"]');
        if (cid) o.clientId = cid.value;
        if (sec && sec.value) o.clientSecret = sec.value;
        if (o.clientId !== undefined || o.clientSecret) payload[p] = o;
      });
      api('/api/dash/oauth', payload).then(function (r) {
        if (r.ok) {
          done(true, L('凭据已保存。', 'Credentials saved.'));
          if (document.getElementById('mn-oauth-form')) doReload();
        } else {
          done(false, (r.body && (r.body.message_zh || r.body.message)) || L('保存失败。', 'Could not save.'));
        }
      });
      return;
    }

    var patch = readForm(scope);
    api('/api/dash/site', { site: patch }).then(function (r) {
      if (r.ok) {
        done(true, kind === 'announce'
          ? L('已保存，前台公告栏已更新。', 'Saved — the announcement bar is now updated.')
          : L('已保存。', 'Saved.'));
      } else {
        done(false, (r.body && (r.body.message_zh || r.body.message)) || L('保存失败。', 'Could not save.'));
      }
    });
  }

  function genConfig(btn) {
    var out = document.getElementById('mn-gen-out');
    if (!out) return;
    btn.disabled = true;
    var label = btn.textContent;
    var old = out.innerHTML;
    out.innerHTML = '<div class="kempty">' + esc(L('生成中…', 'Generating…')) + '</div>';
    api('/api/dash/system/config').then(function (r) {
      btn.disabled = false;
      btn.textContent = label;
      if (!r.ok) {
        out.innerHTML = old || '';
        toast(L('生成失败：请先在「记忆系统」里填好对外网关地址。',
                'Could not generate — set the public gateway URL under Memory system first.'), true);
        return;
      }
      var d = r.body || {};
      var wb = d.workbuddy || {}, hm = d.hermes || {};
      out.innerHTML =
        '<div class="dx-note" style="margin:14px 0 10px">' +
        esc(L(d.note_zh || '', d.note_en || '')) + '</div>' +
        block('WorkBuddy · ' + (wb.path || ''), wb.json || '', 'wb') +
        block('Hermes Desktop · ' + (hm.path || ''), hm.yaml || '', 'hermes') +
        block(L('连通性自检（curl）', 'Connectivity check (curl)'), d.curl || '', 'curl') +
        '<p class="dx-note">' +
        esc(L('把整段 JSON 覆盖进 WorkBuddy 的 mcp.json，Hermes 则把 mcp_servers 与 memory 两段并入 config.yaml，' +
              '然后重启对应的 App。',
              'Paste the JSON over WorkBuddy\u2019s mcp.json; for Hermes merge the mcp_servers and memory blocks into config.yaml, then restart the app.')) +
        '</p>';
      reIcons();
    });
  }

  function runAction(btn) {
    var id = btn.getAttribute('data-mnact');
    var danger = id.indexOf('_apply') > 0;

    if (id === 'probe') {
      btn.disabled = true;
      api('/api/dash/system').then(function () {
        btn.disabled = false;
        if (document.getElementById('mn-health')) loadHealth();
        else { toast(L('体检完成。', 'Health check complete.')); doReload(); }
      });
      return;
    }

    if (danger) {
      var what = id === 'dedup_apply'
        ? L('去重（会合并重复记忆）', 'de-duplication (merges duplicates)')
        : L('合并（会把同义记忆合并成一条）', 'consolidation (merges synonyms)');
      if (!window.confirm(L('即将执行：' + what + '。\n\n这是对记忆库的真实改写。建议先点「导出备份」。\n\n继续？',
                            'About to run: ' + what + '.\n\nThis rewrites the memory store. Export a backup first.\n\nContinue?'))) return;
    }

    btn.disabled = true;
    var label = btn.textContent;
    btn.textContent = L('执行中…', 'Running…');
    var out = document.getElementById('mn-act-out');
    if (out) out.innerHTML = '<div class="kempty">' + esc(L('执行中，请稍候…', 'Working…')) + '</div>';

    api('/api/dash/system/action', { action: id, confirm: 'yes' }).then(function (r) {
      btn.disabled = false;
      btn.textContent = label;
      if (!r.ok) {
        if (out) out.innerHTML = '';
        toast(L('执行失败：', 'Failed: ') +
              ((r.body && (r.body.detail || r.body.error)) || r.status), true);
        return;
      }
      var b = r.body || {};
      var before = (b.before || {}).count;
      var after = (b.after || {}).count;
      toast((b.label || id) + ' ' + L('完成', 'done') +
            (before !== undefined && before !== null ? '（' + before + ' → ' + after + '）' : ''), false);
      if (out) {
        out.innerHTML = '<pre class="mono" style="margin:12px 0 0;padding:12px 14px;' +
          'border-radius:9px;background:rgba(0,0,0,.28);border:1px solid rgba(255,255,255,.09);' +
          'font-size:11.5px;line-height:1.6;overflow:auto;max-height:260px;white-space:pre">' +
          esc((b.label || id) + '  [' + (b.tool || '') + ']\n' +
              (b.dryRun ? '(dry-run — nothing was changed)\n' : '') +
              JSON.stringify(b.result, null, 2).slice(0, 4000)) + '</pre>';
      }
      fetchCfg(true);
      if (document.getElementById('mn-health')) loadHealth();
    });
  }

  /* ---------------------------------------------------------------- 启动 */
  window.MN = MN;
  MN.cfg = function () { return CFG; };
  MN.refresh = function () { return fetchCfg(true).then(function () { applyAnnounce(); applyFooter(); }); };

  function boot() { MN.apply(); MN.handleSSOResult(); }

  /* /api/site 尽早发出：它决定公告栏与 SSO 按钮，越早到首屏跳变越小。 */
  fetchCfg();

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
  window.addEventListener('hashchange', function () {
    MN.handleSSOResult();
    rerenderSoon();
  });
})();

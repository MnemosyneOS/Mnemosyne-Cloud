/* ============================================================================
   Mnemosyne OS — Console v9  (assets/console.js)
   ----------------------------------------------------------------------------
   归零重做，不做"菜单挂着但点进去是空的"那种控制台。三条硬规则：

   1. 每一页都必须有真实数据源。没有就如实说"没有"，不画占位图。
   2. 每一个 8.1.0 的能力都要在界面上有入口（52 个工具全部可填参执行）。
   3. 主题跟随站点（白天 / 夜晚 / 跟随系统），布局用国际通用范式：
      左侧固定导航 + 顶部上下文栏 + 内容区。

   与页面的关系：index.html 暴露 window.MN（api/esc/toast/lang/…），
   这里只消费它，不反向依赖。
   ========================================================================== */
(function () {
  'use strict';

  /* 站点桥：console.js 在 index.html 的主脚本**之前**加载（这样首屏直达
     #/dashboard/overview 也能立刻渲染），所以 window.MN 此刻还不存在。
     因此这里不缓存 MN，而是每次现取 —— 一个 getter，避免时序依赖。 */
  function mn() { return window.MNSite || window.MN || {}; }
  function dz(zh, en) { var m = mn(); return m.lang && m.lang() === 'zh' ? zh : en; }
  function esc(s) { var m = mn(); return m.esc ? m.esc(s) : String(s == null ? '' : s); }
  /* 带超时的 api()。
     为什么必须自己加超时：记忆引擎在容器里，网关一旦半死，服务端那条
     /api/dash/* 会挂到网关超时才回来（十几秒）。前端如果不设上限，
     用户看到的就是"永远转圈" —— 这正是旧控制台被骂"菜单点不动"的成因之一。
     超时后返回一个可识别的失败，页面照常渲染骨架并显式说明"引擎没响应"。 */
  /* 安装命令要按 shell 分开给 —— 2026-10-21 用户实测踩坑：
     Windows PowerShell 5.1 不认 `&&`（那是 CMD 的分隔符），会直接
     ParserError: 标记"&&"不是此版本中的有效语句分隔符；
     它也不认 %TEMP%（那是 CMD 的变量写法），要写 $env:TEMP。
     所以 PowerShell / CMD / macOS·Linux 三套，各给一条能原样粘的。 */
  function shellCmds(installer) {
    return {
      ps: 'curl.exe -fsSL "' + installer + '" -o "$env:TEMP\\mnemo-setup.py"; python "$env:TEMP\\mnemo-setup.py"',
      cmd: 'curl -fsSL "' + installer + '" -o "%TEMP%\\mnemo-setup.py" && python "%TEMP%\\mnemo-setup.py"',
      nix: 'curl -fsSL "' + installer + '" -o /tmp/mnemo-setup.py && python3 /tmp/mnemo-setup.py'
    };
  }

  function api(p, b, timeoutMs) {
    var m = mn();
    if (!m.api) return Promise.resolve({ ok: false, status: 0, body: { __err: 'no api' } });
    return new Promise(function (resolve) {
      var done = false;
      /* 默认 15 秒。演示里的"记忆抽取"要等模型，必须单独放宽（见 postSlow）。 */
      var timer = setTimeout(function () {
        if (done) return;
        done = true;
        MC.degraded = true;
        resolve({ ok: false, status: 0, body: { __timeout: true } });
      }, timeoutMs || 15000);
      m.api(p, b).then(function (r) {
        if (done) return;
        done = true; clearTimeout(timer);
        if (!r || !r.ok) MC.degraded = MC.degraded || false;
        resolve(r || { ok: false, status: 0, body: {} });
      }, function (e) {
        if (done) return;
        done = true; clearTimeout(timer);
        resolve({ ok: false, status: 0, body: { __err: String(e && e.message || e) } });
      });
    });
  }
  function toast(t) { var m = mn(); if (m.toast) m.toast(t); }
  function icons() { var m = mn(); if (m.icons) m.icons(); }
  function sess() { var m = mn(); return (m.session && m.session()) || {}; }
  function isAdmin() {
    /* 角色以服务端 /api/console 的答复为准（MC.isAdmin）。站点的 isAdmin()
       依赖它自己异步加载的状态，控制台首次渲染时往往还没到 —— 那会让管理员
       在「注册用户信息」页被兜回概览，看起来像"权限丢了"。 */
    if (MC.isAdmin !== undefined) return MC.isAdmin;
    var m = mn();
    return !!(m.isAdmin && m.isAdmin());
  }

  function ensureRole() {
    if (MC.rolePromise) return MC.rolePromise;
    MC.rolePromise = api('/api/console').then(function (r) {
      var b = (r && r.ok && r.body) || {};
      MC.isAdmin = !!b.isAdmin;
      MC.me = b.me || {};
      /* 未登录直达 #/dashboard/* 时不能画一个空壳控制台 —— 满屏 401、
         侧栏还显示"未登录"，比直接回登录页更让人困惑。 */
      if (!MC.me || MC.me.signedIn !== true) {
        MC.signedOut = true;
        location.hash = '#/login';
        return false;
      }
      return MC.isAdmin;
    }).catch(function () {
      MC.isAdmin = false;
      return false;
    });
    return MC.rolePromise;
  }
  function zhNow() { var m = mn(); return m.lang ? m.lang() === 'zh' : true; }

  var MC = {
    page: 'overview',
    data: {},
    busy: false,
    view: null,              // 管理员正在查看的用户 {email, ns, name}
    users: null,
    setup: null,
    wizard: { open: false, step: 1, agent: '', cat: '', verify: null, timer: null },
    graph: null,
    ui: { memQ: '', memKind: '', memPage: 1, range: '30', dreamPaths: null }
  };
  window.MCConsole = MC;

  /* ------------------------------------------------------------------ nav */

  var NAV = [
    [{ g: 'start' }, { id: 'overview', zh: '概览', en: 'Overview', ic: 'layout-grid' },
     { id: 'setup', zh: '接入配置', en: 'Setup', ic: 'plug-zap', badge: '1' }],
    [{ g: 'memory' },
     { id: 'memories', zh: '记忆库', en: 'Memories', ic: 'brain' },
     { id: 'graph', zh: '记忆图谱', en: 'Graph', ic: 'share-2' },
     { id: 'entities', zh: '实体', en: 'Entities', ic: 'boxes' },
     { id: 'formation', zh: '记忆运行层', en: 'Formation', ic: 'layers' },
     { id: 'dream', zh: '梦 · 离线巩固', en: 'Dreams', ic: 'moon' }],
    [{ g: 'insight' },
     { id: 'analytics', zh: '使用分析', en: 'Analytics', ic: 'bar-chart-3' },
     { id: 'exports', zh: '导出与迁移', en: 'Export', ic: 'package' }],
    [{ g: 'account' },
     { id: 'billing', zh: '套餐与用量', en: 'Plan & usage', ic: 'credit-card' },
     { id: 'settings', zh: '设置', en: 'Settings', ic: 'settings' }],
    [{ g: 'admin', admin: 1 },
     /* 这两项按需求书的路径暴露成 #/admin/orders 与 #/admin/visitors。
        为什么用 hash 而不是真路径 /admin/orders：Worker 只回源 /api /auth
        /v1 /healthz 四类前缀，其余路径由 GitHub Pages 接管，而 Pages 对不存在
        的路径返回 404（没有 SPA fallback），真路径会直接白屏。 */
     { id: 'orders', zh: '订单管理', en: 'Orders', ic: 'receipt', badge: 'NEW',
       href: '#/admin/orders' },
     { id: 'visitors', zh: '在线用户', en: 'Visitors', ic: 'activity', badge: 'LIVE',
       href: '#/admin/visitors' },
     /* 访问日志：把第一方访客 + Cloudflare 边缘事件合成一张表，分页看历史。
        与「在线用户」的区别：那个只看"现在谁在线"，这个看"谁来过、结果如何"。 */
     { id: 'accesslog', zh: '访问日志', en: 'Access log', ic: 'list', badge: 'NEW',
       href: '#/admin/accesslog' },
     { id: 'demo', zh: '演示 & 测试', en: 'Demo & test', ic: 'presentation', badge: 'NEW' },
     { id: 'users', zh: '注册用户信息', en: 'Users', ic: 'users' },
     { id: 'tools', zh: '工具台（52）', en: 'Tools (52)', ic: 'wrench' },
     { id: 'audit', zh: '审计日志', en: 'Audit', ic: 'scroll-text' }],
    [{ g: 'help' },
     { id: 'docs', zh: '文档', en: 'Docs', ic: 'book-open' },
     { id: 'mcp', zh: 'MCP 接入', en: 'MCP', ic: 'terminal' },
     { id: 'changelog', zh: '更新日志', en: 'Changelog', ic: 'history' }]
  ];

  var GRP = { start: ['开始', 'Start'], memory: ['记忆', 'Memory'], insight: ['洞察', 'Insight'],
              account: ['账户', 'Account'], admin: ['管理', 'Admin'], help: ['帮助', 'Help'] };

  var TITLES = {
    overview: ['概览', 'Overview'], setup: ['接入配置', 'Setup'], memories: ['记忆库', 'Memories'],
    graph: ['记忆图谱', 'Memory graph'], entities: ['实体', 'Entities'],
    formation: ['记忆运行层', 'Formation layer'], dream: ['梦 · 离线巩固', 'Dreams'],
    analytics: ['使用分析', 'Analytics'], exports: ['导出与迁移', 'Export'],
    billing: ['套餐与用量', 'Plan & usage'], settings: ['设置', 'Settings'],
    orders: ['订单管理', 'Orders'], visitors: ['在线用户', 'Visitors'],
    accesslog: ['访问日志', 'Access log'],
    demo: ['演示 & 测试', 'Demo & test'],
    users: ['注册用户信息', 'Registered users'], tools: ['工具台', 'Toolbox'],
    audit: ['审计日志', 'Audit log'], docs: ['文档', 'Docs'], mcp: ['MCP 接入', 'MCP'],
    changelog: ['更新日志', 'Changelog']
  };

  /* -------------------------------------------------------------- helpers */

  function n0(v) { return Number(v || 0).toLocaleString('en-US'); }
  function fmtBytes(n) {
    n = Number(n || 0);
    if (n >= 1073741824) return (n / 1073741824).toFixed(1) + ' GB';
    if (n >= 1048576) return (n / 1048576).toFixed(1) + ' MB';
    if (n >= 1024) return (n / 1024).toFixed(0) + ' KB';
    return n + ' B';
  }
  function ago(s) {
    if (!s) return '—';
    /* epoch 数字串（后端历史字段里有 str(time.time())）也接：
       Date.parse('1792640820') 在多数引擎里是 NaN，会原样返回那串数字。 */
    var str = String(s).trim();
    var t = NaN;
    if (/^\d+(\.\d+)?$/.test(str)) {
      var n = Number(str);
      t = n > 0 && n < 1e11 ? n * 1000 : n;
    } else {
      t = Date.parse(str.replace(' ', 'T'));
    }
    if (isNaN(t)) return String(s);
    var d = Math.floor((Date.now() - t) / 1000);
    if (d < 60) return dz('刚刚', 'just now');
    if (d < 3600) return Math.floor(d / 60) + dz(' 分钟前', 'm ago');
    if (d < 86400) return Math.floor(d / 3600) + dz(' 小时前', 'h ago');
    if (d < 2592000) return Math.floor(d / 86400) + dz(' 天前', 'd ago');
    return String(s).slice(0, 10);
  }
  /* 记忆库/用户详情要的是**确切时间**（"11 小时前"没法核对账）。
     后端给的是 ISO 本地时间（2026-10-20T21:30:00），这里只做格式化。

     2026-10-22 补：纯数字串按 epoch 秒/毫秒转一次。
     用户档案的 `created` 历史上是 str(time.time())（'1792640820.987307'），
     直接切片会原样吐出那串数字。后端已改成发 ISO，这里兜住旧形状。 */
  function fmtTime(v) {
    var s = String(v == null ? '' : v).replace('T', ' ');
    if (!s || s === '—') return '—';
    if (/^\d+(\.\d+)?$/.test(s.trim())) {
      var n = Number(s);
      var d2 = new Date(n > 0 && n < 1e11 ? n * 1000 : n);
      if (!isNaN(d2.getTime())) {
        /* 必须按**本地**时间拼，不能用 toISOString() —— 那个是 UTC，
           在东八区会平白早 8 小时，和 when() 的口径对不上。 */
        var p2 = function (x) { return (x < 10 ? '0' : '') + x; };
        s = d2.getFullYear() + '-' + p2(d2.getMonth() + 1) + '-' + p2(d2.getDate()) +
            ' ' + p2(d2.getHours()) + ':' + p2(d2.getMinutes()) + ':' + p2(d2.getSeconds());
      }
    }
    return s.length >= 16 ? s.slice(0, 16) : s;
  }

  function initials(name) {
    var s = String(name || '?').trim();
    return s ? s.slice(0, 1).toUpperCase() : '?';
  }
  /* POST 必须自己拼 fetch init。
     坑：站点的 api(path, opts) 第二个参数是 **fetch 的 init**，不是 body。
     早先写成 api('/api/dash/dream/run', { paths: [...] }) —— 那个对象被当成
     init，既没有 method 也没有 body，实际发出去的是一个 GET，
     于是「开始一轮」永远只换来一句「执行失败」。所有写操作都走这个函数。 */
  function post(p, body) {
    var m = mn();
    if (!m.api) return Promise.resolve({ ok: false, status: 0, body: {} });
    return api(p, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body || {})
    });
  }

  function get(p, fallback) {
    if (MC.data[p]) return Promise.resolve(MC.data[p]);
    return api(p).then(function (r) {
      var b = (r && r.ok && r.body) || {};
      MC.data[p] = b;
      return b;
    }).catch(function () { return fallback || {}; });
  }
  function bust(p) { delete MC.data[p]; }
  function qs(obj) {
    var out = [];
    Object.keys(obj).forEach(function (k) {
      if (obj[k] !== undefined && obj[k] !== null && obj[k] !== '') {
        out.push(encodeURIComponent(k) + '=' + encodeURIComponent(obj[k]));
      }
    });
    return out.length ? '?' + out.join('&') : '';
  }
  /* 所有数据页都带 ns：管理员切换用户后，整站跟着切 */
  function nsq(extra) {
    var o = extra || {};
    if (MC.view && MC.view.ns) o.ns = MC.view.ns;
    return qs(o);
  }
  function scopeName() {
    return MC.view ? (MC.view.display_name || MC.view.email) : '';
  }

  /* ---------------------------------------------------------------- shell */

  function railHTML() {
    var me = sess();
    var name = (MC.view && (MC.view.display_name || MC.view.email)) ||
               me.display_name || me.name || me.email || dz('未登录', 'Signed out');
    var sub = MC.view ? dz('正在查看该用户', 'Viewing user') :
              (isAdmin() ? dz('站点管理员', 'Site administrator') : dz('成员', 'Member'));
    return '<button class="mc-who" data-act="switch-user" aria-haspopup="true">' +
        '<span class="av">' + (me.avatar ? '<img src="' + esc(me.avatar) + '" alt="">' : esc(initials(name))) + '</span>' +
        '<span class="txt"><span class="line1"><span class="nm">' + esc(name) + '</span>' +
          (isAdmin() ? '<span class="badge-admin">ADMIN</span>' : '') + '</span>' +
          '<span class="sub">' + esc(sub) + '</span></span>' +
        '<svg class="chev" viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><path d="m6 9 6 6 6-6"/></svg>' +
      '</button>' +
      '<div id="mc-switch-slot"></div>' +
      '<nav class="mc-nav">' + navHTML() + '</nav>' +
      '<div class="mc-foot">' + planHTML() + '</div>';
  }

  function navHTML() {
    var admin = isAdmin();
    var out = '';
    /* 分组标记只负责"要不要显示这个组"，它管不了组里的条目。
       早先写成 `if (it.admin && !admin) return;` 只跳过了组标题，
       组里的「注册用户信息 / 工具台 / 审计日志」照样渲染出来 ——
       普通成员看到三个点进去必然 403 的菜单，正是"有菜单、不能用"。
       所以这里用显式下标推进：整组跳过。 */
    NAV.forEach(function (group) {
      var skip = false;
      for (var i = 0; i < group.length; i++) {
        var it = group[i];
        if (it.g) {
          skip = !!(it.admin && !admin);
          if (!skip) out += '<div class="mc-grp">' + esc(GRP[it.g][zhNow() ? 0 : 1]) + '</div>';
          continue;
        }
        if (skip) continue;
        out += '<a class="mc-it' + (MC.page === it.id ? ' on' : '') + '" href="' +
          (it.href || ('#/dashboard/' + it.id)) + '">' +
          '<i data-lucide="' + it.ic + '"></i><span class="lb">' +
          esc(zhNow() ? it.zh : it.en) + '</span>' +
          (it.badge ? '<span class="bdg">' + it.badge + '</span>' : '') + '</a>';
      }
    });
    return out;
  }

  /* 当前订阅层级。**以 billing 的 subscription 为准**（overview 里带），
     旧 users.json 的 plan 字段只在没有订阅信息时兜底 ——
     早前只读 MC.planName（旧五档字段），所以升到 Team 年付后左下角
     还写着「入门版」、条数也停在旧配额（2026-10-23 用户截图指出）。 */
  function tierOf() {
    var s = (MC.overview && MC.overview.subscription) || {};
    return String(s.tier || MC.planName || 'free').toLowerCase();
  }

  function planHTML() {
    var plan = (MC.users && MC.users.me) || {};
    var u = (MC.overview && MC.overview.usage) || {};
    var used = Number(u.memories_total
      || (MC.overview && MC.overview.totals && MC.overview.totals.memories) || 0);
    /* 配额按**订阅层级**算，不写死：升级完还显示旧上限，用户会以为没生效。 */
    var LIM = { free: 500, pro: 20000, team: 200000,
                /* 旧档位保留映射，避免老账号掉到 500 */
                starter: 500, max: 100000, plus: 500000, enterprise: 1000000 };
    var lim = LIM[tierOf()] || 500;
    var pct = Math.min(100, Math.round(used * 100 / lim));
    return '<div class="mc-plan">' +
      '<div class="r1"><b>' + esc(planLabel()) + '</b><span style="margin-left:auto">' + n0(used) + ' / ' + n0(lim) + '</span></div>' +
      '<div class="bar"><i style="width:' + pct + '%"></i></div>' +
      '<div class="r2"><span>' + esc(dz('记忆条数', 'Memories')) + '</span><span>' + pct + '%</span></div>' +
      '<button class="up" data-act="go" data-to="billing">' + esc(dz('升级套餐', 'Upgrade')) + '</button>' +
      '</div>';
  }
  function refreshRail() {
    var f = document.querySelector('.mc-plan');
    if (f) f.outerHTML = planHTML();
  }

  /* 升级/确认之后要重拉 overview 再重画侧栏卡片：
     tier 和记忆条数都在 overview 里，只调 refreshRail() 用的是旧数据 ——
     这正是"升到 Team 年付后左下角还写入门版"的直接原因。 */
  function reloadRail() {
    bust('/api/console/overview');
    api('/api/console/overview').then(function (r) {
      if (r && r.ok && r.body) { MC.overview = r.body; refreshRail(); }
    });
  }

  function planLabel() {
    var p = tierOf();
    return ({ free: dz('免费版', 'Free'), pro: dz('PRO 版', 'Pro'),
              team: dz('TEAM 版', 'Team'),
              /* 旧五档，老账号兜底 */
              starter: dz('入门版', 'Starter'), max: dz('MAX 版', 'Max'),
              plus: dz('PLUS 版', 'Plus'), enterprise: dz('企业版', 'Enterprise')
            })[p] || p;
  }

  var THEME_ICON = {
    light: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
    dark: '<path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9z"/>',
    system: '<rect x="2" y="4" width="20" height="13" rx="2"/><path d="M8 21h8M12 17v4"/>'
  };
  function themeHTML(extra) {
    var cur = document.documentElement.getAttribute('data-theme-pref') || 'system';
    return '<div class="mc-theme' + (extra ? ' ' + extra : '') + '" role="group" aria-label="' +
      esc(dz('主题', 'Theme')) + '">' +
      ['light', 'dark', 'system'].map(function (k) {
        return '<button data-theme-set="' + k + '" class="' + (cur === k ? 'on' : '') +
          '" title="' + k + '" aria-label="' + k + '">' +
          '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" ' +
          'stroke-linecap="round" stroke-linejoin="round">' + THEME_ICON[k] + '</svg></button>';
      }).join('') + '</div>';
  }

  function topHTML() {
    var t = TITLES[MC.page] || ['', ''];
    return '<div class="mc-top">' +
      '<div class="title">' + esc(zhNow() ? t[0] : t[1]) + '</div>' +
      (MC.view ? '<span class="mc-viewns"><i data-lucide="eye" style="width:12px;height:12px"></i>' +
        esc(dz('查看', 'Viewing')) + ' <b>' + esc(scopeName()) + '</b></span>' : '') +
      '<span class="sp"></span>' +
      themeHTML('top') +
      '<div class="mc-lang" role="group" aria-label="Language">' +
        '<button data-act="lang" data-l="zh" class="' + (zhNow() ? 'on' : '') + '">中文</button>' +
        '<button data-act="lang" data-l="en" class="' + (zhNow() ? '' : 'on') + '">EN</button>' +
      '</div>' +
      (MC.page === 'graph' || MC.page === 'memories'
        ? '<label class="mc-search"><i data-lucide="search" style="width:13px;height:13px"></i>' +
          '<input id="mc-q" placeholder="' + esc(dz('搜索记忆、实体…', 'Search memories, entities…')) + '" value="' +
          esc(MC.ui.memQ) + '"></label>' : '') +
      '<a class="mc-ibtn" href="#top" title="' + esc(dz('返回网站', 'Back to site')) + '">' +
        '<i data-lucide="home"></i></a>' +
      '<button class="mc-ibtn" data-act="refresh" title="' + esc(dz('刷新', 'Refresh')) + '">' +
        '<i data-lucide="refresh-cw"></i></button>' +
      '</div>';
  }

  /* --------------------------------------------------------------- router */

  function render(path) {
    var view = document.getElementById('view');
    if (!view) return;
    /* 统一入参形态：路由层传 'dashboard/billing'（无 #），而页面内几处
       调用传的是 '#/dashboard/billing'。以前直接 split('/')[1]，后者会得到
       'dashboard'，于是「刷新」按钮会把任何页面都弹回概览 —— 这里先剥掉
       开头的 '#/'，两种写法都能正确解析。 */
    var norm = String(path || '').replace(/^#\/?/, '');
    var seg = norm.split('?')[0].split('/');
    var rest = seg[1] || seg[0] || 'overview';
    var known = Object.keys(TITLES);
    if (known.indexOf(rest) < 0) rest = 'overview';

    /* 角色未知时先问一次再画：否则管理员直达 /dashboard/users 会被误判成
       成员、静默兜回概览，而 URL 还停在 users —— 最典型的"菜单点不动"。 */
    if (MC.isAdmin === undefined) {
      var v0 = document.getElementById('view');
      if (v0) { v0.hidden = false; v0.innerHTML = '<div style="padding:60px;display:flex;gap:10px;align-items:center;font-size:13px"><span class="mc-spin"></span>加载中…</div>'; }
      var home0 = document.getElementById('home');
      if (home0) home0.classList.add('off');
      ensureRole().then(function () {
        if (MC.signedOut) return;      /* 已跳登录页，不再画壳 */
        render(path);
      });
      return;
    }
    if (!isAdmin() && (rest === 'users' || rest === 'tools' || rest === 'audit'
                       || rest === 'demo' || rest === 'orders'
                       || rest === 'visitors')) rest = 'overview';

    document.body.classList.add('dash');
    var home = document.getElementById('home');
    if (home) home.classList.add('off');
    view.hidden = false;
    document.title = dz('Mnemosyne OS SaaS', 'Mnemosyne OS SaaS') + ' — Mnemosyne OS';

    var first = !document.getElementById('mc-body');
    MC.page = rest;
    view.innerHTML = '<div class="mc">' +
      '<aside class="mc-rail">' + railHTML() + '</aside>' +
      '<div class="mc-main">' + topHTML() + '<div class="mc-body"><div class="mc-wrap" id="mc-body"></div></div></div>' +
      '</div>';
    icons();
    paint();

    if (first) ensureContext().then(function () {
      refreshRail();
      /* 首次接入向导对**所有**账号强制弹出 —— 这是产品的主路径：
         注册 → 进控制台 → 立刻把 Agent 接上 → 看到自己的记忆。
         管理员与成员没有区别；只有用户自己点「稍后再说」才跳过本次会话。 */
      if (!MC.setup) return;
      if (!MC.setup.done && !sessionStorage.getItem('mc-wizard-skip')) {
        openWizard();
      }
    });
  }

  function ensureContext() {
    var jobs = [];
    /* 侧栏配额卡要在任何页面都显示真实条数。这里先取一次 30 天分析
       （URL 与概览页一致，会命中同一份缓存，不产生第二次请求）。 */
    jobs.push(get('/api/dash/analytics' + nsq({ days: 30 })).then(function (d) {
      MC.overview = d;
    }));
    jobs.push(get('/api/dash/setup').then(function (d) {
      MC.setup = d;
      /* 套餐名从服务端取：侧栏配额卡与「套餐与用量」页必须说同一件事，
         否则用户刚升级完，侧栏还写着「入门版」。 */
      if (d && d.plan) MC.planName = d.plan;
    }));
    if (isAdmin()) {
      jobs.push(get('/api/dash/users').then(function (d) { MC.users = d; }));
    }
    return Promise.all(jobs).catch(function () {});
  }

  function body() { return document.getElementById('mc-body'); }

  function paint() {
    var el = body();
    if (!el) return;
    var fn = PAGES[MC.page];
    if (!fn) { el.innerHTML = '<div class="mc-empty"><h3>404</h3></div>'; return; }
    try { fn(el); } catch (e) {
      el.innerHTML = '<div class="mc-note bad">' + esc(String(e && e.message || e)) + '</div>';
    }
    icons();
  }

  function degradedNote() {
    if (!MC.degraded) return '';
    return '<div class="mc-note warn" style="margin-bottom:12px">' + esc(dz(
      '记忆引擎响应超时，下面的数字可能不完整。点右上角刷新重试；若持续如此，说明容器里的引擎没起来。',
      'The memory engine timed out; numbers below may be incomplete. Hit refresh.')) + '</div>';
  }

  function head(title, sub, right) {
    return degradedNote() + '<div class="mc-head"><div class="grow"><h1 class="mc-h1">' + esc(title) + '</h1>' +
      (sub ? '<p class="mc-p">' + esc(sub) + '</p>' : '') + '</div>' +
      (right || '') + '</div>';
  }

  function loading(text) {
    return '<div class="mc-loading"><span class="mc-spin"></span>' +
      esc(text || dz('加载中…', 'Loading…')) + '</div>';
  }

  function empty(icon, title, text, action) {
    return '<div class="mc-empty"><div class="ic"><i data-lucide="' + icon + '"></i></div>' +
      '<h3>' + esc(title) + '</h3><p>' + esc(text) + '</p>' + (action || '') + '</div>';
  }

  /* ---------------------------------------------------------------- pages */

  var PAGES = {};

  /* ---- 概览 ------------------------------------------------------------- */
  PAGES.overview = function (el) {
    el.innerHTML = head(dz('概览', 'Overview'),
      dz('你的记忆系统现在的样子：写入了多少、被召回多少、接入了哪些 Agent。',
         'What your memory looks like right now.'),
      '<button class="mc-btn" data-act="go" data-to="dream"><i data-lucide="moon"></i>' +
      esc(dz('跑一轮巩固', 'Run consolidation')) + '</button>') + loading();

    Promise.all([
      get('/api/dash/analytics' + nsq({ days: 30 })),
      get('/api/dash/setup'),
      get('/api/dash/dream' + nsq())
    ]).then(function (r) {
      if (MC.page !== 'overview') return;
      var a = r[0] || {}, s = r[1] || {}, d = r[2] || {};
      MC.overview = a;
      /* 侧栏的配额条是在数据到达之前画的（那时只有 0）。这里补一次，
         否则概览说 12 条、侧栏说 0/500，用户会以为两个数字有一个是错的。 */
      refreshRail();
      var t = a.totals || {};
      var pv = d.preview || {};
      var series = a.series || [];
      var maxAdd = Math.max(1, Math.max.apply(null, series.map(function (x) { return x.added; }).concat([1])));
      /* 用像素高度而不是百分比：柱子的父级是 flex 项，没有确定高度，
         height:60% 会解析成 0 —— 实测就是"一排横虚线"，看着像图表坏了。 */
      var spark = '<div class="mc-spark">' + series.map(function (x) {
        return '<i style="height:' + Math.max(2, Math.round(x.added * 52 / maxAdd)) + 'px" title="' +
          x.day + ': ' + x.added + '"></i>';
      }).join('') + '</div>';

      el.innerHTML = head(dz('概览', 'Overview'),
        dz('你的记忆系统现在的样子：写入了多少、被召回多少、接入了哪些 Agent。',
           'What your memory looks like right now.'),
        '<button class="mc-btn" data-act="go" data-to="dream"><i data-lucide="moon"></i>' +
        esc(dz('跑一轮巩固', 'Run consolidation')) + '</button>') +

        '<div class="mc-grid mc-g4">' +
          kpi(dz('记忆总数', 'Memories'), n0(t.memories), dz('活跃 ', 'active ') + n0(t.active), 'brain') +
          kpi(dz('近 30 天新增', 'Added (30d)'), n0(series.reduce(function (s2, x) { return s2 + x.added; }, 0)),
              dz('逐日分布见下', 'see the chart below'), 'plus-circle') +
          kpi(dz('召回次数', 'Retrievals'), n0(series.reduce(function (s2, x) { return s2 + x.recalled; }, 0)),
              dz('来自引擎访问计数', 'from engine access counts'), 'search') +
          kpi(dz('估算节省 Token', 'Tokens saved (est.)'), n0(t.tokens_saved_est),
              dz('相对全量注入', 'vs. full-context injection'), 'zap') +
        '</div>' +

        '<div class="mc-grid mc-g2" style="margin-top:12px">' +
          '<div class="mc-card pad"><div class="mc-h2" style="margin-top:0">' +
            esc(dz('写入节奏（近 30 天）', 'Write rhythm (30d)')) + '</div>' + spark +
            '<div class="mc-row" style="justify-content:space-between;margin-top:8px">' +
              '<span class="mc-note" style="border:0;background:none;padding:0">' + esc(series[0] ? series[0].day : '') + '</span>' +
              '<span class="mc-note" style="border:0;background:none;padding:0">' + esc(series[series.length - 1] ? series[series.length - 1].day : '') + '</span>' +
            '</div></div>' +
          '<div class="mc-card pad"><div class="mc-h2" style="margin-top:0">' +
            esc(dz('接入状态', 'Connection')) + '</div>' + connectRows(s) + '</div>' +
        '</div>' +

        '<div class="mc-grid mc-g3" style="margin-top:12px">' +
          '<div class="mc-card pad"><div class="mc-h2" style="margin-top:0">' + esc(dz('类型分布', 'Types')) + '</div>' +
            bars(a.types || {}) + '</div>' +
          '<div class="mc-card pad"><div class="mc-h2" style="margin-top:0">' + esc(dz('高频标签', 'Top tags')) + '</div>' +
            tagsCloud(a.tags || []) + '</div>' +
          '<div class="mc-card pad"><div class="mc-h2" style="margin-top:0">' + esc(dz('巩固待办', 'Consolidation queue')) + '</div>' +
            '<div class="mc-kv"><span class="k">' + esc(dz('可合并', 'Mergeable')) + '</span><span class="v">' + n0(pv.mergeable) + '</span></div>' +
            '<div class="mc-kv"><span class="k">' + esc(dz('重复条目', 'Duplicates')) + '</span><span class="v">' + n0(pv.duplicates) + '</span></div>' +
            '<div class="mc-kv"><span class="k">' + esc(dz('低置信', 'Low confidence')) + '</span><span class="v">' + n0(pv.low_confidence) + '</span></div>' +
            '<div class="mc-kv"><span class="k">' + esc(dz('技能类', 'Skills')) + '</span><span class="v">' + n0(pv.skills) + '</span></div>' +
            '<button class="mc-btn sm" style="margin-top:10px" data-act="go" data-to="dream">' +
              esc(dz('去处理', 'Review')) + '</button></div>' +
        '</div>';
      icons();
    });
  };

  function kpi(k, v, d, ic) {
    return '<div class="mc-card mc-kpi"><div class="k"><i data-lucide="' + ic +
      '" style="width:13px;height:13px"></i>' + esc(k) + '</div>' +
      '<div class="v">' + esc(v) + '</div><div class="d">' + esc(d || '') + '</div></div>';
  }

  function connectRows(s) {
    if (!s || !s.mcp_url) return '<div class="mc-note">' + esc(dz('读取失败', 'Failed to load')) + '</div>';
    var done = !!s.done;
    return '<div class="mc-kv"><span class="k">' + esc(dz('状态', 'Status')) + '</span><span class="v">' +
        (done ? '<span class="mc-pill ok"><i></i>' + esc(dz('已接通', 'Connected')) + '</span>'
              : '<span class="mc-pill warn"><i></i>' + esc(dz('待配置', 'Not configured')) + '</span>') + '</span></div>' +
      '<div class="mc-kv"><span class="k">' + esc(dz('Agent', 'Agent')) + '</span><span class="v">' +
        esc(s.agent || '—') + '</span></div>' +
      '<div class="mc-kv"><span class="k">' + esc(dz('命名空间', 'Namespace')) + '</span><span class="v">' +
        esc(s.namespace || '—') + '</span></div>' +
      '<div class="mc-kv"><span class="k">' + esc(dz('验证时间', 'Verified')) + '</span><span class="v">' +
        esc(s.verified_at ? ago(s.verified_at) : '—') + '</span></div>' +
      '<button class="mc-btn sm" style="margin-top:10px" data-act="go" data-to="setup">' +
        esc(done ? dz('查看配置', 'Review setup') : dz('开始配置', 'Set up now')) + '</button>';
  }

  function bars(obj) {
    var keys = Object.keys(obj || {});
    if (!keys.length) return '<div class="mc-note">' + esc(dz('还没有数据', 'No data yet')) + '</div>';
    var max = Math.max.apply(null, keys.map(function (k) { return obj[k]; }));
    return keys.map(function (k) {
      return '<div style="display:flex;align-items:center;gap:8px;padding:4px 0">' +
        '<span style="width:74px;font-size:11.5px;color:var(--fg2)">' + esc(k) + '</span>' +
        '<span class="mc-bar" style="flex:1"><i style="width:' + Math.round(obj[k] * 100 / max) + '%"></i></span>' +
        '<span style="width:32px;text-align:right;font-size:11px;font-variant-numeric:tabular-nums">' + n0(obj[k]) + '</span>' +
        '</div>';
    }).join('');
  }

  function tagsCloud(tags) {
    if (!tags.length) return '<div class="mc-note">' + esc(dz('还没有标签', 'No tags yet')) + '</div>';
    return tags.slice(0, 18).map(function (t) {
      return '<span class="mc-tag" style="margin-bottom:5px">' + esc(t.tag) +
        ' <b style="color:var(--fg3);font-weight:500">' + t.n + '</b></span>';
    }).join('');
  }

  /* ---- 接入配置 --------------------------------------------------------- */
  PAGES.setup = function (el) {
    el.innerHTML = head(dz('接入配置', 'Setup'),
      dz('选你的 Agent，复制一条命令，剩下的它自己做完 —— 包括验证。',
         'Pick your agent, copy one command, and it does the rest — including verification.'),
      '<button class="mc-btn pri" data-act="wizard"><i data-lucide="wand-2"></i>' +
      esc(dz('打开配置向导', 'Open the wizard')) + '</button>') + loading();

    Promise.all([get('/api/dash/setup'), get('/api/dash/agents')]).then(function (r) {
      if (MC.page !== 'setup') return;
      var s = r[0] || {}, ag = r[1] || {};
      MC.setup = s;
      MC.agents = ag;
      /* 不用 `irm ... | python -` 的原因有两个，都会让中文用户直接报错：
         ① Windows 上 `python -` 按控制台代码页（中文系统 cp936）读 stdin，
            脚本里的 UTF-8 字节会被解错 → SyntaxError；
         ② 老客户端对未知 charset 的文本会退回 ISO-8859-1 解码。
         改成「先落盘、再执行」，两个坑一起绕开；脚本本身也已做成纯 ASCII。 */
      var C = shellCmds(s.installer);
      var winCmd = C.ps, nixCmd = C.nix;
      el.innerHTML = head(dz('接入配置', 'Setup'),
        dz('选你的 Agent，复制一条命令，剩下的它自己做完 —— 包括验证。',
           'Pick your agent, copy one command, and it does the rest — including verification.'),
        '<button class="mc-btn pri" data-act="wizard"><i data-lucide="wand-2"></i>' +
        esc(dz('打开配置向导', 'Open the wizard')) + '</button>') +

        '<div class="mc-grid mc-g2">' +
          '<div class="mc-card pad">' +
            '<div class="mc-h2" style="margin-top:0">' + esc(dz('一条命令搞定', 'One command')) + '</div>' +
            '<p class="mc-p" style="margin-bottom:10px">' + esc(dz(
              '这段命令已经带上了你的密钥。它会：检测本机 Agent → 写入 MCP 配置 → 真连一次 → 写一条冒烟记忆。',
              'The command already carries your key. It detects local agents, writes the MCP config, tests the link and writes a smoke memory.')) + '</p>' +
            '<div class="mc-lab">Windows · PowerShell（推荐，Win+X 里的那个）</div>' +
            '<div class="mc-code">' + esc(C.ps) + '<span class="cp" data-copy="' + esc(C.ps) + '">' + esc(dz('复制', 'Copy')) + '</span></div>' +
            '<div class="mc-lab" style="margin-top:10px">Windows · 命令提示符（CMD）</div>' +
            '<div class="mc-code">' + esc(C.cmd) + '<span class="cp" data-copy="' + esc(C.cmd) + '">' + esc(dz('复制', 'Copy')) + '</span></div>' +
            '<div class="mc-lab" style="margin-top:10px">macOS / Linux</div>' +
            '<div class="mc-code">' + esc(nixCmd) + '<span class="cp" data-copy="' + esc(nixCmd) + '">' + esc(dz('复制', 'Copy')) + '</span></div>' +
            '<div class="mc-note" style="margin-top:10px">' + esc(dz(
              '没有 Python？先装一个（勾选 Add to PATH）。也可以走右边的「手动配置」，只填两行。',
              'No Python? Install it first. Or use the manual setup on the right — just two fields.')) + '</div>' +
          '</div>' +
          '<div class="mc-card pad">' +
            '<div class="mc-h2" style="margin-top:0">' + esc(dz('手动配置', 'Manual')) + '</div>' +
            '<div class="mc-lab">MCP 地址</div>' +
            '<div class="mc-code">' + esc(s.mcp_url) + '<span class="cp" data-copy="' + esc(s.mcp_url) + '">' + esc(dz('复制', 'Copy')) + '</span></div>' +
            '<div class="mc-lab" style="margin-top:10px">Authorization 头</div>' +
            '<div class="mc-code">Authorization: Bearer ' + esc(s.key) +
              '<span class="cp" data-copy="' + esc('Authorization: Bearer ' + s.key) + '">' + esc(dz('复制', 'Copy')) + '</span></div>' +
            '<div class="mc-lab" style="margin-top:10px">JSON 片段（多数客户端通用）</div>' +
            '<div class="mc-code">' + esc(JSON.stringify({
              mcpServers: { mnemosyne: { type: 'http', url: s.mcp_url,
                headers: { Authorization: 'Bearer ' + (s.key || '') } } }
            }, null, 2)) + '<span class="cp" data-copy="' + esc(JSON.stringify({
              mcpServers: { mnemosyne: { type: 'http', url: s.mcp_url,
                headers: { Authorization: 'Bearer ' + (s.key || '') } } }
            }, null, 2)) + '">' + esc(dz('复制', 'Copy')) + '</span></div>' +
            '<div class="mc-note warn" style="margin-top:10px">' + esc(dz(
              '每次打开本页都会重新签发一把密钥，旧的那把立即失效 —— 复制后请直接填进 Agent，别存草稿箱。',
              'A fresh key is issued every time you open this page and the previous one stops working. Paste it straight into your agent.')) + '</div>' +
          '</div>' +
        '</div>' +

        '<div class="mc-card pad" style="margin-top:12px">' +
          '<div class="mc-h2" style="margin-top:0">' + esc(dz('配置成功检测', 'Verification')) + '</div>' +
          '<div id="mc-verify">' + verifyHTML(MC.setup.verified_at ? null : null) + '</div>' +
          '<button class="mc-btn pri" style="margin-top:10px" data-act="verify">' +
            '<i data-lucide="shield-check"></i>' + esc(dz('检测配置', 'Check now')) + '</button>' +
        '</div>' +

        '<div class="mc-h2">' + esc(dz('支持 ' + (ag.total || 0) + ' 个 Agent', 'Supports ' + (ag.total || 0) + ' agents')) +
          '<span class="hint">' + esc(dz('其中 ' + (ag.auto || 0) + ' 个可全自动写入配置', (ag.auto || 0) + ' can be configured automatically')) + '</span></div>' +
        '<div class="mc-card pad">' + agentGrid(ag, s.agent, true) + '</div>';
      icons();
    });
  };

  function verifyHTML(v) {
    if (!v) return '<div class="mc-note">' + esc(dz('点下面的按钮，用真实写入来证明链路通了。',
      'Press the button — we prove the link with a real write, not a checkbox.')) + '</div>';
    var rows = (v.checks || []).map(function (c) {
      return '<div class="mc-li"><span class="mc-dot ' + (c.ok ? 'ok' : 'bad') + '"></span>' +
        '<span class="grow"><span class="t">' + esc(zhNow() ? c.zh : c.en) + '</span>' +
        '<span class="s">' + esc(c.detail || '') + '</span></span>' +
        '<span class="mc-pill ' + (c.ok ? 'ok' : 'bad') + '"><i></i>' + esc(c.ok ? dz('通过', 'OK') : dz('未通过', 'Fail')) + '</span></div>';
    }).join('');
    return (v.verified ? '<div class="mc-note ok">' + esc(dz('链路已通，记忆正在写入。', 'Connected — memories are flowing.')) + '</div>'
                       : '<div class="mc-note warn">' + esc(dz('还没检测到写入。跑完那条命令再点一次。', 'No write detected yet. Run the command, then check again.')) + '</div>') +
      '<div class="mc-list" style="margin-top:8px">' + rows + '</div>';
  }

  function agentGrid(ag, picked, compact) {
    var cats = ag.cats || [];
    var list = ag.agents || [];
    var out = '';
    cats.forEach(function (c) {
      var items = list.filter(function (a) { return a.cat === c.key; });
      if (!items.length) return;
      out += '<div class="mc-cat">' + esc(zhNow() ? c.zh : c.en) + '</div>' +
        '<div class="mc-agents">' + items.map(function (a) {
          var on = picked === a.id ? ' on' : '';
          return '<button class="mc-agent' + on + '" data-agent="' + esc(a.id) + '">' +
            '<span class="n">' + esc(zhNow() ? a.zh : a.name) + '</span>' +
            '<span class="t">' + esc(a.auto ? dz('可自动配置', 'Auto') : dz('两步手动', '2 clicks')) + '</span>' +
            '<svg class="ok" viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2.4"><path d="m5 13 4 4L19 7"/></svg>' +
            '</button>';
        }).join('') + '</div>';
    });
    return out;
  }

  /* ---- 记忆库 ----------------------------------------------------------- */
  PAGES.memories = function (el) {
    el.innerHTML = head(dz('记忆库', 'Memories'),
      dz('每一条记忆都是一句可追溯的话。点开看全文、标签、置信度。',
         'Every memory is a traceable statement. Open one for the full text.')) + loading();
    var q = MC.ui.memQ || '', kind = MC.ui.memKind || '', page = MC.ui.memPage || 1;
    var url = '/api/dash/memories' + nsq({ q: q, kind: kind, page: page, size: 50 });
    api(url).then(function (r) {
      if (MC.page !== 'memories') return;
      var d = (r && r.ok && r.body) || {};
      var items = d.items || [];
      el.innerHTML = head(dz('记忆库', 'Memories'),
        dz('每一条记忆都是一句可追溯的话。点开看全文、标签、置信度。',
           'Every memory is a traceable statement. Open one for the full text.'),
        '<span class="mc-note" style="border:0;background:none">' +
          esc(dz('共 ' + n0(d.total) + ' 条', n0(d.total) + ' total')) + '</span>') +
        '<div class="mc-row" style="margin-bottom:12px">' +
          '<input class="mc-inp" id="mc-memq" style="flex:1;max-width:320px" placeholder="' +
            esc(dz('搜索内容或标签…', 'Search text or tags…')) + '" value="' + esc(q) + '">' +
          '<select class="mc-sel" id="mc-memkind">' +
            ['', 'semantic', 'episodic', 'procedural', 'working', 'resource',
             'anti_pattern', 'meta', 'relational'].map(function (k) {
              return '<option value="' + k + '"' + (k === kind ? ' selected' : '') + '>' +
                esc(k || dz('全部类型', 'All types')) + '</option>';
            }).join('') + '</select>' +
        '</div>' +
        (items.length ? '<div class="mc-card"><div class="mc-scroll"><table class="mc-tbl">' +
          '<thead><tr><th>' + esc(dz('内容', 'Content')) + '</th><th>' + esc(dz('类型', 'Type')) +
          '</th><th>' + esc(dz('标签', 'Tags')) + '</th><th>' + esc(dz('写入', 'Written')) +
          '</th><th class="num">' + esc(dz('置信度', 'Confidence')) +
          '</th><th class="num">' + esc(dz('召回', 'Hits')) + '</th></tr></thead><tbody>' +
          items.map(function (m) {
            return '<tr data-mem="' + esc(m.id) + '" style="cursor:pointer">' +
              '<td style="max-width:520px"><div style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' +
                esc(m.excerpt) + '</div></td>' +
              '<td><span class="mc-tag pri">' + esc(m.kind || '—') + '</span></td>' +
              '<td>' + (m.tags || []).slice(0, 3).map(function (t) {
                return '<span class="mc-tag">' + esc(t) + '</span>'; }).join('') + '</td>' +
              '<td style="white-space:nowrap;color:var(--fg3);font-variant-numeric:tabular-nums">' +
                esc(fmtTime(m.created)) + '</td>' +
              '<td class="num">' + esc(confCell(m)) + '</td>' +
              '<td class="num">' + n0(m.accessed) + '</td></tr>';
          }).join('') + '</tbody></table></div></div>' +
          pager(d) +
          '<div id="mc-memdetail" style="margin-top:12px"></div>'
          : empty('brain', dz('还没有记忆', 'No memories yet'),
                  dz('接入 Agent 后，它写下的每一条都会出现在这里。',
                     'Once an agent is connected, everything it writes shows up here.'),
                  '<button class="mc-btn pri" style="margin-top:12px" data-act="go" data-to="setup">' +
                  esc(dz('去接入', 'Connect an agent')) + '</button>'));
      icons();
    });
  };

  function pager(d) {
    if (!d.pages || d.pages <= 1) return '';
    var p = d.page || 1;
    return '<div class="mc-row" style="justify-content:center;margin-top:12px">' +
      '<button class="mc-btn sm" data-act="mempage" data-p="' + (p - 1) + '"' + (p <= 1 ? ' disabled' : '') + '>‹</button>' +
      '<span class="mc-note" style="border:0;background:none">' + p + ' / ' + d.pages + '</span>' +
      '<button class="mc-btn sm" data-act="mempage" data-p="' + (p + 1) + '"' + (p >= d.pages ? ' disabled' : '') + '>›</button></div>';
  }

  function openMemory(id) {
    var box = document.getElementById('mc-memdetail');
    if (!box) return;
    box.innerHTML = '<div class="mc-card pad">' + loading() + '</div>';
    api('/api/dash/memory/' + encodeURIComponent(id) + nsq()).then(function (r) {
      var m = ((r && r.ok && r.body) || {}).memory || {};
      if (!m.id) { box.innerHTML = '<div class="mc-note bad">' + esc(dz('读取失败', 'Failed')) + '</div>'; return; }
      box.innerHTML = '<div class="mc-card pad">' +
        '<div class="mc-row" style="justify-content:space-between;margin-bottom:8px">' +
          '<div class="mc-row"><span class="mc-tag pri">' + esc(m.mtype || '') + '</span>' +
          (m.tags || []).map(function (t) { return '<span class="mc-tag">' + esc(t) + '</span>'; }).join('') + '</div>' +
          '<button class="mc-btn sm" data-act="close-mem">' + esc(dz('关闭', 'Close')) + '</button>' +
        '</div>' +
        '<div style="font-size:13px;line-height:1.85;white-space:pre-wrap">' + esc(m.content || '') + '</div>' +
        '<div class="mc-grid mc-g4" style="margin-top:14px">' +
          '<div class="mc-kv"><span class="k">ID</span><span class="v" style="font-family:monospace">' + esc(String(m.id).slice(0, 12)) + '</span></div>' +
          '<div class="mc-kv"><span class="k">' + esc(dz('置信度', 'Confidence')) + '</span><span class="v">' +
            Math.round((m.confidence || 0) * 100) + '%</span></div>' +
          '<div class="mc-kv"><span class="k">' + esc(dz('重要性', 'Importance')) + '</span><span class="v">' +
            esc(m.importance || '—') + '/5</span></div>' +
          '<div class="mc-kv"><span class="k">' + esc(dz('召回', 'Hits')) + '</span><span class="v">' +
            n0(m.access_count) + '</span></div>' +
        '</div>' +
        '<div class="mc-note" style="margin-top:10px">' + esc(dz('写入 ', 'Written ') +
          fmtTime(m.created_at) + ' · ' + (m.status || '')) + '</div>' +
        '</div>';
    });
  }

  /* ---- 图谱 ------------------------------------------------------------- */
  PAGES.graph = function (el) {
    el.innerHTML = head(dz('记忆图谱', 'Memory graph'),
      dz('记忆、实体、标签、技能四类节点。悬停看内容，点击看关系，滚轮缩放。',
         'Memories, entities, tags and skills. Hover for content, click for relations.'),
      '<button class="mc-btn" data-act="graph-fit"><i data-lucide="maximize-2"></i>' +
      esc(dz('适应窗口', 'Fit')) + '</button>') +
      '<div id="mc-graph-host">' + loading(dz('正在建图…', 'Building the graph…')) + '</div>';
    api('/api/dash/graph' + nsq({ limit: 800 })).then(function (r) {
      if (MC.page !== 'graph') return;
      var d = (r && r.ok && r.body) || {};
      var host = document.getElementById('mc-graph-host');
      if (!host) return;
      if (!(d.nodes || []).length) {
        host.innerHTML = '<div class="mc-card">' + empty('share-2', dz('图上还没有节点', 'No nodes yet'),
          dz('记忆写入后，实体与标签会自动连成网。先去接入 Agent 或写一条记忆。',
             'Once memories exist, entities and tags link up automatically.'),
          '<button class="mc-btn pri" style="margin-top:12px" data-act="go" data-to="setup">' +
          esc(dz('去接入', 'Connect')) + '</button>') + '</div>';
        icons();
        return;
      }
      host.innerHTML = '';
      if (MC.graph && MC.graph.destroy) MC.graph.destroy();
      MC.graph = new window.MCGraph(host, {});
      MC.graph.setData(d);
    });
  };

  /* ---- 实体 ------------------------------------------------------------- */
  PAGES.entities = function (el) {
    el.innerHTML = head(dz('实体', 'Entities'),
      dz('从记忆里抽出来的名词。出现次数越多，说明它在你工作里的权重越高。',
         'Nouns pulled out of your memories, ranked by how often they recur.')) + loading();
    api('/api/dash/entities' + nsq()).then(function (r) {
      if (MC.page !== 'entities') return;
      var d = (r && r.ok && r.body) || {};
      var items = d.items || [];
      el.innerHTML = head(dz('实体', 'Entities'),
        dz('从记忆里抽出来的名词。出现次数越多，说明它在你工作里的权重越高。',
           'Nouns pulled out of your memories, ranked by how often they recur.'),
        '<span class="mc-note" style="border:0;background:none">' + n0(d.total) + ' ' +
        esc(dz('个实体', 'entities')) + '</span>') +
        (items.length ? '<div class="mc-grid mc-g3">' + items.slice(0, 60).map(function (it) {
          return '<div class="mc-card pad">' +
            '<div class="mc-row" style="justify-content:space-between">' +
              '<b style="font-size:13px">' + esc(it.name) + '</b>' +
              '<span class="mc-tag pri">' + it.n + '</span></div>' +
            '<div class="mc-note" style="margin-top:8px;border:0;background:none;padding:0;font-size:11px">' +
              esc(dz('最近 ', 'last ') + (it.last ? it.last.slice(0, 10) : '—')) + '</div>' +
            (it.samples || []).map(function (s) {
              return '<div style="font-size:11.5px;color:var(--fg3);margin-top:5px;overflow:hidden;' +
                'text-overflow:ellipsis;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical">' +
                esc(s.text) + '</div>';
            }).join('') + '</div>';
        }).join('') + '</div>'
        : empty('boxes', dz('还没有实体', 'No entities yet'),
                dz('实体来自记忆正文。写入几条带名词的记忆就能看到。', 'Entities come from memory text.')));
      icons();
    });
  };

  /* ---- 记忆运行层 ------------------------------------------------------- */
  var CLASS_ZH = { semantic: '语义', episodic: '情景', procedural: '程序性', working: '工作',
                   resource: '资源', anti_pattern: '负记忆', meta: '元记忆', relational: '关系' };
  PAGES.formation = function (el) {
    el.innerHTML = head(dz('记忆运行层', 'Formation layer'),
      dz('8.1.0 的八类记忆、画像卡与 13 项诚实指标。数据不足时它说"不足"，不填 0。',
         'The eight classes, the profile card and 13 honest metrics.')) + loading();
    api('/api/dash/formation' + nsq()).then(function (r) {
      if (MC.page !== 'formation') return;
      var d = (r && r.ok && r.body) || {};
      var dist = d.dist || {};
      var total = Object.keys(dist).reduce(function (s, k) { return s + dist[k]; }, 0) || 1;
      var prof = d.profile || {};
      var met = d.metrics || {};
      var profText = prof.text || prof.card || prof.profile || '';
      el.innerHTML = head(dz('记忆运行层', 'Formation layer'),
        dz('8.1.0 的八类记忆、画像卡与 13 项诚实指标。数据不足时它说"不足"，不填 0。',
           'The eight classes, the profile card and 13 honest metrics.')) +
        '<div class="mc-grid mc-g2">' +
          '<div class="mc-card pad"><div class="mc-h2" style="margin-top:0">' +
            esc(dz('八类分布', 'Eight classes')) + '</div>' +
            Object.keys(CLASS_ZH).map(function (k) {
              var v = dist[k] || 0;
              return '<div style="display:flex;align-items:center;gap:8px;padding:4px 0">' +
                '<span style="width:64px;font-size:11.5px;color:var(--fg2)">' + CLASS_ZH[k] + '</span>' +
                '<span class="mc-bar" style="flex:1"><i style="width:' + Math.round(v * 100 / total) + '%"></i></span>' +
                '<span style="width:34px;text-align:right;font-size:11px">' + v + '</span></div>';
            }).join('') + '</div>' +
          '<div class="mc-card pad"><div class="mc-h2" style="margin-top:0">' +
            esc(dz('用户画像卡', 'Profile card')) + '</div>' +
            (profText ? '<div style="font-size:12px;line-height:1.85;white-space:pre-wrap;max-height:300px;overflow:auto">' +
              esc(profText) + '</div>'
              : '<div class="mc-note warn">' + esc(dz('画像还没形成（需要更多记忆）。' +
                  (prof.__err ? ' 工具返回：' + prof.__err : ''), 'Profile not formed yet.')) + '</div>') +
          '</div>' +
        '</div>' +
        '<div class="mc-card pad" style="margin-top:12px">' +
          '<div class="mc-h2" style="margin-top:0">' + esc(dz('13 项指标', '13 metrics')) + '</div>' +
          metricsHTML(met) + '</div>';
      icons();
    });
  };

  function metricsHTML(met) {
    var src = met.metrics || met.items || met;
    if (!src || typeof src !== 'object' || src.__err) {
      return '<div class="mc-note warn">' + esc(dz('指标接口不可用：' +
        ((met && met.__err) || '—'), 'Metrics unavailable')) + '</div>';
    }
    var keys = Object.keys(src).filter(function (k) {
      return src[k] && typeof src[k] === 'object' && ('value' in src[k] || 'status' in src[k]);
    });
    if (!keys.length) return '<div class="mc-note">' + esc(dz('还没有指标数据', 'No metrics yet')) + '</div>';
    return '<div class="mc-grid mc-g3">' + keys.map(function (k) {
      var m = src[k];
      var v = m.value;
      var insufficient = m.status === 'insufficient_data' || v === null;
      return '<div class="mc-kv"><span class="k">' + esc(k) + '</span><span class="v">' +
        (insufficient ? '<span class="mc-pill warn"><i></i>' + esc(dz('数据不足', 'n/a')) + '</span>'
                      : esc(String(v))) + '</span></div>';
    }).join('') + '</div>';
  }

  /* ---- 梦 --------------------------------------------------------------- */
  PAGES.dream = function (el) {
    el.innerHTML = head(dz('梦 · 离线巩固', 'Dreams'),
      dz('睡觉时大脑做的事，记忆系统也要做：合并、去重、固化、消解冲突。',
         'What a brain does while asleep: merge, dedupe, consolidate, resolve.')) + loading();
    api('/api/dash/dream' + nsq()).then(function (r) {
      if (MC.page !== 'dream') return;
      var d = (r && r.ok && r.body) || {};
      var pv = d.preview || {};
      var paths = d.paths || [];
      var runs = d.runs || [];
      if (!MC.ui.dreamPaths) MC.ui.dreamPaths = paths.map(function (p) { return p.id; });
      el.innerHTML = head(dz('梦 · 离线巩固', 'Dreams'),
        dz('睡觉时大脑做的事，记忆系统也要做：合并、去重、固化、消解冲突。',
           'What a brain does while asleep: merge, dedupe, consolidate, resolve.'),
        '<button class="mc-btn pri" data-act="dream-run"><i data-lucide="play"></i>' +
        esc(dz('开始一轮', 'Run a cycle')) + '</button>') +

        '<div class="mc-grid mc-g4">' +
          kpi(dz('记忆总数', 'Memories'), n0(pv.total), '', 'brain') +
          kpi(dz('可合并', 'Mergeable'), n0(pv.mergeable), '', 'git-merge') +
          kpi(dz('重复条目', 'Duplicates'), n0(pv.duplicates), '', 'copy') +
          kpi(dz('技能类', 'Skills'), n0(pv.skills), '', 'graduation-cap') +
        '</div>' +

        '<div class="mc-h2">' + esc(dz('这一轮做什么', 'What a cycle does')) + '</div>' +
        '<div class="mc-grid mc-g2">' + paths.map(function (p) {
          var on = MC.ui.dreamPaths.indexOf(p.id) >= 0;
          return '<label class="mc-card pad" style="cursor:pointer;display:flex;gap:10px;align-items:flex-start">' +
            '<input type="checkbox" data-dpath="' + esc(p.id) + '"' + (on ? ' checked' : '') +
              ' style="margin-top:3px">' +
            '<span><span style="font-weight:600;font-size:12.5px">' + esc(p.zh) + '</span>' +
            '<span class="mc-tag" style="margin-left:6px">' + esc(p.cost || '') + '</span>' +
            '<div style="font-size:11.5px;color:var(--fg3);margin-top:3px;line-height:1.65">' +
              esc(p.zh_desc) + '</div></span></label>';
        }).join('') + '</div>' +

        '<div class="mc-h2">' + esc(dz('历史记录', 'History')) +
          '<span class="hint">' + esc(dz('每一轮都能回看：哪一步、跑了几毫秒、动了多少条',
            'Every cycle is reviewable')) + '</span></div>' +
        (runs.length ? '<div class="mc-card"><div class="mc-scroll"><table class="mc-tbl">' +
          '<thead><tr><th>' + esc(dz('时间', 'When')) + '</th><th>' + esc(dz('耗时', 'Took')) +
          '</th><th>' + esc(dz('改动条目', 'Changed')) + '</th><th>' + esc(dz('明细', 'Steps')) +
          '</th></tr></thead><tbody>' + runs.map(function (run) {
            return '<tr><td style="white-space:nowrap">' + esc(ago(run.at)) + '</td>' +
              '<td class="num">' + n0(run.ms) + ' ms</td>' +
              '<td class="num">' + n0(run.total) + '</td>' +
              '<td>' + (run.steps || []).map(function (st) {
                return '<span class="mc-tag' + (st.ok ? ' pri' : '') + '" title="' +
                  esc((st.tool || st.path) + ' · ' + (st.ms || 0) + 'ms' +
                      (st.reason ? ' · ' + st.reason : '')) + '">' + esc(st.path) +
                  (st.count ? ' · ' + st.count : '') + (st.ok ? '' : ' ✗') + '</span>';
              }).join('') + '</td></tr>';
          }).join('') + '</tbody></table></div></div>'
          : '<div class="mc-card">' + empty('moon', dz('还没跑过', 'No cycles yet'),
              dz('点右上角「开始一轮」，它会真的去合并和去重，不是演示。',
                 'Hit “Run a cycle” — it really merges and dedupes.')) + '</div>');
      icons();
    });
  };

  /* ---- 使用分析 --------------------------------------------------------- */
  PAGES.analytics = function (el) {
    el.innerHTML = head(dz('使用分析', 'Analytics'),
      dz('写入、召回、错误率、Token 节省 —— 全部来自真实计数。',
         'Writes, retrievals, errors and token savings — all from real counters.')) + loading();
    var days = MC.ui.range || '30';
    api('/api/dash/analytics' + nsq({ days: days })).then(function (r) {
      if (MC.page !== 'analytics') return;
      var d = (r && r.ok && r.body) || {};
      var t = d.totals || {};
      var series = d.series || [];
      var max = Math.max(1, Math.max.apply(null, series.map(function (x) {
        return Math.max(x.added, x.recalled); }).concat([1])));
      el.innerHTML = head(dz('使用分析', 'Analytics'),
        dz('写入、召回、错误率、Token 节省 —— 全部来自真实计数。',
           'Writes, retrievals, errors and token savings — all from real counters.'),
        '<select class="mc-sel" id="mc-range">' + [7, 30, 90].map(function (n) {
          return '<option value="' + n + '"' + (String(n) === String(days) ? ' selected' : '') + '>' +
            esc(dz('近 ' + n + ' 天', 'Last ' + n + ' days')) + '</option>';
        }).join('') + '</select>') +
        '<div class="mc-grid mc-g4">' +
          kpi(dz('记忆总数', 'Memories'), n0(t.memories), dz('活跃 ', 'active ') + n0(t.active), 'brain') +
          kpi(dz('接口请求', 'API calls'), n0(t.requests), dz('平均 ', 'avg ') + n0(t.avg_ms) + ' ms', 'activity') +
          kpi(dz('错误响应', 'Errors'), n0(t.errors), dz('4xx + 5xx', '4xx + 5xx'), 'alert-triangle') +
          kpi(dz('估算节省 Token', 'Tokens saved'), n0(t.tokens_saved_est), dz('相对全量注入', 'vs full context'), 'zap') +
        '</div>' +
        '<div class="mc-card pad" style="margin-top:12px">' +
          '<div class="mc-h2" style="margin-top:0">' + esc(dz('逐日写入 / 召回', 'Daily writes / retrievals')) + '</div>' +
          '<div style="display:flex;align-items:flex-end;gap:3px;height:120px">' +
            series.map(function (x) {
              return '<div style="flex:1;display:flex;flex-direction:column;justify-content:flex-end;gap:2px" title="' +
                esc(x.day + ' · ' + dz('写入', 'writes') + ' ' + x.added + ' · ' + dz('召回', 'hits') + ' ' + x.recalled) + '">' +
                '<i style="height:' + Math.max(2, Math.round(x.added * 90 / max)) + 'px;background:var(--accent-deep);border-radius:2px 2px 0 0"></i>' +
                '<i style="height:' + Math.max(1, Math.round(x.recalled * 90 / max)) + 'px;background:var(--accent);opacity:.55;border-radius:0 0 2px 2px"></i>' +
              '</div>';
            }).join('') + '</div>' +
          '<div class="mc-row" style="margin-top:8px;font-size:11px;color:var(--fg3)">' +
            '<span><i style="display:inline-block;width:8px;height:8px;background:var(--accent-deep);border-radius:2px"></i> ' +
              esc(dz('写入', 'Writes')) + '</span>' +
            '<span><i style="display:inline-block;width:8px;height:8px;background:var(--accent);opacity:.55;border-radius:2px"></i> ' +
              esc(dz('召回', 'Retrievals')) + '</span>' +
          '</div></div>' +
        '<div class="mc-grid mc-g2" style="margin-top:12px">' +
          '<div class="mc-card pad"><div class="mc-h2" style="margin-top:0">' +
            esc(dz('类型分布', 'Types')) + '</div>' + bars(d.types || {}) + '</div>' +
          '<div class="mc-card pad"><div class="mc-h2" style="margin-top:0">' +
            esc(dz('活跃时段', 'Active hours')) + '</div>' + hoursHTML(d.hours || []) + '</div>' +
        '</div>';
      icons();
    });
  };

  function hoursHTML(h) {
    var max = Math.max(1, Math.max.apply(null, h.concat([1])));
    return '<div style="display:flex;align-items:flex-end;gap:2px;height:80px">' +
      h.map(function (v, i) {
        return '<div style="flex:1;height:100%;display:flex;align-items:flex-end" title="' + i + ':00 · ' + v + '">' +
          '<div style="width:100%;height:' + Math.max(2, Math.round(v * 76 / max)) +
          'px;background:var(--accent);border-radius:2px 2px 0 0"></div></div>';
      }).join('') + '</div>' +
      '<div class="mc-row" style="justify-content:space-between;font-size:10px;color:var(--fg3);margin-top:4px">' +
      '<span>0</span><span>6</span><span>12</span><span>18</span><span>23</span></div>';
  }

  /* 置信度显示。引擎不同版本给的字段名不同（confidence / score / weight），
     取第一个能解析成数字的；都没有就显示 —，不要编一个 0.5 出来。 */
  function confCell(m) {
    var v = m.confidence;
    if (v === undefined || v === null) v = m.score;
    if (v === undefined || v === null) v = m.weight;
    var n = Number(v);
    if (!isFinite(n)) return '—';
    if (n > 1) n = n / 100;                    /* 有些实现给 0-100 */
    return Math.round(n * 100) + '%';
  }

  /* ---- 导出 ------------------------------------------------------------- */
  PAGES.exports = function (el) {
    /* 2026-10-23：导出与迁移归入**增值包**权益。
       菜单对所有人可见（不藏起来），但没买增值包的人进来看到的是锁定态 ——
       藏菜单会让人以为"这功能不存在"，显示锁定态才说明"买了就有"。
       后端 handle_dash_export 同样校验 has_addon()，前端只是体验层。 */
    api('/api/me/subscription').then(function (r) {
      var sub = (r && r.ok && r.body) || {};
      if (!sub.addon_active) {
        el.innerHTML = head(dz('导出与迁移', 'Export'),
          dz('你的记忆是你的。随时整包带走，格式是开放的 JSONL + manifest。',
             'Your memory is yours. Take it with you as open JSONL + manifest.')) +
          '<div class="mc-card pad" style="text-align:center;padding:44px 24px">' +
            '<div style="font-size:34px;line-height:1;margin-bottom:14px">🔒</div>' +
            '<div class="mc-h2" style="margin:0 0 8px">' +
              esc(dz('导出与迁移属于增值包权益', 'Export & migration is part of the add-on')) + '</div>' +
            '<p class="mc-p" style="max-width:520px;margin:0 auto 18px">' +
              esc(dz('整库导出（JSONL + manifest）需要购买「合规证明包」。' +
                     '你的记忆数据一直都在，随时可以升级后带走。',
                     'Full export requires the Compliance Add-on. Your data is always yours.')) + '</p>' +
            '<a class="mc-btn pri" href="#/dashboard/billing">' +
              esc(dz('查看增值包', 'See the add-on')) + '</a>' +
          '</div>';
        icons();
        return;
      }
      renderExport(el);
    });
  };

  function renderExport(el) {
    el.innerHTML = head(dz('导出与迁移', 'Export'),
      dz('你的记忆是你的。随时整包带走，格式是开放的 JSONL + manifest。',
         'Your memory is yours. Take it with you as open JSONL + manifest.')) +
      '<div class="mc-grid mc-g2">' +
        '<div class="mc-card pad"><div class="mc-h2" style="margin-top:0">' +
          esc(dz('整库导出', 'Full export')) + '</div>' +
          '<p class="mc-p">' + esc(dz('导出为 zip（JSONL + manifest.json），可导入到任何 8.x 实例。',
            'Downloads a zip (JSONL + manifest.json) that imports into any 8.x instance.')) + '</p>' +
          '<button class="mc-btn pri" style="margin-top:10px" data-act="export"><i data-lucide="download"></i>' +
          esc(dz('下载导出包', 'Download')) + '</button></div>' +
        '<div class="mc-card pad"><div class="mc-h2" style="margin-top:0">' +
          esc(dz('迁移到自建实例', 'Move to self-hosted')) + '</div>' +
          '<div class="mc-code">pip install "mnemosyne-os @ git+https://github.com/MnemosyneOS/mnemosyne.git@v8.1.0"\nmnemosyne init\n# 解压导出包到 ~/.mnemosyne/data 后：\nmnemosyne doctor</div>' +
          '<div class="mc-note" style="margin-top:8px">' + esc(dz('导出包里的 manifest.json 含内容哈希，导入时会逐条校验。',
            'The manifest carries content hashes and is verified on import.')) + '</div></div>' +
      '</div>';
    icons();
  };

  /* ---- 套餐与用量 ------------------------------------------------------- */
  PAGES.billing = function (el) {
    /* 2026-10-23 SaaS 订阅层：除既有人民币套餐外，再拉三个数据源：
         /api/me/subscription  —— 区块 A：当前计划 + 推广期剩余天数
         /api/pricing          —— 美元档价目（与价格页**同一份**数据源）
         /api/console/overview —— 区块 B：本月用量
       三者并行拉取；任一失败都降级为空，不阻塞页面（旧行为必须保住）。

       ⚠️ 加了缓存：切币种 / 切月年只是重画，不再重发这 5 个请求。
       不加缓存时每次切换都先清成「加载中…」，实测在网关慢的情况下
       要等十几秒 —— 用户看到的是"点了没反应"，这比慢更伤。
       数据变更（下单、确认、PayPal 确认）会显式清掉缓存。 */
    function _apply(r) {
      var plans = ((r[0] && r[0].ok && r[0].body) || {});
      var orders = ((r[1] && r[1].ok && r[1].body) || {});
      var sub = ((r[2] && r[2].ok && r[2].body) || {});
      var pricing = ((r[3] && r[3].ok && r[3].body) || {});
      var ov = ((r[4] && r[4].ok && r[4].body) || {});
      var cur = (MC.planName || 'starter');
      var qr = plans.qr || '';

      /* ---- 区块 A：当前计划卡片 ---- */
      var tierLabel = sub.label || (sub.tier === 'team' ? 'Team'
                    : sub.tier === 'pro' ? 'Pro' : 'Free');
      var banner = '';
      if (sub.promotional_expired) {
        /* PROMO_STRATEGY：措辞重点是「数据还在」，不是「你被锁了」。
           指令 §3.1 区块 A 原文照搬，一字不改。 */
        banner = '<div class="mc-note" style="border-color:#f0c36d;background:#fff8e6;' +
          'color:#7a5b00;margin-bottom:14px;line-height:1.7">' +
          '<b>' + esc(dz('推广期已结束', 'Your promotional Team access has ended')) + '</b><br>' +
          esc(dz('你的记忆都还在，但超过 30 天的冷层记忆不再被召回。升级到 Pro 即可恢复全量召回。',
                 'Your memories are safe, but cold-tier memories older than 30 days are ' +
                 'no longer recalled. Upgrade to Pro to restore full recall.')) +
          '</div>';
      } else if (sub.is_promotional) {
        banner = '<div class="mc-note" style="border-color:var(--accent-line);' +
          'background:var(--accent-wash);margin-bottom:14px">' +
          esc(dz('推广期 Team 权益 —— 到期日 ' + (sub.expires_at || '').slice(0, 10),
                 'Promotional Team access — expires on ' + (sub.expires_at || '').slice(0, 10))) +
          (sub.days_left != null ? ' · ' + esc(dz('剩余 ' + sub.days_left + ' 天',
                                                  sub.days_left + ' days left')) : '') +
          '</div>';
      }
      var tierCard = '<div class="mc-card pad" style="margin-bottom:16px">' +
        '<div class="mc-row" style="justify-content:space-between;align-items:center">' +
        '<div><div style="font-size:11px;color:var(--fg3);letter-spacing:.04em">' +
        esc(dz('当前计划', 'Current plan')) + '</div>' +
        '<b style="font-size:20px;letter-spacing:-.02em">' + esc(tierLabel) + '</b></div>' +
        (sub.tier === 'free'
          ? '<button class="mc-btn pri" data-act="stripe" data-tier="pro" data-interval="month">' +
            esc(dz('升级到 Pro — $6.9/月', 'Upgrade to Pro — $6.9/mo')) + '</button>'
          : '<button class="mc-btn" data-act="portal">' +
            esc(dz('管理订阅', 'Manage subscription')) + '</button>') +
        '</div>' +
        (function () {
          /* 中文界面必须用中文特性列表，否则「当前计划」卡里全是英文
             （用户截图指出：切了中文还显示 "55 MCP tools / 30-day ..."）。 */
          var feats = (zhNow() ? (sub.features_zh || sub.features) : sub.features) || [];
          if (!feats.length) return '';
          return '<div style="margin-top:10px">' + feats.map(function (f) {
            return '<div style="font-size:11.5px;color:var(--fg2);padding:2px 0">✓ ' + esc(f) + '</div>';
          }).join('') + '</div>';
        })() +
        '</div>';

      /* ---- 区块 B：用量概览 ---- */
      var u = ov.usage || {};
      var usageCard = '<div class="mc-grid" style="grid-template-columns:repeat(auto-fit,minmax(150px,1fr));' +
        'margin-bottom:16px">' +
        [ [dz('本月写入', 'Writes (mo)'), n0(u.writes_this_month)],
          [dz('本月召回', 'Recalls (mo)'), n0(u.recalls_this_month)],
          [dz('活跃命名空间', 'Namespaces'), n0(u.active_namespaces)],
          [dz('记忆总数', 'Memories'), n0(u.memories_total)]
        ].map(function (kv) {
          return '<div class="mc-card pad"><div style="font-size:11px;color:var(--fg3)">' +
            esc(kv[0]) + '</div><div style="font-size:22px;font-weight:700;margin-top:4px">' +
            esc(kv[1]) + '</div></div>';
        }).join('') + '</div>';

      /* ---- 美元档价目（与 /pricing 页面同源）---- */
      var usd = (pricing.tiers || []).filter(function (t) { return t.id !== 'free'; });
      MC.usdIv = MC.usdIv || {};
      var usdHTML = usd.length ? '<div class="mc-h2">' +
        esc(dz('美元订阅（PayPal）', 'USD subscription (PayPal)')) + '</div>' +
        '<div class="mc-grid" style="grid-template-columns:repeat(auto-fit,minmax(210px,1fr))">' +
        usd.map(function (t) {
          var on = t.id === sub.tier;
          var hasYear = Number(t.price_annual) > 0;
          var iv = (hasYear && MC.usdIv[t.id] === 'year') ? 'year' : 'month';
          var amt = iv === 'year' ? t.price_annual : t.price_monthly;
          var period = iv === 'year' ? dz('/ 年（省两个月）', '/ year (2 months free)')
                                     : dz('/ 月', '/ month');
          var planId = ((t.paypal_plan_id || {})[iv]) || '';

          var seg = hasYear
            ? '<div class="mc-row" style="gap:6px;margin:0 0 10px">' +
              [['month', dz('月付', 'Monthly')], ['year', dz('年付', 'Yearly')]]
                .map(function (kv) {
                  return '<button class="mc-btn sm' + (iv === kv[0] ? ' pri' : '') + '" ' +
                    'aria-pressed="' + (iv === kv[0] ? 'true' : 'false') + '" ' +
                    'data-act="usd-piv" data-tier="' + esc(t.id) + '" data-piv="' + kv[0] + '">' +
                    esc(kv[1]) + '</button>';
                }).join('') + '</div>'
            : '';

          /* 页内按钮容器：PayPal JS SDK 渲染进这里，点一下原地弹窗付款，
             不再整页跳去 paypal.com 登录（那一跳是转化率杀手）。
             下面再留一个「改用跳转支付」，SDK 被墙/失败时仍有路可走。 */
          var cta;
          if (on) {
            cta = '<div class="mc-note" style="text-align:center;border:0;background:none">' +
                  esc(dz('当前计划', 'Current plan')) + '</div>';
          } else if (planId) {
            cta = '<div class="pp-slot" data-plan-id="' + esc(planId) + '" ' +
                    'data-tier="' + esc(t.id) + '" data-interval="' + iv + '" ' +
                    'style="min-height:42px"></div>' +
                  '<button class="mc-btn sm" style="width:100%;justify-content:center;margin-top:6px" ' +
                    'data-act="stripe" data-tier="' + esc(t.id) + '" data-interval="' + iv + '">' +
                    esc(dz('改用跳转支付', 'Pay by redirect')) + '</button>';
          } else {
            cta = '<button class="mc-btn pri" style="width:100%;justify-content:center" ' +
                  'data-act="stripe" data-tier="' + esc(t.id) + '" data-interval="' + iv + '">' +
                  esc(dz('升级到 ' + t.name, 'Upgrade to ' + t.name)) + '</button>';
          }

          return '<div class="mc-card pad"' + (on ? ' style="border-color:var(--accent-deep)"' : '') + '>' +
            '<b style="font-size:14px">' + esc(t.name) + '</b>' +
            (t.per_seat ? ' <span class="mc-tag">' + esc(dz('按席位', 'per seat')) + '</span>' : '') +
            '<div style="margin-top:10px">' + seg + '</div>' +
            '<div style="font-size:22px;font-weight:700;margin:4px 0 2px">$' + amt +
            '<span style="font-size:11.5px;font-weight:400;color:var(--fg3)">' +
            esc(period) + '</span></div>' +
            /* 指令 §4.2：Team 卡必须点明适用场景（小团队 / 合规敏感部署）——
               只说"按席位"不构成选择理由，用户不知道自己该不该选它。 */
            (t.per_seat ? '<div style="font-size:11px;color:var(--fg3);margin:4px 0 8px;line-height:1.6">' +
              esc(dz('面向小团队与合规敏感型部署。',
                     'For small teams and compliance-sensitive deployments.')) + '</div>' : '') +
            '<div style="margin-bottom:10px">' + ((zhNow() ? (t.features_zh || t.features) : t.features) || []).map(function (f) {
              return '<div style="font-size:11.5px;color:var(--fg2);padding:2px 0">✓ ' + esc(f) + '</div>';
            }).join('') + '</div>' + cta +
            '</div>';
        }).join('') + '</div>' : '';

      /* ---- 合规证明包（加购，不是层级）----
         刻意与三个层级分开渲染：它是"在 Pro/Team 之上再加"，放进同一个
         网格会让人以为它是第四档订阅。ADDON_TIER: $9.9/月，只做月付。 */
      var addonHTML = '';
      if (pricing.addon && (sub.tier === 'pro' || sub.tier === 'team')) {
        var ad = pricing.addon;
        addonHTML = '<div class="mc-h2">' +
          esc(dz('合规证明包（加购）', 'Compliance Add-on (optional)')) + '</div>' +
          '<div class="mc-card pad" style="display:flex;gap:18px;flex-wrap:wrap;' +
          'align-items:flex-start;justify-content:space-between">' +
          '<div style="flex:1;min-width:240px">' +
          '<b style="font-size:14px">' + esc(ad.name) + '</b>' +
          '<div style="font-size:22px;font-weight:700;margin:6px 0 2px">$' + ad.price_monthly +
          '<span style="font-size:11.5px;font-weight:400;color:var(--fg3)">' +
          esc(dz('/ 月', '/ month')) + '</span></div>' +
          '<div style="font-size:11.5px;color:var(--fg2);margin-top:6px;line-height:1.7">' +
          ((zhNow() ? (ad.features_zh || ad.features) : ad.features) || []).map(function (f) { return '✓ ' + esc(f); }).join('<br>') + '</div>' +
          '</div>' +
          '<button class="mc-btn pri" data-act="stripe" data-tier="addon" data-interval="month">' +
          esc(dz('加购合规证明包 — $9.9/月', 'Add Compliance pack — $9.9/mo')) + '</button>' +
          '</div>';
      } else if (pricing.addon) {
        addonHTML = '<div class="mc-h2">' +
          esc(dz('合规证明包（加购）', 'Compliance Add-on (optional)')) + '</div>' +
          '<div class="mc-note">' +
          esc(dz('合规证明包需要先有 Pro 或 Team 订阅 —— 它是在其之上加的一层，不能单独购买。',
                 'The Compliance Add-on sits on top of Pro or Team. Upgrade first, ' +
                 'then add the pack.')) + '</div>';
      }

      /* ---- 币种 / 通道选择：USD(PayPal) ↔ CNY(微信) ----
         为什么二选一而不是两块都摆：两块并排会让人以为要买两次，
         而且币种混在一屏里最容易问"我到底付哪个"。
         为什么默认 USD：人民币价约为美元价的 1/5（¥9.9 vs $6.9），
         默认给低价等于对所有中文环境发折扣券 —— 折扣应当由用户主动选。 */
      var curSel = MC.billingCur || 'USD';
      var paySwitch = '<div class="mc-row" style="gap:8px;margin:0 0 14px;flex-wrap:wrap">' +
        [['USD', '$ USD · PayPal'], ['CNY', '¥ CNY · 微信 / WeChat']].map(function (kv) {
          return '<button class="mc-btn sm' + (curSel === kv[0] ? ' pri' : '') + '" ' +
                 'aria-pressed="' + (curSel === kv[0] ? 'true' : 'false') + '" ' +
                 'data-act="billing-cur" data-cur="' + kv[0] + '">' + esc(kv[1]) + '</button>';
        }).join('') + '</div>';

      /* 人民币档位单独拼一段，供切换时整体替换（免费档已在上面 tiers 里，这里不再列） */
      /* 人民币档位：按 tier 归组（pro / team / addon），卡内切月付/年付。
         PLAN_CATALOG 里 pro_month 与 pro_year 是两个 id，但它们是**同一档的
         两个周期** —— 照单全渲染就是"同一档并排两张卡"，这正是之前的毛病。
         现在 3 张卡、每张卡内一个切换。 */
      /* 每张卡**各自**记住自己的周期，默认月付。
         早前用一个全局 MC.cnyInterval，结果"给 Pro 选了年付，Team 也跟着变年付" ——
         用户是在比较两档的价格，不该被联动。 */
      MC.cnyIv = MC.cnyIv || {};
      var cnyGroups = { pro: {}, team: {}, addon: {} };
      (plans.plans || []).forEach(function (p) {
        var m = /^(pro|team|addon)_(month|year)$/.exec(String(p.id || ''));
        if (m && p.price > 0) cnyGroups[m[1]][m[2]] = p;
      });

      var cnyCards = ['pro', 'team', 'addon'].map(function (tid) {
        var g = cnyGroups[tid];
        var base = g.month || g.year;
        if (!base) return '';
        var hasYear = !!(g.month && g.year);
        var iv = (hasYear && MC.cnyIv[tid] === 'year') ? 'year' : 'month';
        var pk = g[iv] || base;
        var on = (pk.id === cur);
        var zh = zhNow();

        /* 卡内周期切换。只有真有两个周期的档才给按钮，加购包只做月付。 */
        var seg = '';
        if (hasYear) {
          seg = '<div class="mc-row" style="gap:6px;margin:0 0 10px">' +
            [['month', dz('月付', 'Monthly')], ['year', dz('年付', 'Yearly')]]
              .map(function (kv) {
                return '<button class="mc-btn sm' + (iv === kv[0] ? ' pri' : '') + '" ' +
                  'aria-pressed="' + (iv === kv[0] ? 'true' : 'false') + '" ' +
                  'data-act="cny-piv" data-tier="' + tid + '" data-piv="' + kv[0] + '">' +
                  esc(kv[1]) + '</button>';
              }).join('') + '</div>';
        }

        var feats = (zh ? base.feats_zh : base.feats_en) || [];
        var period = (iv === 'year') ? dz(' / 年', ' / year') : dz(' / 月', ' / month');
        var btn = '<button class="mc-btn ' + (on ? '' : 'pri') + '" style="width:100%" ' +
          'data-act="buy" data-plan="' + esc(pk.id) + '">' +
          esc(on ? dz('续费', 'Renew') : dz('选择 ' + pk.zh, 'Choose ' + pk.en)) + '</button>';

        return '<div class="mc-card pad" style="display:flex;flex-direction:column;' +
            (on ? 'border-color:var(--accent-deep);box-shadow:0 0 0 1px var(--accent-line)' : '') + '">' +
          '<div class="mc-row" style="justify-content:space-between;align-items:center">' +
            '<b style="font-size:14px">' + esc(zh ? base.zh : base.en) + '</b>' +
            (on ? '<span class="mc-pill ok"><i></i>' + esc(dz('当前', 'Current')) + '</span>'
                : '<span class="mc-tag">' + esc(base.badge || '') + '</span>') + '</div>' +
          '<div style="margin-top:10px">' + seg + '</div>' +
          '<div style="font-size:24px;font-weight:700;margin:4px 0 2px;letter-spacing:-.02em">¥' + esc(pk.price) +
            '<span style="font-size:11.5px;font-weight:400;color:var(--fg3)">' + esc(period) + '</span></div>' +
          '<div style="font-size:11.5px;color:var(--fg3);min-height:44px;line-height:1.6">' +
            esc(zh ? base.zh_desc : base.en_desc) + '</div>' +
          '<div style="margin:10px 0 12px;flex:1">' + feats.map(function (f) {
            return '<div style="font-size:11.5px;color:var(--fg2);padding:2px 0">✓ ' + esc(f) + '</div>';
          }).join('') + '</div>' + btn + '</div>';
      }).join('');

      var cnyHTML = '<div class="mc-h2">' +
        esc(dz('人民币订阅（微信支付）', 'CNY subscription (WeChat Pay)')) + '</div>' +
        '<div class="mc-grid" style="grid-template-columns:repeat(auto-fit,minmax(210px,1fr))">' +
        cnyCards + '</div>';

      el.innerHTML = head(dz('套餐与用量', 'Plan & usage'),
        dz('你的记忆、你的额度。升级后额度立即生效。',
           'Your memory, your quota. Upgrades take effect immediately.')) +
        banner + tierCard + usageCard + paySwitch +
        (curSel === 'USD' ? (usdHTML + addonHTML) : cnyHTML) +
        /* 区块 C / D 走异步填充：它们各自要打一个接口，
           不能让 key 列表或记忆列表的延迟拖住整个页面的首屏。 */
        '<div id="mc-keys-block"></div>' +
        '<div id="mc-mem-block"></div>' +

        '<div class="mc-h2">' + esc(dz('我的订单', 'My orders')) + '</div>' +
        ((orders.orders || []).length ? '<div class="mc-card"><div class="mc-scroll"><table class="mc-tbl">' +
          '<thead><tr><th>' + esc(dz('订单号', 'Order')) + '</th><th>' + esc(dz('套餐', 'Plan')) +
          '</th><th class="num">' + esc(dz('金额', 'Amount')) + '</th><th>' + esc(dz('状态', 'Status')) +
          '</th><th>' + esc(dz('创建', 'Created')) + '</th><th></th></tr></thead><tbody>' +
          (orders.orders || []).map(function (o) {
            var st = o.status;
            var pill = st === 'active' ? '<span class="mc-pill ok"><i></i>' + esc(dz('已生效', 'Active')) + '</span>'
                     : st === 'paid' ? '<span class="mc-pill warn"><i></i>' + esc(dz('待确认', 'Awaiting confirm')) + '</span>'
                     : '<span class="mc-pill"><i></i>' + esc(dz('待支付', 'Unpaid')) + '</span>';
            return '<tr><td style="font-family:monospace">' + esc(o.id) + '</td>' +
              '<td>' + esc(o.plan_zh || o.plan) + '</td>' +
              '<td class="num">¥' + fmtYuan(o.amount) + '</td>' +
              '<td>' + pill + '</td><td style="white-space:nowrap;color:var(--fg3)">' +
              esc(new Date(o.created * 1000).toLocaleDateString()) + '</td>' +
              '<td>' + (st === 'pending' ? '<button class="mc-btn sm" data-act="pay" data-id="' + esc(o.id) + '">' +
                esc(dz('去支付', 'Pay')) + '</button>' : '') +
              (st === 'paid' && isAdmin() ? ' <button class="mc-btn sm pri" data-act="confirm" data-id="' +
                esc(o.id) + '">' + esc(dz('确认到账', 'Confirm')) + '</button>' : '') + '</td></tr>';
          }).join('') + '</tbody></table></div></div>'
          : '<div class="mc-card">' + empty('credit-card', dz('还没有订单', 'No orders yet'),
              dz('选一个套餐开始。', 'Pick a plan to start.')) + '</div>') +
        '<div id="mc-pay"></div>';
      MC.plans = plans;
      if (MC.setup && MC.setup.plan) MC.planName = MC.setup.plan;
      icons();
      /* 美元档用页内 PayPal 按钮：拿公开 client_id 渲染，用户点一下原地付款。
         pricing 里没有 client_id（PayPal 未配置）就什么都不做，卡片上会显示
         上面那个「改用跳转支付」按钮，功能不丢。 */
      if (curSel === 'USD' && pricing.paypal_client_id) {
        mountPayPal(pricing.paypal_client_id);
      }
      /* 区块 C / D：异步填充，任一失败只影响自己那一块 */
      renderKeysBlock(sub);
      renderMemBlock(sub);
    }

    if (MC.billingCache) { _apply(MC.billingCache); return; }
    el.innerHTML = head(dz('套餐与用量', 'Plan & usage'),
      dz('你的记忆、你的额度。升级后额度立即生效。',
         'Your memory, your quota. Upgrades take effect immediately.')) + loading();
    Promise.all([
      api('/api/billing/plans'), api('/api/billing/order'),
      api('/api/me/subscription'), api('/api/pricing'),
      api('/api/console/overview')
    ]).then(function (r) {
      if (MC.page !== 'billing') return;
      MC.billingCache = r;
      _apply(r);
    });
  };

  /* ---- 区块 C：API Key 管理（指令 §3.1 C）-------------------------------
     复用既有 /api/me/keys（用户只能看自己那些，命名空间由服务端按会话推导）。
     Free 层显示**绑定的单一 namespace**，Pro/Team 显示 all namespaces ——
     这正是层级差异在界面上最直观的体现，不该藏着。 */
  function renderKeysBlock(sub) {
    var box = document.getElementById('mc-keys-block');
    if (!box) return;
    box.innerHTML = '<div class="mc-h2">' + esc(dz('API Key 管理', 'API keys')) + '</div>' +
      '<div class="mc-card pad">' + loading() + '</div>';
    api('/api/me/keys').then(function (r) {
      if (MC.page !== 'billing') return;
      var d = (r && r.ok && r.body) || {};
      var rows = d.keys || [];
      var free = (sub && sub.tier) === 'free';
      var scope = free
        ? esc(dz('仅 ' + (d.namespace || '你的命名空间'), 'this namespace only'))
        : esc(dz('全部命名空间', 'all namespaces'));
      box.innerHTML = '<div class="mc-h2">' + esc(dz('API Key 管理', 'API keys')) + '</div>' +
        '<div class="mc-card pad" style="margin-bottom:10px">' +
        '<div class="mc-row" style="gap:8px;align-items:center;flex-wrap:wrap">' +
        '<input class="mc-inp" id="mc-keyname" placeholder="' +
          esc(dz('给这把钥匙起个名字', 'Name this key')) + '" style="flex:1;min-width:160px">' +
        '<button class="mc-btn pri" data-act="key-create">' + esc(dz('创建新 Key', 'Create key')) + '</button>' +
        '<span class="mc-note" style="border:0;background:none">' + esc(dz('作用域：', 'Scope: ')) + scope + '</span>' +
        '</div></div>' +
        (rows.length ? '<div class="mc-card"><div class="mc-scroll"><table class="mc-tbl">' +
          '<thead><tr><th>' + esc(dz('名称', 'Name')) + '</th><th>' + esc(dz('前缀', 'Prefix')) +
          '</th><th>' + esc(dz('创建', 'Created')) + '</th><th>' + esc(dz('命名空间', 'Namespace')) +
          '</th><th></th></tr></thead><tbody>' +
          rows.map(function (k) {
            return '<tr><td>' + esc(k.name || k.label || '—') + '</td>' +
              '<td style="font-family:monospace;font-size:11px">' + esc(k.prefix || '—') + '…</td>' +
              '<td style="white-space:nowrap;color:var(--fg3);font-size:11px">' +
                esc(String(k.created || k.created_at || '').replace('T', ' ').slice(0, 16)) + '</td>' +
              '<td style="font-family:monospace;font-size:11px">' +
                esc(k.namespace || (free ? (d.namespace || '—') : dz('全部', 'all'))) + '</td>' +
              '<td><button class="mc-btn sm" data-act="key-revoke" data-id="' +
                esc(k.id || k.prefix || '') + '">' + esc(dz('吊销', 'Revoke')) + '</button></td></tr>';
          }).join('') + '</tbody></table></div></div>'
          : '<div class="mc-card">' + empty('key', dz('还没有 API Key', 'No keys yet'),
              dz('创建一把，然后把它填进你的 MCP 客户端。',
                 'Create one, then paste it into your MCP client.')) + '</div>');
      icons();
    })['catch'](function () {
      box.innerHTML = '<div class="mc-h2">' + esc(dz('API Key 管理', 'API keys')) + '</div>' +
        '<div class="mc-card pad">' + esc(dz('读取失败', 'Failed to load')) + '</div>';
    });
  }

  /* ---- 区块 D：记忆浏览（指令 §3.1 D）-----------------------------------
     Free 层的冷层超窗记忆显示**锁图标**，点击提示升级。
     锁标记由**服务端**算（locked 字段），前端只负责画 —— 判据只有一处。 */
  function renderMemBlock(sub) {
    var box = document.getElementById('mc-mem-block');
    if (!box) return;
    box.innerHTML = '<div class="mc-h2">' + esc(dz('记忆浏览', 'Memories')) + '</div>' +
      '<div class="mc-card pad">' + loading() + '</div>';
    api('/api/console/memories?limit=20&offset=0').then(function (r) {
      if (MC.page !== 'billing') return;
      var d = (r && r.ok && r.body) || {};
      if (r && !r.ok) {
        box.innerHTML = '<div class="mc-h2">' + esc(dz('记忆浏览', 'Memories')) + '</div>' +
          '<div class="mc-card pad">' + esc(dz('记忆服务暂时不可用', 'Memory service unavailable')) + '</div>';
        return;
      }
      var items = d.items || [];
      var locked = items.filter(function (m) { return m.locked; }).length;
      box.innerHTML = '<div class="mc-h2">' + esc(dz('记忆浏览', 'Memories')) +
        (d.total != null ? ' <span class="mc-tag">' + n0(d.total) + '</span>' : '') + '</div>' +
        (locked ? '<div class="mc-note" style="margin-bottom:10px">' +
          esc(dz('本页有 ' + locked + ' 条冷层记忆超出 Free 的 30 天窗口，已锁定。' +
                 '它们仍在库里、未被删除 —— 升级 Pro 即可恢复召回。',
                 locked + ' cold-tier memories on this page are outside the Free 30-day ' +
                 'window and are locked. They are still stored — upgrade to Pro to restore recall.')) +
          '</div>' : '') +
        (items.length ? '<div class="mc-card"><div class="mc-scroll"><table class="mc-tbl">' +
          '<thead><tr><th>' + esc(dz('内容摘要', 'Excerpt')) + '</th><th>' + esc(dz('写入时间', 'Created')) +
          '</th><th>' + esc(dz('层级', 'Tier')) + '</th><th class="num">' + esc(dz('置信度', 'Confidence')) +
          '</th></tr></thead><tbody>' +
          items.map(function (m) {
            var lock = m.locked
              ? '<span class="mc-tag" style="cursor:pointer" data-act="upgrade-hint">🔒 ' +
                esc(dz('已锁定', 'locked')) + '</span>'
              : '';
            return '<tr' + (m.locked ? ' style="opacity:.55"' : '') + '>' +
              '<td>' + lock + ' ' + esc(m.excerpt || '') + '</td>' +
              '<td style="white-space:nowrap;color:var(--fg3);font-size:11px">' +
                esc(String(m.created_at || '').replace('T', ' ').slice(0, 16)) + '</td>' +
              '<td><span class="mc-tag">' + esc(m.tier || 'hot') + '</span></td>' +
              '<td class="num">' + esc(m.confidence == null ? '—' : m.confidence) + '</td></tr>';
          }).join('') + '</tbody></table></div></div>'
          : '<div class="mc-card">' + empty('brain', dz('还没有记忆', 'No memories yet'),
              dz('接入 Agent 后，写入的记忆会出现在这里。',
                 'Once an agent writes, memories show up here.')) + '</div>');
      icons();
    })['catch'](function () {
      box.innerHTML = '<div class="mc-h2">' + esc(dz('记忆浏览', 'Memories')) + '</div>' +
        '<div class="mc-card pad">' + esc(dz('读取失败', 'Failed to load')) + '</div>';
    });
  }

  /* ---- PayPal 页内按钮（JS SDK）---------------------------------------
     为什么不再整页跳转：原来的流程是 window.location.href = approve 链接，
     用户被带到 paypal.com、登录、确认、再跳回来。实测这条链路流失严重
     （用户原话："点进去登录不了，客户一定拒绝了"）。
     现在用 PayPal 官方 JS SDK 把按钮渲染在我们自己的页面里：
       · 点一下在原地弹窗，可用 PayPal 余额，也可用借记卡/信用卡（由 PayPal
         决定是否给访客卡通道，取决于商户账户是否开通 ACDC）；
       · 付款完成 onApprove 直接回我们页面，调 paypal-confirm 立刻生效。
     跳转方式保留为「改用跳转支付」，SDK 被墙或加载失败时仍有路可走。 */
  var PP_STATE = { loading: false, cbs: [], failed: false };

  function loadPayPalSdk(clientId, cb) {
    if (window.paypal && window.paypal.Buttons) return cb(true);
    if (PP_STATE.failed) return cb(false);
    PP_STATE.cbs.push(cb);
    if (PP_STATE.loading) return;
    PP_STATE.loading = true;
    var s = document.createElement('script');
    /* vault=true + intent=subscription：订阅必须这两个参数，否则
       actions.subscription.create 不存在。currency 固定 USD。 */
    s.src = 'https://www.paypal.com/sdk/js?client-id=' + encodeURIComponent(clientId) +
            '&vault=true&intent=subscription&components=buttons&currency=USD';
    s.async = true;
    s.onload = function () {
      PP_STATE.loading = false;
      var q = PP_STATE.cbs; PP_STATE.cbs = [];
      q.forEach(function (f) { try { f(true); } catch (e) {} });
    };
    s.onerror = function () {
      PP_STATE.loading = false; PP_STATE.failed = true;
      var q = PP_STATE.cbs; PP_STATE.cbs = [];
      q.forEach(function (f) { try { f(false); } catch (e) {} });
    };
    document.head.appendChild(s);
  }

  function mountPayPal(clientId) {
    var slots = document.querySelectorAll('.pp-slot');
    if (!slots.length) return;
    loadPayPalSdk(clientId, function (okSdk) {
      if (!okSdk || !window.paypal || !window.paypal.Buttons) return;
      var me = sess() || {};
      Array.prototype.forEach.call(slots, function (slot) {
        if (slot.getAttribute('data-mounted')) return;
        var planId = slot.getAttribute('data-plan-id') || '';
        if (!planId) return;
        slot.setAttribute('data-mounted', '1');
        try {
          window.paypal.Buttons({
            style: { shape: 'rect', color: 'gold', layout: 'vertical',
                     label: 'paypal', height: 40, tagline: false },
            createSubscription: function (data, actions) {
              /* custom_id 必须是登录邮箱 —— 服务端 paypal-confirm 会拿它和
                 会话邮箱比对，防"确认别人的订阅"。 */
              return actions.subscription.create({
                plan_id: planId,
                custom_id: String(me.email || me.id || '')
              });
            },
            onApprove: function (data) {
              post('/api/billing/paypal-confirm',
                   { subscription_id: data.subscriptionID }).then(function (r) {
                var b = (r && r.ok && r.body) || {};
                if (b.ok && b.tier && b.tier !== 'free') {
                  toast(dz('订阅已生效：' + String(b.tier).toUpperCase(),
                           'Subscription active: ' + String(b.tier).toUpperCase()));
                  MC.data = {};
                  MC.billingCache = null;
                  paint();
                  reloadRail();
                } else {
                  toast(dz('PayPal 已扣款，状态同步中，几秒后自动刷新',
                           'Paid — syncing your subscription, refresh in a moment'));
                }
              });
            },
            onError: function () {
              toast(dz('PayPal 按钮加载失败，请点下方「改用跳转支付」',
                       'PayPal failed to load — use "Pay by redirect" below'));
            }
          }).render(slot);
        } catch (e) {
          /* 单张卡挂载失败不影响其它卡；用户仍可用跳转支付 */
        }
      });
    });
  }

  /* 人民币金额显示：最多两位小数，去掉多余的 0。
     9.9 -> "9.9"，99 -> "99"，19.95 -> "19.95"。 */
  function fmtYuan(v) {
    var n = Number(v) || 0;
    return (Math.round(n * 100) / 100).toString();
  }

  function showPay(order, qr) {
    var box = document.getElementById('mc-pay');
    if (!box) return;
    /* 金额显示：¥9.9 要显示成 9.9，不能四舍五入成 10（早前用 Math.round
       把 9.9 显示成 10，用户按 10 付款，对账就对不上）。整数就显示整数。 */
    var yuan = fmtYuan(order.amount);
    /* 每个金额都有**专属收款码**（assets/payqr/<金额>.jpg，一码一价）：
       扫码那一刻金额就被码本身固定住，用户不需要手动输金额，也不会付错档。
       早前靠"金额加 1~99 分做校验位"来区分订单，用户看到 ¥10.37 根本不知道付多少。 */
    /* ⚠️ 这里原来给 .mc-modal 挂了 onclick="event.stopPropagation()"，
       本意是"点弹窗内部不要关掉"。但控制台所有按钮都靠 **document 上的
       事件委托** 分发 data-act —— 在 .mc-modal 上 stopPropagation 等于
       把弹窗内所有按钮（含「稍后」「我已支付」）的点击全部掐断，
       请求根本发不出去，用户看到的就是"按钮没反应"。
       现在改成：遮罩单独一个 close-pay-mask，只在点遮罩本身时关闭。 */
    box.innerHTML = '<div class="mc-mask" data-act="close-pay-mask"><div class="mc-modal" style="max-width:520px">' +
      '<div class="mh"><div class="st">' + esc(dz('微信支付', 'WeChat Pay')) + '</div>' +
      '<h2>' + esc(dz('扫码支付 ¥', 'Scan to pay ¥') + yuan) + '</h2>' +
      '<p>' + esc(dz('这是 ¥' + yuan + ' 的专属收款码，扫码后金额已固定，不需要手动输入。',
        'This QR is pre-set to ¥' + yuan + ' — no amount entry needed.')) + '</p></div>' +
      '<div class="mb" style="display:flex;gap:16px;align-items:flex-start">' +
        (qr ? '<img class="mc-qr" src="' + esc(qr) + '" alt="WeChat QR" width="200" height="200">'
            : '<div class="mc-qrph">' + esc(dz('这个金额的收款码还没配。请先在后台设置里上传收款码。',
                'No QR configured for this amount yet.')) + '</div>') +
        '<div style="flex:1">' +
          '<div class="mc-kv"><span class="k">' + esc(dz('订单号', 'Order')) + '</span><span class="v" style="font-family:monospace">' +
            esc(order.id) + '</span></div>' +
          '<div class="mc-kv"><span class="k">' + esc(dz('套餐', 'Plan')) + '</span><span class="v">' +
            esc(order.plan_zh || order.plan) + '</span></div>' +
          '<div class="mc-kv"><span class="k">' + esc(dz('应付', 'Amount')) + '</span><span class="v">¥' +
            yuan + '</span></div>' +
          '<div class="mc-note" style="margin-top:10px">' + esc(dz(
            '付款时在备注里填订单号后 6 位，确认会更快。付完点下面的按钮。',
            'Put the last 6 chars of the order id in the note, then press the button.')) + '</div>' +
        '</div></div>' +
      '<div class="mf"><span class="sp"></span>' +
        '<button class="mc-btn" data-act="close-pay">' + esc(dz('稍后', 'Later')) + '</button>' +
        '<button class="mc-btn pri" data-act="paid" data-id="' + esc(order.id) + '">' +
          esc(dz('我已支付', 'I have paid')) + '</button></div></div></div>';
  }

  /* ---- 设置 ------------------------------------------------------------- */
  PAGES.settings = function (el) {
    var me = sess();
    el.innerHTML = head(dz('设置', 'Settings'),
      dz('账户与外观。站点级配置在后台管理里。', 'Account and appearance. Site settings live in Admin.')) +
      '<div class="mc-grid mc-g2">' +
        '<div class="mc-card pad"><div class="mc-h2" style="margin-top:0">' + esc(dz('账户', 'Account')) + '</div>' +
          '<div class="mc-fld"><label class="mc-lab">' + esc(dz('邮箱', 'Email')) + '</label>' +
            '<input class="mc-inp" style="width:100%" value="' + esc(me.email || '') + '" disabled></div>' +
          '<div class="mc-fld"><label class="mc-lab">' + esc(dz('显示名', 'Display name')) + '</label>' +
            '<input class="mc-inp" id="mc-dn" style="width:100%" value="' +
            esc(me.display_name || me.name || '') + '"></div>' +
          '<button class="mc-btn pri" data-act="save-profile">' + esc(dz('保存', 'Save')) + '</button>' +
        '</div>' +
        '<div class="mc-card pad"><div class="mc-h2" style="margin-top:0">' + esc(dz('关于这个账号', 'About this account')) + '</div>' +
          '<div class="mc-kv"><span class="k">' + esc(dz('角色', 'Role')) + '</span><span class="v">' +
            esc(isAdmin() ? dz('站点管理员', 'Administrator') : dz('成员', 'Member')) + '</span></div>' +
          '<div class="mc-kv"><span class="k">' + esc(dz('命名空间', 'Namespace')) + '</span><span class="v" style="font-family:monospace;font-size:11px">' +
            esc((MC.setup && MC.setup.namespace) || '—') + '</span></div>' +
          '<div class="mc-kv"><span class="k">' + esc(dz('套餐', 'Plan')) + '</span><span class="v">' +
            esc(planLabel()) + '</span></div>' +
          '<p class="mc-p" style="margin-top:10px">' + esc(dz(
            '主题与语言已移到 Mnemosyne OS SaaS 右上角，和网站首页保持一致。',
            'Theme and language now live in the top-right corner, matching the site.')) + '</p>' +
          /* 模型 / 邮件 / 品牌这些是**站点级**配置，属于后台管理，不在个人设置里。
             之前我把入口说成"设置 → 模型"，用户找不到 —— 这里给一条直达链接。 */
          (isAdmin() ? '<div class="mc-note" style="margin-top:12px">' + esc(dz(
              '模型、邮件、品牌与文案属于站点级配置，在「后台管理 → 站点配置」里。',
              'Model, mail, brand and copy are site-wide — they live in Admin → Site settings.')) +
            '<div style="margin-top:8px"><a class="mc-btn sm" href="#/admin" data-ctab="site">' +
            esc(dz('打开后台管理 · 站点配置', 'Open Admin · Site settings')) + ' →</a></div></div>' : '') +
        '</div>' +
      '</div>' +
      /* 2026-10-23：删掉「微信收款码（管理员）」上传卡片。
         现在收款码是**一码一价**，按金额放在 assets/payqr/<分>.jpg，
         由后端按订单金额选图。让管理员再上传一张"通用码"只会造成两套逻辑
         并存：传了也用不上，反而让人以为系统在用那张。 */
      '';
    icons();
  };

  /* ---- 演示 & 测试 ----------------------------------------------------- */

  /* 演示舞台在独立文件里（assets/console-demo.js）：它有自己的 10 章剧本、
     自己的状态机，塞进这个文件只会让两边都难改。这里只负责挂载。 */
  PAGES.demo = function (el) {
    if (window.MCDemo && typeof window.MCDemo.render === 'function') {
      window.MCDemo.render(el);
      return;
    }
    el.innerHTML = '<div class="mc-note bad">' +
      esc(dz('演示模块未加载（assets/console-demo.js）。刷新页面重试。',
             'Demo module not loaded (assets/console-demo.js). Reload the page.')) + '</div>';
  };

  /* ---- 注册用户信息 ----------------------------------------------------- */
  PAGES.users = function (el) {
    el.innerHTML = head(dz('注册用户信息', 'Registered users'),
      dz('每一个注册账号的全量档案：注册时间、来源、记忆条数、接入状态、套餐。',
         'Every registered account, in full.')) + loading();
    api('/api/dash/users').then(function (r) {
      if (MC.page !== 'users') return;
      var d = (r && r.ok && r.body) || {};
      var items = d.items || [];
      MC.userList = items;
      el.innerHTML = head(dz('注册用户信息', 'Registered users'),
        dz('每一个注册账号的全量档案：注册时间、来源、记忆条数、接入状态、套餐。',
           'Every registered account, in full.'),
        '<span class="mc-note" style="border:0;background:none">' + n0(d.total) + ' ' +
        esc(dz('个账号', 'accounts')) + '</span>') +
        '<div class="mc-card"><div class="mc-scroll"><table class="mc-tbl">' +
          '<thead><tr><th>' + esc(dz('用户', 'User')) + '</th><th>' + esc(dz('角色', 'Role')) +
          '</th><th class="num">' + esc(dz('记忆', 'Memories')) + '</th><th>' + esc(dz('接入', 'Setup')) +
          '</th><th>' + esc(dz('套餐', 'Plan')) + '</th><th>' + esc(dz('注册来源', 'Source')) +
          '</th><th>' + esc(dz('注册时间', 'Joined')) +
          '</th><th>' + esc(dz('最后写入', 'Last write')) + '</th><th></th></tr></thead><tbody>' +
          items.map(function (u) {
            return '<tr><td><div style="display:flex;align-items:center;gap:8px">' +
              '<span style="width:24px;height:24px;border-radius:7px;background:var(--surface-3);' +
              'display:grid;place-items:center;font-size:10.5px;font-weight:650">' + esc(initials(u.display_name || u.email)) + '</span>' +
              '<span><div style="font-size:12px">' + esc(u.display_name || u.email) + '</div>' +
              '<div style="font-size:10.5px;color:var(--fg3)">' + esc(u.email) + '</div></span></div></td>' +
              '<td>' + (u.role === 'admin' ? '<span class="mc-tag pri">ADMIN</span>' : '<span class="mc-tag">member</span>') +
                (u.account_source === 'profile_only' ? ' <span class="mc-tag" style="opacity:.7">' + esc(dz('仅资料', 'profile only')) + '</span>' : '') + '</td>' +
              '<td class="num">' + n0(u.memories) + '</td>' +
              '<td>' + (u.onboarded ? '<span class="mc-pill ok"><i></i>' + esc(dz('已接通', 'On')) + '</span>'
                                    : '<span class="mc-pill"><i></i>' + esc(dz('未配置', 'Off')) + '</span>') + '</td>' +
              '<td>' + esc(u.plan_zh || u.plan) +
                '<div style="font-size:10px;color:var(--fg3)">' +
                esc(u.plan_price > 0 ? ('¥' + u.plan_price + ' / 30 天') :
                    (u.plan_price === -1 ? dz('面议', 'quoted') : dz('免费', 'free'))) + '</div>' +
                (u.plan_expires ? '<div style="font-size:10px;color:var(--fg3)">' +
                  esc(dz('至 ', 'to ') + u.plan_expires.slice(0, 10)) + '</div>' : '') + '</td>' +
              '<td>' + esc(providerLabel(u.provider)) + '</td>' +
              '<td style="white-space:nowrap;color:var(--fg3);font-variant-numeric:tabular-nums">' +
                esc(u.created ? fmtTime(u.created) : '—') + '</td>' +
              '<td style="white-space:nowrap;color:var(--fg3)">' + esc(u.last_write ? ago(u.last_write) : '—') + '</td>' +
              '<td style="white-space:nowrap">' +
                '<button class="mc-btn sm" data-act="view-user" data-email="' + esc(u.email) + '">' +
                  esc(dz('查看数据', 'Inspect')) + '</button> ' +
                '<button class="mc-btn sm" data-act="user-delete" data-email="' + esc(u.email) + '" ' +
                  'style="color:#b42318">' + esc(dz('删除', 'Delete')) + '</button></td></tr>';
          }).join('') + '</tbody></table></div></div>' +
        '';
      icons();
    });
  };

  /* 注册来源 → 中文。provider 由注册时写入（password / github / google …）。 */
  function providerLabel(p) {
    var k = String(p || '').toLowerCase();
    return ({ password: dz('邮箱注册', 'Email'), github: 'GitHub', google: 'Google',
              wechat: dz('微信', 'WeChat'), oauth: 'OAuth' })[k] || (k || '—');
  }

  /* 「查看数据」用弹窗而不是行内展开：
     行内展开会把表格推得很长，一次只能看一个人，也没法边看边对照；
     弹窗与「扫码支付」「接入向导」的交互也保持一致。 */
  function openUser(email) {
    var host = document.getElementById('mc-usermodal');
    if (!host) {
      document.body.insertAdjacentHTML('beforeend', '<div id="mc-usermodal"></div>');
      host = document.getElementById('mc-usermodal');
    }
    host.innerHTML = '<div class="mc-mask" data-act="close-user-mask"><div class="mc-modal" style="max-width:820px">' +
      '<div class="mb">' + loading() + '</div></div></div>';
    api('/api/dash/user?email=' + encodeURIComponent(email)).then(function (r) {
      var d = (r && r.ok && r.body) || {};
      var u = d.user || {}, m = d.memory || {};
      if (!u.email) {
        host.innerHTML = '<div class="mc-mask" data-act="close-user-mask"><div class="mc-modal" style="max-width:420px">' +
          '<div class="mb"><div class="mc-note bad">' + esc(dz('读取失败', 'Failed')) + '</div></div></div></div>';
        return;
      }
      var max = Math.max(1, Math.max.apply(null, (m.days || []).map(function (x) { return x.n; }).concat([1])));
      host.innerHTML = '<div class="mc-mask" data-act="close-user-mask"><div class="mc-modal" style="max-width:820px">' +
        '<div class="mh"><div class="st">' + esc(dz('用户档案', 'User record')) +
        '</div><h2>' + esc(u.display_name || u.email) + '</h2><p>' + esc(u.email) + ' · ' + esc(u.provider) + '</p></div>' +
        '<div class="mb">' +
        '<div class="mc-row" style="justify-content:flex-end;margin-bottom:8px">' +
          '<button class="mc-btn sm pri" data-act="as-user" data-email="' + esc(u.email) +
            '" data-ns="' + esc(u.namespace) + '">' + esc(dz('以该用户视角浏览', 'View as this user')) + '</button>' +
        '</div>' +
        '<div class="mc-grid mc-g4" style="margin-top:12px">' +
          '<div class="mc-kv"><span class="k">' + esc(dz('注册时间', 'Joined')) + '</span><span class="v">' +
            esc(u.created ? fmtTime(u.created) : '—') + '</span></div>' +
          '<div class="mc-kv"><span class="k">' + esc(dz('注册 IP', 'IP')) + '</span><span class="v">' +
            esc(u.ip || '—') + '</span></div>' +
          '<div class="mc-kv"><span class="k">' + esc(dz('套餐', 'Plan')) + '</span><span class="v">' +
            esc((u.plan_zh || u.plan) +
                (u.plan_price > 0 ? ' · ¥' + u.plan_price + ' / 30 天'
                                  : (u.plan_price === -1 ? ' · ' + dz('面议', 'quoted') : ' · ' + dz('免费', 'free')))) +
            '</span></div>' +
          '<div class="mc-kv"><span class="k">' + esc(dz('命名空间', 'Namespace')) + '</span><span class="v" style="font-family:monospace;font-size:11px">' +
            esc(u.namespace) + '</span></div>' +
        '</div>' +
        '<div class="mc-h2">' + esc(dz('记忆实况', 'Memory')) + '</div>' +
        '<div class="mc-grid mc-g4">' +
          kpi(dz('总条数', 'Total'), n0(m.total), '', 'brain') +
          kpi(dz('活跃', 'Active'), n0(m.active), '', 'check-circle') +
          kpi(dz('已删除', 'Deleted'), n0(m.deleted), '', 'trash-2') +
          kpi(dz('账本校验', 'Ledger'), (m.ledger && m.ledger.valid ? dz('通过', 'valid') : dz('未知', 'n/a')), '', 'shield') +
        '</div>' +
        '<div class="mc-h2">' + esc(dz('逐日写入', 'Daily writes')) + '</div>' +
        '<div style="display:flex;align-items:flex-end;gap:2px;height:70px">' +
          (m.days || []).slice(-60).map(function (x) {
            return '<div style="flex:1;height:100%;display:flex;align-items:flex-end" title="' + esc(x.day + ': ' + x.n) + '">' +
              '<div style="width:100%;height:' + Math.max(2, Math.round(x.n * 64 / max)) +
              'px;background:var(--accent-deep);border-radius:2px 2px 0 0"></div></div>';
          }).join('') + '</div>' +
        '<div class="mc-h2">' + esc(dz('最近记忆', 'Latest memories')) + '</div>' +
        '<div class="mc-scroll"><table class="mc-tbl"><thead><tr><th>' + esc(dz('内容', 'Content')) +
          '</th><th>' + esc(dz('类型', 'Type')) + '</th><th>' + esc(dz('写入', 'Written')) + '</th></tr></thead><tbody>' +
          (m.items || []).slice(0, 40).map(function (x) {
            return '<tr><td style="max-width:520px"><div style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' +
              esc(x.excerpt) + '</div></td><td><span class="mc-tag pri">' + esc(x.kind) + '</span></td>' +
              '<td style="white-space:nowrap;color:var(--fg3)">' + esc(ago(x.created)) + '</td></tr>';
          }).join('') + '</tbody></table></div>' +
        '</div></div></div>';
      icons();
    });
  }

  /* ---- 工具台 ----------------------------------------------------------- */
  PAGES.tools = function (el) {
    el.innerHTML = head(dz('工具台', 'Toolbox'),
      dz('8.1.0 的 52 个工具，全部可以在这里填参执行并看原始返回。',
         'All 52 tools of 8.1.0 — fill arguments, run, read the raw result.')) + loading();
    api('/api/dash/tools').then(function (r) {
      if (MC.page !== 'tools') return;
      var d = (r && r.ok && r.body) || {};
      var groups = d.groups || [];
      el.innerHTML = head(dz('工具台', 'Toolbox'),
        dz('8.1.0 的 52 个工具，全部可以在这里填参执行并看原始返回。',
           'All 52 tools of 8.1.0 — fill arguments, run, read the raw result.'),
        '<span class="mc-note" style="border:0;background:none">' + n0(d.total) + ' ' +
        esc(dz('个工具', 'tools')) + (d.live_total ? '' : '') + '</span>') +
        (d.offline ? '<div class="mc-note warn" style="margin-bottom:12px">' + esc(dz(
          '网关暂时取不到实时参数定义，下面按 8.1.0 的内置目录展示 ' + (d.catalog_total || 52) +
          ' 个工具；执行仍需要网关在线。',
          'Live schemas unavailable; showing the built-in catalogue of ' + (d.catalog_total || 52) +
          ' tools. Running still needs the gateway.')) + '</div>' : '') +
        '<div class="mc-grid mc-g2">' + groups.map(function (g) {
          return '<div class="mc-card pad">' +
            '<div class="mc-row" style="justify-content:space-between;margin-bottom:6px">' +
              '<b style="font-size:12.5px">' + esc(zhNow() ? g.zh : g.en) + '</b>' +
              '<span class="mc-tag">' + (g.count || 0) + '</span></div>' +
            (g.tools || []).map(function (t) {
              if (t.missing) return '<div class="mc-li"><span class="mc-dot bad"></span>' +
                '<span class="grow"><span class="t" style="font-family:monospace">' + esc(t.name) +
                '</span><span class="s">' + esc(dz('网关没有这个工具', 'Missing on the gateway')) + '</span></span></div>';
              return '<div class="mc-li"><span class="mc-dot"></span>' +
                '<span class="grow"><span class="t" style="font-family:monospace">' + esc(t.name) + '</span>' +
                '<span class="s">' + esc((t.desc || '').slice(0, 110)) + '</span></span>' +
                '<button class="mc-btn sm" data-act="tool" data-name="' + esc(t.name) + '">' +
                esc(dz('运行', 'Run')) + '</button></div>';
            }).join('') + '</div>';
        }).join('') + '</div>' +
        '<div id="mc-toolbox" style="margin-top:12px"></div>';
      MC.toolGroups = groups;
      icons();
    });
  };

  function openTool(name) {
    var box = document.getElementById('mc-toolbox');
    if (!box) return;
    var tool = null;
    (MC.toolGroups || []).forEach(function (g) {
      (g.tools || []).forEach(function (t) { if (t.name === name) tool = t; });
    });
    var schema = (tool && tool.schema) || {};
    var props = schema.properties || {};
    var fields = Object.keys(props).map(function (k) {
      var p = props[k] || {};
      var type = p.type || 'string';
      if (type === 'boolean') {
        return '<label class="mc-row" style="margin-bottom:8px"><input type="checkbox" data-arg="' + esc(k) +
          '" data-type="boolean"><span style="font-size:12px">' + esc(k) + '</span>' +
          '<span style="font-size:11px;color:var(--fg3)">' + esc(p.description || '') + '</span></label>';
      }
      return '<div class="mc-fld"><label class="mc-lab">' + esc(k) +
        (p.required || (schema.required || []).indexOf(k) >= 0 ? ' *' : '') +
        (p.description ? ' — ' + esc(String(p.description).slice(0, 90)) : '') + '</label>' +
        '<input class="mc-inp" style="width:100%" data-arg="' + esc(k) + '" data-type="' + esc(type) +
        '" placeholder="' + esc(type) + '"></div>';
    }).join('');
    box.innerHTML = '<div class="mc-card pad">' +
      '<div class="mc-row" style="justify-content:space-between">' +
        '<b style="font-family:monospace;font-size:13px">' + esc(name) + '</b>' +
        '<button class="mc-btn sm" data-act="close-tool">' + esc(dz('关闭', 'Close')) + '</button></div>' +
      '<p class="mc-p">' + esc((tool && tool.desc) || '') + '</p>' +
      (fields ? '<div style="margin-top:10px">' + fields + '</div>'
              : '<div class="mc-note">' + esc(dz('这个工具不需要参数。', 'No arguments.')) + '</div>') +
      '<button class="mc-btn pri" data-act="tool-run" data-name="' + esc(name) + '">' +
        esc(dz('执行', 'Execute')) + '</button>' +
      '<div id="mc-toolres" style="margin-top:10px"></div></div>';
  }

  /* ---- 审计 ------------------------------------------------------------- */
  PAGES.audit = function (el) {
    el.innerHTML = head(dz('审计日志', 'Audit log'),
      dz('谁在什么时候改了什么。写不进去的动作不会出现在这里 —— 只记成功的。',
         'Who changed what, and when. Only successful actions are recorded.')) + loading();
    api('/api/dash/audit').then(function (r) {
      if (MC.page !== 'audit') return;
      var d = (r && r.ok && r.body) || {};
      var items = d.items || [];
      el.innerHTML = head(dz('审计日志', 'Audit log'),
        dz('谁在什么时候改了什么。写不进去的动作不会出现在这里 —— 只记成功的。',
           'Who changed what, and when. Only successful actions are recorded.'),
        '<span class="mc-note" style="border:0;background:none">' + n0(d.total) + '</span>') +
        (items.length ? '<div class="mc-card"><div class="mc-scroll"><table class="mc-tbl">' +
          '<thead><tr><th>' + esc(dz('时间', 'When')) + '</th><th>' + esc(dz('动作', 'Action')) +
          '</th><th>' + esc(dz('对象', 'Target')) + '</th><th>' + esc(dz('操作者', 'Who')) +
          '</th><th>' + esc(dz('详情', 'Detail')) + '</th></tr></thead><tbody>' +
          items.map(function (a) {
            return '<tr><td style="white-space:nowrap">' + esc(String(a.at || '').replace('T', ' ')) + '</td>' +
              '<td><span class="mc-tag pri">' + esc(a.kind) + '</span></td>' +
              '<td style="font-family:monospace;font-size:11px">' + esc(a.target || '') + '</td>' +
              '<td>' + esc(a.who || '—') + '</td>' +
              '<td style="color:var(--fg3);font-size:11px">' + esc(JSON.stringify(a.detail || {}).slice(0, 90)) + '</td></tr>';
          }).join('') + '</tbody></table></div></div>'
          : '<div class="mc-card">' + empty('scroll-text', dz('还没有审计记录', 'No entries yet'),
              dz('改配置、确认订单、跑巩固都会记一条。', 'Config changes and confirmations land here.')) + '</div>');
      icons();
    });
  };

  /* ---- 后台 · 订单管理（2026-10-23 SaaS）-------------------------------- */
  /* 列表 + 筛选 + 搜索 + 详情展开 + 两个手动操作。
     推广期订单（billing_interval='promotional' 且金额 0）用浅灰底标出来 ——
     否则它和真实付费订单长得一样，运营会误以为"有人白拿"。 */
  PAGES.orders = function (el) {
    var st = MC.orders || (MC.orders = { status: '', tier: '', q: '', page: 1 });
    function userTip(o) {
      var u = o.user || {};
      return [dz('邮箱：', 'Email: ') + (o.user_id || ''),
              u.name ? dz('名称：', 'Name: ') + u.name : '',
              u.registered_at ? dz('注册：', 'Joined: ') +
                String(u.registered_at).replace('T', ' ').slice(0, 19) : '',
              u.source ? dz('来源：', 'Source: ') + u.source : '',
              u.last_login ? dz('最近登录：', 'Last login: ') +
                String(u.last_login).replace('T', ' ').slice(0, 19) : '',
              dz('当前层级：', 'Tier: ') + ((o.subscription || {}).tier || 'free'),
              u.memories ? dz('记忆条数：', 'Memories: ') + u.memories : ''
             ].filter(Boolean).join('\n');
    }
    function row(o) {
      var promo = o.is_promotional_row;
      var pill = o.status === 'active'
          ? '<span class="mc-pill ok"><i></i>' + esc(dz('已生效', 'Active')) + '</span>'
        : o.status === 'promotional_active'
          ? '<span class="mc-pill"><i></i>' + esc(dz('推广期', 'Promotional')) + '</span>'
        : o.status === 'promotional_expired'
          ? '<span class="mc-pill warn"><i></i>' + esc(dz('推广期已结束', 'Promo ended')) + '</span>'
        : o.status === 'past_due'
          ? '<span class="mc-pill warn"><i></i>' + esc(dz('逾期', 'Past due')) + '</span>'
        : o.status === 'canceled'
          ? '<span class="mc-pill"><i></i>' + esc(dz('已取消', 'Canceled')) + '</span>'
        : '<span class="mc-pill"><i></i>' + esc(o.status || '—') + '</span>';
      var amt = promo ? '—' : '$' + (Number(o.amount_cents || 0) / 100).toFixed(2);
      var bg = promo ? ' style="background:var(--bg2)"' : '';
      return '<tr' + bg + ' data-act="order-detail" data-id="' + esc(o.id) + '" style="cursor:pointer">' +
        '<td style="font-family:monospace;font-size:11px">' + esc(o.id) + '</td>' +
        /* 用户列：邮箱 + 注册时间 + 来源。
           核对付款必须能对上"这是谁"，只有订单号没法核对（用户原话）。 */
        '<td data-tip="' + esc(userTip(o)) + '">' +
          '<div style="font-size:12px">' + esc(o.user_id) + '</div>' +
          '<div style="font-size:10.5px;color:var(--fg3);margin-top:2px">' +
            esc((o.user && o.user.registered_at ? dz('注册 ', 'Joined ') +
                 String(o.user.registered_at).replace('T', ' ').slice(0, 10) : '') +
                (o.user && o.user.source ? ' · ' + o.user.source : '')) + '</div></td>' +
        '<td><span class="mc-tag">' + esc(o.tier) + '</span></td>' +
        '<td>' + esc(o.billing_interval || '') + '</td>' +
        '<td class="num">' + esc(amt) + '</td>' +
        '<td>' + pill + '</td>' +
        '<td style="white-space:nowrap;color:var(--fg3);font-size:11px">' +
          esc(String(o.created_at || '').replace('T', ' ').slice(0, 16)) + '</td>' +
        '<td style="white-space:nowrap;color:var(--fg3);font-size:11px">' +
          esc(String(o.expires_at || '').replace('T', ' ').slice(0, 16) || '—') + '</td></tr>';
    }
    function draw(d) {
      var items = d.items || [];
      el.innerHTML = head(dz('订单管理', 'Orders'),
        dz('推广期订单用浅灰底标出：金额为 0，不是漏付。',
           'Promotional orders are shaded grey: amount is zero by design.'),
        '<span class="mc-note" style="border:0;background:none">' + n0(d.total) + '</span>') +
        '<div class="mc-card pad" style="margin-bottom:12px">' +
        '<div class="mc-row" style="gap:8px;flex-wrap:wrap">' +
        '<select class="mc-inp" id="o-status" style="width:150px">' +
        ['', 'active', 'promotional_active', 'promotional_expired', 'past_due', 'canceled']
          .map(function (v) {
            return '<option value="' + v + '"' + (st.status === v ? ' selected' : '') + '>' +
              esc(v || dz('全部状态', 'All statuses')) + '</option>';
          }).join('') + '</select>' +
        '<select class="mc-inp" id="o-tier" style="width:120px">' +
        ['', 'free', 'pro', 'team'].map(function (v) {
          return '<option value="' + v + '"' + (st.tier === v ? ' selected' : '') + '>' +
            esc(v || dz('全部层级', 'All tiers')) + '</option>';
        }).join('') + '</select>' +
        '<input class="mc-inp" id="o-q" placeholder="' + esc(dz('邮箱或订单号', 'Email or order id')) +
          '" value="' + esc(st.q) + '" style="flex:1;min-width:180px">' +
        '<button class="mc-btn pri" data-act="order-search">' + esc(dz('搜索', 'Search')) + '</button>' +
        '</div></div>' +
        (items.length ? '<div class="mc-card"><div class="mc-scroll"><table class="mc-tbl">' +
          '<thead><tr><th>ID</th><th>' + esc(dz('用户', 'User')) + '</th><th>' + esc(dz('层级', 'Tier')) +
          '</th><th>' + esc(dz('周期', 'Interval')) + '</th><th class="num">' + esc(dz('金额', 'Amount')) +
          '</th><th>' + esc(dz('状态', 'Status')) + '</th><th>' + esc(dz('创建', 'Created')) +
          '</th><th>' + esc(dz('到期', 'Expires')) + '</th></tr></thead><tbody>' +
          items.map(row).join('') + '</tbody></table></div></div>'
          : '<div class="mc-card">' + empty('receipt', dz('没有匹配的订单', 'No matching orders'),
              dz('换个筛选条件试试。', 'Try different filters.')) + '</div>') +
        '<div id="mc-order-detail"></div>';
      icons();
    }
    function load() {
      el.innerHTML = head(dz('订单管理', 'Orders'), dz('加载中…', 'Loading…')) + loading();
      var q = [];
      if (st.status) q.push('status=' + encodeURIComponent(st.status));
      if (st.tier) q.push('tier=' + encodeURIComponent(st.tier));
      if (st.q) q.push('q=' + encodeURIComponent(st.q));
      api('/api/admin/orders' + (q.length ? '?' + q.join('&') : '')).then(function (r) {
        if (MC.page !== 'orders') return;
        draw((r && r.ok && r.body) || {});
      });
    }
    MC.ordersLoad = load;
    load();
  };

  /* ---- 后台 · 在线用户（2026-10-23 增长分析）---------------------------- */
  /* 每 10 秒轮询一次（指令 §6.3）。页面切走时停表 —— 否则后台开着这个页
     会一直打请求，而管理员其实已经去别的页了。 */
  PAGES.visitors = function (el) {
    var st = MC.visitors || (MC.visitors = { kind: 'all', country: '', tier: '', q: '' });
    function draw(d) {
      var items = d.items || [];
      el.innerHTML = head(dz('在线用户', 'Visitors'),
        dz('最近 ' + (d.online_window_seconds || 90) + ' 秒内有心跳的访客。每 10 秒自动刷新。',
           'Visitors with a heartbeat in the last ' + (d.online_window_seconds || 90) +
           's. Refreshes every 10s.'),
        '<span class="mc-note" style="border:0;background:none">' + n0(d.count) + '</span>') +
        '<div class="mc-card pad" style="margin-bottom:12px">' +
        '<div class="mc-row" style="gap:8px;flex-wrap:wrap">' +
        '<select class="mc-inp" id="v-kind" style="width:150px">' +
        [['all', dz('全部', 'All')], ['registered', dz('仅已注册', 'Registered only')],
         ['anonymous', dz('仅匿名', 'Anonymous only')]].map(function (p) {
          return '<option value="' + p[0] + '"' + (st.kind === p[0] ? ' selected' : '') + '>' +
            esc(p[1]) + '</option>';
        }).join('') + '</select>' +
        '<input class="mc-inp" id="v-country" placeholder="' + esc(dz('国家代码', 'Country')) +
          '" value="' + esc(st.country) + '" style="width:110px">' +
        '<input class="mc-inp" id="v-q" placeholder="' + esc(dz('IP / 邮箱 / 国家', 'IP / email / country')) +
          '" value="' + esc(st.q) + '" style="flex:1;min-width:160px">' +
        '<button class="mc-btn pri" data-act="visitor-search">' + esc(dz('筛选', 'Filter')) + '</button>' +
        '<button class="mc-btn" data-act="visitor-csv">' + esc(dz('导出 CSV', 'Export CSV')) + '</button>' +
        '</div></div>' +
        (items.length ? '<div class="mc-card"><div class="mc-scroll"><table class="mc-tbl">' +
          '<thead><tr><th>IP</th><th>' + esc(dz('地区', 'Geo')) + '</th><th>' + esc(dz('身份', 'Identity')) +
          '</th><th>' + esc(dz('层级', 'Tier')) + '</th><th>' + esc(dz('当前页面', 'Page')) +
          '</th><th class="num">' + esc(dz('驻留', 'Dwell')) + '</th><th class="num">' +
          esc(dz('访问次数', 'Visits')) + '</th></tr></thead><tbody>' +
          items.map(function (v) {
            var who = v.is_registered
              ? '<span class="mc-pill ok"><i></i>' + esc(v.email) + '</span>'
              : '<span class="mc-tag">' + esc(dz('匿名', 'anonymous')) + '</span>';
            var dwell = Number(v.total_dwell_seconds || 0);
            var ds = dwell >= 60 ? Math.floor(dwell / 60) + 'm ' + (dwell % 60) + 's' : dwell + 's';
            return '<tr data-act="visitor-detail" data-sid="' + esc(v.session_id) + '" style="cursor:pointer">' +
              '<td style="font-family:monospace;font-size:11px">' + esc(v.ip_address || '—') + '</td>' +
              '<td>' + esc([v.country_code, v.city].filter(Boolean).join(' / ') || '—') + '</td>' +
              '<td>' + who + '</td>' +
              '<td>' + esc(v.tier || '—') + '</td>' +
              '<td style="font-family:monospace;font-size:11px">' + esc(v.current_page || '—') + '</td>' +
              '<td class="num">' + esc(ds) + '</td>' +
              '<td class="num">' + esc(v.visit_count || 1) + '</td></tr>';
          }).join('') + '</tbody></table></div></div>'
          : '<div class="mc-card">' + empty('activity', dz('当前没有在线访客', 'No one online right now'),
              dz('打开一个页面就会出现在这里。', 'Open a page and it shows up here.')) + '</div>') +
        '<div id="mc-visitor-detail"></div>';
      icons();
    }
    function load(silent) {
      if (!silent) el.innerHTML = head(dz('在线用户', 'Visitors'), dz('加载中…', 'Loading…')) + loading();
      var q = ['online=1'];
      if (st.kind && st.kind !== 'all') q.push('kind=' + encodeURIComponent(st.kind));
      if (st.country) q.push('country=' + encodeURIComponent(st.country));
      if (st.q) q.push('q=' + encodeURIComponent(st.q));
      api('/api/admin/visitors/online?' + q.join('&')).then(function (r) {
        if (MC.page !== 'visitors') return;
        draw((r && r.ok && r.body) || {});
      });
    }
    if (MC.visitorTimer) clearInterval(MC.visitorTimer);
    MC.visitorTimer = setInterval(function () {
      if (MC.page !== 'visitors') { clearInterval(MC.visitorTimer); MC.visitorTimer = null; return; }
      load(true);
    }, 10000);
    MC.visitorsLoad = load;
    load();
  };

  /* ---- 文档 / MCP / 更新日志 -------------------------------------------- */
  /* ---- 后台 · 访问日志（2026-10-23）--------------------------------------
     与「在线用户」的分工：
       · 在线用户 = 此刻谁在线（90 秒内有心跳），看"现在"；
       · 访问日志 = 谁来过、什么结果、安全状态如何，看"历史"，分页 50 条。
     数据来自两处合并：第一方访客表（有停留时长/在线状态）+ Cloudflare
     边缘事件（有被 WAF 拦掉的请求和爬虫）。合并逻辑在后端，这里只渲染。 */
  PAGES.accesslog = function (el) {
    var st = MC.access || (MC.access = { page: 1, kind: 'all', q: '', online: 0 });

    function pill(kind, text) {
      var cls = kind === 'ok' ? 'ok' : kind === 'warn' ? 'warn'
              : kind === 'danger' ? 'bad' : '';
      return '<span class="mc-pill ' + cls + '"><i></i>' + esc(text) + '</span>';
    }

    function draw(d) {
      var items = d.items || [];
      var zh = zhNow();
      var note = d.cf_configured ? '' :
        '<div class="mc-note" style="margin-bottom:12px;border-color:#f0c36d;' +
        'background:#fff8e6;color:#7a5b00">' +
        esc(dz('Cloudflare API 未配置：当前只显示本站访客数据，' +
               '被防火墙拦截的请求和爬虫看不到。配置 CF_API_TOKEN / CF_ZONE_ID 后即可合并。',
               'Cloudflare API not configured — only first-party data is shown.')) +
        '</div>';

      var rows = items.length ? items.map(function (x) {
        var on = x.online;
        return '<tr>' +
          '<td>' + pill(on ? 'ok' : '', on ? dz('在线', 'Online') : dz('离线', 'Offline')) + '</td>' +
          '<td class="num" style="white-space:nowrap">' + esc(fmtTime(x.at_iso)) + '</td>' +
          '<td class="num" style="white-space:nowrap">' + esc(fmtTime(x.last_seen_iso)) + '</td>' +
          '<td style="font-family:monospace;font-size:11.5px">' + esc(x.ip || '—') + '</td>' +
          '<td>' + esc(countryName(x.country)) + (x.city ? ' · ' + esc(x.city) : '') + '</td>' +
          '<td style="max-width:240px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" ' +
            'title="' + esc((x.paths || []).join(' → ') || x.path || '') + '">' +
            esc(x.path || (x.paths && x.paths[x.paths.length - 1]) || '—') + '</td>' +
          '<td class="num">' + (x.dwell ? esc(fmtDwell(x.dwell)) : '—') + '</td>' +
          '<td>' + esc(x.kind_label || '—') + '</td>' +
          '<td>' + pill(x.result === 'ok' ? 'ok' : 'warn', x.result_label || '—') + '</td>' +
          '<td>' + pill(x.security, x.security_label || '—') + '</td>' +
          '</tr>';
      }).join('') : '<tr><td colspan="10" style="text-align:center;padding:26px;color:var(--fg3)">' +
        esc(dz('还没有访问记录', 'No records yet')) + '</td></tr>';

      var pager = '<div class="mc-row" style="justify-content:space-between;align-items:center;margin-top:12px">' +
        '<span class="mc-note" style="border:0;background:none">' +
          esc(dz('第 ' + d.page + ' / ' + d.pages + ' 页 · 共 ' + d.total + ' 条',
                 'Page ' + d.page + ' / ' + d.pages + ' · ' + d.total + ' rows')) +
        '</span>' +
        '<span class="mc-row" style="gap:8px">' +
          '<button class="mc-btn sm" data-act="access-page" data-page="' + (d.page - 1) + '"' +
            (d.page <= 1 ? ' disabled' : '') + '>' + esc(dz('上一页', 'Prev')) + '</button>' +
          '<button class="mc-btn sm" data-act="access-page" data-page="' + (d.page + 1) + '"' +
            (d.page >= d.pages ? ' disabled' : '') + '>' + esc(dz('下一页', 'Next')) + '</button>' +
        '</span></div>';

      el.innerHTML = head(dz('访问日志', 'Access log'), '',
        '<span class="mc-pill ok"><i></i>' + esc(dz('在线 ' + (d.online_count || 0),
                                                   d.online_count + ' online')) + '</span>') +
        '<div id="a-summary"></div>' +
        note +
        '<div class="mc-card pad" style="margin-bottom:12px">' +
          '<div class="mc-row" style="gap:8px;flex-wrap:wrap">' +
            '<select class="mc-inp" id="a-kind" style="width:150px">' +
              [['all', dz('全部来源', 'All')], ['human', dz('真人', 'Human')],
               ['bot', dz('AI / 机器人', 'Bots')], ['unknown', dz('未知', 'Unknown')]]
                .map(function (kv) {
                  return '<option value="' + kv[0] + '"' +
                    (st.kind === kv[0] ? ' selected' : '') + '>' + esc(kv[1]) + '</option>';
                }).join('') + '</select>' +
            '<input class="mc-inp" id="a-q" style="flex:1;min-width:180px" ' +
              'placeholder="' + esc(dz('搜 IP / 国家 / 页面 / UA', 'IP / country / path / UA')) + '" ' +
              'value="' + esc(st.q || '') + '">' +
            '<button class="mc-btn" data-act="access-search">' + esc(dz('搜索', 'Search')) + '</button>' +
            '<button class="mc-btn" data-act="access-sync">' +
              '<i data-lucide="refresh-cw"></i>' + esc(dz('同步 Cloudflare', 'Sync Cloudflare')) + '</button>' +
            '<button class="mc-btn" data-act="access-backup">' +
              '<i data-lucide="database"></i>' + esc(dz('立即备份', 'Back up now')) + '</button>' +
          '</div>' +
          '<div class="mc-note" style="margin-top:10px">' + esc(d.retention_note || '') + '</div>' +
        '</div>' +
        '<div class="mc-card"><div class="mc-scroll"><table class="mc-tbl">' +
          '<thead><tr>' +
            '<th>' + esc(dz('状态', 'Status')) + '</th>' +
            '<th>' + esc(dz('访问时间', 'First seen')) + '</th>' +
            '<th>' + esc(dz('最近访问', 'Last seen')) + '</th>' +
            '<th>IP</th>' +
            '<th>' + esc(dz('国家/地区', 'Country')) + '</th>' +
            '<th>' + esc(dz('访问页面', 'Page')) + '</th>' +
            '<th>' + esc(dz('停留', 'Dwell')) + '</th>' +
            '<th>' + esc(dz('类型', 'Type')) + '</th>' +
            '<th>' + esc(dz('结果', 'Result')) + '</th>' +
            '<th>' + esc(dz('安全', 'Security')) + '</th>' +
          '</tr></thead><tbody>' + rows + '</tbody></table></div></div>' + pager;
      icons();
      loadSummary();
    }

    /* ---- Cloudflare 概览卡片 ---------------------------------------------
       对应 CF 面板顶部那三块：唯一访问者 / 请求总数 / 已缓存百分比，
       另加被拦截请求与 30 天曲线。数据来自 /api/admin/access-log/summary。
       失败时显示原因（未配置 / 权限不足），不显示 0 —— 0 会被当成"没人访问"。 */
    function loadSummary() {
      var box = document.getElementById('a-summary');
      if (!box) return;
      api('/api/admin/access-log/summary?days=30').then(function (r) {
        var d = (r && r.ok && r.body) || {};
        if (!box) return;
        if (!d.ok) {
          box.innerHTML = '<div class="mc-note" style="margin-bottom:12px;' +
            'border-color:#f0c36d;background:#fff8e6;color:#7a5b00">' +
            esc(dz('Cloudflare 概览不可用：', 'Cloudflare summary unavailable: ') +
                (d.message || d.error || 'unknown')) + '</div>';
          return;
        }
        box.innerHTML = summaryHTML(d);
        icons();
      });
    }

    function kpi(label, value, sub) {
      return '<div style="flex:1;min-width:132px;padding:14px 16px;border-radius:10px;' +
        'border:1px solid var(--hair);background:var(--bg2)">' +
        '<div style="font-size:11px;color:var(--fg3);letter-spacing:.02em">' + esc(label) + '</div>' +
        '<div style="font-size:22px;font-weight:700;margin-top:6px;letter-spacing:-.02em;' +
        'font-variant-numeric:tabular-nums">' + esc(value) + '</div>' +
        (sub ? '<div style="font-size:10.5px;color:var(--fg3);margin-top:3px">' + esc(sub) + '</div>' : '') +
        '</div>';
    }

    function summaryHTML(d) {
      var t = d.totals || {};
      var ser = d.series || [];
      var maxReq = 1;
      ser.forEach(function (x) { if (x.requests > maxReq) maxReq = x.requests; });
      var W = 640, H = 64;
      var pts = ser.map(function (x, i) {
        var px = ser.length > 1 ? i * (W / (ser.length - 1)) : 0;
        var py = H - (x.requests / maxReq) * (H - 6) - 3;
        return px.toFixed(1) + ',' + py.toFixed(1);
      }).join(' ');
      var uniPts = ser.map(function (x, i) {
        var px = ser.length > 1 ? i * (W / (ser.length - 1)) : 0;
        var mu = 1;
        ser.forEach(function (y) { if (y.uniques > mu) mu = y.uniques; });
        var py = H - (x.uniques / mu) * (H - 6) - 3;
        return px.toFixed(1) + ',' + py.toFixed(1);
      }).join(' ');

      var countries = (d.top_countries || []).slice(0, 6).map(function (c) {
        return '<div class="mc-kv"><span class="k">' + esc(countryName(c.code)) +
          '</span><span class="v">' + n0(c.count) + '</span></div>';
      }).join('') || '<div class="mc-note" style="border:0;background:none">—</div>';

      var paths = (d.top_paths || []).slice(0, 6).map(function (p) {
        return '<div class="mc-kv"><span class="k" style="font-family:monospace;font-size:11px">' +
          esc(p.path || '/') + '</span><span class="v">' + n0(p.count) + '</span></div>';
      }).join('') || '<div class="mc-note" style="border:0;background:none">—</div>';

      return '<div class="mc-card pad" style="margin-bottom:12px">' +
        '<div class="mc-row" style="justify-content:space-between;align-items:baseline">' +
          '<b style="font-size:13px">' + esc(dz('Cloudflare 概览', 'Cloudflare overview')) + '</b>' +
          '<span class="mc-note" style="border:0;background:none">' +
            esc((d.range && (d.range.from + ' ~ ' + d.range.to)) || '') + ' · ' +
            esc(dz('近 ' + d.days + ' 天', 'last ' + d.days + ' days')) + '</span></div>' +
        '<div class="mc-row" style="gap:10px;flex-wrap:wrap;margin-top:12px">' +
          kpi(dz('唯一访问者', 'Unique visitors'), n0(t.uniques), dz('逐日相加', 'sum of daily')) +
          kpi(dz('请求总数', 'Requests'), n0(t.requests), '') +
          kpi(dz('已缓存', 'Cached'), (t.cached_pct != null ? t.cached_pct + '%' : '—'),
              t.bytes ? fmtBytes(t.bytes) : '') +
          kpi(dz('威胁 / 被拦', 'Threats'), n0(t.threats), '') +
        '</div>' +
        '<div style="margin-top:14px">' +
          '<svg viewBox="0 0 ' + W + ' ' + H + '" preserveAspectRatio="none" ' +
            'style="width:100%;height:64px;display:block">' +
            '<polyline fill="none" stroke="var(--accent-deep)" stroke-width="1.6" points="' + pts + '"/>' +
            '<polyline fill="none" stroke="#8b8b8b" stroke-width="1.2" stroke-dasharray="3 3" points="' + uniPts + '"/>' +
          '</svg>' +
          '<div class="mc-row" style="justify-content:space-between;margin-top:4px;font-size:10.5px;color:var(--fg3)">' +
            '<span>' + esc(ser.length ? ser[0].date : '') + '</span>' +
            '<span>' + esc(dz('实线=请求 · 虚线=唯一访客', 'solid=requests · dashed=uniques')) + '</span>' +
            '<span>' + esc(ser.length ? ser[ser.length - 1].date : '') + '</span>' +
          '</div></div>' +
        '<div class="mc-grid mc-g2" style="margin-top:14px">' +
          '<div><div class="mc-h2" style="margin:0 0 6px;font-size:12px">' +
            esc(dz('访问来源国家/地区', 'Top countries')) + '</div>' + countries + '</div>' +
          '<div><div class="mc-h2" style="margin:0 0 6px;font-size:12px">' +
            esc(dz('热门路径', 'Top paths')) + '</div>' + paths + '</div>' +
        '</div>' +
        '<div class="mc-note" style="margin-top:10px">' + esc(d.plan_note || '') + '</div>' +
        '</div>';
    }

    function fmtBytes(b) {
      var n = Number(b) || 0;
      if (n > 1e9) return (n / 1e9).toFixed(2) + ' GB';
      if (n > 1e6) return (n / 1e6).toFixed(1) + ' MB';
      if (n > 1e3) return (n / 1e3).toFixed(1) + ' KB';
      return n + ' B';
    }

    /* 国家代码 → 中文名。用浏览器内置的 Intl.DisplayNames（Chrome/Safari/Edge
       都支持），拿不到再退回一个常见国家的兜底表，最后才显示原始代码 ——
       宁可显示 "KR" 也不要显示空白。 */
    var CN_FALLBACK = { CN: '中国', HK: '中国香港', TW: '中国台湾', MO: '中国澳门',
      US: '美国', JP: '日本', KR: '韩国', SG: '新加坡', GB: '英国', DE: '德国',
      FR: '法国', CA: '加拿大', AU: '澳大利亚', IN: '印度', RU: '俄罗斯',
      NL: '荷兰', BR: '巴西', VN: '越南', TH: '泰国', MY: '马来西亚', ID: '印度尼西亚' };
    function countryName(code) {
      var c = String(code || '').toUpperCase();
      if (!c) return '—';
      if (!zhNow()) return c;
      /* 港澳台必须写成"中国香港 / 中国台湾 / 中国澳门"。
         Intl.DisplayNames 会返回"香港""台湾"，不能直接用 —— 所以这三个
         先查固定表，命中就返回，不给 Intl 覆盖的机会。 */
      var FIXED = { CN: '中国', HK: '中国香港', TW: '中国台湾', MO: '中国澳门' };
      if (FIXED[c]) return FIXED[c];
      try {
        if (window.Intl && Intl.DisplayNames) {
          var n = new Intl.DisplayNames(['zh-CN'], { type: 'region' }).of(c);
          if (n && n !== c) return n;
        }
      } catch (e) { /* 落到兜底表 */ }
      return CN_FALLBACK[c] || c;
    }

    function fmtTime(s) {
      if (!s) return '—';
      /* 后端统一出 ISO（UTC 或本地）。这里只做「YYYY-MM-DD HH:MM:SS」的截取，
         不在浏览器里再做时区换算 —— 换算过一次已经出过"时间对不上"的问题。 */
      return String(s).replace('T', ' ').replace('Z', '').slice(0, 19);
    }
    function fmtDwell(sec) {
      var s = Math.max(0, Number(sec) || 0);
      if (s < 60) return s + 's';
      if (s < 3600) return Math.floor(s / 60) + 'm ' + (s % 60) + 's';
      return Math.floor(s / 3600) + 'h ' + Math.floor((s % 3600) / 60) + 'm';
    }

    function load() {
      el.innerHTML = head(dz('访问日志', 'Access log'),
        dz('加载中…', 'Loading…')) + loading();
      var q = ['page=' + st.page, 'per=50'];
      if (st.kind && st.kind !== 'all') q.push('kind=' + encodeURIComponent(st.kind));
      if (st.q) q.push('q=' + encodeURIComponent(st.q));
      if (st.online) q.push('online=1');
      api('/api/admin/access-log?' + q.join('&')).then(function (r) {
        if (MC.page !== 'accesslog') return;
        draw((r && r.ok && r.body) || { page: 1, pages: 1, total: 0, items: [] });
      });
    }
    MC.accessLoad = load;
    load();
  };

  PAGES.docs = function (el) {
    var s = MC.setup || {};
    el.innerHTML = head(dz('文档', 'Docs'),
      dz('五分钟上手，不用读源码。', 'Five minutes to get going.')) +
      '<div class="mc-grid mc-g2">' +
        docCard(dz('一、装好 Agent 侧的 MCP', '1 · Wire the MCP client'),
          dz('Mnemosyne OS SaaS「接入配置」里选你的 Agent，复制那条命令执行。它会写好配置并自检。',
             'Pick your agent in Setup, copy the command, run it.')) +
        docCard(dz('二、让它真的用上记忆', '2 · Make the agent use it'),
          dz('在 Agent 的规则/系统提示里加一句：每次对话开始先 recall，结束时把结论 retain。',
             'Tell the agent: recall at the start, retain at the end.')) +
        docCard(dz('三、看它记住了什么', '3 · See what it remembers'),
          dz('「记忆库」是逐条清单，「图谱」是关系网，「使用分析」是趋势。',
             'Memories is the list, Graph the network, Analytics the trend.')) +
        docCard(dz('四、定期跑一轮梦', '4 · Run a dream cycle'),
          dz('每周跑一次巩固：合并重复、消解冲突、把成功经验固化成 playbook。',
             'Run consolidation weekly: merge, resolve, turn wins into playbooks.')) +
      '</div>' +
      '<div class="mc-card pad" style="margin-top:12px">' +
        '<div class="mc-h2" style="margin-top:0">' + esc(dz('你的接入参数', 'Your endpoint')) + '</div>' +
        '<div class="mc-kv"><span class="k">MCP URL</span><span class="v" style="font-family:monospace">' +
          esc(s.mcp_url || '—') + '</span></div>' +
        '<div class="mc-kv"><span class="k">Namespace</span><span class="v" style="font-family:monospace">' +
          esc(s.namespace || '—') + '</span></div>' +
        '<div class="mc-kv"><span class="k">' + esc(dz('工具数', 'Tools')) + '</span><span class="v">52</span></div>' +
      '</div>';
    icons();
  };

  function docCard(t, p) {
    return '<div class="mc-card pad"><b style="font-size:12.5px">' + esc(t) + '</b>' +
      '<p class="mc-p" style="margin-top:5px">' + esc(p) + '</p></div>';
  }

  PAGES.mcp = function (el) {
    var s = MC.setup || {};
    var cfg = JSON.stringify({ mcpServers: { mnemosyne: {
      type: 'http', url: s.mcp_url || '',
      headers: { Authorization: 'Bearer ' + (s.key || '') } } } }, null, 2);
    el.innerHTML = head(dz('MCP 接入', 'MCP'),
      dz('Mnemosyne 是一个标准 MCP 服务器。任何支持 MCP 的客户端都能接。',
         'Mnemosyne is a standard MCP server. Any MCP client can connect.')) +
      '<div class="mc-card pad"><div class="mc-h2" style="margin-top:0">' +
        esc(dz('通用配置', 'Generic config')) + '</div>' +
        '<div class="mc-code">' + esc(cfg) + '<span class="cp" data-copy="' + esc(cfg) + '">' +
        esc(dz('复制', 'Copy')) + '</span></div>' +
        '<div class="mc-h2">' + esc(dz('支持的能力', 'What it exposes')) + '</div>' +
        '<div class="mc-grid mc-g3">' +
          ['retain / recall / forget', '图谱与时序查询', '会话摘要与未决事项',
           '冲突消解与策略', '任务与经验（playbook）', '代码演进记录',
           '记忆巩固与度量', '画像卡与注入流水线', '导出与迁移'].map(function (x) {
            return '<div class="mc-kv"><span class="k">✓</span><span class="v">' + esc(x) + '</span></div>';
          }).join('') + '</div></div>';
    icons();
  };

  PAGES.changelog = function (el) {
    el.innerHTML = head(dz('更新日志', 'Changelog'),
      dz('Mnemosyne OS SaaS 与记忆系统的变化。', 'What changed, and when.')) +
      '<div class="mc-card pad">' +
        log('2026-10-20', dz('控制台 v9 重做', 'Console v9'),
          dz('导航重排、主题跟随站点、真实图谱、可执行的梦、注册用户全量信息、接入向导、微信扫码升级。',
             'New IA, theme-aware, real graph, runnable dreams, full user records, setup wizard, WeChat QR upgrades.')) +
        log('2026-10-19', dz('8.1.0 记忆形成层', '8.1.0 formation layer'),
          dz('会话摘要、冲突消解、任务与经验、代码演进、敏感度分级，工具面 52 个。',
             'Session summaries, conflict resolution, tasks & experience, code evolution, policy. 52 tools.')) +
        log('2026-10-06', dz('多租户隔离', 'Multi-tenant isolation'),
          dz('每个账号一个独立命名空间，物理隔离的 SQLite 与向量集合。',
             'One namespace per account: physically separate SQLite and vectors.')) +
      '</div>';
    icons();
  };

  function log(d, t, p) {
    return '<div class="mc-li"><span class="mc-tag pri">' + esc(d) + '</span>' +
      '<span class="grow"><span class="t">' + esc(t) + '</span><span class="s">' + esc(p) + '</span></span></div>';
  }

  /* ------------------------------------------------------------- 用户切换 */

  function switchListHTML(q) {
    var items = (MC.users && MC.users.items) || [];
    q = (q || '').toLowerCase();
    if (q) items = items.filter(function (u) {
      return (u.email + ' ' + (u.display_name || '')).toLowerCase().indexOf(q) >= 0;
    });
    var meEmail = sess().email;
    var html = '<div class="mc-switch"><div class="hd">' + esc(dz('切换查看的账号', 'View data as')) + '</div>' +
      '<input class="q" id="mc-switch-q" placeholder="' + esc(dz('搜索邮箱…', 'Search email…')) + '">' +
      '<div class="list">' +
      '<button class="mc-opt' + (!MC.view ? ' on' : '') + '" data-act="pick-user" data-email="">' +
        '<span class="av">★</span><span class="nm">' + esc(dz('站点默认库（我自己）', 'Site default (me)')) + '</span></button>';
    html += items.map(function (u) {
      var on = MC.view && MC.view.email === u.email;
      return '<button class="mc-opt' + (on ? ' on' : '') + '" data-act="pick-user" data-email="' +
        esc(u.email) + '" data-ns="' + esc(u.namespace) + '">' +
        '<span class="av">' + esc(initials(u.display_name || u.email)) + '</span>' +
        '<span class="nm">' + esc(u.display_name || u.email) +
          (u.email === meEmail ? ' <span style="color:var(--fg3)">(' + esc(dz('我', 'me')) + ')</span>' : '') +
        '</span><span class="n">' + n0(u.memories) + '</span></button>';
    }).join('');
    html += '</div></div>';
    return html;
  }

  function toggleSwitch(force) {
    var slot = document.getElementById('mc-switch-slot');
    if (!slot) return;
    if (slot.innerHTML && !force) { slot.innerHTML = ''; return; }
    slot.innerHTML = switchListHTML('');
    var q = document.getElementById('mc-switch-q');
    if (q) {
      q.focus();
      q.addEventListener('input', function () {
        slot.innerHTML = switchListHTML(q.value);
        var q2 = document.getElementById('mc-switch-q');
        if (q2) { q2.focus(); q2.value = q.value; q2.setSelectionRange(q.value.length, q.value.length); }
      });
    }
  }

  function pickUser(email, ns) {
    var slot = document.getElementById('mc-switch-slot');
    if (slot) slot.innerHTML = '';
    if (!email) { MC.view = null; }
    else {
      var u = ((MC.users && MC.users.items) || []).filter(function (x) { return x.email === email; })[0] || {};
      MC.view = { email: email, ns: ns || u.namespace || '', display_name: u.display_name || email };
    }
    /* 切换用户后所有缓存都失效 —— 否则会拿着上一个人的数据画图 */
    MC.data = {};
    render('#/dashboard/' + MC.page);
  }

  /* ------------------------------------------------------------------ 向导 */

  function openWizard() {
    if (MC.wizard.open) return;
    MC.wizard.open = true;
    MC.wizard.step = 1;
    document.body.insertAdjacentHTML('beforeend',
      '<div class="mc-mask" id="mc-wizard"><div class="mc-modal" id="mc-wizard-box"></div></div>');
    paintWizard();
    if (!MC.agents) {
      api('/api/dash/agents').then(function (r) {
        MC.agents = (r && r.ok && r.body) || {};
        if (MC.wizard.open && MC.wizard.step === 1) paintWizard();
      });
    }
  }

  function closeWizard(skip) {
    MC.wizard.open = false;
    if (MC.wizard.timer) { clearInterval(MC.wizard.timer); MC.wizard.timer = null; }
    var m = document.getElementById('mc-wizard');
    if (m) m.remove();
    if (skip) sessionStorage.setItem('mc-wizard-skip', '1');
  }

  function paintWizard() {
    var box = document.getElementById('mc-wizard-box');
    if (!box) return;
    var s = MC.setup || {};
    var step = MC.wizard.step;
    var steps = ['选 Agent', '一条命令', '检测', '完成'];
    var stepsEn = ['Pick agent', 'One command', 'Verify', 'Done'];
    var head2 = '<div class="mh"><div class="st">' + esc(dz('首次接入 · 必做', 'First run · required')) + '</div>' +
      '<h2>' + esc(dz('把 Mnemosyne 接到你正在用的 Agent', 'Connect Mnemosyne to your agent')) + '</h2>' +
      '<p>' + esc(dz('三步，一分钟。你只需要选一个 Agent，然后复制一条命令。',
        'Three steps, one minute. Pick an agent, copy one command.')) + '</p>' +
      '<div class="mc-steps">' + steps.map(function (t, i) {
        var n = i + 1;
        var cls = n === step ? 'on' : (n < step ? 'done' : '');
        return '<span class="s ' + cls + '"><b>' + (n < step ? '✓' : n) + '</b>' +
          esc(zhNow() ? t : stepsEn[i]) + '</span>' +
          (i < 3 ? '<span class="ln"></span>' : '');
      }).join('') + '</div></div>';

    var body2 = '', foot = '';

    if (step === 1) {
      var ag = MC.agents || {};
      body2 = '<div class="mb">' +
        '<input class="mc-inp" id="mc-agent-q" style="width:100%;margin-bottom:12px" placeholder="' +
          esc(dz('搜索：Claude / Cursor / 豆包 / 通义 / Cherry…', 'Search agents…')) + '">' +
        '<div id="mc-agent-list">' + agentGrid(ag, MC.wizard.agent) + '</div></div>';
      foot = '<div class="mf"><button class="mc-btn" data-act="wizard-skip">' +
        esc(dz('稍后再说', 'Later')) + '</button><span class="sp"></span>' +
        '<button class="mc-btn pri" data-act="wizard-next"' + (MC.wizard.agent ? '' : ' disabled') + '>' +
        esc(dz('下一步', 'Next')) + '</button></div>';
    } else if (step === 2) {
      var a = ((MC.agents && MC.agents.agents) || []).filter(function (x) { return x.id === MC.wizard.agent; })[0] || {};
      /* 不用 `irm ... | python -` 的原因有两个，都会让中文用户直接报错：
         ① Windows 上 `python -` 按控制台代码页（中文系统 cp936）读 stdin，
            脚本里的 UTF-8 字节会被解错 → SyntaxError；
         ② 老客户端对未知 charset 的文本会退回 ISO-8859-1 解码。
         改成「先落盘、再执行」，两个坑一起绕开；脚本本身也已做成纯 ASCII。 */
      var C = shellCmds(s.installer);
      var winCmd = C.ps, nixCmd = C.nix;
      body2 = '<div class="mb">' +
        '<div class="mc-note ok">' + esc(dz('已选择：', 'Selected: ') + (zhNow() ? a.zh : a.name)) + '</div>' +
        '<div class="mc-h2">' + esc(dz('复制这一条命令，在你的电脑上运行', 'Copy this command and run it')) + '</div>' +
        '<div class="mc-lab">Windows · PowerShell（推荐，Win+X 里的那个）</div>' +
        '<div class="mc-code">' + esc(C.ps) + '<span class="cp" data-copy="' + esc(C.ps) + '">' +
          esc(dz('复制', 'Copy')) + '</span></div>' +
        '<div class="mc-lab" style="margin-top:10px">Windows · 命令提示符（CMD）</div>' +
        '<div class="mc-code">' + esc(C.cmd) + '<span class="cp" data-copy="' + esc(C.cmd) + '">' +
          esc(dz('复制', 'Copy')) + '</span></div>' +
        '<div class="mc-lab" style="margin-top:10px">macOS / Linux</div>' +
        '<div class="mc-code">' + esc(nixCmd) + '<span class="cp" data-copy="' + esc(nixCmd) + '">' +
          esc(dz('复制', 'Copy')) + '</span></div>' +
        '<div class="mc-note" style="margin-top:10px">' + esc(zhNow() ? (a.zh_how || '') : (a.en_how || '')) + '</div>' +
        (a.auto ? '' : '<div class="mc-note warn" style="margin-top:8px">' + esc(dz(
          '这个客户端没有可自动写入的配置文件 —— 脚本会把该点的地方打印出来，照着做即可。',
          'This client has no auto-writable config file; the script prints the clicks you need.')) + '</div>') +
        '<div class="mc-h2">' + esc(dz('不想跑脚本？手动填两行', 'Prefer manual? Two fields')) + '</div>' +
        '<div class="mc-code">URL: ' + esc(s.mcp_url || '') + '\nAuthorization: Bearer ' + esc(s.key || '') + '</div>' +
        '</div>';
      foot = '<div class="mf"><button class="mc-btn" data-act="wizard-back">' + esc(dz('返回', 'Back')) + '</button>' +
        '<span class="sp"></span><button class="mc-btn pri" data-act="wizard-verify">' +
        esc(dz('我跑完了，检测配置', 'Done — verify now')) + '</button></div>';
    } else if (step === 3) {
      body2 = '<div class="mb"><div id="mc-wverify">' + loading(dz('正在检测真实写入…', 'Checking for a real write…')) + '</div>' +
        '<div class="mc-note" style="margin-top:12px">' + esc(dz(
          '检测依据是「你的命名空间里有没有新写入」和「密钥有没有被调用过」，不是你有没有点过按钮。',
          'We look for a real write in your namespace and a used key — not for a button press.')) + '</div></div>';
      foot = '<div class="mf"><button class="mc-btn" data-act="wizard-back">' + esc(dz('返回', 'Back')) + '</button>' +
        '<span class="sp"></span><button class="mc-btn" data-act="wizard-verify">' +
        esc(dz('再检测一次', 'Check again')) + '</button>' +
        '<button class="mc-btn pri" data-act="wizard-next">' + esc(dz('下一步', 'Next')) + '</button></div>';
    } else {
      var v = MC.wizard.verify || {};
      body2 = '<div class="mb" style="text-align:center;padding:26px 20px">' +
        '<div style="width:54px;height:54px;border-radius:50%;background:color-mix(in srgb,var(--mc-ok) 14%,transparent);' +
        'display:grid;place-items:center;margin:0 auto 12px;color:var(--mc-ok)">' +
        '<svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" stroke-width="2.2"><path d="m5 13 4 4L19 7"/></svg></div>' +
        '<h3 style="margin:0 0 6px;font-size:16px">' + esc(dz('接好了', 'Connected')) + '</h3>' +
        '<p class="mc-p" style="max-width:420px;margin:0 auto">' + esc(dz(
          '从现在开始，这个 Agent 每次对话都会自动读你的记忆、把结论写回来。',
          'From now on the agent reads your memory and writes conclusions back.')) + '</p>' +
        '<div class="mc-grid mc-g3" style="margin-top:18px;text-align:left">' +
          kpi(dz('已写入记忆', 'Memories'), n0(v.memories), '', 'brain') +
          kpi(dz('密钥调用', 'Key calls'), n0(v.calls), '', 'key') +
          kpi(dz('最近写入', 'Last write'), v.last_write ? ago(v.last_write) : '—', '', 'clock') +
        '</div></div>';
      foot = '<div class="mf"><span class="sp"></span><button class="mc-btn pri" data-act="wizard-finish">' +
        esc(dz('进入 Mnemosyne OS SaaS', 'Enter Mnemosyne OS SaaS')) + '</button></div>';
    }
    box.innerHTML = head2 + body2 + foot;
    icons();
  }

  function wizardVerify() {
    var box = document.getElementById('mc-wverify');
    if (box) box.innerHTML = loading(dz('正在检测真实写入…', 'Checking for a real write…'));
    MC.wizard.step = 3;
    paintWizard();
    var tick = function () {
      api('/api/dash/setup/verify').then(function (r) {
        var v = (r && r.ok && r.body) || {};
        MC.wizard.verify = v;
        var b2 = document.getElementById('mc-wverify');
        if (b2) b2.innerHTML = verifyHTML(v);
        if (v.verified) {
          MC.setup = MC.setup || {};
          MC.setup.done = true;
          if (MC.wizard.timer) { clearInterval(MC.wizard.timer); MC.wizard.timer = null; }
          MC.wizard.step = 4;
          setTimeout(paintWizard, 700);
        }
      });
    };
    tick();
    if (MC.wizard.timer) clearInterval(MC.wizard.timer);
    MC.wizard.timer = setInterval(function () {
      if (!MC.wizard.open) { clearInterval(MC.wizard.timer); return; }
      if (MC.wizard.step !== 3) { clearInterval(MC.wizard.timer); return; }
      tick();
    }, 3500);
  }

  /* ---------------------------------------------------------------- events */

  document.addEventListener('click', function (e) {
    var t = e.target;
    if (!t || !t.closest) return;

    var themeBtn = t.closest('[data-theme-set]');
    if (themeBtn) {
      var pref = themeBtn.getAttribute('data-theme-set');
      var m=mn(); if (m.setTheme) m.setTheme(pref);
      document.querySelectorAll('.mc-theme [data-theme-set]').forEach(function (b) {
        b.classList.toggle('on', b.getAttribute('data-theme-set') === pref);
      });
      return;
    }

    var cp = t.closest('[data-copy]');
    if (cp) {
      var txt = cp.getAttribute('data-copy') || '';
      if (navigator.clipboard) navigator.clipboard.writeText(txt).then(function () {
        toast(dz('已复制', 'Copied'));
      });
      return;
    }

    var ag = t.closest('[data-agent]');
    if (ag) {
      MC.wizard.agent = ag.getAttribute('data-agent');
      if (MC.wizard.open) paintWizard();
      else {
        document.querySelectorAll('[data-agent]').forEach(function (b) {
          b.classList.toggle('on', b.getAttribute('data-agent') === MC.wizard.agent);
        });
      }
      return;
    }

    var mem = t.closest('[data-mem]');
    if (mem) { openMemory(mem.getAttribute('data-mem')); return; }

    var opt = t.closest('[data-act="pick-user"]');
    if (opt) {
      pickUser(opt.getAttribute('data-email'), opt.getAttribute('data-ns'));
      return;
    }

    var act = t.closest('[data-act]');
    if (!act) {
      /* 点空白处关掉账号下拉 */
      var slot = document.getElementById('mc-switch-slot');
      if (slot && slot.innerHTML && !t.closest('.mc-who')) slot.innerHTML = '';
      return;
    }
    var a = act.getAttribute('data-act');

    switch (a) {
      case 'switch-user':
        if (isAdmin()) toggleSwitch();
        break;
      case 'go':
        location.hash = '#/dashboard/' + act.getAttribute('data-to');
        break;
      case 'refresh':
        MC.data = {};
        render('#/dashboard/' + MC.page);
        toast(dz('已刷新', 'Refreshed'));
        break;
      case 'wizard':
        openWizard();
        break;
      case 'wizard-next':
        MC.wizard.step = Math.min(4, MC.wizard.step + 1);
        paintWizard();
        break;
      case 'wizard-back':
        MC.wizard.step = Math.max(1, MC.wizard.step - 1);
        paintWizard();
        break;
      case 'wizard-skip':
        closeWizard(true);
        break;
      case 'wizard-verify':
        wizardVerify();
        break;
      case 'wizard-finish':
        closeWizard(false);
        MC.setup = MC.setup || {};
        MC.setup.done = true;
        bust('/api/dash/setup');
        location.hash = '#/dashboard/overview';
        render('#/dashboard/overview');
        break;
      case 'verify':
        api('/api/dash/setup/verify').then(function (r) {
          var v = (r && r.ok && r.body) || {};
          var box = document.getElementById('mc-verify');
          if (box) box.innerHTML = verifyHTML(v);
          if (v.verified) {
            bust('/api/dash/setup');
            get('/api/dash/setup').then(function (d) { MC.setup = d; });
            toast(dz('配置已通过检测', 'Verified'));
          } else {
            toast(dz('还没检测到写入', 'No write detected yet'));
          }
        });
        break;
      case 'mempage':
        MC.ui.memPage = Math.max(1, parseInt(act.getAttribute('data-p'), 10) || 1);
        paint();
        break;
      case 'close-mem': {
        var box2 = document.getElementById('mc-memdetail');
        if (box2) box2.innerHTML = '';
        break;
      }
      case 'graph-fit':
        if (MC.graph) MC.graph.fit();
        break;
      case 'dream-run': {
        var paths = MC.ui.dreamPaths || [];
        if (!paths.length) { toast(dz('至少选一项', 'Pick at least one')); return; }
        act.setAttribute('disabled', 'disabled');
        act.innerHTML = '<span class="mc-spin"></span>' + esc(dz('正在巩固…', 'Running…'));
        post('/api/dash/dream/run', { paths: paths }).then(function (r) {
          var b = (r && r.ok && r.body) || {};
          if (!b.ok || !b.run) {
            toast(dz('这一轮没有跑起来：', 'Cycle failed: ') +
                  ((b.error || b.detail || ('HTTP ' + (r && r.status))) + '').slice(0, 80));
            paint();
            return;
          }
          MC.lastDream = b.run;
          var failed = (b.run.steps || []).filter(function (x) { return !x.ok; });
          toast(failed.length
            ? dz('这一轮完成，但有 ' + failed.length + ' 步没跑通（原因见下方）',
                 'Finished with ' + failed.length + ' step(s) failed — see details')
            : dz('这一轮完成，共改动 ' + (b.run.total || 0) + ' 条', 'Done — ' + (b.run.total || 0) + ' changed'));
          bust('/api/dash/dream' + nsq());
          bust('/api/dash/analytics' + nsq({ days: MC.ui.range || 30 }));
          paint();
        }).catch(function (e) {
          toast(dz('请求失败：', 'Request failed: ') + String(e && e.message || e).slice(0, 60));
          paint();
        });
        break;
      }
      case 'buy': {
        var plan = act.getAttribute('data-plan');
        post('/api/billing/order', { plan: plan }).then(function (r) {
          var b = (r && r.ok && r.body) || {};
          if (!b.order) { toast(dz('下单失败', 'Order failed')); return; }
          showPay(b.order, b.qr || '');
        });
        break;
      }
      /* ---- 区块 C：API Key 管理（指令 §3.1 C）---- */
      case 'key-create': {
        var kn = document.getElementById('mc-keyname');
        var nm = (kn && kn.value || '').trim() || 'default';
        act.disabled = true;
        post('/api/me/keys', { name: nm }).then(function (r) {
          act.disabled = false;
          var b = (r && r.ok && r.body) || {};
          /* 明文密钥只在创建那一刻返回一次 —— 必须当场显示，且提示用户保存。
             静默成功是这里最糟的 UX：用户永远拿不回那把钥匙。 */
          if (b.key) {
            if (kn) kn.value = '';
            var box = document.getElementById('mc-keys-block');
            if (box) {
              var tip = document.createElement('div');
              tip.className = 'mc-note';
              tip.style.cssText = 'border-color:var(--accent-line);background:var(--accent-wash);' +
                                  'margin-bottom:10px;word-break:break-all;font-family:monospace';
              tip.textContent = dz('新密钥（只显示这一次，请立刻复制保存）：',
                                   'New key (shown once — copy it now): ') + b.key;
              box.insertBefore(tip, box.firstChild);
            }
            toast(dz('已创建，请复制上方密钥', 'Created — copy the key above'));
          } else {
            toast(b.error || dz('创建失败', 'Create failed'));
          }
          bust('/api/me/keys');
          if (MC.ordersLoad) MC.ordersLoad();
          paint();
        });
        break;
      }
      case 'key-revoke': {
        var kid = act.getAttribute('data-id');
        if (!confirm(dz('确认吊销这把 Key？使用它的客户端会立刻失效。',
                        'Revoke this key? Clients using it stop working immediately.'))) break;
        post('/api/me/keys/revoke', { id: kid }).then(function (r) {
          var b = (r && r.ok && r.body) || {};
          toast(b.ok ? dz('已吊销', 'Revoked') : (b.error || dz('吊销失败', 'Revoke failed')));
          bust('/api/me/keys');
          paint();
        });
        break;
      }
      /* 区块 D：点锁 → 提示升级（PROMO_STRATEGY：说清"数据还在"） */
      case 'upgrade-hint': {
        toast(dz('这条冷层记忆超出 Free 的 30 天召回窗口。数据仍在库里、未被删除；' +
                 '升级 Pro 即可恢复。',
                 'This cold-tier memory is outside the Free 30-day recall window. ' +
                 'It is still stored; upgrade to Pro to restore it.'));
        break;
      }
      /* 2026-10-23：美元档走 Stripe Checkout。
         金额**不在前端出现** —— 只传 tier/interval，价格由服务端的 Price ID 决定。
         这样价格页、控制台、实际扣款三者不可能对不上。 */
      case 'stripe': {
        var tier = act.getAttribute('data-tier') || 'pro';
        var interval = act.getAttribute('data-interval') || 'month';
        act.disabled = true;
        post('/api/billing/create-checkout-session',
             { tier: tier, interval: interval }).then(function (r) {
          act.disabled = false;
          var b = (r && r.ok && r.body) || {};
          if (b.url) { window.location.href = b.url; return; }
          var msg = (b.message || b.error || 'Checkout unavailable');
          toast(msg);
        });
        break;
      }
      case 'portal': {
        act.disabled = true;
        post('/api/billing/portal', {}).then(function (r) {
          act.disabled = false;
          var b = (r && r.ok && r.body) || {};
          if (b.url) { window.location.href = b.url; return; }
          toast(b.message || dz('订阅门户不可用', 'Billing portal unavailable'));
        });
        break;
      }
      /* ---- 后台 · 订单 ---- */
      case 'order-search': {
        var st1 = MC.orders || {};
        var es = document.getElementById('o-status');
        var et = document.getElementById('o-tier');
        var eq = document.getElementById('o-q');
        st1.status = es ? es.value : '';
        st1.tier = et ? et.value : '';
        st1.q = eq ? eq.value : '';
        MC.orders = st1;
        if (MC.ordersLoad) MC.ordersLoad();
        break;
      }
      case 'order-detail': {
        var oid4 = act.getAttribute('data-id');
        var box = document.getElementById('mc-order-detail');
        if (!box) return;
        box.innerHTML = '<div class="mc-card pad" style="margin-top:12px">' + loading() + '</div>';
        api('/api/admin/orders/detail?id=' + encodeURIComponent(oid4)).then(function (r) {
          var d = (r && r.ok && r.body) || {};
          if (!d.order) { box.innerHTML = ''; toast(dz('读取失败', 'Failed to load')); return; }
          var o = d.order, s = d.subscription || {};
          var evs = (d.events || []).map(function (e) {
            return '<tr><td style="white-space:nowrap;font-size:11px;color:var(--fg3)">' +
              esc(String(e.created_at || '').replace('T', ' ').slice(0, 19)) + '</td>' +
              '<td><span class="mc-tag pri">' + esc(e.event_type) + '</span></td>' +
              '<td style="font-size:11px;color:var(--fg3)">' +
              esc(JSON.stringify(e.metadata || {}).slice(0, 160)) + '</td></tr>';
          }).join('');
          box.innerHTML = '<div class="mc-card pad" style="margin-top:12px">' +
            '<div class="mc-row" style="justify-content:space-between;align-items:center">' +
            '<b>' + esc(dz('订单 #', 'Order #')) + esc(o.id) + ' · ' + esc(o.user_id) + '</b>' +
            '<div class="mc-row" style="gap:6px">' +
            '<button class="mc-btn sm" data-act="order-downgrade" data-uid="' + esc(o.user_id) + '">' +
              esc(dz('强制降级为 Free', 'Force downgrade to Free')) + '</button>' +
            '<button class="mc-btn sm" data-act="order-sync" data-uid="' + esc(o.user_id) + '">' +
              esc(dz('从 Stripe 同步', 'Sync from Stripe')) + '</button>' +
            '<button class="mc-btn sm" data-act="order-close">' + esc(dz('收起', 'Close')) + '</button>' +
            '</div></div>' +
            '<div style="margin:10px 0;font-size:11.5px;color:var(--fg2);line-height:1.8">' +
            esc(dz('当前权益：', 'Entitlements: ')) + esc(s.tier) +
            ' · Stripe 订阅 ' + esc(s.stripe_subscription_id || '—') +
            ' · 客户 ' + esc(s.stripe_customer_id || '—') + '</div>' +
            ((d.entitlements || {}).features || []).map(function (f) {
              return '<div style="font-size:11.5px;color:var(--fg2)">✓ ' + esc(f) + '</div>';
            }).join('') +
            '<div class="mc-h2" style="margin-top:14px">' + esc(dz('事件时间线', 'Event timeline')) + '</div>' +
            (evs ? '<div class="mc-scroll"><table class="mc-tbl">' +
              '<thead><tr><th>' + esc(dz('时间', 'When')) + '</th><th>' + esc(dz('事件', 'Event')) +
              '</th><th>' + esc(dz('详情', 'Detail')) + '</th></tr></thead><tbody>' + evs +
              '</tbody></table></div>'
              : '<div class="mc-note">' + esc(dz('暂无事件', 'No events yet')) + '</div>') +
            '</div>';
          icons();
        });
        break;
      }
      case 'order-close': {
        var b1 = document.getElementById('mc-order-detail');
        if (b1) b1.innerHTML = '';
        break;
      }
      case 'order-downgrade': {
        var uid1 = act.getAttribute('data-uid');
        if (!confirm(dz('确认把 ' + uid1 + ' 强制降级为 Free？会写入审计事件。',
                        'Force downgrade ' + uid1 + ' to Free? An audit event will be written.'))) break;
        post('/api/admin/orders/downgrade', { user_id: uid1 }).then(function (r) {
          var b = (r && r.ok && r.body) || {};
          toast(b.ok ? dz('已降级', 'Downgraded') : (b.error || dz('失败', 'Failed')));
          if (MC.ordersLoad) MC.ordersLoad();
        });
        break;
      }
      case 'order-sync': {
        var uid2 = act.getAttribute('data-uid');
        post('/api/admin/orders/sync', { user_id: uid2 }).then(function (r) {
          var b = (r && r.ok && r.body) || {};
          /* 人民币订单没有第三方订阅可拉，点这个按钮必然失败 —— 不是接口坏了，
             而是该用「确认到账」。直接说清楚，别让运营去查日志。 */
          toast(b.ok ? dz('已从支付方同步', 'Synced from payment provider')
                     : b.error === 'no_provider_subscription'
                       ? dz('这笔是人民币订单，没有第三方订阅可同步；请在订单上点「确认到账」',
                            'CNY order: use "Confirm payment" on the order instead.')
                       : (b.message || dz('同步失败', 'Sync failed')));
          if (MC.ordersLoad) MC.ordersLoad();
        });
        break;
      }
      /* ---- 后台 · 在线用户 ---- */
      case 'visitor-search': {
        var vs = MC.visitors || {};
        var vk = document.getElementById('v-kind');
        var vc = document.getElementById('v-country');
        var vq = document.getElementById('v-q');
        vs.kind = vk ? vk.value : 'all';
        vs.country = vc ? vc.value : '';
        vs.q = vq ? vq.value : '';
        MC.visitors = vs;
        if (MC.visitorsLoad) MC.visitorsLoad();
        break;
      }
      /* ---- 访问日志 ---- */
      case 'access-page': {
        var ap = parseInt(act.getAttribute('data-page'), 10) || 1;
        MC.access = MC.access || { page: 1, kind: 'all', q: '', online: 0 };
        MC.access.page = Math.max(1, ap);
        if (MC.accessLoad) MC.accessLoad();
        break;
      }
      case 'access-search': {
        var ks = document.getElementById('a-kind');
        var qs2 = document.getElementById('a-q');
        MC.access = MC.access || {};
        MC.access.kind = (ks && ks.value) || 'all';
        MC.access.q = (qs2 && qs2.value) || '';
        MC.access.page = 1;
        if (MC.accessLoad) MC.accessLoad();
        break;
      }
      case 'access-sync': {
        toast(dz('正在从 Cloudflare 拉取…', 'Syncing from Cloudflare…'));
        post('/api/admin/access-log/sync', { hours: 24 }).then(function (r) {
          var b = (r && r.ok && r.body) || {};
          if (b.ok) {
            toast(dz('已同步：拉到 ' + (b.fetched || 0) + ' 条，新增 ' + (b.inserted || 0) + ' 条',
                     'Synced: ' + (b.fetched || 0) + ' fetched, ' + (b.inserted || 0) + ' new'));
            if (MC.accessLoad) MC.accessLoad();
          } else if (b.error === 'not_configured') {
            toast(dz('未配置 Cloudflare API Token（CF_API_TOKEN / CF_ZONE_ID），暂时只能看本站访客',
                     'Cloudflare API token not configured'));
          } else if (b.error === 'graphql' || b.error === 'http_403' || b.error === 'http_401') {
            toast(dz('Cloudflare 拒绝了请求：Token 权限不足（需 Zone → Analytics → Read）',
                     'Cloudflare rejected the token — needs Zone → Analytics → Read'));
          } else {
            toast(dz('同步失败：' + (b.error || ('HTTP ' + (r && r.status))),
                     'Sync failed: ' + (b.error || ('HTTP ' + (r && r.status)))));
          }
        });
        break;
      }
      case 'access-backup': {
        post('/api/admin/access-log/backup', {}).then(function (r) {
          var b = (r && r.ok && r.body) || {};
          toast(b.ok ? dz('已备份 ' + (b.rows || 0) + ' 条到 ' + String(b.path || '').split('/').pop(),
                          'Backed up ' + (b.rows || 0) + ' rows')
                     : dz('备份失败', 'Backup failed'));
        });
        break;
      }
      case 'visitor-csv': {
        var vs2 = MC.visitors || {};
        var q2 = ['format=csv'];
        if (vs2.kind && vs2.kind !== 'all') q2.push('kind=' + encodeURIComponent(vs2.kind));
        if (vs2.country) q2.push('country=' + encodeURIComponent(vs2.country));
        if (vs2.q) q2.push('q=' + encodeURIComponent(vs2.q));
        window.location.href = '/api/admin/visitors/export?' + q2.slice(1).join('&');
        break;
      }
      case 'visitor-detail': {
        var sid2 = act.getAttribute('data-sid');
        var vb = document.getElementById('mc-visitor-detail');
        if (!vb) return;
        /* 详情从当前列表里取（已加载过），不额外打接口 ——
           访客数据是"快照"，重新拉一次反而会显示成另一个时刻的状态。 */
        api('/api/admin/visitors/online?online=0&limit=200').then(function (r) {
          var d2 = (r && r.ok && r.body) || {};
          var v = (d2.items || []).filter(function (x) { return x.session_id === sid2; })[0];
          if (!v) { vb.innerHTML = ''; return; }
          vb.innerHTML = '<div class="mc-card pad" style="margin-top:12px">' +
            '<b>' + esc(v.ip_address || '—') + '</b> · ' +
            esc([v.country_code, v.city].filter(Boolean).join(' / ') || dz('未知地区', 'unknown geo')) +
            '<div style="margin-top:10px;font-size:11.5px;color:var(--fg2);line-height:1.9">' +
            esc(dz('首次出现：', 'First seen: ')) + esc(String(v.first_seen_at || '').replace('T', ' ')) + '<br>' +
            esc(dz('最后活动：', 'Last seen: ')) + esc(String(v.last_seen_at || '').replace('T', ' ')) + '<br>' +
            esc(dz('驻留时长：', 'Dwell: ')) + esc(v.total_dwell_seconds || 0) + 's<br>' +
            esc(dz('访问次数：', 'Visits: ')) + esc(v.visit_count || 1) + '<br>' +
            esc(dz('身份：', 'Identity: ')) + esc(v.email || dz('匿名', 'anonymous')) + '<br>' +
            esc(dz('UA：', 'UA: ')) + esc(String(v.user_agent || '').slice(0, 120)) + '</div>' +
            '<div class="mc-h2" style="margin-top:12px">' + esc(dz('页面路径序列', 'Page path sequence')) + '</div>' +
            '<div style="font-family:monospace;font-size:11.5px;line-height:1.9">' +
            ((v.page_paths || []).map(function (p) { return esc(p); }).join(' → ') || '—') + '</div>' +
            '</div>';
          icons();
        });
        break;
      }
      /* 套餐页的币种 / 通道切换：只改状态再重画页面主体。
         用 paint() 而不是 render()：render 会重建整个外壳（侧栏 + 顶栏），
         切换一个 tab 不需要动外壳，而且重建外壳会让 Promise.all 重新取一遍
         数据，网络慢时中间会闪一屏空白。 */
      /* 人民币卡内的「月付 / 年付」切换。与页顶的 USD/CNY 切换分开存，
         因为两者是正交的：币种管"用哪个通道付"，周期管"买多久"。 */
      case 'usd-piv': {
        MC.usdIv = MC.usdIv || {};
        MC.usdIv[act.getAttribute('data-tier') || ''] =
          act.getAttribute('data-piv') || 'month';
        paint();
        break;
      }
      case 'cny-piv': {
        MC.cnyIv = MC.cnyIv || {};
        MC.cnyIv[act.getAttribute('data-tier') || ''] =
          act.getAttribute('data-piv') || 'month';
        paint();
        break;
      }
      case 'billing-cur': {
        MC.billingCur = act.getAttribute('data-cur') || 'USD';
        paint();
        break;
      }
      case 'pay': {        var oid = act.getAttribute('data-id');
        api('/api/billing/order?id=' + encodeURIComponent(oid)).then(function (r) {
          var body = (r && r.ok && r.body) || {};
          var o = body.order;
          /* 用订单自己那条记录的金额码，不要拿「通用收款码」顶替 ——
             通用码不含金额，用户得自己输金额，等于把"付错档"的风险交回去。 */
          if (o) showPay(o, body.qr || (MC.plans && MC.plans.qr) || '');
        });
        break;
      }
      case 'close-pay': {
        var pay = document.getElementById('mc-pay');
        if (pay) pay.innerHTML = '';
        break;
      }
      /* 点遮罩关闭。必须判断"点的是遮罩本身"——点在弹窗内容里时，
         closest('[data-act]') 也会命中遮罩，不加这个判断就会点哪都关。 */
      case 'close-pay-mask': {
        if (e.target === act) {
          var payM = document.getElementById('mc-pay');
          if (payM) payM.innerHTML = '';
        }
        break;
      }
      case 'paid': {
        var id2 = act.getAttribute('data-id');
        post('/api/billing/order/paid', { id: id2 }).then(function () {
          toast(dz('已提交，等待管理员确认到账', 'Submitted — awaiting confirmation'));
          bust('/api/billing/order');
          MC.billingCache = null;      /* 订单状态变了，缓存必须失效 */
          paint();
          reloadRail();
        });
        break;
      }
      case 'confirm': {
        var id3 = act.getAttribute('data-id');
        post('/api/billing/order/confirm', { id: id3 }).then(function () {
          toast(dz('已确认，套餐生效', 'Confirmed — plan activated'));
          bust('/api/billing/order');
          MC.billingCache = null;      /* tier 变了，缓存必须失效 */
          paint();
          reloadRail();
        });
        break;
      }
      case 'export':
        window.location.href = '/api/dash/export' + nsq({ fmt: 'zip' });
        break;
      case 'save-profile': {
        var dn = document.getElementById('mc-dn');
        if (!dn) return;
        post('/api/profile', { display_name: dn.value }).then(function () {
          toast(dz('已保存', 'Saved'));
        });
        break;
      }
      case 'save-qr': {
        var f = document.getElementById('mc-qrfile');
        if (!f || !f.files || !f.files[0]) { toast(dz('先选一张图', 'Pick an image')); return; }
        var fr = new FileReader();
        fr.onload = function () {
          post('/api/dash/payqr', { qr: String(fr.result) }).then(function (r) {
            var prev = document.getElementById('mc-qrprev');
            if (prev && r && r.ok) prev.innerHTML = '<img class="mc-qr" src="' + esc(fr.result) + '" alt="QR">';
            toast(dz('收款码已保存', 'QR saved'));
          });
        };
        fr.readAsDataURL(f.files[0]);
        break;
      }
      case 'lang':
        var m2=mn(); if (m2.setLang) m2.setLang(act.getAttribute('data-l'));
        else location.reload();
        break;
      case 'view-user':
        openUser(act.getAttribute('data-email'));
        break;
      case 'as-user':
        pickUser(act.getAttribute('data-email'), act.getAttribute('data-ns'));
        break;
      /* 点遮罩关闭用户弹窗（只在点遮罩本身时生效） */
      case 'close-user-mask': {
        if (e.target === act) {
          var uh = document.getElementById('mc-usermodal');
          if (uh) uh.innerHTML = '';
        }
        break;
      }
      case 'user-delete': {
        var dem = act.getAttribute('data-email') || '';
        if (!dem) break;
        if (!window.confirm(dz('确定删除账号 ' + dem + ' 吗？此操作不可撤销。',
                               'Delete ' + dem + '? This cannot be undone.'))) break;
        post('/api/admin/user/delete', { email: dem }).then(function (r) {
          var b = (r && r.ok && r.body) || {};
          if (b.ok) {
            toast(dz('已删除 ' + dem, 'Deleted ' + dem));
            MC.data = {};
            paint();
          } else if (b.error === 'cannot_delete_owner') {
            toast(dz('不能删除站长账号', 'Cannot delete the site owner'));
          } else {
            toast(dz('删除失败：' + (b.error || 'unknown'), 'Delete failed'));
          }
        });
        break;
      }
      case 'close-user': {
        var ud = document.getElementById('mc-usermodal');
        if (ud) ud.innerHTML = '';
        break;
      }
      case 'tool':
        openTool(act.getAttribute('data-name'));
        break;
      case 'close-tool': {
        var tb = document.getElementById('mc-toolbox');
        if (tb) tb.innerHTML = '';
        break;
      }
      case 'tool-run': {
        var name = act.getAttribute('data-name');
        var args = {};
        document.querySelectorAll('#mc-toolbox [data-arg]').forEach(function (inp) {
          var k = inp.getAttribute('data-arg');
          var ty = inp.getAttribute('data-type');
          if (ty === 'boolean') { if (inp.checked) args[k] = true; return; }
          if (!inp.value) return;
          if (ty === 'integer' || ty === 'number') {
            var n = Number(inp.value);
            if (!isNaN(n)) args[k] = n;
          } else if (ty === 'array' || ty === 'object') {
            try { args[k] = JSON.parse(inp.value); } catch (e) { args[k] = inp.value; }
          } else {
            args[k] = inp.value;
          }
        });
        var res = document.getElementById('mc-toolres');
        if (res) res.innerHTML = loading(dz('执行中…', 'Running…'));
        post('/api/dash/tools/call', { name: name, args: args }).then(function (r) {
          var b = (r && r.ok && r.body) || {};
          if (res) res.innerHTML = '<div class="mc-code" style="max-height:320px">' +
            esc(JSON.stringify(b, null, 2)) + '</div>';
        });
        break;
      }
    }
  });

  document.addEventListener('input', function (e) {
    var t = e.target;
    if (!t || !t.id) return;
    if (t.id === 'mc-q') {
      MC.ui.memQ = t.value;
      if (MC.page === 'graph' && MC.graph) MC.graph.search(t.value);
    }
    if (t.id === 'mc-memq') {
      MC.ui.memQ = t.value;
      MC.ui.memPage = 1;
      clearTimeout(MC._t);
      MC._t = setTimeout(paint, 260);
    }
    if (t.id === 'mc-agent-q') {
      var q = t.value.toLowerCase();
      var list = document.getElementById('mc-agent-list');
      if (!list) return;
      var ag = MC.agents || {};
      var filtered = { cats: ag.cats || [], agents: (ag.agents || []).filter(function (x) {
        return (x.name + ' ' + x.zh + ' ' + x.id).toLowerCase().indexOf(q) >= 0;
      }) };
      list.innerHTML = agentGrid(filtered, MC.wizard.agent);
    }
  });

  document.addEventListener('change', function (e) {
    var t = e.target;
    if (!t) return;
    if (t.id === 'mc-memkind') { MC.ui.memKind = t.value; MC.ui.memPage = 1; paint(); }
    if (t.id === 'mc-range') {
      MC.ui.range = t.value;
      bust('/api/dash/analytics' + nsq({ days: t.value }));
      paint();
    }
    if (t.hasAttribute && t.hasAttribute('data-dpath')) {
      var id = t.getAttribute('data-dpath');
      var arr = MC.ui.dreamPaths || [];
      var i = arr.indexOf(id);
      if (t.checked && i < 0) arr.push(id);
      if (!t.checked && i >= 0) arr.splice(i, 1);
      MC.ui.dreamPaths = arr;
    }
  });

  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') {
      var slot = document.getElementById('mc-switch-slot');
      if (slot && slot.innerHTML) { slot.innerHTML = ''; return; }
      if (MC.wizard.open && MC.wizard.step === 1) closeWizard(true);
    }
  });

  /* ------------------------------------------------------------------ boot */

  /* 演示模块（console-demo.js）只通过这个口子用控制台能力。
     暴露的是**函数**不是对象：它拿到的永远是当前状态，不会拿到旧快照。 */
  window.MCDemoHost = {
    api: api,
    post: post,
    /* 安装命令按 shell 分开生成（PowerShell 不认 && 和 %TEMP%） */
    shellCmds: shellCmds,
    /* 慢接口：一轮对话要等两次云端模型（抽取 + 回复并行，线上实测 26~41 秒）。
       95 秒上限：低于 Cloudflare 回源 100 秒，高于服务端自己的 75 秒预算 —— 
       宁可服务端先返回降级结果，也不要浏览器先超时。 */
    postSlow: function (p, b) {
      return api(p, { method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify(b || {}) }, 95000);
    },
    esc: esc,
    dz: dz,
    toast: toast,
    icons: icons,
    fmtTime: fmtTime,
    go: function (page) { location.hash = '#/dashboard/' + page; },
    setView: function (email, ns) { pickUser(email, ns); }
  };

  /* ---- 全局悬停提示 ------------------------------------------------------
     需求：记忆内容 / 路径 / UA 这类被截断的文本，鼠标移上去就看全文，
     不要"必须先点开"。实现要点：
       · 用**真实溢出**判断（scrollWidth > clientWidth），不靠字段白名单 ——
         以后新加的列自动生效；
       · 支持 data-tip 显式覆盖（有些内容不想让 innerText 决定，比如截断前的原文）；
       · 提示层 pointer-events:none，否则鼠标一碰到提示框就触发 mouseout，
         会闪成"显示-消失-显示"的抖动。 */
  (function hoverTip() {
    var tip = null, cur = null;
    function ensure() {
      if (tip) return tip;
      tip = document.createElement('div');
      tip.className = 'mn-tip';
      document.body.appendChild(tip);
      return tip;
    }
    function hide() { if (tip) tip.style.display = 'none'; cur = null; }
    function show(el, x, y) {
      var text = el.getAttribute('data-tip') || el.innerText || '';
      if (!String(text).trim()) return hide();
      var t = ensure();
      t.textContent = text;
      t.style.display = 'block';
      var w = t.offsetWidth, h = t.offsetHeight;
      var left = Math.min(x + 12, window.innerWidth - w - 10);
      var top = y + 16;
      if (top + h > window.innerHeight - 10) top = Math.max(8, y - h - 12);
      t.style.left = Math.max(8, left) + 'px';
      t.style.top = Math.max(8, top) + 'px';
      cur = el;
    }
    document.addEventListener('mouseover', function (e) {
      var el = e.target;
      if (!el || el.nodeType !== 1) return;
      var cand = el.closest('[data-tip], td, th, .mc-clip, .feat span, .mc-kv .v, .mc-code');
      if (!cand) return hide();
      var over = cand.scrollWidth > cand.clientWidth + 2 ||
                 cand.scrollHeight > cand.clientHeight + 2;
      if (!over && !cand.getAttribute('data-tip')) return hide();
      show(cand, e.clientX, e.clientY);
    });
    document.addEventListener('mouseout', function (e) {
      if (!cur) return;
      if (!e.relatedTarget || !cur.contains(e.relatedTarget)) hide();
    });
    document.addEventListener('scroll', hide, true);
    window.addEventListener('resize', hide);
  })();

  window.MNConsole = { render: render, MC: MC };
  MC.render = render;

  /* ------------------------------------------------- PayPal 回跳确认
     PayPal 审批完成后会回到 return_url 并**追加** subscription_id 与 ba_token。
     我们不等 webhook（通常 5–30 秒才到）：这里主动确认一次，让"点完同意
     回来还是 Free"这个体验空白消失。webhook 仍是最终事实，这里只是加速。 */
  (function confirmPayPalReturn() {
    var qs = (location.search || '').replace(/^\?/, '');
    if (!qs) return;
    var q = {};
    qs.split('&').forEach(function (kv) {
      var i = kv.indexOf('=');
      if (i > 0) q[decodeURIComponent(kv.slice(0, i))] = decodeURIComponent(kv.slice(i + 1));
    });
    if (q.paypal !== 'success' || !q.subscription_id) return;
    post('/api/billing/paypal-confirm', { subscription_id: q.subscription_id })
      .then(function (r) {
        var b = (r && r.ok && r.body) || {};
        if (b.ok && (b.tier === 'pro' || b.tier === 'team')) {
          toast(dz('订阅已生效：' + String(b.tier).toUpperCase(),
                   'Subscription active: ' + String(b.tier).toUpperCase()));
          MC.dirty = {};
          render();
        } else if (b.status && b.status !== 'ACTIVE') {
          toast(dz('PayPal 状态：' + b.status + '（尚未生效，稍后自动刷新）',
                   'PayPal status: ' + b.status + ' (will sync shortly)'));
        }
      })['catch'](function () { /* 确认失败不打断页面，webhook 兜底 */ });
  })();
})();

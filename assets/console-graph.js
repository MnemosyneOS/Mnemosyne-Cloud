/* ============================================================================
   Mnemosyne OS — 记忆图谱渲染器（无依赖，Canvas 2D）
   ----------------------------------------------------------------------------
   为什么自己写，而不是继续用 brain.bundle.js：
     旧渲染器是 3D 点云，节点名是分词残片，鼠标悬停没有任何信息，
     也没有「记忆 → 实体 → 标签」的关系语义。用户看到的是"会转的星云"，
     不是"能读的知识图谱"。国际化 AI 记忆产品的图谱（mem0 / Zep / Graphiti）
     都是：二维力导向 + 类型着色 + 悬停卡片 + 点击看邻居。
   本文件实现的就是后者，纯 Canvas，不引入任何库。
   ========================================================================== */
(function (global) {
  'use strict';

  var KIND = {
    memory: { zh: '记忆', color: '#8B78F2', r: 5.2 },
    skill:  { zh: '技能', color: '#0EA5A5', r: 6.4 },
    entity: { zh: '实体', color: '#E0851B', r: 4.4 },
    tag:    { zh: '标签', color: '#3B82F6', r: 4.4 },
    concept:{ zh: '概念', color: '#A855F7', r: 3.6 }
  };

  function Graph(host, opts) {
    this.host = host;
    this.opts = opts || {};
    this.nodes = [];
    this.edges = [];
    this.byId = {};
    this.alpha = 1;
    this.view = { x: 0, y: 0, k: 1 };
    this.hover = null;
    this.selected = null;
    this.hidden = {};
    this.query = '';
    this.dragNode = null;
    this.pan = null;
    this.dpr = Math.min(2, global.devicePixelRatio || 1);
    this.build();
  }

  Graph.KIND = KIND;

  Graph.prototype.build = function () {
    var self = this;
    var wrap = document.createElement('div');
    wrap.className = 'mc-graphwrap';
    wrap.innerHTML =
      '<canvas></canvas>' +
      '<div class="mc-gtools"></div>' +
      '<div class="mc-gzoom">' +
        '<button data-z="in" title="放大">+</button>' +
        '<button data-z="out" title="缩小">−</button>' +
        '<button data-z="fit" title="适应窗口">⤢</button>' +
      '</div>' +
      '<div class="mc-glegend"></div>' +
      '<div class="mc-gtip"></div>' +
      '<div class="mc-gdetail"></div>';
    this.host.innerHTML = '';
    this.host.appendChild(wrap);
    this.wrap = wrap;
    this.canvas = wrap.querySelector('canvas');
    this.ctx = this.canvas.getContext('2d');
    this.tip = wrap.querySelector('.mc-gtip');
    this.detail = wrap.querySelector('.mc-gdetail');
    this.bind();
    this.resize();
    global.addEventListener('resize', function () { self.resize(); });
  };

  Graph.prototype.setData = function (data) {
    var self = this;
    this.nodes = (data.nodes || []).map(function (n) {
      var k = KIND[n.kind] || KIND.memory;
      return {
        id: n.id, kind: n.kind || 'memory', label: n.label || n.id,
        content: n.content || '', tags: n.tags || [], mtype: n.mtype || '',
        weight: n.weight || 1, degree: n.degree || 0, created: n.created || '',
        importance: n.importance || 0, confidence: n.confidence || 0,
        accessed: n.accessed || 0,
        r: k.r + Math.min(7, Math.sqrt(n.degree || 1) * 1.7) + (n.importance || 2) * 0.35,
        x: (Math.random() - 0.5) * 520, y: (Math.random() - 0.5) * 380,
        vx: 0, vy: 0, fixed: false
      };
    });
    this.byId = {};
    this.nodes.forEach(function (n) { self.byId[n.id] = n; });
    this.edges = (data.edges || []).filter(function (e) {
      return self.byId[e.source] && self.byId[e.target];
    }).map(function (e) {
      return { s: e.source, t: e.target, rel: e.rel || '', zh: e.rel_zh || e.rel || '',
               w: e.weight || 1 };
    });
    this.adj = {};
    this.edges.forEach(function (e) {
      (self.adj[e.s] = self.adj[e.s] || []).push(e);
      (self.adj[e.t] = self.adj[e.t] || []).push(e);
    });
    this.alpha = 1;
    this.filters();
    this.legend(data.stats || {});
    this.fit();
    this.tick();
  };

  Graph.prototype.filters = function () {
    var self = this;
    var counts = {};
    this.nodes.forEach(function (n) { counts[n.kind] = (counts[n.kind] || 0) + 1; });
    var html = '<button class="mc-gchip on" data-f="all">全部 ' + this.nodes.length + '</button>';
    Object.keys(KIND).forEach(function (k) {
      if (!counts[k]) return;
      html += '<button class="mc-gchip on" data-f="' + k + '"><i style="background:' +
        KIND[k].color + '"></i>' + KIND[k].zh + ' ' + counts[k] + '</button>';
    });
    this.wrap.querySelector('.mc-gtools').innerHTML = html;
  };

  Graph.prototype.legend = function (stats) {
    this.wrap.querySelector('.mc-glegend').innerHTML =
      '<span>节点 ' + (stats.nodes || this.nodes.length) + '</span>' +
      '<span>关系 ' + (stats.edges || this.edges.length) + '</span>' +
      '<span>· 悬停看内容，点击看关系，滚轮缩放，拖空白处平移</span>';
  };

  Graph.prototype.resize = function () {
    var r = this.canvas.getBoundingClientRect();
    this.w = Math.max(320, r.width || 800);
    this.h = Math.max(320, r.height || 480);
    this.canvas.width = Math.round(this.w * this.dpr);
    this.canvas.height = Math.round(this.h * this.dpr);
    this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    this.draw();
  };

  Graph.prototype.visible = function (n) {
    if (this.hidden[n.kind]) return false;
    return true;
  };

  Graph.prototype.fit = function () {
    var vis = this.nodes.filter(this.visible.bind(this));
    if (!vis.length) return;
    var minX = 1e9, maxX = -1e9, minY = 1e9, maxY = -1e9;
    vis.forEach(function (n) {
      minX = Math.min(minX, n.x); maxX = Math.max(maxX, n.x);
      minY = Math.min(minY, n.y); maxY = Math.max(maxY, n.y);
    });
    var cx = (minX + maxX) / 2, cy = (minY + maxY) / 2;
    var spanX = Math.max(80, maxX - minX), spanY = Math.max(80, maxY - minY);
    var k = Math.min(this.w / (spanX + 140), this.h / (spanY + 140), 1.8);
    this.view.k = k;
    this.view.x = this.w / 2 - cx * k;
    this.view.y = this.h / 2 - cy * k;
    this.draw();
  };

  /* 力导向：斥力 + 弹簧 + 向心。用 Barnes-Hut 太重，600 节点 O(n²) 足够。 */
  Graph.prototype.simulate = function () {
    var nodes = this.nodes, n = nodes.length;
    if (!n) return;
    var i, j, a, b, dx, dy, d2, d, f;
    var rep = 1400, spring = 0.014, center = 0.0016, damp = 0.86;
    for (i = 0; i < n; i++) {
      a = nodes[i];
      if (a.fixed || !this.visible(a)) continue;
      for (j = i + 1; j < n; j++) {
        b = nodes[j];
        if (!this.visible(b)) continue;
        dx = a.x - b.x; dy = a.y - b.y;
        d2 = dx * dx + dy * dy;
        if (d2 < 1) { d2 = 1; dx = (Math.random() - .5); dy = (Math.random() - .5); }
        if (d2 > 90000) continue;
        f = rep / d2;
        d = Math.sqrt(d2);
        a.vx += (dx / d) * f; a.vy += (dy / d) * f;
        b.vx -= (dx / d) * f; b.vy -= (dy / d) * f;
      }
      a.vx -= a.x * center; a.vy -= a.y * center;
    }
    for (i = 0; i < this.edges.length; i++) {
      var e = this.edges[i];
      a = this.byId[e.s]; b = this.byId[e.t];
      if (!a || !b || !this.visible(a) || !this.visible(b)) continue;
      dx = b.x - a.x; dy = b.y - a.y;
      d = Math.sqrt(dx * dx + dy * dy) || 1;
      var target = 70 + 26 * (e.w || 1);
      f = (d - target) * spring;
      dx /= d; dy /= d;
      a.vx += dx * f; a.vy += dy * f;
      b.vx -= dx * f; b.vy -= dy * f;
    }
    for (i = 0; i < n; i++) {
      a = nodes[i];
      if (a.fixed || !this.visible(a)) { a.vx = a.vy = 0; continue; }
      a.vx *= damp; a.vy *= damp;
      a.x += a.vx * this.alpha;
      a.y += a.vy * this.alpha;
    }
    this.alpha = Math.max(0.06, this.alpha * 0.995);
  };

  Graph.prototype.tick = function () {
    var self = this;
    var steps = 0;
    function loop() {
      self.simulate();
      self.draw();
      steps++;
      if (steps < 260) self._raf = global.requestAnimationFrame(loop);
    }
    loop();
  };

  Graph.prototype.toScreen = function (n) {
    return { x: n.x * this.view.k + this.view.x, y: n.y * this.view.k + this.view.y };
  };

  Graph.prototype.draw = function () {
    var ctx = this.ctx, w = this.w, h = this.h;
    if (!ctx) return;
    ctx.clearRect(0, 0, w, h);

    var dark = document.documentElement.getAttribute('data-theme') === 'dark';
    var lineBase = dark ? 'rgba(255,255,255,' : 'rgba(24,24,24,';

    var hi = this.hover || this.selected;
    var near = {};
    if (hi) {
      near[hi.id] = 1;
      (this.adj[hi.id] || []).forEach(function (e) {
        near[e.s] = 1; near[e.t] = 1;
      });
    }

    var self = this;
    // 边
    this.edges.forEach(function (e) {
      var a = self.byId[e.s], b = self.byId[e.t];
      if (!a || !b || !self.visible(a) || !self.visible(b)) return;
      var pa = self.toScreen(a), pb = self.toScreen(b);
      var on = hi && (e.s === hi.id || e.t === hi.id);
      var dim = hi && !on;
      ctx.beginPath();
      ctx.moveTo(pa.x, pa.y);
      ctx.lineTo(pb.x, pb.y);
      if (on) {
        ctx.strokeStyle = 'rgba(203,178,255,' + (dark ? 0.85 : 0.95) + ')';
        ctx.lineWidth = 1.2 + Math.min(2, (e.w || 1) * 0.35);
      } else {
        ctx.strokeStyle = lineBase + (dim ? 0.04 : 0.10) + ')';
        ctx.lineWidth = 0.7 + Math.min(1.4, (e.w || 1) * 0.2);
      }
      ctx.stroke();
    });

    // 节点
    this.nodes.forEach(function (n) {
      if (!self.visible(n)) return;
      var p = self.toScreen(n);
      if (p.x < -60 || p.x > w + 60 || p.y < -60 || p.y > h + 60) return;
      var k = KIND[n.kind] || KIND.memory;
      var r = n.r * Math.min(1.7, Math.max(0.62, self.view.k));
      var dim = hi && !near[n.id];
      ctx.beginPath();
      ctx.arc(p.x, p.y, r, 0, 6.2832);
      ctx.fillStyle = k.color;
      ctx.globalAlpha = dim ? 0.22 : 1;
      ctx.fill();
      if (n.id === self.selected || n.id === (self.hover && self.hover.id)) {
        ctx.lineWidth = 2;
        ctx.strokeStyle = dark ? '#FFFFFF' : '#1B1727';
        ctx.globalAlpha = 0.9;
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
      // 只给"有分量"的节点画标签，否则满屏字看不见结构
      var showLabel = !hi || near[n.id] || n.degree >= 4 || n.kind === 'skill';
      if (showLabel && (self.view.k > 0.55 || n.degree >= 6)) {
        ctx.font = (n.kind === 'skill' ? '600 ' : '') + '10.5px Inter, "PingFang SC", system-ui, sans-serif';
        ctx.fillStyle = dark ? 'rgba(243,242,250,.92)' : 'rgba(24,24,30,.88)';
        ctx.globalAlpha = dim ? 0.25 : 1;
        var t = n.label.length > 14 ? n.label.slice(0, 13) + '…' : n.label;
        var tw = ctx.measureText(t).width;
        ctx.fillText(t, p.x - tw / 2, p.y + r + 11);
        ctx.globalAlpha = 1;
      }
    });
  };

  Graph.prototype.pick = function (mx, my) {
    var best = null, bestD = 1e9;
    for (var i = 0; i < this.nodes.length; i++) {
      var n = this.nodes[i];
      if (!this.visible(n)) continue;
      var p = this.toScreen(n);
      var r = n.r * Math.min(1.7, Math.max(0.62, this.view.k)) + 4;
      var d = (p.x - mx) * (p.x - mx) + (p.y - my) * (p.y - my);
      if (d < r * r && d < bestD) { best = n; bestD = d; }
    }
    return best;
  };

  Graph.prototype.esc = function (s) {
    return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) {
      return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c];
    });
  };

  Graph.prototype.showTip = function (n, mx, my) {
    var k = KIND[n.kind] || KIND.memory;
    var body = n.content
      ? this.esc(n.content.length > 220 ? n.content.slice(0, 219) + '…' : n.content)
      : '（' + k.zh + '节点）';
    var meta = [];
    if (n.mtype) meta.push('<span class="mc-tag pri">' + this.esc(n.mtype) + '</span>');
    (n.tags || []).slice(0, 4).forEach(function (t) {
      meta.push('<span class="mc-tag">' + String(t).replace(/[<>&"]/g, '') + '</span>');
    });
    if (n.degree) meta.push('<span class="mc-tag">' + n.degree + ' 条关系</span>');
    this.tip.innerHTML =
      '<div class="h"><b>' + this.esc(n.label.length > 30 ? n.label.slice(0, 29) + '…' : n.label) +
      '</b><span>' + k.zh + '</span></div>' +
      '<div class="t">' + body + '</div>' +
      (meta.length ? '<div class="m">' + meta.join('') + '</div>' : '');
    var r = this.wrap.getBoundingClientRect();
    var x = mx + 14, y = my + 14;
    var tw = 340;
    if (x + tw > r.width) x = Math.max(8, mx - tw - 14);
    if (y + 130 > r.height) y = Math.max(8, my - 120);
    this.tip.style.left = x + 'px';
    this.tip.style.top = y + 'px';
    this.tip.classList.add('on');
  };

  Graph.prototype.showDetail = function (n) {
    var self = this;
    var k = KIND[n.kind] || KIND.memory;
    var rels = (this.adj[n.id] || []).map(function (e) {
      var other = e.s === n.id ? e.t : e.s;
      var dir = e.s === n.id ? '→' : '←';
      var o = self.byId[other];
      return { dir: dir, name: o ? o.label : other, rel: e.zh || e.rel,
               kind: o ? o.kind : '' };
    });
    var head = '<button class="x" data-close="1">×</button>' +
      '<div class="row" style="display:flex;align-items:center;gap:7px">' +
        '<span class="mc-dot" style="background:' + k.color + '"></span>' +
        '<b style="font-size:13px">' + this.esc(n.label) + '</b>' +
      '</div>' +
      '<div class="k">' + k.zh + (n.mtype ? ' · ' + this.esc(n.mtype) : '') + '</div>' +
      '<div class="txt">' + (n.content ? this.esc(n.content) : '（' + k.zh + '节点，无正文）') + '</div>';
    var kv = [];
    if (n.created) kv.push(['写入时间', n.created.replace('T', ' ')]);
    if (n.importance) kv.push(['重要性', n.importance + ' / 5']);
    if (n.confidence) kv.push(['置信度', Math.round(n.confidence * 100) + '%']);
    if (n.accessed) kv.push(['被召回', n.accessed + ' 次']);
    if ((n.tags || []).length) kv.push(['标签', n.tags.join('、')]);
    var meta = kv.length ? '<div class="k">属性</div>' + kv.map(function (p) {
      return '<div class="mc-kv"><span class="k">' + p[0] + '</span><span class="v">' + self.esc(p[1]) + '</span></div>';
    }).join('') : '';
    var list = rels.length
      ? '<div class="k">关系（' + rels.length + '）</div>' + rels.slice(0, 40).map(function (r) {
          return '<div class="rel" data-go="' + self.esc(r.name) + '">' +
            '<span class="d">' + r.dir + '</span>' +
            '<span class="n">' + self.esc(r.name) + '</span>' +
            '<span class="r">' + self.esc(r.rel) + '</span></div>';
        }).join('')
      : '<div class="k">关系</div><div class="txt">这个节点还没有连线。</div>';
    this.detail.innerHTML = head + meta + list;
    this.detail.classList.add('on');
  };

  Graph.prototype.bind = function () {
    var self = this;
    var c = this.canvas;

    c.addEventListener('mousemove', function (ev) {
      var r = c.getBoundingClientRect();
      var mx = ev.clientX - r.left, my = ev.clientY - r.top;
      if (self.dragNode) {
        var p = self.screenToWorld(mx, my);
        self.dragNode.x = p.x; self.dragNode.y = p.y;
        self.dragNode.fixed = true;
        self.draw();
        return;
      }
      if (self.pan) {
        self.view.x += ev.clientX - self.pan.x;
        self.view.y += ev.clientY - self.pan.y;
        self.pan = { x: ev.clientX, y: ev.clientY };
        self.draw();
        return;
      }
      var n = self.pick(mx, my);
      if (n !== self.hover) {
        self.hover = n;
        self.draw();
      }
      if (n) self.showTip(n, mx, my);
      else self.tip.classList.remove('on');
    });

    c.addEventListener('mousedown', function (ev) {
      var r = c.getBoundingClientRect();
      var mx = ev.clientX - r.left, my = ev.clientY - r.top;
      var n = self.pick(mx, my);
      if (n) { self.dragNode = n; }
      else { self.pan = { x: ev.clientX, y: ev.clientY }; c.classList.add('grabbing'); }
    });

    global.addEventListener('mouseup', function () {
      if (self.dragNode) { self.dragNode.fixed = false; self.dragNode = null; }
      self.pan = null;
      c.classList.remove('grabbing');
    });

    c.addEventListener('click', function (ev) {
      var r = c.getBoundingClientRect();
      var n = self.pick(ev.clientX - r.left, ev.clientY - r.top);
      self.selected = n;
      if (n) self.showDetail(n);
      else self.detail.classList.remove('on');
      self.draw();
    });

    c.addEventListener('wheel', function (ev) {
      ev.preventDefault();
      var r = c.getBoundingClientRect();
      var mx = ev.clientX - r.left, my = ev.clientY - r.top;
      var k0 = self.view.k;
      var k1 = Math.min(3.2, Math.max(0.22, k0 * (ev.deltaY < 0 ? 1.12 : 0.89)));
      self.view.x = mx - (mx - self.view.x) * (k1 / k0);
      self.view.y = my - (my - self.view.y) * (k1 / k0);
      self.view.k = k1;
      self.draw();
    }, { passive: false });

    this.wrap.addEventListener('click', function (ev) {
      var t = ev.target;
      if (t.hasAttribute && t.hasAttribute('data-close')) {
        self.detail.classList.remove('on');
        self.selected = null;
        self.draw();
        return;
      }
      if (t.hasAttribute && t.hasAttribute('data-go')) {
        var want = t.getAttribute('data-go');
        var hit = self.nodes.filter(function (n) { return n.label === want; })[0];
        if (hit) {
          self.selected = hit;
          self.showDetail(hit);
          self.view.x = self.w / 2 - hit.x * self.view.k;
          self.view.y = self.h / 2 - hit.y * self.view.k;
          self.draw();
        }
        return;
      }
      var f = t.closest ? t.closest('[data-f]') : null;
      if (f) {
        var key = f.getAttribute('data-f');
        if (key === 'all') {
          self.hidden = {};
          self.wrap.querySelectorAll('[data-f]').forEach(function (b) { b.classList.add('on'); });
        } else {
          self.hidden[key] = !self.hidden[key];
          f.classList.toggle('on', !self.hidden[key]);
        }
        self.draw();
        return;
      }
      var z = t.closest ? t.closest('[data-z]') : null;
      if (z) {
        var mode = z.getAttribute('data-z');
        if (mode === 'fit') { self.fit(); return; }
        var kk = mode === 'in' ? 1.25 : 0.8;
        self.view.x = self.w / 2 - (self.w / 2 - self.view.x) * kk;
        self.view.y = self.h / 2 - (self.h / 2 - self.view.y) * kk;
        self.view.k *= kk;
        self.draw();
      }
    });
  };

  Graph.prototype.screenToWorld = function (mx, my) {
    return { x: (mx - this.view.x) / this.view.k, y: (my - this.view.y) / this.view.k };
  };

  Graph.prototype.search = function (q) {
    this.query = (q || '').toLowerCase();
    if (!this.query) { this.selected = null; this.draw(); return; }
    var hit = this.nodes.filter(function (n) {
      return (n.label || '').toLowerCase().indexOf(this.query) >= 0 ||
             (n.content || '').toLowerCase().indexOf(this.query) >= 0;
    }.bind(this))[0];
    if (hit) {
      this.selected = hit;
      this.showDetail(hit);
      this.view.x = this.w / 2 - hit.x * this.view.k;
      this.view.y = this.h / 2 - hit.y * this.view.k;
    }
    this.draw();
    return !!hit;
  };

  Graph.prototype.destroy = function () {
    if (this._raf) global.cancelAnimationFrame(this._raf);
    this.host.innerHTML = '';
  };

  global.MCGraph = Graph;
})(window);

/* ============================================================================
   Mnemosyne OS — 演示 & 测试（管理员专属）
   ----------------------------------------------------------------------------
   2026-10-21 重做。上一版是"预置文案 + 点一下自动生成"，客户看两眼就不信了。
   这一版把演示拆成左右两块：

     左 = 实时沙盒：访客自己注册、自己在两个会话框里打字。
          打字 → 模型抽原子事实 → 真的 retain → 气泡里当场显示"形成了哪几条记忆"；
          提问 → 真的 recall → 气泡里显示命中的记忆与分数。
     右 = 流程讲解：十章照旧，但**每一章都吃左边的真实数据**
          （真实的记忆 id、真实的召回分数、真实的图谱）。

   会话气泡按微信的样式做：自己在右（绿），Agent 在左（浅灰 + 头像）。
   ========================================================================== */
(function () {
  'use strict';

  function host() { return window.MCDemoHost || {}; }
  function esc(s) { var h = host(); return h.esc ? h.esc(s) : String(s == null ? '' : s); }
  function dz(zh, en) { var h = host(); return h.dz ? h.dz(zh, en) : zh; }
  function post(p, b) { var h = host(); return h.post ? h.post(p, b) : Promise.resolve({ ok: false, body: {} }); }
  /* 记忆抽取 / 召回作答要等模型，用放宽到 70 秒的通道 */
  function postSlow(p, b) { var h = host(); return h.postSlow ? h.postSlow(p, b) : post(p, b); }
  function api(p) { var h = host(); return h.api ? h.api(p) : Promise.resolve({ ok: false, body: {} }); }
  function toast(t) { var h = host(); if (h.toast) h.toast(t); }
  function icons() { var h = host(); if (h.icons) h.icons(); }

  var D = {
    state: null,
    chat: { A: [], B: [] },
    busy: { A: false, B: false, flow: false },
    chapter: 0,
    done: {},
    rightTab: 'flow',     /* flow = 讲解流程；mem = 记忆流水 */
    mine: false,          /* 本浏览器是否已经注册过沙盒账号 */
    turns: [],            /* 每一轮：用户说了什么、形成几条、召回几条 */
    full: false,
    wait: { A: 0, B: 0 },  /* 这一轮已经等了几秒：气泡里显示，避免看起来像卡死 */
    ui: { q: '', fix: '', target: '', reg: { email: '', password: '' } }
  };

  var SCENE = { brand: '星河咖啡', role: '客服 Agent' };

  var TYPE_ZH = {
    semantic: '语义', episodic: '情景', procedural: '程序性',
    preference: '偏好', identity: '身份', lesson: '经验', strategy: '策略'
  };

  function recent() { return (D.state && D.state.recent) || []; }
  function memCount() { return (D.state && D.state.memories) || 0; }
  /* 只有本浏览器注册过的账号才算"我的"。
     沙盒是单租户的（服务端只记一个当前账号），如果直接返回 state.account，
     新访客一进来就会看到上一位访客的账号和聊天记录 —— 销售现场很尴尬。 */
  function account() { return (D.mine && D.state && D.state.account) || null; }
  function lastUserText(s) {
    var arr = D.chat[s] || [];
    for (var i = arr.length - 1; i >= 0; i--) if (arr[i].role === 'user') return arr[i].text;
    return '';
  }
  function firstMem() { return recent()[0] || null; }

  function needAccount() {
    return { ok: false, title: '还差一步：先在左边注册', lines: [],
             note: '这一章要用你自己的账号与记忆。左边「① 注册」填个邮箱就能继续。' };
  }
  function needChat() {
    return { ok: false, title: '左边还没有对话', lines: [],
             note: '先在左边会话 A 里说一句话（比如"张女士只喝燕麦奶，乳糖不耐"），再回来。' };
  }

  /* ---------------------------------------------------------------- 章节 */

  var CHAPTERS = [
    {
      id: 'signup', zh: '注册', kicker: '从零开始',
      title: '一个账号，一套属于它的记忆库',
      lead: '注册不在官网跳来跳去 —— 就在左边那个表单里。你填的邮箱会成为一个真实账号，' +
            '注册完它就在「注册用户信息」里，记忆库从 0 条开始。',
      points: ['左边填邮箱 + 密码，点「注册并进入」',
               '系统为它创建独立的命名空间（与其他账号物理隔离）',
               '这一步之后，右边所有章节都用这个账号的真实数据'],
      cta: '检查注册结果',
      run: function () {
        if (!account()) return needAccount();
        return api('/api/demo/state').then(function (r) {
          var s = (r && r.ok && r.body) || {};
          D.state = s;
          return { ok: true, ms: 0, title: '账号已就绪',
                   lines: [['邮箱', account().email],
                           ['命名空间', account().namespace],
                           ['记忆库', memCount() + ' 条'],
                           ['沙盒账号数', (s.accounts || []).length + ' 个']],
                   note: '它是个真账号：现在就能在「注册用户信息」里找到。',
                   actions: [{ label: '去注册用户信息里看它', act: 'goto', to: 'users' }] };
        });
      }
    },

    {
      id: 'deploy', zh: '握手', kicker: '接入 · 真实协议',
      title: '握手：验证端点与工具面',
      lead: '这一步做的是：从服务器侧用标准 MCP 协议连一次网关，验证端点可达、' +
            '鉴权有效、52 个工具齐全。这就是客户在自己电脑上接完之后，客户端会看到的东西。',
      points: ['真实 JSON-RPC：initialize → tools/list，不是模拟',
               '协议版本是协商出来的：客户端提议、服务端接受，两边可以不同',
               '它不会在你电脑上安装任何东西 —— 浏览器没有写你磁盘的权限；' +
               '真正落地的是安装器命令，点下面的「在我电脑上真接一次」',
               '接上之后你在自己 Agent 里写的东西，会出现在这个演示库和右侧「记忆流水」里'],
      cta: '执行一次真实握手',
      run: function () {
        return post('/api/demo/handshake', {}).then(function (r) {
          var b = (r && r.ok && r.body) || {};
          if (!b.ok) return { ok: false, title: '握手失败（网关不可达）', lines: [['原因', b.error || '']] };
          var same = (b.proposed === b.accepted);
          return {
            ok: true, ms: b.ms, title: '握手成功',
            lines: [
              ['客户端提议', b.proposed || '—'],
              ['服务端接受', (b.accepted || '—') + (same ? '（一致）' : '（服务端不支持提议的版本，回退到自己最高支持的）')],
              ['服务端支持', (b.supported || []).join(' / ') || '—'],
              ['服务端', ((b.server || {}).name || '—') + ' · v' + ((b.server || {}).version || '')],
              ['能力', (b.capabilities || []).join(' / ') || 'tools'],
              ['可用工具', b.tools + ' 个'],
              ['命名空间', b.namespace || '—'],
              ['耗时', b.ms + ' ms']
            ],
            note: '这次握手是服务端发起的，所以它只证明"端点与工具面没问题"。' +
                  '要在你自己的电脑上真接一次，点下面的按钮拿一条带密钥的安装命令。',
            actions: [{ label: '在我电脑上真接一次', act: 'demo-key' }],
            raw: b
          };
        });
      }
    },

    {
      id: 'write', zh: '记忆形成', kicker: '核心 · 基础能力',
      title: '你那句话，是怎么变成记忆的',
      lead: '这是整个系统最关键的一步。你在左边说一句话，系统不是把它原样存下来，' +
            '而是抽出其中的原子事实、判断类型、打上标签，再一条条写进记忆库。',
      points: ['有模型：由模型判断"哪句值得记"，抽成第三人称事实',
               '没模型：规则切句 + 类型启发式，页面会如实标注',
               '每条记忆都有 id、类型、标签、置信度 —— 后续召回与更正都靠它'],
      cta: '汇总左边形成了什么',
      run: function () {
        if (!account()) return needAccount();
        if (!recent().length) return needChat();
        return api('/api/demo/state').then(function (r) {
          var s = (r && r.ok && r.body) || {};
          D.state = s;
          var rows = (s.recent || []).slice(0, 6).map(function (m, i) {
            return ['#' + (i + 1) + ' ' + (TYPE_ZH[m.type] || m.type),
                    m.content.slice(0, 56) + (m.content.length > 56 ? '…' : '')];
          });
          return { ok: true, ms: 0, title: '记忆库里现在有 ' + (s.memories || 0) + ' 条',
                   lines: rows.length ? rows : [['状态', '还没有']],
                   note: '左边每发一句话，就会多出 1~3 条这样的原子记忆。id 可以在「记忆库」里核。',
                   actions: [{ label: '去记忆库看全文', act: 'goto', to: 'memories' }] };
        });
      }
    },

    {
      id: 'recall', zh: '同会话召回', kicker: '基础能力',
      title: '问一句话，取回该取回的',
      lead: '召回不是关键词搜索：BM25 关键词、向量语义、知识图谱边、时间衰减、置信度加权' +
            '五路并行，融合成 top-k。你在左边随口问一句，走的就是这条路 —— 没有开关，' +
            '系统自己判断该不该查。',
      points: ['每条命中带相似度分数，不是黑盒',
               '同时返回上下文预算用了多少 token',
               '检索只在这个账号的库里进行'],
      cta: '用这句话去召回',
      run: function () {
        if (!account()) return needAccount();
        if (!recent().length) return needChat();
        var q = (D.ui.q || lastUserText('A') || (firstMem() || {}).content || '').trim();
        return postSlow('/api/demo/chat', { session: 'A', text: q, mode: 'ask' }).then(function (r) {
          var b = (r && r.ok && r.body) || {};
          if (!b.ok) return { ok: false, title: '召回失败', lines: [['原因', b.message || '']] };
          D.chat.A.push({ role: 'user', text: q, at: Date.now() });
          D.chat.A.push({ role: 'agent', text: b.answer || '', at: Date.now(), hits: b.hits || [] });
          paintChat('A');
          var lines = (b.hits || []).slice(0, 5).map(function (h, i) {
            return ['#' + (i + 1) + ' · ' + (h.score != null ? Number(h.score).toFixed(3) : '—'),
                    String(h.content || '').slice(0, 50) + '…'];
          });
          return { ok: true, ms: b.ms, title: '命中 ' + (b.hits || []).length + ' 条',
                   lines: lines.length ? lines : [['结果', '没有命中']],
                   note: '问的是：「' + q.slice(0, 40) + '」。答案由' +
                         (b.answered_by === 'llm' ? '模型依据命中记忆生成' : '命中记忆直接拼出') + '。',
                   raw: b };
        });
      }
    },

    {
      id: 'cross', zh: '跨会话', kicker: '关键差异',
      title: '换个会话，它还认得你',
      lead: '大多数"记忆"只能记住当前对话。这里先把会话 A 压成七要素摘要，' +
            '再在会话 B 里取回 —— 取得到，才叫长期记忆。',
      points: ['session_summarize：目标 / 约束 / 决策 / 未决 / 产物 / 失败 / 偏好',
               'session_recall：新会话直接拿到上一轮的结论与未决事项',
               '左边 A / B 两个框就是两个真实会话'],
      cta: '把 A 总结，在 B 里取回',
      run: function () {
        if (!account()) return needAccount();
        var a = (D.chat.A || []).filter(function (m) { return m.role === 'user'; });
        if (!a.length) return needChat();
        var msgs = (D.chat.A || []).map(function (m) {
          return { role: m.role === 'user' ? 'user' : 'assistant', content: m.text };
        });
        return postSlow('/api/demo/call', {
          step: 'cross-1', tool: 'session_summarize',
          args: { session_id: 'demo-A', messages: msgs }
        }).then(function (r1) {
          if (!r1 || !r1.ok) return { ok: false, title: '会话摘要失败', lines: [['原因', (r1 && r1.error) || '']] };
          return postSlow('/api/demo/chat', {
            session: 'B', text: '上次我们聊到哪了？还有什么事没解决？', mode: 'ask'
          }).then(function (r2) {
            var b = (r2 && r2.ok && r2.body) || {};
            D.chat.B.push({ role: 'user', text: '上次我们聊到哪了？', at: Date.now() });
            D.chat.B.push({ role: 'agent', text: b.answer || '', at: Date.now(), hits: b.hits || [] });
            paintChat('B');
            var d = (r1.data || {});
            return { ok: true, ms: (r1.ms || 0) + (b.ms || 0),
                     title: '会话 B 取回了会话 A 的内容',
                     lines: [['摘要目标', String(d.goal || d.summary || '').slice(0, 60) || '已生成'],
                             ['未决事项', String((d.pending || []).length) + ' 条'],
                             ['B 里命中', (b.hits || []).length + ' 条记忆'],
                             ['B 的回答', String(b.answer || '').slice(0, 60)]],
                     note: '会话 B 一条历史消息都没有，靠摘要与记忆把上下文接上了。',
                     raw: { summarize: d, recall: b } };
          });
        });
      }
    },

    {
      id: 'correct', zh: '更正与冲突', kicker: '进阶能力',
      title: '说错了要能改，而且改得留痕',
      lead: '客户改口、规则变更，都是常态。直接再写一条会变成"两个说法都记得"，' +
            '系统要做的是：写入新说法，同时把旧说法标记为被取代。',
      points: ['retain(supersedes=旧 id)：写入即更正',
               '召回时旧条目带 superseded 标记，Agent 不会拿旧规则回答',
               '历史保留、可追溯 —— 合规场景的硬要求'],
      cta: '更正选中的那条',
      run: function () {
        if (!account()) return needAccount();
        if (!recent().length) return needChat();
        var target = D.ui.target || (firstMem() || {}).id;
        var fix = (D.ui.fix || '').trim();
        if (!fix) return { ok: false, title: '先填更正后的说法', lines: [],
                           note: '上面那个输入框里写"新的说法"，比如把"周三会员日"改成"周二"。' };
        return postSlow('/api/demo/call', {
          step: 'correct-1', tool: 'retain',
          args: { content: fix, mtype: 'semantic', tags: ['更正', 'sandbox'],
                  importance: 4, supersedes: target }
        }).then(function (r1) {
          if (!r1 || !r1.ok) return { ok: false, title: '更正失败', lines: [['原因', (r1 && r1.error) || '']] };
          return postSlow('/api/demo/chat', { session: 'A', text: fix, mode: 'ask' }).then(function (r2) {
            var b = (r2 && r2.ok && r2.body) || {};
            D.chat.A.push({ role: 'user', text: '更正：' + fix, at: Date.now() });
            D.chat.A.push({ role: 'agent', text: b.answer || '', at: Date.now(), hits: b.hits || [] });
            paintChat('A');
            var hits = (b.hits || []).map(function (h, i) {
              return ['#' + (i + 1) + ' · ' + (h.verification || 'active'),
                      String(h.content || '').slice(0, 48) + '…'];
            });
            return { ok: true, ms: (r1.ms || 0) + (b.ms || 0), title: '新说法已生效',
                     lines: hits.length ? hits : [['结果', '召回为空']],
                     note: '注意 verification 一列：superseded 的那条不会被当成当前事实引用。',
                     raw: { retain: r1.data, recall: b } };
          });
        });
      }
    },

    {
      id: 'graph', zh: '图谱与画像', kicker: '进阶能力',
      title: '它不只知道事实，还知道事实之间的关系',
      lead: '记忆不是一堆孤立的句子。实体连成图，客户被压成一张画像卡 —— ' +
            '后者可以直接拼进 system prompt，让模型一开口就"认识"这个人。',
      points: ['graph_query：从实体出发看它连着哪些事实',
               'profile_card：稳定身份 / 偏好与约束 / 当前情境',
               '图与画像都来自左边那些话，不是预置数据'],
      cta: '查这个账号的图谱与画像',
      run: function () {
        if (!account()) return needAccount();
        var ent = '';
        var rows = recent();
        for (var i = 0; i < rows.length; i++) {
          var m = /([\u4e00-\u9fa5]{2,4})(女士|先生|老师|经理)/.exec(rows[i].content || '');
          if (m) { ent = m[1] + m[2]; break; }
        }
        var p1 = ent
          ? postSlow('/api/demo/call', { step: 'graph-1', tool: 'graph_query', args: { entity: ent, depth: 2 } })
          : Promise.resolve({ ok: true, data: {}, ms: 0 });
        return p1.then(function (r1) {
          return postSlow('/api/demo/call', { step: 'graph-2', tool: 'profile_card',
                                          args: { include_context: true, max_tokens: 600 } })
            .then(function (r2) {
              var g = (r1 && r1.data) || {};
              var p = (r2 && r2.data) || {};
              var card = p.text || p.card || p.profile || '';
              return { ok: true, ms: ((r1 && r1.ms) || 0) + ((r2 && r2.ms) || 0),
                       title: ent ? '从「' + ent + '」出发' : '图谱与画像',
                       lines: [['图谱节点', (g.nodes || []).length + ' 个'],
                               ['图谱关系', (g.edges || []).length + ' 条'],
                               ['画像卡', card ? String(card).replace(/\s+/g, ' ').slice(0, 90) + '…'
                                              : '（记忆还不够，暂未形成）']],
                       note: '画像卡按 token 预算裁：超预算先砍情境、再砍未决，绝不截断半句事实。',
                       actions: [{ label: '去看记忆图谱', act: 'goto', to: 'graph' }],
                       raw: { graph: g, profile: p } };
            });
        });
      }
    },

    {
      id: 'forget', zh: '遗忘与审计', kicker: '高级能力',
      title: '让它忘掉，但账要留着',
      lead: '客户要求删掉某条信息时，"删干净"和"可追溯"是矛盾的。' +
            '这里的做法是：召回里立刻消失，审计链里永远留痕。',
      points: ['forget：置信度降 0 并标记 deleted，召回不再返回',
               '审计链逐条哈希，改任何一条都会断链',
               '真要物理删除是另一个显式动作'],
      cta: '遗忘选中的那条，再查审计',
      run: function () {
        if (!account()) return needAccount();
        if (!recent().length) return needChat();
        var mid = D.ui.target || (firstMem() || {}).id;
        var label = (recent().filter(function (m) { return m.id === mid; })[0] || {}).content || mid;
        return postSlow('/api/demo/call', { step: 'forget-1', tool: 'forget',
                                        args: { memory_id: mid, reason: 'demo' } })
          .then(function (r1) {
            if (!r1 || !r1.ok) return { ok: false, title: '遗忘失败', lines: [['原因', (r1 && r1.error) || '']] };
            return postSlow('/api/demo/chat', { session: 'A', text: label, mode: 'ask' }).then(function (r2) {
              var b = (r2 && r2.ok && r2.body) || {};
              return postSlow('/api/demo/call', { step: 'forget-3', tool: 'audit',
                                              args: { memory_id: mid } }).then(function (r3) {
                var a = (r3 && r3.data) || {};
                var entries = a.entries || a.items || a.trail || [];
                D.chat.A.push({ role: 'user', text: '把「' + label.slice(0, 24) + '…」忘掉', at: Date.now() });
                D.chat.A.push({ role: 'agent', text: '已遗忘。召回里查不到了，审计里还在。',
                                at: Date.now(), hits: b.hits || [] });
                paintChat('A');
                refreshState();
                return { ok: true, ms: (r1.ms || 0) + (r3.ms || 0),
                         title: '已遗忘，审计留痕',
                         lines: [['遗忘对象', label.slice(0, 40)],
                                 ['召回结果', (b.hits || []).length + ' 条（这条已不再出现）'],
                                 ['审计记录', entries.length + ' 条']],
                         note: '召回里已经查不到，但审计链里那条 forget 还在，哈希可校验。',
                         raw: { forget: r1.data, audit: a } };
              });
            });
          });
      }
    },

    {
      id: 'consolidate', zh: '巩固与度量', kicker: '高级能力',
      title: '像睡觉一样整理记忆',
      lead: '聊得越多，重复和碎片越多。巩固作业把相似的合并、把成功的经验固化成 playbook、' +
            '把失败的记成负记忆 —— 这就是控制台里的「梦」。',
      points: ['memory_consolidate：情景→语义、成功→经验、失败→负记忆',
               'memory_metrics：13 项指标，数据不足时明确说"不足"',
               '可定时跑，也可以手动跑一轮'],
      cta: '跑一轮巩固',
      run: function () {
        if (!account()) return needAccount();
        return postSlow('/api/demo/call', { step: 'consol-1', tool: 'memory_consolidate', args: {} })
          .then(function (r1) {
            return postSlow('/api/demo/call', { step: 'consol-2', tool: 'memory_metrics', args: {} })
              .then(function (r2) {
                var m = (r2 && r2.data) || {};
                var keys = Object.keys(m).filter(function (k) {
                  return m[k] && typeof m[k] === 'object' && ('value' in m[k] || 'status' in m[k]);
                });
                var ready = keys.filter(function (k) { return m[k].value != null; });
                return { ok: true, ms: ((r1 && r1.ms) || 0) + ((r2 && r2.ms) || 0),
                         title: '这一轮巩固完成',
                         lines: [['巩固结果', summarizeConsolidate((r1 || {}).data)],
                                 ['指标总数', keys.length + ' 项'],
                                 ['有数据', ready.length + ' 项'],
                                 ['数据不足', (keys.length - ready.length) + ' 项（如实标注）']],
                         note: '「数据不足」不是失败，是诚实：0 和"没数据"是两件事。',
                         raw: { consolidate: (r1 || {}).data, metrics: m } };
              });
          });
      }
    },

    {
      id: 'console', zh: '控制台联动', kicker: '收口',
      title: '刚才发生的一切，控制台里都能查',
      lead: '演示不是录像。这个账号、这些记忆、这条审计链，都真实存在于控制台里 —— ' +
            '点下面任意一个入口，就能带着这个账号的数据继续看。',
      points: ['注册用户信息 → 选中刚才注册的账号 → 全量档案',
               '记忆库 → 你在左边说的每一句都在，带确切时间',
               '记忆图谱 → 就是第 7 章那张图'],
      cta: '刷新这个账号的数据',
      run: function () {
        if (!account()) return needAccount();
        return postSlow('/api/demo/call', { step: 'console-stats', tool: 'stats', args: {} })
          .then(function (st) {
            return api('/api/demo/state').then(function (r) {
              var s = (r && r.ok && r.body) || {};
              D.state = s;
              var q = (st && st.data) || {};
              return { ok: true, ms: st.ms || 0, title: '这个账号的现状',
                       lines: [['账号', account().email],
                               ['记忆条数', String(s.memories || 0)],
                               ['记忆类型', Object.keys(s.types || {}).map(function (k) {
                                 return (TYPE_ZH[k] || k) + ' ' + s.types[k];
                               }).join(' / ') || '—'],
                               ['本次会话', '写入 ' + (q.session_retain || 0) + ' 次 · 召回 ' +
                                             (q.session_recall || 0) + ' 次'],
                               ['估算省下 Token', String(q.session_saved_tokens || q.today_saved_tokens || 0)]],
                       note: '下面三个按钮会切到这个账号再跳页。',
                       actions: [{ label: '打开记忆库', act: 'goto', to: 'memories' },
                                 { label: '打开记忆图谱', act: 'goto', to: 'graph' },
                                 { label: '在注册用户信息里查看', act: 'goto', to: 'users' }],
                       raw: s };
            });
          });
      }
    }
  ];

  function summarizeConsolidate(d) {
    if (!d) return '无返回';
    var parts = [];
    ['promoted', 'created', 'consolidated', 'merged', 'semantic', 'procedural', 'anti_pattern']
      .forEach(function (k) {
        var v = d[k];
        if (Array.isArray(v) && v.length) parts.push(k + ' ' + v.length);
        else if (typeof v === 'number' && v) parts.push(k + ' ' + v);
      });
    if (!parts.length && d.summary) return String(d.summary).slice(0, 80);
    return parts.length ? parts.join(' · ') : '本轮没有需要合并的条目';
  }

  /* ------------------------------------------------------------------ 外壳 */

  function shell() {
    return '' +
      '<div class="dm2' + (D.full ? ' full' : '') + '">' +
        '<div class="dm2-bar">' +
          '<span class="dm-pill">' + esc(dz('演示模式', 'DEMO')) + '</span>' +
          '<span class="dm-scene">' + esc(SCENE.brand) + ' · ' + esc(SCENE.role) + '</span>' +
          '<span class="dm2-acct" id="dm2-acct"></span>' +
          '<span class="dm-sp"></span>' +
          '<button class="dm-ghost" data-dm="reset">' + esc(dz('重置演示', 'Reset')) + '</button>' +
          '<button class="dm-ghost" data-dm="full">' + esc(D.full ? dz('退出全屏', 'Exit') : dz('全屏', 'Fullscreen')) + '</button>' +
          '<button class="dm-ghost" data-dm="exit">' + esc(dz('退出演示', 'Close')) + '</button>' +
        '</div>' +
        '<div class="dm2-body">' +
          '<section class="dm2-left" id="dm2-left"></section>' +
          '<section class="dm2-right" id="dm2-right"></section>' +
        '</div>' +
      '</div>';
  }

  /* ------------------------------------------------------------ 左：沙盒 */

  function leftHTML() {
    var acc = account();
    return '' +
      (acc ? accountHTML(acc) : registerHTML()) +
      chatHTML('A', dz('会话 A · 同会话', 'Session A'),
               dz('像平时一样说话：说的事会被记住，问的问题会被回答',
                  'Just talk: statements are remembered, questions are answered')) +
      chatHTML('B', dz('会话 B · 跨会话', 'Session B'),
               dz('这里没有历史消息，直接问它试试', 'No history here — just ask'));
  }

  function registerHTML() {
    return '' +
      '<div class="sb-card">' +
        '<div class="sb-hd"><b>① 注册</b>' +
          '<span class="sb-hint">' + esc(dz('就在这儿注册，不用跳去官网', 'Sign up right here')) + '</span></div>' +
        '<div class="sb-form">' +
          '<input class="sb-inp" id="sb-email" placeholder="' + esc(dz('邮箱，例如 zhang@x.com', 'Email')) +
            '" value="' + esc(D.ui.reg.email) + '">' +
          '<input class="sb-inp" id="sb-pass" type="text" placeholder="' + esc(dz('密码（≥8 位）', 'Password (8+)')) +
            '" value="' + esc(D.ui.reg.password) + '">' +
          '<div class="sb-row">' +
            '<button class="sb-btn" data-dm="fill">' + esc(dz('随便填一个', 'Fill one')) + '</button>' +
            '<button class="sb-btn pri" data-dm="register">' + esc(dz('注册并进入', 'Sign up')) + '</button>' +
          '</div>' +
        '</div>' +
      '</div>';
  }

  /* 右侧「记忆流水」：每一轮形成了什么、召回了什么。
     客户要看的是"它到底记住了什么"，这些数据放在这里，而不是塞进聊天气泡。 */
  function memStreamHTML() {
    var turns = (D.turns || []).slice().reverse();
    if (!turns.length) {
      return '<div class="dm2-flow"><div class="dm2-stage in">' +
        '<div class="dm-kicker">' + esc(dz('记忆流水', 'Memory log')) + '</div>' +
        '<h2 class="dm-title">' + esc(dz('左边每聊一句，这里就多一条', 'Every turn shows up here')) + '</h2>' +
        '<p class="dm-lead">' + esc(dz(
          '这里只放两样东西：这句话形成了哪些记忆、回答时召回了几条。聊天本身在左边，正常进行。',
          'Two things only: what got stored, and what got recalled. The chat itself stays on the left.')) + '</p>' +
        '</div></div>';
    }
    return '<div class="dm2-flow"><div class="ms">' + turns.map(function (t, i) {
      var facts = (t.facts || []).filter(function (f) { return f.ok !== false; });
      var hits = t.hits || [];
      return '<div class="ms-turn">' +
        '<div class="ms-q"><span class="who">' + esc(dz('顾客', 'Customer')) + '</span>' +
          esc(t.text) + '<span class="at">' + esc(t.at || '') + '</span></div>' +
        (facts.length
          ? '<div class="ms-sec">' + esc(dz('形成 ' + facts.length + ' 条记忆', facts.length + ' stored')) +
            '<span class="src">' + esc(extractLabel({ source: t.source, extract: t.extract })) + '</span></div>' +
            facts.map(function (f) {
              return '<div class="ms-it"><span class="ty">' + esc(TYPE_ZH[f.type] || f.type) + '</span>' +
                '<span class="tx">' + esc(f.content) + '</span>' +
                '<span class="id">' + esc(String(f.id || '').slice(0, 8)) + '</span></div>';
            }).join('')
          : '<div class="ms-sec muted">' + esc(dz('未形成记忆（问句/寒暄不存）', 'nothing stored')) +
            (t.extract && t.extract.model ? '<span class="src">' + esc(t.extract.model) + '</span>' : '') + '</div>') +
        (hits.length
          ? '<div class="ms-sec">' + esc(dz('召回 ' + hits.length + ' 条', hits.length + ' recalled')) + '</div>' +
            hits.slice(0, 3).map(function (h) {
              return '<div class="ms-it"><span class="sc">' +
                (h.score != null ? Number(h.score).toFixed(2) : '—') + '</span>' +
                '<span class="tx">' + esc(String(h.content || '').slice(0, 60)) + '</span></div>';
            }).join('')
          : '') +
        '</div>';
    }).join('') + '</div></div>';
  }

  function accountHTML(acc) {
    return '' +
      '<div class="sb-card sb-acc">' +
        '<div class="sb-hd"><b>① 已注册</b>' +
          '<span class="sb-hint">' + esc(dz('这是你自己的账号', 'Your account')) + '</span></div>' +
        '<div class="sb-acc-row">' +
          '<span class="sb-avatar">' + esc((acc.email || '?').slice(0, 1).toUpperCase()) + '</span>' +
          '<span class="sb-acc-tx"><b>' + esc(acc.email) + '</b>' +
            '<span>' + esc(acc.namespace) + ' · ' + memCount() + ' ' + esc(dz('条记忆', 'memories')) + '</span></span>' +
        '</div>' +
      '</div>';
  }

  function chatHTML(session, title, ph) {
    var msgs = D.chat[session] || [];
    return '' +
      '<div class="sb-chat" data-session="' + session + '">' +
        '<div class="sb-chat-hd">' +
          '<b>' + esc(title) + '</b>' +
          '<span class="sb-count" id="sb-count-' + session + '">' + msgs.length + '</span>' +
        '</div>' +
        '<div class="sb-msgs" id="sb-msgs-' + session + '">' + msgsHTML(session) + '</div>' +
        '<div class="sb-composer">' +
          '<textarea class="sb-ta" id="sb-ta-' + session + '" rows="2" placeholder="' +
            esc(ph) + '"></textarea>' +
          '<button class="sb-send" data-dm="send" data-s="' + session + '"' +
            (D.busy[session] ? ' disabled' : '') + '>' +
            (D.busy[session] ? '<span class="dm-spin"></span>' : esc(dz('发送', 'Send'))) + '</button>' +
        '</div>' +
      '</div>';
  }

  function msgsHTML(session) {
    var msgs = D.chat[session] || [];
    if (!msgs.length) {
      return '<div class="sb-empty">' + esc(dz('还没有消息。说一句话试试。', 'No messages yet.')) + '</div>';
    }
    var out = '', lastT = 0;
    msgs.forEach(function (m) {
      var t = m.at || Date.now();
      if (!lastT || t - lastT > 60000) {
        out += '<div class="bub-time">' + esc(fmtClock(t)) + '</div>';
        lastT = t;
      }
      var me = m.role === 'user';
      out += '<div class="bub-row ' + (me ? 'me' : 'ai') + '">' +
        '<span class="bub-av">' + (me ? esc(dz('我', 'Me')) : 'M') + '</span>' +
        '<div class="bub-wrap">' +
          '<div class="bub">' + esc(m.text || '') + '</div>' +
          turnFold(m) +
        '</div></div>';
    });
    /* 正在等模型：给一个会走秒的"正在想"，而不是一个转圈让人以为卡死。
       云端模型单次 5~40 秒都正常，客户看得见秒数就不会以为坏了。 */
    if (D.busy[session]) {
      out += '<div class="bub-row ai bub-wait" id="sb-think-' + session + '">' +
        '<span class="bub-av">M</span>' +
        '<div class="bub-wrap"><div class="bub bub-dots">' +
          '<span class="d1"></span><span class="d2"></span><span class="d3"></span>' +
          '<em class="sb-sec">' + (D.wait[session] || 0) + 's</em>' +
        '</div></div></div>';
    }
    return out;
  }

  /* 什么时候显示"命中"卡：
       提问 —— 一律显示，这是"它能召回"的证据；
       陈述 —— 只在相关度足够高时显示（比如你提到一个它早就记着的客户），
               否则每说一句都挂一张"命中 0 条"，反而像测试台。 */
  function showHits(m) {
    if (!m || !m.hits || !m.hits.length) return false;
    if (m.kind === 'question') return true;
    var top = 0;
    m.hits.forEach(function (h) { top = Math.max(top, Number(h.score) || 0); });
    return top >= 0.6;
  }

  /* 记忆是**背后的动作**：气泡里只留一行小字，想看细节再展开。
     上一版把"形成了哪几条记忆"直接铺在气泡下面，一眼就是测试台。 */
  function turnFold(m) {
    var facts = (m.facts || []).filter(function (f) { return f.ok !== false; });
    var hits = m.hits || [];
    if (!facts.length && !hits.length && !(m.extract && m.extract.parse_failed)) return '';
    var bits = [];
    if (facts.length) bits.push(dz('已存入 ' + facts.length + ' 条', facts.length + ' stored'));
    if (hits.length) bits.push(dz('召回 ' + hits.length + ' 条', hits.length + ' recalled'));
    if (!bits.length) bits.push(dz('记忆未形成', 'nothing stored'));
    return '<details class="turn-fold">' +
      '<summary>' + esc(bits.join(' · ')) + '</summary>' +
      '<div class="turn-body">' +
        (facts.length ? factsHTML(facts, m.source, m.extract) : '') +
        (hits.length ? hitsHTML(hits) : '') +
        (m.extract && m.extract.parse_failed
          ? '<div class="mem-card none"><div class="mem-hd">' +
            esc(dz('模型输出无法解析，已退回规则切分', 'Model output unparsable — fell back to rules')) +
            '</div></div>' : '') +
      '</div></details>';
  }

  /* 这一句到底是谁抽的：模型、还是规则。
     用户配了模型却看到"规则切分"会以为没生效，所以这里把模型名也写出来。 */
  function extractLabel(m) {
    var ex = m.extract || {};
    if (m.source === 'llm') {
      return ex.model ? ('LLM 抽取 · ' + ex.model) : 'LLM 抽取';
    }
    if (ex.parse_failed) return dz('规则切分（模型输出无法解析）', 'rules (model output unparsable)');
    return dz('规则切分', 'rules');
  }

  function memoryHTML(m) {
    var facts = m.facts || [];
    var ex = m.extract || {};
    if (facts.length) return factsHTML(facts, m.source, ex);
    if (m.source === 'llm') {
      /* 模型明确判断"没有可记的内容" —— 这是结论，不是失败 */
      return '<div class="mem-card none"><div class="mem-hd">' +
        esc(dz('模型判断：这句没有需要长期记住的内容', 'The model saw nothing worth keeping')) +
        '<span class="mem-src">' + esc(extractLabel(m)) + '</span></div></div>';
    }
    if (ex.reason) {
      return '<div class="mem-card none"><div class="mem-hd">' +
        esc(dz('没形成记忆', 'Nothing stored')) +
        '<span class="mem-src">' + esc(String(ex.reason).slice(0, 40)) + '</span></div></div>';
    }
    return '';
  }

  function factsHTML(facts, source, ex) {
    var ok = facts.filter(function (f) { return f.ok !== false; });
    return '<div class="mem-card">' +
      '<div class="mem-hd">' + esc(dz('形成 ', 'Formed ')) + ok.length + esc(dz(' 条记忆', ' memories')) +
        '<span class="mem-src">' + esc(extractLabel({ source: source, extract: ex })) + '</span></div>' +
      ok.map(function (f) {
        return '<div class="mem-it">' +
          '<span class="mem-type">' + esc(TYPE_ZH[f.type] || f.type) + '</span>' +
          '<span class="mem-tx">' + esc(f.content) + '</span>' +
          '<span class="mem-id">' + esc(String(f.id || '').slice(0, 8)) + '</span>' +
          '</div>';
      }).join('') +
      '</div>';
  }

  function hitsHTML(hits) {
    return '<div class="mem-card hit">' +
      '<div class="mem-hd">' + esc(dz('命中 ', 'Hit ')) + hits.length + esc(dz(' 条', '')) + '</div>' +
      hits.slice(0, 3).map(function (h) {
        return '<div class="mem-it">' +
          '<span class="mem-score">' + (h.score != null ? Number(h.score).toFixed(2) : '—') + '</span>' +
          '<span class="mem-tx">' + esc(String(h.content || '').slice(0, 46)) + '…</span>' +
          '</div>';
      }).join('') +
      '</div>';
  }

  function fmtClock(t) {
    var d = new Date(t);
    function p(n) { return (n < 10 ? '0' : '') + n; }
    return p(d.getHours()) + ':' + p(d.getMinutes());
  }

  function paintChat(session) {
    var box = document.getElementById('sb-msgs-' + session);
    if (box) {
      box.innerHTML = msgsHTML(session);
      box.scrollTop = box.scrollHeight;
    }
    var c = document.getElementById('sb-count-' + session);
    if (c) c.textContent = (D.chat[session] || []).length;
  }

  function paintLeft() {
    var el = document.getElementById('dm2-left');
    if (!el) return;
    el.innerHTML = leftHTML();
    ['A', 'B'].forEach(function (s) {
      var box = document.getElementById('sb-msgs-' + s);
      if (box) box.scrollTop = box.scrollHeight;
    });
  }

  /* ------------------------------------------------------------ 右：章节 */

  function rightHTML() {
    var c = CHAPTERS[D.chapter];
    var res = D.done[c.id];
    var doneCount = Object.keys(D.done).filter(function (k) { return D.done[k].ok; }).length;
    return '' +
      '<div class="dm2-rtabs">' +
        '<button data-rtab="flow" class="' + (D.rightTab === 'flow' ? 'on' : '') + '">' +
          esc(dz('讲解流程', 'Walkthrough')) + '</button>' +
        '<button data-rtab="mem" class="' + (D.rightTab === 'mem' ? 'on' : '') + '">' +
          esc(dz('记忆流水', 'Memory log')) +
          '<span class="n">' + D.turns.length + '</span></button>' +
      '</div>' +
      '<div class="dm2-steps">' + CHAPTERS.map(function (ch, i) {
        var st = D.done[ch.id];
        var cls = i === D.chapter ? ' on' : (st && st.ok ? ' done' : '');
        return '<button class="dm2-step' + cls + '" data-ch="' + i + '" title="' + esc(ch.title) + '">' +
          (st && st.ok ? '✓' : (i + 1)) + '</button>';
      }).join('') + '</div>' +
      (D.rightTab === 'mem' ? memStreamHTML() :
      '<div class="dm2-flow" id="dm2-flow">' +
        '<div class="dm2-stage in">' +
          '<div class="dm-kicker">STEP ' + String(D.chapter + 1).padStart(2, '0') + ' / ' +
            CHAPTERS.length + ' · ' + esc(c.kicker) + '</div>' +
          '<h2 class="dm-title">' + esc(c.title) + '</h2>' +
          '<p class="dm-lead">' + esc(c.lead) + '</p>' +
          '<ul class="dm-points">' + c.points.map(function (p) { return '<li>' + esc(p) + '</li>'; }).join('') + '</ul>' +
          extraInputs(c) +
          '<div class="dm-cta">' +
            '<button class="dm-run" data-dm="run"' + (D.busy.flow ? ' disabled' : '') + '>' +
              (D.busy.flow ? '<span class="dm-spin"></span>' + esc(dz('正在执行…', 'Running…'))
                           : (res && res.ok ? esc(dz('再执行一次', 'Run again')) : esc(c.cta))) + '</button>' +
          '</div>' +
          (res ? resultHTML(res) : '<div class="dm-hint">' + esc(dz(
            '这一步会用左边的真实数据执行一次，结果全部来自真实调用。',
            'This step runs against the live sandbox on the left.')) + '</div>') +
          '<div class="dm-foot">' +
            '<button class="dm-ghost" data-dm="prev"' + (D.chapter > 0 ? '' : ' disabled') + '>← ' + esc(dz('上一步', 'Back')) + '</button>' +
            '<span class="dm-sp"></span>' +
            '<span class="dm-count">' + doneCount + ' / ' + CHAPTERS.length + ' ' + esc(dz('已完成', 'done')) + '</span>' +
            '<button class="dm-next" data-dm="next"' + (D.chapter < CHAPTERS.length - 1 ? '' : ' disabled') + '>' +
              esc(dz('下一步', 'Next')) + ' →</button>' +
          '</div>' +
        '</div>' +
      '</div>');
  }

  /* 需要用户输入的章节，输入框直接放在讲解下面（而不是让他去别处填） */
  function extraInputs(c) {
    if (c.id === 'recall') {
      /* 用 textarea 而不是 input：客户发的那句话往往很长（一整个会员规则），
         input 是单行，超出部分直接被切掉 —— 客户会以为系统只拿到半句。
         行数按字数估，最多 6 行，整句话看得见。 */
      var qv = D.ui.q || lastUserText('A') || '';
      var rows = Math.min(6, Math.max(2, Math.ceil(String(qv).length / 40)));
      return '<div class="dm2-field"><label>' + esc(dz('用这句话去召回（默认是你左边最后一句）', 'Query')) + '</label>' +
        '<textarea class="sb-inp dm-q" id="dm-q" rows="' + rows + '" placeholder="' +
        esc(dz('例如：张女士喝什么', 'e.g. what does she drink')) + '">' + esc(qv) + '</textarea></div>';
    }
    if (c.id === 'correct' || c.id === 'forget') {
      var rows = recent();
      if (!rows.length) return '';
      var opts = rows.map(function (m) {
        return '<option value="' + esc(m.id) + '"' + (D.ui.target === m.id ? ' selected' : '') + '>' +
          esc(m.content.slice(0, 40)) + '</option>';
      }).join('');
      var html = '<div class="dm2-field"><label>' + esc(dz('选一条记忆', 'Pick a memory')) + '</label>' +
        '<select class="sb-inp" id="dm-target">' + opts + '</select></div>';
      if (c.id === 'correct') {
        html += '<div class="dm2-field"><label>' + esc(dz('更正后的说法（会取代上面这条）', 'Corrected fact')) + '</label>' +
          '<input class="sb-inp" id="dm-fix" value="' + esc(D.ui.fix) + '" placeholder="' +
          esc(dz('例如：会员日改成每周二', 'e.g. member day moves to Tuesday')) + '"></div>';
      }
      return html;
    }
    return '';
  }

  function resultHTML(res) {
    var raw = res.raw ? JSON.stringify(res.raw, null, 2) : '';
    if (raw.length > 4000) raw = raw.slice(0, 4000) + '\n…';
    return '<div class="dm-result ' + (res.ok ? 'ok' : 'bad') + '">' +
      '<div class="dm-rhead"><span class="dot"></span><b>' + esc(res.title || (res.ok ? '完成' : '失败')) +
        '</b><span class="dm-sp"></span>' + (res.ms ? '<span class="ms">' + res.ms + ' ms</span>' : '') + '</div>' +
      ((res.lines || []).length ? '<div class="dm-lines">' + res.lines.map(function (l) {
        return '<div class="ln"><span class="k">' + esc(l[0]) + '</span><span class="v">' + esc(l[1]) + '</span></div>';
      }).join('') + '</div>' : '') +
      (res.note ? '<div class="dm-note">' + esc(res.note) + '</div>' : '') +
      (res.actions ? '<div class="dm-actions">' + res.actions.map(function (a) {
        /* a.act 决定点击行为：goto 跳页（要 a.to），demo-key 现场签发密钥。
           早先这里把每个动作都写死成 goto，于是「在我电脑上真接一次」渲染出来
           是个指向 undefined 的按钮，点了没反应 —— 客户会以为整套是假的。 */
        return '<button class="dm-ghost" data-dm="' + esc(a.act || 'goto') + '"' +
          (a.to ? ' data-to="' + esc(a.to) + '"' : '') + '>' + esc(a.label) + '</button>';
      }).join('') + '</div>' : '') +
      (raw ? '<details class="dm-raw"><summary>' + esc(dz('原始返回（可给技术方看）', 'Raw response')) +
             '</summary><pre>' + esc(raw) + '</pre></details>' : '') +
      '</div>';
  }

  function paintRight() {
    var el = document.getElementById('dm2-right');
    if (!el) return;
    el.innerHTML = rightHTML();
    icons();
    var st = document.querySelector('.dm2-stage');
    if (st) {
      st.classList.remove('in');
      requestAnimationFrame(function () { requestAnimationFrame(function () { st.classList.add('in'); }); });
    }
  }

  function paintBar() {
    var el = document.getElementById('dm2-acct');
    if (!el) return;
    var acc = account();
    el.innerHTML = acc
      ? esc(acc.email) + ' · ' + memCount() + ' ' + esc(dz('条记忆', 'memories'))
      : esc(dz('未注册', 'not registered'));
  }

  function paint() { paintBar(); paintLeft(); paintRight(); }

  /* ------------------------------------------------------------------ 动作 */

  function refreshState() {
    return api('/api/demo/state').then(function (r) {
      var s = (r && r.ok && r.body) || {};
      D.state = s;
      var mineEmail = '';
      try { mineEmail = sessionStorage.getItem('mn-demo-account') || ''; } catch (e) {}
      D.mine = !!(s.account && mineEmail && s.account.email === mineEmail);
      // 只在"这是我的账号"时恢复对话；否则新访客会看到上一位的记录
      ['A', 'B'].forEach(function (k) {
        if (D.mine && !(D.chat[k] || []).length && s.transcript && s.transcript[k]) {
          D.chat[k] = s.transcript[k].map(function (m) {
            return { role: m.role, text: m.text, at: Date.parse((m.at || '').replace(' ', 'T')) || Date.now() };
          });
        }
      });
      paint();
    });
  }

  function send(session) {
    var ta = document.getElementById('sb-ta-' + session);
    if (!ta) return;
    var text = (ta.value || '').trim();
    if (!text) return;
    D.chat[session].push({ role: 'user', text: text, at: Date.now() });
    D.busy[session] = true;
    D.wait[session] = 0;
    ta.value = '';
    paintChat(session);
    tickWait(session);
    var btn = document.querySelector('[data-dm="send"][data-s="' + session + '"]');
    if (btn) { btn.disabled = true; btn.innerHTML = '<span class="dm-spin"></span>'; }

    /* 不传 mode：由服务端自己判断这是陈述还是提问 —— 真实聊天里没有模式开关 */
    postSlow('/api/demo/chat', { session: session, text: text }).then(function (r) {
      var b = (r && r.ok && r.body) || {};
      if (!b.ok) {
        D.chat[session].push({ role: 'agent', text: String(b.message || b.error || '出错了'), at: Date.now() });
      } else {
        D.chat[session].push({
          role: 'agent', text: b.reply || '', at: Date.now(),
          facts: b.facts || [], source: b.source, hits: b.hits || [],
          extract: b.extract || {}, kind: b.kind, top: b.top_score || 0
        });
        D.turns.push({
          text: text, at: fmtClock(Date.now()),
          facts: b.facts || [], hits: b.hits || [],
          source: b.source, extract: b.extract || {}, session: session
        });
      }
      D.busy[session] = false;
      stopWait(session);
      var btn2 = document.querySelector('[data-dm="send"][data-s="' + session + '"]');
      if (btn2) { btn2.disabled = false; btn2.innerHTML = esc(dz('发送', 'Send')); }
      paintChat(session);
      refreshState();
    })['catch'](function (e) {
      D.busy[session] = false;
      stopWait(session);
      D.chat[session].push({ role: 'agent', text: '请求失败：' + (e && e.message || e), at: Date.now() });
      paintChat(session);
    });
  }

  /* 等待计时器：只改那个小数字，不重绘整个列表（重绘会丢滚动位置） */
  var WAIT_TIMERS = {};
  function tickWait(session) {
    stopWait(session);
    WAIT_TIMERS[session] = setInterval(function () {
      D.wait[session] = (D.wait[session] || 0) + 1;
      var el = document.querySelector('#sb-think-' + session + ' .sb-sec');
      if (el) el.textContent = D.wait[session] + 's';
    }, 1000);
  }
  function stopWait(session) {
    if (WAIT_TIMERS[session]) { clearInterval(WAIT_TIMERS[session]); WAIT_TIMERS[session] = null; }
  }

  function register() {
    var email = (document.getElementById('sb-email') || {}).value || '';
    var pass = (document.getElementById('sb-pass') || {}).value || '';
    D.ui.reg = { email: email, password: pass };
    if (!email || !pass) { toast(dz('邮箱和密码都要填', 'Email and password required')); return; }
    post('/api/demo/register', { email: email, password: pass }).then(function (r) {
      var b = (r && r.ok && r.body) || {};
      if (!b.ok) { toast(b.message || b.error || '注册失败'); return; }
      D.chat = { A: [], B: [] };
      D.done = {};
      D.chapter = 0;
      D.turns = [];
      D.mine = true;
      try { sessionStorage.setItem('mn-demo-account', b.account.email); } catch (e) {}
      toast(dz('注册成功，记忆库从 0 条开始', 'Registered — memory starts at zero'));
      refreshState();
    });
  }

  function runStep() {
    if (D.busy.flow) return;
    var c = CHAPTERS[D.chapter];
    var q = document.getElementById('dm-q');
    if (q) D.ui.q = q.value.trim();
    var t = document.getElementById('dm-target');
    if (t) D.ui.target = t.value;
    var f = document.getElementById('dm-fix');
    if (f) D.ui.fix = f.value.trim();

    D.busy.flow = true;
    paintRight();
    var t0 = Date.now();
    Promise.resolve().then(function () { return c.run(); })
      .then(function (res) {
        res = res || { ok: false, title: '没有返回' };
        if (!res.ms) res.ms = Date.now() - t0;
        D.done[c.id] = res;
      })
      .catch(function (e) {
        D.done[c.id] = { ok: false, title: '执行出错', ms: Date.now() - t0,
                         lines: [['错误', String(e && e.message || e).slice(0, 160)]] };
      })
      .then(function () {
        D.busy.flow = false;
        paintRight();
        refreshState();
      });
  }

  /* 「在我电脑上真接一次」：现场给这个沙盒账号签一把密钥，
     给出一条带密钥的安装命令。客户在自己电脑上跑完，他的 Agent 就真的接上了 ——
     之后他写的东西会出现在这个演示库和右侧「记忆流水」里。 */
  function showDemoKey(btn) {
    btn.disabled = true;
    btn.textContent = dz('正在生成…', 'Generating…');
    post('/api/demo/key', {}).then(function (r) {
      btn.disabled = false;
      btn.textContent = dz('在我电脑上真接一次', 'Connect from my machine');
      var b = (r && r.ok && r.body) || {};
      var host = document.getElementById('dm-key');
      if (!host) {
        var res = document.querySelector('.dm-result');
        if (!res) return;
        host = document.createElement('div');
        host.id = 'dm-key';
        res.appendChild(host);
      }
      if (!b.ok) {
        host.innerHTML = '<div class="dm-note">' + esc(b.message || b.error || '生成失败') + '</div>';
        return;
      }
      /* 三套 shell 各给一条：PowerShell 5.1 不认 `&&`、也不认 %TEMP%，
         2026-10-21 客户直接粘进 PowerShell 报 ParserError。 */
      var h = host();
      var C = (h && h.shellCmds) ? h.shellCmds(b.installer) : {
        ps: 'curl.exe -fsSL "' + b.installer + '" -o "$env:TEMP\\mnemo-setup.py"; python "$env:TEMP\\mnemo-setup.py"',
        cmd: 'curl -fsSL "' + b.installer + '" -o "%TEMP%\\mnemo-setup.py" && python "%TEMP%\\mnemo-setup.py"',
        nix: 'curl -fsSL "' + b.installer + '" -o /tmp/mnemo-setup.py && python3 /tmp/mnemo-setup.py'
      };
      host.innerHTML =
        '<div class="dm-note" style="margin-top:10px">' + esc(dz(
          '这条命令带的是这个演示账号的密钥（' + b.account + '）。跑完你的 Agent 就接上了，' +
          '它写的东西会出现在这个演示库和右侧「记忆流水」里。',
          'This command carries this demo account key. Once it runs, your agent is connected — ' +
          'whatever it writes shows up in this demo store and in the memory log.')) + '</div>' +
        '<div class="mc-lab" style="margin-top:8px">Windows · PowerShell（推荐）</div>' +
        '<div class="mc-code">' + esc(C.ps) + '<span class="cp" data-copy="' + esc(C.ps) + '">' +
          esc(dz('复制', 'Copy')) + '</span></div>' +
        '<div class="mc-lab" style="margin-top:8px">Windows · 命令提示符（CMD）</div>' +
        '<div class="mc-code">' + esc(C.cmd) + '<span class="cp" data-copy="' + esc(C.cmd) + '">' +
          esc(dz('复制', 'Copy')) + '</span></div>' +
        '<div class="mc-lab" style="margin-top:8px">macOS / Linux</div>' +
        '<div class="mc-code">' + esc(C.nix) + '<span class="cp" data-copy="' + esc(C.nix) + '">' +
          esc(dz('复制', 'Copy')) + '</span></div>' +
        '<div class="mc-lab" style="margin-top:8px">' + esc(dz('手动填这两行也行', 'Or fill these two')) + '</div>' +
        '<div class="mc-code">URL: ' + esc(b.mcp_url) + '<br>Authorization: Bearer ' + esc(b.key) + '</div>';
      icons();
      /* 结果卡很高，密钥块插在末尾时用户看不见 —— 主动滚过去，
         否则他点完按钮会觉得"什么都没发生"。 */
      try { host.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); } catch (e) {}
    });
  }

  function goto(page) {
    var h = host();
    var acc = account();
    if (h.setView && acc) h.setView(acc.email, acc.namespace);
    if (h.go) h.go(page);
  }

  /* ------------------------------------------------------------------ 事件 */

  document.addEventListener('click', function (e) {
    var t = e.target;
    if (!t || !t.closest) return;

    var ch = t.closest('[data-ch]');
    if (ch) { D.chapter = parseInt(ch.getAttribute('data-ch'), 10) || 0; paintRight(); return; }

    var rt = t.closest('[data-rtab]');
    if (rt) { D.rightTab = rt.getAttribute('data-rtab') || 'flow'; paintRight(); return; }

    var el = t.closest('[data-dm]');
    if (!el) return;
    var act = el.getAttribute('data-dm');

    if (act === 'send') { send(el.getAttribute('data-s')); return; }
    if (act === 'register') { register(); return; }
    if (act === 'fill') {
      var n = Math.floor(Math.random() * 9000) + 1000;
      var em = document.getElementById('sb-email');
      var pw = document.getElementById('sb-pass');
      if (em) em.value = 'guest' + n + '@demo.local';
      if (pw) pw.value = 'Demo' + n + 'pass';
      D.ui.reg = { email: em.value, password: pw.value };
      return;
    }
    if (act === 'run') { runStep(); return; }
    if (act === 'next') { if (D.chapter < CHAPTERS.length - 1) { D.chapter++; paintRight(); } return; }
    if (act === 'prev') { if (D.chapter > 0) { D.chapter--; paintRight(); } return; }
    if (act === 'goto') { goto(el.getAttribute('data-to')); return; }
    if (act === 'demo-key') { showDemoKey(el); return; }
    if (act === 'full') {
      D.full = !D.full;
      var box = document.querySelector('.dm2');
      if (box) box.classList.toggle('full', D.full);
      document.body.classList.toggle('dm-full', D.full);
      paintRight();
      return;
    }
    if (act === 'exit') {
      document.body.classList.remove('dm-full');
      D.full = false;
      var h = host();
      if (h.go) h.go('overview');
      return;
    }
    if (act === 'reset') {
      if (!window.confirm(dz('清空沙盒（删掉演示注册的账号与它们的记忆）？真实用户不受影响。',
                             'Clear the sandbox? Real users are untouched.'))) return;
      post('/api/demo/reset', {}).then(function () {
        D.chat = { A: [], B: [] };
        D.done = {}; D.chapter = 0;
        D.ui = { q: '', fix: '', target: '', reg: { email: '', password: '' } };
        D.turns = [];
        D.mine = false;
        try { sessionStorage.removeItem('mn-demo-account'); } catch (e) {}
        toast(dz('沙盒已重置', 'Sandbox reset'));
        refreshState();
      });
      return;
    }
  });

  document.addEventListener('keydown', function (e) {
    var t = e.target;
    if (t && t.id && t.id.indexOf('sb-ta-') === 0) {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        send(t.id.slice(-1));
      }
      return;
    }
    if (!document.querySelector('.dm2')) return;
    if (t && /INPUT|TEXTAREA|SELECT/.test(t.tagName)) return;
    if (e.key === 'ArrowRight' && D.chapter < CHAPTERS.length - 1) { D.chapter++; paintRight(); }
    if (e.key === 'ArrowLeft' && D.chapter > 0) { D.chapter--; paintRight(); }
  });

  document.addEventListener('input', function (e) {
    var t = e.target;
    if (!t || !t.id) return;
    if (t.id === 'sb-email') D.ui.reg.email = t.value;
    if (t.id === 'sb-pass') D.ui.reg.password = t.value;
  });

  /* --------------------------------------------------------------- 入口 */

  function render(el) {
    el.innerHTML = shell();
    icons();
    paint();
    refreshState();
  }

  window.MCDemo = { render: render, D: D, chapters: CHAPTERS };
})();

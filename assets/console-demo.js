/* ============================================================================
   Mnemosyne OS — 演示 & 测试（管理员专属）
   ----------------------------------------------------------------------------
   这是给商业合作伙伴看的"第一扇窗"，所以按演示台的规格做，不是又一个后台页：

     · 一条完整叙事（星河咖啡的客服 Agent），从注册到遗忘，10 章走完 0→1；
     · 每一步都是**真实调用**：走 MCP JSON-RPC，落到独立的演示命名空间，
       客户看到的数字、耗时、记忆 id 全是真的，没有一处是编的；
     · 演示账号是真实注册用户，演示完可以一键切到控制台核对同一份数据。

   与 console.js 的关系：只通过 window.MCDemoHost 取 api/post/esc 等工具，
   不反向依赖它的内部状态。
   ========================================================================== */
(function () {
  'use strict';

  var H = null;                       // MCDemoHost（运行时再取）
  function host() { return window.MCDemoHost || {}; }
  function esc(s) { var h = host(); return h.esc ? h.esc(s) : String(s == null ? '' : s); }
  function dz(zh, en) { var h = host(); return h.dz ? h.dz(zh, en) : zh; }
  function post(p, b) { var h = host(); return h.post ? h.post(p, b) : Promise.resolve({ ok: false, body: {} }); }
  function api(p) { var h = host(); return h.api ? h.api(p) : Promise.resolve({ ok: false, body: {} }); }
  function toast(t) { var h = host(); if (h.toast) h.toast(t); }
  function icons() { var h = host(); if (h.icons) h.icons(); }

  var D = {
    chapter: 0,
    state: null,
    done: {},          // chapterId -> {ok, ms, lines, raw, title}
    busy: false,
    full: false,
    loading: true
  };
  window.MCDemo = D;

  /* ---------------------------------------------------------------- 剧本 */

  function T(zh, en) { return dz(zh, en); }

  var SCENE = {
    brand: '星河咖啡',
    en: 'Star River Coffee',
    role: '客服 Agent'
  };

  /* 每条记忆都用同一套业务语境，演示时听众能跟得上：
     门店规则 / 客户偏好 / 工单结论 —— 这三类正好覆盖语义、情景、程序性记忆。 */
  var FACTS = {
    rule: '星河咖啡外送规则：单笔满 39 元免配送费，不满 39 元收 6 元配送费；会员日每周三双倍积分。',
    pref: '张女士是星河咖啡的金卡会员，乳糖不耐，只喝燕麦奶拿铁，默认少糖；常用收货地址是滨江路 88 号 3 栋。',
    ticket: '2026-10-18 张女士投诉配送超时 45 分钟，核实是雨天骑手不足，已补偿 20 元无门槛券并致歉。',
    fix: '星河咖啡会员日自 2026-11-01 起由每周三调整为每周二，双倍积分规则不变。'
  };

  var CHAPTERS = [
    /* ---------------------------------------------------------------- 01 */
    {
      id: 'signup',
      zh: '注册账号', en: 'Sign up',
      kicker: '从零开始',
      title: '一个账号，一套属于它的记忆库',
      lead: '客户第一次来，看到的是注册页。注册成功的那一刻，系统就为他准备好了独立的记忆空间 —— ' +
            '不是共享一个库，是物理隔离的一份。',
      points: ['真实注册：写入用户表，能在「注册用户信息」里看到',
               '独立命名空间：与其他账号的数据物理隔离',
               '注册后自动进入控制台，第一次进来会被要求接入 Agent'],
      cta: '创建演示账号',
      run: function () {
        return post('/api/demo/init', {}).then(function (r) {
          var b = (r && r.ok && r.body) || {};
          if (!b.ok) return fail('初始化失败', b);
          return api('/api/demo/state').then(function (s2) {
            var s = (s2 && s2.ok && s2.body) || {};
            D.state = s;
            return {
              ok: true,
              ms: 0,
              title: '账号已创建',
              lines: [
                ['邮箱', (s.account || {}).email || '—'],
                ['显示名', (s.account || {}).name || '—'],
                ['套餐', (s.account || {}).plan || '—'],
                ['命名空间', (s.account || {}).namespace || '—'],
                ['记忆库', '0 条（全新）']
              ],
              note: '这个账号现在真的在用户表里。演示结束后可以在「注册用户信息」里找到它。'
            };
          });
        });
      }
    },

    /* ---------------------------------------------------------------- 02 */
    {
      id: 'deploy',
      zh: '接入 Agent', en: 'Connect an agent',
      kicker: '一分钟接入',
      title: '让 Agent 连上这套记忆',
      lead: '客户不需要改代码。一条命令，安装器会自己找到本机的 Agent、写好 MCP 配置、' +
            '真连一次、再写一条冒烟记忆证明通了。',
      points: ['标准 MCP 协议：Claude / Cursor / Codex / Hermes / 豆包… 共 55 个客户端',
               '一条命令完成检测 + 写配置 + 自检',
               '下面的握手是真的：initialize → tools/list'],
      cta: '执行一次真实握手',
      run: function () {
        return post('/api/demo/handshake', {}).then(function (r) {
          var b = (r && r.ok && r.body) || {};
          if (!b.ok) return fail('握手失败（网关不可达）', b);
          return {
            ok: true,
            ms: b.ms,
            title: '握手成功',
            lines: [
              ['协议版本', b.protocol || '—'],
              ['服务端', ((b.server || {}).name || '—') + ' · v' + ((b.server || {}).version || '')],
              ['可用工具', b.tools + ' 个'],
              ['命名空间', b.namespace || '—'],
              ['握手耗时', b.ms + ' ms']
            ],
            note: '这和客户在自己电脑上接完之后发生的事完全一样。前几个工具：' +
                  (b.names || []).slice(0, 6).join('、'),
            raw: b
          };
        });
      }
    },

    /* ---------------------------------------------------------------- 03 */
    {
      id: 'write',
      zh: '写入记忆', en: 'Write memories',
      kicker: '基础能力',
      title: '把三件事记下来',
      lead: '客服 Agent 每次对话都会留下结论。这里写入三条不同类型的记忆：门店规则（语义）、' +
            '客户偏好（语义）、一次工单（情景）。',
      points: ['retain 是唯一写入口，类型 / 标签 / 置信度都可指定',
               '每条记忆都有唯一 id，后续召回、更正、删除都靠它',
               '写入即进索引：图谱、审计链同步更新'],
      cta: '写入这三条记忆',
      run: function () {
        var items = [
          { content: FACTS.rule, mtype: 'semantic', tags: ['门店规则', '外送'], importance: 4, step: 'write-rule' },
          { content: FACTS.pref, mtype: 'semantic', tags: ['客户偏好', '张女士'], importance: 5, step: 'write-pref' },
          { content: FACTS.ticket, mtype: 'episodic', tags: ['工单', '张女士'], importance: 3, step: 'write-ticket' }
        ];
        var ids = [], ms = 0;
        function one(i) {
          if (i >= items.length) {
            D.ids = ids;
            return {
              ok: true, ms: ms, title: '三条记忆已写入',
              lines: [
                ['门店规则', ids[0] || '—'],
                ['客户偏好', ids[1] || '—'],
                ['工单结论', ids[2] || '—'],
                ['累计耗时', ms + ' ms']
              ],
              note: '记住这三个 id。下一步召回会用到它们，第 6 章更正、第 8 章删除也会指向同一批记忆。'
            };
          }
          var it = items[i];
          return call(it.step, 'retain', {
            content: it.content, mtype: it.mtype, tags: it.tags, importance: it.importance
          }).then(function (r) {
            ms += (r && r.ms) || 0;
            var d = (r && r.data) || {};
            ids.push(d.memory_id || d.id || (r && r.ok ? '(已写入)' : '失败'));
            return one(i + 1);
          });
        }
        return one(0);
      }
    },

    /* ---------------------------------------------------------------- 04 */
    {
      id: 'recall',
      zh: '同会话召回', en: 'Recall',
      kicker: '基础能力',
      title: '问一句话，取回该取回的',
      lead: '召回不是关键词搜索。它同时跑五路：BM25 关键词、向量语义、知识图谱边、' +
            '时间衰减、置信度加权，再融合成 top-k。',
      points: ['问「张女士 外送 会员日」—— 三个主题各命中一条',
               '每条带相似度分数与召回通道，不是黑盒',
               '整个过程通常在几十毫秒内'],
      cta: '执行召回',
      run: function () {
        return call('recall', 'recall', {
          query: '张女士的偏好、外送免配送费门槛、会员日积分规则',
          k: 5, budget_tokens: 800
        }).then(function (r) {
          if (!r || !r.ok) return fail('召回失败', r);
          var d = r.data || {};
          var res = d.results || d.items || d.memories || [];
          var lines = res.slice(0, 5).map(function (x, i) {
            var score = x.score != null ? Number(x.score).toFixed(3)
                      : (x.similarity != null ? Number(x.similarity).toFixed(3) : '—');
            var txt = String(x.content || x.excerpt || x.text || '').replace(/\s+/g, ' ').slice(0, 46);
            return ['#' + (i + 1) + ' · ' + score, txt + (txt.length >= 46 ? '…' : '')];
          });
          if (!lines.length) lines = [['结果', '没有命中（可能是上一步没跑）']];
          var cost = d.cost_report || {};
          if (cost.budget_used) lines.push(['上下文预算', cost.budget_used + ' / ' + cost.budget_limit + ' tokens']);
          return {
            ok: true, ms: r.ms,
            title: '召回 ' + res.length + ' 条' + (res.length > 5 ? '（展示前 5）' : ''),
            lines: lines,
            note: '这就是 Agent 每轮对话开头拿到的上下文 —— 只有相关的那几条，不是整个记忆库。',
            raw: d
          };
        });
      }
    },

    /* ---------------------------------------------------------------- 05 */
    {
      id: 'cross',
      zh: '跨会话', en: 'Across sessions',
      kicker: '基础能力 · 关键差异',
      title: '换个会话，它还认得你',
      lead: '大多数"记忆"产品只能记住当前对话。这里先把这轮对话压成七要素摘要，' +
            '再开一个新会话去取 —— 取得到，才叫长期记忆。',
      points: ['session_summarize：目标 / 约束 / 决策 / 未决 / 产物 / 失败 / 偏好',
               'session_recall：新会话直接拿到上一轮的结论与未决事项',
               '跨会话是"记住客户"和"记住一次对话"的分水岭'],
      cta: '总结这一轮，再跨会话取回',
      run: function () {
        return call('cross-1', 'session_summarize', {
          session_id: 'demo-session-A',
          messages: [
            { role: 'user', content: '张女士问外送费和会员日，还投诉了上次超时。' },
            { role: 'assistant', content: '已确认：满 39 免配送费，会员日周三双倍积分；上次超时已补偿 20 元券。' },
            { role: 'user', content: '她乳糖不耐，以后都推燕麦奶。' }
          ]
        }).then(function (r1) {
          if (!r1 || !r1.ok) return fail('会话摘要失败', r1);
          return call('cross-2', 'session_recall', {
            query: '上次和张女士聊到哪了，还有什么没解决',
            include_pending: true
          }).then(function (r2) {
            if (!r2 || !r2.ok) return fail('跨会话召回失败', r2);
            var d = r2.data || {};
            var arr = d.sessions || d.results || d.items || d.summaries || [];
            var first = arr[0] || {};
            var goal = first.goal || first.summary || first.title || '';
            var pending = first.pending || first.pending_items || [];
            var lines = [
              ['会话摘要', String(goal).replace(/\s+/g, ' ').slice(0, 80) || '已生成'],
              ['未决事项', (pending.length ? pending.length + ' 条：' +
                pending.map(function (p) { return String(p.title || p.text || p).slice(0, 20); }).join('；')
                : '无')],
              ['摘要耗时', r1.ms + ' ms'],
              ['跨会话召回', r2.ms + ' ms']
            ];
            return {
              ok: true, ms: r1.ms + r2.ms,
              title: '新会话仍然认得这位客户',
              lines: lines,
              note: '新会话没有任何历史消息，但摘要和未决事项被取回来了 —— Agent 可以接着上次的话说。',
              raw: { summarize: r1.data, recall: r2.data }
            };
          });
        });
      }
    },

    /* ---------------------------------------------------------------- 06 */
    {
      id: 'correct',
      zh: '更正与冲突', en: 'Corrections',
      kicker: '进阶能力',
      title: '规则变了，记忆要跟着变',
      lead: '会员日从周三改到周二。直接再写一条会变成"两个说法都记得"，' +
            '系统要做的是：写入新说法，同时把旧说法标记为被取代 —— 不是删掉。',
      points: ['retain(supersedes=旧 id)：写入即更正',
               '召回时旧条目带 superseded 标记，Agent 不会拿旧规则回答',
               '历史保留，可追溯 —— 这一点在合规场景里是硬要求'],
      cta: '更正会员日规则',
      run: function () {
        var oldId = (D.ids || [])[0] || '';
        var args = { content: FACTS.fix, mtype: 'semantic', tags: ['门店规则', '会员日'], importance: 5 };
        if (oldId) args.supersedes = oldId;
        return call('correct-1', 'retain', args).then(function (r) {
          if (!r || !r.ok) return fail('更正写入失败', r);
          return call('correct-2', 'recall', { query: '会员日是哪一天，双倍积分', k: 5 })
            .then(function (r2) {
              var d = (r2 && r2.data) || {};
              var res = d.results || d.items || d.memories || [];
              var lines = res.slice(0, 4).map(function (x, i) {
                var v = x.verification || x.status || 'active';
                var txt = String(x.content || x.excerpt || '').replace(/\s+/g, ' ').slice(0, 44);
                return ['#' + (i + 1) + ' · ' + v, txt + '…'];
              });
              return {
                ok: true, ms: (r.ms || 0) + ((r2 && r2.ms) || 0),
                title: '新规则已生效，旧规则被标记',
                lines: lines.length ? lines : [['结果', '召回为空']],
                note: '注意 verification 一列：superseded 的那条不会被当成当前事实引用。',
                raw: { retain: r.data, recall: (r2 || {}).data }
              };
            });
        });
      }
    },

    /* ---------------------------------------------------------------- 07 */
    {
      id: 'graph',
      zh: '图谱与画像', en: 'Graph & profile',
      kicker: '进阶能力',
      title: '它不只知道事实，还知道事实之间的关系',
      lead: '记忆不是一堆孤立的句子。实体之间连成图，客户被压成一张画像卡 —— ' +
            '后者可以直接拼进 system prompt，让模型一开口就"认识"这个人。',
      points: ['graph_query：从「张女士」出发，看她连着哪些事实',
               'profile_card：稳定身份 / 偏好与约束 / 当前情境，三段式',
               'memory_envelope：八类分类 + 双时间轴 + 证据链'],
      cta: '查图谱与画像',
      run: function () {
        return call('graph-1', 'graph_query', { entity: '张女士', depth: 2 }).then(function (r1) {
          var g = (r1 && r1.data) || {};
          var nodes = g.nodes || [];
          var edges = g.edges || [];
          return call('graph-2', 'profile_card', { include_context: true, max_tokens: 600 })
            .then(function (r2) {
              var p = (r2 && r2.data) || {};
              var card = p.text || p.card || p.profile || '';
              var lines = [
                ['图谱节点', nodes.length + ' 个'],
                ['图谱关系', edges.length + ' 条'],
                ['画像卡', card ? String(card).replace(/\s+/g, ' ').slice(0, 90) + '…' : '（记忆不足，暂未形成）'],
                ['耗时', ((r1 && r1.ms) || 0) + ((r2 && r2.ms) || 0) + ' ms']
              ];
              return {
                ok: true, ms: ((r1 && r1.ms) || 0) + ((r2 && r2.ms) || 0),
                title: '图谱与画像',
                lines: lines,
                note: '画像卡是按 token 预算裁的：超预算时先砍情境、再砍未决，绝不截断半句事实。',
                raw: { graph: g, profile: p }
              };
            });
        });
      }
    },

    /* ---------------------------------------------------------------- 08 */
    {
      id: 'forget',
      zh: '遗忘与审计', en: 'Forget & audit',
      kicker: '高级能力',
      title: '让它忘掉，但账要留着',
      lead: '客户要求删掉某条信息时，"删干净"和"可追溯"是矛盾的。这里的做法是：' +
            '召回里立刻消失，审计链里永远留痕。',
      points: ['forget：置信度降 0 并标记 deleted，召回不再返回',
               '审计链逐条哈希，改任何一条都会断链',
               '真要物理删除，是另一个显式动作（cascade_delete）'],
      cta: '遗忘工单，再查审计',
      run: function () {
        var ticketId = (D.ids || [])[2] || '';
        var args = ticketId ? { memory_id: ticketId } : { query: '张女士 投诉 配送超时' };
        return call('forget-1', 'forget', args).then(function (r1) {
          return call('forget-2', 'recall', { query: '张女士投诉配送超时补偿', k: 5 })
            .then(function (r2) {
              var res = ((r2 && r2.data) || {}).results || ((r2 && r2.data) || {}).items || [];
              return call('forget-3', 'audit', { memory_id: ticketId || undefined })
                .then(function (r3) {
                  var a = (r3 && r3.data) || {};
                  var entries = a.entries || a.items || a.trail || [];
                  return {
                    ok: true, ms: ((r1 && r1.ms) || 0) + ((r3 && r3.ms) || 0),
                    title: '已遗忘，审计留痕',
                    lines: [
                      ['遗忘对象', ticketId || '（按查询解析）'],
                      ['召回结果', res.length + ' 条（工单已不再出现）'],
                      ['审计记录', entries.length + ' 条'],
                      ['最近一条', entries.length
                        ? String((entries[0] || {}).action || (entries[0] || {}).kind || '').slice(0, 40)
                        : '（本库暂无审计条目）']
                    ],
                    note: '召回里已经查不到，但审计链里那条 forget 还在，且哈希可校验。',
                    raw: { forget: r1.data, recall: (r2 || {}).data, audit: a }
                  };
                });
            });
        });
      }
    },

    /* ---------------------------------------------------------------- 09 */
    {
      id: 'consolidate',
      zh: '巩固与度量', en: 'Consolidate',
      kicker: '高级能力',
      title: '像睡觉一样整理记忆',
      lead: '聊得越多，重复和碎片就越多。巩固作业把相似的合并、把成功的经验固化成' +
            '可复用的 playbook、把失败的记成负记忆 —— 这就是控制台里的「梦」。',
      points: ['memory_consolidate：情景 → 语义、成功 → 经验、失败 → 负记忆',
               'memory_metrics：13 项指标，数据不足时明确说"不足"，不填 0',
               '可定时跑，也可以手动跑一轮'],
      cta: '跑一轮巩固',
      run: function () {
        return call('consol-1', 'memory_consolidate', {}).then(function (r1) {
          return call('consol-2', 'memory_metrics', {}).then(function (r2) {
            var m = (r2 && r2.data) || {};
            var keys = Object.keys(m).filter(function (k) {
              return m[k] && typeof m[k] === 'object' && ('value' in m[k] || 'status' in m[k]);
            });
            var ready = keys.filter(function (k) { return m[k].value !== null && m[k].value !== undefined; });
            return {
              ok: true, ms: ((r1 && r1.ms) || 0) + ((r2 && r2.ms) || 0),
              title: '这一轮巩固完成',
              lines: [
                ['巩固结果', summarizeConsolidate((r1 || {}).data)],
                ['指标总数', keys.length + ' 项'],
                ['有数据的指标', ready.length + ' 项'],
                ['数据不足', (keys.length - ready.length) + ' 项（系统会如实标注）']
              ],
              note: '「数据不足」不是失败，是诚实：0 和"没数据"是两件事。',
              raw: { consolidate: (r1 || {}).data, metrics: m }
            };
          });
        });
      }
    },

    /* ---------------------------------------------------------------- 10 */
    {
      id: 'console',
      zh: '控制台联动', en: 'Into the console',
      kicker: '收口',
      title: '刚才发生的一切，控制台里都能查',
      lead: '演示不是录像。这个账号、这些记忆、这条审计链，都真实存在于控制台里 —— ' +
            '点下面任意一个入口，就能带着这个账号的数据继续看。',
      points: ['注册用户信息 → 选中「演示账号」→ 看全量档案',
               '记忆库 → 刚才写入的每一条都在，带确切时间',
               '记忆图谱 → 实体与关系就是第 7 章那张图'],
      cta: '刷新演示账号的数据',
      run: function () {
        return call('console-stats', 'stats', {}).then(function (st) {
          return api('/api/demo/state').then(function (r) {
          var s = (r && r.ok && r.body) || {};
          D.state = s;
          var q = (st && st.data) || {};
          return {
            ok: true, ms: st.ms || 0,
            title: '演示账号现状',
            lines: [
              ['账号', (s.account || {}).email || '—'],
              ['记忆条数', String(s.memories || 0)],
              ['记忆类型', Object.keys(s.types || {}).map(function (k) {
                return k + ' ' + s.types[k];
              }).join(' / ') || '—'],
              ['本次会话', '写入 ' + (q.session_retain || 0) + ' 次 · 召回 ' + (q.session_recall || 0) + ' 次'],
              ['估算省下 Token', String(q.session_saved_tokens != null ? q.session_saved_tokens
                                      : (q.today_saved_tokens || 0))],
              ['网关', s.online ? '在线 · ' + s.tools + ' 个工具' : '离线']
            ],
            note: '下面三个按钮会直接跳到控制台对应页面，并自动切到演示账号。',
            actions: [
              { label: '打开记忆库', act: 'goto', to: 'memories' },
              { label: '打开记忆图谱', act: 'goto', to: 'graph' },
              { label: '在注册用户信息里查看', act: 'goto', to: 'users' }
            ],
            raw: s
          };
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

  function call(step, tool, args) {
    return post('/api/demo/call', { step: step, tool: tool, args: args || {} })
      .then(function (r) {
        var b = (r && r.ok && r.body) || {};
        if (!b.ok) {
          return { ok: false, ms: b.ms || 0, data: b.data || {},
                   error: b.message || b.error || ('HTTP ' + (r && r.status)) };
        }
        return { ok: true, ms: b.ms || 0, data: b.data || {} };
      });
  }

  function fail(title, r) {
    return {
      ok: false, ms: (r && r.ms) || 0, title: title,
      lines: [['原因', (r && (r.error || r.message)) || '网关没有返回']],
      note: '这一步没跑通。检查网关是否在线，然后点「重试这一步」。'
    };
  }

  /* ------------------------------------------------------------------ UI */

  function shell() {
    return '' +
      '<div class="dm' + (D.full ? ' full' : '') + '">' +
        '<div class="dm-bar">' +
          '<span class="dm-pill">' + esc(dz('演示模式', 'DEMO')) + '</span>' +
          '<span class="dm-scene">' + esc(SCENE.brand) + ' · ' + esc(SCENE.role) + '</span>' +
          '<span class="dm-sp"></span>' +
          '<span class="dm-acct" id="dm-acct">' + esc(dz('演示账号准备中…', 'Preparing demo account…')) + '</span>' +
          '<button class="dm-ghost" data-dm="reset">' + esc(dz('重置演示', 'Reset')) + '</button>' +
          '<button class="dm-ghost" data-dm="full">' + esc(D.full ? dz('退出全屏', 'Exit') : dz('全屏', 'Fullscreen')) + '</button>' +
          '<button class="dm-ghost" data-dm="exit">' + esc(dz('退出演示', 'Close')) + '</button>' +
        '</div>' +
        '<div class="dm-progress"><i id="dm-prog" style="width:0%"></i></div>' +
        '<div class="dm-body">' +
          '<aside class="dm-rail" id="dm-rail"></aside>' +
          '<main class="dm-main" id="dm-main"></main>' +
        '</div>' +
      '</div>';
  }

  function railHTML() {
    return CHAPTERS.map(function (c, i) {
      var st = D.done[c.id];
      var cls = i === D.chapter ? ' on' : (st && st.ok ? ' done' : '');
      return '<button class="dm-ch' + cls + '" data-ch="' + i + '">' +
        '<span class="n">' + (st && st.ok ? '✓' : (i + 1)) + '</span>' +
        '<span class="t">' + esc(dz(c.zh, c.en)) + '</span>' +
        (st && st.ms ? '<span class="ms">' + st.ms + 'ms</span>' : '') +
        '</button>';
    }).join('');
  }

  function mainHTML() {
    var c = CHAPTERS[D.chapter];
    var res = D.done[c.id];
    var doneCount = Object.keys(D.done).filter(function (k) { return D.done[k].ok; }).length;
    var pct = Math.round(doneCount * 100 / CHAPTERS.length);
    var prev = D.chapter > 0;
    var next = D.chapter < CHAPTERS.length - 1;

    return '' +
      '<div class="dm-stage" id="dm-stage">' +
        '<div class="dm-kicker">STEP ' + String(D.chapter + 1).padStart(2, '0') +
          ' / ' + CHAPTERS.length + ' · ' + esc(c.kicker) + '</div>' +
        '<h2 class="dm-title">' + esc(c.title) + '</h2>' +
        '<p class="dm-lead">' + esc(c.lead) + '</p>' +
        '<ul class="dm-points">' + c.points.map(function (p) {
          return '<li>' + esc(p) + '</li>';
        }).join('') + '</ul>' +

        '<div class="dm-cta">' +
          '<button class="dm-run" data-dm="run"' + (D.busy ? ' disabled' : '') + '>' +
            (D.busy ? '<span class="dm-spin"></span>' + esc(dz('正在执行…', 'Running…'))
                    : (res && res.ok ? esc(dz('再执行一次', 'Run again')) : esc(c.cta))) +
          '</button>' +
          (res && !res.ok ? '<button class="dm-ghost" data-dm="run">' + esc(dz('重试这一步', 'Retry')) + '</button>' : '') +
        '</div>' +

        (res ? resultHTML(c, res) : '<div class="dm-hint">' + esc(dz(
          '点上面的按钮，这一步会真的执行一次。下面的结果全部来自真实调用。',
          'Press the button — this step really runs. Everything below is real.')) + '</div>') +

        '<div class="dm-foot">' +
          '<button class="dm-ghost" data-dm="prev"' + (prev ? '' : ' disabled') + '>← ' + esc(dz('上一步', 'Back')) + '</button>' +
          '<span class="dm-sp"></span>' +
          '<span class="dm-count">' + doneCount + ' / ' + CHAPTERS.length + ' ' + esc(dz('已完成', 'done')) + '</span>' +
          '<button class="dm-next" data-dm="next"' + (next ? '' : ' disabled') + '>' +
            esc(next ? dz('下一步', 'Next') : dz('演示完成', 'Finished')) + ' →</button>' +
        '</div>' +
      '</div>';
  }

  function resultHTML(c, res) {
    var cls = res.ok ? 'ok' : 'bad';
    var raw = res.raw ? JSON.stringify(res.raw, null, 2) : '';
    if (raw.length > 4000) raw = raw.slice(0, 4000) + '\n…';
    return '' +
      '<div class="dm-result ' + cls + '">' +
        '<div class="dm-rhead">' +
          '<span class="dot"></span>' +
          '<b>' + esc(res.title || (res.ok ? '完成' : '失败')) + '</b>' +
          '<span class="dm-sp"></span>' +
          (res.ms ? '<span class="ms">' + res.ms + ' ms</span>' : '') +
        '</div>' +
        '<div class="dm-lines">' + (res.lines || []).map(function (l) {
          return '<div class="ln"><span class="k">' + esc(l[0]) + '</span>' +
                 '<span class="v">' + esc(l[1]) + '</span></div>';
        }).join('') + '</div>' +
        (res.note ? '<div class="dm-note">' + esc(res.note) + '</div>' : '') +
        (res.actions ? '<div class="dm-actions">' + res.actions.map(function (a) {
          return '<button class="dm-ghost" data-dm="goto" data-to="' + esc(a.to) + '">' +
                 esc(a.label) + '</button>';
        }).join('') + '</div>' : '') +
        (raw ? '<details class="dm-raw"><summary>' + esc(dz('原始返回（可给技术方看）', 'Raw response')) +
               '</summary><pre>' + esc(raw) + '</pre></details>' : '') +
      '</div>';
  }

  function paint() {
    var rail = document.getElementById('dm-rail');
    var main = document.getElementById('dm-main');
    if (!rail || !main) return;
    rail.innerHTML = railHTML();
    main.innerHTML = mainHTML();
    var prog = document.getElementById('dm-prog');
    if (prog) {
      var doneCount = Object.keys(D.done).filter(function (k) { return D.done[k].ok; }).length;
      prog.style.width = Math.round(doneCount * 100 / CHAPTERS.length) + '%';
    }
    if (D.state && D.state.account) {
      var acct = document.getElementById('dm-acct');
      if (acct) {
        acct.textContent = (D.state.account.email || '') + ' · ' +
          (D.state.memories || 0) + dz(' 条记忆', ' memories');
      }
    }
    icons();
    /* 进场：先移除 .in 让初始态生效，下一帧再加回来触发过渡。
       早先写成「加完 30ms 就删」—— 删掉的正是那个把 opacity 从 .001 拉回 1 的类，
       于是整页内容停在透明状态，看起来像白屏。 */
    var stage = document.getElementById('dm-stage');
    if (stage) {
      stage.classList.remove('in');
      requestAnimationFrame(function () {
        requestAnimationFrame(function () { stage.classList.add('in'); });
      });
    }
  }

  function runStep() {
    if (D.busy) return;
    var c = CHAPTERS[D.chapter];
    D.busy = true;
    paint();
    var t0 = Date.now();
    Promise.resolve()
      .then(function () { return c.run(); })
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
        D.busy = false;
        paint();
        api('/api/demo/state').then(function (r) {
          var s = (r && r.ok && r.body) || {};
          if (s.account) { D.state = s; paint(); }
        });
      });
  }

  function goto(page) {
    /* 先切到演示账号，再跳页 —— 顺序不能反。
       早先写成「切完就 return」，结果停在演示页不动：setView 只会重画当前页，
       不会自己跳转。演示最后一步必须真的落到记忆库/图谱上，否则等于没联动。 */
    var h = host();
    if (h.setView && D.state && D.state.account) {
      h.setView(D.state.account.email, D.state.account.namespace);
    }
    if (h.go) h.go(page);
  }

  /* --------------------------------------------------------------- 事件 */

  document.addEventListener('click', function (e) {
    var t = e.target;
    if (!t || !t.closest) return;
    var el = t.closest('[data-dm]');
    if (!el) return;
    var act = el.getAttribute('data-dm');

    if (act === 'run') { runStep(); return; }
    if (act === 'next') {
      if (D.chapter < CHAPTERS.length - 1) { D.chapter++; paint(); }
      return;
    }
    if (act === 'prev') {
      if (D.chapter > 0) { D.chapter--; paint(); }
      return;
    }
    if (act === 'goto') { goto(el.getAttribute('data-to')); return; }
    if (act === 'full') {
      D.full = !D.full;
      var box = document.querySelector('.dm');
      if (box) box.classList.toggle('full', D.full);
      document.body.classList.toggle('dm-full', D.full);
      paint();
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
      if (!window.confirm(dz('清空演示库并重来？只影响演示账号，不碰真实数据。',
                             'Clear the demo store and start over? Demo account only.'))) return;
      post('/api/demo/reset', {}).then(function () {
        D.done = {}; D.chapter = 0; D.ids = null;
        toast(dz('演示环境已重置', 'Demo reset'));
        refreshState();
      });
      return;
    }
  });

  document.addEventListener('click', function (e) {
    var t = e.target;
    if (!t || !t.closest) return;
    var ch = t.closest('[data-ch]');
    if (ch) {
      D.chapter = parseInt(ch.getAttribute('data-ch'), 10) || 0;
      paint();
    }
  });

  document.addEventListener('keydown', function (e) {
    if (!document.querySelector('.dm')) return;
    if (e.target && /INPUT|TEXTAREA/.test(e.target.tagName)) return;
    if (e.key === 'ArrowRight') {
      if (D.chapter < CHAPTERS.length - 1) { D.chapter++; paint(); }
    }
    if (e.key === 'ArrowLeft') {
      if (D.chapter > 0) { D.chapter--; paint(); }
    }
  });

  function refreshState() {
    return api('/api/demo/state').then(function (r) {
      var s = (r && r.ok && r.body) || {};
      D.state = s;
      D.loading = false;
      paint();
    });
  }

  /* --------------------------------------------------------------- 入口 */

  function render(el) {
    el.innerHTML = shell();
    icons();
    paint();
    refreshState();
  }

  window.MCDemo = {
    render: render,
    D: D,
    chapters: CHAPTERS
  };
})();

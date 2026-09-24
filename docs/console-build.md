# 控制台（用户管理界面）建设与验证记录

时间：2026-09-22 12:00–13:00（北京时间）
状态：**已上线并通过真实域名验证**。文档站（8 个页面）为下一步，尚未开工。

---

## 一、做了什么

在官网内新增一个 **mem0 风格的全屏深色控制台**，路由挂在 `#/dashboard/<页面>`，共 **17 个页面**：

| 分组 | 页面 |
|---|---|
| — | 安装 Mnemosyne（含注册后首次进入的引导问卷）· 精选 |
| 代理 | API 密钥 · 副驾驶 |
| 数据 | 仪表板 · 请求 · 实体 · 回忆 · 梦 · 图谱 · 网络钩子 · 内容导出 |
| 账户 | 设置 · 使用情况和计费 |
| 其他 | 文档 · 内容 MCP · 更新日志 |

复刻了截图里的这些要素：左侧固定导航（分组标签 + NEW 徽标 + 底部「爱好计划使用情况」配额条）、
顶栏项目切换与升级按钮、Copilot 提示横幅、仪表板的「时间范围切换 + 四张 KPI 卡 + 记忆类别条 +
回忆深度 + 内容利用率 + 回忆得分」、API 密钥的加粗提示条与密钥表、副驾驶的居中提问框与四条建议、
梦的三张功能卡、设置页的左侧子导航与「危险区域」、计费的免费额度进度条与四张套餐卡。

**关键：所有数字都来自你本机的记忆网关，不是占位数据。**

| 面板指标 | 数据来源 |
|---|---|
| 记忆存储 204 / 今天 +43 | 网关 `/api/status` → `count` / `today_retain` |
| 回忆涌上心头 43 / 命中率 91% | `total_recall` / `total_hit_rate` |
| 已保存的令牌 266.4K | `saved_tokens`（写 39.6K、召回 55.3K、潜在 321.7K） |
| 最深的回忆 9 天前 | `/api/facets` → `days` 最早一天 |
| 记忆类别（6 类） | `/api/facets` → `kinds` 真实分类 |
| 内容利用率 %、回忆得分 | `llm_feed_pct`、命中率 |
| 回忆页的条目与标签 | `/api/memories`（204 条全量） |
| 实体页 | `/api/facets` 的 agents / models / skills / natures / kinds |
| 图谱（548 节点 / 1655 边） | `/api/graph` |

## 二、代码放在哪

- **前端**：`13_Web/index.html` 里新增第 10 节（样式，`.dx-*` 类名前缀）与第 11 节（脚本，`DX_NAV` / `renderDash` / `dxPage*`）。
  `renderPage()` 增加一个分支：路径以 `dashboard` 开头时进入控制台，并给 `<body>` 加 `dash` 类
  —— 这个类负责隐藏营销站的公告条、页头、页脚与首页（全屏应用）。
- **后端**：`13_Web/server.py` 新增 `DashMixin` 类与 `/api/dash/*` 系列接口，共 15 条路由。
  网关地址由环境变量 `MNEMOSYNE_GATEWAY`（默认 `http://127.0.0.1:8788`）控制，可选 `MNEMOSYNE_TOKEN`。

| 接口 | 作用 |
|---|---|
| `GET /api/dash/overview` | 仪表板全部聚合指标 |
| `GET /api/dash/memories` · `/memory/<id>` | 记忆列表与单条详情 |
| `GET /api/dash/facets` · `/entities` · `/graph` | 分布、实体、图谱 |
| `GET/POST /api/dash/keys` · `POST /keys/revoke` | API 密钥（明文只回一次，库里只存 sha256） |
| `GET/POST /api/dash/webhooks` · `POST /webhooks/delete` | 网络钩子 |
| `GET/POST /api/dash/settings` | 项目名/描述、梦的三个开关 |
| `GET /api/dash/requests` | 请求日志（`_send()` 挂钩记录，环形缓冲 300 条） |
| `GET /api/dash/export?format=json\|md` | 真实导出下载 |
| `POST /api/dash/copilot` | 副驾驶（本地检索式回答，见下） |
| `POST /api/dash/danger` | 危险区域（管理员 + 输入项目名；**明确拒绝执行**，见下） |

全部接口要求已登录会话（未登录一律 401），危险操作额外要求管理员身份。

## 三、验证（全部实测，非推断）

**后端冒烟（29 项全过）**：未登录 6 条路径全 401；登录后 10 条接口全 200；网关不可达时
`gateway.online=false` 且**不报 500**；密钥创建返回明文且列表不含明文；吊销生效；
非法 Webhook URL 400；危险操作需确认名且确认正确时**返回 refused 而不是删数据**；请求日志有真实状态码。

**本地真实浏览器（17 个页面全过、零控制台错误）**：用从线上抓下来的**真实网关响应快照**做本地镜像，
逐页断言渲染长度、侧边栏 17 项 / 4 分组、离开控制台后页头恢复。

**线上真实域名（`https://ai-memory.net`，17 个页面全过）**：临时会话 + 真实 Chrome 逐页检查，
`/api/dash/*` 共 25 次请求**全部 200**，浏览器控制台**零错误**，页头与公告条均已隐藏，
回忆页列出真实条目（示例首条：`lesson 8ecd96bd… 【教训・自建认证下"同一人多个身份"…】`）。
验证用的临时会话已删除。

## 四、必须说明的三处"没有假装"

1. **副驾驶不调用大模型。** 它在本机做检索与统计，回答里的每条结论都能追溯到具体记忆编号，
   界面上写明了这一点。真接大模型需要 API 密钥与出网，那是另一个决定。
2. **危险区域拒绝执行批量删除。** 网关只提供逐条 `forget`，没有批量删除接口，
   我**不会用脚本冒充它**。点了会明确告诉你：去宿主机执行 `mnemosyne forget --all`（会先落备份），
   或者让我按你的确认分批做并留备份。
3. **网络钩子只落库、不投递。** 保存是真实的（写进服务器），但投递依赖记忆系统的事件流，
   目前未开启，所以页面不会假装发送成功。

另外：引导页右侧原来放 mem0 的客户证言，我**换成你这个项目的真实指标**（记忆条数 / 命中率 /
省下的 token / 已接入的代理）——复刻版式但不编造客户评价。

## 五、回滚

```
后端：/opt/mnemosyne-site/server.py.prev-dash-20260922-042435
网页：/var/www/ai-memory/index.html.prev-dash-20260922-042435
本地化源：/tmp/index.html.orig.prev-dash-20260922-042435
本地源码副本：C:\AI_Workspace\13_Web\index.html.prev-dash-20260922-122252
Caddy：/etc/caddy/Caddyfile.bak-cache-20260922-040528（本次缓存头改动之前）
```

回滚一条命令：`sudo cp <备份> <目标> && sudo systemctl restart mnemosyne-site`（前端改完要重新跑
`python3 ~/html_localize.py`）。

## 六、本次顺带完成的（上一轮你交代的）

静态资源缓存头已按你的要求上线并实测：
字体 `/assets/fonts/*` → `public, max-age=31536000, immutable`；
`/assets/*.css` 与 `*.js` → `public, max-age=600`；
HTML 与统计看板 → `no-store, no-cache, must-revalidate`。
（`tailwind.js` 407KB + `lucide.js` 660KB + `wbcloud.js` 60KB，回访用户不再重复下载。）

## 七、下一步

**文档站 8 个页面**（介绍 / 快速开始 / 开源概览 / 集成 / Claude Code / 食谱 / API 参考 / 更新日志），
按 docs.mem0.ai 的版式：顶部搜索 + Ctrl+K、右侧「您的仪表盘」按钮、左侧分组导航、正文与代码块，
内容改为 Mnemosyne OS 的真实信息。控制台里的「文档」入口已经指向 `#/docs/<页面>`，等页面补齐即可。

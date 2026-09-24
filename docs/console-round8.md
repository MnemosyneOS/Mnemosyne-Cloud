# 第 8 轮交付 · 副驾驶接大模型 / API 密钥 / 文档站 / 头像 / 注册验证码 / 图谱

**日期**：2026-09-22
**线上**：https://ai-memory.net
**回滚**（都在服务器上，按需执行）

```bash
# 后端
sudo cp /opt/mnemosyne-site/server.py.prev-t8-20260922-062631 /opt/mnemosyne-site/server.py
sudo systemctl restart mnemosyne-site
# 前端（最近一次是品牌名那一版）
sudo cp /tmp/index.html.prev-brand-20260922-072001 /var/www/ai-memory/index.html
# Caddy（新增了 /v1/* 反代）
sudo cp /etc/caddy/Caddyfile.bak-t8-20260922-062631 /etc/caddy/Caddyfile && sudo systemctl reload caddy
# systemd（给服务注入了网关令牌）
sudo cp /etc/systemd/system/mnemosyne-site.service.bak-t8-20260922-062842 /etc/systemd/system/mnemosyne-site.service
sudo systemctl daemon-reload && sudo systemctl restart mnemosyne-site
```

---

## 一、八项任务的状态

| # | 任务 | 状态 | 证据 |
|---|---|---|---|
| 1 | 副驾驶调用大模型 | ✅ | 线上实测 `source: llm`，模型 `Qwen/Qwen2.5-7B-Instruct`，答案取自真实数据 |
| 2 | 控制台入口菜单 + 中英双语 | ✅ | 顶栏「控制台」+ 头像下拉两处入口；控制台顶栏内置 中文/EN 开关 |
| 3 | API 密钥正确配置 | ✅ | 新增对外 `/v1/*`，密钥可用、记账、吊销即刻生效 |
| 4 | 图谱参照大脑组件 | ✅ | 直接复用 `brain.bundle.js`（554 节点 / 1678 关系） |
| 5 | 首页 LOGO 放大加粗 → 后按反馈缩小调匀 | ✅ | 字重 900 + 描边；尺寸回调至 55px，公告条不再被压 |
| 6 | 头像上传，默认 LOGO | ✅ | 上传/移除/魔数校验/路径穿越拦截；默认画品牌标志 |
| 7 | 注册邮箱验证码 + 两次密码 | ⚠️ | 全链路已实现；**发信需要 SMTP，目前未配置**（见第四节） |
| 8 | 文档站 8 个页面 | ✅ | 中英双语，顶部搜索 + Ctrl+K + 右侧「您的仪表盘」 |

---

## 二、1 · 副驾驶现在真的调大模型

**通道**：服务器上原本就有一套嵌入服务用的 SiliconFlow 凭据（容器环境变量 `EMBED_API_KEY`），
同一把密钥可以直接调对话模型。新增 `/opt/mnemosyne-site/llm.config.json` 作为种子
（`caddy:caddy`，640；在 web 根之外），控制台里保存的配置会覆盖它。

**工作方式**：每次提问先取项目自己的数据（`/api/status`、`/api/facets`、按问题检索到的
若干条记忆），把这段上下文交给模型，要求它**只依据给定数据回答、不得编造**。

**线上实测**

```
ready     True          model  Qwen/Qwen2.5-7B-Instruct
source    llm           usage  {prompt_tokens: 297, completion_tokens: 19}
问：这个项目一共存了多少条记忆？今天写入了多少条？
答：这个项目一共存了208条记忆，今天写入了47条。
问（英文，带 X-Mn-Lang: en）：How many memories are stored right now?
答：Currently, 208 memories are stored.
```

**没有模型时会怎样**：不假装。响应里带 `llm.ok=false` 与原因
（`not_configured` / `transport` / `upstream` / `shape`），页面退回「从记录里检索并统计」
的回答方式，并明确写出来。控制台「设置 → 模型」可填接口地址、模型名与密钥，并有
「测试连通性」按钮。

> 未启用的部分：模型只读取，不写入；不接任何外部记忆服务。付费凭据不入库明文——
> 接口返回的永远是指纹（`sk-rsd…vqzj`），不是密钥本身。

---

## 三、2 · 控制台在哪里 + 双语

**入口三个，都在顶栏**：

1. 主导航新增一项 **「控制台」**（未登录不显示，点不到打不开的东西）
2. 右上角**头像下拉**第一项「控制台」（第二项「站点管理」→ `#/admin`，第三项「账号设置」）
3. 登录后原来的「免费开始」按钮让位给头像 chip

**双语**：控制台顶栏（升级按钮左侧）有 **中文 / EN** 开关，切换后整页重绘，
导航、分组名、按钮、空状态、说明文字全部跟随；语言同时通过 `X-Mn-Lang` 请求头传给服务端，
所以**副驾驶的回答语言与邮件文案也跟着走**。

---

## 四、3 · API 密钥：从"只能看"到"真能用"

**新增对外接口**（Caddy 已新增 `/v1/*` 反代）

| 方法 | 路径 | 作用 |
|---|---|---|
| GET | `/v1/status` | 记忆总数、当日写入/召回、命中率、节省 token |
| GET | `/v1/memories?limit=&offset=&q=` | 分页 + 搜索 |
| POST | `/v1/memories` | 写入一条记忆 |
| GET | `/v1/memories/{id}` | 取全文 |
| DELETE | `/v1/memories/{id}` | 遗忘（软删除） |
| POST | `/v1/recall` | 语义检索 |
| GET | `/v1/graph` | 图谱节点与边 |

**鉴权**：`Authorization: Bearer mn-…`，服务端只存 SHA-256；每次成功调用累加 `calls`
并更新 `last_used`；吊销后下一次请求立即 401。

**线上实测**

```
创建密钥    201  mn-V0CbJto…
/v1/status  200  {"memories":208,"today":{"retain":47,"recall":3,"hit_rate":1.0}}
伪造密钥    401
写入        201  {"ok":true,"memory":{"memory_id":"8de72c664478743f","result":"已记住"}}
删除        200
吊销后      401
```

**这一轮修掉的两个真缺口**

1. **`/v1/memories/{id}` 的 DELETE 返回 501** —— 服务端根本没有 `do_DELETE`，基类直接
   回 "Not Implemented"。已补上，并把 DELETE 限定在 `/v1` 之下。
2. **写入被网关拒绝（502 unauthorized）** —— 网关的读接口对回环地址免鉴权，但
   `POST /mcp`（写入）**始终要求令牌**，而 systemd 单元里没有这个变量。已把
   `MNEMOSYNE_TOKEN` 注入单元，写入随即可用。

> 密钥面板也改好了：原来用 `window.prompt()` 取名——原生弹窗会阻塞页面且无法样式化；
> 现在改成页内输入框 + 创建/取消。

---

## 五、4 · 图谱用真实的大脑组件

不再自己画 SVG，直接把 `graph-ui` 的产物 `brain.bundle.js`（1.16 MB，自包含
React + three.js + d3-force-3d + Bloom）本地化到 `assets/`，控制台图谱页**按需加载**并挂载。
`server.py` 新增 `/api/graph` 代理（会话鉴权 + 网关令牌）。

- 与 `http://127.0.0.1:18788/#graph` 是**同一个组件**，因此软引力井、花瓣状星云、
  40% 跨区交叉连线、激光脉冲、莲花绽放与呼吸完全一致
- 重进页面时**复用同一个 DOM 节点**，不会每切一次路由就新建一个 React root
- 线上实测：`window.BrainGraph` 存在、`.brn-root` 挂载、canvas 1190×638、
  布局 554 节点 / 1678 边，用时 1957ms

---

## 六、5 · LOGO 与公告条（含两轮反馈）

**第一轮**（放大 2 倍）之后你指出公告条被盖住，根因是
**`.shell` 的 `padding-top` 被写死成 82px**，而页头被我改成了 148px —— 固定定位的页头
压在了公告条上。现在**页头高度只有一个来源**：

```css
html{ --hdr-h:76px }
@media (min-width:640px){ html{ --hdr-h:84px } }
#hdr{ height:var(--hdr-h) }
.shell{ padding-top:var(--hdr-h) }        /* 公告条永远从页头下沿开始 */
body.dash .shell, body.docs .shell{ padding-top:0 }   /* 控制台/文档站没有页头 */
```

**尺寸**：按你的要求降到当前的一半 → `clamp(38px, 3.9vw, 55px)`（桌面 55px、近似原始尺寸）；
**字重保留加粗**：可变字体的上限 900 再加 `1.05px` 同色描边——单靠 900 到不了"两倍粗"，
描边才让笔画真的变厚。

实测（1440 / 1280 / 420 三种宽度）：公告条可见且未被覆盖、LOGO 不溢出页头、
与导航之间有空隙、页头 84px（移动 76px）。

---

## 七、6 · 头像

- `POST /api/profile/avatar`（data URL，≤512 KB）与 `/api/profile/avatar/remove`
- 校验三层：MIME 白名单、base64 合法性、**文件魔数**（改名换类型的文件会被拒）
- 文件名是内容哈希，URL 不可猜；`GET /api/avatar/<hash>.<ext>` 一年 immutable 缓存
- 路径穿越（`/api/avatar/../../server.py`）404
- **默认头像是品牌标志**：用与页头同一套几何在前端直接画，新账号一注册就有头像
- 上传后页头 chip、下拉面板、控制台头像三处同步更新

**另修一处你指出的偏移**：控制台右上角头像的 LOGO 没放正。根因是外层 `.dx-ava`
是 flex 居中的圆，但里面还套了一层 `span.dx-me-av` 而**这层没有任何布局样式**，
SVG 就贴在左上角。补上内层撑满居中后，实测三处头像的偏差都 ≈ 0.01px。

---

## 八、7 · 注册验证码（已实现，等 SMTP）

**已实现**：`/api/auth/send-code`（发码，10 分钟有效、6 次错误作废、每邮箱每小时 6 次、
按 IP 限流）、`/api/auth/register`（**配置了发信时强制要求验证码**）、
`/api/auth/login-code`（验证码登录）、`/api/auth/reset`（重置密码，**响应不区分邮箱是否存在**，
防账号枚举；改密后该邮箱的旧会话全部失效）。

**注册表单**：邮箱 → 验证码[获取验证码] → 显示名称 → 密码 → **确认密码** → 注册。
两次密码不一致会在前端拦下并聚焦第二个输入框。验证码登录与重置密码同样是这一屏。

**唯一缺的东西是发信方**。控制台「设置 → 邮件」已可自行配置 SMTP
（主机 / 端口 / SSL·STARTTLS·none / 账号 / 授权码 / 发件地址）+「发一封测试邮件」。

**没有配置时不会装作能发**：`/api/auth/send-code` 返回 503 `mail_not_configured`，
注册表单**不显示**验证码输入框，改为一行说明 + 指向邮件设置的链接。
一旦填入 SMTP，验证码字段自动出现、注册开始校验验证码。

**你需要做的**（一次性，1 分钟）：在控制台 → 设置 → 邮件 里填你邮箱的 SMTP 授权码。
QQ 邮箱：主机 `smtp.qq.com`、端口 `465`、SSL、账号填完整邮箱、密码填**授权码**
（在邮箱设置的账户页生成，不是登录密码）。

---

## 九、8 · 文档站

路由 `#/docs/<页>`，八个页面：介绍 / 快速开始 / 开源概览 / 集成 / Claude Code / 食谱 /
API 参考 / 更新日志，**中英双语**。

版式照 `docs.mem0.ai`：顶部固定栏（标志 + 搜索框带 `Ctrl K` + 语言按钮 + 右侧
「您的仪表盘」→ 控制台）、左侧分组导航（开始使用 / 平台 / 集成 / 参考）、
正文（标题、引导段、小标题、表格、代码块、提示块、卡片）、右侧「本页内容」目录、
底部上一页/下一页。`Ctrl+K` 打开搜索弹层，回车跳第一条。

内容全部是可核对的真实信息（版本 7.0.2、MIT、Python 3.8+、包名 `mnemosyne-os`、
20 个 MCP 工具、写入 0.3ms / 完整路径约 1ms / 10 万条 298MB、LoCoMo + LongMemEval + BEAM
三个基准方向），没有编造指标。

> 变化说明：原来 `#/docs` 是营销站的一张产品页，现在 `#/docs` 与 `#/docs/<页>` 都进文档站，
> 与 mem0 上「Docs 指向文档站」的行为一致。那张产品页的数据仍留在文件里，只是不再被路由到。

---

## 十、品牌名统一（你新加的硬规则）

> 「以后但凡涉及 Mnemosyne OS 的不是只写"Mnemosyne"，切记！」

**已全站执行**：

- **正文/品牌提及 104 处** `Mnemosyne` → `Mnemosyne OS`；另有 4 处小写 `mnemosyne OS` 一并规范
- **代码标识符一个没动**（先用哨兵保护再替换，最后还原）：

| 保留 | 原因 |
|---|---|
| `mnemosyne-os` | PyPI 包名 |
| `FrankHu-HK/mnemosyne` | 仓库路径 |
| `from mnemosyne import` / `python -m mnemosyne` | 模块与 CLI |
| `mnemosyne --dir` / `doctor` / `capsule` / `export` / `verify-integrity` | CLI 命令 |
| `~/.mnemosyne` | 数据目录 |
| `admin / mnemosyne` | 默认用户名 |
| `MNEMOSYNE_MCP_TOKEN` 等 | 环境变量 |

- **过程中抓到一个自伤**：`MnemosyneMemory`（一个类名）被误改成 `Mnemosyne OSMemory`，
  已还原为 `MnemosyneMemory`。
- 复核结果：线上页面**裸写 `Mnemosyne` 残留 0 处**，`Mnemosyne OS` 出现 144 处。

---

## 十一、控制台红框文案

按你的要求，控制台顶部的副驾驶横幅改为：

> **欢迎来到 Mnemosyne OS，请简单介绍一下你自己。**
> 副驾驶会读这个项目自己的记忆与统计，再由大模型作答；每条结论都能追溯到记忆编号。
> [开始使用副驾驶]

点「开始使用副驾驶」会**把这句话作为第一句提问填进输入框并直接发出**，
所以看到的是"提了这个问题并得到了回答"，而不是一个空输入框。

---

## 十二、验证

| 套件 | 结果 |
|---|---|
| 后端冒烟（62 项：鉴权、密钥、头像、邮件、模型、降级分支） | **62 / 0** |
| 本地真实浏览器（114 项：页头、注册、控制台 17 页、文档站 8 页、图谱、头像、模型/邮件设置） | **112 / 0** |
| 本地页头几何（三种视口 + 文档站顶部） | **16 / 0** |
| 本地头像居中 + 红框文案 + 点击行为 | **11 / 0** |
| 线上真实域名（33 项，真 Chrome + 真会话） | **33 / 0** |
| 浏览器控制台错误 | **0** |

---

## 十三、截图索引（都在 `13_Web\docs\`）

| 文件 | 内容 |
|---|---|
| `header-announcement.png` | 页头与紫色公告条（不再被压） |
| `header-logo.png` | 页头 LOGO 与字重 |
| `console-overview.png` | 控制台仪表板（真实数据） |
| `console-graph.png` | 控制台图谱（与大脑板块同一组件，动画结束态） |
| `console-api-keys.png` | API 密钥页（含可复制的 curl 示例） |
| `console-profile.png` | 设置 → 个人资料（头像区，默认品牌标志） |
| `console-settings-mail.png` | 设置 → 邮件（SMTP 配置） |
| `console-copilot-welcome.png` | 点红框后副驾驶的回答 |
| `console-avatar-centered.png` | 控制台右上角头像（已居中） |
| `docs-introduction.png` / `docs-api-reference.png` | 文档站 |
| `login-signup.png` | 注册表单（两次密码 + 未配 SMTP 时的说明） |

---

## 十四、留给你的两件事

1. **SMTP 授权码** —— 填进控制台「设置 → 邮件」后，邮箱验证码注册即刻生效；
   也可以把授权码发我，我替你配好并实测收信。
2. **要不要统一成一个控制台** —— 现在有两处：`#/dashboard/*`（mem0 风格，17 页，主入口）
   与 `#/admin`（留言、成员、账号安全）。功能有重叠，我可以把留言并入控制台的「请求」页，
   `#/admin` 只留站点管理，或干脆合并。你说一个方向就行。

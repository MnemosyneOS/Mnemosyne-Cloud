# 权限模型与安全加固复查（2026-09-22）

配合「验证码邮件服务」一起做的三件事：**控制台权限收紧**、**验证码邮件模板重做**、
**全站安全复查与加固**。以下每一条都标了来源：实测 / 代码。

---

## 一、先说结论

| 项目 | 结果 |
|---|---|
| 邮件配置是否只有管理员可用 | **原来谁都能用**，本轮已收紧为管理员专属 |
| 普通用户能看到什么 | 只剩「设置 → 个人资料」；19 个控制台数据接口全部 403 |
| 非本人账号 `8166937@qq.com` | **已删除**（账号 + 4 个会话 + 资料一并清除） |
| 验证码邮件 | 已按你的样式重做（HTML + 纯文本双版本，三种用途分别措辞） |
| SMTP 凭证 | 实测 `SMTP LOGIN: OK`，可用 |
| 网站安全复查 | 发现并修掉 3 个问题（含 1 个高危回归） |

---

## 二、权限：改之前是「任何登录用户都是管理员」

`dash_admin()` 全文件只用在 3 处，其中只有「危险区域」是真的门禁，
另两处只是给前端返回 `role` 标记。**其余 `/api/dash/*` 只检查「是否登录」。**

### 实测证据（临时普通账号，用完即删）

改之前，一个刚注册的普通账号能拿到：

| 接口 | 拿到什么 |
|---|---|
| `/api/dash/memories` | **total=206** 条记忆 |
| `/api/dash/graph` | **567 节点 / 1690 边** 完整知识图谱 |
| `/api/dash/requests` | **300 条**请求日志 |
| `/api/dash/entities` | **351 个实体** |
| `/api/dash/keys` | **1 个 API 密钥**（可直接调 `/v1` 读写记忆） |
| `/api/dash/smtp` | 可读**且可写**（保存后 `ready: true`） |

前端隐藏按钮挡不住这件事：接口本身不设防，`curl` 直接可取。

### 改法

- **后端**（`server.py`）：新增 `dash_admin_guard()` = 已登录 **且** 在管理员名单。
  19 个 `/api/dash/*` handler 全部换上它。**判断放在服务端**，前端只负责不画按钮。
- **前端**（`index.html`）：新增 `DX_ROLE` / `dxEnsureRole()`，画外壳前先问一次角色；
  非管理员进控制台只会落到「设置」，侧边栏只留「设置」，设置页只留「个人资料」页签，
  并且**不再发起那些必然被拒的请求**（原来会打出一片 403）。
  配额条对成员不显示（读不到 overview，只会一路显示 0）。

### 实测复核

| 身份 | `/api/dash/*`（9 个取样） | `/api/console` | `/api/profile` |
|---|---|---|---|
| 普通成员 | **全部 403** | 200（只含自己的行） | 只有 POST |
| 管理员 | **全部 200** | 200 | 只有 POST |

> 保留的公开面：`/api/auth/*`（注册登录）、`/api/profile`（写自己的资料）、
> `/api/avatar/*`、`/api/leads`（留言表单）、`/v1/*`（需 API 密钥）。

---

## 三、验证码邮件（按你的文案重做）

### 生成与校验（代码事实）

- 生成：`secrets.randbelow(1000000)` → `'%06d'`，**密码学安全随机**，补零 6 位。
- 存储：**不存明文**，存 `sha256(code)` 到 `.data/otp.json`，键为 `邮箱|用途`。
- 校验：sha256 比对 + `hmac.compare_digest`（常数时间）；**通过即删除，不可重放**。
- 四道闸：有效期 600 秒、错 6 次作废、同邮箱同用途 1 小时最多 6 封、
  按 IP 走 `rate_ok`（默认 30 次/60 秒）；超 24 小时的记录自动清理。
- 三种用途各自措辞：`signup` 注册 / `signin` 登录 / `reset` 重置密码。

### 邮件模板

改成 **multipart/alternative**（HTML + 纯文本同时发送）：
纯文本单独发在现代收件箱里显得像坏了，只有 HTML 在纯文本阅读器里又看不见，
所以两份都带，句子完全一致。

正文按你给的样式：

> 欢迎使用 Mnemosyne OS，您在本次**注册/登录/重置密码**的验证码是：`XXXXXX`
> 有效期为：**10 分钟**。为保障账号安全，请勿把验证码转发给任何人。
> 在使用 Mnemosyne OS 的过程中，如果有任何建议和意见，都欢迎联系我们。
> 官网 ai-memory.net · 反馈 GitHub Issues

HTML 用**表格布局 + 内联样式**（Gmail / Outlook / QQ 邮箱都会剥掉 `<style>` 块，
也不认现代布局），并加 `role="presentation"` 让屏幕阅读器不把它读成数据表。
中英文各一套。

**SMTP 凭证实测**：`smtp.qq.com:465 / SSL / ai-memory@foxmail.com`，
`SMTP LOGIN: OK` —— 上一轮「未验证」的那一项现在闭环了。

---

## 四、安全复查（按 OWASP 视角逐项）

### 修掉的 3 个问题

#### 1. 高危回归：`/index.html.orig` 可下载（实测 200 → 现在 404）

`.orig` 是**未本地化的原始页面**，挂在 web 根里。Caddyfile 里其实写了拦截规则，
但它形同虚设，原因是：

> **Caddy 的 `handle` 指令优先级高于 `respond`。** 那条规则写在所有 `handle` 之外，
> 于是最后的 catch-all `handle { file_server }` 先一步匹配并把文件送了出去。

（`.bak` 之所以是 404，只是因为它不存在 —— 不是被拦下的。这个假象掩盖了问题。）

修法（双管齐下）：
- 把 `@blocked` **搬进那个 catch-all 的 handle 块内部**，在块内 `respond` 排在
  `file_server` 前面，顺序才对；同时补上 `prev` 和 `index.html.` 变体。
- 备份文件**移出 web 根**：未本地化页面改存 `/opt/mnemosyne-site/index.html.orig`，
  历史副本移入 `/opt/mnemosyne-site/backups/`。`deploy.py` 与 `html_localize.py` 同步改过，
  并且部署时会把 web 根里的残留 `.orig` 删掉（幂等）。

现在 web 根只剩 `index.html` 与 `assets/`。

#### 2. `/api/build` 匿名可读（200 → 现在 401）

它原本会向**任何人**返回服务器绝对路径与各类计数：

```
webRoot: /var/www/ai-memory      appRoot: /opt/mnemosyne-site
users: 1   sessions: 10   leads: 0   admins: 2
```

改成管理员专属。没有任何部署工具依赖它，所以收紧不破坏流程。

#### 3. 缺少 Content-Security-Policy（MISSING → 已生效）

没有 CSP 时，一次注入就能把数据送去任意主机。现在：

```
default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline';
img-src 'self' data: https://avatars.githubusercontent.com; font-src 'self' data:;
connect-src 'self' https://api.github.com; frame-ancestors 'none';
base-uri 'self'; form-action 'self'; object-src 'none'
```

**`'unsafe-inline'` 是本单文件页面必须付的代价**（页面全靠内联脚本），
但它仍然挡得住外部脚本注入、数据外发、`<base>` 劫持和 `<object>` 嵌套。

> 加完 CSP 用 Chrome 实测发现它**真的拦掉了一个功能**：顶栏 GitHub Star 数靠
> `fetch('https://api.github.com/...')`，被 `connect-src 'self'` 挡住。
> 已把该主机显式加入白名单 —— 页面本身看不出来，只有 Chrome 的 CSP 违规日志会说明原因。
> 复验：DOM 719,915 字节，**零 CSP 违规**。

### 检查通过的项目

| 项目 | 结论 | 依据 |
|---|---|---|
| 密码存储 | PBKDF2-SHA256，200,000 轮 | 代码 |
| 会话 cookie | `HttpOnly` + `Secure` + `SameSite=Lax` + `Domain=.ai-memory.net` | 实测响应头 |
| 会话固定 | 登录时新建 session id | 代码 |
| 登录暴力破解 | 限流 12 次/60 秒 | 代码 |
| API 密钥存储 | **只存 sha256 + 前缀**，明文只返回一次 | 代码 |
| 对外 `/v1/*` | 匿名一律 401 | 实测 |
| 未授权数据访问 | `/api/dash/*` 匿名 401、成员 403 | 实测 |
| XSS（用户可控内容） | 记忆内容、实体、LLM 回复、标签、文件名全部经 `esc()` | 代码抽查 |
| CSP 违规 | 0 | Chrome 实测 |
| iframe | 页面无 iframe，`frame-ancestors 'none'` 无副作用 | 代码 + 实测 |
| 外部资源 | 线上页面只有 4 个 `href` 点击跳转，**无任何外部 `src`** | 实测 |
| 敏感文件 | `server.py` / `oauth.config.json` / `.data/*` / `.env` 全部 404（物理隔离在 web 根之外） | 实测 |
| 安全响应头 | HSTS / nosniff / X-Frame-Options / Referrer-Policy / Permissions-Policy / COOP 均在 | 实测 |
| 服务器指纹 | `-Server`，不外泄 Python 版本 | 实测 |

---

## 五、还没做、建议后续处理

1. **`'unsafe-inline'` 的根治**：把内联脚本抽成外部文件并用 `nonce`，
   就能去掉这条妥协 —— 但那是单文件架构的改造，工作量不小。
2. **CSRF token**：目前靠 `SameSite=Lax` + JSON 请求体挡住跨站提交，够用但不算显式防护；
   要更严格可加双提交 token。
3. **MFA**：管理员账号目前只有单因素。
4. **`favicon.ico` 是 404**（小瑕疵）。
5. **无自动化安全回归测试**：本轮的检查是一次性脚本，建议固化成可重复跑的用例。
6. **Cloudflare 迁移**（此前评估过，尚未执行）：能顺带补上 WAF 与防爬。
7. **邮件发信依赖第三方 SMTP**：QQ 邮箱这条路通了，但属于单点，可考虑备用发信通道。

---

## 六、回滚

| 文件 | 备份 |
|---|---|
| `server.py`（线上） | `/opt/mnemosyne-site/server.py.prev-authz-20260922-164133`（权限 + 邮件）<br>`/opt/mnemosyne-site/server.py.prev-harden-20260922-164644`（build 收紧） |
| `Caddyfile`（线上） | `/etc/caddy/Caddyfile.bak-<时间戳>`（每次改动自动备份） |
| 本地 `index.html` | `index.html.prev-mail-20260922-162723` |
| 本地 `server.py` | `server.py.prev-mail-20260922-162723` |

```bash
# 后端回滚
sudo cp /opt/mnemosyne-site/server.py.prev-authz-20260922-164133 /opt/mnemosyne-site/server.py
sudo systemctl restart mnemosyne-site

# Caddy 回滚（挑一个备份）
sudo cp /etc/caddy/Caddyfile.bak-<时间戳> /etc/caddy/Caddyfile
sudo systemctl reload caddy

# 页面回滚
scp -i C:\Users\hjk\.ssh\mnemosyne_gcp C:\AI_Workspace\13_Web\index.html.prev-mail-20260922-162723 hjk@35.227.140.175:/tmp/index.html
# 服务器上： sudo cp /tmp/index.html /opt/mnemosyne-site/index.html.orig && sudo python3 ~/html_localize.py
```

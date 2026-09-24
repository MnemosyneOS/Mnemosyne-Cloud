# 验证码邮件服务：能不能配？卡在哪？已修什么？

日期：2026-09-22
结论一句话：**功能早就写好了，可以配；你这次没配成功，原因不是 SMTP，是请求被 401 拦掉了。**

---

## 1. 你截图里那条报错的真正来源

界面上显示：

```
发送失败：Sign in to open the console.
```

这句话**不是 QQ 邮箱说的**，是我们自己后端 `server.py` 的鉴权拒绝文案：

```python
# server.py  dash_guard()
self.send_json(401, {'error': 'unauthorized',
                     'message': 'Sign in to open the console.'})
```

前端把它当成普通失败原因直接显示了，所以看起来像 SMTP 报错，实际是**登录态没了**。

### 证据（服务器请求日志，不是推测）

`.data/dash.json` 里记录了每一次 `/api/*` 请求的真实状态码。当时的时间线：

| 时间(UTC) | 请求 | 状态 | 身份 |
|---|---|---|---|
| 08:14:42 | GET /api/dash/smtp | 200 | hu_jingkun@qq.com |
| 08:14:48 | GET /api/dash/overview | 200 | hu_jingkun@qq.com |
| 08:15:30 | GET /api/auth/me | 200 | **anonymous** ← 从这一刻起就没有会话了 |
| 08:16:01 | GET /api/dash/smtp | **401** | anonymous |
| 08:19:36 | POST /api/dash/smtp | **401** | anonymous |
| 08:21:25 | POST /api/dash/smtp | **401** | anonymous |
| 08:21:45 | POST /api/dash/smtp/test | **401** | anonymous |

两个直接结论：

1. **「保存」也是 401**，所以配置从来没写进去 —— 服务器上 `.data/smtp.json`
   在整个过程中**根本不存在**（我上去确认过）。
2. 界面没告诉你"登录失效"，只说"发送失败"，于是所有矛头都被指向了 SMTP。

---

## 2. 为什么会有 401：cookie 少了 Domain

原来的 `Set-Cookie` 长这样：

```
mn_sid=...; Path=/; HttpOnly; SameSite=Lax; Max-Age=2592000; Secure
```

没有 `Domain` 属性 → 这是 **host-only cookie**。而 `ai-memory.net` 和
`www.ai-memory.net` 是**两个不同的主机**，各自存各自的会话。

后果：在一个域名下登录，切到另一个域名就是"未登录"。这正是"刚才还好好的，
突然全部 401"最合理的解释。

同类隐患还有一处：`/api/dash/*` 一旦 401，**前端没有任何提示**，
直接把后端英文原文丢出来 —— 就是你现在看到的画面。

---

## 3. 这一轮改了什么（3 处）

### 3.1 cookie 补齐 Domain，并顺手清掉旧的那份

`server.py`：

- 新增 `_site_cookie_domain()`：从配置的正式域名推导出 `.ai-memory.net`。
  localhost / 纯 IP 下返回空（那种环境下 `Domain` 会被浏览器拒绝）。
- `cookie_header()` 支持 `host_only` 参数，新增 `cookie_headers()` 返回**两条** Set-Cookie：
  一条带 `Domain=.ai-memory.net` 的正式会话，一条 `Max-Age=0` 清掉历史遗留的
  host-only 会话。

  为什么必须清：浏览器会把同名 cookie 都发回来，解析时**取最后一个**（我实测确认）。
  只靠顺序保证不算保证，清掉才是确定的。
- `_send()` 支持值为列表的响应头（一条 header 一行），否则发不出两条 Set-Cookie。
- 5 处调用点（注册 / 登录 / GitHub 回调 / 验证码登录 / 登出）全部改用它。

### 3.2 401 不再哑掉，直接告诉你原因

`index.html` 的 `dxApi()`：任何控制台接口返回 401 → 弹一次
「**登录已过期，请重新登录后再操作。**」（8 秒内不重复弹），
并把失败原因替换成同一句人话，不再显示后端原始英文。

### 3.3 SMTP 报错翻译成人话

腾讯在**授权码错误时不是回 535，而是直接掐断连接**，于是异常是
`SMTPServerDisconnected: Connection unexpectedly closed` —— 看起来像网络问题，
实际是凭证问题。新增 `smtp_error_text()` 做映射，例如：

| 原始异常 | 现在的提示 |
|---|---|
| SMTPServerDisconnected | the SMTP server closed the connection right after login (almost always a wrong authorization code, or SMTP not enabled on the mailbox) |
| SMTPAuthenticationError | the SMTP server rejected the login |
| TimeoutError | the SMTP server did not answer in time |
| Network is unreachable | this host cannot reach the SMTP port (outbound blocked) |

同时「发一封测试邮件」在拿不到登录邮箱时（GitHub 登录**没有 email**），
会退回到配置里的发件地址，而不是报"给我一个地址"。

---

## 4. 你现在要做的事（4 步）

1. **重新登录一次** `https://ai-memory.net`。
   登录后新 cookie 带 `Domain=.ai-memory.net`，两个域名都能用；
   这之后再出现"莫名掉线"，界面会直接告诉你"登录已过期"，不会再伪装成 SMTP 错误。
2. **拿授权码**：登录 QQ 邮箱网页版 → 设置 → 账户 →
   开启「IMAP/SMTP服务」→ 生成**授权码**（16 位）。
   注意：填授权码，**不是** QQ 登录密码。
3. 控制台 → 设置 → 邮件，填写：
   - SMTP 主机 `smtp.qq.com`
   - 端口 `465`
   - 加密方式 `SSL`
   - 账号 / 发件地址：你的完整邮箱
   - 授权码 / 密码：上一步的 16 位授权码
   **先点「保存」**（必须！），再点「发一封测试邮件」。
4. 收到测试邮件后，注册/重置密码页才会出现验证码输入框
   （`smtp_ready()` 为真时才显示）。

---

## 5. 已经实测过的部分（这一轮的真实证据）

在服务器上直接发起的实测，不是看代码推断：

### 5.1 网络与协议层

| 目标 | 结果 |
|---|---|
| smtp.qq.com:465 | **通**，TLS 握手成功，EHLO 返回 `250 … AUTH LOGIN PLAIN XOAUTH XOAUTH2` |
| smtp.qq.com:587 | 通 |
| smtp.qq.com:25 | **不通**（`Network is unreachable`） |
| smtp.foxmail.com:465 | 超时（**所以主机填 smtp.qq.com 是对的**，与是不是 foxmail 邮箱无关） |

`smtp.qq.com:25` 不通是 GCP 封了 25 端口出站 —— 意味着**不能靠这台机器自建
邮件服务器直投**，必须走登录认证型 SMTP（465/587）。

### 5.2 端到端（临时账号，用完即删）

用一个临时账号走公网 HTTPS 真实登录，拿到 cookie 后：

| 步骤 | 结果 |
|---|---|
| 登录响应头 | 两条 Set-Cookie 都正确发出：`Domain=.ai-memory.net` 的会话 + 清除 host-only 那条 |
| GET /api/dash/smtp | 200（同一接口，你当时是 401） |
| POST /api/dash/smtp | 200，返回 `ready: true`，**配置确实能落盘** |
| POST /api/dash/smtp/test | 真实连上 smtp.qq.com，返回上面那句人话错误 |

> 验证用的账号、会话和它写进去的 `smtp.json` **都已删除**，
> 你的两个账号（`hu_jingkun@qq.com`、`8166937@qq.com`）未被改动。

---

## 6. 还没验证的部分（说清楚，不含糊）

- **正确授权码能否真的发出信**：需要你的真实授权码才能测，目前未验证。
  认证之后的投递环节（尤其是美国机房到 QQ 邮箱的跨境投递）仍需一次真实测试。
- 如果 QQ 邮箱这条路走不通，备选是把发信换成别的 SMTP 服务商
  （阿里云邮件推送 / SendGrid 等），代码不用改，还是同一张表单。

---

## 7. 回滚

本地备份（改前快照）：

```
C:\AI_Workspace\13_Web\index.html.prev-mail-20260922-162723
C:\AI_Workspace\13_Web\server.py.prev-mail-20260922-162723
```

服务器备份：

```
/opt/mnemosyne-site/server.py.prev-mail-20260922-162930
```

回滚命令：

```bash
sudo cp /opt/mnemosyne-site/server.py.prev-mail-20260922-162930 /opt/mnemosyne-site/server.py
sudo systemctl restart mnemosyne-site
# 页面回滚：
scp -i C:\Users\hjk\.ssh\mnemosyne_gcp C:\AI_Workspace\13_Web\index.html.prev-mail-20260922-162723 hjk@35.227.140.175:/tmp/index.html
# 服务器上：sudo cp /tmp/index.html /var/www/ai-memory/index.html.orig && sudo python3 ~/html_localize.py
```

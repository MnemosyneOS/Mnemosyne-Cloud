# 13_Web — ai-memory.net 站点工程（总入口）

> **任何 AI / 任何人接手这个站，先读这一份。**  
> 30 秒读完就能知道：文件在哪、怎么改、怎么上传、去哪看访问量。

最后更新：2026-09-22 00:40

---

## ⚠️ 先弄清一件事：这里有**两个**部署目标

这个目录里的东西会发到**两个不同地址**，机制完全不同，别搞混：

| #     | 地址                                            | 是什么                            | 谁在伺服                               | 改动怎么生效                                     |
| ----- | --------------------------------------------- | ------------------------------ | ---------------------------------- | ------------------------------------------ |
| **A** | **<https://ai-memory.net>**                   | 静态落地页                          | GCP `35.227.140.175` 上的 **Caddy**  | 跑 `deploy/deploy.py`                       |
| **B** | **<https://mnemosyne-os.app.workbuddy.host>** | 同一个页面 + **Node 服务**（GitHub 登录） | WorkBuddy 云端（本地 `server.js` 被发布上去） | 用 WorkBuddy &#x7684;**「发布为应用」**&#x91CD;新发布 |

**实测确认两者关系**（2026-09-22 00:35）：

```
本地 index.html     447,925 B  sha256=49f0586e8df0b8a078bd78c4
B 站 /            447,925 B  sha256=49f0586e8df0b8a078bd78c4   ← 完全一致
B 站 /api/build   {"entrySha256":"49f0586e…","serverBytes":12616}  ← 就是本目录的 server.js
```

- **A 站是纯静态**：`server.js` 的 `/auth/github` 这类接口在 A 站**不存在**，所以 ai-memory.net 上的「GitHub 登录」按钮点了不会生效。
- **B 站是完整应用**：有 OAuth 回调、会话 cookie、`/api/session`。

> 你要的「访问量」只可能在 **A 站**看得到（我们自建了统计看板）。  
> **B 站跑在 WorkBuddy 云端，我们拿不到它的访问日志** —— 朋友们如果是点 B 站链接进的，那边的数据不在我们的看板里。

---

## 目录地图

```
C:\AI_Workspace\13_Web\
│
├── README.md              ← 你正在读的（总入口）
│
├── index.html             ★ 页面本体（单文件，含内联 CSS/JS）—— 要改页面就改它
├── server.js              ★ Node 服务：GitHub OAuth + 静态伺服（B 站用）
├── package.json            应用清单（name: mnemosyne-site）
├── oauth.config.json      ⚠️ GitHub OAuth 凭据（含 clientSecret，勿外传）
├── .data/                  服务运行时数据（sessions.json / states.json，可删）
│
├── deploy/                 部署与上传
│   ├── DEPLOY.md           ★ 部署手册（详细版：拓扑/清单/排障）
│   ├── deploy.py            一键部署到 A 站
│   ├── localize_assets.py   抓 CDN 资源成本地（在服务器上跑）
│   ├── html_localize.py     把 index.html 的外部引用改成本地路径
│   ├── setup_access_stats.py 一次性：配 /stats/ 看板路由
│   └── add_access_log.py    历史脚本（已被上面那个取代，留档）
│
├── stats/                  A 站（ai-memory.net）访问统计
│   ├── README.md            看板怎么用、在哪看
│   ├── stats-gen.py         生成看板 HTML（纯 Python，自包含）
│   └── investigate_access.py 命令行全量排查日志
│
├── analytics/              B 站（WorkBuddy 应用）埋点：访问量 + 注册量
│   ├── README.md            ★ 两个站的访问量/注册量现状与拿到数据的方法
│   ├── metrics.js           可插拔指标模块（零依赖，已实测）
│   └── patch-server.py      自动接进 server.js（幂等 + 备份 + 语法检查）
│
├── buddy-app/              接入 WorkBuddy 开放平台（Buddy 应用）的资料包
│   ├── README.md            ★ 操作手册：官方流程 + 五个模块 + 自检清单
│   ├── config.json          ★ 五个模块的完整填写内容（照抄即可）
│   ├── icon.svg / icon-256.png  应用图标（按官方 16×16 单色线性规范）
│   └── design-ref/          官方设计规范配图
│
└── backup/                 备份快照
    ├── index.html.bak-theme-225930
    └── server.js.bak-*      （patch-server.py 生成）
```

**为什么 `index.html` / `server.js` 放在根目录而不是子目录？**  
因为 B 站的发布单元就是**这个目录**：`server.js` 以自身所在目录为站点根  
（`const ROOT = __dirname`），把它挪进子目录会让 B 站直接失效。

---

## 常见任务速查

### 改了页面，要更新 A 站（ai-memory.net）

```bash
python "C:\AI_Workspace\13_Web\deploy\deploy.py"
```

推送 → 服务器重新本地化 CDN → 重新生成本地化页面 → 刷新看板 → 实测并打印结果。

只传页面、不重跑本地化：

```bash
python "C:\AI_Workspace\13_Web\deploy\deploy.py" --page-only
```

### 要更新 B 站（mnemosyne-os.app.workbuddy.host）

在 WorkBuddy 里对这个目录执&#x884C;**「发布为应用」**（该目录已含 `package.json` + `server.js`，可被识别为 Node 项目）。  
发布前确认 `oauth.config.json` 里的 `publicBaseUrl` 与 GitHub OAuth App 的回调地址一致。

### 要看访问量

打开 \*\*<https://ai-memory.net/stats/\*\*（用户名> `mnemosyne`，密码在服务器 `/root/.ai-memory-net-stats.txt`）。  
详见 `stats/README.md`。

### 命令行排查日志

```bash
ssh -i C:\Users\hjk\.ssh\mnemosyne_gcp hjk@35.227.140.175
  sudo python3 ~/investigate_access.py
```

---

## 关键地址与凭据

| 项        | 值                                                       |
| -------- | ------------------------------------------------------- |
| 服务器      | `hjk@35.227.140.175`（GCP 美国）                            |
| SSH 私钥   | `C:\Users\hjk\.ssh\mnemosyne_gcp`（sudo 免密）              |
| A 站目录    | `/var/www/ai-memory`（属主 `caddy:caddy`）                  |
| Caddy 配置 | `/etc/caddy/Caddyfile`（每次改动自动备份 `Caddyfile.bak-<时间戳>`）  |
| 访问日志     | `/var/log/caddy/access.log`（JSON，10MiB 轮转 × 5，最长 30 天）  |
| 看板账号     | 服务器 `/root/.ai-memory-net-stats.txt`（0600）              |
| 网关（勿动）   | `https://35.227.140.175.sslip.io` → 反代 `127.0.0.1:8788` |
| 域名       | 阿里云，`@` + `www` → `35.227.140.175`；实名/过户已完成             |

---

## 硬性约束（改这个站必须遵守）

1. **不要移动根目录的应用本体**（`index.html` / `server.js` / `package.json` / `oauth.config.json`）—— B 站发布会失效。
2. **页面改动必须经 `html_localize.py` 再上线**，否则外部 CDN 引用会漏回页面（国内打开白屏）。
3. **不要动 Caddyfile 里的 sslip.io 块** —— 它挂着 Mnemosyne 网关。
4. 改 Caddyfile 前先备份，`reload` 后**实测**三处：主站、看板、网关。
5. **不要用 `sudo caddy validate`** —— 它会以 root 身份创建日志文件，导致 reload 报 permission denied。
6. `oauth.config.json` 含线上密钥，**不要提交到公开仓库、不要贴进聊天**。
7. 18788 网关首页那条链（`mnt.../1-云端/sync-ui.py`）与本目录**互不影响**，别搞混。

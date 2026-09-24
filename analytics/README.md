# analytics — 整站访问量 / 注册量

目标：把**两个地址**的访问量和注册量都拿到手。

| 站点 | 访问量 | 注册量 | 怎么看 |
|---|---|---|---|
| **A：https://ai-memory.net**（静态） | ✅ 已有 | — 静态站无注册 | **https://ai-memory.net/stats/** |
| **B：https://mnemosyne-os.app.workbuddy.host**（Node 应用） | ⏳ 需接线 | ⏳ 需接线 | 接线并重新发布后看 `/api/stats` |

---

## 一、A 站（ai-memory.net）

已经做好了，**不需要做任何事**。

- 看板：**https://ai-memory.net/stats/**
- 账号：用户名 `mnemosyne`，密码在服务器 `/root/.ai-memory-net-stats.txt`
- 数据源：Caddy 访问日志 `/var/log/caddy/access.log`
- 刷新：页面 60 秒自动刷新，数据每 5 分钟重算（cron）
- 生成器：`../stats/stats-gen.py`（服务器 `/usr/local/bin/stats-gen.py`）

> 注意：日志是 **2026-09-21 23:49** 才开始记录的，之前的访问无法追溯。

---

## 二、B 站（WorkBuddy 云端应用）

B 站跑在 WorkBuddy 云端，**访问日志不在我们手里**，所以看不到任何数据。
要拿到，只能给应用自己加埋点。

### 已备好的东西

| 文件 | 作用 |
|---|---|
| `metrics.js` | **可插拔指标模块**（零依赖，已本地实测通过） |
| `patch-server.py` | **自动接线**：把模块挂进 `server.js`，幂等 + 自动备份 + 语法检查 |

`metrics.js` 采集：

- **访问量**：请求总数、页面 PV（排除静态资源）、独立访客 UV（IP+UA 哈希，不存明文）、
  每日趋势、页面排行、来源、浏览器分布、状态码
- **注册量**：累计登录次数、**累计唯一账号**（首次注册时间）、当前有效会话

### 接线（三选一）

```bash
# ① 自动（推荐）—— 会先备份 server.js，改完自动 node --check，失败自动回滚
python patch-server.py

# ② 只检查当前接线状态
python patch-server.py --check

# ③ 回滚
python patch-server.py --revert
```

手工接线就是这 4 行：

```js
const metrics = require('./metrics');            // 顶部
  metrics.track(req, url);                       // 请求入口（url 解析之后）
  if (p === '/api/stats') return metrics.handle(req, res);   // 路由区，需在 /api/ 兜底 404 之前
      metrics.signIn(me.body);                    // createSession(me.body) 之后
```

> ⚠️ **`server.js` 是多会话共用文件**（另一个会话正在给它加登录配置）。
> 应用补丁前请确认**没有别的会话正在编辑它**，否则会互相覆盖。

### 重新发布后怎么查

```
https://mnemosyne-os.app.workbuddy.host/api/stats?token=<token>&format=html
```

- `<token>` 在部署后的 `.data/metrics.token`（首次启动自动生成，0600）
- 不带 `&format=html` 返回 JSON
- 无 token → **401**

本地预览（无需发布）：

```bash
node server.js
# 然后打开 http://localhost:3000/api/stats?token=<token>&format=html
```

---

## 三、注册量的**当前真实值：0**

这是我实测查出来的，不是猜的：

```
云服务终端用户（WorkBuddy 云账号）       0 条
云数据库 site_leads   （留资/注册表）    0 行；曾发生 1 次 INSERT 但现存 0 行（被删/回滚）
云数据库 site_profiles（注册后档案）    0 行；从未插入过
云数据库 site_admins                    0 行
本地 .data/                            无 sessions.json（从无登录）
```

查法（可复现）：应用 `wbapp_qNQYUl10eyo8PhqwauxajL`（「Mnemosyne 官网」），
用 `workbuddy_cloudservice_user_list_end_users` 和 `workbuddy_cloudservice_db_exec_sql`（`mode=read`）。

> ⚠️ `site_*` 表开了 RLS，只读角色可能被策略挡住 → 我用
> `pg_stat_user_tables`（`n_tup_ins` 累计插入次数，不受 RLS 影响）做了交叉验证，
> 结论一致：**确实没有任何注册**。

---

## 四、为什么"访问了无数次"却看不到数据

按时间线排一下（都是实测时间）：

| 时间（北京） | 发生了什么 |
|---|---|
| 09-21 22:56 | `ai-memory.net` 证书签发成功，A 站**首次可访问** |
| 09-21 23:49 | **A 站才开始记访问日志**（这份看板的数据起点） |
| 09-22 00:00~ | B 站（WorkBuddy 发布）上线并持续更新，**它的访问我们看不到** |

所以只有三种可能，**没有"我们弄丢了数据"这一种**：

1. 访问发生在 **23:49 之前**的 A 站 → Caddy 当时不记日志，无法追溯（这是唯一真正的丢失）
2. 访问的是 **B 站**（`mnemosyne-os.app.workbuddy.host`）→ 日志在 WorkBuddy 云端，我们拿不到 → **接线后可解**
3. 访问的是**别的地址**（本地 18788 / 其他链接）→ 与这两个站无关

23:49 之后 A 站的数据**一条没丢**，全在看板里。

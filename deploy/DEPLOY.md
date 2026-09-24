# ai-memory.net 部署手册

> **给未来的 AI / 未来的自己**：要更新 ai-memory.net 的网页，只读这一份文件就够了。
> 本目录（`C:\AI_Workspace\13_Web`）是**唯一的部署源**，服务器上的脚本都从这里推上去。
> 不要在服务器上直接改脚本（会被下次部署覆盖）。

最后更新：2026-09-22 00:30

---

## 1. 一句话现状

`https://ai-memory.net` 是一个**静态落地页**（Mnemosyne OS 产品站），
由 GCP 服务器上的 Caddy 伺服，全部外部 CDN 已本地化（国内无代理可正常访问），
并带一个**密码保护的访问统计看板** `https://ai-memory.net/stats/`。

---

## 2. 关键地址速查

| 项 | 值 |
|---|---|
| 线上地址 | https://ai-memory.net （www 同样可用） |
| 访问统计看板 | **https://ai-memory.net/stats/** |
| 看板账号 | 用户名 `mnemosyne`，密码在服务器 `/root/.ai-memory-net-stats.txt`（`sudo cat` 查看） |
| 服务器 | `hjk@35.227.140.175`（GCP，美国机房） |
| SSH 私钥 | `C:\Users\hjk\.ssh\mnemosyne_gcp`（sudo 免密） |
| 网关（保留） | https://35.227.140.175.sslip.io → 反代 `127.0.0.1:8788` |
| 域名注册 | 阿里云，A 记录 `@` + `www` → `35.227.140.175` |
| 备案 | **不需要**（境外服务器） |

---

## 3. 拓扑

```
用户浏览器
   │  https://ai-memory.net
   ▼
[GCP 35.227.140.175]
   ├── Caddy v2.11.4  (/etc/caddy/Caddyfile)
   │     ├── ai-memory.net, www.ai-memory.net
   │     │     ├── /stats/*  → basic_auth → /var/www/ai-memory-stats/   (统计看板)
   │     │     └── /*        → /var/www/ai-memory/                      (落地页)
   │     │     └── log       → /var/log/caddy/access.log (JSON, 自动轮转)
   │     └── 35.227.140.175.sslip.io → reverse_proxy 127.0.0.1:8788     (Mnemosyne 网关)
   └── cron (/etc/cron.d/ai-memory-stats) 每 5 分钟 → /usr/local/bin/stats-gen.py
```

---

## 4. 文件清单

### 本地 `C:\AI_Workspace\13_Web\`（部署源）

| 文件 | 作用 |
|---|---|
| `index.html` | ★ 页面本体（单文件，含内联 CSS/JS）。**要改页面就改它** |
| `DEPLOY.md` | 本文件 |
| `deploy.py` | **一键部署**：推送 + 本地化 + 生成看板 + 实测 |
| `harden_caddy.py` | 幂等：把 `@blocked` 拦截搬进 handle 块内部 + 补 CSP。**动过 Caddyfile 的拦截规则后重跑一次** |
| `localize_assets.py` | 抓 CDN 资源成本地（在服务器上跑，只有它能连 CDN） |
| `html_localize.py` | 把 index.html 的外部引用改成本地路径 |
| `setup_access_stats.py` | 一次性：配 /stats/ 路由 + basic_auth + cron |
| `stats-gen.py` | 生成统计看板 HTML（纯 Python，自包含） |
| `investigate_access.py` | 排查日志用（逐条明细 + 多维汇总） |
| `add_access_log.py` | 历史脚本：最初单独加访问日志（已被 setup_access_stats.py 取代，留档） |

### 服务器

| 路径 | 说明 |
|---|---|
| `/var/www/ai-memory/` | 站点根（属主 `caddy:caddy`） |
| `/opt/mnemosyne-site/index.html.orig` | **未本地化**的原始页面（本地化的输入）。**必须在 web 根之外** —— 放进 web 根等于把未本地化版本挂到公网上；只靠 Caddy 正则兜底是不够的，那条规则曾因指令优先级失效过一次（见下） |
| `/var/www/ai-memory/assets/` | 本地化的 JS/CSS/字体 |
| `/var/www/ai-memory-stats/index.html` | 统计看板（cron 每 5 分钟重生成） |
| `/etc/caddy/Caddyfile` | Caddy 配置（每次改动都自动备份为 `Caddyfile.bak-<时间戳>`） |
| `/var/log/caddy/access.log` | 访问日志（JSON；10MiB 轮转、留 5 个、最长 30 天） |
| `/root/.ai-memory-net-stats.txt` | 看板账号密码（0600） |
| `/usr/local/bin/stats-gen.py` | 看板生成器 |
| `/etc/cron.d/ai-memory-stats` | 每 5 分钟刷新看板 |
| `~/localize_assets.py`、`~/html_localize.py`、`~/investigate_access.py` | 服务器侧脚本副本 |

---

## 5. 日常任务：更新网页

### 5.1 最简单（推荐）

```bash
python "C:\AI_Workspace\13_Web\deploy.py"
```

它会：推送页面与脚本 → 服务器上重新本地化 → 重新生成本地化页面 → 刷新看板 → 实测并打印结果。

### 5.2 只更新页面内容（不想重跑本地化）

```bash
python "C:\AI_Workspace\13_Web\deploy.py" --page-only
```

### 5.3 手工三步（等价于 deploy.py）

```bash
# ① 传页面
scp -i C:\Users\hjk\.ssh\mnemosyne_gcp C:\AI_Workspace\13_Web\index.html hjk@35.227.140.175:/tmp/
# ② 服务器上：设为原始备份 + 重新本地化
ssh -i C:\Users\hjk\.ssh\mnemosyne_gcp hjk@35.227.140.175
  sudo cp /tmp/index.html /var/www/ai-memory/index.html.orig
  sudo python3 ~/localize_assets.py      # 抓 CDN 资源（含字体）
  sudo python3 ~/html_localize.py        # 生成本地化页面
  sudo chown -R caddy:caddy /var/www/ai-memory
  sudo python3 /usr/local/bin/stats-gen.py   # 顺带刷新看板
# ③ 验证
curl -sk --resolve ai-memory.net:443:127.0.0.1 https://ai-memory.net/ -o /dev/null -w '%{http_code}\n'
```

> **不需要** reload Caddy —— 站点是静态文件，改了立即生效。
> 只有改 `/etc/caddy/Caddyfile` 时才 `sudo systemctl reload caddy`。

> ⚠️ **改 Caddyfile 的拦截规则前必读**：Caddy 的指令有固定优先级，
> **`handle` 排在 `respond` 之前**。拦截规则（`@blocked` + `respond 404`）必须写在
> catch-all `handle { }` **块内**、且在 `file_server` 之前；写在块外会被那个
> catch-all 的 `file_server` 抢先执行，规则**等于没写**。
> `/index.html.orig` 就是这样在公网上挂了很久。
> 验证时**要拿一个真实存在的备份文件名去试** —— 用不存在的文件名试只会得到
> file_server 的 404，那个 404 什么也没证明（`.bak` 的假象正是这么来的）。

---

## 6. 访问统计

### 6.1 在哪看

浏览器打开 **https://ai-memory.net/stats/**，用 `mnemosyne` + 密码登录（密码见 §2）。
页面**每 60 秒自动刷新**，数据由 cron 每 5 分钟重算。

看板包含：请求总数 / 页面 PV / 独立访客 UV / 真人访客 / 爬虫 / 传输量 / 404 次数、
访问趋势（每 10 分钟）、页面排行、状态码、Host 分布、**访客明细（IP + 浏览器 + 系统 + 在线时段）**、
浏览器分布、404 明细、来源 Referer、最近 80 条请求。

### 6.2 改密码 / 加账号

编辑 `setup_access_stats.py` 里的 `USERNAME`，或在服务器上直接改 Caddyfile：

```bash
sudo caddy hash-password --plaintext '新密码'        # 拿到 bcrypt 串
sudo nano /etc/caddy/Caddyfile                      # 替换 basic_auth 里的账号行
sudo systemctl reload caddy
```

> 想加多个账号，就在 `basic_auth { }` 里写多行 `用户名 哈希`。

### 6.3 命令行查（不想开浏览器时）

```bash
ssh -i C:\Users\hjk\.ssh\mnemosyne_gcp hjk@35.227.140.175
  sudo python3 ~/investigate_access.py        # 全量明细 + 多维汇总
  sudo tail -50 /var/log/caddy/access.log     # 原始日志
```

---

## 7. 一次性初始化记录（已做完，勿重复执行）

| 步骤 | 做了什么 | 回滚 |
|---|---|---|
| 域名 | 阿里云实名 + **过户**已完成；A 记录 `@`/`www` → `35.227.140.175`；`clientHold` 已解除（RDAP = `active`） | — |
| 证书 | Caddy 自动签发 Let's Encrypt（`ai-memory.net` + `www.ai-memory.net`），验证 `ssl_verify=0` | — |
| 站点 | `13_Web/index.html` → `/var/www/ai-memory`，Caddy `file_server` | — |
| CDN 本地化 | tailwind / lucide / mona / inter / dmm / 云SDK + 8 个字体文件 | 重新跑 `localize_assets.py` |
| 访问日志 | Caddy `log` → `/var/log/caddy/access.log`（JSON） | `sudo cp /etc/caddy/Caddyfile.bak-<ts> /etc/caddy/Caddyfile && sudo systemctl reload caddy` |
| 统计看板 | `/stats/` + `basic_auth` + cron 每 5 分钟 | 同上 |
| 主题 | 页面默认**浅色**（`data-theme="light"`，`mn-theme` 缺省 `light`） | 改回 `index.html` 即可 |

---

## 8. 排障手册（都是真金白银踩过的）

### 8.1 域名打不开

`clientHold` → DNS 不解析 → Let's Encrypt 报 `NXDOMAIN` → 签不出证书 → HTTPS 失败。
**这是一条因果链，不是四个问题。**
- 看状态：`RDAP`（`https://rdap.verisign.com/net/v1/domain/ai-memory.net`）
- **看根因**：阿里云控制台。RDAP 只能看到 `client hold`，**看不出为什么**——
  实测那次是「信息模板已实名、但域名未绑定模板」，解法是**过户**，不是等审核。

### 8.2 中文页面打开是空白（国内）

CDN 被墙 → Tailwind 加载失败 → 样式全丢。**必须本地化**。
每次跑完 `localize_assets.py` + `html_localize.py`，核对"残留外部资源"只剩点击跳转类。

### 8.3 字体 404（`/assets/fonts/xxx.woff2` 404）

**根因**：`.woff` 是 `.woff2` 的**前缀子串**。用 `for url in urls: css.replace(url, new)`
逐个替换时，先替换 `.woff` 会把 `.woff2` 的前缀也改掉，于是 CSS 引用了一个不存在的文件。
**必须用单次 `re.sub` + 回调**（已在 `localize_assets.py` 修好）。
> 判别方法：日志里 `.woff` 200 而 `.woff2` 404，且两者**哈希前缀相同**。

### 8.4 看板 404（认证通过却打不到文件）

`handle` **不剥路径前缀**：`root /var/www/ai-memory-stats` + 请求 `/stats/` →
实际去找 `/var/www/ai-memory-stats/stats/index.html`。
**必须用 `handle_path /stats/*`**（会剥掉 `/stats`）。

### 8.5 `caddy reload` 失败：`permission denied`（日志文件）

Caddy 以 `caddy` 用户跑，但 `sudo caddy validate` 会以 **root 身份创建日志文件**（0600）。
之后 reload 就打不开它。
```bash
sudo rm -f /var/log/caddy/access.log
sudo chown caddy:caddy /var/log/caddy && sudo chmod 755 /var/log/caddy
sudo systemctl reload caddy
```
> **教训**：不要用 `sudo caddy validate`。配置对不对，`reload` 自己会校验，
> 失败时会保留旧配置（安全）。

### 8.6 登录页出现一个占满屏幕的巨大 `<` 箭头

CSS 里 `.back` 规则被写成了 `.pv-hero .back`（作用域限定），
而登录页的 `.back` 不在 `.pv-hero` 里 → 规则不生效 → SVG 退化成默认尺寸（实测 1463px）。
**修法**：`.back` 规则必须是**无前缀**的（现版本已修）。

### 8.7 `pkill -f http.server` 把 ssh 会话自己杀了

命令行字符串里含 `http.server`，被 `-f` 匹配到 → 自杀，表现为**无输出 + exit 127**。
**写法**：`pkill -f '[h]ttp.server'`。

### 8.8 本机 bash 残缺

Windows 这个 shell **没有 `mkdir`/`sleep`/`head`**，也不支持把命令存进变量
（`SSH="...ssh.exe ..."` 再 `"$SSH" host cmd` 会分词失败）。
**一律写完整路径**，或用 Python 脚本代替（本目录的脚本就是这么来的）。

### 8.9 用 `python -c "..."` 写含反引号的内容

bash 双引号内的反引号会**先被命令替换**，内容静默消失。
写 Markdown/含反引号内容：用 `<<'PYEOF'` heredoc 或 Write 工具。

---

## 9. 已知问题 / 待办

- [ ] `/robots.txt` 404（爬虫探测）。可放一份 robots.txt 减少扫描噪音。
- [ ] `/assets/lucide.js.map`、`/assets/index.global.js.map` 404（sourcemap 未下载，无害）。
- [ ] 看板无 GeoIP（未装国家库），只显示 IP，不显示归属地。
- [ ] 访问日志自 **2026-09-21 23:49** 起才存在；此前访问无法追溯。
- [ ] `add_access_log.py` 已被 `setup_access_stats.py` 取代，可删。

---

## 10. 硬性约束（改这个站时必须遵守）

1. **`13_Web` 是唯一部署源**，服务器脚本从这里推。
2. **`index.html` 是页面本体**，改动必须经 `html_localize.py` 再上线，
   否则外部 CDN 引用会漏回页面（国内会白屏）。
3. **不要动 sslip.io 那块 Caddy 配置** —— 它挂着 Mnemosyne 网关。
4. 改 `/etc/caddy/Caddyfile` 前先备份，改完 `reload` 后**实测**主站 + 看板 + 网关三处。
5. `sync-ui.py` 那条链（18788 网关首页）与本目录**互不影响**，别搞混。

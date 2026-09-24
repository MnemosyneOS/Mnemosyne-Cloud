# 安全加固与完善 — 执行记录（2026-09-24）

> 输入：`# Mnemosyne OS 完善与安全加固总清单`（依据 2026-09-21 23:49 至 2026-09-24 02:21 的 Caddy 访问日志）
> 本文回答三件事：**哪些已经做完并验证过**、**哪些必须在服务器上做（附可直接执行的命令）**、
> **清单里哪几处需要修正**。
> 原则不变：先止血、再优化、后增长；安全默认拒绝，性能默认缓存，统计默认去噪。

---

## 0. 先修正清单里的一处前提

清单第 1.1 节整节建立在「在 Cloudflare WAF 里加规则」之上。**本站目前不在 Cloudflare 后面**：
DNS 走阿里云万网，A 记录直接指向 GCP `35.227.140.175`，Caddy 直接对外。

这不是疏漏 —— `docs/cloudflare-migration-decision.md`（2026-09-22）已经判定过：全面迁移不可行
（Workers 免费版 10ms CPU 跑不动 PBKDF2 20 万轮、无持久磁盘），而且免费版**不含中国大陆节点**
（China Network 要 Enterprise + 单独订阅 + ICP 备案）。

**这一点对本站尤其关键**：整站之所以把所有 CDN 资源本地化（`localize_assets.py`），就是因为
国内直连外部 CDN 会白屏（DEPLOY.md §8.2）。把 Cloudflare 拉到前面，等于把刚拆掉的境外依赖
重新装回去，而这是面向中文用户的门面。

所以下面分两条路：

| 路径 | 现在能不能做 | 建议 |
|---|---|---|
| **A. 源站加固** | 能，今天就能 | **先做这个。** 清单 1.1 里真正要的"挡住扫描路径、限流、封恶意 UA"，源站侧都能实现 |
| **B. 前面挂 Cloudflare** | 技术上能，但要评估国内访问 | 表达式已备好（`deploy/cloudflare-waf-expressions.txt`），**动手前先读 §3 的前置条件** |

---

## 1. 已在仓库里完成（可复核）

改动都落在 `13_Web`（唯一部署源），每项都能用命令复现。

### 1.1 版本与内容同步（Mnemosyne OS 8.0.0）

| 项 | 结果 |
|---|---|
| 版本号 | 7.0.2 → **8.0.0**（发布日期 2026-09-22），更新记录页保留 7.0.0/7.0.1/7.0.2 历史条目 |
| 仓库地址 | `FrankHu-HK/mnemosyne` → **`MnemosyneOS/mnemosyne`**（原地址 301 转移，仓库 ID 1329669219 未变） |
| MCP 工具数 | 20 → **31**（20 原生 + 11 客户端兼容）—— 真起 MCP 服务发 `tools/list` 数出来的，不是照抄 README |
| 胶囊命名 | `MIB` → **`AIC`**（上游官方名 Adaptive Information Capsule，从来不存在 MIB 这个说法） |
| 性能数字 | 不再钉死「7.0.2 构建」，改标为本项目基准报告 |
| 通知栏 | 「8.0.0 · 于北京时间 2026 年 9 月 24 日正式上线。截至同日，全网总下载量 12 万+，总调用量 430 万+ 次。」 |
| 页头 GitHub 组件 | 移除星数，图标改为 GitHub 黑猫（与抽屉菜单里的图标统一） |

校验：`python deploy/pending-8.0.0/verify.py --root .` → **25 项断言全通过**；
拿覆盖前的旧页面跑反向测试会失败 13 项，证明校验器本身有效（不是恒真）。

### 1.2 SEO 与可发现性（清单 2.2）

清单说 `favicon.ico` / `robots.txt` / `sitemap.xml` 缺失、合计 404 98 次。现在都有了：

| 文件 | 说明 |
|---|---|
| `robots.txt` | 放行首页与文档，禁 `/api/`、`/stats/`、`/admin/`、`/auth/`；AI 爬虫**显式具名**（GPTBot / ClaudeBot / CCBot 等）而不是靠通配符默许；社交预览机器人单独放行（不放行的话分享卡片会退化成裸链接） |
| `sitemap.xml` | 只列两个真实 URL。**内页路由在 `#` 片段里**（`#/docs` 等），片段不会发给服务器，因此**不是可收录 URL**，列进去是错的 |
| `llms.txt` | 按 llmstxt.org 规范：是什么、31 工具、72 个可选 provider（LLM 20 / 嵌入 13 / 向量库 28 / 重排 5 / 图存储 6）、四项基准分、安装方式、安全联系方式 |
| `.well-known/security.txt` | RFC 9116。之前 netcup 的扫描器就在找它（419 前 19 次请求里有 atom.xml / nodeinfo / security.txt / trust.txt） |
| `favicon.ico` | 手工拼的 ICO 容器，含 16/32/48 三档（Pillow 的 `sizes=` 实测只写出 16px 一档，所以自己写容器） |
| `favicon.svg` / `favicon-32.png` / `apple-touch-icon.png` | 与页头品牌标同一套节点坐标，不是另画一个近似图形 |
| `og-image.png` | 1200×630 社交卡片。之前页面只有 `og:title`/`og:description`，**没有 `og:image`**，分享出去是没有图的 |

页头同时补齐了：`canonical`、`og:url/type/site_name/image`、`twitter:card`、
`robots` meta，以及三段 JSON-LD（Organization / WebSite / SoftwareApplication，
`softwareVersion: 8.0.0`）。

### 1.3 隐私与合规（清单 1.7）

新增 **`legal.html`**，一个真实可收录的 URL（不是 `#/legal` 片段路由）。

为什么不用片段路由：GitHub OAuth 应用审核、各类目录收录、以及任何需要"给我一个隐私政策链接"
的场合，片段 URL 都不成立；爬虫也看不见。

内容按实际实现写，不是模板套话：

- **隐私政策** —— 区分静态站与托管控制台；明确列出**账号存了什么**（用于认证的邮箱、密码哈希、
  头像、API 密钥、你保存的记忆）；密码是 PBKDF2-SHA256 / 20 万轮 / 每账号随机盐，**不可还原**；
  诚实披露 WorkBuddy Cloud SDK 是第三方组件且**仅在它自己的发布域名上生效**；服务器在 Google
  Cloud 美国区域，因此托管控制台涉及跨境传输；并说明引擎本身本地优先、自己跑就没有这个问题。
- **日志与保留** —— 记录哪些字段、10 MiB × 5 份轮转、**超过 30 天不留**、用途只有两项（看板汇总与
  安全），且明确 `Authorization` / `Cookie` / `Set-Cookie` / 请求体**永不写入日志**。
- **Cookie 与本地存储** —— 没有跟踪 Cookie；唯一会话 Cookie `mn_sid` 是 HttpOnly + SameSite=Lax +
  Secure，30 天不活动失效；`/stats/` 用的是浏览器内置 Basic 认证；localStorage 只有 `mn-theme`
  与 `mn-lang` 两个偏好键。
- **你的权利** —— 查阅/可携带/更正/删除/反对，以及投诉渠道。
- **服务条款** —— MIT 管代码、本页管站点；账号个人所有；无 SLA；限流可能收紧；准据法为
  中华人民共和国法律、广东法院管辖。
- **可接受使用** —— 明确禁止未打招呼的自动化扫描/压测，并给出私下报告安全问题的渠道。

中英双语同页，语言与主题跟主站共用 `mn-lang` / `mn-theme` 两个 localStorage 键，
所以从首页切过去不会重置偏好。无外链字体、无 CDN、无脚本依赖第三方 —— 断网也完整渲染。

### 1.4 Caddy 加固（清单 1.2）

`deploy/harden_caddy.py` 已扩展，幂等，五件事：

| # | 内容 |
|---|---|
| 1 | `@blocked` 拦截规则搬进 catch-all `handle` 块内、`file_server` 之前（**原规则因为写在块外而完全失效**，`/index.html.orig` 在公网上挂了很久） |
| 2 | 拦截清单加宽：`wp-*`、`xmlrpc.php`、`phpinfo`、`phpMyAdmin`、`pma`、`adminer`、`config.php`、`docker-compose`、`Dockerfile`、`server.py`、`requirements.txt`、`backup`、`database`、`node_modules`、`vendor`、`.aws`、`.ssh`、`.svn`、`.hg`、`.vscode`、`.idea` |
| 3 | 静态站点块加方法白名单：只允许 `GET HEAD OPTIONS`，其余 405（`/api/*`、`/auth/*` 走各自 handle，不受影响） |
| 4 | `/api/*` 加 `request_body` 上限 10MB；`/auth/*` 与 `/api/*` 的反代加传输超时 |
| 5 | 补齐响应头：HSTS、`X-Content-Type-Options`、`X-Frame-Options`、`Referrer-Policy`、`Permissions-Policy`、COOP、CORP（CSP 由原逻辑负责） |

两个刻意的取舍，都写进脚本注释了：

- **`read_timeout` 取 120s，不是"看起来更安全"的 30s。** `server.py` 里 `llm_chat` 的超时是 75 秒，
  反代超时必须大于它，否则 Copilot 的长回答会被 Caddy 先掐断。这是这一项最容易踩的坑。
- **拦截图不碰 `.txt` / `.xml` / `.ico` / `.png` / `.svg` / `.html`。** `robots.txt`、`sitemap.xml`、
  `llms.txt`、`security.txt`、favicon、`legal.html` 全在这几类里，拦错了等于把自家门面锁上。

**这个脚本我在这台机器上用仿真 Caddyfile 跑了 69 项断言**（`_work/test_harden_caddy.py`）：
插入位置、清单扩展、误伤检查（拿 17 条真实路径跑正则，该拦的拦、该放的放）、幂等性
（连跑两遍结果完全一致、不产生第二份备份）、以及认不出的配置**一个字都不改**。

### 1.5 统计去噪（清单 2.3）

`stats/stats-gen.py` 的口径修好了。原来「页面访问 PV」把接口调用和 404 都算进去了：

| 指标 | 旧口径 | 新口径 |
|---|---|---|
| 页面访问 PV | 640，其中 286 次其实是 `/api/*`、还有 90 次 404 | **网页请求且状态码 < 400**，排除静态资源与 `/api/*` |
| 接口调用 | 混在 PV 里 | 单独卡片 + 单独排行表 |
| 真人页面 PV | 无 | **新增**。要做转化率的用这张，别用上面那张 |
| 敏感路径探测 | 无 | **新增**。按路径统计 + 状态码分布，**出现 200 就说明拦截规则失效了** |
| 内网判定 | `172.` 前缀 —— 会把 172.0~172.15 的公网地址也当内网 | 只认 RFC 1918 的 `172.16.0.0/12` |
| 爬虫识别 | 通用关键字 | 补上真实出现过的：`sqlmap`、`nuclei`、`wpscan`、`cve-20*`、`Pandalytics`、`DomainOpportunityRadar`、`CheckMarkNetwork`，以及 AI 爬虫（GPTBot / ClaudeBot / PerplexityBot / Bytespider …） |

拿一份 14 条的合成日志实测，各项计数与预期完全一致（PV 7 / 真人页面 PV 3 / 接口 2 /
敏感路径 3 / 外部请求 12 / 爬虫 5），并且验证了 `172.20.x` 判为内网、`172.5.x` 判为公网。

### 1.6 部署脚本（清单"上传更新内容"）

`deploy/deploy.py` 之前**只推 `index.html` 与几个脚本**，新加的静态文件不会被推上去 —— 线上会
静默 404。已扩展：

- 新增 `STATIC_FILES` 清单（10 个文件），逐个 `scp` 后在服务器上用 `install -o caddy -g caddy -m 644`
  落到 web 根（顺手把属主权限定死，不用等最后 `chown -R`）
- 部署后实测新增：10 个 SEO/合规文件逐个报状态码、7 个安全响应头、5 条扫描路径应为 404
- 修正了「页面渲染依赖残留外链」那一项的误报：`<link rel="canonical">` 指向本站是绝对地址，
  不是外部渲染依赖，原脚本会永远显示 1

---

## 2. 必须在服务器上做（附命令）

> 前置：`ssh -i C:\Users\hjk\.ssh\mnemosyne_gcp hjk@35.227.140.175`
> 改 Caddyfile 前先备份、改完 reload 后**实测主站 + 看板 + 网关三处**（DEPLOY.md §10 第 4 条）。

### 2.1 打 Caddy 补丁

```bash
# 先在本地把补丁推上去
python "C:\AI_Workspace\13_Web\deploy\deploy.py"

# 服务器上
sudo python3 ~/harden_caddy.py
```

脚本自己会备份成 `Caddyfile.bak-<时间戳>`、`caddy fmt` 整理格式、`systemctl reload caddy`，
失败则自动回滚。**它刻意不调用 `caddy validate`** —— 那个命令会以 root 身份创建日志文件（0600），
之后 reload 就打不开它（DEPLOY.md §8.5 记过这次事故）。

打完立刻验：

```bash
B=https://ai-memory.net
C="curl -s -o /dev/null -w %{http_code} --resolve ai-memory.net:443:127.0.0.1 -k"
echo "主站        $(${C} $B/)                       # 200"
echo ".env        $(${C} $B/.env)                    # 404（加固前可能 200）"
echo "index.html.orig $(${C} $B/index.html.orig)     # 404"
echo "robots.txt  $(${C} $B/robots.txt)              # 200"
echo "看板        $(${C} $B/stats/)                  # 401"
curl -sI -k --resolve ai-memory.net:443:127.0.0.1 $B/ | grep -i strict-transport   # 要有 HSTS
echo "网关        $(curl -s -o /dev/null -w '%{http_code}' https://35.227.140.175.sslip.io/)"
# 再登录一次控制台，让 Copilot 说一段长回答 —— 确认没被 120s 超时截断
```

### 2.2 fail2ban：用现成的日志自动封禁（清单 1.5）

清单要「单 IP 404 > 50 次/分钟自动封禁」。Caddy 本身没有内置限流（要装 `caddy-ratelimit` 插件），
但**不需要插件**：Caddy 已经把 JSON 访问日志写好了，fail2ban 读它就行。

```bash
sudo apt install -y fail2ban

# /etc/fail2ban/filter.d/caddy-scanner.conf
sudo tee /etc/fail2ban/filter.d/caddy-scanner.conf >/dev/null <<'EOF'
[Definition]
failregex = ^.*"remote_ip":"<HOST>".*"uri":"/(\.env|\.git|\.aws|\.ssh|wp-|xmlrpc\.php|phpinfo|phpmyadmin|adminer|config\.php|docker-compose|Dockerfile|server\.py|backup|database).*"$
ignoreregex =
EOF

# /etc/fail2ban/jail.d/caddy.conf
sudo tee /etc/fail2ban/jail.d/caddy.conf >/dev/null <<'EOF'
[caddy-scanner]
enabled  = true
port     = http,https
filter   = caddy-scanner
logpath  = /var/log/caddy/access.log
maxretry = 20
findtime = 600
bantime  = 86400
EOF

sudo systemctl restart fail2ban
sudo fail2ban-client status caddy-scanner
```

> `logpath` 指向的是 Caddy 当前那个文件。轮转后的 `.gz` fail2ban 不会回溯，够用 ——
> 扫描器是持续行为，封的是"现在正在扫的那个"。

### 2.3 防火墙与 SSH（清单 1.4）

```bash
sudo ufw default deny incoming
sudo ufw default allow outgoing
sudo ufw allow 22/tcp
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw enable && sudo ufw status verbose

# 密钥登录，禁密码、禁 root
sudo sed -i 's/^#\?PermitRootLogin.*/PermitRootLogin no/'                 /etc/ssh/sshd_config
sudo sed -i 's/^#\?PasswordAuthentication.*/PasswordAuthentication no/'   /etc/ssh/sshd_config
sudo sed -i 's/^#\?PubkeyAuthentication.*/PubkeyAuthentication yes/'      /etc/ssh/sshd_config
sudo sshd -t && sudo systemctl reload ssh
```

> **先确认你的公钥已经能登录，再关密码认证** —— 顺序反了会把自己关在门外。

### 2.4 密钥轮换（清单 1.4，做不了就说明白）

这些只能你本人操作，我列清单但不代劳：

- [ ] SMTP 授权码；- [ ] LLM API Key；- [ ] GitHub OAuth Client Secret；- [ ] 看板 Basic 认证口令
- [ ] **确认 `.env` / `oauth.config.json` 从未进过 Git**：`git log --all --full-history -- '*.env' 'oauth.config.json'`
- [ ] `oauth.config.json` 已在 Caddy 的拦截图里（`.json$`），但**它本来就不该在 web 根**，确认它在 `/opt/` 之类的位置

### 2.5 备份与监控（清单 1.5 / 1.6）

```bash
# 每日备份：站点 + 账号数据（server.py 的 .data/）+ 日志
sudo tee /etc/cron.daily/ai-memory-backup >/dev/null <<'EOF'
#!/bin/sh
set -e
T=$(date +%Y%m%d)
D=/var/backups/ai-memory
mkdir -p "$D"
tar czf "$D/site-$T.tgz" -C /var/www ai-memory
tar czf "$D/data-$T.tgz" -C /opt/mnemosyne-site .data 2>/dev/null || true
[ -d /var/log/caddy ] && tar czf "$D/logs-$T.tgz" -C /var/log caddy 2>/dev/null || true
find "$D" -type f -mtime +30 -delete
EOF
sudo chmod +x /etc/cron.daily/ai-memory-backup
```

监控口径（清单 1.5 的告警项），可以直接看新看板：
- 5xx 出现即看 —— 看板「状态码」表
- 「敏感路径探测」卡片**出现 200 就是拦截失效**，立刻查 `@blocked` 是否又跑到 handle 块外面去了
- 登录失败 > 20 次/分钟 —— `server.py` 已有 `RATE_RULES['login'] = (12, 60)`，看基线是否被顶到
- 状态页 `status.ai-memory.net` **没做**：它需要另起一个不受主站影响的域名与进程，
  用主站自己监控主站没有意义。建议直接用 Cloudflare/UptimeRobot 之类的外部探活。

---

## 3. 如果要挂 Cloudflare（备选，含前置条件）

规则表达式在 **`deploy/cloudflare-waf-expressions.txt`**（已落盘：4 条自定义规则 + 1 条限流规则）。

**注意它与本文档第一版的描述不一样。** 第一版写的是"按 Cloudflare 的 wirefilter 语法重写，
可以直接粘"，那是错的：

> **Cloudflare 免费版的自定义规则不支持正则。** 官方能力表里 `matches` 运算符只有
> Business 及以上才有（Free、Pro 都是 "Regex support: No"），而自定义规则条数 Free 只有 5 条、
> 限流规则只有 1 条（计数窗口固定 10 秒、只能按 IP 计数）。
> 所以那份文件里的规则全部改用 `eq / contains / in / starts_with() / ends_with() / lower()`
> 实现，**一条正则都没用**；正则版只作为附录留给将来升级到 Business 的情况。

另外两个坑是**实测**发现的（都写进了那份文件的注释）：

- **不能把 Caddy 的 `^/(...)` 锚定 token 翻成 `contains`。** 本站后端有
  `/api/ops/backup-logs` 与 `/api/ops/backup-status` 两个接口，一旦写成 `contains "/backup"`，
  管理后台的备份状态接口会被整条打挂；必须用 `starts_with()` 保持"行首锚定"的语义。
- **不能用 `http.request.uri.path.extension` 拦点文件。** 官方对该字段的定义是"最后一个点之后的
  字符串"，并明确规定"若最后一段以点开头且不含其他点则返回空字符串" —— 也就是说
  `/.env`、`/.DS_Store` 在这里都是 `""`，用扩展名永远拦不住，必须走 `starts_with` / `contains`。

**动手前先回答这三个问题：**

1. **国内访问会不会变差？** 免费版没有中国大陆节点。本站是中文门面，整站本地化就是为了
   不依赖境外 CDN。加了 Cloudflare 之后，国内用户的 TLS 握手与回源都会绕到境外节点。
   **先在测试子域上挂一周，用国内线路实测首字节时间，再决定要不要动主域。**
2. **源站 IP 能不能真正藏住？** 只加规则不换 IP 等于没藏 —— 历史 DNS 记录、证书透明日志
   （crt.sh）里都有 `35.227.140.175`。要藏就得**换 IP + 只放行 Cloudflare 回源段** + 全面开
   代理（橙云）。
3. **Caddy 那套还留不留？** 留。Cloudflare 只挡边缘，绕过它直连源站 IP 依然能到。
   **两层都要有**才能叫纵深防御。

### ⚠️ 挂 Cloudflare 之前必须先改这两处，否则会把站点打挂

Cloudflare 挡在中间会改变"源站眼里的客户端 IP"，而本站有两处依赖这个 IP：

**1. fail2ban 会把 Cloudflare 的边缘 IP 全部封掉 —— 全站直接 1020 不可访问。**

§2.2 给的过滤器读的是 Caddy 日志里的 `remote_ip`，挂上 Cloudflare 之后那是**边缘节点的地址**，
于是 fail2ban 封的是 Cloudflare 自己。分两步修，缺一不可：

① 让 Caddy 相信 Cloudflare 送来的真实 IP。全局块里加（官方文档明确把这个用法列为 Cloudflare 场景）：

```caddyfile
{
	email ops@ai-memory.net
	servers {
		trusted_proxies static <Cloudflare 回源段>
		trusted_proxies_strict
		client_ip_headers CF-Connecting-IP X-Forwarded-For
	}
}
```

- `trusted_proxies_strict` 需要 Caddy v2.8+，本站 v2.11.4 可以用。官方原话是上游代理
  （HAProxy、**Cloudflare**、AWS ALB、CloudFront 等）会把新连接地址追加到 `X-Forwarded-For`
  右侧，建议启用 strict，因为最左边的 IP 可能被客户端伪造。
- `<Cloudflare 回源段>` 不要硬编码，段列表随时会变，用这个取当前值：
  `curl -s https://www.cloudflare.com/ips-v4 https://www.cloudflare.com/ips-v6`
- `client_ip_headers` 把 `CF-Connecting-IP` 放第一位 —— 这个头由 Cloudflare 写入、客户端改不了。

② 把 fail2ban 过滤器从 `"remote_ip":"<HOST>"` 改成 `"client_ip":"<HOST>"`。
   先确认字段真的出现了（`trusted_proxies` 生效后 Caddy 才会往访问日志里加 `client_ip`）：

```bash
tail -1 /var/log/caddy/access.log | python3 -m json.tool | grep -i '"ip'
```

**2. 看板与统计会失真。** 同一个原因，`stats-gen.py` 会先看到一堆边缘 IP。
① 做完之后日志里就是真实 IP 了，这一步顺带修好，但要重跑一次 `stats-gen.py` 并核对卡片数字。

**Caddy 那套拦截不要因为"有 Cloudflare 了"就撤掉** —— 任何人都能拿着 `35.227.140.175` 直连绕过边缘。
要真正藏住源站，得换 IP + 只放行 Cloudflare 回源段 + 全面开橙云代理，那是另一件事。

---

## 4. 验收对照（清单第 5 节）

| 项目 | 验收标准 | 现在状态 |
|---|---|---|
| WAF / 拦截 | 扫描路径返回 403/404，且不进入应用 | Caddy `@blocked` 已加宽并在 handle 块内（**需在服务器执行脚本后实测**）；Cloudflare 版本备好未启用 |
| 方法限制 | 静态站点只接受 GET/HEAD/OPTIONS | 已加（脚本内含） |
| 安全头 | securityheaders.com 评分 A 以上 | 八项头已备齐（含 CSP），**上线后去实测一次** |
| TLS | SSL Labs A+ | Caddy 自动 Let's Encrypt；HSTS 已加。**未实测** A+ |
| 依赖 | 无高危漏洞 | `mnemosyne-os` 核心零第三方依赖；站点侧需自行跑 `pip-audit` / `npm audit` |
| 密钥 | 无硬编码，全部在 Secrets Manager | **未做**，见 §2.4。当前无 Vault/Doppler，属待办 |
| 日志 | 无敏感信息，保留 90 天 | 敏感字段本就不写（已在 privacy 政策里公开承诺）；**保留 30 天，不是 90 天** —— 要改就改 `roll_keep` 与轮转策略，改完同步改 `legal.html` 里的数字 |
| 备份 | 可成功恢复 | 脚本已给（§2.5）。**恢复演练未做** |
| 告警 | 5xx、异常 404、登录失败 5 分钟内通知 | **未做**。看板是 5 分钟一轮的被动展示，不是告警通道 |
| 转化 | 注册转化率可追踪 | 看板已能分开算 PV / 接口调用 / 真人 PV；**漏斗事件埋点未做**（见 §5） |
| 统计去噪 | 排除本机、内网、爬虫 | **已完成并实测** |

---

## 5. 明确没做，以及为什么

| 项 | 原因 |
|---|---|
| **首页 HTML 拆包（644 KB → <100 KB）** | 这是单文件设计（内联 CSS/JS + 中英双语 i18n），拆包等于换架构，不是一次文案改动。而且 644 KB 是**未本地化前的原始文件**大小，线上是本地化后的版本。真要动，先量线上首字节与 LCP，别凭文件大小拍脑袋 |
| **`brain.bundle.js` / `lucide.js` 瘦身** | 那两个是 `buddy-app/`（WorkBuddy 插件）的产物，不在本站的请求路径上。站点的 `lucide.js` 是本地化后的 `assets/` 版本 |
| **CDN + Brotli** | Caddy 默认已开 `encode`（含 zstd/gzip）。**Brotli 需要 Caddy 编译时带 `http.handlers.encode` 的 br 支持**，且本站静态资源已经预压缩过一部分 —— 建议先量传输量再决定，别叠加 |
| **Plausible / Umami 替代自研统计** | 自研统计跑在**你自己服务器上、不向任何第三方发数据**，这比 Plausible 云版更符合本站"零云端"的定位。要换的话建议自托管 Umami —— 但那本身又是个要维护的服务。**当前口径问题已修好，先观察** |
| **转化漏斗埋点** | 需要真实的前端事件（点击注册、完成注册、创建 Key、首次调 `/v1/memories`）。日志侧只能看到结果、看不到"想点却没点"。要做就得在前端加事件上报，**而本站刻意没有第三方统计脚本** —— 这是个产品决策，不是技术欠账 |
| **`docs/` 里旧的 7.0.2 与旧仓库地址** | 那些是**历史存档**（审计报告的对照基准、当时的会话记录）或账号 ID，改写会破坏存档意义 |
| **8 处 HTML 兜底文案与词典的既有漂移** | `hero.l1/l2`、`proof.h2/sub`、`bench.note` 等 8 处改动前就存在不一致，与本次任务无关。要修我可以统一，但会动到无关文案 |

---

## 6. 清单里还需要你拍板的三件事

1. **`mnemosyne.gateway` 在上游不存在。** 站点文档写 `python -m mnemosyne.gateway --port 8788`，
   但 8.0.0 只有 `mnemosyne.webui.mcp_server` / `web_server`，实测 import 报 `ModuleNotFoundError`。
   **如果那是你自己的网关服务就另说** —— 请确认后我再决定改文档还是改站点。
2. **日期口径。** 通知栏按你说的写「北京时间 2026 年 9 月 24 日正式上线」，而 GitHub release
   v8.0.0 的实际发布时间是 2026-09-22 UTC，更新记录条目也写的 22 日。两者差异要不要抹平？
3. **下载量数字。** PyPI 公开数据 `mnemosyne-os` 近一月约 307 次下载。12 万累计如果指"全网多渠道"
   （含 B 站、WorkBuddy 市场等）没问题；若指 PyPI 就比较悬。**这个数字已经写进通知栏和 llms.txt 了**，
   上线前建议再核一次。

---

## 7. 交付方式：为什么一部分文件是"更新包"而不是就地覆盖

不是图省事，是那个 SMB 共享的权限决定的。

**能直接写进共享的（全部是新文件）**

`robots.txt`、`sitemap.xml`、`llms.txt`、`legal.html`、`favicon.ico`、`favicon.svg`、
`favicon-32.png`、`apple-touch-icon.png`、`og-image.png`、`.well-known/security.txt`、
`deploy/cloudflare-waf-expressions.txt`、`docs/hardening-2026-09-24.md`、`deploy/tests/*.py`

这些逐个做过 sha256 核对，本地与 `\\192.168.1.6\d\AI_Workspace\13_Web` 一致。

**写不进去的（5 个"原地修改"的文件）→ 打包在 `deploy/update-2026-09-24/`**

| 文件 | 旧 | 新 |
|---|---|---|
| `index.html` | 660099 B | 671008 B |
| `deploy/harden_caddy.py` | 4570 B | 13623 B |
| `deploy/deploy.py` | 6386 B | 10037 B |
| `deploy/pending-8.0.0/verify.py` | 5002 B | 5262 B |
| `stats/stats-gen.py` | 17736 B | 约 21 KB |

**原因** —— `\\192.168.1.6\d\AI_Workspace\13_Web` 对**已存在的文件**只给了读权限：

| 操作 | 结果 |
|---|---|
| 新建文件（`robots.txt`、`.well-known/security.txt` 等） | ✅ 成功 |
| 覆盖我本次新建的文件 | ✅ 成功 |
| 覆盖共享上原有的 `index.html` / `harden_caddy.py` / `deploy.py` / `stats-gen.py` | ❌ Permission denied |
| 重命名共享上原有的 `index.html`（想腾出路径） | ❌ Permission denied |

**安装**（在拥有 D 盘的那台机器上执行；本机没有 D 盘）：

```bash
cd C:\AI_Workspace\13_Web\deploy\update-2026-09-24
python install.py --dry-run     # 先看计划
python install.py               # 真正安装
```

`install.py` 覆盖前会先把旧版本存到 `deploy/backup-2026-09-24-before-update/`；
备份已存在则不重复备份，所以可以放心重复运行。回滚就是把那个目录里的文件拷回去。

**自检**（五套，合计 341 项断言，本机全部通过）：

```bash
python deploy\pending-8.0.0\verify.py --root .    # 25 项
python deploy\tests\test_harden_caddy.py          # 80 项
python deploy\tests\test_deploy.py                # 30 项
python deploy\tests\test_stats_gen.py             # 74 项
python deploy\tests\test_cloudflare_expr.py       # 132 项
```

测试默认读 `C:\AI_Workspace\13_Web`，换机器时 `set MN_ROOT=C:\AI_Workspace\13_Web`。

### 过程记录：一次"看起来像被回退"的事故

这一轮里一度发现 `13_Web` 的内容变回了旧版本。查下来的结论不是"同步工具作乱"，
而是**共享上从来就没有我的改动**：写共享时新文件（如 `deploy/pending-8.0.0/`）成功了，
覆盖既有文件静默失败；之后从共享往本机拷了一份，就把本机上的就地修改盖回了旧版。
根因还是上面那张权限表。

也顺带记录一次我自己的失误：为验证共享的写权限，我用了一条会把字符追加到文件的探测命令，
结果往共享上的 `deploy/harden_caddy.py` 尾部追加了 2 个字节。发现后立即用完好副本覆盖回去，
并做了 sha256 核对（`06e111011df4802c` / 4570 B，与回退后的原始版本完全一致）。
教训：**拿生产文件当写入权限的探针是错的**，探针要用一次性的临时文件。

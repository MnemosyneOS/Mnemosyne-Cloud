# 信息架构重构：控制台 / 站点管理 / 账号设置（2026-09-22）

按你的划分做的重构：**控制台 = 用户管自己的记忆**、**账号设置 = 用户管自己的账号**、
**站点管理 = 管理员管网站与控制台的唯一入口**。

---

## 一、三个入口现在的职责

| 入口 | 谁用 | 内容 |
|---|---|---|
| **控制台** `#/dashboard/*` | 所有登录用户 | 仪表板、请求、实体、回忆、梦、图谱、内容导出、副驾驶、安装、精选、文档、MCP、更新日志、计费 |
| **账号设置** `#/admin?ctab=account` | 所有登录用户 | 头像、显示名称、公司、备注、密码 |
| **站点管理** `#/admin` | **仅管理员** | 总览、留言与申请、账号安全、**用户**、**管理员**、**站点配置** |

头像下拉菜单：**「站点管理」只对管理员出现**。角色从服务端问回来之前不会画这个入口——
画出来再收回去会闪，而画错了会让成员以为进得去。拿不到角色就按非管理员处理，
反正服务端还会再拦一次。

---

## 二、站点管理新增的两个 tab

### 1. 管理员（新增）

- 列出全部管理员，标出「你」，标出加入时间与备注。
- **添加**：只能从本站出现过的身份里选 —— 已注册的邮箱，或登录过的 GitHub 身份
  （来自 users.json + sessions 里的 GitHub login）。候选列表由服务端生成。
- **移除**：两条规则在服务端强制，不是靠前端藏按钮：

  > **① 不能移除自己** —— `{"error": "self_removal"}`
  > **② 最后一名管理员不能被移除** —— `{"error": "last_admin"}`

  「不能移除自己」是防手滑，「最后一个不能删」是防把站点锁死。

### 2. 站点配置（新增）

把原来散在控制台里的管理项集中到这里：**一般**（项目名/描述）、**模型**（大模型接入）、
**邮件**（SMTP 发信）、**危险区域**。

实现上复用了控制台的 `dx` 组件的 HTML，包一层 `<div class="dx">` 让主题变量生效；
点击处理本来挂在 `document` 上，所以只把「必须 `body.dash`」这个前置判断放宽成
「在 `.dx` 容器内也行」——不重写表单。

---

## 三、控制台移除的项

| 移除 | 去哪了 |
|---|---|
| API 密钥 | 站点管理 → 站点配置（管理员功能） |
| 网络钩子 | 站点管理 → 站点配置 |
| 设置（一般/模型/邮件/成员/危险区域） | 站点管理 |
| 个人资料 | 账号设置的职责（头像/资料/密码） |

`#/dashboard/keys`、`/webhooks`、`/settings` 这些**老书签会被兜回仪表板**，
不再渲染一个已经没有入口的页面。

---

## 四、成员进控制台看到什么

**本站目前跑的是同一份记忆库，没有多租户。** 所以成员进控制台时：

- 导航是完整的（那是他们将来的界面）；
- 数据页（仪表板/回忆/图谱/…）显示一个**如实的空状态**：
  「本站目前运行在单一记忆库上，管理员的记忆不会展示给你。等你的空间开通后……」
- **不发起那些必然被拒的请求** —— 与其换回一屏 403 报错，不如直说。

静态页（安装、精选、文档、MCP、更新日志、计费）照常渲染，它们不读记忆数据。

> **要真正让控制台成为"用户管理自己记忆"的界面，需要记忆库支持按用户隔离**
> （Mnemosyne 侧有 project / namespace 概念，可用于此）。这是下一步的工作，
> 完成后把 `dxMemberEmpty()` 换成真实接口即可，前端结构不用再动。

---

## 五、验证与一次失误（如实记录）

**接口实测**（临时账号，用完即删）：

| 动作 | 结果 |
|---|---|
| `GET /api/admin/admins` | 200，返回名册（含 display_name / note / since） |
| `POST` remove **自己** | **400 `self_removal`** ✓ |
| `POST` add 一个不存在的账号 | **400 `bad_id`** ✓ |
| `POST` remove 其他管理员 | 200 —— **但这里出事了** |

「移除其他管理员」那一步用的是**真实存在的** `gh:FrankHu-HK`，于是它真的被删了 ——
验证脚本不该拿真数据去测删除路径。发现后立刻按原 `at` 与 `note` 原值恢复了：

```
gh:FrankHu-HK   | first claim from the console   (at 1790014289.458168)
hu_jingkun@qq.com | site owner (email identity)  (at 1790018240.6664562)
```

**影响范围**：约两分钟内，你用 GitHub 登录会失去管理员身份（邮箱身份不受影响）。
现已还原，两个身份都在。

**前端**：线上页面 DOM 729,182 字节，`免费开始` 正常渲染，**零 JS 错误、零 CSP 违规**。

---

## 六、附带修掉的两个部署问题

1. **`deploy.py` 的 `sha256sum` 缺 sudo** —— `.orig` 移出 web 根后只有 caddy 可读，
   普通用户跑 `sha256sum` 会失败，而 `set -e` 会让整条部署脚本中断
   （表现为"页面没更新"，实际是脚本提前退出）。
2. **`html_localize.py` 把页脚的 sslip.io 链接误判成渲染依赖** —— 它返回 rc=2，
   同样会让后续的 `chown` 不执行。已把 `sslip.io` 加进点击跳转白名单。
   > 一个**误报**比漏报更容易被忽视：它让部署"看起来失败了"，而真实原因是检查规则太窄。

---

## 七、回滚

| 文件 | 备份 |
|---|---|
| `server.py`（线上） | `/opt/mnemosyne-site/server.py.prev-siteadmin-1700` |
| 本地 `index.html` / `server.py` | `*.prev-mail-20260922-162723` |
| `Caddyfile` | `/etc/caddy/Caddyfile.bak-*` |

```bash
sudo cp /opt/mnemosyne-site/server.py.prev-siteadmin-1700 /opt/mnemosyne-site/server.py
sudo systemctl restart mnemosyne-site
```

---

## 八、站点配置的布局修复（同日追加）

**症状**：管理员角色下「站点管理 → 站点配置」错行，观感差。

**根因**：`.dx` 这个容器是**为控制台的整页布局写的**：

```css
.dx { min-height:100vh; background:var(--d-bg); display:flex; }
```

我把 4 个「整页级」组件（`dxSetGeneral` / `dxSetModel` / `dxSetMail` / `dxSetDanger`）
直接拼进一个 `<div class="dx">`，它们就成了 **flex 容器的直接子元素 → 被横向排列**
（这就是错行），外加 `min-height:100vh` 撑出一屏空白。
那几个组件的大标题又是 `dx-h1`（19px 的页面级标题），四份摞在一起层级混乱。

**修法**：只在 `.site-cfg` 作用域内关掉 `.dx` 的整页行为：

```css
.site-cfg { display:block; min-height:auto; background:transparent; }
.site-cfg .site-sec { background:var(--d-panel); border:1px solid var(--d-line);
  border-radius:12px; padding:18px 20px; margin-bottom:14px; }
.site-cfg .dx-hrow .dx-h1 { font-size:16px; font-weight:600; }
.site-cfg .dx-grid { grid-template-columns:repeat(auto-fit, minmax(220px, 1fr)); }
```

HTML 侧把每个组件包进 `<section class="site-sec">`，去掉多余的 `dx-dsep`。

最后一条规则的特异性高于 `.dx-k2 / .dx-g3 / .dx-k4`，所以**一条就能覆盖所有网格变体**，
窄容器里自动落到单列 —— 不再错行。

**保存逻辑一行没重写**：动作仍由控制台的 document 级处理器执行（上一节加的 `.dx` 容器放行），
元素 ID（`#dx-set-name`、`#dx-llm-*`、`#dx-smtp-*`）与动作名（`set-save` / `llm-save` / `smtp-save`）
完全复用。

**验证**：

- 布局预览：`docs/site-config-preview.html`（同一份样式表 + 同样的 DOM 结构）+ `.png` 截图
- 配置读写端到端（临时探针账号，用完即删）：
  `GET settings` → `POST` 保存 → 再次 `GET` **确认写入落盘** → 恢复原值；`llm` / `smtp` 读取正常


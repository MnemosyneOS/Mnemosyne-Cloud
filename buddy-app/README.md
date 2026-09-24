# buddy-app — 把站点接入 WorkBuddy 开放平台（Buddy 应用）

目标：在 **https://open.workbuddy.cn/buddy-app/config** 下，以主体
**`ent_kzvvtsvd`（广东鑫室铭实业有限公司）** 创建并发布一个 Buddy 应用，
让 `mnemosyne-os.app.workbuddy.host` 这个站点成为它的授权应用。

---

## ⚠️ 先纠正一个关键前提（不然会白折腾）

**Buddy 应用不托管 Node 服务。** 官方文档（`/docs/buddy-app`、`/docs/third-party-app`）里，
Buddy 应用 = **垂直行业 AI Harness 的「配置」** + **OAuth 授权调用方**，包含 5 个配置模块：
应用信息 / 首页配置 / 市场配置 / 其他配置 / 预览调试。它**没有任何"上传代码/部署服务"的入口**。

所以职责要拆成两件事：

| 事情 | 归谁 | 状态 |
|---|---|---|
| **托管 Node 应用**（`server.js` + 页面） | WorkBuddy「**发布为应用**」(Sites) → `*.app.workbuddy.host` | ✅ 已经在跑了（B站就是它） |
| **在开放平台创建 Buddy 应用**（配置 AI 能力 + 登记 OAuth 回调） | 开放平台控制台，**需登录** | ⏳ 待你登录后配置 |

**我能做的**：把控制台要填的一切准备好（本目录），并把 B站 服务端要配合的改动列清楚。
**只有你能做的**：登录 `open.workbuddy.cn`（我无法代替你登录，实测该页 302 跳登录页），
以及在最后点「提交审核」。

---

## 官方发布流程（7 步）

```
注册入驻 → 企业资质认证 → 创建业务类型 → 完善能力配置 → 测试环境调试 → 提交平台审核 → 发布上线
```

前两步你已完成（`ent_kzvvtsvd` 就是企业实名认证后生成的企业主体）。
**当前处于「创建业务类型 → 完善能力配置」阶段。**

补充规则（官方）：
- 应用**允许跳步骤**，5 个模块可自由切换编辑
- 首次提交**应用基础信息**后需**平台审核**，通过后进入「草稿」状态
- 草稿态继续编辑各模块 → 预览调试 → 提交配置审核 → 通过即上线
- 已发布应用如需变更，**改完要重新提交审核**
- 支持**导出/导入配置 JSON**（建议每次退出前导出一次）

---

## 五个模块逐项填写

**全部内容已备好 → `config.json`**（按模块组织，逐字段照抄即可）

| 模块 | 要点 | 关键取值 |
|---|---|---|
| 1 创建应用 | 名称/简介/头像/授权列表/回调URL/可信Origin | 见 `config.json` → `模块1_创建应用` |
| 2 首页配置 | Slogan / 场景胶囊 / 工作模式(System Prompt) / 内置连接器 | 已写好 3 个工作模式的完整 Prompt |
| 3 市场配置 | 专家 / 技能 / 连接器 / 精选场景 | 精选场景可选，开启需另做背景图 |
| 4 其他配置 | 跳过首次绑定 / 绑定文案 / 输入框占位符 / 模型 | **跳过首次绑定 = 勾选**（见下） |
| 5 预览调试 | 下载 WorkBuddy 端 → 预览链接验证 | 提交前必做 |

### 两个容易填错的点

1. **授权回调 URL 必须是一个真实存在的路由。**
   填 `https://mnemosyne-os.app.workbuddy.host/auth/workbuddy/callback`
   —— 但 **B站 现在的 `server.js` 里没有这个路由**（它只有 GitHub 的）。
   见下面「B站 需要配合的改动」。

2. **模块 4 要勾选「跳过首次绑定应用授权」。**
   官方说明：内置连接器需要是**支持 OAuth 的 MCP**。
   我们的 Mnemosyne 网关用的是 **API Key（Token）**，不是 OAuth →
   不满足内置连接器条件，所以勾选跳过后，用户进入应用不会弹绑定框。

---

## 图标与背景图规范

官方规范（已下载留档，见 `design-ref/`）：

**应用 icon**：16×16px · 线宽 **1.2px** · **必须有断口** · 圆角平滑 100% · 与示例保持一致的单色线性风格

已按规范产出：

| 文件 | 用途 |
|---|---|
| `icon.svg` | 源文件（16×16 viewBox，stroke-width 1.2，圆角，顶边留缺口） |
| `icon-256.png` | **上传用**（256×256，透明底） |
| `icon-preview.png` | 三档尺寸（128/32/16）自检图，确认小尺寸可辨 |

设计含义：Mnemosyne 的六边形记忆骨架（顶边缺口）+ 中心记忆节点。

**专家页精选场景背景图**（仅当模块 3 开启「精选场景」才需要）：
1000px × 910px，**底图 + 3 层渐变蒙层**，需**日间（`#F2F2F2`）与夜间（`#242424`）各一套**。
→ 目前**未制作**，因为不确定你要不要开这个模块。要开就说一声。

---

## 创建成功后：`client_secret` 只显示一次

- 平台会生成 `client_id` + `client_secret`
- **`client_secret` 仅在创建成功后明文展示一次，关闭后无法再查看** —— 当场复制保存
- 保存位置：B站 服务端的 `oauth.config.json` 里新增 `workbuddy` 段
- **严禁**放进 `index.html` 或任何前端代码

---

## B站（Node 服务）需要配合的改动

官方接口（取自 `/docs/openapi`）：

| 用途 | 地址 |
|---|---|
| 请求用户授权 | `GET https://www.workbuddy.cn/openapi/v2/authorize?response_type=code&client_id=…&redirect_uri=…&scope=…&state=…` |
| 换取凭证 | `POST https://www.workbuddy.cn/openapi/v2/token`（`application/x-www-form-urlencoded`） |
| 换取字段 | `grant_type=authorization_code`、`code`、`client_id`、`client_secret`、`redirect_uri`（与授权阶段**字节级一致**） |
| 返回 | `access_token`（3600 秒）、`refresh_token`、`scope`、`open_id` |
| 刷新 | 同地址，`grant_type=refresh_token` |

需要在 `server.js` 里**新增两条路由**（与现有 GitHub 那套同构）：

```
GET /auth/workbuddy          → 302 → https://www.workbuddy.cn/openapi/v2/authorize?…
GET /auth/workbuddy/callback → 校验 state → 换 token → 写会话
```

> ⚠️ `server.js` 目前由**另一个会话**在编辑（GitHub 登录）。
> 改之前请确认没有并发编辑，否则会互相覆盖。
> 会话写进 `.data/sessions.json`（`open_id` 作账号标识）后，
> **`analytics/metrics.js` 就能把它统计成注册量。**

---

## 提交前自检清单

- [ ] 主体为 `ent_kzvvtsvd`（广东鑫室铭实业有限公司）
- [ ] 应用头像已上传 `icon-256.png`，小尺寸下清晰
- [ ] 授权列表只勾了 4 个必要 Scope（没勾 `user.credit.exchange`）
- [ ] 授权回调 URL 与 B站 实际路由**完全一致**（含协议、域名、路径大小写）
- [ ] 可信 Origin 填 `https://mnemosyne-os.app.workbuddy.host`
- [ ] `/auth/workbuddy/callback` 已在 B站 上线并能响应（否则用户授权后会 404）
- [ ] 模块 4 勾选「跳过首次绑定应用授权」
- [ ] 输入框占位符中英文都填了
- [ ] 已导出一次配置 JSON 备份
- [ ] 预览链接在 WorkBuddy 端验证通过

---

## 目录内容

| 文件 | 说明 |
|---|---|
| `README.md` | 本文件（操作手册） |
| `config.json` | ★ 5 个模块的完整填写内容 |
| `icon.svg` / `icon-256.png` / `icon-preview.png` | 应用图标（源文件 / 上传用 / 自检） |
| `icon-render.html` / `icon-preview.html` | 图标渲染页（重新导出 PNG 用） |
| `design-ref/` | 官方设计规范配图（icon 规则、总规则、首页、专家页框架） |

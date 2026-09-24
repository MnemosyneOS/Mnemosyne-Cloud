# OAuth / 短信服务 申请清单

> 站点：https://mnemosyne-os.app.workbuddy.host/
> 企业主体：广东鑫室铭实业有限公司（微信认证必须用企业主体）
> 整理时间：2026-09-21

---

## 0 · 申请前必读（很重要，先看这段再花钱）

### 0.1 微信开发者资质认证是**收费**服务
微信开放平台的《开发者服务协议》第 2.3 条写明「微信开放平台部分服务是以收费方式提供的
（**如微信开放平台开发者资质认证服务等**）」；第 2.4 条说明要**先通过开发者资质认证**才能创建应用。
具体金额与当年政策以申请页面的实际标注为准（我查到的公开资料口径是 300 元/年，但**请以页面为准**，
不要以我这个数字做预算）。认证需要企业主体资质材料，审核需要数个工作日。

### 0.2 这四项都需要「后端」才能安全接入
- OAuth 的 `client_secret`、短信服务商的 AccessKey **都绝对不能放在前端页面里**
  （页面代码任何人都能查看，等于公开密钥）。
- 所以接入它们的前提是：**把站点从「纯静态页」改造成「静态页 + 一个 Node 服务」**，
  由服务端保管密钥、接收 OAuth 回调、调用短信 API。
- 当前站点是纯静态发布。我会负责做这次改造，但你要知道：改造后数据层可能要从
  现在的云数据库迁到自建存储，**现在这个管理后台（用户表、留言表）会受影响**。
- 结论：**先申请免费的 Google / GitHub，先把一条链路跑通验证架构；微信的付费认证放到最后再做。**

### 0.3 Google 登录在大陆网络下不可用
Google 的 OAuth 页面在境内无法直接访问。如果你的用户主要在中国大陆，
申请 Google 登录不会有实际效果。**GitHub 同样在境内访问受限**（虽然比 Google 好一些）。
如果你的目标用户是大陆用户，**优先级应该是：微信 > 短信 > GitHub > Google**。

### 0.4 统一用这两个回调值（现在填，后面如需调整可以改）
| 用途 | 填写值 |
|---|---|
| 微信「授权回调域」 | `mnemosyne-os.app.workbuddy.host` （**只填域名**，不带 `https://`、不带路径） |
| Google / GitHub「重定向 URI」 | `https://mnemosyne-os.app.workbuddy.host/` |

> 注：OAuth 规范不允许回调地址带 `#`，所以站内 hash 路由不能直接当回调。
> 回调统一落在站点根路径，由前端读取 `?code=...` 参数处理。

---

## 1 · 微信开放平台 — 网站应用（扫码登录）

**入口**
- 注册 / 登录：https://open.weixin.qq.com/
- 网站应用介绍页（接入流程说明）：https://open.weixin.qq.com/frame?t=home/web_tmpl&lang=zh_CN

**步骤**
1. 用企业邮箱在 https://open.weixin.qq.com/ 注册开放平台账号（**选「企业」类型**）。
2. 登录后进「账号中心 / 管理中心」，提交 **开发者资质认证**（收费，需企业营业执照等材料）。
3. 认证通过后，在 **管理中心 → 网站应用 → 创建网站应用**：
   - 网站应用名称、简介、图标
   - **官网地址**：`https://mnemosyne-os.app.workbuddy.host/`
   - **授权回调域**：`mnemosyne-os.app.workbuddy.host`
4. 提交审核 → 通过后拿到 **AppID** 和 **AppSecret**。

**产出给我**：AppID、AppSecret

**耗时**：开发者资质认证数个工作日 + 网站应用审核数个工作日

---

## 2 · Google Cloud — OAuth 2.0 客户端

**入口**
- 新建项目：https://console.cloud.google.com/projectcreate
- OAuth 同意屏幕：https://console.cloud.google.com/apis/credentials/consent
- **创建凭据（主入口）**：https://console.cloud.google.com/apis/credentials

**步骤**
1. 用 Google 账号登录，先建一个项目（名字随意，如 `mnemosyne-os`）。
2. 配置 **OAuth 同意屏幕**：用户类型选「外部」，填应用名、支持邮箱、开发者邮箱。
3. 在「凭据」页 → **创建凭据 → OAuth 客户端 ID** → 应用类型选 **Web 应用**：
   - **已获授权的重定向 URI**：`https://mnemosyne-os.app.workbuddy.host/`
4. 创建后拿到 **客户端 ID** 和 **客户端密钥**。

**产出给我**：Client ID、Client Secret

**费用**：免费。**耗时**：几分钟

---

## 3 · GitHub — OAuth App

**入口**
- **直接新建**：https://github.com/settings/applications/new
- 已有应用列表：https://github.com/settings/developers

**步骤**
1. 用 GitHub 账号打开上面的「直接新建」链接。
2. 填写：
   - **Application name**：`Mnemosyne OS`
   - **Homepage URL**：`https://mnemosyne-os.app.workbuddy.host/`
   - **Authorization callback URL**：`https://mnemosyne-os.app.workbuddy.host/`
3. 点「Register application」→ 拿到 **Client ID**。
4. 点「Generate a new client secret」→ **立刻复制保存**（只显示一次）。

**产出给我**：Client ID、Client Secret

**费用**：免费。**耗时**：1 分钟

---

## 4 · 短信服务（手机号验证码）

### 方案 A · 阿里云短信
**入口**
- 短信服务控制台：https://dysms.console.aliyun.com/
- 申请模板官方指引：https://help.aliyun.com/zh/document_detail/108088.html

**步骤**
1. 登录阿里云控制台，**开通「短信服务」**（按量付费）。
2. 左侧「国内消息 → **签名管理** → 添加签名」：
   - 签名名称填企业简称，如 `鑫室铭` 或 `Mnemosyne`
   - 签名来源选企业主体，**需提交资质做运营商实名报备**
3. 左侧「国内消息 → **模板管理** → 添加模板」：
   - 类型选「**验证码**」，内容需包含「验证码/注册码/校验码/动态码」字样
   - 用官方「常用模板推荐」能显著提高过审率
4. 在头像处 → **AccessKey 管理**：建议创建**子用户** AccessKey，只授予短信权限
   （不要用主账号 AK，泄露风险更高）

**产出给我**：AccessKey ID、AccessKey Secret、**签名名称**、**模板 CODE**

**耗时**：签名实名报备官方口径 **7~10 个工作日**（这是四项里最慢的）

### 方案 B · 腾讯云短信
**入口**
- 短信控制台：https://console.cloud.tencent.com/smsv2

**步骤**：同上思路 —— 先开通短信服务，再依次申请「签名」和「模板」，最后取 API 密钥。

**产出给我**：SDKAppID、App Key、签名内容、模板 ID

> 二选一即可。如果你已经有阿里云或腾讯云账号，用已有的那个更快。

---

## 5 · 建议的申请顺序

| 顺序 | 项目 | 费用 | 耗时 | 理由 |
|---|---|---|---|---|
| 1 | **GitHub OAuth App** | 免费 | 1 分钟 | 最快，用来验证整个架构能不能跑通 |
| 2 | **Google OAuth** | 免费 | 几分钟 | 顺便申请，但你说了算（境内不可用） |
| 3 | **短信（阿里云/腾讯云）** | 按量付费 | 7~10 工作日 | 报备周期长，要提前启动 |
| 4 | **微信开发者资质认证** | 收费 | 数工作日 | 最贵最慢，放最后 |

**申请到任意一项后把凭据发我，我立刻开始改造站点。**

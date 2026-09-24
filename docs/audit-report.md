# Mnemosyne OS 官网 · 全量代码审计报告

- **审计对象**：`C:\AI_Workspace\13_Web\index.html`（376,676 字节 / 4,961 行 / sha256 `77c63e312fde8ba09b0c8f47a134a1105600520430dcf2832947c2ecaae6a889`）
- **对照基准**：`github.com/FrankHu-HK/mnemosyne` @ `main`，`pushed_at 2026-09-15`，仓库文件树 113 项
- **审计日期**：2026-09-21
- **审计方式**：① 拉取仓库原始文件逐条比对（GitHub contents API，`raw.*` 域名在本机不通）② 静态源码审计 ③ 真实 Chrome 渲染审计（puppeteer-core 驱动本机 Chrome）

---

## 一、总结论

| 审计面 | 结果 |
|---|---|
| 静态源码审计 | **24 项通过 / 0 失败** |
| 真实渲染审计 | **31 项通过 / 0 失败** |
| 运行时控制台错误 | **0** |
| CDN 资源加载失败 | **0** |
| 可点击元素被遮挡 | **0** |
| 仓库深链接死链 | **0**（17 条全部指向真实文件） |
| 中英词典缺失键 | **0**（各 76 键，完全对称） |

**代码本身没有发现缺陷性错误。** 但本轮修掉了两个**真实存在、且会显著影响观感**的问题（见第四节）。

---

## 二、与 GitHub 仓库的逐项事实对比

### 2.1 仓库元数据（API 实时读取）

| 项目 | 仓库实际值 | 页面声明 | 结论 |
|---|---|---|---|
| 版本 | `setup.py → version=7.0.2` | 7.0.2 | ✅ 一致 |
| Python 要求 | `python_requires=">=3.8"` | python 3.8+ | ✅ 一致 |
| 许可证 | `setup.py → license="MIT"` | MIT | ✅ 一致 |
| PyPI 包名 | `name="mnemosyne-os"` | `pip install mnemosyne-os` | ✅ 一致 |
| 核心依赖 | 标准库（README：no numpy / torch / vector DB / LLM） | 0 个第三方依赖 | ✅ 一致 |
| MCP 工具数 | README 徽章 `MCP-20 Tools`；"20 tools over stdio JSON-RPC" | 20 个 | ✅ 一致 |
| 语言版本 | README.md + CN/TW/es/ru/de/th/ko/ja = **9 个** | 9 种语言 | ✅ 一致 |
| GitHub Stars | **37**（页面走实时 API，会自动更新） | 运行时拉取 | ✅ 机制正确 |

> ⚠️ 注意：GitHub 把本仓库的 license 识别为 `NOASSERTION`（它无法解析这个 LICENSE 文件的格式）。但 `setup.py` 里明确写着 MIT，页面写 MIT 是对的。

### 2.2 仓库深链接（17 条，逐条比对 113 项文件树）

全部有效：`README.md`、`README_CN.md`、`CHANGELOG.md`、`docs/RECALL_STRATEGY.md`、`docs/KNOWN_DEFECTS.md`、`docs/DEPLOY_DEEPSEEK_HARNESS.md`、`scripts/verify_recall_quality.py`、`examples/mcp_usage.py`、`examples/langchain_integration.py`、`examples/ollama_integration.py`、`mnemosyne/webui/web_server.py`、`tree/main/security`、`tree/main/docs`、`tree/main/docs/plugins`、`tree/main/examples`、仓库根、issues/releases 等非文件路由。

**0 条死链。**

### 2.3 ⚠️ 仓库侧的一个真实缺陷（不是页面的问题）

README 的 `## Documentation` 段（第 249–252 行）列出了**五个仓库里根本不存在的文件**：

| README 声称存在的文件 | 实际 |
|---|---|
| `COMPLIANCE.md` | **HTTP 404** |
| `comparison.md` | **HTTP 404** |
| `benchmark_report.md` | **HTTP 404** |
| `quality_report.md` | **HTTP 404** |
| `security_report.md` | **HTTP 404** |

我用仓库的完整文件树（113 项）核对过，这五个一个都没有。曾有一版页面链接过它们，现已全部改指真实文件，页面目前**零引用**这五个文件名（已写成反向断言）。

**这条建议反馈给仓库维护者**：README 引用了不存在的文档，任何按它点进去的人都会看到 404。

### 2.4 命令与数字的引用一致性

页面里的 CLI 示例逐条比对 README，**7/7 完全一致**：

```
python mnemosyne.py --dir ./mem init / retain --content / recall "Apple" --k 5
consolidate --dry-run / graph-query / verify-integrity
python -m mnemosyne.webui.web_server --port 9090
```

页面引用的性能数字，逐条比对 `CHANGELOG.md`：

| 页面数字 | CHANGELOG 出处 | 结论 |
|---|---|---|
| 召回延迟 p50 **0.21 ms** | 第 254 行「召回延迟 p50 **0.21 ms**」 | ✅ 真实 |
| 存储写入 **0.3 ms / 条** | 7.0.2 changelog 存储层实测 | ✅ 真实 |
| precision@1 **8/8** | 第 251–252 行（冷启动/预热/28 个无关问题后均 8/8） | ✅ 真实 |
| 胶囊压缩比 **0.51** | 第 247 行「`ratio=0.51`，7 个关键原子全部保留」 | ✅ 真实 |
| 94 项断言 | 第 238 行「94 项断言，全部通过」 | ✅ 真实 |

页面**没有**残留任何过时数字（`python 3.9`、`13 个 MCP`、`12 个 MCP` 均为 0 次出现），也**没有** mem0 的文案泄漏（`Gateway`、`Combinator` 均为 0 次）。

---

## 三、静态源码审计明细（24 项）

### 3.1 结构卫生
- `<div>` / `<section>` / `<a>` 标签**全部配平**（无未闭合）
- **无重复 id**（72 个 id）
- 无 `TODO` / `FIXME` / 未替换占位符（`__CEO_PHOTO__` 已替换为内嵌 base64）

### 3.2 国际化
- EN 词典 **76 键**，ZH 词典 **76 键**，**完全对称**（无单边键）
- 标记中引用 **73 个** `data-i18n` 键，**全部在词典中有定义**（不会出现空白或原始键名）

### 3.3 路由
- `PAGES` 定义 **20 个**页面，标记中链接 **7 条**路由链接，**每条都有对应页面定义**
- 所有纯 `#anchor` 链接都指向真实存在的 id

### 3.4 外部依赖（改后）
| 主机 | 次数 | 说明 |
|---|---|---|
| `cdn.jsdelivr.net` | 4 | Mona Sans / Inter / DM Mono 三个字体文件（含 1 条 preconnect） |
| `cdn.tailwindcss.com` | 1 | CSS 框架 |
| `unpkg.com` | 1 | Lucide 图标 |
| `github.com` | 5 | 仓库链接 |
| `pypi.org` | 3 | 包页 |
| `www.w3.org` | 1 | SVG 命名空间（非网络请求） |
| `api.github.com` | 1 | 实时 star 数 |
| `x.com` | 1 | 官方 X 账号 |
| `127.0.0.1:9090` / `localhost:8788` / `xxxx-xxxx.trycloudflare.com` / `your-domain` | — | **文档示例地址**，非真实请求 |

> `fonts.googleapis.com` 与 `fonts.gstatic.com` **已从依赖中彻底移除**（原因见第四节）。

---

## 四、本轮发现并修复的真实问题

### 🔴 问题 1（严重）：三个字体全部静默回退到系统字体

**现象**：真实 Chrome 打开页面时，控制台报 5 条 `ERR_CONNECTION_CLOSED`：

```
https://fonts.gstatic.com/s/inter/v20/…woff2       :: net::ERR_CONNECTION_CLOSED
https://fonts.gstatic.com/s/dmmono/v16/…woff2      :: net::ERR_CONNECTION_CLOSED
https://fonts.gstatic.com/s/jetbrainsmono/v24/…    :: net::ERR_CONNECTION_CLOSED
```

`fonts.gstatic.com`（Google 的字体文件主机）在这台机器上被连接重置。`fonts.googleapis.com`（CSS 主机）能通，但 CSS 指向的字体文件拿不到。

**后果**：Mona Sans / Inter / DM Mono **一个都没生效**，整站回退到系统字体（Segoe UI / Microsoft YaHei）。也就是说，**页面显示的从来不是 mem0 用的那套字**。这同时是历史上"logo 的 OS 间距异常"的同一根因。

**修复**：三个字体全部改由 `cdn.jsdelivr.net` 承载（fontsource 包，实测可达）：

```html
<link href="https://cdn.jsdelivr.net/npm/@fontsource-variable/mona-sans/index.css" rel="stylesheet" />
<link href="https://cdn.jsdelivr.net/npm/@fontsource-variable/inter/index.css" rel="stylesheet" />
<link href="https://cdn.jsdelivr.net/npm/@fontsource/dm-mono/index.css" rel="stylesheet" />
```

注意可变字体的**家族名与静态版不同**，CSS 里的字体栈必须同步改名，否则依然匹配不上：

| 包 | 声明出的家族名 | 字重范围 |
|---|---|---|
| `@fontsource-variable/mona-sans` | `Mona Sans Variable` | 200–900 |
| `@fontsource-variable/inter` | `Inter Variable` | 100–900 |
| `@fontsource/dm-mono` | `DM Mono` | 400 |

**修复后实测**（`document.fonts`）：

```
facesLoaded: ["Mona Sans Variable 200 900", "Inter Variable 100 900", "DM Mono 400"]
body          -> "Inter Variable", Inter, system-ui, …
h1            -> "Mona Sans Variable", "Mona Sans", "Inter Variable", …
.mono         -> "DM Mono", "JetBrains Mono", …
.logo .lg-word-> "Inter Variable", Inter, …
CDN 加载失败：0
```

### 🟠 问题 2：定价卡的"对号错行"

**真根因不是垂直偏移，是布局方向错了。** 导航里另有一个卡片复用 `.feat` 类名并设了 `flex-direction:column`，而定价卡的 `li.feat` 只覆盖了 `display:flex`，**没有覆盖方向**——`flex-direction` 是独立属性。于是图标被竖排到文字**上方**。

实测证据：图标与文字的 y 相差 **27px = 16px（图标高）+ 11px（gap）**，正是 column 的特征。

**修复**：`.tier .feat` 显式重声明 `flex-direction:row`。修复后实测 6 行全部 `dir=row / sameRow=true / sideBySide=true`。

### 🟠 问题 3：页脚 wordmark 溢出压住栏目

72px 高的 SVG 实际绘制宽度约 **328px**，而页脚品牌列只有 **252px** → 溢出后压到右侧第一列链接上。

**修复**：高度改 36px（正好一半）+ 列宽 216px。实测 wordmark 右边缘 **196px**、首列左边缘 **304px**，间隔 108px。

---

## 五、真实渲染审计明细（31 项）

### 5.1 全部 20 个路由逐个访问（中文环境）

每个路由都渲染出自己的内容，**没有空页、没有静默回退到首页**：

| 路由 | 渲染长度 | H1 |
|---|---|---|
| `/docs` | 1842 | 使用 Mnemosyne 构建 |
| `/api` | 2133 | 不摆架子的记忆 API |
| `/mcp` | 1348 | 凡实现 MCP 的宿主，现在就能用 |
| `/cli` | 1013 | 整台引擎，从终端就能用 |
| `/trust` | 991 | 安全、合规与认证 |
| `/status` | 992 | 没有托管服务可以宕机 |
| `/research` | 2043 | 一套只跑标准库的记忆层 |
| `/blog` | 522 | 工程笔记 |
| `/integrations` | 853 | 每个技术栈的记忆 |
| `/changelog` | 1185 | 版本更新记录 |
| `/pricing` | 1301 | 简单实惠 |
| `/use-cases/customer-support` | 662 | 客户支持 |
| `/use-cases/healthcare` | 539 | 卫生保健 |
| `/use-cases/education` | 545 | 教育 |
| `/use-cases/sales-crm` | 600 | 销售与客户关系管理 |
| `/use-cases/ecommerce` | 586 | 电子商务 |
| `/about` | 1891 | Mnemosyne —— AI 代理的记忆层 |
| `/contact` | 457 | 联系 Mnemosyne 团队。 |
| `/careers` | 579 | 一起做 AI 的记忆层 |
| `/startup` | 567 | 创业计划 |

另验证：切换到英文后再进路由，仍正确渲染。

### 5.2 首页结构

```
sections 12 · 正文 13,815 字符 · 基准条 8 · 定价卡 4 · 对号行 42
资源卡 3 · 页脚列 5 · 页脚链接 27 · 顶级菜单 5
```

### 5.3 交互（全部真实点击）

| 交互 | 结果 |
|---|---|
| 导航下拉（悬停展开） | ✅ |
| 主题切换弹层 | ✅ |
| 代码窗 Tab 切换 | ✅ 内容确实变化 |
| 基准区 Tab 切换 | ✅ 内容确实变化 |
| 用例区 Tab 切换 | ✅ 内容确实变化 |
| 公告条关闭 | ✅ 加上 `.off` 隐藏 |

### 5.4 遮挡扫描

对页面内**每一个**可点击元素，取其中心点做 `elementFromPoint` 命中测试：**被遮挡数 = 0**。

---

## 六、页面上属于"预测"的数据（站上未标注，此处明示）

按您此前定下的规则（站上不写"预测/示意"，只在对话里说明），以下数字**不是仓库实测**：

| 位置 | 数据 | 性质 |
|---|---|---|
| 基准区 LoCoMo | **94.8**（Mem0 92.5） | 🔴 Mnemosyne 侧为预测 |
| 基准区 LongMemEval | **96.2**（Mem0 94.4） | 🔴 同上 |
| 基准区 BEAM (1M) | **68.5**（Mem0 64.1） | 🔴 同上 |
| 基准区 BEAM (10M) | **53.9**（Mem0 48.6） | 🔴 同上 |
| 定价四档 | $0 / $13 / $174 / 面议 | 🔴 价格为你定的（mem0 下浮 30%），配额数字为构造 |
| 对比表竞争者列 | Mem0 / Pinecone 各项 | 🟠 依公开资料的量级估算 |

**依据**：`CHANGELOG.md` 全文检索 `LoCoMo|LongMemEval|BEAM` **零命中**——仓库里根本没有这三大基准的分数（其 PPT 亦写明"评测仍在进行中"）。Mem0 一侧引自其公开研究页。

**可随时替换**：拿到真实分数后，只需改 `benchMetrics.rows` 一处（中英各一处），图形与对比表会自动跟随。

---

## 七、结论与建议

**页面代码层面：无缺陷性错误。** 静态 24/0、渲染 31/0、控制台与 CDN 零错误、零遮挡、零死链、双语零缺失。

**建议后续处理三件事**：

1. **反馈仓库维护者**：README 的 Documentation 段引用了 5 个不存在的文件（404），建议补文件或删引用。
2. **补齐三大基准分数**：一旦 LoCoMo / LongMemEval / BEAM 有实测结果，替换基准区数字（单点改动）。
3. **确认定价**：目前四档的付费价格与配额是构造值，对外发布前需商务确认。

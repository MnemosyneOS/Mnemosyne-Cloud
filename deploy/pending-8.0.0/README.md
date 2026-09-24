# pending-8.0.0 —— ai-memory.net 站点 8.0.0 口径同步（待应用）

生成时间：2026-09-24
对照上游：`github.com/MnemosyneOS/mnemosyne`，`__version__ = 8.0.0`（release 2026-09-22）

## 为什么需要手工应用

从局域网共享 `\\192.168.1.6\d\AI_Workspace\13_Web` 写入时，该共享**允许新建文件，
但拒绝覆盖任何已存在的文件**（实测：`README.md`、`package.json`、`server.js`、
`index.html`、`server.py`、`docs/*` 全部返回 `Permission denied`；
本次新建的文件则可正常写入）。读取不受影响。

所以改动已打包在本目录，请在 **13_Web 所在的那台机器**（D 盘在本地的机器）上执行覆盖。

## 应用

```bat
cd /d C:\AI_Workspace\13_Web\deploy\pending-8.0.0
python apply.py
```

`apply.py` 会：逐文件比对 sha256（一致则跳过，可重复运行）→ 备份为
`<文件名>.prev-800-<时间戳>` → 覆盖 → 打印新文件 sha256。

先看影响面不写入：

```bat
python apply.py --dry-run
```

## 校验

```bat
python verify.py --root C:\AI_Workspace\13_Web
```

24 项断言：旧仓库地址清零、当前版本声明为 8.0.0、历史条目（7.0.0/7.0.1/7.0.2）保留、
MCP 工具总数 31、无 MIB 残留、性能数字未钉死旧版本、基准分未漂移、
页头星数已移除、通知栏文案、内联 JS 语法。

实测：新版本 24 PASS / 0 FAIL；覆盖前的站点版本 11 PASS / 13 FAIL。

## 本目录内容

| 文件 | 说明 |
|---|---|
| `index.html` | 新版页面（612,936 字符 / 667,859 字节） |
| `index.html.original` | 覆盖前的原始页面（660,099 字节），留作对照 |
| `server.py` | 账号服务，仅改 `REPO` 常量（验证码邮件的反馈链接） |
| `server.py.original` | 原始 server.py，留作对照 |
| `mail-code-example.html` | 邮件模板示例，GitHub 反馈链接改新地址 |
| `apply.py` / `verify.py` | 应用与校验脚本 |

## 覆盖后

```bat
python deploy\deploy.py        :: 发布到 A 站 ai-memory.net
```

页面改动必须经 `html_localize.py` 再上线（deploy.py 已含该步），否则 CDN 引用会漏回页面。
B 站（`mnemosyne-os.app.workbuddy.host`）需另行在 WorkBuddy 里重新「发布为应用」。

# 修复记录：「立即备份访问日志」提示账号不是管理员

时间：2026-09-22 03:16–03:20（北京时间）
现象：在 `https://ai-memory.net/stats/` 点「立即备份访问日志」，提示「当前登录的账号不是管理员，不能执行备份」。

---

## 根因（不是代码 bug，是身份问题）

管理员名单 `/opt/mnemosyne-site/.data/admins.json` 里**只有 GitHub 身份**：

```json
{"gh:FrankHu-HK": {"at": 1790014289.458168, "note": "first claim from the console"}}
```

这是 01:31 用 **GitHub 登录**时点「领取管理员」领到的（该名额只能领一次）。
而点备份时登录的是**邮箱账号** `hu_jingkun@qq.com` —— 它不在名单里，所以服务端正确返回 403。

**根因在于：邮箱账号与 GitHub 账号是两套完全独立的身份**，同一台站上算两个人，权限不通用。
这是设计上的坑：用错身份登录时，按钮看起来就像坏了一样。

---

## 修复内容（三处）

| # | 文件 | 改动 |
|---|---|---|
| 1 | `admins.json` | 把 `hu_jingkun@qq.com` 加入管理员名单（与 GitHub 身份并存） |
| 2 | `server.py` | 403 响应体里回显 `account` 字段，让面板能说清是**哪个账号**没权限 |
| 3 | `stats-gen.py` | 403 提示改为：显示当前账号名 + 说明「邮箱与 GitHub 是两套独立身份」+ 可点去账号页 |

---

## 验证（真实调用，非推断）

用你的邮箱身份建立一次性会话后实测：

| 场景 | 结果 |
|---|---|
| 以 `hu_jingkun@qq.com` 读会话 | `200`，`signedIn: true` |
| **以你的邮箱身份点备份** | **`200`**，生成 `access-logs-20260921-191808.tar.gz`（89,756 字节） |
| 普通成员账号 | `403`，响应含 `"account": "member@example.com"` |
| 未登录 | `401` |

回归检查：主站 200、`/api/auth/me` 200、`/stats/` 401（受保护）、`/auth/github` 302、
`server.py` 与 `oauth.config.json` 均 404、服务 `active`。
未登录访问 `/api/console` 只返回 `{"signedIn": false}`，**不含任何数据字段**（已实测确认无泄露）。

---

## 回滚路径

```
/opt/mnemosyne-site/.data/admins.json.bak-20260921-191720      管理员名单
/opt/mnemosyne-site/server.py.prev-admin-20260921-191644       后端
/usr/local/bin/stats-gen.py.prev-admin-20260921-191644         面板生成器
/var/backups/ai-memory-logs/access-logs-20260921-191808.tar.gz 验证时产生的一份真实备份
```

---

## 后续建议（待你决定，未动手）

1. **管理员管理界面缺失**：现在只能改文件加人。要不要在控制台加一个「成员权限」页，让管理员自己授权/取消？
2. **同一人两个身份不联动**：能否在「账号安全」里支持绑定（把 GitHub 与邮箱绑成一个人）？平台层自建认证可以做，但要新增绑定表与流程。
3. 上一条待决：`robots.txt` 是否放、GPTBot 这类 AI 爬虫给不给抓。

# Mnemosyne Cloud

**Mnemosyne OS** 官网，托管于 GitHub Pages。

- 官网：<https://ai-memory.net>

## 仓库结构

```
├── index.html          ★ 站点首页（含内联 CSS/JS）
├── CNAME               自定义域名

├── deploy/             部署脚本
│   ├── deploy.py
│   ├── localize_assets.py
│   └── html_localize.py
└── docs/               文档与审计记录
```

## 快速开始

### 部署更新

```bash
# 完整部署（推送 + 本地化 + 重新生成看板 + 实测）
python deploy/deploy.py

# 只传页面
python deploy/deploy.py --page-only
```

### 查看访问数据

打开 <https://ai-memory.net/stats/>

凭据在服务器 `/root/.ai-memory-net-stats.txt`（sudo 查看）。

## 关键地址

| 项 | 值 |
|---|---|
| 仓库 | `github.com/MnemosyneOS/Mnemosyne-Cloud` |
| 站点 | `https://ai-memory.net` |
| 看板 | `https://ai-memory.net/stats/` |
| DNS | Cloudflare（代理） |

## 注意事项

- `index.html` 改动必须经 `html_localize.py` 再上线，否则外部 CDN 引用会漏回页面
- `oauth.config.json` 含密钥，不要提交到公开仓库
- 统计看板数据由 `stats-gen.py` 从访问日志生成

## License

MIT
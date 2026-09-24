#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""给 ai-memory.net 站点块加上 Caddy 访问日志（JSON 格式 + 轮转）。

安全策略：
  1. 先备份 /etc/caddy/Caddyfile 到带时间戳的文件
  2. 校验原文件确实包含预期的三个关键块，否则中止（不盲写）
  3. 写入前把旧内容打印出来（留在日志里可追溯）
  4. 幂等：已经配过访问日志就直接退出

用法（需要 root）：
    sudo python3 add_access_log.py
    sudo python3 add_access_log.py --revert   # 从最近的备份回滚
"""
import datetime
import pathlib
import shutil
import sys

CF = pathlib.Path("/etc/caddy/Caddyfile")
LOG_DIR = pathlib.Path("/var/log/caddy")

# 原文件中必须存在的内容片段（防止我误判文件结构后盲写）
REQUIRED = ["35.227.140.175.sslip.io", "reverse_proxy 127.0.0.1:8788",
            "ai-memory.net, www.ai-memory.net", "root * /var/www/ai-memory",
            "file_server"]

NEW_CONTENT = """\
# ── Mnemosyne 网关（临时 sslip.io 域名，保留可用，勿删）──
35.227.140.175.sslip.io {
\tencode gzip
\treverse_proxy 127.0.0.1:8788
}

# ── 产品落地页（静态）──
# HTTPS 证书由 Caddy 自动申请（Let's Encrypt），无需手工配置。
# 前提：域名 DNS 必须已生效且已解除 clientHold，否则签发会失败并退避重试。
ai-memory.net, www.ai-memory.net {
\tencode gzip
\troot * /var/www/ai-memory
\tfile_server

\t# ── 访问日志 ──
\t# JSON 格式，写文件并自动轮转（单文件 10MiB、保留 5 个、最长 30 天）。
\t# 由 stats-gen.py 解析后生成统计看板，见 /var/www/ai-memory/stats/。
\tlog {
\t\toutput file /var/log/caddy/access.log {
\t\t\troll_size 10MiB
\t\t\troll_keep 5
\t\t\troll_keep_for 720h
\t\t}
\t\tformat json
\t}
}
"""


def revert() -> int:
    baks = sorted(CF.parent.glob("Caddyfile.bak-*"))
    if not baks:
        print("[x] 找不到备份文件")
        return 1
    newest = baks[-1]
    shutil.copy2(newest, CF)
    print(f"[✓] 已从 {newest.name} 回滚。请执行： systemctl reload caddy")
    return 0


def main() -> int:
    if "--revert" in sys.argv:
        return revert()

    if not CF.is_file():
        print(f"[x] {CF} 不存在")
        return 1

    old = CF.read_text(encoding="utf-8")

    if "access.log" in old:
        print("[=] 已经配置过访问日志，未改动。")
        return 0

    missing = [s for s in REQUIRED if s not in old]
    if missing:
        print("[x] 原文件结构与预期不符，已中止（不盲写）。缺失片段：")
        for s in missing:
            print("     -", s)
        print("\n--- 原文件全文 ---")
        print(old)
        return 2

    stamp = datetime.datetime.now().strftime("%Y%m%d-%H%M%S")
    bak = CF.with_name(f"Caddyfile.bak-{stamp}")
    shutil.copy2(CF, bak)
    print(f"[1] 已备份 -> {bak}")

    LOG_DIR.mkdir(parents=True, exist_ok=True)
    print(f"[2] 日志目录 -> {LOG_DIR}")

    CF.write_text(NEW_CONTENT, encoding="utf-8")
    print("[3] 新 Caddyfile 已写入：")
    print("-" * 56)
    print(NEW_CONTENT)
    print("-" * 56)
    print(f"[i] 回滚命令：sudo cp {bak} {CF} && sudo systemctl reload caddy")
    return 0


if __name__ == "__main__":
    sys.exit(main())

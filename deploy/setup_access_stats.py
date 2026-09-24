#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""给 ai-memory.net 加上「访问统计看板」，并保证能直接打开查看。

做的事（全部幂等，改前自动备份）：
  1. 备份 /etc/caddy/Caddyfile
  2. 生成/复用 看板账号密码，算出 bcrypt 哈希
  3. 重写 Caddyfile：
       · 保留原有 sslip.io 网关块
       · 保留原有访问日志（log）配置
       · 新增 handle /stats/*  ->  basic_auth 保护 + /var/www/ai-memory-stats
  4. 安装 stats-gen.py 到 /usr/local/bin
  5. 写 /etc/cron.d/ai-memory-stats（每 5 分钟刷新看板）
  6. 立刻生成一次看板

用法： sudo python3 setup_access_stats.py
回滚： sudo cp /etc/caddy/Caddyfile.bak-<时间戳> /etc/caddy/Caddyfile && sudo systemctl reload caddy
"""
import datetime
import pathlib
import secrets
import shutil
import string
import subprocess
import sys

CF = pathlib.Path("/etc/caddy/Caddyfile")
STATS_DIR = pathlib.Path("/var/www/ai-memory-stats")
SITE_DIR = pathlib.Path("/var/www/ai-memory")
GEN_SRC = pathlib.Path(__file__).with_name("stats-gen.py")
GEN_DST = pathlib.Path("/usr/local/bin/stats-gen.py")
CRED = pathlib.Path("/root/.ai-memory-net-stats.txt")
CRON = pathlib.Path("/etc/cron.d/ai-memory-stats")

USERNAME = "mnemosyne"
SITE_BLOCK_HEAD = "ai-memory.net, www.ai-memory.net {"

# 重写后必须出现的关键片段（写完自检）
MUST_HAVE = [
    "35.227.140.175.sslip.io",
    "reverse_proxy 127.0.0.1:8788",
    "/var/www/ai-memory-stats",
    "/var/www/ai-memory",
    "access.log",
    "basic_auth",
    "handle_path /stats/*",
]


def gen_password(n=16):
    alpha = string.ascii_letters + string.digits
    return "".join(secrets.choice(alpha) for _ in range(n))


def bcrypt_hash(pw):
    r = subprocess.run(["caddy", "hash-password", "--plaintext", pw],
                       capture_output=True, text=True)
    if r.returncode != 0 or not r.stdout.strip().startswith("$2"):
        raise RuntimeError("caddy hash-password 失败: %s%s" % (r.stdout, r.stderr))
    return r.stdout.strip()


def main():
    if not CF.is_file():
        print("[x] %s 不存在" % CF)
        return 1
    old = CF.read_text(encoding="utf-8")
    if SITE_BLOCK_HEAD not in old:
        print("[x] 找不到站点块 %r，已中止（不盲写）" % SITE_BLOCK_HEAD)
        print(old)
        return 2

    # ── 密码 ──
    if CRED.is_file():
        lines = CRED.read_text(encoding="utf-8").splitlines()
        existing = {k.strip(): v.strip() for k, v in
                    (l.split("=", 1) for l in lines if "=" in l)}
        pw = existing.get("password") or gen_password()
        print("[1] 复用已有凭据文件 %s" % CRED)
    else:
        pw = gen_password()
        print("[1] 新生成看板凭据")
    h = bcrypt_hash(pw)

    # ── 备份 ──
    stamp = datetime.datetime.now().strftime("%Y%m%d-%H%M%S")
    bak = CF.with_name("Caddyfile.bak-%s" % stamp)
    shutil.copy2(CF, bak)
    print("[2] 已备份 -> %s" % bak)

    # ── 写 Caddyfile ──
    # 注意：不能用 str.format() —— Caddyfile 里全是 { }，会被当成占位符。
    # 一律用 __占位符__ + replace。
    new_cf = """\
# ── Mnemosyne 网关（临时 sslip.io 域名，保留可用，勿删）──
35.227.140.175.sslip.io {
\tencode gzip
\treverse_proxy 127.0.0.1:8788
}

# ── 产品落地页（静态）+ 访问统计看板 ──
# HTTPS 证书由 Caddy 自动申请（Let's Encrypt），无需手工配置。
ai-memory.net, www.ai-memory.net {
\tencode gzip

\t# /stats 补上尾斜杠
\tredir /stats /stats/ 301

\t# ── 访问统计看板：https://ai-memory.net/stats/ （需要密码）──
\t# 必须用 handle_path：它会剥掉 /stats 前缀。
\t# 用 handle 的话 root 会拼成 <root>/stats/index.html —— 实测就是 404。
\t# 由 /usr/local/bin/stats-gen.py 每 5 分钟重新生成。
\thandle_path /stats/* {
\t\tbasic_auth {
\t\t\t__USER__ __HASH__
\t\t}
\t\troot * /var/www/ai-memory-stats
\t\tfile_server
\t}

\t# ── 主站 ──
\thandle {
\t\troot * /var/www/ai-memory
\t\tfile_server
\t}

\t# ── 访问日志 ──
\t# JSON 格式，自动轮转（单文件 10MiB、保留 5 个、最长 30 天）。
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
    new_cf = new_cf.replace("__USER__", USERNAME).replace("__HASH__", h)

    CF.write_text(new_cf, encoding="utf-8")
    missing = [s for s in MUST_HAVE if s not in new_cf]
    if missing:
        shutil.copy2(bak, CF)
        print("[x] 自检失败，已回滚。缺失: %s" % missing)
        return 3
    print("[3] 新 Caddyfile 已写入（含 /stats/ 路由 + 原有 log 块）")

    # ── 目录 ──
    STATS_DIR.mkdir(parents=True, exist_ok=True)
    subprocess.run(["chown", "-R", "caddy:caddy", str(STATS_DIR)], check=False)
    subprocess.run(["chmod", "755", str(STATS_DIR)], check=False)
    print("[4] 看板目录 -> %s" % STATS_DIR)

    # ── 安装生成器 ──
    if GEN_SRC.is_file():
        shutil.copy2(GEN_SRC, GEN_DST)
        GEN_DST.chmod(0o755)
        print("[5] 生成器 -> %s" % GEN_DST)
    else:
        print("[!] 找不到 %s，跳过安装（稍后手动放）" % GEN_SRC)

    # ── cron ──
    CRON.write_text(
        "# 每 5 分钟刷新 ai-memory.net 访问统计看板（本文件由 setup_access_stats.py 生成）\n"
        "*/5 * * * * root /usr/bin/python3 /usr/local/bin/stats-gen.py "
        ">> /var/log/caddy/stats-gen.log 2>&1\n",
        encoding="utf-8")
    CRON.chmod(0o644)
    print("[6] cron -> %s（每 5 分钟）" % CRON)

    # ── 凭据落盘（仅 root 可读）──
    CRED.write_text(
        "url=https://ai-memory.net/stats/\nusername=%s\npassword=%s\n"
        % (USERNAME, pw), encoding="utf-8")
    CRED.chmod(0o600)
    print("[7] 凭据 -> %s（仅 root 可读）" % CRED)

    print()
    print("=" * 60)
    print("  看板地址 : https://ai-memory.net/stats/")
    print("  用户名   : %s" % USERNAME)
    print("  密码     : %s" % pw)
    print("=" * 60)
    print("回滚: sudo cp %s %s && sudo systemctl reload caddy" % (bak, CF))
    return 0


if __name__ == "__main__":
    sys.exit(main())

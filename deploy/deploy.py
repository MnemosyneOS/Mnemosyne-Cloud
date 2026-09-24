#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
一键部署 ai-memory.net 落地页（在本机 Windows 上运行）。

目录约定（2026-09-22 规整后）：
    D:\\AI_Workspace\\13_Web\\index.html      <- ★ 页面本体（应用根，勿移动）
    D:\\AI_Workspace\\13_Web\\server.js       <- Node 服务（GitHub OAuth + 静态伺服）
    D:\\AI_Workspace\\13_Web\\deploy\\        <- 本脚本所在（部署工具）
    D:\\AI_Workspace\\13_Web\\stats\\         <- 访问统计工具

本脚本做四件事：
  1. 把页面、部署脚本与静态文件推到服务器
  2. 在服务器上重新本地化 CDN 资源（localize_assets.py）
  3. 从 index.html.orig 重新生成本地化页面（html_localize.py）
  4. 部署后实测（主站 / 资源 / 统计看板 / 网关 / SEO 文件 / 安全头 / 拦截），全部打印结果

用法：
    python deploy.py              # 完整部署
    python deploy.py --page-only  # 只传页面（不动脚本、不传静态文件、不重跑本地化）

服务器上的脚本都从这里推上去；不要直接在服务器上改（会被下次部署覆盖）。
"""
import argparse
import pathlib
import subprocess
import sys

# ── 连接配置 ──
HOST = "35.227.140.175"
USER = "hjk"
KEY = r"C:\Users\hu_ji\.ssh\mnemosyne_gcp"
SSH = r"C:\Windows\System32\OpenSSH\ssh.exe"
SCP = r"C:\Windows\System32\OpenSSH\scp.exe"

HERE = pathlib.Path(__file__).resolve().parent   # 13_Web\deploy
ROOT = HERE.parent                               # 13_Web
STATS = ROOT / "stats"
STAGE = "/tmp/aim-deploy"

PAGE = ROOT / "index.html"

# 要同步到服务器的脚本：(本地路径, 说明)
PUSH_SCRIPTS = [
    (HERE / "localize_assets.py", "home"),
    (HERE / "html_localize.py", "home"),
    (STATS / "investigate_access.py", "home"),
    (STATS / "stats-gen.py", "/usr/local/bin"),
    (HERE / "setup_access_stats.py", "setup"),
    (STATS / "stats-gen.py", "setup"),
]

# 静态文件（SEO / 图标 / 合规页）。这些在 2026-09-24 之前根本不存在，
# 所以老版本的 deploy.py 只推 index.html —— 新加的这批会静默 404，
# 而页面上看不出来（爬虫才知道）。这里显式列出来一起推。
# 注意：列表必须与下面安装脚本里的 for 列表保持一致，改一处要改两处。
STATIC_FILES = [
    ROOT / "robots.txt",
    ROOT / "sitemap.xml",
    ROOT / "llms.txt",
    ROOT / "legal.html",
    ROOT / "favicon.ico",
    ROOT / "favicon.svg",
    ROOT / "favicon-32.png",
    ROOT / "apple-touch-icon.png",
    ROOT / "og-image.png",
]
SECURITY_TXT = ROOT / ".well-known" / "security.txt"

SSH_OPTS = ["-i", KEY, "-o", "StrictHostKeyChecking=no", "-o", "BatchMode=yes",
            "-o", "ConnectTimeout=25"]
SCP_OPTS = ["-i", KEY, "-o", "StrictHostKeyChecking=no", "-o", "BatchMode=yes"]


def run(cmd, **kw):
    return subprocess.run(cmd, text=True, capture_output=True, errors="replace", **kw)


def ssh(script: str):
    r = run([SSH, *SSH_OPTS, f"{USER}@{HOST}", script])
    if r.stdout:
        print(r.stdout.rstrip())
    if r.returncode != 0 and r.stderr:
        print("[stderr] " + r.stderr.rstrip()[:1500])
    return r.returncode


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--page-only", action="store_true")
    args = ap.parse_args()

    if not PAGE.is_file():
        print("[x] 找不到 %s" % PAGE)
        return 1

    size = PAGE.stat().st_size
    print("=" * 78)
    print(" 部署 ai-memory.net   %s  (%d B)" % (PAGE.name, size))
    print("=" * 78)

    # ── 1. 推送 ──
    print("\n[1/4] 推送到服务器 %s:%s" % (HOST, STAGE))
    ssh("mkdir -p %s" % STAGE)
    files = [str(PAGE)]
    if not args.page_only:
        files += [str(src) for src, _ in PUSH_SCRIPTS if src.is_file()]
    r = run([SCP, *SCP_OPTS, *files, f"{USER}@{HOST}:{STAGE}/"])
    if r.returncode != 0:
        print("[x] scp 失败: " + (r.stderr or "")[:600])
        return 2
    print("    已推送 %d 个文件" % len(files))

    if not args.page_only:
        # 缺文件就当场说清楚，别等服务器上 install 静默跳过、留下一堆 404。
        missing = [str(p) for p in STATIC_FILES if not p.is_file()]
        if not SECURITY_TXT.is_file():
            missing.append(str(SECURITY_TXT))
        if missing:
            print("[!] 本地缺少静态文件，先补上再部署：")
            for p in missing:
                print("    " + p)
            return 3
        ssh("mkdir -p %s/static/.well-known" % STAGE)
        r = run([SCP, *SCP_OPTS, *[str(p) for p in STATIC_FILES],
                 f"{USER}@{HOST}:{STAGE}/static/"])
        if r.returncode != 0:
            print("[x] 静态文件 scp 失败: " + (r.stderr or "")[:600])
            return 3
        r = run([SCP, *SCP_OPTS, str(SECURITY_TXT),
                 f"{USER}@{HOST}:{STAGE}/static/.well-known/"])
        if r.returncode != 0:
            print("[x] security.txt scp 失败: " + (r.stderr or "")[:600])
            return 3
        print("    已推送 %d 个静态文件" % (len(STATIC_FILES) + 1))

    # ── 2~3. 服务器侧安装 + 本地化 ──
    print("\n[2/4] 安装脚本并重新本地化")
    script = """set -e
cd %s
sudo cp index.html /opt/mnemosyne-site/index.html.orig
sudo chown caddy:caddy /opt/mnemosyne-site/index.html.orig
sudo rm -f /var/www/ai-memory/index.html.orig
echo "  [i] index.html.orig 已更新（web 根之外）: $(sudo sha256sum /opt/mnemosyne-site/index.html.orig | cut -c1-16)"

# 静态文件直接装进 web 根。用 install 而不是 cp，是为了顺手把属主和权限
# 定死（caddy:caddy / 644）—— /var/www/ai-memory 属主是 caddy，cp 过来的
# 文件会带 root 属主，之后 chown -R 虽然也能修，但不如这里一次到位。
sudo install -d -o caddy -g caddy -m 755 /var/www/ai-memory/.well-known
for f in robots.txt sitemap.xml llms.txt legal.html favicon.ico favicon.svg \\
         favicon-32.png apple-touch-icon.png og-image.png; do
  [ -f "static/$f" ] && sudo install -o caddy -g caddy -m 644 "static/$f" "/var/www/ai-memory/$f" \\
    && echo "  [i] 已安装 /$f"
done
[ -f static/.well-known/security.txt ] \\
  && sudo install -o caddy -g caddy -m 644 static/.well-known/security.txt /var/www/ai-memory/.well-known/security.txt \\
  && echo "  [i] 已安装 /.well-known/security.txt"
""" % STAGE

    if not args.page_only:
        script += """
for f in localize_assets.py html_localize.py investigate_access.py; do
  [ -f "$f" ] && cp "$f" /home/%s/$f && chown %s:%s /home/%s/$f && echo "  [i] 已安装 $f"
done
[ -f stats-gen.py ] && sudo cp stats-gen.py /usr/local/bin/stats-gen.py \
  && sudo chmod 755 /usr/local/bin/stats-gen.py && echo "  [i] 已安装 stats-gen.py"
if [ -f setup_access_stats.py ]; then
  mkdir -p /home/%s/ai-memory-stats-setup
  cp setup_access_stats.py stats-gen.py /home/%s/ai-memory-stats-setup/
  echo "  [i] 已安装 setup_access_stats.py"
fi
""" % (USER, USER, USER, USER, USER, USER)

    script += """
echo
echo "  --- 本地化 CDN 资源 ---"
sudo python3 /home/%s/localize_assets.py
echo
echo "  --- 生成本地化页面 ---"
sudo python3 /home/%s/html_localize.py
echo
sudo chown -R caddy:caddy /var/www/ai-memory
echo "  [i] 权限已修正"
""" % (USER, USER)

    print()
    rc = ssh(script)
    if rc != 0:
        print("\n[x] 服务器侧步骤失败（rc=%s），请检查上面的输出" % rc)
        return rc

    # ── 4. 验证 ──
    print("\n[3/4] 重新生成统计看板")
    ssh("sudo python3 /usr/local/bin/stats-gen.py")

    print("\n[4/4] 端到端实测")
    verify = r"""B=https://ai-memory.net
C="curl -s -o /dev/null -w %{http_code} --resolve ai-memory.net:443:127.0.0.1 -k"

echo "  主站          $(${C} $B/)"
echo "  www           $(${C} --resolve www.ai-memory.net:443:127.0.0.1 -k https://www.ai-memory.net/)"
echo "  tailwind.js   $(${C} $B/assets/tailwind.js)"
echo "  dmm.css       $(${C} $B/assets/dmm.css)"
echo "  云SDK         $(${C} $B/assets/wbcloud.js)"
echo "  看板(无密码)  $(${C} $B/stats/)   <- 应为 401"
echo "  网关 sslip.io $(curl -s -o /dev/null -w '%{http_code}' https://35.227.140.175.sslip.io/)"
echo
echo "  --- SEO / 合规文件（全部应为 200）---"
for p in robots.txt sitemap.xml llms.txt legal.html favicon.ico favicon.svg \
         favicon-32.png apple-touch-icon.png og-image.png .well-known/security.txt; do
  printf '  %-28s %s\n' "$p" "$(${C} $B/$p)"
done
echo "  --- 安全响应头 ---"
curl -sI -k --resolve ai-memory.net:443:127.0.0.1 $B/ \
  | grep -iE 'strict-transport|x-content-type|x-frame|referrer-policy|permissions-policy|content-security-policy' \
  | sed 's/^/  /'
echo "  --- 扫描路径应被拦（全部应为 404）---"
for p in .env .git/config wp-login.php phpinfo.php .aws/credentials; do
  printf '  %-28s %s\n' "$p" "$(${C} $B/$p)"
done
echo
echo -n "  字体全部:    "
MISS=0
for f in $(grep -ohE 'fonts/[a-f0-9]+\.[a-z0-9]+' /var/www/ai-memory/assets/{mona,inter,dmm}.css 2>/dev/null | sort -u); do
  code=$(curl -s -o /dev/null -w '%{http_code}' --resolve ai-memory.net:443:127.0.0.1 -k $B/assets/$f)
  [ "$code" != "200" ] && { echo "★ $f -> $code"; MISS=1; }
done
[ "$MISS" = "0" ] && echo "全部 200 ✓"
echo
echo -n "  页面渲染依赖残留外链: "
# ai-memory.net 要一起排除：<link rel="canonical"> 指向自己，是本站绝对地址，
# 不是"外部渲染依赖"。不排除的话这一项永远显示 1，看着像没本地化干净。
grep -oE '(src|href)="https?://[^"]+"' /var/www/ai-memory/index.html | grep -vE 'github|pypi|x\.com|ai-memory\.net' | wc -l
echo "   （应为 0；github/pypi/x 属点击跳转，ai-memory.net 是 canonical，正常）"
"""
    ssh(verify)

    print("\n" + "=" * 78)
    print(" 完成。看板: https://ai-memory.net/stats/")
    print(" 凭据在服务器 /root/.ai-memory-net-stats.txt（sudo cat 查看）")
    print("=" * 78)
    return 0


if __name__ == "__main__":
    sys.exit(main())

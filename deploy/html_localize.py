#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
[部署步骤 3/3] 把 index.html 里 6 个外部 CDN 引用改为本地 assets/ 路径，
并删掉指向已被墙域名的 preconnect。

幂等：原始文件保存在 index.html.orig，每次都从它重新生成 —— 所以可以反复跑。

在服务器上运行：
    sudo python3 html_localize.py

★ 坑：字体方案换过（Google Fonts -> jsdelivr fontsource）。
   如果这里少一条规则，对应资源就会**静默留在 CDN 上**，国内打不开。
   跑完必须看最后"残留外部资源检查"——应只剩点击跳转类外链
   （github.com / pypi.org / x.com），不应有任何 css/js/字体。
"""
import pathlib
import re
import shutil
import sys

P = pathlib.Path("/var/www/ai-memory/index.html")
# 原始页面放在 web 根之外。放在根里就等于把「未本地化版本」挂在公网上，
# 只靠 Caddy 的正则拦截兜底 —— 而那条正则曾因指令优先级失效过一次。
ORIG = pathlib.Path("/opt/mnemosyne-site/index.html.orig")

# ── 渲染依赖型外链 -> 本地文件 ──
RULES = [
    (r"https://cdn\.jsdelivr\.net/npm/@fontsource-variable/mona-sans/index\.css",
     "assets/mona.css", "Mona Sans 字体 CSS"),
    (r"https://cdn\.jsdelivr\.net/npm/@fontsource-variable/inter/index\.css",
     "assets/inter.css", "Inter 字体 CSS"),
    (r"https://cdn\.jsdelivr\.net/npm/@fontsource/dm-mono/index\.css",
     "assets/dmm.css", "DM Mono 字体 CSS"),
    (r"https://cdn\.jsdelivr\.net/npm/@tencent-ai/workbuddy-cloud-sdk@dev/lib/index\.global\.js",
     "assets/wbcloud.js", "WorkBuddy 云 SDK"),
    (r"https://cdn\.tailwindcss\.com",
     "assets/tailwind.js", "Tailwind Play CDN"),
    (r"https://unpkg\.com/lucide@latest/dist/umd/lucide\.js",
     "assets/lucide.js", "Lucide 图标库"),
    # 历史遗留：早期版本用 Google Fonts，保留规则以便兼容旧 index.html
    (r"https://fonts\.googleapis\.com/css2\?[^\"']+",
     "assets/gfonts.css", "Google Fonts CSS（旧方案）"),
]

# 允许残留的（点击跳转，不参与渲染）。
# sslip.io 是页脚的「状态」链接。漏掉它会让整个部署脚本以 rc=2 收尾，
# 后面的 chown 就不再执行 —— 一个误报比漏报更容易被忽略。
ALLOW_LEFT = ("github.com", "pypi.org", "x.com", "api.github.com", "sslip.io")


def main():
    if not P.is_file() and not ORIG.is_file():
        print("[x] 找不到 %s" % P)
        return 1

    if not ORIG.is_file():
        shutil.copy2(P, ORIG)
        print("[i] 原始文件已备份 -> %s (%d B)" % (ORIG.name, ORIG.stat().st_size))
    else:
        print("[i] 备份已存在，从 %s 重新生成" % ORIG.name)

    src = ORIG.read_text(encoding="utf-8")

    # ── 1. 删掉 preconnect（指向被墙域名，留着只会让浏览器白等）──
    n_before = len(re.findall(r'<link rel="preconnect"', src))
    src, n_removed = re.subn(r'[ \t]*<link rel="preconnect"[^>]*>[ \t]*\r?\n?', "", src)
    print("\n[1] preconnect 标签: 发现 %d 个, 移除 %d 个" % (n_before, n_removed))

    # ── 2. 资源引用改本地 ──
    print("\n[2] 资源引用替换:")
    bad = []
    for pat, rep, label in RULES:
        src, n = re.subn(pat, rep, src)
        if n > 1:
            print("    [!!] %-24s 替换 %d 处（预期 0 或 1，请检查是否有重复引用）-> %s"
                  % (label, n, rep))
        elif n == 1:
            print("    [ok] %-24s 1 处 -> %s" % (label, rep))
        else:
            print("    [--] %-24s 未出现（该方案未使用，正常）" % label)

    P.write_text(src, encoding="utf-8")
    print("\n[i] 已写出 %s  (%d 字符)" % (P, len(src)))

    # ── 3. 复检：残留的渲染依赖型外链 ──
    print("\n[3] 残留外部资源检查:")
    left = sorted({u for u in re.findall(r"""(?:src|href)=["'](https?://[^"']+)["']""", src)})
    risky = [u for u in left if not any(a in u for a in ALLOW_LEFT)]
    for u in left:
        mark = "点击跳转，无碍" if any(a in u for a in ALLOW_LEFT) else "★ 渲染依赖，需本地化"
        print("    %-14s %s" % (mark, u[:92]))
    if risky:
        bad = risky
        print("    !! 仍有 %d 个渲染依赖外链" % len(risky))

    # ── 4. 本地引用确认 ──
    print("\n[4] 已指向本地的资源:")
    for u in sorted({u for u in re.findall(r"""(?:src|href)=["']([^"':]+)["']""", src)}):
        if u.startswith("assets/"):
            exists = (pathlib.Path("/var/www/ai-memory") / u).is_file()
            print("    %s %s" % ("✓" if exists else "✗ 缺失", u))

    print("\n[结论] " + ("通过" if not bad else "存在 %d 个问题" % len(bad)))
    return 0 if not bad else 2


if __name__ == "__main__":
    sys.exit(main())

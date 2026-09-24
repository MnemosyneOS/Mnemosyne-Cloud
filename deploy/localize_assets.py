#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
[部署步骤 2/3] 把 ai-memory.net 落地页依赖的外部 CDN 资源抓成本地文件，
使页面在中国大陆网络下无需代理也能正常渲染。

必须在服务器 (35.227.140.175) 上运行 —— 只有它能直连这些 CDN。

产物（/var/www/ai-memory/assets/）：
    tailwind.js    <- cdn.tailwindcss.com
    lucide.js      <- unpkg.com
    mona.css / inter.css / dmm.css   <- jsdelivr 上的 fontsource（含字体文件）
    wbcloud.js     <- WorkBuddy 云 SDK
    fonts/*.woff2  <- 字体文件（只保留 latin / latin-ext 子集）

用法：
    sudo python3 localize_assets.py

★ 踩过的两个坑（改这个脚本前务必读）★
─────────────────────────────────────────────────────────────
1. **不能用 str.replace 逐个替换字体 URL。**
   `.woff` 是 `.woff2` 的**前缀子串**，先替换 `.woff` 会把 `.woff2` 一起
   改掉前缀，于是 CSS 引用了一个并不存在的 `<hash>.woff2`。
   线上实测就是 `GET /assets/fonts/981af9bb85bf.woff2 -> 404`。
   必须用**单次 re.sub + 回调**，每个 URL 只替换一次。

2. **字体方案会变。** 曾用 Google Fonts，后来换成 jsdelivr 的 fontsource；
   脚本如果只认旧方案，会**静默漏掉**新字体 CSS（国内打开会白屏）。
   每次跑完务必核对输出里"残留外部资源"是否为 0。
─────────────────────────────────────────────────────────────
"""
import hashlib
import pathlib
import re
import subprocess
import sys
import urllib.parse
import urllib.request

UA = ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
      "(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36")

ROOT = pathlib.Path("/var/www/ai-memory")
ASSETS = ROOT / "assets"
FONTS = ASSETS / "fonts"

# 只保留这两个子集：页面是英文，中文靠系统字体 fallback
KEEP_SUBSETS = ("latin", "latin-ext")

TARGETS = {
    "tailwind.js": "https://cdn.tailwindcss.com",
    "lucide.js": "https://unpkg.com/lucide@latest/dist/umd/lucide.js",
    "mona.css": "https://cdn.jsdelivr.net/npm/@fontsource-variable/mona-sans/index.css",
    "inter.css": "https://cdn.jsdelivr.net/npm/@fontsource-variable/inter/index.css",
    "dmm.css": "https://cdn.jsdelivr.net/npm/@fontsource/dm-mono/index.css",
    # WorkBuddy 云服务 SDK：页面用它接云端登录/数据库/存储。
    # 必须本地化 —— 它从 jsdelivr 加载，失败会导致表单/登录直接哑掉。
    "wbcloud.js": "https://cdn.jsdelivr.net/npm/@tencent-ai/workbuddy-cloud-sdk@dev/lib/index.global.js",
}

CSS_BASES = (
    ("mona.css", "https://cdn.jsdelivr.net/npm/@fontsource-variable/mona-sans/"),
    ("inter.css", "https://cdn.jsdelivr.net/npm/@fontsource-variable/inter/"),
    ("dmm.css", "https://cdn.jsdelivr.net/npm/@fontsource/dm-mono/"),
)

URL_RE = re.compile(r"""url\(\s*['"]?([^'")]+)['"]?\s*\)""")


def fetch(url, timeout=90):
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return r.read()


def keep_latin(css: str):
    """按 /* subset */ 注释切块，只留 latin 系，丢掉 cyrillic/greek/vietnamese 等。"""
    blocks = re.split(r"(/\*[^*]*?\*/)", css)
    if len(blocks) <= 1:
        return css, 0
    kept, dropped, i = [], 0, 1
    while i < len(blocks):
        comment = blocks[i]
        body = blocks[i + 1] if i + 1 < len(blocks) else ""
        name = comment.strip("/* \t\n")
        if any(k in name for k in KEEP_SUBSETS):
            kept.append(comment + body)
        else:
            dropped += 1
        i += 2
    return ("".join(kept) if kept else css), dropped


def localize_css(path: pathlib.Path, base_url: str):
    """下载 CSS 引用的字体，并把 URL 改写为本地相对路径。"""
    css = path.read_text(encoding="utf-8", errors="replace")
    css, dropped = keep_latin(css)

    urls = sorted({u for u in URL_RE.findall(css)})
    mapping = {}
    for u in urls:
        absu = urllib.parse.urljoin(base_url, u)
        ext = pathlib.Path(urllib.parse.urlparse(absu).path).suffix or ".bin"
        fn = hashlib.sha1(absu.encode()).hexdigest()[:12] + ext
        try:
            data = fetch(absu)
        except Exception as e:                                   # noqa: BLE001
            print(f"    [x] 字体下载失败 {absu[:80]} :: {e}")
            continue
        (FONTS / fn).write_bytes(data)
        mapping[u] = f"fonts/{fn}"

    # ★ 单次遍历替换。绝不能 for + str.replace：
    #   `.woff` 是 `.woff2` 的前缀，会连锁改坏（线上 404 的根因）。
    def _repl(m):
        raw = m.group(1)
        return "url(%s)" % mapping.get(raw, raw)

    css = URL_RE.sub(_repl, css)
    path.write_text(css, encoding="utf-8")
    return len(urls), len(mapping), dropped


def main():
    ASSETS.mkdir(parents=True, exist_ok=True)
    FONTS.mkdir(parents=True, exist_ok=True)

    print("=== [1] 抓取主资源 ===")
    for name, url in TARGETS.items():
        try:
            data = fetch(url)
        except Exception as e:                                   # noqa: BLE001
            print(f"  [x] {name:12s} 失败: {e}")
            return 1
        (ASSETS / name).write_bytes(data)
        print(f"  [ok] {name:12s} {len(data):>9,} B   <- {url[:70]}")

    print()
    print("=== [2] 清空并重建字体目录（避免残留旧命名的孤儿文件）===")
    for p in FONTS.glob("*"):
        if p.is_file():
            p.unlink()
    print(f"  已清空 {FONTS}")

    print()
    print("=== [3] 本地化 CSS 中的字体 ===")
    for name, base in CSS_BASES:
        total, ok, dropped = localize_css(ASSETS / name, base)
        print(f"  {name}: 引用 {total} 个字体, 成功 {ok}, 丢弃非 latin 子集 {dropped} 块")

    print()
    print("=== [4] 产物 ===")
    tot = sum(p.stat().st_size for p in ASSETS.rglob("*") if p.is_file())
    cnt = sum(1 for p in ASSETS.rglob("*") if p.is_file())
    print(f"  assets/ 共 {cnt} 个文件, {tot / 1048576:.2f} MB")
    for p in sorted(ASSETS.iterdir()):
        if p.is_file():
            print(f"    {p.name:14s} {p.stat().st_size:>9,} B")
    fonts = sorted(p.name for p in FONTS.iterdir() if p.is_file())
    print(f"    fonts/         {len(fonts):>4d} 个字体文件")

    print()
    print("=== [5] 自检：CSS 引用的每个字体文件是否都真实存在 ===")
    missing = []
    for name, _ in CSS_BASES:
        css = (ASSETS / name).read_text(encoding="utf-8", errors="replace")
        for ref in sorted(set(URL_RE.findall(css))):
            if ref.startswith(("http://", "https://", "data:")):
                print(f"    [x] {name} 仍有外链: {ref[:70]}")
                missing.append(ref)
                continue
            if not (ASSETS / ref).is_file():
                print(f"    [x] {name} 引用了不存在的文件: {ref}")
                missing.append(ref)
    if missing:
        print(f"  !! 有 {len(missing)} 个问题，前端会 404")
    else:
        print("  全部字体引用都能命中本地文件 ✓")

    subprocess.run(["chown", "-R", "caddy:caddy", str(ASSETS)], check=False)
    subprocess.run(["chmod", "-R", "a+rX", str(ASSETS)], check=False)
    print("  权限已设为 caddy:caddy")
    return 1 if missing else 0


if __name__ == "__main__":
    sys.exit(main())

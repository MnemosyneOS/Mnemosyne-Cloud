#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""生成 ai-memory.net 访问统计看板（纯 Python，自包含 HTML）。

为什么不直接用 goaccess：
  Debian 自带的 goaccess 1.5.5 内置 CADDY 日志格式与 Caddy 2.11 的 JSON 结构
  不兼容（全部行报 "IPv4/6 is required"），所以自己做解析与渲染，零外部依赖。

由 /etc/cron.d/ai-memory-stats 每 5 分钟调用：
    sudo python3 /usr/local/bin/stats-gen.py
产物：
    /var/www/ai-memory-stats/index.html   （由 Caddy 在 /stats/ 下伺服，basic_auth 保护）
"""
import collections
import datetime
import glob
import gzip
import html
import json
import os
import pathlib
import re
import subprocess
import sys

LOG_GLOB = "/var/log/caddy/access.log*"
OUT_DIR = pathlib.Path("/var/www/ai-memory-stats")
OUT_HTML = OUT_DIR / "index.html"
BJ = datetime.timezone(datetime.timedelta(hours=8))

LOG_START_NOTE = "2026-09-21 23:49"   # 访问日志开始记录的时间（此前无记录）

BOT_RE = re.compile(
    r"bot|spider|crawl|slurp|curl|wget|python|go-http|headless|scrapy|scanner|"
    r"semrush|ahrefs|mj12|dotbot|petal|yandex|facebookexternalhit|zgrab|masscan|"
    r"nmap|nikto|libwww|java/|okhttp|axios|node-fetch|"
    # ── 2026-09-24 补：原来这张表只覆盖"好爬虫"和几个通用命令行工具，
    # 于是扫描器（sqlmap/nuclei/wpscan/hydra/metasploit）、
    # 漏洞探测（cve-20 开头的 UA）、
    # 以及一批 AI 训练/收录爬虫（GPTBot/ClaudeBot/PerplexityBot/CCBot/
    # Google-Extended/Applebot/meta-externalagent/Bytespider）
    # 全被算成"真人访客"，把 UV 和"真人 PV"两个数字抬高。
    r"sqlmap|nuclei|wpscan|hydra|metasploit|cve-20|"
    r"pandalytics|domainopportunityradar|checkmarknetwork|bytespider|"
    r"gptbot|oai-searchbot|chatgpt-user|claudebot|claude-web|perplexitybot|"
    r"ccbot|google-extended|applebot|meta-externalagent",
    re.I,
)
ASSET_RE = re.compile(r"\.(js|css|woff2?|ttf|eot|png|jpe?g|svg|ico|map|gif|webp|txt|xml)$", re.I)

# 接口前缀。用来把 /api/* 从「页面访问 PV」里摘出去 ——
# 改口径之前 PV 里混着 286 次 /api/*，数值虚高，也解释不了页面到底被看了多少次。
API_RE = re.compile(r"^/(api|v1|v2|v3|auth)(/|$)", re.I)

# 敏感路径。这些请求本来就该 404，单独列一张表是为了**验证拦截规则还在工作**：
# Caddy 的 @blocked 曾经因为写在 handle 块之外而整个失效（DEPLOY.md §5），
# 那种情况下这张表里会出现 200，是唯一能从数据侧看出来的信号。
SCAN_PATH_RE = re.compile(
    r"^/(\.env|\.git|\.aws|\.ssh|\.svn|wp-|xmlrpc\.php|phpinfo|phpmyadmin|pma|"
    r"adminer|config\.php|docker-compose|Dockerfile|server\.py|requirements\.txt|"
    r"backup|database|node_modules|vendor)"
)

# 内网/本机判定。不用原来的 startswith(("127.", "10.", "172.", ...))，
# 因为 "172." 这个前缀会把 172.0.0.0/16 到 172.15.0.0/16 也算成内网 ——
# 而 RFC1918 的私网段只是 172.16.0.0/12，也就是 172.16.~172.31.。
# 原写法会把 172.5.9.8 这种真实公网访客标成「本机」，直接从 UV 里抹掉。
LOOPBACK_RE = re.compile(r"^(127\.|10\.|192\.168\.|::1$|0:0:0:0:0:0:0:1$|fe80:|fd[0-9a-f]{2}:)")
PRIVATE_172_RE = re.compile(r"^172\.(1[6-9]|2[0-9]|3[01])\.")


def is_local(ip):
    return bool(LOOPBACK_RE.match(ip) or PRIVATE_172_RE.match(ip))


def bjfmt(ts, fmt="%m-%d %H:%M:%S"):
    try:
        return datetime.datetime.fromtimestamp(float(ts), BJ).strftime(fmt)
    except Exception:
        return "?"


def read_records():
    recs, bad = [], 0
    for path in sorted(glob.glob(LOG_GLOB)):
        opener = gzip.open if path.endswith(".gz") else open
        try:
            with opener(path, "rt", encoding="utf-8", errors="replace") as fh:
                for ln in fh:
                    ln = ln.strip()
                    if not ln.startswith("{"):
                        continue
                    try:
                        d = json.loads(ln)
                    except ValueError:
                        bad += 1
                        continue
                    r = d.get("request") or {}
                    if not r:
                        continue
                    h = r.get("headers") or {}
                    ua = (h.get("User-Agent") or ["-"])[0]
                    uri = r.get("uri") or "/"
                    path_only = uri.split("?")[0]
                    ip = r.get("client_ip") or r.get("remote_ip") or "-"
                    status = d.get("status") or 0
                    # 「页面访问」的判据（2026-09-24 起）：
                    #   1) 不是静态资源（扩展名与 /assets）
                    #   2) 不在看板自己的 /stats 下
                    #   3) 不是接口调用（/api/*、/auth/*）—— 单独一张卡片数
                    #   4) 状态码 < 400 —— 404/403 是"访问失败"，不是"看了一页"。
                    #      旧口径把 404 也算进 PV，于是扫描器的探测把 PV 推高了。
                    is_pageview = (not ASSET_RE.search(path_only)
                                   and not path_only.startswith("/assets")
                                   and not path_only.startswith("/stats")
                                   and not API_RE.match(path_only))
                    recs.append({
                        "ts": float(d.get("ts") or 0),
                        "ip": ip,
                        "method": r.get("method") or "-",
                        "host": r.get("host") or "-",
                        "uri": uri,
                        "path": path_only,
                        "ua": ua,
                        "ref": (h.get("Referer") or ["-"])[0],
                        "status": status,
                        "size": d.get("size") or 0,
                        "dur": d.get("duration") or 0,
                        "is_bot": bool(BOT_RE.search(ua)),
                        "is_api": bool(API_RE.match(path_only)),
                        "is_scan": bool(SCAN_PATH_RE.match(path_only)),
                        "is_page": is_pageview and status < 400,
                    })
        except OSError as e:
            print("warn: 读不了 %s: %s" % (path, e), file=sys.stderr)
    recs.sort(key=lambda x: x["ts"])
    return recs, bad


def esc(s):
    return html.escape(str(s), quote=True)


def short_ua(ua):
    """把 UA 压成一眼能看懂的短标签。"""
    u = ua or "-"
    if "Edg/" in u:
        return "Edge"
    if "OPR/" in u or "Opera" in u:
        return "Opera"
    if "Firefox/" in u:
        m = re.search(r"Firefox/(\d+)", u)
        return "Firefox %s" % (m.group(1) if m else "")
    if "Chrome/" in u and "Safari" in u:
        m = re.search(r"Chrome/(\d+)", u)
        return "Chrome %s" % (m.group(1) if m else "")
    if "Safari/" in u and "Version/" in u:
        m = re.search(r"Version/(\d+)", u)
        return "Safari %s" % (m.group(1) if m else "")
    if "curl" in u:
        return "curl"
    if "python" in u.lower():
        return "python"
    for kw in ("Googlebot", "Bingbot", "Baiduspider", "YandexBot", "AhrefsBot",
               "SemrushBot", "PetalBot", "DotBot", "MJ12bot", "ClaudeBot",
               "GPTBot", "CCBot", "facebookexternalhit"):
        if kw.lower() in u.lower():
            return kw
    return (u[:34] + "…") if len(u) > 34 else u


def os_of(ua):
    u = ua or ""
    if "Windows NT" in u:
        return "Windows"
    if "iPhone" in u or "iPad" in u:
        return "iOS"
    if "Mac OS X" in u or "Macintosh" in u:
        return "macOS"
    if "Android" in u:
        return "Android"
    if "Linux" in u or "X11" in u:
        return "Linux"
    return "-"


def render(recs, bad):
    now = datetime.datetime.now(BJ)
    if not recs:
        return "<html><body><h3>暂无访问记录</h3></body></html>"

    t0, t1 = recs[0]["ts"], recs[-1]["ts"]
    total = len(recs)
    ext = [r for r in recs if not is_local(r["ip"])]
    pages = [r for r in recs if r["is_page"]]
    ext_pages = [r for r in pages if not is_local(r["ip"])]
    bots = [r for r in recs if r["is_bot"]]
    human = [r for r in recs if not r["is_bot"] and not is_local(r["ip"])]
    apis = [r for r in recs if r["is_api"]]
    scans = [r for r in recs if r["is_scan"]]

    uv_all = len({r["ip"] for r in ext})
    uv_human = len({r["ip"] for r in human})
    bytes_total = sum(r["size"] for r in recs)

    # ── 时间趋势（按 10 分钟桶）──
    buckets = collections.Counter()
    pages_b = collections.Counter()
    for r in recs:
        k = datetime.datetime.fromtimestamp(r["ts"], BJ).strftime("%H:") + \
            "%02d" % (datetime.datetime.fromtimestamp(r["ts"], BJ).minute // 10 * 10)
        buckets[k] += 1
        if r["is_page"]:
            pages_b[k] += 1

    # ── 页面 PV ──
    pv = collections.Counter(r["path"] for r in pages)

    # ── 访客明细 ──
    byip = collections.defaultdict(lambda: {"n": 0, "pv": 0, "t0": None, "t1": None, "ua": "", "os": ""})
    for r in recs:
        e = byip[r["ip"]]
        e["n"] += 1
        if r["is_page"]:
            e["pv"] += 1
        e["t0"] = r["ts"] if e["t0"] is None else min(e["t0"], r["ts"])
        e["t1"] = r["ts"] if e["t1"] is None else max(e["t1"], r["ts"])
        if not e["ua"] or r["is_bot"] is False:
            e["ua"] = r["ua"]
            e["os"] = os_of(r["ua"])

    status = collections.Counter(r["status"] for r in recs)
    hosts = collections.Counter(r["host"] for r in recs)
    refs = collections.Counter(r["ref"] for r in recs if r["ref"] not in ("-", ""))
    uas = collections.Counter(short_ua(r["ua"]) for r in recs)
    notfound = [r for r in recs if r["status"] == 404]

    def card(label, value, sub="", accent="mint"):
        return ('<div class="card"><div class="card-l">%s</div>'
                '<div class="card-v %s">%s</div>'
                '<div class="card-s">%s</div></div>'
                % (esc(label), accent, esc(value), esc(sub)))

    # ── 趋势图 ──
    max_b = max(buckets.values()) if buckets else 1
    bars = []
    for k in sorted(buckets):
        v, p = buckets[k], pages_b[k]
        h = max(3, int(v / max_b * 96))
        hp = int(p / max_b * 96)
        bars.append(
            '<div class="bar" title="%s 请求 %d / 页面 %d">'
            '<div class="bar-i" style="height:%dpx"><i style="height:%dpx"></i></div>'
            '<span>%s</span></div>' % (esc(k), v, p, h, hp, esc(k[-5:])))
    trend = '<div class="trend">%s</div>' % "".join(bars) if bars else '<p class="muted">无</p>'

    # ── 表格 ──
    def rows_pv():
        out = []
        for p, c in pv.most_common(15):
            out.append('<tr><td class="mono">%s</td><td class="num">%d</td></tr>' % (esc(p), c))
        return "".join(out) or '<tr><td colspan="2" class="muted">无</td></tr>'

    def rows_api():
        """接口调用排行。单独一张表，因为 /api/* 不该混进「页面访问 PV」——
        接口被调了多少次和页面被看了多少，是两个完全不同的问题。"""
        c = collections.Counter(r["path"] for r in apis)
        return "".join('<tr><td class="mono small">%s</td><td class="num">%d</td></tr>'
                       % (esc(p), n) for p, n in c.most_common(12)) or \
               '<tr><td colspan="2" class="muted">无</td></tr>'

    def rows_scan():
        """敏感路径探测明细。

        这张表的存在意义是**验证拦截规则还活着**：路径列出的都是本就该 404 的
        东西（.env、wp-login.php 之类）。如果这里出现 200，说明 Caddy 的
        @blocked 规则失效了 —— 它曾经因为写在 handle 块之外而整个不起作用
        （见 DEPLOY.md §5），那种故障从页面上完全看不出来，只有这里能发现。
        """
        out = []
        c = collections.Counter(r["path"] for r in scans)
        for p, n in c.most_common(15):
            codes = sorted({str(r["status"]) for r in scans if r["path"] == p})
            out.append('<tr><td class="mono small">%s</td><td class="num">%d</td>'
                       '<td class="mono small">%s</td></tr>'
                       % (esc(p), n, esc("/".join(codes))))
        return "".join(out) or \
               '<tr><td colspan="3" class="muted">本段时间内没有敏感路径探测</td></tr>'

    def rows_ip():
        out = []
        for ip, e in sorted(byip.items(), key=lambda kv: -kv[1]["n"])[:30]:
            tag = ('<span class="tag tag-local">本机</span>' if is_local(ip)
                   else '<span class="tag tag-ext">外部</span>')
            ua_l = short_ua(e["ua"])
            out.append(
                '<tr><td class="mono">%s %s</td><td class="num">%d</td><td class="num">%d</td>'
                '<td>%s</td><td>%s</td><td class="mono small">%s → %s</td></tr>'
                % (esc(ip), tag, e["n"], e["pv"], esc(ua_l), esc(e["os"]),
                   esc(bjfmt(e["t0"], "%H:%M")), esc(bjfmt(e["t1"], "%H:%M"))))
        return "".join(out)

    def rows_status():
        return "".join('<tr><td class="mono">%s</td><td class="num">%d</td></tr>'
                       % (esc(s), c) for s, c in status.most_common()) or \
               '<tr><td colspan="2" class="muted">无</td></tr>'

    def rows_host():
        return "".join('<tr><td class="mono">%s</td><td class="num">%d</td></tr>'
                       % (esc(h), c) for h, c in hosts.most_common()) or \
               '<tr><td colspan="2" class="muted">无</td></tr>'

    def rows_ref():
        return "".join('<tr><td class="mono small">%s</td><td class="num">%d</td></tr>'
                       % (esc(r[:60]), c) for r, c in refs.most_common(12)) or \
               '<tr><td colspan="2" class="muted">（暂无外部来源，直接访问为主）</td></tr>'

    def rows_ua():
        return "".join('<tr><td>%s</td><td class="num">%d</td></tr>'
                       % (esc(u), c) for u, c in uas.most_common(12)) or \
               '<tr><td colspan="2" class="muted">无</td></tr>'

    def rows_404():
        c404 = collections.Counter(r["path"] for r in notfound)
        return "".join('<tr><td class="mono small">%s</td><td class="num">%d</td></tr>'
                       % (esc(p), c) for p, c in c404.most_common(12)) or \
               '<tr><td colspan="2" class="muted">无</td></tr>'

    def rows_recent():
        out = []
        for r in reversed(recs[-80:]):
            cls = "s2" if r["status"] == 200 else ("s4" if r["status"] >= 400 else "s3")
            out.append('<tr><td class="mono small">%s</td>'
                       '<td class="mono small">%s</td>'
                       '<td class="mono small">%s</td>'
                       '<td class="mono small">%s</td>'
                       '<td class="num %s">%s</td>'
                       '<td class="small">%s</td></tr>'
                       % (esc(bjfmt(r["ts"], "%H:%M:%S")), esc(r["ip"]),
                          esc(r["method"]), esc(r["path"][:46]),
                          cls, esc(r["status"]), esc(short_ua(r["ua"]))))
        return "".join(out)

    span_min = max((t1 - t0) / 60.0, 0.01)

    return f"""<!DOCTYPE html>
<html lang="zh-CN"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta http-equiv="refresh" content="60">
<title>ai-memory.net 访问统计</title>
<style>
*{{box-sizing:border-box}}
body{{margin:0;background:#0b0f14;color:#e6edf3;
 font:14px/1.6 -apple-system,BlinkMacSystemFont,"Segoe UI","PingFang SC","Microsoft YaHei",sans-serif}}
.wrap{{max-width:1180px;margin:0 auto;padding:26px 18px 60px}}
header{{display:flex;flex-wrap:wrap;align-items:baseline;gap:12px;margin-bottom:6px}}
h1{{font-size:21px;margin:0;letter-spacing:.2px}}
h1 i{{color:#71DCC8;font-style:normal}}
.sub{{color:#8b98a8;font-size:12.5px}}
.note{{background:#1a2029;border:1px solid #26313d;border-left:3px solid #FBBF24;
 border-radius:8px;padding:11px 14px;margin:16px 0 22px;color:#c8d2dd;font-size:12.8px}}
.cards{{display:grid;grid-template-columns:repeat(auto-fit,minmax(158px,1fr));gap:12px;margin-bottom:24px}}
.card{{background:#12171f;border:1px solid #1e2733;border-radius:11px;padding:14px 15px}}
.card-l{{color:#8b98a8;font-size:12px;letter-spacing:.3px}}
.card-v{{font-size:26px;font-weight:600;margin:5px 0 2px;font-variant-numeric:tabular-nums}}
.card-s{{color:#6b7889;font-size:11.5px}}
.mint{{color:#71DCC8}} .purple{{color:#C4B5FD}} .amber{{color:#FBBF24}}
.red{{color:#F87171}} .blue{{color:#60A5FA}} .plain{{color:#e6edf3}}
section{{background:#12171f;border:1px solid #1e2733;border-radius:12px;padding:16px 18px;margin-bottom:18px}}
h2{{font-size:14px;margin:0 0 13px;color:#cbd5e1;font-weight:600;letter-spacing:.4px}}
.grid2{{display:grid;grid-template-columns:1fr 1fr;gap:18px}}
@media(max-width:820px){{.grid2{{grid-template-columns:1fr}}}}
table{{width:100%;border-collapse:collapse;font-size:12.8px}}
th{{text-align:left;color:#7d8a99;font-weight:500;padding:6px 9px;border-bottom:1px solid #222c38;font-size:11.5px}}
td{{padding:6px 9px;border-bottom:1px solid #1a222c}}
tr:last-child td{{border-bottom:none}}
.num{{text-align:right;font-variant-numeric:tabular-nums}}
.mono{{font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace}}
.small{{font-size:11.8px}} .muted{{color:#6b7889}}
.s2{{color:#71DCC8}} .s3{{color:#FBBF24}} .s4{{color:#F87171}}
.tag{{font-size:10px;padding:1px 5px;border-radius:4px;margin-left:6px;vertical-align:1px}}
.tag-ext{{background:#1e2a3a;color:#7fb0e8}} .tag-local{{background:#2a2620;color:#c9a86a}}
.trend{{display:flex;align-items:flex-end;gap:3px;height:126px;overflow-x:auto;padding-bottom:2px}}
.bar{{display:flex;flex-direction:column;justify-content:flex-end;align-items:center;min-width:26px}}
.bar-i{{width:19px;background:#1d3b3a;border-radius:3px 3px 0 0;display:flex;align-items:flex-end}}
.bar-i i{{display:block;width:100%;background:#71DCC8;border-radius:3px 3px 0 0}}
.bar span{{color:#5c6a7a;font-size:9.5px;margin-top:4px;white-space:nowrap}}
footer{{color:#5c6a7a;font-size:11.5px;margin-top:26px;text-align:center;line-height:1.9}}
</style></head><body><div class="wrap">
<header>
  <h1>ai-memory.net <i>访问统计</i></h1>
  <span class="sub">生成于 {esc(now.strftime('%Y-%m-%d %H:%M:%S'))} · 页面每 60 秒自动刷新</span>
</header>
<div class="note">
  <b>数据从 {esc(LOG_START_NOTE)} 起记录</b>（开启访问日志的那一刻）。
  更早的访问 Caddy 默认不写日志，已无法追溯。<br>
  <b>口径</b>（2026-09-24 起）：本页统计所有请求，含静态资源与爬虫。
  「页面访问 PV」只数网页 —— 静态资源与 <code>/api/*</code> 都不再计入，
  接口调用单独一张卡片；127.0.0.1 与内网地址段的请求不计入任何访客指标，
  只进「请求总数」。改口径之前 PV 里混着 286 次 <code>/api/*</code>，
  数值虚高，也解释不了页面到底被看了多少次。
</div>

<div class="cards">
  {card("请求总数", total, "含静态资源与爬虫")}
  {card("页面访问 PV", len(pages), "已排除 JS/CSS/字体与 /api/*", "purple")}
  {card("独立访客 UV", uv_all, "按客户端 IP 去重（不含本机与内网）", "mint")}
  {card("其中真人访客", uv_human, "排除爬虫/命令行", "blue")}
  {card("接口调用", len(apis), "单独计数，不混进 PV", "plain")}
  {card("外部请求", len(ext), "来自 %d 个 IP" % uv_all, "plain")}
  {card("爬虫/命令行", len(bots), "搜索引擎、AI 爬虫、脚本", "amber")}
  {card("传输量", "%.1f MB" % (bytes_total / 1048576), "响应体总量", "purple")}
  {card("404 次数", len(notfound), "缺失资源/探测", "red")}
  {card("敏感路径探测", len(scans), "本应 404；用来验证拦截规则", "red")}
</div>

<section><h2>访问趋势（每 10 分钟 · 深色=全部请求，亮色=页面访问）</h2>{trend}</section>

<div class="grid2">
  <section><h2>页面访问排行</h2>
    <table><thead><tr><th>路径</th><th class="num">PV</th></tr></thead>
    <tbody>{rows_pv()}</tbody></table>
    <h2 style="margin-top:22px">接口调用排行</h2>
    <table><thead><tr><th>路径</th><th class="num">次数</th></tr></thead>
    <tbody>{rows_api()}</tbody></table></section>
  <section><h2>状态码</h2>
    <table><thead><tr><th>状态</th><th class="num">次数</th></tr></thead>
    <tbody>{rows_status()}</tbody></table>
    <h2 style="margin-top:20px">访问的主机名</h2>
    <table><thead><tr><th>Host</th><th class="num">次数</th></tr></thead>
    <tbody>{rows_host()}</tbody></table></section>
</div>

<section><h2>敏感路径探测（本应 404 · 用来验证拦截规则）</h2>
<table><thead><tr><th>路径</th><th class="num">次数</th><th>状态码</th></tr></thead>
<tbody>{rows_scan()}</tbody></table>
<p class="muted">这些路径正常都应该 404。
如果这里出现 200，说明 Caddy 的 <code>@blocked</code> 规则失效了
（该规则曾经因为写在 handle 块之外而整个不起作用，见 DEPLOY.md §5）。</p></section>

<section><h2>访客明细（按请求数排序 · 最多 30 条）</h2>
<table><thead><tr><th>客户端 IP</th><th class="num">请求</th><th class="num">页面</th>
<th>浏览器</th><th>系统</th><th>在线时间</th></tr></thead>
<tbody>{rows_ip()}</tbody></table></section>

<div class="grid2">
  <section><h2>浏览器 / 爬虫分布</h2>
    <table><thead><tr><th>UA</th><th class="num">次数</th></tr></thead>
    <tbody>{rows_ua()}</tbody></table></section>
  <section><h2>404 明细（哪些资源找不到）</h2>
    <table><thead><tr><th>路径</th><th class="num">次数</th></tr></thead>
    <tbody>{rows_404()}</tbody></table></section>
</div>

<section><h2>来源 Referer</h2>
<table><thead><tr><th>来源</th><th class="num">次数</th></tr></thead>
<tbody>{rows_ref()}</tbody></table></section>

<section><h2>最近 80 条请求</h2>
<table><thead><tr><th>时间</th><th>IP</th><th>方法</th><th>路径</th>
<th class="num">码</th><th>UA</th></tr></thead>
<tbody>{rows_recent()}</tbody></table></section>

<footer>
  日志时间范围 {esc(bjfmt(t0))} → {esc(bjfmt(t1))}　·　跨度 {span_min:.1f} 分钟　·
  平均 {total / span_min:.2f} 请求/分钟　·　解析失败 {bad} 行<br>
  数据源 /var/log/caddy/access.log（JSON，Caddy 访问日志）　·　
  生成器 /usr/local/bin/stats-gen.py（每 5 分钟由 cron 刷新）
</footer>
</div></body></html>"""


def main():
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    recs, bad = read_records()
    doc = render(recs, bad)
    tmp = OUT_HTML.with_suffix(".tmp")
    tmp.write_text(doc, encoding="utf-8")
    tmp.replace(OUT_HTML)
    for p in (OUT_DIR, OUT_HTML):
        subprocess.run(["chown", "caddy:caddy", str(p)], check=False)
    subprocess.run(["chmod", "755", str(OUT_DIR)], check=False)
    subprocess.run(["chmod", "644", str(OUT_HTML)], check=False)
    print("[OK] %s | %d 条记录 | %d B | %s"
          % (OUT_HTML, len(recs), OUT_HTML.stat().st_size,
             datetime.datetime.now().strftime("%H:%M:%S")))
    return 0


if __name__ == "__main__":
    sys.exit(main())

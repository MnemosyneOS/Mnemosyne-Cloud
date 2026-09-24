#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""用合成日志校验 stats/stats-gen.py 的统计口径。

为什么值得单独测：这个脚本跑在服务器上、结果直接显示在 /stats/ 看板上，
数字错了没人看得出来（没有第二份数据可比）。而 2026-09-24 的改动同时动了
三件事：内网判定、PV 口径、爬虫清单 —— 每一件都会让看板上的数字变化，
所以必须拿一份"已知正确答案"的日志来钉住行为。

跑法：
    python _work/test_stats_gen.py
"""
import importlib.util
import json
import os
import pathlib
import sys
import tempfile

P = os.path.join(os.environ.get('MN_ROOT', r'C:\AI_Workspace\13_Web'),
                 'stats', 'stats-gen.py')
BAD = 0

UA_BROWSER = ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
              "(KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36")
UA_SQLMAP = "sqlmap/1.7#stable (https://sqlmap.org)"
UA_GOOGLE = "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)"
UA_CURL = "curl/8.5.0"

# (ts, ip, method, uri, status, ua)
ROWS = [
    (1000, "127.0.0.1",      "GET",  "/",                 200, UA_BROWSER),
    (1001, "203.0.113.7",    "GET",  "/",                 200, UA_BROWSER),
    (1002, "203.0.113.7",    "GET",  "/legal.html",       200, UA_BROWSER),
    (1003, "203.0.113.7",    "GET",  "/assets/dmm.css",   200, UA_BROWSER),
    # 172.5.9.8 是真实公网地址段（172.0~172.15），旧代码用 "172." 前缀会把它
    # 误判成内网，直接从 UV 里抹掉。这条就是为此设的。
    (1004, "172.5.9.8",      "GET",  "/",                 200, UA_BROWSER),
    # 172.20.5.9 落在 RFC1918 的 172.16/12 里，确实是内网。
    (1005, "172.20.5.9",     "GET",  "/",                 200, UA_BROWSER),
    (1006, "198.51.100.4",   "GET",  "/api/dash/overview", 200, UA_BROWSER),
    (1007, "198.51.100.4",   "POST", "/api/auth/login",   401, UA_BROWSER),
    (1008, "203.0.113.99",   "GET",  "/.env",             404, UA_SQLMAP),
    (1009, "203.0.113.99",   "GET",  "/wp-login.php",     404, UA_SQLMAP),
    # 敏感路径拿到 200 —— 拦截失效的信号，必须是扫描器而不是"页面访问"
    (1010, "203.0.113.99",   "GET",  "/phpinfo.php",      200, UA_SQLMAP),
    (1011, "66.249.66.1",    "GET",  "/",                 200, UA_GOOGLE),
    (1012, "203.0.113.200",  "GET",  "/blog.html",        404, UA_BROWSER),
    (1013, "10.0.0.5",       "GET",  "/robots.txt",       200, UA_CURL),
]

WANT = {
    "total": 14,
    "ext": 11,        # 排除 127.0.0.1 / 172.20.5.9 / 10.0.0.5
    "pages": 7,       # 200 且非资源、非 /api、非 /stats
    "apis": 2,
    "scans": 3,
    "notfound": 3,
    "bots": 5,        # sqlmap×3 + Googlebot + curl
    "human": 7,
}


def check(name, ok, detail=''):
    global BAD
    print('  %s  %-50s %s' % ('PASS' if ok else 'FAIL', name, detail))
    if not ok:
        BAD += 1


def main():
    global BAD
    spec = importlib.util.spec_from_file_location('sg', P)
    mod = importlib.util.module_from_spec(spec)
    try:
        spec.loader.exec_module(mod)
        check('stats-gen.py 可导入', True)
    except Exception as e:                                  # noqa: BLE001
        check('stats-gen.py 可导入', False, str(e))
        return 1

    # ── 内网判定的边界 ──
    print('\n=== 内网/本机判定（172. 前缀那个老 bug）===')
    for ip, want in [("127.0.0.1", True), ("10.1.2.3", True), ("192.168.1.5", True),
                     ("172.16.0.1", True), ("172.20.5.9", True), ("172.31.255.255", True),
                     ("172.15.9.8", False), ("172.5.9.8", False), ("172.32.0.1", False),
                     ("172.100.1.1", False), ("8.8.8.8", False), ("203.0.113.7", False),
                     ("::1", True), ("fe80::1", True)]:
        got = mod.is_local(ip)
        check('is_local(%s) == %s' % (ip, want), got == want, '实得 %s' % got)

    # ── 爬虫清单 ──
    print('\n=== 爬虫/扫描器识别 ===')
    for ua, want in [
        (UA_BROWSER, False), (UA_GOOGLE, True), (UA_CURL, True), (UA_SQLMAP, True),
        ("Mozilla/5.00 (Nikto/2.1.6)", True),
        ("Nuclei - Open-source project (github.com/projectdiscovery/nuclei)", True),
        ("WPScan v3.8", True),
        ("Mozilla/5.0 (compatible; ClaudeBot/1.0; +claudebot@anthropic.com)", True),
        ("Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko); compatible; GPTBot/1.1", True),
        ("Mozilla/5.0 (compatible; PerplexityBot/1.0)", True),
        ("Mozilla/5.0 (compatible; Bytespider; spider-feedback@bytedance.com)", True),
        ("Mozilla/5.0 (compatible; meta-externalagent/1.1)", True),
        ("python-requests/2.31.0", True),
        ("Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) Version/18.1 Mobile Safari/604.1", False),
    ]:
        got = bool(mod.BOT_RE.search(ua))
        check('BOT_RE %s -> %s' % (ua[:40], want), got == want, '实得 %s' % got)

    # ── 接口前缀 ──
    print('\n=== 接口前缀判定 ===')
    for p, want in [("/api/dash/overview", True), ("/api/auth/login", True),
                    ("/v1/chat", True), ("/auth/github", True),
                    ("/api", True), ("/apix", False), ("/", False),
                    ("/assets/api.js", False), ("/legal.html", False)]:
        got = bool(mod.API_RE.match(p))
        check('API_RE %s -> %s' % (p, want), got == want, '实得 %s' % got)

    # ── 敏感路径 ──
    print('\n=== 敏感路径判定 ===')
    for p, want in [("/.env", True), ("/.git/config", True), ("/wp-login.php", True),
                    ("/phpinfo.php", True), ("/backup/x.tar.gz", True),
                    ("/Dockerfile", True), ("/", False), ("/legal.html", False),
                    ("/robots.txt", False), ("/api/dash/overview", False)]:
        got = bool(mod.SCAN_PATH_RE.match(p))
        check('SCAN_PATH_RE %s -> %s' % (p, want), got == want, '实得 %s' % got)

    # ── 口径计数（拿合成日志跑一遍）──
    print('\n=== 统计口径回放（14 行合成日志）===')
    tmpd = pathlib.Path(tempfile.mkdtemp(prefix='statstest_'))
    logf = tmpd / "access.log"
    with logf.open("w", encoding="utf-8") as fh:
        for ts, ip, method, uri, status, ua in ROWS:
            fh.write(json.dumps({
                "ts": ts,
                "request": {"client_ip": ip, "remote_ip": ip, "method": method,
                            "uri": uri, "host": "ai-memory.net",
                            "headers": {"User-Agent": [ua], "Referer": ["-"]}},
                "status": status, "size": 100, "duration": 0.01,
            }) + "\n")

    saved = mod.LOG_GLOB
    mod.LOG_GLOB = str(logf)
    try:
        recs, bad = mod.read_records()
    finally:
        mod.LOG_GLOB = saved

    check('解析出 14 条记录', len(recs) == 14, '%d 条' % len(recs))
    check('没有解析失败行', bad == 0, '%d 行' % bad)

    got = {
        "total": len(recs),
        "ext": len([r for r in recs if not mod.is_local(r["ip"])]),
        "pages": len([r for r in recs if r["is_page"]]),
        "apis": len([r for r in recs if r["is_api"]]),
        "scans": len([r for r in recs if r["is_scan"]]),
        "notfound": len([r for r in recs if r["status"] == 404]),
        "bots": len([r for r in recs if r["is_bot"]]),
        "human": len([r for r in recs
                      if not r["is_bot"] and not mod.is_local(r["ip"])]),
    }
    for k, want in WANT.items():
        check('%s == %d' % (k, want), got[k] == want, '实得 %d' % got[k])

    # 几条"语义"断言：数字对了不代表口径对
    check('/api/* 不计入页面 PV',
          not any(r["is_page"] for r in recs if r["is_api"]))
    check('404 不计入页面 PV',
          not any(r["is_page"] for r in recs if r["status"] >= 400))
    check('静态资源不计入页面 PV',
          not any(r["is_page"] for r in recs if r["path"].startswith("/assets")))
    check('172.5.9.8 被算作外部访客',
          any(r["ip"] == "172.5.9.8" and not mod.is_local(r["ip"]) for r in recs))
    check('/phpinfo.php 拿到 200 时被标为敏感路径',
          any(r["path"] == "/phpinfo.php" and r["is_scan"] and r["status"] == 200
              for r in recs))

    # ── 渲染不炸 + 新板块都在 ──
    print('\n=== 渲染 ===')
    try:
        doc = mod.render(recs, bad)
        check('render() 不抛异常', True, '%d 字节' % len(doc))
    except Exception as e:                                  # noqa: BLE001
        check('render() 不抛异常', False, str(e))
        doc = ''
    for token in ('接口调用排行', '敏感路径探测', '接口调用', '页面访问 PV',
                  '独立访客 UV', '其中真人访客', '含静态资源与爬虫',
                  '本应 404；用来验证拦截规则', '@blocked</code> 规则失效'):
        check('看板含「%s」' % token, token in doc)
    # 空日志也不能炸
    try:
        mod.render([], 0)
        check('空日志时 render() 正常返回', True)
    except Exception as e:                                  # noqa: BLE001
        check('空日志时 render() 正常返回', False, str(e))

    print('\nFAIL 合计: %d' % BAD)
    return 1 if BAD else 0


if __name__ == '__main__':
    sys.exit(main())

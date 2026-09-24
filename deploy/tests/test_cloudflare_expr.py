#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""本地校验 deploy/cloudflare-waf-expressions.txt 里的 Cloudflare 规则表达式。

为什么值得单独测：这份文件是给人在仪表板里"整段粘"的，我这边没有 Cloudflare
账号可以试。所以做两件事：
  1) 语法/额度体检 —— 表达式长度是否超 4096、有没有用到免费版不可用的 matches。
  2) 语义回放 —— 把表达式解析成 Python 可调用对象，拿真实的站点路径跑一遍，
     确认该拦的拦住、**不该拦的一个都没拦住**。

第 2 点是重点。第一版计划里最危险的一处误伤是：
    /api/ops/backup-status 和 /api/ops/backup-logs
含有 "/backup" 字样。如果规则里写成 contains "/backup"（而不是 starts_with），
管理后台的备份状态接口会被整条打挂，而光看表达式是看不出来的。

跑法：
    python _work/test_cloudflare_expr.py
"""
import os
import pathlib
import re
import sys

TXT = pathlib.Path(os.path.join(
    os.environ.get('MN_ROOT', r'C:\AI_Workspace\13_Web'),
    'deploy', 'cloudflare-waf-expressions.txt'))

# ────────────────────────── 表达式解析 ──────────────────────────
# 只覆盖本文件实际出现的语法子集，刻意不做通用解析器：
# 一个语法子集的解析器更短、更好读，出错时也更容易定位。
#   starts_with(lower(http.request.uri.path), "X")
#   lower(http.request.uri.path) contains "X"
#   http.request.uri.path.extension in {"a" "b"}
#   http.request.uri.path eq "X" / contains "X"
#   http.request.method in {"GET" "HEAD"}
#   http.host in {"a" "b"}
#   http.user_agent eq "" / contains "X"
#   not <atom>  ,  and  ,  or
_PATH = 'http.request.uri.path'


def _ext_of(path):
    """http.request.uri.path.extension 的官方语义。

    官方定义：返回 URI 路径中最后一个点之后的字符串，已转小写、不含点。
    并明确规定：若最后一段以点开头、且该段不含其他点，则返回空字符串。
    原文例子：/foo -> "" ; /foo. -> "" ; /.mp3 -> "" ; /.foo.mp3 -> "mp3"
    这一条正是"不能用 extension 拦点文件"的依据。
    """
    seg = path.rsplit('/', 1)[-1]
    if '.' not in seg:
        return ''
    if seg.startswith('.') and seg.count('.') == 1:
        return ''
    return seg.rsplit('.', 1)[-1].lower()


def _atom(expr):
    """把单个原子表达式编译成 f(req) -> bool。"""
    e = expr.strip()
    # 路径前缀比较：lower() 是可选的，两种形态都要认。
    # 本文件里规则 1 一律带 lower()（要覆盖 /.DS_Store 这类大小写变体），
    # 而规则 3/限流故意不带 —— 原因写在 txt 里，是刻意的更严格选择，
    # 不是漏写。解析器不该替规则做这个决定。
    m = re.fullmatch(r'starts_with\((?:lower\()?%s\)?,\s*"(.*)"\)' % re.escape(_PATH), e)
    if m:
        pfx = m.group(1)
        if 'lower(' in e:
            return lambda r: r['path'].lower().startswith(pfx)
        return lambda r: r['path'].startswith(pfx)

    m = re.fullmatch(r'%s\.extension in \{(.*)\}' % re.escape(_PATH), e)
    if m:
        vals = set(re.findall(r'"([^"]*)"', m.group(1)))
        return lambda r: _ext_of(r['path']) in vals

    m = re.fullmatch(r'lower\(%s\) contains "(.*)"' % re.escape(_PATH), e)
    if m:
        sub = m.group(1)
        return lambda r: sub in r['path'].lower()

    m = re.fullmatch(r'%s (contains|eq) "(.*)"' % re.escape(_PATH), e)
    if m:
        op, v = m.group(1), m.group(2)
        if op == 'eq':
            return lambda r: r['path'] == v
        return lambda r: v in r['path']

    m = re.fullmatch(r'%s in \{(.*)\}' % re.escape(_PATH), e)
    if m:
        vals = set(re.findall(r'"([^"]*)"', m.group(1)))
        return lambda r: r['path'] in vals

    m = re.fullmatch(r'http\.request\.method in \{(.*)\}', e)
    if m:
        vals = set(re.findall(r'"([^"]*)"', m.group(1)))
        return lambda r: r['method'] in vals

    m = re.fullmatch(r'http\.host in \{(.*)\}', e)
    if m:
        vals = set(re.findall(r'"([^"]*)"', m.group(1)))
        return lambda r: r['host'] in vals

    m = re.fullmatch(r'lower\(http\.user_agent\) contains "(.*)"', e)
    if m:
        sub = m.group(1)
        return lambda r: sub in r['ua'].lower()

    m = re.fullmatch(r'http\.user_agent (eq|contains) "(.*)"', e)
    if m:
        op, v = m.group(1), m.group(2)
        if op == 'eq':
            return lambda r: r['ua'] == v
        return lambda r: v in r['ua'].lower()

    raise ValueError('认不出来的原子表达式: %r' % expr)


def has_grouping_paren(s):
    """判断表达式里有没有"分组括号"（区别于函数调用括号）。

    判据：一个 '(' 的紧邻前一个非空白字符，若不是标识符字符（字母/数字/下划线），
    那它就不是函数调用，而是分组 —— 本解析器不支持分组，必须显式报错。

    这里踩过坑：第一版用 `s.endswith(')')` 来判断，结果把
    `not starts_with(http.request.uri.path, "/api/")` 这种完全正常的表达式
    也判成了"含括号"，四条规则里错了三条。函数调用的右括号同样在结尾。
    """
    for i, ch in enumerate(s):
        if ch != '(':
            continue
        j = i - 1
        while j >= 0 and s[j] in ' \t':
            j -= 1
        if j < 0 or not (s[j].isalnum() or s[j] == '_'):
            return True
    return False


def compile_expr(expr):
    """把整条表达式编译成 f(req) -> bool。

    本文件的表达式是扁平的（没有分组括号），所以按 or / and 直接切分即可。
    若将来有人加了分组括号，这里会抛错而不是悄悄算错 —— 抛错比算错好。
    """
    one = re.sub(r'\s+', ' ', expr).strip()
    if has_grouping_paren(one):
        raise ValueError('出现了分组括号，本解析器不覆盖：%r' % one)

    ors = [p.strip() for p in one.split(' or ')]
    or_fns = []
    for o in ors:
        if ' and ' in o:
            and_fns = [compile_expr(x) for x in o.split(' and ')]
            or_fns.append(lambda r, fs=and_fns: all(f(r) for f in fs))
        elif o.startswith('not '):
            inner = compile_expr(o[4:])
            or_fns.append(lambda r, f=inner: not f(r))
        else:
            or_fns.append(_atom(o))
    return lambda r: any(f(r) for f in or_fns)


# ────────────────────────── 从 txt 里提取表达式 ──────────────────────────
def extract():
    """按「规则 N / 4」小节把表达式抽出来。"""
    raw = TXT.read_text(encoding='utf-8')
    blocks = {}

    def grab(name, start_marker, stop_markers):
        i = raw.find(start_marker)
        if i < 0:
            return None
        i += len(start_marker)
        end = len(raw)
        for s in stop_markers:
            j = raw.find(s, i)
            if j >= 0:
                end = min(end, j)
        return raw[i:end]

    blocks['scan'] = grab('scan', '规则 1 / 4    扫描路径与配置泄露',
                          ['几点说明：'])
    blocks['ua'] = grab('ua', '规则 2 / 4    已知扫描器与自动化工具的 User-Agent',
                        ['刻意没有列进去的'])
    blocks['method'] = grab('method', '规则 3 / 4    方法白名单（静态资源只接受 GET / HEAD / OPTIONS）',
                            ['说明：\n  ·'])
    blocks['emptyua'] = grab('emptyua', '规则 4 / 4    空 User-Agent',
                             ['免费版 5 条自定义规则'])
    blocks['ratelimit'] = grab('ratelimit', '限流规则（免费版：1 条，计数窗口固定 10 秒，只能按 IP 计数）',
                               ['参数：', '⚠️ 为什么盯的是'])
    return {k: v for k, v in blocks.items() if v}


def clean_expr(text):
    """从抽出的小节里挑出表达式本体：去掉散文注释，只留表达式行。"""
    lines = []
    for ln in text.splitlines():
        s = ln.strip()
        if not s:
            continue
        # 表达式行必然以这些 token 开头或续接 or/and/not
        if (s.startswith(('starts_with(', 'lower(', 'http.', 'not ', 'or ', 'and '))):
            lines.append(s)
        elif lines and lines[-1].rstrip().endswith((')', '}')):
            # 表达式已经结束，后面都是散文
            pass
    return ' '.join(lines)


def check(name, ok, detail=''):
    print('  %s  %-54s %s' % ('PASS' if ok else 'FAIL', name, detail))
    return 0 if ok else 1


def main():
    bad = 0
    raw = TXT.read_text(encoding='utf-8')
    blocks = extract()

    print('=== 体检：免费版能力边界 ===')
    # 这一条只能针对"表达式本体"做，不能扫全文：
    # 文件开头的能力对照表里就写着 "正则（matches 运算符）" 这几个字，
    # 第一版拿全文去搜，被自己的说明文字判成了 FAIL。
    for k in ('scan', 'ua', 'method', 'emptyua', 'ratelimit'):
        if k not in blocks:
            bad += check('抽到 %s 表达式' % k, False)
            continue
        e = clean_expr(blocks[k])
        bad += check('%s 表达式抽到且非空' % k, bool(e.strip()), '%d 字符' % len(e))
        bad += check('%s 未超 4096 字符上限' % k, len(e) <= 4096, '%d 字符' % len(e))
        bad += check('%s 未使用免费版不可用的 matches/~' % k,
                     not re.search(r'\bmatches\b|\s~\s', e))

    print('\n=== 解析：所有表达式都能被本地求值器读懂 ===')
    fns = {}
    for k, v in blocks.items():
        e = clean_expr(v)
        try:
            fns[k] = compile_expr(e)
            bad += check('%s 解析通过' % k, True)
        except Exception as ex:                       # noqa: BLE001
            bad += check('%s 解析通过' % k, False, str(ex))

    if 'scan' not in fns:
        print('\n无法解析扫描路径规则，后续回放跳过')
        return 1

    # ───────────────── 规则 1 语义回放 ─────────────────
    print('\n=== 规则 1 回放：应当拦住的路径 ===')
    MUST_BLOCK = [
        '/.env', '/.git/config', '/wp-login.php', '/wp-admin/', '/phpinfo.php',
        '/.aws/credentials', '/.ssh/id_rsa', '/index.html.orig',
        '/server.py', '/Dockerfile', '/docker-compose.yml', '/xmlrpc.php',
        '/adminer.php', '/config.php', '/requirements.txt', '/oauth.config.json',
        # 大小写变体 —— 真实扫描器与手抖上传的文件名
        '/.DS_Store', '/.Git/config', '/WP-ADMIN/', '/WP-LOGIN.PHP',
        '/phpMyAdmin/index.php', '/Adminer.php', '/Config.PHP',
        '/.AWS/credentials', '/BACKUP.sql', '/Server.PY', '/DOCKERFILE',
        # 嵌套点目录（starts_with 覆盖不到，靠 contains 那 5 条）
        '/docs/.env', '/a/b/.git/config', '/assets/.ssh/id_rsa',
        # 根级目录
        '/backup/', '/backup.tar.gz', '/database.sql', '/node_modules/x.js',
        '/vendor/autoload.php', '/_preview/index.html', '/index.html.prev-800',
    ]
    for p in MUST_BLOCK:
        bad += check('拦得住 %s' % p, fns['scan']({'path': p}))

    print('\n=== 规则 1 回放：站点自己的门面，一个都不能拦 ===')
    MUST_ALLOW = [
        '/', '/index.html', '/legal.html', '/robots.txt', '/sitemap.xml',
        '/llms.txt', '/.well-known/security.txt', '/favicon.ico',
        '/favicon.svg', '/favicon-32.png', '/apple-touch-icon.png',
        '/og-image.png', '/stats/', '/assets/dmm.css',
        '/assets/tailwind.js', '/assets/fonts/981af9bb85bf.woff2',
    ]
    for p in MUST_ALLOW:
        bad += check('放行 %s' % p, not fns['scan']({'path': p}))

    print('\n=== 规则 1 回放：真实后端路由，一个都不能拦（误伤陷阱）===')
    # 这一组是本次最重要的回归。第一版草稿若把 ^/ 锚定的 token 写成 contains，
    # 这里的第一、二条就会红。
    API_ROUTES = [
        '/api/ops/backup-status', '/api/ops/backup-logs',   # ← 含 "/backup"
        '/api/dash/export', '/api/dash/smtp/test', '/api/dash/llm/test',
        '/api/profile/avatar', '/api/auth/login', '/api/auth/send-code',
        '/api/leads', '/api/console', '/api/graph', '/api/build',
        '/auth/github', '/auth/github/callback',
    ]
    for p in API_ROUTES:
        bad += check('放行 %s' % p, not fns['scan']({'path': p}))

    # ───────────────── 规则 3 语义回放 ─────────────────
    if 'method' in fns:
        print('\n=== 规则 3 回放：方法白名单 ===')
        def req(path, method, host='ai-memory.net'):
            return {'path': path, 'method': method, 'host': host}
        bad += check('POST / 被拦', fns['method'](req('/', 'POST')))
        bad += check('DELETE /legal.html 被拦', fns['method'](req('/legal.html', 'DELETE')))
        bad += check('GET / 放行', not fns['method'](req('/', 'GET')))
        bad += check('HEAD / 放行', not fns['method'](req('/', 'HEAD')))
        bad += check('OPTIONS / 放行', not fns['method'](req('/', 'OPTIONS')))
        # 后端接口必须能 POST —— 这里红了就是全站功能瘫痪
        for p in ('/api/auth/login', '/api/leads', '/api/profile/avatar',
                  '/api/dash/copilot', '/auth/github'):
            bad += check('POST %s 放行' % p, not fns['method'](req(p, 'POST')))

    # ───────────────── 规则 2 语义回放 ─────────────────
    if 'ua' in fns:
        print('\n=== 规则 2 回放：扫描器该拦、正常客户端必须放行 ===')
        def ureq(ua):
            return {'ua': ua}
        for ua in ('sqlmap/1.7#stable (https://sqlmap.org)',
                   'Mozilla/5.00 (Nikto/2.1.6)',
                   'Nuclei - Open-source project (github.com/projectdiscovery/nuclei)',
                   'WPScan v3.8.22 (https://wpscan.com/wordpress-security-scanner)',
                   'masscan/1.3 (https://github.com/robertdavidgraham/masscan)',
                   'python-requests/2.31.0 (gobuster)',
                   'Nmap Scripting Engine; https://nmap.org/book/nse.html',
                   'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Nessus/10.5'):
            bad += check('拦住 UA %s' % ua[:44], fns['ua'](ureq(ua)))
        # 这几条是重点：拦错了就是自断手脚
        for ua in ('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 '
                   '(KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
                   'Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) '
                   'AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Mobile/15E148 Safari/604.1',
                   'curl/8.5.0',
                   'Wget/1.21.4',
                   'python-requests/2.31.0',
                   'Go-http-client/1.1',
                   'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)',
                   'Mozilla/5.0 (compatible; bingbot/2.0; +http://www.bing.com/bingbot.htm)'):
            bad += check('放行 UA %s' % ua[:44], not fns['ua'](ureq(ua)))

    # ───────────────── 规则 4 语义回放 ─────────────────
    if 'emptyua' in fns:
        print('\n=== 规则 4 回放（默认不开，仅确认逻辑正确）===')
        def ereq(path, ua, host='ai-memory.net'):
            return {'path': path, 'ua': ua, 'host': host}
        bad += check('空 UA 访问首页 -> 命中',
                     fns['emptyua'](ereq('/', '')))
        bad += check('有 UA 访问首页 -> 不命中',
                     not fns['emptyua'](ereq('/', 'Mozilla/5.0')))
        bad += check('空 UA 访问 /api/auth/login -> 不命中（接口必须放行）',
                     not fns['emptyua'](ereq('/api/auth/login', '')))
        bad += check('空 UA 访问别的主机名 -> 不命中',
                     not fns['emptyua'](ereq('/', '', 'other.example.com')))

    # ───────────────── 限流规则回放 ─────────────────
    if 'ratelimit' in fns:
        print('\n=== 限流规则回放：只该命中认证接口 ===')
        bad += check('命中 /api/auth/login', fns['ratelimit']({'path': '/api/auth/login'}))
        bad += check('命中 /api/auth/send-code', fns['ratelimit']({'path': '/api/auth/send-code'}))
        bad += check('命中 /auth/github', fns['ratelimit']({'path': '/auth/github'}))
        bad += check('不命中 /api/ops/backup-status',
                     not fns['ratelimit']({'path': '/api/ops/backup-status'}))
        bad += check('不命中 /api/authx', not fns['ratelimit']({'path': '/api/authx'}))
        bad += check('不命中首页', not fns['ratelimit']({'path': '/'}))

    # ───────────────── extension 语义自检 ─────────────────
    print('\n=== extension 字段语义自检（官方定义）===')
    for path, want in [('/foo', ''), ('/foo.', ''), ('/.mp3', ''), ('/.foo.mp3', 'mp3'),
                       ('/foo.tar.bz2', 'bz2'), ('/foo.MP3', 'mp3'), ('/', ''),
                       ('/.env', ''), ('/.DS_Store', '')]:
        got = _ext_of(path)
        bad += check('extension(%s) == %r' % (path, want), got == want, '实得 %r' % got)

    print('\nFAIL 合计: %d' % bad)
    return 1 if bad else 0


if __name__ == '__main__':
    sys.exit(main())

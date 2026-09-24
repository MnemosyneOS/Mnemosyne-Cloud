#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""把 /etc/caddy/Caddyfile 上缺失的防护补齐。幂等，重复跑不会重复插入。

在服务器上运行：
    sudo python3 harden_caddy.py

本脚本处理五件事，每一件都单独判断存在性，缺哪件补哪件：

一、@blocked 拦截规则形同虚设
    Caddy 的指令有固定优先级，`handle` 排在 `respond` 之前。原来那条
    @blocked 写在所有 handle 之外，于是最后的 catch-all
    `handle { file_server }` 先一步匹配、直接把文件送了出去 ——
    实测 /index.html.orig 返回 200，而它本该是 404。
    修法：把规则搬进那个 catch-all 的 handle 块内部，
    在同一个块里 respond 排在 file_server 前面，顺序才对。

二、拦截清单太窄
    只挡了 .py/.json/.orig 等扩展名和几个点目录。2026-09-21 起的访问日志里，
    扫描器探测的是 /wp-login.php、/phpinfo、/phpMyAdmin、/.aws/credentials、
    /.ssh/id_rsa、/docker-compose.yml、/xmlrpc.php、/adminer.php 这一类。
    这类请求本来就 404，但在应用层之前挡掉能省下 file_server 的路径查找，
    也让日志干净。

三、请求方法
    catch-all 块只该接受 GET / HEAD / OPTIONS（浏览器与搜索引擎要用的）。
    POST 之类打静态站点的一律 405，不必进 file_server。
    注意：/api/*、/auth/* 走各自独立的 handle 块，不受这条影响 ——
    那边的方法校验由 server.py 自己负责。

四、上传体积与反代超时
    /api/* 加 request_body 上限。/api/* 的反代加 transport 超时，
    注意 read_timeout 必须大于应用自身的 LLM 超时（server.py 里 llm_chat 是
    75 秒），否则 Copilot 的长回答会被 Caddy 先掐断 —— 这正是这一项最
    容易踩的坑，所以这里取 120s 而不是"看起来更安全"的 30s。

五、安全响应头（CSP 之外的）
    HSTS、X-Content-Type-Options、X-Frame-Options、Referrer-Policy、
    Permissions-Policy、COOP、CORP。CSP 由本脚本原有的逻辑负责。

关于 `caddy validate` —— 不要用。
    DEPLOY.md §8.5 记录过：Caddy 以 caddy 用户运行，而 `sudo caddy validate`
    会以 root 身份创建日志文件（0600），之后 reload 就打不开它，站点直接起不来。
    `systemctl reload caddy` 自己会校验配置，且失败时保留旧配置（安全），
    所以这里只 reload，并在失败时回滚文件。
"""
import re
import shutil
import subprocess
import sys
import time
from pathlib import Path

P = Path('/etc/caddy/Caddyfile')

# 内容安全策略。connect-src 里必须留着 api.github.com：
# 页头那个 GitHub 星数是通过它取的，漏掉的话星数会静默消失 ——
# 页面上看不出来，只有 Chrome 的 CSP 违规日志会说明原因。
CSP = (
    "default-src 'self'; "
    "script-src 'self' 'unsafe-inline'; "
    "style-src 'self' 'unsafe-inline'; "
    "img-src 'self' data: https://avatars.githubusercontent.com; "
    "font-src 'self' data:; "
    # api.github.com 是顶栏 star 数用的；漏掉它 star 会静默消失，
    # 页面上看不出来，只有 Chrome 的 CSP 违规日志会说明原因。
    "connect-src 'self' https://api.github.com; "
    "frame-ancestors 'none'; "
    "base-uri 'self'; "
    "form-action 'self'; "
    "object-src 'none'"
)

# 缺失时才追加的响应头。值里不含双引号以外需要转义的字符。
HEADERS = [
    ('Strict-Transport-Security',
     'max-age=31536000; includeSubDomains; preload'),
    ('X-Content-Type-Options', 'nosniff'),
    ('X-Frame-Options', 'DENY'),
    ('Referrer-Policy', 'strict-origin-when-cross-origin'),
    ('Permissions-Policy',
     'geolocation=(), microphone=(), camera=(), payment=(), usb=()'),
    ('Cross-Origin-Opener-Policy', 'same-origin'),
    ('Cross-Origin-Resource-Policy', 'same-origin'),
]

# 扫描器与配置泄露路径。
# 刻意不拦 .txt / .xml / .ico / .png / .svg / .html —— robots.txt、sitemap.xml、
# llms.txt、.well-known/security.txt、favicon 与 legal.html 都在这几类里，
# 拦错了等于把站点自己的门面也锁上。
#
# 开头的 (?i) 是必需的，不是随手加的：Go 的 RE2 默认大小写敏感，而真实世界里
# 扫描器与"手抖上传"的文件名几乎都是大小写混着来的 —— macOS 生成的叫
# .DS_Store（不是 .ds_store），phpMyAdmin 官方目录名是混合大小写，
# 一批老扫描器请求的是 /WP-ADMIN/。不忽略大小写，这几条规则等于白写。
BLOCKED_RE = (
    r'(?i)^/(\.git|\.env|\.data|\.ds_store|\.aws|\.ssh|\.svn|\.hg|\.vscode|\.idea'
    r'|_preview|index\.html\.'
    r'|wp-|xmlrpc\.php|phpinfo|phpmyadmin|pma|adminer|config\.php'
    r'|docker-compose|Dockerfile|server\.py|requirements\.txt'
    r'|backup|database|node_modules|vendor)'
    r'|\.(py|json|orig|md|log|bak|save|tmp|sql|db|sh|env|ini|conf|prev|old|swp)$'
    r'|/\.(git|env|aws|ssh|svn)(/|$)'
)

BLOCKED_ANCHOR = '@blocked path_regexp blocked'

# 允许的方法。OPTIONS 留给 CORS 预检，HEAD 是搜索引擎探活要用的。
OK_METHODS = 'GET HEAD OPTIONS'


def indent_of(line):
    return line[:len(line) - len(line.lstrip())]


def main():
    if not P.is_file():
        print('[x] 找不到 %s（这个脚本要在服务器上跑）' % P)
        return 1

    src = P.read_text(encoding='utf-8')
    before = src
    notes = []

    # ── 一 / 二、@blocked：搬到 handle 块内，并把清单补全 ──
    #
    # 注意这里的「顶层」判定：不能只按文本匹配删除，否则第二次运行时会把
    # 上一遍刚放好的那条规则又删掉（它长得一模一样），接着因为 file_server
    # 前面多了别的东西而找不到锚点、整个脚本报错退出。
    # 判据用位置：出现在第一个 handle / handle_path 之前的才是真·顶层。
    # 主站 catch-all 的 `handle {` 排在所有显式 handle 之后，所以放对的
    # 那条一定在后面。
    m_handle = re.search(r'^[ \t]*(?:handle|handle_path)\b', src, re.M)
    handle_pos = m_handle.start() if m_handle else len(src)
    stray_pat = re.compile(r'^\s*@blocked path_regexp blocked .*$\n^\s*respond @blocked 404\s*$\n',
                           re.M)
    strays = [m for m in stray_pat.finditer(src) if m.start() < handle_pos]
    if strays:
        for m in reversed(strays):
            src = src[:m.start()] + src[m.end():]
        notes.append('顶层 @blocked/respond 已移除（%d 处）' % len(strays))
    else:
        later = stray_pat.search(src)
        if later:
            notes.append('@blocked 已在 handle 块内（位置 %d > %d），保持不动'
                         % (later.start(), handle_pos))

    if BLOCKED_ANCHOR in src:
        # 规则已在块内：只把正则换成更全的那一版
        new_line = re.sub(r'(@blocked path_regexp blocked ).*$',
                          lambda m: m.group(1) + BLOCKED_RE, src, count=1, flags=re.M)
        if new_line != src:
            src = new_line
            notes.append('@blocked 清单已扩展（补 wp-* / phpinfo / .aws / .ssh / Dockerfile 等）')
        else:
            notes.append('@blocked 已在 handle 块内且清单已是最新，跳过')
        handle_indent = ''
    else:
        m = re.search(r'(root \* /var/www/ai-memory\n)([ \t]*)(file_server)', src)
        if not m:
            print('[x] 找不到主站 handle 块，未改动任何内容')
            return 2
        indent = m.group(2)
        handle_indent = indent
        insert = (
            indent + '@blocked path_regexp blocked ' + BLOCKED_RE + '\n'
            + indent + 'respond @blocked 404\n'
        )
        # 插在 file_server 之前。用 m.start(2) 而不是 m.start(3)：
        # group(3) 是 file_server 本身，从那里切入会把它的缩进吃掉，
        # 让 file_server 顶到行首（Caddy 语法仍然通过，但没法读）。
        src = src[:m.start(2)] + insert + src[m.start(2):]
        notes.append('@blocked 已搬进主站 handle 块（respond 先于 file_server）+ 清单扩展')

    # ── 三、方法白名单（同一 handle 块内，file_server 之前）──
    # 锚点用「respond @blocked 404 紧跟 file_server」，这样锁定的必定是主站
    # catch-all 块里那个 file_server，而不是 /stats/ 或别处的同名指令。
    if '@badmethod' not in src.lower():
        m = re.search(r'(\n([ \t]*)respond @blocked 404\n)[ \t]*file_server', src)
        if m:
            ind = m.group(2)
            insert = (ind + '@badmethod not method ' + OK_METHODS + '\n'
                      + ind + 'respond @badmethod 405\n')
            src = src[:m.end(1)] + insert + src[m.end(1):]
            notes.append('已加方法白名单：%s，其余 405（仅静态站点块）' % OK_METHODS)
        else:
            notes.append('[!] 没找到主站 catch-all 的 file_server，方法白名单未加')
    else:
        notes.append('方法白名单已存在，跳过')

    # ── 四之一、/api/* 的请求体上限 ──
    # 只加在 /api/* 这个 handle 里：/auth/* 只有小表单，静态站点块只接受
    # GET/HEAD/OPTIONS 根本不会有请求体。
    if 'max_size' in src:
        notes.append('request_body 上限已存在，跳过')
    else:
        m = re.search(r'(handle /api/\*\s*\{)(.{0,400}?)(\n[ \t]*reverse_proxy 127\.0\.0\.1:8789)',
                      src, re.S)
        if m:
            ind = indent_of(m.group(3).lstrip('\n'))
            insert = ('\n' + ind + 'request_body {\n' + ind + '\tmax_size 10MB\n' + ind + '}')
            src = src[:m.start(3)] + insert + src[m.start(3):]
            notes.append('/api/* 已加 request_body 上限 10MB（头像上传若出现 413，调高）')
        else:
            notes.append('[!] 没定位到 /api/* 的反代行，请求体上限未加')

    # ── 四之二、反代超时（/auth/* 与 /api/* 全都要）──
    if 'dial_timeout' in src:
        notes.append('反代超时已存在，跳过')
    else:
        hits = list(re.finditer(r'\n([ \t]*)reverse_proxy 127\.0\.0\.1:8789(?!\s*\{)', src))
        if hits:
            for m in reversed(hits):          # 从后往前改，前面的偏移才不会失效
                ind = m.group(1)
                block = (
                    ' {\n'
                    + ind + '\ttransport http {\n'
                    + ind + '\t\tdial_timeout 5s\n'
                    # 必须 > server.py 里 llm_chat 的 75s，否则 Copilot 长回答被截断
                    + ind + '\t\tread_timeout 120s\n'
                    + ind + '\t\twrite_timeout 120s\n'
                    + ind + '\t}\n'
                    + ind + '}'
                )
                src = src[:m.end()] + block + src[m.end():]
            notes.append('反代已加超时 %d 处（read/write 120s，> 应用侧 LLM 的 75s）' % len(hits))
        else:
            notes.append('[!] 没找到反代行，超时未加')

    # ── 五、安全响应头（插在 -Server 之前，与 CSP 同处 header 块）──
    m = re.search(r'\n([ \t]*)-Server\b', src)
    if not m:
        notes.append('[!] 找不到 header 块里的 -Server，响应头未加')
    else:
        ind = m.group(1)
        missing = [(k, v) for k, v in HEADERS if k not in src]
        if not missing and 'Content-Security-Policy' in src:
            notes.append('安全响应头已齐，跳过')
        else:
            add = ''
            for k, v in missing:
                add += '\n' + ind + '%s "%s"' % (k, v)
            if 'Content-Security-Policy' not in src:
                add += '\n' + ind + 'Content-Security-Policy "' + CSP + '"'
            src = src[:m.start()] + add + src[m.start():]
            if missing:
                notes.append('已补响应头：' + '、'.join(k for k, _ in missing))
            if 'Content-Security-Policy' not in before:
                notes.append('已补 Content-Security-Policy')

    if src == before:
        print('[i] 无需改动')
        for n in notes:
            print('  [i] ' + n)
        return 0

    # ── 落盘 + reload（不用 caddy validate，理由见文件头）──
    stamp = time.strftime('%Y%m%d-%H%M%S')
    bak = P.with_name('Caddyfile.bak-' + stamp)
    shutil.copy2(P, bak)
    P.write_text(src, encoding='utf-8')
    print('  备份 -> %s' % bak.name)

    # 顺手把格式整理一下，读起来才像人写的（-overwrite 原地改）
    fmt = subprocess.run(['caddy', 'fmt', '--overwrite', str(P)],
                         capture_output=True, text=True)
    if fmt.returncode != 0:
        print('  [i] caddy fmt 跳过：%s' % (fmt.stderr or '').strip()[:200])

    r = subprocess.run(['systemctl', 'reload', 'caddy'],
                       capture_output=True, text=True)
    if r.returncode != 0:
        print('[x] caddy reload 失败，正在回滚到改动前的配置')
        print((r.stderr or r.stdout or '')[:800])
        shutil.copy2(bak, P)
        subprocess.run(['systemctl', 'reload', 'caddy'], capture_output=True)
        return 4

    print('  [i] caddy reload 通过')
    for n in notes:
        print('  [i] ' + n)

    print("""
请立刻实测这三处（DEPLOY.md §10 硬性约束第 4 条）：
  curl -s -o /dev/null -w '%{http_code}\\n' -k --resolve ai-memory.net:443:127.0.0.1 https://ai-memory.net/          # 200
  curl -sI -k --resolve ai-memory.net:443:127.0.0.1 https://ai-memory.net/ | grep -i strict-transport             # 有 HSTS
  curl -s -o /dev/null -w '%{http_code}\\n' -k --resolve ai-memory.net:443:127.0.0.1 https://ai-memory.net/stats/  # 401
  curl -s -o /dev/null -w '%{http_code}\\n' -k --resolve ai-memory.net:443:127.0.0.1 https://ai-memory.net/.env    # 404
  curl -s -o /dev/null -w '%{http_code}\\n' -k --resolve ai-memory.net:443:127.0.0.1 https://ai-memory.net/robots.txt  # 200
  curl -s -o /dev/null -w '%{http_code}\\n' https://35.227.140.175.sslip.io/                                      # 网关仍活
  # 以及登录一次控制台，确认 Copilot 的长回答没有被 120s 超时截断
""")
    return 0


if __name__ == '__main__':
    sys.exit(main())

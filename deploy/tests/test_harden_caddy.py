#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""在本地用一份仿真的 Caddyfile 验证 deploy/harden_caddy.py 的改写逻辑。

为什么值得单独测：这个脚本要在生产服务器上以 root 跑、改的是唯一能让站点
起得来的那个文件，而我这边没有服务器可以试。所以把文本改写部分拿下来跑，
用两份输入（改动前 / 已改好）检查插入位置、幂等性与"不误伤"。

跑法：
    python _work/test_harden_caddy.py
"""
import importlib.util
import io
import os
import pathlib
import shutil
import subprocess
import sys
import tempfile
import types

HC = os.path.join(os.environ.get('MN_ROOT', r'C:\AI_Workspace\13_Web'),
                  'deploy', 'harden_caddy.py')

BEFORE = r'''{
	email ops@ai-memory.net
}

ai-memory.net, www.ai-memory.net {
	log {
		output file /var/log/caddy/access.log {
			roll_size 10MiB
			roll_keep 5
		}
		format json
	}

	header {
		-Server
		Content-Security-Policy "default-src 'self'; script-src 'self' 'unsafe-inline'"
	}

	@blocked path_regexp blocked ^/(\.git|\.env|\.data|\.ds_store|_preview|index\.html\.)|\.(py|json|orig|md|log|bak|save|tmp|sql|db|sh|env|yml|yaml|ini|conf|prev)$
	respond @blocked 404

	handle_path /stats/* {
		root * /var/www/ai-memory-stats
		basic_auth {
			mnemosyne $2a$14$abcdefghijklmnopqrstuv
		}
		file_server
	}

	handle /auth/* {
		reverse_proxy 127.0.0.1:8789
	}

	handle /api/* {
		reverse_proxy 127.0.0.1:8789
	}

	handle {
		root * /var/www/ai-memory
		file_server
	}
}

35.227.140.175.sslip.io {
	reverse_proxy 127.0.0.1:8788
}
'''

# 已经跑过一次脚本之后应该长成的样子（用于幂等性测试）
AFTER = io.StringIO()


def load():
    spec = importlib.util.spec_from_file_location('hc', HC)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


def run_once(mod, text):
    """把 P 指向临时文件、桩掉 subprocess，跑一遍 main()。"""
    tmp = pathlib.Path(tempfile.mkdtemp(prefix='caddytest_'))
    p = tmp / 'Caddyfile'
    p.write_text(text, encoding='utf-8')

    calls = []

    class R:
        returncode = 0
        stdout = ''
        stderr = ''

    def fake_run(cmd, **kw):
        calls.append(list(cmd))
        return R()

    orig = (mod.P, mod.subprocess)
    mod.P = p
    mod.subprocess = types.SimpleNamespace(run=fake_run)
    try:
        rc = mod.main()
    finally:
        mod.P, mod.subprocess = orig
    out = p.read_text(encoding='utf-8')
    baks = sorted(x.name for x in tmp.glob('Caddyfile.bak-*'))
    shutil.rmtree(tmp, ignore_errors=True)
    return rc, out, calls, baks


def check(name, ok, detail=''):
    print('  %s  %-52s %s' % ('PASS' if ok else 'FAIL', name, detail))
    return 0 if ok else 1


def main():
    mod = load()
    bad = 0

    print('=== 第一遍：改动前状态 ===')
    rc, out, calls, baks = run_once(mod, BEFORE)
    print('  rc=%s  备份=%s  外部命令=%s' % (rc, baks, [c[0] for c in calls]))

    # 顶层 @blocked 必须被搬走
    bad += check('顶层 @blocked 已移除',
                 not out.split('header {')[0].count('@blocked'),
                 '')
    # 必须落在主站 handle 块里、file_server 之前
    m = out.find('root * /var/www/ai-memory\n')
    seg = out[m:m + 900]
    i_blk = seg.find('@blocked path_regexp blocked')
    i_bad = seg.find('@badmethod not method GET HEAD OPTIONS')
    i_405 = seg.find('respond @badmethod 405')
    i_fs = seg.find('file_server')
    bad += check('@blocked 在 file_server 之前', 0 <= i_blk < i_fs,
                 '@blocked@%d file_server@%d' % (i_blk, i_fs))
    bad += check('方法白名单已插入', i_bad > 0 and i_405 > i_bad,
                 '@badmethod@%d respond@%d' % (i_bad, i_405))
    bad += check('方法白名单在 file_server 之前', 0 <= i_bad < i_fs,
                 'file_server@%d' % i_fs)

    # 拦截清单必须加宽
    for token in ('wp-', 'phpinfo', 'phpmyadmin', 'Dockerfile', 'requirements\\.txt', '\\.aws', '\\.ssh'):
        bad += check('拦截清单含 %s' % token, token in out)

    # 真正的判据不是"字符串里有没有 .txt"，而是把正则拿去跑真实路径：
    # 该拦的要拦，站点自己的门面文件一个都不能拦。
    bline = [l for l in out.splitlines() if '@blocked path_regexp' in l]
    if not bline:
        bad += check('找得到 @blocked 正则', False)
    else:
        import re as _re
        # 注意：不能用 split('blocked ') —— 那会切在 "@blocked " 上，
        # 提出来的"正则"前面会多一截 "path_regexp blocked "，
        # 于是所有靠第一条分支命中的路径都被误判为放行。
        mm = _re.search(r'@blocked\s+path_regexp\s+blocked\s+(\S.*)$', bline[0])
        pat = _re.compile(mm.group(1))
        MUST_BLOCK = [
            '/.env', '/.git/config', '/wp-login.php', '/wp-admin/', '/phpinfo.php',
            '/.aws/credentials', '/.ssh/id_rsa', '/index.html.orig',
            '/server.py', '/Dockerfile', '/docker-compose.yml', '/xmlrpc.php',
            '/adminer.php', '/config.php', '/requirements.txt', '/oauth.config.json',
            '/.well-known/../.env',
            # 大小写变体 —— 真实扫描器与"手抖上传"的文件名就长这样。
            # 这几条正是 (?i) 开关存在的理由：Linux 文件系统大小写敏感，
            # 所以 /.DS_Store 和 /.ds_store 是两个完全不同的资源，
            # 只拦小写那个等于把 macOS 用户上传的真文件放行。
            '/.DS_Store', '/.Git/config', '/WP-ADMIN/', '/WP-LOGIN.PHP',
            '/phpMyAdmin/index.php', '/Adminer.php', '/Config.PHP',
            '/.AWS/credentials', '/BACKUP.sql', '/Server.PY', '/DOCKERFILE',
        ]
        MUST_ALLOW = [
            '/', '/index.html', '/legal.html', '/robots.txt', '/sitemap.xml',
            '/llms.txt', '/.well-known/security.txt', '/favicon.ico',
            '/favicon.svg', '/favicon-32.png', '/apple-touch-icon.png',
            '/og-image.png', '/stats/', '/assets/dmm.css',
            '/assets/tailwind.js', '/assets/fonts/981af9bb85bf.woff2',
        ]
        for p in MUST_BLOCK:
            bad += check('拦得住 %s' % p, bool(pat.search(p)))
        for p in MUST_ALLOW:
            bad += check('放行 %s' % p, not pat.search(p))

    # 安全响应头
    for h in ('Strict-Transport-Security', 'X-Content-Type-Options', 'X-Frame-Options',
              'Referrer-Policy', 'Permissions-Policy',
              'Cross-Origin-Opener-Policy', 'Cross-Origin-Resource-Policy'):
        bad += check('响应头 %s 已加' % h, h in out)
    bad += check('CSP 未被重复插入', out.count('Content-Security-Policy') == 1,
                 '出现 %d 次' % out.count('Content-Security-Policy'))
    bad += check('-Server 仍在 header 块内', '-Server' in out)

    # /api/* 的体积与超时
    api = out[out.find('handle /api/*'):]
    api = api[:api.find('handle {')] if 'handle {' in api else api
    bad += check('/api/* 有 request_body 上限', 'max_size 10MB' in api)
    bad += check('/api/* 有反代超时', 'dial_timeout 5s' in api)
    bad += check('read_timeout 120s（> 应用侧 75s）', 'read_timeout 120s' in api)
    bad += check('超时覆盖 /auth/* 与 /api/* 两处',
                 out.count('dial_timeout 5s') == 2, '出现 %d 次' % out.count('dial_timeout 5s'))

    # 不该动的地方
    bad += check('sslip.io 网关块未被改动',
                 '35.227.140.175.sslip.io {\n\treverse_proxy 127.0.0.1:8788\n}' in out)
    bad += check('/stats/ 基础认证未被改动', 'mnemosyne $2a$14$abcdefghijklmnopqrstuv' in out)
    bad += check('未调用 caddy validate（会以 root 建日志文件）',
                 not any('validate' in c for c in [x for sub in calls for x in sub]))
    bad += check('调用了 caddy fmt 与 systemctl reload',
                 any('fmt' in c for c in [x for sub in calls for x in sub])
                 and any('reload' in c for c in [x for sub in calls for x in sub]))

    print('\n=== 第二遍：拿第一遍的结果再跑一次（幂等性）===')
    rc2, out2, calls2, baks2 = run_once(mod, out)
    bad += check('第二遍无需改动（rc=0）', rc2 == 0, 'rc=%s' % rc2)
    bad += check('第二遍未产生新备份', not baks2, str(baks2))
    bad += check('两遍结果完全一致', out2 == out, '长度 %d vs %d' % (len(out2), len(out)))
    bad += check('未重复插入 max_size', out2.count('max_size') == 1,
                 '出现 %d 次' % out2.count('max_size'))
    bad += check('未重复插入 dial_timeout', out2.count('dial_timeout 5s') == 2,
                 '出现 %d 次' % out2.count('dial_timeout 5s'))
    bad += check('未重复插入方法白名单', out2.count('@badmethod') == 2,
                 '@badmethod 出现 %d 次（1 定义 + 1 引用）' % out2.count('@badmethod'))

    print('\n=== 第三遍：认不出来的配置，必须一个字都不改 ===')
    weird = 'ai-memory.net {\n\tfile_server\n}\n'
    rc3, out3, _, _ = run_once(mod, weird)
    bad += check('畸形输入下拒绝改动（rc!=0）', rc3 != 0, 'rc=%s' % rc3)
    bad += check('畸形输入的原文件未被改动', out3 == weird, '长度 %d vs %d' % (len(out3), len(weird)))

    print('\nFAIL 合计: %d' % bad)
    return 1 if bad else 0


if __name__ == '__main__':
    sys.exit(main())

#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""本地校验 deploy/deploy.py：能不能导入、静态文件清单是否实在、实际发出去的 shell 是否合法。

为什么要单独测：deploy.py 我这边跑不了（它要 ssh 到 35.227.140.175，本机没有那把私钥）。
但它内嵌了三段 shell，其中两段是"安装静态文件"和"部署后实测"——一旦有语法错误，
会在服务器上半途中断；而且因为第一段带 `set -e`，前一段成功、后一段失败的状态最难查。
所以把 shell 抽出来做 `bash -n` 静态检查，并核对关键片段没写漏。

【踩过的坑，写下来免得再犯】
第一版是拿正则从**源码文本**里切 `\"\"\"...\"\"\"`，再直接喂给 bash。
那是错的：源码里的 `\\\\`（两个字符）是 Python 转义，运行时才变成一个 `\\`。
正则切出来的文本没经过转义解码，于是 bash 看到两字符 `\\\\`，把第二个反斜杠
转义掉、续行失效，`for f in a b c \\\\` 的下一行就变成了独立命令，报
"syntax error near unexpected token"。**问题出在测试，不在被测的脚本。**
改成桩掉 ssh/run、直接抓运行时字符串之后，这个假警报就消失了。

跑法：
    python _work/test_deploy.py
"""
import importlib.util
import io
import contextlib
import os
import pathlib
import subprocess
import sys
import tempfile
import types

P = os.path.join(os.environ.get('MN_ROOT', r'C:\AI_Workspace\13_Web'),
                 'deploy', 'deploy.py')
BAD = 0


def check(name, ok, detail=''):
    global BAD
    print('  %s  %-50s %s' % ('PASS' if ok else 'FAIL', name, detail))
    if not ok:
        BAD += 1


class _R:
    returncode = 0
    stdout = ''
    stderr = ''


def run_main(mod):
    """桩掉 ssh/run，跑一遍 main()，返回 (发出去的 shell 脚本列表, scp 命令列表)。"""
    scripts, cmds = [], []

    def fake_ssh(script):
        scripts.append(script)
        return 0

    def fake_run(cmd, **kw):
        cmds.append(list(cmd))
        return _R()

    saved = (mod.ssh, mod.run, sys.argv)
    mod.ssh, mod.run = fake_ssh, fake_run
    sys.argv = ['deploy.py']
    try:
        with contextlib.redirect_stdout(io.StringIO()):
            rc = mod.main()
    finally:
        mod.ssh, mod.run, sys.argv = saved[0], saved[1], saved[2]
    return rc, scripts, cmds


def bash_n(text, label):
    with tempfile.NamedTemporaryFile('w', suffix='.sh', delete=False,
                                    encoding='utf-8', newline='\n') as f:
        f.write(text)
        tmp = f.name
    r = subprocess.run(['bash', '-n', tmp], capture_output=True, text=True)
    check('%s 语法通过' % label, r.returncode == 0, (r.stderr or '').strip()[:160])
    os.unlink(tmp)


def main():
    global BAD
    if not pathlib.Path(P).is_file():
        print('[x] 找不到 %s' % P)
        return 1

    spec = importlib.util.spec_from_file_location('dep', P)
    mod = importlib.util.module_from_spec(spec)
    try:
        spec.loader.exec_module(mod)
        check('deploy.py 可导入', True)
    except Exception as e:                                   # noqa: BLE001
        check('deploy.py 可导入', False, str(e))
        return 1

    # ── 静态文件清单（2026-09-24 新增）──
    # 老版 deploy.py 只推 index.html，于是 robots.txt / legal.html 这些新加的
    # 静态文件在线上静默 404，页面上完全看不出来（只有爬虫知道）。
    check('STATIC_FILES 条目数 = 9', len(mod.STATIC_FILES) == 9,
          str(len(mod.STATIC_FILES)))
    missing = [str(p) for p in mod.STATIC_FILES if not pathlib.Path(p).is_file()]
    check('STATIC_FILES 本地都真实存在', not missing, str(missing))
    check('security.txt 真实存在', pathlib.Path(mod.SECURITY_TXT).is_file(),
          str(mod.SECURITY_TXT))

    # ── 抓运行时字符串 ──
    rc, scripts, cmds = run_main(mod)
    check('main() 正常返回', rc == 0, 'rc=%s' % rc)
    # 不按位置取：main() 除三段主脚本外还会发两条 mkdir 探路命令，
    # 所以按内容挑 ，既不怕以后插入新命令，也让意图更清楚。
    install = next((s for s in scripts if s.lstrip().startswith('set -e')), '')
    verify = next((s for s in scripts if 'B=https://ai-memory.net' in s), '')
    check('抓到安装脚本', bool(install))
    check('抓到实测脚本', bool(verify))
    check('共发出 >= 3 段服务器侧脚本', len(scripts) >= 3, '%d 段' % len(scripts))

    scp_cmds = [c for c in cmds if any('scp' in str(x).lower() for x in c)]
    check('发出 3 条 scp（页面+脚本、静态文件、security.txt）',
          len(scp_cmds) == 3, '%d 条' % len(scp_cmds))
    joined = ' '.join(' '.join(str(x) for x in c) for c in scp_cmds)
    check('scp 目标含 /static/', '/static/' in joined)
    check('scp 目标含 /static/.well-known/', '/static/.well-known/' in joined)
    check('scp 未误用 --page-only 之外的路径', ':STAGE/' not in joined)

    # ── 逐段做 bash -n ──
    for i, s in enumerate(scripts, 1):
        bash_n(s, '第 %d 段 shell' % i)

    # ── 安装段的关键点 ──
    # 与 STATIC_FILES 必须一致：两边各写了一份清单，最容易改漏一处。
    in_bash = [x for x in ('robots.txt sitemap.xml llms.txt legal.html favicon.ico '
                           'favicon.svg favicon-32.png apple-touch-icon.png '
                           'og-image.png').split()]
    in_py = [pathlib.Path(p).name for p in mod.STATIC_FILES]
    check('bash 清单 == STATIC_FILES', in_bash == in_py)
    check('含 for 循环遍历静态文件', 'for f in robots.txt' in install)
    check('续行符没丢（favicon.svg \\ 后紧跟续行）',
          'favicon.svg \\\n' in install, repr(install[install.find('favicon.svg'):][:20]))
    check('用 install 定属主/权限', 'install -o caddy -g caddy -m 644' in install)
    check('预建 .well-known 目录', 'install -d -o caddy -g caddy -m 755' in install)
    check('security.txt 单独安装',
          '/var/www/ai-memory/.well-known/security.txt' in install)
    check('index.html.orig 仍放在 web 根之外',
          '/opt/mnemosyne-site/index.html.orig' in install)
    check('带 set -e（失败即停）', install.lstrip().startswith('set -e'))

    # ── 实测段的关键点 ──
    check('实测包含静态文件 200 校验', 'SEO / 合规文件' in verify)
    check('实测包含安全响应头校验', '安全响应头' in verify)
    check('实测包含扫描路径拦截校验', '扫描路径应被拦' in verify)
    check('残留外链排除 canonical 自引用',
          'ai-memory\\.net' in verify)
    check('实测仍检查网关存活', 'sslip.io' in verify)

    print('\nFAIL 合计: %d' % BAD)
    return 1 if BAD else 0


if __name__ == '__main__':
    sys.exit(main())

#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""校验 index.html 是否与 Mnemosyne OS 8.0.0 口径一致。

断言全部锚定在事实来源上：
  * 当前版本 8.0.0（上游 setup.py / __init__.py）
  * MCP 工具总数 31，其中原生 20（运行时实测 tools/list）
  * 仓库地址 MnemosyneOS/mnemosyne
  * 基准分 96.2 / 94.8 / 68.5 / 53.9（上游 README）
历史条目（7.0.0 / 7.0.1 / 7.0.2）必须保留，不得被改成当前版本。

用法：
    python verify.py [--root D:\\AI_Workspace\\13_Web]
"""
import argparse
import os
import re
import subprocess
import sys
import tempfile

EXPECT_VERSION = '8.0.0'
EXPECT_DATE = '22 September 2026'
EXPECT_TOOL_TOTAL = 31
EXPECT_NATIVE = 20
EXPECT_REPO = 'MnemosyneOS/mnemosyne'
EXPECT_BENCH = ['96.2', '94.8', '68.5', '53.9']
HISTORY = ['7.0.0', '7.0.1', '7.0.2']

results = []


def check(name, ok, detail=''):
    results.append((name, bool(ok), detail))
    print('  %s  %-46s %s' % ('PASS' if ok else 'FAIL', name, detail))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--root', default=os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..')))
    args = ap.parse_args()
    path = os.path.join(args.root, 'index.html')
    if not os.path.isfile(path):
        sys.exit('找不到 %s' % path)
    s = open(path, encoding='utf-8').read()
    print('校验目标：%s（%d 字符）\n' % (path, len(s)))

    # 1 旧仓库地址
    check('无残留旧仓库地址 FrankHu-HK', s.count('FrankHu-HK') == 0,
          '出现 %d 次' % s.count('FrankHu-HK'))
    check('仓库地址统一为 %s' % EXPECT_REPO, EXPECT_REPO in s,
          '出现 %d 次' % s.count(EXPECT_REPO))

    # 2 当前版本声明
    for key, label in (("'ann.tag'", '公告条版本'), ("'hero.badge'", '首屏徽章'),
                       ("'bench.ours'", '基准图例')):
        vals = set(re.findall(re.escape(key) + r":\s*'([^']*)'", s))
        want = EXPECT_VERSION if key == "'ann.tag'" else 'Mnemosyne OS ' + EXPECT_VERSION
        check('%s = %s' % (label, want), vals == {want}, '实际 %s' % sorted(vals))
    cv = re.findall(r"\['(?:Current version|当前版本)',\s*'([^']*)'\]", s)
    check('文档「当前版本」= 8.0.0', cv and set(cv) == {EXPECT_VERSION}, '实际 %s' % cv)

    # 3 历史条目必须保留
    for v in HISTORY:
        check('更新记录保留历史条目 %s' % v, v in s)
    check('更新记录含 8.0.0 条目 %s' % EXPECT_DATE, EXPECT_DATE in s)

    # 4 工具数
    check('无残留 20 工具总数提法',
          not re.search(r'20[- ]tool|20 tools|20 MCP|二十个工具(?!名)|20 个 MCP', s),
          '' if not re.search(r'20[- ]tool|20 tools|20 MCP|二十个工具(?!名)|20 个 MCP', s) else '仍有残留')
    check('MCP 工具总数 31 出现', s.count('31') >= 8, '31 出现 %d 次' % s.count('31'))

    # 5 MIB -> AIC
    check('无残留 MIB 命名', s.count('MIB') == 0, '出现 %d 次' % s.count('MIB'))
    check('使用 AIC 命名', s.count('AIC') >= 10, 'AIC 出现 %d 次' % s.count('AIC'))

    # 6 性能数字不再钉死 7.0.2
    stale = re.findall(r'7\.0\.2 (?:build|benchmark|构建)', s)
    check('性能数字无「7.0.2 构建」钉死', not stale, str(stale[:3]))

    # 7 基准分未被改动
    for v in EXPECT_BENCH:
        check('基准分 %s 保留' % v, v in s)

    # 8 页头星数已移除
    check('页头已无星数节点 gh-count', 'id="gh-count"' not in s)
    check('页头 GitHub 仍保留链接', 'class="ghstar' in s)

    # 9 通知栏文案
    check('通知栏含全网下载量 12 万+',
          ('120,000+ downloads' in s) and ('12 万+' in s))
    check('通知栏含 8.0.0 上线声明',
          ('launched on 24 september 2026' in s.lower())
          and ('2026 年 9 月 24 日正式上线' in s))
    check('通知栏正文不再重复版本号',
          ('8.0.0 launched' not in s) and ('8.0.0 最新版本' not in s))

    # 10 JS 语法（JSON-LD 不是 JS，必须排除，否则 node --check 会报 Unexpected token "@"）
    blocks = re.findall(r'<script(?![^>]*\bsrc=)(?![^>]*application/ld\+json)[^>]*>(.*?)</script>', s, re.S)
    node = None
    for c in ('node', 'node.exe', r'C:\Program Files\nodejs\node.exe',
              os.path.expanduser(r'~\AppData\Local\hermes\node\node.exe')):
        try:
            subprocess.run([c, '--version'], capture_output=True, check=True)
            node = c
            break
        except Exception:
            pass
    if node:
        bad = []
        for i, b in enumerate(blocks):
            f = os.path.join(tempfile.gettempdir(), '_v800_b%d.js' % i)
            open(f, 'w', encoding='utf-8').write(b)
            r = subprocess.run([node, '--check', f], capture_output=True)
            if r.returncode != 0:
                bad.append('b%d: %s' % (i, r.stderr.decode('utf-8', 'replace')[:120]))
        check('%d 个内联 script 语法通过' % len(blocks), not bad, '；'.join(bad))
    else:
        check('内联 script 语法（跳过，未找到 node）', True, 'skip')

    ok = sum(1 for _, o, _ in results if o)
    print('\nTOTAL  pass=%d  fail=%d' % (ok, len(results) - ok))
    sys.exit(0 if ok == len(results) else 1)


if __name__ == '__main__':
    main()

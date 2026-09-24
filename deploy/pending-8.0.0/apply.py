#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""把 pending-8.0.0 里的三个文件覆盖到站点根目录（在 13_Web 所在机器上运行）。

为什么需要这一步：从局域网共享 \\192.168.1.6\d\AI_Workspace\13_Web 写入时，
该共享对所有「已存在文件」一律拒绝写入（新建文件可以，覆盖不行）。
所以改动已打包在本目录，请在 13_Web 所在机器上执行本脚本完成覆盖。

用法：
    python apply.py            # 默认站点根 = 本目录的上两级
    python apply.py --root D:\\AI_Workspace\\13_Web
"""
import argparse
import hashlib
import os
import shutil
import sys
import time

HERE = os.path.dirname(os.path.abspath(__file__))

# (源文件, 站点内相对路径)
FILES = [
    ('index.html', 'index.html'),
    ('server.py', 'server.py'),
    ('mail-code-example.html', 'docs/mail-code-example.html'),
]


def sha256(path):
    h = hashlib.sha256()
    with open(path, 'rb') as f:
        for chunk in iter(lambda: f.read(1 << 20), b''):
            h.update(chunk)
    return h.hexdigest()


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--root', default=os.path.abspath(os.path.join(HERE, '..', '..')),
                    help='站点根目录（含 index.html）')
    ap.add_argument('--dry-run', action='store_true')
    args = ap.parse_args()
    root = os.path.abspath(args.root)
    if not os.path.isfile(os.path.join(root, 'index.html')):
        sys.exit('找不到 %s\\index.html —— 请用 --root 指定站点根目录' % root)

    stamp = time.strftime('%Y%m%d-%H%M%S')
    print('站点根：%s' % root)
    print('时间戳：%s\n' % stamp)

    for src_name, rel in FILES:
        src = os.path.join(HERE, src_name)
        dst = os.path.join(root, rel.replace('/', os.sep))
        if not os.path.isfile(src):
            sys.exit('缺少源文件：%s' % src)
        same = os.path.isfile(dst) and sha256(src) == sha256(dst)
        print('%-28s %s' % (rel, '内容已一致，跳过' if same else '待覆盖'))
        if same or args.dry_run:
            continue
        if os.path.isfile(dst):
            bak = '%s.prev-800-%s' % (dst, stamp)
            shutil.copy2(dst, bak)
            print('    备份 -> %s' % os.path.basename(bak))
        os.makedirs(os.path.dirname(dst), exist_ok=True)
        shutil.copy2(src, dst)
        print('    写入 -> %s  sha256=%s' % (dst, sha256(dst)[:16]))

    if args.dry_run:
        print('\n--dry-run：未写入任何文件')
        return
    print('\n完成。建议随后执行：')
    print('  python verify.py --root "%s"' % root)
    print('  python deploy\\deploy.py            # 发布到 A 站 ai-memory.net')


if __name__ == '__main__':
    main()

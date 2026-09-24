#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""把 /auth/* 与 /api/* 反代到本地 mnemosyne-site 服务。

只做一件事：在「主站 handle 块」之前插入两个 handle。
其余内容一字不动，并且先备份成 Caddyfile.bak-<时间戳>。
幂等：已经打过补丁就直接退出。
"""
import pathlib
import re
import shutil
import sys
import time

P = pathlib.Path('/etc/caddy/Caddyfile')
src = P.read_text(encoding='utf-8')

if 'reverse_proxy 127.0.0.1:8789' in src:
    print('[i] 已经打过补丁，无需重复')
    sys.exit(0)

m = re.search(r'^([ \t]*)handle\s*\{\s*$', src, re.M)
if not m:
    print('[!] 找不到锚点 "handle {"（主站块），已放弃，未做任何修改')
    sys.exit(1)

indent = m.group(1)
block = (
    '{i}# \u2500\u2500 GitHub \u767b\u5f55\u4e0e\u8d26\u53f7\u63a5\u53e3 \u2192 \u672c\u5730 Python \u670d\u52a1 (systemd: mnemosyne-site) \u2500\u2500\n'
    '{i}# \u5bc6\u94a5\u53ea\u5728\u670d\u52a1\u7aef\uff1b\u9759\u6001\u6587\u4ef6\u4ecd\u7531 Caddy \u76f4\u63a5\u4f3a\u670d\uff0c\u6027\u80fd\u548c\u7a33\u5b9a\u6027\u4e0d\u53d7\u5f71\u54cd\u3002\n'
    '{i}handle /auth/* {{\n'
    '{i}\treverse_proxy 127.0.0.1:8789\n'
    '{i}}}\n'
    '{i}handle /api/* {{\n'
    '{i}\treverse_proxy 127.0.0.1:8789\n'
    '{i}}}\n'
    '\n'
).format(i=indent)

new = src[:m.start()] + block + src[m.start():]

backup = P.with_name('Caddyfile.bak-' + time.strftime('%Y%m%d-%H%M%S'))
shutil.copy2(P, backup)
P.write_text(new, encoding='utf-8')

print('[ok] 已打补丁，备份 -> ' + backup.name)
print('--- 插入的块 ---')
print(block)

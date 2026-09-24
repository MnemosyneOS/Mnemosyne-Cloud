#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
把 analytics/metrics.js 接进 server.js —— 幂等、自动备份、改完做语法检查。

⚠️ 使用前提：**确认此刻没有别的会话正在编辑 server.js**。
   （server.js 是多人/多会话共用文件，同时改会互相覆盖。）

做三处最小改动（已存在就跳过）：
  1. 顶部　  const metrics = require('./metrics');
  2. 请求入口 metrics.track(req, url);          ← 记录访问量
  3. 路由区  if (p === '/api/stats') ...        ← 暴露查询接口
  4. 登录处  metrics.signIn(me.body);           ← 记录注册量（挂在 createSession 调用后）

用法：
    python patch-server.py            # 应用补丁
    python patch-server.py --check    # 只检查当前接线状态，不改文件
    python patch-server.py --revert   # 从最近备份回滚
"""
import datetime
import pathlib
import shutil
import subprocess
import sys

WEB = pathlib.Path(__file__).resolve().parent.parent      # 13_Web
SERVER = WEB / "server.js"
BACKUP = WEB / "backup"
NODE = r"C:\AI_Workspace\01_Agent\Workbuddy\Home\binaries\node\versions\22.22.2-3\node.exe"

REQUIRE_LINE = "const metrics = require('./metrics');"
ANCHOR_P = "  const p = url.pathname;"
TRACK_LINE = "\n  metrics.track(req, url);   // ← 访问量采集（analytics/metrics.js）"
ANCHOR_CATCHALL = "  if (p.indexOf('/api/') === 0 || p.indexOf('/auth/') === 0) {"
STATS_LINE = ("  if (p === '/api/stats') return metrics.handle(req, res);   "
              "// ← 访问量/注册量查询\n\n")
ANCHOR_SESSION = "      const sid = createSession(me.body);"
SIGNIN_LINE = "\n      metrics.signIn(me.body);   // ← 注册量采集"


def revert():
    baks = sorted(BACKUP.glob("server.js.bak-*"))
    if not baks:
        print("[x] 没有备份")
        return 1
    newest = baks[-1]
    shutil.copy2(newest, SERVER)
    print("[✓] 已从 %s 回滚。请重新发布应用。" % newest.name)
    return 0


def main():
    if "--revert" in sys.argv:
        return revert()

    if not SERVER.is_file():
        print("[x] 找不到 %s" % SERVER)
        return 1
    src = SERVER.read_text(encoding="utf-8")

    state = {
        "require": REQUIRE_LINE in src,
        "track": "metrics.track(req, url)" in src,
        "route": "p === '/api/stats'" in src,
        "signin": "metrics.signIn(" in src,
    }
    print("=== 当前接线状态 ===")
    for k, v in state.items():
        print("  %-10s %s" % (k, "已接 ✓" if v else "未接"))

    if "--check" in sys.argv:
        return 0 if all(state.values()) else 2

    if all(state.values()):
        print("\n[=] 已全部接好，无需改动。")
        return 0

    # ── 备份 ──
    BACKUP.mkdir(exist_ok=True)
    stamp = datetime.datetime.now().strftime("%Y%m%d-%H%M%S")
    bak = BACKUP / ("server.js.bak-" + stamp)
    shutil.copy2(SERVER, bak)
    print("\n[1] 已备份 -> %s" % bak)

    out = src
    problems = []

    # ① require：插在最后一处顶层 require 之后
    if not state["require"]:
        lines = out.split("\n")
        idx = None
        for i, l in enumerate(lines[:40]):
            if l.startswith("const ") and "require(" in l and l.rstrip().endswith(";"):
                idx = i
        if idx is None:
            problems.append("找不到 require 锚点")
        else:
            lines.insert(idx + 1, REQUIRE_LINE)
            out = "\n".join(lines)
            print("[2] 已插入 require（第 %d 行后）" % (idx + 1))
    else:
        print("[2] require 已存在，跳过")

    # ② track：插在 `const p = url.pathname;` 之后
    if not state["track"]:
        if ANCHOR_P not in out:
            problems.append("找不到 track 锚点 %r" % ANCHOR_P)
        else:
            out = out.replace(ANCHOR_P, ANCHOR_P + TRACK_LINE, 1)
            print("[3] 已插入 track")
    else:
        print("[3] track 已存在，跳过")

    # ③ 路由：插在 /api/ + /auth/ 兜底 404 之前
    if not state["route"]:
        if ANCHOR_CATCHALL not in out:
            problems.append("找不到路由锚点 %r" % ANCHOR_CATCHALL)
        else:
            out = out.replace(ANCHOR_CATCHALL, STATS_LINE + ANCHOR_CATCHALL, 1)
            print("[4] 已插入 /api/stats 路由")
    else:
        print("[4] 路由已存在，跳过")

    # ④ signIn：插在 createSession 调用之后
    if not state["signin"]:
        if ANCHOR_SESSION not in out:
            print("[5] 找不到 signIn 锚点（登录流程可能已被改写）——跳过，"
                  "注册量将只统计「当前会话」，不影响访问量")
        else:
            out = out.replace(ANCHOR_SESSION, ANCHOR_SESSION + SIGNIN_LINE, 1)
            print("[5] 已插入 signIn")
    else:
        print("[5] signIn 已存在，跳过")

    if problems:
        print("\n[x] 中止，未写入。问题：")
        for p in problems:
            print("     -", p)
        print("     （server.js 可能被改过；请人工按 analytics/README.md 接线）")
        return 3

    SERVER.write_text(out, encoding="utf-8")
    print("\n[6] 已写入 %s" % SERVER)

    # ── 语法检查 ──
    if pathlib.Path(NODE).is_file():
        r = subprocess.run([NODE, "--check", str(SERVER)],
                           capture_output=True, text=True, errors="replace")
        if r.returncode == 0:
            print("[7] node --check 通过 ✓")
        else:
            shutil.copy2(bak, SERVER)
            print("[x] 语法检查失败，已回滚：\n" + (r.stderr or "")[:800])
            return 4
    else:
        print("[7] 未找到 node，跳过语法检查（请自行确认）")

    print("\n完成。接下来：用 WorkBuddy「发布为应用」重新发布，")
    print("然后访问  https://mnemosyne-os.app.workbuddy.host/api/stats?token=<token>&format=html")
    print("token 在部署后的 .data/metrics.token（也会打印在服务启动日志里）")
    print("回滚：python patch-server.py --revert")
    return 0


if __name__ == "__main__":
    sys.exit(main())

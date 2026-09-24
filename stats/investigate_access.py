#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""全量排查 ai-memory.net 的访问痕迹。

输出：
  1. 日志文件清单
  2. 逐条请求明细表（时间/客户端IP/方法/主机/路径/状态/UA）
  3. 按 IP、UA、路径、状态码、主机 汇总
  4. 时间分布
  5. 区分「本机测试(127.0.0.1)」与「外部真实访客」
"""
import collections
import datetime
import glob
import gzip
import json
import os
import re
import sys

LOG_GLOB = "/var/log/caddy/access.log*"
BJ = datetime.timezone(datetime.timedelta(hours=8))

BOT = re.compile(
    r"bot|spider|crawl|slurp|curl|wget|python|go-http|headless|scrapy|"
    r"semrush|ahrefs|mj12|dotbot|petal|yandex|facebookexternalhit",
    re.I,
)


def bjt(ts):
    try:
        return datetime.datetime.fromtimestamp(float(ts), BJ).strftime("%m-%d %H:%M:%S")
    except Exception:
        return "?"


def files():
    return sorted(glob.glob(LOG_GLOB))


def read_all():
    recs, bad = [], 0
    for path in files():
        opener = gzip.open if path.endswith(".gz") else open
        try:
            with opener(path, "rt", encoding="utf-8", errors="replace") as fh:
                for ln in fh:
                    ln = ln.strip()
                    if not ln:
                        continue
                    if not ln.startswith("{"):
                        bad += 1
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
                    recs.append({
                        "ts": d.get("ts", 0),
                        "ip": r.get("client_ip") or r.get("remote_ip") or "-",
                        "rport": r.get("remote_port", "-"),
                        "method": r.get("method", "-"),
                        "host": r.get("host", "-"),
                        "uri": r.get("uri", "-"),
                        "proto": r.get("proto", "-"),
                        "ua": (h.get("User-Agent") or ["-"])[0],
                        "referer": (h.get("Referer") or ["-"])[0],
                        "status": d.get("status", 0),
                        "bytes": d.get("size", 0),
                        "dur": d.get("duration", 0),
                        "src": os.path.basename(path),
                    })
        except OSError as e:
            print("    [warn] 读不了 %s: %s" % (path, e))
    return recs, bad


def main():
    print("=" * 100)
    print(" 全量排查：ai-memory.net 访问痕迹")
    print(" 排查时间:", datetime.datetime.now(BJ).strftime("%Y-%m-%d %H:%M:%S"), "(北京时间)")
    print("=" * 100)

    print("\n【1】日志文件清单")
    for p in files():
        st = os.stat(p)
        print("    %-46s %9d B   最后写入 %s"
              % (p, st.st_size,
                 datetime.datetime.fromtimestamp(st.st_mtime, BJ).strftime("%m-%d %H:%M:%S")))
    print("    (目录 /var/log/caddy —— 只有这些文件，没有更早的历史)")

    recs, bad = read_all()
    print("\n【2】可解析记录: %d 条   非 JSON 行: %d" % (len(recs), bad))
    if not recs:
        print("    （没有任何记录）")
        return

    recs.sort(key=lambda x: x["ts"])
    t0, t1 = bjt(recs[0]["ts"]), bjt(recs[-1]["ts"])
    print("    时间范围: %s  →  %s  (北京时间)" % (t0, t1))
    span = (recs[-1]["ts"] - recs[0]["ts"]) / 60.0
    print("    跨度: %.1f 分钟，平均 %.2f 请求/分钟" % (span, len(recs) / max(span, 0.01)))

    # ── 逐条明细 ──
    print("\n【3】逐条请求明细（全部 %d 条）" % len(recs))
    print("    %-15s %-15s %-4s %-24s %-34s %-4s %s"
          % ("时间(北京)", "客户端IP", "方法", "主机", "路径", "码", "UA"))
    print("    " + "-" * 130)
    for r in recs:
        uri = (r["uri"] or "")[:34]
        ua = (r["ua"] or "")[:46]
        print("    %-15s %-15s %-4s %-24s %-34s %-4s %s"
              % (bjt(r["ts"]), r["ip"], r["method"], r["host"][:24], uri, r["status"], ua))

    # ── 按 IP ──
    print("\n【4】按客户端 IP 汇总")
    byip = collections.Counter(r["ip"] for r in recs)
    for ip, c in byip.most_common():
        sub = [r for r in recs if r["ip"] == ip]
        uas = sorted({(r["ua"] or "-")[:60] for r in sub})
        hosts = sorted({r["host"] for r in sub})
        tag = "★本机/内网测试" if ip.startswith(("127.", "10.", "172.", "192.168.", "35.227.140.175")) else "外部访客"
        print("    %-16s %3d 次   [%s]" % (ip, c, tag))
        print("        主机: %s" % ", ".join(hosts))
        for u in uas[:3]:
            print("        UA: %s" % u)

    external = [r for r in recs if not r["ip"].startswith(("127.", "10.", "172.", "192.168."))]
    print("\n    → 外部（非本机回环）请求: %d 条，来自 %d 个不同 IP"
          % (len(external), len({r["ip"] for r in external})))

    # ── 按路径 ──
    print("\n【5】按路径汇总（前 20）")
    for p, c in collections.Counter((r["uri"] or "").split("?")[0] for r in recs).most_common(20):
        print("    %-52s %d" % (p[:52], c))

    # ── 状态码 ──
    print("\n【6】状态码分布")
    for s, c in collections.Counter(r["status"] for r in recs).most_common():
        print("    %s : %d" % (s, c))

    # ── 协议 / 主机 ──
    print("\n【7】主机 & 协议")
    for h, c in collections.Counter(r["host"] for r in recs).most_common():
        print("    主机 %-26s %d" % (h, c))
    for p, c in collections.Counter(r["proto"] for r in recs).most_common():
        print("    协议 %-26s %d" % (p, c))

    # ── 时间分布（按分钟） ──
    print("\n【8】时间分布（按分钟）")
    permin = collections.Counter(
        datetime.datetime.fromtimestamp(float(r["ts"]), BJ).strftime("%H:%M") for r in recs)
    for m in sorted(permin):
        print("    %s  %s (%d)" % (m, "█" * min(permin[m], 60), permin[m]))

    # ── UA 类型 ──
    print("\n【9】UA 分类")
    bots = sum(1 for r in recs if BOT.search(r["ua"] or ""))
    print("    爬虫/命令行 UA : %d" % bots)
    print("    疑似真人浏览器 : %d" % (len(recs) - bots))

    # ── 页面级 PV（排除静态资源） ──
    ASSET = re.compile(r"\.(js|css|woff2?|ttf|png|jpe?g|svg|ico|map|gif|webp)$", re.I)
    pv = [r for r in recs if not ASSET.search((r["uri"] or "").split("?")[0])
          and not (r["uri"] or "").startswith("/assets")]
    print("\n【10】页面访问量（PV，已排除静态资源）: %d" % len(pv))
    ext_pv = [r for r in pv if not r["ip"].startswith(("127.", "10.", "172.", "192.168."))]
    print("     其中来自外部 IP: %d" % len(ext_pv))
    for r in pv[:40]:
        print("     %s  %-15s %s  %s" % (bjt(r["ts"]), r["ip"], r["status"], r["uri"][:60]))


if __name__ == "__main__":
    main()

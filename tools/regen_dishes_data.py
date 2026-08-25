#!/usr/bin/env python3
"""tools/regen_dishes_data.py —— 从 dishes.json 重新生成小程序本地 fallback

为什么需要：
    mini-app/miniprogram/utils/dishes-data.js 是小程序本地打包的菜谱数据
    （云数据库未 seed 时降级用）。它是早期手工嵌入的快照，43 道菜的
    steps/tip 都是 null。本脚本用最新的 dishes.json 重新生成，让小程序
    本地 fallback 也有完整的 9 字段。

用法：
    python3 tools/regen_dishes_data.py                # 实际写入
    python3 tools/regen_dishes_data.py --dry-run      # 只显示统计

何时跑：
    - 第一次跑 sync_full_data.py 之后（一次性）
    - 平时加菜后不必跑（小程序的 getDishes 云函数会从 dishes.json 拉）
"""
import argparse
import json
import sys
from pathlib import Path

PROJECT_DIR = Path(__file__).parent.parent
DISHES_JSON = PROJECT_DIR / "dishes.json"
DISHES_DATA_JS = PROJECT_DIR / "mini-app" / "miniprogram" / "utils" / "dishes-data.js"

HEADER = "// Auto-generated from dishes.json —— 不要手动改\nmodule.exports = "


def main():
    parser = argparse.ArgumentParser(description="从 dishes.json 重新生成小程序本地 fallback")
    parser.add_argument("--dry-run", action="store_true", help="只统计不写")
    args = parser.parse_args()

    if not DISHES_JSON.exists():
        print(f"❌ 找不到 {DISHES_JSON}")
        sys.exit(1)

    data = json.loads(DISHES_JSON.read_text(encoding="utf-8"))

    # 统计
    empty_steps = sum(1 for d in data if not d.get("steps"))
    empty_tips = sum(1 for d in data if not d.get("tip"))
    print(f"📖 dishes.json: {len(data)} 道菜")
    print(f"  - steps 为空: {empty_steps} 道")
    print(f"  - tip 为空: {empty_tips} 道")

    if args.dry_run:
        return

    # 生成内容（保持和原文件一样的缩进：每层 2 空格）
    body = json.dumps(data, ensure_ascii=False, indent=2)
    content = HEADER + body + ";\n"

    DISHES_DATA_JS.write_text(content, encoding="utf-8")
    print(f"✅ 已写入 {DISHES_DATA_JS.relative_to(PROJECT_DIR)}")


if __name__ == "__main__":
    main()
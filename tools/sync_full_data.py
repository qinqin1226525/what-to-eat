#!/usr/bin/env python3
"""tools/sync_full_data.py —— 一次性脚本：从 app.html 回写完整 9 字段到 dishes.json

为什么需要：
    app.html 的 DISHES_DATA 含完整 9 字段（含手工补的 seasonings/steps/tip），
    dishes.json 只有 5 字段。这个漂移是历史遗留——以前只把基础数据同步到
    dishes.json，烹饪步骤只在 app.html 维护。
    本脚本把 app.html 的完整数据回写到 dishes.json，让 dishes.json 升级到 9 字段，
    之后三份数据（dishes.json / app.html / 小程序 seedDishes）才能彻底同步。

用法：
    python3 tools/sync_full_data.py                # 实际回写（会备份原文件）
    python3 tools/sync_full_data.py --dry-run      # 只看不写

合并策略：
    - 基础字段（name/time_minutes/role/tags/ingredients）：以 dishes.json 为准
      （万一有人手改过 dishes.json 但没同步到 app.html，保留用户最新意图）
    - 完整字段（nutrition/seasonings/steps/tip）：从 app.html 拉过来
      （app.html 是手工补烹饪数据的唯一地方）
    - 菜名以 dishes.json 顺序为准（source of truth）

执行后：
    1. python3 tools/seed_export.py    # 同步到小程序 seedDishes
    2. python3 tools/safety_check.py    # 验证 8/8 全过
"""
import argparse
import json
import shutil
import sys
from datetime import datetime
from pathlib import Path

# 让 import check_sync 可用
sys.path.insert(0, str(Path(__file__).parent))
from check_sync import load_html_dishes  # noqa: E402

PROJECT_DIR = Path(__file__).parent.parent
DISHES_JSON = PROJECT_DIR / "dishes.json"


def main():
    parser = argparse.ArgumentParser(
        description="从 app.html 回写完整 9 字段到 dishes.json"
    )
    parser.add_argument("--dry-run", action="store_true",
                        help="只显示会怎么改，不写文件")
    args = parser.parse_args()

    # 1) 备份
    if not args.dry_run and DISHES_JSON.exists():
        bak = DISHES_JSON.with_suffix(
            f".json.bak.{datetime.now().strftime('%Y%m%d_%H%M%S')}"
        )
        shutil.copy2(DISHES_JSON, bak)
        print(f"📦 备份原文件 → {bak.relative_to(PROJECT_DIR)}")

    # 2) 加载 dishes.json（5 字段）
    json_dishes = json.loads(DISHES_JSON.read_text(encoding="utf-8"))
    print(f"📖 dishes.json: {len(json_dishes)} 道菜")

    # 3) 加载 app.html DISHES_DATA（9 字段）
    html_dishes = load_html_dishes()
    print(f"📖 app.html: {len(html_dishes)} 道菜")

    # 4) 按菜名建索引
    html_by_name = {d["name"]: d for d in html_dishes}
    if len(html_by_name) != len(html_dishes):
        print(f"⚠️  app.html 有 {len(html_dishes) - len(html_by_name)} 道重名菜")

    # 5) 合并
    enriched = []
    stats = {"had_full_data": 0, "missing_in_html": 0}
    for jd in json_dishes:
        name = jd["name"]
        # 基础字段来自 dishes.json
        merged = {
            "name": jd["name"],
            "time_minutes": jd["time_minutes"],
            "role": jd["role"],
            "tags": jd.get("tags", []),
            "ingredients": jd.get("ingredients", []),
        }
        # 完整字段从 app.html 拉
        hd = html_by_name.get(name)
        if hd:
            # nutrition: 只有真正有值才写（默认 None 就不写，保持和 app.html 一致）
            n = hd.get("nutrition")
            if n is not None:
                merged["nutrition"] = n
            merged["seasonings"] = hd.get("seasonings", [])
            merged["steps"] = hd.get("steps", [])
            merged["tip"] = hd.get("tip", "")
            if any([hd.get("seasonings"), hd.get("steps"), hd.get("tip")]):
                stats["had_full_data"] += 1
        else:
            # app.html 里没有（理论上不应该）→ 默认空
            merged["seasonings"] = []
            merged["steps"] = []
            merged["tip"] = ""
            stats["missing_in_html"] += 1
            print(f"  ⚠️  app.html 里没有: {name}")
        enriched.append(merged)

    # 6) 统计
    print()
    print("📊 合并统计：")
    print(f"  - 总菜数: {len(enriched)}")
    print(f"  - app.html 有完整数据的: {stats['had_full_data']} 道")
    print(f"  - app.html 缺失的: {stats['missing_in_html']} 道")
    print()
    print("📝 字段示例（前 2 条 + 后 1 条）：")
    for d in enriched[:2] + [enriched[-1]]:
        print(f"  {d['name']}:")
        print(f"    tags = {d.get('tags')}")
        print(f"    ingredients = {d.get('ingredients')}")
        print(f"    seasonings = {d.get('seasonings')}")
        print(f"    steps = {d.get('steps')[:2] if d.get('steps') else '[]'}...")
        print(f"    tip = {d.get('tip')!r}")

    if args.dry_run:
        print()
        print("🔍 --dry-run：不写文件")
        return

    # 7) 写回（保留缩进、ensure_ascii=False 让中文可读）
    DISHES_JSON.write_text(
        json.dumps(enriched, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    print()
    print(f"✅ 已写入 {DISHES_JSON.relative_to(PROJECT_DIR)}")
    print()
    print("📋 下一步：")
    print("  1. python3 tools/check_sync.py         # 确认 117 道菜字段一致")
    print("  2. python3 tools/seed_export.py         # 同步到小程序 seedDishes")
    print("  3. python3 tools/safety_check.py        # 跑整体 8/8 检查")


if __name__ == "__main__":
    main()
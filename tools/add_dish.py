#!/usr/bin/env python3
"""添加新菜到 dishes.json 和 app.html（同步两处）。

用法：
    python3 tools/add_dish.py "菜名"
    python3 tools/add_dish.py "红烧排骨" --role 主菜 --time 50

交互式输入剩余字段（tags/ingredients/seasonings/steps/tip）。
完成后自动跑同步校验 + 测试。可选 --commit / --push 自动提交推送。
"""
import argparse
import json
import re
import subprocess
import sys
from pathlib import Path

PROJECT_DIR = Path(__file__).parent.parent
DISHES_JSON = PROJECT_DIR / "dishes.json"
APP_HTML = PROJECT_DIR / "app.html"

VALID_ROLES = ["主菜", "汤", "主食", "凉菜", "早餐"]

# 一些常见标签建议
TAG_SUGGESTIONS = {
    "主菜": ["家常", "简单", "快手", "下饭", "硬菜", "清淡", "小孩爱", "营养", "待客", "素食"],
    "汤": ["清淡", "慢炖", "快手", "甜汤", "家常"],
    "主食": ["基础", "快手", "面食", "剩饭妙用"],
    "凉菜": ["简单", "快手", "开胃", "下酒"],
    "早餐": ["简单", "快手", "清淡", "小孩爱", "营养"],
}


def ask(question, default=""):
    """交互式提问，回车用默认值。"""
    if default:
        prompt = f"{question} [{default}]: "
    else:
        prompt = f"{question}: "
    answer = input(prompt).strip()
    return answer if answer else default


def consume_stdin_line():
    """消耗 stdin 的一行（用于 --role/--time 已传时保持 stdin 对齐）。
    不要返回任何值，只是把那一行从 stdin 里读掉。
    """
    try:
        input()
    except EOFError:
        pass


def ask_list(question, examples=None, allow_multi_line=True):
    """交互式问列表。
    allow_multi_line=True 时可以一次输入多项（每行一项，空行结束），
    allow_multi_line=False 时单行输入（空格分隔多项）。
    """
    if examples:
        examples_str = "（如：" + " ".join(examples[:5]) + "）"
    else:
        examples_str = ""
    print(f"\n{question} {examples_str}")
    if not allow_multi_line:
        # 单行模式：读一行，split，退出
        try:
            item = input("  > ").strip()
        except EOFError:
            return []
        return item.split() if item else []
    # 多行模式（默认）
    print("  每行一项，空行结束")
    items = []
    while True:
        try:
            item = input("  > ").strip()
        except EOFError:
            break
        if not item:
            break
        items.append(item)
    return items


def load_dishes():
    with open(DISHES_JSON, encoding="utf-8") as f:
        return json.load(f)


def save_dishes(dishes):
    with open(DISHES_JSON, "w", encoding="utf-8") as f:
        json.dump(dishes, f, ensure_ascii=False, indent=2)


def dish_exists(name, dishes):
    return any(d["name"] == name for d in dishes)


def json_dish_to_html_block(dish):
    """把 JSON 菜谱转成 JS 对象字面量（与 app.html DISHES_DATA 格式一致）。"""
    lines = []
    lines.append("  {")
    lines.append(f"    name: {json.dumps(dish['name'], ensure_ascii=False)}, "
                 f"time_minutes: {dish['time_minutes']}, "
                 f"role: {json.dumps(dish['role'], ensure_ascii=False)},")
    tags_json = json.dumps(dish.get("tags", []), ensure_ascii=False)
    lines.append(f"    tags: {tags_json},")
    ingredients_json = json.dumps(dish.get("ingredients", []), ensure_ascii=False)
    lines.append(f"    ingredients: {ingredients_json},")
    if dish.get("seasonings"):
        seasonings_json = json.dumps(dish["seasonings"], ensure_ascii=False)
        lines.append(f"    seasonings: {seasonings_json},")
    if dish.get("steps"):
        steps_json = json.dumps(dish["steps"], ensure_ascii=False)
        lines.append("    steps: [")
        # JS 数组用 \\n 换行（app.html 里 JS 字符串里的换行）
        for i, step in enumerate(dish["steps"]):
            escaped = step.replace('"', '\\"').replace("\\", "\\\\")
            comma = "," if i < len(dish["steps"]) - 1 else ""
            lines.append(f'      "{escaped}"{comma}')
        lines.append("    ],")
    if dish.get("tip"):
        tip = dish["tip"].replace('"', '\\"').replace("\\", "\\\\")
        lines.append(f'    tip: "{tip}"')
    else:
        # 去掉最后一行的逗号
        if lines[-1].endswith(","):
            lines[-1] = lines[-1][:-1]
    # 注意：末尾不加 "," — 由 append_to_app_html 统一加，避免双逗号
    lines.append("  }")
    return "\n".join(lines)


def append_to_app_html(dish):
    """在 app.html 的 DISHES_DATA 数组末尾追加新菜。"""
    html = APP_HTML.read_text(encoding="utf-8")

    # 找 DISHES_DATA 的右括号 ]; 位置（在最后一个 dish 之后）
    # 用正则找 "];\n" 但要确认是 DISHES_DATA 那个，不是别的数组
    # 简单办法：找最后一个 "  }\n];" 之前的 "},\n" 替换成 "},\n新菜" 之前的 "}\n];" 替换成 "},\n新菜\n];"

    # 找 DISHES_DATA 结束的位置
    # 看 app.html 里 DISHES_DATA 常量的结尾
    match = re.search(
        r"(const\s+DISHES_DATA\s*=\s*\[.*?)(\n\];\s*\n)",
        html,
        re.DOTALL,
    )
    if not match:
        raise RuntimeError("在 app.html 里找不到 DISHES_DATA 常量")

    dish_array = match.group(1)
    end = match.group(2)

    # 最后一个菜应该是 "  }"（无逗号），改成 "  },"
    # 找最后一个 "  }" 替换成 "  },"
    # 用 rfind
    last_brace_idx = dish_array.rfind("  }")
    if last_brace_idx == -1:
        raise RuntimeError("DISHES_DATA 格式异常：找不到 '  }'")

    new_dish_html = json_dish_to_html_block(dish)
    new_array = (
        dish_array[:last_brace_idx + 3]
        + ","
        + "\n"
        + new_dish_html
        + dish_array[last_brace_idx + 3 :]
    )

    new_html = html.replace(match.group(0), new_array + end)
    APP_HTML.write_text(new_html, encoding="utf-8")


def run(cmd, **kwargs):
    """跑 shell 命令并返回 (returncode, stdout)。"""
    print(f"  $ {' '.join(cmd) if isinstance(cmd, list) else cmd}")
    result = subprocess.run(
        cmd,
        cwd=PROJECT_DIR,
        capture_output=True,
        text=True,
        **kwargs,
    )
    if result.stdout:
        print(result.stdout)
    if result.stderr and result.returncode != 0:
        print(result.stderr, file=sys.stderr)
    return result.returncode


def git_has_changes():
    """检查工作区是否有改动。"""
    result = subprocess.run(
        ["git", "status", "--porcelain"],
        cwd=PROJECT_DIR,
        capture_output=True,
        text=True,
    )
    return bool(result.stdout.strip())


def main():
    parser = argparse.ArgumentParser(description="添加新菜到 dishes.json 和 app.html")
    parser.add_argument("name", help="菜名（必填）")
    parser.add_argument("--role", choices=VALID_ROLES, help="角色（主菜/汤/主食/凉菜/早餐）")
    parser.add_argument("--time", type=int, help="耗时（分钟）")
    parser.add_argument("--commit", action="store_true", help="添加完自动 git commit")
    parser.add_argument("--push", action="store_true", help="添加完自动 git push")
    parser.add_argument("--skip-test", action="store_true", help="跳过测试")
    args = parser.parse_args()

    print(f"\n🥢 添加新菜：{args.name}\n")

    # 1. 检查重复
    dishes = load_dishes()
    if dish_exists(args.name, dishes):
        print(f"❌ 错误：{args.name} 已存在！")
        sys.exit(1)

    # 2. 询问 role
    # 关键：如果 --role 已传，消耗 stdin 一行保持后续输入对齐（避免错位）
    role = args.role or ask("角色 role", "主菜")
    if role not in VALID_ROLES:
        print(f"❌ 角色必须是 {VALID_ROLES} 之一")
        sys.exit(1)
    if args.role:
        consume_stdin_line()

    # 3. 询问 time_minutes
    if args.time:
        time_minutes = args.time
        consume_stdin_line()  # 保持 stdin 对齐
    else:
        time_str = ask("耗时（分钟）", "30")
        try:
            time_minutes = int(time_str)
        except ValueError:
            print(f"❌ 耗时必须是整数，收到：{time_str}")
            sys.exit(1)

    # 4. 询问 tags（建议列表）
    print(f"\n标签 tags（空格分隔，可选）")
    print(f"  建议：{' '.join(TAG_SUGGESTIONS.get(role, []))}")
    tags_input = ask("输入标签", "")
    tags = tags_input.split() if tags_input else []

    # 5. 询问 ingredients（每行一项，支持数量写在同一行）
    ingredients = ask_list("食材 ingredients", ["五花肉 500g", "鸡蛋 2 个", "葱"], allow_multi_line=True)

    # 6. 可选 seasonings（每行一项）
    seasonings = ask_list("调料 seasonings（可选，回车跳过）", allow_multi_line=True)

    # 7. 可选 steps（多行模式）
    print(f"\n步骤 steps（可选，回车跳过）")
    print(f"  每行一步，空行结束")
    steps = ask_list("步骤", allow_multi_line=True)

    # 8. 可选 tip
    tip = ask("\n小贴士 tip（可选）", "")

    # 9. 构造 dish 字典
    dish = {
        "name": args.name,
        "time_minutes": time_minutes,
        "role": role,
        "tags": tags,
        "ingredients": ingredients,
    }
    if seasonings:
        dish["seasonings"] = seasonings
    if steps:
        dish["steps"] = steps
    if tip:
        dish["tip"] = tip

    # 10. 预览
    print("\n" + "=" * 40)
    print("即将添加：")
    print(json.dumps(dish, ensure_ascii=False, indent=2))
    print("=" * 40)
    if not ask("\n确认添加？(y/n)", "y").lower().startswith("y"):
        print("已取消。")
        sys.exit(0)

    # 11. 写入两个文件
    dishes.append(dish)
    save_dishes(dishes)
    print(f"✅ {DISHES_JSON} 已更新")

    append_to_app_html(dish)
    print(f"✅ {APP_HTML} 已更新")

    # 11.5 自我验证：检查是否写出 '},,' 双逗号（历史 bug：Day 20 加菜后产生过）
    html = APP_HTML.read_text(encoding="utf-8")
    if re.search(r"\},,", html):
        print("❌ app.html 出现 '},,' 双逗号 —— 立即中止！请人工检查或 git checkout 恢复。")
        sys.exit(1)

    # 12. 同步校验
    print("\n🔍 跑同步校验...")
    rc = run(["python3", "tools/check_sync.py"])
    if rc != 0:
        print("❌ 同步校验失败，请检查 app.html 格式")
        sys.exit(1)

    # 13. 测试
    if not args.skip_test:
        print("\n🧪 跑测试...")
        rc = run(["python3", "-m", "unittest", "discover", "-s", ".", "-v"])
        if rc != 0:
            print("⚠️  有测试失败，但菜已添加")

    # 14. 可选 commit / push
    if args.commit or args.push:
        if not git_has_changes():
            print("\n没有改动，跳过 commit/push")
        else:
            msg = f"加菜：{args.name}"
            print(f"\n📝 git commit: {msg}")
            rc = run(["git", "add", "dishes.json", "app.html"])
            rc = run(["git", "commit", "-m", msg])
            if args.push:
                print(f"\n📤 git push")
                rc = run(["git", "push", "origin", "main"])

    print(f"\n🎉 完成！{args.name} 已添加。")
    if not (args.commit or args.push):
        print(f"\n提示：commit + push:")
        print(f"  git add dishes.json app.html")
        print(f"  git commit -m '加菜：{args.name}'")
        print(f"  git push origin main")


if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        print("\n\n已中断。")
        sys.exit(130)
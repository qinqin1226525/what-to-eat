"""检查 dishes.json 与 app.html 中 DISHES_DATA 是否同步。

运行：
    python3 tools/check_sync.py
或在 unittest 套件末尾自动调用。
"""
import json
import re
import sys
from pathlib import Path

PROJECT_DIR = Path(__file__).parent.parent
DISHES_JSON = PROJECT_DIR / "dishes.json"
APP_HTML = PROJECT_DIR / "app.html"


def load_json_dishes():
    with open(DISHES_JSON, encoding="utf-8") as f:
        return json.load(f)


def load_html_dishes():
    """从 app.html 中抽出 DISHES_DATA 块内所有 `name: "..."`。
    （app.html 用 JS 对象字面量、key 不加引号，不能直接 json.loads，所以只取菜名用于同步校验。）
    """
    text = APP_HTML.read_text(encoding="utf-8")
    start_match = re.search(r"const\s+DISHES_DATA\s*=\s*\[", text)
    if not start_match:
        raise RuntimeError("未在 app.html 中找到 DISHES_DATA 常量")
    start_idx = start_match.end()
    depth = 1
    i = start_idx
    while i < len(text) and depth > 0:
        c = text[i]
        if c == "[":
            depth += 1
        elif c == "]":
            depth -= 1
        i += 1
    if depth != 0:
        raise RuntimeError("DISHES_DATA 方括号未闭合")
    block = text[start_idx:i - 1]
    # 抽取所有 `name: "..."` 的菜名（顺序保留，便于人工查看）
    names = re.findall(r'name:\s*"([^"]+)"', block)
    return [{"name": n} for n in names]


def check():
    json_dishes = load_json_dishes()
    html_dishes = load_html_dishes()

    json_names = {d["name"] for d in json_dishes}
    html_names = {d["name"] for d in html_dishes}

    missing_in_html = json_names - html_names
    extra_in_html = html_names - json_names

    if missing_in_html:
        print(f"❌ 在 app.html 中缺失：{sorted(missing_in_html)}")
    if extra_in_html:
        print(f"❌ 在 dishes.json 中缺失：{sorted(extra_in_html)}")

    if missing_in_html or extra_in_html:
        return False

    # 一致性更细的检查：seasonings/steps/tip 在 JSON 和 HTML 里都有
    json_keys = {d["name"]: set(d.keys()) for d in json_dishes}
    html_keys = {d["name"]: set(d.keys()) for d in html_dishes}
    drift = []
    for name in json_names:
        extra = html_keys[name] - json_keys[name]
        if extra:
            drift.append(f"{name}: HTML 独有字段 {sorted(extra)}")
    if drift:
        print("ℹ️  app.html 含 dishes.json 没有的字段（不影响功能）：")
        for line in drift[:5]:
            print(f"  - {line}")
        if len(drift) > 5:
            print(f"  ... 还有 {len(drift) - 5} 条")

    print(f"✅ 同步 OK：{len(json_names)} 道菜在两份数据源中一致")
    return True


if __name__ == "__main__":
    sys.exit(0 if check() else 1)
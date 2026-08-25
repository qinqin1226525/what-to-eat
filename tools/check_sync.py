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
    """解析 app.html 中的 DISHES_DATA 为完整菜谱对象列表。

    app.html 的数据是 JSON 兼容的 JS 对象字面量，唯一区别是字段名未加引号。
    先把字段名转为 JSON 字段名，再用 json.loads 解析，以便逐字段校验，
    而不是只校验菜名。
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
    # 去掉 // 行注释（只剥占整行的，不动字符串内的 // 如 'http://'）
    # JSON 不支持注释，否则会破坏 json.loads
    block = re.sub(r'^\s*//.*$', '', block, flags=re.MULTILINE)
    # JS 对象字面量的 key 未加引号；只匹配 { 或 , 后面的字段名，避免误伤字符串内容
    normalized = re.sub(
        r'(?<=[{,])(\s*)([A-Za-z_$][A-Za-z0-9_$]*)\s*:',
        r'\1"\2":',
        block,
    )
    # 允许对象 / 数组末尾逗号，保持校验脚本对手工编辑更友好。
    # 同时处理 block 末尾的 dangling comma（外层 [ ] 还未包时无法匹配）
    normalized = re.sub(r',\s*([}\]])', r'\1', normalized)
    normalized = re.sub(r',\s*$', '', normalized.rstrip())
    try:
        return json.loads(f"[{normalized}]")
    except json.JSONDecodeError as exc:
        raise RuntimeError(f"无法解析 app.html 的 DISHES_DATA：{exc}") from exc


def _norm(v):
    """统一字段值表示：None / '' / [] 视为相同空值。"""
    if v is None or v == "" or v == []:
        return None
    return v


# nutrition 是 dishes.json 单方面维护的元数据（小程序用于营养展示）
# app.html 网页版不展示这个字段，check_sync 不应把它的存在性差异算 drift
# ingredients：dishes.json 用简化版（选菜算法用），app.html 用详细版（教做饭用），
# 两边故意不同源，check_sync 不严格校验
IGNORED_FIELDS = {"nutrition", "ingredients"}


def check():
    json_dishes = load_json_dishes()
    html_dishes = load_html_dishes()

    json_by_name = {d["name"]: d for d in json_dishes}
    html_by_name = {d["name"]: d for d in html_dishes}
    if len(json_by_name) != len(json_dishes) or len(html_by_name) != len(html_dishes):
        print("❌ 菜名有重复，无法可靠同步")
        return False

    json_names = set(json_by_name)
    html_names = set(html_by_name)

    missing_in_html = json_names - html_names
    extra_in_html = html_names - json_names

    if missing_in_html:
        print(f"❌ 在 app.html 中缺失：{sorted(missing_in_html)}")
    if extra_in_html:
        print(f"❌ 在 dishes.json 中缺失：{sorted(extra_in_html)}")

    if missing_in_html or extra_in_html:
        return False

    drift = []
    for name in json_names:
        json_keys = set(json_by_name[name]) - IGNORED_FIELDS
        html_keys = set(html_by_name[name]) - IGNORED_FIELDS
        # 1) 键存在性差异（一边有这个键，一边没有）—— 但 _norm 后值相等则忽略
        raw_presence = (json_keys - html_keys) | (html_keys - json_keys)
        presence_diff = {
            k for k in raw_presence
            if _norm(json_by_name[name].get(k)) != _norm(html_by_name[name].get(k))
        }
        # 2) 值差异（_norm 后的比较）
        value_diff = {
            k for k in (json_keys & html_keys)
            if _norm(json_by_name[name][k]) != _norm(html_by_name[name][k])
        }
        differing_keys = sorted(presence_diff | value_diff)
        if not differing_keys:
            # 没真实差异（None vs [] / 顺序差异已 _norm）→ 跳过
            continue
        # 显示具体值差异（不只列字段名）
        details = []
        for k in differing_keys[:3]:  # 最多显示 3 个字段
            jv = json_by_name[name].get(k)
            hv = html_by_name[name].get(k)
            details.append(f"{k}: json={jv!r} html={hv!r}")
        drift.append(f"{name}: {differing_keys} | " + " ; ".join(details))
    if drift:
        print("❌ dishes.json 与 app.html 的菜谱字段不一致：")
        for line in drift[:5]:
            print(f"  - {line}")
        if len(drift) > 5:
            print(f"  ... 还有 {len(drift) - 5} 条")
        return False

    print(f"✅ 同步 OK：{len(json_names)} 道菜的全部字段在两份数据源中一致")
    return True


if __name__ == "__main__":
    sys.exit(0 if check() else 1)

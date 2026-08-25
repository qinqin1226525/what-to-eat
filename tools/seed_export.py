#!/usr/bin/env python3
"""tools/seed_export.py —— 把 dishes.json 同步到小程序 seedDishes 云函数

为什么需要：
    dishes.json（5 字段：name/time_minutes/role/tags/ingredients）
    和 cloudfunctions/seedDishes/index.js（9 字段，含手工补的
    nutrition/seasonings/steps/tip）是两份独立数据，加菜时容易漂移。
    本脚本让 dishes.json 成为"菜谱清单"的唯一真相源，自动重写
    seedDishes 的 DISHES_DATA 数组，同时保留手工补全的"完整数据"。

用法：
    python3 tools/seed_export.py                # 实际写入 seedDishes/index.js
    python3 tools/seed_export.py --check        # 只检查一致性，不写（CI 友好）
    python3 tools/seed_export.py --dry-run      # 打印生成的内容到 stdout

工作流（加菜时）：
    1. 改 dishes.json（用 tools/add_dish.py 或手改）
    2. python3 tools/seed_export.py
    3. 微信开发者工具 → 右键 seedDishes/ → 上传并部署
    4. 小程序「我的」页 → 重新上传菜谱到云端
    5. python3 tools/safety_check.py 验证

合并策略：
    - 菜名以 dishes.json 为准（顺序、数量都由它决定）
    - 5 个基础字段（name/time_minutes/role/tags/ingredients）以 dishes.json 为最新
    - 4 个完整字段（nutrition/seasonings/steps/tip）从现有 seedDishes 保留
      （dishes.json 没有这些字段时用空值）
    - 现有 seedDishes 有但 dishes.json 没有的菜：丢弃（dishes.json 是 source of truth）
"""
import argparse
import json
import re
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

PROJECT_DIR = Path(__file__).parent.parent
DISHES_JSON = PROJECT_DIR / "dishes.json"
SEED_INDEX_JS = PROJECT_DIR / "mini-app" / "cloudfunctions" / "seedDishes" / "index.js"

# ===== seedDishes/index.js 模板 =====

HEADER = '''// 云函数：seedDishes —— 把 {count} 道菜上传到云数据库
// 数据自动从根目录 dishes.json 生成（运行 tools/seed_export.py 重新生成）
// 每条独立 try/catch，单条失败不影响整体
const cloud = require("wx-server-sdk")
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()
const COL = "dishes"

const DISHES_DATA = [
'''

FOOTER = '''];
// 共 {count} 道菜
exports.main = async () => {
  // 1) 确保集合存在
  try {
    await db.createCollection(COL)
    console.log("[seed] 已创建集合", COL)
  } catch (err) {
    const msg = err.message || ""
    if (!/already exists|已存在/i.test(msg)) {
      console.warn("[seed] createCollection 警告:", msg)
    }
  }

  // 2) 检查已有数据 + 字段完整性
  // 数量够 ≠ 数据完整 —— 老版本可能只有 5 字段（缺 steps/tip/seasonings），
  // 必须额外检查字段是否齐全，否则会"假装 seed 成功"但数据其实是空的
  let existing = 0
  try {
    const r = await db.collection(COL).count()
    existing = r.total || 0
  } catch (e) { existing = 0 }

  let needReseed = false
  if (existing >= DISHES_DATA.length) {
    try {
      const sample = await db.collection(COL).limit(1).get()
      const first = sample.data[0] || {}
      const missing = ["seasonings", "steps", "tip"].filter(k => !(k in first))
      if (missing.length > 0) {
        console.log(`[seed] 旧数据缺字段 ${missing.join(",")}，准备重新 seed`)
        needReseed = true
      }
    } catch (e) {
      console.warn("[seed] 检查字段失败，按需重新 seed:", e.message)
      needReseed = true
    }
  }

  if (existing >= DISHES_DATA.length && !needReseed) {
    return { ok: true, skipped: true, count: existing, msg: `云端已有 ${existing} 道菜，无需重新 seed` }
  }

  // 清空老数据（强制 re-seed 时）
  if (existing > 0) {
    try {
      const delRes = await db.collection(COL).where({}).remove()
      console.log(`[seed] 清空老数据 ${delRes.deleted} 条`)
    } catch (e) {
      return { ok: false, msg: `清空老数据失败：${e.message}` }
    }
  }

  // 3) 逐条插入，每条独立错误处理
  let ok = 0, fail = 0
  const failures = []
  for (let i = 0; i < DISHES_DATA.length; i++) {
    const d = DISHES_DATA[i]
    const rec = {
      name: d.name,
      time_minutes: d.time_minutes,
      role: d.role,
      tags: d.tags || [],
      ingredients: d.ingredients || [],
      nutrition: d.nutrition || null,
      seasonings: d.seasonings || [],
      steps: d.steps || [],
      tip: d.tip || ""
    }
    try {
      await db.collection(COL).add({ data: rec })
      ok++
      if ((i + 1) % 20 === 0) console.log(`[seed] 进度 ${i + 1}/${DISHES_DATA.length}`)
    } catch (e) {
      fail++
      failures.push({ index: i, name: d.name, err: e.message })
      console.error(`[seed] 第 ${i + 1} 条失败 (${d.name}):`, e.message)
    }
  }

  return {
    ok: ok > 0,
    inserted: ok,
    failed: fail,
    total: DISHES_DATA.length,
    failures: failures.slice(0, 10),
    msg: `成功 ${ok} 道，失败 ${fail} 道`
  }
}
'''


# ===== Python → JS 序列化 =====

def js_string(s):
    """Python str → JS 单引号字符串（含转义）。"""
    if s is None:
        return "''"
    # 顺序：先转 \\，再转 ' 和换行
    s = s.replace("\\", "\\\\")
    s = s.replace("'", "\\'")
    s = s.replace("\n", "\\n")
    s = s.replace("\r", "\\r")
    return f"'{s}'"


def js_value(v):
    """通用 Python → JS 字面量。"""
    if v is None:
        return "null"
    if isinstance(v, bool):
        return "true" if v else "false"
    if isinstance(v, (int, float)):
        return json.dumps(v)
    if isinstance(v, str):
        return js_string(v)
    if isinstance(v, list):
        items = ", ".join(js_value(x) for x in v)
        return f"[{items}]"
    if isinstance(v, dict):
        items = [f"{k}: {js_value(val)}" for k, val in v.items()]
        return "{" + ", ".join(items) + "}"
    raise TypeError(f"无法序列化为 JS：{v!r}")


def format_dish(d):
    """单道菜 → JS 对象字面量。"""
    return (
        f"{{ name: {js_value(d['name'])}, time_minutes: {d['time_minutes']}, "
        f"role: {js_value(d['role'])}, tags: {js_value(d.get('tags', []))}, "
        f"ingredients: {js_value(d.get('ingredients', []))}, "
        f"nutrition: {js_value(d.get('nutrition'))}, "
        f"seasonings: {js_value(d.get('seasonings', []))}, "
        f"steps: {js_value(d.get('steps', []))}, "
        f"tip: {js_value(d.get('tip', ''))} }}"
    )


# ===== 现有 seedDishes 解析 =====

def parse_existing_seed():
    """从现有 seedDishes/index.js 提取 DISHES_DATA 数组为 Python 对象列表。

    用 Node.js + wx-server-sdk stub 跑 require，最稳（字符串/转义/嵌套全交给 JS 处理）。
    失败时回退到内置简易 JS 解析器。
    """
    if not SEED_INDEX_JS.exists():
        return []
    dishes = _parse_with_node()
    if dishes is not None:
        return dishes
    return _parse_with_python_parser()


def _parse_with_node():
    """用 Node.js 提取 DISHES_DATA（最稳）。"""
    if not shutil.which("node"):
        return None

    workdir = Path(tempfile.mkdtemp(prefix="seed_export_"))
    try:
        # 1) wx-server-sdk stub
        stub = workdir / "wx-server-sdk-stub.js"
        stub.write_text(
            "module.exports = {\n"
            "  init: () => {},\n"
            "  database: () => ({ collection: () => ({}) }),\n"
            "  DYNAMIC_CURRENT_ENV: 'stub-env'\n"
            "};\n",
            encoding="utf-8",
        )

        # 2) 提取脚本
        extract = workdir / "extract.js"
        extract.write_text(
            "const Module = require('module');\n"
            "const path = require('path');\n"
            "const origResolve = Module._resolveFilename;\n"
            f"Module._resolveFilename = function (request, ...args) {{\n"
            f"  if (request === 'wx-server-sdk') return {json.dumps(str(stub))};\n"
            "  return origResolve.apply(this, [request, ...args]);\n"
            "};\n"
            f"const seedPath = {json.dumps(str(SEED_INDEX_JS.resolve()))};\n"
            "const mod = require(seedPath);\n"
            "const data = mod.DISHES_DATA || [];\n"
            "process.stdout.write(JSON.stringify(data));\n",
            encoding="utf-8",
        )

        result = subprocess.run(
            ["node", str(extract)],
            capture_output=True,
            text=True,
            timeout=15,
        )
        if result.returncode != 0:
            print(f"  ⚠️  node 解析失败：{result.stderr.strip()[:200]}")
            return None
        return json.loads(result.stdout)
    except (subprocess.TimeoutExpired, json.JSONDecodeError) as e:
        print(f"  ⚠️  node 解析异常：{e}")
        return None
    finally:
        shutil.rmtree(workdir, ignore_errors=True)


def _parse_with_python_parser():
    """简易 JS 解析器（回退方案，只支持对象/数组/单引号字符串/数字/null/true/false）。"""
    text = SEED_INDEX_JS.read_text(encoding="utf-8")
    m = re.search(r"const\s+DISHES_DATA\s*=\s*\[", text)
    if not m:
        return []
    start = m.end() - 1  # 含 [
    i = [start]
    n = len(text)

    def skip_ws():
        while i[0] < n and text[i[0]] in " \n\t\r":
            i[0] += 1

    def parse_value():
        skip_ws()
        c = text[i[0]]
        if c == "{":
            return parse_obj()
        if c == "[":
            return parse_arr()
        if c == "'":
            return parse_str()
        if text[i[0]:i[0]+4] == "null":
            i[0] += 4
            return None
        if text[i[0]:i[0]+4] == "true":
            i[0] += 4
            return True
        if text[i[0]:i[0]+5] == "false":
            i[0] += 5
            return False
        # 数字
        j = i[0]
        if text[j] in "+-":
            j += 1
        while j < n and text[j] in "0123456789.eE+-":
            j += 1
        s = text[i[0]:j]
        i[0] = j
        return float(s) if "." in s or "e" in s.lower() else int(s)

    def parse_obj():
        assert text[i[0]] == "{"
        i[0] += 1
        result = {}
        skip_ws()
        if text[i[0]] == "}":
            i[0] += 1
            return result
        while True:
            skip_ws()
            j = i[0]
            while j < n and (text[j].isalnum() or text[j] in "_$"):
                j += 1
            key = text[i[0]:j]
            i[0] = j
            skip_ws()
            assert text[i[0]] == ":", f"期望 :，得到 {text[i[0]]} @ {i[0]}"
            i[0] += 1
            result[key] = parse_value()
            skip_ws()
            if text[i[0]] == ",":
                i[0] += 1
            elif text[i[0]] == "}":
                i[0] += 1
                break
            else:
                raise RuntimeError(f"期望 , 或 }}，得到 {text[i[0]]} @ {i[0]}")
        return result

    def parse_arr():
        assert text[i[0]] == "["
        i[0] += 1
        result = []
        skip_ws()
        if text[i[0]] == "]":
            i[0] += 1
            return result
        while True:
            result.append(parse_value())
            skip_ws()
            if text[i[0]] == ",":
                i[0] += 1
            elif text[i[0]] == "]":
                i[0] += 1
                break
        return result

    def parse_str():
        assert text[i[0]] == "'"
        i[0] += 1
        chars = []
        while i[0] < n and text[i[0]] != "'":
            if text[i[0]] == "\\" and i[0] + 1 < n:
                esc = text[i[0] + 1]
                mapping = {"n": "\n", "t": "\t", "r": "\r"}
                chars.append(mapping.get(esc, esc))
                i[0] += 2
            else:
                chars.append(text[i[0]])
                i[0] += 1
        assert text[i[0]] == "'"
        i[0] += 1
        return "".join(chars)

    return parse_arr()


# ===== 合并 =====

def merge_dishes(json_dishes, existing_dishes):
    """直接把 dishes.json 的全部 9 字段写入 seedDishes。

    dishes.json 已经是完整 9 字段（seasonings/steps/tip/nutrition 都有），
    不再从 existing_dishes 继承——否则旧 seedDishes 里没数据的菜
    （如西红柿炒蛋）会保留空值。
    existing_dishes 参数保留仅为兼容旧调用。
    """
    merged = []
    for d in json_dishes:
        merged.append({
            "name": d["name"],
            "time_minutes": d["time_minutes"],
            "role": d["role"],
            "tags": d.get("tags", []),
            "ingredients": d.get("ingredients", []),
            "nutrition": d.get("nutrition"),
            "seasonings": d.get("seasonings", []),
            "steps": d.get("steps", []),
            "tip": d.get("tip", ""),
        })
    return merged


# ===== 生成 + 检查 =====

def generate_seed_js(dishes):
    """生成 seedDishes/index.js 完整内容。"""
    body = ",\n".join(f"  {format_dish(d)}" for d in dishes)
    # 用 replace 而不是 format，避免误吃 JS 的 {} 对象语法
    header = HEADER.replace("{count}", str(len(dishes)))
    footer = FOOTER.replace("{count}", str(len(dishes)))
    return header + body + "\n" + footer


def sanity_check(content):
    """生成内容后的基础语法检查（捕获 '},,' 双逗号等已知 bug）。"""
    errors = []
    if re.search(r"\},,\s*", content):
        errors.append("出现 '},,' 双逗号（CLAUDE.md 已知 bug，会让 d.name 变 undefined）")
    # 顶层文件有 DISHES_DATA [...] + 函数体 {...}，整体配对应当平衡
    # 但函数体内有 if/for 等嵌套，配对不一定总数平衡——所以只检查
    # "括号总数差在 1 以内" 这种宽松检查不算合理。这里只做以下强约束：
    if not content.startswith("// 云函数：seedDishes"):
        errors.append("文件头不正确（应以 '// 云函数：seedDishes' 开头）")
    if not content.rstrip().endswith("}"):
        errors.append("文件结尾不正确（应以 '}' 结尾）")
    # DISHES_DATA 块必须以 [ 开头, ]; 结尾
    m = re.search(r"const\s+DISHES_DATA\s*=\s*\[(.+?)\];", content, re.DOTALL)
    if not m:
        errors.append("找不到合法的 'const DISHES_DATA = [...];'")
    return errors


def node_syntax_check(content):
    """如可用，用 node --check 验证 JS 语法。"""
    if not shutil.which("node"):
        return None, "node 不可用，跳过"
    with tempfile.NamedTemporaryFile(mode="w", suffix=".js", delete=False, encoding="utf-8") as f:
        f.write(content)
        tmp_path = f.name
    try:
        result = subprocess.run(
            ["node", "--check", tmp_path],
            capture_output=True,
            text=True,
        )
        return result.returncode == 0, (result.stderr or "OK").strip()
    finally:
        Path(tmp_path).unlink(missing_ok=True)


# ===== 入口 =====

def main():
    parser = argparse.ArgumentParser(
        description="把 dishes.json 同步到小程序 seedDishes 云函数"
    )
    parser.add_argument("--check", action="store_true",
                        help="只验证一致性，不写文件")
    parser.add_argument("--dry-run", action="store_true",
                        help="打印生成的文件内容到 stdout")
    args = parser.parse_args()

    # 1) 加载 dishes.json
    if not DISHES_JSON.exists():
        print(f"❌ 找不到 {DISHES_JSON}")
        sys.exit(1)
    json_dishes = json.loads(DISHES_JSON.read_text(encoding="utf-8"))
    print(f"📖 dishes.json: {len(json_dishes)} 道菜")

    # 2) 加载现有 seedDishes
    existing_dishes = parse_existing_seed()
    print(f"📖 现有 seedDishes: {len(existing_dishes)} 道菜")

    # 3) 合并
    merged = merge_dishes(json_dishes, existing_dishes)
    print(f"🔀 合并结果: {len(merged)} 道菜")

    # 4) 生成
    content = generate_seed_js(merged)

    # 5) 语法体检
    errs = sanity_check(content)
    if errs:
        print("❌ 生成内容体检失败：")
        for e in errs:
            print(f"  - {e}")
        sys.exit(1)
    node_ok, node_msg = node_syntax_check(content)
    if node_ok is None:
        print(f"  ⚠️  {node_msg}")
    elif node_ok:
        print("  ✅ node --check 通过")
    else:
        print(f"  ❌ node --check 失败：{node_msg}")
        sys.exit(1)

    # 6) 输出
    if args.dry_run:
        sys.stdout.write(content)
        return

    if args.check:
        if SEED_INDEX_JS.exists() and SEED_INDEX_JS.read_text(encoding="utf-8") == content:
            print("✅ 已同步，无需更新")
            sys.exit(0)
        print("⚠️  与现有 seedDishes 不一致，需要重新生成")
        sys.exit(1)

    SEED_INDEX_JS.write_text(content, encoding="utf-8")
    print(f"✅ 已写入 {SEED_INDEX_JS.relative_to(PROJECT_DIR)}")
    print()
    print("📋 下一步：")
    print("  1. 微信开发者工具 → 右键 cloudfunctions/seedDishes/ → 上传并部署")
    print("  2. 小程序 → 我的 → 重新上传菜谱到云端")
    print("  3. python3 tools/safety_check.py 跑完整体检")


if __name__ == "__main__":
    main()
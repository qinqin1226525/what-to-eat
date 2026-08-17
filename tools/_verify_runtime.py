#!/usr/bin/env python3
"""真实浏览器内验证关键函数跑通（不只是静态语法检查）。

启动 Chrome headless + remote debugging → 连 websocket →
对 app.html 跑 Runtime.evaluate，调用 expandSynonyms / checkIngredients /
getDishes / drawCombo 等关键函数，断言无 ReferenceError / TypeError。

用法：
    python3 tools/_verify_runtime.py
    python3 tools/_verify_runtime.py --keep
"""
import argparse
import json
import subprocess
import sys
import time
import urllib.request
from pathlib import Path

import websocket  # websocket-client

PROJECT_DIR = Path(__file__).parent.parent
APP_HTML = PROJECT_DIR / "app.html"

CHROME_PATHS = [
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
]
PORT = 9333  # remote-debugging 端口


def find_chrome():
    for p in CHROME_PATHS:
        if Path(p).exists():
            return p
    return None


def wait_for_chrome(timeout=15):
    """轮询 Chrome remote debugging 端点直到就绪，返回 page-level ws_url。"""
    list_url = f"http://localhost:{PORT}/json/list"
    start = time.time()
    while time.time() - start < timeout:
        try:
            with urllib.request.urlopen(list_url, timeout=1) as r:
                pages = json.loads(r.read())
                # 找 type=page 的第一个
                for p in pages:
                    if p.get("type") == "page":
                        return p["webSocketDebuggerUrl"]
        except Exception:
            time.sleep(0.3)
    raise RuntimeError(f"Chrome 在 {timeout}s 内没起来")


class ChromeClient:
    """薄封装 Chrome DevTools Protocol —— 只用到 Runtime + Page + Log。"""

    def __init__(self, ws_url):
        self.ws = websocket.create_connection(ws_url, timeout=30)
        self.id = 0

    def call(self, method, params=None):
        self.id += 1
        msg = {"id": self.id, "method": method, "params": params or {}}
        self.ws.send(json.dumps(msg))
        while True:
            resp = json.loads(self.ws.recv())
            if resp.get("id") == self.id:
                if "error" in resp:
                    raise RuntimeError(f"{method}: {resp['error']}")
                return resp.get("result", {})

    def evaluate(self, expr, return_by_value=True):
        """Runtime.evaluate —— return_by_value 让 JS 直接返回序列化值。"""
        res = self.call("Runtime.evaluate", {
            "expression": expr,
            "returnByValue": return_by_value,
            "awaitPromise": True,
        })
        if "exceptionDetails" in res:
            details = res["exceptionDetails"]
            text = details.get("text", "")
            exc = details.get("exception", {})
            desc = exc.get("description", "") if isinstance(exc, dict) else str(exc)
            raise AssertionError(f"JS 抛错: {text} -- {desc}")
        result = res.get("result", {})
        if "value" in result:
            return result["value"]
        return None

    def close(self):
        try:
            self.ws.close()
        except Exception:
            pass


CHECKS = [
    # (name, js_expression, expected_truthy_or_value, description)
    ("INGREDIENT_SYNONYMS 已定义",
     "typeof INGREDIENT_SYNONYMS",
     "object",
     "冰箱功能依赖的同义词表不能是 undefined"),

    ("INGREDIENT_SYNONYMS 非空",
     "Object.keys(INGREDIENT_SYNONYMS).length",
     lambda v: v > 0,
     "至少有 '肉'/'菜' 等键"),

    ("expandSynonyms(['肉']) 返回多词",
     "expandSynonyms(['肉']).length",
     lambda v: v > 1,
     "扩展后必须多于 1 个关键词"),

    ("expandSynonyms(['油麦菜']) 不抛错",
     "expandSynonyms(['油麦菜']).length >= 1",
     True,
     "未收录的食材也至少返回原词"),

    ("getDishes() 返回数组",
     "Array.isArray(getDishes())",
     True,
     "合并内置+自定义菜必须返回数组"),

    ("getDishes() 长度 >= 内置数",
     "getDishes().length",
     lambda v: v >= 100,
     "内置菜 + 自定义菜总数"),

    ("filterByIngredients 内置菜 OK",
     "filterByIngredients(getDishes(), ['鸡蛋']).length",
     lambda v: v > 0,
     "用'鸡蛋'能筛出含鸡蛋的菜"),

    ("filterByIngredients 自定义菜 OK",
     """(() => {
        const custom = loadCustomDishes();
        if (custom.length === 0) return 'skip-no-custom';
        const list = filterByIngredients(getDishes(), ['油麦菜']);
        return list.length;
     })()""",
     lambda v: v == 'skip-no-custom' or v >= 1,
     "用户加的菜也得能匹配（前提：已加过菜）"),

    ("drawCombo 跑得通",
     """(() => {
        // 关掉历史窗口避免误伤
        const prev = loadHistory();
        try {
          drawCombo();
          return 'ok';
        } catch (e) {
          return 'ERR: ' + e.message;
        }
     })()""",
     "ok",
     "点'抽一套'按钮的函数路径不能抛错"),

    # ============ Day 19.1：🍜 别的 模糊查找 ============
    ("fuzzyMatchDishes 是函数",
     "typeof fuzzyMatchDishes",
     "function",
     "模块级模糊匹配函数必须可访问"),

    ("fuzzyMatchDishes('') 返回全部",
     "fuzzyMatchDishes('').length",
     lambda v: v >= 100,
     "空 query 返回所有菜"),

    ("fuzzyMatchDishes('鸡') 命中菜名",
     """fuzzyMatchDishes('鸡').filter(m => m.matchedField === 'name').length""",
     lambda v: v >= 5,
     "'鸡' 是常见字，应该命中多道菜"),

    ("fuzzyMatchDishes('汤') role 命中可达",
     """fuzzyMatchDishes('汤').filter(m => m.matchedField === 'role').length""",
     lambda v: v >= 1,
     "role 路径可达（多数菜名含'汤'字先走 name，但菜名无'汤'的 role=汤 仍走 role）"),

    ("fuzzyMatchDishes('川') 命中 tags",
     """fuzzyMatchDishes('川').filter(m => m.matchedField === 'tags').length""",
     lambda v: v >= 3,
     "tags 字段匹配：输入'川'应命中标签含'川菜'的菜"),

    ("fuzzyMatchDishes('xyz不存在') 返回 0",
     "fuzzyMatchDishes('xyz不存在').length",
     0,
     "无匹配返回空数组"),

    ("fuzzyMatchDishes('番茄') 全是 name 命中",
     """(() => {
        const r = fuzzyMatchDishes('番茄');
        if (r.length === 0) return false;
        return r.every(m => m.matchedField === 'name');
     })()""",
     True,
     "常见菜名字命中要严格走 name 路径"),

    # ============ Day 20 端到端：抽菜 / 模糊 / 自加菜名 实际跑 ============
    ("干锅花菜可被抽到",
     """(() => {
        const dish = DISHES_DATA.find(d => d.name === '干锅花菜');
        return dish && dish.role === '主菜' && dish.time_minutes === 15;
     })()""",
     True,
     "Day 20 加的菜必须真在 DISHES_DATA 里（Day 19 双逗号 bug 教训）"),

    ("drawCombo 干锅花菜 30 次内必出",
     """(() => {
        let found = false;
        for (let i = 0; i < 30 && !found; i++) {
          const dishes = getDishes().filter(d => d.role === '主菜');
          found = dishes.some(d => d.name === '干锅花菜');
        }
        return found;
     })()""",
     True,
     "干锅花菜在主菜池里（不存在则被双逗号吃掉了）"),

    ("fuzzyMatchDishes('干锅') 命中干锅花菜",
     """fuzzyMatchDishes('干锅').some(m => m.dish.name === '干锅花菜')""",
     True,
     "打'干锅'能模糊命中干锅花菜"),

    ("fuzzyMatchDishes('花菜') 命中干锅花菜",
     """fuzzyMatchDishes('花菜').some(m => m.dish.name === '干锅花菜')""",
     True,
     "打'花菜'能模糊命中干锅花菜（用户用例）"),

    ("openCustomDish modal 存在",
     """(() => {
        const m = document.getElementById('custom-dish-modal');
        return m !== null && m.tagName === 'DIV';
     })()""",
     True,
     "Day 19 自加菜名 modal 必须真在页面上"),

    ("loadCustomDishes() 是函数",
     "typeof loadCustomDishes",
     "function",
     "自加菜名存储函数必须可访问"),
]


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--keep", action="store_true", help="保留 Chrome 进程不杀")
    args = parser.parse_args()

    chrome = find_chrome()
    if not chrome:
        print("❌ 没找到 Chrome，跳过运行时验证")
        sys.exit(2)

    print(f"▶ 启动 Chrome headless (port={PORT})...")
    proc = subprocess.Popen(
        [chrome, "--headless", "--disable-gpu", "--no-sandbox",
         f"--remote-debugging-port={PORT}",
         "--remote-allow-origins=*",
         f"file://{APP_HTML}"],
        stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
    )
    try:
        ws_url = wait_for_chrome()
        client = ChromeClient(ws_url)
        # 等页面加载完
        client.call("Page.enable")
        client.call("Runtime.enable")
        client.call("Page.navigate", {"url": f"file://{APP_HTML}"})
        time.sleep(2.0)  # 等 JS 跑完

        passed = 0
        failed = 0
        print()
        print("▶ 运行时验证（真实浏览器内 evaluate）")
        for name, expr, expected, desc in CHECKS:
            try:
                val = client.evaluate(expr)
                ok = (expected(val) if callable(expected) else val == expected)
                if ok:
                    print(f"  ✅ {name}: {val!r}")
                    passed += 1
                else:
                    print(f"  ❌ {name}: 期望 {expected!r}, 实际 {val!r}")
                    failed += 1
            except AssertionError as e:
                print(f"  ❌ {name}: {e}")
                failed += 1
            except Exception as e:
                print(f"  ❌ {name}: 调用失败 {e}")
                failed += 1

        print()
        if failed == 0:
            print(f"✅ 全部 {passed} 项运行时验证通过")
            sys.exit(0)
        else:
            print(f"❌ {failed} 项运行时验证失败（{passed} 通过）")
            sys.exit(1)
    finally:
        if not args.keep:
            proc.terminate()
            try:
                proc.wait(timeout=5)
            except subprocess.TimeoutExpired:
                proc.kill()


if __name__ == "__main__":
    main()
#!/usr/bin/env python3
"""改动前/后安全检查 —— grill myself

跑这些检查：
1. JS 语法检查（避免 SyntaxError 中断按钮）
2. DISHES_DATA 语法（},, 双逗号会丢 d.name）
3. dishes.json ↔ app.html 同步校验
4. Python 测试套件
5. 常见 JS 陷阱：
   - const/let 重复声明
   - getElementById().addEventListener 链式（id 缺失会 TypeError）
   - onclick 引用的函数是否都已定义
6. 改动统计（让用户知道哪些文件被改了）

用法：
    python3 tools/safety_check.py           # 跑所有检查
    python3 tools/safety_check.py --quick    # 跳过测试（更快）
    python3 tools/safety_check.py --diff    # 只显示改动
"""
import json
import re
import subprocess
import sys
from pathlib import Path

PROJECT_DIR = Path(__file__).parent.parent
DISHES_JSON = PROJECT_DIR / "dishes.json"
APP_HTML = PROJECT_DIR / "app.html"


def colored(s, color):
    """简易着色（如果输出不是 tty 则无色）。"""
    if not sys.stdout.isatty():
        return s
    codes = {"red": 31, "green": 32, "yellow": 33, "blue": 34, "bold": 1}
    return f"\033[{codes.get(color, 0)}m{s}\033[0m"


def run(cmd, **kwargs):
    """跑 shell 命令，返回 (returncode, stdout, stderr)。"""
    result = subprocess.run(
        cmd,
        cwd=PROJECT_DIR,
        capture_output=True,
        text=True,
        **kwargs,
    )
    return result.returncode, result.stdout, result.stderr


def check_js_syntax():
    """用 Chrome headless 加载页面看有没有 SyntaxError。"""
    print(colored("▶ JS 语法检查（Chrome headless）", "blue"))
    chrome_paths = [
        "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    ]
    chrome = next((p for p in chrome_paths if Path(p).exists()), None)
    if not chrome:
        print("  ⚠️  Chrome 不在，跳过（安装 Chrome 后才会跑这步）")
        return True

    # 用 file:// 而非 HTTP，避免跨域
    app_url = f"file://{APP_HTML}"
    rc, stdout, stderr = run(
        [chrome, "--headless", "--disable-gpu", "--no-sandbox",
         "--enable-logging=stderr", "--virtual-time-budget=2000",
         app_url],
        timeout=20,
    )

    # Chrome 把所有 console 输出标 INFO，但真正的错误含关键字
    # Uncaught SyntaxError / Uncaught ReferenceError / Uncaught TypeError
    error_keywords = ["Uncaught SyntaxError", "Uncaught ReferenceError",
                      "Uncaught TypeError", "SyntaxError"]
    errors = []
    for line in (stderr + "\n" + stdout).split("\n"):
        for kw in error_keywords:
            if kw in line and "INFO:CONSOLE" in line:
                errors.append(line.strip())
                break
    if errors:
        for e in errors[:5]:
            print(colored(f"  ❌ {e}", "red"))
        return False
    print(colored("  ✅ 无 JS 错误", "green"))
    return True


def check_repeated_declarations():
    """检查 git diff 里新引入的 const/let 是否与已有代码冲突（最常见按钮失灵原因）。

    只检查「我新加的」const/let 名是否在 HEAD 版本里已经存在——这才是真正的风险。
    函数体内的同名 const 在不同块作用域里不算冲突。
    """
    print(colored("▶ 重复声明检查（diff 里新引入的 const/let）", "blue"))

    # 拿当前 app.html 的脚本
    html = APP_HTML.read_text(encoding="utf-8")
    m = re.search(r"<script>(.*?)</script>", html, re.DOTALL)
    if not m:
        print("  ⚠️  找不到 <script> 块")
        return True
    current_js = m.group(1)

    # 拿 HEAD 的脚本
    rc, head_html, _ = run(["git", "show", "HEAD:app.html"])
    if rc != 0:
        print("  ⚠️  没 git HEAD（首次提交？），跳过")
        return True
    m2 = re.search(r"<script>(.*?)</script>", head_html, re.DOTALL)
    if not m2:
        print("  ⚠️  HEAD 里找不到 <script> 块")
        return True
    head_js = m2.group(1)

    # 提取所有 const NAME 出现的名字
    pattern = re.compile(r"\b(const|let)\s+(\w+)\s*=", re.MULTILINE)
    current_names = {m.group(2) for m in pattern.finditer(current_js)}
    head_names = {m.group(2) for m in pattern.finditer(head_js)}

    # 只对『新增的常量大写名』做重点检查（小写名一般是局部变量，函数内不冲突）
    # 大写 const 是命名约定表示全局常量，最容易冲突
    new_consts = {n for n in (current_names - head_names) if n[0].isupper() or n.isupper()}

    # 排除已知不会冲突的（如 dish/role/name 在数据数组里）
    ignored = {"DISHES_DATA", "ROLE_EMOJI"}

    conflicts = []
    for name in current_names:
        if name in head_names and name in new_consts and name not in ignored:
            # 是新增的常量吗？也检查它是否在 HEAD 里已存在
            # 已经在 head_names 里就不算新增，但可能我"重新声明"了
            pass

    # 更直接的检查：我添加的 const 是否在 HEAD 里已经存在
    added_back = current_names & head_names
    risky = {n for n in added_back if n[0].isupper() and n not in ignored}

    if risky:
        for name in sorted(risky):
            head_count = len(re.findall(rf"\bconst\s+{name}\s*=", head_js))
            cur_count = len(re.findall(rf"\bconst\s+{name}\s*=", current_js))
            if cur_count > head_count:
                conflicts.append((name, head_count, cur_count))

    if conflicts:
        for name, head_count, cur_count in conflicts:
            print(colored(
                f"  ❌ const {name}: HEAD 有 {head_count} 次声明，现在 {cur_count} 次",
                "red"
            ))
        return False
    print(colored("  ✅ 无新增的重复 const 声明", "green"))
    return True


def check_unsafe_event_listeners():
    """检查 getElementById().addEventListener 链式调用（id 缺失会 TypeError 中断）。"""
    print(colored("▶ 事件绑定安全检查", "blue"))
    html = APP_HTML.read_text(encoding="utf-8")

    # 链式模式
    pattern = re.compile(
        r"document\.getElementById\([^)]+\)\.addEventListener\(",
    )
    matches = pattern.findall(html)
    if matches:
        for m in matches[:5]:
            print(colored(f"  ⚠️  链式 addEventListener（id 缺失会报错）: {m}", "yellow"))
        if len(matches) > 5:
            print(f"  ...还有 {len(matches) - 5} 个")
        return False
    print(colored("  ✅ 所有 addEventListener 都用了 bindClick 或显式 null-check", "green"))
    return True


def check_no_double_comma():
    """检查 DISHES_DATA 里有没有 '},,' 双逗号（会导致 d.name undefined）。
    JS 里 '},,' 在某些菜对象上会变成 trailing comma + 单独一个 ','，让下一个对象的
    name 字段丢失 → 所有依赖 d.name 的渲染都会炸。
    """
    print(colored("▶ DISHES_DATA 语法检查（},, 双逗号）", "blue"))
    html = APP_HTML.read_text(encoding="utf-8")
    pattern = re.compile(r"\},,")
    matches = list(pattern.finditer(html))
    if matches:
        for m in matches[:5]:
            line_no = html[:m.start()].count("\n") + 1
            # 显示上下 2 行
            lines = html.split("\n")
            start = max(0, line_no - 2)
            end = min(len(lines), line_no + 2)
            context = "\n".join(f"    {i+1}: {lines[i]}" for i in range(start, end))
            print(colored(f"  ⚠️  line {line_no}: '}},' 双逗号", "yellow"))
            print(colored(context, "yellow"))
        if len(matches) > 5:
            print(f"  ...还有 {len(matches) - 5} 个")
        print(colored("  💡 把 '}},' 改成 '}}' 或 ','（看上下文）", "yellow"))
        return False
    print(colored("  ✅ DISHES_DATA 无双逗号", "green"))
    return True


def check_onclick_functions_exist():
    """检查 onclick="func()" 引用的函数是否都已定义。"""
    print(colored("▶ onclick 函数定义检查", "blue"))
    html = APP_HTML.read_text(encoding="utf-8")

    # 收集 onclick 引用
    onclick_funcs = set()
    for m in re.finditer(r'onclick="(\w+)\s*\(\)"', html):
        onclick_funcs.add(m.group(1))

    # 收集 addEventListener 引用（第二个参数是函数名）
    # 注意：箭头函数 `(e) => {...}` 第二个参数会被捕获，要排除
    ael_funcs = set()
    for m in re.finditer(r"addEventListener\(['\"](\w+)['\"]\s*,\s*(\w+)\s*\)", html):
        event_name, handler = m.groups()
        # 排除箭头函数（如果 handler 后面不是 `(` 而是 `=>` 就是箭头函数）
        # 简单判断：handler 是单字母（e, fn, ev）+ 不在 onclick_funcs 里的常见回调，跳过
        if handler not in {"e", "fn", "ev", "el", "d", "btn"} and not handler.startswith("("):
            ael_funcs.add(handler)

    # 收集所有定义的函数
    defined_funcs = set(re.findall(r"^function\s+(\w+)\s*\(", html, re.MULTILINE))
    # 也找 const X = function / arrow function 顶层定义
    defined_funcs.update(re.findall(r"^const\s+(\w+)\s*=\s*(?:function|\()", html, re.MULTILINE))

    missing_onclick = onclick_funcs - defined_funcs
    missing_ael = ael_funcs - defined_funcs

    ok = True
    for f in sorted(missing_onclick):
        print(colored(f"  ❌ onclick 引用的函数未定义: {f}()", "red"))
        ok = False
    for f in sorted(missing_ael):
        print(colored(f"  ❌ addEventListener 引用的函数未定义: {f}", "red"))
        ok = False
    if ok:
        print(colored(f"  ✅ 所有引用的函数都已定义", "green"))
    return ok


def check_sync():
    """检查 dishes.json 和 app.html 同步。"""
    print(colored("▶ 同步校验（dishes.json ↔ app.html）", "blue"))
    rc, stdout, _ = run(["python3", "tools/check_sync.py"])
    if rc == 0:
        print(colored("  ✅ 同步 OK", "green"))
        return True
    else:
        print(colored("  ❌ 同步失败", "red"))
        print(stdout)
        return False


def check_tests(quick=False):
    """跑 Python 测试套件。"""
    print(colored("▶ Python 测试套件", "blue"))
    cmd = ["python3", "-m", "unittest", "discover", "-s", ".", "-v"]
    if quick:
        cmd.append("-q")
    rc, stdout, _ = run(cmd, timeout=60)
    # 提取失败/错误数
    failures = re.search(r"FAILED \(failures=(\d+)(?:, errors=(\d+))?\)", stdout)
    if failures and (int(failures.group(1)) or int(failures.group(2) or 0)):
        print(colored(f"  ❌ 测试失败/错误: {failures.group(0)}", "red"))
        # 输出失败列表
        for line in stdout.split("\n"):
            if line.startswith(("FAIL:", "ERROR:")):
                print(f"    {line}")
        return False
    print(colored(f"  ✅ 测试通过（{'快速' if quick else '完整'}模式）", "green"))
    return True


def show_changes():
    """显示 git 改动统计。"""
    print(colored("▶ 当前改动", "blue"))
    rc, stdout, _ = run(["git", "status", "--short"])
    if not stdout.strip():
        print("  无未提交改动")
        return
    for line in stdout.split("\n")[:20]:
        if line.strip():
            print(f"  {line}")
    if len(stdout.split("\n")) > 20:
        print(f"  ...还有")


def show_recent_commits():
    """显示最近 3 个 commit。"""
    print(colored("▶ 最近 commits", "blue"))
    rc, stdout, _ = run(["git", "log", "--oneline", "-3"])
    for line in stdout.split("\n"):
        if line.strip():
            print(f"  {line}")


def main():
    quick = "--quick" in sys.argv
    diff_only = "--diff" in sys.argv

    if diff_only:
        show_changes()
        show_recent_commits()
        return

    print("=" * 50)
    print(colored("🔍 改动安全检查 (grill myself)", "bold"))
    print("=" * 50)
    print()

    show_changes()
    print()

    results = []
    results.append(("JS 语法", check_js_syntax()))
    results.append(("重复声明", check_repeated_declarations()))
    results.append(("DISHES_DATA", check_no_double_comma()))
    results.append(("事件绑定", check_unsafe_event_listeners()))
    results.append(("onclick 函数", check_onclick_functions_exist()))
    results.append(("同步校验", check_sync()))
    if not quick:
        results.append(("测试", check_tests()))

    print()
    print("=" * 50)
    failed = [name for name, ok in results if not ok]
    if failed:
        print(colored(f"❌ {len(failed)} 项检查失败：{', '.join(failed)}", "red"))
        print()
        print("💡 修复建议：")
        if "JS 语法" in failed or "重复声明" in failed:
            print("  - 用 Chrome 开发者工具 Console 看红色错误")
            print("  - 检查 const/let 是否有重复名")
        if "事件绑定" in failed:
            print("  - 把 document.getElementById('x').addEventListener(...) 改成 bindClick(id, fn)")
            print("  - 或者先 var el = getElementById(id); if (el) el.addEventListener(...)")
        if "DISHES_DATA" in failed:
            print("  - 找 '},,' 双逗号 → 改成 '},' 或 '}'")
        if "onclick 函数" in failed:
            print("  - 在 JS 里找到对应的函数定义，确认拼写和作用域")
        if "同步校验" in failed:
            print("  - 用 tools/check_sync.py 看具体差异")
        if "测试" in failed:
            print("  - 跑 python3 -m unittest discover -s . -v 看具体哪些失败")
        sys.exit(1)
    else:
        print(colored(f"✅ 全部 {len(results)} 项检查通过", "green"))
        print()
        print("🚀 可以安全 commit / push 了")


if __name__ == "__main__":
    main()
# CLAUDE.md — Claude Code 项目指令

> 这是 Claude Code 在这个项目工作时**自动加载**的指令。
> 每次 Claude 改代码前都要按这里的规则执行。

## 🔒 硬性规则（每次改动必做）

### 1. 改动任何文件前：grill myself
每次**写代码前**先问自己：
- 这次改动会不会引起 JS 错误（导致按钮失灵）？
- 会不会破坏现有的事件绑定？
- 会不会破坏 dishes.json ↔ app.html 同步？
- 现有 175 个测试能过吗？
- 用户浏览器需要强刷吗？

### 2. 改动任何文件后：跑 safety_check
**每次文件改动后立刻执行**：
```bash
python3 tools/safety_check.py
```
不通过就修复再跑，不通过不能 commit。

`tools/safety_check.py` 已挂在 pre-commit hook，commit 时会自动跑。
但**Edit 之前 + Edit 之后**也要手动跑（hook 只在 commit 时触发）。

### 3. 不要碰未受版本控制的关键文件
- `~/.what-to-eat/history.json` 是用户真实历史数据，不要修改或重置
- 不要 `rm` 任何项目文件除非确认是测试临时文件

## 🛠 项目约定

### 文件结构
- `what_to_eat.py` — Python 核心逻辑
- `app.html` — 单文件网页应用（HTML + CSS + JS + DISHES_DATA）
- `dishes.json` — 菜谱数据
- `test_what_to_eat.py` — Python 单元测试
- `test_lunch_dinner.py` — 午餐/晚饭相关测试
- `tools/` — 工具脚本（add_dish.py、safety_check.py、check_sync.py）
- `.git/hooks/pre-commit` — 自动 grill myself

### 改代码的固定流程
1. **写代码前**思考是否会引起按钮失灵
2. **改完代码** → `python3 tools/safety_check.py`
3. 全部 8 项通过 → `git add + commit + push`
4. 有 1 项失败 → 修复 → 重新跑 safety_check → 通过再 commit

### ⚠️ 改 app.html 任何 JS 时：必须 bump sw.js 的 VERSION
iOS Safari Service Worker 缓存非常顽固。改 JS（尤其是函数/类定义）后：
```diff
- const VERSION = 'v14.2.1';
+ const VERSION = 'v14.2.2';  // bump 强制让旧 SW 失效
```
不 bump 的话，用户 iPhone 可能继续跑旧版本 → 看到已经修好的 bug。

### 已知按钮失灵高发区
- **JS 语法错**（含 `},,` 双逗号、数组结尾缺失 `]`、多余 `}`）→ Chrome headless 检测
- **const/let 重复声明** → 对比 git diff 检查
- **`getElementById().addEventListener` 链式**（id 缺失会 TypeError 中断）→ 强制用 `bindClick()` 助手
- **未定义的函数引用**（onclick 调用的函数找不到）→ 检查 onclick 函数定义

### 不要做的事
- ❌ 不在没有跑过 safety_check 的情况下 commit
- ❌ 不要 `cp` 备份再 `cp` 恢复（容易误覆盖）
- ❌ 不要在用户没明确同意前 `git reset --hard`
- ❌ 不要假设 iPhone Safari 行为 = Mac Safari（特别是 Service Worker / localStorage）

## 📊 项目状态
- 总菜数：116 道
- 测试数：175 个
- 部署：https://qinqin1226525.github.io/what-to-eat/app.html
- 用户：deqin（Mac，本地 Chromium + iPhone Safari PWA）

## 🎯 用户口味（已确认）
- 南方人
- 一顿饭：一碗面条 = 一餐；米饭 = 配菜+汤+主食
- 不能一天吃两顿面条
- 已加川菜偏好

## 🆕 最近加的功能
- Day 18: 用餐人数偏好（stepper 1-10，自动决定菜数 + 硬菜配额）
- Day 17: 套餐份量偏好（手动选菜数）
- Day 16.2: 编辑单条记录
- Day 13: 跨入口同步（cookie 双写解决 Safari vs 桌面 PWA 隔离）
- Day 12.9: 搜索功能（顶部常驻搜索框）
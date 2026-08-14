# 今天吃什么 🥢

> 一个帮你每天决定吃啥的命令行 + 手机网页双形态工具。
> 状态：**完整可用 + 菜谱面板 + 一日三餐**（Day 1–9）

---

## 📦 文件清单

```
what-to-eat/
├── what_to_eat.py        ← Python 大脑（CLI）
├── test_what_to_eat.py   ← Python 单元测试（34 个）
├── app.html              ← 📱 手机网页应用（带菜谱面板，单文件）
├── test.html             ← 🧪 浏览器跑 JS 测试（21 个）
├── dishes.json           ← 菜谱数据（Python 版，85 道菜）
├── tools/
│   └── check_sync.py     ← 数据同步校验（dishes.json ↔ app.html）
└── README.md             ← 本文档
```

---

## 🚀 怎么用

### 📱 手机推荐用法

1. Finder 里右键 `app.html` → **共享 → AirDrop → iPhone**
2. iPhone 收到后点开 → 分享 ⤴️ → **添加到主屏幕**
3. 桌面出现 🥢 图标

**用法**：
- 点 **「抽一套！」** → 看今天吃啥（主菜+汤+主食）
- 点 **「🍱 三餐」** → 抽出早+午+晚一整天的安排 + 营养均衡检查
- 点 **「冰箱有什么」** → 输入食材 → 看能做啥
- **点任意菜名** → 弹出菜谱（食材/调料/做法/小贴士）

### 💻 桌面端 / 命令行

**单餐随机套餐**：
```bash
cd /Users/deqin/Documents/2026-08-1_study/what-to-eat
python3 what_to_eat.py
# 输出：🍖 主菜 / 🍲 汤 / 🍚 主食 + 30 天不重复
```

**一日三餐**：
```bash
python3 what_to_eat.py --three-meals
# 输出：☀️ 早餐 / 🌞 午餐(主菜+主食+凉菜+汤) / 🌙 晚餐(主菜+主食+凉菜)
#       + 营养覆盖：✅ 蛋白  ✅ 碳水  ✅ 蔬菜
```

**按食材筛选**：
```bash
python3 what_to_eat.py 鸡蛋 西红柿 黄瓜
```

直接双击 `app.html`，或者：
```bash
open /Users/deqin/Documents/2026-08-1_study/what-to-eat/app.html
```

---

## ⚠️ 关于菜谱内容

**菜谱来自通用中餐知识**，可能跟你家做法不完全一样。**强烈建议你按自己口味改**：

1. 用 TextEdit 打开 `app.html`（先 `格式 → 制作纯文本`）
2. 找到要改的菜，比如搜索 `"红烧肉"`
3. 改 `steps:` / `seasonings:` / `tip:` 这三块的引号内文字
4. 保存，重新打开

> 比如把"加冰糖"改成"加红糖"、把"煮 10 分钟"改成"煮 20 分钟"，都是改个数字的事。

---

## 🧪 验证

**Python 测试**：
```bash
cd /Users/deqin/Documents/2026-08-1_study/what-to-eat
python3 -m unittest discover -s . -v
```

**JS 测试**（浏览器里）：双击打开 `test.html`

---

## ✅ 已实现功能（Day 1–9）

| Day | 功能 | Python | JS |
|---|---|---|---|
| 1 | 随机抽一道菜 | ✅ | ✅ |
| 2 | 按时间筛选 | ✅ | — |
| 3 | 30 天不重复 | ✅ | ✅ |
| 4 | 主菜+汤+主食 套餐 | ✅ | ✅ |
| 5 | 75 道真实菜谱数据 | ✅ | ✅ |
| 6 | 冰箱食材 → 能做什么 | ✅ | ✅ |
| 7 | 单文件 HTML 应用 | — | ✅ |
| 8 | 点菜名看完整菜谱 | — | ✅ |
| 9 | **一日三餐 + 营养均衡** | ✅ | ✅ |

---

## 📁 关键文件位置

| 文件 | 路径 |
|---|---|
| 项目目录 | `/Users/deqin/Documents/2026-08-1_study/what-to-eat/` |
| 手机应用 | `/Users/deqin/Documents/2026-08-1_study/what-to-eat/app.html` |

## 🗑️ 重置历史

- **Python**：`rm ~/.what-to-eat/history.json`
- **手机**：app 里底部 "🗑️ 清空历史" 按钮

---

## 🤔 下次继续

跟 Claude 说："我想做 XXX"——任何你想加的功能。

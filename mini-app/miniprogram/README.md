# 今天吃什么 - 微信小程序

> 饭点快速选菜助手，对齐 web app 风格，纯本地算法，个人主体可上线。

## 线上版本

**v2.1.0** (2026-08-27) — 微信小程序已上线

## 怎么用（用户视角）

打开 → 4 个核心按钮：

- **🎲 抽一套** — 随机给 1 主菜 + 1 汤 + 1 主食
- **🍱 三餐** — 抽早/午/晚各 1-2 道
- **🥬 冰箱有什么** — 输入食材（空格分隔），显示能做的菜
- **🍭 儿童餐** — 给娃抽不辣的家常菜

**其他功能**：
- 顶部搜索框 — 模糊搜索 125 道菜（菜名/食材/标签）
- 餐后点「✓ 就做」一键记录
- 「📝 记录」手动记早/午/晚
- 「📋 查看历史记录」看 + 编辑 + 删除 + 清空
- 「📊 报告」本月统计 + Top 5 + 三餐分布
- 「⚙ 设置」口味偏好 + 健康档案

## 怎么改（开发者视角）

### 文件结构

```
mini-app/miniprogram/
├── app.js / app.json / app.wxss
├── pages/
│   ├── home/      ← 主页（4 mode tab + 5 大按钮 + 7 个 modal）
│   └── profile/   ← 偏好设置 + 健康档案
├── utils/
│   ├── cloud.js         ← 云函数调用封装
│   ├── algorithm.js     ← 4 mode tab 算法（核心）
│   └── dishes-data.js   ← 125 道菜本地数据
├── cloudfunctions/      ← 13 个云函数
├── docs/                ← 项目根目录的 docs/
└── README.md (本文件)
```

### 本地运行

1. 微信开发者工具 → 导入项目 → 选 `mini-app/miniprogram/` 目录
2. AppID 填 `wx735b1e6a01377607`（已写在 project.config.json）
3. 编译 → 模拟器预览

### 改一个菜

`utils/dishes-data.js` 找到菜名 → 改字段 → 重新编译

### 改算法

`utils/algorithm.js` 是核心（`chooseCombo` / `chooseOneMeal` / `filterByIngredients` / `applyPrefs`）

### 加新页面

1. `pages/<name>/<name>.{js,wxml,wxss,json}` 4 个文件
2. `app.json` 的 `pages` 数组加路径
3. 用 `navigateTo` 或 `switchTab` 跳转

### 部署

```bash
# devtools → 上传（自动编译）
# 微信公众平台 mp.weixin.qq.com → 版本管理 → 设为体验版/提交审核
```

## 设计原则

- **单页**（首页）— 所有功能 modal 弹出
- **本地算法** — 0 网络调用选菜，0 AI 配额
- **不吸引孩子** — 无动画、配色低饱和、emoji 简洁
- **简单粗暴** — 4 mode tab + 5 大按钮，用户不思考

## 跟 web app 的关系

- `app.html`（5000+ 行）是 web 版原型
- mini-app 1:1 抄了 UX，但**只搬了 v3 必须的功能**
- 砍掉了 v2 的 AI 功能（个人主体微信审核要求）
- 算法核心 `utils/algorithm.js` 跟 web app 一样（同一份 Python→JS 翻译）

## 限制 / 不做

- ❌ 不接 AI（个人主体不允许）
- ❌ 不接推送通知
- ❌ 不做营养分析图表
- ❌ 不做场景分类（产后/儿童/老人餐）
- ❌ 不做离线模式

## 仓库

- 主分支 `main` — 完整 v2（含 AI，仅本地参考）
- 当前 `no-ai` — 线上版，个人主体合规

切分支：`git checkout no-ai`

## 联系方式

- 仓库：https://github.com/qinqin1226525/what-to-eat
- 微信小程序：搜索「今天吃什么」或扫码体验
- 公众号/反馈：暂无

## 协议

个人项目，仅供学习使用。
# PRD: 今天吃什么 v3 (no-ai)

**状态**：Active（线上版）
**版本**：v3.0 (no-ai)
**更新日期**：2026-08-27
**对应分支**：`no-ai`
**对应代码**：`mini-app/` 子目录
**对应云函数**：`mini-app/cloudfunctions/`
**线上版本**：v2.1.0 (2026-08-27 上线)

---

## 1. 背景

「今天吃什么」是一个**微信小程序**，解决用户**饭点选菜困难**的问题。

**v1** 移植自个人网页版工具（app.html 5000+ 行），含 6 个页面、4 个 tab、125 道菜 + AI 顾问 + 健康档案 + 统计 + 手动记录。

**v2** 经过 JTBD 调研重新设计：核心场景是「饭点快速选菜」，4 mode tab + AI 辅助。

**v3 (本版)**：因微信审核要求企业主体 + 深度合成备案（个人主体不允许生成式 AI），**砍掉所有 AI 功能**。本地算法能力不变，纯前端实现，个人主体即可上线。

---

## 2. 用户画像

**主要**：30+ 在职家长，会做饭但纠结吃什么；饭点要快；要带孩子，没法用手机太久。

**次要**：任何想**省心地从 125 道家常菜里随机选 1 道**的用户。

---

## 3. 核心场景

| ID | 场景 | 期望结果 |
|---|---|---|
| US-1 | **饭点不知道做什么** | 5 秒内看到 3 道候选菜 |
| US-2 | **按餐次选菜** | 早/午/晚分别得到合适菜 |
| US-3 | **有食材不知道做啥** | 输入食材，看到能做啥 |
| US-4 | **给娃选菜** | 不辣、易消化的家常菜 |
| US-5 | **找菜谱** | 输入菜名/食材/标签，模糊搜索 |
| US-6 | **手动记录吃啥** | 3 段（早/午/晚）保存 |
| US-7 | **查历史** | 按日期分组查看 |
| US-8 | **改/删记录** | 改菜名/类型、删单条、清空全部 |
| US-9 | **看月度报告** | 总数/天数/平均 + Top 5 + 三餐分布 |
| US-10 | **手机被孩子看到** | UI 简洁不吸引注意 |

---

## 4. 功能需求

### 4.1 首页（pages/home/home）

**4 mode tab（核心选菜流程）**：

| Tab | 算法 | 输出 |
|---|---|---|
| 🎲 随机套餐 | `chooseCombo`（本地算法） | 1 主菜 + 1 汤 + 1 主食 |
| 🍱 三餐 | 3 次 `chooseOneMeal` | 早/午/晚各 1-2 道 |
| 🥬 冰箱有什么 | `filterByIngredients` | 按食材匹配的菜 |
| 🍭 儿童餐 | 主菜/早餐/主食 + 不辣 | 给娃的菜 |

**5 大功能按钮（顶部 banner）**：
- 📝 记录 — 手动记录 modal
- 🍳 我的菜池 — 用户私有菜池
- 📊 报告 — 月度报告
- 🤖 ~~AI 顾问~~ — **v3 删除**（个人主体不允许 AI）

**搜菜谱**：
- 顶部搜索框，输入即过滤
- 匹配：菜名/食材/标签

**菜谱详情 modal**：emoji + 菜名 + role + 时间 + 食材/调料/做法/小贴士

### 4.2 手动记录

- 3 段输入（早/午/晚）
- 每段逗号分隔多菜
- 默认今天日期（可改）
- 保存 → 批量 addMeal（status=manual, meal=早/午/晚）

### 4.3 历史记录本

- 按日期分组
- 每条：状态徽章 + 餐类 emoji + 菜名
- 每条 2 按钮：✏️ 编辑 / 🗑️ 删除
- 底部：🗑️ 清空所有历史

### 4.4 编辑单条

- 改菜名（input）
- 选早/午/晚（chip 切换）
- 调 `cloud.updateMeal` 云函数

### 4.5 月度报告

- 总数 / 天数 / 平均（3 卡片）
- Top 5 高频菜
- 三餐分布（横向 bar）

### 4.6 我的菜池

- 用户私有（云端 _openid 隔离）
- 5 input 批量输入 + 「+ 加一行」
- 「🗑️ 清空」+「🎲 抽一道」操作
- 抽一道：从 125 道菜里按 role 分类抽

### 4.7 偏好设置（pages/profile/profile）

- 菜系（多选 chip）
- 辣度（any / mild / none）
- 开关组（不要麻辣/素食/不凉菜/跳过早餐）
- 忌口（海鲜/内脏/香菜/牛肉/羊肉/皮蛋）
- 主食模式（随便/面+面/面+饭/饭+饭）
- 时间上限（不限/30/60 分钟）
- 套餐份量（1-1-1/2-1/3-1/4-1）
- 健康档案（性别/年龄/身高/体重/活动量/目标 + 疾病 + 过敏 + 目标摄入计算）

---

## 5. 非功能需求

| ID | 需求 |
|---|---|
| NFR-1 | **启动到能选菜 < 3 秒** |
| NFR-2 | **不吸引孩子** — 无动画、emoji 简洁、配色低饱和 |
| NFR-3 | **单页不滚动**（4 个 modal 可弹出，列表折叠） |
| NFR-4 | **多端同步** — 云端按 _openid 隔离 |
| NFR-5 | **无需任何 AI 配额** — 全部本地算法 |
| NFR-6 | **隐私** — 用户数据云端按 _openid 隔离 |

---

## 6. 砍掉的功能（v2 → v3）

| 砍的功能 | 原因 |
|---|---|
| 🤖 AI 顾问 | 微信审核要求企业主体 + 深度合成备案，个人主体不允许 |
| 🎙️ 跟 AI 聊口味 | 同上 |
| 🤖 AI auto 填充 | 同上 |
| 📊 今日 AI 剩余 | 同上 |
| AI 三餐定制（pickMealsForDay 走 AI） | 同上 |
| aiAdvisor 云函数整个 | 无用了，删了 |
| pages/chat/ 整个 | 无用了，删了 |
| smartAddDish 云函数 | 无用了，删了 |

**保留 100% 本地算法**（algo.js 里的 chooseCombo / chooseOneMeal / filterByIngredients / applyPrefs 等），无任何生成式 AI 调用。

---

## 7. 架构

### 7.1 文件结构

```
mini-app/
├── miniprogram/
│   ├── app.js / app.json / app.wxss
│   ├── pages/
│   │   ├── home/home.{js,wxml,wxss}    ← 1 页式主页
│   │   └── profile/profile.{js,wxml,wxss}  ← 偏好 + 健康档案
│   ├── utils/
│   │   ├── cloud.js         ← 云函数调用封装
│   │   ├── algorithm.js     ← 4 mode tab 算法（核心）
│   │   └── dishes-data.js   ← 125 道菜本地 fallback
│   └── miniprogram_npm/...
└── cloudfunctions/              ← 13 个云函数
    ├── addDish / deleteMeal / getDishes / seedDishes
    ├── addMeal / getHistory / clearMeals / updateMeal
    ├── customDish / getFridge / updateFridge
    ├── getPrefs / savePrefs / login
```

### 7.2 核心算法（utils/algorithm.js）

- `applyPrefs` — 按用户偏好过滤菜池
- `chooseCombo` — 随机套餐（主菜+汤+主食，30 天内不重）
- `chooseOneMeal` — 单餐（可选 mustBeRice 强制米饭）
- `filterByIngredients` — 食材匹配
- `DEFAULT_PREFS / DEFAULT_PROFILE` — 偏好默认值

---

## 8. Out of Scope（v3 不做）

- ❌ AI 生成菜谱 / 跟 AI 聊 / AI 三餐定制
- ❌ 营养统计图表（只展示基础数字 + Top 5）
- ❌ 场景分类（产后 / 儿童 / 老人餐）
- ❌ 推送通知
- ❌ 视频菜谱
- ❌ 离线模式
- ❌ 分享到朋友圈（基础分享给朋友 OK）
- ❌ 菜谱评分/收藏

---

## 9. 引用

- 7 个 ADR：`docs/adr/001..007.md`
- Spec：`docs/spec.md`
- README：`mini-app/miniprogram/README.md`
- 主页原型：`app.html`（web 版，v1 设计参考）
- 砍 AI 之前的快照：`git branch main`（带 AI 完整版备份）
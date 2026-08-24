# Spec: 今天吃什么 v2 核心行为定义

**状态**：Active
**版本**：v2.0
**对应代码**：`mini-app/`

---

## S1. 随机选菜算法

**输入**：
- `customDishes`: 用户菜池（字符串数组）
- `fridgeItems`: 当前冰箱食材（字符串数组）
- `recentPicks`: 最近 7 天已抽过的菜名（字符串数组，从 `meals` 集合过滤）

**算法**：

```js
function pick3({ customDishes, fridgeItems, recentPicks }) {
  // 1. 候选 = 菜池 - 最近7天
  const recentSet = new Set(recentPicks)
  const candidates = customDishes.filter(d => !recentSet.has(d))

  // 2. 空态
  if (candidates.length === 0) {
    return { empty: true, msg: '7 天内都吃过了，加点新菜' }
  }

  // 3. 启发式：优先菜名包含冰箱食材的
  const fridgeKeys = fridgeItems.map(f =>
    f.replace(/\s*\d+g?$/i, '').toLowerCase()
  )
  const matched = candidates.filter(d => {
    const lc = d.toLowerCase()
    return fridgeKeys.some(k => lc.includes(k))
  })

  // 4. 选池：matched 够 3 道就用它，否则用全部候选
  const pool = matched.length >= 3 ? matched : candidates

  // 5. 洗牌取前 3
  const shuffled = pool.slice().sort(() => Math.random() - 0.5)
  return {
    empty: false,
    dishes: shuffled.slice(0, Math.min(3, shuffled.length))
  }
}
```

**输出**：`{empty: bool, dishes: [...], msg?: string}`

**边界**：
- 菜池为空 → 弹 onboarding（不是返回空）
- 候选 < 3 道 → 全部返回（即使只有 1 道）
- 匹配 < 3 道 → 从候选兜底（不强求匹配）

---

## S2. AI 顾问聊天（默认 mode）

> 注：早期 spec 写过 `pickWithAI` 模式做选菜，但实测用户期望是**聊天**而非 AI 选菜。pickWithAI 模式代码保留在 aiAdvisor 云函数里，home.js 不再调用——未来若需要 AI 选菜可单独启用。

**触发**：home 页点「🤖 AI 顾问」按钮 → `wx.navigateTo({url: '/pages/chat/chat'})`

**端点**：`aiAdvisor` 云函数，**无 mode 参数**（默认走聊天分支）

**输入**：
- `question`: 用户提问
- `profile`: 健康档案（年龄/体重/目标）
- `todayMeals`: 今日已吃
- `todayTotals` + `targets`: 今日营养 vs 推荐摄入

**System Prompt**（固定）：

```
你是「三餐肆计」——用户的私人中文饮食顾问。
能力：推荐个性化菜谱 / 解读今日营养 / 教做菜 / 回答食材搭配
规则：只用中文 / 3-6 句话 / 必要时编号列举 / 不诊断疾病（建议咨询医生）
```

**API 参数**：
- `model: 'deepseek-chat'`
- `max_tokens: 800`
- `temperature: 0.7`
- 流式输出（SSE）→ 聊天页打字机效果

**降级**：
- API_KEY 未配置 → 聊天页显示「AI 暂不可用，请在云函数环境变量里设置 API_KEY」
- 调用失败 / 超时 → toast「AI 暂不可用」

---

### 历史：废弃的 `pickWithAI` 模式

**状态**：保留在 `aiAdvisor/index.js`，**home.js 不再调用**。

**触发**：传 `mode: 'pickWithAI'`。

**行为**：从候选菜池 + 冰箱 + 最近 7 天选 3 道菜 + 理由。

**为什么废弃**：用户实际期望的是**聊天**（解读营养 / 教做菜），**不需要 AI 帮他选菜**——选菜逻辑已经够好（手搓菜池 + 启发式），AI 介入反而画蛇添足。

**未来若启用**：单独做一个 "🤖 AI 推荐 3 道" 按钮，在"今天点不出来"场景下用。

---

## S3. 菜池 Onboarding

**触发**：首次进入 home 且 `customDishes.length === 0`

**UI**：全屏 modal
- 标题：「挑你会做的菜」
- 副标题：「从 125 道家常菜里勾选，可跳过」
- 内容：按 role 分组的 5 个组（主菜/汤/主食/凉菜/早餐）
  - 每个组内：菜名 chip，点击 toggle 选中
- 操作：「跳过」「保存」

**行为**：
- 「跳过」 → 关闭 modal，进入主页（菜池为空）
- 「保存」 → 把所有 checked 的菜名 `customDish.replace(items)` → 关闭 modal → 进入主页
- 后续可以再点 chip 的 × 增删

**数据**：
- 数据源：`getDishes()` 云函数返回的 125 道菜
- 分组：按 `dish.role` 字段
- 排序：每个 role 组内按 `dish.name` 字典序

---

## S4. 一键记录流程（**v2.1 升级为多选模式**）

**触发**：结果 modal 每道菜点「✓ 选这道」→ 加入 `pickedMeals`，不关 modal；底部「✅ 就做这些」统一记录。

**API 调用**（多次循环）：
```js
for (const dish of pickedMeals) {
  await cloud.addMeal({
    dish,
    meal: '午餐',            // 默认值
    status: 'confirmed',
    date: today               // ISO 格式 YYYY-MM-DD
  })
}
```

**UI 反馈**：
- 点「✓ 选这道」→ toast「✓ 已选 菜名」，按钮变深绿「✓ 已选」态，modal 顶部加「✓ 已选 X 道：菜1、菜2...」
- 点「✅ 就做这些」→ toast「✓ 记录 X 道」，关闭 modal
- 「✓ 选这道」/「✅ 就做这些」在 pickedMeals 为空时是灰色禁用态

**边界**：
- addMeal 部分失败 → toast「成功 X 失败 Y」
- pickedMeals 为空 → 不能点「✅ 就做这些」（按钮禁用 + toast「还没选菜」）

**v2.1 加菜按钮**（底部 chip 行）：
- 「➕ 主菜/🥣 汤/🍚 主食/🥗 凉菜」4 个 chip
- 点哪个 role → 追加一道该 role 的菜到 picked.dishes
- 候选 = 菜池里该 role 的菜 - 已吃/已选/已在 modal
- 启发式：菜名包含冰箱食材的优先
- 没菜 → toast「主菜 没菜可加」

**v2.1 偏离记录**：
- ❌ 违反 ADR-005「极简 UI」（底部多了一条 chip 行 + 主按钮）
- ✅ 符合 JTBD 调研 #11（来客人要 4-5 道）+ 用户实际反馈
- 折中：按钮文案克制、chip 极简、橙色按钮只在「✅ 就做这些」一处用

---

## S5. 手动记录（历史页）

**触发**：历史页顶部「📝 手动记录今天吃了啥」按钮

**UI**：modal，4 字段
- 日期（picker，默认今天）
- 早餐 / 午餐 / 晚餐（input，可空，逗号分隔多菜）

**保存逻辑**：
1. 三餐都空 → toast「至少填一餐吧」，return
2. 每个 meal 字段 split 逗号 + 去重 + trim
3. 串行 `addMeal({dish, meal, status:'manual', date})`，一次一条
4. 全部成功 → toast「已记录 N 条」
5. 部分失败 → toast「成功 X，失败 Y」
6. 全部失败 → toast「保存失败」+ 真实错误（`util.showError`）

---

## S6. 加载与降级

**核心流程的失败模式**：

| 步骤 | 失败时 | 降级 |
|---|---|---|
| `cloud.getDishes()` | 网络/API 错 | 读本地 `utils/dishes-data.js`（117 道菜的 fallback）|
| `cloud.getFridge()` | 网络错 | 显示空冰箱 chip 行 + toast 静默 |
| `cloud.call('customDish', {action:'get'})` | 网络错 | 显示空菜池 + 提示「网络异常」|
| `cloud.getHistory(50)` | 网络错 | `recentPicks = []`（无去重约束） |
| `aiAdvisor.pickWithAI` | API_KEY 未配 / 超时 | fallback 本地随机 + toast「AI 暂不可用」|

**绝对不能失败**的步骤：
- 「🎲 帮我选 3 道」按钮点击：必须有响应（toast 或 modal）
- 「吃这个」记录按钮：失败时必须提示，不能静默丢失

---

## S7. UI 约束（呼应 ADR-005）

| 元素 | 规则 |
|---|---|
| 颜色 | 主色 `#ff9a3c`，背景 `#fafaf7`，文字 `#2a2a2a`/`#666`/`#999` |
| 字号 | 用 `rpx`，基础 28，标题 32-36，辅助 22-24 |
| 字号缩放 | `fontScale = screenWidth / 375`，限制 0.85-1.15 |
| 间距 | 8/12/16/20/24/32 rpx 阶梯 |
| 圆角 | chip 用 `999rpx`（圆形），卡片用 `16rpx` |
| 字体 | system font（无自定义） |
| 阴影 | 极浅 `rgba(0,0,0,0.04)`，或无 |
| 动画 | **无**（除系统默认的 tap 高亮） |

---

## S8. 性能预算

| 指标 | 预算 |
|---|---|
| 启动 → 可交互 | < 1.5s |
| 「🎲 选菜」点击 → 显示结果 | < 200ms（本地随机） |
| 「🤖 AI 顾问」点击 → 跳转 chat 页 | < 100ms |
| 一次 addMeal | < 1s |
| 包体积（前端）| < 200KB（当前 ~50KB）|
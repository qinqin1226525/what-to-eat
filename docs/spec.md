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

## S2. AI 灵感算法（pickWithAI）

**端点**：`aiAdvisor` 云函数，`mode: 'pickWithAI'`

**输入**：
- `candidates`: 候选菜池（同 S1）
- `recentPicks`: 同上
- `fridge`: 同上
- `hint`: 用户的特别偏好（可选，目前未传）

**System Prompt**（固定）：

```
你是「三餐肆计」，用户的私人饮食顾问。
任务：从【候选菜】里挑 3 道，必须是候选菜里的，不能编新的。
每道配 1 句理由（≤20 字），说明为什么现在适合。

用户上下文：
- 冰箱现有：{fridge}
- 最近 7 天吃过：{recentPicks}
- {hint?}

返回严格 JSON（不要 markdown 代码块）：
{"picks": [{"dish": "菜名", "reason": "理由"}, ...]}

规则：
- 优先选和冰箱食材匹配的
- 避开最近 7 天吃过的
- 3 道菜尽量不同 role（主菜/汤/主食）
- 理由要口语化，不要"根据您..."这种官腔
```

**API 参数**：
- `model: 'deepseek-chat'`
- `max_tokens: 400`
- `temperature: 0.8`
- `response_format: { type: 'json_object' }`（强制 JSON 输出）

**校验**：
- AI 返回的 `dish` 必须在 `candidates` 里（兜底防 AI 幻觉）
- 理由截断到 30 字

**降级**：
- API_KEY 未配 / AI 调用失败 / 返回非 JSON → 客户端 fallback 到 S1 本地随机
- toast 提示「AI 暂不可用，本地随机」

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

## S4. 一键记录流程

**触发**：结果 modal 点「吃这个 →」

**API 调用**：
```js
cloud.addMeal({
  dish: <抽到的菜名>,
  meal: '午餐',          // 默认值
  status: 'confirmed',
  date: today           // ISO 格式 YYYY-MM-DD
})
```

**UI 反馈**：
- toast：「✓ 菜名」，1.5 秒自动消失
- 不弹确认 modal（避免打断）

**边界**：
- addMeal 失败 → toast「记录失败」+ 保留结果 modal（用户可重试）
- 用户连续点多个「吃这个」→ 多次 addMeal（无去重，每次都记）

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
| 「💡 AI 灵感」点击 → 显示结果 | < 5s（含 API 调用） |
| 一次 addMeal | < 1s |
| 包体积（前端）| < 200KB（当前 ~50KB）|
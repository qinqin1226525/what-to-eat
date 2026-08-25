// pages/stats/stats.js —— 营养统计页
const app = getApp()
const algo = require('../../utils/algorithm.js')
const cloud = require('../../utils/cloud.js')

Page({
  data: {
    loading: true,
    range: 7,                    // 显示 7 天
    days: [],                    // [{date, label, weekday, total, target, pct}]
    targets: { calories: 0, protein: 0, carbs: 0, fat: 0, sodium: 0, bmr: 0, tdee: 0 },
    todayTotals: { calories: 0, protein: 0, carbs: 0, fat: 0, sodium: 0 },
    weekAvg: { calories: 0, protein: 0, carbs: 0, fat: 0 },
    weekTotal: 0,
    lastWeekAvg: 0,
    trend: 0,                    // 0=平稳, >0 上升, <0 下降
    diversity: 0,                // 吃过几种菜
    topDishes: [],               // 最常吃的 3 道
    hasProfile: false
  },

  onShow() {
    this.loadStats()
  },

  onPullDownRefresh() {
    this.loadStats().then(() => wx.stopPullDownRefresh())
  },

  async loadStats() {
    this.setData({ loading: true })
    try {
      // 1. 拉历史
      const res = await cloud.getHistory(500)
      const history = (res && res.ok) ? res.history : []

      // 2. 拿 profile 算 targets
      const profile = app.globalData.profile || {}
      const targets = algo.calculateTargets(profile)
      const hasProfile = !!(profile.sex && profile.weight && profile.height && profile.age)

      // 3. 算今日摄入
      const todayISO = algo.todayISO()
      const todayMeals = history.filter(h => h.date === todayISO && h.status !== 'skipped')
      const dishes = app.globalData.dishes || []
      const todayTotals = algo.aggregateDailyNutrition(todayMeals, dishes)

      // 4. 算近 7 天每日柱状
      const days = this.computeDailyBars(history, dishes, targets, this.data.range)

      // 5. 算周平均 + 趋势
      const weekTotals = days.reduce((s, d) => ({
        calories: s.calories + d.total.calories,
        protein: s.protein + d.total.protein,
        carbs: s.carbs + d.total.carbs,
        fat: s.fat + d.total.fat
      }), { calories: 0, protein: 0, carbs: 0, fat: 0 })
      const weekAvg = {
        calories: Math.round(weekTotals.calories / Math.max(days.length, 1)),
        protein: Math.round(weekTotals.protein / Math.max(days.length, 1)),
        carbs: Math.round(weekTotals.carbs / Math.max(days.length, 1)),
        fat: Math.round(weekTotals.fat / Math.max(days.length, 1))
      }
      const weekTotal = weekTotals.calories

      // 6. 算上周平均（用前 7-14 天）
      const lastWeekAvg = this.computeLastWeekAvg(history, dishes)

      // 7. 趋势
      const trend = lastWeekAvg === 0 ? 0 : Math.round((weekAvg.calories - lastWeekAvg) / lastWeekAvg * 100)

      // 8. 饮食多样性
      const dishSet = new Set()
      history.filter(h => h.status !== 'skipped').forEach(h => dishSet.add(h.dish))
      const diversity = dishSet.size

      // 9. Top 3 菜
      const counts = {}
      history.filter(h => h.status !== 'skipped').forEach(h => {
        counts[h.dish] = (counts[h.dish] || 0) + 1
      })
      const topDishes = Object.entries(counts)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 3)
        .map(([name, count], i) => ({ rank: i + 1, name, count }))

      this.setData({
        loading: false,
        days,
        targets,
        todayTotals,
        weekAvg,
        weekTotal,
        lastWeekAvg,
        trend,
        diversity,
        topDishes,
        hasProfile
      })
    } catch (err) {
      console.error('加载统计失败:', err)
      this.setData({ loading: false })
    }
  },

  // 算最近 N 天每日柱状数据
  computeDailyBars(history, dishes, targets, n) {
    const out = []
    for (let i = n - 1; i >= 0; i--) {
      const d = new Date()
      d.setDate(d.getDate() - i)
      const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
      const dayMeals = history.filter(h => h.date === iso && h.status !== 'skipped')
      const total = algo.aggregateDailyNutrition(dayMeals, dishes)
      const targetCal = targets.calories || 2000   // 没填健康档案用默认 2000
      const pct = Math.min(total.calories / targetCal * 100, 100)
      out.push({
        date: iso,
        label: this.dateLabel(iso),
        weekday: this.weekdayLabel(d.getDay()),
        total,
        target: targetCal,
        pct: Math.round(pct),
        isToday: i === 0
      })
    }
    return out
  },

  computeLastWeekAvg(history, dishes) {
    let totalCal = 0, count = 0
    for (let i = 7; i < 14; i++) {
      const d = new Date()
      d.setDate(d.getDate() - i)
      const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
      const dayMeals = history.filter(h => h.date === iso && h.status !== 'skipped')
      if (dayMeals.length === 0) continue
      const total = algo.aggregateDailyNutrition(dayMeals, dishes)
      totalCal += total.calories
      count++
    }
    return count === 0 ? 0 : Math.round(totalCal / count)
  },

  dateLabel(iso) {
    const [y, m, d] = iso.split('-')
    return `${m}/${d}`
  },

  weekdayLabel(day) {
    return ['日', '一', '二', '三', '四', '五', '六'][day]
  }
})
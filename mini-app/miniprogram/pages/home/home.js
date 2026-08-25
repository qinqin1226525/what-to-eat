// pages/home/home.js —— 1 页式主页（对齐 web app）
const app = getApp()
const cloud = require('../../utils/cloud.js')
const util = require('../../utils/util.js')
const algo = require('../../utils/algorithm.js')

const ROLE_EMOJI = { '主菜': '🥢', '汤': '🥣', '主食': '🥯', '凉菜': '🥗', '早餐': '🍳' }
const RANK_COLORS = ['#e85d04', '#ff9a3c', '#fbbf24', '#84cc16', '#3b82f6']
const MEAL_COLORS = { '早餐': '#fbbf24', '午餐': '#ff9a3c', '晚餐': '#8b5cf6' }

Page({
  data: {
    todayLabel: '',
    loading: true,
    // 4 mode tab
    mode: 'combo',         // 'combo' | 'three' | 'fridge' | 'kids'
    // 4 模式结果
    comboResult: [],       // [{name, role, time, emoji}]
    threeResult: [],       // [{slot, dishes: [{name, emoji}]}]
    fridgeResults: [],
    kidsResult: [],
    fridgeInput: '',
    // 搜索
    searchQuery: '',
    searchResults: [],
    // 记录 modal
    showManualLog: false,
    manualForm: { date: '', breakfast: '', lunch: '', dinner: '' },
    // 月度报告 modal
    showMonthlyReport: false,
    monthlyReport: {
      monthLabel: '',
      totalMeals: 0,
      activeDays: 0,
      avgPerDay: 0,
      topDishes: [],
      mealDist: []
    },
    // AI 顾问 modal
    showAIPanel: false,
    // 菜谱详情 modal
    recipeDish: null,
    // 选中的菜
    selectedDishes: new Set(),
    recentPicks: []
  },

  onLoad() {
    this.setData({ todayLabel: this._todayLabel() })
    this.refresh()
  },

  onShow() {
    this.refresh()
  },

  _todayLabel() {
    const d = new Date()
    return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日`
  },

  async refresh() {
    this.setData({ loading: true })
    try {
      const [historyRes, dishesRes] = await Promise.all([
        cloud.getHistory(50),
        cloud.getDishes()
      ])
      const history = (historyRes && historyRes.ok) ? historyRes.history : []
      const raw = (dishesRes && dishesRes.ok) ? dishesRes.dishes : []
      // 防御性去重
      const seen = new Set()
      const allDishes = []
      for (const d of raw) {
        if (!d || !d.name || seen.has(d.name)) continue
        seen.add(d.name)
        allDishes.push(d)
      }
      app.globalData.dishes = allDishes
      const recentPicks = history
        .filter(h => h.status !== 'skipped' && new Date(h.date) >= this._cutoffDate(7))
        .map(h => h.dish)
      this.setData({ recentPicks, loading: false })
    } catch (err) {
      console.warn('refresh failed', err)
      this.setData({ loading: false })
    }
  },

  _cutoffDate(days) {
    const d = new Date()
    d.setDate(d.getDate() - days)
    return d
  },

  // ===== 顶部 4 按钮 =====
  // 拦截冒泡的空 handler（给 modal-card 用）
  _noop() {},

  onOpenManualLog() {
    this.setData({
      showManualLog: true,
      manualForm: { date: util.todayISO(), breakfast: '', lunch: '', dinner: '' }
    })
  },

  closeManualLog() {
    this.setData({ showManualLog: false })
  },

  onOpenMonthlyReport() {
    this._computeMonthlyReport()
    this.setData({ showMonthlyReport: true })
  },

  closeMonthlyReport() {
    this.setData({ showMonthlyReport: false })
  },

  onOpenAI() {
    this.setData({ showAIPanel: true })
  },

  closeAIPanel() {
    this.setData({ showAIPanel: false })
  },

  onOpenAIChat() {
    this.closeAIPanel()
    wx.navigateTo({ url: '/pages/chat/chat' })
  },

  onOpenAIPrefs() {
    this.closeAIPanel()
    wx.navigateTo({ url: '/pages/profile/profile' })
  },

  // ===== 4 mode tab =====
  onSwitchMode(e) {
    const m = e.currentTarget.dataset.mode
    if (m) this.setData({ mode: m })
  },

  // 抽一套（combo mode）
  onDrawCombo() {
    const allDishes = app.globalData.dishes || []
    if (allDishes.length === 0) {
      wx.showToast({ title: '菜谱还没加载', icon: 'none' })
      return
    }
    const prefs = app.globalData.prefs || algo.DEFAULT_PREFS
    const filtered = algo.applyPrefs(allDishes, prefs)
    const pool = filtered.length > 0 ? filtered : allDishes
    const history = []  // 简化为不考虑历史去重（保留菜品）
    const combo = algo.chooseCombo(pool, history, { window: 30, comboSize: prefs.comboSize || '1-1-1' })
    // 转为 UI 格式
    const result = Object.entries(combo).map(([role, dish]) => ({
      name: dish.name,
      role,
      time: dish.time_minutes || '?',
      emoji: ROLE_EMOJI[role] || '🍽'
    })).filter(d => d.name)
    this.setData({ comboResult: result })
  },

  // 换一道（combo）
  onSwapCombo(e) {
    const idx = Number(e.currentTarget.dataset.idx)
    const result = this.data.comboResult
    if (isNaN(idx) || !result[idx]) return
    const allDishes = app.globalData.dishes || []
    const inResult = new Set(result.map(d => d.name))
    const candidates = allDishes.filter(d => !inResult.has(d.name))
    if (candidates.length === 0) {
      wx.showToast({ title: '没菜可换了', icon: 'none' })
      return
    }
    const newDish = candidates[Math.floor(Math.random() * candidates.length)]
    const newResult = result.slice()
    newResult[idx] = {
      name: newDish.name,
      role: newDish.role,
      time: newDish.time_minutes || '?',
      emoji: ROLE_EMOJI[newDish.role] || '🍽'
    }
    this.setData({ comboResult: newResult })
  },

  // 跳过（combo）
  onSkipCombo(e) {
    const idx = Number(e.currentTarget.dataset.idx)
    const result = this.data.comboResult
    if (isNaN(idx) || !result[idx]) return
    const newResult = result.filter((_, i) => i !== idx)
    this.setData({ comboResult: newResult })
  },

  // 抽一天三餐
  onDrawThree() {
    const allDishes = app.globalData.dishes || []
    if (allDishes.length === 0) {
      wx.showToast({ title: '菜谱还没加载', icon: 'none' })
      return
    }
    const breakfast = algo.chooseOneMeal(allDishes, [], { mustBeRice: false, comboSize: '1-1' })
    const lunch = algo.chooseOneMeal(allDishes, [], { mustBeRice: false, comboSize: '1-1' })
    const dinner = algo.chooseOneMeal(allDishes, [], { mustBeRice: true, comboSize: '1-1' })
    const fmt = (slot, dish) => ({
      slot,
      dishes: [{
        name: dish.name,
        emoji: ROLE_EMOJI[dish.role] || '🍽'
      }]
    })
    const result = [fmt('早餐', breakfast), fmt('午餐', lunch), fmt('晚餐', dinner)]
    this.setData({ threeResult: result })
  },

  // 全部就做这些（三餐）
  async onEatAllThree() {
    const { threeResult } = this.data
    if (!threeResult || threeResult.length === 0) return
    const today = util.todayISO()
    let ok = 0, fail = 0
    for (const meal of threeResult) {
      for (const d of (meal.dishes || [])) {
        try {
          await cloud.addMeal({ dish: d.name, meal: meal.slot, status: 'confirmed', date: today })
          ok++
        } catch (e) { fail++ }
      }
    }
    wx.showToast({ title: `已记录 ${ok} 条`, icon: 'success' })
    this.refresh()
  },

  // 冰箱输入
  onFridgeInputChange(e) {
    this.setData({ fridgeInput: e.detail.value })
  },

  onCheckFridge() {
    const allDishes = app.globalData.dishes || []
    if (allDishes.length === 0) {
      wx.showToast({ title: '菜谱还没加载', icon: 'none' })
      return
    }
    const ingredients = this.data.fridgeInput.trim().split(/\s+/).filter(Boolean)
    if (ingredients.length === 0) {
      wx.showToast({ title: '请输入食材', icon: 'none' })
      return
    }
    const matched = algo.filterByIngredients(allDishes, ingredients)
    const result = matched.slice(0, 20).map(d => ({
      name: d.name,
      role: d.role,
      time: d.time_minutes || '?',
      emoji: ROLE_EMOJI[d.role] || '🍽'
    }))
    this.setData({ fridgeResults: result })
    if (result.length === 0) {
      wx.showToast({ title: '没找到能做的菜', icon: 'none' })
    }
  },

  // 儿童餐
  onDrawKids() {
    const allDishes = app.globalData.dishes || []
    if (allDishes.length === 0) {
      wx.showToast({ title: '菜谱还没加载', icon: 'none' })
      return
    }
    // 儿童餐 = 主菜或早餐类 + 不辣
    const kidsPool = allDishes.filter(d =>
      (d.role === '主菜' || d.role === '早餐' || d.role === '主食')
      && !(d.tags || []).some(t => /辣|麻辣/.test(t))
    )
    const pool = kidsPool.length >= 5 ? kidsPool : allDishes
    const shuffled = pool.slice().sort(() => Math.random() - 0.5)
    const result = shuffled.slice(0, 3).map(d => ({
      name: d.name,
      role: d.role,
      time: d.time_minutes || '?',
      emoji: ROLE_EMOJI[d.role] || '🍽'
    }))
    this.setData({ kidsResult: result })
  },

  // ===== 搜索 =====
  onSearchInput(e) {
    const q = (e.detail.value || '').trim().toLowerCase()
    this.setData({ searchQuery: e.detail.value })
    if (!q) {
      this.setData({ searchResults: [] })
      return
    }
    const all = app.globalData.dishes || []
    const matched = all.filter(d => {
      const name = (d.name || '').toLowerCase()
      if (name.includes(q)) return true
      const ings = (d.ingredients || []).map(i => i.toLowerCase())
      if (ings.some(i => i.includes(q))) return true
      const tags = (d.tags || []).map(t => t.toLowerCase())
      if (tags.some(t => t.includes(q))) return true
      return false
    }).slice(0, 20)
    const results = matched.map(d => ({
      name: d.name,
      role: d.role,
      time: d.time_minutes || '?',
      emoji: ROLE_EMOJI[d.role] || '🍽'
    }))
    this.setData({ searchResults: results })
  },

  onClearSearch() {
    this.setData({ searchQuery: '', searchResults: [] })
  },

  // ===== 菜谱详情 =====
  onShowRecipe(e) {
    const name = e.currentTarget.dataset.name
    if (!name) return
    const all = app.globalData.dishes || []
    const dish = all.find(d => d.name === name)
    if (!dish) {
      wx.showToast({ title: '没找到做法', icon: 'none' })
      return
    }
    this.setData({
      recipeDish: {
        name: dish.name,
        role: dish.role,
        time: dish.time_minutes || '?',
        emoji: ROLE_EMOJI[dish.role] || '🍽',
        ingredients: dish.ingredients || [],
        seasonings: dish.seasonings || [],
        steps: dish.steps || [],
        tip: dish.tip || ''
      }
    })
  },

  closeRecipe() {
    this.setData({ recipeDish: null })
  },

  // ===== 一键记录（就做）=====
  async onEatOne(e) {
    const name = e.currentTarget.dataset.name
    if (!name) return
    try {
      const today = util.todayISO()
      await cloud.addMeal({ dish: name, meal: '午餐', status: 'confirmed', date: today })
      wx.showToast({ title: `✓ ${name}`, icon: 'success', duration: 1500 })
      this.refresh()
    } catch (err) {
      util.showError('记录失败', err)
    }
  },

  // ===== 手动记录 =====
  onManualField(e) {
    const field = e.currentTarget.dataset.field
    this.setData({ [`manualForm.${field}`]: e.detail.value })
  },

  onManualDateTap() {},

  async onManualSave() {
    const f = this.data.manualForm
    if (!f.breakfast.trim() && !f.lunch.trim() && !f.dinner.trim()) {
      wx.showToast({ title: '至少填一餐吧', icon: 'none' })
      return
    }
    const parse = (str) => {
      const seen = new Set(); const out = []
      for (const raw of String(str || '').split(',')) {
        const n = raw.trim()
        if (n && !seen.has(n)) { seen.add(n); out.push(n) }
      }
      return out
    }
    const all = []
    for (const meal of ['早餐', '午餐', '晚餐']) {
      for (const d of parse(f[meal === '早餐' ? 'breakfast' : meal === '午餐' ? 'lunch' : 'dinner'])) {
        all.push({ meal, dish: d })
      }
    }
    if (all.length === 0) {
      wx.showToast({ title: '没有可保存的菜', icon: 'none' })
      return
    }
    let ok = 0, fail = 0
    try {
      for (const { meal, dish } of all) {
        try {
          await cloud.addMeal({ dish, meal, status: 'manual', date: f.date })
          ok++
        } catch (e) { fail++ }
      }
      if (fail === 0) {
        wx.showToast({ title: `已记录 ${ok} 条`, icon: 'success' })
      } else if (ok > 0) {
        wx.showToast({ title: `成功 ${ok}，失败 ${fail}`, icon: 'none' })
      } else {
        util.showError('保存失败', new Error('全部失败'))
      }
      this.setData({ showManualLog: false })
      this.refresh()
    } catch (err) {
      util.showError('保存失败', err)
    }
  },

  // ===== 月度报告 =====
  async _computeMonthlyReport() {
    try {
      const res = await cloud.getHistory(500)
      const history = (res && res.ok) ? res.history : []
      const now = new Date()
      const monthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
      const monthLabel = `${now.getFullYear()}年${now.getMonth() + 1}月`
      const thisMonth = history.filter(h => h.status !== 'skipped' && h.date && h.date.startsWith(monthKey))
      const totalMeals = thisMonth.length
      const days = new Set(thisMonth.map(h => h.date))
      const activeDays = days.size
      const avgPerDay = activeDays > 0 ? (totalMeals / activeDays).toFixed(1) : '0'
      const dishCount = {}
      for (const h of thisMonth) {
        dishCount[h.dish] = (dishCount[h.dish] || 0) + 1
      }
      const topDishes = Object.entries(dishCount)
        .sort((a, b) => b[1] - a[1]).slice(0, 5)
        .map(([name, count], i) => ({ rank: i + 1, name, count, color: RANK_COLORS[i] || '#999' }))
      const mealCount = { '早餐': 0, '午餐': 0, '晚餐': 0 }
      for (const h of thisMonth) {
        const m = h.meal || '午餐'
        if (mealCount[m] !== undefined) mealCount[m]++
      }
      const maxMeal = Math.max(mealCount['早餐'], mealCount['午餐'], mealCount['晚餐'], 1)
      const mealDist = ['早餐', '午餐', '晚餐'].map(meal => ({
        meal, count: mealCount[meal],
        fill: mealCount[meal] > 0 ? Math.round(mealCount[meal] / maxMeal * 100) : 0,
        color: MEAL_COLORS[meal]
      }))
      this.setData({
        monthlyReport: { monthLabel, totalMeals, activeDays, avgPerDay, topDishes, mealDist }
      })
    } catch (err) {
      console.warn('compute report failed', err)
    }
  }
})
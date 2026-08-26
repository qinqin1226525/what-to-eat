// pages/index/index.js —— 选菜主页
const app = getApp()
const algo = require('../../utils/algorithm.js')
const cloud = require('../../utils/cloud.js')

const ROLE_EMOJI = { '主菜': '🍖', '主菜2': '🍖', '主菜3': '🍖', '主菜4': '🍖', '汤': '🍲', '汤2': '🍲', '主食': '🍚', '主食2': '🍚', '凉菜': '🥗', '早餐': '🥣' }

Page({
  data: {
    mode: '',                  // 'one-meal' | 'three-meals' | 'fridge' | 'search' | 'budget-time' | 'scenario'
    result: null,              // 当前结果
    history: [],               // 用于不重复
    prefs: {},
    scores: {},
    profile: {},
    targets: {},
    dailyToday: { calories: 0, protein: 0, carbs: 0, fat: 0, sodium: 0 },
    fridge: [],
    ingredientsInput: '',
    searchInput: '',
    searchResults: [],
    people: 1,                 // 用餐人数 stepper
    peopleOptions: Array.from({ length: 10 }, (_, i) => i + 1),
    showDetail: false,         // 菜谱详情弹窗
    detailDish: null           // 当前查看的菜
  },

  onShow() {
    // 每次进首页拉一次历史（多设备同步）
    this.refreshHistory()
    this.refreshDaily()
  },

  async refreshDaily() {
    try {
      const today = algo.todayISO()
      const todayMeals = this.data.history.filter(h => h.date === today && h.status !== 'skipped')
      const dishes = app.globalData.dishes || []
      const totals = algo.aggregateDailyNutrition(todayMeals, dishes)
      const profile = app.globalData.profile || {}
      const targets = algo.calculateTargets(profile)
      this.setData({ dailyToday: totals, targets })
    } catch (e) {
      console.warn('聚合今日营养失败:', e)
    }
  },

  async refreshHistory() {
    try {
      const res = await cloud.getHistory(200)
      const history = (res && res.ok) ? res.history : []
      const prefs = app.globalData.prefs || {}
      const scores = app.globalData.scores || {}
      const profile = app.globalData.profile || {}
      const targets = algo.calculateTargets(profile)
      this.setData({ history, prefs, scores, profile, targets })
      // 也触发今日聚合
      this.refreshDaily()
    } catch (err) {
      console.warn('拉历史失败', err)
    }
  },

  // 占位：阻止 modal 内部点击冒泡到 mask
  _noop() {},

  // ------- 模式选择 -------
  onMode(e) {
    const mode = e.currentTarget.dataset.mode
    if (mode === 'one-meal') {
      this.pickOneMeal()
    } else if (mode === 'three-meals') {
      this.pickThreeMeals()
    } else if (mode === 'fridge') {
      this.setData({ mode: 'fridge', ingredientsInput: '' })
    } else if (mode === 'search') {
      this.setData({ mode: 'search', searchInput: '', searchResults: [] })
    }
  },


  // ------- 一顿 -------
  pickOneMeal() {
    const dishes = app.globalData.dishes
    if (!dishes || dishes.length === 0) {
      wx.showToast({ title: '菜谱加载中…', icon: 'none' })
      return
    }
    const raw = algo.chooseOneMeal(dishes, this.data.history, {
      prefs: this.data.prefs,
      scores: this.data.scores,
      window: 30,
      comboSize: this.data.prefs.comboSize || '1-1-1'
    })
    // 重组：把中文 key 全转 ASCII，dishes 平铺到数组
    const result = {
      mode: raw.mode,
      isOneBowl: !!raw.isOneBowl,
      isCombo: !!raw.isCombo,
      dishes: [],
      recordDish: ''
    }
    if (raw.isOneBowl && raw.主食) {
      result.dishes.push(Object.assign({}, raw.主食, { _slot: '主食' }))
      result.recordDish = raw.主食.name
    } else if (raw.isCombo) {
      // 顺序：主食、主菜*、汤
      if (raw.主食) {
        result.dishes.push(Object.assign({}, raw.主食, { _slot: '主食' }))
        result.recordDish = raw.主食.name
      }
      for (let i = 1; i <= 4; i++) {
        const key = i === 1 ? '主菜' : `主菜${i}`
        if (raw[key]) result.dishes.push(Object.assign({}, raw[key], { _slot: key }))
      }
      if (raw.汤) result.dishes.push(Object.assign({}, raw.汤, { _slot: '汤' }))
      // recordDish 选第一道主菜（如果没有主菜，回退主食）
      if (raw.主菜) result.recordDish = raw.主菜.name
    } else {
      // 无结果
      result.dishes = []
    }
    this.setData({ mode: 'one-meal', result })
  },

  // ------- 一日三餐 -------
  pickThreeMeals() {
    const dishes = app.globalData.dishes
    if (!dishes || dishes.length === 0) {
      wx.showToast({ title: '菜谱加载中…', icon: 'none' })
      return
    }
    const raw = algo.chooseThreeMeals(dishes, this.data.history, {
      prefs: this.data.prefs,
      scores: this.data.scores,
      window: 7
    })
    // 重组：把中文 key 全部转成 ASCII，避免 WXML 解析器在表达式里拒绝中文
    const result = {
      breakfast: raw.早餐 || null,
      lunch: {
        mode: raw.午餐 ? raw.午餐.mode : 'none',
        isOneBowl: raw.午餐 ? raw.午餐.isOneBowl : false,
        isCombo: raw.午餐 ? raw.午餐.isCombo : false,
        dishes: []   // 配菜模式下的多道菜（顺序：主食、主菜*、汤）
      },
      dinner: {
        mode: raw.晚餐 ? raw.晚餐.mode : 'none',
        isOneBowl: raw.晚餐 ? raw.晚餐.isOneBowl : false,
        isCombo: raw.晚餐 ? raw.晚餐.isCombo : false,
        dishes: []
      }
    }
    // 展开午餐到 dishes 数组（保留 emoji）
    if (raw.午餐) {
      if (raw.午餐.isOneBowl && raw.午餐.主食) {
        result.lunch.dishes.push(raw.午餐.主食)
      } else if (raw.午餐.isCombo) {
        // 按 主食、主菜*、汤 顺序
        if (raw.午餐.主食) result.lunch.dishes.push(raw.午餐.主食)
        for (let i = 1; i <= 4; i++) {
          const key = i === 1 ? '主菜' : `主菜${i}`
          if (raw.午餐[key]) result.lunch.dishes.push(raw.午餐[key])
        }
        if (raw.午餐.汤) result.lunch.dishes.push(raw.午餐.汤)
      }
    }
    // 展开晚餐同上
    if (raw.晚餐) {
      if (raw.晚餐.isOneBowl && raw.晚餐.主食) {
        result.dinner.dishes.push(raw.晚餐.主食)
      } else if (raw.晚餐.isCombo) {
        if (raw.晚餐.主食) result.dinner.dishes.push(raw.晚餐.主食)
        for (let i = 1; i <= 4; i++) {
          const key = i === 1 ? '主菜' : `主菜${i}`
          if (raw.晚餐[key]) result.dinner.dishes.push(raw.晚餐[key])
        }
        if (raw.晚餐.汤) result.dinner.dishes.push(raw.晚餐.汤)
      }
    }
    this.setData({ mode: 'three-meals', result })
  },

  // ------- 冰箱 -------
  onFridgeInput(e) {
    this.setData({ ingredientsInput: e.detail.value })
  },
  onFridgeConfirm() {
    const raw = this.data.ingredientsInput
    const items = raw.split(/[,，\s]+/).map(s => s.trim()).filter(Boolean)
    if (items.length === 0) {
      wx.showToast({ title: '请输入食材', icon: 'none' })
      return
    }
    const dishes = app.globalData.dishes
    if (!dishes || dishes.length === 0) return
    const feasible = algo.filterByIngredients(dishes, items)
    this.setData({ mode: 'fridge-result', feasible, fridgeItems: items, fridgeItemsStr: items.join('、') })
  },

  // ------- 搜索 -------
  onSearchInput(e) {
    const q = e.detail.value
    const dishes = app.globalData.dishes || []
    const results = algo.searchDishes(dishes, q)
    this.setData({ searchInput: q, searchResults: results.slice(0, 50) })
  },

  // ------- 人数变化 -------
  onPeopleChange(e) {
    const people = e.detail.value
    this.setData({ people })
  },

  // ------- 操作 -------
  async confirmEat(e) {
    const dish = e.currentTarget.dataset.dish
    const meal = e.currentTarget.dataset.meal || ''
    try {
      await cloud.addMeal({
        dish,
        meal,
        status: 'confirmed',
        date: algo.todayISO()
      })
      wx.showToast({ title: '已记录 ✓', icon: 'success' })
      this.refreshHistory()
    } catch (err) {
      // 显示真实错误（截前 20 字避免 toast 太长）
      const msg = (err && err.message) ? err.message : String(err)
      const short = msg.length > 20 ? msg.slice(0, 20) + '…' : msg
      wx.showToast({ title: `失败：${short}`, icon: 'none', duration: 3000 })
      console.error('confirmEat 错误:', err)
    }
  },

  async skipEat(e) {
    const dish = e.currentTarget.dataset.dish
    try {
      await cloud.addMeal({
        dish,
        meal: '',
        status: 'skipped',
        date: algo.todayISO()
      })
      wx.showToast({ title: '已跳过', icon: 'none' })
      this.refreshHistory()
    } catch (err) {
      const msg = (err && err.message) ? err.message : String(err)
      const short = msg.length > 20 ? msg.slice(0, 20) + '…' : msg
      wx.showToast({ title: `失败：${short}`, icon: 'none', duration: 3000 })
      console.error('skipEat 错误:', err)
    }
  },

  async reroll() {
    if (this.data.mode === 'one-meal') {
      this.pickOneMeal()
    } else if (this.data.mode === 'three-meals') {
      this.pickThreeMeals()
    }
  },

  reset() {
    this.setData({ mode: '', result: null })
  },

  onOpenStats() {
    wx.navigateTo({ url: '/pages/stats/stats' })
  },

  // ------- 菜谱详情弹窗 -------
  showDishDetail(e) {
    const dish = e.currentTarget.dataset.dish
    if (!dish) return
    // 把 emoji 也带上（算法里给结果加了，菜谱表里没有）
    // WXML 不支持 Array.join()，必须预处理成 ingredientsStr/seasoningsStr
    const detail = Object.assign({}, dish, {
      tags: dish.tags || [],
      ingredientsStr: (dish.ingredients || []).join('、'),
      seasoningsStr: (dish.seasonings || []).join('、'),
    })
    this.setData({ showDetail: true, detailDish: detail })
  },

  closeDishDetail() {
    this.setData({ showDetail: false, detailDish: null })
  },

  // ------- 辅助 -------
  roleEmoji(role) {
    return ROLE_EMOJI[role] || '•'
  }
})
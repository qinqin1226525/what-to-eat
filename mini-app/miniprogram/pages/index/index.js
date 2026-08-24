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

  // ------- 预算时间 -------
  // 把 algo.chooseOneMeal 返回的 {主菜/汤/主食} 重组为 result.dishes 数组
  // 与 pickOneMeal 里的逻辑保持一致（行 92-115）
  convertRawToResult(raw) {
    const result = {
      mode: raw.mode,
      isOneBowl: !!raw.isOneBowl,
      isCombo: !!raw.isCombo,
      dishes: [],
      recordDish: ''
    }
    if (raw.isOneBowl && raw['主食']) {
      const d = Object.assign({}, raw['主食'], { _slot: '主食' })
      result.dishes.push(d)
      result.recordDish = raw['主食'].name
    } else if (raw.isCombo) {
      if (raw['主食']) {
        const d = Object.assign({}, raw['主食'], { _slot: '主食' })
        result.dishes.push(d)
        result.recordDish = raw['主食'].name
      }
      for (let i = 1; i <= 4; i++) {
        const key = i === 1 ? '主菜' : `主菜${i}`
        if (raw[key]) {
          const d = Object.assign({}, raw[key], { _slot: key })
          result.dishes.push(d)
        }
      }
      if (raw['汤']) {
        const d = Object.assign({}, raw['汤'], { _slot: '汤' })
        result.dishes.push(d)
      }
      if (raw['主菜']) result.recordDish = raw['主菜'].name
    }
    return result
  },

  enterBudgetTime() {
    const prefs = app.globalData.prefs || {}
    const last = prefs.maxTime || 0
    this.setData({
      mode: 'budget-time',
      selectedBudgetTime: last,
      lastBudgetTime: last,
    })
    // 首次进入弹引导
    if (!app.globalData.guidedFeatures?.budgetTime) {
      wx.showModal({
        title: '⏱️ 新功能',
        content: '按时间选菜——选档位，3 秒拿到推荐。',
        showCancel: false,
        confirmText: '我知道了',
      })
      app.globalData.guidedFeatures = { ...(app.globalData.guidedFeatures || {}), budgetTime: true }
    }
  },

  onBudgetTimeSelect(e) {
    const minutes = Number(e.currentTarget.dataset.minutes) || 0
    const dishes = app.globalData.dishes
    if (!dishes || dishes.length === 0) {
      wx.showToast({ title: '菜谱加载中…', icon: 'none' })
      return
    }
    const prefs = Object.assign({}, app.globalData.prefs || {}, { maxTime: minutes })
    const raw = algo.chooseOneMeal(dishes, this.data.history, {
      prefs, scores: this.data.scores, window: 30,
      comboSize: this.data.prefs.comboSize || '1-1-1',
    })
    const result = this.convertRawToResult(raw)
    this.setData({ mode: 'budget-time-result', result, selectedBudgetTime: minutes })
    // 持久化
    cloud.savePrefs({ prefs, profile: app.globalData.profile || {} }).catch(err => {
      console.warn('保存 maxTime 失败:', err)
    })
  },

  onBudgetTimeReset() {
    this.setData({ mode: 'budget-time' })
  },

  // ------- 场景选菜 -------
  enterScenario() {
    const prefs = app.globalData.prefs || {}
    const last = SCENARIOS.find(s => s.id === prefs.lastScenario) || null
    this.setData({
      mode: 'scenario',
      selectedScenario: last,
      lastScenario: last ? last.id : null,
    })
    if (!app.globalData.guidedFeatures?.scenario) {
      wx.showModal({
        title: '🎭 新功能',
        content: '按场景选菜——为不同场合推荐专属菜单。',
        showCancel: false,
        confirmText: '我知道了',
      })
      app.globalData.guidedFeatures = { ...(app.globalData.guidedFeatures || {}), scenario: true }
    }
  },

  onScenarioSelect(e) {
    const id = e.currentTarget.dataset.id
    const scenario = SCENARIOS.find(s => s.id === id)
    if (!scenario) return
    const dishes = app.globalData.dishes
    if (!dishes || dishes.length === 0) {
      wx.showToast({ title: '菜谱加载中…', icon: 'none' })
      return
    }
    const basePrefs = app.globalData.prefs || {}
    const scenarioPrefs = {
      cuisines: scenario.cuisines || [],
      excludeCuisines: scenario.excludeCuisines || [],
      maxTime: scenario.maxTime || 0,
    }
    const prefs = Object.assign({}, basePrefs, scenarioPrefs)

    let result
    if (scenario.nPeople) {
      // 多人场景：用 chooseCombo
      const raw = algo.chooseCombo(dishes, this.data.history, {
        nPeople: scenario.nPeople,
        comboSize: scenario.comboSize,
        prefs,
        scores: this.data.scores,
      })
      console.log('[scenario]', scenario.id, 'raw keys:', Object.keys(raw), 'isCombo:', raw.isCombo)
      result = this.convertRawToResult(raw)
      console.log('[scenario]', scenario.id, 'result.dishes:', result.dishes.length)
      // 兜底：如果 chooseCombo 返回空（极端情况），退化到一顿
      if (result.dishes.length === 0) {
        console.warn('[scenario] chooseCombo 返回空，fallback 到 chooseOneMeal')
        const raw2 = algo.chooseOneMeal(dishes, this.data.history, {
          prefs: basePrefs, scores: this.data.scores, window: 30,
          comboSize: this.data.prefs.comboSize || '1-1-1'
        })
        result = this.convertRawToResult(raw2)
      }
    } else {
      // 单人场景：用 chooseOneMeal
      const raw = algo.chooseOneMeal(dishes, this.data.history, {
        prefs, scores: this.data.scores, window: 30,
        comboSize: this.data.prefs.comboSize || '1-1-1',
      })
      result = this.convertRawToResult(raw)
    }

    this.setData({ mode: 'scenario-result', result, selectedScenario: scenario })

    // 持久化 lastScenario
    const newPrefs = Object.assign({}, prefs, { lastScenario: scenario.id })
    cloud.savePrefs({ prefs: newPrefs, profile: app.globalData.profile || {} }).catch(err => {
      console.warn('保存 lastScenario 失败:', err)
    })
  },

  onScenarioReset() {
    this.setData({ mode: 'scenario' })
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

  onOpenAI() {
    wx.navigateTo({ url: '/pages/chat/chat' })
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
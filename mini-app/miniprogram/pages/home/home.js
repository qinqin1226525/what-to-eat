// pages/home/home.js —— 手搓选菜（核心页面）
const app = getApp()
const cloud = require('../../utils/cloud.js')
const util = require('../../utils/util.js')

const ROLE_LABEL = {
  '主菜': '🍖 主菜',
  '汤': '🍲 汤',
  '主食': '🍚 主食',
  '凉菜': '🥗 凉菜',
  '早餐': '🥣 早餐'
}

Page({
  data: {
    fridgeItems: [],
    customDishes: [],
    recentPicks: [],     // 最近7天已抽
    loading: true,
    picked: null,        // 抽到的结果 {dishes: [], source: 'random'|'ai'}
    picking: false,
    dishDetail: null,     // 详情 modal 数据
    // onboarding
    showOnboarding: false,
    onboardingDishes: [],  // [{role, name, checked}]
    // AI
    aiAvailable: true,     // 是否显示 AI 灵感按钮（API_KEY 配了才有）
    // 系统信息
    screenWidth: 375,
    fontScale: 1.0,
    dishCount: 0
  },

  onLoad() {
    try {
      const sys = wx.getSystemInfoSync()
      const w = sys.screenWidth || 375
      this.setData({
        screenWidth: w,
        fontScale: Math.max(0.85, Math.min(1.15, w / 375))
      })
    } catch (e) { /* ignore */ }
    this.refresh()
  },

  onShow() {
    // 从冰箱 tab 回来时刷一下
    this.refresh()
  },

  async refresh() {
    this.setData({ loading: true })
    try {
      const [fridgeRes, customRes, historyRes] = await Promise.all([
        cloud.getFridge(),
        cloud.call('customDish', { action: 'get' }),
        cloud.getHistory(50)
      ])
      const fridgeItems = (fridgeRes && fridgeRes.ok) ? fridgeRes.items : []
      const customDishes = (customRes && customRes.ok) ? customRes.items : []
      // 最近 7 天已抽（status 为 confirmed 或 manual 的）
      const cutoff = new Date()
      cutoff.setDate(cutoff.getDate() - 7)
      const recentPicks = (historyRes && historyRes.ok ? historyRes.history : [])
        .filter(h => h.status !== 'skipped' && new Date(h.date) >= cutoff)
        .map(h => h.dish)

      this.setData({ fridgeItems, customDishes, recentPicks, loading: false })

      // 首次进入且菜池为空 → 弹 onboarding
      if (customDishes.length === 0 && !this.data._onboardingDone) {
        this.openOnboarding()
      }
    } catch (err) {
      console.warn('refresh 失败', err)
      this.setData({ loading: false })
    }
  },

  // ----- 随机选 3 道 -----
  async onRandomPick() {
    if (this.data.picking) return
    const { customDishes, recentPicks, fridgeItems } = this.data
    if (customDishes.length === 0) {
      wx.showToast({ title: '菜池为空，先加几道', icon: 'none' })
      this.openOnboarding()
      return
    }
    // 候选 = 菜池 - 最近7天
    const recentSet = new Set(recentPicks)
    const candidates = customDishes.filter(d => !recentSet.has(d))
    if (candidates.length === 0) {
      wx.showToast({ title: '7 天内都吃过了，加点新菜', icon: 'none', duration: 2500 })
      return
    }
    // 优先选和冰箱食材匹配的菜（启发式：菜名或 ingredients 包含冰箱）
    const fridgeSet = new Set(fridgeItems.map(f => f.replace(/\s*\d+g?$/i, '').toLowerCase()))
    const matched = candidates.filter(d => {
      const lc = d.toLowerCase()
      return Array.from(fridgeSet).some(f => lc.includes(f))
    })
    const pool = matched.length >= 3 ? matched : candidates
    // 洗牌取前 3
    const shuffled = pool.slice().sort(() => Math.random() - 0.5)
    const dishes = shuffled.slice(0, Math.min(3, shuffled.length))

    this.setData({ picked: { dishes, source: 'random' } })
  },

  // ----- AI 灵感 -----
  async onAiInspire() {
    if (this.data.picking) return
    const { customDishes, recentPicks, fridgeItems } = this.data
    if (customDishes.length === 0) {
      wx.showToast({ title: '菜池为空，先加几道', icon: 'none' })
      this.openOnboarding()
      return
    }
    const recentSet = new Set(recentPicks)
    const candidates = customDishes.filter(d => !recentSet.has(d))
    if (candidates.length === 0) {
      wx.showToast({ title: '7 天内都吃过了，加点新菜', icon: 'none', duration: 2500 })
      return
    }

    this.setData({ picking: true })
    try {
      const res = await cloud.call('aiAdvisor', {
        mode: 'pickWithAI',
        candidates,
        recentPicks,
        fridge: fridgeItems
      })
      if (res && res.ok && res.picks && res.picks.length > 0) {
        this.setData({ picked: { dishes: res.picks.map(p => p.dish), reasons: res.picks, source: 'ai' } })
      } else {
        // AI 失败兜底：走本地随机
        wx.showToast({ title: 'AI 暂不可用，本地随机', icon: 'none' })
        this.setData({ picking: false })
        this.onRandomPick()
        return
      }
    } catch (err) {
      wx.showToast({ title: 'AI 调用失败，本地随机', icon: 'none' })
      this.setData({ picking: false })
      this.onRandomPick()
      return
    }
    this.setData({ picking: false })
  },

  // ----- 关闭结果卡片 -----
  closePicked() {
    this.setData({ picked: null })
  },

  // ----- 点菜名 → 弹详情 modal -----
  onDishTap(e) {
    const name = e.currentTarget.dataset.name
    if (!name) return
    const dishes = app.globalData.dishes || []
    const dish = dishes.find(d => d.name === name)
    if (!dish) {
      // globalData 没有 → 现场拉一次
      this.loadAndShowDetail(name)
      return
    }
    this.setData({ dishDetail: this.formatDishDetail(dish) })
  },

  async loadAndShowDetail(name) {
    try {
      const res = await cloud.getDishes()
      const dishes = (res && res.ok && res.dishes) || []
      const dish = dishes.find(d => d.name === name)
      if (dish) {
        // 顺手刷一下 globalData 缓存
        app.globalData.dishes = dishes
        this.setData({ dishDetail: this.formatDishDetail(dish) })
      } else {
        wx.showToast({ title: '没找到做法', icon: 'none' })
      }
    } catch (err) {
      util.showError('加载失败', err)
    }
  },

  formatDishDetail(dish) {
    const ingredients = dish.ingredients || []
    const seasonings = dish.seasonings || []
    return {
      name: dish.name,
      role: dish.role || '主菜',
      time: dish.time_minutes || '?',
      tags: dish.tags || [],
      emoji: dish.emoji || '🍽',
      ingredients,
      seasonings,
      steps: dish.steps || [],
      tip: dish.tip || '',
      ingredientsStr: ingredients.join('、'),
      seasoningsStr: seasonings.join('、')
    }
  },

  closeDishDetail() {
    this.setData({ dishDetail: null })
  },

  // 换一道：用新随机菜替换当前详情的那道
  onSwapDish() {
    const detail = this.data.dishDetail
    if (!detail || !detail.name) return
    const { picked, customDishes, recentPicks, fridgeItems } = this.data
    if (!picked || !picked.dishes) return

    // 候选 = 菜池 - 最近7天 - 当前3 道里其它2 道
    const recentSet = new Set(recentPicks)
    const othersInPicked = new Set(picked.dishes.filter(d => d !== detail.name))
    const candidates = customDishes.filter(d =>
      !recentSet.has(d) && !othersInPicked.has(d) && d !== detail.name
    )
    if (candidates.length === 0) {
      wx.showToast({ title: '没菜可换了', icon: 'none' })
      return
    }
    // 启发式：优先匹配冰箱
    const fridgeKeys = fridgeItems.map(f =>
      f.replace(/\s*\d+g?$/i, '').toLowerCase()
    )
    const matched = candidates.filter(d => {
      const lc = d.toLowerCase()
      return fridgeKeys.some(k => lc.includes(k))
    })
    const pool = matched.length > 0 ? matched : candidates
    const newDish = pool[Math.floor(Math.random() * pool.length)]

    // 替换 picked.dishes 里的那一道（保留 reason 如果有）
    const newDishes = picked.dishes.map(d => d === detail.name ? newDish : d)
    let newReasons = picked.reasons
    if (picked.reasons) {
      newReasons = picked.reasons.map(r =>
        r && r.dish === detail.name ? { ...r, dish: newDish } : r
      )
    }
    this.setData({
      picked: { ...picked, dishes: newDishes, reasons: newReasons }
    })
    // 重新拉新菜的详情
    this.onDishTap({ currentTarget: { dataset: { name: newDish } } })
  },

  // ----- 「吃这个」一键记录（支持传 dish 名 + 自动关掉详情 modal） -----
  async onEat(e) {
    const dish = e.currentTarget.dataset.dish
    if (!dish) return
    try {
      const today = new Date().toISOString().slice(0, 10)
      await cloud.addMeal({ dish, meal: '午餐', status: 'confirmed', date: today })
      wx.showToast({ title: `✓ ${dish}`, icon: 'success', duration: 1500 })
      this.setData({
        picked: null,
        dishDetail: null,
        recentPicks: Array.from(new Set([dish, ...this.data.recentPicks])).slice(0, 50)
      })
    } catch (err) {
      util.showError('记录失败', err)
    }
  },

  // ----- 菜池增删 -----
  async onAddDish(e) {
    const value = (e.detail.value || '').trim()
    if (!value) return
    try {
      await cloud.call('customDish', { action: 'add', items: [value] })
      this.setData({
        customDishes: Array.from(new Set([...this.data.customDishes, value])),
        inputValue: ''
      })
      wx.showToast({ title: '已加', icon: 'success', duration: 1000 })
    } catch (err) {
      wx.showToast({ title: '加失败', icon: 'none' })
    }
  },

  async onRemoveDish(e) {
    const name = e.currentTarget.dataset.name
    if (!name) return
    try {
      await cloud.call('customDish', { action: 'remove', name })
      this.setData({ customDishes: this.data.customDishes.filter(d => d !== name) })
    } catch (err) {
      wx.showToast({ title: '删失败', icon: 'none' })
    }
  },

  // ----- Onboarding: 首次进入从 125 道预选菜池 -----
  async openOnboarding() {
    // 从 cloud 拉 125 道菜按 role 分组
    try {
      const res = await cloud.getDishes()
      const dishes = (res && res.ok && res.dishes) || []
      // 按 role 分组
      const grouped = {}
      for (const d of dishes) {
        if (!grouped[d.role]) grouped[d.role] = []
        grouped[d.role].push(d.name)
      }
      // 转成 onboardingDishes
      const onboardingDishes = []
      const ROLE_ORDER = ['主菜', '汤', '主食', '凉菜', '早餐']
      for (const role of ROLE_ORDER) {
        if (grouped[role]) {
          onboardingDishes.push({
            role,
            label: ROLE_LABEL[role] || role,
            items: grouped[role].map(name => ({ name, checked: false }))
          })
        }
      }
      this.setData({ showOnboarding: true, onboardingDishes })
    } catch (err) {
      // 拉不到就走纯手动模式（用户自己加菜）
      this.setData({ showOnboarding: false })
    }
  },

  closeOnboarding() {
    this.setData({ showOnboarding: false, _onboardingDone: true })
  },

  onToggleOnboard(e) {
    const { role, name } = e.currentTarget.dataset
    const list = this.data.onboardingDishes
    const roleGroup = list.find(g => g.role === role)
    if (!roleGroup) return
    const item = roleGroup.items.find(i => i.name === name)
    if (item) item.checked = !item.checked
    this.setData({ onboardingDishes: list })
  },

  // 全选某个 role 组
  onSelectGroup(e) {
    const { role } = e.currentTarget.dataset
    const list = this.data.onboardingDishes
    const group = list.find(g => g.role === role)
    if (!group) return
    group.items.forEach(item => { item.checked = true })
    this.setData({ onboardingDishes: list })
  },

  // 清除某个 role 组
  onClearGroup(e) {
    const { role } = e.currentTarget.dataset
    const list = this.data.onboardingDishes
    const group = list.find(g => g.role === role)
    if (!group) return
    group.items.forEach(item => { item.checked = false })
    this.setData({ onboardingDishes: list })
  },

  async saveOnboarding() {
    const picked = []
    for (const g of this.data.onboardingDishes) {
      for (const item of g.items) {
        if (item.checked) picked.push(item.name)
      }
    }
    try {
      await cloud.call('customDish', { action: 'replace', items: picked })
      this.setData({
        customDishes: picked,
        showOnboarding: false,
        _onboardingDone: true
      })
      if (picked.length > 0) {
        wx.showToast({ title: `已选 ${picked.length} 道`, icon: 'success' })
      }
    } catch (err) {
      util.showError('保存失败', err)
    }
  }
})
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
    picked: null,        // 抽到的结果 {dishes, dishInfos, expanded, reasons, source}
    picking: false,
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
    const expanded = dishes.map(() => false)

    this.setData({ picked: { dishes, source: 'random', expanded } })
    // 异步加载完整菜谱信息（不影响显示，ingredients/seasonings 会填充）
    this.enrichDishes(dishes).then(infos => {
      const cur = this.data.picked
      if (cur && cur.dishes && cur.dishes.length === dishes.length) {
        this.setData({ picked: { ...cur, dishInfos: infos } })
      }
    })
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
        const dishes = res.picks.map(p => p.dish)
        const expanded = dishes.map(() => false)
        this.setData({ picked: { dishes, reasons: res.picks, source: 'ai', expanded } })
        // 异步加载菜谱详情
        this.enrichDishes(dishes).then(infos => {
          const cur = this.data.picked
          if (cur && cur.dishes && cur.dishes.length === dishes.length) {
            this.setData({ picked: { ...cur, dishInfos: infos } })
          }
        })
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

  // 再加一道：人多时往当前列表追加第 4/5/... 道
  onAddOneMore() {
    const { picked, customDishes, recentPicks, fridgeItems } = this.data
    if (!picked || !picked.dishes) return

    const recentSet = new Set(recentPicks)
    const inPicked = new Set(picked.dishes)
    const candidates = customDishes.filter(d =>
      !recentSet.has(d) && !inPicked.has(d)
    )
    if (candidates.length === 0) {
      wx.showToast({ title: '没菜可加了', icon: 'none' })
      return
    }
    const fridgeKeys = fridgeItems.map(f =>
      f.replace(/\s*\d+g?$/i, '').toLowerCase()
    )
    const matched = candidates.filter(d => {
      const lc = d.toLowerCase()
      return fridgeKeys.some(k => lc.includes(k))
    })
    const pool = matched.length > 0 ? matched : candidates
    const newDish = pool[Math.floor(Math.random() * pool.length)]

    const newDishes = [...picked.dishes, newDish]
    const newReasons = picked.reasons ? [...picked.reasons, { dish: newDish, reason: '' }] : picked.reasons
    const newExpanded = picked.expanded ? [...picked.expanded, false] : newDishes.map(() => false)
    // 先更新 dishes（用户立刻看到菜名 +1），再异步拉详情
    this.setData({
      picked: { ...picked, dishes: newDishes, reasons: newReasons, expanded: newExpanded }
    })
    this.enrichDishes([newDish]).then(infos => {
      const cur = this.data.picked
      if (!cur) return
      const newInfos = cur.dishInfos ? cur.dishInfos.slice() : []
      newInfos[newInfos.length] = infos[0]
      this.setData({ picked: { ...cur, dishInfos: newInfos } })
    })
    wx.showToast({ title: `+1 ${newDish}`, icon: 'success', duration: 1200 })
  },

  // ----- 内联展示：把菜名 → 完整菜谱信息 -----
  // 用法：await this.enrichDishes(['番茄炒蛋', '紫菜蛋汤']) → [{name, ingredients, ...}, ...]
  async enrichDishes(names) {
    if (!names || names.length === 0) return []
    let dishes = app.globalData.dishes || []
    // globalData 没缓存时现场拉
    if (dishes.length === 0) {
      try {
        const res = await cloud.getDishes()
        dishes = (res && res.ok && res.dishes) || []
        app.globalData.dishes = dishes
      } catch (e) {
        dishes = []
      }
    }
    const byName = new Map(dishes.map(d => [d.name, d]))
    return names.map(name => {
      const d = byName.get(name)
      if (!d) {
        return {
          name,
          ingredients: [], ingredientsStr: '',
          seasonings: [], seasoningsStr: '',
          steps: [], tip: '', time: '?'
        }
      }
      const ingredients = d.ingredients || []
      const seasonings = d.seasonings || []
      return {
        name: d.name,
        time: d.time_minutes || '?',
        ingredients,
        seasonings,
        steps: d.steps || [],
        tip: d.tip || '',
        ingredientsStr: ingredients.join('、'),
        seasoningsStr: seasonings.join('、')
      }
    })
  },

  // 点菜名 → 切换展开/收起做法
  onToggleExpand(e) {
    const idx = e.currentTarget.dataset.idx
    const picked = this.data.picked
    if (!picked) return
    const expanded = picked.expanded ? [...picked.expanded] : picked.dishes.map(() => false)
    expanded[idx] = !expanded[idx]
    this.setData({ picked: { ...picked, expanded } })
  },

  // 换一道：用新随机菜替换 idx 那道（内联版）
  onSwapDish(e) {
    const idx = Number(e.currentTarget.dataset.idx)
    const { picked, customDishes, recentPicks, fridgeItems } = this.data
    if (!picked || !picked.dishes || isNaN(idx)) return
    const targetName = picked.dishes[idx]

    const recentSet = new Set(recentPicks)
    const othersInPicked = new Set(picked.dishes.filter((_, i) => i !== idx))
    const candidates = customDishes.filter(d =>
      !recentSet.has(d) && !othersInPicked.has(d) && d !== targetName
    )
    if (candidates.length === 0) {
      wx.showToast({ title: '没菜可换了', icon: 'none' })
      return
    }
    const fridgeKeys = fridgeItems.map(f =>
      f.replace(/\s*\d+g?$/i, '').toLowerCase()
    )
    const matched = candidates.filter(d => {
      const lc = d.toLowerCase()
      return fridgeKeys.some(k => lc.includes(k))
    })
    const pool = matched.length > 0 ? matched : candidates
    const newDish = pool[Math.floor(Math.random() * pool.length)]

    // 替换 dishes + dishInfos + reasons + expanded
    const newDishes = picked.dishes.slice()
    newDishes[idx] = newDish
    const newInfos = picked.dishInfos ? picked.dishInfos.slice() : []
    // 新菜的 info 等 enrich 完再设
    this.setData({
      picked: { ...picked, dishes: newDishes, dishInfos: newInfos }
    })
    // 异步拉新菜 info 替换
    this.enrichDishes([newDish]).then(infos => {
      const cur = this.data.picked
      if (!cur) return
      const finalInfos = cur.dishInfos ? cur.dishInfos.slice() : []
      finalInfos[idx] = infos[0]
      this.setData({ picked: { ...cur, dishInfos: finalInfos } })
    })
    // reasons 同步替换
    if (picked.reasons) {
      const newReasons = picked.reasons.slice()
      if (newReasons[idx]) newReasons[idx] = { ...newReasons[idx], dish: newDish }
      this.setData({ picked: { ...this.data.picked, reasons: newReasons } })
    }
  },

  // ----- 「就做这个」一键记录 -----
  async onEat(e) {
    const dish = e.currentTarget.dataset.dish
    if (!dish) return
    try {
      const today = new Date().toISOString().slice(0, 10)
      await cloud.addMeal({ dish, meal: '午餐', status: 'confirmed', date: today })
      wx.showToast({ title: `✓ ${dish}`, icon: 'success', duration: 1500 })
      this.setData({
        picked: null,
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
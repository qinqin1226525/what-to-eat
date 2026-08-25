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

// 按 role 给每个菜选 emoji（参考 web app：主菜🥢、汤🥣、主食🥯）
const ROLE_EMOJI = {
  '主菜': '🥢',
  '汤': '🥣',
  '主食': '🥯',
  '凉菜': '🥗',
  '早餐': '🍳'
}

Page({
  data: {
    customDishes: [],
    recentPicks: [],     // 最近7天已抽
    loading: true,
    picked: null,        // {dishes, dishInfos, reasons, source}
    pickedMeals: [],   // 用户在 modal 里「选这道」的菜名列表，多次 addMeal 用
    picking: false,
    pickedHint: '',     // 结果 modal 的提示文字
    preferenceNote: '', // 用户偏好（AI 过滤时显示）
    // onboarding
    showOnboarding: false,
    onboardingDishes: [],
    // 「别的」modal
    showCustomDish: false,
    customInput: '',
    customCandidates: [],
    customFocus: false,
    customTargetIdx: -1,
    // 菜池批量输入
    poolInputs: [{ id: 1, value: '' }, { id: 2, value: '' }, { id: 3, value: '' }, { id: 4, value: '' }, { id: 5, value: '' }],
    nextPoolId: 6,
    savingPool: false,
    // 可折叠 section 状态（默认全收起）
    expanded: { pool: false, recent: false, stats: false },
    // 手动记录 modal（按饮食报告风格）
    showManualLog: false,
    manualForm: { date: '', breakfast: '', lunch: '', dinner: '' },
    // 一日三餐定制 modal
    showDayMeals: false,
    dayMeals: null,         // {早餐: [], 午餐: [], 晚餐: []}
    dayMealNote: '',        // AI 整体说明
    dayMealsLoading: false,
    savingDayMeals: false,
    // 搜菜谱（输入菜名出菜谱）
    searchInput: '',
    searchResults: [],   // 过滤后的菜谱
    searchDetail: null, // 选中的菜详情
    // 手动记录本（看历史 + 编辑 + 删除）
    showLogbook: false,
    logbookLoading: false,
    logbookGroups: [],   // [{date, items: [{_id, dish, meal, status, ...}]}]
    // 编辑单条记录
    showEditRecord: false,
    editForm: { _id: '', dish: '', meal: '午餐', date: '' },
    editing: false,
    // 统计（计算自 meals 集合，1 页内 inline 显示）
    stats: { totalMeals: 0, activeDays: 0, avgPerDay: 0, topDishes: [], mealDist: [] },
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
      const [customRes, historyRes, dishesRes] = await Promise.all([
        cloud.call('customDish', { action: 'get' }),
        cloud.getHistory(50),
        cloud.getDishes()
      ])
      const customDishes = (customRes && customRes.ok) ? customRes.items : []
      const history = (historyRes && historyRes.ok) ? historyRes.history : []
      const rawDishes = (dishesRes && dishesRes.ok) ? dishesRes.dishes : []

      // 防御性去重：云端 getDishes 已经去重，但历史数据可能还有残留
      const seen = new Set()
      const allDishes = []
      for (const d of rawDishes) {
        if (!d || !d.name || seen.has(d.name)) continue
        seen.add(d.name)
        allDishes.push(d)
      }
      // 缓存到 globalData
      app.globalData.dishes = allDishes

      // 缓存到 globalData
      app.globalData.dishes = allDishes

      // 最近 7 天已抽
      const cutoff = new Date()
      cutoff.setDate(cutoff.getDate() - 7)
      const recentPicks = history
        .filter(h => h.status !== 'skipped' && new Date(h.date) >= cutoff)
        .map(h => h.dish)

      const stats = this._computeStats(history)

      this.setData({
        customDishes, recentPicks, stats,
        loading: false
      })

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
      // 菜池空 → 自动展开批量输入区 + 滚动 + 提示
      if (!this.data.expanded.pool) {
        this.setData({ 'expanded.pool': true })
      }
      setTimeout(() => {
        wx.pageScrollTo({ selector: '.batch-inputs', duration: 300 })
      }, 50)
      wx.showToast({ title: '菜池为空，先在下面加几道', icon: 'none', duration: 3000 })
      return
    }
    // 候选 = 菜池 - 最近7天
    const recentSet = new Set(recentPicks)
    const candidates = customDishes.filter(d => !recentSet.has(d))
    if (candidates.length === 0) {
      wx.showToast({ title: '7 天内都吃过了，加点新菜', icon: 'none', duration: 2500 })
      return
    }
    // 启发式：优先和冰箱食材匹配
    const fridgeSet = new Set(fridgeItems.map(f => f.replace(/\s*\d+g?$/i, '').toLowerCase()))
    const fridgeMatched = candidates.filter(d => {
      const lc = d.toLowerCase()
      return Array.from(fridgeSet).some(f => lc.includes(f))
    })
    const pool = fridgeMatched.length >= 3 ? fridgeMatched : candidates

    // 检查用户偏好（customNote）
    const prefs = app.globalData.prefs || {}
    const customNote = (prefs.customNote || '').trim()
    const hasPreference = customNote.length > 0

    if (hasPreference) {
      // 有偏好 → 调 AI 过滤（pickWithAI）
      this.setData({
        picking: true,
        pickedHint: `🤖 AI 按你偏好筛选中…`,
        preferenceNote: customNote
      })
      try {
        const res = await cloud.call('aiAdvisor', {
          mode: 'pickWithAI',
          candidates: pool,
          recentPicks,
          fridge: fridgeItems,
          hint: customNote
        })
        if (res && res.ok && res.picks && res.picks.length > 0) {
          const dishes = res.picks.map(p => p.dish)
          const expanded = dishes.map(() => false)
          this.setData({
            picked: { dishes, reasons: res.picks, source: 'ai', expanded },
            pickedHint: `🎯 AI 按你偏好推荐`
          })
          this.enrichDishes(dishes).then(infos => {
            const cur = this.data.picked
            if (cur && cur.dishes && cur.dishes.length === dishes.length) {
              this.setData({ picked: { ...cur, dishInfos: infos } })
            }
          })
        } else {
          // AI 失败 → 兜底本地随机
          this._localRandomPick(pool, expanded)
          this.setData({ pickedHint: '⚠️ AI 不可用，本地随机' })
        }
      } catch (err) {
        this._localRandomPick(pool, expanded)
        this.setData({ pickedHint: '⚠️ AI 失败，本地随机' })
      } finally {
        this.setData({ picking: false })
      }
    } else {
      // 无偏好 → 本地随机
      this._localRandomPick(pool, [])
    }
  },

  // 本地随机（兜底或无偏好时）
  _localRandomPick(pool, expanded) {
    const shuffled = pool.slice().sort(() => Math.random() - 0.5)
    const dishes = shuffled.slice(0, Math.min(3, shuffled.length))
    const exp = expanded && expanded.length > 0 ? expanded : dishes.map(() => false)
    this.setData({ picked: { dishes, source: 'random', expanded: exp } })
    this.enrichDishes(dishes).then(infos => {
      const cur = this.data.picked
      if (cur && cur.dishes && cur.dishes.length === dishes.length) {
        this.setData({ picked: { ...cur, dishInfos: infos } })
      }
    })
  },

  // ----- 手动记录今天吃了啥（直接在 home 弹 modal）-----
  onManualRecord() {
    this.setData({
      showManualLog: true,
      manualForm: { date: util.todayISO(), breakfast: '', lunch: '', dinner: '' }
    })
  },

  closeManualLog() {
    this.setData({ showManualLog: false })
  },

  onManualField(e) {
    const field = e.currentTarget.dataset.field
    this.setData({ [`manualForm.${field}`]: e.detail.value })
  },

  onManualDateTap() {
    // 单纯给 picker 点击用（picker 自带触发）
  },

  parseManualInput(str) {
    if (!str) return []
    const seen = new Set()
    const out = []
    for (const raw of String(str).split(',')) {
      const name = raw.trim()
      if (!name || seen.has(name)) continue
      seen.add(name)
      out.push(name)
    }
    return out
  },

  async onManualSave() {
    const f = this.data.manualForm
    if (!f.breakfast.trim() && !f.lunch.trim() && !f.dinner.trim()) {
      wx.showToast({ title: '至少填一餐吧', icon: 'none' })
      return
    }
    if (!f.date) {
      wx.showToast({ title: '请选择日期', icon: 'none' })
      return
    }

    const meals = [
      { meal: '早餐', dishes: this.parseManualInput(f.breakfast) },
      { meal: '午餐', dishes: this.parseManualInput(f.lunch) },
      { meal: '晚餐', dishes: this.parseManualInput(f.dinner) }
    ]
    const all = meals.flatMap(m => m.dishes.map(d => ({ meal: m.meal, dish: d })))
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
        } catch (e) {
          fail++
        }
      }
      if (fail === 0) {
        wx.showToast({ title: `已记录 ${ok} 条`, icon: 'success' })
      } else if (ok > 0) {
        wx.showToast({ title: `成功 ${ok}，失败 ${fail}`, icon: 'none' })
      } else {
        util.showError('保存失败', new Error('全部失败'))
      }
      this.setData({ showManualLog: false })
      // 刷新最近吃过（更新统计和最近）
      this.refresh()
    } catch (err) {
      util.showError('保存失败', err)
    }
  },

  // ----- 搜菜谱 -----
  onSearchInput(e) {
    const q = (e.detail.value || '').trim().toLowerCase()
    this.setData({ searchInput: e.detail.value })
    if (!q) {
      this.setData({ searchResults: [] })
      return
    }
    // 模糊匹配：菜名 / 食材 / 标签 含 query
    const all = app.globalData.dishes || []
    const seen = new Set()
    const matched = []
    for (const d of all) {
      const name = (d.name || '').toLowerCase()
      let hit = false
      if (name.includes(q)) hit = true
      else {
        const ings = (d.ingredients || []).map(i => i.toLowerCase())
        if (ings.some(i => i.includes(q))) hit = true
        else {
          const tags = (d.tags || []).map(t => t.toLowerCase())
          if (tags.some(t => t.includes(q))) hit = true
        }
      }
      if (hit && !seen.has(d.name)) {
        seen.add(d.name)
        matched.push(d)
        if (matched.length >= 30) break
      }
    }
    // 加 emoji/role/time 给 wxml 显示
    const ROLE_EMOJI = { '主菜': '🥢', '汤': '🥣', '主食': '🥯', '凉菜': '🥗', '早餐': '🍳' }
    const results = matched.map(d => ({
      name: d.name,
      role: d.role,
      time: d.time_minutes || '?',
      emoji: ROLE_EMOJI[d.role] || '🍽'
    }))
    this.setData({ searchResults: results })
  },

  // 点搜索结果 → 弹菜谱详情 modal
  onSearchDishTap(e) {
    const name = e.currentTarget.dataset.name
    if (!name) return
    const all = app.globalData.dishes || []
    const dish = all.find(d => d.name === name)
    if (!dish) {
      wx.showToast({ title: '没找到做法', icon: 'none' })
      return
    }
    const ingredients = dish.ingredients || []
    const seasonings = dish.seasonings || []
    this.setData({
      searchDetail: {
        name: dish.name,
        role: dish.role,
        time: dish.time_minutes || '?',
        emoji: { '主菜': '🥢', '汤': '🥣', '主食': '🥯', '凉菜': '🥗', '早餐': '🍳' }[dish.role] || '🍽',
        ingredients,
        seasonings,
        steps: dish.steps || [],
        tip: dish.tip || '',
        ingredientsStr: ingredients.join('、'),
        seasoningsStr: seasonings.join('、')
      }
    })
  },

  closeSearchDetail() {
    this.setData({ searchDetail: null })
  },

  // 搜菜谱详情里点「就做这个」→ 记录 + 关 modal
  async onSearchEat() {
    const d = this.data.searchDetail
    if (!d) return
    try {
      const today = new Date().toISOString().slice(0, 10)
      await cloud.addMeal({ dish: d.name, meal: '午餐', status: 'confirmed', date: today })
      wx.showToast({ title: `✓ ${d.name}`, icon: 'success', duration: 1500 })
      this.setData({
        searchDetail: null,
        recentPicks: Array.from(new Set([d.name, ...this.data.recentPicks])).slice(0, 50)
      })
    } catch (err) {
      util.showError('记录失败', err)
    }
  },

  // ----- 手动记录本（看历史 + 编辑 + 删除） -----
  async onOpenLogbook() {
    this.setData({ showLogbook: true, logbookLoading: true })
    try {
      const res = await cloud.getHistory(500)
      const history = (res && res.ok) ? res.history : []
      const MEAL_EMOJI = { '早餐': '☀️', '午餐': '🌞', '晚餐': '🌙' }
      const STATUS = { confirmed: '✅', manual: '手动', skipped: '⏭' }
      // 按日期分组
      const map = new Map()
      for (const h of history) {
        const d = h.date || '未知'
        if (!map.has(d)) map.set(d, [])
        map.get(d).push({
          ...h,
          statusLabel: STATUS[h.status] || h.status,
          mealEmoji: MEAL_EMOJI[h.meal] || '🍽'
        })
      }
      const groups = Array.from(map.entries())
        .map(([date, items]) => ({ date, items }))
        .sort((a, b) => b.date.localeCompare(a.date))
        .slice(0, 60)
      this.setData({ logbookGroups: groups, logbookLoading: false })
    } catch (err) {
      this.setData({ logbookLoading: false })
      util.showError('加载失败', err)
    }
  },

  closeLogbook() {
    this.setData({ showLogbook: false })
  },

  // 点单条 → 打开编辑
  onEditLogItem(e) {
    const id = e.currentTarget.dataset.id
    // 找到这条记录
    const all = this.data.logbookGroups.flatMap(g => g.items)
    const r = all.find(x => x._id === id)
    if (!r) return
    this.setData({
      showEditRecord: true,
      editForm: { _id: r._id, dish: r.dish, meal: r.meal || '午餐', date: r.date }
    })
  },

  // 整行 tap 也打开编辑（更顺手）
  onEditRecord(e) {
    const id = e.currentTarget.dataset.id
    const all = this.data.logbookGroups.flatMap(g => g.items)
    const r = all.find(x => x._id === id)
    if (!r) return
    this.setData({
      showEditRecord: true,
      editForm: { _id: r._id, dish: r.dish, meal: r.meal || '午餐', date: r.date }
    })
  },

  closeEditRecord() {
    if (this.data.editing) return
    this.setData({ showEditRecord: false })
  },

  onEditField(e) {
    const field = e.currentTarget.dataset.field
    this.setData({ [`editForm.${field}`]: e.detail.value })
  },

  onEditMeal(e) {
    const meal = e.currentTarget.dataset.meal
    this.setData({ 'editForm.meal': meal })
  },

  async onSaveEdit() {
    const f = this.data.editForm
    if (!f.dish || !f.dish.trim()) {
      wx.showToast({ title: '菜名不能空', icon: 'none' })
      return
    }
    this.setData({ editing: true })
    try {
      const res = await cloud.updateMeal(f._id, {
        dish: f.dish.trim(),
        meal: f.meal
      })
      if (res && res.ok) {
        wx.showToast({ title: '已保存', icon: 'success' })
        this.setData({ showEditRecord: false, editing: false })
        // 重新加载记录本
        this.onOpenLogbook()
      } else {
        util.showError('保存失败', new Error((res && res.error) || '未知错误'))
        this.setData({ editing: false })
      }
    } catch (err) {
      this.setData({ editing: false })
      util.showError('保存失败', err)
    }
  },

  // 删除某条
  onDeleteLogItem(e) {
    const id = e.currentTarget.dataset.id
    const that = this
    wx.showModal({
      title: '删除这条？',
      content: '删除后不可恢复',
      success: async (res) => {
        if (!res.confirm) return
        try {
          await cloud.deleteMeal(id)
          wx.showToast({ title: '已删除', icon: 'success' })
          that.onOpenLogbook()  // 重新加载
        } catch (err) {
          util.showError('删除失败', err)
        }
      }
    })
  },

  // ----- AI 顾问（聊天入口）-----
  // 跳转到 chat 页面，与 aiAdvisor 云函数的默认 mode（无 mode = 聊天）对接
  // 注意：之前 v2 PRD 写的是「AI 给点灵感」+ pickWithAI 选菜，但用户实际期望
  // 是聊天（不是 AI 选菜）。所以这个按钮直接跳 chat 页，不调云函数。
  onAiInspire() {
    wx.navigateTo({ url: '/pages/chat/chat' })
  },

  // ----- 关闭结果卡片 -----
  closePicked() {
    this.setData({ picked: null, pickedMeals: [], pickedHint: '', preferenceNote: '' })
  },

  // 拦截冒泡的空 handler（给 result-card 用）
  _noop() {},

  // ----- enrich：把菜名 → {name, role, time, emoji, ingredients, ...} -----
  async enrichDishes(names) {
    if (!names || names.length === 0) return []
    let dishes = app.globalData.dishes || []
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
          name, role: '主菜', time: '?', emoji: ROLE_EMOJI['主菜'],
          ingredients: [], seasonings: [], steps: [], tip: '',
          ingredientsStr: '', seasoningsStr: ''
        }
      }
      const ingredients = d.ingredients || []
      const seasonings = d.seasonings || []
      return {
        name: d.name,
        role: d.role || '主菜',
        time: d.time_minutes || '?',
        emoji: ROLE_EMOJI[d.role] || '🍽',
        ingredients,
        seasonings,
        steps: d.steps || [],
        tip: d.tip || '',
        ingredientsStr: ingredients.join('、'),
        seasoningsStr: seasonings.join('、')
      }
    })
  },

  // 点 › 展开/收起做法
  onToggleExpand(e) {
    const idx = Number(e.currentTarget.dataset.idx)
    const picked = this.data.picked
    if (!picked || isNaN(idx)) return
    const expanded = picked.expanded ? [...picked.expanded] : picked.dishes.map(() => false)
    expanded[idx] = !expanded[idx]
    this.setData({ picked: { ...picked, expanded } })
  },

  // 换一道：用新随机菜替换 idx 那道
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

    this._replaceDishAt(idx, newDish)
  },

  // 跳过：把 idx 这道从结果列表里临时去掉（不替换，从候选再抽一个补上）
  onSkip(e) {
    const idx = Number(e.currentTarget.dataset.idx)
    const { picked, customDishes, recentPicks } = this.data
    if (!picked || !picked.dishes || isNaN(idx)) return

    // 跳过 = 临时从结果列表移除，且加到 skippedPicks 让7 天内别再抽到
    const skippedName = picked.dishes[idx]
    const remaining = picked.dishes.filter((_, i) => i !== idx)
    if (remaining.length === 0) {
      // 全跳过了，关闭 modal
      this.closePicked()
      return
    }
    // 找一个新的补上
    const recentSet = new Set([...recentPicks, ...picked.dishes])
    const candidates = customDishes.filter(d => !recentSet.has(d))
    let newDishes = remaining
    let newReasons = picked.reasons ? picked.reasons.filter((_, i) => i !== idx) : null
    if (candidates.length > 0) {
      const newDish = candidates[Math.floor(Math.random() * candidates.length)]
      newDishes = [...remaining, newDish]
      if (newReasons) newReasons = [...newReasons, { dish: newDish, reason: '' }]
    }
    // 把跳过的加进 recentPicks 缓存（仅本次会话，7 天防重复）
    const newRecentPicks = [skippedName, ...this.data.recentPicks].slice(0, 50)
    this.setData({ recentPicks: newRecentPicks })
    this.setData({ picked: { ...picked, dishes: newDishes, reasons: newReasons } })
    this.enrichDishes(newDishes).then(infos => {
      const cur = this.data.picked
      if (cur && cur.dishes && cur.dishes.length === newDishes.length) {
        this.setData({ picked: { ...cur, dishInfos: infos } })
      }
    })
  },

  // 「别的」按钮：弹 modal 让用户输入菜名
  onCustomDish(e) {
    const idx = Number(e.currentTarget.dataset.idx)
    this.setData({
      showCustomDish: true,
      customInput: '',
      customCandidates: [],
      customFocus: true,
      customTargetIdx: idx
    })
  },

  closeCustomDish() {
    this.setData({ showCustomDish: false, customInput: '', customCandidates: [], customTargetIdx: -1 })
  },

  onCustomInput(e) {
    const value = e.detail.value || ''
    this.setData({ customInput: value })
    this._refreshCustomCandidates(value)
  },

  _refreshCustomCandidates(query) {
    const q = (query || '').trim().toLowerCase()
    const { customDishes } = this.data
    if (!q) {
      this.setData({ customCandidates: [] })
      return
    }
    // 模糊匹配：菜名包含 query，或 query 包含菜名首字
    const matches = customDishes.filter(d => {
      const dl = d.toLowerCase()
      return dl.includes(q) || q.includes(dl)
    }).slice(0, 8)
    this.setData({ customCandidates: matches })
  },

  // 点候选 → 替换当前那道菜
  onPickCandidate(e) {
    const name = e.currentTarget.dataset.name
    if (!name) return
    const idx = this.data.customTargetIdx
    if (idx < 0) return
    this._replaceDishAt(idx, name, /*closeModal*/ true)
  },

  // 点「添加到菜池 + 替换」
  async onCustomConfirm() {
    const name = (this.data.customInput || '').trim()
    if (!name) return
    const idx = this.data.customTargetIdx
    if (idx < 0) return
    // 如果菜池里没有 →加进去
    if (!this.data.customDishes.includes(name)) {
      try {
        await cloud.call('customDish', { action: 'add', items: [name] })
        this.setData({ customDishes: [...this.data.customDishes, name] })
      } catch (err) {
        util.showError('加菜失败', err)
        return
      }
    }
    this._replaceDishAt(idx, name, /*closeModal*/ true)
  },

  // 内部 helper：替换 idx 那道菜（含 enrich + 关 modal）
  async _replaceDishAt(idx, newDish, closeModal = false) {
    const picked = this.data.picked
    if (!picked || !picked.dishes || idx < 0 || idx >= picked.dishes.length) return
    const newDishes = picked.dishes.slice()
    newDishes[idx] = newDish
    // 先清掉 idx 的 info，等 enrich 完再设
    const newInfos = picked.dishInfos ? picked.dishInfos.slice() : []
    this.setData({
      picked: { ...picked, dishes: newDishes, dishInfos: newInfos },
      ...(closeModal ? { showCustomDish: false, customInput: '', customCandidates: [], customTargetIdx: -1 } : {})
    })
    if (picked.reasons) {
      const newReasons = picked.reasons.slice()
      if (newReasons[idx]) newReasons[idx] = { ...newReasons[idx], dish: newDish }
      this.setData({ picked: { ...this.data.picked, reasons: newReasons } })
    }
    // 异步 enrich 新菜 + 同步旧菜的 info（保 index 不乱）
    this.enrichDishes(newDishes).then(infos => {
      const cur = this.data.picked
      if (cur && cur.dishes && cur.dishes.length === newDishes.length) {
        this.setData({ picked: { ...cur, dishInfos: infos } })
      }
    })
  },

  // 内部 helper：把 picked.dishes 同步 enrich（用于换菜后）-----

  // ----- 「就做这个」一键记录 -----
  async onEat(e) {
    const dish = e.currentTarget.dataset.dish
    if (!dish) return
    // 多选模式：加入 pickedMeals，不关 modal，不立即 addMeal
    // 真正的 addMeal 在 finishEat 里统一执行（避免反复 toast）
    const pickedMeals = Array.from(new Set([...this.data.pickedMeals, dish]))
    this.setData({ pickedMeals })
    wx.showToast({ title: `✓ 已选 ${dish}`, icon: 'success', duration: 800 })
  },

  // 「✅ 就做这些」—— 一次性 addMeal 多道，关闭 modal
  async finishEat() {
    const { pickedMeals } = this.data
    if (pickedMeals.length === 0) {
      wx.showToast({ title: '还没选菜', icon: 'none' })
      return
    }
    const today = new Date().toISOString().slice(0, 10)
    let ok = 0, fail = 0
    for (const dish of pickedMeals) {
      try {
        await cloud.addMeal({ dish, meal: '午餐', status: 'confirmed', date: today })
        ok++
      } catch (e) {
        fail++
      }
    }
    if (fail === 0) {
      wx.showToast({ title: `✓ 记录 ${ok} 道`, icon: 'success', duration: 1500 })
    } else {
      wx.showToast({ title: `成功 ${ok} 失败 ${fail}`, icon: 'none', duration: 2500 })
    }
    // 更新 recentPicks + 关闭 modal
    const recentPicks = Array.from(new Set([...pickedMeals, ...this.data.recentPicks])).slice(0, 50)
    this.setData({ picked: null, pickedMeals: [], pickedHint: '', recentPicks })
  },

  // 「➕ 主菜/汤/主食/凉菜」—— 按 role 追加一道菜到结果列表
  addMoreDish(e) {
    const role = e.currentTarget.dataset.role
    if (!role) return
    const { customDishes, recentPicks, picked, pickedMeals } = this.data
    if (!picked || !picked.dishes) return
    // 候选 = 菜池里该 role 的菜 - 已吃/已选/已在 modal 里
    const dishesDB = app.globalData.dishes || []
    const recentSet = new Set([...recentPicks, ...pickedMeals, ...picked.dishes])
    const candidates = customDishes.filter(name => {
      const dish = dishesDB.find(d => d.name === name)
      return dish && dish.role === role && !recentSet.has(name)
    })
    if (candidates.length === 0) {
      wx.showToast({ title: `${role} 没菜可加`, icon: 'none' })
      return
    }
    // 启发式：菜名包含冰箱食材的优先
    const { fridgeItems } = this.data
    const fridgeKeys = fridgeItems.map(f => f.replace(/\s*\d+g?$/i, '').toLowerCase())
    const matched = candidates.filter(d => {
      const lc = d.toLowerCase()
      return fridgeKeys.some(k => lc.includes(k))
    })
    const pool = matched.length > 0 ? matched : candidates
    const newDish = pool[Math.floor(Math.random() * pool.length)]
    // 追加到 picked.dishes + expanded
    const newPicked = {
      ...picked,
      dishes: [...picked.dishes, newDish],
      expanded: [...picked.expanded, false],
      dishInfos: picked.dishInfos ? [...picked.dishInfos, null] : null,  // 后面 enrich
      reasons: picked.reasons ? [...picked.reasons, { dish: newDish, reason: '' }] : null,
    }
    this.setData({ picked: newPicked })
    // 重新 enrich（异步）
    this.enrichDishes(newPicked.dishes).then(infos => {
      const cur = this.data.picked
      if (cur && cur.dishes.length === newPicked.dishes.length) {
        this.setData({ picked: { ...cur, dishInfos: infos } })
      }
    })
    wx.showToast({ title: `+ ${role}: ${newDish}`, icon: 'success', duration: 1000 })
  },

  // ----- 折叠/展开 section -----
  onToggleSection(e) {
    const section = e.currentTarget.dataset.section
    if (!section) return
    this.setData({ [`expanded.${section}`]: !this.data.expanded[section] })
  },

  // ----- 一日三餐定制 -----
  async onPickMeals() {
    const { customDishes, recentPicks } = this.data
    if (customDishes.length === 0) {
      wx.showToast({ title: '菜池为空，先加几道', icon: 'none' })
      this.openOnboarding()
      return
    }
    const recentSet = new Set(recentPicks)
    const candidates = customDishes.filter(d => !recentSet.has(d))
    if (candidates.length < 3) {
      wx.showToast({ title: '7 天内都吃过了，加点新菜', icon: 'none' })
      return
    }
    const prefs = app.globalData.prefs || {}
    const customNote = (prefs.customNote || '').trim()

    this.setData({ showDayMeals: true, dayMealsLoading: true, dayMeals: null })
    try {
      const res = await cloud.call('aiAdvisor', {
        mode: 'pickMealsForDay',
        candidates,
        recentPicks,
        hint: customNote
      })
      if (res && res.ok && res.meals) {
        this.setData({ dayMeals: res.meals, dayMealNote: res.note || '', dayMealsLoading: false })
      } else {
        util.showError('AI 推荐失败', new Error((res && res.error) || '未知错误'))
        this.setData({ dayMealsLoading: false })
      }
    } catch (err) {
      this.setData({ dayMealsLoading: false })
      util.showError('AI 推荐失败', err)
    }
  },

  closeDayMeals() {
    this.setData({ showDayMeals: false, dayMeals: null, dayMealNote: '' })
  },

  // 换一餐里的某道菜（从菜池随机抽 1 道替换）
  onSwapDayMeal(e) {
    const slot = e.currentTarget.dataset.slot
    const idx = Number(e.currentTarget.dataset.idx)
    const meals = this.data.dayMeals
    if (!meals || !meals[slot]) return
    const inMeals = Object.values(meals).flat().map(m => m.dish)
    const pool = this.data.customDishes.filter(d => !inMeals.includes(d))
    if (pool.length === 0) {
      wx.showToast({ title: '没菜可换了', icon: 'none' })
      return
    }
    const newDish = pool[Math.floor(Math.random() * pool.length)]
    const newItems = meals[slot].slice()
    newItems[idx] = { dish: newDish, reason: '本地换菜' }
    this.setData({ [`dayMeals.${slot}`]: newItems })
  },

  // 全部就做这些：批量 addMeal
  async onAcceptAllDayMeals() {
    if (this.data.savingDayMeals) return
    const meals = this.data.dayMeals
    if (!meals) return
    const today = new Date().toISOString().slice(0, 10)
    const all = []
    for (const slot of ['早餐', '午餐', '晚餐']) {
      for (const item of (meals[slot] || [])) {
        if (item && item.dish) all.push({ meal: slot, dish: item.dish })
      }
    }
    if (all.length === 0) {
      wx.showToast({ title: '没有菜可记录', icon: 'none' })
      return
    }
    this.setData({ savingDayMeals: true })
    let ok = 0, fail = 0
    try {
      for (const { meal, dish } of all) {
        try {
          await cloud.addMeal({ dish, meal, status: 'confirmed', date: today })
          ok++
        } catch (e) {
          fail++
        }
      }
      if (fail === 0) {
        wx.showToast({ title: `已记录 ${ok} 条`, icon: 'success' })
      } else if (ok > 0) {
        wx.showToast({ title: `成功 ${ok}，失败 ${fail}`, icon: 'none' })
      } else {
        util.showError('记录失败', new Error('全部失败'))
      }
      this.setData({ showDayMeals: false, dayMeals: null, dayMealNote: '' })
      this.refresh()
    } catch (err) {
      util.showError('保存失败', err)
    } finally {
      this.setData({ savingDayMeals: false })
    }
  },

  // ----- 菜池：批量输入 + 保存 -----
  onPoolInputChange(e) {
    const id = Number(e.currentTarget.dataset.id)
    const value = e.detail.value || ''
    const inputs = this.data.poolInputs.map(inp =>
      inp.id === id ? { ...inp, value } : inp
    )
    this.setData({ poolInputs: inputs })
  },

  onAddPoolInput() {
    const inputs = [...this.data.poolInputs, { id: this.data.nextPoolId, value: '' }]
    this.setData({ poolInputs: inputs, nextPoolId: this.data.nextPoolId + 1 })
  },

  async onSavePool() {
    if (this.data.savingPool) return
    // 收集非空输入
    const newItems = this.data.poolInputs
      .map(i => (i.value || '').trim())
      .filter(Boolean)
    if (newItems.length === 0) {
      wx.showToast({ title: '请先输入菜名', icon: 'none' })
      return
    }
    // 合并去重
    const merged = Array.from(new Set([...this.data.customDishes, ...newItems]))
    this.setData({ savingPool: true })
    try {
      const res = await cloud.call('customDish', { action: 'replace', items: merged })
      if (res && res.ok) {
        this.setData({
          customDishes: merged,
          poolInputs: this.data.poolInputs.map(i => ({ ...i, value: '' })),
          savingPool: false
        })
        wx.showToast({ title: `已加 ${newItems.length} 道`, icon: 'success' })
      } else {
        this.setData({ savingPool: false })
        util.showError('保存失败', new Error((res && res.error) || '未知错误'))
      }
    } catch (err) {
      this.setData({ savingPool: false })
      util.showError('保存失败', err)
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
  },

  // ----- 计算本月统计（client 端跑，复用已拉的 history）-----
  _computeStats(history) {
    const now = new Date()
    const monthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
    const thisMonth = (history || []).filter(h =>
      h.status !== 'skipped' && h.date && h.date.startsWith(monthKey)
    )
    const totalMeals = thisMonth.length
    const days = new Set(thisMonth.map(h => h.date))
    const activeDays = days.size
    const avgPerDay = activeDays > 0 ? (totalMeals / activeDays).toFixed(1) : '0'

    const dishCount = {}
    for (const h of thisMonth) {
      dishCount[h.dish] = (dishCount[h.dish] || 0) + 1
    }
    const RANK_COLORS = ['#e85d04', '#ff9a3c', '#fbbf24', '#84cc16', '#3b82f6']
    const topDishes = Object.entries(dishCount)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([name, count], i) => ({
        rank: i + 1, name, count, color: RANK_COLORS[i] || '#999'
      }))

    const mealCount = { '早餐': 0, '午餐': 0, '晚餐': 0 }
    for (const h of thisMonth) {
      const m = h.meal || '午餐'
      if (mealCount[m] !== undefined) mealCount[m]++
    }
    const MEAL_COLORS = { '早餐': '#fbbf24', '午餐': '#ff9a3c', '晚餐': '#8b5cf6' }
    const maxMeal = Math.max(mealCount['早餐'], mealCount['午餐'], mealCount['晚餐'], 1)
    const mealDist = ['早餐', '午餐', '晚餐'].map(meal => {
      const c = mealCount[meal]
      return {
        meal, count: c,
        fill: c > 0 ? Math.round(c / maxMeal * 100) : 0,
        color: MEAL_COLORS[meal]
      }
    })

    return { totalMeals, activeDays, avgPerDay, topDishes, mealDist }
  },

  // ----- 顶部 4 按钮 handlers -----
  onScrollToStats() {
    // 统计 section 默认折叠 → 点 📊 时自动展开 + 滚到
    if (!this.data.expanded.stats) {
      this.setData({ 'expanded.stats': true })
    }
    setTimeout(() => {
      wx.pageScrollTo({ selector: '#stats-section', duration: 300 })
    }, 50)
  },

  onOpenSettings() {
    wx.navigateTo({ url: '/pages/profile/profile' })
  }
})

// ===== 转发给朋友 =====
Page.onShareAppMessage = function () {
  return {
    title: '今天吃什么 — 饭点选菜助手',
    path: '/pages/home/home'
  }
}

// ===== 分享到朋友圈 =====
Page.onShareTimeline = function () {
  return {
    title: '今天吃什么 — 饭点选菜助手'
  }
}
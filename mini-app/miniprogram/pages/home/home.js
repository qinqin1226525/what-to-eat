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
    fridgeItems: [],
    fridgeInput: '',
    savingFridge: false,
    customDishes: [],
    recentPicks: [],     // 最近7天已抽
    loading: true,
    picked: null,        // {dishes, dishInfos, reasons, source}
    pickedMeals: [],   // 用户在 modal 里「选这道」的菜名列表，多次 addMeal 用
    picking: false,
    pickedHint: '',     // 结果 modal 的提示文字（如「冰箱没匹配到菜池」）
    // onboarding
    showOnboarding: false,
    onboardingDishes: [],
    // 「别的」modal
    showCustomDish: false,
    customInput: '',
    customCandidates: [],
    customFocus: false,
    customTargetIdx: -1,
    // 手动记录 modal（按饮食报告风格）
    showManualLog: false,
    manualForm: { date: '', breakfast: '', lunch: '', dinner: '' },
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
    this.enrichDishes(dishes).then(infos => {
      const cur = this.data.picked
      if (cur && cur.dishes && cur.dishes.length === dishes.length) {
        this.setData({ picked: { ...cur, dishInfos: infos } })
      }
    })
  },

  // ----- 冰箱有什么 → 做啥菜 -----
  async onFridgeRecommend() {
    if (this.data.picking) return
    const { customDishes, recentPicks, fridgeItems } = this.data
    if (customDishes.length === 0) {
      wx.showToast({ title: '菜池为空，先加几道', icon: 'none' })
      this.openOnboarding()
      return
    }
    if (fridgeItems.length === 0) {
      wx.showToast({ title: '冰箱是空的，去加点食材', icon: 'none' })
      return
    }

    // 从 125 道菜里找：食材里有冰箱关键字的
    let allDishes = app.globalData.dishes || []
    if (allDishes.length === 0) {
      try {
        const res = await cloud.getDishes()
        allDishes = (res && res.ok && res.dishes) || []
        app.globalData.dishes = allDishes
      } catch (e) {
        allDishes = []
      }
    }

    // 冰箱食材 key（小写、去掉 500g 之类的数字）
    const fridgeKeys = fridgeItems.map(f =>
      f.replace(/\s*\d+g?$/i, '').toLowerCase()
    ).filter(Boolean)

    // 匹配：菜名含冰箱 key，或 ingredients 含冰箱 key
    const matched = allDishes.filter(d => {
      const name = (d.name || '').toLowerCase()
      if (fridgeKeys.some(k => name.includes(k))) return true
      const ings = (d.ingredients || []).map(i => i.toLowerCase())
      return ings.some(ing => fridgeKeys.some(k => ing.includes(k)))
    })

    // 只保留菜池里的
    const customSet = new Set(customDishes)
    let candidates = matched.filter(d => customSet.has(d.name))

    // 没匹配 → 兜底用菜池全部
    let fallback = false
    if (candidates.length === 0) {
      candidates = customDishes.slice()
      fallback = true
    }

    // 去重最近 7 天
    const recentSet = new Set(recentPicks)
    let pool = candidates.filter(d => !recentSet.has(d))
    if (pool.length === 0) pool = candidates.slice()

    // 洗牌取前 3
    const shuffled = pool.slice().sort(() => Math.random() - 0.5)
    const dishes = shuffled.slice(0, Math.min(3, shuffled.length))
    const expanded = dishes.map(() => false)

    this.setData({
      picked: { dishes, source: 'fridge', expanded },
      pickedHint: fallback ? '冰箱食材没匹配到菜池里的菜，从菜池随机选' : null
    })
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

  // ----- 冰箱管理 -----
  onFridgeInput(e) {
    this.setData({ fridgeInput: e.detail.value })
  },

  async onFridgeAdd() {
    const raw = (this.data.fridgeInput || '').trim()
    if (!raw) {
      wx.showToast({ title: '请输入食材', icon: 'none' })
      return
    }
    const tokens = raw.split(/[,，\s]+/).map(s => s.trim()).filter(Boolean)
    if (tokens.length === 0) {
      wx.showToast({ title: '请输入食材', icon: 'none' })
      return
    }
    const items = Array.from(new Set([...this.data.fridgeItems, ...tokens]))
    this.setData({ savingFridge: true })
    try {
      await cloud.updateFridge(items)
      this.setData({ fridgeItems: items, fridgeInput: '', savingFridge: false })
      wx.showToast({ title: `已加 ${tokens.length} 项`, icon: 'success' })
    } catch (err) {
      this.setData({ savingFridge: false })
      util.showError('保存失败', err)
    }
  },

  async onFridgeRemove(e) {
    const name = e.currentTarget.dataset.name
    if (!name) return
    const items = this.data.fridgeItems.filter(x => x !== name)
    this.setData({ savingFridge: true })
    try {
      await cloud.updateFridge(items)
      this.setData({ fridgeItems: items, savingFridge: false })
    } catch (err) {
      this.setData({ savingFridge: false })
      util.showError('删除失败', err)
    }
  },

  onFridgeClear() {
    const that = this
    wx.showModal({
      title: '清空冰箱？',
      success: async (res) => {
        if (!res.confirm) return
        try {
          await cloud.updateFridge([])
          that.setData({ fridgeItems: [] })
        } catch (err) {
          util.showError('操作失败', err)
        }
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
    this.setData({ picked: null, pickedMeals: [], pickedHint: '' })
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
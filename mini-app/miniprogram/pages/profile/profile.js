// pages/profile/profile.js
const app = getApp()
const cloud = require('../../utils/cloud.js')
const algo = require('../../utils/algorithm.js')
const util = require('../../utils/util.js')

const DEFAULT_PREFS = algo.DEFAULT_PREFS
const DEFAULT_PROFILE = algo.DEFAULT_PROFILE

const CUISINE_OPTIONS = ['川菜', '粤菜', '湘菜', '鲁菜', '江浙', '西北']

Page({
  data: {
    prefs: { ...DEFAULT_PREFS },
    profile: { ...DEFAULT_PROFILE },
    targets: { calories: 0, protein: 0, carbs: 0, fat: 0, sodium: 0, bmr: 0, tdee: 0 },
    profileComplete: false,
    saving: false,
    openid: '',
    openidDisplay: '加载中…',
    dishCount: 0,
    seedStatus: '',    // '' | 'seeding' | 'ok' | 'fail'
    seedButtonText: '重新上传菜谱到云端',
    cuisineOptions: CUISINE_OPTIONS,
    activityLabels: algo.ACTIVITY_LABELS,
    goalLabels: algo.GOAL_LABELS,
    conditionLabels: algo.CONDITION_LABELS,
    allergyLabels: algo.ALLERGY_LABELS,
    // 添加新菜弹窗
    showAddDish: false,
    addingDish: false,
    smartFilling: false,
    smartFilled: false,
    newDish: { name: '', time_minutes: 15, role: '0', tags: [], ingredients: '', seasonings: '', steps: '', tips: '' },
    // AI 配额
    aiRemaining: 10,
    aiLimit: 10
  },

  onShow() {
    this.refreshFromCloud()
    this.refreshAIRemaining()
  },

  // 读今日 AI 剩余次数（不消耗配额）
  async refreshAIRemaining() {
    try {
      const openid = app.globalData.openid
      if (!openid) return
      const today = new Date().toISOString().slice(0, 10)
      const db = wx.cloud.database()
      const r = await db.collection('ai_counters').where({ _openid: openid }).limit(1).get()
      let used = 0
      if (r.data && r.data.length > 0 && r.data[0].date === today) {
        used = r.data[0].count || 0
      }
      this.setData({
        aiRemaining: Math.max(0, 10 - used),
        aiLimit: 10
      })
    } catch (e) {
      // 集合还没建（没调用过 AI）→ 用默认值
      this.setData({ aiRemaining: 10, aiLimit: 10 })
    }
  },

  async refreshFromCloud() {
    const that = this
    try {
      const res = await cloud.getPrefs()
      if (res && res.ok) {
        const prefs = { ...DEFAULT_PREFS, ...(res.prefs || {}) }
        prefs.avoid = { ...DEFAULT_PREFS.avoid, ...(prefs.avoid || {}) }
        const profile = { ...DEFAULT_PROFILE, ...(res.profile || {}) }
        // 确保嵌套数组
        profile.conditions = profile.conditions || []
        profile.allergies = profile.allergies || []
        const targets = algo.calculateTargets(profile)
        that.setData({
          prefs,
          profile,
          targets,
          profileComplete: !!(profile.sex && profile.age && profile.height && profile.weight && profile.activity && profile.goal),
          openid: app.globalData.openid || '',
          openidDisplay: app.globalData.openid || '加载中…',
          dishCount: (app.globalData.dishes || []).length
        })
      }
    } catch (err) {
      console.warn('拉偏好失败', err)
    }
  },

  // ----- 健康档案 -----
  onProfileInput(e) {
    const field = e.currentTarget.dataset.field
    const val = Number(e.detail.value) || 0
    this.setData({ [`profile.${field}`]: val })
    this.recalcTargets()
  },

  onProfileRadio(e) {
    const field = e.currentTarget.dataset.field
    const val = e.currentTarget.dataset.value
    this.setData({ [`profile.${field}`]: val })
    this.recalcTargets()
  },

  onProfileMulti(e) {
    const field = e.currentTarget.dataset.field   // 'conditions' | 'allergies'
    const val = e.currentTarget.dataset.value
    const arr = this.data.profile[field] || []
    const idx = arr.indexOf(val)
    if (idx >= 0) arr.splice(idx, 1)
    else arr.push(val)
    this.setData({ [`profile.${field}`]: arr })
    this.recalcTargets()
  },

  recalcTargets() {
    const targets = algo.calculateTargets(this.data.profile)
    const profileComplete = !!(this.data.profile.sex && this.data.profile.age && this.data.profile.height && this.data.profile.weight && this.data.profile.activity && this.data.profile.goal)
    this.setData({ targets, profileComplete })
  },

  // ----- toggle 偏好项 -----
  onToggleCuisine(e) {
    const c = e.currentTarget.dataset.cuisine
    const cuisines = this.data.prefs.cuisines || []
    const idx = cuisines.indexOf(c)
    if (idx >= 0) cuisines.splice(idx, 1)
    else cuisines.push(c)
    this.setData({ 'prefs.cuisines': cuisines })
  },

  onSpicy(e) {
    this.setData({ 'prefs.spicy': e.currentTarget.dataset.spicy })
  },

  onToggle(e) {
    const key = e.currentTarget.dataset.key
    this.setData({ [`prefs.${key}`]: !this.data.prefs[key] })
  },

  onToggleAvoid(e) {
    const key = e.currentTarget.dataset.key
    const avoid = this.data.prefs.avoid || {}
    avoid[key] = !avoid[key]
    this.setData({ 'prefs.avoid': avoid })
  },

  onMealPattern(e) {
    const value = e.currentTarget.dataset.value
    console.log('[onMealPattern] click value =', value)
    this.setData({ 'prefs.mealPattern': value })
    console.log('[onMealPattern] after setData, prefs =', this.data.prefs)
    // 立即同步到全局（让 index 页能立刻用），不需等「保存偏好」
    if (app.globalData) app.globalData.prefs = this.data.prefs
    // 后台静默保存（不弹 toast）
    cloud.savePrefs({ prefs: this.data.prefs, profile: app.globalData.profile || {} }).then(res => {
      console.log('[onMealPattern] 后台保存成功', res)
    }).catch(err => {
      console.warn('[onMealPattern] 背景保存失败:', err)
    })
  },

  onMaxTime(e) {
    this.setData({ 'prefs.maxTime': Number(e.currentTarget.dataset.value) || 0 })
  },

  onComboSize(e) {
    this.setData({ 'prefs.comboSize': e.currentTarget.dataset.value })
  },

  async onSave() {
    this.setData({ saving: true })
    try {
      await cloud.savePrefs({ prefs: this.data.prefs, profile: this.data.profile })
      app.globalData.prefs = this.data.prefs
      app.globalData.profile = this.data.profile
      app.globalData.targets = this.data.targets
      wx.showToast({ title: '已保存 ✓', icon: 'success' })
      this.setData({ saving: false })
    } catch (err) {
      this.setData({ saving: false })
      util.showError('保存失败', err)
    }
  },

  async onSeed() {
    this.setData({ seedStatus: 'seeding', seedButtonText: '上传中…' })
    try {
      const res = await cloud.seedDishes()
      if (res && res.ok) {
        const count = res.count || (app.globalData.dishes || []).length
        if (res.skipped) {
          // 已是最新
          wx.showToast({ title: '云端已是最新', icon: 'success' })
          this.setData({ seedStatus: 'ok', dishCount: count, seedButtonText: '已是最新' })
        } else {
          wx.showToast({ title: `已上传 ${count} 道菜`, icon: 'success' })
          this.setData({ seedStatus: 'ok', dishCount: count, seedButtonText: '已上传完成' })
          app.globalData.dishes = []
          app.loadDishes()
        }
      } else {
        const msg = (res && (res.error || res.msg)) || JSON.stringify(res).slice(0, 60) || '未知错误'
        console.error('seed 失败 res:', res)
        wx.showToast({ title: '失败：' + msg, icon: 'none', duration: 3000 })
        this.setData({ seedStatus: 'fail', seedButtonText: '上传失败，重试' })
      }
    } catch (err) {
      console.error('seed 失败', err)
      util.showError('上传失败', err)
      this.setData({ seedStatus: 'fail', seedButtonText: '上传失败，重试' })
    }
  },

  // ------- 添加新菜 -------
  openAddDish() {
    this.setData({
      showAddDish: true,
      smartFilled: false,
      newDish: { name: '', time_minutes: 15, role: '0', tags: [], ingredients: '', seasonings: '', steps: '', tips: '' }
    })
  },

  // AI 自动填充食材/做法/调料
  async onSmartFill() {
    const name = (this.data.newDish.name || '').trim()
    if (!name) {
      wx.showToast({ title: '先输菜名', icon: 'none' })
      return
    }
    this.setData({ smartFilling: true })
    try {
      const res = await cloud.smartAddDish(name)
      if (res && res.ok && res.dish) {
        const d = res.dish
        // 把 role（中文）映射回 index 存到 data
        const roleMap = { '主菜': '0', '主食': '1', '汤': '2', '早餐': '3', '凉菜': '4' }
        const roleIndex = roleMap[d.role] || '0'
        this.setData({
          'newDish.time_minutes': d.time_minutes,
          'newDish.role': roleIndex,
          'newDish.ingredients': (d.ingredients || []).join('，'),
          'newDish.seasonings': (d.seasonings || []).join('，'),
          'newDish.steps': (d.steps || []).map((s, i) => `${i + 1}. ${s}`).join('\n'),
          'newDish.tips': d.tip || '',
          smartFilled: true
        })
        wx.showToast({ title: 'AI 已填充', icon: 'success' })
      } else {
        util.showError('AI 填充失败', new Error((res && res.error) || '未知错误'))
      }
    } catch (err) {
      util.showError('AI 填充失败', err)
    } finally {
      this.setData({ smartFilling: false })
    }
  },

  closeAddDish() {
    if (this.data.addingDish) return
    this.setData({ showAddDish: false })
  },

  onNewDishField(e) {
    const field = e.currentTarget.dataset.field
    this.setData({ [`newDish.${field}`]: e.detail.value })
  },

  onNewDishRole(e) {
    this.setData({ 'newDish.role': e.currentTarget.dataset.value })
  },

  // 阻止冒泡到 mask（防止点内部内容时关掉弹窗）
  onNoop() {},

  async submitNewDish() {
    const d = this.data.newDish
    if (!d.name || !d.name.trim()) {
      wx.showToast({ title: '请输入菜名', icon: 'none' })
      return
    }
    const ingredients = (d.ingredients || '').split(/[，,]/).map(s => s.trim()).filter(Boolean)
    if (ingredients.length === 0) {
      wx.showToast({ title: '请输入至少 1 个食材', icon: 'none' })
      return
    }

    this.setData({ addingDish: true })
    try {
      const seasonings = (d.seasonings || '').split(/[，,]/).map(s => s.trim()).filter(Boolean)
      const steps = (d.steps || '').split('\n').map(s => s.replace(/^\s*\d+[\.\、]\s*/, '').trim()).filter(Boolean)
      const res = await cloud.addDish({
        name: d.name.trim(),
        time_minutes: Number(d.time_minutes) || 15,
        role: ['主菜', '主食', '汤', '早餐', '凉菜'][Number(d.role)] || '主菜',
        tags: d.tags || [],
        ingredients: ingredients,
        seasonings: seasonings,
        steps: steps,
        tip: (d.tips || '').trim()
      })
      if (res && res.ok) {
        wx.showToast({ title: res.msg, icon: 'success' })
        this.setData({ showAddDish: false, addingDish: false })
        // 刷新 dishes 缓存
        app.globalData.dishes = []
        app.loadDishes()
        // 更新顶部菜数
        this.setData({ dishCount: (app.globalData.dishes || []).length + 1 })
      } else {
        util.showError('添加失败', new Error((res && res.error) || '未知错误'))
        this.setData({ addingDish: false })
      }
    } catch (err) {
      util.showError('添加失败', err)
      this.setData({ addingDish: false })
    }
  }
})
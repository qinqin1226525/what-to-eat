// pages/history/history.js —— 清单页（冰箱 + 手动记录 + 历史记录）
const cloud = require('../../utils/cloud.js')
const util = require('../../utils/util.js')

const STATUS_LABEL = {
  confirmed: '✅ 吃了',
  manual: '📝 手动',
  skipped: '⏭ 跳过'
}

Page({
  data: {
    // 历史
    grouped: [],
    loading: true,
    // 手动记录 modal
    showManualLog: false,
    manualForm: { date: '', breakfast: '', lunch: '', dinner: '' },
    savingManual: false,
    // 冰箱
    fridgeItems: [],
    fridgeInput: '',
    savingFridge: false
  },

  onShow() {
    this.loadFridge()
    this.loadHistory()
    // 首页「手动记录」入口跳过来时，自动开 modal
    const app = getApp()
    if (app.globalData.__openManualOnHistory) {
      app.globalData.__openManualOnHistory = false
      setTimeout(() => this.openManual(), 100)
    }
  },

  // ----- 冰箱 -----
  async loadFridge() {
    try {
      const res = await cloud.getFridge()
      this.setData({ fridgeItems: (res && res.ok) ? res.items : [] })
    } catch (err) {
      console.warn('拉冰箱失败', err)
    }
  },

  onFridgeInput(e) {
    this.setData({ fridgeInput: e.detail.value })
  },

  async onFridgeAdd() {
    const raw = this.data.fridgeInput.trim()
    if (!raw) {
      wx.showToast({ title: '请输入食材', icon: 'none' })
      return
    }
    const tokens = raw.split(/[,，\s]+/).map(s => s.trim()).filter(Boolean)
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

  // ----- 历史 -----
  async loadHistory() {
    this.setData({ loading: true })
    try {
      const res = await cloud.getHistory(500)
      const history = (res && res.ok) ? res.history : []
      const map = new Map()
      for (const h of history) {
        const date = h.date || '未知'
        if (!map.has(date)) map.set(date, [])
        map.get(date).push({ ...h, statusLabel: STATUS_LABEL[h.status] || h.status })
      }
      const grouped = Array.from(map.entries())
        .map(([date, items]) => ({ date, items }))
        .sort((a, b) => b.date.localeCompare(a.date))
        .slice(0, 60)
      this.setData({ grouped, loading: false })
    } catch (err) {
      console.warn('拉历史失败', err)
      this.setData({ loading: false })
    }
  },

  onOpenSettings() {
    wx.navigateTo({ url: '/pages/profile/profile' })
  },

  async onDelete(e) {
    const id = e.currentTarget.dataset.id
    if (!id) return
    const that = this
    wx.showModal({
      title: '删除这条？',
      content: '删除后不可恢复',
      success: async (res) => {
        if (!res.confirm) return
        try {
          await cloud.deleteMeal(id)
          wx.showToast({ title: '已删除', icon: 'success' })
          that.loadHistory()
        } catch (err) {
          util.showError('删除失败', err)
        }
      }
    })
  },

  // ----- 手动记录 -----
  openManual() {
    this.setData({
      showManualLog: true,
      manualForm: { date: util.todayISO(), breakfast: '', lunch: '', dinner: '' }
    })
  },

  closeManual() {
    if (this.data.savingManual) return
    this.setData({ showManualLog: false })
  },

  onManualField(e) {
    const field = e.currentTarget.dataset.field
    this.setData({ [`manualForm.${field}`]: e.detail.value })
  },

  parseMealInput(str) {
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
      { meal: '早餐', dishes: this.parseMealInput(f.breakfast) },
      { meal: '午餐', dishes: this.parseMealInput(f.lunch) },
      { meal: '晚餐', dishes: this.parseMealInput(f.dinner) }
    ]
    const all = meals.flatMap(m => m.dishes.map(d => ({ meal: m.meal, dish: d })))
    if (all.length === 0) {
      wx.showToast({ title: '没有可保存的菜', icon: 'none' })
      return
    }

    this.setData({ savingManual: true })
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
      this.setData({ showManualLog: false, savingManual: false })
      this.loadHistory()
    } catch (err) {
      this.setData({ savingManual: false })
      util.showError('保存失败', err)
    }
  }
})
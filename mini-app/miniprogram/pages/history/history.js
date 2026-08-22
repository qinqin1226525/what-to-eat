// pages/history/history.js
const cloud = require('../../utils/cloud.js')
const util = require('../../utils/util.js')

const STATUS_LABEL = {
  confirmed: '✅ 吃了',
  manual: '📝 手动',
  skipped: '⏭ 跳过'
}

Page({
  data: {
    grouped: [],          // [{date, items: [...]}, ...]
    loading: true,
    // 手动记录 modal
    showManualLog: false,
    manualForm: { date: '', breakfast: '', lunch: '', dinner: '' },
    savingManual: false
  },

  onShow() {
    this.loadHistory()
  },

  async loadHistory() {
    this.setData({ loading: true })
    try {
      const res = await cloud.getHistory(500)
      const history = (res && res.ok) ? res.history : []
      // 按日期分组
      const map = new Map()
      for (const h of history) {
        const date = h.date || '未知'
        if (!map.has(date)) map.set(date, [])
        map.get(date).push({ ...h, statusLabel: STATUS_LABEL[h.status] || h.status })
      }
      const grouped = Array.from(map.entries())
        .map(([date, items]) => ({ date, items }))
        .sort((a, b) => b.date.localeCompare(a.date))
        .slice(0, 60)   // 最近 60 天
      this.setData({ grouped, loading: false })
    } catch (err) {
      console.warn('拉历史失败', err)
      this.setData({ loading: false })
    }
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
    // 三餐都空就不保存
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
      // 串行调用，避免触发云函数并发限制
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
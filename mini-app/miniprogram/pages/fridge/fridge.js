// pages/fridge/fridge.js
const cloud = require('../../utils/cloud.js')
const util = require('../../utils/util.js')

Page({
  data: {
    items: [],
    inputValue: '',
    loading: true,
    saving: false
  },

  onShow() {
    this.loadFridge()
  },

  async loadFridge() {
    this.setData({ loading: true })
    try {
      const res = await cloud.getFridge()
      this.setData({ items: (res && res.ok) ? res.items : [], loading: false })
    } catch (err) {
      console.warn('拉冰箱失败', err)
      this.setData({ loading: false })
    }
  },

  onInput(e) {
    this.setData({ inputValue: e.detail.value })
  },

  async onAdd() {
    const raw = this.data.inputValue.trim()
    if (!raw) {
      wx.showToast({ title: '请输入食材', icon: 'none' })
      return
    }
    const tokens = raw.split(/[,，\s]+/).map(s => s.trim()).filter(Boolean)
    const items = Array.from(new Set([...this.data.items, ...tokens]))
    this.setData({ saving: true })
    try {
      await cloud.updateFridge(items)
      this.setData({ items, inputValue: '', saving: false })
      wx.showToast({ title: `已加 ${tokens.length} 项`, icon: 'success' })
    } catch (err) {
      this.setData({ saving: false })
      util.showError('保存失败', err)
    }
  },

  async onRemove(e) {
    const name = e.currentTarget.dataset.name
    const items = this.data.items.filter(x => x !== name)
    this.setData({ saving: true })
    try {
      await cloud.updateFridge(items)
      this.setData({ items, saving: false })
    } catch (err) {
      this.setData({ saving: false })
      util.showError('删除失败', err)
    }
  },

  async onClear() {
    const that = this
    wx.showModal({
      title: '清空冰箱？',
      success: async (res) => {
        if (!res.confirm) return
        try {
          await cloud.updateFridge([])
          that.setData({ items: [] })
        } catch (err) {
          util.showError('操作失败', err)
        }
      }
    })
  }
})
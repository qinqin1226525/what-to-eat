// utils/cloud.js —— 云函数调用封装
// 用法：const cloud = require('./cloud.js'); cloud.call('addMeal', { ... }).then(...)

function call(name, data) {
  return wx.cloud.callFunction({ name, data: data || {} })
    .then(res => {
      if (res.result && res.result.error) {
        throw new Error(res.result.error)
      }
      return res.result
    })
}

// 便捷封装
const api = {
  // 菜谱
  getDishes: () => call('getDishes'),
  addDish: (dish) => call('addDish', dish),
  smartAddDish: (name) => call('smartAddDish', { name }),
  seedDishes: () => call('seedDishes'),

  // AI 顾问
  aiAdvisor: (payload) => call('aiAdvisor', payload),

  // 餐食
  addMeal: (payload) => call('addMeal', payload),
  getHistory: (limit) => call('getHistory', { limit: limit || 100 }),
  deleteMeal: (id) => call('deleteMeal', { id }),

  // 冰箱
  updateFridge: (items) => call('updateFridge', { items }),
  getFridge: () => call('getFridge'),

  // 偏好
  savePrefs: (payload) => call('savePrefs', payload),
  getPrefs: () => call('getPrefs')
}

module.exports = api
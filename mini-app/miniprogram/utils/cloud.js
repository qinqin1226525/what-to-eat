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
  // 通用调用（兜底，没专门封装时用这个）
  call,
  // 菜谱
  getDishes: () => call('getDishes'),
  addDish: (dish) => call('addDish', dish),
  seedDishes: () => call('seedDishes'),

  // 餐食
  addMeal: (payload) => call('addMeal', payload),
  getHistory: (limit) => call('getHistory', { limit: limit || 100 }),
  deleteMeal: (id) => call('deleteMeal', { id }),
  clearMeals: () => call('clearMeals'),
  updateMeal: (id, payload) => call('updateMeal', { _id: id, ...payload }),

  // 冰箱
  updateFridge: (items) => call('updateFridge', { items }),
  getFridge: () => call('getFridge'),

  // 偏好
  savePrefs: (payload) => call('savePrefs', payload),
  getPrefs: () => call('getPrefs'),

  // 我的菜池（用户私有，按 _openid 隔离）
  customDish: (action, payload = {}) => call('customDish', { action, ...payload })
}

module.exports = api
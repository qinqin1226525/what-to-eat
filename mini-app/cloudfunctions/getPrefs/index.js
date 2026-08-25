// 云函数：getPrefs —— 拉当前用户偏好 + 评分 + 健康档案
const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()
const COL = 'user_prefs'

exports.main = async () => {
  try {
    const res = await db.collection(COL).limit(1).get()
    if (res.data && res.data[0]) {
      return {
        ok: true,
        prefs: res.data[0].prefs || {},
        scores: res.data[0].scores || {},
        profile: res.data[0].profile || {}
      }
    }
    return { ok: true, prefs: {}, scores: {}, profile: {} }
  } catch (err) {
    return { ok: true, prefs: {}, scores: {}, profile: {}, warning: err.message }
  }
}
// 云函数：clearMeals —— 清空当前用户所有历史记录
const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()
const COL = 'meals'

exports.main = async () => {
  const { OPENID } = cloud.getWXContext()
  if (!OPENID) {
    return { ok: false, error: '无法识别用户' }
  }
  try {
    const res = await db.collection(COL).where({ _openid: OPENID }).remove()
    return { ok: true, deleted: res.deleted || 0 }
  } catch (err) {
    return { ok: false, error: err.message || String(err) }
  }
}
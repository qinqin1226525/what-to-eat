// 云函数：getDishes —— 拉取云端 dishes 集合
const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()
const COL = 'dishes'
const MAX = 1000   // 单次拉取上限

exports.main = async () => {
  try {
    const res = await db.collection(COL).limit(MAX).get()
    return { ok: true, dishes: res.data || [] }
  } catch (err) {
    // 集合不存在等情况，返回空数组
    return { ok: true, dishes: [], warning: err.message }
  }
}
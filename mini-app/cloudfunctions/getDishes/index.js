// 云函数：getDishes —— 拉取云端 dishes 集合
const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()
const COL = 'dishes'
const MAX = 1000   // 单次拉取上限

exports.main = async () => {
  try {
    const res = await db.collection(COL).limit(MAX).get()
    const raw = res.data || []
    // 按 name 去重（保留第一条），避免历史 seed 重复导致 wx:key 冲突
    const seen = new Set()
    const dishes = []
    for (const d of raw) {
      if (!d || !d.name || seen.has(d.name)) continue
      seen.add(d.name)
      dishes.push(d)
    }
    return { ok: true, dishes, count: dishes.length }
  } catch (err) {
    // 集合不存在等情况，返回空数组
    return { ok: true, dishes: [], warning: err.message }
  }
}
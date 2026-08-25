// 云函数：getHistory —— 拉当前用户的全部 meal 记录
// 入参：{ limit? } 默认 500
const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()
const COL = 'meals'

exports.main = async (event) => {
  const limit = Math.min(Number(event.limit) || 500, 1000)
  try {
    // 不指定 _openid 过滤，靠数据库安全规则：每个用户只能看到自己的
    const res = await db.collection(COL)
      .orderBy('createdAt', 'desc')
      .limit(limit)
      .get()
    return { ok: true, history: res.data || [] }
  } catch (err) {
    // 集合不存在等情况
    return { ok: true, history: [], warning: err.message }
  }
}
// 云函数：updateFridge —— 替换当前用户的冰箱食材列表（覆盖写）
// 入参：{ items: ['鸡蛋', '西红柿', ...] }
// 数据模型：每个用户一条文档，_id = openid
const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()
const COL = 'user_fridges'

exports.main = async (event) => {
  const wxContext = cloud.getWXContext()
  const openid = wxContext.OPENID
  const items = Array.isArray(event.items) ? event.items.filter(x => typeof x === 'string' && x.trim()) : []

  // 去重
  const unique = Array.from(new Set(items.map(s => s.trim()).filter(Boolean)))

  // 确保集合存在
  try { await db.createCollection(COL) } catch (e) { /* 已存在 */ }

  try {
    const exist = await db.collection(COL).where({ _openid: openid }).get()
    if (exist.data && exist.data.length > 0) {
      const id = exist.data[0]._id
      await db.collection(COL).doc(id).update({
        data: { items: unique, updatedAt: Date.now() }
      })
      return { ok: true, items: unique }
    } else {
      await db.collection(COL).add({
        data: { items: unique, createdAt: Date.now(), updatedAt: Date.now() }
      })
      return { ok: true, items: unique }
    }
  } catch (err) {
    return { ok: false, error: err.message }
  }
}
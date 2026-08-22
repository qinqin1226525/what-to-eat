// 云函数：savePrefs —— 保存当前用户偏好 + 评分
// 入参：{ prefs: {...}, scores?: {...} }
const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()
const COL = 'user_prefs'

exports.main = async (event) => {
  const wxContext = cloud.getWXContext()
  const openid = wxContext.OPENID
  const prefs = event.prefs || {}
  const scores = event.scores || {}
  const profile = event.profile || {}

  // 确保集合存在
  try { await db.createCollection(COL) } catch (e) { /* 已存在 */ }

  try {
    const exist = await db.collection(COL).where({ _openid: openid }).get()
    const data = {
      prefs,
      scores,
      profile,
      updatedAt: Date.now()
    }
    if (exist.data && exist.data.length > 0) {
      await db.collection(COL).doc(exist.data[0]._id).update({ data })
    } else {
      await db.collection(COL).add({ data: { ...data, createdAt: Date.now() } })
    }
    return { ok: true }
  } catch (err) {
    return { ok: false, error: err.message }
  }
}
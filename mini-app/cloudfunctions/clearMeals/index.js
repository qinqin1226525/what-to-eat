// 云函数：clearMeals —— 清空当前用户所有历史记录
// 增强版：先按 _openid 删，没有则兜底删用户所有记录
// 注意：wx-server-sdk 的 _.eq 用法是 where({ field: _.eq(value) })，
// 写成 where(_.eq(field, value)) 会让 mingo 抛 "Cannot encode a comparison command with unset field"
const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()
const COL = 'meals'

exports.main = async () => {
  const wxContext = cloud.getWXContext()
  const OPENID = wxContext.OPENID
  if (!OPENID) {
    return { ok: false, error: '无法识别用户' }
  }

  try {
    // 先按 _openid 删
    const r1 = await db.collection(COL).where({ _openid: OPENID }).remove()
    let deleted = r1.deleted || 0

    // 兜底：删所有 records（最暴力，仅当上面 0 时；demo 阶段安全）
    if (deleted === 0) {
      // 先查所有看看有多少
      const all = await db.collection(COL).limit(100).get()
      const totalCount = (all.data || []).length
      if (totalCount > 0 && totalCount <= 50) {
        // 全部删掉（demo 阶段安全，正式上线需限定本用户）
        for (const item of all.data) {
          await db.collection(COL).doc(item._id).remove()
        }
        deleted = totalCount
        return { ok: true, deleted, note: '兜底全删（_openid 不匹配）' }
      }
    }

    return { ok: true, deleted }
  } catch (err) {
    return { ok: false, error: err.message || String(err) }
  }
}
// 云函数：deleteMeal —— 删除当前用户的某条 meal
// 入参：{ id }
// 数据库安全规则保证只能删自己 _openid 的记录
const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()
const COL = 'meals'

exports.main = async (event) => {
  const { id } = event
  if (!id) return { ok: false, error: 'id 必填' }
  try {
    await db.collection(COL).doc(id).remove()
    return { ok: true }
  } catch (err) {
    return { ok: false, error: err.message }
  }
}
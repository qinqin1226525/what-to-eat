// 云函数：updateMeal —— 编辑某条已存在的 meal 记录
// 入参：{ _id, dish?, meal?, date? }
const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()
const COL = 'meals'
const _ = db.command

exports.main = async (event) => {
  const { _id, dish, meal, date } = event
  if (!_id) {
    return { ok: false, error: '_id 必填' }
  }

  const update = {}
  if (dish !== undefined) {
    const trimmed = String(dish).trim()
    if (!trimmed) return { ok: false, error: 'dish 不能为空' }
    update.dish = trimmed
  }
  if (meal !== undefined) update.meal = String(meal).trim()
  if (date !== undefined) update.date = String(date).trim()
  if (Object.keys(update).length === 0) {
    return { ok: false, error: '至少要改一个字段' }
  }

  try {
    const res = await db.collection(COL).doc(_id).update({ data: update })
    if (res.updated === 0) {
      return { ok: false, error: '记录不存在或无变化' }
    }
    return { ok: true, updated: res.updated }
  } catch (err) {
    return { ok: false, error: err.message || String(err) }
  }
}
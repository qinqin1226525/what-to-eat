// 云函数：addMeal —— 写入一条餐食记录
// 入参：{ dish, meal, status, date }
// status ∈ {'confirmed','skipped','manual'}
const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()
const _ = db.command
const COL = 'meals'

exports.main = async (event) => {
  const { dish, meal = '', status = 'confirmed', date } = event
  if (!dish || typeof dish !== 'string') {
    return { ok: false, error: 'dish 不能为空' }
  }
  if (!['confirmed', 'skipped', 'manual'].includes(status)) {
    return { ok: false, error: 'status 非法' }
  }

  // 确保集合存在
  try { await db.createCollection(COL) } catch (e) { /* 已存在 */ }

  const now = Date.now()
  const record = {
    dish: dish.trim(),
    meal: meal || '',
    status,
    date: date || new Date().toISOString().slice(0, 10),
    createdAt: now
  }

  const res = await db.collection(COL).add({ data: record })
  return {
    ok: true,
    id: res._id,
    record
  }
}
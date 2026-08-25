// 云函数：addDish —— 加一道新菜到云数据库
// 入参：{ name, time_minutes, role, tags, ingredients, seasonings?, steps?, tip? }
const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()
const COL = 'dishes'

exports.main = async (event) => {
  const { name, time_minutes, role, tags, ingredients, seasonings, steps, tip } = event

  // 必填校验
  if (!name || typeof name !== 'string' || !name.trim()) {
    return { ok: false, error: '菜名必填' }
  }
  if (!role || !['主菜', '主食', '汤', '早餐', '凉菜'].includes(role)) {
    return { ok: false, error: 'role 必填且必须是：主菜/主食/汤/早餐/凉菜' }
  }
  const tm = Number(time_minutes)
  if (!tm || tm < 1 || tm > 600) {
    return { ok: false, error: 'time_minutes 必须是 1-600 的数字' }
  }

  // 确保集合存在
  try { await db.createCollection(COL) } catch (e) { /* 已存在 */ }

  // 查重（同名不能加）
  const existing = await db.collection(COL).where({ name: name.trim() }).limit(1).get()
  if (existing.data && existing.data.length > 0) {
    return { ok: false, error: `已存在同名菜「${name}」` }
  }

  // 构造记录
  const record = {
    name: name.trim(),
    time_minutes: tm,
    role: role,
    tags: Array.isArray(tags) ? tags.filter(t => t && t.trim()).map(t => t.trim()) : [],
    ingredients: Array.isArray(ingredients) ? ingredients.filter(t => t && t.trim()).map(t => t.trim()) : [],
    nutrition: null,
    seasonings: Array.isArray(seasonings) ? seasonings.filter(t => t && t.trim()).map(t => t.trim()) : [],
    steps: Array.isArray(steps) ? steps.filter(t => t && t.trim()).map(t => t.trim()) : [],
    tip: (typeof tip === 'string' ? tip.trim() : '')
  }

  const res = await db.collection(COL).add({ data: record })
  return {
    ok: true,
    id: res._id,
    dish: record,
    msg: `「${record.name}」添加成功`
  }
}
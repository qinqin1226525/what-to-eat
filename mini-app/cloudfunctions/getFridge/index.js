// 云函数：getFridge —— 拉当前用户的冰箱
const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()
const COL = 'user_fridges'

exports.main = async () => {
  const res = await db.collection(COL).limit(1).get()
  const items = (res.data && res.data[0]) ? (res.data[0].items || []) : []
  return { ok: true, items }
}
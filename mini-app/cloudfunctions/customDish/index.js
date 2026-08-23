// 云函数：customDish —— 用户「我会做的菜」菜池管理
// 数据存 user_custom_dishes 集合，每用户一个文档（按 _openid 区分）
// 入参：{ action, ...args }
// action ∈ {'get', 'add', 'remove', 'replace'}
const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()
const _ = db.command
const COL = 'user_custom_dishes'

async function getOpenid() {
  const { OPENID } = cloud.getWXContext()
  return OPENID
}

// 获取当前用户的菜池文档
async function findMyDoc() {
  const openid = await getOpenid()
  const r = await db.collection(COL).where({ _openid: openid }).limit(1).get()
  return { openid, doc: (r.data && r.data[0]) || null }
}

exports.main = async (event) => {
  const { action } = event
  try {
    if (action === 'get') {
      const { openid, doc } = await findMyDoc()
      return { ok: true, items: (doc && doc.items) || [], updatedAt: doc && doc.updatedAt }
    }

    if (action === 'add') {
      const { items } = event   // 要添加的菜名数组
      if (!Array.isArray(items) || items.length === 0) {
        return { ok: false, error: 'items 必须是非空数组' }
      }
      const { openid, doc } = await findMyDoc()
      const now = Date.now()
      const newItems = items.map(s => String(s).trim()).filter(Boolean)
      if (doc) {
        // 合并去重
        const merged = Array.from(new Set([...doc.items, ...newItems]))
        await db.collection(COL).doc(doc._id).update({
          data: { items: merged, updatedAt: now }
        })
        return { ok: true, items: merged }
      } else {
        await db.collection(COL).add({
          data: { items: newItems, updatedAt: now }
        })
        return { ok: true, items: newItems }
      }
    }

    if (action === 'remove') {
      const { name } = event
      if (!name) return { ok: false, error: 'name 不能为空' }
      const { doc } = await findMyDoc()
      if (!doc) return { ok: true, items: [] }
      const filtered = doc.items.filter(n => n !== name)
      await db.collection(COL).doc(doc._id).update({
        data: { items: filtered, updatedAt: Date.now() }
      })
      return { ok: true, items: filtered }
    }

    if (action === 'replace') {
      // onboarding 用：整批覆盖（从 125 道菜里预选的）
      const { items } = event
      if (!Array.isArray(items)) {
        return { ok: false, error: 'items 必须是数组' }
      }
      const { openid, doc } = await findMyDoc()
      const clean = items.map(s => String(s).trim()).filter(Boolean)
      const now = Date.now()
      if (doc) {
        await db.collection(COL).doc(doc._id).update({
          data: { items: clean, updatedAt: now }
        })
      } else {
        await db.collection(COL).add({
          data: { items: clean, updatedAt: now }
        })
      }
      return { ok: true, items: clean }
    }

    return { ok: false, error: `未知 action: ${action}` }
  } catch (err) {
    return { ok: false, error: err.message || String(err) }
  }
}
// utils/util.js —— 通用工具

function todayISO() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function nowTimestamp() {
  return Date.now()
}

// 显示真实错误（截前 50 字避免 toast 太长）
function showError(title, err) {
  console.error(title || '错误', err)
  let msg = '出错了'
  if (err && err.message) msg = err.message
  else if (typeof err === 'string') msg = err
  if (msg.length > 50) msg = msg.slice(0, 50) + '…'
  wx.showToast({ title: `${title || '失败'}：${msg}`, icon: 'none', duration: 4000 })
}

function showSuccess(title) {
  wx.showToast({ title: title || '成功', icon: 'success' })
}

module.exports = { todayISO, nowTimestamp, showError, showSuccess }
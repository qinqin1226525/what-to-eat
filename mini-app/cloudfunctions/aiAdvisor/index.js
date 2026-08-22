// 云函数：aiAdvisor —— 调 DeepSeek API 做饮食顾问
// API key 从云函数环境变量读（API_KEY），不在代码里
const cloud = require('wx-server-sdk')
const https = require('https')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

exports.main = async (event) => {
  const { question, profile, todayMeals, todayTotals, targets } = event
  const API_KEY = process.env.API_KEY
  const API_URL = process.env.API_URL || 'https://api.deepseek.com/v1/chat/completions'
  const MODEL = process.env.MODEL || 'deepseek-chat'

  if (!API_KEY) {
    return { ok: false, error: 'API_KEY 未配置，请在云函数环境变量里设置' }
  }
  if (!question || !question.trim()) {
    return { ok: false, error: '问题不能为空' }
  }

  // 限流检查
  const rateCheck = await checkAndIncrementAIUsage()
  if (!rateCheck.ok) {
    return {
      ok: false,
      error: rateCheck.error,
      rateLimited: true,
      remaining: rateCheck.remaining || 0
    }
  }

  // 拼上下文
  const ctx = buildContext(profile, todayMeals, todayTotals, targets)

  // 拼 system prompt
  const systemPrompt = `你是一位贴心的中文饮食顾问，名叫"三餐肆计"。

## 你的能力
- 根据用户身体情况推荐个性化菜谱
- 解读今日营养摄入是否合理
- 教做菜（步骤清晰）
- 回答食材相克、营养搭配问题

## 回答规则
- **只用中文**回答
- 简洁，3-6 句话
- 必要时用 1-2-3 编号列举步骤
- **不要诊断疾病**，只给饮食参考建议
- 涉及健康问题，提示"具体请咨询医生或营养师"
- 不需要每次都问"还有其他问题吗"

## 用户的当前背景
${ctx}

## 你的菜谱库
我能从我们 125+ 道家常菜里推荐，包括：川菜/粤菜/家常/快手/素食/汤/早餐/主食等

请基于这些信息回答用户问题。`

  try {
    // Node 16.13 没有 fetch，用 https 模块替代
    const data = await httpsPostJson(API_URL, API_KEY, {
      model: MODEL,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: question }
      ],
      max_tokens: 800,
      temperature: 0.7,
      stream: false
    })

    if (!data.choices || !data.choices[0]) {
      return { ok: false, error: 'DeepSeek 返回空: ' + JSON.stringify(data).slice(0, 200) }
    }

    const reply = data.choices[0].message.content.trim()
    const usage = data.usage || {}

    return {
      ok: true,
      reply,
      remaining: rateCheck.remaining,
      usage: {
        prompt_tokens: usage.prompt_tokens || 0,
        completion_tokens: usage.completion_tokens || 0,
        total_tokens: usage.total_tokens || 0
      },
      model: MODEL
    }
  } catch (err) {
    return { ok: false, error: `调用失败：${err.message || String(err)}` }
  }
}

// 用 https 模块发 POST + JSON
function httpsPostJson(url, apiKey, body) {
  return new Promise((resolve, reject) => {
    const u = new URL(url)
    const data = JSON.stringify(body)
    const opts = {
      hostname: u.hostname,
      port: u.port || 443,
      path: u.pathname + (u.search || ''),
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
        'Content-Length': Buffer.byteLength(data)
      }
    }
    const req = https.request(opts, (res) => {
      const chunks = []
      res.on('data', (c) => chunks.push(c))
      res.on('end', () => {
        const text = Buffer.concat(chunks).toString('utf8')
        if (res.statusCode >= 200 && res.statusCode < 300) {
          try { resolve(JSON.parse(text)) }
          catch (e) { reject(new Error('JSON 解析失败: ' + text.slice(0, 200))) }
        } else {
          reject(new Error(`HTTP ${res.statusCode}: ${text.slice(0, 200)}`))
        }
      })
    })
    req.on('error', reject)
    req.setTimeout(55000, () => {
      req.destroy(new Error('请求超时（55s）'))
    })
    req.write(data)
    req.end()
  })
}

function buildContext(profile, todayMeals, todayTotals, targets) {
  const parts = []
  if (profile && Object.keys(profile).length > 0) {
    const sex = profile.sex === 'male' ? '男' : profile.sex === 'female' ? '女' : ''
    if (sex || profile.age || profile.weight) {
      parts.push(`- 性别:${sex || '未知'}, 年龄:${profile.age || '?'}岁, 体重:${profile.weight || '?'}kg`)
    }
    if (profile.activity) {
      const actMap = { sedentary: '久坐', light: '轻度活动', moderate: '中度活动', active: '高度活动' }
      parts.push(`- 活动量:${actMap[profile.activity] || profile.activity}`)
    }
    if (profile.goal) {
      const goalMap = { lose: '减脂', maintain: '维持', gain: '增肌' }
      parts.push(`- 目标:${goalMap[profile.goal] || profile.goal}`)
    }
    if (profile.conditions && profile.conditions.length > 0) {
      parts.push(`- 健康状况:${profile.conditions.join('、')}`)
    }
    if (profile.allergies && profile.allergies.length > 0) {
      parts.push(`- 过敏:${profile.allergies.join('、')}`)
    }
  }
  if (todayMeals && todayMeals.length > 0) {
    const names = todayMeals.map(m => m.dish).slice(0, 10)
    parts.push(`- 今日已吃:${names.join('、')}`)
  }
  if (todayTotals && targets && targets.calories > 0) {
    parts.push(`- 今日营养: ${todayTotals.calories}/${targets.calories} kcal, 蛋白 ${todayTotals.protein || 0}/${targets.protein}g, 碳水 ${todayTotals.carbs || 0}/${targets.carbs}g, 脂肪 ${todayTotals.fat || 0}/${targets.fat}g`)
  }
  return parts.length > 0 ? parts.join('\n') : '- 用户尚未填写健康档案'
}
// ===== 限流辅助 =====
const DAILY_LIMIT = 10

async function checkAndIncrementAIUsage() {
  const wxContext = cloud.getWXContext()
  const openid = wxContext.OPENID
  if (!openid) return { ok: false, error: '无法识别用户' }

  const COL = 'user_prefs'
  // 确保集合存在
  try { await db.createCollection(COL) } catch (e) { /* 已存在 */ }

  const today = new Date().toISOString().slice(0, 10)

  // 查 user_prefs
  const exist = await db.collection(COL).where({ _openid: openid }).limit(1).get()
  if (!exist.data || exist.data.length === 0) {
    // 还没存过任何 prefs —— 用一个 dummy 文档存计数器（用 _openid 区分）
    // 但 user_prefs 记录可能因 user_prefs 存过其他东西而存在
    // 简单做法：新建一个 AI_COUNTER 集合
  }
  
  // 改用独立集合 ai_counters
  try { await db.createCollection('ai_counters') } catch (e) { /* 已存在 */ }
  const counter = await db.collection('ai_counters').where({ _openid: openid }).limit(1).get()
  
  let data
  if (counter.data && counter.data.length > 0) {
    data = counter.data[0]
  } else {
    // 第一次，新建
    const addRes = await db.collection('ai_counters').add({
      data: { _openid: openid, date: today, count: 0 }
    })
    data = { _id: addRes._id, date: today, count: 0 }
  }

  // 跨天重置
  if (data.date !== today) {
    await db.collection('ai_counters').doc(data._id).update({
      data: { date: today, count: 0 }
    })
    data.count = 0
  }

  // 检查限额
  if (data.count >= DAILY_LIMIT) {
    return {
      ok: false,
      error: `今日 AI 额度已用完（${DAILY_LIMIT} 次/天），明天 0 点重置`,
      rateLimited: true,
      remaining: 0
    }
  }

  // +1
  await db.collection('ai_counters').doc(data._id).update({
    data: { count: data.count + 1 }
  })

  return {
    ok: true,
    remaining: DAILY_LIMIT - data.count - 1
  }
}

async function getAIRemaining() {
  const wxContext = cloud.getWXContext()
  const openid = wxContext.OPENID
  if (!openid) return 0
  try {
    const r = await db.collection('ai_counters').where({ _openid: openid }).limit(1).get()
    if (!r.data || r.data.length === 0) return DAILY_LIMIT
    const today = new Date().toISOString().slice(0, 10)
    if (r.data[0].date !== today) return DAILY_LIMIT
    return Math.max(0, DAILY_LIMIT - r.data[0].count)
  } catch (e) {
    return DAILY_LIMIT
  }
}

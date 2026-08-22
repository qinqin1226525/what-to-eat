// 云函数：smartAddDish —— AI 根据菜名自动生成食材/做法/配料
// API key 从环境变量读（API_KEY）
const cloud = require('wx-server-sdk')
const https = require('https')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()

exports.main = async (event) => {
  const { name } = event
  const API_KEY = process.env.API_KEY
  const API_URL = process.env.API_URL || 'https://api.deepseek.com/v1/chat/completions'
  const MODEL = process.env.MODEL || 'deepseek-chat'

  if (!API_KEY) {
    return { ok: false, error: 'API_KEY 未配置，请在云函数环境变量里设置' }
  }
  if (!name || !name.trim()) {
    return { ok: false, error: '菜名不能为空' }
  }

  // 限流
  const rate = await checkAndIncrementAIUsage()
  if (!rate.ok) {
    return { ok: false, error: rate.error, rateLimited: true, remaining: rate.remaining || 0 }
  }

  const systemPrompt = `你是一位中餐厨师和营养师。用户会给你一个菜名，你需要为这个菜提供：
1. time_minutes: 烹饪时间（数字，分钟）
2. role: 菜的分类，只能是「主菜/主食/汤/早餐/凉菜」之一
3. ingredients: 食材列表（每项含用量，如"牛腩 500g"）
4. seasonings: 调料列表（每项含用量，如"生抽 2勺"）
5. steps: 做法步骤（每步一句话，按顺序）
6. tip: 关键小贴士（一句话，能让这道菜做得更好吃）

严格要求：
- 只输出**纯 JSON**，不要任何解释、前后缀、markdown 代码块
- JSON 字段必须齐全，所有数组即使只有 1 项也要是数组
- 中文输出
- 食材/调料要含具体用量（"适量"这种模糊词少用）
- 步骤要可执行，不要"加入适量调料"这种空话`

  const userPrompt = `请为「${name.trim()}」生成完整做法。`

  try {
    const data = await httpsPostJson(API_URL, API_KEY, {
      model: MODEL,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ],
      max_tokens: 1200,
      temperature: 0.4,
      stream: false
    })

    if (!data.choices || !data.choices[0]) {
      return { ok: false, error: 'AI 返回空' }
    }

    const raw = data.choices[0].message.content.trim()
    // 尝试解析 JSON（可能 AI 偶发带 ```json``` 包装）
    let parsed
    try {
      // 去除可能的 markdown 代码块包装
      const cleaned = raw.replace(/^```json\s*/i, '').replace(/```\s*$/, '').trim()
      parsed = JSON.parse(cleaned)
    } catch (e) {
      return { ok: false, error: 'AI 返回非 JSON：' + raw.slice(0, 200) }
    }

    // 校验和规范化字段
    const validRoles = ['主菜', '主食', '汤', '早餐', '凉菜']
    const result = {
      time_minutes: Number(parsed.time_minutes) || 30,
      role: validRoles.includes(parsed.role) ? parsed.role : '主菜',
      ingredients: Array.isArray(parsed.ingredients) ? parsed.ingredients.filter(s => s && s.trim()).map(s => s.trim()) : [],
      seasonings: Array.isArray(parsed.seasonings) ? parsed.seasonings.filter(s => s && s.trim()).map(s => s.trim()) : [],
      steps: Array.isArray(parsed.steps) ? parsed.steps.filter(s => s && s.trim()).map(s => s.trim()) : [],
      tip: (typeof parsed.tip === 'string' ? parsed.tip.trim() : '')
    }

    return {
      ok: true,
      dish: result,
      remaining: rate.remaining,
      usage: data.usage || {}
    }
  } catch (err) {
    return { ok: false, error: `调用失败：${err.message || String(err)}` }
  }
}

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
// ===== 限流辅助（与 aiAdvisor 共享逻辑）=====
const DAILY_LIMIT = 10

async function checkAndIncrementAIUsage() {
  const wxContext = cloud.getWXContext()
  const openid = wxContext.OPENID
  if (!openid) return { ok: false, error: '无法识别用户' }

  const today = new Date().toISOString().slice(0, 10)
  try { await db.createCollection('ai_counters') } catch (e) { /* 已存在 */ }
  const counter = await db.collection('ai_counters').where({ _openid: openid }).limit(1).get()

  let data
  if (counter.data && counter.data.length > 0) {
    data = counter.data[0]
  } else {
    const addRes = await db.collection('ai_counters').add({
      data: { _openid: openid, date: today, count: 0 }
    })
    data = { _id: addRes._id, date: today, count: 0 }
  }

  if (data.date !== today) {
    await db.collection('ai_counters').doc(data._id).update({ data: { date: today, count: 0 } })
    data.count = 0
  }

  if (data.count >= DAILY_LIMIT) {
    return { ok: false, error: `今日 AI 额度已用完（${DAILY_LIMIT} 次/天），明天 0 点重置`, rateLimited: true, remaining: 0 }
  }

  await db.collection('ai_counters').doc(data._id).update({ data: { count: data.count + 1 } })
  return { ok: true, remaining: DAILY_LIMIT - data.count - 1 }
}

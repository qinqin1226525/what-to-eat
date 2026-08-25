// utils/algorithm.js —— 移植自 what_to_eat.py
// 核心算法：选菜 + 三餐 + 偏好过滤 + 冰箱匹配 + 全文搜索

// ---------- 偏好默认值 ----------
const DEFAULT_PREFS = {
  cuisines: [],         // [] = 不限；['川菜'] = 只要川菜
  spicy: 'any',         // 'any' | 'none' | 'mild'
  noNumb: false,
  avoid: {
    seafood: false, offal: false, cilantro: false,
    beef: false, lamb: false, centuryEgg: false
  },
  maxTime: 0,           // 0 = 不限
  vegetarian: false,
  noCold: false,
  skipBreakfast: false,
  comboSize: '1-1-1',
  nPeople: 1,
  mealPattern: 'any'      // Phase 2.6: 'any' | 'noodle-noodle' | 'noodle-rice' | 'rice-rice'
}

const ALLOWED_COMBO_SIZES = ['1-1-1', '2-1', '3-1', '4-1']
const ALLOWED_N_PEOPLE = Array.from({ length: 10 }, (_, i) => i + 1)
const VALID_MEALS = ['早餐', '午餐', '晚餐']

// ===== 健康画像（Phase 2）=====
const DEFAULT_PROFILE = {
  sex: '',           // 'male' | 'female' | ''
  age: 0,            // 岁
  height: 0,         // cm
  weight: 0,         // kg
  activity: '',      // 'sedentary' | 'light' | 'moderate' | 'active'
  goal: '',          // 'lose' | 'maintain' | 'gain'
  conditions: [],    // ['hypertension', 'diabetes', 'gout']
  allergies: []      // ['seafood', 'nuts', 'dairy', 'gluten']
}

const ACTIVITY_LABELS = {
  sedentary: '久坐（基本不动）',
  light: '轻度（每周运动 1-3 次）',
  moderate: '中度（每周运动 3-5 次）',
  active: '高度（每周运动 6+ 次）'
}

const GOAL_LABELS = {
  lose: '减脂（每天 -500 kcal）',
  maintain: '维持现状',
  gain: '增肌（每天 +400 kcal）'
}

const CONDITION_LABELS = {
  hypertension: '高血压（限钠）',
  diabetes: '糖尿病（限糖）',
  gout: '痛风（限嘌呤）'
}

const ALLERGY_LABELS = {
  seafood: '海鲜过敏',
  nuts: '坚果过敏',
  dairy: '乳制品过敏',
  gluten: '麸质过敏'
}

// 活动系数（Harris-Benedict 修正版）
const ACTIVITY_MULT = {
  sedentary: 1.2,
  light: 1.375,
  moderate: 1.55,
  active: 1.725
}

// 估算每道菜的营养（粗估，按 role + 食材关键词）
function estimateDishNutrition(dish) {
  if (!dish) return { calories: 0, protein: 0, carbs: 0, fat: 0, sodium: 0 }
  if (dish.nutrition && dish.nutrition.calories) return dish.nutrition

  let cal = 0, protein = 0, carbs = 0, fat = 0, sodium = 0
  const role = dish.role || '主菜'
  const ings = (dish.ingredients || []).join(' ')

  // 按 role 基础值
  if (role === '主菜') { cal = 350; protein = 25; fat = 18; sodium = 800 }
  else if (role === '汤') { cal = 150; protein = 8; fat = 5; sodium = 600 }
  else if (role === '主食') { cal = 400; protein = 10; carbs = 75; fat = 5; sodium = 400 }
  else if (role === '凉菜') { cal = 120; protein = 5; fat = 8; sodium = 500 }
  else if (role === '早餐') { cal = 300; protein = 12; carbs = 45; fat = 8; sodium = 400 }

  // 调整：如果是素菜，减脂、减蛋白
  if ((dish.tags || []).includes('素食')) { protein = Math.max(protein - 8, 3); fat = Math.max(fat - 8, 2) }
  // 如果含海鲜（鱼/虾），加蛋白
  if (/鱼|虾|蟹/.test(ings)) { protein += 10 }
  // 如果含红肉（牛/羊/猪），加脂肪
  if (/牛|羊|五花肉|排骨/.test(ings)) { fat += 5 }
  // 如果有面/米/粉，碳水多
  if (/面|米|饭|饺子|粉|馒头|饼/.test(ings)) { carbs += 30 }
  // 辣味菜的钠略高
  if ((dish.tags || []).some(t => /辣|麻辣/.test(t))) { sodium += 200 }

  return { calories: cal, protein, carbs, fat, sodium }
}

// 计算 BMR（Mifflin-St Jeor 公式，最准）
function calculateBMR(profile) {
  if (!profile || !profile.height || !profile.age || !profile.weight) return 0
  const base = 10 * profile.weight + 6.25 * profile.height - 5 * profile.age
  return profile.sex === 'male' ? base + 5 : base - 161
}

// 计算每日总消耗 TDEE
function calculateTDEE(profile) {
  const bmr = calculateBMR(profile)
  const mult = ACTIVITY_MULT[profile.activity] || 1.2
  return bmr * mult
}

// 计算每日推荐摄入（按目标调整）
function calculateTargets(profile) {
  const bmr = calculateBMR(profile)
  const tdee = calculateTDEE(profile)
  if (bmr === 0) {
    return { calories: 0, protein: 0, carbs: 0, fat: 0, sodium: 0, bmr: 0, tdee: 0 }
  }

  let calories = tdee
  if (profile.goal === 'lose') calories = Math.max(tdee - 500, bmr)   // 不能低于 BMR
  else if (profile.goal === 'gain') calories = tdee + 400

  // 蛋白质：1.6g/kg 体重（增肌时 2.0）
  const proteinPerKg = profile.goal === 'gain' ? 2.0 : 1.6
  const protein = profile.weight * proteinPerKg

  // 脂肪：总热量的 25%（减脂时降到 20%）
  const fatPct = profile.goal === 'lose' ? 0.20 : 0.25
  const fat = (calories * fatPct) / 9

  // 碳水：剩余热量
  const carbs = Math.max((calories - protein * 4 - fat * 9) / 4, 0)

  // 钠：标准 <2300 mg，高血压患者 <1500
  let sodium = 2300
  if ((profile.conditions || []).includes('hypertension')) sodium = 1500
  // 糖尿病患者碳水上限更严
  // 痛风：低嘌呤（避免海鲜/内脏/肉汤）

  return {
    calories: Math.round(calories),
    protein: Math.round(protein),
    carbs: Math.round(carbs),
    fat: Math.round(fat),
    sodium: Math.round(sodium),
    bmr: Math.round(bmr),
    tdee: Math.round(tdee)
  }
}

// 聚合今日所有餐的营养（需要传入 dishes 列表做名称→菜谱的映射）
function aggregateDailyNutrition(meals, dishes) {
  const totals = { calories: 0, protein: 0, carbs: 0, fat: 0, sodium: 0 }
  if (!Array.isArray(meals)) return totals
  const dishMap = {}
  if (Array.isArray(dishes)) {
    for (const d of dishes) dishMap[d.name] = d
  }
  for (const m of meals) {
    // 只算 status==='confirmed' 或 'manual' 的，skipped 不算
    if (m.status === 'skipped') continue
    const dish = dishMap[m.dish] || null
    const n = estimateDishNutrition(dish)
    totals.calories += n.calories
    totals.protein += n.protein
    totals.carbs += n.carbs
    totals.fat += n.fat
    totals.sodium += n.sodium
  }
  return totals
}

const SPICY_TAGS = ['辣', '微辣', '麻辣']
const KID_FRIENDLY_TAGS = ['小孩爱', '甜口', '酸甜', '清淡', '基础', '面食', '快手']
const SEAFOOD_KEYS = ['鱼', '虾', '蟹', '紫菜', '海带', '扇贝', '蛤', '牡蛎', '鱿鱼']
const OFFAL_KEYS = ['肥肠', '猪肚', '肝', '腰', '心', '肚']

const ROLE_EMOJI = {
  '主菜': '🍖', '主菜2': '🍖', '主菜3': '🍖', '主菜4': '🍖',
  '汤': '🍲', '汤2': '🍲',
  '主食': '🍚', '主食2': '🍚',
  '凉菜': '🥗', '早餐': '🥣'
}

const PROTEIN_KEYS = ['鸡', '鸭', '鹅', '猪', '牛', '羊', '鱼', '虾', '蟹', '蛋', '豆腐', '豆浆', '牛奶', '奶酪']
const CARB_KEYS = ['米', '面', '馒头', '饺子', '包子', '土豆', '红薯', '玉米', '燕麦', '饼', '年糕', '糯米', '面包']
const VEG_KEYS = ['青', '芹', '白菜', '菜', '萝卜', '木耳', '菇', '海带', '茄', '黄瓜', '豆', '菠', '韭菜']

const INGREDIENT_SYNONYMS = {
  '肉': ['肉', '猪肉', '牛肉', '羊肉', '五花肉', '里脊肉', '排骨', '肉末', '肉丝', '肉片', '鸡肉', '鸭肉', '牛排', '牛里脊', '牛腱子', '牛腩', '羊肉片', '鸡腿', '鸡翅', '鸡胸', '鸡块', '鸡丁'],
  '菜': ['菜', '蔬', '白菜', '萝卜', '芹', '茄', '黄瓜', '菠', '韭菜', '青菜'],
  '蛋': ['蛋', '鸡蛋', '蛋花'],
  '豆': ['豆', '豆腐', '豆浆'],
  '海鲜': ['虾', '蟹', '鱼', '鱿', '蛤', '海带', '紫菜'],
  '辣': ['辣', '椒', '麻辣', '红油'],
  '排骨': ['排骨', '猪排骨', '肋排'],
  '五花肉': ['五花肉', '三层肉'],
  '猪肉': ['猪肉'],
  '鹅肉': ['鹅肉'],
  '牛肉': ['牛肉'],
  '羊肉': ['羊肉'],
  '鸡肉': ['鸡肉'],
  '鸡蛋': ['鸡蛋', '鸡子']
}

// ---------- 工具函数 ----------
function todayISO() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function daysAgoISO(n) {
  const d = new Date()
  d.setDate(d.getDate() - n)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function parseDate(s) {
  if (!s) return null
  const d = new Date(s)
  return isNaN(d.getTime()) ? null : d
}

function shuffle(arr) {
  const a = arr.slice()
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

function expandSynonyms(keywords) {
  const out = new Set()
  for (const kw of keywords) {
    out.add(kw)
    const syns = INGREDIENT_SYNONYMS[kw]
    if (syns) syns.forEach(s => out.add(s))
  }
  return Array.from(out)
}

// ---------- 偏好过滤 ----------
function applyPrefs(dishes, prefs) {
  prefs = prefs || {}
  if (!prefs || Object.keys(prefs).length === 0) return dishes.slice()
  let result = dishes.slice()

  // 1. 菜系
  const cuisines = prefs.cuisines || []
  if (cuisines.length > 0) {
    result = result.filter(d => (d.tags || []).some(t => cuisines.includes(t)))
  }

  // 2. 辣度
  const spicy = prefs.spicy || 'any'
  if (spicy === 'none') {
    result = result.filter(d => !SPICY_TAGS.some(s => (d.tags || []).some(t => t.includes(s))))
  } else if (spicy === 'mild') {
    result = result.filter(d => !(d.tags || []).includes('辣') && !(d.tags || []).includes('麻辣'))
  }

  // 3. 不要麻辣
  if (prefs.noNumb) {
    result = result.filter(d => !(d.tags || []).includes('麻辣'))
  }

  // 4. 忌口
  const avoid = prefs.avoid || {}
  const hasIngredient = (d, keys) => (d.ingredients || []).some(ing => keys.some(k => ing.includes(k)))
  if (avoid.seafood) result = result.filter(d => !hasIngredient(d, SEAFOOD_KEYS))
  if (avoid.offal) result = result.filter(d => !hasIngredient(d, OFFAL_KEYS))
  if (avoid.cilantro) result = result.filter(d => !(d.ingredients || []).some(ing => ing.includes('香菜')))
  if (avoid.beef) result = result.filter(d => !(d.ingredients || []).some(ing => ing.includes('牛')))
  if (avoid.lamb) result = result.filter(d => !(d.ingredients || []).some(ing => ing.includes('羊')))
  if (avoid.centuryEgg) result = result.filter(d => !(d.ingredients || []).some(ing => ing.includes('皮蛋')))

  // 5. 时间
  if (prefs.maxTime && prefs.maxTime > 0) {
    result = result.filter(d => (d.time_minutes || 0) <= prefs.maxTime)
  }

  // 6. 素食
  if (prefs.vegetarian) {
    result = result.filter(d => (d.tags || []).includes('素食'))
  }

  // 7. 不要凉菜
  if (prefs.noCold) {
    result = result.filter(d => d.role !== '凉菜')
  }

  return result
}

// ---------- 评分权重 ----------
function computeTagAffinities(scores, dishes) {
  const tagPos = {}
  const tagNeg = {}
  for (const d of dishes) {
    const s = (scores && scores[d.name]) || {}
    const pos = (s.likes || 0) + (s.cooks || 0)
    const neg = s.dislikes || 0
    if (pos + neg === 0) continue
    for (const t of (d.tags || [])) {
      tagPos[t] = (tagPos[t] || 0) + pos
      tagNeg[t] = (tagNeg[t] || 0) + neg
    }
  }
  const affinities = {}
  const allTags = new Set([...Object.keys(tagPos), ...Object.keys(tagNeg)])
  for (const t of allTags) {
    const total = (tagPos[t] || 0) + (tagNeg[t] || 0)
    if (total < 3) { affinities[t] = 0; continue }
    const ratio = (tagPos[t] || 0) / total
    affinities[t] = (ratio - 0.5) * 2
  }
  return affinities
}

function weightedChoice(candidates, scores, tagAff) {
  if (!candidates || candidates.length === 0) return null
  const weights = candidates.map(d => {
    const s = (scores && scores[d.name]) || {}
    let w = 1.0
    w += (s.likes || 0) * 3
    w += (s.cooks || 0) * 2
    w -= (s.dislikes || 0) * 5
    for (const t of (d.tags || [])) {
      w += (tagAff[t] || 0) * 4
    }
    return Math.max(w, 0.1)
  })
  const total = weights.reduce((a, b) => a + b, 0)
  let r = Math.random() * total
  for (let i = 0; i < candidates.length; i++) {
    r -= weights[i]
    if (r <= 0) return candidates[i]
  }
  return candidates[candidates.length - 1]
}

function isVegetarian(dish) {
  return dish && (dish.tags || []).includes('素食')
}

// ---------- 主选菜逻辑 ----------
function chooseCombo(dishes, history, options) {
  const opts = options || {}
  const prefs = opts.prefs
  const scores = opts.scores || {}
  const window = opts.window || 30
  const currentPicks = opts.currentPicks || {}   // { '主菜': '西红柿炒蛋', '主菜2': '红烧肉', ... }
  const replaceSlot = opts.replaceSlot || null   // e.g. '主菜' — 这个 slot 重抽

  let pool = applyPrefs(dishes, prefs)
  if (pool.length === 0) pool = dishes.slice()

  // 过滤 skipped
  const recent = new Set(
    (history || [])
      .filter(h => h.status !== 'skipped')
      .slice(-window)
      .map(h => h.dish)
  )

  const tagAff = computeTagAffinities(scores, pool)

  // 推导份量
  let numMains, numSoups, numStaples, heavyQuota
  if (prefs && typeof prefs.nPeople === 'number' && ALLOWED_N_PEOPLE.includes(prefs.nPeople)) {
    const t = nPeopleToComboSize(prefs.nPeople)
    numMains = t[0]; numSoups = t[1]; numStaples = t[2]
    heavyQuota = heavyDishQuota(prefs.nPeople)
  } else {
    const comboSize = (prefs && prefs.comboSize) || '1-1-1'
    const cs = ALLOWED_COMBO_SIZES.includes(comboSize) ? comboSize : '1-1-1'
    const parts = cs.split('-').map(Number)
    numMains = parts.length >= 1 ? Math.max(1, Math.min(4, parts[0])) : 1
    numSoups = parts.length >= 2 && parts[1] === 1 ? 1 : 1
    numStaples = parts.length >= 3 && parts[2] === 1 ? 1 : 0
    heavyQuota = 1
  }

  const pickedNames = new Set()
  let pickedMainsHaveVeg = false
  let heavyUsed = 0

  function pick(role, forceVeg) {
    let candidates = pool.filter(d => d.role === role && !recent.has(d.name) && !pickedNames.has(d.name))
    if (candidates.length === 0) candidates = pool.filter(d => d.role === role && !pickedNames.has(d.name))
    if (candidates.length === 0 && pool !== dishes) {
      candidates = dishes.filter(d => d.role === role && !recent.has(d.name) && !pickedNames.has(d.name))
    }
    if (candidates.length === 0) candidates = dishes.filter(d => d.role === role && !pickedNames.has(d.name))
    if (candidates.length === 0) candidates = dishes.filter(d => d.role === role)

    if (forceVeg) {
      const vegOnly = candidates.filter(d => isVegetarian(d))
      if (vegOnly.length > 0) candidates = vegOnly
    }

    if (role === '主菜' && heavyUsed >= heavyQuota) {
      const lightOnly = candidates.filter(d => (d.time_minutes || 0) < 60)
      if (lightOnly.length > 0) candidates = lightOnly
    }

    const choice = weightedChoice(candidates, scores, tagAff)
    if (choice) {
      pickedNames.add(choice.name)
      if (role === '主菜' && isVegetarian(choice)) pickedMainsHaveVeg = true
      if (role === '主菜' && (choice.time_minutes || 0) >= 60) heavyUsed++
    }
    return choice
  }

  const combo = {}
  for (let i = 0; i < numMains; i++) {
    const needVeg = numMains >= 2 && i === numMains - 1 && !pickedMainsHaveVeg
    const key = i === 0 ? '主菜' : `主菜${i + 1}`
    // Phase 2.7: 如果 currentPicks 已选这道，且不是要替换的 slot，复用
    if (currentPicks[key] && key !== replaceSlot) {
      const existing = dishes.find(d => d.name === currentPicks[key])
      if (existing) {
        combo[key] = Object.assign({}, existing, { emoji: ROLE_EMOJI[key] })
        pickedNames.add(existing.name)
        if (isVegetarian(existing)) pickedMainsHaveVeg = true
        if ((existing.time_minutes || 0) >= 60) heavyUsed++
        continue
      }
    }
    const d = pick('主菜', needVeg)
    if (d) combo[key] = Object.assign({}, d, { emoji: ROLE_EMOJI[key] })
  }
  for (let i = 0; i < numSoups; i++) {
    const key = i === 0 ? '汤' : `汤${i + 1}`
    if (currentPicks[key] && key !== replaceSlot) {
      const existing = dishes.find(d => d.name === currentPicks[key])
      if (existing) {
        combo[key] = Object.assign({}, existing, { emoji: ROLE_EMOJI[key] })
        pickedNames.add(existing.name)
        continue
      }
    }
    const d = pick('汤')
    if (d) combo[key] = Object.assign({}, d, { emoji: ROLE_EMOJI[key] })
  }
  for (let i = 0; i < numStaples; i++) {
    const key = i === 0 ? '主食' : `主食${i + 1}`
    if (currentPicks[key] && key !== replaceSlot) {
      const existing = dishes.find(d => d.name === currentPicks[key])
      if (existing) {
        combo[key] = Object.assign({}, existing, { emoji: ROLE_EMOJI[key] })
        pickedNames.add(existing.name)
        continue
      }
    }
    const d = pick('主食')
    if (d) combo[key] = Object.assign({}, d, { emoji: ROLE_EMOJI[key] })
  }
  return combo
}

function nPeopleToComboSize(n) {
  if (n <= 4) return [Math.max(1, n), 1, 1]
  if (n <= 8) return [5, 1, 1]
  return [6, 1, 1]
}

function heavyDishQuota(n) {
  return n <= 4 ? 1 : 2
}

// ---------- 冰箱：有什么 → 能做什么 ----------
function filterByIngredients(dishes, availableIngredients) {
  if (!availableIngredients || availableIngredients.length === 0) return []
  const keywords = expandSynonyms(availableIngredients)
  return dishes.filter(d => {
    const haystack = [d.name, ...(d.ingredients || []), ...(d.tags || []), ...(d.seasonings || [])].join(' ')
    return keywords.some(kw => haystack.includes(kw))
  })
}

// ---------- 全文搜索 ----------
function searchDishes(dishes, query) {
  if (!query || !query.trim()) return []
  const keywords = query.trim().toLowerCase().split(/\s+/).filter(Boolean)
  if (keywords.length === 0) return []
  return dishes.filter(d => {
    const haystack = [d.name || '', ...(d.tags || []), ...(d.ingredients || []), ...(d.seasonings || [])].join(' ').toLowerCase()
    return keywords.every(kw => haystack.includes(kw))
  })
}

// ---------- 一日三餐 ----------
function chooseOneMeal(dishes, history, options) {
  const opts = options || {}
  const prefs = opts.prefs
  const scores = opts.scores || {}
  const window = opts.window || 30
  const mustBeRice = !!opts.mustBeRice
  const comboSize = (opts.comboSize && ALLOWED_COMBO_SIZES.includes(opts.comboSize)) ? opts.comboSize : '1-1-1'
  const excludeNames = new Set(opts.excludeNames || [])

  let pool = applyPrefs(dishes, prefs)
  if (pool.length === 0) pool = dishes.slice()

  const cutoff = new Date()
  cutoff.setDate(cutoff.getDate() - window)
  const recent = new Set(
    (history || [])
      .filter(h => {
        if (h.status === 'skipped') return false
        const d = parseDate(h.date)
        return d && d >= cutoff
      })
      .map(h => h.dish)
  )

  const tagAff = computeTagAffinities(scores, pool)

  const isRice = (d) => { const n = d.name || ''; return n.includes('米') && !n.includes('面') }
  const isOneBowl = (d) => { const n = d.name || ''; return n.includes('面') || n.includes('饺子') }
  const isLunchMainAllowed = (d) => { const n = d.name || ''; return ['米', '面', '饺子'].some(k => n.includes(k)) }

  function pickMain(candidatePool, fallbackPool) {
    const mainFilter = mustBeRice ? isRice : isLunchMainAllowed
    let cands = candidatePool.filter(d => d.role === '主食' && mainFilter(d) && !recent.has(d.name) && !excludeNames.has(d.name))
    if (cands.length === 0) cands = candidatePool.filter(d => d.role === '主食' && mainFilter(d))
    if (cands.length === 0 && fallbackPool !== candidatePool) {
      cands = fallbackPool.filter(d => d.role === '主食' && mainFilter(d) && !recent.has(d.name))
    }
    if (cands.length === 0 && fallbackPool !== candidatePool) {
      cands = fallbackPool.filter(d => d.role === '主食' && mainFilter(d))
    }
    return weightedChoice(cands, scores, tagAff)
  }

  const main = pickMain(pool, dishes)
  if (!main) return { 主菜: null, 汤: null, 主食: null, 模式: '无', mode: 'none', isOneBowl: false, isCombo: false }

  if (isOneBowl(main)) {
    const m = Object.assign({}, main, { emoji: '🍜' })
    return { 主菜: null, 汤: null, 主食: m, 模式: '一碗一餐', mode: 'bowl', isOneBowl: true, isCombo: false }
  }

  const picked = new Set([main.name])
  const exclude = new Set([main.name])

  function pickRole(role) {
    let cands = pool.filter(d => d.role === role && !exclude.has(d.name) && !recent.has(d.name) && !picked.has(d.name))
    if (cands.length === 0) cands = pool.filter(d => d.role === role && !exclude.has(d.name) && !picked.has(d.name))
    if (cands.length === 0) cands = pool.filter(d => d.role === role && !picked.has(d.name))
    if (cands.length === 0 && pool !== dishes) {
      cands = dishes.filter(d => d.role === role && !exclude.has(d.name) && !recent.has(d.name) && !picked.has(d.name))
    }
    if (cands.length === 0 && pool !== dishes) cands = dishes.filter(d => d.role === role && !picked.has(d.name))
    if (cands.length === 0) cands = dishes.filter(d => d.role === role)
    const choice = weightedChoice(cands, scores, tagAff)
    if (choice) picked.add(choice.name)
    return choice
  }

  const parts = comboSize.split('-').map(Number)
  const numMains = parts.length >= 1 ? Math.max(1, Math.min(4, parts[0])) : 1

  const result = { 主食: Object.assign({}, main, { emoji: ROLE_EMOJI['主食'] }), 模式: '配菜模式', mode: 'combo', isOneBowl: false, isCombo: true }
  for (let i = 0; i < numMains; i++) {
    const key = i === 0 ? '主菜' : `主菜${i + 1}`
    const d = pickRole('主菜')
    if (d) result[key] = Object.assign({}, d, { emoji: ROLE_EMOJI[key] })
  }
  const soup = pickRole('汤')
  if (soup) result['汤'] = Object.assign({}, soup, { emoji: ROLE_EMOJI['汤'] })
  return result
}

function chooseThreeMeals(dishes, history, options) {
  const opts = options || {}
  const prefs = opts.prefs
  const scores = opts.scores || {}
  const window = opts.window || 7
  const comboSize = (prefs && prefs.comboSize) || '1-1-1'

  let pool = applyPrefs(dishes, prefs)
  if (pool.length === 0) pool = dishes.slice()

  const cutoff = new Date()
  cutoff.setDate(cutoff.getDate() - window)
  const recent = new Set(
    (history || [])
      .filter(h => {
        if (h.status === 'skipped') return false
        const d = parseDate(h.date)
        return d && d >= cutoff
      })
      .map(h => h.dish)
  )

  const tagAff = computeTagAffinities(scores, pool)

  // Phase 2.6: 南北餐偏好 — 强制午/晚主食类型
  const pattern = parseMealPattern((prefs && prefs.mealPattern) || 'any')
  const lunchMainPool = (pattern.lunch === 'any') ? pool : filterDishesByMainType(pool, pattern.lunch)
  const dinnerMainPool = (pattern.dinner === 'any') ? pool : filterDishesByMainType(pool, pattern.dinner)

  function pick(role, exclude) {
    let cands = pool.filter(d => d.role === role && !exclude.has(d.name) && !recent.has(d.name))
    if (cands.length === 0) cands = pool.filter(d => d.role === role && !recent.has(d.name))
    if (cands.length === 0) cands = pool.filter(d => d.role === role)
    if (cands.length === 0 && pool !== dishes) {
      cands = dishes.filter(d => d.role === role && !exclude.has(d.name) && !recent.has(d.name))
    }
    if (cands.length === 0) cands = dishes.filter(d => d.role === role)
    return weightedChoice(cands, scores, tagAff)
  }

  // 早餐
  let breakfast = null
  if (!prefs || !prefs.skipBreakfast) {
    const b = pick('早餐', new Set())
    if (b) breakfast = Object.assign({}, b, { emoji: ROLE_EMOJI['早餐'] })
  }

  const lunch = chooseOneMeal(lunchMainPool, history, { prefs, scores, window, comboSize })
  const lunchNames = new Set(Object.values(lunch).filter(v => v && v.name).map(v => v.name))

  const dinnerHistory = (history || []).slice().concat(
    Array.from(lunchNames).map(n => ({ dish: n, date: todayISO() }))
  )
  const mustBeRice = lunch.mode === 'bowl'
  const dinner = chooseOneMeal(dinnerMainPool, dinnerHistory, { prefs, scores, window, mustBeRice, comboSize })

  return { 早餐: breakfast, 午餐: lunch, 晚餐: dinner }
}

// ---------- 营养分类 ----------
function classifyNutrition(dish) {
  if (dish.nutrition && dish.nutrition.length > 0) return dish.nutrition.slice()
  const classes = []
  const joined = (dish.ingredients || []).join(' ')
  if (PROTEIN_KEYS.some(k => joined.includes(k))) classes.push('蛋白')
  if (CARB_KEYS.some(k => joined.includes(k))) classes.push('碳水')
  if (VEG_KEYS.some(k => joined.includes(k))) classes.push('蔬菜')
  return classes
}

// ===== Phase 2.6: 南北餐主食分类 =====
function isNoodleDish(dish) {
  if (!dish || !dish.name) return false
  return /面|饺子|拉面|刀削|刀切|烩面|扯面|拌面|馒头|花卷/.test(dish.name)
}

function isRiceDish(dish) {
  if (!dish || !dish.name) return false
  return /米|饭|粥/.test(dish.name)
}

function filterDishesByMainType(dishes, type) {
  if (type === 'noodle') return dishes.filter(d => isNoodleDish(d))
  if (type === 'rice') return dishes.filter(d => isRiceDish(d))
  return dishes.slice()  // 'any' or unknown → 原样
}

// 把 mealPattern 拆成 (lunchType, dinnerType)
function parseMealPattern(pattern) {
  switch (pattern) {
    case 'noodle-noodle': return { lunch: 'noodle', dinner: 'noodle' }
    case 'noodle-rice':   return { lunch: 'noodle', dinner: 'rice' }
    case 'rice-rice':     return { lunch: 'rice', dinner: 'rice' }
    default:               return { lunch: 'any', dinner: 'any' }
  }
}

module.exports = {
  DEFAULT_PREFS,
  ALLOWED_COMBO_SIZES,
  ALLOWED_N_PEOPLE,
  VALID_MEALS,
  DEFAULT_PROFILE,
  ACTIVITY_LABELS,
  GOAL_LABELS,
  CONDITION_LABELS,
  ALLERGY_LABELS,
  ACTIVITY_MULT,
  todayISO,
  daysAgoISO,
  applyPrefs,
  computeTagAffinities,
  weightedChoice,
  isVegetarian,
  chooseCombo,
  chooseOneMeal,
  chooseThreeMeals,
  filterByIngredients,
  searchDishes,
  classifyNutrition,
  estimateDishNutrition,
  calculateBMR,
  calculateTDEE,
  calculateTargets,
  aggregateDailyNutrition,
  nPeopleToComboSize,
  heavyDishQuota,
  // Phase 2.6:
  isNoodleDish,
  isRiceDish,
  filterDishesByMainType,
  parseMealPattern
}

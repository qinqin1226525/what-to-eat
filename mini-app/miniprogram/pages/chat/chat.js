// pages/chat/chat.js —— AI 饮食顾问聊天
const app = getApp()
const cloud = require('../../utils/cloud.js')
const algo = require('../../utils/algorithm.js')
const util = require('../../utils/util.js')

const QUICK_PROMPTS = [
  { icon: '🍳', text: '今天吃什么好？给我推荐 3 道家常菜' },
  { icon: '🥗', text: '我最近想减脂，晚餐怎么吃？' },
  { icon: '🛒', text: '我冰箱里有鸡蛋、番茄、青菜，能做什么？' },
  { icon: '📊', text: '我今天吃太多了吗？建议明早怎么吃' },
  { icon: '🍲', text: '教我做西红柿炒蛋，写步骤' },
  { icon: '⚠️', text: '高血压的人哪些菜要少吃？' }
]

let nextId = 0
const newId = () => `msg_${Date.now()}_${nextId++}`

Page({
  data: {
    messages: [],            // [{id, role, content, error?, loading?}]
    inputText: '',
    sending: false,
    quickPrompts: QUICK_PROMPTS,
    usage: { total: 0, calls: 0 }
  },

  onShow() {
    // 首次进入放个欢迎
    if (this.data.messages.length === 0) {
      this.setData({
        messages: [{
          id: newId(),
          role: 'ai',
          content: '你好！我是「三餐肆计」AI 饮食顾问。\n\n可以问我：\n· 推荐菜谱（基于你的口味/健康档案）\n· 解读今日营养是否合理\n· 教做菜（步骤详细）\n· 食材搭配 / 饮食禁忌\n\n试试下面的快捷问题，或直接输入！'
        }]
      })
    }
  },

  onInput(e) {
    this.setData({ inputText: e.detail.value })
  },

  onQuickPrompt(e) {
    const text = e.currentTarget.dataset.text
    this.setData({ inputText: text })
    this.sendMessage()
  },

  onSend() {
    if (!this.data.inputText.trim()) {
      wx.showToast({ title: '说点什么吧', icon: 'none' })
      return
    }
    this.sendMessage()
  },

  async sendMessage() {
    const text = this.data.inputText.trim()
    if (!text || this.data.sending) return

    // 用户消息
    const userMsg = { id: newId(), role: 'user', content: text }
    const loadingMsg = { id: newId(), role: 'ai', content: '', loading: true }

    this.setData({
      messages: [...this.data.messages, userMsg, loadingMsg],
      inputText: '',
      sending: true
    })

    // 滚到底部
    this.scrollToBottom()

    try {
      // 拼上下文（用户档案 + 今日饮食）
      const context = await this.buildContext()

      const res = await cloud.aiAdvisor({
        question: text,
        ...context
      })

      // 替换 loading 消息
      const msgs = this.data.messages.filter(m => !m.loading)
      if (res && res.ok) {
        msgs.push({
          id: newId(),
          role: 'ai',
          content: res.reply
        })
        this.setData({
          messages: msgs,
          sending: false,
          usage: {
            total: (this.data.usage.total || 0) + (res.usage?.total_tokens || 0),
            calls: (this.data.usage.calls || 0) + 1
          }
        })
      } else {
        const errMsg = (res && res.error) || '未知错误'
        if (res && res.rateLimited) {
          // 限流特殊提示
          msgs.push({
            id: newId(),
            role: 'ai',
            content: `⏰ 今日 AI 额度已用完\n\n${errMsg}\n\n明天 0 点重置，请明天再来！`,
            error: true
          })
        } else {
          msgs.push({
            id: newId(),
            role: 'ai',
            content: `😅 调用失败：${errMsg}\n\n请检查云函数 aiAdvisor 的环境变量 API_KEY 是否已设置`,
            error: true
          })
        }
        this.setData({ messages: msgs, sending: false })
      }
    } catch (err) {
      const msgs = this.data.messages.filter(m => !m.loading)
      msgs.push({
        id: newId(),
        role: 'ai',
        content: `😅 出错了：${err.message || err}`,
        error: true
      })
      this.setData({ messages: msgs, sending: false })
    }

    this.scrollToBottom()
  },

  async buildContext() {
    const profile = app.globalData.profile || {}
    const targets = algo.calculateTargets(profile)

    // 今日吃了啥
    let todayMeals = []
    let todayTotals = { calories: 0, protein: 0, carbs: 0, fat: 0, sodium: 0 }
    try {
      const res = await cloud.getHistory(50)
      const history = (res && res.ok) ? res.history : []
      const today = algo.todayISO()
      todayMeals = history.filter(h => h.date === today && h.status !== 'skipped')
      const dishes = app.globalData.dishes || []
      todayTotals = algo.aggregateDailyNutrition(todayMeals, dishes)
    } catch (e) {
      console.warn('加载今日饮食失败', e)
    }

    return { profile, todayMeals, todayTotals, targets }
  },

  scrollToBottom() {
    setTimeout(() => {
      wx.pageScrollTo({ scrollTop: 99999, duration: 200 })
    }, 100)
  },

  onClear() {
    const that = this
    wx.showModal({
      title: '清空对话？',
      content: '当前对话会清空，重新开始',
      success: (res) => {
        if (res.confirm) {
          that.setData({ messages: [], inputText: '', usage: { total: 0, calls: 0 } })
          that.onShow()
        }
      }
    })
  }
})
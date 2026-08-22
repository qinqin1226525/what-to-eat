// app.js —— 小程序全局入口
const cloud = require('./utils/cloud.js')

App({
  globalData: {
    openid: '',
    userInfo: null,
    // 缓存的菜谱（启动时拉一次，避免每页重复请求）
    dishes: [],
    // 当前用户偏好（启动时拉一次）
    prefs: null,
    scores: null,
    profile: null,    // Phase 2: 健康档案
    targets: null,    // Phase 2: 推荐摄入
    cloudReady: false,
    // 已引导过的新功能（用 App 实例缓存，V2 可改 wx.storage）
    guidedFeatures: {
      budgetTime: false,
      scenario: false,
    },
  },

  onLaunch() {
    if (!wx.cloud) {
      console.error('请使用 2.2.3 或以上的基础库以使用云能力')
    } else {
      wx.cloud.init({
        // env: 'cloudbase-d2gjh4dyic3f985cc',  // 留空走默认环境（开发者工具已选）
        traceUser: true
      })
      this.globalData.cloudReady = true
    }

    // 1. 拿 openid
    this.fetchOpenid()

    // 2. 拉菜谱（后台跑，不阻塞 UI）
    this.loadDishes()

    // 3. 拉用户偏好
    this.loadPrefs()
  },

  fetchOpenid() {
    const that = this
    return wx.cloud.callFunction({
      name: 'login',
      data: {}
    }).then(res => {
      that.globalData.openid = res.result.openid
      console.log('openid:', res.result.openid)
    }).catch(err => {
      console.error('login 失败:', err)
      wx.showToast({ title: '登录失败', icon: 'none' })
    })
  },

  loadDishes() {
    const that = this
    return wx.cloud.callFunction({
      name: 'getDishes',
      data: {}
    }).then(res => {
      if (res.result && res.result.ok && res.result.dishes) {
        that.globalData.dishes = res.result.dishes
        console.log(`载入 ${res.result.dishes.length} 道菜`)
      } else {
        // 降级：用本地打包的（cloud 还没 seed 时）
        const local = require('./utils/dishes-data.js')
        that.globalData.dishes = local
        console.log('使用本地菜谱（云端未 seed）')
      }
    }).catch(err => {
      console.warn('拉菜谱失败，用本地数据:', err)
      const local = require('./utils/dishes-data.js')
      that.globalData.dishes = local
    })
  },

  loadPrefs() {
    const that = this
    return wx.cloud.callFunction({
      name: 'getPrefs',
      data: {}
    }).then(res => {
      if (res.result && res.result.ok) {
        that.globalData.prefs = res.result.prefs || {}
        that.globalData.scores = res.result.scores || {}
        that.globalData.profile = res.result.profile || {}
      }
    }).catch(err => {
      console.warn('拉偏好失败:', err)
      that.globalData.prefs = {}
      that.globalData.scores = {}
      that.globalData.profile = {}
    })
  },

  // 切到前台时刷新偏好（防止多设备改了不同步）
  onShow() {
    if (this.globalData.cloudReady) {
      this.loadPrefs()
    }
  }
})
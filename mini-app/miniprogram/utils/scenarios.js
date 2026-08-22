// utils/scenarios.js —— 场景选菜预设
// 用户按"今晚什么场合"挑场景，算法按 cuisines + maxTime + nPeople 过滤推荐菜。
// 月子餐暂未做（数据稀疏，仅 1 道「下奶」菜）；后续补菜后可加。

module.exports = [
  {
    id: 'late-night',
    name: '深夜食堂',
    emoji: '🌙',
    desc: '治愈深夜饿',
    cuisines: ['快手', '暖身', '夜宵', '下酒', '下饭'],
    maxTime: 20,
    single: true,  // 只推 1 道
  },
  {
    id: 'date',
    name: '二人世界',
    emoji: '🍷',
    desc: '为 TA 做顿好的',
    cuisines: ['待客', '好看', '养颜', '家常'],
    excludeCuisines: ['辣', '麻辣'],
    single: true,
  },
  {
    id: 'family',
    name: '一家三口',
    emoji: '👨‍👩‍👧',
    desc: '家常好吃孩子爱',
    cuisines: ['家常', '简单', '小孩爱'],
    excludeCuisines: ['辣'],
    nPeople: 3,
  },
  {
    id: 'party',
    name: '朋友聚会',
    emoji: '🎉',
    desc: '硬菜撑场面',
    cuisines: ['聚餐', '硬菜', '待客', '节日'],
    nPeople: 4,
    comboSize: '3-1',
  },
  {
    id: 'diet',
    name: '减脂轻食',
    emoji: '🥗',
    desc: '低卡不怕胖',
    cuisines: ['健康', '清淡', '素食', '养胃'],
    excludeCuisines: ['硬菜'],
    single: true,
  },
  {
    id: 'muscle',
    name: '增肌加餐',
    emoji: '💪',
    desc: '高蛋白补充',
    cuisines: ['营养', '健康'],
    excludeCuisines: ['素食'],
    maxTime: 30,
    single: true,
  },
]
// 复制这段到 Console → 回车
wx.cloud.database().collection('dishes').where({name: '西红柿炒蛋'}).get().then(res => {
  const d = res.data[0];
  if (!d) {
    console.log('❌ 云数据库里没有这道菜');
    return;
  }
  console.log('=== 西红柿炒蛋 实际数据 ===');
  console.log('所有字段:', Object.keys(d));
  console.log('seasonings:', d.seasonings);
  console.log('steps:', d.steps);
  console.log('tip:', d.tip);
  console.log('steps 是空数组?', Array.isArray(d.steps) && d.steps.length === 0);
  console.log('有 steps 字段?', 'steps' in d);
});
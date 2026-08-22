// 在小程序 Console 里跑的诊断代码
// 复制下面这段 → 粘到微信开发者工具的 Console → 回车

wx.cloud.callFunction({ name: 'getDishes' }).then(res => {
  console.log('=== 云数据库里 西红柿炒蛋 的实际内容 ===');
  const dish = res.result.dishes.find(d => d.name === '西红柿炒蛋');
  if (!dish) {
    console.log('❌ 云数据库里没有这道菜！');
    return;
  }
  console.log('name:', dish.name);
  console.log('seasonings:', dish.seasonings);
  console.log('steps:', dish.steps);
  console.log('tip:', dish.tip);
  console.log('所有字段:', Object.keys(dish));
  console.log('总菜数:', res.result.dishes.length);
});
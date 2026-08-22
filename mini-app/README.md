# 今天吃什么 · 小程序

> 公开微信小程序 —— 饮食健康记录 + 饮食顾问
> 移植自 [what-to-eat 仓库根目录的网页版](../) （个人工具 → 多用户小程序）

## 🚀 Phase 1：基础移植（当前版本 v0.1.0）

把网页版的"选菜"核心功能移植到微信小程序，加上：
- ✅ 微信账号自动登录（基于 OpenID，无需账号密码）
- ✅ 多设备同步（数据上云）
- ✅ 117 道菜 + 完整选菜算法（一顿 / 一日三餐 / 冰箱有什么 / 搜菜谱）
- ✅ 历史记录（按日期分组，可删除）
- ✅ 冰箱管理
- ✅ 偏好设置（菜系 / 辣度 / 忌口 / 时间上限 / 套餐份量）

**未做（留给后续 Phase）：**
- 健康画像（年龄/体重/目标）→ Phase 2
- 营养雷达图/趋势线 → Phase 3
- AI 饮食顾问 → Phase 4

## 📋 一次性配置

### 1. 装工具
- 下载 **微信开发者工具**：https://developers.weixin.qq.com/miniprogram/dev/devtools/download.html
- Mac 选 `arm64`（Apple Silicon）或 `x64`（Intel）

### 2. 导入项目
- 打开开发者工具 → 「导入项目」
- 选择目录：`mini-app/`（含 `project.config.json` 的那个）
- AppID：会自动用 `wx735b1e6a01377607`（已在 project.config.json 写好）
- 点击「导入」

### 3. 开通云开发
- 工具栏点「云开发」按钮
- 用创建者的微信扫码
- 选**免费配额**
- 创建环境（环境名随便起，例如 `prod-1`）
- 创建完会显示**环境 ID**（无需填代码，工具会自动选当前环境）

### 4. 上传云函数
- 在 `cloudfunctions/` 目录上**右键 → 上传并部署：云端安装依赖（不上传 node_modules）**
- 对 10 个函数**逐个**右键上传（或全选一起）
- 等每个显示「上传成功」

### 5. Seed 菜谱到云数据库
- 在开发者工具里点「编译」运行小程序
- 进「我的」页 → 拉到「开发者工具」卡片 → 点「**重新上传菜谱到云端**」
- 看到「已上传 117 道菜」就成功

### 6. 配置数据库权限（重要！只在第一次做）
打开云开发控制台 → 数据库：

| 集合 | 权限 |
|---|---|
| `dishes` | **仅创建者及管理员可读写**（admin 才能 seed） |
| `meals` | **仅创建者可读写**（每个用户看自己的） |
| `user_fridges` | **仅创建者可读写** |
| `user_prefs` | **仅创建者可读写** |

如何设：
1. 点对应集合 → 「权限设置」标签
2. 选「仅创建者可读写」
3. 保存

> ⚠️ **dishes 集合必须选"仅创建者及管理员可读写"**，否则 seedDishes 函数会因为没人能写而失败。

### 7. 加 tabBar 图标（可选）
当前 `app.json` 的 `iconPath` 引用 `images/tab-*.png`，本地没文件会报错。

两个选项：
- **简单方案**：删除 `app.json` 里所有 `iconPath`/`selectedIconPath` 行（图标消失但 tab 还能用）
- **正式方案**：自己找 8 张 PNG 图标放到 `miniprogram/images/`，文件名对应 `tab-home.png` 等

## 📁 目录结构

```
mini-app/
├── miniprogram/                # 小程序前端
│   ├── app.{js,json,wxss}
│   ├── sitemap.json
│   ├── pages/
│   │   ├── index/             # 选菜主页
│   │   ├── history/           # 历史
│   │   ├── fridge/            # 冰箱
│   │   └── profile/           # 我的/偏好
│   └── utils/
│       ├── algorithm.js       # 移植自 what_to_eat.py
│       ├── dishes-data.js     # 117 道菜（打包用，云端未 seed 时降级）
│       ├── cloud.js           # 云函数调用封装
│       └── util.js
├── cloudfunctions/             # 云函数（10 个）
│   ├── login/                 # 获取 openid
│   ├── seedDishes/            # 上传 dishes.json
│   ├── getDishes/             # 拉菜谱
│   ├── addMeal/               # 加餐食
│   ├── getHistory/            # 拉历史
│   ├── deleteMeal/            # 删记录
│   ├── updateFridge/          # 更新冰箱
│   ├── getFridge/             # 拉冰箱
│   ├── savePrefs/             # 保存偏好
│   └── getPrefs/              # 拉偏好
└── project.config.json
```

## 🧪 调试技巧

- **网络问题**：调试器 → Network 看云函数调用是否成功
- **权限问题**：云开发控制台 → 云函数 → 日志，看具体报错
- **数据问题**：云开发控制台 → 数据库 → 直接看集合内容

## 💾 数据模型速查

| 集合 | 字段 | 备注 |
|---|---|---|
| `dishes` | name, time_minutes, role, tags, ingredients, nutrition? | 全局共享，只读 |
| `meals` | _openid(自动), dish, meal, status, date, createdAt | 每条记录 |
| `user_fridges` | _openid, items[], updatedAt | 1 用户 1 文档 |
| `user_prefs` | _openid, prefs{}, scores{}, updatedAt | 1 用户 1 文档 |

## 📜 License

个人项目，仅供学习使用
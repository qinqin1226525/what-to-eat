#!/usr/bin/env python3
"""tools/bulk_add_dishes.py —— 批量加 10 道经典家常菜到 dishes.json

为什么需要：
    用户请求"单独行动加一点没有的家常菜"。add_dish.py 只支持基础字段，
    不能加 seasonings/steps/tip。本脚本直接读 JSON 写完整 9 字段。

用法：
    python3 tools/bulk_add_dishes.py

完成后必须：
    python3 tools/safety_check.py --quick      # 8/8 全过
    python3 tools/seed_export.py                # 同步到 seedDishes
    python3 tools/regen_dishes_data.py          # 同步到 dishes-data.js
"""
import json
import sys
from pathlib import Path

PROJECT_DIR = Path(__file__).parent.parent
DISHES_JSON = PROJECT_DIR / "dishes.json"

# 10 道家常菜（不含已存在的「洋葱炒蛋」）
NEW_DISHES = [
    {
        "name": "糖醋排骨",
        "time_minutes": 45,
        "role": "主菜",
        "tags": ["硬菜", "待客", "酸甜", "下饭", "家常"],
        "ingredients": ["排骨 500g", "醋", "糖", "生抽", "料酒"],
        "nutrition": ["蛋白", "碳水"],
        "seasonings": ["醋", "糖", "生抽", "料酒", "盐", "油", "葱", "姜"],
        "steps": [
            "排骨冷水下锅+料酒+姜片焯水 5 分钟去血沫",
            "捞出沥干，热锅冷油+糖小火炒至焦黄",
            "下排骨翻炒上色",
            "加生抽、料酒、葱姜、热水没过排骨",
            "大火烧开转小火炖 30 分钟",
            "开盖大火收汁，沿锅边淋醋翻匀",
        ],
        "tip": "糖醋比例 1:1 是基础，按口味微调；最后淋醋保留酸味。"
    },
    {
        "name": "土豆炖牛肉",
        "time_minutes": 60,
        "role": "主菜",
        "tags": ["硬菜", "下饭", "慢炖", "家常", "待客"],
        "ingredients": ["牛腩 500g", "土豆 2 个", "胡萝卜 1 根", "洋葱"],
        "nutrition": ["蛋白", "碳水"],
        "seasonings": ["葱", "姜", "蒜", "八角", "桂皮", "生抽", "老抽", "料酒", "盐"],
        "steps": [
            "牛腩冷水下锅+料酒+姜片焯水 5 分钟",
            "土豆、胡萝卜、洋葱切滚刀块",
            "热油爆香葱姜蒜、八角、桂皮",
            "下牛腩翻炒，加生抽、老抽、料酒上色",
            "加热水没过牛腩，大火烧开转小火炖 40 分钟",
            "下土豆、胡萝卜、洋葱继续炖 15 分钟",
            "加盐调味",
        ],
        "tip": "选牛腩带点肥才香；土豆不要下太早否则炖烂。"
    },
    {
        "name": "青椒土豆丝",
        "time_minutes": 15,
        "role": "主菜",
        "tags": ["家常", "快手", "简单", "下饭", "酸辣"],
        "ingredients": ["土豆 1 个", "青椒 1 个", "干辣椒"],
        "nutrition": ["碳水"],
        "seasonings": ["醋", "生抽", "盐", "葱", "蒜", "油"],
        "steps": [
            "土豆去皮切细丝，青椒切丝",
            "土豆丝泡水 5 分钟去淀粉沥干",
            "热油爆干辣椒、葱蒜",
            "下土豆丝大火快炒",
            "下青椒丝，加醋、生抽、盐翻匀",
        ],
        "tip": "土豆丝泡水去淀粉更脆；大火快炒保持脆感。"
    },
    {
        "name": "蒜蓉空心菜",
        "time_minutes": 10,
        "role": "主菜",
        "tags": ["素食", "快手", "清淡", "简单"],
        "ingredients": ["空心菜 1 把", "大蒜 4 瓣"],
        "nutrition": ["碳水"],
        "seasonings": ["盐", "油"],
        "steps": [
            "空心菜洗净切段（梗叶分开）",
            "蒜切末",
            "热油爆香蒜末",
            "先下空心菜梗炒 1 分钟",
            "下空心菜叶大火快炒 30 秒",
            "加盐翻匀出锅",
        ],
        "tip": "大火快炒保持翠绿；蒜末量要多才香。"
    },
    {
        "name": "蚝油杏鲍菇",
        "time_minutes": 15,
        "role": "主菜",
        "tags": ["素食", "清淡", "简单", "快手"],
        "ingredients": ["杏鲍菇 2 个", "青椒 1 个"],
        "nutrition": ["蛋白"],
        "seasonings": ["蚝油", "生抽", "盐", "糖", "蒜", "油"],
        "steps": [
            "杏鲍菇切滚刀块，青椒切块",
            "热油爆香蒜末",
            "下杏鲍菇中火煸出香味（边角微焦）",
            "下青椒块，加蚝油、生抽、糖、盐翻匀",
        ],
        "tip": "杏鲍菇煸出焦香更美味；蚝油提鲜不要省。"
    },
    {
        "name": "蒜苗炒肉",
        "time_minutes": 15,
        "role": "主菜",
        "tags": ["家常", "下饭", "川菜", "快手"],
        "ingredients": ["蒜苗 1 把", "五花肉 150g"],
        "nutrition": ["蛋白"],
        "seasonings": ["生抽", "料酒", "盐", "豆豉", "油"],
        "steps": [
            "五花肉切薄片，蒜苗切段（梗叶分开）",
            "肉片用料酒+少许生抽腌 5 分钟",
            "热锅不放油先下肉片煸出油",
            "下豆豉爆香",
            "先下蒜苗梗炒 1 分钟，再下蒜苗叶",
            "加生抽、盐大火翻匀",
        ],
        "tip": "蒜苗大火快炒保持脆甜；煸肉出油是香味关键。"
    },
    {
        "name": "凉拌三丝",
        "time_minutes": 10,
        "role": "凉菜",
        "tags": ["简单", "快手", "开胃", "下酒"],
        "ingredients": ["黄瓜 1 根", "胡萝卜 半根", "海带丝"],
        "nutrition": ["碳水"],
        "seasonings": ["醋", "生抽", "香油", "蒜", "盐", "糖"],
        "steps": [
            "黄瓜、胡萝卜切细丝",
            "海带丝沸水焯 1 分钟过凉水",
            "三丝拌加",
            "调汁：蒜末+醋+生抽+香油+盐+糖",
            "浇上拌匀静置 5 分钟",
        ],
        "tip": "三丝颜色搭配好看；糖提鲜不可省。"
    },
    {
        "name": "凉拌豆腐",
        "time_minutes": 8,
        "role": "凉菜",
        "tags": ["素食", "快手", "简单", "清淡"],
        "ingredients": ["内酯豆腐 1 盒", "皮蛋 1 个"],
        "nutrition": ["蛋白"],
        "seasonings": ["生抽", "香醋", "香油", "葱", "蒜"],
        "steps": [
            "豆腐倒扣盘里切厚片",
            "皮蛋剥壳切瓣摆豆腐上",
            "撒葱花、蒜末",
            "淋生抽+香醋+香油",
            "静置 3 分钟入味",
        ],
        "tip": "用内酯豆腐嫩滑；皮蛋溏心的更好看。"
    },
    {
        "name": "山药排骨汤",
        "time_minutes": 60,
        "role": "汤",
        "tags": ["慢炖", "清淡", "营养", "家常"],
        "ingredients": ["排骨 500g", "山药 1 根", "胡萝卜 1 根"],
        "nutrition": ["蛋白"],
        "seasonings": ["葱", "姜", "料酒", "盐", "胡椒粉"],
        "steps": [
            "排骨冷水下锅+料酒+姜片焯水 5 分钟",
            "山药、胡萝卜去皮切滚刀块",
            "砂锅加水放排骨、葱姜、料酒",
            "大火烧开转小火炖 40 分钟",
            "下山药、胡萝卜再炖 15 分钟",
            "加盐、胡椒粉调味",
        ],
        "tip": "山药黏液会让汤变稠，炖出来奶白；不要加八角等香料抢味。"
    },
    {
        "name": "馄饨",
        "time_minutes": 30,
        "role": "主食",
        "tags": ["面食", "快手", "简单", "家常"],
        "ingredients": ["馄饨皮", "猪肉馅 150g", "葱", "姜", "紫菜"],
        "nutrition": ["蛋白", "碳水"],
        "seasonings": ["生抽", "香油", "盐", "胡椒粉", "虾皮"],
        "steps": [
            "猪肉馅加葱姜末+生抽+盐拌匀",
            "取馄饨皮包馅捏成元宝状",
            "碗底放紫菜、虾皮、胡椒粉、生抽、香油",
            "水烧开下馄饨煮 3 分钟至浮起",
            "连汤盛入碗中",
        ],
        "tip": "肉馅打水更嫩；一次多包点冷冻随煮随吃。"
    },
]


def main():
    # 加载现有 dishes
    data = json.loads(DISHES_JSON.read_text(encoding="utf-8"))
    existing_names = {d["name"] for d in data}
    print(f"📖 dishes.json: {len(data)} 道菜")

    # 过滤已存在的菜
    to_add = [d for d in NEW_DISHES if d["name"] not in existing_names]
    skipped = [d["name"] for d in NEW_DISHES if d["name"] in existing_names]
    if skipped:
        print(f"⚠️ 跳过已存在: {skipped}")
    print(f"➕ 准备新增: {len(to_add)} 道菜")

    if not to_add:
        print("✅ 无需新增")
        return

    # 验证 9 字段齐全
    REQUIRED = ["name", "time_minutes", "role", "tags", "ingredients",
                "seasonings", "steps", "tip"]
    for d in to_add:
        missing = [f for f in REQUIRED if f not in d]
        if missing:
            print(f"❌ {d['name']} 缺字段: {missing}")
            sys.exit(1)
        if d["role"] not in ("主菜", "汤", "主食", "凉菜", "早餐"):
            print(f"❌ {d['name']} role 不合法: {d['role']}")
            sys.exit(1)

    # 追加
    data.extend(to_add)
    DISHES_JSON.write_text(
        json.dumps(data, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    print(f"✅ 已写入 {DISHES_JSON.relative_to(PROJECT_DIR)}")
    print(f"📊 现总: {len(data)} 道菜")


if __name__ == "__main__":
    main()
"""今天吃什么 - 项目核心逻辑

功能列表：
- 加载菜谱（dishes.json）
- 加载/保存历史（~/.what-to-eat/history.json）
- 按时间筛选
- 按食材筛选（冰箱有什么 → 能做什么）
- 随机抽取一道菜
- 30 天不重复抽取
- 主菜+汤+主食 套餐搭配
"""

import json
import random
import sys
from datetime import date, timedelta
from pathlib import Path


# 文件路径
DISHES_FILE = Path(__file__).parent / "dishes.json"
DATA_DIR = Path.home() / ".what-to-eat"
HISTORY_FILE = DATA_DIR / "history.json"


class Dish:
    """一道菜：菜名 + 耗时 + 角色 + 标签 + 食材"""

    def __init__(self, name, time_minutes, role="主菜", tags=None, ingredients=None, nutrition=None):
        self.name = name
        self.time_minutes = time_minutes
        self.role = role
        self.tags = tags or []
        self.ingredients = ingredients or []
        self.nutrition = nutrition or []

    def __repr__(self):
        return f"Dish({self.name!r}, {self.time_minutes}min, {self.role})"

    def missing_ingredients(self, available):
        """返回这道菜还缺哪些食材（available 里没有的）"""
        available_set = set(available)
        return [i for i in self.ingredients if i not in available_set]


# ---------- 加载 / 保存 ----------

def load_dishes(path=DISHES_FILE):
    """从 JSON 加载菜谱列表。
    只把 Dish 认识的字段传过去，其余（seasonings/steps/tip 等）忽略。"""
    allowed = {"name", "time_minutes", "role", "tags", "ingredients", "nutrition"}
    with open(path, encoding="utf-8") as f:
        data = json.load(f)
    return [Dish(**{k: v for k, v in d.items() if k in allowed}) for d in data]


def load_history(path=HISTORY_FILE):
    """从 JSON 加载历史记录，没有就返回空列表"""
    if not Path(path).exists():
        return []
    with open(path, encoding="utf-8") as f:
        return json.load(f)


def save_history(history, path=HISTORY_FILE):
    """保存历史记录到 JSON"""
    Path(path).parent.mkdir(parents=True, exist_ok=True)
    with open(path, "w", encoding="utf-8") as f:
        json.dump(history, f, ensure_ascii=False, indent=2)


def add_to_history(history, dish_name):
    """把今天吃过的菜加进历史"""
    history.append({"dish": dish_name, "date": str(date.today())})
    return history


# ---------- 核心算法 ----------

def choose_one(dishes):
    """从 dish 列表里随机抽一个返回"""
    return random.choice(dishes)


def filter_by_max_time(dishes, max_minutes):
    """只返回耗时 ≤ max_minutes 的菜"""
    return [d for d in dishes if d.time_minutes <= max_minutes]


def filter_by_ingredients(dishes, available_ingredients):
    """返回至少有一种食材在 available_ingredients 里的菜"""
    if not available_ingredients:
        return []
    available_set = set(available_ingredients)
    return [d for d in dishes if any(ing in available_set for ing in d.ingredients)]


def choose_one_no_repeat(dishes, history, window=30):
    """从历史记录里最近 window 天没吃过的菜中随机抽一个"""
    recent = {h["dish"] for h in history[-window:]}
    available = [d for d in dishes if d.name not in recent]
    if not available:
        # 所有菜都在最近 window 天吃过 -> 退而求其次，允许重复
        available = list(dishes)
    return random.choice(available)


def choose_combo(dishes, history=None, window=30, prefs=None):
    """选一套：主菜 + 汤 + 主食（30 天不重复）。

    prefs=None 或 {} 时不过滤（向后兼容）。
    过滤后空则回退到原列表，避免卡死。
    """
    history = history or []
    pool = apply_prefs(dishes, prefs)
    if not pool:
        pool = dishes  # 兜底

    recent = {h["dish"] for h in history[-window:]}

    def pick(role):
        # 1. 在过滤池里找
        candidates = [d for d in pool if d.role == role and d.name not in recent]
        if not candidates:
            # 2. 放松 recent 窗口
            candidates = [d for d in pool if d.role == role]
        if not candidates and pool is not dishes:
            # 3. 池子里没有这个 role（菜系过滤掉了），回退到全部
            candidates = [d for d in dishes if d.role == role and d.name not in recent]
        if not candidates:
            candidates = [d for d in dishes if d.role == role]
        return random.choice(candidates) if candidates else None

    return {
        "主菜": pick("主菜"),
        "汤": pick("汤"),
        "主食": pick("主食"),
    }


# 儿童餐筛选：排除辣味，且至少有儿童友好标签
SPICY_TAGS = {"辣", "微辣", "麻辣"}
KID_FRIENDLY_TAGS = {"小孩爱", "甜口", "酸甜", "清淡", "基础", "面食", "快手"}

# 忌口子串规则（用于 apply_prefs）
SEAFOOD_KEYS = ["鱼", "虾", "蟹", "紫菜", "海带", "扇贝", "蛤", "牡蛎", "鱿鱼"]
OFFAL_KEYS   = ["肥肠", "猪肚", "肝", "腰", "心", "肚"]


def filter_kid_friendly(dishes):
    """返回适合儿童吃的菜：不含辣味，且至少一个儿童友好标签"""
    result = []
    for d in dishes:
        has_spicy = any(any(s in t for s in SPICY_TAGS) for t in d.tags)
        has_friendly = any(t in KID_FRIENDLY_TAGS for t in d.tags)
        if has_friendly and not has_spicy:
            result.append(d)
    return result


def choose_kid_combo(dishes, history=None, window=30, prefs=None):
    """选一套儿童餐"""
    kid_dishes = filter_kid_friendly(dishes)
    return choose_combo(kid_dishes, history, window, prefs=prefs)


# ---------- 三餐规划 / 营养分类（占位，待完善） ----------

def _parse_date(date_str):
    """解析日期字符串为 date 对象"""
    if isinstance(date_str, date):
        return date_str
    if not date_str:
        return None
    try:
        return date.fromisoformat(str(date_str))
    except (ValueError, TypeError):
        return None


def choose_three_meals(dishes, history=None, window=30):
    """选一日三餐（早/午/晚）—— 当前为简化版"""
    history = history or []
    recent = {h["dish"] for h in history[-window:]}

    def pick(role):
        candidates = [d for d in dishes if d.role == role and d.name not in recent]
        if not candidates:
            candidates = [d for d in dishes if d.role == role]
        return random.choice(candidates) if candidates else None

    return {
        "早餐": pick("主食"),
        "午餐": pick("主菜"),
        "晚餐": pick("主菜"),
    }


def classify_nutrition(dishes):
    """按营养分类（荤/素/汤）"""
    return {
        "荤菜": [d for d in dishes if any(t in d.tags for t in ["荤", "肉", "鱼", "鸡"])],
        "素菜": [d for d in dishes if "素食" in d.tags],
        "汤品": [d for d in dishes if d.role == "汤"],
    }


def format_three_meals(meals):
    """格式化三餐输出"""
    lines = ["=" * 40]
    lines.append(f"  🍽️ 一日三餐 —— {date.today()}")
    lines.append("=" * 40)
    for meal, dish in meals.items():
        if dish:
            lines.append(f"  {meal}：{dish.name}（约 {dish.time_minutes} 分钟）")
        else:
            lines.append(f"  {meal}：（暂无）")
    lines.append("=" * 40)
    return "\n".join(lines)


# ---------- Day 10：偏好设置 ----------


DEFAULT_PREFS = {
    "cuisines": [],         # [] = 不限；['川菜'] = 只要川菜
    "spicy": "any",         # 'any' | 'none' | 'mild'
    "noNumb": False,        # 不要麻辣
    "avoid": {              # 忌口
        "seafood": False, "offal": False, "cilantro": False,
        "beef": False, "lamb": False, "centuryEgg": False,
    },
    "maxTime": 0,           # 0 = 不限；30 / 60
    "vegetarian": False,    # 只要素食
    "noCold": False,        # 不要凉菜
    "skipBreakfast": False, # 三餐模式跳过早餐
}


def apply_prefs(dishes, prefs=None):
    """按用户偏好过滤菜谱；空/None 偏好 = 不过滤。
    返回新列表（不修改输入）。"""
    prefs = prefs or {}
    result = list(dishes)

    # 1. 菜系
    cuisines = prefs.get("cuisines") or []
    if cuisines:
        result = [d for d in result if any(c in d.tags for c in cuisines)]

    # 2. 辣度
    spicy = prefs.get("spicy", "any")
    if spicy == "none":
        result = [d for d in result if not any(any(s in t for s in SPICY_TAGS) for t in d.tags)]
    elif spicy == "mild":
        result = [d for d in result if not any(t in ("辣", "麻辣") for t in d.tags)]

    # 3. 不要麻辣
    if prefs.get("noNumb"):
        result = [d for d in result if not any("麻辣" in t for t in d.tags)]

    # 4. 忌口
    avoid = prefs.get("avoid") or {}
    def _has_ingredient(d, keys):
        return any(any(k in ing for k in keys) for ing in (d.ingredients or []))
    if avoid.get("seafood"):
        result = [d for d in result if not _has_ingredient(d, SEAFOOD_KEYS)]
    if avoid.get("offal"):
        result = [d for d in result if not _has_ingredient(d, OFFAL_KEYS)]
    if avoid.get("cilantro"):
        result = [d for d in result if not any("香菜" in ing for ing in (d.ingredients or []))]
    if avoid.get("beef"):
        result = [d for d in result if not any("牛" in ing for ing in (d.ingredients or []))]
    if avoid.get("lamb"):
        result = [d for d in result if not any("羊" in ing for ing in (d.ingredients or []))]
    if avoid.get("centuryEgg"):
        result = [d for d in result if not any("皮蛋" in ing for ing in (d.ingredients or []))]

    # 5. 时间
    max_time = prefs.get("maxTime", 0)
    if max_time:
        result = [d for d in result if d.time_minutes <= max_time]

    # 6. 素食
    if prefs.get("vegetarian"):
        result = [d for d in result if "素食" in d.tags]

    # 7. 不要凉菜
    if prefs.get("noCold"):
        result = [d for d in result if d.role != "凉菜"]

    return result


# ---------- Day 8：一日三餐 + 营养均衡 ----------


def _parse_date(s):
    """安全解析历史记录里的日期；解析失败回退到 date.min（视为"很早"，会被 recent 排除）"""
    try:
        return date.fromisoformat(s)
    except (ValueError, TypeError):
        return date.min


# 营养分类的子串回退规则（用于未显式写 nutrition 的旧菜）
PROTEIN_KEYS = ["鸡", "鸭", "鹅", "猪", "牛", "羊", "鱼", "虾", "蟹", "蛋", "豆腐", "豆浆", "牛奶", "奶酪"]
CARB_KEYS    = ["米", "面", "馒头", "饺子", "包子", "土豆", "红薯", "玉米", "燕麦", "饼", "年糕", "糯米", "面包"]
VEG_KEYS     = ["青", "芹", "白菜", "菜", "萝卜", "木耳", "菇", "海带", "茄", "黄瓜", "豆", "菠", "韭菜"]


def classify_nutrition(dish):
    """返回菜涵盖的营养类别（['蛋白', '碳水', '蔬菜'] 的子集）。
    优先用 dish.nutrition；未填写则用食材子串回退。"""
    if dish.nutrition:
        return list(dish.nutrition)
    classes = []
    joined = " ".join(dish.ingredients or [])
    if any(k in joined for k in PROTEIN_KEYS):
        classes.append("蛋白")
    if any(k in joined for k in CARB_KEYS):
        classes.append("碳水")
    if any(k in joined for k in VEG_KEYS):
        classes.append("蔬菜")
    return classes


def choose_three_meals(dishes, history=None, window=7, prefs=None):
    """一日三餐：早+午（主菜+主食+凉菜+汤）+晚（主菜+主食+凉菜）。
    window 按自然日计（默认 7 天），三餐不共享同一道菜。
    prefs=None 或 {} 不过滤；过滤后空则回退到原列表。"""
    history = history or []
    pool = apply_prefs(dishes, prefs)
    if not pool:
        pool = dishes

    today = date.today()
    cutoff = today - timedelta(days=window)
    recent = {h["dish"] for h in history if _parse_date(h.get("date")) >= cutoff}

    def pick(role, exclude):
        candidates = [
            d for d in pool
            if d.role == role
            and d.name not in exclude
            and d.name not in recent
        ]
        if not candidates:
            # 兜底：放松 exclude（保留 recent 窗口）
            candidates = [d for d in pool if d.role == role and d.name not in recent]
        if not candidates:
            # 兜底：忽略 recent
            candidates = [d for d in pool if d.role == role]
        if not candidates and pool is not dishes:
            # 池子里没这个 role → 回退到全部
            candidates = [
                d for d in dishes
                if d.role == role
                and d.name not in exclude
                and d.name not in recent
            ]
        if not candidates:
            candidates = [d for d in dishes if d.role == role]
        return random.choice(candidates) if candidates else None

    # skipBreakfast 偏好：跳过早餐
    if prefs and prefs.get("skipBreakfast"):
        breakfast = None
    else:
        breakfast = pick("早餐", set())

    exclude = {breakfast.name} if breakfast else set()

    lunch = {
        "主菜": pick("主菜", exclude),
        "主食": pick("主食", exclude),
        "凉菜": pick("凉菜", exclude),
        "汤":   pick("汤",   exclude),
    }
    exclude |= {d.name for d in lunch.values() if d}

    dinner = {
        "主菜": pick("主菜", exclude),
        "主食": pick("主食", exclude),
        "凉菜": pick("凉菜", exclude),
    }

    return {"早餐": breakfast, "午餐": lunch, "晚餐": dinner}


# ---------- 格式化输出 ----------

ROLE_EMOJI = {"主菜": "🍖", "汤": "🍲", "主食": "🍚", "凉菜": "🥗", "早餐": "🥣"}


def format_combo(combo):
    """把套餐格式化成好看的输出"""
    lines = ["=" * 40]
    lines.append(f"  📅 今天吃啥 —— {date.today()}")
    lines.append("=" * 40)
    for role, dish in combo.items():
        if dish:
            emoji = ROLE_EMOJI.get(role, "•")
            lines.append(f"  {emoji} {role}：{dish.name}（约 {dish.time_minutes} 分钟）")
        else:
            lines.append(f"  {role}：（暂无）")
    lines.append("=" * 40)
    return "\n".join(lines)


def format_feasible(available, dishes):
    """格式化『冰箱有什么→能做什么』的输出"""
    lines = ["=" * 40]
    lines.append(f"  🥬 冰箱：{'、'.join(available)}")
    lines.append("=" * 40)
    if not dishes:
        lines.append("  没找到合适的菜，去买点啥吧 😄")
    else:
        lines.append(f"  能做 {len(dishes)} 道菜：")
        for d in dishes:
            missing = d.missing_ingredients(available)
            if missing:
                lines.append(f"  🍳 {d.name}（约 {d.time_minutes} 分钟）—— 还缺：{', '.join(missing)}")
            else:
                lines.append(f"  ✅ {d.name}（约 {d.time_minutes} 分钟）—— 食材全齐")
    lines.append("=" * 40)
    return "\n".join(lines)


MEAL_EMOJI = {"早餐": "☀️", "午餐": "🌞", "晚餐": "🌙"}


def format_three_meals(meals):
    """格式化『一日三餐』的输出，含营养覆盖标签"""
    lines = ["=" * 40]
    lines.append(f"  📅 {date.today()} —— 一日三餐")
    lines.append("=" * 40)

    # 早餐
    bf = meals.get("早餐")
    if bf:
        lines.append(f"  ☀️ 早餐：{bf.name}（约 {bf.time_minutes} 分钟）")
    else:
        lines.append("  ☀️ 早餐：（暂无）")

    # 午餐：主菜 + 主食 + 凉菜 + 汤
    lunch = meals.get("午餐", {})
    lines.append("  🌞 午餐：")
    for role, label in [("主菜", "主菜"), ("主食", "主食"), ("凉菜", "凉菜"), ("汤", "汤")]:
        d = lunch.get(role)
        emoji = ROLE_EMOJI.get(role, "•")
        if d:
            lines.append(f"      {emoji} {label}：{d.name}（约 {d.time_minutes} 分钟）")
        else:
            lines.append(f"      {label}：（暂无）")

    # 晚餐：主菜 + 主食 + 凉菜
    dinner = meals.get("晚餐", {})
    lines.append("  🌙 晚餐：")
    for role, label in [("主菜", "主菜"), ("主食", "主食"), ("凉菜", "凉菜")]:
        d = dinner.get(role)
        emoji = ROLE_EMOJI.get(role, "•")
        if d:
            lines.append(f"      {emoji} {label}：{d.name}（约 {d.time_minutes} 分钟）")
        else:
            lines.append(f"      {label}：（暂无）")

    # 营养覆盖
    all_dishes = []
    if bf:
        all_dishes.append(bf)
    for d in lunch.values():
        if d:
            all_dishes.append(d)
    for d in dinner.values():
        if d:
            all_dishes.append(d)

    covered = set()
    for d in all_dishes:
        for cls in classify_nutrition(d):
            covered.add(cls)
    nutrition_order = ["蛋白", "碳水", "蔬菜"]
    nutrition_str = "  ".join(
        f"{'✅' if cls in covered else '⚠️'} {cls}" for cls in nutrition_order
    )
    lines.append("-" * 40)
    lines.append(f"  营养覆盖：{nutrition_str}")

    lines.append("=" * 40)
    return "\n".join(lines)


# ---------- 演示入口 ----------

if __name__ == "__main__":
    dishes = load_dishes()

    # 解析 --prefs '{"spicy":"none"}' 形式参数
    prefs = None
    if "--prefs" in sys.argv:
        idx = sys.argv.index("--prefs")
        if idx + 1 < len(sys.argv):
            try:
                prefs = json.loads(sys.argv[idx + 1])
            except json.JSONDecodeError as e:
                print(f"⚠️ --prefs JSON 解析失败：{e}", file=sys.stderr)
                prefs = None

    if "--three-meals" in sys.argv:
        # 模式 3：一日三餐 + 7 天不重复（按自然日）
        history = load_history()
        meals = choose_three_meals(dishes, history, prefs=prefs)
        print(format_three_meals(meals))
        # 模式 3：一日三餐 + 7 天不重复（按自然日）
        history = load_history()
        meals = choose_three_meals(dishes, history)
        print(format_three_meals(meals))

        # 把今天三餐的菜全部记录到历史
        bf = meals.get("早餐")
        if bf:
            add_to_history(history, bf.name)
        for dish in meals.get("午餐", {}).values():
            if dish:
                add_to_history(history, dish.name)
        for dish in meals.get("晚餐", {}).values():
            if dish:
                add_to_history(history, dish.name)
        save_history(history)

        print(f"\n已记录到历史（最近吃过的 {min(len(history), 7)} 道）：")
        for entry in history[-7:]:
            print(f"  - {entry['date']}: {entry['dish']}")
    elif len(sys.argv) > 1:
        # 模式 1：按食材筛选 —— python3 what_to_eat.py 鸡蛋 西红柿
        # 过滤掉 --three-meals / --prefs / --prefs 的 JSON 值
        available = []
        skip_next = False
        for arg in sys.argv[1:]:
            if skip_next:
                skip_next = False
                continue
            if arg in ("--three-meals",):
                continue
            if arg == "--prefs":
                skip_next = True  # 跳过下一项（prefs 的 JSON 值）
                continue
            available.append(arg)
        if available:
            feasible = filter_by_ingredients(dishes, available)
            print(format_feasible(available, feasible))
        elif prefs is not None:
            # 只有 --prefs，没食材 → 走 combo 路径（应用偏好）
            history = load_history()
            combo = choose_combo(dishes, history, prefs=prefs)
            print(format_combo(combo))
            for dish in combo.values():
                if dish:
                    add_to_history(history, dish.name)
            save_history(history)
    else:
        # 模式 2（默认）：随机套餐 + 30 天不重复
        history = load_history()
        combo = choose_combo(dishes, history, prefs=prefs)
        print(format_combo(combo))

        # 把今天选中的菜记录到历史
        for dish in combo.values():
            if dish:
                add_to_history(history, dish.name)
        save_history(history)

        print(f"\n已记录到历史（最近吃过的 {min(len(history), 5)} 道）：")
        for entry in history[-5:]:
            print(f"  - {entry['date']}: {entry['dish']}")

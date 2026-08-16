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

    def __init__(self, name, time_minutes, role="主菜", tags=None, ingredients=None,
                 nutrition=None, seasonings=None, steps=None, tip=None):
        self.name = name
        self.time_minutes = time_minutes
        self.role = role
        self.tags = tags or []
        self.ingredients = ingredients or []
        self.nutrition = nutrition or []
        self.seasonings = seasonings or []
        self.steps = steps or []
        self.tip = tip or ""

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


def add_to_history(history, dish_name, status="confirmed", suggested=None, meal=None, date_str=None):
    """把今天吃过的菜加进历史。
    status: 'confirmed'（吃了/做了）/ 'skipped'（没吃）/ 'manual'（手动记录）
    meal: '早餐'/'午餐'/'晚餐'（手动记录时使用）
    date_str: ISO 日期字符串；None → 今天
    """
    entry = {"dish": dish_name, "date": date_str or str(date.today()), "status": status}
    if status != "confirmed":
        entry["suggested"] = suggested
    if meal:
        entry["meal"] = meal
    history.append(entry)
    return history


def migrate_history(history):
    """旧格式 {dish, date} → 新格式（默认 status='confirmed'）。
    用于向前兼容老的历史文件。"""
    return [
        h if "status" in h else {"date": h["date"], "dish": h["dish"], "status": "confirmed"}
        for h in history
    ]


# ---------- 核心算法 ----------

def choose_one(dishes):
    """从 dish 列表里随机抽一个返回"""
    return random.choice(dishes)


def filter_by_max_time(dishes, max_minutes):
    """只返回耗时 ≤ max_minutes 的菜"""
    return [d for d in dishes if d.time_minutes <= max_minutes]


INGREDIENT_SYNONYMS = {
    # ===== 宽泛类别（输入『肉』扩展到所有肉、『菜』到所有菜）=====
    # 用具体肉类词（不要单字『鸡』，否则会误中『鸡蛋』）
    '肉': ['肉', '猪肉', '牛肉', '羊肉', '五花肉', '里脊肉', '排骨', '肉末', '肉丝', '肉片', '鸡肉', '鸭肉', '牛排', '牛里脊', '牛腱子', '牛腩', '羊肉片', '鸡腿', '鸡翅', '鸡胸', '鸡块', '鸡丁'],
    '菜': ['菜', '蔬', '白菜', '萝卜', '芹', '茄', '黄瓜', '菠', '韭菜', '青菜'],
    '蛋': ['蛋', '鸡蛋', '蛋花'],
    '豆': ['豆', '豆腐', '豆浆'],
    '海鲜': ['虾', '蟹', '鱼', '鱿', '蛤', '海带', '紫菜'],
    '辣': ['辣', '椒', '麻辣', '红油'],

    # ===== 具体词：每个只匹配自己 + 同物别名（绝不开到其他类别）=====
    # Day 16 修复：『排骨』之前会误拉到『牛排/羊肉』,因为缺这条窄映射
    '排骨': ['排骨', '猪排骨', '肋排'],
    '五花肉': ['五花肉', '三层肉'],
    '猪肉': ['猪肉'],
    '鹅肉': ['鹅肉'],
    '牛肉': ['牛肉'],
    '羊肉': ['羊肉'],
    '鸡肉': ['鸡肉'],
    '鸡蛋': ['鸡蛋', '鸡子'],
}


def expand_synonyms(keywords):
    out = set()
    for kw in keywords:
        out.add(kw)
        for syn in INGREDIENT_SYNONYMS.get(kw, []):
            out.add(syn)
    return list(out)


def filter_by_ingredients(dishes, available_ingredients):
    """返回至少有一种食材在 available_ingredients 里的菜。
    - 子串双向匹配：用户输入『西葫芦』能匹配菜的『西葫芦 1 根』
    - 同义词扩展：输入『肉』→ 自动展开到 猪/牛/羊/鸡 等所有肉类
    - 多字段搜索：同时查 name / ingredients / tags / seasonings
    """
    if not available_ingredients:
        return []
    keywords = expand_synonyms(available_ingredients)
    out = []
    for d in dishes:
        haystack = (d.name + ' '
                    + ' '.join(d.ingredients or [])
                    + ' ' + ' '.join(d.tags or [])
                    + ' ' + ' '.join(getattr(d, 'seasonings', []) or []))
        if any(kw in haystack for kw in keywords):
            out.append(d)
    return out


def search_dishes(dishes, query):
    """全文搜索菜谱：菜名 + 标签 + 食材 + 调料 都参与匹配。

    多关键词用空格分隔，AND 关系（每个都要匹配）。
    大小写不敏感。
    """
    if not query or not query.strip():
        return []
    keywords = query.strip().lower().split()
    out = []
    for d in dishes:
        haystack = ' '.join([
            d.name or '',
            ' '.join(d.tags or []),
            ' '.join(d.ingredients or []),
            ' '.join(getattr(d, 'seasonings', []) or []),
        ]).lower()
        if all(kw in haystack for kw in keywords):
            out.append(d)
    return out


def choose_one_no_repeat(dishes, history, window=30):
    """从历史记录里最近 window 天没吃过的菜中随机抽一个

    Day 10: skipped 状态不参与去重。
    """
    effective = migrate_history(history or [])
    recent = {h["dish"] for h in effective[-window:] if h["status"] != "skipped"}
    available = [d for d in dishes if d.name not in recent]
    if not available:
        # 所有菜都在最近 window 天吃过 -> 退而求其次，允许重复
        available = list(dishes)
    return random.choice(available)


def choose_combo(dishes, history=None, window=30, prefs=None, scores=None):
    """选一套：主菜 + 汤 + 主食（30 天不重复）。

    prefs=None 或 {} 时不过滤（向后兼容）。
    scores=None 或 {} 时均匀随机；非空时按权重推荐（Day 11 自催化）。
    过滤后空则回退到原列表，避免卡死。

    Day 10: history 可以包含 status 字段（confirmed / manual / skipped）。
    skipped 状态不参与『30 天不重复』算法。
    """
    history = history or []
    pool = apply_prefs(dishes, prefs)
    if not pool:
        pool = dishes  # 兜底

    # Day 10: 迁移旧格式 + 过滤 skipped
    effective = migrate_history(history)
    recent = {h["dish"] for h in effective[-window:] if h["status"] != "skipped"}
    tag_aff = compute_tag_affinities(scores or {}, pool)

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
        return weighted_choice(candidates, scores or {}, tag_aff)

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


def choose_three_meals(dishes, history=None, window=7, prefs=None, scores=None):
    """一日三餐：早 + 午 + 晚。
    - 早餐：单独抽（不参与午晚的『一碗一餐』逻辑）
    - 午餐和晚餐：交给 choose_one_meal 处理（面条/饺子一碗一餐，米饭配菜+汤）
    window 按自然日计（默认 7 天），三餐不共享同一道菜。
    prefs=None 或 {} 不过滤；过滤后空则回退到原列表。
    scores=None 时不参与评分；scores={} 与 None 等价。"""
    history = history or []
    pool = apply_prefs(dishes, prefs)
    if not pool:
        pool = dishes

    today = date.today()
    cutoff = today - timedelta(days=window)
    # Day 10: 迁移旧格式 + 过滤 skipped 状态
    effective = migrate_history(history)
    recent = {h["dish"] for h in effective
              if _parse_date(h.get("date")) >= cutoff and h["status"] != "skipped"}
    tag_aff = compute_tag_affinities(scores or {}, pool)

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
        return weighted_choice(candidates, scores or {}, tag_aff)

    # skipBreakfast 偏好：跳过早餐
    if prefs and prefs.get("skipBreakfast"):
        breakfast = None
    else:
        breakfast = pick("早餐", set())

    exclude = {breakfast.name} if breakfast else set()

    # 午晚饭走用户习惯版（一碗一餐 / 配菜模式）
    lunch = choose_one_meal(dishes, history, window=window, prefs=prefs, scores=scores)
    # 避免午晚重复同一道菜：把午餐选的菜加进 exclude
    lunch_names = {d.name for d in lunch.values() if hasattr(d, "name")}
    # 给晚餐一份过滤过 exclude 的临时 history
    dinner_history = list(history) + [{"dish": n, "date": str(today)} for n in lunch_names]
    # 『一天不能两顿面条』：午餐若是一碗一餐，晚餐强制米饭模式
    must_be_rice_dinner = (lunch.get("模式") == "一碗一餐")
    dinner = choose_one_meal(
        dishes, dinner_history, window=window, prefs=prefs, scores=scores,
        must_be_rice=must_be_rice_dinner,
    )

    return {"早餐": breakfast, "午餐": lunch, "晚餐": dinner}


# ---------- 用户习惯版：一顿午饭 / 晚饭 ----------

# 用户习惯：
#   - 午饭/晚饭：要么面条，要么米饭（饺子也算一碗一餐）
#   - 面条/饺子 = 一碗一餐（不配菜不配汤）
#   - 米饭 = 主菜 + 汤 + 主食
#   - 其他主食（馒头/包子/炒饭/年糕/葱油饼/烧麦）→ 跳过
#   - 一天不能两顿面条：午餐若是一碗一餐，晚餐强制米饭模式

def is_lunch_main_allowed(dish):
    """午饭/晚饭允许的主食：名字含『米』『面』『饺子』之一"""
    name = dish.name or ""
    return any(k in name for k in ("米", "面", "饺子"))


def is_rice(dish):
    """米饭：含『米』字但不含『面』的主食（避免『玉米萝卜清汤面』被误判）"""
    name = dish.name or ""
    return "米" in name and "面" not in name


def is_one_bowl_meal(dish):
    """面条或饺子：一碗一餐（不配菜不配汤）"""
    name = dish.name or ""
    return "面" in name or "饺子" in name


def choose_one_meal(dishes, history=None, window=30, prefs=None, scores=None, must_be_rice=False):
    """用户定制版的『一顿午饭或晚饭』。

    规则：
    - 主食池限定：米饭（名字含『米』）、面条（名字含『面』）、饺子
    - 抽到面条/饺子 → 一碗一餐（无主菜无汤）
    - 抽到米饭 → 主菜 + 汤 + 主食
    - 7 天内吃过的不抽；池子空时逐级回退
    - Day 11：scores 非空时按权重推荐（自催化）

    返回 dict：
        {"主菜": Dish|None, "汤": Dish|None, "主食": Dish|None, "模式": "一碗一餐"|"配菜模式"}
    """
    history = history or []
    pool = apply_prefs(dishes, prefs)
    if not pool:
        pool = dishes  # 兜底

    cutoff = date.today() - timedelta(days=window)
    # Day 10: 迁移旧格式 + 过滤 skipped 状态
    effective = migrate_history(history)
    recent = {h["dish"] for h in effective
              if _parse_date(h.get("date")) >= cutoff and h["status"] != "skipped"}
    tag_aff = compute_tag_affinities(scores or {}, pool)

    # 1. 抽主食（限定池）
    def pick_main(candidate_pool, fallback_pool):
        # candidate_pool 应用了偏好，fallback_pool 是原列表
        # must_be_rice=True 时，主食池只含米饭（用于『不能两顿面』约束）
        main_filter = is_rice if must_be_rice else is_lunch_main_allowed
        cands = [
            d for d in candidate_pool
            if d.role == "主食" and main_filter(d) and d.name not in recent
        ]
        if not cands:
            cands = [d for d in candidate_pool if d.role == "主食" and main_filter(d)]
        if not cands and fallback_pool is not candidate_pool:
            cands = [
                d for d in fallback_pool
                if d.role == "主食" and main_filter(d) and d.name not in recent
            ]
        if not cands and fallback_pool is not candidate_pool:
            cands = [d for d in fallback_pool if d.role == "主食" and main_filter(d)]
        return weighted_choice(cands, scores or {}, tag_aff)

    main = pick_main(pool, dishes)
    if not main:
        return {"主菜": None, "汤": None, "主食": None, "模式": "无"}

    # 2. 一碗一餐
    if is_one_bowl_meal(main):
        return {"主菜": None, "汤": None, "主食": main, "模式": "一碗一餐"}

    # 3. 配菜模式：主菜 + 汤 + 主食
    exclude = {main.name}

    def pick_role(role):
        cands = [
            d for d in pool
            if d.role == role and d.name not in exclude and d.name not in recent
        ]
        if not cands:
            cands = [d for d in pool if d.role == role and d.name not in exclude]
        if not cands:
            cands = [d for d in pool if d.role == role]
        if not cands and pool is not dishes:
            cands = [
                d for d in dishes
                if d.role == role and d.name not in exclude and d.name not in recent
            ]
        if not cands and pool is not dishes:
            cands = [d for d in dishes if d.role == role]
        return weighted_choice(cands, scores or {}, tag_aff)

    return {
        "主菜": pick_role("主菜"),
        "汤":   pick_role("汤"),
        "主食": main,
        "模式": "配菜模式",
    }


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


def _format_one_meal(meal, emoji):
    """格式化『一顿午饭/晚饭』—— 一碗一餐 或 配菜模式"""
    lines = []
    mode = meal.get("模式") if isinstance(meal, dict) else None
    if mode == "一碗一餐":
        main = meal.get("主食")
        if main:
            lines.append(f"  {emoji} 一碗一餐：{main.name}（约 {main.time_minutes} 分钟）")
        else:
            lines.append(f"  {emoji} 一碗一餐：（暂无）")
    else:
        # 配菜模式：主菜 + 汤 + 主食
        lines.append(f"  {emoji} 配菜模式：")
        for role, label in [("主菜", "主菜"), ("汤", "汤"), ("主食", "主食")]:
            d = meal.get(role) if isinstance(meal, dict) else None
            e = ROLE_EMOJI.get(role, "•")
            if d:
                lines.append(f"      {e} {label}：{d.name}（约 {d.time_minutes} 分钟）")
            else:
                lines.append(f"      {label}：（暂无）")
    return lines


def format_one_meal(meal, label="一顿"):
    """格式化『一顿饭』（仅显示这一顿，无早餐/晚餐噪音）"""
    lines = ["=" * 40]
    lines.append(f"  📅 {label} —— {date.today()}")
    lines.append("=" * 40)
    emoji = "🍱"
    if isinstance(meal, dict) and meal.get("模式") == "一碗一餐":
        main = meal.get("主食")
        if main:
            lines.append(f"  {emoji} 一碗一餐：{main.name}（约 {main.time_minutes} 分钟）")
        else:
            lines.append(f"  {emoji} 一碗一餐：（暂无）")
    else:
        lines.append(f"  {emoji} 配菜模式：")
        for role, label2 in [("主菜", "主菜"), ("汤", "汤"), ("主食", "主食")]:
            d = meal.get(role) if isinstance(meal, dict) else None
            e = ROLE_EMOJI.get(role, "•")
            if d:
                lines.append(f"      {e} {label2}：{d.name}（约 {d.time_minutes} 分钟）")
            else:
                lines.append(f"      {label2}：（暂无）")
    lines.append("=" * 40)
    return "\n".join(lines)


def format_three_meals(meals):
    """格式化『一日三餐』的输出，含营养覆盖标签。
    午晚饭按『一碗一餐』或『配菜模式』分别展示。"""
    lines = ["=" * 40]
    lines.append(f"  📅 {date.today()} —— 一日三餐")
    lines.append("=" * 40)

    # 早餐
    bf = meals.get("早餐")
    if bf:
        lines.append(f"  ☀️ 早餐：{bf.name}（约 {bf.time_minutes} 分钟）")
    else:
        lines.append("  ☀️ 早餐：（暂无）")

    # 午餐
    lines.extend(_format_one_meal(meals.get("午餐"), "🌞"))

    # 晚餐
    lines.extend(_format_one_meal(meals.get("晚餐"), "🌙"))

    # 营养覆盖
    all_dishes = []
    if bf:
        all_dishes.append(bf)
    for meal in (meals.get("午餐"), meals.get("晚餐")):
        if isinstance(meal, dict):
            for v in meal.values():
                if hasattr(v, "name"):
                    all_dishes.append(v)

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


# ---------- Day 11：手动记录三餐 ----------


VALID_MEALS = ("早餐", "午餐", "晚餐")


def log_manual(history, meals, target_date=None, scores=None):
    """手动记录今天（或指定日期）吃了什么。

    Args:
        history: 历史列表（会被修改 + 返回）
        meals: dict {meal_key: dish_str}，meal_key ∈ {'早餐','午餐','晚餐'}
               dish_str 可逗号分隔多菜，如 "米饭, 红烧肉"
        target_date: ISO 格式日期字符串；None → 今天
        scores: 评分字典（可选）；每个菜的 cooks +1

    Returns:
        更新后的 history 列表
    """
    effective_date = target_date or str(date.today())
    history = history or []

    for meal_key, dish_str in (meals or {}).items():
        if meal_key not in VALID_MEALS:
            continue  # 非法 key 静默忽略
        if not dish_str:
            continue
        # 解析多菜（逗号分隔 + 去空白 + 同餐去重）
        names = []
        seen = set()
        for raw in str(dish_str).split(","):
            name = raw.strip()
            if not name or name in seen:
                continue
            seen.add(name)
            names.append(name)
        for name in names:
            add_to_history(history, name, status="manual", meal=meal_key, date_str=effective_date)
            if scores is not None:
                add_score(scores, name, "cooked")
    return history


# ---------- Day 11：自催化学习模型 ----------


SCORES_FILE = DATA_DIR / "scores.json"


def load_scores(path=SCORES_FILE):
    """加载评分（每道菜的 likes / dislikes / cooks）。
    文件不存在或损坏返回空 dict。"""
    if not Path(path).exists():
        return {}
    try:
        with open(path, encoding="utf-8") as f:
            return json.load(f)
    except (json.JSONDecodeError, OSError):
        return {}


def save_scores(scores, path=SCORES_FILE):
    """保存评分到 JSON"""
    Path(path).parent.mkdir(parents=True, exist_ok=True)
    with open(path, "w", encoding="utf-8") as f:
        json.dump(scores, f, ensure_ascii=False, indent=2)


def add_score(scores, dish_name, action):
    """累加一条评分。
    action ∈ {'like', 'dislike', 'cooked'}
    """
    if dish_name not in scores:
        scores[dish_name] = {"likes": 0, "dislikes": 0, "cooks": 0}
    key = {"like": "likes", "dislike": "dislikes", "cooked": "cooks"}.get(action)
    if key:
        scores[dish_name][key] += 1
    return scores


def compute_tag_affinities(scores, dishes):
    """根据用户评分推断对每个 tag 的偏好。
    返回 {tag: float in [-1, +1]}；数据不足（< 3 次交互）返回 0。
    """
    tag_pos = {}  # tag -> 正向 (likes + cooks)
    tag_neg = {}  # tag -> 负向 (dislikes)

    for d in dishes:
        s = scores.get(d.name, {})
        pos = s.get("likes", 0) + s.get("cooks", 0)
        neg = s.get("dislikes", 0)
        total = pos + neg
        if total == 0:
            continue
        for t in (d.tags or []):
            tag_pos[t] = tag_pos.get(t, 0) + pos
            tag_neg[t] = tag_neg.get(t, 0) + neg

    affinities = {}
    for t in set(list(tag_pos.keys()) + list(tag_neg.keys())):
        total = tag_pos.get(t, 0) + tag_neg.get(t, 0)
        if total < 3:
            affinities[t] = 0.0
            continue
        ratio = tag_pos[t] / total
        affinities[t] = (ratio - 0.5) * 2  # 归一到 [-1, +1]
    return affinities


def weighted_choice(candidates, scores, tag_aff):
    """加权随机选择：从 candidates 中按权重抽取。
    weight(dish) = 1 + likes*3 + cooks*2 - dislikes*5 + Σ tag_aff[t]*4 (for t in dish.tags)
    """
    if not candidates:
        return None
    weights = []
    for d in candidates:
        s = scores.get(d.name, {}) or {}
        w = 1.0
        w += s.get("likes", 0) * 3
        w += s.get("cooks", 0) * 2
        w -= s.get("dislikes", 0) * 5
        for t in (d.tags or []):
            w += tag_aff.get(t, 0) * 4
        weights.append(max(w, 0.1))
    total = sum(weights)
    r = random.random() * total
    cum = 0
    for d, w in zip(candidates, weights):
        cum += w
        if r <= cum:
            return d
    return candidates[-1]  # 兜底


# ---------- 演示入口 ----------

if __name__ == "__main__":
    dishes = load_dishes()
    scores = load_scores()

    # Day 11：先处理 --like / --dislike / --cooked（修改评分并退出）
    for action, flag in [("like", "--like"), ("dislike", "--dislike"), ("cooked", "--cooked")]:
        if flag in sys.argv:
            idx = sys.argv.index(flag)
            if idx + 1 < len(sys.argv):
                dish_name = sys.argv[idx + 1]
                add_score(scores, dish_name, action)
                save_scores(scores)
                print(f"✅ 已记录：{dish_name} → {action}")
                print(f"   当前评分：{scores[dish_name]}")
                sys.exit(0)
            else:
                print(f"⚠️ {flag} 需要一个菜名参数", file=sys.stderr)
                sys.exit(1)

    # Day 12：处理 --log '{"date":"...","meals":{...}}'（手动记录三餐）
    if "--log" in sys.argv:
        idx = sys.argv.index("--log")
        if idx + 1 >= len(sys.argv):
            print("⚠️ --log 需要 JSON 参数，如 '{\"早餐\":\"小米粥\"}'", file=sys.stderr)
            sys.exit(1)
        try:
            payload = json.loads(sys.argv[idx + 1])
        except json.JSONDecodeError as e:
            print(f"⚠️ --log JSON 解析失败：{e}", file=sys.stderr)
            sys.exit(1)
        target_date = payload.get("date")
        meals = payload.get("meals") or {}
        history = load_history()
        new_h = log_manual(history, meals, target_date=target_date, scores=scores)
        save_history(new_h)
        save_scores(scores)
        written = sum(1 for e in new_h if e.get("status") == "manual" and (not target_date or e.get("date") == target_date))
        print(f"✅ 手动记录完成：{written} 条写入历史（{target_date or '今天'}）")
        print("   写入明细：")
        for e in new_h:
            if e.get("status") == "manual" and (not target_date or e.get("date") == target_date):
                print(f"      · {e.get('meal', '?')}：{e['dish']}")
        sys.exit(0)

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
        meals = choose_three_meals(dishes, history, prefs=prefs, scores=scores)
        print(format_three_meals(meals))

        # 把今天三餐的菜全部记录到历史
        bf = meals.get("早餐")
        if bf:
            add_to_history(history, bf.name)
        for meal in (meals.get("午餐"), meals.get("晚餐")):
            if isinstance(meal, dict):
                for v in meal.values():
                    if hasattr(v, "name"):
                        add_to_history(history, v.name)
        save_history(history)

        print(f"\n已记录到历史（最近吃过的 {min(len(history), 7)} 道）：")
        for entry in history[-7:]:
            print(f"  - {entry['date']}: {entry['dish']}")
    elif "--my-meal" in sys.argv:
        # 模式 4：用户习惯版一顿午饭/晚饭（一碗一餐 / 配菜模式）
        history = load_history()
        meal = choose_one_meal(dishes, history, prefs=prefs)
        print(format_one_meal(meal, label="一顿"))
        # 记录到历史
        for v in meal.values():
            if hasattr(v, "name"):
                add_to_history(history, v.name)
        save_history(history)

        print(f"\n已记录到历史（最近吃过的 {min(len(history), 5)} 道）：")
        for entry in history[-5:]:
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
            if arg in ("--three-meals", "--my-meal"):
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
        combo = choose_combo(dishes, history, prefs=prefs, scores=scores)
        print(format_combo(combo))

        # 把今天选中的菜记录到历史
        for dish in combo.values():
            if dish:
                add_to_history(history, dish.name)
        save_history(history)

        print(f"\n已记录到历史（最近吃过的 {min(len(history), 5)} 道）：")
        for entry in history[-5:]:
            print(f"  - {entry['date']}: {entry['dish']}")

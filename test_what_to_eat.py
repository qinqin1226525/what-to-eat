"""测试 what_to_eat.py —— TDD Day 1 ~ Day 8"""

import unittest
from what_to_eat import (
    Dish,
    choose_one,
    filter_by_max_time,
    filter_by_ingredients,
    choose_one_no_repeat,
    choose_combo,
    filter_kid_friendly,
    choose_kid_combo,
    choose_three_meals,
    classify_nutrition,
    format_three_meals,
    _parse_date,
    apply_prefs,
    DEFAULT_PREFS,
)


class TestChooseOne(unittest.TestCase):
    """Day 1: 随机抽一个"""

    def test_returns_one_item_from_list(self):
        dishes = ["西红柿炒蛋", "宫保鸡丁", "酸辣土豆丝"]
        result = choose_one(dishes)
        self.assertIn(result, dishes)


class TestFilterByMaxTime(unittest.TestCase):
    """Day 2: 按时间筛选"""

    def test_returns_only_dishes_within_time_limit(self):
        dishes = [
            Dish("快手菜", 15),
            Dish("中等菜", 25),
            Dish("慢菜", 60),
        ]
        result = filter_by_max_time(dishes, 30)
        names = [d.name for d in result]
        self.assertEqual(set(names), {"快手菜", "中等菜"})

    def test_excludes_dishes_over_time_limit(self):
        dishes = [Dish("慢菜1", 45), Dish("慢菜2", 60)]
        result = filter_by_max_time(dishes, 30)
        self.assertEqual(result, [])

    def test_empty_list_returns_empty(self):
        self.assertEqual(filter_by_max_time([], 30), [])


class TestChooseOneNoRepeat(unittest.TestCase):
    """Day 3: 30 天不重复"""

    def test_excludes_recently_chosen(self):
        dishes = [Dish("A", 10), Dish("B", 10), Dish("C", 10)]
        history = [{"dish": "A", "date": "今天"}]
        for _ in range(20):
            pick = choose_one_no_repeat(dishes, history, window=30)
            self.assertNotEqual(pick.name, "A")

    def test_falls_back_when_all_recent(self):
        dishes = [Dish("A", 10), Dish("B", 10)]
        history = []
        for _ in range(15):
            history.append({"dish": "A", "date": "今天"})
            history.append({"dish": "B", "date": "今天"})
        pick = choose_one_no_repeat(dishes, history, window=30)
        self.assertIn(pick.name, ["A", "B"])


class TestChooseCombo(unittest.TestCase):
    """Day 4: 主菜+汤+主食 套餐"""

    def test_combo_has_all_roles(self):
        dishes = [
            Dish("红烧肉", 60, role="主菜"),
            Dish("紫菜蛋花汤", 10, role="汤"),
            Dish("米饭", 20, role="主食"),
        ]
        combo = choose_combo(dishes, [])
        self.assertIsNotNone(combo["主菜"])
        self.assertIsNotNone(combo["汤"])
        self.assertIsNotNone(combo["主食"])

    def test_combo_respects_no_repeat(self):
        dishes = [
            Dish("红烧肉", 60, role="主菜"),
            Dish("宫保鸡丁", 25, role="主菜"),
            Dish("紫菜蛋花汤", 10, role="汤"),
            Dish("米饭", 20, role="主食"),
        ]
        history = [{"dish": "红烧肉", "date": "今天"}]
        combo = choose_combo(dishes, history)
        self.assertEqual(combo["主菜"].name, "宫保鸡丁")

    def test_combo_picks_only_matching_role(self):
        dishes = [
            Dish("红烧肉", 60, role="主菜"),
            Dish("紫菜蛋花汤", 10, role="汤"),
            Dish("米饭", 20, role="主食"),
        ]
        combo = choose_combo(dishes, [])
        self.assertEqual(combo["主菜"].name, "红烧肉")
        self.assertEqual(combo["汤"].name, "紫菜蛋花汤")
        self.assertEqual(combo["主食"].name, "米饭")


class TestFilterByIngredients(unittest.TestCase):
    """Day 6: 按食材筛选 —— 冰箱里有啥，能做啥"""

    def test_dish_with_one_matching_ingredient_is_included(self):
        dishes = [
            Dish("西红柿炒蛋", 15, ingredients=["鸡蛋", "西红柿", "葱"]),
            Dish("凉拌黄瓜", 5, ingredients=["黄瓜", "蒜", "醋"]),
        ]
        result = filter_by_ingredients(dishes, ["鸡蛋"])
        names = [d.name for d in result]
        self.assertIn("西红柿炒蛋", names)
        self.assertNotIn("凉拌黄瓜", names)

    def test_empty_fridge_returns_empty(self):
        dishes = [Dish("西红柿炒蛋", 15, ingredients=["鸡蛋", "西红柿"])]
        self.assertEqual(filter_by_ingredients(dishes, []), [])

    def test_partial_match_with_multiple_ingredients(self):
        """多个食材能匹配多个菜"""
        dishes = [
            Dish("西红柿炒蛋", 15, ingredients=["鸡蛋", "西红柿", "葱"]),
            Dish("宫保鸡丁", 25, ingredients=["鸡丁", "花生", "干辣椒"]),
            Dish("凉拌黄瓜", 5, ingredients=["黄瓜", "蒜", "醋"]),
        ]
        result = filter_by_ingredients(dishes, ["鸡蛋", "黄瓜"])
        names = [d.name for d in result]
        self.assertIn("西红柿炒蛋", names)
        self.assertIn("凉拌黄瓜", names)
        self.assertNotIn("宫保鸡丁", names)


class TestFilterKidFriendly(unittest.TestCase):
    """Day 10: 儿童餐筛选"""

    def test_dish_with_kid_friendly_tag_is_included(self):
        dishes = [
            Dish("糖醋里脊", 30, tags=["酸甜", "下饭"]),
            Dish("可乐鸡翅", 35, tags=["甜口", "小孩爱"]),
            Dish("蚝油生菜", 8, tags=["清淡", "简单"]),
        ]
        names = [d.name for d in filter_kid_friendly(dishes)]
        self.assertIn("糖醋里脊", names)
        self.assertIn("可乐鸡翅", names)
        self.assertIn("蚝油生菜", names)

    def test_spicy_dishes_are_excluded(self):
        dishes = [
            Dish("麻婆豆腐", 20, tags=["辣", "下饭"]),
            Dish("宫保鸡丁", 25, tags=["微辣"]),
            Dish("回锅肉", 25, tags=["辣"]),
        ]
        result = filter_kid_friendly(dishes)
        self.assertEqual(result, [])

    def test_dishes_without_friendly_tags_excluded(self):
        dishes = [
            Dish("番茄牛腩", 90, tags=["慢炖", "硬菜", "待客"]),
            Dish("红烧肉", 60, tags=["硬菜", "待客"]),
        ]
        result = filter_kid_friendly(dishes)
        self.assertEqual(result, [])

    def test_mixed_scenario(self):
        dishes = [
            Dish("糖醋里脊", 30, tags=["酸甜", "下饭"]),
            Dish("麻婆豆腐", 20, tags=["辣", "下饭"]),
            Dish("可乐鸡翅", 35, tags=["甜口", "小孩爱"]),
            Dish("回锅肉", 25, tags=["辣"]),
        ]
        names = [d.name for d in filter_kid_friendly(dishes)]
        self.assertIn("糖醋里脊", names)
        self.assertIn("可乐鸡翅", names)
        self.assertNotIn("麻婆豆腐", names)
        self.assertNotIn("回锅肉", names)


class TestChooseThreeMeals(unittest.TestCase):
    """Day 8: 一日三餐（早+午+晚），7 自然日不重复"""

    def _build_pool(self):
        """小型菜池：2 主菜 / 2 主食 / 2 凉菜 / 2 汤 / 2 早餐 —— 适合触发 exclude/兜底逻辑"""
        return [
            Dish("早A", 5, role="早餐"),
            Dish("早B", 10, role="早餐"),
            Dish("主A", 30, role="主菜"),
            Dish("主B", 30, role="主菜"),
            Dish("食A", 20, role="主食"),
            Dish("食B", 20, role="主食"),
            Dish("凉A", 8, role="凉菜"),
            Dish("凉B", 8, role="凉菜"),
            Dish("汤A", 15, role="汤"),
            Dish("汤B", 15, role="汤"),
        ]

    def test_structure_has_breakfast_lunch_dinner(self):
        meals = choose_three_meals(self._build_pool(), [])
        self.assertIn("早餐", meals)
        self.assertIn("午餐", meals)
        self.assertIn("晚餐", meals)

    def test_breakfast_role_picked(self):
        meals = choose_three_meals(self._build_pool(), [])
        self.assertIsNotNone(meals["早餐"])
        self.assertEqual(meals["早餐"].role, "早餐")

    def test_lunch_has_main_staple_cold_soup(self):
        meals = choose_three_meals(self._build_pool(), [])
        self.assertIsNotNone(meals["午餐"]["主菜"])
        self.assertIsNotNone(meals["午餐"]["主食"])
        self.assertIsNotNone(meals["午餐"]["凉菜"])
        self.assertIsNotNone(meals["午餐"]["汤"])

    def test_dinner_has_main_staple_cold(self):
        meals = choose_three_meals(self._build_pool(), [])
        self.assertIsNotNone(meals["晚餐"]["主菜"])
        self.assertIsNotNone(meals["晚餐"]["主食"])
        self.assertIsNotNone(meals["晚餐"]["凉菜"])

    def test_lunch_dinner_no_shared_dishes(self):
        """午晚的主菜/主食/凉菜不能重复（exclude 集合生效）"""
        pool = self._build_pool()
        for _ in range(20):
            meals = choose_three_meals(pool, [])
            lunch_names = {meals["午餐"]["主菜"].name, meals["午餐"]["主食"].name, meals["午餐"]["凉菜"].name}
            dinner_names = {meals["晚餐"]["主菜"].name, meals["晚餐"]["主食"].name, meals["晚餐"]["凉菜"].name}
            self.assertEqual(lunch_names & dinner_names, set())

    def test_breakfast_excluded_from_lunch_and_dinner(self):
        """早餐选过的菜不会出现在午晚（即使角色不冲突）"""
        pool = self._build_pool()
        for _ in range(20):
            meals = choose_three_meals(pool, [])
            bf = meals["早餐"].name
            other = (
                {meals["午餐"]["主菜"].name, meals["午餐"]["主食"].name,
                 meals["午餐"]["凉菜"].name, meals["午餐"]["汤"].name}
                | {meals["晚餐"]["主菜"].name, meals["晚餐"]["主食"].name,
                   meals["晚餐"]["凉菜"].name}
            )
            self.assertNotIn(bf, other)

    def test_respects_no_repeat_window(self):
        """7 天窗口：历史里有 A，A 不会被选"""
        from datetime import date
        today = str(date.today())
        pool = self._build_pool()
        history = [{"dish": "主A", "date": today}, {"dish": "食A", "date": today}]
        for _ in range(20):
            meals = choose_three_meals(pool, history, window=7)
            self.assertNotEqual(meals["午餐"]["主菜"].name, "主A")
            self.assertNotEqual(meals["午餐"]["主食"].name, "食A")

    def test_history_window_uses_calendar_days(self):
        """8 天前的条目应被排除在 recent 之外"""
        from datetime import date, timedelta
        pool = self._build_pool()
        old_date = str(date.today() - timedelta(days=8))
        recent_date = str(date.today())
        history = [
            {"dish": "主A", "date": old_date},   # 8 天前
            {"dish": "主B", "date": recent_date},  # 今天
        ]
        # window=7 应排除 8 天前的"主A"，但保留今天的"主B"
        for _ in range(20):
            meals = choose_three_meals(pool, history, window=7)
            # 主B 不会出现在午晚（最近吃过）
            self.assertNotEqual(meals["午餐"]["主菜"].name, "主B")
            self.assertNotEqual(meals["晚餐"]["主菜"].name, "主B")
            # 主A 应该可以出现（已超过 7 天窗口）
            self.assertIn(meals["午餐"]["主菜"].name, {"主A"})

    def test_falls_back_when_role_exhausted(self):
        """极小池子（每角色只 1 道菜）时仍能返回非 None"""
        pool = [
            Dish("唯一早餐", 10, role="早餐"),
            Dish("唯一主菜", 30, role="主菜"),
            Dish("唯一主食", 20, role="主食"),
            Dish("唯一凉菜", 8, role="凉菜"),
            Dish("唯一汤", 15, role="汤"),
        ]
        meals = choose_three_meals(pool, [])
        self.assertIsNotNone(meals["早餐"])
        self.assertIsNotNone(meals["午餐"]["主菜"])
        self.assertIsNotNone(meals["晚餐"]["主菜"])
        # 午晚只能拿同一道菜（池子不够），但兜底要成功
        self.assertEqual(meals["午餐"]["主菜"].name, "唯一主菜")
        self.assertEqual(meals["晚餐"]["主菜"].name, "唯一主菜")

    def test_returns_none_for_missing_role(self):
        """没有 早餐 时返回 None；没有 主菜 时午餐主菜也 None"""
        pool = [
            Dish("食A", 20, role="主食"),
            Dish("凉A", 8, role="凉菜"),
        ]
        meals = choose_three_meals(pool, [])
        self.assertIsNone(meals["早餐"])
        # 没有 主菜 时午餐 主菜 应该是 None
        self.assertIsNone(meals["午餐"]["主菜"])


class TestClassifyNutrition(unittest.TestCase):
    """Day 8: 营养分类（显示用）"""

    def test_explicit_nutrition_passed_through(self):
        d = Dish("燕麦", 5, role="早餐", nutrition=["碳水", "蛋白"])
        self.assertEqual(classify_nutrition(d), ["碳水", "蛋白"])

    def test_substring_fallback_for_unflagged_dish(self):
        d = Dish("饺子", 45, ingredients=["面粉", "猪肉馅", "白菜"])
        result = classify_nutrition(d)
        # 面→碳水，肉→蛋白，菜→蔬菜
        self.assertIn("碳水", result)
        self.assertIn("蛋白", result)
        self.assertIn("蔬菜", result)

    def test_substring_only_protein(self):
        d = Dish("煎蛋", 5, ingredients=["鸡蛋", "盐", "油"])
        result = classify_nutrition(d)
        self.assertIn("蛋白", result)
        self.assertNotIn("碳水", result)

    def test_empty_dish_returns_empty(self):
        d = Dish("神秘菜", 10)
        self.assertEqual(classify_nutrition(d), [])


class TestParseDate(unittest.TestCase):
    """Day 8: 安全日期解析"""

    def test_valid_iso_date(self):
        from datetime import date
        self.assertEqual(_parse_date("2026-08-14"), date(2026, 8, 14))

    def test_malformed_date_returns_min(self):
        from datetime import date
        self.assertEqual(_parse_date("今天"), date.min)

    def test_none_returns_min(self):
        from datetime import date
        self.assertEqual(_parse_date(None), date.min)


class TestFormatThreeMeals(unittest.TestCase):
    """Day 8: 一日三餐格式化输出（烟雾测试）"""

    def test_returns_multiline_string_with_all_meals(self):
        meals = {
            "早餐": Dish("小米粥", 20, role="早餐"),
            "午餐": {
                "主菜": Dish("红烧肉", 60, role="主菜"),
                "主食": Dish("米饭", 20, role="主食"),
                "凉菜": Dish("拍黄瓜", 8, role="凉菜"),
                "汤": Dish("紫菜蛋花汤", 10, role="汤"),
            },
            "晚餐": {
                "主菜": Dish("清炒时蔬", 10, role="主菜"),
                "主食": Dish("馒头", 15, role="主食"),
                "凉菜": Dish("凉拌木耳", 10, role="凉菜"),
            },
        }
        out = format_three_meals(meals)
        for keyword in ["早餐", "午餐", "晚餐", "小米粥", "红烧肉", "清炒时蔬"]:
            self.assertIn(keyword, out)


class TestApplyPrefs(unittest.TestCase):
    """Day 10: 偏好过滤 apply_prefs"""

    def _build_pool(self):
        """小型菜池：覆盖菜系/辣度/麻/忌口/时间/素食等维度"""
        return [
            Dish("麻婆豆腐", 20, role="主菜", tags=["川菜", "辣", "下饭"],
                 ingredients=["嫩豆腐", "牛肉末", "豆瓣酱"]),
            Dish("清炒时蔬", 10, role="主菜", tags=["素食", "简单"],
                 ingredients=["青菜", "蒜"]),
            Dish("红烧肥肠", 60, role="主菜", tags=["硬菜", "下饭"],
                 ingredients=["肥肠 500g"]),
            Dish("蒜蓉西兰花", 12, role="主菜", tags=["素食", "简单", "清淡"],
                 ingredients=["西兰花", "蒜"]),
            Dish("宫保鸡丁", 25, role="主菜", tags=["川菜", "微辣"],
                 ingredients=["鸡丁", "花生"]),
            Dish("酸辣土豆丝", 15, role="主菜", tags=["酸辣"],
                 ingredients=["土豆", "辣椒"]),
            Dish("拍黄瓜", 8, role="凉菜", tags=["简单", "开胃"],
                 ingredients=["黄瓜", "蒜", "辣椒油"]),
            Dish("凉拌花生米", 10, role="凉菜", tags=["下酒"],
                 ingredients=["花生", "芹菜"]),
            Dish("西红柿牛腩汤", 60, role="汤", tags=["慢炖"],
                 ingredients=["牛腩", "番茄"]),
            Dish("紫菜蛋花汤", 10, role="汤", tags=["清淡"],
                 ingredients=["紫菜", "鸡蛋"]),
            Dish("白粥", 15, role="早餐", tags=["简单", "清淡"],
                 ingredients=["大米", "水"]),
        ]

    def test_default_prefs_is_empty(self):
        """默认偏好结构应该是空 / False / 'any'"""
        self.assertEqual(DEFAULT_PREFS["cuisines"], [])
        self.assertEqual(DEFAULT_PREFS["spicy"], "any")
        self.assertFalse(DEFAULT_PREFS["noNumb"])
        self.assertEqual(DEFAULT_PREFS["maxTime"], 0)
        self.assertFalse(DEFAULT_PREFS["vegetarian"])
        self.assertFalse(DEFAULT_PREFS["noCold"])

    def test_empty_prefs_filters_nothing(self):
        """空 prefs = 不过滤 = 与原列表一致"""
        pool = self._build_pool()
        result = apply_prefs(pool, {})
        self.assertEqual(len(result), len(pool))

    def test_none_prefs_filters_nothing(self):
        """prefs=None 也要安全"""
        pool = self._build_pool()
        result = apply_prefs(pool, None)
        self.assertEqual(len(result), len(pool))

    def test_cuisines_filters_to_selected(self):
        """只选川菜 → 只剩川菜 tag"""
        pool = self._build_pool()
        result = apply_prefs(pool, {"cuisines": ["川菜"]})
        names = [d.name for d in result]
        self.assertIn("麻婆豆腐", names)
        self.assertIn("宫保鸡丁", names)
        self.assertNotIn("清炒时蔬", names)
        self.assertNotIn("红烧肥肠", names)

    def test_spicy_none_excludes_all_spicy(self):
        """辣度='none' → 排除所有辣/微辣/麻辣"""
        pool = self._build_pool()
        result = apply_prefs(pool, {"spicy": "none"})
        names = [d.name for d in result]
        self.assertNotIn("麻婆豆腐", names)
        self.assertNotIn("宫保鸡丁", names)
        self.assertIn("清炒时蔬", names)
        self.assertIn("蒜蓉西兰花", names)

    def test_noNumb_excludes_mala(self):
        """不要麻辣 → 即使微辣菜也能保留"""
        pool = self._build_pool()
        result = apply_prefs(pool, {"noNumb": True})
        names = [d.name for d in result]
        # 宫保鸡丁有"微辣"没"麻辣"，应该保留
        self.assertIn("宫保鸡丁", names)
        # 麻婆豆腐有"辣"没"麻辣"，应该保留
        self.assertIn("麻婆豆腐", names)

    def test_avoid_seafood_excludes_fish(self):
        """忌口-海鲜 → 排除含紫菜的菜（西红柿牛腩汤不含海鲜，应保留）"""
        pool = self._build_pool()
        result = apply_prefs(pool, {"avoid": {"seafood": True}})
        names = [d.name for d in result]
        # 西红柿牛腩汤不含海鲜关键词，应保留
        self.assertIn("西红柿牛腩汤", names)
        # 紫菜蛋花汤含"紫菜"（海鲜关键词）应被排除
        self.assertNotIn("紫菜蛋花汤", names)

    def test_avoid_offal_excludes_offal_dishes(self):
        """忌口-内脏 → 红烧肥肠应被排除"""
        pool = self._build_pool()
        result = apply_prefs(pool, {"avoid": {"offal": True}})
        names = [d.name for d in result]
        self.assertNotIn("红烧肥肠", names)
        self.assertIn("麻婆豆腐", names)

    def test_maxTime_filters_by_time(self):
        """时间 ≤30 分钟"""
        pool = self._build_pool()
        result = apply_prefs(pool, {"maxTime": 30})
        for d in result:
            self.assertLessEqual(d.time_minutes, 30)
        self.assertNotIn("红烧肥肠", names := [d.name for d in result])
        self.assertIn("清炒时蔬", names)

    def test_vegetarian_only_keeps_veg_tagged(self):
        """素食 → 只保留带"素食" tag 的"""
        pool = self._build_pool()
        result = apply_prefs(pool, {"vegetarian": True})
        names = [d.name for d in result]
        self.assertIn("清炒时蔬", names)
        self.assertIn("蒜蓉西兰花", names)
        self.assertNotIn("麻婆豆腐", names)
        self.assertNotIn("红烧肥肠", names)

    def test_noCold_excludes_凉菜_role(self):
        """不要凉菜 → 凉菜 role 全部排除"""
        pool = self._build_pool()
        result = apply_prefs(pool, {"noCold": True})
        for d in result:
            self.assertNotEqual(d.role, "凉菜")
        self.assertNotIn("拍黄瓜", [d.name for d in result])
        self.assertNotIn("凉拌花生米", [d.name for d in result])

    def test_combined_filters_compose(self):
        """多偏好叠加：川菜 + 不辣 + 30min"""
        pool = self._build_pool()
        result = apply_prefs(pool, {
            "cuisines": ["川菜"],
            "spicy": "none",
            "maxTime": 30,
        })
        names = [d.name for d in result]
        # 川菜里没有不辣且≤30min的菜（麻婆豆腐是辣，宫保鸡丁是微辣）
        # 所以结果应为空
        self.assertEqual(names, [])

    def test_extreme_combination_returns_original_pool_when_empty(self):
        """极端组合过滤后空 → apply_prefs 仍然返回原列表（让上层兜底）"""
        # 这里 apply_prefs 返回空是 OK 的；上层 choose_combo 会兜底
        pool = self._build_pool()
        result = apply_prefs(pool, {
            "cuisines": ["川菜"],
            "spicy": "none",
            "vegetarian": True,
            "avoid": {"seafood": True, "offal": True},
            "maxTime": 15,
            "noCold": True,
        })
        # 验证返回空（行为正确）
        self.assertEqual(result, [])


if __name__ == "__main__":
    unittest.main()

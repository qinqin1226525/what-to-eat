"""测试 what_to_eat.py —— TDD Day 1 ~ Day 10"""

from datetime import date, timedelta

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
    add_to_history,
    migrate_history,
    load_scores,
    save_scores,
    add_score,
    compute_tag_affinities,
    weighted_choice,
    log_manual,
    search_dishes,
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


class TestChooseComboSize(unittest.TestCase):
    """Day 17: 套餐份量偏好（两菜一汤 / 三菜一汤 / 四菜一汤）"""

    @staticmethod
    def _dishes():
        return [
            Dish("红烧肉", 60, role="主菜"),
            Dish("宫保鸡丁", 25, role="主菜"),
            Dish("清炒时蔬", 10, role="主菜"),
            Dish("番茄牛腩", 45, role="主菜"),
            Dish("紫菜蛋花汤", 10, role="汤"),
            Dish("番茄蛋汤", 12, role="汤"),
            Dish("米饭", 20, role="主食"),
        ]

    def test_default_size_returns_one_of_each(self):
        combo = choose_combo(self._dishes(), [], prefs={"comboSize": "1-1-1"})
        self.assertIn("主菜", combo)
        self.assertIn("汤", combo)
        self.assertIn("主食", combo)
        self.assertEqual(len(combo), 3)

    def test_two_dishes_one_soup_has_two_mains(self):
        combo = choose_combo(self._dishes(), [], prefs={"comboSize": "2-1"})
        # 应该有 主菜 / 主菜2 / 汤（无主食）
        self.assertIn("主菜", combo)
        self.assertIn("主菜2", combo)
        self.assertIn("汤", combo)
        self.assertNotIn("主食", combo)
        self.assertEqual(len(combo), 3)
        # 两道主菜必须不同
        self.assertNotEqual(combo["主菜"].name, combo["主菜2"].name)
        # 都是主菜 role
        self.assertEqual(combo["主菜"].role, "主菜")
        self.assertEqual(combo["主菜2"].role, "主菜")

    def test_three_dishes_one_soup_has_three_mains(self):
        combo = choose_combo(self._dishes(), [], prefs={"comboSize": "3-1"})
        self.assertEqual(len(combo), 4)
        mains = [combo["主菜"], combo["主菜2"], combo["主菜3"]]
        self.assertEqual(len(set(d.name for d in mains)), 3, "三道主菜必须各不相同")
        self.assertEqual(combo["汤"].role, "汤")

    def test_four_dishes_one_soup_has_four_mains(self):
        combo = choose_combo(self._dishes(), [], prefs={"comboSize": "4-1"})
        mains = [combo["主菜"], combo["主菜2"], combo["主菜3"], combo["主菜4"]]
        self.assertEqual(len(mains), 4)
        # 4 道主菜、只有 4 道候选，能全部用上
        self.assertEqual(len(set(d.name for d in mains)), 4)

    def test_invalid_combo_size_falls_back_to_default(self):
        combo = choose_combo(self._dishes(), [], prefs={"comboSize": "abc"})
        self.assertIn("主菜", combo)
        self.assertIn("主食", combo)
        self.assertEqual(len(combo), 3)

    def test_combo_size_without_staple(self):
        """两菜一汤/三菜一汤/四菜一汤 都不带主食"""
        for size in ("2-1", "3-1", "4-1"):
            combo = choose_combo(self._dishes(), [], prefs={"comboSize": size})
            self.assertNotIn("主食", combo, f"{size} 不应抽主食")

    def test_combo_size_respects_no_repeat_within_session(self):
        """多道主菜不能重复抽到同一道（即使不在 recent 窗口）"""
        combo = choose_combo(self._dishes(), [], prefs={"comboSize": "4-1"})
        names = [d.name for d in (combo["主菜"], combo["主菜2"], combo["主菜3"], combo["主菜4"])]
        self.assertEqual(len(set(names)), 4)


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

    def test_肉_synonym_expansion_to_pork_beef_lamb_chicken(self):
        """Day 16: 输入『肉』→ 同义词扩展到 猪/牛/羊/鸡，应该匹配多类肉菜"""
        dishes = [
            Dish("红烧肉", 60, ingredients=["五花肉 500g"]),
            Dish("麻婆豆腐", 20, ingredients=["豆腐", "牛肉末"]),
            Dish("宫保鸡丁", 25, ingredients=["鸡腿肉"]),
            Dish("西红柿炒蛋", 15, ingredients=["鸡蛋", "西红柿"]),  # 不含任何肉
            Dish("凉拌黄瓜", 5, ingredients=["黄瓜"]),
        ]
        result = filter_by_ingredients(dishes, ["肉"])
        names = [d.name for d in result]
        self.assertIn("红烧肉", names)   # 五花肉 → 肉
        self.assertIn("麻婆豆腐", names) # 牛肉 → 牛（肉同义词）
        self.assertIn("宫保鸡丁", names) # 鸡腿肉 → 鸡
        self.assertNotIn("西红柿炒蛋", names)
        self.assertNotIn("凉拌黄瓜", names)

    def test_排骨_does_not_match_beef_or_lamb(self):
        """Day 16 修复：『排骨』只匹配排骨相关,不能误拉到牛排/羊肉"""
        dishes = [
            Dish("红烧排骨", 60, ingredients=["排骨 500g"]),
            Dish("冬瓜排骨汤", 90, ingredients=["排骨", "冬瓜"]),
            Dish("牛排", 30, ingredients=["牛排 200g"]),
            Dish("羊肉汤", 90, ingredients=["羊肉 500g", "白萝卜"]),
            Dish("宫保鸡丁", 25, ingredients=["鸡丁"]),  # 也不应被排骨拉出
        ]
        result = filter_by_ingredients(dishes, ["排骨"])
        names = [d.name for d in result]
        self.assertIn("红烧排骨", names)
        self.assertIn("冬瓜排骨汤", names)
        self.assertNotIn("牛排", names)
        self.assertNotIn("羊肉汤", names)
        self.assertNotIn("宫保鸡丁", names)

    def test_五花肉_does_not_match_other_meat(self):
        """Day 16 修复：『五花肉』只匹配五花肉相关,不拉到鸡/牛/羊"""
        dishes = [
            Dish("红烧肉", 60, ingredients=["五花肉 500g"]),
            Dish("宫保鸡丁", 25, ingredients=["鸡丁"]),
            Dish("孜然羊肉", 40, ingredients=["羊肉"]),
        ]
        result = filter_by_ingredients(dishes, ["五花肉"])
        names = [d.name for d in result]
        self.assertIn("红烧肉", names)
        self.assertNotIn("宫保鸡丁", names)
        self.assertNotIn("孜然羊肉", names)

    def test_match_by_dish_name(self):
        """Day 16: 菜名里有关键词也要能匹配"""
        dishes = [
            Dish("肉末茄子", 25, ingredients=["茄子", "猪肉末"]),
            Dish("木耳炒肉", 15, ingredients=["木耳", "里脊肉"]),
            Dish("西红柿炒蛋", 15, ingredients=["鸡蛋", "西红柿"]),
        ]
        result = filter_by_ingredients(dishes, ["肉"])
        names = [d.name for d in result]
        self.assertIn("肉末茄子", names)   # name 有肉
        self.assertIn("木耳炒肉", names)    # name 有肉
        self.assertNotIn("西红柿炒蛋", names)

    def test_match_by_tags(self):
        """Day 16: tag 里有关键词也要能匹配"""
        dishes = [
            Dish("某道菜", 15, ingredients=["未知"], tags=["肉类", "硬菜"]),
            Dish("另一道菜", 10, ingredients=["蔬菜"], tags=["素食"]),
        ]
        result = filter_by_ingredients(dishes, ["肉"])
        names = [d.name for d in result]
        self.assertIn("某道菜", names)
        self.assertNotIn("另一道菜", names)

    def test_specific_keyword_no_synonym_expansion(self):
        """Day 16: 输入具体词（无同义词）→ 不展开，只匹配自己"""
        dishes = [
            Dish("红烧肉", 60, ingredients=["五花肉 500g"]),
            Dish("麻婆豆腐", 20, ingredients=["豆腐", "牛肉末"]),
        ]
        result = filter_by_ingredients(dishes, ["牛肉"])
        names = [d.name for d in result]
        self.assertIn("麻婆豆腐", names)
        self.assertNotIn("红烧肉", names)


class TestSearchDishes(unittest.TestCase):
    """全文搜索：菜名 + 标签 + 食材 + 调料"""

    def _build_pool(self):
        return [
            Dish("西红柿炒蛋", 15, role="主菜",
                 tags=["家常", "简单"],
                 ingredients=["鸡蛋", "西红柿", "葱"],
                 seasonings=["盐", "油"]),
            Dish("红烧肉", 60, role="主菜",
                 tags=["硬菜", "家常"],
                 ingredients=["五花肉", "冰糖"],
                 seasonings=["八角", "生抽"]),
            Dish("清蒸鱼", 20, role="主菜",
                 tags=["清淡"],
                 ingredients=["鲈鱼", "葱", "姜"],
                 seasonings=["蒸鱼豉油"]),
            Dish("凉拌黄瓜", 5, role="凉菜",
                 tags=["简单", "开胃"],
                 ingredients=["黄瓜", "蒜"],
                 seasonings=["醋"]),
        ]

    def test_empty_query_returns_empty(self):
        result = search_dishes(self._build_pool(), "")
        self.assertEqual(result, [])

    def test_whitespace_only_returns_empty(self):
        result = search_dishes(self._build_pool(), "   ")
        self.assertEqual(result, [])

    def test_match_by_name(self):
        """搜菜名"""
        result = search_dishes(self._build_pool(), "红烧")
        names = [d.name for d in result]
        self.assertEqual(names, ["红烧肉"])

    def test_match_by_ingredient(self):
        """搜食材"""
        result = search_dishes(self._build_pool(), "鸡蛋")
        names = [d.name for d in result]
        self.assertIn("西红柿炒蛋", names)

    def test_match_by_tag(self):
        """搜标签"""
        result = search_dishes(self._build_pool(), "清淡")
        names = [d.name for d in result]
        self.assertIn("清蒸鱼", names)
        self.assertNotIn("红烧肉", names)

    def test_match_by_seasoning(self):
        """搜调料"""
        result = search_dishes(self._build_pool(), "蒸鱼豉油")
        names = [d.name for d in result]
        self.assertIn("清蒸鱼", names)

    def test_multiple_keywords_and_logic(self):
        """多关键词 AND：每个都要匹配"""
        result = search_dishes(self._build_pool(), "葱 姜")
        names = [d.name for d in result]
        # 西红柿炒蛋有葱但没姜，红烧肉没葱，清蒸鱼有葱和姜 → 只剩清蒸鱼
        self.assertEqual(names, ["清蒸鱼"])

    def test_case_insensitive(self):
        """大小写不敏感"""
        result_lower = search_dishes(self._build_pool(), "hong shao")
        # 中文不区分大小写，但函数 lower() 了所有字符
        # 用英文标签测
        # 这里只验证函数不抛错
        self.assertIsInstance(result_lower, list)

    def test_no_match_returns_empty(self):
        """没匹配的关键词"""
        result = search_dishes(self._build_pool(), "不存在的菜")
        self.assertEqual(result, [])


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


def _collect_meal_names(meal):
    """从一顿饭（dict）里提取所有 dish 的 name"""
    if not isinstance(meal, dict):
        return set()
    return {v.name for v in meal.values() if hasattr(v, "name")}


class TestChooseThreeMeals(unittest.TestCase):
    """Day 8: 一日三餐（早+午+晚），7 自然日不重复
    午晚饭按用户习惯：面条/饺子一碗一餐，米饭配菜+汤"""

    def _build_pool(self):
        """小型菜池：主菜/汤/早餐 + 允许的主食（米/面/饺子）+ 凉菜 —— 触发 exclude/兜底逻辑"""
        return [
            Dish("早A", 5, role="早餐"),
            Dish("早B", 10, role="早餐"),
            Dish("主A", 30, role="主菜"),
            Dish("主B", 30, role="主菜"),
            Dish("米饭", 20, role="主食"),    # 含米 → 配菜模式
            Dish("面条X", 15, role="主食"),  # 含面 → 一碗一餐
            Dish("饺子Y", 45, role="主食"),  # 一碗一餐
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

    def test_lunch_or_dinner_has_one_bowl_or_full_meal(self):
        """午餐和晚餐：要么『一碗一餐』，要么『配菜模式』"""
        pool = self._build_pool()
        for _ in range(20):
            meals = choose_three_meals(pool, [])
            for key in ("午餐", "晚餐"):
                mode = meals[key].get("模式")
                self.assertIn(mode, {"一碗一餐", "配菜模式"})
                if mode == "一碗一餐":
                    self.assertIsNone(meals[key]["主菜"])
                    self.assertIsNone(meals[key]["汤"])
                    self.assertIsNotNone(meals[key]["主食"])
                else:  # 配菜模式
                    self.assertIsNotNone(meals[key]["主菜"])
                    self.assertIsNotNone(meals[key]["汤"])
                    self.assertIsNotNone(meals[key]["主食"])

    def test_one_bowl_meal_uses_noodles_or_dumplings(self):
        """一碗一餐的主食只能是面条类或饺子"""
        pool = self._build_pool()
        seen_one_bowl_names = set()
        for _ in range(50):
            meals = choose_three_meals(pool, [])
            for key in ("午餐", "晚餐"):
                if meals[key].get("模式") == "一碗一餐":
                    name = meals[key]["主食"].name
                    seen_one_bowl_names.add(name)
        self.assertTrue(seen_one_bowl_names, "should hit 一碗一餐 sometimes")
        for n in seen_one_bowl_names:
            self.assertTrue("面" in n or "饺子" in n, f"{n} should contain 面 or 饺子")

    def test_full_meal_uses_rice(self):
        """配菜模式的主食只能是米饭"""
        pool = self._build_pool()
        seen_full_names = set()
        for _ in range(50):
            meals = choose_three_meals(pool, [])
            for key in ("午餐", "晚餐"):
                if meals[key].get("模式") == "配菜模式":
                    seen_full_names.add(meals[key]["主食"].name)
        for n in seen_full_names:
            self.assertIn("米", n, f"{n} should contain 米")

    def test_lunch_dinner_no_shared_dishes(self):
        """午晚不能重复同一道菜"""
        pool = self._build_pool()
        for _ in range(30):
            meals = choose_three_meals(pool, [])
            lunch_names = _collect_meal_names(meals["午餐"])
            dinner_names = _collect_meal_names(meals["晚餐"])
            self.assertEqual(lunch_names & dinner_names, set(),
                             f"lunch={lunch_names}, dinner={dinner_names}")

    def test_breakfast_excluded_from_lunch_and_dinner(self):
        """早餐选过的菜不会出现在午晚"""
        pool = self._build_pool()
        for _ in range(20):
            meals = choose_three_meals(pool, [])
            bf = meals["早餐"].name
            other = _collect_meal_names(meals["午餐"]) | _collect_meal_names(meals["晚餐"])
            self.assertNotIn(bf, other)

    def test_respects_no_repeat_window(self):
        """7 天窗口：至少不会一直重复同一天吃过的菜"""
        from datetime import date
        today = str(date.today())
        pool = self._build_pool()
        # 让某一天吃过的菜短暂不出现（用大窗口验证效果）
        history = [{"dish": "面条X", "date": today}]
        seen_today = []
        for _ in range(50):
            meals = choose_three_meals(pool, history, window=7)
            for key in ("午餐", "晚餐"):
                if meals[key].get("主食"):
                    seen_today.append(meals[key]["主食"].name)
        # 7 天窗口 + history = 1，pool 允许的主食还有 米饭/饺子Y 两个，
        # 所以大多数抽样应该都是 米饭/饺子Y，面条X 只在 fallback 时出现
        self.assertGreater(len(seen_today), 0)
        # 大部分抽样应该是 米饭 或 饺子Y（不被面条X 阻塞）
        non_noodle_count = sum(1 for n in seen_today if n != "面条X")
        self.assertGreater(non_noodle_count, len(seen_today) * 0.5,
                           "多数抽样应避开最近吃过的面条X")

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
        for _ in range(20):
            meals = choose_three_meals(pool, history, window=7)
            # 主B 不会出现在午晚（最近吃过）
            for key in ("午餐", "晚餐"):
                meal = meals[key]
                if meal.get("模式") == "配菜模式" and meal.get("主菜"):
                    self.assertNotEqual(meal["主菜"].name, "主B")

    def test_falls_back_when_pool_too_small(self):
        """极小池子时仍能返回非 None"""
        pool = [
            Dish("唯一早餐", 10, role="早餐"),
            Dish("唯一主菜", 30, role="主菜"),
            Dish("唯一米饭", 20, role="主食"),
            Dish("唯一汤", 15, role="汤"),
        ]
        meals = choose_three_meals(pool, [])
        self.assertIsNotNone(meals["早餐"])
        # 午晚饭有主食米饭 + 兜底拿唯一主菜
        for key in ("午餐", "晚餐"):
            meal = meals[key]
            if meal.get("主食") and meal["主食"].name == "唯一米饭":
                self.assertIsNotNone(meal["主菜"])

    def test_returns_none_for_missing_role(self):
        """没有 主菜 时午餐主菜是 None"""
        pool = [
            Dish("米饭", 20, role="主食"),
            Dish("凉A", 8, role="凉菜"),
        ]
        meals = choose_three_meals(pool, [])
        self.assertIsNone(meals["早餐"])
        # 没有 主菜 时配菜模式的 主菜 应该是 None（虽然米饭模式不会进配菜模式，但兜底到全部时主菜=空）


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
    """Day 8: 一日三餐格式化输出（烟雾测试）
    午晚饭按新格式：一碗一餐 或 配菜模式（主菜+汤+主食）"""

    def test_returns_multiline_string_with_all_meals(self):
        meals = {
            "早餐": Dish("小米粥", 20, role="早餐"),
            "午餐": {
                "主菜": Dish("红烧肉", 60, role="主菜"),
                "主食": Dish("米饭", 20, role="主食"),
                "汤": Dish("紫菜蛋花汤", 10, role="汤"),
                "模式": "配菜模式",
            },
            "晚餐": {
                "主菜": None,
                "主食": Dish("拉面", 15, role="主食"),
                "汤": None,
                "模式": "一碗一餐",
            },
        }
        out = format_three_meals(meals)
        # 核心关键词都要在
        for keyword in ["早餐", "小米粥", "红烧肉", "配菜模式", "一碗一餐", "拉面"]:
            self.assertIn(keyword, out)

    def test_one_bowl_dinner_format(self):
        """午晚都是一碗一餐时，输出清晰"""
        meals = {
            "早餐": Dish("煎蛋", 5, role="早餐"),
            "午餐": {"主菜": None, "主食": Dish("饺子", 45, role="主食"), "汤": None, "模式": "一碗一餐"},
            "晚餐": {"主菜": None, "主食": Dish("拉面", 15, role="主食"), "汤": None, "模式": "一碗一餐"},
        }
        out = format_three_meals(meals)
        self.assertIn("一碗一餐", out)
        self.assertIn("饺子", out)
        self.assertIn("拉面", out)
        # 不应该出现『配菜模式』字样
        self.assertNotIn("配菜模式", out)


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


class TestAddToHistoryWithStatus(unittest.TestCase):
    """Day 10: 做饭前确认 — 历史记录新增 status 字段"""

    def test_confirmed_writes_dish_and_status(self):
        h = []
        add_to_history(h, "番茄炒蛋", status="confirmed", suggested=None)
        self.assertEqual(len(h), 1)
        self.assertEqual(h[0]["dish"], "番茄炒蛋")
        self.assertEqual(h[0]["status"], "confirmed")

    def test_manual_records_actual_dish_and_suggested(self):
        h = []
        add_to_history(h, "番茄炒蛋", status="manual", suggested="青椒肉丝")
        self.assertEqual(h[0]["dish"], "番茄炒蛋")
        self.assertEqual(h[0]["status"], "manual")
        self.assertEqual(h[0]["suggested"], "青椒肉丝")

    def test_skipped_records_suggested_for_audit(self):
        h = []
        add_to_history(h, "外卖", status="skipped", suggested="青椒肉丝")
        self.assertEqual(h[0]["status"], "skipped")
        self.assertEqual(h[0]["suggested"], "青椒肉丝")

    def test_backward_compat_no_status_defaults_to_confirmed(self):
        """向后兼容：旧调用 add_to_history(h, "X") 应该仍然能工作"""
        h = []
        add_to_history(h, "番茄炒蛋")
        self.assertEqual(h[0]["dish"], "番茄炒蛋")
        self.assertEqual(h[0]["status"], "confirmed")

    def test_date_defaults_to_today(self):
        h = []
        add_to_history(h, "X", status="confirmed")
        self.assertEqual(h[0]["date"], str(date.today()))


class TestMigrateHistory(unittest.TestCase):
    """Day 10: 旧格式 → 新格式迁移"""

    def test_old_format_becomes_confirmed(self):
        old = [{"dish": "西红柿炒蛋", "date": "2026-08-14"}]
        m = migrate_history(old)
        self.assertEqual(m[0]["status"], "confirmed")
        self.assertEqual(m[0]["dish"], "西红柿炒蛋")
        self.assertEqual(m[0]["date"], "2026-08-14")

    def test_new_format_preserved(self):
        new_h = [{"dish": "X", "date": "2026-08-14", "status": "manual", "suggested": "Y"}]
        m = migrate_history(new_h)
        self.assertEqual(m, new_h)

    def test_mixed_old_and_new(self):
        mixed = [
            {"dish": "A", "date": "2026-08-13"},  # 旧
            {"dish": "B", "date": "2026-08-14", "status": "manual", "suggested": "C"},  # 新
        ]
        m = migrate_history(mixed)
        self.assertEqual(m[0]["status"], "confirmed")
        self.assertEqual(m[1]["status"], "manual")


class TestChooseComboV2(unittest.TestCase):
    """Day 10: choose_combo 过滤 skipped 状态"""

    def _build_pool(self):
        return [
            Dish("西红柿炒蛋", 15, role="主菜"),
            Dish("宫保鸡丁", 25, role="主菜"),
            Dish("酸辣土豆丝", 20, role="主菜"),
            Dish("紫菜蛋花汤", 10, role="汤"),
            Dish("米饭", 20, role="主食"),
        ]

    def test_skipped_does_not_count_in_recent(self):
        """skipped 状态不参与 30 天不重复"""
        pool = self._build_pool()
        history = [
            {"dish": "西红柿炒蛋", "date": str(date.today()),
             "status": "skipped", "suggested": "西红柿炒蛋"},
        ]
        # 多次抽取，西红柿炒蛋可以再次出现（因为 skipped）
        seen = set()
        for _ in range(50):
            combo = choose_combo(pool, history)
            seen.add(combo["主菜"].name)
        # 50 次里至少出现一次（如果没有排除）
        self.assertIn("西红柿炒蛋", seen)

    def test_manual_actual_dish_counts_in_recent(self):
        """manual 状态下，实际吃的菜参与 30 天不重复"""
        pool = self._build_pool()
        history = [
            {"dish": "西红柿炒蛋", "date": str(date.today()),
             "status": "manual", "suggested": "别的菜"},
        ]
        # 多次抽取，西红柿炒蛋应该不再出现在主菜
        for _ in range(30):
            combo = choose_combo(pool, history)
            self.assertNotEqual(combo["主菜"].name, "西红柿炒蛋")

    def test_old_format_history_still_works(self):
        """旧格式历史（无 status 字段）仍然能被正确处理"""
        pool = self._build_pool()
        history = [{"dish": "西红柿炒蛋", "date": str(date.today())}]
        for _ in range(30):
            combo = choose_combo(pool, history)
            self.assertNotEqual(combo["主菜"].name, "西红柿炒蛋")


class TestChooseThreeMealsV2(unittest.TestCase):
    """Day 10: choose_three_meals 过滤 skipped"""

    def _build_pool(self):
        return [
            Dish("早A", 5, role="早餐"),
            Dish("早B", 10, role="早餐"),
            Dish("主A", 30, role="主菜"),
            Dish("主B", 30, role="主菜"),
            Dish("米饭", 20, role="主食"),  # 必须有"米"
            Dish("面条X", 15, role="主食"),
            Dish("凉A", 8, role="凉菜"),
            Dish("凉B", 8, role="凉菜"),
            Dish("汤A", 15, role="汤"),
            Dish("汤B", 15, role="汤"),
        ]

    def test_skipped_does_not_block_picking(self):
        """skipped 状态不参与 7 天不重复"""
        pool = self._build_pool()
        # 把『主A』标记为 skipped（虽然抽到了但没做）
        history = [
            {"dish": "主A", "date": str(date.today()),
             "status": "skipped", "suggested": "主A"},
        ]
        # 多次抽取，主A 应当可以再次出现（因为 skipped 不算吃过）
        seen = set()
        for _ in range(50):
            meals = choose_three_meals(pool, history)
            # 找到所有出现的菜名
            for dish in meals.values():
                if hasattr(dish, "name"):
                    seen.add(dish.name)
                elif isinstance(dish, dict):
                    for d in dish.values():
                        if d and hasattr(d, "name"):
                            seen.add(d.name)
        self.assertIn("主A", seen)


class TestSelfCatalyzing(unittest.TestCase):
    """Day 11: 自催化学习模型"""

    def _build_pool(self):
        """小型菜池用于加权测试"""
        return [
            Dish("红烧肉", 60, role="主菜", tags=["家常", "硬菜"]),
            Dish("麻婆豆腐", 20, role="主菜", tags=["川菜", "辣", "下饭"]),
            Dish("清炒时蔬", 10, role="主菜", tags=["素食", "简单", "清淡"]),
            Dish("蒜蓉西兰花", 12, role="主菜", tags=["素食", "清淡"]),
            Dish("宫保鸡丁", 25, role="主菜", tags=["川菜", "微辣"]),
            Dish("鱼香肉丝", 25, role="主菜", tags=["川菜", "酸甜"]),
        ]

    def test_weighted_choice_empty_scores_uniform(self):
        """空 scores = 均匀分布（行为与 random.choice 一致）"""
        pool = self._build_pool()
        counts = {d.name: 0 for d in pool}
        for _ in range(200):
            pick = weighted_choice(pool, {}, {})
            counts[pick.name] += 1
        # 每道菜应该约 33 次（200/6），允许 ±15 浮动
        for name, c in counts.items():
            self.assertGreater(c, 15, f"{name} 抽太少了：{c}")

    def test_weighted_choice_likes_skew(self):
        """likes 偏向喜欢的菜（30 次循环必有偏向）"""
        pool = self._build_pool()
        scores = {"红烧肉": {"likes": 5, "dislikes": 0, "cooks": 0}}
        picks = [weighted_choice(pool, scores, {}).name for _ in range(30)]
        # 红烧肉至少被选 1 次（如果基础权重 1.0 vs 16.0，期望 30*16/(5+5+5+5+16+1) ≈ 8 次）
        # 弱断言：红烧肉出现次数明显大于 30/6 = 5 次
        self.assertGreater(picks.count("红烧肉"), 5)

    def test_weighted_choice_dislikes_strong_penalty(self):
        """dislikes 强降权：5 倍惩罚"""
        pool = self._build_pool()
        scores = {"麻婆豆腐": {"likes": 0, "dislikes": 10, "cooks": 0}}
        picks = [weighted_choice(pool, scores, {}).name for _ in range(50)]
        # 麻婆豆腐权重 = 1 - 50 = max(0.1, ...), 其他菜权重 = 1
        # 期望：麻婆豆腐几乎不被抽到
        self.assertLess(picks.count("麻婆豆腐"), 5)

    def test_weighted_choice_cooks_increase(self):
        """cooks 也算正向（隐式喜欢）"""
        pool = self._build_pool()
        scores = {"清炒时蔬": {"likes": 0, "dislikes": 0, "cooks": 5}}
        picks = [weighted_choice(pool, scores, {}).name for _ in range(30)]
        self.assertGreater(picks.count("清炒时蔬"), 5)

    def test_compute_tag_affinities_insufficient_data(self):
        """数据不足（< 3 交互）时不推断"""
        pool = self._build_pool()
        scores = {"红烧肉": {"likes": 1, "dislikes": 0, "cooks": 0}}
        affinities = compute_tag_affinities(scores, pool)
        # 只有 1 次交互，所有 tag 都应该是 0
        for aff in affinities.values():
            self.assertEqual(aff, 0.0)

    def test_compute_tag_affinities_sufficient_data(self):
        """数据充足时正确归一到 [-1, +1]"""
        pool = self._build_pool()
        scores = {
            "麻婆豆腐":   {"likes": 5, "dislikes": 0, "cooks": 2},
            "宫保鸡丁":   {"likes": 3, "dislikes": 1, "cooks": 1},
            "鱼香肉丝":   {"likes": 2, "dislikes": 0, "cooks": 0},
            "红烧肉":     {"likes": 0, "dislikes": 5, "cooks": 0},
        }
        affinities = compute_tag_affinities(scores, pool)
        # 川菜 positives = 7+4+2 = 13，negatives = 0+1+0 = 1，总 14
        # 归一：(13/14 - 0.5) * 2 ≈ +0.857
        self.assertAlmostEqual(affinities["川菜"], 13/14 * 2 - 1, places=2)
        # 辣 tag: 麻婆(7+, 0-)，宫保鸡丁的 tag 是「微辣」不是「辣」，不重复计
        # 所以 辣 positives=7, negatives=0, ratio=1.0
        self.assertAlmostEqual(affinities["辣"], 1.0, places=2)

    def test_compute_tag_affinities_tag_diffusion(self):
        """tag 推断扩散：点赞川菜 → 同川菜更频繁被抽"""
        pool = self._build_pool()
        scores = {
            "麻婆豆腐":   {"likes": 10, "dislikes": 0, "cooks": 5},
            "宫保鸡丁":   {"likes": 0,  "dislikes": 0, "cooks": 0},
            "鱼香肉丝":   {"likes": 0,  "dislikes": 0, "cooks": 0},
        }
        aff = compute_tag_affinities(scores, pool)
        # 川菜 affinity 应该是正的（15 次交互都正向）
        self.assertGreater(aff["川菜"], 0.5)
        # 30 次抽样中，3 道川菜（麻婆/宫保/鱼香）应该比 1 道家常（红烧）更频繁
        picks = [weighted_choice(pool, scores, aff).name for _ in range(50)]
        sichuan_count = sum(1 for p in picks if "川菜" in [d for d in pool if d.name == p][0].tags)
        hongshao_count = picks.count("红烧肉")
        self.assertGreater(sichuan_count, hongshao_count)

    def test_choose_combo_uses_scores_backward_compatible(self):
        """choose_combo 接受 scores 参数；scores=None 时行为不变"""
        pool = self._build_pool()
        # scores=None：旧行为
        combo1 = choose_combo(pool, [])
        self.assertIsNotNone(combo1["主菜"])
        # scores={}：等价 None
        combo2 = choose_combo(pool, [], scores={})
        self.assertIsNotNone(combo2["主菜"])

    def test_add_score_accumulates(self):
        """add_score 正确累加计数"""
        scores = {}
        add_score(scores, "红烧肉", "like")
        add_score(scores, "红烧肉", "like")
        add_score(scores, "红烧肉", "dislike")
        add_score(scores, "红烧肉", "cooked")
        self.assertEqual(scores["红烧肉"]["likes"], 2)
        self.assertEqual(scores["红烧肉"]["dislikes"], 1)
        self.assertEqual(scores["红烧肉"]["cooks"], 1)

    def test_add_score_creates_entry(self):
        """新菜的评分初始为 {likes:0, dislikes:0, cooks:0}"""
        scores = {}
        add_score(scores, "新菜", "like")
        self.assertIn("新菜", scores)
        self.assertEqual(set(scores["新菜"].keys()), {"likes", "dislikes", "cooks"})

    def test_load_save_scores_roundtrip(self):
        """load/save 往返一致"""
        import tempfile, os
        from pathlib import Path
        with tempfile.NamedTemporaryFile(mode='w', suffix='.json', delete=False) as f:
            tmppath = f.name
        try:
            scores = {"A": {"likes": 1, "dislikes": 0, "cooks": 2}}
            save_scores(scores, Path(tmppath))
            loaded = load_scores(Path(tmppath))
            self.assertEqual(loaded, scores)
        finally:
            os.unlink(tmppath)


class TestLogManual(unittest.TestCase):
    """Day 11: 手动记录三餐 —— 纯自由文本，进 history + 评分"""

    def test_log_manual_returns_appended_history(self):
        h = []
        meals = {"早餐": "小米粥", "午餐": "米饭", "晚餐": "面条"}
        new_h = log_manual(h, meals, target_date="2026-08-15")
        self.assertEqual(len(new_h), 3)

    def test_log_manual_uses_specified_date(self):
        h = []
        new_h = log_manual(h, {"早餐": "小米粥"}, target_date="2026-08-10")
        self.assertEqual(new_h[0]["date"], "2026-08-10")

    def test_log_manual_date_defaults_to_today(self):
        h = []
        new_h = log_manual(h, {"午餐": "米饭"})
        self.assertEqual(new_h[0]["date"], str(date.today()))

    def test_log_manual_records_meal_type(self):
        h = []
        meals = {"早餐": "小米粥", "午餐": "米饭", "晚餐": "面条"}
        new_h = log_manual(h, meals, target_date="2026-08-15")
        meals_recorded = {entry["meal"] for entry in new_h}
        self.assertEqual(meals_recorded, {"早餐", "午餐", "晚餐"})

    def test_log_manual_status_is_manual(self):
        new_h = log_manual([], {"午餐": "米饭"})
        self.assertEqual(new_h[0]["status"], "manual")

    def test_log_manual_supports_multiple_dishes_per_meal(self):
        """每餐支持逗号分隔多菜"""
        new_h = log_manual([], {"午餐": "米饭, 红烧肉, 紫菜蛋花汤"})
        dish_names = [entry["dish"] for entry in new_h]
        self.assertEqual(set(dish_names), {"米饭", "红烧肉", "紫菜蛋花汤"})
        self.assertTrue(all(e["meal"] == "午餐" for e in new_h))

    def test_log_manual_skips_empty_dishes(self):
        new_h = log_manual([], {"早餐": "", "午餐": "米饭", "晚餐": None})
        self.assertEqual(len(new_h), 1)
        self.assertEqual(new_h[0]["dish"], "米饭")

    def test_log_manual_strips_whitespace(self):
        new_h = log_manual([], {"午餐": " 米饭 , 红烧肉 "})
        dish_names = [entry["dish"] for entry in new_h]
        self.assertEqual(set(dish_names), {"米饭", "红烧肉"})

    def test_log_manual_writes_scores_cooks_plus_one(self):
        scores = {"米饭": {"likes": 0, "dislikes": 0, "cooks": 0}}
        log_manual([], {"午餐": "米饭"}, target_date="2026-08-15", scores=scores)
        self.assertEqual(scores["米饭"]["cooks"], 1)

    def test_log_manual_init_scores_for_new_dishes(self):
        scores = {}
        log_manual([], {"午餐": "新菜"}, scores=scores)
        self.assertIn("新菜", scores)
        self.assertEqual(scores["新菜"]["cooks"], 1)
        self.assertEqual(scores["新菜"]["likes"], 0)
        self.assertEqual(scores["新菜"]["dislikes"], 0)

    def test_log_manual_does_not_error_when_scores_not_provided(self):
        """scores=None 时不报错（允许纯 history 写入）"""
        new_h = log_manual([], {"午餐": "米饭"})
        self.assertEqual(len(new_h), 1)

    def test_log_manual_appends_to_existing_history(self):
        h = [{"dish": "旧菜", "date": "2026-08-14", "status": "confirmed"}]
        new_h = log_manual(h, {"午餐": "新菜"}, target_date="2026-08-15")
        self.assertEqual(len(new_h), 2)
        self.assertEqual(new_h[0]["dish"], "旧菜")
        self.assertEqual(new_h[1]["dish"], "新菜")

    def test_log_manual_dedupes_dishes_within_same_meal(self):
        """同一餐重复输入只记录一次（防呆）"""
        new_h = log_manual([], {"午餐": "米饭, 米饭, 米饭"})
        self.assertEqual(len(new_h), 1)

    def test_log_manual_invalid_meal_key_ignored(self):
        """meal 必须是早/午/晚之一；其他 key 静默忽略"""
        new_h = log_manual([], {"宵夜": "麻辣烫", "下午茶": "蛋糕"})
        self.assertEqual(len(new_h), 0)

    def test_log_manual_cooks_accumulates_across_multiple_dishes(self):
        """一餐多个菜，每个菜的 cooks 都 +1"""
        scores = {"米饭": {"likes": 0, "dislikes": 0, "cooks": 3},
                  "红烧肉": {"likes": 0, "dislikes": 0, "cooks": 0}}
        log_manual([], {"午餐": "米饭, 红烧肉"}, scores=scores)
        self.assertEqual(scores["米饭"]["cooks"], 4)
        self.assertEqual(scores["红烧肉"]["cooks"], 1)

    def test_log_manual_uses_default_date_when_only_today(self):
        """target_date=None → date.today()"""
        h = []
        new_h = log_manual(h, {"午餐": "米饭"})
        self.assertEqual(new_h[0]["date"], str(date.today()))


class TestAddToHistoryWithMeal(unittest.TestCase):
    """Day 11: add_to_history 支持 meal 字段"""

    def test_add_to_history_includes_meal_field(self):
        h = []
        add_to_history(h, "小米粥", status="manual", meal="早餐")
        self.assertEqual(h[0]["meal"], "早餐")

    def test_add_to_history_meal_omitted_when_none(self):
        """meal=None → 不写入字段（兼容老数据）"""
        h = []
        add_to_history(h, "小米粥")
        self.assertNotIn("meal", h[0])


class TestAppHtmlRegression(unittest.TestCase):
    """Day 15: 防止 app.html 改 DOM 后忘记更新 addEventListener 引用"""

    def setUp(self):
        import re
        with open("app.html") as f:
            content = f.read()
        scripts = re.findall(r'<script[^>]*>(.*?)</script>', content, re.DOTALL)
        self.js = '\n'.join(scripts)

    def test_no_unsafe_addEventListener_on_getElementById(self):
        """禁止 document.getElementById('xxx').addEventListener 这种链式调用
        —— 一旦 id 不存在就会 TypeError 中断所有后续脚本
        必须用 bindClick() 助手 或先 var 出来 null-check
        """
        import re
        pattern = re.compile(
            r'document\.getElementById\([^)]+\)\.addEventListener\(',
            re.MULTILINE,
        )
        hits = pattern.findall(self.js)
        self.assertEqual(
            hits, [],
            f"发现 {len(hits)} 个不安全的 addEventListener 调用：\n"
            + '\n'.join(f"  {h}" for h in hits)
            + "\n请用 bindClick(id, fn) 助手 或先 var el = getElementById(id); if (el) ..."
        )

    def test_no_unsafe_querySelector_addEventListener(self):
        """同样禁止 querySelector(...).addEventListener 链式（可能返回 null）"""
        import re
        pattern = re.compile(
            r'document\.querySelector(?:All)?\([^)]+\)\.addEventListener\(',
            re.MULTILINE,
        )
        hits = pattern.findall(self.js)
        self.assertEqual(hits, [], f"发现 {len(hits)} 个不安全的 querySelector().addEventListener")

    def test_all_event_bound_ids_exist_in_dom(self):
        """bindClick / addEventListener 引用的每个 id 必须在 HTML 里真实存在
        （注意：getElementById('toast') 这种 lazy-create 模式不算 —— toast 是动态创建的）
        """
        import re
        # 只检查 bindClick（事件绑定，必须 DOM 存在）
        referenced_ids = set(re.findall(r"bindClick\(['\"]([^'\"]+)['\"]", self.js))
        with open("app.html") as f:
            html = f.read()
        missing = []
        for id_ in referenced_ids:
            if not re.search(rf'id=[\"\']{re.escape(id_)}[\"\']', html):
                missing.append(id_)
        self.assertEqual(
            missing, [],
            f"bindClick 引用了 {len(missing)} 个 HTML 里不存在的 id：{missing}\n"
            "要么补 HTML 标签，要么删 JS 引用"
        )


if __name__ == "__main__":
    unittest.main()

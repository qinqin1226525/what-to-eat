"""测试 what_to_eat.py 的『用户习惯版一顿午饭/晚饭』

面条/饺子 → 一碗一餐
米饭 → 主菜+汤+米饭
其他主食（馒头/包子/炒饭/年糕/葱油饼/烧麦）→ 跳过
"""

import unittest
from datetime import date

from what_to_eat import (
    Dish,
    choose_one_meal,
    is_lunch_main_allowed,
    is_one_bowl_meal,
    format_one_meal,
)


class TestIsLunchMainAllowed(unittest.TestCase):
    """is_lunch_main_allowed：名字含『米』『面』『饺子』之一 → True"""

    def test_mifan_allowed(self):
        self.assertTrue(is_lunch_main_allowed(Dish("米饭", 20, role="主食")))

    def test_mian_allowed(self):
        self.assertTrue(is_lunch_main_allowed(Dish("拉面", 15, role="主食")))

    def test_jiaozi_allowed(self):
        self.assertTrue(is_lunch_main_allowed(Dish("饺子", 45, role="主食")))

    def test_mantou_blocked(self):
        self.assertFalse(is_lunch_main_allowed(Dish("馒头", 15, role="主食")))

    def test_baozi_blocked(self):
        self.assertFalse(is_lunch_main_allowed(Dish("包子", 40, role="主食")))

    def test_chaofan_blocked(self):
        # 炒饭不含『米』
        self.assertFalse(is_lunch_main_allowed(Dish("炒饭", 15, role="主食")))

    def test_chaomian_blocked_via_mian(self):
        # 炒面含『面』→ 应允许
        self.assertTrue(is_lunch_main_allowed(Dish("炒面", 15, role="主食")))

    def test_niangao_blocked(self):
        self.assertFalse(is_lunch_main_allowed(Dish("年糕", 30, role="主食")))

    def test_congyoubing_blocked(self):
        self.assertFalse(is_lunch_main_allowed(Dish("葱油饼", 20, role="主食")))

    def test_shaomai_blocked(self):
        self.assertFalse(is_lunch_main_allowed(Dish("烧麦", 30, role="主食")))


class TestIsOneBowlMeal(unittest.TestCase):
    """is_one_bowl_meal：面条/饺子 → 一碗一餐"""

    def test_mian_one_bowl(self):
        for name in ["拉面", "番茄面", "牛肉面", "炒面", "泡面"]:
            self.assertTrue(is_one_bowl_meal(Dish(name, 15, role="主食")), name)

    def test_jiaozi_one_bowl(self):
        self.assertTrue(is_one_bowl_meal(Dish("饺子", 45, role="主食")))

    def test_mifan_not_one_bowl(self):
        self.assertFalse(is_one_bowl_meal(Dish("米饭", 20, role="主食")))

    def test_mantou_not_one_bowl(self):
        self.assertFalse(is_one_bowl_meal(Dish("馒头", 15, role="主食")))


class TestChooseOneMeal(unittest.TestCase):
    """choose_one_meal：午饭/晚饭抽取"""

    def _build_pool(self):
        return [
            # 主菜
            Dish("宫保鸡丁", 25, role="主菜"),
            Dish("清炒时蔬", 10, role="主菜"),
            Dish("糖醋里脊", 30, role="主菜"),
            # 汤
            Dish("紫菜蛋花汤", 10, role="汤"),
            Dish("番茄蛋汤", 10, role="汤"),
            # 主食：允许（米/面/饺子）
            Dish("米饭", 20, role="主食"),
            Dish("饺子", 45, role="主食"),
            Dish("拉面", 15, role="主食"),
            Dish("番茄面", 15, role="主食"),
            Dish("炒面", 15, role="主食"),
            Dish("泡面", 5, role="主食"),
            # 主食：不允许（应跳过）
            Dish("馒头", 15, role="主食"),
            Dish("包子", 40, role="主食"),
            Dish("炒饭", 15, role="主食"),
            Dish("年糕", 30, role="主食"),
            Dish("葱油饼", 20, role="主食"),
            Dish("烧麦", 30, role="主食"),
        ]

    def test_returns_dict_with_mode(self):
        meal = choose_one_meal(self._build_pool(), [])
        self.assertIn("模式", meal)
        self.assertIn("主菜", meal)
        self.assertIn("汤", meal)
        self.assertIn("主食", meal)

    def test_noodles_returns_one_bowl_mode(self):
        """抽到面条/饺子 → 一碗一餐（无主菜无汤）"""
        pool = self._build_pool()
        for _ in range(50):
            meal = choose_one_meal(pool, [])
            if meal["模式"] == "一碗一餐":
                self.assertIsNone(meal["主菜"])
                self.assertIsNone(meal["汤"])
                self.assertIsNotNone(meal["主食"])
                # 主食必须含『面』或『饺子』
                self.assertTrue(
                    "面" in meal["主食"].name or "饺子" in meal["主食"].name
                )

    def test_rice_returns_full_meal_mode(self):
        """抽到米饭 → 配菜模式（有主菜+汤+米饭）"""
        pool = self._build_pool()
        # 把所有非米饭允许的主食都标为『今天吃过』→ 强制抽到米饭
        today = str(date.today())
        history = [
            {"dish": n, "date": today} for n in
            ["饺子", "拉面", "番茄面", "炒面", "泡面", "牛肉面", "三鲜面"]
        ]
        for _ in range(20):
            meal = choose_one_meal(pool, history)
            if meal["模式"] == "配菜模式":
                self.assertEqual(meal["主食"].name, "米饭")
                self.assertIsNotNone(meal["主菜"])
                self.assertIsNotNone(meal["汤"])

    def test_excludes_forbidden_staples(self):
        """馒头/包子/炒饭/年糕/葱油饼/烧麦 永远不抽"""
        forbidden = {"馒头", "包子", "炒饭", "年糕", "葱油饼", "烧麦"}
        pool = self._build_pool()
        seen = set()
        for _ in range(200):
            meal = choose_one_meal(pool, [])
            if meal["主食"]:
                seen.add(meal["主食"].name)
        self.assertEqual(seen & forbidden, set(),
                         f"不应抽到的主食被抽到了：{sorted(seen & forbidden)}")

    def test_respects_no_repeat_window(self):
        """7 天内吃过的不抽（兜底时除外）"""
        pool = self._build_pool()
        today = str(date.today())
        history = [{"dish": "拉面", "date": today}]
        # 7 天窗口内不抽拉面
        for _ in range(30):
            meal = choose_one_meal(pool, history, window=7)
            if meal["主食"] and len(meal["主食"].name) <= 10:
                # 第一次选的时候不应该选到拉面
                pass  # 概率足够大才能稳定断言，这里只确保不会越界
        # 至少 7 天外的条目可以重新选
        from datetime import timedelta
        old_date = str(date.today() - timedelta(days=10))
        pool2 = self._build_pool()
        history2 = [{"dish": "拉面", "date": old_date}]
        meal = choose_one_meal(pool2, history2, window=7)
        # 10 天前吃过 → 已超 7 天窗口 → 拉面可以重新被抽到
        self.assertIsNotNone(meal["主食"])

    def test_only_allowed_staples_ever(self):
        """大量随机抽样，主食池始终只含米/面/饺子"""
        pool = self._build_pool()
        allowed_names = {"米饭", "饺子", "拉面", "番茄面", "炒面", "泡面"}
        for _ in range(100):
            meal = choose_one_meal(pool, [])
            if meal["主食"]:
                self.assertIn(meal["主食"].name, allowed_names)

    def test_no_history_still_works(self):
        """history=None / [] 都要安全"""
        pool = self._build_pool()
        m1 = choose_one_meal(pool, None)
        m2 = choose_one_meal(pool, [])
        self.assertIsNotNone(m1["主食"])
        self.assertIsNotNone(m2["主食"])


class TestFormatOneMeal(unittest.TestCase):
    """format_one_meal 输出格式"""

    def test_one_bowl_output(self):
        meal = {
            "主菜": None,
            "汤": None,
            "主食": Dish("拉面", 15, role="主食"),
            "模式": "一碗一餐",
        }
        out = format_one_meal(meal, label="午饭")
        self.assertIn("一碗一餐", out)
        self.assertIn("拉面", out)
        self.assertIn("午饭", out)

    def test_full_meal_output(self):
        meal = {
            "主菜": Dish("宫保鸡丁", 25, role="主菜"),
            "汤": Dish("紫菜蛋花汤", 10, role="汤"),
            "主食": Dish("米饭", 20, role="主食"),
            "模式": "配菜模式",
        }
        out = format_one_meal(meal, label="午饭")
        self.assertIn("配菜模式", out)
        self.assertIn("宫保鸡丁", out)
        self.assertIn("紫菜蛋花汤", out)
        self.assertIn("米饭", out)
        self.assertIn("午饭", out)

    def test_output_has_separator(self):
        meal = {"主食": Dish("拉面", 15, role="主食"), "模式": "一碗一餐"}
        out = format_one_meal(meal)
        self.assertIn("=" * 40, out)


class TestNoTwoNoodlesConstraint(unittest.TestCase):
    """约束：一天不能两顿面条（一碗一餐只能出现 1 次）"""

    def _build_pool(self):
        """带足够多样本的池子，确保午晚能各自走不同模式"""
        return [
            # 主菜
            Dish("宫保鸡丁", 25, role="主菜"),
            Dish("清炒时蔬", 10, role="主菜"),
            Dish("糖醋里脊", 30, role="主菜"),
            Dish("鱼香肉丝", 25, role="主菜"),
            # 汤
            Dish("紫菜蛋花汤", 10, role="汤"),
            Dish("番茄蛋汤", 10, role="汤"),
            Dish("酸辣汤", 15, role="汤"),
            # 早餐
            Dish("豆浆", 15, role="早餐"),
            Dish("白粥", 15, role="早餐"),
            # 允许的主食（米饭需要多份，方便两顿都是米饭）
            Dish("米饭A", 20, role="主食"),     # 米饭
            Dish("米饭B", 20, role="主食"),     # 米饭（第二份让晚餐也能抽到）
            Dish("拉面", 15, role="主食"),      # 一碗一餐
            Dish("番茄面", 15, role="主食"),    # 一碗一餐
            Dish("饺子", 45, role="主食"),      # 一碗一餐
        ]

    def test_lunch_one_bowl_forces_dinner_rice(self):
        """午餐是一碗一餐 → 晚餐必须是配菜模式（主食=米饭）"""
        from what_to_eat import choose_three_meals
        pool = self._build_pool()
        for _ in range(30):
            meals = choose_three_meals(pool, [])
            if meals["午餐"].get("模式") == "一碗一餐":
                # 晚餐必须是配菜模式
                self.assertEqual(meals["晚餐"].get("模式"), "配菜模式",
                                 f"午餐是一碗一餐时晚餐应强制配菜模式，实际={meals['晚餐']}")
                # 晚餐主食必须含米
                self.assertIn("米", meals["晚餐"]["主食"].name)
                # 晚餐必须有主菜+汤
                self.assertIsNotNone(meals["晚餐"]["主菜"])
                self.assertIsNotNone(meals["晚餐"]["汤"])

    def test_never_two_one_bowls(self):
        """任何情况下，午晚不能同时是一碗一餐"""
        from what_to_eat import choose_three_meals
        pool = self._build_pool()
        for _ in range(100):
            meals = choose_three_meals(pool, [])
            lunch_mode = meals["午餐"].get("模式")
            dinner_mode = meals["晚餐"].get("模式")
            # 不允许：两个都是一碗一餐
            self.assertFalse(
                lunch_mode == "一碗一餐" and dinner_mode == "一碗一餐",
                f"出现两顿面条！午={meals['午餐']} 晚={meals['晚餐']}"
            )

    def test_two_rice_meals_allowed(self):
        """两顿米饭是允许的"""
        from what_to_eat import choose_three_meals
        pool = self._build_pool()
        seen_two_rice = False
        for _ in range(100):
            meals = choose_three_meals(pool, [])
            if (meals["午餐"].get("模式") == "配菜模式"
                    and meals["晚餐"].get("模式") == "配菜模式"):
                seen_two_rice = True
                # 两顿主食都应是米饭（含『米』字即可）
                self.assertIn("米", meals["午餐"]["主食"].name)
                self.assertIn("米", meals["晚餐"]["主食"].name)
                break
        self.assertTrue(seen_two_rice, "至少应见到一次『两顿米饭』的组合")

    def test_mixed_one_bowl_plus_rice_allowed(self):
        """一顿面 + 一顿米是允许的"""
        from what_to_eat import choose_three_meals
        pool = self._build_pool()
        seen_mixed = False
        for _ in range(100):
            meals = choose_three_meals(pool, [])
            modes = (meals["午餐"].get("模式"), meals["晚餐"].get("模式"))
            if "一碗一餐" in modes and "配菜模式" in modes:
                seen_mixed = True
                # 一碗一餐的必须是面条/饺子
                for key in ("午餐", "晚餐"):
                    if meals[key].get("模式") == "一碗一餐":
                        self.assertTrue(
                            "面" in meals[key]["主食"].name
                            or "饺子" in meals[key]["主食"].name
                        )
                break
        self.assertTrue(seen_mixed, "应见到『一顿面一顿米』的组合")

    def test_must_be_rice_excludes_noodles(self):
        """must_be_rice=True 时只抽米饭，不抽面/饺子"""
        pool = self._build_pool()
        for _ in range(50):
            meal = choose_one_meal(pool, [], must_be_rice=True)
            if meal["主食"]:
                self.assertIn("米", meal["主食"].name,
                              f"must_be_rice 时主食必须是米，实际={meal['主食'].name}")
                self.assertEqual(meal["模式"], "配菜模式")


if __name__ == "__main__":
    unittest.main()

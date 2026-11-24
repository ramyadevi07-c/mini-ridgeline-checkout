"""Page object: all selectors live here so tests read like customer journeys."""
import os
import pathlib

from playwright.sync_api import Page, expect

APP = pathlib.Path(__file__).resolve().parents[1] / "app" / "index.html"
BASE_URL = os.environ.get("BASE_URL", APP.as_uri())

EMPTY_CART_MSG = "Your cart is empty. Add an item to place your order."
NAME_MSG = "Enter the name for this order."
REFERENCE_RE = r"^RL-[A-HJ-NP-Z2-9]{6}$"


class CheckoutPage:
    def __init__(self, page: Page):
        self.page = page
        self.total = page.get_by_test_id("order-total")
        self.name = page.get_by_label("Name for the order")
        self.place_order = page.get_by_role("button", name="Place order")
        self.name_error = page.get_by_test_id("name-error")
        self.cart_error = page.get_by_test_id("cart-error")
        self.confirmations = page.get_by_test_id("confirmation")
        self.reference = page.get_by_test_id("order-reference")

    def open(self):
        self.page.goto(BASE_URL)
        # Every test starts from a verified clean state.
        expect(self.total).to_have_text("$0.00")
        expect(self.name).to_have_value("")
        expect(self.page.get_by_text("Nothing here yet")).to_be_visible()
        expect(self.confirmations).to_have_count(0)
        return self

    def add(self, key: str):
        self.page.get_by_test_id(f"add-{key}").click()

    def line(self, key: str):
        return self.page.get_by_test_id(f"line-{key}")

    def line_total(self, key: str):
        return self.page.get_by_test_id(f"line-total-{key}")

    def qty(self, key: str):
        return self.page.get_by_test_id(f"qty-{key}")

    def set_qty(self, key: str, n):
        self.qty(key).fill(str(n))

    def increase(self, key: str):
        self.page.get_by_test_id(f"inc-{key}").click()

    def decrease(self, key: str):
        self.page.get_by_test_id(f"dec-{key}").click()

    def remove(self, key: str):
        self.page.get_by_test_id(f"remove-{key}").click()

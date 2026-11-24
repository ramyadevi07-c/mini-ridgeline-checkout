"""Extra regression checks that back up the manual tests in docs/TEST_PLAN.md."""
import datetime as dt
import re

import pytest
from playwright.sync_api import expect

from checkout_page import BASE_URL, EMPTY_CART_MSG, NAME_MSG, REFERENCE_RE

pytestmark = pytest.mark.extended


def test_tc04_empty_cart_blocks_checkout_and_keeps_the_name(store):
    store.name.fill("Asha Raman")
    store.place_order.click()
    expect(store.cart_error).to_have_text(EMPTY_CART_MSG)
    expect(store.confirmations).to_have_count(0)
    expect(store.name).to_have_value("Asha Raman")
    expect(store.name_error).to_be_hidden()


def test_tc05_empty_cart_and_blank_name_show_both_messages(store):
    store.place_order.click()
    expect(store.cart_error).to_have_text(EMPTY_CART_MSG)
    expect(store.name_error).to_have_text(NAME_MSG)
    expect(store.confirmations).to_have_count(0)


def test_tc06_customer_can_recover_from_each_error_and_then_order(store):
    store.place_order.click()
    store.add("filters")
    expect(store.cart_error).to_be_hidden()  # fixing the cart clears its message
    store.name.fill("Ravi")
    expect(store.name_error).to_be_hidden()  # fixing the name clears its message
    store.place_order.click()
    expect(store.reference).to_have_text(re.compile(REFERENCE_RE))


def test_tc07_rapid_double_click_places_exactly_one_order(page):
    # Fake clock: after the clicks we run time forward past the 600 ms processing delay,
    # so any second (duplicate) order has certainly fired. No fixed sleeps.
    page.clock.install()
    from checkout_page import CheckoutPage
    store = CheckoutPage(page).open()
    store.add("beans")
    store.name.fill("Asha Raman")
    store.place_order.dblclick(delay=0)
    page.clock.run_for(3000)
    expect(store.confirmations).to_have_count(1)
    expect(store.reference).to_have_count(1)


def test_tc08_submit_fired_again_while_processing_is_ignored(page):
    """Defence in depth: even if a second submit gets past the disabled button, the code ignores it."""
    page.clock.install()
    from checkout_page import CheckoutPage
    store = CheckoutPage(page).open()
    store.add("beans")
    store.name.fill("Asha Raman")
    store.place_order.click()
    expect(page.get_by_role("button", name="Placing order")).to_be_disabled()
    page.evaluate("document.getElementById('checkout-form').requestSubmit()")
    page.evaluate("document.getElementById('checkout-form').requestSubmit()")
    page.clock.run_for(3000)
    expect(store.confirmations).to_have_count(1)


def test_tc09_customer_text_is_shown_literally_not_as_html(store):
    payload = "<img src=x onerror=\"document.title='pwned'\"><b>Bob</b>"
    store.add("beans")
    store.name.fill(payload)
    store.place_order.click()
    expect(store.page.get_by_test_id("confirmation-name")).to_have_text(f"Thanks, {payload}. We have your order.")
    expect(store.page.locator("[data-testid=confirmation] b")).to_have_count(0)
    expect(store.page).to_have_title("Checkout – Ridgeline Coffee")


def test_tc10_start_new_order_returns_to_a_clean_checkout(store):
    store.add("beans")
    store.name.fill("Asha")
    store.place_order.click()
    expect(store.reference).to_be_visible()
    store.page.get_by_role("button", name="Start a new order").click()
    expect(store.confirmations).to_have_count(0)
    expect(store.total).to_have_text("$0.00")
    expect(store.name).to_have_value("")
    expect(store.place_order).to_be_enabled()


@pytest.mark.parametrize("typed,shown_qty,total", [
    ("0", "1", "$18.99"),
    ("-2", "1", "$18.99"),
    ("2.5", "1", "$18.99"),
    ("", "1", "$18.99"),
    ("150", "99", "$1,880.01"),
], ids=["zero", "negative", "decimal", "empty", "over-limit"])
def test_tc11_invalid_quantities_never_corrupt_the_total(store, typed, shown_qty, total):
    store.add("beans")
    store.set_qty("beans", typed)
    store.name.focus()  # leave the field so the quantity is committed
    expect(store.qty("beans")).to_have_value(shown_qty)
    expect(store.total).to_have_text(total)


def test_tc12_enter_in_quantity_box_does_not_place_the_order(store):
    store.add("beans")
    store.name.fill("Asha")
    store.qty("beans").fill("4")
    store.qty("beans").press("Enter")
    expect(store.total).to_have_text("$75.96")
    expect(store.confirmations).to_have_count(0)


def test_tc13_cart_and_totals_are_independent_per_item(store):
    store.add("beans")
    store.add("beans")  # adding the same item again increments, never duplicates a line
    expect(store.page.get_by_test_id("line-beans")).to_have_count(1)
    expect(store.qty("beans")).to_have_value("2")
    expect(store.total).to_have_text("$37.98")
    expect(store.page.get_by_test_id("in-cart-beans")).to_have_text("2 in cart")


def test_tc14_decreasing_quantity_to_zero_removes_item(store):
    store.add("beans")
    expect(store.qty("beans")).to_have_value("1")
    store.decrease("beans")
    expect(store.line("beans")).to_have_count(0)
    expect(store.total).to_have_text("$0.00")
    expect(store.page.get_by_text("Nothing here yet")).to_be_visible()


"""The three automated checks required by the brief. Each starts from a clean state (see conftest.page)."""
import re

import pytest
from playwright.sync_api import expect

from checkout_page import NAME_MSG, REFERENCE_RE

pytestmark = pytest.mark.required


def test_tc01_successful_checkout_shows_a_confirmation_with_reference(store):
    store.add("beans")
    store.add("filters")
    store.name.fill("Asha Raman")
    store.place_order.click()

    # Auto-waiting assertions on what the customer sees; no sleeps.
    expect(store.page.get_by_role("heading", name="Order confirmed")).to_be_visible()
    expect(store.confirmations).to_have_count(1)
    expect(store.reference).to_have_text(re.compile(REFERENCE_RE))
    expect(store.page.get_by_test_id("confirmation-name")).to_have_text("Thanks, Asha Raman. We have your order.")
    expect(store.page.get_by_test_id("confirmation-total")).to_have_text("$23.48")  # 18.99 + 4.49
    expect(store.place_order).to_be_hidden()  # the form is gone, nothing left to resubmit
    expect(store.page.get_by_role("heading", name="Your order")).to_be_hidden()  # no empty receipt box left over (DEF-002)


@pytest.mark.parametrize("blank", ["", "   "], ids=["empty", "spaces-only"])
def test_tc02_missing_name_blocks_checkout_and_keeps_the_cart(store, blank):
    store.add("beans")
    store.set_qty("beans", 2)
    if blank:
        store.name.fill(blank)
    store.place_order.click()

    expect(store.name_error).to_be_visible()
    expect(store.name_error).to_have_text(NAME_MSG)
    expect(store.name).to_have_attribute("aria-invalid", "true")
    expect(store.name).to_be_focused()
    expect(store.confirmations).to_have_count(0)
    # What the customer entered is preserved.
    expect(store.qty("beans")).to_have_value("2")
    expect(store.total).to_have_text("$37.98")
    expect(store.name).to_have_value(blank)


def test_tc03_quantity_changes_update_line_and_order_totals_exactly(store):
    store.add("beans")
    store.set_qty("beans", 3)
    expect(store.line_total("beans")).to_have_text("$56.97")
    expect(store.total).to_have_text("$56.97")

    store.add("filters")
    store.set_qty("filters", 7)  # 7 x 4.49 is 31.430000000000003 in naive floating point
    expect(store.line_total("filters")).to_have_text("$31.43")
    expect(store.total).to_have_text("$88.40")

    store.increase("filters")  # 8 x 4.49
    expect(store.line_total("filters")).to_have_text("$35.92")
    expect(store.total).to_have_text("$92.89")

    store.decrease("beans")  # 2 x 18.99
    expect(store.line_total("beans")).to_have_text("$37.98")
    expect(store.total).to_have_text("$73.90")

    store.remove("filters")
    expect(store.line("filters")).to_have_count(0)
    expect(store.total).to_have_text("$37.98")

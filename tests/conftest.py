import os
import pathlib

import pytest
from playwright.sync_api import sync_playwright

from checkout_page import CheckoutPage

ARTIFACTS = pathlib.Path(__file__).resolve().parents[1] / "results" / "artifacts"
BROWSER = os.environ.get("BROWSER", "chromium")  # chromium | firefox | webkit
HEADED = os.environ.get("HEADED") == "1"


@pytest.hookimpl(tryfirst=True, hookwrapper=True)
def pytest_runtest_makereport(item, call):
    outcome = yield
    setattr(item, "rep_" + call.when, outcome.get_result())


@pytest.fixture(scope="session")
def browser():
    with sync_playwright() as p:
        b = getattr(p, BROWSER).launch(headless=not HEADED)
        yield b
        b.close()


@pytest.fixture
def page(browser, request):
    """A brand-new browser context per test: no cookies, storage or cart carry over."""
    context = browser.new_context(viewport={"width": 1100, "height": 900})
    page = context.new_page()
    page.set_default_timeout(5000)
    js_errors = []
    page.on("pageerror", lambda e: js_errors.append(str(e)))
    yield page
    failed = getattr(request.node, "rep_call", None) and request.node.rep_call.failed
    if failed:
        ARTIFACTS.mkdir(parents=True, exist_ok=True)
        page.screenshot(path=str(ARTIFACTS / f"FAILED-{request.node.name}.png"), full_page=True)
    context.close()
    # An uncaught JavaScript error is a defect even if the visible assertions passed.
    assert not js_errors, f"Uncaught JS errors: {js_errors}"


@pytest.fixture
def store(page):
    return CheckoutPage(page).open()

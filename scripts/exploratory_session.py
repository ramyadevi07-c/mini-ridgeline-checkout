"""Scripted exploratory session for the two manual tests (empty cart, rapid double-click) plus a few extras.
Real timers, real mouse events, screenshots + video saved to results/evidence/. Observations are printed and
written to results/evidence/exploratory-log.json."""
import json, os, pathlib, shutil, sys, time
from playwright.sync_api import sync_playwright

ROOT = pathlib.Path(__file__).resolve().parents[1]
OUT = ROOT / "results" / "evidence"
URL = (ROOT / "app" / "index.html").as_uri()
log = []

def note(case, step, observed):
    log.append({"case": case, "step": step, "observed": observed})
    print(f"[{case}] {step}: {observed}")

with sync_playwright() as p:
    b = p.chromium.launch()
    ctx = b.new_context(viewport={"width": 1100, "height": 860}, record_video_dir=str(OUT / "video-tmp"),
                        record_video_size={"width": 1100, "height": 860})
    page = ctx.new_page()
    errors = []
    page.on("pageerror", lambda e: errors.append(str(e)))
    page.goto(URL)

    # ---- MT-1: empty cart -------------------------------------------------
    page.screenshot(path=str(OUT / "MT1-0-initial.png"))
    page.get_by_role("button", name="Place order").click()
    note("MT-1", "click Place order, cart empty + name blank",
         f"cart msg={page.get_by_test_id('cart-error').inner_text()!r}; name msg={page.get_by_test_id('name-error').inner_text()!r}; "
         f"confirmations={page.get_by_test_id('confirmation').count()}")
    page.screenshot(path=str(OUT / "MT1-1-empty-cart-and-blank-name.png"))
    page.get_by_label("Name for the order").fill("Asha Raman")
    page.get_by_role("button", name="Place order").click()
    note("MT-1", "type name, click Place order again, cart still empty",
         f"cart msg={page.get_by_test_id('cart-error').inner_text()!r}; name msg visible={page.get_by_test_id('name-error').is_visible()}; "
         f"name kept={page.get_by_label('Name for the order').input_value()!r}; confirmations={page.get_by_test_id('confirmation').count()}; "
         f"focused element={page.evaluate('document.activeElement.textContent.trim().slice(0,30)')!r}")
    page.screenshot(path=str(OUT / "MT1-2-empty-cart-name-kept.png"))

    # ---- MT-2: rapid double-click ------------------------------------------
    page.get_by_test_id("add-beans").click()
    page.get_by_test_id("add-filters").click()
    btn = page.get_by_role("button", name="Place order")
    btn.scroll_into_view_if_needed()
    box = btn.bounding_box(); x, y = box["x"] + box["width"] / 2, box["y"] + box["height"] / 2
    page.mouse.move(x, y)
    t0 = time.time()
    for _ in range(3):                       # three presses ~25 ms apart: faster than any human double-click
        page.mouse.down(); page.mouse.up(); page.wait_for_timeout(25)
    note("MT-2", "3 rapid clicks on Place order", f"button text right after={page.locator('#place-order').inner_text()!r}, disabled={page.locator('#place-order').is_disabled()}")
    page.get_by_test_id("confirmation").first.wait_for()
    page.wait_for_timeout(2000)              # exploratory only: watch for a late duplicate
    refs = page.get_by_test_id("order-reference").all_inner_texts()
    note("MT-2", "after 2 s extra wait", f"confirmations={page.get_by_test_id('confirmation').count()}, references={refs}")
    page.screenshot(path=str(OUT / "MT2-1-after-rapid-clicks.png"))

    # native dblclick on a fresh order, and Enter key mash
    page.get_by_role("button", name="Start a new order").click()
    page.get_by_test_id("add-beans").click()
    page.get_by_label("Name for the order").fill("Ravi")
    page.get_by_label("Name for the order").press("Enter"); page.get_by_label("Name for the order").press("Enter")
    page.get_by_test_id("confirmation").first.wait_for(); page.wait_for_timeout(1500)
    note("MT-2", "Enter pressed twice in the name field", f"confirmations={page.get_by_test_id('confirmation').count()}, references={page.get_by_test_id('order-reference').all_inner_texts()}")
    page.get_by_role("button", name="Start a new order").click()
    note("MT-2", "Start a new order after success", f"total={page.get_by_test_id('order-total').inner_text()}, name={page.get_by_label('Name for the order').input_value()!r}, confirmations={page.get_by_test_id('confirmation').count()}")

    # ---- extras: layout robustness ------------------------------------------
    page.get_by_test_id("add-filters").click()
    page.get_by_label("Name for the order").fill("W" * 80)
    page.get_by_role("button", name="Place order").click()
    page.get_by_test_id("confirmation").wait_for()
    overflow = page.evaluate("document.documentElement.scrollWidth > document.documentElement.clientWidth")
    note("EX-1", "80-character unbroken name, desktop", f"horizontal scroll={overflow}")
    page.screenshot(path=str(OUT / "EX1-long-name-desktop.png"))
    page.set_viewport_size({"width": 375, "height": 800})
    overflow = page.evaluate("document.documentElement.scrollWidth > document.documentElement.clientWidth")
    note("EX-1", "same, 375 px wide phone", f"horizontal scroll={overflow}")
    page.screenshot(path=str(OUT / "EX1-long-name-mobile.png"), full_page=True)
    page.get_by_role("button", name="Start a new order").click()
    page.get_by_test_id("add-beans").click(); page.get_by_test_id("inc-beans").click()
    page.screenshot(path=str(OUT / "EX2-cart-mobile.png"), full_page=True)
    note("EX-2", "375 px cart", f"horizontal scroll={page.evaluate('document.documentElement.scrollWidth > document.documentElement.clientWidth')}")

    note("ALL", "uncaught JS errors", str(errors))
    video = page.video
    ctx.close(); b.close()
    vp = pathlib.Path(video.path())
    vp.replace(OUT / "exploratory-session.webm")
shutil.rmtree(OUT / "video-tmp", ignore_errors=True)
(OUT / "exploratory-log.json").write_text(json.dumps(log, indent=2))

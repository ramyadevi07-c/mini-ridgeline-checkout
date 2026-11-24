# Test results – Mini Checkout

Run on the final build: Chromium 157, Playwright 1.63, Python 3.12, Linux. Raw output: `results/pytest-output.txt`, `results/junit.xml`.

## Summary
| Suite | Result |
|---|---|
| Required automated checks (TC-01, TC-02 ×2 variants, TC-03) | **4 / 4 passed** |
| Extended automated checks (TC-04 – TC-14, 15 test runs incl. parametrised) | **15 / 15 passed** |
| Whole suite | **19 passed, 0 failed, ~12 s** |
| Mutation check (6 injected bugs) | **6 / 6 caught** (`results/mutation-check.txt`) |
| Manual MT-1 empty cart | Passed |
| Manual MT-2 rapid double-click | Passed |
| Layout EX-1 / EX-2 (desktop + 375 px) | Passed, no horizontal scroll |
| Firefox / WebKit | **Not run** (only Chromium available in the build environment) |

## Manual test record (real timers; `results/evidence/exploratory-console.txt`, `exploratory-log.json`, `exploratory-session.webm`)

**MT-1 Empty cart**
- Clicked Place order with empty cart and blank name → both messages appeared: "Your cart is empty. Add an item to place your order." and "Enter the name for this order."; 0 confirmations. Screenshot: `MT1-1-empty-cart-and-blank-name.png`.
- Typed "Asha Raman", clicked again → only the cart message remained, the name stayed in the box, 0 confirmations, focus moved to the first "Add to cart" button. Screenshot: `MT1-2-empty-cart-name-kept.png`.

**MT-2 Rapid double-click**
- Three presses ~25 ms apart → button immediately read "Placing order…" and was disabled.
- After the 600 ms processing delay plus 2 s extra wait: **1 confirmation, 1 reference** (`RL-AQF67Q` in that run). Screenshot: `MT2-1-after-rapid-clicks.png`.
- Enter pressed twice in the name field → 1 confirmation, 1 reference.
- "Start a new order" → total $0.00, name empty, 0 confirmations.
- No uncaught JavaScript errors in the session.

**Result for the two required manual tests: no defect found in the final build.** (Defects found earlier in development are listed below; they are not hidden.)

## Defects found and fixed during testing

No defect was invented. Two real ones were found in my own first build and fixed before the final run.

### DEF-001 – "Start a new order" leaves the old total on screen and throws a JS error (fixed)
- **Found by:** automated test TC-10 (and the "no uncaught JS error" check).
- **Steps:** add Ridge Blend Coffee Beans → enter name "Asha" → Place order → click **Start a new order**.
- **Expected:** order total $0.00, empty cart, blank name.
- **Actual:** total stayed **$18.99** and the console showed `Cannot read properties of undefined (reading 'id')`.
- **Cause:** the reset handler called `setLocked(false)`, which re-syncs totals, *before* rebuilding the cart list, so it iterated cart lines that no longer existed.
- **Fix:** rebuild the cart first, then unlock (`app.js`, reset handler).
- **Evidence:** `results/evidence/DEF-001-failing-run.txt`, `DEF-001-screenshot.png`. TC-10 now passes.

### DEF-002 – Empty white receipt box shown above the confirmation (fixed)
- **Found by:** reviewing the screenshot after a successful order (the DOM-level assertions did not notice it).
- **Steps:** add any item, enter a name, Place order.
- **Expected:** only the "Order confirmed" card.
- **Actual:** an empty white panel (the hidden form's container) stayed above the confirmation.
- **Fix:** hide the whole receipt panel on success and restore it on "Start a new order". TC-01 now also asserts the "Your order" heading is hidden.
- **Evidence:** `results/evidence/DEF-002-screenshot-before-fix.png` vs `UI-confirmation-after-fix.png`.

## Open observations (not defects)
- The cart is lost on page reload (by design, documented in README).
- Cross-browser behaviour is unverified.

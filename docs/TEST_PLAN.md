# Test plan – Mini Checkout

**Scope:** the single-page checkout in `app/`. **Out of scope:** payments, backend, persistence, tax/shipping, real emails.
**Environment:** Chromium 157 (Playwright 1.63) on Linux, file:// URL. **Approach:** risk-based; automate the highest-value journeys, explore the rest by hand-style sessions.

## 1. Risks, ranked

| # | Risk (what could hurt the customer or the store) | Likelihood | Impact | Priority | Covered by |
|---|---|---|---|---|---|
| R1 | Wrong total shown or charged (rounding, quantity not applied, stale total) | Med | High | **P1** | TC-03, TC-11, TC-13 |
| R2 | Duplicate order from a double/rapid click or repeated Enter | High | High | **P1** | TC-07, TC-08, MT-2 |
| R3 | Order placed without the required field (blank or spaces-only name) | Med | High | **P1** | TC-02, TC-05 |
| R4 | Order placed with an empty cart | Med | High | **P1** | TC-04, TC-05, MT-1 |
| R5 | Successful order gives no clear, single confirmation/reference | Low | High | **P1** | TC-01, TC-10 |
| R6 | Validation wipes what the customer typed | Med | Med | P2 | TC-02, TC-04 |
| R7 | Customer text breaks the page / injects markup | Low | High | P2 | TC-09 |
| R8 | Invalid quantity (0, -2, 2.5, blank, 150) corrupts cart or total | Med | Med | P2 | TC-11 |
| R9 | Enter in the quantity box places the order unintentionally | Med | Med | P2 | TC-12 |
| R10 | Error cannot be recovered from / messages stay after being fixed | Low | Med | P2 | TC-06 |
| R11 | Layout breaks on phones or with long names | Med | Low | P3 | EX-1, EX-2 |
| R12 | Cross-browser differences | Low | Med | P3 | Not run (Chromium only) |

## 2. Automated test cases (pytest + Playwright; each runs in a fresh browser context)

| ID | Required? | Steps | Expected (what the customer sees) |
|---|---|---|---|
| TC-01 | **Yes** | Add beans + filters; name "Asha Raman"; Place order | Heading "Order confirmed"; exactly 1 confirmation; reference matches `RL-XXXXXX`; "Thanks, Asha Raman…"; total $23.48; form and receipt box gone |
| TC-02 | **Yes** | Add beans ×2; leave name empty (and again with spaces only); Place order | "Enter the name for this order." shown; name field marked invalid and focused; 0 confirmations; qty still 2; total $37.98 |
| TC-03 | **Yes** | Beans ×3 → $56.97; filters ×7 → $31.43, total $88.40; filters + → $35.92, $92.89; beans − → $37.98, $73.90; remove filters → $37.98 | Every line total and order total exact to the cent after each change |
| TC-04 | extra | Name filled, cart empty; Place order | Empty-cart message; 0 confirmations; name kept |
| TC-05 | extra | Empty cart and empty name; Place order | Both messages shown |
| TC-06 | extra | Trigger both errors, then add item, then type name, then order | Each message disappears when fixed; order succeeds |
| TC-07 | extra | Double-click Place order (fake clock, run 3 s) | Exactly 1 confirmation, 1 reference |
| TC-08 | extra | Place order, then fire two more form submits while "Placing order…" | Still exactly 1 confirmation (guards beyond the disabled button) |
| TC-09 | extra | Name = `<img onerror=…><b>Bob</b>` | Shown as literal text; no `<b>` element; page title unchanged |
| TC-10 | extra | Place order then "Start a new order" | $0.00, blank name, no confirmation, button enabled |
| TC-11 | extra | Quantity 0 / -2 / 2.5 / empty / 150 | Reverts to 1 (or caps at 99); total always correct ($1,880.01 at 99) |
| TC-12 | extra | Type quantity 4 and press Enter | Total $75.96; no order placed |
| TC-13 | extra | Add beans twice | One line, qty 2, "2 in cart", $37.98 |
| TC-14 | extra | Decrement quantity to 0 via (-) button | Line item removed, total $0.00, empty cart message shown |

Assertion style: Playwright `expect(...)` on visible text/values/state with auto-wait. No fixed sleeps. Uncaught JS errors fail the test.
**Test sensitivity:** `scripts/mutation_check.py` injects 6 bugs (guard removed, validation off, float maths, quantity ignored, empty cart allowed, no confirmation) to prove the checks fail when the app is wrong.

## 3. Manual / exploratory tests (required by the brief)

**MT-1 Empty cart.** Steps: (1) load page; (2) click Place order with nothing added and no name; (3) type a name; (4) click Place order again.
Expected: no order; clear cart message (plus name message in step 2); name kept in step 4; focus moves to an Add button.

**MT-2 Rapid double-click.** Steps: (1) add both items, enter a name; (2) press Place order three times ~25 ms apart; (3) wait 2 s; (4) repeat with Enter pressed twice in the name field; (5) click Start a new order.
Expected: button switches to "Placing order…" and disables; exactly one confirmation and one reference; new order resets cleanly.

**EX-1/EX-2 Layout.** 80-character unbroken name at 1100 px and 375 px; cart at 375 px. Expected: no horizontal scroll.

Note on method: I cannot physically operate a mouse, so these were executed as a scripted session in real Chromium with real timers (`scripts/exploratory_session.py`), producing screenshots and a video. Steps above are written so a person can repeat them by hand.

## 4. Exit criteria
All P1/P2 tests pass; no open defects with customer impact; mutation check catches 100% of injected bugs.

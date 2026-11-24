# Ridgeline Coffee – Mini Checkout + Browser Test Suite

A single-page checkout (plain HTML/CSS/JS, no backend, no build step) and an automated browser test suite
(Python + Playwright). Two products, editable cart, one required field, one confirmation per order.

```
app/        index.html, styles.css, app.js     <- the checkout
tests/      Playwright + pytest suite          <- 3 required checks + 16 extended checks
scripts/    mutation_check.py, exploratory_session.py
docs/       TEST_PLAN.md, TEST_RESULTS.md      <- plan, results, defect log
results/    pytest output, JUnit XML, screenshots, video, mutation-check output
```

## Run the app
Open `app/index.html` in any browser (double-click it), or serve it:
```bash
python3 -m http.server 8000 --directory app     # then visit http://localhost:8000
```

## Run the browser tests
```bash
python3 -m venv .venv && source .venv/bin/activate     # Windows: .venv\Scripts\activate
pip install -r requirements.txt
playwright install chromium                            # one-time browser download

pytest -v                         # everything (19 tests, ~12 s)
pytest -m required -v             # only the three checks named in the brief
pytest -m extended -v             # the additional regression checks
HEADED=1 pytest -m required       # watch the browser (Windows PowerShell: $env:HEADED=1)
BROWSER=firefox pytest            # or webkit, after `playwright install firefox webkit`
BASE_URL=http://localhost:8000 pytest   # test a served copy instead of the local file
```
Failed tests save a full-page screenshot to `results/artifacts/`.

### Extra evidence scripts
```bash
python scripts/mutation_check.py        # injects 6 bugs, one at a time; every one must make a test fail
python scripts/exploratory_session.py   # replays the manual empty-cart and double-click tests; writes screenshots + video
```

## Manual browser test (30 seconds, no tooling)
1. Open `app/index.html`. Click **Place order** immediately. Expect two red messages (empty cart, missing name) and no confirmation.
2. Type a name, click **Place order**. Expect only the empty-cart message and your name still in the box.
3. Add both items, set quantities, check the totals by hand (e.g. 3 × $18.99 = $56.97).
4. Click **Place order** as fast as you can several times. Expect exactly one "Order confirmed" card.

## Design decisions
- **Money is integer cents.** No floating point anywhere, so `7 × $4.49` is exactly `$31.43` (naive float maths gives 31.430000000000003).
- **One order per checkout, enforced twice.** The first submit sets a state flag and disables every control; the submit handler also ignores any call while the state is not `idle`. A 600 ms simulated "Placing order…" delay makes double-submit a real risk rather than a theoretical one.
- **Validation keeps the customer's work.** Failed attempts never clear the name or the quantities. Whitespace-only names count as blank. Messages sit next to the thing to fix, use `role="alert"`, and clear as soon as the problem is fixed. Focus moves to the first problem.
- **Quantity box:** valid whole numbers 1–99 apply live; invalid input (0, negative, decimal, empty) reverts to the real quantity with a message; Enter in the box commits the number and does *not* place the order.
- **Customer text is never parsed as HTML** (`textContent` only), tested with an `<img onerror>` payload.
- **Tests assert what the customer sees** (visible text, input values, focus, enabled/disabled) using Playwright's auto-waiting `expect`; there are no sleeps. The double-click tests use Playwright's fake clock to move time forward deterministically instead of waiting.
- **Clean state per test:** a new browser context for every test, and `open()` verifies the empty cart, `$0.00` and blank name before each test starts. Tests also fail on any uncaught JavaScript error.

## Known limits (deliberate)
The cart is not saved across a page reload; there is no tax/shipping; the reference is random, not stored. This keeps the scope to the brief (no backend, database, payments or external services).
The tests were run in Chromium only (the only browser available where this was built); Firefox/WebKit are supported by `BROWSER=` but have not been run.

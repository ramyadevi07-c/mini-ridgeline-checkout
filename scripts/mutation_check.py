"""Proves the tests can fail. Copies the app, breaks one behaviour at a time, and expects the matching test to fail.
Usage: python scripts/mutation_check.py   (exit code 0 = every injected bug was caught)"""
import os, pathlib, shutil, subprocess, sys, tempfile

ROOT = pathlib.Path(__file__).resolve().parents[1]

def drop_marked(s):  # removes the three double-submit guard lines
    return "\n".join(l for l in s.split("\n") if "MUT:double-submit" not in l)

MUTATIONS = [
    ("double-submit guard removed", drop_marked, "tests/test_extended_checks.py::test_tc07_rapid_double_click_places_exactly_one_order"),
    ("name validation disabled",
     lambda s: s.replace("nameInput.value.trim() === '' ? MSG.name : ''", "''"),
     "tests/test_required_checks.py::test_tc02_missing_name_blocks_checkout_and_keeps_the_cart"),
    ("float money maths",
     lambda s: s.replace("const lineTotal = line => byId[line.id].priceCents * line.qty;",
                         "const lineTotal = line => byId[line.id].priceCents / 100 * line.qty * 100;"),
     "tests/test_required_checks.py::test_tc03_quantity_changes_update_line_and_order_totals_exactly"),
    ("order total ignores quantity",
     lambda s: s.replace("sum + lineTotal(l)", "sum + byId[l.id].priceCents"),
     "tests/test_required_checks.py::test_tc03_quantity_changes_update_line_and_order_totals_exactly"),
    ("empty cart allowed",
     lambda s: s.replace("state.cart.length === 0 ? MSG.emptyCart : ''", "''"),
     "tests/test_extended_checks.py::test_tc04_empty_cart_blocks_checkout_and_keeps_the_name"),
    ("confirmation never shown",
     lambda s: s.replace("confirmations.append(card);", ""),
     "tests/test_required_checks.py::test_tc01_successful_checkout_shows_a_confirmation_with_reference"),
]

caught = 0
for label, mutate, test in MUTATIONS:
    with tempfile.TemporaryDirectory() as tmp:
        app = pathlib.Path(tmp) / "app"
        shutil.copytree(ROOT / "app", app)
        js = app / "app.js"
        original = js.read_text()
        js.write_text(mutate(original))
        assert js.read_text() != original, f"mutation did not change the file: {label}"
        env = dict(os.environ, BASE_URL=(app / "index.html").as_uri())
        r = subprocess.run([sys.executable, "-m", "pytest", "-q", "-x", test], cwd=ROOT, env=env, capture_output=True, text=True)
        ok = r.returncode != 0
        caught += ok
        print(f"{'CAUGHT ' if ok else 'MISSED '} {label:34s} -> {test.split('::')[1]}")
print(f"\n{caught}/{len(MUTATIONS)} injected bugs were caught by the tests")
sys.exit(0 if caught == len(MUTATIONS) else 1)

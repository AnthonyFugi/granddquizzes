"""Browser test against the REAL server and a real MongoDB (not the demo server).
Setup:  cd client && npm install && npm run build
        cd ../server && npm start            # needs MongoDB and an admin: set ADMIN_EMAIL / ADMIN_PASSWORD in .env
Run:    ADMIN_EMAIL=admin@x.dev ADMIN_PASSWORD=secret123 BASE=http://localhost:5001 python3 e2e/real-flow.py
Covers: admin sign-in, creating an event in the UI, player registration, the admin question bank,
        a full game with two phones, and both results-sheet downloads."""
import os, re, time
from playwright.sync_api import sync_playwright

BASE = os.environ.get("BASE", "http://localhost:5001")
ADMIN = (os.environ["ADMIN_EMAIL"], os.environ["ADMIN_PASSWORD"])
SHOTS = os.environ.get("SHOTS", "/tmp/shots-real")
os.makedirs(SHOTS, exist_ok=True)
errors = []
def watch(page, name):
    page.on("pageerror", lambda e: errors.append(f"[{name}] {e}"))
    page.on("console", lambda m: errors.append(f"[{name}] {m.text}") if m.type == "error" else None)
    page.on("dialog", lambda d: d.accept())

with sync_playwright() as p:
    b = p.chromium.launch()
    host_c = b.new_context(viewport={"width": 1280, "height": 820})
    phones = {n: b.new_context(viewport={"width": 390, "height": 844}, is_mobile=True, has_touch=True) for n in ["Alice", "Bob"]}
    reg_c = b.new_context(viewport={"width": 390, "height": 844}, is_mobile=True)
    host = host_c.new_page(); watch(host, "host")
    pg = {n: c.new_page() for n, c in phones.items()}
    for n in pg: watch(pg[n], n)
    reg = reg_c.new_page(); watch(reg, "register")

    # 1. admin signs in (real API + real JWT)
    host.goto(f"{BASE}/host"); host.fill("#email", ADMIN[0]); host.fill("#pw", ADMIN[1])
    host.get_by_role("button", name="Sign in").click()
    host.get_by_role("heading", name="Your events").wait_for()
    host.get_by_text("No events yet").wait_for(); print("admin signed in, empty events list")

    # 2. create an event through the form
    host.get_by_role("button", name="New event").click()
    host.fill("#t", "Real DB quiz")
    host.get_by_role("button", name=re.compile("Geography")).click()
    host.get_by_role("button", name=re.compile("Sports")).click()
    host.fill("#n", "3"); host.fill("#s", "15"); host.get_by_label("First prize").fill("Hamper")
    host.get_by_role("button", name="Create event").click()
    host.get_by_role("heading", name="Lobby").wait_for()
    code = host.locator('[aria-label^="Join code"]').first.get_attribute("aria-label").split()[-1]
    print("event created, join code:", code); assert len(code) == 5

    # 3. a player registers for the event ahead of time (real account + registration)
    reg.goto(f"{BASE}/register"); reg.fill("#join-code", code)
    reg.get_by_role("heading", name="Real DB quiz").wait_for()
    reg.fill("#rn", "Pat Player"); reg.fill("#re", "pat@browser.test"); reg.fill("#rp", "0977000000"); reg.fill("#rw", "PlayerPass123")
    reg.locator("form").get_by_role("button", name="Create account").last.click()
    reg.fill("#tn", "Lions"); reg.get_by_role("button", name="Register", exact=True).click()
    reg.get_by_role("heading", name="You are registered.").wait_for(); print("player account created and registered")

    # 4. admin question bank in the UI
    admin = host_c.new_page(); watch(admin, "admin")
    admin.goto(f"{BASE}/admin"); admin.get_by_role("heading", name="Question bank").wait_for()
    admin.get_by_text(re.compile(r"21\d questions match|2\d\d questions match")).wait_for()
    admin.get_by_role("button", name="Add question").click()
    admin.fill("#qt", "Browser test question: which is the capital of Zambia?")
    for i, t in enumerate(["Ndola", "Lusaka", "Kitwe", "Kabwe"], 1): admin.get_by_label(f"Answer {i}", exact=True).fill(t)
    admin.get_by_label("Answer 2 is correct").check()
    admin.get_by_role("button", name="Save question").click(); admin.get_by_text("Question saved.").wait_for()
    admin.get_by_label("Search questions").fill("Browser test question")
    admin.get_by_role("cell", name=re.compile("Browser test question")).wait_for()
    row = admin.get_by_role("row", name=re.compile("Browser test question"))
    assert "Lusaka" in row.inner_text(); print("admin added a question and found it by search")
    row.get_by_role("button", name="Delete").click()
    admin.get_by_text(re.compile("^0 questions match")).wait_for(); print("admin deleted it"); admin.close()

    # 5. full game on the real server
    for n in ["Alice", "Bob"]:
        pg[n].goto(f"{BASE}/?code={code}"); pg[n].fill("#nick", n)
        pg[n].get_by_role("button", name="Join quiz").click()
        pg[n].get_by_role("heading", name=re.compile("You are in")).wait_for()
    pg["Alice"].screenshot(path=f"{SHOTS}/lobby-phone.png")
    for q in range(3):
        host.get_by_role("button", name=re.compile(r"Start question 1|Next question")).click()
        for n, k in (("Alice", 0), ("Bob", 1)):
            pg[n].locator(".opt").nth(k).click()
        host.get_by_text("Answers locked").wait_for(timeout=10000)
        host.get_by_role("button", name="Reveal answer").click()
        pg["Alice"].get_by_role("heading", name="Leaderboard").wait_for()
    host.screenshot(path=f"{SHOTS}/host-reveal.png")
    host.get_by_role("button", name=re.compile("Finish quiz")).click()
    pg["Alice"].get_by_role("heading", name="That is the quiz.").wait_for()
    print("PHONE end text:", pg["Alice"].locator("main").inner_text().split("Final standings")[-1].strip()[:200].replace("\n", " | "))

    # 6. results sheets
    with host.expect_download() as d: host.get_by_role("button", name=re.compile("Download results")).click()
    lines = open(d.value.path(), encoding="utf-8-sig").read().strip().splitlines()
    assert lines[0] == "Rank,Name,Type,Members,Points,Prize" and len(lines) == 3, lines
    print("full results CSV:", lines[1:])
    host.goto(f"{BASE}/host"); host.get_by_text("Real DB quiz").wait_for()
    host.get_by_role("button", name=re.compile(r"Registrations \(1\)")).click()
    host.get_by_role("cell", name="Pat Player").wait_for(); print("host sees the registration: Pat Player / Lions")
    with host.expect_download() as d2: host.get_by_role("button", name=re.compile("Download top")).click()
    top = open(d2.value.path(), encoding="utf-8-sig").read().strip().splitlines()
    assert len(top) == 3; print("saved top-10 CSV rows:", len(top) - 1)
    host.screenshot(path=f"{SHOTS}/host-events-ended.png")
    b.close()

errors = [e for e in errors if "favicon" not in e]
print("\nBrowser errors:", len(errors)); [print(" ", e) for e in errors[:8]]
assert not errors
print("REAL-DATABASE BROWSER TEST PASSED")

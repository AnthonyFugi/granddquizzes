"""Browser test: host + big screen + 3 phones play a whole quiz against the demo server.
Also checks: sound is silent until switched on, cues play through the game, and both CSV downloads.
Setup:  cd client && npm install && npm run build
        cd ../server && DEMO_QUESTIONS=4 npm run demo      (leave running)
        pip install playwright && playwright install chromium
Run:    python3 e2e/browser-flow.py      (screenshots land in /tmp/shots)"""
import re, sys, time
from playwright.sync_api import sync_playwright, expect

BASE = "http://localhost:5055"
CODE = "KQ7MX"
errors = []
SHOTS = "/tmp/shots"

def watch(page, name):
    page.on("pageerror", lambda e: errors.append(f"[{name}] pageerror: {e}"))
    page.on("console", lambda m: errors.append(f"[{name}] console.{m.type}: {m.text}") if m.type == "error" else None)

def shot(page, name):
    page.screenshot(path=f"{SHOTS}/{name}.png", full_page=False)

with sync_playwright() as p:
    b = p.chromium.launch()
    def ctx(w, h, mobile=False):
        c = b.new_context(viewport={"width": w, "height": h}, device_scale_factor=2 if mobile else 1, is_mobile=mobile, has_touch=mobile)
        return c
    host_c, screen_c = ctx(1280, 820), ctx(1440, 810)
    phones = {n: ctx(390, 844, True) for n in ["Alice", "Bob", "Cara"]}

    screen_c.add_init_script("window.__osc = 0; const o = BaseAudioContext.prototype.createOscillator; BaseAudioContext.prototype.createOscillator = function () { window.__osc++; return o.apply(this, arguments); };")
    osc = lambda: screen.evaluate('window.__osc')
    host = host_c.new_page(); watch(host, "host")
    screen = screen_c.new_page(); watch(screen, "screen")
    pg = {}
    for n, c in phones.items():
        pg[n] = c.new_page(); watch(pg[n], n)

    # ---- host sign in + console
    host.goto(f"{BASE}/host"); host.fill("#email", "host@demo.test"); host.fill("#pw", "whatever1")
    shot(host, "01-host-login")
    host.get_by_role("button", name="Sign in").click()
    host.get_by_role("heading", name="Your events").wait_for()
    shot(host, "02-host-events")
    host.get_by_role("button", name="New event").click()
    host.get_by_role("heading", name="New event").wait_for()
    shot(host, "03-host-new-event")
    host.get_by_role("button", name="Cancel").click()
    host.get_by_role("link", name="Open console").click()
    host.get_by_role("heading", name="Lobby").wait_for()

    # ---- big screen lobby
    screen.goto(f"{BASE}/screen/{CODE}")
    screen.get_by_text("Scan to join").wait_for()
    time.sleep(1.0)  # let the tile animation finish

    # ---- phones join
    pg["Alice"].goto(BASE); shot(pg["Alice"], "04-phone-join")
    for n in ["Alice", "Bob", "Cara"]:
        pg[n].goto(f"{BASE}/?code={CODE}")
        pg[n].fill("#nick", n)
        pg[n].get_by_role("button", name="Join quiz").click()
        pg[n].get_by_role("heading", name=re.compile("You are in")).wait_for()
        if n == "Alice":
            time.sleep(0.5)
            assert osc() == 0, "sound must be silent until switched on"
            screen.get_by_role("button", name="Turn sound on").click()
            screen.get_by_role("button", name="Sound on").wait_for()
            base_osc = osc(); assert base_osc >= 2, "confirmation chime expected"
            print("sound: silent before enabling, chime after enabling:", base_osc)
    pg["Alice"].get_by_label("Team name").fill("Lions")
    pg["Alice"].get_by_role("button", name="Create team").click()
    pg["Alice"].get_by_role("heading", name="Lions").wait_for()
    pg["Bob"].get_by_role("button", name="Join", exact=True).click()
    pg["Bob"].get_by_role("heading", name="Lions").wait_for()
    pg["Cara"].get_by_role("button", name="Join", exact=True).wait_for()
    time.sleep(0.6)
    after_join = osc(); assert after_join > base_osc, "join blip expected"
    shot(pg["Alice"], "05-phone-lobby-leader"); shot(pg["Cara"], "06-phone-lobby-solo")
    shot(screen, "07-screen-lobby"); shot(host, "08-host-lobby")

    # ---- play 4 questions
    for qn in range(4):
        host.get_by_role("button", name=re.compile(r"Start question 1|Next question")).click()
        pg["Cara"].locator(".opt").first.wait_for()
        screen.locator(".q-text").wait_for()
        time.sleep(0.5)
        if qn == 0:
            shot(pg["Cara"], "09-phone-question"); shot(pg["Bob"], "10-phone-question-teammate")
            shot(screen, "11-screen-question"); shot(host, "12-host-question")
        pg["Cara"].locator(".opt").nth(qn % 4).click()
        if qn == 0:
            time.sleep(0.4); shot(pg["Cara"], "13-phone-locked-in")
        pg["Alice"].locator(".opt").nth((qn + 1) % 4).click()
        # all answered -> auto lock; host reveals
        host.get_by_text("Answers locked").wait_for(timeout=8000)
        host.get_by_role("button", name="Reveal answer").click()
        pg["Cara"].get_by_text(re.compile("Leaderboard")).wait_for()
        screen.get_by_role("heading", name="Leaderboard").wait_for()
        time.sleep(0.5)
        if qn == 0:
            shot(pg["Cara"], "14-phone-reveal"); shot(pg["Alice"], "15-phone-reveal-team")
            shot(screen, "16-screen-reveal"); shot(host, "17-host-reveal")
    host.get_by_role("button", name=re.compile("Finish quiz")).click()
    pg["Cara"].get_by_role("heading", name="That is the quiz.").wait_for()
    screen.get_by_role("heading", name=re.compile("That is the quiz")).wait_for()
    time.sleep(0.5)
    shot(pg["Cara"], "18-phone-ended"); shot(screen, "19-screen-ended"); shot(host, "20-host-ended")
    total = osc(); assert total > after_join + 30, f"cues should play through the game, got {total - after_join}"
    print("sound: oscillators during the game:", total - after_join)
    with host.expect_download() as d:
        host.get_by_role("button", name=re.compile("Download results")).click()
    csv_text = open(d.value.path(), encoding="utf-8-sig").read()
    print("CSV filename:", d.value.suggested_filename); print(csv_text)
    lines = csv_text.strip().splitlines()
    assert lines[0] == "Rank,Name,Type,Members,Points,Prize"
    assert any(l.split(",")[1:3] == ["Lions", "Team"] and "Alice; Bob" in l for l in lines), "team row with members"
    assert any(",Cara,Solo," in l for l in lines) and len(lines) == 3
    host.goto(f"{BASE}/host")
    with host.expect_download() as d2:
        host.get_by_role("button", name=re.compile(r"Download top")).click()
    top = open(d2.value.path(), encoding="utf-8-sig").read().strip().splitlines()
    assert top[0] == "Rank,Name,Type,Members,Points,Prize" and len(top) == 3, top
    print("events-list CSV rows:", len(top) - 1)
    shot(host, "21-host-events-ended")
    print("PHONE Cara final:", pg["Cara"].locator("main").inner_text()[:260].replace("\n", " | "))
    print("SCREEN final:", screen.locator(".page").inner_text()[:260].replace("\n", " | "))
    b.close()

print("\nBrowser errors:", len(errors))
for e in errors[:12]: print(" ", e)

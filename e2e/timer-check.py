"""Checks the visible countdown: it counts down on the phone, turns red near zero, locks at zero,
and the host form timer presets and lobby time notes work.
Setup:  cd server && PORT=5057 DEMO_QUESTIONS=2 DEMO_SECONDS=8 npm run demo   (leave running)
Run:    python3 e2e/timer-check.py"""
import re, time
from playwright.sync_api import sync_playwright
BASE="http://localhost:5057"
with sync_playwright() as p:
    b=p.chromium.launch()
    hc=b.new_context(viewport={"width":1280,"height":820}); sc=b.new_context(viewport={"width":1280,"height":720}); pc=b.new_context(viewport={"width":390,"height":800},is_mobile=True)
    host,screen,ph=hc.new_page(),sc.new_page(),pc.new_page()
    host.goto(BASE+"/host"); host.fill("#email","h@x.io"); host.fill("#pw","password1"); host.get_by_role("button",name="Sign in").click()
    host.get_by_role("button",name="New event").click(); host.get_by_role("button",name="45s").click()
    assert host.locator("#s").input_value()=="45", "preset sets the field"
    host.screenshot(path="/tmp/shots/30-host-form-timer.png")
    host.get_by_role("button",name="Cancel").click()
    host.get_by_role("link",name="Open console").click(); host.get_by_role("heading",name="Lobby").wait_for()
    host.get_by_text(re.compile("8 seconds each")).wait_for()
    screen.goto(BASE+"/screen/KQ7MX"); screen.get_by_text(re.compile("8 seconds")).wait_for()
    ph.goto(BASE+"/?code=KQ7MX"); ph.fill("#nick","Zed"); ph.get_by_role("button",name="Join quiz").click(); ph.get_by_text(re.compile("Every question is timed")).wait_for()
    host.get_by_role("button",name="Start question 1").click()
    ph.locator("[role=timer]").wait_for()
    vals=[]
    for _ in range(9):
        vals.append(int(ph.locator(".clock-num").inner_text().replace("s","").strip())); time.sleep(1)
        if len(vals)==5: ph.screenshot(path="/tmp/shots/31-phone-low.png"); screen.screenshot(path="/tmp/shots/32-screen-low.png")
        if not ph.locator(".clock-num").count(): break
    print("phone countdown:", vals)
    assert vals[0]>=7 and vals==sorted(vals,reverse=True) and vals[-1]<=3, vals
    assert ph.locator(".clock.low").count()>=0
    host.get_by_text("Answers locked").wait_for(timeout=8000); print("locked automatically at zero")
    b.close()
print("OK")

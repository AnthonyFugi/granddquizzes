"""Checks the countdown ticks and the time-up buzzer when nobody answers.
Setup:  as browser-flow.py, but start the demo on port 5056 with a short timer:
        cd server && PORT=5056 DEMO_QUESTIONS=2 DEMO_SECONDS=7 npm run demo
Run:    python3 e2e/sound-timeup.py"""
import re, time
from playwright.sync_api import sync_playwright
BASE="http://localhost:5056"
with sync_playwright() as p:
    b=p.chromium.launch()
    hc=b.new_context(viewport={"width":1200,"height":800}); sc=b.new_context(viewport={"width":1280,"height":720}); pc=b.new_context(viewport={"width":390,"height":800})
    sc.add_init_script("window.__osc=0; const o=BaseAudioContext.prototype.createOscillator; BaseAudioContext.prototype.createOscillator=function(){window.__osc++; return o.apply(this,arguments)};")
    host,screen,ph=hc.new_page(),sc.new_page(),pc.new_page()
    host.goto(BASE+"/host"); host.fill("#email","h@x.io"); host.fill("#pw","password1"); host.get_by_role("button",name="Sign in").click()
    host.get_by_role("link",name="Open console").click(); host.get_by_role("heading",name="Lobby").wait_for()
    screen.goto(BASE+"/screen/KQ7MX"); screen.get_by_text("Scan to join").wait_for()
    ph.goto(BASE+"/?code=KQ7MX"); ph.fill("#nick","Zed"); ph.get_by_role("button",name="Join quiz").click(); ph.get_by_role("heading",name=re.compile("You are in")).wait_for()
    screen.get_by_role("button",name="Turn sound on").click(); screen.get_by_role("button",name="Sound on").wait_for()
    n0=screen.evaluate("window.__osc")
    host.get_by_role("button",name="Start question 1").click()
    time.sleep(0.6); n1=screen.evaluate("window.__osc")
    host.get_by_text("Answers locked").wait_for(timeout=12000)   # nobody answers: timer locks it
    time.sleep(0.5); n2=screen.evaluate("window.__osc")
    print("start cue oscillators:", n1-n0, "(expect 3)")
    print("ticks + buzzer oscillators:", n2-n1, "(expect 5 ticks + 1 buzzer = 6)")
    assert n1-n0==3 and n2-n1==6
    b.close()
print("OK")

"""Browser test of sign-up, branding, the player cap, the QR poster and paying with Flutterwave.
Starts its own server on a throwaway MongoDB database and a FAKE Flutterwave on localhost, so no real money moves.
Needs: MongoDB running locally, `npm install` in server/, and the client built (cd client && npm run build).
Run:   python3 e2e/billing-flow.py"""
import json, os, random, re, subprocess, threading, time, urllib.parse
from http.server import BaseHTTPRequestHandler, HTTPServer
from playwright.sync_api import sync_playwright
from PIL import Image, ImageDraw
from pypdf import PdfReader

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PORT = 5200 + random.randint(0, 300)
FAKE = PORT + 500
BASE = f"http://localhost:{PORT}"
SHOTS = os.environ.get("SHOTS", "/tmp/shots-billing")
os.makedirs(SHOTS, exist_ok=True)
DB = f"granddquiz_e2e_{int(time.time())}"

# ---- fake Flutterwave: create link, "pay page" that completes the payment, verify
txs, counter = {}, [7000]
class Fake(BaseHTTPRequestHandler):
    def log_message(self, *a): pass
    def send(self, code, obj=None, headers=None):
        self.send_response(code)
        for k, v in (headers or {}).items(): self.send_header(k, v)
        if obj is not None: self.send_header("Content-Type", "application/json")
        self.end_headers()
        if obj is not None: self.wfile.write(json.dumps(obj).encode())
    def do_POST(self):
        b = json.loads(self.rfile.read(int(self.headers.get("Content-Length", 0))))
        txs[b["tx_ref"]] = dict(tx_ref=b["tx_ref"], amount=b["amount"], currency=b["currency"], status="pending", redirect=b["redirect_url"])
        self.send(200, {"status": "success", "data": {"link": f"http://localhost:{FAKE}/pay/{b['tx_ref']}"}})
    def do_GET(self):
        u = urllib.parse.urlparse(self.path); q = urllib.parse.parse_qs(u.query)
        m = re.match(r"^/pay/(.+)$", u.path)
        if m:  # the customer "pays", then Flutterwave sends the browser back
            t = txs[m.group(1)]; counter[0] += 1; t.update(id=counter[0], status="successful")
            return self.send(302, headers={"Location": f"{t['redirect']}?status=successful&tx_ref={t['tx_ref']}&transaction_id={t['id']}"})
        m = re.match(r"^/v3/transactions/(\d+)/verify$", u.path)
        if m:
            t = next((x for x in txs.values() if str(x.get("id")) == m.group(1)), None)
            return self.send(200 if t else 404, {"status": "success", "data": t} if t else {"status": "error"})
        self.send(404, {"status": "error"})
srv = HTTPServer(("127.0.0.1", FAKE), Fake)
threading.Thread(target=srv.serve_forever, daemon=True).start()

env = {**os.environ, "PORT": str(PORT), "MONGODB_URI": f"mongodb://127.0.0.1:27017/{DB}", "JWT_SECRET": "e2e-secret", "NODE_ENV": "test",
       "AUTO_SEED": "true", "ADMIN_EMAIL": "admin@e2e.dev", "ADMIN_PASSWORD": "AdminPass123", "CLIENT_ORIGIN": BASE, "CLIENT_PUBLIC_URL": BASE,
       "API_PUBLIC_URL": BASE, "FLW_SECRET_KEY": "FLWSECK_TEST-fake", "FLW_SECRET_HASH": "h", "FLW_BASE_URL": f"http://localhost:{FAKE}", "ALLOW_HOST_SIGNUP": ""}
server = subprocess.Popen(["node", "src/server.js"], cwd=f"{ROOT}/server", env=env, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True)
deadline = time.time() + 30; ready = False
while time.time() < deadline and not ready:
    line = server.stdout.readline()
    if "ready" in line: ready = True
assert ready, "server did not start"

# a 300x120 test logo
img = Image.new("RGBA", (600, 240), (255, 255, 255, 0)); d = ImageDraw.Draw(img)
d.rounded_rectangle((10, 10, 590, 230), 40, fill=(207, 106, 31, 255)); d.ellipse((40, 50, 140, 150), fill=(240, 180, 41, 255)); d.text((180, 100), "HOT SPOT", fill=(255, 255, 255, 255))
LOGO = "/tmp/e2e-logo.png"; img.save(LOGO)

errors = []
def watch(page, name):
    page.on("pageerror", lambda e: errors.append(f"[{name}] {e}"))
    page.on("console", lambda m: errors.append(f"[{name}] {m.text}") if m.type == "error" and "404" not in m.text else None)
    page.on("dialog", lambda dlg: dlg.accept())

BOTS = f"""
const {{ io }} = require('{ROOT}/server/node_modules/socket.io-client');
const [code, count] = process.argv.slice(-2), n = Number(count);
let done = 0;
for (let i = 0; i < n; i++) {{ const s = io('{BASE}', {{ transports: ['websocket'] }}); s.on('connect', () => s.emit('player:join', {{ code, nickname: 'Bot' + i }}, () => {{ if (++done === n) console.log('joined'); }})); }}
setTimeout(() => process.exit(0), 600000);
"""
bots = None
try:
    with sync_playwright() as p:
        b = p.chromium.launch()
        hc = b.new_context(viewport={"width": 1280, "height": 860}); hc.set_default_timeout(15000); host = hc.new_page(); watch(host, "host")
        phone = b.new_context(viewport={"width": 390, "height": 844}, is_mobile=True, has_touch=True).new_page(); watch(phone, "phone")

        # 1. a venue owner signs up from the sign-in page
        host.goto(f"{BASE}/host"); host.get_by_role("link", name="Create a quiz master account").click()
        host.fill("#su-name", "Venue Owner"); host.fill("#su-email", "owner@hotspot.test"); host.fill("#su-phone", "0971000000"); host.fill("#su-pw", "OwnerPass123")
        host.get_by_role("button", name="Create account").click()
        host.get_by_role("heading", name="Your events").wait_for(); print("quiz master signed up in the browser")

        # 2. create an event with a logo, colour and sponsors
        host.get_by_role("button", name="New event").click()
        host.fill("#t", "Thursday Quiz Night"); host.fill("#n", "3"); host.fill("#s", "10")
        host.get_by_role("button", name=re.compile("Geography")).click()
        host.get_by_text("Your logo, colour and sponsors (optional)").click()
        host.fill("#bn", "Hot Spot Lounge"); host.fill("#bt", "Every Thursday at 7")
        host.get_by_role("button", name="Colour #cf6a1f").click()
        host.locator('input[type=file]').set_input_files(LOGO)
        host.locator("img.logo-preview").wait_for()
        host.get_by_label("Sponsor 1").fill("Mosi Lager"); host.get_by_label("Sponsor 2").fill("Zamtel")
        host.get_by_role("button", name="Create event").click()
        host.get_by_role("heading", name="Lobby").wait_for()
        code = host.locator('[aria-label^="Join code"]').first.get_attribute("aria-label").split()[-1]
        print("event created:", code)

        # 3. the free event shows the free limits and NO custom branding to guests
        host.goto(f"{BASE}/host"); host.get_by_text(re.compile(r"Free try-out, up to 10 players")).wait_for()
        host.screenshot(path=f"{SHOTS}/1-events-free.png")
        phone.goto(f"{BASE}/?code={code}")
        phone.get_by_text("Thursday Quiz Night").wait_for()
        assert phone.locator(".org-name").count() == 0, "free events must not show custom branding"
        print("free event: guests see the event name, not the branding")

        # 4. QR poster (still free: Granddquiz look, QR present, one A4 page)
        pg = hc.new_page(); watch(pg, "poster"); pg.goto(f"{BASE}/poster/{code}")
        pg.get_by_role("heading", name="Thursday Quiz Night").wait_for()
        assert pg.locator(".poster-qr svg").count() == 1 and pg.locator(".poster .tile").count() == 5
        pg.screenshot(path=f"{SHOTS}/2-poster-free.png", full_page=True)
        pg.pdf(path=f"{SHOTS}/poster-free.pdf", format="A4", print_background=True, prefer_css_page_size=True)
        assert len(PdfReader(f"{SHOTS}/poster-free.pdf").pages) == 1, "poster must fit on one A4 page"
        with pg.expect_download() as dl: pg.get_by_role("button", name="Download QR picture").click()
        dl.value.save_as(f"{SHOTS}/qr.png"); assert Image.open(f"{SHOTS}/qr.png").size[0] >= 1000
        print("poster renders, prints to one A4 page, QR downloads as a picture"); pg.close()

        # 5. fill the free room with 10 bots; the 11th phone is turned away
        host.goto(f"{BASE}/host"); print("step5: on events list"); host.get_by_role("link", name=re.compile("console")).click()
        host.get_by_role("heading", name="Lobby").wait_for(); print("step5: console open")
        bots = subprocess.Popen(["node", "-e", BOTS, code, "10"], stdout=subprocess.PIPE, text=True)
        assert "joined" in bots.stdout.readline()
        host.get_by_text("The room is full (10 players)").wait_for()
        phone.goto(f"{BASE}/?code={code}"); phone.fill("#nick", "Latecomer"); phone.get_by_role("button", name="Join quiz").click()
        phone.get_by_text(re.compile(r"This quiz is full \(10 players\)")).wait_for()
        phone.screenshot(path=f"{SHOTS}/3-phone-full.png"); print("11th player is told the quiz is full; host sees the upgrade prompt")

        # 6. host upgrades through Flutterwave (fake): Upgrade -> pick Medium -> pay -> back confirmed
        host.get_by_role("link", name="Upgrade this event").click()
        host.get_by_role("heading", name="Plans and billing").wait_for()
        assert host.locator("#which").input_value() != "", "event is preselected from the upgrade link"
        host.screenshot(path=f"{SHOTS}/4-billing.png", full_page=True)
        host.locator(".plan", has_text="Event: Medium").get_by_role("button", name=re.compile("Pay K400")).click()
        host.get_by_text("Payment received. Your plan is active.").wait_for(timeout=15000)
        host.get_by_text("Event: Medium").first.wait_for()
        assert any(t["amount"] == 400 and t["currency"] == "ZMW" for t in txs.values())
        host.screenshot(path=f"{SHOTS}/5-billing-paid.png", full_page=True); print("paid K400 via (fake) Flutterwave and came back confirmed")

        # 7. reopen the console: cap lifted, the waiting phone can join, and guests now see the branding
        host.goto(f"{BASE}/host"); host.get_by_text(re.compile(r"Event: Medium, up to 100 players")).wait_for()
        host.screenshot(path=f"{SHOTS}/6-events-paid.png")
        host.get_by_role("link", name=re.compile("console")).click()
        host.get_by_role("heading", name="Lobby").wait_for()
        phone.goto(f"{BASE}/?code={code}")
        phone.locator(".found .org-name").wait_for(); phone.fill("#nick", "Latecomer"); phone.get_by_role("button", name="Join quiz").click()
        phone.get_by_text("Hot Spot Lounge").first.wait_for(); print("after paying: 11th player joined and sees Hot Spot Lounge branding")
        phone.screenshot(path=f"{SHOTS}/7-phone-branded.png")

        # 8. big screen: branded lobby, then a question with the join corner + sponsors
        scr = b.new_context(viewport={"width": 1600, "height": 900}).new_page(); watch(scr, "screen")
        scr.goto(f"{BASE}/screen/{code}"); scr.locator(".stage-head .org-name").wait_for()
        assert scr.locator(".stage-head img").count() == 1, "logo shows on the big screen"
        assert scr.get_by_text("Powered by").count() == 1
        scr.screenshot(path=f"{SHOTS}/8-screen-lobby.png")
        host.get_by_role("button", name="Start question 1").click()
        scr.locator(".join-corner").wait_for(); scr.get_by_text("Mosi Lager").wait_for(); scr.get_by_text("Zamtel").wait_for()
        corner = scr.locator(".join-corner").bounding_box(); opts = scr.locator(".opt").last.bounding_box()
        assert not (corner["y"] < opts["y"] + opts["height"] and corner["y"] + corner["height"] > opts["y"] and corner["x"] < opts["x"] + opts["width"]), "join corner must not cover answers"
        scr.screenshot(path=f"{SHOTS}/9-screen-question.png"); print("big screen: branding, sponsors, persistent join QR, nothing covered")
        # accent colour reached the page
        assert scr.evaluate("getComputedStyle(document.querySelector('.stage')).getPropertyValue('--brand').trim()") == "#cf6a1f"

        # 9. poster now carries the branding
        pg = hc.new_page(); watch(pg, "poster2"); pg.goto(f"{BASE}/poster/{code}"); pg.locator(".poster-org").wait_for(); pg.locator("img.poster-logo").wait_for()
        pg.screenshot(path=f"{SHOTS}/10-poster-branded.png", full_page=True)
        pg.pdf(path=f"{SHOTS}/poster-branded.pdf", format="A4", print_background=True, prefer_css_page_size=True)
        assert len(PdfReader(f"{SHOTS}/poster-branded.pdf").pages) == 1
        print("branded poster: one A4 page")

        # 10. admin: quiz master list and a free trial
        ad = b.new_context(viewport={"width": 1280, "height": 760}).new_page(); watch(ad, "admin")
        ad.goto(f"{BASE}/admin/hosts"); ad.fill("#email", "admin@e2e.dev"); ad.fill("#pw", "AdminPass123"); ad.get_by_role("button", name="Sign in").click()
        ad.get_by_role("heading", name="Quiz masters").wait_for(); ad.get_by_text("Venue Owner").wait_for()
        ad.get_by_label("Days for Venue Owner").fill("14"); ad.get_by_label("Plan for Venue Owner").select_option("pro_month")
        ad.get_by_role("row", name=re.compile("Venue Owner")).get_by_role("button", name="Give").click()
        ad.get_by_text("Plan given to Venue Owner.").wait_for(); ad.get_by_text("Pro (monthly)").first.wait_for()
        ad.screenshot(path=f"{SHOTS}/11-admin-hosts.png"); print("admin gave a 14-day Pro trial")
        b.close()
    print("\nERRORS:", errors or "none")
    assert not errors, errors
    print("ALL BILLING BROWSER CHECKS PASSED")
finally:
    if bots: bots.kill()
    server.kill(); srv.shutdown()
    subprocess.run(["node", "-e", f"const m=require('{ROOT}/server/node_modules/mongoose');m.connect('mongodb://127.0.0.1:27017/{DB}').then(async()=>{{await m.connection.dropDatabase();process.exit(0)}})"])

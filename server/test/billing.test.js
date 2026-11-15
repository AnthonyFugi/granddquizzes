// Unit checks for plans, branding rules, the player cap and webhook signatures. No database needed:  npm test
process.env.FLW_SECRET_HASH = 'whsec-test';
process.env.PLAN_PRICES = '{"event_small":120}';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';

const { entitlementsFor, extendSubscription, getPlan, listPlans, FREE } = await import('../src/services/plans.js');
const { sanitizeBranding, publicBranding, decodeLogo } = await import('../src/services/branding.js');
const { webhookIsGenuine, matchesPayment } = await import('../src/services/flutterwave.js');
const { GameSession } = await import('../src/services/GameSession.js');

let n = 0;
const ok = (name) => { n++; console.log(`  ✓ ${name}`); };
const day = 86400000;

console.log('Plans');
assert.equal(getPlan('event_small').price, 120); ok('PLAN_PRICES overrides a price');
assert.equal(getPlan('event_medium').price, 400); ok('other prices keep their defaults');
assert.equal(entitlementsFor({ eventTier: 'free', host: {} }).maxPlayers, FREE.maxPlayers); ok('free event: 10 players, no branding');
assert.equal(entitlementsFor({ eventTier: 'free', host: {} }).branding, false);
assert.equal(entitlementsFor({ eventTier: 'free', host: {} }).whiteLabel, false);
assert.equal(entitlementsFor({ eventTier: 'event_medium', host: {} }).maxPlayers, 100); ok('event pass raises the cap and turns branding on');
const live = { subscription: { plan: 'pro_month', until: new Date(Date.now() + day) } };
const eLive = entitlementsFor({ eventTier: 'free', host: live });
assert.equal(eLive.maxPlayers, 300); assert.equal(eLive.whiteLabel, true); ok('active subscription covers every event');
const lapsed = { subscription: { plan: 'pro_month', until: new Date(Date.now() - day) } };
assert.equal(entitlementsFor({ eventTier: 'free', host: lapsed }).maxPlayers, 10); ok('expired subscription gives nothing');
const best = entitlementsFor({ eventTier: 'event_large', host: { subscription: { plan: 'venue_month', until: new Date(Date.now() + day) } } });
assert.equal(best.maxPlayers, 300); assert.equal(best.whiteLabel, false); ok('a pass and a subscription combine: the better of each');
const first = extendSubscription(undefined, getPlan('venue_month'));
assert.ok(Math.abs(first.until - (Date.now() + 30 * day)) < 5000); ok('new subscription runs 30 days from now');
const ext = extendSubscription({ plan: 'venue_month', until: first.until }, getPlan('venue_month'));
assert.ok(Math.abs(ext.until - (first.until.getTime() + 30 * day)) < 5000); ok('renewing early adds to the remaining time, not from today');
assert.ok(listPlans().every((p) => p.price > 0 && p.maxPlayers > 10)); ok('every paid plan costs something and beats free');

console.log('Branding');
const pixel = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
const b = sanitizeBranding({ orgName: '  Hot   Spot   Lounge ', tagline: 'x'.repeat(200), accent: '#CF6A1F', sponsors: ['A', 'B', 'C', 'D', ''], logo: pixel });
assert.equal(b.orgName, 'Hot Spot Lounge'); assert.equal(b.tagline.length, 80); assert.equal(b.accent, '#cf6a1f'); assert.equal(b.sponsors.length, 3);
ok('text is trimmed, limited, sponsors capped at 3');
assert.equal(sanitizeBranding({ accent: 'red; background:url(x)' }).accent, ''); ok('a non-hex colour is dropped (no CSS injection)');
assert.throws(() => sanitizeBranding({ logo: 'data:image/svg+xml;base64,PHN2Zz4=' }), /PNG, JPG or WebP/); ok('SVG logos are refused');
assert.throws(() => sanitizeBranding({ logo: 'https://evil.test/x.png' }), /PNG, JPG or WebP/); ok('logo must be an embedded image, not a link');
assert.throws(() => sanitizeBranding({ logo: 'data:image/png;base64,' + 'A'.repeat(130000) }), /too large/); ok('oversized logo is refused');
assert.equal(sanitizeBranding({ orgName: 'x' }).logo, undefined); ok('leaving logo out means "keep the current one"');
assert.equal(sanitizeBranding({ logo: '' }).logo, ''); ok('empty logo removes it');
assert.equal(decodeLogo(pixel).type, 'image/png'); assert.ok(decodeLogo(pixel).bytes.length > 20); ok('logo decodes to bytes with its type');
const freeEnt = entitlementsFor({ eventTier: 'free', host: {} });
const pb = publicBranding({ ...b, logo: pixel }, freeEnt, 'ABCDE');
assert.deepEqual(pb, { poweredBy: true }); ok('free events never show custom branding, and keep the Granddquiz badge');
const paidEnt = entitlementsFor({ eventTier: 'event_small', host: {} });
const pb2 = publicBranding({ ...b, logo: pixel }, paidEnt, 'ABCDE');
assert.equal(pb2.orgName, 'Hot Spot Lounge'); assert.equal(pb2.sponsors.length, 1); assert.equal(pb2.logoUrl, '/api/events/by-code/ABCDE/logo'); assert.equal(pb2.poweredBy, true);
assert.ok(!JSON.stringify(pb2).includes('base64')); ok('paid event shows branding, sponsor slots follow the plan, logo is a URL not inline data');
assert.equal(publicBranding(b, entitlementsFor({ eventTier: 'free', host: live }), 'ABCDE').poweredBy, false); ok('pro plan removes the Granddquiz badge');

console.log('Player cap');
const q = [{ text: 'q', options: ['a', 'b'], correctIndex: 0, category: 'c' }];
const s = new GameSession({ code: 'ABCDE', eventId: 'e', title: 't', questions: q, maxPlayers: 3 });
for (const name of ['Ann', 'Ben', 'Cho']) s.join({ nickname: name, socketId: name });
assert.throws(() => s.join({ nickname: 'Dee', socketId: 'd' }), /quiz is full \(3 players\)/); ok('a 4th player is refused on a 3-player plan');
const ann = [...s.players.values()][0];
assert.equal(s.join({ nickname: 'Ann', playerId: ann.id, socketId: 'new' }).id, ann.id); ok('an existing player can still reconnect when full');
s.removePlayer(ann.id); s.join({ nickname: 'Dee', socketId: 'd' }); ok('removing a player frees a seat');
s.maxPlayers = 30; s.join({ nickname: 'Eli', socketId: 'e' }); ok('raising the cap (after an upgrade) lets people in');
assert.equal(s.publicState().maxPlayers, 30); assert.equal(new GameSession({ code: 'X', eventId: 'e', title: 't', questions: q }).publicState().maxPlayers, null); ok('state shows the cap; uncapped sessions show null');

console.log('Payments');
const body = Buffer.from('{"event":"charge.completed"}');
assert.equal(webhookIsGenuine({ 'verif-hash': 'whsec-test' }, body), true); ok('webhook: correct verif-hash accepted');
assert.equal(webhookIsGenuine({ 'verif-hash': 'nope' }, body), false); ok('webhook: wrong verif-hash refused');
assert.equal(webhookIsGenuine({}, body), false); ok('webhook: no header refused');
const sig = crypto.createHmac('sha256', 'whsec-test').update(body).digest('base64');
assert.equal(webhookIsGenuine({ 'flutterwave-signature': sig }, body), true); ok('webhook: valid HMAC signature accepted');
assert.equal(webhookIsGenuine({ 'flutterwave-signature': sig }, Buffer.from('{"tampered":1}')), false); ok('webhook: signature of a different body refused');
const pay = { txRef: 'gq_1', amount: 400, currency: 'ZMW' };
assert.equal(matchesPayment({ status: 'successful', tx_ref: 'gq_1', amount: 400, currency: 'ZMW' }, pay), true); ok('verified payment matches');
assert.equal(matchesPayment({ status: 'successful', tx_ref: 'gq_1', amount: 100, currency: 'ZMW' }, pay), false); ok('underpayment does not match');
assert.equal(matchesPayment({ status: 'successful', tx_ref: 'gq_1', amount: 400, currency: 'USD' }, pay), false); ok('wrong currency does not match');
assert.equal(matchesPayment({ status: 'successful', tx_ref: 'gq_2', amount: 400, currency: 'ZMW' }, pay), false); ok('a different reference does not match');
assert.equal(matchesPayment({ status: 'failed', tx_ref: 'gq_1', amount: 400, currency: 'ZMW' }, pay), false); ok('failed payment does not match');

console.log(`\n${n} checks passed`);

'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const { once } = require('node:events');
const { spawnSync } = require('node:child_process');
const { mkdtempSync, rmSync } = require('node:fs');
const { join, resolve } = require('node:path');
const { tmpdir } = require('node:os');
const { buildCheckoutParams, CartError } = require('../server/checkout/checkout');
const { createApp } = require('../server/checkout/app');
const { loadConfig } = require('../server/checkout/config');

const SITE_URL = 'https://example.invalid/wakaba';
const ORIGIN = 'https://example.invalid';

function params(items, extra = {}) {
    return buildCheckoutParams({ orderNo: 'ORDER-1', items, ...extra }, SITE_URL);
}

function initialTotal(payload) {
    return payload.line_items.reduce((sum, line) => sum + line.quantity * line.price_data.unit_amount, 0);
}

test('環境変数がなくても公開 URL とポートの既定値を読み込める', () => {
    assert.deepEqual(loadConfig({}), {
        stripeSecretKey: '',
        webhookSecret: '',
        siteUrl: 'https://playmark0227-svg.github.io/kunioffice/wakaba',
        allowedOrigin: 'https://playmark0227-svg.github.io',
        port: 3000
    });
    const configured = loadConfig({ SITE_URL: SITE_URL + '/', ALLOWED_ORIGIN: ORIGIN, PORT: '4321' });
    assert.equal(configured.siteUrl, SITE_URL);
    assert.equal(configured.allowedOrigin, ORIGIN);
    assert.equal(configured.port, '4321');
});

test('既存エントリーポイントは設定がない場合、待受を始めず終了する', (t) => {
    // 作業用の .env を読まないよう、空の一時ディレクトリで起動する。
    const cwd = mkdtempSync(join(tmpdir(), 'kunioffice-checkout-'));
    t.after(() => rmSync(cwd, { recursive: true, force: true }));
    const result = spawnSync(process.execPath, [resolve(__dirname, '../server.js')], {
        cwd,
        env: {},
        encoding: 'utf8',
        timeout: 3000
    });
    assert.equal(result.status, 1);
    assert.match(result.stderr, /STRIPE_SECRET_KEY が設定されていません/);
    assert.equal(result.stdout, '');
});

test('主要カートの金額、送料、定期便モードを維持する', async (t) => {
    const cases = [
        ['single 1箱', [{ id: 'single', qty: 1 }], 3480, 'payment', 2],
        ['single 2箱で送料無料', [{ id: 'single', qty: 2 }], 5960, 'payment', 1],
        ['3箱セット', [{ id: 'set3', qty: 1 }], 8340, 'payment', 1],
        ['毎月の定期便', [{ id: 'teiki', qty: 1 }], 2680, 'subscription', 1],
        ['定期便と通常購入', [{ id: 'teiki', qty: 1 }, { id: 'single', qty: 1 }], 6160, 'subscription', 3]
    ];
    for (const [name, items, total, mode, count] of cases) {
        await t.test(name, () => {
            const payload = params(items);
            assert.equal(initialTotal(payload), total);
            assert.equal(payload.mode, mode);
            assert.equal(payload.line_items.length, count);
            assert.equal(payload.success_url, SITE_URL + '/thanks.html?status=paid');
            assert.equal(payload.cancel_url, SITE_URL + '/cart.html');
            assert.deepEqual(payload.shipping_address_collection, { allowed_countries: ['JP'] });
            if (mode === 'subscription') {
                assert.deepEqual(payload.line_items[0].price_data.recurring, { interval: 'month' });
            }
        });
    }
});

test('金額の入力を信用せず、注文番号を従来どおり整形する', () => {
    const payload = params([{ id: 'single', qty: 1, price: 1 }], { orderNo: ' 注文<ORDER_1->/' });
    assert.equal(initialTotal(payload), 3480);
    assert.equal(payload.client_reference_id, 'ORDER_1-');
    assert.equal(params([{ id: 'single', qty: 1 }], { orderNo: 'a'.repeat(100) }).client_reference_id.length, 64);
});

test('空のカート・不明な商品・数量範囲外を拒否する', () => {
    for (const body of [undefined, {}, { items: [] }, { items: 'single' }]) {
        assert.throws(() => buildCheckoutParams(body, SITE_URL), { name: 'Error', message: 'empty cart' });
    }
    for (const item of [null, {}, { id: 'unknown', qty: 1 }, { id: 'single', qty: 0 },
        { id: 'single', qty: 11 }, { id: 'single', qty: 'invalid' }, { id: 'teiki', qty: 6 }, { id: 'set3', qty: -1 }]) {
        assert.throws(() => params([item]), (err) => err instanceof CartError && err.message === 'invalid item');
    }
});

// 互換テスト。厳密な整数検証や重複商品の合算は別の機能変更として判断する。
test('既存の数量丸めと行ごとの判定を維持する', () => {
    assert.equal(params([{ id: 'single', qty: 1.8 }]).line_items[0].quantity, 1);
    assert.equal(params([{ id: 'single', qty: 10 }, { id: 'single', qty: 10 }]).line_items.length, 2);
});

async function serve(t, overrides = {}) {
    const calls = [];
    const events = [];
    const logs = [];
    const stripe = overrides.stripe || {
        checkout: { sessions: { create: async (payload) => { calls.push(payload); return { url: 'https://checkout.example.invalid/session' }; } } },
        webhooks: { constructEvent: (raw, signature, secret) => {
            events.push({ raw, signature, secret });
            return { type: 'checkout.session.completed', data: { object: { id: 'test-session', client_reference_id: 'ORDER-1' } } };
        } }
    };
    const config = { siteUrl: SITE_URL, allowedOrigin: ORIGIN, webhookSecret: '', ...overrides.config };
    const logger = { log: (...args) => logs.push(args), error: (...args) => logs.push(args) };
    const app = createApp({ stripe, config, logger });
    const server = app.listen(0, '127.0.0.1');
    await once(server, 'listening');
    t.after(() => new Promise((resolve, reject) => server.close((err) => err ? reject(err) : resolve())));
    const base = `http://127.0.0.1:${server.address().port}`;
    return { base, calls, events, logs };
}

function post(base, path, body, headers = {}) {
    return fetch(base + path, { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(body) });
}

test('HTTP Checkout は既存の入力と {url} 応答を維持する', async (t) => {
    const fixture = await serve(t);
    const response = await post(fixture.base, '/api/checkout', { orderNo: 'ORDER-1', items: [{ id: 'single', qty: 1 }] });
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('Access-Control-Allow-Origin'), ORIGIN);
    assert.deepEqual(await response.json(), { url: 'https://checkout.example.invalid/session' });
    assert.equal(fixture.calls.length, 1);
    assert.equal(initialTotal(fixture.calls[0]), 3480);
    const invalid = await post(fixture.base, '/api/checkout', { items: [{ id: 'single', qty: 11 }] });
    assert.equal(invalid.status, 400);
    assert.deepEqual(await invalid.json(), { error: 'invalid item' });
    assert.equal(fixture.calls.length, 1);
    const empty = await post(fixture.base, '/api/checkout', { items: [] });
    assert.equal(empty.status, 400);
    assert.deepEqual(await empty.json(), { error: 'empty cart' });
});

test('決済サービスの失敗は 500 を返し、SDK のエラー詳細を記録しない', async (t) => {
    const stripe = { checkout: { sessions: { create: async () => { throw new Error('provider-specific-detail'); } } } };
    const fixture = await serve(t, { stripe });
    const response = await post(fixture.base, '/api/checkout', { items: [{ id: 'single', qty: 1 }] });
    assert.equal(response.status, 500);
    assert.deepEqual(await response.json(), { error: 'checkout failed' });
    assert.deepEqual(fixture.logs, [['Checkout 作成エラー']]);
});

test('OPTIONS は許可するオリジンとメソッドを返す', async (t) => {
    const fixture = await serve(t);
    const response = await fetch(fixture.base + '/api/checkout', { method: 'OPTIONS' });
    assert.equal(response.status, 204);
    assert.equal(response.headers.get('Access-Control-Allow-Origin'), ORIGIN);
    assert.equal(response.headers.get('Access-Control-Allow-Headers'), 'Content-Type');
    assert.equal(response.headers.get('Access-Control-Allow-Methods'), 'POST, OPTIONS');
});

test('Webhook 設定がなければ署名処理を行わず 501 を返す', async (t) => {
    const fixture = await serve(t);
    const response = await post(fixture.base, '/webhook', { test: true });
    assert.equal(response.status, 501);
    assert.equal(await response.text(), 'webhook not configured');
    assert.equal(fixture.events.length, 0);
});

test('Webhook は JSON 化される前の raw bytes と署名を検証器に渡す', async (t) => {
    const fixture = await serve(t, { config: { webhookSecret: 'test-only-signing-value' } });
    const raw = '{\n  "test": true, "spaces": [ 1, 2 ]\n}';
    const response = await fetch(fixture.base + '/webhook', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Stripe-Signature': 'test-signature' },
        body: raw
    });
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { received: true });
    assert.equal(fixture.events.length, 1);
    assert.ok(Buffer.isBuffer(fixture.events[0].raw));
    assert.equal(fixture.events[0].raw.toString('utf8'), raw);
    assert.equal(fixture.events[0].signature, 'test-signature');
    assert.equal(fixture.events[0].secret, 'test-only-signing-value');
    assert.deepEqual(fixture.logs, [['注文完了:', 'test-session', 'ORDER-1']]);
});

test('Webhook の署名が不正なら 400 を返す', async (t) => {
    const stripe = { webhooks: { constructEvent: () => { throw new Error('signature rejected'); } } };
    const fixture = await serve(t, { stripe, config: { webhookSecret: 'test-only-signing-value' } });
    const response = await post(fixture.base, '/webhook', { test: true });
    assert.equal(response.status, 400);
    assert.equal(await response.text(), 'Webhook Error: signature rejected');
    assert.deepEqual(fixture.logs, []);
});

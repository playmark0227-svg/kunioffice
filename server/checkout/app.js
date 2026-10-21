'use strict';

const express = require('express');
const { loadConfig } = require('./config');
const { CartError, buildCheckoutParams } = require('./checkout');
const { registerWebhook } = require('./webhook');

// Stripe クライアントを外から受け取り、秘密の値や実決済なしでも検証できる。
// この関数は listen せず、環境変数を変更せず、Stripe クライアントも生成しない。
function createApp({ stripe, config = loadConfig(), logger = console } = {}) {
    if (!stripe) throw new TypeError('stripe client is required');
    const app = express();

    registerWebhook(app, { stripe, config, logger });
    app.use(express.json({ limit: '10kb' }));
    app.use((req, res, next) => {
        res.header('Access-Control-Allow-Origin', config.allowedOrigin);
        res.header('Access-Control-Allow-Headers', 'Content-Type');
        res.header('Access-Control-Allow-Methods', 'POST, OPTIONS');
        if (req.method === 'OPTIONS') return res.sendStatus(204);
        next();
    });

    app.post('/api/checkout', async (req, res, next) => {
        let params;
        try {
            params = buildCheckoutParams(req.body, config.siteUrl);
        } catch (err) {
            if (err instanceof CartError) return res.status(400).json({ error: err.message });
            return next(err);
        }
        try {
            const session = await stripe.checkout.sessions.create(params);
            res.json({ url: session.url });
        } catch (err) {
            // SDK のエラー本文には設定値が含まれることがあるため、そのままログに出さない。
            logger.error('Checkout 作成エラー');
            res.status(500).json({ error: 'checkout failed' });
        }
    });

    return app;
}

module.exports = { createApp };

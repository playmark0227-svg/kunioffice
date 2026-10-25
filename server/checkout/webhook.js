'use strict';

const express = require('express');

function registerWebhook(app, { stripe, config, logger }) {
    // 署名検証に必要なバイト列を保持するため、express.json より先に登録する。
    app.post('/webhook', express.raw({ type: 'application/json' }), (req, res) => {
        if (!config.webhookSecret) return res.status(501).send('webhook not configured');
        let event;
        try {
            event = stripe.webhooks.constructEvent(req.body, req.headers['stripe-signature'], config.webhookSecret);
        } catch (err) {
            return res.status(400).send(`Webhook Error: ${err.message}`);
        }
        // 現状はイベントの記録のみ。受注保存・発送処理は未実装。
        switch (event.type) {
            case 'checkout.session.completed':
                logger.log('注文完了:', event.data.object.id, event.data.object.client_reference_id);
                break;
            case 'invoice.payment_succeeded':
                logger.log('定期便の決済成功:', event.data.object.id);
                break;
            case 'customer.subscription.deleted':
                logger.log('定期便の解約:', event.data.object.id);
                break;
            default:
                break;
        }
        res.json({ received: true });
    });
}

module.exports = { registerWebhook };

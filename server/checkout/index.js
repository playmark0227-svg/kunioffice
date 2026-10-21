'use strict';

const { loadConfig } = require('./config');
const { createApp } = require('./app');

// 実行時だけ .env を読み、実 Stripe クライアントを作る。
// このモジュールをテストから require しただけでは起動しない。
function start() {
    require('dotenv').config();
    const config = loadConfig();
    if (!config.stripeSecretKey) {
        console.error('STRIPE_SECRET_KEY が設定されていません（.env を確認してください）');
        process.exitCode = 1;
        return null;
    }
    const Stripe = require('stripe');
    const stripe = Stripe(config.stripeSecretKey);
    const app = createApp({ stripe, config });
    return app.listen(config.port, () => console.log(`checkout server: http://localhost:${config.port}`));
}

if (require.main === module) start();

module.exports = { start, createApp };

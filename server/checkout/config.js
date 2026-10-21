'use strict';

// 環境変数を読む場所。秘密の値をブラウザ側の設定へコピーしないこと。
function loadConfig(env = process.env) {
    return {
        stripeSecretKey: env.STRIPE_SECRET_KEY || '',
        webhookSecret: env.STRIPE_WEBHOOK_SECRET || '',
        siteUrl: (env.SITE_URL || 'https://playmark0227-svg.github.io/kunioffice/wakaba').replace(/\/$/, ''),
        allowedOrigin: env.ALLOWED_ORIGIN || 'https://playmark0227-svg.github.io',
        port: env.PORT || 3000
    };
}

module.exports = { loadConfig };

// 若葉のしずく — Stripe Checkout サーバー（オンライン決済を使う場合のみ）
//
// GitHub Pages は静的ホスティングのため、カード決済を行うにはこのサーバーを
// Render / Railway / Fly.io などに別途デプロイします。手順は wakaba/README.md を参照。
//
//   STRIPE_SECRET_KEY=sk_live_...   （必須・公開しないこと）
//   STRIPE_WEBHOOK_SECRET=whsec_... （Webhook を使う場合）
//   SITE_URL=https://playmark0227-svg.github.io/kunioffice/wakaba
//   ALLOWED_ORIGIN=https://playmark0227-svg.github.io
//
// wakaba/js/config.js で checkout.mode = 'endpoint'、
// checkout.endpoint = 'https://<このサーバー>/api/checkout' に設定すると有効になります。

require('dotenv').config();
const express = require('express');
const Stripe = require('stripe');

if (!process.env.STRIPE_SECRET_KEY) {
    console.error('STRIPE_SECRET_KEY が設定されていません（.env を確認してください）');
    process.exit(1);
}

const stripe = Stripe(process.env.STRIPE_SECRET_KEY);
const SITE_URL = (process.env.SITE_URL || 'https://playmark0227-svg.github.io/kunioffice/wakaba').replace(/\/$/, '');
const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN || 'https://playmark0227-svg.github.io';

// 価格は必ずサーバー側で決める（ブラウザから届いた金額は信用しない）。
// wakaba/js/config.js の products / shipping と同じ値にそろえること。
const CATALOG = {
    teiki: { name: '若葉のしずく 定期便（毎月1箱・3g×30包）', price: 2680, recurring: true, freeShipping: true, maxQty: 5 },
    single: { name: '若葉のしずく 1箱（3g×30包）', price: 2980, recurring: false, freeShipping: false, maxQty: 10 },
    set3: { name: '若葉のしずく 3箱セット（3g×30包×3箱）', price: 8340, recurring: false, freeShipping: true, maxQty: 5 }
};
const SHIPPING = { fee: 500, freeThreshold: 5000 };

const app = express();

// Webhook は署名検証のため raw body で受け取る（express.json より前に定義）
app.post('/webhook', express.raw({ type: 'application/json' }), (req, res) => {
    const secret = process.env.STRIPE_WEBHOOK_SECRET;
    if (!secret) return res.status(501).send('webhook not configured');
    let event;
    try {
        event = stripe.webhooks.constructEvent(req.body, req.headers['stripe-signature'], secret);
    } catch (err) {
        return res.status(400).send(`Webhook Error: ${err.message}`);
    }
    switch (event.type) {
        case 'checkout.session.completed':
            console.log('注文完了:', event.data.object.id, event.data.object.client_reference_id);
            break;
        case 'invoice.payment_succeeded':
            console.log('定期便の決済成功:', event.data.object.id);
            break;
        case 'customer.subscription.deleted':
            console.log('定期便の解約:', event.data.object.id);
            break;
        default:
            break;
    }
    res.json({ received: true });
});

app.use(express.json({ limit: '10kb' }));
app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', ALLOWED_ORIGIN);
    res.header('Access-Control-Allow-Headers', 'Content-Type');
    res.header('Access-Control-Allow-Methods', 'POST, OPTIONS');
    if (req.method === 'OPTIONS') return res.sendStatus(204);
    next();
});

// カートの中身（商品IDと数量だけ）から Checkout セッションを作成
app.post('/api/checkout', async (req, res) => {
    const items = Array.isArray(req.body && req.body.items) ? req.body.items : [];
    const lines = [];
    for (const item of items) {
        const product = CATALOG[item && item.id];
        const qty = Math.floor(Number(item && item.qty));
        if (!product || !(qty >= 1 && qty <= product.maxQty)) {
            return res.status(400).json({ error: 'invalid item' });
        }
        lines.push({ product, qty });
    }
    if (!lines.length) return res.status(400).json({ error: 'empty cart' });

    const onetime = lines.filter((l) => !l.product.recurring).reduce((sum, l) => sum + l.product.price * l.qty, 0);
    const needsFee = lines.some((l) => !l.product.recurring && !l.product.freeShipping);
    const shipping = onetime > 0 && needsFee && onetime < SHIPPING.freeThreshold ? SHIPPING.fee : 0;

    const lineItems = lines.map((l) => ({
        quantity: l.qty,
        price_data: {
            currency: 'jpy',
            unit_amount: l.product.price,
            product_data: { name: l.product.name },
            ...(l.product.recurring ? { recurring: { interval: 'month' } } : {})
        }
    }));
    if (shipping) {
        lineItems.push({ quantity: 1, price_data: { currency: 'jpy', unit_amount: shipping, product_data: { name: '送料' } } });
    }

    const orderNo = String((req.body && req.body.orderNo) || '').replace(/[^A-Za-z0-9_-]/g, '').slice(0, 64);
    try {
        const session = await stripe.checkout.sessions.create({
            // 定期便を含む場合はサブスクリプション（通常購入分は初回請求にまとめて課金）
            mode: lines.some((l) => l.product.recurring) ? 'subscription' : 'payment',
            line_items: lineItems,
            client_reference_id: orderNo || undefined,
            locale: 'ja',
            shipping_address_collection: { allowed_countries: ['JP'] },
            phone_number_collection: { enabled: true },
            success_url: `${SITE_URL}/thanks.html?status=paid`,
            cancel_url: `${SITE_URL}/cart.html`
        });
        res.json({ url: session.url });
    } catch (err) {
        console.error('Checkout 作成エラー:', err.message);
        res.status(500).json({ error: 'checkout failed' });
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`checkout server: http://localhost:${PORT}`));

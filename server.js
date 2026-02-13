// Stripe決済バックエンド（Node.js + Express）
// このファイルは Node.js サーバーで実行してください

const express = require('express');
const stripe = require('stripe')('sk_test_YOUR_SECRET_KEY_HERE'); // Stripeシークレットキー
const app = express();

app.use(express.json());
app.use(express.static('.')); // 静的ファイル配信

// CORS設定（必要に応じて）
app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Headers', 'Content-Type');
    next();
});

// 単品購入用のCheckoutセッション作成
app.post('/api/create-checkout-session', async (req, res) => {
    try {
        const { productName, unitPrice, quantity, shipping } = req.body;
        
        const session = await stripe.checkout.sessions.create({
            payment_method_types: ['card'],
            line_items: [
                {
                    price_data: {
                        currency: 'jpy',
                        product_data: {
                            name: productName,
                            description: '北海道産100% 青汁',
                            images: ['https://your-domain.com/images/product-package.jpg'],
                        },
                        unit_amount: unitPrice,
                    },
                    quantity: quantity,
                },
                // 送料
                ...(shipping > 0 ? [{
                    price_data: {
                        currency: 'jpy',
                        product_data: {
                            name: '送料',
                        },
                        unit_amount: shipping,
                    },
                    quantity: 1,
                }] : []),
            ],
            mode: 'payment',
            success_url: 'https://your-domain.com/success.html?session_id={CHECKOUT_SESSION_ID}',
            cancel_url: 'https://your-domain.com/shop.html?canceled=true',
            shipping_address_collection: {
                allowed_countries: ['JP'],
            },
            phone_number_collection: {
                enabled: true,
            },
        });
        
        res.json({ id: session.id });
    } catch (error) {
        console.error('Error creating checkout session:', error);
        res.status(500).json({ error: error.message });
    }
});

// 定期購入用のCheckoutセッション作成
app.post('/api/create-subscription-session', async (req, res) => {
    try {
        const { productName, monthlyPrice } = req.body;
        
        // Stripeダッシュボードで作成したサブスクリプション商品のPrice IDを使用
        // 例: price_1234567890abcdef
        // または、その場で価格を作成
        
        const session = await stripe.checkout.sessions.create({
            payment_method_types: ['card'],
            line_items: [
                {
                    price_data: {
                        currency: 'jpy',
                        product_data: {
                            name: productName,
                            description: '毎月自動お届け・送料無料・10% OFF',
                        },
                        unit_amount: monthlyPrice,
                        recurring: {
                            interval: 'month',
                        },
                    },
                    quantity: 1,
                },
            ],
            mode: 'subscription',
            success_url: 'https://your-domain.com/subscription-success.html?session_id={CHECKOUT_SESSION_ID}',
            cancel_url: 'https://your-domain.com/shop.html?canceled=true',
            shipping_address_collection: {
                allowed_countries: ['JP'],
            },
            phone_number_collection: {
                enabled: true,
            },
        });
        
        res.json({ id: session.id });
    } catch (error) {
        console.error('Error creating subscription session:', error);
        res.status(500).json({ error: error.message });
    }
});

// Webhookエンドポイント（Stripeからのイベント受信）
app.post('/webhook', express.raw({ type: 'application/json' }), async (req, res) => {
    const sig = req.headers['stripe-signature'];
    const webhookSecret = 'whsec_YOUR_WEBHOOK_SECRET';
    
    let event;
    
    try {
        event = stripe.webhooks.constructEvent(req.body, sig, webhookSecret);
    } catch (err) {
        console.error('Webhook signature verification failed:', err.message);
        return res.status(400).send(`Webhook Error: ${err.message}`);
    }
    
    // イベント処理
    switch (event.type) {
        case 'checkout.session.completed':
            const session = event.data.object;
            console.log('Payment successful:', session.id);
            // 注文処理、メール送信、データベース保存など
            break;
        case 'invoice.payment_succeeded':
            // 定期購入の支払い成功
            const invoice = event.data.object;
            console.log('Subscription payment succeeded:', invoice.id);
            break;
        case 'customer.subscription.deleted':
            // 定期購入キャンセル
            const subscription = event.data.object;
            console.log('Subscription canceled:', subscription.id);
            break;
        default:
            console.log(`Unhandled event type: ${event.type}`);
    }
    
    res.json({ received: true });
});

// 決済成功ページ
app.get('/success.html', (req, res) => {
    res.sendFile(__dirname + '/success.html');
});

// サーバー起動
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
    console.log(`Shop: http://localhost:${PORT}/shop.html`);
});

// 環境変数の使用を推奨
// STRIPE_SECRET_KEY=sk_live_... node server.js

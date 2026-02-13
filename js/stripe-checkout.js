// Stripe Checkout統合
// 本番環境では、Stripeの公開可能キー（Publishable Key）を設定してください
// テスト用: pk_test_...
// 本番用: pk_live_...

const STRIPE_PUBLIC_KEY = 'pk_test_YOUR_PUBLISHABLE_KEY_HERE';

// Stripeインスタンス（Stripe.jsが読み込まれた後に初期化）
let stripe = null;

// ページ読み込み時にStripeを初期化
document.addEventListener('DOMContentLoaded', function() {
    if (typeof Stripe !== 'undefined') {
        // TODO: 本番環境では実際のStripe公開キーを設定してください
        // stripe = Stripe(STRIPE_PUBLIC_KEY);
        console.log('Stripe.js loaded (demo mode)');
    }
});

// 単品購入 - Stripe Checkoutへリダイレクト
async function buyWithStripe() {
    const quantity = parseInt(document.getElementById('quantity').value);
    const productName = '若葉のしずく';
    const unitPrice = 2980; // 円
    const shipping = quantity * unitPrice >= 5000 ? 0 : 500;
    const total = (unitPrice * quantity) + shipping;
    
    // デモモード: Stripeテスト環境での決済デモ
    if (!stripe) {
        alert(`Stripe決済デモモード\n\n商品: ${productName}\n数量: ${quantity}\n商品代金: ¥${(unitPrice * quantity).toLocaleString()}\n送料: ¥${shipping.toLocaleString()}\n合計: ¥${total.toLocaleString()}\n\n実際の決済を有効にするには:\n1. Stripeアカウントを作成\n2. APIキーを取得\n3. stripe-checkout.jsにキーを設定`);
        return;
    }
    
    try {
        // バックエンドAPIに決済セッション作成をリクエスト
        const response = await fetch('/api/create-checkout-session', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                productName: productName,
                unitPrice: unitPrice,
                quantity: quantity,
                shipping: shipping,
                purchaseType: 'onetime'
            })
        });
        
        const session = await response.json();
        
        // Stripe Checkoutページへリダイレクト
        const result = await stripe.redirectToCheckout({
            sessionId: session.id
        });
        
        if (result.error) {
            alert(result.error.message);
        }
    } catch (error) {
        console.error('Error:', error);
        alert('決済処理でエラーが発生しました。もう一度お試しください。');
    }
}

// 定期購入 - Stripe Checkoutへリダイレクト（サブスクリプション）
async function subscribeWithStripe() {
    const productName = '若葉のしずく 定期購入';
    const monthlyPrice = 2680; // 円/月
    
    // デモモード
    if (!stripe) {
        alert(`Stripe定期購入デモモード\n\n商品: ${productName}\n月額料金: ¥${monthlyPrice.toLocaleString()}\n送料: 無料\n\n【定期購入の特典】\n・毎月自動でお届け\n・10% OFF（通常¥2,980 → ¥2,680）\n・送料無料\n・いつでも休止・解約OK\n\n実際の定期購入を有効にするには:\n1. Stripeアカウントを作成\n2. 商品とサブスクリプションプランを設定\n3. APIキーを取得・設定`);
        return;
    }
    
    try {
        // バックエンドAPIに定期購入セッション作成をリクエスト
        const response = await fetch('/api/create-subscription-session', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                productName: productName,
                monthlyPrice: monthlyPrice,
                purchaseType: 'subscription'
            })
        });
        
        const session = await response.json();
        
        // Stripe Checkoutページへリダイレクト
        const result = await stripe.redirectToCheckout({
            sessionId: session.id
        });
        
        if (result.error) {
            alert(result.error.message);
        }
    } catch (error) {
        console.error('Error:', error);
        alert('定期購入処理でエラーが発生しました。もう一度お試しください。');
    }
}

// カートに追加機能（将来の拡張用）
function addToCartWithStripe() {
    const quantity = document.getElementById('quantity').value;
    
    // LocalStorageにカート情報を保存
    let cart = JSON.parse(localStorage.getItem('cart') || '[]');
    
    const existingItem = cart.find(item => item.product === '若葉のしずく');
    if (existingItem) {
        existingItem.quantity += parseInt(quantity);
    } else {
        cart.push({
            product: '若葉のしずく',
            unitPrice: 2980,
            quantity: parseInt(quantity),
            image: 'images/product-package.jpg'
        });
    }
    
    localStorage.setItem('cart', JSON.stringify(cart));
    
    alert(`若葉のしずく ${quantity}個をカートに追加しました！\n\nカートページで決済できます。`);
    
    // カートアイコンに数量を表示（将来実装）
    updateCartBadge();
}

// カートバッジ更新
function updateCartBadge() {
    const cart = JSON.parse(localStorage.getItem('cart') || '[]');
    const totalItems = cart.reduce((sum, item) => sum + item.quantity, 0);
    
    // カートバッジ要素があれば更新
    const badge = document.getElementById('cart-badge');
    if (badge) {
        badge.textContent = totalItems;
        badge.style.display = totalItems > 0 ? 'block' : 'none';
    }
}

// Stripe Payment Element統合（より高度な決済フォーム）
async function createPaymentElement() {
    if (!stripe) return;
    
    const elements = stripe.elements();
    const paymentElement = elements.create('payment');
    paymentElement.mount('#payment-element');
}

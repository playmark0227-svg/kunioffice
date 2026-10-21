'use strict';

const { CATALOG, SHIPPING } = require('./catalog');

class CartError extends Error {}

// 通信・環境変数・Stripe SDK に依存しないカート計算。
// 既存の金額・送料・数量の扱いと Checkout API の入力を維持している。
function buildCheckoutParams(body, siteUrl) {
    const items = Array.isArray(body && body.items) ? body.items : [];
    const lines = [];
    for (const item of items) {
        const product = CATALOG[item && item.id];
        const qty = Math.floor(Number(item && item.qty));
        if (!product || !(qty >= 1 && qty <= product.maxQty)) {
            throw new CartError('invalid item');
        }
        lines.push({ product, qty });
    }
    if (!lines.length) throw new CartError('empty cart');

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

    const orderNo = String((body && body.orderNo) || '').replace(/[^A-Za-z0-9_-]/g, '').slice(0, 64);
    return {
        // 定期便を含む場合、通常購入分は初回請求にまとめる。
        mode: lines.some((l) => l.product.recurring) ? 'subscription' : 'payment',
        line_items: lineItems,
        client_reference_id: orderNo || undefined,
        locale: 'ja',
        shipping_address_collection: { allowed_countries: ['JP'] },
        phone_number_collection: { enabled: true },
        success_url: `${siteUrl}/thanks.html?status=paid`,
        cancel_url: `${siteUrl}/cart.html`
    };
}

module.exports = { CartError, buildCheckoutParams };

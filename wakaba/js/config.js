/* ============================================================
   若葉のしずく オンラインショップ — 設定ファイル
   カートの計算に使う価格・送料・定期便の条件と、決済方法の設定です。
   価格などを変えたときは、ページに書いてある金額（index.html・guide.html・
   tokushoho.html・KUNI OFFICE トップの index.html）も同じ値に直してください。
   カード決済で server.js を使う場合は、server/checkout/catalog.js の CATALOG も同じ値にそろえます。
   ============================================================ */
window.WAKABA = {
    shop: {
        name: '若葉のしずく 公式オンラインショップ',
        seller: 'KUNI OFFICE（クニオフィス）',
        email: 'info@kunioffice.jp',
        tel: '0153-82-1538',
        fax: '0153-85-7040',
        hours: '平日 8:30〜17:30',
        address: '〒086-1631 北海道標津郡標津町北1条西2丁目3-2',
        corporateUrl: '../index.html'
    },

    // 商品カタログ（価格はすべて税込・円）
    products: {
        teiki: {
            id: 'teiki',
            name: '若葉のしずく 定期便',
            label: '定期便（毎月1箱お届け）',
            spec: '3g×30包 × 1箱 / 毎月',
            price: 2680,
            regularPrice: 2980,
            type: 'subscription',
            freeShipping: true,
            maxQty: 5,
            image: 'images/package-cream.jpg'
        },
        single: {
            id: 'single',
            name: '若葉のしずく 1箱',
            label: '1箱（30包）',
            spec: '3g×30包',
            price: 2980,
            type: 'onetime',
            freeShipping: false,
            maxQty: 10,
            image: 'images/package-kraft.jpg'
        },
        set3: {
            id: 'set3',
            name: '若葉のしずく 3箱セット',
            label: '3箱セット（90包）',
            spec: '3g×30包 × 3箱',
            price: 8340,
            type: 'onetime',
            freeShipping: true,
            maxQty: 5,
            image: 'images/package-kraft.jpg'
        }
    },

    // 送料（通常購入分に適用。定期便は常に無料）
    shipping: {
        fee: 500,
        freeThreshold: 5000
    },

    // 定期便の条件（確認画面・ご利用ガイドに表示）
    subscription: {
        cycle: '毎月1回',
        term: 'お届け回数の縛りはありません（解約のお申し出まで継続）',
        cancel: '次回お届け予定日の7日前までに、メールまたはお電話でご連絡ください',
        fee: '休止・解約の手数料はかかりません'
    },

    /* 決済方法
       'email'  : ご注文内容をメールで送信 → 店舗からお支払い方法をご案内（初期設定・準備不要）
       'stripe' : Stripe の Payment Links に移動（カート内が1種類の商品のときに使用）
       'endpoint': server.js などの決済サーバーで Stripe Checkout を作成 */
    checkout: {
        mode: 'email',
        stripePaymentLinks: {
            teiki: '',
            single: '',
            set3: ''
        },
        endpoint: '',
        paymentNote: 'ご注文の受付後、お支払い方法とお届け予定日を担当者よりメールでご案内します。'
    }
};

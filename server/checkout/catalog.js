'use strict';

// 決済に使う価格は必ずサーバー側で決める。
// 価格変更時は wakaba/js/config.js と公開ページの表示も同じ値にそろえる。
const CATALOG = {
    teiki: { name: '若葉のしずく 定期便（毎月1箱・3g×30包）', price: 2680, recurring: true, freeShipping: true, maxQty: 5 },
    single: { name: '若葉のしずく 1箱（3g×30包）', price: 2980, recurring: false, freeShipping: false, maxQty: 10 },
    set3: { name: '若葉のしずく 3箱セット（3g×30包×3箱）', price: 8340, recurring: false, freeShipping: true, maxQty: 5 }
};
const SHIPPING = { fee: 500, freeThreshold: 5000 };

module.exports = { CATALOG, SHIPPING };

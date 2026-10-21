/* 編集画面と保存先の境界。将来のサーバー接続も、この8メソッドを実装します。
   契約と返却型: docs/ADMIN_API.md。認証はここへ混ぜず app/admin.js 側で行います。 */
(function (root, factory) {
    'use strict';
    if (typeof module === 'object' && module.exports) module.exports = factory();
    else root.CMSContentClient = factory();
}(typeof self !== 'undefined' ? self : this, function () {
    'use strict';

    const methods = Object.freeze([
        'snapshot', 'getBlobText', 'getBlobBytes', 'commitChanges',
        'listCommits', 'revertPreview', 'revertCommit', 'deployStatus'
    ]);

    // アダプターの認証情報・内部キャッシュを、画面側の app へ公開しません。
    function from(adapter) {
        for (const name of methods) {
            if (!adapter || typeof adapter[name] !== 'function') {
                throw new TypeError('ContentClient に必要なメソッドがありません: ' + name);
            }
        }
        const client = {};
        for (const name of methods) client[name] = (...args) => adapter[name](...args);
        return Object.freeze(client);
    }

    return Object.freeze({
        from,
        methods,
        protectedMessage: 'この変更には、サイトの仕組みのファイル（サイト管理者が管理する部分）が含まれているため、ここでは取り消せません。ViFightにご連絡ください。'
    });
}));

/* CMS から変更できるファイルの共通ルール。
   サーバー化後は、この判定をサーバーでも強制してください。ブラウザの判定だけでは認可になりません。 */
(function (root, factory) {
    'use strict';
    if (typeof module === 'object' && module.exports) module.exports = factory();
    else root.CMSPathPolicy = factory();
}(typeof self !== 'undefined' ? self : this, function () {
    'use strict';

    const INTERNAL = /^(admin|manual|server|docs|scripts|tests|dist|\.github|node_modules)\/|(^|\/)node_modules\/|^server\.js$/;
    const TEXT = /\.(html|js)$/i;
    const IMAGE = /\.(jpe?g|png|webp|gif)$/i;

    function isInternalPath(path) {
        return typeof path !== 'string' || !path || /[\\?#\u0000-\u001f]/.test(path)
            || path.startsWith('/') || path.split('/').some((part) => !part || part.startsWith('.'))
            || INTERNAL.test(path);
    }

    function isSiteTextPath(path) {
        return !isInternalPath(path) && TEXT.test(path);
    }

    function isProtectedPath(path) {
        return isInternalPath(path) || !(TEXT.test(path) || IMAGE.test(path));
    }

    return Object.freeze({ isInternalPath, isSiteTextPath, isProtectedPath });
}));

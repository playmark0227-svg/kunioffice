/* ============================================================
   KUNI OFFICE 管理画面 — 設定
   編集できるページ・共通情報・実績一覧のひな形をここで決めます。
   ============================================================ */
window.CMS_CONFIG = {
    owner: 'playmark0227-svg',
    repo: 'kunioffice',
    branch: 'main',
    siteUrl: 'https://playmark0227-svg.github.io/kunioffice/',
    workflowName: 'Deploy to GitHub Pages',

    // 編集できるページ（ページ選択の並び順）
    pages: [
        { path: 'index.html', label: 'ホーム', group: 'KUNI OFFICE' },
        { path: 'services.html', label: '事業内容', group: 'KUNI OFFICE' },
        { path: 'works.html', label: '実績', group: 'KUNI OFFICE' },
        { path: 'company.html', label: '会社情報', group: 'KUNI OFFICE' },
        { path: 'contact.html', label: 'お問い合わせ', group: 'KUNI OFFICE' },
        { path: 'wakaba/index.html', label: 'ショップ トップ', group: '若葉のしずく' },
        { path: 'wakaba/guide.html', label: 'ご利用ガイド', group: '若葉のしずく' },
        { path: 'wakaba/tokushoho.html', label: '特定商取引法の表記', group: '若葉のしずく' },
        { path: 'wakaba/privacy.html', label: 'プライバシーポリシー', group: '若葉のしずく' }
    ],

    // 共通情報: サイト全体の文章から、この文字とまったく同じ部分を置き換えます。
    // value は最初の目安です。実際の値は wakaba/js/config.js と company.html から読み取ります。
    globalFields: [
        { key: 'tel', label: '電話番号', value: '0153-82-1538', pattern: '^[0-9]{2,5}-[0-9]{1,4}-[0-9]{3,4}$' },
        { key: 'fax', label: 'FAX', value: '0153-85-7040', pattern: '^[0-9]{2,5}-[0-9]{1,4}-[0-9]{3,4}$' },
        { key: 'mobile', label: '携帯（土日祝）', value: '090-7519-5705', pattern: '^[0-9]{2,5}-[0-9]{1,4}-[0-9]{3,4}$' },
        { key: 'email', label: 'メールアドレス', value: 'info@kunioffice.jp', pattern: '^[^\\s@<>"\']+@[^\\s@<>"\']+\\.[^\\s@<>"\']+$' },
        { key: 'zip', label: '郵便番号', value: '086-1631', pattern: '^[0-9]{3}-[0-9]{4}$' },
        { key: 'address', label: '住所（〒のあと）', value: '北海道標津郡標津町北1条西2丁目3-2' },
        { key: 'hours', label: '営業時間（時刻）', value: '8:30〜17:30' }
    ],

    // 追加・削除・並べ替えができる一覧（ページ側の data-cms-list="works" と対応）
    collections: {
        works: {
            label: '実績',
            itemSelector: '.work-item',
            categoryAttr: 'data-category',
            categoryLabelSelector: '.work-category',
            titleSelector: '.work-details h3',
            descSelector: '.work-details p',
            imageSelector: '.work-image img',
            categories: [
                { value: 'photo', label: '写真撮影' },
                { value: 'print', label: '印刷物' },
                { value: 'video', label: '映像制作' },
                { value: 'signboard', label: '看板' },
                { value: 'goods', label: 'オリジナルグッズ' }
            ],
            newImageDir: 'images/works/',
            // 分類ラベルは分類から決まるので、ほかの実績と同じく data-cms-lock を付けておく
            template: [
                '<div class="work-item" data-category="{category}">',
                '    <div class="work-image">',
                '        <img src="{image}" alt="{alt}">',
                '    </div>',
                '    <div class="work-details">',
                '        <span class="work-category" data-cms-lock>{categoryLabel}</span>',
                '        <h3>{title}</h3>',
                '        <p>{desc}</p>',
                '    </div>',
                '</div>'
            ].join('\n')
        }
    }
};

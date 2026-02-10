# KUNI OFFICE ホームページ

標津町にある写真、印刷、映像、看板制作、オリジナルTシャツなど幅広いサービスを提供するKUNI OFFICEの公式ホームページです。

## 🎯 プロジェクト概要

このウェブサイトは、KUNI OFFICEの事業内容、制作実績、会社情報を紹介し、お客様からのお問い合わせを受け付けるために作成されました。

**新機能**: Supabaseを使用した実績の動的管理機能を実装しました！

## 🎨 デザインコンセプト

- **落ち着いた色使い**: 深い青色（#003d7a）をメインカラーに採用
- **大人っぽい雰囲気**: プロフェッショナルな印象を重視
- **アートリンク風**: 業界標準の洗練されたデザイン

## 📄 ページ構成

- **ホーム (index.html)**: トップページ。サービス概要と会社紹介
- **実績 (works.html)**: これまでの制作実績を紹介（Supabase連携）
- **事業内容 (services.html)**: 提供サービスの詳細説明
- **会社情報 (company.html)**: 会社概要、アクセス情報
- **お問い合わせ (contact.html)**: お問い合わせフォーム
- **管理画面 (admin.html)**: 実績の追加・削除（要Supabase設定）

## 🎨 デザインの特徴

- **モダンでクリーンなデザイン**: 視認性とユーザビリティを重視
- **レスポンシブ対応**: PC、タブレット、スマートフォンに最適化
- **直感的なナビゲーション**: わかりやすいメニュー構造
- **アニメーション効果**: スムーズなスクロールとフェードイン効果

## 🛠️ 技術スタック

- **HTML5**: セマンティックなマークアップ
- **CSS3**: モダンなスタイリングとレスポンシブデザイン
- **JavaScript (Vanilla)**: インタラクティブな機能
- **Google Fonts**: Noto Sans JPフォント
- **Supabase**: バックエンドデータベース（実績管理）

## 📱 主な機能

### 1. ハンバーガーメニュー
- モバイル表示時に表示される開閉式メニュー
- スムーズなアニメーション

### 2. 実績フィルター
- カテゴリ別に実績を絞り込み表示
- スムーズなトランジション効果

### 3. **Supabase連携（NEW!）**
- 実績をデータベースで管理
- 管理画面から簡単に追加・削除
- 画像アップロード機能
- リアルタイムでの表示更新

### 4. お問い合わせフォーム
- 入力バリデーション機能
- リアルタイムエラー表示
- 送信完了メッセージ

### 5. スクロールアニメーション
- カードのフェードイン効果
- ページトップへ戻るボタン

### 6. スムーズスクロール
- ページ内リンクのスムーズな移動

## 📂 ファイル構造

```
/home/user/webapp/
├── index.html          # ホームページ
├── works.html          # 実績ページ（Supabase連携）
├── services.html       # 事業内容ページ
├── company.html        # 会社情報ページ
├── contact.html        # お問い合わせページ
├── admin.html          # 管理画面（実績追加・削除）
├── css/
│   └── style.css      # メインスタイルシート
├── js/
│   ├── main.js        # メインJavaScript
│   └── supabase.js    # Supabase連携
├── images/            # 画像ファイル用
├── README.md          # このファイル
└── SUPABASE_SETUP.md  # Supabase設定ガイド
```

## 🚀 使い方

### ローカルでの表示方法

1. このディレクトリをWebサーバーで公開
2. ブラウザで `index.html` にアクセス

#### 簡易サーバーの起動方法

**Python 3を使用する場合:**
```bash
cd /home/user/webapp
python3 -m http.server 8000
```

**Node.jsを使用する場合:**
```bash
cd /home/user/webapp
npx http-server -p 8000
```

その後、ブラウザで `http://localhost:8000` にアクセスしてください。

### 🔧 Supabase連携の設定

実績管理機能を使用するには、Supabaseのセットアップが必要です。

**詳細な手順は [SUPABASE_SETUP.md](SUPABASE_SETUP.md) をご覧ください。**

#### クイックスタート

1. [Supabase](https://supabase.com/)でプロジェクトを作成
2. `works` テーブルを作成（SQLは SUPABASE_SETUP.md 参照）
3. `js/supabase.js` の設定を更新：

```javascript
const SUPABASE_CONFIG = {
    url: 'https://your-project.supabase.co',
    anonKey: 'your-anon-key'
};
```

4. `admin.html` にアクセスして実績を追加

#### 管理画面の使い方

1. ブラウザで `admin.html` を開く
2. タイトル、説明、カテゴリを入力
3. 画像をアップロード（任意）
4. 「実績を追加」ボタンをクリック
5. `works.html` に自動的に表示されます！

## 🔧 カスタマイズ方法

### 色の変更
`css/style.css` の `:root` セクションで色を変更できます：

```css
:root {
    --primary-color: #003d7a;    /* メインカラー（深い青） */
    --secondary-color: #002952;  /* セカンダリーカラー */
    --accent-color: #e60012;     /* アクセントカラー（赤） */
}
```

### 会社情報の更新
各HTMLファイルのフッター部分と `company.html` で会社情報を更新してください。

### 画像の追加

#### 方法1: Supabaseを使用（推奨）

管理画面（`admin.html`）から画像付きで実績を追加できます。

#### 方法2: 静的画像の追加

`images/` フォルダに画像を追加し、HTMLファイル内の `.placeholder-image` を `<img>` タグに置き換えてください。

例：
```html
<!-- 変更前 -->
<div class="placeholder-image">写真撮影</div>

<!-- 変更後 -->
<img src="images/photo-sample.jpg" alt="写真撮影">
```

## 📝 お問い合わせフォームの実装

現在、お問い合わせフォームは疑似的な送信処理となっています。
実際に使用する際は、以下のいずれかの方法で実装してください：

### 方法1: メールフォームサービスを利用
- Formspree
- EmailJS
- Google Forms

### 方法2: バックエンドAPIを構築
- PHP
- Node.js (Express)
- Python (Flask/Django)

## 🎯 今後の改善案

- [x] Supabase連携実装
- [x] 実績の動的管理
- [x] 管理画面の実装
- [ ] 実際の写真・画像の追加
- [ ] お問い合わせフォームのバックエンド実装
- [ ] ブログ・ニュース機能の追加
- [ ] 多言語対応（英語版など）
- [ ] アクセシビリティの向上
- [ ] SEO最適化
- [ ] Google Analytics導入
- [ ] ギャラリー機能の追加
- [ ] オンライン見積もり機能

## 📞 サポート

ご質問や問題がございましたら、KUNI OFFICEまでお問い合わせください。

- **所在地**: 〒086-1600 北海道標津郡標津町
- **メール**: info@kunioffice.jp
- **電話**: 準備中

## 📄 ライセンス

© 2024 KUNI OFFICE. All Rights Reserved.

---

**制作日**: 2024年
**更新日**: 2024年

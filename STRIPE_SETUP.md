# Stripe決済機能セットアップガイド

## 🎯 概要
KUNI OFFICEオンラインショップにStripe決済機能を導入しました。

## 📋 実装内容

### ✅ 実装済み機能
- **単品購入**: クレジットカード決済（Stripe Checkout）
- **定期購入**: 月額サブスクリプション（送料無料、10% OFF）
- **カート機能**: LocalStorage利用（将来拡張可能）
- **決済成功ページ**: success.html
- **セキュア決済**: Stripe.jsによる安全な決済処理

---

## 🚀 セットアップ手順

### 1. Stripeアカウント作成
1. [Stripe公式サイト](https://stripe.com/jp) でアカウント作成（無料）
2. ビジネス情報を登録
3. 本人確認書類を提出（銀行口座登録に必要）

### 2. StripeダッシュボードでAPIキー取得

#### テストモード（開発・テスト用）
1. Stripeダッシュボード → 開発者 → APIキー
2. **公開可能キー（Publishable Key）**: `pk_test_...` をコピー
3. **シークレットキー（Secret Key）**: `sk_test_...` をコピー
4. **⚠️ シークレットキーは絶対に公開しないこと！**

#### 本番モード（実運用）
1. Stripeダッシュボードで本番モードに切り替え
2. **公開可能キー（Publishable Key）**: `pk_live_...` をコピー
3. **シークレットキー（Secret Key）**: `sk_live_...` をコピー

### 3. APIキーの設定

#### フロントエンド（js/stripe-checkout.js）
```javascript
// 1行目を編集
const STRIPE_PUBLIC_KEY = 'pk_test_YOUR_KEY_HERE'; // ← ここに公開可能キーを貼り付け
```

#### バックエンド（server.js）
```javascript
// 4行目を編集
const stripe = require('stripe')('sk_test_YOUR_KEY_HERE'); // ← ここにシークレットキーを貼り付け
```

**🔒 推奨：環境変数で管理**
```bash
# .env ファイルを作成
STRIPE_PUBLIC_KEY=pk_test_YOUR_KEY_HERE
STRIPE_SECRET_KEY=sk_test_YOUR_KEY_HERE
```

```javascript
// server.js を修正
require('dotenv').config();
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
```

### 4. Node.js環境構築

#### 必要なソフトウェア
- **Node.js**: v18以上推奨 [ダウンロード](https://nodejs.org/)
- **npm**: Node.jsに付属

#### インストール
```bash
# プロジェクトディレクトリに移動
cd /path/to/kunioffice-shop

# 依存パッケージをインストール
npm install

# または個別インストール
npm install express stripe dotenv
```

### 5. サーバー起動

#### 開発モード
```bash
npm start
# または
node server.js
```

#### 自動再起動（開発中）
```bash
npm run dev
# nodemonを使用
```

サーバーが起動したら：
```
Server running on port 3000
Shop: http://localhost:3000/shop.html
```

### 6. Webhook設定（本番環境で必須）

Webhookは、Stripeからサーバーにイベント通知を受け取る仕組みです。

#### ローカル開発（Stripe CLI使用）
1. [Stripe CLI](https://stripe.com/docs/stripe-cli) をインストール
2. ログイン
   ```bash
   stripe login
   ```
3. Webhookをフォワード
   ```bash
   stripe listen --forward-to localhost:3000/webhook
   ```
4. Webhook署名シークレットをコピー（`whsec_...`）
5. `server.js` の `webhookSecret` に設定

#### 本番環境
1. Stripeダッシュボード → 開発者 → Webhook
2. エンドポイントを追加: `https://your-domain.com/webhook`
3. 監視するイベントを選択:
   - `checkout.session.completed`
   - `invoice.payment_succeeded`
   - `customer.subscription.deleted`
4. Webhook署名シークレット（`whsec_...`）をコピー
5. サーバーの環境変数に設定

### 7. URLの更新

#### server.js を編集
```javascript
// 成功URL・キャンセルURLを実際のドメインに変更
success_url: 'https://your-actual-domain.com/success.html?session_id={CHECKOUT_SESSION_ID}',
cancel_url: 'https://your-actual-domain.com/shop.html?canceled=true',

// 商品画像URLも更新
images: ['https://your-actual-domain.com/images/product-package.jpg'],
```

---

## 💳 テスト決済

### テストカード番号
Stripeのテストモードで使えるカード番号：

| カード | 番号 | 結果 |
|--------|------|------|
| **成功** | `4242 4242 4242 4242` | 決済成功 |
| **認証必要** | `4000 0025 0000 3155` | 3Dセキュア認証 |
| **拒否** | `4000 0000 0000 0002` | カード拒否 |
| **残高不足** | `4000 0000 0000 9995` | 資金不足 |

- **有効期限**: 未来の日付（例: 12/34）
- **CVC**: 任意の3桁（例: 123）
- **郵便番号**: 任意（例: 123-4567）

### テスト手順
1. `http://localhost:3000/shop.html` にアクセス
2. 数量を選択
3. 「💳 Stripeで今すぐ購入」をクリック
4. Stripe Checkoutページが開く
5. テストカード情報を入力
6. メールアドレス、配送先住所、電話番号を入力
7. 「支払う」をクリック
8. `success.html` にリダイレクト

---

## 📦 定期購入（サブスクリプション）

### Stripe商品・価格の作成
1. Stripeダッシュボード → 商品カタログ → 商品を追加
2. 商品名: `若葉のしずく 定期購入`
3. 価格を追加:
   - 価格: `2680` 円
   - 請求期間: `月次`
   - Price ID（`price_...`）をコピー
4. `server.js` の定期購入セッション作成で Price ID を使用（オプション）

---

## 🔒 セキュリティ

### 必須対応
- ✅ **シークレットキーは環境変数で管理**
- ✅ **.envファイルを.gitignoreに追加**
- ✅ **HTTPSを使用（本番環境）**
- ✅ **Webhook署名を検証**
- ✅ **CORS設定を適切に制限**

### .gitignore に追加
```
.env
node_modules/
```

---

## 📊 本番運用

### 本番環境チェックリスト
- [ ] Stripeアカウントを本番モードに切り替え
- [ ] 本番APIキー（`pk_live_...`, `sk_live_...`）に更新
- [ ] Webhook URLを本番ドメインに設定
- [ ] SSL/TLS証明書を取得（HTTPS化）
- [ ] 環境変数で機密情報を管理
- [ ] エラーログとモニタリング設定
- [ ] 注文管理システム（データベース）を構築
- [ ] メール通知システム統合
- [ ] 配送業者API連携（オプション）

### サーバーデプロイ
推奨プラットフォーム：
- **Heroku**: 簡単デプロイ、自動SSL
- **AWS EC2**: フルコントロール
- **Google Cloud Run**: コンテナベース
- **Vercel/Netlify**: サーバーレス関数

---

## 🛠️ トラブルシューティング

### よくあるエラー

#### 1. "Stripe is not defined"
- **原因**: Stripe.jsが読み込まれていない
- **解決**: `<script src="https://js.stripe.com/v3/"></script>` を確認

#### 2. "Invalid API Key provided"
- **原因**: APIキーが間違っている
- **解決**: Stripeダッシュボードで正しいキーをコピー

#### 3. "No such checkout session"
- **原因**: セッションIDが無効
- **解決**: バックエンドが正常に動作しているか確認

#### 4. CORS エラー
- **原因**: フロントエンドとバックエンドのドメインが異なる
- **解決**: `server.js` のCORS設定を確認

---

## 📚 参考リソース

- [Stripe公式ドキュメント（日本語）](https://stripe.com/docs)
- [Stripe Checkout](https://stripe.com/docs/payments/checkout)
- [Stripe サブスクリプション](https://stripe.com/docs/billing/subscriptions/overview)
- [Stripe Webhook](https://stripe.com/docs/webhooks)
- [Stripe CLI](https://stripe.com/docs/stripe-cli)

---

## 💡 今後の拡張案

- [ ] カートページ作成（複数商品対応）
- [ ] マイページ（注文履歴、定期購入管理）
- [ ] クーポン・割引コード機能
- [ ] 在庫管理システム
- [ ] メール通知（注文確認、発送通知）
- [ ] 配送追跡機能
- [ ] レビュー・評価システム
- [ ] 他の商品追加

---

## 📞 サポート

質問や問題があれば、お気軽にお問い合わせください。

**KUNI OFFICE**  
Email: info@kunioffice.jp  
TEL: 0153-82-1538  
携帯: 090-7519-5705（高桑）

---

**🎉 Stripe決済導入完了！顧客は安全に商品を購入できます。**

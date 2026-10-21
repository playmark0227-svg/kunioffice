# サーバー実装の入口

このフォルダーには、既存の若葉のしずく向け Stripe Checkout サーバーだけをまとめています。
GitHub Pages から別の Node.js サーバーを呼ぶための実装で、GitHub Pages 上では動きません。
**管理画面のサーバー認証・管理 API は未実装です。決済サーバーとは別の機能として設計してください。**

## ファイルの役割

| パス | 役割 |
|---|---|
| `../server.js` | 既存の `npm start` / `node server.js` を維持する入口 |
| `checkout/index.js` | `.env` 読み込み、Stripe SDK の生成、HTTP サーバー起動 |
| `checkout/app.js` | Express アプリ、JSON・CORS、`POST /api/checkout` |
| `checkout/config.js` | 環境変数・既定 URL の読み込み |
| `checkout/catalog.js` | 決済に使う商品価格・送料の正本 |
| `checkout/checkout.js` | 商品 ID と数量の検証、送料・Checkout パラメーター計算 |
| `checkout/webhook.js` | `POST /webhook` の raw body・署名検証・既存イベント記録 |
| `../tests/checkout.test.js` | 実 Stripe 接続や秘密の値を使わない Node.js テスト |

起動コマンド・環境変数名・API の URL・金額・送料・ショップの決済モードは従来どおりです。
既存のセットアップ手順は [STRIPE_SETUP.md](../STRIPE_SETUP.md) と [ショップ README](../wakaba/README.md) にあります。

```bash
npm install
# .env.example を .env にコピーし、必要な値をローカルで設定
npm start

# 開発中の自動再起動
npm run dev

# 秘密の値を設定せず、偽の Stripe クライアントで検証
node --test tests/checkout.test.js
```

`createApp({ stripe, config, logger })` はアプリを返すだけで、待受や実 Stripe 通信を開始しません。
`buildCheckoutParams(body, siteUrl)` は外部通信を行わないため、価格計算を独立して確認できます。

## 現在の接続箇所

- ブラウザ側: `wakaba/js/config.js` の `checkout.mode` と `checkout.endpoint`。
  現在の既定値は `email` です。今回の整理では決済を有効にしていません。
- 決済 API: `POST /api/checkout`。JSON の `{ "orderNo": "注文番号", "items": [{ "id": "single", "qty": 1 }] }`
  を受け取り、成功すると `{ "url": "Stripe の Checkout URL" }` を返します。
  金額はブラウザの値を使わず `catalog.js` から計算します。
- Webhook: `POST /webhook`。`STRIPE_WEBHOOK_SECRET` 未設定なら `501`、署名不正なら `400`。
  署名検証前に本文を JSON 化しないことが重要です。`registerWebhook` の登録順を維持してください。
- 公開側は GitHub Pages、決済側は Node.js の別デプロイです。
  本番設定を変更する前にテスト環境で注文・定期便・Webhook を検証してください。
- 管理画面は現在 `admin/js/data/github-client.js` から GitHub API を直接操作し、HTML と画像をリポジトリに保存します。
  この決済 API に管理画面の認証機能はありません。移行の詳細は [引き継ぎ資料](../docs/ENGINEER_HANDOFF.md) を参照してください。

## 本番の受注処理として残っている作業

この整理で新しい受注機能や認証方式を追加していません。

- Webhook はイベント ID 等をログへ記録する既存処理のみです。注文 DB、二重処理防止、発送・通知処理は未実装です。
- `thanks.html?status=paid` はブラウザ表示の切り替えに使うだけです。出荷や売上確定は署名検証した Webhook 等のサーバー側記録を基準にしてください。
- 既存互換のため、数量の小数は切り捨て、同一商品 ID の複数行はそれぞれ判定します。
  正式稼働前に、商品ごとの数量合算と厳密な整数検証の要否を確認してください。
- 価格は `checkout/catalog.js`、ブラウザ設定は `wakaba/js/config.js`、公開 HTML の価格表記にもあります。
  改定時は必ずそろえてください。
- CORS はブラウザの読み取り制御です。注文 API の認証・流量制限・リトライ時の重複防止は別途検討してください。
- 秘密の値はホスティング先の環境変数または未追跡の `.env` に置き、公開 JavaScript・URL・資料・ログには含めないでください。

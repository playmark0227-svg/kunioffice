# Stripe 決済のセットアップ

オンラインショップは `wakaba/`（若葉のしずく 公式オンラインショップ）に移りました。
旧 `shop.html` は `wakaba/` へ自動で転送されます。

決済の設定方法（メール注文／Stripe Payment Links／`server.js` による Stripe Checkout）は
**[`wakaba/README.md`](wakaba/README.md)** にまとめています。

## server.js を使う場合の要点
1. `.env.example` を `.env` にコピーし、`STRIPE_SECRET_KEY` などを設定（`.env` はコミットしない）
2. `npm install` → `npm start` でローカル起動（既定ポート 3000）
3. 本番は Render / Railway / Fly.io などにデプロイし、`wakaba/js/config.js` の
   `checkout.mode = 'endpoint'`、`checkout.endpoint = 'https://<デプロイ先>/api/checkout'` を設定
4. Stripe の Webhook を使う場合は、エンドポイント `https://<デプロイ先>/webhook` を登録し
   `STRIPE_WEBHOOK_SECRET` を設定

価格・送料は `server/checkout/catalog.js` の `CATALOG` / `SHIPPING` で計算します（ブラウザから届いた金額は使いません）。
`wakaba/js/config.js` と同じ値にそろえてください。

コードの役割と起動方法は [server/README.md](server/README.md) を参照してください。

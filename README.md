# KUNI OFFICE ホームページ

北海道標津町の KUNI OFFICE（写真・印刷・映像・看板・オリジナルグッズ・ホームページ制作）の公式サイトと、
青汁「なんと！おいしい 若葉のしずく」の公式オンラインショップです。

- 公開URL: https://playmark0227-svg.github.io/kunioffice/
- オンラインショップ: https://playmark0227-svg.github.io/kunioffice/wakaba/
- **編集マニュアル（写真の差し替え・文章の修正・実績の追加）: [`manual/index.html`](manual/index.html)**
  （公開URL: https://playmark0227-svg.github.io/kunioffice/manual/ ）

ビルド不要の静的サイト（HTML / CSS / JavaScript）です。`main` ブランチに変更が入ると、
GitHub Actions（`.github/workflows/pages.yml`）が自動で GitHub Pages に公開します（1〜2分）。

## 構成

| パス | 内容 |
|---|---|
| `index.html` | ホーム |
| `services.html` | 事業内容 |
| `works.html` | 実績（一覧はこのファイルに直接記載。絞り込みは `data-category`） |
| `company.html` | 会社情報 |
| `contact.html` | お問い合わせ（送信すると入力内容入りのメールが `info@kunioffice.jp` 宛てに開く） |
| `images/` | KUNI OFFICE ページの写真。**同じファイル名で上書きすると差し替わる**（1つの写真枠に1ファイル） |
| `css/style.css` | デザイン |
| `js/main.js` | メニュー・実績の絞り込み・お問い合わせフォームなど |
| `wakaba/` | 若葉のしずく オンラインショップ一式（詳細は [`wakaba/README.md`](wakaba/README.md)） |
| `manual/` | 編集マニュアル（サイト担当者向け） |
| `shop.html` / `success.html` | 旧ショップURLから `wakaba/` への転送用 |
| `server.js` / `package.json` / `.env.example` / `STRIPE_SETUP.md` | ショップでカード決済を使う場合の決済サーバー（任意） |

## ローカルで確認する

`index.html` をダブルクリックすればブラウザで確認できます。ローカルサーバーで見る場合:

```bash
python3 -m http.server 8000
# → http://localhost:8000/
```

## 変更履歴（主なもの）

- 2026-10: 実績ページをファイル管理に統一（以前は Supabase のデータで一覧を上書きしていた）。
  ログインなしで編集できた管理画面（`admin.html` / `firebase-admin.html`）と関連ファイルを削除。
  お問い合わせフォームを、実際に送信される方式（メールアプリ）に変更。編集マニュアルを追加。
- 2026-09: 若葉のしずく オンラインショップ（`wakaba/`）と15秒CMを追加。
- 2026-06: サイト全体をリデザイン、GitHub Pages で公開。

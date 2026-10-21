# KUNI OFFICE ホームページ

北海道標津町の KUNI OFFICE（写真・印刷・映像・看板・オリジナルグッズ・ホームページ制作）の公式サイトと、
青汁「なんと！おいしい 若葉のしずく」の公式オンラインショップです。

- 公開URL: https://playmark0227-svg.github.io/kunioffice/
- オンラインショップ: https://playmark0227-svg.github.io/kunioffice/wakaba/
- **管理画面（見たまま編集）: https://playmark0227-svg.github.io/kunioffice/admin/** （→ [管理画面（/admin/）](#管理画面admin)）
  - アクセスキーの用意（サイト管理者用）: https://playmark0227-svg.github.io/kunioffice/admin/setup.html
- **編集マニュアル（管理画面の使い方・ファイルで直す方法）: [`manual/index.html`](manual/index.html)**
  （公開URL: https://playmark0227-svg.github.io/kunioffice/manual/ ）

ビルド不要の静的サイト（HTML / CSS / JavaScript）です。`main` ブランチに変更が入ると、
GitHub Actions（`.github/workflows/pages.yml`）が自動で GitHub Pages に公開します（1〜2分）。

## 開発者・サーバー実装担当の方へ

最初に **[エンジニア引き継ぎ](docs/ENGINEER_HANDOFF.md)** を読んでください。
[管理画面と保存先のAPI契約](docs/ADMIN_API.md)と[サーバーの起動・構成](server/README.md)もまとめています。
管理画面APIはこれから実装する部分です。現在の保存先は引き続きGitHubで、`npm start` はショップ決済サーバーを起動します。

```bash
npm ci --ignore-scripts
npm test
npm run build:static
npm run preview
# http://localhost:8000/ （公開用ファイルの確認）
```

| 置き場所 | 役割 |
|---|---|
| `admin/js/app/` | 起動・認証・編集状態・公開の進行 |
| `admin/js/data/` | 保存先の8メソッド、GitHub接続、変更対象パスのルール |
| `admin/js/editor/` | ページの編集・HTML差分・画像処理 |
| `admin/js/ui/` | 表示部品・ダイアログ |
| `server/checkout/` | 既存のStripe決済サーバー |
| `docs/` / `tests/` / `scripts/` | 引き継ぎ・自動テスト・静的ファイルの取り出し |

GitHub Pagesでは `dist/` の公開ページ・アセットだけを配信します。サーバーコード・開発資料・環境変数は含めません。
新しい公開ページは `scripts/build-static.mjs` の許可リストにも追加してください。

## 構成

| パス | 内容 |
|---|---|
| `index.html` | ホーム |
| `services.html` | 事業内容 |
| `works.html` | 実績（一覧はこのファイルに直接記載。絞り込みは `data-category`） |
| `company.html` | 会社情報 |
| `contact.html` | お問い合わせ（送信すると入力内容入りのメールが `info@kunioffice.jp` 宛てに開く） |
| `images/` | KUNI OFFICE ページの写真。**同じファイル名で上書きすると差し替わる**（事業内容・実績の一部の写真はトップページにも表示される。一覧はマニュアル参照） |
| `css/style.css` | デザイン |
| `js/main.js` | メニュー・実績の絞り込み・お問い合わせフォームなど |
| `wakaba/` | 若葉のしずく オンラインショップ一式（詳細は [`wakaba/README.md`](wakaba/README.md)） |
| `admin/` | 管理画面（見たまま編集）。`js/app` → `js/data` の順で GitHub API から `main` に直接コミットする（[下記](#管理画面admin)）。`admin/setup.html` はアクセスキーの用意（サイト管理者用）、`admin/apple-touch-icon.png` はホーム画面のアイコン |
| `images/works/` | 管理画面の「実績を追加」で追加した実績の写真（`work-YYYYMMDD-HHmmss.jpg`） |
| `manual/` | 編集マニュアル（サイト担当者向け。`manual/img/` は管理画面の画面写真） |
| `shop.html` / `success.html` | 旧ショップURLから `wakaba/` への転送用 |
| `server/checkout/` / `server.js` / `package.json` / `.env.example` / `STRIPE_SETUP.md` | ショップでカード決済を使う場合の決済サーバー（任意） |

## 管理画面（/admin/）

https://playmark0227-svg.github.io/kunioffice/admin/

サイト担当者（高桑様）が、iPhone やパソコンのブラウザで**実際のページを見たまま**文章・写真・実績を直し、
「公開する」で反映するための管理画面です。ビルド不要の静的ファイル（`admin/index.html` ほか）で、データベースはありません。
ページの HTML がそのまま保存先で、変更は元の HTML への最小限の書き換えとして保存されます（触っていない部分は1バイトも変わりません）。

- **アクセスキー（端末ごとに1回だけ）**: GitHub の Fine-grained personal access token（画面上の呼び名は「アクセスキー」）を、
  各端末で最初の1回だけ貼り付ける。「この端末に記憶する（次からは入力不要）」が既定でオンなので、2回目からはログイン不要
  （iPhone はホーム画面の「KUNI管理」アイコンを押すだけ）。共用のパソコンではオフにする。ログアウトはメニュー（≡）から。
  - **作り方は `admin/setup.html`（アクセスキーの用意）**: 持ち主（`playmark0227-svg`）が GitHub にログインしたパソコンで開き、
    ①「GitHubでアクセスキーを作る」で名前・説明・Resource owner・期限（366日）・権限が入った GitHub の作成画面を開く →
    Repository access で **Only select repositories → `kunioffice`** だけを選んで Generate（ここだけは事前に入れられない）→
    ② 貼り付けて「確認する」（書き込みできるか・kunioffice だけを操作できるキーかを GitHub に問い合わせる）→
    ③ 表示される手順で高桑様の iPhone に入れる。キーはこのページでは保存しない。
  - 権限: **Contents = Read and write**、**Actions = Read-only**（Metadata = Read-only は自動）。Classic のキー（`ghp_` など）と、
    kunioffice 以外のリポジトリも操作できるキーは、管理画面・setup.html ともに受け付けない。
  - 期限は1年。切れると管理画面に「アクセスキーの期限が切れたか、無効になりました。ViFightに新しいキーをもらってください。」と出る
    （編集中の変更は残る）ので、setup.html で作り直して渡す。端末をなくしたら https://github.com/settings/personal-access-tokens で削除（Revoke）。
  - 渡すのは直接会って、または AirDrop・iPhone の「パスワード」の共有で。**キーを URL・QR コード・リンク・ファイル・コミット・ログに入れないこと。**
  - キーは記憶をオンにした端末のブラウザ（`localStorage`。オフなら `sessionStorage`）にだけ置かれ、`https://api.github.com` にだけ送られる。
    `playmark0227-svg.github.io` のほかの GitHub Pages サイトとは保存領域（オリジン）が共通なので、そちらに外部スクリプトを入れるときは注意
    （独自ドメインにすると分けられる）。
  - 手順の詳細はマニュアル1-1（高桑様の初回設定）と2章（サイト管理者）。
- **公開 = `main` への直接コミット**: 「公開する」で GitHub API（git data API）から `main` にコミットし、
  `pages.yml` が約1分で公開する。コミットメッセージは `管理画面から更新: …`、公開の履歴からの取り消しは `管理画面から取り消し: …`。
  - **ローカルで作業する前に必ず `git pull` で `main` を取り込むこと。** 古いファイルのまま push すると、管理画面で公開された変更を上書きしてしまう。
    （管理画面側は、同じファイルが先に更新されていれば上書きせずに「ほかの場所で同じページが更新されました」で止まる。）
  - `main` にブランチ保護（PR 必須など）をかけると、管理画面から公開できなくなる。
- **編集できる範囲**: `admin/js/config.js` の `pages` に書いた9ページの `<main>` の中の文字・写真・箇条書き、
  実績一覧（`works.html` の `data-cms-list="works"`）、ページのタイトル・説明文、共通情報（電話・住所など。サイト内の `.html` / `.js` を一括置換）。
  - `data-cms-lock` を付けた要素（価格・送料・割引表記など `wakaba/js/config.js` と連動する部分、JS が書き換える部分、実績の分類ラベル）は編集できない。
    `header` / `footer` / `nav` / フォームなども対象外。**HTML を直すときは `data-cms-` で始まる属性を消さないこと。**
  - 管理画面は `admin/`・`.github/`・`manual/`・CSS など、ページ・写真・共通情報以外のファイルは書き換えも取り消しもしない。
  - 写真の差し替えはファイル名を変えずに上書きし、その写真を使う `<img src>` に `?v=日時` を付けてキャッシュを避ける。
- 設定（編集できるページ・共通情報の項目・実績のひな形）は `admin/js/config.js`。
- サイト担当者向けの使い方は [`manual/index.html`](manual/index.html) の第1部。

## ローカルで確認する

`index.html` をダブルクリックすればブラウザで確認できます。ローカルサーバーで見る場合:

```bash
python3 -m http.server 8000
# → http://localhost:8000/
```

管理画面もローカルサーバーで開けます（http://localhost:8000/admin/ ）が、読み書きするのは GitHub 上の `main` です
（ローカルのファイルではありません。「公開する」を押すと本番に反映されます）。

## 変更履歴（主なもの）

- 2026-10: アクセスキーの用意ページ（`admin/setup.html`）を追加（GitHub の作成画面を入力済みで開き、貼り付けたキーを確認できる）。
  管理画面はアクセスキーを端末ごとに1回だけ入力し、既定で記憶する（2回目からはログイン不要）。iPhone のホーム画面用アイコンを追加。
- 2026-10: 見たまま編集できる管理画面（`admin/`）を追加。GitHub のアクセスキー（Fine-grained token）でログインし、
  「公開する」で `main` に直接コミットする。各ページに `data-cms-lock` / `data-cms-list="works"` の印を追加。
  スマホでメニューが画面外にはみ出し、ページが縮小表示になる問題を修正。編集マニュアルを管理画面中心に改訂（画面写真つき）。
- 2026-10: 実績ページをファイル管理に統一（以前は Supabase のデータで一覧を上書きしていた）。
  ログインなしで編集できた管理画面（`admin.html` / `firebase-admin.html`）と関連ファイルを削除。
  お問い合わせフォームを、実際に送信される方式（メールアプリ）に変更。編集マニュアルを追加。
- 2026-09: 若葉のしずく オンラインショップ（`wakaba/`）と15秒CMを追加。
- 2026-06: サイト全体をリデザイン、GitHub Pages で公開。

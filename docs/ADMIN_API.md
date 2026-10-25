# 管理画面と保存先の契約

この資料の前半は **実装済みのJavaScriptの契約**。後半のHTTP APIは **サーバー実装時の設計案**で、まだ動作しない。
全体像・認証切替・未実装作業は [ENGINEER_HANDOFF.md](ENGINEER_HANDOFF.md) を参照。

## サーバー版の必須要件

**全端末・全対応ブラウザで初回から、利用者がGitHubキーを作成・受領・入力・貼り付け・端末保存しなくても使えること。**
通常の管理者認証は必要。GitHub用認証情報はサーバーだけで管理し、ブラウザは管理APIのセッションでアクセスする。
サーバー版APIは、利用者のリクエストからGitHubキーを受け取らず、応答にも返さない。
キー入りのURLや配布用QRコード、端末へのGitHubキー自動埋め込みは採用しない。

## 実装済みの境界

`admin/js/data/content-client.js` の `CMSContentClient.from(adapter)` は以下の8メソッドを持つアダプターを受け取る。
現在は `app/admin.js` のログイン成功後に `ContentClient.from(gh)` を代入している。
編集・公開・履歴の処理は `app.content` を使い、GitHub内部メソッドへ直接依存しない。
キーの保存・認証確認は現在も `app/admin.js` に残る。サーバー認証への移行時に別途置き換える。
各メソッドはPromiseを返す。返却型とエラーはアダプターが維持する。

| メソッド | 入力 | 戻り値 |
|---|---|---|
| `snapshot()` | なし | `{ commitSha, treeSha, files: Map<path, FileEntry> }` |
| `getBlobText(sha)` | ファイルの版ID | UTF-8文字列。BOM・改行を勝手に変えない |
| `getBlobBytes(sha)` | ファイルの版ID | `Uint8Array` |
| `commitChanges(options)` | `{ baseCommitSha, changes, message }` | `CommitResult` |
| `listCommits(limit)` | 件数（画面では20） | `CommitSummary[]` |
| `revertPreview(sha)` | 取り消したいコミットID | `RevertPreview` |
| `revertCommit(sha)` | 取り消したいコミットID | `CommitResult`（取り消す新しいコミット） |
| `deployStatus(commitSha)` | 公開したコミットID | `{ state, url, error? }` |

### 型

```js
// GitHubアダプターではIDはSHA。将来の保存先でも、版が変わればIDを変える。
FileEntry = { sha, mode, type: 'blob', size? }

// 同じpathを二重に送らない。削除/文字/バイナリのいずれか1つ。
Change = { path, text } | { path, base64 } | { path, delete: true }
CommitResult = { commitSha, changedPaths: string[], laterEdited?: string[] }
             | { noop: true, changedPaths: string[] }

CommitSummary = { sha, message, date, author, parents: string[] | null }
// dateは日時のISO文字列。parents=[]は最初のコミット、nullは不明。

RevertPreview = {
  sha, message, date, parentSha, headSha,
  files: [{ path, status, laterEdited }],
  laterEdited: string[], protectedPaths: string[], noop: boolean
}
// status: added / removed / modified
// protectedPathsがあれば画面から取り消せない。

DeployState = 'pending' | 'running' | 'success' | 'failure'
            | 'retry' | 'unknown'
```

`noop` のときは新しいコミットがない。保存済みであることを画面へ返す。
`deployStatus` は一時的な通信失敗なら `retry`、確認できない状態なら `unknown`。
`success` は保存APIの成功時ではなく、公開ジョブが成功したときだけ返す。

### エラー

例外には `code` と利用者向けの `message` を付ける。必要に応じて `status`、`paths: string[]`、
レート制限の `resetAt`（JavaScriptの `Date`）を付ける。認証情報や上流の機密情報を `detail/message` に含めない。

| code | 意味・画面の扱い |
|---|---|
| `unauthorized` | 現行版はGitHubキーの認証切れ。サーバー版では管理者セッション切れに限り、通常の再ログインへ進む（編集中の内容は保持） |
| `forbidden` / `readonly` | 閲覧・編集権限がない |
| `not_found` | 対象・版が見つからない |
| `conflict` | 基準版以降に同じファイルが変わった。`paths` を返し、上書きしない |
| `protected` | 管理画面から変更できないファイルを含む |
| `network` / `server` | 再試行可能な通信・サーバー障害 |
| `rate_limited` | 上流の制限。`resetAt` があれば待機時刻を表示 |
| `bad_response` | 想定と違う応答 |

現在のキー確認専用の `classic` / `too_broad` は、サーバーセッションの仕様へ持ち込まない。

## HTTP APIの設計案（未実装）

画面からGitHubキー・owner・repo・branchを渡さない。サーバー側の固定設定と認証済みセッションで対象を決める。
以下はエンジニアが実装・確定するための対応表。

| HTTP | 目的・対応メソッド |
|---|---|
| `GET /api/admin/session` | セッション・利用者・編集権限を確認。GitHubへの書込プローブを行わない |
| `POST /api/admin/logout` | サーバーセッションを失効（CSRF対策対象） |
| `GET /api/admin/snapshot` | `snapshot()` |
| `GET /api/admin/blobs/:sha/text` | `getBlobText()`。JSON `{ text }` |
| `GET /api/admin/blobs/:sha/bytes` | `getBlobBytes()`。`application/octet-stream` |
| `POST /api/admin/publications` | `commitChanges()`。基準版と変更を検証し、保存する |
| `GET /api/admin/publications?limit=20` | `listCommits()` |
| `GET /api/admin/publications/:sha/revert-preview` | `revertPreview()` |
| `POST /api/admin/publications/:sha/revert` | `revertCommit()`。取り消し直前の基準版も検証する |
| `GET /api/admin/publications/:sha/deployment` | `deployStatus()` |

認証の開始方法（パスワード・SSO等）は未選定。ログイン開始/コールバックのAPIは、その方式に合わせて設計する。

### セッションとGitHub接続の障害を分ける

- `GET /api/admin/session` はブラウザに保存したGitHubキーの有無を調べない。サーバーの管理者セッションを確認する。
- 管理者セッションがない・期限切れならHTTP 401 / `unauthorized`。画面は通常ログインを表示し、旧キー入力画面へ戻さない。
- サーバー側のGitHub認証情報の失効・権限不足は、運用者が直す接続障害として扱う。
  上流GitHubの401をそのまま利用者へ転送せず、例えばHTTP 502 / `server` とする。GitHubキーの入力や発行・配布を利用者へ求めない。
- 管理APIが利用できない場合は再試行・障害案内を出す。ブラウザからGitHubへ直接接続する方式へ自動フォールバックしない。
- ログアウトはサーバーでセッションを失効させる。別端末・別ブラウザは通常ログインすれば使え、GitHubキーを引き継ぐ作業はない。

### JSONとの変換

`Map` と `Uint8Array` はそのままJSONにしない。

- snapshotのHTTP応答は `files: [{ path, sha, mode, type, size? }]` とし、`api-client.js` で `Map` へ戻す。
- 画像取得はバイナリ応答を `Uint8Array` へ戻す。画像保存は現在の `base64` のままでもよいが、サイズ・形式・内容をサーバーで検査する。
- エラー応答は `{ error: { code, message, paths?, resetAt? } }`。HTTP 401/403/404/409/429/5xxに対応付け、アダプターで例外へ変換する。
  HTTPの `resetAt` をUnix秒で返す場合は `new Date(resetAt * 1000)` に変換する（JS側へ秒の数値をそのまま渡さない）。

### 保存・取り消しの条件

1. 操作ごとに認証と編集権限を確認する。対象GitHubリポジトリとブランチはサーバー設定から決める。
2. `path-policy.js` と同じ保護対象をサーバーでも拒否する。パス正規化、許可ファイル、HTMLの編集制限、容量を検証する。
3. `baseCommitSha` 以降に変更された同一ファイルは409で止める。無関係な別ファイルの更新は保つ。
4. 応答が届かなかった公開を再送しても二重処理しないよう、同一変更の検出または冪等キーを実装する。
5. 取り消しAPIにはプレビューで確認した `headSha` を `expectedHeadSha` として送る設計にする。
   将来のアダプターは直前のプレビューを保持して送信し、サーバーで変更後なら409を返す（再確認を求める）。
6. 公開と取り消しは監査記録を残す。記録項目は利用者、時刻、対象パス、旧/新版ID、結果。Cookie・キー・リクエスト全文を記録しない。
7. API応答は `Cache-Control: no-store`。公開ジョブが未完了ならpending/runningを返し、確認不能をsuccessと扱わない。

先にテストリポジトリで実装し、文章・写真・実績・競合・再試行・取り消し・認証切れを確認する。
Pagesから別APIへ接続するときは、[引き継ぎ資料](ENGINEER_HANDOFF.md#認証通信を切り替えるとき)のCSPとCookie/CORSも変更する。

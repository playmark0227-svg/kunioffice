# Firebase実績管理システム セットアップガイド

## 🎯 概要
Firebase Firestoreを使って、KUNI OFFICEの実績データを動的に管理できるシステムです。

---

## 📋 機能一覧

### ✅ 実装済み機能
- **実績データの動的読み込み**（Firestore）
- **画像アップロード**（Firebase Storage）
- **実績の追加・編集・削除**
- **カテゴリー別フィルタリング**
- **公開/非公開設定**
- **表示順序の管理**
- **おすすめ実績機能**
- **管理画面（firebase-admin.html）**

---

## 🚀 セットアップ手順

### 1. Firebaseプロジェクトの作成

1. [Firebase Console](https://console.firebase.google.com/) にアクセス
2. 「プロジェクトを追加」をクリック
3. プロジェクト名を入力（例: kuni-office）
4. Google Analyticsは任意（推奨: 有効）
5. プロジェクトを作成

### 2. Firestoreデータベースの設定

1. Firebase Consoleで「Firestore Database」を選択
2. 「データベースの作成」をクリック
3. **本番モード**を選択（セキュリティルールは後で設定）
4. ロケーション: `asia-northeast1`（東京）を推奨
5. 「有効にする」をクリック

### 3. Firebase Storageの設定

1. Firebase Consoleで「Storage」を選択
2. 「始める」をクリック
3. **本番モード**を選択
4. ロケーション: `asia-northeast1`を選択
5. 「完了」をクリック

### 4. Firebaseアプリの登録

1. Firebase Consoleのプロジェクト設定（⚙️アイコン）をクリック
2. 「全般」タブで下にスクロール
3. 「アプリを追加」→「ウェブ」を選択
4. アプリのニックネーム: 「KUNI OFFICE Web」
5. Firebase Hostingは任意
6. 「アプリを登録」をクリック

### 5. Firebase設定情報の取得

Firebase SDKの設定コードが表示されます：

```javascript
const firebaseConfig = {
    apiKey: "AIzaSy...",
    authDomain: "kuni-office.firebaseapp.com",
    projectId: "kuni-office",
    storageBucket: "kuni-office.appspot.com",
    messagingSenderId: "1234567890",
    appId: "1:1234567890:web:abc123"
};
```

### 6. Firebase設定をコードに反映

#### `js/firebase-works.js` を編集

```javascript
// 11行目あたりの設定を置き換え
const firebaseConfig = {
    apiKey: "YOUR_API_KEY",              // ← ここに実際の値を貼り付け
    authDomain: "YOUR_PROJECT_ID.firebaseapp.com",
    projectId: "YOUR_PROJECT_ID",
    storageBucket: "YOUR_PROJECT_ID.appspot.com",
    messagingSenderId: "YOUR_MESSAGING_SENDER_ID",
    appId: "YOUR_APP_ID"
};
```

### 7. HTMLにFirebaseスクリプトを追加

#### `works.html` のheadタグ内に追加（</head>の前）

```html
<!-- Firebase SDK -->
<script src="https://www.gstatic.com/firebasejs/9.22.0/firebase-app-compat.js"></script>
<script src="https://www.gstatic.com/firebasejs/9.22.0/firebase-firestore-compat.js"></script>
<script src="https://www.gstatic.com/firebasejs/9.22.0/firebase-storage-compat.js"></script>

<!-- Firebase Works Script -->
<script src="js/firebase-works.js"></script>
```

### 8. Firestoreセキュリティルールの設定

Firebase Console → Firestore Database → ルール

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    // 実績データ（works）
    match /works/{workId} {
      // 全員が読み取り可能
      allow read: if true;
      
      // 認証済みユーザーのみ書き込み可能
      allow write: if request.auth != null;
      
      // または、特定のドメインからのみ許可
      // allow write: if request.auth.token.email.matches(".*@kunioffice.jp$");
    }
  }
}
```

### 9. Storageセキュリティルールの設定

Firebase Console → Storage → ルール

```javascript
rules_version = '2';
service firebase.storage {
  match /b/{bucket}/o {
    match /works/{allPaths=**} {
      // 全員が読み取り可能
      allow read: if true;
      
      // 認証済みユーザーのみアップロード可能
      allow write: if request.auth != null;
      
      // 画像ファイルのみ、最大5MBまで
      allow write: if request.resource.size < 5 * 1024 * 1024
                   && request.resource.contentType.matches('image/.*');
    }
  }
}
```

### 10. 認証の設定（管理者のみアクセス）

1. Firebase Console → Authentication → 「始める」
2. ログイン方法 → 「メール/パスワード」を有効化
3. ユーザータブ → 「ユーザーを追加」
4. 管理者のメールアドレスとパスワードを設定

---

## 📊 Firestoreデータ構造

### コレクション: `works`

| フィールド | 型 | 必須 | 説明 |
|-----------|-----|------|------|
| category | string | ✅ | カテゴリー（photo, print, video, signboard, goods） |
| title | string | ✅ | タイトル |
| description | string | ✅ | 説明文 |
| imageUrl | string | ✅ | 画像URL（Firebase Storage） |
| imageFileName | string | ✅ | 画像ファイル名 |
| order | number | ✅ | 表示順序（昇順） |
| featured | boolean | - | おすすめ実績フラグ |
| published | boolean | ✅ | 公開/非公開 |
| createdAt | timestamp | ✅ | 作成日時（自動） |
| updatedAt | timestamp | ✅ | 更新日時（自動） |

### サンプルデータ

```javascript
{
    category: "photo",
    title: "地域イベント撮影",
    description: "標津町の祭りイベントの記録撮影。躍動感のある瞬間を捉えました。",
    imageUrl: "https://firebasestorage.googleapis.com/v0/b/kuni-office.appspot.com/o/works%2F1234567890_work-event.jpg?alt=media&token=abc123",
    imageFileName: "works/1234567890_work-event.jpg",
    order: 1,
    featured: true,
    published: true,
    createdAt: Timestamp,
    updatedAt: Timestamp
}
```

---

## 🎨 使い方

### 管理画面での実績追加

1. `firebase-admin.html` にアクセス
2. Firebase接続状態を確認
3. フォームに情報を入力：
   - カテゴリー選択
   - タイトル入力
   - 説明文入力
   - 画像ファイル選択
   - 表示順序（数字）
   - おすすめ実績チェック（任意）
   - 公開設定
4. 「実績を追加」ボタンをクリック
5. 自動的にFirestoreとStorageにアップロード

### 実績ページでの表示

1. `works.html` にアクセス
2. Firebaseから自動的に実績データを読み込み
3. カテゴリーフィルターで絞り込み可能
4. 静的HTMLとの共存可能（Firebaseがない場合は既存のHTMLを表示）

---

## 🔧 トラブルシューティング

### Firebase未接続エラー

**問題**: `Firebase not initialized` と表示される

**解決策**:
1. `js/firebase-works.js` の設定が正しいか確認
2. Firebase SDKが読み込まれているか確認（works.htmlのhead）
3. Firebaseプロジェクトが作成されているか確認

### 画像アップロードエラー

**問題**: 画像がアップロードされない

**解決策**:
1. Firebase Storageが有効化されているか確認
2. Storageセキュリティルールを確認
3. 画像サイズが5MB以下か確認
4. 画像ファイル形式がサポートされているか確認（jpg, png, webp等）

### 実績が表示されない

**問題**: 実績ページに何も表示されない

**解決策**:
1. Firestoreに実績データが登録されているか確認
2. `published: true` になっているか確認
3. ブラウザのコンソールでエラーを確認
4. Firestoreセキュリティルールで読み取りが許可されているか確認

---

## 💡 今後の拡張案

- [ ] 実績の編集機能（現在は削除のみ）
- [ ] 画像の複数枚アップロード（ギャラリー機能）
- [ ] タグ機能の追加
- [ ] 実績の検索機能
- [ ] いいね・閲覧数の記録
- [ ] 管理画面のログイン認証
- [ ] 実績のドラッグ&ドロップ並び替え
- [ ] 画像の自動リサイズ・最適化

---

## 📞 サポート

質問や問題があれば、お気軽にお問い合わせください。

**KUNI OFFICE**  
Email: info@kunioffice.jp  
TEL: 0153-82-1538

---

**🎉 Firebase実績管理システム導入完了！**

いつでもFirebaseを有効化して、動的な実績管理を開始できます。

# Supabase連携セットアップガイド

## 📋 概要

このプロジェクトでは、実績（Works）データをSupabaseで管理し、動的に表示する機能を実装しています。

## 🚀 セットアップ手順

### 1. Supabaseプロジェクトの作成

1. [Supabase](https://supabase.com/)にアクセス
2. 新しいプロジェクトを作成
3. プロジェクトのURLとAnon Keyをメモ

### 2. データベーステーブルの作成

Supabaseのダッシュボードで以下のSQLを実行してテーブルを作成します：

```sql
-- 実績テーブルの作成
CREATE TABLE works (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    title VARCHAR(255) NOT NULL,
    description TEXT,
    category VARCHAR(50) NOT NULL,
    image_url TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- カテゴリのチェック制約を追加
ALTER TABLE works
ADD CONSTRAINT works_category_check 
CHECK (category IN ('photo', 'print', 'video', 'signboard', 'goods', 'other'));

-- インデックスの作成（パフォーマンス向上）
CREATE INDEX idx_works_category ON works(category);
CREATE INDEX idx_works_created_at ON works(created_at DESC);

-- 更新日時を自動更新するトリガー
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_works_updated_at 
    BEFORE UPDATE ON works 
    FOR EACH ROW 
    EXECUTE FUNCTION update_updated_at_column();
```

### 3. ストレージバケットの作成（画像保存用）

1. Supabaseダッシュボードの「Storage」セクションへ移動
2. 新しいバケット「works-images」を作成
3. Public（公開）設定にする
4. ポリシーを設定：

```sql
-- 画像の読み取りを全員に許可
CREATE POLICY "Public Access"
ON storage.objects FOR SELECT
USING (bucket_id = 'works-images');

-- 画像のアップロードを認証済みユーザーに許可（必要に応じて）
CREATE POLICY "Authenticated users can upload images"
ON storage.objects FOR INSERT
WITH CHECK (bucket_id = 'works-images' AND auth.role() = 'authenticated');
```

### 4. Row Level Security (RLS) の設定

```sql
-- RLSを有効化
ALTER TABLE works ENABLE ROW LEVEL SECURITY;

-- 全員が読み取り可能
CREATE POLICY "Enable read access for all users"
ON works FOR SELECT
USING (true);

-- 認証済みユーザーが追加・更新・削除可能（管理者用）
CREATE POLICY "Enable insert for authenticated users only"
ON works FOR INSERT
WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "Enable update for authenticated users only"
ON works FOR UPDATE
USING (auth.role() = 'authenticated')
WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "Enable delete for authenticated users only"
ON works FOR DELETE
USING (auth.role() = 'authenticated');
```

### 5. 設定ファイルの更新

`js/supabase.js` の設定部分を更新します：

```javascript
const SUPABASE_CONFIG = {
    url: 'https://your-project-id.supabase.co',  // あなたのSupabase URL
    anonKey: 'your-anon-key-here'  // あなたのAnon Key
};
```

## 📝 サンプルデータの追加

SupabaseのTable Editorまたは以下のSQLでサンプルデータを追加：

```sql
INSERT INTO works (title, description, category, image_url) VALUES
('地域イベント撮影', '標津町の祭りイベントの記録撮影。躍動感のある瞬間を捉えました。', 'photo', NULL),
('企業パンフレット', '地域企業様の会社案内パンフレット制作。デザインから印刷まで一貫対応。', 'print', NULL),
('企業PR映像', '企業の魅力を伝えるプロモーション映像。ストーリー性を重視した構成。', 'video', NULL),
('店舗看板', '飲食店の看板制作。視認性とデザイン性を両立させました。', 'signboard', NULL),
('イベントTシャツ', '地域イベント用のオリジナルTシャツ制作。チームの一体感を演出。', 'goods', NULL);
```

## 📷 画像のアップロード方法

### 方法1: Supabaseダッシュボードから

1. Storage > works-images バケットを開く
2. 「Upload file」ボタンをクリック
3. 画像をアップロード
4. アップロードした画像のPublic URLをコピー
5. worksテーブルの`image_url`カラムにURLを設定

### 方法2: JavaScriptからアップロード

```javascript
async function uploadImage(file) {
    const fileName = `${Date.now()}-${file.name}`;
    const { data, error } = await supabase.storage
        .from('works-images')
        .upload(fileName, file);

    if (error) {
        console.error('Upload error:', error);
        return null;
    }

    // Public URLを取得
    const { data: { publicUrl } } = supabase.storage
        .from('works-images')
        .getPublicUrl(fileName);

    return publicUrl;
}
```

## 🎨 カテゴリ一覧

| カテゴリ値 | 表示名 | 絵文字 |
|-----------|--------|--------|
| photo | 写真撮影 | 📷 |
| print | 印刷物 | 🖨️ |
| video | 映像制作 | 🎬 |
| signboard | 看板 | 🪧 |
| goods | オリジナルグッズ | 👕 |
| other | その他 | ✨ |

## 🔐 セキュリティのベストプラクティス

### 本番環境での設定

環境変数を使用してSupabaseの認証情報を管理：

```javascript
// 環境変数から読み込む（例: Netlify, Vercel等）
const SUPABASE_CONFIG = {
    url: process.env.SUPABASE_URL || import.meta.env.VITE_SUPABASE_URL,
    anonKey: process.env.SUPABASE_ANON_KEY || import.meta.env.VITE_SUPABASE_ANON_KEY
};
```

### Gitに認証情報をコミットしない

`.gitignore` に以下を追加：

```
# Environment variables
.env
.env.local
.env.production
```

## 📱 管理画面の作成（オプション）

実績を簡単に追加・編集・削除できる管理画面を作成することをお勧めします。

### 簡易的な管理画面の例

```html
<!-- admin.html -->
<!DOCTYPE html>
<html lang="ja">
<head>
    <meta charset="UTF-8">
    <title>実績管理 - KUNI OFFICE</title>
</head>
<body>
    <h1>実績管理</h1>
    
    <form id="workForm">
        <input type="text" name="title" placeholder="タイトル" required>
        <textarea name="description" placeholder="説明"></textarea>
        <select name="category" required>
            <option value="photo">写真撮影</option>
            <option value="print">印刷物</option>
            <option value="video">映像制作</option>
            <option value="signboard">看板</option>
            <option value="goods">オリジナルグッズ</option>
            <option value="other">その他</option>
        </select>
        <input type="file" name="image" accept="image/*">
        <button type="submit">追加</button>
    </form>

    <script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"></script>
    <script src="js/supabase.js"></script>
    <script>
        document.getElementById('workForm').addEventListener('submit', async (e) => {
            e.preventDefault();
            const formData = new FormData(e.target);
            
            // 画像をアップロード
            let imageUrl = null;
            const imageFile = formData.get('image');
            if (imageFile && imageFile.size > 0) {
                imageUrl = await uploadImage(imageFile);
            }

            // データを追加
            const { data, error } = await supabase
                .from('works')
                .insert([{
                    title: formData.get('title'),
                    description: formData.get('description'),
                    category: formData.get('category'),
                    image_url: imageUrl
                }]);

            if (error) {
                alert('エラーが発生しました: ' + error.message);
            } else {
                alert('実績を追加しました！');
                e.target.reset();
            }
        });
    </script>
</body>
</html>
```

## 🐛 トラブルシューティング

### データが表示されない場合

1. ブラウザのコンソールでエラーを確認
2. Supabase URLとAnon Keyが正しいか確認
3. RLSポリシーが正しく設定されているか確認
4. ネットワークタブでAPIリクエストが成功しているか確認

### 画像が表示されない場合

1. Storage バケットがPublicに設定されているか確認
2. 画像のURLが正しいか確認
3. ブラウザのコンソールでCORSエラーがないか確認

## 📚 参考リンク

- [Supabase公式ドキュメント](https://supabase.com/docs)
- [Supabase JavaScript Client](https://supabase.com/docs/reference/javascript/introduction)
- [Row Level Security](https://supabase.com/docs/guides/auth/row-level-security)

---

ご不明な点がございましたら、お気軽にお問い合わせください。

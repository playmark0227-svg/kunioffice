-- KUNI OFFICE 画像ストレージバケット設定SQL
-- Supabase SQL Editor で実行してください

-- 1. ストレージバケットの作成（ダッシュボードからも可能）
-- Storage > New Bucket > 名前: works-images > Public: ON

-- 2. ストレージポリシーの設定

-- 既存のポリシーを削除（再実行時のエラー回避）
DROP POLICY IF EXISTS "Public Access" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can upload images" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can update images" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can delete images" ON storage.objects;

-- 画像の読み取りを全員に許可
CREATE POLICY "Public Access"
ON storage.objects FOR SELECT
USING (bucket_id = 'works-images');

-- 画像のアップロードを認証済みユーザーに許可
CREATE POLICY "Authenticated users can upload images"
ON storage.objects FOR INSERT
WITH CHECK (
    bucket_id = 'works-images' 
    AND auth.role() = 'authenticated'
);

-- 画像の更新を認証済みユーザーに許可
CREATE POLICY "Authenticated users can update images"
ON storage.objects FOR UPDATE
USING (
    bucket_id = 'works-images' 
    AND auth.role() = 'authenticated'
)
WITH CHECK (
    bucket_id = 'works-images' 
    AND auth.role() = 'authenticated'
);

-- 画像の削除を認証済みユーザーに許可
CREATE POLICY "Authenticated users can delete images"
ON storage.objects FOR DELETE
USING (
    bucket_id = 'works-images' 
    AND auth.role() = 'authenticated'
);

-- 完了メッセージ
DO $$
BEGIN
    RAISE NOTICE 'ストレージポリシーの設定が完了しました！';
    RAISE NOTICE 'ダッシュボードでバケット「works-images」を作成してください。';
END $$;

-- RLSポリシーを修正（認証なしでも操作可能にする）

-- 既存のポリシーを削除
DROP POLICY IF EXISTS "Enable insert for authenticated users only" ON works;
DROP POLICY IF EXISTS "Enable update for authenticated users only" ON works;
DROP POLICY IF EXISTS "Enable delete for authenticated users only" ON works;

-- 全員が追加・更新・削除可能にする（開発環境用）
CREATE POLICY "Enable insert for all users"
ON works FOR INSERT
WITH CHECK (true);

CREATE POLICY "Enable update for all users"
ON works FOR UPDATE
USING (true)
WITH CHECK (true);

CREATE POLICY "Enable delete for all users"
ON works FOR DELETE
USING (true);

-- ストレージのポリシーも修正
DROP POLICY IF EXISTS "Authenticated users can upload images" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can update images" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can delete images" ON storage.objects;

-- 全員がアップロード・更新・削除可能にする
CREATE POLICY "Public can upload images"
ON storage.objects FOR INSERT
WITH CHECK (bucket_id = 'works-images');

CREATE POLICY "Public can update images"
ON storage.objects FOR UPDATE
USING (bucket_id = 'works-images')
WITH CHECK (bucket_id = 'works-images');

CREATE POLICY "Public can delete images"
ON storage.objects FOR DELETE
USING (bucket_id = 'works-images');

-- 完了メッセージ
SELECT '✅ RLSポリシーを更新しました！全員が操作可能になりました。' as status;

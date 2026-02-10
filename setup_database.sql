-- KUNI OFFICE 実績管理テーブル作成SQL
-- Supabase SQL Editor で実行してください

-- 1. worksテーブルの作成
CREATE TABLE IF NOT EXISTS works (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    title VARCHAR(255) NOT NULL,
    description TEXT,
    category VARCHAR(50) NOT NULL,
    image_url TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 2. カテゴリのチェック制約
ALTER TABLE works
ADD CONSTRAINT works_category_check 
CHECK (category IN ('photo', 'print', 'video', 'signboard', 'goods', 'other'));

-- 3. インデックスの作成（パフォーマンス向上）
CREATE INDEX IF NOT EXISTS idx_works_category ON works(category);
CREATE INDEX IF NOT EXISTS idx_works_created_at ON works(created_at DESC);

-- 4. 更新日時を自動更新するトリガー
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

DROP TRIGGER IF EXISTS update_works_updated_at ON works;
CREATE TRIGGER update_works_updated_at 
    BEFORE UPDATE ON works 
    FOR EACH ROW 
    EXECUTE FUNCTION update_updated_at_column();

-- 5. Row Level Security (RLS) の設定
ALTER TABLE works ENABLE ROW LEVEL SECURITY;

-- 既存のポリシーを削除（再実行時のエラー回避）
DROP POLICY IF EXISTS "Enable read access for all users" ON works;
DROP POLICY IF EXISTS "Enable insert for authenticated users only" ON works;
DROP POLICY IF EXISTS "Enable update for authenticated users only" ON works;
DROP POLICY IF EXISTS "Enable delete for authenticated users only" ON works;

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

-- 6. サンプルデータの追加
INSERT INTO works (title, description, category, image_url) VALUES
('地域イベント撮影', '標津町の祭りイベントの記録撮影。躍動感のある瞬間を捉えました。', 'photo', NULL),
('商品撮影', '地域特産品のプロモーション用商品撮影。美しい構図で商品の魅力を引き出しました。', 'photo', NULL),
('企業パンフレット', '地域企業様の会社案内パンフレット制作。デザインから印刷まで一貫対応。', 'print', NULL),
('イベントチラシ', '地域イベントの告知チラシ。目を引くデザインで集客をサポート。', 'print', NULL),
('企業PR映像', '企業の魅力を伝えるプロモーション映像。ストーリー性を重視した構成。', 'video', NULL),
('イベント記録映像', '結婚式やイベントの記録映像。感動の瞬間を映像に残します。', 'video', NULL),
('店舗看板', '飲食店の看板制作。視認性とデザイン性を両立させました。', 'signboard', NULL),
('屋外広告看板', '耐久性に優れた屋外看板。長期使用を想定した設計。', 'signboard', NULL),
('イベントTシャツ', '地域イベント用のオリジナルTシャツ制作。チームの一体感を演出。', 'goods', NULL),
('企業ノベルティ', '企業ロゴ入りのオリジナルグッズ制作。記念品やプレゼントに最適。', 'goods', NULL)
ON CONFLICT DO NOTHING;

-- 完了メッセージ
DO $$
BEGIN
    RAISE NOTICE 'テーブル作成とサンプルデータの挿入が完了しました！';
END $$;

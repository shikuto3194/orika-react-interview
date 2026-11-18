-- ============================================
-- decks テーブルの重複デッキ解消 + 再発防止用 UNIQUE 制約
-- ============================================
-- 背景:
--   src/useDeckCloud.js の upsertCloudDeck() が、同名デッキが2件以上
--   存在すると「既存なし」と誤判定して常に INSERT する自己増殖バグを
--   持っていた（アプリ側は修正済み）。
--   DB 側にも (user_id, game, name) の UNIQUE 制約が無かったため、
--   歯止めがなく重複行が増え続けていた。
--
-- 実行方法: Supabase Dashboard → SQL Editor に貼り付けて実行
-- 実行前に decks テーブルのバックアップ（Table Editor から CSV export 等）を推奨
-- ============================================

-- 1. 重複行の件数を確認（実行前チェック用）
SELECT user_id, game, name, COUNT(*) AS dup_count
FROM public.decks
GROUP BY user_id, game, name
HAVING COUNT(*) > 1
ORDER BY dup_count DESC;

-- 2. 重複を解消：各 (user_id, game, name) グループで最も古い行だけ残し、
--    それ以外を削除する
WITH ranked AS (
  SELECT id,
         ROW_NUMBER() OVER (
           PARTITION BY user_id, game, name
           ORDER BY created_at ASC, id ASC
         ) AS rn
  FROM public.decks
)
DELETE FROM public.decks
WHERE id IN (SELECT id FROM ranked WHERE rn > 1);

-- 3. 再発防止：DB レベルで重複を禁止する
ALTER TABLE public.decks
  ADD CONSTRAINT decks_user_game_name_unique UNIQUE (user_id, game, name);

-- ============================================================
-- 口コミ自動収集セットアップSQL
-- Supabase の SQL Editor で実行してください
-- ============================================================

-- 1. gbp_review_id 列を追加（Google口コミの重複防止用）
ALTER TABLE 口コミ一覧
  ADD COLUMN IF NOT EXISTS gbp_review_id text UNIQUE;

-- 2. pg_cron 拡張を有効化（未導入の場合）
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- 3. 毎日 AM 9:00（JST = UTC 0:00）に collect-reviews を呼び出す
--    ※ SUPABASE_URL と ANON_KEY はご自身のプロジェクトの値に書き換えてください
SELECT cron.schedule(
  'collect-reviews-daily',           -- ジョブ名（重複不可）
  '0 0 * * *',                       -- UTC 0:00 = JST 9:00 毎日
  $$
  SELECT net.http_post(
    url     := 'https://djgylzypyunbcetvquom.supabase.co/functions/v1/collect-reviews',
    headers := jsonb_build_object(
      'Content-Type',  'application/json',
      'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRqZ3lsenlweXVuYmNldHZxdW9tIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDA4MTk3MjgsImV4cCI6MjA1NjM5NTcyOH0.tRwiVkMiCIvONpjyAJAt3FZ2iUIy6ihaAiHMtZ3bFI0'
    ),
    body    := '{}'::jsonb
  );
  $$
);

-- 4. スケジュール確認
SELECT jobid, jobname, schedule, command
FROM cron.job
WHERE jobname = 'collect-reviews-daily';

-- 5. 実行履歴確認（後で使用）
-- SELECT * FROM cron.job_run_details WHERE jobid = <上記のjobid> ORDER BY start_time DESC LIMIT 20;

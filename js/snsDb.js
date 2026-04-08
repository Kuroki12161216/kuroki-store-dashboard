import { supabase } from "./supabaseClient.js";

export const SETUP_SQL = `-- SNS店舗設定テーブル
CREATE TABLE IF NOT EXISTS sns_store_settings (
  id                BIGSERIAL PRIMARY KEY,
  store_name        TEXT NOT NULL UNIQUE,
  gbp_webhook       TEXT,
  ig_webhook        TEXT,
  auth_token        TEXT,
  -- AIエージェント用（直接API連携）
  gbp_access_token  TEXT,
  gbp_account_id    TEXT,
  gbp_location_id   TEXT,
  ig_access_token   TEXT,
  ig_account_id     TEXT,
  created_at        TIMESTAMPTZ DEFAULT NOW()
);

-- SNS投稿履歴テーブル
CREATE TABLE IF NOT EXISTS sns_post_history (
  id          BIGSERIAL PRIMARY KEY,
  store_name  TEXT NOT NULL,
  platforms   TEXT[],
  post_text   TEXT,
  campaign    TEXT,
  hashtags    TEXT,
  status      TEXT DEFAULT 'success',
  posted_at   TIMESTAMPTZ DEFAULT NOW()
);

-- RLS有効化
ALTER TABLE sns_store_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE sns_post_history ENABLE ROW LEVEL SECURITY;

-- 全操作許可ポリシー（内部ツール用）
CREATE POLICY "allow_all_sns_settings" ON sns_store_settings FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "allow_all_sns_history"  ON sns_post_history  FOR ALL USING (true) WITH CHECK (true);`;

export async function checkTablesExist() {
  const { error } = await supabase
    .from("sns_store_settings")
    .select("id")
    .limit(1);

  if (error) {
    const msg = error.message || "";
    if (
      error.code === "42P01" ||
      msg.includes("does not exist") ||
      msg.includes("relation") ||
      msg.includes("PGRST")
    ) {
      return false;
    }
    // RLS拒否などはテーブルが存在することを意味する
  }
  return true;
}

export async function fetchStoreSettings() {
  const { data, error } = await supabase
    .from("sns_store_settings")
    .select("*")
    .order("store_name");
  if (error) throw error;
  return data ?? [];
}

// 既存テーブルへのAIエージェント用列追加（マイグレーション）
export const AGENT_MIGRATION_SQL = `-- AIエージェント用列の追加（既存テーブルへのマイグレーション）
ALTER TABLE sns_store_settings ADD COLUMN IF NOT EXISTS gbp_access_token TEXT;
ALTER TABLE sns_store_settings ADD COLUMN IF NOT EXISTS gbp_account_id   TEXT;
ALTER TABLE sns_store_settings ADD COLUMN IF NOT EXISTS gbp_location_id  TEXT;
ALTER TABLE sns_store_settings ADD COLUMN IF NOT EXISTS ig_access_token  TEXT;
ALTER TABLE sns_store_settings ADD COLUMN IF NOT EXISTS ig_account_id    TEXT;`;

export async function checkAgentColumns() {
  const { error } = await supabase
    .from("sns_store_settings")
    .select("gbp_access_token")
    .limit(1);
  if (error) {
    const msg = error.message || "";
    if (msg.includes("gbp_access_token") || msg.includes("column") || msg.includes("does not exist")) {
      return false;
    }
  }
  return true;
}

export async function upsertStoreSetting({
  id, store_name, gbp_webhook, ig_webhook, auth_token,
  gbp_access_token, gbp_account_id, gbp_location_id,
  ig_access_token, ig_account_id,
}) {
  const record = {
    store_name,
    gbp_webhook:      gbp_webhook      || null,
    ig_webhook:       ig_webhook       || null,
    auth_token:       auth_token       || null,
    gbp_access_token: gbp_access_token || null,
    gbp_account_id:   gbp_account_id   || null,
    gbp_location_id:  gbp_location_id  || null,
    ig_access_token:  ig_access_token  || null,
    ig_account_id:    ig_account_id    || null,
  };
  if (id) record.id = id;

  const { data, error } = await supabase
    .from("sns_store_settings")
    .upsert(record, { onConflict: "store_name" })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function deleteStoreSetting(id) {
  const { error } = await supabase
    .from("sns_store_settings")
    .delete()
    .eq("id", id);
  if (error) throw error;
}

export async function insertPostHistory(record) {
  const { error } = await supabase
    .from("sns_post_history")
    .insert(record);
  if (error) throw error;
}

export async function fetchPostHistory(limit = 50) {
  const { data, error } = await supabase
    .from("sns_post_history")
    .select("*")
    .order("posted_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return data ?? [];
}

/**
 * collect-reviews — Google Business Profile 口コミ 日次収集
 *
 * 必要な Supabase Secrets（supabase secrets set で登録）:
 *   GOOGLE_CLIENT_ID       ... OAuth2 クライアントID
 *   GOOGLE_CLIENT_SECRET   ... OAuth2 クライアントシークレット
 *   GOOGLE_REFRESH_TOKEN   ... 初回OAuth認証で取得したリフレッシュトークン
 *   GOOGLE_ACCOUNT_ID      ... GBPアカウントID（例: accounts/123456789）
 *   GOOGLE_LOCATION_ID     ... 店舗ロケーションID（例: locations/987654321）
 *   STORE_NAME             ... Supabaseに登録する店舗名（例: マグロと炉端成る）
 *   SUPABASE_URL           ... 自動設定
 *   SUPABASE_SERVICE_ROLE_KEY ... 自動設定
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, apikey",
};

// ===== Google OAuth2 アクセストークン取得 =====
async function getAccessToken(): Promise<string> {
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id:     Deno.env.get("GOOGLE_CLIENT_ID")     ?? "",
      client_secret: Deno.env.get("GOOGLE_CLIENT_SECRET") ?? "",
      refresh_token: Deno.env.get("GOOGLE_REFRESH_TOKEN") ?? "",
      grant_type:    "refresh_token",
    }),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`トークン取得失敗: ${err}`);
  }
  const { access_token } = await res.json();
  return access_token;
}

// ===== GBP 口コミ一覧取得 =====
async function fetchGbpReviews(accessToken: string): Promise<any[]> {
  const accountId  = Deno.env.get("GOOGLE_ACCOUNT_ID")  ?? "";
  const locationId = Deno.env.get("GOOGLE_LOCATION_ID") ?? "";

  const url =
    `https://mybusiness.googleapis.com/v4/${accountId}/${locationId}/reviews` +
    `?pageSize=50&orderBy=updateTime+desc`;

  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`GBP API エラー: ${err}`);
  }

  const json = await res.json();
  return json.reviews ?? [];
}

// ===== GBP レビューを口コミ一覧テーブル形式に変換 =====
function mapReview(raw: any, storeName: string) {
  const rating = {
    ONE: 1, TWO: 2, THREE: 3, FOUR: 4, FIVE: 5,
  }[raw.starRating as string] ?? null;

  const postedAt = raw.createTime
    ? raw.createTime.slice(0, 10)
    : null;

  const reply     = raw.reviewReply?.comment ?? null;
  const repliedAt = raw.reviewReply?.updateTime?.slice(0, 10) ?? null;

  return {
    媒体:       "google",
    店舗:       storeName,
    評価:       rating,
    コメント:   raw.comment ?? null,
    返信:       reply,
    返信済:     !!reply,
    投稿日:     postedAt,
    返信日:     repliedAt,
    url:        raw.reviewId
      ? `https://search.google.com/local/reviews?placeid=${raw.reviewId}`
      : null,
    gbp_review_id: raw.reviewId ?? null,
  };
}

// ===== メインハンドラ =====
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: CORS_HEADERS });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")              ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
  );

  const storeName = Deno.env.get("STORE_NAME") ?? "（店舗名未設定）";

  try {
    // 1. アクセストークン取得
    const accessToken = await getAccessToken();

    // 2. GBP口コミ一覧取得
    const rawReviews = await fetchGbpReviews(accessToken);
    console.log(`取得件数: ${rawReviews.length}`);

    if (!rawReviews.length) {
      return new Response(
        JSON.stringify({ ok: true, inserted: 0, message: "新着口コミなし" }),
        { headers: { ...CORS_HEADERS, "Content-Type": "application/json" } },
      );
    }

    // 3. 変換
    const records = rawReviews.map(r => mapReview(r, storeName));

    // 4. gbp_review_id で重複チェック → 新規のみ insert、返信更新は upsert
    let inserted = 0;
    let updated  = 0;

    for (const record of records) {
      if (!record.gbp_review_id) continue;

      // 既存レコードを確認
      const { data: existing } = await supabase
        .from("口コミ一覧")
        .select("id, 返信済")
        .eq("gbp_review_id", record.gbp_review_id)
        .maybeSingle();

      if (!existing) {
        // 新規挿入
        const { error } = await supabase.from("口コミ一覧").insert(record);
        if (error) console.error("insert error:", error);
        else inserted++;
      } else if (record.返信済 && !existing.返信済) {
        // 返信が新たに付いた場合だけ更新
        const { error } = await supabase
          .from("口コミ一覧")
          .update({ 返信: record.返信, 返信済: true, 返信日: record.返信日 })
          .eq("id", existing.id);
        if (error) console.error("update error:", error);
        else updated++;
      }
    }

    const result = { ok: true, inserted, updated, total: rawReviews.length };
    console.log("完了:", result);

    return new Response(JSON.stringify(result), {
      headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
    });

  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("エラー:", msg);
    return new Response(
      JSON.stringify({ ok: false, error: msg }),
      { status: 500, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } },
    );
  }
});

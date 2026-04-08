import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const ANTHROPIC_API_KEY       = Deno.env.get("ANTHROPIC_API_KEY")       ?? "";
const SUPABASE_URL             = Deno.env.get("SUPABASE_URL")             ?? "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin":  "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, apikey",
};

// ===== Claudeに渡すツール定義 =====
const tools = [
  {
    name: "post_to_gbp",
    description:
      "Googleビジネスプロフィール（GBP）に投稿する。" +
      "GBP向けに最適化した文章（300字以内・ハッシュタグなし・来店を促す自然な文体）を生成して投稿する。",
    input_schema: {
      type: "object",
      properties: {
        message: {
          type: "string",
          description: "GBP投稿本文（300字以内、地図検索ユーザー向け、ハッシュタグ不要）",
        },
        topic_type: {
          type: "string",
          enum: ["STANDARD", "EVENT", "OFFER"],
          description: "投稿タイプ: STANDARD=通常, EVENT=イベント, OFFER=特典・クーポン",
        },
      },
      required: ["message", "topic_type"],
    },
  },
  {
    name: "post_to_instagram",
    description:
      "Instagramに画像付き投稿を行う。" +
      "Instagram向けに最適化した文章（絵文字多め・ハッシュタグ5〜10個・視覚訴求重視）を生成して投稿する。" +
      "画像URLが指定されていない場合は投稿できない旨をユーザーに伝えること。",
    input_schema: {
      type: "object",
      properties: {
        caption: {
          type: "string",
          description: "Instagramキャプション（絵文字多め・末尾にハッシュタグ5〜10個）",
        },
        image_url: {
          type: "string",
          description: "投稿する画像の公開URL（必須）",
        },
      },
      required: ["caption", "image_url"],
    },
  },
];

// ===== エントリポイント =====
Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: CORS_HEADERS });
  }

  const resHeaders = { ...CORS_HEADERS, "Content-Type": "application/json" };

  try {
    const { store_id, instruction, image_url } = await req.json();

    if (!store_id || !instruction) {
      return new Response(
        JSON.stringify({ error: "store_id と instruction は必須です" }),
        { status: 400, headers: resHeaders },
      );
    }

    // サービスロールキーでDB接続（認証情報を安全に取得）
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const { data: store, error: storeErr } = await supabase
      .from("sns_store_settings")
      .select("*")
      .eq("id", store_id)
      .single();

    if (storeErr || !store) {
      return new Response(
        JSON.stringify({ error: "店舗設定が見つかりません" }),
        { status: 404, headers: resHeaders },
      );
    }

    const systemPrompt =
      `あなたはレストランのSNSマーケティングエージェントです。\n` +
      `店舗名: ${store.store_name}\n\n` +
      `ユーザーの指示に従い、GBPまたはInstagramへ最適化した投稿を実行してください。\n` +
      `- GBP投稿: 300字以内、来店促進、ハッシュタグ不要、絵文字は控えめ\n` +
      `- Instagram投稿: 絵文字多め、ハッシュタグ5〜10個、視覚的に魅力的な文章、画像URL必須\n` +
      `複数プラットフォームが指定された場合は、それぞれ最適化した内容で個別に投稿してください。\n` +
      `実行後は投稿内容と結果を日本語で簡潔に報告してください。`;

    const userContent = image_url
      ? `${instruction}\n\n使用する画像URL: ${image_url}`
      : instruction;

    const { finalMessage, actions } = await runAgent(
      [{ role: "user", content: userContent }],
      systemPrompt,
      store,
    );

    return new Response(
      JSON.stringify({ success: true, message: finalMessage, actions }),
      { headers: resHeaders },
    );
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return new Response(
      JSON.stringify({ error: msg }),
      { status: 500, headers: resHeaders },
    );
  }
});

// ===== エージェントループ（最大6ターン） =====
type Message = { role: string; content: unknown };
type Action  = { platform: string; status: string; message?: string; error?: string };

async function runAgent(
  messages: Message[],
  systemPrompt: string,
  store: Record<string, string>,
): Promise<{ finalMessage: string; actions: Action[] }> {
  const actions: Action[]  = [];
  const current: Message[] = [...messages];

  for (let turn = 0; turn < 6; turn++) {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type":    "application/json",
        "x-api-key":       ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model:      "claude-opus-4-6",
        max_tokens: 1024,
        system:     systemPrompt,
        tools,
        messages:   current,
      }),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error((err as { error?: { message?: string } })?.error?.message ?? `Claude APIエラー: ${res.status}`);
    }

    const data = await res.json();
    current.push({ role: "assistant", content: data.content });

    // 通常終了
    if (data.stop_reason === "end_turn") {
      const text = (data.content as { type: string; text?: string }[])
        .find(c => c.type === "text")?.text ?? "完了しました。";
      return { finalMessage: text, actions };
    }

    // ツール呼び出し
    if (data.stop_reason === "tool_use") {
      const toolResults: { type: string; tool_use_id: string; content: string }[] = [];

      for (const block of data.content as { type: string; id: string; name: string; input: Record<string, string> }[]) {
        if (block.type !== "tool_use") continue;

        let result: Record<string, unknown>;
        try {
          if (block.name === "post_to_gbp") {
            result = await executeGbpPost(block.input, store);
            actions.push({ platform: "gbp", status: "success", message: block.input.message });
          } else if (block.name === "post_to_instagram") {
            result = await executeInstagramPost(block.input, store);
            actions.push({ platform: "instagram", status: "success", message: block.input.caption });
          } else {
            result = { error: "未知のツール" };
          }
        } catch (e: unknown) {
          const errMsg = e instanceof Error ? e.message : String(e);
          result = { error: errMsg };
          actions.push({ platform: block.name.replace("post_to_", ""), status: "failed", error: errMsg });
        }

        toolResults.push({
          type:        "tool_result",
          tool_use_id: block.id,
          content:     JSON.stringify(result),
        });
      }

      current.push({ role: "user", content: toolResults });
    }
  }

  return { finalMessage: "処理が完了しました。", actions };
}

// ===== GBP API 呼び出し =====
async function executeGbpPost(
  input: Record<string, string>,
  store: Record<string, string>,
): Promise<Record<string, unknown>> {
  const { gbp_access_token, gbp_account_id, gbp_location_id } = store;
  if (!gbp_access_token || !gbp_account_id || !gbp_location_id) {
    throw new Error(
      "GBP認証情報（アクセストークン・アカウントID・ロケーションID）が未設定です。" +
      "店舗設定タブのAIエージェント設定で入力してください。",
    );
  }

  const url = `https://mybusiness.googleapis.com/v4/accounts/${gbp_account_id}/locations/${gbp_location_id}/localPosts`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${gbp_access_token}`,
      "Content-Type":  "application/json",
    },
    body: JSON.stringify({
      languageCode: "ja",
      summary:      input.message,
      topicType:    input.topic_type ?? "STANDARD",
    }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err as { error?: { message?: string } })?.error?.message ?? `GBP APIエラー: ${res.status}`);
  }
  return res.json();
}

// ===== Instagram Graph API 呼び出し（2ステップ） =====
async function executeInstagramPost(
  input: Record<string, string>,
  store: Record<string, string>,
): Promise<Record<string, unknown>> {
  const { ig_access_token, ig_account_id } = store;
  if (!ig_access_token || !ig_account_id) {
    throw new Error(
      "Instagram認証情報（アクセストークン・アカウントID）が未設定です。" +
      "店舗設定タブのAIエージェント設定で入力してください。",
    );
  }

  const base = `https://graph.facebook.com/v19.0/${ig_account_id}`;

  // Step 1: メディアコンテナ作成
  const containerRes = await fetch(`${base}/media`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      image_url:    input.image_url,
      caption:      input.caption,
      access_token: ig_access_token,
    }),
  });
  if (!containerRes.ok) {
    const err = await containerRes.json().catch(() => ({}));
    throw new Error((err as { error?: { message?: string } })?.error?.message ?? `Instagram メディア作成エラー: ${containerRes.status}`);
  }
  const { id: creationId } = await containerRes.json() as { id: string };

  // Step 2: 公開
  const publishRes = await fetch(`${base}/media_publish`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ creation_id: creationId, access_token: ig_access_token }),
  });
  if (!publishRes.ok) {
    const err = await publishRes.json().catch(() => ({}));
    throw new Error((err as { error?: { message?: string } })?.error?.message ?? `Instagram 公開エラー: ${publishRes.status}`);
  }
  return publishRes.json();
}

import { checkTablesExist, fetchStoreSettings, insertPostHistory, SETUP_SQL, checkAgentColumns, AGENT_MIGRATION_SQL } from "./snsDb.js";
import { initStoresTab, renderStoresList } from "./snsStores.js";
import { initHistoryTab, renderHistory } from "./snsHistory.js";
import { initAgentTab, refreshAgentStoreSelect } from "./snsAgent.js";
import { _escapeHtml } from "./utils.js";

function getEl(id) { return document.getElementById(id); }

// 選択中の店舗情報（webhook URL を含む）
let _currentStore = null;
let _storesList   = [];

// ===== タブ切り替え =====
const SNS_TABS = ["post", "stores", "history", "agent"];

function switchSnsTab(tabName) {
  SNS_TABS.forEach(t => {
    const btn     = getEl(`snsTab${cap(t)}`);
    const content = getEl(`snsTabContent${cap(t)}`);
    const isActive = t === tabName;
    btn?.classList.toggle("active", isActive);
    if (content) content.hidden = !isActive;
  });

  if (tabName === "history") renderHistory();
  if (tabName === "stores")  renderStoresList();
  if (tabName === "agent")   checkAgentSetup();
}

function cap(s) { return s.charAt(0).toUpperCase() + s.slice(1); }

// ===== 店舗セレクト =====
async function refreshStoreSelect() {
  const sel = getEl("snsStoreSelect");
  if (!sel) return;

  try { _storesList = await fetchStoreSettings(); } catch (_) { _storesList = []; }

  const prev = sel.value;
  sel.innerHTML =
    `<option value="">-- 店舗を選択 --</option>` +
    _storesList.map(s => `<option value="${s.id}">${_escapeHtml(s.store_name)}</option>`).join("");

  // 以前の選択を復元
  if (prev && _storesList.find(s => String(s.id) === prev)) sel.value = prev;

  updateCurrentStore();
  renderPreview();
}

// 店舗設定タブ・エージェントタブから呼べるよう公開
window._snsRefreshStoreSelect = async () => {
  await refreshStoreSelect();
  await refreshAgentStoreSelect();
};

function updateCurrentStore() {
  const sel = getEl("snsStoreSelect");
  _currentStore = _storesList.find(s => String(s.id) === (sel?.value || "")) ?? null;

  // 店舗未登録の場合のヒント表示
  const hint = getEl("snsStoreSetupHint");
  if (hint) hint.hidden = _storesList.length > 0;
}

// ===== AI投稿案生成（Claude API） =====
async function generateAiPost() {
  const apiKey = (localStorage.getItem("snsAiApiKey") || "").trim();
  if (!apiKey) {
    alert("「店舗設定」タブでAnthropic APIキーを設定してください。");
    switchSnsTab("stores");
    return;
  }

  const storeName = _currentStore?.store_name || "";
  const theme    = (getEl("snsAiTheme")?.value    || "").trim();
  const keywords = (getEl("snsAiKeywords")?.value || "").trim();

  if (!theme) {
    alert("投稿テーマを入力してください。");
    getEl("snsAiTheme")?.focus();
    return;
  }

  const btn     = getEl("btnGenerateAi");
  const spinner = getEl("aiSpinner");
  const result  = getEl("snsAiResult");

  if (btn)     btn.disabled = true;
  if (spinner) spinner.hidden = false;
  if (result)  result.hidden = true;

  const prompt = `あなたはレストランのSNSマーケティング専門家です。
以下の情報をもとに、GBP（Googleビジネスプロフィール）用とInstagram用の投稿文を作成してください。

店舗名: ${storeName || "（店舗名未設定）"}
投稿テーマ: ${theme}
キーワード・補足情報: ${keywords || "（なし）"}

【要件】
- GBP用: 300字以内。お店の特徴・場所・来店を促す自然な文章。絵文字は控えめに。ハッシュタグ不要。
- Instagram用: 魅力的な絵文字を使い、読者の感情を動かす文章。末尾にハッシュタグ（5〜10個）を含める。

必ずJSON形式のみで返してください（前後に余分な文字を含めないこと）:
{"gbp":"GBP用投稿文","instagram":"Instagram用投稿文（ハッシュタグ含む）"}`;

  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "anthropic-dangerous-direct-browser-access": "true",
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 1024,
        messages: [{ role: "user", content: prompt }],
      }),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err?.error?.message || `APIエラー: ${res.status}`);
    }

    const data = await res.json();
    const raw  = data.content?.[0]?.text || "";

    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error("レスポンスのパースに失敗しました。再度お試しください。");

    const parsed = JSON.parse(jsonMatch[0]);

    const gbpEl = getEl("aiDraftGbp");
    const igEl  = getEl("aiDraftIg");
    if (gbpEl) gbpEl.textContent = parsed.gbp       || "";
    if (igEl)  igEl.textContent  = parsed.instagram  || "";

    if (result) result.hidden = false;
  } catch (e) {
    alert("AI生成エラー: " + e.message);
  } finally {
    if (btn)     btn.disabled = false;
    if (spinner) spinner.hidden = true;
  }
}

function applyAiDraft(source) {
  const text = getEl(`aiDraft${source}`)?.textContent || "";
  if (!text) return;

  if (source === "Ig") {
    // ハッシュタグ行を本文から分離する
    const lines = text.split("\n");
    const firstHashIdx = lines.findIndex(l => /^#\w/.test(l.trim()));
    if (firstHashIdx > 0) {
      const body = lines.slice(0, firstHashIdx).join("\n").trim();
      const tags = lines.slice(firstHashIdx).join(" ").trim();
      if (getEl("snsBody"))     getEl("snsBody").value     = body;
      if (getEl("snsHashtags")) getEl("snsHashtags").value = tags;
    } else {
      if (getEl("snsBody")) getEl("snsBody").value = text;
    }
  } else {
    if (getEl("snsBody"))     getEl("snsBody").value     = text;
    if (getEl("snsHashtags")) getEl("snsHashtags").value = "";
  }

  renderPreview();
}

// ===== 投稿テキスト構築 =====
function collectTargets() {
  return Array.from(document.querySelectorAll('input[name="snsTargets"]:checked')).map(el => el.value);
}

function buildPostText() {
  const targets  = collectTargets();
  const store    = _currentStore?.store_name || "";
  const campaign = (getEl("snsCampaign")?.value  || "").trim();
  const body     = (getEl("snsBody")?.value      || "").trim();
  const hashtags = (getEl("snsHashtags")?.value  || "").trim();
  const url      = (getEl("snsUrl")?.value       || "").trim();

  const icon = targets.length === 1
    ? (targets[0] === "gbp" ? "📍" : "📸")
    : "📣";

  const lines = [];
  if (store)    lines.push(`${icon} ${store}よりお知らせ`);
  if (campaign) lines.push(`【${campaign}】`);
  if (body)     lines.push(body);
  if (hashtags) lines.push(hashtags);
  if (url)      lines.push(url);

  return lines.filter(Boolean).join("\n\n");
}

function renderPreview() {
  const el = getEl("snsPreview");
  if (!el) return;
  const text = buildPostText();
  el.classList.toggle("text-muted", !text);
  el.textContent = text || "投稿内容がここに表示されます。";
}

async function copyPostText() {
  const text = buildPostText();
  if (!text) { alert("本文を入力してください。"); return; }
  try {
    await navigator.clipboard.writeText(text);
    alert("投稿テキストをコピーしました。");
  } catch (_) {
    alert("コピーに失敗しました。手動でコピーしてください。");
  }
}

// ===== テンプレート =====
function applyTemplate(type) {
  const store      = _currentStore?.store_name || "当店";
  const bodyEl     = getEl("snsBody");
  const tagsEl     = getEl("snsHashtags");
  const campaignEl = getEl("snsCampaign");
  if (!bodyEl || !tagsEl || !campaignEl) return;

  const templates = {
    today: {
      campaign: "本日のおすすめ",
      body:     `${store}です！\n本日は旬の海鮮メニューを多数ご用意しています。\nぜひお立ち寄りください！`,
      tags:     "#本日のおすすめ #海鮮 #居酒屋",
    },
    event: {
      campaign: "イベント告知",
      body:     `${store}からイベントのお知らせです。\n限定メニューをご用意してお待ちしています！`,
      tags:     "#イベント #期間限定 #グルメ",
    },
    recruit: {
      campaign: "採用情報",
      body:     `${store}では一緒に働く仲間を募集中です！\n未経験歓迎・シフト相談OK。`,
      tags:     "#採用 #アルバイト募集 #求人",
    },
  };

  const t = templates[type];
  if (!t) return;
  campaignEl.value = t.campaign;
  bodyEl.value     = t.body;
  tagsEl.value     = t.tags;
  renderPreview();
}

// ===== Webhook投稿 =====
async function postToWebhook(platform, webhookUrl, payload, authToken) {
  const headers = { "Content-Type": "application/json" };
  if (authToken) headers.Authorization = `Bearer ${authToken}`;

  const res = await fetch(webhookUrl, {
    method: "POST",
    headers,
    body: JSON.stringify({ platform, ...payload }),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`${platform}: ${res.status} ${errText}`);
  }
  return res;
}

async function submitPost() {
  const text    = buildPostText();
  const targets = collectTargets();
  const statusEl = getEl("snsPostStatus");

  if (!text)            { alert("投稿本文を入力してください。"); return; }
  if (!targets.length)  { alert("投稿先を1つ以上選択してください。"); return; }
  if (!_currentStore)   { alert("投稿する店舗を選択してください。"); return; }

  const webhookByTarget = {
    gbp:       _currentStore.gbp_webhook,
    instagram: _currentStore.ig_webhook,
  };
  const authToken = _currentStore.auth_token || "";

  const missing = targets.filter(t => !webhookByTarget[t]);
  if (missing.length) {
    const names = missing.map(t => t === "gbp" ? "GBP" : "Instagram").join(", ");
    alert(`Webhook URLが未設定です: ${names}\n「店舗設定」タブで設定してください。`);
    return;
  }

  if (statusEl) {
    statusEl.className = "alert alert-info mt-3 mb-0";
    statusEl.textContent = "投稿を実行中...";
    statusEl.hidden = false;
  }

  const payload = {
    message:  text,
    store:    _currentStore.store_name,
    campaign: (getEl("snsCampaign")?.value || "").trim(),
    hashtags: (getEl("snsHashtags")?.value || "").trim(),
    url:      (getEl("snsUrl")?.value      || "").trim(),
  };

  const results = await Promise.allSettled(
    targets.map(t => postToWebhook(t, webhookByTarget[t], payload, authToken))
  );

  const failed = results
    .map((r, i) => ({ r, target: targets[i] }))
    .filter(({ r }) => r.status === "rejected");

  const status = failed.length === 0 ? "success"
    : failed.length === targets.length ? "failed"
    : "partial";

  // 投稿履歴に保存（失敗しても無視）
  insertPostHistory({
    store_name: _currentStore.store_name,
    platforms:  targets,
    post_text:  text,
    campaign:   payload.campaign,
    hashtags:   payload.hashtags,
    status,
  }).catch(() => {});

  if (failed.length) {
    const details = failed.map(({ target, r }) =>
      `${target === "gbp" ? "GBP" : "Instagram"}: ${r.reason.message}`
    ).join(" | ");
    if (statusEl) {
      statusEl.className = "alert alert-danger mt-3 mb-0";
      statusEl.textContent = `一部の投稿に失敗しました。${details}`;
    }
    return;
  }

  if (statusEl) {
    const names = targets.map(t => t === "gbp" ? "Googleビジネスプロフィール" : "Instagram").join(" / ");
    statusEl.className = "alert alert-success mt-3 mb-0";
    statusEl.textContent = `${names} への投稿リクエストが完了しました。`;
  }
}

// ===== AIエージェントタブ：マイグレーションチェック =====
let _agentColumnsChecked = false;

async function checkAgentSetup() {
  if (_agentColumnsChecked) return;

  const banner = getEl("agentMigrationBanner");
  if (!banner) return;

  const ok = await checkAgentColumns();
  if (!ok) {
    const sqlEl = getEl("agentMigrationSql");
    if (sqlEl) sqlEl.textContent = AGENT_MIGRATION_SQL;
    banner.hidden = false;

    getEl("btnCopyAgentSql")?.addEventListener("click", async () => {
      await navigator.clipboard.writeText(AGENT_MIGRATION_SQL).catch(() => {});
      const btn = getEl("btnCopyAgentSql");
      if (btn) {
        btn.textContent = "コピーしました！";
        setTimeout(() => { btn.textContent = "SQLをコピー"; }, 2000);
      }
    });

    getEl("btnAgentMigrationDone")?.addEventListener("click", async () => {
      const colOk = await checkAgentColumns();
      if (colOk) {
        banner.hidden = true;
        _agentColumnsChecked = true;
      } else {
        alert("列がまだ追加されていないようです。SQLを実行してから再度お試しください。");
      }
    });
  } else {
    banner.hidden = true;
    _agentColumnsChecked = true;
  }
}

// ===== 初回セットアップバナー =====
async function checkSetup() {
  const banner = getEl("snsSetupBanner");
  if (!banner) return true;

  const exists = await checkTablesExist();

  if (!exists) {
    const sqlEl = getEl("snsSetupSql");
    if (sqlEl) sqlEl.textContent = SETUP_SQL;
    banner.hidden = false;

    getEl("btnCopySetupSql")?.addEventListener("click", async () => {
      await navigator.clipboard.writeText(SETUP_SQL).catch(() => {});
      const btn = getEl("btnCopySetupSql");
      if (btn) {
        btn.textContent = "コピーしました！";
        setTimeout(() => { btn.textContent = "SQLをコピー"; }, 2000);
      }
    });

    getEl("btnSetupDone")?.addEventListener("click", async () => {
      const ok = await checkTablesExist();
      if (ok) {
        banner.hidden = true;
        await refreshStoreSelect();
        await initStoresTab();
      } else {
        alert("テーブルがまだ見つかりません。SQLを実行してから再度お試しください。");
      }
    });

    return false;
  }

  banner.hidden = true;
  return true;
}

// ===== 初期化 =====
export async function initSnsPage() {
  // タブボタン
  document.querySelectorAll("[data-sns-tab]").forEach(btn => {
    btn.addEventListener("click", () => switchSnsTab(btn.dataset.snsTab));
  });

  // テーブル存在確認
  const ready = await checkSetup();

  if (ready) {
    await refreshStoreSelect();
    await initStoresTab();
  }

  initHistoryTab();
  await initAgentTab();

  // 店舗選択変更
  getEl("snsStoreSelect")?.addEventListener("change", () => {
    updateCurrentStore();
    renderPreview();
  });

  // AI生成
  getEl("btnGenerateAi")?.addEventListener("click", generateAiPost);
  getEl("btnApplyGbp")?.addEventListener("click", () => applyAiDraft("Gbp"));
  getEl("btnApplyIg")?.addEventListener("click",  () => applyAiDraft("Ig"));

  // 投稿ボタン
  getEl("btnSnsPreview")?.addEventListener("click",  renderPreview);
  getEl("btnSnsCopy")?.addEventListener("click",     copyPostText);
  getEl("btnSnsAutoPost")?.addEventListener("click", submitPost);

  // テンプレートチップ
  document.querySelectorAll(".sns-template-chip").forEach(chip => {
    chip.addEventListener("click", () => applyTemplate(chip.dataset.template));
  });

  // 入力時にプレビュー更新
  ["snsCampaign", "snsBody", "snsHashtags", "snsUrl"].forEach(id => {
    getEl(id)?.addEventListener("input", renderPreview);
  });
  document.querySelectorAll('input[name="snsTargets"]').forEach(el => {
    el.addEventListener("change", renderPreview);
  });

  renderPreview();
}

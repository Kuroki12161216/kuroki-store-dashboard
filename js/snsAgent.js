import { supabase } from "./supabaseClient.js";
import { fetchStoreSettings } from "./snsDb.js";
import { _escapeHtml } from "./utils.js";

function getEl(id) { return document.getElementById(id); }

let _agentStores = [];
let _agentCurrentStoreId = null;

// ===== 初期化 =====
export async function initAgentTab() {
  await refreshAgentStoreSelect();

  getEl("agentStoreSelect")?.addEventListener("change", e => {
    _agentCurrentStoreId = e.target.value || null;
  });

  getEl("agentForm")?.addEventListener("submit", handleAgentSubmit);

  appendAgentMessage("bot", "こんにちは！投稿したい内容を自然な言葉で指示してください。\n\n例：\n・「今日の牡蠣フライをGBPとInstagramに投稿して」\n・「週末のランチイベントをGBPに告知して」\n・「採用情報をInstagramに投稿して（画像URLを入力してください）」");
}

export async function refreshAgentStoreSelect() {
  const sel = getEl("agentStoreSelect");
  if (!sel) return;

  try { _agentStores = await fetchStoreSettings(); } catch (_) { _agentStores = []; }

  const prev = sel.value;
  sel.innerHTML =
    `<option value="">-- 店舗を選択 --</option>` +
    _agentStores.map(s => `<option value="${s.id}">${_escapeHtml(s.store_name)}</option>`).join("");

  if (prev && _agentStores.find(s => String(s.id) === prev)) sel.value = prev;
  _agentCurrentStoreId = sel.value || null;
}

// ===== フォーム送信 =====
async function handleAgentSubmit(e) {
  e.preventDefault();

  const instruction = (getEl("agentInstruction")?.value || "").trim();
  const imageUrl    = (getEl("agentImageUrl")?.value    || "").trim();

  if (!instruction) {
    getEl("agentInstruction")?.focus();
    return;
  }
  if (!_agentCurrentStoreId) {
    alert("投稿する店舗を選択してください。");
    return;
  }

  // ユーザーメッセージを表示
  appendAgentMessage("user", instruction + (imageUrl ? `\n🖼 ${imageUrl}` : ""));
  getEl("agentInstruction").value = "";
  getEl("agentImageUrl").value    = "";

  // 送信中UI
  const thinkingId = appendAgentMessage("bot", "考え中...", true);
  setAgentLoading(true);

  try {
    const { data, error } = await supabase.functions.invoke("sns-agent", {
      body: {
        store_id:    Number(_agentCurrentStoreId),
        instruction,
        image_url:   imageUrl || undefined,
      },
    });

    removeAgentMessage(thinkingId);

    if (error || !data?.success) {
      appendAgentMessage("error", `エラー: ${data?.error || error?.message || "不明なエラーが発生しました"}`);
      return;
    }

    // アクションログ（投稿実行結果）
    if (data.actions?.length) {
      const actionHtml = data.actions.map(a => {
        const icon = a.status === "success" ? "✅" : "❌";
        const platform = a.platform === "gbp" ? "Googleビジネスプロフィール" : "Instagram";
        if (a.status === "success") {
          return `${icon} ${platform}への投稿が完了しました`;
        } else {
          return `${icon} ${platform}への投稿が失敗しました：${a.error}`;
        }
      }).join("\n");
      appendAgentMessage("action", actionHtml);
    }

    // エージェントの最終メッセージ
    if (data.message) {
      appendAgentMessage("bot", data.message);
    }

  } catch (err) {
    removeAgentMessage(thinkingId);
    appendAgentMessage("error", `通信エラー: ${err.message}`);
  } finally {
    setAgentLoading(false);
  }
}

// ===== チャットUIヘルパー =====
let _msgCounter = 0;

function appendAgentMessage(type, text, isTemp = false) {
  const log = getEl("agentChatLog");
  if (!log) return null;

  const id = `agentMsg${++_msgCounter}`;
  const div = document.createElement("div");
  div.id = id;
  div.className = `agent-msg agent-msg-${type}${isTemp ? " agent-msg-temp" : ""}`;

  const iconMap = {
    bot:    "🤖",
    user:   "👤",
    action: "📋",
    error:  "⚠️",
  };
  const icon = iconMap[type] || "💬";

  div.innerHTML = `
    <div class="agent-msg-icon">${icon}</div>
    <div class="agent-msg-body">${_escapeHtml(text).replace(/\n/g, "<br>")}</div>
  `;

  log.appendChild(div);
  log.scrollTop = log.scrollHeight;
  return id;
}

function removeAgentMessage(id) {
  if (!id) return;
  getEl(id)?.remove();
}

function setAgentLoading(loading) {
  const btn = getEl("agentSubmitBtn");
  const spinner = getEl("agentSpinner");
  if (btn)     btn.disabled = loading;
  if (spinner) spinner.hidden = !loading;
}

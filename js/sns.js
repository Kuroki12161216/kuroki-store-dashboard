const STORAGE_KEY = "snsAutoPostConfig";

function getEl(id) {
  return document.getElementById(id);
}

function collectTargets() {
  return Array.from(document.querySelectorAll('input[name="snsTargets"]:checked')).map((el) => el.value);
}

function buildPostText() {
  const targets = collectTargets();
  const store = (getEl("snsStore")?.value || "").trim();
  const campaign = (getEl("snsCampaign")?.value || "").trim();
  const body = (getEl("snsBody")?.value || "").trim();
  const hashtags = (getEl("snsHashtags")?.value || "").trim();
  const url = (getEl("snsUrl")?.value || "").trim();

  const titleByTarget = {
    gbp: "📍",
    instagram: "📸",
  };

  const icon = targets.length === 1 ? (titleByTarget[targets[0]] || "📣") : "📣";
  const lines = [];

  if (store) lines.push(`${icon} ${store}よりお知らせ`);
  if (campaign) lines.push(`【${campaign}】`);
  if (body) lines.push(body);
  if (hashtags) lines.push(hashtags);
  if (url) lines.push(url);

  return lines.filter(Boolean).join("\n\n");
}

function renderPreview() {
  const previewEl = getEl("snsPreview");
  if (!previewEl) return;

  const text = buildPostText();
  previewEl.classList.toggle("text-muted", !text);
  previewEl.textContent = text || "投稿内容がここに表示されます。";
}

async function copyPostText() {
  const text = buildPostText();
  if (!text) {
    alert("本文を入力してください。");
    return;
  }

  try {
    await navigator.clipboard.writeText(text);
    alert("投稿テキストをコピーしました。");
  } catch (_) {
    alert("コピーに失敗しました。手動でコピーしてください。");
  }
}

function applyTemplate(type) {
  const store = (getEl("snsStore")?.value || "マグロと炉端成る").trim();
  const bodyEl = getEl("snsBody");
  const tagsEl = getEl("snsHashtags");
  const campaignEl = getEl("snsCampaign");
  if (!bodyEl || !tagsEl || !campaignEl) return;

  if (type === "today") {
    campaignEl.value = "本日のおすすめ";
    bodyEl.value = `${store}です！\n本日は旬の海鮮メニューを多数ご用意しています。\nぜひお立ち寄りください！`;
    tagsEl.value = "#本日のおすすめ #海鮮 #居酒屋";
  } else if (type === "event") {
    campaignEl.value = "イベント告知";
    bodyEl.value = `${store}からイベントのお知らせです。\n限定メニューをご用意してお待ちしています！`;
    tagsEl.value = "#イベント #期間限定 #グルメ";
  } else if (type === "recruit") {
    campaignEl.value = "採用情報";
    bodyEl.value = `${store}では一緒に働く仲間を募集中です！\n未経験歓迎・シフト相談OK。`;
    tagsEl.value = "#採用 #アルバイト募集 #求人";
  }

  renderPreview();
}

function saveConfig() {
  const config = {
    gbpWebhook: (getEl("snsWebhookGbp")?.value || "").trim(),
    instagramWebhook: (getEl("snsWebhookInstagram")?.value || "").trim(),
    authToken: (getEl("snsAuthToken")?.value || "").trim(),
  };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
}

function loadConfig() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
    if (getEl("snsWebhookGbp")) getEl("snsWebhookGbp").value = saved.gbpWebhook || "";
    if (getEl("snsWebhookInstagram")) getEl("snsWebhookInstagram").value = saved.instagramWebhook || "";
    if (getEl("snsAuthToken")) getEl("snsAuthToken").value = saved.authToken || "";
  } catch (_) {
    // noop
  }
}

async function postToWebhook(platform, webhookUrl, payload, authToken) {
  const headers = { "Content-Type": "application/json" };
  if (authToken) headers.Authorization = `Bearer ${authToken}`;

  const response = await fetch(webhookUrl, {
    method: "POST",
    headers,
    body: JSON.stringify({ platform, ...payload }),
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`${platform}: ${response.status} ${errText}`);
  }

  return response;
}

async function autoPost() {
  const statusEl = getEl("snsPostStatus");
  const text = buildPostText();
  const targets = collectTargets();

  if (!text) {
    alert("投稿本文を入力してください。");
    return;
  }
  if (!targets.length) {
    alert("投稿先を1つ以上選択してください。");
    return;
  }

  saveConfig();

  const payload = {
    message: text,
    store: (getEl("snsStore")?.value || "").trim(),
    campaign: (getEl("snsCampaign")?.value || "").trim(),
    hashtags: (getEl("snsHashtags")?.value || "").trim(),
    url: (getEl("snsUrl")?.value || "").trim(),
  };

  const webhookByTarget = {
    gbp: (getEl("snsWebhookGbp")?.value || "").trim(),
    instagram: (getEl("snsWebhookInstagram")?.value || "").trim(),
  };
  const authToken = (getEl("snsAuthToken")?.value || "").trim();

  const missing = targets.filter((t) => !webhookByTarget[t]);
  if (missing.length) {
    alert(`Webhook URLが未設定です: ${missing.join(", ")}`);
    return;
  }

  if (statusEl) {
    statusEl.className = "alert alert-info mt-3 mb-0";
    statusEl.textContent = "自動投稿を実行中...";
    statusEl.hidden = false;
  }

  const results = await Promise.allSettled(
    targets.map((target) => postToWebhook(target, webhookByTarget[target], payload, authToken))
  );

  const failed = results
    .map((result, idx) => ({ result, target: targets[idx] }))
    .filter(({ result }) => result.status === "rejected");

  if (failed.length) {
    const details = failed.map(({ target, result }) => `${target}: ${result.reason.message}`).join(" | ");
    if (statusEl) {
      statusEl.className = "alert alert-danger mt-3 mb-0";
      statusEl.textContent = `一部の自動投稿に失敗しました。${details}`;
    }
    return;
  }

  if (statusEl) {
    statusEl.className = "alert alert-success mt-3 mb-0";
    statusEl.textContent = "Googleビジネスプロフィール / Instagram への自動投稿リクエストが完了しました。";
  }
}

function initSnsPage() {
  const previewBtn = getEl("btnSnsPreview");
  const copyBtn = getEl("btnSnsCopy");
  const postBtn = getEl("btnSnsAutoPost");

  if (previewBtn) previewBtn.addEventListener("click", renderPreview);
  if (copyBtn) copyBtn.addEventListener("click", copyPostText);
  if (postBtn) postBtn.addEventListener("click", autoPost);

  ["snsStore", "snsCampaign", "snsBody", "snsHashtags", "snsUrl", "snsWebhookGbp", "snsWebhookInstagram", "snsAuthToken"].forEach((id) => {
    const el = getEl(id);
    if (el) {
      el.addEventListener("input", () => {
        if (["snsWebhookGbp", "snsWebhookInstagram", "snsAuthToken"].includes(id)) {
          saveConfig();
        }
        renderPreview();
      });
    }
  });

  document.querySelectorAll('input[name="snsTargets"]').forEach((el) => {
    el.addEventListener("change", renderPreview);
  });

  document.querySelectorAll(".sns-template-chip").forEach((chip) => {
    chip.addEventListener("click", () => applyTemplate(chip.dataset.template));
  });

  loadConfig();
  renderPreview();
}

export { initSnsPage };

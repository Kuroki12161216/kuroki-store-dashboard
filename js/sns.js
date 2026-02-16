function getEl(id) {
  return document.getElementById(id);
}

function buildPostText() {
  const platform = getEl("snsPlatform")?.value || "x";
  const store = (getEl("snsStore")?.value || "").trim();
  const campaign = (getEl("snsCampaign")?.value || "").trim();
  const body = (getEl("snsBody")?.value || "").trim();
  const hashtags = (getEl("snsHashtags")?.value || "").trim();
  const url = (getEl("snsUrl")?.value || "").trim();

  const titleByPlatform = {
    x: "📢",
    line: "🟢",
    facebook: "🔵",
  };

  const lines = [];
  const icon = titleByPlatform[platform] || "📢";

  if (store) {
    lines.push(`${icon} ${store}よりお知らせ`);
  }
  if (campaign) {
    lines.push(`【${campaign}】`);
  }
  if (body) {
    lines.push(body);
  }
  if (hashtags) {
    lines.push(hashtags);
  }
  if (url) {
    lines.push(url);
  }

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
  if (!text) return;

  try {
    await navigator.clipboard.writeText(text);
    alert("投稿テキストをコピーしました。");
  } catch (_) {
    alert("コピーに失敗しました。手動でコピーしてください。");
  }
}

function openPostScreen() {
  const text = buildPostText();
  const platform = getEl("snsPlatform")?.value || "x";
  if (!text) return;

  const encoded = encodeURIComponent(text);
  if (platform === "line") {
    window.open(`https://social-plugins.line.me/lineit/share?text=${encoded}`, "_blank");
    return;
  }
  if (platform === "facebook") {
    const url = getEl("snsUrl")?.value?.trim() || "https://www.facebook.com";
    window.open(`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}&quote=${encoded}`, "_blank");
    return;
  }
  window.open(`https://twitter.com/intent/tweet?text=${encoded}`, "_blank");
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

function initSnsPage() {
  const previewBtn = getEl("btnSnsPreview");
  const copyBtn = getEl("btnSnsCopy");
  const postBtn = getEl("btnSnsPost");

  if (previewBtn) previewBtn.addEventListener("click", renderPreview);
  if (copyBtn) copyBtn.addEventListener("click", copyPostText);
  if (postBtn) postBtn.addEventListener("click", openPostScreen);

  ["snsPlatform", "snsStore", "snsCampaign", "snsBody", "snsHashtags", "snsUrl"].forEach((id) => {
    const el = getEl(id);
    if (el) el.addEventListener("input", renderPreview);
  });

  document.querySelectorAll(".sns-template-chip").forEach((chip) => {
    chip.addEventListener("click", () => applyTemplate(chip.dataset.template));
  });

  renderPreview();
}

export { initSnsPage };

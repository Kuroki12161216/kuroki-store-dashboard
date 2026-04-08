/**
 * reviews.js — 口コミ・評価ダッシュボード
 * Supabase テーブル: 口コミ一覧
 * 列: id, 媒体, 店舗, 評価, コメント, 返信, 返信済, 投稿日, 返信日, url, created_at
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL     = "https://djgylzypyunbcetvquom.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRqZ3lsenlweXVuYmNldHZxdW9tIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDA4MTk3MjgsImV4cCI6MjA1NjM5NTcyOH0.tRwiVkMiCIvONpjyAJAt3FZ2iUIy6ihaAiHMtZ3bFI0";
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const TABLE    = "口コミ一覧";
const LOADING  = "rvLoading";

const PLATFORMS = {
  google:   { label: "Google",   color: "#4285F4", icon: "G" },
  tabelog:  { label: "食べログ", color: "#E24B4B", icon: "食" },
  gurunavi: { label: "ぐるなび", color: "#FF6B00", icon: "ぐ" },
  other:    { label: "その他",   color: "#667085", icon: "他" },
};

// ===== State =====
let allReviews = [];
let trendChart = null;
let currentTabFilter = "all";
let currentEditId = null;
let currentRating = 0;

// ===== Helpers =====
const $ = id => document.getElementById(id);

function esc(str) {
  if (!str) return "";
  return str.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");
}

function starsHtml(n, size = "13px") {
  const full = Math.round(n || 0);
  return `<span style="color:#f59e0b;font-size:${size}">${"★".repeat(full)}${"☆".repeat(5 - full)}</span>`;
}

function platformIcon(p) {
  const pl = PLATFORMS[p] || PLATFORMS.other;
  return `<div class="plat-icon ${p}" title="${pl.label}" style="color:${pl.color};font-weight:700;font-size:13px">${pl.icon}</div>`;
}

function fmtDate(d) {
  if (!d) return "—";
  return d.slice(0, 10).replace(/-/g, "/");
}

function toYYYYMM(dateStr) {
  if (!dateStr) return "";
  return dateStr.slice(0, 7);
}

// ===== Load Data =====
async function loadReviews() {
  $(LOADING).hidden = false;
  try {
    const { data, error } = await supabase
      .from(TABLE)
      .select("*")
      .order("投稿日", { ascending: false });

    if (error) throw error;
    allReviews = data || [];
  } catch (e) {
    console.error("口コミ取得エラー:", e);
    allReviews = [];
  } finally {
    $(LOADING).hidden = true;
  }
  render();
}

// ===== Filter =====
function getFiltered() {
  const store    = $("filterStore").value;
  const platform = $("filterPlatform").value;
  const from     = $("filterFrom").value;
  const to       = $("filterTo").value;

  return allReviews.filter(r => {
    if (store && r.店舗 !== store) return false;
    if (platform && r.媒体 !== platform) return false;
    const ym = toYYYYMM(r.投稿日);
    if (from && ym && ym < from) return false;
    if (to   && ym && ym > to)   return false;
    if (currentTabFilter === "replied"   && !r.返信済) return false;
    if (currentTabFilter === "unreplied" &&  r.返信済) return false;
    return true;
  });
}

// ===== Render All =====
function render() {
  const filtered = getFiltered();
  renderPlatformCards(filtered);
  renderTrendChart(filtered);
  renderDistribution(filtered);
  renderReviewsList(filtered);
  updateStoreSelect();
}

// ===== Platform KPI Cards =====
function renderPlatformCards(reviews) {
  const grid = $("platformGrid");
  const keys = Object.keys(PLATFORMS);

  grid.innerHTML = keys.map(p => {
    const pl   = PLATFORMS[p];
    const recs = reviews.filter(r => r.媒体 === p);
    const ratings = recs.map(r => r.評価).filter(v => v > 0);
    const avg  = ratings.length ? (ratings.reduce((a,b)=>a+b,0)/ratings.length).toFixed(1) : "—";
    const cnt  = recs.length;
    const replied = recs.filter(r => r.返信済).length;
    const replyRate = cnt ? Math.round(replied / cnt * 100) : 0;

    return `
      <div class="platform-card ${p}">
        <div class="plat-name"><span class="dot dot-${p}"></span>${pl.label}</div>
        <div class="rating-big">${avg}</div>
        <div class="stars">${avg !== "—" ? starsHtml(parseFloat(avg)) : "<span style='color:#ccc'>評価なし</span>"}</div>
        <div class="meta">
          <div class="meta-item"><span class="val">${cnt}</span>件</div>
          <div class="meta-item"><span class="val">${replied}</span>返信済</div>
        </div>
        <div class="reply-rate-bar">
          <div class="label"><span>返信率</span><span>${replyRate}%</span></div>
          <div class="progress"><div class="progress-bar pb-${p}" style="width:${replyRate}%"></div></div>
        </div>
      </div>`;
  }).join("");
}

// ===== Trend Chart =====
function renderTrendChart(reviews) {
  const ctx = document.getElementById("trendChart").getContext("2d");

  // 月別・媒体別 平均評価
  const monthSet = new Set();
  reviews.forEach(r => { if (r.投稿日) monthSet.add(toYYYYMM(r.投稿日)); });
  const months = Array.from(monthSet).sort();

  const datasets = Object.entries(PLATFORMS).map(([p, pl]) => {
    const data = months.map(m => {
      const recs = reviews.filter(r => r.媒体 === p && toYYYYMM(r.投稿日) === m && r.評価 > 0);
      if (!recs.length) return null;
      return +(recs.reduce((a,b) => a + b.評価, 0) / recs.length).toFixed(2);
    });
    return {
      label: pl.label,
      data,
      borderColor: pl.color,
      backgroundColor: pl.color + "22",
      tension: 0.3,
      pointRadius: 4,
      spanGaps: true,
    };
  });

  if (trendChart) trendChart.destroy();
  trendChart = new Chart(ctx, {
    type: "line",
    data: {
      labels: months.map(m => m.replace("-","/")),
      datasets,
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { position: "bottom", labels: { boxWidth: 12, font: { size: 11 } } } },
      scales: {
        y: {
          min: 1, max: 5,
          ticks: { stepSize: 1, font: { size: 11 } },
          grid: { color: "#f3f4f6" },
        },
        x: { ticks: { font: { size: 11 } }, grid: { display: false } },
      },
    }
  });
}

// ===== Rating Distribution =====
function renderDistribution(reviews) {
  const ratings = reviews.map(r => r.評価).filter(v => v > 0);
  const total = ratings.length || 1;
  const counts = [5,4,3,2,1].map(s => ratings.filter(v => v === s).length);

  $("distList").innerHTML = [5,4,3,2,1].map((star, i) => {
    const cnt = counts[i];
    const pct = Math.round(cnt / total * 100);
    return `
      <li>
        <span class="star-label">${star}★</span>
        <div class="bar-wrap"><div class="bar-fill" style="width:${pct}%"></div></div>
        <span class="cnt">${cnt}</span>
      </li>`;
  }).join("");
}

// ===== Reviews List =====
function renderReviewsList(reviews) {
  const list = $("reviewsList");
  $("reviewCount").textContent = `（${reviews.length}件）`;

  if (!reviews.length) {
    list.innerHTML = `
      <div class="empty-state">
        <i class="bi bi-chat-square-text"></i>
        口コミデータがありません。「口コミ追加」から登録してください。
      </div>`;
    return;
  }

  list.innerHTML = reviews.map(r => {
    const pl = PLATFORMS[r.媒体] || PLATFORMS.other;
    const repliedBadge = r.返信済
      ? `<span class="badge-replied">返信済</span>`
      : `<span class="badge-unreplied">未返信</span>`;
    const replyHtml = r.返信
      ? `<div class="rc-reply"><div class="reply-label">店舗からの返信</div>${esc(r.返信)}</div>`
      : "";
    const commentHtml = r.コメント
      ? `<div class="rc-comment">${esc(r.コメント)}</div>`
      : `<div class="rc-comment empty">（コメントなし）</div>`;
    const urlLink = r.url
      ? `<a href="${esc(r.url)}" target="_blank" rel="noopener" style="font-size:11px;color:#4285F4;margin-left:auto"><i class="bi bi-box-arrow-up-right"></i> 元ページ</a>`
      : "";

    return `
      <div class="review-card" data-id="${r.id}">
        <div class="rc-head">
          ${platformIcon(r.媒体)}
          <div class="rc-meta">
            <div class="rc-store">${esc(r.店舗 || "—")}</div>
            <div class="rc-date">${fmtDate(r.投稿日)}</div>
          </div>
          <div class="rc-stars">${starsHtml(r.評価, "15px")}</div>
        </div>
        ${commentHtml}
        ${replyHtml}
        <div class="rc-footer">
          <span class="badge-plat ${r.媒体}">${pl.label}</span>
          ${repliedBadge}
          ${urlLink}
          <button class="btn-reply${r.返信済?" done":""}" data-id="${r.id}"
            title="${r.返信済?"返信内容を編集":"返信を記録"}">
            <i class="bi bi-reply"></i> ${r.返信済?"返信編集":"返信する"}
          </button>
          <button class="btn-reply" data-edit="${r.id}" title="編集" style="border-color:#667085;color:#667085">
            <i class="bi bi-pencil"></i>
          </button>
        </div>
      </div>`;
  }).join("");

  // reply ボタン
  list.querySelectorAll("button[data-id]").forEach(btn => {
    btn.addEventListener("click", () => openReplyModal(btn.dataset.id));
  });
  // edit ボタン
  list.querySelectorAll("button[data-edit]").forEach(btn => {
    btn.addEventListener("click", () => openEditModal(btn.dataset.edit));
  });
}

// ===== Store Select =====
function updateStoreSelect() {
  const sel = $("filterStore");
  const current = sel.value;
  const stores = [...new Set(allReviews.map(r => r.店舗).filter(Boolean))].sort();
  sel.innerHTML = `<option value="">すべての店舗</option>` +
    stores.map(s => `<option value="${esc(s)}"${s===current?" selected":""}>${esc(s)}</option>`).join("");
}

// ===== Add/Edit Modal =====
function openAddModal() {
  currentEditId = null;
  $("modalTitle").textContent = "口コミを追加";
  $("editId").value = "";
  $("fieldPlatform").value = "google";
  $("fieldStore").value = "";
  $("fieldDate").value = new Date().toISOString().slice(0,10);
  $("fieldComment").value = "";
  $("fieldReply").value = "";
  $("fieldReplied").checked = false;
  $("fieldUrl").value = "";
  $("btnDelete").hidden = true;
  setStarRating(0);
  $("addModal").hidden = false;
}

function openEditModal(id) {
  const r = allReviews.find(x => String(x.id) === String(id));
  if (!r) return;
  currentEditId = id;
  $("modalTitle").textContent = "口コミを編集";
  $("editId").value = id;
  $("fieldPlatform").value = r.媒体 || "google";
  $("fieldStore").value = r.店舗 || "";
  $("fieldDate").value = r.投稿日 || "";
  $("fieldComment").value = r.コメント || "";
  $("fieldReply").value = r.返信 || "";
  $("fieldReplied").checked = !!r.返信済;
  $("fieldUrl").value = r.url || "";
  $("btnDelete").hidden = false;
  setStarRating(r.評価 || 0);
  $("addModal").hidden = false;
}

function closeAddModal() {
  $("addModal").hidden = true;
}

async function saveReview() {
  const store = $("fieldStore").value.trim();
  if (!store) { alert("店舗名を入力してください"); return; }

  const payload = {
    媒体: $("fieldPlatform").value,
    店舗: store,
    投稿日: $("fieldDate").value || null,
    評価: parseInt($("fieldRating").value) || null,
    コメント: $("fieldComment").value.trim() || null,
    返信: $("fieldReply").value.trim() || null,
    返信済: $("fieldReplied").checked,
    返信日: $("fieldReplied").checked ? new Date().toISOString().slice(0,10) : null,
    url: $("fieldUrl").value.trim() || null,
  };

  $(LOADING).hidden = false;
  try {
    if (currentEditId) {
      const { error } = await supabase.from(TABLE).update(payload).eq("id", currentEditId);
      if (error) throw error;
    } else {
      const { error } = await supabase.from(TABLE).insert(payload);
      if (error) throw error;
    }
    closeAddModal();
    await loadReviews();
  } catch (e) {
    console.error("保存エラー:", e);
    alert("保存に失敗しました: " + (e.message || e));
  } finally {
    $(LOADING).hidden = true;
  }
}

async function deleteReview() {
  if (!currentEditId) return;
  if (!confirm("この口コミを削除しますか？")) return;
  $(LOADING).hidden = false;
  try {
    const { error } = await supabase.from(TABLE).delete().eq("id", currentEditId);
    if (error) throw error;
    closeAddModal();
    await loadReviews();
  } catch (e) {
    alert("削除に失敗しました: " + (e.message || e));
  } finally {
    $(LOADING).hidden = true;
  }
}

// ===== Star Rating UI =====
function setStarRating(n) {
  currentRating = n;
  $("fieldRating").value = n;
  document.querySelectorAll("#starInput span").forEach(s => {
    s.classList.toggle("lit", parseInt(s.dataset.v) <= n);
  });
}

// ===== Reply Modal =====
function openReplyModal(id) {
  const r = allReviews.find(x => String(x.id) === String(id));
  if (!r) return;
  $("replyTargetId").value = id;
  $("replyOrigComment").textContent = r.コメント || "（コメントなし）";
  $("replyText").value = r.返信 || "";
  $("replyMarkDone").checked = !!r.返信済 || true;
  $("replyModal").hidden = false;
}

function closeReplyModal() {
  $("replyModal").hidden = true;
}

async function saveReply() {
  const id   = $("replyTargetId").value;
  const text = $("replyText").value.trim();
  const done = $("replyMarkDone").checked;

  $(LOADING).hidden = false;
  try {
    const { error } = await supabase.from(TABLE).update({
      返信: text || null,
      返信済: done,
      返信日: done ? new Date().toISOString().slice(0,10) : null,
    }).eq("id", id);
    if (error) throw error;
    closeReplyModal();
    await loadReviews();
  } catch (e) {
    alert("返信の保存に失敗しました: " + (e.message || e));
  } finally {
    $(LOADING).hidden = true;
  }
}

// ===== Event Listeners =====
function initEvents() {
  // Add modal
  $("btnAddReview").addEventListener("click", openAddModal);
  $("modalClose").addEventListener("click", closeAddModal);
  $("btnCancel").addEventListener("click", closeAddModal);
  $("btnSave").addEventListener("click", saveReview);
  $("btnDelete").addEventListener("click", deleteReview);

  // Reply modal
  $("replyModalClose").addEventListener("click", closeReplyModal);
  $("replyCancel").addEventListener("click", closeReplyModal);
  $("replySave").addEventListener("click", saveReply);

  // Close on overlay click
  $("addModal").addEventListener("click", e => { if (e.target === $("addModal")) closeAddModal(); });
  $("replyModal").addEventListener("click", e => { if (e.target === $("replyModal")) closeReplyModal(); });

  // Star rating
  document.querySelectorAll("#starInput span").forEach(s => {
    s.addEventListener("click", () => setStarRating(parseInt(s.dataset.v)));
    s.addEventListener("mouseenter", () => {
      document.querySelectorAll("#starInput span").forEach(x =>
        x.classList.toggle("lit", parseInt(x.dataset.v) <= parseInt(s.dataset.v))
      );
    });
    s.addEventListener("mouseleave", () => setStarRating(currentRating));
  });

  // Filters
  ["filterStore","filterPlatform","filterFrom","filterTo"].forEach(id => {
    $(id).addEventListener("change", () => render());
  });

  // Tab filter
  document.querySelectorAll(".filter-tab").forEach(btn => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".filter-tab").forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      currentTabFilter = btn.dataset.tab;
      render();
    });
  });
}

// ===== Init =====
async function init() {
  // デフォルト期間：直近12ヶ月
  const now = new Date();
  const toStr = now.toISOString().slice(0,7);
  now.setMonth(now.getMonth() - 11);
  const fromStr = now.toISOString().slice(0,7);
  $("filterFrom").value = fromStr;
  $("filterTo").value   = toStr;

  initEvents();
  await loadReviews();
}

init();

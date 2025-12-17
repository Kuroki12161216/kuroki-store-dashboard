import { supabase } from "./supabaseClient.js";
import { initDashboard } from "./dashboard.js";
import {
  _escapeHtml,
  _splitUrls,
  _extractDriveId,
  _driveThumbUrl,
  _driveDirectViewUrl,
  _driveThumbHdUrl,
  _faviconUrl,
  normalizeMonth,
  _monthToKey,
  _fmtDateYYYYMMDD,
  _currentYYYYMM,
  _isImageUrl
} from "./utils.js";

import {
  showDashboardSection,
  showTaskSection,
  showInspectionSection,
  showSettingsSection,
} from "./routing.js";

import {
  fetchAndDisplayTasks,
} from "./tasks.js";

/* ===== ダッシュボード：初期化 ===== */
window.addEventListener("DOMContentLoaded", async () => {
  await initDashboard();
  // ハッシュで初期表示を分岐
  const h = (location.hash || "").toLowerCase();
  if (h === "#tasks") {
    showTaskSection();
    await fetchAndDisplayTasks();
  } else if (h === "#inspections") {
    showInspectionSection();
  } else if (h === "#settings") {
    showSettingsSection();
  } else {
    showDashboardSection();
  }
});

/* ============================================================
   ===============  臨店一覧（タスク一覧の流用）  ===============
   ============================================================ */

/* --- 設定：Supabase テーブル名とカラムのマッピング --- */
/* 添付Excelの構成に合わせて、必要に応じて下記だけ変更してください。 */
const INSPECTION_TABLE = "臨店一覧"; // ← Supabase 側の臨店テーブル名に変更
const INSPECTION_COLS = {
  // 例：Excelが「月」「カテゴリ」「項目」「判定」「特記事項」「URL」「店舗診断表_id」で入ってくる想定
  month: "月", // yyyymm / もしくは yyyy-mm
  category: "カテゴリ", // 例：サービス/クリーンネス/料理 等
  item: "設問", // 点検項目名
  judge: "判定", // 〇/× など
  note: "特記事項", // テキスト
  url: "url", // 写真や資料のURL
  // diag_fk: "店舗診断表_id", // 店舗診断表の外部キー（なければ null 想定）
  // // もし臨店テーブルに「店舗名」が直であるなら、下記を実カラム名にして使えます（join不要）
  store_direct: "店舗", // 例: "店舗名" に変えると直接使用。null の場合は join で取得。
};
/* --- DOM（臨店一覧） --- */
const inspectionSection = document.getElementById("inspectionSection");
const storeSelectInspection = document.getElementById("storeSelectInspection");
const inspectionsTableBody = document.querySelector("#inspectionsTable tbody");
const inspectionsListMobile = document.getElementById("inspectionsListMobile");

/* ▼ 追加：月/カテゴリー/判定 のセレクト */
const inspMonthSelect = document.getElementById("monthSelectInspection");
const inspCatSelect = document.getElementById("categorySelectInspection");
const inspJudgeSelect = document.getElementById("judgeSelectInspection");

/* --- 状態 --- */
let inspectionsDataGlobal = [];
let currentInspSortColumn = null;
let currentInspSortDir = "asc";

/* ▼ 追加：フィルター状態 */
const inspFilters = {
  store: "",
  month: "", // DBの生値（例：yyyymm）で持つ
  category: "all",
  judge: "all",
};

window.initInspectionPage = async function () {
  await initInspectionFilters(); // ← ここで store, month, category, judge をまとめて初期化
  await fetchAndDisplayInspections();
  subscribeInspectionsRealtime();
  window.refreshInspections = () => fetchAndDisplayInspections(true);
};

/* --- 店舗セレクトを生成（診断表からユニーク抽出 or 直カラム） --- */
async function initInspectionStoreDropdown() {
  let storeNames = [];
  if (INSPECTION_COLS.store_direct) {
    const { data, error } = await supabase
      .from(INSPECTION_TABLE)
      .select(INSPECTION_COLS.store_direct);
    if (!error && data)
      storeNames = [
        ...new Set(
          data.map((r) => r[INSPECTION_COLS.store_direct]).filter(Boolean)
        ),
      ];
  } else {
    // 店舗診断表から抽出（タスク一覧同様）
    const { data, error } = await supabase.from("店舗診断表").select("店舗名");
    if (!error && data)
      storeNames = [...new Set(data.map((r) => r.店舗名).filter(Boolean))];
  }

  // 「全店舗」を先頭に
  storeSelectInspection.innerHTML = "";

  storeNames.forEach((name) => {
    const opt = document.createElement("option");
    opt.value = name;
    opt.textContent = name;
    storeSelectInspection.appendChild(opt);
  });

  if (!inspFilters.store && storeNames.length) {
    inspFilters.store = storeNames[0];
    storeSelectInspection.value = storeNames[0];
  }

  storeSelectInspection.addEventListener("change", () => {
    inspFilters.store = storeSelectInspection.value;
    fetchAndDisplayInspections(true);
  });
}

async function fetchAndDisplayInspections(force = false) {
  const cols = INSPECTION_COLS;

  // 取得カラム
  let selectClause = `id, ${cols.item}, ${cols.judge}, ${cols.note}, ${cols.url}, ${cols.month}, ${cols.category}`;
  if (cols.store_direct) {
    selectClause += `, ${cols.store_direct}`;
  } else {
    selectClause += `, ${cols.diag_fk}, 店舗診断表!inner ( id, 店舗名 )`;
  }

  let query = supabase.from(INSPECTION_TABLE).select(selectClause);

  // ▼ フィルタ：店舗名
  if (inspFilters.store) {
    if (cols.store_direct) {
      query = query.eq(cols.store_direct, inspFilters.store);
    } else {
      query = query.eq("店舗診断表.店舗名", inspFilters.store);
    }
  }
  // ▼ フィルタ：月（DB生値）
  if (inspFilters.month) {
    query = query.eq(cols.month, inspFilters.month);
  }
  // ▼ フィルタ：カテゴリー
  if (inspFilters.category !== "all") {
    query = query.eq(cols.category, inspFilters.category);
  }
  // ▼ フィルタ：判定
  if (inspFilters.judge !== "all") {
    query = query.eq(cols.judge, inspFilters.judge);
  }

  const { data: result, error } = await query;
  if (error) {
    console.error("臨店一覧取得エラー:", error);
    return;
  }

  inspectionsDataGlobal = (result || []).map((r) => {
    const storeName = cols.store_direct
      ? r[cols.store_direct] ?? ""
      : Array.isArray(r.店舗診断表)
        ? r.店舗診断表[0]?.店舗名 ?? ""
        : r.店舗診断表?.店舗名 ?? "";

    return {
      id: r.id,
      店舗名: storeName,
      月値: normalizeMonth(r[cols.month]),
      カテゴリ値: r[cols.category] ?? "",
      項目値: r[cols.item] ?? "",
      判定値: r[cols.judge] ?? "",
      特記事項値: r[cols.note] ?? "",
      URL値: r[cols.url] ?? "",
    };
  });

  renderInspections();
  updateInspectionSortIndicators(null, null);
}

/* --- 描画（PCテーブル & モバイル） --- */
function renderInspections() {
  inspectionsTableBody.innerHTML = "";
  inspectionsListMobile.innerHTML = "";

  inspectionsDataGlobal.forEach((row) => {
    // PC 行
    const tr = document.createElement("tr");
    tr.dataset.inspId = row.id;

    // 店舗（1行省略）
    const tdStore = document.createElement("td");
    tdStore.textContent = row.店舗名 || "";
    tdStore.className = "truncate-1";
    tdStore.title = row.店舗名 || "";

    // 月
    const tdMonth = document.createElement("td");
    tdMonth.textContent = row.月値 || "";

    // カテゴリ
    const tdCat = document.createElement("td");
    tdCat.textContent = row.カテゴリ値 || "";

    // 項目（2行まで表示）
    const tdItem = document.createElement("td");
    tdItem.textContent = row.項目値 || "";
    tdItem.className = "clamp-2";
    tdItem.title = row.項目値 || "";

    // 判定
    const tdJudge = document.createElement("td");
    tdJudge.textContent = row.判定値 || "";
    tdJudge.className = "text-center";

    // 特記事項（読みやすく2行まで、必要に応じて解除してください）
    const tdNote = document.createElement("td");
    tdNote.textContent = row.特記事項値 || "";
    tdNote.className = "clamp-2";
    tdNote.title = row.特記事項値 || "";

    // URL（サムネ/チップは既存処理を活かす）
    const tdUrl = document.createElement("td");
    const urls = _splitUrls(row.URL値);
    if (urls.length) {
      tdUrl.appendChild(buildUrlPreviewNode(urls));
    } else {
      tdUrl.textContent = "—";
    }

    tr.append(tdStore, tdMonth, tdCat, tdItem, tdJudge, tdNote, tdUrl);
    inspectionsTableBody.appendChild(tr);

    /* ここから下（モバイルlist-group生成）はそのまま */
    const li = document.createElement("div");
    li.className = "list-group-item p-0";

    const bg = document.createElement("div");
    bg.className = "lg-swipe-bg";
    bg.innerHTML = `<span class="fw-bold text-danger-emphasis">
  <i class="bi bi-trash3 me-1"></i>
</span>`;

    const fore = document.createElement("div");
    // カード風のクラスを追加しておく（CSSは後述）
    fore.className = "lg-swipe-fore p-3 insp-card";

    const urlsArr = _splitUrls(row.URL値);
    const thumbHtml = _buildMobileThumbHtml(urlsArr);

    // 判定バッジ用
    const judgeText = _escapeHtml(row.判定値 || "-");
    const judgeClass =
      judgeText === "○"
        ? "bg-warning-subtle text-warning-emphasis"
        : judgeText === "×"
          ? "bg-danger-subtle text-danger-emphasis"
          : "bg-secondary-subtle text-secondary-emphasis";

    fore.innerHTML = `
  <div class="d-flex">
    <!-- 左側：テキストブロック -->
    <div class="flex-grow-1 pe-3">
      <div class="small text-muted mb-1">
        ${row.カテゴリ値
        ? `<span class="me-2"><i class="bi bi-tags"></i> ${_escapeHtml(
          row.カテゴリ値
        )}</span>`
        : ""
      }
      </div>

      <div class="fw-semibold text-truncate-2 mb-1">
        ${_escapeHtml(row.項目値 || "(項目未設定)")}
      </div>

      <div class="mb-1">
        <span class="badge rounded-pill ${judgeClass}">
          判定：${judgeText}
        </span>
      </div>

      ${row.特記事項値
        ? `<div class="small text-muted mt-1">
               ${_escapeHtml(row.特記事項値)}
             </div>`
        : ""
      }

      ${!thumbHtml && row.URL値
        ? `<div class="small mt-2">
               <a href="${_escapeHtml(row.URL値)}"
                  target="_blank" rel="noopener"
                  class="insp-mobile-link-fallback">
                 資料リンク
               </a>
             </div>`
        : ""
      }
    </div>

    <!-- 右側：サムネイル -->
    ${thumbHtml
        ? `<div class="flex-shrink-0 ms-2 insp-thumb-wrap">
             ${thumbHtml}
           </div>`
        : ""
      }
  </div>
`;

    li.appendChild(bg);
    li.appendChild(fore);

    const wrap = document.createElement("div");
    wrap.className = "lg-swipe-wrap";
    wrap.append(bg, fore);
    li.appendChild(wrap);
    inspectionsListMobile.appendChild(li);

    if (typeof addMobileSwipe === "function") {
      addMobileSwipe(
        li,
        fore,
        async () => await confirmAndDeleteInspection(row.id)
      );
    }
    // モバイル：資料リンク（画像）のクリックを横取りしてモーダル
    // モバイル：サムネ or フォールバックリンクのクリックでモーダル/新規タブ
    if (!window.__insp_mobile_modal_bound) {
      window.__insp_mobile_modal_bound = true;
      document
        .getElementById("inspectionsListMobile")
        .addEventListener("click", (e) => {
          // ① サムネがある場合（候補URLをdata属性に持つ）
          const thumb = e.target.closest("a.insp-mobile-thumb");
          if (thumb) {
            e.preventDefault();
            try {
              const raw = thumb.getAttribute("data-candidates") || "[]";
              const candidates = JSON.parse(decodeURIComponent(raw));
              window.__openInspectionImageModal(candidates, "画像プレビュー");
            } catch {
              // JSON壊れてたら最後の手としてhrefへ
              const href = thumb.getAttribute("href");
              if (href) window.open(href, "_blank", "noopener");
            }
            return;
          }

          // ② サムネが無い時のフォールバック（通常リンク）
          const a = e.target.closest("a.insp-mobile-link-fallback");
          if (a) {
            // そのまま別タブでOK
            return;
          }
        });
    }
  });
}

/* --- 削除（トースト確認 → Supabase削除） --- */
async function confirmAndDeleteInspection(id) {
  const action =
    typeof showDeleteToast === "function"
      ? await showDeleteToast()
      : confirm("このレコードを削除しますか？")
        ? "delete"
        : "cancel";

  if (action !== "delete") return false;

  try {
    const { error } = await supabase
      .from(INSPECTION_TABLE)
      .delete()
      .eq("id", id);
    if (error) throw error;
    fetchAndDisplayInspections();
    return true;
  } catch (e) {
    alert("削除エラー: " + e.message);
    return false;
  }
}
async function deleteInspection(id) {
  const ok = await confirmAndDeleteInspection(id);
  if (ok) fetchAndDisplayInspections();
}

/* --- Realtime（タスク一覧と同様） --- */
function subscribeInspectionsRealtime() {
  if (window.__inspectionsChannel) return;
  const channel = supabase
    .channel("inspections-realtime")
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: INSPECTION_TABLE },
      () => fetchAndDisplayInspections()
    )
    .subscribe();
  window.__inspectionsChannel = channel;
}

/* --- ソート --- */
window.sortInspections = function (column) {
  if (currentInspSortColumn === column)
    currentInspSortDir = currentInspSortDir === "asc" ? "desc" : "asc";
  else {
    currentInspSortColumn = column;
    currentInspSortDir = "asc";
  }

  inspectionsDataGlobal.sort((a, b) => {
    const va = a[column] ?? "";
    const vb = b[column] ?? "";
    return currentInspSortDir === "asc"
      ? String(va).localeCompare(String(vb))
      : String(vb).localeCompare(String(va));
  });

  renderInspections();
  updateInspectionSortIndicators(currentInspSortColumn, currentInspSortDir);
};

function updateInspectionSortIndicators(column, dir) {
  const thStore = document.getElementById("thInspStore");
  const thMonth = document.getElementById("thInspMonth");
  const thCat = document.getElementById("thInspCat");
  const thItem = document.getElementById("thInspItem");
  const thJudge = document.getElementById("thInspJudge");
  const thNote = document.getElementById("thInspNote");
  const thUrl = document.getElementById("thInspUrl");

  thStore.textContent = "店舗";
  thMonth.textContent = "月";
  thCat.textContent = "カテゴリ";
  thItem.textContent = "項目";
  thJudge.textContent = "判定";
  thNote.textContent = "特記事項";
  thUrl.textContent = "URL";

  if (!column) return;
  const arrow = dir === "asc" ? " ▲" : " ▼";
  if (column === "店舗名") thStore.textContent += arrow;
  if (column === "月値") thMonth.textContent += arrow;
  if (column === "カテゴリ値") thCat.textContent += arrow;
  if (column === "項目値") thItem.textContent += arrow;
  if (column === "判定値") thJudge.textContent += arrow;
  if (column === "特記事項値") thNote.textContent += arrow;
  if (column === "URL値") thUrl.textContent += arrow;
}



async function initInspectionFilters() {
  // 1) 店舗名の選択肢
  await initInspectionStoreDropdown();

  // 2) 月・カテゴリー・判定の選択肢
  const cols = INSPECTION_COLS;
  let selectClause = `${cols.month}, ${cols.category}, ${cols.judge}`;
  const { data, error } = await supabase
    .from(INSPECTION_TABLE)
    .select(selectClause);
  if (error) {
    console.error("臨店フィルタ候補取得エラー:", error);
    // 失敗時は最低限の「全件」だけ入れておく
    initSelectAllOnly(inspMonthSelect, "全て");
    initSelectAllOnly(inspCatSelect, "全て");
    initSelectAllOnly(inspJudgeSelect, "全て");
    return;
  }

  // 月（DB生値をvalue、ラベルはYYYY/MMに）
  const monthsRaw = Array.from(
    new Set(
      (data || [])
        .map((r) => r[cols.month])
        .filter(Boolean)
        .map((v) => String(v))
    )
  );
  // ★ yyyymmキーで昇順 → 後ろが最新
  monthsRaw.sort((a, b) => _monthToKey(a) - _monthToKey(b));
  inspMonthSelect.innerHTML = "";
  // ★ 「全ての月」は作らない
  monthsRaw.forEach((raw) =>
    addOption(inspMonthSelect, raw, normalizeMonth(raw))
  );
  // ★ 初期値：最新月
  const latestRaw = monthsRaw[monthsRaw.length - 1];
  if (latestRaw) {
    inspFilters.month = latestRaw; // ← DB生値でフィルタ保持
    inspMonthSelect.value = latestRaw; // ← UIにも反映
  }

  // カテゴリー
  const cats = Array.from(
    new Set(
      (data || [])
        .map((r) => r[cols.category])
        .filter(Boolean)
        .map((v) => String(v))
    )
  ).sort((a, b) => a.localeCompare(b, "ja"));
  inspCatSelect.innerHTML = "";
  addOption(inspCatSelect, "all", "全て");
  cats.forEach((c) => addOption(inspCatSelect, c, c));

  // 判定
  const judges = Array.from(
    new Set(
      (data || [])
        .map((r) => r[cols.judge])
        .filter(Boolean)
        .map((v) => String(v))
    )
  ).sort((a, b) => a.localeCompare(b, "ja"));
  inspJudgeSelect.innerHTML = "";
  addOption(inspJudgeSelect, "all", "全て");
  judges.forEach((j) => addOption(inspJudgeSelect, j, j));

  // 変更イベント
  // storeSelectInspection?.addEventListener("change", () => {
  //   inspFilters.store = storeSelectInspection.value || "all";
  //   fetchAndDisplayInspections(true);
  // });
  inspMonthSelect?.addEventListener("change", () => {
    inspFilters.month = inspMonthSelect.value;
    fetchAndDisplayInspections(true);
  });
  inspCatSelect?.addEventListener("change", () => {
    inspFilters.category = inspCatSelect.value || "all";
    fetchAndDisplayInspections(true);
  });
  inspJudgeSelect?.addEventListener("change", () => {
    inspFilters.judge = inspJudgeSelect.value || "all";
    fetchAndDisplayInspections(true);
  });
}

function initSelectAllOnly(selectEl, allLabel) {
  if (!selectEl) return;
  selectEl.innerHTML = "";
  addOption(selectEl, "all", allLabel);
}
function addOption(selectEl, value, label) {
  const o = document.createElement("option");
  o.value = value;
  o.textContent = label;
  selectEl.appendChild(o);
}

/**
 * URL配列から <div> を返す（表用）
 * - Drive: サムネ（<img>）＋クリックで別タブ
 * - 直リンク画像: 縮小サムネ
 * - それ以外: favicon＋ホスト名リンク
 */
// 既存の buildUrlPreviewNode をまるごと置き換え
// buildUrlPreviewNode をまるごと置換
function buildUrlPreviewNode(urls) {
  const wrap = document.createElement("div");
  wrap.className = "insp-url-wrap d-flex flex-wrap gap-2";

  urls.forEach((u) => {
    const id = _extractDriveId(u);
    if (id) {
      // Drive: サムネ表示 / クリックで モーダル(原寸→サムネHD→元URL の順に試す)
      const a = document.createElement("a");
      a.href = u;
      a.target = "_blank";
      a.rel = "noopener";
      a.className = "insp-url-thumb-link";
      a.addEventListener("click", (e) => {
        e.preventDefault();
        const candidates = [
          _driveDirectViewUrl(id), // 原寸（権限で失敗しがち）
          _driveThumbHdUrl(id), // HDサムネ（成功率高め）
          u, // 最後は元のDriveページを新規タブ
        ];
        window.__openInspectionImageModal(candidates, "Drive画像プレビュー");
      });

      const img = new Image();
      img.loading = "lazy";
      img.alt = "Driveプレビュー";
      img.src = _driveThumbUrl(id, 200);
      img.className = "insp-url-thumb";
      img.onerror = () => {
        // サムネ取得自体が失敗：通常リンク（faviconチップ）に変更
        a.replaceChildren();
        a.className = "insp-url-chip btn btn-sm btn-outline-secondary";
        try {
          const fav = _faviconUrl(u);
          const { hostname } = new URL(u);
          a.innerHTML = `${fav ? `<img class="insp-favicon" src="${fav}" alt="">` : ""
            } ${_escapeHtml(hostname)}`;
        } catch {
          a.textContent = "リンク";
        }
      };
      a.appendChild(img);
      wrap.appendChild(a);
      return;
    }

    if (_isImageUrl(u)) {
      // 直リンク画像：クリックでモーダル（失敗時は元URLを開く）
      const a = document.createElement("a");
      a.href = u;
      a.target = "_blank";
      a.rel = "noopener";
      a.className = "insp-url-thumb-link";
      a.addEventListener("click", (e) => {
        e.preventDefault();
        window.__openInspectionImageModal([u], "画像プレビュー");
      });

      const img = new Image();
      img.loading = "lazy";
      img.alt = "画像プレビュー";
      img.src = u;
      img.className = "insp-url-thumb";
      a.appendChild(img);
      wrap.appendChild(a);
      return;
    }

    // 画像以外：従来どおり外部タブで
    try {
      const fav = _faviconUrl(u);
      const { hostname } = new URL(u);
      const a = document.createElement("a");
      a.href = u;
      a.target = "_blank";
      a.rel = "noopener";
      a.className = "insp-url-chip btn btn-sm btn-outline-secondary";
      a.innerHTML = `${fav ? `<img class="insp-favicon" src="${fav}" alt="">` : ""
        } ${_escapeHtml(hostname)}`;
      wrap.appendChild(a);
    } catch {
      const a = document.createElement("a");
      a.href = u;
      a.target = "_blank";
      a.rel = "noopener";
      a.textContent = "リンク";
      wrap.appendChild(a);
    }
  });

  return wrap;
}

// ▼ モバイル用：URL配列からサムネ<a>を1つ生成（Drive/直リンク画像のみ）
function _buildMobileThumbHtml(urls) {
  const first = (urls || []).map((s) => s.trim()).filter(Boolean)[0];
  if (!first) return "";

  const id = _extractDriveId(first);
  let thumbSrc = "",
    candidates = [];

  if (id) {
    // Drive系：一覧は軽量サムネ、モーダルは原寸→HDサムネ→元URLの順で試行
    thumbSrc = _driveThumbUrl(id, 200);
    candidates = [_driveDirectViewUrl(id), _driveThumbHdUrl(id), first];
  } else if (_isImageUrl(first)) {
    // 直リンク画像
    thumbSrc = first;
    candidates = [first];
  } else {
    return ""; // 画像系でなければサムネ無し
  }

  const candAttr = encodeURIComponent(JSON.stringify(candidates));
  return `
    <a href="${_escapeHtml(first)}"
       class="insp-mobile-thumb"
       data-candidates='${candAttr}'
       aria-label="画像プレビュー">
      <img src="${_escapeHtml(
    thumbSrc
  )}" alt="プレビュー" class="insp-url-thumb">
    </a>`;
}

/* ちょっとしたCSS（任意・目安） */
(function addInspUrlStyles() {
  const css = `
    .insp-url-thumb { width: 80px; height: auto; border-radius: 8px; display:block; }
    .insp-url-wrap .insp-url-thumb-link { display:inline-block; line-height:0; }
    .insp-favicon { width: 16px; height:16px; vertical-align: -3px; margin-right: 4px; }
    .insp-url-chip { display:inline-flex; align-items:center; gap:6px; }
  `;
  const s = document.createElement("style");
  s.textContent = css;
  document.head.appendChild(s);
})();



/* ===== 画像モーダル（フォールバック付き） ===== */
(function setupInspectionImageModal() {
  function ensureModal() {
    if (document.getElementById("inspImageModalOverlay")) return;

    const overlay = document.createElement("div");
    overlay.id = "inspImageModalOverlay";
    overlay.setAttribute("aria-hidden", "true");
    overlay.style.cssText = `
      position: fixed; inset: 0; background: rgba(0,0,0,.55);
      display: none; align-items: center; justify-content: center;
      z-index: 2000; padding: 4vmin;
    `;

    const frame = document.createElement("div");
    frame.id = "inspImageModalFrame";
    frame.style.cssText = `
      position: relative; max-width: 92vw; max-height: 92vh;
      box-shadow: 0 10px 30px rgba(0,0,0,.4);
      border-radius: 12px; background: #000; padding: 0;
    `;

    const img = document.createElement("img");
    img.id = "inspImageModalImg";
    img.alt = "";
    img.style.cssText = `
      display: block; max-width: 92vw; max-height: 92vh;
      width: auto; height: auto; object-fit: contain; border-radius: 12px;
      cursor: zoom-out;
    `;

    const closeBtn = document.createElement("button");
    closeBtn.type = "button";
    closeBtn.title = "閉じる";
    closeBtn.style.cssText = `
      position:absolute; top:8px; right:8px; border:none; border-radius:999px;
      width:36px; height:36px; background: rgba(0,0,0,.6); color:#fff; font-size:20px; line-height:36px; cursor:pointer;
    `;
    closeBtn.innerHTML = "&times;";

    function hide() {
      overlay.style.display = "none";
      overlay.setAttribute("aria-hidden", "true");
      img.src = "";
      img.alt = "";
      img.removeAttribute("data-candidates");
      img.onerror = null;
    }

    closeBtn.addEventListener("click", hide);
    overlay.addEventListener("click", (e) => {
      if (e.target === overlay) hide();
    });
    img.addEventListener("click", hide);
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && overlay.style.display !== "none") hide();
    });

    frame.append(img, closeBtn);
    overlay.appendChild(frame);
    document.body.appendChild(overlay);
  }

  // 指定された候補URLを順に試す
  function loadWithFallback(imgEl, urls, onFailLast) {
    let i = 0;
    const tryNext = () => {
      if (i >= urls.length) {
        onFailLast?.();
        return;
      }
      const url = urls[i++];
      imgEl.onerror = tryNext;
      imgEl.src = url;
    };
    tryNext();
  }

  // 公開API：候補URL配列で開く
  window.__openInspectionImageModal = function (candidates, altText = "") {
    ensureModal();
    const overlay = document.getElementById("inspImageModalOverlay");
    const img = document.getElementById("inspImageModalImg");
    img.alt = altText;
    overlay.style.display = "flex";
    overlay.setAttribute("aria-hidden", "false");

    // ロード失敗が全てだった場合は、静かに閉じて元リンクを開く（最後の候補を使う）
    loadWithFallback(img, candidates.filter(Boolean), () => {
      overlay.style.display = "none";
      overlay.setAttribute("aria-hidden", "true");
      const last = candidates[candidates.length - 1];
      if (last) window.open(last, "_blank", "noopener");
    });
  };
})();

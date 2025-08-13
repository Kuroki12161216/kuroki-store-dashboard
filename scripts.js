// scripts.js (type="module")

import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm";

/* ===== Supabase設定 ===== */
const SUPABASE_URL = "https://djgylzypyunbcetvquom.supabase.co";
const SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRqZ3lsenlweXVuYmNldHZxdW9tIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDA4MTk3MjgsImV4cCI6MjA1NjM5NTcyOH0.tRwiVkMiCIvONpjyAJAt3FZ2iUIy6ihaAiHMtZ3bFI0";
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

/* ===== DOM参照 ===== */
const diagnosticSection = document.getElementById("diagnosticSection");
const taskSection = document.getElementById("taskSection");

const storeSelect = document.getElementById("storeSelect");
const monthSelect = document.getElementById("monthSelect");
const diagnosticsCardContainer = document.getElementById("diagnosticsCardContainer");

const storeSelectTask = document.getElementById("storeSelectTask");
const tasksTableBody = document.querySelector("#tasksTable tbody");

const taskAddStoreSelect = document.getElementById("taskAddStoreSelect");
const taskAddItemInput = document.getElementById("taskAddItemInput");
const taskAddDetailInput = document.getElementById("taskAddDetailInput");
const taskAddDueInput = document.getElementById("taskAddDueInput");
const taskAddOwnerInput = document.getElementById("taskAddOwnerInput");

const modalDiagnosticId = document.getElementById("modalDiagnosticId");
const modalHypothesisInput = document.getElementById("modalHypothesisInput");
const modalNextActionInput = document.getElementById("modalNextActionInput");
const modalTaskItem = document.getElementById("modalTaskItem");
const modalTaskDetail = document.getElementById("modalTaskDetail");
const modalTaskDue = document.getElementById("modalTaskDue");
const modalTaskOwner = document.getElementById("modalTaskOwner");

/* ===== 状態 ===== */
let tasksDataGlobal = [];
let currentSortColumn = null;
let currentSortDir = "asc";
let bootstrapModal = null;

// いま開いているスワイプ行（他を閉じるため）
let openSwipeContent = null;

/* ===== 初期化 ===== */
window.addEventListener("DOMContentLoaded", async () => {
  await initStoreDropdowns();
  await initMonthDropdown();
  await fetchAndDisplayDiagnostics();
  await fetchAndDisplayTasks();
  subscribeTasksRealtime();
  applyResponsiveTasksUI(); // 初回適用
});
window.addEventListener("resize", applyResponsiveTasksUI);

/* ===== 画面切替 ===== */
window.showDiagnosticSection = function () {
  diagnosticSection.style.display = 'block';
  taskSection.style.display = 'none';
  document.getElementById('settingsSection').style.display = 'none';
};
window.showTaskSection = function () {
  diagnosticSection.style.display = 'none';
  taskSection.style.display = 'block';
  document.getElementById('settingsSection').style.display = 'none';
  applyResponsiveTasksUI();
};
window.showSettingsSection = function () {
  diagnosticSection.style.display = 'none';
  taskSection.style.display = 'none';
  document.getElementById('settingsSection').style.display = 'block';
};
window.closeOffcanvas = function () {
  const el = document.getElementById('offcanvasNavbar');
  if (!el) return;
  const inst = bootstrap.Offcanvas.getInstance(el);
  if (inst) inst.hide();
};

/* ===== Service Worker ===== */
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('service_worker.js').catch(console.error);
}

/* ===== 通知UI ===== */
const $notifBadge = document.getElementById('notificationStatus');
window.requestNotificationPermission = async function () {
  try {
    if (!('Notification' in window)) return alert('このブラウザは通知に対応していません。');
    await Notification.requestPermission();
    updateNotificationUI();
  } catch (e) { console.error(e); }
};
function updateNotificationUI() {
  if (!$notifBadge) return;
  const perm = (Notification && Notification.permission) ? Notification.permission : 'default';
  $notifBadge.classList.remove('badge-perm-default', 'badge-perm-granted', 'badge-perm-denied');
  if (perm === 'granted') { $notifBadge.textContent = '許可'; $notifBadge.classList.add('badge-perm-granted'); }
  else if (perm === 'denied') { $notifBadge.textContent = '拒否'; $notifBadge.classList.add('badge-perm-denied'); }
  else { $notifBadge.textContent = '未許可'; $notifBadge.classList.add('badge-perm-default'); }
}
updateNotificationUI();

/* ===== CSV D&D ===== */
export function handleDragEnter(e){ e.preventDefault(); }
export function handleDragOver(e){ e.preventDefault(); }
export async function handleDrop(e){
  e.preventDefault();
  const file = e.dataTransfer?.files?.[0];
  if (!file) return;
  if (!file.name.endsWith('.csv')) return alert('CSVファイルをドロップしてください。');
  try {
    const records = await parseCsvFile(file);
    await insertDiagnostics(records);
    alert('CSVデータをアップロードしました。');
  } catch (err) {
    console.error(err);
    alert('CSV処理に失敗しました。');
  }
}
window.handleDragEnter = handleDragEnter;
window.handleDragOver = handleDragOver;
window.handleDrop = handleDrop;

/* ===== 店舗/月 初期化 ===== */
async function initStoreDropdowns() {
  const { data, error } = await supabase.from("店舗診断表").select("店舗名");
  if (error) { console.error("店舗一覧取得エラー:", error); return; }
  const storeNames = [...new Set(data.map((item) => item.店舗名))];

  storeNames.forEach((name) => {
    const opt = document.createElement("option");
    opt.value = name; opt.textContent = name;
    storeSelect.appendChild(opt);
  });

  if (!storeSelectTask.querySelector('option[value="all"]')) {
    const allOpt = document.createElement("option");
    allOpt.value = "all"; allOpt.textContent = "全店舗";
    storeSelectTask.appendChild(allOpt);
  }
  storeNames.forEach((name) => {
    const opt = document.createElement("option");
    opt.value = name; opt.textContent = name;
    storeSelectTask.appendChild(opt);
  });

  storeNames.forEach((name) => {
    const opt = document.createElement("option");
    opt.value = name; opt.textContent = name;
    taskAddStoreSelect.appendChild(opt);
  });
}

async function initMonthDropdown() {
  const { data, error } = await supabase.from("店舗診断表").select("月");
  if (error) { console.error("月一覧取得エラー:", error); return; }
  const distinctMonths = [...new Set(data.map((item) => item.月))];
  distinctMonths.forEach((m) => {
    const opt = document.createElement("option");
    opt.value = m; opt.textContent = m;
    monthSelect.appendChild(opt);
  });
}

/* ===== 診断表 ===== */
window.fetchAndDisplayDiagnostics = async function () {
  const selectedStore = storeSelect.value;
  const selectedMonth = monthSelect.value;

  let query = supabase.from("店舗診断表").select("*").order("id", { ascending: true });
  if (selectedStore && selectedStore !== "all") query = query.eq("店舗名", selectedStore);
  if (selectedMonth && selectedMonth !== "all") query = query.eq("月", selectedMonth);

  const { data, error } = await query;
  if (error) { console.error("店舗診断表取得エラー:", error); return; }

  diagnosticsCardContainer.innerHTML = "";
  data.forEach((row) => {
    const colDiv = document.createElement("div");
    colDiv.className = "col";

    const cardDiv = document.createElement("div");
    cardDiv.className = "card h-100 shadow-sm";
    cardDiv.onclick = () => openDiagnosticModal(row);

    const body = document.createElement("div");
    body.className = "card-body";

    const title = document.createElement("h5");
    title.className = "card-title";
    title.textContent = row.項目 || "(項目なし)";

    const diff = document.createElement("span");
    diff.style.fontWeight = "bold";
    if (row.差異 === "〇") { diff.style.color = "red"; diff.textContent = " 〇"; }
    else { diff.style.color = "black"; diff.textContent = " ×"; }
    title.appendChild(diff);

    const diffP = document.createElement("p");
    diffP.className = "card-text";
    diffP.textContent = `目標: ${row.目標数値}, 実績: ${row.実績}`;

    const hypoP = createTruncatedParagraph("仮説", row.仮説 || "", 50);
    const actionP = createTruncatedParagraph("ネクスト", row.ネクストアクション || "", 50);

    body.appendChild(title);
    body.appendChild(diffP);
    body.appendChild(hypoP);
    body.appendChild(actionP);
    cardDiv.appendChild(body);
    colDiv.appendChild(cardDiv);
    diagnosticsCardContainer.appendChild(colDiv);
  });
};

function createTruncatedParagraph(label, fullText, limit = 60) {
  const p = document.createElement("p");
  p.className = "card-text";
  if (!fullText) { p.textContent = `${label}: `; return p; }
  if (fullText.length <= limit) { p.textContent = `${label}: ${fullText}`; return p; }
  const truncated = fullText.substring(0, limit);
  p.innerHTML = `
    <span class="fw-bold">${label}:</span>
    <span class="js-short-text">${truncated}...</span>
    <button type="button" class="btn btn-sm btn-outline-primary toggle-btn"
      onclick="event.stopPropagation(); expandText(this, '${encodeURIComponent(fullText)}', '${label}')">
      もっと読む
    </button>`;
  return p;
}
window.expandText = function (btn, encodedFullText, label) {
  const fullText = decodeURIComponent(encodedFullText);
  const p = btn.parentElement;
  p.innerHTML = `
    <span class="fw-bold">${label}:</span>
    <span class="js-full-text">${fullText}</span>
    <button type="button" class="btn btn-sm btn-outline-danger toggle-btn"
      onclick="event.stopPropagation(); collapseText(this, '${encodeURIComponent(fullText)}', '${label}')">
      閉じる
    </button>`;
};
window.collapseText = function (btn, encodedFullText, label) {
  const fullText = decodeURIComponent(encodedFullText);
  const truncated = fullText.substring(0, 60);
  const p = btn.parentElement;
  p.innerHTML = `
    <span class="fw-bold">${label}:</span>
    <span class="js-short-text">${truncated}...</span>
    <button type="button" class="btn btn-sm btn-outline-primary toggle-btn"
      onclick="event.stopPropagation(); expandText(this, '${encodeURIComponent(fullText)}', '${label}')">
      もっと読む
    </button>`;
};

function openDiagnosticModal(row) {
  if (!bootstrapModal) {
    bootstrapModal = new bootstrap.Modal(document.getElementById("diagnosticModal"), {});
  }
  modalDiagnosticId.value = row.id;
  modalHypothesisInput.value = row.仮説 || "";
  modalNextActionInput.value = row.ネクストアクション || "";
  modalTaskItem.value = "";
  modalTaskDetail.value = "";
  modalTaskDue.value = "";
  modalTaskOwner.value = "";
  bootstrapModal.show();
}

window.updateDiagnostic = async function () {
  const id = modalDiagnosticId.value;
  const hypothesisValue = modalHypothesisInput.value;
  const nextActionValue = modalNextActionInput.value;
  if (!id) return alert("IDが取得できませんでした");
  const { error } = await supabase.from("店舗診断表").update({
    仮説: hypothesisValue, ネクストアクション: nextActionValue
  }).eq("id", id);
  if (error) alert("更新エラー:" + error.message);
  else { alert("仮説・ネクストアクションを更新しました"); fetchAndDisplayDiagnostics(); }
};

/* ===== タスク：追加/取得/描画 ===== */
window.addTaskFromModal = async function () {
  const diagId = modalDiagnosticId.value;
  const item = modalTaskItem.value;
  const taskDetail = modalTaskDetail.value;
  const dueDate = modalTaskDue.value;
  const owner = modalTaskOwner.value;
  if (!diagId) return alert("診断表IDが存在しません");
  if (!item || !taskDetail) return alert("「項目」「タスク」は必須です");

  const { error } = await supabase.from("タスクテーブル").insert([{
    項目: item, タスク: taskDetail, 期限: dueDate, 責任者: owner, 店舗診断表_id: diagId,
  }]);
  if (error) alert("タスク追加エラー:" + error.message);
  else { alert("タスクを追加しました"); fetchAndDisplayTasks(); }
};

window.addTaskFromList = async function () {
  const storeName = taskAddStoreSelect.value;
  const item = taskAddItemInput.value;
  const detail = taskAddDetailInput.value;
  const due = taskAddDueInput.value;
  const owner = taskAddOwnerInput.value;

  if (!storeName || !item || !detail) return alert("店舗名、項目、タスクは必須です");

  // 期限から診断月（前月 yyyymm）を算出
  const dueDate = new Date(due);
  const dueHumanMonth = dueDate.getMonth() + 1;
  let diagnosticYear = dueDate.getFullYear();
  let diagnosticMonth = (dueHumanMonth === 1) ? (diagnosticYear--, 12) : (dueHumanMonth - 1);
  const diagnosticMonthStr = String(diagnosticMonth).padStart(2, '0');
  const diagnosticDataMonth = `${diagnosticYear}${diagnosticMonthStr}`;

  const { data: diagData, error: diagError } = await supabase
    .from("店舗診断表").select("id")
    .eq("店舗名", storeName).eq("項目", item).eq("月", diagnosticDataMonth);
  if (diagError) return console.error("店舗診断表検索エラー:", diagError);
  if (!diagData?.length) return alert("対応する店舗診断表が見つかりません");

  const diagId = diagData[diagData.length - 1].id;

  const { error: insertError } = await supabase.from("タスクテーブル").insert([{
    項目: item, タスク: detail, 期限: due, 責任者: owner, 店舗診断表_id: diagId,
  }]);
  if (insertError) alert("タスク追加エラー:" + insertError.message);
  else {
    alert("タスクを追加しました");
    taskAddItemInput.value = "";
    taskAddDetailInput.value = "";
    taskAddDueInput.value = "";
    taskAddOwnerInput.value = "";
    fetchAndDisplayTasks();
  }
};

window.fetchAndDisplayTasks = async function () {
  const selectedStore = storeSelectTask.value;
  let query = supabase.from("タスクテーブル").select("*");

  if (selectedStore !== "all") {
    const { data: diagData, error: diagError } = await supabase
      .from("店舗診断表").select("id, 店舗名");
    if (diagError) { console.error("店舗診断表取得エラー:", diagError); return; }
    const matchedIds = diagData.filter(d => d.店舗名 === selectedStore).map(d => d.id);
    if (!matchedIds.length) { tasksDataGlobal = []; renderTasks(); return; }
    query = query.in("店舗診断表_id", matchedIds);
  }

  const { data: result, error } = await query;
  if (error) { console.error("タスク一覧取得エラー:", error); return; }

  const diagIds = result.map(r => r.店舗診断表_id);
  let storeMap = {};
  if (diagIds.length) {
    const { data: diag, error: dErr } = await supabase
      .from("店舗診断表").select("id, 店舗名").in("id", diagIds);
    if (!dErr) diag.forEach(d => { storeMap[d.id] = d.店舗名; });
  }
  tasksDataGlobal = result.map(r => ({ ...r, 店舗名: storeMap[r.店舗診断表_id] || "" }));

  renderTasks();
  updateSortIndicators(null, null);
};

function renderTasks() {
  tasksTableBody.innerHTML = "";
  let overdueCount = 0;

  tasksDataGlobal.forEach((row) => {
    const tr = document.createElement("tr");
    tr.dataset.taskId = row.id;

    // 期限 → ISO正規化 + 表示=mm月dd日
    const iso = parseToISO(row.期限);
    const jp = iso ? isoToJPMonthDay(iso) : (row.期限 || "");

    if (iso && new Date(iso) < todayMidnight()) {
      tr.classList.add("table-danger");
      overdueCount++;
    }

    const storeTd = document.createElement("td"); storeTd.textContent = row.店舗名 || "";
    const itemTd  = document.createElement("td"); itemTd.textContent  = row.項目 || "";
    const taskTd  = document.createElement("td"); taskTd.textContent  = row.タスク || "";
    const dueTd   = document.createElement("td"); dueTd.textContent   = jp; if (iso) dueTd.dataset.iso = iso;
    const ownerTd = document.createElement("td"); ownerTd.textContent = row.責任者 || "";

    const operationTd = document.createElement("td");
    const delBtn = document.createElement("button");
    delBtn.textContent = "削除";
    delBtn.className = "btn btn-danger btn-sm btn-delete";
    delBtn.onclick = () => deleteTask(row.id);
    operationTd.appendChild(delBtn);

    tr.appendChild(storeTd);
    tr.appendChild(itemTd);
    tr.appendChild(taskTd);
    tr.appendChild(dueTd);
    tr.appendChild(ownerTd);
    tr.appendChild(operationTd);

    // === ここからモバイル用スワイプセル ===
    const mobileTd = document.createElement('td');
    mobileTd.className = 'd-lg-none mobile-swipe-cell';
    mobileTd.colSpan = 6;
    mobileTd.innerHTML = buildMobileSwipeHTML({
      store: row.店舗名 || "-", item: row.項目 || "-",
      task: row.タスク || "(タスク未設定)", due: jp || "—", owner: row.責任者 || "—"
    });
    tr.appendChild(mobileTd);
    setupSwipeRow(mobileTd.querySelector('.swipe-content')); // Pointer Events 付与

    tasksTableBody.appendChild(tr);
  });

  updateOverdueBadge(overdueCount);
  applyResponsiveTasksUI();
}

async function deleteTask(id) {
  if (!confirm("このタスクを削除しますか？")) return;
  const { error } = await supabase.from("タスクテーブル").delete().eq("id", id);
  if (error) alert("削除エラー:" + error.message);
  else { alert("削除しました"); fetchAndDisplayTasks(); }
}

/* ===== Realtime ===== */
function subscribeTasksRealtime() {
  if (window.__tasksChannel) return;
  const channel = supabase.channel('tasks-realtime')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'タスクテーブル' },
      () => fetchAndDisplayTasks()
    ).subscribe();
  window.__tasksChannel = channel;
}

/* ===== ソート（期限はISOで） ===== */
window.sortTasks = function (column) {
  if (currentSortColumn === column) currentSortDir = (currentSortDir === "asc" ? "desc" : "asc");
  else { currentSortColumn = column; currentSortDir = "asc"; }

  tasksDataGlobal.sort((a, b) => {
    let va = a[column] ?? "";
    let vb = b[column] ?? "";
    if (column === "期限") {
      va = parseToISO(va) || "";
      vb = parseToISO(vb) || "";
    }
    return currentSortDir === "asc"
      ? String(va).localeCompare(String(vb))
      : String(vb).localeCompare(String(va));
  });

  renderTasks();
  updateSortIndicators(currentSortColumn, currentSortDir);
};

function updateSortIndicators(column, dir) {
  const thStore = document.getElementById("thStore");
  const thItem  = document.getElementById("thItem");
  const thTask  = document.getElementById("thTask");
  const thDue   = document.getElementById("thDue");
  const thOwner = document.getElementById("thOwner");
  thStore.textContent = "店舗";
  thItem.textContent  = "項目";
  thTask.textContent  = "タスク";
  thDue.textContent   = "期限";
  thOwner.textContent = "責任者";
  if (!column) return;
  const arrow = dir === "asc" ? " ▲" : " ▼";
  if (column === "店舗名") thStore.textContent += arrow;
  if (column === "項目")    thItem.textContent  += arrow;
  if (column === "タスク")  thTask.textContent  += arrow;
  if (column === "期限")    thDue.textContent   += arrow;
  if (column === "責任者")  thOwner.textContent += arrow;
}

/* ===== CSV パース & upsert ===== */
export function parseCsvFile(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const lines = String(e.target.result).split(/\r?\n/);
        lines.shift(); // header
        const results = [];
        for (const line of lines) {
          if (!line.trim()) continue;
          const cols = line.split(',');
          if (cols.length < 6) continue;
          const [storeName, month, item, targetValue, actualValue, diffValue] = cols.map(s => s.trim());
          results.push({
            '店舗名': storeName, '月': month, '項目': item,
            '目標数値': targetValue === '' ? null : Number(targetValue),
            '実績': actualValue === '' ? null : Number(actualValue),
            '差異': diffValue
          });
        }
        resolve(results);
      } catch (err) { reject(err); }
    };
    reader.onerror = reject;
    reader.readAsText(file);
  });
}

export async function insertDiagnostics(records) {
  if (!Array.isArray(records) || !records.length) return;
  const normalized = records.filter(r => r['店舗名'] && r['月'] && r['項目']);
  const CHUNK = 500;
  for (let i = 0; i < normalized.length; i += CHUNK) {
    const chunk = normalized.slice(i, i + CHUNK);
    const { error } = await supabase.from('店舗診断表').upsert(chunk, {
      onConflict: '店舗名,月,項目', ignoreDuplicates: false, defaultToNull: true
    });
    if (error) { console.error('upsert失敗:', error); throw error; }
  }
}

/* ===== Utils ===== */
function todayMidnight() { const d = new Date(); d.setHours(0,0,0,0); return d; }
function parseToISO(s) {
  if (!s) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const m = String(s).match(/^(\d{4})[\/\-年](\d{1,2})[\/\-月](\d{1,2})/);
  if (m) {
    const y = m[1].padStart(4,'0');
    const mo = m[2].padStart(2,'0');
    const d = m[3].padStart(2,'0');
    return `${y}-${mo}-${d}`;
  }
  const dt = new Date(s);
  if (!isNaN(dt)) {
    const y = dt.getFullYear();
    const mo = String(dt.getMonth()+1).padStart(2,'0');
    const da = String(dt.getDate()).padStart(2,'0');
    return `${y}-${mo}-${da}`;
  }
  return null;
}
function isoToJPMonthDay(iso) { const [, mo, da] = iso.split('-'); return `${mo}月${da}日`; }
function escapeHTML(s) {
  return String(s).replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
}

/* ===== レスポンシブ（列の表示/非表示だけ） ===== */
function applyResponsiveTasksUI() {
  const isMobile = window.innerWidth < 992;
  // ここでは列の表示切替のみ。スワイプ行はrender時に必ず生成しているためOK
  const rows = Array.from(tasksTableBody.querySelectorAll('tr'));
  rows.forEach(tr => {
    const tds = tr.querySelectorAll('td');
    if (tds.length < 7) return; // 6列 + 1モバイルセル
    if (isMobile) {
      [0,1,5].forEach(i => tds[i]?.classList.add('d-none','d-lg-table-cell')); // 店舗/項目/操作
    } else {
      [0,1,5].forEach(i => tds[i]?.classList.remove('d-none','d-lg-table-cell'));
      // PCに戻ったら開いていたスワイプを閉じる
      const content = tr.querySelector('.swipe-content');
      if (content) content.style.transform = 'translateX(0)';
      if (openSwipeContent === tr.querySelector('.swipe-content')) openSwipeContent = null;
    }
  });
}

/* ===== スワイプUI（Pointer Events版） ===== */
function buildMobileSwipeHTML({ store, item, task, due, owner }) {
  return `
    <div class="swipe-row">
      <!-- 右スワイプ（削除） -->
      <div class="swipe-reveal-left">
        <button type="button" class="btn btn-danger btn-sm btn-mobile-delete">削除</button>
      </div>

      <!-- 左スワイプ（店舗/項目） -->
      <div class="swipe-reveal-right">
        <div class="small">
          <div><span class="swipe-label">店舗</span>${escapeHTML(store || '-')}</div>
          <div><span class="swipe-label">項目</span>${escapeHTML(item  || '-')}</div>
        </div>
      </div>

      <!-- 通常表示 -->
      <div class="swipe-content">
        <div class="fw-bold">${escapeHTML(task)}</div>
        <div class="swipe-meta">
          <div><span class="swipe-label">期限</span>${escapeHTML(due)}</div>
          <div><span class="swipe-label">責任者</span>${escapeHTML(owner)}</div>
        </div>
      </div>
    </div>`;
}

/**
 * 1行分のスワイプをセットアップ（pointer系で安定動作）
 * - 右スワイプ: +X → 削除（左側パネル）を露出
 * - 左スワイプ: -X → 店舗/項目（右側パネル）を露出
 */
function setupSwipeRow(contentEl) {
  const LEFT_WIDTH  = 120; // 右スワイプで露出（削除）
  const RIGHT_WIDTH = 220; // 左スワイプで露出（店舗/項目）

  let startX = 0;
  let currentX = 0;
  let dragging = false;
  let lockedAxis = null; // 'x' or 'y'（縦スクロールと競合しないように）

  const clamp = (x) => Math.max(-RIGHT_WIDTH, Math.min(LEFT_WIDTH, x));

  const onPointerDown = (e) => {
    // 他行が開いていたら閉じる
    if (openSwipeContent && openSwipeContent !== contentEl) {
      openSwipeContent.style.transform = 'translateX(0)';
      openSwipeContent = null;
    }
    contentEl.setPointerCapture?.(e.pointerId);
    startX = e.clientX;
    currentX = 0;
    dragging = true;
    lockedAxis = null;
    contentEl.style.transition = 'none';
  };

  const onPointerMove = (e) => {
    if (!dragging) return;
    const dx = e.clientX - startX;
    // 軸ロック（最初の移動で判定）
    if (!lockedAxis) {
      if (Math.abs(dx) > 6) lockedAxis = 'x';
      else return; // まだ判定しない
    }
    if (lockedAxis !== 'x') return;

    currentX = clamp(dx);
    contentEl.style.transform = `translateX(${currentX}px)`;
  };

  const snap = () => {
    // スナップ位置決定
    if (currentX > LEFT_WIDTH * 0.5) {
      currentX = LEFT_WIDTH;         // 右にスナップ（削除表示）
      openSwipeContent = contentEl;
    } else if (currentX < -RIGHT_WIDTH * 0.5) {
      currentX = -RIGHT_WIDTH;       // 左にスナップ（店舗/項目表示）
      openSwipeContent = contentEl;
    } else {
      currentX = 0;                  // 戻す
      if (openSwipeContent === contentEl) openSwipeContent = null;
    }
    contentEl.style.transition = '';
    contentEl.style.transform = `translateX(${currentX}px)`;
  };

  const onPointerUp = (e) => {
    if (!dragging) return;
    dragging = false;
    contentEl.releasePointerCapture?.(e.pointerId);
    snap();
  };
  const onPointerCancel = onPointerUp;

  contentEl.addEventListener('pointerdown', onPointerDown);
  contentEl.addEventListener('pointermove', onPointerMove);
  contentEl.addEventListener('pointerup', onPointerUp);
  contentEl.addEventListener('pointercancel', onPointerCancel);

  // 右側（削除）ボタン
  contentEl.parentElement.querySelector('.btn-mobile-delete')?.addEventListener('click', (e) => {
    e.stopPropagation();
    const tr = contentEl.closest('tr');
    const id = tr?.dataset?.taskId;
    if (id) deleteTask(id);
  });

  // タップで閉じる
  contentEl.addEventListener('click', () => {
    if (openSwipeContent === contentEl) {
      openSwipeContent.style.transform = 'translateX(0)';
      openSwipeContent = null;
    }
  });
}

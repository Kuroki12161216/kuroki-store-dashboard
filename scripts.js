// scripts.js (type="module")

import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm";

/* ===== Supabase設定 ===== */
const SUPABASE_URL = "https://djgylzypyunbcetvquom.supabase.co";
const SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRqZ3lsenlweXVuYmNldHZxdW9tIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDA4MTk3MjgsImV4cCI6MjA1NjM5NTcyOH0.tRwiVkMiCIvONpjyAJAt3FZ2iUIy6ihaAiHMtZ3bFI0";
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

/* ===== DOM ===== */
const diagnosticSection = document.getElementById("diagnosticSection");
const taskSection = document.getElementById("taskSection");

const storeSelect = document.getElementById("storeSelect");
const monthSelect = document.getElementById("monthSelect");
const diagnosticsCardContainer = document.getElementById("diagnosticsCardContainer");

const storeSelectTask = document.getElementById("storeSelectTask");
const tasksTableBody = document.querySelector("#tasksTable tbody");
const tasksListMobile = document.getElementById("tasksListMobile");

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

/* ===== 初期化 ===== */
window.addEventListener("DOMContentLoaded", async () => {
  await initStoreDropdowns();
  await initMonthDropdown();
  await fetchAndDisplayDiagnostics();
  await fetchAndDisplayTasks();
  subscribeTasksRealtime();
});

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

    const body = document.createElement("div"); body.className = "card-body";
    const title = document.createElement("h5"); title.className = "card-title"; title.textContent = row.項目 || "(項目なし)";

    const diff = document.createElement("span"); diff.style.fontWeight = "bold";
    if (row.差異 === "〇") { diff.style.color = "red"; diff.textContent = " 〇"; }
    else { diff.style.color = "black"; diff.textContent = " ×"; }
    title.appendChild(diff);

    const diffP = document.createElement("p"); diffP.className = "card-text";
    diffP.textContent = `目標: ${row.目標数値}, 実績: ${row.実績}`;

    const hypoP = createTruncatedParagraph("仮説", row.仮説 || "", 50);
    const actionP = createTruncatedParagraph("ネクスト", row.ネクストアクション || "", 50);

    body.append(title, diffP, hypoP, actionP);
    cardDiv.appendChild(body); colDiv.appendChild(cardDiv);
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
  if (!bootstrapModal) bootstrapModal = new bootstrap.Modal(document.getElementById("diagnosticModal"), {});
  modalDiagnosticId.value = row.id;
  modalHypothesisInput.value = row.仮説 || "";
  modalNextActionInput.value = row.ネクストアクション || "";
  modalTaskItem.value = ""; modalTaskDetail.value = ""; modalTaskDue.value = ""; modalTaskOwner.value = "";
  bootstrapModal.show();
}

window.updateDiagnostic = async function () {
  const id = modalDiagnosticId.value;
  const hypothesisValue = modalHypothesisInput.value;
  const nextActionValue = modalNextActionInput.value;
  if (!id) return alert("IDが取得できませんでした");
  const { error } = await supabase.from("店舗診断表")
    .update({ 仮説: hypothesisValue, ネクストアクション: nextActionValue })
    .eq("id", id);
  if (error) alert("更新エラー:" + error.message);
  else { alert("仮説・ネクストアクションを更新しました"); fetchAndDisplayDiagnostics(); }
};

/* ===== タスク ===== */
window.addTaskFromModal = async function () {
  const diagId = modalDiagnosticId.value;
  const item = modalTaskItem.value;
  const taskDetail = modalTaskDetail.value;
  const dueDate = modalTaskDue.value;
  const owner = modalTaskOwner.value;
  if (!diagId) return alert("診断表IDが存在しません");
  if (!item || !taskDetail) return alert("「項目」「タスク」は必須です");

  const { error } = await supabase.from("タスクテーブル").insert([
    { 項目: item, タスク: taskDetail, 期限: dueDate, 責任者: owner, 店舗診断表_id: diagId }
  ]);
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

  // 前月 yyyymm
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

  const { error: insertError } = await supabase.from("タスクテーブル").insert([
    { 項目: item, タスク: detail, 期限: due, 責任者: owner, 店舗診断表_id: diagId }
  ]);
  if (insertError) alert("タスク追加エラー:" + insertError.message);
  else {
    alert("タスクを追加しました");
    taskAddItemInput.value = ""; taskAddDetailInput.value = ""; taskAddDueInput.value = ""; taskAddOwnerInput.value = "";
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
  // PC: テーブル
  tasksTableBody.innerHTML = "";
  // Mobile: list
  tasksListMobile.innerHTML = "";

  let overdueCount = 0;
  tasksDataGlobal.forEach((row) => {
    // ---------- PC テーブル行 ----------
    const tr = document.createElement("tr");
    tr.dataset.taskId = row.id;

    const iso = parseToISO(row.期限);
    const jp = iso ? isoToJPMonthDay(iso) : (row.期限 || "");
    if (iso && new Date(iso) < todayMidnight()) { tr.classList.add("table-danger"); overdueCount++; }

    const storeTd = document.createElement("td"); storeTd.textContent = row.店舗名 || "";
    const itemTd  = document.createElement("td"); itemTd.textContent  = row.項目 || "";
    const taskTd  = document.createElement("td"); taskTd.textContent  = row.タスク || "";
    const dueTd   = document.createElement("td"); dueTd.textContent   = jp; if (iso) dueTd.dataset.iso = iso;
    const ownerTd = document.createElement("td"); ownerTd.textContent = row.責任者 || "";

    const operationTd = document.createElement("td");
    const delBtn = document.createElement("button");
    delBtn.textContent = "削除";
    delBtn.className = "btn btn-danger btn-sm";
    delBtn.onclick = () => deleteTask(row.id);
    operationTd.appendChild(delBtn);

    tr.append(storeTd, itemTd, taskTd, dueTd, ownerTd, operationTd);
    tasksTableBody.appendChild(tr);

    // ---------- モバイル list-group アイテム ----------
    const li = document.createElement("div");
    li.className = "list-group-item p-0";

    const bg = document.createElement("div");
    bg.className = "lg-swipe-bg";
    bg.innerHTML = `<span class="fw-bold text-danger-emphasis"><i class="bi bi-trash3 me-1"></i>左へスワイプで削除</span>`;

    const fore = document.createElement("div");
    fore.className = "lg-swipe-fore p-3";
    fore.innerHTML = `
      <div class="d-flex justify-content-between align-items-start">
        <div class="pe-3">
          <div class="fw-semibold text-truncate-2">${escapeHTML(row.タスク || "(タスク未設定)")}</div>
          <div class="small text-muted mt-1">
            <span class="me-3"><i class="bi bi-shop"></i> ${escapeHTML(row.店舗名 || "-")}</span>
            <span class="me-3"><i class="bi bi-list-task"></i> ${escapeHTML(row.項目 || "-")}</span>
            <span><i class="bi bi-person"></i> ${escapeHTML(row.責任者 || "-")}</span>
          </div>
        </div>
        <span class="badge rounded-pill ${iso && new Date(iso) < todayMidnight() ? 'text-bg-danger' : 'text-bg-light text-body border'}">
          <i class="bi bi-calendar-event"></i> ${escapeHTML(jp || "—")}
        </span>
      </div>
    `;

    const wrap = document.createElement("div");
    wrap.className = "lg-swipe-wrap";
    wrap.append(bg, fore);
    li.appendChild(wrap);
    tasksListMobile.appendChild(li);

    addMobileSwipe(li, fore, async () => {
      return await confirmAndDelete(row.id); // true=削除実行 / false=取り消し
    });
  });

  updateOverdueBadge(overdueCount);
}

/* ===== モバイル スワイプ（左で削除） ===== */
function addMobileSwipe(container, foreEl, onConfirmDelete) {
  const THRESHOLD = 96;
  let startX = 0, dx = 0, dragging = false;

  const getX = (e) => e.touches ? e.touches[0].clientX : e.clientX;

  const onStart = (e) => { dragging = true; startX = getX(e); dx = 0; foreEl.style.transition = 'none'; };
  const onMove  = (e) => {
    if (!dragging) return;
    dx = Math.min(0, getX(e) - startX);
    foreEl.style.transform = `translateX(${dx}px)`;
  };
  const onEnd   = async () => {
    if (!dragging) return;
    dragging = false;
    const fired = Math.abs(dx) > THRESHOLD;
    foreEl.style.transition = '';
    if (!fired) { foreEl.style.transform = 'translateX(0)'; return; }
    const ok = await onConfirmDelete();
    if (ok) container.remove();
    else foreEl.style.transform = 'translateX(0)';
  };

  foreEl.addEventListener('touchstart', onStart, { passive: true });
  foreEl.addEventListener('touchmove',  onMove,  { passive: true });
  foreEl.addEventListener('touchend',   onEnd);
  foreEl.addEventListener('mousedown',  onStart);
  document.addEventListener('mousemove', (e)=> dragging && onMove(e));
  document.addEventListener('mouseup',   onEnd);
}

/* ===== トースト：削除 or 取り消し ===== */
/**
 * 下部にトーストを表示し、「削除」or「取り消し」をユーザーに選ばせる
 * 戻り値: Promise<"delete" | "cancel">
 */
function showDeleteToast() {
  return new Promise((resolve) => {
    const bar = document.createElement('div');
    bar.className = 'shadow-sm';
    bar.style.position = 'fixed';
    bar.style.left = '50%';
    bar.style.transform = 'translateX(-50%)';
    bar.style.bottom = '16px';
    bar.style.background = '#212529';
    bar.style.color = '#fff';
    bar.style.padding = '12px 16px';
    bar.style.borderRadius = '8px';
    bar.style.zIndex = 9999;
    bar.style.maxWidth = '92vw';
    bar.style.display = 'flex';
    bar.style.alignItems = 'center';
    bar.style.gap = '12px';

    const msg = document.createElement('span');
    msg.textContent = 'このタスクを削除しますか？';

    const btnCancel = document.createElement('button');
    btnCancel.className = 'btn btn-sm btn-light';
    btnCancel.textContent = '取り消し';

    const btnDelete = document.createElement('button');
    btnDelete.className = 'btn btn-sm btn-danger';
    btnDelete.textContent = '削除';

    bar.append(msg, btnCancel, btnDelete);
    document.body.appendChild(bar);

    const cleanup = (result) => {
      bar.remove();
      resolve(result);
    };
    btnCancel.addEventListener('click', () => cleanup('cancel'));
    btnDelete.addEventListener('click', () => cleanup('delete'));
  });
}

/**
 * トーストで確認→「削除」選択時に Supabase 削除を実行
 * 戻り値: Promise<boolean>  true=削除完了 / false=取り消し
 */
async function confirmAndDelete(id) {
  const action = await showDeleteToast();
  if (action !== 'delete') return false;

  try {
    const { error } = await supabase.from("タスクテーブル").delete().eq("id", id);
    if (error) throw error;
    // PCとモバイル双方に反映
    fetchAndDisplayTasks();
    return true;
  } catch (e) {
    alert("削除エラー: " + e.message);
    return false;
  }
}

/* ===== PCボタンの削除もトースト確認に統一 ===== */
async function deleteTask(id) {
  const ok = await confirmAndDelete(id);
  if (ok) fetchAndDisplayTasks();
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
    if (column === "期限") { va = parseToISO(va) || ""; vb = parseToISO(vb) || ""; }
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
  thStore.textContent = "店舗"; thItem.textContent  = "項目";
  thTask.textContent  = "タスク"; thDue.textContent   = "期限";
  thOwner.textContent = "責任者";
  if (!column) return;
  const arrow = dir === "asc" ? " ▲" : " ▼";
  if (column === "店舗名") thStore.textContent += arrow;
  if (column === "項目")    thItem.textContent  += arrow;
  if (column === "タスク")  thTask.textContent  += arrow;
  if (column === "期限")    thDue.textContent   += arrow;
  if (column === "責任者")  thOwner.textContent += arrow;
}

/* ===== CSV ===== */
export function parseCsvFile(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const lines = String(e.target.result).split(/\r?\n/);
        lines.shift();
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
    const y = m[1].padStart(4,'0'); const mo = m[2].padStart(2,'0'); const d = m[3].padStart(2,'0');
    return `${y}-${mo}-${d}`;
  }
  const dt = new Date(s);
  if (!isNaN(dt)) {
    const y = dt.getFullYear(); const mo = String(dt.getMonth()+1).padStart(2,'0'); const da = String(dt.getDate()).padStart(2,'0');
    return `${y}-${mo}-${da}`;
  }
  return null;
}
function isoToJPMonthDay(iso) { const [, mo, da] = iso.split('-'); return `${mo}月${da}日`; }
function escapeHTML(s) { return String(s).replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch])); }

/* 期限超過バッジ（必要ならここで表示先へ反映） */
function updateOverdueBadge(/*count*/) {}

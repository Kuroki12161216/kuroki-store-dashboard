import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm";

/* ===== Supabase設定 ===== */
const SUPABASE_URL = "https://djgylzypyunbcetvquom.supabase.co";
const SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRqZ3lsenlweXVuYmNldHZxdW9tIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDA4MTk3MjgsImV4cCI6MjA1NjM5NTcyOH0.tRwiVkMiCIvONpjyAJAt3FZ2iUIy6ihaAiHMtZ3bFI0";
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

/* ===== DOM（セクション） ===== */
const taskSection = document.getElementById("taskSection");
const settingsSection = document.getElementById("settingsSection");
const dashboardSection = document.getElementById("dashboardSection");

/* ===== タスク DOM ===== */
const storeSelectTask = document.getElementById("storeSelectTask");
const tasksTableBody = document.querySelector("#tasksTable tbody");
const tasksListMobile = document.getElementById("tasksListMobile");

const taskAddStoreSelect = document.getElementById("taskAddStoreSelect");
const taskAddItemInput = document.getElementById("taskAddItemInput");
const taskAddDetailInput = document.getElementById("taskAddDetailInput");
const taskAddDueInput = document.getElementById("taskAddDueInput");
const taskAddOwnerInput = document.getElementById("taskAddOwnerInput");

/* ===== 通知UI ===== */
const $notifBadge = document.getElementById('notificationStatus');

/* ===== 状態 ===== */
let tasksDataGlobal = [];
let currentSortColumn = null;
let currentSortDir = "asc";

/* ===== ダッシュボード状態 ===== */
let dashboardInitialized = false;
let salesChart = null, unitChart = null, labourChart = null;

/* ===== 初期化 ===== */
window.addEventListener("DOMContentLoaded", async () => {
  await initStoreDropdowns();     // タスク用 店舗選択を埋める
  await fetchAndDisplayTasks();   // タスク描画
  subscribeTasksRealtime();       // Realtime購読
  window.refreshTasks = () => fetchAndDisplayTasks();

  // 通知UI初期化
  updateNotificationUI();

  // 既定はダッシュボード表示
  showDashboardSection();
});

/* ===== 画面切替 ===== */
function hideAllSections() {
  taskSection && (taskSection.style.display = 'none');
  settingsSection && (settingsSection.style.display = 'none');
  dashboardSection && (dashboardSection.style.display = 'none');
}
window.showTaskSection = function () {
  hideAllSections();
  taskSection.style.display = 'block';
  history.replaceState(null, "", "#tasks");
};
window.showSettingsSection = function () {
  hideAllSections();
  settingsSection.style.display = 'block';
  history.replaceState(null, "", "#settings");
};
window.showDashboardSection = async function () {
  hideAllSections();
  dashboardSection.style.display = 'block';
  history.replaceState(null, "", "#dashboard");
  if (!dashboardInitialized) {
    await initDashboard(); // 初回だけ初期化
    dashboardInitialized = true;
  }
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

/* ===== 店舗 初期化（タスク用セレクト） ===== */
async function initStoreDropdowns() {
  const { data, error } = await supabase.from("店舗診断表").select("店舗名");
  if (error) { console.error("店舗一覧取得エラー:", error); return; }
  const storeNames = [...new Set((data || []).map((item) => item.店舗名))];

  // タスク一覧フィルタに「全店舗」を追加
  if (!storeSelectTask.querySelector('option[value="all"]')) {
    const allOpt = document.createElement("option");
    allOpt.value = "all"; allOpt.textContent = "全店舗";
    storeSelectTask.appendChild(allOpt);
  }

  storeNames.forEach((name) => {
    const opt1 = document.createElement("option");
    opt1.value = name; opt1.textContent = name;
    storeSelectTask.appendChild(opt1);

    const opt2 = document.createElement("option");
    opt2.value = name; opt2.textContent = name;
    taskAddStoreSelect.appendChild(opt2);
  });
}

/* ===== タスク ===== */
window.addTaskFromList = async function () {
  const storeName = taskAddStoreSelect.value;
  const item = taskAddItemInput.value;
  const detail = taskAddDetailInput.value;
  const due = taskAddDueInput.value;
  const owner = taskAddOwnerInput.value;
  if (!storeName || !item || !detail) return alert("店舗名、項目、タスクは必須です");

  // 前月 yyyymm
  const dueDate = new Date(due || Date.now());
  const dueHumanMonth = dueDate.getMonth() + 1;
  let diagnosticYear = dueDate.getFullYear();
  let diagnosticMonth = (dueHumanMonth === 1) ? (diagnosticYear--, 12) : (dueHumanMonth - 1);
  const diagnosticMonthStr = String(diagnosticMonth).padStart(2, '0');
  const diagnosticDataMonth = `${diagnosticYear}${diagnosticMonthStr}`;

  const { data: diagData, error: diagError } = await supabase
    .from("店舗診断表").select("id")
    .eq("店舗名", storeName).eq("項目", item).eq("月", diagnosticDataMonth)
    .order("id", { ascending: true });
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
  const selectedStore = storeSelectTask.value || "all";
  let query = supabase.from("タスクテーブル").select("*");

  if (selectedStore !== "all") {
    const { data: diagData, error: diagError } = await supabase
      .from("店舗診断表").select("id, 店舗名");
    if (diagError) { console.error("店舗診断表取得エラー:", diagError); return; }
    const matchedIds = (diagData || []).filter(d => d.店舗名 === selectedStore).map(d => d.id);
    if (!matchedIds.length) { tasksDataGlobal = []; renderTasks(); return; }
    query = query.in("店舗診断表_id", matchedIds);
  }

  const { data: result, error } = await query;
  if (error) { console.error("タスク一覧取得エラー:", error); return; }

  const diagIds = (result || []).map(r => r.店舗診断表_id);
  let storeMap = {};
  if (diagIds.length) {
    const { data: diag, error: dErr } = await supabase
      .from("店舗診断表").select("id, 店舗名").in("id", diagIds);
    if (!dErr && diag) diag.forEach(d => { storeMap[d.id] = d.店舗名; });
  }
  tasksDataGlobal = (result || []).map(r => ({ ...r, 店舗名: storeMap[r.店舗診断表_id] || "" }));

  renderTasks();
  updateSortIndicators(null, null);
};

function renderTasks() {
  tasksTableBody.innerHTML = "";
  tasksListMobile.innerHTML = "";

  let overdueCount = 0;
  tasksDataGlobal.forEach((row) => {
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

    // Mobile list
    const li = document.createElement("div");
    li.className = "list-group-item p-0";

    const bg = document.createElement("div");
    bg.className = "lg-swipe-bg";
    bg.innerHTML = `<span class="fw-bold text-danger-emphasis"><i class="bi bi-trash3 me-1"></i></span>`;

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

    addMobileSwipe(li, fore, async () => await confirmAndDelete(row.id));
  });

  updateOverdueBadge(overdueCount);
}

/* ===== モバイル スワイプ（左で削除） ===== */
function addMobileSwipe(container, foreEl, onConfirmDelete) {
  const THRESHOLD = 96;
  let startX = 0, dx = 0, dragging = false;
  const getX = (e) => e.touches ? e.touches[0].clientX : e.clientX;

  const onStart = (e) => { dragging = true; startX = getX(e); dx = 0; foreEl.style.transition = 'none'; };
  const onMove  = (e) => { if (!dragging) return; dx = Math.min(0, getX(e) - startX); foreEl.style.transform = `translateX(${dx}px)`; };
  const onEnd   = async () => {
    if (!dragging) return; dragging = false;
    const fired = Math.abs(dx) > THRESHOLD;
    foreEl.style.transition = '';
    if (!fired) { foreEl.style.transform = 'translateX(0)'; return; }
    const ok = await onConfirmDelete(); if (ok) container.remove(); else foreEl.style.transform = 'translateX(0)';
  };

  foreEl.addEventListener('touchstart', onStart, { passive: true });
  foreEl.addEventListener('touchmove',  onMove,  { passive: true });
  foreEl.addEventListener('touchend',   onEnd);
  foreEl.addEventListener('mousedown',  onStart);
  document.addEventListener('mousemove', (e)=> dragging && onMove(e));
  document.addEventListener('mouseup',   onEnd);
}

/* ===== トースト確認→削除 ===== */
function showDeleteToast() {
  return new Promise((resolve) => {
    document.getElementById('__confirmOverlay')?.remove();

    const scrollY = window.scrollY || window.pageYOffset;
    const body = document.body;
    const prev = { position: body.style.position, top: body.style.top, width: body.style.width, overflow: body.style.overflow };
    body.style.position = 'fixed'; body.style.top = `-${scrollY}px`; body.style.width = '100%'; body.style.overflow = 'hidden';

    const overlay = document.createElement('div');
    overlay.id = '__confirmOverlay'; overlay.style.position = 'fixed'; overlay.style.inset = '0';
    overlay.style.background = 'rgba(0,0,0,0.12)'; overlay.style.zIndex = '1050';
    overlay.style.display = 'flex'; overlay.style.alignItems = 'center'; overlay.style.justifyContent = 'center'; overlay.style.padding = '16px';

    const dialog = document.createElement('div');
    dialog.role = 'dialog'; dialog.style.background = '#212529'; dialog.style.color = '#fff';
    dialog.style.borderRadius = '14px'; dialog.style.width = 'min(320px, 86vw)'; dialog.style.padding = '16px';
    dialog.style.boxShadow = '0 12px 28px rgba(0,0,0,.22)'; dialog.style.transform = 'translateY(8px)'; dialog.style.opacity = '0';
    dialog.style.transition = 'opacity .14s ease, transform .14s ease';

    const title = document.createElement('div'); title.textContent = 'このタスクを削除しますか？'; title.className = 'fw-semibold'; title.style.marginBottom = '12px';

    const row = document.createElement('div'); row.style.display = 'flex'; row.style.gap = '8px'; row.style.marginTop = '6px';
    const btnCancel = document.createElement('button'); btnCancel.className = 'btn btn-light'; btnCancel.textContent = '取消'; btnCancel.style.flex = '1';
    const btnDelete = document.createElement('button'); btnDelete.className = 'btn btn-danger'; btnDelete.textContent = '削除'; btnDelete.style.flex = '1';

    row.append(btnCancel, btnDelete); dialog.append(title, row); overlay.appendChild(dialog); document.body.appendChild(overlay);
    requestAnimationFrame(()=>{ dialog.style.opacity='1'; dialog.style.transform='translateY(0)'; });

    function cleanup(result){
      overlay.remove(); body.style.position = prev.position; body.style.top = prev.top; body.style.width = prev.width; body.style.overflow = prev.overflow; window.scrollTo(0, scrollY);
      resolve(result);
    }
    btnCancel.onclick = ()=> cleanup('cancel');
    btnDelete.onclick = ()=> cleanup('delete');
    overlay.onclick = (e)=> { if (e.target === overlay) cleanup('cancel'); };
  });
}
async function confirmAndDelete(id) {
  const action = await showDeleteToast();
  if (action !== 'delete') return false;
  try {
    const { error } = await supabase.from("タスクテーブル").delete().eq("id", id);
    if (error) throw error;
    fetchAndDisplayTasks();
    return true;
  } catch (e) {
    alert("削除エラー: " + e.message);
    return false;
  }
}
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
function updateOverdueBadge(){}

/* ======================================================================
   ==================  ダッシュボード（仕様変更反映）  ==================
   ====================================================================== */

async function ensureChartJs() {
  if (window.Chart) return;
  await new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = "https://cdn.jsdelivr.net/npm/chart.js";
    s.onload = resolve; s.onerror = reject;
    document.head.appendChild(s);
  });
}

async function initDashboard() {
  await ensureChartJs();

  // ダッシュボード内のDOM（スコープを#dashboardSectionに限定）
  const $ = (sel) => dashboardSection.querySelector(sel);

  const storeSelectDash = $("#store-select");
  const chartStoreSelect = $("#chart-store-select");
  const targetDateInput = $("#target-date");
  const fiscalYearSelect = $("#fiscal-year");
  const toggleYoy = $("#toggle-yoy");
  const rankTableBody = $("#score-ranking-table tbody");

  // 数値編集モーダル
  const mEdit = $("#edit-modal");
  const editTitleStore = $("#edit-title-store");
  const editTitleSub = $("#edit-title-sub");
  const editStore = $("#edit-store");
  const editMonth = $("#edit-month");
  const editItem = $("#edit-item");
  const editTarget = $("#edit-target");
  const editActual = $("#edit-actual");
  const btnCancel = $("#btn-cancel");
  const btnSave = $("#btn-save");
  const editClose = $("#edit-close");

  // 詳細（仮説/ネクスト & タスク）
  const mDetail = $("#detail-modal");
  const dId = $("#detail-id");
  const dTitleStore = $("#detail-title-store");
  const dTitleSub = $("#detail-title-sub");
  const dStore = $("#detail-store");
  const dMonth = $("#detail-month");
  const dItem = $("#detail-item");
  const dHypo = $("#detail-hypo");
  const dNext = $("#detail-next");
  const dSave = $("#btn-detail-save");
  const dSend = $("#btn-detail-send");
  const dClose = $("#detail-close");
  const tItem = $("#task-item");
  const tDetail = $("#task-detail");
  const tDue = $("#task-due");
  const tOwner = $("#task-owner");

  // KPI定義
  const percentItems = new Set(['F', 'D', '人件費', '店舗MTG参加率', '面談進捗']);
  const yenItems = new Set(['売上', '単価', '人時売上高']);
  const unitMap = {
    '売上': '円', '単価': '円', '人時売上高': '円',
    'F': '%', 'D': '%', '人件費': '%', '店舗MTG参加率': '%', '面談進捗': '%',
    '臨店シート': '', 'CSアンケート': '点', 'PAリファラル採用': '名', '点数': '点'
  };
  const kpiList = [
    { id: 'kpi-sales', item: '売上' },
    { id: 'kpi-unitprice', item: '単価' },
    { id: 'kpi-labour-sales', item: '人時売上高' },
    { id: 'kpi-F', item: 'F' },
    { id: 'kpi-D', item: 'D' },
    { id: 'kpi-labour-cost', item: '人件費' },
    { id: 'kpi-inspection-sheet', item: '臨店シート' },
    { id: 'kpi-mtg-rate', item: '店舗MTG参加率' },
    { id: 'kpi-cs-score', item: 'CSアンケート' },
    { id: 'kpi-interview-progress', item: '面談進捗' },
    { id: 'kpi-referral-hires', item: 'PAリファラル採用' },
    { id: 'kpi-score', item: '点数' },
  ];

  // Charts
  const ctxSales = $("#salesChart")?.getContext("2d");
  const ctxUnit = $("#unitPriceChart")?.getContext("2d");
  const ctxLabour = $("#labourSalesChart")?.getContext("2d");

  // Utils
  const toYYYYMM = (d) => `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}`;
  const labelYYYYMM = (yyyymm) => `${yyyymm.slice(0, 4)}/${yyyymm.slice(4, 6)}`;
  const formatYen = (v) => '¥ ' + Number(v ?? 0).toLocaleString();
  const currentFYStartYear = (() => { const t = new Date(), y = t.getFullYear(), m = t.getMonth() + 1; return (m >= 4) ? y : (y - 1); })();
  const getFiscalMonths = (fyStartYear) => { const arr = []; for (let i = 0; i < 12; i++) arr.push(toYYYYMM(new Date(fyStartYear, 3 + i, 1))); return arr; };

  // 店舗＆期
  async function getUniqueStores() {
    const { data, error } = await supabase.from("店舗診断表").select("店舗名").order("店舗名", { ascending: true });
    if (error) { console.error("店舗名取得エラー:", error); return []; }
    return Array.from(new Set((data || []).map(r => r.店舗名)));
  }
  async function populateStoreSelects() {
    const stores = await getUniqueStores();
    storeSelectDash.innerHTML = ""; chartStoreSelect.innerHTML = "";
    stores.forEach(name => {
      const o1 = document.createElement("option"); o1.value = o1.textContent = name; storeSelectDash.appendChild(o1);
      const o2 = document.createElement("option"); o2.value = o2.textContent = name; chartStoreSelect.appendChild(o2);
    });
  }
  async function populateFiscalYears(store) {
    const { data, error } = await supabase.from("店舗診断表").select("月").eq("店舗名", store).eq("項目", "売上").order("月", { ascending: true });
    if (error) { console.error("期抽出エラー:", error); return; }
    const months = (data || []).map(r => String(r.月));
    const fySet = new Set(); months.forEach(m => { const y = +m.slice(0, 4), mm = +m.slice(4, 6); fySet.add((mm >= 4) ? y : (y - 1)); });
    const fyList = Array.from(fySet).sort((a, b) => b - a);
    fiscalYearSelect.innerHTML = "";
    fyList.forEach(y => { const opt = document.createElement("option"); opt.value = y; opt.textContent = `${y}期（${y}/04〜${y + 1}/03）`; fiscalYearSelect.appendChild(opt); });
    const def = fyList.includes(currentFYStartYear) ? currentFYStartYear : fyList[0]; if (def) fiscalYearSelect.value = def;
  }

  async function fetchMetric(store, item, months) {
    const { data, error } = await supabase
      .from("店舗診断表").select("月, 目標数値, 実績")
      .eq("店舗名", store).eq("項目", item).in("月", months);
    if (error) { console.error("fetchMetric error:", error); return {}; }
    const map = {}; (data || []).forEach(r => { map[String(r.月)] = { target: r.目標数値 != null ? Number(r.目標数値) : null, actual: r.実績 != null ? Number(r.実績) : null }; });
    return map;
  }
  function calcYoYPercent(currActualArr, prevActualArr) {
    return currActualArr.map((v, i) => {
      const p = prevActualArr[i];
      if (p == null || p === 0 || v == null) return null;
      return (v / p - 1) * 100;
    });
  }
  function renderChart(ctx, labels, targetArr, actualArr, yoyPercentArr, title, unit, showYoY, existingChartRef) {
    if (!ctx) return null;
    if (existingChartRef) existingChartRef.destroy();
    const datasets = [
      { label: '目標', data: targetArr, tension: 0.1, fill: false },
      { label: '実績', data: actualArr, tension: 0.1, fill: false }
    ];
    if (showYoY) {
      datasets.push({ label: '昨対比(%)', data: yoyPercentArr, yAxisID: 'y2', tension: 0.1, borderDash: [5, 5], spanGaps: true });
    }
    return new Chart(ctx, {
      type: 'line',
      data: { labels, datasets },
      options: {
        responsive: true, maintainAspectRatio: false, spanGaps: true,
        plugins: {
          title: { display: true, text: title },
          legend: { display: true },
          tooltip: {
            callbacks: {
              label: (c) => {
                const name = c.dataset.label || '', val = c.raw;
                if (name.includes('昨対比')) return `${name}: ${val == null ? '-' : val.toFixed(1)}%`;
                if (unit === 'yen') return `${name}: ${val == null ? '-' : formatYen(val)}`;
                return `${name}: ${val == null ? '-' : Number(val).toLocaleString()}`;
              }
            }
          }
        },
        scales: {
          x: { type: 'category', ticks: { autoSkip: false, maxRotation: 45, minRotation: 0 }, title: { display: true, text: '月' } },
          y: { beginAtZero: true, title: { display: true, text: unit === 'yen' ? '金額' : '値' }, ticks: { callback: (v) => unit === 'yen' ? (v === 0 ? '0' : v.toLocaleString()) : v } },
          y2: { position: 'right', grid: { drawOnChartArea: false }, ticks: { callback: (v) => `${v}%` }, title: { display: showYoY, text: showYoY ? '昨対比(%)' : '' }, suggestedMin: -50, suggestedMax: 50 }
        }
      }
    });
  }
  async function renderAllCharts() {
    const store = chartStoreSelect.value || storeSelectDash.value;
    const fy = Number(fiscalYearSelect.value); if (!store || !fy) return;
    const months = getFiscalMonths(fy), prevMonths = getFiscalMonths(fy - 1), labels = months.map(labelYYYYMM), showYoY = toggleYoy.checked;

    const salesCurr = await fetchMetric(store, '売上', months), salesPrev = await fetchMetric(store, '売上', prevMonths);
    const salesTarget = months.map(m => salesCurr[m]?.target ?? null), salesActual = months.map(m => salesCurr[m]?.actual ?? null);
    const salesPrevActual = prevMonths.map(m => salesPrev[m]?.actual ?? null), salesYoY = calcYoYPercent(salesActual, salesPrevActual);
    salesChart = renderChart(ctxSales, labels, salesTarget, salesActual, salesYoY, `${store}：売上 目標／実績（${fy}/04〜${fy + 1}/03）`, 'yen', showYoY, salesChart);

    const unitCurr = await fetchMetric(store, '単価', months), unitPrev = await fetchMetric(store, '単価', prevMonths);
    const unitTarget = months.map(m => unitCurr[m]?.target ?? null), unitActual = months.map(m => unitCurr[m]?.actual ?? null);
    const unitPrevActual = prevMonths.map(m => unitPrev[m]?.actual ?? null), unitYoY = calcYoYPercent(unitActual, unitPrevActual);
    unitChart = renderChart(ctxUnit, labels, unitTarget, unitActual, unitYoY, `${store}：客単価 目標／実績（${fy}/04〜${fy + 1}/03）`, 'yen', showYoY, unitChart);

    const labourCurr = await fetchMetric(store, '人時売上高', months), labourPrev = await fetchMetric(store, '人時売上高', prevMonths);
    const labourTarget = months.map(m => labourCurr[m]?.target ?? null), labourActual = months.map(m => labourCurr[m]?.actual ?? null);
    const labourPrevActual = prevMonths.map(m => labourPrev[m]?.actual ?? null), labourYoY = calcYoYPercent(labourActual, labourPrevActual);
    labourChart = renderChart(ctxLabour, labels, labourTarget, labourActual, labourYoY, `${store}：人時売上高 目標／実績（${fy}/04〜${fy + 1}/03）`, 'number', showYoY, labourChart);
  }

  // 採点（10/0点）
  const LOWER_IS_BETTER = new Set(['F', 'D', '人件費']);
  function binaryScore(item, t, a) {
    if (a == null) return 10;
    if (Number(a) === 0) return 0;
    if (t == null) return 10;
    if (LOWER_IS_BETTER.has(item)) return Number(a) <= Number(t) ? 10 : 0;
    return Number(a) >= Number(t) ? 10 : 0;
  }
  const SCORE_ITEMS = ['売上', '単価', '人時売上高', 'F', 'D', '人件費', '臨店シート', '店舗MTG参加率', 'CSアンケート', '面談進捗', 'PAリファラル採用'];

  async function computeScoreByItems(store, month) {
    const { data, error } = await supabase
      .from("店舗診断表")
      .select("項目,目標数値,実績")
      .eq("店舗名", store)
      .eq("月", month)
      .in("項目", SCORE_ITEMS);
    if (error) { console.error('computeScore error', error); return null; }
    const map = {}; (data || []).forEach(r => map[r.項目] = { t: r.目標数値, a: r.実績 });
    let total = 0;
    SCORE_ITEMS.forEach(it => {
      const pair = map[it] || {};
      total += binaryScore(it,
        pair.t != null ? Number(pair.t) : null,
        pair.a != null ? Number(pair.a) : null
      );
    });
    return total;
  }

  async function renderScoreRanking(month) {
    const stores = await getUniqueStores();
    const targetStores = stores.slice(0, 6);
    if (targetStores.length === 0) return;

    const { data: scoreRows, error } = await supabase
      .from("店舗診断表")
      .select("店舗名,実績")
      .eq("項目", "点数")
      .eq("月", month)
      .in("店舗名", targetStores);
    const directMap = {}; if (!error && scoreRows) { scoreRows.forEach(r => directMap[r.店舗名] = Math.round(Number(r.実績 || 0))); }

    const rows = [];
    for (const st of targetStores) {
      let score = directMap[st];
      if (score == null) {
        const calc = await computeScoreByItems(st, month);
        score = calc != null ? Math.round(calc) : 0;
      }
      rows.push({ store: st, score });
    }
    rows.sort((a, b) => b.score - a.score);
    rankTableBody.innerHTML = "";
    rows.forEach((r, idx) => {
      const badgeClass = idx === 0 ? 'gold' : (idx === 1 ? 'silver' : (idx === 2 ? 'bronze' : ''));
      const tr = document.createElement('tr');
      tr.innerHTML = `<td><span class="rank-badge ${badgeClass}">${idx + 1}</span></td><td>${r.store}</td><td>${r.score} / 110点</td>`;
      rankTableBody.appendChild(tr);
    });
  }

  // KPI更新
  async function updateAllKPIs(store, dateStr) {
    if (!store || !dateStr) return;
    const month = dateStr.slice(0, 7).replace("-", "");

    const { data, error } = await supabase
      .from("店舗診断表")
      .select("項目,目標数値,実績")
      .eq("店舗名", store)
      .eq("月", month);
    if (error) { console.error("KPI取得エラー:", error); return; }

    function asPercentInt(v) {
      if (v == null) return null;
      const n = Number(v);
      const pct = Math.abs(n) <= 1 ? n * 100 : n;
      return Math.round(pct);
    }
    function roundIfNeeded(item, n) {
      return (item === '単価' || item === '人時売上高') ? Math.round(Number(n)) : Number(n);
    }

    for (const { id, item } of kpiList) {
      const card = $("#"+id); if (!card) continue;
      const valueEl = card.querySelector('.value');
      const trendEl = card.querySelector('.trend');
      const iconEl = card.querySelector('.icon');
      const percentEl = card.querySelector('.percent');

      let targetBadge = card.querySelector('.target-badge');
      if (!targetBadge) { targetBadge = document.createElement('span'); targetBadge.className = 'target-badge'; card.appendChild(targetBadge); }

      let mini = card.querySelector('.mini-score');
      if (!mini && item !== '点数') { mini = document.createElement('span'); mini.className = 'mini-score'; card.appendChild(mini); }

      const rec = (data || []).find(r => r.項目 === item);
      const target = rec && rec.目標数値 != null ? Number(rec.目標数値) : null;
      let current = rec && rec.実績 != null ? Number(rec.実績) : null;

      if (item === '点数') {
        const totalScore = await computeScoreByItems(store, month);
        valueEl.textContent = totalScore != null ? `${totalScore} / 110点` : `-- / 110点`;
      } else {
        let text = '--';
        if (current != null) {
          if (percentItems.has(item)) {
            const iv = asPercentInt(current);
            text = `${iv}%`;
          } else if (yenItems.has(item)) {
            const v = roundIfNeeded(item, current);
            text = `${v.toLocaleString()} ${unitMap[item]}`;
          } else if (item === 'PAリファラル採用') {
            text = `${Math.round(Number(current))} ${unitMap[item]}`;
          } else if (item === 'CSアンケート') {
            text = `${Number(current).toLocaleString()} ${unitMap[item]}`;
          } else {
            text = `${Number(current).toLocaleString()}${unitMap[item] || ''}`;
          }
        }
        valueEl.textContent = text;
      }

      if (item === '点数') {
        targetBadge.textContent = '目標：110点';
      } else if (percentItems.has(item)) {
        const tv = target != null ? asPercentInt(target) : null;
        targetBadge.textContent = tv != null ? `目標：${tv}%` : '目標：--';
      } else if (yenItems.has(item)) {
        const tv = target != null ? roundIfNeeded(item, target) : null;
        targetBadge.textContent = tv != null ? `目標：${tv.toLocaleString()} ${unitMap[item]}` : '目標：--';
      } else {
        targetBadge.textContent = target != null ? `目標：${Number(target).toLocaleString()}${unitMap[item] || ''}` : '目標：--';
      }

      if (item !== '点数' && mini) {
        const s = binaryScore(item, target, current);
        mini.textContent = `${s}点`;
      }

      const prev = await fetchPrevValue(store, month, item);
      if (item !== '点数' && prev !== null && current != null) {
        const diff = current - prev;
        const rate = prev === 0 ? 0 : Math.round((diff / prev) * 100);
        if (rate >= 0) { iconEl.textContent = '▲'; trendEl.classList.remove('down'); trendEl.classList.add('up'); }
        else { iconEl.textContent = '▼'; trendEl.classList.remove('up'); trendEl.classList.add('down'); }
        percentEl.textContent = Math.abs(rate) + '%';
      } else {
        percentEl.textContent = '--%';
      }
    }
    await renderScoreRanking(month);
  }

  async function fetchPrevValue(store, month, item) {
    const y = Number(month.slice(0, 4)), m = Number(month.slice(4, 6));
    const prev = new Date(y, m - 2, 1);
    const prevStr = `${prev.getFullYear()}${String(prev.getMonth() + 1).padStart(2, '0')}`;
    const { data, error } = await supabase
      .from("店舗診断表").select("項目,実績")
      .eq("店舗名", store).eq("月", prevStr);
    if (error || !data) return null;
    const rec = data.find(r => r.項目 === item); return rec ? Number(rec.実績) : null;
  }

  // ---- 詳細（仮説／ネクスト & タスク） ----
  function openDetailModal(item) {
    if (item === '点数') return;
    const store = storeSelectDash.value;
    const monthRaw = (targetDateInput.value || '').slice(0, 7).replace("-", "");
    const monthLabel = `${monthRaw.slice(0, 4)}/${monthRaw.slice(4, 6)}`;

    dTitleStore.textContent = store;
    dTitleSub.textContent = `${monthLabel} / ${item}`;
    dStore.value = store; dMonth.value = monthRaw; dItem.value = item; tItem.value = item;
    tDetail.value = ''; tDue.value = ''; tOwner.value = '';

    findOrCreateDiagnostic(store, monthRaw, item).then(row => {
      if (row) {
        dId.value = row.id;
        dHypo.value = row.仮説 ?? '';
        dNext.value = row.ネクストアクション ?? '';
      }
      mDetail.hidden = false;
    }).catch(err => { console.error(err); alert('データ取得に失敗しました'); });
  }
  async function findOrCreateDiagnostic(store, month, item) {
    let { data, error } = await supabase
      .from('店舗診断表')
      .select('id, 仮説, ネクストアクション').eq('店舗名', store).eq('月', month).eq('項目', item).limit(1);
    if (error) throw error;
    if (data && data.length) return data[0];
    const { error: upErr } = await supabase
      .from('店舗診断表')
      .upsert([{ 店舗名: store, 月: month, 項目: item }], { onConflict: '店舗名,月,項目' });
    if (upErr) throw upErr;
    const res = await supabase
      .from('店舗診断表')
      .select('id, 仮説, ネクストアクション').eq('店舗名', store).eq('月', month).eq('項目', item).limit(1);
    if (res.error) throw res.error;
    return (res.data && res.data[0]) ? res.data[0] : null;
  }
  function closeDetail() { mDetail.hidden = true; }
  dClose?.addEventListener('click', closeDetail);
  mDetail?.addEventListener('click', (e) => { if (e.target === mDetail) closeDetail(); });

  dSave?.addEventListener('click', async () => {
    const id = dId.value;
    if (!id) { alert('ID取得に失敗しました'); return; }
    const { error } = await supabase
      .from('店舗診断表')
      .update({ 仮説: dHypo.value, ネクストアクション: dNext.value })
      .eq('id', id);
    if (error) { alert('保存に失敗しました'); return; }
    alert('仮説・ネクストアクションを保存しました');
    closeDetail();
  });

  dSend?.addEventListener('click', async () => {
    const diagId = dId.value;
    const item = tItem.value;
    const detail = tDetail.value.trim();
    const due = tDue.value || null;
    const owner = tOwner.value || null;
    if (!diagId) { alert('診断表IDがありません'); return; }
    if (!item || !detail) { alert('「項目」「タスク」は必須です'); return; }
    const { error } = await supabase
      .from('タスクテーブル')
      .insert([{ 店舗診断表_id: diagId, 項目: item, タスク: detail, 期限: due, 責任者: owner }]);
    if (error) { alert('タスク送信に失敗しました'); return; }
    alert('タスクを送信しました');
    tDetail.value = ''; tDue.value = ''; tOwner.value = '';
  });

  // ---- 数値編集（✎） ----
  function openEditModal(item, e) {
    if (e) e.stopPropagation();
    const store = storeSelectDash.value;
    const monthRaw = (targetDateInput.value || '').slice(0, 7).replace("-", "");
    const monthLabel = `${monthRaw.slice(0, 4)}/${monthRaw.slice(4, 6)}`;

    editTitleStore.textContent = store;
    editTitleSub.textContent = `${monthLabel} / ${item}`;
    editStore.value = store; editMonth.value = monthRaw; editItem.value = item;
    editTarget.value = ''; editActual.value = ''; mEdit.hidden = false;

    supabase.from('店舗診断表')
      .select('目標数値,実績').eq('店舗名', store).eq('月', monthRaw).eq('項目', item).limit(1)
      .then(({ data, error }) => {
        if (!error && data && data[0]) {
          if (data[0].目標数値 != null) editTarget.value = Number(data[0].目標数値);
          if (data[0].実績 != null) editActual.value = Number(data[0].実績);
        }
      });
  }
  function closeEditModal() { mEdit.hidden = true; }
  btnCancel?.addEventListener('click', closeEditModal);
  editClose?.addEventListener('click', closeEditModal);
  mEdit?.addEventListener('click', (e) => { if (e.target === mEdit) closeEditModal(); });

  btnSave?.addEventListener('click', async () => {
    const store = editStore.value, month = editMonth.value, item = editItem.value;
    const target = editTarget.value.trim() === '' ? null : Number(editTarget.value);
    const actual = editActual.value.trim() === '' ? null : Number(editActual.value);
    const { error } = await supabase.from('店舗診断表')
      .upsert([{ 店舗名: store, 月: month, 項目: item, 目標数値: target, 実績: actual }], { onConflict: '店舗名,月,項目' });
    if (error) { console.error('保存エラー:', error); alert('保存に失敗しました'); return; }
    closeEditModal();
    await updateAllKPIs(storeSelectDash.value, targetDateInput.value);
    await renderAllCharts();
  });

  // ✎ボタン設置 & カードクリック
  function attachEditButtonsAndCardClicks() {
    kpiList.forEach(({ id, item }) => {
      const card = $("#"+id); if (!card) return;
      if (item !== '点数') { card.addEventListener('click', () => openDetailModal(item)); }
      if (!card.querySelector('.edit-btn')) {
        const btn = document.createElement('button'); btn.className = 'edit-btn'; btn.title = `${item}を編集`; btn.innerText = '✎';
        btn.addEventListener('click', (e) => openEditModal(item, e));
        card.appendChild(btn);
      }
    });
  }

  // 初期化
  const today = new Date(); targetDateInput.value = today.toISOString().slice(0, 7);
  await populateStoreSelects();
  chartStoreSelect.value = storeSelectDash.value;
  await populateFiscalYears(storeSelectDash.value);
  attachEditButtonsAndCardClicks();
  await updateAllKPIs(storeSelectDash.value, targetDateInput.value);
  await renderAllCharts();

  // イベント
  storeSelectDash.addEventListener("change", async () => { await updateAllKPIs(storeSelectDash.value, targetDateInput.value); });
  targetDateInput.addEventListener("change", () => { updateAllKPIs(storeSelectDash.value, targetDateInput.value); });
  chartStoreSelect.addEventListener("change", async (e) => { await populateFiscalYears(e.target.value); await renderAllCharts(); });
  fiscalYearSelect.addEventListener("change", renderAllCharts);
  toggleYoy.addEventListener("change", renderAllCharts);
}

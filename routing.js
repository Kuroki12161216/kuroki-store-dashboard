import { updateNotificationBadge } from "./notifications.js";
/* ========= セクション表示切り替え ========= */
function closeOffcanvas() {
  const el = document.getElementById("offcanvasNavbar");
  if (!el || !window.bootstrap) return;
  try {
    const inst =
      bootstrap.Offcanvas.getInstance(el) || new bootstrap.Offcanvas(el);
    inst.hide();
  } catch (e) {
    /* noop */
  }
}

function switchSection(targetId) {
  const ids = [
    "dashboardSection",
    "taskSection",
    "inspectionSection",
    "settingsSection",
  ];
  ids.forEach((id) => {
    const el = document.getElementById(id);
    if (el) el.style.display = id === targetId ? "block" : "none";
  });

  // ナビのactive表示
  document
    .querySelectorAll("nav .nav-link")
    .forEach((btn) => btn.classList.remove("active"));
  const selectorMap = {
    dashboardSection: 'button.nav-link[onclick*="showDashboardSection"]',
    taskSection: 'button.nav-link[onclick*="showTaskSection"]',
    inspectionSection: 'button.nav-link[onclick*="showInspectionSection"]',
    settingsSection: 'button.nav-link[onclick*="showSettingsSection"]',
  };
  document.querySelector(selectorMap[targetId])?.classList.add("active");

  closeOffcanvas();
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function showDashboardSection() {
  switchSection("dashboardSection");
  // 画面復帰時に必要なら再描画
  // updateAllKPIs(storeSelect.value, targetDateInput.value);
  // renderAllCharts();
}

async function showTaskSection() {
  switchSection("taskSection");

  // 店舗セレクト初期化（未設定時のみ）
//   await _ensureTaskStoreSelects();

  // 一覧の再取得
  if (typeof window.fetchAndDisplayTasks === "function") {
    window.fetchAndDisplayTasks();
  } else if (typeof fetchAndDisplayTasks === "function") {
    fetchAndDisplayTasks();
  }
}

/* --- セクション切替 --- */
function showInspectionSection() {
  switchSection("inspectionSection");
  history.replaceState(null, "", "#inspections");
  if (!window.insp_inited) {
    window.insp_inited = true;
    initInspectionPage(); // 初回のみ
  }
}

function showSettingsSection() {
  switchSection("settingsSection");
  updateNotificationBadge();
}

// HTML の onclick から呼べるように公開
if (typeof window !== "undefined") {
  window.showDashboardSection = showDashboardSection;
  window.showTaskSection = showTaskSection;
  window.showInspectionSection = showInspectionSection;
  window.showSettingsSection = showSettingsSection;
  window.closeOffcanvas = closeOffcanvas;
}

export {
  switchSection,
  closeOffcanvas,
  showDashboardSection,
  showTaskSection,
  showInspectionSection,
  showSettingsSection,
};
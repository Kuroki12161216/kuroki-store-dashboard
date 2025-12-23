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

import {
  initInspectionPage
} from "./inspections.js";

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
    await initInspectionPage();
  } else if (h === "#settings") {
    showSettingsSection();
  } else {
    showDashboardSection();
  }
});

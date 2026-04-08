import { fetchPostHistory } from "./snsDb.js";
import { _escapeHtml } from "./utils.js";

function getEl(id) { return document.getElementById(id); }

export function initHistoryTab() {
  getEl("btnRefreshHistory")?.addEventListener("click", renderHistory);
}

export async function renderHistory() {
  const tbody = getEl("snsHistoryTableBody");
  if (!tbody) return;

  tbody.innerHTML = `<tr><td colspan="5" class="text-center text-muted py-3">
    <span class="spinner-border spinner-border-sm me-2"></span>読み込み中...
  </td></tr>`;

  try {
    const records = await fetchPostHistory(50);

    if (!records.length) {
      tbody.innerHTML = `<tr><td colspan="5" class="text-center text-muted py-3">投稿履歴がありません。</td></tr>`;
      return;
    }

    tbody.innerHTML = records.map(r => {
      const platforms = Array.isArray(r.platforms) ? r.platforms : [];
      const platformBadges = platforms.map(p =>
        p === "gbp"
          ? `<span class="badge bg-success me-1">GBP</span>`
          : `<span class="badge bg-primary me-1">Instagram</span>`
      ).join("");

      const date = r.posted_at
        ? new Date(r.posted_at).toLocaleString("ja-JP", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" })
        : "–";

      const statusBadge =
        r.status === "success"  ? `<span class="badge bg-success">成功</span>`  :
        r.status === "partial"  ? `<span class="badge bg-warning text-dark">一部失敗</span>` :
                                  `<span class="badge bg-danger">失敗</span>`;

      const preview = _escapeHtml((r.post_text || "").replace(/\n/g, " ").slice(0, 60));
      const ellipsis = (r.post_text || "").length > 60 ? "…" : "";

      return `
        <tr>
          <td class="align-middle">${_escapeHtml(r.store_name || "–")}</td>
          <td class="align-middle">${platformBadges}</td>
          <td class="align-middle text-truncate" style="max-width:240px;" title="${_escapeHtml(r.post_text || "")}">${preview}${ellipsis}</td>
          <td class="align-middle text-nowrap">${date}</td>
          <td class="align-middle">${statusBadge}</td>
        </tr>`;
    }).join("");
  } catch (e) {
    tbody.innerHTML = `<tr><td colspan="5" class="text-danger p-3">読み込みエラー: ${_escapeHtml(e.message)}</td></tr>`;
  }
}

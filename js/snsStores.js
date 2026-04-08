import { fetchStoreSettings, upsertStoreSetting, deleteStoreSetting } from "./snsDb.js";
import { _escapeHtml } from "./utils.js";

let _storesCache = [];

function getEl(id) { return document.getElementById(id); }

// 外部から呼べるようにエクスポート（投稿タブの店舗セレクト更新用）
export function getStoresCache() { return _storesCache; }

export async function initStoresTab() {
  getEl("btnAddStore")?.addEventListener("click", () => openStoreModal(null));
  getEl("snsStoreForm")?.addEventListener("submit", handleStoreSave);
  initAiKeySection();
  await renderStoresList();
}

export async function renderStoresList() {
  const tbody = getEl("storesTableBody");
  if (!tbody) return;

  try {
    _storesCache = await fetchStoreSettings();
  } catch (e) {
    tbody.innerHTML = `<tr><td colspan="4" class="text-danger p-3">読み込みエラー: ${_escapeHtml(e.message)}</td></tr>`;
    return;
  }

  if (!_storesCache.length) {
    tbody.innerHTML = `<tr><td colspan="4" class="text-center text-muted py-3">店舗が未登録です。「店舗を追加」ボタンから登録してください。</td></tr>`;
    return;
  }

  tbody.innerHTML = _storesCache.map(s => `
    <tr>
      <td class="align-middle fw-semibold">${_escapeHtml(s.store_name)}</td>
      <td class="align-middle">
        ${s.gbp_webhook
          ? `<span class="badge bg-success">設定済</span>`
          : `<span class="badge bg-secondary">未設定</span>`}
      </td>
      <td class="align-middle">
        ${s.ig_webhook
          ? `<span class="badge bg-success">設定済</span>`
          : `<span class="badge bg-secondary">未設定</span>`}
      </td>
      <td class="align-middle">
        <button class="btn btn-sm btn-outline-primary me-1" onclick="window._snsEditStore(${s.id})" title="編集">
          <i class="bi bi-pencil"></i>
        </button>
        <button class="btn btn-sm btn-outline-danger" onclick="window._snsDeleteStore(${s.id})" title="削除">
          <i class="bi bi-trash"></i>
        </button>
      </td>
    </tr>
  `).join("");

  // window経由でonclick から呼べるようにする
  window._snsEditStore = (id) => {
    const store = _storesCache.find(s => s.id === id);
    if (store) openStoreModal(store);
  };
  window._snsDeleteStore = async (id) => {
    const store = _storesCache.find(s => s.id === id);
    if (!store) return;
    if (!confirm(`「${store.store_name}」の設定を削除しますか？`)) return;
    try {
      await deleteStoreSetting(id);
      await renderStoresList();
      if (typeof window._snsRefreshStoreSelect === "function") window._snsRefreshStoreSelect();
    } catch (e) {
      alert("削除に失敗しました: " + e.message);
    }
  };
}

function openStoreModal(store) {
  const modal = getEl("snsStoreModal");
  if (!modal) return;

  getEl("snsStoreModalTitle").textContent = store ? "店舗設定を編集" : "店舗を追加";
  getEl("snsStoreModalId").value    = store?.id           ?? "";
  getEl("snsStoreModalName").value  = store?.store_name   ?? "";
  getEl("snsStoreModalGbp").value   = store?.gbp_webhook  ?? "";
  getEl("snsStoreModalIg").value    = store?.ig_webhook   ?? "";
  getEl("snsStoreModalToken").value = store?.auth_token   ?? "";
  // AIエージェント用
  getEl("snsStoreModalGbpToken").value    = store?.gbp_access_token ?? "";
  getEl("snsStoreModalGbpAccountId").value = store?.gbp_account_id  ?? "";
  getEl("snsStoreModalGbpLocationId").value = store?.gbp_location_id ?? "";
  getEl("snsStoreModalIgToken").value     = store?.ig_access_token  ?? "";
  getEl("snsStoreModalIgAccountId").value  = store?.ig_account_id   ?? "";
  getEl("snsStoreModalErr").textContent = "";

  bootstrap.Modal.getOrCreateInstance(modal).show();
}

async function handleStoreSave(e) {
  e.preventDefault();
  const errEl  = getEl("snsStoreModalErr");
  const saveBtn = getEl("btnSnsStoreSave");

  const id         = getEl("snsStoreModalId").value;
  const store_name = getEl("snsStoreModalName").value.trim();
  const gbp_webhook = getEl("snsStoreModalGbp").value.trim();
  const ig_webhook  = getEl("snsStoreModalIg").value.trim();
  const auth_token  = getEl("snsStoreModalToken").value.trim();
  // AIエージェント用
  const gbp_access_token  = getEl("snsStoreModalGbpToken").value.trim();
  const gbp_account_id    = getEl("snsStoreModalGbpAccountId").value.trim();
  const gbp_location_id   = getEl("snsStoreModalGbpLocationId").value.trim();
  const ig_access_token   = getEl("snsStoreModalIgToken").value.trim();
  const ig_account_id     = getEl("snsStoreModalIgAccountId").value.trim();

  if (!store_name) {
    if (errEl) errEl.textContent = "店舗名を入力してください。";
    return;
  }

  if (saveBtn) saveBtn.disabled = true;
  try {
    await upsertStoreSetting({
      id: id ? Number(id) : undefined,
      store_name, gbp_webhook, ig_webhook, auth_token,
      gbp_access_token, gbp_account_id, gbp_location_id,
      ig_access_token, ig_account_id,
    });
    bootstrap.Modal.getOrCreateInstance(getEl("snsStoreModal")).hide();
    await renderStoresList();
    if (typeof window._snsRefreshStoreSelect === "function") window._snsRefreshStoreSelect();
  } catch (e) {
    if (errEl) errEl.textContent = "保存エラー: " + e.message;
  } finally {
    if (saveBtn) saveBtn.disabled = false;
  }
}

function initAiKeySection() {
  const keyInput = getEl("snsAiApiKey");
  if (!keyInput) return;

  keyInput.value = localStorage.getItem("snsAiApiKey") || "";

  getEl("btnSnsApiKeySave")?.addEventListener("click", () => {
    localStorage.setItem("snsAiApiKey", keyInput.value.trim());
    const fb = getEl("snsApiKeyFeedback");
    if (fb) {
      fb.textContent = "保存しました";
      fb.className = "form-text text-success";
      setTimeout(() => { if (fb) { fb.textContent = ""; fb.className = "form-text"; } }, 2000);
    }
  });
}

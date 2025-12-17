// tasks.js
import { supabase } from "./supabaseClient.js";
import { _escapeHtml, _fmtDateYYYYMMDD, _currentYYYYMM } from "./utils.js";
// クライアント側の状態
let _tasksCache = [];
let _tasksSort = { field: "期限", asc: true };

// 店名のプルダウン初期化（タスク画面用）
// 先頭に「全ての店舗」を追加（#storeSelectTask）
// 追加フォーム（#taskAddStoreSelect）は「店舗を選択」を維持
async function _ensureTaskStoreSelects() {
    const { data, error } = await supabase.from("店舗診断表").select("店舗名");
    if (error) {
        console.error("店舗一覧取得エラー", error);
        return;
    }
    const stores = Array.from(new Set((data || []).map((r) => r.店舗名))).sort();

    const taskAddStoreSelect = document.getElementById("taskAddStoreSelect");
    const storeSelectTask = document.getElementById("storeSelectTask");

    // 追加フォーム側：必ず単一店舗を選ばせる（先頭はプレースホルダ）
    if (taskAddStoreSelect) {
        const current = taskAddStoreSelect.value;
        taskAddStoreSelect.innerHTML = '<option value="">店舗を選択</option>';
        stores.forEach((s) => {
            const o = document.createElement("option");
            o.value = o.textContent = s;
            taskAddStoreSelect.appendChild(o);
        });
        if (stores.includes(current)) taskAddStoreSelect.value = current;
    }

    // 一覧フィルタ側：先頭に「全ての店舗」（value=""で全件表示）
    if (storeSelectTask) {
        const current = storeSelectTask.value; // 既存選択を一応保持
        storeSelectTask.innerHTML = '<option value="">全ての店舗</option>';
        stores.forEach((s) => {
            const o = document.createElement("option");
            o.value = o.textContent = s;
            storeSelectTask.appendChild(o);
        });
        storeSelectTask.value = current && stores.includes(current) ? current : "";
    }
}

async function _fetchTasksRaw() {
    const { data, error } = await supabase
        .from("タスクテーブル")
        .select(
            `
      id, 項目, タスク, 期限, 責任者,
      店舗診断表:店舗診断表_id ( 店舗名, 月 )
    `
        )
        .order("期限", { ascending: true, nullsFirst: true })
        .order("id", { ascending: false });

    if (error) {
        console.error("タスク取得エラー:", error);
        throw error;
    }

    return (data || []).map((r) => ({
        id: r.id,
        store: r.店舗診断表?.店舗名 ?? "(未紐付け)",
        item: r.項目 ?? "",
        task: r.タスク ?? "",
        due: r.期限 ?? null,
        owner: r.責任者 ?? "",
        month: r.店舗診断表?.月 ?? null,
    }));
}

// 並べ替え
export function sortTasks(field) {
    if (_tasksSort.field === field) {
        _tasksSort.asc = !_tasksSort.asc;
    } else {
        _tasksSort.field = field;
        _tasksSort.asc = true;
    }
    _renderTasks();
}

// タスクの描画（PCテーブル & モバイルlist-group）
// タスクの描画（PCテーブル & モバイルlist-group）
function _renderTasks() {
    const tbody = document.querySelector("#tasksTable tbody");
    const listMobile = document.getElementById("tasksListMobile");
    if (!tbody || !listMobile) return;

    // 絞り込み
    const filterStore = document.getElementById("storeSelectTask")?.value || "";
    let rows = _tasksCache.slice();
    if (filterStore) rows = rows.filter((r) => r.store === filterStore);

    // 並べ替え
    const f = _tasksSort.field,
        asc = _tasksSort.asc ? 1 : -1;
    rows.sort((a, b) => {
        const va = a[f] ?? "",
            vb = b[f] ?? "";
        if (f === "期限") {
            // 日付
            return asc * ((va || "") > (vb || "") ? 1 : va == vb ? 0 : -1);
        }
        return (
            asc * (va || "").toString().localeCompare((vb || "").toString(), "ja")
        );
    });

    // ===== ここから期限超過カウント用の準備 =====
    let overdueCount = 0;
    const todayStr = _fmtDateYYYYMMDD(new Date()); // "YYYY-MM-DD" 形式を想定
    // ======================================

    // PCテーブル
    tbody.innerHTML = "";
    for (const r of rows) {
        const tr = document.createElement("tr");

        const tdStore = document.createElement("td");
        tdStore.textContent = r.store;

        const tdItem = document.createElement("td");
        tdItem.textContent = r.item;

        const tdTask = document.createElement("td");
        tdTask.textContent = r.task;

        const tdDue = document.createElement("td");
        const dueStr = r.due ? _fmtDateYYYYMMDD(r.due) : "-";

        // 期限超過判定（必要なら && !r.done などを追加）
        const isOverdue = r.due && dueStr < todayStr;
        if (isOverdue) {
            overdueCount++;
            tdDue.classList.add("text-danger", "fw-bold"); // 見た目上も強調（任意）
        }
        tdDue.textContent = dueStr;

        const tdOwner = document.createElement("td");
        tdOwner.textContent = r.owner || "-";

        const tdOps = document.createElement("td");
        tdOps.innerHTML = `<button class="btn btn-sm btn-outline-danger" onclick="deleteTask(${r.id})"><i class="bi bi-trash"></i></button>`;

        tr.append(tdStore, tdItem, tdTask, tdDue, tdOwner, tdOps);
        tbody.appendChild(tr);
    }

    // モバイルlist-group
    listMobile.innerHTML = "";
    for (const r of rows) {
        const dueStr = r.due ? _fmtDateYYYYMMDD(r.due) : "-";
        const isOverdue = r.due && dueStr < todayStr;

        const div = document.createElement("div");
        div.className = "list-group-item";
        div.innerHTML = `
      <div class="d-flex justify-content-between align-items-start">
        <div class="me-2">
          <div class="fw-bold">${_escapeHtml(r.store)} / ${_escapeHtml(
            r.item
        )}</div>
          <div class="text-truncate-2 small text-muted">${_escapeHtml(
            r.task
        )}</div>
          <div class="small mt-1">
            <span class="me-2 ${isOverdue ? "text-danger fw-bold" : ""
            }"><i class="bi bi-calendar-event"></i> ${dueStr}</span>
            <span><i class="bi bi-person"></i> ${_escapeHtml(
                r.owner || "-"
            )}</span>
          </div>
        </div>
        <div>
          <button class="btn btn-sm btn-outline-danger" onclick="deleteTask(${r.id
            })"><i class="bi bi-trash"></i></button>
        </div>
      </div>
    `;
        listMobile.appendChild(div);
    }

    // ヘッダの矢印UI（任意）
    const thMap = {
        店舗名: "thStore",
        項目: "thItem",
        タスク: "thTask",
        期限: "thDue",
        責任者: "thOwner",
    };
    Object.entries(thMap).forEach(([key, id]) => {
        const th = document.getElementById(id);
        if (!th) return;
        th.querySelector(".sort-caret")?.remove();
        if (
            key === _tasksSort.field ||
            (key === "期限" && _tasksSort.field === "期限")
        ) {
            const span = document.createElement("span");
            span.className = "sort-caret ms-1";
            span.textContent = _tasksSort.asc ? "▲" : "▼";
            th.appendChild(span);
        }
    });

    // ★ ここでBadge更新（awaitしなくてOK）★
    updateOverdueBadge(overdueCount);
}

// 期限超過件数に応じて、UIバッジ・アプリアイコンバッジ・通知を制御
export async function updateOverdueBadge(count = 0) {
    // --- 正規化 ---
    count = Number.isFinite(+count) && +count > 0 ? Math.floor(+count) : 0;

    // --- 画面上のバッジ更新（あれば）---
    try {
        const badgeEl = document.querySelector('[data-role="overdue-badge"]') || document.getElementById('overdueBadge');
        if (badgeEl) {
            if (count > 0) {
                badgeEl.textContent = String(count);
                badgeEl.classList.remove('d-none', 'visually-hidden');
            } else {
                badgeEl.textContent = '';
                badgeEl.classList.add('d-none');
            }
        }
    } catch (e) {
        console.warn('Badge element update failed:', e);
    }

    // --- タイトルに件数をバッジ表示 ---
    try {
        const base = updateOverdueBadge._baseTitle || document.title.replace(/^\(\d+\)\s*/, '');
        updateOverdueBadge._baseTitle = base;
        document.title = (count > 0 ? `(${count}) ` : '') + base;
    } catch (e) {
        console.warn('Title update failed:', e);
    }

    // --- PWA Badging API（対応ブラウザのみ）---
    try {
        if ('setAppBadge' in navigator) {
            if (count > 0) {
                await navigator.setAppBadge(count);
            } else {
                await navigator.clearAppBadge?.();
            }
        }
    } catch (e) {
        console.warn('App badge update failed:', e);
    }

    // --- 通知制御 ---
    // 条件: 件数が増えた / 画面が非アクティブで一定時間（2h）以上通知していない、など
    try {
        const LS_KEY_LAST_COUNT = 'overdueBadge:lastCount';
        const LS_KEY_LAST_NOTIFY = 'overdueBadge:lastNotifyAt';
        const now = Date.now();
        const lastCount = parseInt(localStorage.getItem(LS_KEY_LAST_COUNT) || '0', 10);
        const lastNotifyAt = parseInt(localStorage.getItem(LS_KEY_LAST_NOTIFY) || '0', 10);
        const increased = count > lastCount;
        const twoHours = 2 * 60 * 60 * 1000;
        const quietPeriod = now - lastNotifyAt < twoHours;

        // 通知するかの判定
        const shouldNotify =
            count > 0 &&
            (increased || (document.hidden && !quietPeriod));

        // 先に保存（失敗しても通知判定は変わらない）
        localStorage.setItem(LS_KEY_LAST_COUNT, String(count));

        if (!shouldNotify) return;

        // 通知権限チェック
        if ('Notification' in window) {
            let perm = Notification.permission;
            if (perm === 'default') {
                // 可能ならその場で権限確認（ユーザー操作中で呼ぶのが理想だが、ここでは一括制御）
                perm = await Notification.requestPermission();
            }
            if (perm === 'granted') {
                const title = `${count}件の期限超過タスク`;
                const newly = Math.max(0, count - lastCount);
                const body = increased && newly > 0
                    ? `新たに${newly}件が期限切れになりました。確認してください。`
                    : `期限超過中のタスクが${count}件あります。`;

                const options = {
                    body,
                    tag: 'overdue-tasks',        // 同一タグでまとめて更新
                    renotify: true,              // 同タグ通知を上書きしつつ音/バイブ可
                    requireInteraction: false,   // 自動で消える
                    timestamp: now,
                    // 以下はあなたのPWAのアイコンパスに合わせて調整してください
                    icon: '/icons/icon-192.png',
                    badge: '/icons/badge.png',
                    data: { url: location.origin + location.pathname + '#tasks' },
                    actions: [{ action: 'open', title: 'タスクを開く' }],
                };

                // SW経由で表示できればそちらを優先（バックグラウンドでも表示可）
                const reg = await navigator.serviceWorker?.getRegistration();
                if (reg && reg.showNotification) {
                    await reg.showNotification(title, options);
                } else {
                    // フォールバック
                    new Notification(title, options);
                }
                localStorage.setItem(LS_KEY_LAST_NOTIFY, String(now));
            }
        }
    } catch (e) {
        console.warn('Notification handling failed:', e);
    }
}

// タスク再取得＆描画
export async function fetchAndDisplayTasks(force = false) {
    // 初回や明示更新以外で、既にキャッシュがある時は再取得をスキップ
    if (!force && _tasksCache.length) {
        _renderTasks();
        return;
    }

    try {
        await _ensureTaskStoreSelects();
        const list = await _fetchTasksRaw();
        _tasksCache = list;
        _renderTasks();
    } catch (e) {
        console.error(e);
        const tbody = document.querySelector("#tasksTable tbody");
        const listMobile = document.getElementById("tasksListMobile");
        if (tbody)
            tbody.innerHTML = `<tr><td colspan="6" class="text-danger">タスクを取得できませんでした</td></tr>`;
        if (listMobile)
            listMobile.innerHTML = `<div class="list-group-item text-danger">タスクを取得できませんでした</div>`;
    }
}

// タスク追加（一覧上部のフォーム）
export async function addTaskFromList() {
    const store =
        document.getElementById("taskAddStoreSelect")?.value?.trim() || "";
    const item = document.getElementById("taskAddItemInput")?.value?.trim() || "";
    const task =
        document.getElementById("taskAddDetailInput")?.value?.trim() || "";
    const due = document.getElementById("taskAddDueInput")?.value || null;
    const owner =
        document.getElementById("taskAddOwnerInput")?.value?.trim() || null;

    if (!store || !item || !task) {
        alert("「店舗名」「項目」「タスク」は必須です");
        return;
    }

    // 現在月の診断表を作成/取得し、その id を使ってタスクを紐付け
    const month = _currentYYYYMM();
    const diagId = await (async () => {
        // 既存を探す
        let { data, error } = await supabase
            .from("店舗診断表")
            .select("id")
            .eq("店舗名", store)
            .eq("月", month)
            .eq("項目", item)
            .limit(1);
        if (error) throw error;
        if (data && data[0]) return data[0].id;

        // 無ければ upsert
        const { error: upErr } = await supabase
            .from("店舗診断表")
            .upsert([{ 店舗名: store, 月: month, 項目: item }], {
                onConflict: "店舗名,月,項目",
            });
        if (upErr) throw upErr;

        // もう一度取得
        const res = await supabase
            .from("店舗診断表")
            .select("id")
            .eq("店舗名", store)
            .eq("月", month)
            .eq("項目", item)
            .limit(1);
        if (res.error) throw res.error;
        return res.data?.[0]?.id;
    })();

    if (!diagId) {
        alert("店舗診断表の作成/取得に失敗しました");
        return;
    }

    const { error } = await supabase.from("タスクテーブル").insert([
        {
            店舗診断表_id: diagId,
            項目: item,
            タスク: task,
            期限: due,
            責任者: owner,
        },
    ]);

    if (error) {
        console.error(error);
        alert("タスクの追加に失敗しました");
        return;
    }

    // 入力クリア & 再取得
    document.getElementById("taskAddItemInput").value = "";
    document.getElementById("taskAddDetailInput").value = "";
    document.getElementById("taskAddDueInput").value = "";
    document.getElementById("taskAddOwnerInput").value = "";
    await fetchAndDisplayTasks(true);
    alert("タスクを追加しました");
}

// タスク削除
export async function deleteTask(id) {
    if (!confirm("このタスクを削除しますか？")) return;
    const { error } = await supabase.from("タスクテーブル").delete().eq("id", id);
    if (error) {
        console.error(error);
        alert("削除に失敗しました");
        return;
    }
    await fetchAndDisplayTasks(true);
}

if (typeof window !== "undefined") {
    // 外部（HTML）から呼べるように公開
    window.fetchAndDisplayTasks = fetchAndDisplayTasks;
    window.addTaskFromList = addTaskFromList;
    window.sortTasks = sortTasks;
    window.deleteTask = deleteTask;
    window.refreshTasks = () => fetchAndDisplayTasks(true);
}
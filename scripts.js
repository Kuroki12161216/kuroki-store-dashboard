import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm";

// ★ 実際のプロジェクトのSupabase URL / anon keyを設定してください
const SUPABASE_URL = "https://djgylzypyunbcetvquom.supabase.co";
const SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRqZ3lsenlweXVuYmNldHZxdW9tIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDA4MTk3MjgsImV4cCI6MjA1NjM5NTcyOH0.tRwiVkMiCIvONpjyAJAt3FZ2iUIy6ihaAiHMtZ3bFI0";
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// 画面切り替え要素
const diagnosticSection = document.getElementById("diagnosticSection");
const taskSection = document.getElementById("taskSection");

// 店舗診断表
const storeSelect = document.getElementById("storeSelect");
const diagnosticsCardContainer = document.getElementById(
  "diagnosticsCardContainer"
);

// タスク一覧
const storeSelectTask = document.getElementById("storeSelectTask");
const monthSelectTask = document.getElementById("monthSelectTask");
const tasksTableBody = document.querySelector("#tasksTable tbody");

// タスク一覧→追加フォーム
const taskAddStoreSelect = document.getElementById("taskAddStoreSelect");
const taskAddItemInput = document.getElementById("taskAddItemInput");
const taskAddDetailInput = document.getElementById("taskAddDetailInput");
const taskAddDueInput = document.getElementById("taskAddDueInput");
const taskAddOwnerInput = document.getElementById("taskAddOwnerInput");

// モーダル関連
const modalDiagnosticId = document.getElementById("modalDiagnosticId");
const modalHypothesisInput = document.getElementById("modalHypothesisInput");
const modalNextActionInput = document.getElementById("modalNextActionInput");
const modalTaskItem = document.getElementById("modalTaskItem");
const modalTaskDetail = document.getElementById("modalTaskDetail");
const modalTaskDue = document.getElementById("modalTaskDue");
const modalTaskOwner = document.getElementById("modalTaskOwner");

// タスク一覧のソート用
let tasksDataGlobal = []; // 現在取得しているタスク一覧
let currentSortColumn = null; // ソート中の列
let currentSortDir = "asc"; // 昇順 or 降順

// 各THへの参照(ソート矢印を表示するため)
const thItem = document.getElementById("thItem");
const thTask = document.getElementById("thTask");
const thDue = document.getElementById("thDue");
const thOwner = document.getElementById("thOwner");

let bootstrapModal = null;

// 画面切り替え
window.showDiagnosticSection = function () {
  diagnosticSection.style.display = "block";
  taskSection.style.display = "none";
};
window.showTaskSection = function () {
  diagnosticSection.style.display = "none";
  taskSection.style.display = "block";
};

// ページ初期処理
window.addEventListener("DOMContentLoaded", async () => {
  await initStoreDropdowns();
  await fetchAndDisplayDiagnostics();
  await fetchAndDisplayTasks();
  await initMonthDropdown();
});

// 店舗一覧をプルダウンに反映
async function initStoreDropdowns() {
  // 「店舗診断表」テーブルから distinct な店舗名一覧を取得
  const { data, error } = await supabase.from("店舗診断表").select("店舗名");
  if (error) {
    console.error("店舗一覧取得エラー:", error);
    return;
  }
  const storeNames = [...new Set(data.map((item) => item.店舗名))];

  // 診断表のプルダウン
  storeNames.forEach((name) => {
    const opt = document.createElement("option");
    opt.value = name;
    opt.textContent = name;
    storeSelect.appendChild(opt);
  });
  // タスク一覧のプルダウン
  storeNames.forEach((name) => {
    const opt = document.createElement("option");
    opt.value = name;
    opt.textContent = name;
    storeSelectTask.appendChild(opt);
  });
  // タスク追加フォームのプルダウン
  storeNames.forEach((name) => {
    const opt = document.createElement("option");
    opt.value = name;
    opt.textContent = name;
    taskAddStoreSelect.appendChild(opt);
  });
}

// 月選択プルダウンの初期化
async function initMonthDropdown() {
  // 「店舗診断表」テーブルから distinct な対象月一覧を取得すると仮定
  const { data, error } = await supabase.from("店舗診断表").select("月");
  if (error) {
    console.error("月一覧取得エラー:", error);
    return;
  }
console.log(data)
  // 月選択プルダウンの要素を取得
  const monthSelect = document.getElementById("monthSelect");
  if (!monthSelect) {
    console.error("monthSelect 要素が見つかりません。");
    return;
  }

  // 重複を排除した月一覧を作成
  const distinctMonths = [...new Set(data.map((item) => item.月))];

  // プルダウンに選択肢を追加
  // 例: 「2025年3月」などの形式で格納されていると想定
  distinctMonths.forEach((month) => {
    const opt = document.createElement("option");
    opt.value = month;
    opt.textContent = month; // 画面に表示するテキスト
    monthSelect.appendChild(opt);
    // monthSelectTask.appendChild(opt);
  });
  distinctMonths.forEach((month) => {
    const opt = document.createElement("option");
    opt.value = month;
    opt.textContent = month; // 画面に表示するテキスト
    // monthSelect.appendChild(opt);
    monthSelectTask.appendChild(opt);
  });
}

// 月が変更されたときに呼び出される関数(例)
function fetchAndDisplayDiagnosticsByMonth() {
  const monthSelect = document.getElementById("monthSelect");
  const selectedMonth = monthSelect.value;

  // 取得した「選択月」を元にテーブルをフィルタする処理などを行う
  console.log("選択された月:", selectedMonth);

  // 実際にデータ取得して画面へ表示するための処理はここで書く
  // 例: supabase.from("店舗診断表").select("*").eq("対象月", selectedMonth)...
}


// ▼ 店舗・月の両方で診断表をフィルタしてカード表示する関数 (マージ版)
window.fetchAndDisplayDiagnostics = async function () {
  // 選択された店舗と月を取得
  const selectedStore = storeSelect.value;
  const selectedMonth = monthSelect.value;

  // クエリの初期状態 (すべての行を id の昇順で取得)
  let query = supabase
    .from("店舗診断表")
    .select("*")
    .order("id", { ascending: true });

  // 店舗が "all" でなければ店舗名で絞り込み
  if (selectedStore !== "all") {
    query = query.eq("店舗名", selectedStore);
  }

  // 月が "all" でなければ月で絞り込み
  if (selectedMonth !== "all") {
    query = query.eq("月", selectedMonth);
  }

  // データ取得
  const { data, error } = await query;
  if (error) {
    console.error("店舗診断表取得エラー:", error);
    return;
  }

  // 表示領域をクリア
  diagnosticsCardContainer.innerHTML = "";

  // 取得したデータを1件ずつカードとして生成・追加
  data.forEach((row) => {
    const colDiv = document.createElement("div");
    colDiv.className = "col";

    const cardDiv = document.createElement("div");
    cardDiv.className = "card h-100 shadow-sm";
    // カードクリック時の詳細モーダルを出すなどの場合
    cardDiv.onclick = () => openDiagnosticModal(row);

    const cardBody = document.createElement("div");
    cardBody.className = "card-body";

    // カードタイトル (項目)
    const cardTitle = document.createElement("h5");
    cardTitle.className = "card-title";
    cardTitle.textContent = row.項目 || "(項目なし)";

    // 差異 (〇 or ×) の表示
    const diffSpan = document.createElement("span");
    if (row.差異 === "〇") {
      diffSpan.style.color = "red";
      diffSpan.style.fontWeight = "bold";
      diffSpan.textContent = " 〇"; // 前に半角スペースで項目名と区別
    } else {
      diffSpan.style.color = "black";
      diffSpan.style.fontWeight = "bold";
      diffSpan.textContent = " ×";
    }
    cardTitle.appendChild(diffSpan);

    // サブタイトル（店舗名 / 月）
    const cardSubtitle = document.createElement("h6");
    cardSubtitle.className = "card-subtitle mb-2 text-muted";
    cardSubtitle.textContent = `店舗: ${row.店舗名} / 月: ${row.月}`;

    // 目標と実績の簡易表示
    const diffP = document.createElement("p");
    diffP.className = "card-text";
    diffP.textContent = `目標: ${row.目標数値}, 実績: ${row.実績}`;

    // 仮説（「もっと読む」リンク付き）
    const hypoP = createTruncatedParagraph("仮説", row.仮説 || "", 50);

    // ネクストアクション（「もっと読む」リンク付き）
    const actionP = createTruncatedParagraph("ネクスト", row.ネクストアクション || "", 50);

    // カード本文に要素を追加
    cardBody.appendChild(cardTitle);
    cardBody.appendChild(cardSubtitle);
    cardBody.appendChild(diffP);
    cardBody.appendChild(hypoP);
    cardBody.appendChild(actionP);

    cardDiv.appendChild(cardBody);
    colDiv.appendChild(cardDiv);
    diagnosticsCardContainer.appendChild(colDiv);
  });
}

// 「もっと読む」対応の補助関数
// カード上の「仮説」「ネクスト」にもっと読む機能を付ける関数
function createTruncatedParagraph(label, fullText, limit = 60) {
  const p = document.createElement("p");
  p.className = "card-text";
  // 空ならそのまま
  if (!fullText) {
    p.textContent = `${label}: `;
    return p;
  }
  if (fullText.length <= limit) {
    p.textContent = `${label}: ${fullText}`;
    return p;
  }
  // 長文なら最初 limit 文字 + もっと読むボタンを表示
  const truncated = fullText.substring(0, limit);

  p.innerHTML = `
          <span class="fw-bold">${label}:</span>
          <span class="js-short-text">${truncated}...</span>
          <button type="button"
                  class="btn btn-sm btn-outline-primary toggle-btn"
                  onclick="event.stopPropagation(); expandText(this, '${encodeURIComponent(
                    fullText
                  )}', '${label}')">
            もっと読む
          </button>
        `;
  return p;
}

// 「もっと読む」をクリック → 全文表示 + 「閉じる」ボタン
window.expandText = function (btn, encodedFullText, label) {
  const fullText = decodeURIComponent(encodedFullText);
  const parentParagraph = btn.parentElement;
  parentParagraph.innerHTML = `
          <span class="fw-bold">${label}:</span>
          <span class="js-full-text">${fullText}</span>
          <button type="button"
                  class="btn btn-sm btn-outline-danger toggle-btn"
                  onclick="event.stopPropagation(); collapseText(this, '${encodeURIComponent(
                    fullText
                  )}', '${label}')">
            閉じる
          </button>
        `;
};

// 「閉じる」をクリック → 再度省略表示に戻す
window.collapseText = function (btn, encodedFullText, label) {
  const fullText = decodeURIComponent(encodedFullText);
  const limit = 60;
  const truncated = fullText.substring(0, limit);
  const parentParagraph = btn.parentElement;
  parentParagraph.innerHTML = `
          <span class="fw-bold">${label}:</span>
          <span class="js-short-text">${truncated}...</span>
          <button type="button"
                  class="btn btn-sm btn-outline-primary toggle-btn"
                  onclick="event.stopPropagation(); expandText(this, '${encodeURIComponent(
                    fullText
                  )}', '${label}')">
            もっと読む
          </button>
        `;
};

// カードクリック → モーダル表示
function openDiagnosticModal(row) {
  if (!bootstrapModal) {
    bootstrapModal = new bootstrap.Modal(
      document.getElementById("diagnosticModal"),
      {}
    );
  }
  // 値をセット
  modalDiagnosticId.value = row.id;
  modalHypothesisInput.value = row.仮説 || "";
  modalNextActionInput.value = row.ネクストアクション || "";
  // タスク送信フォームをクリア
  modalTaskItem.value = "";
  modalTaskDetail.value = "";
  modalTaskDue.value = "";
  modalTaskOwner.value = "";

  bootstrapModal.show();
}

// 仮説・ネクストアクションを更新
window.updateDiagnostic = async function () {
  const id = modalDiagnosticId.value;
  const hypothesisValue = modalHypothesisInput.value;
  const nextActionValue = modalNextActionInput.value;

  if (!id) {
    alert("IDが取得できませんでした");
    return;
  }

  const { error } = await supabase
    .from("店舗診断表")
    .update({
      仮説: hypothesisValue,
      ネクストアクション: nextActionValue,
    })
    .eq("id", id);

  if (error) {
    alert("更新エラー:" + error.message);
  } else {
    alert("仮説・ネクストアクションを更新しました");
    fetchAndDisplayDiagnostics();
  }
};

// タスク送信フォーム（モーダル内）からタスクを追加
window.addTaskFromModal = async function () {
  const diagId = modalDiagnosticId.value;
  const item = modalTaskItem.value;
  const taskDetail = modalTaskDetail.value;
  const dueDate = modalTaskDue.value;
  const owner = modalTaskOwner.value;

  if (!diagId) {
    alert("診断表IDが存在しません");
    return;
  }
  if (!item || !taskDetail) {
    alert("「項目」「タスク」は必須です");
    return;
  }

  const { error } = await supabase.from("タスクテーブル").insert([
    {
      項目: item,
      タスク: taskDetail,
      期限: dueDate,
      責任者: owner,
      店舗診断表_id: diagId,
    },
  ]);

  if (error) {
    alert("タスク追加エラー:" + error.message);
  } else {
    alert("タスクを追加しました");
    // フォームをクリア
    modalTaskItem.value = "";
    modalTaskDetail.value = "";
    modalTaskDue.value = "";
    modalTaskOwner.value = "";
  }
};

// タスク追加フォーム（タスク一覧画面）
window.addTaskFromList = async function () {
  const storeName = taskAddStoreSelect.value;
  const item = taskAddItemInput.value;
  const detail = taskAddDetailInput.value;
  const due = taskAddDueInput.value;
  const owner = taskAddOwnerInput.value;

  if (!storeName || !item || !detail) {
    alert("店舗名、項目、タスクは必須です");
    return;
  }

  // 該当する店舗診断表_idを検索
  const { data: diagData, error: diagError } = await supabase
    .from("店舗診断表")
    .select("id")
    .eq("店舗名", storeName)
    .eq("項目", item);
  if (diagError) {
    console.error("店舗診断表検索エラー:", diagError);
    return;
  }
  if (!diagData || diagData.length === 0) {
    alert("対応する店舗診断表が見つかりません");
    return;
  }

  // とりあえず最初のIDを取得して紐づけ
  const diagId = diagData[0].id;

  // タスクテーブルに挿入
  const { error: insertError } = await supabase.from("タスクテーブル").insert([
    {
      項目: item,
      タスク: detail,
      期限: due,
      責任者: owner,
      店舗診断表_id: diagId,
    },
  ]);
  if (insertError) {
    alert("タスク追加エラー:" + insertError.message);
  } else {
    alert("タスクを追加しました");
    // フォームクリア
    taskAddItemInput.value = "";
    taskAddDetailInput.value = "";
    taskAddDueInput.value = "";
    taskAddOwnerInput.value = "";
    // 再描画
    fetchAndDisplayTasks();
  }
};

// タスク一覧の取得・表示
window.fetchAndDisplayTasks = async function () {
  const selectedStore = storeSelectTask.value;
  // まず全件(or 店舗絞り込み分)を取得し、フロントでソートをする
  let query = supabase.from("タスクテーブル").select("*");

  // 店舗名でフィルタ → 店舗診断表から店舗診断表_idを割り出して in 検索
  if (selectedStore !== "all") {
    const { data: diagData, error: diagError } = await supabase
      .from("店舗診断表")
      .select("id, 店舗名");
    if (diagError) {
      console.error("店舗診断表取得エラー:", diagError);
      return;
    }
    // 選択した店舗名に合致する診断表IDを抽出
    const matchedRows = diagData.filter((d) => d.店舗名 === selectedStore);
    const matchedIds = matchedRows.map((d) => d.id);
    if (matchedIds.length === 0) {
      // 該当が無い場合はテーブルをクリアして終了
      tasksDataGlobal = [];
      renderTasks();
      return;
    }
    query = query.in("店舗診断表_id", matchedIds);
  }

  const { data: result, error } = await query;
  if (error) {
    console.error("タスク一覧取得エラー:", error);
    return;
  }
  tasksDataGlobal = result;
  // 初期はソート指定なし → そのまま表示
  renderTasks();
  updateSortIndicators(null, null); // 矢印をリセット
};

// タスクテーブルを描画
function renderTasks() {
  tasksTableBody.innerHTML = "";

  tasksDataGlobal.forEach((row) => {
    const tr = document.createElement("tr");

    const itemTd = document.createElement("td");
    itemTd.textContent = row.項目 || "";

    const taskTd = document.createElement("td");
    taskTd.textContent = row.タスク || "";

    const dueTd = document.createElement("td");
    dueTd.textContent = row.期限 || "";

    const ownerTd = document.createElement("td");
    ownerTd.textContent = row.責任者 || "";

    const operationTd = document.createElement("td");
    const deleteBtn = document.createElement("button");
    deleteBtn.textContent = "削除";
    deleteBtn.className = "btn btn-danger btn-sm";
    deleteBtn.onclick = async () => {
      if (!confirm("このタスクを削除しますか？")) return;
      const { error: deleteError } = await supabase
        .from("タスクテーブル")
        .delete()
        .eq("id", row.id);
      if (deleteError) {
        alert("削除エラー:" + deleteError.message);
      } else {
        alert("削除しました");
        fetchAndDisplayTasks();
      }
    };
    operationTd.appendChild(deleteBtn);

    tr.appendChild(itemTd);
    tr.appendChild(taskTd);
    tr.appendChild(dueTd);
    tr.appendChild(ownerTd);
    tr.appendChild(operationTd);

    tasksTableBody.appendChild(tr);
  });
}

// テーブルのソートをトグル
window.sortTasks = function (column) {
  // 同じ列を連続クリックなら昇降をトグル、それ以外なら昇順に
  if (currentSortColumn === column) {
    currentSortDir = currentSortDir === "asc" ? "desc" : "asc";
  } else {
    currentSortColumn = column;
    currentSortDir = "asc";
  }

  // ソート処理(文字列ベース)
  tasksDataGlobal.sort((a, b) => {
    let valA = a[column] || "";
    let valB = b[column] || "";
    // 「期限」を日付ソートしたいならパースするなど細かい対応が可能
    if (currentSortDir === "asc") {
      return valA.localeCompare(valB);
    } else {
      return valB.localeCompare(valA);
    }
  });

  // テーブル再描画
  renderTasks();
  // ソート矢印の更新
  updateSortIndicators(currentSortColumn, currentSortDir);
};

// ソート矢印の更新
function updateSortIndicators(column, dir) {
  // 一度全部リセット
  thItem.textContent = "項目";
  thTask.textContent = "タスク";
  thDue.textContent = "期限";
  thOwner.textContent = "責任者";

  if (!column) return;
  // ソート中の列だけ矢印を付ける
  let arrow = dir === "asc" ? " ▲" : " ▼";
  if (column === "項目") {
    thItem.textContent += arrow;
  } else if (column === "タスク") {
    thTask.textContent += arrow;
  } else if (column === "期限") {
    thDue.textContent += arrow;
  } else if (column === "責任者") {
    thOwner.textContent += arrow;
  }
}

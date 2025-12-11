import { supabase } from "./supabaseClient.js";
/* ===== ダッシュボード：初期化 ===== */
window.addEventListener("DOMContentLoaded", async () => {
  await initDashboard();
  // ハッシュで初期表示を分岐
  const h = (location.hash || "").toLowerCase();
  if (h === "#tasks") {
    showTaskSection();
  } else if (h === "#inspections") {
    showInspectionSection();
  } else if (h === "#settings") {
    showSettingsSection();
  } else {
    showDashboardSection();
  }
});

/* ===== Chart.js ローダ ===== */
async function ensureChartJs() {
  if (window.Chart) return;
  await new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = "https://cdn.jsdelivr.net/npm/chart.js";
    s.onload = resolve;
    s.onerror = reject;
    document.head.appendChild(s);
  });
}

/* ======================================================================
   ==================  ダッシュボード本体  ===============================
   ====================================================================== */
async function initDashboard() {
  await ensureChartJs();

  // DOM 参照
  const storeSelect = document.getElementById("store-select");
  const chartStoreSelect = document.getElementById("chart-store-select");
  const targetDateInput = document.getElementById("target-date");
  const fiscalYearSelect = document.getElementById("fiscal-year");
  const toggleYoy = document.getElementById("toggle-yoy");
  const rankTableBody = document.querySelector("#score-ranking-table tbody");

  // モーダル（数値編集）
  const editModal = document.getElementById("edit-modal");
  const editTitleStore = document.getElementById("edit-title-store");
  const editTitleSub = document.getElementById("edit-title-sub");
  const editStore = document.getElementById("edit-store");
  const editMonth = document.getElementById("edit-month");
  const editItem = document.getElementById("edit-item");
  const editTarget = document.getElementById("edit-target");
  const editActual = document.getElementById("edit-actual");
  const btnEditCancel = document.getElementById("btn-cancel");
  const btnEditSave = document.getElementById("btn-save");
  const btnEditClose = document.getElementById("edit-close");

  // モーダル（仮説・ネクスト＆タスク）
  const detailModal = document.getElementById("detail-modal");
  const detailId = document.getElementById("detail-id");
  const detailTitleStore = document.getElementById("detail-title-store");
  const detailTitleSub = document.getElementById("detail-title-sub");
  const detailStore = document.getElementById("detail-store");
  const detailMonth = document.getElementById("detail-month");
  const detailItem = document.getElementById("detail-item");
  const detailHypo = document.getElementById("detail-hypo");
  const detailNext = document.getElementById("detail-next");
  const btnDetailSave = document.getElementById("btn-detail-save");
  const btnDetailSend = document.getElementById("btn-detail-send");
  const detailClose = document.getElementById("detail-close");
  const taskItem = document.getElementById("task-item");
  const taskDetail = document.getElementById("task-detail");
  const taskDue = document.getElementById("task-due");
  const taskOwner = document.getElementById("task-owner");

  // KPIカード・項目対応
  const kpiList = [
    { id: "kpi-sales", item: "売上" },
    { id: "kpi-unitprice", item: "単価" },
    { id: "kpi-labour-sales", item: "人時売上高" },
    { id: "kpi-F", item: "F" },
    { id: "kpi-D", item: "D" },
    { id: "kpi-labour-cost", item: "人件費" },
    { id: "kpi-inspection-sheet", item: "臨店シート" },
    { id: "kpi-mtg-rate", item: "店舗MTG参加率" },
    { id: "kpi-cs-score", item: "CSアンケート" },
    { id: "kpi-interview-progress", item: "面談進捗" },
    { id: "kpi-referral-hires", item: "PAリファラル採用" },
    { id: "kpi-score", item: "点数" },
  ];
  const percentItems = new Set([
    "F",
    "D",
    "人件費",
    "店舗MTG参加率",
    "面談進捗",
  ]);
  const yenItems = new Set(["売上", "単価", "人時売上高"]);
  const unitMap = {
    売上: "円",
    単価: "円",
    人時売上高: "円",
    F: "%",
    D: "%",
    人件費: "%",
    店舗MTG参加率: "%",
    面談進捗: "%",
    臨店シート: "",
    CSアンケート: "点",
    PAリファラル採用: "名",
    点数: "点",
  };

  // チャート
  const ctxSales = document.getElementById("salesChart")?.getContext("2d");
  const ctxUnit = document.getElementById("unitPriceChart")?.getContext("2d");
  const ctxLabour = document
    .getElementById("labourSalesChart")
    ?.getContext("2d");
  let salesChart = null,
    unitChart = null,
    labourChart = null;

  // Utils
  const toYYYYMM = (d) =>
    `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}`;
  const labelYYYYMM = (yyyymm) => `${yyyymm.slice(0, 4)}/${yyyymm.slice(4, 6)}`;
  const formatYen = (v) => "¥ " + Number(v ?? 0).toLocaleString();
  const currentFYStartYear = (() => {
    const t = new Date(),
      y = t.getFullYear(),
      m = t.getMonth() + 1;
    return m >= 4 ? y : y - 1;
  })();
  function getFiscalMonths(fyStartYear) {
    const arr = [];
    for (let i = 0; i < 12; i++) {
      arr.push(toYYYYMM(new Date(fyStartYear, 3 + i, 1)));
    }
    return arr;
  }

  // 店舗一覧
  async function getUniqueStores() {
    const { data, error } = await supabase
      .from("店舗診断表")
      .select("店舗名")
      .order("店舗名", { ascending: true });
    if (error) {
      console.error("店舗名取得エラー:", error);
      return [];
    }
    return Array.from(new Set((data || []).map((r) => r.店舗名)));
  }
  async function populateStoreSelects() {
    const stores = await getUniqueStores();
    storeSelect.innerHTML = "";
    chartStoreSelect.innerHTML = "";
    stores.forEach((name) => {
      const o1 = document.createElement("option");
      o1.value = o1.textContent = name;
      storeSelect.appendChild(o1);
      const o2 = document.createElement("option");
      o2.value = o2.textContent = name;
      chartStoreSelect.appendChild(o2);
    });
  }
  async function populateFiscalYears(store) {
    if (!store) return;
    const { data, error } = await supabase
      .from("店舗診断表")
      .select("月")
      .eq("店舗名", store)
      .eq("項目", "売上")
      .order("月", { ascending: true });
    if (error) {
      console.error("期抽出エラー:", error);
      return;
    }
    const months = (data || []).map((r) => String(r.月));
    const fySet = new Set();
    months.forEach((m) => {
      const y = +m.slice(0, 4),
        mm = +m.slice(4, 6);
      fySet.add(mm >= 4 ? y : y - 1);
    });
    const fyList = Array.from(fySet).sort((a, b) => b - a);
    fiscalYearSelect.innerHTML = "";
    fyList.forEach((y) => {
      const opt = document.createElement("option");
      opt.value = y;
      opt.textContent = `${y}期（${y}/04〜${y + 1}/03）`;
      fiscalYearSelect.appendChild(opt);
    });
    const def = fyList.includes(currentFYStartYear)
      ? currentFYStartYear
      : fyList[0];
    if (def) fiscalYearSelect.value = def;
  }

  async function fetchMetric(store, item, months) {
    const { data, error } = await supabase
      .from("店舗診断表")
      .select("月,目標数値,実績")
      .eq("店舗名", store)
      .eq("項目", item)
      .in("月", months);
    if (error) {
      console.error("fetchMetric error:", error);
      return {};
    }
    const map = {};
    (data || []).forEach((r) => {
      map[String(r.月)] = {
        target: r.目標数値 != null ? Number(r.目標数値) : null,
        actual: r.実績 != null ? Number(r.実績) : null,
      };
    });
    return map;
  }
  function calcYoYPercent(currActualArr, prevActualArr) {
    return currActualArr.map((v, i) => {
      const p = prevActualArr[i];
      if (p == null || p === 0 || v == null) return null;
      return (v / p - 1) * 100;
    });
  }
  function renderChart(
    ctx,
    labels,
    targetArr,
    actualArr,
    yoyPercentArr,
    title,
    unit,
    showYoY,
    existingChartRef
  ) {
    if (!ctx) return null;
    if (existingChartRef) existingChartRef.destroy();
    const datasets = [
      { label: "目標", data: targetArr, tension: 0.1, fill: false },
      { label: "実績", data: actualArr, tension: 0.1, fill: false },
    ];
    if (showYoY)
      datasets.push({
        label: "昨対比(%)",
        data: yoyPercentArr,
        yAxisID: "y2",
        tension: 0.1,
        borderDash: [5, 5],
        spanGaps: true,
      });
    return new Chart(ctx, {
      type: "line",
      data: { labels, datasets },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        spanGaps: true,
        plugins: {
          title: { display: true, text: title },
          legend: { display: true },
          tooltip: {
            callbacks: {
              label: (c) => {
                const name = c.dataset.label || "",
                  val = c.raw;
                if (name.includes("昨対比"))
                  return `${name}: ${val == null ? "-" : val.toFixed(1)}%`;
                if (unit === "yen")
                  return `${name}: ${val == null ? "-" : formatYen(val)}`;
                return `${name}: ${
                  val == null ? "-" : Number(val).toLocaleString()
                }`;
              },
            },
          },
        },
        scales: {
          x: {
            type: "category",
            ticks: { autoSkip: false, maxRotation: 45, minRotation: 0 },
            title: { display: true, text: "月" },
          },
          y: {
            beginAtZero: true,
            title: { display: true, text: unit === "yen" ? "金額" : "値" },
            ticks: {
              callback: (v) =>
                unit === "yen" ? (v === 0 ? "0" : v.toLocaleString()) : v,
            },
          },
          y2: {
            position: "right",
            grid: { drawOnChartArea: false },
            ticks: { callback: (v) => `${v}%` },
            title: { display: showYoY, text: showYoY ? "昨対比(%)" : "" },
            suggestedMin: -50,
            suggestedMax: 50,
          },
        },
      },
    });
  }

  async function renderAllCharts() {
    const store = chartStoreSelect.value || storeSelect.value;
    const fy = Number(fiscalYearSelect.value);
    if (!store || !fy) return;
    const months = getFiscalMonths(fy),
      prevMonths = getFiscalMonths(fy - 1),
      labels = months.map(labelYYYYMM),
      showYoY = toggleYoy.checked;

    const salesCurr = await fetchMetric(store, "売上", months),
      salesPrev = await fetchMetric(store, "売上", prevMonths);
    const salesTarget = months.map((m) => salesCurr[m]?.target ?? null);
    const salesActual = months.map((m) => salesCurr[m]?.actual ?? null);
    const salesPrevActual = prevMonths.map((m) => salesPrev[m]?.actual ?? null);
    const salesYoY = calcYoYPercent(salesActual, salesPrevActual);
    salesChart = renderChart(
      ctxSales,
      labels,
      salesTarget,
      salesActual,
      salesYoY,
      `${store}：売上 目標／実績（${fy}/04〜${fy + 1}/03）`,
      "yen",
      showYoY,
      salesChart
    );

    const unitCurr = await fetchMetric(store, "単価", months),
      unitPrev = await fetchMetric(store, "単価", prevMonths);
    const unitTarget = months.map((m) => unitCurr[m]?.target ?? null);
    const unitActual = months.map((m) => unitCurr[m]?.actual ?? null);
    const unitPrevActual = prevMonths.map((m) => unitPrev[m]?.actual ?? null);
    const unitYoY = calcYoYPercent(unitActual, unitPrevActual);
    unitChart = renderChart(
      ctxUnit,
      labels,
      unitTarget,
      unitActual,
      unitYoY,
      `${store}：客単価 目標／実績（${fy}/04〜${fy + 1}/03）`,
      "yen",
      showYoY,
      unitChart
    );

    const labourCurr = await fetchMetric(store, "人時売上高", months),
      labourPrev = await fetchMetric(store, "人時売上高", prevMonths);
    const labourTarget = months.map((m) => labourCurr[m]?.target ?? null);
    const labourActual = months.map((m) => labourCurr[m]?.actual ?? null);
    const labourPrevActual = prevMonths.map(
      (m) => labourPrev[m]?.actual ?? null
    );
    const labourYoY = calcYoYPercent(labourActual, labourPrevActual);
    labourChart = renderChart(
      ctxLabour,
      labels,
      labourTarget,
      labourActual,
      labourYoY,
      `${store}：人時売上高 目標／実績（${fy}/04〜${fy + 1}/03）`,
      "number",
      showYoY,
      labourChart
    );
  }

  // スコア
  const LOWER_IS_BETTER = new Set(["F", "D", "人件費"]);
  function binaryScore(item, t, a) {
    if (a == null) return 10;
    if (Number(a) === 0) return 0;
    if (t == null) return 10;
    if (LOWER_IS_BETTER.has(item)) return Number(a) <= Number(t) ? 10 : 0;
    return Number(a) >= Number(t) ? 10 : 0;
  }
  const SCORE_ITEMS = [
    "売上",
    "単価",
    "人時売上高",
    "F",
    "D",
    "人件費",
    "臨店シート",
    "店舗MTG参加率",
    "CSアンケート",
    "面談進捗",
    "PAリファラル採用",
  ];

  async function computeScoreByItems(store, month) {
    const { data, error } = await supabase
      .from("店舗診断表")
      .select("項目,目標数値,実績")
      .eq("店舗名", store)
      .eq("月", month)
      .in("項目", SCORE_ITEMS);
    if (error) {
      console.error("computeScore error", error);
      return null;
    }
    const map = {};
    (data || []).forEach((r) => (map[r.項目] = { t: r.目標数値, a: r.実績 }));
    let total = 0;
    SCORE_ITEMS.forEach((it) => {
      const pair = map[it] || {};
      total += binaryScore(
        it,
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
    const directMap = {};
    if (!error && scoreRows) {
      scoreRows.forEach(
        (r) => (directMap[r.店舗名] = Math.round(Number(r.実績 || 0)))
      );
    }

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
      const badgeClass =
        idx === 0 ? "gold" : idx === 1 ? "silver" : idx === 2 ? "bronze" : "";
      const tr = document.createElement("tr");
      tr.innerHTML = `<td><span class="rank-badge ${badgeClass}">${
        idx + 1
      }</span></td><td>${r.store}</td><td>${r.score} / 110点</td>`;
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
    if (error) {
      console.error("KPI取得エラー:", error);
      return;
    }

    function asPercentInt(v) {
      if (v == null) return null;
      const n = Number(v);
      const pct = Math.abs(n) <= 1 ? n * 100 : n;
      return Math.round(pct);
    }
    function roundIfNeeded(item, n) {
      return item === "単価" || item === "人時売上高"
        ? Math.round(Number(n))
        : Number(n);
    }

    for (const { id, item } of kpiList) {
      const card = document.getElementById(id);
      if (!card) continue;
      const valueEl = card.querySelector(".value");
      const trendEl = card.querySelector(".trend");
      const iconEl = card.querySelector(".icon");
      const percentEl = card.querySelector(".percent");

      let targetBadge = card.querySelector(".target-badge");
      if (!targetBadge) {
        targetBadge = document.createElement("span");
        targetBadge.className = "target-badge";
        card.appendChild(targetBadge);
      }

      let mini = card.querySelector(".mini-score");
      if (!mini && item !== "点数") {
        mini = document.createElement("span");
        mini.className = "mini-score";
        card.appendChild(mini);
      }

      const rec = (data || []).find((r) => r.項目 === item);
      const target = rec && rec.目標数値 != null ? Number(rec.目標数値) : null;
      const current = rec && rec.実績 != null ? Number(rec.実績) : null;

      if (item === "点数") {
        const totalScore = await computeScoreByItems(store, month);
        valueEl.textContent =
          totalScore != null ? `${totalScore} / 110点` : `-- / 110点`;
      } else {
        let text = "--";
        if (current != null) {
          if (percentItems.has(item)) {
            const iv = asPercentInt(current);
            text = `${iv}%`;
          } else if (yenItems.has(item)) {
            const v = roundIfNeeded(item, current);
            text = `${v.toLocaleString()} ${unitMap[item]}`;
          } else if (item === "PAリファラル採用") {
            text = `${Math.round(Number(current))} ${unitMap[item]}`;
          } else if (item === "CSアンケート") {
            text = `${Number(current).toLocaleString()} ${unitMap[item]}`;
          } else {
            text = `${Number(current).toLocaleString()}${unitMap[item] || ""}`;
          }
        }
        valueEl.textContent = text;
      }

      if (item === "点数") {
        targetBadge.textContent = "目標：110点";
      } else if (percentItems.has(item)) {
        const tv = target != null ? asPercentInt(target) : null;
        targetBadge.textContent = tv != null ? `目標：${tv}%` : "目標：--";
      } else if (yenItems.has(item)) {
        const tv = target != null ? roundIfNeeded(item, target) : null;
        targetBadge.textContent =
          tv != null
            ? `目標：${tv.toLocaleString()} ${unitMap[item]}`
            : "目標：--";
      } else {
        targetBadge.textContent =
          target != null
            ? `目標：${Number(target).toLocaleString()}${unitMap[item] || ""}`
            : "目標：--";
      }

      if (item !== "点数" && mini) {
        const s = binaryScore(item, target, current);
        mini.textContent = `${s}点`;
      }

      const prev = await fetchPrevValue(store, month, item);
      if (item !== "点数" && prev !== null && current != null) {
        const diff = current - prev;
        const rate = prev === 0 ? 0 : Math.round((diff / prev) * 100);
        if (rate >= 0) {
          iconEl.textContent = "▲";
          trendEl.classList.remove("down");
          trendEl.classList.add("up");
        } else {
          iconEl.textContent = "▼";
          trendEl.classList.remove("up");
          trendEl.classList.add("down");
        }
        percentEl.textContent = Math.abs(rate) + "%";
      } else {
        percentEl.textContent = "--%";
      }
    }
    await renderScoreRanking(month);
  }

  async function fetchPrevValue(store, month, item) {
    const y = Number(month.slice(0, 4)),
      m = Number(month.slice(4, 6));
    const prev = new Date(y, m - 2, 1);
    const prevStr = `${prev.getFullYear()}${String(
      prev.getMonth() + 1
    ).padStart(2, "0")}`;
    const { data, error } = await supabase
      .from("店舗診断表")
      .select("項目,実績")
      .eq("店舗名", store)
      .eq("月", prevStr);
    if (error || !data) return null;
    const rec = data.find((r) => r.項目 === item);
    return rec ? Number(rec.実績) : null;
  }

  /* ====== 仮説／ネクスト編集モーダル ====== */
  async function findOrCreateDiagnostic(store, month, item) {
    let { data, error } = await supabase
      .from("店舗診断表")
      .select("id, 仮説, ネクストアクション")
      .eq("店舗名", store)
      .eq("月", month)
      .eq("項目", item)
      .limit(1);
    if (error) throw error;
    if (data && data.length) return data[0];

    const { error: upErr } = await supabase
      .from("店舗診断表")
      .upsert([{ 店舗名: store, 月: month, 項目: item }], {
        onConflict: "店舗名,月,項目",
      });
    if (upErr) throw upErr;

    const res = await supabase
      .from("店舗診断表")
      .select("id, 仮説, ネクストアクション")
      .eq("店舗名", store)
      .eq("月", month)
      .eq("項目", item)
      .limit(1);
    if (res.error) throw res.error;
    return res.data && res.data[0] ? res.data[0] : null;
  }

  function openDetailModal(item) {
    if (item === "点数") return;
    const store = storeSelect.value;
    const monthRaw = (targetDateInput.value || "").slice(0, 7).replace("-", "");
    if (!store || !monthRaw) {
      alert("店舗と日付を選択してください。");
      return;
    }

    const monthLabel = `${monthRaw.slice(0, 4)}/${monthRaw.slice(4, 6)}`;
    detailTitleStore.textContent = store;
    detailTitleSub.textContent = `${monthLabel} / ${item}`;
    detailStore.value = store;
    detailMonth.value = monthRaw;
    detailItem.value = item;
    taskItem.value = item;
    taskDetail.value = "";
    taskDue.value = "";
    taskOwner.value = "";

    findOrCreateDiagnostic(store, monthRaw, item)
      .then((row) => {
        if (row) {
          detailId.value = row.id;
          detailHypo.value = row.仮説 ?? "";
          detailNext.value = row.ネクストアクション ?? "";
        }
        detailModal.hidden = false;
      })
      .catch((err) => {
        console.error(err);
        alert("データ取得に失敗しました");
      });
  }
  function closeDetail() {
    detailModal.hidden = true;
  }
  detailClose.addEventListener("click", closeDetail);
  detailModal.addEventListener("click", (e) => {
    if (e.target === detailModal) closeDetail();
  });

  btnDetailSave.addEventListener("click", async () => {
    const id = detailId.value;
    if (!id) {
      alert("ID取得に失敗しました");
      return;
    }
    const { error } = await supabase
      .from("店舗診断表")
      .update({ 仮説: detailHypo.value, ネクストアクション: detailNext.value })
      .eq("id", id);
    if (error) {
      alert("保存に失敗しました");
      return;
    }
    alert("仮説・ネクストアクションを保存しました");
    closeDetail();
  });

  btnDetailSend.addEventListener("click", async () => {
    const diagId = detailId.value;
    const item = taskItem.value;
    const tDetail = taskDetail.value.trim();
    const due = taskDue.value || null;
    const owner = taskOwner.value || null;
    if (!diagId) {
      alert("診断表IDがありません");
      return;
    }
    if (!item || !tDetail) {
      alert("「項目」「タスク」は必須です");
      return;
    }
    const { error } = await supabase.from("タスクテーブル").insert([
      {
        店舗診断表_id: diagId,
        項目: item,
        タスク: tDetail,
        期限: due,
        責任者: owner,
      },
    ]);
    if (error) {
      alert("タスク送信に失敗しました");
      return;
    }
    alert("タスクを送信しました");
    taskDetail.value = "";
    taskDue.value = "";
    taskOwner.value = "";
  });

  /* ====== 数値編集モーダル ====== */
  function openEditModal(item, e) {
    e?.stopPropagation();
    const store = storeSelect.value;
    const monthRaw = (targetDateInput.value || "").slice(0, 7).replace("-", "");
    if (!store || !monthRaw) {
      alert("店舗と日付を選択してください。");
      return;
    }

    const monthLabel = `${monthRaw.slice(0, 4)}/${monthRaw.slice(4, 6)}`;
    editTitleStore.textContent = store;
    editTitleSub.textContent = `${monthLabel} / ${item}`;
    editStore.value = store;
    editMonth.value = monthRaw;
    editItem.value = item;
    editTarget.value = "";
    editActual.value = "";
    supabase
      .from("店舗診断表")
      .select("目標数値,実績")
      .eq("店舗名", store)
      .eq("月", monthRaw)
      .eq("項目", item)
      .limit(1)
      .then(({ data, error }) => {
        if (!error && data && data[0]) {
          if (data[0].目標数値 != null)
            editTarget.value = Number(data[0].目標数値);
          if (data[0].実績 != null) editActual.value = Number(data[0].実績);
        }
      });
    editModal.hidden = false;
  }
  function closeEditModal() {
    editModal.hidden = true;
  }
  btnEditCancel.addEventListener("click", closeEditModal);
  btnEditClose.addEventListener("click", closeEditModal);
  editModal.addEventListener("click", (e) => {
    if (e.target === editModal) closeEditModal();
  });

  btnEditSave.addEventListener("click", async () => {
    const store = editStore.value,
      month = editMonth.value,
      item = editItem.value;
    const target =
      editTarget.value.trim() === "" ? null : Number(editTarget.value);
    const actual =
      editActual.value.trim() === "" ? null : Number(editActual.value);
    const { error } = await supabase.from("店舗診断表").upsert(
      [
        {
          店舗名: store,
          月: month,
          項目: item,
          目標数値: target,
          実績: actual,
        },
      ],
      { onConflict: "店舗名,月,項目" }
    );
    if (error) {
      console.error("保存エラー:", error);
      alert("保存に失敗しました");
      return;
    }
    closeEditModal();
    await updateAllKPIs(storeSelect.value, targetDateInput.value);
    await renderAllCharts();
  });

  // ✎ボタン設置 & カードクリック配線
  function attachEditButtonsAndCardClicks() {
    kpiList.forEach(({ id, item }) => {
      const card = document.getElementById(id);
      if (!card) return;
      // カードクリック → 仮説/ネクスト（点数は除外）
      if (item !== "点数") {
        card.addEventListener("click", () => openDetailModal(item));
      }
      // 鉛筆 → 数値編集
      if (!card.querySelector(".edit-btn")) {
        const btn = document.createElement("button");
        btn.className = "edit-btn";
        btn.title = `${item} を編集`;
        btn.innerText = "✎";
        btn.addEventListener("click", (e) => openEditModal(item, e));
        card.appendChild(btn);
      }
    });
  }

  // 初期化フロー
  const today = new Date();
  targetDateInput.value = today.toISOString().slice(0, 7);
  await populateStoreSelects();
  chartStoreSelect.value = storeSelect.value;
  await populateFiscalYears(storeSelect.value);
  attachEditButtonsAndCardClicks();
  await updateAllKPIs(storeSelect.value, targetDateInput.value);
  await renderAllCharts();

  // イベント
  storeSelect.addEventListener("change", async () => {
    await updateAllKPIs(storeSelect.value, targetDateInput.value);
  });
  targetDateInput.addEventListener("change", () => {
    updateAllKPIs(storeSelect.value, targetDateInput.value);
  });
  chartStoreSelect.addEventListener("change", async (e) => {
    await populateFiscalYears(e.target.value);
    await renderAllCharts();
  });
  fiscalYearSelect.addEventListener("change", renderAllCharts);
  toggleYoy.addEventListener("change", renderAllCharts);
}

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
  await _ensureTaskStoreSelects();

  // 一覧の再取得
  if (typeof window.fetchAndDisplayTasks === "function") {
    window.fetchAndDisplayTasks();
  } else if (typeof fetchAndDisplayTasks === "function") {
    fetchAndDisplayTasks();
  }
}

function updateNotificationBadge() {
  const badge = document.getElementById("notificationStatus");
  if (!badge) return;
  badge.classList.remove(
    "badge-perm-default",
    "badge-perm-granted",
    "badge-perm-denied"
  );
  const perm =
    typeof Notification !== "undefined" ? Notification.permission : "denied";
  if (perm === "granted") {
    badge.textContent = "許可";
    badge.classList.add("badge-perm-granted");
  } else if (perm === "denied") {
    badge.textContent = "拒否";
    badge.classList.add("badge-perm-denied");
  } else {
    badge.textContent = "未判定";
    badge.classList.add("badge-perm-default");
  }
}

function showSettingsSection() {
  switchSection("settingsSection");
  updateNotificationBadge();
}

// 設定画面の「通知の許可」ボタン用（未実装ならここで公開）
if (!("requestNotificationPermission" in window)) {
  window.requestNotificationPermission = async function () {
    if (!("Notification" in window)) {
      alert("このブラウザは通知に対応していません");
      return;
    }
    await Notification.requestPermission();
    updateNotificationBadge();
  };
}

// グローバル公開（HTMLのonclickから呼べるように）
window.showDashboardSection = showDashboardSection;
window.showTaskSection = showTaskSection;
window.showSettingsSection = showSettingsSection;
window.closeOffcanvas = closeOffcanvas;

/* =========================
   タスク一覧ページ：取得/描画/追加/削除/並べ替え
   ========================= */

// ユーティリティ
function _escapeHtml(s) {
  return (s ?? "")
    .toString()
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
function _fmtDateYYYYMMDD(d) {
  if (!d) return "";
  const t = new Date(d);
  if (isNaN(t)) return d;
  const y = t.getFullYear(),
    m = String(t.getMonth() + 1).padStart(2, "0"),
    day = String(t.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}
function _currentYYYYMM() {
  const v = document.getElementById("target-date")?.value;
  if (v) return v.slice(0, 7).replace("-", "");
  const t = new Date();
  return `${t.getFullYear()}${String(t.getMonth() + 1).padStart(2, "0")}`;
}

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

// タスク取得（店舗診断表と結合して店舗名を引く）
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
function sortTasks(field) {
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
            <span class="me-2 ${
              isOverdue ? "text-danger fw-bold" : ""
            }"><i class="bi bi-calendar-event"></i> ${dueStr}</span>
            <span><i class="bi bi-person"></i> ${_escapeHtml(
              r.owner || "-"
            )}</span>
          </div>
        </div>
        <div>
          <button class="btn btn-sm btn-outline-danger" onclick="deleteTask(${
            r.id
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
async function updateOverdueBadge(count = 0) {
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
    const base = updateOverdueBadge._baseTitle || document.title.replace(/^\(\d+\)\s*/,'');
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
async function fetchAndDisplayTasks(force = false) {
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
async function addTaskFromList() {
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
async function deleteTask(id) {
  if (!confirm("このタスクを削除しますか？")) return;
  const { error } = await supabase.from("タスクテーブル").delete().eq("id", id);
  if (error) {
    console.error(error);
    alert("削除に失敗しました");
    return;
  }
  await fetchAndDisplayTasks(true);
}

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

/* --- 月の表記を YYYY/MM に正規化（yyyymm/yyy-mm/Date も対応） --- */
function normalizeMonth(v) {
  if (!v) return "";
  if (typeof v === "number") v = String(v);
  if (/^\d{6}$/.test(v)) return `${v.slice(0, 4)}/${v.slice(4, 6)}`;
  if (/^\d{4}[-/]\d{1,2}$/.test(v)) {
    const m = v.match(/^(\d{4})[-/](\d{1,2})$/);
    return `${m[1]}/${String(m[2]).padStart(2, "0")}`;
  }
  // Date っぽいもの
  const dt = new Date(v);
  if (!isNaN(dt))
    return `${dt.getFullYear()}/${String(dt.getMonth() + 1).padStart(2, "0")}`;
  return String(v);
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
        ${
          row.カテゴリ値
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

      ${
        row.特記事項値
          ? `<div class="small text-muted mt-1">
               ${_escapeHtml(row.特記事項値)}
             </div>`
          : ""
      }

      ${
        !thumbHtml && row.URL値
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
    ${
      thumbHtml
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

/* --- セクション切替 --- */
window.showInspectionSection = function () {
  switchSection("inspectionSection");
  history.replaceState(null, "", "#inspections");
  if (!window.__insp_inited) {
    window.__insp_inited = true;
    initInspectionPage(); // 初回のみ
  }
};

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

function _monthToKey(v) {
  if (!v) return -1;
  if (typeof v === "number") v = String(v);
  if (/^\d{6}$/.test(v)) return Number(v); // yyyymm
  if (/^\d{4}-\d{1,2}$/.test(v)) {
    const [y, m] = v.split("-").map(Number);
    return y * 100 + m;
  }

  const dt = new Date(v);
  if (!isNaN(dt)) return dt.getFullYear() * 100 + (dt.getMonth() + 1);
  return -1;
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

/* ===== 臨店一覧：URL 加工／サムネ生成ユーティリティ ===== */

// カンマ・空白・改行で複数URLに対応
function _splitUrls(s) {
  return (s || "")
    .split(/[\s,、\n\r]+/)
    .map((u) => u.trim())
    .filter(Boolean);
}

// 画像拡張子なら true
function _isImageUrl(u) {
  return /\.(png|jpe?g|gif|webp|bmp|svg)(\?.*)?$/i.test(u);
}

// いろいろな Drive/Docs URLから ID を抽出
function _extractDriveId(url) {
  const patterns = [
    /\/file\/d\/([a-zA-Z0-9_-]{10,})/, // drive.google.com/file/d/ID
    /\/document\/d\/([a-zA-Z0-9_-]{10,})/, // docs.google.com/document/d/ID
    /\/spreadsheets\/d\/([a-zA-Z0-9_-]{10,})/, // docs.google.com/spreadsheets/d/ID
    /\/presentation\/d\/([a-zA-Z0-9_-]{10,})/, // docs.google.com/presentation/d/ID
    /[?&]id=([a-zA-Z0-9_-]{10,})/, // open?id=ID
  ];
  for (const re of patterns) {
    const m = url.match(re);
    if (m) return m[1];
  }
  return null;
}
function _driveThumbUrl(id, size = 240) {
  // 横幅px指定。表示が小さければ 160 などに変更
  return `https://drive.google.com/thumbnail?id=${id}&sz=w${size}`;
}

function _driveDirectViewUrl(id) {
  // 公開設定に依存。失敗時は次のサムネHDにフォールバック
  return `https://drive.google.com/uc?export=view&id=${id}`;
}
function _driveThumbHdUrl(id) {
  // 大きめサムネ（多くの場合こちらは表示されやすい）
  return `https://drive.google.com/thumbnail?id=${id}&sz=w1600`;
}

// Favicon用
function _faviconUrl(u) {
  try {
    const { hostname } = new URL(u);
    return `https://www.google.com/s2/favicons?sz=32&domain=${hostname}`;
  } catch {
    return "";
  }
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
          a.innerHTML = `${
            fav ? `<img class="insp-favicon" src="${fav}" alt="">` : ""
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
      a.innerHTML = `${
        fav ? `<img class="insp-favicon" src="${fav}" alt="">` : ""
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

// 外部（HTML）から呼べるように公開
window.fetchAndDisplayTasks = fetchAndDisplayTasks;
window.addTaskFromList = addTaskFromList;
window.sortTasks = sortTasks;
window.deleteTask = deleteTask;
window.refreshTasks = () => fetchAndDisplayTasks(true);

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

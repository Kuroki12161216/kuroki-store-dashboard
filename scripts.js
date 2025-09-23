// script.js  ── Dashboard SPA (ダッシュボード専用)

import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm";

/* ===== Supabase設定 ===== */
const SUPABASE_URL = "https://djgylzypyunbcetvquom.supabase.co";
const SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRqZ3lsenlweXVuYmNldHZxdW9tIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDA4MTk3MjgsImV4cCI6MjA1NjM5NTcyOH0.tRwiVkMiCIvONpjyAJAt3FZ2iUIy6ihaAiHMtZ3bFI0";
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

/* ===== ダッシュボード：初期化 ===== */
window.addEventListener("DOMContentLoaded", async () => {
  await initDashboard();
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
    const { error } = await supabase
      .from("タスクテーブル")
      .insert([
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
    const { error } = await supabase
      .from("店舗診断表")
      .upsert(
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
  const ids = ["dashboardSection", "taskSection", "settingsSection"];
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
async function _ensureTaskStoreSelects(){
  const { data, error } = await supabase.from("店舗診断表").select("店舗名");
  if (error) { console.error('店舗一覧取得エラー', error); return; }
  const stores = Array.from(new Set((data||[]).map(r=>r.店舗名))).sort();

  const taskAddStoreSelect = document.getElementById('taskAddStoreSelect');
  const storeSelectTask    = document.getElementById('storeSelectTask');

  // 追加フォーム側：必ず単一店舗を選ばせる（先頭はプレースホルダ）
  if (taskAddStoreSelect){
    const current = taskAddStoreSelect.value;
    taskAddStoreSelect.innerHTML = '<option value="">店舗を選択</option>';
    stores.forEach(s=>{
      const o=document.createElement('option'); o.value=o.textContent=s;
      taskAddStoreSelect.appendChild(o);
    });
    if (stores.includes(current)) taskAddStoreSelect.value = current;
  }

  // 一覧フィルタ側：先頭に「全ての店舗」（value=""で全件表示）
  if (storeSelectTask){
    const current = storeSelectTask.value; // 既存選択を一応保持
    storeSelectTask.innerHTML = '<option value="">全ての店舗</option>';
    stores.forEach(s=>{
      const o=document.createElement('option'); o.value=o.textContent=s;
      storeSelectTask.appendChild(o);
    });
    storeSelectTask.value = (current && stores.includes(current)) ? current : '';
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

  // PCテーブル
  tbody.innerHTML = "";
  for (const r of rows) {
    const tr = document.createElement("tr");
    // 文字列は textContent でXSS対策
    const tdStore = document.createElement("td");
    tdStore.textContent = r.store;
    const tdItem = document.createElement("td");
    tdItem.textContent = r.item;
    const tdTask = document.createElement("td");
    tdTask.textContent = r.task;
    const tdDue = document.createElement("td");
    tdDue.textContent = r.due ? _fmtDateYYYYMMDD(r.due) : "-";
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
            <span class="me-2"><i class="bi bi-calendar-event"></i> ${
              r.due ? _fmtDateYYYYMMDD(r.due) : "-"
            }</span>
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

  const { error } = await supabase
    .from("タスクテーブル")
    .insert([
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

// 外部（HTML）から呼べるように公開
window.fetchAndDisplayTasks = fetchAndDisplayTasks;
window.addTaskFromList = addTaskFromList;
window.sortTasks = sortTasks;
window.deleteTask = deleteTask;
window.refreshTasks = () => fetchAndDisplayTasks(true);

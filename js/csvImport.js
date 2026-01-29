// csvImport.js
import { supabase } from "./supabaseClient.js";

/**
 * ▼設定：アップロード先テーブル
 * - HTML側で <div id="csvDropArea" data-table="臨店一覧"> のように指定すればそれを優先
 * - 指定が無ければ DEFAULT_IMPORT_TABLE を使います
 */
const DEFAULT_IMPORT_TABLE = "店舗診断表";

/**
 * ▼設定：INSERT or UPSERT
 * - 既存更新もしたいなら UPSERT を true にし、onConflict を設定
 */
const UPSERT = false; // trueにすると upsert
const UPSERT_ON_CONFLICT = "id"; // 例: "店舗名,月,項目" など（テーブルに合わせて変更）

/** ▼一度に投げる件数（大きすぎると失敗しやすいので分割） */
const BATCH_SIZE = 500;

/* =========================
   Drag & Drop handlers
   ========================= */

function _getDropArea() {
  return document.getElementById("csvDropArea");
}

function _setDropUi(state, message) {
  const area = _getDropArea();
  if (!area) return;

  area.classList.remove("border-primary", "border-success", "border-danger");
  area.classList.remove("bg-primary-subtle", "bg-success-subtle", "bg-danger-subtle");

  if (state === "drag") {
    area.classList.add("border-success", "bg-success-subtle");
    area.textContent = message || "離すとCSVを取り込みます";
  } else if (state === "uploading") {
    area.classList.add("border-primary", "bg-primary-subtle");
    area.textContent = message || "取り込み中...";
  } else if (state === "success") {
    area.classList.add("border-success", "bg-success-subtle");
    area.textContent = message || "取り込み完了";
  } else if (state === "error") {
    area.classList.add("border-danger", "bg-danger-subtle");
    area.textContent = message || "エラーが発生しました";
  } else {
    area.classList.add("border-primary");
    area.textContent = message || "ここにCSVファイルをドロップ";
  }
}

export function handleDragEnter(e) {
  e.preventDefault();
  e.stopPropagation();
  _setDropUi("drag");
}

export function handleDragOver(e) {
  e.preventDefault();
  e.stopPropagation();
  // drop許可
  if (e.dataTransfer) e.dataTransfer.dropEffect = "copy";
  _setDropUi("drag");
}

export async function handleDrop(e) {
  e.preventDefault();
  e.stopPropagation();

  const area = _getDropArea();
  const table = area?.dataset?.table || DEFAULT_IMPORT_TABLE;

  const files = e.dataTransfer?.files;
  if (!files || !files.length) {
    _setDropUi("error", "ファイルが見つかりません");
    return;
  }

  const file = files[0];
  if (!/\.csv$/i.test(file.name)) {
    _setDropUi("error", "CSVファイルのみ対応です");
    return;
  }

  try {
    _setDropUi("uploading", "CSVを読み込み中...");

    const text = await _readFileAsText(file);
    const { headers, rows } = _parseCsvToObjects(text);

    if (!headers.length) throw new Error("CSVヘッダが空です");
    if (!rows.length) throw new Error("CSVデータ行が空です");

    // 空文字→null / 数値らしければ数値化（必要なければ _coerceValue を軽くしてください）
    const normalized = rows.map((r) => {
      const obj = {};
      for (const k of headers) obj[k] = _coerceValue(r[k]);
      return obj;
    });

    _setDropUi("uploading", `Supabaseへ送信中... (0/${normalized.length})`);

    // バッチで投入
    let done = 0;
    for (let i = 0; i < normalized.length; i += BATCH_SIZE) {
      const chunk = normalized.slice(i, i + BATCH_SIZE);

      const q = supabase.from(table);
      const { error } = UPSERT
        ? await q.upsert(chunk, { onConflict: UPSERT_ON_CONFLICT })
        : await q.insert(chunk);

      if (error) throw error;

      done += chunk.length;
      _setDropUi("uploading", `Supabaseへ送信中... (${done}/${normalized.length})`);
    }

    _setDropUi("success", `取り込み完了：${normalized.length}件 (${table})`);

    // もし臨店一覧/タスク一覧など再描画したいならここで呼べます（存在する場合だけ）
    if (table === "臨店一覧" && typeof window.refreshInspections === "function") {
      window.refreshInspections();
    }
    if (table === "タスクテーブル" && typeof window.refreshTasks === "function") {
      window.refreshTasks();
    }
  } catch (err) {
    console.error(err);
    _setDropUi("error", `エラー：${err?.message || String(err)}`);
    alert(`CSV取り込みに失敗しました\n${err?.message || err}`);
  } finally {
    // 少し待ってから通常表示に戻す（不要なら消してOK）
    setTimeout(() => _setDropUi("idle"), 1500);
  }
}

/* =========================
   Helpers
   ========================= */

function _readFileAsText(file) {
  return new Promise((resolve, reject) => {
    const fr = new FileReader();
    fr.onload = () => resolve(String(fr.result || ""));
    fr.onerror = () => reject(fr.error || new Error("FileReader error"));
    fr.readAsText(file, "utf-8");
  });
}

/**
 * CSVをヘッダ行＋オブジェクト配列に変換（ダブルクォート対応）
 * - 1行目をヘッダとして扱います
 */
function _parseCsvToObjects(csvText) {
  const rows = _parseCsv(csvText);
  if (!rows.length) return { headers: [], rows: [] };

  const headers = rows[0].map((h) => String(h || "").trim()).filter(Boolean);
  const dataRows = rows.slice(1);

  const objects = dataRows
    .filter((r) => r.some((v) => String(v ?? "").trim() !== ""))
    .map((r) => {
      const obj = {};
      headers.forEach((h, idx) => {
        obj[h] = r[idx] ?? "";
      });
      return obj;
    });

  return { headers, rows: objects };
}

/**
 * シンプルCSVパーサ（RFCの全網羅ではないが、一般的な "..." / 改行 / カンマに対応）
 */
function _parseCsv(text) {
  const s = String(text ?? "").replace(/^\uFEFF/, ""); // BOM除去
  const out = [];
  let row = [];
  let cur = "";
  let inQuotes = false;

  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    const next = s[i + 1];

    if (inQuotes) {
      if (ch === '"' && next === '"') {
        cur += '"';
        i++;
      } else if (ch === '"') {
        inQuotes = false;
      } else {
        cur += ch;
      }
      continue;
    }

    if (ch === '"') {
      inQuotes = true;
      continue;
    }
    if (ch === ",") {
      row.push(cur);
      cur = "";
      continue;
    }
    if (ch === "\r") continue;
    if (ch === "\n") {
      row.push(cur);
      out.push(row);
      row = [];
      cur = "";
      continue;
    }
    cur += ch;
  }

  // 最終行
  row.push(cur);
  out.push(row);

  return out;
}

function _coerceValue(v) {
  if (v == null) return null;
  const t = String(v).trim();
  if (t === "") return null;

  // true/false
  if (t.toLowerCase() === "true") return true;
  if (t.toLowerCase() === "false") return false;

  // 数値
  const n = Number(t);
  if (!Number.isNaN(n) && /^-?\d+(\.\d+)?$/.test(t)) return n;

  return t;
}

/* =========================
   Global exposure (for inline HTML handlers)
   ========================= */
if (typeof window !== "undefined") {
  window.handleDragEnter = handleDragEnter;
  window.handleDragOver = handleDragOver;
  window.handleDrop = handleDrop;
}

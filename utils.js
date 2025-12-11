// ユーティリティ
export function _escapeHtml(s) {
  return (s ?? "")
    .toString()
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
export function _fmtDateYYYYMMDD(d) {
  if (!d) return "";
  const t = new Date(d);
  if (isNaN(t)) return d;
  const y = t.getFullYear(),
    m = String(t.getMonth() + 1).padStart(2, "0"),
    day = String(t.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}
export function _currentYYYYMM() {
  const v = document.getElementById("target-date")?.value;
  if (v) return v.slice(0, 7).replace("-", "");
  const t = new Date();
  return `${t.getFullYear()}${String(t.getMonth() + 1).padStart(2, "0")}`;
}

// カンマ・空白・改行で複数URLに対応
export function _splitUrls(s) {
  return (s || "")
    .split(/[\s,、\n\r]+/)
    .map((u) => u.trim())
    .filter(Boolean);
}

// 画像拡張子なら true
export function _isImageUrl(u) {
  return /\.(png|jpe?g|gif|webp|bmp|svg)(\?.*)?$/i.test(u);
}

// いろいろな Drive/Docs URLから ID を抽出
export function _extractDriveId(url) {
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
export function _driveThumbUrl(id, size = 240) {
  // 横幅px指定。表示が小さければ 160 などに変更
  return `https://drive.google.com/thumbnail?id=${id}&sz=w${size}`;
}

export function _driveDirectViewUrl(id) {
  // 公開設定に依存。失敗時は次のサムネHDにフォールバック
  return `https://drive.google.com/uc?export=view&id=${id}`;
}
export function _driveThumbHdUrl(id) {
  // 大きめサムネ（多くの場合こちらは表示されやすい）
  return `https://drive.google.com/thumbnail?id=${id}&sz=w1600`;
}

// Favicon用
export function _faviconUrl(u) {
  try {
    const { hostname } = new URL(u);
    return `https://www.google.com/s2/favicons?sz=32&domain=${hostname}`;
  } catch {
    return "";
  }
}

/* --- 月の表記を YYYY/MM に正規化（yyyymm/yyy-mm/Date も対応） --- */
export function normalizeMonth(v) {
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

export function _monthToKey(v) {
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
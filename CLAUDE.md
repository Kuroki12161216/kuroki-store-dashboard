# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a **client-side PWA (Progressive Web App)** — a static SPA for restaurant store management (店舗診断ダッシュボード). There is **no build process, no npm, no TypeScript**. All JavaScript is vanilla ES6 modules loaded directly in the browser.

## Development

Since this is a static site, there is no build or lint command. To develop locally, serve the files with any static HTTP server:

```bash
# Python
python -m http.server 8080

# Node.js (if available)
npx serve .
```

Open `http://localhost:8080/index.html` in a browser.

## Architecture

### Entry Point & Module Flow

`index.html` loads `js/scripts.js` as an ES module, which imports and initializes all feature modules:

```
scripts.js (init + hash routing)
  ├── supabaseClient.js  → Supabase DB client
  ├── routing.js         → section navigation (switchSection)
  ├── dashboard.js       → KPI cards, Chart.js charts, ranking table
  ├── tasks.js           → task CRUD, table/mobile list views
  ├── inspections.js     → inspection checklist with multi-filter
  ├── sns.js             → SNS post composer (GBP/Instagram)
  └── notifications.js   → browser notification permission badge
```

### Section Routing

Navigation switches visibility of these `<section>` IDs in `index.html`:
- `#dashboardSection` — KPI metrics, YoY trend charts, store ranking
- `#taskSection` — task table (desktop) / swipeable list (mobile)
- `#inspectionSection` — inspection checklist with store/month/category filters
- `#snsSection` — SNS post composer with template selection and preview
- `#settingsSection` — notification permission management

Hash-based deep linking is supported (`#dashboard`, `#tasks`, `#inspections`, `#sns`, `#settings`).

### Supabase Data Model

All data is stored in Supabase (PostgreSQL). Tables use Japanese names:

| Table | Purpose |
|---|---|
| `店舗診断表` | Store diagnostic KPI data (store name, month `yyyymm`, KPI values) |
| `タスクテーブル` | Tasks — columns: id, 項目, タスク, 期限, 責任者, 店舗診断表_id (FK) |
| `臨店一覧` | Inspection checklist — columns: 月, カテゴリ, 設問, 判定, 特記事項, url, 店舗 |

Real-time Supabase subscriptions (`.on()`) are used throughout all modules for live updates.

### Dependencies (CDN only)

All dependencies are loaded via CDN — never via npm:
- **Bootstrap 5.3.0** (CSS + JS bundle)
- **Bootstrap Icons 1.11.3**
- **Chart.js** (KPI charts in dashboard.js)
- **Supabase JS SDK v2** (via `https://esm.sh/@supabase/supabase-js@2`)

### Responsive UI Pattern

All feature sections implement **dual UIs**:
- Desktop: table-based layout (hidden on mobile via CSS)
- Mobile: card/list layout with swipe interactions (hidden on desktop via CSS)

Media query breakpoints: mobile `<768px`, tablet `768–1024px`, desktop `>1024px`.

### Styling

- `styles.css` — global styles, sidebar, responsive grid, CSS custom properties (`--primary-*`, `--gray-*`, `--radius-lg`)
- Inline `<style>` block in `index.html` — Bootstrap overrides, permission badge colors, mobile swipe animations

### Key Utility Functions (`js/utils.js`)

- `_escapeHtml` — XSS-safe HTML escaping
- `_fmtDateYYYYMMDD`, `_currentYYYYMM` — date formatting
- `_extractDriveId`, `_driveThumbUrl` — Google Drive URL/thumbnail helpers
- `normalizeMonth`, `_monthToKey` — month string normalization (used for KPI lookups)

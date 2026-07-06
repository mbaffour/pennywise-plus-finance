# Improvements

This document summarizes a focused, low-risk round of improvements to
PennyWise+ Finance (the lightweight `localStorage` edition).

## Fixes

- **Offline charts now work.** Previously Chart.js was loaded from a CDN
  (`https://cdn.jsdelivr.net/npm/chart.js`). The service worker (`sw.js`) returns
  early for cross-origin requests, so the CDN script was never precached and every
  chart failed to render when the app was used offline. Chart.js `4.4.7` is now
  vendored locally at `vendor/chart.umd.min.js`, referenced from `index.html`, and
  added to the service worker precache list. The service worker cache version was
  bumped (`v6` -> `v7`) so existing installs pick up the new asset.
  - `index.html` — script tag now points to `./vendor/chart.umd.min.js`.
  - `sw.js` — `./vendor/chart.umd.min.js` added to `APP_SHELL`; `CACHE_NAME`
    bumped to `pennywise-plus-shell-v7`.

- **README note about the more complete sibling.** Added a short note near the top
  of `README.md` clarifying that this is the lightweight `localStorage` edition and
  that **pennywise-plus** (IndexedDB storage, more features) is the more complete
  version.

## New features

- **Export Filtered CSV.** The existing "Export CSV" button exports every
  transaction. A new **Export Filtered CSV** button exports only the transactions
  matching the currently active filters (search, date range, type, category,
  payment method, tag, sort) — useful for exporting a single category, a date
  range, or a tag. It reuses the existing filter logic (`filteredTransactions()`)
  and a shared CSV serializer, so it does not change any existing behavior.
  - `index.html` — new `#exportFilteredCsvBtn` button beside the existing export
    controls in the Transactions toolbar.
  - `app.js` — new `exportFilteredCSV()` handler and a shared `transactionsToCSV()`
    helper (refactored out of `exportCSV()`); handler wired up in the setup code.

## Notes

- The task suggested "CSV export of transactions" as a nice-to-have, but a
  full-export CSV feature (`exportCSV()` + "Export CSV" button) already existed.
  Rather than duplicate it, this round adds a filtered CSV export, which is
  genuinely additive and complements the existing export.
- No new runtime dependencies were added; Chart.js was already a dependency and is
  now simply served locally instead of from a CDN.
- The existing MIT `LICENSE` file was left unchanged.

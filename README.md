# PennyWise+

**Track smarter. Spend wiser.**

PennyWise+ is a private, browser-based personal finance dashboard for structuring everyday money decisions. The app is built around a simple idea: what you do not structure, you allow to be filled with chaos. PennyWise+ helps you track every cent, build budgets, analyze spending, manage savings goals, import bank CSVs, and print clean reports.

![PennyWise+ screenshot placeholder](./logo.png)

## Features

- Add, edit, delete, and duplicate transactions
- Track income, expenses, net balance, savings rate, no-spend days, recurring expenses, and budget usage
- Categories, subcategories, tags, payment methods, needs/wants, fixed/variable, and recurring status
- Search, date range, type, category, payment method, tag, and sort filters
- Analytics charts for trends, category spending, income vs expenses, needs vs wants, top merchants, payment methods, fixed vs variable, and budget usage
- Monthly overall budget plus category budgets with progress and warnings
- Savings goals with deadlines, progress, monthly contribution needs, edit, and delete
- CSV import with preview, auto column detection, manual mapping, duplicate avoidance, and rule-based categorization
- JSON backup and restore
- CSV export
- Printable report page designed for PDF export
- Light and dark mode
- Mobile transaction cards and responsive layout
- Local browser persistence with `localStorage`
- Basic PWA shell caching through `sw.js`
- GitHub Pages-ready static deployment

## Privacy

Your data stays in this browser. PennyWise+ does not send your financial data to any server.

Because browser storage is local to the browser/device, export JSON backups regularly, especially before clearing browser data or changing devices.

## Origin Story

Read the project philosophy in [Why I Made PennyWise+](./BLOG.md): a short note on structure, chaos, and why every cent deserves direction.

## Tech Stack

- Static HTML, CSS, and JavaScript
- Chart.js via CDN
- Browser `localStorage`
- Optional service worker shell cache
- No backend, no database server, no paid services

## File Structure

```text
pennywise-plus/
|-- index.html
|-- style.css
|-- app.js
|-- logo.png
|-- manifest.json
|-- sw.js
|-- sample_transactions.csv
|-- README.md
|-- DEPLOYMENT.md
|-- CHANGELOG.md
|-- LICENSE
`-- .gitignore
```

## Run Locally

You can open `index.html` directly in a browser. For the best local experience, run a small static server from this folder:

```bash
python -m http.server 8000
```

Then visit:

```text
http://localhost:8000
```

## Deploy To GitHub Pages

1. Create a GitHub repository, for example `pennywise-plus`.
2. Upload or push all files in this folder to the repository root.
3. Open repository Settings.
4. Go to Pages.
5. Choose "Deploy from a branch".
6. Select branch `main` and folder `/root`.
7. Save and open the Pages URL after deployment completes.

All asset paths are relative, so the app works from a GitHub Pages project path such as `https://username.github.io/pennywise-plus/`.

## CSV Import

Use the Import page to upload a CSV, preview rows, adjust column mapping, and save only reviewed transactions.

Supported columns include:

- Date
- Description
- Amount
- Debit
- Credit
- Category
- Merchant/vendor/source
- Payment method
- Notes
- Tags

Negative amounts are treated as expenses. Positive amounts are treated as income. If your bank exports separate Debit and Credit columns, map those instead of Amount.

## Backup And Restore

Use **Backup JSON** to export all transactions, budgets, goals, categories, rules, and settings. Use **Import JSON Backup** in Settings to restore a backup.

Recommended workflow:

1. Add or import transactions.
2. Review categories, budgets, and goals.
3. Export a JSON backup after major updates.
4. Store the backup somewhere safe.

## Roadmap

- Optional IndexedDB storage adapter for larger datasets
- Editable advanced categorization conditions
- Recurring transaction generator
- More report templates
- Optional encrypted backup file export
- Additional chart drilldowns

## License

MIT. See [LICENSE](./LICENSE).

# Deploying PennyWise+

PennyWise+ is a static client-side app. It can be deployed to GitHub Pages without a backend, build step, paid service, or server-side data storage.

## GitHub Pages

1. Put these files in the repository root: `index.html`, `style.css`, `app.js`, `manifest.json`, `sw.js`, `logo.png`, `sample_transactions.csv`, and the docs.
2. Commit and push to GitHub.
3. Open the repository settings.
4. Go to Pages.
5. Set Source to "Deploy from a branch".
6. Choose branch `main` and folder `/root`.
7. Save and wait for the Pages URL.

## Path Rules

All app assets use relative paths such as `./style.css` and `./app.js`, so the app works under a project URL like:

```text
https://username.github.io/pennywise-plus/
```

## Privacy

No financial data is sent to GitHub or any backend. Transactions, budgets, rules, and goals are stored in the user's browser storage only. Users should export JSON backups before clearing browser data or switching browsers.

## Local Testing

Direct file opening works for the app shell, but service workers require `http://localhost` or HTTPS. Use:

```bash
python -m http.server 8000
```

Then visit:

```text
http://localhost:8000
```

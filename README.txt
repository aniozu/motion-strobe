Motion Strobe SEO / GitHub Pages workflow fix

1. Extract this ZIP.
2. Copy the .github folder from this ZIP into the root of your motion-strobe repository.
   Allow overwriting .github/workflows/pages.yml.
3. In GitHub Desktop, review the change, commit and push.

Fix: In GitHub Actions, build with SITE_URL from GitHub Pages BEFORE running npm test.
Pass the same SITE_URL to tests so canonical, hreflang and sitemap expectations match.

Optional local test:
Copy check-local.cmd to the repository root (beside package.json), double-click it.
This rebuilds dist and runs the full test suite locally. It needs npm packages installed.
The batch file is optional and does not need to be committed.

Note: This patch does not alter application JavaScript, CSS, or translations.
Keep previous SEO edits to scripts/languages.mjs. Do not re-run SEO-fix.ps1.

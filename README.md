# art-therapy-stats

Daily GitHub Action that reads the DTCare monday.com board "2026 Art Therapy Sessions -Paid"
and publishes `art-therapy-stats.json` to GitHub Pages for the dtcare.org art therapy pages.

Output: https://lukewinningham.github.io/art-therapy-stats/art-therapy-stats.json

Setup: add repo secret `MONDAY_TOKEN`, set Settings → Pages → Source to "GitHub Actions",
then Actions → "Update art therapy stats" → Run workflow.

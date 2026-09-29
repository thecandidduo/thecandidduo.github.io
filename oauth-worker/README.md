# CMS login worker (Cloudflare)

`worker.js` in this folder is the free login service for your CMS. You don't run
it here — you paste it into Cloudflare once. Full click-by-click steps are in
**SETUP-GUIDE.md → Step 6**. Short version:

1. Create a free account at https://dash.cloudflare.com → **Workers & Pages** → **Create Worker**.
2. Open the new worker's **Edit code**, delete the sample, paste ALL of `worker.js`, click **Deploy**.
3. Copy the worker's URL (looks like `https://something.YOURNAME.workers.dev`).
4. On GitHub, create an **OAuth App** (Settings → Developer settings → OAuth Apps):
   - Homepage URL: your worker URL
   - Authorization callback URL: `YOUR-WORKER-URL/callback`
5. Back in the worker → **Settings → Variables** → add two **secrets**:
   - `GITHUB_CLIENT_ID` = the OAuth app's Client ID
   - `GITHUB_CLIENT_SECRET` = the OAuth app's generated secret
6. Put the worker URL into `admin/config.yml` → `base_url`.

That's the whole login setup. It's free and you only do it once.

## Traffic counter (optional)

The same worker also powers the CMS Dashboard's traffic card (a cookie-free page-view
counter). It needs a free D1 database bound to the worker as `DB` — see
**SETUP-GUIDE.md → Step 6g**, or the comment at the top of `worker.js`.

Tests for the counter (Node 22+, no dependencies): `node --test oauth-worker/test/stats.test.mjs oauth-worker/test/tracker.test.mjs`

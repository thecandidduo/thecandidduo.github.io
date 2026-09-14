# ✅ Go-Live Checklist

A one-page checklist. Full details for each item are in **SETUP-GUIDE.md**.

## Get it online
- [ ] Create a GitHub account (username becomes your web address)
- [ ] Create a repo named `YOURNAME.github.io` (Public)
- [ ] Upload all the website files → Commit
- [ ] Settings → Pages → Deploy from branch → `main` / root → Save
- [ ] Open your live link: `https://YOURNAME.github.io`

## Make it yours (`_config.yml`)
- [ ] `url:` → your live address
- [ ] `baseurl:` → empty `""` (if repo is `YOURNAME.github.io`)
- [ ] `social:` → your Instagram / TikTok / YouTube / Spotify / email

## Turn on the CMS editor (Step 6)
- [ ] Create a Cloudflare Worker, paste `oauth-worker/worker.js`, Deploy → copy URL
- [ ] Create a GitHub OAuth App (callback = worker URL + `/callback`)
- [ ] Add `GITHUB_CLIENT_ID` + `GITHUB_CLIENT_SECRET` secrets in Cloudflare
- [ ] In `admin/js/config.js`: set `REPO`, `AUTH_BASE_URL`, `SITE_URL`
- [ ] Log in at `https://YOURNAME.github.io/admin`
- [ ] *(Optional, Step 6f)* Re-paste updated `worker.js`, add free
      `GEMINI_API_KEY` + `GITHUB_REPO` secrets in Cloudflare to turn on
      **✨ Generate with AI** (Stories) and **Fetch details** (Products)

## Write
- [ ] Replace/delete the 4 starter stories with your own
- [ ] Set ONE story as "Feature on homepage"
- [ ] Update the About and Work With Us pages
- [ ] Swap the placeholder mountain images for your photos

## Money — Google AdSense (Step 8)
- [ ] Apply at adsense.google.com with your site URL
- [ ] Put your publisher ID in `ads.txt`
- [ ] Set `adsense.enabled: true` + `publisher_id` in `_config.yml`
- [ ] After approval: create ad units, paste slot IDs into `_config.yml`

## Nice extras (optional)
- [ ] Contact form → Formspree ID in `contact.md`
- [ ] Newsletter → Buttondown/Mailchimp in `_includes/footer.html`
- [ ] Analytics → `google_analytics:` in `_config.yml`
- [ ] SEO → submit `/sitemap.xml` to Google Search Console
- [ ] Custom domain → Settings → Pages → Custom domain

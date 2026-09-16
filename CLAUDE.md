# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

A Jekyll static site for "The Candid Duo," a travel blog, deployed for free on GitHub Pages with a hand-built admin dashboard (`/admin`) as an on-site editor and Google AdSense monetization. There is no local build/run step required for normal edits — GitHub Pages builds the site automatically on push to `main`. Content is Markdown/YAML; the CMS commits directly to the repo via the GitHub REST API.

## Commands

No package.json/JS tooling — this is a plain Jekyll + Ruby site.

```bash
bundle install       # first time only, installs gems from Gemfile
bundle exec jekyll serve   # local preview at http://localhost:4000
```

There are no automated tests or linters in this repo. Verify changes by running `jekyll serve` and checking the page in a browser, or by inspecting the built `_site/` output.

## Architecture

**Content model (Jekyll collections/data driving the templates):**
- `_posts/` — blog posts (filename `YYYY-MM-DD-slug.md`). Front matter drives most layout logic: `category`, `destination` (must match one of Jeju/New Zealand/Tasmania/Umroh/Singapore/Other to link up with destination pages), `image`/`image_alt`, `dek`/`excerpt`, `tags`, `featured` (only one post should be `featured: true` — it becomes the homepage lead story).
- `_products/` — affiliate product recommendations (collection with `output: false` in `_config.yml`, so products have no individual pages — they only render as cards via `_includes/product-card.html` on the homepage and `/products/`). Front matter: `name`, `image`, `price`, `platform`, `country`, `category` (free text; also becomes a filter button on `/products/`, so reuse exact wording to group items), `url` (affiliate link), `blurb`, `featured`, `date`.
- `_data/homepage.yml` — hero carousel slides, the scrolling ticker (WATCH/LISTEN/READ), and the "Watch & Listen" media cards. Fully editable via CMS.
- `_data/navigation.yml` — top nav menu items.
- `destinations/*.md` — one page per destination (Jeju, New Zealand, Tasmania, Umroh), using `_layouts/category.html`, which pulls in `site.posts | where: "destination", page.destination`.
- Top-level pages (`about.md`, `contact.md`, `privacy.md`, `products.html`, `stories.html`) use `_layouts/page.html` or their own inline layout.

**Layouts (`_layouts/`) → Includes (`_includes/`) chain:**
- `default.html` is the base shell (head/header/footer) that everything else extends via `layout: default`.
- `home.html` (homepage) assembles hero, ticker, featured/latest stories, Watch & Listen, destinations grid, featured products, about teaser — all Liquid-driven from `site.posts`, `site.products`, and `site.data.homepage`.
- `post.html` renders an article, auto-inserts an in-article ad after the 3rd paragraph (if the article is long enough), shows prev/next nav, and a related-stories block filtered by same `destination` (falls back to any other posts if fewer than 3 matches). Also emits BlogPosting JSON-LD.
- `category.html` is the generic "posts filtered by destination" template used by `destinations/*.md`.
- Reusable pieces live in `_includes/`: `head.html` (fonts, CSS, SEO tag, conditional AdSense script loader, analytics), `header.html` (nav, reads `site.data.navigation.main`), `footer.html`, `hero.html`, `ticker.html`, `story-card.html`, `product-card.html`, `ad.html`.

**Ad slots (`_includes/ad.html`):** Ad units (`leaderboard`, `infeed`, `inarticle`) only render real AdSense `<ins>` markup when `site.adsense.enabled` is `true` AND `publisher_id` isn't the placeholder value; otherwise a visual placeholder is shown. When editing ad placement/behavior, this gating logic is the source of truth.

**Reading time:** Computed inline via Liquid (`content | number_of_words | divided_by: 200 | plus: 1`) wherever it's shown (post header, story cards, homepage lead), overridable per-post with a `read_time` front-matter field.

**Styling:** Single stylesheet `assets/css/main.css`. Design tokens (colors, fonts, spacing) are CSS custom properties in the `:root` block at the top — change the site's look by editing tokens there rather than hunting for hardcoded values.

**CMS — `admin/` (hand-built, not a third-party product):** A static single-page app, native ES modules, no build step, that reads/writes the repo's actual content files through the GitHub REST API — there's no server component beyond the OAuth worker below.
- `admin/js/schema.js` is the source of truth for what's editable: field definitions per content type (posts/products/homepage/navigation/pages), matching the front matter/`_data` schema described above. If you add/rename a front-matter field used in templates, update the matching entry here too, or the CMS form and the actual content shape will drift apart.
- `admin/js/content.js` hand-rolls front matter and `_data/*.yml` parsing/serialization (deliberately not a YAML library — the shapes here are fixed and simple). Serialization is schema-typed (`type: "date"` writes a bare/unquoted YAML timestamp, not a quoted string) because Jekyll's date sorting and filters need a real `Date`, not a string — this is easy to regress if a new date-like field is added without setting `type: "date"`.
- `admin/js/github-api.js` wraps the Contents API (get/put/delete, base64 encode/decode) and `admin/js/auth.js` implements the popup OAuth handshake — both talk to the same Cloudflare Worker Decap used to (`admin/js/config.js` holds `REPO`/`AUTH_BASE_URL`).
- `admin/js/app.js` is the renderer: sidebar, list/card views, and three editor patterns (`collection` = a folder of front-matter files like posts/products, `datafile` = tabbed repeating lists in one YAML file like homepage/navigation, `singles` = one fixed file per fixed page like about/contact/privacy). Two field types beyond the basics: `multiselect` (checkbox panel + removable chips, e.g. product `country`) and the hero-slide "populate from an existing story" picker (`renderDatafile`/`listItemHtml` in app.js) — a UI convenience that reads existing `_posts/` front matter to prefill a hero slide's image/title/subtitle/link; it doesn't change `_data/homepage.yml`'s shape.
- Collection list views (`renderCollectionList`) have a grid/list toggle (`getListView`/`setListView`, persisted per-collection in `localStorage`) — both views share the same date-descending sort and the `badgeInfo()` helper, which shows a DRAFT pill (from `schema.draftField`) ahead of FEATURED/category. Posts save-as-draft is just a `published: boolean` front-matter field (default `true`) — Jekyll's own `published: false` handling excludes it from `jekyll build` with zero custom logic needed; `loadPostSummaries()` (the hero-slide picker) filters drafts out since their URL wouldn't resolve live yet.
- The `image_crop` field type (`cropFor` pointing at the paired `image` field name, e.g. posts' `image_thumb`) is a genuinely separate, physically-cropped file — not metadata on the original photo. `fieldInputHtml`'s `"image"` case renders a small current-thumbnail preview + "Crop thumbnail" button (`thumbCropRowHtml`); clicking it opens `openCropModal()`, a standard drag-to-pan + zoom-slider cropper fixed at a 4:3 frame (`CROP_ASPECT_W/H`, `CROP_OUTPUT_W/H`). It always crops from a same-origin `blob:` URL (`toLocalBlobUrl()` fetches+blobs a `raw.githubusercontent.com` source first) since a cross-origin `<img>` would taint the `<canvas>` on export; the freshest local file (before its own upload even finishes) is preferred when available. Save uploads the cropped JPEG via the normal image pipeline into the paired field. `_includes/story-card.html` and `_layouts/home.html` (the lead/featured story) read `post.image_thumb | default: post.image` — additive, so posts saved before this field existed still render their full original photo unchanged. The post-hero image (`_layouts/post.html`) intentionally always shows the uncropped original — it isn't a "thumbnail" context.
- Any markdown body field gets a "+ Insert image" toolbar (`bodyFieldHtml` + `wireBodyImageInsert()`) that uploads a photo and splices a `![]()` Markdown tag in at the textarea's cursor position — kramdown (Jekyll's default renderer) needs no template changes to display it.
- `admin/js/ai.js` + two UI panels in `app.js` are the CMS features with a real server component — `oauth-worker/worker.js` proxies both to the Gemini API (`callGemini()`, using `generationConfig.responseSchema` for structured output — note Gemini's schema uses uppercase type names like `"OBJECT"`/`"STRING"`, not standard JSON Schema) via a server-side `GEMINI_API_KEY` secret (never exposed to the browser, and free-tier — chosen specifically so this needs no billing setup). Both routes share a `requirePushAccess()` check that rejects any caller whose GitHub token doesn't have push access to `GITHUB_REPO` (another worker secret) — without that check, anyone who found the worker's URL could burn through the site owner's free-tier quota with a throwaway GitHub account.
  - The "✨ Generate with AI" panel (Stories → new entry only) calls `/generate-story` with a prompt plus optional images/PDF/text files, and fills the form fields from the structured (tool-use) result.
  - The "Fetch details" panel (Products, new or existing) calls `/fetch-product` with a pasted affiliate URL. The worker fetches the page server-side (the browser can't, due to CORS), asks Claude to extract name/price/blurb/category/image from the raw HTML, and best-effort downloads the image too so it gets uploaded to `UPLOADS_PATH` like any other CMS image instead of hot-linking someone else's CDN URL — if that download fails, it falls back to the bare external image URL, which `imageSrc()`/Jekyll's `relative_url` both already pass through unchanged. Bot-blocking storefronts (Amazon, notably) commonly return little or nothing; the UI surfaces that as a "fill in what's missing" status rather than failing silently.
- This is infrastructure the user deploys separately to Cloudflare, not part of the Jekyll build.

**`_config.yml`:** Central site settings — `url`/`baseurl` (must match the GitHub Pages URL), `adsense` block (enable/publisher ID/slot IDs), `social` links, `google_analytics`, and `exclude` (keeps docs/tooling files out of the Jekyll build).

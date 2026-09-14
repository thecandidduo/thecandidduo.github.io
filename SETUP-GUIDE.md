# 🧭 The Candid Duo — Complete Setup Guide

Welcome! This guide takes you from zero to a **live, free travel blog** you can
edit from a friendly dashboard, with ad slots ready for Google AdSense.

**No coding required.** Just follow the steps in order. Take your time — you
only do most of this once.

Here's the whole journey at a glance:

| Step | What you'll do | Time |
|---|---|---|
| 1 | Create a free GitHub account | 3 min |
| 2 | Create your website "repository" | 2 min |
| 3 | Upload the website files | 5 min |
| 4 | Turn on free hosting (GitHub Pages) | 2 min |
| 5 | Fill in your basic details | 5 min |
| 6 | Set up your CMS login (write posts easily) | 15 min |
| 7 | Write your first post | 5 min |
| 8 | Turn on Google AdSense to earn money | varies |

Everything here is **100% free**. There is nothing to pay for unless you later
choose to buy a custom domain name (optional, ~US$12/year).

---

## 🟢 Step 1 — Create a free GitHub account

GitHub is where your website's files live, and it hosts your site for free.

1. Go to **[github.com](https://github.com)** and click **Sign up**.
2. Enter your email, a password, and a username.
   - 👉 **Tip:** your username becomes part of your web address, so pick
     something clean. If you choose `thecandidduo`, your site can live at
     `https://thecandidduo.github.io`.
3. Verify your email when GitHub asks.

That's it — you now have a GitHub account.

---

## 🟢 Step 2 — Create your website "repository"

A **repository** (or "repo") is just a folder for your website's files.

1. Once logged in, click the **+** icon (top-right) → **New repository**.
2. **Repository name:** type your username followed by `.github.io`.
   - Example: if your username is `thecandidduo`, name it
     **`thecandidduo.github.io`**.
   - ⭐ **Why this exact name?** It gives you the clean address
     `https://thecandidduo.github.io` with no extra folder in the URL, and it
     avoids a common beginner headache. (If you name it anything else, see the
     note in *Troubleshooting → Wrong web address*.)
3. Set it to **Public** (required for free hosting).
4. **Do not** tick "Add a README." Leave everything else blank.
5. Click **Create repository**.

Keep this page open — you'll upload files here next.

---

## 🟢 Step 3 — Upload the website files

You have a folder of files (the one this guide came in). Let's put them on GitHub.

1. On your new empty repository page, click the link
   **"uploading an existing file"** (or **Add file → Upload files**).
2. Open the website folder on your computer, **select ALL the files and
   folders inside it** (not the outer folder itself — the contents), and
   **drag them onto the GitHub upload area**.
   - Make sure you include the ones starting with a dot, like `.gitignore`,
     and folders like `_posts`, `_layouts`, `assets`, `admin`.
   - 💡 If drag-and-drop is fussy, click **choose your files** and select them
     all instead.
3. Wait for every file to finish uploading (you'll see them listed).
4. Scroll down and click the green **Commit changes** button.

⏳ GitHub now saves everything. This can take a minute for all the files.

> **Prefer an app?** If dragging lots of files is annoying, install
> **[GitHub Desktop](https://desktop.github.com)** (free), which lets you drag
> the whole folder in one go. Optional — the web upload works fine.

---

## 🟢 Step 4 — Turn on free hosting (GitHub Pages)

1. In your repository, click **Settings** (top menu).
2. In the left sidebar, click **Pages**.
3. Under **Build and deployment → Source**, choose **Deploy from a branch**.
4. Under **Branch**, pick **`main`** and folder **`/ (root)`**, then click **Save**.
5. Wait 1–2 minutes, then refresh the page. You'll see a message like:
   **"Your site is live at https://YOURNAME.github.io"**. 🎉

Click that link — your travel blog is on the internet!

> If you see a plain, unstyled page or a 404 at first, give it 2–3 minutes and
> refresh. GitHub is building your site behind the scenes.

---

## 🟢 Step 5 — Fill in your basic details

Let's replace the placeholder details with yours. You'll edit files **directly
on GitHub** — no downloads needed.

**How to edit any file on GitHub:** open the file → click the **pencil ✏️ icon**
(top-right of the file) → make changes → click **Commit changes**. Your site
rebuilds automatically in ~1 minute.

Open **`_config.yml`** and update the lines marked `# << CHANGE`:

```yaml
url: "https://YOURNAME.github.io"     # your real address from Step 4
baseurl: ""                           # leave empty if you used the .github.io name

social:
  instagram: "https://instagram.com/thecandidduo"
  tiktok: "https://tiktok.com/@thecandidduo"
  youtube: "https://youtube.com/@thecandidduo"
  spotify: ""                          # paste your Spotify show link, or leave ""
  email: "hello@yourdomain.com"        # your contact email
```

Save (Commit changes). Wait a minute, refresh your site — your links now work.

> **Everything else** (posts, homepage, menu) you'll edit from the friendly
> CMS dashboard once Step 6 is done — no more editing raw files.

---

## 🟢 Step 6 — Set up your CMS login (the one slightly techy bit)

Your site has a built-in editor at **`yoursite.com/admin`**. To log in securely
with your GitHub account, you set up a tiny free "login helper" once. Follow
along carefully — it's just copy, paste, click.

### 6a — Create a free Cloudflare account and login helper

1. Go to **[dash.cloudflare.com](https://dash.cloudflare.com)** and **sign up** (free).
2. In the left sidebar, click **Workers & Pages** → **Create** → **Create Worker**.
3. Give it a name like **`candidduo-cms-auth`** and click **Deploy**.
4. Click **Edit code** (or "Continue to project" → "Edit code").
5. Delete everything in the code editor, then open the file
   **`oauth-worker/worker.js`** (in your website folder), copy **all** of it,
   and paste it in.
6. Click **Deploy** (top-right).
7. Copy your worker's web address — it looks like
   **`https://candidduo-cms-auth.YOURNAME.workers.dev`**. Keep it handy.

### 6b — Create a GitHub "OAuth App"

1. Go to **[github.com](https://github.com)** → your avatar (top-right) →
   **Settings** → scroll to **Developer settings** (bottom of the left sidebar).
2. Click **OAuth Apps** → **New OAuth App**.
3. Fill in:
   - **Application name:** `The Candid Duo CMS`
   - **Homepage URL:** your worker address from 6a
   - **Authorization callback URL:** your worker address **+ `/callback`**
     (e.g. `https://candidduo-cms-auth.YOURNAME.workers.dev/callback`)
4. Click **Register application**.
5. Copy the **Client ID** shown.
6. Click **Generate a new client secret**, and copy that too (you won't see it again).

### 6c — Give the login helper your keys

1. Back in Cloudflare, open your worker → **Settings** → **Variables and Secrets**
   (sometimes just "Variables").
2. Add two **secrets** (choose "Encrypt"/"Secret" if asked):
   - Name `GITHUB_CLIENT_ID` → value = the Client ID from 6b
   - Name `GITHUB_CLIENT_SECRET` → value = the Client Secret from 6b
3. **Save / Deploy.**

### 6d — Point your CMS at the login helper

On GitHub, edit **`admin/js/config.js`** and update the constants:

```js
export const REPO = "YOURNAME/YOURNAME.github.io";        // your username / your repo name
export const AUTH_BASE_URL = "https://candidduo-cms-auth.YOURNAME.workers.dev"; // your worker URL
export const SITE_URL = "https://YOURNAME.github.io";
```

Commit changes.

### 6e — Log in! 🎉

1. Go to **`https://YOURNAME.github.io/admin`**.
2. Click **Login with GitHub**, approve the pop-up, and you're in.
3. You'll see **Stories**, **Products**, **Homepage**, **Navigation** and
   **Pages** in the sidebar — edit anything, hit **Save**, and your live site
   updates in about a minute.

> **Login troubles?** 99% of the time it's a typo. Double-check that the
> callback URL in 6b ends in `/callback`, that both secrets are saved in
> Cloudflare, and that `AUTH_BASE_URL` in `admin/js/config.js` exactly matches
> your worker URL (no trailing slash).

### 6f — Turn on the AI features (optional)

Two optional buttons in the CMS use your own Anthropic API key — the login
helper worker from 6a proxies both requests so your key never sits in the
browser's JS, and it costs a few cents per use. Skip this step if you don't
want either; the rest of the CMS works fine without it.

- **Stories → "✨ Generate with AI"** — give it a prompt (and optionally some
  photos or a PDF/notes), and it writes a full draft (title, subtitle,
  summary, tags, body) for you to review and edit before saving.
- **Products → "Fetch details"** — paste an affiliate/product link and it
  tries to pull the name, price, photo and a short description straight off
  the page. Works well on storefronts like Shopee, Lazada and Etsy; sites
  that block automated visits (Amazon, notably) may only partly fill in, so
  always double-check before saving.

1. Go to **[console.anthropic.com](https://console.anthropic.com)**, sign up,
   add billing, and create an **API key**.
2. Back in Cloudflare (same worker as 6a) → **Settings** → **Variables and
   Secrets**, add two more **secrets**:
   - Name `ANTHROPIC_API_KEY` → value = the API key from step 1
   - Name `GITHUB_REPO` → value = `YOURNAME/YOURNAME.github.io` (same as
     `REPO` in `admin/js/config.js`) — this makes sure only someone logged
     into **your** site's CMS can trigger a generation, not a stranger who
     finds your worker's web address.
3. **Save / Deploy.**

---

## 🟢 Step 7 — Write your first post

1. In the CMS (`/admin`), click **Stories** in the sidebar, then **+ New Story**.
   (If you set up Step 6f, you can click **✨ Generate with AI** here first to
   get a draft, then edit it like normal.)
2. Fill in the title, pick a category and destination, upload a **cover image**,
   write a short **summary**, and write your story in the **Body** box.
3. Turn **"Feature on homepage"** on for the *one* story you want as the big
   feature (turn it off on the old one).
4. Click **Save**.

Your post is live in ~1 minute. The four starter stories are just examples —
edit or delete them and make the blog yours.

> **Photos:** when you add a cover image or drop images into a story, the CMS
> uploads them for you. Aim for large, landscape photos (~1600px wide) for the
> best look.

---

## 🛍️ Step 7b — Add your product picks (affiliate links)

Your homepage has an **"Our Recent Fav Products"** strip, plus a full
**Our Favorite Products** page (in the menu under **Shop**). Both are powered by
the CMS.

1. In the CMS, click **Products** in the sidebar, then **+ New Product**.
   (If you set up Step 6f, paste your affiliate link into **Fetch details**
   first — it'll try to fill in the name, price and photo for you.)
2. Add a photo, name, price, the platform to buy on (Shopee, Amazon, etc.), the
   country it's available in, a **category**, and your **affiliate link**.
3. Turn on **"Feature on homepage"** for the few you want in the homepage strip.
4. Click **Save**.

The **category** you type becomes a filter button on the Products page
automatically — reuse the same wording (e.g. always "Camera Gear") to group items
together. That's how you manage the filters: just by categorising products.

> The starter products are examples with placeholder photos and `#` links —
> replace them with your real picks and affiliate URLs. Affiliate links already
> use the correct `rel="sponsored"` tag for you.

## 💰 Step 8 — Turn on Google AdSense (monetise your traffic)

Your site already has **ad slots built in** — a banner on the homepage, an
in-feed spot, and an in-article spot inside every post. Right now they show a
subtle "Ad space" placeholder. Here's how to fill them with real, paying ads.

### 8a — Apply to AdSense

1. Go to **[adsense.google.com](https://adsense.google.com)** and sign up with
   your Google account.
2. Add your site (`https://YOURNAME.github.io`) when asked.
3. AdSense will give you a **publisher ID** that looks like
   `ca-pub-1234567890123456`.

### 8b — Add your ID so Google can verify you

1. On GitHub, edit **`ads.txt`** and replace `pub-XXXXXXXXXXXXXXXX` with your
   real ID (the part after `ca-`). Commit.
2. Edit **`_config.yml`** and set:
   ```yaml
   adsense:
     enabled: true                        # was false
     publisher_id: "ca-pub-1234567890123456"   # your real ID
   ```
   Commit changes. This adds Google's verification code to every page.
3. Back in AdSense, click **Verify / Request review**.

### 8c — Wait for approval

Google reviews your site (anywhere from a day to a couple of weeks). To pass,
you generally need:
- **Real, original content** — ✅ you have starter posts; add a few of your own.
- **A privacy policy** — ✅ already built at `/privacy/`.
- **Easy navigation** — ✅ done.

💡 Approval is easier with a handful of genuine posts and a little traffic, so
publish a few real stories first.

### 8d — After approval: place your ad units

1. In AdSense, go to **Ads → By ad unit → Display ads**, create a unit, and
   copy its **ad slot ID** (a long number).
2. Make 2–3 units (one each for banner, in-feed, in-article) and paste the IDs
   into **`_config.yml`**:
   ```yaml
   adsense:
     enabled: true
     publisher_id: "ca-pub-1234567890123456"
     slot_leaderboard: "1111111111"
     slot_infeed: "2222222222"
     slot_inarticle: "3333333333"
   ```
3. Commit. Real ads now appear in place of the placeholders. 💵

> **Earning more later:** once you have steady traffic, networks like **Ezoic**
> or **Mediavine** often pay more than AdSense. The ad slots in this site work
> with them too — you'd swap the ad code in `_includes/ad.html`.

---

## ✨ Optional extras (do these whenever)

**📇 Make the contact form work** — it uses [Formspree](https://formspree.io)
(free). Sign up, create a form, copy your form ID, and paste it into
`contact.md` where it says `YOUR_FORM_ID`.

**📧 Newsletter signups** — connect the footer signup box to a free service like
[Buttondown](https://buttondown.email) or Mailchimp. See `_includes/footer.html`
(the `<form>` around "Postcards, not spam").

**📈 Track your visitors** — create a free [Google Analytics](https://analytics.google.com)
property, then set `google_analytics: "G-XXXXXXXXXX"` in `_config.yml`.

**🔎 Help Google find you** — your site auto-generates a sitemap at
`/sitemap.xml`. Add your site to [Google Search Console](https://search.google.com/search-console)
and submit that sitemap so your stories show up in search.

**🌐 Use your own domain** (e.g. `thecandidduo.com`) — buy one from any registrar,
then in GitHub **Settings → Pages → Custom domain**, enter it and follow the DNS
instructions. Tick **Enforce HTTPS**. (Then update `url:` in `_config.yml`.)

---

## 🎨 Where everything lives (cheat sheet)

| I want to change... | Edit this (or use the CMS) |
|---|---|
| A blog post | **CMS → Stories** (or files in `_posts/`) |
| A product / affiliate pick | **CMS → Products** (or files in `_products/`) |
| The hero slides / ticker / Watch & Listen cards | **CMS → Homepage** (or `_data/homepage.yml`) |
| The top menu | **CMS → Navigation** (or `_data/navigation.yml`) |
| About / Work With Us / Privacy pages | **CMS → Pages** |
| Site name, links, email, AdSense | `_config.yml` |
| Colours & fonts | `assets/css/main.css` (the `:root` block at the very top) |
| The little site icon (favicon) | `assets/images/favicon.svg` |

**Colours** live at the top of `assets/css/main.css`:
```css
--bg:#f7f3ec;      /* page background (warm cream) */
--ink:#241f1b;     /* headings (espresso) */
--accent:#c05a2f;  /* the terracotta accent */
```
Change a value, commit, and the whole site restyles.

---

## 🩹 Troubleshooting

**My site looks plain / broken right after uploading.**
Give it 2–3 minutes and refresh. GitHub rebuilds after every change. Check the
**Actions** tab of your repo — a green tick means it built successfully.

**Wrong web address / links point to the wrong place.**
If you named your repo something *other* than `YOURNAME.github.io` (say, `blog`),
your site lives at `https://YOURNAME.github.io/blog/`. In that case set
`baseurl: "/blog"` in `_config.yml` (match the repo name exactly), and commit.
The simplest fix is to use the `YOURNAME.github.io` repo name from Step 2.

**The CMS won't log in.**
Recheck Step 6: the callback URL must end in `/callback`; both secrets must be
saved in Cloudflare; `AUTH_BASE_URL` in `admin/js/config.js` must exactly
match your worker URL with no trailing slash.

**Images don't show.**
Make sure the image was uploaded (in the CMS it happens automatically). If you
add images by hand, put them in `assets/images/` and reference them like
`/assets/images/your-photo.jpg`.

**I want pagination (page 1, 2, 3…) on the Stories page.**
Not needed until you have lots of posts. When you do, ask and it's a small add.

---

## 🙌 You're done!

You now have a free, self-owned travel blog with a proper editor and money-making
ad slots. Publish real stories, share the link, and grow it.

Questions or something not working? Come back to me (Claude) any time and paste
what you're seeing — happy to help you through it.

*Made with care for The Candid Duo.* 🧡

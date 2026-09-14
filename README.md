# The Candid Duo — Travel Blog

A free, self-owned travel blog: fast static site, a friendly on-site editor
(CMS), and Google AdSense-ready ad slots. Built to run **100% free** on GitHub
Pages.

## 👉 Start here

**New to this? Open [`SETUP-GUIDE.md`](SETUP-GUIDE.md)** — it walks you from a
brand-new GitHub account to a live, editable, money-making blog, click by click.

For a quick one-page checklist, see [`GO-LIVE-CHECKLIST.md`](GO-LIVE-CHECKLIST.md).

## What's inside

- **Editorial design** — warm, magazine-style layout with a hero carousel, a
  WATCH/LISTEN ticker, story cards, destinations, and a rich footer.
- **Write from a dashboard** — a custom-built admin at `/admin`. Create and
  edit posts, homepage sections, pages and the menu without touching code.
- **Monetisation built in** — AdSense-ready ad slots (banner, in-feed,
  in-article) plus `ads.txt` and a privacy policy for approval.
- **Good for SEO** — clean URLs, sitemap, RSS feed, Open Graph tags and
  article structured data.
- **Starter content** — sample stories for Jeju, New Zealand, Tasmania and
  Umroh, ready to replace with your own.

## Tech (for the curious)

Plain [Jekyll](https://jekyllrb.com) — the site engine GitHub Pages builds for
you automatically, so there's nothing to install or run. Content is Markdown;
the CMS commits to your repo and the site rebuilds itself.

## Folder map

```
_config.yml            Site settings (name, URL, social, AdSense)
index.html             Homepage
stories.html           All-stories listing (with category filter)
about.md / contact.md / privacy.md
_posts/                Your blog posts (Markdown)
destinations/          Destination pages (Jeju, NZ, Tasmania, Umroh)
_data/homepage.yml     Hero slides, ticker, Watch & Listen cards
_data/navigation.yml   Top menu
_layouts/ _includes/   Page templates (design)
assets/css/main.css    Colours & fonts (edit the :root block at the top)
assets/images/         Images (favicon + starter art + your uploads)
admin/                 The CMS (index.html, style.css, js/)
oauth-worker/          The CMS's login helper, and (optional) AI story proxy (Cloudflare)
```

## License

The code and design here are yours to use for The Candid Duo. Swap the starter
text and placeholder images for your own words and photos.

// Source of truth for what the CMS can edit — replaces admin/config.yml
// (Decap's schema format). Field shape: { name, label, type, options?,
// default?, hint?, required? }. type is one of:
//   text | textarea | number | date | select | multiselect | boolean | tags | image | image_crop | markdown
// `isBody: true` marks the one field (per collection) that holds the
// markdown body instead of a front matter key.
// `image_crop` is a derived, actually-cropped image (drag-to-pan + zoom,
// like a standard avatar cropper) produced from the photo in the field
// named by `cropFor`. It renders no input of its own — it's a separate
// uploaded file, written only by the crop modal in app.js. A single source
// photo can have more than one crop for different display contexts (e.g. a
// 4:3 card thumbnail vs. a wide hero banner) — `aspectW`/`aspectH` set the
// crop frame's shape and `outputW`/`outputH` the exported file's pixel size
// (default 4:3, 1200×900, if omitted). `listThumbnail: true` marks which
// one of a field's several crops is used for collection list/grid cards
// (`findCropField` in app.js) — needed once there's more than one to choose
// from.
// `emptyOption` (select only) adds a first, blank choice with that label, which
// saves as "no value" — without it a select always submits one of its options.

const COUNTRY_OPTIONS = [
  "Available Worldwide",
  "Indonesia", "Singapore", "Malaysia", "Thailand", "Vietnam", "Philippines",
  "Japan", "South Korea", "Australia", "New Zealand",
  "Saudi Arabia", "United Arab Emirates",
  "United States", "United Kingdom",
];

const postFields = [
  { name: "title", label: "Title", type: "text", required: true },
  { name: "date", label: "Publish date", type: "date", required: true },
  { name: "published", label: "Published", type: "boolean", default: true, hint: "Turn off to save as a draft — it won't appear on the live site until turned back on." },
  // The blog's two niches. A story can be in both (e.g. a trip with the kids). Templates treat a
  // story with no section as Travel. Keep the values in step with SECTION_LIST in oauth-worker/worker.js.
  { name: "section", label: "Section", type: "multiselect", options: ["Travel", "Family"], default: ["Travel"], hint: "Travel, Family or both. Family stories appear on the Family page and in the homepage's Family Life row." },
  // Keep in step with CATEGORY_LIST in oauth-worker/worker.js (the AI generator picks from it).
  { name: "category", label: "Category", type: "select", options: ["Culture", "Adventure", "Guide", "Food", "Reflection", "Parenting", "Kids' Activities", "Milestones"], default: "Culture" },
  { name: "destination", label: "Destination", type: "select", emptyOption: "None (not a trip)", options: ["Jeju", "New Zealand", "Tasmania", "Umroh", "Singapore", "Other"], hint: "Leave as None for at-home family stories." },
  { name: "image", label: "Cover image", type: "image", hint: "Best size ~1600×900px." },
  { name: "image_thumb", label: "Thumbnail crop", type: "image_crop", cropFor: "image", listThumbnail: true, aspectW: 4, aspectH: 3, outputW: 1200, outputH: 900, hint: "Crop how this photo appears in story-card thumbnails across the site." },
  { name: "image_hero", label: "Hero banner crop", type: "image_crop", cropFor: "image", aspectW: 16, aspectH: 9, outputW: 1600, outputH: 900, hint: "Crop how this photo appears as the homepage's full-width hero banner — a much wider frame than the thumbnail crop above. Only needed if this story is picked as a Hero Slide." },
  { name: "image_alt", label: "Cover image alt text", type: "text", hint: "Describe the photo for accessibility & SEO." },
  { name: "dek", label: "Subtitle (dek)", type: "text", hint: "The italic line under the title." },
  { name: "excerpt", label: "Short summary", type: "textarea", hint: "1–2 sentences. Shown on cards and in Google results." },
  { name: "tags", label: "Tags", type: "tags", hint: "Comma-separated." },
  { name: "featured", label: "Feature on homepage", type: "boolean", default: false, hint: "Turn on for ONE story to make it the big feature." },
  // richText: opens in the visual editor (see js/richtext.js) with a Markdown switch.
  // Only stories — Pages hold raw HTML/scripts (contact form) a visual editor would destroy.
  { name: "body", label: "Body", type: "markdown", isBody: true, richText: true },
];

const productFields = [
  { name: "name", label: "Product name", type: "text", required: true },
  { name: "image", label: "Photo", type: "image", hint: "Square works best (about 800×800)." },
  { name: "price", label: "Price", type: "text", hint: "Include the currency, e.g. SGD 39" },
  { name: "platform", label: "Buy on (platform)", type: "select", options: ["Shopee", "Amazon", "Lazada", "TikTok Shop", "Etsy", "Other"] },
  { name: "country", label: "Available in (countries)", type: "multiselect", options: COUNTRY_OPTIONS, hint: "Select every country this product is available in." },
  { name: "category", label: "Category", type: "text", hint: "e.g. Camera Gear, Travel Essentials, Kids & Baby, Family Travel Gear. Reuse exact wording to group items on /products/." },
  // Deliberately not named `url`: on a collection item Jekyll's built-in `url`
  // (the item's generated page address) shadows any front matter `url`, so
  // templates could never read it — the Shop now button linked to a
  // non-existent /products/<slug>/ page instead of the affiliate link.
  { name: "affiliate_url", label: "Affiliate link", type: "text", hint: "Paste your full affiliate URL — the \"Shop now\" button on the site links here." },
  { name: "blurb", label: "Short note", type: "textarea" },
  { name: "featured", label: "Feature on homepage", type: "boolean", default: false },
  { name: "date", label: "Date added", type: "date", required: true },
  { name: "body", label: "Details (optional)", type: "markdown", isBody: true },
];

// Our own digital products (sold on Gumroad/Etsy), shown on the homepage ("From Our Shop") and at
// the top of /products/ ("Made by Us") — kept apart from the affiliate products above because they
// get plain store links (not rel=sponsored) and no affiliate disclosure. A product can be on both
// stores; each link gets its own button. Like `affiliate_url`, no field is called `url` (see the
// productFields note).
const digitalFields = [
  { name: "name", label: "Product name", type: "text", required: true },
  { name: "image", label: "Cover image", type: "image", hint: "Square works best. Your Gumroad or Etsy thumbnail is ideal." },
  { name: "format", label: "Format", type: "text", hint: "Shown above the name, e.g. Printable PDF · 24 pages." },
  { name: "price", label: "Price", type: "text", hint: "Include the currency, e.g. SGD 6" },
  { name: "price_was", label: "Original price", type: "text", hint: "Optional. Shown crossed out before the price during a sale, e.g. SGD 30." },
  { name: "gumroad_url", label: "Gumroad link", type: "text", hint: "This product's Gumroad page. Leave empty if it isn't on Gumroad." },
  { name: "etsy_url", label: "Etsy link", type: "text", hint: "This product's Etsy listing. Leave empty if it isn't on Etsy." },
  { name: "blurb", label: "Short description", type: "textarea" },
  { name: "order", label: "Position", type: "number", hint: "Optional. Lower numbers show first (1, 2, 3…). Products without a position come after, newest first." },
  { name: "featured", label: "Show first on homepage", type: "boolean", default: false, hint: "The homepage shows 3 products: featured ones first, then the rest in Position order." },
  { name: "date", label: "Date added", type: "date", required: true },
];

const pageFields = [
  { name: "title", label: "Title", type: "text", required: true },
  { name: "eyebrow", label: "Eyebrow", type: "text" },
  { name: "lead", label: "Lead (intro line)", type: "textarea" },
  { name: "description", label: "SEO description", type: "textarea" },
  { name: "body", label: "Body", type: "markdown", isBody: true },
];

const heroItemFields = [
  { name: "image", label: "Background image", type: "image" },
  { name: "eyebrow", label: "Eyebrow (small label)", type: "text" },
  { name: "title", label: "Title", type: "text" },
  { name: "subtitle", label: "Subtitle", type: "textarea" },
  { name: "cta_text", label: "Button text", type: "text" },
  { name: "cta_url", label: "Button link", type: "text" },
];
const tickerItemFields = [
  { name: "kind", label: "Kind", type: "select", options: ["WATCH", "LISTEN", "READ"] },
  { name: "label", label: "Label", type: "text" },
  { name: "url", label: "Link", type: "text" },
];
const mediaItemFields = [
  { name: "platform", label: "Platform", type: "select", options: ["youtube", "spotify", "tiktok"] },
  { name: "label", label: "Badge label", type: "text" },
  { name: "title", label: "Title", type: "text" },
  { name: "blurb", label: "Blurb", type: "textarea" },
  { name: "url", label: "Link", type: "text" },
  { name: "image", label: "Image", type: "image" },
  { name: "embed_id", label: "Video ID (playable embed)", type: "text", hint: "YouTube or TikTok video ID — filled in automatically by the buttons above. Leave blank to just link out instead of embedding." },
];
const navItemFields = [
  { name: "title", label: "Label", type: "text" },
  { name: "url", label: "Link", type: "text" },
];
// Platform names double as the icon lookup key in _includes/socials.html —
// add a new platform there (an icon `when` branch) as well as here. A platform
// with no branch (e.g. Lemon8) still renders, using that include's generic link icon.
const socialItemFields = [
  { name: "platform", label: "Platform", type: "select", options: ["Instagram", "TikTok", "YouTube", "Spotify", "Lemon8", "Facebook", "X (Twitter)", "LinkedIn", "Gumroad", "Etsy", "Email"] },
  { name: "url", label: "Link", type: "text", hint: "Paste the full profile link, e.g. https://instagram.com/yourname. For Email, just type the address." },
];

export const SCHEMA = {
  // Not backed by a content file — a read-only overview (traffic, publish status, content
  // stats, recent activity), rendered by js/dashboard.js. First key = first menu item = the
  // page the CMS opens on (state.section defaults to Object.keys(SCHEMA)[0]).
  dashboard: {
    label: "Dashboard",
    kind: "dashboard",
  },
  posts: {
    label: "Stories",
    singular: "Story",
    kind: "collection",
    folder: "_posts",
    fields: postFields,
    titleField: "title",
    imageField: "image",
    metaFields: ["section", "category", "date"],
    badgeField: "featured",
    draftField: "published",
    buildFilename(values, existingName) {
      if (existingName) return existingName;
      const date = /^\d{4}-\d{2}-\d{2}$/.test(values.date || "") ? values.date : new Date().toISOString().slice(0, 10);
      return `${date}-${slugify(values.title)}.md`;
    },
  },
  products: {
    label: "Products",
    singular: "Product",
    kind: "collection",
    folder: "_products",
    fields: productFields,
    titleField: "name",
    imageField: "image",
    metaFields: ["category", "platform"],
    badgeField: "featured",
    buildFilename(values, existingName) {
      if (existingName) return existingName;
      return `${slugify(values.name)}.md`;
    },
  },
  digital: {
    label: "Digital Products",
    singular: "Digital Product",
    kind: "collection",
    folder: "_digital_products",
    fields: digitalFields,
    titleField: "name",
    imageField: "image",
    metaFields: ["format", "price"],
    badgeField: "featured",
    buildFilename(values, existingName) {
      if (existingName) return existingName;
      return `${slugify(values.name)}.md`;
    },
  },
  homepage: {
    label: "Homepage",
    kind: "datafile",
    file: "_data/homepage.yml",
    tabs: [
      { key: "hero", label: "Hero Slides", singular: "Slide", itemFields: heroItemFields, titleField: "title" },
      { key: "ticker", label: "Ticker", singular: "Ticker Item", itemFields: tickerItemFields, titleField: "label" },
      { key: "media_features", label: "Watch & Listen", singular: "Media Card", itemFields: mediaItemFields, titleField: "title" },
    ],
  },
  navigation: {
    label: "Navigation",
    kind: "datafile",
    file: "_data/navigation.yml",
    tabs: [{ key: "main", label: "Menu Links", singular: "Menu Link", itemFields: navItemFields, titleField: "title" }],
  },
  pages: {
    label: "Pages",
    kind: "singles",
    items: [
      { key: "about", label: "About Us", file: "about.md", fields: pageFields },
      { key: "contact", label: "Work With Us", file: "contact.md", fields: pageFields },
      { key: "privacy", label: "Privacy & Cookies", file: "privacy.md", fields: pageFields },
    ],
  },
  socials: {
    label: "Socials",
    kind: "datafile",
    file: "_data/socials.yml",
    tabs: [{ key: "links", label: "Social Links", singular: "Social Link", itemFields: socialItemFields, titleField: "platform" }],
  },
  settings: {
    label: "Settings",
    kind: "settings",
    file: "_data/settings.yml",
    fields: [
      { name: "favicon", label: "Favicon", type: "image", hint: "Used for both the live site and this admin panel. A square image works best (e.g. 512×512 .png) — .svg and .ico also work." },
    ],
  },
};

export function slugify(str) {
  return String(str || "")
    .toLowerCase()
    .trim()
    .replace(/['"]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "untitled";
}

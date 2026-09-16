// Source of truth for what the CMS can edit — replaces admin/config.yml
// (Decap's schema format). Field shape: { name, label, type, options?,
// default?, hint?, required? }. type is one of:
//   text | textarea | date | select | multiselect | boolean | tags | image | image_crop | markdown
// `isBody: true` marks the one field (per collection) that holds the
// markdown body instead of a front matter key.
// `image_crop` is a derived, actually-cropped thumbnail (drag-to-pan +
// zoom, like a standard avatar cropper) produced from the photo in the
// field named by `cropFor`. It renders no input of its own — it's a
// separate uploaded file, written only by the crop modal in app.js.

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
  { name: "category", label: "Category", type: "select", options: ["Culture", "Adventure", "Guide", "Food", "Reflection"], default: "Culture" },
  { name: "destination", label: "Destination", type: "select", options: ["Jeju", "New Zealand", "Tasmania", "Umroh", "Singapore", "Other"] },
  { name: "image", label: "Cover image", type: "image", hint: "Best size ~1600×900px." },
  { name: "image_thumb", label: "Thumbnail crop", type: "image_crop", cropFor: "image", hint: "Crop how this photo appears in story-card thumbnails across the site." },
  { name: "image_alt", label: "Cover image alt text", type: "text", hint: "Describe the photo for accessibility & SEO." },
  { name: "dek", label: "Subtitle (dek)", type: "text", hint: "The italic line under the title." },
  { name: "excerpt", label: "Short summary", type: "textarea", hint: "1–2 sentences. Shown on cards and in Google results." },
  { name: "tags", label: "Tags", type: "tags", hint: "Comma-separated." },
  { name: "featured", label: "Feature on homepage", type: "boolean", default: false, hint: "Turn on for ONE story to make it the big feature." },
  { name: "body", label: "Body", type: "markdown", isBody: true },
];

const productFields = [
  { name: "name", label: "Product name", type: "text", required: true },
  { name: "image", label: "Photo", type: "image", hint: "Square works best (about 800×800)." },
  { name: "price", label: "Price", type: "text", hint: "Include the currency, e.g. SGD 39" },
  { name: "platform", label: "Buy on (platform)", type: "select", options: ["Shopee", "Amazon", "Lazada", "TikTok Shop", "Etsy", "Other"] },
  { name: "country", label: "Available in (countries)", type: "multiselect", options: COUNTRY_OPTIONS, hint: "Select every country this product is available in." },
  { name: "category", label: "Category", type: "text", hint: "e.g. Camera Gear, Travel Essentials. Reuse exact wording to group items on /products/." },
  { name: "url", label: "Affiliate link", type: "text", hint: "Paste your full affiliate URL." },
  { name: "blurb", label: "Short note", type: "textarea" },
  { name: "featured", label: "Feature on homepage", type: "boolean", default: false },
  { name: "date", label: "Date added", type: "date", required: true },
  { name: "body", label: "Details (optional)", type: "markdown", isBody: true },
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

export const SCHEMA = {
  posts: {
    label: "Stories",
    singular: "Story",
    kind: "collection",
    folder: "_posts",
    fields: postFields,
    titleField: "title",
    imageField: "image",
    metaFields: ["category", "date"],
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

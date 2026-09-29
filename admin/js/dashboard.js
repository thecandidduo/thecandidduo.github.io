// The CMS Dashboard: rough site traffic (from the worker's cookie-free counter —
// see oauth-worker/worker.js "Traffic counter"), whether your last save is live,
// a content overview, and recent activity.
//
// Every card loads on its own and shows its own loading / error / "here's what to
// do next" state, so one slow or failing piece never blanks the whole page.

import * as GH from "./github-api.js";
import { parseFrontmatter, postUrlFromFilename } from "./content.js";
import { fetchStats } from "./stats.js";
import { REPO, BRANCH, SITE_URL } from "./config.js";

const esc = (s) =>
  String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const num = (n) => Number(n || 0).toLocaleString("en-US");
const RANGES = [7, 30, 90];

function timeAgo(iso) {
  const secs = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (secs < 60) return "just now";
  const units = [[86400, "day"], [3600, "hour"], [60, "minute"]];
  for (const [size, name] of units) {
    if (secs >= size) {
      const n = Math.floor(secs / size);
      return `${n} ${name}${n === 1 ? "" : "s"} ago`;
    }
  }
}

// "2026-09-26" -> "Sep 26"
function shortDay(day) {
  const [y, m, d] = day.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
}

const todaySG = () => new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Singapore" }); // YYYY-MM-DD

// ---- owner's own visits ----------------------------------------------------
// The public site's counter skips any browser with localStorage.cd_ignore set. The CMS sets it
// on login (app.js) so the owner's own clicking around doesn't inflate a small blog's numbers;
// cd_count_me is the "count me anyway" opt-out from that.
const ownerCounted = () => {
  try { return !!localStorage.getItem("cd_count_me"); } catch { return false; }
};
function setOwnerCounted(on) {
  try {
    if (on) { localStorage.setItem("cd_count_me", "1"); localStorage.removeItem("cd_ignore"); }
    else { localStorage.removeItem("cd_count_me"); localStorage.setItem("cd_ignore", "1"); }
  } catch { /* private mode etc. */ }
}

// ---- friendly names ---------------------------------------------------------
const PAGE_NAMES = {
  "/": "Homepage", "/stories/": "All stories", "/destinations/": "Destinations", "/products/": "Shop",
  "/about/": "About", "/contact/": "Work with us", "/privacy/": "Privacy & cookies",
};
function pageName(path, posts) {
  if (PAGE_NAMES[path]) return PAGE_NAMES[path];
  const post = posts.find((p) => p.path === path);
  if (post) return post.title;
  const dest = path.match(/^\/destinations\/([^/]+)\/$/);
  if (dest) return dest[1].replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()) + " (destination)";
  return path;
}

const REFERRERS = [
  [/(^|\.)google\./, "Google"], [/(^|\.)bing\.com$/, "Bing"], [/duckduckgo\.com$/, "DuckDuckGo"], [/yahoo\./, "Yahoo"],
  [/instagram\.com$/, "Instagram"], [/(^|\.)facebook\.com$|^fb\.com$/, "Facebook"], [/^t\.co$|twitter\.com$|(^|\.)x\.com$/, "X (Twitter)"],
  [/tiktok\.com$/, "TikTok"], [/youtube\.com$|^youtu\.be$/, "YouTube"], [/pinterest\./, "Pinterest"], [/reddit\.com$/, "Reddit"],
  [/lemon8/, "Lemon8"], [/(^|\.)linkedin\.com$|^lnkd\.in$/, "LinkedIn"], [/whatsapp\.com$/, "WhatsApp"], [/linktr\.ee$/, "Linktree"],
];
function referrerName(host) {
  if (!host) return "Direct or unknown";
  const hit = REFERRERS.find(([re]) => re.test(host));
  return hit ? hit[1] : host;
}
let regionNames = null;
function countryName(code) {
  if (!code) return "Unknown";
  try {
    regionNames = regionNames || new Intl.DisplayNames(["en"], { type: "region" });
    return regionNames.of(code) || code;
  } catch { return code; }
}
const deviceName = (d) => (d ? d[0].toUpperCase() + d.slice(1) : "Unknown");

// ---- data the cards share ---------------------------------------------------
async function loadPosts(token) {
  const files = (await GH.listDir(token, "_posts")).filter((f) => f.type === "file" && f.name.endsWith(".md"));
  return Promise.all(
    files.map(async (f) => {
      const file = await GH.getFile(token, f.path);
      const { data, body } = parseFrontmatter(file.text);
      return {
        path: postUrlFromFilename(f.name),
        title: data.title || f.name,
        date: String(data.date || ""),
        destination: data.destination || "",
        featured: data.featured === true || data.featured === "true",
        published: data.published !== false && data.published !== "false",
        words: String(body || "").trim().split(/\s+/).filter(Boolean).length,
      };
    })
  );
}

async function loadProducts(token) {
  const files = (await GH.listDir(token, "_products")).filter((f) => f.type === "file" && f.name.endsWith(".md"));
  return Promise.all(
    files.map(async (f) => {
      const file = await GH.getFile(token, f.path);
      const { data } = parseFrontmatter(file.text);
      const link = String(data.affiliate_url || "").trim();
      return { name: data.name || f.name, hasLink: link !== "" && link !== "#" };
    })
  );
}

// ---- traffic card -----------------------------------------------------------
function chartSvg(daily) {
  const W = 600, H = 140, n = daily.length;
  const max = Math.max(1, ...daily.map((d) => d.views));
  const gap = n > 45 ? 1 : 3;
  const bw = (W - gap * (n - 1)) / n;
  const bars = daily
    .map((d, i) => {
      const h = d.views ? Math.max(3, (d.views / max) * (H - 6)) : 1.5;
      const x = i * (bw + gap);
      const cls = d.views ? (i === n - 1 ? "bar bar--today" : "bar") : "bar bar--zero";
      const tip = `${shortDay(d.day)}: ${num(d.views)} view${d.views === 1 ? "" : "s"}, ${num(d.visitors)} visitor${d.visitors === 1 ? "" : "s"}`;
      return `<rect class="${cls}" x="${x.toFixed(2)}" y="${(H - h).toFixed(2)}" width="${bw.toFixed(2)}" height="${h.toFixed(2)}" rx="1.5"><title>${esc(tip)}</title></rect>`;
    })
    .join("");
  return `<svg class="dash-chart" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" role="img" aria-label="Views per day">${bars}</svg>`;
}

function deltaHtml(cur, prev, days, hasPrior) {
  if (!hasPrior) return "";
  if (prev === 0) return cur > 0 ? `<span class="dash-delta up">new</span>` : "";
  const pct = Math.round(((cur - prev) / prev) * 100);
  if (pct === 0) return `<span class="dash-delta">no change vs previous ${days} days</span>`;
  return `<span class="dash-delta ${pct > 0 ? "up" : "down"}">${pct > 0 ? "▲" : "▼"} ${Math.abs(pct)}% vs previous ${days} days</span>`;
}

function listBlock(title, rows, labelOf, tipOf) {
  const max = Math.max(1, ...rows.map((r) => r.views));
  const body = rows.length
    ? `<ul>${rows
        .map(
          (r) =>
            `<li title="${esc(tipOf ? tipOf(r.name) : labelOf(r.name))}"><span class="dash-list__name">${esc(labelOf(r.name))}</span><span class="dash-list__n">${num(r.views)}</span><i style="width:${Math.max(3, Math.round((r.views / max) * 100))}%"></i></li>`
        )
        .join("")}</ul>`
    : `<p class="dash-muted">Nothing yet</p>`;
  return `<div class="dash-list"><h3>${esc(title)}</h3>${body}</div>`;
}

function trafficOk(data, posts, days) {
  const { totals, previous } = data;
  const hasPrior = !!data.firstDay && data.firstDay < data.since;
  const avg = Math.round((totals.views / data.days) * 10) / 10;
  const empty = totals.views === 0 && !data.firstDay;
  const first = data.daily[0].day, last = data.daily[data.daily.length - 1].day;
  const since = data.firstDay && data.firstDay >= data.since ? `Counting since ${shortDay(data.firstDay)}. ` : "";
  return `
    <div class="dash-tiles">
      <div class="dash-tile"><span class="dash-tile__label">Page views</span><strong>${num(totals.views)}</strong>${deltaHtml(totals.views, previous.views, days, hasPrior)}</div>
      <div class="dash-tile"><span class="dash-tile__label" title="Each person is counted once per day, so someone who visits on 3 different days counts 3 times.">Visitors</span><strong>${num(totals.visitors)}</strong>${deltaHtml(totals.visitors, previous.visitors, days, hasPrior)}</div>
      <div class="dash-tile"><span class="dash-tile__label">Views per day</span><strong>${num(avg)}</strong><span class="dash-delta">average</span></div>
    </div>
    ${
      empty
        ? `<div class="dash-empty"><strong>Counting is on — no visits recorded yet.</strong><p>Open your site in a <em>private / incognito window</em> to see your first view appear here (your normal browser is ignored because you use this CMS). It can take a minute to show up.</p></div>`
        : `${chartSvg(data.daily)}<div class="dash-axis"><span>${shortDay(first)}</span><span>${shortDay(last)}</span></div>`
    }
    <div class="dash-lists">
      ${listBlock("Top pages", data.pages, (p) => pageName(p, posts), (p) => `${pageName(p, posts)} — ${p}`)}
      ${listBlock("Where visitors come from", data.referrers, referrerName)}
      ${listBlock("Countries", data.countries, countryName)}
      ${listBlock("Devices", data.devices, deviceName)}
    </div>
    <p class="dash-note">${since}Counts are rough — ad blockers and privacy browsers hide some visitors. Nothing personal is stored (no cookies, no IP addresses).
      <span class="dash-owner">Your own visits from this browser ${ownerCounted() ? "<b>are counted</b>" : "are ignored"}.
      <button type="button" class="dash-link" data-owner-toggle>${ownerCounted() ? "Ignore my visits" : "Count my visits"}</button></span></p>`;
}

const STEPS = [
  { title: "Update your worker's code", body: `In Cloudflare open <b>Workers &amp; Pages</b> → your worker → <b>Edit code</b>. Replace everything with the latest <code>oauth-worker/worker.js</code> from your site folder, then click <b>Deploy</b>.` },
  { title: "Create a free database", body: `In Cloudflare go to <b>Storage &amp; databases → D1 SQL database → Create database</b> and name it <code>candidduo-stats</code>.` },
  { title: "Connect it to your worker", body: `Your worker → <b>Settings → Bindings → Add → D1 database</b>. Set the variable name to <code>DB</code>, choose <code>candidduo-stats</code>, then <b>Deploy</b>.` },
];

function setupCard(kind, message) {
  const guide = `https://github.com/${REPO}/blob/${BRANCH}/SETUP-GUIDE.md`;
  if (kind === "unauthorized")
    return `<div class="dash-empty"><strong>This login can't read the stats.</strong><p>Log out and back in with the GitHub account that owns the site, then try again.</p><button type="button" class="btn-secondary" data-retry>Check again</button></div>`;
  if (kind === "offline" || kind === "error")
    return `<div class="dash-empty"><strong>Couldn't load traffic.</strong><p>${esc(message || "Your worker didn't answer — check your connection and try again.")}</p><button type="button" class="btn-secondary" data-retry>Try again</button></div>`;
  if (kind === "missing_secret")
    return `<div class="dash-setup"><h3>One more setting</h3><p>Your worker is updated, but it needs a secret so it knows this is your site:</p>
      <p>Worker → <b>Settings → Variables and Secrets → Add</b> — name <code>GITHUB_REPO</code>, value <code>${esc(REPO)}</code> — then <b>Deploy</b>.</p>
      <button type="button" class="btn-primary" data-retry>Check again</button></div>`;
  const doneCount = kind === "needs_database" ? 1 : 0;
  return `<div class="dash-setup">
      <h3>Turn on traffic counting</h3>
      <p>The site isn't counting visitors yet. It takes about five minutes, once, and everything stays in <b>your own</b> free Cloudflare account — no cookies and no third-party scripts.</p>
      <ol>${STEPS.map((s, i) => `<li class="${i < doneCount ? "is-done" : ""}"><span class="dash-step">${i < doneCount ? "✓" : i + 1}</span><div><strong>${s.title}</strong><p>${s.body}</p></div></li>`).join("")}</ol>
      <div class="dash-setup__actions"><button type="button" class="btn-primary" data-retry>I've done this — check again</button><a href="${guide}" target="_blank" rel="noopener">Full instructions (Step 6g) ↗</a></div>
    </div>`;
}

// ---- the dashboard ----------------------------------------------------------
export async function renderDashboard({ main, token, navigate, newItem }) {
  const runKey = String(Math.random());
  main.dataset.dash = runKey;
  // Also false once another view has replaced the dashboard's markup inside the same <main>.
  const alive = () => main.isConnected && main.dataset.dash === runKey && !!main.querySelector(".dash");

  let days = 30;
  try { days = RANGES.includes(+localStorage.getItem("cms.dashDays")) ? +localStorage.getItem("cms.dashDays") : 30; } catch { /* default */ }

  let postsP, productsP;
  const resetShared = () => { postsP = productsP = null; };
  const getPosts = () => (postsP ||= loadPosts(token));
  const getProducts = () => (productsP ||= loadProducts(token));

  main.innerHTML = `
    <div class="main-header">
      <div><span class="eyebrow">Overview</span><h1>Dashboard</h1></div>
      <div class="header-actions">
        <button type="button" class="btn-secondary" id="dash-refresh" title="Reload every card">Refresh</button>
        <button type="button" class="btn-primary" id="dash-new-story">+ New story</button>
      </div>
    </div>
    <div class="dash">
      <section class="dash-card dash-traffic">
        <div class="dash-card__head"><h2>Traffic</h2>
          <div class="dash-range" role="group" aria-label="Time range">${RANGES.map((d) => `<button type="button" data-days="${d}" class="${d === days ? "is-on" : ""}">${d} days</button>`).join("")}</div>
        </div>
        <div id="dash-traffic"><p class="dash-muted">Loading traffic…</p></div>
      </section>
      <div class="dash-side">
        <section class="dash-card"><div class="dash-card__head"><h2>Site status</h2></div><div id="dash-status"><p class="dash-muted">Checking…</p></div></section>
        <section class="dash-card"><div class="dash-card__head"><h2>Content</h2></div><div id="dash-content"><p class="dash-muted">Loading…</p></div></section>
        <section class="dash-card"><div class="dash-card__head"><h2>Recent activity</h2></div><div id="dash-activity"><p class="dash-muted">Loading…</p></div></section>
      </div>
    </div>`;

  const $ = (id) => document.getElementById(id);
  const fail = (el, err, retry) => {
    if (!alive()) return;
    el.innerHTML = `<p class="dash-error">${esc(err.message || err)}</p><button type="button" class="btn-secondary" data-retry>Try again</button>`;
    el.querySelector("[data-retry]").addEventListener("click", retry);
  };

  // ---------- traffic ----------
  async function loadTraffic() {
    const el = $("dash-traffic");
    el.innerHTML = `<p class="dash-muted">Loading traffic…</p>`;
    const [result, posts] = await Promise.all([fetchStats(token, days), getPosts().catch(() => [])]);
    if (!alive()) return;
    if (result.state !== "ok") {
      el.innerHTML = setupCard(result.state, result.message);
      el.querySelector("[data-retry]")?.addEventListener("click", loadTraffic);
      return;
    }
    el.innerHTML = trafficOk(result.data, posts, days);
    el.querySelector("[data-owner-toggle]")?.addEventListener("click", () => {
      setOwnerCounted(!ownerCounted());
      loadTraffic();
    });
  }
  main.querySelectorAll("[data-days]").forEach((b) =>
    b.addEventListener("click", () => {
      days = +b.dataset.days;
      try { localStorage.setItem("cms.dashDays", String(days)); } catch { /* fine */ }
      main.querySelectorAll("[data-days]").forEach((x) => x.classList.toggle("is-on", x === b));
      loadTraffic();
    })
  );

  // ---------- publish status ----------
  let polls = 0;
  async function loadStatus() {
    const el = $("dash-status");
    try {
      const b = await GH.getLatestPagesBuild(token);
      if (!alive()) return;
      if (!b) { el.innerHTML = `<p class="dash-muted">Nothing has been published yet.</p>`; return; }
      const when = timeAgo(b.updated_at || b.created_at);
      const building = b.status === "building" || b.status === "queued";
      const failed = b.status === "errored";
      el.innerHTML = building
        ? `<p class="dash-status dash-status--wait"><i></i>Publishing your latest changes…</p><p class="dash-muted">Usually 1–2 minutes. After it finishes, hard-refresh your site (⌘⇧R) — browsers hold on to old pages for a few minutes.</p>`
        : failed
          ? `<p class="dash-status dash-status--bad"><i></i>Last build didn't finish</p><p class="dash-muted">If you saved several times in a row, GitHub cancels the earlier builds and only the newest counts — check again in a minute. If it stays like this, something needs fixing.</p><button type="button" class="btn-secondary" data-retry>Check again</button>`
          : `<p class="dash-status dash-status--ok"><i></i>Live</p><p class="dash-muted">Last published ${esc(when)}.</p><a href="${SITE_URL}" target="_blank" rel="noopener">Open your site ↗</a>`;
      el.querySelector("[data-retry]")?.addEventListener("click", loadStatus);
      if (building && polls++ < 36) setTimeout(() => alive() && loadStatus(), 10000); // watch it finish
    } catch (e) { fail(el, e, loadStatus); }
  }

  // ---------- content overview ----------
  async function loadContent() {
    const el = $("dash-content");
    try {
      const [posts, products] = await Promise.all([getPosts(), getProducts().catch(() => null)]);
      if (!alive()) return;
      const today = todaySG();
      const live = posts.filter((p) => p.published && p.date <= today);
      const drafts = posts.filter((p) => !p.published);
      const scheduled = posts.filter((p) => p.published && p.date > today);
      const latest = live.map((p) => p.date).sort().pop();
      const ago = latest ? Math.floor((Date.parse(today) - Date.parse(latest)) / 86400000) : null;
      const featured = live.filter((p) => p.featured);
      const byDest = {};
      live.forEach((p) => (byDest[p.destination || "Other"] = (byDest[p.destination || "Other"] || 0) + 1));
      const words = live.reduce((n, p) => n + p.words, 0);
      const noLink = products ? products.filter((p) => !p.hasLink) : [];
      const row = (label, value, warn) => `<div class="dash-fact${warn ? " is-warn" : ""}"><dt>${label}</dt><dd>${value}</dd></div>`;
      el.innerHTML = `<dl class="dash-facts">
        ${row("Stories live", `${live.length}${drafts.length ? ` <span class="dash-muted">· ${drafts.length} draft${drafts.length === 1 ? "" : "s"}</span>` : ""}${scheduled.length ? ` <span class="dash-muted">· ${scheduled.length} scheduled</span>` : ""}`)}
        ${latest ? row("Last story", `${esc(shortDay(latest))} <span class="dash-muted">· ${ago === 0 ? "today" : ago + " day" + (ago === 1 ? "" : "s") + " ago"}</span>`, ago > 30) : ""}
        ${row("Words published", `≈ ${num(words)}`)}
        ${products ? row("Products", `${products.length}${noLink.length ? ` <span class="dash-warn">· ${noLink.length} without a buy link</span>` : ""}`, noLink.length) : ""}
        ${featured.length > 1 ? row("Featured", `<span class="dash-warn">${featured.length} stories are marked featured — only the newest shows on the homepage</span>`, true) : featured.length === 1 ? row("Featured", esc(featured[0].title)) : row("Featured", `<span class="dash-muted">none</span>`)}
      </dl>
      ${Object.keys(byDest).length ? `<div class="dash-dests">${Object.entries(byDest).sort((a, b) => b[1] - a[1]).map(([d, n]) => `<span class="dash-chip">${esc(d)} <b>${n}</b></span>`).join("")}</div>` : ""}
      <div class="dash-links"><button type="button" class="dash-link" data-go="posts">Manage stories →</button><button type="button" class="dash-link" data-go="products">Manage products →</button></div>`;
      el.querySelectorAll("[data-go]").forEach((b) => b.addEventListener("click", () => navigate(b.dataset.go)));
    } catch (e) { fail(el, e, loadContent); }
  }

  // ---------- recent activity ----------
  async function loadActivity() {
    const el = $("dash-activity");
    try {
      const commits = await GH.listRecentCommits(token, 25);
      if (!alive()) return;
      const items = commits
        .map((c) => ({ msg: String(c.commit.message || "").split("\n")[0], when: c.commit.author.date }))
        .filter((c) => c.msg && !/^upload image/i.test(c.msg)) // one per photo — pure noise here
        .slice(0, 6);
      el.innerHTML = items.length
        ? `<ul class="dash-activity">${items.map((c) => `<li><span>${esc(c.msg.length > 84 ? c.msg.slice(0, 83) + "…" : c.msg)}</span><time>${esc(timeAgo(c.when))}</time></li>`).join("")}</ul>`
        : `<p class="dash-muted">No activity yet.</p>`;
    } catch (e) { fail(el, e, loadActivity); }
  }

  const loadAll = () => { polls = 0; resetShared(); loadTraffic(); loadStatus(); loadContent(); loadActivity(); };
  $("dash-refresh").addEventListener("click", loadAll);
  $("dash-new-story").addEventListener("click", () => newItem("posts"));
  loadAll();
}

import { SCHEMA } from "./schema.js";
import * as GH from "./github-api.js";
import { login, getToken, setToken, clearToken, fetchCurrentUser } from "./auth.js";
import { parseFrontmatter, serializeFrontmatter, parseListsYaml, serializeListsYaml, parseFlatYaml, serializeFlatYaml } from "./content.js";
import { REPO, BRANCH, SITE_URL, UPLOADS_PATH, YOUTUBE_CHANNEL_URL } from "./config.js";
import { generateStory, fetchProductDetails, fileToBase64, isPdf, MAX_AI_IMAGES, MAX_AI_DOCUMENTS } from "./ai.js";
import { fetchLatestYoutubeVideo, fetchTiktokOembed, parseYoutubeId } from "./media.js";

const app = document.getElementById("app");
const state = { token: null, user: null, section: Object.keys(SCHEMA)[0] };

async function init() {
  applyFavicon();
  const token = getToken();
  if (token) {
    try {
      state.user = await fetchCurrentUser(token);
      state.token = token;
    } catch (e) {
      clearToken();
    }
  }
  render();
}

// admin/index.html has no build-time templating (it's a plain static file,
// not processed by Jekyll), so the CMS's own favicon — same one used on the
// live site — has to be applied at runtime instead of via a <link> Jekyll
// would fill in. Runs before login too (anonymous read of a public repo).
async function applyFavicon() {
  try {
    const file = await GH.getFile(state.token, SCHEMA.settings.file);
    if (!file) return;
    const data = parseFlatYaml(file.text);
    if (!data.favicon) return;
    let link = document.querySelector('link[rel="icon"]');
    if (!link) {
      link = document.createElement("link");
      link.rel = "icon";
      document.head.appendChild(link);
    }
    link.href = imageSrc(data.favicon);
  } catch {
    // Non-critical — the admin just keeps the browser's default icon.
  }
}

function render() {
  state.user ? renderApp() : renderLogin();
}

function renderLogin() {
  app.innerHTML = `
    <div class="login-screen">
      <div class="login-card">
        <h1>The Candid Duo</h1>
        <p class="login-sub">Admin</p>
        <button id="login-btn" class="btn-primary">Login with GitHub</button>
        <div id="login-error" class="error-banner" hidden></div>
        <a class="back-link" href="${SITE_URL}">&larr; Back to site</a>
      </div>
    </div>`;
  document.getElementById("login-btn").addEventListener("click", async () => {
    const btn = document.getElementById("login-btn");
    const err = document.getElementById("login-error");
    err.hidden = true;
    btn.disabled = true;
    btn.textContent = "Waiting for GitHub…";
    try {
      const token = await login();
      setToken(token);
      state.token = token;
      state.user = await fetchCurrentUser(token);
      render();
    } catch (e) {
      err.hidden = false;
      err.textContent = e.message;
      btn.disabled = false;
      btn.textContent = "Login with GitHub";
    }
  });
}

function renderApp() {
  app.innerHTML = `
    <div class="shell">
      <aside class="sidebar">
        <div class="brand">The Candid Duo<span>Admin</span></div>
        <nav id="nav"></nav>
        <a class="back-link" href="${SITE_URL}" target="_blank" rel="noopener">&larr; View site</a>
        <div class="user-badge">
          <img src="${state.user.avatar_url}" alt="">
          <span>${escapeHtml(state.user.login)}</span>
          <button id="logout-btn" title="Log out">Log out</button>
        </div>
      </aside>
      <main class="main" id="main"></main>
    </div>`;
  renderNav();
  document.getElementById("logout-btn").addEventListener("click", () => {
    clearToken();
    state.token = null;
    state.user = null;
    render();
  });
  renderSection(state.section);
}

function renderNav() {
  const nav = document.getElementById("nav");
  nav.innerHTML = Object.entries(SCHEMA)
    .map(([key, s]) => `<button class="nav-item ${key === state.section ? "active" : ""}" data-section="${key}">${ICONS[key] || ICONS.default}<span>${s.label}</span></button>`)
    .join("");
  nav.querySelectorAll(".nav-item").forEach((btn) => {
    btn.addEventListener("click", () => {
      state.section = btn.dataset.section;
      renderApp();
    });
  });
}

async function renderSection(key) {
  const schema = SCHEMA[key];
  const main = document.getElementById("main");
  main.innerHTML = `<div class="loading">Loading…</div>`;
  try {
    if (schema.kind === "collection") await renderCollectionList(key, schema);
    else if (schema.kind === "datafile") await renderDatafile(key, schema);
    else if (schema.kind === "singles") await renderSingles(key, schema);
    else if (schema.kind === "settings") await renderSettingsEditor(key, schema);
  } catch (e) {
    main.innerHTML = `<div class="error-banner">${escapeHtml(e.message)}</div>`;
  }
}

// ---------------- Collections (Stories / Products) ----------------

async function renderCollectionList(key, schema) {
  const main = document.getElementById("main");
  const files = (await GH.listDir(state.token, schema.folder)).filter((f) => f.type === "file" && f.name.endsWith(".md"));
  const items = await Promise.all(
    files.map(async (f) => {
      const file = await GH.getFile(state.token, f.path);
      const { data, body } = parseFrontmatter(file.text);
      return { name: f.name, path: f.path, sha: file.sha, data, body };
    })
  );
  items.sort((a, b) => {
    const da = a.data.date || "", db = b.data.date || "";
    if (da !== db) return da < db ? 1 : -1;
    return String(a.data[schema.titleField] || "").localeCompare(String(b.data[schema.titleField] || ""));
  });

  const singular = schema.singular;
  const view = getListView(key);
  main.innerHTML = `
    <div class="main-header">
      <div><span class="eyebrow">Manage</span><h1>${schema.label}</h1></div>
      <div class="header-actions">
        <div class="view-toggle">
          <button type="button" class="view-toggle-btn ${view === "grid" ? "active" : ""}" data-view="grid" title="Grid view">${ICONS.grid}</button>
          <button type="button" class="view-toggle-btn ${view === "list" ? "active" : ""}" data-view="list" title="List view">${ICONS.list}</button>
        </div>
        <button id="new-item-btn" class="btn-primary">+ New ${singular}</button>
      </div>
    </div>
    <div class="${view === "grid" ? "card-list" : "row-list"}">
      ${items.length === 0 ? `<p class="empty">No ${schema.label.toLowerCase()} yet.</p>` : items.map((item) => (view === "grid" ? collectionCardHtml(item, schema) : collectionRowHtml(item, schema))).join("")}
    </div>`;

  main.querySelectorAll(".view-toggle-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      setListView(key, btn.dataset.view);
      renderCollectionList(key, schema);
    });
  });
  document.getElementById("new-item-btn").addEventListener("click", () => renderCollectionEditor(key, schema, null));
  main.querySelectorAll("[data-open]").forEach((el) => {
    el.addEventListener("click", () => {
      const item = items.find((i) => i.path === el.dataset.open);
      renderCollectionEditor(key, schema, item);
    });
  });
}

function getListView(key) {
  try {
    return localStorage.getItem(`cms_view_${key}`) === "list" ? "list" : "grid";
  } catch {
    return "grid";
  }
}
function setListView(key, view) {
  try {
    localStorage.setItem(`cms_view_${key}`, view);
  } catch {
    // Ignore — private browsing or blocked storage just means the preference won't stick.
  }
}

// The field (if any) that stores this collection's cropped thumbnail image,
// so list/grid cards show the same crop the live site will. `listThumbnail`
// disambiguates when a source photo has more than one crop (e.g. posts also
// have a wide `image_hero` crop that isn't a list-card thumbnail).
function findCropField(schema) {
  return (schema.fields || []).find((f) => f.type === "image_crop" && f.cropFor === schema.imageField && f.listThumbnail);
}

function badgeInfo(item, schema) {
  if (schema.draftField && item.data[schema.draftField] === false) return { text: "DRAFT", cls: "pill-draft" };
  if (schema.badgeField && item.data[schema.badgeField]) return { text: "FEATURED", cls: "pill-featured" };
  const fallback = item.data.category || item.data.platform || "";
  return fallback ? { text: fallback, cls: "" } : null;
}

function collectionCardHtml(item, schema) {
  const title = item.data[schema.titleField] || "(untitled)";
  const cropField = findCropField(schema);
  const img = (cropField && item.data[cropField.name]) || (schema.imageField ? item.data[schema.imageField] : null);
  const badge = badgeInfo(item, schema);
  const meta = (schema.metaFields || []).map((f) => item.data[f]).filter(Boolean).join(" · ");
  return `
    <div class="card" data-open="${escapeAttr(item.path)}">
      <div class="card-thumb">${img ? `<img src="${imageSrc(img)}" loading="lazy">` : '<div class="thumb-empty"></div>'}</div>
      <div class="card-body">
        ${badge ? `<span class="pill ${badge.cls}">${escapeHtml(badge.text)}</span>` : ""}
        <h3>${escapeHtml(title)}</h3>
        ${meta ? `<p class="card-meta">${escapeHtml(meta)}</p>` : ""}
      </div>
    </div>`;
}

function collectionRowHtml(item, schema) {
  const title = item.data[schema.titleField] || "(untitled)";
  const cropField = findCropField(schema);
  const img = (cropField && item.data[cropField.name]) || (schema.imageField ? item.data[schema.imageField] : null);
  const badge = badgeInfo(item, schema);
  const meta = (schema.metaFields || []).map((f) => item.data[f]).filter(Boolean).join(" · ");
  return `
    <div class="row-item" data-open="${escapeAttr(item.path)}">
      <div class="row-thumb">${img ? `<img src="${imageSrc(img)}" loading="lazy">` : '<div class="thumb-empty"></div>'}</div>
      <div class="row-body">
        <h3>${escapeHtml(title)}</h3>
        ${meta ? `<p class="card-meta">${escapeHtml(meta)}</p>` : ""}
      </div>
      ${badge ? `<span class="pill ${badge.cls}">${escapeHtml(badge.text)}</span>` : ""}
    </div>`;
}

function renderCollectionEditor(key, schema, item) {
  const main = document.getElementById("main");
  const values = item ? item.data : {};
  const bodyField = schema.fields.find((f) => f.isBody);
  const bodyVal = item ? item.body : "";
  const singular = schema.singular.toLowerCase();

  main.innerHTML = `
    <div class="main-header">
      <div><span class="eyebrow">${item ? "Edit" : "New"}</span><h1 id="editor-title">${escapeHtml(item ? values[schema.titleField] || "Untitled" : `New ${singular}`)}</h1></div>
      <div class="header-actions">
        ${item ? '<button id="delete-btn" class="btn-danger">Delete</button>' : ""}
        <button id="cancel-btn" class="btn-secondary">Cancel</button>
        <button id="save-btn" class="btn-primary">Save</button>
      </div>
    </div>
    <div class="error-banner" id="form-error" hidden></div>
    ${key === "posts" && !item ? aiGeneratorHtml() : ""}
    ${key === "products" ? productFetchHtml() : ""}
    <form id="entry-form" class="entry-form">
      ${renderFormFields(schema.fields, values)}
      ${bodyField ? bodyFieldHtml(bodyField, bodyVal) : ""}
    </form>`;

  wireImageFields(main);
  wireMultiselectFields(main);
  wireBodyImageInsert(main);
  wireBodyVideoInsert(main);
  if (key === "posts" && !item) wireAiGenerator(main);
  if (key === "products") wireProductFetch(main);
  document.getElementById("cancel-btn").addEventListener("click", () => renderSection(key));

  if (item) {
    document.getElementById("delete-btn").addEventListener("click", async () => {
      if (!confirm(`Delete "${values[schema.titleField]}"? This can't be undone from here.`)) return;
      try {
        await GH.deleteFile(state.token, item.path, `Delete ${singular}: ${values[schema.titleField]}`, item.sha);
        renderSection(key);
      } catch (e) {
        if (e.conflict) {
          showFormError("This was changed elsewhere since you opened it, so deleting now could remove the wrong version.", {
            label: "Reload latest",
            onClick: () => reopenCollectionEditor(key, schema, item.path),
          });
        } else {
          showFormError(e.message);
        }
      }
    });
  }

  document.getElementById("save-btn").addEventListener("click", async () => {
    const form = document.getElementById("entry-form");
    const { values: newValues, body } = collectFormValues(form, schema.fields);
    const missing = schema.fields.find((f) => f.required && !f.isBody && !newValues[f.name]);
    if (missing) {
      showFormError(`"${missing.label}" is required.`);
      return;
    }
    const filename = schema.buildFilename(newValues, item ? item.name : null);
    const path = `${schema.folder}/${filename}`;
    const text = serializeFrontmatter(newValues, body, schema.fields);
    const btn = document.getElementById("save-btn");
    btn.disabled = true;
    btn.textContent = "Saving…";
    try {
      await GH.putTextFile(state.token, path, text, `${item ? "Update" : "Create"} ${singular}: ${newValues[schema.titleField]}`, item ? item.sha : undefined);
      renderSection(key);
    } catch (e) {
      if (e.conflict) {
        showFormError(`This ${singular.toLowerCase()} was changed elsewhere since you opened it — your edits here haven't been saved. Reload to see the latest version, then reapply your changes.`, {
          label: "Reload latest",
          onClick: () => (item ? reopenCollectionEditor(key, schema, item.path) : renderSection(key)),
        });
      } else {
        showFormError(e.message);
      }
      btn.disabled = false;
      btn.textContent = "Save";
    }
  });
}

// ---------------- Data files (Homepage / Navigation) ----------------

async function renderDatafile(key, schema) {
  const file = await GH.getFile(state.token, schema.file);
  const data = file ? parseListsYaml(file.text) : {};
  schema.tabs.forEach((t) => {
    if (!data[t.key]) data[t.key] = [];
  });
  const st = { sha: file ? file.sha : null, data, activeTab: schema.tabs[0].key };
  if (schema.tabs.some((t) => t.key === "hero")) {
    st.posts = await loadPostSummaries();
  }
  renderDatafileBody(key, schema, st);
}

// Post summaries for the "Populate from story" hero-slide picker. Prefers
// each post's wide `image_hero` crop over its raw cover photo — the hero
// carousel is a full-bleed panorama, a very different shape from the 4:3
// `image_thumb` card crop, so reusing that one here would recrop it again
// and shift its framing (can misalign the subject with the overlaid title
// text). Falls back to the raw image for posts that don't have a hero crop
// yet. Drafts are excluded — their live URL wouldn't resolve, so linking a
// hero slide to one would 404 until it's published.
async function loadPostSummaries() {
  const postSchema = SCHEMA.posts;
  const files = (await GH.listDir(state.token, postSchema.folder)).filter((f) => f.type === "file" && f.name.endsWith(".md"));
  const items = await Promise.all(
    files.map(async (f) => {
      const file = await GH.getFile(state.token, f.path);
      const { data } = parseFrontmatter(file.text);
      return {
        title: data.title || f.name,
        image: data.image_hero || data.image || "",
        subtitle: data.dek || data.excerpt || "",
        url: postUrlFromFilename(f.name),
        published: data.published !== false,
      };
    })
  );
  const published = items.filter((p) => p.published);
  published.sort((a, b) => a.title.localeCompare(b.title));
  return published;
}

function postUrlFromFilename(name) {
  const m = name.match(/^\d{4}-\d{2}-\d{2}-(.+)\.md$/);
  return `/stories/${m ? m[1] : name.replace(/\.md$/, "")}/`;
}

function renderDatafileBody(key, schema, st) {
  const main = document.getElementById("main");
  main.innerHTML = `
    <div class="main-header">
      <div><span class="eyebrow">Manage</span><h1>${schema.label}</h1></div>
      <button id="save-all-btn" class="btn-primary">Save changes</button>
    </div>
    <div class="error-banner" id="form-error" hidden></div>
    <div class="tabs">
      ${schema.tabs.map((t) => `<button class="tab ${t.key === st.activeTab ? "active" : ""}" data-tab="${t.key}">${t.label} (${(st.data[t.key] || []).length})</button>`).join("")}
    </div>
    <div id="tab-body"></div>`;

  main.querySelectorAll(".tab").forEach((b) =>
    b.addEventListener("click", () => {
      syncActiveTabFromDom(schema, st);
      st.activeTab = b.dataset.tab;
      renderDatafileBody(key, schema, st);
    })
  );
  renderTabItems(schema, st);

  document.getElementById("save-all-btn").addEventListener("click", async () => {
    syncActiveTabFromDom(schema, st);
    const text = serializeListsYaml(st.data, schema.tabs);
    const btn = document.getElementById("save-all-btn");
    btn.disabled = true;
    btn.textContent = "Saving…";
    try {
      const result = await GH.putTextFile(state.token, schema.file, text, `Update ${schema.label}`, st.sha);
      st.sha = result.content.sha;
      btn.textContent = "Saved ✓";
      setTimeout(() => {
        btn.disabled = false;
        btn.textContent = "Save changes";
      }, 1500);
    } catch (e) {
      if (e.conflict) {
        showFormError(`${schema.label} was changed elsewhere since you opened it — your edits here haven't been saved. Reload to see the latest version, then reapply your changes.`, {
          label: "Reload latest",
          onClick: () => renderDatafile(key, schema),
        });
      } else {
        showFormError(e.message);
      }
      btn.disabled = false;
      btn.textContent = "Save changes";
    }
  });
}

function renderTabItems(schema, st) {
  const tab = schema.tabs.find((t) => t.key === st.activeTab);
  const body = document.getElementById("tab-body");
  const items = st.data[tab.key] || [];
  const singular = tab.singular;
  body.innerHTML = `
    ${tab.key === "media_features" ? mediaFetchActionsHtml() : ""}
    <div class="list-editor" id="list-editor">
      ${items.map((item, idx) => listItemHtml(tab, item, idx, items.length, st.posts)).join("")}
    </div>
    <button id="add-item-btn" class="btn-secondary">+ Add ${singular}</button>`;

  wireImageFields(body);
  wireStoryPickers(body, st.posts);
  if (tab.key === "media_features") wireMediaFetchActions(body, schema, st);
  document.getElementById("add-item-btn").addEventListener("click", () => {
    syncActiveTabFromDom(schema, st);
    st.data[tab.key].push({});
    renderTabItems(schema, st);
  });
  body.querySelectorAll("[data-remove]").forEach((btn) =>
    btn.addEventListener("click", () => {
      syncActiveTabFromDom(schema, st);
      st.data[tab.key].splice(Number(btn.dataset.remove), 1);
      renderTabItems(schema, st);
    })
  );
  body.querySelectorAll("[data-move-up]").forEach((btn) =>
    btn.addEventListener("click", () => {
      syncActiveTabFromDom(schema, st);
      const i = Number(btn.dataset.moveUp);
      const arr = st.data[tab.key];
      if (i > 0) [arr[i - 1], arr[i]] = [arr[i], arr[i - 1]];
      renderTabItems(schema, st);
    })
  );
  body.querySelectorAll("[data-move-down]").forEach((btn) =>
    btn.addEventListener("click", () => {
      syncActiveTabFromDom(schema, st);
      const i = Number(btn.dataset.moveDown);
      const arr = st.data[tab.key];
      if (i < arr.length - 1) [arr[i + 1], arr[i]] = [arr[i], arr[i + 1]];
      renderTabItems(schema, st);
    })
  );
}

// "Watch & Listen" tab only — pulls real video data so an admin doesn't
// have to hand-type titles/IDs for something that already exists online.
function mediaFetchActionsHtml() {
  return `
    <div class="media-fetch-actions">
      <button type="button" id="pull-youtube-btn" class="btn-secondary">📺 Pull latest YouTube video</button>
      <button type="button" id="add-tiktok-btn" class="btn-secondary">🎵 Add TikTok video from URL</button>
    </div>
    <div class="error-banner" id="media-fetch-error" hidden></div>`;
}

function wireMediaFetchActions(body, schema, st) {
  const ytBtn = document.getElementById("pull-youtube-btn");
  const ttBtn = document.getElementById("add-tiktok-btn");
  const errEl = document.getElementById("media-fetch-error");

  const showMediaFetchError = (msg) => {
    errEl.hidden = false;
    errEl.textContent = msg;
  };

  ytBtn.addEventListener("click", async () => {
    errEl.hidden = true;
    ytBtn.disabled = true;
    ytBtn.textContent = "Pulling…";
    try {
      const video = await fetchLatestYoutubeVideo(YOUTUBE_CHANNEL_URL);
      syncActiveTabFromDom(schema, st);
      st.data.media_features.unshift({
        platform: "youtube",
        label: "Watch on YouTube",
        title: video.title,
        blurb: "",
        url: video.url,
        image: video.thumbnail,
        embed_id: video.videoId,
      });
      renderTabItems(schema, st);
    } catch (e) {
      showMediaFetchError(e.message);
    } finally {
      ytBtn.disabled = false;
      ytBtn.textContent = "📺 Pull latest YouTube video";
    }
  });

  ttBtn.addEventListener("click", async () => {
    const url = (prompt("Paste the TikTok video URL (not your profile link):") || "").trim();
    if (!url) return;
    errEl.hidden = true;
    ttBtn.disabled = true;
    ttBtn.textContent = "Fetching…";
    try {
      const video = await fetchTiktokOembed(url);
      syncActiveTabFromDom(schema, st);
      st.data.media_features.unshift({
        platform: "tiktok",
        label: "Watch on TikTok",
        title: video.title,
        blurb: video.authorName ? `via @${video.authorName}` : "",
        url: video.url,
        // Not video.thumbnail — TikTok's oEmbed thumbnail URLs are signed
        // and expire within days; the live embed shows its own preview.
        image: "",
        embed_id: video.videoId,
      });
      renderTabItems(schema, st);
    } catch (e) {
      showMediaFetchError(e.message);
    } finally {
      ttBtn.disabled = false;
      ttBtn.textContent = "🎵 Add TikTok video from URL";
    }
  });
}

function listItemHtml(tab, item, idx, total, posts) {
  const idPrefix = `${tab.key}_${idx}_`;
  const storyPicker = tab.key === "hero" && posts && posts.length
    ? `<div class="form-row form-row-full story-picker-row">
        <label>Populate from an existing story</label>
        <select class="story-picker" data-story-idx="${idx}">
          <option value="">— Choose a story to autofill —</option>
          ${posts.map((p, pi) => `<option value="${pi}">${escapeHtml(p.title)}</option>`).join("")}
        </select>
      </div>`
    : "";
  return `
    <div class="list-item" data-idx="${idx}">
      <div class="list-item-controls">
        <button data-move-up="${idx}" ${idx === 0 ? "disabled" : ""} title="Move up">&uarr;</button>
        <button data-move-down="${idx}" ${idx === total - 1 ? "disabled" : ""} title="Move down">&darr;</button>
        <button data-remove="${idx}" class="btn-danger-ghost" title="Remove">&times;</button>
      </div>
      <div class="list-item-fields">${storyPicker}${renderFormFields(tab.itemFields, item, idPrefix)}</div>
    </div>`;
}

// Autofills a hero-slide's fields from a selected story's front matter.
function wireStoryPickers(scopeEl, posts) {
  if (!posts || !posts.length) return;
  scopeEl.querySelectorAll(".story-picker").forEach((sel) => {
    sel.addEventListener("change", () => {
      const post = posts[Number(sel.value)];
      if (!post) return;
      const itemEl = sel.closest(".list-item");
      const imgWrap = itemEl.querySelector('[data-field="image"][data-type="image"]');
      if (imgWrap) {
        imgWrap.querySelector('[data-role="value"]').value = post.image;
        imgWrap.querySelector(".image-preview").innerHTML = post.image ? `<img src="${imageSrc(post.image)}">` : '<div class="image-empty">No image</div>';
      }
      const titleEl = itemEl.querySelector('[data-field="title"]');
      if (titleEl) titleEl.value = post.title;
      const subtitleEl = itemEl.querySelector('[data-field="subtitle"]');
      if (subtitleEl) subtitleEl.value = post.subtitle;
      const ctaTextEl = itemEl.querySelector('[data-field="cta_text"]');
      if (ctaTextEl && !ctaTextEl.value) ctaTextEl.value = "Read the story";
      const ctaUrlEl = itemEl.querySelector('[data-field="cta_url"]');
      if (ctaUrlEl) ctaUrlEl.value = post.url;
    });
  });
}

function syncActiveTabFromDom(schema, st) {
  const tab = schema.tabs.find((t) => t.key === st.activeTab);
  const container = document.getElementById("list-editor");
  if (!container) return;
  const items = [];
  container.querySelectorAll(".list-item").forEach((el) => {
    const { values } = collectFormValues(el, tab.itemFields);
    items.push(values);
  });
  st.data[tab.key] = items;
}

// ---------------- Singles (Pages) ----------------

async function renderSingles(key, schema) {
  const main = document.getElementById("main");
  main.innerHTML = `
    <div class="main-header"><div><span class="eyebrow">Manage</span><h1>${schema.label}</h1></div></div>
    <div class="card-list">
      ${schema.items.map((it) => `<div class="card card-simple" data-open="${it.key}"><div class="card-body"><h3>${escapeHtml(it.label)}</h3><p class="card-meta">${it.file}</p></div></div>`).join("")}
    </div>`;
  main.querySelectorAll("[data-open]").forEach((el) => {
    el.addEventListener("click", () => renderSinglesEditor(key, schema, schema.items.find((i) => i.key === el.dataset.open)));
  });
}

async function renderSinglesEditor(key, schema, pageDef) {
  const main = document.getElementById("main");
  main.innerHTML = `<div class="loading">Loading…</div>`;
  const file = await GH.getFile(state.token, pageDef.file);
  const { data, body } = file ? parseFrontmatter(file.text) : { data: {}, body: "" };
  const bodyField = pageDef.fields.find((f) => f.isBody);

  main.innerHTML = `
    <div class="main-header">
      <div><span class="eyebrow">Edit Page</span><h1>${escapeHtml(pageDef.label)}</h1></div>
      <div class="header-actions">
        <button id="cancel-btn" class="btn-secondary">Cancel</button>
        <button id="save-btn" class="btn-primary">Save</button>
      </div>
    </div>
    <div class="error-banner" id="form-error" hidden></div>
    <form id="entry-form" class="entry-form">
      ${renderFormFields(pageDef.fields, data)}
      ${bodyField ? bodyFieldHtml(bodyField, body) : ""}
    </form>`;

  wireBodyImageInsert(main);
  wireBodyVideoInsert(main);
  document.getElementById("cancel-btn").addEventListener("click", () => renderSection(key));
  document.getElementById("save-btn").addEventListener("click", async () => {
    const form = document.getElementById("entry-form");
    const { values, body: newBody } = collectFormValues(form, pageDef.fields);
    values.layout = data.layout || "page";
    values.permalink = data.permalink || `/${pageDef.key}/`;
    const fieldsWithHidden = [...pageDef.fields, { name: "layout", type: "text" }, { name: "permalink", type: "text" }];
    const text = serializeFrontmatter(values, newBody, fieldsWithHidden);
    const btn = document.getElementById("save-btn");
    btn.disabled = true;
    btn.textContent = "Saving…";
    try {
      await GH.putTextFile(state.token, pageDef.file, text, `Update page: ${pageDef.label}`, file ? file.sha : undefined);
      renderSection(key);
    } catch (e) {
      if (e.conflict) {
        showFormError("This page was changed elsewhere since you opened it — your edits here haven't been saved. Reload to see the latest version, then reapply your changes.", {
          label: "Reload latest",
          onClick: () => renderSinglesEditor(key, schema, pageDef),
        });
      } else {
        showFormError(e.message);
      }
      btn.disabled = false;
      btn.textContent = "Save";
    }
  });
}

// ---------------- Settings (single flat file, no list/body) ----------------

async function renderSettingsEditor(key, schema) {
  const main = document.getElementById("main");
  const file = await GH.getFile(state.token, schema.file);
  const data = file ? parseFlatYaml(file.text) : {};
  let sha = file ? file.sha : undefined;

  main.innerHTML = `
    <div class="main-header">
      <div><span class="eyebrow">Manage</span><h1>${schema.label}</h1></div>
      <div class="header-actions"><button id="save-btn" class="btn-primary">Save</button></div>
    </div>
    <div class="error-banner" id="form-error" hidden></div>
    <form id="entry-form" class="entry-form">
      ${renderFormFields(schema.fields, data)}
    </form>`;

  wireImageFields(main);
  document.getElementById("save-btn").addEventListener("click", async () => {
    const form = document.getElementById("entry-form");
    const { values } = collectFormValues(form, schema.fields);
    const text = serializeFlatYaml(values, schema.fields);
    const btn = document.getElementById("save-btn");
    btn.disabled = true;
    btn.textContent = "Saving…";
    try {
      const result = await GH.putTextFile(state.token, schema.file, text, `Update ${schema.label}`, sha);
      sha = result.content.sha;
      applyFavicon();
      btn.textContent = "Saved ✓";
      setTimeout(() => {
        btn.disabled = false;
        btn.textContent = "Save";
      }, 1500);
    } catch (e) {
      if (e.conflict) {
        showFormError(`${schema.label} was changed elsewhere since you opened it — your edits here haven't been saved. Reload to see the latest version, then reapply your changes.`, {
          label: "Reload latest",
          onClick: () => renderSettingsEditor(key, schema),
        });
      } else {
        showFormError(e.message);
      }
      btn.disabled = false;
      btn.textContent = "Save";
    }
  });
}

// ---------------- AI story generation (Stories only, new entries) ----------------

function aiGeneratorHtml() {
  return `
    <div class="ai-box">
      <button type="button" id="ai-toggle" class="btn-secondary ai-toggle">✨ Generate with AI</button>
      <div id="ai-panel" class="ai-panel" hidden>
        <div class="form-row form-row-full">
          <label>What's the story?</label>
          <textarea id="ai-prompt" rows="4" placeholder="e.g. A weekend in Jeju — tangerine picking, black sand beaches, and getting caught in a sudden storm on the coastal trail."></textarea>
        </div>
        <div class="form-row">
          <label>Photos (optional)</label>
          <input type="file" id="ai-images" accept="image/*" multiple>
          <p class="hint">Up to ${MAX_AI_IMAGES} images.</p>
        </div>
        <div class="form-row">
          <label>Notes / itinerary (optional)</label>
          <input type="file" id="ai-docs" accept=".pdf,.csv,.txt" multiple>
          <p class="hint">PDF, CSV or text files, up to ${MAX_AI_DOCUMENTS}.</p>
        </div>
        <div class="error-banner" id="ai-error" hidden></div>
        <div class="ai-actions">
          <button type="button" id="ai-generate" class="btn-primary">Generate story</button>
          <button type="button" id="ai-cancel" class="btn-secondary">Cancel</button>
        </div>
      </div>
    </div>`;
}

function wireAiGenerator(main) {
  const toggle = document.getElementById("ai-toggle");
  const panel = document.getElementById("ai-panel");
  const errEl = document.getElementById("ai-error");
  toggle.addEventListener("click", () => {
    panel.hidden = !panel.hidden;
  });
  document.getElementById("ai-cancel").addEventListener("click", () => {
    panel.hidden = true;
  });
  document.getElementById("ai-generate").addEventListener("click", async () => {
    errEl.hidden = true;
    const promptEl = document.getElementById("ai-prompt");
    const prompt = promptEl.value.trim();
    if (!prompt) {
      errEl.hidden = false;
      errEl.textContent = "Describe the story first.";
      return;
    }
    const imageFiles = Array.from(document.getElementById("ai-images").files || []).slice(0, MAX_AI_IMAGES);
    const docFiles = Array.from(document.getElementById("ai-docs").files || []).slice(0, MAX_AI_DOCUMENTS);
    const btn = document.getElementById("ai-generate");
    btn.disabled = true;
    btn.textContent = "Generating… this can take a minute";
    try {
      const images = await Promise.all(
        imageFiles.map(async (f) => ({ mediaType: f.type || "image/jpeg", data: await fileToBase64(f) }))
      );
      const documents = [];
      const notes = [];
      for (const f of docFiles) {
        if (isPdf(f)) documents.push({ data: await fileToBase64(f) });
        else notes.push({ name: f.name, text: await f.text() });
      }
      const story = await generateStory(state.token, { prompt, images, documents, notes });
      const form = document.getElementById("entry-form");
      setFieldValue(form, "title", story.title);
      setFieldValue(form, "dek", story.dek);
      setFieldValue(form, "excerpt", story.excerpt);
      setFieldValue(form, "tags", Array.isArray(story.tags) ? story.tags.join(", ") : story.tags);
      setFieldValue(form, "body", story.body);
      const titleEl = document.getElementById("editor-title");
      if (titleEl && story.title) titleEl.textContent = story.title;
      panel.hidden = true;
    } catch (e) {
      errEl.hidden = false;
      errEl.textContent = e.message;
    } finally {
      btn.disabled = false;
      btn.textContent = "Generate story";
    }
  });
}

function setFieldValue(form, name, value) {
  const el = form.querySelector(`[data-field="${name}"]`);
  if (el) el.value = value || "";
}

// ---------------- "Fetch details from URL" (Products only) ----------------

function productFetchHtml() {
  return `
    <div class="ai-box" id="product-fetch-box">
      <div class="fetch-row">
        <input type="text" id="fetch-url" placeholder="Paste an affiliate / product link…">
        <button type="button" id="fetch-btn" class="btn-primary">Fetch details</button>
      </div>
      <div class="error-banner" id="fetch-error" hidden></div>
      <p class="hint" id="fetch-status"></p>
    </div>`;
}

function wireProductFetch(main) {
  const urlInput = document.getElementById("fetch-url");
  const btn = document.getElementById("fetch-btn");
  const errEl = document.getElementById("fetch-error");
  const statusEl = document.getElementById("fetch-status");
  const form = document.getElementById("entry-form");

  const existingUrl = form.querySelector('[data-field="affiliate_url"]');
  if (existingUrl && existingUrl.value) urlInput.value = existingUrl.value;

  btn.addEventListener("click", async () => {
    errEl.hidden = true;
    statusEl.textContent = "";
    const url = urlInput.value.trim();
    if (!url) {
      errEl.hidden = false;
      errEl.textContent = "Paste a product link first.";
      return;
    }
    btn.disabled = true;
    btn.textContent = "Fetching…";
    try {
      const result = await fetchProductDetails(state.token, url);
      setFieldValue(form, "affiliate_url", url);
      if (result.name) setFieldValue(form, "name", result.name);
      if (result.price) setFieldValue(form, "price", result.price);
      if (result.blurb) setFieldValue(form, "blurb", result.blurb);
      if (result.category) setFieldValue(form, "category", result.category);
      const platformEl = form.querySelector('[data-field="platform"]');
      if (platformEl && result.platform) platformEl.value = result.platform;

      const imgWrap = form.querySelector('[data-field="image"][data-type="image"]');
      if (imgWrap && result.image && result.image.data) {
        statusEl.textContent = "Uploading photo…";
        const path = await uploadFetchedImage(result.image.data, result.image.mediaType);
        imgWrap.querySelector('[data-role="value"]').value = path;
        imgWrap.querySelector(".image-preview").innerHTML = `<img src="${imageSrc(path)}">`;
      } else if (imgWrap && result.imageUrl) {
        imgWrap.querySelector('[data-role="value"]').value = result.imageUrl;
        imgWrap.querySelector(".image-preview").innerHTML = `<img src="${imageSrc(result.imageUrl)}">`;
      }

      const editorTitle = document.getElementById("editor-title");
      if (editorTitle && result.name) editorTitle.textContent = result.name;

      if (!result.pageFetched) statusEl.textContent = "Couldn't load that page — fill in the details manually.";
      else if (!result.name && !result.price) statusEl.textContent = "Found the page but couldn't read product details — fill in what's missing.";
      else statusEl.textContent = "Filled in what we could find — check it over before saving.";
    } catch (e) {
      errEl.hidden = false;
      errEl.textContent = e.message;
    } finally {
      btn.disabled = false;
      btn.textContent = "Fetch details";
    }
  });
}

// ---------------- Shared form building ----------------

function renderFormFields(fields, values, idPrefix = "") {
  return fields
    // image_crop fields with `cropFor` render nested inside their paired
    // image field (as the "Crop thumbnail" row) instead of their own row.
    .filter((f) => !f.isBody && !(f.type === "image_crop" && f.cropFor))
    .map(
      (f) => `
    <div class="form-row">
      <label for="${idPrefix}f_${f.name}">${escapeHtml(f.label)}${f.required ? " *" : ""}</label>
      ${fieldInputHtml(f, values[f.name], idPrefix, values, fields)}
      ${f.hint ? `<p class="hint">${escapeHtml(f.hint)}</p>` : ""}
    </div>`
    )
    .join("");
}

function bodyFieldHtml(field, value) {
  return `
    <div class="form-row form-row-full">
      <div class="body-field-head">
        <label>${escapeHtml(field.label)}</label>
        <div class="body-field-actions">
          <button type="button" class="btn-secondary body-insert-btn" data-target="${field.name}">+ Insert image</button>
          <button type="button" class="btn-secondary body-video-btn" data-target="${field.name}">+ Insert video</button>
        </div>
      </div>
      <div class="body-video-row" data-target="${field.name}" hidden>
        <input type="text" placeholder="Paste a YouTube link, e.g. https://youtu.be/dQw4w9WgXcQ" autocomplete="off">
        <button type="button" class="btn-primary body-video-insert">Insert</button>
        <button type="button" class="btn-secondary body-video-cancel">Cancel</button>
      </div>
      <textarea data-field="${field.name}" data-type="markdown" rows="18" class="markdown-input">${escapeHtml(value)}</textarea>
      <input type="file" accept="image/*" class="body-insert-input" data-target="${field.name}" hidden>
      <p class="hint body-insert-status" data-target="${field.name}"></p>
    </div>`;
}

// A small "current crop + Crop button" row nested inside the image field's
// box — one per paired `image_crop` field, since a photo can have more than
// one crop (a 4:3 thumbnail, a wide hero banner, etc). Each crop is a
// genuinely separate, physically-cropped file (produced by the drag/zoom
// modal in openCropModal()) — the source photo above is never modified.
function thumbCropRowHtml(cropField, thumbValue) {
  return `
    <div class="thumb-crop-row" data-crop-field="${cropField.name}">
      <div class="thumb-crop-preview">${thumbValue ? `<img src="${imageSrc(thumbValue)}">` : '<span>No crop yet</span>'}</div>
      <div class="thumb-crop-info">
        <button type="button" class="btn-secondary crop-open-btn"
          data-crop-field="${cropField.name}"
          data-crop-label="${escapeAttr(cropField.label)}"
          data-aspect-w="${cropField.aspectW || 4}" data-aspect-h="${cropField.aspectH || 3}"
          data-output-w="${cropField.outputW || 1200}" data-output-h="${cropField.outputH || 900}">✂ ${escapeHtml(cropField.label)}</button>
        ${cropField.hint ? `<p class="hint">${escapeHtml(cropField.hint)}</p>` : ""}
      </div>
    </div>`;
}

function fieldInputHtml(field, rawValue, idPrefix = "", allValues = {}, allFields = []) {
  const id = `${idPrefix}f_${field.name}`;
  const value = rawValue !== undefined && rawValue !== null ? rawValue : field.default !== undefined ? field.default : "";
  switch (field.type) {
    case "textarea":
      return `<textarea id="${id}" data-field="${field.name}" data-type="textarea" rows="3">${escapeHtml(value)}</textarea>`;
    case "date":
      return `<input type="date" id="${id}" data-field="${field.name}" data-type="date" value="${escapeAttr(value)}">`;
    case "boolean":
      return `<label class="switch"><input type="checkbox" id="${id}" data-field="${field.name}" data-type="boolean" ${value ? "checked" : ""}><span></span></label>`;
    case "select":
      return `<select id="${id}" data-field="${field.name}" data-type="select">${(field.options || [])
        .map((o) => `<option value="${escapeAttr(o)}" ${o === value ? "selected" : ""}>${escapeHtml(o)}</option>`)
        .join("")}</select>`;
    case "tags":
      return `<input type="text" id="${id}" data-field="${field.name}" data-type="tags" value="${escapeAttr(Array.isArray(value) ? value.join(", ") : value)}" placeholder="comma, separated, tags">`;
    case "image": {
      const cropFields = allFields.filter((f) => f.type === "image_crop" && f.cropFor === field.name);
      return `
        <div class="image-field" data-field="${field.name}" data-type="image">
          <input type="hidden" data-role="value" value="${escapeAttr(value)}">
          <div class="image-preview">${value ? `<img src="${imageSrc(value)}">` : '<div class="image-empty">No image</div>'}</div>
          <input type="file" accept="image/*" data-role="file-input" id="${id}">
          <div class="image-status"></div>
          ${value && cropFields.length ? `<div class="crop-rows">${cropFields.map((cf) => thumbCropRowHtml(cf, allValues[cf.name] || "")).join("")}</div>` : ""}
          ${cropFields
            .map(
              (cf) =>
                `<div class="crop-value-holder" data-field="${cf.name}" data-type="image_crop" data-hint="${escapeAttr(cf.hint || "")}" data-label="${escapeAttr(cf.label)}" data-aspect-w="${cf.aspectW || 4}" data-aspect-h="${cf.aspectH || 3}" data-output-w="${cf.outputW || 1200}" data-output-h="${cf.outputH || 900}" hidden><input type="hidden" data-role="value" value="${escapeAttr(allValues[cf.name] || "")}"></div>`
            )
            .join("")}
        </div>`;
    }
    // image_crop fields render nested inside their paired image field (see
    // above), not as their own row — this only fires if one is used without
    // a `cropFor` pairing, which isn't the case for anything today.
    case "image_crop":
      return `<div class="crop-value-holder" data-field="${field.name}" data-type="image_crop" hidden><input type="hidden" data-role="value" value="${escapeAttr(value)}"></div>`;
    case "multiselect": {
      const selected = Array.isArray(value) ? value : value ? [value] : [];
      return `
        <div class="multiselect" data-field="${field.name}" data-type="multiselect">
          <button type="button" class="multiselect-toggle" id="${id}">${selected.length ? `${selected.length} selected` : "Select…"}</button>
          <div class="multiselect-panel" hidden>
            ${(field.options || [])
              .map((o) => `<label class="ms-option"><input type="checkbox" value="${escapeAttr(o)}" ${selected.includes(o) ? "checked" : ""}> ${escapeHtml(o)}</label>`)
              .join("")}
          </div>
          <div class="multiselect-chips">${selected.map((s) => `<span class="chip" data-chip="${escapeAttr(s)}">${escapeHtml(s)}<button type="button" class="chip-remove" title="Remove">&times;</button></span>`).join("")}</div>
        </div>`;
    }
    default:
      return `<input type="text" id="${id}" data-field="${field.name}" data-type="text" value="${escapeAttr(value)}">`;
  }
}

function collectFormValues(container, fields) {
  const values = {};
  for (const f of fields) {
    if (f.isBody) continue;
    if (f.type === "image") {
      const wrap = container.querySelector(`[data-field="${f.name}"][data-type="image"]`);
      values[f.name] = wrap ? wrap.querySelector('[data-role="value"]').value : "";
      continue;
    }
    if (f.type === "multiselect") {
      const wrap = container.querySelector(`[data-field="${f.name}"][data-type="multiselect"]`);
      values[f.name] = wrap ? Array.from(wrap.querySelectorAll('input[type="checkbox"]:checked')).map((c) => c.value) : [];
      continue;
    }
    if (f.type === "image_crop") {
      const wrap = container.querySelector(`[data-field="${f.name}"][data-type="image_crop"]`);
      values[f.name] = wrap ? wrap.querySelector('[data-role="value"]').value : "";
      continue;
    }
    const el = container.querySelector(`[data-field="${f.name}"]`);
    if (!el) continue;
    if (f.type === "boolean") values[f.name] = el.checked;
    else if (f.type === "tags") values[f.name] = el.value.split(",").map((s) => s.trim()).filter(Boolean);
    else values[f.name] = el.value;
  }
  const bodyField = fields.find((f) => f.isBody);
  const body = bodyField ? container.querySelector(`[data-field="${bodyField.name}"]`)?.value || "" : "";
  return { values, body };
}

function wireImageFields(scopeEl) {
  scopeEl.querySelectorAll(".image-field").forEach((wrap) => {
    const fileInput = wrap.querySelector('[data-role="file-input"]');
    if (!fileInput || fileInput.dataset.wired) return;
    fileInput.dataset.wired = "1";
    fileInput.addEventListener("change", async () => {
      const file = fileInput.files[0];
      if (!file) return;
      if (file.size > 8 * 1024 * 1024) {
        alert("Image too large (max 8MB).");
        fileInput.value = "";
        return;
      }
      const statusEl = wrap.querySelector(".image-status");
      const preview = wrap.querySelector(".image-preview");
      const objectUrl = URL.createObjectURL(file);
      preview.innerHTML = `<img src="${objectUrl}">`;
      wrap.dataset.sourceUrl = objectUrl; // crop against the local file, no need to wait for the upload
      ensureThumbCropRow(wrap);
      statusEl.textContent = "Uploading…";
      try {
        const path = await uploadImage(file);
        wrap.querySelector('[data-role="value"]').value = path;
        statusEl.textContent = "Uploaded ✓";
      } catch (e) {
        statusEl.textContent = "Upload failed: " + e.message;
      }
    });
  });
  wireThumbCrop(scopeEl);
}

// Adds each paired crop field's "current crop + Crop" row the first time a
// field gets a photo (a field that started empty has nothing to crop until
// now) — one row per `.crop-value-holder`, since a photo can have more than
// one crop variant (thumbnail, hero banner, ...).
function ensureThumbCropRow(wrap) {
  const holders = wrap.querySelectorAll(".crop-value-holder");
  if (!holders.length) return;
  let rows = wrap.querySelector(".crop-rows");
  if (!rows) {
    rows = document.createElement("div");
    rows.className = "crop-rows";
    wrap.querySelector(".image-status").insertAdjacentElement("afterend", rows);
  }
  holders.forEach((holder) => {
    const fieldName = holder.dataset.field;
    if (rows.querySelector(`.thumb-crop-row[data-crop-field="${fieldName}"]`)) return;
    const row = document.createElement("div");
    row.className = "thumb-crop-row";
    row.dataset.cropField = fieldName;
    row.innerHTML = `
      <div class="thumb-crop-preview"><span>No crop yet</span></div>
      <div class="thumb-crop-info">
        <button type="button" class="btn-secondary crop-open-btn"
          data-crop-field="${fieldName}"
          data-crop-label="${escapeAttr(holder.dataset.label || "Crop")}"
          data-aspect-w="${holder.dataset.aspectW}" data-aspect-h="${holder.dataset.aspectH}"
          data-output-w="${holder.dataset.outputW}" data-output-h="${holder.dataset.outputH}">✂ ${escapeHtml(holder.dataset.label || "Crop")}</button>
        ${holder.dataset.hint ? `<p class="hint">${escapeHtml(holder.dataset.hint)}</p>` : ""}
      </div>`;
    rows.appendChild(row);
  });
  wireThumbCrop(wrap);
}

// Wires "Crop" buttons to open the drag/zoom modal (at that button's own
// aspect ratio/output size) against whichever source is freshest (a
// just-picked local file, falling back to the already-saved photo), then
// uploads the cropped result into that button's paired crop field.
function wireThumbCrop(scopeEl) {
  scopeEl.querySelectorAll(".crop-open-btn").forEach((btn) => {
    if (btn.dataset.wired) return;
    btn.dataset.wired = "1";
    btn.addEventListener("click", () => {
      const wrap = btn.closest(".image-field");
      const savedPath = wrap.querySelector('[data-role="value"]').value;
      const sourceUrl = wrap.dataset.sourceUrl || (savedPath ? imageSrc(savedPath) : "");
      if (!sourceUrl) return;
      const fieldName = btn.dataset.cropField;
      const opts = {
        aspectW: Number(btn.dataset.aspectW) || 4,
        aspectH: Number(btn.dataset.aspectH) || 3,
        outputW: Number(btn.dataset.outputW) || 1200,
        outputH: Number(btn.dataset.outputH) || 900,
        title: btn.dataset.cropLabel || "Crop photo",
      };
      openCropModal(sourceUrl, opts, async (blob) => {
        const holder = wrap.querySelector(`.crop-value-holder[data-field="${fieldName}"]`);
        const preview = wrap.querySelector(`.thumb-crop-row[data-crop-field="${fieldName}"] .thumb-crop-preview`);
        const localUrl = URL.createObjectURL(blob);
        preview.innerHTML = `<img src="${localUrl}">`;
        try {
          const base64 = await fileToBase64(blob);
          const path = await uploadImageBase64(base64, `${fieldName}.jpg`);
          holder.querySelector('[data-role="value"]').value = path;
        } catch (e) {
          preview.innerHTML = `<span>Save failed</span>`;
          alert("Couldn't save the cropped photo: " + e.message);
        }
      });
    });
  });
}

// A standard drag-to-pan + zoom-slider image cropper (the same interaction
// as most avatar/thumbnail croppers). Renders its own modal, resolves
// nothing — `onSave(blob)` is called with the cropped JPEG once the admin
// clicks Save; Cancel/close just discard. `options` sets the crop frame's
// shape (`aspectW`/`aspectH`) and the exported file's pixel size
// (`outputW`/`outputH`) — different fields crop the same kind of source
// photo to different shapes (e.g. a 4:3 card thumbnail vs. a 16:9 hero
// banner), so these aren't fixed constants.
async function openCropModal(sourceUrl, options, onSave) {
  const { aspectW = 4, aspectH = 3, outputW = 1200, outputH = 900, title = "Crop photo" } = options || {};
  const backdrop = document.createElement("div");
  backdrop.className = "crop-modal-backdrop";
  backdrop.innerHTML = `
    <div class="crop-modal">
      <div class="crop-modal-head">
        <h3>${escapeHtml(title)}</h3>
        <button type="button" class="crop-modal-close" title="Cancel">&times;</button>
      </div>
      <div class="crop-modal-body">
        <div class="crop-stage"><img class="crop-stage-img" draggable="false" alt=""></div>
      </div>
      <p class="crop-modal-error hint" hidden></p>
      <div class="crop-modal-zoom">
        <span class="crop-zoom-icon crop-zoom-icon--sm">🖼</span>
        <input type="range" class="crop-zoom-slider" min="1" max="3" step="0.01" value="1" disabled>
        <span class="crop-zoom-icon crop-zoom-icon--lg">🖼</span>
      </div>
      <div class="crop-modal-actions">
        <button type="button" class="btn-secondary crop-modal-cancel">Cancel</button>
        <button type="button" class="btn-primary crop-modal-save" disabled>Save</button>
      </div>
    </div>`;
  document.body.appendChild(backdrop);

  const stage = backdrop.querySelector(".crop-stage");
  stage.style.aspectRatio = `${aspectW} / ${aspectH}`;
  const img = backdrop.querySelector(".crop-stage-img");
  const zoomSlider = backdrop.querySelector(".crop-zoom-slider");
  const saveBtn = backdrop.querySelector(".crop-modal-save");
  const errorEl = backdrop.querySelector(".crop-modal-error");

  const close = () => backdrop.remove();
  backdrop.querySelector(".crop-modal-close").addEventListener("click", close);
  backdrop.querySelector(".crop-modal-cancel").addEventListener("click", close);
  backdrop.addEventListener("click", (e) => {
    if (e.target === backdrop) close();
  });

  let naturalW = 0, naturalH = 0, baseScale = 1, zoom = 1, offsetX = 0, offsetY = 0, stageW = 0, stageH = 0;

  function applyTransform() {
    img.style.width = `${naturalW * baseScale * zoom}px`;
    img.style.height = `${naturalH * baseScale * zoom}px`;
    img.style.transform = `translate(${offsetX}px, ${offsetY}px)`;
  }
  function clampOffsets() {
    const w = naturalW * baseScale * zoom, h = naturalH * baseScale * zoom;
    offsetX = Math.min(0, Math.max(stageW - w, offsetX));
    offsetY = Math.min(0, Math.max(stageH - h, offsetY));
  }

  try {
    const blobUrl = await toLocalBlobUrl(sourceUrl);
    await new Promise((resolve, reject) => {
      img.onload = resolve;
      img.onerror = () => reject(new Error("The photo couldn't be loaded."));
      img.src = blobUrl;
    });
  } catch (e) {
    errorEl.hidden = false;
    errorEl.textContent = "Couldn't load this photo for cropping — try again once it's finished uploading.";
    return;
  }

  naturalW = img.naturalWidth;
  naturalH = img.naturalHeight;
  const rect = stage.getBoundingClientRect();
  stageW = rect.width;
  stageH = rect.height;
  baseScale = Math.max(stageW / naturalW, stageH / naturalH);
  offsetX = (stageW - naturalW * baseScale) / 2;
  offsetY = (stageH - naturalH * baseScale) / 2;
  applyTransform();
  zoomSlider.disabled = false;
  saveBtn.disabled = false;

  let dragging = false, dragStartX = 0, dragStartY = 0, startOffsetX = 0, startOffsetY = 0;
  stage.addEventListener("pointerdown", (e) => {
    dragging = true;
    dragStartX = e.clientX;
    dragStartY = e.clientY;
    startOffsetX = offsetX;
    startOffsetY = offsetY;
    stage.setPointerCapture(e.pointerId);
  });
  stage.addEventListener("pointermove", (e) => {
    if (!dragging) return;
    offsetX = startOffsetX + (e.clientX - dragStartX);
    offsetY = startOffsetY + (e.clientY - dragStartY);
    clampOffsets();
    applyTransform();
  });
  stage.addEventListener("pointerup", () => (dragging = false));
  stage.addEventListener("pointercancel", () => (dragging = false));

  zoomSlider.addEventListener("input", () => {
    const oldW = naturalW * baseScale * zoom, oldH = naturalH * baseScale * zoom;
    const fracX = (stageW / 2 - offsetX) / oldW, fracY = (stageH / 2 - offsetY) / oldH;
    zoom = Number(zoomSlider.value);
    const newW = naturalW * baseScale * zoom, newH = naturalH * baseScale * zoom;
    offsetX = stageW / 2 - fracX * newW;
    offsetY = stageH / 2 - fracY * newH;
    clampOffsets();
    applyTransform();
  });

  saveBtn.addEventListener("click", () => {
    const totalScale = baseScale * zoom;
    const sx = -offsetX / totalScale, sy = -offsetY / totalScale;
    const sw = stageW / totalScale, sh = stageH / totalScale;
    const canvas = document.createElement("canvas");
    canvas.width = outputW;
    canvas.height = outputH;
    try {
      canvas.getContext("2d").drawImage(img, sx, sy, sw, sh, 0, 0, outputW, outputH);
    } catch {
      errorEl.hidden = false;
      errorEl.textContent = "Couldn't crop this photo (a browser security restriction) — try re-uploading it first.";
      return;
    }
    canvas.toBlob(
      (blob) => {
        if (!blob) {
          errorEl.hidden = false;
          errorEl.textContent = "Couldn't crop this photo — try again.";
          return;
        }
        close();
        onSave(blob);
      },
      "image/jpeg",
      0.88
    );
  });
}

// A same-origin blob: URL never taints a <canvas>, unlike an <img> loaded
// directly from another origin (raw.githubusercontent.com) even with
// crossorigin set — so always route through a real fetch()+blob() first.
async function toLocalBlobUrl(url) {
  if (url.startsWith("blob:") || url.startsWith("data:")) return url;
  const res = await fetch(url);
  if (!res.ok) throw new Error("Couldn't fetch the photo.");
  return URL.createObjectURL(await res.blob());
}

// "+ Insert image" toolbar above any markdown body field — uploads the
// chosen photo and drops a Markdown image tag at the cursor position.
function wireBodyImageInsert(scopeEl) {
  scopeEl.querySelectorAll(".body-insert-btn").forEach((btn) => {
    if (btn.dataset.wired) return;
    btn.dataset.wired = "1";
    const target = btn.dataset.target;
    const fileInput = scopeEl.querySelector(`.body-insert-input[data-target="${target}"]`);
    const statusEl = scopeEl.querySelector(`.body-insert-status[data-target="${target}"]`);
    const textarea = scopeEl.querySelector(`[data-field="${target}"][data-type="markdown"]`);
    btn.addEventListener("click", () => fileInput.click());
    fileInput.addEventListener("change", async () => {
      const file = fileInput.files[0];
      if (!file) return;
      if (file.size > 8 * 1024 * 1024) {
        alert("Image too large (max 8MB).");
        fileInput.value = "";
        return;
      }
      const start = textarea.selectionStart ?? textarea.value.length;
      const end = textarea.selectionEnd ?? textarea.value.length;
      btn.disabled = true;
      statusEl.textContent = "Uploading…";
      try {
        const path = await uploadImage(file);
        const snippet = `\n\n![](${path})\n\n`;
        textarea.value = textarea.value.slice(0, start) + snippet + textarea.value.slice(end);
        const newPos = start + snippet.length;
        textarea.focus();
        textarea.setSelectionRange(newPos, newPos);
        statusEl.textContent = "Image inserted ✓";
      } catch (e) {
        statusEl.textContent = "Upload failed: " + e.message;
      } finally {
        btn.disabled = false;
        fileInput.value = "";
      }
    });
  });
}

// "+ Insert video" beside "+ Insert image": opens a paste-a-link row, then
// splices the site's `{% include youtube.html id="…" %}` tag in at the cursor
// (_includes/youtube.html renders the playable 16:9 player). A bare YouTube
// URL in the body would NOT embed — kramdown leaves it as plain text — so the
// button exists to turn any pasted link format into that tag.
function wireBodyVideoInsert(scopeEl) {
  scopeEl.querySelectorAll(".body-video-btn").forEach((btn) => {
    if (btn.dataset.wired) return;
    btn.dataset.wired = "1";
    const target = btn.dataset.target;
    const row = scopeEl.querySelector(`.body-video-row[data-target="${target}"]`);
    const input = row.querySelector("input");
    const statusEl = scopeEl.querySelector(`.body-insert-status[data-target="${target}"]`);
    const textarea = scopeEl.querySelector(`[data-field="${target}"][data-type="markdown"]`);
    let start = 0;
    let end = 0;

    function close() {
      row.hidden = true;
      input.value = "";
    }
    function insert() {
      const id = parseYoutubeId(input.value);
      if (!id) {
        statusEl.textContent = "That doesn't look like a YouTube video link — paste the address from your browser's address bar or YouTube's Share button.";
        input.focus();
        return;
      }
      const snippet = `\n\n{% include youtube.html id="${id}" %}\n\n`;
      textarea.value = textarea.value.slice(0, start) + snippet + textarea.value.slice(end);
      const newPos = start + snippet.length;
      close();
      textarea.focus();
      textarea.setSelectionRange(newPos, newPos);
      statusEl.textContent = "Video inserted ✓ — it will show as a playable player on the live site.";
    }

    btn.addEventListener("click", () => {
      if (!row.hidden) return close();
      // Remember where the cursor was: it's the textarea we're about to leave.
      start = textarea.selectionStart ?? textarea.value.length;
      end = textarea.selectionEnd ?? textarea.value.length;
      statusEl.textContent = "";
      row.hidden = false;
      input.focus();
    });
    row.querySelector(".body-video-insert").addEventListener("click", insert);
    row.querySelector(".body-video-cancel").addEventListener("click", close);
    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault(); // this sits inside the editor's <form> — don't submit it
        insert();
      } else if (e.key === "Escape") {
        close();
      }
    });
  });
}

function wireMultiselectFields(scopeEl) {
  scopeEl.querySelectorAll(".multiselect").forEach((wrap) => {
    if (wrap.dataset.wired) return;
    wrap.dataset.wired = "1";
    const toggle = wrap.querySelector(".multiselect-toggle");
    const panel = wrap.querySelector(".multiselect-panel");
    const chips = wrap.querySelector(".multiselect-chips");

    function refresh() {
      const checked = Array.from(wrap.querySelectorAll('input[type="checkbox"]:checked')).map((c) => c.value);
      toggle.textContent = checked.length ? `${checked.length} selected` : "Select…";
      chips.innerHTML = checked.map((s) => `<span class="chip" data-chip="${escapeAttr(s)}">${escapeHtml(s)}<button type="button" class="chip-remove" title="Remove">&times;</button></span>`).join("");
    }

    toggle.addEventListener("click", (e) => {
      e.stopPropagation();
      document.querySelectorAll(".multiselect-panel").forEach((p) => {
        if (p !== panel) p.hidden = true;
      });
      panel.hidden = !panel.hidden;
    });
    panel.addEventListener("change", refresh);
    chips.addEventListener("click", (e) => {
      const btn = e.target.closest(".chip-remove");
      if (!btn) return;
      const value = btn.parentElement.dataset.chip;
      const cb = wrap.querySelector(`input[type="checkbox"][value="${CSS.escape(value)}"]`);
      if (cb) cb.checked = false;
      refresh();
    });
    document.addEventListener("click", (e) => {
      if (!wrap.contains(e.target)) panel.hidden = true;
    });
  });
}

async function uploadImage(file) {
  const base64 = await fileToBase64(file);
  const safeName = file.name.toLowerCase().replace(/[^a-z0-9.\-_]/g, "-");
  return uploadImageBase64(base64, safeName);
}

const MEDIA_TYPE_EXT = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/gif": "gif" };

async function uploadFetchedImage(base64, mediaType) {
  const ext = MEDIA_TYPE_EXT[mediaType] || "jpg";
  return uploadImageBase64(base64, `fetched.${ext}`);
}

async function uploadImageBase64(base64, safeName) {
  const path = `${UPLOADS_PATH}/${Date.now()}-${safeName}`;
  await GH.putFileRaw(state.token, path, base64, `Upload image: ${safeName}`);
  return "/" + path;
}

// ---------------- Utilities ----------------

function imageSrc(path) {
  if (!path) return "";
  if (/^https?:\/\//.test(path)) return path;
  return `https://raw.githubusercontent.com/${REPO}/${BRANCH}/${path.replace(/^\//, "")}`;
}

// `action`: optional { label, onClick } — rendered as a button inside the
// banner, e.g. "Reload latest" for a stale-sha save conflict.
function showFormError(msg, action) {
  const el = document.getElementById("form-error");
  if (!el) {
    alert(msg);
    return;
  }
  el.hidden = false;
  el.innerHTML = "";
  el.appendChild(document.createTextNode(msg));
  if (action) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "error-banner-action";
    btn.textContent = action.label;
    btn.addEventListener("click", action.onClick);
    el.appendChild(btn);
  }
}

// Re-fetches one collection item fresh (current content + current sha) and
// reopens its editor — used to recover from a stale-sha save/delete conflict.
async function reopenCollectionEditor(key, schema, path) {
  try {
    const file = await GH.getFile(state.token, path);
    if (!file) {
      renderSection(key);
      return;
    }
    const { data, body } = parseFrontmatter(file.text);
    renderCollectionEditor(key, schema, { name: path.split("/").pop(), path, sha: file.sha, data, body });
  } catch {
    renderSection(key);
  }
}

function escapeHtml(str) {
  return String(str == null ? "" : str).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}
function escapeAttr(str) {
  return escapeHtml(str);
}

const ICONS = {
  posts: '<svg viewBox="0 0 24 24"><path d="M4 4h16v2H4zm0 5h16v2H4zm0 5h10v2H4zm0 5h16v2H4z"/></svg>',
  products: '<svg viewBox="0 0 24 24"><path d="M20 7h-3a5 5 0 0 0-10 0H4a1 1 0 0 0-1 1l1.2 11.1A2 2 0 0 0 6.2 21h11.6a2 2 0 0 0 2-1.9L21 8a1 1 0 0 0-1-1ZM9 7a3 3 0 0 1 6 0Z"/></svg>',
  homepage: '<svg viewBox="0 0 24 24"><path d="M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6H10v6H5a1 1 0 0 1-1-1Z"/></svg>',
  navigation: '<svg viewBox="0 0 24 24"><path d="M4 6h16v2H4zm0 5h16v2H4zm0 5h16v2H4z"/></svg>',
  pages: '<svg viewBox="0 0 24 24"><path d="M6 2h9l5 5v15a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V3a1 1 0 0 1 1-1Zm8 1.5V8h4.5Z"/></svg>',
  socials: '<svg viewBox="0 0 24 24"><path d="M18 16.1a3 3 0 0 0-2 .8l-7.1-4.2a3.2 3.2 0 0 0 0-1.4L16 7.2A3 3 0 1 0 15 5a3 3 0 0 0 .1.7L8 9.9a3 3 0 1 0 0 4.2l7.1 4.2a2.8 2.8 0 0 0-.1.7 3 3 0 1 0 3-2.9Z"/></svg>',
  settings: '<svg viewBox="0 0 24 24"><path d="M12 8.5A3.5 3.5 0 1 0 12 15.5 3.5 3.5 0 0 0 12 8.5Zm8.94 2.5a7.99 7.99 0 0 0-.16-1.6l1.92-1.5-2-3.46-2.26.9a7.97 7.97 0 0 0-1.4-.8L16.6 2h-4l-.44 2.54a7.97 7.97 0 0 0-1.4.8l-2.26-.9-2 3.46 1.92 1.5A7.99 7.99 0 0 0 8.26 11l-2.26.9v.2a7.99 7.99 0 0 0 .16 1.6l-1.92 1.5 2 3.46 2.26-.9c.43.32.9.59 1.4.8L10.4 22h4l.44-2.54c.5-.21.97-.48 1.4-.8l2.26.9 2-3.46-1.92-1.5c.1-.52.16-1.05.16-1.6Z"/></svg>',
  default: '<svg viewBox="0 0 24 24"><path d="M12 2 2 7l10 5 10-5Zm0 7L2 14l10 5 10-5Z"/></svg>',
  grid: '<svg viewBox="0 0 24 24"><path d="M4 4h7v7H4zm9 0h7v7h-7zM4 13h7v7H4zm9 0h7v7h-7z"/></svg>',
  list: '<svg viewBox="0 0 24 24"><path d="M4 4h5v5H4zm7 1h9v2h-9zM4 10h5v5H4zm7 1h9v2h-9zM4 16h5v5H4zm7 1h9v2h-9z"/></svg>',
};

init();

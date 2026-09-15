import { SCHEMA } from "./schema.js";
import * as GH from "./github-api.js";
import { login, getToken, setToken, clearToken, fetchCurrentUser } from "./auth.js";
import { parseFrontmatter, serializeFrontmatter, parseListsYaml, serializeListsYaml } from "./content.js";
import { REPO, BRANCH, SITE_URL, UPLOADS_PATH } from "./config.js";
import { generateStory, fetchProductDetails, fileToBase64, isPdf, MAX_AI_IMAGES, MAX_AI_DOCUMENTS } from "./ai.js";

const app = document.getElementById("app");
const state = { token: null, user: null, section: Object.keys(SCHEMA)[0] };

async function init() {
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

// The field (if any) that stores this collection's thumbnail focus point, so
// list/grid cards crop the same way the live site will.
function findCropField(schema) {
  return (schema.fields || []).find((f) => f.type === "image_position" && f.cropFor === schema.imageField);
}

function badgeInfo(item, schema) {
  if (schema.draftField && item.data[schema.draftField] === false) return { text: "DRAFT", cls: "pill-draft" };
  if (schema.badgeField && item.data[schema.badgeField]) return { text: "FEATURED", cls: "pill-featured" };
  const fallback = item.data.category || item.data.platform || "";
  return fallback ? { text: fallback, cls: "" } : null;
}

function collectionCardHtml(item, schema) {
  const title = item.data[schema.titleField] || "(untitled)";
  const img = schema.imageField ? item.data[schema.imageField] : null;
  const cropField = findCropField(schema);
  const cropPos = cropField ? item.data[cropField.name] : null;
  const badge = badgeInfo(item, schema);
  const meta = (schema.metaFields || []).map((f) => item.data[f]).filter(Boolean).join(" · ");
  return `
    <div class="card" data-open="${escapeAttr(item.path)}">
      <div class="card-thumb">${img ? `<img src="${imageSrc(img)}" loading="lazy"${cropPos ? ` style="object-position:${escapeAttr(cropPos)}"` : ""}>` : '<div class="thumb-empty"></div>'}</div>
      <div class="card-body">
        ${badge ? `<span class="pill ${badge.cls}">${escapeHtml(badge.text)}</span>` : ""}
        <h3>${escapeHtml(title)}</h3>
        ${meta ? `<p class="card-meta">${escapeHtml(meta)}</p>` : ""}
      </div>
    </div>`;
}

function collectionRowHtml(item, schema) {
  const title = item.data[schema.titleField] || "(untitled)";
  const img = schema.imageField ? item.data[schema.imageField] : null;
  const cropField = findCropField(schema);
  const cropPos = cropField ? item.data[cropField.name] : null;
  const badge = badgeInfo(item, schema);
  const meta = (schema.metaFields || []).map((f) => item.data[f]).filter(Boolean).join(" · ");
  return `
    <div class="row-item" data-open="${escapeAttr(item.path)}">
      <div class="row-thumb">${img ? `<img src="${imageSrc(img)}" loading="lazy"${cropPos ? ` style="object-position:${escapeAttr(cropPos)}"` : ""}>` : '<div class="thumb-empty"></div>'}</div>
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
        showFormError(e.message);
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
      showFormError(e.message);
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

// Post summaries for the "Populate from story" hero-slide picker. Drafts are
// excluded — their live URL wouldn't resolve, so linking a hero slide to one
// would 404 until it's published.
async function loadPostSummaries() {
  const postSchema = SCHEMA.posts;
  const files = (await GH.listDir(state.token, postSchema.folder)).filter((f) => f.type === "file" && f.name.endsWith(".md"));
  const items = await Promise.all(
    files.map(async (f) => {
      const file = await GH.getFile(state.token, f.path);
      const { data } = parseFrontmatter(file.text);
      return {
        title: data.title || f.name,
        image: data.image || "",
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
      showFormError(e.message);
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
    <div class="list-editor" id="list-editor">
      ${items.map((item, idx) => listItemHtml(tab, item, idx, items.length, st.posts)).join("")}
    </div>
    <button id="add-item-btn" class="btn-secondary">+ Add ${singular}</button>`;

  wireImageFields(body);
  wireStoryPickers(body, st.posts);
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
      showFormError(e.message);
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

  const existingUrl = form.querySelector('[data-field="url"]');
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
      setFieldValue(form, "url", url);
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
    // image_position fields with `cropFor` render nested inside their paired
    // image field (as the "Crop" button's popover) instead of their own row.
    .filter((f) => !f.isBody && !(f.type === "image_position" && f.cropFor))
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
        <button type="button" class="btn-secondary body-insert-btn" data-target="${field.name}">+ Insert image</button>
      </div>
      <textarea data-field="${field.name}" data-type="markdown" rows="18" class="markdown-input">${escapeHtml(value)}</textarea>
      <input type="file" accept="image/*" class="body-insert-input" data-target="${field.name}" hidden>
      <p class="hint body-insert-status" data-target="${field.name}"></p>
    </div>`;
}

const CROP_POSITIONS = [
  "left top", "center top", "right top",
  "left center", "center center", "right center",
  "left bottom", "center bottom", "right bottom",
];

// The 9-dot overlay shown over an image preview once "Crop" is clicked.
// Hidden by default; wireImageFields() toggles it and updates the paired
// image_position value + the <img>'s object-position as dots are clicked.
function cropGridHtml(posValue) {
  return `<div class="crop-grid" hidden>${CROP_POSITIONS.map((p) => `<button type="button" class="crop-dot ${p === posValue ? "active" : ""}" data-pos="${p}" title="${p}"></button>`).join("")}</div>`;
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
      const cropField = allFields.find((f) => f.type === "image_position" && f.cropFor === field.name);
      const posValue = cropField ? allValues[cropField.name] || cropField.default || "center center" : "";
      return `
        <div class="image-field" data-field="${field.name}" data-type="image">
          <input type="hidden" data-role="value" value="${escapeAttr(value)}">
          <div class="image-preview">
            ${value ? `<img src="${imageSrc(value)}"${posValue ? ` style="object-position:${escapeAttr(posValue)}"` : ""}>` : '<div class="image-empty">No image</div>'}
            ${value && cropField ? cropGridHtml(posValue) : ""}
            ${value && cropField ? `<button type="button" class="crop-toggle-btn"${cropField.hint ? ` title="${escapeAttr(cropField.hint)}"` : ""}>✂ Crop</button>` : ""}
          </div>
          ${cropField ? `<div class="crop-value-holder" data-field="${cropField.name}" data-type="image_position" data-hint="${escapeAttr(cropField.hint || "")}" hidden><input type="hidden" data-role="value" value="${escapeAttr(posValue)}"></div>` : ""}
          <input type="file" accept="image/*" data-role="file-input" id="${id}">
          <div class="image-status"></div>
        </div>`;
    }
    // Fallback for an image_position field with no `cropFor` pairing — not
    // used today (both current fields are paired), kept so the type still
    // renders sensibly if reused standalone.
    case "image_position": {
      const posValue = value || field.default || "center center";
      return `
        <div class="crop-value-holder" data-field="${field.name}" data-type="image_position">
          <input type="hidden" data-role="value" value="${escapeAttr(posValue)}">
          <div class="crop-preview-standalone">
            <div class="crop-grid">${CROP_POSITIONS.map((p) => `<button type="button" class="crop-dot ${p === posValue ? "active" : ""}" data-pos="${p}" title="${p}"></button>`).join("")}</div>
          </div>
        </div>`;
    }
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
    if (f.type === "image_position") {
      const wrap = container.querySelector(`[data-field="${f.name}"][data-type="image_position"]`);
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
      const cropHolder = wrap.querySelector(".crop-value-holder");
      const posValue = cropHolder ? cropHolder.querySelector('[data-role="value"]').value || "center center" : "";
      const objectUrl = URL.createObjectURL(file);
      preview.innerHTML = `<img src="${objectUrl}"${posValue ? ` style="object-position:${posValue}"` : ""}>` + (cropHolder ? cropGridHtml(posValue) : "");
      ensureCropToggleButton(wrap);
      wireCropUi(scopeEl);
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
  wireCropUi(scopeEl);
}

// Adds the "Crop" toggle button the first time a field gets an image (a
// field that started empty has no button yet — nothing to crop until now).
function ensureCropToggleButton(wrap) {
  if (wrap.querySelector(".crop-toggle-btn")) return;
  const holder = wrap.querySelector(".crop-value-holder");
  if (!holder) return;
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "crop-toggle-btn";
  btn.textContent = "✂ Crop";
  if (holder.dataset.hint) btn.title = holder.dataset.hint;
  wrap.querySelector(".image-preview").appendChild(btn);
}

// Wires the "Crop" button (toggles the dot-grid open/closed) and the dots
// themselves (update the paired image_position value + the live preview's
// object-position). Safe to call repeatedly — every listener is guarded.
function wireCropUi(scopeEl) {
  scopeEl.querySelectorAll(".crop-toggle-btn").forEach((btn) => {
    if (btn.dataset.wired) return;
    btn.dataset.wired = "1";
    btn.addEventListener("click", () => {
      const grid = btn.closest(".image-field")?.querySelector(".crop-grid");
      if (grid) grid.hidden = !grid.hidden;
    });
  });
  scopeEl.querySelectorAll(".crop-grid .crop-dot").forEach((btn) => {
    if (btn.dataset.wired) return;
    btn.dataset.wired = "1";
    btn.addEventListener("click", () => {
      const pos = btn.dataset.pos;
      const grid = btn.closest(".crop-grid");
      grid.querySelectorAll(".crop-dot").forEach((b) => b.classList.toggle("active", b === btn));
      const imageField = btn.closest(".image-field");
      const holder = imageField ? imageField.querySelector(".crop-value-holder") : btn.closest(".crop-value-holder");
      const hidden = holder?.querySelector('[data-role="value"]');
      if (hidden) hidden.value = pos;
      const img = imageField?.querySelector(".image-preview img");
      if (img) img.style.objectPosition = pos;
    });
  });
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

function showFormError(msg) {
  const el = document.getElementById("form-error");
  if (el) {
    el.hidden = false;
    el.textContent = msg;
  } else alert(msg);
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
  default: '<svg viewBox="0 0 24 24"><path d="M12 2 2 7l10 5 10-5Zm0 7L2 14l10 5 10-5Z"/></svg>',
  grid: '<svg viewBox="0 0 24 24"><path d="M4 4h7v7H4zm9 0h7v7h-7zM4 13h7v7H4zm9 0h7v7h-7z"/></svg>',
  list: '<svg viewBox="0 0 24 24"><path d="M4 4h5v5H4zm7 1h9v2h-9zM4 10h5v5H4zm7 1h9v2h-9zM4 16h5v5H4zm7 1h9v2h-9z"/></svg>',
};

init();

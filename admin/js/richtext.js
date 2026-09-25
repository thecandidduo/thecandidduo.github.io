// The visual (rich text) editor for a story body — toolbar, Visual/Markdown
// switch, link + photo-description fields. The heavy lifting (TipTap, Markdown
// <-> document conversion) lives in ../lib/editor.bundle.js, built from
// admin/editor-src/ and loaded only when a story editor actually opens.
//
// The body <textarea> stays the ONE source of truth: app.js's save code, the AI
// generator and the "+ Insert image/video" buttons all keep reading/writing it.
// This module mirrors the visual editor INTO the textarea, and — deliberately —
// only when the user actually edits: opening a story never rewrites its Markdown.

let active = null; // the one live editor, torn down before the next mounts

const PREF_KEY = "cms.bodyMode";
const getPref = () => {
  try {
    return localStorage.getItem(PREF_KEY) === "markdown" ? "markdown" : "visual";
  } catch {
    return "visual";
  }
};
const setPref = (mode) => {
  try {
    localStorage.setItem(PREF_KEY, mode);
  } catch {
    /* private window etc. — the preference just won't stick */
  }
};

const withScheme = (href) => {
  const h = href.trim();
  return /^([a-z][a-z0-9+.-]*:|\/|#)/i.test(h) ? h : "https://" + h;
};

// Buttons are described once; `run` acts on the TipTap editor, `active` lights
// the button when the cursor is inside that kind of content.
const TOOLBAR = [
  { label: "H2", title: "Big heading", run: (e) => e.chain().focus().toggleHeading({ level: 2 }).run(), active: (e) => e.isActive("heading", { level: 2 }) },
  { label: "H3", title: "Smaller heading", run: (e) => e.chain().focus().toggleHeading({ level: 3 }).run(), active: (e) => e.isActive("heading", { level: 3 }) },
  "sep",
  { label: "B", cls: "rt-b", title: "Bold (Ctrl/⌘ + B)", run: (e) => e.chain().focus().toggleBold().run(), active: (e) => e.isActive("bold") },
  { label: "I", cls: "rt-i", title: "Italic (Ctrl/⌘ + I)", run: (e) => e.chain().focus().toggleItalic().run(), active: (e) => e.isActive("italic") },
  { label: "Link", title: "Add or edit a link (Ctrl/⌘ + K)", id: "link", active: (e) => e.isActive("link") },
  "sep",
  { label: "• List", title: "Bulleted list", run: (e) => e.chain().focus().toggleBulletList().run(), active: (e) => e.isActive("bulletList") },
  { label: "1. List", title: "Numbered list", run: (e) => e.chain().focus().toggleOrderedList().run(), active: (e) => e.isActive("orderedList") },
  { label: "❝ Quote", title: "Pull quote", run: (e) => e.chain().focus().toggleBlockquote().run(), active: (e) => e.isActive("blockquote") },
  { label: "— Line", title: "Horizontal divider", run: (e) => e.chain().focus().setHorizontalRule().run() },
  { label: "Table", title: "Insert a table", run: (e) => e.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run() },
  "sep",
  { label: "↶", title: "Undo (Ctrl/⌘ + Z)", run: (e) => e.chain().focus().undo().run(), can: (e) => e.can().undo() },
  { label: "↷", title: "Redo (Ctrl/⌘ + Shift + Z)", run: (e) => e.chain().focus().redo().run(), can: (e) => e.can().redo() },
];

// Shown only while the cursor is inside a table.
const TABLE_BAR = [
  { label: "+ Row below", run: (e) => e.chain().focus().addRowAfter().run() },
  { label: "+ Column right", run: (e) => e.chain().focus().addColumnAfter().run() },
  { label: "− Row", run: (e) => e.chain().focus().deleteRow().run() },
  { label: "− Column", run: (e) => e.chain().focus().deleteColumn().run() },
  { label: "Delete table", danger: true, run: (e) => e.chain().focus().deleteTable().run() },
];

function makeButton({ label, title, cls, danger }) {
  const b = document.createElement("button");
  b.type = "button";
  b.className = "rt-btn" + (cls ? " " + cls : "") + (danger ? " rt-btn-danger" : "");
  b.textContent = label;
  if (title) b.title = title;
  // Keep the editor's selection: a button press must not steal focus first.
  b.addEventListener("mousedown", (e) => e.preventDefault());
  return b;
}

export async function mountRichBody({ root, textarea, imageSrc }) {
  const field = root.querySelector(".body-field[data-rich]");
  if (!field) return null;

  let lib;
  try {
    lib = await import("../lib/editor.bundle.js");
  } catch (e) {
    console.warn("Visual editor failed to load — staying on the Markdown box.", e);
    const notice = field.querySelector(".rt-notice");
    if (notice) {
      notice.hidden = false;
      notice.textContent = "The visual editor couldn't load, so you're on the Markdown box. Everything still saves normally.";
    }
    return null;
  }
  if (active) active.destroy();

  const wrap = field.querySelector(".rt-wrap");
  const toolbar = wrap.querySelector(".rt-toolbar");
  const tableBar = wrap.querySelector(".rt-tablebar");
  const linkRow = wrap.querySelector(".rt-link-row");
  const linkInput = linkRow.querySelector("input");
  const altRow = wrap.querySelector(".rt-alt-row");
  const altInput = altRow.querySelector("input");
  const editorEl = wrap.querySelector(".rt-editor");
  const notice = field.querySelector(".rt-notice");
  const toggle = field.querySelector(".mode-toggle");

  let api = null; // { editor, getMarkdown, setMarkdown, insertImage, insertVideo, destroy }
  let mode = "markdown";
  let lastSynced = null; // the Markdown the editor currently holds (to skip pointless reloads)
  let altPos = null; // document position of the photo whose description is being edited
  const buttons = [];

  // ---------- toolbar ----------
  for (const item of TOOLBAR) {
    if (item === "sep") {
      const s = document.createElement("span");
      s.className = "rt-sep";
      toolbar.appendChild(s);
      continue;
    }
    const el = makeButton(item);
    el.addEventListener("click", () => (item.id === "link" ? openLink() : item.run(api.editor)));
    toolbar.appendChild(el);
    buttons.push({ el, item });
  }
  for (const item of TABLE_BAR) {
    const el = makeButton(item);
    el.addEventListener("click", () => item.run(api.editor));
    tableBar.appendChild(el);
  }

  function refresh() {
    const ed = api && api.editor;
    if (!ed) return;
    for (const { el, item } of buttons) {
      if (item.active) el.classList.toggle("is-active", !!item.active(ed));
      if (item.can) el.disabled = !item.can(ed);
    }
    tableBar.hidden = !ed.isActive("table");
    const sel = ed.state.selection;
    const typingAlt = document.activeElement === altInput; // keep the field open while it's being typed in
    if (sel.node && sel.node.type.name === "image") {
      altPos = sel.from;
      altRow.hidden = false;
      if (!typingAlt) altInput.value = sel.node.attrs.alt || "";
    } else if (!typingAlt) {
      altPos = null;
      altRow.hidden = true;
    }
  }

  // ---------- link ----------
  function openLink() {
    const ed = api.editor;
    const current = ed.getAttributes("link").href || "";
    if (!current && ed.state.selection.empty) {
      say("Select the words you want to turn into a link first, then click Link.");
      return;
    }
    say("");
    linkRow.hidden = false;
    linkInput.value = current;
    linkInput.focus();
    linkInput.select();
  }
  function closeLink() {
    linkRow.hidden = true;
    api.editor.commands.focus();
  }
  function applyLink() {
    const href = linkInput.value.trim();
    if (!href) return removeLink();
    api.editor.chain().focus().extendMarkRange("link").setLink({ href: withScheme(href) }).run();
    linkRow.hidden = true;
  }
  function removeLink() {
    api.editor.chain().focus().extendMarkRange("link").unsetLink().run();
    linkRow.hidden = true;
  }
  linkRow.querySelector(".rt-link-apply").addEventListener("click", applyLink);
  linkRow.querySelector(".rt-link-remove").addEventListener("click", removeLink);
  linkRow.querySelector(".rt-link-cancel").addEventListener("click", closeLink);
  linkInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault(); // this all sits inside the editor's <form>
      applyLink();
    } else if (e.key === "Escape") {
      closeLink();
    }
  });

  // ---------- photo description (alt text) ----------
  altInput.addEventListener("input", () => {
    if (altPos !== null) api.setImageAlt(altPos, altInput.value);
  });
  altInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      api.editor.commands.focus();
    }
  });

  // ---------- messages ----------
  function say(text) {
    notice.hidden = !text;
    notice.textContent = text || "";
  }

  // ---------- editor lifecycle ----------
  function ensureEditor() {
    if (api) return api;
    api = lib.createEditor({
      element: editorEl,
      markdown: textarea.value,
      toDisplaySrc: imageSrc,
      onChange: (md) => {
        // A real edit: only now does the Markdown get rewritten.
        lastSynced = md;
        textarea.value = md;
      },
      onTransaction: refresh,
    });
    lastSynced = textarea.value;
    api.editor.view.dom.addEventListener("keydown", (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        openLink();
      }
    });
    refresh();
    return api;
  }

  function explain(reasons) {
    const list = reasons.join(", ");
    return `Kept in Markdown mode: this story contains ${list}, which the visual editor can't show without changing it. Edit it here safely, or remove that part to use the visual editor.`;
  }

  function setMode(next, { remember = true } = {}) {
    const requested = next; // what the author asked for — remembered even if this story forces a fallback
    if (next === "visual") {
      const analysis = lib.analyzeMarkdown(textarea.value);
      if (!analysis.ok) {
        say(explain(analysis.reasons));
        next = "markdown";
      } else {
        say("");
        ensureEditor();
        if (textarea.value !== lastSynced) {
          api.setMarkdown(textarea.value);
          lastSynced = textarea.value;
        }
      }
    } else {
      say("");
    }
    mode = next;
    wrap.hidden = next !== "visual";
    textarea.hidden = next === "visual";
    toggle.querySelectorAll(".mode-btn").forEach((b) => b.classList.toggle("is-on", b.dataset.mode === next));
    if (remember) setPref(requested);
    refresh();
  }

  toggle.hidden = false;
  toggle.querySelectorAll(".mode-btn").forEach((b) => b.addEventListener("click", () => setMode(b.dataset.mode)));

  // The AI story generator (and anything else) writes the textarea directly.
  const onExternalSet = () => {
    if (mode !== "visual") return;
    const analysis = lib.analyzeMarkdown(textarea.value);
    if (analysis.ok) {
      api.setMarkdown(textarea.value);
      lastSynced = textarea.value;
    } else {
      setMode("markdown", { remember: false });
      say(explain(analysis.reasons));
    }
  };
  textarea.addEventListener("cms:external-set", onExternalSet);

  // Start where the author last left off — unless this story can't be shown
  // visually, in which case setMode() falls back to Markdown and says why.
  setMode(getPref(), { remember: false });

  active = {
    destroy() {
      textarea.removeEventListener("cms:external-set", onExternalSet);
      if (api) api.destroy();
    },
  };

  // What the "+ Insert image / video" buttons call.
  return {
    isVisual: () => mode === "visual" && !!api,
    insertImage: (path) => api.insertImage(path, ""),
    insertVideo: (id) => api.insertVideo(id),
  };
}

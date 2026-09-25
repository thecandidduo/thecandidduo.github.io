// Visual (rich text) editor engine for the CMS story body. Bundled by esbuild
// into ../lib/editor.bundle.js (see package.json) — the deployed admin only
// ever loads that one file; nothing here runs a build step in production.
//
// Markdown stays the single source of truth: the editor loads Markdown, and
// hands Markdown back (onChange) whenever the *user edits* — never on load.

import { Editor } from "@tiptap/core";
import { NodeSelection } from "@tiptap/pm/state";
import StarterKit from "@tiptap/starter-kit";
import Placeholder from "@tiptap/extension-placeholder";
import { Table, TableRow, TableHeader, TableCell } from "@tiptap/extension-table";
import { Markdown } from "tiptap-markdown";
import { DisplayImage } from "./image.js";
import { RawBlock, youtubeSource } from "./raw-block.js";
import { SoftBreakAsSpace } from "./soft-break.js";
import { extractRawBlocks, analyzeMarkdown } from "./preprocess.js";

export { analyzeMarkdown, extractRawBlocks };

function serialize(editor) {
  const md = editor.storage.markdown.getMarkdown().replace(/\s+$/, "");
  return md ? md + "\n" : "";
}

// Insert a top-level block after the block holding the cursor — or in place of
// it, when the cursor sits on an empty line — so images/videos always get
// their own paragraph instead of landing mid-sentence.
function insertBlock(editor, json) {
  const { selection } = editor.state;
  const { $from, $to } = selection;
  const range =
    $from.depth >= 1 && $from.parent.type.name === "paragraph" && $from.parent.content.size === 0 && $from.depth === 1
      ? { from: $from.before(1), to: $from.after(1) }
      : (() => {
          const pos = $to.depth === 0 ? selection.to : $to.after(1);
          return { from: pos, to: pos };
        })();
  editor.chain().focus().insertContentAt(range, json).run();
}

export function createEditor({
  element,
  markdown = "",
  placeholder = "Start writing your story…",
  toDisplaySrc = (s) => s,
  onChange = () => {},
  onTransaction = () => {},
}) {
  const editor = new Editor({
    element,
    extensions: [
      StarterKit.configure({
        heading: { levels: [1, 2, 3, 4, 5, 6] }, // keep every level so existing posts aren't flattened
        underline: false, // Markdown has no underline
        link: { openOnClick: false, autolink: false, linkOnPaste: true },
      }),
      DisplayImage.configure({ inline: true, toDisplaySrc }),
      Table.configure({ resizable: false }),
      TableRow,
      TableHeader,
      TableCell,
      RawBlock,
      SoftBreakAsSpace,
      Placeholder.configure({ placeholder }),
      Markdown.configure({ html: true, tightLists: true, bulletListMarker: "-", linkify: false, breaks: false, transformPastedText: true }),
    ],
    content: extractRawBlocks(markdown),
    onUpdate: () => onChange(serialize(editor)),
    onTransaction: () => onTransaction(),
    onSelectionUpdate: () => onTransaction(),
  });

  return {
    editor,
    getMarkdown: () => serialize(editor),
    // Load new Markdown (mode switch, AI fill…). Does NOT fire onChange, so
    // simply viewing a story never rewrites its saved Markdown.
    setMarkdown(md) {
      editor.commands.setContent(extractRawBlocks(md), { emitUpdate: false });
    },
    insertImage(src, alt = "") {
      insertBlock(editor, { type: "paragraph", content: [{ type: "image", attrs: { src, alt } }] });
    },
    insertVideo(id) {
      insertBlock(editor, { type: "rawBlock", attrs: { source: youtubeSource(id) } });
    },
    // Set a photo's description by document position, keeping it selected — going
    // through updateAttributes() instead lets the selection slide off the photo
    // after the first keystroke.
    setImageAlt(pos, alt) {
      const node = editor.state.doc.nodeAt(pos);
      if (!node || node.type.name !== "image") return;
      const tr = editor.state.tr.setNodeMarkup(pos, undefined, { ...node.attrs, alt });
      tr.setSelection(NodeSelection.create(tr.doc, pos));
      editor.view.dispatch(tr);
    },
    focus: () => editor.commands.focus(),
    destroy: () => editor.destroy(),
  };
}

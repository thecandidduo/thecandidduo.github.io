// Round-trip safety test for the visual editor.
//
// For each Markdown document: load it into the editor, serialize it straight
// back out (exactly what a save after the first keystroke would write), and
// check that both versions RENDER the same. It also checks that raw blocks
// (Liquid tags / HTML comments) come back byte-for-byte and that
// analyzeMarkdown() flags content the editor can't hold safely.
//
// Renders with markdown-it (CommonMark) as a quick proxy; the real site uses
// kramdown, which was compared separately when this was built (see CLAUDE.md).
//   npm test        — from admin/editor-src/

import { JSDOM } from "jsdom";
import MarkdownIt from "markdown-it";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const dom = new JSDOM("<!doctype html><html><body></body></html>", { pretendToBeVisual: true });
for (const k of ["window", "document", "navigator", "Node", "Element", "HTMLElement", "DOMParser", "MutationObserver",
  "getComputedStyle", "requestAnimationFrame", "cancelAnimationFrame", "Range", "Text", "DocumentFragment", "Selection",
  "XMLSerializer", "Event", "KeyboardEvent", "MouseEvent", "HTMLImageElement", "HTMLDivElement"]) {
  Object.defineProperty(globalThis, k, { value: dom.window[k], configurable: true, writable: true });
}

const { createEditor, analyzeMarkdown } = await import("../src/index.js");
const md = new MarkdownIt({ html: true });
const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(here, "../../..");

// Whitespace-insensitive, and treats <strong><a>x</a></strong> ≡ <a><strong>x</strong></a>
// (the editor writes a bold link as [**x**](url) — visually identical on the page).
const norm = (html) =>
  html
    .replace(/>\s+</g, "><")
    .replace(/\s+/g, " ")
    .replace(/<(strong|em)>(<a [^>]*>)(.*?)<\/a><\/\1>/g, "$2<$1>$3</$1></a>")
    .trim();
const render = (s) => norm(md.render(s));

function roundTrip(markdown) {
  const el = document.createElement("div");
  document.body.appendChild(el);
  const ed = createEditor({ element: el, markdown });
  const out = ed.getMarkdown();
  ed.destroy();
  el.remove();
  return out;
}

const bodyOf = (file) => fs.readFileSync(file, "utf8").split(/^---\s*$/m).slice(2).join("---").replace(/^\n/, "");

const fixtures = [{ name: "kitchen-sink (synthetic)", md: fs.readFileSync(path.join(here, "fixtures-kitchen-sink.md"), "utf8") }];
const postsDir = path.join(repo, "_posts");
for (const f of fs.readdirSync(postsDir).filter((n) => n.endsWith(".md")).sort()) {
  fixtures.push({ name: `_posts/${f}`, md: bodyOf(path.join(postsDir, f)) });
}

let failures = 0;
const fail = (name, msg) => { failures++; console.log(`  ✗ ${name}\n      ${msg}`); };

for (const { name, md: src } of fixtures) {
  const analysis = analyzeMarkdown(src);
  const out = roundTrip(src);
  if (process.env.RT_DUMP_DIR) {
    const base = path.join(process.env.RT_DUMP_DIR, name.replace(/[^a-z0-9]+/gi, "_"));
    fs.writeFileSync(base + ".before.md", src);
    fs.writeFileSync(base + ".after.md", out);
  }
  // kramdown (the real renderer) treats a Liquid tag / comment line as its own block even
  // with no blank line around it; CommonMark would merge it into the paragraph above. Pad the
  // "before" side the same way the editor's pre-processing does so this proxy matches kramdown.
  const padded = src.replace(/^( {0,3}(?:\{%(?:(?!%\}).)*%\}|<!--[\s\S]*?-->))[ \t]*$/gm, "\n$1\n");
  const a = render(padded), b = render(out);
  const rawIn = [...src.matchAll(/^ {0,3}(\{%.*%\}|<!--[\s\S]*?-->)\s*$/gm)].map((m) => m[1].trim());
  const rawMissing = rawIn.filter((r) => !out.includes(r));
  const problems = [];
  if (a !== b) {
    let i = 0; while (i < a.length && a[i] === b[i]) i++;
    problems.push(`render differs at char ${i}:\n        before: …${a.slice(Math.max(0, i - 40), i + 80)}\n        after : …${b.slice(Math.max(0, i - 40), i + 80)}`);
  }
  if (rawMissing.length) problems.push(`raw block(s) not preserved verbatim: ${rawMissing.join(" | ")}`);
  if (!analysis.ok) problems.push(`analyzeMarkdown flagged: ${analysis.reasons.join(", ")}`);
  if (problems.length) fail(name, problems.join("\n      "));
  else console.log(`  ✓ ${name}  (${rawIn.length} raw block(s) kept)`);
}

// ---- analyzeMarkdown must flag what the editor cannot hold ----
console.log("analyzeMarkdown gate:");
const mustFlag = {
  "raw <div>": "Hello\n\n<div class=\"x\">hi</div>\n",
  "inline html": "Some <span style=\"color:red\">red</span> text",
  "form + script (contact page)": "<form id=\"f\"><input></form>\n<script>alert(1)</script>",
  "inline liquid var": "Mail us at {{ site.social.email }} today",
  "indented liquid tag": "- item\n\n    {% include foo.html %}\n",
  "comment inside text": "Text <!-- hidden --> more text",
  "kramdown IAL": "A paragraph\n{: .lead}\n",
  "footnote": "Something[^1]\n\n[^1]: note",
};
const mustPass = {
  "plain": "Just **text**.\n",
  "liquid on own line": "Before\n\n{% include youtube.html id=\"dQw4w9WgXcQ\" %}\n\nAfter\n",
  "comment on own line": "Before\n\n<!-- IMAGE: x -->\n\nAfter\n",
  "autolink": "See <https://example.com> now.\n",
  "code fence with html/liquid": "```\n<div>{{ x }}</div>\n```\n",
  "inline code with liquid": "Use `{{ site.url }}` here.\n",
};
for (const [n, s] of Object.entries(mustFlag)) analyzeMarkdown(s).ok ? fail(n, "was NOT flagged (should be)") : console.log(`  ✓ flags: ${n}`);
for (const [n, s] of Object.entries(mustPass)) analyzeMarkdown(s).ok ? console.log(`  ✓ allows: ${n}`) : fail(n, `wrongly flagged: ${analyzeMarkdown(s).reasons}`);

console.log(failures ? `\n${failures} FAILURE(S)` : "\nAll checks passed.");
process.exit(failures ? 1 : 0);

// Markdown pre-processing for the visual editor.
//
// Story bodies are kramdown Markdown, but they also carry two things a visual
// editor can't represent: Liquid include tags (e.g. the YouTube player from
// "+ Insert video") and HTML comments (e.g. the "<!-- IMAGE: … -->" photo-spot
// notes). Both sit on their own line(s). Instead of letting the editor mangle
// them, each is lifted out into a placeholder <div data-raw-block="…"> that
// becomes an atomic RawBlock node (raw-block.js) and is written back
// byte-for-byte on save.
//
// Anything else the editor can't round-trip safely (raw HTML, inline Liquid,
// kramdown attribute lists, footnotes…) is *detected* by analyzeMarkdown() so
// the CMS can fall back to plain Markdown editing instead of silently
// dropping it.

const FENCE_OPEN = /^ {0,3}(`{3,}|~{3,})/;
const COMMENT_OPEN = /^ {0,3}<!--/;
// One complete {% … %} tag alone on its line (indent ≤ 3 spaces = top level).
const LIQUID_LINE = /^ {0,3}\{%(?:(?!%\}).)*%\}\s*$/;

export const RAW_BLOCK_RE = /<div data-raw-block="[^"]*"><\/div>/g;

export function extractRawBlocks(markdown) {
  const lines = String(markdown ?? "").replace(/\r\n?/g, "\n").split("\n");
  const out = [];
  let fence = null; // the opening marker while inside a fenced code block

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    if (fence) {
      out.push(line);
      const close = line.match(/^ {0,3}(`{3,}|~{3,})\s*$/);
      if (close && close[1][0] === fence[0] && close[1].length >= fence.length) fence = null;
      continue;
    }
    const open = line.match(FENCE_OPEN);
    if (open) {
      fence = open[1];
      out.push(line);
      continue;
    }

    if (COMMENT_OPEN.test(line)) {
      let j = i;
      while (j < lines.length && !lines[j].includes("-->")) j++;
      if (j < lines.length) {
        const tail = lines[j].slice(lines[j].indexOf("-->") + 3);
        if (tail.trim() === "") {
          pushRaw(out, lines.slice(i, j + 1).join("\n").trim());
          i = j;
          continue;
        }
      }
    } else if (LIQUID_LINE.test(line)) {
      pushRaw(out, line.trim());
      continue;
    }
    out.push(line);
  }
  return out.join("\n");
}

function pushRaw(out, source) {
  // Blank lines around it so Markdown treats it as its own HTML block.
  out.push("", `<div data-raw-block="${encodeURIComponent(source)}"></div>`, "");
}

// Can this Markdown be shown in the visual editor without losing anything?
export function analyzeMarkdown(markdown) {
  const reasons = [];
  let text = extractRawBlocks(markdown).replace(RAW_BLOCK_RE, "");
  text = stripFencedCode(text).replace(/`[^`\n]*`/g, ""); // fenced blocks, then inline code

  if (/<\/?[a-zA-Z][a-zA-Z0-9-]*(?:\s[^<>]*)?\/?>/.test(text)) reasons.push("custom HTML");
  if (/<!--/.test(text)) reasons.push("an HTML comment inside other text");
  if (/\{%|\{\{/.test(text)) reasons.push("template code (Liquid)");
  if (/\{:[^}\n]*\}/.test(text)) reasons.push("kramdown attributes");
  if (/\[\^[^\]\n]+\]/.test(text)) reasons.push("footnotes");
  return { ok: reasons.length === 0, reasons };
}

function stripFencedCode(text) {
  const kept = [];
  let fence = null;
  for (const line of text.split("\n")) {
    if (fence) {
      const close = line.match(/^ {0,3}(`{3,}|~{3,})\s*$/);
      if (close && close[1][0] === fence[0] && close[1].length >= fence.length) fence = null;
      continue;
    }
    const open = line.match(FENCE_OPEN);
    if (open) {
      fence = open[1];
      continue;
    }
    kept.push(line);
  }
  return kept.join("\n");
}

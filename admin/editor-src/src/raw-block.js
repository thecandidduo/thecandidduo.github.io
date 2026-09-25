import { Node } from "@tiptap/core";

// An opaque block the visual editor carries through untouched: a Liquid tag or
// an HTML comment on its own line(s). `source` is the exact original text and
// is what gets written back to Markdown, so nothing about it can be corrupted
// by editing around it. Special-cased for display:
//   {% include youtube.html id="…" %}  -> a video card with the real thumbnail
//   <!-- … -->                         -> a dashed "note (hidden on the site)"
//   any other {% … %}                  -> a "template tag" chip

const YOUTUBE_RE = /^\{%-?\s*include\s+youtube\.html\s+id=["']([\w-]{11})["'][^%]*-?%\}$/;

export const youtubeSource = (id) => `{% include youtube.html id="${id}" %}`;

function describe(source) {
  const yt = source.match(YOUTUBE_RE);
  if (yt) {
    return {
      kind: "video",
      children: [
        ["img", { src: `https://i.ytimg.com/vi/${yt[1]}/hqdefault.jpg`, alt: "", loading: "lazy", draggable: "false" }],
        ["div", { class: "rt-raw__label" },
          ["strong", {}, "▶ YouTube video"],
          ["span", {}, ` ${yt[1]} — plays as a video player on the live site`]],
      ],
    };
  }
  if (source.startsWith("<!--")) {
    const note = source.replace(/^<!--\s*/, "").replace(/\s*-->$/, "");
    return {
      kind: "note",
      children: [["span", { class: "rt-raw__tag" }, "Note — hidden on the live site"], ["span", { class: "rt-raw__text" }, note]],
    };
  }
  return {
    kind: "code",
    children: [["span", { class: "rt-raw__tag" }, "Template tag"], ["code", {}, source]],
  };
}

export const RawBlock = Node.create({
  name: "rawBlock",
  group: "block",
  atom: true,
  selectable: true,
  draggable: true,

  addAttributes() {
    return {
      source: {
        default: "",
        parseHTML: (el) => {
          const v = el.getAttribute("data-raw-block") || "";
          try { return decodeURIComponent(v); } catch { return v; }
        },
        renderHTML: () => ({}),
      },
    };
  },

  parseHTML() {
    return [{ tag: "div[data-raw-block]" }];
  },

  renderHTML({ node }) {
    const { kind, children } = describe(node.attrs.source);
    return [
      "div",
      { "data-raw-block": encodeURIComponent(node.attrs.source), class: `rt-raw rt-raw--${kind}`, contenteditable: "false" },
      ...children,
    ];
  },

  addStorage() {
    return {
      markdown: {
        serialize(state, node) {
          state.write(node.attrs.source);
          state.closeBlock(node);
        },
        parse: {}, // lifted out before markdown-it runs (see preprocess.js)
      },
    };
  },
});

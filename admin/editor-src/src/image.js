import Image from "@tiptap/extension-image";

// The Markdown keeps a site path ("/assets/images/uploads/…") but the editor
// must show something loadable from /admin/, so the displayed <img src> goes
// through `toDisplaySrc` while the original path is kept in data-src — which is
// what parseHTML reads back, so copy/paste inside the editor never rewrites
// the stored path.
export const DisplayImage = Image.extend({
  addOptions() {
    return { ...this.parent?.(), toDisplaySrc: (s) => s };
  },
  addAttributes() {
    const toDisplay = this.options.toDisplaySrc;
    return {
      ...this.parent?.(),
      src: {
        default: null,
        parseHTML: (el) => el.getAttribute("data-src") || el.getAttribute("src"),
        renderHTML: (attrs) => (attrs.src ? { src: toDisplay(attrs.src), "data-src": attrs.src } : {}),
      },
    };
  },
});

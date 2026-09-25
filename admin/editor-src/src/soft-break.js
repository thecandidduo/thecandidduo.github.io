import { Extension } from "@tiptap/core";

// tiptap-markdown strips the "\n" markdown-it emits after inline elements
// (meant for block tags), which also eats a soft line break that follows
// **bold**, *italic* or a [link] — so a hard-wrapped paragraph came back with
// its words glued together ("emphasis" + "over"). A soft break renders as a
// space anyway, so emit exactly that up front and there is no newline to strip.
export const SoftBreakAsSpace = Extension.create({
  name: "softBreakAsSpace",
  addStorage() {
    return {
      markdown: {
        parse: {
          setup(md) {
            md.renderer.rules.softbreak = () => " ";
          },
        },
      },
    };
  },
});

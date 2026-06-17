import type { Feature } from "./types.ts";

/**
 * Stamp top-level block tokens with `data-line="N"` (1-based source line).
 * The browser uses these anchors to interpolate scroll position from the nvim
 * cursor line. We only tag root-level opening/self-closing tokens that carry a
 * source map — that's enough granularity for smooth sync without bloating the
 * DOM.
 */
export const linenumbers: Feature = {
  name: "linenumbers",
  setup(md) {
    md.core.ruler.push("md_preview_line_numbers", (state) => {
      for (const token of state.tokens) {
        if (token.level === 0 && token.nesting !== -1 && token.map) {
          token.attrSet("data-line", String(token.map[0] + 1));
        }
      }
      return true;
    });
  },
};

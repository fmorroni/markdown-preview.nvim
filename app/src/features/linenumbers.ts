import type { Feature } from "./types.ts";

/**
 * Stamp block elements with their source-line range:
 *   data-line     → 1-based first line
 *   data-line-end → 1-based last line
 *
 * The browser uses this range to pick the element under the cursor and center
 * it. We tag every opening/self-closing block token that renders an element
 * (has a tag) and carries a source map — including nested blocks like list
 * items, so a document that is a single list still has per-line anchors.
 */
export const linenumbers: Feature = {
  name: "linenumbers",
  setup(md) {
    md.core.ruler.push("md_preview_line_numbers", (state) => {
      for (const token of state.tokens) {
        if (token.nesting !== -1 && token.tag && token.map) {
          // token.map is [firstLine, lastLineExclusive] (0-based); map[1] is
          // therefore the 1-based last content line.
          token.attrSet("data-line", String(token.map[0] + 1));
          token.attrSet("data-line-end", String(token.map[1]));
        }
      }
      return true;
    });
  },
};

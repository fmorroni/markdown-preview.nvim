import type { Feature } from "./types.ts";

/**
 * Render an image that carries a title as a captioned figure:
 *
 *   ![alt](path 'caption')  →  <figure><img …><figcaption>caption</figcaption></figure>
 *
 * Only standalone images (the sole content of their paragraph) are converted, so
 * inline images in the middle of a sentence keep flowing normally (their title
 * just stays a hover tooltip). The title is moved out of the <img> into the
 * caption. Caption text is plain (markdown-it doesn't parse markup in titles).
 */
export const captions: Feature = {
  name: "captions",
  setup(md) {
    md.core.ruler.push("md_preview_image_captions", (state) => {
      const tokens = state.tokens;
      for (let i = 0; i < tokens.length; i++) {
        const inline = tokens[i];
        if (inline.type !== "inline" || !inline.children) continue;
        if (inline.children.length !== 1) continue;

        const img = inline.children[0];
        if (img.type !== "image") continue;
        const title = img.attrGet("title");
        if (!title) continue;

        const open = tokens[i - 1];
        const close = tokens[i + 1];
        if (!open || open.type !== "paragraph_open") continue;
        if (!close || close.type !== "paragraph_close") continue;

        // Promote the wrapping paragraph to a <figure> (keeps its data-line attr).
        open.tag = "figure";
        close.tag = "figure";

        // The title becomes the caption, so drop it from the <img>.
        if (img.attrs) img.attrs = img.attrs.filter((a) => a[0] !== "title");

        // Append the <figcaption> after the image, inside the same inline run.
        const caption = new state.Token("html_inline", "", 0);
        caption.content = `<figcaption>${md.utils.escapeHtml(title)}</figcaption>`;
        inline.children.push(caption);
      }
      return true;
    });
  },
};

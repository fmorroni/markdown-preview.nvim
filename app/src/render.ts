// @ts-types="@types/markdown-it"
import MarkdownIt from "markdown-it";
import { katex } from "@mdit/plugin-katex";
import callouts from "markdown-it-callouts";
import anchor from "markdown-it-anchor";
import taskLists from "markdown-it-task-lists";
import footnote from "markdown-it-footnote";

import type { Feature } from "./features/types.ts";
import { codeblocks } from "./features/codeblocks.ts";
import { linenumbers } from "./features/linenumbers.ts";
import { images } from "./features/images.ts";
import { captions } from "./features/captions.ts";
import { mermaid } from "./features/mermaid.ts";

/**
 * Local features (custom token/renderer tweaks), in application order.
 * Drop a new module in ./features and add it here to extend the renderer.
 *
 * codeblocks comes before mermaid so mermaid's fence override sits outermost and
 * delegates non-mermaid fences down to the highlighter.
 */
const FEATURES: Feature[] = [codeblocks, images, captions, linenumbers, mermaid];

export function createRenderer(): MarkdownIt {
  const md = new MarkdownIt({
    html: true,
    linkify: true,
    typographer: false,
  });

  // Third-party markdown-it plugins.
  md.use(katex)
    // match-type → a bare `> [!NOTE]` shows "Note" as its title (GitHub behaviour).
    .use(callouts, { emptyTitleFallback: "match-type" })
    .use(taskLists, { label: true })
    .use(footnote)
    .use(anchor, { permalink: false });

  // Local features last so their renderer overrides win.
  for (const f of FEATURES) f.setup(md);

  return md;
}

const renderer = createRenderer();

export interface RenderResult {
  html: string;
}

/** Render markdown text to HTML, resolving local image paths against baseDir. */
export function render(text: string, baseDir: string): RenderResult {
  const html = renderer.render(text, { baseDir });
  return { html };
}

// @ts-types="@types/markdown-it"
import MarkdownIt from "markdown-it";
import { katex } from "@mdit/plugin-katex";
import callouts from "markdown-it-obsidian-callouts";
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
  // throwOnError:false → malformed math (common while typing, e.g. `t_`) renders
  // as an inline red error instead of throwing and crashing the server.
  md.use(katex, { throwOnError: false })
    // GitHub (`> [!NOTE]`) + Obsidian callouts, with built-in icons.
    .use(callouts)
    .use(taskLists, { label: true })
    .use(footnote)
    .use(anchor, { permalink: false });

  // Local features last so their renderer overrides win.
  for (const f of FEATURES) f.setup(md);

  // Constrain KaTeX failures to the offending expression. @mdit/plugin-katex
  // renders ParseErrors inline, but re-throws anything else (and logs to
  // console.error → an nvim notification); a re-throw would otherwise reach
  // render()'s catch and blank the whole preview. Wrap the math renderers so any
  // failure becomes a contained inline error in place, leaving the rest intact.
  for (const name of ["math_inline", "math_block"] as const) {
    const original = md.renderer.rules[name];
    if (!original) continue;
    md.renderer.rules[name] = (tokens, idx, options, env, self) => {
      try {
        return original(tokens, idx, options, env, self);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        const tex = escapeHtml(tokens[idx].content);
        if (name === "math_block") {
          return `<p class="katex-block katex-error" title="${escapeHtml(message)}">${tex}</p>\n`;
        }
        return `<span class="katex-error" title="${escapeHtml(message)}">${tex}</span>`;
      }
    };
  }

  return md;
}

const renderer = createRenderer();

export interface RenderResult {
  html: string;
}

/**
 * Render markdown text to HTML, resolving local image paths against baseDir.
 *
 * Rendering must never throw: a transient error (a half-typed construct some
 * plugin chokes on) would otherwise bubble up as an unhandled rejection and kill
 * the server. On failure we surface the message in the preview itself and keep
 * the process alive.
 */
export function render(text: string, baseDir: string): RenderResult {
  try {
    return { html: renderer.render(text, { baseDir }) };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      html: `<div class="md-preview-error"><strong>Render error</strong><pre>${
        escapeHtml(message)
      }</pre></div>`,
    };
  }
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

import type { Feature } from "./types.ts";

/**
 * Turn ```mermaid fenced blocks into `<pre class="mermaid">` so the client can
 * hand them to mermaid.run() (mermaid needs a live DOM, so this is the one
 * feature that finishes rendering in the browser rather than in Deno).
 */
export const mermaid: Feature = {
  name: "mermaid",
  setup(md) {
    const defaultFence = md.renderer.rules.fence ??
      ((tokens, idx, options, _env, self) => self.renderToken(tokens, idx, options));

    md.renderer.rules.fence = (tokens, idx, options, env, self) => {
      const token = tokens[idx];
      const info = token.info.trim().split(/\s+/)[0]?.toLowerCase();
      if (info === "mermaid") {
        const line = token.map ? ` data-line="${token.map[0] + 1}"` : "";
        // Escape so the diagram source survives as text; mermaid reads textContent.
        return `<pre class="mermaid"${line}>${escapeHtml(token.content)}</pre>\n`;
      }
      return defaultFence(tokens, idx, options, env, self);
    };
  },
};

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

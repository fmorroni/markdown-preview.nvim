import hljs from "highlight.js";
import type { Feature } from "./types.ts";

/**
 * Syntax-highlight fenced code blocks with highlight.js. Emits
 * `<pre data-line><code class="hljs language-x">…</code></pre>` so the github
 * highlight.js theme applies and scroll-sync anchors are preserved. Unknown or
 * absent languages fall back to escaped plain text.
 *
 * Mermaid fences are left to the mermaid feature via the captured default.
 */
export const codeblocks: Feature = {
  name: "codeblocks",
  setup(md) {
    const defaultFence = md.renderer.rules.fence ??
      ((tokens, idx, options, _env, self) => self.renderToken(tokens, idx, options));

    md.renderer.rules.fence = (tokens, idx, options, env, self) => {
      const token = tokens[idx];
      const lang = token.info.trim().split(/\s+/)[0]?.toLowerCase() ?? "";
      if (lang === "mermaid") return defaultFence(tokens, idx, options, env, self);

      const dataLine = token.map ? ` data-line="${token.map[0] + 1}"` : "";
      let body: string;
      let cls = "hljs";
      if (lang && hljs.getLanguage(lang)) {
        try {
          body = hljs.highlight(token.content, { language: lang, ignoreIllegals: true }).value;
          cls += ` language-${lang}`;
        } catch {
          body = md.utils.escapeHtml(token.content);
        }
      } else {
        body = md.utils.escapeHtml(token.content);
      }
      return `<pre${dataLine}><code class="${cls}">${body}</code></pre>\n`;
    };
  },
};

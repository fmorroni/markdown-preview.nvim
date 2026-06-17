import type { Feature } from "./types.ts";

/**
 * Rewrite relative image sources so the browser fetches them back through the
 * Deno server. A plain browser loading an http page cannot read `file://`
 * resources, so we route local images through `/__local?path=<abs>` which the
 * server resolves and streams (see main.ts). Absolute URLs and data URIs are
 * left untouched.
 *
 * The markdown file's directory arrives per-render via `env.baseDir`.
 */
export const images: Feature = {
  name: "images",
  setup(md) {
    const defaultRender = md.renderer.rules.image ??
      ((tokens, idx, options, _env, self) => self.renderToken(tokens, idx, options));

    md.renderer.rules.image = (tokens, idx, options, env, self) => {
      const token = tokens[idx];
      const i = token.attrIndex("src");
      if (i >= 0 && token.attrs) {
        token.attrs[i][1] = rewrite(token.attrs[i][1], env?.baseDir);
      }
      return defaultRender(tokens, idx, options, env, self);
    };
  },
};

function rewrite(src: string, baseDir?: string): string {
  if (/^(https?:)?\/\//.test(src) || src.startsWith("data:")) return src;

  // Resolve relative to the markdown file's directory; absolute paths pass
  // through. The server does the final filesystem resolution.
  let abs = src;
  if (!src.startsWith("/") && baseDir) {
    abs = `${baseDir.replace(/\/$/, "")}/${src.replace(/^\.\//, "")}`;
  }
  return `/__local?path=${encodeURIComponent(abs)}`;
}

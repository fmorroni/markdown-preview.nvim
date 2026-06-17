// Download third-party CSS + KaTeX fonts into ./static so the preview works
// fully offline. Run via `deno task vendor`. Mermaid is bundled into the client
// JS (npm import) and needs no separate vendoring.

const KATEX_VERSION = "0.16.22";
const GHMD_VERSION = "5.8.1";
const HLJS_VERSION = "11.11.1";
const CDN = "https://cdn.jsdelivr.net/npm";

const STATIC = new URL("../static/", import.meta.url).pathname;
const FONTS = `${STATIC}fonts/`;

// KaTeX ships woff2/woff/ttf; woff2 covers every modern browser, so we grab
// only those. @font-face lists woff2 first, so the others 404ing is harmless.
const KATEX_FONTS = [
  "KaTeX_AMS-Regular",
  "KaTeX_Caligraphic-Bold",
  "KaTeX_Caligraphic-Regular",
  "KaTeX_Fraktur-Bold",
  "KaTeX_Fraktur-Regular",
  "KaTeX_Main-Bold",
  "KaTeX_Main-BoldItalic",
  "KaTeX_Main-Italic",
  "KaTeX_Main-Regular",
  "KaTeX_Math-BoldItalic",
  "KaTeX_Math-Italic",
  "KaTeX_SansSerif-Bold",
  "KaTeX_SansSerif-Italic",
  "KaTeX_SansSerif-Regular",
  "KaTeX_Script-Regular",
  "KaTeX_Size1-Regular",
  "KaTeX_Size2-Regular",
  "KaTeX_Size3-Regular",
  "KaTeX_Size4-Regular",
  "KaTeX_Typewriter-Regular",
];

async function download(url: string, dest: string) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${res.status} ${res.statusText} for ${url}`);
  const bytes = new Uint8Array(await res.arrayBuffer());
  await Deno.writeFile(dest, bytes);
  console.log(`  ✓ ${dest.replace(STATIC, "")} (${bytes.length} bytes)`);
}

await Deno.mkdir(FONTS, { recursive: true });

console.log("Vendoring CSS…");
await download(`${CDN}/katex@${KATEX_VERSION}/dist/katex.min.css`, `${STATIC}katex.min.css`);
await download(
  `${CDN}/github-markdown-css@${GHMD_VERSION}/github-markdown-light.css`,
  `${STATIC}github-markdown-light.css`,
);
await download(
  `${CDN}/github-markdown-css@${GHMD_VERSION}/github-markdown-dark.css`,
  `${STATIC}github-markdown-dark.css`,
);
await download(
  `${CDN}/highlight.js@${HLJS_VERSION}/styles/github.css`,
  `${STATIC}hljs-light.css`,
);
await download(
  `${CDN}/highlight.js@${HLJS_VERSION}/styles/github-dark.css`,
  `${STATIC}hljs-dark.css`,
);

console.log("Vendoring KaTeX fonts…");
await Promise.all(
  KATEX_FONTS.map((name) =>
    download(`${CDN}/katex@${KATEX_VERSION}/dist/fonts/${name}.woff2`, `${FONTS}${name}.woff2`)
  ),
);

console.log("Done.");

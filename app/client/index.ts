// Browser-side client. Connects to the Deno server over WebSocket, swaps in
// rendered HTML, runs mermaid on diagram blocks, and keeps the viewport in sync
// with the Neovim cursor line via `data-line` anchors.

import mermaid from "mermaid";

const content = document.getElementById("content") as HTMLElement;

let currentTheme: "light" | "dark" = "dark";
let targetLine = 1;

mermaid.initialize({ startOnLoad: false, theme: "dark" });

// ── WebSocket with auto-reconnect ────────────────────────────────────────────
function connect() {
  const ws = new WebSocket(`ws://${location.host}/`);

  ws.onmessage = (ev) => {
    const msg = JSON.parse(ev.data);
    switch (msg.type) {
      case "render":
        renderHtml(msg.html);
        break;
      case "scroll":
        targetLine = msg.line;
        scrollToLine(targetLine);
        break;
      case "config":
        applyTheme(msg.theme);
        break;
      case "status":
        applyStatus(msg.live);
        break;
    }
  };

  ws.onclose = () => setTimeout(connect, 500);
  ws.onerror = () => ws.close();
}

// ── Rendering ────────────────────────────────────────────────────────────────
function renderHtml(html: string) {
  content.innerHTML = html;
  void runMermaid();
  // Re-apply scroll after layout settles so anchors have real offsets.
  requestAnimationFrame(() => scrollToLine(targetLine));
}

async function runMermaid() {
  const nodes = content.querySelectorAll<HTMLElement>("pre.mermaid:not([data-processed])");
  if (nodes.length === 0) return;
  try {
    await mermaid.run({ nodes: Array.from(nodes) });
  } catch {
    // mermaid annotates the failing node with its own error; leave it visible.
  }
}

// ── Theme ────────────────────────────────────────────────────────────────────
function applyTheme(theme: "light" | "dark") {
  if (theme === currentTheme) return;
  currentTheme = theme;
  document.documentElement.dataset.theme = theme;
  for (const id of ["gh-light", "hljs-light"]) {
    (document.getElementById(id) as HTMLLinkElement).disabled = theme !== "light";
  }
  for (const id of ["gh-dark", "hljs-dark"]) {
    (document.getElementById(id) as HTMLLinkElement).disabled = theme !== "dark";
  }
  mermaid.initialize({ startOnLoad: false, theme: theme === "light" ? "default" : "dark" });
}

// ── Live/paused status ───────────────────────────────────────────────────────
function applyStatus(live: boolean) {
  document.body.dataset.paused = live ? "false" : "true";
  document.title = live ? "Markdown Preview" : "Markdown Preview (paused)";
}

// ── Scroll sync ──────────────────────────────────────────────────────────────
interface Anchor {
  el: HTMLElement;
  start: number; // 1-based first source line
  end: number; // 1-based last source line
}

// Center the element under the cursor as closely as possible. We pick the most
// specific block whose source range contains the cursor line and center within
// its real bounding box, so a tall single-line element (e.g. an image) lands in
// the middle instead of being top-aligned and pushed off-screen.
function scrollToLine(line: number) {
  const anchors: Anchor[] = Array.from(
    content.querySelectorAll<HTMLElement>("[data-line]"),
  )
    .map((el) => ({
      el,
      start: Number(el.dataset.line),
      end: Number(el.dataset.lineEnd ?? el.dataset.line),
    }))
    .filter((a) => !Number.isNaN(a.start));

  if (anchors.length === 0) return;

  // Most specific (smallest span) element containing the cursor line.
  let target: Anchor | undefined;
  for (const a of anchors) {
    if (a.start <= line && line <= a.end) {
      if (!target || a.end - a.start < target.end - target.start) target = a;
    }
  }

  let y: number;
  if (target) {
    const span = target.end - target.start + 1;
    // +0.5 targets the middle of the cursor's line, so a one-line element centers.
    const f = clamp((line - target.start + 0.5) / span, 0, 1);
    y = target.el.offsetTop + f * target.el.offsetHeight;
  } else {
    // Cursor is in a gap between blocks (e.g. a blank line): interpolate between
    // the previous block's bottom and the next block's top.
    const sorted = anchors.slice().sort((a, b) => a.start - b.start);
    let prev = sorted[0];
    let next = sorted[sorted.length - 1];
    for (const a of sorted) {
      if (a.end < line) prev = a;
      if (a.start > line) {
        next = a;
        break;
      }
    }
    const gapTop = prev.el.offsetTop + prev.el.offsetHeight;
    const gapBottom = next.el.offsetTop;
    const f = clamp((line - prev.end) / Math.max(1, next.start - prev.end), 0, 1);
    y = gapTop + f * Math.max(0, gapBottom - gapTop);
  }

  globalThis.scrollTo({ top: y - globalThis.innerHeight / 2, behavior: "smooth" });
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, n));
}

connect();

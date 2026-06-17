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
// Map a source line to a pixel offset by interpolating between the two nearest
// elements carrying `data-line`, then center it in the viewport.
function scrollToLine(line: number) {
  const anchors = Array.from(
    content.querySelectorAll<HTMLElement>("[data-line]"),
  ).map((el) => ({ line: Number(el.dataset.line), top: el.offsetTop }))
    .filter((a) => !Number.isNaN(a.line))
    .sort((a, b) => a.line - b.line);

  if (anchors.length === 0) return;

  let before = anchors[0];
  let after = anchors[anchors.length - 1];
  for (let i = 0; i < anchors.length; i++) {
    if (anchors[i].line <= line) before = anchors[i];
    if (anchors[i].line >= line) {
      after = anchors[i];
      break;
    }
  }

  let top: number;
  if (before.line === after.line) {
    top = before.top;
  } else {
    const ratio = (line - before.line) / (after.line - before.line);
    top = before.top + ratio * (after.top - before.top);
  }

  globalThis.scrollTo({ top: top - globalThis.innerHeight / 2, behavior: "smooth" });
}

connect();

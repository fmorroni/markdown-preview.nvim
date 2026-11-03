// Notion-style section index: a column of short bars on the right edge (one per
// heading, longer for top-level ones, the current section highlighted) that
// expands into a panel of clickable titles on hover, or on tap for touch screens.

interface Entry {
  el: HTMLElement;
  depth: number; // 0 = shallowest heading level present in the document
  text: string;
}

const MAX_DEPTH = 3;

const nav = document.createElement("nav");
nav.id = "toc";
nav.setAttribute("aria-label", "Sections");
const bars = document.createElement("div");
bars.className = "toc-bars";
const panel = document.createElement("div");
panel.className = "toc-panel";
nav.append(bars, panel);
document.body.append(nav);

let entries: Entry[] = [];
let signature = "";
let active = -1;

/** Rebuild the index from the headings currently rendered in `content`. */
export function updateToc(content: HTMLElement) {
  const headings = Array.from(content.querySelectorAll<HTMLElement>("h1, h2, h3, h4, h5, h6"));
  const levels = headings.map((h) => Number(h.tagName[1]));
  const top = Math.min(...levels);
  entries = headings.map((el, i) => ({
    el,
    depth: Math.min(levels[i] - top, MAX_DEPTH),
    text: headingText(el),
  }));

  // Re-rendering on every keystroke replaces the heading elements, but only
  // rebuild the index DOM when its contents changed, so an open panel doesn't
  // flicker or lose its scroll position while typing.
  const sig = entries.map((e) => `${e.depth}:${e.text}`).join("\n");
  if (sig !== signature) {
    signature = sig;
    build();
  }
  nav.hidden = entries.length < 2;
  updateActive();
}

function build() {
  bars.replaceChildren();
  panel.replaceChildren();
  active = -1;
  entries.forEach((entry, i) => {
    const bar = document.createElement("div");
    bar.className = "toc-bar";
    bar.dataset.depth = String(entry.depth);
    bars.append(bar);

    const item = document.createElement("a");
    item.className = "toc-item";
    item.dataset.depth = String(entry.depth);
    item.href = entry.el.id ? `#${entry.el.id}` : "#";
    // The clamp lives on an inner span: on the padded <a> itself, a third line
    // would show through the bottom padding.
    const label = document.createElement("span");
    label.textContent = entry.text;
    item.append(label);
    item.title = entry.text;
    item.addEventListener("click", (ev) => {
      ev.preventDefault();
      entries[i]?.el.scrollIntoView({ behavior: "smooth", block: "start" });
      nav.classList.remove("open");
    });
    panel.append(item);
  });
}

/** Plain-text title; KaTeX math becomes its TeX source instead of duplicated glyphs. */
function headingText(el: HTMLElement): string {
  const clone = el.cloneNode(true) as HTMLElement;
  for (const k of clone.querySelectorAll(".katex")) {
    k.replaceWith(k.querySelector("annotation")?.textContent ?? "");
  }
  return (clone.textContent ?? "").replace(/\s+/g, " ").trim();
}

// The current section is the last heading above the middle of the viewport —
// where scroll sync centers the Neovim cursor line.
function updateActive() {
  const mid = globalThis.innerHeight / 2;
  let next = -1;
  for (let i = 0; i < entries.length; i++) {
    if (entries[i].el.getBoundingClientRect().top <= mid) next = i;
    else break;
  }
  if (next === active) return;
  bars.children[active]?.classList.remove("active");
  panel.children[active]?.classList.remove("active");
  active = next;
  bars.children[active]?.classList.add("active");
  panel.children[active]?.classList.add("active");
}

let scheduled = false;
function onViewportChange() {
  if (scheduled) return;
  scheduled = true;
  requestAnimationFrame(() => {
    scheduled = false;
    updateActive();
  });
}
globalThis.addEventListener("scroll", onViewportChange, { passive: true });
globalThis.addEventListener("resize", onViewportChange);

// Bring the current section into view inside a long panel when it opens.
function revealActive() {
  const item = panel.children[active] as HTMLElement | undefined;
  if (!item) return;
  const { offsetTop, offsetHeight } = item;
  if (offsetTop < panel.scrollTop || offsetTop + offsetHeight > panel.scrollTop + panel.clientHeight) {
    panel.scrollTop = offsetTop - (panel.clientHeight - offsetHeight) / 2;
  }
}
nav.addEventListener("mouseenter", revealActive);

// Touch screens have no hover: tapping the bars toggles the panel, and tapping
// anywhere else closes it.
bars.addEventListener("click", () => {
  nav.classList.toggle("open");
  revealActive();
});
document.addEventListener("click", (ev) => {
  if (!nav.contains(ev.target as Node)) nav.classList.remove("open");
});

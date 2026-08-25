# markdown-preview.nvim

A live Markdown preview for Neovim, rendered in your browser. Pure Lua plugin
driving a [Deno](https://deno.com) server that renders Markdown with
[markdown-it](https://github.com/markdown-it/markdown-it).

## Features

- **Live preview** — updates as you type (debounced).
- **One tab, every file** — a single server and browser tab that follows the
  active buffer instead of spawning one per file.
- **Synchronised scrolling** — the preview follows your cursor.
- **Math** via KaTeX (`$inline$`, `$$block$$`).
- **Diagrams** via Mermaid (` ```mermaid ` fenced blocks).
- **Callouts / admonitions** — GitHub (`> [!NOTE]`) and Obsidian syntax.
- **Local images** — relative paths are served straight from disk.
- **Image captions** — `![alt](path 'caption')` renders a standalone image as a
  `<figure>` with a `<figcaption>`.
- **Syntax-highlighted code**, task lists, footnotes, heading anchors.
- **Offline** — all assets (CSS, fonts, JS) are vendored; no runtime network.
- **Light / dark** theme following `&background`.

## Requirements

- Neovim ≥ 0.10 (uses `vim.ui.open`, `vim.system`, `vim.uv`).
- [Deno](https://deno.com) ≥ 2.4 (for `deno bundle`). Only needed to **build**;
  at runtime any Deno that can run the bundle works.

## Install

The plugin ships a build step that vendors assets and bundles the server +
client. Run it once after install/update.

### lazy.nvim

```lua
{
  "fmorroni/markdown-preview.nvim",
  build = "cd app && deno task build",
  ft = "markdown",
  opts = {},
  keys = {
    {
      "<leader>cp",
      function() require("md-preview").toggle() end,
      ft = "markdown",
      desc = "Toggle markdown preview",
    },
  },
}
```

### packer.nvim

```lua
use({
  "franco/markdown-preview.nvim",
  run = "cd app && deno task build",
  config = function() require("md-preview").setup() end,
})
```

Building manually:

```sh
cd app && deno task build
```

## Usage

The plugin exposes a Lua API only — no user commands — so you can bind it however
you like:

```lua
local mp = require("md-preview")

mp.open(bufnr) -- open or resume the preview, pointed at `bufnr` (default: the
               -- current buffer); reuses the existing server and tab
mp.toggle()    -- pause if live & tab open, otherwise open/reopen
mp.close()     -- pause updates; keeps the server + tab alive for a fast resume
mp.teardown()  -- fully stop: kill the Deno server (frees the process) without
               -- unloading any buffer; `open` afterwards starts a fresh tab
```

There is **one** server and **one** browser tab per Neovim instance. Once the
preview is open it follows you: switching to another previewable buffer re-points
the same tab at it (the tab title shows the file name). Switching to a buffer the
preview doesn't handle — a code file, a terminal — leaves the last render on
screen rather than blanking it, and `close` freezes the preview on its current
buffer until you `open` again.

Example keymap:

```lua
vim.keymap.set("n", "<leader>cp", function() require("md-preview").toggle() end,
  { desc = "Toggle markdown preview" })
```

## Configuration

Defaults:

```lua
require("md-preview").setup({
  deno_cmd = "deno",        -- command to launch the server
  browser = nil,            -- nil = system default (vim.ui.open);
                            -- or "firefox" / { "chromium", "--new-window" }
  port = 0,                 -- 0 = pick a free port
  theme = "auto",           -- "auto" (follow &background) | "light" | "dark"
  debounce = 100,           -- ms between live updates while typing
  auto_close = true,        -- stop the server once the last previewable
                            -- buffer is unloaded
  filetypes = { "markdown" },
})
```

## How it works

```text
Neovim (Lua)  ──jobstart──▶  Deno server  ──WebSocket──▶  Browser
     │  length-prefixed JSON over stdin        │  rendered HTML push
     │  (content / scroll / config)            │
     └─ stdout: one __MD_PREVIEW_PORT__ line ─┘
```

- The Lua side spawns **one** Deno process, streams the active buffer's text and
  cursor line over stdin as length-prefixed JSON frames, and reads the chosen
  port back from stdout to open the browser. Autocommands track which buffer is
  active and switch the stream over when you move between files.
- Deno renders Markdown → HTML with markdown-it (KaTeX and callouts resolve
  server-side; Mermaid finishes in the browser since it needs a DOM), serves the
  page, client bundle, vendored CSS/fonts, and local images, and pushes each
  render to connected browsers over a WebSocket.
- Block elements carry `data-line` source-line attributes; the client
  interpolates a pixel offset between the nearest anchors to keep the preview in
  sync with the cursor.

## Extending

Each rendering concern is a small module under `app/src/features/` implementing
`{ name, setup(md) }`. To add e.g. PlantUML: write `app/src/features/plantuml.ts`,
list it in the `FEATURES` array (or `md.use(...)` block) in `app/src/render.ts`,
add any client init in `app/client/index.ts`, and rebuild with `deno task build`.

## Project layout

```text
lua/md-preview/        Lua plugin (config, server mgmt, autocmds, public API)
app/src/                Deno server (main, ipc, render) + features/
app/client/             browser page shell + client script
app/static/             vendored CSS + KaTeX fonts (built)
app/dist/               bundled server.js + client.js (built)
app/scripts/vendor.ts   downloads vendored assets
```

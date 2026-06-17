// Markdown preview server.
//
// Spawned by the Neovim plugin. Reads length-prefixed JSON messages from stdin
// (buffer content + cursor line), renders markdown to HTML with markdown-it,
// and pushes the result to connected browsers over a WebSocket. Also serves the
// page shell, the client bundle, vendored CSS/fonts, and local images.
//
// On listen it prints a single `__MD_PREVIEW_PORT__<port>` line to stdout so
// the Lua side knows which URL to open.

import { contentType } from "@std/media-types/content-type";
import { extname } from "@std/path/extname";
import { readMessages } from "./ipc.ts";
import { render } from "./render.ts";

const args = parseArgs(Deno.args);
// App root: the `app/` directory of the plugin. Static assets and the client
// bundle are resolved relative to it.
const ROOT = args.root ?? new URL("..", import.meta.url).pathname;

interface State {
  html: string;
  baseDir: string;
  line: number;
  theme: "light" | "dark";
  live: boolean;
}

const state: State = { html: "", baseDir: Deno.cwd(), line: 1, theme: "dark", live: true };
const sockets = new Set<WebSocket>();

function broadcast(msg: unknown) {
  const data = JSON.stringify(msg);
  for (const ws of sockets) {
    if (ws.readyState === WebSocket.OPEN) ws.send(data);
  }
}

// Report the connected-browser count to the Lua side so it knows whether a tab
// is still open (and thus whether `open` should reuse it or launch a new one).
function reportClients() {
  console.log(`__MD_PREVIEW_CLIENTS__${sockets.size}`);
}

// ── stdin loop: receive updates from Neovim ──────────────────────────────────
(async () => {
  for await (const msg of readMessages(Deno.stdin.readable)) {
    switch (msg.type) {
      case "content": {
        state.baseDir = msg.baseDir || state.baseDir;
        state.html = render(msg.text, state.baseDir).html;
        broadcast({ type: "render", html: state.html });
        break;
      }
      case "scroll": {
        state.line = msg.line;
        broadcast({ type: "scroll", line: msg.line });
        break;
      }
      case "config": {
        if (msg.theme) state.theme = msg.theme;
        broadcast({ type: "config", theme: state.theme });
        break;
      }
      case "status": {
        state.live = msg.live;
        broadcast({ type: "status", live: state.live });
        break;
      }
    }
  }
  // stdin closed → Neovim/plugin is gone; shut down.
  Deno.exit(0);
})();

// ── HTTP + WebSocket server ──────────────────────────────────────────────────
Deno.serve({
  port: args.port ?? 0,
  hostname: "localhost",
  onListen: ({ port }) => {
    console.log(`__MD_PREVIEW_PORT__${port}`);
  },
}, (req) => {
  const url = new URL(req.url);

  if (req.headers.get("upgrade") === "websocket") {
    const { socket, response } = Deno.upgradeWebSocket(req);
    socket.onopen = () => {
      sockets.add(socket);
      reportClients();
      // Hydrate the freshly connected browser with current state.
      socket.send(JSON.stringify({ type: "config", theme: state.theme }));
      socket.send(JSON.stringify({ type: "status", live: state.live }));
      if (state.html) socket.send(JSON.stringify({ type: "render", html: state.html }));
      socket.send(JSON.stringify({ type: "scroll", line: state.line }));
    };
    socket.onclose = () => {
      sockets.delete(socket);
      reportClients();
    };
    socket.onerror = () => {
      sockets.delete(socket);
      reportClients();
    };
    return response;
  }

  if (url.pathname === "/__local") {
    return serveLocalImage(url.searchParams.get("path"));
  }

  if (url.pathname === "/" || url.pathname === "/index.html") {
    return serveFile(`${ROOT}/client/index.html`, "text/html; charset=utf-8");
  }

  if (url.pathname === "/client.js") {
    return serveFile(`${ROOT}/dist/client.js`, "text/javascript; charset=utf-8");
  }

  if (url.pathname.startsWith("/static/")) {
    const rel = url.pathname.slice("/static/".length);
    if (rel.includes("..")) return new Response("forbidden", { status: 403 });
    return serveFile(`${ROOT}/static/${rel}`);
  }

  return new Response("not found", { status: 404 });
});

// ── helpers ──────────────────────────────────────────────────────────────────
async function serveFile(path: string, type?: string): Promise<Response> {
  try {
    const file = await Deno.open(path, { read: true });
    return new Response(file.readable, {
      headers: { "content-type": type ?? contentType(extname(path)) ?? "application/octet-stream" },
    });
  } catch {
    return new Response("not found", { status: 404 });
  }
}

async function serveLocalImage(path: string | null): Promise<Response> {
  if (!path) return new Response("missing path", { status: 400 });
  try {
    const stat = await Deno.stat(path);
    if (!stat.isFile) return new Response("not a file", { status: 404 });
    const file = await Deno.open(path, { read: true });
    return new Response(file.readable, {
      headers: { "content-type": contentType(extname(path)) ?? "application/octet-stream" },
    });
  } catch {
    return new Response("not found", { status: 404 });
  }
}

function parseArgs(argv: string[]): { root?: string; port?: number } {
  const out: { root?: string; port?: number } = {};
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--root") out.root = argv[++i];
    else if (argv[i] === "--port") out.port = Number(argv[++i]);
  }
  return out;
}

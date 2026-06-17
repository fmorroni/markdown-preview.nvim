-- Public API for md-preview.
--
-- Lifecycle model: the Deno server (and its browser tab) is created once per
-- buffer and reused. `open` starts or resumes it; `close` pauses it (the tab
-- stays, ready to resume); `teardown` fully kills the server. Otherwise the
-- server is torn down only when the buffer is unloaded or Neovim exits. This
-- avoids duplicate and dead browser tabs.

local config = require("md-preview.config")
local server = require("md-preview.server")
local autocmds = require("md-preview.autocmds")

local M = {}

local function is_supported(bufnr)
  local ft = vim.api.nvim_get_option_value("filetype", { buf = bufnr })
  return vim.tbl_contains(config.options.filetypes, ft)
end

--- Open (or resume) the preview for the current/given buffer. Idempotent: a
--- second call never spawns a second tab.
function M.open(bufnr)
  bufnr = bufnr or vim.api.nvim_get_current_buf()
  if not is_supported(bufnr) then
    vim.notify("md-preview: not a previewable filetype", vim.log.levels.WARN)
    return
  end

  local started = not server.is_running(bufnr)
  server.start(bufnr) -- spawns once; no-op (reuse) if already running
  autocmds.attach(bufnr) -- installs autocommands once
  autocmds.resume(bufnr)

  -- Fresh start opens the tab via the port handshake. On reuse, re-open the tab
  -- only if the user closed it (no browser connected) — never a duplicate.
  if not started then
    server.reopen_if_closed(bufnr)
  end

  -- Push current state so a freshly opened or resumed tab is up to date.
  server.send_config(bufnr)
  server.send_content(bufnr)
  server.send_scroll(bufnr)
  server.send_status(bufnr, true)
end

--- Pause the preview for the current/given buffer. The server and tab are kept
--- alive so `open` can resume into the same tab.
function M.close(bufnr)
  bufnr = bufnr or vim.api.nvim_get_current_buf()
  if not server.is_running(bufnr) then
    return
  end
  autocmds.pause(bufnr)
  server.send_status(bufnr, false)
end

--- Fully stop the preview for the current/given buffer: kill the Deno server
--- and remove its autocommands (the browser tab is left as a dead page). Use
--- this to free the process without unloading the buffer; `open` afterwards
--- starts a fresh server and tab.
function M.teardown(bufnr)
  bufnr = bufnr or vim.api.nvim_get_current_buf()
  autocmds.teardown(bufnr)
end

--- Toggle the preview for the current buffer.
function M.toggle()
  local bufnr = vim.api.nvim_get_current_buf()
  -- Pause only when the preview is live AND a tab is actually open. If the tab
  -- was closed (no clients), toggling reopens it rather than silently pausing.
  if server.is_running(bufnr) and not autocmds.is_paused(bufnr) and server.has_client(bufnr) then
    M.close(bufnr)
  else
    M.open(bufnr)
  end
end

---@param opts MarkdownPreview.Config | nil
function M.setup(opts)
  config.setup(opts)

  -- Kill any surviving servers when Neovim exits.
  vim.api.nvim_create_autocmd("VimLeavePre", {
    group = vim.api.nvim_create_augroup("md-preview-global", { clear = true }),
    callback = function()
      server.stop_all()
    end,
  })
end

return M

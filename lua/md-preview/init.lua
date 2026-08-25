-- Public API for md-preview.
--
-- Lifecycle model: a single Deno server (and a single browser tab) is created
-- for the whole Neovim instance and reused. The preview mirrors the active
-- buffer and follows you as you switch between previewable buffers, so opening
-- a second markdown file never spawns a second tab.
--
-- `open` starts or resumes it (and points it at the current buffer); `close`
-- pauses it (the tab stays, ready to resume, frozen on its buffer); `teardown`
-- fully kills the server. Otherwise the server is torn down only when the last
-- previewable buffer is unloaded (`auto_close`) or Neovim exits.

local config = require("md-preview.config")
local server = require("md-preview.server")
local autocmds = require("md-preview.autocmds")

local M = {}

--- Open (or resume) the preview, pointed at the current/given buffer. Idempotent:
--- a second call never spawns a second tab; it just re-points the existing one.
---@param bufnr integer|nil
function M.open(bufnr)
  bufnr = bufnr or vim.api.nvim_get_current_buf()
  if not config.is_supported(bufnr) then
    vim.notify("md-preview: not a previewable filetype", vim.log.levels.WARN)
    return
  end

  local started = not server.is_running()
  if not server.start() then -- spawns once; no-op (reuse) if already running
    return
  end
  autocmds.attach() -- installs autocommands once
  autocmds.resume()

  -- Fresh start opens the tab via the port handshake. On reuse, re-open the tab
  -- only if the user closed it (no browser connected) — never a duplicate.
  if not started then
    server.reopen_if_closed()
  end

  -- Push current state so a freshly opened or resumed tab is up to date.
  server.send_config()
  autocmds.set_active(bufnr) -- sends this buffer's content + cursor line
  server.send_status(true)
end

--- Pause the preview. The server and tab are kept alive so `open` can resume
--- into the same tab; while paused the preview stops following buffer switches.
function M.close()
  if not server.is_running() then
    return
  end
  autocmds.pause()
  server.send_status(false)
end

--- Fully stop the preview: kill the Deno server and remove its autocommands
--- (the browser tab is left as a dead page). Use this to free the process
--- without unloading any buffer; `open` afterwards starts a fresh server and tab.
function M.teardown()
  autocmds.teardown()
end

--- Toggle the preview for the current buffer.
function M.toggle()
  local bufnr = vim.api.nvim_get_current_buf()
  -- Pause only when the preview is live AND a tab is actually open. If the tab
  -- was closed (no clients), toggling reopens it rather than silently pausing.
  if server.is_running() and not autocmds.is_paused() and server.has_client() then
    M.close()
  else
    M.open(bufnr)
  end
end

---@param opts MarkdownPreview.Config | nil
function M.setup(opts)
  config.setup(opts)

  -- Kill a surviving server when Neovim exits.
  vim.api.nvim_create_autocmd("VimLeavePre", {
    group = vim.api.nvim_create_augroup("md-preview-global", { clear = true }),
    callback = function()
      server.stop()
    end,
  })
end

return M

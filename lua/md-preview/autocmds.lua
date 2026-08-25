-- Global autocommands driving live updates, scroll sync, and buffer following.
--
-- The preview mirrors exactly one buffer at a time — the *active* buffer.
-- Entering another previewable buffer re-points the (single) server at it, so
-- one tab serves every file you visit. Entering a non-previewable buffer leaves
-- the last render on screen rather than blanking it.
--
-- Autocommands are installed once (on first open) and stay until teardown.
-- "Pausing" the preview just flips a flag the callbacks check — including the
-- follow logic, so a paused preview stays frozen on its buffer. Content updates
-- are debounced; scroll is sent directly (cheap, benefits from immediacy).

local config = require("md-preview.config")
local server = require("md-preview.server")

local M = {}

local GROUP = "md-preview"

M._attached = false
M._paused = false
M._timer = nil
---@type integer? buffer currently mirrored into the preview
M._active = nil

-- Returns a debounced wrapper around fn using a libuv timer. If a timer can't
-- be created, falls back to calling fn directly (no debounce) rather than erroring.
local function debounce(ms, fn)
  local timer = vim.uv.new_timer()
  if not timer then
    return function(...)
      fn(...)
    end, nil
  end
  return function(...)
    local args = { ... }
    timer:start(ms, 0, function()
      timer:stop()
      vim.schedule(function()
        fn(unpack(args))
      end)
    end)
  end,
    timer
end

function M.is_attached()
  return M._attached
end

function M.is_paused()
  return M._paused
end

function M.pause()
  M._paused = true
end

function M.resume()
  M._paused = false
end

--- The buffer the preview is currently showing (nil if none).
function M.active()
  return M._active
end

--- Point the preview at `bufnr` and push its content and cursor position.
---@param bufnr integer
function M.set_active(bufnr)
  M._active = bufnr
  if not server.is_running() then
    return
  end
  server.send_content(bufnr)
  server.send_scroll(bufnr)
end

-- Updates from `bufnr` should reach the preview only when it is the buffer the
-- preview is showing and we aren't paused.
local function feeding(bufnr)
  return server.is_running() and not M._paused and bufnr == M._active
end

-- Any loaded buffer we could fall back to when the active one goes away.
local function any_supported_buffer()
  for _, b in ipairs(vim.api.nvim_list_bufs()) do
    if vim.api.nvim_buf_is_loaded(b) and config.is_supported(b) then
      return true
    end
  end
  return false
end

function M.attach()
  if M._attached then
    return
  end

  local group = vim.api.nvim_create_augroup(GROUP, { clear = true })
  local send_content, timer = debounce(config.options.debounce, function()
    if M._active and feeding(M._active) then
      server.send_content(M._active)
    end
  end)

  vim.api.nvim_create_autocmd({ "TextChanged", "TextChangedI" }, {
    group = group,
    callback = function(ev)
      if feeding(ev.buf) then
        send_content()
      end
    end,
  })

  vim.api.nvim_create_autocmd("BufWritePost", {
    group = group,
    callback = function(ev)
      if feeding(ev.buf) then
        server.send_content(ev.buf)
      end
    end,
  })

  vim.api.nvim_create_autocmd({ "CursorMoved", "CursorMovedI" }, {
    group = group,
    callback = function(ev)
      if feeding(ev.buf) then
        server.send_scroll(ev.buf)
      end
    end,
  })

  -- Follow the buffer you're editing. FileType covers buffers whose filetype is
  -- only decided after BufEnter (new files, `:set ft=markdown`).
  vim.api.nvim_create_autocmd({ "BufEnter", "BufWinEnter", "FileType" }, {
    group = group,
    callback = function(ev)
      if M._paused or not server.is_running() then
        return
      end
      if ev.buf == M._active or ev.buf ~= vim.api.nvim_get_current_buf() then
        return
      end
      if config.is_supported(ev.buf) then
        M.set_active(ev.buf)
      end
    end,
  })

  vim.api.nvim_create_autocmd("OptionSet", {
    group = group,
    pattern = "background",
    callback = function()
      if server.is_running() then
        server.send_config()
      end
    end,
  })

  -- The previewed buffer went away: hand the preview to whatever we landed on,
  -- or (with auto_close) shut down once nothing previewable is left.
  vim.api.nvim_create_autocmd({ "BufUnload", "BufWipeout" }, {
    group = group,
    callback = function(ev)
      if ev.buf ~= M._active then
        return
      end
      M._active = nil
      -- Deferred: during BufUnload the replacement buffer isn't current yet and
      -- the dying buffer still counts as loaded.
      vim.schedule(function()
        if M._active ~= nil or not server.is_running() then
          return
        end
        local cur = vim.api.nvim_get_current_buf()
        if config.is_supported(cur) then
          M.set_active(cur)
        elseif config.options.auto_close and not any_supported_buffer() then
          M.teardown()
        end
      end)
    end,
  })

  M._timer = timer
  M._attached = true
end

--- Fully detach: remove autocommands, drop the timer, and stop the server.
function M.teardown()
  pcall(vim.api.nvim_del_augroup_by_name, GROUP)
  if M._timer then
    pcall(function()
      M._timer:close()
    end)
    M._timer = nil
  end
  M._attached = false
  M._paused = false
  M._active = nil
  server.stop()
end

return M

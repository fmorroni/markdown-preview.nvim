-- Buffer-local autocommands driving live updates and scroll sync.
--
-- Autocommands are installed once per buffer (on first open) and stay until the
-- buffer is unloaded. "Pausing" the preview just flips a flag the callbacks
-- check, so the Deno server and its browser tab survive a stop/start cycle and
-- get reused instead of leaving a dead tab behind. Content updates are
-- debounced; scroll is sent directly (cheap, benefits from immediacy).

local config = require("md-preview.config")
local server = require("md-preview.server")

local M = {}

M._timers = {}
M._attached = {}
M._paused = {}

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

function M.is_attached(bufnr)
  return M._attached[bufnr] == true
end

function M.is_paused(bufnr)
  return M._paused[bufnr] == true
end

function M.pause(bufnr)
  M._paused[bufnr] = true
end

function M.resume(bufnr)
  M._paused[bufnr] = nil
end

-- Active = attached and not paused.
local function active(bufnr)
  return server.is_running(bufnr) and not M._paused[bufnr]
end

---@param bufnr integer
function M.attach(bufnr)
  if M._attached[bufnr] then
    return
  end

  local group = vim.api.nvim_create_augroup("md-preview-buf-" .. bufnr, { clear = true })
  local send_content, timer = debounce(config.options.debounce, function()
    if active(bufnr) then
      server.send_content(bufnr)
    end
  end)

  vim.api.nvim_create_autocmd({ "TextChanged", "TextChangedI" }, {
    group = group,
    buffer = bufnr,
    callback = send_content,
  })

  vim.api.nvim_create_autocmd("BufWritePost", {
    group = group,
    buffer = bufnr,
    callback = function()
      if active(bufnr) then
        server.send_content(bufnr)
      end
    end,
  })

  vim.api.nvim_create_autocmd({ "CursorMoved", "CursorMovedI" }, {
    group = group,
    buffer = bufnr,
    callback = function()
      if active(bufnr) then
        server.send_scroll(bufnr)
      end
    end,
  })

  vim.api.nvim_create_autocmd("OptionSet", {
    group = group,
    pattern = "background",
    callback = function()
      if server.is_running(bufnr) then
        server.send_config(bufnr)
      end
    end,
  })

  if config.options.auto_close then
    vim.api.nvim_create_autocmd({ "BufUnload", "BufWipeout" }, {
      group = group,
      buffer = bufnr,
      callback = function()
        M.teardown(bufnr)
      end,
    })
  end

  M._timers[bufnr] = timer
  M._attached[bufnr] = true
end

--- Fully detach: remove autocommands, drop the timer, and stop the server.
---@param bufnr integer
function M.teardown(bufnr)
  pcall(vim.api.nvim_del_augroup_by_name, "md-preview-buf-" .. bufnr)
  if M._timers[bufnr] then
    pcall(function()
      M._timers[bufnr]:close()
    end)
    M._timers[bufnr] = nil
  end
  M._attached[bufnr] = nil
  M._paused[bufnr] = nil
  server.stop(bufnr)
end

return M

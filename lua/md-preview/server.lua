-- Per-buffer Deno server lifecycle: spawn, framed stdin writes, port handshake,
-- browser launch, teardown. Each previewed buffer gets its own server + tab.

local config = require("md-preview.config")

local M = {}

-- Plugin root: this file is at <root>/lua/md-preview/server.lua.
local plugin_root = vim.fn.fnamemodify(debug.getinfo(1, "S").source:sub(2), ":p:h:h:h")
local app_dir = plugin_root .. "/app"
local server_js = app_dir .. "/dist/server.js"

---@class Server
---@field job integer
---@field port integer?
---@field url string?
---@field opened boolean
---@field opened_at integer?
---@field clients integer

---@type table<integer, Server>
local servers = {}

-- Encode a uint32 as 4 big-endian bytes (matches the server's frame decoder).
local function u32be(n)
  return string.char(
    math.floor(n / 16777216) % 256,
    math.floor(n / 65536) % 256,
    math.floor(n / 256) % 256,
    n % 256
  )
end

local function frame(obj)
  local json = vim.json.encode(obj)
  return u32be(#json) .. json
end

local function send(bufnr, obj)
  local s = servers[bufnr]
  if s and s.job then
    pcall(vim.fn.chansend, s.job, frame(obj))
  end
end

function M.is_running(bufnr)
  return servers[bufnr] ~= nil
end

--- Whether at least one browser is currently connected to this buffer's server.
function M.has_client(bufnr)
  local s = servers[bufnr]
  return s ~= nil and (s.clients or 0) > 0
end

local function open_browser(url)
  local browser = config.options.browser
  if browser == nil then
    vim.ui.open(url)
  elseif type(browser) == "string" then
    vim.system({ browser, url }, { detach = true })
  else
    local cmd = vim.deepcopy(browser)
    table.insert(cmd, url)
    vim.system(cmd, { detach = true })
  end
end

-- Watch stdout for the port handshake (open the browser once) and for
-- connected-client counts (so we know whether the tab is still open).
local function on_stdout(bufnr, _, data)
  local s = servers[bufnr]
  if not s then
    return
  end
  for _, line in ipairs(data) do
    local port = line:match("__MD_PREVIEW_PORT__(%d+)")
    if port and not s.opened then
      s.port = tonumber(port)
      s.url = ("http://localhost:%d"):format(s.port)
      s.opened = true
      open_browser(s.url)
      s.opened_at = vim.uv.now()
    end
    local clients = line:match("__MD_PREVIEW_CLIENTS__(%d+)")
    if clients then
      s.clients = math.floor(tonumber(clients) or 0)
    end
  end
end

---@param bufnr integer
function M.start(bufnr)
  -- Already running for this buffer → reuse it. Do NOT re-open the browser:
  -- that would spawn a duplicate tab. The existing tab stays connected.
  if servers[bufnr] then
    return
  end

  if vim.fn.filereadable(server_js) == 0 then
    vim.notify(
      "md-preview: server bundle not found at "
        .. server_js
        .. "\nRun `deno task build` in "
        .. app_dir,
      vim.log.levels.ERROR
    )
    return
  end

  -- Least-privilege: read for assets/images, net pinned to loopback only.
  -- The build step needs internet, but the running server never does.
  local cmd = {
    config.options.deno_cmd,
    "run",
    "--allow-read",
    "--allow-net=localhost",
    server_js,
    "--root",
    app_dir,
  }
  if config.options.port and config.options.port ~= 0 then
    vim.list_extend(cmd, { "--port", tostring(config.options.port) })
  end

  local job = vim.fn.jobstart(cmd, {
    on_stdout = function(_, data)
      on_stdout(bufnr, _, data)
    end,
    on_stderr = function(_, data)
      local msg = table.concat(data, "\n")
      if msg:match("%S") then
        vim.schedule(function()
          vim.notify("md-preview server: " .. msg, vim.log.levels.WARN)
        end)
      end
    end,
    on_exit = function()
      servers[bufnr] = nil
    end,
  })

  if job <= 0 then
    vim.notify(
      "md-preview: failed to start Deno (" .. config.options.deno_cmd .. ")",
      vim.log.levels.ERROR
    )
    return
  end

  servers[bufnr] = { job = job, opened = false, clients = 0 }
  -- Initial state is pushed by the caller (init.open) once the session is set up.
end

--- Re-open the browser tab if the server is up but no browser is connected
--- (e.g. the user closed the tab manually). No-op while a tab is still open, so
--- it never creates a duplicate.
---@param bufnr integer
function M.reopen_if_closed(bufnr)
  local s = servers[bufnr]
  if not s or not s.url then
    return
  end
  if (s.clients or 0) > 0 then
    return
  end
  -- Guard the window right after launch where the browser hasn't connected yet,
  -- so a quick second `open` doesn't spawn a duplicate tab.
  if s.opened_at and (vim.uv.now() - s.opened_at) < 2000 then
    return
  end
  open_browser(s.url)
  s.opened_at = vim.uv.now()
end

---@param bufnr integer
function M.stop(bufnr)
  local s = servers[bufnr]
  if not s then
    return
  end
  pcall(vim.fn.jobstop, s.job)
  servers[bufnr] = nil
end

function M.stop_all()
  for bufnr in pairs(servers) do
    M.stop(bufnr)
  end
end

function M.send_config(bufnr)
  send(bufnr, { type = "config", theme = config.resolve_theme() })
end

--- Tell the preview whether the buffer is actively feeding it (false = paused).
function M.send_status(bufnr, live)
  send(bufnr, { type = "status", live = live })
end

function M.send_content(bufnr)
  if not vim.api.nvim_buf_is_valid(bufnr) then
    return
  end
  local lines = vim.api.nvim_buf_get_lines(bufnr, 0, -1, false)
  local name = vim.api.nvim_buf_get_name(bufnr)
  local base_dir = name ~= "" and vim.fn.fnamemodify(name, ":p:h") or vim.fn.getcwd()
  send(bufnr, {
    type = "content",
    text = table.concat(lines, "\n"),
    baseDir = base_dir,
    path = name,
  })
end

---@param bufnr integer
---@param line integer|nil  1-based source line; defaults to the cursor line in the buffer's window.
function M.send_scroll(bufnr, line)
  if not line then
    local win = vim.fn.bufwinid(bufnr)
    if win == -1 then
      return
    end
    line = vim.api.nvim_win_get_cursor(win)[1]
  end
  send(bufnr, { type = "scroll", line = line })
end

return M

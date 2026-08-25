local M = {}

---@class MarkdownPreview.Config
---@field deno_cmd? string
---@field browser? string | string[]
---@field port? integer
---@field theme? "auto" | "light" | "dark"
---@field debounce? integer
---@field auto_close? boolean
---@field filetypes? string[]

---@type MarkdownPreview.Config
local defaults = {
  -- Command used to launch the Deno server.
  deno_cmd = "deno",
  -- How to open the preview. nil → vim.ui.open (system default browser).
  -- Otherwise a string ("firefox") or list ({ "chromium", "--new-window" }).
  browser = nil,
  -- TCP port for the server. 0 → OS picks a free port.
  port = 0,
  -- "auto" follows &background; or force "light" / "dark".
  theme = "auto",
  -- Debounce (ms) for sending buffer content as you type.
  debounce = 100,
  -- Stop the server when the last previewable buffer is unloaded.
  auto_close = true,
  -- Filetypes the preview handles: `open` warns on anything else, and the
  -- preview only follows buffers matching one of these.
  filetypes = { "markdown" },
}

M.options = vim.deepcopy(defaults)

---@param opts MarkdownPreview.Config | nil
function M.setup(opts)
  M.options = vim.tbl_deep_extend("force", vim.deepcopy(defaults), opts or {})
end

--- Whether a buffer's filetype is one the preview handles.
---@param bufnr integer
function M.is_supported(bufnr)
  if not vim.api.nvim_buf_is_valid(bufnr) then
    return false
  end
  local ft = vim.api.nvim_get_option_value("filetype", { buf = bufnr })
  return vim.tbl_contains(M.options.filetypes, ft)
end

--- Resolve the effective theme ("light" or "dark") at call time.
function M.resolve_theme()
  if M.options.theme == "auto" then
    return vim.o.background == "light" and "light" or "dark"
  end
  return M.options.theme
end

return M

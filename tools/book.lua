-- book.lua -- Pandoc Lua filter for the walkthrough pages (tools/build_books.py).
--
-- The book's Markdown already carries its internal links and each dagger's link to its
-- chapter-end note. This filter does the rest:
--   * removes the fact-id comments (<!-- f:... -->) the fact check reads;
--   * turns "> **Tip:**" and "> **Collectibles here:**" blockquotes into styled boxes;
--   * wraps tables so a wide one scrolls inside itself instead of widening the page.

local function is_fact_comment(s)
  return s:match("^%s*<!%-%-%s*f:") ~= nil
end

function RawInline(el)
  if el.format:match("html") and is_fact_comment(el.text) then
    return {}
  end
end

function RawBlock(el)
  if el.format:match("html") and is_fact_comment(el.text) then
    return {}
  end
end

local BOXES = { ["Tip:"] = "tip", ["Collectibles here:"] = "collectibles" }

function BlockQuote(el)
  local first = el.content[1]
  if first and (first.t == "Para" or first.t == "Plain") and first.content[1]
      and first.content[1].t == "Strong" then
    local label = pandoc.utils.stringify(first.content[1])
    local kind = BOXES[label]
    if kind then
      return pandoc.Div(el.content, pandoc.Attr("", { "box", kind }))
    end
  end
end

function Table(el)
  return pandoc.Div({ el }, pandoc.Attr("", { "table-wrap" }))
end

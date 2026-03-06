# Change Log

## [0.0.13] - 2026-03-07

### Added — MCP (AI Tool Integration)
- **MCP Server for AI-powered editing** — Claude Code, GPT, Gemini, Cursor and other AI tools can now visually edit HTML/CSS through the Zaemit editor
  - `zaemit_get_editor_state` — Check editor connection and selected element
  - `zaemit_get_selection` — Get detailed info about selected HTML element
  - `zaemit_get_page_html` — Retrieve full page HTML source
  - `zaemit_get_element_tree` — Get simplified DOM tree (3 levels)
  - `zaemit_update_element` — Update styles, attributes, or text by CSS selector
  - `zaemit_replace_element_html` — Replace element's outerHTML
  - `zaemit_insert_element` — Insert new HTML into the page
  - `zaemit_delete_element` — Remove an element from the page
- **Viewport/Resolution control via MCP**
  - `zaemit_get_viewports` — List viewport breakpoints with active/enabled status
  - `zaemit_toggle_viewport` — Enable/disable viewport breakpoints for responsive editing
  - `zaemit_set_active_view` — Switch editor to a specific viewport size
  - `zaemit_toggle_multiview` — Toggle multi-viewport side-by-side preview
  - `zaemit_reload_page` — Reload the preview page
- **Universal REST API** with auto-generated documentation
  - OpenAPI 3.1 schema at `/openapi.json`
  - OpenAI Function Calling / Gemini Tool Declaration schema at `/functions.json`
  - Interactive API docs at `/docs`
  - VS Code status bar shows API port with quick actions (copy URL, open docs, copy curl)
- **Auto-setup for AI tools** — `.mcp.json` and `CLAUDE.md` are auto-generated on extension activation for instant Claude Code integration
- **Reload button** in editor toolbar for refreshing the preview after manual HTML edits

### Fixed
- MCP commands now return full response data (viewport enabled state, multiview status, etc.) instead of stripped `{ success: true }`
- Multi-view CSS sync: inline style changes via MCP now propagate to all viewport iframes
- Viewport toggle: `enabled` parameter correctly handles `null` from JSON (previously treated as toggle instead of set)
- Deleting a selected element via MCP now properly clears the selection state
- CSS selector generation uses `CSS.escape()` for special characters in element IDs
- WebView disconnect now immediately rejects pending MCP commands (previously waited 10s timeout)
- Invalid JSON POST body now returns 400 error instead of silently processing empty data
- CSS property assignment errors are caught per-property with warning feedback

## [0.0.10] - 2026-02-19

### Improved
- Text editing now works on any element with text nodes (not just whitelisted tags)
  - `<div>`, `<section>`, etc. with direct text content can now be double-click edited
  - Previously only `P`, `H1-H6`, `SPAN`, `A`, `BUTTON` etc. were editable
- Double-click precision: editing only activates when clicking on actual text
  - Clicking non-text areas (e.g. icon spans, decorative elements) no longer triggers edit mode
  - Uses `caretRangeFromPoint` to verify click lands on a text node

## [0.0.9] - 2026-02-19

### Fixed
- Non-standard HTML filenames (e.g. `landing.html`, `etc.html`) now save correctly
  - Previously, opening any HTML file always saved as `index.html`
  - The editor now detects the actual opened filename and preserves it on save
- CSS/JS filenames are auto-detected from HTML `<link>` and `<script>` references
  - Custom filenames (e.g. `main.css`, `app.js`) are preserved instead of defaulting to `style.css`/`script.js`
- Fixed "The content of the file is newer" save conflict
  - HTML saves now use VS Code document API exclusively, avoiding double-write conflicts

## [0.0.7] - 2026-02-17

### Fixed
- CSS undo/redo (Ctrl+Z) for background-image and other CSS rule changes
  - Fixed stylesheet priority: undo now writes to `zaemit-temp-styles` instead of `style.css`
  - Added missing `cssRuleSnapshot` handler in undo/redo UI update
  - Fixed `oldRules` collection when CSS selector is boosted (unique selector creation)
  - Added fallback to `getCSSRuleInfo` value for rules in HTML `<style>` tags
- Single-view editing no longer propagates CSS changes to other breakpoints
  - Media query changes are skipped when multiview is not active
  - Cascade prevention always runs in single-view mode
- Gap drag multiview sync: fixed `gap` shorthand resolution and inline splitting

## [0.0.6] - 2026-02-17

### Added
- GitHub repository and documentation URLs on Marketplace page

## [0.0.1] - 2026-02-17

### Added
- Visual HTML/CSS editor with drag & drop
- Live preview with real-time updates
- CSS style panel with property editing
- Responsive view modes (Desktop / Tablet / Mobile)
- Undo / Redo support
- Element selection with overlay handles
- Layer panel for DOM tree navigation
- Keyboard shortcuts for common operations
- Image management with folder selection
- Multi-element selection and batch editing

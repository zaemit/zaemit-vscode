# Zaemit Visual Editor - Claude Code Instructions

## MCP Tool Priority

This project is the **Zaemit Visual HTML/CSS Editor** VS Code extension.

**CRITICAL**: When the user asks about editing elements, styles, selections, outlines, colors, or anything related to a visual editor / HTML / CSS / web page, ALWAYS use `mcp__zaemit-editor__zaemit_*` tools FIRST — NOT Pencil tools.

### When to use Zaemit tools (mcp__zaemit-editor__zaemit_*)
- User mentions: "재밋", "zaemit", "에디터", "비주얼 에디터", "HTML", "엘리먼트", "선택한", "외곽선", "스타일", "페이지"
- Any request about editing/viewing/selecting HTML elements
- Any request about CSS styles, outlines, borders, colors, layouts
- Any request about the visual editor state or page structure

### When to use Pencil tools (mcp__pencil__*)
- ONLY when the user explicitly mentions ".pen 파일" or "pencil"

### Available Zaemit tools
- `zaemit_get_editor_state` - Editor connection status and selected element
- `zaemit_get_selection` - Detailed info about selected HTML element
- `zaemit_get_page_html` - Full page HTML source
- `zaemit_get_element_tree` - DOM tree structure
- `zaemit_update_element` - Update styles/attributes/text by CSS selector
- `zaemit_replace_element_html` - Replace element's outerHTML
- `zaemit_insert_element` - Insert new HTML
- `zaemit_delete_element` - Delete an element

## Project Structure
- `src/extension.ts` - Extension entry point, MCP Bridge server startup
- `src/mcpBridgeServer.ts` - HTTP bridge between MCP and WebView
- `src/apiSpec.ts` - OpenAPI/Functions schema and API docs
- `mcp-server.js` - Stdio MCP server (Claude Code spawns this)
- `.mcp.json` - MCP server configuration


## 작업 규칙

- 모든 답변은 한국어로 해줘
- 기존 기능에 영향을 주지 않는 범위 내에서만 수정해줘
- 수정 전에 어떤 파일을 왜 수정하는지 먼저 설명하고 진행 여부 물어봐줘
- 영향받는 파일이 있으면 먼저 알려줘
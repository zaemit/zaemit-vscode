# Zaemit Visual Editor - AI Tool Instructions

## MCP Tool Priority

This project uses the **Zaemit Visual HTML/CSS Editor** VS Code extension.

**IMPORTANT**: When the user asks about editing elements, styles, selections, outlines, colors, or anything related to a visual editor / HTML / CSS / web page, ALWAYS use `zaemit_*` tools FIRST — NOT Pencil tools.

### When to use Zaemit tools
- User mentions: "재밋", "zaemit", "에디터", "비주얼 에디터", "HTML", "엘리먼트", "선택한", "외곽선", "스타일", "페이지"
- Any request about editing/viewing/selecting HTML elements
- Any request about CSS styles, outlines, borders, colors, layouts

### When to use Pencil tools
- ONLY when the user explicitly mentions ".pen files" or "pencil"

### Available Zaemit tools
- `zaemit_get_editor_state` - Editor connection status
- `zaemit_get_selection` - Selected HTML element details
- `zaemit_get_page_html` - Full page HTML
- `zaemit_get_element_tree` - DOM tree
- `zaemit_update_element` - Update styles/attributes/text
- `zaemit_replace_element_html` - Replace outerHTML
- `zaemit_insert_element` - Insert new HTML
- `zaemit_delete_element` - Delete element

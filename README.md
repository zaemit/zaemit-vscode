# Zaemit Visual Editor

> Edit HTML/CSS visually inside VS Code — no browser needed.

![Zaemit Editor Overview](https://raw.githubusercontent.com/zaemit/zaemit-vscode/main/media/screenshots/ref1.png)

---

## Why Zaemit?

Tired of switching between your code editor and browser to tweak designs? Zaemit brings a full visual editor right into VS Code. Select elements, drag them around, edit styles — and watch the code update in real time. It's the fastest way to build and refine web pages.

---

## Features

### Visual Drag & Drop Editing
Click any element to select it. Drag to move. Resize with handles. Rotate freely. Everything you do visually is reflected in clean, production-ready HTML/CSS code.

![Visual Editing](https://raw.githubusercontent.com/zaemit/zaemit-vscode/main/media/screenshots/ref3.png)

### Comprehensive Style Panel
No more guessing CSS property names. The style panel gives you intuitive controls for:
- **Layout** — Display, position, flexbox, grid, z-index
- **Size** — Width, height, margin, padding, min/max constraints
- **Typography** — Font family, size, weight, line height, letter spacing, text alignment
- **Borders** — Per-side border control, radius, styles, colors
- **Backgrounds** — Colors, gradients, images with size/position/repeat controls
- **Effects** — Opacity, box shadow, text shadow, transform, transition, cursor
- **Overflow** — Scroll behavior per axis

![Style Panel](https://raw.githubusercontent.com/zaemit/zaemit-vscode/main/media/screenshots/ref4.png)

### Responsive Design Mode
Instantly preview your page at different screen sizes. Switch between Desktop, Tablet, and Mobile viewports with a single click. Design responsive layouts without leaving VS Code.

### Layer Panel
See and navigate the full DOM tree of your page. Reorder elements by drag & drop. Rename layers for better organization. Multi-select elements for batch operations.

### Built-in Code Editor
Powered by CodeMirror, the integrated code editor lets you view and edit the raw HTML/CSS/JS alongside the visual canvas. Changes sync both ways — edit visually or in code.

### Undo / Redo
Every action is tracked. Press `Ctrl+Z` to undo, `Ctrl+Y` to redo. The change history captures style edits, element moves, content changes, and structural modifications.

### Multi-Element Selection
Hold `Ctrl` and click to select multiple elements. Apply styles, move, or delete them all at once.

### Zoom & Pan
`Ctrl+Scroll` to zoom in/out. `Space+Drag` to pan across the canvas. `Ctrl+0` to reset zoom to 100%.

### AI Integration (MCP Server)
Zaemit includes a built-in **MCP (Model Context Protocol) server** that connects with AI coding assistants like **Claude Code**. Ask your AI to edit elements, change styles, or restructure your page — and see the results applied directly in the visual editor.

- **Read page structure** — AI can inspect the full DOM tree and element properties
- **Edit elements** — Update styles, attributes, and text content via AI commands
- **Insert & delete** — Add new HTML elements or remove existing ones
- **Responsive editing** — Switch viewports and apply device-specific styles through AI
- **Live sync** — Changes made by AI are reflected in the visual editor in real time

No extra setup required. The MCP server starts automatically when Zaemit opens.

### Figma Import
Import designs directly from Figma into your project. Paste a Figma file URL and Zaemit converts frames into clean, production-ready HTML/CSS.

- **One-click import** — Paste the Figma URL, select frames, and generate code
- **Clean output** — Semantic HTML structure with organized CSS
- **Image export** — Figma images are automatically downloaded to your project
- **Responsive-ready** — Imported layouts work as a starting point for responsive design

### Image Editor
Built-in image editing tools let you adjust images without leaving the editor:

- **Transform** — Rotate, flip horizontal/vertical
- **Crop** — Crop images to custom dimensions
- **Resize** — Set exact width and height
- **Adjustments** — Brightness, contrast, saturation, blur, grayscale, sepia
- **Non-destructive** — All changes are applied via CSS filters, preserving the original

### Motion & Animation
Add entrance and exit animations to any element:

- **Entrance effects** — Fade in, slide up/down/left/right, zoom in, bounce
- **Exit effects** — Fade out, slide out, zoom out
- **Timing controls** — Duration, delay, and trigger options
- **Preview** — Test animations directly in the editor

---

## Getting Started

![Getting Started](https://raw.githubusercontent.com/zaemit/zaemit-vscode/main/media/screenshots/ref2.png)

### 1. Install the Extension
Search **"Zaemit"** in the VS Code Marketplace and click Install. No additional configuration needed.

### 2. Open Your Project
Right-click any `.html` file in the Explorer panel and select **"Open with Zaemit Visual Editor"**. Your page renders instantly in the visual editor.

### 3. Design & Ship
Edit visually, see code update live. Commit clean, production-ready code directly from your editor.

You can also click the **Zaemit** button in the bottom status bar to open the current HTML file.

---

## Keyboard Shortcuts

| Action | Shortcut |
|--------|----------|
| Copy element | `Alt+C` |
| Cut element | `Alt+X` |
| Paste element | `Alt+V` |
| Duplicate element | `Alt+D` |
| Delete element | `Delete` |
| Move element up/down | `Alt+Arrow` |
| Undo | `Ctrl+Z` |
| Redo | `Ctrl+Y` |
| Zoom in/out | `Ctrl+Scroll` |
| Reset zoom | `Ctrl+0` |
| Pan | `Space+Drag` |
| Save | `Ctrl+S` |
| Toggle bold | `Alt+Shift+B` |
| Toggle italic | `Alt+Shift+I` |

---

## Requirements

- VS Code **1.85.0** or later
- Works on Windows, macOS, and Linux

---

## Feedback & Support

Found a bug or have a feature request? Open an issue on [GitHub](https://github.com/zaemit/zaemit-vscode/issues).

---

## License

Proprietary. All rights reserved. See LICENSE for details.

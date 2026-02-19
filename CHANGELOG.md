# Change Log

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

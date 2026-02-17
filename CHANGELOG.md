# Change Log

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

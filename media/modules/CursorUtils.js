/**
 * Custom SVG cursor utilities for the editor.
 * Provides SVG-based cursors for rotation, zoom, and panning.
 */

function svgToCursor(svg, hotX, hotY, fallback) {
    const encoded = svg.replace(/\n/g, '').replace(/\s+/g, ' ');
    return `url("data:image/svg+xml,${encodeURIComponent(encoded)}") ${hotX} ${hotY}, ${fallback}`;
}

const CursorUtils = {
    /**
     * Rotation cursor: Circular arrow with triangle arrowhead
     * @param {string} corner - 'nw', 'ne', 'se', 'sw'
     * @returns {string} CSS cursor value
     */
    rotate() {
        // 원형 화살표: 270도 호 + 삼각형 화살촉 (stroke 테두리 포함, 60% 축소)
        const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24">` +
            // 270도 호 (도넛 형태) - 12시~9시 (시계방향)
            `<path d="M12 2 A10 10 0 1 1 2 12 L6 12 A6 6 0 1 0 12 6 Z" fill="#fff" stroke="#000" stroke-width="1"/>` +
            // 삼각형 화살촉 (9시 방향, 아래를 가리킴)
            `<path d="M0 8 L0 20 L7 14 Z" fill="#fff" stroke="#000" stroke-width="1"/>` +
            `</svg>`;

        return svgToCursor(svg, 6, 6, 'pointer');
    },

    /**
     * Zoom-in cursor (magnifying glass with +)
     * @returns {string} CSS cursor value
     */
    zoomIn() {
        const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 20 20"><circle cx="9" cy="9" r="6.5" fill="#fff" stroke="#000" stroke-width="1.5"/><line x1="14" y1="14" x2="18" y2="18" stroke="#000" stroke-width="2" stroke-linecap="round"/><line x1="9" y1="6.5" x2="9" y2="11.5" stroke="#000" stroke-width="1.5" stroke-linecap="round"/><line x1="6.5" y1="9" x2="11.5" y2="9" stroke="#000" stroke-width="1.5" stroke-linecap="round"/></svg>`;
        return svgToCursor(svg, 9, 9, 'zoom-in');
    },

    /**
     * Zoom-out cursor (magnifying glass with -)
     * @returns {string} CSS cursor value
     */
    zoomOut() {
        const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 20 20"><circle cx="9" cy="9" r="6.5" fill="#fff" stroke="#000" stroke-width="1.5"/><line x1="14" y1="14" x2="18" y2="18" stroke="#000" stroke-width="2" stroke-linecap="round"/><line x1="6.5" y1="9" x2="11.5" y2="9" stroke="#000" stroke-width="1.5" stroke-linecap="round"/></svg>`;
        return svgToCursor(svg, 9, 9, 'zoom-out');
    },

    /**
     * Grab (open hand) cursor — Windows default
     * @returns {string} CSS cursor value
     */
    grab() {
        return 'grab';
    },

    /**
     * Grabbing (closed hand) cursor — Windows default
     * @returns {string} CSS cursor value
     */
    grabbing() {
        return 'grabbing';
    }
};

export default CursorUtils;

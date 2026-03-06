/**
 * Zaemit Editor MCP Server (VSCode Extension)
 *
 * Claude Code가 stdio로 통신하는 MCP 서버.
 * Extension Host 내부 HTTP 서버에 연결하여 에디터 상태를 조회/변경합니다.
 *
 * 실행: Claude Code가 .mcp.json 설정을 보고 자동 spawn
 * 포트: 환경변수 ZAEMIT_MCP_PORT 또는 포트 파일에서 읽음
 */

const { McpServer } = require('@modelcontextprotocol/sdk/server/mcp.js');
const { StdioServerTransport } = require('@modelcontextprotocol/sdk/server/stdio.js');
const { z } = require('zod');
const fs = require('fs');
const path = require('path');
const os = require('os');

// 포트 결정: 환경변수 > 포트 파일 > 기본값
function getEditorPort() {
    if (process.env.ZAEMIT_MCP_PORT) {
        return parseInt(process.env.ZAEMIT_MCP_PORT, 10);
    }

    // Extension Host가 포트 파일에 기록
    const portFile = path.join(os.tmpdir(), 'zaemit-mcp-port');
    try {
        const port = parseInt(fs.readFileSync(portFile, 'utf-8').trim(), 10);
        if (port > 0) return port;
    } catch {}

    return 0; // 포트를 찾을 수 없음
}

function getBaseUrl() {
    const port = getEditorPort();
    if (!port) return null;
    return `http://127.0.0.1:${port}`;
}

async function editorFetch(apiPath, options = {}) {
    const baseUrl = getBaseUrl();
    if (!baseUrl) {
        return { error: 'Zaemit editor is not running. Open an HTML file with Zaemit Visual Editor first.' };
    }

    try {
        const res = await fetch(`${baseUrl}${apiPath}`, {
            ...options,
            headers: { 'Content-Type': 'application/json', ...options.headers },
        });
        return await res.json();
    } catch (e) {
        return { error: `Editor not reachable at ${baseUrl}: ${e.message}` };
    }
}

const server = new McpServer({
    name: 'zaemit-editor',
    version: '1.0.0',
    description: 'Zaemit Visual HTML/CSS Editor for VS Code. Use these tools to visually edit web pages (HTML/CSS/JS) — NOT for .pen files. When the user mentions "재밋", "zaemit", "비주얼 에디터", or "HTML 에디터", use zaemit_* tools.',
});

// ==================== Tools ====================

server.tool(
    'zaemit_get_editor_state',
    '[Zaemit Visual HTML Editor] Get connection status, selected element info, and project path. Use this for HTML/CSS web page editing in VS Code — NOT for .pen files.',
    {},
    async () => {
        const state = await editorFetch('/api/mcp/state');
        return {
            content: [{ type: 'text', text: JSON.stringify(state, null, 2) }],
        };
    }
);

server.tool(
    'zaemit_get_selection',
    '[Zaemit Visual HTML Editor] Get detailed info about the currently selected HTML element (tag, classes, computed styles, attributes, outerHTML)',
    {},
    async () => {
        const selection = await editorFetch('/api/mcp/selection');
        if (!selection.selected) {
            return {
                content: [{ type: 'text', text: 'No element is currently selected. Ask the user to click an element in the Zaemit editor first.' }],
            };
        }
        return {
            content: [{ type: 'text', text: JSON.stringify(selection, null, 2) }],
        };
    }
);

server.tool(
    'zaemit_get_page_html',
    '[Zaemit Visual HTML Editor] Get the full HTML source of the web page currently being edited',
    {},
    async () => {
        const result = await editorFetch('/api/mcp/page-html');
        return {
            content: [{ type: 'text', text: result.html || 'No page HTML available' }],
        };
    }
);

server.tool(
    'zaemit_get_element_tree',
    '[Zaemit Visual HTML Editor] Get a simplified DOM tree of the HTML page (tag, id, class, CSS selector) up to 3 levels deep',
    {},
    async () => {
        const result = await editorFetch('/api/mcp/element-tree');
        return {
            content: [{ type: 'text', text: JSON.stringify(result.tree, null, 2) }],
        };
    }
);

server.tool(
    'zaemit_update_element',
    '[Zaemit Visual HTML Editor] Update styles, attributes, or text content of an HTML element by CSS selector',
    {
        selector: z.string().describe('CSS selector for the target element (e.g., "#hero-title", ".btn-primary", "body > div:nth-of-type(2) > h1")'),
        style: z.record(z.string()).optional().describe('CSS styles as camelCase key-value pairs (e.g., {"backgroundColor": "red", "fontSize": "24px"})'),
        attributes: z.record(z.string().nullable()).optional().describe('HTML attributes to set (null to remove) (e.g., {"href": "https://...", "target": "_blank"})'),
        textContent: z.string().optional().describe('Replace the text content of the element'),
        innerHTML: z.string().optional().describe('Replace the inner HTML of the element'),
    },
    async ({ selector, style, attributes, textContent, innerHTML }) => {
        const changes = {};
        if (style) changes.style = style;
        if (attributes) changes.attributes = attributes;
        if (textContent !== undefined) changes.textContent = textContent;
        if (innerHTML !== undefined) changes.innerHTML = innerHTML;

        const result = await editorFetch('/api/mcp/update-element', {
            method: 'POST',
            body: JSON.stringify({ selector, changes }),
        });
        return {
            content: [{ type: 'text', text: result.error ? `Error: ${result.error}` : 'Element updated successfully' }],
        };
    }
);

server.tool(
    'zaemit_replace_element_html',
    '[Zaemit Visual HTML Editor] Replace the entire outerHTML of an HTML element by CSS selector',
    {
        selector: z.string().describe('CSS selector for the target element'),
        html: z.string().describe('New HTML to replace the element with'),
    },
    async ({ selector, html }) => {
        const result = await editorFetch('/api/mcp/replace-html', {
            method: 'POST',
            body: JSON.stringify({ selector, html }),
        });
        return {
            content: [{ type: 'text', text: result.error ? `Error: ${result.error}` : 'Element HTML replaced successfully' }],
        };
    }
);

server.tool(
    'zaemit_insert_element',
    '[Zaemit Visual HTML Editor] Insert new HTML into a parent element on the web page',
    {
        parentSelector: z.string().describe('CSS selector for the parent element'),
        html: z.string().describe('HTML to insert'),
        position: z.enum(['beforebegin', 'afterbegin', 'beforeend', 'afterend']).optional()
            .describe('Insert position relative to parent (default: "beforeend" = append as last child)'),
    },
    async ({ parentSelector, html, position }) => {
        const result = await editorFetch('/api/mcp/insert-element', {
            method: 'POST',
            body: JSON.stringify({ parentSelector, html, position }),
        });
        return {
            content: [{ type: 'text', text: result.error ? `Error: ${result.error}` : 'Element inserted successfully' }],
        };
    }
);

server.tool(
    'zaemit_delete_element',
    '[Zaemit Visual HTML Editor] Delete an HTML element from the web page by CSS selector',
    {
        selector: z.string().describe('CSS selector for the element to delete'),
    },
    async ({ selector }) => {
        const result = await editorFetch('/api/mcp/delete-element', {
            method: 'POST',
            body: JSON.stringify({ selector }),
        });
        return {
            content: [{ type: 'text', text: result.error ? `Error: ${result.error}` : 'Element deleted successfully' }],
        };
    }
);

// ==================== Viewport/Resolution Tools ====================

server.tool(
    'zaemit_get_viewports',
    '[Zaemit Visual HTML Editor] Get the list of viewport breakpoints (e.g., Desktop 100%, Tablet 768px, Mobile 480px) with their active/enabled status and multiview state',
    {},
    async () => {
        const result = await editorFetch('/api/mcp/viewports');
        return {
            content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
        };
    }
);

server.tool(
    'zaemit_toggle_viewport',
    '[Zaemit Visual HTML Editor] Enable or disable a viewport breakpoint checkbox. When enabled, CSS edits apply to that breakpoint via media queries. Use width like "100%", "768", "480".',
    {
        width: z.string().describe('Viewport width to toggle (e.g., "100%", "768", "480")'),
        enabled: z.boolean().optional().describe('true to enable, false to disable, omit to toggle'),
    },
    async ({ width, enabled }) => {
        const result = await editorFetch('/api/mcp/toggle-viewport', {
            method: 'POST',
            body: JSON.stringify({ width, enabled }),
        });
        return {
            content: [{ type: 'text', text: result.error ? `Error: ${result.error}` : `Viewport ${width} ${result.enabled ? 'enabled' : 'disabled'}` }],
        };
    }
);

server.tool(
    'zaemit_set_active_view',
    '[Zaemit Visual HTML Editor] Switch the editor to a specific viewport/breakpoint view (e.g., switch to tablet view to edit at 768px width)',
    {
        width: z.string().describe('Viewport width to activate (e.g., "100%", "768", "480")'),
    },
    async ({ width }) => {
        const result = await editorFetch('/api/mcp/set-active-view', {
            method: 'POST',
            body: JSON.stringify({ width }),
        });
        return {
            content: [{ type: 'text', text: result.error ? `Error: ${result.error}` : `Switched to ${width} view` }],
        };
    }
);

server.tool(
    'zaemit_toggle_multiview',
    '[Zaemit Visual HTML Editor] Enable or disable multi-view mode, which shows multiple viewport sizes side by side for responsive design preview',
    {
        enabled: z.boolean().optional().describe('true to enable, false to disable, omit to toggle'),
    },
    async ({ enabled }) => {
        const result = await editorFetch('/api/mcp/toggle-multiview', {
            method: 'POST',
            body: JSON.stringify({ enabled }),
        });
        return {
            content: [{ type: 'text', text: result.error ? `Error: ${result.error}` : `Multi-view ${result.multiViewEnabled ? 'enabled' : 'disabled'}` }],
        };
    }
);

server.tool(
    'zaemit_reload_page',
    '[Zaemit Visual HTML Editor] Reload the preview page in the editor. Use this after the user manually edits the HTML/CSS file in VS Code text editor, or when the visual preview is out of sync.',
    {},
    async () => {
        const result = await editorFetch('/api/mcp/reload-page', {
            method: 'POST',
            body: JSON.stringify({}),
        });
        return {
            content: [{ type: 'text', text: result.error ? `Error: ${result.error}` : 'Page reloaded successfully' }],
        };
    }
);

// ==================== Start ====================

async function main() {
    const transport = new StdioServerTransport();
    await server.connect(transport);
    console.error('[Zaemit MCP] Server started, port:', getEditorPort() || 'not yet available');
}

main().catch((e) => {
    console.error('[Zaemit MCP] Fatal error:', e);
    process.exit(1);
});

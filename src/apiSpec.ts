/**
 * Zaemit Editor REST API Specification
 *
 * OpenAPI 3.1, OpenAI Function Calling schema, and HTML docs
 * for universal AI tool integration (Claude, GPT, Gemini, Cursor, etc.)
 */

export function openApiSpec(port: number) {
    return {
        openapi: '3.1.0',
        info: {
            title: 'Zaemit Visual Editor API',
            version: '1.0.0',
            description: 'REST API for AI-powered visual HTML/CSS editing in VS Code. Works with any AI tool that supports HTTP calls — Claude, GPT, Gemini, Cursor, Copilot, and more.',
        },
        servers: [{ url: `http://127.0.0.1:${port}`, description: 'Local VS Code Extension Host' }],
        paths: {
            '/api/mcp/state': {
                get: {
                    operationId: 'getEditorState',
                    summary: 'Get editor connection status, selected element, and project path',
                    responses: {
                        '200': {
                            description: 'Editor state',
                            content: { 'application/json': { schema: { $ref: '#/components/schemas/EditorState' } } },
                        },
                    },
                },
            },
            '/api/mcp/selection': {
                get: {
                    operationId: 'getSelection',
                    summary: 'Get detailed info about the currently selected element (tag, classes, styles, outerHTML)',
                    responses: {
                        '200': {
                            description: 'Selection info',
                            content: { 'application/json': { schema: { $ref: '#/components/schemas/Selection' } } },
                        },
                    },
                },
            },
            '/api/mcp/page-html': {
                get: {
                    operationId: 'getPageHtml',
                    summary: 'Get the full HTML of the page currently being edited',
                    responses: {
                        '200': {
                            description: 'Page HTML',
                            content: { 'application/json': { schema: { type: 'object', properties: { html: { type: 'string' } } } } },
                        },
                    },
                },
            },
            '/api/mcp/element-tree': {
                get: {
                    operationId: 'getElementTree',
                    summary: 'Get a simplified DOM tree (tag, id, class, selector) up to 3 levels deep',
                    responses: {
                        '200': {
                            description: 'Element tree',
                            content: { 'application/json': { schema: { type: 'object', properties: { tree: { type: 'array', items: { $ref: '#/components/schemas/TreeNode' } } } } } },
                        },
                    },
                },
            },
            '/api/mcp/update-element': {
                post: {
                    operationId: 'updateElement',
                    summary: 'Update styles, attributes, or text of an element by CSS selector',
                    requestBody: {
                        required: true,
                        content: {
                            'application/json': {
                                schema: { $ref: '#/components/schemas/UpdateElementRequest' },
                            },
                        },
                    },
                    responses: {
                        '200': { description: 'Success', content: { 'application/json': { schema: { $ref: '#/components/schemas/SuccessResponse' } } } },
                        '400': { description: 'Bad request' },
                        '503': { description: 'No editor connected' },
                    },
                },
            },
            '/api/mcp/replace-html': {
                post: {
                    operationId: 'replaceElementHtml',
                    summary: 'Replace the entire outerHTML of an element by CSS selector',
                    requestBody: {
                        required: true,
                        content: {
                            'application/json': {
                                schema: { $ref: '#/components/schemas/ReplaceHtmlRequest' },
                            },
                        },
                    },
                    responses: {
                        '200': { description: 'Success', content: { 'application/json': { schema: { $ref: '#/components/schemas/SuccessResponse' } } } },
                        '400': { description: 'Bad request' },
                        '503': { description: 'No editor connected' },
                    },
                },
            },
            '/api/mcp/insert-element': {
                post: {
                    operationId: 'insertElement',
                    summary: 'Insert new HTML into a parent element',
                    requestBody: {
                        required: true,
                        content: {
                            'application/json': {
                                schema: { $ref: '#/components/schemas/InsertElementRequest' },
                            },
                        },
                    },
                    responses: {
                        '200': { description: 'Success', content: { 'application/json': { schema: { $ref: '#/components/schemas/SuccessResponse' } } } },
                        '400': { description: 'Bad request' },
                        '503': { description: 'No editor connected' },
                    },
                },
            },
            '/api/mcp/delete-element': {
                post: {
                    operationId: 'deleteElement',
                    summary: 'Delete an element from the page by CSS selector',
                    requestBody: {
                        required: true,
                        content: {
                            'application/json': {
                                schema: { $ref: '#/components/schemas/DeleteElementRequest' },
                            },
                        },
                    },
                    responses: {
                        '200': { description: 'Success', content: { 'application/json': { schema: { $ref: '#/components/schemas/SuccessResponse' } } } },
                        '400': { description: 'Bad request' },
                        '503': { description: 'No editor connected' },
                    },
                },
            },
            '/api/mcp/viewports': {
                get: {
                    operationId: 'getViewports',
                    summary: 'Get viewport breakpoints list with active/enabled status and multiview state',
                    responses: {
                        '200': { description: 'Viewport list', content: { 'application/json': { schema: { $ref: '#/components/schemas/ViewportsResponse' } } } },
                        '503': { description: 'No editor connected' },
                    },
                },
            },
            '/api/mcp/toggle-viewport': {
                post: {
                    operationId: 'toggleViewport',
                    summary: 'Enable/disable a viewport breakpoint checkbox for media query targeting',
                    requestBody: { required: true, content: { 'application/json': { schema: { $ref: '#/components/schemas/ToggleViewportRequest' } } } },
                    responses: {
                        '200': { description: 'Success', content: { 'application/json': { schema: { $ref: '#/components/schemas/SuccessResponse' } } } },
                        '400': { description: 'Bad request' },
                        '503': { description: 'No editor connected' },
                    },
                },
            },
            '/api/mcp/set-active-view': {
                post: {
                    operationId: 'setActiveView',
                    summary: 'Switch the editor to a specific viewport width',
                    requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', required: ['width'], properties: { width: { type: 'string' } } } } } },
                    responses: {
                        '200': { description: 'Success', content: { 'application/json': { schema: { $ref: '#/components/schemas/SuccessResponse' } } } },
                        '503': { description: 'No editor connected' },
                    },
                },
            },
            '/api/mcp/toggle-multiview': {
                post: {
                    operationId: 'toggleMultiview',
                    summary: 'Enable/disable multi-view mode (side-by-side responsive preview)',
                    requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', properties: { enabled: { type: 'boolean' } } } } } },
                    responses: {
                        '200': { description: 'Success', content: { 'application/json': { schema: { $ref: '#/components/schemas/SuccessResponse' } } } },
                        '503': { description: 'No editor connected' },
                    },
                },
            },
        },
        components: {
            schemas: {
                EditorState: {
                    type: 'object',
                    properties: {
                        selection: { type: 'object', nullable: true, description: 'Currently selected element info' },
                        pageUrl: { type: 'string' },
                        projectDir: { type: 'string' },
                        hasConnectedEditor: { type: 'boolean' },
                    },
                },
                Selection: {
                    type: 'object',
                    properties: {
                        selected: { type: 'boolean' },
                        tag: { type: 'string' },
                        id: { type: 'string' },
                        classes: { type: 'array', items: { type: 'string' } },
                        attributes: { type: 'object', additionalProperties: { type: 'string' } },
                        computedStyle: { type: 'object', additionalProperties: { type: 'string' } },
                        outerHTML: { type: 'string' },
                        selector: { type: 'string' },
                    },
                },
                TreeNode: {
                    type: 'object',
                    properties: {
                        tag: { type: 'string' },
                        id: { type: 'string' },
                        class: { type: 'string' },
                        selector: { type: 'string' },
                        children: { type: 'array', items: { $ref: '#/components/schemas/TreeNode' } },
                    },
                },
                UpdateElementRequest: {
                    type: 'object',
                    required: ['selector', 'changes'],
                    properties: {
                        selector: { type: 'string', description: 'CSS selector (e.g. "#hero-title", ".btn-primary")' },
                        changes: {
                            type: 'object',
                            properties: {
                                style: { type: 'object', additionalProperties: { type: 'string' }, description: 'camelCase CSS (e.g. {"backgroundColor":"red"})' },
                                attributes: { type: 'object', additionalProperties: { type: 'string', nullable: true }, description: 'HTML attributes (null to remove)' },
                                textContent: { type: 'string' },
                                innerHTML: { type: 'string' },
                            },
                        },
                    },
                },
                ReplaceHtmlRequest: {
                    type: 'object',
                    required: ['selector', 'html'],
                    properties: {
                        selector: { type: 'string' },
                        html: { type: 'string', description: 'New outerHTML to replace with' },
                    },
                },
                InsertElementRequest: {
                    type: 'object',
                    required: ['parentSelector', 'html'],
                    properties: {
                        parentSelector: { type: 'string' },
                        html: { type: 'string' },
                        position: { type: 'string', enum: ['beforebegin', 'afterbegin', 'beforeend', 'afterend'], default: 'beforeend' },
                    },
                },
                DeleteElementRequest: {
                    type: 'object',
                    required: ['selector'],
                    properties: {
                        selector: { type: 'string' },
                    },
                },
                SuccessResponse: {
                    type: 'object',
                    properties: {
                        success: { type: 'boolean' },
                        error: { type: 'string' },
                    },
                },
                ViewportsResponse: {
                    type: 'object',
                    properties: {
                        success: { type: 'boolean' },
                        viewports: {
                            type: 'array',
                            items: {
                                type: 'object',
                                properties: {
                                    width: { type: 'string', description: 'Viewport width (e.g. "100%", "768", "480")' },
                                    label: { type: 'string' },
                                    active: { type: 'boolean', description: 'Currently selected view' },
                                    enabled: { type: 'boolean', description: 'Checkbox checked (edits apply to this breakpoint)' },
                                },
                            },
                        },
                        multiViewEnabled: { type: 'boolean' },
                    },
                },
                ToggleViewportRequest: {
                    type: 'object',
                    required: ['width'],
                    properties: {
                        width: { type: 'string', description: 'Viewport width (e.g. "768", "480")' },
                        enabled: { type: 'boolean', description: 'true=enable, false=disable, omit=toggle' },
                    },
                },
            },
        },
    };
}

/**
 * OpenAI Function Calling / Gemini Tool Declaration compatible schema
 */
export function functionsSpec() {
    return [
        {
            name: 'get_editor_state',
            description: 'Get the Zaemit editor state: connection status, selected element, project path. Call GET /api/mcp/state',
            parameters: { type: 'object', properties: {}, required: [] },
        },
        {
            name: 'get_selection',
            description: 'Get details of the currently selected element (tag, classes, computed styles, outerHTML). Call GET /api/mcp/selection',
            parameters: { type: 'object', properties: {}, required: [] },
        },
        {
            name: 'get_page_html',
            description: 'Get the full HTML of the page being edited. Call GET /api/mcp/page-html',
            parameters: { type: 'object', properties: {}, required: [] },
        },
        {
            name: 'get_element_tree',
            description: 'Get a simplified DOM tree (tag, id, class, selector per node, 3 levels deep). Call GET /api/mcp/element-tree',
            parameters: { type: 'object', properties: {}, required: [] },
        },
        {
            name: 'update_element',
            description: 'Update styles, attributes, or text of an element. Call POST /api/mcp/update-element',
            parameters: {
                type: 'object',
                required: ['selector', 'changes'],
                properties: {
                    selector: { type: 'string', description: 'CSS selector (e.g. "#hero-title", ".btn-primary")' },
                    changes: {
                        type: 'object',
                        properties: {
                            style: { type: 'object', description: 'camelCase CSS key-value pairs' },
                            attributes: { type: 'object', description: 'HTML attributes (null value removes)' },
                            textContent: { type: 'string', description: 'Replace text content' },
                            innerHTML: { type: 'string', description: 'Replace inner HTML' },
                        },
                    },
                },
            },
        },
        {
            name: 'replace_element_html',
            description: 'Replace the entire outerHTML of an element. Call POST /api/mcp/replace-html',
            parameters: {
                type: 'object',
                required: ['selector', 'html'],
                properties: {
                    selector: { type: 'string', description: 'CSS selector for the target element' },
                    html: { type: 'string', description: 'New HTML to replace with' },
                },
            },
        },
        {
            name: 'insert_element',
            description: 'Insert new HTML into a parent element. Call POST /api/mcp/insert-element',
            parameters: {
                type: 'object',
                required: ['parentSelector', 'html'],
                properties: {
                    parentSelector: { type: 'string', description: 'CSS selector for the parent' },
                    html: { type: 'string', description: 'HTML to insert' },
                    position: { type: 'string', enum: ['beforebegin', 'afterbegin', 'beforeend', 'afterend'], description: 'Insert position (default: beforeend)' },
                },
            },
        },
        {
            name: 'delete_element',
            description: 'Delete an element from the page. Call POST /api/mcp/delete-element',
            parameters: {
                type: 'object',
                required: ['selector'],
                properties: {
                    selector: { type: 'string', description: 'CSS selector for the element to delete' },
                },
            },
        },
        {
            name: 'get_viewports',
            description: 'Get viewport breakpoints (Desktop, Tablet, Mobile) with active/enabled status. Call GET /api/mcp/viewports',
            parameters: { type: 'object', properties: {}, required: [] },
        },
        {
            name: 'toggle_viewport',
            description: 'Enable/disable a viewport breakpoint. Enabled viewports receive CSS edits via media queries. Call POST /api/mcp/toggle-viewport',
            parameters: {
                type: 'object',
                required: ['width'],
                properties: {
                    width: { type: 'string', description: 'Viewport width (e.g. "100%", "768", "480")' },
                    enabled: { type: 'boolean', description: 'true=enable, false=disable, omit=toggle' },
                },
            },
        },
        {
            name: 'set_active_view',
            description: 'Switch editor to a specific viewport width for editing. Call POST /api/mcp/set-active-view',
            parameters: {
                type: 'object',
                required: ['width'],
                properties: {
                    width: { type: 'string', description: 'Viewport width to activate (e.g. "768")' },
                },
            },
        },
        {
            name: 'toggle_multiview',
            description: 'Enable/disable multi-view mode (side-by-side responsive preview). Call POST /api/mcp/toggle-multiview',
            parameters: {
                type: 'object',
                properties: {
                    enabled: { type: 'boolean', description: 'true=enable, false=disable, omit=toggle' },
                },
            },
        },
    ];
}

/**
 * Interactive HTML API documentation page
 */
export function apiDocsHtml(port: number): string {
    const baseUrl = `http://127.0.0.1:${port}`;
    return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>Zaemit Editor API</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #0d1117; color: #c9d1d9; padding: 2rem; line-height: 1.6; }
  h1 { color: #58a6ff; margin-bottom: 0.5rem; }
  .subtitle { color: #8b949e; margin-bottom: 2rem; }
  .card { background: #161b22; border: 1px solid #30363d; border-radius: 8px; padding: 1.25rem; margin-bottom: 1rem; }
  .card h3 { color: #58a6ff; margin-bottom: 0.5rem; }
  .method { display: inline-block; padding: 2px 8px; border-radius: 4px; font-size: 0.75rem; font-weight: 700; margin-right: 8px; }
  .get { background: #1f6feb33; color: #58a6ff; }
  .post { background: #238636; color: #fff; }
  .endpoint { font-family: monospace; color: #f0883e; }
  .desc { color: #8b949e; margin-top: 0.25rem; }
  pre { background: #0d1117; border: 1px solid #30363d; border-radius: 6px; padding: 1rem; overflow-x: auto; margin-top: 0.75rem; font-size: 0.85rem; color: #c9d1d9; }
  .links { margin: 1.5rem 0; display: flex; gap: 1rem; flex-wrap: wrap; }
  .links a { color: #58a6ff; background: #1f6feb22; padding: 0.5rem 1rem; border-radius: 6px; text-decoration: none; border: 1px solid #1f6feb55; }
  .links a:hover { background: #1f6feb44; }
  .badge { display: inline-block; background: #238636; color: #fff; padding: 2px 10px; border-radius: 12px; font-size: 0.75rem; margin-left: 8px; }
</style>
</head>
<body>
<h1>Zaemit Visual Editor API <span class="badge">v1.0</span></h1>
<p class="subtitle">Universal REST API for AI-powered visual editing. Works with Claude, GPT, Gemini, Cursor, Copilot, and any HTTP client.</p>

<div class="links">
  <a href="/openapi.json">OpenAPI 3.1 Schema</a>
  <a href="/functions.json">OpenAI / Gemini Functions Schema</a>
</div>

<p style="margin-bottom:1rem; color:#8b949e;">Base URL: <code style="color:#f0883e;">${baseUrl}</code></p>

<h2 style="color:#c9d1d9; margin: 1.5rem 0 1rem;">Read Operations</h2>

<div class="card">
  <h3><span class="method get">GET</span><span class="endpoint">/api/mcp/state</span></h3>
  <p class="desc">Editor connection status, selected element, project path</p>
  <pre>curl ${baseUrl}/api/mcp/state</pre>
</div>

<div class="card">
  <h3><span class="method get">GET</span><span class="endpoint">/api/mcp/selection</span></h3>
  <p class="desc">Currently selected element details (tag, classes, styles, outerHTML)</p>
  <pre>curl ${baseUrl}/api/mcp/selection</pre>
</div>

<div class="card">
  <h3><span class="method get">GET</span><span class="endpoint">/api/mcp/page-html</span></h3>
  <p class="desc">Full HTML of the page being edited</p>
  <pre>curl ${baseUrl}/api/mcp/page-html</pre>
</div>

<div class="card">
  <h3><span class="method get">GET</span><span class="endpoint">/api/mcp/element-tree</span></h3>
  <p class="desc">Simplified DOM tree (3 levels deep)</p>
  <pre>curl ${baseUrl}/api/mcp/element-tree</pre>
</div>

<h2 style="color:#c9d1d9; margin: 1.5rem 0 1rem;">Write Operations</h2>

<div class="card">
  <h3><span class="method post">POST</span><span class="endpoint">/api/mcp/update-element</span></h3>
  <p class="desc">Update styles, attributes, or text of an element</p>
  <pre>curl -X POST ${baseUrl}/api/mcp/update-element \\
  -H "Content-Type: application/json" \\
  -d '{"selector":"#hero-title","changes":{"style":{"color":"red"},"textContent":"Hello"}}'</pre>
</div>

<div class="card">
  <h3><span class="method post">POST</span><span class="endpoint">/api/mcp/replace-html</span></h3>
  <p class="desc">Replace the entire outerHTML of an element</p>
  <pre>curl -X POST ${baseUrl}/api/mcp/replace-html \\
  -H "Content-Type: application/json" \\
  -d '{"selector":".old-section","html":"&lt;section class=\\"new\\"&gt;New content&lt;/section&gt;"}'</pre>
</div>

<div class="card">
  <h3><span class="method post">POST</span><span class="endpoint">/api/mcp/insert-element</span></h3>
  <p class="desc">Insert new HTML into a parent element</p>
  <pre>curl -X POST ${baseUrl}/api/mcp/insert-element \\
  -H "Content-Type: application/json" \\
  -d '{"parentSelector":"body","html":"&lt;div&gt;New element&lt;/div&gt;","position":"beforeend"}'</pre>
</div>

<div class="card">
  <h3><span class="method post">POST</span><span class="endpoint">/api/mcp/delete-element</span></h3>
  <p class="desc">Delete an element from the page</p>
  <pre>curl -X POST ${baseUrl}/api/mcp/delete-element \\
  -H "Content-Type: application/json" \\
  -d '{"selector":".unwanted-element"}'</pre>
</div>

<h2 style="color:#c9d1d9; margin: 1.5rem 0 1rem;">Integration Examples</h2>

<div class="card">
  <h3>OpenAI / GPT (Function Calling)</h3>
  <pre>// 1. Fetch function definitions
const functions = await fetch("${baseUrl}/functions.json").then(r => r.json());
// 2. Pass to ChatGPT API as tools
const response = await openai.chat.completions.create({
  model: "gpt-4",
  messages: [...],
  tools: functions.map(f => ({ type: "function", function: f }))
});</pre>
</div>

<div class="card">
  <h3>Google Gemini (Tool Declaration)</h3>
  <pre>// functions.json is compatible with Gemini's tool format
const tools = await fetch("${baseUrl}/functions.json").then(r => r.json());
const model = genAI.getGenerativeModel({
  model: "gemini-pro",
  tools: [{ functionDeclarations: tools }]
});</pre>
</div>

<div class="card">
  <h3>Claude Code (MCP - already configured)</h3>
  <pre>// .mcp.json is pre-configured. Claude Code auto-discovers tools.
// No additional setup needed.</pre>
</div>

<div class="card">
  <h3>Any HTTP Client (curl, Python, etc.)</h3>
  <pre># Read state
curl ${baseUrl}/api/mcp/state

# Change element color
curl -X POST ${baseUrl}/api/mcp/update-element \\
  -H "Content-Type: application/json" \\
  -d '{"selector":"h1","changes":{"style":{"color":"#ff6600"}}}'</pre>
</div>

</body>
</html>`;
}

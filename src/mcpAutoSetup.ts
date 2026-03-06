import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';

/**
 * MCP Auto Setup
 *
 * 익스텐션이 활성화될 때 워크스페이스에 .mcp.json과 CLAUDE.md를 자동 생성/갱신.
 * 마켓플레이스에서 설치한 사용자도 별도 설정 없이 AI 도구 연동이 바로 됨.
 */

const MCP_CONFIG_FILENAME = '.mcp.json';
const CLAUDE_MD_FILENAME = 'CLAUDE.md';
const ZAEMIT_MCP_KEY = 'zaemit-editor';

// .mcp.json에 zaemit-editor 엔트리가 올바른지 확인
function getDesiredMcpConfig(mcpServerPath: string) {
    return {
        mcpServers: {
            [ZAEMIT_MCP_KEY]: {
                command: 'node',
                args: [mcpServerPath],
            },
        },
    };
}

function getClaudeMdContent(): string {
    return `# Zaemit Visual Editor - AI Tool Instructions

## MCP Tool Priority

This project uses the **Zaemit Visual HTML/CSS Editor** VS Code extension.

**IMPORTANT**: When the user asks about editing elements, styles, selections, outlines, colors, or anything related to a visual editor / HTML / CSS / web page, ALWAYS use \`zaemit_*\` tools FIRST — NOT Pencil tools.

### When to use Zaemit tools
- User mentions: "재밋", "zaemit", "에디터", "비주얼 에디터", "HTML", "엘리먼트", "선택한", "외곽선", "스타일", "페이지"
- Any request about editing/viewing/selecting HTML elements
- Any request about CSS styles, outlines, borders, colors, layouts

### When to use Pencil tools
- ONLY when the user explicitly mentions ".pen files" or "pencil"

### Available Zaemit tools
- \`zaemit_get_editor_state\` - Editor connection status
- \`zaemit_get_selection\` - Selected HTML element details
- \`zaemit_get_page_html\` - Full page HTML
- \`zaemit_get_element_tree\` - DOM tree
- \`zaemit_update_element\` - Update styles/attributes/text
- \`zaemit_replace_element_html\` - Replace outerHTML
- \`zaemit_insert_element\` - Insert new HTML
- \`zaemit_delete_element\` - Delete element
`;
}

/**
 * 워크스페이스에 .mcp.json 자동 생성/갱신
 * - 파일이 없으면 생성
 * - 파일이 있으면 zaemit-editor 엔트리만 추가/갱신 (다른 서버 설정은 유지)
 */
function setupMcpJson(workspaceRoot: string, mcpServerPath: string): boolean {
    const mcpJsonPath = path.join(workspaceRoot, MCP_CONFIG_FILENAME);
    let config: any = { mcpServers: {} };
    let changed = false;

    // 기존 파일 읽기
    try {
        const existing = fs.readFileSync(mcpJsonPath, 'utf-8');
        config = JSON.parse(existing);
        if (!config.mcpServers) { config.mcpServers = {}; }
    } catch {
        // 파일 없거나 파싱 실패 → 새로 생성
        changed = true;
    }

    // zaemit-editor 엔트리 확인/갱신
    const desired = getDesiredMcpConfig(mcpServerPath).mcpServers[ZAEMIT_MCP_KEY];
    const current = config.mcpServers[ZAEMIT_MCP_KEY];

    if (!current ||
        current.command !== desired.command ||
        JSON.stringify(current.args) !== JSON.stringify(desired.args)) {
        config.mcpServers[ZAEMIT_MCP_KEY] = desired;
        changed = true;
    }

    if (changed) {
        fs.writeFileSync(mcpJsonPath, JSON.stringify(config, null, 2) + '\n');
    }

    return changed;
}

/**
 * CLAUDE.md 자동 생성 (없을 때만)
 * - 기존 파일이 있으면 건드리지 않음 (사용자가 커스텀했을 수 있으므로)
 */
function setupClaudeMd(workspaceRoot: string): boolean {
    const claudeMdPath = path.join(workspaceRoot, CLAUDE_MD_FILENAME);

    if (fs.existsSync(claudeMdPath)) {
        // 이미 존재하면 zaemit 관련 내용이 있는지 확인
        const content = fs.readFileSync(claudeMdPath, 'utf-8');
        if (content.includes('zaemit') || content.includes('Zaemit')) {
            return false; // 이미 설정됨
        }
        // zaemit 내용이 없으면 끝에 추가
        fs.appendFileSync(claudeMdPath, '\n' + getClaudeMdContent());
        return true;
    }

    fs.writeFileSync(claudeMdPath, getClaudeMdContent());
    return true;
}

/**
 * .gitignore에 .mcp.json 추가 (사용자 프로젝트를 오염시키지 않도록)
 */
function ensureGitignore(workspaceRoot: string) {
    const gitignorePath = path.join(workspaceRoot, '.gitignore');
    const entries = [MCP_CONFIG_FILENAME];

    try {
        let content = '';
        if (fs.existsSync(gitignorePath)) {
            content = fs.readFileSync(gitignorePath, 'utf-8');
        }

        const missing = entries.filter(e => !content.includes(e));
        if (missing.length > 0) {
            const section = '\n# Zaemit AI tool config (auto-generated)\n' + missing.join('\n') + '\n';
            fs.appendFileSync(gitignorePath, section);
        }
    } catch {
        // .gitignore 쓰기 실패는 무시
    }
}

/**
 * 익스텐션 활성화 시 호출
 */
export function autoSetupMcp(context: vscode.ExtensionContext) {
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders || workspaceFolders.length === 0) { return; }

    const workspaceRoot = workspaceFolders[0].uri.fsPath;

    // MCP 서버 경로: 익스텐션 설치 디렉토리의 dist/mcp-server.js (절대경로)
    const mcpServerPath = path.join(context.extensionPath, 'dist', 'mcp-server.js');

    // 존재 확인
    if (!fs.existsSync(mcpServerPath)) {
        console.warn('[Zaemit] MCP server not found at:', mcpServerPath);
        return;
    }

    try {
        const mcpChanged = setupMcpJson(workspaceRoot, mcpServerPath);
        const claudeChanged = setupClaudeMd(workspaceRoot);

        if (mcpChanged) {
            ensureGitignore(workspaceRoot);
        }

        if (mcpChanged || claudeChanged) {
            console.log('[Zaemit] AI tool config auto-generated in workspace');
        }
    } catch (err) {
        console.error('[Zaemit] Auto-setup failed:', err);
    }
}

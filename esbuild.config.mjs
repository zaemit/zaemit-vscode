import * as esbuild from 'esbuild';

const isWatch = process.argv.includes('--watch');

// 1. Extension Host 빌드 (Node.js)
const extensionBuild = {
    entryPoints: ['src/extension.ts'],
    bundle: true,
    outfile: 'dist/extension.js',
    platform: 'node',
    target: 'node18',
    format: 'cjs',
    external: ['vscode'],
    sourcemap: true,
    minify: !isWatch
};

// 2. WebView 번들 빌드 (Browser)
const webviewBuild = {
    entryPoints: ['media/modules/webview-entry.js'],
    bundle: true,
    outfile: 'dist/webview.js',
    platform: 'browser',
    target: 'es2020',
    format: 'iife',
    sourcemap: true,
    minify: !isWatch,
    external: [],
    define: {
        'process.env.NODE_ENV': '"production"'
    }
};

// 3. VSCodeBridge 별도 minify (별도 <script>로 로드됨)
const bridgeBuild = {
    entryPoints: ['media/modules/VSCodeBridge.js'],
    bundle: false,
    outfile: 'dist/bridge.js',
    platform: 'browser',
    target: 'es2020',
    format: 'esm',
    sourcemap: false,
    minify: !isWatch
};

// 4. MCP Server 번들 (Claude Code가 spawn하는 독립 프로세스)
const mcpServerBuild = {
    entryPoints: ['mcp-server.js'],
    bundle: true,
    outfile: 'dist/mcp-server.js',
    platform: 'node',
    target: 'node18',
    format: 'cjs',
    sourcemap: false,
    minify: !isWatch
};

if (isWatch) {
    const ctx1 = await esbuild.context(extensionBuild);
    const ctx2 = await esbuild.context(webviewBuild);
    const ctx3 = await esbuild.context(bridgeBuild);
    const ctx4 = await esbuild.context(mcpServerBuild);
    await Promise.all([ctx1.watch(), ctx2.watch(), ctx3.watch(), ctx4.watch()]);
    console.log('Watching for changes...');
} else {
    await Promise.all([
        esbuild.build(extensionBuild),
        esbuild.build(webviewBuild),
        esbuild.build(bridgeBuild),
        esbuild.build(mcpServerBuild)
    ]);
    console.log('Build complete (Extension + WebView + Bridge + MCP Server).');
}

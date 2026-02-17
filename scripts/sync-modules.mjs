/**
 * sync-modules.js
 *
 * 원본 Zaemit 에디터 모듈을 VS Code 확장 프로젝트로 동기화합니다.
 * VS Code 전용으로 수정된 파일은 건너뜁니다.
 *
 * 사용: npm run sync
 */

import { readdir, copyFile, stat, mkdir } from 'fs/promises';
import { join, relative } from 'path';
import { fileURLToPath } from 'url';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const PROJECT_ROOT = join(__dirname, '..');

// 원본 경로
const BASIC_ROOT = join(PROJECT_ROOT, '..', 'basic');
const SRC_MODULES = join(BASIC_ROOT, 'src', 'editor', 'modules');
const SRC_LIB = join(BASIC_ROOT, 'src', 'editor', 'lib', 'codemirror');
const SRC_CSS = join(BASIC_ROOT, 'public', 'css', 'editor.css');

// 대상 경로
const DST_MODULES = join(PROJECT_ROOT, 'media', 'modules');
const DST_LIB = join(PROJECT_ROOT, 'media', 'lib', 'codemirror');
const DST_CSS = join(PROJECT_ROOT, 'media', 'editor.css');

// VS Code 전용 파일 (동기화 제외)
const EXCLUDE_FILES = new Set([
    'EditorApp.js',
    'CodeEditor.js',
    'AIChatManager.js',
    'PublishManager.js',
    'VSCodeBridge.js',
    'webview-entry.js',
    'MotionManager.js',
    'ImageManager.js',
]);

let copied = 0;
let skipped = 0;
let unchanged = 0;

async function copyIfNewer(src, dst) {
    try {
        const srcStat = await stat(src);
        let dstStat;
        try {
            dstStat = await stat(dst);
        } catch {
            dstStat = null;
        }

        // 대상이 없거나 원본이 더 새로우면 복사
        if (!dstStat || srcStat.mtimeMs > dstStat.mtimeMs) {
            await copyFile(src, dst);
            copied++;
            return true;
        }
        unchanged++;
        return false;
    } catch (err) {
        console.error(`  ERROR: ${src} → ${err.message}`);
        return false;
    }
}

async function syncDirectory(srcDir, dstDir, excludes = new Set()) {
    await mkdir(dstDir, { recursive: true });

    const entries = await readdir(srcDir, { withFileTypes: true });

    for (const entry of entries) {
        const srcPath = join(srcDir, entry.name);
        const dstPath = join(dstDir, entry.name);

        if (entry.isDirectory()) {
            // styles/ 등 하위 디렉토리 재귀 동기화
            await syncDirectory(srcPath, dstPath);
        } else if (entry.isFile() && entry.name.endsWith('.js')) {
            if (excludes.has(entry.name)) {
                skipped++;
                continue;
            }
            await copyIfNewer(srcPath, dstPath);
        }
    }
}

async function main() {
    console.log('[sync] Zaemit 에디터 모듈 동기화 시작...');
    console.log(`[sync] 원본: ${relative(PROJECT_ROOT, SRC_MODULES)}`);
    console.log(`[sync] 대상: ${relative(PROJECT_ROOT, DST_MODULES)}`);
    console.log(`[sync] 제외: ${[...EXCLUDE_FILES].join(', ')}`);
    console.log('');

    // 1. 모듈 동기화
    await syncDirectory(SRC_MODULES, DST_MODULES, EXCLUDE_FILES);

    // 2. CodeMirror 라이브러리 동기화
    await mkdir(DST_LIB, { recursive: true });
    const libEntries = await readdir(SRC_LIB);
    for (const file of libEntries) {
        await copyIfNewer(join(SRC_LIB, file), join(DST_LIB, file));
    }

    // 3. editor.css 동기화
    await copyIfNewer(SRC_CSS, DST_CSS);

    console.log(`[sync] 완료: ${copied}개 복사, ${unchanged}개 변경없음, ${skipped}개 제외`);
}

main().catch(err => {
    console.error('[sync] 실패:', err);
    process.exit(1);
});

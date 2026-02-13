import * as vscode from 'vscode';
import * as path from 'path';

export interface FileInfo {
    name: string;
    content: string;
}

export class FileService {
    constructor(private projectDir: string) {}

    async listFiles(): Promise<FileInfo[]> {
        const files: FileInfo[] = [];
        const editableExts = ['.html', '.css', '.js', '.json', '.svg', '.txt'];

        try {
            const dirUri = vscode.Uri.file(this.projectDir);
            const entries = await vscode.workspace.fs.readDirectory(dirUri);

            for (const [name, type] of entries) {
                if (type !== vscode.FileType.File) continue;
                const ext = path.extname(name).toLowerCase();
                if (!editableExts.includes(ext)) continue;

                try {
                    const content = await this.readFile(name);
                    files.push({ name, content });
                } catch {
                    // Skip files that can't be read
                }
            }
        } catch (err) {
            console.error('[FileService] Error listing files:', err);
        }

        return files;
    }

    async readFile(filename: string): Promise<string> {
        const uri = vscode.Uri.file(path.join(this.projectDir, filename));
        const data = await vscode.workspace.fs.readFile(uri);
        return Buffer.from(data).toString('utf-8');
    }

    async writeFile(filename: string, content: string): Promise<void> {
        const uri = vscode.Uri.file(path.join(this.projectDir, filename));
        await vscode.workspace.fs.writeFile(uri, Buffer.from(content, 'utf-8'));
    }

    async fileExists(filename: string): Promise<boolean> {
        try {
            const uri = vscode.Uri.file(path.join(this.projectDir, filename));
            await vscode.workspace.fs.stat(uri);
            return true;
        } catch {
            return false;
        }
    }

    async listImages(): Promise<string[]> {
        const images: string[] = [];
        const imageExts = ['.png', '.jpg', '.jpeg', '.gif', '.svg', '.webp', '.ico'];

        try {
            const dirUri = vscode.Uri.file(this.projectDir);
            const entries = await vscode.workspace.fs.readDirectory(dirUri);

            for (const [name, type] of entries) {
                if (type !== vscode.FileType.File) continue;
                const ext = path.extname(name).toLowerCase();
                if (imageExts.includes(ext)) {
                    images.push(name);
                }
            }

            // Check images subdirectory
            try {
                const imagesDir = vscode.Uri.file(path.join(this.projectDir, 'images'));
                const imgEntries = await vscode.workspace.fs.readDirectory(imagesDir);
                for (const [name, type] of imgEntries) {
                    if (type !== vscode.FileType.File) continue;
                    const ext = path.extname(name).toLowerCase();
                    if (imageExts.includes(ext)) {
                        images.push('images/' + name);
                    }
                }
            } catch {
                // images/ directory doesn't exist
            }
        } catch (err) {
            console.error('[FileService] Error listing images:', err);
        }

        return images;
    }
}

import EventEmitter from './EventEmitter.js';

/**
 * ProjectLoader - Handles project loading and initialization
 */
class ProjectLoader extends EventEmitter {
    constructor() {
        super();
        this.projectId = null;
        this.project = null;
    }

    /**
     * Get project ID from URL
     * @returns {string|null}
     */
    getProjectIdFromUrl() {
        const params = new URLSearchParams(window.location.search);
        return params.get('project');
    }

    /**
     * Load project metadata from server
     * @param {string} projectId
     * @returns {Promise<Object|null>}
     */
    async loadProject(projectId) {
        this.projectId = projectId;

        try {
            const response = await fetch(`/api/projects/${projectId}`);
            if (!response.ok) {
                throw new Error('Project not found');
            }

            this.project = await response.json();
            this.emit('project:loaded', this.project);
            return this.project;

        } catch (err) {
            console.error('Error loading project:', err);
            this.emit('project:error', err);
            return null;
        }
    }

    /**
     * Update project name in UI
     */
    updateProjectUI() {
        if (!this.project) return;

        const nameEl = document.getElementById('projectName');
        if (nameEl) {
            nameEl.textContent = this.project.name;
        }
        document.title = `${this.project.name} - Bazix Editor`;

        // 뒤로가기 버튼 링크를 프로젝트 설정 페이지로 설정
        const backBtn = document.getElementById('backBtn');
        if (backBtn) {
            backBtn.href = `/project-settings.html?id=${this.project.id}`;
        }
    }

    /**
     * Get project
     * @returns {Object|null}
     */
    getProject() {
        return this.project;
    }

    /**
     * Get project ID
     * @returns {string|null}
     */
    getProjectId() {
        return this.projectId;
    }

    /**
     * Get project folder name
     * @returns {string|null}
     */
    getFolderName() {
        return this.project?.folderName;
    }

    /**
     * Get preview URL
     * @returns {string}
     */
    getPreviewUrl() {
        if (!this.project) return '';
        return `/projects/${this.project.folderName}/index.html`;
    }

    /**
     * Update project data
     * @param {Object} updates
     */
    updateProject(updates) {
        if (!this.project) return;
        Object.assign(this.project, updates);
        this.emit('project:updated', this.project);
    }
}

export default ProjectLoader;

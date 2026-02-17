import ShopEditorApp from './ShopEditorApp.js';

let shopEditorInstance = null;

async function initializeShopEditor() {
    try {
        shopEditorInstance = new ShopEditorApp();
        await shopEditorInstance.init();
        window.shopEditor = shopEditorInstance;
    } catch (error) {
        console.error('Failed to initialize shop editor:', error);
    }
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initializeShopEditor);
} else {
    initializeShopEditor();
}

export { shopEditorInstance, initializeShopEditor };
export default ShopEditorApp;

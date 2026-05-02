// Alibaba Scraper Pro - Popup Logic
let dirHandle = null;

// UI Elements
const setupView = document.getElementById('setup-view');
const scrapeView = document.getElementById('scrape-view');
const progressArea = document.getElementById('progress-area');
const previewArea = document.getElementById('preview-area');

const statusDot = document.getElementById('status-dot');
const statusText = document.getElementById('status-text');
const folderNameDisp = document.getElementById('folder-name');

const progressStatus = document.getElementById('progress-status');
const progressPercent = document.getElementById('progress-percent');
const progressFill = document.getElementById('progress-fill');

const previewImg = document.getElementById('preview-img');
const previewTitle = document.getElementById('preview-title');
const previewPrice = document.getElementById('preview-price');

// Buttons
const btnSelectFolder = document.getElementById('btn-select-folder');
const btnScrape = document.getElementById('btn-scrape');
const btnChangeFolder = document.getElementById('btn-change-folder');

const DB_NAME = 'AlibabaScraperDB';
const STORE_NAME = 'handles';
const HANDLE_KEY = 'assets_folder_v2';

// Initialize
document.addEventListener('DOMContentLoaded', async () => {
    await restoreHandle();
});

// IndexedDB Helper
async function getDB() {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, 1);
        request.onupgradeneeded = () => request.result.createObjectStore(STORE_NAME);
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
}

async function saveHandle(handle) {
    const db = await getDB();
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).put(handle, HANDLE_KEY);
    return new Promise((resolve) => tx.oncomplete = () => resolve());
}

async function getHandle() {
    const db = await getDB();
    const tx = db.transaction(STORE_NAME, 'readonly');
    const request = tx.objectStore(STORE_NAME).get(HANDLE_KEY);
    return new Promise((resolve) => request.onsuccess = () => resolve(request.result));
}

async function verifyPermission(handle, readWrite = true) {
    const options = { mode: readWrite ? 'readwrite' : 'read' };
    if ((await handle.queryPermission(options)) === 'granted') return true;
    if ((await handle.requestPermission(options)) === 'granted') return true;
    return false;
}

// Folder Selection
btnSelectFolder.addEventListener('click', async () => {
    try {
        dirHandle = await window.showDirectoryPicker({ mode: 'readwrite' });
        await saveHandle(dirHandle);
        showScrapeUI();
    } catch (err) {
        console.error("Folder selection failed:", err);
        updateStatus("Selection Failed", true);
    }
});

btnChangeFolder.addEventListener('click', () => {
    setupView.classList.remove('hidden');
    scrapeView.classList.add('hidden');
    previewArea.classList.add('hidden');
    progressArea.classList.add('hidden');
});

// Scrape Action
btnScrape.addEventListener('click', async () => {
    if (!dirHandle) return;

    try {
        const hasPermission = await verifyPermission(dirHandle);
        if (!hasPermission) {
            updateStatus("Permission Denied", true);
            return;
        }

        updateStatus("Scraping...", false);
        progressArea.classList.remove('hidden');
        previewArea.classList.add('hidden');
        updateProgress("Connecting to page", 10);

        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        
        if (!tab || (!tab.url.includes('alibaba.com'))) {
            updateStatus("Not Alibaba!", true);
            return;
        }

        // Send message to content script
        updateProgress("Extracting data", 30);
        
        chrome.tabs.sendMessage(tab.id, { action: "scrape" }, async (product) => {
            if (chrome.runtime.lastError || !product) {
                // If message fails, script might not be injected
                updateProgress("Injecting script", 40);
                await chrome.scripting.executeScript({
                    target: { tabId: tab.id },
                    files: ['content.js']
                });
                // Retry
                chrome.tabs.sendMessage(tab.id, { action: "scrape" }, async (rePro) => {
                    if (rePro) await handleExtractedProduct(rePro);
                    else updateStatus("Extraction Failed", true);
                });
            } else {
                await handleExtractedProduct(product);
            }
        });

    } catch (err) {
        console.error("Scrape error:", err);
        updateStatus("Error Occurred", true);
    }
});

async function fetchWithTimeout(resource, options = {}) {
    const { timeout = 8000 } = options;
    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), timeout);
    try {
        const response = await fetch(resource, {
            ...options,
            signal: controller.signal
        });
        clearTimeout(id);
        return response;
    } catch (e) {
        clearTimeout(id);
        throw e;
    }
}

async function handleExtractedProduct(product) {
    updateProgress("Processing data", 50);
    
    const category = document.getElementById('category-select').value;
    product.category = category;

    try {
        // 1. Process Images
        const imagesFolder = await getOrCreateSubdir(dirHandle, 'images');
        const productImagesFolder = await getOrCreateSubdir(imagesFolder, product.slug);
        
        const imageUrls = product.imageUrls || [];
        updateProgress(`Downloading ${imageUrls.length} images...`, 60);

        // Download images in parallel with timeouts to prevent hanging
        const downloadPromises = imageUrls.map(async (imgUrl, i) => {
            try {
                // Proxy via background script to bypass CORS with a timeout
                const result = await Promise.race([
                    new Promise((resolve) => {
                        chrome.runtime.sendMessage({ action: "fetch_image", url: imgUrl }, (response) => {
                            if (chrome.runtime.lastError) {
                                resolve({ error: chrome.runtime.lastError.message });
                            } else {
                                resolve(response);
                            }
                        });
                    }),
                    new Promise((resolve) => setTimeout(() => resolve({ error: "Background timeout" }), 15000))
                ]);

                if (!result || result.error) throw new Error(result?.error || "Fetch failed");

                // result.dataUrl is the base64 encoded image
                const response = await fetch(result.dataUrl);
                const blob = await response.blob();
                const fileName = `img_${i}_${Date.now()}.jpg`;

                const fileHandle = await productImagesFolder.getFileHandle(fileName, { create: true });
                const writable = await fileHandle.createWritable();
                await writable.write(blob);
                await writable.close();
                
                return `assets/images/${product.slug}/${fileName}`;
            } catch (e) {
                console.warn(`Skipping image ${i} (${imgUrl}):`, e);
                return null;
            }
        });

        const downloadedPaths = await Promise.all(downloadPromises);
        product.images = downloadedPaths.filter(path => path !== null);
        delete product.imageUrls;

        // 2. Update products.json
        updateProgress("Saving to JSON", 90);
        const dataFolder = await getOrCreateSubdir(dirHandle, 'data');
        const jsonFileHandle = await dataFolder.getFileHandle('products.json', { create: true });
        
        const file = await jsonFileHandle.getFile();
        const content = await file.text();
        let products = [];
        try { products = JSON.parse(content || '[]'); } catch (e) { products = []; }

        const index = products.findIndex(p => p.id === product.id || p.slug === product.slug);
        if (index > -1) products[index] = product;
        else products.push(product);

        const writable = await jsonFileHandle.createWritable();
        await writable.write(JSON.stringify(products, null, 2));
        await writable.close();

        updateProgress("Success!", 100);
        showPreview(product);
        updateStatus("Completed", false);

    } catch (err) {
        console.error("Processing failed:", err);
        updateStatus("Save Failed", true);
    }
}

// Helpers
async function getOrCreateSubdir(parentHandle, name) {
    return await parentHandle.getDirectoryHandle(name, { create: true });
}

function updateStatus(text, isError = false) {
    statusText.innerText = text;
    statusDot.className = `dot ${isError ? 'off' : 'on'}`;
}

function updateProgress(status, percent) {
    progressStatus.innerText = status;
    progressPercent.innerText = `${percent}%`;
    progressFill.style.width = `${percent}%`;
}

function showScrapeUI() {
    setupView.classList.add('hidden');
    scrapeView.classList.remove('hidden');
    folderNameDisp.innerText = dirHandle.name;
    updateStatus("Connected", false);
}

function showPreview(product) {
    previewArea.classList.remove('hidden');
    // For preview, we might need a direct URL if local paths aren't accessible via img.src
    // But since we just downloaded them, the original URL was in the product before deletion
    // Let's assume we want to show something. 
    // In handleExtractedProduct we could have saved a temp URL
    previewTitle.innerText = product.title;
    previewPrice.innerText = `₹${product.discount_price}`;
    
    // Fallback image for preview since assets/ path won't work in popup directly
    if (product.images && product.images.length > 0) {
        // In a real extension, we'd use a data URL or similar for the preview
        previewImg.src = "icons/icon128.png"; // Placeholder
    }
}

async function restoreHandle() {
    try {
        const savedHandle = await getHandle();
        if (savedHandle) {
            dirHandle = savedHandle;
            showScrapeUI();
        }
    } catch (e) {
        console.error("Restoration failed:", e);
    }
}

// File labels
const SETTINGS_KEY = 'temu_scraper_settings';
let dirHandle = null;

// UI Elements
const setupSection = document.getElementById('setup-section');
const scrapeSection = document.getElementById('scrape-section');
const statusArea = document.getElementById('status-area');
const previewArea = document.getElementById('preview-area');
const statusText = document.getElementById('status-text');
const progressFill = document.getElementById('progress-fill');
const statusDot = document.getElementById('status-dot');
const folderPathDisplay = document.getElementById('folder-path');

// Buttons
const btnSelectFolder = document.getElementById('btn-select-folder');
const btnScrape = document.getElementById('btn-scrape');
const btnChangeFolder = document.getElementById('btn-change-folder');

const DB_NAME = 'TemuScraperDB';
const STORE_NAME = 'handles';
const HANDLE_KEY = 'assets_folder';

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
    return new Promise((resolve) => {
        tx.oncomplete = () => resolve();
    });
}

async function getHandle() {
    const db = await getDB();
    const tx = db.transaction(STORE_NAME, 'readonly');
    const request = tx.objectStore(STORE_NAME).get(HANDLE_KEY);
    return new Promise((resolve) => {
        request.onsuccess = () => resolve(request.result);
    });
}

async function verifyPermission(handle, readWrite = true) {
    const options = { mode: readWrite ? 'readwrite' : 'read' };
    if ((await handle.queryPermission(options)) === 'granted') return true;
    if ((await handle.requestPermission(options)) === 'granted') return true;
    return false;
}

// 1. Select Assets Folder
btnSelectFolder.addEventListener('click', async () => {
    try {
        dirHandle = await window.showDirectoryPicker({
            mode: 'readwrite'
        });
        
        await saveHandle(dirHandle);
        showScrapeUI();
    } catch (err) {
        console.error("Folder selection failed:", err);
        updateStatus("Failed to select folder.", true);
    }
});

btnChangeFolder.addEventListener('click', () => {
    setupSection.classList.remove('hidden');
    scrapeSection.classList.add('hidden');
});

// 2. Scrape Logic
btnScrape.addEventListener('click', async () => {
    if (!dirHandle) {
        updateStatus("Please select assets folder first.", true);
        return;
    }

    updateStatus("Verifying folder access...");
    
    try {
        // Automatically request permission if it was lost
        const hasPermission = await verifyPermission(dirHandle);
        if (!hasPermission) {
            updateStatus("Permission denied. Cannot save files.", true);
            return;
        }

        updateStatus("Scraping page...");
        statusArea.classList.remove('hidden');
        progressFill.style.width = '20%';

        // Get current tab
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        
        if (!tab || !tab.url.includes('temu.com')) {
            updateStatus("Not a Temu page!", true);
            return;
        }

        // Helper to send message and handle connection error
        const sendMessage = (tabId, message) => {
            return new Promise((resolve, reject) => {
                chrome.tabs.sendMessage(tabId, message, (response) => {
                    if (chrome.runtime.lastError) {
                        reject(chrome.runtime.lastError);
                    } else {
                        resolve(response);
                    }
                });
            });
        };

        try {
            let product;
            try {
                product = await sendMessage(tab.id, { action: "scrape" });
            } catch (err) {
                // If connection fails, try injecting the script manually
                updateStatus("Injecting scraper...");
                await chrome.scripting.executeScript({
                    target: { tabId: tab.id },
                    files: ['content.js']
                });
                // Wait a bit for injection
                await new Promise(r => setTimeout(r, 500));
                product = await sendMessage(tab.id, { action: "scrape" });
            }

            if (!product) {
                updateStatus("Could not find product data.", true);
                return;
            }

            const previewUrl = product.imageUrls[0]; // Capture original URL for preview
            progressFill.style.width = '40%';
            updateStatus("Generating files...");
            
            const category = document.getElementById('category-select').value;
            product.category = category;

            // Only add sizes for clothing categories
            const sizeCategories = ['menswear', 'womenswear', 'ethnicwear'];
            if (!sizeCategories.includes(category)) {
                delete product.sizes;
            }
            
            await processScrapedProduct(product);
            
            progressFill.style.width = '100%';
            updateStatus("Scraped successfully!");
            showPreview(product, previewUrl);

        } catch (err) {
            console.error("Scrape error:", err);
            updateStatus(err.message || "Error during scraping.", true);
        }
    } catch (err) {
        console.error("Scrape button error:", err);
        updateStatus("Folder access error. Try re-selecting.", true);
    }
});

async function processScrapedProduct(product) {
    // 1. Save Images
    const imagesFolder = await getOrCreateSubdir(dirHandle, 'images');
    const productImagesFolder = await getOrCreateSubdir(imagesFolder, product.slug);
    
    const finalImagePaths = [];
    for (let i = 0; i < product.imageUrls.length; i++) {
        updateStatus(`Downloading image ${i+1}...`);
        const imgUrl = product.imageUrls[i];
        const blob = await fetch(imgUrl).then(r => r.blob());
        const fileName = `img_${i}.jpg`;
        
        const fileHandle = await productImagesFolder.getFileHandle(fileName, { create: true });
        const writable = await fileHandle.createWritable();
        await writable.write(blob);
        await writable.close();
        
        finalImagePaths.push(`assets/images/${product.slug}/${fileName}`);
    }
    
    // Update product object with local paths
    product.images = finalImagePaths;
    delete product.imageUrls;

    // 2. Update products.json
    updateStatus("Updating products.json...");
    const dataFolder = await getOrCreateSubdir(dirHandle, 'data');
    const jsonFileHandle = await dataFolder.getFileHandle('products.json', { create: true });
    
    // Read existing
    const file = await jsonFileHandle.getFile();
    let content = await file.text();
    let products = [];
    
    try {
        products = JSON.parse(content || '[]');
    } catch (e) {
        products = [];
    }

    // Check if exists, update or append
    const index = products.findIndex(p => p.id === product.id || p.slug === product.slug);
    if (index > -1) {
        products[index] = product;
    } else {
        products.push(product);
    }

    // Write back
    const writable = await jsonFileHandle.createWritable();
    await writable.write(JSON.stringify(products, null, 2));
    await writable.close();
}

async function getOrCreateSubdir(parentHandle, name) {
    return await parentHandle.getDirectoryHandle(name, { create: true });
}

function updateStatus(text, isError = false) {
    statusText.innerText = text;
    statusText.style.color = isError ? 'var(--error)' : 'var(--text-secondary)';
    statusDot.className = isError ? 'dot-red' : 'dot-green';
}

function showScrapeUI() {
    setupSection.classList.add('hidden');
    scrapeSection.classList.remove('hidden');
    folderPathDisplay.innerText = dirHandle.name;
    updateStatus("Connected to " + dirHandle.name);
}

function showPreview(product, previewUrl) {
    previewArea.classList.remove('hidden');
    document.getElementById('preview-img').src = previewUrl; // Use original URL
    document.getElementById('preview-title').innerText = product.title;
    document.getElementById('preview-price').innerText = "₹" + product.discount_price;
}

// Persistence helpers
async function restoreHandle() {
    try {
        const savedHandle = await getHandle();
        if (savedHandle) {
            dirHandle = savedHandle;
            // Always show Scrape UI if we have a handle
            // Permission will be verified/requested on the actual Scrape click
            showScrapeUI();
            updateStatus("Ready (Folder: " + dirHandle.name + ")");
        } else {
            updateStatus("Ready");
        }
    } catch (e) {
        console.error("Restoration error:", e);
        updateStatus("Ready");
    }
}

/**
 * Content script to extract Temu product data.
 * Note: Temu uses dynamic class names, so we use more robust selectors.
 */

function getProductData() {
    try {
        // 1. Title
        const title = document.querySelector('h1')?.innerText ||
            document.querySelector('[class*="title"]')?.innerText ||
            document.title.split('|')[0].trim();

        // 2. Price
        const priceElement = document.querySelector('div[class*="price"], span[class*="price"]');
        let rawPrice = priceElement?.innerText || "0";
        // Extract numeric value
        const price = parseFloat(rawPrice.replace(/[^0-9.]/g, '')) || 0;

        // 3. Description
        const descElement = document.querySelector('[class*="desc"], [class*="detail"], [class*="specification"], #product_description');
        const description = descElement?.innerText ? (descElement.innerText.slice(0, 150) + "...") : `Premium ${title} details.`;

        // 4. Images
        // Temu usually has main images in a carousel or specific container
        const imgElements = Array.from(document.querySelectorAll('img')).filter(img => {
            const src = img.src;
            return src.includes('goods') || (img.width > 300 && img.height > 300);
        });

        const images = [...new Set(imgElements.map(img => img.src))].slice(0, 3);

        // 5. Product ID (from URL or DOM)
        const urlParams = new URLSearchParams(window.location.search);
        const productId = urlParams.get('goods_id') || "p_" + Date.now();

        // 6. Slug
        const slug = title.toLowerCase()
            .replace(/[^a-z0-9 ]/g, '')
            .replace(/\s+/g, '-')
            .slice(0, 50);

        const shortDesc = `Stylish ${title} available at ModernLinks.`;
        return {
            id: productId,
            title: title,
            slug: slug,
            description: shortDesc,
            long_description: shortDesc,
            price: 1300, // Default price as seen in your example
            discount_price: (() => {
                const possible = [99, 109, 119, 129, 139, 149, 159, 169, 179, 189, 199];
                return possible[Math.floor(Math.random() * possible.length)];
            })(),
            imageUrls: images,
            sizes: ["S", "M", "L", "XL"],
            reviews: [],
            stock: 100
        };
    } catch (e) {
        console.error("Scraper Error:", e);
        return null;
    }
}

// Listen for messages from popup
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === "scrape") {
        const data = getProductData();
        sendResponse(data);
    }
    return true;
});

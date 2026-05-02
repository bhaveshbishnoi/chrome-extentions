/**
 * Content script for Alibaba Scraper Pro
 * Uses window.detailData for robust extraction
 */

function getProductData() {
    try {
        console.log("Alibaba Scraper: Starting extraction...");

        // 1. Try to get data from embedded script tags (window.detailData)
        let detailData = null;
        const scripts = Array.from(document.querySelectorAll('script'));
        for (const script of scripts) {
            const content = script.innerText;
            if (content.includes('window.detailData') || content.includes('window.__detailData__')) {
                // Find start of JSON object
                const startIdx = content.indexOf('{');
                const endIdx = content.lastIndexOf('}');
                if (startIdx !== -1 && endIdx !== -1 && endIdx > startIdx) {
                    try {
                        const jsonStr = content.substring(startIdx, endIdx + 1);
                        detailData = JSON.parse(jsonStr);
                        console.log("Alibaba Scraper: Found detailData via substring extraction");
                        break;
                    } catch (e) {
                        // Fallback to regex if substring fails
                        const match = content.match(/window\.(?:__)?detailData\s*=\s*({.*?});/s) || 
                                      content.match(/window\.(?:__)?detailData\s*=\s*({.*})/s);
                        if (match && match[1]) {
                            try {
                                detailData = JSON.parse(match[1]);
                                console.log("Alibaba Scraper: Found detailData via regex");
                                break;
                            } catch (e2) { }
                        }
                    }
                }
            }
        }

        // 2. Title
        const title = detailData?.globalData?.product?.title ||
            detailData?.product?.title ||
            document.querySelector('h1')?.innerText ||
            document.querySelector('.product-title')?.innerText ||
            document.title.replace(' - Alibaba.com', '');

        // 3. Extract Price
        function parsePrice(str) {
            if (!str) return 0;
            const match = str.match(/[\d,.]+/);
            if (!match) return 0;
            return parseFloat(match[0].replace(/,/g, '')) || 0;
        }

        const priceStr = detailData?.globalData?.productPrice?.priceStr ||
            detailData?.globalData?.productPrice?.fobPrice ||
            detailData?.product?.price?.priceStr ||
            document.querySelector('.ma-ref-price, .promotion-price, [class*="price"]')?.innerText;

        let discountPrice = parsePrice(priceStr);

        // 4. Extract Images (Robust approach)
        let imageUrls = [];

        // Specific gallery items check
        if (detailData?.globalData?.product?.mediaItems) {
            detailData.globalData.product.mediaItems.forEach(item => {
                if (item.type === 'image' && item.imageUrl) {
                    const url = item.imageUrl.big || item.imageUrl.normal || item.imageUrl.url;
                    if (url) imageUrls.push(url);
                }
            });
        } else if (detailData?.product?.mediaItems) {
            detailData.product.mediaItems.forEach(item => {
                if (item.type === 'image' && item.imageUrl) {
                    const url = item.imageUrl.big || item.imageUrl.normal || item.imageUrl.url;
                    if (url) imageUrls.push(url);
                }
            });
        }

        // Recursive search for anything that looks like a product image URL in the JSON
        function findImages(obj) {
            if (!obj || typeof obj !== 'object') return;
            for (let key in obj) {
                const val = obj[key];
                if (typeof val === 'string' && (val.includes('alicdn.com') || val.includes('alibaba.com')) && (val.includes('.jpg') || val.includes('.png'))) {
                    // Check if it's a "big" image (not a tiny icon)
                    if (!val.includes('_50x50') && !val.includes('_100x100') && !val.includes('_64x64')) {
                        imageUrls.push(val);
                    }
                } else if (typeof val === 'object') {
                    findImages(val);
                }
            }
        }

        if (imageUrls.length === 0 && detailData) {
            findImages(detailData);
        }

        // Fallback or secondary source from DOM
        const domImages = Array.from(document.querySelectorAll('.main-image, .image-list img, .gallery-image img, .m-gallery-product-item-v2 img'))
            .map(img => img.src)
            .filter(src => src && src.includes('alicdn.com'));

        imageUrls = [...imageUrls, ...domImages];

        // Clean and Deduplicate
        imageUrls = imageUrls.map(url => {
            if (url.startsWith('//')) return 'https:' + url;
            return url;
        });

        imageUrls = [...new Set(imageUrls)].filter(url => !url.includes('.gif')).slice(0, 5);

        // 5. Product ID
        const productId = detailData?.globalData?.product?.productId ||
            detailData?.product?.id ||
            window.location.pathname.match(/_(\d+)\.html/)?.[1] ||
            "ali_" + Date.now();

        // 6. Slug
        const slug = title.toLowerCase()
            .replace(/[^a-z0-9 ]/g, '')
            .replace(/\s+/g, '-')
            .slice(0, 50);

        const shortDesc = detailData?.globalData?.product?.description || 
                          detailData?.product?.description || 
                          `Premium ${title} from Alibaba.`;

        const generatePrice = (min, max) => {
            const minUnit = Math.ceil(min / 10);
            const maxUnit = Math.floor(max / 10);
            return Math.floor(Math.random() * (maxUnit - minUnit + 1) + minUnit) * 10 + 9;
        };

        const finalDiscountPrice = generatePrice(99, 199);
        const originalPrice = generatePrice(899, 3399);

        return {
            id: productId,
            title: title,
            slug: slug,
            description: shortDesc.slice(0, 150) + "...",
            long_description: shortDesc,
            price: originalPrice,
            discount_price: finalDiscountPrice,
            imageUrls: imageUrls,
            sizes: ["S", "M", "L", "XL", "XXL"],
            reviews: [],
            stock: 1000,
            category: "electronics" // Default, will be overridden by popup
        };
    } catch (e) {
        console.error("Alibaba Scraper Error:", e);
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

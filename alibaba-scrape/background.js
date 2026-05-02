// Background script to proxy image fetches and bypass CORS issues
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === "fetch_image") {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 12000); // 12s timeout

        fetch(request.url, { signal: controller.signal })
            .then(response => {
                clearTimeout(timeoutId);
                if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
                return response.blob();
            })
            .then(blob => {
                const reader = new FileReader();
                reader.onloadend = () => {
                    if (reader.result) {
                        sendResponse({ dataUrl: reader.result });
                    } else {
                        sendResponse({ error: "Empty result from reader" });
                    }
                };
                reader.onerror = () => sendResponse({ error: "FileReader error" });
                reader.readAsDataURL(blob);
            })
            .catch(error => {
                clearTimeout(timeoutId);
                console.error("Background fetch error:", error);
                sendResponse({ error: error.message || "Fetch failed" });
            });
        return true; // Keep message channel open
    }
});

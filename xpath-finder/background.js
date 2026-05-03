chrome.runtime.onInstalled.addListener(() => {
  console.log('XPath Finder Pro installed');
  chrome.storage.local.set({ enabled: false }); // Default to OFF
});

// Listen for messages from content scripts or popup
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'getState') {
    chrome.storage.local.get('enabled', (data) => {
      sendResponse({ enabled: !!data.enabled });
    });
    return true; // Keep channel open for async response
  }
});

const toggle = document.getElementById('enable-toggle');

// Load current state
chrome.storage.local.get('enabled', (data) => {
  toggle.checked = data.enabled !== false;
});

// Update state on change
toggle.addEventListener('change', () => {
  const enabled = toggle.checked;
  chrome.storage.local.set({ enabled });
});

const extractBtn = document.getElementById("extract");
const exportBtn = document.getElementById("export");
const clearBtn = document.getElementById("clear");
const status = document.getElementById("status");
const recordCountEl = document.getElementById("recordCount");
const dataBody = document.getElementById("dataBody");

// Update UI on load
document.addEventListener("DOMContentLoaded", updateUI);

async function updateUI() {
  const { profiles = [] } = await chrome.storage.local.get("profiles");
  recordCountEl.innerText = `Total Records: ${profiles.length}`;

  dataBody.innerHTML = "";
  if (profiles.length === 0) {
    dataBody.innerHTML = '<tr><td colspan="3" class="no-data">No data saved yet</td></tr>';
    return;
  }

  profiles.forEach(p => {
    const tr = document.createElement("tr");
    const email = p.emails.join(", ") || "N/A";
    const phone = p.phones.join(", ") || "N/A";
    tr.innerHTML = `
      <td style="font-weight:600">${p.name}</td>
      <td class="contact-cell" title="${email}">${email}</td>
      <td class="contact-cell" title="${phone}">${phone}</td>
      <td><a href="${p.profileUrl}" target="_blank" class="icon-link">🔗</a></td>
    `;
    dataBody.appendChild(tr);
  });
}

function showStatus(msg, type = "normal") {
  status.innerText = msg;
  status.className = `status ${type}`;
  if (type === "success") {
    setTimeout(() => showStatus("Ready", "normal"), 3000);
  }
}

extractBtn.addEventListener("click", async () => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

  if (!tab.url.includes("linkedin.com/in/")) {
    showStatus("Please go to a LinkedIn Profile", "loading");
    return;
  }

  showStatus("Scrolling and extracting...", "loading");

  chrome.tabs.sendMessage(tab.id, { type: "EXTRACT_PROFILE" }, async (response) => {
    if (chrome.runtime.lastError) {
      console.error(chrome.runtime.lastError);
      showStatus("Error: Refresh page and try again", "loading");
      return;
    }

    if (!response) {
      showStatus("Failed to extract data", "loading");
      return;
    }

    const { profiles = [] } = await chrome.storage.local.get("profiles");

    // Remove duplicates based on profile URL
    const existingIndex = profiles.findIndex(p => p.profileUrl === response.profileUrl);
    let updated;

    if (existingIndex !== -1) {
      // Update existing record and move to TOP
      profiles.splice(existingIndex, 1);
    }
    updated = [response, ...profiles];

    await chrome.storage.local.set({ profiles: updated });

    showStatus("Successfully Saved!", "success");
    updateUI();
  });
});

exportBtn.addEventListener("click", async () => {
  const { profiles = [] } = await chrome.storage.local.get("profiles");

  if (!profiles.length) {
    showStatus("No data to export", "loading");
    return;
  }

  const csvRows = [
    ["name", "email", "phone", "link of profile"]
  ];

  profiles.forEach((p) => {
    csvRows.push([
      `"${p.name.replace(/"/g, '""')}"`,
      `"${p.emails.join(" | ")}"`,
      `"${p.phones.join(" | ")}"`,
      `"${p.profileUrl}"`
    ]);
  });

  const csvContent = "\uFEFF" + csvRows.map(e => e.join(",")).join("\n");
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);

  const link = document.createElement("a");
  link.setAttribute("href", url);
  link.setAttribute("download", `linkedin_contacts_${new Date().toISOString().slice(0, 10)}.csv`);
  link.style.visibility = 'hidden';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);

  showStatus("CSV Exported!", "success");
});

clearBtn.addEventListener("click", async () => {
  if (confirm("Are you sure you want to clear all stored data?")) {
    await chrome.storage.local.remove("profiles");
    showStatus("Data Cleared", "success");
    updateUI();
  }
});

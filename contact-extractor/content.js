/**
 * Extracts contact details (email, phone) from a given text.
 */
function extractContactFromText(text) {
  // Regex for emails (basic + patterns like [at] [dot])
  const emailRegex = /[a-zA-Z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/gi;
  const emails = text.match(emailRegex) || [];

  // Regex for phone numbers (Common international and India-specific formats)
  const phoneRegex = /(\+?\d{1,3}[-.\s]?)?[6-9]\d{9}/g;
  const phones = text.match(phoneRegex) || [];

  return { emails: [...new Set(emails)], phones: [...new Set(phones)] };
}

/**
 * Scans all visible posts and comments on the profile for contact info.
 */
function extractPostsAndCommentsData() {
  const posts = document.querySelectorAll("div.feed-shared-update-v2, .occludable-update");
  const comments = document.querySelectorAll(".comments-comment-item, .comments-comment-item__main-content");

  let emails = new Set();
  let phones = new Set();

  // Expand "See more" buttons if any
  document.querySelectorAll("button[aria-label='See more'], .feed-shared-inline-show-more-text__button").forEach(btn => btn.click());

  [...posts, ...comments].forEach((el) => {
    const text = el.innerText;
    const result = extractContactFromText(text);
    result.emails.forEach(e => emails.add(e));
    result.phones.forEach(p => phones.add(p));
  });

  return {
    emails: Array.from(emails),
    phones: Array.from(phones)
  };
}

/**
 * Main extraction function.
 */
async function extractProfileData() {
  const nameElement = document.querySelector("h1.text-heading-xlarge") || document.querySelector("h1");
  const name = nameElement ? nameElement.innerText.trim() : "Unknown";
  const profileUrl = window.location.href;

  // Auto-scroll to load more posts/content
  await autoScroll();

  // Scan whole page text
  const pageText = document.body.innerText;
  const pageContacts = extractContactFromText(pageText);

  // Scan posts and comments specifically
  const postContacts = extractPostsAndCommentsData();

  // Merge and deduplicate
  const allEmails = [...new Set([...pageContacts.emails, ...postContacts.emails])];
  const allPhones = [...new Set([...pageContacts.phones, ...postContacts.phones])];

  return {
    name,
    profileUrl,
    emails: allEmails,
    phones: allPhones,
    timestamp: Date.now()
  };
}

/**
 * Helper to auto-scroll and load lazy content.
 */
async function autoScroll() {
  let totalHeight = 0;
  const distance = 500;
  const maxScroll = 2000; // Limit scroll to avoid infinite loops or too much data

  while (totalHeight < maxScroll && totalHeight < document.body.scrollHeight) {
    window.scrollBy(0, distance);
    totalHeight += distance;
    await new Promise(resolve => setTimeout(resolve, 800)); // Wait for content to load
  }
}

// Listen for messages from popup
chrome.runtime.onMessage.addListener((req, sender, sendResponse) => {
  if (req.type === "EXTRACT_PROFILE") {
    extractProfileData().then(data => {
      sendResponse(data);
    }).catch(err => {
      console.error("Extraction error:", err);
      sendResponse(null);
    });
    return true; // Keep channel open for async response
  }
});

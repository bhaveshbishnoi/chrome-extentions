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
  return { emails: Array.from(emails), phones: Array.from(phones) };
}

/**
 * Main extraction function.
 */
async function extractProfileData() {
  // 1. ROBUST NAME EXTRACTION (with title fallback)
  const nameSelectors = [
    "h1.text-heading-xlarge",
    "main h1",
    ".pv-top-card--list:first-child li:first-child",
    ".text-heading-xlarge",
    ".top-card-layout__title",
    "main .artdeco-card .t-24",
    ".pv-top-card-section__name"
  ];

  let name = "";
  for (const selector of nameSelectors) {
    const el = document.querySelector(selector);
    if (el && el.innerText.trim()) {
      name = el.innerText.trim().split('\n')[0];
      break;
    }
  }

  // Fallback to page title if still unknown
  if (!name || name.toLowerCase() === "unknown") {
    const title = document.title;
    if (title && title.includes("|")) {
      name = title.split("|")[0].trim();
    } else if (title) {
      name = title.replace(/\([^)]*\)/g, "").trim(); // Remove (X notifications) etc
    }
  }

  if (!name) name = "Unknown";

  const profileUrl = window.location.href;
  let modalEmails = [];
  let modalPhones = [];

  // 2. CONTACT MODAL EXTRACTION
  const contactInfoLink = document.querySelector("#top-card-text-details-contact-info") ||
                          document.querySelector('a[href*="/overlay/contact-info/"]') ||
                          document.querySelector('a[data-control-name="contact_see_more"]');

  if (contactInfoLink || window.location.href.includes('/overlay/contact-info/')) {
    if (contactInfoLink && !window.location.href.includes('/overlay/contact-info/')) {
      contactInfoLink.click();
    }
    await new Promise(resolve => setTimeout(resolve, 2500));

    // Scan modal content thoroughly
    const modal = document.querySelector(".pv-contact-info") ||
                  document.querySelector(".artdeco-modal") ||
                  document.querySelector("#artdeco-modal-outlet");

    if (modal) {
      const modalContacts = extractContactFromText(modal.innerText);
      modalEmails.push(...modalContacts.emails);
      modalPhones.push(...modalContacts.phones);

      // Targeted modal links
      modal.querySelectorAll('a[href^="mailto:"], .pv-contact-info__contact-link').forEach(a => {
        const text = a.innerText || a.href;
        const res = extractContactFromText(text);
        modalEmails.push(...res.emails);
      });

      const closeBtn = document.querySelector('button[aria-label="Dismiss"]') || document.querySelector('.artdeco-modal__dismiss');
      if (closeBtn) closeBtn.click();
      await new Promise(resolve => setTimeout(resolve, 500));
    }
  }

  // 3. SCROLL & SCAN POSTS/COMMENTS
  await autoScroll();

  // Scans visible text plus specific post items
  const pageContacts = extractContactFromText(document.body.innerText);
  const postContacts = extractPostsAndCommentsData();

  // Merge and deduplicate
  const allEmails = [...new Set([...modalEmails, ...pageContacts.emails, ...postContacts.emails])];
  const allPhones = [...new Set([...modalPhones, ...pageContacts.phones, ...postContacts.phones])];

  // Force close any stuck modals
  document.querySelectorAll('button[aria-label="Dismiss"]').forEach(b => b.click());

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
  const maxScroll = 1500; // Reduced for faster extraction

  while (totalHeight < maxScroll && totalHeight < document.body.scrollHeight) {
    window.scrollBy(0, distance);
    totalHeight += distance;
    await new Promise(resolve => setTimeout(resolve, 600)); 
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

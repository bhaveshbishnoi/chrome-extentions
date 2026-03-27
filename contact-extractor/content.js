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
  // 1. IMPROVED NAME SELECTORS
  const nameSelectors = [
    "h1.text-heading-xlarge",
    ".pv-top-card--list:first-child li:first-child",
    "h1",
    ".text-heading-xlarge",
    "main .artdeco-card .t-24",
    ".pv-top-card-section__name",
    ".top-card-layout__title"
  ];
  
  let name = "Unknown";
  for (const selector of nameSelectors) {
    const el = document.querySelector(selector);
    if (el && el.innerText.trim()) {
      name = el.innerText.trim().split('\n')[0];
      break;
    }
  }
  
  const profileUrl = window.location.href;
  let modalEmails = [];
  let modalPhones = [];

  // 2. ROBUST CONTACT INFO EXTRACTION
  const contactInfoLink = document.querySelector("#top-card-text-details-contact-info") || 
                          document.querySelector('a[href*="/overlay/contact-info/"]') ||
                          document.querySelector('a[data-control-name="contact_see_more"]') ||
                          Array.from(document.querySelectorAll('a')).find(a => a.innerText.toLowerCase().includes('contact info'));

  if (contactInfoLink || window.location.href.includes('/overlay/contact-info/')) {
    console.log("Contact info detected...");
    if (contactInfoLink && !window.location.href.includes('/overlay/contact-info/')) {
      contactInfoLink.click();
    }
    
    // Wait for modal components to load
    await new Promise(resolve => setTimeout(resolve, 2500));
    
    const modal = document.querySelector(".pv-contact-info") || 
                  document.querySelector(".artdeco-modal") ||
                  document.querySelector(".pv-profile-section") ||
                  document.querySelector("#artdeco-modal-outlet");
    
    if (modal) {
      console.log("Modal found, extracting data...");
      
      // Targeted extraction from modal - Email
      const emailSelectors = [
        '.pv-contact-info__contact-type--email .pv-contact-info__contact-item',
        'a[href^="mailto:"]',
        '.pv-contact-info__contact-link[href^="mailto:"]'
      ];
      emailSelectors.forEach(sel => {
        modal.querySelectorAll(sel).forEach(item => {
          const text = item.innerText || item.getAttribute('href').replace('mailto:', '');
          const match = text.match(/[a-zA-Z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/gi);
          if (match) modalEmails.push(...match);
        });
      });

      // Targeted extraction from modal - Phone
      const phoneSelectors = [
        '.pv-contact-info__contact-type--phone .pv-contact-info__contact-item',
        '.pv-contact-info__contact-type--phone span'
      ];
      phoneSelectors.forEach(sel => {
        modal.querySelectorAll(sel).forEach(item => {
          const text = item.innerText;
          const match = text.match(/(\+?\d{1,3}[-.\s]?)?[6-9]\d{9}/g);
          if (match) modalPhones.push(...match);
        });
      });

      // Fallback: general regex on modal text
      const modalContacts = extractContactFromText(modal.innerText);
      modalEmails.push(...modalContacts.emails);
      modalPhones.push(...modalContacts.phones);
      
      // Close modal
      const closeBtn = document.querySelector('button[aria-label="Dismiss"]') || 
                       document.querySelector('.artdeco-modal__dismiss') ||
                       document.querySelector('.close-modal');
      if (closeBtn) closeBtn.click();
      await new Promise(resolve => setTimeout(resolve, 500));
    }
  }

  // 3. AUTO-SCROLL & PAGE SCAN
  await autoScroll();
  const pageContacts = extractContactFromText(document.body.innerText);
  const postContacts = extractPostsAndCommentsData();

  // Merge and deduplicate
  const allEmails = [...new Set([...modalEmails, ...pageContacts.emails, ...postContacts.emails])];
  const allPhones = [...new Set([...modalPhones, ...pageContacts.phones, ...postContacts.phones])];

  // Final check to close any open modal
  const finalCloseBtn = document.querySelector('button[aria-label="Dismiss"]') || document.querySelector('.artdeco-modal__dismiss');
  if (finalCloseBtn) finalCloseBtn.click();

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

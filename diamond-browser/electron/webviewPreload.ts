/**
 * Diamond Webview Preload — Layer 4 (DOM Content Scanner)
 * 
 * This script is injected into every <webview> guest page.
 * It inspects the rendered DOM for signals that indicate adult or
 * inappropriate content that slipped past DNS and URL filters.
 * 
 * What it scans:
 *   1. RTA (Restricted To Adults) meta tags — industry standard
 *   2. Generic rating meta tags (adult, mature, restricted)
 *   3. OpenGraph age restriction tags
 *   4. Page title and heading keyword density
 *   5. Body text content sampling for explicit keyword clusters
 */

import { ipcRenderer } from 'electron';

// ─── Explicit keyword set for content scanning ──────────────────

const CONTENT_KEYWORDS = new Set([
  'porn', 'porno', 'pornography', 'xxx', 'nsfw', 'hentai',
  'erotic', 'erotica', 'nude', 'nudes', 'naked', 'nudity',
  'sex video', 'sex tape', 'adult video', 'adult content',
  'camgirl', 'cam girl', 'webcam sex', 'live sex',
  'escort service', 'escorts', 'call girls',
  'strip club', 'stripper', 'striptease',
  'onlyfans', 'fansly', 'manyvids',
]);

// Single-word high-confidence tokens
const HIGH_CONFIDENCE_TOKENS = new Set([
  'porn', 'porno', 'xxx', 'hentai', 'nsfw', 'camgirl',
]);

// ─── Scanner Functions ──────────────────────────────────────────

function checkMetaTags(): { flagged: boolean; reason: string } | null {
  const metaTags = document.querySelectorAll('meta');

  for (const meta of metaTags) {
    const name = (meta.getAttribute('name') || '').toLowerCase();
    const httpEquiv = (meta.getAttribute('http-equiv') || '').toLowerCase();
    const property = (meta.getAttribute('property') || '').toLowerCase();
    const content = (meta.getAttribute('content') || '').toLowerCase();

    // 1. RTA (Restricted To Adults) — standard across adult industry
    if (name === 'rating' && content.includes('rta')) {
      return {
        flagged: true,
        reason: 'Page contains RTA (Restricted To Adults) meta tag — an industry-standard marker for adult content.',
      };
    }

    // 2. Generic rating meta tags
    if (name === 'rating' || httpEquiv === 'rating') {
      if (['adult', 'mature', 'restricted', '18+', 'rta-5042'].some(v => content.includes(v))) {
        return {
          flagged: true,
          reason: `Page declares itself as "${content}" via rating meta tag.`,
        };
      }
    }

    // 3. OpenGraph age restriction
    if (property === 'og:restrictions:age' || property === 'og:restriction:age') {
      if (content.includes('18') || content.includes('21') || content.includes('adult')) {
        return {
          flagged: true,
          reason: `Page declares age restriction (${content}) via OpenGraph meta tag.`,
        };
      }
    }

    // 4. Content-type or description containing explicit terms
    if (name === 'description' || name === 'keywords' || property === 'og:description') {
      for (const keyword of HIGH_CONFIDENCE_TOKENS) {
        if (content.includes(keyword)) {
          return {
            flagged: true,
            reason: `Page meta ${name || property} contains explicit keyword "${keyword}".`,
          };
        }
      }
    }
  }

  return null;
}

function checkTitleAndHeadings(): { flagged: boolean; reason: string } | null {
  // Check document title
  const title = (document.title || '').toLowerCase();
  for (const keyword of HIGH_CONFIDENCE_TOKENS) {
    if (title.includes(keyword)) {
      return {
        flagged: true,
        reason: `Page title contains explicit keyword "${keyword}".`,
      };
    }
  }

  // Check h1-h3 headings (require multiple or high-confidence title match)
  const headings = document.querySelectorAll('h1, h2, h3');
  let flagCount = 0;
  for (const heading of headings) {
    const text = (heading.textContent || '').toLowerCase();
    for (const keyword of HIGH_CONFIDENCE_TOKENS) {
      // Use word boundary to avoid matching inside safe words
      const regex = new RegExp(`\\b${keyword}\\b`, 'i');
      if (regex.test(text)) {
        // Skip single "nsfw" tag on social/discussion sites
        if (keyword === 'nsfw') continue;
        flagCount++;
        if (flagCount >= 2) {
          return {
            flagged: true,
            reason: `Multiple page headings contain explicit keyword "${keyword}".`,
          };
        }
      }
    }
  }

  return null;
}

function checkBodyContent(): { flagged: boolean; reason: string } | null {
  // Sample body text (first 5000 chars to stay fast)
  const bodyText = (document.body?.innerText || '').toLowerCase().slice(0, 5000);
  if (!bodyText || bodyText.length < 50) return null;

  // Count how many distinct explicit keywords appear with word boundaries
  let matchCount = 0;
  const matchedKeywords: string[] = [];

  for (const keyword of CONTENT_KEYWORDS) {
    const regex = new RegExp(`\\b${keyword}\\b`, 'i');
    if (regex.test(bodyText)) {
      matchCount++;
      matchedKeywords.push(keyword);
    }
  }

  // Require at least 5 distinct explicit keywords to prevent false positives on social media or forums
  if (matchCount >= 5) {
    return {
      flagged: true,
      reason: `Page body content contains ${matchCount} explicit keywords: ${matchedKeywords.slice(0, 5).join(', ')}.`,
    };
  }

  return null;
}

// ─── Main Scanner Execution ─────────────────────────────────────

function runContentScan(): void {
  try {
    // 1. Check meta tags (most reliable signal)
    const metaResult = checkMetaTags();
    if (metaResult?.flagged) {
      ipcRenderer.sendToHost('content-flagged', {
        url: window.location.href,
        category: 'Inappropriate Page Content',
        reason: metaResult.reason,
        layer: 'content-scan',
      });
      return;
    }

    // 2. Check title and headings
    const titleResult = checkTitleAndHeadings();
    if (titleResult?.flagged) {
      ipcRenderer.sendToHost('content-flagged', {
        url: window.location.href,
        category: 'Inappropriate Page Content',
        reason: titleResult.reason,
        layer: 'content-scan',
      });
      return;
    }

    // 3. Check body content (only after page has settled)
    const bodyResult = checkBodyContent();
    if (bodyResult?.flagged) {
      ipcRenderer.sendToHost('content-flagged', {
        url: window.location.href,
        category: 'Inappropriate Page Content',
        reason: bodyResult.reason,
        layer: 'content-scan',
      });
      return;
    }
  } catch (error) {
    // Don't crash the page if scanner fails
    console.warn('[Diamond Scanner] Error during content scan:', error);
  }
}

// Run on DOMContentLoaded (meta tags and headings available)
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    // Small delay to let dynamic content render
    setTimeout(runContentScan, 300);
  });
} else {
  setTimeout(runContentScan, 300);
}

// Run again on full page load (for SPAs that render late)
window.addEventListener('load', () => {
  setTimeout(runContentScan, 800);
});

// Expose safe API for blocked.html to request parental access
import { contextBridge, webFrame } from 'electron';

// Spoof navigator properties in the main world before Google's scripts run
try {
  webFrame.executeJavaScript(`
    try {
      Object.defineProperty(navigator, 'webdriver', { get: () => false });
      if (navigator.userAgentData) {
        Object.defineProperty(navigator.userAgentData, 'brands', {
          get: () => [
            { brand: 'Not_A Brand', version: '8' },
            { brand: 'Chromium', version: '130' },
            { brand: 'Google Chrome', version: '130' }
          ]
        });
      }
    } catch (e) {}
  `);
} catch (e) {}

try {
  contextBridge.exposeInMainWorld('electronAPI', {
    requestAccess: (url: string, category?: string) => {
      ipcRenderer.sendToHost('request-access', { url, category });
    },
    goBackToSafety: () => {
      ipcRenderer.sendToHost('go-back-to-safety', {});
    },
  });
} catch (e) {
  // Fallback for non-isolated contexts (though contextIsolation is enabled)
  (window as any).electronAPI = {
    requestAccess: (url: string, category?: string) => {
      ipcRenderer.sendToHost('request-access', { url, category });
    },
    goBackToSafety: () => {
      ipcRenderer.sendToHost('go-back-to-safety', {});
    },
  };
}

/**
 * Diamond Webview Preload — Layer 4 + Layer 5 Content Protection
 * 
 * This script is injected into every <webview> guest page.
 * It provides two advanced protection layers that run in real-time:
 * 
 * ┌──────────────────────────────────────────────────────────────┐
 * │  LAYER 4: Real-Time DOM Text Scanner (MutationObserver)     │
 * │  ─ Watches the DOM for suggestive/explicit text in titles,  │
 * │    headings, descriptions, and comments                     │
 * │  ─ Redacts individual elements instead of blocking pages    │
 * │  ─ Debounced for performance on infinite-scroll sites       │
 * │  ─ Expanded suggestive phrase dictionary                    │
 * │                                                             │
 * │  LAYER 5: On-Device ML Image Analysis (nsfwjs)              │
 * │  ─ Scans visible images using IntersectionObserver          │
 * │  ─ Uses MobileNetV2 nsfwjs model (lightweight, ~3MB)       │
 * │  ─ Blurs suggestive/explicit images before child sees them  │
 * │  ─ LRU cache (500 items) prevents memory leaks             │
 * │  ─ Concurrent scan limiting prevents CPU overload           │
 * └──────────────────────────────────────────────────────────────┘
 * 
 * Also retains original Layer 4 capabilities:
 *   - RTA meta tag detection
 *   - Rating meta tag detection
 *   - OpenGraph age restriction detection
 *   - Title/heading keyword density analysis
 *   - Body text content sampling
 */

import { ipcRenderer, contextBridge, webFrame } from 'electron';
import * as tf from '@tensorflow/tfjs';
import * as nsfwjs from 'nsfwjs';
import {
  EXPLICIT_KEYWORDS,
  DRUG_KEYWORDS,
  VIOLENCE_KEYWORDS,
  SELF_HARM_KEYWORDS,
  CRIME_KEYWORDS,
  HATE_KEYWORDS,
  GAMBLING_TOKENS,
  SUGGESTIVE_PHRASES,
  YOUTUBE_TITLE_PATTERNS,
  YOUTUBE_CARD_SELECTORS,
  HIGH_CONFIDENCE_TOKENS,
  IMAGE_CONFIG,
  DIAMOND_CSS,
} from '../src/shieldDictionary';

// Destructure image config for convenience
const {
  minWidth: MIN_IMAGE_WIDTH,
  minHeight: MIN_IMAGE_HEIGHT,
  thresholds: NSFW_THRESHOLDS,
  cacheMaxSize: IMAGE_CACHE_MAX_SIZE,
  maxConcurrentScans: MAX_CONCURRENT_SCANS,
  scanDebounceMs: SCAN_DEBOUNCE_MS,
} = IMAGE_CONFIG;

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// UTILITY: LRU Cache for image scan results
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

class LRUCache<K, V> {
  private cache = new Map<K, V>();
  constructor(private maxSize: number) {}

  get(key: K): V | undefined {
    if (!this.cache.has(key)) return undefined;
    // Move to end (most recently used)
    const value = this.cache.get(key)!;
    this.cache.delete(key);
    this.cache.set(key, value);
    return value;
  }

  set(key: K, value: V): void {
    if (this.cache.has(key)) {
      this.cache.delete(key);
    } else if (this.cache.size >= this.maxSize) {
      // Delete the oldest (first) entry
      const firstKey = this.cache.keys().next().value;
      if (firstKey !== undefined) {
        this.cache.delete(firstKey);
      }
    }
    this.cache.set(key, value);
  }

  has(key: K): boolean {
    return this.cache.has(key);
  }

  get size(): number {
    return this.cache.size;
  }
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// INJECT DIAMOND STYLES
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function injectDiamondStyles(): void {
  const style = document.createElement('style');
  style.id = 'diamond-shield-styles';
  style.textContent = `
    .${DIAMOND_CSS.blurredImage} {
      filter: blur(40px) brightness(0.5) !important;
      pointer-events: none !important;
      user-select: none !important;
      transition: filter 0.3s ease !important;
    }
    .${DIAMOND_CSS.hiddenElement} {
      display: none !important;
    }
    .${DIAMOND_CSS.redactedText} {
      filter: blur(4px) !important;
      background-color: #555 !important;
      color: transparent !important;
      pointer-events: none !important;
      user-select: none !important;
      position: relative !important;
      border-radius: 4px !important;
    }
    .${DIAMOND_CSS.redactedText}::after {
      content: '🛡️ Hidden' !important;
      position: absolute !important;
      top: 50% !important;
      left: 50% !important;
      transform: translate(-50%, -50%) !important;
      font-size: 11px !important;
      color: #666 !important;
      background: rgba(0,0,0,0.05) !important;
      padding: 2px 8px !important;
      border-radius: 4px !important;
      white-space: nowrap !important;
      z-index: 10 !important;
    }
    .${DIAMOND_CSS.scanning} {
      opacity: 0 !important;
      transition: opacity 0.2s ease !important;
    }
  `;
  if (document.head) {
    document.head.appendChild(style);
  } else {
    document.addEventListener('DOMContentLoaded', () => {
      document.head?.appendChild(style);
    });
  }
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// LAYER 4: REAL-TIME DOM TEXT SCANNER
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

// Build a single regex from all suggestive phrases for fast matching
const suggestiveRegex = new RegExp(
  '\\b(' + SUGGESTIVE_PHRASES.map(p => p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|') + ')\\b',
  'i'
);

// Combine all explicit and harmful keywords into one massive blocklist
const ALL_RESTRICTED_KEYWORDS = new Set([
  ...EXPLICIT_KEYWORDS,
  ...DRUG_KEYWORDS,
  ...VIOLENCE_KEYWORDS,
  ...SELF_HARM_KEYWORDS,
  ...CRIME_KEYWORDS,
  ...HATE_KEYWORDS,
  ...GAMBLING_TOKENS
]);

const explicitRegex = new RegExp(
  '\\b(' + Array.from(ALL_RESTRICTED_KEYWORDS).map(k => k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|') + ')\\b',
  'i'
);

const youtubePatternRegex = new RegExp(
  '(' + YOUTUBE_TITLE_PATTERNS.map(p => p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|') + ')',
  'i'
);

/** Track elements we've already scanned to avoid double-processing */
const scannedElements = new WeakSet<Element>();

/**
 * Check a text element for inappropriate content.
 * Returns the matched phrase if found, null otherwise.
 */
function checkTextContent(text: string): { match: string; severity: 'explicit' | 'suggestive' } | null {
  if (!text || text.length < 3) return null;
  const lower = text.toLowerCase();

  // Check explicit keywords first (highest priority)
  const explicitMatch = lower.match(explicitRegex);
  if (explicitMatch) {
    return { match: explicitMatch[0], severity: 'explicit' };
  }

  // Check suggestive phrases
  const suggestiveMatch = lower.match(suggestiveRegex);
  if (suggestiveMatch) {
    return { match: suggestiveMatch[0], severity: 'suggestive' };
  }

  // Check YouTube-specific patterns
  const isYouTube = window.location.hostname.includes('youtube.com') || window.location.hostname.includes('youtu.be');
  if (isYouTube) {
    const ytMatch = lower.match(youtubePatternRegex);
    if (ytMatch) {
      return { match: ytMatch[0], severity: 'suggestive' };
    }
  }

  return null;
}

/**
 * Find the closest "card" parent element on YouTube.
 * Hiding the card removes the thumbnail + title + metadata together.
 */
function findYouTubeCardParent(element: Element): Element | null {
  let current: Element | null = element;
  while (current) {
    for (const selector of YOUTUBE_CARD_SELECTORS) {
      if (current.matches(selector)) {
        return current;
      }
    }
    current = current.parentElement;
  }
  return null;
}

/**
 * Scan a single element's text and redact if inappropriate.
 */
function scanTextElement(element: Element): void {
  if (scannedElements.has(element)) return;
  scannedElements.add(element);

  const text = element.textContent || '';
  if (text.length < 3) return;

  // Skip Diamond's own injected content
  if (element.id === 'diamond-shield-styles') return;
  if (element.classList?.contains(DIAMOND_CSS.redactedText)) return;
  if (element.classList?.contains(DIAMOND_CSS.hiddenElement)) return;

  const result = checkTextContent(text);
  if (!result) return;

  const isYouTube = window.location.hostname.includes('youtube.com');

  if (isYouTube) {
    // On YouTube, try to hide the entire video card
    const card = findYouTubeCardParent(element);
    if (card && !scannedElements.has(card)) {
      scannedElements.add(card);
      card.classList.add(DIAMOND_CSS.hiddenElement);
      console.log(`[Diamond L4] Hidden YouTube card: "${text.substring(0, 60)}..." (matched: "${result.match}")`);
      return;
    }
  }

  // For non-YouTube or if no card found, redact the specific element using a blur effect
  element.classList.add(DIAMOND_CSS.redactedText);

  console.log(`[Diamond L4] Redacted: "${text.substring(0, 60)}..." (matched: "${result.match}")`);
}

/**
 * Scan all text-bearing elements in a subtree.
 */
function scanSubtreeForText(root: Element | Document): void {
  // Get all text-bearing elements
  const elements = root.querySelectorAll('h1, h2, h3, h4, h5, h6, p, a, span, li, td, figcaption, #video-title, yt-formatted-string, #title, .ytd-comment-renderer, [class*="title"], [class*="description"]');
  for (const el of elements) {
    scanTextElement(el);
  }
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// LAYER 5: ON-DEVICE ML IMAGE ANALYSIS (nsfwjs)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const imageCache = new LRUCache<string, 'safe' | 'blocked'>(IMAGE_CACHE_MAX_SIZE);
let nsfwModel: any = null;
let modelLoading = false;
let modelLoadFailed = false;
let activeScanCount = 0;

/** Queue of images waiting to be scanned */
const scanQueue: HTMLImageElement[] = [];

/**
 * Load the nsfwjs model lazily (only when images need scanning).
 * The model is loaded from a CDN into the page context using webFrame.
 */
async function loadNsfwModel(): Promise<any> {
  if (nsfwModel) return nsfwModel;
  if (modelLoadFailed) return null;
  if (modelLoading) {
    // Wait for the ongoing load
    return new Promise((resolve) => {
      const check = setInterval(() => {
        if (nsfwModel || modelLoadFailed) {
          clearInterval(check);
          resolve(nsfwModel);
        }
      }, 200);
      // Timeout after 30 seconds
      setTimeout(() => { clearInterval(check); resolve(null); }, 30000);
    });
  }

  modelLoading = true;
  console.log('[Diamond L5] Loading nsfwjs model...');

  try {
    // Let TensorFlow automatically choose the best hardware backend (WebGL GPU)
    await tf.ready();

    // Load the model locally using the imported library
    // Calling load() with no arguments uses the natively bundled MobileNetV2 models!
    nsfwModel = await nsfwjs.load();

    console.log('[Diamond L5] nsfwjs model loaded successfully.');
    modelLoading = false;

    // Process any queued images
    processQueue();

    return nsfwModel;
  } catch (err) {
    console.warn('[Diamond L5] Failed to load nsfwjs model:', err);
    modelLoadFailed = true;
    modelLoading = false;
    return null;
  }
}

/**
 * Get a unique key for an image element for caching.
 */
function getImageKey(img: HTMLImageElement): string {
  return img.src || img.currentSrc || '';
}

/**
 * Classify a single image using the nsfwjs model.
 */
async function classifyImage(img: HTMLImageElement): Promise<void> {
  const key = getImageKey(img);
  if (!key || key.startsWith('data:image/svg') || key.startsWith('data:image/gif;base64,R0lGOD')) return;

  // Check cache
  const cached = imageCache.get(key);
  if (cached !== undefined) {
    if (cached === 'blocked') {
      img.classList.add(DIAMOND_CSS.blurredImage);
    }
    return;
  }

  // Skip tiny images (icons, logos, tracking pixels)
  const naturalW = img.naturalWidth || img.width;
  const naturalH = img.naturalHeight || img.height;
  if (naturalW < MIN_IMAGE_WIDTH || naturalH < MIN_IMAGE_HEIGHT) {
    imageCache.set(key, 'safe');
    return;
  }

  // Skip if model isn't loaded
  if (!nsfwModel) {
    scanQueue.push(img);
    loadNsfwModel(); // Trigger lazy load
    return;
  }

  // Respect concurrent scan limit
  if (activeScanCount >= MAX_CONCURRENT_SCANS) {
    scanQueue.push(img);
    return;
  }

  activeScanCount++;

  try {
    // Classify the image
    let predictions;
    try {
      predictions = await nsfwModel.classify(img, 3);
    } catch (err) {
      // Ultimate fallback for Tainted Canvas / CORS: 
      // Manually fetch the bytes (webSecurity=no allows this), convert to bitmap, and draw to an isolated canvas.
      const srcUrl = img.currentSrc || img.src;
      const res = await fetch(srcUrl);
      const blob = await res.blob();
      const bitmap = await createImageBitmap(blob);
      
      const canvas = document.createElement('canvas');
      canvas.width = bitmap.width;
      canvas.height = bitmap.height;
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('No 2d context');
      
      ctx.drawImage(bitmap, 0, 0);
      predictions = await nsfwModel.classify(canvas, 3);
    }

    let dominated = false;
    for (const pred of predictions) {
      const className = pred.className as string;
      const probability = pred.probability as number;

      if (
        (className === 'Porn' && probability >= NSFW_THRESHOLDS.Porn) ||
        (className === 'Hentai' && probability >= NSFW_THRESHOLDS.Hentai) ||
        (className === 'Sexy' && probability >= 0.60)
      ) {
        dominated = true;
        console.log(`[Diamond L5] Blocked image: ${className}=${(probability * 100).toFixed(1)}% | ${key.substring(0, 80)}`);
        break;
      }
    }

    if (dominated) {
      img.classList.add(DIAMOND_CSS.blurredImage);
      imageCache.set(key, 'blocked');

      // On YouTube, try hiding the entire video card
      const isYouTube = window.location.hostname.includes('youtube.com');
      if (isYouTube) {
        const card = findYouTubeCardParent(img);
        if (card) {
          card.classList.add(DIAMOND_CSS.hiddenElement);
        }
      }
    } else {
      imageCache.set(key, 'safe');
    }
  } catch (err) {
    // Classification completely failed — skip
    imageCache.set(key, 'safe');
  } finally {
    activeScanCount--;
    processQueue();
  }
}

/**
 * Process the next image in the scan queue.
 */
function processQueue(): void {
  while (scanQueue.length > 0 && activeScanCount < MAX_CONCURRENT_SCANS) {
    const img = scanQueue.shift();
    if (img && img.isConnected) {
      classifyImage(img);
    }
  }
}

/**
 * Set up an IntersectionObserver that only scans images when
 * they enter the viewport (the "Line of Sight" rule).
 */
let imageObserver: IntersectionObserver | null = null;
const observedImages = new WeakSet<Element>();

function setupImageObserver(): void {
  if (imageObserver) return;

  imageObserver = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (entry.isIntersecting && entry.target instanceof HTMLImageElement) {
          const img = entry.target;
          // Only scan if the image has loaded
          if (img.complete && img.naturalWidth > 0) {
            classifyImage(img);
          } else {
            img.addEventListener('load', () => classifyImage(img), { once: true });
          }
          // Stop observing after first intersection
          imageObserver?.unobserve(img);
        }
      }
    },
    {
      rootMargin: '200px', // Start scanning 200px before image enters viewport
      threshold: 0.01,
    }
  );
}

/**
 * Observe all images in a subtree for visibility-based scanning.
 */
function observeImagesInSubtree(root: Element | Document): void {
  if (!imageObserver) setupImageObserver();

  const images = root.querySelectorAll('img');
  for (const img of images) {
    if (observedImages.has(img)) continue;
    observedImages.add(img);

    const key = getImageKey(img as HTMLImageElement);
    if (!key) continue;

    // Check cache immediately
    const cached = imageCache.get(key);
    if (cached === 'blocked') {
      img.classList.add(DIAMOND_CSS.BLURRED_IMAGE);
      continue;
    }
    if (cached === 'safe') continue;

    // Observe for viewport entry
    imageObserver!.observe(img);
  }

  // Also check for background images on divs (YouTube uses these for thumbnails)
  const bgElements = root.querySelectorAll('[style*="background-image"]');
  for (const el of bgElements) {
    // We can't easily classify background images with nsfwjs without creating
    // a temp img element. For now, skip — the text filter catches most of these.
  }
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// ORIGINAL LAYER 4: META TAG & HEADER SCANNING (Retained)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

// HIGH_CONFIDENCE_TOKENS imported from shieldDictionary

function checkMetaTags(): { flagged: boolean; reason: string } | null {
  const metaTags = document.querySelectorAll('meta');

  for (const meta of metaTags) {
    const name = (meta.getAttribute('name') || '').toLowerCase();
    const httpEquiv = (meta.getAttribute('http-equiv') || '').toLowerCase();
    const property = (meta.getAttribute('property') || '').toLowerCase();
    const content = (meta.getAttribute('content') || '').toLowerCase();

    // 1. RTA (Restricted To Adults)
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
  const title = (document.title || '').toLowerCase();
  for (const keyword of HIGH_CONFIDENCE_TOKENS) {
    if (title.includes(keyword)) {
      return {
        flagged: true,
        reason: `Page title contains explicit keyword "${keyword}".`,
      };
    }
  }

  // Check for suggestive phrases in the title too
  const titleSuggestive = title.match(suggestiveRegex);
  if (titleSuggestive) {
    // Only block title if it's a strong signal
    const match = titleSuggestive[0];
    if (EXPLICIT_KEYWORDS.has(match) || match.includes('18+')) {
      return {
        flagged: true,
        reason: `Page title contains inappropriate content: "${match}".`,
      };
    }
  }

  const headings = document.querySelectorAll('h1, h2, h3');
  let flagCount = 0;
  for (const heading of headings) {
    const text = (heading.textContent || '').toLowerCase();
    for (const keyword of HIGH_CONFIDENCE_TOKENS) {
      const regex = new RegExp(`\\b${keyword}\\b`, 'i');
      if (regex.test(text)) {
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
  const bodyText = (document.body?.innerText || '').toLowerCase().slice(0, 5000);
  if (!bodyText || bodyText.length < 50) return null;

  let matchCount = 0;
  const matchedKeywords: string[] = [];

  for (const keyword of EXPLICIT_KEYWORDS) {
    const regex = new RegExp(`\\b${keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i');
    if (regex.test(bodyText)) {
      matchCount++;
      matchedKeywords.push(keyword);
    }
  }

  if (matchCount >= 5) {
    return {
      flagged: true,
      reason: `Page body content contains ${matchCount} explicit keywords: ${matchedKeywords.slice(0, 5).join(', ')}.`,
    };
  }

  return null;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// MAIN SCANNER: Combines all layers
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * Full page scan — runs on initial load.
 * Checks meta tags, titles, body content, then sets up
 * real-time observers for ongoing protection.
 */
function runFullPageScan(): void {
  try {
    // ── Original Layer 4: Meta/title/body checks (page-level blocking) ──
    const metaResult = checkMetaTags();
    if (metaResult?.flagged) {
      ipcRenderer.sendToHost('content-flagged', {
        url: window.location.href,
        category: 'Inappropriate Page Content',
        reason: metaResult.reason,
        layer: 'content-scan',
      });
      return; // Page will be blocked, no need to continue
    }

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

    // ── New Layer 4: Scan existing text elements ──
    scanSubtreeForText(document);

    // ── Layer 5: Observe existing images ──
    observeImagesInSubtree(document);

  } catch (error) {
    console.warn('[Diamond Scanner] Error during content scan:', error);
  }
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// MUTATION OBSERVER: Real-time DOM monitoring
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

let mutationDebounceTimer: ReturnType<typeof setTimeout> | null = null;
let pendingMutations: MutationRecord[] = [];

function setupMutationObserver(): void {
  const observer = new MutationObserver((mutations) => {
    // Collect mutations and debounce processing
    pendingMutations.push(...mutations);

    if (mutationDebounceTimer) {
      clearTimeout(mutationDebounceTimer);
    }

    mutationDebounceTimer = setTimeout(() => {
      processPendingMutations();
      mutationDebounceTimer = null;
    }, SCAN_DEBOUNCE_MS);
  });

  observer.observe(document.body, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ['src', 'srcset'],
    // We don't need characterData — text changes within existing nodes
    // are rare in modern SPAs; new content is added as new child nodes
  });

  console.log('[Diamond L4+L5] MutationObserver active.');
}

/**
 * Process all collected mutations in a single batch.
 * This is the debounced handler that runs after the DOM settles.
 */
function processPendingMutations(): void {
  const mutations = pendingMutations;
  pendingMutations = [];

  for (const mutation of mutations) {
    if (mutation.type === 'attributes' && (mutation.attributeName === 'src' || mutation.attributeName === 'srcset') && mutation.target instanceof HTMLImageElement) {
      // Image source changed (e.g. lazy loaded or replaced placeholder)
      const img = mutation.target;
      if (img.complete && img.naturalWidth > 0) {
        classifyImage(img);
      } else {
        img.addEventListener('load', () => classifyImage(img), { once: true });
      }
    } else if (mutation.type === 'childList') {
      for (const node of mutation.addedNodes) {
        if (!(node instanceof HTMLElement)) continue;

        // Layer 4: Scan new text elements
        scanTextElement(node);
        scanSubtreeForText(node);

        // Layer 5: Observe new images
        if (node instanceof HTMLImageElement) {
          observeImagesInSubtree(node.parentElement || document);
        } else {
          observeImagesInSubtree(node);
        }
      }
    }
  }
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// INITIALIZATION
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

// Inject Diamond Shield CSS immediately
injectDiamondStyles();

// Run on DOMContentLoaded
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    setTimeout(runFullPageScan, 300);
    setTimeout(setupMutationObserver, 500);
  });
} else {
  setTimeout(runFullPageScan, 300);
  setTimeout(setupMutationObserver, 500);
}

// Run again on full page load (for SPAs that render late)
window.addEventListener('load', () => {
  setTimeout(() => {
    runFullPageScan();
  }, 800);
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// CONTEXT BRIDGE: Expose safe API for blocked.html
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

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
  // Fallback for non-isolated contexts
  (window as any).electronAPI = {
    requestAccess: (url: string, category?: string) => {
      ipcRenderer.sendToHost('request-access', { url, category });
    },
    goBackToSafety: () => {
      ipcRenderer.sendToHost('go-back-to-safety', {});
    },
  };
}

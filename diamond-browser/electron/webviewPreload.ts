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
import * as toxicity from '@tensorflow-models/toxicity';
import {
  MODERATE_TRIE,
  STRICT_TRIE,
  YOUTUBE_TITLE_PATTERNS,
  YOUTUBE_CARD_SELECTORS,
  IMAGE_CONFIG,
  DIAMOND_CSS,
} from '../src/shieldDictionary';

// Flag to disable blocking (silent mode) for explicitly allowed sites
let isExplicitlyAllowed = false;

ipcRenderer.on('set-explicitly-allowed', (_event, allowed: boolean) => {
  isExplicitlyAllowed = allowed;
});

const MIN_IMAGE_WIDTH = 50;
const MIN_IMAGE_HEIGHT = 50;
const NSFW_THRESHOLDS = { Porn: 0.6, Hentai: 0.55, Sexy: 0.6 };
const IMAGE_CACHE_MAX_SIZE = 500;
const MAX_CONCURRENT_SCANS = 10;
const SCAN_DEBOUNCE_MS = 300;

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

function searchAhoCorasick(text: string, states: any[]): { match: string; severity: 'explicit' | 'suggestive' } | null {
  let currentState = 0;
  const lowerText = text.toLowerCase();
  
  for (let i = 0; i < lowerText.length; i++) {
    const char = lowerText[i];
    while (currentState > 0 && states[currentState].next[char] === undefined) {
      currentState = states[currentState].fail;
    }
    if (states[currentState].next[char] !== undefined) {
      currentState = states[currentState].next[char];
    } else {
      currentState = 0;
    }
    
    if (states[currentState].output.length > 0) {
      // We found a match, but is it a whole word?
      for (const out of states[currentState].output) {
        const b64Word = out.word;
        const decodedWord = atob(b64Word); // Decode base64 word
        const startIndex = i - decodedWord.length + 1;
        const beforeChar = startIndex > 0 ? lowerText[startIndex - 1] : ' ';
        const afterChar = i + 1 < lowerText.length ? lowerText[i + 1] : ' ';
        
        const isWordBoundaryBefore = !/[a-z0-9]/.test(beforeChar);
        const isWordBoundaryAfter = !/[a-z0-9]/.test(afterChar);
        
        if (isWordBoundaryBefore && isWordBoundaryAfter) {
          return { match: decodedWord, severity: out.severity }; // return decoded word for logging
        }
      }
    }
  }
  return null;
}

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

  // 1. Check Aho-Corasick Dictionary
  const activeTrie = currentPolicyMode === 'strict' ? STRICT_TRIE : MODERATE_TRIE;
  const acMatch = searchAhoCorasick(text, activeTrie);
  if (acMatch) {
    return acMatch;
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

const CARD_SELECTORS = [
  // YouTube
  'ytd-rich-item-renderer',
  'ytd-video-renderer',
  'ytd-compact-video-renderer',
  'ytd-grid-video-renderer',
  'ytd-playlist-video-renderer',
  'ytd-reel-item-renderer',
  // Spotify
  '[data-testid="tracklist-row"]',
  '[data-testid="play-list-item"]',
  '[data-testid="search-tracks-result"]',
  '[data-testid="hero-card"]',
  '[data-testid="top-result-card"]',
  '[role="row"]',
  // Generic
  'article',
  'li',
  'tr'
];

/**
 * Find the closest "card" or "banner" parent element to blur.
 * This ensures we blur the whole song row or video card instead of just the tiny text span.
 */
function findCardParent(element: Element): Element {
  let current: Element | null = element;
  let steps = 0;
  while (current && steps < 8) {
    for (const selector of CARD_SELECTORS) {
      if (current.matches(selector)) {
        if (current.tagName !== 'BODY' && current.tagName !== 'HTML' && current.tagName !== 'MAIN') {
           return current;
        }
      }
    }
    
    current = current.parentElement;
    steps++;
  }
  return element;
}

// Track sent alerts to prevent IPC spam
const sentAlerts = new Set<string>();

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

  // Prevent blurring massive container elements (like whole playlists or search lists)
  // If the text is very long and it contains block elements, it's a layout container.
  if (text.length > 200 && element.querySelector('div, ul, li, article, section, table, tbody, grid')) {
    return;
  }

  const result = checkTextContent(text);
  if (result) {
    // Drill down to the smallest element containing the match to avoid blurring huge boxes
    applyTextRedaction(element, (result as any).category || 'Inappropriate Word', result.match, text);
    return;
  }

  // If dictionary didn't catch it, queue for ML Toxicity analysis
  queueTextForMLAnalysis(element, text);
}

/**
 * Applies the actual blurring/hiding logic and emits the IPC alert.
 */
function applyTextRedaction(element: Element, category: string, reason: string, originalText: string): void {
  const isYouTube = window.location.hostname.includes('youtube.com') || window.location.hostname.includes('youtu.be');

  if (isExplicitlyAllowed) {
    // Silent Mode: Do not blur or hide, just report the keyword
    const alertKey = `${category}:${reason}`;
    if (!sentAlerts.has(alertKey)) {
      sentAlerts.add(alertKey);
      ipcRenderer.sendToHost('content-flagged-silent', {
        url: window.location.href,
        category,
        reason,
        layer: 'content-scan-silent'
      });
    }
    return;
  }

  // Find the perfect "card" or "row" wrapper for this element
  const targetElement = findCardParent(element);

  if (isYouTube) {
    // On YouTube, completely hide the video card for cleaner UI
    if (!scannedElements.has(targetElement)) {
      scannedElements.add(targetElement);
      targetElement.classList.add(DIAMOND_CSS.hiddenElement);

      const alertKey = `${category}:${reason}`;
      if (!sentAlerts.has(alertKey)) {
        sentAlerts.add(alertKey);
        ipcRenderer.sendToHost('content-flagged-silent', {
          url: window.location.href,
          category: 'Content Hidden',
          reason,
          layer: 'content-scan-hidden'
        });
      }
      return;
    }
  }

  // For non-YouTube or if no card found, redact the specific element using a blur effect
  targetElement.classList.add(DIAMOND_CSS.redactedText);

  console.log(`[Diamond L4] Redacted: "${originalText.substring(0, 60)}..." (matched: "${reason}")`);
  
  const alertKey = `Content Blurred:${reason}`;
  if (!sentAlerts.has(alertKey)) {
    sentAlerts.add(alertKey);
    ipcRenderer.sendToHost('content-flagged-silent', {
      url: window.location.href,
      category: 'Content Blurred',
      reason,
      layer: 'content-scan-redacted'
    });
  }
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// ML TOXICITY TEXT SCANNER
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

let toxicityModel: toxicity.ToxicityClassifier | null = null;
let modelLoadingTox = false;
const toxicityCache = new Map<string, string>(); // 'safe' | 'sexual_explicit' | 'threat' | 'obscene'
const mlTextQueue: { element: Element; text: string }[] = [];
let mlProcessingTimer: any = null;

const MAX_CACHE_SIZE = 1000;

async function loadToxicityModel() {
  if (toxicityModel) return toxicityModel;
  if (modelLoadingTox) return null;
  
  modelLoadingTox = true;
  console.log('[Diamond L4] Loading ML Toxicity model for semantic scanning...');
  
  try {
    await tf.ready();
    // Load toxicity model with 0.70 threshold for higher sensitivity
    toxicityModel = await toxicity.load(0.70, ['sexual_explicit', 'threat', 'obscene']);
    console.log('[Diamond L4] ML Toxicity model loaded successfully.');
    modelLoadingTox = false;
    processMLTextQueue();
    return toxicityModel;
  } catch (err) {
    console.warn('[Diamond L4] Failed to load Toxicity model:', err);
    modelLoadingTox = false;
    return null;
  }
}

function queueTextForMLAnalysis(element: Element, text: string) {
  // DISABLED: The TensorFlow Toxicity model is too heavy for real-time DOM scanning 
  // and causes severe video playback and hover lag by blocking the main thread.
  // The Regex dictionary filters in checkTextContent() are sufficient.
  return;
}

async function processMLTextQueue() {
  if (!toxicityModel || mlTextQueue.length === 0) {
    mlProcessingTimer = null;
    return;
  }

  // Take a batch of up to 10 elements to process
  const batch = mlTextQueue.splice(0, 10);
  
  // Dedup and check cache
  const textsToAnalyze: string[] = [];
  const elementMap = new Map<string, Element[]>();
  
  for (const item of batch) {
    const cached = toxicityCache.get(item.text);
    if (cached) {
      if (cached !== 'safe') {
        applyTextRedaction(item.element, 'ML Context Filter', cached, item.text);
      }
    } else {
      if (!elementMap.has(item.text)) {
        elementMap.set(item.text, []);
        textsToAnalyze.push(item.text);
      }
      elementMap.get(item.text)!.push(item.element);
    }
  }

  if (textsToAnalyze.length > 0) {
    try {
      // Run batch prediction
      const predictions = await toxicityModel.classify(textsToAnalyze);
      
      // Predictions is an array of objects for each label
      for (let i = 0; i < textsToAnalyze.length; i++) {
        const text = textsToAnalyze[i];
        let flaggedReason = 'safe';
        
        for (const pred of predictions) {
          if (pred.results[i].match === true) {
            flaggedReason = pred.label; // e.g. 'sexual_explicit'
            break;
          }
        }
        
        
        if (toxicityCache.size > MAX_CACHE_SIZE) {
          // Naive FIFO eviction: delete the first (oldest) key
          const firstKey = toxicityCache.keys().next().value;
          if (firstKey) toxicityCache.delete(firstKey);
        }
        toxicityCache.set(text, flaggedReason);
        
        if (flaggedReason !== 'safe') {
          const elements = elementMap.get(text) || [];
          for (const el of elements) {
            applyTextRedaction(el, 'ML Context Filter', flaggedReason.replace('_', ' ').toUpperCase(), text);
          }
        }
      }
    } catch (err) {
      // Silently ignore classification errors to not break the page
    }
  }

  // If there are more items, schedule next batch
  if (mlTextQueue.length > 0) {
    mlProcessingTimer = setTimeout(processMLTextQueue, 150);
  } else {
    mlProcessingTimer = null;
  }
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
  
  // Disable ML Image Scanning on YouTube. 
  // It causes severe false positives on video thumbnails (faces, expressions)
  // which permanently blurs the entire video player. The text scanner handles YouTube safety.
  if (window.location.hostname.includes('youtube.com') || window.location.hostname.includes('youtu.be')) {
    imageCache.set(key, 'safe');
    return;
  }

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
    // Yield to browser's render loop so fast scrolling doesn't checkerboard
    await new Promise(resolve => setTimeout(resolve, 100));

    // Classify the image
    let predictions;
    try {
      predictions = await nsfwModel.classify(img, 3);
    } catch (err) {
      // Ultimate fallback for Tainted Canvas / CORS: 
      // Manually fetch the bytes (webSecurity=no allows this), convert to bitmap, and draw to an isolated canvas.
      let srcUrl = img.currentSrc || img.src;
      if (srcUrl.startsWith('//')) {
        srcUrl = 'https:' + srcUrl;
      }
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
        (className === 'Porn' && probability >= 0.80) ||
        (className === 'Hentai' && probability >= 0.80) ||
        (className === 'Sexy' && probability >= 0.85) ||
        (className === 'Porn' && probability + (predictions.find(p => p.className === 'Sexy')?.probability || 0) >= 0.85)
      ) {
        dominated = true;
        console.log(`[Diamond L5] Blocked image: ${className}=${(probability * 100).toFixed(1)}% | ${key.substring(0, 80)}`);
        break;
      }
    }

    if (dominated) {
      if (isExplicitlyAllowed) {
        // Silent Mode
        const alertKey = `Explicit Image:ML Image Analysis`;
        if (!sentAlerts.has(alertKey)) {
          sentAlerts.add(alertKey);
          ipcRenderer.sendToHost('content-flagged-silent', {
            url: window.location.href,
            category: 'Explicit Image',
            reason: 'ML Image Analysis',
            layer: 'image-scan-silent'
          });
        }
      } else {
        img.classList.add(DIAMOND_CSS.blurredImage);
        imageCache.set(key, 'blocked');

        // Try hiding/blurring the card if it's an image block
        let hiddenCard = false;
        const card = findCardParent(img);
        if (card && card !== img) {
          const isYouTube = window.location.hostname.includes('youtube.com') || window.location.hostname.includes('youtu.be');
          if (isYouTube) {
            card.classList.add(DIAMOND_CSS.hiddenElement);
            hiddenCard = true;
          } else {
            card.classList.add(DIAMOND_CSS.redactedText);
          }
        }
        
        const category = hiddenCard ? 'Content Hidden' : 'Content Blurred';
        const alertKey = `${category}:ML Image Analysis`;
        if (!sentAlerts.has(alertKey)) {
          sentAlerts.add(alertKey);
          ipcRenderer.sendToHost('content-flagged-silent', {
            url: window.location.href,
            category: category,
            reason: 'ML Image Analysis',
            layer: hiddenCard ? 'image-scan-hidden' : 'image-scan-blurred'
          });
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
const intersectionTimeouts = new WeakMap<Element, ReturnType<typeof setTimeout>>();

function setupImageObserver(): void {
  if (imageObserver) return;

  imageObserver = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (entry.isIntersecting && entry.target instanceof HTMLImageElement) {
          const img = entry.target;
          if (!intersectionTimeouts.has(img)) {
            // Wait 300ms before scanning to see if it's still intersecting (prevents lag on fast scroll)
            const timeoutId = setTimeout(() => {
              // Only scan if the image has loaded
              if (img.complete && img.naturalWidth > 0) {
                classifyImage(img);
              } else {
                img.addEventListener('load', () => classifyImage(img), { once: true });
              }
              // Stop observing after first intersection
              imageObserver?.unobserve(img);
              intersectionTimeouts.delete(img);
            }, 300);
            intersectionTimeouts.set(img, timeoutId);
          }
        } else if (!entry.isIntersecting && entry.target instanceof HTMLImageElement) {
          const existingTimeout = intersectionTimeouts.get(entry.target);
          if (existingTimeout) {
            clearTimeout(existingTimeout);
            intersectionTimeouts.delete(entry.target);
          }
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

  const images = Array.from(root.querySelectorAll('img'));
  if (root instanceof HTMLImageElement) {
    images.push(root);
  }

  for (const img of images) {
    if (observedImages.has(img)) continue;
    observedImages.add(img);

    const key = getImageKey(img as HTMLImageElement);
    if (!key) continue;

    // Check cache immediately
    const cached = imageCache.get(key);
    if (cached === 'blocked') {
      img.classList.add(DIAMOND_CSS.blurredImage);
      continue;
    }
    if (cached === 'safe') continue;

    // Observe for viewport entry
    imageObserver!.observe(img);
  }

  // Also check for background images on divs (YouTube uses these for thumbnails)
  if (!(root instanceof HTMLImageElement) && root.querySelectorAll) {
    const bgElements = root.querySelectorAll('[style*="background-image"]');
    for (const el of bgElements) {
      // We can't easily classify background images with nsfwjs without creating
      // a temp img element. For now, skip — the text filter catches most of these.
    }
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
      const activeTrie = currentPolicyMode === 'strict' ? STRICT_TRIE : MODERATE_TRIE;
      const match = searchAhoCorasick(content, activeTrie);
      if (match && match.severity === 'explicit') {
        return {
          flagged: true,
          reason: `Page meta ${name || property} contains explicit keyword "${match.match}".`,
        };
      }
    }
  }

  return null;
}

function checkTitleAndHeadings(): { flagged: boolean; reason: string } | null {
  const title = (document.title || '').toLowerCase();
  const activeTrie = currentPolicyMode === 'strict' ? STRICT_TRIE : MODERATE_TRIE;
  
  const titleMatch = searchAhoCorasick(title, activeTrie);
  if (titleMatch) {
    return {
      flagged: true,
      reason: `Page title contains inappropriate content: "${titleMatch.match}".`,
    };
  }

  const headings = document.querySelectorAll('h1, h2, h3');
  let explicitCount = 0;
  for (const heading of headings) {
    const text = (heading.textContent || '').toLowerCase();
    const headingMatch = searchAhoCorasick(text, activeTrie);
    if (headingMatch && headingMatch.severity === 'explicit') {
      explicitCount++;
      if (explicitCount >= 2) {
        return {
          flagged: true,
          reason: `Multiple page headings contain explicit keyword "${headingMatch.match}".`,
        };
      }
    }
  }

  return null;
}

function checkBodyContent(): { flagged: boolean; reason: string } | null {
  const bodyText = (document.body?.innerText || '').toLowerCase().slice(0, 5000);
  if (!bodyText || bodyText.length < 50) return null;

  const activeTrie = currentPolicyMode === 'strict' ? STRICT_TRIE : MODERATE_TRIE;
  let currentState = 0;
  let matchCount = 0;
  const matchedKeywords: string[] = [];

  for (let i = 0; i < bodyText.length; i++) {
    const char = bodyText[i];
    while (currentState > 0 && activeTrie[currentState].next[char] === undefined) {
      currentState = activeTrie[currentState].fail;
    }
    if (activeTrie[currentState].next[char] !== undefined) {
      currentState = activeTrie[currentState].next[char];
    } else {
      currentState = 0;
    }
    
    if (activeTrie[currentState].output.length > 0) {
      for (const out of activeTrie[currentState].output) {
        if (out.severity === 'explicit') {
          const decodedWord = atob(out.word);
          const startIndex = i - decodedWord.length + 1;
          const beforeChar = startIndex > 0 ? bodyText[startIndex - 1] : ' ';
          const afterChar = i + 1 < bodyText.length ? bodyText[i + 1] : ' ';
          
          if (!/[a-z0-9]/.test(beforeChar) && !/[a-z0-9]/.test(afterChar)) {
            if (!matchedKeywords.includes(decodedWord)) {
              matchedKeywords.push(decodedWord);
              matchCount++;
            }
          }
        }
      }
    }
    if (matchCount >= 5) {
      return {
        flagged: true,
        reason: `Page body content contains 5+ explicit keywords: ${matchedKeywords.slice(0, 5).join(', ')}.`,
      };
    }
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

  const addedElements = new Set<HTMLElement>();
  const modifiedImages = new Set<HTMLImageElement>();

  for (const mutation of mutations) {
    if (mutation.type === 'attributes' && (mutation.attributeName === 'src' || mutation.attributeName === 'srcset') && mutation.target instanceof HTMLImageElement) {
      // Image source changed (e.g. lazy loaded or replaced placeholder)
      modifiedImages.add(mutation.target);
    } else if (mutation.type === 'childList') {
      for (const node of mutation.addedNodes) {
        if (node instanceof HTMLElement) {
          addedElements.add(node);
        }
      }
    }
  }

  for (const img of modifiedImages) {
    if (img.complete && img.naturalWidth > 0) {
      classifyImage(img);
    } else {
      img.addEventListener('load', () => classifyImage(img), { once: true });
    }
  }

  if (addedElements.size > 0) {
    // Filter out elements that are children of other added elements in this batch
    // to avoid redundant subtree scanning
    const topLevelElements = Array.from(addedElements).filter(el => {
      let parent = el.parentElement;
      while (parent) {
        if (addedElements.has(parent)) return false;
        parent = parent.parentElement;
      }
      return true;
    });

    for (const node of topLevelElements) {
      scanTextElement(node);
      scanSubtreeForText(node);
      observeImagesInSubtree(node);
    }
  }
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// INITIALIZATION
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const currentHostname = window.location.hostname;
const currentUrl = window.location.href;

let currentPolicyMode = 'strict';
try {
  currentPolicyMode = ipcRenderer.sendSync('get-policy-mode-sync');
} catch (e) {
  console.warn('[Diamond Shield] IPC error getting policy mode:', e);
}

// Do not run the scanner on our own internal pages or dashboard
if (currentHostname === 'localhost' || currentHostname === '127.0.0.1' || currentUrl.includes('blocked.html') || currentUrl.startsWith('diamond://')) {
  console.log('[Diamond Shield] Skipping content scanning for internal/local page.');
} else {
  // Check if domain is explicitly allowed by parent (Layer 2 Policy)
  try {
    isExplicitlyAllowed = ipcRenderer.sendSync('is-domain-allowed-sync', currentHostname);
  } catch (e) {
    console.warn('[Diamond Shield] IPC error checking allowed domains:', e);
  }

  if (isExplicitlyAllowed) {
    console.log('[Diamond Shield] Domain explicitly allowed by parent. Running in SILENT mode.');
  }

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
}

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
    requestAccess: (url: string, category?: string, reason?: string) => {
      ipcRenderer.sendToHost('request-access', { url, category, reason });
    },
    goBackToSafety: () => {
      ipcRenderer.sendToHost('go-back-to-safety', {});
    },
  });
} catch (e) {
  // Fallback for non-isolated contexts
  (window as any).electronAPI = {
    requestAccess: (url: string, category?: string, reason?: string) => {
      ipcRenderer.sendToHost('request-access', { url, category, reason });
    },
    goBackToSafety: () => {
      ipcRenderer.sendToHost('go-back-to-safety', {});
    },
  };
}

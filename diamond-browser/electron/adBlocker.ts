/**
 * Diamond Ad Blocker v3 — Full Brave-Level Protection
 * 
 * 3-Layer Ad Blocking:
 *   Layer 1: Network Request Blocking (7 filter lists — ~135k rules)
 *   Layer 2: Cosmetic Filtering (CSS injection — generic + YouTube + Google + news)
 *   Layer 3: Scriptlet Injection (YouTube auto-skip, anti-anti-adblock)
 * 
 * Privacy Shield:
 *   - Canvas/WebGL Fingerprint Scrambling
 *   - WebRTC IP Leak Prevention
 *   - Navigator API Spoofing
 * 
 * Features:
 *   - Per-site whitelist (disable ad blocking for specific sites)
 *   - Popup ad interception (blocks ad popups before they open)
 *   - Per-site blocked stats tracking
 *   - Dashboard sync (reports stats to Firestore)
 *   - Engine cached to disk for instant startup
 *   - Auto-refreshes filter lists every 24 hours
 */

import { ElectronBlocker } from '@ghostery/adblocker-electron';
import fetch from 'cross-fetch';
import { session, ipcMain, app } from 'electron';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

// ─── State ──────────────────────────────────────────────────────

let blocker: ElectronBlocker | null = null;
let isEnabled = true;
let adsBlockedCount = 0;
let trackersBlockedCount = 0;
let refreshTimer: ReturnType<typeof setInterval> | null = null;

// Per-site stats: hostname -> blocked count
const perSiteStats = new Map<string, number>();

// Cache & config paths
const cacheDir = path.join(os.homedir(), '.diamond');
const engineCachePath = path.join(cacheDir, 'adblocker-engine-v3.bin');
const whitelistPath = path.join(cacheDir, 'adblock-whitelist.json');

// Per-site whitelist
let whitelist: string[] = [];

// ─── Filter List URLs ───────────────────────────────────────────
// 7 lists = ~135k+ rules (same coverage as Brave Shields)

const FILTER_LIST_URLS = [
  // Core ad blocking
  'https://easylist.to/easylist/easylist.txt',
  // Tracker blocking
  'https://easylist.to/easylist/easyprivacy.txt',
  // uBlock Origin filters (advanced patterns + anti-circumvention)
  'https://ublockorigin.github.io/uAssets/filters/filters.txt',
  // Cookie / GDPR consent popups
  'https://easylist.to/easylist/easylist-cookie.txt',
  // Annoyances (newsletter popups, chat widgets, social widgets)
  'https://easylist.to/easylist/fanboy-annoyance.txt',
  // Peter Lowe's ad + tracking domain list (compact, fast)
  'https://pgl.yoyo.org/adservers/serverlist.php?hostformat=adblockplus&showintro=1&mimetype=plaintext',
  // uBlock anti-circumvention (bypass anti-adblock walls)
  'https://ublockorigin.github.io/uAssets/filters/unbreak.txt',
];

// ─── Cosmetic CSS ───────────────────────────────────────────────

const GENERIC_AD_CSS = `
ins.adsbygoogle, ins[data-ad-status], ins[data-ad-client], .adsbygoogle,
[id^="google_ads"], [id^="div-gpt-ad"],
iframe[src*="doubleclick.net"], iframe[src*="googlesyndication"],
iframe[src*="amazon-adsystem"], iframe[id^="google_ads"],
.ad-container, .ad-wrapper, .ad-banner, .ad-slot, .sidebar-ad, .banner-ad,
div[class*="ad-placement"], div[class*="ad_placement"],
div[data-ad], div[data-adunit], aside[class*="ad"], section[class*="sponsored"] {
  display: none !important;
  height: 0 !important; min-height: 0 !important; max-height: 0 !important;
  width: 0 !important; margin: 0 !important; padding: 0 !important;
  overflow: hidden !important; visibility: hidden !important;
  opacity: 0 !important; pointer-events: none !important;
}
`;

const YOUTUBE_AD_CSS = `
.ytp-ad-module, .ytp-ad-overlay-container, .ytp-ad-overlay-slot,
.ytp-ad-text-overlay, .ytp-ad-skip-button-container, .ytp-ad-player-overlay,
.ytp-ad-player-overlay-instream-info, .ytp-ad-action-interstitial,
.video-ads, #player-ads, .ad-showing .ytp-ad-overlay-container {
  display: none !important; height: 0 !important; opacity: 0 !important; pointer-events: none !important;
}
ytd-display-ad-renderer, ytd-promoted-video-renderer,
ytd-promoted-sparkles-web-renderer, ytd-promoted-sparkles-text-search-renderer,
ytd-ad-slot-renderer, ytd-in-feed-ad-layout-renderer,
ytd-banner-promo-renderer, ytd-statement-banner-renderer,
ytd-brand-video-shelf-renderer, ytd-brand-video-singleton-renderer,
#masthead-ad, ytd-mealbar-promo-renderer, ytd-search-pyv-renderer,
ytd-compact-promoted-video-renderer, #related ytd-ad-slot-renderer,
ytd-merch-shelf-renderer, ytd-action-companion-ad-renderer,
ytd-official-card-renderer, ytd-hero-playlist-thumbnail-renderer,
#panels > ytd-engagement-panel-section-list-renderer[target-id="engagement-panel-ads"] {
  display: none !important; height: 0 !important; margin: 0 !important; padding: 0 !important;
}
`;

const GOOGLE_AD_CSS = `
#tads, #tadsb, #bottomads, .ads-ad, .commercial-unit-desktop-top,
div[data-text-ad], div[data-pla-tag], .pla-unit, .commercial-unit-desktop-rhs,
#rhs_block .ads-ad, div[aria-label="Ads"], .uEierd,
.commercial-unit-mobile-top, .cu-container {
  display: none !important;
}
`;

const COMMON_SITES_AD_CSS = `
div[data-testid="placementTracking"],
.ad-inarticle, .in-article-ad, .article-ad, .story-ad,
div[class*="outbrain"], div[class*="taboola"],
div[id*="outbrain"], div[id*="taboola"],
.OUTBRAIN, #taboola-below-article {
  display: none !important;
}
`;

// ─── YouTube Auto-Skip Script ───────────────────────────────────

const YOUTUBE_AUTOSKIP_SCRIPT = `
(function diamondAdSkipper() {
  'use strict';
  if (window.__diamondAdSkipperActive) return;
  window.__diamondAdSkipperActive = true;

  function skipAd(player) {
    try {
      if (!player.classList.contains('ad-showing')) return;

      // Strategy 1: Click Skip button
      const skipBtn = document.querySelector('.ytp-ad-skip-button, .ytp-ad-skip-button-modern, .ytp-skip-ad-button, button.ytp-ad-skip-button-modern');
      if (skipBtn) { skipBtn.click(); return; }

      // Strategy 2: Fast-forward ad
      const video = document.querySelector('video');
      if (video && video.duration && isFinite(video.duration) && video.duration > 0) {
        video.currentTime = video.duration;
      }

      // Strategy 3: Mute during ad, unmute when ad ends
      if (video && !video.muted) {
        video.muted = true;
        const unmuter = new MutationObserver(() => {
          if (!player.classList.contains('ad-showing')) { video.muted = false; unmuter.disconnect(); }
        });
        unmuter.observe(player, { attributes: true, attributeFilter: ['class'] });
      }
    } catch (e) {}
  }

  // Wait for the player element to appear, then observe it (zero CPU when idle)
  const waitForPlayer = setInterval(() => {
    const player = document.querySelector('.html5-video-player');
    if (!player) return;
    clearInterval(waitForPlayer); // Stop polling once player is found

    // Pure MutationObserver — fires ONLY when the player class changes
    // Zero CPU cost when no ad is playing
    const observer = new MutationObserver(() => {
      if (player.classList.contains('ad-showing')) {
        skipAd(player);
        // Retry after 300ms in case skip button appears with a delay
        setTimeout(() => skipAd(player), 300);
        setTimeout(() => skipAd(player), 1000);
      }
    });

    observer.observe(player, { attributes: true, attributeFilter: ['class'] });

    // Also check immediately in case ad is already playing when script loads
    if (player.classList.contains('ad-showing')) {
      skipAd(player);
    }
  }, 1000);
})();
`;

// ─── Privacy Shield: Fingerprint + WebRTC Protection ────────────

const FINGERPRINT_PROTECTION_SCRIPT = `
(function diamondPrivacyShield() {
  'use strict';
  if (window.__diamondPrivacyShield) return;
  window.__diamondPrivacyShield = true;

  // ── Canvas Fingerprint Scrambling ──
  // Adds imperceptible noise to canvas output so every read produces different data
  const origToDataURL = HTMLCanvasElement.prototype.toDataURL;
  HTMLCanvasElement.prototype.toDataURL = function(type, quality) {
    try {
      const ctx = this.getContext('2d');
      if (ctx && this.width > 0 && this.height > 0) {
        const imageData = ctx.getImageData(0, 0, Math.min(this.width, 2), Math.min(this.height, 2));
        for (let i = 0; i < imageData.data.length; i += 4) {
          imageData.data[i] = (imageData.data[i] + Math.floor(Math.random() * 3) - 1) & 0xFF;
        }
        ctx.putImageData(imageData, 0, 0);
      }
    } catch (e) {}
    return origToDataURL.call(this, type, quality);
  };

  const origToBlob = HTMLCanvasElement.prototype.toBlob;
  HTMLCanvasElement.prototype.toBlob = function(callback, type, quality) {
    try {
      const ctx = this.getContext('2d');
      if (ctx && this.width > 0 && this.height > 0) {
        const imageData = ctx.getImageData(0, 0, Math.min(this.width, 2), Math.min(this.height, 2));
        for (let i = 0; i < imageData.data.length; i += 4) {
          imageData.data[i] = (imageData.data[i] + Math.floor(Math.random() * 3) - 1) & 0xFF;
        }
        ctx.putImageData(imageData, 0, 0);
      }
    } catch (e) {}
    return origToBlob.call(this, callback, type, quality);
  };

  // ── WebGL Fingerprint Scrambling ──
  const origGetParameter = WebGLRenderingContext.prototype.getParameter;
  WebGLRenderingContext.prototype.getParameter = function(param) {
    // UNMASKED_VENDOR_WEBGL = 0x9245, UNMASKED_RENDERER_WEBGL = 0x9246
    if (param === 0x9245) return 'Google Inc. (Diamond)';
    if (param === 0x9246) return 'ANGLE (Diamond, Generic GPU, OpenGL)';
    return origGetParameter.call(this, param);
  };

  // Also override WebGL2
  if (typeof WebGL2RenderingContext !== 'undefined') {
    const origGetParam2 = WebGL2RenderingContext.prototype.getParameter;
    WebGL2RenderingContext.prototype.getParameter = function(param) {
      if (param === 0x9245) return 'Google Inc. (Diamond)';
      if (param === 0x9246) return 'ANGLE (Diamond, Generic GPU, OpenGL)';
      return origGetParam2.call(this, param);
    };
  }

  // ── Navigator API Spoofing ──
  // Spoof hardware concurrency to generic value
  try {
    Object.defineProperty(navigator, 'hardwareConcurrency', { get: () => 4, configurable: true });
  } catch(e) {}

  // Block Battery API (leaks device info)
  try {
    if (navigator.getBattery) {
      Object.defineProperty(navigator, 'getBattery', {
        value: () => Promise.reject(new Error('Battery API disabled')),
        configurable: true
      });
    }
  } catch(e) {}

  // Spoof device memory to generic value
  try {
    Object.defineProperty(navigator, 'deviceMemory', { get: () => 8, configurable: true });
  } catch(e) {}

  // ── AudioContext Fingerprint Protection ──
  if (typeof AudioContext !== 'undefined') {
    const origCreateOscillator = AudioContext.prototype.createOscillator;
    AudioContext.prototype.createOscillator = function() {
      const osc = origCreateOscillator.call(this);
      // Add slight detune noise to prevent audio fingerprinting
      try { osc.detune.value = Math.random() * 0.001; } catch(e) {}
      return osc;
    };
  }
})();
`;

const WEBRTC_PROTECTION_SCRIPT = `
(function diamondWebRTCShield() {
  'use strict';
  if (window.__diamondWebRTCShield) return;
  window.__diamondWebRTCShield = true;

  // Prevent WebRTC from leaking local/public IP addresses
  // Override RTCPeerConnection to force relay-only ICE candidates
  const OriginalRTCPeerConnection = window.RTCPeerConnection || window.webkitRTCPeerConnection;

  if (!OriginalRTCPeerConnection) return;

  const ProxiedRTCPeerConnection = function(config, constraints) {
    // Force ICE transport policy to 'relay' — prevents local IP leaks
    if (config) {
      config.iceTransportPolicy = 'relay';
    } else {
      config = { iceTransportPolicy: 'relay' };
    }

    // Filter out non-TURN ICE servers to enforce relay-only
    if (config.iceServers) {
      config.iceServers = config.iceServers.filter(function(server) {
        if (server.urls) {
          const urls = Array.isArray(server.urls) ? server.urls : [server.urls];
          return urls.some(function(url) { return url.startsWith('turn:') || url.startsWith('turns:'); });
        }
        return false;
      });
    }

    return new OriginalRTCPeerConnection(config, constraints);
  };

  ProxiedRTCPeerConnection.prototype = OriginalRTCPeerConnection.prototype;
  window.RTCPeerConnection = ProxiedRTCPeerConnection;
  if (window.webkitRTCPeerConnection) {
    window.webkitRTCPeerConnection = ProxiedRTCPeerConnection;
  }
})();
`;

// ─── Whitelist Management ───────────────────────────────────────

function loadWhitelist(): string[] {
  try {
    if (fs.existsSync(whitelistPath)) {
      const data = fs.readFileSync(whitelistPath, 'utf-8');
      return JSON.parse(data);
    }
  } catch (e) {
    console.warn('[Diamond AdBlock] Failed to load whitelist:', e);
  }
  return [];
}

function saveWhitelist(): void {
  try {
    if (!fs.existsSync(cacheDir)) fs.mkdirSync(cacheDir, { recursive: true });
    fs.writeFileSync(whitelistPath, JSON.stringify(whitelist, null, 2));
  } catch (e) {
    console.warn('[Diamond AdBlock] Failed to save whitelist:', e);
  }
}

function isWhitelisted(url: string): boolean {
  try {
    const hostname = new URL(url).hostname.replace('www.', '');
    return whitelist.some(wl => hostname === wl || hostname.endsWith('.' + wl));
  } catch {
    return false;
  }
}

// ─── Per-Site Stats ─────────────────────────────────────────────

function recordBlockedForSite(url: string): void {
  try {
    const hostname = new URL(url).hostname;
    perSiteStats.set(hostname, (perSiteStats.get(hostname) || 0) + 1);
  } catch {}
}

// ─── Initialize ─────────────────────────────────────────────────

export async function initAdBlocker(): Promise<void> {
  try {
    console.log('[Diamond AdBlock] Initializing v3 with 7 filter lists...');

    if (!fs.existsSync(cacheDir)) fs.mkdirSync(cacheDir, { recursive: true });

    // Load whitelist
    whitelist = loadWhitelist();

    // Load from cache OR download 7 filter lists
    blocker = await ElectronBlocker.fromLists(fetch, FILTER_LIST_URLS, {
      path: engineCachePath,
      read: fs.promises.readFile,
      write: fs.promises.writeFile,
    });

    enableBlockingOnSessions();

    // Track blocked requests with per-site stats
    blocker.on('request-blocked', (request: any) => {
      adsBlockedCount++;
      if (request && request.url) recordBlockedForSite(request.url);
    });

    blocker.on('request-redirected', () => {
      trackersBlockedCount++;
    });

    scheduleFilterRefresh();

    console.log(`[Diamond AdBlock] ✅ v3 active! 7 lists + fingerprint + WebRTC + whitelist`);
  } catch (err) {
    console.error('[Diamond AdBlock] Failed to initialize:', err);
  }
}

// ─── Session Blocking ───────────────────────────────────────────

function enableBlockingOnSessions() {
  if (!blocker) return;
  try { blocker.enableBlockingInSession(session.defaultSession); } catch (e) {
    console.warn('[Diamond AdBlock] Default session attach failed:', e);
  }
  try {
    const ds = session.fromPartition('persist:diamond');
    blocker.enableBlockingInSession(ds);
  } catch (e) {
    console.warn('[Diamond AdBlock] Diamond session attach failed:', e);
  }
}

function disableBlockingOnSessions() {
  if (!blocker) return;
  try { blocker.disableBlockingInSession(session.defaultSession); } catch (e) {}
  try {
    const ds = session.fromPartition('persist:diamond');
    blocker.disableBlockingInSession(ds);
  } catch (e) {}
}

// ─── Cosmetic + Privacy Injection ───────────────────────────────

export function injectCosmeticFilters(contents: Electron.WebContents): void {
  if (!isEnabled) return;

  contents.on('dom-ready', () => {
    if (!isEnabled) return;
    const url = contents.getURL();
    if (isWhitelisted(url)) return;

    const urlLower = url.toLowerCase();

    // Generic ad hiding
    contents.insertCSS(GENERIC_AD_CSS).catch(() => {});
    contents.insertCSS(COMMON_SITES_AD_CSS).catch(() => {});

    // Privacy shield — always inject
    contents.executeJavaScript(FINGERPRINT_PROTECTION_SCRIPT).catch(() => {});
    contents.executeJavaScript(WEBRTC_PROTECTION_SCRIPT).catch(() => {});

    // YouTube
    if (urlLower.includes('youtube.com') || urlLower.includes('youtu.be')) {
      contents.insertCSS(YOUTUBE_AD_CSS).catch(() => {});
      contents.executeJavaScript(YOUTUBE_AUTOSKIP_SCRIPT).catch(() => {});
    }

    // Google Search
    if (urlLower.includes('google.com/search') || urlLower.includes('google.co.')) {
      contents.insertCSS(GOOGLE_AD_CSS).catch(() => {});
    }
  });

  // SPA re-injection (YouTube navigation without full reload)
  contents.on('did-navigate-in-page', () => {
    if (!isEnabled) return;
    const url = contents.getURL();
    if (isWhitelisted(url)) return;

    const urlLower = url.toLowerCase();
    if (urlLower.includes('youtube.com') || urlLower.includes('youtu.be')) {
      contents.insertCSS(YOUTUBE_AD_CSS).catch(() => {});
      contents.executeJavaScript(YOUTUBE_AUTOSKIP_SCRIPT).catch(() => {});
    }
  });
}

// ─── Popup Ad Checking ──────────────────────────────────────────
// Called from main.ts setWindowOpenHandler to check if popup is an ad

export function isPopupAd(popupUrl: string): boolean {
  if (!blocker || !isEnabled) return false;
  if (isWhitelisted(popupUrl)) return false;

  try {
    const result = blocker.match({
      type: 'document',
      url: popupUrl,
      sourceUrl: popupUrl,
    } as any);

    if (result && result.match) {
      adsBlockedCount++;
      recordBlockedForSite(popupUrl);
      console.log(`[Diamond AdBlock] 🚫 Blocked ad popup: ${popupUrl.substring(0, 80)}`);
      return true;
    }
  } catch (e) {
    // If match fails, allow the popup (safety-first approach)
  }

  return false;
}

// ─── Filter Refresh (24h) ───────────────────────────────────────

function scheduleFilterRefresh() {
  const TWENTY_FOUR_HOURS = 24 * 60 * 60 * 1000;
  if (refreshTimer) clearInterval(refreshTimer);

  refreshTimer = setInterval(async () => {
    try {
      console.log('[Diamond AdBlock] 🔄 Refreshing 7 filter lists...');
      const newBlocker = await ElectronBlocker.fromLists(fetch, FILTER_LIST_URLS, {
        path: engineCachePath,
        read: fs.promises.readFile,
        write: fs.promises.writeFile,
      });

      if (blocker && isEnabled) disableBlockingOnSessions();
      blocker = newBlocker;
      if (isEnabled) enableBlockingOnSessions();

      console.log('[Diamond AdBlock] ✅ Filter lists refreshed.');
    } catch (err) {
      console.warn('[Diamond AdBlock] Refresh failed:', err);
    }
  }, TWENTY_FOUR_HOURS);
}

// ─── IPC Handlers ───────────────────────────────────────────────

export function setupAdBlockerIPC(): void {
  // Stats
  ipcMain.handle('get-adblock-stats', () => ({
    enabled: isEnabled,
    adsBlocked: adsBlockedCount,
    trackersBlocked: trackersBlockedCount,
    totalBlocked: adsBlockedCount + trackersBlockedCount,
    perSite: Object.fromEntries(perSiteStats),
  }));

  // Toggle global on/off
  ipcMain.handle('toggle-adblock', (_event, enabled: boolean) => {
    isEnabled = enabled;
    if (blocker) {
      if (enabled) { enableBlockingOnSessions(); } else { disableBlockingOnSessions(); }
    }
    return { enabled: isEnabled };
  });

  // Reset stats
  ipcMain.handle('reset-adblock-stats', () => {
    adsBlockedCount = 0;
    trackersBlockedCount = 0;
    perSiteStats.clear();
    return { adsBlocked: 0, trackersBlocked: 0 };
  });

  // ── Whitelist Management ──
  ipcMain.handle('get-adblock-whitelist', () => whitelist);

  ipcMain.handle('whitelist-site', (_event, hostname: string) => {
    const clean = hostname.replace('www.', '').toLowerCase();
    if (!whitelist.includes(clean)) {
      whitelist.push(clean);
      saveWhitelist();
    }
    return { whitelist };
  });

  ipcMain.handle('unwhitelist-site', (_event, hostname: string) => {
    const clean = hostname.replace('www.', '').toLowerCase();
    whitelist = whitelist.filter(w => w !== clean);
    saveWhitelist();
    return { whitelist };
  });

  console.log('[Diamond AdBlock] v3 IPC handlers registered.');
}

// ─── Dashboard Sync Helper ──────────────────────────────────────
// Returns stats object for Firestore logging (called from main.ts)

export function getAdBlockStatsForSync() {
  return {
    enabled: isEnabled,
    adsBlocked: adsBlockedCount,
    trackersBlocked: trackersBlockedCount,
    totalBlocked: adsBlockedCount + trackersBlockedCount,
    topBlockedSites: Array.from(perSiteStats.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([site, count]) => ({ site, count })),
    lastUpdated: new Date().toISOString(),
  };
}

// ─── Getters ────────────────────────────────────────────────────

export function getAdBlockStats() {
  return {
    enabled: isEnabled,
    adsBlocked: adsBlockedCount,
    trackersBlocked: trackersBlockedCount,
    totalBlocked: adsBlockedCount + trackersBlockedCount,
  };
}

export function isAdBlockEnabled(): boolean { return isEnabled; }

// ─── Cleanup ────────────────────────────────────────────────────

app.on('will-quit', () => {
  if (refreshTimer) { clearInterval(refreshTimer); refreshTimer = null; }
});

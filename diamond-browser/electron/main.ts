/**
 * Diamond Browser — Electron Main Process
 * 
 * 5-Layer Defense-in-Depth Child Protection:
 *   Layer 1: Cloudflare Family DNS-over-HTTPS (millions of domains)
 *   Layer 2: Firebase Dynamic Policy Sync (parent-managed rules)
 *   Layer 3: Local Safety Filter (keyword/domain/category fallback)
 *   Layer 4: In-Page DOM Content Scanner (MutationObserver + text redaction)
 *   Layer 5: On-Device ML Image Analysis (nsfwjs + IntersectionObserver)
 * 
 * + Brave-Style Ad & Tracker Blocker (EasyList + EasyPrivacy)
 */

import { app, BrowserWindow, ipcMain, session, dialog, shell } from 'electron';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs';
import os from 'node:os';
import { db } from '../src/firebase';
import { collection, addDoc, serverTimestamp } from 'firebase/firestore';
import { checkUrlSafety, enforceSafeSearch } from '../src/safetyFilter';
import { initPolicySync, destroyPolicySync, getPolicy, onPolicyChange, updatePolicyFromIPC } from '../src/policySync';
import {
  readLocalPolicy,
  watchLocalPolicy,
  recordLocalAlert,
  recordLocalNavigation,
  recordLocalRequest,
  getLocalHistory,
  clearLocalHistory,
  deleteLocalHistoryItem,
  getBookmarks,
  addBookmark,
  removeBookmark,
  recordLocalDownload,
  getLocalDownloads,
  clearLocalDownloads,
} from './localPolicy';
import { initAdBlocker, setupAdBlockerIPC, injectCosmeticFilters, isPopupAd, getAdBlockStatsForSync } from './adBlocker';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

process.env.APP_ROOT = path.join(__dirname, '..');

export const VITE_DEV_SERVER_URL = process.env['VITE_DEV_SERVER_URL'];
export const MAIN_DIST = path.join(process.env.APP_ROOT, 'dist-electron');
export const RENDERER_DIST = path.join(process.env.APP_ROOT, 'dist');

process.env.VITE_PUBLIC = VITE_DEV_SERVER_URL
  ? path.join(process.env.APP_ROOT, 'public')
  : RENDERER_DIST;

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// LAYER 1: Cloudflare Family DNS-over-HTTPS
// Must be set BEFORE app.whenReady()
// This blocks millions of adult, malware, and phishing domains at
// the DNS level — the single most impactful protection layer.
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
app.commandLine.appendSwitch(
  'dns-over-https-templates',
  'https://family.cloudflare-dns.com/dns-query'
);
app.commandLine.appendSwitch('enable-features', 'DnsOverHttps');

let win: BrowserWindow | null;

// Path to the webview preload script (Layer 4 DOM scanner)
const webviewPreloadPath = path.join(__dirname, 'webviewPreload.js');

// ─── Config Management (Pairing) ────────────────────────────────
const configDir = path.join(os.homedir(), '.diamond');
const configPath = path.join(configDir, 'config.json');

export function getAppConfig() {
  try {
    if (fs.existsSync(configPath)) {
      return JSON.parse(fs.readFileSync(configPath, 'utf8'));
    }
  } catch (err) {
    console.error('[Diamond] Error reading config:', err);
  }
  return {};
}

export function saveAppConfig(config: any) {
  try {
    if (!fs.existsSync(configDir)) {
      fs.mkdirSync(configDir, { recursive: true });
    }
    const existing = getAppConfig();
    fs.writeFileSync(configPath, JSON.stringify({ ...existing, ...config }, null, 2));
    return true;
  } catch (err) {
    console.error('[Diamond] Error saving config:', err);
    return false;
  }
}

// ─── Window Creation ────────────────────────────────────────────

function createWindow() {
  const preloadPath = path.join(__dirname, 'preload.js');
  console.log('[Diamond] __dirname =', __dirname);
  console.log('[Diamond] Preload path =', preloadPath);
  
  // Verify preload file exists
  const fs = require('fs');
  console.log('[Diamond] Preload file exists:', fs.existsSync(preloadPath));
  
  win = new BrowserWindow({
    width: 1280,
    height: 820,
    title: 'Diamond — Child-Safe Web Browser',
    icon: path.join(process.env.VITE_PUBLIC!, 'favicon.svg'),
    autoHideMenuBar: true,
    titleBarStyle: 'hidden',
    titleBarOverlay: {
      color: '#101010',
      symbolColor: '#9ca3af',
      height: 38,
    },
    webPreferences: {
      preload: preloadPath,
      webviewTag: true,
      sandbox: false,
    },
  });

  // Setup all protection layers
  setupNetworkInterceptors();     // Layer 1 + 3
  setupDownloadManager();         // Executable blocking
  setupGuestWebContentsWatcher(); // Layer 3 + 4 for webview
  setupIPCHandlers();             // IPC for renderer
  setupAdBlockerIPC();            // Ad blocker IPC
  console.log('[Diamond] All IPC handlers registered successfully.');

  if (VITE_DEV_SERVER_URL) {
    win.loadURL(VITE_DEV_SERVER_URL);
  } else {
    win.loadFile(path.join(RENDERER_DIST, 'index.html'));
  }

  // Debug: verify preload is working
  win.webContents.on('did-finish-load', () => {
    win!.webContents.executeJavaScript(`
      console.log('[Diamond Renderer] electronAPI available:', !!window.electronAPI);
      console.log('[Diamond Renderer] addBookmark fn:', typeof window.electronAPI?.addBookmark);
      console.log('[Diamond Renderer] getBookmarks fn:', typeof window.electronAPI?.getBookmarks);
    `).catch(() => {});
  });
}

// ─── Set Standard User Agent ────────────────────────────────────
// Fixes blank pages on YouTube and other sites that block Electron
app.userAgentFallback = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36";

let _lastNotifyUrl = '';
let _lastNotifyTime = 0;

export function notifySiteBlocked(url: string, category: string, reason: string, layer: string) {
  // Dedup: skip if same URL was notified within 2 seconds
  const now = Date.now();
  if (url === _lastNotifyUrl && now - _lastNotifyTime < 2000) return;
  _lastNotifyUrl = url;
  _lastNotifyTime = now;

  logSecurityAlert(url, category, reason);
  recordLocalNavigation(url, category ? `Blocked: ${category}` : 'Blocked Site', true);
  if (win && !win.isDestroyed()) {
    win.webContents.send('site-blocked', { url, category, reason, layer });
  }
}

export function getBlockedPageUrl(targetUrl: string, category?: string, reason?: string, layer?: string): string {
  const params = new URLSearchParams({
    url: targetUrl,
    category: category || 'Restricted Site',
    reason: reason || 'Access to this website was restricted by Diamond Shield.',
    layer: layer || 'filter',
  });

  if (VITE_DEV_SERVER_URL) {
    return `${VITE_DEV_SERVER_URL}blocked.html?${params.toString()}`;
  } else {
    const filePath = path.join(RENDERER_DIST, 'blocked.html').replace(/\\/g, '/');
    return `file://${filePath}?${params.toString()}`;
  }
}

// ─── Layer 1+3: Network Interceptors ────────────────────────────

function setupNetworkInterceptors() {
  const customUserAgent = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36";
  
  session.defaultSession.setUserAgent(customUserAgent);
  attachInterceptorsToSession(session.defaultSession);
  
  const diamondSession = session.fromPartition('persist:diamond');
  diamondSession.setUserAgent(customUserAgent);
  attachInterceptorsToSession(diamondSession);
}

function attachInterceptorsToSession(sess: Electron.Session) {
  // Strip CSP to ensure ML model fetches and preload scripts are never blocked
  sess.webRequest.onHeadersReceived((details, callback) => {
    const responseHeaders = { ...details.responseHeaders };
    
    for (const header in responseHeaders) {
      if (header.toLowerCase().startsWith('content-security-policy')) {
        delete responseHeaders[header];
      }
    }

    callback({ cancel: false, responseHeaders });
  });

  // Global request filter
  sess.webRequest.onBeforeRequest(
    { urls: ['*://*/*'] },
    (details, callback) => {
      try {
        const parsed = new URL(details.url);

        // Skip internal Electron/Vite dev server URLs and blocked redirect page
        if (
          parsed.hostname === 'localhost' ||
          parsed.hostname === '127.0.0.1' ||
          parsed.pathname.endsWith('blocked.html') ||
          parsed.protocol === 'devtools:' ||
          parsed.protocol === 'chrome-extension:'
        ) {
          return callback({ cancel: false });
        }

        // Block Google internal widget/iframe URLs at the NETWORK level.
        // These are background frames (hovercards, sidepanels, GAPI loaders) that
        // Gmail/Drive load invisibly. If they reach the main frame, they hijack the page.
        // Only block main_frame requests - sub_frame and other resource types are OK.
        if (details.resourceType === 'mainFrame') {
          const urlStr = details.url;
          const isGoogleWidget = (
            urlStr.includes('usegapi=1') ||
            urlStr.includes('/hovercard/') ||
            urlStr.includes('gapi.gapi') ||
            (parsed.hostname.includes('contacts.google.com') && parsed.pathname.includes('/widget')) ||
            (parsed.hostname.includes('studio.workspace.google.com') && parsed.pathname.includes('/sidepanel')) ||
            (parsed.hostname.includes('people-pa.clients6.google.com'))
          );
          if (isGoogleWidget) {
            console.log(`[DIAMOND] Blocked widget main_frame navigation: ${urlStr.substring(0, 100)}`);
            return callback({ cancel: true });
          }
        }

        // SafeSearch enforcement for search engines
        if (parsed.hostname.includes('google.') && parsed.pathname.includes('/search')) {
          if (!parsed.searchParams.has('safe') || parsed.searchParams.get('safe') !== 'active') {
            parsed.searchParams.set('safe', 'active');
            return callback({ cancel: false, redirectURL: parsed.toString() });
          }
        }
        if (parsed.hostname.includes('bing.') && parsed.pathname.includes('/search')) {
          if (parsed.searchParams.get('adlt') !== 'strict') {
            parsed.searchParams.set('adlt', 'strict');
            return callback({ cancel: false, redirectURL: parsed.toString() });
          }
        }
        if (parsed.hostname.includes('duckduckgo.') && parsed.searchParams.get('kp') !== '1') {
          parsed.searchParams.set('kp', '1');
          return callback({ cancel: false, redirectURL: parsed.toString() });
        }
        if (parsed.hostname.includes('yahoo.') && parsed.searchParams.get('vm') !== 'r') {
          parsed.searchParams.set('vm', 'r');
          return callback({ cancel: false, redirectURL: parsed.toString() });
        }

        // Layer 3: Local safety filter check
        let targetCheckUrl = details.url;
        if (parsed.hostname.includes('google.') && parsed.pathname === '/url') {
          const dest = parsed.searchParams.get('url') || parsed.searchParams.get('q');
          if (dest) targetCheckUrl = dest;
        }

        const safetyCheck = checkUrlSafety(targetCheckUrl);
        if (safetyCheck.blocked) {
          // Only notify renderer and log for main_frame requests (not sub-resources)
          if (details.resourceType === 'mainFrame') {
            console.warn(
              `[DIAMOND SHIELD] Blocked: ${targetCheckUrl} | Category: ${safetyCheck.category} | Layer: ${safetyCheck.layer}`
            );
            notifySiteBlocked(
              targetCheckUrl,
              safetyCheck.category || 'Restricted',
              safetyCheck.reason || 'Filter matched',
              safetyCheck.layer || 'filter'
            );
          }

          return callback({ cancel: true });
        }
      } catch {
        // Invalid URL format — allow to proceed (DNS will handle it)
      }

      callback({ cancel: false });
    }
  );

  // Global header overrides
  sess.webRequest.onBeforeSendHeaders(
    { urls: ['*://*/*'] },
    (details, callback) => {
      const url = details.url.toLowerCase();
      
      // Use standard Google Chrome UA. Edge sometimes causes frame-busting bugs in Workspace Studio.
      details.requestHeaders['User-Agent'] = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36';
      
      // Spoof Chrome client hints. Deleting them entirely causes Google to flag the browser as anomalous!
      details.requestHeaders['sec-ch-ua'] = '"Not_A Brand";v="8", "Chromium";v="130", "Google Chrome";v="130"';
      details.requestHeaders['sec-ch-ua-mobile'] = '?0';
      details.requestHeaders['sec-ch-ua-platform'] = '"Windows"';

      // Safe mode injections
      if (url.includes('youtube.com') || url.includes('googlevideo.com')) {
        details.requestHeaders['YouTube-Restrict'] = 'Strict';
      }
      if (url.includes('google.com')) {
        details.requestHeaders['x-safe-search'] = 'strict';
      }
      
      callback({ cancel: false, requestHeaders: details.requestHeaders });
    }
  );
}

// ─── Layer 3+4: Guest WebContents Watcher ───────────────────────

function setupGuestWebContentsWatcher() {
  app.on('web-contents-created', (_event, contents) => {
    // ── Handle new window requests ──
    contents.setWindowOpenHandler(({ url }) => {
      // Always deny the popup window itself - we never want new Electron windows
      
      try {
        const parsed = new URL(url);
        if (parsed.pathname.endsWith('blocked.html')) return { action: 'deny' };

        // Silently deny Google internal widget/iframe URLs that Gmail/Drive try to open.
        // These are background frames (hovercards, sidepanels, GAPI loaders) that should
        // never navigate the main tab. If they open as windows, they show blank white pages.
        const isGoogleWidget = (
          parsed.hostname.includes('contacts.google.com') && parsed.pathname.includes('/widget') ||
          parsed.hostname.includes('studio.workspace.google.com') && parsed.pathname.includes('/sidepanel') ||
          parsed.hostname.includes('people-pa.clients6.google.com') ||
          url.includes('usegapi=1') ||
          url.includes('/_/scs/') ||
          url.includes('/widget/') ||
          url.includes('/hovercard/') ||
          url.includes('gapi.gapi')
        );
        if (isGoogleWidget) {
          console.log(`[DIAMOND] Silently denied Google widget popup: ${url.substring(0, 100)}...`);
          return { action: 'deny' };
        }

        // Resolve Google redirect URLs
        let targetUrl = url;
        if (parsed.hostname.includes('google.') && parsed.pathname === '/url') {
          const dest = parsed.searchParams.get('url') || parsed.searchParams.get('q');
          if (dest) targetUrl = dest;
        }

        // Check safety
        const check = checkUrlSafety(targetUrl);
        if (check.blocked) {
          console.warn(`[DIAMOND SHIELD] Blocked popup: ${targetUrl}`);
          notifySiteBlocked(
            targetUrl,
            check.category || 'Restricted',
            check.reason || 'Blocked link attempt',
            check.layer || 'filter'
          );
          if (contents.getType() === 'webview') {
            const blockedUrl = getBlockedPageUrl(targetUrl, check.category, check.reason, check.layer);
            setImmediate(() => contents.loadURL(blockedUrl));
          }
          return { action: 'deny' };
        }

        // Ad Blocker: Check if popup is an ad
        if (isPopupAd(targetUrl)) {
          return { action: 'deny' };
        }

        // Safe real link (target="_blank" etc) - navigate the current webview to it
        if (contents.getType() === 'webview') {
          setImmediate(() => contents.loadURL(targetUrl));
        }
      } catch (e) {
        console.warn('[DIAMOND] Error in window open handler:', e);
      }

      return { action: 'deny' };
    });

    if (contents.getType() === 'webview') {
      // ── Ad Blocker: Cosmetic filtering + YouTube auto-skip ──
      injectCosmeticFilters(contents);

      // ── Block DevTools in webview (anti-bypass) ──
      contents.on('devtools-opened', () => {
        contents.closeDevTools();
        console.warn('[DIAMOND SHIELD] DevTools blocked in webview');
      });

      // ── Layer 3: Navigation safety check ──
      contents.on('will-navigate', (event, navigationUrl) => {
        // Block Google internal widget URLs from hijacking the main tab
        if (
          navigationUrl.includes('studio.workspace.google.com/') && navigationUrl.includes('/sidepanel') ||
          navigationUrl.includes('contacts.google.com/widget') ||
          navigationUrl.includes('usegapi=1') ||
          navigationUrl.includes('/hovercard/') ||
          navigationUrl.includes('gapi.gapi')
        ) {
          event.preventDefault();
          console.log(`[DIAMOND] Blocked widget navigation: ${navigationUrl.substring(0, 100)}...`);
          return;
        }

        let targetUrl = navigationUrl;
        try {
          const parsed = new URL(navigationUrl);
          if (parsed.pathname.endsWith('blocked.html')) return;
          if (parsed.hostname.includes('google.') && parsed.pathname === '/url') {
            const dest = parsed.searchParams.get('url') || parsed.searchParams.get('q');
            if (dest) targetUrl = dest;
          }
        } catch {}

        const check = checkUrlSafety(targetUrl);
        if (check.blocked) {
          event.preventDefault();
          console.warn(`[DIAMOND SHIELD] Blocked webview navigation: ${targetUrl}`);
          notifySiteBlocked(
            targetUrl,
            check.category || 'Restricted',
            check.reason || 'Navigation blocked',
            check.layer || 'filter'
          );
          // Load blocked page directly INTO the webview
          const blockedUrl = getBlockedPageUrl(targetUrl, check.category, check.reason, check.layer);
          setImmediate(() => contents.loadURL(blockedUrl));
        }
      });

      contents.on('will-redirect', (event, redirectUrl) => {
        let targetUrl = redirectUrl;
        try {
          const parsed = new URL(redirectUrl);
          if (parsed.pathname.endsWith('blocked.html')) return;
        } catch {}

        const check = checkUrlSafety(targetUrl);
        if (check.blocked) {
          event.preventDefault();
          console.warn(`[DIAMOND SHIELD] Blocked webview redirect: ${targetUrl}`);
          notifySiteBlocked(
            targetUrl,
            check.category || 'Restricted',
            check.reason || 'Redirect blocked',
            check.layer || 'filter'
          );
          // Load blocked page directly INTO the webview
          const blockedUrl = getBlockedPageUrl(targetUrl, check.category, check.reason, check.layer);
          setImmediate(() => contents.loadURL(blockedUrl));
        }
      });

      // ── Layer 4+5: Listen for content-flagged and image-blocked messages from webview preload ──
      contents.on('ipc-message', (_event, channel, data) => {
        if (channel === 'content-flagged' && data) {
          console.warn(`[DIAMOND SHIELD L4] Content flagged by DOM scanner: ${data.url} | ${data.reason}`);
          notifySiteBlocked(
            data.url,
            data.category || 'Inappropriate Content',
            data.reason || 'DOM content scan flagged',
            'content-scan'
          );
          const blockedUrl = getBlockedPageUrl(data.url, data.category, data.reason, 'content-scan');
          setImmediate(() => contents.loadURL(blockedUrl));
        }

        // Layer 5: Image was blocked by ML analysis (logged but page is NOT blocked —
        // individual images are blurred in-page by the preload script)
        if (channel === 'image-blocked' && data) {
          console.warn(`[DIAMOND SHIELD L5] Image blocked by ML: ${data.imageUrl?.substring(0, 80)} | ${data.classification}`);
          recordLocalAlert({
            url: data.pageUrl || '',
            category: 'Inappropriate Image',
            reason: `ML model detected inappropriate image (${data.classification}) on page`,
            severity: 'MEDIUM',
          });
        }
      });

      // ── Handle load failures (ONLY for top-level main frame, never subresources) ──
      contents.on('did-fail-load', (_event, errorCode, _errorDesc, validatedURL, isMainFrame) => {
        if (!isMainFrame) return;
        if (!validatedURL || validatedURL.startsWith('chrome') || validatedURL.startsWith('devtools')) return;
        if (validatedURL.includes('blocked.html')) return;
        if (errorCode === -3) return; // Ignore standard user-aborted navigations

        const check = checkUrlSafety(validatedURL);
        if (check.blocked) {
          notifySiteBlocked(
            validatedURL,
            check.category || 'Restricted',
            check.reason || 'Filter matched',
            check.layer || 'filter'
          );
          const blockedUrl = getBlockedPageUrl(validatedURL, check.category, check.reason, check.layer);
          setImmediate(() => contents.loadURL(blockedUrl));
        } else if (errorCode === -105 || errorCode === -20) {
          notifySiteBlocked(
            validatedURL,
            'Blocked by Shield Protection',
            'Access to this domain was restricted by Diamond Shield or Cloudflare Family DNS.',
            'dns'
          );
          const blockedUrl = getBlockedPageUrl(validatedURL, 'Blocked by Shield Protection', 'Access to this domain was restricted by Diamond Shield or Cloudflare Family DNS.', 'dns');
          setImmediate(() => contents.loadURL(blockedUrl));
        }
      });
    }
  });
}

// ─── Download Manager ───────────────────────────────────────────

const BLOCKED_EXTENSIONS = [
  '.exe', '.bat', '.msi', '.cmd', '.ps1', '.scr',
  '.vbs', '.wsf', '.com', '.pif', '.reg', '.inf',
  '.cpl', '.hta', '.jar', '.jnlp',
];

const activeDownloads: Record<string, any> = {};

function setupDownloadManager() {
  attachDownloadListenerToSession(session.defaultSession);
  attachDownloadListenerToSession(session.fromPartition('persist:diamond'));
}

function attachDownloadListenerToSession(sess: Electron.Session) {
  sess.on('will-download', (event, item, webContents) => {
    const filename = item.getFilename().toLowerCase();

    const isBlocked = BLOCKED_EXTENSIONS.some(ext => filename.endsWith(ext));
    if (isBlocked) {
      event.preventDefault();
      dialog.showMessageBox({
        type: 'warning',
        title: '🛡️ Download Blocked by Diamond',
        message: `Download blocked: "${item.getFilename()}"\n\nExecutable and script files are blocked to protect this device.`,
        buttons: ['Understood'],
      });
      logSecurityAlert(item.getURL(), 'Malware Prevention', `Blocked download of executable file: ${filename}`);
      return;
    }

    const downloadId = Date.now().toString();
    const startTime = new Date().toISOString();
    const sendUpdate = (state: string) => {
      const data = {
        id: downloadId,
        filename: item.getFilename(),
        url: item.getURL(),
        receivedBytes: item.getReceivedBytes(),
        totalBytes: item.getTotalBytes(),
        state: state,
        savePath: item.getSavePath(),
        startTime,
        completedAt: state === 'completed' ? new Date().toISOString() : undefined,
      };
      activeDownloads[downloadId] = data;
      if (win && !win.isDestroyed()) {
        win.webContents.send('download-progress', data);
      }
    };

    sendUpdate('progressing');

    item.on('updated', (event, state) => {
      if (state === 'interrupted') sendUpdate('interrupted');
      else if (state === 'progressing') {
        if (item.isPaused()) sendUpdate('paused');
        else sendUpdate('progressing');
      }
    });

    item.once('done', (event, state) => {
      sendUpdate(state);
      // Persist completed/cancelled/interrupted downloads to disk
      if (activeDownloads[downloadId]) {
        recordLocalDownload(activeDownloads[downloadId]);
        console.log(`[Diamond] Download ${state}: ${item.getFilename()}`);
      }
    });
  });
}

// ─── IPC Handlers ───────────────────────────────────────────────

function setupIPCHandlers() {
  console.log('[Diamond] Setting up IPC handlers...');
  // Downloads
  ipcMain.handle('get-downloads', () => Object.values(activeDownloads));

  // Download history (persistent)
  ipcMain.handle('get-download-history', () => {
    // Merge in-memory active downloads with persisted history
    const persisted = getLocalDownloads();
    const activeList = Object.values(activeDownloads);
    // Merge: active downloads take priority (they have live progress)
    const mergedMap = new Map<string, any>();
    for (const d of persisted) mergedMap.set(d.id, d);
    for (const d of activeList) mergedMap.set(d.id, d); // overwrite with active
    return Array.from(mergedMap.values()).sort((a: any, b: any) => {
      const timeA = a.startTime ? new Date(a.startTime).getTime() : Number(a.id);
      const timeB = b.startTime ? new Date(b.startTime).getTime() : Number(b.id);
      return timeB - timeA; // newest first
    });
  });

  ipcMain.handle('clear-download-history', () => {
    // Clear both in-memory and persisted
    Object.keys(activeDownloads).forEach(k => delete activeDownloads[k]);
    clearLocalDownloads();
  });

  // File actions for completed downloads
  ipcMain.handle('open-download-file', async (_event, savePath: string) => {
    if (savePath) {
      const result = await shell.openPath(savePath);
      if (result) console.warn('[Diamond] Failed to open file:', result);
      return result;
    }
    return 'No file path provided';
  });

  ipcMain.handle('show-download-in-folder', (_event, savePath: string) => {
    if (savePath) {
      shell.showItemInFolder(savePath);
    }
  });

  // Normal browsing log
  ipcMain.handle('log-navigation', async (_event, url, title) => {
    recordLocalNavigation(url, title);
  });

  // Explicit block log from renderer
  ipcMain.handle('log-blocked', async (_event, url, reason, category) => {
    await logSecurityAlert(url, category || 'Restricted', reason || 'Blocked');
    recordLocalNavigation(url, category ? `Blocked: ${category}` : 'Blocked Site', true);
  });

  // Child requests parent permission
  ipcMain.handle('request-access', async (_event, url, category) => {
    recordLocalRequest(url, category || 'Restricted Page');
  });

  // Browser Menu Controls
  ipcMain.handle('new-window', () => {
    createWindow();
  });

  ipcMain.handle('close-window', (e) => {
    const window = BrowserWindow.fromWebContents(e.sender);
    if (window) window.close();
  });

  // History
  ipcMain.handle('get-history', () => {
    console.log('[IPC] get-history called');
    return getLocalHistory();
  });
  ipcMain.handle('clear-history', () => {
    console.log('[IPC] clear-history called');
    clearLocalHistory();
  });
  ipcMain.handle('delete-history-item', (_e, id) => {
    console.log('[IPC] delete-history-item called for id:', id);
    deleteLocalHistoryItem(id);
    return true;
  });

  // Bookmarks
  ipcMain.handle('get-bookmarks', () => {
    console.log('[IPC] get-bookmarks called');
    return getBookmarks();
  });
  ipcMain.handle('add-bookmark', (_e, url, title, favicon) => {
    console.log('[IPC] add-bookmark called with:', url, title);
    addBookmark(url, title, favicon);
    return true;
  });
  ipcMain.handle('remove-bookmark', (_e, url) => {
    console.log('[IPC] remove-bookmark called with:', url);
    removeBookmark(url);
    return true;
  });

  // Get current policy for renderer startup
  ipcMain.handle('get-current-policy', () => {
    return readLocalPolicy();
  });

  // Protection status query from renderer
  ipcMain.handle('get-protection-status', () => {
    const policy = getPolicy();
    return {
      layers: {
        dns: true,             // Layer 1: Cloudflare DoH always active
        cloudSync: true,       // Layer 2: Firebase / Local policy sync active
        localFilter: true,     // Layer 3: Local safety filter active
        contentScanner: true,  // Layer 4: DOM text scanner + MutationObserver active
        imageAnalysis: true,   // Layer 5: On-device ML image analysis active
      },
      mode: policy.mode,
      categories: {
        adultContent: policy.blockAdultContent,
        gambling: policy.blockGambling,
        socialMedia: policy.blockSocialMedia,
        gaming: policy.blockGaming,
        vpnProxy: policy.blockVpnProxy,
        urlShorteners: policy.blockUrlShorteners,
      },
    };
  });

  // Resolve custom redirect blocked URL for renderer
  ipcMain.handle('get-blocked-url', (_event, targetUrl, category, reason, layer) => {
    return getBlockedPageUrl(targetUrl, category, reason, layer);
  });

  // Get webview preload path (Synchronous)
  ipcMain.on('get-webview-preload-path-sync', (event) => {
    event.returnValue = `file://${webviewPreloadPath.replace(/\\\\/g, '/')}`;
  });

  // Pairing Config
  ipcMain.handle('get-config', () => {
    return getAppConfig();
  });
  
  ipcMain.handle('save-config', (_event, config) => {
    return saveAppConfig(config);
  });
}

let lastBlockedUrl = '';
let lastBlockedTime = 0;

function notifyBlocked(url: string, category?: string, reason?: string, layer?: string) {
  const now = Date.now();
  if (url === lastBlockedUrl && now - lastBlockedTime < 1200) {
    return;
  }
  lastBlockedUrl = url;
  lastBlockedTime = now;

  if (win && !win.isDestroyed()) {
    win.webContents.send('site-blocked', { url, category, reason, layer });
  }
}

async function logSecurityAlert(url: string, category: string, reason: string) {
  recordLocalAlert({ url, category, reason, severity: 'HIGH' });
  /* Firestore disabled — enable when API is active
  try {
    await addDoc(collection(db, 'alerts'), {
      type: 'BLOCKED_ATTEMPT',
      url,
      category,
      reason,
      timestamp: serverTimestamp(),
      userId: 'test-child-user',
      severity: 'HIGH',
    });
  } catch {}
  */
}

// ─── App Lifecycle ──────────────────────────────────────────────

app.on('window-all-closed', () => {
  destroyPolicySync();
  if (process.platform !== 'darwin') {
    app.quit();
    win = null;
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});

app.whenReady().then(async () => {
  // Layer 2: Load local policy immediately (Instant 0ms engine)
  const initialLocalPolicy = readLocalPolicy();
  updatePolicyFromIPC(initialLocalPolicy);
  console.log('[Diamond] Loaded local policy:', {
    blocked: initialLocalPolicy.customBlockedDomains,
    social: initialLocalPolicy.blockSocialMedia,
    adult: initialLocalPolicy.blockAdultContent,
    mode: initialLocalPolicy.mode,
  });

  // Watch for local policy file changes (from Dashboard edits)
  watchLocalPolicy((freshPolicy) => {
    console.log('[Diamond] Policy file change detected, broadcasting to browser...');
    updatePolicyFromIPC(freshPolicy);
    if (win && !win.isDestroyed()) {
      win.webContents.send('policy-changed', freshPolicy);
    }
  });

  // Layer 2: Also initialize Firebase policy sync (handles cloud if configured)
  console.log('[Diamond] Starting cloud policy sync...');
  const appConfig = getAppConfig();
  const activeChildId = appConfig.childId || 'test-child-user'; // fallback to test-child-user if unassigned
  
  initPolicySync(activeChildId).catch((err) => {
    console.warn('[Diamond] Cloud Firestore sync skipped:', err?.message || err);
  });

  // Forward policy changes to renderer
  onPolicyChange((policy) => {
    if (win && !win.isDestroyed()) {
      win.webContents.send('policy-changed', policy);
    }
  });

  // Initialize Diamond Ad Blocker v3 (7 filter lists + fingerprint + WebRTC protection)
  initAdBlocker().catch((err) => {
    console.warn('[Diamond] Ad blocker init failed (non-critical):', err?.message || err);
  });

  // Sync ad block stats to Firestore every 10 minutes (for parent dashboard)
  setInterval(async () => {
    try {
      const stats = getAdBlockStatsForSync();
      if (stats.totalBlocked > 0) {
        await addDoc(collection(db, 'adblock-stats'), {
          childId: appConfig.childId || 'test-child-user',
          ...stats,
          timestamp: serverTimestamp(),
        });
      }
    } catch (e) {
      // Non-critical — dashboard sync failure should not break the browser
    }
  }, 10 * 60 * 1000); // Every 10 minutes

  // Create the main window
  createWindow();
});

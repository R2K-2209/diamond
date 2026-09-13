/**
 * Diamond Browser — Electron Main Process
 * 
 * 4-Layer Defense-in-Depth Child Protection:
 *   Layer 1: Cloudflare Family DNS-over-HTTPS (millions of domains)
 *   Layer 2: Firebase Dynamic Policy Sync (parent-managed rules)
 *   Layer 3: Local Safety Filter (keyword/domain/category fallback)
 *   Layer 4: In-Page DOM Content Scanner (RTA tags, title analysis)
 */

import { app, BrowserWindow, ipcMain, session, dialog } from 'electron';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
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
  getBookmarks,
  addBookmark,
  removeBookmark,
} from './localPolicy';

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

let _lastNotifyUrl = '';
let _lastNotifyTime = 0;

export function notifySiteBlocked(url: string, category: string, reason: string, layer: string) {
  // Dedup: skip if same URL was notified within 2 seconds
  const now = Date.now();
  if (url === _lastNotifyUrl && now - _lastNotifyTime < 2000) return;
  _lastNotifyUrl = url;
  _lastNotifyTime = now;

  logSecurityAlert(url, category, reason);
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
  // Global request filter
  session.defaultSession.webRequest.onBeforeRequest(
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

  // YouTube Restricted Mode header injection
  session.defaultSession.webRequest.onBeforeSendHeaders(
    { urls: ['*://*.youtube.com/*', '*://*.googlevideo.com/*'] },
    (details, callback) => {
      details.requestHeaders['YouTube-Restrict'] = 'Strict';
      callback({ cancel: false, requestHeaders: details.requestHeaders });
    }
  );

  // Google SafeSearch header (belt + suspenders with URL param)
  session.defaultSession.webRequest.onBeforeSendHeaders(
    { urls: ['*://*.google.com/*'] },
    (details, callback) => {
      details.requestHeaders['x-safe-search'] = 'strict';
      callback({ cancel: false, requestHeaders: details.requestHeaders });
    }
  );
}

// ─── Layer 3+4: Guest WebContents Watcher ───────────────────────

function setupGuestWebContentsWatcher() {
  app.on('web-contents-created', (_event, contents) => {
    // ── Handle new window requests (prevent new windows, but check safety and redirect/navigate) ──
    contents.setWindowOpenHandler(({ url }) => {
      let targetUrl = url;
      try {
        const parsed = new URL(url);
        if (parsed.pathname.endsWith('blocked.html')) return { action: 'deny' };
        if (parsed.hostname.includes('google.') && parsed.pathname === '/url') {
          const dest = parsed.searchParams.get('url') || parsed.searchParams.get('q');
          if (dest) targetUrl = dest;
        }
      } catch {}

      const check = checkUrlSafety(targetUrl);
      if (check.blocked) {
        console.warn(`[DIAMOND SHIELD] Blocked link / new window: ${targetUrl}`);
        notifySiteBlocked(
          targetUrl,
          check.category || 'Restricted',
          check.reason || 'Blocked link attempt',
          check.layer || 'filter'
        );
        // Load blocked page directly INTO the webview
        if (contents.getType() === 'webview') {
          const blockedUrl = getBlockedPageUrl(targetUrl, check.category, check.reason, check.layer);
          setImmediate(() => contents.loadURL(blockedUrl));
        }
        return { action: 'deny' };
      }

      // Safe link clicked with target="_blank": load in current webview
      if (contents.getType() === 'webview') {
        contents.loadURL(url);
      }
      return { action: 'deny' };
    });

    if (contents.getType() === 'webview') {
      // ── Block DevTools in webview (anti-bypass) ──
      contents.on('devtools-opened', () => {
        contents.closeDevTools();
        console.warn('[DIAMOND SHIELD] DevTools blocked in webview');
      });

      // ── Layer 3: Navigation safety check ──
      contents.on('will-navigate', (event, navigationUrl) => {
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

      // ── Layer 4: Listen for content-flagged messages from webview preload ──
      contents.on('ipc-message', (_event, channel, data) => {
        if (channel === 'content-flagged' && data) {
          console.warn(`[DIAMOND SHIELD] Content flagged by DOM scanner: ${data.url} | ${data.reason}`);
          notifySiteBlocked(
            data.url,
            data.category || 'Inappropriate Content',
            data.reason || 'DOM content scan flagged',
            'content-scan'
          );
          const blockedUrl = getBlockedPageUrl(data.url, data.category, data.reason, 'content-scan');
          setImmediate(() => contents.loadURL(blockedUrl));
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
  session.defaultSession.on('will-download', (event, item, webContents) => {
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
    const sendUpdate = (state: string) => {
      const data = {
        id: downloadId,
        filename: item.getFilename(),
        url: item.getURL(),
        receivedBytes: item.getReceivedBytes(),
        totalBytes: item.getTotalBytes(),
        state: state,
        savePath: item.getSavePath(),
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
    });
  });
}

// ─── IPC Handlers ───────────────────────────────────────────────

function setupIPCHandlers() {
  console.log('[Diamond] Setting up IPC handlers...');
  // Downloads
  ipcMain.handle('get-downloads', () => Object.values(activeDownloads));

  // Normal browsing log
  ipcMain.handle('log-navigation', async (_event, url, title) => {
    recordLocalNavigation(url, title);
  });

  // Explicit block log from renderer
  ipcMain.handle('log-blocked', async (_event, url, reason, category) => {
    await logSecurityAlert(url, category || 'Restricted', reason || 'Blocked');
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
        dns: true,           // Cloudflare DoH always active
        cloudSync: true,     // Firebase / Local policy sync active
        localFilter: true,   // Local safety filter active
        contentScanner: true, // DOM scanner active
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
  initPolicySync('test-child-user').catch((err) => {
    console.warn('[Diamond] Cloud Firestore sync skipped:', err?.message || err);
  });

  // Forward policy changes to renderer
  onPolicyChange((policy) => {
    if (win && !win.isDestroyed()) {
      win.webContents.send('policy-changed', policy);
    }
  });

  // Create the main window
  createWindow();
});

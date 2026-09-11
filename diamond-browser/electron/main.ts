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
  win = new BrowserWindow({
    width: 1280,
    height: 820,
    title: 'Diamond — Child-Safe Web Browser',
    icon: path.join(process.env.VITE_PUBLIC!, 'favicon.svg'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      webviewTag: true,
    },
  });

  // Setup all protection layers
  setupNetworkInterceptors();     // Layer 1 + 3
  setupDownloadManager();         // Executable blocking
  setupGuestWebContentsWatcher(); // Layer 3 + 4 for webview
  setupIPCHandlers();             // IPC for renderer

  if (VITE_DEV_SERVER_URL) {
    win.loadURL(VITE_DEV_SERVER_URL);
  } else {
    win.loadFile(path.join(RENDERER_DIST, 'index.html'));
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

        // Skip internal Electron/Vite dev server URLs
        if (
          parsed.hostname === 'localhost' ||
          parsed.hostname === '127.0.0.1' ||
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
        const safetyCheck = checkUrlSafety(details.url);
        if (safetyCheck.blocked) {
          console.warn(
            `[DIAMOND SHIELD] Blocked: ${details.url} | Category: ${safetyCheck.category} | Layer: ${safetyCheck.layer}`
          );

          // Notify window on any top-level navigation (main_frame or sub_frame for webviews)
          const isNav = details.resourceType === 'main_frame' || details.resourceType === 'sub_frame' || !details.resourceType;
          if (isNav) {
            notifyBlocked(details.url, safetyCheck.category, safetyCheck.reason, safetyCheck.layer);
            logSecurityAlert(details.url, safetyCheck.category || 'Restricted', safetyCheck.reason || 'Filter matched');
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
    // ── Block ALL new window requests (silent popup prevention) ──
    contents.setWindowOpenHandler(({ url }) => {
      const check = checkUrlSafety(url);
      if (check.blocked) {
        logSecurityAlert(url, check.category || 'Restricted', check.reason || 'Popup blocked');
      }
      return { action: 'deny' }; // Always deny new windows without disrupting main view
    });

    if (contents.getType() === 'webview') {
      // ── Block DevTools in webview (anti-bypass) ──
      contents.on('devtools-opened', () => {
        contents.closeDevTools();
        console.warn('[DIAMOND SHIELD] DevTools blocked in webview');
      });

      // ── Layer 3: Navigation safety check ──
      contents.on('will-navigate', (event, navigationUrl) => {
        const check = checkUrlSafety(navigationUrl);
        if (check.blocked) {
          event.preventDefault();
          console.warn(`[DIAMOND SHIELD] Blocked webview navigation: ${navigationUrl}`);
          notifyBlocked(navigationUrl, check.category, check.reason, check.layer);
          logSecurityAlert(navigationUrl, check.category || 'Restricted', check.reason || 'Navigation blocked');
        }
      });

      contents.on('will-redirect', (event, redirectUrl) => {
        const check = checkUrlSafety(redirectUrl);
        if (check.blocked) {
          event.preventDefault();
          console.warn(`[DIAMOND SHIELD] Blocked webview redirect: ${redirectUrl}`);
          notifyBlocked(redirectUrl, check.category, check.reason, check.layer);
          logSecurityAlert(redirectUrl, check.category || 'Restricted', check.reason || 'Redirect blocked');
        }
      });

      // ── Layer 4: Listen for content-flagged messages from webview preload ──
      contents.on('ipc-message', (_event, channel, data) => {
        if (channel === 'content-flagged' && data) {
          console.warn(`[DIAMOND SHIELD] Content flagged by DOM scanner: ${data.url} | ${data.reason}`);
          notifyBlocked(data.url, data.category, data.reason, 'content-scan');
          logSecurityAlert(data.url, data.category || 'Inappropriate Content', data.reason || 'DOM content scan flagged');
        }
      });

      // ── Handle load failures (ONLY for top-level main frame, never subresources) ──
      contents.on('did-fail-load', (_event, errorCode, _errorDesc, validatedURL, isMainFrame) => {
        // Critical: Ignore subresources (images, analytics, tracking pixels) to prevent fake popups
        if (!isMainFrame) return;
        if (!validatedURL || validatedURL.startsWith('chrome') || validatedURL.startsWith('devtools')) return;
        if (errorCode === -3) return; // Ignore standard aborted navigations

        const check = checkUrlSafety(validatedURL);
        if (check.blocked) {
          notifyBlocked(validatedURL, check.category, check.reason, check.layer);
        } else if (errorCode === -105 || errorCode === -20) {
          notifyBlocked(validatedURL, 'Blocked by Shield Protection', 'Access to this domain was restricted by Diamond Shield or Cloudflare Family DNS.', 'dns');
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

function setupDownloadManager() {
  session.defaultSession.on('will-download', (event, item) => {
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

      logSecurityAlert(
        item.getURL(),
        'Malware Prevention',
        `Blocked download of executable file: ${filename}`
      );
    }
  });
}

// ─── IPC Handlers ───────────────────────────────────────────────

function setupIPCHandlers() {
  // Normal browsing log
  ipcMain.on('log-navigation', async (_event, url, title) => {
    recordLocalNavigation(url, title);
    try {
      await addDoc(collection(db, 'logs'), {
        url,
        title,
        timestamp: serverTimestamp(),
        userId: 'test-child-user',
        safe: true,
      });
    } catch {
      // Cloud Firestore might be disabled in Firebase Console
    }
  });

  // Explicit block log from renderer
  ipcMain.on('log-blocked', async (_event, url, reason, category) => {
    await logSecurityAlert(url, category || 'Restricted', reason || 'Blocked');
  });

  // Child requests parent permission
  ipcMain.on('request-access', async (_event, url, category) => {
    recordLocalRequest(url, category || 'Restricted Page');
    try {
      await addDoc(collection(db, 'requests'), {
        url,
        category: category || 'Restricted Page',
        timestamp: serverTimestamp(),
        userId: 'test-child-user',
        status: 'PENDING',
      });
      console.log(`[Diamond] Access requested for: ${url}`);
    } catch {
      // Cloud Firestore might be disabled in Firebase Console
    }
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
}

// ─── Utility Functions ──────────────────────────────────────────

function notifyBlocked(url: string, category?: string, reason?: string, layer?: string) {
  if (win && !win.isDestroyed()) {
    win.webContents.send('site-blocked', { url, category, reason, layer });
  }
}

async function logSecurityAlert(url: string, category: string, reason: string) {
  recordLocalAlert({ url, category, reason, severity: 'HIGH' });
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
  } catch {
    // Cloud Firestore might be disabled in Firebase Console
  }
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

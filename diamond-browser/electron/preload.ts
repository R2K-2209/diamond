import { contextBridge, ipcRenderer } from 'electron';

/**
 * Diamond Browser — Main Window Preload Script
 * 
 * Exposes safe IPC methods to the renderer (React UI).
 * This is the preload for the main BrowserWindow, NOT the webview.
 */
contextBridge.exposeInMainWorld('electronAPI', {
  // Synchronous webview preload path resolution
  getPreloadPath: () => ipcRenderer.sendSync('get-webview-preload-path'),

  // Navigation logging
  logNavigation: (url: string, title: string): Promise<void> =>
    ipcRenderer.invoke('log-navigation', url, title),

  // Security event logging
  logBlocked: (url: string, reason?: string, category?: string): Promise<void> =>
    ipcRenderer.invoke('log-blocked', url, reason, category),

  // Child requests parent permission
  requestAccess: (url: string, category?: string): Promise<void> =>
    ipcRenderer.invoke('request-access', url, category),

  // Fetch current policy state on startup
  getCurrentPolicy: () => ipcRenderer.invoke('get-current-policy'),

  // Main process notifies renderer that a site was blocked
  onSiteBlocked: (callback: (data: { url: string; reason?: string; category?: string; layer?: string }) => void) => {
    const handler = (_event: any, data: any) => callback(data);
    ipcRenderer.on('site-blocked', handler);
    return () => {
      ipcRenderer.removeListener('site-blocked', handler);
    };
  },

  // Main process notifies renderer of content scan results (Layer 4)
  onContentFlagged: (callback: (data: { url: string; reason?: string; category?: string; layer?: string }) => void) => {
    const handler = (_event: any, data: any) => callback(data);
    ipcRenderer.on('content-flagged', handler);
    return () => {
      ipcRenderer.removeListener('content-flagged', handler);
    };
  },

  // Policy changes from Firestore (Layer 2)
  onPolicyChanged: (callback: (policy: any) => void) => {
    const handler = (_event: any, policy: any) => callback(policy);
    ipcRenderer.on('policy-changed', handler);
    return () => {
      ipcRenderer.removeListener('policy-changed', handler);
    };
  },

  // Request current protection status
  getProtectionStatus: (): Promise<any> =>
    ipcRenderer.invoke('get-protection-status'),

  // Get custom redirect blocked URL
  getBlockedUrl: (targetUrl: string, category?: string, reason?: string, layer?: string): Promise<string> =>
    ipcRenderer.invoke('get-blocked-url', targetUrl, category, reason, layer),

  // Config (Pairing)
  getConfig: () => ipcRenderer.invoke('get-config'),
  saveConfig: (config: any) => ipcRenderer.invoke('save-config', config),

  // Browser Menu Commands
  newWindow: (): Promise<void> => ipcRenderer.invoke('new-window'),
  closeWindow: (): Promise<void> => ipcRenderer.invoke('close-window'),

  // History
  getHistory: (): Promise<any[]> => ipcRenderer.invoke('get-history'),
  clearHistory: (): Promise<void> => ipcRenderer.invoke('clear-history'),
  deleteHistoryItem: (id: string): Promise<void> => ipcRenderer.invoke('delete-history-item', id),

  // Bookmarks
  getBookmarks: (): Promise<any[]> => ipcRenderer.invoke('get-bookmarks'),
  addBookmark: (url: string, title: string, favicon?: string): Promise<void> => ipcRenderer.invoke('add-bookmark', url, title, favicon || ''),
  removeBookmark: (url: string): Promise<void> => ipcRenderer.invoke('remove-bookmark', url),

  // Downloads
  getDownloads: (): Promise<any[]> => ipcRenderer.invoke('get-downloads'),
  onDownloadProgress: (callback: (data: any) => void) => {
    const handler = (_event: any, data: any) => callback(data);
    ipcRenderer.on('download-progress', handler);
    return () => {
      ipcRenderer.removeListener('download-progress', handler);
    };
  },

  // Download history & file actions
  getDownloadHistory: (): Promise<any[]> => ipcRenderer.invoke('get-download-history'),
  clearDownloadHistory: (): Promise<void> => ipcRenderer.invoke('clear-download-history'),
  openDownloadFile: (savePath: string): Promise<string> => ipcRenderer.invoke('open-download-file', savePath),
  showDownloadInFolder: (savePath: string): Promise<void> => ipcRenderer.invoke('show-download-in-folder', savePath),

  // Get webview preload path synchronously
  getWebviewPreloadPathSync: (): string => ipcRenderer.sendSync('get-webview-preload-path-sync')
});

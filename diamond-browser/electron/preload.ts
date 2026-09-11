import { contextBridge, ipcRenderer } from 'electron';

/**
 * Diamond Browser — Main Window Preload Script
 * 
 * Exposes safe IPC methods to the renderer (React UI).
 * This is the preload for the main BrowserWindow, NOT the webview.
 */
contextBridge.exposeInMainWorld('electronAPI', {
  // Navigation logging
  logNavigation: (url: string, title: string) =>
    ipcRenderer.send('log-navigation', url, title),

  // Security event logging
  logBlocked: (url: string, reason?: string, category?: string) =>
    ipcRenderer.send('log-blocked', url, reason, category),

  // Child requests parent permission
  requestAccess: (url: string, category?: string) =>
    ipcRenderer.send('request-access', url, category),

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
});

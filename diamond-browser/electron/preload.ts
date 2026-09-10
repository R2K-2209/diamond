import { contextBridge, ipcRenderer } from 'electron';

// Expose protected methods that allow the renderer process to use
// the ipcRenderer without exposing the entire object
contextBridge.exposeInMainWorld('electronAPI', {
  logNavigation: (url: string, title: string) => ipcRenderer.send('log-navigation', url, title)
});

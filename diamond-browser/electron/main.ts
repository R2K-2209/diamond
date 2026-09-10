import { app, BrowserWindow, ipcMain, session, dialog } from 'electron';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { db } from '../src/firebase'; // We use the web SDK imported here
import { collection, addDoc, serverTimestamp } from 'firebase/firestore';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

process.env.APP_ROOT = path.join(__dirname, '..');

export const VITE_DEV_SERVER_URL = process.env['VITE_DEV_SERVER_URL'];
export const MAIN_DIST = path.join(process.env.APP_ROOT, 'dist-electron');
export const RENDERER_DIST = path.join(process.env.APP_ROOT, 'dist');

process.env.VITE_PUBLIC = VITE_DEV_SERVER_URL ? path.join(process.env.APP_ROOT, 'public') : RENDERER_DIST;

let win: BrowserWindow | null;

function createWindow() {
  win = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      webviewTag: true, // Crucial for our browser architecture
    },
  });

  // Setup the SafeSearch Network Interception
  setupNetworkInterceptors();

  // Setup the Download Manager
  setupDownloadManager();

  if (VITE_DEV_SERVER_URL) {
    win.loadURL(VITE_DEV_SERVER_URL);
    win.webContents.openDevTools();
  } else {
    win.loadFile(path.join(RENDERER_DIST, 'index.html'));
  }
}

function setupNetworkInterceptors() {
  const filter = {
    urls: ['*://*.google.com/search*', '*://*.bing.com/search*']
  };

  session.defaultSession.webRequest.onBeforeRequest(filter, (details, callback) => {
    let url = new URL(details.url);
    if (!url.searchParams.has('safe')) {
      url.searchParams.set('safe', 'active');
      callback({ cancel: false, redirectURL: url.toString() });
    } else {
      callback({ cancel: false });
    }
  });
}

function setupDownloadManager() {
  session.defaultSession.on('will-download', (event, item, webContents) => {
    const filename = item.getFilename().toLowerCase();
    
    if (filename.endsWith('.exe') || filename.endsWith('.bat') || filename.endsWith('.msi')) {
      event.preventDefault(); // Cancel the download instantly
      
      // Show native alert to parent/user
      dialog.showMessageBox({
        type: 'warning',
        title: 'Download Blocked',
        message: 'Executable files are restricted on this browser for safety reasons.',
        buttons: ['OK']
      });
    }
  });
}

// IPC Listener for Logging
ipcMain.on('log-navigation', async (event, url, title) => {
  try {
    const logsRef = collection(db, "logs");
    await addDoc(logsRef, {
      url: url,
      title: title,
      timestamp: serverTimestamp(),
      userId: "test-child-user" // Hardcoded for now until Auth is built
    });
    console.log(`Logged to Firebase: ${title} (${url})`);
  } catch (error) {
    console.error("Error logging to Firebase: ", error);
  }
});

app.on('window-all-closed', () => {
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

app.whenReady().then(createWindow);

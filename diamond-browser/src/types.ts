export interface BlockedState {
  url: string;
  category?: string;
  reason?: string;
  layer?: string;
}

declare global {
  interface Window {
    electronAPI: {
      logNavigation: (url: string, title: string) => void;
      logBlocked: (url: string, reason?: string, category?: string) => void;
      requestAccess: (url: string, category?: string) => void;
      getCurrentPolicy: () => Promise<any>;
      onSiteBlocked: (callback: (data: any) => void) => () => void;
      onContentFlagged: (callback: (data: any) => void) => () => void;
      onPolicyChanged: (callback: (policy: any) => void) => () => void;
      getProtectionStatus: () => Promise<any>;
      getBlockedUrl: (targetUrl: string, category?: string, reason?: string, layer?: string) => Promise<string>;
      newWindow: () => void;
      closeWindow: () => void;
      getHistory: () => Promise<any[]>;
      clearHistory: () => void;
      getBookmarks: () => Promise<any[]>;
      addBookmark: (url: string, title: string, favicon?: string) => void;
      removeBookmark: (url: string) => void;
      getDownloads: () => Promise<any[]>;
      onDownloadProgress: (callback: (data: any) => void) => () => void;
      getDownloadHistory: () => Promise<any[]>;
      clearDownloadHistory: () => Promise<void>;
      openDownloadFile: (savePath: string) => Promise<string>;
      showDownloadInFolder: (savePath: string) => Promise<void>;
    };
  }
}

export interface TabData {
  id: string;
  urlInput: string;
  currentUrl: string;
  title: string;
  favicon?: string;
  canGoBack: boolean;
  canGoForward: boolean;
  isLoading: boolean;
  zoomLevel: number;
  blockedInfo: BlockedState | null;
  requestSent: boolean;
  showAdvanced: boolean;
  lastInternalUrl?: string;
}

export interface ProtectionStatus {
  layers: {
    dns: boolean;
    cloudSync: boolean;
    localFilter: boolean;
    contentScanner: boolean;
  };
  mode: string;
  categories: Record<string, boolean>;
}

import { useEffect, useRef, useImperativeHandle, forwardRef } from 'react';
import { checkUrlSafety } from '../safetyFilter';
import type { TabData } from '../types';
import { NewTab } from './NewTab';
import { SettingsPage } from './Settings';
import { HistoryPage } from './History';
import { DownloadsPage } from './Downloads';
import { BookmarksPage } from './Bookmarks';

interface BrowserTabProps {
  tab: TabData;
  isActive: boolean;
  onUpdate: (id: string, updates: Partial<TabData>) => void;
  onTriggerBlock: (id: string, url: string, category?: string, reason?: string, layer?: string) => void;
}

export const BrowserTab = forwardRef<any, BrowserTabProps>(({ tab, isActive, onUpdate, onTriggerBlock }, ref) => {
  const webviewRef = useRef<any>(null);

  // Expose the webview ref to the parent
  useImperativeHandle(ref, () => webviewRef.current);
  
  const isNewTab = tab.currentUrl === 'diamond://newtab' || tab.currentUrl === 'chrome://newtab' || tab.currentUrl === 'about:blank';
  const isSettings = tab.currentUrl === 'diamond://settings';
  const isHistory = tab.currentUrl === 'diamond://history';
  const isDownloads = tab.currentUrl === 'diamond://downloads';
  const isBookmarks = tab.currentUrl === 'diamond://bookmarks';

  const isInternalPage = isNewTab || isSettings || isHistory || isDownloads || isBookmarks;

  useEffect(() => {
    const webview = webviewRef.current;
    if (!webview) return;

    const handlePageTitleUpdated = (e: any) => {
      const newTitle = e.title || 'Unknown';
      onUpdate(tab.id, { title: newTitle });
      try {
        if ((window as any).electronAPI?.logNavigation) {
          (window as any).electronAPI.logNavigation(webview.getURL(), newTitle).catch(() => {});
        }
      } catch (err) {}
    };

    const handlePageFaviconUpdated = (e: any) => {
      if (e.favicons && e.favicons.length > 0) {
        onUpdate(tab.id, { favicon: e.favicons[0] });
      }
    };

    const handleDidStartLoading = () => onUpdate(tab.id, { isLoading: true });
    const handleDidStopLoading = () => {
      onUpdate(tab.id, { 
        isLoading: false,
        canGoBack: webview.canGoBack(),
        canGoForward: webview.canGoForward()
      });
    };

    const handleDidNavigate = (e: any) => {
      if (e.url === 'about:blank') {
        if (tab.lastInternalUrl) {
          onUpdate(tab.id, { currentUrl: tab.lastInternalUrl, urlInput: tab.lastInternalUrl });
        }
        return;
      }
      // If the webview landed on blocked.html, extract params and show block screen
      if (e.url && e.url.includes('blocked.html')) {
        try {
          const parsed = new URL(e.url);
          const attemptedUrl = parsed.searchParams.get('url') || 'Unknown';
          const category = parsed.searchParams.get('category') || 'Restricted Content';
          const reason = parsed.searchParams.get('reason') || '';
          const layer = parsed.searchParams.get('layer') || 'filter';
          
          onUpdate(tab.id, {
            urlInput: attemptedUrl,
            blockedInfo: { url: attemptedUrl, category, reason, layer },
            requestSent: false,
            showAdvanced: false,
            canGoBack: webview.canGoBack(),
            canGoForward: webview.canGoForward(),
            title: 'Website Blocked'
          });
        } catch {}
        return;
      }

      // Normal navigation - resolve Google redirect URLs
      let target = e.url;
      try {
        const p = new URL(e.url);
        if (p.hostname.includes('google.') && p.pathname === '/url') {
          const dest = p.searchParams.get('url') || p.searchParams.get('q');
          if (dest) target = dest;
        }
      } catch {}

      // Double-check safety on did-navigate (belt and suspenders)
      const safety = checkUrlSafety(target);
      if (safety.blocked) {
        try { webview.stop(); } catch {}
        onTriggerBlock(tab.id, target, safety.category, safety.reason, safety.layer);
        return;
      }

      // Safe navigation - update UI
      onUpdate(tab.id, {
        blockedInfo: null,
        urlInput: e.url,
        currentUrl: e.url,
        canGoBack: webview.canGoBack(),
        canGoForward: webview.canGoForward(),
        title: webview.getTitle() || 'Loading...'
      });

      try {
        if ((window as any).electronAPI?.logNavigation) {
          (window as any).electronAPI.logNavigation(e.url, webview.getTitle() || 'Unknown').catch(() => {});
        }
      } catch (err) {
        console.error('Failed to log navigation', err);
      }
    };

    const handleDidFailLoad = (e: any) => {
      if (e.isMainFrame === false) return;

      let target = e.validatedURL || tab.urlInput || tab.currentUrl;
      if (!target || target.startsWith('chrome-') || target.startsWith('devtools://')) return;
      if (target.includes('blocked.html')) return;
      if (e.errorCode === -3) return; // Aborted

      try {
        const p = new URL(target);
        if (p.hostname.includes('google.') && p.pathname === '/url') {
          const dest = p.searchParams.get('url') || p.searchParams.get('q');
          if (dest) target = dest;
        }
      } catch {}

      const safety = checkUrlSafety(target);
      if (safety.blocked) {
        onTriggerBlock(tab.id, target, safety.category, safety.reason, safety.layer);
        return;
      }

      if (e.errorCode === -105 || e.errorCode === -20) {
        onTriggerBlock(
          tab.id,
          target,
          'Blocked by Shield Protection',
          'Access to this website was restricted by Diamond Shield or Cloudflare Family DNS.',
          'dns'
        );
      }
    };

    // Layer 4: Content flagged from webview preload via ipc-message
    const handleIpcMessage = (e: any) => {
      if (e.channel === 'request-access' && e.args?.[0]) {
        const { url, category } = e.args[0];
        (window as any).electronAPI?.requestAccess?.(url, category);
        return;
      }

      if (e.channel === 'content-flagged' && e.args?.[0]) {
        const data = e.args[0];
        onTriggerBlock(tab.id, data.url, data.category, data.reason, 'content-scan');
      }
    };

    const handleNewWindow = (e: any) => {
      e.preventDefault();
      const target = e.url;
      if (!target) return;
      
      let checkedUrl = target;
      try {
        const p = new URL(target);
        if (p.hostname.includes('google.') && p.pathname === '/url') {
          const dest = p.searchParams.get('url') || p.searchParams.get('q');
          if (dest) checkedUrl = dest;
        }
      } catch {}

      const safety = checkUrlSafety(checkedUrl);
      if (safety.blocked) {
        onTriggerBlock(tab.id, checkedUrl, safety.category, safety.reason, safety.layer);
      } else {
        webview.loadURL(target);
      }
    };

    webview.addEventListener('page-title-updated', handlePageTitleUpdated);
    webview.addEventListener('page-favicon-updated', handlePageFaviconUpdated);
    webview.addEventListener('did-start-loading', handleDidStartLoading);
    webview.addEventListener('did-stop-loading', handleDidStopLoading);
    webview.addEventListener('did-navigate', handleDidNavigate);
    webview.addEventListener('did-navigate-in-page', handleDidNavigate);
    webview.addEventListener('did-fail-load', handleDidFailLoad);
    webview.addEventListener('ipc-message', handleIpcMessage);
    webview.addEventListener('new-window', handleNewWindow);

    return () => {
      webview.removeEventListener('page-title-updated', handlePageTitleUpdated);
      webview.removeEventListener('page-favicon-updated', handlePageFaviconUpdated);
      webview.removeEventListener('did-start-loading', handleDidStartLoading);
      webview.removeEventListener('did-stop-loading', handleDidStopLoading);
      webview.removeEventListener('did-navigate', handleDidNavigate);
      webview.removeEventListener('did-navigate-in-page', handleDidNavigate);
      webview.removeEventListener('did-fail-load', handleDidFailLoad);
      webview.removeEventListener('ipc-message', handleIpcMessage);
      webview.removeEventListener('new-window', handleNewWindow);
    };
  }, [tab.id, onUpdate, onTriggerBlock]); // Note: only bind once or when identity changes

  return (
    <div className="w-full h-full relative" style={{ display: isActive ? 'flex' : 'none' }}>
      {isNewTab && (
        <div className="absolute inset-0 z-10">
          <NewTab onNavigate={(url) => {
            onUpdate(tab.id, { urlInput: url, currentUrl: url, isLoading: true, lastInternalUrl: 'diamond://newtab' });
          }} />
        </div>
      )}
      {isSettings && (
        <div className="absolute inset-0 z-10">
          <SettingsPage />
        </div>
      )}
      {isHistory && (
        <div className="absolute inset-0 z-10">
          <HistoryPage onNavigate={(url) => {
            onUpdate(tab.id, { urlInput: url, currentUrl: url, isLoading: true, lastInternalUrl: 'diamond://history' });
          }} />
        </div>
      )}
      {isDownloads && (
        <div className="absolute inset-0 z-10">
          <DownloadsPage />
        </div>
      )}
      {isBookmarks && (
        <div className="absolute inset-0 z-10">
          <BookmarksPage />
        </div>
      )}
      <webview
        ref={webviewRef}
        src={isInternalPage ? 'about:blank' : tab.currentUrl}
        className="w-full h-full border-none bg-white"
        style={{ display: isInternalPage ? 'none' : 'flex' }}
        // @ts-ignore
        allowpopups="false"
        // @ts-ignore
        preload={(window as any).electronAPI?.getWebviewPreloadPathSync?.() || ''}
      />
    </div>
  );
});

BrowserTab.displayName = 'BrowserTab';

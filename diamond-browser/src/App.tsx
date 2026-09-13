import { useState, useRef, useEffect } from 'react';
import { checkUrlSafety, enforceSafeSearch, type SafetyCheckResult } from './safetyFilter';
import { updatePolicyFromIPC } from './policySync';
import type { TabData, BlockedState, ProtectionStatus } from './types';
import { BrowserTab } from './components/BrowserTab';
import './index.css';

// ─── App Component ──────────────────────────────────────────────

function App() {
  const [tabs, setTabs] = useState<TabData[]>([
    {
      id: 'tab-1',
      urlInput: 'diamond://newtab',
      currentUrl: 'diamond://newtab',
      title: 'New Tab',
      canGoBack: false,
      canGoForward: false,
      isLoading: false,
      zoomLevel: 1.0,
      blockedInfo: null,
      requestSent: false,
      showAdvanced: false
    }
  ]);
  const [activeTabId, setActiveTabId] = useState<string>('tab-1');
  const [protectionStatus, setProtectionStatus] = useState<ProtectionStatus | null>(null);
  const [showStatusPanel, setShowStatusPanel] = useState(false);
  const [showBrowserMenu, setShowBrowserMenu] = useState(false);
  
  // Bookmarks State
  const [globalBookmarks, setGlobalBookmarks] = useState<any[]>([]);
  const [showBookmarkDialog, setShowBookmarkDialog] = useState(false);
  const [bookmarkEditName, setBookmarkEditName] = useState('');

  // Fetch initial bookmarks
  useEffect(() => {
    const loadBM = async () => {
      if (window.electronAPI?.getBookmarks) {
        setGlobalBookmarks(await window.electronAPI.getBookmarks());
      }
    };
    loadBM();
  }, []);
  
  // Keep refs for all webviews to call imperative methods like goBack()
  const tabRefs = useRef<Record<string, React.RefObject<any>>>({});

  // Helper to get active tab data
  const activeTab = tabs.find(t => t.id === activeTabId) || tabs[0];
  const activeWebview = tabRefs.current[activeTabId]?.current;

  const handleUpdateTab = (id: string, updates: Partial<TabData>) => {
    setTabs(prev => prev.map(tab => tab.id === id ? { ...tab, ...updates } : tab));
  };

  const handleZoom = (delta: number) => {
    const newZoom = Math.max(0.25, Math.min(5.0, activeTab.zoomLevel + delta));
    handleUpdateTab(activeTabId, { zoomLevel: newZoom });
    if (activeWebview) {
      activeWebview.setZoomFactor(newZoom);
    }
  };

  const isBookmarked = globalBookmarks.some(b => b.url === activeTab.currentUrl);

  const handleBookmarkClick = async () => {
    if (activeTab.currentUrl === 'diamond://newtab') return;
    
    if (!isBookmarked) {
      try {
        if (!window.electronAPI) {
          alert('ERROR: window.electronAPI is undefined! Preload not loaded.');
          return;
        }
        if (typeof window.electronAPI.addBookmark !== 'function') {
          alert('ERROR: addBookmark is not a function! Type: ' + typeof window.electronAPI.addBookmark);
          return;
        }
        await window.electronAPI.addBookmark(activeTab.currentUrl, activeTab.title, activeTab.favicon || '');
        setGlobalBookmarks([{ url: activeTab.currentUrl, title: activeTab.title, favicon: activeTab.favicon }, ...globalBookmarks]);
        setBookmarkEditName(activeTab.title);
      } catch (err: any) {
        alert('Bookmark IPC ERROR: ' + (err?.message || String(err)));
        console.error('Bookmark IPC error:', err);
        return;
      }
    } else {
      setBookmarkEditName(globalBookmarks.find(b => b.url === activeTab.currentUrl)?.title || activeTab.title);
    }
    setShowBookmarkDialog(true);
  };

  const handleBookmarkRemove = async () => {
    try {
      await window.electronAPI?.removeBookmark(activeTab.currentUrl);
    } catch (err) {
      console.error('Remove bookmark error:', err);
    }
    setGlobalBookmarks(globalBookmarks.filter(b => b.url !== activeTab.currentUrl));
    setShowBookmarkDialog(false);
  };

  const handleBookmarkSave = async () => {
    try {
      await window.electronAPI?.addBookmark(activeTab.currentUrl, bookmarkEditName, activeTab.favicon || '');
    } catch (err) {
      console.error('Save bookmark error:', err);
    }
    setGlobalBookmarks(globalBookmarks.map(b => b.url === activeTab.currentUrl ? { ...b, title: bookmarkEditName } : b));
    setShowBookmarkDialog(false);
  };

  const handlePrint = () => {
    if (activeWebview) activeWebview.print();
    setShowBrowserMenu(false);
  };

  const handleClearData = async () => {
    if (activeWebview) {
      await activeWebview.clearHistory();
      await activeWebview.executeJavaScript(`sessionStorage.clear(); localStorage.clear();`);
      alert("Browsing data cleared for this session.");
    }
    setShowBrowserMenu(false);
  };

  const triggerBlockScreen = async (id: string, url: string, category?: string, reason?: string, layer?: string) => {
    console.log('[Diamond UI] triggerBlockScreen called for tab', id, url);
    const blockedInfo = {
      url,
      category: category || 'Restricted Content',
      reason: reason || 'Access to this website was restricted to protect your browsing safety.',
      layer: layer || 'filter',
    };
    
    handleUpdateTab(id, {
      urlInput: url,
      blockedInfo,
      requestSent: false,
      showAdvanced: false
    });

    (window as any).electronAPI?.logBlocked?.(url, reason, category);

    try {
      const blockedUrl = await (window as any).electronAPI?.getBlockedUrl?.(
        url, blockedInfo.category, blockedInfo.reason, blockedInfo.layer
      );
      if (blockedUrl && tabRefs.current[id]?.current) {
        tabRefs.current[id]!.current.loadURL(blockedUrl);
      }
    } catch {}
  };

  // ── Listen for site-blocked events from main process (Attach once) ──
  useEffect(() => {
    const api = (window as any).electronAPI;
    if (!api) return;

    // Fetch initial policy state
    if (api.getCurrentPolicy) {
      api.getCurrentPolicy().then((policy: any) => {
        if (policy) {
          updatePolicyFromIPC(policy);
          console.log('[Diamond UI] Initial policy loaded from main process');
        }
      });
    }

    const cleanupBlocked = api.onSiteBlocked?.((data: BlockedState) => {
      console.log('[Diamond UI] site-blocked received:', data);
      // Determine which tab to block. Since this is global, block the active tab as a fallback, 
      // or ideally we match the URL. For now, active tab is safest since that's what the user is looking at.
      triggerBlockScreen(activeTabId, data.url, data.category, data.reason, data.layer);
    });

    const cleanupContent = api.onContentFlagged?.((data: BlockedState) => {
      triggerBlockScreen(activeTabId, data.url, data.category, data.reason, data.layer);
    });

    // Layer 2: Real-time policy sync updates from main process
    const cleanupPolicy = api.onPolicyChanged?.((policy: any) => {
      updatePolicyFromIPC(policy);
      console.log('[Diamond UI] Policy updated from IPC:', policy);

      if (api.getProtectionStatus) {
        api.getProtectionStatus().then((status: ProtectionStatus) => {
          setProtectionStatus(status);
        });
      }

      // Recheck active tab's URL
      setTabs(prev => prev.map(tab => {
        if (tab.blockedInfo) {
          const recheck = checkUrlSafety(tab.blockedInfo.url);
          if (!recheck.blocked) {
            // Parent unblocked!
            const restored = tab.blockedInfo.url;
            try { tabRefs.current[tab.id]?.current?.loadURL(restored); } catch {}
            return { ...tab, blockedInfo: null, currentUrl: restored, urlInput: restored, title: 'Reloading...' };
          }
        } else {
          const activeUrl = tab.currentUrl;
          if (activeUrl && activeUrl !== 'https://www.google.com' && !activeUrl.includes('google.com/search')) {
            const recheck = checkUrlSafety(activeUrl);
            if (recheck.blocked) {
               // We can't easily triggerBlockScreen async here inside map, so we just return the state 
               // and let the webview reload it. Wait, it's better to just let the user navigate, or force a reload.
               try { tabRefs.current[tab.id]?.current?.reload(); } catch {}
            }
          }
        }
        return tab;
      }));
    });

    return () => {
      cleanupBlocked?.();
      cleanupContent?.();
      cleanupPolicy?.();
    };
  }, [activeTabId]); // Rebind when active tab changes so IPC hits the right tab

  // ── Tab Management ──
  const createTab = () => {
    const newId = `tab-${Date.now()}`;
    setTabs(prev => [...prev, {
      id: newId,
      urlInput: 'diamond://newtab',
      currentUrl: 'diamond://newtab',
      title: 'New Tab',
      canGoBack: false,
      canGoForward: false,
      isLoading: false,
      zoomLevel: 1.0,
      blockedInfo: null,
      requestSent: false,
      showAdvanced: false
    }]);
    setActiveTabId(newId);
  };

  const closeTab = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    if (tabs.length === 1) return; // Keep at least one tab
    
    setTabs(prev => {
      const newTabs = prev.filter(t => t.id !== id);
      if (activeTabId === id) {
        // Switch to the previous tab (or first)
        const idx = prev.findIndex(t => t.id === id);
        setActiveTabId(newTabs[Math.max(0, idx - 1)].id);
      }
      return newTabs;
    });
    // Cleanup ref
    delete tabRefs.current[id];
  };

  // ── Navigation handlers for Active Tab ──
  const handleGo = async (e: React.FormEvent) => {
    e.preventDefault();
    const rawInput = activeTab.urlInput.trim();
    if (!rawInput) return;

    if ((window as any).electronAPI?.getCurrentPolicy) {
      try {
        const fresh = await (window as any).electronAPI.getCurrentPolicy();
        if (fresh) updatePolicyFromIPC(fresh);
      } catch {}
    }

    const hasProtocol = rawInput.startsWith('http://') || rawInput.startsWith('https://');
    const hasDomainPattern = /^([a-zA-Z0-9-]+\.)+[a-zA-Z]{2,}(:\d+)?(\/.*)?$/.test(rawInput);

    let targetUrl = '';
    if (hasProtocol) {
      targetUrl = rawInput;
    } else if (hasDomainPattern && !rawInput.includes(' ')) {
      targetUrl = 'https://' + rawInput;
    } else {
      const queryCheck = checkUrlSafety(rawInput);
      if (queryCheck.blocked) {
        triggerBlockScreen(activeTabId, rawInput, queryCheck.category, queryCheck.reason, queryCheck.layer);
        return;
      }
      targetUrl = `https://www.google.com/search?q=${encodeURIComponent(rawInput)}&safe=active`;
    }

    const safety: SafetyCheckResult = checkUrlSafety(targetUrl);
    if (safety.blocked) {
      triggerBlockScreen(activeTabId, targetUrl, safety.category, safety.reason, safety.layer);
      return;
    }

    const finalized = enforceSafeSearch(targetUrl);

    if (targetUrl.startsWith('diamond://')) {
      const getInternalPageTitle = (url: string) => {
        if (url.includes('history')) return 'History';
        if (url.includes('settings')) return 'Settings';
        if (url.includes('bookmarks')) return 'Bookmarks';
        if (url.includes('downloads')) return 'Downloads';
        if (url.includes('newtab')) return 'New Tab';
        return 'Diamond';
      };
      
      handleUpdateTab(activeTabId, {
        blockedInfo: null,
        currentUrl: targetUrl,
        urlInput: targetUrl,
        title: getInternalPageTitle(targetUrl)
      });
      return;
    }

    handleUpdateTab(activeTabId, {
      blockedInfo: null,
      currentUrl: finalized,
      urlInput: finalized
    });
    
    try { activeWebview?.loadURL(finalized); } catch {}
  };

  const handleBack = () => {
    const getInternalPageTitle = (url: string) => {
      if (url.includes('history')) return 'History';
      if (url.includes('settings')) return 'Settings';
      if (url.includes('bookmarks')) return 'Bookmarks';
      if (url.includes('downloads')) return 'Downloads';
      if (url.includes('newtab')) return 'New Tab';
      return 'Diamond';
    };

    if (activeTab.blockedInfo) {
      handleUpdateTab(activeTabId, { blockedInfo: null, requestSent: false, showAdvanced: false });
      
      // If we have a known safe previous URL that isn't the new tab, go there
      if (activeTab.currentUrl && !activeTab.currentUrl.startsWith('diamond://')) {
        try { activeWebview?.loadURL(activeTab.currentUrl); } catch {}
      } else {
        handleHome();
      }
      return;
    }
    
    if (activeWebview?.canGoBack()) {
      activeWebview.goBack();
    } else if (activeTab.lastInternalUrl) {
      handleUpdateTab(activeTabId, { 
        currentUrl: activeTab.lastInternalUrl, 
        urlInput: activeTab.lastInternalUrl,
        title: getInternalPageTitle(activeTab.lastInternalUrl)
      });
    }
  };

  const handleForward = () => {
    if (activeWebview?.canGoForward()) activeWebview.goForward();
  };

  const handleReload = () => {
    if (activeTab.blockedInfo) {
      const check = checkUrlSafety(activeTab.blockedInfo.url);
      if (!check.blocked) {
        const unblocked = activeTab.blockedInfo.url;
        handleUpdateTab(activeTabId, { blockedInfo: null, currentUrl: unblocked, urlInput: unblocked });
        try { activeWebview?.loadURL(unblocked); } catch {}
      }
      return;
    }
    activeWebview?.reload();
  };

  const handleHome = () => {
    handleUpdateTab(activeTabId, { 
      blockedInfo: null, requestSent: false, showAdvanced: false, 
      currentUrl: 'diamond://newtab', urlInput: 'diamond://newtab',
      title: 'New Tab'
    });
    // No need to loadURL on webview since it gets hidden
  };

  // ── Active layer count ──
  const activeLayers = protectionStatus
    ? Object.values(protectionStatus.layers).filter(Boolean).length
    : 4;

  return (
    <div className="flex flex-col h-screen w-screen bg-[#101010] text-slate-100 select-none overflow-hidden font-sans">
      
      {/* ═══ Tab Bar ═══ */}
      <div 
        className="flex items-end h-[38px] px-2 pt-2 pr-[140px]"
        style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}
      >
        {tabs.map((tab, idx) => {
          const isActive = tab.id === activeTabId;
          const isNextActive = tabs[idx + 1]?.id === activeTabId;
          return (
            <div 
              key={tab.id}
              onClick={() => setActiveTabId(tab.id)}
              className={`group relative flex items-center h-[30px] min-w-[140px] max-w-[240px] px-3 rounded-t-lg transition-colors cursor-default ${
                isActive 
                  ? 'bg-[#35363a] text-gray-100 z-10' 
                  : 'bg-transparent text-gray-400 hover:bg-white/5 z-0'
              }`}
              style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
            >
              {/* Tab Separator (only on inactive tabs, unless next is active) */}
              {!isActive && !isNextActive && idx !== tabs.length - 1 && (
                <div className="absolute right-0 top-1.5 bottom-1.5 w-[1px] bg-white/10 pointer-events-none" />
              )}

              {/* Favicon */}
              {tab.isLoading ? (
                <svg className="w-3.5 h-3.5 mr-2.5 animate-spin text-blue-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
              ) : tab.favicon ? (
                <img src={tab.favicon} className="w-3.5 h-3.5 mr-2.5 shrink-0 pointer-events-none" alt="" />
              ) : (
                <svg className="w-3.5 h-3.5 mr-2.5 shrink-0 opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9m-9 9a9 9 0 019-9" />
                </svg>
              )}
              
              {/* Title */}
              <span className="text-[11px] truncate flex-1 pointer-events-none">{tab.title}</span>
              
              {/* Close button */}
              <button 
                onClick={(e) => closeTab(e, tab.id)}
                className={`ml-2 w-4 h-4 flex items-center justify-center rounded-full hover:bg-white/20 transition-colors shrink-0 ${tabs.length === 1 ? 'opacity-0 pointer-events-none' : isActive ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}`}
              >
                <svg className="w-2.5 h-2.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>
          );
        })}
        
        {/* New Tab Button */}
        <button 
          onClick={createTab}
          className="h-6 w-6 flex items-center justify-center rounded-full hover:bg-white/10 text-gray-400 transition-colors ml-1 mb-0.5"
          style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
        </button>
      </div>

      {/* ═══ Navigation Bar ═══ */}
      <div className="flex items-center h-10 bg-[#35363a] px-2 shadow-sm z-20 space-x-1 border-b border-black/20 relative">
        {/* Nav Buttons */}
        <button onClick={handleBack} disabled={!activeTab.canGoBack && !activeTab.blockedInfo} title="Back"
          className={`w-7 h-7 flex items-center justify-center rounded-full transition-colors ${activeTab.canGoBack || activeTab.blockedInfo ? 'hover:bg-white/10 text-gray-300' : 'text-gray-600 cursor-not-allowed'}`}>
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M15 19l-7-7 7-7" /></svg>
        </button>
        <button onClick={handleForward} disabled={!activeTab.canGoForward || !!activeTab.blockedInfo} title="Forward"
          className={`w-7 h-7 flex items-center justify-center rounded-full transition-colors ${activeTab.canGoForward && !activeTab.blockedInfo ? 'hover:bg-white/10 text-gray-300' : 'text-gray-600 cursor-not-allowed'}`}>
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 5l7 7-7 7" /></svg>
        </button>
        <button onClick={handleReload} title="Reload"
          className="w-7 h-7 flex items-center justify-center rounded-full hover:bg-white/10 text-gray-300 transition-colors">
          <svg className={`w-3.5 h-3.5 ${activeTab.isLoading ? 'animate-spin text-blue-400' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
        </button>
        <button onClick={handleHome} title="Safe Home"
          className="w-7 h-7 flex items-center justify-center rounded-full hover:bg-white/10 text-gray-300 transition-colors">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" /></svg>
        </button>

        {/* Address Bar */}
        <form onSubmit={handleGo} className="flex-1 ml-1 pl-1">
          <div className="relative flex items-center">
            <div className={`absolute left-3 flex items-center pointer-events-none ${activeTab.blockedInfo ? 'text-rose-400' : 'text-gray-400'}`}>
              {activeTab.blockedInfo ? (
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>
              ) : (
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" /></svg>
              )}
            </div>
            <input
              type="text" value={activeTab.urlInput === 'diamond://newtab' ? '' : activeTab.urlInput}
              onChange={(e) => handleUpdateTab(activeTabId, { urlInput: e.target.value })}
              className={`w-full bg-[#202124] rounded-full py-1 pl-9 pr-28 text-[13px] text-gray-200 placeholder-gray-500 focus:outline-none focus:bg-[#202124] focus:ring-1 focus:ring-blue-500/50 transition-all ${
                activeTab.blockedInfo ? 'ring-1 ring-rose-500/50' : ''
              }`}
              placeholder="Search or enter website address"
            />
            <div className="absolute right-2 flex items-center space-x-2">
              <button
                type="button"
                onClick={handleBookmarkClick}
                disabled={activeTab.currentUrl === 'diamond://newtab'}
                className={`transition-colors ${isBookmarked ? 'text-blue-400' : 'text-gray-400 hover:text-gray-200'} ${activeTab.currentUrl === 'diamond://newtab' ? 'opacity-30 cursor-not-allowed' : ''}`}
                title={isBookmarked ? "Edit bookmark" : "Bookmark this tab"}
              >
                {isBookmarked ? (
                  <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20"><path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" /></svg>
                ) : (
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" /></svg>
                )}
              </button>

              {/* Bookmark Dialog Popup */}
              {showBookmarkDialog && (
                <div className="absolute top-8 right-0 w-80 bg-[#292a2d] border border-[#3c4043] rounded-lg shadow-xl z-50 p-4 text-sm text-gray-200">
                  <h3 className="font-semibold text-[15px] mb-4">Bookmark added</h3>
                  <div className="flex items-center gap-3 mb-4">
                    <span className="w-12 text-gray-400 text-xs">Name</span>
                    <input 
                      type="text" 
                      value={bookmarkEditName}
                      onChange={e => setBookmarkEditName(e.target.value)}
                      className="flex-1 bg-[#101010] border border-[#3c4043] rounded px-2 py-1 focus:outline-none focus:border-blue-500"
                      autoFocus
                      onKeyDown={e => { if(e.key === 'Enter') handleBookmarkSave(); }}
                    />
                  </div>
                  <div className="flex justify-between items-center mt-2">
                    <button type="button" onClick={handleBookmarkRemove} className="px-4 py-1.5 border border-[#3c4043] hover:bg-white/5 rounded transition-colors text-blue-400">Remove</button>
                    <button type="button" onClick={handleBookmarkSave} className="px-4 py-1.5 bg-blue-600 hover:bg-blue-500 text-white rounded transition-colors font-medium">Done</button>
                  </div>
                </div>
              )}

              <div className="pointer-events-none">
                {activeTab.blockedInfo ? (
                  <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold bg-rose-950/90 text-rose-300">
                    Blocked
                  </span>
                ) : (
                  <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold bg-emerald-950/80 text-emerald-300">
                    SafeSearch ON
                  </span>
                )}
              </div>
            </div>
          </div>
        </form>

        {/* Protection Status Badge (Extensions Area) */}
        <div className="relative pl-2">
          <button
            onClick={() => setShowStatusPanel(!showStatusPanel)}
            className="w-7 h-7 flex items-center justify-center rounded-full hover:bg-white/10 transition-colors"
            title="Diamond Shield Status"
          >
            <div className="relative flex items-center justify-center">
              <svg className="w-4 h-4 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" /></svg>
              <div className="absolute -bottom-1 -right-1 bg-emerald-500 rounded-full w-2.5 h-2.5 border border-[#35363a] flex items-center justify-center">
                <span className="text-[6px] font-bold text-white leading-none">{activeLayers}</span>
              </div>
            </div>
          </button>

          {/* Protection Status Dropdown */}
          {showStatusPanel && (
            <>
              <div className="fixed inset-0 z-40" onClick={() => setShowStatusPanel(false)} />
              <div className="absolute top-full right-0 mt-2 w-64 bg-[#2b2d31] border border-white/10 rounded-lg shadow-2xl p-4 z-50 animate-in fade-in slide-in-from-top-2 duration-200 text-sm">
                <h3 className="font-medium text-gray-200 mb-3 flex items-center justify-between">
                  Diamond Shield
                  <span className="px-2 py-0.5 bg-emerald-500/20 text-emerald-400 text-[10px] rounded-full">Active</span>
                </h3>
                <div className="space-y-2.5">
                  {[
                    { key: 'dns', label: 'Cloudflare Family DNS', icon: '🌐' },
                    { key: 'cloudSync', label: 'Parent Policy Sync', icon: '☁️' },
                    { key: 'localFilter', label: 'Safety Filter Engine', icon: '🛡️' },
                    { key: 'contentScanner', label: 'Page Content Scanner', icon: '🔍' },
                  ].map(({ key, label, icon }) => (
                    <div key={key} className="flex items-center justify-between">
                      <span className="text-xs text-gray-300 flex items-center gap-1.5"><span className="opacity-80">{icon}</span> {label}</span>
                      <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${
                        protectionStatus?.layers[key as keyof typeof protectionStatus.layers]
                          ? 'text-emerald-400'
                          : 'text-rose-400'
                      }`}>
                        {protectionStatus?.layers[key as keyof typeof protectionStatus.layers] ? 'ON' : 'OFF'}
                      </span>
                    </div>
                  ))}
                </div>
                <div className="mt-3.5 pt-2.5 border-t border-white/10">
                  <div className="text-[11px] text-gray-400 flex items-center justify-between">
                    <span>Current Mode</span>
                    <span className="text-blue-400 font-semibold uppercase bg-blue-500/10 px-1.5 py-0.5 rounded">{protectionStatus?.mode || 'moderate'}</span>
                  </div>
                </div>
              </div>
            </>
          )}
        </div>

        {/* Browser Hamburger Menu */}
        <div className="relative pl-1 pr-1 mr-[135px]" style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
          <button
            onClick={() => setShowBrowserMenu(!showBrowserMenu)}
            className={`w-7 h-7 flex items-center justify-center rounded transition-colors ${showBrowserMenu ? 'bg-white/10' : 'hover:bg-white/10'}`}
          >
            <svg className="w-5 h-5 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" /></svg>
          </button>
          
          {showBrowserMenu && (
            <>
              <div className="fixed inset-0 z-40" onClick={() => setShowBrowserMenu(false)} />
              <div className="absolute top-full right-0 mt-2 w-[280px] bg-[#2b2d31] border border-white/10 rounded-lg shadow-2xl py-2 z-50 animate-in fade-in slide-in-from-top-2 duration-200 select-none">
                <button className="w-full px-4 py-2.5 text-left text-[13px] text-gray-200 hover:bg-white/5 flex items-center justify-between transition-colors" onClick={() => { createTab(); setShowBrowserMenu(false); }}>
                  <span>New tab</span>
                  <span className="text-xs text-gray-500 font-mono">Ctrl+T</span>
                </button>
                <button className="w-full px-4 py-2.5 text-left text-[13px] text-gray-200 hover:bg-white/5 flex items-center justify-between transition-colors" onClick={() => { window.electronAPI?.newWindow?.(); setShowBrowserMenu(false); }}>
                  <span>New window</span>
                  <span className="text-xs text-gray-500 font-mono">Ctrl+N</span>
                </button>
                
                <div className="my-1.5 border-t border-white/5"></div>

                <button className="w-full px-4 py-2.5 text-left text-[13px] text-gray-200 hover:bg-white/5 flex items-center justify-between transition-colors" onClick={() => { handleUpdateTab(activeTabId, { urlInput: 'diamond://history', currentUrl: 'diamond://history', title: 'History' }); setShowBrowserMenu(false); }}>
                  <div className="flex items-center gap-3">
                    <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                    History
                  </div>
                  <span className="text-xs text-gray-500 font-mono">Ctrl+H</span>
                </button>
                <button className="w-full px-4 py-2.5 text-left text-[13px] text-gray-200 hover:bg-white/5 flex items-center justify-between transition-colors" onClick={() => { handleUpdateTab(activeTabId, { urlInput: 'diamond://bookmarks', currentUrl: 'diamond://bookmarks', title: 'Bookmarks' }); setShowBrowserMenu(false); }}>
                  <div className="flex items-center gap-3">
                    <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z" /></svg>
                    Bookmarks
                  </div>
                  <span className="text-xs text-gray-500 font-mono">Ctrl+B</span>
                </button>
                <button className="w-full px-4 py-2.5 text-left text-[13px] text-gray-200 hover:bg-white/5 flex items-center justify-between transition-colors" onClick={() => { handleUpdateTab(activeTabId, { urlInput: 'diamond://downloads', currentUrl: 'diamond://downloads', title: 'Downloads' }); setShowBrowserMenu(false); }}>
                  <div className="flex items-center gap-3">
                    <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
                    Downloads
                  </div>
                  <span className="text-xs text-gray-500 font-mono">Ctrl+J</span>
                </button>
                
                <div className="my-1.5 border-t border-white/5"></div>
                
                {/* Zoom Controls */}
                <div className="px-4 py-1.5 flex items-center justify-between">
                  <span className="text-[13px] text-gray-200 flex items-center gap-3">
                    <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0zM10 7v3m0 0v3m0-3h3m-3 0H7" /></svg>
                    Zoom
                  </span>
                  <div className="flex items-center bg-black/20 rounded border border-white/5 overflow-hidden">
                    <button className="px-2 py-1 hover:bg-white/10 text-gray-300 transition-colors" onClick={() => handleZoom(-0.1)}>-</button>
                    <span className="px-2 text-xs w-12 text-center text-gray-300 font-mono">{Math.round(activeTab.zoomLevel * 100)}%</span>
                    <button className="px-2 py-1 hover:bg-white/10 text-gray-300 transition-colors" onClick={() => handleZoom(0.1)}>+</button>
                  </div>
                </div>

                <div className="my-1.5 border-t border-white/5"></div>

                <button className="w-full px-4 py-2.5 text-left text-[13px] text-gray-200 hover:bg-white/5 flex items-center gap-3 transition-colors" onClick={() => { alert('Press Ctrl+F to find in page. Full UI coming soon.'); setShowBrowserMenu(false); }}>
                  <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
                  Find and edit
                </button>
                <button className="w-full px-4 py-2.5 text-left text-[13px] text-gray-200 hover:bg-white/5 flex items-center justify-between transition-colors" onClick={handlePrint}>
                  <div className="flex items-center gap-3">
                    <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" /></svg>
                    Print...
                  </div>
                  <span className="text-xs text-gray-500 font-mono">Ctrl+P</span>
                </button>
                
                <div className="my-1.5 border-t border-white/5"></div>

                <button className="w-full px-4 py-2.5 text-left text-[13px] text-gray-200 hover:bg-white/5 flex items-center justify-between transition-colors" onClick={handleClearData}>
                  <div className="flex items-center gap-3">
                    <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                    Clear browsing data...
                  </div>
                  <span className="text-xs text-gray-500 font-mono">Ctrl+Shift+Del</span>
                </button>
                
                <div className="my-1.5 border-t border-white/5"></div>
                
                <button className="w-full px-4 py-2.5 text-left text-[13px] text-gray-200 hover:bg-white/5 flex items-center gap-3 transition-colors" onClick={() => { handleUpdateTab(activeTabId, { urlInput: 'diamond://settings', currentUrl: 'diamond://settings', title: 'Settings' }); setShowBrowserMenu(false); }}>
                  <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
                  Settings
                </button>
                <button className="w-full px-4 py-2.5 text-left text-[13px] text-gray-200 hover:bg-white/5 flex items-center gap-3 transition-colors" onClick={() => window.electronAPI?.closeWindow?.()}>
                  <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M6 18L18 6M6 6l12 12" /></svg>
                  Exit
                </button>
              </div>
            </>
          )}
        </div>
      </div>

      {/* ═══ Main Content Tabs ═══ */}
      <div className="flex-1 w-full relative bg-[#202124] overflow-hidden">
        {tabs.map(tab => (
          <BrowserTab
            key={tab.id}
            tab={tab}
            isActive={tab.id === activeTabId}
            onUpdate={handleUpdateTab}
            onTriggerBlock={triggerBlockScreen}
            ref={(el) => {
              if (el) {
                tabRefs.current[tab.id] = { current: el };
              } else {
                delete tabRefs.current[tab.id];
              }
            }}
          />
        ))}
      </div>
    </div>
  );
}

export default App;

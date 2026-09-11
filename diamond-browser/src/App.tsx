import { useState, useRef, useEffect } from 'react';
import { checkUrlSafety, enforceSafeSearch, type SafetyCheckResult } from './safetyFilter';
import { updatePolicyFromIPC } from './policySync';
import './index.css';

// ─── Types ──────────────────────────────────────────────────────

interface BlockedState {
  url: string;
  category?: string;
  reason?: string;
  layer?: string;
}

interface ProtectionStatus {
  layers: {
    dns: boolean;
    cloudSync: boolean;
    localFilter: boolean;
    contentScanner: boolean;
  };
  mode: string;
  categories: Record<string, boolean>;
}

// ─── Layer Labels ───────────────────────────────────────────────

const LAYER_LABELS: Record<string, string> = {
  dns: 'Cloudflare DNS',
  local: 'Safety Filter',
  cloud: 'Parent Policy',
  'content-scan': 'Page Scanner',
};

// ─── App Component ──────────────────────────────────────────────

function App() {
  const [urlInput, setUrlInput] = useState('https://www.google.com');
  const [currentUrl, setCurrentUrl] = useState('https://www.google.com');
  const [canGoBack, setCanGoBack] = useState(false);
  const [canGoForward, setCanGoForward] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [blockedInfo, setBlockedInfo] = useState<BlockedState | null>(null);
  const [requestSent, setRequestSent] = useState(false);
  const [protectionStatus, setProtectionStatus] = useState<ProtectionStatus | null>(null);
  const [showStatusPanel, setShowStatusPanel] = useState(false);
  const webviewRef = useRef<any>(null);

  // ── Fetch protection status on mount ──
  useEffect(() => {
    if ((window as any).electronAPI?.getProtectionStatus) {
      (window as any).electronAPI.getProtectionStatus().then((status: ProtectionStatus) => {
        setProtectionStatus(status);
      });
    }
  }, []);

  const currentUrlRef = useRef(currentUrl);
  currentUrlRef.current = currentUrl;
  const blockedInfoRef = useRef(blockedInfo);
  blockedInfoRef.current = blockedInfo;

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
      setBlockedInfo(data);
      setRequestSent(false);
      try { webviewRef.current?.stop(); } catch {}
    });

    const cleanupContent = api.onContentFlagged?.((data: BlockedState) => {
      setBlockedInfo(data);
      setRequestSent(false);
      try { webviewRef.current?.stop(); } catch {}
    });

    // Layer 2: Real-time policy sync updates from main process
    const cleanupPolicy = api.onPolicyChanged?.((policy: any) => {
      updatePolicyFromIPC(policy);
      console.log('[Diamond UI] Policy updated from IPC:', policy);

      // Also update the protection status UI if it's currently showing
      if ((window as any).electronAPI?.getProtectionStatus) {
        (window as any).electronAPI.getProtectionStatus().then((status: ProtectionStatus) => {
          setProtectionStatus(status);
        });
      }

      // Real-time reactive check on currently open URL
      const activeUrl = currentUrlRef.current;
      if (activeUrl && activeUrl !== 'https://www.google.com' && !activeUrl.includes('google.com/search')) {
        const recheck = checkUrlSafety(activeUrl);
        if (recheck.blocked) {
          setBlockedInfo({
            url: activeUrl,
            category: recheck.category,
            reason: recheck.reason,
            layer: recheck.layer,
          });
          try { webviewRef.current?.stop(); } catch {}
        } else if (blockedInfoRef.current) {
          // Unblocked by parent! Clear block and reload
          setBlockedInfo(null);
          try { webviewRef.current?.reload(); } catch {}
        }
      }
    });

    return () => {
      cleanupBlocked?.();
      cleanupContent?.();
      cleanupPolicy?.();
    };
  }, []);

  // ── Webview event listeners ──
  useEffect(() => {
    const webview = webviewRef.current;
    if (!webview) return;

    const handleDidStartLoading = () => setIsLoading(true);
    const handleDidStopLoading = () => setIsLoading(false);

    const handleWillNavigate = (e: any) => {
      const safety = checkUrlSafety(e.url);
      if (safety.blocked) {
        e.preventDefault();
        try { webview.stop(); } catch {}
        setBlockedInfo({
          url: e.url,
          category: safety.category,
          reason: safety.reason,
          layer: safety.layer,
        });
        setRequestSent(false);
        (window as any).electronAPI?.logBlocked?.(e.url, safety.reason, safety.category);
      }
    };

    const handleDidNavigate = (e: any) => {
      const safety = checkUrlSafety(e.url);
      if (safety.blocked) {
        try { webview.stop(); } catch {}
        setBlockedInfo({
          url: e.url,
          category: safety.category,
          reason: safety.reason,
          layer: safety.layer,
        });
        setRequestSent(false);
        (window as any).electronAPI?.logBlocked?.(e.url, safety.reason, safety.category);
        return;
      }

      setUrlInput(e.url);
      setCurrentUrl(e.url);
      setCanGoBack(webview.canGoBack());
      setCanGoForward(webview.canGoForward());

      if ((window as any).electronAPI?.logNavigation) {
        (window as any).electronAPI.logNavigation(e.url, webview.getTitle() || 'Unknown');
      }
    };

    const handleDidFailLoad = (e: any) => {
      // Ignore subresources (images, scripts, analytics) to prevent fake block popups
      if (e.isMainFrame === false) return;

      const target = e.validatedURL || urlInput || currentUrl;
      if (!target || target.startsWith('chrome-') || target.startsWith('devtools://')) return;

      // Ignore normal user-cancelled or redirected requests
      if (e.errorCode === -3) return;

      const safety = checkUrlSafety(target);
      if (safety.blocked) {
        setBlockedInfo({
          url: target,
          category: safety.category,
          reason: safety.reason,
          layer: safety.layer,
        });
        setRequestSent(false);
        (window as any).electronAPI?.logBlocked?.(target, safety.reason, safety.category);
        return;
      }

      // If top-level navigation failed due to DNS filter (-105) or client block (-20)
      if (e.errorCode === -105 || e.errorCode === -20) {
        setBlockedInfo({
          url: target,
          category: 'Blocked by Shield Protection',
          reason: 'Access to this website was restricted by Diamond Shield or Cloudflare Family DNS.',
          layer: 'dns',
        });
        setRequestSent(false);
      }
    };

    // Layer 4: Content flagged from webview preload via ipc-message
    const handleIpcMessage = (e: any) => {
      if (e.channel === 'content-flagged' && e.args?.[0]) {
        const data = e.args[0];
        setBlockedInfo({
          url: data.url,
          category: data.category,
          reason: data.reason,
          layer: 'content-scan',
        });
        setRequestSent(false);
        (window as any).electronAPI?.logBlocked?.(data.url, data.reason, data.category);
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
        setBlockedInfo({
          url: checkedUrl,
          category: safety.category,
          reason: safety.reason,
          layer: safety.layer,
        });
        setRequestSent(false);
        (window as any).electronAPI?.logBlocked?.(checkedUrl, safety.reason, safety.category);
      } else {
        setCurrentUrl(target);
        setUrlInput(target);
      }
    };

    webview.addEventListener('did-start-loading', handleDidStartLoading);
    webview.addEventListener('did-stop-loading', handleDidStopLoading);
    webview.addEventListener('will-navigate', handleWillNavigate);
    webview.addEventListener('did-navigate', handleDidNavigate);
    webview.addEventListener('did-navigate-in-page', handleDidNavigate);
    webview.addEventListener('did-fail-load', handleDidFailLoad);
    webview.addEventListener('ipc-message', handleIpcMessage);
    webview.addEventListener('new-window', handleNewWindow);

    return () => {
      webview.removeEventListener('did-start-loading', handleDidStartLoading);
      webview.removeEventListener('did-stop-loading', handleDidStopLoading);
      webview.removeEventListener('will-navigate', handleWillNavigate);
      webview.removeEventListener('did-navigate', handleDidNavigate);
      webview.removeEventListener('did-navigate-in-page', handleDidNavigate);
      webview.removeEventListener('did-fail-load', handleDidFailLoad);
      webview.removeEventListener('ipc-message', handleIpcMessage);
      webview.removeEventListener('new-window', handleNewWindow);
    };
  }, [urlInput, currentUrl]);

  // ── Navigation handlers ──
  const handleGo = async (e: React.FormEvent) => {
    e.preventDefault();
    const rawInput = urlInput.trim();
    if (!rawInput) return;

    // Refresh policy from main process to guarantee latest rules
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
        setBlockedInfo({ url: rawInput, category: queryCheck.category, reason: queryCheck.reason, layer: queryCheck.layer });
        setRequestSent(false);
        (window as any).electronAPI?.logBlocked?.(rawInput, queryCheck.reason, queryCheck.category);
        return;
      }
      targetUrl = `https://www.google.com/search?q=${encodeURIComponent(rawInput)}&safe=active`;
    }

    const safety: SafetyCheckResult = checkUrlSafety(targetUrl);
    if (safety.blocked) {
      setBlockedInfo({ url: targetUrl, category: safety.category, reason: safety.reason, layer: safety.layer });
      setRequestSent(false);
      (window as any).electronAPI?.logBlocked?.(targetUrl, safety.reason, safety.category);
      return;
    }

    const finalized = enforceSafeSearch(targetUrl);
    setBlockedInfo(null);
    setCurrentUrl(finalized);
    setUrlInput(finalized);
  };

  const handleBack = () => {
    if (blockedInfo) { setBlockedInfo(null); return; }
    if (webviewRef.current?.canGoBack()) webviewRef.current.goBack();
  };

  const handleForward = () => {
    if (webviewRef.current?.canGoForward()) webviewRef.current.goForward();
  };

  const handleReload = () => {
    if (blockedInfo) return;
    webviewRef.current?.reload();
  };

  const handleHome = () => {
    setBlockedInfo(null);
    setCurrentUrl('https://www.google.com');
    setUrlInput('https://www.google.com');
  };

  const handleAskParent = () => {
    if (blockedInfo) {
      (window as any).electronAPI?.requestAccess?.(blockedInfo.url, blockedInfo.category);
      setRequestSent(true);
    }
  };

  const handleDismissBlocked = () => {
    setBlockedInfo(null);
    setRequestSent(false);
    setUrlInput(currentUrlRef.current);
  };

  // ── Active layer count ──
  const activeLayers = protectionStatus
    ? Object.values(protectionStatus.layers).filter(Boolean).length
    : 4;

  return (
    <div className="flex flex-col h-screen w-screen bg-slate-900 text-slate-100 select-none">
      {/* ═══ Navigation Bar ═══ */}
      <div className="flex items-center h-12 bg-slate-800/95 px-3 shadow-lg z-20 space-x-1.5 border-b border-slate-700/80 backdrop-blur-sm">
        {/* Nav Buttons */}
        <button onClick={handleBack} disabled={!canGoBack && !blockedInfo} title="Back"
          className={`p-1.5 rounded-lg transition-all duration-150 ${canGoBack || blockedInfo ? 'hover:bg-slate-700 text-slate-200 active:scale-95' : 'text-slate-600 cursor-not-allowed'}`}>
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M15 19l-7-7 7-7" /></svg>
        </button>
        <button onClick={handleForward} disabled={!canGoForward || !!blockedInfo} title="Forward"
          className={`p-1.5 rounded-lg transition-all duration-150 ${canGoForward && !blockedInfo ? 'hover:bg-slate-700 text-slate-200 active:scale-95' : 'text-slate-600 cursor-not-allowed'}`}>
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 5l7 7-7 7" /></svg>
        </button>
        <button onClick={handleReload} disabled={!!blockedInfo} title="Reload"
          className={`p-1.5 rounded-lg transition-all duration-150 ${blockedInfo ? 'text-slate-600' : 'hover:bg-slate-700 text-slate-200 active:scale-95'}`}>
          <svg className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
        </button>
        <button onClick={handleHome} title="Safe Home"
          className="p-1.5 rounded-lg hover:bg-slate-700 transition-all duration-150 text-emerald-400 active:scale-95">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" /></svg>
        </button>

        {/* Address Bar */}
        <form onSubmit={handleGo} className="flex-1 ml-1.5">
          <div className="relative flex items-center">
            <div className="absolute left-3 flex items-center pointer-events-none text-emerald-400">
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" /></svg>
            </div>
            <input
              type="text" value={urlInput}
              onChange={(e) => setUrlInput(e.target.value)}
              className="w-full bg-slate-900/80 border border-slate-700/80 rounded-full py-1.5 pl-9 pr-28 text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-blue-500/70 focus:ring-1 focus:ring-blue-500/40 transition-all shadow-inner"
              placeholder="Search or enter website address"
            />
            <div className="absolute right-2 flex items-center space-x-1 pointer-events-none">
              <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold bg-emerald-950/80 text-emerald-300 border border-emerald-800/50">
                SafeSearch ON
              </span>
            </div>
          </div>
        </form>

        {/* Protection Status Badge */}
        <div className="relative">
          <button
            onClick={() => setShowStatusPanel(!showStatusPanel)}
            className="flex items-center space-x-1.5 px-2.5 py-1 bg-slate-700/50 hover:bg-slate-700/80 rounded-full border border-slate-600/40 transition-all cursor-pointer"
            title="Protection Status"
          >
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-400"></span>
            </span>
            <span className="text-[11px] font-medium text-slate-300">Shield</span>
            <span className="text-[10px] font-bold text-emerald-400">{activeLayers}/4</span>
          </button>

          {/* Protection Status Dropdown */}
          {showStatusPanel && (
            <div className="absolute right-0 top-10 w-64 bg-slate-800/95 backdrop-blur-md border border-slate-700 rounded-xl shadow-2xl p-4 z-50"
              onMouseLeave={() => setShowStatusPanel(false)}>
              <div className="text-xs font-bold text-slate-200 mb-3 flex items-center gap-2">
                <svg className="w-4 h-4 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" /></svg>
                Diamond Shield V2
              </div>
              <div className="space-y-2">
                {[
                  { key: 'dns', label: 'Cloudflare Family DNS', icon: '🌐' },
                  { key: 'cloudSync', label: 'Parent Policy Sync', icon: '☁️' },
                  { key: 'localFilter', label: 'Safety Filter Engine', icon: '🛡️' },
                  { key: 'contentScanner', label: 'Page Content Scanner', icon: '🔍' },
                ].map(({ key, label, icon }) => (
                  <div key={key} className="flex items-center justify-between">
                    <span className="text-[11px] text-slate-300">{icon} {label}</span>
                    <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${
                      protectionStatus?.layers[key as keyof typeof protectionStatus.layers]
                        ? 'bg-emerald-950 text-emerald-300 border border-emerald-800/50'
                        : 'bg-rose-950 text-rose-300 border border-rose-800/50'
                    }`}>
                      {protectionStatus?.layers[key as keyof typeof protectionStatus.layers] ? 'ACTIVE' : 'OFF'}
                    </span>
                  </div>
                ))}
              </div>
              <div className="mt-3 pt-2 border-t border-slate-700/60">
                <div className="text-[10px] text-slate-400">
                  Mode: <span className="text-blue-300 font-semibold uppercase">{protectionStatus?.mode || 'moderate'}</span>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ═══ Main Content ═══ */}
      <div className="flex-1 w-full relative bg-slate-950 overflow-hidden">
        {/* Floating Blocked Dialog Modal */}
        {blockedInfo && (
          <div className="absolute inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/65 backdrop-blur-sm animate-in fade-in duration-200">
            <div className="relative w-full max-w-md bg-slate-900/95 border border-rose-500/40 rounded-2xl p-6 shadow-2xl shadow-rose-950/50 backdrop-blur-xl border-t-2 border-t-rose-500 text-slate-100">
              {/* Close / Dismiss button (top right) */}
              <button
                onClick={handleDismissBlocked}
                className="absolute top-4 right-4 p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
                title="Dismiss"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>

              {/* Shield Icon & Header */}
              <div className="flex items-center gap-3.5 mb-4">
                <div className="w-12 h-12 rounded-xl bg-rose-500/15 border border-rose-500/30 flex items-center justify-center shadow-lg shadow-rose-500/10 shrink-0">
                  <svg className="w-6 h-6 text-rose-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20.618 5.984A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016zM12 9v2m0 4h.01" />
                  </svg>
                </div>
                <div>
                  <h2 className="text-lg font-bold text-white leading-tight">Website Blocked</h2>
                  <p className="text-xs text-slate-400 mt-0.5">Diamond Shield restricted this page</p>
                </div>
              </div>

              {/* Category & Caught-by badges */}
              <div className="flex flex-wrap items-center gap-2 mb-3.5">
                <span className="inline-block px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-rose-950/90 text-rose-300 border border-rose-800/80 tracking-wide uppercase">
                  {blockedInfo.category || 'Restricted Content'}
                </span>
                {blockedInfo.layer && (
                  <span className="inline-block px-2 py-0.5 rounded-full text-[10px] font-medium bg-slate-800/90 text-blue-300 border border-slate-700">
                    Caught by: {LAYER_LABELS[blockedInfo.layer] || blockedInfo.layer}
                  </span>
                )}
              </div>

              {/* Block Details */}
              <div className="bg-slate-950/80 border border-slate-800/90 rounded-xl p-3 mb-5 text-[11px] space-y-2">
                <div>
                  <span className="text-slate-500 font-semibold block mb-0.5">Attempted Address:</span>
                  <div className="font-mono text-rose-300/90 truncate bg-slate-900/80 px-2 py-1 rounded border border-slate-800/50 select-all" title={blockedInfo.url}>
                    {blockedInfo.url}
                  </div>
                </div>
                {blockedInfo.reason && (
                  <div>
                    <span className="text-slate-500 font-semibold block mb-0.5">Safety Policy:</span>
                    <div className="text-slate-300 leading-relaxed">{blockedInfo.reason}</div>
                  </div>
                )}
              </div>

              {/* Action Buttons */}
              <div className="flex items-center gap-2.5">
                <button
                  onClick={handleDismissBlocked}
                  className="flex-1 inline-flex items-center justify-center px-4 py-2 bg-slate-800 hover:bg-slate-700 active:scale-[0.98] text-slate-200 font-medium rounded-xl border border-slate-700 text-xs transition-all"
                >
                  Stay on This Page
                </button>
                <button
                  onClick={handleAskParent}
                  disabled={requestSent}
                  className={`flex-1 inline-flex items-center justify-center px-4 py-2 font-medium rounded-xl border text-xs transition-all active:scale-[0.98] shadow-md ${
                    requestSent
                      ? 'bg-emerald-950/80 text-emerald-300 border-emerald-700/80 cursor-default'
                      : 'bg-gradient-to-r from-amber-600 to-amber-500 hover:from-amber-500 hover:to-amber-400 text-white border-amber-500/50 shadow-amber-600/20'
                  }`}
                >
                  {requestSent ? (
                    <>
                      <svg className="w-3.5 h-3.5 mr-1.5 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                      </svg>
                      Request Sent!
                    </>
                  ) : (
                    <>
                      <svg className="w-3.5 h-3.5 mr-1.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
                      </svg>
                      Ask Parent
                    </>
                  )}
                </button>
              </div>

              {/* Home link */}
              <div className="mt-3 text-center">
                <button
                  onClick={handleHome}
                  className="text-[11px] text-slate-500 hover:text-slate-300 transition-colors underline underline-offset-2"
                >
                  Return to Google Safe Search
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Webview (stays mounted and visible in background) */}
        <div className="w-full h-full">
          <webview
            ref={webviewRef}
            src={currentUrl}
            className="w-full h-full border-none bg-white"
            // @ts-ignore
            allowpopups="false"
            // @ts-ignore
            preload={`file://${(typeof __dirname !== 'undefined' ? __dirname : '').replace(/\\/g, '/')}/dist-electron/webviewPreload.js`}
          />
        </div>
      </div>
    </div>
  );
}

export default App;

import { useState, useRef, useEffect } from 'react';
import './index.css';

function App() {
  const [urlInput, setUrlInput] = useState('https://www.google.com');
  const [currentUrl, setCurrentUrl] = useState('https://www.google.com');
  const [canGoBack, setCanGoBack] = useState(false);
  const [canGoForward, setCanGoForward] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const webviewRef = useRef<Electron.WebviewTag>(null);

  useEffect(() => {
    const webview = webviewRef.current;
    if (!webview) return;

    const handleDidStartLoading = () => setIsLoading(true);
    const handleDidStopLoading = () => setIsLoading(false);
    
    const handleDidNavigate = (e: any) => {
      setUrlInput(e.url);
      setCurrentUrl(e.url);
      setCanGoBack(webview.canGoBack());
      setCanGoForward(webview.canGoForward());
      
      // Send IPC message to main process to log the navigation
      if ((window as any).electronAPI && (window as any).electronAPI.logNavigation) {
        (window as any).electronAPI.logNavigation(e.url, webview.getTitle() || 'Unknown Title');
      }
    };

    webview.addEventListener('did-start-loading', handleDidStartLoading);
    webview.addEventListener('did-stop-loading', handleDidStopLoading);
    webview.addEventListener('did-navigate', handleDidNavigate);
    webview.addEventListener('did-navigate-in-page', handleDidNavigate);

    return () => {
      webview.removeEventListener('did-start-loading', handleDidStartLoading);
      webview.removeEventListener('did-stop-loading', handleDidStopLoading);
      webview.removeEventListener('did-navigate', handleDidNavigate);
      webview.removeEventListener('did-navigate-in-page', handleDidNavigate);
    };
  }, []);

  const handleGo = (e: React.FormEvent) => {
    e.preventDefault();
    let finalUrl = urlInput;
    if (!finalUrl.startsWith('http://') && !finalUrl.startsWith('https://')) {
      finalUrl = 'https://' + finalUrl;
    }
    setCurrentUrl(finalUrl);
  };

  const handleBack = () => {
    if (webviewRef.current && webviewRef.current.canGoBack()) {
      webviewRef.current.goBack();
    }
  };

  const handleForward = () => {
    if (webviewRef.current && webviewRef.current.canGoForward()) {
      webviewRef.current.goForward();
    }
  };

  const handleReload = () => {
    if (webviewRef.current) {
      webviewRef.current.reload();
    }
  };

  return (
    <div className="flex flex-col h-screen w-screen bg-surface">
      {/* Navigation Bar */}
      <div className="flex items-center h-14 bg-surface px-4 shadow-md z-10 space-x-2 border-b border-slate-700">
        <button 
          onClick={handleBack} 
          disabled={!canGoBack}
          className={`p-2 rounded-full transition-colors ${canGoBack ? 'hover:bg-slate-700 text-slate-200' : 'text-slate-500 cursor-not-allowed'}`}
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
        </button>
        <button 
          onClick={handleForward} 
          disabled={!canGoForward}
          className={`p-2 rounded-full transition-colors ${canGoForward ? 'hover:bg-slate-700 text-slate-200' : 'text-slate-500 cursor-not-allowed'}`}
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
        </button>
        <button 
          onClick={handleReload}
          className="p-2 rounded-full hover:bg-slate-700 transition-colors text-slate-200"
        >
          <svg className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
        </button>
        
        <form onSubmit={handleGo} className="flex-1 ml-4">
          <input
            type="text"
            value={urlInput}
            onChange={(e) => setUrlInput(e.target.value)}
            className="w-full bg-background border border-slate-600 rounded-full py-1.5 px-4 text-sm text-slate-200 focus:outline-none focus:border-primary transition-colors"
            placeholder="Search or enter web address"
          />
        </form>
      </div>

      {/* Webview Container */}
      <div className="flex-1 w-full bg-white relative">
        <webview
          ref={webviewRef}
          src={currentUrl}
          className="w-full h-full border-none"
          // @ts-ignore
          allowpopups="true"
        />
      </div>
    </div>
  );
}

export default App;

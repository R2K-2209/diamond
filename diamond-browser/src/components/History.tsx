import React, { useEffect, useState } from 'react';

interface HistoryItem {
  id: string;
  url: string;
  title: string;
  timestamp: string;
  userId: string;
  safe: boolean;
}

export function HistoryPage() {
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadHistory();
  }, []);

  const loadHistory = async () => {
    if (window.electronAPI?.getHistory) {
      const data = await window.electronAPI.getHistory();
      setHistory(data);
    }
    setLoading(false);
  };

  const handleClear = () => {
    if (confirm('Are you sure you want to clear your browsing history? This cannot be undone.')) {
      window.electronAPI?.clearHistory?.();
      setHistory([]);
    }
  };

  const formatDate = (isoStr: string) => {
    const d = new Date(isoStr);
    return d.toLocaleDateString() + ' ' + d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  return (
    <div className="w-full h-full bg-[#101010] text-gray-200 flex flex-col p-10 font-sans overflow-y-auto">
      <div className="max-w-4xl mx-auto w-full">
        <div className="flex items-center justify-between mb-8">
          <h1 className="text-3xl font-semibold flex items-center gap-3">
            <svg className="w-8 h-8 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
            History
          </h1>
          <button 
            onClick={handleClear}
            disabled={history.length === 0}
            className="px-4 py-2 bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 rounded-lg transition-colors font-medium text-sm disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Clear browsing data
          </button>
        </div>

        {loading ? (
          <div className="flex justify-center p-10 text-gray-500 animate-pulse">Loading history...</div>
        ) : history.length === 0 ? (
          <div className="bg-[#1e1e1e] border border-white/5 rounded-2xl p-12 text-center text-gray-400">
            Your browsing history appears here.
          </div>
        ) : (
          <div className="bg-[#1e1e1e] border border-white/5 rounded-2xl overflow-hidden shadow-2xl">
            {history.map((item, idx) => (
              <div 
                key={item.id} 
                className={`flex items-center gap-4 px-6 py-4 hover:bg-white/5 transition-colors cursor-default ${
                  idx !== history.length - 1 ? 'border-b border-white/5' : ''
                }`}
              >
                <div className="text-sm text-gray-500 w-32 shrink-0">{formatDate(item.timestamp)}</div>
                <div className="flex-1 min-w-0">
                  <div className="text-gray-200 font-medium truncate" title={item.title}>{item.title}</div>
                  <div className="text-blue-400/80 text-xs truncate mt-0.5" title={item.url}>{item.url}</div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

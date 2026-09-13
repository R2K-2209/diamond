import React, { useEffect, useState, useMemo } from 'react';

interface HistoryItem {
  id: string;
  url: string;
  title: string;
  timestamp: string;
  userId: string;
  safe: boolean;
}

export function HistoryPage({ onNavigate }: { onNavigate?: (url: string) => void }) {
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

  const formatTime = (isoStr: string) => {
    const d = new Date(isoStr);
    let timeStr = d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', hour12: true });
    return timeStr;
  };

  const groupedHistory = useMemo(() => {
    const groups: { [date: string]: HistoryItem[] } = {};
    const today = new Date().toDateString();
    const yesterday = new Date(Date.now() - 86400000).toDateString();

    let lastUrl = '';
    let lastTime = 0;

    history.forEach(item => {
      // Filter out duplicate entries that are close in time (for old logs before deduplication was added)
      const itemTime = new Date(item.timestamp).getTime();
      if (item.url === lastUrl && Math.abs(lastTime - itemTime) < 300000) {
        return; // skip display
      }
      lastUrl = item.url;
      lastTime = itemTime;

      const d = new Date(item.timestamp);
      const dateString = d.toDateString();
      
      let label = d.toLocaleDateString(undefined, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
      if (dateString === today) label = 'Today - ' + label;
      else if (dateString === yesterday) label = 'Yesterday - ' + label;

      if (!groups[label]) groups[label] = [];
      groups[label].push(item);
    });

    return groups;
  }, [history]);

  return (
    <div className="w-full h-full bg-[#202124] text-[#e8eaed] flex flex-col font-sans overflow-y-auto">
      <div className="w-full max-w-[800px] mx-auto pt-10 px-6 pb-12">
        <div className="flex items-center justify-between mb-8">
          <h1 className="text-[22px] font-normal text-[#e8eaed]">History</h1>
          <button 
            onClick={handleClear}
            disabled={history.length === 0}
            className="px-4 py-2 bg-transparent hover:bg-white/10 text-[#8ab4f8] rounded-[4px] transition-colors text-[13px] font-medium disabled:opacity-50"
          >
            Clear browsing data
          </button>
        </div>

        {loading ? (
          <div className="text-[#9aa0a6] text-[14px] mt-8">Loading...</div>
        ) : history.length === 0 ? (
          <div className="text-[#9aa0a6] text-[14px] mt-8">
            Your browsing history appears here
          </div>
        ) : (
          <div className="flex flex-col gap-6">
            {Object.entries(groupedHistory).map(([dateLabel, items]) => (
              <div key={dateLabel}>
                <h2 className="text-[14px] font-medium text-[#e8eaed] mb-3 ml-4">{dateLabel}</h2>
                <div className="bg-[#292a2d] rounded-[8px] overflow-hidden shadow-sm">
                  {items.map((item) => {
                    let domain = item.url;
                    try {
                      domain = new URL(item.url).hostname;
                    } catch {}

                    return (
                      <div 
                        key={item.id} 
                        onClick={() => onNavigate?.(item.url)}
                        className="group flex items-center gap-4 px-4 py-[10px] hover:bg-[#3c4043] transition-colors cursor-pointer"
                      >
                        <div className="text-[13px] text-[#9aa0a6] w-[70px] shrink-0 text-right pr-2">
                          {formatTime(item.timestamp)}
                        </div>
                        <div className="w-8 h-8 rounded-full flex items-center justify-center text-[#9aa0a6] shrink-0">
                          <svg className="w-[18px] h-[18px]" fill="currentColor" viewBox="0 0 24 24"><path d="M14 2H6c-1.1 0-1.99.9-1.99 2L4 20c0 1.1.89 2 1.99 2H18c1.1 0 2-.9 2-2V8l-6-6zm2 16H8v-2h8v2zm0-4H8v-2h8v2zm-3-5V3.5L18.5 9H13z"/></svg>
                        </div>
                        <div className="flex-1 min-w-0 flex items-center gap-3">
                          <div className="text-[13px] text-[#e8eaed] truncate max-w-[60%]" title={item.title}>
                            {item.title}
                          </div>
                          <div className="text-[13px] text-[#9aa0a6] truncate" title={item.url}>
                            {domain}
                          </div>
                        </div>
                        <div className="w-8 h-8 flex justify-center items-center opacity-0 group-hover:opacity-100 transition-opacity">
                           <svg className="w-5 h-5 text-[#9aa0a6] hover:bg-white/10 rounded-full p-0.5 cursor-pointer" fill="currentColor" viewBox="0 0 24 24"><path d="M12 8c1.1 0 2-.9 2-2s-.9-2-2-2-2 .9-2 2 .9 2 2 2zm0 2c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2zm0 6c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2z"/></svg>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

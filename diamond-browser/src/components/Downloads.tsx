import React, { useEffect, useState } from 'react';

interface DownloadItem {
  id: string;
  filename: string;
  url: string;
  receivedBytes: number;
  totalBytes: number;
  state: string; // 'progressing', 'completed', 'cancelled', 'interrupted', 'paused'
  savePath: string;
  startTime?: string;
  completedAt?: string;
}

export function DownloadsPage() {
  const [downloads, setDownloads] = useState<Record<string, DownloadItem>>({});

  useEffect(() => {
    const initDownloads = async () => {
      // Load persistent download history (merged with active in-memory)
      if (window.electronAPI?.getDownloadHistory) {
        const history = await window.electronAPI.getDownloadHistory();
        const map: Record<string, DownloadItem> = {};
        history.forEach(d => map[d.id] = d);
        setDownloads(map);
      } else if (window.electronAPI?.getDownloads) {
        // Fallback to in-memory only
        const existing = await window.electronAPI.getDownloads();
        const map: Record<string, DownloadItem> = {};
        existing.forEach(d => map[d.id] = d);
        setDownloads(map);
      }
    };
    initDownloads();

    if (window.electronAPI?.onDownloadProgress) {
      const cleanup = window.electronAPI.onDownloadProgress((data: DownloadItem) => {
        setDownloads(prev => ({
          ...prev,
          [data.id]: data
        }));
      });
      return cleanup;
    }
  }, []);

  const downloadList = Object.values(downloads).sort((a, b) => {
    const timeA = a.startTime ? new Date(a.startTime).getTime() : Number(a.id);
    const timeB = b.startTime ? new Date(b.startTime).getTime() : Number(b.id);
    return timeB - timeA; // newest first
  });

  const formatBytes = (bytes: number) => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  };

  const formatTime = (isoString?: string) => {
    if (!isoString) return '';
    const date = new Date(isoString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    return date.toLocaleDateString();
  };

  const handleOpenFile = async (savePath: string) => {
    if (window.electronAPI?.openDownloadFile) {
      await window.electronAPI.openDownloadFile(savePath);
    }
  };

  const handleShowInFolder = async (savePath: string) => {
    if (window.electronAPI?.showDownloadInFolder) {
      await window.electronAPI.showDownloadInFolder(savePath);
    }
  };

  const handleClearAll = async () => {
    if (window.electronAPI?.clearDownloadHistory) {
      await window.electronAPI.clearDownloadHistory();
      setDownloads({});
    }
  };

  return (
    <div className="w-full h-full bg-[#101010] text-gray-200 flex flex-col p-10 font-sans overflow-y-auto">
      <div className="max-w-4xl mx-auto w-full">
        <div className="flex items-center justify-between mb-8">
          <h1 className="text-3xl font-semibold flex items-center gap-3">
            <svg className="w-8 h-8 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
            Downloads
          </h1>
          {downloadList.length > 0 && (
            <button
              onClick={handleClearAll}
              className="px-4 py-2 text-sm text-gray-400 hover:text-gray-200 hover:bg-white/5 rounded-lg border border-white/10 transition-colors flex items-center gap-2"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
              Clear all
            </button>
          )}
        </div>

        {downloadList.length === 0 ? (
          <div className="bg-[#1e1e1e] border border-white/5 rounded-2xl p-12 text-center text-gray-400">
            <svg className="w-16 h-16 mx-auto mb-4 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
            <p className="text-lg mb-2">No downloads yet</p>
            <p className="text-sm text-gray-500">Downloaded files will appear here. Diamond Shield automatically blocks executable and script files to protect your device.</p>
          </div>
        ) : (
          <div className="bg-[#1e1e1e] border border-white/5 rounded-2xl overflow-hidden shadow-2xl">
            {downloadList.map((item, idx) => {
              const progress = item.totalBytes > 0 ? (item.receivedBytes / item.totalBytes) * 100 : 0;
              const isDone = item.state === 'completed';
              const isFailed = item.state === 'cancelled' || item.state === 'interrupted';
              const isInProgress = !isDone && !isFailed;
              
              return (
                <div 
                  key={item.id} 
                  className={`flex flex-col gap-3 px-6 py-5 ${
                    idx !== downloadList.length - 1 ? 'border-b border-white/5' : ''
                  } hover:bg-white/[0.02] transition-colors`}
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-3 mb-1">
                        <div className={`p-2 rounded-lg ${isDone ? 'bg-emerald-500/10 text-emerald-400' : isFailed ? 'bg-rose-500/10 text-rose-400' : 'bg-blue-500/10 text-blue-400'}`}>
                          {isDone ? (
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                          ) : isFailed ? (
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                          ) : (
                            <svg className="w-4 h-4 animate-bounce" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
                          )}
                        </div>
                        <div className="min-w-0 flex-1">
                          <h3 className="font-medium text-gray-200 truncate" title={item.filename}>{item.filename}</h3>
                          <p className="text-xs text-gray-500 truncate" title={item.url}>{item.url}</p>
                        </div>
                      </div>
                    </div>
                    
                    <div className="text-right shrink-0 flex flex-col items-end gap-1">
                      <div className="text-sm font-medium">
                        {isDone ? (
                          <span className="text-emerald-400">Completed</span>
                        ) : isFailed ? (
                          <span className="text-rose-400">{item.state === 'cancelled' ? 'Cancelled' : 'Failed'}</span>
                        ) : (
                          <span className="text-blue-400">{formatBytes(item.receivedBytes)} / {formatBytes(item.totalBytes)}</span>
                        )}
                      </div>
                      {isDone && item.totalBytes > 0 && (
                        <span className="text-xs text-gray-500">{formatBytes(item.totalBytes)}</span>
                      )}
                      {isInProgress && (
                        <span className="text-xs text-blue-400 font-mono">{Math.round(progress)}%</span>
                      )}
                      {(item.completedAt || item.startTime) && (
                        <span className="text-xs text-gray-600">{formatTime(item.completedAt || item.startTime)}</span>
                      )}
                    </div>
                  </div>

                  {/* Progress bar for in-progress downloads */}
                  {isInProgress && (
                    <div className="w-full bg-black/40 rounded-full h-1.5 overflow-hidden">
                      <div 
                        className="bg-blue-500 h-1.5 rounded-full transition-all duration-300 ease-out"
                        style={{ width: `${progress}%` }}
                      ></div>
                    </div>
                  )}

                  {/* Action buttons for completed downloads */}
                  {isDone && item.savePath && (
                    <div className="flex items-center gap-2 mt-1">
                      <button
                        onClick={() => handleOpenFile(item.savePath)}
                        className="px-3 py-1.5 text-xs font-medium text-blue-400 hover:text-blue-300 bg-blue-500/10 hover:bg-blue-500/20 rounded-lg transition-colors flex items-center gap-1.5"
                      >
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" /></svg>
                        Open file
                      </button>
                      <button
                        onClick={() => handleShowInFolder(item.savePath)}
                        className="px-3 py-1.5 text-xs font-medium text-gray-400 hover:text-gray-200 bg-white/5 hover:bg-white/10 rounded-lg transition-colors flex items-center gap-1.5"
                      >
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" /></svg>
                        Show in folder
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

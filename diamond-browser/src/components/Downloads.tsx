import React, { useEffect, useState } from 'react';

interface DownloadItem {
  id: string;
  filename: string;
  url: string;
  receivedBytes: number;
  totalBytes: number;
  state: string; // 'progressing', 'completed', 'cancelled', 'interrupted', 'paused'
  savePath: string;
}

export function DownloadsPage() {
  const [downloads, setDownloads] = useState<Record<string, DownloadItem>>({});

  useEffect(() => {
    const initDownloads = async () => {
      if (window.electronAPI?.getDownloads) {
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

  const downloadList = Object.values(downloads).reverse();

  const formatBytes = (bytes: number) => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  };

  return (
    <div className="w-full h-full bg-[#101010] text-gray-200 flex flex-col p-10 font-sans overflow-y-auto">
      <div className="max-w-4xl mx-auto w-full">
        <h1 className="text-3xl font-semibold mb-8 flex items-center gap-3">
          <svg className="w-8 h-8 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
          Downloads
        </h1>

        {downloadList.length === 0 ? (
          <div className="bg-[#1e1e1e] border border-white/5 rounded-2xl p-12 text-center text-gray-400">
            Downloaded files will appear here. Note that Diamond Shield automatically blocks executable and script files to protect your device.
          </div>
        ) : (
          <div className="bg-[#1e1e1e] border border-white/5 rounded-2xl overflow-hidden shadow-2xl">
            {downloadList.map((item, idx) => {
              const progress = item.totalBytes > 0 ? (item.receivedBytes / item.totalBytes) * 100 : 0;
              const isDone = item.state === 'completed';
              const isFailed = item.state === 'cancelled' || item.state === 'interrupted';
              
              return (
                <div 
                  key={item.id} 
                  className={`flex flex-col gap-3 px-6 py-5 ${
                    idx !== downloadList.length - 1 ? 'border-b border-white/5' : ''
                  }`}
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-3 mb-1">
                        <div className={`p-2 rounded ${isDone ? 'bg-emerald-500/10 text-emerald-400' : isFailed ? 'bg-rose-500/10 text-rose-400' : 'bg-blue-500/10 text-blue-400'}`}>
                          {isDone ? (
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                          ) : isFailed ? (
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                          ) : (
                            <svg className="w-4 h-4 animate-bounce" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
                          )}
                        </div>
                        <h3 className="font-medium text-gray-200 truncate" title={item.filename}>{item.filename}</h3>
                      </div>
                      <p className="text-xs text-gray-500 truncate">{item.url}</p>
                    </div>
                    
                    <div className="text-right shrink-0">
                      <div className="text-sm font-medium">
                        {isDone ? 'Completed' : isFailed ? 'Failed / Cancelled' : `${formatBytes(item.receivedBytes)} / ${formatBytes(item.totalBytes)}`}
                      </div>
                      {!isDone && !isFailed && (
                        <div className="text-xs text-blue-400 mt-1">{Math.round(progress)}%</div>
                      )}
                    </div>
                  </div>

                  {!isDone && !isFailed && (
                    <div className="w-full bg-black/40 rounded-full h-1.5 mt-1 overflow-hidden">
                      <div 
                        className="bg-blue-500 h-1.5 rounded-full transition-all duration-300 ease-out"
                        style={{ width: `${progress}%` }}
                      ></div>
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

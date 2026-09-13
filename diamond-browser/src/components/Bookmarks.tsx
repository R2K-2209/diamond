import React, { useEffect, useState } from 'react';

interface Bookmark {
  id: string;
  url: string;
  title: string;
  favicon?: string;
  timestamp: string;
}

export function BookmarksPage() {
  const [bookmarks, setBookmarks] = useState<Bookmark[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadBookmarks();
  }, []);

  const loadBookmarks = async () => {
    if (window.electronAPI?.getBookmarks) {
      const data = await window.electronAPI.getBookmarks();
      setBookmarks(data);
    }
    setLoading(false);
  };

  const handleRemove = async (url: string) => {
    window.electronAPI?.removeBookmark?.(url);
    setBookmarks(prev => prev.filter(b => b.url !== url));
  };

  return (
    <div className="w-full h-full bg-[#101010] text-gray-200 flex flex-col p-10 font-sans overflow-y-auto">
      <div className="max-w-4xl mx-auto w-full">
        <h1 className="text-3xl font-semibold mb-8 flex items-center gap-3">
          <svg className="w-8 h-8 text-yellow-500" fill="currentColor" viewBox="0 0 20 20"><path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" /></svg>
          Bookmarks
        </h1>

        {loading ? (
          <div className="flex justify-center p-10 text-gray-500 animate-pulse">Loading bookmarks...</div>
        ) : bookmarks.length === 0 ? (
          <div className="bg-[#1e1e1e] border border-white/5 rounded-2xl p-12 text-center text-gray-400">
            You don't have any bookmarks yet. Click the star icon in the address bar to save a page.
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {bookmarks.map((bm) => (
              <div key={bm.id} className="bg-[#1e1e1e] border border-white/10 rounded-xl p-4 hover:border-white/20 transition-all flex flex-col group relative">
                <button 
                  onClick={() => handleRemove(bm.url)}
                  className="absolute top-3 right-3 text-gray-500 hover:text-rose-400 opacity-0 group-hover:opacity-100 transition-opacity"
                  title="Remove bookmark"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                </button>
                <div className="flex items-center gap-3 mb-2 pr-6">
                  {bm.favicon ? (
                    <img src={bm.favicon} alt="" className="w-5 h-5 rounded-sm bg-white/10" />
                  ) : (
                    <div className="w-5 h-5 rounded-sm bg-blue-500/20 flex items-center justify-center">
                      <svg className="w-3 h-3 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" /></svg>
                    </div>
                  )}
                  <h3 className="font-medium text-gray-200 truncate">{bm.title}</h3>
                </div>
                <p className="text-xs text-blue-400/80 truncate">{bm.url}</p>
                <div className="mt-4 pt-3 border-t border-white/5 text-[10px] text-gray-500">
                  Added {new Date(bm.timestamp).toLocaleDateString()}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

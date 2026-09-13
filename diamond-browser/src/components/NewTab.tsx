import React, { useState, useEffect, useRef } from 'react';

interface QuickLink {
  id: string;
  url: string;
  title: string;
  favicon?: string;
}

const DEFAULT_LINKS: QuickLink[] = [
  { id: '1', url: 'https://www.youtube.com', title: 'YouTube' },
  { id: '2', url: 'https://github.com', title: 'GitHub' },
  { id: '3', url: 'https://www.netflix.com', title: 'Netflix' },
  { id: '4', url: 'https://open.spotify.com', title: 'Spotify' },
  { id: '5', url: 'https://mail.google.com', title: 'Gmail' },
  { id: '6', url: 'https://twitter.com', title: 'Twitter' },
];

export const NewTab = ({ onNavigate }: { onNavigate: (url: string) => void }) => {
  const [time, setTime] = useState(new Date());
  const [searchQuery, setSearchQuery] = useState('');
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(-1);
  const [links, setLinks] = useState<QuickLink[]>([]);
  const [showAddModal, setShowAddModal] = useState(false);
  const [newLinkUrl, setNewLinkUrl] = useState('');
  
  // Customization State
  const [bgUrl, setBgUrl] = useState('https://images.unsplash.com/photo-1451187580459-43490279c0fa?q=80&w=2072&auto=format&fit=crop');
  const [showClock, setShowClock] = useState(true);
  const [showSettings, setShowSettings] = useState(false);
  const [tempBgUrl, setTempBgUrl] = useState('');

  // Search input ref to handle clicks outside
  const searchContainerRef = useRef<HTMLDivElement>(null);

  // Load preferences from local storage
  useEffect(() => {
    const savedLinks = localStorage.getItem('diamond_quicklinks');
    if (savedLinks) {
      try { setLinks(JSON.parse(savedLinks)); } catch { setLinks(DEFAULT_LINKS); }
    } else {
      setLinks(DEFAULT_LINKS);
    }

    const savedBg = localStorage.getItem('diamond_bgUrl');
    if (savedBg) {
      setBgUrl(savedBg);
      setTempBgUrl(savedBg);
    }

    const savedClock = localStorage.getItem('diamond_showClock');
    if (savedClock !== null) setShowClock(savedClock === 'true');
  }, []);

  // Update clock
  useEffect(() => {
    const timer = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  // Search Suggestions
  useEffect(() => {
    if (!searchQuery.trim()) {
      setSuggestions([]);
      setSelectedIndex(-1);
      return;
    }

    const timer = setTimeout(async () => {
      try {
        const res = await fetch(`https://duckduckgo.com/ac/?q=${encodeURIComponent(searchQuery)}`);
        const data = await res.json();
        if (Array.isArray(data)) {
          setSuggestions(data.map((item: any) => item.phrase).slice(0, 8));
        }
      } catch (err) {
        // If DDG fails (CORS etc), fallback to a CORS proxy with Google
        try {
          const fallbackRes = await fetch(`https://api.allorigins.win/get?url=${encodeURIComponent(`https://suggestqueries.google.com/complete/search?client=chrome&q=${searchQuery}`)}`);
          const fallbackData = await fallbackRes.json();
          const parsed = JSON.parse(fallbackData.contents);
          if (Array.isArray(parsed) && parsed[1]) {
            setSuggestions(parsed[1].slice(0, 8));
          }
        } catch {
          setSuggestions([]);
        }
      }
    }, 200);

    return () => clearTimeout(timer);
  }, [searchQuery]);

  // Click outside to close suggestions
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (searchContainerRef.current && !searchContainerRef.current.contains(e.target as Node)) {
        setSuggestions([]);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const executeSearch = (query: string) => {
    if (!query.trim()) return;
    let finalUrl = query.trim();
    if (finalUrl.includes('.') && !finalUrl.includes(' ')) {
      if (!finalUrl.startsWith('http')) finalUrl = 'https://' + finalUrl;
    } else {
      finalUrl = `https://www.google.com/search?q=${encodeURIComponent(finalUrl)}`;
    }
    onNavigate(finalUrl);
  };

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (selectedIndex > -1 && suggestions[selectedIndex]) {
      executeSearch(suggestions[selectedIndex]);
    } else {
      executeSearch(searchQuery);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex(prev => (prev < suggestions.length - 1 ? prev + 1 : prev));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex(prev => (prev > -1 ? prev - 1 : -1));
    }
  };

  const saveLinks = (newLinks: QuickLink[]) => {
    setLinks(newLinks);
    localStorage.setItem('diamond_quicklinks', JSON.stringify(newLinks));
  };

  const handleAddLink = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newLinkUrl.trim()) return;
    let url = newLinkUrl.trim();
    if (!url.startsWith('http')) url = 'https://' + url;
    try {
      const parsed = new URL(url);
      const newLink: QuickLink = {
        id: Date.now().toString(),
        url,
        title: parsed.hostname.replace('www.', ''),
      };
      saveLinks([...links, newLink]);
      setShowAddModal(false);
      setNewLinkUrl('');
    } catch {
      alert("Invalid URL");
    }
  };

  const removeLink = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    saveLinks(links.filter(l => l.id !== id));
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Direct read as Data URL (No canvas compression at all, 100% original quality)
    const reader = new FileReader();
    reader.onload = (event) => {
      const rawBase64 = event.target?.result as string;
      setTempBgUrl(rawBase64);
    };
    reader.readAsDataURL(file);
  };

  const saveSettings = (e: React.FormEvent) => {
    e.preventDefault();
    setBgUrl(tempBgUrl);
    try {
      localStorage.setItem('diamond_bgUrl', tempBgUrl);
      localStorage.setItem('diamond_showClock', showClock.toString());
    } catch (err) {
      alert("Image is too large to save! Please use a smaller image file (under 3MB).");
    }
    setShowSettings(false);
  };

  const getFaviconUrl = (url: string) => {
    try {
      const hostname = new URL(url).hostname;
      return `https://www.google.com/s2/favicons?domain=${hostname}&sz=64`;
    } catch { return ''; }
  };

  return (
    <div 
      className="w-full h-full relative flex flex-col items-center justify-center text-white overflow-hidden transition-all duration-500"
      style={{
        backgroundImage: `url("${bgUrl}")`,
        backgroundSize: 'cover',
        backgroundPosition: 'center',
      }}
    >
      {/* Subtle overlay for contrast without blurring the image */}
      <div className="absolute inset-0 bg-black/30" />

      <div className="relative z-10 flex flex-col items-center w-full max-w-2xl px-6 -mt-20">
        
        {/* Windows 11 Style Clock */}
        {showClock && (
          <div className="mb-8 flex flex-col items-center select-none animate-in fade-in slide-in-from-top-4 duration-700">
            <h1 className="text-6xl sm:text-7xl font-semibold tracking-tighter drop-shadow-xl text-white/95">
              {time.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </h1>
            <p className="text-base sm:text-lg font-medium text-white/90 mt-2 drop-shadow-lg tracking-wide">
              {time.toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' })}
            </p>
          </div>
        )}

        {/* Search Bar & Suggestions Container */}
        <div ref={searchContainerRef} className="w-full mb-12 relative group z-30">
          <form onSubmit={handleSearchSubmit} className="relative z-20">
            <div className={`absolute inset-0 bg-white/10 backdrop-blur-xl border border-white/20 shadow-2xl transition-all duration-300 group-focus-within:bg-white/20 group-focus-within:border-white/40 group-focus-within:shadow-[0_0_40px_rgba(255,255,255,0.15)] ${suggestions.length > 0 ? 'rounded-t-3xl rounded-b-none' : 'rounded-full'}`} />
            <div className="relative flex items-center px-5 py-3">
              <svg className="w-5 h-5 text-white/70 mr-3 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyDown={handleKeyDown}
                onFocus={() => { if (searchQuery.trim()) setSelectedIndex(-1); }}
                className="w-full bg-transparent text-base text-white placeholder-white/60 focus:outline-none font-medium"
                placeholder="Search the web or type a URL..."
                autoFocus
                spellCheck={false}
              />
            </div>
          </form>

          {/* Search Suggestions Dropdown */}
          {suggestions.length > 0 && (
            <div className="absolute top-full left-0 right-0 bg-black/40 backdrop-blur-2xl border-x border-b border-white/20 rounded-b-3xl overflow-hidden shadow-2xl z-10 animate-in fade-in duration-200">
              {suggestions.map((suggestion, index) => (
                <div
                  key={index}
                  onClick={() => executeSearch(suggestion)}
                  onMouseEnter={() => setSelectedIndex(index)}
                  className={`px-5 py-2.5 cursor-pointer flex items-center transition-colors ${
                    index === selectedIndex ? 'bg-white/20' : 'hover:bg-white/10'
                  }`}
                >
                  <svg className="w-4 h-4 text-white/50 mr-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                  </svg>
                  <span className="text-white/90 text-[14px] font-medium">{suggestion}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Quick Links Grid */}
        <div className="grid grid-cols-4 sm:grid-cols-5 md:grid-cols-6 gap-x-8 gap-y-8 z-0">
          {links.map((link) => (
            <div key={link.id} className="flex flex-col items-center group relative animate-in fade-in zoom-in-95 duration-500 delay-100">
              <button
                onClick={() => onNavigate(link.url)}
                className="w-[56px] h-[56px] rounded-full bg-white/10 backdrop-blur-md border border-white/20 shadow-xl flex items-center justify-center hover:bg-white/20 hover:scale-105 transition-all duration-300"
              >
                <img src={getFaviconUrl(link.url)} alt="" className="w-7 h-7 rounded pointer-events-none" onError={(e) => {
                  e.currentTarget.style.display = 'none';
                }} />
              </button>
              <span className="mt-2 text-[11px] font-medium text-white/90 truncate w-16 text-center drop-shadow-md bg-black/30 px-2 py-0.5 rounded-full">
                {link.title}
              </span>
              <button 
                onClick={(e) => removeLink(link.id, e)}
                className="absolute -top-1 -right-1 w-5 h-5 bg-rose-500 rounded-full text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity shadow-lg hover:bg-rose-600 hover:scale-110"
              >
                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>
          ))}

          {links.length < 12 && (
            <div className="flex flex-col items-center animate-in fade-in zoom-in-95 duration-500 delay-200">
              <button
                onClick={() => setShowAddModal(true)}
                className="w-[56px] h-[56px] rounded-full bg-black/20 backdrop-blur-md border-2 border-white/10 border-dashed flex items-center justify-center hover:bg-white/10 hover:border-white/30 hover:scale-105 transition-all duration-300 text-white/50 hover:text-white/90"
              >
                <svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
              </button>
              <span className="mt-2 text-[11px] font-medium text-white/50 text-center">
                Shortcut
              </span>
            </div>
          )}
        </div>
      </div>

      {/* Settings Button */}
      <button 
        onClick={() => {
          setTempBgUrl(bgUrl);
          setShowSettings(true);
        }}
        className="absolute bottom-6 right-6 w-10 h-10 rounded-full bg-black/20 backdrop-blur-md border border-white/10 flex items-center justify-center text-white/70 hover:text-white hover:bg-white/10 transition-all hover:rotate-90 duration-300 shadow-lg z-20"
      >
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
        </svg>
      </button>

      {/* Settings Modal */}
      {showSettings && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <form onSubmit={saveSettings} className="bg-[#1e1e1e] p-6 rounded-2xl shadow-2xl w-full max-w-sm border border-white/10 animate-in fade-in zoom-in-95 duration-200">
            <h2 className="text-xl font-semibold mb-6 text-white flex items-center">
              <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
              Dashboard Settings
            </h2>
            
            <div className="mb-5">
              <label className="block text-sm font-medium text-white/70 mb-2">Custom Background</label>
              <input
                type="text"
                value={tempBgUrl}
                onChange={(e) => setTempBgUrl(e.target.value)}
                className="w-full bg-black/50 border border-white/20 rounded-xl px-4 py-3 text-white placeholder-white/40 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 mb-3"
                placeholder="Paste image URL here..."
              />
              <div className="flex items-center gap-3">
                <div className="flex-1 h-px bg-white/10" />
                <span className="text-xs text-white/40 uppercase font-medium">OR</span>
                <div className="flex-1 h-px bg-white/10" />
              </div>
              <label className="mt-3 flex items-center justify-center w-full px-4 py-3 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl cursor-pointer transition-colors text-sm font-medium text-white/80">
                <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" /></svg>
                Upload from PC
                <input type="file" accept="image/*" className="hidden" onChange={handleImageUpload} />
              </label>
            </div>

            <div className="mb-8 flex items-center justify-between">
              <span className="text-sm font-medium text-white/70">Show Clock widget</span>
              <button
                type="button"
                onClick={() => setShowClock(!showClock)}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none ${showClock ? 'bg-blue-500' : 'bg-gray-600'}`}
              >
                <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${showClock ? 'translate-x-6' : 'translate-x-1'}`} />
              </button>
            </div>

            <div className="flex justify-end gap-3">
              <button type="button" onClick={() => setShowSettings(false)} className="px-4 py-2 rounded-lg text-white/70 hover:bg-white/10 transition-colors font-medium">
                Cancel
              </button>
              <button type="submit" className="px-5 py-2 rounded-lg bg-blue-500 text-white hover:bg-blue-600 transition-colors font-medium shadow-lg">
                Save Changes
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Add Shortcut Modal */}
      {showAddModal && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <form onSubmit={handleAddLink} className="bg-[#1e1e1e] p-6 rounded-2xl shadow-2xl w-full max-w-sm border border-white/10 animate-in fade-in zoom-in-95 duration-200">
            <h2 className="text-xl font-semibold mb-4 text-white">Add Shortcut</h2>
            <input
              type="text"
              value={newLinkUrl}
              onChange={(e) => setNewLinkUrl(e.target.value)}
              className="w-full bg-black/50 border border-white/20 rounded-xl px-4 py-3 text-white placeholder-white/40 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 mb-6"
              placeholder="e.g. reddit.com"
              autoFocus
            />
            <div className="flex justify-end gap-3">
              <button type="button" onClick={() => setShowAddModal(false)} className="px-4 py-2 rounded-lg text-white/70 hover:bg-white/10 transition-colors">
                Cancel
              </button>
              <button type="submit" disabled={!newLinkUrl.trim()} className="px-4 py-2 rounded-lg bg-blue-500 text-white hover:bg-blue-600 transition-colors disabled:opacity-50">
                Add
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};

"use client";

export interface ChildProfile {
  id: string;
  name: string;
  age?: string;
  devicePaired: boolean;
}

interface SidebarProps {
  activeTab: string;
  onTabChange: (tab: any) => void;
  pendingRequests: number;
  childrenProfiles: ChildProfile[];
  activeChildId: string | null;
  onSelectChild: (childId: string) => void;
  onAddChild: () => void;
  onPairDevice: (childId: string) => void;
  onDeleteChild: (childId: string) => void;
}

const NAV_ITEMS = [
  {
    key: "activity",
    label: "Activity",
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    ),
  },
  {
    key: "alerts",
    label: "Alerts",
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
      </svg>
    ),
  },
  {
    key: "requests",
    label: "Requests",
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
      </svg>
    ),
  },
  {
    key: "controls",
    label: "Controls",
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
      </svg>
    ),
  },
];

export default function Sidebar({ 
  activeTab, 
  onTabChange, 
  pendingRequests,
  childrenProfiles,
  activeChildId,
  onSelectChild,
  onAddChild,
  onPairDevice,
  onDeleteChild
}: SidebarProps) {
  const activeChild = childrenProfiles.find(c => c.id === activeChildId);
  return (
    <div className="w-64 bg-surface border-r border-border flex flex-col shrink-0">
      {/* Logo */}
      <div className="h-16 flex items-center px-6 border-b border-border">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-blue-500 to-cyan-400 flex items-center justify-center shadow-lg shadow-blue-500/20">
            <span className="text-white font-black text-sm">💎</span>
          </div>
          <div>
            <h1 className="text-sm font-bold text-text tracking-tight">Diamond</h1>
            <p className="text-[10px] text-text-muted font-medium">Parent Dashboard</p>
          </div>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 py-4 px-3 space-y-1">
        {NAV_ITEMS.map((item) => (
          <button
            key={item.key}
            onClick={() => onTabChange(item.key)}
            className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-200 ${
              activeTab === item.key
                ? "bg-primary/10 text-primary border border-primary/20 shadow-sm"
                : "text-text-secondary hover:bg-surface-2 hover:text-text border border-transparent"
            }`}
          >
            <span className={activeTab === item.key ? "text-primary" : "text-text-muted"}>
              {item.icon}
            </span>
            {item.label}
            {item.key === "requests" && pendingRequests > 0 && (
              <span className="ml-auto inline-flex items-center justify-center w-5 h-5 rounded-full bg-danger text-white text-[10px] font-bold animate-pulse">
                {pendingRequests}
              </span>
            )}
          </button>
        ))}
      </nav>

      {/* Child Status */}
      <div className="p-4 border-t border-border flex flex-col gap-2 overflow-y-auto max-h-[40vh]">
        <div className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-1">Children</div>
        
        {childrenProfiles.length === 0 ? (
          <div className="text-xs text-gray-400 text-center py-2">No children added yet.</div>
        ) : (
          childrenProfiles.map((child) => (
            <div 
              key={child.id}
              onClick={() => onSelectChild(child.id)}
              className={`rounded-xl p-3 border transition-all cursor-pointer group ${
                activeChildId === child.id 
                  ? "bg-surface-2 border-primary/50 shadow-sm shadow-primary/10" 
                  : "bg-surface border-border hover:border-gray-700"
              }`}
            >
              <div className="flex items-center gap-2 mb-2">
                <div className={`w-8 h-8 rounded-full flex items-center justify-center shadow-inner ${
                  activeChildId === child.id 
                    ? "bg-gradient-to-br from-blue-500 to-indigo-600" 
                    : "bg-gray-800"
                }`}>
                  <span className="text-white text-xs font-bold">{child.name.charAt(0).toUpperCase()}</span>
                </div>
                <div className="flex-1 truncate">
                  <p className={`text-xs font-semibold ${activeChildId === child.id ? "text-text" : "text-gray-300"}`}>
                    {child.name}
                  </p>
                  {child.age && (
                    <p className="text-[10px] text-gray-500">{child.age} years old</p>
                  )}
                </div>
                {/* Delete Button (visible on hover) */}
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    if (window.confirm(`Are you sure you want to remove ${child.name}?`)) {
                      onDeleteChild(child.id);
                    }
                  }}
                  className="opacity-0 group-hover:opacity-100 p-1.5 text-gray-500 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-all"
                  title="Remove Child"
                >
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                </button>
              </div>
              
              {child.devicePaired ? (
                <div className="flex items-center gap-1.5">
                  <span className="relative flex h-1.5 w-1.5">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-success opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-success"></span>
                  </span>
                  <span className="text-[10px] text-success font-medium">Diamond Shield Active</span>
                </div>
              ) : (
                <div className="mt-2">
                  <button 
                    onClick={(e) => {
                      e.stopPropagation();
                      onPairDevice(child.id);
                    }}
                    className="w-full py-1.5 bg-blue-600/20 text-blue-400 text-[10px] font-bold rounded-lg hover:bg-blue-600/40 transition-colors border border-blue-500/20"
                  >
                    PAIR DEVICE
                  </button>
                </div>
              )}
            </div>
          ))
        )}

        <button 
          onClick={onAddChild}
          className="mt-2 w-full py-2 border border-dashed border-gray-600 rounded-xl text-gray-400 text-xs font-medium hover:text-white hover:border-gray-400 transition-colors flex items-center justify-center gap-2"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          Add Child
        </button>
      </div>
    </div>
  );
}

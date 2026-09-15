"use client";

import React from "react";

export interface ChildProfile {
  id: string;
  name: string;
  age?: string;
  devicePaired: boolean;
}

interface SidebarProps {
  activeTab: string;
  onTabChange: (tab: any) => void;
  pendingRequests?: number;
  childrenProfiles: ChildProfile[];
  activeChildId: string | null;
  onSelectChild: (childId: string) => void;
  onAddChild: () => void;
  onPairDevice?: (childId: string) => void;
  onDeleteChild?: (childId: string) => void;
}

const NAV_ITEMS = [
  {
    key: "dashboard",
    label: "Dashboard",
    icon: (
      <svg className="w-[18px] h-[18px]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" />
      </svg>
    ),
  },
  {
    key: "usage_activity",
    label: "Usage Activity",
    icon: (
      <svg className="w-[18px] h-[18px]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
      </svg>
    ),
  },
  {
    key: "controls", // Maps to App Controls
    label: "App Controls",
    icon: (
      <svg className="w-[18px] h-[18px]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    ),
  },
  {
    key: "screen_time",
    label: "Screen Time",
    icon: (
      <svg className="w-[18px] h-[18px]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    ),
  },
  {
    key: "reports",
    label: "Reports",
    icon: (
      <svg className="w-[18px] h-[18px]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
      </svg>
    ),
  },
  {
    key: "settings",
    label: "Settings",
    icon: (
      <svg className="w-[18px] h-[18px]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
      </svg>
    ),
  },
  {
    key: "help",
    label: "Help",
    icon: (
      <svg className="w-[18px] h-[18px]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    ),
  },
];

export default function Sidebar({
  activeTab,
  onTabChange,
  childrenProfiles,
  activeChildId,
  onSelectChild,
  onAddChild,
  onPairDevice,
  onDeleteChild,
}: SidebarProps) {
  return (
    <div className="flex flex-col h-full bg-dash-sidebar border-r border-dash-border">
      {/* Brand / Logo */}
      <div className="flex items-center gap-3 p-6 pb-8">
        <div className="w-8 h-8 rounded-full bg-gradient-to-br from-indigo-400 to-blue-500 shadow-lg shadow-blue-500/20 shrink-0"></div>
        <div className="flex flex-col">
          <span className="text-[14px] font-bold text-dash-text tracking-wide leading-tight">KIDSGUARD /</span>
          <span className="text-[11px] font-semibold text-dash-text-muted tracking-[0.2em] leading-tight">DASHBOARD</span>
        </div>
      </div>

      {/* Navigation Menu */}
      <nav className="flex-1 px-4 space-y-1.5 overflow-y-auto custom-scrollbar">
        {NAV_ITEMS.map((item) => {
          const isActive = activeTab === item.key;
          return (
            <button
              key={item.key}
              onClick={() => onTabChange(item.key)}
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-[14px] transition-all duration-200 group relative ${
                isActive 
                  ? "bg-dash-border-light text-dash-text shadow-sm" 
                  : "text-dash-text-muted hover:text-dash-text hover:bg-dash-card-hover"
              }`}
            >
              <div className={`${isActive ? "text-indigo-400" : "text-dash-text-faded group-hover:text-indigo-400 transition-colors"}`}>
                {item.icon}
              </div>
              <span className="text-[13px] font-bold tracking-wide">{item.label}</span>
              
              {/* Active Dot Indicator */}
              {isActive && (
                <div className="absolute right-4 w-1.5 h-1.5 rounded-full bg-white shadow-[0_0_8px_rgba(255,255,255,0.8)]"></div>
              )}
            </button>
          );
        })}

        {/* Separator line */}
        <div className="h-[1px] w-full bg-[#1e222b] my-6"></div>

        {/* Children Section */}
        <div className="px-2">
          <h3 className="text-[10px] font-extrabold text-dash-text-faded tracking-[0.2em] uppercase mb-3 ml-2">Children</h3>
          <div className="space-y-1.5">
            {childrenProfiles.map((child) => (
              <button
                key={child.id}
                onClick={() => onSelectChild(child.id)}
                className={`w-full flex items-center justify-between px-3 py-2.5 rounded-[14px] transition-all duration-200 border ${
                  activeChildId === child.id
                    ? "bg-dash-card-hover border-dash-border-light"
                    : "bg-transparent border-transparent hover:bg-dash-card-hover"
                }`}
              >
                <div className="flex items-center gap-3">
                  <div className="w-6 h-6 rounded-md bg-indigo-500/20 text-indigo-400 flex items-center justify-center text-xs font-bold shrink-0">
                    {child.name.charAt(0).toUpperCase()}
                  </div>
                  <span className={`text-[13px] font-bold ${activeChildId === child.id ? "text-dash-text" : "text-dash-text-muted"}`}>
                    {child.name}
                  </span>
                </div>
                {activeChildId === child.id && (
                  <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]"></div>
                )}
              </button>
            ))}

            <button
              onClick={onAddChild}
              className="w-full flex items-center justify-center gap-2 px-3 py-2.5 mt-2 rounded-[14px] border border-dashed border-dash-border-light text-dash-text-muted hover:text-dash-text hover:border-dash-text-faded hover:bg-dash-card-hover transition-all"
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              <span className="text-[12px] font-bold">Add Child</span>
            </button>
          </div>
        </div>
      </nav>

      {/* Bottom Profile Area (N Avatar) */}
      <div className="p-6">
        <div className="w-9 h-9 rounded-full bg-dash-card-hover border border-dash-border-light flex items-center justify-center text-dash-text text-[13px] font-bold shadow-md cursor-pointer hover:bg-dash-border-light transition-colors">
          N
        </div>
      </div>
    </div>
  );
}
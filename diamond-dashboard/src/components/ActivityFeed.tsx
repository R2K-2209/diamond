"use client";

import type { LogEntry } from "@/app/page";

interface ActivityFeedProps {
  logs: LogEntry[];
}

function formatTime(timestamp: any): string {
  if (!timestamp?.toDate) return "—";
  const date = timestamp.toDate();
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);

  if (diffMins < 1) return "Just now";
  if (diffMins < 60) return `${diffMins}m ago`;
  const diffHrs = Math.floor(diffMins / 60);
  if (diffHrs < 24) return `${diffHrs}h ago`;
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function getDomainFromUrl(url: string): string {
  try {
    return new URL(url).hostname.replace("www.", "");
  } catch {
    return url;
  }
}

function getFaviconUrl(url: string): string {
  try {
    const domain = new URL(url).hostname;
    return `https://www.google.com/s2/favicons?domain=${domain}&sz=32`;
  } catch {
    return "";
  }
}

export default function ActivityFeed({ logs }: ActivityFeedProps) {
  if (logs.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-64 text-text-muted">
        <svg className="w-12 h-12 mb-3 opacity-30" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
        <p className="text-sm font-medium">No browsing activity yet</p>
        <p className="text-xs mt-1">Activity will appear here when your child starts browsing</p>
      </div>
    );
  }

  return (
    <div className="space-y-1">
      {logs.map((log) => (
        <div
          key={log.id}
          className="flex items-center gap-3 px-4 py-3 rounded-xl hover:bg-surface-2/60 transition-colors group"
        >
          {/* Favicon */}
          <div className="w-8 h-8 rounded-lg bg-surface-3 border border-border flex items-center justify-center shrink-0 overflow-hidden">
            <img
              src={getFaviconUrl(log.url)}
              alt=""
              className="w-4 h-4"
              onError={(e) => {
                (e.target as HTMLImageElement).style.display = "none";
              }}
            />
          </div>

          {/* Content */}
          <div className="flex-1 min-w-0">
            <p className="text-sm text-text font-medium truncate">
              {log.title || "Untitled Page"}
            </p>
            <p className="text-xs text-text-muted truncate font-mono">
              {getDomainFromUrl(log.url)}
            </p>
          </div>

          {/* Time */}
          <span className="text-[11px] text-text-muted font-medium shrink-0 tabular-nums">
            {formatTime(log.timestamp)}
          </span>

          {/* Status Dot */}
          <div className="w-2 h-2 rounded-full bg-success/60 shrink-0" title="Safe" />
        </div>
      ))}
    </div>
  );
}

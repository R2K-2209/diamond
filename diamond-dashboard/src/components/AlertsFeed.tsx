"use client";

import type { AlertEntry } from "@/app/page";

interface AlertsFeedProps {
  alerts: AlertEntry[];
  onDelete: (id: string) => void;
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
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

function getCategoryStyle(category: string): { bg: string; text: string; border: string } {
  const lower = category.toLowerCase();
  if (lower.includes("adult")) return { bg: "bg-rose-500/10", text: "text-rose-300", border: "border-rose-500/20" };
  if (lower.includes("gambling")) return { bg: "bg-amber-500/10", text: "text-amber-300", border: "border-amber-500/20" };
  if (lower.includes("social")) return { bg: "bg-violet-500/10", text: "text-violet-300", border: "border-violet-500/20" };
  if (lower.includes("vpn") || lower.includes("proxy")) return { bg: "bg-orange-500/10", text: "text-orange-300", border: "border-orange-500/20" };
  if (lower.includes("shortener")) return { bg: "bg-sky-500/10", text: "text-sky-300", border: "border-sky-500/20" };
  if (lower.includes("piracy") || lower.includes("malware")) return { bg: "bg-red-500/10", text: "text-red-300", border: "border-red-500/20" };
  if (lower.includes("parent")) return { bg: "bg-blue-500/10", text: "text-blue-300", border: "border-blue-500/20" };
  if (lower.includes("content")) return { bg: "bg-pink-500/10", text: "text-pink-300", border: "border-pink-500/20" };
  return { bg: "bg-slate-500/10", text: "text-slate-300", border: "border-slate-500/20" };
}

function getDomainFromUrl(url: string): string {
  try {
    return new URL(url).hostname.replace("www.", "");
  } catch {
    return url;
  }
}

export default function AlertsFeed({ alerts, onDelete }: AlertsFeedProps) {
  if (alerts.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-64 text-text-muted">
        <svg className="w-12 h-12 mb-3 opacity-30" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
        </svg>
        <p className="text-sm font-medium">No security alerts</p>
        <p className="text-xs mt-1">Diamond Shield is keeping things safe ✨</p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {alerts.map((alert) => {
        const style = getCategoryStyle(alert.category);
        return (
          <div
            key={alert.id}
            className="bg-surface rounded-xl border border-border p-4 hover:border-border-light transition-colors group"
          >
            <div className="flex items-start gap-3">
              {/* Severity Icon */}
              <div className="w-9 h-9 rounded-lg bg-danger/10 flex items-center justify-center shrink-0 mt-0.5">
                <svg className="w-5 h-5 text-danger" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
                </svg>
              </div>

              {/* Content */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <span className={`inline-flex px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wide ${style.bg} ${style.text} border ${style.border}`}>
                    {alert.category}
                  </span>
                  <span className="text-[10px] text-text-muted tabular-nums">{formatTime(alert.timestamp)}</span>
                </div>
                <p className="text-xs text-text-secondary mb-1">{alert.reason}</p>
                <p className="text-[11px] text-text-muted font-mono truncate">
                  {getDomainFromUrl(alert.url)}
                </p>
              </div>

              {/* Delete button */}
              <button
                onClick={() => onDelete(alert.id)}
                className="opacity-0 group-hover:opacity-100 p-1.5 rounded-lg hover:bg-surface-3 text-text-muted hover:text-danger transition-all"
                title="Dismiss"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}

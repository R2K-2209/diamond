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
      <div className="space-y-3 mt-4">
        {[1, 2, 3].map((i) => (
          <div key={i} className="bg-dash-card/30 rounded-xl border border-dash-border/30 p-4 animate-pulse flex items-start gap-3">
            <div className="w-10 h-10 rounded-lg bg-dash-sidebar flex-shrink-0"></div>
            <div className="flex-1 space-y-2 py-1">
              <div className="h-4 bg-dash-sidebar rounded w-3/4"></div>
              <div className="h-3 bg-dash-sidebar rounded w-1/2"></div>
            </div>
            <div className="w-12 h-4 bg-dash-sidebar rounded"></div>
          </div>
        ))}
        <div className="flex flex-col items-center justify-center pt-8 pb-4 text-dash-text-faded">
          <svg className="w-10 h-10 mb-3 opacity-20" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
          </svg>
          <p className="text-[12px] font-medium opacity-60">No recent security alerts</p>
        </div>
      </div>
    );
  }

  // Group alerts by URL and Category within a 5-minute rolling window
  const groupedAlerts: any[] = [];
  alerts.forEach(alert => {
    // Ignore internal/local pages
    if (alert.url.includes('localhost') || alert.url.includes('127.0.0.1') || alert.url.includes('blocked.html') || alert.url.startsWith('diamond://')) {
      return;
    }

    const alertTime = alert.timestamp?.seconds || 0;
    const group = groupedAlerts.find(g => {
      const gTime = g.timestamp?.seconds || 0;
      return g.url === alert.url && g.category === alert.category && Math.abs(gTime - alertTime) < 300;
    });

    if (group) {
      group.ids.push(alert.id);
      if (!group.reasons.includes(alert.reason)) {
        group.reasons.push(alert.reason);
      }
    } else {
      groupedAlerts.push({
        id: alert.id,
        ids: [alert.id],
        category: alert.category,
        reasons: [alert.reason],
        url: alert.url,
        timestamp: alert.timestamp
      });
    }
  });

  return (
    <div className="space-y-3">
      {groupedAlerts.map((group) => {
        const style = getCategoryStyle(group.category);
        return (
          <div
            key={group.id}
            className="bg-dash-card rounded-xl border border-dash-border p-4 hover:border-dash-border-light transition-colors group/card"
          >
            <div className="flex items-start gap-3">
              {/* Favicon */}
              <div className="w-10 h-10 rounded-lg bg-surface-3 border border-border flex items-center justify-center shrink-0 overflow-hidden mt-0.5">
                <img 
                  src={`https://www.google.com/s2/favicons?domain=${getDomainFromUrl(group.url)}&sz=64`} 
                  alt="" 
                  className="w-5 h-5" 
                  onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }} 
                />
              </div>

              {/* Content */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-2">
                  <span className={`inline-flex px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wide ${style.bg} ${style.text} border ${style.border}`}>
                    {group.category}
                  </span>
                  <span className="text-[10px] text-dash-text-muted tabular-nums">{formatTime(group.timestamp)}</span>
                  {group.ids.length > 1 && (
                    <span className="text-[10px] text-dash-text-faded">({group.ids.length} alerts)</span>
                  )}
                </div>
                
                <div className="flex flex-wrap gap-1.5 mb-2">
                  {group.reasons.map((r: string, i: number) => (
                    <span key={i} className={`inline-flex px-1.5 py-0.5 rounded text-[10px] font-medium border ${style.bg} ${style.text} ${style.border}`}>
                      {r}
                    </span>
                  ))}
                </div>
                
                <a 
                  href={group.url} 
                  target="_blank" 
                  rel="noreferrer" 
                  className="text-[11px] text-indigo-400 hover:text-indigo-300 hover:underline truncate block max-w-full" 
                  title={group.url}
                >
                  {getDomainFromUrl(group.url)}
                </a>
              </div>

              {/* Delete button */}
              <button
                onClick={() => {
                  group.ids.forEach((id: string) => onDelete(id));
                }}
                className="opacity-0 group-hover/card:opacity-100 p-1.5 rounded-lg hover:bg-dash-card-hover text-dash-text-muted hover:text-danger transition-all shrink-0"
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

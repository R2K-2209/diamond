"use client";

import type { AccessRequest as AccessRequestType } from "@/app/page";

interface AccessRequestsProps {
  requests: AccessRequestType[];
  onApprove: (id: string) => void;
  onDeny: (id: string) => void;
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

const STATUS_STYLES = {
  PENDING: { bg: "bg-warning/10", text: "text-warning", border: "border-warning/20", label: "Pending" },
  APPROVED: { bg: "bg-success/10", text: "text-success", border: "border-success/20", label: "Approved" },
  DENIED: { bg: "bg-danger/10", text: "text-danger", border: "border-danger/20", label: "Denied" },
};

export default function AccessRequests({ requests, onApprove, onDeny }: AccessRequestsProps) {
  const pending = requests.filter((r) => r.status === "PENDING");
  const resolved = requests.filter((r) => r.status !== "PENDING");

  if (requests.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-64 text-text-muted">
        <svg className="w-12 h-12 mb-3 opacity-30" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
        </svg>
        <p className="text-sm font-medium">No access requests</p>
        <p className="text-xs mt-1">When your child encounters a blocked site, their requests will appear here</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Pending Requests */}
      {pending.length > 0 && (
        <div>
          <h3 className="text-xs font-bold uppercase tracking-wider text-warning mb-3 flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-warning animate-pulse"></span>
            Awaiting Your Decision ({pending.length})
          </h3>
          <div className="space-y-2">
            {pending.map((req) => (
              <div
                key={req.id}
                className="bg-surface rounded-xl border border-warning/20 p-4 shadow-sm"
              >
                <div className="flex items-center gap-3">
                  {/* Favicon */}
                  <div className="w-10 h-10 rounded-lg bg-surface-3 border border-border flex items-center justify-center shrink-0 overflow-hidden">
                    <img
                      src={getFaviconUrl(req.url)}
                      alt=""
                      className="w-5 h-5"
                      onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
                    />
                  </div>

                  {/* Details */}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-text font-medium truncate">
                      {getDomainFromUrl(req.url)}
                    </p>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className="text-[10px] text-text-muted font-mono truncate">{req.url}</span>
                      <span className="text-[10px] text-text-muted">·</span>
                      <span className="text-[10px] text-text-muted">{formatTime(req.timestamp)}</span>
                    </div>
                    {req.category && (
                      <span className="inline-flex mt-1.5 px-2 py-0.5 rounded text-[9px] font-bold uppercase tracking-wide bg-surface-3 text-text-muted border border-border">
                        Blocked: {req.category}
                      </span>
                    )}
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      onClick={() => onDeny(req.id)}
                      className="px-3 py-1.5 rounded-lg text-xs font-medium bg-surface-3 text-text-secondary hover:bg-danger/20 hover:text-danger border border-border hover:border-danger/30 transition-all"
                    >
                      Deny
                    </button>
                    <button
                      onClick={() => onApprove(req.id)}
                      className="px-3 py-1.5 rounded-lg text-xs font-medium bg-success/10 text-success hover:bg-success/20 border border-success/20 hover:border-success/40 transition-all"
                    >
                      Approve
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Resolved Requests */}
      {resolved.length > 0 && (
        <div>
          <h3 className="text-xs font-bold uppercase tracking-wider text-text-muted mb-3">
            Previously Resolved ({resolved.length})
          </h3>
          <div className="space-y-1">
            {resolved.map((req) => {
              const statusStyle = STATUS_STYLES[req.status] || STATUS_STYLES.DENIED;
              return (
                <div
                  key={req.id}
                  className="flex items-center gap-3 px-4 py-2.5 rounded-xl hover:bg-surface-2/40 transition-colors"
                >
                  <div className="w-7 h-7 rounded-lg bg-surface-3 border border-border flex items-center justify-center shrink-0 overflow-hidden">
                    <img
                      src={getFaviconUrl(req.url)}
                      alt=""
                      className="w-3.5 h-3.5"
                      onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
                    />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs text-text-secondary truncate">{getDomainFromUrl(req.url)}</p>
                  </div>
                  <span className={`inline-flex px-2 py-0.5 rounded text-[10px] font-bold ${statusStyle.bg} ${statusStyle.text} border ${statusStyle.border}`}>
                    {statusStyle.label}
                  </span>
                  <span className="text-[10px] text-text-muted tabular-nums">{formatTime(req.timestamp)}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

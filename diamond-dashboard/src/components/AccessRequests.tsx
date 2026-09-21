"use client";

import type { AccessRequest as AccessRequestType } from "@/app/page";
import { useState, useEffect } from "react";

interface AccessRequestsProps {
  requests: AccessRequestType[];
  activeAllowedDomains?: any[];
  alerts?: any[];
  onApprove: (id: string, url: string, durationMs: number | null) => void;
  onDeny: (id: string) => void;
  onRevoke?: (url: string) => void;
  onClearHistory?: () => void;
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

export default function AccessRequests({ requests, activeAllowedDomains = [], alerts = [], onApprove, onDeny, onRevoke, onClearHistory }: AccessRequestsProps) {
  const [durations, setDurations] = useState<Record<string, number | null>>({});
  const [showHistory, setShowHistory] = useState(false);
  const [expandedSites, setExpandedSites] = useState<Record<string, boolean>>({});
  
  // Need local state for live countdowns
  const [now, setNow] = useState(Date.now());
  
  // Only update current time every minute to avoid excessive re-renders
  useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), 60000);
    return () => clearInterval(interval);
  }, []);

  const pending = requests.filter((r) => r.status?.toUpperCase() === "PENDING");
  const resolved = requests.filter((r) => r.status?.toUpperCase() !== "PENDING");

  if (requests.length === 0) {
    return (
      <div className="space-y-6">
        <div className="flex-1 space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="bg-dash-card/30 rounded-xl border border-dash-border/30 p-4 animate-pulse flex flex-col gap-3">
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 rounded-lg bg-dash-sidebar flex-shrink-0"></div>
                <div className="flex-1 space-y-2 py-1">
                  <div className="h-4 bg-dash-sidebar rounded w-2/3"></div>
                  <div className="h-3 bg-dash-sidebar rounded w-1/3"></div>
                </div>
              </div>
              <div className="flex items-center justify-end gap-2 mt-2">
                <div className="w-20 h-7 bg-dash-sidebar rounded-lg"></div>
                <div className="w-16 h-7 bg-dash-sidebar rounded-lg"></div>
                <div className="w-16 h-7 bg-dash-sidebar rounded-lg"></div>
              </div>
            </div>
          ))}
          <div className="flex flex-col items-center justify-center pt-8 pb-4 text-dash-text-faded">
            <svg className="w-10 h-10 mb-3 opacity-20" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
            </svg>
            <p className="text-[12px] font-medium opacity-60">No pending requests</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header & History Button */}
      {resolved.length > 0 && (
        <div className="flex justify-end mb-2">
          <button 
            onClick={() => setShowHistory(true)}
            className="text-xs font-bold uppercase tracking-wider text-dash-text-faded hover:text-dash-text transition-colors flex items-center gap-1.5"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
            View History ({resolved.length})
          </button>
        </div>
      )}

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
                    {(req.category || req.reason) && (
                      <div className="flex flex-col gap-1.5 mt-2">
                        {req.category && (
                          <span className="inline-flex w-fit px-2 py-0.5 rounded text-[9px] font-bold uppercase tracking-wide bg-surface-3 text-text-muted border border-border">
                            Blocked: {req.category}
                          </span>
                        )}
                        {req.reason && (
                          <span className="text-[10px] text-warning-dark bg-warning/10 px-2 py-1 rounded border border-warning/20">
                            <strong>Reason:</strong> {req.reason}
                          </span>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-2 shrink-0">
                    <select
                      className="bg-surface-3 border border-border text-xs rounded-lg px-2 py-1.5 outline-none text-text-secondary"
                      value={durations[req.id] === undefined ? '3600000' : (durations[req.id] === null ? 'forever' : durations[req.id]?.toString())}
                      onChange={(e) => {
                        const val = e.target.value === 'forever' ? null : parseInt(e.target.value);
                        setDurations((prev) => ({ ...prev, [req.id]: val }));
                      }}
                    >
                      <option value="3600000">1 Hour</option>
                      <option value="21600000">6 Hours</option>
                      <option value="86400000">1 Day</option>
                      <option value="604800000">1 Week</option>
                      <option value="forever">Forever</option>
                    </select>
                    <button
                      onClick={() => onDeny(req.id)}
                      className="px-3 py-1.5 rounded-lg text-xs font-medium bg-surface-3 text-text-secondary hover:bg-danger/20 hover:text-danger border border-border hover:border-danger/30 transition-all"
                    >
                      Deny
                    </button>
                    <button
                      onClick={() => {
                        const d = durations[req.id] === undefined ? 3600000 : durations[req.id];
                        onApprove(req.id, req.url, d);
                      }}
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

      {/* Live Access Granted */}
      {activeAllowedDomains.length > 0 && (
        <div className="mt-6">
          <h3 className="text-xs font-bold uppercase tracking-wider text-success mb-3 border-t border-dash-border pt-4 flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-success animate-pulse"></span>
            Live Access Granted ({activeAllowedDomains.length})
          </h3>
          <div className="space-y-3">
            {activeAllowedDomains.map((site) => {
              // Find original block reason
              const originalRequest = requests.slice().reverse().find(r => r.url === site.url && r.status?.toUpperCase() === 'APPROVED');
              const blockReason = originalRequest?.reason || originalRequest?.category || 'Manually Allowed';
              
              // Find silent flags
              const siteAlerts = alerts.filter(a => a.type === 'ALLOWED_SITE_FLAG' && a.url.includes(site.url));
              const uniqueKeywords = Array.from(new Set(siteAlerts.map(a => a.reason)));
              
              // Time remaining
              let timeRemaining = 'Forever';
              let isExpired = false;
              if (site.expiry) {
                const diffMs = site.expiry - now;
                if (diffMs <= 0) {
                  isExpired = true;
                  timeRemaining = 'Expired';
                } else {
                  const diffMins = Math.floor(diffMs / 60000);
                  const diffHrs = Math.floor(diffMins / 60);
                  if (diffHrs > 24) {
                    timeRemaining = `${Math.floor(diffHrs / 24)}d left`;
                  } else if (diffHrs > 0) {
                    timeRemaining = `${diffHrs}h ${diffMins % 60}m left`;
                  } else {
                    timeRemaining = `${diffMins}m left`;
                  }
                }
              }

              if (isExpired) return null; // Shouldn't happen often as backend cleans it up, but just in case

              const isExpanded = expandedSites[site.url];

              return (
                <div 
                  key={site.url} 
                  className={`bg-surface rounded-xl border p-4 shadow-sm flex flex-col gap-3 relative transition-all cursor-pointer ${isExpanded ? 'border-success/40 bg-success/5' : 'border-success/20 hover:border-success/30'}`}
                  onClick={() => setExpandedSites(prev => ({ ...prev, [site.url]: !prev[site.url] }))}
                >
                  <div className="absolute top-0 right-0 w-1.5 h-full bg-success opacity-80"></div>
                  
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-lg bg-surface-3 border border-border flex items-center justify-center shrink-0 overflow-hidden">
                      <img src={getFaviconUrl(site.url)} alt="" className="w-5 h-5" onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }} />
                    </div>
                    
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-text font-medium truncate">{getDomainFromUrl(site.url)}</p>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className="text-[10px] font-bold text-success uppercase tracking-wider">{timeRemaining}</span>
                        <span className="text-[10px] text-text-muted">·</span>
                        <span className="text-[10px] text-text-muted font-mono truncate max-w-[200px]">{site.url}</span>
                      </div>
                    </div>
                    
                    <div className="flex items-center gap-3 shrink-0">
                      {onRevoke && (
                        <button 
                          onClick={(e) => { e.stopPropagation(); onRevoke(site.url); }}
                          className="px-3 py-1.5 rounded-lg text-xs font-medium bg-surface-3 text-text-secondary hover:bg-danger/10 hover:text-danger hover:border-danger/30 transition-all border border-border shrink-0"
                        >
                          Revoke Now
                        </button>
                      )}
                      <svg 
                        className={`w-5 h-5 text-text-muted transition-transform ${isExpanded ? 'rotate-180' : ''}`} 
                        fill="none" 
                        stroke="currentColor" 
                        viewBox="0 0 24 24"
                      >
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
                      </svg>
                    </div>
                  </div>

                  {isExpanded && (
                    <div className="pl-13 flex flex-col gap-2 mt-1 border-t border-dash-border pt-3" onClick={(e) => e.stopPropagation()}>
                      <div className="bg-dash-bg rounded-lg p-2.5 border border-dash-border-light text-[11px]">
                        <p className="text-dash-text-muted"><strong className="text-dash-text">Original Block Reason:</strong> {blockReason}</p>
                      </div>
                      
                      {uniqueKeywords.length > 0 ? (
                        <div className="bg-warning/5 rounded-lg p-2.5 border border-warning/20 text-[11px]">
                          <p className="text-warning font-medium mb-1 flex items-center gap-1.5">
                            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"></path></svg>
                            Scanners Flagged Ongoing Activity:
                          </p>
                          <div className="flex flex-wrap gap-1.5 mt-1.5">
                            {uniqueKeywords.map((kw, i) => (
                              <span key={i} className="inline-flex px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wide bg-warning/20 text-warning-dark border border-warning/30">
                                {kw}
                              </span>
                            ))}
                          </div>
                        </div>
                      ) : (
                        <div className="bg-success/5 rounded-lg p-2.5 border border-success/20 text-[11px]">
                          <p className="text-success font-medium flex items-center gap-1.5">
                            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7"></path></svg>
                            No restricted keywords found during this active session.
                          </p>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* History Modal */}
      {showHistory && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="bg-dash-card rounded-2xl border border-dash-border w-full max-w-2xl max-h-[80vh] flex flex-col shadow-2xl overflow-hidden">
            <div className="flex items-center justify-between p-5 border-b border-dash-border bg-dash-sidebar">
              <div>
                <h2 className="text-[18px] font-bold text-dash-text">Request History</h2>
                <p className="text-[12px] text-dash-text-faded mt-0.5">Previously resolved and expired access requests.</p>
              </div>
              <div className="flex items-center gap-3">
                {resolved.length > 0 && onClearHistory && (
                  <button 
                    onClick={() => {
                      onClearHistory();
                      setShowHistory(false);
                    }}
                    className="text-[12px] font-bold text-dash-text-muted hover:text-rose-400 transition-colors flex items-center gap-1.5"
                  >
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                    Clear All
                  </button>
                )}
                <button 
                  onClick={() => setShowHistory(false)}
                  className="p-2 rounded-xl text-dash-text-faded hover:text-dash-text hover:bg-dash-card-hover transition-colors"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"></path></svg>
                </button>
              </div>
            </div>
            
            <div className="flex-1 overflow-y-auto p-5 custom-scrollbar bg-dash-bg">
              {resolved.length === 0 ? (
                <div className="flex items-center justify-center h-40 text-[13px] text-dash-text-faded">No history found</div>
              ) : (
                <div className="space-y-2">
                  {resolved.map((req) => {
                    const statusKey = req.status?.toUpperCase() || 'DENIED';
                    const statusStyle = STATUS_STYLES[statusKey as keyof typeof STATUS_STYLES] || STATUS_STYLES.DENIED;
                    return (
                      <div key={req.id} className="flex items-center gap-4 px-4 py-3 rounded-xl bg-dash-card hover:bg-dash-card-hover transition-colors border border-dash-border-light">
                        <div className="w-8 h-8 rounded-lg bg-surface-3 border border-border flex items-center justify-center shrink-0 overflow-hidden">
                          <img src={getFaviconUrl(req.url)} alt="" className="w-4 h-4" onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-[13px] font-medium text-dash-text truncate">{getDomainFromUrl(req.url)}</p>
                          <p className="text-[10px] text-dash-text-muted truncate">{req.url}</p>
                        </div>
                        <span className={`inline-flex px-2.5 py-1 rounded-lg text-[11px] font-bold ${statusStyle.bg} ${statusStyle.text} border ${statusStyle.border}`}>
                          {statusStyle.label}
                        </span>
                        <span className="text-[11px] text-dash-text-muted tabular-nums whitespace-nowrap">{formatTime(req.timestamp)}</span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

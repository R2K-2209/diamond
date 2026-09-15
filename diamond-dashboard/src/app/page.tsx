"use client";

import { useState, useEffect, useMemo } from "react";
import { useTheme } from "next-themes";
import { db } from "@/firebase";
import {
  query,
  where,
  orderBy,
  limit,
  onSnapshot,
  doc,
  collection,
  setDoc,
  updateDoc,
  deleteDoc,
  addDoc,
  type Timestamp,
} from "firebase/firestore";
import Sidebar from "@/components/Sidebar";
import StatsCards from "@/components/StatsCards";
import ActivityFeed from "@/components/ActivityFeed";
import AlertsFeed from "@/components/AlertsFeed";
import AccessRequests from "@/components/AccessRequests";
import PolicyControls from "@/components/PolicyControls";
import AddChildModal from "@/components/AddChildModal";
import PairDeviceModal from "@/components/PairDeviceModal";
import { useAuth } from "@/context/AuthContext";
import { useRouter } from "next/navigation";

// ─── Types ──────────────────────────────────────────────────────

export interface LogEntry {
  id: string;
  url: string;
  title: string;
  timestamp: Timestamp;
  userId: string;
  safe: boolean;
}

export interface AlertEntry {
  id: string;
  type: string;
  url: string;
  category: string;
  reason: string;
  timestamp: Timestamp;
  userId: string;
  severity: string;
}

export interface AccessRequest {
  id: string;
  url: string;
  category: string;
  timestamp: Timestamp;
  userId: string;
  status: "PENDING" | "APPROVED" | "DENIED";
}

// ─── Dashboard Page ─────────────────────────────────────────────

import { type ChildProfile } from "@/components/Sidebar";

type TabKey = "dashboard" | "usage_activity" | "controls" | "screen_time" | "reports" | "settings" | "help";

export default function Dashboard() {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [alerts, setAlerts] = useState<AlertEntry[]>([]);
  const [requests, setRequests] = useState<AccessRequest[]>([]);
  
  // Child Profile State
  const [childrenProfiles, setChildrenProfiles] = useState<ChildProfile[]>([]);
  const [activeChildId, setActiveChildId] = useState<string | null>(null);
  
  // Modals
  const [showAddChild, setShowAddChild] = useState(false);
  const [isAddingChild, setIsAddingChild] = useState(false);
  const [newChildName, setNewChildName] = useState("");
  const [newChildAge, setNewChildAge] = useState("");
  const [showPairModal, setShowPairModal] = useState(false);
  const [pairingChildId, setPairingChildId] = useState<string | null>(null);
  const [pairingCode, setPairingCode] = useState("");
  const [pairingError, setPairingError] = useState("");
  const [isPairing, setIsPairing] = useState(false);
  const [isScanMode, setIsScanMode] = useState(true);

  const [activeTab, setActiveTab] = useState<TabKey>("dashboard");
  const [isLoading, setIsLoading] = useState(true);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  const { user, loading: authLoading, signOut } = useAuth();
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  const router = useRouter();

  // Redirect if unauthenticated
  useEffect(() => {
    setMounted(true);
    if (!authLoading && !user) {
      router.push("/login");
    }
  }, [user, authLoading, router]);

  // ── Data Fetching: Children Profiles ──
  useEffect(() => {
    if (!user || !db) return;
    
    try {
      const childrenQuery = query(collection(db, `parents/${user.uid}/children`), orderBy("createdAt", "asc"));
      const unsubChildren = onSnapshot(childrenQuery, (snapshot) => {
        const data = snapshot.docs.map((d) => ({
          id: d.id,
          ...d.data(),
        })) as ChildProfile[];
        
        setChildrenProfiles(data);
        
        // Auto-select first child if none selected
        if (data.length > 0 && !activeChildId) {
          setActiveChildId(data[0].id);
        } else if (data.length === 0) {
          setActiveChildId(null);
        }
      });
      return () => unsubChildren();
    } catch (e) {
      console.error("Firestore init error:", e);
      setChildrenProfiles([]);
      setIsLoading(false);
    }
  }, [user, activeChildId]);


  // ── Data Fetching: Local APIs + Firestore Real-time ──
  useEffect(() => {
    setIsLoading(true);

    // Only fetch local data if we have an active child (otherwise it's global noise)
    if (activeChildId) {
      const fetchLocalData = async () => {
        try {
          const [logsRes, alertsRes, reqsRes] = await Promise.allSettled([
            fetch("/api/logs").then((r) => r.json()),
            fetch("/api/alerts").then((r) => r.json()),
            fetch("/api/requests").then((r) => r.json()),
          ]);

          if (logsRes.status === "fulfilled" && logsRes.value?.success) {
            setLogs((prev) => (prev.length === 0 ? logsRes.value.logs.filter((l: any) => l.userId === activeChildId) : prev));
          }
          if (alertsRes.status === "fulfilled" && alertsRes.value?.success) {
            setAlerts((prev) => (prev.length === 0 ? alertsRes.value.alerts.filter((a: any) => a.userId === activeChildId) : prev));
          }
          if (reqsRes.status === "fulfilled" && reqsRes.value?.success) {
            setRequests((prev) => (prev.length === 0 ? reqsRes.value.requests.filter((r: any) => r.userId === activeChildId) : prev));
          }
        } catch (err) {
          console.warn("Local data fetch error:", err);
        } finally {
          setIsLoading(false);
        }
      };

      fetchLocalData();
    }

    // Real-time Firestore Listeners (scoped by activeChildId)
    let unsubLogs = () => {};
    let unsubAlerts = () => {};
    let unsubRequests = () => {};

    if (activeChildId && db) {
      try {
        // Removed orderBy("timestamp", "desc") because Firebase is throwing missing composite index errors
        const logsQuery = query(collection(db, "logs"), where("userId", "==", activeChildId));
        unsubLogs = onSnapshot(
          logsQuery,
          (snapshot) => {
            const data = snapshot.docs.map((doc) => ({
              id: doc.id,
              ...doc.data(),
            })) as LogEntry[];
            // Sort manually in JS to bypass Firestore index requirement
            data.sort((a, b) => {
              const tA = a.timestamp?.seconds || 0;
              const tB = b.timestamp?.seconds || 0;
              return tB - tA;
            });
            setLogs(data);
            setIsLoading(false);
          },
          () => setIsLoading(false)
        );

        const alertsQuery = query(collection(db, "alerts"), where("userId", "==", activeChildId));
        unsubAlerts = onSnapshot(
          alertsQuery,
          (snapshot) => {
            const data = snapshot.docs.map((doc) => ({
              id: doc.id,
              ...doc.data(),
            })) as AlertEntry[];
            data.sort((a, b) => {
              const tA = a.timestamp?.seconds || 0;
              const tB = b.timestamp?.seconds || 0;
              return tB - tA;
            });
            setAlerts(data);
          },
          () => {}
        );

        const requestsQuery = query(collection(db, "requests"), where("userId", "==", activeChildId));
        unsubRequests = onSnapshot(
          requestsQuery,
          (snapshot) => {
            const data = snapshot.docs.map((doc) => ({
              id: doc.id,
              ...doc.data(),
            })) as AccessRequest[];
            data.sort((a, b) => {
              const tA = a.timestamp?.seconds || 0;
              const tB = b.timestamp?.seconds || 0;
              return tB - tA;
            });
            setRequests(data);
          },
          () => {}
        );
      } catch (err) {
        console.error("Firestore Listeners Error:", err);
        setIsLoading(false);
      }
    } else {
      setLogs([]);
      setAlerts([]);
      setRequests([]);
      setIsLoading(false);
    }

    return () => {
      unsubLogs();
      unsubAlerts();
      unsubRequests();
    };
  }, [activeChildId]);

  // ── Stats ──
  const stats = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const parseDate = (ts: any): Date | null => {
      if (!ts) return null;
      if (ts.toDate) return ts.toDate();
      if (typeof ts === "string") return new Date(ts);
      return null;
    };

    const todayLogs = logs.filter((l) => {
      const d = parseDate(l.timestamp);
      return d && d >= today;
    });
    const todayAlerts = alerts.filter((a) => {
      const d = parseDate(a.timestamp);
      return d && d >= today;
    });
    const pendingRequests = requests.filter((r) => r.status === "PENDING");

    // Count frequencies and categorize
    const domainCounts: Record<string, number> = {};
    let totalCategorized = 0;
    const categoryCounts = {
      Games: 0,
      Entertainment: 0,
      Education: 0,
      Social: 0,
      Other: 0
    };

    // Simple categorized mapping
    const categoryMap: Record<string, keyof typeof categoryCounts> = {
      "roblox.com": "Games",
      "minecraft.net": "Games",
      "miniclip.com": "Games",
      "youtube.com": "Entertainment",
      "netflix.com": "Entertainment",
      "tiktok.com": "Entertainment",
      "twitch.tv": "Entertainment",
      "wikipedia.org": "Education",
      "khanacademy.org": "Education",
      "quizlet.com": "Education",
      "instagram.com": "Social",
      "facebook.com": "Social",
      "twitter.com": "Social",
      "reddit.com": "Social",
      "discord.com": "Social",
    };

    todayLogs.forEach((l) => {
      let domain = l.url;
      try {
        domain = new URL(l.url).hostname.replace("www.", "");
      } catch {}
      
      domainCounts[domain] = (domainCounts[domain] || 0) + 1;
      
      // Attempt categorization
      const category = categoryMap[domain] || "Other";
      categoryCounts[category]++;
      totalCategorized++;
    });

    const uniqueDomains = new Set(Object.keys(domainCounts));

    // Sort to get top 5
    const topWebsites = Object.entries(domainCounts)
      .map(([domain, visits]) => ({ domain, visits }))
      .sort((a, b) => b.visits - a.visits)
      .slice(0, 5);

    // Calculate percentages for donut chart
    const categoryData = totalCategorized === 0 ? [] : [
      { label: "Games", pct: Math.round((categoryCounts.Games / totalCategorized) * 100), color: "bg-violet-400", stroke: "#a78bfa" },
      { label: "Entertainment", pct: Math.round((categoryCounts.Entertainment / totalCategorized) * 100), color: "bg-pink-400", stroke: "#f472b6" },
      { label: "Education", pct: Math.round((categoryCounts.Education / totalCategorized) * 100), color: "bg-blue-400", stroke: "#60a5fa" },
      { label: "Social", pct: Math.round((categoryCounts.Social / totalCategorized) * 100), color: "bg-orange-400", stroke: "#fb923c" },
      { label: "Other", pct: Math.round((categoryCounts.Other / totalCategorized) * 100), color: "bg-gray-400", stroke: "#9ca3af" },
    ].filter(c => c.pct > 0).sort((a, b) => b.pct - a.pct);

    return {
      totalVisits: todayLogs.length,
      blockedAttempts: todayAlerts.length,
      uniqueDomains: uniqueDomains.size,
      pendingRequests: pendingRequests.length,
      topWebsites,
      categoryData,
      totalCategorized
    };
  }, [logs, alerts, requests]);

  // ── Modals Handlers ──
  const handleAddChild = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !newChildName.trim() || isAddingChild) return;
    
    setIsAddingChild(true);
    const childData = {
      name: newChildName.trim(),
      age: newChildAge.trim(),
      devicePaired: false,
      createdAt: new Date()
    };

    // Optimistically close modal and reset form
    setShowAddChild(false);
    setNewChildName("");
    setNewChildAge("");

    try {
      await addDoc(collection(db, `parents/${user.uid}/children`), childData);
    } catch (err) {
      console.error("Failed to add child", err);
      alert("Failed to sync profile. Check your connection.");
    } finally {
      setIsAddingChild(false);
    }
  };

  const handleDeleteChild = async (childId: string) => {
    if (!user) return;
    try {
      await deleteDoc(doc(db, `parents/${user.uid}/children`, childId));
      if (activeChildId === childId) setActiveChildId(null);
    } catch (err) {
      console.error("Failed to delete child", err);
    }
  };

  const handlePairDevice = async (e?: React.FormEvent | React.MouseEvent) => {
    if (e && 'preventDefault' in e) (e as any).preventDefault();
    if (!user || !pairingChildId || !pairingCode.trim() || isPairing) return;
    setPairingError("");
    setIsPairing(true);
    
    try {
      let formattedCode = pairingCode.trim();
      if (formattedCode.length === 6 && !formattedCode.includes('-')) {
        formattedCode = `${formattedCode.slice(0, 3)}-${formattedCode.slice(3)}`;
      }

      const codeRef = doc(db, "pairing_codes", formattedCode);
      
      const timeoutPromise = new Promise((_, reject) => 
        setTimeout(() => reject(new Error("Timeout")), 10000)
      );

      const writePromise = Promise.all([
        setDoc(doc(db, `parents/${user.uid}/children`, pairingChildId), { devicePaired: true }, { merge: true }),
        setDoc(codeRef, { status: "paired", childId: pairingChildId, parentId: user.uid }, { merge: true })
      ]);

      await Promise.race([writePromise, timeoutPromise]);

      setShowPairModal(false);
      setPairingCode("");
    } catch (err: any) {
      console.error("Failed to pair", err);
      if (err.message === "Timeout") {
        setPairingError("Connection timed out. Please check your network.");
      } else {
        setPairingError("Invalid pairing code or code expired.");
      }
    } finally {
      setIsPairing(false);
    }
  };

  const handleQRScan = (text: string) => {
    try {
      const url = new URL(text);
      const code = url.searchParams.get("code");
      if (code) {
        setPairingCode(code);
        setTimeout(() => handlePairDevice(), 100);
      } else {
        setPairingError("Invalid Diamond QR Code format.");
      }
    } catch {
      if (text.length === 6) {
        setPairingCode(text);
        setTimeout(() => handlePairDevice(), 100);
      } else {
        setPairingError("Unrecognized QR Code.");
      }
    }
  };

  // ── Request Handlers ──
  const handleApproveRequest = async (requestId: string) => {
    setRequests((prev) => prev.map((r) => (r.id === requestId ? { ...r, status: "APPROVED" } : r)));
    fetch("/api/requests", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: requestId, status: "APPROVED" }),
    }).catch(() => {});

    try {
      await updateDoc(doc(db, "requests", requestId), { status: "APPROVED" });
    } catch {}
  };

  const handleDenyRequest = async (requestId: string) => {
    setRequests((prev) => prev.map((r) => (r.id === requestId ? { ...r, status: "DENIED" } : r)));
    fetch("/api/requests", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: requestId, status: "DENIED" }),
    }).catch(() => {});

    try {
      await updateDoc(doc(db, "requests", requestId), { status: "DENIED" });
    } catch {}
  };

  const handleDeleteAlert = async (alertId: string) => {
    setAlerts((prev) => prev.filter((a) => a.id !== alertId));
    fetch(`/api/alerts?id=${encodeURIComponent(alertId)}`, { method: "DELETE" }).catch(() => {});
    try {
      await deleteDoc(doc(db, "alerts", alertId));
    } catch {}
  };

  // ── Render ──
  if (authLoading || !user) {
    return (
      <div className="flex h-screen items-center justify-center bg-dash-bg">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500"></div>
      </div>
    );
  }

  // ── Dashboard Tab Content ──
  const renderDashboardTab = () => (
    <div className="space-y-8">
      {/* Dashboard Stat Cards */}
      <div className="grid grid-cols-4 gap-5">
        {[
          { label: "Total Visits", value: String(stats.totalVisits), change: "", changeColor: "", barColors: "from-blue-500 to-blue-400" },
          { label: "Unique Websites", value: String(stats.uniqueDomains), sub: "Today", barColors: "from-rose-500 to-pink-400" },
          { label: "Blocked Attempts", value: String(stats.blockedAttempts), change: "", changeColor: "", barColors: "from-indigo-500 to-violet-400" },
          { label: "Pending Requests", value: String(stats.pendingRequests), change: "", changeColor: "", barColors: "from-amber-500 to-orange-400" },
        ].map((card, i) => (
          <div key={i} className="bg-dash-card rounded-2xl p-6 border border-dash-border relative overflow-hidden">
            <div className={`absolute top-0 right-4 w-1.5 h-12 rounded-b-full bg-gradient-to-b ${card.barColors} opacity-80`}></div>
            <p className="text-[11px] font-bold text-dash-text-muted uppercase tracking-wider mb-2">{card.label}</p>
            <p className="text-3xl font-extrabold text-dash-text tracking-tight">{card.value}</p>
            {card.change && <p className={`text-[11px] font-bold mt-1 ${card.changeColor}`}>{card.change}</p>}
            {card.sub && <p className="text-[11px] text-dash-text-faded mt-1">{card.sub}</p>}
          </div>
        ))}
      </div>

      {/* Bottom Row: Top Visited Websites + Time Distribution */}
      <div className="grid grid-cols-2 gap-5">
        {/* Top Visited Websites */}
        <div className="bg-dash-card rounded-2xl p-6 border border-dash-border">
          <h3 className="text-[15px] font-bold text-dash-text mb-6">Top Visited Websites</h3>
          {stats.topWebsites.length === 0 ? (
            <div className="flex items-center justify-center h-32 text-[13px] text-dash-text-faded">No data yet</div>
          ) : (
            <div className="space-y-4">
              {stats.topWebsites.map((site, i) => (
                <div key={site.domain} className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-6 h-6 rounded bg-dash-card-hover border border-dash-border-light flex items-center justify-center text-[10px] font-bold text-dash-text-muted">
                      {i + 1}
                    </div>
                    <span className="text-[13px] font-medium text-dash-text truncate max-w-[150px]">{site.domain}</span>
                  </div>
                  <span className="text-[12px] font-bold text-dash-text-muted">{site.visits} visits</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Category Distribution */}
        <div className="bg-dash-card rounded-2xl p-6 border border-dash-border">
          <h3 className="text-[15px] font-bold text-dash-text mb-6">Category Distribution</h3>
          {stats.categoryData.length === 0 ? (
            <div className="flex items-center justify-center h-32 text-[13px] text-dash-text-faded">No data yet</div>
          ) : (
            <div className="flex items-center gap-10">
              {/* Donut Chart */}
              <div className="relative w-[130px] h-[130px] shrink-0">
                <svg viewBox="0 0 36 36" className="w-full h-full -rotate-90">
                  <circle cx="18" cy="18" r="14" fill="none" stroke="#2a2e37" strokeWidth="3.5" />
                  {(() => {
                    let offset = 0;
                    return stats.categoryData.map((cat, i) => {
                      const dashArray = (cat.pct / 100) * 88;
                      const currentOffset = offset;
                      offset -= dashArray;
                      return (
                        <circle 
                          key={cat.label}
                          cx="18" cy="18" r="14" fill="none" stroke={cat.stroke} strokeWidth="3.5" 
                          strokeDasharray={`${dashArray} 88`} strokeDashoffset={currentOffset} strokeLinecap="round" 
                        />
                      );
                    });
                  })()}
                </svg>
                <div className="absolute inset-0 flex flex-col items-center justify-center">
                  <span className="text-2xl font-extrabold text-dash-text">{stats.totalCategorized}</span>
                  <span className="text-[9px] font-bold text-dash-text-faded uppercase tracking-widest">Visits</span>
                </div>
              </div>
              {/* Legend */}
              <div className="space-y-3.5 flex-1">
                {stats.categoryData.map((item) => (
                  <div key={item.label} className="flex items-center justify-between">
                    <div className="flex items-center gap-2.5">
                      <div className={`w-2.5 h-2.5 rounded-full ${item.color}`}></div>
                      <span className="text-[13px] text-dash-text-muted font-medium">{item.label}</span>
                    </div>
                    <span className="text-[13px] font-bold text-dash-text">{item.pct}%</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );

  // ── Usage Activity Tab Content ──
  const renderUsageActivityTab = () => (
    <div className="bg-dash-card rounded-2xl border border-dash-border overflow-hidden">
      <div className="px-6 py-5 border-b border-dash-border">
        <h3 className="text-[15px] font-bold text-dash-text">Activity Logs</h3>
      </div>
      {/* Table Header */}
      <div className="grid grid-cols-7 gap-4 px-6 py-3 text-[11px] font-bold text-dash-text-faded uppercase tracking-wider border-b border-dash-border">
        <span>Time</span>
        <span>Child</span>
        <span>Device</span>
        <span className="col-span-2">Websites/App</span>
        <span>Category</span>
        <span>Action</span>
      </div>
      {/* Table Body */}
      {logs.length === 0 ? (
        <div className="flex items-center justify-center h-48 text-[13px] text-dash-text-faded">No activity logs yet</div>
      ) : (
        <div className="divide-y divide-[#1e222b]">
          {logs.map((log) => {
            let domain = log.url;
            try { domain = new URL(log.url).hostname.replace("www.", ""); } catch {}
            return (
              <div key={log.id} className="grid grid-cols-7 gap-4 px-6 py-3.5 text-[13px] hover:bg-dash-card-hover transition-colors">
                <span className="text-dash-text-muted tabular-nums">{log.timestamp?.toDate ? log.timestamp.toDate().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '—'}</span>
                <span className="text-dash-text font-medium">{childrenProfiles.find(c => c.id === activeChildId)?.name || '—'}</span>
                <span className="text-dash-text-muted">Browser</span>
                <span className="col-span-2 text-dash-text truncate">{domain}</span>
                <span className="text-dash-text-muted">Web</span>
                <span className={`font-medium ${log.safe ? 'text-emerald-400' : 'text-rose-400'}`}>{log.safe ? 'Allowed' : 'Blocked'}</span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );

  return (
    <div className="flex h-screen overflow-hidden bg-dash-bg">
      {/* Mobile Sidebar Overlay */}
      {isMobileMenuOpen && (
        <div 
          className="md:hidden fixed inset-0 bg-black/60 z-40 backdrop-blur-sm" 
          onClick={() => setIsMobileMenuOpen(false)} 
        />
      )}
      
      {/* Sidebar */}
      <div className={`
        fixed inset-y-0 left-0 z-50 flex flex-col w-[220px] shrink-0
        transform transition-transform duration-300 ease-in-out md:relative md:translate-x-0
        ${isMobileMenuOpen ? "translate-x-0" : "-translate-x-full"}
      `}>
        <Sidebar 
          activeTab={activeTab} 
          onTabChange={(tab: TabKey) => { setActiveTab(tab); setIsMobileMenuOpen(false); }} 
          pendingRequests={stats.pendingRequests} 
          childrenProfiles={childrenProfiles}
          activeChildId={activeChildId}
          onSelectChild={(id) => { setActiveChildId(id); setIsMobileMenuOpen(false); }}
          onAddChild={() => { setShowAddChild(true); setIsMobileMenuOpen(false); }}
          onDeleteChild={handleDeleteChild}
          onPairDevice={(id) => {
            setPairingChildId(id);
            setShowPairModal(true);
            setIsMobileMenuOpen(false);
          }}
        />
      </div>

      {/* Main Content */}
      <div className="flex-1 flex flex-col h-full bg-dash-bg overflow-hidden">
        {activeChildId ? (
          <>
            {/* Top Header — KIDSGUARD layout */}
            <header className="h-[80px] border-b border-dash-border shrink-0 flex items-center justify-between px-10">
              <div className="flex items-center gap-4">
                <div className="w-[42px] h-[42px] rounded-full bg-dash-card-hover flex items-center justify-center border border-dash-border-light overflow-hidden">
                  <svg className="w-6 h-6 text-indigo-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M5.121 17.804A13.937 13.937 0 0112 16c2.5 0 4.847.655 6.879 1.804M15 10a3 3 0 11-6 0 3 3 0 016 0zm6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </div>
                <div className="flex flex-col justify-center">
                  <p className="text-[10px] font-bold text-dash-text-faded uppercase tracking-widest mb-0.5">Dashboard Overview</p>
                  <h2 className="text-[22px] font-bold text-dash-text tracking-tight leading-none">
                    Hello, {user?.email ? user.email.split('@')[0] : "Parent"} 👋
                  </h2>
                </div>
              </div>
              
              <div className="flex items-center gap-4">
                <div className="relative">
                  <svg className="absolute left-3.5 top-1/2 -translate-y-1/2 w-[15px] h-[15px] text-dash-text-faded" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                     <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                  </svg>
                  <input type="text" placeholder="Search..." className="w-44 bg-dash-card border border-dash-border-light rounded-full py-2 pl-10 pr-4 text-[13px] text-dash-text placeholder-dash-text-faded focus:outline-none focus:border-indigo-500 transition-colors" />
                </div>
                
                <div className="flex items-center gap-2 bg-dash-card border border-dash-border-light rounded-full px-4 py-2 cursor-pointer hover:bg-dash-card-hover transition-colors">
                  <svg className="w-[15px] h-[15px] text-dash-text-faded" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                  </svg>
                  <span className="text-[13px] font-bold text-dash-text-muted">May 14 - 20, 2024</span>
                </div>
                
                <button className="w-10 h-10 rounded-full bg-dash-card border border-dash-border-light flex items-center justify-center text-dash-text-muted hover:text-dash-text transition-colors">
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
                  </svg>
                </button>
              </div>
            </header>

            {/* Main Content Area */}
            <main className="flex-1 overflow-y-auto p-10 custom-scrollbar">
              {activeTab === "dashboard" && renderDashboardTab()}
              
              {activeTab === "usage_activity" && renderUsageActivityTab()}
              
              {activeTab === "controls" && <PolicyControls />}
              
              {activeTab === "screen_time" && (
                <div className="bg-dash-card rounded-2xl p-8 border border-dash-border">
                  <h3 className="text-[15px] font-bold text-dash-text mb-4">Screen Time</h3>
                  <p className="text-[13px] text-dash-text-faded">Screen time controls coming soon.</p>
                </div>
              )}
              
              {activeTab === "reports" && (
                <div className="space-y-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <h2 className="text-[18px] font-bold text-dash-text tracking-tight">Security Reports & Requests</h2>
                      <p className="text-[13px] text-dash-text-faded mt-1">Review blocked activity and manage access requests for {childrenProfiles.find(c => c.id === activeChildId)?.name || 'your child'}.</p>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-5">
                    <AlertsFeed alerts={alerts} onDelete={handleDeleteAlert} />
                    <AccessRequests requests={requests} onApprove={handleApproveRequest} onDeny={handleDenyRequest} />
                  </div>
                </div>
              )}
              
              {activeTab === "settings" && (
                <div className="space-y-6 max-w-3xl">
                  <div>
                    <h2 className="text-[18px] font-bold text-dash-text tracking-tight">Settings</h2>
                    <p className="text-[13px] text-dash-text-faded mt-1">Manage your account and application preferences.</p>
                  </div>
                  
                  <div className="bg-dash-sidebar rounded-2xl border border-dash-border overflow-hidden">
                    <div className="p-6 border-b border-dash-border">
                      <h3 className="text-[14px] font-bold text-dash-text mb-4">Account Details</h3>
                      <div className="flex items-center justify-between p-4 bg-dash-card rounded-xl border border-dash-border-light">
                        <div className="flex items-center gap-4">
                          <div className="w-10 h-10 rounded-full bg-indigo-500/20 flex items-center justify-center text-indigo-400 font-bold text-lg">
                            {user.email ? user.email.charAt(0).toUpperCase() : 'U'}
                          </div>
                          <div>
                            <p className="text-[13px] font-bold text-dash-text">Email Address</p>
                            <p className="text-[12px] text-dash-text-muted mt-0.5">{user.email || "No email available"}</p>
                          </div>
                        </div>
                        <div className="px-3 py-1 bg-emerald-500/10 text-emerald-500 text-[11px] font-bold rounded-full border border-emerald-500/20">
                          Verified
                        </div>
                      </div>
                    </div>
                    
                    <div className="p-6 border-b border-dash-border">
                      <div className="flex items-center justify-between mb-4">
                        <div>
                          <h3 className="text-[14px] font-bold text-dash-text">Appearance</h3>
                          <p className="text-[12px] text-dash-text-faded mt-1">Customize how Diamond Dashboard looks on your device.</p>
                        </div>
                      </div>
                      
                      <div className="grid grid-cols-2 gap-4">
                        <button 
                          onClick={() => setTheme('dark')}
                          className={`flex flex-col items-center gap-3 p-4 rounded-xl border-2 transition-all relative overflow-hidden group ${
                            theme === 'dark' ? 'border-indigo-500 bg-dash-card' : 'border-dash-border bg-dash-card hover:border-dash-border-light'
                          }`}
                        >
                          <div className="w-full h-16 bg-[#0d1117] rounded-lg border border-[#2a2e37] relative flex items-center p-2 gap-2">
                            <div className="w-4 h-full bg-[#111318] rounded border border-[#2a2e37]"></div>
                            <div className="flex-1 flex flex-col gap-1.5">
                              <div className="w-1/2 h-2 bg-[#1a1d24] rounded-full"></div>
                              <div className="w-3/4 h-2 bg-[#1a1d24] rounded-full"></div>
                            </div>
                          </div>
                          <span className={`text-[13px] font-bold ${theme === 'dark' ? 'text-dash-text' : 'text-dash-text-muted'}`}>Dark Mode</span>
                          {theme === 'dark' && (
                            <div className="absolute top-2 right-2 w-4 h-4 bg-indigo-500 rounded-full flex items-center justify-center">
                              <svg className="w-2.5 h-2.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                              </svg>
                            </div>
                          )}
                        </button>
                        
                        <button 
                          onClick={() => setTheme('light')}
                          className={`flex flex-col items-center gap-3 p-4 rounded-xl border-2 transition-all relative overflow-hidden group ${
                            theme === 'light' ? 'border-indigo-500 bg-dash-card' : 'border-dash-border bg-dash-card hover:border-dash-border-light'
                          }`}
                        >
                          <div className="w-full h-16 bg-white rounded-lg border border-gray-200 relative flex items-center p-2 gap-2">
                            <div className="w-4 h-full bg-gray-100 rounded border border-gray-200"></div>
                            <div className="flex-1 flex flex-col gap-1.5">
                              <div className="w-1/2 h-2 bg-gray-200 rounded-full"></div>
                              <div className="w-3/4 h-2 bg-gray-200 rounded-full"></div>
                            </div>
                          </div>
                          <span className={`text-[13px] font-bold ${theme === 'light' ? 'text-dash-text' : 'text-dash-text-muted'}`}>Light Mode</span>
                          {theme === 'light' && (
                            <div className="absolute top-2 right-2 w-4 h-4 bg-indigo-500 rounded-full flex items-center justify-center">
                              <svg className="w-2.5 h-2.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                              </svg>
                            </div>
                          )}
                        </button>
                      </div>
                    </div>
                    
                    <div className="p-6">
                      <button 
                        onClick={signOut}
                        className="flex items-center gap-3 px-5 py-3 w-full justify-center bg-rose-500/10 border border-rose-500/20 rounded-xl text-rose-500 hover:bg-rose-500/20 transition-colors text-[13px] font-bold"
                      >
                        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                        </svg>
                        Sign out
                      </button>
                    </div>
                  </div>
                </div>
              )}
              
              {activeTab === "help" && (
                <div className="bg-dash-card rounded-2xl p-8 border border-dash-border">
                  <h3 className="text-[15px] font-bold text-dash-text mb-4">Help & Support</h3>
                  <p className="text-[13px] text-dash-text-faded">Need help? Contact support at support@diamond-browser.com</p>
                </div>
              )}
            </main>
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center p-4">
            <div className="text-center w-full relative">
              <button 
                onClick={() => setIsMobileMenuOpen(true)}
                className="absolute top-0 left-0 md:hidden p-2 text-gray-400 hover:text-dash-text bg-dash-card rounded-lg"
              >
                <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                </svg>
              </button>
              
              <div className="w-16 h-16 bg-blue-500/10 rounded-full flex items-center justify-center mx-auto mb-4 mt-10 md:mt-0">
                <svg className="w-8 h-8 text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                </svg>
              </div>
              <h2 className="text-xl font-bold text-dash-text mb-2">Welcome to Diamond</h2>
              <p className="text-gray-400 mb-6 max-w-sm">
                Get started by creating a Child Profile. You can then pair their browser to manage their safety settings.
              </p>
              <button
                onClick={() => setShowAddChild(true)}
                className="px-6 py-3 bg-blue-600 hover:bg-blue-700 text-dash-text font-medium rounded-xl transition-colors shadow-lg shadow-blue-500/20"
              >
                Create Child Profile
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Modals */}
      {showAddChild && (
        <AddChildModal 
          onClose={() => setShowAddChild(false)}
          onSubmit={handleAddChild}
          isAddingChild={isAddingChild}
          newChildName={newChildName}
          setNewChildName={setNewChildName}
          newChildAge={newChildAge}
          setNewChildAge={setNewChildAge}
        />
      )}

      {showPairModal && (
        <PairDeviceModal 
          onClose={() => setShowPairModal(false)}
          onPair={handlePairDevice}
          isPairing={isPairing}
          pairingError={pairingError}
          setPairingError={setPairingError}
          pairingCode={pairingCode}
          setPairingCode={setPairingCode}
          isScanMode={isScanMode}
          setIsScanMode={setIsScanMode}
          handleQRScan={handleQRScan}
        />
      )}
    </div>
  );
}

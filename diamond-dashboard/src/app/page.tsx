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
  getDoc,
  getDocs,
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
import PinSetupModal from "@/components/PinSetupModal";
import PinChallengeModal from "@/components/PinChallengeModal";
import { useAuth } from "@/context/AuthContext";
import { useRouter } from "next/navigation";

const guessCategory = (url: string): string => {
  const u = url.toLowerCase();
  if (u.includes('youtube') || u.includes('netflix') || u.includes('spotify') || u.includes('primevideo') || u.includes('hotstar')) return 'Entertainment';
  if (u.includes('roblox') || u.includes('minecraft') || u.includes('miniclip') || u.includes('chess.com') || u.includes('poki')) return 'Gaming';
  if (u.includes('github') || u.includes('stackoverflow') || u.includes('wikipedia') || u.includes('khanacademy') || u.includes('coursera')) return 'Education';
  if (u.includes('instagram') || u.includes('facebook') || u.includes('twitter') || u.includes('reddit') || u.includes('discord') || u.includes('whatsapp')) return 'Social Media';
  if (u.includes('google.com/search') || u.includes('bing.com/search') || u.includes('duckduckgo.com')) return 'Search Engine';
  return 'Web';
};

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

export interface AllowedSite {
  url: string;
  expiry: number | null;
  addedAt: number;
}

export interface ScreenTimeData {
  id: string;
  childId: string;
  date: string;
  domains: Record<string, number>;
  totalTimeMs: number;
  lastUpdated: number;
}

// ─── Dashboard Page ─────────────────────────────────────────────

import { type ChildProfile } from "@/components/Sidebar";

type TabKey = "dashboard" | "usage_activity" | "controls" | "screen_time" | "reports" | "settings" | "help";

export default function Dashboard() {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [alerts, setAlerts] = useState<AlertEntry[]>([]);
  const [requests, setRequests] = useState<AccessRequest[]>([]);
  const [allowedSites, setAllowedSites] = useState<AllowedSite[]>([]);
  const [screenTimeData, setScreenTimeData] = useState<ScreenTimeData | null>(null);
  
  // Dashboard UI states
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
  
  // PIN Auth states
  const [hasPin, setHasPin] = useState<boolean | null>(null);
  const [showPinChallenge, setShowPinChallenge] = useState(false);
  const [pinChallengeAction, setPinChallengeAction] = useState<(() => void) | null>(null);

  const triggerAuth = (action: () => void) => {
    setPinChallengeAction(() => action);
    setShowPinChallenge(true);
  };

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
    
    const fetchPin = async () => {
      try {
        const parentDoc = await getDoc(doc(db, "parents", user.uid));
        if (parentDoc.exists()) {
          setHasPin(!!parentDoc.data().pin);
        } else {
          setHasPin(false);
        }
      } catch (e) {
        console.error("Error fetching PIN:", e);
      }
    };
    fetchPin();

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
    let unsubPolicy = () => {};
    let unsubScreenTime = () => {};

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

        const policyRef = doc(db, "policies", activeChildId);
        unsubPolicy = onSnapshot(
          policyRef,
          (docSnap) => {
            if (docSnap.exists()) {
              const data = docSnap.data();
              const allowed: AllowedSite[] = (data.customAllowedDomains || []).map((item: any) => {
                if (typeof item === 'string') return { url: item, expiry: null, addedAt: Date.now() };
                return item;
              });
              setAllowedSites(allowed);
            }
          },
          () => {}
        );

        const dateStr = new Date().toLocaleDateString('en-CA');
        const screenTimeRef = doc(db, "screen_time", `${activeChildId}_${dateStr}`);
        unsubScreenTime = onSnapshot(
          screenTimeRef, 
          (docSnap) => {
            if (docSnap.exists()) {
              setScreenTimeData({ id: docSnap.id, ...docSnap.data() } as ScreenTimeData);
            } else {
              setScreenTimeData(null);
            }
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
      setScreenTimeData(null);
      setIsLoading(false);
    }

    return () => {
      unsubLogs();
      unsubAlerts();
      unsubRequests();
      unsubPolicy();
      unsubScreenTime();
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
        setDoc(codeRef, { status: "paired", childId: pairingChildId, parentId: user.uid }, { merge: true }),
        // Also reset the policy to ensure the browser knows it's linked again
        fetch('/api/policy', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ childId: pairingChildId, isLinked: true })
        })
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
  const handleApproveRequest = async (requestId: string, url: string, durationMs: number | null) => {
    setRequests((prev) => prev.map((r) => (r.id === requestId ? { ...r, status: "APPROVED" } : r)));
    try {
      await updateDoc(doc(db, "requests", requestId), { status: "APPROVED" });
      
      if (!activeChildId) return;
      const policyRef = doc(db, "policies", activeChildId);
      const docSnap = await getDoc(policyRef);
      if (docSnap.exists()) {
        const data = docSnap.data();
        const allowed: AllowedSite[] = (data.customAllowedDomains || []).map((item: any) => {
          if (typeof item === 'string') return { url: item, expiry: null, addedAt: Date.now() };
          return item;
        });
        
        const existingIndex = allowed.findIndex(a => a.url === url);
        const newExpiry = durationMs ? Date.now() + durationMs : null;
        
        if (existingIndex >= 0) {
          allowed[existingIndex].expiry = newExpiry;
          allowed[existingIndex].addedAt = Date.now();
        } else {
          allowed.push({ url, expiry: newExpiry, addedAt: Date.now() });
        }
        
        await updateDoc(policyRef, { customAllowedDomains: allowed });
      }
    } catch (err) {
      console.error("Failed to approve request", err);
    }
  };

  const handleRevokeAccess = async (url: string) => {
    if (!activeChildId || !db) return;
    try {
      const policyRef = doc(db, "policies", activeChildId);
      const newAllowed = allowedSites.filter(site => site.url !== url);
      await updateDoc(policyRef, { customAllowedDomains: newAllowed });
    } catch (error) {
      console.error("Failed to revoke access:", error);
    }
  };

  const handleClearLogs = () => {
    triggerAuth(async () => {
      if (!activeChildId || !db) return;
      try {
        const q = query(collection(db, "logs"), where("userId", "==", activeChildId));
        const snapshot = await getDocs(q);
        const batch = db ? import("firebase/firestore").then(m => m.writeBatch(db)) : null;
        if (!batch) return;
        const b = await batch;
        snapshot.forEach(doc => b.delete(doc.ref));
        await b.commit();
      } catch (error) {
        console.error("Error clearing logs:", error);
      }
    });
  };



  const handleDeleteAllAlerts = () => {
    triggerAuth(async () => {
      if (!activeChildId || !db) return;
      try {
        const q = query(collection(db, "alerts"), where("userId", "==", activeChildId));
        const snapshot = await getDocs(q);
        const batch = db ? import("firebase/firestore").then(m => m.writeBatch(db)) : null;
        if (!batch) return;
        const b = await batch;
        snapshot.forEach(doc => b.delete(doc.ref));
        await b.commit();
      } catch (error) {
        console.error("Error deleting all alerts:", error);
      }
    });
  };

  const handleClearRequestHistory = () => {
    triggerAuth(async () => {
      if (!activeChildId || !db) return;
      try {
        const q = query(
          collection(db, "requests"), 
          where("userId", "==", activeChildId),
          where("status", "in", ["APPROVED", "DENIED", "EXPIRED"])
        );
        const snapshot = await getDocs(q);
        const batch = db ? import("firebase/firestore").then(m => m.writeBatch(db)) : null;
        if (!batch) return;
        const b = await batch;
        snapshot.forEach(doc => b.delete(doc.ref));
        await b.commit();
      } catch (error) {
        console.error("Error clearing request history:", error);
      }
    });
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

  const handleDeleteAlert = (alertId: string) => {
    triggerAuth(async () => {
      setAlerts((prev) => prev.filter((a) => a.id !== alertId));
      fetch(`/api/alerts?id=${encodeURIComponent(alertId)}`, { method: "DELETE" }).catch(() => {});
      try {
        await deleteDoc(doc(db, "alerts", alertId));
      } catch {}
    });
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
    <div className="space-y-6 md:space-y-8">
      {/* Dashboard Stat Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 md:gap-5">
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
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 md:gap-5">
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
            <div className="flex flex-col sm:flex-row items-center gap-6 sm:gap-10">
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
              <div className="space-y-3.5 w-full sm:flex-1">
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
    <div className="flex flex-col gap-6 h-full">
      {/* Live Access Panel */}
      {allowedSites.length > 0 && (
        <div className="bg-dash-card rounded-2xl border border-dash-border overflow-hidden shrink-0">
          <div className="px-6 py-4 border-b border-dash-border flex justify-between items-center bg-indigo-500/5">
            <div>
              <h3 className="text-[15px] font-bold text-indigo-400">Live Access Granted</h3>
              <p className="text-[12px] text-dash-text-faded mt-0.5">Websites currently unblocked by parent permission.</p>
            </div>
          </div>
          <div className="p-4 flex flex-wrap gap-3">
            {allowedSites.map(site => {
              const isExpired = site.expiry !== null && Date.now() > site.expiry;
              if (isExpired) return null;
              
              const remainingHours = site.expiry ? Math.max(0, Math.floor((site.expiry - Date.now()) / 3600000)) : null;
              
              return (
                <div key={site.url} className="flex items-center gap-3 bg-surface border border-indigo-500/20 rounded-xl px-4 py-2.5">
                  <img src={`https://www.google.com/s2/favicons?domain=${site.url}&sz=32`} className="w-5 h-5 rounded" alt="" />
                  <div className="flex flex-col min-w-[120px]">
                    <span className="text-[13px] font-bold text-dash-text">{site.url}</span>
                    <span className="text-[10px] text-indigo-400">
                      {site.expiry === null ? 'Forever' : `${remainingHours}h remaining`}
                    </span>
                  </div>
                  <button 
                    onClick={() => handleRevokeAccess(site.url)}
                    className="ml-2 text-[11px] font-bold text-rose-400 hover:bg-rose-400/10 px-2.5 py-1.5 rounded-lg transition-colors border border-rose-400/20"
                  >
                    Revoke
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Activity Logs Table */}
      <div className="bg-dash-card rounded-2xl border border-dash-border overflow-hidden flex flex-col min-h-0 flex-1">
        <div className="px-6 py-5 border-b border-dash-border shrink-0 flex justify-between items-center">
          <h3 className="text-[15px] font-bold text-dash-text">Activity Logs</h3>
          {logs.length > 0 && (
            <button 
              onClick={handleClearLogs}
              className="text-[12px] font-bold text-dash-text-muted hover:text-rose-400 transition-colors flex items-center gap-1.5"
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
              </svg>
              Clear All
            </button>
          )}
        </div>
        <div className="overflow-auto custom-scrollbar flex-1">
          <div className="min-w-[800px]">
            {/* Table Header */}
            <div className="sticky top-0 z-10 bg-dash-card grid grid-cols-6 gap-4 px-6 py-3 text-[11px] font-bold text-dash-text-faded uppercase tracking-wider border-b border-dash-border">
              <span>Time</span>
              <span>Child</span>
              <span className="col-span-2">Websites/App</span>
              <span>Category</span>
              <span>Action</span>
            </div>
            {/* Table Body */}
            {logs.length === 0 ? (
              <div className="flex items-center justify-center h-48 text-[13px] text-dash-text-faded">No activity logs yet</div>
            ) : (
              <div className="divide-y divide-[#1e222b]">
            {logs.filter((log, i, arr) => {
              // Ignore internal/local pages
              if (log.url.includes('localhost') || log.url.includes('127.0.0.1') || log.url.includes('blocked.html') || log.url.startsWith('diamond://')) {
                return false;
              }
              
              // Check if we've seen this exact same URL in a newer log within a 5-minute window
              const currentT = log.timestamp?.seconds || 0;
              for (let j = 0; j < i; j++) {
                 const newerLog = arr[j];
                 if (log.url === newerLog.url) {
                   const newerT = newerLog.timestamp?.seconds || 0;
                   if (Math.abs(newerT - currentT) < 300) {
                     return false; // Found a duplicate URL within 5 minutes, hide this older one
                   }
                 }
              }
              return true;
            }).map((log) => {
              let domain = log.url;
              let displayUrl = domain;
              try { 
                const urlObj = new URL(log.url);
                domain = urlObj.hostname.replace("www.", "");
                displayUrl = domain;
                
                // Parse Google Searches
                if (domain.includes("google.com") && urlObj.pathname === "/search") {
                  const query = urlObj.searchParams.get("q");
                  if (query) {
                    displayUrl = `Search: ${query}`;
                  }
                }
              } catch {}
              
              // Check if currently active/live
              const isLive = allowedSites.some(s => 
                (log.url.includes(s.url) || s.url.includes(domain)) && 
                (s.expiry === null || Date.now() < s.expiry)
              );
              
              // Check if content was blurred on this page (within 10 mins of log)
              const hasBlurredContent = alerts.some(a => {
                if ((a.type !== 'ALLOWED_SITE_FLAG' && a.type !== 'CONTENT_FLAGGED_SILENT') || !a.url.includes(domain)) return false;
                const aTime = a.timestamp?.seconds || (Date.now() / 1000);
                const lTime = log.timestamp?.seconds || (Date.now() / 1000);
                return Math.abs(aTime - lTime) < 600;
              });
              
              const rowColor = (isLive || hasBlurredContent) ? 'bg-yellow-500/5 hover:bg-yellow-500/10' : 'hover:bg-dash-card-hover';
              
              return (
                <div key={log.id} className={`grid grid-cols-6 gap-4 px-6 py-3.5 text-[13px] transition-colors ${rowColor}`}>
                  <span className="text-dash-text-muted tabular-nums flex flex-col justify-center">
                    {log.timestamp?.toDate ? log.timestamp.toDate().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '—'}
                  </span>
                  <span className="text-dash-text font-medium flex items-center">{childrenProfiles.find(c => c.id === activeChildId)?.name || '—'}</span>
                  <span className="col-span-2 text-dash-text truncate flex items-center gap-2">
                    <img src={`https://www.google.com/s2/favicons?domain=${domain}&sz=64`} alt="" className="w-4 h-4 rounded shrink-0" />
                    <a href={log.url} target="_blank" rel="noreferrer" className="hover:text-indigo-400 hover:underline truncate" title={log.url}>{displayUrl}</a>
                    {isLive && (
                      <span className="ml-1 px-1.5 py-0.5 rounded text-[9px] font-bold bg-yellow-500/20 text-yellow-400 border border-yellow-500/30 shrink-0">
                        LIVE
                      </span>
                    )}
                    {hasBlurredContent && (
                      <span className="ml-1 px-1.5 py-0.5 rounded text-[9px] font-bold bg-warning/20 text-warning border border-warning/30 shrink-0 whitespace-nowrap" title="Harmful content was hidden on this page">
                        CONTENT HIDDEN
                      </span>
                    )}
                  </span>
                  <span className="text-dash-text-muted flex items-center">{guessCategory(log.url)}</span>
                  <span className={`font-medium flex items-center ${log.safe ? 'text-emerald-400' : 'text-rose-400'}`}>
                    {log.safe ? 'Allowed' : 'Blocked'}
                  </span>
                </div>
              );
            })}
          </div>
        )}
          </div>
        </div>
      </div>
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
            <header className="h-[80px] border-b border-dash-border shrink-0 flex items-center justify-between px-4 md:px-10">
              <div className="flex items-center gap-3 md:gap-4">
                <button 
                  onClick={() => setIsMobileMenuOpen(true)}
                  className="md:hidden p-2 -ml-2 text-gray-400 hover:text-dash-text bg-dash-card rounded-lg"
                >
                  <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                  </svg>
                </button>
                <div className="w-[42px] h-[42px] hidden sm:flex rounded-full bg-dash-card-hover items-center justify-center border border-dash-border-light overflow-hidden">
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
              
              <div className="flex items-center gap-2 md:gap-4">
                <div className="relative hidden md:block">
                  <svg className="absolute left-3.5 top-1/2 -translate-y-1/2 w-[15px] h-[15px] text-dash-text-faded" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                     <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                  </svg>
                  <input type="text" placeholder="Search..." className="w-44 bg-dash-card border border-dash-border-light rounded-full py-2 pl-10 pr-4 text-[13px] text-dash-text placeholder-dash-text-faded focus:outline-none focus:border-indigo-500 transition-colors" />
                </div>
                
                <div className="hidden md:flex items-center gap-2 bg-dash-card border border-dash-border-light rounded-full px-4 py-2 cursor-pointer hover:bg-dash-card-hover transition-colors">
                  <svg className="w-[15px] h-[15px] text-dash-text-faded" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                  </svg>
                  <span className="text-[13px] font-bold text-dash-text-muted">May 14 - 20, 2024</span>
                </div>
                
                <button className="hidden sm:flex w-10 h-10 rounded-full bg-dash-card border border-dash-border-light items-center justify-center text-dash-text-muted hover:text-dash-text transition-colors">
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
                  </svg>
                </button>
              </div>
            </header>

            {/* Main Content Area */}
            <main className="flex-1 overflow-y-auto p-4 md:p-10 custom-scrollbar">
              {activeTab === "dashboard" && renderDashboardTab()}
              
              {activeTab === "usage_activity" && renderUsageActivityTab()}
              
              {activeTab === "controls" && <PolicyControls childId={activeChildId} triggerAuth={triggerAuth} />}
              
              {activeTab === "screen_time" && (
                <div className="flex flex-col gap-6 h-full">
                  <div className="flex items-center justify-between shrink-0">
                    <div>
                      <h2 className="text-[18px] font-bold text-dash-text tracking-tight">Screen Time</h2>
                      <p className="text-[13px] text-dash-text-faded mt-1">Track daily browsing habits and time spent on websites.</p>
                    </div>
                  </div>
                  
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4 md:gap-5">
                    {/* Total Time Card */}
                    <div className="bg-dash-card rounded-2xl p-6 border border-dash-border flex flex-col justify-center items-center text-center">
                      <p className="text-[11px] font-bold text-dash-text-muted uppercase tracking-wider mb-2">Total Time Today</p>
                      <h3 className="text-4xl font-extrabold text-dash-text tracking-tight">
                        {screenTimeData ? (
                          <>
                            {Math.floor(screenTimeData.totalTimeMs / 3600000)}<span className="text-xl text-dash-text-muted font-bold mx-1">h</span>
                            {Math.floor((screenTimeData.totalTimeMs % 3600000) / 60000)}<span className="text-xl text-dash-text-muted font-bold ml-1">m</span>
                          </>
                        ) : '0h 0m'}
                      </h3>
                    </div>
                    
                    {/* Website Breakdown */}
                    <div className="md:col-span-2 bg-dash-card rounded-2xl p-6 border border-dash-border min-h-[300px]">
                        <h3 className="text-[14px] font-bold text-dash-text mb-4">Website Breakdown</h3>
                        {!screenTimeData || Object.keys(screenTimeData.domains).length === 0 ? (
                          <div className="flex items-center justify-center h-48 text-[13px] text-dash-text-faded">No screen time logged today.</div>
                        ) : (
                          <div className="space-y-5">
                            {Object.entries(screenTimeData.domains)
                              .sort(([, a], [, b]) => b - a)
                              .map(([domain, timeMs]) => {
                                const pct = Math.round((timeMs / screenTimeData.totalTimeMs) * 100);
                                const mins = Math.floor(timeMs / 60000);
                                const hrs = Math.floor(mins / 60);
                                const displayTime = hrs > 0 ? `${hrs}h ${mins % 60}m` : `${mins}m`;
                                
                                return (
                                  <div key={domain} className="space-y-2">
                                    <div className="flex justify-between items-end">
                                      <div className="flex items-center gap-2">
                                          <img src={`https://www.google.com/s2/favicons?domain=${domain}&sz=32`} className="w-5 h-5 rounded" alt="" />
                                          <span className="text-[13px] font-medium text-dash-text">{domain}</span>
                                      </div>
                                      <span className="text-[12px] font-bold text-dash-text-muted">{displayTime}</span>
                                    </div>
                                    <div className="w-full h-2 bg-dash-sidebar rounded-full overflow-hidden">
                                      <div className="h-full bg-indigo-500 rounded-full" style={{ width: `${pct}%` }}></div>
                                    </div>
                                  </div>
                                );
                            })}
                          </div>
                        )}
                    </div>
                  </div>
                </div>
              )}
              
              {activeTab === "reports" && (
                <div className="flex flex-col gap-6 h-full">
                  <div className="flex items-center justify-between shrink-0">
                    <div>
                      <h2 className="text-[18px] font-bold text-dash-text tracking-tight">Security Reports & Requests</h2>
                      <p className="text-[13px] text-dash-text-faded mt-1">Review blocked activity and manage access requests for {childrenProfiles.find(c => c.id === activeChildId)?.name || 'your child'}.</p>
                    </div>
                  </div>
                  <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar pr-2">
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 md:gap-5">
                      <AlertsFeed 
                        alerts={alerts} 
                        onDelete={handleDeleteAlert} 
                        onDeleteAll={handleDeleteAllAlerts}
                      />
                      <AccessRequests 
                        requests={requests} 
                        activeAllowedDomains={allowedSites}
                        alerts={alerts}
                        onApprove={handleApproveRequest} 
                        onDeny={handleDenyRequest}
                        onRevoke={handleRevokeAccess}
                        onClearHistory={handleClearRequestHistory}
                      />
                    </div>
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
                          <h3 className="text-[14px] font-bold text-rose-500">Device Connection</h3>
                          <p className="text-[12px] text-dash-text-faded mt-1">Disconnect the browser to revoke all access and force re-pairing.</p>
                        </div>
                      </div>
                      <div className="flex items-center justify-between bg-rose-500/5 p-4 rounded-xl border border-rose-500/20">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-lg bg-rose-500/10 flex items-center justify-center text-rose-500">
                            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                            </svg>
                          </div>
                          <div>
                            <p className="text-[13px] font-bold text-dash-text">Disconnect Device</p>
                            <p className="text-[12px] text-dash-text-muted mt-0.5">Browser will be locked until re-paired with a new code</p>
                          </div>
                        </div>
                        <button 
                          onClick={() => {
                            if (!activeChildId || !user) return;
                            triggerAuth(async () => {
                              try {
                                // 1. Set isLinked=false in the policy (browser reads this)
                                await fetch('/api/policy', {
                                  method: 'POST',
                                  headers: { 'Content-Type': 'application/json' },
                                  body: JSON.stringify({ childId: activeChildId, isLinked: false })
                                });
                                // 2. Mark devicePaired=false in Firestore child profile
                                await setDoc(
                                  doc(db, `parents/${user.uid}/children`, activeChildId),
                                  { devicePaired: false },
                                  { merge: true }
                                );
                                alert('Device disconnected. The browser is now locked and will require a fresh 6-digit pairing code to reconnect.');
                              } catch(err) {
                                console.error('Disconnect failed:', err);
                                alert('Failed to disconnect device. Please try again.');
                              }
                            });
                          }}
                          className="px-4 py-2 bg-rose-500/10 text-rose-500 text-[12px] font-bold rounded-lg border border-rose-500/20 hover:bg-rose-500/20 transition-colors"
                        >
                          Disconnect Device
                        </button>
                      </div>
                    </div>

                    <div className="p-6 border-b border-dash-border">
                      <div className="flex items-center justify-between mb-4">
                        <div>
                          <h3 className="text-[14px] font-bold text-dash-text">Appearance</h3>
                          <p className="text-[12px] text-dash-text-faded mt-1">Customize how Diamond Dashboard looks on your device.</p>
                        </div>
                      </div>
                      
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
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
                    
                    <div className="p-6 border-b border-dash-border">
                      <div className="flex items-center justify-between mb-4">
                        <div>
                          <h3 className="text-[14px] font-bold text-dash-text">Security</h3>
                          <p className="text-[12px] text-dash-text-faded mt-1">Manage your parent lock and dashboard access.</p>
                        </div>
                      </div>
                      <div className="flex items-center justify-between bg-dash-card p-4 rounded-xl border border-dash-border-light">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-lg bg-indigo-500/10 flex items-center justify-center text-indigo-400">
                            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                            </svg>
                          </div>
                          <div>
                            <p className="text-[13px] font-bold text-dash-text">Parent PIN</p>
                            <p className="text-[12px] text-dash-text-muted mt-0.5">Used to authenticate settings changes</p>
                          </div>
                        </div>
                        <button 
                          onClick={() => triggerAuth(() => setHasPin(false))}
                          className="px-4 py-2 bg-dash-sidebar text-dash-text text-[12px] font-bold rounded-lg border border-dash-border hover:bg-dash-sidebar-hover transition-colors"
                        >
                          Change PIN
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

      {hasPin === false && user?.uid && (
        <PinSetupModal 
          userId={user.uid} 
          onComplete={() => {
            setHasPin(true);
          }} 
        />
      )}

      {user?.uid && (
        <PinChallengeModal 
          isOpen={showPinChallenge} 
          userId={user.uid}
          onSuccess={() => {
            setShowPinChallenge(false);
            if (pinChallengeAction) pinChallengeAction();
            setPinChallengeAction(null);
          }}
          onCancel={() => {
            setShowPinChallenge(false);
            setPinChallengeAction(null);
          }}
        />
      )}
    </div>
  );
}

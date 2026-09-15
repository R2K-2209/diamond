"use client";

import { useState, useEffect, useMemo } from "react";
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

export default function DashboardPage() {
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

  const [activeTab, setActiveTab] = useState<"activity" | "alerts" | "requests" | "controls">("activity");
  const [isLoading, setIsLoading] = useState(true);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  const { user, loading: authLoading, signOut } = useAuth();
  const router = useRouter();

  // Redirect if unauthenticated
  useEffect(() => {
    if (!authLoading && !user) {
      router.push("/login");
    }
  }, [user, authLoading, router]);

  // ── Data Fetching: Children Profiles ──
  useEffect(() => {
    if (!user) return;
    
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
      // 2. Poll local data periodically for live desktop updates
      // const pollInterval = setInterval(fetchLocalData, 3000); // Disabled for now to prioritize Firestore
    }

    // 3. Real-time Firestore Listeners (scoped by activeChildId)
    let unsubLogs = () => {};
    let unsubAlerts = () => {};
    let unsubRequests = () => {};

    if (activeChildId) {
      try {
        const logsQuery = query(collection(db, "logs"), where("userId", "==", activeChildId), orderBy("timestamp", "desc"), limit(100));
        unsubLogs = onSnapshot(
          logsQuery,
          (snapshot) => {
            const data = snapshot.docs.map((doc) => ({
              id: doc.id,
              ...doc.data(),
            })) as LogEntry[];
            setLogs(data);
            setIsLoading(false);
          },
          () => setIsLoading(false)
        );

        const alertsQuery = query(collection(db, "alerts"), where("userId", "==", activeChildId), orderBy("timestamp", "desc"), limit(50));
        unsubAlerts = onSnapshot(
          alertsQuery,
          (snapshot) => {
            const data = snapshot.docs.map((doc) => ({
              id: doc.id,
              ...doc.data(),
            })) as AlertEntry[];
            setAlerts(data);
          },
          () => {}
        );

        const requestsQuery = query(collection(db, "requests"), where("userId", "==", activeChildId), orderBy("timestamp", "desc"), limit(30));
        unsubRequests = onSnapshot(
          requestsQuery,
          (snapshot) => {
            const data = snapshot.docs.map((doc) => ({
              id: doc.id,
              ...doc.data(),
            })) as AccessRequest[];
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

    // Unique domains visited today
    const uniqueDomains = new Set(
      todayLogs.map((l) => {
        try {
          return new URL(l.url).hostname;
        } catch {
          return l.url;
        }
      })
    );

    return {
      totalVisits: todayLogs.length,
      blockedAttempts: todayAlerts.length,
      uniqueDomains: uniqueDomains.size,
      pendingRequests: pendingRequests.length,
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
    // The QR code contains a URL like: http://192.168.1.5:3000/pair?code=123456
    // We just want to extract the code from the end.
    try {
      const url = new URL(text);
      const code = url.searchParams.get("code");
      if (code) {
        setPairingCode(code);
        // Automatically submit!
        setTimeout(() => handlePairDevice(), 100);
      } else {
        setPairingError("Invalid Diamond QR Code format.");
      }
    } catch {
      // If it's not a URL, maybe it's just the code itself?
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
      <div className="flex h-screen items-center justify-center bg-background">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500"></div>
      </div>
    );
  }

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      {/* Mobile Sidebar Overlay */}
      {isMobileMenuOpen && (
        <div 
          className="md:hidden fixed inset-0 bg-black/60 z-40 backdrop-blur-sm" 
          onClick={() => setIsMobileMenuOpen(false)} 
        />
      )}
      
      {/* Sidebar */}
      <div className={`
        fixed inset-y-0 left-0 z-50 flex flex-col w-64 md:w-72 border-r border-border bg-surface shrink-0
        transform transition-transform duration-300 ease-in-out md:relative md:translate-x-0
        ${isMobileMenuOpen ? "translate-x-0" : "-translate-x-full"}
      `}>
        <div className="flex items-center justify-between p-4 md:hidden border-b border-border">
          <span className="text-white font-bold tracking-widest text-sm">DIAMOND</span>
          <button onClick={() => setIsMobileMenuOpen(false)} className="text-gray-400 hover:text-white">
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <Sidebar 
          activeTab={activeTab} 
          onTabChange={(tab) => { setActiveTab(tab); setIsMobileMenuOpen(false); }} 
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
        
        {/* Sign Out Button in Sidebar Area */}
        <div className="absolute bottom-4 left-4">
          <button 
            onClick={signOut}
            className="flex items-center gap-2 text-sm text-gray-400 hover:text-white transition-colors"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
            </svg>
            Sign Out
          </button>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex flex-col overflow-hidden w-full">
        {activeChildId ? (
          <main className="flex-1 overflow-y-auto p-4 md:p-8">
            <header className="mb-6 md:mb-8 flex justify-between items-start">
              <div className="flex items-center gap-3">
                <button 
                  onClick={() => setIsMobileMenuOpen(true)}
                  className="md:hidden p-2 -ml-2 text-gray-400 hover:text-white bg-surface-2 rounded-lg"
                >
                  <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                  </svg>
                </button>
                <div>
                  <h1 className="text-2xl md:text-3xl font-bold text-text tracking-tight mb-1 md:mb-2">
                    {activeTab === "activity" && "Browsing Activity"}
                    {activeTab === "alerts" && "Security Alerts"}
                    {activeTab === "requests" && "Access Requests"}
                    {activeTab === "controls" && "Policy Controls"}
                  </h1>
                  <p className="hidden md:block text-text-muted text-sm font-medium">
                    {activeTab === "activity" && "Real-time browsing history from Diamond Browser"}
                    {activeTab === "alerts" && "Automated blocks and security interventions"}
                    {activeTab === "requests" && "Manage website access requests from your child"}
                    {activeTab === "controls" && "Configure protection levels and safe websites"}
                  </p>
                </div>
              </div>
              <div className="hidden sm:flex items-center space-x-2 px-3 py-1.5 bg-surface-2 rounded-full border border-border">
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-success opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-success"></span>
                </span>
                <span className="text-xs font-medium text-text-secondary">Live</span>
              </div>
            </header>

            {activeTab !== "controls" && <StatsCards stats={stats} />}

            <div className="mt-8">
              {isLoading ? (
                <div className="flex items-center justify-center h-64">
                  <div className="flex flex-col items-center gap-3">
                    <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin"></div>
                    <span className="text-sm text-text-muted">Connecting to Firebase...</span>
                  </div>
                </div>
              ) : (
                <>
                  {activeTab === "activity" && <ActivityFeed logs={logs} />}
                  {activeTab === "alerts" && <AlertsFeed alerts={alerts} onDelete={handleDeleteAlert} />}
                  {activeTab === "requests" && (
                    <AccessRequests requests={requests} onApprove={handleApproveRequest} onDeny={handleDenyRequest} />
                  )}
                  {activeTab === "controls" && <PolicyControls />}
                </>
              )}
            </div>
          </main>
        ) : (
          <div className="flex-1 flex items-center justify-center p-4">
            <div className="text-center w-full relative">
              <button 
                onClick={() => setIsMobileMenuOpen(true)}
                className="absolute top-0 left-0 md:hidden p-2 text-gray-400 hover:text-white bg-surface-2 rounded-lg"
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
              <h2 className="text-xl font-bold text-white mb-2">Welcome to Diamond</h2>
              <p className="text-gray-400 mb-6 max-w-sm">
                Get started by creating a Child Profile. You can then pair their browser to manage their safety settings.
              </p>
              <button
                onClick={() => setShowAddChild(true)}
                className="px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-xl transition-colors shadow-lg shadow-blue-500/20"
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

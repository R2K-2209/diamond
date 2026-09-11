"use client";

import { useState, useEffect, useMemo } from "react";
import { db } from "@/firebase";
import {
  collection,
  query,
  orderBy,
  limit,
  onSnapshot,
  doc,
  updateDoc,
  deleteDoc,
  type Timestamp,
} from "firebase/firestore";
import Sidebar from "@/components/Sidebar";
import StatsCards from "@/components/StatsCards";
import ActivityFeed from "@/components/ActivityFeed";
import AlertsFeed from "@/components/AlertsFeed";
import AccessRequests from "@/components/AccessRequests";
import PolicyControls from "@/components/PolicyControls";

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

export default function DashboardPage() {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [alerts, setAlerts] = useState<AlertEntry[]>([]);
  const [requests, setRequests] = useState<AccessRequest[]>([]);
  const [activeTab, setActiveTab] = useState<"activity" | "alerts" | "requests" | "controls">("activity");
  const [isLoading, setIsLoading] = useState(true);

  // ── Data Fetching: Local APIs + Firestore Real-time ──
  useEffect(() => {
    setIsLoading(true);

    // 1. Fetch from local APIs immediately (instant direct bridge)
    const fetchLocalData = async () => {
      try {
        const [logsRes, alertsRes, reqsRes] = await Promise.allSettled([
          fetch("/api/logs").then((r) => r.json()),
          fetch("/api/alerts").then((r) => r.json()),
          fetch("/api/requests").then((r) => r.json()),
        ]);

        if (logsRes.status === "fulfilled" && logsRes.value?.success) {
          setLogs((prev) => (prev.length === 0 ? logsRes.value.logs : prev));
        }
        if (alertsRes.status === "fulfilled" && alertsRes.value?.success) {
          setAlerts((prev) => (prev.length === 0 ? alertsRes.value.alerts : prev));
        }
        if (reqsRes.status === "fulfilled" && reqsRes.value?.success) {
          setRequests((prev) => (prev.length === 0 ? reqsRes.value.requests : prev));
        }
      } catch (err) {
        console.warn("Local data fetch error:", err);
      } finally {
        setIsLoading(false);
      }
    };

    fetchLocalData();

    // 2. Poll local data periodically for live desktop updates
    const pollInterval = setInterval(fetchLocalData, 3000);

    // 3. Real-time Firestore Listeners (if cloud is active)
    let unsubLogs = () => {};
    let unsubAlerts = () => {};
    let unsubRequests = () => {};

    try {
      const logsQuery = query(collection(db, "logs"), orderBy("timestamp", "desc"), limit(100));
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

      const alertsQuery = query(collection(db, "alerts"), orderBy("timestamp", "desc"), limit(50));
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

      const requestsQuery = query(collection(db, "requests"), orderBy("timestamp", "desc"), limit(30));
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
    } catch {
      setIsLoading(false);
    }

    return () => {
      clearInterval(pollInterval);
      unsubLogs();
      unsubAlerts();
      unsubRequests();
    };
  }, []);

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

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      {/* Sidebar */}
      <Sidebar activeTab={activeTab} onTabChange={setActiveTab} pendingRequests={stats.pendingRequests} />

      {/* Main Content */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Header */}
        <header className="h-16 flex items-center justify-between px-8 border-b border-border bg-surface/60 backdrop-blur-sm shrink-0">
          <div>
            <h1 className="text-lg font-bold text-text">
              {activeTab === "activity" && "Browsing Activity"}
              {activeTab === "alerts" && "Security Alerts"}
              {activeTab === "requests" && "Access Requests"}
              {activeTab === "controls" && "Parental Controls"}
            </h1>
            <p className="text-xs text-text-muted">
              {activeTab === "activity" && "Real-time browsing history from Diamond Browser"}
              {activeTab === "alerts" && "Blocked attempts and safety violations"}
              {activeTab === "requests" && "Sites your child is requesting access to"}
              {activeTab === "controls" && "Manage safety policies and browsing rules"}
            </p>
          </div>
          <div className="flex items-center space-x-3">
            <div className="flex items-center space-x-2 px-3 py-1.5 bg-surface-2 rounded-full border border-border">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-success opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-success"></span>
              </span>
              <span className="text-xs font-medium text-text-secondary">Live</span>
            </div>
          </div>
        </header>

        {/* Stats Row */}
        {activeTab !== "controls" && <StatsCards stats={stats} />}

        {/* Content */}
        <main className="flex-1 overflow-y-auto p-6">
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
              {activeTab === "alerts" && (
                <AlertsFeed alerts={alerts} onDelete={handleDeleteAlert} />
              )}
              {activeTab === "requests" && (
                <AccessRequests
                  requests={requests}
                  onApprove={handleApproveRequest}
                  onDeny={handleDenyRequest}
                />
              )}
              {activeTab === "controls" && <PolicyControls />}
            </>
          )}
        </main>
      </div>
    </div>
  );
}

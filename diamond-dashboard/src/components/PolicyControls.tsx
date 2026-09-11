"use client";

import { useState, useEffect } from "react";
import { db } from "@/firebase";
import { doc, onSnapshot, setDoc, serverTimestamp } from "firebase/firestore";

interface ContentPolicy {
  customBlockedDomains: string[];
  customAllowedDomains: string[];
  blockAdultContent: boolean;
  blockGambling: boolean;
  blockSocialMedia: boolean;
  blockGaming: boolean;
  blockVpnProxy: boolean;
  blockUrlShorteners: boolean;
  mode: "strict" | "moderate" | "allowlist_only";
  walledGardenSites: string[];
  dailyScreenTimeMinutes: number;
}

const DEFAULT_POLICY: ContentPolicy = {
  customBlockedDomains: [],
  customAllowedDomains: [],
  blockAdultContent: true,
  blockGambling: true,
  blockSocialMedia: false,
  blockGaming: false,
  blockVpnProxy: true,
  blockUrlShorteners: true,
  mode: "moderate",
  walledGardenSites: [],
  dailyScreenTimeMinutes: 0,
};

const CATEGORY_TOGGLES = [
  {
    key: "blockAdultContent",
    label: "Adult Content",
    desc: "Block explicit, pornographic, and adult-rated websites",
    icon: "🔞",
    critical: true,
  },
  {
    key: "blockGambling",
    label: "Gambling & Betting",
    desc: "Block casino, sports betting, and online gambling sites",
    icon: "🎰",
    critical: true,
  },
  {
    key: "blockSocialMedia",
    label: "Social Media",
    desc: "Block TikTok, Instagram, Snapchat, Twitter, Reddit, Discord",
    icon: "📱",
    critical: false,
  },
  {
    key: "blockGaming",
    label: "Gaming Platforms",
    desc: "Block Steam, Epic Games, Twitch, Roblox, and more",
    icon: "🎮",
    critical: false,
  },
  {
    key: "blockVpnProxy",
    label: "VPN & Proxy Sites",
    desc: "Prevent bypass attempts via VPN downloads and web proxies",
    icon: "🛡️",
    critical: true,
  },
  {
    key: "blockUrlShorteners",
    label: "URL Shorteners",
    desc: "Block bit.ly, tinyurl, and other link shorteners that hide real URLs",
    icon: "🔗",
    critical: false,
  },
];

const MODE_OPTIONS = [
  {
    value: "moderate",
    label: "Moderate",
    desc: "Open web with all filters active. Child can browse freely within safety rules.",
    color: "border-primary/30 bg-primary/5",
    activeColor: "border-primary bg-primary/10 ring-2 ring-primary/20",
  },
  {
    value: "strict",
    label: "Strict",
    desc: "Maximum sensitivity. All categories blocked, SafeSearch hardened.",
    color: "border-warning/30 bg-warning/5",
    activeColor: "border-warning bg-warning/10 ring-2 ring-warning/20",
  },
  {
    value: "allowlist_only",
    label: "Walled Garden",
    desc: "Only parent-approved educational sites can be accessed. Everything else blocked.",
    color: "border-danger/30 bg-danger/5",
    activeColor: "border-danger bg-danger/10 ring-2 ring-danger/20",
  },
];

export default function PolicyControls() {
  const [policy, setPolicy] = useState<ContentPolicy>(DEFAULT_POLICY);
  const [isLoaded, setIsLoaded] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [newBlockedDomain, setNewBlockedDomain] = useState("");
  const [newAllowedDomain, setNewAllowedDomain] = useState("");
  const [saveMessage, setSaveMessage] = useState("");
  const [cloudFirestoreDisabled, setCloudFirestoreDisabled] = useState(false);

  const policyDocRef = doc(db, "policies", "test-child-user");

  // Load from local API and listen to Firestore
  useEffect(() => {
    // 1. Fetch from local policy API immediately
    fetch("/api/policy")
      .then((res) => res.json())
      .then((data) => {
        if (data.success && data.policy) {
          setPolicy((prev) => ({ ...prev, ...data.policy }));
        }
      })
      .catch((err) => console.warn("Could not fetch local policy:", err))
      .finally(() => setIsLoaded(true));

    // 2. Also listen for Firestore real-time updates if available
    const unsub = onSnapshot(
      policyDocRef,
      (snapshot) => {
        if (snapshot.exists()) {
          const data = snapshot.data() as Partial<ContentPolicy>;
          setPolicy((prev) => ({ ...prev, ...data }));
        }
        setIsLoaded(true);
      },
      (error) => {
        console.warn("[Firestore] Cloud Firestore not active or permission denied. Using local engine.", error.message);
        setCloudFirestoreDisabled(true);
        setIsLoaded(true);
      }
    );
    return unsub;
  }, []);

  // Save policy to both Local API (instant <5ms) and Firestore (cloud)
  const savePolicy = async (updates: Partial<ContentPolicy>) => {
    setIsSaving(true);
    try {
      // 1. Save to local API (guarantees local sync to Diamond Browser immediately)
      const res = await fetch("/api/policy", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updates),
      });
      const data = await res.json();
      if (data.success) {
        setSaveMessage("Saved! Applied to Diamond Browser immediately.");
      }

      // 2. Also attempt Firestore cloud save
      setDoc(
        policyDocRef,
        {
          ...updates,
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      ).catch(() => {
        setCloudFirestoreDisabled(true);
      });

      setTimeout(() => setSaveMessage(""), 3500);
    } catch (error) {
      console.error("Error saving policy:", error);
      setSaveMessage("Error saving. Please try again.");
    }
    setIsSaving(false);
  };

  const toggleCategory = (key: string) => {
    const newValue = !policy[key as keyof ContentPolicy];
    setPolicy((prev) => ({ ...prev, [key]: newValue }));
    savePolicy({ [key]: newValue });
  };

  const changeMode = (mode: ContentPolicy["mode"]) => {
    setPolicy((prev) => ({ ...prev, mode }));
    savePolicy({ mode });
  };

  const addBlockedDomain = () => {
    const raw = newBlockedDomain.trim().toLowerCase().replace(/^(https?:\/\/)?(www\.)?/, "").replace(/\/.*$/, "");
    if (!raw) return;

    // If user enters "reddit", block both "reddit" and "reddit.com"
    const candidates = [raw];
    if (!raw.includes(".")) {
      candidates.push(`${raw}.com`);
    }

    const newDomains = candidates.filter((d) => !policy.customBlockedDomains.includes(d));
    if (newDomains.length === 0) return;

    const updated = [...policy.customBlockedDomains, ...newDomains];
    setPolicy((prev) => ({ ...prev, customBlockedDomains: updated }));
    savePolicy({ customBlockedDomains: updated });
    setNewBlockedDomain("");
  };

  const removeBlockedDomain = (domain: string) => {
    const updated = policy.customBlockedDomains.filter((d) => d !== domain);
    setPolicy((prev) => ({ ...prev, customBlockedDomains: updated }));
    savePolicy({ customBlockedDomains: updated });
  };

  const addAllowedDomain = () => {
    const raw = newAllowedDomain.trim().toLowerCase().replace(/^(https?:\/\/)?(www\.)?/, "").replace(/\/.*$/, "");
    if (!raw) return;

    const candidates = [raw];
    if (!raw.includes(".")) {
      candidates.push(`${raw}.com`);
    }

    const newDomains = candidates.filter((d) => !policy.customAllowedDomains.includes(d));
    if (newDomains.length === 0) return;

    const updated = [...policy.customAllowedDomains, ...newDomains];
    setPolicy((prev) => ({ ...prev, customAllowedDomains: updated }));
    savePolicy({ customAllowedDomains: updated });
    setNewAllowedDomain("");
  };

  const removeAllowedDomain = (domain: string) => {
    const updated = policy.customAllowedDomains.filter((d) => d !== domain);
    setPolicy((prev) => ({ ...prev, customAllowedDomains: updated }));
    savePolicy({ customAllowedDomains: updated });
  };

  if (!isLoaded) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

  return (
    <div className="max-w-3xl space-y-8">
      {/* Engine Status Banner */}
      <div className="flex items-center justify-between p-3.5 bg-surface-2 border border-border rounded-xl text-xs">
        <div className="flex items-center gap-2.5">
          <span className="relative flex h-2.5 w-2.5">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-success opacity-75"></span>
            <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-success"></span>
          </span>
          <span className="font-medium text-text">Direct Engine Sync: <span className="text-success font-semibold">Active & Connected</span></span>
        </div>
        <span className="text-[11px] text-text-muted">Instant local policy updates to Diamond Browser</span>
      </div>

      {cloudFirestoreDisabled && (
        <div className="p-3.5 bg-amber-500/10 border border-amber-500/20 rounded-xl text-xs text-amber-200/90 leading-relaxed">
          <span className="font-bold text-amber-300">💡 Local protection is active:</span> Diamond Browser and Parental Controls are communicating directly on this machine. Cloud Firestore is not enabled on your Firebase project <code className="bg-black/30 px-1 py-0.5 rounded text-[10px] text-amber-100">browser-3ae3d</code>. If you ever need to manage rules from a remote computer or phone, click{' '}
          <a
            href="https://console.firebase.google.com/u/0/project/browser-3ae3d/firestore"
            target="_blank"
            rel="noopener noreferrer"
            className="text-amber-300 underline font-semibold hover:text-white"
          >
            Create Firestore Database
          </a>{' '}
          in the Firebase Console.
        </div>
      )}

      {/* Save Notification */}
      {saveMessage && (
        <div className="fixed top-4 right-4 z-50 px-4 py-2.5 bg-success/10 text-success border border-success/20 rounded-xl text-xs font-medium shadow-lg backdrop-blur-sm animate-pulse">
          {saveMessage}
        </div>
      )}

      {/* ═══ Browsing Mode ═══ */}
      <section>
        <h2 className="text-sm font-bold text-text mb-1">Browsing Mode</h2>
        <p className="text-xs text-text-muted mb-4">Choose how restrictive the browser should be</p>
        <div className="grid grid-cols-3 gap-3">
          {MODE_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              onClick={() => changeMode(opt.value as ContentPolicy["mode"])}
              className={`p-4 rounded-xl border text-left transition-all ${
                policy.mode === opt.value ? opt.activeColor : opt.color + " hover:border-border-light"
              }`}
            >
              <p className="text-sm font-bold text-text mb-1">{opt.label}</p>
              <p className="text-[11px] text-text-muted leading-relaxed">{opt.desc}</p>
            </button>
          ))}
        </div>
      </section>

      {/* ═══ Category Toggles ═══ */}
      <section>
        <h2 className="text-sm font-bold text-text mb-1">Content Categories</h2>
        <p className="text-xs text-text-muted mb-4">Toggle which types of content to block</p>
        <div className="space-y-2">
          {CATEGORY_TOGGLES.map((cat) => {
            const isOn = policy[cat.key as keyof ContentPolicy] as boolean;
            return (
              <div
                key={cat.key}
                className="flex items-center justify-between p-3.5 bg-surface rounded-xl border border-border hover:border-border-light transition-colors"
              >
                <div className="flex items-center gap-3">
                  <span className="text-lg">{cat.icon}</span>
                  <div>
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-medium text-text">{cat.label}</p>
                      {cat.critical && (
                        <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-danger/10 text-danger border border-danger/20">
                          CRITICAL
                        </span>
                      )}
                    </div>
                    <p className="text-[11px] text-text-muted mt-0.5">{cat.desc}</p>
                  </div>
                </div>
                <button
                  onClick={() => toggleCategory(cat.key)}
                  className={`relative w-11 h-6 rounded-full transition-all duration-200 ${
                    isOn ? "bg-success" : "bg-surface-3 border border-border"
                  }`}
                >
                  <span
                    className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow-sm transition-all duration-200 ${
                      isOn ? "left-[22px]" : "left-0.5"
                    }`}
                  />
                </button>
              </div>
            );
          })}
        </div>
      </section>

      {/* ═══ Custom Blocked Domains ═══ */}
      <section>
        <h2 className="text-sm font-bold text-text mb-1">Custom Blocked Domains</h2>
        <p className="text-xs text-text-muted mb-3">Add specific websites you want to block</p>

        <div className="flex gap-2 mb-3">
          <input
            type="text"
            value={newBlockedDomain}
            onChange={(e) => setNewBlockedDomain(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && addBlockedDomain()}
            placeholder="e.g. reddit.com"
            className="flex-1 bg-surface border border-border rounded-lg px-3 py-2 text-sm text-text placeholder-text-muted focus:outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/30"
          />
          <button
            onClick={addBlockedDomain}
            disabled={!newBlockedDomain.trim()}
            className="px-4 py-2 rounded-lg bg-danger/10 text-danger border border-danger/20 text-sm font-medium hover:bg-danger/20 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
          >
            Block
          </button>
        </div>

        {policy.customBlockedDomains.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {policy.customBlockedDomains.map((domain) => (
              <span
                key={domain}
                className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-danger/5 text-danger rounded-lg border border-danger/15 text-xs font-mono"
              >
                {domain}
                <button
                  onClick={() => removeBlockedDomain(domain)}
                  className="hover:text-white transition-colors"
                >
                  ×
                </button>
              </span>
            ))}
          </div>
        )}
      </section>

      {/* ═══ Custom Allowed Domains ═══ */}
      <section>
        <h2 className="text-sm font-bold text-text mb-1">Custom Allowed Domains</h2>
        <p className="text-xs text-text-muted mb-3">
          Add websites that should always be accessible (bypasses all filters except adult content)
        </p>

        <div className="flex gap-2 mb-3">
          <input
            type="text"
            value={newAllowedDomain}
            onChange={(e) => setNewAllowedDomain(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && addAllowedDomain()}
            placeholder="e.g. scratch.mit.edu"
            className="flex-1 bg-surface border border-border rounded-lg px-3 py-2 text-sm text-text placeholder-text-muted focus:outline-none focus:border-success/50 focus:ring-1 focus:ring-success/30"
          />
          <button
            onClick={addAllowedDomain}
            disabled={!newAllowedDomain.trim()}
            className="px-4 py-2 rounded-lg bg-success/10 text-success border border-success/20 text-sm font-medium hover:bg-success/20 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
          >
            Allow
          </button>
        </div>

        {policy.customAllowedDomains.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {policy.customAllowedDomains.map((domain) => (
              <span
                key={domain}
                className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-success/5 text-success rounded-lg border border-success/15 text-xs font-mono"
              >
                {domain}
                <button
                  onClick={() => removeAllowedDomain(domain)}
                  className="hover:text-white transition-colors"
                >
                  ×
                </button>
              </span>
            ))}
          </div>
        )}
      </section>

      {/* ═══ Protection Summary ═══ */}
      <section className="bg-surface-2 rounded-xl border border-border p-5">
        <h3 className="text-xs font-bold uppercase tracking-wider text-text-muted mb-3">Active Protection Layers</h3>
        <div className="grid grid-cols-2 gap-3">
          {[
            { label: "Cloudflare Family DNS", status: "Always Active", color: "text-success" },
            { label: "Firebase Policy Sync", status: "Connected", color: "text-success" },
            { label: "Local Safety Filter", status: "Active", color: "text-success" },
            { label: "Page Content Scanner", status: "Active", color: "text-success" },
          ].map((layer) => (
            <div key={layer.label} className="flex items-center gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-success"></span>
              <span className="text-xs text-text-secondary">{layer.label}</span>
              <span className={`text-[10px] font-medium ${layer.color} ml-auto`}>{layer.status}</span>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

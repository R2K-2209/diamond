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
    icon: (
      <svg className="w-[18px] h-[18px]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
      </svg>
    ),
    dotColor: "bg-rose-500",
    iconColor: "text-rose-500",
  },
  {
    key: "blockGambling",
    label: "Gambling & Betting",
    desc: "Block casino, sports betting, and online gambling sites",
    icon: (
      <svg className="w-[18px] h-[18px]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    ),
    dotColor: "bg-rose-500",
    iconColor: "text-amber-500",
  },
  {
    key: "blockSocialMedia",
    label: "Social Media",
    desc: "Block TikTok, Instagram, Snapchat, Twitter, Reddit, Discord",
    icon: (
      <svg className="w-[18px] h-[18px]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
      </svg>
    ),
    dotColor: "bg-transparent",
    iconColor: "text-blue-500",
  },
  {
    key: "blockGaming",
    label: "Gaming Platforms",
    desc: "Block Steam, Epic Games, Twitch, Roblox, and more",
    icon: (
      <svg className="w-[18px] h-[18px]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    ),
    dotColor: "bg-transparent",
    iconColor: "text-purple-500",
  },
  {
    key: "blockVpnProxy",
    label: "VPN & Proxy Sites",
    desc: "Prevent bypass attempts via VPN downloads and web proxies",
    icon: (
      <svg className="w-[18px] h-[18px]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
      </svg>
    ),
    dotColor: "bg-rose-500",
    iconColor: "text-emerald-500",
  },
  {
    key: "blockUrlShorteners",
    label: "URL Shorteners",
    desc: "Block bit.ly, tinyurl, and other link shorteners that hide real URLs",
    icon: (
      <svg className="w-[18px] h-[18px]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
      </svg>
    ),
    dotColor: "bg-transparent",
    iconColor: "text-gray-400",
  },
];

const MODE_OPTIONS = [
  {
    value: "moderate",
    label: "Moderate",
    desc: "Open web with all filters active. Child can browse freely within safety rules.",
  },
  {
    value: "strict",
    label: "Strict",
    desc: "Maximum sensitivity. All categories blocked. SafeSearch hardened.",
  },
  {
    value: "allowlist_only",
    label: "Walled Garden",
    desc: "Only parent-approved educational sites can be accessed. Everything else blocked.",
  },
];

export default function PolicyControls() {
  const [policy, setPolicy] = useState<ContentPolicy>(DEFAULT_POLICY);
  const [isLoaded, setIsLoaded] = useState(false);
  const [newBlockedDomain, setNewBlockedDomain] = useState("");
  const [newAllowedDomain, setNewAllowedDomain] = useState("");

  const policyDocRef = doc(db, "policies", "test-child-user");

  useEffect(() => {
    fetch("/api/policy")
      .then((res) => res.json())
      .then((data) => {
        if (data.success && data.policy) {
          setPolicy((prev) => ({ ...prev, ...data.policy }));
        }
      })
      .catch((err) => console.warn("Could not fetch local policy:", err))
      .finally(() => setIsLoaded(true));

    const unsub = onSnapshot(policyDocRef, (snapshot) => {
      if (snapshot.exists()) {
        const data = snapshot.data() as Partial<ContentPolicy>;
        setPolicy((prev) => ({ ...prev, ...data }));
      }
      setIsLoaded(true);
    }, () => {
      setIsLoaded(true);
    });
    return unsub;
  }, []);

  const savePolicy = async (updates: Partial<ContentPolicy>) => {
    try {
      fetch("/api/policy", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updates),
      }).catch(() => {});

      setDoc(policyDocRef, { ...updates, updatedAt: serverTimestamp() }, { merge: true }).catch(() => {});
    } catch (error) {
      console.error("Error saving policy:", error);
    }
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
    const updated = [...policy.customBlockedDomains, raw];
    setPolicy((prev) => ({ ...prev, customBlockedDomains: updated }));
    savePolicy({ customBlockedDomains: updated });
    setNewBlockedDomain("");
  };

  const addAllowedDomain = () => {
    const raw = newAllowedDomain.trim().toLowerCase().replace(/^(https?:\/\/)?(www\.)?/, "").replace(/\/.*$/, "");
    if (!raw) return;
    const updated = [...policy.customAllowedDomains, raw];
    setPolicy((prev) => ({ ...prev, customAllowedDomains: updated }));
    savePolicy({ customAllowedDomains: updated });
    setNewAllowedDomain("");
  };

  if (!isLoaded) return <div className="animate-pulse flex space-x-4"><div className="flex-1 space-y-6 py-1"><div className="h-2 bg-[#1e222b] rounded"></div></div></div>;

  return (
    <div className="w-full max-w-[1000px] space-y-10">
      
      {/* ═══ SECURITY LEVEL ═══ */}
      <section>
        <h2 className="text-[12px] font-extrabold text-dash-text-muted uppercase tracking-wider mb-5">Security Level</h2>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
          {MODE_OPTIONS.map((opt) => {
            const isActive = policy.mode === opt.value;
            return (
              <div
                key={opt.value}
                onClick={() => changeMode(opt.value as ContentPolicy["mode"])}
                className={`p-5 rounded-2xl border transition-all cursor-pointer flex flex-col gap-3 ${
                  isActive 
                    ? "bg-dash-card-hover border-blue-500 shadow-[0_0_15px_rgba(59,130,246,0.1)]" 
                    : "bg-dash-sidebar border-dash-border hover:border-dash-border-light"
                }`}
              >
                <div className="flex items-center gap-3">
                  <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center shrink-0 ${isActive ? "border-blue-500" : "border-[#5d6776]"}`}>
                    {isActive && <div className="w-2 h-2 rounded-full bg-blue-500"></div>}
                  </div>
                  <h3 className="text-[14px] font-bold text-dash-text">{opt.label}</h3>
                </div>
                <p className="text-[12px] text-dash-text-faded leading-relaxed">
                  {opt.desc}
                </p>
              </div>
            );
          })}
        </div>
      </section>

      {/* ═══ CATEGORY FILTERS ═══ */}
      <section>
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-[12px] font-extrabold text-dash-text-muted uppercase tracking-wider">Category Filters</h2>
          <div className="px-3 py-1 bg-dash-card-hover border border-dash-border-light rounded-full text-[11px] font-bold text-dash-text-muted">
            {CATEGORY_TOGGLES.filter(cat => policy[cat.key as keyof ContentPolicy]).length} Active Rules
          </div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {CATEGORY_TOGGLES.map((cat) => {
            const isOn = policy[cat.key as keyof ContentPolicy] as boolean;
            return (
              <div
                key={cat.key}
                className="p-5 bg-dash-sidebar border border-dash-border rounded-2xl flex flex-col gap-4"
              >
                <div className="flex items-center justify-between">
                  <div className={`w-8 h-8 rounded-full bg-dash-card-hover flex items-center justify-center ${cat.iconColor}`}>
                    {cat.icon}
                  </div>
                  {/* Toggle Switch */}
                  <button
                    onClick={() => toggleCategory(cat.key)}
                    className={`relative w-11 h-6 rounded-full transition-all duration-200 ${
                      isOn ? "bg-blue-500" : "bg-dash-card-hover border border-dash-border-light"
                    }`}
                  >
                    <span
                      className={`absolute top-1 w-4 h-4 rounded-full transition-all duration-200 shadow-sm ${
                        isOn ? "left-[22px] bg-white" : "left-1 bg-dash-text-muted"
                      }`}
                    />
                  </button>
                </div>
                
                <div>
                  <div className="flex items-center gap-2 mb-1.5">
                    <h3 className="text-[14px] font-bold text-dash-text">{cat.label}</h3>
                    {cat.dotColor !== "bg-transparent" && (
                      <div className={`w-1.5 h-1.5 rounded-full ${cat.dotColor}`}></div>
                    )}
                  </div>
                  <p className="text-[12px] text-dash-text-faded leading-relaxed line-clamp-2">
                    {cat.desc}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* ═══ CUSTOM OVERRIDES ═══ */}
      <section>
        <h2 className="text-[12px] font-extrabold text-dash-text-muted uppercase tracking-wider mb-5">Custom Overrides</h2>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          
          {/* Always Block */}
          <div className="bg-dash-sidebar border border-dash-border rounded-2xl p-5 flex flex-col">
            <div className="flex items-center justify-between mb-5">
              <div className="flex items-center gap-2.5">
                <div className="w-2 h-2 rounded-full bg-rose-500"></div>
                <h3 className="text-[14px] font-bold text-dash-text">Always Block</h3>
              </div>
              <span className="text-[11px] font-bold text-dash-text-faded">{policy.customBlockedDomains.length} domains</span>
            </div>
            
            <div className="relative mb-3 flex items-center">
              <input
                type="text"
                value={newBlockedDomain}
                onChange={(e) => setNewBlockedDomain(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && addBlockedDomain()}
                placeholder="e.g. reddit.com"
                className="w-full bg-dash-card border border-dash-border-light rounded-xl py-2.5 pl-4 pr-24 text-[13px] text-dash-text placeholder-dash-text-faded focus:outline-none focus:border-rose-500/50 transition-colors"
              />
              <button
                onClick={addBlockedDomain}
                className="absolute right-1.5 top-1.5 bottom-1.5 px-4 bg-[#e11d48] hover:bg-[#be123c] text-dash-text text-[12px] font-bold rounded-lg transition-colors"
              >
                Block
              </button>
            </div>
            
            <p className="text-[11px] text-dash-text-faded italic text-center mt-2">
              {policy.customBlockedDomains.length === 0 
                ? "No domains explicitly blocked." 
                : policy.customBlockedDomains.join(", ")}
            </p>
          </div>

          {/* Always Allow */}
          <div className="bg-dash-sidebar border border-dash-border rounded-2xl p-5 flex flex-col">
            <div className="flex items-center justify-between mb-5">
              <div className="flex items-center gap-2.5">
                <div className="w-2 h-2 rounded-full bg-emerald-500"></div>
                <h3 className="text-[14px] font-bold text-dash-text">Always Allow</h3>
              </div>
              <span className="text-[11px] font-bold text-dash-text-faded">{policy.customAllowedDomains.length} domains</span>
            </div>
            
            <div className="relative mb-3 flex items-center">
              <input
                type="text"
                value={newAllowedDomain}
                onChange={(e) => setNewAllowedDomain(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && addAllowedDomain()}
                placeholder="e.g. khanacademy.org"
                className="w-full bg-dash-card border border-dash-border-light rounded-xl py-2.5 pl-4 pr-24 text-[13px] text-dash-text placeholder-dash-text-faded focus:outline-none focus:border-emerald-500/50 transition-colors"
              />
              <button
                onClick={addAllowedDomain}
                className="absolute right-1.5 top-1.5 bottom-1.5 px-4 bg-[#059669] hover:bg-[#047857] text-dash-text text-[12px] font-bold rounded-lg transition-colors"
              >
                Allow
              </button>
            </div>
            
            <p className="text-[11px] text-dash-text-faded italic text-center mt-2">
              {policy.customAllowedDomains.length === 0 
                ? "No domains explicitly allowed." 
                : policy.customAllowedDomains.join(", ")}
            </p>
          </div>

        </div>
      </section>

    </div>
  );
}

"use client";

import { useEffect, useState, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import { db } from "@/firebase";
import { collection, query, onSnapshot, doc, updateDoc } from "firebase/firestore";
import type { ChildProfile } from "@/components/Sidebar";

function PairContent() {
  const { user, loading } = useAuth();
  const searchParams = useSearchParams();
  const router = useRouter();
  
  const code = searchParams.get("code");
  const [children, setChildren] = useState<ChildProfile[]>([]);
  const [selectedChild, setSelectedChild] = useState<string>("");
  const [isPairing, setIsPairing] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!loading && !user) {
      router.push("/login?redirect=/pair?code=" + code);
    }
  }, [user, loading, router, code]);

  useEffect(() => {
    if (!user) return;
    const q = query(collection(db, `parents/${user.uid}/children`));
    const unsub = onSnapshot(q, (snap) => {
      const data = snap.docs.map(d => ({ id: d.id, ...d.data() })) as ChildProfile[];
      setChildren(data);
      if (data.length > 0) setSelectedChild(data[0].id);
    });
    return () => unsub();
  }, [user]);

  const handlePair = async () => {
    if (!user || !selectedChild || !code) return;
    setIsPairing(true);
    setError("");

    try {
      const codeRef = doc(db, "pairing_codes", code);
      await updateDoc(doc(db, `parents/${user.uid}/children`, selectedChild), {
        devicePaired: true
      });
      await updateDoc(codeRef, {
        status: "paired",
        childId: selectedChild,
        parentId: user.uid
      });
      
      // Success! Redirect to dashboard
      router.push("/");
    } catch (err) {
      console.error(err);
      setError("Failed to pair device. The code may have expired (codes refresh every 60s).");
      setIsPairing(false);
    }
  };

  if (loading || !user) return <div className="flex h-screen items-center justify-center bg-background"><div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" /></div>;

  return (
    <div className="flex h-screen w-screen items-center justify-center bg-background p-4">
      <div className="bg-surface border border-border rounded-3xl p-8 w-full max-w-md shadow-2xl text-center relative overflow-hidden">
        {/* Glow */}
        <div className="absolute top-0 right-0 w-32 h-32 bg-primary/10 rounded-full blur-3xl pointer-events-none" />
        
        <div className="w-16 h-16 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-2xl flex items-center justify-center mx-auto mb-6 shadow-lg shadow-primary/20">
          <span className="text-white text-2xl">📱</span>
        </div>
        
        <h1 className="text-2xl font-bold text-text mb-2">Connect Device</h1>
        <p className="text-text-muted text-sm mb-8">
          You are about to pair this browser to your Parent Dashboard.
        </p>

        {!code ? (
          <div className="text-danger bg-danger/10 p-4 rounded-xl border border-danger/20 text-sm">
            Invalid pairing link. No code provided in URL.
          </div>
        ) : (
          <div className="space-y-6 text-left">
            <div className="bg-surface-2 border border-border rounded-2xl p-4 flex items-center justify-between">
              <span className="text-text-muted text-xs uppercase tracking-widest font-semibold">Code</span>
              <span className="font-mono text-primary font-bold tracking-widest">{code}</span>
            </div>

            <div>
              <label className="block text-xs font-semibold text-text-muted uppercase tracking-wider mb-2 ml-1">Assign to Child</label>
              {children.length === 0 ? (
                <div className="text-sm text-text-muted bg-surface-2 p-4 rounded-xl border border-border text-center">
                  You haven't added any children yet. Please go to the Dashboard to create a profile first.
                </div>
              ) : (
                <select 
                  value={selectedChild}
                  onChange={(e) => setSelectedChild(e.target.value)}
                  className="w-full bg-surface-2 border border-border rounded-xl px-4 py-3 text-text focus:outline-none focus:border-primary transition-colors appearance-none"
                >
                  {children.map(c => (
                    <option key={c.id} value={c.id}>{c.name} {c.age ? `(${c.age} yrs)` : ''}</option>
                  ))}
                </select>
              )}
            </div>

            {error && <div className="text-danger text-sm text-center">{error}</div>}

            <button
              onClick={handlePair}
              disabled={isPairing || children.length === 0}
              className="w-full py-3.5 bg-primary hover:bg-primary-hover text-white font-medium rounded-xl transition-colors shadow-lg shadow-primary/20 disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {isPairing ? (
                <><div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" /> Connecting...</>
              ) : (
                "Pair Device Now"
              )}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

export default function PairPage() {
  return (
    <Suspense fallback={<div className="flex h-screen items-center justify-center bg-background"><div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" /></div>}>
      <PairContent />
    </Suspense>
  );
}

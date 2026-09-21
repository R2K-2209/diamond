"use client";

import { useState } from "react";
import { doc, setDoc } from "firebase/firestore";
import { db } from "@/firebase";

export default function PinSetupModal({ userId, onComplete }: { userId: string, onComplete: () => void }) {
  const [pin, setPin] = useState("");
  const [confirmPin, setConfirmPin] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    
    if (pin.length !== 4 || !/^\d+$/.test(pin)) {
      return setError("PIN must be exactly 4 digits.");
    }
    if (pin !== confirmPin) {
      return setError("PINs do not match.");
    }

    setLoading(true);
    try {
      // Using setDoc with merge: true in case the parent doc doesn't exist yet
      await setDoc(doc(db, "parents", userId), { pin }, { merge: true });
      onComplete();
    } catch (err: any) {
      setError(err.message || "Failed to set PIN");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/80 backdrop-blur-md">
      <div className="bg-dash-card border border-dash-border rounded-2xl p-6 max-w-sm w-full shadow-xl">
        <div className="flex justify-center mb-4">
          <div className="w-12 h-12 rounded-full bg-indigo-500/20 flex items-center justify-center">
            <svg className="w-6 h-6 text-indigo-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
            </svg>
          </div>
        </div>
        <h2 className="text-[18px] font-bold text-dash-text text-center mb-1">Set Parent PIN</h2>
        <p className="text-[13px] text-dash-text-faded text-center mb-6">
          Create a 4-digit PIN to lock your settings and protect against unauthorized changes.
        </p>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-[11px] font-bold text-dash-text-muted uppercase tracking-wider mb-1.5">New PIN</label>
            <input
              type="text"
              style={{ WebkitTextSecurity: "disc" } as any}
              autoComplete="off"
              inputMode="numeric"
              maxLength={4}
              value={pin}
              onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))}
              placeholder="••••"
              className="w-full bg-dash-sidebar border border-dash-border rounded-lg px-4 py-2.5 text-dash-text text-center tracking-[0.5em] text-lg font-bold outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-all placeholder:font-normal placeholder:tracking-normal"
              required
            />
          </div>
          <div>
            <label className="block text-[11px] font-bold text-dash-text-muted uppercase tracking-wider mb-1.5">Confirm PIN</label>
            <input
              type="text"
              style={{ WebkitTextSecurity: "disc" } as any}
              autoComplete="off"
              inputMode="numeric"
              maxLength={4}
              value={confirmPin}
              onChange={(e) => setConfirmPin(e.target.value.replace(/\D/g, ''))}
              placeholder="••••"
              className="w-full bg-dash-sidebar border border-dash-border rounded-lg px-4 py-2.5 text-dash-text text-center tracking-[0.5em] text-lg font-bold outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-all placeholder:font-normal placeholder:tracking-normal"
              required
            />
          </div>

          {error && <p className="text-[12px] text-rose-400 font-medium text-center">{error}</p>}

          <button
            type="submit"
            disabled={loading || pin.length !== 4 || confirmPin.length !== 4}
            className="w-full bg-indigo-500 text-white rounded-lg py-2.5 text-[13px] font-bold hover:bg-indigo-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed mt-2"
          >
            {loading ? "Saving..." : "Set PIN & Continue"}
          </button>
        </form>
      </div>
    </div>
  );
}

"use client";

import { useState } from "react";
import { doc, getDoc } from "firebase/firestore";
import { db } from "@/firebase";

export default function PinChallengeModal({ 
  isOpen, 
  userId,
  onSuccess, 
  onCancel,
  title = "Authentication Required",
  description = "Please enter your 4-digit Parent PIN to continue."
}: { 
  isOpen: boolean, 
  userId: string,
  onSuccess: () => void, 
  onCancel: () => void,
  title?: string,
  description?: string
}) {
  const [pin, setPin] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const docSnap = await getDoc(doc(db, "parents", userId));
      if (docSnap.exists()) {
        const data = docSnap.data();
        if (data.pin === pin) {
          setPin("");
          onSuccess();
        } else {
          setError("Incorrect PIN. Please try again.");
          setPin("");
        }
      } else {
        setError("Parent profile not found.");
      }
    } catch (err: any) {
      setError("An error occurred verifying your PIN.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/80 backdrop-blur-md">
      <div className="bg-dash-card border border-dash-border rounded-2xl p-6 max-w-sm w-full shadow-xl">
        <div className="flex justify-center mb-4">
          <div className="w-12 h-12 rounded-full bg-rose-500/20 flex items-center justify-center">
            <svg className="w-6 h-6 text-rose-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
            </svg>
          </div>
        </div>
        
        <h2 className="text-[18px] font-bold text-dash-text text-center mb-1">{title}</h2>
        <p className="text-[13px] text-dash-text-faded text-center mb-6">
          {description}
        </p>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <input
              type="password"
              inputMode="numeric"
              maxLength={4}
              value={pin}
              autoFocus
              onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))}
              placeholder="••••"
              className="w-full bg-dash-sidebar border border-dash-border rounded-lg px-4 py-2.5 text-dash-text text-center tracking-[0.5em] text-lg font-bold outline-none focus:border-rose-500 focus:ring-1 focus:ring-rose-500 transition-all placeholder:font-normal placeholder:tracking-normal"
              required
            />
          </div>

          {error && <p className="text-[12px] text-rose-400 font-medium text-center">{error}</p>}

          <div className="flex gap-3 mt-2">
            <button
              type="button"
              onClick={() => {
                setPin("");
                setError("");
                onCancel();
              }}
              className="flex-1 bg-dash-sidebar text-dash-text rounded-lg py-2.5 text-[13px] font-bold hover:bg-dash-sidebar-hover transition-colors border border-dash-border"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading || pin.length !== 4}
              className="flex-1 bg-rose-500 text-white rounded-lg py-2.5 text-[13px] font-bold hover:bg-rose-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? "Verifying..." : "Unlock"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

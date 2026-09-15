"use client";

import React, { createContext, useContext, useEffect, useState } from 'react';
import { onAuthStateChanged, User, signOut as firebaseSignOut } from 'firebase/auth';
import { auth } from '@/firebase';
import { useRouter, usePathname } from 'next/navigation';

interface AuthContextType {
  user: User | null;
  loading: boolean;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  loading: true,
  signOut: async () => {},
});

export const AuthProvider = ({ children }: { children: React.ReactNode }) => {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [authError, setAuthError] = useState<string | null>(null);
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    let unsubscribe: () => void;
    let timeout: NodeJS.Timeout;

    try {
      console.log("AuthContext: Starting auth listener...");
      
      // Fallback timeout in case Firebase auth hangs
      timeout = setTimeout(() => {
        setAuthError("Authentication timed out (10s). If you're on a phone, try using standard Safari/Chrome, not a private tab.");
        setLoading(false);
      }, 10000);

      unsubscribe = onAuthStateChanged(auth, (currentUser) => {
        console.log("AuthContext: onAuthStateChanged fired. User:", currentUser?.email);
        clearTimeout(timeout);
        // Check if user is logged in and verified
        if (currentUser) {
          if (!currentUser.emailVerified) {
            setUser(currentUser);
            if (pathname !== '/login') router.push('/login?verify=true');
          } else {
            setUser(currentUser);
            if (pathname === '/login') router.push('/');
          }
        } else {
          setUser(null);
          if (pathname !== '/login') router.push('/login');
        }
        setLoading(false);
      }, (error) => {
        console.error("Firebase Auth Error:", error);
        setAuthError(error.message);
        setLoading(false);
      });
    } catch (err: any) {
      console.error("Critical Auth Error:", err);
      setAuthError(err.message || "Failed to initialize Firebase Auth.");
      setLoading(false);
    }

    return () => {
      if (timeout) clearTimeout(timeout);
      if (unsubscribe) unsubscribe();
    };
  }, [pathname, router]);

  const signOut = async () => {
    await firebaseSignOut(auth);
    router.push('/login');
  };

  return (
    <AuthContext.Provider value={{ user, loading, signOut }}>
      {loading ? (
        <div className="flex h-screen items-center justify-center bg-[#0d0d0d] flex-col gap-6">
          <div className="flex flex-col items-center gap-4">
            <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
            <p className="text-gray-400 text-sm">Authenticating...</p>
          </div>
          <button 
            onClick={() => alert("JavaScript is working correctly on your phone! The issue is solely with Firebase.")}
            className="px-4 py-2 border border-gray-700 rounded-lg text-gray-500 text-xs"
          >
            Test Connection
          </button>
        </div>
      ) : authError ? (
        <div className="flex h-screen items-center justify-center bg-[#0d0d0d]">
          <div className="bg-red-500/10 border border-red-500/20 p-6 rounded-2xl max-w-sm text-center">
            <h2 className="text-red-400 font-bold mb-2">Authentication Error</h2>
            <p className="text-gray-300 text-sm">{authError}</p>
            <button onClick={() => window.location.reload()} className="mt-4 px-4 py-2 bg-red-600 hover:bg-red-700 text-dash-text rounded-lg text-sm">
              Retry
            </button>
          </div>
        </div>
      ) : (
        children
      )}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);

import { useEffect, useRef } from 'react';
import { db } from '../firebase';
import { doc, setDoc, getDoc } from 'firebase/firestore';
import type { TabData } from '../types';

function getDomain(url: string): string {
  try {
    const hostname = new URL(url).hostname;
    return hostname.replace('www.', '');
  } catch {
    return '';
  }
}

export function useScreenTimeTracker(
  childId: string | null | undefined, 
  activeTabId: string, 
  tabs: TabData[]
) {
  const activeDomainRef = useRef<string>('');
  const timeAccumulatorRef = useRef<Record<string, number>>({});
  const lastTickRef = useRef<number>(Date.now());
  const syncTimerRef = useRef<number | null>(null);

  // Keep ref updated with current active domain
  useEffect(() => {
    const activeTab = tabs.find(t => t.id === activeTabId);
    if (!activeTab || activeTab.urlInput === 'diamond://newtab' || activeTab.currentUrl.startsWith('diamond://')) {
      activeDomainRef.current = '';
    } else {
      activeDomainRef.current = getDomain(activeTab.currentUrl);
    }
  }, [activeTabId, tabs]);

  // The actual ticking logic
  useEffect(() => {
    if (!childId) return;

    // Reset last tick on mount so we don't accumulate idle time before mount
    lastTickRef.current = Date.now();

    const TICK_INTERVAL = 2000; // Check every 2 seconds
    const SYNC_INTERVAL = 30000; // Sync to Firebase every 30 seconds for real-time feel

    const tickInterval = window.setInterval(() => {
      const now = Date.now();
      const MathMinElapsed = Math.min(now - lastTickRef.current, TICK_INTERVAL + 1000); // cap elapsed time to avoid huge spikes if browser sleeps
      const elapsed = MathMinElapsed;
      lastTickRef.current = now;

      // Only count if document has focus and we have an active domain
      if (document.hasFocus() && activeDomainRef.current) {
        const domain = activeDomainRef.current;
        if (!timeAccumulatorRef.current[domain]) {
          timeAccumulatorRef.current[domain] = 0;
        }
        timeAccumulatorRef.current[domain] += elapsed;
      }
    }, TICK_INTERVAL);

    // Sync logic
    const syncData = async () => {
      if (Object.keys(timeAccumulatorRef.current).length === 0) return;

      const dateStr = new Date().toLocaleDateString('en-CA'); // YYYY-MM-DD format (local time zone)
      const docId = `${childId}_${dateStr}`;
      const docRef = doc(db, 'screen_time', docId);
      
      const localDataToSync = { ...timeAccumulatorRef.current };
      // Clear local accumulator to prevent double-counting
      timeAccumulatorRef.current = {};

      try {
        const snapshot = await getDoc(docRef);
        if (snapshot.exists()) {
          const existingData = snapshot.data();
          const newDomains = { ...existingData.domains };
          let newTotal = existingData.totalTimeMs || 0;

          for (const [domain, time] of Object.entries(localDataToSync)) {
            newDomains[domain] = (newDomains[domain] || 0) + time;
            newTotal += time;
          }

          await setDoc(docRef, {
            domains: newDomains,
            totalTimeMs: newTotal,
            lastUpdated: Date.now()
          }, { merge: true });
        } else {
          let newTotal = 0;
          for (const time of Object.values(localDataToSync)) {
             newTotal += time;
          }
          await setDoc(docRef, {
            childId,
            date: dateStr,
            domains: localDataToSync,
            totalTimeMs: newTotal,
            lastUpdated: Date.now()
          });
        }
      } catch (err) {
        console.error("[Diamond L4] Failed to sync screen time", err);
        // Put data back into accumulator if failed so we try again
        for (const [domain, time] of Object.entries(localDataToSync)) {
           timeAccumulatorRef.current[domain] = (timeAccumulatorRef.current[domain] || 0) + time;
        }
      }
    };

    syncTimerRef.current = window.setInterval(syncData, SYNC_INTERVAL);

    return () => {
      window.clearInterval(tickInterval);
      if (syncTimerRef.current) window.clearInterval(syncTimerRef.current);
      // Run one last sync on unmount
      syncData();
    };
  }, [childId]);
}

/**
 * Diamond Policy Sync — Layer 2
 * 
 * Real-time Firestore listener for parent-managed content policies.
 * The parent dashboard writes to `policies/content_filter` and the browser
 * picks up changes instantly via onSnapshot().
 * 
 * This module is imported by both main.ts (for network interception)
 * and safetyFilter.ts (for per-request policy checks).
 */

import { db } from './firebase';
import { doc, onSnapshot, setDoc, getDoc } from 'firebase/firestore';

// ─── Policy Types ───────────────────────────────────────────────

export interface ContentPolicy {
  // Parent-managed block/allow lists (live-updated from dashboard)
  customBlockedDomains: string[];
  customAllowedDomains: string[];

  // Category toggles (all ON by default for child safety)
  blockAdultContent: boolean;
  blockGambling: boolean;
  blockSocialMedia: boolean;
  blockGaming: boolean;
  blockVpnProxy: boolean;
  blockUrlShorteners: boolean;

  // Browsing mode
  mode: 'strict' | 'moderate' | 'allowlist_only';
  // strict     = open web + all filters at max sensitivity
  // moderate   = open web + standard filters (default)
  // allowlist_only = walled garden — only walledGardenSites accessible

  // Pre-approved educational & safe sites for walled-garden mode
  walledGardenSites: string[];

  // Screen time (minutes per day, 0 = unlimited)
  dailyScreenTimeMinutes: number;

  // Last updated timestamp
  updatedAt?: any;
}

// ─── Default Policy ─────────────────────────────────────────────

const DEFAULT_POLICY: ContentPolicy = {
  customBlockedDomains: [],
  customAllowedDomains: [],
  blockAdultContent: true,
  blockGambling: true,
  blockSocialMedia: false,
  blockGaming: false,
  blockVpnProxy: true,
  blockUrlShorteners: true,
  mode: 'moderate',
  walledGardenSites: [
    // Educational
    'khanacademy.org',
    'wikipedia.org',
    'britannica.com',
    'duolingo.com',
    'coursera.org',
    'edx.org',
    'codecademy.com',
    'scratch.mit.edu',
    'code.org',
    'mathway.com',
    'wolframalpha.com',
    'quizlet.com',
    // Kids Entertainment
    'pbskids.org',
    'nationalgeographic.com',
    'nasa.gov',
    'coolmathgames.com',
    'funbrain.com',
    'brainpop.com',
    // Search (SafeSearch enforced)
    'google.com',
    'bing.com',
    'duckduckgo.com',
    // Reference
    'dictionary.com',
    'thesaurus.com',
    'merriam-webster.com',
    // News (kid-safe)
    'newsela.com',
    'dogonews.com',
    'tweentribune.com',
  ],
  dailyScreenTimeMinutes: 0, // unlimited by default
};

// ─── Reactive State ─────────────────────────────────────────────

let currentPolicy: ContentPolicy = { ...DEFAULT_POLICY };
let isInitialized = false;
let unsubscribe: (() => void) | null = null;
const listeners: Array<(policy: ContentPolicy) => void> = [];

/**
 * Get the current active policy (synchronous, always available).
 */
export function getPolicy(): ContentPolicy {
  return currentPolicy;
}

/**
 * Update the policy from an IPC message (used by renderer process).
 * Since policySync is bundled separately for main and renderer,
 * the renderer needs to receive updates via IPC from the main process.
 */
export function updatePolicyFromIPC(policy: Partial<ContentPolicy>): void {
  currentPolicy = { ...DEFAULT_POLICY, ...policy };
  isInitialized = true;
  for (const listener of listeners) {
    try { listener(currentPolicy); } catch {}
  }
}

/**
 * Check if policy has been loaded from Firestore at least once.
 */
export function isPolicyInitialized(): boolean {
  return isInitialized;
}

/**
 * Register a callback for policy changes.
 */
export function onPolicyChange(callback: (policy: ContentPolicy) => void): () => void {
  listeners.push(callback);
  return () => {
    const idx = listeners.indexOf(callback);
    if (idx >= 0) listeners.splice(idx, 1);
  };
}

/**
 * Initialize policy sync.
 * Firestore is currently disabled for this project, so we use local-only mode.
 * When Firestore is enabled in Google Cloud Console, uncomment the onSnapshot block.
 */
export async function initPolicySync(userId: string = 'test-child-user'): Promise<void> {
  console.log('[PolicySync] Using local-only policy mode (Firestore API not enabled).');
  
  // Use defaults — local policy from ~/.diamond/policy.json is the source of truth
  currentPolicy = { ...DEFAULT_POLICY };
  isInitialized = true;

  // Notify all listeners with defaults
  for (const listener of listeners) {
    try {
      listener(currentPolicy);
    } catch (err) {
      console.error('[PolicySync] Listener error:', err);
    }
  }

  /* 
   * UNCOMMENT THIS when Firestore API is enabled in Google Cloud Console:
   * https://console.developers.google.com/apis/api/firestore.googleapis.com/overview?project=browser-3ae3d
   *
  const policyDocRef = doc(db, 'policies', userId);
  try {
    const snapshot = await getDoc(policyDocRef);
    if (!snapshot.exists()) {
      await setDoc(policyDocRef, { ...DEFAULT_POLICY, updatedAt: new Date().toISOString() });
    }
  } catch (error) {
    console.warn('[PolicySync] Could not check/create policy document:', error);
  }

  unsubscribe = onSnapshot(
    policyDocRef,
    (snapshot) => {
      if (snapshot.exists()) {
        const data = snapshot.data();
        currentPolicy = {
          customBlockedDomains: data.customBlockedDomains ?? DEFAULT_POLICY.customBlockedDomains,
          customAllowedDomains: data.customAllowedDomains ?? DEFAULT_POLICY.customAllowedDomains,
          blockAdultContent: data.blockAdultContent ?? DEFAULT_POLICY.blockAdultContent,
          blockGambling: data.blockGambling ?? DEFAULT_POLICY.blockGambling,
          blockSocialMedia: data.blockSocialMedia ?? DEFAULT_POLICY.blockSocialMedia,
          blockGaming: data.blockGaming ?? DEFAULT_POLICY.blockGaming,
          blockVpnProxy: data.blockVpnProxy ?? DEFAULT_POLICY.blockVpnProxy,
          blockUrlShorteners: data.blockUrlShorteners ?? DEFAULT_POLICY.blockUrlShorteners,
          mode: data.mode ?? DEFAULT_POLICY.mode,
          walledGardenSites: data.walledGardenSites ?? DEFAULT_POLICY.walledGardenSites,
          dailyScreenTimeMinutes: data.dailyScreenTimeMinutes ?? DEFAULT_POLICY.dailyScreenTimeMinutes,
          updatedAt: data.updatedAt,
        };
      } else {
        currentPolicy = { ...DEFAULT_POLICY };
      }
      isInitialized = true;
      for (const listener of listeners) {
        try { listener(currentPolicy); } catch (err) { console.error('[PolicySync] Listener error:', err); }
      }
    },
    (error) => {
      console.error('[PolicySync] Firestore listener error:', error);
      isInitialized = true;
    }
  );
  */
}

/**
 * Cleanup the Firestore listener (call on app quit).
 */
export function destroyPolicySync(): void {
  if (unsubscribe) {
    unsubscribe();
    unsubscribe = null;
  }
}

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

export interface ContentPolicy {
  customBlockedDomains: string[];
  customAllowedDomains: string[];
  blockAdultContent: boolean;
  blockGambling: boolean;
  blockSocialMedia: boolean;
  blockGaming: boolean;
  blockVpnProxy: boolean;
  blockUrlShorteners: boolean;
  mode: 'strict' | 'moderate' | 'allowlist_only';
  walledGardenSites: string[];
  dailyScreenTimeMinutes: number;
  updatedAt?: any;
}

export const DEFAULT_POLICY: ContentPolicy = {
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
    'pbskids.org',
    'nationalgeographic.com',
    'nasa.gov',
    'coolmathgames.com',
    'funbrain.com',
    'brainpop.com',
    'google.com',
    'bing.com',
    'duckduckgo.com',
    'dictionary.com',
    'thesaurus.com',
    'merriam-webster.com',
    'newsela.com',
    'dogonews.com',
    'tweentribune.com',
  ],
  dailyScreenTimeMinutes: 0,
};

const DIAMOND_DIR = path.join(os.homedir(), '.diamond');
const POLICY_FILE = path.join(DIAMOND_DIR, 'policy.json');
const ALERTS_FILE = path.join(DIAMOND_DIR, 'alerts.json');
const LOGS_FILE = path.join(DIAMOND_DIR, 'logs.json');
const REQUESTS_FILE = path.join(DIAMOND_DIR, 'requests.json');

function ensureDir() {
  if (!fs.existsSync(DIAMOND_DIR)) {
    try {
      fs.mkdirSync(DIAMOND_DIR, { recursive: true });
    } catch (e) {
      console.error('[LocalPolicy] Failed to create .diamond directory:', e);
    }
  }
}

export function readLocalPolicy(): ContentPolicy {
  ensureDir();
  try {
    if (fs.existsSync(POLICY_FILE)) {
      const raw = fs.readFileSync(POLICY_FILE, 'utf8');
      const parsed = JSON.parse(raw);
      return { ...DEFAULT_POLICY, ...parsed };
    }
  } catch (e) {
    console.error('[LocalPolicy] Error reading policy file:', e);
  }
  // Initialize with default if not found
  try {
    fs.writeFileSync(POLICY_FILE, JSON.stringify(DEFAULT_POLICY, null, 2), 'utf8');
  } catch {}
  return { ...DEFAULT_POLICY };
}

export function writeLocalPolicy(policy: Partial<ContentPolicy>): ContentPolicy {
  ensureDir();
  const current = readLocalPolicy();
  const updated = { ...current, ...policy, updatedAt: new Date().toISOString() };
  try {
    fs.writeFileSync(POLICY_FILE, JSON.stringify(updated, null, 2), 'utf8');
    console.log('[LocalPolicy] Policy written successfully to', POLICY_FILE);
  } catch (e) {
    console.error('[LocalPolicy] Error writing policy file:', e);
  }
  return updated;
}

export function watchLocalPolicy(callback: (policy: ContentPolicy) => void): () => void {
  ensureDir();
  // Ensure file exists before watching
  if (!fs.existsSync(POLICY_FILE)) {
    try {
      fs.writeFileSync(POLICY_FILE, JSON.stringify(DEFAULT_POLICY, null, 2), 'utf8');
    } catch {}
  }

  let debounceTimer: NodeJS.Timeout | null = null;
  const watcher = fs.watch(POLICY_FILE, (eventType) => {
    if (eventType === 'change' || eventType === 'rename') {
      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        try {
          const freshPolicy = readLocalPolicy();
          console.log('[LocalPolicy] Detected external policy file change, reloading policy:', {
            blocked: freshPolicy.customBlockedDomains,
            social: freshPolicy.blockSocialMedia,
            adult: freshPolicy.blockAdultContent,
            mode: freshPolicy.mode,
          });
          callback(freshPolicy);
        } catch (e) {
          console.error('[LocalPolicy] Error reloading changed policy:', e);
        }
      }, 100);
    }
  });

  return () => {
    try {
      watcher.close();
    } catch {}
  };
}

// ── Local logging functions for alerts, browsing history, requests ──

export function recordLocalAlert(alert: { url: string; category: string; reason: string; severity?: string }) {
  ensureDir();
  try {
    let list: any[] = [];
    if (fs.existsSync(ALERTS_FILE)) {
      try { list = JSON.parse(fs.readFileSync(ALERTS_FILE, 'utf8')); } catch {}
    }
    const newEntry = {
      id: 'alert_' + Date.now() + '_' + Math.random().toString(36).substring(2, 6),
      type: 'BLOCKED_ATTEMPT',
      ...alert,
      timestamp: new Date().toISOString(),
      userId: 'test-child-user',
      severity: alert.severity || 'HIGH',
    };
    list.unshift(newEntry);
    if (list.length > 200) list = list.slice(0, 200);
    fs.writeFileSync(ALERTS_FILE, JSON.stringify(list, null, 2), 'utf8');
  } catch (e) {
    console.error('[LocalPolicy] Error recording alert:', e);
  }
}

export function recordLocalNavigation(url: string, title: string) {
  ensureDir();
  try {
    let list: any[] = [];
    if (fs.existsSync(LOGS_FILE)) {
      try { list = JSON.parse(fs.readFileSync(LOGS_FILE, 'utf8')); } catch {}
    }
    const newEntry = {
      id: 'log_' + Date.now() + '_' + Math.random().toString(36).substring(2, 6),
      url,
      title: title || 'Unknown',
      timestamp: new Date().toISOString(),
      userId: 'test-child-user',
      safe: true,
    };
    list.unshift(newEntry);
    if (list.length > 200) list = list.slice(0, 200);
    fs.writeFileSync(LOGS_FILE, JSON.stringify(list, null, 2), 'utf8');
  } catch (e) {
    console.error('[LocalPolicy] Error recording navigation:', e);
  }
}

export function recordLocalRequest(url: string, category: string) {
  ensureDir();
  try {
    let list: any[] = [];
    if (fs.existsSync(REQUESTS_FILE)) {
      try { list = JSON.parse(fs.readFileSync(REQUESTS_FILE, 'utf8')); } catch {}
    }
    const newEntry = {
      id: 'req_' + Date.now() + '_' + Math.random().toString(36).substring(2, 6),
      url,
      category: category || 'Restricted Page',
      timestamp: new Date().toISOString(),
      userId: 'test-child-user',
      status: 'PENDING',
    };
    list.unshift(newEntry);
    if (list.length > 100) list = list.slice(0, 100);
    fs.writeFileSync(REQUESTS_FILE, JSON.stringify(list, null, 2), 'utf8');
  } catch (e) {
    console.error('[LocalPolicy] Error recording request:', e);
  }
}

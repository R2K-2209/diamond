import { NextResponse } from 'next/server';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { db } from '@/firebase';
import { doc, setDoc, serverTimestamp } from 'firebase/firestore';

const DIAMOND_DIR = path.join(os.homedir(), '.diamond');
const POLICY_FILE = path.join(DIAMOND_DIR, 'policy.json');

const DEFAULT_POLICY = {
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
  ],
  dailyScreenTimeMinutes: 0,
};

function ensureDir() {
  if (!fs.existsSync(DIAMOND_DIR)) {
    try {
      fs.mkdirSync(DIAMOND_DIR, { recursive: true });
    } catch {}
  }
}

export async function GET() {
  ensureDir();
  try {
    if (fs.existsSync(POLICY_FILE)) {
      const content = fs.readFileSync(POLICY_FILE, 'utf8');
      const policy = JSON.parse(content);
      return NextResponse.json({ success: true, policy: { ...DEFAULT_POLICY, ...policy } });
    }
  } catch (err: any) {
    console.error('Error reading policy file:', err);
  }

  // Create default if not found
  try {
    fs.writeFileSync(POLICY_FILE, JSON.stringify(DEFAULT_POLICY, null, 2), 'utf8');
  } catch {}
  return NextResponse.json({ success: true, policy: DEFAULT_POLICY });
}

export async function POST(request: Request) {
  ensureDir();
  try {
    const updates = await request.json();

    // Read existing
    let currentPolicy = { ...DEFAULT_POLICY };
    if (fs.existsSync(POLICY_FILE)) {
      try {
        currentPolicy = { ...DEFAULT_POLICY, ...JSON.parse(fs.readFileSync(POLICY_FILE, 'utf8')) };
      } catch {}
    }

    const newPolicy = {
      ...currentPolicy,
      ...updates,
      updatedAt: new Date().toISOString(),
    };

    // Save locally
    fs.writeFileSync(POLICY_FILE, JSON.stringify(newPolicy, null, 2), 'utf8');

    // Also attempt to push to Firestore in background
    setDoc(doc(db, 'policies', 'test-child-user'), {
      ...newPolicy,
      updatedAt: serverTimestamp(),
    }, { merge: true }).catch(() => {
      // Cloud Firestore might not be enabled in project browser-3ae3d
    });

    return NextResponse.json({ success: true, policy: newPolicy });
  } catch (err: any) {
    console.error('Error updating policy:', err);
    return NextResponse.json({ success: false, error: err?.message }, { status: 500 });
  }
}

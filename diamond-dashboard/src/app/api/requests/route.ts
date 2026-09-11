import { NextResponse } from 'next/server';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const DIAMOND_DIR = path.join(os.homedir(), '.diamond');
const REQUESTS_FILE = path.join(DIAMOND_DIR, 'requests.json');

function ensureDir() {
  if (!fs.existsSync(DIAMOND_DIR)) {
    try { fs.mkdirSync(DIAMOND_DIR, { recursive: true }); } catch {}
  }
}

export async function GET() {
  ensureDir();
  try {
    if (fs.existsSync(REQUESTS_FILE)) {
      const data = JSON.parse(fs.readFileSync(REQUESTS_FILE, 'utf8'));
      return NextResponse.json({ success: true, requests: data });
    }
  } catch {}
  return NextResponse.json({ success: true, requests: [] });
}

export async function PATCH(request: Request) {
  ensureDir();
  try {
    const { id, status } = await request.json();
    if (!id || !status) return NextResponse.json({ success: false, error: 'Missing parameters' }, { status: 400 });

    if (fs.existsSync(REQUESTS_FILE)) {
      const data = JSON.parse(fs.readFileSync(REQUESTS_FILE, 'utf8'));
      const updated = data.map((r: any) => (r.id === id ? { ...r, status } : r));
      fs.writeFileSync(REQUESTS_FILE, JSON.stringify(updated, null, 2), 'utf8');
    }
    return NextResponse.json({ success: true });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err?.message }, { status: 500 });
  }
}

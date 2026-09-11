import { NextResponse } from 'next/server';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const DIAMOND_DIR = path.join(os.homedir(), '.diamond');
const ALERTS_FILE = path.join(DIAMOND_DIR, 'alerts.json');

function ensureDir() {
  if (!fs.existsSync(DIAMOND_DIR)) {
    try { fs.mkdirSync(DIAMOND_DIR, { recursive: true }); } catch {}
  }
}

export async function GET() {
  ensureDir();
  try {
    if (fs.existsSync(ALERTS_FILE)) {
      const data = JSON.parse(fs.readFileSync(ALERTS_FILE, 'utf8'));
      return NextResponse.json({ success: true, alerts: data });
    }
  } catch {}
  return NextResponse.json({ success: true, alerts: [] });
}

export async function DELETE(request: Request) {
  ensureDir();
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');
    if (!id) return NextResponse.json({ success: false, error: 'Missing id' }, { status: 400 });

    if (fs.existsSync(ALERTS_FILE)) {
      const data = JSON.parse(fs.readFileSync(ALERTS_FILE, 'utf8'));
      const filtered = data.filter((a: any) => a.id !== id);
      fs.writeFileSync(ALERTS_FILE, JSON.stringify(filtered, null, 2), 'utf8');
    }
    return NextResponse.json({ success: true });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err?.message }, { status: 500 });
  }
}

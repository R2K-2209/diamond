# 💎 Diamond - Child-Safe Browser & Parental Intelligence Dashboard

**Diamond** is an intelligent, child-safe web browsing ecosystem featuring an Electron-based protected browser client and a Next.js real-time parental monitoring dashboard connected via Firebase.

---

## 📁 Repository Structure

```
diamond/
├── diamond-browser/       # Electron + Vite + React desktop child browser
│   ├── electron/          # Main & preload processes (network filtering, safe search, download blocking)
│   ├── src/               # React UI & browser navigation controls
│   └── package.json
└── diamond-dashboard/     # Next.js parent monitoring & analytics web dashboard
    ├── src/               # Next.js App Router, real-time Firestore logging, management
    └── package.json
```

---

## ✨ Features

- **Child-Safe Browser (`diamond-browser`)**:
  - Enforced SafeSearch on major search engines (Google, Bing, YouTube, DuckDuckGo).
  - Executable and dangerous file download blocking (`.exe`, `.bat`, `.msi`, `.cmd`, `.ps1`, `.scr`).
  - Real-time navigation and security event logging directly to Firebase Firestore.
  - Clean, distraction-free modern UI with responsive navigation controls.

- **Parent Dashboard (`diamond-dashboard`)**:
  - Real-time browsing history and event stream.
  - Domain categorization and safety telemetry.
  - Remote controls and policy enforcement.

---

## 🚀 Quick Start

### 1. Child Browser (`diamond-browser`)

```bash
cd diamond-browser
npm install
npm run dev
```

### 2. Parent Dashboard (`diamond-dashboard`)

```bash
cd diamond-dashboard
npm install
npm run dev
```

---

## 🔒 Tech Stack

- **Desktop App:** Electron, Vite, React, TypeScript, Tailwind CSS
- **Dashboard:** Next.js 15, React, TypeScript, Tailwind CSS
- **Backend / Database:** Firebase (Authentication, Cloud Firestore)

---

## 📈 Recent Updates

- **History Feature Polish (diamond-browser):**
  - Designed a premium, Google Chrome-style History UI in React, complete with dark-mode, daily grouping, and clean tabular row layouts.
  - Implemented smart navigation deduplication in the Electron Main process (60-second cooldown) to prevent excessive duplicate logging on redirects.
  - Added frontend deduplication logic to retroactively clean up old duplicate log files.
  - Silenced unhandled Promise rejections from IPC logging streams (`logNavigation`).

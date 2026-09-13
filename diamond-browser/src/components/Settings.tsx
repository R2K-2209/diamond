import React from 'react';

export function SettingsPage() {
  return (
    <div className="w-full h-full bg-[#101010] text-gray-200 flex flex-col p-10 font-sans">
      <h1 className="text-3xl font-semibold mb-6 flex items-center gap-3">
        <svg className="w-8 h-8 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
        Browser Settings
      </h1>
      
      <div className="max-w-3xl bg-[#1e1e1e] border border-white/10 rounded-2xl p-8">
        <h2 className="text-xl font-medium mb-4">Coming Soon</h2>
        <p className="text-gray-400">
          The comprehensive browser settings panel will be built here in an upcoming phase. 
          For now, you can customize your new tab dashboard by clicking the gear icon on the New Tab page.
        </p>
      </div>
    </div>
  );
}

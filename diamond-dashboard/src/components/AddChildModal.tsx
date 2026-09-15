import React from 'react';

interface AddChildModalProps {
  onClose: () => void;
  onSubmit: (e: React.FormEvent) => void;
  isAddingChild: boolean;
  newChildName: string;
  setNewChildName: (val: string) => void;
  newChildAge: string;
  setNewChildAge: (val: string) => void;
}

export default function AddChildModal({
  onClose,
  onSubmit,
  isAddingChild,
  newChildName,
  setNewChildName,
  newChildAge,
  setNewChildAge
}: AddChildModalProps) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-md p-4">
      {/* Modal Container */}
      <div className="bg-dash-card border border-dash-border-light rounded-3xl w-full max-w-md shadow-2xl relative overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        
        {/* Top Decorative Gradient */}
        <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-blue-500 to-indigo-500"></div>
        
        <div className="p-8">
          <div className="mb-8">
            <div className="w-14 h-14 bg-blue-500/10 border border-blue-500/20 rounded-2xl flex items-center justify-center mb-6 shadow-inner">
              <svg className="w-7 h-7 text-blue-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z" />
              </svg>
            </div>
            <h2 className="text-2xl font-bold text-dash-text tracking-tight">Create Profile</h2>
            <p className="text-sm text-dash-text-muted mt-1.5">Set up a secure, managed browsing space for your child on Diamond Browser.</p>
          </div>
          
          <form onSubmit={onSubmit} className="space-y-5">
            <div>
              <label className="block text-[11px] font-bold text-dash-text-muted uppercase tracking-widest mb-2">First Name</label>
              <input
                type="text"
                placeholder="e.g. Alex"
                value={newChildName}
                onChange={(e) => setNewChildName(e.target.value)}
                className="w-full bg-dash-bg border border-dash-border-light rounded-xl px-4 py-3.5 text-sm text-dash-text placeholder-dash-text-faded focus:outline-none focus:border-blue-500/50 focus:ring-1 focus:ring-blue-500/20 transition-all shadow-inner"
                required
                autoFocus
              />
            </div>
            
            <div>
              <label className="block text-[11px] font-bold text-dash-text-muted uppercase tracking-widest mb-2">Age</label>
              <input
                type="number"
                min="1"
                max="17"
                placeholder="e.g. 12"
                value={newChildAge}
                onChange={(e) => setNewChildAge(e.target.value)}
                className="w-full bg-dash-bg border border-dash-border-light rounded-xl px-4 py-3.5 text-sm text-dash-text placeholder-dash-text-faded focus:outline-none focus:border-blue-500/50 focus:ring-1 focus:ring-blue-500/20 transition-all shadow-inner"
                required
              />
            </div>

            <div className="flex gap-3 pt-4">
              <button 
                type="button" 
                onClick={onClose} 
                disabled={isAddingChild}
                className="w-1/3 py-3 text-sm font-bold text-dash-text-muted hover:text-dash-text bg-dash-bg hover:bg-dash-border-light border border-dash-border-light rounded-xl transition-all disabled:opacity-50"
              >
                Cancel
              </button>
              <button 
                type="submit" 
                disabled={isAddingChild}
                className="flex-1 py-3 bg-blue-600 hover:bg-blue-500 text-dash-text text-sm font-bold rounded-xl transition-all shadow-lg shadow-blue-500/20 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 border border-blue-400/20"
              >
                {isAddingChild && <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />}
                {isAddingChild ? 'Creating...' : 'Create Profile'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}

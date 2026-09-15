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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="bg-[#181818] border border-[#2b2b2b] rounded-3xl p-8 w-full max-w-md shadow-2xl relative overflow-hidden">
        {/* Decorative Background */}
        <div className="absolute -top-20 -right-20 w-40 h-40 bg-blue-600/20 rounded-full blur-[80px] pointer-events-none" />
        <div className="absolute -bottom-20 -left-20 w-40 h-40 bg-indigo-600/20 rounded-full blur-[80px] pointer-events-none" />
        
        <div className="relative z-10 text-center mb-6">
          <div className="w-20 h-20 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-full flex items-center justify-center mx-auto mb-4 shadow-lg shadow-blue-500/20 text-3xl">
            👦👧
          </div>
          <h2 className="text-2xl font-bold text-white mb-1 tracking-tight">Create Profile</h2>
          <p className="text-gray-400 text-sm">Set up a secure browsing space for your child</p>
        </div>
        
        <form onSubmit={onSubmit} className="relative z-10 space-y-4">
          <div>
            <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1.5 ml-1">First Name</label>
            <input
              type="text"
              placeholder="e.g. Alex"
              value={newChildName}
              onChange={(e) => setNewChildName(e.target.value)}
              className="w-full bg-[#111111] border border-[#3a3a3a] rounded-xl px-4 py-3 text-white placeholder-gray-600 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all"
              required
            />
          </div>
          
          <div>
            <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1.5 ml-1">Age</label>
            <input
              type="number"
              min="1"
              max="17"
              placeholder="e.g. 12"
              value={newChildAge}
              onChange={(e) => setNewChildAge(e.target.value)}
              className="w-full bg-[#111111] border border-[#3a3a3a] rounded-xl px-4 py-3 text-white placeholder-gray-600 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all"
              required
            />
          </div>

          <div className="flex justify-end gap-3 pt-6">
            <button 
              type="button" 
              onClick={onClose} 
              disabled={isAddingChild}
              className="px-5 py-2.5 text-gray-400 hover:text-white bg-[#222222] hover:bg-[#2b2b2b] rounded-xl font-medium transition-colors disabled:opacity-50"
            >
              Cancel
            </button>
            <button 
              type="submit" 
              disabled={isAddingChild}
              className="flex-1 py-2.5 bg-blue-600 hover:bg-blue-500 text-white font-medium rounded-xl transition-colors shadow-lg shadow-blue-600/20 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {isAddingChild && <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />}
              {isAddingChild ? 'Creating...' : 'Create Profile'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

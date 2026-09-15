import React from 'react';
import { Scanner } from "@yudiel/react-qr-scanner";

interface PairDeviceModalProps {
  onClose: () => void;
  onPair: (e?: React.FormEvent | React.MouseEvent) => void;
  isPairing: boolean;
  pairingError: string;
  setPairingError: (val: string) => void;
  pairingCode: string;
  setPairingCode: (val: string) => void;
  isScanMode: boolean;
  setIsScanMode: (val: boolean) => void;
  handleQRScan: (text: string) => void;
}

export default function PairDeviceModal({
  onClose,
  onPair,
  isPairing,
  pairingError,
  setPairingError,
  pairingCode,
  setPairingCode,
  isScanMode,
  setIsScanMode,
  handleQRScan
}: PairDeviceModalProps) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="bg-[#181818] border border-[#2b2b2b] rounded-3xl p-6 md:p-8 w-full max-w-md shadow-2xl relative overflow-hidden">
        {/* Background Glow */}
        <div className="absolute top-0 right-0 w-32 h-32 bg-blue-600/10 rounded-full blur-[60px] pointer-events-none" />
        
        <div className="relative z-10 text-center mb-6">
          <div className="w-16 h-16 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-lg shadow-blue-500/20 text-white">
            <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 11c0 3.517-1.009 6.799-2.753 9.571m-3.44-2.04l.054-.09A13.916 13.916 0 008 11a4 4 0 118 0c0 1.017-.07 2.019-.203 3m-2.118 6.844A21.88 21.88 0 0015.171 17m3.839 1.132c.645-2.266.99-4.659.99-7.132A8 8 0 008 4.07M3 15.364c.64-1.319 1-2.8 1-4.364 0-1.457.39-2.823 1.07-4" />
            </svg>
          </div>
          <h2 className="text-2xl font-bold text-white mb-1 tracking-tight">Connect Device</h2>
          <p className="text-gray-400 text-sm">
            Scan the QR code shown on the Diamond Browser setup screen.
          </p>
        </div>

        {/* Mode Toggle */}
        <div className="relative z-10 flex bg-[#111111] border border-[#2b2b2b] rounded-xl p-1 mb-6">
          <button 
            onClick={() => setIsScanMode(true)}
            className={`flex-1 py-2 text-sm font-medium rounded-lg transition-all ${isScanMode ? 'bg-[#2b2b2b] text-white shadow' : 'text-gray-500 hover:text-gray-300'}`}
          >
            Scan QR Code
          </button>
          <button 
            onClick={() => setIsScanMode(false)}
            className={`flex-1 py-2 text-sm font-medium rounded-lg transition-all ${!isScanMode ? 'bg-[#2b2b2b] text-white shadow' : 'text-gray-500 hover:text-gray-300'}`}
          >
            Manual PIN
          </button>
        </div>

        {pairingError && <div className="text-red-400 text-sm mb-4 bg-red-500/10 border border-red-500/20 p-3 rounded-xl relative z-10">{pairingError}</div>}
        
        <div className="relative z-10">
          {isScanMode ? (
            <div className="mb-6 rounded-2xl overflow-hidden border border-[#3a3a3a] bg-black relative aspect-square shadow-inner">
              <Scanner 
                onScan={(result) => {
                  if (result && result.length > 0) {
                    handleQRScan(result[0].rawValue);
                  }
                }}
                onError={(err) => {
                  if (err instanceof Error && err.name === 'NotAllowedError') {
                    setPairingError("Camera access denied or requires HTTPS. Use the Manual PIN or the secure tunnel link.");
                  } else {
                    setPairingError("Camera error: " + (err instanceof Error ? err.message : String(err)));
                  }
                }}
                components={{
                  onOff: true,
                  torch: true,
                  zoom: true,
                  finder: true,
                }}
                styles={{
                  container: { width: '100%', height: '100%' }
                }}
              />
              {/* Custom Finder Overlay */}
              <div className="absolute inset-0 pointer-events-none border-[3px] border-blue-500/30 m-8 rounded-xl">
                <div className="absolute top-0 left-0 w-8 h-8 border-t-[3px] border-l-[3px] border-blue-500 -mt-1 -ml-1 rounded-tl-xl"></div>
                <div className="absolute top-0 right-0 w-8 h-8 border-t-[3px] border-r-[3px] border-blue-500 -mt-1 -mr-1 rounded-tr-xl"></div>
                <div className="absolute bottom-0 left-0 w-8 h-8 border-b-[3px] border-l-[3px] border-blue-500 -mb-1 -ml-1 rounded-bl-xl"></div>
                <div className="absolute bottom-0 right-0 w-8 h-8 border-b-[3px] border-r-[3px] border-blue-500 -mb-1 -mr-1 rounded-br-xl"></div>
              </div>
            </div>
          ) : (
            <form onSubmit={onPair} className="mb-6">
              <input
                type="text"
                placeholder="000-000"
                value={pairingCode}
                onChange={(e) => setPairingCode(e.target.value)}
                className="w-full bg-[#111111] border border-[#3a3a3a] rounded-xl px-4 py-4 text-center text-2xl font-mono text-white placeholder-gray-700 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 mb-6 uppercase tracking-[0.5em] transition-all"
                required
              />
            </form>
          )}
        </div>

        <div className="flex justify-end gap-3 relative z-10">
          <button type="button" onClick={onClose} disabled={isPairing} className="px-5 py-3 text-gray-400 hover:text-white bg-[#222222] hover:bg-[#2b2b2b] rounded-xl font-medium transition-colors w-1/3 disabled:opacity-50">Cancel</button>
          {!isScanMode && (
            <button onClick={onPair} disabled={isPairing} className="flex-1 bg-blue-600 hover:bg-blue-500 text-white font-medium rounded-xl transition-colors shadow-lg shadow-blue-600/20 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2">
              {isPairing && <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />}
              {isPairing ? 'Connecting...' : 'Connect Device'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

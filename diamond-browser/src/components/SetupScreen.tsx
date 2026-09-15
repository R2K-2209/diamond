import { useState, useEffect } from 'react';
import { db } from '../firebase';
import { doc, setDoc, deleteDoc, onSnapshot, serverTimestamp } from 'firebase/firestore';
import QRCode from 'react-qr-code';

export function SetupScreen({ onPaired }: { onPaired: () => void }) {
  const [pairingCode, setPairingCode] = useState<string>('');
  const [error, setError] = useState<string>('');
  const [timeLeft, setTimeLeft] = useState(60);

  // Helper to generate a new code
  const generateCode = () => {
    const raw = Math.floor(100000 + Math.random() * 900000).toString();
    return `${raw.slice(0, 3)}-${raw.slice(3)}`;
  };

  useEffect(() => {
    let currentCode = generateCode();
    setPairingCode(currentCode);
    setTimeLeft(60);

    let docUnsub: () => void;
    let timer: NodeJS.Timeout;

    const createAndListen = async (code: string) => {
      const docRef = doc(db, 'pairing_codes', code);
      try {
        await setDoc(docRef, {
          status: 'pending',
          createdAt: serverTimestamp(),
          userAgent: navigator.userAgent
        });

        docUnsub = onSnapshot(docRef, async (snapshot) => {
          if (snapshot.exists()) {
            const data = snapshot.data();
            if (data.status === 'paired' && data.childId) {
              const success = await window.electronAPI?.saveConfig?.({
                childId: data.childId,
                parentId: data.parentId,
                pairedAt: new Date().toISOString()
              });
              if (success) {
                onPaired();
              } else {
                setError('Failed to save pairing configuration to device.');
              }
            }
          }
        });
      } catch (err) {
        console.error('Failed to create pairing code:', err);
        setError('Failed to connect to Diamond servers. Please check your internet connection.');
      }
    };

    createAndListen(currentCode);

    timer = setInterval(async () => {
      setTimeLeft((prev) => {
        if (prev <= 1) {
          // Time expired, rotate code
          if (currentCode) {
            deleteDoc(doc(db, 'pairing_codes', currentCode)).catch(() => {});
          }
          if (docUnsub) docUnsub();
          
          const newCode = generateCode();
          currentCode = newCode;
          setPairingCode(newCode);
          createAndListen(newCode);
          return 60;
        }
        return prev - 1;
      });
    }, 1000);

    return () => {
      clearInterval(timer);
      if (docUnsub) docUnsub();
      if (currentCode) {
        deleteDoc(doc(db, 'pairing_codes', currentCode)).catch(() => {});
      }
    };
  }, []);

  // For the QR code, use the public localtunnel URL so it bypasses all Windows Firewall issues!
  const qrData = `https://quiet-ears-warn.loca.lt/pair?code=${pairingCode}`;
  
  // Calculate stroke dashoffset for the countdown ring
  const circleCircumference = 2 * Math.PI * 18;
  const strokeDashoffset = circleCircumference - (timeLeft / 60) * circleCircumference;

  return (
    <div className="flex h-screen w-screen bg-[#101010] text-gray-200 select-none font-sans overflow-hidden relative">
      
      {/* Draggable Titlebar Area (matches electron titleBarOverlay) */}
      <div className="absolute top-0 left-0 right-0 h-[38px] z-50" style={{ WebkitAppRegion: 'drag' } as React.CSSProperties} />

      {/* Decorative Outer Glow */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-white/5 rounded-full blur-[120px] pointer-events-none" />

      <div className="flex w-full max-w-[1000px] mx-auto bg-[#18181a] rounded-[2rem] overflow-hidden my-auto border border-white/10 relative z-10 shadow-[0_0_60px_rgba(255,255,255,0.03)]" style={{ height: '75vh' }}>
        
        {/* Left Pane - Instructions */}
        <div className="w-1/2 p-16 flex flex-col justify-center border-r border-white/5 bg-[#141415]">
          <div className="w-14 h-14 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-2xl flex items-center justify-center mb-10 shadow-lg shadow-blue-500/20">
            <span className="text-white text-2xl">💎</span>
          </div>
          
          <h1 className="text-4xl font-semibold mb-6 tracking-tight text-white">
            Set up Diamond<br/>Browser
          </h1>
          
          <p className="text-lg text-gray-400 mb-10 leading-relaxed max-w-md">
            This browser is currently locked to ensure a safe environment. To activate it, pair this device from your Parent Dashboard.
          </p>

          <div className="space-y-8">
            <div className="flex gap-4 items-start">
              <div className="w-8 h-8 rounded-full bg-white/10 text-blue-400 flex items-center justify-center font-semibold text-sm shrink-0 border border-white/5">1</div>
              <div>
                <h3 className="font-medium text-gray-200 mb-1">Open Parent Dashboard</h3>
                <p className="text-sm text-gray-500">Log in to your dashboard on your phone or another computer.</p>
              </div>
            </div>
            <div className="flex gap-4 items-start">
              <div className="w-8 h-8 rounded-full bg-white/10 text-blue-400 flex items-center justify-center font-semibold text-sm shrink-0 border border-white/5">2</div>
              <div>
                <h3 className="font-medium text-gray-200 mb-1">Select Child Profile</h3>
                <p className="text-sm text-gray-500">Click on "Pair Device" under the profile for this child.</p>
              </div>
            </div>
            <div className="flex gap-4 items-start">
              <div className="w-8 h-8 rounded-full bg-white/10 text-blue-400 flex items-center justify-center font-semibold text-sm shrink-0 border border-white/5">3</div>
              <div>
                <h3 className="font-medium text-gray-200 mb-1">Scan or Enter Code</h3>
                <p className="text-sm text-gray-500">Use your phone's camera to scan the QR code, or type the 6-digit code.</p>
              </div>
            </div>
          </div>
        </div>

        {/* Right Pane - QR & Code */}
        <div className="w-1/2 p-16 flex flex-col items-center justify-center bg-[#18181a] relative">
          
          {error ? (
            <div className="bg-red-500/10 text-red-400 p-6 rounded-2xl border border-red-500/20 max-w-sm text-center">
              <svg className="w-8 h-8 mx-auto mb-3 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
              {error}
            </div>
          ) : (
            <>
              {/* QR Code Container */}
              <div className="bg-white p-4 rounded-3xl shadow-[0_8px_30px_rgb(0,0,0,0.2)] mb-10 transition-all border-4 border-[#252525]">
                {pairingCode ? (
                  <QRCode 
                    value={qrData} 
                    size={200}
                    level="H"
                    fgColor="#000000"
                    bgColor="#FFFFFF"
                  />
                ) : (
                  <div className="w-[200px] h-[200px] flex items-center justify-center bg-gray-100 rounded-xl">
                    <div className="w-8 h-8 border-4 border-gray-300 border-t-blue-600 rounded-full animate-spin"></div>
                  </div>
                )}
              </div>

              {/* 6 Digit Code */}
              <div className="text-center w-full max-w-[280px]">
                <p className="text-xs font-bold tracking-[0.2em] text-gray-500 uppercase mb-3">Or enter code manually</p>
                <div className="text-4xl font-mono font-medium tracking-[0.25em] text-white bg-[#111111] py-4 rounded-2xl border border-white/10 shadow-inner">
                  {pairingCode || '------'}
                </div>
              </div>

              {/* Countdown Timer */}
              <div className="absolute top-8 right-8 flex items-center gap-3 text-xs text-gray-400 bg-white/5 px-4 py-2 rounded-full border border-white/10 shadow-sm">
                <span>Refreshes in {timeLeft}s</span>
                <div className="relative w-5 h-5">
                  <svg className="w-5 h-5 -rotate-90 transform" viewBox="0 0 40 40">
                    <circle cx="20" cy="20" r="18" fill="none" stroke="rgba(255,255,255,0.1)" strokeWidth="4" />
                    <circle 
                      cx="20" cy="20" r="18" fill="none" stroke="#3b82f6" strokeWidth="4" 
                      strokeDasharray={circleCircumference}
                      strokeDashoffset={strokeDashoffset}
                      strokeLinecap="round"
                      className="transition-all duration-1000 ease-linear"
                    />
                  </svg>
                </div>
              </div>
            </>
          )}

          {/* Connection Status */}
          <div className="absolute bottom-10 flex items-center justify-center gap-2 text-sm text-gray-500 font-medium">
            <div className="w-2 h-2 rounded-full bg-blue-500 animate-pulse shadow-[0_0_10px_rgba(59,130,246,0.6)]"></div>
            Waiting for connection...
          </div>
        </div>

      </div>
    </div>
  );
}

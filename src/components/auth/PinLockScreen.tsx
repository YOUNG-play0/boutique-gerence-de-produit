import React, { useState, useEffect, useRef } from 'react';
import { Lock, Delete, RotateCcw, AlertTriangle, ShieldCheck } from 'lucide-react';
import { checkPin } from '../../services/db';
import { playBeep, playSuccessChime, triggerHaptic } from '../../utils/formatters';

interface PinLockScreenProps {
  shopName: string;
  onUnlock: () => void;
}

export const PinLockScreen: React.FC<PinLockScreenProps> = ({ shopName, onUnlock }) => {
  const [pin, setPin] = useState('');
  const [errorCount, setErrorCount] = useState(0);
  const [lockoutSeconds, setLockoutSeconds] = useState(0);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isVerifying, setIsVerifying] = useState(false);
  const [shake, setShake] = useState(false);

  const lockoutTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Manage 30-second lockout countdown
  useEffect(() => {
    if (lockoutSeconds > 0) {
      lockoutTimerRef.current = setTimeout(() => {
        setLockoutSeconds((prev) => prev - 1);
      }, 1000);
    } else if (lockoutSeconds === 0 && errorCount >= 5) {
      setErrorCount(0);
      setErrorMessage(null);
    }
    return () => {
      if (lockoutTimerRef.current) clearTimeout(lockoutTimerRef.current);
    };
  }, [lockoutSeconds, errorCount]);

  const handleDigit = async (digit: string) => {
    if (lockoutSeconds > 0 || isVerifying || pin.length >= 4) return;

    playBeep();
    triggerHaptic(35);

    const nextPin = pin + digit;
    setPin(nextPin);

    if (nextPin.length === 4) {
      setIsVerifying(true);
      const isValid = await checkPin(nextPin);

      if (isValid) {
        playSuccessChime();
        triggerHaptic(60);
        setErrorCount(0);
        setErrorMessage(null);
        onUnlock();
      } else {
        triggerHaptic(120);
        setShake(true);
        setTimeout(() => setShake(false), 500);

        const nextErrors = errorCount + 1;
        setErrorCount(nextErrors);
        setPin('');

        if (nextErrors >= 5) {
          setLockoutSeconds(30);
          setErrorMessage('Trop de tentatives erronées. Clavier bloqué pendant 30 secondes.');
        } else {
          setErrorMessage(`Code PIN incorrect (${nextErrors}/5).`);
        }
      }
      setIsVerifying(false);
    }
  };

  const handleBackspace = () => {
    if (lockoutSeconds > 0 || isVerifying || pin.length === 0) return;
    triggerHaptic(20);
    setPin((prev) => prev.slice(0, -1));
    setErrorMessage(null);
  };

  const handleClear = () => {
    if (lockoutSeconds > 0 || isVerifying) return;
    triggerHaptic(25);
    setPin('');
    setErrorMessage(null);
  };

  return (
    <div className="fixed inset-0 z-50 flex flex-col justify-between items-center bg-gradient-to-b from-amber-900 via-amber-950 to-slate-950 text-white p-6 sm:p-8 select-none">
      {/* Top Header */}
      <div className="w-full max-w-sm flex flex-col items-center pt-4 sm:pt-8 text-center">
        <div className="w-16 h-16 rounded-3xl bg-amber-600/30 border border-amber-500/40 text-amber-400 flex items-center justify-center shadow-lg shadow-black/40 mb-3">
          <Lock className="w-7 h-7" />
        </div>

        <h1 className="text-xl sm:text-2xl font-black text-white tracking-tight">
          {shopName || 'Boutique'}
        </h1>
        <p className="text-xs text-amber-200/80 font-medium mt-1">
          Entrez votre code PIN à 4 chiffres
        </p>

        {/* 4 PIN Dots */}
        <div
          className={`flex items-center gap-4 my-6 ${
            shake ? 'animate-bounce text-rose-400' : ''
          }`}
        >
          {[0, 1, 2, 3].map((index) => {
            const isFilled = pin.length > index;
            return (
              <div
                key={index}
                className={`w-4 h-4 rounded-full transition-all duration-200 ${
                  isFilled
                    ? 'bg-amber-400 scale-125 shadow-md shadow-amber-400/50'
                    : 'border-2 border-amber-300/40 bg-transparent'
                }`}
              />
            );
          })}
        </div>

        {/* Status / Error Message */}
        {lockoutSeconds > 0 ? (
          <div className="p-3 bg-rose-950/80 border border-rose-800 text-rose-300 rounded-2xl text-xs font-bold flex items-center gap-2 animate-pulse">
            <AlertTriangle className="w-4 h-4 flex-shrink-0 text-rose-400" />
            <span>Saisie bloquée : réessayez dans {lockoutSeconds}s</span>
          </div>
        ) : errorMessage ? (
          <div className="text-xs font-bold text-rose-400 bg-rose-950/60 px-3 py-1.5 rounded-full border border-rose-800/60">
            {errorMessage}
          </div>
        ) : (
          <div className="text-[11px] text-amber-200/50 flex items-center gap-1">
            <ShieldCheck className="w-3.5 h-3.5" />
            <span>Caisse sécurisée</span>
          </div>
        )}
      </div>

      {/* Tactile Big Number Keypad (3x4 grid) */}
      <div className="w-full max-w-xs pb-4 sm:pb-8">
        <div className="grid grid-cols-3 gap-3 sm:gap-4">
          {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((digit) => (
            <button
              key={digit}
              type="button"
              disabled={lockoutSeconds > 0 || isVerifying}
              onClick={() => handleDigit(digit)}
              className="h-16 sm:h-18 rounded-3xl bg-white/10 hover:bg-white/20 active:scale-95 text-white font-black text-2xl sm:text-3xl flex items-center justify-center transition shadow-md shadow-black/20 border border-white/5 disabled:opacity-30 disabled:pointer-events-none"
            >
              {digit}
            </button>
          ))}

          {/* Clear all */}
          <button
            type="button"
            disabled={lockoutSeconds > 0 || isVerifying || pin.length === 0}
            onClick={handleClear}
            className="h-16 sm:h-18 rounded-3xl bg-white/5 hover:bg-white/15 active:scale-95 text-amber-200 text-xs font-bold flex flex-col items-center justify-center transition disabled:opacity-20"
            title="Effacer tout"
          >
            <RotateCcw className="w-5 h-5 mb-0.5" />
            <span>Effacer</span>
          </button>

          {/* Zero */}
          <button
            type="button"
            disabled={lockoutSeconds > 0 || isVerifying}
            onClick={() => handleDigit('0')}
            className="h-16 sm:h-18 rounded-3xl bg-white/10 hover:bg-white/20 active:scale-95 text-white font-black text-2xl sm:text-3xl flex items-center justify-center transition shadow-md shadow-black/20 border border-white/5 disabled:opacity-30 disabled:pointer-events-none"
          >
            0
          </button>

          {/* Backspace */}
          <button
            type="button"
            disabled={lockoutSeconds > 0 || isVerifying || pin.length === 0}
            onClick={handleBackspace}
            className="h-16 sm:h-18 rounded-3xl bg-white/5 hover:bg-white/15 active:scale-95 text-amber-200 flex items-center justify-center transition disabled:opacity-20"
            title="Retour arrière"
          >
            <Delete className="w-6 h-6" />
          </button>
        </div>
      </div>
    </div>
  );
};

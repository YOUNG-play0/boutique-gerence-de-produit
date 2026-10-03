import React, { useState } from 'react';
import { Download, Smartphone, X } from 'lucide-react';
import { usePWAInstall } from '../../hooks/usePWAInstall';

export const PWAInstallButton: React.FC = () => {
  const { isInstallable, isInstalled, isIOS, install } = usePWAInstall();
  const [showIOSGuide, setShowIOSGuide] = useState(false);

  // If already installed, hide
  if (isInstalled) {
    return null;
  }

  // Android / Chrome / Edge install prompt
  if (isInstallable) {
    return (
      <button
        onClick={install}
        className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-amber-500 hover:bg-amber-600 text-white font-medium text-xs shadow-sm transition active:scale-95"
        title="Installer l'application sur votre téléphone"
      >
        <Download className="w-3.5 h-3.5" />
        <span>Installer l'App</span>
      </button>
    );
  }

  // iOS Safari flow
  if (isIOS) {
    return (
      <>
        <button
          onClick={() => setShowIOSGuide(true)}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-amber-500 hover:bg-amber-600 text-white font-medium text-xs shadow-sm transition active:scale-95"
          title="Installer sur iPhone"
        >
          <Smartphone className="w-3.5 h-3.5" />
          <span>Installer</span>
        </button>

        {showIOSGuide && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 animate-in fade-in duration-200">
            <div className="w-full max-w-sm rounded-2xl bg-white p-5 shadow-2xl text-slate-800">
              <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                <div className="flex items-center gap-2">
                  <span className="text-xl">📲</span>
                  <h3 className="text-base font-bold text-slate-900">Installer sur iPhone / iPad</h3>
                </div>
                <button
                  onClick={() => setShowIOSGuide(false)}
                  className="p-1.5 rounded-full text-slate-400 hover:bg-slate-100"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="mt-4 space-y-3 text-sm text-slate-600">
                <div className="flex items-start gap-3 bg-amber-50 p-3 rounded-xl border border-amber-100">
                  <span className="flex-shrink-0 w-6 h-6 rounded-full bg-amber-600 text-white flex items-center justify-center font-bold text-xs">1</span>
                  <p>Appuyez sur le bouton <strong>Partager</strong> en bas de Safari (icône rectangle avec flèche vers le haut <span className="inline-block text-base">⬆️</span>).</p>
                </div>
                <div className="flex items-start gap-3 bg-amber-50 p-3 rounded-xl border border-amber-100">
                  <span className="flex-shrink-0 w-6 h-6 rounded-full bg-amber-600 text-white flex items-center justify-center font-bold text-xs">2</span>
                  <p>Faites défiler vers le bas et touchez <strong>« Sur l'écran d'accueil »</strong>.</p>
                </div>
                <div className="flex items-start gap-3 bg-amber-50 p-3 rounded-xl border border-amber-100">
                  <span className="flex-shrink-0 w-6 h-6 rounded-full bg-amber-600 text-white flex items-center justify-center font-bold text-xs">3</span>
                  <p>Validez en haut à droite avec <strong>« Ajouter »</strong>. L'application fonctionnera sans connexion !</p>
                </div>
              </div>

              <button
                onClick={() => setShowIOSGuide(false)}
                className="mt-5 w-full py-3 rounded-xl bg-amber-600 text-white font-bold text-sm hover:bg-amber-700 transition"
              >
                J'ai compris
              </button>
            </div>
          </div>
        )}
      </>
    );
  }

  return null;
};

import React, { useRef } from 'react';
import { Download, HelpCircle, X, Smartphone } from 'lucide-react';

interface PWAInstallBannerProps {
  isInstalled: boolean;
  isIOS: boolean;
  isInstallable: boolean;
  isDismissed: boolean;
  shouldHide: boolean;
  onInstall: () => void;
  onShowIOSGuide: () => void;
  onDismiss: () => void;
}

export const PWAInstallBanner: React.FC<PWAInstallBannerProps> = ({
  isInstalled,
  isIOS,
  isInstallable,
  isDismissed,
  shouldHide,
  onInstall,
  onShowIOSGuide,
  onDismiss,
}) => {
  const touchStartY = useRef<number | null>(null);

  // Conditions d'affichage strictes :
  // 1. Ne pas afficher si déjà installée
  // 2. Ne pas afficher si fermée / remise à plus tard (dans les 7 jours)
  // 3. Ne pas afficher si masquée (vente avec panier plein, scanner QR ouvert, etc.)
  // 4. Doit être installable (événement Android reçu OU environnement iOS)
  if (isInstalled || isDismissed || shouldHide) {
    return null;
  }

  // Si ni Android/Chrome installable ni iOS, ne rien afficher
  if (!isInstallable && !isIOS) {
    return null;
  }

  // Fermeture par geste de balayage vers le bas (swipe down)
  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartY.current = e.touches[0].clientY;
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    if (touchStartY.current === null) return;
    const touchEndY = e.changedTouches[0].clientY;
    const diff = touchEndY - touchStartY.current;
    if (diff > 40) {
      // Glissement vers le bas détecté -> fermer la bannière
      onDismiss();
    }
    touchStartY.current = null;
  };

  return (
    <aside
      aria-label="Invitation d'installation"
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
      className="fixed bottom-20 left-3 right-3 sm:left-auto sm:right-4 z-40 max-w-md mx-auto sm:mx-0 bg-white/95 backdrop-blur-md rounded-3xl p-3.5 border border-amber-200/90 shadow-xl shadow-amber-950/15 animate-in slide-in-from-bottom-5 duration-300 select-none"
    >
      <div className="flex items-start gap-3">
        {/* Icône App */}
        <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-amber-500 to-amber-600 flex items-center justify-center flex-shrink-0 text-white shadow-md shadow-amber-600/30">
          <Smartphone className="w-5 h-5" />
        </div>

        {/* Message */}
        <div className="flex-1 min-w-0 pr-1">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-black uppercase text-amber-800 tracking-wider">
              Application Caisse & Stock
            </span>
            <button
              onClick={onDismiss}
              className="p-1 -mr-1 -mt-1 rounded-full text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition"
              title="Fermer"
              aria-label="Fermer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <p className="text-xs text-slate-700 leading-snug mt-1 font-medium">
            Installez l'app sur votre écran d'accueil pour y accéder plus vite, même sans internet.
          </p>

          {/* Boutons d'action */}
          <div className="mt-3 flex items-center gap-2">
            {isInstallable ? (
              <button
                type="button"
                onClick={onInstall}
                className="flex-1 py-2.5 px-3 bg-amber-600 hover:bg-amber-700 active:scale-95 text-white font-bold text-xs rounded-xl shadow-sm shadow-amber-600/30 flex items-center justify-center gap-1.5 transition"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Installer</span>
              </button>
            ) : isIOS ? (
              <button
                type="button"
                onClick={onShowIOSGuide}
                className="flex-1 py-2.5 px-3 bg-amber-600 hover:bg-amber-700 active:scale-95 text-white font-bold text-xs rounded-xl shadow-sm shadow-amber-600/30 flex items-center justify-center gap-1.5 transition"
              >
                <HelpCircle className="w-3.5 h-3.5" />
                <span>Comment faire ?</span>
              </button>
            ) : null}

            <button
              type="button"
              onClick={onDismiss}
              className="py-2.5 px-3 bg-slate-100 hover:bg-slate-200 active:scale-95 text-slate-600 font-bold text-xs rounded-xl transition"
            >
              Plus tard
            </button>
          </div>
        </div>
      </div>
    </aside>
  );
};

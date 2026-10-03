import React from 'react';
import { X, Share, PlusSquare, CheckCircle2, Smartphone } from 'lucide-react';

interface IOSInstallModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const IOSInstallModal: React.FC<IOSInstallModalProps> = ({ isOpen, onClose }) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 animate-in fade-in duration-200">
      <div className="w-full max-w-sm rounded-3xl bg-white p-5 shadow-2xl text-slate-800 animate-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="flex items-center justify-between pb-3 border-b border-slate-100">
          <div className="flex items-center gap-2">
            <div className="w-9 h-9 rounded-2xl bg-amber-100 text-amber-800 flex items-center justify-center font-black">
              <Smartphone className="w-5 h-5 text-amber-700" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-slate-900 leading-tight">
                Installer sur iPhone / iPad
              </h3>
              <p className="text-[11px] text-slate-400">Ajout sur l'écran d'accueil Safari</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-full text-slate-400 hover:bg-slate-100 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Introduction */}
        <p className="mt-3 text-xs text-slate-600 leading-relaxed">
          Pour utiliser l'application comme une vraie application sans la barre Safari et y accéder plus vite, même sans connexion :
        </p>

        {/* Steps */}
        <div className="mt-3.5 space-y-3">
          {/* Étape 1 */}
          <div className="flex items-start gap-3 p-3 rounded-2xl bg-amber-50/70 border border-amber-200/80">
            <div className="w-6 h-6 rounded-full bg-amber-600 text-white flex items-center justify-center text-xs font-black flex-shrink-0 mt-0.5 shadow-xs">
              1
            </div>
            <div className="flex-1 text-xs">
              <div className="font-bold text-slate-900 flex items-center gap-1.5">
                <span>Bouton Partager</span>
                <span className="p-1 rounded-md bg-white border border-amber-200 text-amber-700 inline-flex shadow-2xs">
                  <Share className="w-3.5 h-3.5" />
                </span>
              </div>
              <p className="text-slate-600 mt-0.5 leading-normal">
                En bas de l'écran dans <strong>Safari</strong>, touchez le bouton <strong>Partager</strong> (le carré avec la flèche vers le haut).
              </p>
            </div>
          </div>

          {/* Étape 2 */}
          <div className="flex items-start gap-3 p-3 rounded-2xl bg-amber-50/70 border border-amber-200/80">
            <div className="w-6 h-6 rounded-full bg-amber-600 text-white flex items-center justify-center text-xs font-black flex-shrink-0 mt-0.5 shadow-xs">
              2
            </div>
            <div className="flex-1 text-xs">
              <div className="font-bold text-slate-900 flex items-center gap-1.5">
                <span>« Sur l'écran d'accueil »</span>
                <span className="p-1 rounded-md bg-white border border-amber-200 text-amber-700 inline-flex shadow-2xs">
                  <PlusSquare className="w-3.5 h-3.5" />
                </span>
              </div>
              <p className="text-slate-600 mt-0.5 leading-normal">
                Faites défiler le menu des options vers le bas et choisissez <strong>« Sur l'écran d'accueil »</strong>.
              </p>
            </div>
          </div>

          {/* Étape 3 */}
          <div className="flex items-start gap-3 p-3 rounded-2xl bg-amber-50/70 border border-amber-200/80">
            <div className="w-6 h-6 rounded-full bg-amber-600 text-white flex items-center justify-center text-xs font-black flex-shrink-0 mt-0.5 shadow-xs">
              3
            </div>
            <div className="flex-1 text-xs">
              <div className="font-bold text-slate-900 flex items-center gap-1.5">
                <span>Toucher « Ajouter »</span>
                <span className="p-1 rounded-md bg-white border border-amber-200 text-emerald-600 inline-flex shadow-2xs">
                  <CheckCircle2 className="w-3.5 h-3.5" />
                </span>
              </div>
              <p className="text-slate-600 mt-0.5 leading-normal">
                En haut à droite de l'écran, touchez <strong>« Ajouter »</strong> pour terminer.
              </p>
            </div>
          </div>
        </div>

        {/* Bouton Fermer */}
        <button
          onClick={onClose}
          className="mt-4 w-full py-3 bg-amber-600 hover:bg-amber-700 text-white font-bold text-xs rounded-xl shadow-md transition"
        >
          J'ai compris
        </button>
      </div>
    </div>
  );
};

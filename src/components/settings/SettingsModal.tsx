import React, { useState } from 'react';
import { X, Settings, KeyRound, Check, Lock, AlertCircle, CheckCircle2, Download, Smartphone } from 'lucide-react';
import { ShopSettings } from '../../types';
import { updateShopSettings, changeShopPin } from '../../services/db';
import { triggerHaptic } from '../../utils/formatters';

interface SettingsModalProps {
  isOpen: boolean;
  settings: ShopSettings;
  onClose: () => void;
  onSettingsUpdated: (newSettings: ShopSettings) => void;
  onLockScreen: () => void;
  isInstalled?: boolean;
  isIOS?: boolean;
  onInstall?: () => void;
  onShowIOSGuide?: () => void;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({
  isOpen,
  settings,
  onClose,
  onSettingsUpdated,
  onLockScreen,
  isInstalled = false,
  isIOS = false,
  onInstall,
  onShowIOSGuide,
}) => {
  const [shopName, setShopName] = useState(settings.shopName);
  const [shopOwner, setShopOwner] = useState(settings.shopOwner);
  const [phone, setPhone] = useState(settings.phone);
  const [address, setAddress] = useState(settings.address);

  // PIN change state
  const [oldPin, setOldPin] = useState('');
  const [newPin, setNewPin] = useState('');
  const [confirmNewPin, setConfirmNewPin] = useState('');

  const [infoError, setInfoError] = useState<string | null>(null);
  const [infoSuccess, setInfoSuccess] = useState<string | null>(null);

  const [pinError, setPinError] = useState<string | null>(null);
  const [pinSuccess, setPinSuccess] = useState<string | null>(null);

  const [isSubmittingInfo, setIsSubmittingInfo] = useState(false);
  const [isSubmittingPin, setIsSubmittingPin] = useState(false);

  if (!isOpen) return null;

  const handleUpdateInfo = async (e: React.FormEvent) => {
    e.preventDefault();
    setInfoError(null);
    setInfoSuccess(null);

    if (!shopName.trim()) {
      setInfoError('Le nom de la boutique est obligatoire.');
      return;
    }

    try {
      setIsSubmittingInfo(true);
      const updated = await updateShopSettings({
        shopName: shopName.trim(),
        shopOwner: shopOwner.trim(),
        phone: phone.trim(),
        address: address.trim(),
      });
      triggerHaptic(50);
      setInfoSuccess('Informations enregistrées avec succès !');
      onSettingsUpdated(updated);
      setTimeout(() => setInfoSuccess(null), 3000);
    } catch (err: unknown) {
      setInfoError(err instanceof Error ? err.message : 'Erreur lors de la mise à jour.');
    } finally {
      setIsSubmittingInfo(false);
    }
  };

  const handleChangePin = async (e: React.FormEvent) => {
    e.preventDefault();
    setPinError(null);
    setPinSuccess(null);

    if (!/^\d{4}$/.test(oldPin)) {
      setPinError("L'ancien code PIN doit comporter 4 chiffres.");
      return;
    }
    if (!/^\d{4}$/.test(newPin)) {
      setPinError('Le nouveau code PIN doit comporter 4 chiffres.');
      return;
    }
    if (newPin !== confirmNewPin) {
      setPinError('Les deux nouveaux codes PIN ne correspondent pas.');
      return;
    }

    try {
      setIsSubmittingPin(true);
      const success = await changeShopPin(oldPin, newPin);
      if (!success) {
        setPinError("L'ancien code PIN est incorrect.");
        return;
      }

      triggerHaptic(60);
      setPinSuccess('Code PIN modifié avec succès !');
      setOldPin('');
      setNewPin('');
      setConfirmNewPin('');
      setTimeout(() => setPinSuccess(null), 3000);
    } catch (err: unknown) {
      setPinError(err instanceof Error ? err.message : 'Erreur lors du changement de PIN.');
    } finally {
      setIsSubmittingPin(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 animate-in fade-in duration-200">
      <div className="w-full max-w-md rounded-3xl bg-white p-6 shadow-2xl text-slate-800 max-h-[90vh] overflow-y-auto space-y-5">
        {/* Header */}
        <div className="flex items-center justify-between pb-3 border-b border-slate-100">
          <div className="flex items-center gap-2">
            <div className="p-2 rounded-xl bg-amber-100 text-amber-700">
              <Settings className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-900">Paramètres de la Boutique</h3>
              <p className="text-xs text-slate-400">Coordonnées et sécurité</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-full text-slate-400 hover:bg-slate-100 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Bouton Verrouiller immédiatement */}
        <button
          type="button"
          onClick={() => {
            onClose();
            onLockScreen();
          }}
          className="w-full py-3 px-4 rounded-2xl bg-amber-50 hover:bg-amber-100 border border-amber-200 text-amber-900 font-bold text-xs flex items-center justify-center gap-2 active:scale-95 transition"
        >
          <Lock className="w-4 h-4 text-amber-700" />
          <span>Verrouiller la caisse maintenant</span>
        </button>

        {/* Ligne : Installer l'application */}
        <div className="p-3.5 rounded-2xl bg-slate-50 border border-slate-200 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <div
              className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 ${
                isInstalled
                  ? 'bg-emerald-100 text-emerald-700'
                  : 'bg-amber-600 text-white shadow-xs'
              }`}
            >
              {isInstalled ? (
                <CheckCircle2 className="w-5 h-5" />
              ) : (
                <Smartphone className="w-5 h-5" />
              )}
            </div>
            <div className="min-w-0">
              <div className="text-xs font-bold text-slate-900 leading-tight">
                Installer l'application
              </div>
              <div className="text-[11px] text-slate-500 truncate">
                {isInstalled
                  ? 'App déjà installée sur cet appareil'
                  : 'Accès rapide et mode hors-ligne'}
              </div>
            </div>
          </div>

          {isInstalled ? (
            <span className="text-[11px] font-black text-emerald-700 bg-emerald-100 px-2.5 py-1 rounded-full whitespace-nowrap flex items-center gap-1">
              <Check className="w-3.5 h-3.5" />
              <span>App déjà installée</span>
            </span>
          ) : (
            <button
              type="button"
              onClick={() => {
                if (isIOS) {
                  onShowIOSGuide?.();
                } else if (onInstall) {
                  onInstall();
                } else {
                  onShowIOSGuide?.();
                }
              }}
              className="py-2 px-3 bg-amber-600 hover:bg-amber-700 active:scale-95 text-white font-bold text-xs rounded-xl shadow-xs transition whitespace-nowrap flex items-center gap-1.5"
            >
              <Download className="w-3.5 h-3.5" />
              <span>{isIOS ? 'Comment faire ?' : 'Installer'}</span>
            </button>
          )}
        </div>

        {/* Section 1 : Informations de la boutique */}
        <form onSubmit={handleUpdateInfo} className="space-y-3">
          <h4 className="text-xs font-black uppercase text-slate-500 tracking-wider">
            Informations générales
          </h4>

          {infoError && (
            <div className="p-2.5 bg-rose-50 text-rose-700 rounded-xl text-xs font-semibold border border-rose-200 flex items-center gap-1.5">
              <AlertCircle className="w-4 h-4 flex-shrink-0 text-rose-500" />
              <span>{infoError}</span>
            </div>
          )}

          {infoSuccess && (
            <div className="p-2.5 bg-emerald-50 text-emerald-800 rounded-xl text-xs font-semibold border border-emerald-200 flex items-center gap-1.5">
              <CheckCircle2 className="w-4 h-4 flex-shrink-0 text-emerald-600" />
              <span>{infoSuccess}</span>
            </div>
          )}

          <div>
            <label className="text-xs font-bold text-slate-700 block mb-1">
              Nom de la boutique
            </label>
            <input
              type="text"
              required
              value={shopName}
              onChange={(e) => setShopName(e.target.value)}
              className="w-full p-3 text-xs bg-slate-50 border border-slate-300 rounded-xl font-semibold focus:outline-none focus:border-amber-500 focus:bg-white"
            />
          </div>

          <div>
            <label className="text-xs font-bold text-slate-700 block mb-1">
              Nom du gérant / propriétaire
            </label>
            <input
              type="text"
              value={shopOwner}
              onChange={(e) => setShopOwner(e.target.value)}
              className="w-full p-3 text-xs bg-slate-50 border border-slate-300 rounded-xl font-semibold focus:outline-none focus:border-amber-500 focus:bg-white"
            />
          </div>

          <div>
            <label className="text-xs font-bold text-slate-700 block mb-1">
              Numéro de téléphone
            </label>
            <input
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              className="w-full p-3 text-xs bg-slate-50 border border-slate-300 rounded-xl font-semibold focus:outline-none focus:border-amber-500 focus:bg-white"
            />
          </div>

          <div>
            <label className="text-xs font-bold text-slate-700 block mb-1">
              Marché ou adresse
            </label>
            <input
              type="text"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              className="w-full p-3 text-xs bg-slate-50 border border-slate-300 rounded-xl font-semibold focus:outline-none focus:border-amber-500 focus:bg-white"
            />
          </div>

          <button
            type="submit"
            disabled={isSubmittingInfo}
            className="w-full py-3 bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs rounded-xl shadow-xs transition"
          >
            Enregistrer les coordonnées
          </button>
        </form>

        {/* Section 2 : Changer le code PIN */}
        <form onSubmit={handleChangePin} className="pt-4 border-t border-slate-200 space-y-3">
          <div className="flex items-center gap-2 text-xs font-black uppercase text-amber-900 tracking-wider">
            <KeyRound className="w-4 h-4 text-amber-600" />
            <span>Changer le code PIN</span>
          </div>

          {pinError && (
            <div className="p-2.5 bg-rose-50 text-rose-700 rounded-xl text-xs font-semibold border border-rose-200 flex items-center gap-1.5">
              <AlertCircle className="w-4 h-4 flex-shrink-0 text-rose-500" />
              <span>{pinError}</span>
            </div>
          )}

          {pinSuccess && (
            <div className="p-2.5 bg-emerald-50 text-emerald-800 rounded-xl text-xs font-semibold border border-emerald-200 flex items-center gap-1.5">
              <CheckCircle2 className="w-4 h-4 flex-shrink-0 text-emerald-600" />
              <span>{pinSuccess}</span>
            </div>
          )}

          <div>
            <label className="text-xs font-bold text-slate-700 block mb-1">
              Ancien code PIN (4 chiffres) *
            </label>
            <input
              type="password"
              inputMode="numeric"
              maxLength={4}
              required
              placeholder="••••"
              value={oldPin}
              onChange={(e) => setOldPin(e.target.value.replace(/\D/g, '').slice(0, 4))}
              className="w-full p-2.5 text-center font-mono text-base font-bold bg-slate-50 border border-slate-300 rounded-xl focus:outline-none focus:border-amber-500"
            />
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-xs font-bold text-slate-700 block mb-1">
                Nouveau PIN *
              </label>
              <input
                type="password"
                inputMode="numeric"
                maxLength={4}
                required
                placeholder="••••"
                value={newPin}
                onChange={(e) => setNewPin(e.target.value.replace(/\D/g, '').slice(0, 4))}
                className="w-full p-2.5 text-center font-mono text-base font-bold bg-slate-50 border border-slate-300 rounded-xl focus:outline-none focus:border-amber-500"
              />
            </div>

            <div>
              <label className="text-xs font-bold text-slate-700 block mb-1">
                Confirmer PIN *
              </label>
              <input
                type="password"
                inputMode="numeric"
                maxLength={4}
                required
                placeholder="••••"
                value={confirmNewPin}
                onChange={(e) => setConfirmNewPin(e.target.value.replace(/\D/g, '').slice(0, 4))}
                className="w-full p-2.5 text-center font-mono text-base font-bold bg-slate-50 border border-slate-300 rounded-xl focus:outline-none focus:border-amber-500"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={isSubmittingPin}
            className="w-full py-3 bg-amber-600 hover:bg-amber-700 text-white font-bold text-xs rounded-xl shadow-md transition"
          >
            Modifier le code PIN
          </button>
        </form>
      </div>
    </div>
  );
};

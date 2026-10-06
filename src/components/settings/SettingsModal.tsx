import React, { useState, useRef } from 'react';
import {
  X,
  Settings,
  KeyRound,
  Check,
  Lock,
  AlertCircle,
  CheckCircle2,
  Download,
  Smartphone,
  Upload,
  Database,
  RefreshCw,
  ShieldCheck,
} from 'lucide-react';
import { ShopSettings } from '../../types';
import {
  updateShopSettings,
  changeShopPin,
  generateBackupData,
  restoreBackupData,
  verifyStockIntegrity,
} from '../../services/db';
import {
  clearTelemetryQueue,
  buildAndQueueDailySummary,
  flushTelemetryQueue,
} from '../../services/telemetry';
import { triggerHaptic } from '../../utils/formatters';

interface SettingsModalProps {
  isOpen: boolean;
  settings: ShopSettings;
  onClose: () => void;
  onSettingsUpdated: (newSettings: ShopSettings) => void;
  onLockScreen: () => void;
  onRefreshAllData?: () => void;
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
  onRefreshAllData,
  isInstalled = false,
  isIOS = false,
  onInstall,
  onShowIOSGuide,
}) => {
  const [shopName, setShopName] = useState(settings.shopName);
  const [shopOwner, setShopOwner] = useState(settings.shopOwner);
  const [phone, setPhone] = useState(settings.phone);
  const [address, setAddress] = useState(settings.address);
  const [city, setCity] = useState(settings.city || '');
  const [telemetryEnabled, setTelemetryEnabled] = useState(settings.telemetryEnabled !== false);

  // PIN change state
  const [oldPin, setOldPin] = useState('');
  const [newPin, setNewPin] = useState('');
  const [confirmNewPin, setConfirmNewPin] = useState('');

  const [infoError, setInfoError] = useState<string | null>(null);
  const [infoSuccess, setInfoSuccess] = useState<string | null>(null);

  const [pinError, setPinError] = useState<string | null>(null);
  const [pinSuccess, setPinSuccess] = useState<string | null>(null);

  const [backupError, setBackupError] = useState<string | null>(null);
  const [backupSuccess, setBackupSuccess] = useState<string | null>(null);

  const [isSubmittingInfo, setIsSubmittingInfo] = useState(false);
  const [isSubmittingPin, setIsSubmittingPin] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [isVerifyingStock, setIsVerifyingStock] = useState(false);
  const [integrityMessage, setIntegrityMessage] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement | null>(null);

  if (!isOpen) return null;

  const handleRunIntegrityCheck = async () => {
    try {
      setIsVerifyingStock(true);
      setIntegrityMessage(null);
      const res = await verifyStockIntegrity();
      triggerHaptic(60);
      onRefreshAllData?.();
      if (res.fixedProducts > 0) {
        setIntegrityMessage(`Diagnostic terminé : ${res.checkedProducts} produits analysés, ${res.fixedProducts} écart(s) de stock corrigé(s) avec succès.`);
      } else {
        setIntegrityMessage(`Diagnostic parfait : ${res.checkedProducts} produits vérifiés, aucun écart détecté. Les compteurs sont 100% cohérents.`);
      }
    } catch (err: unknown) {
      setIntegrityMessage(err instanceof Error ? err.message : 'Erreur lors du diagnostic des stocks.');
    } finally {
      setIsVerifyingStock(false);
    }
  };

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
        city: city.trim() || undefined,
        telemetryEnabled,
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

  const handleToggleTelemetry = async () => {
    const nextVal = !telemetryEnabled;
    setTelemetryEnabled(nextVal);
    triggerHaptic(40);
    try {
      const updated = await updateShopSettings({
        shopName: settings.shopName,
        shopOwner: settings.shopOwner,
        phone: settings.phone,
        address: settings.address,
        city: settings.city,
        telemetryEnabled: nextVal,
      });
      onSettingsUpdated(updated);
      if (!nextVal) {
        await clearTelemetryQueue();
      } else {
        await buildAndQueueDailySummary();
        await flushTelemetryQueue();
      }
    } catch (err) {
      console.warn('Erreur mise à jour télémétrie:', err);
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
              Ville ou préfecture (facultatif)
            </label>
            <input
              type="text"
              placeholder="Ex: Conakry, Kankan, Labé, Kindia..."
              value={city}
              onChange={(e) => setCity(e.target.value)}
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

        {/* Section : Statistiques anonymes d'utilisation (Point 4) */}
        <div className="pt-4 border-t border-slate-200">
          <div className="flex items-center justify-between gap-3 p-3.5 rounded-2xl bg-slate-50 border border-slate-200">
            <div className="space-y-0.5 min-w-0 pr-2">
              <label
                htmlFor="telemetry-toggle"
                className="text-xs font-bold text-slate-900 block cursor-pointer"
              >
                Statistiques anonymes d'utilisation
              </label>
              <p className="text-[11px] text-slate-500 leading-snug">
                Aide à améliorer l'application. Aucune donnée de vos clients ni de vos ventes n'est envoyée.
              </p>
            </div>
            <button
              id="telemetry-toggle"
              type="button"
              role="switch"
              aria-checked={telemetryEnabled}
              onClick={handleToggleTelemetry}
              className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                telemetryEnabled ? 'bg-amber-600' : 'bg-slate-300'
              }`}
            >
              <span
                aria-hidden="true"
                className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-sm ring-0 transition duration-200 ease-in-out ${
                  telemetryEnabled ? 'translate-x-5' : 'translate-x-0'
                }`}
              />
            </button>
          </div>
        </div>

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

        {/* Section 3 : Sauvegarde & Restauration (Export / Import - Point B.10) */}
        <div className="pt-4 border-t border-slate-200 space-y-3">
          <div className="flex items-center gap-2 text-xs font-black uppercase text-slate-700 tracking-wider">
            <Database className="w-4 h-4 text-amber-600" />
            <span>Sauvegarde & Restauration</span>
          </div>

          <p className="text-[11px] text-slate-500 leading-normal">
            Exportez toutes les données (produits, stocks, ventes, clients, dettes, photos et réglages) dans un fichier JSON pour les mettre en lieu sûr ou les transférer vers un autre appareil.
          </p>

          {backupError && (
            <div className="p-2.5 bg-rose-50 text-rose-700 rounded-xl text-xs font-semibold border border-rose-200 flex items-center gap-1.5">
              <AlertCircle className="w-4 h-4 flex-shrink-0 text-rose-500" />
              <span>{backupError}</span>
            </div>
          )}

          {backupSuccess && (
            <div className="p-2.5 bg-emerald-50 text-emerald-800 rounded-xl text-xs font-semibold border border-emerald-200 flex items-center gap-1.5">
              <CheckCircle2 className="w-4 h-4 flex-shrink-0 text-emerald-600" />
              <span>{backupSuccess}</span>
            </div>
          )}

          <div className="grid grid-cols-2 gap-2 pt-1">
            {/* Télécharger la sauvegarde */}
            <button
              type="button"
              disabled={isExporting}
              onClick={async () => {
                try {
                  setIsExporting(true);
                  setBackupError(null);
                  setBackupSuccess(null);
                  const { jsonString } = await generateBackupData();
                  const blob = new Blob([jsonString], { type: 'application/json' });
                  const url = URL.createObjectURL(blob);
                  const a = document.createElement('a');
                  const dateStr = new Date().toISOString().split('T')[0];
                  const safeName = shopName.toLowerCase().replace(/[^a-z0-9]/g, '_');
                  a.href = url;
                  a.download = `sauvegarde_${safeName}_${dateStr}.json`;
                  a.click();
                  URL.revokeObjectURL(url);
                  triggerHaptic(50);
                  setBackupSuccess('Sauvegarde téléchargée avec succès !');
                  setTimeout(() => setBackupSuccess(null), 4000);
                } catch (err: unknown) {
                  setBackupError(err instanceof Error ? err.message : "Erreur lors de l'export.");
                } finally {
                  setIsExporting(false);
                }
              }}
              className="py-3 px-3 bg-slate-900 hover:bg-slate-800 active:scale-95 text-white font-bold text-xs rounded-xl shadow-xs transition flex items-center justify-center gap-2"
            >
              {isExporting ? (
                <RefreshCw className="w-4 h-4 animate-spin" />
              ) : (
                <Download className="w-4 h-4" />
              )}
              <span>Sauvegarder</span>
            </button>

            {/* Importer la sauvegarde */}
            <button
              type="button"
              disabled={isImporting}
              onClick={() => fileInputRef.current?.click()}
              className="py-3 px-3 bg-white hover:bg-slate-50 active:scale-95 border border-slate-300 text-slate-800 font-bold text-xs rounded-xl shadow-xs transition flex items-center justify-center gap-2"
            >
              {isImporting ? (
                <RefreshCw className="w-4 h-4 animate-spin text-amber-600" />
              ) : (
                <Upload className="w-4 h-4 text-amber-600" />
              )}
              <span>Restaurer</span>
            </button>

            <input
              ref={fileInputRef}
              type="file"
              accept=".json,application/json"
              className="hidden"
              onChange={async (e) => {
                const file = e.target.files?.[0];
                if (!file) return;

                if (
                  !window.confirm(
                    "Attention : la restauration va remplacer toutes les données actuelles de la boutique par celles du fichier. Voulez-vous continuer ?"
                  )
                ) {
                  e.target.value = '';
                  return;
                }

                try {
                  setIsImporting(true);
                  setBackupError(null);
                  setBackupSuccess(null);
                  const text = await file.text();
                  let parsed: unknown;
                  try {
                    parsed = JSON.parse(text);
                  } catch {
                    throw new Error('Le fichier sélectionné n’est pas un JSON valide.');
                  }

                  await restoreBackupData(parsed);
                  triggerHaptic(80);
                  setBackupSuccess('Données restaurées avec succès !');
                  onRefreshAllData?.();
                  setTimeout(() => setBackupSuccess(null), 4000);
                } catch (err: unknown) {
                  setBackupError(
                    err instanceof Error ? err.message : 'Erreur lors de la restauration.'
                  );
                } finally {
                  setIsImporting(false);
                  e.target.value = '';
                }
              }}
            />
          </div>

          {/* Diagnostic & Contrôle d'intégrité des Stocks */}
          <div className="pt-4 border-t border-slate-200 space-y-2.5">
            <div className="flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-emerald-600" />
              <h4 className="text-xs font-black text-slate-800 uppercase tracking-wider">
                Cohérence & Diagnostic des Stocks
              </h4>
            </div>
            <p className="text-[11px] text-slate-500 leading-relaxed">
              Vérifie mathématiquement que les compteurs de stock de chaque article correspondent fidèlement à tous les mouvements enregistrés (ventes, réapprovisionnements, corrections, annulations).
            </p>

            {integrityMessage && (
              <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-xs font-bold text-emerald-800 flex items-start gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-600 flex-shrink-0 mt-0.5" />
                <span>{integrityMessage}</span>
              </div>
            )}

            <button
              type="button"
              disabled={isVerifyingStock}
              onClick={handleRunIntegrityCheck}
              className="w-full py-3 px-4 bg-emerald-600 hover:bg-emerald-700 active:scale-95 disabled:opacity-50 text-white font-bold text-xs rounded-xl shadow-xs transition flex items-center justify-center gap-2"
            >
              {isVerifyingStock ? (
                <RefreshCw className="w-4 h-4 animate-spin" />
              ) : (
                <ShieldCheck className="w-4 h-4" />
              )}
              <span>Vérifier & recalculer les stocks</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

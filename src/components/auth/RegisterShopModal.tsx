import React, { useState } from 'react';
import { Store, User, Phone, MapPin, KeyRound, Check, AlertCircle } from 'lucide-react';
import { createShopSettings } from '../../services/db';
import { ShopSettings } from '../../types';
import { triggerHaptic } from '../../utils/formatters';

interface RegisterShopModalProps {
  onShopCreated: (settings: ShopSettings) => void;
}

export const RegisterShopModal: React.FC<RegisterShopModalProps> = ({ onShopCreated }) => {
  const [shopName, setShopName] = useState('');
  const [shopOwner, setShopOwner] = useState('');
  const [phone, setPhone] = useState('');
  const [address, setAddress] = useState('');
  const [city, setCity] = useState('');
  const [pin, setPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!shopName.trim()) {
      setError('Veuillez entrer le nom de la boutique.');
      return;
    }
    if (!shopOwner.trim()) {
      setError('Veuillez entrer le nom du gérant.');
      return;
    }
    if (!phone.trim()) {
      setError('Veuillez entrer votre numéro de téléphone.');
      return;
    }
    if (!/^\d{4}$/.test(pin)) {
      setError('Le code PIN doit comporter exactement 4 chiffres.');
      return;
    }
    if (pin !== confirmPin) {
      setError('Les deux codes PIN ne correspondent pas.');
      return;
    }

    try {
      setIsSubmitting(true);
      triggerHaptic(60);
      const created = await createShopSettings({
        shopName: shopName.trim(),
        shopOwner: shopOwner.trim(),
        phone: phone.trim(),
        address: address.trim() || 'Guinée',
        city: city.trim() || undefined,
        pin,
      });
      onShopCreated(created);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Erreur lors de la création');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-amber-950/80 backdrop-blur-md p-4 animate-in fade-in duration-300">
      <div className="w-full max-w-lg bg-white rounded-3xl p-6 sm:p-8 shadow-2xl text-slate-800 max-h-[92vh] overflow-y-auto">
        <div className="text-center mb-6">
          <div className="w-16 h-16 rounded-3xl bg-amber-600 text-white flex items-center justify-center mx-auto shadow-lg shadow-amber-600/30 mb-3 text-3xl">
            <Store className="w-8 h-8" />
          </div>
          <h2 className="text-2xl font-black text-slate-900 tracking-tight">Bienvenue !</h2>
          <p className="text-xs sm:text-sm text-slate-500 font-medium mt-1">
            Configurez votre boutique en Guinée pour commencer.
          </p>
        </div>

        {error && (
          <div className="mb-4 p-3 bg-rose-50 border border-rose-200 text-rose-700 rounded-2xl text-xs font-bold flex items-center gap-2">
            <AlertCircle className="w-4 h-4 flex-shrink-0 text-rose-500" />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="text-xs font-bold text-slate-700 block mb-1">
              Nom de la boutique *
            </label>
            <div className="relative">
              <Store className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                required
                placeholder="Ex: Boutique Baraka, Alimentation Diallo..."
                value={shopName}
                onChange={(e) => setShopName(e.target.value)}
                className="w-full pl-10 pr-3.5 py-3 text-sm font-semibold bg-slate-50 border border-slate-300 rounded-2xl focus:outline-none focus:border-amber-500 focus:bg-white"
              />
            </div>
          </div>

          <div>
            <label className="text-xs font-bold text-slate-700 block mb-1">
              Nom du gérant ou propriétaire *
            </label>
            <div className="relative">
              <User className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                required
                placeholder="Ex: Elhadj Mamadou, Fatoumata..."
                value={shopOwner}
                onChange={(e) => setShopOwner(e.target.value)}
                className="w-full pl-10 pr-3.5 py-3 text-sm font-semibold bg-slate-50 border border-slate-300 rounded-2xl focus:outline-none focus:border-amber-500 focus:bg-white"
              />
            </div>
          </div>

          <div>
            <label className="text-xs font-bold text-slate-700 block mb-1">
              Numéro de téléphone (Guinée) *
            </label>
            <div className="relative">
              <Phone className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="tel"
                required
                placeholder="Ex: 622 12 34 56"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                className="w-full pl-10 pr-3.5 py-3 text-sm font-semibold bg-slate-50 border border-slate-300 rounded-2xl focus:outline-none focus:border-amber-500 focus:bg-white"
              />
            </div>
          </div>

          <div>
            <label className="text-xs font-bold text-slate-700 block mb-1">
              Ville ou préfecture (facultatif)
            </label>
            <div className="relative">
              <MapPin className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                placeholder="Ex: Conakry, Kankan, Labé, Kindia, Nzérékoré..."
                value={city}
                onChange={(e) => setCity(e.target.value)}
                className="w-full pl-10 pr-3.5 py-3 text-sm font-semibold bg-slate-50 border border-slate-300 rounded-2xl focus:outline-none focus:border-amber-500 focus:bg-white"
              />
            </div>
          </div>

          <div>
            <label className="text-xs font-bold text-slate-700 block mb-1">
              Marché ou quartier
            </label>
            <div className="relative">
              <MapPin className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                placeholder="Ex: Madina, Bambeto, Matam, Kipé..."
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                className="w-full pl-10 pr-3.5 py-3 text-sm font-semibold bg-slate-50 border border-slate-300 rounded-2xl focus:outline-none focus:border-amber-500 focus:bg-white"
              />
            </div>
          </div>

          {/* Code PIN section */}
          <div className="p-4 bg-amber-50/70 border border-amber-200/80 rounded-2xl space-y-3">
            <div className="flex items-center gap-2 text-amber-900 font-bold text-xs uppercase tracking-wider">
              <KeyRound className="w-4 h-4 text-amber-600" />
              <span>Code PIN de sécurité (4 chiffres)</span>
            </div>
            <p className="text-[11px] text-slate-600">
              Ce code PIN verrouille votre caisse et vos données. Il sera demandé à chaque ouverture de l'app et après 5 minutes d'inactivité.
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">
                  Code PIN (4 chiffres) *
                </label>
                <input
                  type="password"
                  inputMode="numeric"
                  maxLength={4}
                  required
                  placeholder="••••"
                  value={pin}
                  onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 4))}
                  className="w-full py-3 text-center text-xl font-mono font-black tracking-widest bg-white border border-amber-300 rounded-xl focus:outline-none focus:border-amber-600"
                />
              </div>

              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">
                  Confirmer le PIN *
                </label>
                <input
                  type="password"
                  inputMode="numeric"
                  maxLength={4}
                  required
                  placeholder="••••"
                  value={confirmPin}
                  onChange={(e) => setConfirmPin(e.target.value.replace(/\D/g, '').slice(0, 4))}
                  className="w-full py-3 text-center text-xl font-mono font-black tracking-widest bg-white border border-amber-300 rounded-xl focus:outline-none focus:border-amber-600"
                />
              </div>
            </div>
          </div>

          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full py-4 rounded-2xl bg-amber-600 hover:bg-amber-700 active:scale-98 text-white font-black text-base shadow-xl shadow-amber-600/30 transition flex items-center justify-center gap-2 mt-4"
          >
            <Check className="w-5 h-5" />
            <span>Créer ma Boutique</span>
          </button>
        </form>
      </div>
    </div>
  );
};

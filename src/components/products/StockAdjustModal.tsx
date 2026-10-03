import React, { useState } from 'react';
import { X, Plus, AlertTriangle, CheckCircle2, Layers } from 'lucide-react';
import { ProductWithStock, CorrectionReason } from '../../types';
import { addStockReappro, correctStock } from '../../services/db';
import { triggerHaptic } from '../../utils/formatters';

interface StockAdjustModalProps {
  isOpen: boolean;
  product: ProductWithStock | null;
  mode: 'reappro' | 'correction';
  onClose: () => void;
  onSuccess: () => void;
}

export const StockAdjustModal: React.FC<StockAdjustModalProps> = ({
  isOpen,
  product,
  mode,
  onClose,
  onSuccess,
}) => {
  const hasPack = !!(product?.packSize && product.packSize >= 2);
  const packLabel = product?.packLabel || 'carton';
  const packSize = product?.packSize || 1;

  const [inputUnit, setInputUnit] = useState<'units' | 'packs'>('units');
  const [quantity, setQuantity] = useState<number>(mode === 'reappro' ? (hasPack ? 1 : 10) : 1);
  const [isNegative, setIsNegative] = useState<boolean>(true); // for correction: default remove
  const [reason, setReason] = useState<CorrectionReason>('casse');
  const [note, setNote] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen || !product) return null;

  // Calcul du nombre total d'unités physiques réelles
  const finalUnits =
    mode === 'reappro' && inputUnit === 'packs' && hasPack
      ? quantity * packSize
      : quantity;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (quantity <= 0) {
      setError('Veuillez entrer une quantité positive.');
      return;
    }

    try {
      setIsSubmitting(true);
      setError(null);

      if (mode === 'reappro') {
        const reapproNote =
          inputUnit === 'packs' && hasPack
            ? `${quantity} ${packLabel}(s) de ${packSize}${note.trim() ? ` • ${note.trim()}` : ''}`
            : note.trim() || undefined;

        await addStockReappro(product.id, finalUnits, reapproNote);
      } else {
        const delta = isNegative ? -Math.abs(quantity) : Math.abs(quantity);
        await correctStock(product.id, delta, reason, note.trim() || undefined);
      }

      triggerHaptic(50);
      onSuccess();
      onClose();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Erreur lors de la mise à jour');
    } finally {
      setIsSubmitting(false);
    }
  };

  const adjustQty = (amount: number) => {
    setQuantity((prev) => Math.max(1, prev + amount));
  };

  const availablePacks = hasPack ? Math.floor(product.currentStock / packSize) : 0;

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-xs p-0 sm:p-4 animate-in fade-in duration-200">
      <div className="w-full max-w-md bg-white rounded-t-3xl sm:rounded-3xl p-6 shadow-2xl text-slate-800 max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between pb-3 border-b border-slate-100">
          <div className="flex items-center gap-2">
            <div
              className={`p-2 rounded-xl ${
                mode === 'reappro' ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'
              }`}
            >
              {mode === 'reappro' ? <Plus className="w-5 h-5" /> : <AlertTriangle className="w-5 h-5" />}
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-900">
                {mode === 'reappro' ? 'Réapprovisionner' : 'Corriger le stock'}
              </h3>
              <p className="text-xs text-slate-500 font-medium truncate max-w-[200px]">{product.name}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-full text-slate-400 hover:bg-slate-100 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Current stock status */}
        <div className="my-4 p-3 rounded-2xl bg-slate-50 border border-slate-200/80 flex items-center justify-between">
          <span className="text-xs font-semibold text-slate-500">Stock actuel enregistré :</span>
          <div className="text-right">
            <span
              className={`text-sm font-bold px-2.5 py-1 rounded-xl ${
                product.isLowStock ? 'bg-rose-100 text-rose-700' : 'bg-emerald-100 text-emerald-800'
              }`}
            >
              {product.currentStock} unités
            </span>
            {hasPack && (
              <div className="text-[11px] text-slate-500 mt-1 font-semibold">
                Soit {availablePacks} {packLabel}{availablePacks > 1 ? 's' : ''} complet{availablePacks > 1 ? 's' : ''}
              </div>
            )}
          </div>
        </div>

        {error && (
          <div className="mb-4 p-3 bg-rose-50 text-rose-700 rounded-xl text-xs font-medium border border-rose-200">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          {mode === 'correction' && (
            <div className="space-y-2">
              <label className="text-xs font-bold text-slate-700">Sens de la correction :</label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setIsNegative(true)}
                  className={`py-3 rounded-xl font-bold text-xs border transition ${
                    isNegative
                      ? 'bg-rose-600 text-white border-rose-600 shadow-sm'
                      : 'bg-white text-slate-700 border-slate-200'
                  }`}
                >
                  − Retirer (Perte/Casse)
                </button>
                <button
                  type="button"
                  onClick={() => setIsNegative(false)}
                  className={`py-3 rounded-xl font-bold text-xs border transition ${
                    !isNegative
                      ? 'bg-emerald-600 text-white border-emerald-600 shadow-sm'
                      : 'bg-white text-slate-700 border-slate-200'
                  }`}
                >
                  + Ajouter (Retrouvé)
                </button>
              </div>

              <div className="pt-2">
                <label className="text-xs font-bold text-slate-700 block mb-1.5">
                  Motif de la correction :
                </label>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {[
                    { id: 'casse', label: '💥 Casse / Abîmé' },
                    { id: 'vol', label: '🚨 Vol / Manquant' },
                    { id: 'erreur', label: '🔢 Erreur de compte' },
                    { id: 'perime', label: '⏳ Périmé' },
                    { id: 'don', label: '🎁 Don / Perso' },
                    { id: 'autre', label: '📝 Autre motif' },
                  ].map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => setReason(item.id as CorrectionReason)}
                      className={`p-2 rounded-xl text-xs font-semibold text-left border transition ${
                        reason === item.id
                          ? 'bg-amber-100 border-amber-500 text-amber-900'
                          : 'bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100'
                      }`}
                    >
                      {item.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Saisie en unités OU en cartons si réapprovisionnement */}
          {mode === 'reappro' && hasPack && (
            <div>
              <label className="text-xs font-bold text-slate-700 block mb-1.5">
                Saisir l'entrée en :
              </label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setInputUnit('units')}
                  className={`py-2.5 rounded-xl font-bold text-xs border transition ${
                    inputUnit === 'units'
                      ? 'bg-amber-600 text-white border-amber-600 shadow-xs'
                      : 'bg-white text-slate-700 border-slate-200'
                  }`}
                >
                  Unités individuelles
                </button>
                <button
                  type="button"
                  onClick={() => setInputUnit('packs')}
                  className={`py-2.5 rounded-xl font-bold text-xs border capitalize transition flex items-center justify-center gap-1.5 ${
                    inputUnit === 'packs'
                      ? 'bg-amber-600 text-white border-amber-600 shadow-xs'
                      : 'bg-white text-slate-700 border-slate-200'
                  }`}
                >
                  <Layers className="w-3.5 h-3.5" />
                  <span>{packLabel}s ({packSize} un.)</span>
                </button>
              </div>
            </div>
          )}

          {/* Quantity Selector with Big Touch Buttons */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs font-bold text-slate-700">
                {mode === 'reappro'
                  ? inputUnit === 'packs' && hasPack
                    ? `Nombre de ${packLabel}s reçus :`
                    : "Nombre d'unités reçues :"
                  : "Nombre d'unités concernées :"}
              </label>
              {mode === 'reappro' && inputUnit === 'packs' && hasPack && (
                <span className="text-xs font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-lg border border-emerald-200">
                  = +{finalUnits} unités au total
                </span>
              )}
            </div>

            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => adjustQty(-5)}
                className="w-12 h-12 rounded-2xl bg-slate-100 hover:bg-slate-200 active:scale-95 text-slate-800 font-bold text-sm flex items-center justify-center transition"
              >
                -5
              </button>
              <button
                type="button"
                onClick={() => adjustQty(-1)}
                className="w-12 h-12 rounded-2xl bg-slate-100 hover:bg-slate-200 active:scale-95 text-slate-800 font-black text-xl flex items-center justify-center transition"
              >
                -
              </button>
              <input
                type="number"
                min="1"
                value={quantity}
                onChange={(e) => setQuantity(Math.max(1, parseInt(e.target.value) || 1))}
                className="flex-1 text-center py-3 text-2xl font-black bg-amber-50 border-2 border-amber-300 rounded-2xl text-slate-900 focus:outline-none focus:border-amber-600"
              />
              <button
                type="button"
                onClick={() => adjustQty(1)}
                className="w-12 h-12 rounded-2xl bg-slate-100 hover:bg-slate-200 active:scale-95 text-slate-800 font-black text-xl flex items-center justify-center transition"
              >
                +
              </button>
              <button
                type="button"
                onClick={() => adjustQty(5)}
                className="w-12 h-12 rounded-2xl bg-slate-100 hover:bg-slate-200 active:scale-95 text-slate-800 font-bold text-sm flex items-center justify-center transition"
              >
                +5
              </button>
            </div>
          </div>

          {/* Note optionnelle */}
          <div>
            <label className="text-xs font-bold text-slate-700 block mb-1">
              Note explicative (optionnel) :
            </label>
            <input
              type="text"
              placeholder={mode === 'reappro' ? 'Ex: Fournisseur Madina' : 'Ex: Casse étagère'}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              className="w-full p-3 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:border-amber-500"
            />
          </div>

          {/* Submit */}
          <div className="pt-2">
            <button
              type="submit"
              disabled={isSubmitting}
              className={`w-full py-4 rounded-2xl text-white font-black text-base shadow-lg transition active:scale-98 flex items-center justify-center gap-2 ${
                mode === 'reappro'
                  ? 'bg-emerald-600 hover:bg-emerald-700 shadow-emerald-600/30'
                  : 'bg-amber-600 hover:bg-amber-700 shadow-amber-600/30'
              }`}
            >
              <CheckCircle2 className="w-5 h-5" />
              <span>
                {mode === 'reappro'
                  ? `Valider le réappro (+${finalUnits} unités)`
                  : `Enregistrer la correction (${isNegative ? '-' : '+'}${quantity})`}
              </span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

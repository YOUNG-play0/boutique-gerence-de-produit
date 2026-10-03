import React, { useState } from 'react';
import { X, Plus, AlertTriangle, CheckCircle2, Layers, Package } from 'lucide-react';
import { ProductWithStock, CorrectionReason, StockSupport } from '../../types';
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

  // Support ciblé : 'pack' (cartons fermés) ou 'unit' (unités seules)
  const [targetSupport, setTargetSupport] = useState<StockSupport>('unit');
  const [quantity, setQuantity] = useState<number>(mode === 'reappro' ? 10 : 1);
  const [isNegative, setIsNegative] = useState<boolean>(true); // pour correction : retrait par défaut
  const [reason, setReason] = useState<CorrectionReason>('casse');
  const [note, setNote] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen || !product) return null;

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
        await addStockReappro(
          product.id,
          quantity,
          targetSupport,
          note.trim() || undefined
        );
      } else {
        const delta = isNegative ? -Math.abs(quantity) : Math.abs(quantity);
        await correctStock(
          product.id,
          delta,
          targetSupport,
          reason,
          note.trim() || undefined
        );
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

        {/* Current stock status : montre "X cartons + Y unités" */}
        <div className="my-4 p-3 rounded-2xl bg-slate-50 border border-slate-200/80 flex items-center justify-between">
          <span className="text-xs font-semibold text-slate-500">Stock actuel enregistré :</span>
          <div className="text-right">
            <span
              className={`text-sm font-bold px-2.5 py-1 rounded-xl ${
                product.isLowStock ? 'bg-rose-100 text-rose-700' : 'bg-emerald-100 text-emerald-800'
              }`}
            >
              {hasPack
                ? `${product.stockPacks} ${packLabel}${product.stockPacks > 1 ? 's' : ''} + ${product.stockUnits} unité${product.stockUnits > 1 ? 's' : ''}`
                : `${product.stockUnits} unités`}
            </span>
          </div>
        </div>

        {error && (
          <div className="mb-4 p-3 bg-rose-50 text-rose-700 rounded-xl text-xs font-medium border border-rose-200">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Si produit avec carton : sélecteur de stock cible (Cartons fermés vs Unités seules) */}
          {hasPack && (
            <div>
              <label className="text-xs font-bold text-slate-700 block mb-1.5">
                Quel stock souhaitez-vous {mode === 'reappro' ? 'réapprovisionner' : 'corriger'} ?
              </label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setTargetSupport('pack')}
                  className={`py-2.5 rounded-xl font-bold text-xs border capitalize transition flex items-center justify-center gap-1.5 ${
                    targetSupport === 'pack'
                      ? 'bg-amber-600 text-white border-amber-600 shadow-xs'
                      : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
                  }`}
                >
                  <Layers className="w-4 h-4" />
                  <span>{packLabel}s fermés ({product.stockPacks})</span>
                </button>
                <button
                  type="button"
                  onClick={() => setTargetSupport('unit')}
                  className={`py-2.5 rounded-xl font-bold text-xs border transition flex items-center justify-center gap-1.5 ${
                    targetSupport === 'unit'
                      ? 'bg-amber-600 text-white border-amber-600 shadow-xs'
                      : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
                  }`}
                >
                  <Package className="w-4 h-4" />
                  <span>Unités seules ({product.stockUnits})</span>
                </button>
              </div>
            </div>
          )}

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

          {/* Quantity Selector with Big Touch Buttons */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs font-bold text-slate-700">
                {mode === 'reappro'
                  ? targetSupport === 'pack' && hasPack
                    ? `Nombre de ${packLabel}s fermés à ajouter :`
                    : "Nombre d'unités seules à ajouter :"
                  : targetSupport === 'pack' && hasPack
                  ? `Nombre de ${packLabel}s concernés :`
                  : "Nombre d'unités seules concernées :"}
              </label>
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
              placeholder={mode === 'reappro' ? 'Ex: Livraison Madina' : 'Ex: Casse étagère'}
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
                  ? `Valider (+${quantity} ${
                      targetSupport === 'pack' && hasPack ? `${packLabel}(s)` : 'unité(s)'
                    })`
                  : `Valider la correction (${isNegative ? '-' : '+'}${quantity} ${
                      targetSupport === 'pack' && hasPack ? `${packLabel}(s)` : 'unité(s)'
                    })`}
              </span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

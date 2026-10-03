import React, { useState, useEffect } from 'react';
import { X, Package, Check, Layers, Info } from 'lucide-react';
import { ProductWithStock } from '../../types';
import { createProduct, updateProduct } from '../../services/db';
import { formatGNF, triggerHaptic } from '../../utils/formatters';

interface ProductFormModalProps {
  isOpen: boolean;
  productToEdit: ProductWithStock | null;
  onClose: () => void;
  onSuccess: () => void;
}

const CATEGORIES = [
  'Alimentation',
  'Boissons',
  'Hygiène & Entretien',
  'Petit déjeuner',
  'Condiments',
  'Boulangerie',
  'Divers',
];

const PRESET_ICONS = ['🍚', '🛢️', '🥛', '🥫', '☕', '🧼', '💧', '🧃', '🥖', '🧂', '📦', '🍪'];

const PACK_LABEL_OPTIONS = ['carton', 'sac', 'paquet', 'caisse'];

export const ProductFormModal: React.FC<ProductFormModalProps> = ({
  isOpen,
  productToEdit,
  onClose,
  onSuccess,
}) => {
  const [name, setName] = useState('');
  const [price, setPrice] = useState<number | ''>(5000);
  const [category, setCategory] = useState('Alimentation');
  const [alertThreshold, setAlertThreshold] = useState<number>(5);
  const [alertThresholdPacks, setAlertThresholdPacks] = useState<number | ''>('');
  const [selectedEmoji, setSelectedEmoji] = useState('📦');
  const [barcode, setBarcode] = useState('');

  // Carton / Format groupé
  const [hasPack, setHasPack] = useState(false);
  const [packLabel, setPackLabel] = useState('carton');
  const [packSize, setPackSize] = useState<number | ''>(24);
  const [packPrice, setPackPrice] = useState<number | ''>(100000);

  // Saisie stock initial (création)
  // Deux champs distincts si carton coché : cartons fermés + unités seules
  const [initialPacks, setInitialPacks] = useState<number | ''>(0);
  const [initialUnits, setInitialUnits] = useState<number | ''>(0);
  // Saisie stock initial simple si pas de carton
  const [initialSingleStock, setInitialSingleStock] = useState<number | ''>(10);

  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (productToEdit) {
      setName(productToEdit.name);
      setPrice(productToEdit.price);
      setCategory(productToEdit.category || 'Alimentation');
      setAlertThreshold(productToEdit.alertThreshold || 5);
      setAlertThresholdPacks(
        productToEdit.alertThresholdPacks !== undefined ? productToEdit.alertThresholdPacks : ''
      );
      setBarcode(productToEdit.barcode || '');
      setSelectedEmoji(productToEdit.imageUrl || '📦');
      if (productToEdit.packSize && productToEdit.packPrice) {
        setHasPack(true);
        setPackLabel(productToEdit.packLabel || 'carton');
        setPackSize(productToEdit.packSize);
        setPackPrice(productToEdit.packPrice);
      } else {
        setHasPack(false);
        setPackLabel('carton');
        setPackSize(24);
        setPackPrice(100000);
      }
    } else {
      setName('');
      setPrice(5000);
      setCategory('Alimentation');
      setInitialPacks(0);
      setInitialUnits(0);
      setInitialSingleStock(10);
      setAlertThreshold(5);
      setAlertThresholdPacks('');
      setBarcode('');
      setSelectedEmoji('📦');
      setHasPack(false);
      setPackLabel('carton');
      setPackSize(24);
      setPackPrice(100000);
    }
    setError(null);
  }, [productToEdit, isOpen]);

  if (!isOpen) return null;

  // Calcul du prix unitaire de revient du carton
  const packUnitCost =
    hasPack && packPrice && packSize && Number(packSize) > 0
      ? Math.round(Number(packPrice) / Number(packSize))
      : null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setError('Veuillez entrer le nom du produit.');
      return;
    }
    if (price === '' || price <= 0) {
      setError("Veuillez spécifier un prix à l'unité valide en GNF.");
      return;
    }

    if (hasPack) {
      if (!packSize || Number(packSize) < 2) {
        setError("Le nombre d'unités dans un carton doit être d'au moins 2.");
        return;
      }
      if (!packPrice || Number(packPrice) <= 0) {
        setError('Le prix du carton doit être supérieur à zéro.');
        return;
      }
    }

    try {
      setIsSubmitting(true);
      setError(null);

      const productPayload = {
        name: name.trim(),
        price: Number(price),
        category,
        alertThreshold: Number(alertThreshold) || 5,
        alertThresholdPacks:
          hasPack && alertThresholdPacks !== '' ? Number(alertThresholdPacks) : undefined,
        barcode: barcode.trim() || undefined,
        imageUrl: selectedEmoji,
        packLabel: hasPack ? packLabel : undefined,
        packSize: hasPack ? Number(packSize) : undefined,
        packPrice: hasPack ? Number(packPrice) : undefined,
      };

      if (productToEdit) {
        await updateProduct(productToEdit.id, productPayload);
      } else {
        const initialStockData = hasPack
          ? {
              units: Math.max(0, Number(initialUnits) || 0),
              packs: Math.max(0, Number(initialPacks) || 0),
            }
          : {
              units: Math.max(0, Number(initialSingleStock) || 0),
            };

        await createProduct(productPayload, initialStockData);
      }

      triggerHaptic(50);
      onSuccess();
      onClose();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Erreur lors de la sauvegarde');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-xs p-0 sm:p-4 animate-in fade-in duration-200">
      <div className="w-full max-w-lg bg-white rounded-t-3xl sm:rounded-3xl p-6 shadow-2xl text-slate-800 max-h-[92vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between pb-3 border-b border-slate-100">
          <div className="flex items-center gap-2">
            <div className="p-2 rounded-xl bg-amber-100 text-amber-700">
              <Package className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-900">
                {productToEdit ? 'Modifier le Produit' : 'Nouveau Produit'}
              </h3>
              <p className="text-xs text-slate-500 font-medium">Boutique en Guinée (GNF)</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-full text-slate-400 hover:bg-slate-100 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {error && (
          <div className="mt-3 p-3 bg-rose-50 text-rose-700 rounded-xl text-xs font-semibold border border-rose-200">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="mt-4 space-y-4">
          {/* Nom du produit */}
          <div>
            <label className="text-xs font-bold text-slate-700 block mb-1">
              Nom du produit *
            </label>
            <input
              type="text"
              required
              placeholder="Ex: Riz Parfumé 25kg, Huile Dinor, Nescafe..."
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full p-3.5 text-sm font-semibold bg-slate-50 border border-slate-300 rounded-2xl focus:outline-none focus:border-amber-500 focus:bg-white"
            />
          </div>

          {/* Icon / Emoji Selector */}
          <div>
            <label className="text-xs font-bold text-slate-700 block mb-1.5">
              Icône visuelle :
            </label>
            <div className="flex gap-2 flex-wrap">
              {PRESET_ICONS.map((em) => (
                <button
                  key={em}
                  type="button"
                  onClick={() => setSelectedEmoji(em)}
                  className={`w-10 h-10 rounded-xl flex items-center justify-center text-xl transition ${
                    selectedEmoji === em
                      ? 'bg-amber-500/20 border-2 border-amber-600 scale-105'
                      : 'bg-slate-100 border border-slate-200 hover:bg-slate-200'
                  }`}
                >
                  {em}
                </button>
              ))}
            </div>
          </div>

          {/* Prix à l'unité en GNF (obligatoire) */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-xs font-bold text-slate-700">
                Prix à l'unité (GNF) *
              </label>
              {price !== '' && (
                <span className="text-xs font-bold text-amber-600">
                  {formatGNF(Number(price))}
                </span>
              )}
            </div>
            <div className="relative">
              <input
                type="number"
                step="500"
                min="100"
                required
                placeholder="5000"
                value={price}
                onChange={(e) => setPrice(e.target.value === '' ? '' : Number(e.target.value))}
                className="w-full p-3.5 pr-16 text-lg font-black bg-amber-50/60 border-2 border-amber-200 rounded-2xl text-slate-900 focus:outline-none focus:border-amber-500"
              />
              <span className="absolute right-4 top-1/2 -translate-y-1/2 text-xs font-black text-amber-700">
                GNF
              </span>
            </div>
            <div className="flex gap-1.5 mt-1.5 overflow-x-auto no-scrollbar py-0.5">
              {[1000, 5000, 10000, 25000, 50000, 100000].map((pVal) => (
                <button
                  key={pVal}
                  type="button"
                  onClick={() => setPrice(pVal)}
                  className="px-2.5 py-1 bg-slate-100 hover:bg-slate-200 rounded-lg text-[11px] font-bold text-slate-700"
                >
                  {formatGNF(pVal)}
                </button>
              ))}
            </div>
          </div>

          {/* SECTION : VENTE PAR CARTON */}
          <div className="p-4 bg-orange-50/70 border-2 border-orange-200 rounded-2xl space-y-3">
            <label className="flex items-center gap-2.5 cursor-pointer">
              <input
                type="checkbox"
                checked={hasPack}
                onChange={(e) => setHasPack(e.target.checked)}
                className="w-5 h-5 text-amber-600 rounded-lg border-slate-300 focus:ring-amber-500"
              />
              <span className="text-xs sm:text-sm font-black text-slate-800">
                Je vends aussi ce produit en carton
              </span>
            </label>

            {hasPack && (
              <div className="pt-2 border-t border-orange-200/80 space-y-3 animate-in fade-in duration-200">
                {/* Format selection */}
                <div>
                  <label className="text-xs font-bold text-slate-700 block mb-1">
                    Nom du format :
                  </label>
                  <div className="grid grid-cols-4 gap-2">
                    {PACK_LABEL_OPTIONS.map((lbl) => (
                      <button
                        key={lbl}
                        type="button"
                        onClick={() => setPackLabel(lbl)}
                        className={`py-2 px-1 text-xs font-bold rounded-xl border capitalize transition ${
                          packLabel === lbl
                            ? 'bg-amber-600 text-white border-amber-600 shadow-xs'
                            : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
                        }`}
                      >
                        {lbl}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Pack Size & Pack Price */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs font-bold text-slate-700 block mb-1">
                      Nombre d'unités dans un {packLabel} *
                    </label>
                    <input
                      type="number"
                      min="2"
                      required={hasPack}
                      value={packSize}
                      onChange={(e) =>
                        setPackSize(e.target.value === '' ? '' : Math.max(2, parseInt(e.target.value) || 2))
                      }
                      className="w-full p-3 text-sm font-bold bg-white border border-slate-300 rounded-xl focus:outline-none focus:border-amber-500"
                    />
                  </div>

                  <div>
                    <label className="text-xs font-bold text-slate-700 block mb-1">
                      Prix du {packLabel} (GNF) *
                    </label>
                    <div className="relative">
                      <input
                        type="number"
                        min="100"
                        step="500"
                        required={hasPack}
                        value={packPrice}
                        onChange={(e) =>
                          setPackPrice(e.target.value === '' ? '' : Number(e.target.value))
                        }
                        className="w-full p-3 pr-12 text-sm font-black bg-white border border-slate-300 rounded-xl focus:outline-none focus:border-amber-500"
                      />
                      <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-black text-amber-700">
                        GNF
                      </span>
                    </div>
                  </div>
                </div>

                {/* Comparaison : Prix de revient unitaire dans le carton */}
                {packUnitCost !== null && (
                  <div className="p-2.5 bg-amber-100/70 rounded-xl text-xs font-medium text-amber-900 flex items-center gap-2">
                    <Info className="w-4 h-4 flex-shrink-0 text-amber-700" />
                    <span>
                      Soit <strong>{formatGNF(packUnitCost)}</strong> par unité dans le {packLabel}
                      {price !== '' && Number(price) > packUnitCost && (
                        <span className="text-emerald-700 font-bold ml-1">
                          (économie de {formatGNF(Number(price) - packUnitCost)} / unité)
                        </span>
                      )}
                    </span>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Catégorie */}
          <div>
            <label className="text-xs font-bold text-slate-700 block mb-1">
              Catégorie de produit :
            </label>
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className="w-full p-3 text-xs font-semibold bg-slate-50 border border-slate-300 rounded-xl focus:outline-none focus:border-amber-500"
            >
              {CATEGORIES.map((cat) => (
                <option key={cat} value={cat}>
                  {cat}
                </option>
              ))}
            </select>
          </div>

          {/* STOCK INITIAL (SI CRÉATION) */}
          {!productToEdit && (
            <div className="space-y-3">
              {hasPack ? (
                /* Cas 1 : Vente en carton cochée -> deux champs séparés : Cartons fermés + Unités seules */
                <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-2xl space-y-3">
                  <div className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                    <Layers className="w-4 h-4 text-amber-600" />
                    <span>Stock initial de départ (2 stocks distincts) :</span>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-xs font-bold text-slate-700 block mb-1">
                        Cartons fermés en stock :
                      </label>
                      <input
                        type="number"
                        min="0"
                        value={initialPacks}
                        onChange={(e) =>
                          setInitialPacks(
                            e.target.value === '' ? '' : Math.max(0, parseInt(e.target.value) || 0)
                          )
                        }
                        className="w-full p-3 text-sm font-bold bg-white border border-slate-300 rounded-xl focus:outline-none focus:border-amber-500"
                        placeholder="0"
                      />
                    </div>

                    <div>
                      <label className="text-xs font-bold text-slate-700 block mb-1">
                        Unités seules en stock :
                      </label>
                      <input
                        type="number"
                        min="0"
                        value={initialUnits}
                        onChange={(e) =>
                          setInitialUnits(
                            e.target.value === '' ? '' : Math.max(0, parseInt(e.target.value) || 0)
                          )
                        }
                        className="w-full p-3 text-sm font-bold bg-white border border-slate-300 rounded-xl focus:outline-none focus:border-amber-500"
                        placeholder="0"
                      />
                    </div>
                  </div>
                </div>
              ) : (
                /* Cas 2 : Vente à l'unité seulement -> champ unique en unités */
                <div>
                  <label className="text-xs font-bold text-slate-700 block mb-1">
                    Stock initial (unités) :
                  </label>
                  <input
                    type="number"
                    min="0"
                    value={initialSingleStock}
                    onChange={(e) =>
                      setInitialSingleStock(
                        e.target.value === '' ? '' : Math.max(0, parseInt(e.target.value) || 0)
                      )
                    }
                    className="w-full p-3 text-sm font-bold bg-slate-50 border border-slate-300 rounded-xl focus:outline-none focus:border-amber-500"
                  />
                </div>
              )}
            </div>
          )}

          {/* SEUILS D'ALERTE (CRÉATION ET ÉDITION) */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
            <div>
              <label className="text-xs font-bold text-slate-700 block mb-1">
                Seuil d'alerte unités seules *
              </label>
              <input
                type="number"
                min="0"
                required
                value={alertThreshold}
                onChange={(e) => setAlertThreshold(Math.max(0, parseInt(e.target.value) || 0))}
                className="w-full p-3 text-sm font-bold bg-slate-50 border border-slate-300 rounded-xl focus:outline-none focus:border-amber-500"
              />
            </div>

            {hasPack && (
              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">
                  Seuil d'alerte cartons (facultatif)
                </label>
                <input
                  type="number"
                  min="0"
                  value={alertThresholdPacks}
                  onChange={(e) =>
                    setAlertThresholdPacks(
                      e.target.value === '' ? '' : Math.max(0, parseInt(e.target.value) || 0)
                    )
                  }
                  placeholder="Ex: 2"
                  className="w-full p-3 text-sm font-bold bg-slate-50 border border-slate-300 rounded-xl focus:outline-none focus:border-amber-500"
                />
              </div>
            )}
          </div>

          {/* Bouton de soumission */}
          <div className="pt-2">
            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full py-4 rounded-2xl bg-amber-600 hover:bg-amber-700 text-white font-black text-base shadow-lg shadow-amber-600/30 transition active:scale-98 flex items-center justify-center gap-2"
            >
              <Check className="w-5 h-5" />
              <span>{productToEdit ? 'Enregistrer les modifications' : 'Créer le Produit'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

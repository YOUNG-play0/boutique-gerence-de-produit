import React, { useState, useEffect, useRef } from 'react';
import { X, Package, Layers, Info, Camera, Image as ImageIcon, RotateCcw, Trash2, RefreshCw } from 'lucide-react';
import { ProductWithStock } from '../../types';
import { createProduct, updateProduct } from '../../services/db';
import { formatGNF, triggerHaptic } from '../../utils/formatters';
import { compressProductImage } from '../../utils/imageCompressor';

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

const PACK_LABEL_OPTIONS = ['carton', 'sac', 'paquet', 'caisse'];

interface PhotoUploadFieldProps {
  label: string;
  subLabel?: string;
  photo?: string;
  fallbackIcon?: string;
  onPhotoChange: (newPhoto?: string) => void;
}

const PhotoUploadField: React.FC<PhotoUploadFieldProps> = ({
  label,
  subLabel,
  photo,
  fallbackIcon,
  onPhotoChange,
}) => {
  const cameraInputRef = useRef<HTMLInputElement | null>(null);
  const galleryInputRef = useRef<HTMLInputElement | null>(null);
  const [isCompressing, setIsCompressing] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      setIsCompressing(true);
      setErrorMsg(null);
      const compressedDataUrl = await compressProductImage(file);
      onPhotoChange(compressedDataUrl);
      triggerHaptic(40);
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : 'Erreur de compression');
    } finally {
      setIsCompressing(false);
      // Reset input value so same file can be re-selected if needed
      e.target.value = '';
    }
  };

  return (
    <div className="space-y-2">
      <div className="flex items-baseline justify-between">
        <label className="text-xs font-bold text-slate-700 block">
          {label} <span className="font-normal text-slate-400 text-[11px]">(facultative)</span>
        </label>
        {subLabel && <span className="text-[11px] text-slate-400">{subLabel}</span>}
      </div>

      {errorMsg && (
        <p className="text-[11px] text-rose-600 font-semibold">{errorMsg}</p>
      )}

      {/* Hidden inputs: One for direct camera (capture="environment"), one for gallery */}
      <input
        ref={cameraInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={handleFile}
      />
      <input
        ref={galleryInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={handleFile}
      />

      {photo ? (
        /* Preview state with Reprendre & Supprimer */
        <div className="flex items-center gap-4">
          <div className="relative w-28 h-28 sm:w-32 sm:h-32 rounded-2xl overflow-hidden border-2 border-amber-500 shadow-md bg-slate-100 flex-shrink-0">
            <img
              src={photo}
              alt={label}
              className="w-full h-full object-cover"
              loading="lazy"
            />
            {isCompressing && (
              <div className="absolute inset-0 bg-black/60 flex items-center justify-center">
                <RefreshCw className="w-6 h-6 text-white animate-spin" />
              </div>
            )}
          </div>

          <div className="space-y-2 flex-1">
            <button
              type="button"
              onClick={() => cameraInputRef.current?.click()}
              className="w-full py-2 px-3 bg-amber-600 hover:bg-amber-700 text-white rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 shadow-xs transition active:scale-95"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Reprendre</span>
            </button>

            <button
              type="button"
              onClick={() => galleryInputRef.current?.click()}
              className="w-full py-1.5 px-3 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5 transition"
            >
              <ImageIcon className="w-3.5 h-3.5 text-slate-500" />
              <span>Changer via galerie</span>
            </button>

            <button
              type="button"
              onClick={() => onPhotoChange(undefined)}
              className="w-full py-1.5 px-3 text-rose-600 hover:bg-rose-50 rounded-xl text-xs font-semibold flex items-center justify-center gap-1 transition"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>Supprimer la photo</span>
            </button>
          </div>
        </div>
      ) : (
        /* Empty state: big clickable camera square + small gallery button */
        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
          <button
            type="button"
            onClick={() => cameraInputRef.current?.click()}
            disabled={isCompressing}
            className="w-28 h-28 sm:w-32 sm:h-32 rounded-2xl border-2 border-dashed border-amber-300 hover:border-amber-500 bg-amber-50/50 hover:bg-amber-50 transition active:scale-95 flex flex-col items-center justify-center text-center p-2 text-amber-900 group shadow-xs flex-shrink-0"
          >
            {isCompressing ? (
              <RefreshCw className="w-8 h-8 text-amber-600 animate-spin mb-1" />
            ) : (
              <Camera className="w-8 h-8 text-amber-600 group-hover:scale-110 transition mb-1" />
            )}
            <span className="text-xs font-black">Prendre photo</span>
            <span className="text-[10px] text-slate-400 font-medium">(Appareil photo)</span>
          </button>

          <div className="space-y-1.5">
            <button
              type="button"
              onClick={() => galleryInputRef.current?.click()}
              className="py-2 px-3 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs rounded-xl flex items-center gap-1.5 transition active:scale-95"
            >
              <ImageIcon className="w-4 h-4 text-slate-500" />
              <span>Choisir dans la galerie</span>
            </button>

            <p className="text-[11px] text-slate-400 leading-tight">
              Sans photo, une icône générique {fallbackIcon ? `« ${fallbackIcon} »` : '📦'} sera utilisée.
            </p>
          </div>
        </div>
      )}
    </div>
  );
};

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
  const [barcode, setBarcode] = useState('');

  // Photos
  const [photo, setPhoto] = useState<string | undefined>(undefined);
  const [packPhoto, setPackPhoto] = useState<string | undefined>(undefined);

  // Carton / Format groupé
  const [hasPack, setHasPack] = useState(false);
  const [packLabel, setPackLabel] = useState('carton');
  const [packSize, setPackSize] = useState<number | ''>(24);
  const [packPrice, setPackPrice] = useState<number | ''>(100000);

  // Saisie stock initial (création)
  const [initialPacks, setInitialPacks] = useState<number | ''>(0);
  const [initialUnits, setInitialUnits] = useState<number | ''>(0);
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
      setPhoto(productToEdit.photo);
      setPackPhoto(productToEdit.packPhoto);

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
      setPhoto(undefined);
      setPackPhoto(undefined);
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
    if (isSubmitting) return;

    if (!name.trim()) {
      setError('Veuillez entrer le nom du produit.');
      return;
    }

    const numPrice = Number(price);
    if (price === '' || isNaN(numPrice) || numPrice <= 0) {
      setError("Veuillez spécifier un prix à l'unité valide supérieur à zéro.");
      return;
    }

    if (numPrice > 100_000_000) {
      setError("Le prix unitaire ne peut pas dépasser 100 000 000 GNF.");
      return;
    }

    if (hasPack) {
      const numPackSize = Number(packSize);
      if (!packSize || isNaN(numPackSize) || numPackSize < 2 || numPackSize > 10_000) {
        setError("Le nombre d'unités dans un carton doit être compris entre 2 et 10 000.");
        return;
      }

      const numPackPrice = Number(packPrice);
      if (packPrice === '' || isNaN(numPackPrice) || numPackPrice <= 0) {
        setError('Le prix du carton doit être supérieur à zéro.');
        return;
      }

      if (numPackPrice > 100_000_000) {
        setError('Le prix du carton ne peut pas dépasser 100 000 000 GNF.');
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
        imageUrl: productToEdit?.imageUrl || '📦',
        photo: photo || undefined,
        packPhoto: hasPack && packPhoto ? packPhoto : undefined,
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

          {/* Photo du produit (remplace la grille d'icônes) */}
          <PhotoUploadField
            label="Photo du produit"
            subLabel="À l'unité"
            photo={photo}
            fallbackIcon={productToEdit?.imageUrl}
            onPhotoChange={setPhoto}
          />

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
                step="1"
                min="0"
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
                {/* Photo du carton */}
                <PhotoUploadField
                  label={`Photo du ${packLabel}`}
                  subLabel="Format carton"
                  photo={packPhoto}
                  fallbackIcon={productToEdit?.imageUrl}
                  onPhotoChange={setPackPhoto}
                />

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
                        min="0"
                        step="1"
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
                      />
                    </div>
                  </div>
                </div>
              ) : (
                <div>
                  <label className="text-xs font-bold text-slate-700 block mb-1">
                    Stock initial en rayon (unités seules) :
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

          {/* Seuils d'alerte stock */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
            <div>
              <label className="text-xs font-bold text-slate-700 block mb-1">
                Alerte stock bas (unités) :
              </label>
              <input
                type="number"
                min="0"
                value={alertThreshold}
                onChange={(e) => setAlertThreshold(Math.max(0, parseInt(e.target.value) || 0))}
                className="w-full p-3 text-xs bg-slate-50 border border-slate-300 rounded-xl focus:outline-none focus:border-amber-500 font-semibold"
              />
            </div>

            {hasPack && (
              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">
                  Alerte {packLabel}s fermés (facultatif) :
                </label>
                <input
                  type="number"
                  min="0"
                  placeholder="Ex: 2"
                  value={alertThresholdPacks}
                  onChange={(e) =>
                    setAlertThresholdPacks(
                      e.target.value === '' ? '' : Math.max(0, parseInt(e.target.value) || 0)
                    )
                  }
                  className="w-full p-3 text-xs bg-slate-50 border border-slate-300 rounded-xl focus:outline-none focus:border-amber-500 font-semibold"
                />
              </div>
            )}
          </div>

          {/* Code barre ou référence */}
          <div>
            <label className="text-xs font-bold text-slate-700 block mb-1">
              Code barre ou référence (facultatif) :
            </label>
            <input
              type="text"
              placeholder="Ex: 619240123456"
              value={barcode}
              onChange={(e) => setBarcode(e.target.value)}
              className="w-full p-3 text-xs bg-slate-50 border border-slate-300 rounded-xl focus:outline-none focus:border-amber-500"
            />
          </div>

          {/* Submit button */}
          <div className="pt-2">
            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full py-4 bg-amber-600 hover:bg-amber-700 active:scale-95 text-white font-black text-sm rounded-2xl shadow-lg shadow-amber-600/30 transition flex items-center justify-center gap-2"
            >
              <span>{productToEdit ? 'Enregistrer les modifications' : 'Créer le produit'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

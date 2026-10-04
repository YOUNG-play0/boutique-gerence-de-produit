import React, { useState, useEffect, useMemo } from 'react';
import QRCode from 'qrcode';
import {
  Printer,
  X,
  ArrowLeft,
  CheckSquare,
  Square,
  FileText,
  Eye,
  Check,
  QrCode as QrIcon,
  Search,
} from 'lucide-react';
import { ProductWithStock } from '../../types';
import { formatGNF, triggerHaptic } from '../../utils/formatters';

export type LabelSize = 'mini' | 'petite' | 'moyenne' | 'grande';

interface LabelSizeConfig {
  id: LabelSize;
  label: string;
  dimensionText: string;
  widthCss: string;
  minHeightCss: string;
  qrPx: number;
  printGridClass: string;
  previewGridClass: string;
  labelsPerPageA4: number;
  nameClass: string;
  priceClass: string;
}

const LABEL_SIZES: Record<LabelSize, LabelSizeConfig> = {
  mini: {
    id: 'mini',
    label: 'Mini',
    dimensionText: 'env. 2,5 cm',
    widthCss: 'w-[2.5cm]',
    minHeightCss: 'min-h-[3.2cm]',
    qrPx: 85,
    printGridClass: 'print:grid-cols-7',
    previewGridClass: 'grid-cols-3 sm:grid-cols-5 md:grid-cols-7',
    labelsPerPageA4: 49, // 7 colonnes x 7 rangées
    nameClass: 'text-[9px]',
    priceClass: 'text-[8px]',
  },
  petite: {
    id: 'petite',
    label: 'Petite',
    dimensionText: 'env. 3 cm',
    widthCss: 'w-[3.3cm]',
    minHeightCss: 'min-h-[4.0cm]',
    qrPx: 110,
    printGridClass: 'print:grid-cols-5',
    previewGridClass: 'grid-cols-2 sm:grid-cols-4 md:grid-cols-5',
    labelsPerPageA4: 30, // 5 colonnes x 6 rangées
    nameClass: 'text-[10px]',
    priceClass: 'text-[9px]',
  },
  moyenne: {
    id: 'moyenne',
    label: 'Moyenne',
    dimensionText: 'env. 4 cm',
    widthCss: 'w-[4.4cm]',
    minHeightCss: 'min-h-[5.2cm]',
    qrPx: 145,
    printGridClass: 'print:grid-cols-4',
    previewGridClass: 'grid-cols-2 sm:grid-cols-3 md:grid-cols-4',
    labelsPerPageA4: 20, // 4 colonnes x 5 rangées
    nameClass: 'text-xs',
    priceClass: 'text-[10px]',
  },
  grande: {
    id: 'grande',
    label: 'Grande',
    dimensionText: 'env. 5 cm',
    widthCss: 'w-[5.8cm]',
    minHeightCss: 'min-h-[6.8cm]',
    qrPx: 190,
    printGridClass: 'print:grid-cols-3',
    previewGridClass: 'grid-cols-2 sm:grid-cols-3',
    labelsPerPageA4: 12, // 3 colonnes x 4 rangées
    nameClass: 'text-sm',
    priceClass: 'text-xs',
  },
};

interface PrintQRCodesModalProps {
  isOpen: boolean;
  products: ProductWithStock[];
  onClose: () => void;
}

export const PrintQRCodesModal: React.FC<PrintQRCodesModalProps> = ({
  isOpen,
  products,
  onClose,
}) => {
  // Tous cochés par défaut
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set(products.map((p) => p.id)));
  // "Moyenne" par défaut
  const [selectedSize, setSelectedSize] = useState<LabelSize>('moyenne');
  const [showProductList, setShowProductList] = useState(false);
  const [searchFilter, setSearchFilter] = useState('');
  // Cache local des data URLs de QR codes générés
  const [qrCodeUrls, setQrCodeUrls] = useState<Record<string, string>>({});
  const [isGenerating, setIsGenerating] = useState(false);

  // Synchronise la sélection si la liste des produits change
  useEffect(() => {
    if (isOpen) {
      setSelectedIds(new Set(products.map((p) => p.id)));
    }
  }, [isOpen, products]);

  const currentConfig = LABEL_SIZES[selectedSize];

  // Produits sélectionnés
  const selectedProducts = useMemo(() => {
    return products.filter((p) => selectedIds.has(p.id));
  }, [products, selectedIds]);

  // Génération locale des QR codes sans internet
  // Niveau de correction d'erreur M ('M')
  useEffect(() => {
    if (!isOpen || selectedProducts.length === 0) return;

    let isMounted = true;
    setIsGenerating(true);

    const generateAll = async () => {
      const newUrls: Record<string, string> = { ...qrCodeUrls };
      const cacheKeySuffix = `_${currentConfig.id}`;

      for (const product of selectedProducts) {
        const fullKey = `${product.id}${cacheKeySuffix}`;
        if (!newUrls[fullKey]) {
          try {
            // Un seul QR par produit (encodage du product.id avec niveau M)
            const url = await QRCode.toDataURL(product.id, {
              errorCorrectionLevel: 'M',
              margin: 2,
              width: currentConfig.qrPx,
              color: {
                dark: '#000000',
                light: '#ffffff',
              },
            });
            newUrls[fullKey] = url;
          } catch (err) {
            console.error(`Erreur génération QR pour ${product.name}:`, err);
          }
        }
      }

      if (isMounted) {
        setQrCodeUrls(newUrls);
        setIsGenerating(false);
      }
    };

    generateAll();

    return () => {
      isMounted = false;
    };
  }, [isOpen, selectedProducts, currentConfig]);

  if (!isOpen) return null;

  // Calcul du nombre de pages A4 estimées
  const totalSelected = selectedProducts.length;
  const estimatedPages = totalSelected > 0 ? Math.ceil(totalSelected / currentConfig.labelsPerPageA4) : 0;

  // Gestion de la sélection
  const handleToggleProduct = (id: string) => {
    triggerHaptic(20);
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const handleToggleAll = () => {
    triggerHaptic(30);
    if (selectedIds.size === products.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(products.map((p) => p.id)));
    }
  };

  const handlePrint = () => {
    triggerHaptic(50);
    window.print();
  };

  const filteredForChecklist = products.filter((p) =>
    p.name.toLowerCase().includes(searchFilter.toLowerCase().trim())
  );

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex flex-col justify-start overflow-y-auto print:static print:inset-auto print:z-auto print:bg-white print:overflow-visible print:block">
      {/* Container global avec isolation pour impression */}
      <div className="min-h-full bg-slate-100 flex flex-col text-slate-800 print:bg-white print:min-h-0 print:p-0 print:block">
        {/* BARRE DE CONTRÔLE SUPÉRIEURE (masquée à l'impression via .no-print) */}
        <header className="no-print sticky top-0 z-20 bg-white border-b border-slate-200 px-4 py-3 shadow-xs">
          <div className="max-w-6xl mx-auto flex flex-wrap items-center justify-between gap-3">
            {/* Titre & Retour */}
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={onClose}
                className="p-2 -ml-1 rounded-xl text-slate-500 hover:text-slate-800 hover:bg-slate-100 transition active:scale-95"
                title="Retour au catalogue"
              >
                <ArrowLeft className="w-5 h-5" />
              </button>
              <div>
                <div className="flex items-center gap-2">
                  <h1 className="text-base sm:text-lg font-black text-slate-900 leading-tight">
                    Imprimer les QR Codes
                  </h1>
                  <span className="text-[10px] font-black uppercase tracking-wider bg-amber-100 text-amber-800 px-2 py-0.5 rounded-full">
                    A4 PDF
                  </span>
                </div>
                <p className="text-xs text-slate-500">
                  {totalSelected} étiquette{totalSelected > 1 ? 's' : ''} • {estimatedPages} page{estimatedPages > 1 ? 's' : ''} A4 estimée{estimatedPages > 1 ? 's' : ''}
                </p>
              </div>
            </div>

            {/* Boutons d'action rapides */}
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setShowProductList(!showProductList)}
                className={`py-2 px-3 rounded-xl border text-xs font-bold flex items-center gap-1.5 transition active:scale-95 ${
                  showProductList
                    ? 'bg-amber-50 border-amber-300 text-amber-800'
                    : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
                }`}
              >
                <CheckSquare className="w-4 h-4 text-amber-600" />
                <span>Sélection ({totalSelected})</span>
              </button>

              <button
                type="button"
                onClick={handlePrint}
                disabled={totalSelected === 0}
                className="py-2.5 px-4 bg-amber-600 hover:bg-amber-700 disabled:bg-slate-300 active:scale-95 text-white font-black text-xs sm:text-sm rounded-xl shadow-md shadow-amber-600/30 transition flex items-center gap-2 cursor-pointer"
              >
                <Printer className="w-4 h-4" />
                <span>Imprimer</span>
              </button>

              <button
                type="button"
                onClick={onClose}
                className="p-2 rounded-xl text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition"
                title="Fermer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>
        </header>

        {/* BARRE DE PARAMÈTRES (Sélection de la taille & Tout cocher) */}
        <section className="no-print bg-white/80 border-b border-slate-200 px-4 py-3 shadow-2xs">
          <div className="max-w-6xl mx-auto flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            {/* Choix de la taille */}
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs font-bold text-slate-600 mr-1 flex items-center gap-1">
                <FileText className="w-3.5 h-3.5 text-amber-600" />
                <span>Taille :</span>
              </span>
              <div className="inline-flex p-1 bg-slate-100 rounded-xl border border-slate-200">
                {(Object.keys(LABEL_SIZES) as LabelSize[]).map((sizeKey) => {
                  const cfg = LABEL_SIZES[sizeKey];
                  const isActive = selectedSize === sizeKey;
                  return (
                    <button
                      key={sizeKey}
                      type="button"
                      onClick={() => {
                        triggerHaptic(20);
                        setSelectedSize(sizeKey);
                      }}
                      className={`py-1.5 px-3 rounded-lg text-xs font-bold transition flex items-center gap-1.5 ${
                        isActive
                          ? 'bg-amber-600 text-white shadow-xs'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      <span>{cfg.label}</span>
                      <span
                        className={`text-[10px] font-normal ${
                          isActive ? 'text-amber-100' : 'text-slate-400'
                        }`}
                      >
                        ({cfg.dimensionText})
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Bouton Tout cocher / Tout décocher */}
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleToggleAll}
                className="py-1.5 px-3 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold flex items-center gap-1.5 transition active:scale-95 border border-slate-200"
              >
                {selectedIds.size === products.length ? (
                  <>
                    <Square className="w-3.5 h-3.5 text-slate-500" />
                    <span>Tout décocher</span>
                  </>
                ) : (
                  <>
                    <CheckSquare className="w-3.5 h-3.5 text-amber-600" />
                    <span>Tout cocher</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </section>

        {/* PANNEAU DE SÉLECTION DÉPLIABLE DES PRODUITS */}
        {showProductList && (
          <aside className="no-print bg-amber-50/60 border-b border-amber-200/80 px-4 py-3 animate-in slide-in-from-top-2 duration-150">
            <div className="max-w-6xl mx-auto">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-bold text-amber-950">
                  Cochez les produits à imprimer ({selectedIds.size} / {products.length}) :
                </span>
                <button
                  type="button"
                  onClick={() => setShowProductList(false)}
                  className="text-xs text-amber-800 font-bold hover:underline"
                >
                  Masquer la liste
                </button>
              </div>

              {/* Recherche rapide */}
              <div className="relative mb-3 max-w-sm">
                <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  placeholder="Filtrer un produit..."
                  value={searchFilter}
                  onChange={(e) => setSearchFilter(e.target.value)}
                  className="w-full pl-8 pr-3 py-1.5 bg-white border border-amber-200 rounded-xl text-xs focus:outline-none focus:border-amber-500 font-medium"
                />
              </div>

              {/* Liste de cases à cocher */}
              <div className="max-h-60 overflow-y-auto grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2 pr-1">
                {filteredForChecklist.map((prod) => {
                  const isChecked = selectedIds.has(prod.id);
                  return (
                    <label
                      key={prod.id}
                      className={`flex items-center gap-2 p-2 rounded-xl border text-xs cursor-pointer select-none transition ${
                        isChecked
                          ? 'bg-white border-amber-400 shadow-2xs font-bold text-slate-900'
                          : 'bg-white/60 border-slate-200 text-slate-500'
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={isChecked}
                        onChange={() => handleToggleProduct(prod.id)}
                        className="w-4 h-4 rounded text-amber-600 border-slate-300 focus:ring-amber-500"
                      />
                      <div className="w-6 h-6 rounded-md bg-amber-50 flex items-center justify-center text-xs flex-shrink-0 border border-amber-100 overflow-hidden">
                        {prod.photo ? (
                          <img src={prod.photo} alt={prod.name} className="w-full h-full object-cover" loading="lazy" />
                        ) : (
                          <span>{prod.imageUrl || '📦'}</span>
                        )}
                      </div>
                      <div className="min-w-0 flex-1 truncate">
                        <span className="truncate block">{prod.name}</span>
                        <span className="text-[10px] font-normal text-amber-700">
                          {formatGNF(prod.price)}
                        </span>
                      </div>
                    </label>
                  );
                })}
              </div>
            </div>
          </aside>
        )}

        {/* ZONE D'APERÇU À L'ÉCRAN & ZONE D'IMPRESSION PHYSIQUE */}
        <main className="flex-1 p-4 sm:p-6 max-w-6xl mx-auto w-full print:p-0 print:m-0 print:max-w-none">
          {/* Bannière explicative d'aperçu */}
          <div className="no-print mb-4 flex items-center justify-between text-xs text-slate-500 bg-white p-3 rounded-2xl border border-slate-200 shadow-2xs">
            <div className="flex items-center gap-2">
              <Eye className="w-4 h-4 text-amber-600 flex-shrink-0" />
              <span>
                <strong>Aperçu avant impression :</strong> Chaque étiquette possède une bordure en pointillés pour faciliter la découpe. Enregistrez en <strong>PDF</strong> ou imprimez directement en A4.
              </span>
            </div>
            {isGenerating && (
              <span className="text-amber-700 font-bold animate-pulse text-[11px] whitespace-nowrap ml-2">
                Génération des QR...
              </span>
            )}
          </div>

          {/* Si aucun produit sélectionné */}
          {totalSelected === 0 ? (
            <div className="no-print text-center py-16 bg-white rounded-3xl border border-dashed border-slate-300 p-6">
              <QrIcon className="w-10 h-10 text-slate-300 mx-auto mb-2" />
              <h3 className="text-base font-bold text-slate-700">Aucun produit sélectionné</h3>
              <p className="text-xs text-slate-400 mt-1">
                Cochez au moins un produit dans la sélection ci-dessus pour générer la planche d'étiquettes.
              </p>
              <button
                type="button"
                onClick={handleToggleAll}
                className="mt-4 px-4 py-2 bg-amber-600 text-white font-bold text-xs rounded-xl shadow-xs"
              >
                Tout sélectionner
              </button>
            </div>
          ) : (
            /* FEUILLE D'IMPRESSION A4 RECTANGLE BLANC */
            <div
              id="qr-print-sheet"
              className="bg-white rounded-2xl shadow-lg border border-slate-200 p-4 sm:p-6 mx-auto print:border-none print:shadow-none print:p-0 print:m-0 print:w-full"
            >
              {/* Grille d'étiquettes */}
              <div
                className={`grid gap-2 print:gap-1.5 justify-center items-start ${currentConfig.previewGridClass} ${currentConfig.printGridClass}`}
                style={{
                  gridAutoRows: 'max-content',
                }}
              >
                {selectedProducts.map((product) => {
                  const cacheKey = `${product.id}_${currentConfig.id}`;
                  const qrDataUrl = qrCodeUrls[cacheKey];

                  return (
                    <article
                      key={product.id}
                      className={`break-inside-avoid page-break-inside-avoid bg-white border border-dashed border-slate-400 rounded-lg p-1.5 flex flex-col items-center justify-between text-center ${currentConfig.widthCss} ${currentConfig.minHeightCss} transition-shadow hover:shadow-xs`}
                      style={{
                        pageBreakInside: 'avoid',
                        breakInside: 'avoid',
                      }}
                    >
                      {/* Image QR Code */}
                      <div className="w-full flex items-center justify-center p-0.5 bg-white">
                        {qrDataUrl ? (
                          <img
                            src={qrDataUrl}
                            alt={`QR ${product.name}`}
                            className="w-auto h-auto max-w-full object-contain mx-auto"
                            style={{
                              imageRendering: 'crisp-edges',
                            }}
                          />
                        ) : (
                          <div
                            className="bg-slate-100 rounded flex items-center justify-center text-slate-300"
                            style={{
                              width: currentConfig.qrPx / 2,
                              height: currentConfig.qrPx / 2,
                            }}
                          >
                            <QrIcon className="w-6 h-6 animate-pulse" />
                          </div>
                        )}
                      </div>

                      {/* Nom du produit en gras sous le QR */}
                      <div className="w-full px-0.5 mt-1">
                        <div
                          className={`font-black text-slate-900 leading-tight line-clamp-2 ${currentConfig.nameClass}`}
                          title={product.name}
                        >
                          {product.name}
                        </div>

                        {/* Prix à l'unité en petit */}
                        <div
                          className={`font-bold text-slate-700 tracking-tight mt-0.5 ${currentConfig.priceClass}`}
                        >
                          {formatGNF(product.price)}
                          <span className="font-normal text-slate-400 text-[9px] ml-0.5">/un.</span>
                        </div>
                      </div>
                    </article>
                  );
                })}
              </div>
            </div>
          )}
        </main>
      </div>
    </div>
  );
};

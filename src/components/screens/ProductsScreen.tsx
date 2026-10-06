import React, { useState, useMemo } from 'react';
import {
  Plus,
  Search,
  QrCode,
  PackagePlus,
  SlidersHorizontal,
  Edit,
  AlertTriangle,
  History,
  Trash2,
  Layers,
  Box,
  Package,
  X,
  Printer,
} from 'lucide-react';
import { ProductWithStock, StockMovement } from '../../types';
import { formatGNF, formatDateFrench, playSuccessChime, triggerHaptic } from '../../utils/formatters';
import { deleteProduct, getAllStockMovements, openPack } from '../../services/db';

const PrintQRCodesModal = React.lazy(() =>
  import('../products/PrintQRCodesModal').then((m) => ({ default: m.PrintQRCodesModal }))
);

interface ProductsScreenProps {
  products: ProductWithStock[];
  onOpenCreateModal: () => void;
  onOpenEditModal: (product: ProductWithStock) => void;
  onOpenQRCode: (product: ProductWithStock) => void;
  onOpenReappro: (product: ProductWithStock) => void;
  onOpenCorrection: (product: ProductWithStock) => void;
  onRefreshData: () => void;
}

type ProductFilterTab = 'all' | 'units' | 'packs' | 'lowStock';

export const ProductsScreen: React.FC<ProductsScreenProps> = ({
  products,
  onOpenCreateModal,
  onOpenEditModal,
  onOpenQRCode,
  onOpenReappro,
  onOpenCorrection,
  onRefreshData,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [activeTab, setActiveTab] = useState<ProductFilterTab>('all');
  const [showHistoryModal, setShowHistoryModal] = useState<ProductWithStock | null>(null);
  const [productMovements, setProductMovements] = useState<StockMovement[]>([]);
  const [isOpeningPack, setIsOpeningPack] = useState<string | null>(null);
  const [isPrintQROpen, setIsPrintQROpen] = useState(false);
  const [visibleProductsLimit, setVisibleProductsLimit] = useState(50);

  // Compteurs mis à jour en direct dès que products change
  const totalCount = products.length;
  // Tous les produits se vendent à l'unité
  const unitsCount = products.length;
  // Produits avec format carton
  const packsCount = useMemo(
    () => products.filter((p) => p.packSize && p.packSize >= 2 && p.packPrice).length,
    [products]
  );
  // Produits en alerte stock bas
  const lowStockCount = useMemo(() => products.filter((p) => p.isLowStock).length, [products]);

  // Filtrage selon l'onglet actif et recherche
  const filteredProducts = useMemo(() => {
    return products.filter((p) => {
      // Filtre selon l'onglet
      if (activeTab === 'packs' && !(p.packSize && p.packSize >= 2 && p.packPrice)) {
        return false;
      }
      if (activeTab === 'lowStock' && !p.isLowStock) {
        return false;
      }
      // 'units' et 'all' contiennent tous les produits

      // Recherche dans l'onglet actif
      const query = searchQuery.toLowerCase().trim();
      if (!query) return true;

      const matchName = p.name.toLowerCase().includes(query);
      const matchCategory = p.category?.toLowerCase().includes(query);
      const matchUnitPrice = p.price.toString().includes(query);
      const matchPackPrice = p.packPrice ? p.packPrice.toString().includes(query) : false;
      const matchBarcode = p.barcode ? p.barcode.includes(query) : false;

      return matchName || matchCategory || matchUnitPrice || matchPackPrice || matchBarcode;
    });
  }, [products, searchQuery, activeTab]);

  const handleOpenHistory = async (product: ProductWithStock) => {
    setShowHistoryModal(product);
    const allMovs = await getAllStockMovements();
    const filtered = allMovs
      .filter((m) => m.productId === product.id)
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    setProductMovements(filtered);
  };

  const handleDelete = async (productId: string, name: string) => {
    if (window.confirm(`Confirmez-vous la suppression du produit « ${name} » ?\n\nSes photos et ses mouvements de stock seront également supprimés.`)) {
      await deleteProduct(productId);
      onRefreshData();
    }
  };

  const handleOpenPackAction = async (product: ProductWithStock) => {
    if (product.stockPacks <= 0) {
      alert(`Aucun ${product.packLabel || 'carton'} fermé disponible à ouvrir.`);
      return;
    }

    const label = product.packLabel || 'carton';
    if (
      !window.confirm(
        `Ouvrir 1 ${label} de « ${product.name} » ?\n\nCela va retirer 1 ${label} fermé (-1) et ajouter +${product.packSize} unités seules au stock.`
      )
    ) {
      return;
    }

    try {
      setIsOpeningPack(product.id);
      await openPack(product.id);
      playSuccessChime();
      triggerHaptic(60);
      onRefreshData();
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : "Erreur lors de l'ouverture du carton");
    } finally {
      setIsOpeningPack(null);
    }
  };

  return (
    <div className="pb-28 pt-2 px-3 sm:px-4 max-w-5xl mx-auto space-y-4">
      {/* Top Banner & Quick Add Button */}
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-black text-slate-900">Catalogue & Stock</h2>
          <p className="text-xs text-slate-500 font-medium">
            {totalCount} référence{totalCount > 1 ? 's' : ''} enregistrée{totalCount > 1 ? 's' : ''}
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => {
              triggerHaptic(20);
              setIsPrintQROpen(true);
            }}
            className="flex items-center gap-1.5 px-3 sm:px-4 py-3 bg-white hover:bg-slate-50 border border-slate-300 text-slate-800 font-bold text-xs sm:text-sm rounded-2xl shadow-xs transition active:scale-95 flex-shrink-0"
            title="Imprimer les codes QR de vos produits sur feuille A4"
          >
            <Printer className="w-4 h-4 text-amber-600" />
            <span className="hidden sm:inline">Imprimer les QR</span>
            <span className="sm:hidden">Imprimer QR</span>
          </button>

          <button
            onClick={onOpenCreateModal}
            className="flex items-center gap-2 px-3 sm:px-4 py-3 bg-amber-600 hover:bg-amber-700 active:scale-95 text-white font-black text-xs sm:text-sm rounded-2xl shadow-md shadow-amber-600/30 transition flex-shrink-0"
          >
            <Plus className="w-4 h-4" />
            <span>Nouveau Produit</span>
          </button>
        </div>
      </div>

      {/* 4 Onglets : Tous, Unités, Cartons, Stock bas */}
      <div className="grid grid-cols-4 gap-1 sm:gap-2 p-1 bg-slate-200/80 rounded-2xl">
        <button
          type="button"
          onClick={() => {
            triggerHaptic(20);
            setActiveTab('all');
          }}
          className={`py-2.5 px-1 rounded-xl text-xs font-bold transition truncate text-center ${
            activeTab === 'all'
              ? 'bg-white text-slate-900 shadow-sm font-black'
              : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          Tous ({totalCount})
        </button>

        <button
          type="button"
          onClick={() => {
            triggerHaptic(20);
            setActiveTab('units');
          }}
          className={`py-2.5 px-1 rounded-xl text-xs font-bold transition truncate flex items-center justify-center gap-1 ${
            activeTab === 'units'
              ? 'bg-white text-amber-900 shadow-sm font-black'
              : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          <Package className="w-3.5 h-3.5 hidden sm:inline" />
          <span>Unités ({unitsCount})</span>
        </button>

        <button
          type="button"
          onClick={() => {
            triggerHaptic(20);
            setActiveTab('packs');
          }}
          className={`py-2.5 px-1 rounded-xl text-xs font-bold transition truncate flex items-center justify-center gap-1 ${
            activeTab === 'packs'
              ? 'bg-white text-amber-900 shadow-sm font-black'
              : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          <Layers className="w-3.5 h-3.5 hidden sm:inline" />
          <span>Cartons ({packsCount})</span>
        </button>

        <button
          type="button"
          onClick={() => {
            triggerHaptic(20);
            setActiveTab('lowStock');
          }}
          className={`py-2.5 px-1 rounded-xl text-xs font-bold transition truncate flex items-center justify-center gap-1 ${
            activeTab === 'lowStock'
              ? 'bg-rose-600 text-white shadow-sm font-black'
              : 'text-rose-700 hover:text-rose-900'
          }`}
        >
          <AlertTriangle className="w-3.5 h-3.5 hidden sm:inline" />
          <span>Stock bas ({lowStockCount})</span>
        </button>
      </div>

      {/* Search Bar */}
      <div className="relative">
        <Search className="w-5 h-5 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
        <input
          type="text"
          placeholder={
            activeTab === 'packs'
              ? 'Rechercher un produit carton...'
              : activeTab === 'units'
              ? 'Rechercher un produit à l’unité...'
              : activeTab === 'lowStock'
              ? 'Rechercher dans les alertes stock...'
              : 'Rechercher un article (nom, prix, code-barres)...'
          }
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="w-full pl-11 pr-4 py-3 bg-white border border-slate-200 rounded-2xl text-xs sm:text-sm font-semibold text-slate-800 placeholder-slate-400 focus:outline-none focus:border-amber-500 shadow-xs"
        />
      </div>

      {/* Product List */}
      <div className="space-y-3">
        {filteredProducts.length === 0 ? (
          <div className="text-center py-12 bg-white rounded-3xl p-6 border border-dashed border-amber-200">
            <p className="text-base font-bold text-slate-700">Aucun produit trouvé</p>
            <p className="text-xs text-slate-400 mt-1">
              {activeTab === 'packs'
                ? "Aucun produit n'a encore de format carton configuré."
                : activeTab === 'lowStock'
                ? 'Tous vos stocks sont actuellement suffisants !'
                : 'Appuyez sur « Nouveau Produit » pour commencer.'}
            </p>
          </div>
        ) : (
          <>
            {filteredProducts.slice(0, visibleProductsLimit).map((product) => {
            const hasPack = !!(product.packSize && product.packSize >= 2 && product.packPrice);
            const packLabel = product.packLabel || 'carton';

            // Photo à afficher selon l'onglet : photo du carton si onglet cartons, sinon photo produit
            const displayPhoto =
              activeTab === 'packs'
                ? product.packPhoto || product.photo
                : product.photo;

            return (
              <div
                key={product.id}
                className={`bg-white rounded-3xl p-4 border-2 shadow-xs transition ${
                  product.isLowStock
                    ? 'border-amber-400 bg-amber-50/20'
                    : 'border-slate-200/80 hover:border-amber-200'
                }`}
              >
                {/* Top Row: Info */}
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-start gap-3 min-w-0">
                    {/* Photo carrée avec object-fit: cover ou fallback emoji/icône */}
                    <div className="w-13 h-13 sm:w-14 sm:h-14 rounded-2xl overflow-hidden bg-amber-50 border border-amber-200/70 flex items-center justify-center flex-shrink-0 shadow-xs">
                      {displayPhoto ? (
                        <img
                          src={displayPhoto}
                          alt={product.name}
                          className="w-full h-full object-cover"
                          loading="lazy"
                        />
                      ) : (
                        <span className="text-2xl">{product.imageUrl || '📦'}</span>
                      )}
                    </div>

                    <div className="min-w-0">
                      <h3 className="text-sm font-black text-slate-900 truncate">
                        {product.name}
                      </h3>
                      <div className="text-xs text-slate-500 font-medium">
                        {product.category || 'Article'}
                      </div>

                      {/* Affichage des prix selon l'onglet */}
                      {activeTab === 'packs' ? (
                        /* Onglet Cartons : prix du carton et taille */
                        <div className="flex flex-wrap items-baseline gap-2 mt-0.5">
                          <span className="text-base font-black text-amber-700">
                            {formatGNF(product.packPrice || 0)}{' '}
                            <span className="text-[10px] font-normal text-slate-500">
                              /{packLabel} ({product.packSize} unités)
                            </span>
                          </span>
                        </div>
                      ) : activeTab === 'units' ? (
                        /* Onglet Unités : prix à l'unité */
                        <div className="flex flex-wrap items-baseline gap-2 mt-0.5">
                          <span className="text-base font-black text-amber-700">
                            {formatGNF(product.price)}{' '}
                            <span className="text-[10px] font-normal text-slate-500">/unité</span>
                          </span>
                        </div>
                      ) : (
                        /* Onglets Tous et Stock bas : prix unité et prix carton si dispo */
                        <div className="flex flex-wrap items-baseline gap-2 mt-0.5">
                          <span className="text-base font-black text-amber-700">
                            {formatGNF(product.price)}{' '}
                            <span className="text-[10px] font-normal text-slate-500">/unité</span>
                          </span>
                          {hasPack && (
                            <span className="text-xs font-bold text-slate-700 bg-amber-100/60 px-2 py-0.5 rounded-lg border border-amber-200">
                              {formatGNF(product.packPrice!)} /{packLabel} ({product.packSize} un.)
                            </span>
                          )}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Stock Display */}
                  <div className="text-right flex flex-col items-end flex-shrink-0">
                    {activeTab === 'packs' ? (
                      /* Onglet Cartons : cartons fermés en stock */
                      <>
                        <div
                          className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-black ${
                            product.isLowStockPacks
                              ? 'bg-rose-100 text-rose-900 border border-rose-300'
                              : 'bg-emerald-100 text-emerald-900 border border-emerald-200'
                          }`}
                        >
                          {product.isLowStockPacks && <AlertTriangle className="w-3.5 h-3.5 text-rose-600" />}
                          <span>
                            {product.stockPacks} {packLabel}{product.stockPacks > 1 ? 's' : ''} fermé{product.stockPacks > 1 ? 's' : ''}
                          </span>
                        </div>
                        {product.alertThresholdPacks !== undefined && (
                          <span className="text-[10px] text-slate-400 mt-1">
                            Alerte à {product.alertThresholdPacks} {packLabel}s
                          </span>
                        )}
                      </>
                    ) : activeTab === 'units' ? (
                      /* Onglet Unités : unités seules en stock */
                      <>
                        <div
                          className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-black ${
                            product.isLowStockUnits
                              ? 'bg-rose-100 text-rose-900 border border-rose-300'
                              : 'bg-emerald-100 text-emerald-900 border border-emerald-200'
                          }`}
                        >
                          {product.isLowStockUnits && <AlertTriangle className="w-3.5 h-3.5 text-rose-600" />}
                          <span>
                            {product.stockUnits} unité{product.stockUnits > 1 ? 's' : ''} seule{product.stockUnits > 1 ? 's' : ''}
                          </span>
                        </div>
                        <span className="text-[10px] text-slate-400 mt-1">
                          Alerte à {product.alertThreshold} unités
                        </span>
                      </>
                    ) : (
                      /* Onglets Tous et Stock bas : "12 cartons + 7 unités" */
                      <>
                        <div
                          className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-black ${
                            product.isLowStock
                              ? 'bg-amber-100 text-amber-900 border border-amber-300'
                              : 'bg-emerald-100 text-emerald-900 border border-emerald-200'
                          }`}
                        >
                          {product.isLowStock && <AlertTriangle className="w-3.5 h-3.5 text-amber-600" />}
                          <span>
                            {hasPack
                              ? `${product.stockPacks} ${packLabel}${product.stockPacks > 1 ? 's' : ''} + ${product.stockUnits} unité${product.stockUnits > 1 ? 's' : ''}`
                              : `${product.stockUnits} unité${product.stockUnits > 1 ? 's' : ''}`}
                          </span>
                        </div>

                        <div className="text-[10px] text-slate-400 mt-1 flex flex-col items-end">
                          <span>Alerte unités : {product.alertThreshold}</span>
                          {hasPack && product.alertThresholdPacks !== undefined && (
                            <span>Alerte {packLabel}s : {product.alertThresholdPacks}</span>
                          )}
                        </div>
                      </>
                    )}
                  </div>
                </div>

                {/* Action Buttons */}
                <div className="mt-3 pt-3 border-t border-slate-100 flex flex-wrap gap-2">
                  {/* BOUTON : OUVRIR UN CARTON si format carton existant */}
                  {hasPack && (
                    <button
                      onClick={() => handleOpenPackAction(product)}
                      disabled={product.stockPacks <= 0 || isOpeningPack === product.id}
                      className="py-2.5 px-3 bg-amber-500 hover:bg-amber-600 disabled:opacity-40 disabled:hover:bg-amber-500 active:scale-95 text-white rounded-xl text-xs font-black flex items-center justify-center gap-1.5 transition shadow-xs flex-1 sm:flex-initial"
                      title={`Ouvrir 1 ${packLabel} pour obtenir +${product.packSize} unités seules`}
                    >
                      <Box className="w-4 h-4" />
                      <span>
                        Ouvrir 1 {packLabel} (+{product.packSize} un.)
                      </span>
                    </button>
                  )}

                  {/* Réapprovisionner */}
                  <button
                    onClick={() => onOpenReappro(product)}
                    className="py-2.5 px-2.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-200 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 active:scale-95 transition"
                    title="Ajouter du stock (cartons ou unités)"
                  >
                    <PackagePlus className="w-4 h-4 text-emerald-600" />
                    <span>Réappro</span>
                  </button>

                  {/* Corriger le stock */}
                  <button
                    onClick={() => onOpenCorrection(product)}
                    className="py-2.5 px-2.5 bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-200 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 active:scale-95 transition"
                    title="Ajustement d'inventaire (perte, casse, vol)"
                  >
                    <SlidersHorizontal className="w-4 h-4 text-amber-600" />
                    <span>Correction</span>
                  </button>

                  {/* Modifier fiche produit */}
                  <button
                    onClick={() => onOpenEditModal(product)}
                    className="p-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl transition"
                    title="Modifier le produit"
                  >
                    <Edit className="w-4 h-4" />
                  </button>

                  {/* QR Code */}
                  <button
                    onClick={() => onOpenQRCode(product)}
                    className="p-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl transition"
                    title="Générer & imprimer le QR Code"
                  >
                    <QrCode className="w-4 h-4" />
                  </button>

                  {/* Historique stock */}
                  <button
                    onClick={() => handleOpenHistory(product)}
                    className="p-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl transition"
                    title="Historique des mouvements de stock"
                  >
                    <History className="w-4 h-4" />
                  </button>

                  {/* Supprimer */}
                  <button
                    onClick={() => handleDelete(product.id, product.name)}
                    className="p-2.5 bg-rose-50 hover:bg-rose-100 text-rose-600 rounded-xl transition ml-auto"
                    title="Supprimer le produit"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            );
          })}

          {filteredProducts.length > visibleProductsLimit && (
            <button
              type="button"
              onClick={() => setVisibleProductsLimit((prev) => prev + 50)}
              className="col-span-full w-full py-3.5 bg-white border-2 border-amber-200 hover:bg-amber-50 active:scale-98 text-amber-900 font-bold text-xs rounded-2xl shadow-xs transition"
            >
              Afficher 50 produits de plus ({filteredProducts.length - visibleProductsLimit} restants)
            </button>
          )}
        </>
      )}
      </div>

      {/* Modal Historique des Mouvements de Stock */}
      {showHistoryModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 animate-in fade-in duration-200">
          <div className="w-full max-w-md rounded-3xl bg-white p-5 shadow-2xl text-slate-800 max-h-[85vh] flex flex-col">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div>
                <h3 className="text-base font-bold text-slate-900">Mouvements de stock</h3>
                <p className="text-xs text-slate-500 font-medium">{showHistoryModal.name}</p>
              </div>
              <button
                onClick={() => setShowHistoryModal(null)}
                className="p-1 rounded-full text-slate-400 hover:bg-slate-100"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto space-y-2.5 my-3 pr-1">
              {productMovements.length === 0 ? (
                <p className="text-xs text-slate-400 py-8 text-center">
                  Aucun mouvement enregistré pour ce produit.
                </p>
              ) : (
                productMovements.map((mov) => {
                  const isPositive = mov.quantity > 0;
                  const isPackMov = mov.support === 'pack';
                  const unitLabel = isPackMov
                    ? `${showHistoryModal.packLabel || 'carton'}${Math.abs(mov.quantity) > 1 ? 's' : ''}`
                    : `unité${Math.abs(mov.quantity) > 1 ? 's' : ''}`;

                  return (
                    <div
                      key={mov.id}
                      className="p-3 bg-slate-50 border border-slate-200/80 rounded-2xl flex items-center justify-between text-xs"
                    >
                      <div>
                        <div className="flex items-center gap-1.5">
                          <span
                            className={`text-[10px] font-black px-1.5 py-0.5 rounded capitalize ${
                              isPackMov ? 'bg-amber-600 text-white' : 'bg-slate-200 text-slate-700'
                            }`}
                          >
                            {isPackMov ? 'Carton' : 'Unité'}
                          </span>
                          <span className="font-bold text-slate-900">
                            {mov.reason || mov.type}
                          </span>
                        </div>
                        <div className="text-[10px] text-slate-400 mt-0.5">
                          {formatDateFrench(mov.date)}
                        </div>
                        {mov.note && (
                          <div className="text-[11px] text-slate-600 italic mt-0.5">
                            « {mov.note} »
                          </div>
                        )}
                      </div>

                      <div
                        className={`text-sm font-black ${
                          isPositive ? 'text-emerald-600' : 'text-rose-600'
                        }`}
                      >
                        {isPositive ? `+${mov.quantity}` : mov.quantity} {unitLabel}
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            <button
              onClick={() => setShowHistoryModal(null)}
              className="w-full py-3 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs rounded-xl"
            >
              Fermer
            </button>
          </div>
        </div>
      )}

      {/* Modal d'impression groupée des codes QR sur feuille A4 */}
      {isPrintQROpen && (
        <React.Suspense fallback={null}>
          <PrintQRCodesModal
            isOpen={isPrintQROpen}
            products={products}
            onClose={() => setIsPrintQROpen(false)}
          />
        </React.Suspense>
      )}
    </div>
  );
};

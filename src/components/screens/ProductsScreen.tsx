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
} from 'lucide-react';
import { ProductWithStock, StockMovement } from '../../types';
import { formatGNF, formatDateFrench, playSuccessChime, triggerHaptic } from '../../utils/formatters';
import { deleteProduct, getAllStockMovements, openPack } from '../../services/db';

interface ProductsScreenProps {
  products: ProductWithStock[];
  onOpenCreateModal: () => void;
  onOpenEditModal: (product: ProductWithStock) => void;
  onOpenQRCode: (product: ProductWithStock) => void;
  onOpenReappro: (product: ProductWithStock) => void;
  onOpenCorrection: (product: ProductWithStock) => void;
  onRefreshData: () => void;
}

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
  const [filterMode, setFilterMode] = useState<'all' | 'packsOnly' | 'lowStock'>('all');
  const [showHistoryModal, setShowHistoryModal] = useState<ProductWithStock | null>(null);
  const [productMovements, setProductMovements] = useState<StockMovement[]>([]);
  const [isOpeningPack, setIsOpeningPack] = useState<string | null>(null);

  const filteredProducts = useMemo(() => {
    return products.filter((p) => {
      const matchSearch =
        p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        p.price.toString().includes(searchQuery);

      if (filterMode === 'lowStock') return matchSearch && p.isLowStock;
      if (filterMode === 'packsOnly') return matchSearch && !!(p.packSize && p.packSize >= 2);
      return matchSearch;
    });
  }, [products, searchQuery, filterMode]);

  const lowStockCount = products.filter((p) => p.isLowStock).length;
  const packsCount = products.filter((p) => p.packSize && p.packSize >= 2).length;

  const handleOpenHistory = async (product: ProductWithStock) => {
    setShowHistoryModal(product);
    const allMovs = await getAllStockMovements();
    const filtered = allMovs
      .filter((m) => m.productId === product.id)
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    setProductMovements(filtered);
  };

  const handleDelete = async (productId: string, name: string) => {
    if (window.confirm(`Confirmez-vous la suppression du produit « ${name} » ?`)) {
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
        `Ouvrir 1 ${label} de « ${product.name} » ?\n\nCela va retirer 1 ${label} fermé et ajouter +${product.packSize} unités seules au stock.`
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
            {products.length} référence{products.length > 1 ? 's' : ''} enregistrée{products.length > 1 ? 's' : ''}
          </p>
        </div>

        <button
          onClick={onOpenCreateModal}
          className="flex items-center gap-2 px-4 py-3 bg-amber-600 hover:bg-amber-700 active:scale-95 text-white font-black text-xs sm:text-sm rounded-2xl shadow-md shadow-amber-600/30 transition flex-shrink-0"
        >
          <Plus className="w-4 h-4" />
          <span>Nouveau Produit</span>
        </button>
      </div>

      {/* Tabs format : Tous vs Cartons vs Alertes */}
      <div className="grid grid-cols-3 gap-2 p-1 bg-slate-200/70 rounded-2xl">
        <button
          onClick={() => setFilterMode('all')}
          className={`py-2 rounded-xl text-xs font-bold transition ${
            filterMode === 'all'
              ? 'bg-white text-slate-900 shadow-sm'
              : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          Tous ({products.length})
        </button>
        <button
          onClick={() => setFilterMode('packsOnly')}
          className={`py-2 rounded-xl text-xs font-bold transition flex items-center justify-center gap-1 ${
            filterMode === 'packsOnly'
              ? 'bg-white text-amber-900 shadow-sm'
              : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          <Layers className="w-3.5 h-3.5" />
          <span>Cartons ({packsCount})</span>
        </button>
        <button
          onClick={() => setFilterMode('lowStock')}
          className={`py-2 rounded-xl text-xs font-bold transition flex items-center justify-center gap-1 ${
            filterMode === 'lowStock'
              ? 'bg-rose-600 text-white shadow-sm'
              : 'text-rose-700 hover:text-rose-900'
          }`}
        >
          <AlertTriangle className="w-3.5 h-3.5" />
          <span>Stock bas ({lowStockCount})</span>
        </button>
      </div>

      {/* Search Bar */}
      <div className="relative">
        <Search className="w-5 h-5 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
        <input
          type="text"
          placeholder="Rechercher un article..."
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
              {filterMode === 'packsOnly'
                ? "Aucun produit n'a encore de format carton configuré."
                : 'Appuyez sur « Nouveau Produit » pour commencer.'}
            </p>
          </div>
        ) : (
          filteredProducts.map((product) => {
            const hasPack = !!(product.packSize && product.packSize >= 2);
            const packLabel = product.packLabel || 'carton';

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
                    <div className="w-12 h-12 rounded-2xl bg-amber-50 border border-amber-200/70 flex items-center justify-center text-2xl flex-shrink-0">
                      {product.imageUrl || '📦'}
                    </div>
                    <div className="min-w-0">
                      <h3 className="text-sm font-black text-slate-900 truncate">
                        {product.name}
                      </h3>
                      <div className="text-xs text-slate-500 font-medium">
                        {product.category || 'Article'}
                      </div>

                      {/* Prices: Unit & Carton */}
                      <div className="flex flex-wrap items-baseline gap-2 mt-0.5">
                        <span className="text-base font-black text-amber-700">
                          {formatGNF(product.price)} <span className="text-[10px] font-normal text-slate-500">/unité</span>
                        </span>
                        {hasPack && product.packPrice && (
                          <span className="text-xs font-bold text-slate-700 bg-amber-100/60 px-2 py-0.5 rounded-lg border border-amber-200">
                            {formatGNF(product.packPrice)} /{packLabel} ({product.packSize} un.)
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Stock Display : "12 cartons + 7 unités" partout */}
                  <div className="text-right flex flex-col items-end flex-shrink-0">
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
                    title="Ajouter des cartons ou unités reçus"
                  >
                    <PackagePlus className="w-3.5 h-3.5 text-emerald-600" />
                    <span>+ Réappro</span>
                  </button>

                  {/* Corriger le stock */}
                  <button
                    onClick={() => onOpenCorrection(product)}
                    className="py-2.5 px-2.5 bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-200 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 active:scale-95 transition"
                    title="Ajuster cartons ou unités (casse, vol...)"
                  >
                    <SlidersHorizontal className="w-3.5 h-3.5 text-amber-600" />
                    <span>Corriger</span>
                  </button>

                  {/* QR Code */}
                  <button
                    onClick={() => onOpenQRCode(product)}
                    className="py-2.5 px-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-200 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 active:scale-95 transition"
                    title="Afficher et imprimer le QR Code"
                  >
                    <QrCode className="w-3.5 h-3.5 text-slate-600" />
                    <span className="hidden sm:inline">QR Code</span>
                  </button>

                  {/* Historique & Options */}
                  <div className="flex gap-1 ml-auto">
                    <button
                      onClick={() => handleOpenHistory(product)}
                      className="py-2.5 px-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-200 rounded-xl text-xs font-bold flex items-center justify-center gap-1 active:scale-95 transition"
                      title="Historique des mouvements"
                    >
                      <History className="w-3.5 h-3.5 text-slate-500" />
                      <span className="hidden md:inline">Mouvements</span>
                    </button>
                    <button
                      onClick={() => onOpenEditModal(product)}
                      className="p-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl active:scale-95 transition"
                      title="Modifier le produit"
                    >
                      <Edit className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => handleDelete(product.id, product.name)}
                      className="p-2.5 bg-slate-100 hover:bg-rose-100 hover:text-rose-600 text-slate-400 rounded-xl active:scale-95 transition"
                      title="Supprimer le produit"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Modal Historique des Mouvements */}
      {showHistoryModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 animate-in fade-in duration-200">
          <div className="w-full max-w-md rounded-3xl bg-white p-5 shadow-2xl text-slate-800 max-h-[85vh] flex flex-col">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <History className="w-5 h-5 text-amber-600" />
                <div>
                  <h3 className="text-base font-bold text-slate-900">Historique de stock</h3>
                  <p className="text-xs text-slate-500 font-medium">{showHistoryModal.name}</p>
                </div>
              </div>
              <button
                onClick={() => setShowHistoryModal(null)}
                className="p-1.5 rounded-full text-slate-400 hover:bg-slate-100"
              >
                ✕
              </button>
            </div>

            <div className="my-3 p-3 bg-amber-50 rounded-2xl border border-amber-200 flex justify-between items-center text-xs">
              <span className="font-bold text-slate-600">Stock actuel enregistré :</span>
              <span className="text-sm font-black text-amber-900">
                {showHistoryModal.packSize
                  ? `${showHistoryModal.stockPacks} ${showHistoryModal.packLabel || 'carton'}(s) + ${showHistoryModal.stockUnits} unité(s)`
                  : `${showHistoryModal.stockUnits} unité(s)`}
              </span>
            </div>

            <div className="flex-1 overflow-y-auto space-y-2 pr-1">
              {productMovements.length === 0 ? (
                <p className="text-xs text-slate-400 py-6 text-center">Aucun mouvement enregistré</p>
              ) : (
                productMovements.map((mov) => {
                  const isPositive = mov.quantity > 0;
                  const supportLabel = mov.support === 'pack' ? (showHistoryModal.packLabel || 'carton') : 'unité';

                  return (
                    <div
                      key={mov.id}
                      className="p-2.5 rounded-xl border border-slate-100 bg-slate-50 flex items-center justify-between text-xs"
                    >
                      <div>
                        <div className="font-bold text-slate-800 capitalize">
                          {mov.type === 'initial'
                            ? `Stock initial (${supportLabel})`
                            : mov.type === 'reappro'
                            ? `Réappro (${supportLabel})`
                            : mov.type === 'vente'
                            ? `Vente (${supportLabel})`
                            : mov.type === 'ouverture'
                            ? `Ouverture carton`
                            : mov.type === 'annulation'
                            ? `Annulation vente`
                            : `Correction (${mov.reason || 'inventaire'})`}
                        </div>
                        <div className="text-[10px] text-slate-400">
                          {formatDateFrench(mov.date)}
                          {mov.note ? ` • ${mov.note}` : ''}
                        </div>
                      </div>
                      <span
                        className={`font-black text-sm px-2 py-0.5 rounded-lg ${
                          isPositive
                            ? 'bg-emerald-100 text-emerald-800'
                            : 'bg-rose-100 text-rose-800'
                        }`}
                      >
                        {isPositive ? `+${mov.quantity}` : mov.quantity} {supportLabel}
                      </span>
                    </div>
                  );
                })
              )}
            </div>

            <button
              onClick={() => setShowHistoryModal(null)}
              className="mt-4 w-full py-3 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs rounded-xl"
            >
              Fermer
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

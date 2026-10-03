import React, { useState, useMemo } from 'react';
import { Search, QrCode, ShoppingCart, AlertCircle, Filter, Layers, Package, Box, AlertTriangle } from 'lucide-react';
import { ProductWithStock, CartItem, UnitType } from '../../types';
import { formatGNF, playBeep, triggerHaptic } from '../../utils/formatters';

interface SaleScreenProps {
  products: ProductWithStock[];
  cartItems: CartItem[];
  onAddToCart: (product: ProductWithStock, unitType: UnitType) => void;
  onOpenScanner: () => void;
  onOpenCart: () => void;
  onOpenPack: (productId: string) => Promise<void>;
}

export const SaleScreen: React.FC<SaleScreenProps> = ({
  products,
  cartItems,
  onAddToCart,
  onOpenScanner,
  onOpenCart,
  onOpenPack,
}) => {
  const [saleFormat, setSaleFormat] = useState<UnitType>('unit');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('Tous');

  // Confirmation modal: "Plus assez d'unités. Ouvrir un carton (+N unités) ?"
  const [promptOpenPackProduct, setPromptOpenPackProduct] = useState<ProductWithStock | null>(null);
  const [isProcessingOpenPack, setIsProcessingOpenPack] = useState(false);

  // Categories list
  const categories = useMemo(() => {
    const set = new Set<string>();
    products.forEach((p) => {
      if (p.category) set.add(p.category);
    });
    return ['Tous', ...Array.from(set)];
  }, [products]);

  // Filter products based on sale format (Unité vs Carton) and search/category
  const filteredProducts = useMemo(() => {
    return products.filter((product) => {
      // In carton mode, only products with a valid pack configuration
      if (saleFormat === 'pack' && (!product.packSize || !product.packPrice)) {
        return false;
      }

      const matchSearch =
        product.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        product.price.toString().includes(searchQuery) ||
        (product.packPrice && product.packPrice.toString().includes(searchQuery));

      const matchCat =
        selectedCategory === 'Tous' || product.category === selectedCategory;

      return matchSearch && matchCat;
    });
  }, [products, searchQuery, selectedCategory, saleFormat]);

  const totalCartCount = cartItems.reduce((sum, item) => sum + item.quantity, 0);
  const totalCartAmount = cartItems.reduce(
    (sum, item) => sum + item.quantity * item.unitPrice,
    0
  );

  const handleProductTap = (product: ProductWithStock) => {
    const hasPack = !!(product.packSize && product.packSize >= 2);

    if (saleFormat === 'pack') {
      // Carton mode: vérifie le stock de cartons fermés (stockPacks)
      const currentCartPacks = cartItems.find(
        (it) => it.product.id === product.id && it.unitType === 'pack'
      )?.quantity || 0;

      if (currentCartPacks >= product.stockPacks) {
        triggerHaptic(100);
        return;
      }

      playBeep();
      triggerHaptic(40);
      onAddToCart(product, 'pack');
      return;
    }

    // Unité mode: vérifie le stock d'unités seules (stockUnits)
    const currentCartUnits = cartItems.find(
      (it) => it.product.id === product.id && it.unitType === 'unit'
    )?.quantity || 0;

    if (currentCartUnits >= product.stockUnits || product.stockUnits <= 0) {
      // Si les unités seules sont insuffisantes mais qu'il reste des cartons fermés
      if (hasPack && product.stockPacks > 0) {
        triggerHaptic(80);
        setPromptOpenPackProduct(product);
        return;
      }

      triggerHaptic(100);
      return;
    }

    playBeep();
    triggerHaptic(40);
    onAddToCart(product, 'unit');
  };

  const handleConfirmOpenPack = async () => {
    if (!promptOpenPackProduct) return;
    try {
      setIsProcessingOpenPack(true);
      const targetProd = promptOpenPackProduct;
      await onOpenPack(targetProd.id);
      // Après ouverture, ajouter directement 1 unité au panier
      onAddToCart(targetProd, 'unit');
      setPromptOpenPackProduct(null);
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Erreur lors de l’ouverture du carton');
    } finally {
      setIsProcessingOpenPack(false);
    }
  };

  const packProductsCount = products.filter((p) => p.packSize && p.packPrice).length;

  return (
    <div className="pb-28 pt-2 px-3 sm:px-4 max-w-5xl mx-auto space-y-4">
      {/* 2 Big Top Tabs : Unité vs Carton as requested */}
      <div className="grid grid-cols-2 gap-2 p-1.5 bg-amber-100/60 rounded-3xl border border-amber-200 shadow-xs">
        <button
          type="button"
          onClick={() => {
            triggerHaptic(30);
            setSaleFormat('unit');
          }}
          className={`py-3 rounded-2xl font-black text-sm transition flex items-center justify-center gap-2 ${
            saleFormat === 'unit'
              ? 'bg-amber-600 text-white shadow-md shadow-amber-600/30'
              : 'text-amber-900 hover:bg-white/60'
          }`}
        >
          <Package className="w-4 h-4" />
          <span>Vente à l'Unité</span>
        </button>

        <button
          type="button"
          onClick={() => {
            triggerHaptic(30);
            setSaleFormat('pack');
          }}
          className={`py-3 rounded-2xl font-black text-sm transition flex items-center justify-center gap-2 ${
            saleFormat === 'pack'
              ? 'bg-amber-600 text-white shadow-md shadow-amber-600/30'
              : 'text-amber-900 hover:bg-white/60'
          }`}
        >
          <Layers className="w-4 h-4" />
          <span>Vente par Carton ({packProductsCount})</span>
        </button>
      </div>

      {/* Top Search & Big Scanner Button */}
      <div className="flex gap-2 items-stretch">
        <div className="relative flex-1">
          <Search className="w-5 h-5 absolute left-3.5 top-1/2 -translate-y-1/2 text-amber-700/60" />
          <input
            type="text"
            placeholder={
              saleFormat === 'pack'
                ? 'Rechercher un carton...'
                : 'Rechercher un produit à l’unité...'
            }
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-11 pr-4 py-3.5 bg-white border-2 border-amber-200/80 rounded-2xl text-sm font-semibold text-slate-800 placeholder-slate-400 focus:outline-none focus:border-amber-500 shadow-xs"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute right-3.5 top-1/2 -translate-y-1/2 text-xs font-bold bg-slate-100 hover:bg-slate-200 text-slate-500 px-2 py-1 rounded-full"
            >
              Effacer
            </button>
          )}
        </div>

        {/* Big tactile Scanner Button */}
        <button
          onClick={onOpenScanner}
          className="flex items-center gap-2 px-4 sm:px-5 py-3.5 bg-amber-600 hover:bg-amber-700 active:scale-95 text-white font-black text-sm rounded-2xl shadow-md shadow-amber-600/30 transition flex-shrink-0"
          title="Ouvrir la caméra pour scanner un QR code"
        >
          <QrCode className="w-5 h-5" />
          <span className="hidden xs:inline">Scanner QR</span>
          <span className="xs:hidden">Scanner</span>
        </button>
      </div>

      {/* Category Pills Filter */}
      <div className="flex gap-2 overflow-x-auto pb-1 no-scrollbar items-center">
        <Filter className="w-4 h-4 text-amber-800/60 flex-shrink-0 ml-1" />
        {categories.map((cat) => (
          <button
            key={cat}
            onClick={() => setSelectedCategory(cat)}
            className={`px-3.5 py-1.5 rounded-full text-xs font-bold transition flex-shrink-0 ${
              selectedCategory === cat
                ? 'bg-amber-600 text-white shadow-xs'
                : 'bg-white text-slate-700 border border-amber-200/60 hover:bg-amber-50/60'
            }`}
          >
            {cat}
          </button>
        ))}
      </div>

      {/* Products Grid */}
      {filteredProducts.length === 0 ? (
        <div className="text-center py-16 bg-white rounded-3xl border border-dashed border-amber-300 p-6">
          <span className="text-4xl">🔍</span>
          <h3 className="mt-2 text-base font-bold text-slate-800">
            {saleFormat === 'pack'
              ? 'Aucun carton disponible'
              : 'Aucun produit trouvé'}
          </h3>
          <p className="text-xs text-slate-500 mt-1">
            {saleFormat === 'pack'
              ? 'Ajoutez un format carton dans la fiche de vos produits pour les voir ici.'
              : 'Ajoutez un nouveau produit ou modifiez votre recherche.'}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
          {filteredProducts.map((product) => {
            const isPack = saleFormat === 'pack';
            const hasPack = !!(product.packSize && product.packSize >= 2);
            const packLabel = product.packLabel || 'carton';
            const displayPrice = isPack && product.packPrice ? product.packPrice : product.price;

            // L'onglet Carton ne montre que les cartons fermés disponibles (stockPacks).
            // L'onglet Unité ne montre que les unités seules disponibles (stockUnits).
            const isOutOfStock = isPack ? product.stockPacks <= 0 : product.stockUnits <= 0;
            const canOpenPack = !isPack && hasPack && product.stockUnits <= 0 && product.stockPacks > 0;

            const inCart = cartItems.find(
              (it) => it.product.id === product.id && it.unitType === saleFormat
            );

            return (
              <div
                key={`${product.id}-${saleFormat}`}
                className={`group relative text-left bg-white rounded-3xl p-3.5 border-2 transition-all flex flex-col justify-between shadow-xs hover:shadow-md ${
                  isOutOfStock && !canOpenPack
                    ? 'opacity-60 bg-slate-50 border-slate-200'
                    : inCart
                    ? 'border-amber-500 ring-2 ring-amber-500/20 bg-amber-50/30'
                    : 'border-amber-100/90 hover:border-amber-300'
                }`}
              >
                {/* Cart badge on card if already added */}
                {inCart && (
                  <div className="absolute top-2.5 right-2.5 w-7 h-7 bg-amber-600 text-white rounded-full flex items-center justify-center font-black text-xs shadow-md animate-in zoom-in-50 duration-150 z-10">
                    {inCart.quantity}
                  </div>
                )}

                <button
                  type="button"
                  onClick={() => handleProductTap(product)}
                  className="w-full text-left flex flex-col flex-1 justify-between focus:outline-none"
                >
                  {/* Product Image / Emoji */}
                  <div className="w-full aspect-square max-h-24 sm:max-h-28 rounded-2xl bg-amber-50 flex items-center justify-center text-4xl sm:text-5xl mb-2.5 transition-transform group-hover:scale-105">
                    {product.imageUrl || '📦'}
                  </div>

                  {/* Product Info */}
                  <div className="space-y-1 w-full">
                    <h3 className="text-xs sm:text-sm font-bold text-slate-900 leading-snug line-clamp-2 min-h-[2rem]">
                      {product.name}
                    </h3>

                    {/* Format tag if carton */}
                    {isPack && (
                      <span className="inline-block text-[10px] font-black uppercase text-amber-800 bg-amber-100 px-2 py-0.5 rounded-md">
                        {packLabel} de {product.packSize}
                      </span>
                    )}

                    {/* Price in GNF */}
                    <div className="text-sm sm:text-base font-black text-amber-700 tracking-tight">
                      {formatGNF(displayPrice)}
                    </div>

                    {/* Stock Display : "X cartons + Y unités" partout */}
                    <div className="pt-1 space-y-0.5">
                      <div className="text-[10px] font-extrabold text-slate-700">
                        {hasPack ? (
                          <span>
                            {product.stockPacks} {packLabel}{product.stockPacks > 1 ? 's' : ''} + {product.stockUnits} un.
                          </span>
                        ) : (
                          <span>{product.stockUnits} unité{product.stockUnits > 1 ? 's' : ''}</span>
                        )}
                      </div>

                      {/* Stock status pill */}
                      <span
                        className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full font-bold text-[10px] ${
                          isOutOfStock && !canOpenPack
                            ? 'bg-rose-100 text-rose-700'
                            : canOpenPack
                            ? 'bg-amber-100 text-amber-800 border border-amber-300'
                            : 'bg-emerald-100 text-emerald-800'
                        }`}
                      >
                        {isPack ? (
                          product.stockPacks <= 0 ? '0 carton fermé' : `${product.stockPacks} dispo`
                        ) : product.stockUnits <= 0 ? (
                          canOpenPack ? `Ouvrir 1 ${packLabel}` : 'Épuisé (0)'
                        ) : (
                          `${product.stockUnits} seule(s) dispo`
                        )}
                      </span>
                    </div>
                  </div>
                </button>

                {/* Bouton direct "Ouvrir un carton" si l'utilisateur est sur l'onglet Unité et a des cartons fermés */}
                {!isPack && hasPack && product.stockPacks > 0 && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setPromptOpenPackProduct(product);
                    }}
                    className="mt-2 w-full py-1.5 px-2 bg-amber-50 hover:bg-amber-100 border border-amber-300 text-amber-900 rounded-xl text-[10px] font-black flex items-center justify-center gap-1 transition"
                  >
                    <Box className="w-3 h-3 text-amber-600" />
                    <span>Ouvrir 1 {packLabel} (+{product.packSize})</span>
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Confirmation Modal : "Plus assez d'unités. Ouvrir un carton (+N unités) ?" */}
      {promptOpenPackProduct && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-xs p-4 animate-in fade-in duration-200">
          <div className="w-full max-w-sm rounded-3xl bg-white p-6 shadow-2xl text-slate-800 text-center space-y-4">
            <div className="w-14 h-14 rounded-2xl bg-amber-100 text-amber-700 flex items-center justify-center mx-auto text-2xl">
              <Box className="w-7 h-7" />
            </div>

            <div>
              <h3 className="text-base font-black text-slate-900">
                Plus assez d'unités seules
              </h3>
              <p className="text-xs text-slate-500 font-medium mt-1">
                Le stock d'unités seules pour « <strong>{promptOpenPackProduct.name}</strong> » est insuffisant.
              </p>
            </div>

            <div className="p-3 bg-amber-50 border border-amber-200 rounded-2xl text-xs text-amber-900 font-bold">
              Il vous reste <strong>{promptOpenPackProduct.stockPacks} {promptOpenPackProduct.packLabel || 'carton'}(s)</strong> fermé(s).
              <div className="mt-1 text-amber-700 font-normal">
                Ouvrir un carton va déballer <strong>+{promptOpenPackProduct.packSize} unités seules</strong> et ajouter 1 unité au panier.
              </div>
            </div>

            <div className="space-y-2 pt-1">
              <button
                type="button"
                disabled={isProcessingOpenPack}
                onClick={handleConfirmOpenPack}
                className="w-full py-3.5 bg-amber-600 hover:bg-amber-700 active:scale-95 text-white font-black text-sm rounded-2xl shadow-lg shadow-amber-600/30 transition flex items-center justify-center gap-2"
              >
                <Box className="w-4 h-4" />
                <span>Ouvrir un carton (+{promptOpenPackProduct.packSize} unités)</span>
              </button>

              <button
                type="button"
                disabled={isProcessingOpenPack}
                onClick={() => setPromptOpenPackProduct(null)}
                className="w-full py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs rounded-xl transition"
              >
                Annuler
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Persistent Bottom Cart Bar */}
      {totalCartCount > 0 && (
        <div className="fixed bottom-18 left-0 right-0 px-4 z-30 pointer-events-none animate-in slide-in-from-bottom duration-300">
          <div className="max-w-md mx-auto pointer-events-auto">
            <button
              onClick={onOpenCart}
              className="w-full py-3.5 px-5 bg-amber-600 hover:bg-amber-700 active:scale-98 text-white rounded-2xl shadow-xl shadow-amber-900/30 flex items-center justify-between transition border-2 border-amber-400"
            >
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-amber-700/60 flex items-center justify-center font-black text-sm">
                  {totalCartCount}
                </div>
                <div className="text-left">
                  <div className="text-xs text-amber-100 font-bold">Panier en cours</div>
                  <div className="text-base font-black tracking-tight">{formatGNF(totalCartAmount)}</div>
                </div>
              </div>

              <div className="flex items-center gap-1.5 bg-white text-amber-800 px-3.5 py-2 rounded-xl font-black text-xs shadow-xs">
                <ShoppingCart className="w-4 h-4" />
                <span>Encaisser</span>
              </div>
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

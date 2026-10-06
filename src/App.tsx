import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  ShoppingBag,
  Package,
  BookOpen,
  BarChart3,
  Bot,
  Store,
  Settings,
} from 'lucide-react';
import {
  ProductWithStock,
  CartItem,
  CustomerWithBalance,
  Sale,
  CreditPayment,
  ShopSettings,
  UnitType,
} from './types';
import {
  initDatabase,
  getProductsWithStock,
  getCustomersWithBalance,
  getAllSales,
  getAllCreditPayments,
  getShopSettings,
  openPack,
  cancelSale,
} from './services/db';
import { SaleScreen } from './components/screens/SaleScreen';
import { ProductsScreen } from './components/screens/ProductsScreen';
import { CreditsScreen } from './components/screens/CreditsScreen';
import { DailyReportScreen } from './components/screens/DailyReportScreen';
import { CartDrawer } from './components/cart/CartDrawer';
import { SaleReceiptModal } from './components/cart/SaleReceiptModal';
import { QRScannerModal } from './components/scanner/QRScannerModal';
import { QRCodeModal } from './components/products/QRCodeModal';
import { ProductFormModal } from './components/products/ProductFormModal';
import { StockAdjustModal } from './components/products/StockAdjustModal';
import { RegisterShopModal } from './components/auth/RegisterShopModal';
import { PinLockScreen } from './components/auth/PinLockScreen';
import { PWAInstallButton } from './components/pwa/PWAInstallButton';
import { PWAInstallBanner } from './components/pwa/PWAInstallBanner';
import { IOSInstallModal } from './components/pwa/IOSInstallModal';

// Chargement différé des écrans et modales secondaires (Point C.16)
const AssistantScreen = React.lazy(() =>
  import('./components/screens/AssistantScreen').then((m) => ({ default: m.AssistantScreen }))
);
const SettingsModal = React.lazy(() =>
  import('./components/settings/SettingsModal').then((m) => ({ default: m.SettingsModal }))
);
import { AdminScreen } from './components/screens/AdminScreen';
import { buildAndQueueDailySummary, flushTelemetryQueue } from './services/telemetry';
import { OfflineIndicator } from './components/pwa/OfflineIndicator';
import { usePWAInstall } from './hooks/usePWAInstall';
import { triggerHaptic } from './utils/formatters';

type ActiveTab = 'vente' | 'produits' | 'credits' | 'bilan' | 'assistant';

export default function App() {
  const isAdminRoute = typeof window !== 'undefined' && window.location.pathname === '/admin';
  if (isAdminRoute) {
    return <AdminScreen />;
  }

  const [activeTab, setActiveTab] = useState<ActiveTab>('vente');
  const [products, setProducts] = useState<ProductWithStock[]>([]);
  const [customers, setCustomers] = useState<CustomerWithBalance[]>([]);
  const [sales, setSales] = useState<Sale[]>([]);
  const [payments, setPayments] = useState<CreditPayment[]>([]);
  const [shopSettings, setShopSettings] = useState<ShopSettings | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Auth & Lock State
  const [isLocked, setIsLocked] = useState(true);
  const lastActivityTimeRef = useRef<number>(Date.now());
  const inactivityTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Cart State
  const [cartItems, setCartItems] = useState<CartItem[]>([]);
  const [isCartOpen, setIsCartOpen] = useState(false);
  const [lastCompletedSale, setLastCompletedSale] = useState<Sale | null>(null);

  // Modals state
  const [isScannerOpen, setIsScannerOpen] = useState(false);
  const [qrProduct, setQrProduct] = useState<ProductWithStock | null>(null);
  const [isProductFormOpen, setIsProductFormOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<ProductWithStock | null>(null);

  // Stock adjustment modal
  const [adjustModalProduct, setAdjustModalProduct] = useState<ProductWithStock | null>(null);
  const [adjustModalMode, setAdjustModalMode] = useState<'reappro' | 'correction'>('reappro');

  // Settings modal
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);

  // PWA Installation Hook
  const {
    isInstalled,
    isIOS,
    isInstallable,
    isDismissed,
    showIOSGuide,
    setShowIOSGuide,
    dismiss: dismissInstallBanner,
    promptInstall,
  } = usePWAInstall();

  // Load all data from IndexedDB
  const refreshAllData = useCallback(async () => {
    try {
      const [prodsWithStock, custsWithBal, allSales, allPayments, settings] =
        await Promise.all([
          getProductsWithStock(),
          getCustomersWithBalance(),
          getAllSales(),
          getAllCreditPayments(),
          getShopSettings(),
        ]);
      setProducts(prodsWithStock);
      setCustomers(custsWithBal);
      setSales(allSales);
      setPayments(allPayments);
      setShopSettings(settings);
    } catch (err) {
      console.error('Erreur chargement données:', err);
    }
  }, []);

  useEffect(() => {
    const init = async () => {
      try {
        await initDatabase();
        await refreshAllData();
        // Suivi d'usage anonyme (Point 2 & 3)
        await buildAndQueueDailySummary();
        await flushTelemetryQueue();
      } catch (err) {
        console.error('Erreur initialisation DB:', err);
      } finally {
        setIsLoading(false);
      }
    };
    init();

    const handleOnline = () => {
      flushTelemetryQueue();
    };
    window.addEventListener('online', handleOnline);
    return () => {
      window.removeEventListener('online', handleOnline);
    };
  }, [refreshAllData]);

  // Gestion de l'inactivité de 5 minutes (300 000 ms)
  const resetInactivityTimer = useCallback(() => {
    lastActivityTimeRef.current = Date.now();
  }, []);

  useEffect(() => {
    const events = ['mousedown', 'mousemove', 'keydown', 'scroll', 'touchstart', 'click'];
    const handleActivity = () => {
      resetInactivityTimer();
    };

    events.forEach((ev) => window.addEventListener(ev, handleActivity));

    // Vérifie chaque 15 secondes si 5 minutes d'inactivité se sont écoulées
    const interval = setInterval(() => {
      if (shopSettings?.isConfigured && !isLocked) {
        const now = Date.now();
        const elapsed = now - lastActivityTimeRef.current;
        if (elapsed >= 5 * 60 * 1000) {
          // 5 minutes d'inactivité
          setIsLocked(true);
        }
      }
    }, 15000);

    return () => {
      events.forEach((ev) => window.removeEventListener(ev, handleActivity));
      clearInterval(interval);
    };
  }, [shopSettings, isLocked, resetInactivityTimer]);

  // Cart operations
  const handleAddToCart = (
    product: ProductWithStock,
    unitType: UnitType = 'unit',
    quantityToAdd: number = 1
  ) => {
    const isPack = unitType === 'pack';
    const unitPrice = isPack && product.packPrice ? product.packPrice : product.price;
    const packSize = isPack ? product.packSize : undefined;
    const packLabel = isPack ? product.packLabel || 'carton' : undefined;

    setCartItems((prev) => {
      const existing = prev.find(
        (item) => item.product.id === product.id && item.unitType === unitType
      );

      const currentQty = existing ? existing.quantity : 0;
      const maxAvailable = isPack ? product.stockPacks : product.stockUnits;

      if (currentQty + quantityToAdd > maxAvailable) {
        triggerHaptic(100);
        return prev;
      }

      if (existing) {
        return prev.map((item) =>
          item.product.id === product.id && item.unitType === unitType
            ? { ...item, quantity: item.quantity + quantityToAdd }
            : item
        );
      }

      return [
        ...prev,
        {
          product,
          quantity: quantityToAdd,
          unitPrice,
          unitType,
          packSize,
          packLabel,
        },
      ];
    });
  };

  const handleUpdateCartQty = (productId: string, unitType: UnitType, delta: number) => {
    const currentProd = products.find((p) => p.id === productId);
    const maxAvailable = currentProd
      ? unitType === 'pack'
        ? currentProd.stockPacks
        : currentProd.stockUnits
      : Infinity;

    setCartItems((prev) => {
      return prev
        .map((item) => {
          if (item.product.id === productId && item.unitType === unitType) {
            const nextQty = item.quantity + delta;
            if (delta > 0 && nextQty > maxAvailable) {
              triggerHaptic(100);
              return item;
            }
            return nextQty > 0 ? { ...item, quantity: nextQty } : null;
          }
          return item;
        })
        .filter((item): item is CartItem => item !== null);
    });
  };

  const handleRemoveCartItem = (productId: string, unitType: UnitType) => {
    setCartItems((prev) =>
      prev.filter((item) => !(item.product.id === productId && item.unitType === unitType))
    );
  };

  const handleClearCart = () => {
    setCartItems([]);
  };

  const handleOpenPack = async (productId: string) => {
    await openPack(productId);
    await refreshAllData();
  };

  const handleCancelSale = async (saleId: string) => {
    await cancelSale(saleId);
    await refreshAllData();
  };

  const handleSaleCompleted = (sale: Sale) => {
    setLastCompletedSale(sale);
    refreshAllData();
    buildAndQueueDailySummary().then(() => flushTelemetryQueue()).catch(() => {});
  };

  const totalCartCount = cartItems.reduce((sum, item) => sum + item.quantity, 0);
  const lowStockCount = products.filter((p) => p.isLowStock).length;
  const customersWithDebtCount = customers.filter((c) => c.currentDebt > 0).length;

  // 1. Si la base est en cours de chargement
  if (isLoading) {
    return (
      <div className="min-h-screen bg-amber-50/40 flex flex-col items-center justify-center space-y-3">
        <div className="w-10 h-10 border-4 border-amber-600 border-t-transparent rounded-full animate-spin" />
        <p className="text-xs font-bold text-slate-600">Chargement de votre boutique...</p>
      </div>
    );
  }

  // 2. Si aucune boutique n'est configurée : écran d'inscription obligatoire
  if (!shopSettings || !shopSettings.isConfigured) {
    return (
      <RegisterShopModal
        onShopCreated={(settings) => {
          setShopSettings(settings);
          setIsLocked(false);
          refreshAllData();
        }}
      />
    );
  }

  // 3. Si l'application est verrouillée : écran de saisie du PIN
  if (isLocked) {
    return (
      <PinLockScreen
        shopName={shopSettings.shopName}
        onUnlock={() => {
          setIsLocked(false);
          resetInactivityTimer();
        }}
      />
    );
  }

  return (
    <div className="min-h-screen bg-amber-50/40 text-slate-800 flex flex-col font-sans select-none">
      {/* Offline Status Toast */}
      <OfflineIndicator />

      {/* Main Top Header */}
      <header className="sticky top-0 z-30 bg-white/95 backdrop-blur-md border-b border-amber-200/70 shadow-xs">
        <div className="max-w-5xl mx-auto px-4 py-2.5 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="relative">
              <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-amber-600 to-amber-500 flex items-center justify-center text-white shadow-sm shadow-amber-600/30">
                <Store className="w-5 h-5" />
              </div>
              <div className="absolute -bottom-1 -right-1 flex h-2 rounded-full overflow-hidden border border-white">
                <div className="w-1.5 bg-red-600" />
                <div className="w-1.5 bg-yellow-400" />
                <div className="w-1.5 bg-emerald-600" />
              </div>
            </div>

            <div>
              <h1 className="text-sm sm:text-base font-black text-slate-900 leading-tight truncate max-w-[160px] sm:max-w-none">
                {shopSettings.shopName}
              </h1>
              <div className="flex items-center gap-1.5 text-[10px] text-slate-500 font-semibold">
                <span className="w-2 h-2 rounded-full bg-emerald-500 inline-block animate-pulse" />
                <span>Caisse GNF</span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <PWAInstallButton />

            {/* Cart Button */}
            <button
              onClick={() => setIsCartOpen(true)}
              className="relative p-2.5 rounded-2xl bg-amber-100 hover:bg-amber-200 text-amber-800 transition active:scale-95 flex items-center justify-center shadow-xs"
              title="Ouvrir le panier"
            >
              <ShoppingBag className="w-5 h-5 text-amber-700" />
              {totalCartCount > 0 && (
                <span className="absolute -top-1.5 -right-1.5 min-w-[20px] h-5 bg-amber-600 text-white rounded-full flex items-center justify-center text-[10px] font-black px-1 shadow-sm animate-in zoom-in-50 duration-150">
                  {totalCartCount}
                </span>
              )}
            </button>

            {/* Shop Settings */}
            <button
              onClick={() => setIsSettingsOpen(true)}
              className="p-2.5 rounded-2xl text-slate-500 hover:text-slate-800 hover:bg-slate-100 transition active:scale-95"
              title="Paramètres de la boutique"
            >
              <Settings className="w-5 h-5" />
            </button>
          </div>
        </div>
      </header>

      {/* Main Tab Screen Content */}
      <main className="flex-1">
        {activeTab === 'vente' && (
          <SaleScreen
            products={products}
            cartItems={cartItems}
            onAddToCart={handleAddToCart}
            onOpenScanner={() => setIsScannerOpen(true)}
            onOpenCart={() => setIsCartOpen(true)}
            onOpenPack={handleOpenPack}
          />
        )}

        {activeTab === 'produits' && (
          <ProductsScreen
            products={products}
            onOpenCreateModal={() => {
              setEditingProduct(null);
              setIsProductFormOpen(true);
            }}
            onOpenEditModal={(p) => {
              setEditingProduct(p);
              setIsProductFormOpen(true);
            }}
            onOpenQRCode={(p) => setQrProduct(p)}
            onOpenReappro={(p) => {
              setAdjustModalProduct(p);
              setAdjustModalMode('reappro');
            }}
            onOpenCorrection={(p) => {
              setAdjustModalProduct(p);
              setAdjustModalMode('correction');
            }}
            onRefreshData={refreshAllData}
          />
        )}

        {activeTab === 'credits' && (
          <CreditsScreen
            customers={customers}
            shopSettings={shopSettings}
            onRefreshData={refreshAllData}
          />
        )}

        {activeTab === 'bilan' && (
          <DailyReportScreen
            sales={sales}
            payments={payments}
            products={products}
            onCancelSale={handleCancelSale}
          />
        )}

        {activeTab === 'assistant' && (
          <React.Suspense
            fallback={
              <div className="flex flex-col items-center justify-center p-16 space-y-3">
                <div className="w-8 h-8 border-3 border-amber-600 border-t-transparent rounded-full animate-spin" />
                <p className="text-xs font-bold text-slate-500">Chargement de l'assistant...</p>
              </div>
            }
          >
            <AssistantScreen
              products={products}
              customers={customers}
              sales={sales}
              payments={payments}
            />
          </React.Suspense>
        )}
      </main>

      {/* Bottom Navigation Bar : 5 Tabs */}
      <nav className="fixed bottom-0 left-0 right-0 z-40 bg-white/95 backdrop-blur-md border-t border-amber-200/80 shadow-[0_-4px_20px_rgba(0,0,0,0.05)] pb-safe">
        <div className="max-w-lg mx-auto grid grid-cols-5 px-1 py-1.5">
          {/* 1. Vente */}
          <button
            onClick={() => {
              triggerHaptic(30);
              setActiveTab('vente');
            }}
            className={`flex flex-col items-center justify-center py-2 px-1 rounded-2xl transition active:scale-95 ${
              activeTab === 'vente'
                ? 'bg-amber-600 text-white font-black shadow-md shadow-amber-600/30'
                : 'text-slate-600 hover:text-amber-800'
            }`}
          >
            <ShoppingBag className="w-5 h-5 mb-0.5" />
            <span className="text-[10px] sm:text-[11px] font-bold">Vente</span>
          </button>

          {/* 2. Produits */}
          <button
            onClick={() => {
              triggerHaptic(30);
              setActiveTab('produits');
            }}
            className={`relative flex flex-col items-center justify-center py-2 px-1 rounded-2xl transition active:scale-95 ${
              activeTab === 'produits'
                ? 'bg-amber-600 text-white font-black shadow-md shadow-amber-600/30'
                : 'text-slate-600 hover:text-amber-800'
            }`}
          >
            <Package className="w-5 h-5 mb-0.5" />
            <span className="text-[10px] sm:text-[11px] font-bold">Produits</span>
            {lowStockCount > 0 && activeTab !== 'produits' && (
              <span className="absolute top-1 right-2 w-2 h-2 rounded-full bg-rose-500" />
            )}
          </button>

          {/* 3. Crédits */}
          <button
            onClick={() => {
              triggerHaptic(30);
              setActiveTab('credits');
            }}
            className={`relative flex flex-col items-center justify-center py-2 px-1 rounded-2xl transition active:scale-95 ${
              activeTab === 'credits'
                ? 'bg-amber-600 text-white font-black shadow-md shadow-amber-600/30'
                : 'text-slate-600 hover:text-amber-800'
            }`}
          >
            <BookOpen className="w-5 h-5 mb-0.5" />
            <span className="text-[10px] sm:text-[11px] font-bold">Crédits</span>
            {customersWithDebtCount > 0 && activeTab !== 'credits' && (
              <span className="absolute top-1 right-2 w-2 h-2 rounded-full bg-amber-500" />
            )}
          </button>

          {/* 4. Bilan */}
          <button
            onClick={() => {
              triggerHaptic(30);
              setActiveTab('bilan');
            }}
            className={`flex flex-col items-center justify-center py-2 px-1 rounded-2xl transition active:scale-95 ${
              activeTab === 'bilan'
                ? 'bg-amber-600 text-white font-black shadow-md shadow-amber-600/30'
                : 'text-slate-600 hover:text-amber-800'
            }`}
          >
            <BarChart3 className="w-5 h-5 mb-0.5" />
            <span className="text-[10px] sm:text-[11px] font-bold">Bilan</span>
          </button>

          {/* 5. Assistant IA */}
          <button
            onClick={() => {
              triggerHaptic(30);
              setActiveTab('assistant');
            }}
            className={`flex flex-col items-center justify-center py-2 px-1 rounded-2xl transition active:scale-95 ${
              activeTab === 'assistant'
                ? 'bg-amber-600 text-white font-black shadow-md shadow-amber-600/30'
                : 'text-slate-600 hover:text-amber-800'
            }`}
          >
            <Bot className="w-5 h-5 mb-0.5" />
            <span className="text-[10px] sm:text-[11px] font-bold">Assistant</span>
          </button>
        </div>
      </nav>

      {/* Cart Drawer */}
      <CartDrawer
        isOpen={isCartOpen}
        items={cartItems}
        products={products}
        customers={customers}
        onClose={() => setIsCartOpen(false)}
        onUpdateQty={handleUpdateCartQty}
        onRemoveItem={handleRemoveCartItem}
        onClearCart={handleClearCart}
        onSaleCompleted={handleSaleCompleted}
        onOpenPack={handleOpenPack}
      />

      {/* QR Scanner Modal */}
      <QRScannerModal
        isOpen={isScannerOpen}
        onClose={() => setIsScannerOpen(false)}
        products={products}
        onAddToCart={handleAddToCart}
        onOpenPack={handleOpenPack}
      />

      {/* QR Code Printable Modal */}
      <QRCodeModal
        isOpen={!!qrProduct}
        product={qrProduct}
        onClose={() => setQrProduct(null)}
      />

      {/* Product Creation & Editing Modal */}
      <ProductFormModal
        isOpen={isProductFormOpen}
        productToEdit={editingProduct}
        onClose={() => setIsProductFormOpen(false)}
        onSuccess={refreshAllData}
      />

      {/* Stock Reappro & Correction Modal */}
      <StockAdjustModal
        isOpen={!!adjustModalProduct}
        product={adjustModalProduct}
        mode={adjustModalMode}
        onClose={() => setAdjustModalProduct(null)}
        onSuccess={refreshAllData}
      />

      {/* Sale Receipt Confirmation Modal */}
      <SaleReceiptModal
        sale={lastCompletedSale}
        onClose={() => setLastCompletedSale(null)}
      />

      {/* Settings Modal */}
      {isSettingsOpen && (
        <React.Suspense fallback={null}>
          <SettingsModal
            isOpen={isSettingsOpen}
            settings={shopSettings}
            onClose={() => setIsSettingsOpen(false)}
            onSettingsUpdated={(newSettings) => setShopSettings(newSettings)}
            onLockScreen={() => setIsLocked(true)}
            isInstalled={isInstalled}
            isIOS={isIOS}
            onInstall={promptInstall}
            onShowIOSGuide={() => setShowIOSGuide(true)}
          />
        </React.Suspense>
      )}

      {/* Invitation d'installation PWA discrète en bas de l'écran */}
      <PWAInstallBanner
        isInstalled={isInstalled}
        isIOS={isIOS}
        isInstallable={isInstallable}
        isDismissed={isDismissed}
        shouldHide={
          (activeTab === 'vente' && cartItems.length > 0) ||
          isScannerOpen ||
          isCartOpen ||
          isSettingsOpen ||
          isLocked
        }
        onInstall={promptInstall}
        onShowIOSGuide={() => setShowIOSGuide(true)}
        onDismiss={dismissInstallBanner}
      />

      {/* Guide explicatif d'installation pour iPhone / iPad */}
      <IOSInstallModal
        isOpen={showIOSGuide}
        onClose={() => setShowIOSGuide(false)}
      />
    </div>
  );
}

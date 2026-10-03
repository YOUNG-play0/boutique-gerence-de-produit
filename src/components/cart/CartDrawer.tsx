import React, { useState } from 'react';
import confetti from 'canvas-confetti';
import { X, Trash2, Plus, Minus, CheckCircle, CreditCard, UserPlus, Phone, User, Layers, Package, Box } from 'lucide-react';
import { CartItem, CustomerWithBalance, ProductWithStock, Sale, UnitType } from '../../types';
import { formatGNF, playSuccessChime, triggerHaptic } from '../../utils/formatters';
import { recordSale, createCustomer } from '../../services/db';

interface CartDrawerProps {
  isOpen: boolean;
  items: CartItem[];
  customers: CustomerWithBalance[];
  products: ProductWithStock[];
  onClose: () => void;
  onUpdateQty: (productId: string, unitType: UnitType, delta: number) => void;
  onRemoveItem: (productId: string, unitType: UnitType) => void;
  onClearCart: () => void;
  onSaleCompleted: (sale: Sale) => void;
  onOpenPack?: (productId: string) => Promise<void>;
}

export const CartDrawer: React.FC<CartDrawerProps> = ({
  isOpen,
  items,
  customers,
  products,
  onClose,
  onUpdateQty,
  onRemoveItem,
  onClearCart,
  onSaleCompleted,
  onOpenPack,
}) => {
  const [showCreditModal, setShowCreditModal] = useState(false);
  const [selectedCustomerId, setSelectedCustomerId] = useState<string>('');
  const [isNewCustomer, setIsNewCustomer] = useState(false);
  const [newCustName, setNewCustName] = useState('');
  const [newCustPhone, setNewCustPhone] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const totalAmount = items.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0);
  const totalItemCount = items.reduce((sum, item) => sum + item.quantity, 0);

  const handleCashCheckout = async () => {
    if (items.length === 0 || isProcessing) return;

    try {
      setIsProcessing(true);
      setError(null);

      const sale = await recordSale({
        items,
        paymentType: 'cash',
      });

      playSuccessChime();
      triggerHaptic(80);
      try {
        confetti({
          particleCount: 40,
          spread: 60,
          origin: { y: 0.8 },
        });
      } catch {
        // ignore
      }

      onSaleCompleted(sale);
      onClearCart();
      onClose();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Erreur lors du paiement');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleOpenCreditFlow = () => {
    if (items.length === 0) return;
    setShowCreditModal(true);
  };

  const handleConfirmCredit = async () => {
    if (isProcessing) return;
    try {
      setIsProcessing(true);
      setError(null);

      let customerId = selectedCustomerId;
      let customerName = '';
      let customerPhone = '';

      if (isNewCustomer) {
        if (!newCustName.trim()) {
          setError('Veuillez entrer le nom du client');
          setIsProcessing(false);
          return;
        }
        const { customer: created } = await createCustomer({
          name: newCustName.trim(),
          phone: newCustPhone.trim() || '620 00 00 00',
        });
        customerId = created.id;
        customerName = created.name;
        customerPhone = created.phone;
      } else {
        const found = customers.find((c) => c.id === selectedCustomerId);
        if (!found) {
          setError('Veuillez sélectionner un client ou en créer un nouveau');
          setIsProcessing(false);
          return;
        }
        customerName = found.name;
        customerPhone = found.phone;
      }

      const sale = await recordSale({
        items,
        paymentType: 'credit',
        customerId,
        customerName,
        customerPhone,
      });

      playSuccessChime();
      triggerHaptic(80);

      setShowCreditModal(false);
      onSaleCompleted(sale);
      onClearCart();
      onClose();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Erreur lors de l’enregistrement');
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <>
      <div
        className="fixed inset-0 z-40 bg-black/60 backdrop-blur-xs transition-opacity animate-in fade-in duration-200"
        onClick={onClose}
      />

      <div className="fixed inset-y-0 right-0 z-50 w-full max-w-md bg-white shadow-2xl flex flex-col animate-in slide-in-from-right duration-300">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 bg-amber-600 text-white shadow-xs">
          <div className="flex items-center gap-2.5">
            <span className="text-2xl">🛒</span>
            <div>
              <h2 className="text-lg font-black tracking-tight">Panier en cours</h2>
              <p className="text-xs text-amber-100 font-medium">
                {totalItemCount} article{totalItemCount > 1 ? 's' : ''}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {items.length > 0 && (
              <button
                onClick={onClearCart}
                className="p-2 rounded-xl text-amber-100 hover:text-white hover:bg-amber-700 transition"
                title="Vider le panier"
              >
                <Trash2 className="w-5 h-5" />
              </button>
            )}
            <button
              onClick={onClose}
              className="p-2 rounded-xl text-amber-100 hover:text-white hover:bg-amber-700 transition"
            >
              <X className="w-5 h-6" />
            </button>
          </div>
        </div>

        {/* Error message */}
        {error && (
          <div className="p-3 bg-rose-50 text-rose-700 text-xs font-semibold border-b border-rose-200">
            {error}
          </div>
        )}

        {/* Cart Item List */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {items.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-center p-6 text-slate-400">
              <span className="text-5xl mb-3">🧺</span>
              <p className="text-base font-bold text-slate-700">Le panier est vide</p>
              <p className="text-xs text-slate-400 mt-1 max-w-[220px]">
                Touchez un produit sur l'écran ou scannez son QR code pour l'ajouter.
              </p>
            </div>
          ) : (
            items.map((item) => {
              const isPack = item.unitType === 'pack';
              const formatLabel = isPack
                ? `${item.packLabel || 'Carton'} (${item.packSize} un.)`
                : 'Unité';
              const itemPhoto = isPack
                ? item.product.packPhoto || item.product.photo
                : item.product.photo;

              const prodLive = products.find((p) => p.id === item.product.id);
              const maxAvailable = isPack
                ? (prodLive?.stockPacks ?? 0)
                : (prodLive?.stockUnits ?? 0);

              const canOpenCarton =
                !isPack &&
                prodLive &&
                prodLive.packSize &&
                prodLive.stockPacks > 0 &&
                item.quantity >= (prodLive.stockUnits ?? 0);

              return (
                <div
                  key={`${item.product.id}-${item.unitType}`}
                  className="p-3.5 bg-amber-50/40 rounded-2xl border border-amber-200/70 shadow-xs flex flex-col gap-2"
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-3 min-w-0 flex-1">
                      <div className="w-11 h-11 rounded-xl overflow-hidden bg-amber-100 border border-amber-200 flex items-center justify-center text-xl flex-shrink-0">
                        {itemPhoto ? (
                          <img
                            src={itemPhoto}
                            alt={item.product.name}
                            className="w-full h-full object-cover"
                            loading="lazy"
                          />
                        ) : (
                          <span>{item.product.imageUrl || '📦'}</span>
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <h4 className="text-xs font-bold text-slate-900 truncate">
                          {item.product.name}
                        </h4>
                        <div className="flex items-center gap-1.5 mt-0.5">
                          <span
                            className={`text-[10px] font-black px-1.5 py-0.5 rounded capitalize ${
                              isPack
                                ? 'bg-amber-600 text-white'
                                : 'bg-slate-200 text-slate-700'
                            }`}
                          >
                            {formatLabel}
                          </span>
                          <span className="text-[11px] text-amber-700 font-semibold">
                            {formatGNF(item.unitPrice)}
                          </span>
                        </div>
                        <p className="text-xs font-black text-slate-800 mt-0.5">
                          Total: {formatGNF(item.quantity * item.unitPrice)}
                        </p>
                      </div>
                    </div>

                    {/* Tactile + / - buttons */}
                    <div className="flex items-center gap-1.5 flex-shrink-0">
                      <button
                        onClick={() => onUpdateQty(item.product.id, item.unitType, -1)}
                        className="w-9 h-9 rounded-xl bg-white border border-slate-200 text-slate-700 hover:bg-slate-100 active:scale-95 flex items-center justify-center font-black transition shadow-xs"
                        title="Diminuer"
                      >
                        <Minus className="w-4 h-4" />
                      </button>
                      <span className="w-8 text-center text-base font-black text-slate-900">
                        {item.quantity}
                      </span>
                      <button
                        onClick={() => {
                          if (item.quantity >= maxAvailable) {
                            triggerHaptic(100);
                            return;
                          }
                          onUpdateQty(item.product.id, item.unitType, 1);
                        }}
                        disabled={item.quantity >= maxAvailable}
                        className="w-9 h-9 rounded-xl bg-amber-600 text-white hover:bg-amber-700 disabled:opacity-40 disabled:hover:bg-amber-600 active:scale-95 flex items-center justify-center font-black transition shadow-xs"
                        title="Augmenter"
                      >
                        <Plus className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => onRemoveItem(item.product.id, item.unitType)}
                        className="w-8 h-8 ml-1 rounded-xl text-slate-400 hover:text-rose-600 hover:bg-rose-50 flex items-center justify-center transition"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>

                  {/* Stock info and quick open pack if needed */}
                  <div className="flex items-center justify-between text-[10px] text-slate-500 pt-1 border-t border-amber-200/40">
                    <span>
                      Dispo : <strong>{maxAvailable}</strong> {isPack ? 'carton(s) fermé(s)' : 'unité(s) seule(s)'}
                    </span>

                    {canOpenCarton && onOpenPack && (
                      <button
                        type="button"
                        onClick={async () => {
                          await onOpenPack(item.product.id);
                          onUpdateQty(item.product.id, 'unit', 1);
                        }}
                        className="py-1 px-2 bg-amber-500 hover:bg-amber-600 active:scale-95 text-white font-black rounded-lg flex items-center gap-1 transition shadow-xs"
                      >
                        <Box className="w-3 h-3" />
                        <span>Ouvrir 1 carton (+{prodLive.packSize})</span>
                      </button>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Footer Checkout Bar */}
        {items.length > 0 && (
          <div className="p-5 bg-white border-t border-slate-200/90 shadow-xl space-y-4">
            {/* Big Total */}
            <div className="flex items-baseline justify-between">
              <span className="text-sm font-bold text-slate-600">TOTAL À PAYER :</span>
              <span className="text-2xl font-black text-amber-700 tracking-tight">
                {formatGNF(totalAmount)}
              </span>
            </div>

            {/* Huge Two Buttons: PAYÉ or À CRÉDIT */}
            <div className="grid grid-cols-2 gap-3">
              <button
                onClick={handleCashCheckout}
                disabled={isProcessing}
                className="py-4 px-3 rounded-2xl bg-emerald-600 hover:bg-emerald-700 active:scale-95 text-white font-black text-sm flex flex-col items-center justify-center shadow-lg shadow-emerald-600/30 transition"
              >
                <div className="flex items-center gap-1.5 mb-1">
                  <CheckCircle className="w-5 h-5" />
                  <span className="text-base uppercase tracking-wide">PAYÉ</span>
                </div>
                <span className="text-[10px] text-emerald-100 font-normal">
                  Espèces / Orange Money
                </span>
              </button>

              <button
                onClick={handleOpenCreditFlow}
                disabled={isProcessing}
                className="py-4 px-3 rounded-2xl bg-amber-600 hover:bg-amber-700 active:scale-95 text-white font-black text-sm flex flex-col items-center justify-center shadow-lg shadow-amber-600/30 transition"
              >
                <div className="flex items-center gap-1.5 mb-1">
                  <CreditCard className="w-5 h-5" />
                  <span className="text-base uppercase tracking-wide">À CRÉDIT</span>
                </div>
                <span className="text-[10px] text-amber-100 font-normal">
                  Carnet de dette
                </span>
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Modal Selection Client pour Vente à Crédit */}
      {showCreditModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-xs p-4 animate-in fade-in duration-200">
          <div className="w-full max-w-sm rounded-3xl bg-white p-5 shadow-2xl text-slate-800">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <span className="text-xl">📒</span>
                <h3 className="text-base font-bold text-slate-900">Vente à Crédit</h3>
              </div>
              <button
                onClick={() => setShowCreditModal(false)}
                className="p-1 rounded-full text-slate-400 hover:bg-slate-100"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="my-3 p-3 rounded-2xl bg-amber-50 border border-amber-200 flex justify-between items-center">
              <span className="text-xs text-slate-600 font-bold">Montant à inscrire :</span>
              <span className="text-lg font-black text-amber-700">{formatGNF(totalAmount)}</span>
            </div>

            <div className="grid grid-cols-2 gap-2 mb-4">
              <button
                type="button"
                onClick={() => setIsNewCustomer(false)}
                className={`py-2 text-xs font-bold rounded-xl border transition ${
                  !isNewCustomer
                    ? 'bg-amber-600 text-white border-amber-600'
                    : 'bg-slate-50 text-slate-600 border-slate-200'
                }`}
              >
                Client existant
              </button>
              <button
                type="button"
                onClick={() => setIsNewCustomer(true)}
                className={`py-2 text-xs font-bold rounded-xl border transition ${
                  isNewCustomer
                    ? 'bg-amber-600 text-white border-amber-600'
                    : 'bg-slate-50 text-slate-600 border-slate-200'
                }`}
              >
                + Nouveau client
              </button>
            </div>

            {!isNewCustomer ? (
              <div className="space-y-3">
                <label className="text-xs font-bold text-slate-700 block">
                  Choisir le client :
                </label>
                {customers.length === 0 ? (
                  <p className="text-xs text-slate-500 py-3 text-center">
                    Aucun client enregistré. Créez-en un nouveau !
                  </p>
                ) : (
                  <div className="max-h-48 overflow-y-auto space-y-1.5 pr-1">
                    {customers.map((c) => (
                      <button
                        key={c.id}
                        type="button"
                        onClick={() => setSelectedCustomerId(c.id)}
                        className={`w-full p-2.5 rounded-xl border text-left flex items-center justify-between transition ${
                          selectedCustomerId === c.id
                            ? 'bg-amber-100 border-amber-500 text-slate-900 shadow-xs'
                            : 'bg-slate-50 border-slate-200 text-slate-700 hover:bg-slate-100'
                        }`}
                      >
                        <div className="truncate pr-2">
                          <div className="text-xs font-bold truncate">{c.name}</div>
                          <div className="text-[10px] text-slate-500">{c.phone}</div>
                        </div>
                        {c.currentDebt > 0 && (
                          <span className="text-[10px] font-black text-rose-600 bg-rose-50 px-2 py-0.5 rounded-full flex-shrink-0">
                            Dette: {formatGNF(c.currentDebt)}
                          </span>
                        )}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            ) : (
              <div className="space-y-3">
                <div>
                  <label className="text-xs font-bold text-slate-700 block mb-1">
                    Nom du client *
                  </label>
                  <div className="relative">
                    <User className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                    <input
                      type="text"
                      placeholder="Ex: Thierno Barry, Aminata..."
                      value={newCustName}
                      onChange={(e) => setNewCustName(e.target.value)}
                      className="w-full pl-9 pr-3 py-2.5 text-xs bg-slate-50 border border-slate-300 rounded-xl focus:outline-none focus:border-amber-500 font-semibold"
                    />
                  </div>
                </div>

                <div>
                  <label className="text-xs font-bold text-slate-700 block mb-1">
                    Numéro de téléphone (Guinée)
                  </label>
                  <div className="relative">
                    <Phone className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                    <input
                      type="tel"
                      placeholder="Ex: 622 00 00 00"
                      value={newCustPhone}
                      onChange={(e) => setNewCustPhone(e.target.value)}
                      className="w-full pl-9 pr-3 py-2.5 text-xs bg-slate-50 border border-slate-300 rounded-xl focus:outline-none focus:border-amber-500 font-semibold"
                    />
                  </div>
                </div>
              </div>
            )}

            <div className="mt-5 space-y-2">
              <button
                type="button"
                onClick={handleConfirmCredit}
                disabled={isProcessing}
                className="w-full py-3.5 bg-amber-600 hover:bg-amber-700 active:scale-95 text-white font-black text-sm rounded-2xl shadow-lg shadow-amber-600/30 transition flex items-center justify-center gap-2"
              >
                <UserPlus className="w-4 h-4" />
                <span>Confirmer le crédit de {formatGNF(totalAmount)}</span>
              </button>
              <button
                type="button"
                onClick={() => setShowCreditModal(false)}
                className="w-full py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs rounded-xl"
              >
                Annuler
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

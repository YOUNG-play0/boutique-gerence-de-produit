import React, { useState } from 'react';
import {
  UserPlus,
  MessageCircle,
  CreditCard,
  Search,
  Phone,
  ArrowDownLeft,
  X,
  History,
  CheckCircle2,
} from 'lucide-react';
import { CustomerWithBalance, CreditPayment, ShopSettings } from '../../types';
import {
  formatGNF,
  formatDateFrench,
  createWhatsAppReminderLink,
  triggerHaptic,
  playSuccessChime,
} from '../../utils/formatters';
import {
  createCustomer,
  recordCreditPayment,
  getCreditPaymentsForCustomer,
} from '../../services/db';

interface CreditsScreenProps {
  customers: CustomerWithBalance[];
  shopSettings: ShopSettings;
  onRefreshData: () => void;
}

export const CreditsScreen: React.FC<CreditsScreenProps> = ({
  customers,
  shopSettings,
  onRefreshData,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [showAddCustomerModal, setShowAddCustomerModal] = useState(false);
  const [selectedCustomerForPayment, setSelectedCustomerForPayment] =
    useState<CustomerWithBalance | null>(null);
  const [paymentAmount, setPaymentAmount] = useState<number | ''>('');
  const [paymentNote, setPaymentNote] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);

  // New customer form
  const [newName, setNewName] = useState('');
  const [newPhone, setNewPhone] = useState('');
  const [newAddress, setNewAddress] = useState('');

  // Payment history view
  const [customerPayments, setCustomerPayments] = useState<CreditPayment[]>([]);
  const [historyCustomer, setHistoryCustomer] = useState<CustomerWithBalance | null>(null);

  const filteredCustomers = customers.filter(
    (c) =>
      c.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      c.phone.includes(searchQuery)
  );

  const totalOutstandingDebt = customers.reduce((sum, c) => sum + c.currentDebt, 0);
  const customersWithDebtCount = customers.filter((c) => c.currentDebt > 0).length;

  const handleCreateCustomer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName.trim()) return;

    await createCustomer({
      name: newName.trim(),
      phone: newPhone.trim() || '620 00 00 00',
      address: newAddress.trim() || undefined,
    });

    setNewName('');
    setNewPhone('');
    setNewAddress('');
    setShowAddCustomerModal(false);
    onRefreshData();
  };

  const handleOpenPayment = (customer: CustomerWithBalance) => {
    setSelectedCustomerForPayment(customer);
    setPaymentAmount(customer.currentDebt); // default to full remaining debt
    setPaymentNote('Règlement espèces');
  };

  const handleConfirmPayment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedCustomerForPayment || !paymentAmount || paymentAmount <= 0) return;

    try {
      setIsProcessing(true);
      await recordCreditPayment(
        selectedCustomerForPayment.id,
        selectedCustomerForPayment.name,
        Number(paymentAmount),
        paymentNote.trim() || undefined
      );

      playSuccessChime();
      triggerHaptic(60);

      setSelectedCustomerForPayment(null);
      onRefreshData();
    } catch (err) {
      console.error(err);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleViewHistory = async (customer: CustomerWithBalance) => {
    setHistoryCustomer(customer);
    const payments = await getCreditPaymentsForCustomer(customer.id);
    setCustomerPayments(payments);
  };

  return (
    <div className="pb-28 pt-2 px-3 sm:px-4 max-w-5xl mx-auto space-y-4">
      {/* Debt Summary Banner */}
      <div className="bg-gradient-to-br from-amber-600 to-amber-700 rounded-3xl p-5 text-white shadow-lg shadow-amber-900/20">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-amber-200 text-xs font-bold uppercase tracking-wider">
            <CreditCard className="w-4 h-4" />
            <span>Carnet de Crédits Clients</span>
          </div>
          <span className="text-xs bg-amber-800/80 px-2.5 py-0.5 rounded-full font-semibold">
            {customersWithDebtCount} client{customersWithDebtCount > 1 ? 's' : ''} endetté{customersWithDebtCount > 1 ? 's' : ''}
          </span>
        </div>

        <div className="mt-3">
          <div className="text-xs text-amber-100 font-medium">Total des dettes à recouvrer :</div>
          <div className="text-3xl font-black tracking-tight mt-0.5">
            {formatGNF(totalOutstandingDebt)}
          </div>
        </div>

        <div className="mt-4 pt-3 border-t border-amber-500/40 flex items-center justify-between text-xs text-amber-100">
          <span>Relancez vos clients par WhatsApp en un seul clic</span>
          <button
            onClick={() => setShowAddCustomerModal(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-white text-amber-800 rounded-xl font-black shadow-xs hover:bg-amber-50 transition active:scale-95"
          >
            <UserPlus className="w-3.5 h-3.5" />
            <span>Nouveau Client</span>
          </button>
        </div>
      </div>

      {/* Search Bar */}
      <div className="relative">
        <Search className="w-5 h-5 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
        <input
          type="text"
          placeholder="Chercher un client par nom ou téléphone..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="w-full pl-11 pr-4 py-3 bg-white border border-slate-200 rounded-2xl text-xs sm:text-sm font-semibold text-slate-800 placeholder-slate-400 focus:outline-none focus:border-amber-500 shadow-xs"
        />
      </div>

      {/* Customer List */}
      <div className="space-y-3">
        {filteredCustomers.length === 0 ? (
          <div className="text-center py-12 bg-white rounded-3xl p-6 border border-dashed border-amber-200">
            <p className="text-base font-bold text-slate-700">Aucun client trouvé</p>
            <p className="text-xs text-slate-400 mt-1">
              Appuyez sur « Nouveau Client » pour ouvrir un nouveau carnet de crédit.
            </p>
          </div>
        ) : (
          filteredCustomers.map((customer) => {
            const hasDebt = customer.currentDebt > 0;
            const waLink = createWhatsAppReminderLink(
              customer.phone,
              customer.name,
              customer.currentDebt,
              shopSettings.shopName
            );

            return (
              <div
                key={customer.id}
                className={`bg-white rounded-3xl p-4 border-2 shadow-xs transition ${
                  hasDebt ? 'border-amber-300' : 'border-slate-200/80'
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <div
                      className={`w-12 h-12 rounded-2xl flex items-center justify-center font-black text-lg ${
                        hasDebt ? 'bg-amber-100 text-amber-800' : 'bg-slate-100 text-slate-600'
                      }`}
                    >
                      {customer.name.charAt(0).toUpperCase()}
                    </div>
                    <div>
                      <h3 className="text-sm font-black text-slate-900">{customer.name}</h3>
                      <div className="flex items-center gap-1.5 text-xs text-slate-500 font-medium">
                        <Phone className="w-3 h-3 text-slate-400" />
                        <span>{customer.phone}</span>
                      </div>
                      {customer.address && (
                        <div className="text-[11px] text-slate-400 truncate max-w-[200px]">
                          📍 {customer.address}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Debt amount */}
                  <div className="text-right">
                    <div className="text-[10px] text-slate-400 font-semibold uppercase">
                      Reste dû
                    </div>
                    <div
                      className={`text-base font-black ${
                        hasDebt ? 'text-rose-600' : 'text-emerald-600'
                      }`}
                    >
                      {formatGNF(customer.currentDebt)}
                    </div>
                    <div className="text-[10px] text-slate-400">
                      Total réglé : {formatGNF(customer.totalPayments)}
                    </div>
                  </div>
                </div>

                {/* Action buttons */}
                <div className="mt-3 pt-3 border-t border-slate-100 flex items-center gap-2">
                  {/* WhatsApp Reminder Button */}
                  {hasDebt ? (
                    <a
                      href={waLink}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex-1 py-2.5 px-3 bg-emerald-600 hover:bg-emerald-700 active:scale-95 text-white rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 shadow-sm shadow-emerald-600/20 transition"
                      title="Ouvrir WhatsApp avec message pré-rempli"
                    >
                      <MessageCircle className="w-4 h-4" />
                      <span>Rappel WhatsApp</span>
                    </a>
                  ) : (
                    <div className="flex-1 py-2 text-center text-xs text-emerald-600 font-bold bg-emerald-50 rounded-xl">
                      ✓ À jour de ses paiements
                    </div>
                  )}

                  {/* Record Payment Button */}
                  {hasDebt && (
                    <button
                      onClick={() => handleOpenPayment(customer)}
                      className="flex-1 py-2.5 px-3 bg-amber-600 hover:bg-amber-700 active:scale-95 text-white rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 shadow-sm shadow-amber-600/20 transition"
                    >
                      <ArrowDownLeft className="w-4 h-4" />
                      <span>Règlement reçu</span>
                    </button>
                  )}

                  {/* Payment History */}
                  <button
                    onClick={() => handleViewHistory(customer)}
                    className="p-2.5 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-xl transition"
                    title="Voir l'historique des règlements"
                  >
                    <History className="w-4 h-4" />
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Modal Nouveau Client */}
      {showAddCustomerModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 animate-in fade-in duration-200">
          <div className="w-full max-w-sm rounded-3xl bg-white p-5 shadow-2xl text-slate-800">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <UserPlus className="w-5 h-5 text-amber-600" />
                <h3 className="text-base font-bold text-slate-900">Nouveau Client</h3>
              </div>
              <button
                onClick={() => setShowAddCustomerModal(false)}
                className="p-1 rounded-full text-slate-400 hover:bg-slate-100"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateCustomer} className="mt-4 space-y-3">
              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">
                  Nom et prénom *
                </label>
                <input
                  type="text"
                  required
                  placeholder="Ex: Thierno Diallo, Aminata Bah..."
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  className="w-full p-3 text-xs bg-slate-50 border border-slate-300 rounded-xl focus:outline-none focus:border-amber-500 font-semibold"
                />
              </div>

              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">
                  Numéro de téléphone (Guinée)
                </label>
                <input
                  type="tel"
                  placeholder="Ex: 622 12 34 56"
                  value={newPhone}
                  onChange={(e) => setNewPhone(e.target.value)}
                  className="w-full p-3 text-xs bg-slate-50 border border-slate-300 rounded-xl focus:outline-none focus:border-amber-500 font-semibold"
                />
              </div>

              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">
                  Quartier / Adresse
                </label>
                <input
                  type="text"
                  placeholder="Ex: Madina, Dixinn, Kipé..."
                  value={newAddress}
                  onChange={(e) => setNewAddress(e.target.value)}
                  className="w-full p-3 text-xs bg-slate-50 border border-slate-300 rounded-xl focus:outline-none focus:border-amber-500"
                />
              </div>

              <div className="pt-2">
                <button
                  type="submit"
                  className="w-full py-3.5 bg-amber-600 hover:bg-amber-700 text-white font-bold text-xs rounded-xl shadow-md transition"
                >
                  Enregistrer le client
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal Règlement Reçu (Paiement partiel ou total) */}
      {selectedCustomerForPayment && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 animate-in fade-in duration-200">
          <div className="w-full max-w-sm rounded-3xl bg-white p-5 shadow-2xl text-slate-800">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <ArrowDownLeft className="w-5 h-5 text-emerald-600" />
                <h3 className="text-base font-bold text-slate-900">Encaisser un règlement</h3>
              </div>
              <button
                onClick={() => setSelectedCustomerForPayment(null)}
                className="p-1 rounded-full text-slate-400 hover:bg-slate-100"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="my-3 p-3 bg-amber-50 rounded-2xl border border-amber-200 text-xs space-y-1">
              <div className="font-bold text-slate-900">{selectedCustomerForPayment.name}</div>
              <div className="flex justify-between items-center">
                <span className="text-slate-500">Dette restante :</span>
                <span className="font-black text-rose-600 text-sm">
                  {formatGNF(selectedCustomerForPayment.currentDebt)}
                </span>
              </div>
            </div>

            <form onSubmit={handleConfirmPayment} className="space-y-4">
              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">
                  Montant versé aujourd'hui (GNF) *
                </label>
                <div className="relative">
                  <input
                    type="number"
                    min="500"
                    max={selectedCustomerForPayment.currentDebt}
                    required
                    value={paymentAmount}
                    onChange={(e) =>
                      setPaymentAmount(e.target.value === '' ? '' : Number(e.target.value))
                    }
                    className="w-full p-3.5 pr-14 text-lg font-black bg-emerald-50 border-2 border-emerald-300 rounded-2xl text-slate-900 focus:outline-none focus:border-emerald-600"
                  />
                  <span className="absolute right-3.5 top-1/2 -translate-y-1/2 text-xs font-bold text-emerald-700">
                    GNF
                  </span>
                </div>

                <div className="flex gap-2 mt-2">
                  <button
                    type="button"
                    onClick={() => setPaymentAmount(selectedCustomerForPayment.currentDebt)}
                    className="px-2.5 py-1 bg-slate-100 hover:bg-slate-200 rounded-lg text-xs font-bold text-slate-700"
                  >
                    Tout solder ({formatGNF(selectedCustomerForPayment.currentDebt)})
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      setPaymentAmount(Math.round(selectedCustomerForPayment.currentDebt / 2))
                    }
                    className="px-2.5 py-1 bg-slate-100 hover:bg-slate-200 rounded-lg text-xs font-bold text-slate-700"
                  >
                    Moitié (50%)
                  </button>
                </div>
              </div>

              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">
                  Note ou mode de paiement
                </label>
                <input
                  type="text"
                  placeholder="Ex: Espèces direct, Orange Money..."
                  value={paymentNote}
                  onChange={(e) => setPaymentNote(e.target.value)}
                  className="w-full p-2.5 text-xs bg-slate-50 border border-slate-200 rounded-xl"
                />
              </div>

              <button
                type="submit"
                disabled={isProcessing}
                className="w-full py-4 bg-emerald-600 hover:bg-emerald-700 active:scale-95 text-white font-black text-sm rounded-2xl shadow-lg shadow-emerald-600/30 transition flex items-center justify-center gap-2"
              >
                <CheckCircle2 className="w-5 h-5" />
                <span>Enregistrer l'encaissement</span>
              </button>
            </form>
          </div>
        </div>
      )}

      {/* Modal Historique des Règlements */}
      {historyCustomer && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 animate-in fade-in duration-200">
          <div className="w-full max-w-sm rounded-3xl bg-white p-5 shadow-2xl text-slate-800 max-h-[85vh] flex flex-col">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div>
                <h3 className="text-base font-bold text-slate-900">Historique des versements</h3>
                <p className="text-xs text-slate-500 font-medium">{historyCustomer.name}</p>
              </div>
              <button
                onClick={() => setHistoryCustomer(null)}
                className="p-1 rounded-full text-slate-400 hover:bg-slate-100"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto space-y-2 my-3">
              {customerPayments.length === 0 ? (
                <p className="text-xs text-slate-400 py-6 text-center">
                  Aucun règlement enregistré pour le moment.
                </p>
              ) : (
                customerPayments.map((p) => (
                  <div
                    key={p.id}
                    className="p-3 bg-emerald-50/60 border border-emerald-100 rounded-2xl flex items-center justify-between text-xs"
                  >
                    <div>
                      <div className="font-bold text-emerald-900">Règlement reçu</div>
                      <div className="text-[10px] text-slate-400">{formatDateFrench(p.date)}</div>
                      {p.note && <div className="text-[10px] text-slate-500">{p.note}</div>}
                    </div>
                    <div className="text-sm font-black text-emerald-700">
                      +{formatGNF(p.amount)}
                    </div>
                  </div>
                ))
              )}
            </div>

            <button
              onClick={() => setHistoryCustomer(null)}
              className="w-full py-3 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs rounded-xl"
            >
              Fermer
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

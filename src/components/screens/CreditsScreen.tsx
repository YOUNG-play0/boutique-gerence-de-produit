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
  FilePlus,
  Ban,
  ShoppingBag,
  Calendar,
  AlertCircle,
  Clock,
} from 'lucide-react';
import {
  CustomerWithBalance,
  CreditPayment,
  CustomerDebtEntry,
  ShopSettings,
} from '../../types';
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
  addCustomerDebt,
  cancelCustomerDebt,
  getDebtsForCustomer,
  getSalesForCustomer,
} from '../../services/db';

interface CreditsScreenProps {
  customers: CustomerWithBalance[];
  shopSettings: ShopSettings;
  onRefreshData: () => void;
}

type HistoryItem =
  | {
      kind: 'debt';
      id: string;
      date: string;
      amount: number;
      label: string;
      type: 'dette_initiale' | 'dette_manuelle';
      isCancelled?: boolean;
      entry: CustomerDebtEntry;
    }
  | {
      kind: 'sale';
      id: string;
      date: string;
      amount: number;
      isCancelled?: boolean;
      itemsCount: number;
    }
  | {
      kind: 'payment';
      id: string;
      date: string;
      amount: number;
      note?: string;
    };

export const CreditsScreen: React.FC<CreditsScreenProps> = ({
  customers,
  shopSettings,
  onRefreshData,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [showAddCustomerModal, setShowAddCustomerModal] = useState(false);

  // Règlement reçu
  const [selectedCustomerForPayment, setSelectedCustomerForPayment] =
    useState<CustomerWithBalance | null>(null);
  const [paymentAmount, setPaymentAmount] = useState<number | ''>('');
  const [paymentNote, setPaymentNote] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);

  // Formulaire nouveau client
  const [newName, setNewName] = useState('');
  const [newPhone, setNewPhone] = useState('');
  const [newAddress, setNewAddress] = useState('');
  const [newInitialDebt, setNewInitialDebt] = useState<number | ''>('');

  // Modal ajouter une dette sans vente
  const [debtModalCustomer, setDebtModalCustomer] =
    useState<CustomerWithBalance | null>(null);
  const [manualDebtAmount, setManualDebtAmount] = useState<number | ''>('');
  const [manualDebtDate, setManualDebtDate] = useState<string>('');
  const [manualDebtNote, setManualDebtNote] = useState<string>('');
  const [isProcessingDebt, setIsProcessingDebt] = useState(false);
  const [debtError, setDebtError] = useState<string | null>(null);

  // Modal historique complet
  const [historyCustomer, setHistoryCustomer] = useState<CustomerWithBalance | null>(null);
  const [customerHistoryList, setCustomerHistoryList] = useState<HistoryItem[]>([]);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);
  const [cancellingDebtId, setCancellingDebtId] = useState<string | null>(null);

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

    const initialDebtValue =
      newInitialDebt !== '' && Number(newInitialDebt) > 0
        ? Number(newInitialDebt)
        : undefined;

    await createCustomer(
      {
        name: newName.trim(),
        phone: newPhone.trim() || '620 00 00 00',
        address: newAddress.trim() || undefined,
      },
      initialDebtValue
    );

    setNewName('');
    setNewPhone('');
    setNewAddress('');
    setNewInitialDebt('');
    setShowAddCustomerModal(false);
    onRefreshData();
  };

  const handleOpenPayment = (customer: CustomerWithBalance) => {
    setSelectedCustomerForPayment(customer);
    setPaymentAmount(customer.currentDebt);
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

  const handleOpenAddDebtModal = (customer: CustomerWithBalance) => {
    setDebtModalCustomer(customer);
    setManualDebtAmount('');
    setManualDebtDate(new Date().toISOString().split('T')[0]);
    setManualDebtNote('');
    setDebtError(null);
  };

  const handleConfirmAddDebt = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!debtModalCustomer) return;
    if (!manualDebtAmount || Number(manualDebtAmount) <= 0) {
      setDebtError('Veuillez entrer un montant supérieur à zéro');
      return;
    }

    try {
      setIsProcessingDebt(true);
      setDebtError(null);

      const dateIso = manualDebtDate
        ? new Date(manualDebtDate).toISOString()
        : new Date().toISOString();

      await addCustomerDebt({
        customerId: debtModalCustomer.id,
        customerName: debtModalCustomer.name,
        amount: Number(manualDebtAmount),
        type: 'dette_manuelle',
        date: dateIso,
        note: manualDebtNote.trim() || undefined,
      });

      playSuccessChime();
      triggerHaptic(60);

      setDebtModalCustomer(null);
      onRefreshData();

      if (historyCustomer && historyCustomer.id === debtModalCustomer.id) {
        await loadCustomerHistory(debtModalCustomer);
      }
    } catch (err: unknown) {
      setDebtError(err instanceof Error ? err.message : 'Erreur lors de l’enregistrement');
    } finally {
      setIsProcessingDebt(false);
    }
  };

  const loadCustomerHistory = async (customer: CustomerWithBalance) => {
    setIsLoadingHistory(true);
    try {
      const [payments, debts, sales] = await Promise.all([
        getCreditPaymentsForCustomer(customer.id),
        getDebtsForCustomer(customer.id),
        getSalesForCustomer(customer.id),
      ]);

      const items: HistoryItem[] = [];

      debts.forEach((d) => {
        items.push({
          kind: 'debt',
          id: d.id,
          date: d.date,
          amount: d.amount,
          label: d.note || (d.type === 'dette_initiale' ? 'Ancienne dette (carnet)' : 'Dette manuelle'),
          type: d.type,
          isCancelled: d.isCancelled,
          entry: d,
        });
      });

      sales
        .filter((s) => s.paymentType === 'credit')
        .forEach((s) => {
          items.push({
            kind: 'sale',
            id: s.id,
            date: s.date,
            amount: s.totalAmount,
            isCancelled: s.isCancelled,
            itemsCount: s.items.reduce((sum, it) => sum + it.quantity, 0),
          });
        });

      payments.forEach((p) => {
        items.push({
          kind: 'payment',
          id: p.id,
          date: p.date,
          amount: p.amount,
          note: p.note,
        });
      });

      items.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
      setCustomerHistoryList(items);
    } catch (err) {
      console.error('Erreur chargement historique client:', err);
    } finally {
      setIsLoadingHistory(false);
    }
  };

  const handleViewHistory = async (customer: CustomerWithBalance) => {
    setHistoryCustomer(customer);
    await loadCustomerHistory(customer);
  };

  const handleCancelManualDebtAction = async (debtEntry: CustomerDebtEntry) => {
    if (debtEntry.isCancelled) return;
    const confirmMsg = `Annuler cette dette de ${formatGNF(debtEntry.amount)} (${
      debtEntry.note || 'Dette manuelle'
    }) ?\n\nCette action retirera ce montant de la dette du client tout en conservant la ligne dans l'historique marquée comme annulée.`;

    if (!window.confirm(confirmMsg)) return;

    try {
      setCancellingDebtId(debtEntry.id);
      await cancelCustomerDebt(debtEntry.id);
      triggerHaptic(70);
      onRefreshData();

      if (historyCustomer) {
        const updatedCust = customers.find((c) => c.id === historyCustomer.id);
        if (updatedCust) {
          setHistoryCustomer(updatedCust);
        }
        await loadCustomerHistory(historyCustomer);
      }
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Erreur lors de l’annulation');
    } finally {
      setCancellingDebtId(null);
    }
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
                <div className="mt-3 pt-3 border-t border-slate-100 flex flex-wrap items-center gap-2">
                  {/* WhatsApp Reminder Button */}
                  {hasDebt ? (
                    <a
                      href={waLink}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex-1 min-w-[130px] py-2.5 px-3 bg-emerald-600 hover:bg-emerald-700 active:scale-95 text-white rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 shadow-sm shadow-emerald-600/20 transition"
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
                      className="flex-1 min-w-[120px] py-2.5 px-3 bg-amber-600 hover:bg-amber-700 active:scale-95 text-white rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 shadow-sm shadow-amber-600/20 transition"
                    >
                      <ArrowDownLeft className="w-4 h-4" />
                      <span>Règlement reçu</span>
                    </button>
                  )}

                  {/* Bouton : Ajouter une dette sans vente */}
                  <button
                    onClick={() => handleOpenAddDebtModal(customer)}
                    className="py-2.5 px-3 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 active:scale-95 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition"
                    title="Ajouter une dette sans vente (dette manuelle)"
                  >
                    <FilePlus className="w-4 h-4 text-rose-600" />
                    <span>Ajouter une dette</span>
                  </button>

                  {/* History button */}
                  <button
                    onClick={() => handleViewHistory(customer)}
                    className="p-2.5 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-xl transition"
                    title="Voir l'historique complet (dettes, ventes, règlements)"
                  >
                    <History className="w-4 h-4" />
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Modal Nouveau Client avec champ facultatif Dette Actuelle (GNF) */}
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

              {/* Champ facultatif : Dette actuelle (GNF) */}
              <div className="pt-1">
                <div className="flex items-center justify-between mb-1">
                  <label className="text-xs font-bold text-slate-700">
                    Dette actuelle (GNF) <span className="font-normal text-slate-400">(facultatif)</span>
                  </label>
                  {newInitialDebt !== '' && Number(newInitialDebt) > 0 && (
                    <span className="text-[11px] font-bold text-rose-600">
                      {formatGNF(Number(newInitialDebt))}
                    </span>
                  )}
                </div>
                <div className="relative">
                  <input
                    type="number"
                    min="0"
                    step="1"
                    placeholder="Ex: 150000"
                    value={newInitialDebt}
                    onChange={(e) =>
                      setNewInitialDebt(e.target.value === '' ? '' : Math.max(0, parseInt(e.target.value) || 0))
                    }
                    className="w-full p-3 pr-14 text-sm font-black bg-rose-50/50 border border-rose-200 rounded-xl text-slate-900 focus:outline-none focus:border-rose-500"
                  />
                  <span className="absolute right-3.5 top-1/2 -translate-y-1/2 text-xs font-black text-rose-700">
                    GNF
                  </span>
                </div>
                <p className="text-[10px] text-slate-400 mt-1 leading-tight">
                  Enregistre une dette de départ « Ancienne dette (carnet) » sans vente ni mouvement de stock.
                </p>
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

      {/* Modal : Ajouter une dette sans vente (dette manuelle) */}
      {debtModalCustomer && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 animate-in fade-in duration-200">
          <div className="w-full max-w-sm rounded-3xl bg-white p-5 shadow-2xl text-slate-800">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <FilePlus className="w-5 h-5 text-rose-600" />
                <div>
                  <h3 className="text-base font-bold text-slate-900">Ajouter une dette</h3>
                  <p className="text-xs text-slate-500 font-medium">{debtModalCustomer.name}</p>
                </div>
              </div>
              <button
                onClick={() => setDebtModalCustomer(null)}
                className="p-1 rounded-full text-slate-400 hover:bg-slate-100"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {debtError && (
              <div className="my-3 p-3 bg-rose-50 text-rose-700 text-xs font-semibold rounded-xl border border-rose-200 flex items-center gap-2">
                <AlertCircle className="w-4 h-4 flex-shrink-0" />
                <span>{debtError}</span>
              </div>
            )}

            <div className="my-3 p-3 bg-amber-50 rounded-2xl border border-amber-200 text-xs flex justify-between items-center">
              <span className="text-slate-600">Dette actuelle :</span>
              <span className="font-black text-rose-600 text-sm">
                {formatGNF(debtModalCustomer.currentDebt)}
              </span>
            </div>

            <form onSubmit={handleConfirmAddDebt} className="space-y-3">
              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">
                  Montant de la dette (GNF) *
                </label>
                <div className="relative">
                  <input
                    type="number"
                    min="1"
                    step="1"
                    required
                    placeholder="Ex: 50000"
                    value={manualDebtAmount}
                    onChange={(e) =>
                      setManualDebtAmount(e.target.value === '' ? '' : Number(e.target.value))
                    }
                    className="w-full p-3.5 pr-14 text-lg font-black bg-rose-50/60 border-2 border-rose-200 rounded-2xl text-slate-900 focus:outline-none focus:border-rose-600"
                  />
                  <span className="absolute right-3.5 top-1/2 -translate-y-1/2 text-xs font-bold text-rose-700">
                    GNF
                  </span>
                </div>
                {manualDebtAmount !== '' && Number(manualDebtAmount) > 0 && (
                  <p className="text-xs font-bold text-rose-700 mt-1">
                    Nouvelle dette totale : {formatGNF(debtModalCustomer.currentDebt + Number(manualDebtAmount))}
                  </p>
                )}
              </div>

              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">
                  Date de la dette (facultative)
                </label>
                <input
                  type="date"
                  value={manualDebtDate}
                  onChange={(e) => setManualDebtDate(e.target.value)}
                  className="w-full p-2.5 text-xs bg-slate-50 border border-slate-200 rounded-xl font-semibold text-slate-700"
                />
              </div>

              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">
                  Motif ou note (facultatif)
                </label>
                <input
                  type="text"
                  placeholder="Ex: Ancienne dette carnet, avance espèces..."
                  value={manualDebtNote}
                  onChange={(e) => setManualDebtNote(e.target.value)}
                  className="w-full p-2.5 text-xs bg-slate-50 border border-slate-200 rounded-xl text-slate-800"
                />
              </div>

              <div className="p-2.5 bg-slate-50 rounded-xl border border-slate-200 text-[10px] text-slate-500">
                ℹ️ Cette dette augmente le compte du client <strong>sans créer de vente</strong> et <strong>sans toucher aux stocks</strong> ni au chiffre d'affaires.
              </div>

              <button
                type="submit"
                disabled={isProcessingDebt}
                className="w-full py-3.5 bg-rose-600 hover:bg-rose-700 active:scale-95 text-white font-black text-xs rounded-2xl shadow-lg shadow-rose-600/30 transition flex items-center justify-center gap-2"
              >
                <CheckCircle2 className="w-4 h-4" />
                <span>Enregistrer la dette</span>
              </button>
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
                    min="1"
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

      {/* Modal Historique Complet du Client (Dettes sans vente, Ventes à crédit, Règlements) */}
      {historyCustomer && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 animate-in fade-in duration-200">
          <div className="w-full max-w-md rounded-3xl bg-white p-5 shadow-2xl text-slate-800 max-h-[85vh] flex flex-col">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div>
                <h3 className="text-base font-bold text-slate-900">Historique du compte</h3>
                <p className="text-xs text-slate-500 font-medium">{historyCustomer.name}</p>
              </div>
              <button
                onClick={() => setHistoryCustomer(null)}
                className="p-1 rounded-full text-slate-400 hover:bg-slate-100"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Recap Card */}
            <div className="my-3 p-3 bg-slate-50 rounded-2xl border border-slate-200 grid grid-cols-2 gap-2 text-xs">
              <div>
                <span className="text-slate-400 block text-[10px] uppercase font-bold">Reste dû</span>
                <span className={`text-base font-black ${historyCustomer.currentDebt > 0 ? 'text-rose-600' : 'text-emerald-600'}`}>
                  {formatGNF(historyCustomer.currentDebt)}
                </span>
              </div>
              <div className="text-right">
                <span className="text-slate-400 block text-[10px] uppercase font-bold">Total réglé</span>
                <span className="text-base font-black text-emerald-700">
                  {formatGNF(historyCustomer.totalPayments)}
                </span>
              </div>
            </div>

            {/* Bouton rapide d'ajout de dette depuis l'historique */}
            <div className="mb-2 flex gap-2">
              <button
                onClick={() => handleOpenAddDebtModal(historyCustomer)}
                className="flex-1 py-2 px-3 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition"
              >
                <FilePlus className="w-3.5 h-3.5 text-rose-600" />
                <span>Ajouter une dette</span>
              </button>
              {historyCustomer.currentDebt > 0 && (
                <button
                  onClick={() => {
                    handleOpenPayment(historyCustomer);
                  }}
                  className="flex-1 py-2 px-3 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-200 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition"
                >
                  <ArrowDownLeft className="w-3.5 h-3.5 text-emerald-600" />
                  <span>Règlement</span>
                </button>
              )}
            </div>

            {/* List */}
            <div className="flex-1 overflow-y-auto space-y-2.5 my-2 pr-1">
              {isLoadingHistory ? (
                <p className="text-xs text-slate-400 py-8 text-center">
                  Chargement de l'historique...
                </p>
              ) : customerHistoryList.length === 0 ? (
                <p className="text-xs text-slate-400 py-8 text-center">
                  Aucune opération enregistrée pour ce client.
                </p>
              ) : (
                customerHistoryList.map((item) => {
                  if (item.kind === 'debt') {
                    // Dette manuelle ou initiale
                    return (
                      <div
                        key={item.id}
                        className={`p-3 rounded-2xl border flex items-start justify-between text-xs transition ${
                          item.isCancelled
                            ? 'bg-slate-50 border-slate-200 opacity-60'
                            : 'bg-rose-50/70 border-rose-200'
                        }`}
                      >
                        <div className="min-w-0 flex-1 pr-2">
                          <div className="flex items-center gap-1.5">
                            <span
                              className={`text-[10px] font-black px-1.5 py-0.5 rounded uppercase ${
                                item.isCancelled
                                  ? 'bg-slate-200 text-slate-600'
                                  : 'bg-rose-600 text-white'
                              }`}
                            >
                              {item.type === 'dette_initiale' ? 'Dette Initiale' : 'Dette Manuelle'}
                            </span>
                            {item.isCancelled && (
                              <span className="text-[10px] font-black text-rose-700 bg-rose-100 px-1.5 py-0.5 rounded">
                                Annulée
                              </span>
                            )}
                          </div>
                          <div className="font-bold text-slate-900 mt-1 truncate">
                            {item.label}
                          </div>
                          <div className="text-[10px] text-slate-400 flex items-center gap-1 mt-0.5">
                            <Calendar className="w-3 h-3 text-slate-400" />
                            <span>{formatDateFrench(item.date)}</span>
                          </div>
                        </div>

                        <div className="text-right flex flex-col items-end flex-shrink-0">
                          <span
                            className={`text-sm font-black ${
                              item.isCancelled
                                ? 'line-through text-slate-400'
                                : 'text-rose-700'
                            }`}
                          >
                            +{formatGNF(item.amount)}
                          </span>

                          {!item.isCancelled && (
                            <button
                              type="button"
                              onClick={() => handleCancelManualDebtAction(item.entry)}
                              disabled={cancellingDebtId === item.id}
                              className="mt-1 text-[10px] font-bold text-rose-600 hover:text-rose-800 bg-white hover:bg-rose-50 px-2 py-0.5 rounded border border-rose-200 flex items-center gap-1 transition"
                              title="Annuler cette dette saisie par erreur"
                            >
                              <Ban className="w-3 h-3" />
                              <span>Annuler</span>
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  }

                  if (item.kind === 'sale') {
                    // Vente à crédit
                    return (
                      <div
                        key={item.id}
                        className={`p-3 rounded-2xl border flex items-start justify-between text-xs transition ${
                          item.isCancelled
                            ? 'bg-slate-50 border-slate-200 opacity-60'
                            : 'bg-amber-50/60 border-amber-200'
                        }`}
                      >
                        <div className="min-w-0 flex-1 pr-2">
                          <div className="flex items-center gap-1.5">
                            <span
                              className={`text-[10px] font-black px-1.5 py-0.5 rounded uppercase ${
                                item.isCancelled
                                  ? 'bg-slate-200 text-slate-600'
                                  : 'bg-amber-600 text-white'
                              }`}
                            >
                              Vente à crédit
                            </span>
                            {item.isCancelled && (
                              <span className="text-[10px] font-black text-rose-700 bg-rose-100 px-1.5 py-0.5 rounded">
                                Vente annulée
                              </span>
                            )}
                          </div>
                          <div className="font-bold text-slate-900 mt-1 flex items-center gap-1">
                            <ShoppingBag className="w-3.5 h-3.5 text-amber-600" />
                            <span>{item.itemsCount} article(s)</span>
                          </div>
                          <div className="text-[10px] text-slate-400 flex items-center gap-1 mt-0.5">
                            <Calendar className="w-3 h-3 text-slate-400" />
                            <span>{formatDateFrench(item.date)}</span>
                          </div>
                        </div>

                        <div className="text-right">
                          <span
                            className={`text-sm font-black ${
                              item.isCancelled
                                ? 'line-through text-slate-400'
                                : 'text-amber-800'
                            }`}
                          >
                            +{formatGNF(item.amount)}
                          </span>
                        </div>
                      </div>
                    );
                  }

                  // item.kind === 'payment' (règlement reçu)
                  return (
                    <div
                      key={item.id}
                      className="p-3 bg-emerald-50/70 border border-emerald-200 rounded-2xl flex items-start justify-between text-xs"
                    >
                      <div className="min-w-0 flex-1 pr-2">
                        <div className="flex items-center gap-1.5">
                          <span className="text-[10px] font-black px-1.5 py-0.5 rounded uppercase bg-emerald-600 text-white">
                            Règlement reçu
                          </span>
                        </div>
                        <div className="font-bold text-slate-900 mt-1">
                          {item.note || 'Règlement espèces'}
                        </div>
                        <div className="text-[10px] text-slate-400 flex items-center gap-1 mt-0.5">
                          <Clock className="w-3 h-3 text-emerald-600" />
                          <span>{formatDateFrench(item.date)}</span>
                        </div>
                      </div>

                      <div className="text-right">
                        <span className="text-sm font-black text-emerald-700">
                          -{formatGNF(item.amount)}
                        </span>
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            <button
              onClick={() => setHistoryCustomer(null)}
              className="w-full mt-2 py-3 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs rounded-xl"
            >
              Fermer
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

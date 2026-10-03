import React, { useState, useMemo } from 'react';
import {
  Calendar,
  TrendingUp,
  DollarSign,
  AlertTriangle,
  Receipt,
  Package,
  Layers,
  CheckCircle2,
  Share2,
  RotateCcw,
} from 'lucide-react';
import { Sale, ProductWithStock, CreditPayment } from '../../types';
import { formatGNF, formatDateFrench } from '../../utils/formatters';

interface DailyReportScreenProps {
  sales: Sale[];
  payments: CreditPayment[];
  products: ProductWithStock[];
  onCancelSale?: (saleId: string) => Promise<void>;
}

export const DailyReportScreen: React.FC<DailyReportScreenProps> = ({
  sales,
  payments,
  products,
  onCancelSale,
}) => {
  const todayStr = new Date().toISOString().split('T')[0];
  const [selectedDate, setSelectedDate] = useState(todayStr);
  const [cancellingSaleId, setCancellingSaleId] = useState<string | null>(null);

  // Exclure les ventes annulées des totaux financiers
  const daySales = useMemo(() => {
    return sales.filter((s) => s.date.startsWith(selectedDate));
  }, [sales, selectedDate]);

  const activeDaySales = useMemo(() => {
    return daySales.filter((s) => !s.isCancelled);
  }, [daySales]);

  const dayPayments = useMemo(() => {
    return payments.filter((p) => p.date.startsWith(selectedDate));
  }, [payments, selectedDate]);

  const totalSalesAmount = activeDaySales.reduce((sum, s) => sum + s.totalAmount, 0);

  const cashSalesAmount = activeDaySales
    .filter((s) => s.paymentType === 'cash')
    .reduce((sum, s) => sum + s.totalAmount, 0);
  const creditPaymentsAmount = dayPayments.reduce((sum, p) => sum + p.amount, 0);
  const totalEncaisse = cashSalesAmount + creditPaymentsAmount;

  const totalCreditGiven = activeDaySales
    .filter((s) => s.paymentType === 'credit')
    .reduce((sum, s) => sum + s.totalAmount, 0);

  // Décompte séparé des unités et des cartons
  let totalUnitsSoldOnly = 0;
  let totalPacksSoldOnly = 0;

  activeDaySales.forEach((s) => {
    s.items.forEach((it) => {
      if (it.unitType === 'pack') {
        totalPacksSoldOnly += it.quantity;
      } else {
        totalUnitsSoldOnly += it.quantity;
      }
    });
  });

  // Top products sold with unit and pack breakdown
  const topProducts = useMemo(() => {
    const map = new Map<
      string,
      {
        name: string;
        unitCount: number;
        packCount: number;
        packLabel?: string;
        total: number;
      }
    >();

    activeDaySales.forEach((s) => {
      s.items.forEach((item) => {
        const curr = map.get(item.productId) || {
          name: item.productName,
          unitCount: 0,
          packCount: 0,
          packLabel: item.packLabel,
          total: 0,
        };
        if (item.unitType === 'pack') {
          curr.packCount += item.quantity;
          if (item.packLabel) curr.packLabel = item.packLabel;
        } else {
          curr.unitCount += item.quantity;
        }
        curr.total += item.total;
        map.set(item.productId, curr);
      });
    });

    return Array.from(map.values()).sort(
      (a, b) => b.unitCount + b.packCount - (a.unitCount + a.packCount)
    );
  }, [activeDaySales]);

  const lowStockProducts = products.filter((p) => p.isLowStock);
  const isToday = selectedDate === todayStr;

  const handleShareSummary = () => {
    const summary = `📊 *BILAN DU ${selectedDate}*
💰 Chiffre d'Affaires : ${formatGNF(totalSalesAmount)}
💵 Total Encaissé Réel : ${formatGNF(totalEncaisse)} (Comptant: ${formatGNF(cashSalesAmount)} + Règlements reçus: ${formatGNF(creditPaymentsAmount)})
📒 Ventes à crédit : ${formatGNF(totalCreditGiven)}
📦 Ventes du jour : ${totalUnitsSoldOnly} unité(s) & ${totalPacksSoldOnly} carton(s)
⚠️ Alertes stock bas : ${lowStockProducts.length} articles`;

    if (navigator.share) {
      navigator.share({
        title: 'Bilan Boutique',
        text: summary,
      });
    } else {
      navigator.clipboard.writeText(summary);
      alert('Bilan copié dans le presse-papier !');
    }
  };

  const handleCancelSaleAction = async (sale: Sale) => {
    if (!onCancelSale) return;
    if (
      !window.confirm(
        `Annuler la vente de ${formatGNF(sale.totalAmount)} ?\n\nLes stocks correspondants (cartons fermés et/ou unités seules) seront automatiquement réinjectés.`
      )
    ) {
      return;
    }

    try {
      setCancellingSaleId(sale.id);
      await onCancelSale(sale.id);
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : "Erreur lors de l'annulation de la vente");
    } finally {
      setCancellingSaleId(null);
    }
  };

  return (
    <div className="pb-28 pt-2 px-3 sm:px-4 max-w-5xl mx-auto space-y-4">
      {/* Date Header */}
      <div className="bg-white rounded-3xl p-4 border border-amber-200/80 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <div className="p-2.5 rounded-2xl bg-amber-100 text-amber-800">
            <Calendar className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-base font-black text-slate-900">
              {isToday ? "Point de la Journée (Aujourd'hui)" : `Point du ${selectedDate}`}
            </h2>
            <p className="text-xs text-slate-500 font-medium">
              Synthèse financière, stocks cartons & unités
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <input
            type="date"
            value={selectedDate}
            onChange={(e) => setSelectedDate(e.target.value)}
            className="p-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-700 focus:outline-none focus:border-amber-500"
          />
          <button
            onClick={handleShareSummary}
            className="p-2 bg-amber-50 hover:bg-amber-100 text-amber-800 rounded-xl transition flex items-center gap-1 text-xs font-bold"
            title="Partager le bilan"
          >
            <Share2 className="w-4 h-4" />
            <span className="hidden sm:inline">Partager</span>
          </button>
        </div>
      </div>

      {/* 4 Main Metrics Cards with Big Numbers */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {/* 1. Total Ventes (CA) */}
        <div className="bg-white rounded-3xl p-4 border border-amber-200 shadow-xs">
          <div className="flex items-center gap-1.5 text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">
            <TrendingUp className="w-4 h-4 text-amber-600" />
            <span>Chiffre d'Affaires</span>
          </div>
          <div className="text-xl sm:text-2xl font-black text-slate-900">
            {formatGNF(totalSalesAmount)}
          </div>
          <div className="text-[11px] text-slate-400 mt-1">
            {activeDaySales.length} transaction{activeDaySales.length > 1 ? 's' : ''}
          </div>
        </div>

        {/* 2. Total Encaissé en caisse */}
        <div className="bg-emerald-50 rounded-3xl p-4 border border-emerald-200 shadow-xs">
          <div className="flex items-center gap-1.5 text-xs font-bold text-emerald-800 uppercase tracking-wider mb-1">
            <DollarSign className="w-4 h-4 text-emerald-600" />
            <span>Total Encaissé</span>
          </div>
          <div className="text-xl sm:text-2xl font-black text-emerald-800">
            {formatGNF(totalEncaisse)}
          </div>
          <div className="text-[11px] text-emerald-700/80 mt-1">
            Comptant: {formatGNF(cashSalesAmount)}
            {creditPaymentsAmount > 0 && ` + Dettes: ${formatGNF(creditPaymentsAmount)}`}
          </div>
        </div>

        {/* 3. Ventes à crédit */}
        <div className="bg-amber-50 rounded-3xl p-4 border border-amber-300 shadow-xs">
          <div className="flex items-center gap-1.5 text-xs font-bold text-amber-800 uppercase tracking-wider mb-1">
            <Receipt className="w-4 h-4 text-amber-600" />
            <span>Sorti à Crédit</span>
          </div>
          <div className="text-xl sm:text-2xl font-black text-amber-800">
            {formatGNF(totalCreditGiven)}
          </div>
          <div className="text-[11px] text-amber-700/80 mt-1">À récupérer dans le carnet</div>
        </div>

        {/* 4. Articles vendus : décompte séparé unités et cartons */}
        <div className="bg-white rounded-3xl p-4 border border-slate-200 shadow-xs">
          <div className="flex items-center gap-1.5 text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">
            <Package className="w-4 h-4 text-slate-600" />
            <span>Quantités vendues</span>
          </div>
          <div className="text-sm sm:text-base font-black text-slate-900 mt-1">
            <span className="text-xl sm:text-2xl">{totalUnitsSoldOnly}</span> unités seules
          </div>
          <div className="text-xs font-black text-amber-700 flex items-center gap-1 mt-0.5">
            <Layers className="w-3.5 h-3.5" />
            <span>{totalPacksSoldOnly} carton(s) fermé(s)</span>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Top Produits Vendus */}
        <div className="bg-white rounded-3xl p-5 border border-slate-200 shadow-xs space-y-3">
          <h3 className="text-sm font-black text-slate-900 flex items-center gap-2">
            <span>🏆</span>
            <span>Articles vendus ({selectedDate})</span>
          </h3>

          {topProducts.length === 0 ? (
            <p className="text-xs text-slate-400 py-6 text-center">Aucune vente ce jour-là.</p>
          ) : (
            <div className="space-y-2">
              {topProducts.slice(0, 6).map((item, index) => (
                <div
                  key={index}
                  className="flex items-center justify-between p-2.5 bg-slate-50 rounded-2xl text-xs"
                >
                  <div className="flex items-center gap-2.5 truncate pr-2">
                    <span className="w-6 h-6 rounded-full bg-amber-100 text-amber-900 flex items-center justify-center font-bold text-xs flex-shrink-0">
                      {index + 1}
                    </span>
                    <span className="font-bold text-slate-800 truncate">{item.name}</span>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <div className="font-black text-slate-900">
                      {item.unitCount > 0 && `${item.unitCount} seule(s)`}
                      {item.unitCount > 0 && item.packCount > 0 && ' + '}
                      {item.packCount > 0 && `${item.packCount} ${item.packLabel || 'carton'}(s)`}
                    </div>
                    <div className="text-[10px] text-amber-700 font-semibold">
                      {formatGNF(item.total)}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Produits à réapprovisionner (Stock bas : cartons ou unités) */}
        <div className="bg-white rounded-3xl p-5 border border-slate-200 shadow-xs space-y-3">
          <h3 className="text-sm font-black text-slate-900 flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-rose-600" />
            <span>Articles en alerte stock</span>
          </h3>

          {lowStockProducts.length === 0 ? (
            <div className="py-6 text-center text-xs text-emerald-600 font-bold bg-emerald-50 rounded-2xl">
              <CheckCircle2 className="w-6 h-6 mx-auto mb-1 text-emerald-500" />
              Tous les stocks sont au-dessus de leur seuil !
            </div>
          ) : (
            <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
              {lowStockProducts.map((p) => {
                const hasPack = !!(p.packSize && p.packSize >= 2);
                const packLabel = p.packLabel || 'carton';

                return (
                  <div
                    key={p.id}
                    className="flex items-center justify-between p-2.5 bg-rose-50/60 border border-rose-100 rounded-2xl text-xs"
                  >
                    <div className="flex items-center gap-2 truncate pr-2">
                      <span className="text-base">{p.imageUrl || '📦'}</span>
                      <div className="truncate">
                        <div className="font-bold text-slate-900 truncate">{p.name}</div>
                        <div className="text-[10px] text-slate-400">
                          Seuil unités : {p.alertThreshold}
                          {hasPack && p.alertThresholdPacks !== undefined && ` | Seuil ${packLabel}s : ${p.alertThresholdPacks}`}
                        </div>
                      </div>
                    </div>
                    <div className="text-right flex-shrink-0">
                      <span className="px-2.5 py-1 rounded-xl font-black text-xs bg-amber-500 text-white">
                        {hasPack
                          ? `${p.stockPacks} ${packLabel}${p.stockPacks > 1 ? 's' : ''} + ${p.stockUnits} un.`
                          : `${p.stockUnits} un.`}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Chronological Sales Table with Annulation de Vente */}
      <div className="bg-white rounded-3xl p-5 border border-slate-200 shadow-xs space-y-3">
        <h3 className="text-sm font-black text-slate-900 flex items-center gap-2">
          <Receipt className="w-4 h-4 text-amber-600" />
          <span>Ventes enregistrées le {selectedDate} ({daySales.length})</span>
        </h3>

        {daySales.length === 0 ? (
          <p className="text-xs text-slate-400 py-6 text-center">Aucune vente enregistrée pour cette date.</p>
        ) : (
          <div className="space-y-2.5 max-h-96 overflow-y-auto pr-1">
            {daySales.map((sale) => (
              <div
                key={sale.id}
                className={`p-3 border rounded-2xl flex items-center justify-between text-xs transition ${
                  sale.isCancelled
                    ? 'bg-slate-100/80 border-slate-200 opacity-60'
                    : 'bg-slate-50 border-slate-100'
                }`}
              >
                <div className="min-w-0 flex-1 pr-3">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span
                      className={`px-2 py-0.5 rounded-md text-[10px] font-bold ${
                        sale.isCancelled
                          ? 'bg-slate-300 text-slate-700 line-through'
                          : sale.paymentType === 'cash'
                          ? 'bg-emerald-100 text-emerald-800'
                          : 'bg-amber-100 text-amber-800'
                      }`}
                    >
                      {sale.isCancelled
                        ? 'Vente annulée'
                        : sale.paymentType === 'cash'
                        ? 'Payé comptant'
                        : `Crédit: ${sale.customerName}`}
                    </span>
                    <span className="text-[11px] text-slate-400">{formatDateFrench(sale.date)}</span>
                  </div>

                  <div className="text-[11px] text-slate-600 mt-1 truncate">
                    {sale.items
                      .map((it) => {
                        const fmt = it.unitType === 'pack' ? ` ${it.packLabel || 'carton'}(s)` : ' unité(s)';
                        return `${it.quantity}x${fmt} ${it.productName}`;
                      })
                      .join(', ')}
                  </div>
                </div>

                <div className="text-right flex items-center gap-3 flex-shrink-0">
                  <div className="font-black text-sm text-slate-900">
                    <span className={sale.isCancelled ? 'line-through text-slate-400' : ''}>
                      {formatGNF(sale.totalAmount)}
                    </span>
                  </div>

                  {!sale.isCancelled && onCancelSale && (
                    <button
                      type="button"
                      disabled={cancellingSaleId === sale.id}
                      onClick={() => handleCancelSaleAction(sale)}
                      className="p-2 text-rose-600 hover:bg-rose-50 border border-rose-200 rounded-xl text-xs font-bold flex items-center gap-1 transition active:scale-95"
                      title="Annuler cette vente et remettre le stock en place"
                    >
                      <RotateCcw className="w-3.5 h-3.5" />
                      <span className="hidden sm:inline">Annuler</span>
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

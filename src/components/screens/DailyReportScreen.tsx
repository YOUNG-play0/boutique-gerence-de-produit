import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  Calendar,
  CalendarDays,
  TrendingUp,
  TrendingDown,
  Minus,
  DollarSign,
  AlertTriangle,
  Receipt,
  Package,
  Layers,
  CheckCircle2,
  Share2,
  RotateCcw,
  ChevronLeft,
  ChevronRight,
  Star,
  Award,
  ShoppingBag,
} from 'lucide-react';
import { Sale, ProductWithStock, CreditPayment } from '../../types';
import { formatGNF, formatDateFrench } from '../../utils/formatters';
import {
  getSalesByDateRange,
  getCreditPaymentsByDateRange,
  getCustomersWithBalance,
} from '../../services/db';

interface DailyReportScreenProps {
  sales: Sale[];
  payments: CreditPayment[];
  products: ProductWithStock[];
  onCancelSale?: (saleId: string) => Promise<void>;
}

type ViewMode = 'jour' | 'semaine';

/**
 * Retourne la date locale sous forme 'YYYY-MM-DD'
 */
function getLocalDateString(d: Date = new Date()): string {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Calcule le lundi de la semaine à 00:00:00.000 en heure locale
 */
function getMondayOfWeek(d: Date): Date {
  const date = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0, 0);
  const day = date.getDay(); // 0: Dimanche, 1: Lundi, ..., 6: Samedi
  const diff = day === 0 ? -6 : 1 - day;
  date.setDate(date.getDate() + diff);
  date.setHours(0, 0, 0, 0);
  return date;
}

/**
 * Calcule le dimanche de la semaine à 23:59:59.999 en heure locale
 */
function getSundayOfWeek(monday: Date): Date {
  const sunday = new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + 6, 23, 59, 59, 999);
  return sunday;
}

const JOURS_SEMAINE = ['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi', 'Dimanche'];
const JOURS_SEMAINE_COURT = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'];

export const DailyReportScreen: React.FC<DailyReportScreenProps> = ({
  sales: propSales,
  payments: propPayments,
  products,
  onCancelSale,
}) => {
  const [viewMode, setViewMode] = useState<ViewMode>('jour');
  const [selectedDate, setSelectedDate] = useState(() => getLocalDateString());
  const [currentWeekMonday, setCurrentWeekMonday] = useState<Date>(() => getMondayOfWeek(new Date()));
  const [cancellingSaleId, setCancellingSaleId] = useState<string | null>(null);
  const [visibleSalesLimit, setVisibleSalesLimit] = useState(50);
  const [shareFeedback, setShareFeedback] = useState<string | null>(null);

  // Données chargées par plage de dates depuis IndexedDB via l'index 'by-date' (Point 4)
  const [currentSales, setCurrentSales] = useState<Sale[]>([]);
  const [currentPayments, setCurrentPayments] = useState<CreditPayment[]>([]);
  const [prevWeekSales, setPrevWeekSales] = useState<Sale[]>([]);
  const [isLoadingRange, setIsLoadingRange] = useState(false);

  // Bornes de la semaine en cours (Lundi 00:00:00.000 au Dimanche 23:59:59.999 heure locale)
  const currentWeekSunday = useMemo(() => getSundayOfWeek(currentWeekMonday), [currentWeekMonday]);

  // Bornes de la semaine précédente (Lundi 00:00:00.000 au Dimanche 23:59:59.999 heure locale)
  const prevWeekMonday = useMemo(() => {
    return new Date(currentWeekMonday.getFullYear(), currentWeekMonday.getMonth(), currentWeekMonday.getDate() - 7, 0, 0, 0, 0);
  }, [currentWeekMonday]);

  const prevWeekSunday = useMemo(() => {
    return new Date(currentWeekMonday.getFullYear(), currentWeekMonday.getMonth(), currentWeekMonday.getDate() - 1, 23, 59, 59, 999);
  }, [currentWeekMonday]);

  // Chargement ciblé par plage d'index 'by-date' sans parcourir tout l'historique (Point 4)
  const loadPeriodData = useCallback(async () => {
    setIsLoadingRange(true);
    try {
      if (viewMode === 'jour') {
        const parts = selectedDate.split('-').map(Number);
        if (parts.length === 3) {
          const [year, month, day] = parts;
          const startIso = new Date(year, month - 1, day, 0, 0, 0, 0).toISOString();
          const endIso = new Date(year, month - 1, day, 23, 59, 59, 999).toISOString();

          const [loadedSales, loadedPayments] = await Promise.all([
            getSalesByDateRange(startIso, endIso),
            getCreditPaymentsByDateRange(startIso, endIso),
          ]);
          setCurrentSales(loadedSales);
          setCurrentPayments(loadedPayments);
          setPrevWeekSales([]);
        }
      } else {
        const startIso = currentWeekMonday.toISOString();
        const endIso = currentWeekSunday.toISOString();
        const prevStartIso = prevWeekMonday.toISOString();
        const prevEndIso = prevWeekSunday.toISOString();

        const [loadedSales, loadedPayments, loadedPrevSales] = await Promise.all([
          getSalesByDateRange(startIso, endIso),
          getCreditPaymentsByDateRange(startIso, endIso),
          getSalesByDateRange(prevStartIso, prevEndIso),
        ]);
        setCurrentSales(loadedSales);
        setCurrentPayments(loadedPayments);
        setPrevWeekSales(loadedPrevSales);
      }
    } catch (err) {
      console.warn('Erreur chargement plage bilan:', err);
    } finally {
      setIsLoadingRange(false);
    }
  }, [viewMode, selectedDate, currentWeekMonday, currentWeekSunday, prevWeekMonday, prevWeekSunday]);

  // Rechargement réactif lors des modifications de ventes ou de paiements
  useEffect(() => {
    loadPeriodData();
  }, [loadPeriodData, propSales.length, propPayments.length]);

  // =========================================================================
  // 1. DÉFINITIONS STRICTES (Point 1)
  // =========================================================================

  // Ventes actives (hors ventes annulées)
  const activeSales = useMemo(() => {
    return currentSales.filter((s) => !s.isCancelled);
  }, [currentSales]);

  // Paiements actifs reçus (hors annulations éventuelles)
  const activePayments = useMemo(() => {
    return currentPayments.filter((p) => !(p as any).isCancelled);
  }, [currentPayments]);

  // Helper pour extraire la part comptant d'une vente (ne compte jamais le crédit)
  const getSaleCashPart = (s: Sale): number => {
    if (s.isCancelled) return 0;
    const sAny = s as any;
    if (typeof sAny.cashAmount === 'number' && typeof sAny.creditAmount === 'number') {
      return Math.max(0, sAny.cashAmount);
    }
    return s.paymentType === 'cash' ? s.totalAmount : 0;
  };

  // Helper pour extraire la part à crédit d'une vente (ne compte jamais le comptant)
  const getSaleCreditPart = (s: Sale): number => {
    if (s.isCancelled) return 0;
    const sAny = s as any;
    if (typeof sAny.cashAmount === 'number' && typeof sAny.creditAmount === 'number') {
      return Math.max(0, sAny.creditAmount);
    }
    return s.paymentType === 'credit' ? s.totalAmount : 0;
  };

  // "Chiffre d'affaires" = total des ventes du jour / de la semaine, payées comptant ou à crédit, hors ventes annulées.
  // Les dettes initiales ou manuelles ne comptent JAMAIS dans le chiffre d'affaires (elles sont dans customer_debts, pas dans sales).
  const totalSalesAmount = useMemo(() => {
    return Math.round(activeSales.reduce((sum, s) => sum + s.totalAmount, 0));
  }, [activeSales]);

  // "dont ventes comptant" = ventes payées comptant
  const cashSalesAmount = useMemo(() => {
    return Math.round(activeSales.reduce((sum, s) => sum + getSaleCashPart(s), 0));
  }, [activeSales]);

  // "dont dettes remboursées" = paiements de dettes reçus ce jour-là / cette semaine (remboursements de clients).
  // Un paiement qui rembourse une dette initiale compte bien ici.
  const creditPaymentsAmount = useMemo(() => {
    return Math.round(activePayments.reduce((sum, p) => sum + p.amount, 0));
  }, [activePayments]);

  // "Argent encaissé" = ventes payées comptant + paiements de dettes reçus ce jour-là / cette semaine.
  // Ne compte aucun montant deux fois.
  const totalEncaisse = cashSalesAmount + creditPaymentsAmount;

  // "Sorti à crédit" = montant des ventes mises à crédit ce jour-là / cette semaine.
  // Les dettes initiales ou manuelles ne comptent JAMAIS dans "sorti à crédit".
  const totalCreditGiven = useMemo(() => {
    return Math.round(activeSales.reduce((sum, s) => sum + getSaleCreditPart(s), 0));
  }, [activeSales]);

  // Nombre de ventes (comptant et à crédit)
  const cashSalesCount = useMemo(() => {
    return activeSales.filter((s) => s.paymentType === 'cash').length;
  }, [activeSales]);

  const creditSalesCount = useMemo(() => {
    return activeSales.filter((s) => s.paymentType === 'credit').length;
  }, [activeSales]);

  // Quantités vendues : décompte séparé unités seules et cartons fermés
  const { totalUnitsSoldOnly, totalPacksSoldOnly } = useMemo(() => {
    let units = 0;
    let packs = 0;
    activeSales.forEach((s) => {
      s.items.forEach((it) => {
        if (it.unitType === 'pack') {
          packs += it.quantity;
        } else {
          units += it.quantity;
        }
      });
    });
    return { totalUnitsSoldOnly: units, totalPacksSoldOnly: packs };
  }, [activeSales]);

  // Comparaison semaine précédente (sans division par zéro - Point 2)
  const prevWeekCA = useMemo(() => {
    const activePrev = prevWeekSales.filter((s) => !s.isCancelled);
    return Math.round(activePrev.reduce((sum, s) => sum + s.totalAmount, 0));
  }, [prevWeekSales]);

  const weekComparison = useMemo(() => {
    if (viewMode !== 'semaine') return null;

    if (prevWeekCA === 0 && totalSalesAmount === 0) {
      return {
        percent: 0,
        sign: '',
        text: '0 % (stable par rapport à la semaine dernière)',
        isPositive: true,
        isZero: true,
      };
    }

    if (prevWeekCA === 0 && totalSalesAmount > 0) {
      return {
        percent: 100,
        sign: '+',
        text: `+100 % (+${formatGNF(totalSalesAmount)}) par rapport à la semaine dernière`,
        isPositive: true,
        isZero: false,
      };
    }

    const diff = totalSalesAmount - prevWeekCA;
    const percent = Math.round((diff / prevWeekCA) * 100);
    const sign = percent > 0 ? '+' : '';

    return {
      percent,
      sign,
      text: `${sign}${percent} % (${sign}${formatGNF(diff)}) par rapport à la semaine dernière`,
      isPositive: percent >= 0,
      isZero: percent === 0,
    };
  }, [viewMode, prevWeekCA, totalSalesAmount]);

  // Répartition jour par jour de la semaine (Lundi à Dimanche) avec meilleur jour mis en évidence (Point 2)
  const weekDaysBreakdown = useMemo(() => {
    if (viewMode !== 'semaine') return [];

    const days = [0, 1, 2, 3, 4, 5, 6].map((offset) => {
      const dayDate = new Date(
        currentWeekMonday.getFullYear(),
        currentWeekMonday.getMonth(),
        currentWeekMonday.getDate() + offset,
        0,
        0,
        0,
        0
      );
      const dayStr = getLocalDateString(dayDate);
      const startOfDay = dayDate.getTime();
      const endOfDay = new Date(
        dayDate.getFullYear(),
        dayDate.getMonth(),
        dayDate.getDate(),
        23,
        59,
        59,
        999
      ).getTime();

      const daySales = activeSales.filter((s) => {
        const t = new Date(s.date).getTime();
        return t >= startOfDay && t <= endOfDay;
      });

      const dayCA = daySales.reduce((sum, s) => sum + s.totalAmount, 0);

      return {
        offset,
        dayStr,
        name: JOURS_SEMAINE[offset],
        shortName: JOURS_SEMAINE_COURT[offset],
        dayNumber: String(dayDate.getDate()).padStart(2, '0'),
        monthNumber: String(dayDate.getMonth() + 1).padStart(2, '0'),
        salesCount: daySales.length,
        amount: Math.round(dayCA),
      };
    });

    const maxAmount = Math.max(...days.map((d) => d.amount), 0);
    const bestDay = maxAmount > 0 ? days.find((d) => d.amount === maxAmount) : null;

    return days.map((d) => ({
      ...d,
      isBest: bestDay ? d.dayStr === bestDay.dayStr : false,
      percentageOfMax: maxAmount > 0 ? Math.round((d.amount / maxAmount) * 100) : 0,
    }));
  }, [viewMode, currentWeekMonday, activeSales]);

  // 5 produits les plus vendus de la période (Point 2)
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

    activeSales.forEach((s) => {
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

    return Array.from(map.values())
      .sort((a, b) => b.total - a.total || b.unitCount + b.packCount - (a.unitCount + a.packCount))
      .slice(0, 5);
  }, [activeSales]);

  // Formatage des dates pour affichage
  const currentWeekLabel = useMemo(() => {
    const opt: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'short' };
    const startStr = currentWeekMonday.toLocaleDateString('fr-FR', opt);
    const endStr = currentWeekSunday.toLocaleDateString('fr-FR', {
      ...opt,
      year: 'numeric',
    });
    return `Du lun. ${startStr} au dim. ${endStr}`;
  }, [currentWeekMonday, currentWeekSunday]);

  const selectedDateLabel = useMemo(() => {
    const parts = selectedDate.split('-').map(Number);
    if (parts.length === 3) {
      const d = new Date(parts[0], parts[1] - 1, parts[2]);
      return d.toLocaleDateString('fr-FR', {
        weekday: 'long',
        day: 'numeric',
        month: 'long',
        year: 'numeric',
      });
    }
    return selectedDate;
  }, [selectedDate]);

  const isCurrentWeek = useMemo(() => {
    const todayMonday = getMondayOfWeek(new Date());
    return currentWeekMonday.getTime() === todayMonday.getTime();
  }, [currentWeekMonday]);

  const isToday = selectedDate === getLocalDateString();
  const lowStockProducts = products.filter((p) => p.isLowStock);

  // Navigation Semaine
  const handlePrevWeek = () => {
    setCurrentWeekMonday((prev) => {
      const d = new Date(prev.getFullYear(), prev.getMonth(), prev.getDate() - 7, 0, 0, 0, 0);
      return d;
    });
  };

  const handleNextWeek = () => {
    setCurrentWeekMonday((prev) => {
      const d = new Date(prev.getFullYear(), prev.getMonth(), prev.getDate() + 7, 0, 0, 0, 0);
      return d;
    });
  };

  const handleCurrentWeek = () => {
    setCurrentWeekMonday(getMondayOfWeek(new Date()));
  };

  // Navigation Jour
  const handlePrevDay = () => {
    const parts = selectedDate.split('-').map(Number);
    const d = new Date(parts[0], parts[1] - 1, parts[2] - 1);
    setSelectedDate(getLocalDateString(d));
  };

  const handleNextDay = () => {
    const parts = selectedDate.split('-').map(Number);
    const d = new Date(parts[0], parts[1] - 1, parts[2] + 1);
    setSelectedDate(getLocalDateString(d));
  };

  const handleToday = () => {
    setSelectedDate(getLocalDateString());
  };

  // =========================================================================
  // 3. PARTAGE (Point 3 : adapté à WhatsApp pour Jour et Semaine)
  // =========================================================================
  const handleShareSummary = () => {
    let summary = '';

    if (viewMode === 'semaine') {
      const bestDay = weekDaysBreakdown.find((d) => d.isBest);
      const topList = topProducts
        .map((p, idx) => {
          const qty = [];
          if (p.unitCount > 0) qty.push(`${p.unitCount} un.`);
          if (p.packCount > 0) qty.push(`${p.packCount} ${p.packLabel || 'carton'}(s)`);
          return `${idx + 1}. *${p.name}* : ${qty.join(' + ')} (${formatGNF(p.total)})`;
        })
        .join('\n');

      summary = `📊 *BILAN DE LA SEMAINE*
🗓️ ${currentWeekLabel}

💰 *Chiffre d'Affaires :* ${formatGNF(totalSalesAmount)}
💵 *Argent Encaissé :* ${formatGNF(totalEncaisse)}
   • Dont ventes comptant : ${formatGNF(cashSalesAmount)}
   • Dont dettes remboursées : ${formatGNF(creditPaymentsAmount)}
📒 *Sorti à Crédit :* ${formatGNF(totalCreditGiven)}
🧾 *Nombre de ventes :* ${activeSales.length} vente${activeSales.length > 1 ? 's' : ''} (${cashSalesCount} comptant, ${creditSalesCount} à crédit)
📦 *Quantités vendues :* ${totalUnitsSoldOnly} unité(s) seule(s) & ${totalPacksSoldOnly} carton(s) fermé(s)
${weekComparison ? `📈 *Évolution :* ${weekComparison.text}\n` : ''}${bestDay && bestDay.amount > 0 ? `⭐ *Meilleur jour :* ${bestDay.name} (${formatGNF(bestDay.amount)})\n` : ''}
🏆 *Top 5 des ventes de la semaine :*
${topList || 'Aucune vente enregistrée'}`;
    } else {
      const topList = topProducts
        .map((p, idx) => {
          const qty = [];
          if (p.unitCount > 0) qty.push(`${p.unitCount} un.`);
          if (p.packCount > 0) qty.push(`${p.packCount} ${p.packLabel || 'carton'}(s)`);
          return `${idx + 1}. *${p.name}* : ${qty.join(' + ')} (${formatGNF(p.total)})`;
        })
        .join('\n');

      summary = `📊 *BILAN DU JOUR*
🗓️ ${selectedDateLabel}

💰 *Chiffre d'Affaires :* ${formatGNF(totalSalesAmount)}
💵 *Argent Encaissé :* ${formatGNF(totalEncaisse)}
   • Dont ventes comptant : ${formatGNF(cashSalesAmount)}
   • Dont dettes remboursées : ${formatGNF(creditPaymentsAmount)}
📒 *Sorti à Crédit :* ${formatGNF(totalCreditGiven)}
🧾 *Nombre de ventes :* ${activeSales.length} vente${activeSales.length > 1 ? 's' : ''} (${cashSalesCount} comptant, ${creditSalesCount} à crédit)
📦 *Quantités vendues :* ${totalUnitsSoldOnly} unité(s) seule(s) & ${totalPacksSoldOnly} carton(s) fermé(s)
⚠️ *Alertes stock :* ${lowStockProducts.length} article(s)

🏆 *Top 5 des ventes du jour :*
${topList || 'Aucune vente enregistrée'}`;
    }

    if (navigator.share) {
      navigator
        .share({
          title: viewMode === 'semaine' ? 'Bilan Semaine Boutique' : 'Bilan Jour Boutique',
          text: summary,
        })
        .catch(() => {});
    } else if (navigator.clipboard) {
      navigator.clipboard.writeText(summary);
      setShareFeedback('Bilan copié dans le presse-papier !');
      setTimeout(() => setShareFeedback(null), 3000);
    } else {
      setShareFeedback('Partage non pris en charge sur ce navigateur.');
      setTimeout(() => setShareFeedback(null), 3000);
    }
  };

  // Annulation de vente avec avertissement (Point 1 & 4)
  const handleCancelSaleAction = async (sale: Sale) => {
    if (!onCancelSale) return;

    if (sale.paymentType === 'credit' && sale.customerId) {
      try {
        const custs = await getCustomersWithBalance();
        const cust = custs.find((c) => c.id === sale.customerId);
        if (cust) {
          const excess = sale.totalAmount - cust.currentDebt;
          if (excess > 0) {
            const proceed = window.confirm(
              `Avertissement : Ce client a déjà remboursé une partie de sa dette.\n\nConfirmez-vous tout de même l'annulation de cette vente ?`
            );
            if (!proceed) return;
          }
        }
      } catch (checkErr) {
        console.warn('Vérification solde client impossible avant annulation', checkErr);
      }
    }

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
      await loadPeriodData();
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : "Erreur lors de l'annulation de la vente");
    } finally {
      setCancellingSaleId(null);
    }
  };

  return (
    <div className="pb-28 pt-2 px-3 sm:px-4 max-w-5xl mx-auto space-y-4">
      {/* 2. SÉLECTEUR JOUR / SEMAINE EN HAUT DU BILAN (Point 2) */}
      <div className="bg-white rounded-3xl p-3 border border-amber-200 shadow-xs flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 p-1 bg-amber-50 rounded-2xl w-full sm:w-auto">
          <button
            type="button"
            onClick={() => setViewMode('jour')}
            className={`flex-1 sm:flex-initial py-2 px-4 rounded-xl text-xs font-black transition flex items-center justify-center gap-2 ${
              viewMode === 'jour'
                ? 'bg-amber-600 text-white shadow-sm'
                : 'text-amber-900 hover:bg-amber-100/60'
            }`}
          >
            <Calendar className="w-4 h-4" />
            <span>Jour</span>
          </button>
          <button
            type="button"
            onClick={() => setViewMode('semaine')}
            className={`flex-1 sm:flex-initial py-2 px-4 rounded-xl text-xs font-black transition flex items-center justify-center gap-2 ${
              viewMode === 'semaine'
                ? 'bg-amber-600 text-white shadow-sm'
                : 'text-amber-900 hover:bg-amber-100/60'
            }`}
          >
            <CalendarDays className="w-4 h-4" />
            <span>Semaine</span>
          </button>
        </div>

        <button
          type="button"
          onClick={handleShareSummary}
          className="py-2.5 px-3.5 bg-amber-600 hover:bg-amber-700 text-white font-bold rounded-2xl transition flex items-center gap-1.5 text-xs shadow-xs active:scale-95 flex-shrink-0"
          title="Partager le bilan sur WhatsApp"
        >
          <Share2 className="w-4 h-4" />
          <span className="hidden sm:inline">Partager</span>
        </button>
      </div>

      {shareFeedback && (
        <div className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-2xl text-xs font-bold text-center animate-in fade-in">
          {shareFeedback}
        </div>
      )}

      {/* Barre de navigation temporelle */}
      <div className="bg-white rounded-3xl p-4 border border-amber-200/80 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        {viewMode === 'jour' ? (
          <>
            <div className="flex items-center gap-2.5">
              <div className="p-2.5 rounded-2xl bg-amber-100 text-amber-800">
                <Calendar className="w-5 h-5" />
              </div>
              <div>
                <h2 className="text-base font-black text-slate-900">
                  {isToday ? "Point de la Journée (Aujourd'hui)" : `Point du ${selectedDateLabel}`}
                </h2>
                <p className="text-xs text-slate-500 font-medium">
                  Synthèse financière, stocks cartons & unités
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2 flex-wrap sm:flex-nowrap">
              <div className="flex items-center gap-1 bg-slate-100 rounded-2xl p-1">
                <button
                  type="button"
                  onClick={handlePrevDay}
                  title="Jour précédent"
                  className="p-1.5 rounded-xl hover:bg-white text-slate-700 transition"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <input
                  type="date"
                  value={selectedDate}
                  onChange={(e) => setSelectedDate(e.target.value)}
                  className="bg-transparent px-2 py-1 text-xs font-bold text-slate-800 focus:outline-none"
                />
                <button
                  type="button"
                  onClick={handleNextDay}
                  title="Jour suivant"
                  className="p-1.5 rounded-xl hover:bg-white text-slate-700 transition"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>

              {!isToday && (
                <button
                  type="button"
                  onClick={handleToday}
                  className="py-1.5 px-3 bg-amber-50 hover:bg-amber-100 text-amber-900 border border-amber-200 rounded-xl text-xs font-bold transition whitespace-nowrap"
                >
                  Aujourd'hui
                </button>
              )}
            </div>
          </>
        ) : (
          <>
            <div className="flex items-center gap-2.5">
              <div className="p-2.5 rounded-2xl bg-amber-100 text-amber-800">
                <CalendarDays className="w-5 h-5" />
              </div>
              <div>
                <h2 className="text-base font-black text-slate-900">
                  {isCurrentWeek ? 'Semaine en cours' : 'Bilan de la Semaine'}
                </h2>
                <p className="text-xs text-slate-500 font-medium">{currentWeekLabel}</p>
              </div>
            </div>

            <div className="flex items-center gap-2 flex-wrap sm:flex-nowrap">
              <div className="flex items-center gap-1.5 bg-slate-100 rounded-2xl p-1">
                <button
                  type="button"
                  onClick={handlePrevWeek}
                  title="Semaine précédente"
                  className="p-1.5 rounded-xl hover:bg-white text-slate-700 transition"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <span className="text-xs font-bold text-slate-800 px-2 py-1 font-mono">
                  Semaine {currentWeekMonday.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' })}
                </span>
                <button
                  type="button"
                  onClick={handleNextWeek}
                  title="Semaine suivante"
                  className="p-1.5 rounded-xl hover:bg-white text-slate-700 transition"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>

              {!isCurrentWeek && (
                <button
                  type="button"
                  onClick={handleCurrentWeek}
                  className="py-1.5 px-3 bg-amber-50 hover:bg-amber-100 text-amber-900 border border-amber-200 rounded-xl text-xs font-bold transition whitespace-nowrap"
                >
                  Cette semaine
                </button>
              )}
            </div>
          </>
        )}
      </div>

      {/* Comparaison semaine précédente (en mode Semaine - Point 2) */}
      {viewMode === 'semaine' && weekComparison && (
        <div
          className={`p-4 rounded-3xl border flex items-center justify-between gap-3 ${
            weekComparison.isZero
              ? 'bg-slate-50 border-slate-200 text-slate-700'
              : weekComparison.isPositive
              ? 'bg-emerald-50/70 border-emerald-200 text-emerald-900'
              : 'bg-rose-50/70 border-rose-200 text-rose-900'
          }`}
        >
          <div className="flex items-center gap-3 min-w-0">
            <div
              className={`w-9 h-9 rounded-2xl flex items-center justify-center flex-shrink-0 ${
                weekComparison.isZero
                  ? 'bg-slate-200 text-slate-700'
                  : weekComparison.isPositive
                  ? 'bg-emerald-600 text-white'
                  : 'bg-rose-600 text-white'
              }`}
            >
              {weekComparison.isZero ? (
                <Minus className="w-5 h-5" />
              ) : weekComparison.isPositive ? (
                <TrendingUp className="w-5 h-5" />
              ) : (
                <TrendingDown className="w-5 h-5" />
              )}
            </div>
            <div className="min-w-0">
              <div className="text-xs font-bold">
                Évolution :{' '}
                <span className="text-sm font-black tracking-tight">{weekComparison.text}</span>
              </div>
              <div className="text-[11px] opacity-80">
                Semaine précédente : {formatGNF(prevWeekCA)}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* =========================================================================
          LES TOTAUX : DÉFINITIONS EXACTES (Point 1 & Point 2)
          1. Chiffre d'Affaires
          2. Argent Encaissé (détail comptant / dettes remboursées)
          3. Sorti à Crédit
          4. Nombre de ventes
          5. Quantités vendues (unités seules et cartons)
         ========================================================================= */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
        {/* 1. Chiffre d'Affaires */}
        <div className="bg-white rounded-3xl p-4 border border-amber-200 shadow-xs space-y-1">
          <div className="flex items-center gap-1.5 text-[11px] font-bold text-slate-500 uppercase tracking-wider">
            <TrendingUp className="w-3.5 h-3.5 text-amber-600 flex-shrink-0" />
            <span className="truncate">Chiffre d'Affaires</span>
          </div>
          <div className="text-lg sm:text-xl font-black text-slate-900 tracking-tight">
            {formatGNF(totalSalesAmount)}
          </div>
          <div className="text-[10px] text-slate-500 font-medium">
            Total des ventes ({viewMode === 'semaine' ? 'semaine' : 'jour'})
          </div>
        </div>

        {/* 2. Argent Encaissé avec détail comptant / dettes remboursées (Point 1) */}
        <div className="bg-emerald-50 rounded-3xl p-4 border border-emerald-200 shadow-xs space-y-1">
          <div className="flex items-center gap-1.5 text-[11px] font-bold text-emerald-800 uppercase tracking-wider">
            <DollarSign className="w-3.5 h-3.5 text-emerald-600 flex-shrink-0" />
            <span className="truncate">Argent Encaissé</span>
          </div>
          <div className="text-lg sm:text-xl font-black text-emerald-800 tracking-tight">
            {formatGNF(totalEncaisse)}
          </div>
          <div className="text-[10px] text-emerald-900/90 font-semibold space-y-0.5 pt-0.5 leading-tight">
            <div>• Dont comptant : {formatGNF(cashSalesAmount)}</div>
            <div>• Dont dettes remboursées : {formatGNF(creditPaymentsAmount)}</div>
          </div>
        </div>

        {/* 3. Sorti à Crédit */}
        <div className="bg-amber-50 rounded-3xl p-4 border border-amber-300 shadow-xs space-y-1">
          <div className="flex items-center gap-1.5 text-[11px] font-bold text-amber-800 uppercase tracking-wider">
            <Receipt className="w-3.5 h-3.5 text-amber-600 flex-shrink-0" />
            <span className="truncate">Sorti à Crédit</span>
          </div>
          <div className="text-lg sm:text-xl font-black text-amber-800 tracking-tight">
            {formatGNF(totalCreditGiven)}
          </div>
          <div className="text-[10px] text-amber-700/80 font-medium">
            Montant mis à crédit sur la période
          </div>
        </div>

        {/* 4. Nombre de ventes */}
        <div className="bg-white rounded-3xl p-4 border border-slate-200 shadow-xs space-y-1">
          <div className="flex items-center gap-1.5 text-[11px] font-bold text-slate-500 uppercase tracking-wider">
            <ShoppingBag className="w-3.5 h-3.5 text-slate-600 flex-shrink-0" />
            <span className="truncate">Nombre de ventes</span>
          </div>
          <div className="text-lg sm:text-xl font-black text-slate-900 tracking-tight">
            {activeSales.length} vente{activeSales.length > 1 ? 's' : ''}
          </div>
          <div className="text-[10px] text-slate-500 font-medium">
            {cashSalesCount} comptant • {creditSalesCount} à crédit
          </div>
        </div>

        {/* 5. Quantités vendues : unités seules et cartons fermés */}
        <div className="bg-white rounded-3xl p-4 border border-slate-200 shadow-xs space-y-1 col-span-2 md:col-span-1 lg:col-span-1">
          <div className="flex items-center gap-1.5 text-[11px] font-bold text-slate-500 uppercase tracking-wider">
            <Package className="w-3.5 h-3.5 text-slate-600 flex-shrink-0" />
            <span className="truncate">Quantités vendues</span>
          </div>
          <div className="text-sm font-black text-slate-900">
            <span className="text-lg sm:text-xl">{totalUnitsSoldOnly}</span> unité(s) seule(s)
          </div>
          <div className="text-xs font-black text-amber-700 flex items-center gap-1">
            <Layers className="w-3.5 h-3.5" />
            <span>{totalPacksSoldOnly} carton(s) fermé(s)</span>
          </div>
        </div>
      </div>

      {/* RÉPARTITION JOUR PAR JOUR (Lundi à Dimanche) SOUS FORME DE BARRES (Point 2) */}
      {viewMode === 'semaine' && (
        <div className="bg-white rounded-3xl p-4 sm:p-5 border border-slate-200 shadow-xs space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="p-2 rounded-xl bg-amber-100 text-amber-800">
                <TrendingUp className="w-4 h-4" />
              </div>
              <div>
                <h3 className="text-sm font-black text-slate-900">
                  Répartition quotidienne (Lundi à Dimanche)
                </h3>
                <p className="text-[11px] text-slate-500">
                  Chiffre d'affaires jour par jour • Meilleur jour mis en valeur
                </p>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-7 gap-1 sm:gap-2.5 pt-2">
            {weekDaysBreakdown.map((d) => (
              <button
                key={d.dayStr}
                type="button"
                onClick={() => {
                  setSelectedDate(d.dayStr);
                  setViewMode('jour');
                }}
                className={`p-1.5 sm:p-3 rounded-2xl border text-center transition flex flex-col items-center justify-between group relative ${
                  d.isBest
                    ? 'bg-amber-500/10 border-amber-400 ring-2 ring-amber-400/40 shadow-xs'
                    : 'bg-slate-50 border-slate-200/80 hover:bg-slate-100'
                }`}
              >
                {/* Badge meilleur jour */}
                {d.isBest && (
                  <span className="absolute -top-2.5 px-1.5 py-0.5 rounded-full bg-amber-500 text-white text-[9px] font-black flex items-center gap-0.5 shadow-xs">
                    <Star className="w-2.5 h-2.5 fill-current" />
                    <span className="hidden sm:inline">Top</span>
                  </span>
                )}

                <div className="w-full">
                  <div
                    className={`text-[11px] sm:text-xs font-black ${
                      d.isBest ? 'text-amber-800 font-extrabold' : 'text-slate-700'
                    }`}
                  >
                    {d.shortName}
                  </div>
                  <div className="text-[9px] sm:text-[10px] text-slate-400 font-mono">
                    {d.dayNumber}/{d.monthNumber}
                  </div>
                </div>

                {/* Petite barre graphique proportionnelle */}
                <div className="w-full my-2 h-16 sm:h-24 bg-slate-200/60 rounded-xl flex items-end p-1 overflow-hidden">
                  <div
                    className={`w-full rounded-lg transition-all duration-500 ${
                      d.isBest
                        ? 'bg-gradient-to-t from-amber-600 to-amber-400'
                        : d.amount > 0
                        ? 'bg-amber-500/80 group-hover:bg-amber-600'
                        : 'bg-slate-300/40'
                    }`}
                    style={{ height: `${Math.max(d.percentageOfMax, 6)}%` }}
                  />
                </div>

                <div className="w-full">
                  <div
                    className={`text-[9px] sm:text-[11px] font-black truncate ${
                      d.isBest ? 'text-amber-900 font-extrabold' : 'text-slate-900'
                    }`}
                  >
                    {d.amount > 0 ? formatGNF(d.amount) : '0 GNF'}
                  </div>
                  <div className="text-[9px] text-slate-400">
                    {d.salesCount} v.
                  </div>
                </div>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* TOP PRODUITS & ALERTES */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Top 5 Produits les plus vendus de la période (Point 2) */}
        <div className="bg-white rounded-3xl p-5 border border-slate-200 shadow-xs space-y-3">
          <h3 className="text-sm font-black text-slate-900 flex items-center gap-2">
            <Award className="w-4 h-4 text-amber-600" />
            <span>
              {viewMode === 'semaine'
                ? '5 produits les plus vendus de la semaine'
                : `5 articles les plus vendus (${selectedDate})`}
            </span>
          </h3>

          {topProducts.length === 0 ? (
            <p className="text-xs text-slate-400 py-6 text-center">
              Aucune vente enregistrée sur cette période.
            </p>
          ) : (
            <div className="space-y-2">
              {topProducts.map((item, index) => (
                <div
                  key={index}
                  className="flex items-center justify-between p-2.5 bg-slate-50 rounded-2xl text-xs hover:bg-slate-100 transition"
                >
                  <div className="flex items-center gap-2.5 truncate pr-2">
                    <span
                      className={`w-6 h-6 rounded-full flex items-center justify-center font-bold text-xs flex-shrink-0 ${
                        index === 0
                          ? 'bg-amber-500 text-white shadow-xs'
                          : index === 1
                          ? 'bg-amber-200 text-amber-900'
                          : 'bg-slate-200 text-slate-700'
                      }`}
                    >
                      {index + 1}
                    </span>
                    <span className="font-bold text-slate-800 truncate">{item.name}</span>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <div className="font-black text-slate-900">
                      {item.unitCount > 0 && `${item.unitCount} unité(s)`}
                      {item.unitCount > 0 && item.packCount > 0 && ' + '}
                      {item.packCount > 0 && `${item.packCount} ${item.packLabel || 'carton'}(s)`}
                    </div>
                    <div className="text-[10px] text-amber-700 font-semibold font-mono">
                      {formatGNF(item.total)}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Alertes stock bas */}
        <div className="bg-white rounded-3xl p-5 border border-slate-200 shadow-xs space-y-3">
          <h3 className="text-sm font-black text-slate-900 flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-rose-600" />
            <span>Articles en alerte stock</span>
          </h3>

          {lowStockProducts.length === 0 ? (
            <div className="py-6 text-center text-xs text-emerald-600 font-bold bg-emerald-50 rounded-2xl">
              <CheckCircle2 className="w-6 h-6 mx-auto mb-1 text-emerald-500" />
              Tous les stocks sont au-dessus de leur seuil d'alerte !
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
                          {hasPack &&
                            p.alertThresholdPacks !== undefined &&
                            ` | Seuil ${packLabel}s : ${p.alertThresholdPacks}`}
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

      {/* Ventes détaillées de la période (en mode Jour ou Semaine) */}
      <div className="bg-white rounded-3xl p-5 border border-slate-200 shadow-xs space-y-3">
        <h3 className="text-sm font-black text-slate-900 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Receipt className="w-4 h-4 text-amber-600" />
            <span>
              {viewMode === 'jour'
                ? `Ventes enregistrées le ${selectedDate}`
                : `Ventes de la semaine (${activeSales.length})`}
            </span>
          </div>
          {isLoadingRange && (
            <span className="text-xs text-slate-400 font-normal">Chargement...</span>
          )}
        </h3>

        {currentSales.length === 0 ? (
          <p className="text-xs text-slate-400 py-6 text-center">
            Aucune vente enregistrée pour cette période.
          </p>
        ) : (
          <div className="space-y-2.5 max-h-96 overflow-y-auto pr-1">
            {currentSales.slice(0, visibleSalesLimit).map((sale) => (
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
                    <span className="text-[11px] text-slate-400 font-mono">
                      {formatDateFrench(sale.date)}
                    </span>
                  </div>

                  <div className="text-[11px] text-slate-600 mt-1 truncate">
                    {sale.items
                      .map((it) => {
                        const fmt =
                          it.unitType === 'pack'
                            ? ` ${it.packLabel || 'carton'}(s)`
                            : ' unité(s)';
                        return `${it.quantity}x${fmt} ${it.productName}`;
                      })
                      .join(', ')}
                  </div>
                </div>

                <div className="text-right flex items-center gap-3 flex-shrink-0">
                  <div className="font-black text-sm text-slate-900 font-mono">
                    <span className={sale.isCancelled ? 'line-through text-slate-400' : ''}>
                      {formatGNF(sale.totalAmount)}
                    </span>
                  </div>

                  {!sale.isCancelled && onCancelSale && (
                    <button
                      type="button"
                      disabled={cancellingSaleId === sale.id}
                      onClick={() => handleCancelSaleAction(sale)}
                      className="p-2 text-rose-600 hover:bg-rose-50 border border-rose-200 rounded-xl text-xs font-bold flex items-center gap-1 transition active:scale-95 disabled:opacity-50"
                      title="Annuler cette vente et réinjecter les stocks"
                    >
                      <RotateCcw className="w-3.5 h-3.5" />
                      <span className="hidden sm:inline">Annuler</span>
                    </button>
                  )}
                </div>
              </div>
            ))}

            {currentSales.length > visibleSalesLimit && (
              <button
                type="button"
                onClick={() => setVisibleSalesLimit((prev) => prev + 50)}
                className="w-full py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs rounded-xl transition"
              >
                Afficher 50 ventes de plus ({currentSales.length - visibleSalesLimit} restantes)
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

import React, { useState, useEffect, useRef } from 'react';
import {
  Bot,
  Send,
  Mic,
  MicOff,
  WifiOff,
  RefreshCw,
  Copy,
  Check,
  MessageCircle,
  X,
  User,
  AlertCircle,
} from 'lucide-react';
import { ProductWithStock, CustomerWithBalance, Sale, CreditPayment } from '../../types';
import { formatGNF, triggerHaptic } from '../../utils/formatters';
import { generateUUID } from '../../utils/crypto';
import { recordAssistantQuestion } from '../../services/telemetry';

interface AssistantScreenProps {
  products: ProductWithStock[];
  customers: CustomerWithBalance[];
  sales: Sale[];
  payments: CreditPayment[];
}

interface Message {
  id: string;
  sender: 'user' | 'assistant';
  text: string;
  timestamp: string;
}

interface ShortcutItem {
  category: 'VENTES' | 'DETTES' | 'STOCK';
  label: string;
  isReminderPicker?: boolean;
}

// 1. Raccourcis classés par catégorie (Point 1)
const QUICK_SHORTCUTS: ShortcutItem[] = [
  // VENTES
  { category: 'VENTES', label: "Mes ventes d'aujourd'hui" },
  { category: 'VENTES', label: 'Mes ventes de la semaine' },
  { category: 'VENTES', label: 'Mes meilleurs produits' },
  { category: 'VENTES', label: 'Produits qui ne se vendent pas' },
  { category: 'VENTES', label: 'Quel jour je vends le plus ?' },
  { category: 'VENTES', label: 'Comparer avec la semaine dernière' },

  // DETTES
  { category: 'DETTES', label: "Qui me doit de l'argent ?" },
  { category: 'DETTES', label: 'Qui me doit le plus ?' },
  { category: 'DETTES', label: "Qui n'a pas payé depuis longtemps ?" },
  { category: 'DETTES', label: 'Écris un rappel pour un client', isReminderPicker: true },

  // STOCK
  { category: 'STOCK', label: 'Que dois-je racheter ?' },
  { category: 'STOCK', label: 'Produits presque finis' },
  { category: 'STOCK', label: 'Résumé de ma journée' },
];

/**
 * Calcule le lundi de la semaine à 00:00:00.000 heure locale
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
 * Calcule le dimanche de la semaine à 23:59:59.999 heure locale
 */
function getSundayOfWeek(monday: Date): Date {
  const sunday = new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + 6, 23, 59, 59, 999);
  return sunday;
}

export const AssistantScreen: React.FC<AssistantScreenProps> = ({
  products,
  customers,
  sales,
  payments,
}) => {
  const [messages, setMessages] = useState<Message[]>([
    {
      id: 'welcome',
      sender: 'assistant',
      text: "Bonjour ! Je suis l'assistant de votre boutique. Choisissez une question rapide ci-dessus ou écrivez-moi ci-dessous.",
      timestamp: new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }),
    },
  ]);
  const [inputText, setInputText] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Sélecteur de client pour le rappel (Point 3)
  const [isReminderModalOpen, setIsReminderModalOpen] = useState(false);
  const [selectedReminderClient, setSelectedReminderClient] = useState<CustomerWithBalance | null>(null);
  const [copiedMessageId, setCopiedMessageId] = useState<string | null>(null);

  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const recognitionRef = useRef<any>(null);

  const isOnline = typeof navigator !== 'undefined' ? navigator.onLine : true;

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isLoading]);

  // Initialisation de la reconnaissance vocale en français
  useEffect(() => {
    const SpeechRecognition =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;

    if (SpeechRecognition) {
      const recognition = new SpeechRecognition();
      recognition.continuous = false;
      recognition.interimResults = false;
      recognition.lang = 'fr-FR';

      recognition.onresult = (event: any) => {
        const transcript = event.results[0][0].transcript;
        if (transcript) {
          setInputText((prev) => (prev ? `${prev} ${transcript}` : transcript));
        }
        setIsListening(false);
      };

      recognition.onerror = () => {
        setIsListening(false);
      };

      recognition.onend = () => {
        setIsListening(false);
      };

      recognitionRef.current = recognition;
    }
  }, []);

  const toggleListening = () => {
    if (!recognitionRef.current) {
      alert("La reconnaissance vocale n'est pas supportée par votre navigateur.");
      return;
    }

    triggerHaptic(40);
    if (isListening) {
      recognitionRef.current.stop();
      setIsListening(false);
    } else {
      try {
        recognitionRef.current.start();
        setIsListening(true);
      } catch (err) {
        console.warn('Erreur micro:', err);
      }
    }
  };

  /**
   * 2. CONTEXTE (calculé par le code, jamais par l'IA) :
   * Limite stricte de 10 éléments maximum par liste.
   */
  const buildContext = () => {
    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
    const endOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);

    const currentWeekMonday = getMondayOfWeek(now);
    const currentWeekSunday = getSundayOfWeek(currentWeekMonday);

    const prevWeekMonday = new Date(
      currentWeekMonday.getFullYear(),
      currentWeekMonday.getMonth(),
      currentWeekMonday.getDate() - 7,
      0,
      0,
      0,
      0
    );
    const prevWeekSunday = new Date(
      currentWeekMonday.getFullYear(),
      currentWeekMonday.getMonth(),
      currentWeekMonday.getDate() - 1,
      23,
      59,
      59,
      999
    );

    const activeSales = sales.filter((s) => !s.isCancelled);

    // 1) Ventes d'aujourd'hui, de la semaine en cours et de la semaine précédente
    const salesToday = activeSales.filter((s) => {
      const t = new Date(s.date).getTime();
      return t >= startOfToday.getTime() && t <= endOfToday.getTime();
    });

    const salesCurrentWeek = activeSales.filter((s) => {
      const t = new Date(s.date).getTime();
      return t >= currentWeekMonday.getTime() && t <= currentWeekSunday.getTime();
    });

    const salesPrevWeek = activeSales.filter((s) => {
      const t = new Date(s.date).getTime();
      return t >= prevWeekMonday.getTime() && t <= prevWeekSunday.getTime();
    });

    const caToday = Math.round(salesToday.reduce((sum, s) => sum + s.totalAmount, 0));
    const caCurrentWeek = Math.round(salesCurrentWeek.reduce((sum, s) => sum + s.totalAmount, 0));
    const caPrevWeek = Math.round(salesPrevWeek.reduce((sum, s) => sum + s.totalAmount, 0));

    const diffSemaine = caCurrentWeek - caPrevWeek;
    const evolutionPourcentage =
      caPrevWeek > 0
        ? `${diffSemaine >= 0 ? '+' : ''}${Math.round((diffSemaine / caPrevWeek) * 100)} %`
        : caCurrentWeek > 0
        ? '+100 %'
        : '0 %';

    // 2) Total par jour de semaine sur les 8 dernières semaines (56 jours)
    const eightWeeksAgo = new Date(now.getTime() - 56 * 24 * 60 * 60 * 1000);
    eightWeeksAgo.setHours(0, 0, 0, 0);

    const sales8Weeks = activeSales.filter((s) => new Date(s.date) >= eightWeeksAgo);

    const joursStats: Record<number, { nom: string; totalVentesGNF: number; nombreVentes: number }> = {
      1: { nom: 'Lundi', totalVentesGNF: 0, nombreVentes: 0 },
      2: { nom: 'Mardi', totalVentesGNF: 0, nombreVentes: 0 },
      3: { nom: 'Mercredi', totalVentesGNF: 0, nombreVentes: 0 },
      4: { nom: 'Jeudi', totalVentesGNF: 0, nombreVentes: 0 },
      5: { nom: 'Vendredi', totalVentesGNF: 0, nombreVentes: 0 },
      6: { nom: 'Samedi', totalVentesGNF: 0, nombreVentes: 0 },
      0: { nom: 'Dimanche', totalVentesGNF: 0, nombreVentes: 0 },
    };

    sales8Weeks.forEach((s) => {
      const dayIndex = new Date(s.date).getDay();
      if (joursStats[dayIndex]) {
        joursStats[dayIndex].totalVentesGNF += s.totalAmount;
        joursStats[dayIndex].nombreVentes += 1;
      }
    });

    const totalParJourSur8Semaines = [1, 2, 3, 4, 5, 6, 0].map((idx) => ({
      jour: joursStats[idx].nom,
      totalVentesGNF: Math.round(joursStats[idx].totalVentesGNF),
      nombreVentes: joursStats[idx].nombreVentes,
    }));

    const sortedDays = [...totalParJourSur8Semaines].sort((a, b) => b.totalVentesGNF - a.totalVentesGNF);
    const meilleurJour = sortedDays[0]?.totalVentesGNF > 0 ? sortedDays[0].jour : 'Non déterminé';

    // 3) Les 10 produits les plus vendus de la semaine
    const weeklyProductMap = new Map<string, { nom: string; quantiteVendue: number; chiffreAffairesGNF: number }>();
    salesCurrentWeek.forEach((s) => {
      s.items.forEach((it) => {
        const curr = weeklyProductMap.get(it.productId) || {
          nom: it.productName,
          quantiteVendue: 0,
          chiffreAffairesGNF: 0,
        };
        curr.quantiteVendue += it.quantity;
        curr.chiffreAffairesGNF += it.total;
        weeklyProductMap.set(it.productId, curr);
      });
    });

    const top10ProduitsVendusSemaine = Array.from(weeklyProductMap.values())
      .sort((a, b) => b.quantiteVendue - a.quantiteVendue || b.chiffreAffairesGNF - a.chiffreAffairesGNF)
      .slice(0, 10);

    // Et jusqu'à 10 produits sans aucune vente depuis 30 jours
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const sales30Days = activeSales.filter((s) => new Date(s.date) >= thirtyDaysAgo);
    const soldProductIds30Days = new Set<string>();
    sales30Days.forEach((s) => {
      s.items.forEach((it) => soldProductIds30Days.add(it.productId));
    });

    const produitsSansVente30Jours = products
      .filter((p) => !soldProductIds30Days.has(p.id))
      .slice(0, 10)
      .map((p) => ({
        nom: p.name,
        stockUnites: p.stockUnits,
        stockCartons: p.stockPacks || 0,
        prixUnitaireGNF: p.price,
      }));

    // 4) Clients endettés (10 maximum, les plus gros d'abord, JAMAIS de numéro de téléphone)
    const indebtedClients = customers
      .filter((c) => c.currentDebt > 0)
      .sort((a, b) => b.currentDebt - a.currentDebt)
      .slice(0, 10)
      .map((c) => {
        const clientCreditSales = activeSales
          .filter((s) => s.customerId === c.id && s.paymentType === 'credit')
          .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
        const dateDerniereVenteCredit =
          clientCreditSales.length > 0
            ? clientCreditSales[0].date.split('T')[0]
            : c.lastPurchaseDate
            ? c.lastPurchaseDate.split('T')[0]
            : 'Inconnue';

        const clientPayments = payments
          .filter((p) => p.customerId === c.id && !(p as any).isCancelled)
          .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
        const dateDernierPaiement =
          clientPayments.length > 0
            ? clientPayments[0].date.split('T')[0]
            : 'Aucun paiement enregistré';

        return {
          nom: c.name,
          detteRestanteGNF: Math.round(c.currentDebt),
          dateDerniereVenteCredit,
          dateDernierPaiement,
        };
      });

    // Produits à racheter / presque finis (10 maximum)
    const produitsSousSeuil = products
      .filter((p) => p.isLowStock || (p.stockUnits <= (p.alertThreshold || 5) && (p.stockPacks || 0) <= 0))
      .slice(0, 10)
      .map((p) => ({
        nom: p.name,
        stockUnites: p.stockUnits,
        stockCartons: p.stockPacks || 0,
        seuilAlerte: p.alertThreshold,
      }));

    return {
      dateAujourdhui: now.toISOString().split('T')[0],
      ventesAujourdhui: {
        chiffreAffairesGNF: caToday,
        nombreVentes: salesToday.length,
        ventesComptantGNF: Math.round(
          salesToday.filter((s) => s.paymentType === 'cash').reduce((sum, s) => sum + s.totalAmount, 0)
        ),
        ventesCreditGNF: Math.round(
          salesToday.filter((s) => s.paymentType === 'credit').reduce((sum, s) => sum + s.totalAmount, 0)
        ),
      },
      ventesSemaineEnCours: {
        chiffreAffairesGNF: caCurrentWeek,
        nombreVentes: salesCurrentWeek.length,
      },
      ventesSemainePrecedente: {
        chiffreAffairesGNF: caPrevWeek,
        nombreVentes: salesPrevWeek.length,
        evolutionParRapportSemaineDerniere: evolutionPourcentage,
      },
      totalParJourDeSemaineSur8DernieresSemaines: totalParJourSur8Semaines,
      meilleurJourDeLaSemaineSur8Semaines: meilleurJour,
      top10ProduitsPlusVendusSemaine: top10ProduitsVendusSemaine,
      produitsSansAucuneVenteDepuis30Jours: produitsSansVente30Jours,
      clientsEndettesTop10: indebtedClients,
      produitsARacheterTop10: produitsSousSeuil,
    };
  };

  const isSendingRef = useRef(false);

  const handleSendMessage = async (queryText?: string) => {
    const text = (queryText || inputText).trim();
    if (!text || isLoading || isSendingRef.current) return;

    if (!navigator.onLine) {
      setErrorMessage("Vous n'êtes pas connecté à internet. L'assistant nécessite une connexion réseau.");
      return;
    }

    isSendingRef.current = true;
    setErrorMessage(null);
    setInputText('');
    triggerHaptic(40);

    const userMessage: Message = {
      id: `msg-${generateUUID()}`,
      sender: 'user',
      text,
      timestamp: new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }),
    };

    setMessages((prev) => [...prev, userMessage]);
    setIsLoading(true);
    recordAssistantQuestion().catch(() => {});

    const controller = new AbortController();
    const timeoutId = setTimeout(() => {
      controller.abort();
    }, 25000);

    try {
      const contexte = buildContext();

      const response = await fetch('/api/assistant', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          question: text,
          contexte,
        }),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(
          errorData.error || "Impossible d'obtenir une réponse de l'assistant."
        );
      }

      const data = await response.json();
      const assistantText = data.reponse || "Désolé, aucune réponse n'a été fournie.";

      const assistantMessage: Message = {
        id: `msg-resp-${generateUUID()}`,
        sender: 'assistant',
        text: assistantText,
        timestamp: new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }),
      };

      setMessages((prev) => [...prev, assistantMessage]);
    } catch (err: unknown) {
      clearTimeout(timeoutId);
      if (err instanceof Error && err.name === 'AbortError') {
        setErrorMessage("Le serveur n'a pas répondu à temps (délai dépassé de 25 secondes). Veuillez réessayer.");
      } else if (!navigator.onLine) {
        setErrorMessage("Connexion internet perdue. Veuillez vérifier votre connexion.");
      } else {
        const errMsg =
          err instanceof Error ? err.message : "Erreur de communication avec l'assistant.";
        setErrorMessage(errMsg);
      }
    } finally {
      setIsLoading(false);
      isSendingRef.current = false;
    }
  };

  // Clic sur un raccourci rapide (Point 1 & Point 3)
  const handleShortcutClick = (shortcut: ShortcutItem) => {
    if (isLoading || !isOnline) return;

    if (shortcut.isReminderPicker) {
      const indebted = customers.filter((c) => c.currentDebt > 0);
      if (indebted.length === 0) {
        setErrorMessage("Aucun client n'a de dette en cours actuellement dans la boutique.");
        return;
      }
      setIsReminderModalOpen(true);
      return;
    }

    handleSendMessage(shortcut.label);
  };

  // Sélection d'un client pour le rappel (Point 3)
  const handleSelectCustomerForReminder = (customer: CustomerWithBalance) => {
    setIsReminderModalOpen(false);
    setSelectedReminderClient(customer);
    const query = `Écris un rappel court, poli et bienveillant pour ${customer.name} qui a une dette restante de ${formatGNF(customer.currentDebt)} à la boutique.`;
    handleSendMessage(query);
  };

  // Copier le message de l'IA (Point 3)
  const handleCopyMessage = (id: string, text: string) => {
    if (navigator.clipboard) {
      navigator.clipboard.writeText(text);
      setCopiedMessageId(id);
      setTimeout(() => setCopiedMessageId(null), 2500);
    }
  };

  // Ouvrir dans WhatsApp (Point 3)
  const handleOpenWhatsApp = (text: string) => {
    let url = `https://api.whatsapp.com/send?text=${encodeURIComponent(text)}`;
    if (selectedReminderClient?.phone) {
      const rawPhone = selectedReminderClient.phone.replace(/[^0-9]/g, '');
      if (rawPhone.length >= 8) {
        const fullPhone = rawPhone.length === 9 && rawPhone.startsWith('6') ? `224${rawPhone}` : rawPhone;
        url = `https://api.whatsapp.com/send?phone=${fullPhone}&text=${encodeURIComponent(text)}`;
      }
    }
    window.open(url, '_blank');
  };

  const indebtedClientsList = customers
    .filter((c) => c.currentDebt > 0)
    .sort((a, b) => b.currentDebt - a.currentDebt);

  return (
    <div className="pb-28 pt-2 px-3 sm:px-4 max-w-4xl mx-auto flex flex-col h-[calc(100vh-8.5rem)]">
      {/* Header Banner */}
      <div className="bg-gradient-to-r from-amber-600 to-amber-700 rounded-3xl p-4 text-white shadow-md mb-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-2xl bg-white/20 flex items-center justify-center text-white">
            <Bot className="w-6 h-6" />
          </div>
          <div>
            <h2 className="text-base font-black tracking-tight">Assistant IA de la Boutique</h2>
            <p className="text-xs text-amber-100 font-medium">
              Posez vos questions par texte, voix ou via les raccourcis
            </p>
          </div>
        </div>

        {!isOnline && (
          <div className="flex items-center gap-1.5 px-3 py-1 bg-amber-900/60 rounded-full text-xs text-amber-200 border border-amber-400/40">
            <WifiOff className="w-3.5 h-3.5" />
            <span>Hors-ligne</span>
          </div>
        )}
      </div>

      {/* Offline Alert if disconnected */}
      {!isOnline && (
        <div className="mb-3 p-3 bg-amber-50 border border-amber-300 text-amber-900 rounded-2xl text-xs font-bold flex items-center gap-2">
          <WifiOff className="w-4 h-4 flex-shrink-0 text-amber-700" />
          <span>Connexion internet nécessaire pour l'assistant</span>
        </div>
      )}

      {/* Error Message */}
      {errorMessage && (
        <div className="mb-3 p-3 bg-rose-50 border border-rose-300 text-rose-800 rounded-2xl text-xs font-bold flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 flex-shrink-0" />
            <span>{errorMessage}</span>
          </div>
          <button
            type="button"
            onClick={() => setErrorMessage(null)}
            className="p-1 hover:bg-rose-100 rounded-lg"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* 1. RANGÉE DE RACCOURCIS QUI DÉFILE HORIZONTALEMENT (Point 1) */}
      <div className="mb-3 flex-shrink-0">
        <div className="flex items-center gap-2 overflow-x-auto pb-1.5 no-scrollbar scroll-smooth">
          {QUICK_SHORTCUTS.map((q) => (
            <button
              key={q.label}
              type="button"
              disabled={isLoading || !isOnline}
              onClick={() => handleShortcutClick(q)}
              className="flex-shrink-0 px-3.5 py-2.5 bg-white hover:bg-amber-50/90 active:scale-95 text-slate-800 border border-amber-200/90 rounded-2xl text-xs font-bold flex items-center gap-2 transition shadow-2xs disabled:opacity-50 whitespace-nowrap group"
            >
              <span
                className={`px-1.5 py-0.5 rounded-md text-[9px] font-black uppercase tracking-wider ${
                  q.category === 'VENTES'
                    ? 'bg-amber-100 text-amber-800'
                    : q.category === 'DETTES'
                    ? 'bg-rose-100 text-rose-800'
                    : 'bg-emerald-100 text-emerald-800'
                }`}
              >
                {q.category}
              </span>
              <span className="text-slate-800 group-hover:text-amber-900 font-semibold">
                {q.label}
              </span>
            </button>
          ))}
        </div>
      </div>

      {/* Chat Messages Container */}
      <div className="flex-1 overflow-y-auto space-y-3 p-3 bg-white rounded-3xl border border-amber-200/80 shadow-xs mb-3">
        {messages.map((msg) => (
          <div
            key={msg.id}
            className={`flex flex-col ${
              msg.sender === 'user' ? 'items-end' : 'items-start'
            }`}
          >
            <div
              className={`max-w-[88%] p-3.5 sm:p-4 rounded-3xl text-xs sm:text-sm font-medium leading-relaxed shadow-xs whitespace-pre-wrap ${
                msg.sender === 'user'
                  ? 'bg-amber-600 text-white rounded-br-none'
                  : 'bg-amber-50 text-slate-900 border border-amber-200 rounded-bl-none'
              }`}
            >
              <div>{msg.text}</div>

              {/* Boutons d'action pour copier ou envoyer sur WhatsApp (Point 3) */}
              {msg.sender === 'assistant' && msg.id !== 'welcome' && (
                <div className="flex items-center gap-2 pt-2.5 mt-2.5 border-t border-amber-200/80">
                  <button
                    type="button"
                    onClick={() => handleCopyMessage(msg.id, msg.text)}
                    className="py-1 px-2.5 rounded-xl bg-white hover:bg-amber-100/80 text-slate-700 text-[11px] font-bold flex items-center gap-1.5 transition border border-amber-200 shadow-2xs active:scale-95"
                    title="Copier le message"
                  >
                    {copiedMessageId === msg.id ? (
                      <>
                        <Check className="w-3.5 h-3.5 text-emerald-600" />
                        <span className="text-emerald-700">Copié !</span>
                      </>
                    ) : (
                      <>
                        <Copy className="w-3.5 h-3.5 text-slate-500" />
                        <span>Copier</span>
                      </>
                    )}
                  </button>

                  <button
                    type="button"
                    onClick={() => handleOpenWhatsApp(msg.text)}
                    className="py-1 px-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-[11px] font-bold flex items-center gap-1.5 transition shadow-2xs active:scale-95"
                    title="Ouvrir dans WhatsApp"
                  >
                    <MessageCircle className="w-3.5 h-3.5" />
                    <span>WhatsApp</span>
                  </button>
                </div>
              )}
            </div>
            <span className="text-[10px] text-slate-400 mt-1 px-1">{msg.timestamp}</span>
          </div>
        ))}

        {isLoading && (
          <div className="flex items-center gap-2 p-3 bg-amber-50 rounded-2xl border border-amber-200 w-fit text-xs text-amber-900 font-bold animate-pulse">
            <RefreshCw className="w-4 h-4 animate-spin text-amber-600" />
            <span>L'assistant analyse les chiffres de votre boutique...</span>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Saisie texte et vocale inchangées (Point 1) */}
      <div className="flex items-center gap-2 flex-shrink-0">
        <div className="relative flex-1">
          <input
            type="text"
            placeholder={
              isOnline
                ? 'Posez votre question (ex: Combien ai-je vendu aujourd’hui ?)...'
                : 'Connexion requise pour l’assistant'
            }
            disabled={!isOnline || isLoading}
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                handleSendMessage();
              }
            }}
            className="w-full pl-4 pr-12 py-3.5 bg-white border-2 border-amber-200 rounded-2xl text-xs sm:text-sm font-semibold text-slate-900 focus:outline-none focus:border-amber-500 shadow-xs disabled:bg-slate-100"
          />

          {/* Micro button */}
          <button
            type="button"
            disabled={!isOnline || isLoading}
            onClick={toggleListening}
            className={`absolute right-2 top-1/2 -translate-y-1/2 p-2 rounded-xl transition ${
              isListening
                ? 'bg-rose-600 text-white animate-pulse'
                : 'text-slate-400 hover:text-amber-600 hover:bg-amber-50'
            }`}
            title="Parler à l'assistant"
          >
            {isListening ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
          </button>
        </div>

        {/* Send button */}
        <button
          type="button"
          disabled={!inputText.trim() || !isOnline || isLoading}
          onClick={() => handleSendMessage()}
          className="p-3.5 bg-amber-600 hover:bg-amber-700 active:scale-95 disabled:opacity-40 text-white rounded-2xl shadow-md shadow-amber-600/30 transition flex items-center justify-center flex-shrink-0"
          title="Envoyer"
        >
          <Send className="w-5 h-5" />
        </button>
      </div>

      {/* 3. MODAL DE SÉLECTION DU CLIENT POUR LE RAPPEL (Point 3) */}
      {isReminderModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4">
          <div className="bg-white rounded-3xl max-w-md w-full p-4 sm:p-5 shadow-2xl border border-amber-200 animate-in fade-in zoom-in-95 max-h-[85vh] flex flex-col">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <div className="w-9 h-9 rounded-xl bg-amber-100 text-amber-800 flex items-center justify-center font-bold">
                  <User className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-sm font-black text-slate-900">
                    Choisir un client à relancer
                  </h3>
                  <p className="text-[11px] text-slate-500 font-medium">
                    Sélectionnez le client pour préparer le rappel
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsReminderModalOpen(false)}
                className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-xl transition"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="overflow-y-auto space-y-2 py-3 flex-1 pr-1">
              {indebtedClientsList.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => handleSelectCustomerForReminder(c)}
                  className="w-full p-3 rounded-2xl border border-slate-200 hover:border-amber-400 hover:bg-amber-50/70 text-left transition flex items-center justify-between group active:scale-98"
                >
                  <div className="min-w-0 pr-2">
                    <div className="font-bold text-xs text-slate-900 group-hover:text-amber-950 truncate">
                      {c.name}
                    </div>
                    {c.lastPurchaseDate && (
                      <div className="text-[10px] text-slate-400">
                        Dernière opération : {new Date(c.lastPurchaseDate).toLocaleDateString('fr-FR')}
                      </div>
                    )}
                  </div>
                  <div className="text-right flex-shrink-0">
                    <span className="font-black text-xs text-rose-700 bg-rose-50 border border-rose-200 px-2.5 py-1 rounded-xl font-mono">
                      {formatGNF(c.currentDebt)}
                    </span>
                  </div>
                </button>
              ))}
            </div>

            <div className="pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setIsReminderModalOpen(false)}
                className="w-full py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs rounded-xl transition"
              >
                Annuler
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

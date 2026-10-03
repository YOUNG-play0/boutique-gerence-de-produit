import React, { useState, useEffect, useRef } from 'react';
import {
  Bot,
  Send,
  Mic,
  MicOff,
  WifiOff,
  Sparkles,
  TrendingUp,
  AlertTriangle,
  CreditCard,
  Calendar,
  RefreshCw,
} from 'lucide-react';
import { ProductWithStock, CustomerWithBalance, Sale, CreditPayment } from '../../types';
import { formatGNF, triggerHaptic } from '../../utils/formatters';

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
      text: "Bonjour ! Je suis l'assistant de votre boutique. Posez-moi une question sur vos ventes, vos dettes clients ou votre stock.",
      timestamp: new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }),
    },
  ]);
  const [inputText, setInputText] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

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
   * Construction du contexte exact en JSON à partir d'IndexedDB :
   * Tous les totaux sont calculés par le code ici, JAMAIS par l'IA.
   */
  const buildContext = () => {
    const today = new Date();
    const todayStr = today.toISOString().split('T')[0];

    // Ventes des 7 derniers jours (totaux par jour et par produit)
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    const sales7Days = sales.filter((s) => new Date(s.date) >= sevenDaysAgo);

    const dailyBreakdown: Record<
      string,
      {
        totalVentesGNF: number;
        totalEncaisseGNF: number;
        totalCreditGNF: number;
        nombreTransactions: number;
        produitsVendus: Record<string, number>;
      }
    > = {};

    let totalVentes7JoursGNF = 0;
    let totalEncaisse7JoursGNF = 0;

    sales7Days.forEach((s) => {
      const day = s.date.split('T')[0];
      if (!dailyBreakdown[day]) {
        dailyBreakdown[day] = {
          totalVentesGNF: 0,
          totalEncaisseGNF: 0,
          totalCreditGNF: 0,
          nombreTransactions: 0,
          produitsVendus: {},
        };
      }

      dailyBreakdown[day].totalVentesGNF += s.totalAmount;
      dailyBreakdown[day].nombreTransactions += 1;
      totalVentes7JoursGNF += s.totalAmount;

      if (s.paymentType === 'cash') {
        dailyBreakdown[day].totalEncaisseGNF += s.totalAmount;
        totalEncaisse7JoursGNF += s.totalAmount;
      } else {
        dailyBreakdown[day].totalCreditGNF += s.totalAmount;
      }

      s.items.forEach((it) => {
        const pName = it.productName;
        dailyBreakdown[day].produitsVendus[pName] =
          (dailyBreakdown[day].produitsVendus[pName] || 0) + it.quantity;
      });
    });

    // Ventes d'aujourd'hui
    const todaySales = sales.filter((s) => s.date.startsWith(todayStr));
    const todayTotalVentesGNF = todaySales.reduce((sum, s) => sum + s.totalAmount, 0);
    const todayTotalEncaisseGNF = todaySales
      .filter((s) => s.paymentType === 'cash')
      .reduce((sum, s) => sum + s.totalAmount, 0);
    const todayTotalCreditGNF = todaySales
      .filter((s) => s.paymentType === 'credit')
      .reduce((sum, s) => sum + s.totalAmount, 0);

    // Produits sous le seuil d'alerte avec leur stock
    const lowStockList = products
      .filter((p) => p.isLowStock)
      .map((p) => ({
        nom: p.name,
        stockActuelUnites: p.currentStock,
        seuilAlerteUnites: p.alertThreshold,
        formatCarton: p.packSize ? `${p.packLabel || 'carton'} de ${p.packSize}` : 'aucun',
        enRupture: p.currentStock <= 0,
      }));

    // Clients avec leur dette
    const indebtedClients = customers
      .filter((c) => c.currentDebt > 0)
      .map((c) => ({
        nom: c.name,
        telephone: c.phone,
        detteRestanteGNF: c.currentDebt,
      }));

    const totalDettesClientsGNF = indebtedClients.reduce(
      (sum, c) => sum + c.detteRestanteGNF,
      0
    );

    return {
      dateAujourdhui: todayStr,
      bilanAujourdhui: {
        chiffreAffairesTotalGNF: todayTotalVentesGNF,
        encaisseComptantGNF: todayTotalEncaisseGNF,
        donneACreditGNF: todayTotalCreditGNF,
        nombreVentesAujourdhui: todaySales.length,
      },
      bilan7DerniersJours: {
        totalVentes7JoursGNF,
        totalEncaisse7JoursGNF,
        detailParJour: dailyBreakdown,
      },
      produitsARacheterSousSeuil: lowStockList,
      totalProduitsAlerte: lowStockList.length,
      clientsEndettes: indebtedClients,
      totalDettesClientsGNF,
    };
  };

  const handleSendMessage = async (queryText?: string) => {
    const text = (queryText || inputText).trim();
    if (!text || isLoading) return;

    if (!navigator.onLine) {
      setErrorMessage("Connexion internet nécessaire pour l'assistant");
      return;
    }

    setErrorMessage(null);
    setInputText('');
    triggerHaptic(40);

    const userMessage: Message = {
      id: `msg-${Date.now()}`,
      sender: 'user',
      text,
      timestamp: new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }),
    };

    setMessages((prev) => [...prev, userMessage]);
    setIsLoading(true);

    try {
      const contexte = buildContext();

      const response = await fetch('/api/assistant', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          question: text,
          contexte,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(
          errorData.error || "Impossible d'obtenir une réponse de l'assistant."
        );
      }

      const data = await response.json();
      const assistantText = data.reponse || "Désolé, aucune réponse n'a été fournie.";

      const assistantMessage: Message = {
        id: `msg-resp-${Date.now()}`,
        sender: 'assistant',
        text: assistantText,
        timestamp: new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }),
      };

      setMessages((prev) => [...prev, assistantMessage]);
    } catch (err: unknown) {
      const errMsg =
        err instanceof Error ? err.message : "Erreur de communication avec l'assistant.";
      setErrorMessage(errMsg);
    } finally {
      setIsLoading(false);
    }
  };

  const quickQuestions = [
    { label: 'Mes ventes de la semaine', icon: TrendingUp },
    { label: 'Qui me doit de l’argent ?', icon: CreditCard },
    { label: 'Que dois-je racheter ?', icon: AlertTriangle },
    { label: 'Résumé de ma journée', icon: Calendar },
  ];

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
              Posez vos questions par texte ou à la voix
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
        <div className="mb-3 p-3 bg-rose-50 border border-rose-300 text-rose-800 rounded-2xl text-xs font-bold">
          {errorMessage}
        </div>
      )}

      {/* 4 Boutons de questions rapides */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-3 flex-shrink-0">
        {quickQuestions.map((q) => {
          const Icon = q.icon;
          return (
            <button
              key={q.label}
              type="button"
              disabled={isLoading || !isOnline}
              onClick={() => handleSendMessage(q.label)}
              className="p-2.5 bg-white hover:bg-amber-50/80 active:scale-95 text-slate-800 border border-amber-200/80 rounded-2xl text-xs font-bold flex items-center gap-2 transition shadow-xs disabled:opacity-50 text-left"
            >
              <Icon className="w-4 h-4 text-amber-600 flex-shrink-0" />
              <span className="truncate">{q.label}</span>
            </button>
          );
        })}
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
              className={`max-w-[85%] p-4 rounded-3xl text-xs sm:text-sm font-medium leading-relaxed shadow-xs whitespace-pre-wrap ${
                msg.sender === 'user'
                  ? 'bg-amber-600 text-white rounded-br-none'
                  : 'bg-amber-50 text-slate-900 border border-amber-200 rounded-bl-none'
              }`}
            >
              {msg.text}
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

      {/* Input Bar with Voice Microphone and Send Button */}
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
    </div>
  );
};

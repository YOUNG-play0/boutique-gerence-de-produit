import React, { useState, useEffect, useCallback } from 'react';
import {
  ShieldAlert,
  KeyRound,
  Eye,
  EyeOff,
  RefreshCw,
  LogOut,
  Building2,
  Users,
  Activity,
  Calendar,
  AlertTriangle,
  QrCode,
  Box,
  Bot,
  Bug,
  Search,
  CheckCircle2,
  Clock,
} from 'lucide-react';
import { AdminStatsResponse, AdminBoutiqueItem } from '../../types';

export const AdminScreen: React.FC = () => {
  const [adminKey, setAdminKey] = useState('');
  const [showKey, setShowKey] = useState(false);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [stats, setStats] = useState<AdminStatsResponse | null>(null);
  const [searchTerm, setSearchTerm] = useState('');

  // Récupérer la clé sauvegardée en session si disponible
  useEffect(() => {
    const saved = sessionStorage.getItem('admin_auth_key');
    if (saved) {
      setAdminKey(saved);
      fetchStats(saved);
    }
  }, []);

  const fetchStats = useCallback(async (keyToUse: string) => {
    if (!keyToUse.trim()) return;

    setIsLoading(true);
    setErrorMessage(null);

    try {
      const res = await fetch('/api/admin-stats', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${keyToUse.trim()}`,
        },
        body: JSON.stringify({ adminKey: keyToUse.trim() }),
      });

      if (res.status === 401) {
        setIsAuthenticated(false);
        sessionStorage.removeItem('admin_auth_key');
        setErrorMessage('Clé d’administration incorrecte. Accès refusé.');
        return;
      }

      if (res.status === 429) {
        setIsAuthenticated(false);
        setErrorMessage(
          'Trop de tentatives infructueuses. Veuillez patienter 15 minutes avant de réessayer.'
        );
        return;
      }

      if (res.status === 503) {
        setIsAuthenticated(false);
        const errJson = await res.json().catch(() => ({}));
        setErrorMessage(
          errJson.error ||
            'Base de données inaccessible ou variable DATABASE_URL non configurée.'
        );
        return;
      }

      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        setErrorMessage(
          errJson.error || `Erreur serveur lors de la récupération des données (${res.status}).`
        );
        return;
      }

      const data: AdminStatsResponse = await res.json();
      setStats(data);
      setIsAuthenticated(true);
      sessionStorage.setItem('admin_auth_key', keyToUse.trim());
    } catch (err: unknown) {
      setErrorMessage(
        err instanceof Error
          ? err.message
          : 'Impossible de contacter le serveur. Vérifiez votre connexion.'
      );
    } finally {
      setIsLoading(false);
    }
  }, []);

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    if (!adminKey.trim()) {
      setErrorMessage('Veuillez saisir votre clé d’administration.');
      return;
    }
    fetchStats(adminKey);
  };

  const handleLogout = () => {
    setIsAuthenticated(false);
    setStats(null);
    setAdminKey('');
    sessionStorage.removeItem('admin_auth_key');
  };

  const formatDateFr = (isoStr: string): string => {
    if (!isoStr) return '-';
    const parts = isoStr.split('-');
    if (parts.length === 3) {
      return `${parts[2]}/${parts[1]}/${parts[0]}`;
    }
    return isoStr;
  };

  // Filtrage des boutiques par nom ou ville
  const filteredBoutiques = stats?.boutiques.filter((b) => {
    const term = searchTerm.toLowerCase().trim();
    if (!term) return true;
    const nameMatch = b.shopName.toLowerCase().includes(term);
    const cityMatch = b.city ? b.city.toLowerCase().includes(term) : false;
    return nameMatch || cityMatch;
  });

  // Calcul du max pour l'échelle du graphique d'activité
  const maxDayCount = Math.max(
    ...(stats?.activityCurve.map((c) => c.count) || [1]),
    1
  );

  return (
    <div className="min-h-screen bg-slate-900 text-slate-100 flex flex-col">
      {/* Barre supérieure */}
      <header className="bg-slate-950/80 backdrop-blur-md border-b border-slate-800 sticky top-0 z-40 px-4 py-3 sm:px-6">
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-amber-600 text-white flex items-center justify-center shadow-lg shadow-amber-600/30">
              <ShieldAlert className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-sm sm:text-base font-black text-white tracking-tight">
                Administration & Usage
              </h1>
              <p className="text-[11px] text-slate-400">
                Statistiques anonymes agrégées
              </p>
            </div>
          </div>

          {isAuthenticated && (
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => fetchStats(adminKey)}
                disabled={isLoading}
                title="Actualiser les données"
                className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 transition active:scale-95 disabled:opacity-50"
              >
                <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
              </button>
              <button
                type="button"
                onClick={handleLogout}
                title="Déconnexion"
                className="py-1.5 px-3 rounded-xl bg-rose-950/50 hover:bg-rose-900/60 border border-rose-800/60 text-rose-300 text-xs font-bold transition flex items-center gap-1.5"
              >
                <LogOut className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Quitter</span>
              </button>
            </div>
          )}
        </div>
      </header>

      {/* Contenu principal */}
      <main className="flex-1 max-w-6xl w-full mx-auto p-4 sm:p-6 space-y-6">
        {!isAuthenticated ? (
          /* Formulaire de saisie de la clé */
          <div className="max-w-md mx-auto my-12 bg-slate-950 border border-slate-800 rounded-3xl p-6 sm:p-8 shadow-2xl space-y-6">
            <div className="text-center space-y-2">
              <div className="w-14 h-14 rounded-2xl bg-amber-500/10 border border-amber-500/30 text-amber-500 flex items-center justify-center mx-auto">
                <KeyRound className="w-7 h-7" />
              </div>
              <h2 className="text-lg font-black text-white">Espace Privé Administrateur</h2>
              <p className="text-xs text-slate-400">
                Saisissez votre clé secrète d’administration pour consulter les métriques de la flotte.
              </p>
            </div>

            {errorMessage && (
              <div className="p-3.5 rounded-2xl bg-rose-950/70 border border-rose-800 text-rose-200 text-xs font-bold flex items-start gap-2.5">
                <AlertTriangle className="w-4 h-4 text-rose-400 flex-shrink-0 mt-0.5" />
                <span>{errorMessage}</span>
              </div>
            )}

            <form onSubmit={handleLogin} className="space-y-4">
              <div>
                <label className="text-xs font-bold text-slate-300 block mb-1.5">
                  Clé d'administration
                </label>
                <div className="relative">
                  <input
                    type={showKey ? 'text' : 'password'}
                    required
                    placeholder="Entrez votre clé secrète"
                    value={adminKey}
                    onChange={(e) => setAdminKey(e.target.value)}
                    className="w-full pl-3.5 pr-10 py-3 text-sm bg-slate-900 border border-slate-700 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:border-amber-500 font-mono"
                  />
                  <button
                    type="button"
                    onClick={() => setShowKey(!showKey)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-200"
                  >
                    {showKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <button
                type="submit"
                disabled={isLoading}
                className="w-full py-3 px-4 bg-amber-600 hover:bg-amber-500 active:scale-95 disabled:opacity-50 text-white font-bold text-xs rounded-xl shadow-lg shadow-amber-600/20 transition flex items-center justify-center gap-2"
              >
                {isLoading ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    <span>Vérification...</span>
                  </>
                ) : (
                  <span>Accéder au tableau de bord</span>
                )}
              </button>
            </form>
          </div>
        ) : stats ? (
          /* Tableau de bord administrateur */
          <div className="space-y-6">
            {/* 1. Métriques de boutiques installées & actives */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
              <div className="bg-slate-950 border border-slate-800 rounded-2xl p-4 sm:p-5 space-y-1">
                <div className="flex items-center justify-between text-slate-400 text-xs">
                  <span>Installées</span>
                  <Building2 className="w-4 h-4 text-amber-500" />
                </div>
                <div className="text-2xl sm:text-3xl font-black text-white">
                  {stats.totalInstalled}
                </div>
                <div className="text-[11px] text-slate-500">Identifiants distincts</div>
              </div>

              <div className="bg-slate-950 border border-slate-800 rounded-2xl p-4 sm:p-5 space-y-1">
                <div className="flex items-center justify-between text-slate-400 text-xs">
                  <span>Actives aujourd'hui</span>
                  <Activity className="w-4 h-4 text-emerald-500" />
                </div>
                <div className="text-2xl sm:text-3xl font-black text-emerald-400">
                  {stats.activeToday}
                </div>
                <div className="text-[11px] text-slate-500">
                  {stats.totalInstalled > 0
                    ? `${Math.round((stats.activeToday / stats.totalInstalled) * 100)}% du total`
                    : '0%'}
                </div>
              </div>

              <div className="bg-slate-950 border border-slate-800 rounded-2xl p-4 sm:p-5 space-y-1">
                <div className="flex items-center justify-between text-slate-400 text-xs">
                  <span>Actives 7 jours</span>
                  <Calendar className="w-4 h-4 text-sky-500" />
                </div>
                <div className="text-2xl sm:text-3xl font-black text-sky-400">
                  {stats.activeLast7Days}
                </div>
                <div className="text-[11px] text-slate-500">Dernière semaine</div>
              </div>

              <div className="bg-slate-950 border border-slate-800 rounded-2xl p-4 sm:p-5 space-y-1">
                <div className="flex items-center justify-between text-slate-400 text-xs">
                  <span>Actives 30 jours</span>
                  <Users className="w-4 h-4 text-purple-500" />
                </div>
                <div className="text-2xl sm:text-3xl font-black text-purple-400">
                  {stats.activeLast30Days}
                </div>
                <div className="text-[11px] text-slate-500">Dernier mois</div>
              </div>
            </div>

            {/* 2. Rétention des boutiques */}
            <div className="bg-slate-950 border border-slate-800 rounded-3xl p-5 sm:p-6 space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-bold text-white">Taux de rétention</h3>
                  <p className="text-xs text-slate-400">
                    Boutiques encore actives 7, 14 et 30 jours après leur première installation
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="p-4 rounded-2xl bg-slate-900 border border-slate-800 space-y-2">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-slate-400">Rétention à 7 jours</span>
                    <span className="font-bold text-emerald-400">{stats.retention.days7}%</span>
                  </div>
                  <div className="w-full bg-slate-800 h-2.5 rounded-full overflow-hidden">
                    <div
                      className="bg-emerald-500 h-full rounded-full transition-all duration-500"
                      style={{ width: `${Math.min(stats.retention.days7, 100)}%` }}
                    />
                  </div>
                </div>

                <div className="p-4 rounded-2xl bg-slate-900 border border-slate-800 space-y-2">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-slate-400">Rétention à 14 jours</span>
                    <span className="font-bold text-sky-400">{stats.retention.days14}%</span>
                  </div>
                  <div className="w-full bg-slate-800 h-2.5 rounded-full overflow-hidden">
                    <div
                      className="bg-sky-500 h-full rounded-full transition-all duration-500"
                      style={{ width: `${Math.min(stats.retention.days14, 100)}%` }}
                    />
                  </div>
                </div>

                <div className="p-4 rounded-2xl bg-slate-900 border border-slate-800 space-y-2">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-slate-400">Rétention à 30 jours</span>
                    <span className="font-bold text-amber-400">{stats.retention.days30}%</span>
                  </div>
                  <div className="w-full bg-slate-800 h-2.5 rounded-full overflow-hidden">
                    <div
                      className="bg-amber-500 h-full rounded-full transition-all duration-500"
                      style={{ width: `${Math.min(stats.retention.days30, 100)}%` }}
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* 3. Courbe des boutiques actives par jour (30 derniers jours) */}
            <div className="bg-slate-950 border border-slate-800 rounded-3xl p-5 sm:p-6 space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-bold text-white">
                    Activité quotidienne (30 derniers jours)
                  </h3>
                  <p className="text-xs text-slate-400">
                    Nombre de boutiques ayant enregistré des opérations par jour
                  </p>
                </div>
              </div>

              <div className="h-44 sm:h-52 w-full flex items-end gap-1 sm:gap-2 pt-4 px-1 pb-2 border-b border-slate-800 overflow-x-auto">
                {stats.activityCurve.map((item, idx) => {
                  const heightPercent = maxDayCount > 0 ? (item.count / maxDayCount) * 100 : 0;
                  const isToday = idx === stats.activityCurve.length - 1;
                  return (
                    <div
                      key={item.day}
                      className="flex-1 min-w-[8px] flex flex-col items-center gap-1 group relative h-full justify-end"
                    >
                      {/* Tooltip */}
                      <div className="opacity-0 group-hover:opacity-100 pointer-events-none absolute -top-8 bg-slate-800 text-[10px] text-white px-2 py-0.5 rounded shadow whitespace-nowrap z-20 transition">
                        {formatDateFr(item.day)} : {item.count} boutique(s)
                      </div>

                      <div
                        className={`w-full rounded-t transition-all ${
                          isToday
                            ? 'bg-amber-500'
                            : item.count > 0
                            ? 'bg-sky-500/80 hover:bg-sky-400'
                            : 'bg-slate-800/40'
                        }`}
                        style={{ height: `${Math.max(heightPercent, 4)}%` }}
                      />
                    </div>
                  );
                })}
              </div>
              <div className="flex justify-between text-[11px] text-slate-500 font-mono">
                <span>Il y a 30 jours</span>
                <span>Aujourd'hui</span>
              </div>
            </div>

            {/* 4. Usage des fonctionnalités & Santé */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4">
              <div className="bg-slate-950 border border-slate-800 rounded-2xl p-4 space-y-1">
                <div className="flex items-center justify-between text-slate-400 text-xs">
                  <span>Scanner QR</span>
                  <QrCode className="w-4 h-4 text-emerald-400" />
                </div>
                <div className="text-xl sm:text-2xl font-black text-white">
                  {stats.featureUsage.scanPercentage}%
                </div>
                <div className="text-[11px] text-slate-500">des boutiques</div>
              </div>

              <div className="bg-slate-950 border border-slate-800 rounded-2xl p-4 space-y-1">
                <div className="flex items-center justify-between text-slate-400 text-xs">
                  <span>Ventes Cartons</span>
                  <Box className="w-4 h-4 text-amber-400" />
                </div>
                <div className="text-xl sm:text-2xl font-black text-white">
                  {stats.featureUsage.packPercentage}%
                </div>
                <div className="text-[11px] text-slate-500">des boutiques</div>
              </div>

              <div className="bg-slate-950 border border-slate-800 rounded-2xl p-4 space-y-1">
                <div className="flex items-center justify-between text-slate-400 text-xs">
                  <span>Assistant IA</span>
                  <Bot className="w-4 h-4 text-sky-400" />
                </div>
                <div className="text-xl sm:text-2xl font-black text-white">
                  {stats.featureUsage.assistantPercentage}%
                </div>
                <div className="text-[11px] text-slate-500">des boutiques</div>
              </div>

              <div className="bg-slate-950 border border-slate-800 rounded-2xl p-4 space-y-1">
                <div className="flex items-center justify-between text-slate-400 text-xs">
                  <span>Erreurs interceptées</span>
                  <Bug className="w-4 h-4 text-rose-400" />
                </div>
                <div className="text-xl sm:text-2xl font-black text-rose-400">
                  {stats.featureUsage.totalErrors}
                </div>
                <div className="text-[11px] text-slate-500">via ErrorBoundary</div>
              </div>
            </div>

            {/* 5. Liste détaillée des boutiques */}
            <div className="bg-slate-950 border border-slate-800 rounded-3xl p-5 sm:p-6 space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <h3 className="text-sm font-bold text-white">
                    Liste des boutiques ({stats.boutiques.length})
                  </h3>
                  <p className="text-xs text-slate-400">
                    Les boutiques inactives depuis 5 jours ou plus sont mises en évidence
                  </p>
                </div>

                <div className="relative w-full sm:w-64">
                  <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
                  <input
                    type="text"
                    placeholder="Filtrer par nom ou ville..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="w-full pl-9 pr-3 py-2 text-xs bg-slate-900 border border-slate-800 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:border-amber-500"
                  />
                </div>
              </div>

              {filteredBoutiques && filteredBoutiques.length > 0 ? (
                <div className="space-y-3">
                  {filteredBoutiques.map((b) => {
                    const isInactive = b.inactiveDays >= 5;
                    return (
                      <div
                        key={b.installId}
                        className={`p-4 rounded-2xl border transition ${
                          isInactive
                            ? 'bg-rose-950/20 border-rose-800/80 shadow-xs'
                            : 'bg-slate-900 border-slate-800'
                        }`}
                      >
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                          <div className="space-y-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="text-sm font-bold text-white truncate">
                                {b.shopName}
                              </span>
                              {b.city && (
                                <span className="text-[11px] font-semibold text-slate-400 bg-slate-800 px-2 py-0.5 rounded-full">
                                  {b.city}
                                </span>
                              )}
                              <span className="text-[10px] font-mono text-slate-500">
                                v{b.appVersion}
                              </span>
                            </div>
                            <div className="text-[11px] text-slate-400 flex items-center gap-3 flex-wrap">
                              <span>
                                1ère activité :{' '}
                                <strong className="text-slate-300 font-mono">
                                  {formatDateFr(b.firstActivity)}
                                </strong>
                              </span>
                              <span>•</span>
                              <span>
                                Dernière :{' '}
                                <strong className="text-slate-300 font-mono">
                                  {formatDateFr(b.lastActivity)}
                                </strong>
                              </span>
                            </div>
                          </div>

                          <div className="flex items-center gap-3 self-start sm:self-auto flex-wrap">
                            <div className="text-right text-xs">
                              <div className="text-slate-400 text-[10px]">Ventes 7j</div>
                              <div className="font-bold text-white">{b.salesLast7Days}</div>
                            </div>

                            <div className="text-right text-xs">
                              <div className="text-slate-400 text-[10px]">Produits</div>
                              <div className="font-bold text-white">{b.nbProducts}</div>
                            </div>

                            {/* Badge Inactivité mis en évidence */}
                            {isInactive ? (
                              <div className="py-1 px-2.5 rounded-xl bg-rose-500/20 border border-rose-500/40 text-rose-300 text-xs font-bold flex items-center gap-1.5 whitespace-nowrap animate-pulse">
                                <Clock className="w-3.5 h-3.5 text-rose-400" />
                                <span>Inactif depuis {b.inactiveDays} j</span>
                              </div>
                            ) : (
                              <div className="py-1 px-2.5 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-xs font-semibold flex items-center gap-1.5 whitespace-nowrap">
                                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                                <span>Actif ({b.inactiveDays === 0 ? "Aujourd'hui" : `${b.inactiveDays} j`})</span>
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="text-center py-8 text-xs text-slate-500">
                  Aucune boutique ne correspond aux filtres de recherche.
                </div>
              )}
            </div>
          </div>
        ) : null}
      </main>
    </div>
  );
};

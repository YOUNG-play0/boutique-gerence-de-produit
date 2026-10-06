import {
  getDB,
  getShopSettings,
  getOrCreateInstallId,
  getDailyCounters,
  getCustomersWithBalance,
  incrementDailyCounter,
} from './db';
import { TelemetryDailySummary } from '../types';

export const APP_VERSION = '1.0.0';

/**
 * Retourne la date locale actuelle au format YYYY-MM-DD
 */
export function getTodayLocalStr(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Vérifie si l'application s'exécute en mode PWA installée (standalone)
 */
function checkIsStandalone(): boolean {
  if (typeof window === 'undefined') return false;
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    (window.navigator as unknown as { standalone?: boolean }).standalone === true
  );
}

/**
 * Enregistre une utilisation du scanner QR
 */
export async function recordScanUse(): Promise<void> {
  await incrementDailyCounter('scan');
}

/**
 * Enregistre une question posée à l'assistant IA
 */
export async function recordAssistantQuestion(): Promise<void> {
  await incrementDailyCounter('assistant');
}

/**
 * Enregistre une erreur interceptée par l'ErrorBoundary
 */
export async function recordAppError(): Promise<void> {
  await incrementDailyCounter('error');
}

/**
 * Construit le résumé quotidien anonyme et le place dans la file IndexedDB
 * (UNIQUEMENT les champs spécifiés - aucune donnée personnelle)
 */
export async function buildAndQueueDailySummary(): Promise<void> {
  try {
    const settings = await getShopSettings();
    // Si la boutique n'est pas encore configurée ou si la télémétrie est désactivée
    if (!settings || !settings.isConfigured || settings.telemetryEnabled === false) {
      return;
    }

    const installId = await getOrCreateInstallId();
    const day = getTodayLocalStr();

    const db = await getDB();

    // 1. Calcul du nombre de ventes non annulées du jour et des ventes en carton
    const allSales = await db.getAll('sales');
    const todaySales = allSales.filter((s) => !s.isCancelled && s.date.slice(0, 10) === day);
    const nbSales = todaySales.length;

    // Nombre de ventes du jour contenant au moins un article en format carton
    const packSales = todaySales.filter((s) =>
      s.items.some((item) => item.unitType === 'pack')
    ).length;

    // 2. Nombre total de produits actifs
    const allProducts = await db.getAll('products');
    const nbProducts = allProducts.length;

    // 3. Nombre de clients ayant une dette en cours
    const customersWithBal = await getCustomersWithBalance();
    const nbCustomersWithDebt = customersWithBal.filter((c) => c.currentDebt > 0).length;

    // 4. Compteurs journaliers (scan, assistant, erreurs)
    const counters = await getDailyCounters(day);

    // Résumé avec UNIQUEMENT les champs autorisés
    const summary: TelemetryDailySummary = {
      installId,
      shopName: settings.shopName.trim(),
      city: settings.city ? settings.city.trim() : undefined,
      day,
      appVersion: APP_VERSION,
      isStandalone: checkIsStandalone(),
      nbSales,
      nbProducts,
      nbCustomersWithDebt,
      scanUses: counters.scanUses || 0,
      assistantQuestions: counters.assistantQuestions || 0,
      packSales,
      nbErrors: counters.nbErrors || 0,
    };

    // Mise en file d'attente dans IndexedDB (store telemetry_queue)
    const tx = db.transaction('telemetry_queue', 'readwrite');
    await tx.objectStore('telemetry_queue').put(summary);
    await tx.done;
  } catch (err) {
    // Ne jamais bloquer ni afficher d'erreur visible
    console.warn('Erreur construction résumé télémétrie:', err);
  }
}

let isFlushing = false;

/**
 * Envoie les résumés en attente à l'API POST /api/telemetry quand l'appareil est en ligne
 * Réessaie sans jamais bloquer ni ralentir l'app, et sans message d'erreur visible.
 */
export async function flushTelemetryQueue(): Promise<void> {
  if (isFlushing) return;
  if (typeof navigator !== 'undefined' && !navigator.onLine) return;

  try {
    const settings = await getShopSettings();
    if (settings && settings.telemetryEnabled === false) {
      await clearTelemetryQueue();
      return;
    }

    const db = await getDB();
    const queue = await db.getAll('telemetry_queue');
    if (!queue || queue.length === 0) return;

    isFlushing = true;

    for (const item of queue) {
      try {
        const res = await fetch('/api/telemetry', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(item),
        });

        // 204 No Content ou 200 OK indique le succès
        if (res.status === 204 || res.ok) {
          const tx = db.transaction('telemetry_queue', 'readwrite');
          await tx.objectStore('telemetry_queue').delete(item.day);
          await tx.done;
        } else {
          // Échec serveur : on arrête la boucle et on réessaiera plus tard
          break;
        }
      } catch {
        // Erreur réseau : arrêt silencieux, réessai à la prochaine connexion
        break;
      }
    }
  } catch (err) {
    console.warn('Erreur envoi télémétrie:', err);
  } finally {
    isFlushing = false;
  }
}

/**
 * Vide complètement la file d'attente locale (appelé si l'utilisateur désactive l'option)
 */
export async function clearTelemetryQueue(): Promise<void> {
  try {
    const db = await getDB();
    const tx = db.transaction('telemetry_queue', 'readwrite');
    await tx.objectStore('telemetry_queue').clear();
    await tx.done;
  } catch (err) {
    console.warn('Erreur vidage file télémétrie:', err);
  }
}

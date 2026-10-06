// Vercel Serverless Function / Express Handler: /api/admin-stats
import crypto from 'crypto';
import pg from 'pg';
import { AdminStatsResponse, AdminBoutiqueItem } from '../src/types';

const { Pool } = pg;

let pool: pg.Pool | null = null;

function isValidPostgresUrl(url: string | undefined): boolean {
  if (!url || typeof url !== 'string') return false;
  const trimmed = url.trim();
  if (!trimmed.startsWith('postgres://') && !trimmed.startsWith('postgresql://')) {
    return false;
  }
  try {
    const parsed = new URL(trimmed);
    return Boolean(parsed.hostname && parsed.hostname.length > 1);
  } catch {
    return false;
  }
}

function getPool(): pg.Pool | null {
  const dbUrl = process.env.DATABASE_URL?.trim();
  if (!isValidPostgresUrl(dbUrl)) return null;
  if (!pool) {
    const isLocal = dbUrl!.includes('localhost') || dbUrl!.includes('127.0.0.1');
    pool = new Pool({
      connectionString: dbUrl,
      ssl: isLocal ? false : { rejectUnauthorized: false },
      max: 5,
      connectionTimeoutMillis: 3000,
      idleTimeoutMillis: 30000,
    });
    pool.on('error', (err) => {
      console.warn('PostgreSQL Admin Pool idle error:', err?.message || String(err));
    });
  }
  return pool;
}

// Comparaison à temps constant pour éviter toute attaque temporelle (Point 1)
function timingSafeCompare(given: string, secret: string): boolean {
  const bufA = Buffer.from(given);
  const bufB = Buffer.from(secret);

  if (bufA.length !== bufB.length) {
    // Calcul factice pour masquer la différence de longueur
    crypto.timingSafeEqual(bufA, bufA);
    return false;
  }

  return crypto.timingSafeEqual(bufA, bufB);
}

// Limitation des tentatives infructueuses par IP (Point 1)
const failedAttemptsMap = new Map<string, { count: number; lockUntil: number }>();

function isIpLocked(ip: string): boolean {
  const now = Date.now();
  const entry = failedAttemptsMap.get(ip);
  if (!entry) return false;
  if (now > entry.lockUntil) {
    failedAttemptsMap.delete(ip);
    return false;
  }
  return entry.count >= 5;
}

function recordFailedAttempt(ip: string): void {
  const now = Date.now();
  const entry = failedAttemptsMap.get(ip);
  if (!entry || now > entry.lockUntil) {
    failedAttemptsMap.set(ip, { count: 1, lockUntil: now + 15 * 60 * 1000 });
  } else {
    entry.count += 1;
    if (entry.count >= 5) {
      entry.lockUntil = now + 15 * 60 * 1000;
    }
  }
}

function resetFailedAttempts(ip: string): void {
  failedAttemptsMap.delete(ip);
}

export default async function handler(req: any, res: any) {
  // Extraction de l'IP cliente
  const forwardedHeader = req.headers['x-forwarded-for'];
  let clientIp = '127.0.0.1';
  if (typeof forwardedHeader === 'string' && forwardedHeader.trim() !== '') {
    clientIp = forwardedHeader.split(',')[0].trim();
  } else if (Array.isArray(forwardedHeader) && forwardedHeader.length > 0) {
    clientIp = String(forwardedHeader[0]).split(',')[0].trim();
  } else if (req.socket?.remoteAddress) {
    clientIp = String(req.socket.remoteAddress).trim();
  }

  // Vérifier le verrouillage par IP
  if (isIpLocked(clientIp)) {
    return res.status(429).json({
      error: 'Trop de tentatives infructueuses. Veuillez patienter 15 minutes avant de réessayer.',
    });
  }

  // Clé transmise soit par header Authorization Bearer, soit par en-tête x-admin-key, soit dans le corps
  let providedKey = '';
  const authHeader = req.headers['authorization'];
  if (typeof authHeader === 'string' && authHeader.startsWith('Bearer ')) {
    providedKey = authHeader.slice(7).trim();
  } else if (typeof req.headers['x-admin-key'] === 'string') {
    providedKey = req.headers['x-admin-key'].trim();
  } else if (req.body && typeof req.body.adminKey === 'string') {
    providedKey = req.body.adminKey.trim();
  }

  const expectedKey = process.env.ADMIN_KEY;

  if (!expectedKey) {
    return res.status(500).json({
      error: 'ADMIN_KEY non configurée sur le serveur. Veuillez ajouter la variable d’environnement ADMIN_KEY.',
    });
  }

  if (!providedKey || !timingSafeCompare(providedKey, expectedKey)) {
    recordFailedAttempt(clientIp);
    return res.status(401).json({ error: 'Clé d’administration incorrecte.' });
  }

  // Clé valide : réinitialiser les échecs
  resetFailedAttempts(clientIp);

  const dbPool = getPool();
  if (!dbPool) {
    return res.status(503).json({
      error: 'Base de données inaccessible ou DATABASE_URL non configurée.',
    });
  }

  try {
    // S'assurer que la table existe
    await dbPool.query(`
      CREATE TABLE IF NOT EXISTS telemetry_summaries (
        install_id VARCHAR(64) NOT NULL,
        shop_name VARCHAR(120) NOT NULL,
        city VARCHAR(100),
        day VARCHAR(10) NOT NULL,
        app_version VARCHAR(20) NOT NULL,
        is_standalone BOOLEAN NOT NULL DEFAULT false,
        nb_sales INTEGER NOT NULL DEFAULT 0,
        nb_products INTEGER NOT NULL DEFAULT 0,
        nb_customers_with_debt INTEGER NOT NULL DEFAULT 0,
        scan_uses INTEGER NOT NULL DEFAULT 0,
        assistant_questions INTEGER NOT NULL DEFAULT 0,
        pack_sales INTEGER NOT NULL DEFAULT 0,
        nb_errors INTEGER NOT NULL DEFAULT 0,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        PRIMARY KEY (install_id, day)
      );
    `);

    try {
      await dbPool.query(`ALTER TABLE telemetry_summaries ENABLE ROW LEVEL SECURITY;`);
    } catch (rlsErr: any) {
      console.error('Erreur activation RLS sur telemetry_summaries :', rlsErr?.message || String(rlsErr));
    }

    // Récupérer toutes les données de télémétrie pour les calculs analytiques
    const allRecordsResult = await dbPool.query(`
      SELECT
        install_id,
        shop_name,
        city,
        day,
        app_version,
        is_standalone,
        nb_sales,
        nb_products,
        nb_customers_with_debt,
        scan_uses,
        assistant_questions,
        pack_sales,
        nb_errors
      FROM telemetry_summaries
      ORDER BY day ASC;
    `);

    const records = allRecordsResult.rows;

    const todayDate = new Date();
    const todayStr = todayDate.toISOString().slice(0, 10);

    const sevenDaysAgoDate = new Date(todayDate);
    sevenDaysAgoDate.setDate(todayDate.getDate() - 7);
    const sevenDaysAgoStr = sevenDaysAgoDate.toISOString().slice(0, 10);

    const thirtyDaysAgoDate = new Date(todayDate);
    thirtyDaysAgoDate.setDate(todayDate.getDate() - 30);
    const thirtyDaysAgoStr = thirtyDaysAgoDate.toISOString().slice(0, 10);

    // 1. Boutiques installées & actives
    const allInstallIds = new Set<string>();
    const activeTodayIds = new Set<string>();
    const active7DaysIds = new Set<string>();
    const active30DaysIds = new Set<string>();

    // Usage des fonctions
    let totalErrors = 0;
    const shopsUsingScan = new Set<string>();
    const shopsUsingPacks = new Set<string>();
    const shopsUsingAssistant = new Set<string>();

    // Regroupement par boutique
    const shopMap = new Map<
      string,
      {
        installId: string;
        shopName: string;
        city?: string;
        firstActivity: string;
        lastActivity: string;
        salesLast7Days: number;
        nbProducts: number;
        appVersion: string;
        daysSet: Set<string>;
      }
    >();

    // Activité par jour sur les 30 derniers jours
    const dayActivityMap = new Map<string, Set<string>>();
    for (let i = 29; i >= 0; i--) {
      const d = new Date(todayDate);
      d.setDate(todayDate.getDate() - i);
      const dStr = d.toISOString().slice(0, 10);
      dayActivityMap.set(dStr, new Set());
    }

    for (const r of records) {
      allInstallIds.add(r.install_id);

      if (r.day === todayStr) {
        activeTodayIds.add(r.install_id);
      }
      if (r.day >= sevenDaysAgoStr) {
        active7DaysIds.add(r.install_id);
      }
      if (r.day >= thirtyDaysAgoStr) {
        active30DaysIds.add(r.install_id);
      }

      if (dayActivityMap.has(r.day)) {
        dayActivityMap.get(r.day)!.add(r.install_id);
      }

      if (r.scan_uses > 0) shopsUsingScan.add(r.install_id);
      if (r.pack_sales > 0) shopsUsingPacks.add(r.install_id);
      if (r.assistant_questions > 0) shopsUsingAssistant.add(r.install_id);
      totalErrors += Number(r.nb_errors || 0);

      // Agrégation par boutique
      let boutique = shopMap.get(r.install_id);
      if (!boutique) {
        boutique = {
          installId: r.install_id,
          shopName: r.shop_name,
          city: r.city || undefined,
          firstActivity: r.day,
          lastActivity: r.day,
          salesLast7Days: 0,
          nbProducts: r.nb_products,
          appVersion: r.app_version,
          daysSet: new Set(),
        };
        shopMap.set(r.install_id, boutique);
      }

      boutique.daysSet.add(r.day);
      if (r.day < boutique.firstActivity) boutique.firstActivity = r.day;
      if (r.day >= boutique.lastActivity) {
        boutique.lastActivity = r.day;
        boutique.shopName = r.shop_name;
        if (r.city) boutique.city = r.city;
        boutique.nbProducts = r.nb_products;
        boutique.appVersion = r.app_version;
      }

      if (r.day >= sevenDaysAgoStr) {
        boutique.salesLast7Days += Number(r.nb_sales || 0);
      }
    }

    // Calcul de la rétention : % de boutiques encore actives à 7, 14 et 30 jours après leur première activité
    let eligible7 = 0;
    let retained7 = 0;
    let eligible14 = 0;
    let retained14 = 0;
    let eligible30 = 0;
    let retained30 = 0;

    for (const b of shopMap.values()) {
      const firstDate = new Date(b.firstActivity);
      const daysSinceFirst = Math.floor(
        (todayDate.getTime() - firstDate.getTime()) / (1000 * 60 * 60 * 24)
      );

      // Seuil 7 jours
      if (daysSinceFirst >= 7) {
        eligible7++;
        const hasActivityAfter7 = Array.from(b.daysSet).some((d) => {
          const diff = Math.floor(
            (new Date(d).getTime() - firstDate.getTime()) / (1000 * 60 * 60 * 24)
          );
          return diff >= 7;
        });
        if (hasActivityAfter7) retained7++;
      }

      // Seuil 14 jours
      if (daysSinceFirst >= 14) {
        eligible14++;
        const hasActivityAfter14 = Array.from(b.daysSet).some((d) => {
          const diff = Math.floor(
            (new Date(d).getTime() - firstDate.getTime()) / (1000 * 60 * 60 * 24)
          );
          return diff >= 14;
        });
        if (hasActivityAfter14) retained14++;
      }

      // Seuil 30 jours
      if (daysSinceFirst >= 30) {
        eligible30++;
        const hasActivityAfter30 = Array.from(b.daysSet).some((d) => {
          const diff = Math.floor(
            (new Date(d).getTime() - firstDate.getTime()) / (1000 * 60 * 60 * 24)
          );
          return diff >= 30;
        });
        if (hasActivityAfter30) retained30++;
      }
    }

    const totalInstalledCount = allInstallIds.size;

    const retention7 = eligible7 > 0 ? Math.round((retained7 / eligible7) * 100) : 0;
    const retention14 = eligible14 > 0 ? Math.round((retained14 / eligible14) * 100) : 0;
    const retention30 = eligible30 > 0 ? Math.round((retained30 / eligible30) * 100) : 0;

    // Courbe d'activité
    const activityCurve = Array.from(dayActivityMap.entries()).map(([day, set]) => ({
      day,
      count: set.size,
    }));

    // Liste des boutiques
    const boutiques: AdminBoutiqueItem[] = Array.from(shopMap.values()).map((b) => {
      const lastDate = new Date(b.lastActivity);
      const inactiveDays = Math.max(
        0,
        Math.floor((todayDate.getTime() - lastDate.getTime()) / (1000 * 60 * 60 * 24))
      );
      return {
        installId: b.installId,
        shopName: b.shopName,
        city: b.city,
        firstActivity: b.firstActivity,
        lastActivity: b.lastActivity,
        salesLast7Days: b.salesLast7Days,
        nbProducts: b.nbProducts,
        appVersion: b.appVersion,
        inactiveDays,
      };
    });

    // Tri : plus récentes d'abord
    boutiques.sort((a, b) => b.lastActivity.localeCompare(a.lastActivity));

    const scanPercentage =
      totalInstalledCount > 0
        ? Math.round((shopsUsingScan.size / totalInstalledCount) * 100)
        : 0;
    const packPercentage =
      totalInstalledCount > 0
        ? Math.round((shopsUsingPacks.size / totalInstalledCount) * 100)
        : 0;
    const assistantPercentage =
      totalInstalledCount > 0
        ? Math.round((shopsUsingAssistant.size / totalInstalledCount) * 100)
        : 0;

    const responseData: AdminStatsResponse = {
      totalInstalled: totalInstalledCount,
      activeToday: activeTodayIds.size,
      activeLast7Days: active7DaysIds.size,
      activeLast30Days: active30DaysIds.size,
      retention: {
        days7: retention7,
        days14: retention14,
        days30: retention30,
      },
      activityCurve,
      boutiques,
      featureUsage: {
        scanPercentage,
        packPercentage,
        assistantPercentage,
        totalErrors,
      },
    };

    return res.status(200).json(responseData);
  } catch (dbErr: any) {
    console.warn('Lecture statistiques admin dans PostgreSQL non disponible :', dbErr?.message || String(dbErr));
    return res.status(503).json({
      error: `Erreur lors de la lecture de la base de données : ${dbErr?.message || 'Base inaccessible'}`,
    });
  }
}

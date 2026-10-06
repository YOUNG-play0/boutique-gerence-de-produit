// Vercel Serverless Function / Express Handler: /api/telemetry
import pg from 'pg';

const { Pool } = pg;

let pool: pg.Pool | null = null;

function getPool(): pg.Pool | null {
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) return null;
  if (!pool) {
    const isLocal = dbUrl.includes('localhost') || dbUrl.includes('127.0.0.1');
    pool = new Pool({
      connectionString: dbUrl,
      ssl: isLocal ? false : { rejectUnauthorized: false },
      max: 10,
      idleTimeoutMillis: 30000,
    });
  }
  return pool;
}

let tableInitPromise: Promise<void> | null = null;

async function ensureTableExists(p: pg.Pool): Promise<void> {
  if (!tableInitPromise) {
    tableInitPromise = (async () => {
      await p.query(`
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
    })();
  }
  return tableInitPromise;
}

// Limite de débit en mémoire par adresse IP (Point 5)
const rateLimitMap = new Map<string, { count: number; resetTime: number }>();

function isRateLimited(ip: string, limit = 60, windowMs = 3600000): boolean {
  const now = Date.now();
  const entry = rateLimitMap.get(ip);
  if (!entry || now > entry.resetTime) {
    rateLimitMap.set(ip, { count: 1, resetTime: now + windowMs });
    return false;
  }
  if (entry.count >= limit) {
    return true;
  }
  entry.count += 1;
  return false;
}

const ALLOWED_KEYS = new Set([
  'installId',
  'shopName',
  'city',
  'day',
  'appVersion',
  'isStandalone',
  'nbSales',
  'nbProducts',
  'nbCustomersWithDebt',
  'scanUses',
  'assistantQuestions',
  'packSales',
  'nbErrors',
]);

function isNonNegativeInteger(val: unknown): boolean {
  return typeof val === 'number' && Number.isInteger(val) && val >= 0 && val <= 10_000_000;
}

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Méthode non autorisée. Seules les requêtes POST sont acceptées.' });
  }

  // 1. Limite de débit basée uniquement sur l'adresse IP (premier élément de x-forwarded-for)
  const forwardedHeader = req.headers['x-forwarded-for'];
  let clientIp = '127.0.0.1';
  if (typeof forwardedHeader === 'string' && forwardedHeader.trim() !== '') {
    clientIp = forwardedHeader.split(',')[0].trim();
  } else if (Array.isArray(forwardedHeader) && forwardedHeader.length > 0) {
    clientIp = String(forwardedHeader[0]).split(',')[0].trim();
  } else if (req.socket?.remoteAddress) {
    clientIp = String(req.socket.remoteAddress).trim();
  }

  if (isRateLimited(clientIp, 60, 3600000)) {
    return res.status(429).json({ error: 'Trop de requêtes. Veuillez patienter.' });
  }

  // 2. Validation stricte du corps de requête (refuse tout champ inconnu)
  if (!req.body || typeof req.body !== 'object' || Array.isArray(req.body)) {
    return res.status(400).json({ error: 'Corps de requête invalide : un objet JSON est attendu.' });
  }

  const bodyKeys = Object.keys(req.body);
  for (const key of bodyKeys) {
    if (!ALLOWED_KEYS.has(key)) {
      return res.status(400).json({ error: `Champ non autorisé : ${key}` });
    }
  }

  const {
    installId,
    shopName,
    city,
    day,
    appVersion,
    isStandalone,
    nbSales,
    nbProducts,
    nbCustomersWithDebt,
    scanUses,
    assistantQuestions,
    packSales,
    nbErrors,
  } = req.body;

  // Validation des types, longueurs et formats
  if (typeof installId !== 'string' || installId.trim() === '' || installId.length > 64) {
    return res.status(400).json({ error: 'installId invalide (texte non vide de 64 caractères maximum).' });
  }

  if (typeof shopName !== 'string' || shopName.trim() === '' || shopName.length > 120) {
    return res.status(400).json({ error: 'shopName invalide (texte non vide de 120 caractères maximum).' });
  }

  if (city !== undefined && city !== null) {
    if (typeof city !== 'string' || city.length > 100) {
      return res.status(400).json({ error: 'city invalide (texte de 100 caractères maximum).' });
    }
  }

  if (typeof day !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(day)) {
    return res.status(400).json({ error: 'day invalide : format YYYY-MM-DD attendu.' });
  }

  if (typeof appVersion !== 'string' || appVersion.trim() === '' || appVersion.length > 20) {
    return res.status(400).json({ error: 'appVersion invalide (texte de 20 caractères maximum).' });
  }

  if (typeof isStandalone !== 'boolean') {
    return res.status(400).json({ error: 'isStandalone doit être un booléen.' });
  }

  if (!isNonNegativeInteger(nbSales)) {
    return res.status(400).json({ error: 'nbSales doit être un entier positif ou nul.' });
  }

  if (!isNonNegativeInteger(nbProducts)) {
    return res.status(400).json({ error: 'nbProducts doit être un entier positif ou nul.' });
  }

  if (!isNonNegativeInteger(nbCustomersWithDebt)) {
    return res.status(400).json({ error: 'nbCustomersWithDebt doit être un entier positif ou nul.' });
  }

  if (!isNonNegativeInteger(scanUses)) {
    return res.status(400).json({ error: 'scanUses doit être un entier positif ou nul.' });
  }

  if (!isNonNegativeInteger(assistantQuestions)) {
    return res.status(400).json({ error: 'assistantQuestions doit être un entier positif ou nul.' });
  }

  if (!isNonNegativeInteger(packSales)) {
    return res.status(400).json({ error: 'packSales doit être un entier positif ou nul.' });
  }

  if (!isNonNegativeInteger(nbErrors)) {
    return res.status(400).json({ error: 'nbErrors doit être un entier positif ou nul.' });
  }

  // 3. Enregistrement dans la base (variable DATABASE_URL) avec upsert sur (installId, day)
  const dbPool = getPool();
  if (dbPool) {
    try {
      await ensureTableExists(dbPool);

      const query = `
        INSERT INTO telemetry_summaries (
          install_id, shop_name, city, day, app_version, is_standalone,
          nb_sales, nb_products, nb_customers_with_debt, scan_uses,
          assistant_questions, pack_sales, nb_errors, updated_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, NOW())
        ON CONFLICT (install_id, day) DO UPDATE SET
          shop_name = EXCLUDED.shop_name,
          city = EXCLUDED.city,
          app_version = EXCLUDED.app_version,
          is_standalone = EXCLUDED.is_standalone,
          nb_sales = EXCLUDED.nb_sales,
          nb_products = EXCLUDED.nb_products,
          nb_customers_with_debt = EXCLUDED.nb_customers_with_debt,
          scan_uses = EXCLUDED.scan_uses,
          assistant_questions = EXCLUDED.assistant_questions,
          pack_sales = EXCLUDED.pack_sales,
          nb_errors = EXCLUDED.nb_errors,
          updated_at = NOW();
      `;

      const values = [
        installId.trim(),
        shopName.trim(),
        city ? city.trim() : null,
        day.trim(),
        appVersion.trim(),
        isStandalone,
        nbSales,
        nbProducts,
        nbCustomersWithDebt,
        scanUses,
        assistantQuestions,
        packSales,
        nbErrors,
      ];

      await dbPool.query(query, values);
    } catch (dbErr) {
      console.error('Erreur écriture télémétrie dans PostgreSQL:', dbErr);
      // Même en cas d'erreur de base, on renvoie une réponse sans bloquer le client
    }
  } else {
    // DATABASE_URL non configurée : log en mode dev
    console.warn('DATABASE_URL non configurée : télémétrie reçue sans persistance SQL.');
  }

  // 4. Renvoie 204 No Content. Ne stocke JAMAIS l'adresse IP.
  return res.status(204).end();
}

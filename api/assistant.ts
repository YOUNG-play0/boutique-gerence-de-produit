// Vercel Serverless Function: /api/assistant
interface RequestBody {
  question?: string;
  contexte?: unknown;
  shopId?: string;
  historique?: Array<{ role?: string; content?: string; texte?: string }>;
}

// Limite simple de 30 requêtes par heure en mémoire
const rateLimitMap = new Map<string, { count: number; resetTime: number }>();

function isRateLimited(key: string, limit = 30, windowMs = 3600000): boolean {
  const now = Date.now();
  const entry = rateLimitMap.get(key);

  if (!entry || now > entry.resetTime) {
    rateLimitMap.set(key, { count: 1, resetTime: now + windowMs });
    return false;
  }

  if (entry.count >= limit) {
    return true;
  }

  entry.count += 1;
  return false;
}

// Modèle prioritaire demandé : llama-3.3-70b-versatile
// Replis automatiques si le compte Groq n'a pas accès à ce modèle spécifique
const CANDIDATE_MODELS = [
  'llama-3.3-70b-versatile',
  'qwen/qwen3.8-27b',
  'openai/gpt-oss-120b',
  'openai/gpt-oss-20b',
];

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Méthode non autorisée. Utilisez POST.' });
  }

  // Identification pour le rate limit (shopId ou IP cliente)
  const clientIp =
    (req.headers['x-forwarded-for'] as string) || req.socket?.remoteAddress || 'client';
  const body: RequestBody = req.body || {};
  const rateLimitKey = body.shopId || clientIp;

  if (isRateLimited(rateLimitKey, 30, 3600000)) {
    return res.status(429).json({
      error: 'Limite de 30 requêtes par heure atteinte. Veuillez patienter avant de poser une autre question.',
    });
  }

  const { question, contexte } = body;

  if (!question || typeof question !== 'string') {
    return res.status(400).json({ error: 'Question manquante.' });
  }

  if (question.length > 500) {
    return res.status(400).json({ error: 'La question ne doit pas dépasser 500 caractères.' });
  }

  const groqApiKey = process.env.GROQ_API_KEY;
  if (!groqApiKey) {
    return res.status(500).json({
      error: "Clé GROQ_API_KEY manquante sur le serveur. Veuillez configurer la variable d'environnement.",
    });
  }

  const systemPrompt =
    "Tu es l'assistant d'une petite boutique en Guinée. Réponds en français simple et court. Utilise UNIQUEMENT les chiffres fournis dans le contexte. Si l'information manque, dis-le. Ne fais aucun calcul : cite les chiffres tels quels. Monnaie : GNF. Les chiffres du contexte actuel sont toujours prioritaires sur ceux cités dans les messages précédents, qui peuvent être périmés.";

  const userPrompt = `Voici les données chiffrées de la boutique :\n${JSON.stringify(
    contexte || {},
    null,
    2
  )}\n\nQuestion du gérant de la boutique :\n${question}`;

  // Validation des 6 derniers messages d'historique (rôles 'user' ou 'assistant', max 500 caractères)
  const validatedHistory: Array<{ role: 'user' | 'assistant'; content: string }> = [];
  if (Array.isArray(body.historique)) {
    const rawHistory = body.historique.slice(-6);
    for (const msg of rawHistory) {
      if (msg && (msg.role === 'user' || msg.role === 'assistant')) {
        const text = (msg.content || msg.texte || '').trim();
        if (text) {
          validatedHistory.push({
            role: msg.role,
            content: text.slice(0, 500),
          });
        }
      }
    }
  }

  const messagesToSend = [
    { role: 'system', content: systemPrompt },
    ...validatedHistory,
    { role: 'user', content: userPrompt },
  ];

  let lastErrorText = '';

  for (const model of CANDIDATE_MODELS) {
    try {
      const groqResponse = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${groqApiKey}`,
        },
        body: JSON.stringify({
          model,
          messages: messagesToSend,
          temperature: 0.1,
          max_tokens: 600,
        }),
      });

      if (groqResponse.ok) {
        const data = await groqResponse.json();
        const reponse =
          data.choices?.[0]?.message?.content || "Désolé, je n'ai pas pu générer de réponse.";
        return res.status(200).json({ reponse });
      }

      const errText = await groqResponse.text();
      lastErrorText = errText;
      console.warn(`Groq model ${model} unavailable (${groqResponse.status}):`, errText);

      // Si le modèle n'existe pas ou n'est pas autorisé sur ce compte (404), passer au modèle suivant
      if (groqResponse.status === 404 || groqResponse.status === 400) {
        continue;
      }

      // Autre erreur fatale (401 auth, 429 quota)
      return res.status(groqResponse.status).json({
        error: `Erreur Groq (${groqResponse.status})`,
      });
    } catch (err: unknown) {
      console.error(`Erreur réseau Groq avec ${model}:`, err);
    }
  }

  return res.status(502).json({
    error: `Impossible de joindre un modèle Groq disponible. Dernier message: ${lastErrorText}`,
  });
}

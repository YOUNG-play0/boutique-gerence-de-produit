// Vercel Serverless Function: /api/assistant

interface RequestBody {
  question?: string;
  contexte?: unknown;
  historique?: Array<{ role?: string; content?: string; texte?: string }>;
}

// Limite de 30 requêtes par heure en mémoire
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

// Modèle prioritaire et replis automatiques
const CANDIDATE_MODELS = [
  'llama-3.3-70b-versatile',
  'qwen/qwen3.8-27b',
  'openai/gpt-oss-120b',
  'openai/gpt-oss-20b',
];

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Méthode non autorisée. Seules les requêtes POST sont acceptées.' });
  }

  // Validation stricte du corps de requête (Point E.21)
  if (!req.body || typeof req.body !== 'object' || Array.isArray(req.body)) {
    return res.status(400).json({ error: 'Format de requête invalide. Un objet JSON est attendu.' });
  }

  // Limite basée uniquement sur l'adresse IP (premier élément de x-forwarded-for) - jamais sur le corps (Point 5)
  const forwardedHeader = req.headers['x-forwarded-for'];
  let clientIp = '127.0.0.1';
  if (typeof forwardedHeader === 'string' && forwardedHeader.trim() !== '') {
    clientIp = forwardedHeader.split(',')[0].trim();
  } else if (Array.isArray(forwardedHeader) && forwardedHeader.length > 0) {
    clientIp = String(forwardedHeader[0]).split(',')[0].trim();
  } else if (req.socket?.remoteAddress) {
    clientIp = String(req.socket.remoteAddress).trim();
  }

  const rateLimitKey = clientIp;

  if (isRateLimited(rateLimitKey, 30, 3600000)) {
    return res.status(429).json({
      error: 'Limite de 30 questions par heure atteinte. Veuillez patienter avant de poser une autre question.',
    });
  }

  const body: RequestBody = req.body;

  const { question, contexte } = body;

  if (!question || typeof question !== 'string') {
    return res.status(400).json({ error: 'La question est obligatoire et doit être un texte.' });
  }

  const cleanQuestion = question.trim();
  if (cleanQuestion.length === 0) {
    return res.status(400).json({ error: 'La question ne peut pas être vide.' });
  }

  if (cleanQuestion.length > 1000) {
    return res.status(400).json({ error: 'La question ne doit pas dépasser 1000 caractères.' });
  }

  // Validation du contexte chiffré (taille maximale ajustée à 75 Ko pour accepter les enrichissements sans surcharges)
  let serializedContext = '{}';
  if (contexte) {
    if (typeof contexte !== 'object' || Array.isArray(contexte)) {
      return res.status(400).json({ error: 'Le contexte fourni doit être un objet JSON valide.' });
    }
    try {
      serializedContext = JSON.stringify(contexte);
      if (serializedContext.length > 75000) {
        return res.status(400).json({ error: 'Le volume des données de contexte est trop volumineux (maximum 75 Ko).' });
      }
    } catch {
      return res.status(400).json({ error: 'Impossible de sérialiser le contexte fourni.' });
    }
  }

  // Clé API stockée uniquement côté serveur
  const groqApiKey = process.env.GROQ_API_KEY;
  if (!groqApiKey) {
    return res.status(500).json({
      error: "Clé GROQ_API_KEY manquante sur le serveur. Veuillez configurer la variable d'environnement.",
    });
  }

  const systemPrompt =
    "Tu es l'assistant d'une petite boutique en Guinée. Réponds en français simple, poli et court. Tu ne connais pas les prix d'achat ni les bénéfices : si on te les demande, explique-le simplement. Utilise uniquement les chiffres du contexte. Si l'information manque, dis-le. Ne fais aucun calcul : cite les chiffres tels quels. Monnaie : GNF. Les chiffres du contexte actuel sont toujours prioritaires sur ceux cités dans les messages précédents, qui peuvent être périmés. Pour une demande de rappel client, rédige un message court, poli et bienveillant, directement prêt à envoyer sur WhatsApp.";

  const userPrompt = `Voici les données chiffrées de la boutique :\n${serializedContext}\n\nQuestion du gérant de la boutique :\n${cleanQuestion}`;

  // Validation des 6 derniers messages d'historique (Point E.21)
  const validatedHistory: Array<{ role: 'user' | 'assistant'; content: string }> = [];
  if (Array.isArray(body.historique)) {
    const rawHistory = body.historique.slice(-6);
    for (const msg of rawHistory) {
      if (msg && typeof msg === 'object') {
        const role = msg.role === 'user' || msg.role === 'assistant' ? msg.role : null;
        const text = typeof msg.content === 'string' ? msg.content : typeof msg.texte === 'string' ? msg.texte : '';
        const cleanText = text.trim();
        if (role && cleanText) {
          validatedHistory.push({
            role,
            content: cleanText.slice(0, 500),
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

      // Si le modèle n'existe pas ou n'est pas autorisé sur ce compte (404), passer au modèle suivant
      if (groqResponse.status === 404 || groqResponse.status === 400) {
        continue;
      }

      return res.status(groqResponse.status).json({
        error: `Erreur du service d'intelligence artificielle (${groqResponse.status})`,
      });
    } catch (err: unknown) {
      console.error(`Erreur réseau Groq avec ${model}:`, err);
    }
  }

  return res.status(502).json({
    error: `Impossible de joindre le modèle d'assistance. Veuillez vérifier votre connexion ou réessayer ultérieurement. (${lastErrorText.slice(0, 100)})`,
  });
}

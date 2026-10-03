import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig} from 'vite';
import {VitePWA} from 'vite-plugin-pwa';

export default defineConfig(() => {
  return {
    plugins: [
      react(),
      tailwindcss(),
      {
        name: 'dev-api-assistant',
        configureServer(server) {
          server.middlewares.use(async (req, res, next) => {
            if (req.url === '/api/assistant' && req.method === 'POST') {
              let bodyStr = '';
              req.on('data', (chunk) => {
                bodyStr += chunk;
              });
              req.on('end', async () => {
                try {
                  const body = JSON.parse(bodyStr || '{}');
                  const { question, contexte } = body;
                  const groqApiKey = process.env.GROQ_API_KEY;

                  if (!groqApiKey) {
                    res.statusCode = 500;
                    res.setHeader('Content-Type', 'application/json');
                    res.end(
                      JSON.stringify({
                        error:
                          "Clé GROQ_API_KEY non configurée. Veuillez ajouter votre clé Groq dans les secrets.",
                      })
                    );
                    return;
                  }

                  const systemPrompt =
                    "Tu es l'assistant d'une petite boutique en Guinée. Réponds en français simple et court. Utilise UNIQUEMENT les chiffres fournis dans le contexte. Si l'information manque, dis-le. Ne fais aucun calcul : cite les chiffres tels quels. Monnaie : GNF.";
                  const userPrompt = `Voici les données chiffrées de la boutique :\n${JSON.stringify(
                    contexte || {},
                    null,
                    2
                  )}\n\nQuestion du gérant de la boutique :\n${question}`;

                  const CANDIDATE_MODELS = [
                    'llama-3.3-70b-versatile',
                    'qwen/qwen3.8-27b',
                    'openai/gpt-oss-120b',
                    'openai/gpt-oss-20b',
                  ];

                  let lastErrorText = '';
                  let foundResponse = false;

                  for (const model of CANDIDATE_MODELS) {
                    try {
                      const groqRes = await fetch('https://api.groq.com/openai/v1/chat/completions', {
                        method: 'POST',
                        headers: {
                          'Content-Type': 'application/json',
                          Authorization: `Bearer ${groqApiKey}`,
                        },
                        body: JSON.stringify({
                          model,
                          messages: [
                            { role: 'system', content: systemPrompt },
                            { role: 'user', content: userPrompt },
                          ],
                          temperature: 0.1,
                          max_tokens: 600,
                        }),
                      });

                      if (groqRes.ok) {
                        const data = (await groqRes.json()) as any;
                        const reponse =
                          data.choices?.[0]?.message?.content ||
                          "Désolé, je n'ai pas pu obtenir de réponse.";

                        res.statusCode = 200;
                        res.setHeader('Content-Type', 'application/json');
                        res.end(JSON.stringify({ reponse }));
                        foundResponse = true;
                        break;
                      }

                      const errText = await groqRes.text();
                      lastErrorText = errText;
                      console.warn(`Dev Groq model ${model} unavailable (${groqRes.status}):`, errText);

                      if (groqRes.status === 404 || groqRes.status === 400) {
                        continue;
                      }

                      res.statusCode = groqRes.status;
                      res.setHeader('Content-Type', 'application/json');
                      res.end(
                        JSON.stringify({
                          error: `Erreur Groq (${groqRes.status})`,
                        })
                      );
                      foundResponse = true;
                      break;
                    } catch (netErr: any) {
                      console.error(`Dev Groq network error with ${model}:`, netErr);
                    }
                  }

                  if (!foundResponse) {
                    res.statusCode = 502;
                    res.setHeader('Content-Type', 'application/json');
                    res.end(
                      JSON.stringify({
                        error: `Impossible de contacter un modèle Groq disponible. Dernier message: ${lastErrorText}`,
                      })
                    );
                  }
                } catch (err: any) {
                  console.error('Dev assistant error:', err);
                  res.statusCode = 500;
                  res.setHeader('Content-Type', 'application/json');
                  res.end(
                    JSON.stringify({
                      error: "Une erreur est survenue lors de l'appel à l'assistant.",
                    })
                  );
                }
              });
              return;
            }
            next();
          });
        },
      },
      VitePWA({
        registerType: 'autoUpdate',
        includeAssets: ['favicon.ico', 'icon.svg'],
        manifest: {
          id: '/',
          name: 'Boutique Guinée - Caisse & Stock',
          short_name: 'MaBoutique',
          description: 'Caisse mobile, stock automatique et crédit clients pour boutique en Guinée.',
          theme_color: '#ea580c',
          background_color: '#fff7ed',
          display: 'standalone',
          start_url: '/',
          scope: '/',
          icons: [
            {
              src: '/pwa-192x192.png',
              sizes: '192x192',
              type: 'image/png',
              purpose: 'any',
            },
            {
              src: '/pwa-512x512.png',
              sizes: '512x512',
              type: 'image/png',
              purpose: 'any',
            },
            {
              src: '/pwa-maskable-512x512.png',
              sizes: '512x512',
              type: 'image/png',
              purpose: 'maskable',
            },
          ],
        },
        workbox: {
          globPatterns: ['**/*.{js,css,html,ico,png,svg,woff,woff2}'],
        },
        devOptions: {
          enabled: true,
          type: 'module',
        },
      }),
    ],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modify—file watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
      // Disable file watching when DISABLE_HMR is true to save CPU during agent edits.
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
  };
});

import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import { ErrorBoundary } from './components/common/ErrorBoundary';
import { registerSW } from 'virtual:pwa-register';

// Enregistrement immédiat du Service Worker pour la PWA et le fonctionnement hors-ligne
registerSW({
  immediate: true,
  onNeedRefresh() {
    console.log('Nouvelle mise à jour disponible pour Boutique Guinée.');
  },
  onOfflineReady() {
    console.log('Boutique Guinée prête pour le mode hors-ligne.');
  },
});

createRoot(document.getElementById('root')!).render(
  <ErrorBoundary>
    <App />
  </ErrorBoundary>
);

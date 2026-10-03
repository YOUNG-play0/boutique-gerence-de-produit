import { useState, useEffect, useCallback } from 'react';

export interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
}

const DISMISS_STORAGE_KEY = 'pwa_install_dismissed_until';
const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

function checkIsInstalled(): boolean {
  if (typeof window === 'undefined') return false;
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    (window.navigator as unknown as { standalone?: boolean }).standalone === true
  );
}

function checkIsIOS(): boolean {
  if (typeof window === 'undefined') return false;
  const ua = window.navigator.userAgent.toLowerCase();
  const isIOSPlatform = /iphone|ipad|ipod/.test(ua);
  const isIPadSafari = /macintosh/.test(ua) && (window.navigator.maxTouchPoints || 0) > 1;
  return isIOSPlatform || isIPadSafari;
}

function checkIsDismissed(): boolean {
  try {
    const val = localStorage.getItem(DISMISS_STORAGE_KEY);
    if (!val) return false;
    const expiry = Number(val);
    if (isNaN(expiry)) return false;
    return Date.now() < expiry;
  } catch {
    return false;
  }
}

export function usePWAInstall() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [isInstalled, setIsInstalled] = useState<boolean>(checkIsInstalled);
  const [isIOS, setIsIOS] = useState<boolean>(checkIsIOS);
  const [isDismissed, setIsDismissed] = useState<boolean>(checkIsDismissed);
  const [showIOSGuide, setShowIOSGuide] = useState<boolean>(false);

  useEffect(() => {
    // Vérifier l'état standalone initial et sur changement d'affichage
    const mediaQuery = window.matchMedia('(display-mode: standalone)');
    const updateStandalone = () => {
      setIsInstalled(checkIsInstalled());
    };

    updateStandalone();
    setIsIOS(checkIsIOS());
    setIsDismissed(checkIsDismissed());

    if (mediaQuery.addEventListener) {
      mediaQuery.addEventListener('change', updateStandalone);
    } else {
      mediaQuery.addListener(updateStandalone);
    }

    // Écoute de l'événement Android/Chrome
    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
    };

    // Écoute de la fin d'installation
    const handleAppInstalled = () => {
      setIsInstalled(true);
      setDeferredPrompt(null);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    window.addEventListener('appinstalled', handleAppInstalled);

    return () => {
      if (mediaQuery.removeEventListener) {
        mediaQuery.removeEventListener('change', updateStandalone);
      } else {
        mediaQuery.removeListener(updateStandalone);
      }
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
      window.removeEventListener('appinstalled', handleAppInstalled);
    };
  }, []);

  const dismiss = useCallback(() => {
    try {
      localStorage.setItem(DISMISS_STORAGE_KEY, String(Date.now() + SEVEN_DAYS_MS));
    } catch (e) {
      console.warn('Erreur écriture localStorage:', e);
    }
    setIsDismissed(true);
  }, []);

  const promptInstall = useCallback(async (): Promise<boolean> => {
    if (deferredPrompt) {
      try {
        await deferredPrompt.prompt();
        const choice = await deferredPrompt.userChoice;
        if (choice.outcome === 'accepted') {
          setIsInstalled(true);
          setDeferredPrompt(null);
          return true;
        }
      } catch (err) {
        console.error('Erreur appel prompt():', err);
      }
      return false;
    }

    if (isIOS) {
      setShowIOSGuide(true);
      return false;
    }

    return false;
  }, [deferredPrompt, isIOS]);

  return {
    isInstalled,
    isIOS,
    isInstallable: !!deferredPrompt,
    isDismissed,
    deferredPrompt,
    showIOSGuide,
    setShowIOSGuide,
    dismiss,
    promptInstall,
    install: promptInstall,
  };
}

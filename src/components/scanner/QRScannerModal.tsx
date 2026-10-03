import React, { useEffect, useRef, useState } from 'react';
import {
  Html5Qrcode,
  Html5QrcodeSupportedFormats,
  Html5QrcodeScannerState,
} from 'html5-qrcode';
import { X, Camera, AlertCircle, RefreshCw, Zap, Check, Package, Layers } from 'lucide-react';
import { ProductWithStock, UnitType } from '../../types';
import { formatGNF, playBeep, triggerHaptic } from '../../utils/formatters';

interface QRScannerModalProps {
  isOpen: boolean;
  onClose: () => void;
  products: ProductWithStock[];
  onProductScanned: (product: ProductWithStock, unitType: UnitType) => void;
}

export const QRScannerModal: React.FC<QRScannerModalProps> = ({
  isOpen,
  onClose,
  products,
  onProductScanned,
}) => {
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isInitializing, setIsInitializing] = useState(true);
  const [lastScannedItem, setLastScannedItem] = useState<{ name: string; time: number } | null>(null);
  const [torchOn, setTorchOn] = useState(false);
  const [hasTorch, setHasTorch] = useState(false);
  const [manualCode, setManualCode] = useState('');

  // Format selection modal after scan if product has a pack
  const [scannedProductPendingFormat, setScannedProductPendingFormat] = useState<ProductWithStock | null>(null);

  const scannerContainerId = 'qr-reader-container';

  // Refs for race-condition-free lifecycle management
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const isStartingRef = useRef(false);
  const isStoppingRef = useRef(false);
  const startPromiseRef = useRef<Promise<unknown> | null>(null);
  const sessionIdRef = useRef(0);
  const lastScanTimestampRef = useRef<number>(0);

  const stopScannerSafe = async () => {
    if (isStoppingRef.current) return;
    isStoppingRef.current = true;

    try {
      if (startPromiseRef.current) {
        try {
          await startPromiseRef.current;
        } catch {
          // ignore
        }
      }

      const scanner = scannerRef.current;
      scannerRef.current = null;

      if (scanner) {
        try {
          const state = scanner.getState();
          if (
            state === Html5QrcodeScannerState.SCANNING ||
            state === Html5QrcodeScannerState.PAUSED
          ) {
            await scanner.stop();
          }
        } catch (stopErr) {
          console.debug('Scanner stop handled:', stopErr);
        }

        try {
          scanner.clear();
        } catch (clearErr) {
          console.debug('Scanner clear handled:', clearErr);
        }
      }
    } finally {
      isStoppingRef.current = false;
      setTorchOn(false);
      setHasTorch(false);
    }
  };

  useEffect(() => {
    if (!isOpen) {
      stopScannerSafe();
      setScannedProductPendingFormat(null);
      return;
    }

    sessionIdRef.current += 1;
    const currentSessionId = sessionIdRef.current;

    setIsInitializing(true);
    setErrorMessage(null);

    const startScanner = async () => {
      isStartingRef.current = true;

      await new Promise((resolve) => setTimeout(resolve, 250));

      if (sessionIdRef.current !== currentSessionId) {
        isStartingRef.current = false;
        return;
      }

      const container = document.getElementById(scannerContainerId);
      if (!container) {
        isStartingRef.current = false;
        return;
      }

      if (scannerRef.current) {
        await stopScannerSafe();
      }

      if (sessionIdRef.current !== currentSessionId) {
        isStartingRef.current = false;
        return;
      }

      try {
        const html5QrCode = new Html5Qrcode(scannerContainerId, {
          formatsToSupport: [
            Html5QrcodeSupportedFormats.QR_CODE,
            Html5QrcodeSupportedFormats.EAN_13,
            Html5QrcodeSupportedFormats.EAN_8,
            Html5QrcodeSupportedFormats.CODE_128,
            Html5QrcodeSupportedFormats.UPC_A,
          ],
          verbose: false,
        });

        scannerRef.current = html5QrCode;

        const config = {
          fps: 10,
          qrbox: { width: 250, height: 250 },
          aspectRatio: 1.0,
        };

        const runStart = html5QrCode.start(
          { facingMode: 'environment' },
          config,
          (decodedText) => {
            handleDecodedText(decodedText);
          },
          () => {
            // scanning loop
          }
        );

        startPromiseRef.current = runStart;
        await runStart;

        if (sessionIdRef.current !== currentSessionId) {
          await stopScannerSafe();
          return;
        }

        setIsInitializing(false);

        try {
          const capabilities = html5QrCode.getRunningTrackCapabilities();
          if (capabilities && 'torch' in capabilities) {
            setHasTorch(true);
          }
        } catch {
          setHasTorch(false);
        }
      } catch (err: unknown) {
        if (sessionIdRef.current !== currentSessionId) return;

        setIsInitializing(false);
        const errStr = err instanceof Error ? err.message : String(err);
        console.warn('Erreur activation caméra:', errStr);

        if (errStr.includes('NotAllowedError') || errStr.includes('Permission')) {
          setErrorMessage("L'accès à la caméra a été refusé. Veuillez autoriser la caméra dans les réglages du navigateur.");
        } else {
          setErrorMessage("Caméra non disponible sur cet appareil. Utilisez les boutons de test rapide ci-dessous.");
        }
      } finally {
        isStartingRef.current = false;
        startPromiseRef.current = null;
      }
    };

    startScanner();

    return () => {
      sessionIdRef.current += 1;
      stopScannerSafe();
    };
  }, [isOpen]);

  const handleDecodedText = (decodedText: string) => {
    // If format selection prompt is open, ignore
    if (scannedProductPendingFormat) return;

    const now = Date.now();
    if (now - lastScanTimestampRef.current < 1200) {
      return;
    }
    lastScanTimestampRef.current = now;

    const cleanText = decodedText.trim();
    let matchedProduct: ProductWithStock | undefined;

    matchedProduct = products.find(
      (p) =>
        p.id === cleanText ||
        cleanText.includes(p.id) ||
        (p.barcode && p.barcode === cleanText)
    );

    if (!matchedProduct) {
      matchedProduct = products.find((p) =>
        cleanText.toLowerCase().includes(p.name.toLowerCase())
      );
    }

    if (matchedProduct) {
      playBeep();
      triggerHaptic(60);

      // Si le produit a un format carton, afficher deux gros boutons "Unité" et "Carton"
      if (matchedProduct.packSize && matchedProduct.packPrice) {
        setScannedProductPendingFormat(matchedProduct);
      } else {
        // Sinon ajoute directement 1 unité
        onProductScanned(matchedProduct, 'unit');
        setLastScannedItem({ name: matchedProduct.name, time: Date.now() });

        setTimeout(() => {
          setLastScannedItem((prev) => (prev && Date.now() - prev.time > 2000 ? null : prev));
        }, 2500);
      }
    } else {
      triggerHaptic(120);
      setErrorMessage(`Code lu : « ${cleanText} », aucun produit correspondant.`);
      setTimeout(() => setErrorMessage(null), 3000);
    }
  };

  const handleChooseFormat = (format: UnitType) => {
    if (!scannedProductPendingFormat) return;
    playBeep();
    triggerHaptic(50);
    onProductScanned(scannedProductPendingFormat, format);

    const formatName =
      format === 'pack'
        ? scannedProductPendingFormat.packLabel || 'carton'
        : 'unité';
    setLastScannedItem({
      name: `${scannedProductPendingFormat.name} (${formatName})`,
      time: Date.now(),
    });

    setScannedProductPendingFormat(null);

    setTimeout(() => {
      setLastScannedItem((prev) => (prev && Date.now() - prev.time > 2000 ? null : prev));
    }, 2500);
  };

  const toggleTorch = async () => {
    const scanner = scannerRef.current;
    if (!scanner || !hasTorch) return;

    try {
      if (scanner.getState() === Html5QrcodeScannerState.SCANNING) {
        const nextTorch = !torchOn;
        await scanner.applyVideoConstraints({
          advanced: [{ torch: nextTorch } as MediaTrackConstraintSet],
        });
        setTorchOn(nextTorch);
      }
    } catch (err) {
      console.warn('Impossible d’actionner le flash:', err);
    }
  };

  const handleManualSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!manualCode.trim()) return;
    handleDecodedText(manualCode);
    setManualCode('');
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex flex-col justify-end sm:justify-center items-center bg-black/80 backdrop-blur-sm p-0 sm:p-4 animate-in fade-in duration-200">
      <div className="w-full max-w-md bg-slate-900 text-white rounded-t-3xl sm:rounded-3xl overflow-hidden shadow-2xl flex flex-col max-h-[92vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 bg-slate-800/90 border-b border-slate-700/60">
          <div className="flex items-center gap-2">
            <div className="p-2 rounded-xl bg-amber-500/20 text-amber-400">
              <Camera className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white">Scanner un QR Code</h2>
              <p className="text-xs text-slate-400">Pointez la caméra sur l'étiquette du produit</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-full text-slate-400 hover:text-white hover:bg-slate-700 transition"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        {/* Feedback Banner */}
        {lastScannedItem && (
          <div className="bg-emerald-600 px-4 py-2.5 flex items-center justify-between text-white font-semibold text-sm animate-in slide-in-from-top duration-200">
            <div className="flex items-center gap-2 truncate">
              <Check className="w-5 h-5 flex-shrink-0" />
              <span className="truncate">+1 {lastScannedItem.name} ajouté !</span>
            </div>
            <span className="text-xs bg-emerald-700 px-2 py-0.5 rounded-full">Scanné</span>
          </div>
        )}

        {/* Video / Camera Viewport */}
        <div className="relative bg-black flex-1 min-h-[290px] flex items-center justify-center overflow-hidden">
          <div id={scannerContainerId} className="w-full max-w-[340px] aspect-square rounded-2xl overflow-hidden" />

          {/* Scanner Overlay Visual Guide */}
          <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
            <div className="w-60 h-60 border-2 border-amber-400/80 rounded-2xl relative shadow-[0_0_0_9999px_rgba(0,0,0,0.45)]">
              <div className="absolute top-0 left-0 w-6 h-6 border-t-4 border-l-4 border-amber-400 rounded-tl-lg" />
              <div className="absolute top-0 right-0 w-6 h-6 border-t-4 border-r-4 border-amber-400 rounded-tr-lg" />
              <div className="absolute bottom-0 left-0 w-6 h-6 border-b-4 border-l-4 border-amber-400 rounded-bl-lg" />
              <div className="absolute bottom-0 right-0 w-6 h-6 border-b-4 border-r-4 border-amber-400 rounded-br-lg" />
              <div className="w-full h-0.5 bg-amber-400/70 absolute top-1/2 -translate-y-1/2 animate-pulse" />
            </div>
          </div>

          {isInitializing && (
            <div className="absolute inset-0 bg-slate-900/90 flex flex-col items-center justify-center p-6 text-center">
              <RefreshCw className="w-8 h-8 text-amber-500 animate-spin mb-3" />
              <p className="text-sm font-medium text-slate-200">Démarrage de la caméra...</p>
              <p className="text-xs text-slate-400 mt-1">Veuillez autoriser l'accès si demandé</p>
            </div>
          )}

          {/* Modal Overlay si le produit a un format carton : 2 gros boutons Unité / Carton */}
          {scannedProductPendingFormat && (
            <div className="absolute inset-0 bg-slate-950/90 backdrop-blur-md p-6 flex flex-col justify-center items-center text-center z-30 animate-in zoom-in-95 duration-200">
              <div className="w-14 h-14 rounded-2xl bg-amber-500/20 text-amber-400 flex items-center justify-center text-3xl mb-2">
                {scannedProductPendingFormat.imageUrl || '📦'}
              </div>
              <h3 className="text-base font-black text-white mb-1">
                {scannedProductPendingFormat.name}
              </h3>
              <p className="text-xs text-slate-400 mb-5">
                Quel format souhaitez-vous ajouter au panier ?
              </p>

              <div className="w-full space-y-3">
                {/* Gros bouton Unité */}
                <button
                  type="button"
                  disabled={scannedProductPendingFormat.stockUnits <= 0}
                  onClick={() => handleChooseFormat('unit')}
                  className="w-full py-4 px-4 bg-slate-800 hover:bg-slate-700 disabled:opacity-40 active:scale-95 border-2 border-slate-700 rounded-2xl text-left flex items-center justify-between text-white transition shadow-lg"
                >
                  <div className="flex items-center gap-3">
                    <Package className="w-6 h-6 text-amber-400" />
                    <div>
                      <div className="text-sm font-black">À l'Unité</div>
                      <div className="text-xs text-slate-400">
                        Dispo : {scannedProductPendingFormat.stockUnits} unité(s) seule(s)
                      </div>
                    </div>
                  </div>
                  <div className="text-base font-black text-amber-400">
                    {formatGNF(scannedProductPendingFormat.price)}
                  </div>
                </button>

                {/* Gros bouton Carton */}
                <button
                  type="button"
                  disabled={scannedProductPendingFormat.stockPacks <= 0}
                  onClick={() => handleChooseFormat('pack')}
                  className="w-full py-4 px-4 bg-amber-600 hover:bg-amber-500 disabled:opacity-40 active:scale-95 border-2 border-amber-400 rounded-2xl text-left flex items-center justify-between text-white transition shadow-lg shadow-amber-600/30"
                >
                  <div className="flex items-center gap-3">
                    <Layers className="w-6 h-6 text-white" />
                    <div>
                      <div className="text-sm font-black capitalize">
                        Par {scannedProductPendingFormat.packLabel || 'Carton'}
                      </div>
                      <div className="text-xs text-amber-100 font-semibold">
                        Dispo : {scannedProductPendingFormat.stockPacks} fermé(s) ({scannedProductPendingFormat.packSize} un./carton)
                      </div>
                    </div>
                  </div>
                  <div className="text-base font-black text-white">
                    {formatGNF(scannedProductPendingFormat.packPrice)}
                  </div>
                </button>
              </div>

              <button
                type="button"
                onClick={() => setScannedProductPendingFormat(null)}
                className="mt-4 text-xs font-bold text-slate-400 hover:text-white"
              >
                Annuler
              </button>
            </div>
          )}

          {/* Torch toggle button */}
          {hasTorch && !isInitializing && (
            <button
              onClick={toggleTorch}
              className={`absolute top-4 right-4 p-3 rounded-full backdrop-blur-md transition ${
                torchOn ? 'bg-amber-400 text-slate-950 font-bold' : 'bg-black/50 text-white'
              }`}
            >
              <Zap className="w-5 h-5" />
            </button>
          )}
        </div>

        {/* Error / Alert banner */}
        {errorMessage && (
          <div className="px-4 py-3 bg-rose-950/80 border-t border-rose-800 text-rose-200 text-xs flex items-center gap-2">
            <AlertCircle className="w-4 h-4 flex-shrink-0 text-rose-400" />
            <p className="leading-tight">{errorMessage}</p>
          </div>
        )}

        {/* Quick simulation tester */}
        <div className="p-4 bg-slate-800/90 border-t border-slate-700/60 space-y-3">
          <div className="flex items-center justify-between text-xs text-slate-300">
            <span className="font-semibold">Test rapide (simuler un scan) :</span>
            <span className="text-[11px] text-slate-400">{products.length} produits</span>
          </div>

          <div className="flex gap-2 overflow-x-auto pb-1 no-scrollbar">
            {products.slice(0, 6).map((prod) => (
              <button
                key={prod.id}
                type="button"
                onClick={() => handleDecodedText(prod.id)}
                className="flex-shrink-0 px-3 py-2 bg-slate-700 hover:bg-slate-600 rounded-xl text-left border border-slate-600 text-white active:scale-95 transition"
              >
                <div className="text-xs font-bold truncate max-w-[120px]">{prod.name}</div>
                <div className="text-[10px] text-amber-400 font-mono">
                  {prod.price.toLocaleString('fr-FR')} GNF
                </div>
              </button>
            ))}
          </div>

          <form onSubmit={handleManualSubmit} className="flex gap-2 pt-1">
            <input
              type="text"
              placeholder="Code produit ou ID..."
              value={manualCode}
              onChange={(e) => setManualCode(e.target.value)}
              className="flex-1 bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-amber-500"
            />
            <button
              type="submit"
              className="px-4 py-2 bg-amber-600 hover:bg-amber-500 text-white font-bold text-xs rounded-xl transition"
            >
              Valider
            </button>
          </form>

          <button
            type="button"
            onClick={onClose}
            className="w-full py-3 bg-slate-700 hover:bg-slate-600 text-white font-bold text-sm rounded-xl transition active:scale-98"
          >
            Fermer le Scanner
          </button>
        </div>
      </div>
    </div>
  );
};
